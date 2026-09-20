/**
 * MT routing by 成片目标语 (independent of uiLocale).
 * Helsinki Opus-MT has been removed; allowOpus is always false.
 * Pair specialists: JA→ZH (Sakura/Gal/Hy-MT), KO→ZH (LN-Korean), KO→JA (LN-ko2ja).
 * TranslateGemma / Chimera remain multilingual.
 */
(function (global, factory) {
    let targetLangCore = null;
    try {
        targetLangCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-target-lang-core')
            : (global && global.TransubSubtitleTargetLang);
    } catch {
        targetLangCore = null;
    }
    const api = factory(targetLangCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtTargetRoute = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtTargetRouteFactory(targetLangCore) {
    /** Kept for detection/stripping only — never recommended or applied. */
    const OPUS_MT_BY_PAIR = Object.freeze({
        'ja|zh': 'opus-mt-ja-zh',
        'en|zh': 'opus-mt-en-zh',
        'ko|zh': 'opus-mt-ko-zh',
        'de|zh': 'opus-mt-de-zh',
        'es|zh': 'opus-mt-es-zh',
        'fi|zh': 'opus-mt-fi-zh',
        'sv|zh': 'opus-mt-sv-zh',
        'ja|en': 'opus-mt-ja-en',
    });

    const OPUS_REMOVED_MSG = '机器翻译（Opus）已移除，请改用推理翻译或智能翻译';

    function resolveTargetLang(options = {}) {
        if (targetLangCore?.resolveSubtitleTargetLang) {
            return targetLangCore.resolveSubtitleTargetLang(options);
        }
        return String(options.subtitleTargetLang || options.targetLang || 'zh-Hans');
    }

    function isZhTarget(lang) {
        if (targetLangCore?.isZhSubtitleTarget) return targetLangCore.isZhSubtitleTarget(lang);
        return /^zh/i.test(String(lang || ''));
    }

    function targetLanguageLabel(lang) {
        if (targetLangCore?.subtitleTargetLangLabel) {
            return targetLangCore.subtitleTargetLangLabel(lang);
        }
        return String(lang || 'zh-Hans');
    }

    function engineApiTargetCode(lang) {
        const n = String(lang || '');
        if (isZhTarget(n)) return 'zh';
        if (n === 'en' || /^en/i.test(n)) return 'en';
        if (n === 'ko' || /^ko/i.test(n)) return 'ko';
        if (n === 'ja' || /^ja/i.test(n)) return 'ja';
        return 'zh';
    }

    /** 成片支持句级混合：中文（Sakura/Gal）或英/日/韩（TranslateGemma 等多语专训）. */
    function isHybridCapableTarget(lang) {
        if (isZhTarget(lang)) return true;
        const code = engineApiTargetCode(lang);
        return code === 'en' || code === 'ja' || code === 'ko';
    }

    function normalizeSourceLang(raw) {
        const s = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
        if (!s || s === 'auto' || s === 'unknown') return '';
        if (s === 'jp' || s === 'jpn' || s === 'japanese') return 'ja';
        if (s === 'eng' || s === 'english') return 'en';
        if (s === 'kr' || s === 'kor' || s === 'korean') return 'ko';
        if (s === 'cn' || s === 'chinese') return 'zh';
        return s;
    }

    function normalizeTranslateMode(raw) {
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'sakura' || m === 'engine') return 'llm';
        if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'llm') return 'llm';
        return 'llm';
    }

    function isProTranslateMode(raw) {
        const m = normalizeTranslateMode(raw);
        return m === 'smart' || m === 'dialog';
    }

    function isOpusMtId(id) {
        const s = String(id || '').trim().toLowerCase();
        if (!s) return false;
        return /^opus[-_]?mt[-_]/i.test(s) || s.includes('opus-mt-');
    }

    function isSakuraOrGalMtId(id) {
        const s = String(id || '').trim().toLowerCase();
        if (!s) return false;
        // Multilingual TranslateGemma must not be treated as pair specialists.
        if (/translategemma|translate[-_]?gemma/i.test(s)) return false;
        if (/^sakura-/i.test(s) || /galtransl/i.test(s) || /^hy-?mt/i.test(s)) return true;
        try {
            const cat = (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
            if (cat?.isPairSpecialistMtModel?.(s) || cat?.isJaZhOnlyMtModel?.(s)) return true;
            if (cat?.resolvePromptFamily?.(s) === 'translategemma') return false;
            if (cat?.resolvePromptFamily?.(s) === 'translategemmasub') return false;
            if (cat?.resolvePromptFamily?.(s) === 'hunyuan') return false;
            if (cat?.isSakuraMtModel?.(s)) {
                const fam = cat.resolvePromptFamily?.(s);
                return fam === 'sakura' || fam === 'galtransl' || fam === 'hymt'
                    || fam === 'ln-korean' || fam === 'ln-ko2ja';
            }
        } catch { /* ignore */ }
        return false;
    }

    /** Always empty — Opus catalog is retired. */
    function resolveOpusMtModelId() {
        return '';
    }

    function resolveMtTargetRoute(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const targetLang = resolveTargetLang(o);
        const zh = isZhTarget(targetLang);
        const hybridCapable = isHybridCapableTarget(targetLang);
        const translateMode = normalizeTranslateMode(
            o.translateMode
            || (o.smartTranslate
                ? (o.smartTranslateHybridMt === false ? 'dialog' : 'smart')
                : '')
            || 'llm',
        );
        const label = targetLanguageLabel(targetLang);
        const engineTargetLanguage = engineApiTargetCode(targetLang);
        const opusModelId = '';
        const allowOpus = false;
        const src = normalizeSourceLang(o.language || o.sourceLanguage);
        /** Pair-specialist sentence hybrid: ZH 成片, or KO→JA. */
        const allowSakuraHybrid = zh || (engineTargetLanguage === 'ja' && src === 'ko');
        const disableHybridMt = !hybridCapable;

        if (zh) {
            return {
                targetLang,
                isZhTarget: true,
                engineTargetLanguage,
                targetLanguageLabel: label,
                allowOpus,
                allowSakuraHybrid,
                opusModelId,
                translateMode,
                effectiveTranslateMode: translateMode,
                forceLlm: !isProTranslateMode(translateMode),
                disableHybridMt: false,
                reason: '',
            };
        }

        const reason = allowSakuraHybrid
            ? ''
            : (hybridCapable
                ? `成片目标为${label}：日→中专训不可用；韩片可选用 LN-ko2ja（成片日）或 TranslateGemma 等多语专训 / 智能翻译。`
                : `成片目标为${label}：请使用通用推理模型、智能翻译或混合翻译。`);

        return {
            targetLang,
            isZhTarget: false,
            engineTargetLanguage,
            targetLanguageLabel: label,
            allowOpus,
            allowSakuraHybrid,
            opusModelId,
            translateMode,
            effectiveTranslateMode: isProTranslateMode(translateMode) ? translateMode : 'llm',
            forceLlm: !isProTranslateMode(translateMode),
            disableHybridMt,
            reason,
        };
    }

    function applyMtTargetRouteToOptions(options = {}, deps = {}) {
        const route = resolveMtTargetRoute(options);
        const out = { ...(options && typeof options === 'object' ? options : {}) };
        out.subtitleTargetLang = route.targetLang;
        out.targetLang = route.targetLang;
        out.targetLanguage = out.targetLanguage || route.targetLanguageLabel;
        out.engineOpusMtModel = '';
        try {
            const fill = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-short-fill-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtShortFill : null);
            if (fill?.dualTargetSuffixFromLang) {
                out.dualTargetSuffix = fill.dualTargetSuffixFromLang({
                    subtitleTargetLang: route.targetLang,
                });
            }
        } catch { /* optional */ }

        const mt = String(out.engineMtModel || '').trim();
        const llmSlot = String(out.engineLlmMtModel || '').trim();
        const isLlm = typeof deps.isLlmMtId === 'function'
            ? deps.isLlmMtId
            : (id) => {
                const s = String(id || '');
                if (!s || isOpusMtId(s)) return false;
                if (isSakuraOrGalMtId(s)) return true;
                return /^(qwen|llama|mistral|gemma|translategemma|chatglm|glm|yi-|deepseek|phi)/i.test(s);
            };
        const pickGeneralLlm = () => {
            if (llmSlot && isLlm(llmSlot) && !isSakuraOrGalMtId(llmSlot)) return llmSlot;
            if (mt && isLlm(mt) && !isSakuraOrGalMtId(mt) && !isOpusMtId(mt)) return mt;
            if (llmSlot && isLlm(llmSlot)) return llmSlot;
            if (mt && isLlm(mt) && !isOpusMtId(mt)) return mt;
            return '';
        };

        // Strip any leftover Opus id
        if (isOpusMtId(mt)) {
            out.engineMtModel = pickGeneralLlm();
        }

        if (route.isZhTarget) {
            if (!isProTranslateMode(route.translateMode) && !out.smartTranslate) {
                out.translateMode = 'llm';
            }
            if (isOpusMtId(out.engineMtModel)
                || (isSakuraOrGalMtId(out.engineMtModel) && !isMtModelAllowedForTarget(out.engineMtModel, out, deps))) {
                out.engineMtModel = pickGeneralLlm() || pickFallbackMtModelId(out, {
                    installedIds: Array.isArray(deps.installedIds) ? deps.installedIds : [],
                    preferId: recallLastMtForTarget(out.lastMtByTarget, out),
                    isLlmMtId: deps.isLlmMtId,
                });
                if (out.engineLlmMtModel && isSakuraOrGalMtId(out.engineLlmMtModel)
                    && !isMtModelAllowedForTarget(out.engineLlmMtModel, out, deps)) {
                    out.engineLlmMtModel = out.engineMtModel;
                }
            }
            const hasUsableMt = !!(out.engineMtModel && isLlm(out.engineMtModel) && !isOpusMtId(out.engineMtModel));
            const blockedNativeOpus = !out.smartTranslate
                && !hasUsableMt
                && (isOpusMtId(mt) || String(options?.translateMode || '').toLowerCase() === 'engine');
            return {
                options: out,
                route,
                blockedNativeOpus,
                intlMtError: blockedNativeOpus ? OPUS_REMOVED_MSG : '',
            };
        }

        if (route.disableHybridMt) {
            out.smartTranslateHybridMt = false;
        }

        // Strip wrong-direction Opus / pair specialists for intl LLM / smart paths
        if (isOpusMtId(out.engineMtModel)
            || (isSakuraOrGalMtId(out.engineMtModel) && !isMtModelAllowedForTarget(out.engineMtModel, out, deps))) {
            out.engineMtModel = pickGeneralLlm() || pickFallbackMtModelId(out, {
                installedIds: Array.isArray(deps.installedIds) ? deps.installedIds : [],
                preferId: recallLastMtForTarget(out.lastMtByTarget, out),
                isLlmMtId: deps.isLlmMtId,
            });
            if (out.engineLlmMtModel && isSakuraOrGalMtId(out.engineLlmMtModel)
                && !isMtModelAllowedForTarget(out.engineLlmMtModel, out, deps)) {
                out.engineLlmMtModel = out.engineMtModel;
            }
        }

        if (route.forceLlm && !out.smartTranslate) {
            out.translateMode = 'llm';
            if (!out.engineMtModel) {
                out.engineMtModel = pickGeneralLlm();
            }
        }

        const hasUsableMt = !!(out.engineMtModel && isLlm(out.engineMtModel) && !isOpusMtId(out.engineMtModel));
        const wasOpusOnly = isOpusMtId(mt)
            || String(options?.translateMode || '').toLowerCase() === 'engine';
        const blockedNativeOpus = !out.smartTranslate && !hasUsableMt;

        return {
            options: out,
            route,
            blockedNativeOpus,
            intlMtError: blockedNativeOpus
                ? (wasOpusOnly ? OPUS_REMOVED_MSG : (route.reason || OPUS_REMOVED_MSG))
                : '',
        };
    }

    function allowSmartHybridForTarget(options = {}) {
        const route = resolveMtTargetRoute(options);
        return !route.disableHybridMt;
    }

    /**
     * Single capability matrix for UI recommend / dropdown filter / start gate.
     * @param {object} [options]
     */
    function resolveMtCapability(options = {}) {
        const route = resolveMtTargetRoute(options);
        const src = normalizeSourceLang(options.language || options.sourceLanguage);
        const tgt = route.engineTargetLanguage || 'zh';
        const allowJaZh = !!(route.isZhTarget && (!src || src === 'ja'));
        const allowKoZh = !!(route.isZhTarget && src === 'ko');
        const allowKoJa = !!(tgt === 'ja' && src === 'ko');
        const allowSakuraModels = allowJaZh || allowKoZh || allowKoJa;
        const allowHybridMt = !route.disableHybridMt;
        let defaultAutoFallbackId = 'qwen25-7b';
        if (allowKoZh) defaultAutoFallbackId = 'sakura-ln-korean-7b';
        else if (allowKoJa) defaultAutoFallbackId = 'sakura-ln-ko2ja-14b';
        else if (allowJaZh) defaultAutoFallbackId = 'sakura-1.5b';
        else if (allowHybridMt) defaultAutoFallbackId = 'translategemma-4b';

        let sakuraDisableReason = '';
        if (!allowSakuraModels) {
            if (route.isZhTarget) {
                sakuraDisableReason = src && src !== 'ja' && src !== 'ko'
                    ? '当前片源无匹配专训模型，请使用通用推理 / TranslateGemma'
                    : '非日语片源请使用通用推理模型';
            } else if (tgt === 'ja') {
                sakuraDisableReason = '成片日语：韩片可用 LN-ko2ja；其它片源请用多语专训或通用推理';
            } else {
                sakuraDisableReason = `成片 ${route.targetLanguageLabel || '非中文'}：请使用多语专训（TranslateGemma 等）或通用推理模型`;
            }
        }

        return {
            ...route,
            sourceLang: src || '',
            allowSakuraModels,
            allowJaZhSpecialists: allowJaZh,
            allowKoZhSpecialists: allowKoZh,
            allowKoJaSpecialists: allowKoJa,
            allowHybridMt,
            allowGeneralLlm: true,
            /** Concrete id only when auto-select has no installed hit (download hint). */
            defaultAutoFallbackId,
            zhOnlyUiHints: !route.isZhTarget && !allowKoJa,
            hybridDisableReason: allowHybridMt
                ? ''
                : (route.isZhTarget
                    ? (src && src !== 'ja' && src !== 'ko' ? '当前片源：句级混合已禁用' : '')
                    : `成片 ${route.targetLanguageLabel || '非中文'}：当前目标语不支持句级混合`),
            sakuraDisableReason,
        };
    }

    function isGeneralLlmMtId(id, deps = {}) {
        const s = String(id || '').trim();
        if (!s || isOpusMtId(s) || isSakuraOrGalMtId(s)) return false;
        if (typeof deps.isLlmMtId === 'function') return !!deps.isLlmMtId(s);
        return /^(qwen|llama|mistral|gemma|translategemma|chatglm|glm|yi-|deepseek|phi)/i.test(s)
            || /instruct|chat|llm/i.test(s);
    }

    function loadSakuraCatalog() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
        } catch {
            return null;
        }
    }

    /** Multilingual sentence MT (TranslateGemma / Hunyuan Chimera) — OK for non-ZH 成片. */
    function isMultilingualSentenceMtId(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (/translategemma|translate[-_]?gemma/i.test(id)) return true;
        if (/hunyuan|chimera/i.test(id)) return true;
        try {
            const cat = loadSakuraCatalog();
            const fam = cat?.resolvePromptFamily?.(id);
            return fam === 'translategemma' || fam === 'translategemmasub' || fam === 'hunyuan';
        } catch {
            return false;
        }
    }

    /**
     * Empty id = auto (always allowed). Opus never allowed.
     * Pair specialists require matching source→target; multilingual always OK.
     */
    function isMtModelAllowedForTarget(modelId, options = {}, deps = {}) {
        const id = String(modelId || '').trim();
        if (!id) return true;
        if (isOpusMtId(id)) return false;
        if (isMultilingualSentenceMtId(id)) return true;
        const cap = resolveMtCapability(options);
        const src = cap.sourceLang || normalizeSourceLang(options.language || options.sourceLanguage);
        const tgt = cap.engineTargetLanguage || engineApiTargetCode(resolveTargetLang(options));
        try {
            const cat = loadSakuraCatalog();
            if (cat?.mtModelSupportsPair) {
                if (cat.isPairSpecialistMtModel?.(id) || cat.isJaZhOnlyMtModel?.(id) || isSakuraOrGalMtId(id)) {
                    return !!cat.mtModelSupportsPair(id, src, tgt);
                }
            }
            if (cat?.isJaZhOnlyMtModel?.(id)) return !!cap.allowJaZhSpecialists;
        } catch { /* ignore */ }
        if (isSakuraOrGalMtId(id)) {
            try {
                const cat = loadSakuraCatalog();
                if (cat?.mtModelSupportsPair) return !!cat.mtModelSupportsPair(id, src, tgt);
            } catch { /* ignore */ }
            return !!cap.allowSakuraModels;
        }
        return true;
    }

    /**
     * Short reason when a model must be disabled for the current 成片目标语 / 片源.
     * Empty string = allowed.
     */
    function mtModelBlockReasonForTarget(modelId, options = {}, deps = {}) {
        const id = String(modelId || '').trim();
        if (!id || isMtModelAllowedForTarget(id, options, deps)) return '';
        if (isOpusMtId(id)) return '机器翻译（Opus）已移除';
        const cap = resolveMtCapability(options);
        try {
            const cat = loadSakuraCatalog();
            const pair = cat?.resolveMtPair?.(id);
            if (pair) {
                const pairLabel = `${pair.source}→${pair.target}`;
                if (cap.sourceLang && pair.source !== cap.sourceLang) {
                    return `专训 ${pairLabel}：与当前片源不匹配`;
                }
                if (cap.engineTargetLanguage && pair.target !== cap.engineTargetLanguage) {
                    return `专训 ${pairLabel}：与成片目标语不匹配`;
                }
            }
        } catch { /* ignore */ }
        if (cap.sakuraDisableReason) return cap.sakuraDisableReason;
        if (!cap.isZhTarget) {
            return `成片 ${cap.targetLanguageLabel || '非中文'}：当前专训模型不可用`;
        }
        if (cap.sourceLang && cap.sourceLang !== 'ja' && cap.sourceLang !== 'ko') {
            return '当前片源：请使用通用推理模型';
        }
        return '当前成片目标语不可用';
    }

    function filterMtModelIdsForTarget(ids, options = {}, deps = {}) {
        const list = Array.isArray(ids) ? ids : [];
        return list.filter((id) => isMtModelAllowedForTarget(id, options, deps));
    }

    function pickFallbackMtModelId(options = {}, deps = {}) {
        const cap = resolveMtCapability(options);
        const installed = Array.isArray(deps.installedIds)
            ? deps.installedIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const prefer = String(deps.preferId || '').trim();
        if (prefer && isMtModelAllowedForTarget(prefer, options, deps)
            && (!installed.length || installed.includes(prefer))) {
            return prefer;
        }
        const allowedInstalled = filterMtModelIdsForTarget(installed, options, deps);
        if (cap.allowKoZhSpecialists) {
            const koZhOrder = ['sakura-ln-korean-14b', 'sakura-ln-korean-7b'];
            for (const id of koZhOrder) {
                if (allowedInstalled.includes(id)) return id;
            }
        }
        if (cap.allowKoJaSpecialists) {
            const koJaOrder = ['sakura-ln-ko2ja-14b'];
            for (const id of koJaOrder) {
                if (allowedInstalled.includes(id)) return id;
            }
        }
        if (cap.allowJaZhSpecialists || cap.allowSakuraModels) {
            const sakuraOrder = ['sakura-galtransl-7b-q6k', 'sakura-galtransl-7b', 'sakura-7b', 'sakura-1.5b'];
            for (const id of sakuraOrder) {
                if (allowedInstalled.includes(id)) return id;
            }
            for (const id of allowedInstalled) {
                if (isSakuraOrGalMtId(id) && isMtModelAllowedForTarget(id, options, deps)) return id;
            }
        }
        for (const id of allowedInstalled) {
            if (!isSakuraOrGalMtId(id) && !isOpusMtId(id)) return id;
        }
        return String(deps.emptyFallback != null ? deps.emptyFallback : '').trim()
            || (allowedInstalled[0] || '');
    }

    const LAST_MT_BUCKETS = Object.freeze(['zh', 'en', 'ja', 'ko']);

    function lastMtBucketForTarget(langOrOptions) {
        const lang = typeof langOrOptions === 'string'
            ? langOrOptions
            : resolveTargetLang(langOrOptions || {});
        if (isZhTarget(lang)) return 'zh';
        const n = String(lang || '').trim().toLowerCase();
        if (n === 'en' || n.startsWith('en')) return 'en';
        if (n === 'ja' || n.startsWith('ja')) return 'ja';
        if (n === 'ko' || n.startsWith('ko')) return 'ko';
        return 'zh';
    }

    function normalizeLastMtByTarget(raw) {
        const out = { zh: '', en: '', ja: '', ko: '' };
        const src = raw && typeof raw === 'object' ? raw : {};
        for (const key of LAST_MT_BUCKETS) {
            out[key] = String(src[key] || '').trim();
        }
        return out;
    }

    function rememberLastMtForTarget(map, targetLangOrOptions, modelId) {
        const next = normalizeLastMtByTarget(map);
        const id = String(modelId || '').trim();
        if (!id) return next;
        const bucket = lastMtBucketForTarget(targetLangOrOptions);
        next[bucket] = id;
        return next;
    }

    function recallLastMtForTarget(map, targetLangOrOptions) {
        const normalized = normalizeLastMtByTarget(map);
        const bucket = lastMtBucketForTarget(targetLangOrOptions);
        return String(normalized[bucket] || '').trim();
    }

    /**
     * Pre-start / form gate: returns fixes to apply when selection mismatches target.
     */
    function validateMtSelectionForTarget(options = {}, deps = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const cap = resolveMtCapability(o);
        const mode = normalizeTranslateMode(
            o.translateMode || (o.smartTranslate ? 'smart' : '') || 'llm',
        );
        const modelId = String(
            o.engineLlmMtModel || o.engineMtModel || o.modelId || '',
        ).trim();
        const issues = [];
        const fixes = {};

        if (!cap.allowHybridMt && o.smartTranslateHybridMt !== false) {
            fixes.smartTranslateHybridMt = false;
            if (mode === 'smart' || o.smartTranslate) {
                issues.push(cap.hybridDisableReason || '当前成片目标语已关闭句级混合');
            }
        }

        if (modelId && !isMtModelAllowedForTarget(modelId, o, deps)) {
            const suggested = pickFallbackMtModelId(o, {
                installedIds: deps.installedIds,
                preferId: deps.preferId || recallLastMtForTarget(o.lastMtByTarget, o),
                emptyFallback: '',
                isLlmMtId: deps.isLlmMtId,
            });
            fixes.engineLlmMtModel = suggested;
            fixes.engineMtModel = suggested;
            issues.push(
                `${cap.sakuraDisableReason || '当前模型与成片目标语不匹配'}`
                + (suggested ? `；建议改用 ${suggested}` : '；请选择已下载的通用推理模型'),
            );
        }

        const needsMt = mode === 'llm' || mode === 'sakura'
            || (String(o.task || '') === 'translate' || String(o.task || '') === 'dual');
        if (needsMt && !cap.isZhTarget && mode !== 'smart' && !o.smartTranslate) {
            const effective = String(
                (fixes.engineLlmMtModel != null ? fixes.engineLlmMtModel : modelId) || '',
            ).trim();
            const installed = Array.isArray(deps.installedIds) ? deps.installedIds : [];
            const hasInstalledGeneral = filterMtModelIdsForTarget(installed, o, deps)
                .some((id) => !isSakuraOrGalMtId(id));
            if (!effective && !hasInstalledGeneral && deps.requireInstalledGeneral) {
                issues.push(
                    `成片 ${cap.targetLanguageLabel || '非中文'} 需要通用推理模型（Qwen 等），当前未安装`,
                );
            }
        }

        return {
            ok: issues.length === 0,
            cap,
            issues,
            fixes,
            suggestedModelId: fixes.engineLlmMtModel || '',
            message: issues[0] || '',
        };
    }

    return {
        OPUS_MT_BY_PAIR,
        OPUS_REMOVED_MSG,
        LAST_MT_BUCKETS,
        resolveMtTargetRoute,
        resolveMtCapability,
        applyMtTargetRouteToOptions,
        allowSmartHybridForTarget,
        isHybridCapableTarget,
        isMtModelAllowedForTarget,
        isMultilingualSentenceMtId,
        mtModelBlockReasonForTarget,
        filterMtModelIdsForTarget,
        pickFallbackMtModelId,
        isGeneralLlmMtId,
        lastMtBucketForTarget,
        normalizeLastMtByTarget,
        rememberLastMtForTarget,
        recallLastMtForTarget,
        validateMtSelectionForTarget,
        resolveOpusMtModelId,
        engineApiTargetCode,
        isOpusMtId,
        isSakuraOrGalMtId,
        normalizeTranslateMode,
        isProTranslateMode,
        normalizeSourceLang,
    };
}));
