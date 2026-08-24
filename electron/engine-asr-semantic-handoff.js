/**
 * Batch orchestration: optional transcribe → semantic repair → translate resume.
 */
const core = require('../src/js/asr-semantic-repair-core');
const { requireAsrSemanticRepair } = require('./advanced-gates');
const { runAsrSemanticRepairWithLock } = require('./asr-semantic-repair');

function isTranslateLikeEngineTask(engineTask) {
    const t = String(engineTask || '').trim().toLowerCase();
    return t === 'translate_mt' || t === 'dual';
}

/**
 * @param {object} fileMerged
 * @param {string} engineTask
 * @param {object} options
 */
function planAsrSemanticRepairBatch(fileMerged = {}, engineTask = '', options = {}) {
    const gate = requireAsrSemanticRepair();
    if (!gate.ok) {
        return { enabled: false, reason: gate.code || 'not_entitled' };
    }
    const merged = { ...fileMerged, ...options };
    if (!core.shouldRunAsrSemanticRepair(merged)) {
        return { enabled: false, reason: 'mode_off' };
    }
    const splitBeforeMt = isTranslateLikeEngineTask(engineTask);
    return {
        enabled: true,
        mode: core.resolveRepairMode(merged),
        splitBeforeMt,
        afterTranscribeOnly: !splitBeforeMt,
    };
}

function extractEngineSourceCues(jobResult) {
    const cues = jobResult?.cues?.source;
    return Array.isArray(cues) ? cues : [];
}

function buildTranslateJobWithCheckpoint(jobBody, repairedEngineCues) {
    const body = { ...jobBody };
    body._checkpoint = {
        stage: 'asr_done',
        sourceCues: Array.isArray(repairedEngineCues) ? repairedEngineCues : [],
    };
    return body;
}

function buildRepairInput(options = {}, repairMeta = {}) {
    const merged = { ...options, ...repairMeta };
    return {
        options: merged,
        signal: merged.signal,
        note: merged.asrSemanticRepairNote || merged.note,
        glossary: merged.glossary,
        primaryAsr: merged.primaryAsr,
        mediaPath: merged.mediaPath,
        onLog: merged.onLog,
        _batchMode: true,
    };
}

function formatRepairFailure(repair = {}) {
    return core.formatRepairFailureMessage(repair);
}

function logRepairResult(repair = {}, hooks = {}) {
    if (!repair || repair.skipped) return;
    if (!repair.ok) {
        hooks.onLog?.(`转录语义校正失败: ${formatRepairFailure(repair)}`);
        return;
    }
    if ((repair.substantiveChanged ?? repair.changed) > 0) {
        hooks.onLog?.(repair.summary || '转录语义校正完成');
        for (const line of Array.isArray(repair.auditLines) ? repair.auditLines : []) {
            hooks.onLog?.(line);
        }
        return;
    }
    if (repair.skippedTrivial > 0 || repair.rejected > 0) {
        hooks.onLog?.(repair.summary || '转录语义校正：未发现实质性改写');
        return;
    }
    hooks.onLog?.(repair.summary || '转录语义校正：未发现需修改条目');
}

/**
 * Run semantic repair and patch job result source cues (transcribe-only path).
 */
async function repairJobResultSourceCues(jobResult, options = {}, hooks = {}) {
    const source = extractEngineSourceCues(jobResult);
    if (!source.length) {
        return { ok: true, skipped: true, reason: 'no_source', jobResult };
    }
    hooks.onProgress?.({
        stage: 'asr_semantic_repair',
        detail: '转录语义校正…',
        percent: 50,
        itemDualPhase: 'source',
    });
    const repair = await runAsrSemanticRepairWithLock(source, buildRepairInput(options));
    if (!repair.ok) {
        const snippet = String(repair.snippet || '').trim();
        hooks.onLog?.(`转录语义校正失败: ${formatRepairFailure(repair)}`
            + (snippet ? ` · 模型输出: ${snippet}` : ''));
        return { ok: false, error: repair.error, code: repair.code, jobResult };
    }
    if (repair.skipped) {
        return { ok: true, skipped: true, jobResult, repair };
    }
    logRepairResult(repair, hooks);
    const next = {
        ...jobResult,
        cues: {
            ...(jobResult.cues && typeof jobResult.cues === 'object' ? jobResult.cues : {}),
            source: repair.engineCues || source,
        },
    };
    return { ok: true, jobResult: next, repair };
}

/**
 * Wrap engine job runner with optional split transcribe → repair → translate.
 * @param {{
 *   jobBody: object,
 *   engineTask: string,
 *   fileMerged: object,
 *   options: object,
 *   runSingleJob: (body: object, progressMeta?: object) => Promise<object>,
 *   onProgress?: Function,
 *   onLog?: Function,
 * }} ctx
 */
async function runEngineJobWithSemanticRepair(ctx = {}) {
    const plan = planAsrSemanticRepairBatch(ctx.fileMerged, ctx.engineTask, ctx.options);
    if (!plan.enabled) {
        return ctx.runSingleJob(ctx.jobBody);
    }

    if (plan.splitBeforeMt) {
        const transcribeBody = { ...ctx.jobBody, task: 'transcribe' };
        ctx.onProgress?.({
            stage: 'transcribe',
            detail: '转写（语义校正将随后执行）…',
            percent: 10,
            itemDualPhase: 'source',
        });
        const phase1 = await ctx.runSingleJob(transcribeBody, { itemDualPhase: 'source' });
        if (!phase1?.ok) return phase1;

        const source = extractEngineSourceCues(phase1.result);
        ctx.onProgress?.({
            stage: 'asr_semantic_repair',
            detail: '转录语义校正…',
            percent: 50,
            itemDualPhase: 'source',
        });
        const repair = await runAsrSemanticRepairWithLock(
            source,
            buildRepairInput(
                { ...ctx.fileMerged, ...ctx.options },
                ctx.repairMeta,
            ),
        );
        if (!repair.ok) {
            const snippet = String(repair.snippet || '').trim();
            ctx.onLog?.(`转录语义校正失败，继续翻译: ${formatRepairFailure(repair)}`
                + (snippet ? ` · 模型输出: ${snippet}` : ''));
            const fallbackBody = buildTranslateJobWithCheckpoint(ctx.jobBody, source);
            return ctx.runSingleJob(fallbackBody, { itemDualPhase: 'translate' });
        }
        logRepairResult(repair, ctx);
        const repaired = repair.engineCues || source;
        const phase2Body = buildTranslateJobWithCheckpoint(ctx.jobBody, repaired);
        ctx.onProgress?.({
            stage: 'translate',
            detail: '翻译（已校正转录）…',
            percent: 0,
            itemDualPhase: 'translate',
        });
        return ctx.runSingleJob(phase2Body, { itemDualPhase: 'translate' });
    }

    const outcome = await ctx.runSingleJob(ctx.jobBody);
    if (!outcome?.ok || !outcome.result) return outcome;
    const patched = await repairJobResultSourceCues(
        outcome.result,
        { ...ctx.fileMerged, ...ctx.options, ...ctx.repairMeta },
        { onProgress: ctx.onProgress, onLog: ctx.onLog },
    );
    if (!patched.ok) return outcome;
    return {
        ...outcome,
        result: patched.jobResult,
        semanticRepair: patched.repair,
    };
}

module.exports = {
    isTranslateLikeEngineTask,
    planAsrSemanticRepairBatch,
    extractEngineSourceCues,
    buildTranslateJobWithCheckpoint,
    repairJobResultSourceCues,
    runEngineJobWithSemanticRepair,
    buildRepairInput,
    formatRepairFailure,
    logRepairResult,
};
