/**
 * Pro ASR semantic repair runner (LLM inference on JA source cues).
 */
const core = require('../src/js/asr-semantic-repair-core');
const { readAdvancedDoc } = require('./advanced-license-data');
const { requireAsrSemanticRepair } = require('./advanced-gates');
const { asPlainObject, asString } = require('./ipc-validate');

function loadReconstructCore() {
    const { loadClosedContextReconstructCore } = require('./advanced-closed-api');
    return loadClosedContextReconstructCore();
}

function missingReconstructCoreError() {
    return {
        ok: false,
        error: '未找到闭源转录语义校正模块（安装目录 _advanced）。请使用完整发行包或重新安装。',
        code: 'advanced_module_missing',
    };
}

function releaseManagedLlmAfterJob(llm, input = {}) {
    if (llm?.source !== 'managed') return;
    if (input._batchMode || input._engineExternalMt) return;
    if (input.signal?.aborted) {
        try { require('./advanced-llama-server').stopLlamaServer(); } catch (_) { /* ignore */ }
        return;
    }
    try { require('./advanced-llama-server').scheduleIdleStop(); } catch (_) { /* ignore */ }
}

async function resolveRepairLlm(doc, input = {}) {
    const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
    const { logAdvancedLlmToEngine } = require('./advanced-llm-log');
    const dryRun = !!input.dryRun
        || !!doc.reconstructMock
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';
    if (dryRun) {
        return { ok: true, dryRun: true, source: 'mock' };
    }
    const llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
    if (!llm.ok) return llm;
    logAdvancedLlmToEngine(llm, { feature: '转录语义校正' });
    return llm;
}

/**
 * @param {object[]} engineOrMsCues
 * @param {object} [input]
 * @returns {Promise<{ ok: boolean, cues?: object[], engineCues?: object[], changed?: number, summary?: string, skipped?: boolean, reason?: string, error?: string, code?: string }>}
 */
