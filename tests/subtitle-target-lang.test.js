'use strict';

const assert = require('assert');
const tgt = require('../src/js/subtitle-target-lang-core');
const sanitize = require('../src/js/mt-sanitize-core');

describe('subtitle-target-lang-core', () => {
    it('normalizes form and canonical codes', () => {
        assert.strictEqual(tgt.normalizeSubtitleTargetLang('simplified'), 'zh-Hans');
        assert.strictEqual(tgt.normalizeSubtitleTargetLang('traditional'), 'zh-Hant');
        assert.strictEqual(tgt.normalizeSubtitleTargetLang('en'), 'en');
        assert.strictEqual(tgt.formValueFromTargetLang('zh-Hant-HK'), 'traditional-hk');
        assert.strictEqual(tgt.formValueFromTargetLang('en'), 'en');
    });

    it('resolves precedence without reading uiLocale', () => {
        assert.strictEqual(
            tgt.resolveSubtitleTargetLang({
                uiLocale: 'en',
                chineseSubtitleVariant: 'simplified',
            }),
            'zh-Hans',
        );
        assert.strictEqual(
            tgt.resolveSubtitleTargetLang({
                uiLocale: 'zh-Hans',
                subtitleTargetLang: 'en',
                chineseSubtitleVariant: 'simplified',
            }),
            'en',
        );
        assert.strictEqual(
            tgt.resolveSubtitleTargetLang({ nonChineseTarget: 'ko' }),
            'ko',
        );
    });

    it('zhDeep layers only for Chinese targets', () => {
        assert.strictEqual(tgt.sanitizeLayersForTarget('zh-Hans').zhDeep, true);
        assert.strictEqual(tgt.sanitizeLayersForTarget('zh-Hant').zhDeep, true);
        assert.strictEqual(tgt.sanitizeLayersForTarget('en').zhDeep, false);
        assert.strictEqual(tgt.sanitizeLayersForTarget('ko').zhDomain, false);
    });

    it('buildTargetLangPayloadFields covers intl and zh', () => {
        const en = tgt.buildTargetLangPayloadFields({ subtitleTargetLang: 'en' });
        assert.strictEqual(en.subtitleTargetLang, 'en');
        assert.strictEqual(en.targetLang, 'en');
        assert.strictEqual(en.targetLanguage, 'English');
        assert.strictEqual(en.chineseSubtitleVariant, 'en');
        assert.strictEqual(en.nonChineseTarget, 'en');

        const zh = tgt.buildTargetLangPayloadFields({ chineseSubtitleVariant: 'traditional-hk' });
        assert.strictEqual(zh.subtitleTargetLang, 'zh-Hant-HK');
        assert.strictEqual(zh.chineseSubtitleVariant, 'traditional-hk');
        assert.strictEqual(zh.nonChineseTarget, '');
        assert.ok(/繁体/.test(zh.targetLanguage));
    });

    it('listTargetLangFormOptions includes en/ja/ko', () => {
        const vals = tgt.listTargetLangFormOptions().map((o) => o.value);
        assert.ok(vals.includes('en'));
        assert.ok(vals.includes('ja'));
        assert.ok(vals.includes('ko'));
        assert.ok(vals.includes('simplified'));
    });
});

describe('sanitize target-lang short-circuit', () => {
    it('zh path still applies domain / opaque (zero-regress smoke)', () => {
        const r = sanitize.sanitizeMtCueText('加油', 'がんばって', {
            targetLang: 'zh-Hans',
        });
        assert.ok(r);
        assert.ok(!r.flags.includes('target_lang_light'));
        assert.strictEqual(String(r.text || '').includes('加油') || r.text === '加油', true);
    });

    it('en path skips ZH blank-adult invent and marks light', () => {
        const ja = 'がんばって';
        const en = 'Come on, you can do it.';
        const r = sanitize.sanitizeMtCueText(en, ja, {
            targetLang: 'en',
            subtitleTargetLang: 'en',
        });
        assert.ok(r.flags.includes('target_lang_light'));
        assert.ok(r.flags.some((f) => f === 'tgt:en'));
        // Must not rewrite English into Chinese recovery glosses
        assert.ok(!/加油|拼命/.test(r.text));
        assert.ok(/Come on|can do/i.test(r.text));
    });

    it('en path still strips gloss artifacts', () => {
        const r = sanitize.sanitizeMtCueText('Hello __GLOSS12__ world', 'こんにちは', {
            targetLang: 'en',
        });
        assert.ok(r.flags.includes('target_lang_light'));
        assert.ok(!/__GLOSS/i.test(r.text));
    });
});
