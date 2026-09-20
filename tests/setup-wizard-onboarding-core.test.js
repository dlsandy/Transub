const assert = require('assert');
const onboarding = require('../src/js/setup-wizard-onboarding-core.js');

function memoryStore(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        },
    };
}

describe('setup-wizard-onboarding-core', () => {
    it('resolveSetupWizardAutoOpen opens on true first launch', () => {
        const r = onboarding.resolveSetupWizardAutoOpen({
            completed: false,
            started: false,
            hasSettings: false,
        });
        assert.deepStrictEqual(r, { open: true });
    });

    it('resolveSetupWizardAutoOpen reopens when started but not completed', () => {
        const r = onboarding.resolveSetupWizardAutoOpen({
            completed: false,
            started: true,
            hasSettings: true,
        });
        assert.deepStrictEqual(r, { open: true });
    });

    it('resolveSetupWizardAutoOpen skips when completed', () => {
        const r = onboarding.resolveSetupWizardAutoOpen({
            completed: true,
            started: true,
            hasSettings: true,
        });
        assert.deepStrictEqual(r, { open: false });
    });

    it('resolveSetupWizardAutoOpen migrates existing installs with settings', () => {
        const r = onboarding.resolveSetupWizardAutoOpen({
            completed: false,
            started: false,
            hasSettings: true,
        });
        assert.deepStrictEqual(r, { open: false, migrateComplete: true });
    });

    it('markWizardCompleted / markWizardStarted persist flags', () => {
        const store = memoryStore();
        assert.strictEqual(onboarding.isWizardCompleted(store), false);
        onboarding.markWizardStarted(store);
        assert.strictEqual(onboarding.isWizardStarted(store), true);
        assert.strictEqual(onboarding.isWizardCompleted(store), false);
        onboarding.markWizardCompleted(store);
        assert.strictEqual(onboarding.isWizardCompleted(store), true);
        assert.strictEqual(onboarding.isWizardStarted(store), true);
    });
});