async function runAsrSemanticRepairOnCues(engineOrMsCues, input = {}) {
    const gate = requireAsrSemanticRepair();
    if (!gate.ok) return gate;

    const options = asPlainObject(input.options || input);
    if (!core.shouldRunAsrSemanticRepair(options)) {
        return { ok: true, skipped: true, reason: 'mode_off' };
    }

    const hasMs = Array.isArray(engineOrMsCues)
        && engineOrMsCues.length
        && (engineOrMsCues[0].startMs != null || engineOrMsCues[0].index != null);
    let cues = hasMs
        ? engineOrMsCues.map((c, i) => ({
            index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || ''),
            meta: c.meta,
        }))
        : core.engineCuesToRepairMs(engineOrMsCues);
    if (!cues.length) {
        return { ok: true, skipped: true, reason: 'no_cues' };
    }

    const mode = core.resolveRepairMode(options);
    const targets = core.selectRepairTargets(cues, {
        ...options,
        annotations: input.annotations,
    });
    if (!targets.length) {
        return {
            ok: true,
            skipped: true,
            reason: 'no_targets',
            summary: core.summarizeRepairPlan(targets, mode),
            cues,
            engineCues: core.repairMsToEngineCues(cues),
        };
    }

    const targetIndexes = targets.map((t) => t.index);
    const beforeTexts = cues.map((c) => String(c.text || '').trim());
    const targetIndexSet = new Set(targetIndexes);
    const payloadIndexes = core.expandIndexesWithNeighbors(
        targetIndexes,
        cues.length,
        input.neighborRadius,
    );
    const payload = core.buildRepairCuePayload(cues, payloadIndexes, targetIndexSet);
    const langKey = core.resolveRepairLanguageKey(options, cues);
    const repairCtx = core.buildRepairContext({
        ...options,
        glossary: input.glossary ?? options.glossary,
        primaryAsr: input.primaryAsr ?? options.primaryAsr ?? options.engineAsrModel,
        asrSemanticRepairNote: asString(input.note, 2000).trim(),
    }, cues);
    const doc = readAdvancedDoc().doc;
    const dryRun = !!input.dryRun
        || !!doc.reconstructMock
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1';

    let llm = { ok: true, dryRun: true, source: 'mock' };
    let totalRejected = 0;
    let totalSkippedTrivial = 0;
    try {
        llm = await resolveRepairLlm(doc, input);
        if (!llm.ok) return llm;

        if (llm.dryRun) {
            const updates = core.mockRepairUpdates(cues, targets);
            const applied = core.applyRepairUpdates(cues, updates, {
                allowIndexes: targetIndexes,
                langKey,
            });
            totalRejected += Number(applied.rejected) || 0;
            totalSkippedTrivial += Number(applied.skippedTrivial) || 0;
            cues = applied.cues;
        } else {
            const reconstructCore = loadReconstructCore();
            if (!reconstructCore || typeof reconstructCore.chunkCues !== 'function') {
                return missingReconstructCoreError();
            }
            const { chatCompletions } = require('./advanced-llm-client');
            const chunks = reconstructCore.chunkCues(payload, {
                windowCues: mode === core.MODE_THOROUGH ? 24 : 18,
                overlapCues: 1,
            });
            const allUpdates = [];
            let parseFailures = 0;
            const parseFailureSnippets = [];
            for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx += 1) {
                const chunk = chunks[chunkIdx];
                if (input.signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'aborted' };
                }
                const messages = core.buildRepairChatMessages(chunk.cues, {
                    ...options,
                    allCues: cues,
                    glossary: input.glossary ?? options.glossary,
                    primaryAsr: input.primaryAsr ?? options.primaryAsr ?? options.engineAsrModel,
                    asrSemanticRepairNote: asString(input.note, 2000).trim(),
                    note: asString(input.note, 2000).trim() || core.buildRepairNote(repairCtx),
                });
                const llmOpts = {
                    apiKey: llm.apiKey,
                    baseUrl: llm.baseUrl,
                    model: llm.model,
                    messages,
                    temperature: 0.15,
                    timeoutMs: 120000,
                    signal: input.signal,
                    enableThinking: false,
                    ignoreReasoning: true,
                    max_tokens: core.estimateRepairMaxTokens(chunk.cues.length),
                };
                let res = await chatCompletions(llmOpts);
                if (!res?.ok) {
                    return {
                        ok: false,
                        error: res?.error || '转录语义校正失败',
                        code: res?.code || 'llm_failed',
                        partialChanged: 0,
                    };
                }
                let content = res.content || res.text || res.message || '';
                let parsed = reconstructCore.parseModelResponse(
                    content,
                    chunk.cues.map((c) => c.index),
                );
                if (!parsed.ok) {
                    const retryMessages = [
                        ...messages,
                        { role: 'assistant', content: String(content).slice(0, 1200) },
                        {
                            role: 'user',
                            content: '上次输出无法解析。请只输出一个 JSON 对象：'
                                + '{"cues":[{"index":0,"text":"..."}]}，'
                                + '覆盖本批每个 index 各一条，不要解释、不要 Markdown。',
                        },
                    ];
                    res = await chatCompletions({
                        ...llmOpts,
                        messages: retryMessages,
                        temperature: 0.05,
                    });
                    if (res?.ok) {
                        content = res.content || res.text || res.message || '';
                        parsed = reconstructCore.parseModelResponse(
                            content,
                            chunk.cues.map((c) => c.index),
                        );
                    }
                }
                if (!parsed.ok) {
                    parseFailures += 1;
                    const snippet = parsed.snippet || core.snippetRepairModelOutput(content);
                    parseFailureSnippets.push(snippet);
                    input.onLog?.(
                        `转录语义校正解析失败（${chunkIdx + 1}/${chunks.length}）: ${snippet}`,
                    );
                    continue;
                }
                if (parsed.incomplete?.length) {
                    const orig = new Map(chunk.cues.map((c) => [c.index, c.text]));
                    for (const idx of parsed.incomplete) {
                        parsed.cues.push({ index: idx, text: orig.get(idx) || '' });
                    }
                }
                for (const row of parsed.cues) {
                    const text = String(row?.text ?? '').trim();
                    if (!text) continue;
                    allUpdates.push({ index: Number(row.index), text });
                }
            }
            if (!allUpdates.length && parseFailures > 0) {
                return {
                    ok: false,
                    error: '模型未返回有效校正',
                    code: 'parse_empty',
                    snippet: parseFailureSnippets[0] || '',
                };
            }
            const applied = core.applyRepairUpdates(cues, allUpdates, {
                allowIndexes: targetIndexes,
                langKey,
            });
            totalRejected += Number(applied.rejected) || 0;
            totalSkippedTrivial += Number(applied.skippedTrivial) || 0;
            cues = applied.cues;
        }

        let domainChanged = 0;
        try {
            if (core.isJaLanguage(options)) {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
                    const pinned = mtSanitize.correctJaAsrDomainMishearsInCues(cues);
                    cues = pinned.cues || cues;
                    domainChanged = Number(pinned.changed) || 0;
                }
            }
        } catch (_) { /* ignore */ }

        const engineCues = core.repairMsToEngineCues(cues);
        const changedIndexes = targetIndexes.filter((idx) => (
            String(cues[idx]?.text || '').trim() !== beforeTexts[idx]
        ));
        const changed = changedIndexes.length;
        const audit = core.buildRepairAuditEntries(beforeTexts, cues, changedIndexes);
        const auditLines = core.formatRepairAuditLogLines(audit);
        const summary = core.formatRepairResultSummary({
            targets,
            mode,
            changed,
            rejected: totalRejected,
            skippedTrivial: totalSkippedTrivial,
            domainChanged,
        });

        return {
            ok: true,
            cues,
            engineCues,
            changed: changed + domainChanged,
            substantiveChanged: changed,
            changedIndexes,
            rejected: totalRejected,
            skippedTrivial: totalSkippedTrivial,
            audit,
            auditLines: changed > 0 ? auditLines : [],
            mode,
            targetCount: targetIndexes.length,
            summary,
            llmSource: llm.source || '',
        };
    } finally {
        releaseManagedLlmAfterJob(llm, input);
    }
}

async function runAsrSemanticRepairWithLock(source, input = {}) {
    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLockUnlessNested({
        kind: 'advanced_asr_semantic_repair',
        owner: 'Pro',
        source: 'asrSemanticRepair',
    }, input, () => runAsrSemanticRepairOnCues(source, input));
}

module.exports = {
    runAsrSemanticRepairOnCues,
    runAsrSemanticRepairWithLock,
};
