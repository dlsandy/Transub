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
        assert.ok(msgs[0].content.includes('贴近原文'));
        assert.ok(msgs[0].content.includes('同义整句换写'));
        assert.ok(msgs[0].content.includes('禁止'));
        assert.ok(msgs[1].content.includes('source'));
        assert.ok(msgs[1].content.includes('香水'));
        const huihuiMsgs = polish.buildPlotPolishMessages({
            pairs,
            modelId: 'qwen3-8b-abliterated',
        });
        assert.ok(huihuiMsgs[0].content.includes('Huihui') || huihuiMsgs[0].content.includes('消融'));
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

    it('rejects plot-topic invent polish on short spoken JA', () => {
        assert.strictEqual(
            polish.looksLikePlotTopicInvent?.(
                'ここ どこだ?',
                '请也停止拍照 这里是可以住宿的地方',
            ),
            true,
        );
        assert.strictEqual(
            polish.looksLikePlotTopicInvent?.('ここ どこだ?', '这里是哪里？'),
            false,
        );
        const prev = new Map([[0, '这里是哪里？']]);
        const filtered = polish.filterPlotPolishUpdates(
            [{ index: 0, text: '为了研究而伪装成猎奇杀人来收集大脑 这种想法未免也太过夸张了吧' }],
            prev,
            { sourceByIndex: new Map([[0, 'すいません']]) },
        );
        assert.strictEqual(filtered.length, 0);
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

    it('rejects style-only rewrites that barely reuse draft wording', () => {
        const prev = new Map([
            [0, '今天天气不错。'],
            [1, '请稍等一下。'],
        ]);
        const filtered = polish.filterPlotPolishUpdates([
            { index: 0, text: '今日气候甚佳呢' },
            { index: 1, text: '请稍等一下吧' },
        ], prev);
        assert.ok(!filtered.some((u) => u.index === 0));
        assert.ok(filtered.some((u) => u.index === 1));
    });

    it('hint+polish prefers non-neutral emotion windows', () => {
        const source = [
            { index: 0, text: '今日はいい天気ですね。' },
            { index: 1, text: 'ちょっと待ってくださいね。', emotion: 'ANGRY' },
        ];
        const translated = [
            { index: 0, text: '今天天气不错。' },
            { index: 1, text: '请稍等一下。' },
        ];
        const off = polish.selectCuesForPlotPolish(source, translated, {
            sensevoiceEmotionMtStyle: 'off',
            sensevoiceRichTags: 'sidecar',
            limit: 4,
        });
        const on = polish.selectCuesForPlotPolish(source, translated, {
            sensevoiceEmotionMtStyle: 'hint+polish',
            sensevoiceRichTags: 'sidecar',
            limit: 4,
        });
        const angryOn = on.find((r) => r.index === 1);
        const angryOff = off.find((r) => r.index === 1);
        assert.ok(angryOn);
        if (angryOff) {
            assert.ok(angryOn.score > angryOff.score);
        } else {
            assert.ok(angryOn.score >= 2);
        }
        const scored = polish.scoreCueForPlotPolish('待って', '等等', {
            preferEmotionPolish: true,
            emotion: 'HAPPY',
        });
        const plain = polish.scoreCueForPlotPolish('待って', '等等', {});
        assert.ok(scored > plain);
    });

    it('buildPlotPolishMessages includes emotion block when hint+polish', () => {
        const msgs = polish.buildPlotPolishMessages({
            pairs: [{ index: 0, sourceText: '待って', text: '等等', emotion: 'ANGRY' }],
            sensevoiceEmotionMtStyle: 'hint+polish',
            sensevoiceRichTags: 'sidecar',
        });
        assert.ok(msgs[1].content.includes('急促') || msgs[1].content.includes('语气'));
    });

    it('scores and selects neighbor echo / 窜句 pairs for hybrid polish', () => {
        const bleed = polish.scoreNeighborCueBleed(
            'つまり、この勃起は…',
            '也就是说，这个勃起是…',
            'この勃起は…',
            '也就是说，这个勃起是…',
        );
        assert.ok(bleed.score >= 5, JSON.stringify(bleed));
        assert.ok(bleed.reasons.includes('zh_echo') || bleed.reasons.includes('ja_echo'));

        const clean = polish.scoreNeighborCueBleed(
            '気持ちいい…',
            '好舒服…',
            '旦那とどっちが気持ちいい?',
            '跟老公比哪个更舒服？',
        );
        assert.ok(clean.score < 5, JSON.stringify(clean));

        const source = [
            { index: 0, text: 'つまり、この勃起は…' },
            { index: 1, text: 'この勃起は…' },
            { index: 2, text: '奥さんの勃起だよ…' },
            { index: 3, text: '今日はいい天気ですね。' },
        ];
        const zh = [
            { index: 0, text: '也就是说，这个勃起是…' },
            { index: 1, text: '也就是说，这个勃起是…' },
            { index: 2, text: '是太太的勃起哦…' },
            { index: 3, text: '今天天气不错。' },
        ];
        const pairs = polish.selectCuesForPlotPolish(source, zh, { limit: 8 });
        assert.ok(pairs.some((p) => p.index === 0 || p.index === 1));
        const echoRow = pairs.find((p) => p.index === 1) || pairs.find((p) => p.index === 0);
        assert.ok(echoRow);
        assert.ok((echoRow.neighborBleedScore || 0) >= 5 || (echoRow.neighborReasons || []).length);
        assert.ok(echoRow.prevSource || echoRow.nextSource);

        const msgs = polish.buildPlotPolishMessages({ pairs });
        assert.ok(msgs[0].content.includes('邻条回声') || msgs[0].content.includes('窜句'));
        assert.ok(msgs[1].content.includes('prevSource') || msgs[1].content.includes('flags'));

        const shortened = polish.filterPlotPolishUpdates(
            [{ index: 1, text: '这个勃起是…' }],
            new Map([[1, '也就是说，这个勃起是…']]),
            {
                sourceByIndex: new Map([[1, 'この勃起は…']]),
                echoBleedByIndex: new Map([[1, true]]),
            },
        );
        assert.strictEqual(shortened.length, 1);

        const boosted = polish.suggestPolishSampleLimit(source, zh, { limit: 24 });
        assert.ok(boosted >= 24);
    });

    it('detects multi-speaker mix and applies proportional JA+ZH splits', () => {
        const src = '先輩、待ってください。もういいよ、行こう。';
        const zh = '学长，请等一下。已经可以了，走吧。';
        const mix = polish.scoreMultiSpeakerMix(src, zh);
        assert.ok(mix.score >= 5, JSON.stringify(mix));
        assert.ok(
            mix.reasons.includes('ja_mid_sentence_break')
            || mix.reasons.includes('ja_address_switch'),
        );

        // Soft turn without 。！？ (comma / interjection handoff).
        const soft = polish.scoreMultiSpeakerMix(
            '先輩、ちょっと待って、ねえ聞いてよこれ大事な話',
            '学长，等一下，喂你听我说这很重要',
        );
        assert.ok(soft.score >= 5, JSON.stringify(soft));
        assert.ok(
            soft.reasons.includes('ja_soft_turn_break')
            || soft.reasons.includes('ja_particle_handoff')
            || soft.reasons.includes('ja_multi_quote'),
        );

        const quoted = polish.scoreMultiSpeakerMix(
            '彼は「行くな」と言った「わかった」と答えた',
            '他说「别走」「知道了」她答道',
        );
        assert.ok(quoted.score >= 5, JSON.stringify(quoted));
        assert.ok(quoted.reasons.includes('ja_multi_quote') || quoted.reasons.includes('ja_quote_tail'));

        const source = [
            { index: 0, text: '今日はいい天気ですね。', startMs: 0, endMs: 2000 },
            { index: 1, text: src, startMs: 2000, endMs: 6000 },
            { index: 2, text: 'うん', startMs: 6000, endMs: 6500 },
        ];
        const translated = [
            { index: 0, text: '今天天气不错。' },
            { index: 1, text: zh },
            { index: 2, text: '嗯' },
        ];
        const pairs = polish.selectCuesForPlotPolish(source, translated, { limit: 8 });
        const mixRow = pairs.find((p) => p.index === 1);
        assert.ok(mixRow, 'multi-speaker cue should be selected');
        assert.ok((mixRow.multiSpeakerScore || 0) >= 5);

        const msgs = polish.buildPlotPolishMessages({ pairs });
        assert.ok(msgs[0].content.includes('多人混句') || msgs[0].content.includes('split'));
        assert.ok(msgs[1].content.includes('multi_speaker') || msgs[1].content.includes('flags'));

        const ops = polish.parsePlotPolishOps(JSON.stringify({
            cues: [{
                index: 1,
                split: [
                    { source: '先輩、待ってください。', text: '学长，请等一下。' },
                    { source: 'もういいよ、行こう。', text: '已经可以了，走吧。' },
                ],
            }],
        }), [1]);
        assert.strictEqual(ops.splits.length, 1);
        assert.strictEqual(ops.updates.length, 0);

        const applied = polish.applyPlotPolishSplits(source, translated, ops.splits);
        assert.strictEqual(applied.splitCount, 1);
        assert.strictEqual(applied.sourceCues.length, 4);
        assert.strictEqual(applied.cues.length, 4);
        assert.ok(applied.sourceCues[1].text.includes('先輩'));
        assert.ok(applied.sourceCues[2].text.includes('行こう'));
        assert.ok(applied.cues[1].text.includes('学长'));
        assert.ok(applied.cues[2].text.includes('走吧'));
        assert.ok(applied.sourceCues[1].endMs <= applied.sourceCues[2].startMs + 1);
        assert.strictEqual(applied.sourceCues[1].startMs, 2000);
        assert.strictEqual(applied.sourceCues[2].endMs, 6000);
        assert.ok(Array.isArray(applied.splitPartIndexes) && applied.splitPartIndexes.length === 2);
        assert.ok(applied.parentZhByNewIndex?.get?.(applied.splitPartIndexes[0]));

        // JA/ZH share the same cut times even when ZH lengths differ.
        assert.strictEqual(applied.cues[1].startMs, applied.sourceCues[1].startMs);
        assert.strictEqual(applied.cues[1].endMs, applied.sourceCues[1].endMs);
        assert.strictEqual(applied.cues[2].startMs, applied.sourceCues[2].startMs);
    });
});

