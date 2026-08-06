'use strict';

const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core.js');
const wizardTest = require('../tools/mt-train/lib/wizard-test.js');

describe('mt-train wizard test', () => {
    it('trialPass accepts blank when fragment removed', () => {
        assert.strictEqual(wizardTest.trialPass(
            { mode: 'blank', zhFrom: 'high' },
            { final: '情绪都挺好的', changed: true },
        ), true);
        assert.strictEqual(wizardTest.trialPass(
            { mode: 'blank', zhFrom: 'high' },
            { final: '情绪都好high', changed: false },
        ), false);
    });

    it('trialPass accepts replace when expect matches', () => {
        assert.strictEqual(wizardTest.trialPass(
            { mode: 'replace', zhFrom: 'high', zhTo: '挺高' },
            { matchesExpect: true, final: '情绪都挺高' },
        ), true);
    });

    it('testWizardItems blocks whole-sentence replace via gate', () => {
        const out = wizardTest.testWizardItems(sanitize, [{
            ji: 1,
            mode: 'replace',
            ja: 'abc',
            zh: 'abcdefghijklmnop',
            expect: '一二三四五六七八九',
            zhFrom: 'abcdefghijklmnop',
            zhTo: '一二三四五六七八九',
            jaAnchor: 'abc',
        }], { corpus: [] });
        assert.strictEqual(out.results.length, 1);
        assert.strictEqual(out.results[0].gateOk, false);
        assert.strictEqual(out.results[0].pass, false);
    });

    it('testWizardItems reports pass for short replace with empty corpus', () => {
        const dirty = '太好了大家的情绪都好high';
        const expect = '太好了大家的情绪都挺高的';
        const out = wizardTest.testWizardItems(sanitize, [{
            ji: 2,
            mode: 'replace',
            ja: 'よかった',
            zh: dirty,
            expect,
            zhFrom: 'high',
            zhTo: '挺高的',
            jaAnchor: 'よかった',
        }], { corpus: [] });
        assert.strictEqual(out.results.length, 1);
        assert.strictEqual(out.results[0].gateOk, true);
        // hit depends on sanitize having the candidate applied in try
        assert.ok(out.results[0].trial);
        assert.ok(typeof out.results[0].pass === 'boolean');
    });
});
