'use strict';

const assert = require('assert');
const { createTranslateExternalPick } = require('../src/js/translate-external-pick-core.js');

describe('TransubTranslateExternalPick', () => {
    it('exports createTranslateExternalPick', () => {
        assert.strictEqual(typeof createTranslateExternalPick, 'function');
    });

    it('setExternalTranslateSource toggles station checkbox', async () => {
        const check = { checked: false };
        const modelInput = { value: '' };
        const els = {
            transubStationEnabledCheck: check,
            transubStationModelInput: modelInput,
            translateExternalSourceSwitch: { hidden: true, classList: { add() {}, remove() {} } },
            translateExternalStationBtn: {
                classList: { toggle() {} },
                setAttribute() {},
            },
            translateExternalByokBtn: {
                classList: { toggle() {} },
                setAttribute() {},
            },
        };
        let persisted = 0;
        const api = createTranslateExternalPick({
            els,
            electron: {},
            persistFormOptionsQuiet: async () => { persisted += 1; },
            syncTransubStationSettingsUi: () => {},
            markSettingsDirty: () => {},
            setSaveParamsStatus: () => {},
            showToast: () => {},
            ensureSmartTranslatePickCache: async () => ({}),
            syncModelsMenuDetailUi: () => {},
            syncTranslateChipUi: () => {},
            updateReadinessStrip: () => {},
        });

        assert.strictEqual(api.externalSource(), 'byok');
        await api.setExternalTranslateSource('station');
        assert.strictEqual(check.checked, true);
        assert.strictEqual(api.externalSource(), 'station');
        assert.ok(persisted >= 1);
        await api.setExternalTranslateSource('byok');
        assert.strictEqual(check.checked, false);
        assert.strictEqual(api.externalSource(), 'byok');
    });

    it('station list completion does not retrigger chip rebuild loop', async () => {
        const host = {
            innerHTML: '',
            children: [],
            appendChild(el) { this.children.push(el); this.innerHTML = 'x'; },
        };
        const created = [];
        const api = createTranslateExternalPick({
            els: {
                transubStationEnabledCheck: { checked: true },
                transubStationUrlInput: { value: 'http://127.0.0.1:8787' },
                transubStationModelInput: { value: '' },
                translateMtAutoHint: { textContent: '' },
                translateExternalSourceSwitch: { hidden: true, classList: { add() {}, remove() {} } },
                translateExternalStationBtn: { classList: { toggle() {} }, setAttribute() {} },
                translateExternalByokBtn: { classList: { toggle() {} }, setAttribute() {} },
            },
            getDocument: () => ({
                getElementById: () => null,
                createElement: () => {
                    const el = {
                        type: '',
                        className: '',
                        hidden: false,
                        textContent: '',
                        innerHTML: '',
                        dataset: {},
                        children: [],
                        classList: { add() {}, remove() {}, toggle() {} },
                        setAttribute() {},
                        addEventListener() {},
                        querySelector: () => ({ textContent: '' }),
                        appendChild(child) { this.children.push(child); },
                    };
                    created.push(el);
                    return el;
                },
            }),
            electron: {
                transubStationListModels: async () => ({
                    ok: true,
                    ready: true,
                    models: [{ id: 'sakura', name: 'Sakura' }],
                    activeModel: 'sakura',
                }),
            },
            persistFormOptionsQuiet: async () => {},
            syncModelsMenuDetailUi: () => {},
            updateReadinessStrip: () => {},
            syncTranslateChipUi: () => {
                throw new Error('syncTranslateChipUi must not run after station list');
            },
        });
        api.paintExternalMtSection({ host, listWrap: { classList: { remove() {} } }, allow: true });
        await new Promise((r) => setTimeout(r, 0));
        assert.ok(host.innerHTML);
    });
});
