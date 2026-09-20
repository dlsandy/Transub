/**
 * Batch orchestration: optional transcribe → second opinion → semantic repair → translate resume.
 */
const fs = require('fs');
const path = require('path');
const core = require('../src/js/asr-semantic-repair-core');
const { requireAsrSemanticRepair } = require('./advanced-gates');
const { runAsrSemanticRepairWithLock } = require('./asr-semantic-repair');
const {
    planAsrSecondOpinionBatch,
    applyPreMtTranscribeGpuHold,
    applySecondOpinionAfterTranscribe,
    isTranslateLikeEngineTask,
    shouldReleaseAsrGpuAfterSkippedSecondOpinion,
} = require('./engine-asr-second-opinion-handoff');
const { handoffAsrConfidence } = require('./engine-batch-success-handoff');
const {
    runPreMtQcHandoff,
} = require('./engine-pre-mt-qc-handoff');
const { extractOutputPaths } = require('./engine-job-progress');

function saveShelfSourceBeforeTranslate(ctx, sourceCues, resolvedOutPaths = {}) {
    try {
        const { saveShelfSourceSlotsBeforeMt } = require('./subtitle-shelf-pipeline-ingest');
        const mediaPath = String(
            ctx.repairMeta?.mediaPath
            || ctx.options?.mediaPath
            || ctx.fileMerged?.mediaPath
            || '',
        ).trim();
        return saveShelfSourceSlotsBeforeMt({
            mediaPath,
            sourceCues,
            outPaths: {
                ...(ctx.repairMeta?.outPaths || {}),
                ...(resolvedOutPaths || {}),
            },
            options: { ...(ctx.fileMerged || {}), ...(ctx.options || {}) },
            onLog: ctx.onLog,
        });
    } catch (err) {
        ctx.onLog?.(`字幕库保存原文跳过: ${err?.message || err}`);
        return { ok: false, error: err?.message || String(err) };
    }
}

