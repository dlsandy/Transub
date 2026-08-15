/**
 * Subtitle editor — smart duration / audio-snap planners (async; inject FFmpeg detect).
 */
(function (global) {
    const SNAP_UNCHANGED_ERRORS = Object.freeze({
        no_speech: '未检测到可用语音段',
        no_region: '未匹配到语音段',
        too_short: '贴边后时长过短，已保持原时间',
        unchanged: '时间轴已贴近语音，无需调整',
    });

    function isEligibleForSmartDuration(cue, getCueDurMs) {
        if (!cue) return false;
        const dur = typeof getCueDurMs === 'function' ? getCueDurMs(cue) : 0;
        return dur >= 600;
    }

    function isEligibleForAudioSnap(cue, getCueDurMs) {
        if (!cue) return false;
        const dur = typeof getCueDurMs === 'function' ? getCueDurMs(cue) : 0;
        return dur >= 300;
    }

    function clampEndMsAvoidOverlap(cue, cueIndex, proposedEndMs, cues, {
        gapMs = 1,
        minDurMs = 500,
        allowNextClamp = true,
    } = {}) {
        let end = Math.round(Number(proposedEndMs) || 0);
        const list = Array.isArray(cues) ? cues : [];
        if (allowNextClamp && cueIndex < list.length - 1) {
            end = Math.min(end, list[cueIndex + 1].startMs - gapMs);
        }
        return Math.max((cue?.startMs || 0) + minDurMs, end);
    }

    function cueMatchesBatchDurCondition(cue, cueIndex, condition, deps = {}) {
        const getCueDurMs = deps.getCueDurMs || ((c) => (c?.endMs || 0) - (c?.startMs || 0));
        const getCps = deps.getCps || (() => null);
        const hasOverlap = deps.hasOverlap || (() => false);
        const selectedIndexes = deps.selectedIndexes || [];
        const selectedIndex = deps.selectedIndex;
        const sec = getCueDurMs(cue) / 1000;
        const c = condition || {};
        switch (c.condition) {
            case 'all':
                return true;
            case 'shorter':
                return sec < c.shorterSec;
            case 'longer':
                return sec > c.longerSec;
            case 'between':
                return sec >= Math.min(c.minSec, c.maxSec) && sec <= Math.max(c.minSec, c.maxSec);
            case 'cps_above': {
                const cps = getCps(cue);
                return cps != null && cps > c.cpsAbove;
            }
            case 'cps_below': {
                const cps = getCps(cue);
                return cps != null && cps < c.cpsBelow;
            }
            case 'text_contains':
                return c.textKeyword ? String(cue?.text ?? '').includes(c.textKeyword) : false;
            case 'overlap':
                return hasOverlap(cueIndex);
            case 'selected':
                return selectedIndexes.includes(cueIndex) || cueIndex === selectedIndex;
            default:
                return false;
        }
    }

    /**
     * Smart-adjust cue end from silence (extend/trim toward speech end).
     */
    async function planSmartDurationFromSilence(cue, opts = {}, deps = {}) {
        const videoPath = String(deps.videoPath || '').trim();
        if (!videoPath) {
            return { error: '请先关联视频后再使用智能调节时长' };
        }
        const splitApi = deps.splitApi;
        if (!splitApi) return { error: '分割核心未加载' };
        const getEndMs = deps.getEndMs || ((c) => c.endMs);
        const startMs = Math.round(Number(cue?.startMs) || 0);
        const endMs = getEndMs(cue);
        const minDurMs = 500;
        const tailPadMs = Math.max(0, Math.round(Number(opts.tailPadMs ?? 80)));
        const minShiftMs = Math.max(40, Math.round(Number(opts.minShiftMs ?? 80)));
        const padMs = Math.max(400, Math.min(4000, Math.round(Number(opts.padMs ?? 1500))));
        const gapMs = 1;

        const cues = Array.isArray(deps.cues) ? deps.cues : [];
        let cueIndex = Number(opts.cueIndex);
        if (!Number.isInteger(cueIndex) || cueIndex < 0) {
            cueIndex = cues.indexOf(cue);
        }
        const next = cueIndex >= 0 && cueIndex < cues.length - 1 ? cues[cueIndex + 1] : null;
        const nextLimit = next ? next.startMs - gapMs : Number.POSITIVE_INFINITY;
        const windowEnd = Math.max(
            endMs,
            Math.min(Number.isFinite(nextLimit) ? nextLimit : Number.POSITIVE_INFINITY, endMs + padMs),
        );
        if (windowEnd - startMs < 250) {
            return { error: '可分析时间窗过短（可能与下一条字幕过紧）' };
        }

        if (typeof deps.detectSilence !== 'function') {
            return { error: '未提供静音检测接口' };
        }
        const detect = await deps.detectSilence({
            path: videoPath,
            startMs,
            endMs: windowEnd,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
            ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
        });
        if (detect?.cancelled || deps.isCancelled?.()) {
            return { cancelled: true, error: '已取消' };
        }
        if (!detect?.ok) {
            return { error: detect?.error || '静音分析失败' };
        }

        let newEnd = null;
        if (typeof splitApi.snapCueTimingFromSilenceIntervals === 'function') {
            const snapped = splitApi.snapCueTimingFromSilenceIntervals(startMs, endMs, detect.intervals, {
                windowStartMs: startMs,
                windowEndMs: windowEnd,
                prevLimitMs: startMs,
                nextLimitMs: Number.isFinite(nextLimit) ? nextLimit : windowEnd,
                allowExtend: true,
                minDurMs,
                headPadMs: 0,
                tailPadMs,
                minSpeechMs: 200,
                minShiftMs,
            });
            if (snapped?.region) newEnd = Math.round(snapped.region.endMs + tailPadMs);
            else if (snapped?.changed) newEnd = Math.round(snapped.endMs);
        }
        if (newEnd == null && typeof splitApi.inferSpeechEndFromSilence === 'function') {
            newEnd = splitApi.inferSpeechEndFromSilence(startMs, endMs, detect.intervals, {
                minDurMs,
                minTrailingSilenceMs: Math.max(250, Math.round((opts.silenceDur ?? 0.25) * 1000)),
                tailPadMs,
            });
        }
        if (newEnd == null) {
            return {
                error: '未检测到可用语音边界，当前时长可能已接近实际语音长度',
                unchanged: true,
            };
        }
        newEnd = Math.max(startMs + minDurMs, Math.round(newEnd));
        if (Number.isFinite(nextLimit)) newEnd = Math.min(newEnd, nextLimit);
        newEnd = Math.max(startMs + minDurMs, newEnd);
        const deltaMs = newEnd - endMs;
        if (Math.abs(deltaMs) < minShiftMs) {
            return { error: '当前时长已接近实际语音，无需调整', unchanged: true };
        }
        return {
            newEndMs: newEnd,
            meta: {
                oldEndMs: endMs,
                deltaMs,
                silenceCount: detect.intervals?.length || 0,
            },
        };
    }

    /**
     * Snap cue start+end to speech boundaries inside a padded neighbor-aware window.
     */
    async function planAudioSnapFromSilence(cue, cueIndex, opts = {}, deps = {}) {
        const videoPath = String(deps.videoPath || '').trim();
        if (!videoPath) {
            return { error: '请先关联视频后再使用按音频贴边' };
        }
        const splitApi = deps.splitApi;
        if (!splitApi?.snapCueTimingFromSilenceIntervals) {
            return { error: '分割核心未加载' };
        }
        const getEndMs = deps.getEndMs || ((c) => c.endMs);
        const endMs = getEndMs(cue);
        const padMs = Math.max(0, Math.min(2000, Math.round(Number(opts.padMs ?? 400))));
        const gapMs = 1;
        const cues = Array.isArray(deps.cues) ? deps.cues : [];
        const prev = cueIndex > 0 ? cues[cueIndex - 1] : null;
        const next = cueIndex < cues.length - 1 ? cues[cueIndex + 1] : null;
        const prevLimit = prev ? getEndMs(prev) + gapMs : 0;
        const nextLimit = next ? next.startMs - gapMs : Number.POSITIVE_INFINITY;
        const windowStart = Math.max(0, Math.max(prevLimit, cue.startMs - padMs));
        const windowEndRaw = Math.min(
            Number.isFinite(nextLimit) ? nextLimit : Number.POSITIVE_INFINITY,
            endMs + padMs,
        );
        const windowEnd = Number.isFinite(windowEndRaw) ? windowEndRaw : endMs + padMs;
        if (windowEnd - windowStart < 250) {
            return { error: '可分析时间窗过短（可能与相邻字幕过紧）' };
        }

        if (typeof deps.detectSilence !== 'function') {
            return { error: '未提供静音检测接口' };
        }
        const detect = await deps.detectSilence({
            path: videoPath,
            startMs: windowStart,
            endMs: windowEnd,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
            ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
        });
        if (detect?.cancelled || deps.isCancelled?.()) {
            return { cancelled: true, error: '已取消' };
        }
        if (!detect?.ok) {
            return { error: detect?.error || '静音分析失败' };
        }

        const snapped = splitApi.snapCueTimingFromSilenceIntervals(
            cue.startMs,
            endMs,
            detect.intervals,
            {
                windowStartMs: windowStart,
                windowEndMs: windowEnd,
                prevLimitMs: prevLimit,
                nextLimitMs: Number.isFinite(nextLimit) ? nextLimit : windowEnd,
                minDurMs: 500,
                headPadMs: Math.max(0, Math.round(Number(opts.headPadMs ?? 80))),
                tailPadMs: Math.max(0, Math.round(Number(opts.tailPadMs ?? 80))),
                minSpeechMs: 200,
                minShiftMs: 80,
                allowExtend: opts.allowExtend !== false,
            },
        );
        if (snapped.changed) {
            return {
                startMs: snapped.startMs,
                endMs: snapped.endMs,
                startDelta: snapped.startDelta,
                endDelta: snapped.endDelta,
                silenceCount: detect.intervals?.length || 0,
                windowStartMs: windowStart,
                windowEndMs: windowEnd,
            };
        }
        return {
            error: SNAP_UNCHANGED_ERRORS[snapped.reason] || '无需调整',
            unchanged: true,
            snapped,
        };
    }

    const api = {
        SNAP_UNCHANGED_ERRORS,
        isEligibleForSmartDuration,
        isEligibleForAudioSnap,
        clampEndMsAvoidOverlap,
        cueMatchesBatchDurCondition,
        planSmartDurationFromSilence,
        planAudioSnapFromSilence,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.audioSnapDurationPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
