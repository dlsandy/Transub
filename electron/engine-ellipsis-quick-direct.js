/**
 * Inference / GalTransl: after 译后清洗, single-cue 直译 of leftover …
 * One pass only — re-collecting the same blanks for EXTRA rounds was burning
 * hours on long JA titles (serial windowLines:1) with almost no extra fills.
 */
const path = require('path');
const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');

/** Extra substantive round after first pass — recovers leftovers once neighbors fill. */
const EXTRA_SUBSTANTIVE_ROUNDS = 1;

function resolveSentenceModelId(options = {}) {
    // Prefer sentence MT (hybrid / TG / Chimera) over chat polish model.
    return String(
        options.hybridMtModelId
        || options.engineLlmMtModel
        || options.engineMtModel
        || options.smartTranslateModelId
        || '',
    ).trim();
}

function mergeFilledCues(zhCues, translatedCues, isLiteralBlank) {
    const map = new Map();
    for (const c of translatedCues || []) {
        const idx = Number(c?.index);
        if (!Number.isInteger(idx)) continue;
        const text = String(c?.text ?? '').trim();
        if (!text || isLiteralBlank(text)) continue;
        map.set(idx, String(c.text ?? ''));
    }
    let filled = 0;
    const cues = (zhCues || []).map((c) => {
        const idx = Number(c.index);
        if (!Number.isInteger(idx) || !map.has(idx)) return c;
        filled += 1;
        return { ...c, text: map.get(idx) };
    });
    return { cues, filled };
}

function loadEllipsisPolicy() {
    try {
        return require('../src/js/hymt-ellipsis-policy-core');
    } catch {
        return null;
    }
}

/**
 * Keep only slots that policy says recover:lexical_blank on substantive JA.
 * Todo cues are JA source cues (text = JA); ZH is assumed blank「…」.
 */
function filterSubstantiveLexicalTodo(todo, policy) {
    if (!Array.isArray(todo) || !todo.length) return [];
    if (!policy?.planEllipsisSlotAction) return todo;
    return todo.filter((c) => {
        const ja = String(c?.text || '').trim();
        if (!ja) return false;
        if (policy.isSubstantiveJa && !policy.isSubstantiveJa(ja)) return false;
        const plan = policy.planEllipsisSlotAction(ja, '…', {}) || {};
        return plan.action === 'recover' && plan.reason === 'lexical_blank';
    });
}

/**
 * @returns {Promise<{ filled: number, left: number, skipped?: boolean, cancelled?: boolean, rounds?: number }>}
 */
