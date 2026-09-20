/**
 * Cast-name linker (v1 rule-based; stand-in for a future tiny name model).
 * Resolves JA spellings → target-language surface via av-glossary + i18n overrides.
 */
(function (global, factory) {
    let glossary = null;
    let pick = null;
    try {
        glossary = (typeof module !== 'undefined' && module.exports)
            ? require('./av-glossary-core')
            : (global && global.TransubAvGlossary);
    } catch {
        glossary = null;
    }
    try {
        pick = (typeof module !== 'undefined' && module.exports)
            ? require('./glossary-target-pick-core')
            : (global && global.TransubGlossaryTargetPick);
    } catch {
        pick = null;
    }
    const api = factory(glossary, pick);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtCastLink = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtCastLinkFactory(glossary, pick) {
    function resolveTargetLang(options = {}) {
        if (typeof options === 'string') return options;
        if (pick?.resolveLang) return pick.resolveLang(options);
        return String(options.targetLang || options.subtitleTargetLang || 'zh-Hans');
    }

    /**
     * Resolve one JA name to target surface.
     */
    function resolveCastSurface(src, targetLangOrOptions = 'zh-Hans') {
        const name = String(src || '').trim();
        if (!name) return '';
        if (glossary?.resolveActorNameForTarget) {
            return glossary.resolveActorNameForTarget(name, targetLangOrOptions) || '';
        }
        return '';
    }

    /**
     * Find cast mentions in JA text using optional castNames list and/or glossary lookup.
     * @param {string} text
     * @param {{ castNames?: string[], targetLang?: string, subtitleTargetLang?: string }} options
     */
    function findCastMentions(text, options = {}) {
        const raw = String(text || '');
        if (!raw) return [];
        const targetLang = resolveTargetLang(options);
        const names = Array.isArray(options.castNames)
            ? options.castNames.map((n) => String(n || '').trim()).filter(Boolean)
            : [];
        const seen = new Set();
        const out = [];

        const tryAdd = (src) => {
            const key = src.toLowerCase();
            if (seen.has(key)) return;
            if (!raw.includes(src)) return;
            seen.add(key);
            const surface = resolveCastSurface(src, { ...options, targetLang, subtitleTargetLang: targetLang });
            out.push({
                src,
                castId: src,
                surface: surface || undefined,
            });
        };

        // Longer names first to prefer full spellings
        const ordered = [...names].sort((a, b) => b.length - a.length);
        for (const n of ordered) tryAdd(n);

        // Prefer explicit cast list; optional override aliases only (avoid scanning full actor pack)
        if (!ordered.length && Array.isArray(options.extraAliases)) {
            for (const n of [...options.extraAliases].map((x) => String(x || '').trim()).filter(Boolean)
                .sort((a, b) => b.length - a.length)) {
                if (n.length < 2) continue;
                tryAdd(n);
            }
        }

        return out;
    }

    /**
     * Replace known JA cast spellings in translated text with target surfaces (QA thin pass).
     */
    function unifyCastNamesInText(text, options = {}) {
        let cur = String(text ?? '');
        if (!cur) return { text: cur, changed: false, hits: [] };
        const mentions = findCastMentions(
            String(options.sourceText || options.jaText || cur),
            options,
        );
        const hits = [];
        let changed = false;
        for (const m of mentions) {
            const src = String(m.src || '');
            const surface = String(m.surface || '');
            if (!src || !surface || src === surface) continue;
            if (cur.includes(src)) {
                cur = cur.split(src).join(surface);
                changed = true;
                hits.push({ src, surface });
            }
        }
        return { text: cur, changed, hits };
    }

    return {
        resolveCastSurface,
        findCastMentions,
        unifyCastNamesInText,
    };
}));
