const assert = require('assert');
require('../src/js/subtitle-editor/batch-cue-filter-plan');
const { installBatchDeleteUi } = require('../src/js/subtitle-editor/batch-delete-ui');

describe('batch-delete-ui editor part', () => {
    it('deletes matching cues with undo hooks', async () => {
        const state = {
            cues: [
                { startMs: 0, endMs: 1000, text: 'ok' },
                { startMs: 1000, endMs: 2000, text: '…' },
                { startMs: 2000, endMs: 3000, text: '...' },
            ],
            selectedIndex: 1,
            selectedIndices: new Set([1]),
        };
        const hooks = { undo: 0, dirty: 0, rendered: 0, selection: null };
        const els = {
            batchDeletePattern: { value: '…', addEventListener() {} },
            batchDeleteMatchEquals: { checked: true, addEventListener() {} },
            batchDeleteMatchContains: { checked: false, addEventListener() {} },
            batchDeleteScopeAll: { checked: true, addEventListener() {} },
            batchDeleteScopeSelected: { checked: false, addEventListener() {} },
            batchDeletePreview: { textContent: '', classList: { add() {}, toggle() {} } },
            batchDeleteConfirm: { disabled: false, addEventListener() {} },
            batchDeleteCancel: { addEventListener() {} },
            batchDeleteBtn: { dataset: {}, addEventListener() {} },
            batchDeleteMenuBtn: { dataset: {}, addEventListener() {} },
            batchDeleteModal: {
                dataset: {},
                classList: { add() {}, remove() {}, contains: () => true },
                querySelectorAll: () => [],
            },
        };
        const api = installBatchDeleteUi({
            state,
            els,
            setStatus: () => {},
            showEditorModal: () => {},
            hideEditorModal: () => {},
            getSelectedCueIndexes: () => [],
            syncDetailToCue: () => {},
            recordUndoBeforeChange: () => { hooks.undo += 1; },
            setDirty: () => { hooks.dirty += 1; },
            renderCueList: () => { hooks.rendered += 1; },
            setSelection: (indexes, primary) => { hooks.selection = { indexes, primary }; },
            editorConfirm: async () => true,
        });
        const matched = api.collectMatches(api.readForm());
        assert.deepStrictEqual(matched, [1, 2]);
        await api.confirmRun();
        assert.strictEqual(hooks.undo, 1);
        assert.strictEqual(hooks.dirty, 1);
        assert.strictEqual(hooks.rendered, 1);
        assert.deepStrictEqual(state.cues.map((c) => c.text), ['ok']);
        assert.deepStrictEqual(hooks.selection, { indexes: [0], primary: 0 });
    });

    it('is registered in subtitle-editor.html', () => {
        const fs = require('fs');
        const path = require('path');
        const html = fs.readFileSync(path.join(__dirname, '../src/subtitle-editor.html'), 'utf8');
        assert.ok(html.includes('js/subtitle-editor/batch-delete-ui.js'));
        assert.ok(html.includes('editorBatchDeleteBtn'));
        assert.ok(html.includes('editorBatchDeleteModal'));
    });
});