const verify = require('../src/js/smart-translate-verify-core');
const address = require('../src/js/smart-translate-address-core');

describe('smart-translate-verify-core filler recovery', () => {
    it('does not restore glued parent ZH into a multi-speaker split part', () => {
        const applied = verify.applyVerifyDecisions(
            [{ index: 1, action: 'revert' }],
            new Map([[1, '学长，请等一下。已经可以了，走吧。']]),
            new Map([[1, '已经可以了，走吧。']]),
            { splitPartByIndex: new Set([1]) },
        );
        assert.strictEqual(applied.byIndex.get(1), '已经可以了，走吧。');
        assert.ok((applied.accepted || 0) >= 1);
    });

    it('does not auto-revert filler draft grown into dialogue', () => {
        assert.strictEqual(
            verify.heuristicVerifyAction('ちょっと待ってください', '嗯', '等一下'),
            null,
        );
        assert.strictEqual(
            verify.heuristicVerifyAction('今日はいい天気ですね。', '今天天气不错。', '今天天气不错。'),
            'accept',
        );
        assert.strictEqual(
            verify.heuristicVerifyAction('今日はいい天気ですね。', '今天天气不错。', '今日气候甚佳呢'),
            'revert',
        );
        // Echo/窜句: shorten glued draft toward short JA — must not hard-revert.
        assert.notStrictEqual(
            verify.heuristicVerifyAction(
                'この勃起は…',
                '也就是说，这个勃起是……也就是说这个勃起',
                '这个勃起是…',
            ),
            'revert',
        );
        const msgs = verify.buildFaithfulnessVerifyMessages({
            pairs: [{ index: 0, sourceText: '待って', draft: '嗯', text: '等一下' }],
        });
        assert.ok(msgs[0].content.includes('语气词'));
        assert.ok(msgs[0].content.includes('改文风'));
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

    it('character note 直呼 strips 标准名小姐 without JA honorific', () => {
        const fixed = address.applyHeuristicAddressFixes('芙兰小姐好', 'こんにちは', {
            glossaryTerms: [{
                term: 'フラン',
                translation: '芙兰',
                role: 'character',
                note: '女·老师·直呼',
            }],
        });
        assert.strictEqual(fixed.text, '芙兰好');
        assert.ok(fixed.reasons.includes('character_direct'));
    });

    it('includes character notes in address prompt', () => {
        const msgs = address.buildAddressConsistencyMessages({
            pairs: [{ index: 0, sourceText: 'フランさん', text: '芙兰小姐' }],
            glossaryTerms: [{
                term: 'フラン',
                translation: '芙兰',
                role: 'character',
                note: '直呼·对主角用你',
            }],
        });
        assert.ok(msgs[1].content.includes('角色设定'));
        assert.ok(msgs[1].content.includes('直呼'));
    });
});
