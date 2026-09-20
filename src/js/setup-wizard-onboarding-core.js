/**
 * Setup wizard first-run / resume gates (localStorage).
 * Completed only after prefs finish; skip/close must not suppress next-launch auto-open.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardOnboarding = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardOnboardingFactory() {
    const COMPLETED_KEY = 'transub.setupWizard.completed';
    const STARTED_KEY = 'transub.setupWizard.started';
    /** Legacy skip flag — no longer gates auto-open. */
    const LEGACY_DISMISS_KEY = 'transub.setupWizard.dismissed';

    function defaultStore() {
        try {
            return typeof localStorage !== 'undefined' ? localStorage : null;
        } catch {
            return null;
        }
    }

    function readFlag(store, key) {
        try {
            return store?.getItem?.(key) === '1';
        } catch {
            return false;
        }
    }

    function writeFlag(store, key) {
        try {
            store?.setItem?.(key, '1');
        } catch { /* ignore */ }
    }

    function isWizardCompleted(store = defaultStore()) {
        return readFlag(store, COMPLETED_KEY);
    }

    function markWizardCompleted(store = defaultStore()) {
        writeFlag(store, COMPLETED_KEY);
        writeFlag(store, STARTED_KEY);
    }

    function isWizardStarted(store = defaultStore()) {
        return readFlag(store, STARTED_KEY);
    }

    function markWizardStarted(store = defaultStore()) {
        writeFlag(store, STARTED_KEY);
    }

    /**
     * @param {{ completed?: boolean, started?: boolean, hasSettings?: boolean }} flags
     * @returns {{ open: boolean, migrateComplete?: boolean }}
     */
    function resolveSetupWizardAutoOpen(flags = {}) {
        if (flags.completed) return { open: false };
        // Existing install with settings but never tracked under the new keys:
        // treat as already onboarded so we do not re-nag after upgrade.
        if (flags.hasSettings && !flags.started) {
            return { open: false, migrateComplete: true };
        }
        return { open: true };
    }

    return {
        COMPLETED_KEY,
        STARTED_KEY,
        LEGACY_DISMISS_KEY,
        isWizardCompleted,
        markWizardCompleted,
        isWizardStarted,
        markWizardStarted,
        resolveSetupWizardAutoOpen,
    };
}));
