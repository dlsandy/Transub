/**
 * JA-side concept layer scaffold (target-lang independent).
 * v1: cast mention linking + empty concept slots for later termbase.
 * Adult concept ids / terms must stay opaque — do not put NSFW literals here.
 */
(function (global, factory) {
    let castLink = null;
    try {
        castLink = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-cast-link-core')
            : (global && global.TransubMtCastLink);
    } catch {
        castLink = null;
    }
    const api = factory(castLink);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtConcept = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtConceptFactory(castLink) {
    /**
     * Annotate a JA source cue for downstream MT / QA.
     * @returns {{
     *   text: string,
     *   castMentions: Array<{src:string, castId?:string, surface?:string}>,
     *   concepts: Array<{id:string, span?:string}>,
     *   polarity: null|string,
     *   flags: string[],
     * }}
     */
    function annotateJaCue(text, options = {}) {
        const raw = String(text ?? '');
        const flags = ['concept_v1'];
        const castMentions = castLink?.findCastMentions
            ? castLink.findCastMentions(raw, options)
            : [];
        if (castMentions.length) flags.push('cast');
        return {
            text: raw,
            castMentions,
            concepts: [],
            polarity: null,
            flags,
        };
    }

    /**
     * Resolve a conceptId to a target-language term from options.termbase.
     * termbase shape: { [conceptId]: { zh?: string, en?: string, ko?: string } | string }
     */
    function resolveConceptTerm(conceptId, targetLangOrOptions = 'zh-Hans', termbase = null) {
        const id = String(conceptId || '').trim();
        if (!id || !termbase || typeof termbase !== 'object') return '';
        const row = termbase[id];
        if (row == null) return '';
        if (typeof row === 'string') return row;
        let pick = null;
        try {
            pick = (typeof module !== 'undefined' && module.exports)
                ? require('./glossary-target-pick-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubGlossaryTargetPick : null);
        } catch { pick = null; }
        if (pick?.pickGlossaryTranslation) {
            return pick.pickGlossaryTranslation(row, targetLangOrOptions) || '';
        }
        const lang = String(
            typeof targetLangOrOptions === 'string'
                ? targetLangOrOptions
                : (targetLangOrOptions?.targetLang || targetLangOrOptions?.subtitleTargetLang || 'zh-Hans'),
        );
        if (/^en/i.test(lang)) return String(row.en || '').trim();
        if (/^ko/i.test(lang)) return String(row.ko || row.en || '').trim();
        return String(row.zh || row['zh-Hans'] || '').trim();
    }

    /**
     * Build a thin term lock list for MT prompts from annotations + termbase.
     */
    function buildTermLocksFromAnnotation(annotation, targetLang, termbase = null) {
        const locks = [];
        const ann = annotation && typeof annotation === 'object' ? annotation : {};
        for (const m of ann.castMentions || []) {
            const src = String(m.src || '').trim();
            const surface = String(m.surface || '').trim();
            if (src && surface && surface !== src) {
                locks.push({ src, tgt: surface, kind: 'cast' });
            }
        }
        for (const c of ann.concepts || []) {
            const id = String(c.id || '').trim();
            const tgt = resolveConceptTerm(id, targetLang, termbase);
            const src = String(c.span || '').trim();
            if (id && tgt) locks.push({ src: src || id, tgt, kind: 'concept', conceptId: id });
        }
        return locks;
    }

    return {
        annotateJaCue,
        resolveConceptTerm,
        buildTermLocksFromAnnotation,
    };
}));
