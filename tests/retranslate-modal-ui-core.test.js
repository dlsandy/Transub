'use strict';

const assert = require('assert');
const { createRetranslateModalUi } = require('../src/js/retranslate-modal-ui-core.js');

function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
        add(...names) { names.forEach((n) => set.add(n)); },
        remove(...names) { names.forEach((n) => set.delete(n)); },
        toggle(name, force) {
            if (force === true) set.add(name);
            else if (force === false) set.delete(name);
            else if (set.has(name)) set.delete(name);
            else set.add(name);
            return set.has(name);
        },
        contains(name) { return set.has(name); },
        _values: set,
    };
}

describe('TransubRetranslateModalUi', () => {
    it('exports createRetranslateModalUi', () => {
        assert.strictEqual(typeof createRetranslateModalUi, 'function');
    });

    it('closeRetranslateModal / readRetranslateModeFromModal smoke with mock els', () => {
        const state = {
            retranslatePlan: [{ item: { path: 'a.mp4' } }],
            retranslateFromShelf: true,
        };
        const els = {
            retranslateModal: {
                classList: makeClassList(['flex']),
            },
            retranslateModeSmart: { checked: true },
            retranslateModeLlm: { checked: false },
            retranslateSmartHybridCheck: { checked: true },
            retranslateSmartPolishCheck: { checked: false },
            retranslateStyleEnabledCheck: { checked: false },
            retranslateStyleSelect: { value: 'natural_spoken', disabled: false },
            retranslateStyleCustomNote: { value: '', disabled: false },
            retranslateStyleCustomWrap: { classList: makeClassList(['hidden']) },
            retranslateStylePresetWrap: { classList: makeClassList([]) },
        };
        const ui = createRetranslateModalUi({
            state,
            els,
            getAdvancedEntitled: () => true,
            getTranslateStyleEnabled: () => false,
            translateStyleApi: {
                normalizeTranslateStylePreset: (v) => v || 'natural_spoken',
                normalizeTranslateStyleEnabled: (v) => !!v,
                DEFAULT_PRESET: 'natural_spoken',
            },
        });

        assert.strictEqual(ui.readRetranslateModeFromModal(), 'smart');
        assert.strictEqual(ui.readRetranslateSmartHybrid(), true);
        assert.strictEqual(ui.readRetranslateSmartPolish(), false);
        assert.deepStrictEqual(ui.readRetranslateStyleFromModal(), {
            translateStyleEnabled: false,
            translateStylePreset: 'natural_spoken',
            translateStyleCustomNote: '',
        });

        ui.closeRetranslateModal();
        assert.strictEqual(state.retranslatePlan, null);
        assert.strictEqual(state.retranslateFromShelf, false);
        assert.ok(els.retranslateModal.classList.contains('hidden'));
        assert.ok(!els.retranslateModal.classList.contains('flex'));

        els.retranslateModeSmart.checked = false;
        els.retranslateModeDialog = { checked: true };
        assert.strictEqual(ui.readRetranslateModeFromModal(), 'dialog');
        els.retranslateModeDialog.checked = false;
        assert.strictEqual(ui.readRetranslateModeFromModal(), 'llm');
    });

    it('seed/read retranslate style enable and disable preset controls', () => {
        const optionValues = ['natural_spoken', 'news_narration'];
        const selectEl = {
            value: 'natural_spoken',
            disabled: false,
            options: optionValues.map((value) => ({ value })),
        };
        const els = {
            retranslateStyleEnabledCheck: { checked: true },
            retranslateStyleSelect: selectEl,
            retranslateStyleCustomNote: { value: 'note', disabled: false },
            retranslateStyleCustomWrap: { classList: makeClassList([]) },
            retranslateStylePresetWrap: { classList: makeClassList([]) },
        };
        const ui = createRetranslateModalUi({
            state: {},
            els,
            getAdvancedEntitled: () => true,
            getTranslateStyleEnabled: () => true,
            populateTranslateStylePickerSelect: (el) => {
                el.options = optionValues.map((value) => ({ value }));
                el.value = 'natural_spoken';
            },
            translateStyleOptionsForItem: () => ({
                translateStyleEnabled: false,
                translateStylePreset: 'news_narration',
                translateStyleCustomNote: '',
            }),
            readGlobalTranslateStylePreset: () => 'natural_spoken',
            translateStyleApi: {
                normalizeTranslateStylePreset: (v) => v || 'natural_spoken',
                normalizeTranslateStyleEnabled: (v) => !!v,
                DEFAULT_PRESET: 'natural_spoken',
            },
        });
        ui.seedRetranslateStyleFromItems([{ path: 'a.mp4' }]);
        assert.strictEqual(els.retranslateStyleEnabledCheck.checked, false);
        assert.strictEqual(els.retranslateStyleSelect.value, 'news_narration');
        assert.strictEqual(els.retranslateStyleSelect.disabled, true);

        els.retranslateStyleEnabledCheck.checked = true;
        els.retranslateStyleSelect.value = 'news_narration';
        ui.syncRetranslateStyleCustomWrap();
        assert.strictEqual(els.retranslateStyleSelect.disabled, false);
        assert.deepStrictEqual(ui.readRetranslateStyleFromModal(), {
            translateStyleEnabled: true,
            translateStylePreset: 'news_narration',
            translateStyleCustomNote: '',
        });
    });
});
