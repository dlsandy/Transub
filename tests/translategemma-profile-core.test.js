'use strict';

const assert = require('assert');
const profile = require('../src/js/translategemma-profile-core');

describe('translategemma-profile-core', () => {
    it('detects official and Sub TranslateGemma ids', () => {
        assert.strictEqual(profile.isTranslateGemmaProfileModel('translategemma-4b'), true);
        assert.strictEqual(profile.isTranslateGemmaProfileModel('translategemma-12b'), true);
        assert.strictEqual(profile.isTranslateGemmaProfileModel('translategemma-27b'), true);
        assert.strictEqual(profile.isTranslateGemmaSubModel('translategemma-4-sub-e4b'), true);
        assert.strictEqual(profile.isTranslateGemmaProfileModel('translategemma-4-sub-e4b'), true);
        assert.strictEqual(
            profile.isTranslateGemmaProfileModel('translate_gemma4_sub-E4B-Q4_K_XL.gguf'),
            true,
        );
        assert.strictEqual(profile.isTranslateGemmaProfileModel('gemma3-4b'), false);
        assert.strictEqual(profile.isTranslateGemmaProfileModel('sakura-7b'), false);
        assert.strictEqual(profile.isTranslateGemmaProfileModel(''), false);
    });

    it('tiers sampling by param size and Sub', () => {
        const sub = profile.resolveTranslateGemmaTranslateProfile('translategemma-4-sub-e4b');
        const b4 = profile.resolveTranslateGemmaTranslateProfile('translategemma-4b');
        const b12 = profile.resolveTranslateGemmaTranslateProfile('translategemma-12b');
        const b27 = profile.resolveTranslateGemmaTranslateProfile('translategemma-27b');
        assert.ok(sub && b4 && b12 && b27);
        assert.strictEqual(sub.temperature, 0);
        assert.strictEqual(sub.topP, 0.9);
        assert.strictEqual(sub.repetitionPenalty, 1.05);
        assert.strictEqual(sub.isSub, true);
        assert.strictEqual(sub.preferSerialChunks, true);
        assert.strictEqual(b4.temperature, 0.2);
        assert.strictEqual(b4.topP, 0.85);
        assert.strictEqual(b4.repetitionPenalty, 1.08);
        assert.strictEqual(b4.preferSerialChunks, false);
        assert.strictEqual(b12.temperature, 0.25);
        assert.strictEqual(b12.topP, 0.9);
        assert.strictEqual(b12.repetitionPenalty, 1.06);
        assert.strictEqual(b27.temperature, 0.3);
        assert.strictEqual(b27.topP, 0.9);
        assert.strictEqual(b27.repetitionPenalty, 1.05);
    });

    it('prompt addons emphasize meaning over paraphrase', () => {
        const official = profile.getTranslateGemmaPromptAddon('translategemma-4b', 'official');
        const sub = profile.getTranslateGemmaPromptAddon('translategemma-4-sub-e4b', 'sub');
        assert.ok(/preserve meaning|polarity/i.test(official));
        assert.ok(/paraphrase|fluency/i.test(official));
        assert.ok(/self-ID|Nameです/i.test(official));
        assert.ok(/CURRENT_SOURCE|PREVIOUS_/i.test(sub));
        assert.ok(/never copy names|identity/i.test(sub));
        assert.ok(/adult|anchors|meta|帮你翻译/i.test(sub));
        assert.ok(/ellipsis|……|\.\.\./i.test(official));
        assert.ok(/ellipsis|……|\.\.\./i.test(sub));
        assert.ok(/refuse|boilerplate|sanitize/i.test(official));
        assert.ok(/refuse|boilerplate|sanitize/i.test(sub));
        assert.strictEqual(profile.getTranslateGemmaPromptAddon('sakura-7b', 'official'), '');
        assert.strictEqual(profile.resolveTranslateGemmaTranslateProfile('qwen3-8b'), null);
        assert.strictEqual(
            profile.resolveTranslateGemmaTranslateProfile('translategemma-4b').preferSystemAddon,
            true,
        );
    });

    it('mtDefaults fragment matches profile sampling', () => {
        const d = profile.resolveTranslateGemmaMtDefaults('translategemma-4b');
        assert.deepStrictEqual(d, {
            temperature: 0.2,
            topP: 0.85,
            repetitionPenalty: 1.08,
        });
    });
});
