'use strict';

const assert = require('assert');
const fill = require('../src/js/mt-short-fill-core');
const smart = require('../src/js/advanced-smart-translate-core');
const sanitize = require('../src/js/mt-sanitize-core');
const policy = require('../src/js/mt-delivery-policy-core');

describe('mt-short-fill-core', () => {
    it('localizes ZH short surfaces to English and Korean', () => {
        assert.strictEqual(fill.localizeZhShortFill('不行', 'en'), 'No');
        assert.strictEqual(fill.localizeZhShortFill('嗯嗯', { subtitleTargetLang: 'en' }), 'Mm-hmm');
        assert.strictEqual(fill.localizeZhShortFill('但是', 'ko'), '하지만');
        assert.strictEqual(fill.localizeZhShortFill('不行', 'zh-Hans'), '不行');
        assert.strictEqual(fill.localizeZhShortFill('不行', 'ja', 'だめ'), 'だめ');
    });

    it('fallbackShortJaCue returns English for en target', () => {
        assert.strictEqual(smart.fallbackShortJaCue('だめ', { subtitleTargetLang: 'en' }), 'No');
        assert.strictEqual(smart.fallbackShortJaCue('うん', { subtitleTargetLang: 'en' }), 'Mm-hmm');
        assert.strictEqual(smart.fallbackShortJaCue('おはよう', { subtitleTargetLang: 'en' }), 'Morning.');
        assert.ok(/不行|No/.test(smart.fallbackShortJaCue('だめ')));
        assert.strictEqual(smart.fallbackShortJaCue('だめ', { subtitleTargetLang: 'ko' }), '안 돼');
        assert.strictEqual(smart.fallbackShortJaCue('だめ', { subtitleTargetLang: 'ja' }), 'だめ');
    });

    it('partitionDeterministicCues prefills English for en', () => {
        const part = smart.partitionDeterministicCues(
            [{ index: 1, text: 'うん' }, { index: 2, text: '長いセリフですよね本当に' }],
            { subtitleTargetLang: 'en' },
        );
        assert.ok(part.prefilled.some((p) => p.index === 1 && p.text === 'Mm-hmm'));
        assert.ok(part.llmCues.some((c) => c.index === 2));
        const ko = smart.partitionDeterministicCues(
            [{ index: 1, text: 'うん' }],
            { subtitleTargetLang: 'ko' },
        );
        assert.ok(ko.prefilled.some((p) => p.index === 1 && p.text === '응응'));
    });

    it('dualTargetSuffixFromLang follows 成片语', () => {
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'en' }), 'en');
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'ko' }), 'ko');
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'ja' }), 'ja');
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'zh-Hans' }), 'zh-cn');
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'zh-Hant' }), 'zh-tw');
        assert.strictEqual(fill.dualTargetSuffixFromLang({ subtitleTargetLang: 'zh-Hant-HK' }), 'zh-hk');
    });
    it('localizes climax ZH stocks and mixed moan strings to English', () => {
        assert.strictEqual(fill.localizeZhShortFill('要射了', { subtitleTargetLang: 'en' }), "I'm coming");
        assert.ok(!/[\u4e00-\u9fff]/.test(fill.localizeZhShortFill('要射了…要射了…哈…', { subtitleTargetLang: 'en' })));
        assert.match(fill.localizeZhShortFill('要射了…要射了…哈…', { subtitleTargetLang: 'en' }), /coming/i);
    });

    it('sanitize light path localizes ZH climax for EN target', () => {
        const hit = sanitize.sanitizeMtCueText(
            '要射了…要射了…哈…',
            'あんっ、イク…イクイク…イク…',
            { subtitleTargetLang: 'en', targetLang: 'en', contentProfile: 'av_soft' },
        );
        assert.ok(hit.changed);
        assert.ok(!/[\u4e00-\u9fff]/.test(hit.text));
        assert.match(hit.text, /coming/i);
    });

    it('fallbackShortJaCue covers work / hot shorts in English', () => {
        assert.strictEqual(smart.fallbackShortJaCue('仕事だよ', { subtitleTargetLang: 'en' }), "It's work");
        assert.strictEqual(smart.fallbackShortJaCue('あつい…', { subtitleTargetLang: 'en' }), "It's hot…");
    });
    it('does not treat real English dialogue as latin garbage on EN target', () => {
        const hit = sanitize.sanitizeMtCueText(
            'Understood',
            '承知しました。',
            { subtitleTargetLang: 'en', targetLang: 'en' },
        );
        assert.strictEqual(hit.text, 'Understood');
        const ch = sanitize.sanitizeMtCueText(
            'A change?',
            '変更ですか?',
            { subtitleTargetLang: 'en', targetLang: 'en' },
        );
        assert.strictEqual(ch.text, 'A change?');
    });

    it('does not rewrite Japanese kanji via ZH short-fill table', () => {
        assert.strictEqual(fill.localizeZhShortFill('す、好きです…', { subtitleTargetLang: 'en' }), '');
    });
    it('uses independent JA→EN table (no ZH hop) for en target', () => {
        assert.strictEqual(fill.lookupEnFromJa('うん'), 'Mm-hmm');
        assert.strictEqual(fill.lookupEnFromJa('おはよう'), 'Morning.');
        assert.strictEqual(fill.fallbackShortJaCueEn('だめ'), 'No');
        assert.strictEqual(fill.fallbackShortJaCueEn('気持ちいい'), 'Feels so good');
        assert.ok(!/[\u4e00-\u9fff]/.test(fill.fallbackShortJaCueEn('あつい…')));
        assert.strictEqual(smart.fallbackShortJaCue('うん', { subtitleTargetLang: 'en' }), 'Mm-hmm');
        assert.strictEqual(smart.fallbackShortJaCue('仕事だよ', { subtitleTargetLang: 'en' }), "It's work");
    });

    it('uses independent JA→KO table (no ZH hop) for ko target', () => {
        assert.strictEqual(fill.lookupKoFromJa('うん'), '응응');
        assert.strictEqual(fill.lookupKoFromJa('だめ'), '안 돼');
        assert.strictEqual(fill.fallbackShortJaCueKo('だめ'), '안 돼');
        assert.strictEqual(fill.fallbackShortJaCueKo('気持ちいい'), '기분 좋아');
        assert.ok(!/[\u4e00-\u9fff]/.test(fill.fallbackShortJaCueKo('あつい…')));
        assert.strictEqual(smart.fallbackShortJaCue('うん', { subtitleTargetLang: 'ko' }), '응응');
        assert.strictEqual(smart.fallbackShortJaCue('仕事だよ', { subtitleTargetLang: 'ko' }), '일이야');
        assert.strictEqual(smart.fallbackShortJaCue('あつい…', { subtitleTargetLang: 'ko' }), '뜨거워…');
    });
});

