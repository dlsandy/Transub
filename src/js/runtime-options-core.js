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
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
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
            const snap = getSavedOptionsSnapshot() || {};
            const activeMt = readActiveEngineMtModelFromForm();
            const mode = readTranslateModeFromForm();
            // Settings panel is lazy-loaded; prefer snapshot for timingAlign* when DOM
            // controls are absent / still at HTML defaults after a ForcedAligner preset.
            const snapAlign = String(snap.timingAlignModel || '').trim();
            const formAlign = String(saved.timingAlignModel || '').trim();
            const timingAlignModel = (() => {
                if (snapAlign && snapAlign !== 'ten' && (!formAlign || formAlign === 'ten')) {
                    const el = typeof document !== 'undefined'
                        ? document.getElementById('timingAlignModelSelect')
                        : null;
                    if (!el) return snapAlign;
                }
                return formAlign || snapAlign || 'ten';
            })();
            let merged = {
                ...saved,
                ...getPostTaskOptionsFromUi(),
                timingAlign: Object.prototype.hasOwnProperty.call(saved, 'timingAlign')
                    ? saved.timingAlign !== false
                    : (snap.timingAlign !== false),
                timingAlignModel,
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
