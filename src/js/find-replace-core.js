/**
 * 查找匹配收集（主线程与 Worker 共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFindReplace = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function findReplaceCoreFactory() {
    const WORKER_THRESHOLD = 200;

    function escapeRegex(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildFindRegex(query, caseSensitive) {
        const flags = caseSensitive ? 'g' : 'gi';
        return new RegExp(escapeRegex(query), flags);
    }

    function shouldOffloadFind(cueCount, threshold = WORKER_THRESHOLD) {
        return (Number(cueCount) || 0) >= (Number(threshold) || WORKER_THRESHOLD);
    }

    /**
     * @returns {{ cueIdx: number, start: number, end: number }[]}
     */
    function collectFindMatches(cues, query, caseSensitive = false) {
        const q = String(query ?? '');
        if (!q) return [];
        const list = Array.isArray(cues) ? cues : [];
        const re = buildFindRegex(q, !!caseSensitive);
        const matches = [];
        for (let cueIdx = 0; cueIdx < list.length; cueIdx += 1) {
            const text = list[cueIdx]?.text ?? '';
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ cueIdx, start: m.index, end: m.index + m[0].length });
                if (m[0].length === 0) re.lastIndex += 1;
            }
        }
        return matches;
    }

    return {
        WORKER_THRESHOLD,
        escapeRegex,
        buildFindRegex,
        shouldOffloadFind,
        collectFindMatches,
    };
}));
