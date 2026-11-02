'use strict';

const assert = require('assert');
const core = require('../src/js/pre-mt-onomatopoeia-clean-core');

describe('pre-mt-onomatopoeia-clean-core', () => {
    it('exports applyPreMtOnomatopoeiaClean', () => {
        assert.strictEqual(typeof core.applyPreMtOnomatopoeiaClean, 'function');
    });

    it('off leaves cues untouched', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁはぁ' },
            { start: 1, end: 2, text: '今日はいい天気ですね' },
        ];
        const out = core.applyPreMtOnomatopoeiaClean(cues, { postBatchOnomatopoeiaMode: 'off' });
        assert.strictEqual(out.mode, 'off');
        assert.strictEqual(out.changed, false);
        assert.strictEqual(out.cues.length, 2);
    });

    it('clear drops pure JA onomatopoeia before MT', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁはぁ' },
            { start: 1, end: 2, text: '今日はいい天気ですね' },
            { start: 2, end: 3, text: 'ふふっ' },
            { start: 3, end: 4, text: 'うん' },
        ];
        const out = core.applyPreMtOnomatopoeiaClean(cues, {
            postBatchOnomatopoeiaMode: 'clear',
            language: 'ja',
        });
        assert.strictEqual(out.mode, 'clear');
        assert.ok(out.dropped >= 2);
        assert.ok(out.cues.some((c) => /天気/.test(c.text)));
        assert.ok(out.cues.some((c) => c.text === 'うん'), 'discourse うん should be kept');
        assert.ok(!out.cues.some((c) => /はぁ/.test(c.text)));
    });

    it('light softens without dropping cue count', () => {
        const cues = [
            { start: 0, end: 1, text: 'ああああああ' },
            { start: 1, end: 2, text: '待ってください' },
        ];
        const out = core.applyPreMtOnomatopoeiaClean(cues, {
            postBatchOnomatopoeiaMode: 'light',
            language: 'ja',
        });
        assert.strictEqual(out.mode, 'light');
        assert.strictEqual(out.cues.length, 2);
        assert.strictEqual(out.dropped, 0);
    });

    it('defaults to clear when mode omitted', () => {
        const out = core.applyPreMtOnomatopoeiaClean(
            [{ start: 0, end: 1, text: 'はぁ' }],
            {},
        );
        assert.strictEqual(out.mode, 'clear');
        assert.strictEqual(out.dropped, 1);
        assert.strictEqual(out.cues.length, 0);
    });

    it('av_soft forces clear even when user mode is off', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁ' },
            { start: 1, end: 2, text: '待ってください' },
        ];
        const out = core.applyPreMtOnomatopoeiaClean(cues, {
            postBatchOnomatopoeiaMode: 'off',
            contentProfile: 'av_soft',
            language: 'ja',
        });
        assert.strictEqual(out.mode, 'clear');
        assert.ok(out.dropped >= 1);
        assert.ok(out.cues.some((c) => /待って/.test(c.text)));
    });
});
