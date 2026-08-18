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

    it('boosts score with QC / ASR / weird product signals', () => {
        const base = polish.scoreCueForPlotPolish('今日はいい天気ですね。', '今天天气不错。', {});
        const qc = polish.scoreCueForPlotPolish('今日はいい天気ですね。', '今天天气不错。', {
            qcTypes: ['weird', 'fluency'],
        });
        const asr = polish.scoreCueForPlotPolish('今日はいい天気ですね。', '今天天气不错。', {
            asrConfidence: 0.3,
        });
        const weird = polish.scoreCueForPlotPolish('待って', '__GLOSS01__等等', {});
        assert.ok(qc > base);
        assert.ok(asr > base);
        assert.ok(weird > base);
        assert.ok(polish.productRiskBonus('x', 'y', { qcTypes: ['weird'] }) >= 4);
    });

    it('selects high-risk pairs using cue confidence maps', () => {
        const source = [
            { index: 0, text: '今日はいい天気ですね。', asrConfidence: 0.9 },
            { index: 1, text: 'ちょっと待ってくださいね。', confidence: 0.2 },
            { index: 2, text: 'うん' },
            { index: 3, text: 'もう一度お願い' },
        ];
        const zh = [
            { index: 0, text: '今天天气不错。' },
            { index: 1, text: '请稍等一下。' },
            { index: 2, text: '嗯' },
            { index: 3, text: '请再说一次' },
        ];
        const pairs = polish.selectCuesForPlotPolish(source, zh, {
            limit: 8,
            qcTypesByIndex: { 3: ['fluency'] },
        });
        assert.ok(pairs.some((p) => p.index === 1 || p.index === 3));
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
        assert.ok(msgs[0].content.includes('欠译补回'));
        assert.ok(!msgs[0].content.includes('语意不变'));
        assert.ok(msgs[0].content.includes('禁止'));
        assert.ok(msgs[1].content.includes('source'));
        assert.ok(msgs[1].content.includes('香水'));
    });

    it('scores filler ZH + lexical JA and invented-fact cues', () => {
        const clean = polish.scoreCueForPlotPolish('今日はいい天気ですね。', '今天天气不错。', {});
        const filler = polish.scoreCueForPlotPolish('ちょっと待ってください', '嗯', {});
        const hang = polish.scoreCueForPlotPolish('もう止まって', '船停了', {});
        assert.ok(filler > clean);
        assert.ok(filler >= 7);
        assert.ok(hang > clean);
        assert.strictEqual(polish.looksLikeInventedFact('もう止まって', '船停了'), true);
        assert.strictEqual(polish.looksLikeInventedFact('船が止まって', '船停了'), false);
    });

    it('lets polish grow filler-only drafts into real dialogue', () => {
        const prev = new Map([
            [0, '嗯'],
            [1, '香水纯，等等'],
        ]);
        const filtered = polish.filterPlotPolishUpdates([
            { index: 0, text: '等一下，那个声音' },
            { index: 1, text: '香水纯，等一下' },
        ], prev);
        assert.ok(filtered.some((u) => u.index === 0 && u.text.includes('等一下')));
        assert.ok(filtered.some((u) => u.index === 1));
        const leak = polish.filterPlotPolishUpdates([
            { index: 0, text: '改为符合原文语气' },
        ], new Map([[0, '不过啊']]));
        assert.strictEqual(leak.length, 0);
    });

    it('selects undertranslated filler lines for polish', () => {
        const pairs = polish.selectCuesForPlotPolish(
            [
                { index: 0, text: '今日はいい天気ですね。' },
                { index: 1, text: 'ちょっと待って、その音ある' },
            ],
            [
                { index: 0, text: '今天天气不错。' },
                { index: 1, text: '嗯' },
            ],
            { limit: 8 },
        );
        assert.ok(pairs.some((p) => p.index === 1));
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

const verify = require('../src/js/smart-translate-verify-core');
const address = require('../src/js/smart-translate-address-core');

describe('smart-translate-verify-core filler recovery', () => {
    it('does not auto-revert filler draft grown into dialogue', () => {
        assert.strictEqual(
            verify.heuristicVerifyAction('ちょっと待ってください', '嗯', '等一下'),
            null,
        );
        assert.strictEqual(
            verify.heuristicVerifyAction('今日はいい天気ですね。', '今天天气不错。', '今天天气不错。'),
            'accept',
        );
        const msgs = verify.buildFaithfulnessVerifyMessages({
            pairs: [{ index: 0, sourceText: '待って', draft: '嗯', text: '等一下' }],
        });
        assert.ok(msgs[0].content.includes('语气词'));
    });
});

describe('smart-translate-address-core senpai lock', () => {
    it('locks 先輩 to the majority ZH form', () => {
        const out = address.applyHeuristicAddressFixesToCues(
            [
                { index: 0, text: '先輩、待って' },
                { index: 1, text: '先輩ありがとう' },
                { index: 2, text: '先輩すごい' },
            ],
            [
                { index: 0, text: '学长，等等' },
                { index: 1, text: '学姐谢谢' },
                { index: 2, text: '学长厉害' },
            ],
        );
        assert.ok(out.cues.every((c) => c.text.includes('学长')));
        assert.ok(out.cues.every((c) => !c.text.includes('学姐')));
        assert.ok(out.fixed >= 1);
    });
});
