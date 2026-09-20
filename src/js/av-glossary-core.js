/**
 * AV actor + domain glossaries (mdcx actors + SakuraDict).
 * Data: shared/av-actor-glossary.json, shared/av-domain-glossary.json
 * Optional i18n: shared/av-glossary-i18n-overrides.json (en/ko by src)
 */
(function (global, factory) {
    let pickApi = null;
    try {
        pickApi = (typeof module !== 'undefined' && module.exports)
            ? require('./glossary-target-pick-core')
            : (global && global.TransubGlossaryTargetPick);
    } catch {
        pickApi = null;
    }
    const api = factory(pickApi);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAvGlossary = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function avGlossaryCoreFactory(pickApi) {
    const KANA_RE = /[\u3040-\u30ff]/;

    /** @type {{ version: number, entries: Array<object> }|null} */
    let actorPack = null;
    /** @type {Map<string, object>|null} */
    let actorLookup = null;
    /** @type {Array<object>|null} */
    let actorEntriesSorted = null;

    /** @type {{ version: number, entries: Array<object> }|null} */
    let domainPack = null;
    /** @type {Array<object>|null} */
    let domainEntriesSorted = null;

    /** @type {Map<string, object>} */
    let actorI18nBySrc = new Map();
    /** @type {Map<string, object>} */
    let domainI18nBySrc = new Map();

    function resolveSharedPath(fileName) {
        if (typeof module !== 'undefined' && module.exports) {
            try {
                const path = require('path');
                const fs = require('fs');
                const candidates = [
                    path.join(__dirname, '..', '..', 'shared', fileName),
                    path.join(process.cwd(), 'shared', fileName),
                ];
                try {
                    const { getProjectRoot } = require('../../electron/app-paths');
                    candidates.unshift(path.join(getProjectRoot(), 'shared', fileName));
                } catch (_) { /* browser / tests */ }
                for (const p of candidates) {
                    if (fs.existsSync(p)) return p;
                }
            } catch (_) { /* ignore */ }
        }
        return '';
    }

    function loadJsonFile(fileName) {
        const filePath = resolveSharedPath(fileName);
        if (!filePath) return null;
        try {
            const fs = require('fs');
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (_) {
            return null;
        }
    }

    function loadI18nOverrides() {
        actorI18nBySrc = new Map();
        domainI18nBySrc = new Map();
        const pack = loadJsonFile('av-glossary-i18n-overrides.json');
        if (!pack || typeof pack !== 'object') return;
        for (const row of pack.actors || []) {
            const src = String(row?.src || '').trim();
            if (!src) continue;
            actorI18nBySrc.set(src, row);
        }
        for (const row of pack.domain || []) {
            const src = String(row?.src || '').trim();
            if (!src) continue;
            domainI18nBySrc.set(src, row);
        }
    }

    function mergeI18nOntoRow(row, kind) {
        const src = String(row?.src || '').trim();
        if (!src) return row;
        const overlay = kind === 'domain' ? domainI18nBySrc.get(src) : actorI18nBySrc.get(src);
        if (!overlay) return row;
        const out = { ...row };
        for (const key of ['en', 'ko', 'ja', 'zh-Hant', 'zh-TW', 'zh-HK']) {
            const v = String(overlay[key] || '').trim();
            if (v) out[key] = v;
        }
        if (overlay.translations && typeof overlay.translations === 'object') {
            out.translations = { ...(row.translations || {}), ...overlay.translations };
        }
        return out;
    }

    function ensureActorIndex() {
        if (actorLookup && actorEntriesSorted) return;
        loadI18nOverrides();
        actorPack = loadJsonFile('av-actor-glossary.json') || { version: 1, entries: [] };
        const entries = Array.isArray(actorPack.entries) ? actorPack.entries : [];
        actorLookup = new Map();
        const enriched = [];
        for (const raw of entries) {
            const row = mergeI18nOntoRow(raw, 'actor');
            const src = String(row?.src || '').trim();
            const zh = String(row?.zh || '').trim();
            if (!src || !zh || src === zh) continue;
            if (!actorLookup.has(src)) actorLookup.set(src, row);
            enriched.push(row);
        }
        actorEntriesSorted = enriched.slice().sort(
            (a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'),
        );
    }

    function ensureDomainIndex() {
        if (domainEntriesSorted) return;
        loadI18nOverrides();
        domainPack = loadJsonFile('av-domain-glossary.json') || { version: 1, entries: [] };
        const entries = Array.isArray(domainPack.entries) ? domainPack.entries : [];
        domainEntriesSorted = entries
            .map((raw) => mergeI18nOntoRow(raw, 'domain'))
            .slice()
            .sort((a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'));
    }

    function resolveTargetLang(options = {}) {
        if (pickApi?.resolveLang) return pickApi.resolveLang(options);
        return String(options.targetLang || options.subtitleTargetLang || 'zh-Hans');
    }

    /**
     * Resolve JA actress / stage name → preferred ZH surface (compat).
     * @param {string} src
     * @returns {string}
     */
    function resolveActorZhName(src) {
        const s = String(src || '').trim();
        if (!s) return '';
        ensureActorIndex();
        const row = actorLookup.get(s);
        return row ? String(row.zh || '').trim() : '';
    }

    /**
     * Resolve actress name for an arbitrary subtitle target language.
     * @param {string} src
     * @param {string|object} [targetLangOrOptions]
     */
    function resolveActorNameForTarget(src, targetLangOrOptions = 'zh-Hans') {
        const s = String(src || '').trim();
        if (!s) return '';
        ensureActorIndex();
        let row = actorLookup.get(s);
        if (!row && actorI18nBySrc.has(s)) {
            row = mergeI18nOntoRow({ src: s, zh: '' }, 'actor');
        }
        if (!row) return '';
        if (pickApi?.pickGlossaryTranslation) {
            return pickApi.pickGlossaryTranslation(row, targetLangOrOptions, {
                kind: 'actor',
                allowRomajiFallback: true,
            });
        }
        return String(row.zh || '').trim();
    }

    /**
     * True when `src` appears as a whole token in `hay`, not as a proper
     * substring of a longer same-script run (セックス inside セックスレス).
     * Hiragana after a katakana stem (セックスしたい) is allowed.
     * @param {string} hay
     * @param {string} src
     */
    function isWholeGlossaryTokenMatch(hay, src) {
        const h = String(hay || '');
        const s = String(src || '');
        if (!h || !s) return false;
        const isKata = (ch) => /[\u30A0-\u30FFー]/.test(ch);
        const isKanji = (ch) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch);
        const isLatin = (ch) => /[a-zA-Z0-9]/.test(ch);
        const edgeContinues = (ch) => {
            if (!ch) return false;
            if (isKata(s[0]) || isKata(s[s.length - 1])) return isKata(ch);
            if ([...s].some(isKanji)) return isKanji(ch);
            if ([...s].some(isLatin)) return isLatin(ch);
            return /[\u3040-\u309F]/.test(ch);
        };
        let from = 0;
        while (from <= h.length - s.length) {
            const idx = h.indexOf(s, from);
            if (idx < 0) return false;
            const before = idx > 0 ? h[idx - 1] : '';
            const after = idx + s.length < h.length ? h[idx + s.length] : '';
            if (!edgeContinues(before) && !edgeContinues(after)) return true;
            from = idx + 1;
        }
        return false;
    }

    /**
     * @param {string} text
     * @param {Array<object>} rows
     * @param {{ maxTerms?: number, info?: string, targetLang?: string|object, kind?: string }} [options]
     * @returns {Array<{term:string,translation:string,info:string}>}
     */
    function matchRowsInText(text, rows, options = {}) {
        const hay = String(text || '');
        if (!hay) return [];
        const max = Math.max(1, Math.min(48, Number(options.maxTerms) || 24));
        const infoDefault = String(options.info || '').trim();
        const kind = String(options.kind || 'any');
        const target = options.targetLang != null
            ? options.targetLang
            : (options.subtitleTargetLang != null ? options.subtitleTargetLang : 'zh-Hans');
        const out = [];
        const seenSrc = new Set();
        for (const row of rows) {
            const src = String(row?.src || '').trim();
            if (!src || seenSrc.has(src)) continue;
            // Prefer includes for speed, then reject katakana/kanji substring poison
            // (セックス→做爱 must not fire on セックスレス).
            if (!hay.includes(src) || !isWholeGlossaryTokenMatch(hay, src)) continue;
            let translation = '';
            if (pickApi?.pickGlossaryTranslation) {
                translation = pickApi.pickGlossaryTranslation(row, target, {
                    kind,
                    allowRomajiFallback: kind === 'actor',
                });
            } else {
                translation = String(row?.zh || '').trim();
            }
            if (!translation || translation === src) continue;
            // Guard: never inject Han surfaces into non-zh targets
            const lang = resolveTargetLang(typeof target === 'object' ? target : { targetLang: target });
            if (pickApi?.isZhLang && !pickApi.isZhLang(lang) && /[\u4e00-\u9fff]/.test(translation)) {
                continue;
            }
            seenSrc.add(src);
            out.push({
                term: src,
                translation,
                info: String(row?.info || infoDefault || '术语').trim(),
            });
            if (out.length >= max) break;
        }
        return out;
    }

    /**
     * Match AV actress names appearing in subtitle text.
     * @param {string} text
     * @param {{ maxTerms?: number, targetLang?: string|object, subtitleTargetLang?: string }} [options]
     */
    function matchActorTermsInText(text, options = {}) {
        ensureActorIndex();
        return matchRowsInText(text, actorEntriesSorted, {
            maxTerms: options.maxTerms,
            info: '女优人名',
            kind: 'actor',
            targetLang: options.targetLang,
            subtitleTargetLang: options.subtitleTargetLang,
        });
    }

    /**
     * Match SakuraDict AV/domain phrases in text.
     * @param {string} text
     * @param {{ maxTerms?: number, targetLang?: string|object, subtitleTargetLang?: string }} [options]
     */
    function matchDomainTermsInText(text, options = {}) {
        ensureDomainIndex();
        return matchRowsInText(text, domainEntriesSorted, {
            maxTerms: options.maxTerms,
            info: 'AV用语',
            kind: 'domain',
            targetLang: options.targetLang,
            subtitleTargetLang: options.subtitleTargetLang,
        });
    }

    function termKey(t) {
        return String(t?.term || t?.src || '').trim().toLowerCase();
    }

    /**
     * Merge user + matched AV glossary rows for Sakura/smart prompts.
     * User/project terms win on duplicate src.
     * Pass targetLang / subtitleTargetLang so intl targets get en/ko (not zh).
     */
    function mergeAvGlossaryTerms(userTerms, sourceText, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        if (opts.avGlossary === false || opts.avActorGlossary === false) {
            return Array.isArray(userTerms) ? userTerms.slice() : [];
        }
        const base = Array.isArray(userTerms) ? userTerms.slice() : [];
        const seen = new Set(base.map(termKey).filter(Boolean));
        const out = base.slice();
        const target = {
            targetLang: opts.targetLang,
            subtitleTargetLang: opts.subtitleTargetLang,
            chineseSubtitleVariant: opts.chineseSubtitleVariant,
            targetLanguage: opts.targetLanguage,
        };

        const actorMax = Number(opts.maxActorTerms) || 20;
        const domainMax = Number(opts.maxDomainTerms) || 12;
        const text = String(sourceText || '');

        for (const t of matchActorTermsInText(text, {
            maxTerms: actorMax,
            targetLang: target,
        })) {
            const k = termKey(t);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(t);
        }
        if (opts.avDomainGlossary !== false) {
            for (const t of matchDomainTermsInText(text, {
                maxTerms: domainMax,
                targetLang: target,
            })) {
                const k = termKey(t);
                if (!k || seen.has(k)) continue;
                seen.add(k);
                out.push(t);
            }
        }
        return out;
    }

    function getActorStats() {
        ensureActorIndex();
        return {
            ...(actorPack?.stats || {}),
            version: actorPack?.version || 1,
            builtAt: actorPack?.builtAt || null,
            source: actorPack?.source || '',
            i18nActorOverrides: actorI18nBySrc.size,
        };
    }

    function getDomainStats() {
        ensureDomainIndex();
        return {
            ...(domainPack?.stats || {}),
            version: domainPack?.version || 1,
            builtAt: domainPack?.builtAt || null,
            source: domainPack?.source || '',
            i18nDomainOverrides: domainI18nBySrc.size,
        };
    }

    /** @param {{ reload?: boolean }} [options] */
    function resetAvGlossaryCache(options = {}) {
        if (!options.reload) return;
        actorPack = null;
        actorLookup = null;
        actorEntriesSorted = null;
        domainPack = null;
        domainEntriesSorted = null;
        actorI18nBySrc = new Map();
        domainI18nBySrc = new Map();
    }

    return {
        resolveActorZhName,
        resolveActorNameForTarget,
        matchActorTermsInText,
        matchDomainTermsInText,
        mergeAvGlossaryTerms,
        getActorStats,
        getDomainStats,
        resetAvGlossaryCache,
    };
}));
