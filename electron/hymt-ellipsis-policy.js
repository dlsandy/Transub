/**
 * Film-level Hy-MT ellipsis policy: delete moan/filler pairs, recover lexical ….
 */
const path = require('path');
const fs = require('fs');

function readPair(zhPath, jaPath) {
    const { readSubtitleDocument } = require('./extensions-bridge');
    const zhDoc = readSubtitleDocument(zhPath);
    if (!zhDoc?.ok) return { ok: false, error: zhDoc?.error || '无法读取译文字幕' };
    const jaDoc = readSubtitleDocument(jaPath);
    if (!jaDoc?.ok) return { ok: false, error: jaDoc?.error || '无法读取原文字幕' };
    return { ok: true, zhDoc, jaDoc };
}

/** Visible … / ... / …… only — empty string after dropAll+preserveSlots is resolved, not a gate miss. */
function isVisibleEllipsisZh(text) {
    const t = String(text || '').trim();
    return /^(?:\.\.\.|……|…)+$/.test(t);
}

/**
 * Count ZH slots that still need lexical recover (blank ZH + recover plan).
 * @param {string} zhPath
 * @param {string} jaPath
 * @param {{ visibleOnly?: boolean }} [opts] visibleOnly (default true): ignore empty text
 *   left by intentional post-task blanking (anti-错位).
 * @returns {number}
 */
function countRecoverableEllipsisLeft(zhPath, jaPath, opts = {}) {
    const zh = String(zhPath || '').trim();
    const ja = String(jaPath || '').trim();
    if (!zh || !ja || !fs.existsSync(zh) || !fs.existsSync(ja)) return 0;
    let policy;
    try {
        policy = require('../src/js/hymt-ellipsis-policy-core');
    } catch {
        return 0;
    }
    const docs = readPair(zh, ja);
    if (!docs.ok) return 0;
    const visibleOnly = opts.visibleOnly !== false;
    const aligned = alignJaToZh(docs.zhDoc.cues, docs.jaDoc.cues);
    let left = 0;
    for (const row of aligned) {
        const zhText = row.zhCue?.text;
        if (visibleOnly) {
            if (!isVisibleEllipsisZh(zhText)) continue;
        } else if (!policy.isBlankZh(zhText)) {
            continue;
        }
        const plan = policy.planEllipsisSlotAction(row.sourceText, zhText, {});
        if (plan.action === 'recover') left += 1;
    }
    return left;
}

function alignJaToZh(zhCues, jaCues) {
    let dualCore = null;
    try {
        dualCore = require('../src/js/dual-subtitle-core');
    } catch { /* optional */ }
    const index = dualCore?.buildOverlapIndex?.(jaCues) || null;
    return (zhCues || []).map((z) => {
        let sourceText = '';
        if (dualCore?.findBestOverlapCue) {
            const startMs = Number(z?.startMs) || 0;
            const endMs = z?.endMs != null ? Number(z.endMs) : startMs + 2000;
            const hit = dualCore.findBestOverlapCue(jaCues, startMs, endMs, {
                index,
                maxStartGapMs: 2500,
            });
            if (hit?.cue && hit.match !== 'none') {
                sourceText = String(hit.cue.text ?? '');
            }
        }
        return {
            zhCue: z,
            sourceText,
            index: Number(z.index),
        };
    });
}

/**
 * @param {{
 *   zhPath: string,
 *   jaPath: string,
 *   options?: object,
 *   onLog?: Function,
 *   onProgress?: Function,
 *   event?: object,
 *   skipRecover?: boolean,
 *   shouldStop?: Function,
 *   signal?: AbortSignal,
 * }} ctx
 */
