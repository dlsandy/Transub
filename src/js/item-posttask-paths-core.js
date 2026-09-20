/**
 * Collect editable subtitle paths for post-task polish / QC / 简繁 / preset.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubItemPosttaskPaths = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function itemPosttaskPathsFactory() {
    function pickSubtitlePath(item = {}) {
        return String(
            item.targetSubtitlePath
            || item.subtitlePath
            || item.existingSubtitle
            || '',
        ).trim();
    }

    /** @param {{ subtitlePath?, targetSubtitlePath?, bilingualSubtitlePath?, existingSubtitle? }} item */
    function collectPostBatchPaths(item = {}) {
        const paths = [];
        const seen = new Set();
        const push = (p) => {
            const v = String(p || '').trim();
            if (!v || seen.has(v) || !/\.(srt|vtt|lrc)$/i.test(v)) return;
            seen.add(v);
            paths.push(v);
        };
        push(pickSubtitlePath(item));
        push(item.bilingualSubtitlePath);
        return paths;
    }

    function resolveQcSemanticPairPath(item = {}, fixingPath = '') {
        const fixing = String(fixingPath || '').trim();
        const src = String(item?.sourceSubtitlePath || '').trim();
        if (!fixing || !src) return '';
        const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
        if (norm(fixing) === norm(src)) return '';
        const tgt = String(item?.targetSubtitlePath || pickSubtitlePath(item) || '').trim();
        if (tgt && norm(fixing) !== norm(tgt)) return '';
        return src;
    }

    return {
        pickSubtitlePath,
        collectPostBatchPaths,
        resolveQcSemanticPairPath,
    };
}));
