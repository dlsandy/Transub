const assert = require('assert');
const hymt = require('../src/js/hymt-translate-core');
const sakuraCore = require('../src/js/sakura-translate-core');
const catalog = require('../src/js/sakura-mt-catalog-core');

describe('hymt-translate-core', () => {
    it('buildHyMtChatMessages uses official Style + Terminology (spoken)', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            {
                glossaryTerms: [{ term: '太郎', translation: '太郎君' }],
                contentProfile: 'av_soft',
                avGlossary: false,
                avActorGlossary: false,
                nsfwLexicon: false,
            },
        );
        assert.strictEqual(msgs.length, 1);
        assert.strictEqual(msgs[0].role, 'user');
        assert.match(msgs[0].content, /参考下面的翻译/);
        assert.match(msgs[0].content, /太郎 翻译成 太郎君/);
        assert.match(msgs[0].content, /请将以下文本翻译为简体中文/);
        assert.match(msgs[0].content, /风格要严格符合【/);
        assert.match(msgs[0].content, /自然口语化/);
        assert.match(msgs[0].content, /こんにちは/);
        assert.doesNotMatch(msgs[0].content, /【翻译任务】/);
        assert.doesNotMatch(msgs[0].content, /【待翻译文本】/);
        assert.doesNotMatch(msgs[0].content, /role:\s*system/i);
        assert.doesNotMatch(msgs[0].content, /拟声参考/);
    });

    it('uses translateStylePreset in Hy-MT Style clause', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            {
                translateStyleEnabled: true,
                translateStylePreset: 'news_narration',
                contentProfile: 'film',
                avGlossary: false,
                avActorGlossary: false,
                nsfwLexicon: false,
            },
        );
        assert.match(msgs[0].content, /新闻|旁白|纪录片/);
    });

    it('soft-AV mundane vs adult Style hints', () => {
        const mundane = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'うん' }, { index: 1, text: 'そうだね' }],
            { contentProfile: 'av_soft', sakuraNsfwPrompt: true, nsfwLexicon: false, avGlossary: false, avActorGlossary: false },
        );
        assert.match(mundane[0].content, /保留等量的换行分隔符/);
        assert.match(mundane[0].content, /禁止臆造成人向/);
        assert.match(mundane[0].content, /うん/);
        assert.doesNotMatch(mundane[0].content, /【翻译任务】/);
        assert.doesNotMatch(mundane[0].content, /【待翻译文本】/);

        const adult = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'どんなセックスが好きなのかな?' }],
            { contentProfile: 'av_soft', nsfwLexicon: false, avGlossary: false, avActorGlossary: false },
        );
        assert.match(adult[0].content, /不拒译|忠实传达/);
        assert.ok(hymt.cueTextHasAdultJaAnchor?.('どんなセックスが好きなのかな?'));
        assert.strictEqual(hymt.cueTextHasAdultJaAnchor?.('これ先生の好きなおまんじゅうです'), false);
        assert.strictEqual(hymt.cueTextHasAdultJaAnchor?.('今お茶入れてきます はい'), false);
        assert.strictEqual(hymt.shouldApplySoftHyMtStyle?.(
            { contentProfile: 'av_soft' },
            [{ text: 'これ先生の好きなおまんじゅうです' }],
        ), false);
        assert.ok(hymt.cueTextHasAdultJaAnchor?.('おまんこが気持ちいい'));
    });

    it('hyMtFullSoftPrompt uses official Personalization order (source then task)', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'うん' }, { index: 1, text: 'そうだね' }],
            {
                contentProfile: 'av_soft',
                hyMtFullSoftPrompt: true,
                nsfwLexicon: false,
                avGlossary: false,
                avActorGlossary: false,
            },
        );
        assert.match(msgs[0].content, /【待翻译文本】/);
        assert.match(msgs[0].content, /【翻译任务】/);
        const taskAt = msgs[0].content.indexOf('【翻译任务】');
        const srcAt = msgs[0].content.indexOf('【待翻译文本】');
        assert.ok(srcAt >= 0 && taskAt > srcAt);
    });

    it('inference temperature is between fidelity and official naturalness', () => {
        assert.ok(hymt.HYMT_INFERENCE.temperature >= 0.4);
        assert.ok(hymt.HYMT_INFERENCE.temperature <= 0.7);
        assert.strictEqual(hymt.HYMT_INFERENCE.top_p, 0.6);
        assert.strictEqual(hymt.HYMT_INFERENCE.repetition_penalty, 1.05);
    });

    it('caps terminology and prefers in-chunk terms', () => {
        const many = [];
        for (let i = 0; i < 40; i++) {
            many.push({ term: `名詞${i}`, translation: `译名${i}` });
        }
        many.push({ term: '太郎', translation: '太郎君', info: '很长很长的备注应当被省略以免撑爆上下文' });
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: '太郎が来た' }],
            {
                glossaryTerms: many,
                contentProfile: 'general',
                avGlossary: false,
                nsfwLexicon: false,
            },
        );
        const termLines = (msgs[0].content.match(/翻译成/g) || []).length;
        assert.ok(termLines <= hymt.HYMT_MAX_TERMINOLOGY);
        assert.match(msgs[0].content, /太郎 翻译成 太郎君/);
        assert.doesNotMatch(msgs[0].content, /很长很长的备注/);
        // In-chunk term should appear before or among capped set (not dropped).
        const idx = msgs[0].content.indexOf('太郎 翻译成 太郎君');
        assert.ok(idx > 0);
    });

    it('stripHyMtLeak removes stop tokens', () => {
        const cleaned = hymt.stripHyMtLeak('你好<|hy_end_of_assistant|>');
        assert.strictEqual(cleaned, '你好');
    });

    it('stripHyMtLeak and looksLikeHyMtPromptLeak catch instruction echoes', () => {
        const leak1 = '专有名词仅使用原文已出现的写法或术语表译名 禁止臆造角色名（如 舞 等）';
        const leak2 = '总共有8行原文 我会逐行将其翻译成中文';
        const leak3 = '忠实译全句语义；禁止摘要、半句、用省略号代替对白';
        assert.ok(hymt.looksLikeHyMtPromptLeak(leak1));
        assert.ok(hymt.looksLikeHyMtPromptLeak(leak2));
        assert.ok(hymt.looksLikeHyMtPromptLeak(leak3));
        assert.strictEqual(hymt.stripHyMtMetaInstructions(leak1), '');
        assert.strictEqual(hymt.stripHyMtMetaInstructions(leak2), '');
        assert.strictEqual(hymt.stripHyMtMetaInstructions(leak3), '');
    });

    it('parseLineAlignedOutput blanks Hy-MT prompt-leak lines', () => {
        const parsed = sakuraCore.parseLineAlignedOutput(
            '专有名词仅使用原文已出现的写法或术语表译名 禁止臆造角色名\n正常译文',
            [{ index: 0, text: 'テスト1' }, { index: 1, text: 'テスト2' }],
        );
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.cues[0].text, '');
        assert.strictEqual(parsed.cues[1].text, '正常译文');
    });

    it('resolveHyMtInferenceOptions adapts context; soft disables prompt cache', () => {
        assert.strictEqual(hymt.HYMT_SUBTITLE_CONTEXT_SIZE, 8192);
        assert.strictEqual(hymt.HYMT_SUBTITLE_CONTEXT_SIZE_FAST, 4096);
        assert.strictEqual(hymt.HYMT_WINDOW_LINES_SOFT, 1);
        assert.strictEqual(hymt.HYMT_WINDOW_LINES_DEFAULT, 1);
        assert.strictEqual(hymt.HYMT_MAX_TERMINOLOGY, 16);
        const soft = hymt.resolveHyMtInferenceOptions({ contentProfile: 'av_soft' });
        assert.strictEqual(soft.contextSize, 8192);
        assert.strictEqual(soft.cachePrompt, false);
        assert.strictEqual(soft.windowLines, 1);
        const plain = hymt.resolveHyMtInferenceOptions({ contentProfile: 'general' });
        assert.strictEqual(plain.contextSize, 4096);
        assert.strictEqual(plain.windowLines, 1);
        assert.strictEqual(plain.cachePrompt, true);
        const tight = hymt.resolveHyMtInferenceOptions({
            contentProfile: 'av_soft',
            glossaryTerms: Array.from({ length: 20 }, (_, i) => ({ term: `a${i}`, translation: `b${i}` })),
        });
        assert.strictEqual(tight.windowLines, hymt.HYMT_WINDOW_LINES_TIGHT);
    });

    it('buildHyMtChatMessages uses minimal template for blank retry', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 0, text: '見ないで' }],
            { contentProfile: 'av_soft', _blankRetry: true, avGlossary: false, nsfwLexicon: false },
        );
        assert.match(msgs[0].content, /将以下文本翻译为简体中文/);
        assert.match(msgs[0].content, /只需要输出翻译后的结果|不要额外解释/);
        assert.match(msgs[0].content, /风格符合【/);
        assert.match(msgs[0].content, /見ないで/);
        assert.doesNotMatch(msgs[0].content, /【翻译任务】/);
        assert.doesNotMatch(msgs[0].content, /【待翻译文本】/);
        const multi = hymt.buildMinimalHyMtChatMessages(
            [{ index: 0, text: 'あ' }, { index: 1, text: 'い' }],
            { contentProfile: 'general' },
        );
        assert.match(multi[0].content, /保留等量换行/);
        assert.match(multi[0].content, /自然口语化/);
    });

    it('mundane hospital chunk skips soft NSFW style; adult chunk keeps it', () => {
        const hospital = hymt.buildHyMtChatMessages(
            [
                { index: 0, text: 'こんにちは' },
                { index: 1, text: '廊下になるので' },
            ],
            { contentProfile: 'av_soft', sakuraNsfwPrompt: true, nsfwLexicon: false, avGlossary: false, avActorGlossary: false },
        );
        assert.match(hospital[0].content, /风格要严格符合【/);
        assert.match(hospital[0].content, /禁止臆造成人向/);
        assert.doesNotMatch(hospital[0].content, /拟声参考/);
        assert.doesNotMatch(hospital[0].content, /不净化不拒译/);

        const adult = hymt.buildHyMtChatMessages(
            [{ index: 0, text: 'ちんぽ咥えて' }],
            { contentProfile: 'av_soft', sakuraNsfwPrompt: true, nsfwLexicon: false, avGlossary: false, avActorGlossary: false },
        );
        assert.match(adult[0].content, /不拒译|忠实传达/);
        assert.ok(hymt.chunkHasAdultJaAnchor([{ text: 'ちんぽ咥えて' }]));
        assert.ok(!hymt.chunkHasAdultJaAnchor([{ text: 'こんにちは' }]));
    });
    it('partitionBlankRetryCues / chunkBlankRetryCues batch blank recovery', () => {
        const cues = [
            { index: 0, text: 'うん' },
            { index: 1, text: 'これは長い対白ですよ本当に長いです' },
            { index: 2, text: 'はい' },
            { index: 3, text: 'もう一つ長い台詞がありますね' },
            { index: 4, text: 'さらに長い対白を用意しています' },
        ];
        const part = hymt.partitionBlankRetryCues(cues, { contentProfile: 'av_soft', skipFakeGreeting: true });
        assert.ok(part.retryCues.length + part.prefilled.length === cues.length);
        const batches = hymt.chunkBlankRetryCues(part.retryCues.length ? part.retryCues : cues, 4);
        assert.ok(batches.length >= 1);
        assert.ok(batches.every((b) => b.length <= 4));
        assert.strictEqual(hymt.HYMT_BLANK_RETRY_BATCH, 4);
        assert.strictEqual(hymt.resolveHyMtBlankRetryBatchSize({ perfProfile: 'quality' }), 4);
        assert.strictEqual(hymt.resolveHyMtBlankRetryBatchSize({ perfProfile: 'speed' }), 1);
        assert.strictEqual(hymt.resolveHyMtBlankRetryBatchSize({ hyMtBlankRetryBatch: 2 }), 2);
    });

    it('sakura core routes hy-mt2 ids to hymt family and messages', () => {
        assert.strictEqual(catalog.resolvePromptFamily('hy-mt2-7b'), 'hymt');
        assert.strictEqual(catalog.resolvePromptFamily('hy-mt2-1.8b'), 'hymt');
        for (const modelId of ['hy-mt2-7b', 'hy-mt2-1.8b']) {
            const msgs = sakuraCore.buildChatMessages(
                [{ index: 0, text: 'テスト' }],
                {
                    modelId,
                    promptFamily: 'hymt',
                    glossaryTerms: [{ term: '太郎', translation: '太郎君' }],
                    avGlossary: false,
                    nsfwLexicon: false,
                },
            );
            assert.strictEqual(msgs.length, 1);
            assert.match(msgs[0].content, /太郎 翻译成 太郎君/);
        }
    });

    it('routes Hunyuan Chimera abliterated to hunyuan direct-translate prompts', () => {
        assert.strictEqual(hymt.isHyMtModel('hunyuan-mt-chimera-7b-abliterated'), false);
        assert.ok(hymt.isHunyuanMtModel('hunyuan-mt-chimera-7b-abliterated'));
        assert.strictEqual(catalog.resolvePromptFamily('hunyuan-mt-chimera-7b-abliterated'), 'hunyuan');
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            {
                modelId: 'hunyuan-mt-chimera-7b-abliterated',
                subtitleTargetLang: 'zh-Hans',
            },
        );
        assert.strictEqual(msgs.length, 1);
        assert.match(msgs[0].content, /把下面的文本翻译成中文/);
        assert.ok(msgs[0].content.includes('こんにちは'));
    });

    it('routes Huihui Hunyuan-MT / HY-MT1.5 abliterated to hunyuan prompts (not Hy-MT2)', () => {
        for (const id of [
            'hunyuan-mt-7b-abliterated',
            'hy-mt15-7b-abliterated',
            'hy-mt15-1.8b-abliterated',
        ]) {
            assert.strictEqual(hymt.isHyMtModel(id), false, id);
            assert.ok(hymt.isHunyuanMtModel(id), id);
            assert.strictEqual(catalog.resolvePromptFamily(id), 'hunyuan', id);
        }
    });
});