describe('intl blank recover surfaces', () => {
    const en = { subtitleTargetLang: 'en', targetLang: 'en', contentProfile: 'av_soft' };
    const ko = { subtitleTargetLang: 'ko', targetLang: 'ko', contentProfile: 'av_soft' };
    const ja = { subtitleTargetLang: 'ja', targetLang: 'ja', contentProfile: 'av_soft' };

    it('recoverBlankedAdultZh localizes short fills for English', () => {
        const hit = sanitize.recoverBlankedAdultZh('…', 'だめ', en);
        assert.ok(hit.changed, hit);
        assert.strictEqual(hit.text, 'No');
        assert.ok(!/[\u4e00-\u9fff]/.test(hit.text));
    });

    it('fillBlankForTarget writes English short fill for en', () => {
        const out = policy.fillBlankForTarget('…', 'うん', en);
        assert.ok(out.changed);
        assert.strictEqual(out.text, 'Mm-hmm');
    });

    it('fillBlankForTarget / recover follow Korean and Japanese like English intl', () => {
        const koFill = policy.fillBlankForTarget('…', 'うん', ko);
        assert.ok(koFill.changed);
        assert.strictEqual(koFill.text, '응응');
        assert.ok(!/[\u4e00-\u9fff]/.test(koFill.text));
        const jaFill = policy.fillBlankForTarget('…', 'うん', ja);
        assert.ok(jaFill.changed);
        assert.strictEqual(jaFill.text, 'うん');
        const koHit = sanitize.recoverBlankedAdultZh('…', 'だめ', ko);
        assert.ok(koHit.changed);
        assert.strictEqual(koHit.text, '안 돼');
    });

    it('still never leaves raw ZH on English blank recover for unmapped adult', () => {
        const hit = sanitize.recoverBlankedAdultZh('…', 'これはとても長い成人台詞で辞書にない', en);
        assert.ok(hit.skipped || !hit.changed || !/[\u4e00-\u9fff]/.test(String(hit.text || '')));
    });
});
