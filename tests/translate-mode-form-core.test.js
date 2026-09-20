const assert = require('assert');
const api = require('../src/js/translate-mode-form-core');

describe('translate-mode-form-core', () => {
    it('reads and sets radios including external', () => {
        const els = {
            translateModeSakura: { checked: false, value: '' },
            translateModeExternal: { checked: false, value: '' },
            translateModeDialog: { checked: false, value: '' },
            translateModeSmart: { checked: false, value: '' },
        };
        api.setTranslateModeRadios(els, 'external');
        assert.strictEqual(api.readTranslateModeFromForm(els), 'external');
        assert.strictEqual(els.translateModeExternal.checked, true);
        assert.strictEqual(els.translateModeSakura.checked, false);
        api.setTranslateModeRadios(els, 'byok');
        assert.strictEqual(api.readTranslateModeFromForm(els), 'external');
    });
});
