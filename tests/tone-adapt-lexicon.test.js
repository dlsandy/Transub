const assert = require('assert');
const lex = require('../src/js/tone-adapt-lexicon-core');
const sakura = require('../src/js/sakura-translate-core');
const sanitize = require('../src/js/mt-sanitize-core');

describe('tone-adapt-lexicon-core', () => {
    it('loads lexicon from opaque tone-adapt payload', () => {
        assert.ok(lex.NSFW_LEXICON_ENTRIES.length >= 60);
        assert.ok(lex.formatPromptExamples().includes('→'));
        assert.ok(String(lex.getSakuraNsfwSystemPrompt()).includes('拟声') || String(lex.getSakuraNsfwSystemPrompt()).includes('例：'));
        assert.ok(lex.getSmartFaithfulPromptLines().length >= 1);
    });

    it('has a broad NSFW entry set', () => {
        assert.ok(lex.NSFW_LEXICON_ENTRIES.length >= 60);
        assert.ok(lex.formatPromptExamples().includes('→'));
    });

    it('picks terms present in source text', () => {
        const hits = lex.pickTermsForText('あっ…ぐちゅぐちゅ…ちんちん奥まで', { limit: 20 });
        const terms = hits.map((h) => h.term);
        assert.ok(terms.some((t) => t.includes('あっ') || t.includes('ぐちゅ') || t.includes('ちんちん')), JSON.stringify(terms));
        assert.ok(hits.every((h) => h.translation));
    });

    it('merges NSFW terms after user glossary without overriding', () => {
        const merged = lex.mergeNsfwGlossaryTerms(
            [{ term: 'ぐちゅ', translation: '自定义湿声' }],
            'ぐちゅっびくびく',
            { limit: 20 },
        );
        const guchu = merged.find((t) => String(t.term).includes('ぐちゅ'));
        assert.strictEqual(guchu.translation, '自定义湿声');
        assert.ok(merged.some((t) => String(t.term).includes('びく') || String(t.translation).includes('抽')));
    });

    it('replaces leftover NSFW kana when justified by source', () => {
        const a = lex.applyNsfwLexiconToText('好舒服ぐちゅぐちゅ', 'ぐちゅぐちゅして');
        assert.ok(a.changed);
        assert.ok(!a.text.includes('ぐちゅ'));
        assert.ok(a.text.includes('咕啾') || a.text.includes('好舒服'));

        const b = lex.applyNsfwLexiconToText('ぐちゅぐちゅ', '普通の台詞です');
        assert.ok(!b.changed, 'must not invent from ZH-only leftover without source');
    });

    it('injects NSFW glossary into Sakura NSFW chat messages', () => {
        const msgs = sakura.buildChatMessages(
            [{ index: 0, text: 'んっ…ぐちゅ…だめぇっ' }],
            { sakuraNsfwPrompt: true },
        );
        assert.ok(msgs[0].content.includes('あっ→') || msgs[0].content.includes('拟声'));
        assert.ok(msgs[1].content.includes('->') || msgs[1].content.includes('→') || msgs[1].content.includes('术语表'));
        assert.ok(/んっ|ぐちゅ|だめ/.test(msgs[1].content));
    });

    it('sanitizes leftover NSFW kana on AV profile', () => {
        const out = sanitize.sanitizeMtCueText(
            '里面ぐちゅ好舒服',
            'なかがぐちゅって気持ちいい',
            { contentProfile: 'av_soft' },
        );
        assert.ok(out.flags.includes('nsfw_lexicon') || !out.text.includes('ぐちゅ'), out.text);
    });

    it('includes mens-esthe domain terms and prompt constraints', () => {
        const hits = lex.pickTermsForText('メンエスでオイルを使って仰向けにほぐすと凝ってる', { limit: 20 });
        const translations = hits.map((h) => h.translation).join(' ');
        assert.ok(hits.some((h) => /メンエス|オイル|仰向け|ほぐ/.test(h.term)), JSON.stringify(hits));
        assert.ok(/男士按摩|按摩油|仰躺|放松|僵硬/.test(translations), translations);
        const prompt = String(lex.getSakuraNsfwSystemPrompt());
        assert.ok(prompt.includes('メンエス') || prompt.includes('免税'));
        assert.ok(lex.getSmartFaithfulPromptLines().some((l) => /メンエス|免税|オイル/.test(l)));
    });
});
