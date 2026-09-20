/**
 * Post-ASR second opinion on low-confidence windows (same-model re-decode,
 * or a safer sibling for fragile CT2). Nested inside engine batch:
 * allowDuringBatch + skip compute lock. Range jobs keep ASR weights loaded;
 * VRAM is released once after the burst.
 */
const path = require('path');
const fs = require('fs');
const core = require('../src/js/asr-second-opinion-core');
const { asString, asPlainObject } = require('./ipc-validate');

function buildSecondOpinionRangeOptions(options, sibling) {
    return {
        ...options,
        engineAsrModel: sibling,
        task: 'transcribe',
        smartTranslate: false,
        releaseGpuAfter: false,
    };
}

function loadSubtitleCues(subPath) {
    const filePath = asString(subPath, 4096).trim();
    if (!filePath || !fs.existsSync(filePath)) return [];
    try {
        const { parseSubtitle } = require('./subtitle-format');
        const raw = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'srt';
        const parsed = parseSubtitle(raw, ext);
        return (parsed.cues || []).map((c, i) => ({
            index: i,
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || '').trim(),
        })).filter((c) => c.text);
    } catch (_) {
        return [];
    }
}

function loadLowConfidenceIndexes(subPath, cues) {
    try {
        const { readSubtitleMeta } = require('./subtitle-meta');
        const metaCore = require('../src/js/subtitle-meta-core');
        const read = readSubtitleMeta(subPath);
        if (!read?.ok || !read.meta) {
            return { lowIndexes: [], annotations: [] };
        }
        const anns = metaCore.mergeConfidenceAnnotations(cues, read.meta, {});
        const lowIndexes = anns.map((a, i) => (a?.low ? i : -1)).filter((i) => i >= 0);
        return { lowIndexes, annotations: anns };
    } catch (_) {
        return { lowIndexes: [], annotations: [] };
    }
}

function writeSubtitleCues(subPath, cues) {
    const filePath = asString(subPath, 4096).trim();
    if (!filePath) return { ok: false, error: 'no_path' };
    try {
        const { writeSubtitleDocument } = require('./extensions-bridge');
        const { parseSubtitle } = require('./subtitle-format');
        const raw = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'srt';
        const doc = parseSubtitle(raw, ext);
        const written = writeSubtitleDocument(filePath, {
            cues: (cues || []).map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text,
            })),
            format: doc.format || ext,
            header: doc.header,
            backupMode: 'off',
        });
        return { ok: !!written?.ok, error: written?.error, path: filePath };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

/**
 * @param {{
 *   mediaPath: string,
 *   subtitlePath: string,
 *   primaryAsr?: string,
 *   options?: object,
 *   onProgress?: Function,
 *   onLog?: Function,
 * }} input
 */
