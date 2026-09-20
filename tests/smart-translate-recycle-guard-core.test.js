const assert = require('assert');
const recycle = require('../src/js/smart-translate-recycle-guard-core');
const mtSanitize = require('../src/js/mt-sanitize-core');

describe('smart-translate-recycle-guard-core', () => {
    it('keeps first long ZH and blanks later paste onto divergent JA', () => {
        const cues = [
            { index: 0, text: '我紧张 是吗？ 真的可以看吗？', sourceText: '今のぐだった。' },
            { index: 1, text: '你好', sourceText: 'こんにちは' },
            { index: 2, text: '我紧张 是吗？ 真的可以看吗？', sourceText: 'ちょっと、え?' },
            { index: 3, text: '我紧张 是吗？ 真的可以看吗？', sourceText: 'あ、あの' },
        ];
        const out = recycle.scrubRecycledTranslations(cues, new Map(), { blankText: '' });
        assert.strictEqual(out.scrubbed, 2);
        assert.strictEqual(out.cues[0].text, '我紧张 是吗？ 真的可以看吗？');
        assert.strictEqual(out.cues[1].text, '你好');
        assert.strictEqual(out.cues[2].text, '');
        assert.strictEqual(out.cues[3].text, '');
        assert.deepStrictEqual(out.scrubbedIndexes, [2, 3]);
    });

    it('allows same ZH when JA matches prior', () => {
        const cues = [
            { index: 0, text: '粉丝感谢祭要开始了呢', sourceText: 'ファン感謝祭だよ' },
            { index: 1, text: '粉丝感谢祭要开始了呢', sourceText: 'ファン感謝祭だよ' },
        ];
        const out = recycle.scrubRecycledTranslations(cues);
        assert.strictEqual(out.scrubbed, 0);
        assert.ok(out.cues[1].text.includes('粉丝'));
    });

    it('ignores short stock glosses', () => {
        const cues = [
            { index: 0, text: '好厉害', sourceText: 'すごい' },
            { index: 1, text: '好厉害', sourceText: 'やばい' },
        ];
        const out = recycle.scrubRecycledTranslations(cues);
        assert.strictEqual(out.scrubbed, 0);
    });

    it('scrubs short name-card spam on divergent JA', () => {
        const cues = [
            { index: 0, text: '哦 佑佳', sourceText: 'お、祐佳です' },
            { index: 1, text: '哦 佑佳', sourceText: 'いきまーす' },
            { index: 2, text: '我 佑佳', sourceText: 'やばい、やばい' },
            { index: 3, text: '我 佑佳', sourceText: 'ちゅくちゅく' },
            { index: 4, text: '哦 好的', sourceText: 'うん、いいよ' },
        ];
        const out = recycle.scrubRecycledTranslations(cues, new Map(), { blankText: '' });
        assert.strictEqual(out.cues[0].text, '哦 佑佳');
        assert.strictEqual(out.cues[1].text, '');
        assert.ok(out.scrubbed >= 2, `scrubbed=${out.scrubbed}`);
        // 「哦好的」is allowlisted discourse — not name-card
        assert.strictEqual(out.cues[4].text, '哦 好的');
    });

    it('carries seen map across chunk calls', () => {
        const seen = new Map();
        const a = recycle.scrubRecycledTranslations([
            { index: 0, text: '哎呀哎呀 你这真是说的我啊？', sourceText: '見て楽しんでもいい' },
        ], seen);
        assert.strictEqual(a.scrubbed, 0);
        const b = recycle.scrubRecycledTranslations([
            { index: 10, text: '哎呀哎呀 你这真是说的我啊？', sourceText: '当たってるの?' },
        ], seen);
        assert.strictEqual(b.scrubbed, 1);
        assert.strictEqual(b.cues[0].text, '');
    });

    it('scrubs glue paste that embeds earlier long ZH fragments', () => {
        const cues = [
            { index: 0, text: '听说这里的厕所里有个家伙在舔自己', sourceText: 'まつかなかがしゃらぶでーふのひだと聞いてきました' },
            { index: 1, text: '好的 不用客气 慢慢来 认真点', sourceText: '今日もまたちょっと…こっそりと言い訳をつくって…' },
            {
                index: 2,
                text: '而且我觉得自慰是不够的吧 确实 听说这里的厕所里有个家伙在舔自己 好的 不用客气 慢慢来 认真点',
                sourceText: 'Sよりよーよりもう…ちょっとここ勘弁しませんか?',
            },
        ];
        const out = recycle.scrubRecycledTranslations(cues, new Map(), { blankText: '' });
        assert.ok(out.scrubbed >= 1, `scrubbed=${out.scrubbed}`);
        assert.strictEqual(out.cues[2].text, '');
        assert.ok(out.cues[0].text.includes('厕所'));
    });

    it('scrubs near-paraphrase family sharing a long stem on divergent JA', () => {
        const cues = [
            { index: 0, text: '我连工作都做不了 今天也呆在家里？', sourceText: '仕事もできないし今日も家にいるわけ?' },
            { index: 1, text: '我连工作都做不了 今天也得待在家里？', sourceText: '洗ってきなさいよね' },
            { index: 2, text: '我连工作都做不了 今天也只好在家待着', sourceText: '家に他のも入れないんでご飯ばっか食べて' },
        ];
        const out = recycle.scrubRecycledTranslations(cues, new Map(), { blankText: '…' });
        assert.strictEqual(out.cues[0].text, '我连工作都做不了 今天也呆在家里？');
        assert.ok(out.scrubbed >= 2, `scrubbed=${out.scrubbed}`);
        assert.strictEqual(out.cues[1].text, '…');
        assert.strictEqual(out.cues[2].text, '…');
    });
});

describe('mt-sanitize long ZH high-freq unstick', () => {
    it('blanks long recycled ZH when count>=3 on divergent JA', () => {
        const phrase = '我紧张 是吗？ 真的可以看吗？';
        const zh = [
            { index: 0, text: phrase },
            { index: 1, text: phrase },
            { index: 2, text: phrase },
            { index: 3, text: phrase },
            { index: 4, text: phrase },
        ];
        const ja = [
            { index: 0, text: '今のぐだった。' },
            { index: 1, text: 'ちょっと、え?' },
            { index: 2, text: 'あ、あの' },
            { index: 3, text: '自分で脱いで。' },
            { index: 4, text: '動いてる' },
        ];
        const out = mtSanitize.sanitizeMtCues(zh, ja, {
            dropUselessEllipsis: false,
            rematerializeOntoSource: false,
        });
        const kept = out.cues.filter((c) => String(c.text || '').includes('我紧张')).length;
        const blankish = out.cues.filter((c) => {
            const t = String(c.text || '').trim();
            return !t || t === '…' || t === '...';
        }).length;
        assert.ok(kept <= 1, `expected at most 1 kept paste, got ${kept}`);
        assert.ok(blankish >= 3, `expected most recycled blanked, blankish=${blankish}`);
    });
});
