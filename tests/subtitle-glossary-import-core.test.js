const assert = require('assert');
const {
    parseAnilistMediaId,
    detectAnilistMediaType,
    getAnilistImportGuide,
    buildAnilistImportPromptMessage,
    ANILIST_SEARCH_URL,
} = require('../src/js/subtitle-glossary-import-core');

describe('subtitle-glossary-import-core', () => {
    it('parses numeric and URL AniList ids', () => {
        assert.strictEqual(parseAnilistMediaId('9253'), 9253);
        assert.strictEqual(parseAnilistMediaId('https://anilist.co/anime/9253/steins-gate/'), 9253);
        assert.strictEqual(detectAnilistMediaType('https://anilist.co/manga/1/'), 'MANGA');
    });

    it('exposes user-facing AniList import guide', () => {
        const guide = getAnilistImportGuide();
        assert.ok(guide.title.includes('动漫'));
        assert.ok(guide.intro.includes('中文译名'));
        assert.strictEqual(guide.steps.length, 3);
        assert.ok(guide.steps[1].includes('9253'));
        assert.ok(guide.note.includes('ASR'));
        const prompt = buildAnilistImportPromptMessage();
        assert.ok(prompt.includes('9253'));
        assert.strictEqual(ANILIST_SEARCH_URL, 'https://anilist.co/search/anime');
    });
});
