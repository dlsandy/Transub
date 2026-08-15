/**
 * Smart-translate hybrid MT: Qwen film brief + Sakura/GalTransl sentence MT.
 * Pure helpers (no network / filesystem).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslateHybrid = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslateHybridCoreFactory() {
    /** Prefer larger GalTransl / Sakura when the user did not pick a translate-only model. */
    const PREFERRED_HYBRID_MT_IDS = Object.freeze([
        'sakura-galtransl-7b-q6k',
        'sakura-galtransl-7b',
        'sakura-7b',
        'sakura-galtransl-v4-4b',
        'sakura-1.5b',
    ]);

    const EXPLICIT_NON_JA = new Set([
        'en', 'eng', 'english',
        'ko', 'kr', 'kor', 'korean',
        'zh', 'cn', 'chinese', 'zh-cn', 'zh-tw', 'zh-hk',
        'de', 'fr', 'es', 'ru', 'vi', 'th', 'id', 'pt', 'it',
        'nl', 'pl', 'tr', 'ar', 'hi', 'sv', 'fi', 'da', 'no',
    ]);

    /**
     * Default ON. Only explicit false/off disables.
     * @param {*} value
     * @returns {boolean}
     */
    function normalizeHybridMtOption(value) {
        if (value === false || value === 0) return false;
        const s = String(value == null ? '' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
        return true;
    }

    function isTranslateOnlyLike(modelId) {
        const id = String(modelId || '').trim().toLowerCase();
        if (!id) return false;
        if (/(^|[/_\s.-])sakura([/_\s.-]|$)/i.test(id)) return true;
        if (/galtransl/i.test(id)) return true;
        try {
            const cat = (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
            if (cat?.isSakuraMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    /**
     * @param {string} [language]
     * @param {Array} [cues]
     * @returns {boolean}
     */
    function isJapaneseSource(language, cues) {
        const lang = String(language || '').trim().toLowerCase();
        if (lang === 'ja' || lang === 'jp' || lang === 'jpn' || lang === 'japanese'
            || lang.startsWith('ja-') || lang.startsWith('jp-')) {
            return true;
        }
        if (lang && lang !== 'auto' && lang !== 'unknown' && EXPLICIT_NON_JA.has(lang)) {
            return false;
        }
        const list = Array.isArray(cues) ? cues : [];
        const sample = list.slice(0, 48).map((c) => String(c?.text || '')).join('');
        if (/[\u3040-\u30ff]/.test(sample)) return true;
        if (lang && lang !== 'auto' && lang !== 'unknown') return false;
        return false;
    }

    /**
     * @param {{ preferredId?: string, installedIds?: string[] }} input
     * @returns {string}
     */
    function pickHybridMtModelId({ preferredId, installedIds } = {}) {
        const installed = (Array.isArray(installedIds) ? installedIds : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        const lower = new Map(installed.map((id) => [id.toLowerCase(), id]));
        const pref = String(preferredId || '').trim();
        if (pref && isTranslateOnlyLike(pref)) {
            const hit = lower.get(pref.toLowerCase());
            if (hit) return hit;
        }
        for (const id of PREFERRED_HYBRID_MT_IDS) {
            const hit = lower.get(id.toLowerCase());
            if (hit) return hit;
        }
        for (const id of installed) {
            if (isTranslateOnlyLike(id)) return id;
        }
        return '';
    }

    /**
     * @param {{ enabled?: *, language?: string, cues?: Array, modelId?: string }} input
     * @returns {{ ok: boolean, reason: string }}
     */
    function shouldUseHybridChunkMt({ enabled, language, cues, modelId } = {}) {
        if (!normalizeHybridMtOption(enabled)) {
            return { ok: false, reason: 'disabled' };
        }
        const id = String(modelId || '').trim();
        if (!id) return { ok: false, reason: 'no_model' };
        if (!isTranslateOnlyLike(id)) return { ok: false, reason: 'not_translate_only' };
        if (!isJapaneseSource(language, cues)) return { ok: false, reason: 'not_ja' };
        return { ok: true, reason: '' };
    }

    /**
     * @param {Array<{term?:string,src?:string,translation?:string,dst?:string,info?:string,note?:string}>} terms
     * @returns {{ entries: object[] }}
     */
    function glossaryObjectFromTerms(terms) {
        const entries = [];
        const seen = new Set();
        for (const t of Array.isArray(terms) ? terms : []) {
            const term = String(t?.term || t?.src || '').trim();
            if (!term || seen.has(term)) continue;
            seen.add(term);
            entries.push({
                term,
                translation: String(t?.translation || t?.dst || term).trim() || term,
                info: String(t?.info || t?.note || '').trim(),
            });
        }
        return { entries };
    }

    /**
     * Canonical character names for a Sakura cast line.
     * Identity pairs (真琴→真琴) are skipped by the term table; they still belong here.
     * @param {Array} terms
     * @param {{ limit?: number }} [options]
     * @returns {string[]}
     */
    function extractCastNames(terms, options = {}) {
        const limit = Math.max(4, Math.min(24, Number(options.limit) || 16));
        const out = [];
        const seen = new Set();
        const push = (name) => {
            const s = String(name || '').trim().replace(/さん$/u, '');
            if (!s || s.length > 12) return;
            if (/[→>]/.test(s) || /[\n\r]/.test(s)) return;
            if (seen.has(s)) return;
            seen.add(s);
            out.push(s);
        };
        for (const t of Array.isArray(terms) ? terms : []) {
            const src = String(t?.term || t?.src || '').trim();
            const dst = String(t?.translation || t?.dst || '').trim();
            if (dst) push(dst);
            else if (src) push(src);
        }
        return out.slice(0, limit);
    }

    function looksLikeLocalLlamaBaseUrl(baseUrl) {
        return /127\.0\.0\.1|localhost/i.test(String(baseUrl || ''));
    }

    /**
     * After a local chat-model film brief, free VRAM before loading Sakura.
     * Skip for cloud BYOK and for later engine batches (no chat server URL).
     */
    function shouldReleaseChatLlmForHybridChunk(input = {}) {
        if (!looksLikeLocalLlamaBaseUrl(input.baseUrl)) return false;
        return shouldUseHybridChunkMt({
            enabled: input.enabled,
            language: input.language,
            cues: input.cues,
            modelId: input.modelId,
        }).ok;
    }

    /**
     * Local hybrid: skip chat-model film brief (honorific harvest is enough for Sakura).
     * Keep LLM brief for cloud BYOK when a key is present.
     */
    function shouldSkipLlmFilmBrief(input = {}) {
        if (input.filmBrief) return false;
        if (input.skipFilmBrief) return true;
        const hybrid = shouldUseHybridChunkMt({
            enabled: input.enabled,
            language: input.language,
            cues: input.cues,
            modelId: input.modelId,
        });
        if (!hybrid.ok) return false;
        const source = String(input.llmSource || '').trim().toLowerCase();
        if (source === 'byok' && input.hasByokKey) return false;
        return true;
    }

    return {
        PREFERRED_HYBRID_MT_IDS,
        normalizeHybridMtOption,
        isTranslateOnlyLike,
        isJapaneseSource,
        pickHybridMtModelId,
        shouldUseHybridChunkMt,
        glossaryObjectFromTerms,
        extractCastNames,
        looksLikeLocalLlamaBaseUrl,
        shouldReleaseChatLlmForHybridChunk,
        shouldSkipLlmFilmBrief,
    };
}));
