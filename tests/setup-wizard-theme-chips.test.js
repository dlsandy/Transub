const assert = require('assert');
const detect = require('../src/js/setup-wizard-detect-core.js');
const appearance = require('../src/js/setup-wizard-appearance-core.js');

describe('setup-wizard mergeChipStates', () => {
    it('treats err/fail as error and prefers warn over ok', () => {
        assert.strictEqual(detect.mergeChipStates(
            { state: 'ok', label: 'a' },
            { state: 'err', label: 'broken' },
        ).state, 'err');
        assert.strictEqual(detect.mergeChipStates(
            { state: 'ok', label: 'a' },
            { state: 'warn', label: 'note' },
        ).state, 'warn');
        assert.strictEqual(detect.mergeChipStates(
            { state: 'ok', label: 'a' },
            { state: 'ok', label: 'b' },
        ).state, 'ok');
    });
});

describe('setup-wizard appearance theme storage', () => {
    it('reads either mainTheme or editor theme key', () => {
        const store = {};
        const api = appearance.createSetupWizardAppearance({
            electron: null,
            $: () => null,
        });
        // Patch localStorage via global for this process.
        const prev = global.localStorage;
        global.localStorage = {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
        };
        try {
            store['transub-editor-theme'] = 'dark';
            assert.strictEqual(api.readStoredTheme(), 'dark');
            store['transub.mainTheme'] = 'light';
            assert.strictEqual(api.readStoredTheme(), 'light');
        } finally {
            global.localStorage = prev;
        }
    });
});
