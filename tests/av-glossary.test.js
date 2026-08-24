const assert = require('assert');
const avGlossary = require('../src/js/av-glossary-core');
const jaNames = require('../src/js/ja-person-names-core');
const sakura = require('../src/js/sakura-translate-core');

describe('av-glossary-core', () => {
    it('loads actor glossary with thousands of lookup rows', () => {
        const stats = avGlossary.getActorStats();
        assert.ok(stats.entries >= 7000, JSON.stringify(stats));
    });

    it('resolves known actress names to simplified Chinese', () => {
        assert.strictEqual(avGlossary.resolveActorZhName('香水じゅん'), '香水纯');
        assert.strictEqual(avGlossary.resolveActorZhName('三上悠亜'), '三上悠亚');
        assert.strictEqual(avGlossary.resolveActorZhName('明日花キララ'), '明日花绮罗');
        assert.strictEqual(avGlossary.resolveActorZhName('松岡香純'), '松冈香纯');
    });

    it('matches actress names only when they appear in source text', () => {
        const hits = avGlossary.matchActorTermsInText('蛯原さくら、もっと優しくして…');
        assert.ok(hits.some((t) => t.term === '蛯原さくら' && t.translation === '蛯原樱'), JSON.stringify(hits));
        assert.strictEqual(avGlossary.matchActorTermsInText('今日はいい天気ですね。').length, 0);
    });

    it('merges user glossary with matched AV rows without duplicate src', () => {
        const merged = avGlossary.mergeAvGlossaryTerms(
            [{ term: '太郎', translation: '太郎', info: '人名' }],
            '三上悠亜さん、お願いします。',
        );
        assert.ok(merged.some((t) => t.term === '太郎'));
        assert.ok(merged.some((t) => t.term === '三上悠亜' && t.translation === '三上悠亚'));
        const terms = merged.map((t) => t.term);
        assert.strictEqual(new Set(terms).size, terms.length);
    });

    it('feeds ja-person-names resolveCanonicalZhPersonName', () => {
        assert.strictEqual(jaNames.resolveCanonicalZhPersonName('香水じゅん'), '香水纯');
        assert.strictEqual(jaNames.resolveCanonicalZhPersonName('明日花キララ'), '明日花绮罗');
    });

    it('injects matched actor terms into Sakura NSFW prompt glossary block', () => {
        const messages = sakura.buildChatMessages(
            [{ index: 0, text: '三上悠亜さん、お願いします。' }],
            { sakuraNsfwPrompt: true, glossaryTerms: [] },
        );
        const user = messages.find((m) => m.role === 'user')?.content || '';
        assert.match(user, /三上悠亜->三上悠亚/);
        assert.match(user, /术语表/);
    });
});
