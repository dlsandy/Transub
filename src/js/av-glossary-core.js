/**
 * AV actor + domain glossaries (mdcx actors + SakuraDict).
 * Data: shared/av-actor-glossary.json, shared/av-domain-glossary.json
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAvGlossary = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function avGlossaryCoreFactory() {
    const KANA_RE = /[\u3040-\u30ff]/;

    /** @type {{ version: number, entries: Array<{src:string,zh:string,canonical?:string,info?:string}> }|null} */
    let actorPack = null;
    /** @type {Map<string, string>|null} */
    let actorLookup = null;
    /** @type {Array<{src:string,zh:string,info?:string}>|null} */
    let actorEntriesSorted = null;

    /** @type {{ version: number, entries: Array<{src:string,zh:string,info?:string}> }|null} */
    let domainPack = null;
    /** @type {Array<{src:string,zh:string,info?:string}>|null} */
    let domainEntriesSorted = null;

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

    function ensureActorIndex() {
        if (actorLookup && actorEntriesSorted) return;
        actorPack = loadJsonFile('av-actor-glossary.json') || { version: 1, entries: [] };
        const entries = Array.isArray(actorPack.entries) ? actorPack.entries : [];
        actorLookup = new Map();
        for (const row of entries) {
            const src = String(row?.src || '').trim();
            const zh = String(row?.zh || '').trim();
            if (!src || !zh || src === zh) continue;
            if (!actorLookup.has(src)) actorLookup.set(src, zh);
        }
        actorEntriesSorted = entries.slice().sort(
            (a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'),
        );
    }

    function ensureDomainIndex() {
        if (domainEntriesSorted) return;
        domainPack = loadJsonFile('av-domain-glossary.json') || { version: 1, entries: [] };
        const entries = Array.isArray(domainPack.entries) ? domainPack.entries : [];
        domainEntriesSorted = entries.slice().sort(
            (a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'),
        );
    }

    /**
     * Resolve JA actress / stage name → preferred ZH surface.
     * @param {string} src
     * @returns {string}
     */
    function resolveActorZhName(src) {
        const s = String(src || '').trim();
        if (!s) return '';
        ensureActorIndex();
        return actorLookup.get(s) || '';
    }

    /**
     * @param {string} text
     * @param {Array<{src:string,zh:string,info?:string}>} rows
     * @param {{ maxTerms?: number, info?: string }} [options]
     * @returns {Array<{term:string,translation:string,info:string}>}
     */
    function matchRowsInText(text, rows, options = {}) {
        const hay = String(text || '');
        if (!hay) return [];
        const max = Math.max(1, Math.min(48, Number(options.maxTerms) || 24));
        const infoDefault = String(options.info || '').trim();
        const out = [];
        const seenSrc = new Set();
        for (const row of rows) {
            const src = String(row?.src || '').trim();
            const zh = String(row?.zh || '').trim();
            if (!src || !zh || src === zh) continue;
            if (seenSrc.has(src)) continue;
            if (!hay.includes(src)) continue;
            seenSrc.add(src);
            out.push({
                term: src,
                translation: zh,
                info: String(row?.info || infoDefault || '术语').trim(),
            });
            if (out.length >= max) break;
        }
        return out;
    }

    /**
     * Match AV actress names appearing in subtitle text.
     * @param {string} text
     * @param {{ maxTerms?: number }} [options]
     */
    function matchActorTermsInText(text, options = {}) {
        ensureActorIndex();
        return matchRowsInText(text, actorEntriesSorted, {
            maxTerms: options.maxTerms,
            info: '女优人名',
        });
    }

    /**
     * Match SakuraDict AV/domain phrases in text.
     * @param {string} text
     * @param {{ maxTerms?: number }} [options]
     */
    function matchDomainTermsInText(text, options = {}) {
        ensureDomainIndex();
        return matchRowsInText(text, domainEntriesSorted, {
            maxTerms: options.maxTerms,
            info: 'AV用语',
        });
    }

    function termKey(t) {
        return String(t?.term || t?.src || '').trim().toLowerCase();
    }

    /**
     * Merge user + matched AV glossary rows for Sakura/smart prompts.
     * User/project terms win on duplicate src.
     * @param {Array<{term?:string,translation?:string,src?:string,dst?:string,info?:string}>} userTerms
     * @param {string} sourceText
     * @param {{ maxActorTerms?: number, maxDomainTerms?: number, avGlossary?: boolean }} [options]
     */
    function mergeAvGlossaryTerms(userTerms, sourceText, options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        if (opts.avGlossary === false || opts.avActorGlossary === false) {
            return Array.isArray(userTerms) ? userTerms.slice() : [];
        }
        const base = Array.isArray(userTerms) ? userTerms.slice() : [];
        const seen = new Set(base.map(termKey).filter(Boolean));
        const out = base.slice();

        const actorMax = Number(opts.maxActorTerms) || 20;
        const domainMax = Number(opts.maxDomainTerms) || 12;
        const text = String(sourceText || '');

        for (const t of matchActorTermsInText(text, { maxTerms: actorMax })) {
            const k = termKey(t);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(t);
        }
        if (opts.avDomainGlossary !== false) {
            for (const t of matchDomainTermsInText(text, { maxTerms: domainMax })) {
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
        };
    }

    function getDomainStats() {
        ensureDomainIndex();
        return {
            ...(domainPack?.stats || {}),
            version: domainPack?.version || 1,
            builtAt: domainPack?.builtAt || null,
            source: domainPack?.source || '',
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
    }

    return {
        resolveActorZhName,
        matchActorTermsInText,
        matchDomainTermsInText,
        mergeAvGlossaryTerms,
        getActorStats,
        getDomainStats,
        resetAvGlossaryCache,
    };
}));
