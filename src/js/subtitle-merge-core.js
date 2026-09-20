/**
 * Merge adjacent subtitle cues (editor + tests).
 */
(function (global) {
    function defaultCueEndMs(cue) {
        if (!cue) return 0;
        return cue.endMs != null ? cue.endMs : cue.startMs + 2000;
    }

    function normalizeSelectedIndexes(indexes, cueCount) {
        const max = Number(cueCount) || 0;
        return [...new Set((indexes || []).map((i) => Number(i)))]
            .filter((i) => Number.isInteger(i) && i >= 0 && i < max)
            .sort((a, b) => a - b);
    }

    function areConsecutiveSortedIndexes(indexes) {
        if (!Array.isArray(indexes) || indexes.length < 2) return false;
        for (let i = 1; i < indexes.length; i += 1) {
            if (indexes[i] !== indexes[i - 1] + 1) return false;
        }
        return true;
    }

    function canMergeSelectedIndexes(indexes, cueCount) {
        const sorted = normalizeSelectedIndexes(indexes, cueCount);
        return sorted.length >= 2 && areConsecutiveSortedIndexes(sorted);
    }

    function buildMergedCue(cues, sorted, options = {}) {
        const cueEndMs = typeof options.cueEndMs === 'function' ? options.cueEndMs : defaultCueEndMs;
        const lineJoin = options.lineJoin != null ? String(options.lineJoin) : '\n';
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstCue = cues[first];
        const lastCue = cues[last];
        if (!firstCue || !lastCue) return null;
        const parts = sorted
            .map((idx) => String(cues[idx]?.text || '').trim())
            .filter(Boolean);
        const text = dedupeJoinCueTexts(parts, lineJoin);
        return {
            ...firstCue,
            startMs: Number(firstCue.startMs) || 0,
            endMs: cueEndMs(lastCue),
            text,
        };
    }

    /**
     * Join cue texts for merge while dropping exact / prefix-subset duplicates
     * (A + A B → A B; A B + A → A B; A + A → A).
     */
    function dedupeJoinCueTexts(parts, lineJoin = '\n') {
        const list = Array.isArray(parts) ? parts.map((p) => String(p || '').trim()).filter(Boolean) : [];
        if (list.length <= 1) return list.join(lineJoin);
        const norm = (t) => String(t || '').replace(/[\s。．.!！?？…，,、~～]+/g, '');
        const out = [];
        for (const p of list) {
            if (!out.length) {
                out.push(p);
                continue;
            }
            const prev = out[out.length - 1];
            const pk = norm(prev);
            const ck = norm(p);
            if (!ck) continue;
            if (pk === ck) continue;
            if (pk.length >= 4 && ck.startsWith(pk)) {
                out[out.length - 1] = p;
                continue;
            }
            if (ck.length >= 4 && pk.startsWith(ck)) continue;
            out.push(p);
        }
        return out.join(lineJoin);
    }

    /**
     * Pure plan: returns next cues array without mutating input.
     * @param {Array<{ startMs: number, endMs?: number|null, text?: string }>} cues
     * @param {number[]} indexes
     * @param {{ cueEndMs?: (cue: object) => number, lineJoin?: string }} [options]
     */
    function planMergeSelectedCues(cues, indexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const sorted = normalizeSelectedIndexes(indexes, list.length);

        if (sorted.length < 2) {
            return { error: '请至少选中两条相邻字幕以合并' };
        }
        if (!areConsecutiveSortedIndexes(sorted)) {
            return { error: '只能合并连续相邻的选中条目' };
        }

        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const mergedCue = buildMergedCue(list, sorted, options);
        if (!mergedCue) {
            return { error: '选中条目无效' };
        }

        const next = list.slice(0, first).concat([mergedCue], list.slice(last + 1));
        return {
            cues: next,
            mergedCue,
            mergedIndex: first,
            removedCount: last - first,
            deleteCount: last - first + 1,
        };
    }

    /**
     * Mutate `cues` in place: splice out [first..last] and insert one merged cue.
     * @returns {ReturnType<typeof planMergeSelectedCues>}
     */
    function applyMergeSelectedCues(cues, indexes, options = {}) {
        if (!Array.isArray(cues)) {
            return { error: '字幕列表无效' };
        }
        const plan = planMergeSelectedCues(cues, indexes, options);
        if (plan.error) return plan;

        const first = plan.mergedIndex;
        const deleteCount = plan.deleteCount;
        cues.splice(first, deleteCount, plan.mergedCue);
        return {
            cues,
            mergedCue: plan.mergedCue,
            mergedIndex: first,
            removedCount: plan.removedCount,
            deleteCount,
        };
    }

    const api = {
        defaultCueEndMs,
        normalizeSelectedIndexes,
        areConsecutiveSortedIndexes,
        canMergeSelectedIndexes,
        dedupeJoinCueTexts,
        planMergeSelectedCues,
        applyMergeSelectedCues,
    };

    global.TransubSubtitleMerge = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global));
