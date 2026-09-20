const assert = require('assert');
require('../src/js/subtitle-editor/batch-cue-filter-plan');
const { installBatchRetranslateUi } = require('../src/js/subtitle-editor/batch-retranslate-ui');

describe('batch-retranslate-ui editor part', () => {
    it('collects matches from pattern and wires confirm payload', async () => {
        const state = {
            cues: [
                { startMs: 0, endMs: 1000, text: 'ok' },
                { startMs: 1000, endMs: 2000, text: '…' },
                { startMs: 2000, endMs: 3000, text: '...' },
            ],
            selectedIndex: -1,
            reconstructBusy: false,
            computeBusy: false,
        };
        const calls = [];
        const els = {
            batchRetranslatePattern: { value: '…', addEventListener() {} },
            batchRetranslateMatchEquals: { checked: true, addEventListener() {} },
            batchRetranslateMatchContains: { checked: false, addEventListener() {} },
            batchRetranslateScopeAll: { checked: true, addEventListener() {} },
            batchRetranslateScopeSelected: { checked: false, addEventListener() {} },
            batchRetranslateEngineLlm: { checked: true, addEventListener() {} },
            batchRetranslateEngineSmart: { checked: false, addEventListener() {} },
            batchRetranslatePreview: { textContent: '', classList: { add() {}, toggle() {} } },
            batchRetranslateConfirm: { disabled: false, addEventListener() {} },
            batchRetranslateCancel: { addEventListener() {} },
            batchRetranslateBtn: { dataset: {}, addEventListener() {} },
            batchRetranslateModal: {
                classList: { add() {}, remove() {}, contains: () => true },
                querySelectorAll: () => [],
            },
        };
        const api = installBatchRetranslateUi({
            state,
            els,
            electron: {
                transubSakuraTranslate: async () => ({ ok: true }),
            },
            setStatus: () => {},
            showEditorModal: () => {},
            hideEditorModal: () => {},
            getSelectedCueIndexes: () => [],
            runTextTranslateOnce: async (opts) => {
                calls.push(opts);
                return { status: 'done', summary: 'ok' };
            },
        });
        const matched = api.collectMatches(api.readForm());
        assert.deepStrictEqual(matched, [1, 2]);
        const preview = api.syncPreview();
        assert.strictEqual(preview.preview.isErr, false);
        await api.confirmRun();
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].cueIndexes, [1, 2]);
        assert.strictEqual(calls[0].engine, 'llm');
    });

    it('is registered in subtitle-editor.html', () => {
        const fs = require('fs');
        const path = require('path');
        const html = fs.readFileSync(path.join(__dirname, '../src/subtitle-editor.html'), 'utf8');
        assert.ok(html.includes('js/subtitle-editor/batch-retranslate-ui.js'));
        assert.ok(html.includes('editorBatchRetranslateBtn'));
        assert.ok(html.includes('editorBatchRetranslateModal'));
    });
});
