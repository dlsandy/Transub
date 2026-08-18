/**
 * Subtitle editor — silence-based cue split planner (async; inject FFmpeg detect).
 */
(function (global) {
    function buildSilenceDetectPasses(silenceDb, silenceDur, cueDurMs) {
        const noise = silenceDb != null ? silenceDb : -30;
        const minSilence = silenceDur != null ? silenceDur : 0.12;
        const minSeg = Math.max(120, Math.min(280, Math.round(cueDurMs * 0.1)));
        return [
            { noise, minSilence, minSeg },
            {
                noise: Math.min(-26, noise + 5),
                minSilence: Math.min(0.1, minSilence),
                minSeg: Math.max(100, minSeg - 40),
            },
            { noise: -24, minSilence: 0.08, minSeg: Math.max(100, minSeg - 60) },
            { noise: -22, minSilence: 0.06, minSeg: 100 },
        ];
    }

    function idealBreakMsFromText(text, startMs, endMs, splitApi, breakWords) {
        const cueDur = endMs - startMs;
        const sentenceIndices = (
            typeof splitApi.getSentenceBreakIndices === 'function'
                ? splitApi.getSentenceBreakIndices(text)
                : []
        );
        const spaceIndices = (
            typeof splitApi.getWhitespaceBreakIndices === 'function'
                ? splitApi.getWhitespaceBreakIndices(text)
                : []
        );
        // Safe cuts: sentence boundaries + whitespace (spaces may split even within a sentence)
        let indices = [...new Set([...(sentenceIndices || []), ...(spaceIndices || [])])]
            .sort((a, b) => a - b);
        if (!indices.length) {
            indices = (
                typeof splitApi.getSilenceTextBreakIndices === 'function'
                    ? splitApi.getSilenceTextBreakIndices(text, {
                        breakWords,
                        includePunctuation: true,
                    })
                    : []
            );
        }
        // Single complete sentence with no spaces / mid-sentence breaks → no ideal cut
        if (
            !indices.length
            && typeof splitApi.endsWithStrongSentencePunct === 'function'
            && splitApi.endsWithStrongSentencePunct(text)
        ) {
            return [];
        }
        return (indices || []).map((w) => {
            const A = Math.max(0, Math.min(1, w / Math.max(1, String(text || '').length)));
            return Math.round(startMs + A * cueDur);
        });
    }

    function pickPointsFromSilenceResult(detectResult, cueStartMs, cueEndMs, {
        minSegMs,
        minSilenceMs,
        idealBreakMs,
        splitApi,
        maxSplits,
    } = {}) {
        if (!detectResult?.ok) return [];
        const cueDur = cueEndMs - cueStartMs;
        const edgeMs = Math.max(100, Math.min(minSegMs || 120, Math.floor(cueDur * 0.12)));
        if (typeof splitApi?.pickScoredSilenceSplitPoints === 'function') {
            return splitApi.pickScoredSilenceSplitPoints(
                detectResult.intervals,
                cueStartMs,
                cueEndMs,
                {
                    edgeMs,
                    minSilenceMs,
                    minSpeechMs: 120,
                    idealBreakMs: idealBreakMs || [],
                    minGapMs: edgeMs,
                    maxSplits,
                },
            );
        }
        const pe = cueStartMs + edgeMs;
        const le = cueEndMs - edgeMs;
        if (le <= pe) return [];
        const raw = [];
        const push = (ms) => {
            const S = Math.round(Number(ms) || 0);
            if (S > pe && S < le) raw.push(S);
        };
        for (const fe of detectResult.splitPointsMs || []) push(fe);
        for (const fe of detectResult.intervals || []) {
            const S = Math.max(cueStartMs, Math.round(Number(fe.startMs) || 0));
            const E = Math.min(cueEndMs, Math.round(Number(fe.endMs) || 0));
            if (E - S >= (minSilenceMs || 50)) push(Math.round((S + E) / 2));
        }
        const sorted = [...raw].sort((a, b) => a - b);
        const out = [];
        for (const fe of sorted) {
            if (!out.length || fe - out[out.length - 1] >= edgeMs) out.push(fe);
        }
        return out;
    }

    /**
     * @param {{ startMs: number, endMs?: number, text?: string }} cue
     * @param {object} opts silenceDb, silenceDur, padMs, breakWords, detailDurationSec
     * @param {object} deps videoPath, ffmpegPath, splitApi, getEndMs, connectedGuard,
     *   detectSilence(fn), isCancelled(), getBreakWords()
     */
    async function planSilenceCueSplit(cue, opts = {}, deps = {}) {
        const videoPath = String(deps.videoPath || '').trim();
        if (!videoPath) {
            return { error: '请先关联视频后再使用静音切分' };
        }
        const splitApi = deps.splitApi;
        if (!splitApi) return { error: '分割核心未加载' };

        const startMs = Math.round(Number(cue?.startMs) || 0);
        let endMs = Math.round(Number(
            typeof deps.getEndMs === 'function' ? deps.getEndMs(cue) : cue?.endMs,
        ) || 0);
        if (!(endMs > startMs)) {
            const durSec = Number(opts.detailDurationSec);
            if (Number.isFinite(durSec) && durSec > 0) {
                endMs = startMs + Math.round(durSec * 1000);
            }
        }
        const text = String(cue?.text || '').trim();
        if (!text) return { error: '当前字幕文本为空，无法分割' };

        const getBreakWords = deps.getBreakWords || (() => opts.breakWords || []);
        if (typeof deps.connectedGuard === 'function') {
            const guard = deps.connectedGuard('silence', text);
            if (guard) return { error: guard };
        }

        const cueDur = endMs - startMs;
        if (!Number.isFinite(cueDur) || cueDur < 250) {
            return {
                error: `当前字幕时长过短（${Number.isFinite(cueDur) ? (cueDur / 1000).toFixed(3) : '?'}s），无法分析静音`,
            };
        }

        const padMs = Math.max(0, Math.min(1200, Math.round(Number(opts.padMs ?? 600))));
        const winStart = Math.max(0, startMs - padMs);
        const winEnd = endMs + padMs;
        if (!(winEnd > winStart + 200) || !Number.isFinite(winStart) || !Number.isFinite(winEnd)) {
            return {
                error: `静音分析时间窗无效（${startMs}–${endMs} ms），请检查字幕起止时间`,
            };
        }

        const silenceDb = opts.silenceDb != null ? opts.silenceDb : -30;
        const silenceDur = opts.silenceDur != null ? opts.silenceDur : 0.12;
        const breakWords = opts.breakWords || getBreakWords();
        const idealBreakMs = idealBreakMsFromText(text, startMs, endMs, splitApi, breakWords);
        const charCount = typeof splitApi.textCharCount === 'function'
            ? splitApi.textCharCount(text)
            : String(text || '').replace(/\s/g, '').length;
        const maxChars = Math.round(Number(opts.maxChars) || 0);
        // QC threshold: only enough cuts to bring pieces near the limit (avoid shredding by every space)
        let maxSplits = Math.round(Number(opts.maxSplits) || 0);
        if (!(maxSplits > 0) && maxChars > 0 && charCount > maxChars) {
            maxSplits = Math.max(1, Math.ceil(charCount / maxChars) - 1);
        }
        if (!(maxSplits > 0)) {
            maxSplits = Math.max(1, Math.min(idealBreakMs.length || 8, Math.floor(cueDur / 1600) || 1));
        }
        const passes = buildSilenceDetectPasses(silenceDb, silenceDur, cueDur);
        const detectSilence = deps.detectSilence;
        if (typeof detectSilence !== 'function') {
            return { error: '未提供静音检测接口' };
        }
        const isCancelled = typeof deps.isCancelled === 'function'
            ? deps.isCancelled
            : () => false;

        let lastDetect = null;
        let splitPoints = [];
        let lastError = '';
        for (const pass of passes) {
            if (isCancelled()) return { cancelled: true, error: '已取消' };
            const result = await detectSilence({
                path: videoPath,
                startMs: winStart,
                endMs: winEnd,
                durationMs: winEnd - winStart,
                noiseDb: pass.noise,
                minSilenceSec: pass.minSilence,
                minSegmentMs: pass.minSeg,
                ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
            });
            if (result?.cancelled || isCancelled()) {
                return { cancelled: true, error: '已取消' };
            }
            if (!result?.ok) {
                lastError = result?.error || lastError;
                continue;
            }
            lastDetect = result;
            const minSilenceMs = Math.max(50, Math.round(pass.minSilence * 850));
            splitPoints = pickPointsFromSilenceResult(result, startMs, endMs, {
                minSegMs: pass.minSeg,
                minSilenceMs,
                idealBreakMs,
                splitApi,
                maxSplits,
            });
            if (splitPoints.length) break;
        }

        if (!lastDetect?.ok && lastError) return { error: lastError };
        if (!splitPoints.length) {
            return { error: '该时间段内未检测到足够长的静音，请调低阈值或改用智能断句' };
        }
        if (splitPoints.length > maxSplits) {
            splitPoints = splitPoints.slice(0, maxSplits);
        }

        const cues = splitApi.buildCuesFromSilenceSplits(
            text,
            startMs,
            endMs,
            splitPoints,
            20,
            lastDetect.intervals,
            {
                minDurMs: 400,
                minTrailingSilenceMs: Math.max(100, Math.round((opts.silenceDur ?? silenceDur) * 700)),
                minLeadingSilenceMs: Math.max(100, Math.round((opts.silenceDur ?? silenceDur) * 700)),
                headPadMs: 60,
                tailPadMs: 60,
                gapMs: 1,
                breakWords,
                includePunctuation: true,
                maxSplits,
            },
        );
        if (!cues || cues.length < 2) {
            return { error: '静音切分后文本不足两条，请调整阈值或手动分割' };
        }
        return {
            cues,
            meta: {
                silenceCount: lastDetect.intervals?.length || 0,
                splitCount: splitPoints.length,
            },
        };
    }

    const api = {
        buildSilenceDetectPasses,
        idealBreakMsFromText,
        pickPointsFromSilenceResult,
        planSilenceCueSplit,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.silenceSplitPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
