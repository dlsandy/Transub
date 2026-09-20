'use strict';

const assert = require('assert');
const policy = require('../src/js/mt-delivery-policy-core');
const sanitize = require('../src/js/mt-sanitize-core');

describe('mt-delivery-policy-core', () => {
    it('blocks raw ZH recovery on English 成片 but allows localized short fill', () => {
        const en = { subtitleTargetLang: 'en', targetLang: 'en' };
        assert.strictEqual(policy.mayWriteZhRecovery(en), false);
        assert.strictEqual(policy.mayWriteZhRecovery({ subtitleTargetLang: 'zh-Hans' }), true);

        const recovered = sanitize.recoverBlankedAdultZh('', 'うん。', en);
        assert.ok(recovered.changed);
        assert.strictEqual(recovered.text, 'Mm-hmm');
        assert.ok(!/[\u4e00-\u9fff]/.test(recovered.text));

        const fill = policy.fillBlankForTarget('', 'うん。', en, { mtSanitize: sanitize });
        assert.ok(fill.changed);
        assert.strictEqual(fill.text, 'Mm-hmm');
    });

    it('allows ZH blank fill on Chinese 成片', () => {
        const zh = { subtitleTargetLang: 'zh-Hans', targetLang: 'zh-Hans' };
        assert.strictEqual(policy.mayWriteZhRecovery(zh), true);
        const fill = policy.fillBlankForTarget('', 'うん。', zh, { mtSanitize: sanitize });
        assert.notStrictEqual(fill.reason, 'intl_no_zh_fill');
    });

    it('gates useless-ellipsis DELETE on postBatchRemoveNoise', () => {
        assert.strictEqual(policy.mayDropUselessEllipsis({}), true);
        assert.strictEqual(policy.mayDropUselessEllipsis({ postBatchRemoveNoise: true }), true);
        assert.strictEqual(policy.mayDropUselessEllipsis({ postBatchRemoveNoise: false }), false);
        assert.strictEqual(policy.mayDropUselessEllipsis({
            postBatchRemoveNoise: false,
            dropUselessEllipsis: true,
        }), false);
        assert.strictEqual(policy.mayDropUselessEllipsis({
            postBatchRemoveNoise: true,
            dropUselessEllipsis: false,
        }), false);
    });

    it('flags any Han on English and scrubs mixed lines', () => {
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('Thanks 好的', 'en'));
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('好的', 'en'));
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('我', 'en'));
        assert.ok(!sanitize.looksLikeHanLeakForIntlTarget('Hello there.', 'en'));
        const scrub = sanitize.scrubHanLeakForIntlTarget('Please 好的 wait', 'en');
        assert.ok(scrub.changed);
        assert.ok(/Please/i.test(scrub.text));
        assert.ok(!/[\u4e00-\u9fff]/.test(scrub.text));
        const pure = sanitize.scrubHanLeakForIntlTarget('我爱你。', 'en');
        assert.strictEqual(pure.text, '');
    });

    it('scrubs Chinese leaks on Korean / Japanese 成片 like English intl gates', () => {
        assert.strictEqual(sanitize.intlTargetBucket('ko'), 'ko');
        assert.strictEqual(sanitize.intlTargetBucket('ja'), 'ja');
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('不行', 'ko'));
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('好的，马上过来。', 'ko'));
        assert.ok(!sanitize.looksLikeHanLeakForIntlTarget('안 돼', 'ko'));
        assert.ok(!sanitize.looksLikeHanLeakForIntlTarget('だめです', 'ja'));
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('不行', 'ja'));
        assert.ok(sanitize.looksLikeHanLeakForIntlTarget('好的', 'ja'));
        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('不行', 'ko').text, '');
        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('不行', 'ja').text, '');
        const mixedKo = sanitize.finalizeIntlMtDeliveryText('좋아 好的', 'ko');
        assert.ok(!/[\u4e00-\u9fff]/.test(mixedKo.text));
        assert.ok(/좋아/.test(mixedKo.text) || mixedKo.text === '');
    });

    it('scrubs Latin site watermarks on Korean / Japanese 成片', () => {
        assert.ok(sanitize.looksLikeLatinLeakForIntlTarget('flatjapan', 'ko'));
        assert.ok(sanitize.looksLikeLatinLeakForIntlTarget('Flat Japan', 'ko'));
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('www.flatjapan.com', 'ko'));
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('flatjapan.com', 'ja'));
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('flatjapan', 'en'));
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('I love you.', 'ko'));
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('OK', 'ko'));

        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('flatjapan', 'ko').text, '');
        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('Flat Japan', 'ko').text, '');
        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('www.flatjapan.com', 'ko').text, 'www.flatjapan.com');
        assert.strictEqual(sanitize.finalizeIntlMtDeliveryText('flatjapan.com', 'ko').text, 'flatjapan.com');

        const mixed = sanitize.scrubLatinLeakForIntlTarget('응 flatjapan', 'ko');
        assert.ok(mixed.changed);
        assert.ok(/응/.test(mixed.text));
        assert.ok(!/flatjapan/i.test(mixed.text));

        const mixedDom = sanitize.finalizeIntlMtDeliveryText('응 flatjapan.com', 'ko');
        assert.ok(/flatjapan\.com/i.test(mixedDom.text));
        assert.ok(/응/.test(mixedDom.text));

        const light = sanitize.sanitizeMtCueTextLight('Flat Japan', 'なにそれ', {
            subtitleTargetLang: 'ko',
            targetLang: 'ko',
        });
        assert.strictEqual(light.text, '');

        // Source already has Latin → keep (bilingual)
        assert.ok(!sanitize.looksLikeLatinLeakForIntlTarget('flatjapan', 'ko', 'OK flatjapan'));
    });
});
