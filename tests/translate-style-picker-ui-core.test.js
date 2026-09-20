'use strict';

const assert = require('assert');
const { createTranslateStylePickerUi } = require('../src/js/translate-style-picker-ui-core.js');

describe('TransubTranslateStylePickerUi', () => {
    it('exports createTranslateStylePickerUi', () => {
        assert.strictEqual(typeof createTranslateStylePickerUi, 'function');
    });

    it('resolveTranslateStyleTargets prefers selected items', () => {
        const state = {
            items: [
                { path: 'a.mp4', selected: false },
                { path: 'b.mp4', selected: true },
            ],
            focusedTaskPath: 'a.mp4',
        };
        const ui = createTranslateStylePickerUi({
            state,
            els: {},
            normPath: (p) => p,
        });
        const targets = ui.resolveTranslateStyleTargets();
        assert.strictEqual(targets.length, 1);
        assert.strictEqual(targets[0].path, 'b.mp4');
    });

    it('populateTranslateStylePickerSelect adds global + presets', () => {
        const options = [];
        const selectEl = {
            value: '',
            options,
            innerHTML: 'x',
            appendChild(el) { options.push(el); },
        };
        const ui = createTranslateStylePickerUi({
            state: { items: [] },
            els: {},
            getDocument: () => ({
                createElement: () => ({ value: '', textContent: '' }),
            }),
            translateStyleApi: {
                listPresetOptions: () => [{ id: 'natural_spoken', label: '自然口语' }],
            },
            getAdvancedEntitled: () => true,
        });
        ui.populateTranslateStylePickerSelect(selectEl, { includeGlobal: true });
        assert.strictEqual(options.length, 2);
        assert.strictEqual(options[0].value, '');
        assert.strictEqual(options[1].value, 'natural_spoken');
    });

    it('applyTranslateStyleEnabled stays on without settings checkbox', () => {
        const chipLabel = { textContent: '禁用' };
        const enableBtns = [
            { getAttribute: () => '0', classList: { toggle() {} } },
            { getAttribute: () => '1', classList: { toggle() {} } },
        ];
        const listWrap = {
            classList: {
                contains: () => true,
                add() {},
                remove() {},
                toggle() {},
            },
            hidden: true,
        };
        const menu = {
            querySelectorAll: () => enableBtns,
            contains: () => true,
            classList: { toggle() {} },
            addEventListener() {},
        };
        const chipBtn = {
            title: '',
            setAttribute() {},
            addEventListener() {},
            dataset: {},
        };
        const nodes = {
            translateStyleChipLabel: chipLabel,
            setTranslateStyleBtn: chipBtn,
            translateStyleMenu: menu,
            translateStylePresetListWrap: listWrap,
            translateStylePresetList: {
                innerHTML: '',
                appendChild() {},
            },
            translateStylePresetSelect: { value: 'natural_spoken', disabled: false },
        };
        const ui = createTranslateStylePickerUi({
            state: { items: [] },
            els: {},
            getDocument: () => ({
                getElementById: (id) => nodes[id] || null,
                createElement: () => ({
                    type: '',
                    className: '',
                    setAttribute() {},
                    appendChild() {},
                    querySelector: () => ({ textContent: '' }),
                }),
            }),
            translateStyleApi: {
                getPresetShortLabel: () => '口语',
                getPresetLabel: () => '自然口语',
                listPresetOptions: () => [{ id: 'natural_spoken', label: '自然口语' }],
                normalizeTranslateStylePreset: (v) => v,
                DEFAULT_PRESET: 'natural_spoken',
            },
            persistFormOptionsQuiet: async () => {},
            updateTranslateStyleUi: () => {},
            appendLog: () => {},
        });
        ui.applyTranslateStyleEnabled(true, { persist: false });
        assert.strictEqual(ui.getTranslateStyleEnabled(), true);
        assert.strictEqual(chipLabel.textContent, '口语');
        // Remote echo must not clobber a fresh local enable.
        ui.setTranslateStyleEnabledState(false, { fromRemote: true });
        assert.strictEqual(ui.getTranslateStyleEnabled(), true);
        ui.applyTranslateStyleEnabled(false, { persist: false });
        assert.strictEqual(ui.getTranslateStyleEnabled(), false);
        assert.strictEqual(chipLabel.textContent, '禁用');
    });

    it('ignores disable shortly after enable (ghost click guard)', () => {
        const clicks = [];
        const enableBtns = [
            {
                getAttribute: () => '0',
                classList: { toggle() {} },
            },
            {
                getAttribute: () => '1',
                classList: { toggle() {} },
            },
        ];
        let menuHandler = null;
        const menu = {
            querySelectorAll: () => enableBtns,
            contains: () => true,
            classList: { toggle() {} },
            addEventListener(type, fn) {
                if (type === 'click') menuHandler = fn;
            },
        };
        const chipBtn = {
            title: '',
            setAttribute() {},
            addEventListener() {},
        };
        const listWrap = {
            classList: {
                contains: () => true,
                add() {},
                remove() {},
                toggle() {},
            },
            hidden: true,
        };
        const nodes = {
            translateStyleChipLabel: { textContent: '禁用' },
            setTranslateStyleBtn: chipBtn,
            translateStyleMenu: menu,
            translateStylePresetListWrap: listWrap,
            translateStylePresetList: { innerHTML: '', appendChild() {} },
            translateStylePresetSelect: { value: 'natural_spoken', disabled: false },
        };
        const ui = createTranslateStylePickerUi({
            state: { items: [] },
            els: {},
            getDocument: () => ({
                getElementById: (id) => nodes[id] || null,
                createElement: () => ({
                    type: '',
                    className: '',
                    setAttribute() {},
                    appendChild() {},
                    querySelector: () => ({ textContent: '' }),
                }),
            }),
            translateStyleApi: {
                getPresetShortLabel: () => '口语',
                getPresetLabel: () => '自然口语',
                listPresetOptions: () => [{ id: 'natural_spoken', label: '自然口语' }],
                normalizeTranslateStylePreset: (v) => v,
                DEFAULT_PRESET: 'natural_spoken',
            },
            persistFormOptionsQuiet: async () => {},
            updateTranslateStyleUi: () => {},
            appendLog: (msg) => { clicks.push(msg); },
        });
        ui.bindTranslateStyleChipEvents();
        assert.ok(typeof menuHandler === 'function');
        menuHandler({
            preventDefault() {},
            stopPropagation() {},
            target: {
                closest: (sel) => (sel === '[data-style-enable]' ? enableBtns[1] : null),
            },
        });
        assert.strictEqual(ui.getTranslateStyleEnabled(), true);
        menuHandler({
            preventDefault() {},
            stopPropagation() {},
            target: {
                closest: (sel) => (sel === '[data-style-enable]' ? enableBtns[0] : null),
            },
        });
        assert.strictEqual(ui.getTranslateStyleEnabled(), true, 'ghost disable should be ignored');
    });

    it('setTranslateStyleMenuOpen excepts self when closing siblings', () => {
        const closed = [];
        let hidden = true;
        const menu = {
            classList: {
                toggle(_c, force) { hidden = !!force; },
            },
            querySelectorAll: () => [],
            addEventListener() {},
            contains: () => false,
        };
        const chipBtn = {
            setAttribute() {},
            addEventListener() {},
            dataset: {},
            title: '',
        };
        const ui = createTranslateStylePickerUi({
            state: { items: [] },
            els: {
                translateStyleMenu: menu,
                setTranslateStyleBtn: chipBtn,
            },
            getDocument: () => ({
                getElementById: (id) => {
                    if (id === 'translateStyleMenu') return menu;
                    if (id === 'setTranslateStyleBtn') return chipBtn;
                    return null;
                },
            }),
            closeSiblingMenus: (except) => {
                closed.push(except);
                if (except !== 'style') ui.setTranslateStyleMenuOpen(false);
            },
            translateStyleApi: {
                getPresetShortLabel: () => '口语',
                listPresetOptions: () => [],
            },
        });
        ui.setTranslateStyleMenuOpen(true);
        assert.strictEqual(ui.getTranslateStyleMenuOpen(), true);
        assert.strictEqual(hidden, false);
        assert.deepStrictEqual(closed, ['style']);
    });
});
