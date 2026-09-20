/**
 * Build runtime job options from form + post-task + MT route.
 * Shell injects form/MT adapters via createRuntimeOptions(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubRuntimeOptions = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function runtimeOptionsFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createRuntimeOptions(deps) {
        const d = deps || {};
        const buildSavedOptionsFromForm = d.buildSavedOptionsFromForm || (() => ({}));
        const getPostTaskOptionsFromUi = d.getPostTaskOptionsFromUi || (() => ({}));
        const readActiveEngineMtModelFromForm = d.readActiveEngineMtModelFromForm || (() => '');
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => '');
        const mtRouteApi = typeof d.mtRouteApi === 'function'
            ? d.mtRouteApi
            : () => d.mtRouteApi || {};
        const installedMtModelIds = d.installedMtModelIds || (() => []);
        const isLlmInferencePickModelId = d.isLlmInferencePickModelId || (() => false);

        function buildRuntimeOptions() {
            const saved = buildSavedOptionsFromForm();
            const activeMt = readActiveEngineMtModelFromForm();
            const mode = readTranslateModeFromForm();
            let merged = {
                ...saved,
                ...getPostTaskOptionsFromUi(),
                // Job start needs a concrete MT id; resolve「自动匹配」here (do not persist).
                engineMtModel: activeMt,
                ...(mode === 'llm' || mode === 'sakura'
                    ? { engineLlmMtModel: activeMt || saved.engineLlmMtModel }
                    : {}),
            };
            try {
                const api = mtRouteApi();
                if (api && api.applyMtTargetRouteToOptions) {
                    const applied = api.applyMtTargetRouteToOptions(merged, {
                        installedIds: installedMtModelIds(),
                        isLlmMtId: (id) => isLlmInferencePickModelId(id),
                    });
                    merged = applied.options || merged;
                }
            } catch { /* optional */ }
            return merged;
        }

        return { buildRuntimeOptions };
    }

    return { createRuntimeOptions };
}));
