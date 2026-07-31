const assert = require('assert');
const path = require('path');
const fs = require('fs');
const mtSanitize = require('../src/js/mt-sanitize-core');

describe('sanitize contracts', () => {
    const ssotPath = path.join(__dirname, '..', 'shared', 'ja-asr-domain-fixes.json');
    const ssot = JSON.parse(fs.readFileSync(ssotPath, 'utf8'));

    it('JS ASR domain pairs match shared SSOT', () => {
        const pairs = mtSanitize.JA_ASR_DOMAIN_FIX_PAIRS || [];
        assert.strictEqual(pairs.length, ssot.length);
        for (let i = 0; i < ssot.length; i += 1) {
            assert.strictEqual(pairs[i].from, ssot[i].from);
            assert.strictEqual(pairs[i].to, ssot[i].to);
        }
    });

    it('corrects JA ASR domain mishears using SSOT rules', () => {
        const fixed = mtSanitize.correctJaAsrDomainMishears('免税しては大丈夫');
        assert.ok(fixed.changed);
        assert.ok(String(fixed.text).includes('メンエスは'));
    });

    it('desktop MT path may strip unjustified trailing 2–4 Han; keep tokens survive', () => {
        // Documented path divergence: desktop sanitize is stricter than engine Opus subset.
        const dirty = mtSanitize.sanitizeMtCueText('……舒服。 过来', '気持ちいい', {});
        const kept = mtSanitize.sanitizeMtCueText('加油', 'がんばって', {});
        assert.ok(typeof dirty?.text === 'string');
        assert.ok(String(kept?.text || '').includes('加油') || kept?.text === '加油');
    });
});
