'use strict';

const assert = require('assert');
const core = require('../src/js/pre-mt-source-filler-clean-core');

describe('pre-mt-source-filler-clean-core', () => {
    it('exports applyPreMtSourceFillerClean', () => {
        assert.strictEqual(typeof core.applyPreMtSourceFillerClean, 'function');
        assert.strictEqual(typeof core.applyPreMtDiscourseClean, 'function');
    });

    it('clear drops pure JA discourse and onomatopoeia before MT', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁはぁ' },
            { start: 1, end: 2, text: 'うん' },
            { start: 2, end: 3, text: '今日はいい天気ですね' },
            { start: 3, end: 4, text: 'ええ' },
        ];
        const out = core.applyPreMtSourceFillerClean(cues, {
            postBatchOnomatopoeiaMode: 'clear',
            postBatchInterjectionMode: 'clear',
            language: 'ja',
        });
        assert.ok(out.changed);
        assert.ok(out.cues.some((c) => /天気/.test(c.text)));
        assert.ok(!out.cues.some((c) => /はぁ/.test(c.text)));
        assert.ok(!out.cues.some((c) => c.text === 'うん'));
        assert.ok(!out.cues.some((c) => c.text === 'ええ'));
        assert.ok(out.dropped >= 3);
    });

    it('clear peels JA lead breath on mixed cues', () => {
        const cues = [
            { start: 0, end: 1, text: 'うん、大丈夫？' },
            { start: 1, end: 2, text: 'あぁ、手が…' },
            { start: 2, end: 3, text: '待ってください' },
        ];
        const out = core.applyPreMtSourceFillerClean(cues, {
            postBatchOnomatopoeiaMode: 'clear',
            postBatchInterjectionMode: 'clear',
            language: 'ja',
        });
        assert.ok(out.changed);
        const texts = out.cues.map((c) => c.text);
        assert.ok(texts.some((t) => /大丈夫/.test(t) && !/うん/.test(t)));
        assert.ok(texts.some((t) => /手/.test(t) && !/^あぁ/.test(t)));
        assert.ok(texts.some((t) => /待って/.test(t)));
    });

    it('interjection off keeps pure うん while still dropping ono', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁ' },
            { start: 1, end: 2, text: 'うん' },
            { start: 2, end: 3, text: '待ってください' },
        ];
        const out = core.applyPreMtSourceFillerClean(cues, {
            postBatchOnomatopoeiaMode: 'clear',
            postBatchInterjectionMode: 'off',
            language: 'ja',
            avSoftViewingRespectUserModes: true,
        });
        assert.ok(!out.cues.some((c) => /はぁ/.test(c.text)));
        assert.ok(out.cues.some((c) => c.text === 'うん'), 'discourse kept when interjection off');
        assert.ok(out.cues.some((c) => /待って/.test(c.text)));
    });

    it('av_soft forces interjection clear even when user mode is off', () => {
        const cues = [
            { start: 0, end: 1, text: 'うん' },
            { start: 1, end: 2, text: '待ってください' },
        ];
        const out = core.applyPreMtSourceFillerClean(cues, {
            postBatchOnomatopoeiaMode: 'off',
            postBatchInterjectionMode: 'off',
            contentProfile: 'av_soft',
            language: 'ja',
        });
        assert.ok(!out.cues.some((c) => c.text === 'うん'));
        assert.ok(out.cues.some((c) => /待って/.test(c.text)));
    });
});
