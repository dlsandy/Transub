/**
 * Qwen3 TEN island batch hints in main-window progress (parse + sticky tag).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubQwenAsrProgress = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function qwenAsrProgressFactory() {
    const BATCH_RE = /批\s*(\d+)\s*[\(（]([^)）]+)[\)）]/;

    function isQwenIslandProgressDetail(detail) {
        return /TEN|FireRed|人声帧|Qwen3-ASR/i.test(String(detail || ''));
    }

    /**
     * @param {unknown} detail
     * @returns {{ batch: number, mode: string, tag: string }|null}
     */
    function parseBatchFromDetail(detail) {
        const m = String(detail || '').match(BATCH_RE);
        if (!m) return null;
        const batch = Number(m[1]);
        if (!Number.isFinite(batch) || batch <= 0) return null;
        const mode = String(m[2] || '').trim().toLowerCase();
        return {
            batch: Math.floor(batch),
            mode,
            tag: `批 ${Math.floor(batch)} (${mode})`,
        };
    }

    /**
     * Keep ``批 N (mode)`` visible across TEN frame ticks after the first island plan line.
     * @param {unknown} detail
     * @param {{ batch: number, mode: string, tag: string }|null} sticky
     */
    function applyProgressDetail(detail, sticky) {
        const raw = String(detail || '');
        const parsed = parseBatchFromDetail(raw);
        let nextSticky = sticky && sticky.tag ? sticky : null;
        if (parsed && isQwenIslandProgressDetail(raw)) {
            nextSticky = parsed;
        }
        if (!nextSticky?.tag) {
            return { sticky: nextSticky, detail: raw };
        }
        if (parsed) {
            return { sticky: nextSticky, detail: raw };
        }
        if (isQwenIslandProgressDetail(raw) && !raw.includes(nextSticky.tag)) {
            return { sticky: nextSticky, detail: `${raw} · ${nextSticky.tag}` };
        }
        return { sticky: nextSticky, detail: raw };
    }

    return {
        BATCH_RE,
        isQwenIslandProgressDetail,
        parseBatchFromDetail,
        applyProgressDetail,
    };
}));