async function runEllipsisQuickDirectPass(item, options = {}, ctx = {}) {
    const { engineTask, onProgress, onLog, event, shouldStop, signal } = ctx;
    let blankPolicy = null;
    try {
        blankPolicy = require('../src/js/blank-mt-retry-policy-core');
    } catch { /* optional */ }
    if (!blankPolicy?.isInferenceBlankDirectFinalize?.(options)) {
        return { filled: 0, left: 0, skipped: true };
    }
    const srcPath = String(item?.sourceSubtitlePath || '').trim();
    if (!srcPath) return { filled: 0, left: 0, skipped: true };

    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
        resolve: path.resolve,
        existsSync: (p) => require('fs').existsSync(p),
    });
    if (!uniqueZh.length) return { filled: 0, left: 0, skipped: true };

    const sakuraCore = require('../src/js/sakura-translate-core');
    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    const { runSakuraTranslate } = require('./sakura-translate');
    const ellipsisPolicy = loadEllipsisPolicy();
    const modelId = resolveSentenceModelId(options);
    const isLiteralBlank = typeof sakuraCore.isLiteralBlankTranslation === 'function'
        ? (t) => sakuraCore.isLiteralBlankTranslation(t)
        : (t) => {
            const s = String(t || '').trim();
            return !s || /^(?:\.\.\.|……|…)+$/.test(s);
        };

    const maxRounds = 1 + Math.max(0, Number(options.ellipsisQuickDirectExtraRounds) || EXTRA_SUBSTANTIVE_ROUNDS);
    let totalFilled = 0;
    let left = 0;
    let roundsRun = 0;

    for (const zhPath of uniqueZh) {
        if (isPostTaskStopRequested({ shouldStop, signal })) {
            return cancelledPostTaskResult({ filled: totalFilled, left, rounds: roundsRun });
        }
        let zhDoc = readSubtitleDocument(zhPath);
        const jaDoc = readSubtitleDocument(srcPath);
        if (!zhDoc?.ok || !jaDoc?.ok) continue;

        let workingCues = zhDoc.cues || [];
        let pathFilled = 0;

        for (let round = 0; round < maxRounds; round += 1) {
            if (isPostTaskStopRequested({ shouldStop, signal })) {
                return cancelledPostTaskResult({ filled: totalFilled, left, rounds: roundsRun });
            }
            let todo = typeof sakuraCore.collectCuesForEllipsisQuickDirect === 'function'
                ? sakuraCore.collectCuesForEllipsisQuickDirect(jaDoc.cues, workingCues, { maxCount: 1e9 })
                : [];
            // Round 0: all collectable blanks; later rounds: substantive lexical only.
            if (round > 0) {
                todo = filterSubstantiveLexicalTodo(todo, ellipsisPolicy);
            } else if (ellipsisPolicy?.planEllipsisSlotAction) {
                // Still skip explicit delete-class JA on the first pass.
                todo = todo.filter((c) => {
                    const ja = String(c?.text || '').trim();
                    const plan = ellipsisPolicy.planEllipsisSlotAction(ja, '…', {}) || {};
                    return plan.action !== 'delete';
                });
            }
            if (!todo.length) break;

            roundsRun += 1;
            onProgress?.({
                stage: 'cleanup',
                percent: 97,
                detail: `省略号直译 ${todo.length} 条…`,
                itemStage: 'cleanup',
            });
            onLog?.(
                round === 0
                    ? `省略号直译 · ${path.basename(zhPath)} · ${todo.length} 条（译后清洗后单条直译）`
                    : `省略号直译补轮 ${round + 1}/${maxRounds} · ${path.basename(zhPath)} · ${todo.length} 条（实词空白）`,
            );

            const mt = await runSakuraTranslate({
                cues: todo,
                modelId,
                glossary: options.glossary,
                // Script + full-track prev (blank-only todo otherwise has no neighbors).
                windowLines: 1,
                murasakiPreset: 'script',
                contextSourceCues: jaDoc.cues,
                contextTranslatedCues: workingCues,
                _ellipsisQuickDirect: true,
                _skipBlankRetry: true,
                _skipMtSanitize: true,
                _skipFinalEllipsisDirect: true,
                _skipAlignAudit: true,
                _batchMode: true,
                _skipComputeLock: true,
                contentProfile: options.contentProfile || options.senseProfile,
                senseProfile: options.senseProfile || options.contentProfile,
                skipFakeGreeting: true,
                subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
                targetLang: options.targetLang || options.subtitleTargetLang,
                event,
                signal,
                shouldStop,
                onProgress: (info) => {
                    onProgress?.({
                        stage: 'cleanup',
                        percent: Number(info?.pct) || Number(info?.percent) || 97,
                        detail: info?.detail || '省略号直译…',
                        itemStage: 'cleanup',
                    });
                },
                onLog,
            });
            if (mt?.cancelled || mt?.code === 'cancelled' || isPostTaskStopRequested({ shouldStop, signal })) {
                return cancelledPostTaskResult({ filled: totalFilled, left, rounds: roundsRun });
            }
            const merged = mergeFilledCues(workingCues, mt?.cues || [], isLiteralBlank);
            pathFilled += merged.filled;
            totalFilled += merged.filled;
            workingCues = merged.cues;
            if (merged.filled > 0) {
                writeSubtitleDocument(zhPath, {
                    cues: workingCues,
                    format: zhDoc.format,
                    header: zhDoc.header,
                    backupMode: 'off',
                });
            }
            // No progress on a substantive-only round → stop early.
            if (round > 0 && merged.filled === 0) break;
        }

        const stillRaw = typeof sakuraCore.collectCuesForEllipsisQuickDirect === 'function'
            ? sakuraCore.collectCuesForEllipsisQuickDirect(jaDoc.cues, workingCues, { maxCount: 1e9 })
            : [];
        const still = filterSubstantiveLexicalTodo(stillRaw, ellipsisPolicy);
        left += still.length;
        onLog?.(
            pathFilled
                ? `省略号直译完成 ${pathFilled} 条${still.length ? `（实词仍剩 ${still.length}）` : ''} · ${path.basename(zhPath)}`
                : `省略号直译无进展 · ${path.basename(zhPath)}`,
        );
    }
    return { filled: totalFilled, left, rounds: roundsRun };
}

module.exports = {
    runEllipsisQuickDirectPass,
    mergeFilledCues,
    resolveSentenceModelId,
    filterSubstantiveLexicalTodo,
    EXTRA_SUBSTANTIVE_ROUNDS,
};
