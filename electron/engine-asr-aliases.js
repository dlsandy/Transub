/**
 * Retired engine ASR catalog ids → current ids.
 * Keep jobs/settings working after Hub ports are removed from the model library.
 */
const LEGACY_ENGINE_ASR_ALIASES = Object.freeze({
    'qwen3-asr-1.7b-ja': 'qwen3-asr-1.7b',
});

function canonicalizeEngineAsrModelId(value, fallback = '') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    return LEGACY_ENGINE_ASR_ALIASES[raw] || raw;
}

function isRetiredEngineAsrModelId(value) {
    return Object.prototype.hasOwnProperty.call(
        LEGACY_ENGINE_ASR_ALIASES,
        String(value || '').trim(),
    );
}

function omitRetiredEngineModels(models) {
    return (Array.isArray(models) ? models : []).filter((row) => {
        const id = typeof row === 'string' ? row : String(row?.id || '').trim();
        return !!id && !isRetiredEngineAsrModelId(id);
    });
}

module.exports = {
    LEGACY_ENGINE_ASR_ALIASES,
    canonicalizeEngineAsrModelId,
    isRetiredEngineAsrModelId,
    omitRetiredEngineModels,
};
