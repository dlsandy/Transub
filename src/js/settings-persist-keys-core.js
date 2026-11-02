/**
 * Settings persistence key helpers (assemble ⊆ normalize whitelist).
 * Canonical persist surface = keys returned by normalizeTransWithAiRuntimeOptions.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TransubSettingsPersistKeys = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function listKeysFromOptions(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).filter((k) => k && typeof k === 'string').sort();
    }

    /**
     * @param {object} assembled assembleSavedOptionsFromFields output
     * @param {object} normalized normalizeTransWithAiRuntimeOptions output
     * @returns {{ ok: boolean, missing: string[] }}
     */
    function diffAssembleVsNormalize(assembled, normalized) {
        const missing = [];
        for (const key of Object.keys(assembled || {})) {
            if (!Object.prototype.hasOwnProperty.call(normalized || {}, key)) {
                missing.push(key);
            }
        }
        missing.sort();
        return { ok: missing.length === 0, missing };
    }

    /**
     * Node/main: load normalize and return sorted persist keys (empty defaults).
     */
    function listNormalizedPersistKeys(normalizeFn) {
        if (typeof normalizeFn !== 'function') {
            throw new Error('listNormalizedPersistKeys: normalizeFn required');
        }
        return listKeysFromOptions(normalizeFn({}));
    }

    return {
        listKeysFromOptions,
        diffAssembleVsNormalize,
        listNormalizedPersistKeys,
    };
}));
