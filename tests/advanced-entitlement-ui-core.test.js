'use strict';

const assert = require('assert');
const {
    createAdvancedEntitlementUi,
    PRO_GATED_TAB_TITLES,
    AFDIAN_PRO_PURCHASE_URL,
} = require('../src/js/advanced-entitlement-ui-core.js');

describe('TransubAdvancedEntitlementUi', () => {
    it('exports createAdvancedEntitlementUi and constants', () => {
        assert.strictEqual(typeof createAdvancedEntitlementUi, 'function');
        assert.ok(PRO_GATED_TAB_TITLES['pro-smart-translate']);
        assert.ok(!PRO_GATED_TAB_TITLES['pro-llm']);
        assert.ok(String(AFDIAN_PRO_PURCHASE_URL).includes('afdian.com'));
    });

    it('isProGatedTab uses resolveParamsTab', () => {
        const ui = createAdvancedEntitlementUi({
            resolveParamsTab: (id) => (id === 'llm' ? 'pro-smart-translate' : String(id || 'runtime')),
            getAdvancedEntitled: () => false,
        });
        assert.strictEqual(ui.isProGatedTab('llm'), true);
        assert.strictEqual(ui.isProGatedTab('pro-film-audio'), true);
        assert.strictEqual(ui.isProGatedTab('runtime'), false);
    });

    it('setAdvancedEntitled updates entitled state and clears free Pro flags', () => {
        let entitled = false;
        let known = false;
        let freeInfo = { ok: false };
        const filmAudioEnhanceCheck = { checked: true };
        const filmVadPresetCheck = { checked: true };
        let translateMode = 'smart';
        let qcMode = 'smart';
        const ui = createAdvancedEntitlementUi({
            els: {
                filmAudioEnhanceCheck,
                filmVadPresetCheck,
                smartTranslateCheck: { checked: true },
                engineLlmMtModelSelect: { value: '' },
            },
            getAdvancedEntitled: () => entitled,
            setAdvancedEntitledState: (v) => { entitled = !!v; },
            getAdvancedEntitlementKnown: () => known,
            setAdvancedEntitlementKnown: (v) => { known = !!v; },
            setFreePipelineTranslate: (v) => { freeInfo = v; },
            getIsStandaloneSettings: () => true,
            getIsStandaloneWizard: () => true,
            readTranslateModeFromForm: () => translateMode,
            applyTranslateModeToForm: (m) => { translateMode = m; },
            getPostBatchQcFixMode: () => qcMode,
            setPostBatchQcFixMode: async (m) => { qcMode = m; },
            getCachedEnginePickCatalog: () => [],
        });
        ui.setAdvancedEntitled(false, { ok: true, modelId: 'x' });
        assert.strictEqual(entitled, false);
        assert.strictEqual(known, true);
        assert.strictEqual(freeInfo.ok, true);
        assert.strictEqual(filmAudioEnhanceCheck.checked, false);
        assert.strictEqual(filmVadPresetCheck.checked, false);
        assert.strictEqual(translateMode, 'engine');
        assert.strictEqual(qcMode, 'fix');
    });

    it('promptProUnlockRequired opens purchase URL and Pro settings on primary', async () => {
        const opened = [];
        let settingsTab = null;
        const ui = createAdvancedEntitlementUi({
            electron: {
                openExternal: async (url) => { opened.push(url); },
            },
            appConfirmChoice: async () => 'primary',
            openAppSettings: (tab) => { settingsTab = tab; },
            setSaveParamsStatus: () => {},
            uiTf: (s, vars) => s.replace('{label}', vars.label),
        });
        const ok = await ui.promptProUnlockRequired({ featureLabel: '智能翻译' });
        assert.strictEqual(ok, true);
        assert.deepStrictEqual(opened, [AFDIAN_PRO_PURCHASE_URL]);
        assert.strictEqual(settingsTab, 'pro');
    });

    it('promptProUnlockRequired opens Pro settings on tertiary without purchase URL', async () => {
        const opened = [];
        let settingsTab = null;
        const ui = createAdvancedEntitlementUi({
            electron: {
                openExternal: async (url) => { opened.push(url); },
            },
            appConfirmChoice: async () => 'tertiary',
            openAppSettings: (tab) => { settingsTab = tab; },
            setSaveParamsStatus: () => {},
            uiTf: (s, vars) => s.replace('{label}', vars.label),
        });
        const ok = await ui.promptProUnlockRequired({ featureLabel: '智能翻译' });
        assert.strictEqual(ok, true);
        assert.deepStrictEqual(opened, []);
        assert.strictEqual(settingsTab, 'pro');
    });

    it('syncEngineModelsLabGate locks lab button when not entitled', () => {
        const classes = new Set();
        const btn = {
            classList: {
                toggle(name, on) {
                    if (on) classes.add(name);
                    else classes.delete(name);
                },
            },
            setAttribute() {},
            title: '',
        };
        const ui = createAdvancedEntitlementUi({
            els: { engineModelsLabBtn: btn },
            getAdvancedEntitled: () => false,
            getEngineModelsStatusFilter: () => 'all',
        });
        ui.syncEngineModelsLabGate();
        assert.ok(classes.has('is-pro-locked'));
        assert.ok(String(btn.title).includes('Pro'));
    });
});
