const assert = require('assert');
const {
    pickAnilistCanonical,
    buildAnilistAliases,
    shouldSkipAnilistCharacter,
    jaKanjiToZhSimplified,
} = require('../tools/asr-vocab/lib/anilist-glossary-build');
const {
    anilistCharactersToGlossary,
} = require('../tools/asr-vocab/lib/glossary-io');

describe('anilist zh glossary', () => {
    const okabe = {
        full: 'Rintarou Okabe',
        native: '岡部倫太郎',
        alternative: ['Hououin Kyouma (鳳凰院凶真)', 'Okarin (オカリン)'],
    };

    it('uses simplified Chinese canonical for JA native names', () => {
        assert.strictEqual(
            pickAnilistCanonical(okabe, { canonicalLocale: 'zh' }),
            '冈部伦太郎',
        );
    });

    it('keeps Japanese and English in aliases for ASR/scan', () => {
        const canonical = pickAnilistCanonical(okabe, { canonicalLocale: 'zh' });
        const aliases = buildAnilistAliases(okabe, canonical, { canonicalLocale: 'zh' });
        assert.ok(aliases.includes('岡部倫太郎'));
        assert.ok(aliases.includes('Rintarou Okabe'));
        assert.ok(aliases.some((a) => a.includes('鳳凰院凶真') || a.includes('凤凰院凶真')));
    });

    it('prefers Bangumi zh name when provided', () => {
        assert.strictEqual(
            pickAnilistCanonical(okabe, { canonicalLocale: 'zh', bangumiZh: '凤凰院凶真' }),
            '凤凰院凶真',
        );
    });

    it('skips pure English characters without CJK forms', () => {
        assert.strictEqual(
            shouldSkipAnilistCharacter({ full: 'Lab Member 006', native: '' }, { canonicalLocale: 'zh' }),
            true,
        );
    });

    it('maps AniList nodes to zh-canonical glossary doc', () => {
        const doc = anilistCharactersToGlossary([
            { role: 'MAIN', name: okabe },
            {
                role: 'MAIN',
                name: {
                    full: 'Yuki Nagato',
                    native: '長門有希',
                    alternative: ['Yuki Nagato'],
                },
            },
        ], { canonicalLocale: 'zh', source: 'test' });
        assert.strictEqual(doc.entries.length, 2);
        assert.strictEqual(doc.entries[0].canonical, '冈部伦太郎');
        assert.strictEqual(doc.entries[1].canonical, jaKanjiToZhSimplified('長門有希'));
        assert.ok(doc.entries[1].aliases.includes('長門有希'));
    });
});
