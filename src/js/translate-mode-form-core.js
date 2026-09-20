/**
 * Translate-mode form radio read/write helpers (pure DOM adapters).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateModeForm = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateModeFormFactory(global) {
    function loadNormalizeApi() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./settings-options-normalize-core');
            }
        } catch { /* optional */ }
        return (global && global.TransubSettingsOptionsNormalize) || null;
    }

    function normalizeMode(raw) {
        const api = loadNormalizeApi();
        if (api?.normalizeTranslateMode) return api.normalizeTranslateMode(raw);
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
        if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'sakura' || m === 'engine' || m === 'llm') return 'llm';
        return 'llm';
    }

    /**
     * @param {{ translateModeSmart?: HTMLInputElement, translateModeDialog?: HTMLInputElement, translateModeExternal?: HTMLInputElement, translateModeSakura?: HTMLInputElement }} els
     */
    function readTranslateModeFromForm(els = {}) {
        if (els.translateModeSmart?.checked) return 'smart';
        if (els.translateModeDialog?.checked) return 'dialog';
        if (els.translateModeExternal?.checked) return 'external';
        if (els.translateModeSakura?.checked) return 'llm';
        return 'llm';
    }

    /**
     * @param {object} els
     * @param {string} mode
     */
    function setTranslateModeRadios(els = {}, mode) {
        const next = normalizeMode(mode);
        if (els.translateModeEngine) els.translateModeEngine.checked = false;
        if (els.translateModeSakura) {
            els.translateModeSakura.value = 'llm';
            els.translateModeSakura.checked = next === 'llm';
        }
        if (els.translateModeExternal) {
            els.translateModeExternal.value = 'external';
            els.translateModeExternal.checked = next === 'external';
        }
        if (els.translateModeDialog) {
            els.translateModeDialog.value = 'dialog';
            els.translateModeDialog.checked = next === 'dialog';
        }
        if (els.translateModeSmart) els.translateModeSmart.checked = next === 'smart';
        return next;
    }

    return {
        normalizeMode,
        readTranslateModeFromForm,
        setTranslateModeRadios,
    };
}));
