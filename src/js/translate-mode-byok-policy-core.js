/**
 * Translate-mode ↔ BYOK policy (pure).
 * External (BYOK) is a dedicated mode; inference / dialog / hybrid never use BYOK.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateModeByokPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateModeByokPolicyFactory(global) {
    function loadNormalizeApi() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./settings-options-normalize-core');
            }
        } catch { /* optional */ }
        return (global && global.TransubSettingsOptionsNormalize) || null;
    }

    function normalizeTranslateMode(raw) {
        const api = loadNormalizeApi();
        if (api?.normalizeTranslateMode) return api.normalizeTranslateMode(raw);
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
        if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'sakura' || m === 'engine' || m === 'llm') return 'llm';
        return 'llm';
    }

    function normalizeLlmSource(raw) {
        const s = String(raw || '').trim().toLowerCase();
        return s === 'managed' ? 'managed' : 'byok';
    }

    function isExternalTranslateMode(raw) {
        return normalizeTranslateMode(raw) === 'external';
    }

    /**
     * Sync readiness: baseUrl + model present (API key checked asynchronously).
     * @param {{ baseUrl?: string, model?: string }|null|undefined} byok
     */
    function isByokEndpointConfigured(byok) {
        const baseUrl = String(byok?.baseUrl || '').trim();
        const model = String(byok?.model || '').trim();
        return !!(baseUrl && model);
    }

    /**
     * Sentence MT may use BYOK only for translateMode=external.
     * Legacy llmSource=byok alone is not enough.
     */
    function shouldPreferByokSentenceMt({ translateMode, byok } = {}) {
        if (!isExternalTranslateMode(translateMode)) return false;
        return isByokEndpointConfigured(byok);
    }

    /**
     * Pro chat / polish / reconstruct: always managed (never BYOK).
     */
    function resolveProChatLlmSource() {
        return 'managed';
    }

    /**
     * One-shot migration: legacy llmSource=byok on non-external modes → external.
     * Does not mutate llmSource (caller may force managed for Pro chat).
     * @returns {{ translateMode: string, migrated: boolean, reason: string }}
     */
    function migrateTranslateModeFromLegacyByok({
        translateMode,
        llmSource,
        byokReady = false,
    } = {}) {
        const mode = normalizeTranslateMode(translateMode);
        const source = normalizeLlmSource(llmSource);
        if (mode === 'external') {
            return { translateMode: 'external', migrated: false, reason: 'already_external' };
        }
        if (source !== 'byok' || !byokReady) {
            return { translateMode: mode, migrated: false, reason: 'no_legacy_byok' };
        }
        return {
            translateMode: 'external',
            migrated: true,
            reason: 'legacy_llm_source_byok',
        };
    }

    return {
        normalizeTranslateMode,
        isExternalTranslateMode,
        isByokEndpointConfigured,
        shouldPreferByokSentenceMt,
        resolveProChatLlmSource,
        migrateTranslateModeFromLegacyByok,
        normalizeLlmSource,
    };
}));
