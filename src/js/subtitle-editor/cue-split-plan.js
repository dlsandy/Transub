/**
 * Subtitle editor — cue split planner (pure; inject split-core + caret/playhead).
 */
(function (global) {
    const CONNECTED_TEXT_ERROR = '文本为连续书写（无空格与换行），无法自动分割。请使用光标或播放头手动分割。';
    const SILENCE_CONNECTED_ERROR = '文本为连续书写且未匹配断句词/标点，无法静音分割。请在「断句词」中添加，或使用光标/播放头手动分割。';

    function timingModeFromUseCps(useCps) {
        return useCps ? 'cps' : 'proportional';
    }

    function cpsTimingOpts(getTargetCps) {
        const targetCps = typeof getTargetCps === 'function' ? getTargetCps() : 3;
        return { targetCps, minDurMs: 500 };
    }

    function needsBreakWords(mode) {
        return mode === 'chars' || mode === 'count' || mode === 'silence';
    }

    function splitAtPlayheadMidpoint(cue, atMs, textA, textB, getEndMs) {
        const endMs = typeof getEndMs === 'function' ? getEndMs(cue) : cue.endMs;
        if (atMs <= cue.startMs || atMs >= endMs) return null;
        return [
            { startMs: cue.startMs, endMs: atMs, text: textA },
            { startMs: atMs, endMs, text: textB },
        ];
    }

    /**
     * Guard when mode needs break words / punctuation on connected text.
     * @returns {string|null} error message or null
     */
    function connectedSplitGuard(mode, text, splitApi, getBreakWords) {
        if (!needsBreakWords(mode) || !splitApi?.isConnectedText?.(text)) return null;
        if (mode === 'silence' && typeof splitApi.getSilenceTextBreakIndices === 'function') {
            const breakWords = typeof getBreakWords === 'function' ? getBreakWords() : [];
            return splitApi.getSilenceTextBreakIndices(text, {
                breakWords,
                includePunctuation: true,
            }).length
                ? null
                : SILENCE_CONNECTED_ERROR;
        }
        return CONNECTED_TEXT_ERROR;
    }

    /**
     * Plan a cue split without mutating editor state.
     * @param {string} mode lines|spaces|chars|count|smart|cursor|playhead
     * @param {{ startMs: number, endMs?: number, text?: string }} cue
     * @param {object} opts charCount, count, smartMaxChars, smartLineChars, breakWords, useCps
     * @param {object} deps splitApi, getEndMs, getTargetCps, getBreakWords, getCursorIndex, getPlayheadMs, hasVideo
     */
    function planCueSplit(mode, cue, opts = {}, deps = {}) {
        const splitApi = deps.splitApi;
        if (!splitApi) {
            return { error: '分割核心未加载' };
        }
        const text = String(cue?.text || '').trim();
        const getEndMs = deps.getEndMs || ((c) => c.endMs);
        const endMs = getEndMs(cue);
        if (!text) {
            return { error: '当前字幕文本为空，无法分割' };
        }
        const guard = connectedSplitGuard(mode, text, splitApi, deps.getBreakWords);
        if (guard) return { error: guard };

        const useCps = opts.useCps !== false;
        const timingMode = timingModeFromUseCps(useCps);
        const timingOpts = cpsTimingOpts(deps.getTargetCps);
        const build = (texts, modeOverride) => splitApi.buildCuesFromTexts(
            cue.startMs,
            endMs,
            texts,
            modeOverride || timingMode,
            timingOpts,
        );

        if (mode === 'smart') {
            const parts = splitApi.splitTextSmart(text, {
                maxChars: opts.smartMaxChars ?? opts.charCount ?? 20,
                maxLineChars: opts.smartLineChars ?? 18,
                breakWords: opts.breakWords || (deps.getBreakWords?.() || []),
            });
            return parts.length < 2
                ? { error: '当前文本无需智能分割（已足够短或缺少标点/断句词）' }
                : { cues: build(parts) };
        }
        if (mode === 'lines') {
            const parts = splitApi.splitTextByLines(text);
            return parts.length < 2
                ? { error: '文本中没有多个换行，无法按行分割' }
                : { cues: build(parts) };
        }
        if (mode === 'spaces') {
            const parts = splitApi.splitTextBySpaces(text);
            return parts.length < 2
                ? { error: '文本中没有空格，无法按空格分割' }
                : { cues: build(parts) };
        }
        if (mode === 'chars') {
            const parts = splitApi.splitTextByCharCount(text, opts.charCount);
            return parts.length < 2
                ? { error: '按该字符数无法拆成多条' }
                : { cues: build(parts) };
        }
        if (mode === 'count') {
            const parts = splitApi.splitTextIntoNParts(text, opts.count);
            if (parts === null) {
                return { error: `文本过短，无法均分为 ${opts.count} 段` };
            }
            return parts.length < 2
                ? { error: '均分后不足两条，请减少段数' }
                : { cues: build(parts, 'equal') };
        }
        if (mode === 'cursor') {
            const idx = typeof deps.getCursorIndex === 'function'
                ? deps.getCursorIndex(text)
                : text.length;
            const parts = splitApi.splitTextAtIndex(text, idx);
            return parts
                ? { cues: build(parts) }
                : { error: '请将光标置于文本中间再分割' };
        }
        if (mode === 'playhead') {
            if (deps.hasVideo === false) {
                return { error: '未加载视频，无法在播放头处分割' };
            }
            const atMs = typeof deps.getPlayheadMs === 'function' ? deps.getPlayheadMs() : NaN;
            if (!(atMs > cue.startMs && atMs < endMs)) {
                return { error: '播放头不在当前字幕时间范围内' };
            }
            const ratio = (atMs - cue.startMs) / (endMs - cue.startMs);
            const approx = Math.min(text.length - 1, Math.max(1, Math.round(text.length * ratio)));
            const snapped = splitApi.snapSplitIndexNearPunctuation(text, approx, 12);
            let parts = splitApi.splitTextAtIndex(text, snapped);
            if (!parts) parts = splitApi.splitTextAtIndex(text, Math.floor(text.length / 2));
            if (!parts) return { error: '文本过短，无法在播放头处分割' };
            const cues = splitAtPlayheadMidpoint(cue, atMs, parts[0], parts[1], getEndMs);
            return cues ? { cues } : { error: '播放头位置无效' };
        }
        return { error: '未知的分割方式' };
    }

    const api = {
        CONNECTED_TEXT_ERROR,
        SILENCE_CONNECTED_ERROR,
        timingModeFromUseCps,
        cpsTimingOpts,
        needsBreakWords,
        splitAtPlayheadMidpoint,
        connectedSplitGuard,
        planCueSplit,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.cueSplitPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