async function runHyMtEllipsisPolicyPass(ctx = {}) {
    const zhPath = String(ctx.zhPath || '').trim();
    const jaPath = String(ctx.jaPath || '').trim();
    if (!zhPath || !jaPath) {
        return { ok: true, skipped: true, reason: 'missing_path' };
    }
    const options = ctx.options || {};
    if (options.hyMtEllipsisPolicy === false) {
        return { ok: true, skipped: true, reason: 'disabled' };
    }
    const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');
    const stopCtx = { shouldStop: ctx.shouldStop, signal: ctx.signal };
    if (isPostTaskStopRequested(stopCtx)) {
        return cancelledPostTaskResult({ deleted: 0, recovered: 0, left: 0 });
    }

    let policy;
    try {
        policy = require('../src/js/hymt-ellipsis-policy-core');
    } catch (err) {
        return { ok: false, error: err.message || 'ellipsis policy unavailable' };
    }

    const docs = readPair(zhPath, jaPath);
    if (!docs.ok) return docs;

    const aligned = alignJaToZh(docs.zhDoc.cues, docs.jaDoc.cues);
    const onLog = typeof ctx.onLog === 'function' ? ctx.onLog : null;

    // Build parallel lists for planCueListActions (index-aligned via aligned rows)
    const zhList = aligned.map((a) => a.zhCue);
    const jaList = aligned.map((a) => ({
        index: a.index,
        startMs: a.zhCue.startMs,
        endMs: a.zhCue.endMs,
        text: a.sourceText,
    }));

    const { deletes, recovers, plans } = policy.planCueListActions(zhList, jaList);
    const planStats = policy.summarizePlanStats?.(plans) || {
        deleted: deletes.length,
        recover: recovers.length,
        summaryLine: '',
    };
    if (planStats.summaryLine) {
        onLog?.(`省略号策略 · 预览 ${planStats.summaryLine} · ${path.basename(zhPath)}`);
    }

    const dropZhIndexes = new Set(
        deletes.map((i) => Number(zhList[i]?.index)).filter((n) => Number.isInteger(n)),
    );
    const deletedZhCues = docs.zhDoc.cues.filter((c) => dropZhIndexes.has(Number(c.index)));
    let deleted = deletedZhCues.length;
    let zhCues = docs.zhDoc.cues.filter((c) => !dropZhIndexes.has(Number(c.index)));
    let jaCues = docs.jaDoc.cues.filter((jc) => {
        if (dropZhIndexes.has(Number(jc.index))) return false;
        const js = Number(jc.startMs) || 0;
        const je = jc.endMs != null ? Number(jc.endMs) : js + 2000;
        for (const z of deletedZhCues) {
            const zs = Number(z.startMs) || 0;
            const ze = z.endMs != null ? Number(z.endMs) : zs + 2000;
            if (zs < je && js < ze) return false;
        }
        return true;
    });

    const { writeSubtitleDocument } = require('./extensions-bridge');
    if (deleted > 0) {
        const wZh = writeSubtitleDocument(zhPath, {
            cues: zhCues,
            format: docs.zhDoc.format,
            header: docs.zhDoc.header,
            backupMode: 'off',
        });
        if (!wZh.ok) return wZh;
        const wJa = writeSubtitleDocument(jaPath, {
            cues: jaCues,
            format: docs.jaDoc.format,
            header: docs.jaDoc.header,
            backupMode: 'off',
        });
        if (!wJa.ok) return wJa;
        onLog?.(`省略号策略 · 删除纯喘息/语气 ${deleted} 条（${planStats.summaryLine || '见预览'}） · ${path.basename(zhPath)}`);
    }

    // Re-read after delete for recover planning
    const afterDel = readPair(zhPath, jaPath);
    if (!afterDel.ok) return afterDel;
    zhCues = afterDel.zhDoc.cues;
    jaCues = afterDel.jaDoc.cues;

    if (ctx.skipRecover) {
        return {
            ok: true,
            deleted,
            recovered: 0,
            left: recovers.length,
            plans,
        };
    }

    // Deterministic fill first (localized for non-zh 成片)
    const targetOpts = {
        subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
        targetLang: options.targetLang || options.subtitleTargetLang,
        contentProfile: options.contentProfile || options.senseProfile,
        senseProfile: options.senseProfile || options.contentProfile,
    };
    const aligned2 = alignJaToZh(zhCues, jaCues);
    let detFilled = 0;
    const detMap = new Map();
    for (const row of aligned2) {
        if (!policy.isBlankZh(row.zhCue?.text)) continue;
        const plan = policy.planEllipsisSlotAction(row.sourceText, row.zhCue.text, {});
        if (plan.action !== 'recover') continue;
        const fill = policy.deterministicEllipsisFill(row.sourceText, targetOpts);
        if (fill) {
            detMap.set(Number(row.index), fill);
            detFilled += 1;
        }
    }
    if (detFilled) {
        zhCues = zhCues.map((c) => {
            const idx = Number(c.index);
            if (!detMap.has(idx)) return c;
            return { ...c, text: detMap.get(idx) };
        });
        const w = writeSubtitleDocument(zhPath, {
            cues: zhCues,
            format: afterDel.zhDoc.format,
            header: afterDel.zhDoc.header,
            backupMode: 'off',
        });
        if (!w.ok) return w;
        onLog?.(`省略号策略 · 确定性回填 ${detFilled} 条 · ${path.basename(zhPath)}`);
    }

    // LLM blank retry for remaining lexical … (optional skip for offline/tools)
    let blankRes = { ok: true, skipped: true, recovered: 0 };
    if (isPostTaskStopRequested(stopCtx)) {
        return cancelledPostTaskResult({
            deleted,
            recovered: detFilled,
            deterministicFilled: detFilled,
            left: 0,
        });
    }
    let skipLlmRecover = ctx.skipLlmRecover === true || options.hyMtEllipsisSkipLlm === true;
    if (!skipLlmRecover) {
        try {
            const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
            skipLlmRecover = !!blankPolicy.isInferenceBlankDirectFinalize?.(options);
        } catch { /* optional */ }
    }
    if (!skipLlmRecover) {
        const blankRetry = require('./engine-blank-mt-retry');
        // After hybrid sentence MT, do not burn dozens of dialog-LLM rounds on
        // postprocess-minted 「…」. Prefer bounded sakura/hybrid recover (seeded
        // from managed smartTranslateModelId inside blank-retry).
        const leftPreview = recovers.length;
        blankRes = await blankRetry.runBlankMtRetryForSubtitlePair({
            zhPath,
            jaPath,
            options: {
                ...options,
                postBatchBlankRetranslate: true,
                includeHyMtQuality: true,
                hyMtEllipsisRecover: true,
            },
            maxCues: Math.min(24, Number(ctx.maxCues) || 24),
            maxRounds: leftPreview > 40 ? 1 : Math.min(2, Number(ctx.maxRounds) || 2),
            onProgress: ctx.onProgress,
            onLog,
            event: ctx.event,
            shouldStop: ctx.shouldStop,
            signal: ctx.signal,
        });
        if (blankRes?.cancelled || blankRes?.code === 'cancelled' || isPostTaskStopRequested(stopCtx)) {
            const recovered = detFilled + (Number(blankRes?.recovered) || 0);
            return cancelledPostTaskResult({
                deleted,
                recovered,
                deterministicFilled: detFilled,
                blankRetry: blankRes,
                left: 0,
            });
        }
    }

    // Mid-pass "left" includes empty + visible … (drives retry stats). Gate recount uses visibleOnly.
    const left = countRecoverableEllipsisLeft(zhPath, jaPath, { visibleOnly: false });

    const recovered = detFilled + (Number(blankRes?.recovered) || 0);
    if (recovered || deleted) {
        onLog?.(
            `省略号策略 · 删 ${deleted} · 补 ${recovered}`
            + (left ? ` · 仍剩实义空白 ${left}` : '')
            + ` · ${path.basename(zhPath)}`,
        );
    }

    return {
        ok: true,
        deleted,
        recovered,
        deterministicFilled: detFilled,
        blankRetry: blankRes,
        left,
        plans: plans?.length,
        planStats,
        deleteCandidates: deletes.length,
        recoverCandidates: recovers.length,
        gateFailed: left > 0,
        summary: deleted || recovered
            ? `省略号策略：删除 ${deleted}，补全 ${recovered}${left ? `，仍剩实义空白 ${left}` : ''}`
            : (left ? `省略号策略：仍剩实义空白 ${left}` : '省略号策略：无需处理'),
    };
}

module.exports = {
    runHyMtEllipsisPolicyPass,
    alignJaToZh,
    countRecoverableEllipsisLeft,
    isVisibleEllipsisZh,
};
