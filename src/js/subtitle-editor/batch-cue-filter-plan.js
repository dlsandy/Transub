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

    function normalizeRetranslateMatchText(text) {
        return String(text || '')
            .replace(/\{[^}]*\}/g, '')
            .replace(/\r\n/g, '\n')
            .trim();
    }

    /** User pattern like `...` / `…` — treat blank MT placeholders as matches. */
    function isEllipsisOnlyPattern(pattern) {
        const t = normalizeRetranslateMatchText(pattern);
        if (!t) return false;
        if (t === '…' || t === '...' || t === '⋯' || t === '……') return true;
        return /^(?:\.{2,}|…+|⋯+|．{2,}|。{2,})$/.test(t)
            || (/^[….\s⋯．。]+$/.test(t) && /[….⋯．。]/.test(t));
    }

    function isBlankOrEllipsisCueText(text) {
        const t = normalizeRetranslateMatchText(text);
        if (!t) return true;
        if (t === '…' || t === '...' || t === '⋯' || t === '……') return true;
        return /^[….\s⋯．。]+$/.test(t);
    }

    /**
     * @param {object} cue
     * @param {number} cueIndex
     * @param {{ pattern?: string, matchMode?: 'equals'|'contains', scopeIndexes?: number[]|null }} condition
     */
    function cueMatchesRetranslateTextCondition(cue, cueIndex, condition = {}) {
        const scope = condition.scopeIndexes;
        if (Array.isArray(scope) && scope.length && !scope.includes(cueIndex)) return false;
        const pattern = normalizeRetranslateMatchText(condition.pattern);
        if (!pattern) return false;
        const text = normalizeRetranslateMatchText(cue?.text);
        const mode = condition.matchMode === 'contains' ? 'contains' : 'equals';
        if (mode === 'contains') return text.includes(pattern);
        if (text === pattern) return true;
        if (isEllipsisOnlyPattern(pattern) && isBlankOrEllipsisCueText(text)) return true;
        return false;
    }

    function collectRetranslateTextMatches(cues, condition, deps = {}) {
        return collectMatchingCueIndexes(cues, condition, cueMatchesRetranslateTextCondition, deps);
    }

    function previewBatchRetranslatePlan({
        matchedIndexes = [],
        pattern = '',
        engine = 'llm',
        scope = 'all',
    } = {}) {
        const pat = normalizeRetranslateMatchText(pattern);
        if (!pat) {
            return {
                matched: 0,
                summary: '请输入补译条件（例如 … 或 ...）',
                isErr: true,
            };
        }
        const matched = Array.isArray(matchedIndexes) ? matchedIndexes : [];
        if (!matched.length) {
            return {
                matched: 0,
                summary: scope === 'selected'
                    ? '选中范围内没有符合条件的字幕'
                    : '没有符合条件的字幕',
                isErr: true,
            };
        }
        const engineLabel = engine === 'smart' || engine === 'advanced' ? '智能翻译' : '推理翻译';
        return {
            matched: matched.length,
            summary: `将用${engineLabel}重译 ${matched.length} 条（条件：仅匹配「${pat}」${isEllipsisOnlyPattern(pat) ? '及同类空白/省略占位' : ''}）`,
            isErr: false,
        };
    }

    function previewBatchDeletePlan({
        matchedIndexes = [],
        pattern = '',
        scope = 'all',
        totalCues = 0,
    } = {}) {
        const pat = normalizeRetranslateMatchText(pattern);
        if (!pat) {
            return {
                matched: 0,
                summary: '请输入删除条件（例如 … 或 ...）',
                isErr: true,
            };
        }
        const matched = Array.isArray(matchedIndexes) ? matchedIndexes : [];
        if (!matched.length) {
            return {
                matched: 0,
                summary: scope === 'selected'
                    ? '选中范围内没有符合条件的字幕'
                    : '没有符合条件的字幕',
                isErr: true,
            };
        }
        const total = Math.max(0, Math.floor(Number(totalCues) || 0));
        const remaining = Math.max(0, total - matched.length);
        const condHint = isEllipsisOnlyPattern(pat) ? '及同类空白/省略占位' : '';
        return {
            matched: matched.length,
            remaining,
            summary: `将删除 ${matched.length} 条（条件：匹配「${pat}」${condHint}）→ 剩余 ${remaining} 条`,
            isErr: false,
        };
    }

    /**
     * @param {object[]} cues
     * @param {number[]} indexes
     * @returns {{ cues: object[], removedIndexes: number[], removed: number, kept: number }}
     */
    function applyDeleteCueIndexes(cues, indexes) {
        const list = Array.isArray(cues) ? cues : [];
        const remove = new Set(
            (Array.isArray(indexes) ? indexes : [])
                .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length),
        );
        if (!remove.size) {
            return {
                cues: list.slice(),
                removedIndexes: [],
                removed: 0,
                kept: list.length,
            };
        }
        const kept = [];
        const removedIndexes = [];
        list.forEach((cue, index) => {
            if (remove.has(index)) removedIndexes.push(index);
            else kept.push(cue);
        });
        return {
            cues: kept,
            removedIndexes,
            removed: removedIndexes.length,
            kept: kept.length,
        };
    }

    /** Remap current selectedIndex after deleting indexes (same rules as editor delete). */
    function nextSelectedIndexAfterDelete(selectedIndex, removedIndexes, remainingLength) {
        const remove = new Set(
            (Array.isArray(removedIndexes) ? removedIndexes : [])
                .filter((n) => Number.isInteger(n) && n >= 0),
        );
        const rem = Math.max(0, Math.floor(Number(remainingLength) || 0));
        if (!rem) return -1;
        const sel = Number.isInteger(selectedIndex) ? selectedIndex : -1;
        if (sel < 0) return 0;
        if (!remove.has(sel)) {
            let mapped = 0;
            for (let i = 0; i < sel; i += 1) {
                if (!remove.has(i)) mapped += 1;
            }
            return Math.min(mapped, rem - 1);
        }
        const firstRemoved = Math.min(...remove);
        let mapped = 0;
        for (let i = 0; i < firstRemoved; i += 1) {
            if (!remove.has(i)) mapped += 1;
        }
        return Math.min(mapped, rem - 1);
    }

    const api = {
        cueMatchesSmartSplitCondition,
        collectSmartSplitMatches,
        previewSmartSplitPlan,
        cueMatchesSilenceSplitCondition,
        collectSilenceSplitMatches,
        previewSilenceSplitPlan,
        previewSmartAdjustSummary,
        normalizeRetranslateMatchText,
        isEllipsisOnlyPattern,
        isBlankOrEllipsisCueText,
        cueMatchesRetranslateTextCondition,
        collectRetranslateTextMatches,
        previewBatchRetranslatePlan,
        previewBatchDeletePlan,
        applyDeleteCueIndexes,
        nextSelectedIndexAfterDelete,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.batchCueFilterPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
