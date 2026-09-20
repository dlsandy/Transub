/**
 * One-shot: legacy llmSource=byok on non-external translate modes → external + managed Pro chat.
 */
const byokPolicy = require('../src/js/translate-mode-byok-policy-core');
const entitlement = require('../src/js/advanced-entitlement-core');

function migrateLegacyByokTranslateMode({
    readAdvancedDoc,
    writeAdvancedDoc,
    loadSettings,
    patchSettings,
} = {}) {
    if (typeof readAdvancedDoc !== 'function' || typeof writeAdvancedDoc !== 'function') {
        return { ok: false, migrated: false, reason: 'no_advanced_io' };
    }
    const current = readAdvancedDoc();
    const doc = current?.doc || current || {};
    const source = entitlement.normalizeLlmSource(doc.llmSource);
    const byok = entitlement.normalizeByok(doc.byok);
    const byokReady = byokPolicy.isByokEndpointConfigured(byok);

    let settings = {};
    try {
        const loaded = typeof loadSettings === 'function' ? loadSettings() : null;
        settings = loaded?.options || {};
    } catch {
        settings = {};
    }
    const modeBefore = settings.translateMode;
    const mig = byokPolicy.migrateTranslateModeFromLegacyByok({
        translateMode: modeBefore,
        llmSource: source,
        byokReady,
    });

    let settingsPatched = false;
    if (mig.migrated && typeof patchSettings === 'function') {
        try {
            patchSettings(null, {
                translateMode: 'external',
                smartTranslate: false,
                smartTranslateHybridMt: false,
                smartTranslatePlotPolish: false,
                smartTranslateFaithfulVerify: false,
                smartTranslateAddressConsistency: false,
            });
            settingsPatched = true;
        } catch (err) {
            return {
                ok: false,
                migrated: false,
                error: err?.message || String(err),
                reason: 'settings_patch_failed',
            };
        }
    }

    let sourceForcedManaged = false;
    if (source === 'byok') {
        const saved = writeAdvancedDoc({
            ...doc,
            llmSource: 'managed',
        });
        sourceForcedManaged = !!(saved?.ok !== false);
    }

    return {
        ok: true,
        migrated: !!mig.migrated,
        settingsPatched,
        sourceForcedManaged,
        translateMode: mig.migrated ? 'external' : byokPolicy.normalizeTranslateMode(modeBefore),
        reason: mig.reason,
    };
}

module.exports = {
    migrateLegacyByokTranslateMode,
};