function normPathKey(p) {
    return String(p || '').trim().replace(/\//g, '\\').toLowerCase();
}

function collectResultOutputPathKeys(result) {
    const keys = new Set();
    const outputs = Array.isArray(result?.outputs) ? result.outputs : [];
    for (const o of outputs) {
        const p = String(o?.path || '').trim();
        if (p) keys.add(normPathKey(p));
    }
    const mapped = extractOutputPaths(result || {});
    for (const p of [
        mapped.subtitlePath,
        mapped.sourceSubtitlePath,
        mapped.targetSubtitlePath,
        mapped.bilingualSubtitlePath,
    ]) {
        if (p) keys.add(normPathKey(p));
    }
    return keys;
}

function listPhase1SourceSidecarPaths(phase1Result) {
    const outputs = Array.isArray(phase1Result?.outputs) ? phase1Result.outputs : [];
    const fromRole = outputs
        .filter((o) => String(o?.role || '').toLowerCase() === 'source')
        .map((o) => String(o?.path || '').trim())
        .filter(Boolean);
    if (fromRole.length) return [...new Set(fromRole)];
    const mapped = extractOutputPaths(phase1Result || {});
    const fallback = String(mapped.sourceSubtitlePath || mapped.subtitlePath || '').trim();
    return fallback ? [fallback] : [];
}

/**
 * Pre-MT split runs phase-1 as task=transcribe, which always writes bare `{stem}.srt`
 * beside the media. Final translate_mt only honors outputWriteSource for `.src.*`.
 * Remove those phase-1 leftovers when they are not part of the final job outputs
 * (e.g. 译文-only left Movie.srt next to Movie.zh-cn.srt).
 *
 * @returns {{ removed: string[], skipped: string[] }}
 */
function cleanupPreMtTranscribeMediaSidecars(ctx = {}) {
    const options = { ...(ctx.fileMerged || {}), ...(ctx.options || {}) };
    const wantSrc = options.outputWriteSource !== false;
    const phase1Paths = listPhase1SourceSidecarPaths(ctx.phase1Result);
    const protectedKeys = collectResultOutputPathKeys(ctx.phase2Result);
    const removed = [];
    const skipped = [];

    for (const sidecar of phase1Paths) {
        const key = normPathKey(sidecar);
        if (!key) continue;
        if (protectedKeys.has(key)) {
            skipped.push(sidecar);
            continue;
        }
        // When 原文 is on, keep phase-1 bare file only if it is the only source
        // output (rare); otherwise drop the transcribe-named leftover once `.src` exists.
        if (wantSrc) {
            const base = path.basename(sidecar).toLowerCase();
            const looksBareTranscribe = !/\.src\./i.test(base) && !/\.partial\./i.test(base);
            const hasFinalSrc = [...protectedKeys].some((k) => /\.src\./i.test(path.basename(k)));
            if (!looksBareTranscribe || !hasFinalSrc) {
                skipped.push(sidecar);
                continue;
            }
        }
        try {
            if (!fs.existsSync(sidecar)) {
                skipped.push(sidecar);
                continue;
            }
            fs.unlinkSync(sidecar);
            removed.push(sidecar);
        } catch (_) {
            skipped.push(sidecar);
        }
    }

    if (removed.length) {
        const names = removed.map((p) => path.basename(p)).join(', ');
        ctx.onLog?.(
            wantSrc
                ? `已清理译前临时原字幕（保留 .src）: ${names}`
                : `已清理译前临时原字幕（字幕类型未勾选原文）: ${names}`,
        );
    }
    return { removed, skipped };
}

function finalizePreMtTranslateOutcome(outcome, ctx = {}) {
    if (outcome?.ok) {
        cleanupPreMtTranscribeMediaSidecars({
            phase1Result: ctx.phase1Result,
            phase2Result: outcome.result,
            options: ctx.options,
            fileMerged: ctx.fileMerged,
            onLog: ctx.onLog,
        });
    }
    return outcome;
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
        const mode = core.resolveRepairMode(merged);
        const speedSkip = mode !== 'off' && core.isSpeedPerfProfile(merged);
        return { enabled: false, reason: speedSkip ? 'speed_profile' : 'mode_off' };
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

/**
 * Keep can heal JA from on-disk ASR (.srt) even when in-memory cues lost times;
 * translate_mt cannot — it writes ZH from checkpoint start/end only.
 * Heal dead timelines from phase-1 media sidecar / keep refs before MT.
 */
function healSourceCuesBeforeTranslate(sourceCues, ctx = {}) {
    const keep = require('./transcript-keep');
    const list = Array.isArray(sourceCues) ? sourceCues : [];
    if (!list.length || !keep.cuesHaveBrokenTimeline(list)) return list;
    const mediaPath = String(
        ctx.mediaPath
        || ctx.repairMeta?.mediaPath
        || ctx.options?.mediaPath
        || '',
    ).trim();
    const outPaths = ctx.outPaths || {};
    const enriched = keep.enrichSourceCuesWithTiming(list, {
        targetSubtitlePath: outPaths.targetSubtitlePath || outPaths.subtitlePath || '',
        subtitlePath: outPaths.sourceSubtitlePath || outPaths.subtitlePath || '',
        outputDir: ctx.outputDir || ctx.options?.outputDir || ctx.fileMerged?.outputDir || '',
        mediaPath,
    });
    if (!keep.cuesHaveBrokenTimeline(enriched)) {
        ctx.onLog?.(`翻译前已从磁盘恢复原文时间轴（${enriched.length} 条）`);
        return enriched;
    }
    ctx.onLog?.('警告：原文时间轴异常且无法从磁盘恢复，译文可能挤在片头');
    return enriched;
}

function buildTranslateJobWithCheckpoint(jobBody, repairedEngineCues, extra = {}) {
    const body = { ...jobBody };
    body._checkpoint = {
        stage: 'asr_done',
        sourceCues: Array.isArray(repairedEngineCues) ? repairedEngineCues : [],
        ...(extra.holdIndexes ? { holdIndexes: extra.holdIndexes } : {}),
        ...(extra.bandSummary ? { bandSummary: extra.bandSummary } : {}),
    };
    if (Array.isArray(extra.holdIndexes) && extra.holdIndexes.length) {
        body.mtHoldIndexes = extra.holdIndexes;
    }
    return body;
}

/**
 * Shelf / translate-from-file: skip ASR and (optionally) semantic repair.
 * @param {object} opts
 * @returns {{ active: boolean, sourcePath: string, entryStage: string, runRepair: boolean }}
 */
function resolveSkipAsrEntry(opts = {}) {
    const merged = { ...(opts.fileMerged || {}), ...(opts.options || {}) };
    const entryStageRaw = String(merged.shelfEntryStage || merged.entryStage || '').trim().toLowerCase();
    const entryStage = entryStageRaw === 'repair'
        || entryStageRaw === '校正'
        || entryStageRaw === 'source_cleanup'
        || entryStageRaw === 'semantic_repair'
        ? 'repair'
        : 'translate';
    const skipFlag = merged.skipAsr === true
        || merged.skipAsr === 1
        || merged.skipAsr === '1'
        || !!String(merged.shelfSourceSlot || '').trim()
        || !!String(merged.shelfEntryStage || '').trim();
    const sourcePath = String(merged.shelfSourceSubtitlePath || '').trim()
        || (skipFlag ? String(merged.sourceSubtitlePath || opts.sourcePath || '').trim() : '');
    const active = !!(skipFlag && sourcePath);
    const runRepair = active && entryStage === 'repair' && merged.runSemanticRepair !== false;
    return { active, sourcePath, entryStage, runRepair };
}

/**
 * Load on-disk subtitle as engine cue dicts (seconds).
 * @param {string} filePath
 * @returns {object[]}
 */
function loadEngineSourceCuesFromFile(filePath) {
    const p = String(filePath || '').trim();
    if (!p) return [];
    try {
        const keep = require('./transcript-keep');
        if (typeof keep.loadSubtitleAsEngineCues === 'function') {
            return keep.loadSubtitleAsEngineCues(p) || [];
        }
    } catch (_) { /* fall through */ }
    try {
        const { loadSubtitleCues } = require('./engine-asr-second-opinion');
        return (loadSubtitleCues(p) || []).map((c, i) => ({
            start: (Number(c.startMs) || 0) / 1000,
            end: (Number(c.endMs) || 0) / 1000,
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || ''),
            index: i + 1,
        }));
    } catch (_) {
        return [];
    }
}

/**
 * Continue subtitle task from shelf 原文/转录 (no ASR).
 */
async function runEngineJobFromExistingSource(ctx = {}, entry = {}) {
    const sourcePath = String(entry.sourcePath || '').trim();
    let source = loadEngineSourceCuesFromFile(sourcePath);
    if (!source.length) {
        return {
            ok: false,
            error: `无法读取源字幕：${path.basename(sourcePath) || sourcePath || '（空）'}`,
            code: 'shelf_source_empty',
            preMtSecondOpinionDone: false,
            preMtShelfSourceSaved: false,
        };
    }

    const resolvedOutPaths = {
        ...(ctx.repairMeta?.outPaths || {}),
        sourceSubtitlePath: sourcePath,
    };
    const handoffCtx = {
        jobResult: {
            cues: { source },
            outputs: [{ role: 'source', path: sourcePath }],
        },
        sourceCues: source,
        fileMerged: ctx.fileMerged,
        options: ctx.options,
        repairMeta: ctx.repairMeta,
        mediaPath: ctx.repairMeta?.mediaPath || ctx.options?.mediaPath,
        onProgress: ctx.onProgress,
        onLog: ctx.onLog,
        outPaths: resolvedOutPaths,
    };

    ctx.onLog?.(
        entry.entryStage === 'repair'
            ? `字幕库：从转录进入校正（跳过识别，${source.length} 条）`
            : `字幕库：从原文进入翻译（跳过识别，${source.length} 条）`,
    );
    ctx.onProgress?.({
        stage: entry.entryStage === 'repair' ? 'source_cleanup' : 'translate',
        detail: entry.entryStage === 'repair' ? '从转录准备校正…' : '从原文准备翻译…',
        percent: entry.entryStage === 'repair' ? 40 : 55,
        itemDualPhase: entry.entryStage === 'repair' ? 'source' : 'translate',
    });

    const semPlan = planAsrSemanticRepairBatch(ctx.fileMerged, ctx.engineTask, ctx.options);
    const wantRepair = entry.runRepair && semPlan.enabled;

    if (wantRepair) {
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
                ctx,
            ),
        );
        if (!repair.ok) {
            const snippet = String(repair.snippet || '').trim();
            ctx.onLog?.(`转录语义校正失败，继续翻译: ${formatRepairFailure(repair)}`
                + (snippet ? ` · 模型输出: ${snippet}` : ''));
        } else {
            logRepairResult(repair, ctx);
            if (!repair.skipped && repair.engineCues?.length) {
                source = repair.engineCues;
            }
        }
    } else if (entry.entryStage === 'repair' && semPlan.reason === 'speed_profile') {
        ctx.onLog?.('转写偏好为速度：已跳过转录语义校正');
    } else if (entry.entryStage === 'repair' && !semPlan.enabled) {
        ctx.onLog?.('语义校正未开启：转录将直接送译');
    }

    source = healSourceCuesBeforeTranslate(source, {
        mediaPath: handoffCtx.mediaPath,
        repairMeta: ctx.repairMeta,
        options: { ...ctx.fileMerged, ...ctx.options },
        fileMerged: ctx.fileMerged,
        outPaths: resolvedOutPaths,
        onLog: ctx.onLog,
    });

    const preMt = runPreMtQcHandoff({
        sourceCues: source,
        outPaths: resolvedOutPaths,
        options: { ...ctx.fileMerged, ...ctx.options },
        onLog: ctx.onLog,
        onProgress: ctx.onProgress,
    });
    if (typeof ctx.setMtHoldIndexes === 'function') {
        try {
            ctx.setMtHoldIndexes(preMt.holdIndexes || [], {
                bandByIndex: preMt.bandResult?.byIndex,
                bandSummary: preMt.bandResult?.summary,
            });
        } catch (_) { /* optional */ }
    }

    // From transcript+repair: refresh 原文槽；from original: avoid rewriting shelf sources.
    let shelfEarly = null;
    if (entry.entryStage === 'repair') {
        shelfEarly = saveShelfSourceBeforeTranslate(ctx, source, resolvedOutPaths);
        if (shelfEarly?.outPaths) {
            Object.assign(resolvedOutPaths, shelfEarly.outPaths);
        }
    }

    const phase2Body = buildTranslateJobWithCheckpoint(ctx.jobBody, source, {
        holdIndexes: preMt.holdIndexes,
        bandSummary: preMt.bandResult?.summary,
    });
    ctx.onProgress?.({
        stage: 'translate',
        detail: wantRepair ? '（已校正转录）开始翻译…' : '开始翻译…',
        percent: 55,
        itemDualPhase: 'translate',
    });
    const phase2 = await ctx.runSingleJob(phase2Body, { itemDualPhase: 'translate' });
    return {
        ...finalizePreMtTranslateOutcome(phase2, {
            phase1Result: handoffCtx.jobResult,
            options: ctx.options,
            fileMerged: ctx.fileMerged,
            onLog: ctx.onLog,
        }),
        preMtSecondOpinionDone: false,
        preMtShelfSourceSaved: !!shelfEarly?.ok,
        mtHoldIndexes: preMt.holdIndexes,
        skippedAsr: true,
        shelfEntryStage: entry.entryStage,
    };
}

