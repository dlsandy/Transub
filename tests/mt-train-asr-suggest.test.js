'use strict';

const assert = require('assert');
const asrSuggest = require('../tools/mt-train/lib/asr-suggest');

describe('mt-train asr-suggest', () => {
    it('suggests correction from SSOT table (免税→メンエス)', () => {
        const hit = asrSuggest.suggestAsrCorrection('免税してはダメ', {
            pairs: [{ from: '免税して', to: 'メンエス', source: 'ssot' }],
        });
        assert.ok(hit);
        assert.strictEqual(hit.from, '免税して');
        assert.strictEqual(hit.applied, 'メンエスはダメ');
    });

    it('enrichAsrDraft fills empty to', () => {
        const d = asrSuggest.enrichAsrDraft({
            from: '免税して',
            to: '',
            fullJa: '免税しては来ないで',
            reason: 'asr',
        }, {
            pairs: [
                { from: '免税しては', to: 'メンエスは', source: 'ssot' },
                { from: '免税して', to: 'メンエス', source: 'ssot' },
            ],
        });
        assert.ok(d.to);
        assert.ok(d.suggestSource);
        assert.notStrictEqual(d.to, d.from);
    });

    it('does not override existing to', () => {
        const d = asrSuggest.enrichAsrDraft({
            from: '免税して',
            to: '手工纠正',
            fullJa: '免税して',
        }, {
            pairs: [{ from: '免税して', to: 'メンエス', source: 'ssot' }],
        });
        assert.strictEqual(d.to, '手工纠正');
    });
});
