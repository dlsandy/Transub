/**
 * Smart-translate hybrid MT: Qwen film brief + Sakura / GalTransl sentence MT
 * (Hy-MT2 only when the user picks it explicitly).
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
    /** Prefer larger GalTransl / Sakura when the user did not pick a translate-only model. Hy-MT2 is opt-in only. */
    const PREFERRED_HYBRID_MT_IDS = Object.freeze([
        'sakura-galtransl-14b-q6k',
        'sakura-galtransl-14b-q4km',
        'sakura-galtransl-14b',
        'sakura-14b-q6k',
        'sakura-14b-q4km',
        'sakura-14b',
        'sakura-14b-qwen3',
        'sakura-galtransl-7b-q6k',
        'sakura-galtransl-7b',
        'sakura-8b-qwen3',
        'sakura-7b',
        'sakura-galtransl-v4-4b',
        'sakura-1.5b',
    ]);

    /** Korean source → ZH 成片. */
    const PREFERRED_HYBRID_MT_IDS_KO_ZH = Object.freeze([
        'sakura-ln-korean-14b',
        'sakura-ln-korean-7b',
        'translategemma-4-sub-e4b',
        'translategemma-12b',
        'translategemma-4b',
        'hunyuan-mt-chimera-7b-abliterated',
        'hunyuan-mt-7b-abliterated',
        'hy-mt15-7b-abliterated',
    ]);

    /** Korean source → JA 成片. */
    const PREFERRED_HYBRID_MT_IDS_KO_JA = Object.freeze([
        'sakura-ln-ko2ja-14b',
        'translategemma-4-sub-e4b',
        'translategemma-12b',
        'translategemma-4b',
        'hunyuan-mt-chimera-7b-abliterated',
        'hunyuan-mt-7b-abliterated',
        'hy-mt15-7b-abliterated',
    ]);

    /** Non-ZH 成片：多语字幕 MT（永不自动选 Sakura/Gal/Hy-MT2）. Soft-AV prefers Sub E4B. */
    const PREFERRED_HYBRID_MT_IDS_INTL = Object.freeze([
        'translategemma-4-sub-e4b',
        'translategemma-12b',
        'translategemma-4b',
        'translategemma-27b',
        'hunyuan-mt-chimera-7b-abliterated',
        'hunyuan-mt-7b-abliterated',
        'hy-mt15-7b-abliterated',
    ]);

    /** Soft-AV + intl: Sub E4B first (colloquial / less refusal), then larger TG. */
    const PREFERRED_HYBRID_MT_IDS_INTL_SOFT = Object.freeze([
        'translategemma-4-sub-e4b',
        'translategemma-4b',
        'translategemma-12b',
        'hunyuan-mt-chimera-7b-abliterated',
        'hunyuan-mt-7b-abliterated',
        'hy-mt15-7b-abliterated',
        'translategemma-27b',
    ]);

    const EXPLICIT_NON_JA = new Set([
        'en', 'eng', 'english',
        'ko', 'kr', 'kor', 'korean',
        'zh', 'cn', 'chinese', 'zh-cn', 'zh-tw', 'zh-hk',
        'de', 'fr', 'es', 'ru', 'vi', 'th', 'id', 'pt', 'it',
        'nl', 'pl', 'tr', 'ar', 'hi', 'sv', 'fi', 'da', 'no',
    ]);

    function isKoreanSource(language, cues) {
        const lang = String(language || '').trim().toLowerCase();
        if (lang === 'ko' || lang === 'kr' || lang === 'kor' || lang === 'korean'
            || lang.startsWith('ko-') || lang.startsWith('kr-')) {
            return true;
        }
        if (lang && lang !== 'auto' && lang !== 'unknown') return false;
        const list = Array.isArray(cues) ? cues : [];
        const sample = list.slice(0, 48).map((c) => String(c?.text || '')).join('');
        return /[\uac00-\ud7af]/.test(sample);
    }

    function isJaSubtitleTarget(lang) {
        const n = String(lang || '').trim().toLowerCase();
        return n === 'ja' || n.startsWith('ja');
    }
    function loadMtTargetRoute() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./mt-target-route-core');
            }
        } catch (_) { /* ignore */ }
        try {
            return (typeof globalThis !== 'undefined' ? globalThis.TransubMtTargetRoute : null);
        } catch (_) {
            return null;
        }
    }

    function isZhSubtitleTarget(lang) {
        const mtRoute = loadMtTargetRoute();
        if (mtRoute?.resolveMtTargetRoute) {
            return !!mtRoute.resolveMtTargetRoute({
                subtitleTargetLang: lang,
                targetLang: lang,
            }).isZhTarget;
        }
        return /^zh/i.test(String(lang || ''));
    }

    function modelAllowedForHybridTarget(modelId, targetOpts = {}) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        const mtRoute = loadMtTargetRoute();
        if (mtRoute?.isMtModelAllowedForTarget) {
            return !!mtRoute.isMtModelAllowedForTarget(id, targetOpts);
        }
        return true;
    }

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
        if (/^hy-?mt/i.test(id)) return true;
        if (/translategemma|translate[-_]?gemma/i.test(id)) return true;
        if (/hunyuan|chimera/i.test(id)) return true;
        try {
            const cat = (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
            if (cat?.isSakuraMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        try {
            const managed = (typeof module !== 'undefined' && module.exports)
                ? require('./advanced-managed-llm-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubAdvancedManagedLlmCatalog : null);
            if (managed?.isTranslateOnlyModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    /**
     * When smartTranslateModelId is translate-only: skip brief/polish and force sentence MT.
     * @param {object} [input]
     * @param {{ isTranslateOnly?: (id: string) => boolean }} [deps]
     * @returns {object}
     */
    function applySmartTranslateLiteOptions(input = {}, deps = {}) {
        const p = input && typeof input === 'object' ? { ...input } : {};
        const probe = String(p.smartTranslateModelId || p.modelId || '').trim();
        if (!probe) return p;
        const isLite = typeof deps.isTranslateOnly === 'function'
            ? !!deps.isTranslateOnly(probe)
            : isTranslateOnlyLike(probe);
        if (!isLite) return p;
        p.skipFilmBrief = true;
        p.smartTranslatePlotPolish = false;
        p.plotPolish = false;
        p._smartTranslateLite = true;
        p.smartTranslateHybridMt = true;
        p.hybridMtModelId = probe;
        if (!String(p.engineLlmMtModel || '').trim()) {
            p.engineLlmMtModel = probe;
        }
        p._hybridChunkOnly = true;
        p._hybridSkipLlmBrief = true;
        return p;
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

    function isHyMtModelId(modelId) {
        return /^hy-?mt2/i.test(String(modelId || '').trim());
    }

    /**
     * Resolve sentence-level hybrid MT id.
     * - Empty preferred → auto-pick installed specialist (ZH: Sakura/Gal; intl: TranslateGemma…).
     * - Preferred translate-only → use it when installed + allowed for 成片目标语; else fall through.
     * - Preferred general chat/LLM (Qwen/星火/…) → return '' so caller skips hybrid
     *   (`not_translate_only`) instead of silently substituting GalTransl.
     * @param {{
     *   preferredId?: string,
     *   installedIds?: string[],
     *   subtitleTargetLang?: string,
     *   targetLang?: string,
     *   chineseSubtitleVariant?: string,
     *   language?: string,
     * }} input
     * @returns {string}
     */
    function pickHybridMtModelId({
        preferredId,
        installedIds,
        subtitleTargetLang,
        targetLang,
        chineseSubtitleVariant,
        language,
        contentProfile,
        senseProfile,
        strongAv,
    } = {}) {
        const installed = (Array.isArray(installedIds) ? installedIds : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        const lower = new Map(installed.map((id) => [id.toLowerCase(), id]));
        const targetOpts = {
            subtitleTargetLang: subtitleTargetLang || targetLang,
            targetLang: targetLang || subtitleTargetLang,
            chineseSubtitleVariant,
            language,
        };
        const zhTarget = isZhSubtitleTarget(targetOpts.subtitleTargetLang || targetOpts.targetLang || 'zh-Hans');
        const jaTarget = isJaSubtitleTarget(targetOpts.subtitleTargetLang || targetOpts.targetLang || '');
        const softAv = (() => {
            const p = String(contentProfile || senseProfile || '').trim().toLowerCase();
            if (p === 'av_soft' || strongAv === true) return true;
            return false;
        })();
        const koSrc = isKoreanSource(language);
        let preferList;
        if (koSrc && zhTarget) preferList = PREFERRED_HYBRID_MT_IDS_KO_ZH;
        else if (koSrc && jaTarget) preferList = PREFERRED_HYBRID_MT_IDS_KO_JA;
        else if (zhTarget) preferList = PREFERRED_HYBRID_MT_IDS;
        else preferList = softAv ? PREFERRED_HYBRID_MT_IDS_INTL_SOFT : PREFERRED_HYBRID_MT_IDS_INTL;
        const allowed = (id) => modelAllowedForHybridTarget(id, targetOpts);

        const pref = String(preferredId || '').trim();
        if (pref) {
            if (!isTranslateOnlyLike(pref)) {
                // Explicit non-specialist pick must not be remapped to GalTransl.
                return '';
            }
            const hit = lower.get(pref.toLowerCase());
            if (hit && allowed(hit)) return hit;
            // Preferred specialist missing or blocked for target → auto below.
        }
        for (const id of preferList) {
            const hit = lower.get(id.toLowerCase());
            if (hit && allowed(hit)) return hit;
        }
        // Auto fallback: any installed translate-only allowed for target (Hy-MT2 opt-in only on ZH).
        for (const id of installed) {
            if (!isTranslateOnlyLike(id) || !allowed(id)) continue;
            if (zhTarget && isHyMtModelId(id)) continue;
            return id;
        }
        return '';
    }

    /**
     * @param {{ enabled?: *, language?: string, cues?: Array, modelId?: string }} input
     * @returns {{ ok: boolean, reason: string }}
     */
    function shouldUseHybridChunkMt({
        enabled,
        language,
        cues,
        modelId,
        targetLang,
        subtitleTargetLang,
        chineseSubtitleVariant,
    } = {}) {
        if (!normalizeHybridMtOption(enabled)) {
            return { ok: false, reason: 'disabled' };
        }
        const targetOpts = {
            targetLang,
            subtitleTargetLang,
            chineseSubtitleVariant,
            language,
        };
        try {
            const mtRoute = loadMtTargetRoute();
            if (mtRoute && !mtRoute.allowSmartHybridForTarget(targetOpts)) {
                return { ok: false, reason: 'intl_target' };
            }
        } catch { /* optional */ }
        const id = String(modelId || '').trim();
        if (!id) return { ok: false, reason: 'no_model' };
        if (!isTranslateOnlyLike(id)) return { ok: false, reason: 'not_translate_only' };
        if (!modelAllowedForHybridTarget(id, targetOpts)) {
            return { ok: false, reason: 'model_target' };
        }
        if (!isJapaneseSource(language, cues)) {
            // Multilingual MT (TranslateGemma / Hunyuan Chimera) may run lite without JA source.
            if (/translategemma|translate[-_]?gemma|hunyuan|chimera/i.test(id)) {
                return { ok: true, reason: '' };
            }
            // Korean pair specialists (LN-Korean / LN-ko2ja).
            if (isKoreanSource(language, cues)
                && (/ln[-_]?korean|ln[-_]?ko2ja|sakura[-_]?ln[-_]/i.test(id)
                    || modelAllowedForHybridTarget(id, targetOpts))) {
                try {
                    const cat = (typeof module !== 'undefined' && module.exports)
                        ? require('./sakura-mt-catalog-core')
                        : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
                    const fam = cat?.resolvePromptFamily?.(id);
                    if (fam === 'ln-korean' || fam === 'ln-ko2ja') {
                        return { ok: true, reason: '' };
                    }
                } catch { /* ignore */ }
                if (/ln[-_]?korean|ln[-_]?ko2ja|sakura[-_]?ln[-_]/i.test(id)) {
                    return { ok: true, reason: '' };
                }
            }
            return { ok: false, reason: 'not_ja' };
        }
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
        PREFERRED_HYBRID_MT_IDS_KO_ZH,
        PREFERRED_HYBRID_MT_IDS_KO_JA,
        PREFERRED_HYBRID_MT_IDS_INTL,
        PREFERRED_HYBRID_MT_IDS_INTL_SOFT,
        normalizeHybridMtOption,
        isTranslateOnlyLike,
        isJapaneseSource,
        isKoreanSource,
        pickHybridMtModelId,
        shouldUseHybridChunkMt,
        glossaryObjectFromTerms,
        extractCastNames,
        looksLikeLocalLlamaBaseUrl,
        shouldReleaseChatLlmForHybridChunk,
        shouldSkipLlmFilmBrief,
        applySmartTranslateLiteOptions,
    };
}));
