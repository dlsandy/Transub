'use strict';

const assert = require('assert');
const { createTwaiModelSelectUi } = require('../src/js/twai-model-select-ui-core.js');

describe('TransubTwaiModelSelectUi', () => {
    it('exports createTwaiModelSelectUi', () => {
        assert.strictEqual(typeof createTwaiModelSelectUi, 'function');
    });

    it('kindBadge labels kinds and signature source', () => {
        const ui = createTwaiModelSelectUi({});
        assert.strictEqual(ui.kindBadge('transcribe'), '转写');
        assert.strictEqual(ui.kindBadge('translate', { kindSource: 'signature' }), '翻译·特征');
        assert.strictEqual(ui.kindBadge('root', { kindSource: 'name' }), '默认·名称');
    });

    it('fillModelSelect prefers kind and keeps custom path', () => {
        const selectEl = {
            options: [],
            value: '',
            innerHTML: '',
        };
        Object.defineProperty(selectEl, 'innerHTML', {
            set(v) {
                this._html = v;
                this.options = String(v).match(/<option[^>]*>/g)?.map((tag) => {
                    const m = tag.match(/value="([^"]*)"/);
                    return { value: m ? m[1].replace(/&quot;/g, '"') : '' };
                }) || [];
            },
            get() { return this._html || ''; },
        });
        const ui = createTwaiModelSelectUi({ esc: (s) => String(s) });
        ui.fillModelSelect(selectEl, [
            { path: 'C:/models/mt', label: 'MT', kind: 'translate' },
            { path: 'C:/models/asr', label: 'ASR', kind: 'transcribe' },
        ], 'C:/models/asr', 'transcribe');
        assert.ok(selectEl.innerHTML.includes('ASR'));
        assert.ok(selectEl.innerHTML.indexOf('ASR') < selectEl.innerHTML.indexOf('MT')
            || selectEl.innerHTML.includes('selected'));
        assert.strictEqual(selectEl.value.replace(/\\/g, '/'), 'C:/models/asr');
    });

    it('read/set model path round-trip via form inputs', () => {
        const els = {
            transcribeModelPathInput: { value: '' },
            translateModelPathInput: { value: '' },
            transcribeModelSelect: { options: [], value: '', appendChild() {}, },
            translateModelSelect: { options: [], value: '', appendChild() {}, },
        };
        // Minimal HTMLSelectElement-ish options iterable
        els.transcribeModelSelect.options = [];
        els.translateModelSelect.options = [];
        const ui = createTwaiModelSelectUi({ els });
        ui.setModelPathOnForm('transcribe', 'D:\\m\\asr', { syncSelect: false });
        assert.strictEqual(ui.readModelPathFromForm('transcribe'), 'D:\\m\\asr');
        ui.setModelPathOnForm('translate', 'D:\\m\\mt', { syncSelect: false });
        assert.strictEqual(ui.readModelPathFromForm('translate'), 'D:\\m\\mt');
    });
});
