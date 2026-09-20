/**
 * Inference / GalTransl: after 译后清洗, one single-cue 直译 of leftover … then stop.
 * Does not reopen neighbor-window blank-retry or QC 闭环补译.
 */
const path = require('path');
const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');

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

/**
 * @returns {Promise<{ filled: number, left: number, skipped?: boolean, cancelled?: boolean }>}
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
    const modelId = resolveSentenceModelId(options);
    const isLiteralBlank = typeof sakuraCore.isLiteralBlankTranslation === 'function'
        ? (t) => sakuraCore.isLiteralBlankTranslation(t)
        : (t) => {
            const s = String(t || '').trim();
            return !s || /^(?:\.\.\.|……|…)+$/.test(s);
        };

    let totalFilled = 0;
    let left = 0;
    for (const zhPath of uniqueZh) {
        if (isPostTaskStopRequested({ shouldStop, signal })) {
            return cancelledPostTaskResult({ filled: totalFilled, left });
        }
        const zhDoc = readSubtitleDocument(zhPath);
        const jaDoc = readSubtitleDocument(srcPath);
        if (!zhDoc?.ok || !jaDoc?.ok) continue;
        const todo = typeof sakuraCore.collectCuesForEllipsisQuickDirect === 'function'
            ? sakuraCore.collectCuesForEllipsisQuickDirect(jaDoc.cues, zhDoc.cues, { maxCount: 1e9 })
            : [];
        if (!todo.length) continue;

        onProgress?.({
            stage: 'cleanup',
            percent: 97,
            detail: `省略号直译 ${todo.length} 条…`,
            itemStage: 'cleanup',
        });
        onLog?.(`省略号直译 · ${path.basename(zhPath)} · ${todo.length} 条（译后清洗后单条直译）`);

        const mt = await runSakuraTranslate({
            cues: todo,
            modelId,
            glossary: options.glossary,
            windowLines: 1,
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
            return cancelledPostTaskResult({ filled: totalFilled, left });
        }
        const merged = mergeFilledCues(zhDoc.cues, mt?.cues || [], isLiteralBlank);
        totalFilled += merged.filled;
        if (merged.filled > 0) {
            writeSubtitleDocument(zhPath, {
                cues: merged.cues,
                format: zhDoc.format,
                header: zhDoc.header,
                backupMode: 'off',
            });
        }
        const still = typeof sakuraCore.collectCuesForEllipsisQuickDirect === 'function'
            ? sakuraCore.collectCuesForEllipsisQuickDirect(jaDoc.cues, merged.cues, { maxCount: 1e9 })
            : [];
        left += still.length;
        onLog?.(
            merged.filled
                ? `省略号直译完成 ${merged.filled} 条${still.length ? `（仍剩 ${still.length}）` : ''} · ${path.basename(zhPath)}`
                : `省略号直译无进展（${todo.length} 条仍为省略号） · ${path.basename(zhPath)}`,
        );
    }
    return { filled: totalFilled, left };
}

module.exports = {
    runEllipsisQuickDirectPass,
    mergeFilledCues,
    resolveSentenceModelId,
};