async function runAsrSecondOpinionPass(input = {}) {
    const options = asPlainObject(input.options);
    const mediaPath = asString(input.mediaPath, 4096).trim();
    const subtitlePath = asString(input.subtitlePath || input.sourceSubtitlePath, 4096).trim();
    const primaryAsr = asString(
        input.primaryAsr || options.engineAsrModel || '',
        128,
    ).trim();

    if (!core.shouldRunAsrSecondOpinion({
        ...options,
        primaryAsr,
        contentProfile: options.contentProfile || options.senseProfile || input.contentProfile,
        asrSecondOpinion: options.asrSecondOpinion ?? input.asrSecondOpinion,
    })) {
        return { ok: true, skipped: true, reason: 'disabled_or_auto_skip' };
    }
    if (!mediaPath || !fs.existsSync(mediaPath)) {
        return { ok: true, skipped: true, reason: 'no_media' };
    }
    if (!subtitlePath || !fs.existsSync(subtitlePath)) {
        return { ok: true, skipped: true, reason: 'no_subtitle' };
    }

    const cues = loadSubtitleCues(subtitlePath);
    if (cues.length < 4) {
        return { ok: true, skipped: true, reason: 'few_cues' };
    }
    const { lowIndexes, annotations } = loadLowConfidenceIndexes(subtitlePath, cues);
    const smartCore = (() => {
        try { return require('../src/js/subtitle-qc-smart-core'); } catch { return null; }
    })();
    const rangePolicy = require('./engine-range-asr-policy');
    const contentProfile = options.contentProfile || options.senseProfile || input.contentProfile;
    const mediaDurationMs = await resolveMediaDurationMs(mediaPath, cues, options, input);
    let bandByIndex = options.bandByIndex || options.cueRiskBands || null;
    if (!bandByIndex) {
        try {
            const { readSubtitleMeta } = require('./subtitle-meta');
            const read = readSubtitleMeta(subtitlePath);
            bandByIndex = read?.meta?.cueRiskBands || read?.meta?.bandByIndex || null;
        } catch { /* optional */ }
    }
    const planned = core.planAsrSecondOpinion(cues, lowIndexes, {
        maxRanges: Number(options.asrSecondOpinionMaxRanges) || core.DEFAULT_MAX_RANGES,
        minLowCues: Number(options.asrSecondOpinionMinLow) || core.DEFAULT_MIN_LOW_CUES,
        minRangeMs: Number(options.asrSecondOpinionMinRangeMs) || core.DEFAULT_MIN_RANGE_MS,
        strictThreshold: Number(options.asrSecondOpinionStrictThreshold)
            || core.DEFAULT_STRICT_LOW_THRESHOLD,
        minGapMs: Number(options.asrSecondOpinionMinGapMs) || undefined,
        mediaDurationMs,
        contentProfile,
        primaryAsr,
        includeTimelineGaps: options.asrSecondOpinionIncludeGaps,
        annotations,
        bandByIndex,
        cueRiskBands: bandByIndex,
        buildRanges: smartCore?.buildQcRetranscribeRanges
            ? (list, indexes, opts) => smartCore.buildQcRetranscribeRanges(list, indexes, opts)
            : undefined,
    });
    if (!planned.ok) {
        return {
            ok: true,
            skipped: true,
            reason: planned.reason,
            lowConfidenceCueCount: lowIndexes.length,
            riskyLowCueCount: (planned.lowIndexes || []).length,
            hallucCueCount: (planned.hallucIndexes || []).length,
            gapWindowCount: planned.gapWindowCount || 0,
            skippedRanges: planned.skippedRanges || [],
        };
    }
    const onLogEarly = typeof input.onLog === 'function' ? input.onLog : null;
    const stats = planned.planStats || {};
    onLogEarly?.(
        `ASR 二意见：低置信 ${stats.riskyLowCueCount ?? (planned.lowIndexes || []).length}`
        + ` · 幻觉 ${(stats.hallucCueCount ?? (planned.hallucIndexes || []).length) || 0}`
        + ` · 空洞 ${stats.gapWindowCount ?? planned.gapWindowCount ?? 0}`
        + ` · 实跑 ${planned.ranges.length}`,
    );
    if ((planned.skippedRanges || []).length) {
        const n = planned.skippedRanges.length;
        const reasons = [...new Set(planned.skippedRanges.map((r) => r.skipReason).filter(Boolean))];
        onLogEarly?.(
            `ASR 二意见：跳过 ${n} 个过短/空窗${reasons.length ? `（${reasons.join(',')}）` : ''}`,
        );
    }

    let installedIds = null;
    try {
        const { listInstalledAsrIds } = require('./env-check');
        const installRoot = asString(options.engineInstallPath || '', 4096).trim();
        if (installRoot) installedIds = listInstalledAsrIds(installRoot);
    } catch (_) {
        installedIds = null;
    }
    const opinionModels = core.listSecondOpinionAsrModels(primaryAsr, {
        candidates: rangePolicy.buildBatchAsrCandidates(primaryAsr),
        installedIds,
    });
    if (!opinionModels.length) {
        return { ok: true, skipped: true, reason: 'no_sibling_model' };
    }

    const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
    const onLog = typeof input.onLog === 'function' ? input.onLog : null;
    const {
        transcribeRangeWithEngine,
        ensureEngineRunning,
    } = require('./engine-bridge');
    const metaCore = require('../src/js/subtitle-meta-core');
    const { mergeRangeAsrConfidenceMeta } = require('./asr-confidence-seed');

    // Fragile CT2 (anime/kotoba) still prefers a safer sibling. Other backends
    // re-decode with the primary still loaded; respawn if the engine child died.

    let siblingIdx = 0;
    let sibling = opinionModels[siblingIdx];
    const reusePrimary = sibling.toLowerCase() === primaryAsr.toLowerCase();
    onLogEarly?.(
        reusePrimary
            ? `ASR 二意见：同模型重解码（${sibling}）`
            : `ASR 二意见：兄弟模型 ${sibling}`,
    );
    try {
        const ensure = await ensureEngineRunning({
            ...options,
            forceRestart: false,
        });
        if (!ensure?.ok) {
            const again = await ensureEngineRunning({
                ...options,
                forceRestart: true,
            });
            if (again?.ok) {
                onLog?.('ASR 二意见：引擎已重新拉起');
            }
        }
    } catch (_) { /* best-effort */ }

    let working = cues.map((c) => ({ ...c }));
    let replacedWindows = 0;
    let attempted = 0;
    let engineRestarts = 0;
    let badPoolDraftsAppended = 0;
    /** @type {{ startMs: number, endMs: number }[]} */
    const acceptedRanges = [];

    const isEngineDownish = (res) => {
        const code = String(res?.code || '');
        const err = String(res?.error || '');
        return code === 'compute_busy'
            || /引擎未响应|连接被拒绝|ECONNREFUSED|fetch failed|引擎未运行|健康检查|进程退出/i.test(err);
    };

    const advanceSibling = (reason) => {
        if (siblingIdx >= opinionModels.length - 1) return false;
        siblingIdx += 1;
        sibling = opinionModels[siblingIdx];
        onLog?.(`ASR 二意见：改用更稳模型 ${sibling}${reason ? `（${reason}）` : ''}`);
        return true;
    };

    for (let i = 0; i < planned.ranges.length; i += 1) {
        const range = planned.ranges[i];
        attempted += 1;
        const kindLabel = range?.source === 'gap' || range?.kind === 'gap'
            ? '空洞'
            : (range?.source === 'hallucination' || range?.kind === 'hallucination' ? '幻觉' : '低置信');
        onProgress?.({
            stage: 'asr-second-opinion',
            detail: `ASR二意见(${kindLabel}) ${i + 1}/${planned.ranges.length}（${sibling}）`,
            range: i + 1,
            totalRanges: planned.ranges.length,
        });
        try {
            const primarySlice = working.filter(
                (c) => Number(c.startMs) < range.endMs && Number(c.endMs) > range.startMs,
            );
            // One sibling only — avoid SenseVoice empty → tiny → turbo on micro clips.
            const rangeOpts = buildSecondOpinionRangeOptions(options, sibling);
            const res = await transcribeRangeWithEngine({
                mediaPath,
                startMs: range.startMs,
                endMs: range.endMs,
                padMs: 350,
                subtitlePath,
                asrModel: sibling,
                asrCandidates: [sibling],
                allowDuringBatch: true,
                _skipComputeLock: true,
                options: rangeOpts,
            }, {
                allowDuringBatch: true,
                _skipComputeLock: true,
                options: rangeOpts,
                onProgress: (info) => onProgress?.({
                    stage: 'asr-second-opinion',
                    detail: info?.detail || info?.message || `二意见 ${i + 1}/${planned.ranges.length}`,
                }),
            });

            if (!res?.ok && isEngineDownish(res) && engineRestarts < 2) {
                engineRestarts += 1;
                try {
                    const again = await ensureEngineRunning({
                        ...options,
                        forceRestart: true,
                    });
                    if (again?.ok) {
                        onLog?.(`ASR 二意见：引擎崩溃后已重启（第 ${engineRestarts} 次）`);
                    }
                } catch (_) { /* ignore */ }
                advanceSibling('引擎异常');
                i -= 1;
                attempted -= 1;
                continue;
            }

            if (!res?.ok || !Array.isArray(res.cues) || !res.cues.length) {
                continue;
            }
            const winner = core.chooseSecondOpinionWinner(primarySlice, res.cues);
            if (!winner.useOpinion) continue;
            try {
                const { buildSecondOpinionBadDrafts, appendAsrBadPoolDrafts } = require('./asr-bad-pool-draft');
                const drafts = buildSecondOpinionBadDrafts({
                    primaryCues: primarySlice,
                    opinionCues: winner.cues,
                    primaryAsr,
                    opinionAsr: sibling,
                    contentProfile: options.contentProfile || options.senseProfile || input.contentProfile,
                    mediaPath,
                    startMs: range.startMs,
                    endMs: range.endMs,
                    reason: winner.reason,
                });
                const writtenDraft = appendAsrBadPoolDrafts(drafts, {
                    enabled: options.asrBadPoolDrafts !== false,
                });
                if (writtenDraft?.appended > 0) {
                    badPoolDraftsAppended += writtenDraft.appended;
                    onLog?.(`ASR 坏句草稿 +${writtenDraft.appended} → ${path.basename(writtenDraft.path || '')}`);
                }
            } catch (_) { /* optional training scratch */ }
            const replacedDoc = metaCore.replaceCuesInTimeRange(
                working,
                range.startMs,
                range.endMs,
                winner.cues,
            );
            working = replacedDoc.cues.map((c, idx) => ({
                index: idx,
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text,
            }));
            replacedWindows += 1;
            acceptedRanges.push({ startMs: range.startMs, endMs: range.endMs });
            try {
                mergeRangeAsrConfidenceMeta(subtitlePath, res.cues, {
                    startMs: range.startMs,
                    endMs: range.endMs,
                    allowHeuristic: true,
                });
            } catch (_) { /* ignore */ }
        } catch (err) {
            onLog?.(`ASR 二意见窗 ${i + 1} 跳过: ${err?.message || err}`);
            if (engineRestarts < 2) {
                engineRestarts += 1;
                try {
                    await ensureEngineRunning({ ...options, forceRestart: true });
                } catch (_) { /* ignore */ }
                advanceSibling('异常');
            }
        }
    }

    if (attempted > 0) {
        try {
            const { releaseGpuAfterQcRetranscribeBurst } = require('./engine-qc-retranscribe-options');
            await releaseGpuAfterQcRetranscribeBurst(options);
            onLog?.('ASR 二意见：窗间保持显存，现已释放');
        } catch (_) { /* llama afterAsr / next item will also try */ }
    }

    if (!replacedWindows) {
        return {
            ok: true,
            skipped: false,
            replacedWindows: 0,
            attempted,
            sibling,
            siblingsTried: opinionModels.slice(0, siblingIdx + 1),
            lowConfidenceCueCount: lowIndexes.length,
            riskyLowCueCount: (planned.lowIndexes || []).length,
            hallucCueCount: (planned.hallucIndexes || []).length,
            gapWindowCount: planned.gapWindowCount || 0,
            planRanges: planned.ranges.length,
            skippedRanges: planned.skippedRanges || [],
            badPoolDraftsAppended,
        };
    }

    const written = writeSubtitleCues(subtitlePath, working);
    let targetBlanked = 0;
    const targetPath = asString(
        input.targetSubtitlePath || options.targetSubtitlePath || '',
        4096,
    ).trim();
    if (
        written.ok
        && targetPath
        && targetPath !== subtitlePath
        && fs.existsSync(targetPath)
        && acceptedRanges.length
    ) {
        try {
            const targetCues = loadSubtitleCues(targetPath);
            // loadSubtitleCues drops empty — re-read full list for blanking
            const { parseSubtitle } = require('./subtitle-format');
            const raw = fs.readFileSync(targetPath, 'utf8');
            const ext = path.extname(targetPath).replace(/^\./, '').toLowerCase() || 'srt';
            const doc = parseSubtitle(raw, ext);
            const full = (doc.cues || []).map((c, i) => ({
                index: i,
                startMs: Number(c.startMs) || 0,
                endMs: Number(c.endMs) || 0,
                text: String(c.text || '').trim(),
            }));
            const blanked = core.blankTargetCuesForRanges(full.length ? full : targetCues, acceptedRanges);
            if (blanked.blankedCount > 0) {
                const tw = writeSubtitleCues(targetPath, blanked.cues);
                if (tw.ok) {
                    targetBlanked = blanked.blankedCount;
                    onLog?.(
                        `ASR 二意见：译文档对齐清空 ${targetBlanked} 条为「${blanked.placeholder}」→ ${path.basename(targetPath)}`,
                    );
                }
            }
        } catch (err) {
            onLog?.(`ASR 二意见：译文档对齐跳过: ${err?.message || err}`);
        }
    }

    onLog?.(`ASR 二意见：采纳 ${replacedWindows}/${attempted} 窗（${sibling}）`);
    return {
        ok: !!written.ok,
        skipped: false,
        replacedWindows,
        attempted,
        sibling,
        siblingsTried: opinionModels.slice(0, siblingIdx + 1),
        lowConfidenceCueCount: lowIndexes.length,
        riskyLowCueCount: (planned.lowIndexes || []).length,
        hallucCueCount: (planned.hallucIndexes || []).length,
        gapWindowCount: planned.gapWindowCount || 0,
        planRanges: planned.ranges.length,
        skippedRanges: planned.skippedRanges || [],
        targetBlanked,
        badPoolDraftsAppended,
        path: subtitlePath,
        error: written.error,
    };
}

async function resolveMediaDurationMs(mediaPath, cues, options = {}, input = {}) {
    const explicit = Number(options.mediaDurationMs || input.mediaDurationMs);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    const fromCues = (Array.isArray(cues) ? cues : []).reduce(
        (max, c) => Math.max(max, Number(c?.endMs) || 0),
        0,
    );
    try {
        const { probeVideo } = require('./ffmpeg-bridge');
        const probed = await Promise.race([
            probeVideo(mediaPath, options.ffprobePath),
            new Promise((resolve) => setTimeout(() => resolve({ ok: false }), 4000)),
        ]);
        const sec = Number(probed?.duration) || 0;
        if (probed?.ok && sec > 0) {
            return Math.max(fromCues, Math.round(sec * 1000));
        }
    } catch (_) { /* cue fallback */ }
    return fromCues;
}

module.exports = {
    runAsrSecondOpinionPass,
    loadSubtitleCues,
    loadLowConfidenceIndexes,
    resolveMediaDurationMs,
    buildSecondOpinionRangeOptions,
};
