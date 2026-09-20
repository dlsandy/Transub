/**
 * Shell helpers: Sakura / managed LLM pick identity.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubManagedLlmPick = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function managedLlmPickFactory(global) {
    function getManagedLlmCatalogApi() {
        return global.TransubAdvancedManagedLlmCatalog || null;
    }

    function isSakuraMtModelId(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        try {
            const catalog = global.TransubSakuraMtCatalog || global.SakuraMtCatalog;
            if (catalog?.isSakuraMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return /^sakura-/i.test(id);
    }

    /**
     * @param {string} modelId
     * @param {{ labModels?: any[] }} [opts]
     */
    function findManagedLlmCatalogEntry(modelId, opts = {}) {
        const id = String(modelId || '').trim();
        if (!id) return null;
        try {
            const api = getManagedLlmCatalogApi();
            return api?.findCatalogEntry?.(id, { labModels: opts.labModels || [] }) || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Models listed under「LLM推理翻译」and selectable for 推理翻译.
     * @param {string} modelId
     * @param {{ labModels?: any[] }} [opts]
     */
    function isLlmInferencePickModelId(modelId, opts = {}) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (global.TransubSakuraMtCatalog?.isNonTranslateEngineModelId?.(id)) return false;
        if (isSakuraMtModelId(id)) return true;
        if (findManagedLlmCatalogEntry(id, opts)) return true;
        try {
            const catalog = global.TransubSakuraMtCatalog || global.SakuraMtCatalog;
            if (catalog?.isLlmInferenceMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    /**
     * Mutable lab-model cache + bound helpers for the main shell.
     */
    function createManagedLlmPickState() {
        let cachedManagedLabModels = [];
        return {
            getCachedManagedLabModels: () => cachedManagedLabModels,
            setCachedManagedLabModels: (v) => {
                cachedManagedLabModels = Array.isArray(v) ? v : [];
            },
            getManagedLlmCatalogApi,
            isSakuraMtModelId,
            findManagedLlmCatalogEntry: (modelId) => findManagedLlmCatalogEntry(modelId, {
                labModels: cachedManagedLabModels,
            }),
            isLlmInferencePickModelId: (modelId) => isLlmInferencePickModelId(modelId, {
                labModels: cachedManagedLabModels,
            }),
        };
    }

    return {
        getManagedLlmCatalogApi,
        isSakuraMtModelId,
        findManagedLlmCatalogEntry,
        isLlmInferencePickModelId,
        createManagedLlmPickState,
    };
}));
