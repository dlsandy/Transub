/**
 * Subtitle editor — retranscribe range window / source-cue / progress UI plan (pure).
 */
(function (global) {
    function friendlyJobAbortMessage(err) {
        const r = String(err || '').trim();
        if (!r) return '处理失败';
        const i = r.toLowerCase();
        return i === 'aborted' || i === 'cancelled'
            || i.includes('operation was aborted')
            || i.includes('user aborted')
            || i.includes('aborterror')
            || i.includes('the operation was aborted')
            ? '操作已中止或请求超时，请重试'
            : r;
    }

    function isJobAbortResult(res) {
        if (!res) return false;
        if (res.cancelled || res.code === 'cancelled' || res.code === 'aborted') return true;
        return /已取消|已中止|aborted|user aborted/i.test(String(res.error || ''));
    }

    function clampPadMs(padMs, fallback = 350) {
        return Math.max(0, Math.min(2000, Math.round(Number(padMs) || fallback)));
    }

    function clampDurationSec(value, { min = 1, max = 600, fallback = 30 } = {}) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    /**
     * @param {{
     *   durationSec: number,
     *   padMs?: number,
     *   startMode?: string,
     *   selectedStartMs?: number|null,
     *   playheadMs?: number,
     * }} input
     */
    function planDurationWindow(input = {}) {
        const durationSec = clampDurationSec(input.durationSec);
        const padMs = clampPadMs(input.padMs);
        const startMode = String(input.startMode || 'selected');
        let startMs = 0;
        if (startMode === 'playhead') {
            startMs = Math.max(0, Math.round(Number(input.playheadMs) || 0));
        } else if (
            input.selectedStartMs != null
            && Number.isFinite(Number(input.selectedStartMs))
            && Number(input.selectedStartMs) >= 0
        ) {
            startMs = Math.round(Number(input.selectedStartMs));
        } else {
            startMs = Math.max(0, Math.round(Number(input.playheadMs) || 0));
        }
        const endMs = startMs + Math.round(durationSec * 1000);
        return {
            startMs,
            endMs,
            durationSec,
            padMs,
            startMode,
        };
    }

    /**
     * @param {{
     *   padMs?: number,
     *   videoDurationMs?: number,
     *   cueEndMsList?: number[],
     * }} input
     */
    function planFullMediaWindow(input = {}) {
        const padMs = clampPadMs(input.padMs);
        const startMs = 0;
        let endMs = Math.max(0, Math.round(Number(input.videoDurationMs) || 0));
        if (!(endMs > 0) && Array.isArray(input.cueEndMsList) && input.cueEndMsList.length) {
            endMs = Math.max(...input.cueEndMsList.map((n) => Math.round(Number(n) || 0)), startMs + 1000);
        }
        endMs = Math.max(endMs, startMs + 200);
        const durationSec = Math.round((endMs - startMs) / 1000 * 10) / 10;
        return {
            startMs,
            endMs,
            durationSec,
            padMs,
        };
    }

    function buildRetranscribeDurPreviewText({
        startLabel = '',
        endLabel = '',
        durationSec = 0,
        overlapCount = 0,
        writeSuffix = '',
    } = {}) {
        if (overlapCount > 0) {
            return `${startLabel} → ${endLabel}（${durationSec}s），将替换重合的 ${overlapCount} 条${writeSuffix}`;
        }
        return `${startLabel} → ${endLabel}（${durationSec}s），该区间暂无字幕，将插入新结果${writeSuffix}`;
    }

    function resolveRetranscribeWriteSuffix({
        writeAs = 'source',
        hasDual = false,
        dualRole = '',
    } = {}) {
        if (writeAs === 'target') {
            return hasDual ? '；写入译文轨' : '；引擎翻译覆盖当前字幕';
        }
        if (hasDual && dualRole === 'target') {
            return '；写入原文对照轨（不覆盖译文）';
        }
        return '；语音识别';
    }

    /**
     * @returns {{ title?: string, hint?: string, detail?: string, statusMessage?: string }}
     */
    function mapRetranscribeProgressUi(update = {}, ctx = {}) {
        const detail = String(update?.message || update?.detail || '').trim();
        if (!detail) return {};
        const stage = String(update?.stage || '');
        const isModel = stage === 'model' || /模型/.test(detail);
        const dualPass = !!ctx.dualPass;
        const task = String(ctx.task || '');
        const fallbackTitle = String(ctx.fallbackTitle || '重转写');
        const out = {
            detail,
            statusMessage: detail,
        };
        if (isModel) {
            out.title = '加载模型';
            out.hint = update?.warmLight
                ? '轻量模式：正在加载模型，首次或切换模型时较慢'
                : '正在加载模型到显存/内存，首次或切换模型时可能需要数十秒';
        } else if (stage === 'vad') {
            out.title = '语音检测';
            out.hint = '正在初始化语音检测…';
        } else if (stage === 'extract' || stage === 'warmup') {
            out.title = '准备音频';
        } else if (stage === 'transcribe') {
            out.title = dualPass
                ? (task === 'translate' ? '双语 · 生成译文' : '双语 · 生成原文')
                : (task === 'translate' ? '翻译中' : '识别中');
        } else if (stage === 'save' || stage === 'done') {
            out.title = '整理结果';
        } else {
            out.title = update?.warmLight ? `${fallbackTitle}（轻量）` : fallbackTitle;
        }
        if (stage === 'starting') {
            out.hint = '正在启动引擎…';
        } else if (update?.warmLight && !isModel && stage !== 'vad' && stage !== 'starting') {
            out.hint = '轻量加速已开启（Beam=1）；如需更高精度请在设置中关闭「重转写加速」';
        }
        return out;
    }

    /**
     * Collect source cues for range translate / dual pass.
     */
    function collectSourceCuesForRange({
        mode = 'range',
        startMs = 0,
        endMs = 0,
        cues = [],
        pairCues = null,
        selectedIndex = -1,
        dualActive = false,
        dualRole = '',
        getEndMs = (c) => c?.endMs,
        findBestOverlapCue = null,
    } = {}) {
        if (mode === 'cue' && selectedIndex >= 0 && selectedIndex < cues.length) {
            const cue = cues[selectedIndex];
            let text = String(cue?.text || '').trim();
            if (dualActive && dualRole === 'target' && findBestOverlapCue && pairCues?.length) {
                const hit = findBestOverlapCue(pairCues, cue.startMs, getEndMs(cue));
                const pairText = String(hit?.cue?.text || '').trim();
                if (pairText) text = pairText;
            }
            return text ? [{
                startMs: cue.startMs,
                endMs: getEndMs(cue),
                text,
            }] : [];
        }
        let list = cues;
        if (dualActive && dualRole === 'target' && pairCues?.length) {
            list = pairCues;
        }
        const out = [];
        for (const cue of list || []) {
            const c0 = Math.round(Number(cue?.startMs) || 0);
            const c1 = Math.max(c0 + 1, Math.round(Number(getEndMs(cue))));
            if (c1 <= startMs || c0 >= endMs) continue;
            const text = String(cue?.text || '').trim();
            if (text) {
                out.push({ startMs: c0, endMs: c1, text });
            }
        }
        return out;
    }

    function spliceCuesForRetranscribe(list, startMs, endMs, newCues, {
        mode = 'range',
        selectedIndex = -1,
        replaceCuesInTimeRange,
    } = {}) {
        const target = Array.isArray(list) ? list : [];
        const incoming = Array.isArray(newCues) ? newCues : [];
        let selectAt = 0;
        let replacedCount = 0;
        if (mode === 'cue' && selectedIndex >= 0 && selectedIndex < target.length) {
            target.splice(selectedIndex, 1, ...incoming);
            selectAt = selectedIndex;
            replacedCount = 1;
        } else if (typeof replaceCuesInTimeRange === 'function') {
            const w = replaceCuesInTimeRange(target, startMs, endMs, incoming);
            target.splice(0, target.length, ...(w.cues || []));
            selectAt = w.insertAt;
            replacedCount = w.replaced;
        }
        return { selectAt, replacedCount };
    }

    const api = {
        friendlyJobAbortMessage,
        isJobAbortResult,
        clampPadMs,
        clampDurationSec,
        planDurationWindow,
        planFullMediaWindow,
        buildRetranscribeDurPreviewText,
        resolveRetranscribeWriteSuffix,
        mapRetranscribeProgressUi,
        collectSourceCuesForRange,
        spliceCuesForRetranscribe,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.retranscribeRangePlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