function buildRepairInput(options = {}, repairMeta = {}, hooks = {}) {
    const merged = { ...options, ...repairMeta };
    return {
        options: merged,
        signal: hooks.signal || merged.signal,
        note: merged.asrSemanticRepairNote || merged.note,
        glossary: merged.glossary,
        primaryAsr: merged.primaryAsr,
        mediaPath: merged.mediaPath,
        onLog: hooks.onLog || merged.onLog,
        onProgress: hooks.onProgress || merged.onProgress,
        afterAsr: true,
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
    const repair = await runAsrSemanticRepairWithLock(source, buildRepairInput(options, {}, hooks));
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
 * Transcribe → (second opinion) → (semantic repair) → translate when needed.
 * Translate-like tasks always split so 字幕库 can ingest 转录/原文 before MT.
 */
async function runEngineJobWithPreMtHandoffs(ctx = {}) {
    const semPlan = planAsrSemanticRepairBatch(ctx.fileMerged, ctx.engineTask, ctx.options);
    const soPlan = planAsrSecondOpinionBatch(ctx.fileMerged, ctx.engineTask, ctx.options);
    if (soPlan.reason === 'speed_profile') {
        ctx.onLog?.('转写偏好为速度：已跳过 ASR 二意见（始终开启仍会执行）');
    }
    if (semPlan.reason === 'speed_profile') {
        ctx.onLog?.('转写偏好为速度：已跳过转录语义校正（加强仍会执行）');
    }
    // Always split dual/translate: SO / semantic / quality QC need a pre-MT boundary,
    // and 字幕库 must register 转录+原文 as soon as the source phase is final.
    const splitBeforeMt = isTranslateLikeEngineTask(ctx.engineTask);

    const skipEntry = resolveSkipAsrEntry(ctx);
    if (skipEntry.active && splitBeforeMt) {
        return runEngineJobFromExistingSource(ctx, skipEntry);
    }

    if (!splitBeforeMt) {
        const outcome = await ctx.runSingleJob(ctx.jobBody);
        return { ...outcome, preMtSecondOpinionDone: false, preMtShelfSourceSaved: false };
    }

    // Keep dual/translate progress bands while this phase only runs ASR.
    const transcribeBody = applyPreMtTranscribeGpuHold({
        ...ctx.jobBody,
        task: 'transcribe',
        progressTask: ctx.engineTask || ctx.jobBody?.task || 'dual',
    }, soPlan);
    ctx.onProgress?.({
        stage: 'model',
        detail: soPlan.enabled && semPlan.enabled
            ? '准备原文（随后二意见与语义校正）…'
            : (soPlan.enabled ? '准备原文（随后 ASR 二意见）…' : '准备原文…'),
        percent: 35,
        itemDualPhase: 'source',
    });
    const phase1 = await ctx.runSingleJob(transcribeBody, { itemDualPhase: 'source' });
    if (!phase1?.ok) {
        return { ...phase1, preMtSecondOpinionDone: false, preMtShelfSourceSaved: false };
    }

    let source = extractEngineSourceCues(phase1.result);
    const handoffCtx = {
        jobResult: phase1.result,
        phase1,
        sourceCues: source,
        fileMerged: ctx.fileMerged,
        options: ctx.options,
        repairMeta: ctx.repairMeta,
        mediaPath: ctx.repairMeta?.mediaPath || ctx.options?.mediaPath,
        primaryAsr: ctx.repairMeta?.primaryAsr,
        onProgress: ctx.onProgress,
        onLog: ctx.onLog,
    };

    let soApplied = null;
    let resolvedOutPaths = {};
    if (soPlan.enabled) {
        ctx.onProgress?.({
            stage: 'asr-second-opinion',
            detail: 'ASR 二意见（翻译前）…',
            percent: 42,
            itemDualPhase: 'source',
        });
        soApplied = await applySecondOpinionAfterTranscribe({
            ...handoffCtx,
            includeSecondOpinion: true,
        });
        for (const line of soApplied.logs || []) ctx.onLog?.(line);
        if (soApplied.sourceCues?.length) source = soApplied.sourceCues;
        resolvedOutPaths = soApplied.outPaths || {};
    } else {
        const { resolveTranscribeSourcePaths } = require('./engine-asr-second-opinion-handoff');
        const resolved = await resolveTranscribeSourcePaths(phase1.result, handoffCtx);
        resolvedOutPaths = resolved.outPaths || {};
        handoffAsrConfidence(phase1.result, resolved.outPaths, {
            ...(ctx.options || {}),
            mediaPath: handoffCtx.mediaPath,
        });
        try {
            const { seedCueRiskBandsAfterConfidence } = require('./engine-pre-mt-qc-handoff');
            const bandPath = String(
                resolved.outPaths?.sourceSubtitlePath
                || resolved.sourcePath
                || resolved.outPaths?.subtitlePath
                || '',
            ).trim();
            if (bandPath) {
                const seeded = seedCueRiskBandsAfterConfidence(bandPath, {
                    ...ctx.fileMerged,
                    ...ctx.options,
                });
                if (seeded?.summaryLine) ctx.onLog?.(seeded.summaryLine);
            }
        } catch (_) { /* optional */ }
    }

    if (shouldReleaseAsrGpuAfterSkippedSecondOpinion(soPlan, soApplied)) {
        ctx.onLog?.('ASR 二意见未开窗：释放引擎显存以便翻译/语义校正');
        try {
            const { releaseGpuAfterQcRetranscribeBurst } = require('./engine-qc-retranscribe-options');
            await releaseGpuAfterQcRetranscribeBurst({
                ...(ctx.fileMerged || {}),
                ...(ctx.options || {}),
            });
        } catch (_) { /* llama afterAsr will also try */ }
    }

    if (semPlan.enabled) {
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
                ctx,
            ),
        );
        if (!repair.ok) {
            const snippet = String(repair.snippet || '').trim();
            ctx.onLog?.(`转录语义校正失败，继续翻译: ${formatRepairFailure(repair)}`
                + (snippet ? ` · 模型输出: ${snippet}` : ''));
            source = healSourceCuesBeforeTranslate(source, {
                mediaPath: handoffCtx.mediaPath,
                repairMeta: ctx.repairMeta,
                options: { ...ctx.fileMerged, ...ctx.options },
                fileMerged: ctx.fileMerged,
                outPaths: {
                    ...(ctx.repairMeta?.outPaths || {}),
                    ...resolvedOutPaths,
                },
                onLog: ctx.onLog,
            });
            const preMt = runPreMtQcHandoff({
                sourceCues: source,
                outPaths: {
                    ...(ctx.repairMeta?.outPaths || {}),
                    ...resolvedOutPaths,
                },
                options: { ...ctx.fileMerged, ...ctx.options },
                onLog: ctx.onLog,
                onProgress: ctx.onProgress,
            });
            if (typeof ctx.setMtHoldIndexes === 'function') {
                try {
                    ctx.setMtHoldIndexes(preMt.holdIndexes || [], {
                        bandByIndex: preMt.bandResult?.byIndex,
                        bandSummary: preMt.bandResult?.summary,
                    });
                } catch (_) { /* optional */ }
            }
            const shelfEarly = saveShelfSourceBeforeTranslate(ctx, source, resolvedOutPaths);
            if (shelfEarly?.outPaths) {
                resolvedOutPaths = { ...resolvedOutPaths, ...shelfEarly.outPaths };
            }
            const fallbackBody = buildTranslateJobWithCheckpoint(ctx.jobBody, source, {
                holdIndexes: preMt.holdIndexes,
                bandSummary: preMt.bandResult?.summary,
            });
            const fallback = await ctx.runSingleJob(fallbackBody, { itemDualPhase: 'translate' });
            return {
                ...finalizePreMtTranslateOutcome(fallback, {
                    phase1Result: phase1.result,
                    options: ctx.options,
                    fileMerged: ctx.fileMerged,
                    onLog: ctx.onLog,
                }),
                preMtSecondOpinionDone: soPlan.enabled,
                preMtShelfSourceSaved: !!shelfEarly?.ok,
                mtHoldIndexes: preMt.holdIndexes,
            };
        }
        logRepairResult(repair, ctx);
        source = repair.engineCues || source;
    }

    source = healSourceCuesBeforeTranslate(source, {
        mediaPath: handoffCtx.mediaPath,
        repairMeta: ctx.repairMeta,
        options: { ...ctx.fileMerged, ...ctx.options },
        fileMerged: ctx.fileMerged,
        outPaths: {
            ...(ctx.repairMeta?.outPaths || {}),
            ...resolvedOutPaths,
        },
        onLog: ctx.onLog,
    });

    const preMt = runPreMtQcHandoff({
        sourceCues: source,
        outPaths: {
            ...(ctx.repairMeta?.outPaths || {}),
            ...resolvedOutPaths,
        },
        options: { ...ctx.fileMerged, ...ctx.options },
        onLog: ctx.onLog,
        onProgress: ctx.onProgress,
    });
    if (typeof ctx.setMtHoldIndexes === 'function') {
        try {
            ctx.setMtHoldIndexes(preMt.holdIndexes || [], {
                bandByIndex: preMt.bandResult?.byIndex,
                bandSummary: preMt.bandResult?.summary,
            });
        } catch (_) { /* optional adapter */ }
    }

    const shelfEarly = saveShelfSourceBeforeTranslate(ctx, source, resolvedOutPaths);
    if (shelfEarly?.outPaths) {
        resolvedOutPaths = { ...resolvedOutPaths, ...shelfEarly.outPaths };
    }

    const phase2Body = buildTranslateJobWithCheckpoint(ctx.jobBody, source, {
        holdIndexes: preMt.holdIndexes,
        bandSummary: preMt.bandResult?.summary,
    });
    ctx.onProgress?.({
        stage: 'asr_semantic_repair',
        detail: semPlan.enabled ? '（已校正转录）…' : '（原文已定稿）…',
        percent: 100,
        itemDualPhase: 'source',
    });
    const phase2 = await ctx.runSingleJob(phase2Body, { itemDualPhase: 'translate' });
    return {
        ...finalizePreMtTranslateOutcome(phase2, {
            phase1Result: phase1.result,
            options: ctx.options,
            fileMerged: ctx.fileMerged,
            onLog: ctx.onLog,
        }),
        preMtSecondOpinionDone: soPlan.enabled,
        preMtShelfSourceSaved: !!shelfEarly?.ok,
        mtHoldIndexes: preMt.holdIndexes,
    };
}

/** @deprecated alias */
async function runEngineJobWithSemanticRepair(ctx = {}) {
    return runEngineJobWithPreMtHandoffs(ctx);
}

module.exports = {
    isTranslateLikeEngineTask,
    planAsrSemanticRepairBatch,
    extractEngineSourceCues,
    buildTranslateJobWithCheckpoint,
    healSourceCuesBeforeTranslate,
    repairJobResultSourceCues,
    runEngineJobWithPreMtHandoffs,
    runEngineJobWithSemanticRepair,
    runEngineJobFromExistingSource,
    resolveSkipAsrEntry,
    loadEngineSourceCuesFromFile,
    cleanupPreMtTranscribeMediaSidecars,
    listPhase1SourceSidecarPaths,
    buildRepairInput,
    formatRepairFailure,
    logRepairResult,
};
