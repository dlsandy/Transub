const assert = require('assert');
const fs = require('fs');
const path = require('path');
const avGlossary = require('../src/js/av-glossary-core');
const jaNames = require('../src/js/ja-person-names-core');
const sakura = require('../src/js/sakura-translate-core');
const {
    isUsableZh,
    isJunkDomainEntry,
    isShortLatinAlias,
} = require('../tools/build-av-glossary');

describe('av-glossary-core', () => {
    it('loads actor glossary with thousands of lookup rows', () => {
        avGlossary.resetAvGlossaryCache({ reload: true });
        const stats = avGlossary.getActorStats();
        assert.ok(stats.entries >= 7000, JSON.stringify(stats));
    });

    it('filters placeholder / moan / common false-positive domain rows', () => {
        assert.strictEqual(isJunkDomainEntry('aaaa', 'bbbb'), true);
        assert.strictEqual(isJunkDomainEntry('じゃ', '那'), true);
        assert.strictEqual(isJunkDomainEntry('先生', '老师'), true);
        assert.strictEqual(isJunkDomainEntry('あんあん', '嗯啊嗯啊'), true);
        assert.strictEqual(isJunkDomainEntry('電マ', '电动棒'), false);
        assert.strictEqual(isJunkDomainEntry('絶頂', '绝顶'), false);
        assert.strictEqual(isUsableZh('Sakurako'), false);
        assert.strictEqual(isUsableZh('香水纯'), true);
        assert.strictEqual(isShortLatinAlias('Ray'), true);
        assert.strictEqual(isShortLatinAlias('Alice Hernandez'), false);
    });

    it('built packs omit obvious junk surfaces', () => {
        const actorPack = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../shared/av-actor-glossary.json'),
            'utf8',
        ));
        const domainPack = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../shared/av-domain-glossary.json'),
            'utf8',
        ));
        const actorSrc = new Set(actorPack.entries.map((e) => e.src));
        const domainSrc = new Set(domainPack.entries.map((e) => e.src));
        assert.ok(!domainSrc.has('aaaa'));
        assert.ok(!domainSrc.has('じゃ'));
        assert.ok(!domainSrc.has('先生'));
        assert.ok(!domainSrc.has('あんあん'));
        assert.ok(domainSrc.has('電マ'));
        assert.ok(!actorSrc.has('SAKURAKO'));
        assert.ok(!actorSrc.has('Ray'));
        assert.ok(actorPack.entries.every((e) => /[\u4e00-\u9fff]/.test(e.zh)));
        assert.ok(domainPack.stats.entries >= 1200, JSON.stringify(domainPack.stats));
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

    it('does not inject セックス→做爱 inside セックスレス compounds', () => {
        const sexless = '妻とのセックスレスに悩んでいる男性です';
        const domain = avGlossary.matchDomainTermsInText(sexless, { maxTerms: 12 });
        assert.ok(!domain.some((t) => t.term === 'セックス'), JSON.stringify(domain));
        const merged = avGlossary.mergeAvGlossaryTerms([], sexless, {
            contentProfile: 'av_soft',
            maxDomainTerms: 12,
        });
        assert.ok(!merged.some((t) => t.term === 'セックス'), JSON.stringify(merged));
        // Bare セックス + hiragana verb should still match domain if present in pack.
        const want = avGlossary.matchDomainTermsInText('今日はセックスしたい', { maxTerms: 12 });
        // May or may not have the row; only assert compound poison is fixed above.
        void want;
        const gal = sakura.buildChatMessages(
            [{ index: 0, text: sexless }],
            {
                modelId: 'sakura-galtransl-7b-q6k',
                promptFamily: 'galtransl',
                contentProfile: 'av_soft',
                sakuraNsfwPrompt: true,
                faithfulTone: true,
            },
        );
        const user = gal.find((m) => m.role === 'user')?.content || '';
        assert.ok(!/セックス\s*->\s*做爱/.test(user), user.slice(0, 200));
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
