/**
 * Source-track freeze marker for .transub.json sidecar (pure merge helpers).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSourceFreezeMeta = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sourceFreezeMetaFactory() {
    function simpleCueHash(cues) {
        const list = Array.isArray(cues) ? cues : [];
        let h = 5381;
        for (let i = 0; i < list.length; i += 1) {
            const t = String(list[i]?.text ?? list[i]?.sourceText ?? '');
            const s = Number(list[i]?.startMs ?? list[i]?.start ?? 0);
            for (let j = 0; j < t.length; j += 1) {
                h = ((h << 5) + h) + t.charCodeAt(j);
                h |= 0;
            }
            h = ((h << 5) + h) + (Math.round(s) | 0);
            h |= 0;
        }
        return (h >>> 0).toString(16);
    }

    function buildSourceFreezePatch(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const frozenAt = options.frozenAt || new Date().toISOString();
        return {
            sourceFrozen: true,
            frozenAt,
            sourceCueCount: list.length,
            sourceCueHash: options.sourceCueHash || simpleCueHash(list),
            holdIndexes: Array.isArray(options.holdIndexes)
                ? options.holdIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
                : undefined,
            bandSummary: options.bandSummary || undefined,
        };
    }

    function applySourceFreeze(meta, cues, options = {}) {
        const base = meta && typeof meta === 'object' ? { ...meta } : {};
        const patch = buildSourceFreezePatch(cues, options);
        return {
            ...base,
            ...patch,
            updatedAt: options.updatedAt || patch.frozenAt,
        };
    }

    function clearSourceFreeze(meta, options = {}) {
        const base = meta && typeof meta === 'object' ? { ...meta } : {};
        const next = { ...base };
        next.sourceFrozen = false;
        delete next.frozenAt;
        delete next.sourceCueHash;
        if (options.clearHoldIndexes !== false) delete next.holdIndexes;
        if (options.clearBandSummary) delete next.bandSummary;
        next.unfrozenAt = options.unfrozenAt || new Date().toISOString();
        next.updatedAt = next.unfrozenAt;
        return next;
    }

    function isSourceFrozen(meta) {
        return !!(meta && typeof meta === 'object' && meta.sourceFrozen === true);
    }

    function readHoldIndexesFromMeta(meta) {
        if (!meta || typeof meta !== 'object') return [];
        return [...new Set((Array.isArray(meta.holdIndexes) ? meta.holdIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0))]
            .sort((a, b) => a - b);
    }

    return {
        simpleCueHash,
        buildSourceFreezePatch,
        applySourceFreeze,
        clearSourceFreeze,
        isSourceFrozen,
        readHoldIndexesFromMeta,
    };
}));
