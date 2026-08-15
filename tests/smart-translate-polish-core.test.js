const assert = require('assert');
const polish = require('../src/js/smart-translate-polish-core');

describe('smart-translate-polish-core', () => {
    it('defaults plot polish on unless explicitly false', () => {
        assert.strictEqual(polish.normalizePlotPolishOption(undefined), true);
        assert.strictEqual(polish.normalizePlotPolishOption(null), true);
        assert.strictEqual(polish.normalizePlotPolishOption(true), true);
        assert.strictEqual(polish.normalizePlotPolishOption(false), false);
        assert.strictEqual(polish.normalizePlotPolishOption('off'), false);
    });

    it('scores honorific / glossary miss higher than clean lines', () => {
        const glossary = [{ term: '香水さん', translation: '香水纯' }];
        const low = polish.scoreCueForPlotPolish('今日はいい天気ですね。', '今天天气不错。', { glossaryTerms: glossary });
        const high = polish.scoreCueForPlotPolish('香水さん、待って', '香水小姐，等等', { glossaryTerms: glossary });
        assert.ok(high > low);
        assert.ok(high >= 4);
    });

    it('selects high-risk pairs and builds polish prompts', () => {
        const source = [
            { index: 0, text: '香水さん、待って' },
            { index: 1, text: 'うん' },
            { index: 2, text: '真琴はもう寝たよ' },
            { index: 3, text: '今日はいい天気ですね。' },
        ];
        const zh = [
            { index: 0, text: '香水小姐，等等' },
            { index: 1, text: '嗯' },
            { index: 2, text: '真琴已经睡了' },
            { index: 3, text: '今天天气不错。' },
        ];
        const pairs = polish.selectCuesForPlotPolish(source, zh, {
            glossaryTerms: [
                { term: '香水さん', translation: '香水纯' },
                { term: '真琴', translation: '真琴' },
            ],
            limit: 8,
        });
        assert.ok(pairs.some((p) => p.index === 0));
        assert.ok(pairs.length >= 1);
        const msgs = polish.buildPlotPolishMessages({
            pairs,
            filmBrief: { characters: [{ name: '香水纯', role: '叙述者' }], tone: '口语' },
            glossaryTerms: [{ term: '香水さん', translation: '香水纯' }],
            faithfulTone: true,
        });
        assert.strictEqual(msgs.length, 2);
        assert.ok(msgs[0].content.includes('语意不变'));
        assert.ok(msgs[0].content.includes('禁止'));
        assert.ok(msgs[1].content.includes('source'));
        assert.ok(msgs[1].content.includes('香水'));
    });

    it('filters polish updates that rewrite too aggressively', () => {
        const prev = new Map([
            [0, '香水纯，等等'],
            [1, '真琴已经睡了'],
        ]);
        const filtered = polish.filterPlotPolishUpdates([
            { index: 0, text: '香水纯，等一下' },
            { index: 1, text: '整段完全不同的长篇剧情旁白而且几乎没有原稿汉字' },
            { index: 2, text: '幽灵条目' },
            { index: 0, text: '' },
        ], prev);
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].index, 0);
        assert.ok(filtered[0].text.includes('香水纯'));
    });
});
