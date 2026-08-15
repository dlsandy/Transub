/**
 * Subtitle editor — smart / silence batch cue filter + preview plan (pure).
 */
(function (global) {
    function cueMatchesSmartSplitCondition(cue, cueIndex, condition, deps = {}) {
        const text = String(cue?.text || '').trim();
        if (!text) return false;
        const getCps = deps.getCps || (() => null);
        const getCueDurMs = deps.getCueDurMs || ((c) => (c?.endMs || 0) - (c?.startMs || 0));
        const charLen = deps.charLen || ((s) => String(s || '').length);
        const lineLen = deps.lineLen || charLen;
        const selectedIndex = deps.selectedIndex;
        const c = condition || {};
        switch (c.condition) {
            case 'selected':
                return cueIndex === selectedIndex;
            case 'cps_above': {
                const cps = getCps(cue);
                return cps != null && cps > c.cpsAbove;
            }
            case 'line_long':
                return lineLen(text) > c.lineLen;
            case 'dur_long':
                return getCueDurMs(cue) > Math.round(c.durLongSec * 1000);
            case 'chars_long':
                return charLen(text) > c.charsLong;
            default:
                return false;
        }
    }

    function collectMatchingCueIndexes(cues, condition, matcher, deps = {}) {
        const out = [];
        (Array.isArray(cues) ? cues : []).forEach((cue, index) => {
            if (matcher(cue, index, condition, deps)) out.push(index);
        });
        return out;
    }

    function collectSmartSplitMatches(cues, condition, deps = {}) {
        return collectMatchingCueIndexes(cues, condition, cueMatchesSmartSplitCondition, deps);
    }

    /**
     * @param {number[]} matchedIndexes
     * @param {object[]} cues
     * @param {object} condition
     * @param {(mode: string, cue: object, opts: object) => { cues?: object[] }} planCueSplit
     */
    function previewSmartSplitPlan(matchedIndexes, cues, condition, planCueSplit) {
        const matched = Array.isArray(matchedIndexes) ? matchedIndexes : [];
        if (!matched.length) {
            return {
                matched: 0,
                splitCount: 0,
                added: 0,
                summary: '没有符合条件的字幕',
            };
        }
        let splitCount = 0;
        let added = 0;
        const opts = {
            smartMaxChars: condition.smartMaxChars,
            smartLineChars: condition.smartLineChars,
            useCps: condition.useCps,
        };
        for (const idx of matched) {
            const planned = planCueSplit?.('smart', cues[idx], opts);
            if (planned?.cues && planned.cues.length >= 2) {
                splitCount += 1;
                added += planned.cues.length - 1;
            }
        }
        if (!splitCount) {
            return {
                matched: matched.length,
                splitCount: 0,
                added: 0,
                summary: `${matched.length} 条符合筛选，但均无需再分割`,
            };
        }
        const nextLen = cues.length + added;
        return {
            matched: matched.length,
            splitCount,
            added,
            summary: `将分割 ${splitCount} 条（共匹配 ${matched.length} 条）→ ${cues.length} 条变为 ${nextLen} 条`,
        };
    }

    function cueMatchesSilenceSplitCondition(cue, cueIndex, condition, deps = {}) {
        const canSilence = deps.canSilenceSplitCue || (() => true);
        if (!canSilence(cue)) return false;
        const text = String(cue?.text || '').trim();
        const getCps = deps.getCps || (() => null);
        const getCueDurMs = deps.getCueDurMs || ((c) => (c?.endMs || 0) - (c?.startMs || 0));
        const charLen = deps.charLen || ((s) => String(s || '').length);
        const selectedIndex = deps.selectedIndex;
        const c = condition || {};
        switch (c.condition) {
            case 'all':
                return true;
            case 'selected':
                return cueIndex === selectedIndex;
            case 'dur_long':
                return getCueDurMs(cue) > Math.round(c.durLongSec * 1000);
            case 'cps_above': {
                const cps = getCps(cue);
                return cps != null && cps > c.cpsAbove;
            }
            case 'chars_long':
                return charLen(text) > c.charsLong;
            default:
                return false;
        }
    }

    function collectSilenceSplitMatches(cues, condition, deps = {}) {
        return collectMatchingCueIndexes(cues, condition, cueMatchesSilenceSplitCondition, deps);
    }

    function previewSilenceSplitPlan({
        matchedIndexes = [],
        hasVideo = false,
        hasFfmpegDetectSilence = false,
        condition = {},
        selectedIndex = -1,
    } = {}) {
        if (!hasVideo) {
            return { matched: 0, summary: '请先关联视频', isErr: true };
        }
        if (!hasFfmpegDetectSilence) {
            return { matched: 0, summary: '当前环境不支持静音分析', isErr: true };
        }
        const matched = Array.isArray(matchedIndexes) ? matchedIndexes : [];
        if (!matched.length) {
            return {
                matched: 0,
                summary: '没有可分析的字幕（需有文本、含空格/换行且时长足够）',
                isErr: true,
            };
        }
        if (condition.condition === 'selected' && selectedIndex < 0) {
            return {
                matched: 0,
                summary: '当前没有选中的字幕条目',
                isErr: true,
            };
        }
        return {
            matched: matched.length,
            summary: `将对 ${matched.length} 条字幕逐条分析静音（需 FFmpeg，执行时将显示进度）`,
            isErr: false,
        };
    }

    /**
     * @param {{ affected?: number, overlapFixed?: number, cpsFixed?: number, minDurFixed?: number, maxDurFixed?: number }} result
     */
    function previewSmartAdjustSummary(result = {}) {
        if (!result.affected) {
            return { affected: 0, summary: '当前字幕无需调整' };
        }
        const parts = [];
        if (result.overlapFixed) parts.push(`重合 ${result.overlapFixed} 处`);
        if (result.cpsFixed) parts.push(`CPS ${result.cpsFixed} 条`);
        if (result.minDurFixed) parts.push(`过短 ${result.minDurFixed} 条`);
        if (result.maxDurFixed) parts.push(`过长 ${result.maxDurFixed} 条`);
        return {
            affected: result.affected,
            summary: `预计影响 ${result.affected} 条：${parts.join(' · ') || '将更新时长'}`,
        };
    }

    const api = {
        cueMatchesSmartSplitCondition,
        collectSmartSplitMatches,
        previewSmartSplitPlan,
        cueMatchesSilenceSplitCondition,
        collectSilenceSplitMatches,
        previewSilenceSplitPlan,
        previewSmartAdjustSummary,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.batchCueFilterPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
