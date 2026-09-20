/**
 * Form sync when 成片目标语 / translate mode changes (pure).
 * Keeps lastMtByTarget memory and corrects illegal hybrid / Sakura picks.
 */
(function (global, factory) {
    let routeApi = null;
    try {
        routeApi = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-target-route-core')
            : (global && global.TransubMtTargetRoute);
    } catch {
        routeApi = null;
    }
    const api = factory(routeApi);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtTargetFormSync = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtTargetFormSyncFactory(routeApi) {
    /**
     * @param {{
     *   prevTargetLang?: string,
     *   nextTargetLang: string,
     *   language?: string,
     *   currentModelId?: string,
     *   lastMtByTarget?: object,
     *   hybridOn?: boolean,
     *   translateMode?: string,
     *   installedIds?: string[],
     *   recommendId?: string,
     * }} input
     */
    function syncFormAfterTargetLangChange(input = {}) {
        const route = routeApi || {};
        const nextTarget = String(input.nextTargetLang || 'zh-Hans');
        const prevTarget = String(input.prevTargetLang || '');
        const language = String(input.language || '').trim();
        const currentModelId = String(input.currentModelId || '').trim();
        let lastMtByTarget = route.normalizeLastMtByTarget
            ? route.normalizeLastMtByTarget(input.lastMtByTarget)
            : { zh: '', en: '', ja: '', ko: '' };

        if (prevTarget && currentModelId && route.rememberLastMtForTarget) {
            lastMtByTarget = route.rememberLastMtForTarget(
                lastMtByTarget,
                prevTarget,
                currentModelId,
            );
        }

        const opts = {
            subtitleTargetLang: nextTarget,
            targetLang: nextTarget,
            language,
            lastMtByTarget,
        };
        const cap = route.resolveMtCapability
            ? route.resolveMtCapability(opts)
            : { isZhTarget: true, allowHybridMt: true, allowSakuraModels: true };

        const recalled = route.recallLastMtForTarget
            ? route.recallLastMtForTarget(lastMtByTarget, nextTarget)
            : '';
        const prefer = String(input.recommendId || recalled || '').trim();
        const modelAllowed = !currentModelId
            || (route.isMtModelAllowedForTarget
                ? route.isMtModelAllowedForTarget(currentModelId, opts)
                : true);

        let nextModelId = currentModelId;
        let modelChanged = false;
        let toast = '';

        if (!cap.allowHybridMt && input.hybridOn !== false) {
            toast = cap.hybridDisableReason
                || `成片 ${cap.targetLanguageLabel || '非中文'}：已关闭句级混合`;
        }

        if (!modelAllowed) {
            nextModelId = route.pickFallbackMtModelId
                ? route.pickFallbackMtModelId(opts, {
                    installedIds: input.installedIds,
                    preferId: prefer,
                    emptyFallback: '',
                })
                : '';
            modelChanged = nextModelId !== currentModelId;
            if (!toast) {
                toast = (cap.sakuraDisableReason || '已按成片目标语调整翻译模型')
                    + (nextModelId ? ` → ${nextModelId}` : '（自动）');
            } else if (nextModelId) {
                toast += `；模型 → ${nextModelId}`;
            }
        } else if (
            !currentModelId
            && prefer
            && route.isMtModelAllowedForTarget?.(prefer, opts)
        ) {
            // Switching into a target bucket with a remembered pick (only when auto)
            // — leave auto empty; UI may optionally seed. Do not force.
        } else if (
            currentModelId
            && recalled
            && prevTarget
            && route.lastMtBucketForTarget?.(prevTarget)
                !== route.lastMtBucketForTarget?.(nextTarget)
            && route.isMtModelAllowedForTarget?.(recalled, opts)
            && recalled !== currentModelId
        ) {
            // Cross-bucket: restore remembered model for the new target
            nextModelId = recalled;
            modelChanged = true;
            toast = toast
                || `已恢复该成片语上次模型：${recalled}`;
        }

        if (nextModelId && route.rememberLastMtForTarget) {
            lastMtByTarget = route.rememberLastMtForTarget(
                lastMtByTarget,
                nextTarget,
                nextModelId,
            );
        }

        return {
            lastMtByTarget,
            engineLlmMtModel: nextModelId,
            smartTranslateHybridMt: !!cap.allowHybridMt && input.hybridOn !== false,
            forceHybridOff: !cap.allowHybridMt,
            dualTargetSuffix: (() => {
                try {
                    const fill = require('./mt-short-fill-core');
                    return fill.dualTargetSuffixFromLang({ subtitleTargetLang: nextTarget });
                } catch {
                    if (/^en/i.test(nextTarget)) return 'en';
                    if (/^ko/i.test(nextTarget)) return 'ko';
                    if (/^ja/i.test(nextTarget)) return 'ja';
                    return 'zh';
                }
            })(),
            cap,
            modelChanged,
            toast,
            llmHint: buildLlmMtHint(cap, String(input.translateMode || 'llm')),
            hybridHint: buildHybridHint(cap),
        };
    }

    function buildLlmMtHint(cap = {}, translateMode = 'llm') {
        const mode = String(translateMode || 'llm');
        if (mode === 'smart') {
            if (!cap.allowHybridMt) {
                return `混合翻译 · 成片 ${cap.targetLanguageLabel || '非中文'}：句级混合不可用，由对话模型按行翻译。`;
            }
            if (cap.allowKoZhSpecialists) {
                return '混合翻译：韩→简中句级可用 LN-Korean；可留空自动选用。';
            }
            if (cap.allowKoJaSpecialists) {
                return '混合翻译：韩→日句级可用 LN-ko2ja；可留空自动选用。';
            }
            if (cap.allowSakuraModels) {
                return '混合翻译：句级用专训推理（Sakura / GalTransl）；可留空自动选用。';
            }
            return `混合翻译 · 成片 ${cap.targetLanguageLabel || '非中文'}：句级请用多语专训（TranslateGemma 等）；日→中专训已禁用。`;
        }
        if (cap.allowKoZhSpecialists) {
            return '韩→简中专训（LN-Korean）或通用推理：可留空自动匹配，或指定已下载模型。';
        }
        if (cap.allowKoJaSpecialists) {
            return '韩→日专训（LN-ko2ja）或 TranslateGemma / 通用推理：可留空自动匹配。';
        }
        if (cap.allowSakuraModels) {
            return '本地 LLM 推理翻译（专训 / Qwen 等）：可留空自动匹配（按片源语言、Pro 与硬件），或指定已下载模型。';
        }
        return `成片 ${cap.targetLanguageLabel || '非中文'}：请选用通用推理模型（Qwen / TranslateGemma 等）。专训日→中模型已禁用。可留空自动匹配。`;
    }

    function buildHybridHint(cap = {}) {
        if (cap.allowHybridMt) {
            if (cap.allowKoZhSpecialists) {
                return '韩语→简中：每一句可交给 LN-Korean。关闭后整段由对话模型按行翻译。';
            }
            if (cap.allowKoJaSpecialists) {
                return '韩语→日语：每一句可交给 LN-ko2ja。关闭后整段由对话模型按行翻译。';
            }
            if (cap.allowSakuraModels) {
                return '日语→中文：每一句交给专训推理模型。关闭后整段由对话模型按行翻译。';
            }
            return `成片 ${cap.targetLanguageLabel || '非中文'}：句级混合可用多语专训（TranslateGemma / Chimera）。关闭后由对话模型按行翻译。`;
        }
        return cap.hybridDisableReason
            || '当前成片目标语不支持句级混合。';
    }

    /**
     * Filter predicate for engine LLM MT select options (base eligibility).
     * Target-lang gating is applied via buildLlmMtModelDisableReason (disabled options).
     */
    function buildLlmMtModelFilter(options = {}, baseFilter) {
        return (m) => {
            const id = typeof m === 'string' ? m : m?.id;
            if (typeof baseFilter === 'function' && !baseFilter(m)) return false;
            // Keep JA→ZH packs visible when blocked — UI marks them disabled.
            if (!routeApi?.isMtModelAllowedForTarget) return true;
            if (routeApi.isMtModelAllowedForTarget(id, options)) return true;
            // Still list blocked JA→ZH / Opus so the user sees they are unavailable.
            if (routeApi.isOpusMtId?.(id)) return false;
            if (routeApi.isSakuraOrGalMtId?.(id)) return true;
            try {
                const cat = (typeof module !== 'undefined' && module.exports)
                    ? require('./sakura-mt-catalog-core')
                    : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
                if (cat?.isJaZhOnlyMtModel?.(id)) return true;
            } catch { /* ignore */ }
            return routeApi.isMtModelAllowedForTarget(id, options);
        };
    }

    /**
     * @returns {(m: object|string) => string} empty = enabled; otherwise disable reason
     */
    function buildLlmMtModelDisableReason(options = {}) {
        return (m) => {
            const id = typeof m === 'string' ? m : m?.id;
            if (!routeApi?.mtModelBlockReasonForTarget) {
                if (!routeApi?.isMtModelAllowedForTarget) return '';
                return routeApi.isMtModelAllowedForTarget(id, options)
                    ? ''
                    : '当前成片目标语不可用';
            }
            return routeApi.mtModelBlockReasonForTarget(id, options) || '';
        };
    }

    return {
        syncFormAfterTargetLangChange,
        buildLlmMtHint,
        buildHybridHint,
        buildLlmMtModelFilter,
        buildLlmMtModelDisableReason,
    };
}));
