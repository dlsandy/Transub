'use strict';

const assert = require('assert');
const pick = require('../src/js/glossary-target-pick-core');
const avGlossary = require('../src/js/av-glossary-core');

describe('glossary-target-pick-core', () => {
    it('picks zh / en columns and never falls back to Han for en', () => {
        const row = { src: '電マ', zh: '电动棒', en: 'wand vibrator' };
        assert.strictEqual(pick.pickGlossaryTranslation(row, 'zh-Hans', { kind: 'domain' }), '电动棒');
        assert.strictEqual(pick.pickGlossaryTranslation(row, 'en', { kind: 'domain' }), 'wand vibrator');
        assert.strictEqual(
            pick.pickGlossaryTranslation({ src: '電マ', zh: '电动棒' }, 'en', { kind: 'domain' }),
            '',
        );
    });

    it('romaji fallback for actor names without en column', () => {
        const row = { src: 'さくら', zh: '樱' };
        const en = pick.pickGlossaryTranslation(row, 'en', { kind: 'actor' });
        assert.ok(/sakura/i.test(en), en);
        assert.ok(!/[\u4e00-\u9fff]/.test(en));
    });

    it('gates ZH lexicon injection by target', () => {
        assert.strictEqual(pick.shouldInjectZhLexiconForTarget('zh-Hans'), true);
        assert.strictEqual(pick.shouldInjectZhLexiconForTarget('en'), false);
        assert.strictEqual(pick.shouldInjectZhLexiconForTarget({ subtitleTargetLang: 'ko' }), false);
    });
});

describe('av-glossary multi-target', () => {
    beforeAll(() => {
        avGlossary.resetAvGlossaryCache({ reload: true });
    });

    it('zh path unchanged for known actress', () => {
        assert.strictEqual(avGlossary.resolveActorZhName('三上悠亜'), '三上悠亚');
        assert.strictEqual(
            avGlossary.resolveActorNameForTarget('三上悠亜', 'zh-Hans'),
            '三上悠亚',
        );
    });

    it('en override for popular actress', () => {
        assert.strictEqual(
            avGlossary.resolveActorNameForTarget('三上悠亜', 'en'),
            'Yua Mikami',
        );
        const hits = avGlossary.matchActorTermsInText('三上悠亜さん、お願いします。', {
            targetLang: 'en',
        });
        assert.ok(hits.some((t) => t.term === '三上悠亜' && t.translation === 'Yua Mikami'), JSON.stringify(hits));
    });

    it('merge for en does not inject Chinese domain without en column', () => {
        const merged = avGlossary.mergeAvGlossaryTerms([], '電マで絶頂しそう', {
            targetLang: 'en',
            maxActorTerms: 5,
            maxDomainTerms: 20,
        });
        for (const t of merged) {
            assert.ok(
                !/[\u4e00-\u9fff]/.test(t.translation),
                `unexpected Han translation: ${JSON.stringify(t)}`,
            );
        }
    });

    it('merge for zh still returns Chinese actress terms', () => {
        const merged = avGlossary.mergeAvGlossaryTerms([], '三上悠亜さん', {
            targetLang: 'zh-Hans',
        });
        assert.ok(merged.some((t) => t.term === '三上悠亜' && t.translation === '三上悠亚'));
    });
});
