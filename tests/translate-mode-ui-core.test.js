'use strict';

const assert = require('assert');
const { createTranslateModeUi } = require('../src/js/translate-mode-ui-core.js');

describe('TransubTranslateModeUi', () => {
    it('exports createTranslateModeUi', () => {
        assert.strictEqual(typeof createTranslateModeUi, 'function');
    });

    it('syncTranslateChipUi does not throw with missing els', () => {
        const ui = createTranslateModeUi({
            els: {},
            getAdvancedEntitled: () => false,
            getCachedEngineModels: () => [],
            getCachedSmartTranslatePick: () => null,
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: () => 'llm',
            shouldFollowSenseForMt: () => false,
            isAutoSenseEnabled: () => false,
            translateChipApi: {},
            syncModelsChipLabel: () => {},
            updateRecipeCapsule: () => {},
        });
        assert.strictEqual(typeof ui.syncTranslateChipUi, 'function');
        assert.doesNotThrow(() => ui.syncTranslateChipUi());
    });

    it('setTranslateMtPickMode(manual) loads smart-translate cache for dialog mode', async () => {
        let ensureCalls = 0;
        let cached = null;
        const listWrap = {
            classList: {
                hidden: true,
                toggle(name, on) {
                    if (name === 'hidden') this.hidden = !!on;
                },
            },
        };
        const host = { innerHTML: '', appendChild() {} };
        const prevDocument = global.document;
        global.document = {
            createElement: () => ({
                className: '',
                type: '',
                textContent: '',
                innerHTML: '',
                dataset: {},
                classList: { add() {}, toggle() {} },
                setAttribute() {},
                addEventListener() {},
                querySelector: () => ({ textContent: '' }),
                appendChild() {},
            }),
            getElementById: () => null,
        };
        try {
            const ui = createTranslateModeUi({
                els: {
                    translateMtModelList: host,
                    translateMtModelListWrap: listWrap,
                    translateMtAutoBtn: {
                        classList: { toggle() {} },
                        setAttribute() {},
                    },
                    translateMtManualBtn: {
                        classList: { toggle() {} },
                        setAttribute() {},
                    },
                },
                getAdvancedEntitled: () => true,
                getCachedEngineModels: () => [],
                getCachedSmartTranslatePick: () => cached,
                setCachedSmartTranslatePick: (v) => { cached = v; },
                ensureSmartTranslatePickCache: async () => {
                    ensureCalls += 1;
                    cached = {
                        catalog: [{ id: 'qwen3-8b', installed: true, name: 'Qwen' }],
                        smartTranslateModelId: '',
                        llmSource: 'managed',
                    };
                    return cached;
                },
                readTaskFromForm: () => 'translate',
                readTranslateModeFromForm: () => 'dialog',
                shouldFollowSenseForMt: () => false,
                isAutoSenseEnabled: () => false,
                setMtUseForm: () => {},
                translateChipApi: {
                    buildTranslateChipViewModel: () => ({ label: '智能翻译', title: 't' }),
                },
                retranslatePlanApi: {
                    filterSmartTranslateCatalog: (catalog) => catalog || [],
                },
                isSmartTranslateCapableModel: () => true,
                syncModelsChipLabel: () => {},
                updateRecipeCapsule: () => {},
            });

            await ui.setTranslateMtPickMode('manual');
            assert.ok(ensureCalls >= 1, 'should load managed LLM catalog before painting manual list');
            assert.strictEqual(ui.getTranslateMtManualBrowse(), true);
        } finally {
            global.document = prevDocument;
        }
    });

    it('rebuildTranslateMenuMtSection uses dual columns for hybrid mode', () => {
        const classSet = new Set();
        const section = {
            classList: {
                toggle(name, on) {
                    if (on) classSet.add(name);
                    else classSet.delete(name);
                },
                add(name) { classSet.add(name); },
                remove(name) { classSet.delete(name); },
                contains(name) { return classSet.has(name); },
            },
        };
        const sectionLabel = { textContent: '', hidden: true, classList: { toggle() {} } };
        const polishSection = {
            hidden: true,
            classList: { toggle() {}, add() {} },
        };
        const polishLabel = { textContent: '' };
        const host = { innerHTML: '', appendChild() {} };
        const polishHost = { innerHTML: '', appendChild() {} };
        const prevDocument = global.document;
        global.document = {
            createElement: () => ({
                className: '',
                type: '',
                textContent: '',
                innerHTML: '',
                dataset: {},
                classList: { add() {}, toggle() {} },
                setAttribute() {},
                addEventListener() {},
                querySelector: () => ({ textContent: '' }),
                appendChild() {},
            }),
            getElementById: () => null,
        };
        try {
            const ui = createTranslateModeUi({
                els: {
                    translateMtSection: section,
                    translateMtSectionLabel: sectionLabel,
                    translatePolishSection: polishSection,
                    translatePolishSectionLabel: polishLabel,
                    translateMtModelList: host,
                    translateMtModelListWrap: { classList: { toggle() {} } },
                    translatePolishModelList: polishHost,
                    translatePolishModelListWrap: { classList: { toggle() {} } },
                    smartTranslateHybridCheck: { checked: true },
                    translateMtPickSwitch: {
                        classList: { add() {} },
                        setAttribute() {},
                        hidden: false,
                    },
                },
                getAdvancedEntitled: () => true,
                getCachedEngineModels: () => [{ id: 'sakura-7b', name: 'Sakura', installed: true, group: 'llm' }],
                getCachedSmartTranslatePick: () => ({
                    catalog: [{ id: 'qwen3-8b', name: 'Qwen', installed: true }],
                    smartTranslateModelId: 'qwen3-8b',
                }),
                readTaskFromForm: () => 'translate',
                readTranslateModeFromForm: () => 'smart',
                readLlmMtModelFromForm: () => '',
                isMtModelAutoSelected: () => true,
                listInstalledMtModelsForMode: () => [{ id: 'sakura-7b', name: 'Sakura' }],
                retranslatePlanApi: {
                    filterSmartTranslateCatalog: (catalog) => catalog || [],
                },
                isSmartTranslateCapableModel: () => true,
                formatEngineModelOptionLabel: (m) => m?.name || m?.id || '',
                syncModelsMenuDetailUi: () => {},
                syncModelsChipLabel: () => {},
                updateRecipeCapsule: () => {},
                translateChipApi: {},
            });
            ui.rebuildTranslateMenuMtSection();
            assert.ok(classSet.has('is-hybrid-dual'));
            assert.strictEqual(sectionLabel.textContent, '翻译模型');
            assert.strictEqual(polishLabel.textContent, '润色模型');
            assert.strictEqual(polishSection.hidden, false);
        } finally {
            global.document = prevDocument;
        }
    });

    it('rebuildTranslateMenuMtSection shows loading hint when catalog is warming', () => {
        const appended = [];
        const host = {
            innerHTML: '',
            appendChild(node) { appended.push(node); },
        };
        const prevDocument = global.document;
        global.document = {
            createElement: (tag) => ({
                tagName: tag,
                className: '',
                type: '',
                textContent: '',
                innerHTML: '',
                dataset: {},
                classList: { add() {}, toggle() {} },
                setAttribute() {},
                addEventListener() {},
                querySelector: () => ({ textContent: '' }),
                appendChild() {},
            }),
            getElementById: () => null,
        };
        try {
            const ui = createTranslateModeUi({
                els: {
                    translateMtModelList: host,
                    translateMtModelListWrap: { classList: { toggle() {} } },
                    translateMtAutoBtn: { classList: { toggle() {} }, setAttribute() {} },
                    translateMtManualBtn: { classList: { toggle() {} }, setAttribute() {} },
                },
                getAdvancedEntitled: () => true,
                getCachedEngineModels: () => [],
                getCachedSmartTranslatePick: () => ({ catalog: [] }),
                isModelsCatalogLoading: () => true,
                readTaskFromForm: () => 'translate',
                readTranslateModeFromForm: () => 'llm',
                isMtModelAutoSelected: () => true,
                syncModelsMenuDetailUi: () => {},
                syncModelsChipLabel: () => {},
                updateRecipeCapsule: () => {},
                translateChipApi: {},
            });
            ui.rebuildTranslateMenuMtSection();
            const hint = appended.find((n) => String(n.textContent || '').includes('正在加载模型数据'));
            assert.ok(hint, 'empty list while loading must show loading tip');
        } finally {
            global.document = prevDocument;
        }
    });

    it('keeps hybrid mode until entitlement is known, and restores pipeline checks', () => {
        let mode = 'llm';
        const polish = { checked: false };
        const verify = { checked: false };
        const address = { checked: false };
        const radios = {
            translateModeSakura: { checked: true, value: 'llm' },
            translateModeSmart: { checked: false, value: 'smart' },
            translateModeDialog: { checked: false, value: 'dialog' },
            translateModeExternal: { checked: false, value: 'external' },
        };
        function readMode() {
            if (radios.translateModeSmart.checked) return 'smart';
            if (radios.translateModeDialog.checked) return 'dialog';
            if (radios.translateModeExternal.checked) return 'external';
            return 'llm';
        }
        function setMode(next) {
            mode = next;
            radios.translateModeSakura.checked = next === 'llm';
            radios.translateModeSmart.checked = next === 'smart';
            radios.translateModeDialog.checked = next === 'dialog';
            radios.translateModeExternal.checked = next === 'external';
        }
        let entitled = false;
        let entitlementKnown = false;
        const ui = createTranslateModeUi({
            els: {
                ...radios,
                smartTranslatePolishCheck: polish,
                smartTranslateVerifyCheck: verify,
                smartTranslateAddressCheck: address,
            },
            getAdvancedEntitled: () => entitled,
            getAdvancedEntitlementKnown: () => entitlementKnown,
            readTaskFromForm: () => 'translate',
            readTranslateModeFromForm: readMode,
            setTranslateModeRadios: setMode,
            translateChipApi: {},
            syncExpertExtraChipsUi: () => {},
        });
        ui.applyTranslateModeToForm('smart');
        assert.strictEqual(mode, 'smart');
        assert.strictEqual(polish.checked, true);
        assert.strictEqual(verify.checked, true);
        assert.strictEqual(address.checked, true);

        polish.checked = false;
        verify.checked = false;
        address.checked = false;
        ui.applyTranslateModeToForm('smart');
        assert.strictEqual(polish.checked, false, 'already on hybrid must keep an explicit off');

        setMode('llm');
        ui.applyTranslateModeToForm('smart');
        assert.strictEqual(polish.checked, true);
        assert.strictEqual(verify.checked, true);
        assert.strictEqual(address.checked, true);

        entitlementKnown = true;
        ui.applyTranslateModeToForm('smart');
        assert.strictEqual(mode, 'llm', 'known non-Pro still falls back to 推理翻译');
    });
});
