'use strict';

const assert = require('assert');
const { createEngineModelsLabUi } = require('../src/js/engine-models-lab-ui-core.js');

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
    };
}

describe('TransubEngineModelsLabUi', () => {
    it('exports createEngineModelsLabUi', () => {
        assert.strictEqual(typeof createEngineModelsLabUi, 'function');
    });

    it('setEngineModelsLabFormStatus / sync preview / modal open smoke', () => {
        const statusEl = {
            textContent: '',
            classList: makeClassList(),
        };
        const preview = { hidden: true, textContent: '' };
        const modal = {
            classList: makeClassList(['hidden']),
            hidden: true,
            setAttribute() {},
        };
        const nameInput = { value: '' };
        const urlInput = { value: 'https://example.com/foo.gguf', focus() {} };
        const fileInput = { value: '' };
        const els = {
            engineModelsLabFormStatus: statusEl,
            engineModelsLabPreview: preview,
            engineModelsLabModal: modal,
            engineModelsLabNameInput: nameInput,
            engineModelsLabUrlInput: urlInput,
            engineModelsLabFileInput: fileInput,
            engineModelsLabParamsInput: { value: '' },
            engineModelsLabList: { innerHTML: '' },
            engineModelsLabListCount: { textContent: '' },
        };
        let cached = null;
        const ui = createEngineModelsLabUi({
            els,
            electron: {
                transubAdvancedManagedLlmStatus: async () => ({
                    managed: { managedLlm: { labModels: [] }, catalog: [] },
                }),
            },
            getAdvancedEntitled: () => true,
            getManagedLlmCatalogApi: () => ({
                fileNameFromGgufUrl: (url) => {
                    const m = String(url || '').match(/([^/?#]+\.gguf)/i);
                    return m ? m[1] : '';
                },
                slugifyLabModelId: (s) => String(s || '').replace(/\.gguf$/i, '').toLowerCase(),
            }),
            setCachedManagedLabModels: (v) => { cached = v; },
        });

        assert.strictEqual(typeof ui.bindEngineModelsLabUi, 'function');
        assert.strictEqual(typeof ui.openEngineModelsLab, 'function');
        assert.strictEqual(typeof ui.refreshEngineModelsLabList, 'function');
        assert.strictEqual(typeof ui.submitLabAdd, 'function');

        ui.setEngineModelsLabFormStatus('hello', 'ok');
        assert.strictEqual(statusEl.textContent, 'hello');
        assert.ok(statusEl.classList.contains('is-ok'));

        ui.maybeAutofillLabFieldsFromUrl();
        assert.strictEqual(fileInput.value, 'foo.gguf');
        assert.strictEqual(nameInput.value, 'foo');
        assert.strictEqual(preview.hidden, false);
        assert.ok(String(preview.textContent).includes('foo'));

        ui.setEngineModelsLabModalOpen(true);
        assert.ok(!modal.classList.contains('hidden'));
        assert.strictEqual(modal.hidden, false);

        ui.closeEngineModelsLab();
        assert.ok(modal.classList.contains('hidden'));
        assert.strictEqual(modal.hidden, true);
        assert.strictEqual(cached, null);
    });

    it('bindEngineModelsLabUi is idempotent', () => {
        const listeners = [];
        const makeEl = () => ({
            addEventListener(type, fn) { listeners.push([type, fn]); },
        });
        const ui = createEngineModelsLabUi({
            els: {
                engineModelsLabUrlInput: makeEl(),
                engineModelsLabFileInput: makeEl(),
                engineModelsLabNameInput: makeEl(),
                engineModelsLabParamsInput: makeEl(),
                engineModelsLabBtn: makeEl(),
                closeEngineModelsLabBtn: makeEl(),
                engineModelsLabModal: makeEl(),
                engineModelsLabOpenFolderBtn: makeEl(),
                engineModelsLabAddBtn: makeEl(),
                engineModelsLabList: makeEl(),
            },
            getDocument: () => ({
                addEventListener(type, fn) { listeners.push([`doc:${type}`, fn]); },
                getElementById: () => null,
            }),
            getAdvancedEntitled: () => false,
        });
        ui.bindEngineModelsLabUi();
        const n = listeners.length;
        assert.ok(n > 0);
        ui.bindEngineModelsLabUi();
        assert.strictEqual(listeners.length, n);
    });
});
