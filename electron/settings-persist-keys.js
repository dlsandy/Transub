/**
 * Main-process facade: persist keys from normalizeTransWithAiRuntimeOptions.
 */

const { normalizeTransWithAiRuntimeOptions } = require('./transwithai-runtime-options-normalize');
const {
    listKeysFromOptions,
    diffAssembleVsNormalize,
    listNormalizedPersistKeys,
} = require('../src/js/settings-persist-keys-core');
const { PARTIAL_SAVE_OPTION_KEYS } = require('./settings-partial-save-keys');

function getNormalizedPersistKeys() {
    return listNormalizedPersistKeys(normalizeTransWithAiRuntimeOptions);
}

function assertPartialSaveKeysSubsetOfNormalize() {
    const persist = new Set(getNormalizedPersistKeys());
    const missing = PARTIAL_SAVE_OPTION_KEYS.filter((k) => !persist.has(k));
    return { ok: missing.length === 0, missing };
}

module.exports = {
    getNormalizedPersistKeys,
    listKeysFromOptions,
    diffAssembleVsNormalize,
    assertPartialSaveKeysSubsetOfNormalize,
    PARTIAL_SAVE_OPTION_KEYS,
};
