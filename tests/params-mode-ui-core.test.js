'use strict';

const assert = require('assert');
const { createParamsModeUi } = require('../src/js/params-mode-ui-core.js');

function installMinimalDocument() {
    global.document = {
        getElementById: () => null,
        createElement: (tag) => ({
            tagName: String(tag || '').toUpperCase(),
            className: '',
            classList: { toggle() {}, add() {}, remove() {} },
            style: {},
            dataset: {},
            textContent: '',
            title: '',
            setAttribute() {},
            appendChild() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
        }),
    };
}

describe('TransubParamsModeUi', () => {
    it('exports createParamsModeUi', () => {
        assert.strictEqual(typeof createParamsModeUi, 'function');
    });

    it('isAutoSenseEnabled is always false', () => {
        installMinimalDocument();
        const ui = createParamsModeUi({
            state: { items: [] },
            els: { presetSelect: { value: '', options: [] } },
            renderList: () => {},
            syncTranslateChipUi: () => {},
            persistFormOptionsQuiet: async () => {},
            syncModelsChipLabel: () => {},
            updateRecipeCapsule: () => {},
            syncModelsMenuDetailUi: () => {},
            updateStartButton: () => {},
        });

        assert.strictEqual(ui.isAutoSenseEnabled(), false);
        ui.setAutoSenseEnabled(true, { persist: false });
        assert.strictEqual(ui.isAutoSenseEnabled(), false);
    });

    it('rebuildParamsModePresetItems lists active group without scenes presetSelect', () => {
        installMinimalDocument();
        const host = {
            innerHTML: '',
            children: [],
            appendChild(el) { this.children.push(el); },
        };
        const tabsHost = {
            innerHTML: '',
            classList: { toggle() {} },
            appendChild() {},
        };
        global.document.getElementById = (id) => {
            if (id === 'paramsModePresetList') return host;
            if (id === 'paramsModePresetTabs') return tabsHost;
            return null;
        };
        global.document.createElement = (tag) => ({
            tagName: String(tag || '').toUpperCase(),
            className: '',
            classList: { toggle() {}, add() {}, remove() {} },
            style: {},
            dataset: {},
            textContent: '',
            title: '',
            setAttribute() {},
            appendChild(child) {
                this.children = this.children || [];
                this.children.push(child);
            },
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
        });
        const els = {
            presetSelect: null,
            paramsModePresetList: host,
            paramsModePresetTabs: tabsHost,
        };
        const ui = createParamsModeUi({
            state: { items: [] },
            els,
            renderList: () => {},
            syncTranslateChipUi: () => {},
            persistFormOptionsQuiet: async () => {},
            syncModelsChipLabel: () => {},
            updateRecipeCapsule: () => {},
            syncModelsMenuDetailUi: () => {},
            updateStartButton: () => {},
            setModelsMenuOpen: () => {},
            setFactoryWorkspace: () => {},
        });
        ui.applyActivePresetIdToSelect('ja-av-qwen3-galgame-ten');
        ui.rebuildParamsModePresetItems([
            { id: 'ja-av-qwen3-galgame-ten', group: 'ja', name: '软声 Qwen3', builtin: true },
            { id: 'anime-whisper', group: 'ja', name: 'Anime Whisper', builtin: true },
        ], { preferActiveGroup: true });

        assert.strictEqual(ui.getActiveParamsPresetId(), 'ja-av-qwen3-galgame-ten');
        assert.ok(ui.getParamsModePresetCache().length >= 2);
        const items = host.children.filter((el) => el?.dataset?.presetId);
        assert.ok(items.some((el) => el.dataset.presetId === 'ja-av-qwen3-galgame-ten'));
        assert.ok(!host.children.some((el) => el.textContent === '该分类暂无预设'));
    });

    it('selectParamsModePresetsBrowse stays in menu and does not jump to scenes', () => {
        installMinimalDocument();
        const workspaces = [];
        const menuOpenCalls = [];
        const presetsBtn = {
            classList: {
                toggled: {},
                toggle(name, on) { this.toggled[name] = !!on; },
            },
            setAttribute(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = v; },
            dataset: {},
        };
        const els = {
            autoDeepSenseCheck: { checked: true },
            presetSelect: { value: '', options: [] },
            modelsMenu: {
                querySelectorAll(sel) {
                    if (sel.includes('presets') || sel.includes('custom')) return [presetsBtn];
                    return [];
                },
            },
        };
        const ui = createParamsModeUi({
            state: { items: [] },
            els,
            renderList: () => {},
            syncTranslateChipUi: () => {},
            persistFormOptionsQuiet: async () => {},
            syncModelsChipLabel: () => {},
            updateRecipeCapsule: () => {},
            syncModelsMenuDetailUi: () => {},
            updateStartButton: () => {},
            setModelsMenuOpen: () => {},
            setFactoryWorkspace: (id) => { workspaces.push(id); },
            setParamsModeMenuOpen: (open) => { menuOpenCalls.push(open); },
            showToast: () => {},
        });

        ui.selectParamsModePresetsBrowse({ persist: false });
        assert.strictEqual(ui.isAutoSenseEnabled(), false);
        assert.deepStrictEqual(workspaces, []);
        assert.deepStrictEqual(menuOpenCalls, []);
        assert.doesNotThrow(() => ui.syncParamsModeChipUi());
    });
});
