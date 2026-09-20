const assert = require('assert');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const sakuraCore = require('../src/js/sakura-translate-core');
const sanitize = require('../src/js/mt-sanitize-core');
const { mapTaskToEngineTask } = require('../electron/engine-options');

describe('sakura-mt-catalog-core', () => {
    it('lists Sakura / GalTransl across 1.5B–14B (large sizes stay free)', () => {
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-1.5b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-7b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-8b-qwen3'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-14b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-14b-q4km'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-14b-q6k'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-14b-qwen3'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-7b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-7b-q6k'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-v4-4b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-14b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-14b-q4km'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-galtransl-14b-q6k'));
        assert.ok(sakuraCatalog.findCatalogEntry('hy-mt2-1.8b'));
        assert.ok(sakuraCatalog.findCatalogEntry('hy-mt2-7b'));
        assert.ok(sakuraCatalog.findCatalogEntry('hunyuan-mt-chimera-7b-abliterated'));
        assert.ok(sakuraCatalog.findCatalogEntry('hunyuan-mt-7b-abliterated'));
        assert.ok(sakuraCatalog.findCatalogEntry('hy-mt15-1.8b-abliterated'));
        assert.ok(sakuraCatalog.findCatalogEntry('hy-mt15-7b-abliterated'));
        assert.ok(sakuraCatalog.findCatalogEntry('translategemma-4b'));
        assert.ok(sakuraCatalog.findCatalogEntry('translategemma-4-sub-e4b'));
        assert.ok(sakuraCatalog.findCatalogEntry('translategemma-12b'));
        assert.ok(sakuraCatalog.findCatalogEntry('translategemma-27b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-ln-korean-7b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-ln-korean-14b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-ln-ko2ja-14b'));
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('translategemma-4b'), 'translategemma');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('translategemma-4-sub-e4b'), 'translategemmasub');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hunyuan-mt-chimera-7b-abliterated'), 'hunyuan');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hunyuan-mt-7b-abliterated'), 'hunyuan');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hy-mt15-7b-abliterated'), 'hunyuan');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hy-mt15-1.8b-abliterated'), 'hunyuan');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-ln-korean-7b'), 'ln-korean');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-ln-ko2ja-14b'), 'ln-ko2ja');
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('translategemma-4b'), false);
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('translategemma-4-sub-e4b'), false);
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('hunyuan-mt-chimera-7b-abliterated'), false);
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('hy-mt2-7b'), true);
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('sakura-ln-korean-7b'), false);
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('sakura-ln-ko2ja-14b'), false);
        assert.deepStrictEqual(sakuraCatalog.resolveMtPair('sakura-ln-korean-7b'), { source: 'ko', target: 'zh' });
        assert.deepStrictEqual(sakuraCatalog.resolveMtPair('sakura-ln-ko2ja-14b'), { source: 'ko', target: 'ja' });
        assert.deepStrictEqual(sakuraCatalog.resolveMtPair('sakura-1.5b'), { source: 'ja', target: 'zh' });
        assert.strictEqual(sakuraCatalog.mtModelSupportsPair('sakura-ln-korean-7b', 'ko', 'zh'), true);
        assert.strictEqual(sakuraCatalog.mtModelSupportsPair('sakura-ln-korean-7b', 'ja', 'zh'), false);
        assert.strictEqual(sakuraCatalog.mtModelSupportsPair('sakura-ln-ko2ja-14b', 'ko', 'ja'), true);
        assert.strictEqual(sakuraCatalog.mtModelSupportsPair('sakura-7b', 'ko', 'zh'), false);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('sakura-14b').paramBillion, 14);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('sakura-galtransl-14b').paramBillion, 14);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('sakura-8b-qwen3').paramBillion, 8);
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-14b-q4km').fileName,
            'sakura-14b-qwen2.5-v1.0-q4km.gguf',
        );
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-galtransl-14b-q4km').fileName,
            'Sakura-Galtransl-14B-v3.8-Q4_K_M.gguf',
        );
        assert.strictEqual(sakuraCatalog.DEFAULT_MODEL_ID, 'sakura-1.5b');
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-1.5b'));
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-galtransl-7b'));
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-galtransl-7b-q6k'));
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-galtransl-v4-4b'));
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-galtransl-14b'));
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-14b-qwen3'));
        assert.ok(!sakuraCatalog.isSakuraMtModel('opus-mt-ja-zh'));
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-7b'), 'sakura');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-14b'), 'sakura');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-galtransl-7b'), 'galtransl');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-galtransl-7b-q6k'), 'galtransl');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-galtransl-v4-4b'), 'galtransl');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('sakura-galtransl-14b-q6k'), 'galtransl');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hy-mt2-7b'), 'hymt');
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('hy-mt2-1.8b'), 'hymt');
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('hunyuan-mt-chimera-7b-abliterated'),
            'Hunyuan MT 翻译',
        );
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('translategemma-4-sub-e4b'),
            'TG Sub 翻译',
        );
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('hy-mt2-7b', { engineExternalMt: true }),
            '分块',
        );
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('hy-mt2-7b'),
            'Hy-MT2 翻译',
        );
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('sakura-galtransl-7b'),
            'GalTransl 翻译',
        );
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('sakura-1.5b'),
            '推理翻译',
        );
        assert.strictEqual(
            sakuraCatalog.mtDoneSummaryLabel('hy-mt2-7b', { engineExternalMt: true }),
            '句级已译',
        );
        assert.strictEqual(sakuraCatalog.findCatalogEntry('hy-mt2-7b').fileName, 'Hy-MT2-7B-Q4_K_M.gguf');
        assert.strictEqual(sakuraCatalog.findCatalogEntry('hy-mt2-1.8b').fileName, 'Hy-MT2-1.8B-Q4_K_M.gguf');
        assert.strictEqual(sakuraCatalog.findCatalogEntry('hy-mt2-7b').contextSize, 8192);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('hy-mt2-1.8b').contextSize, 8192);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('sakura-galtransl-v4-4b').fileName, 'Galtransl-v4-4B-2601.gguf');
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-galtransl-14b').fileName,
            'Sakura-Galtransl-14B-v3.8-IQ4_XS.gguf',
        );
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-14b').fileName,
            'sakura-14b-qwen2.5-v1.0-iq4xs.gguf',
        );
        assert.strictEqual(sakuraCatalog.findCatalogEntry('transub-ja-1.5b-q4km'), null);
        assert.strictEqual(sakuraCatalog.findCatalogEntry('transub-ja-1.5b-f16'), null);
        assert.ok(!sakuraCatalog.isSakuraMtModel('transub-ja-1.5b-q4km'));
        assert.ok(sakuraCatalog.isRetiredTransubJaModelId('transub-ja-1.5b-q4km'));
        assert.strictEqual(sakuraCatalog.remapRetiredMtModelId('transub-ja-1.5b-f16'), 'sakura-1.5b');
    });

    it('resolves engine HTTP batch size by model size', () => {
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ smartTranslate: true }), 40);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ mode: 'smart' }), 40);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'sakura-1.5b' }), 32);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'hy-mt2-1.8b' }), 32);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'sakura-galtransl-v4-4b' }), 24);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'sakura-7b' }), 16);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'hy-mt2-7b' }), 16);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'sakura-14b' }), 8);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ modelId: 'sakura-galtransl-14b' }), 8);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({ paramBillion: 14 }), 8);
        assert.strictEqual(sakuraCatalog.resolveLlmMtEngineBatchSize({}), 16);
    });

    it('does not assign speculative draft ids to GalTransl MT models', () => {
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-galtransl-7b-q6k')?.draftModelId,
            undefined,
        );
        assert.strictEqual(
            sakuraCatalog.findCatalogEntry('sakura-galtransl-v4-4b')?.draftModelId,
            undefined,
        );
    });

    it('resolves translate mode like settings (Opus/engine → llm)', () => {
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({ smartTranslate: true }), 'smart');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'sakura-1.5b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'opus-mt-ja-zh',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'qwen-mt-7b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: '',
            engineOpusMtModel: '',
            engineLlmMtModel: 'sakura-1.5b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({}), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            translateMode: 'llm',
            smartTranslate: false,
            engineMtModel: '',
            engineLlmMtModel: 'sakura-1.5b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            translateMode: 'engine',
            smartTranslate: false,
            engineMtModel: 'sakura-1.5b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            translateMode: 'sakura',
            engineMtModel: '',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('sakura'), 'llm');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('engine'), 'llm');
        assert.strictEqual(sakuraCatalog.translateModeLabel('llm'), '推理翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('external'), '外部翻译');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('byok'), 'external');
        assert.strictEqual(sakuraCatalog.translateModeLabel('sakura'), '推理翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('engine'), '推理翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('smart'), '混合翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('hybrid'), '混合翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('dialog'), '智能翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('smart', { short: true }), '混合');
        assert.strictEqual(sakuraCatalog.translateModeLabel('dialog', { short: true }), '智能');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('hybrid'), 'smart');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('dialog'), 'dialog');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('chat'), 'dialog');
        assert.ok(sakuraCatalog.isProTranslateMode('dialog'));
        assert.ok(sakuraCatalog.isProTranslateMode('smart'));
        assert.ok(!sakuraCatalog.isProTranslateMode('llm'));
    });

    it('does not treat ASR / VAD ids as LLM inference MT (qwen3-asr etc.)', () => {
        assert.ok(sakuraCatalog.isLlmInferenceMtModel('qwen25-7b'));
        assert.ok(sakuraCatalog.isLlmInferenceMtModel('qwen3-8b'));
        assert.ok(sakuraCatalog.isLlmInferenceMtModel('sakura-1.5b'));
        assert.ok(sakuraCatalog.isLlmInferenceMtModel('hy-mt2-7b'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('qwen3-asr-0.6b'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('qwen3-asr-1.7b-ja'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('qwen3-forced-aligner-0.6b'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('whisper-large-v3'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('sensevoice-small'));
        assert.ok(!sakuraCatalog.isLlmInferenceMtModel('fsmn-vad'));
        assert.ok(sakuraCatalog.isNonTranslateEngineModelId('qwen3-asr-0.6b'));
        assert.ok(!sakuraCatalog.isNonTranslateEngineModelId('qwen25-7b'));
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'qwen3-asr-0.6b',
        }), 'llm');
    });
});

describe('sakura-translate-core', () => {
    it('formats cue ordinal ranges for progress logs', () => {
        assert.strictEqual(
            sakuraCore.formatCueOrdinalRange([{ index: 0 }, { index: 7 }], { oneBasedDisplay: true }),
            '第 1–8 条',
        );
        assert.strictEqual(
            sakuraCore.formatCueOrdinalRange([{ index: 8 }, { index: 15 }], { oneBasedDisplay: true }),
            '第 9–16 条',
        );
        assert.strictEqual(
            sakuraCore.formatCueOrdinalRange([{ index: 41 }], { oneBasedDisplay: true }),
            '第 42 条',
        );
        assert.strictEqual(
            sakuraCore.formatCueOrdinalRange([{ index: 1 }, { index: 3 }]),
            '第 1–3 条',
        );
        assert.strictEqual(
            sakuraCore.formatCueOrdinalRange([{ index: 0 }, { index: 2 }]),
            '第 1–3 条',
        );
        assert.strictEqual(sakuraCore.formatCueOrdinalRange([]), '');
    });

    it('collects literal blanks without invent-as-blank heuristics', () => {
        const src = [
            { index: 0, text: '妻とのセックスレスに悩んでいる男性です' },
            { index: 1, text: 'ほとんどなくなることがわかっています。' },
            { index: 2, text: '今日は医学的に正直に話します' },
        ];
        const zh = [
            { index: 0, text: '正为和妻子的性生活不和谐而烦恼着' },
            { index: 1, text: '…' },
            { index: 2, text: '' },
        ];
        const lit = sakuraCore.collectLiteralBlankTranslationIndexes(src, zh);
        assert.deepStrictEqual(lit.sort((a, b) => a - b), [1, 2]);
        // Full invent-as-blank path may also flag cue 0; literal must not.
        assert.ok(!lit.includes(0));
        assert.strictEqual(sakuraCore.isLiteralBlankTranslation('…'), true);
        assert.strictEqual(sakuraCore.isLiteralBlankTranslation('正为和妻子的性生活不和谐而烦恼着'), false);
    });

    it('flags GalTransl neighbor paraphrase bleed inside a window', () => {
        const src = [
            { index: 0, text: '今日は医学的に正直に話します' },
            { index: 1, text: '今隣に座っているのは' },
            { index: 2, text: '妻とのセックスレスに悩んでいる男性です' },
        ];
        const zhBleed = [
            { index: 0, text: '今天就从医学角度坦白吧' },
            { index: 1, text: '今天就从医学角度实话实说吧' },
            { index: 2, text: '我是正为性生活不和谐而烦恼的男性' },
        ];
        const bad = sakuraCore.assessNeighborParaphraseBleed(src, zhBleed);
        assert.ok(bad.suspicious, JSON.stringify(bad));
        const zhOk = [
            { index: 0, text: '今天我要坦白说出医学上的事实' },
            { index: 1, text: '现在坐在我旁边的人' },
            { index: 2, text: '是一个正为和妻子性生活不和谐而烦恼的男性' },
        ];
        const ok = sakuraCore.assessNeighborParaphraseBleed(src, zhOk);
        assert.ok(!ok.suspicious, JSON.stringify(ok));
    });

    it('builds Sakura-style chat messages', () => {
        const msgs = sakuraCore.buildChatMessages([
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'ありがとう' },
        ]);
        assert.strictEqual(msgs[0].role, 'system');
        assert.ok(msgs[0].content.includes('日译中') || msgs[0].content.includes('字幕翻译'));
        assert.ok(msgs[0].content.includes('禁止臆造') || msgs[0].content.includes('人名'));
        assert.ok(!msgs[0].content.includes('严禁净化'));
        assert.ok(msgs[1].content.includes('将下面的日文文本翻译成中文'));
        assert.ok(msgs[1].content.includes('共 2 行'));
        assert.ok(msgs[1].content.includes('こんにちは'));
    });

    it('injects translate style into Sakura system and user prompts', () => {
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            { translateStyleEnabled: true, translateStylePreset: 'news_narration' },
        );
        assert.ok(msgs[0].content.includes('强制译文风格') || msgs[0].content.includes('旁白'));
        assert.ok(msgs[1].content.includes('强制译文风格') || msgs[1].content.includes('旁白'));
    });

    it('uses GalTransl system prompt family for galtransl model id', () => {
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            { modelId: 'sakura-galtransl-7b' },
        );
        assert.ok(msgs[0].content.includes('视觉小说'));
        assert.ok(msgs[0].content.includes('使役态') || msgs[0].content.includes('被动态'));
        assert.ok(msgs[0].content.includes('换行'));
        assert.ok(msgs[1].content.includes('根据以下术语表（可以为空）'));
        assert.ok(
            msgs[1].content.includes('将下面的日文文本根据对应关系和备注翻译成中文：こんにちは'),
            msgs[1].content,
        );
        assert.ok(!msgs[1].content.includes('共 1 行'));
        assert.ok(!msgs[1].content.includes('只输出译文，每行对应原文一行'));
        assert.ok(!msgs[1].content.includes('碎句与拟声'));

        const nsfw = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'だめぇっ' }],
            { modelId: 'sakura-galtransl-7b', sakuraNsfwPrompt: true },
        );
        assert.ok(nsfw[0].content.includes('视觉小说'));
        assert.ok(nsfw[0].content.includes('使役态') || nsfw[0].content.includes('被动态'));
        assert.ok(!nsfw[0].content.includes('严禁净化'));
        assert.ok(
            nsfw[1].content.includes('将下面的日文文本根据对应关系和备注翻译成中文：だめぇっ'),
            nsfw[1].content,
        );
        assert.ok(!nsfw[1].content.includes('碎句'));
        assert.strictEqual(sakuraCore.resolvePromptFamily({ modelId: 'sakura-galtransl-7b' }), 'galtransl');
        assert.strictEqual(
            sakuraCore.resolveSystemPrompt({ modelId: 'sakura-galtransl-7b', sakuraNsfwPrompt: true }),
            sakuraCore.GALTRANSL_SYSTEM_PROMPT,
        );
        assert.ok(
            sakuraCore.resolveSystemPrompt({
                modelId: 'sakura-galtransl-7b-q6k',
                _ellipsisQuickDirect: true,
            }).includes('禁止只输出省略号'),
        );
        const galLight = sakuraCore.resolveLightMtFinalizeSanitizeOpts({
            modelId: 'sakura-galtransl-7b-q6k',
        });
        assert.strictEqual(galLight.unstickInventWipe, false);
        assert.strictEqual(galLight.unstickCrossCueZh, true);
        assert.strictEqual(galLight.dropUselessEllipsis, false);
        assert.strictEqual(galLight.skipDialogueContentShiftRepair, true);
        assert.deepStrictEqual(
            sakuraCore.resolveLightMtFinalizeSanitizeOpts({ modelId: 'sakura-7b' }),
            {},
        );
    });

    it('builds LN-Korean and LN-ko2ja official prompt shapes', () => {
        const koZh = sakuraCore.buildChatMessages(
            [{ index: 0, text: '안녕하세요' }],
            { modelId: 'sakura-ln-korean-7b' },
        );
        assert.strictEqual(sakuraCore.resolvePromptFamily({ modelId: 'sakura-ln-korean-7b' }), 'ln-korean');
        assert.ok(koZh[0].content.includes('韩文翻译成简体中文'));
        assert.ok(koZh[1].content.startsWith('翻译成中文：\n'));
        assert.ok(koZh[1].content.includes('안녕하세요'));

        const koJa = sakuraCore.buildChatMessages(
            [{ index: 0, text: '안녕하세요' }],
            { modelId: 'sakura-ln-ko2ja-14b' },
        );
        assert.strictEqual(sakuraCore.resolvePromptFamily({ modelId: 'sakura-ln-ko2ja-14b' }), 'ln-ko2ja');
        assert.ok(koJa[1].content.startsWith('日本語に訳してください\n'));
        assert.ok(koJa[1].content.includes('안녕하세요'));
        assert.strictEqual(
            sakuraCore.shouldUseNsfwPrompt({ modelId: 'sakura-ln-korean-7b', sakuraNsfwPrompt: true }),
            false,
        );
    });

    it('keeps GalTransl user template when style / glossary are on', () => {
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: '頑張ります' }],
            {
                modelId: 'sakura-galtransl-7b-q6k',
                translateStyleEnabled: true,
                translateStylePreset: 'natural_spoken',
                glossaryTerms: [{ term: '祐佳', translation: '祐佳' }, { term: 'マッチポイント', translation: '赛点' }],
            },
        );
        const user = msgs[1].content;
        assert.ok(!msgs[0].content.includes('强制译文风格'), msgs[0].content);
        assert.ok(!user.includes('强制译文风格'), user);
        assert.ok(user.includes('マッチポイント->赛点'), user);
        assert.ok(!user.includes('祐佳->祐佳'), user);
        assert.ok(user.endsWith('翻译成中文：頑張ります'), user);
    });

    it('omits identity glossary lines that train 译名表 echoes', () => {
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'メンズエステへようこそ' }],
            {
                sakuraNsfwPrompt: true,
                glossaryTerms: [
                    { term: '按摩油', translation: '按摩油' },
                    { term: 'メンズエステ', translation: '男士按摩店' },
                    { term: '按摩', dst: '' },
                ],
            },
        );
        const user = msgs[1].content;
        assert.ok(user.includes('メンズエステ->男士按摩店'), user);
        assert.ok(!user.includes('按摩油->按摩油'), user);
        assert.ok(!/按摩->按摩(?:\s|$)/.test(user), user);
    });

    it('prepends cast names without putting identity pairs in the term table', () => {
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: '真琴、待って' }],
            {
                glossaryTerms: [{ term: '真琴', translation: '真琴' }],
                castNames: ['真琴', '香水纯'],
            },
        );
        const user = msgs[1].content;
        assert.ok(user.includes('出场人物'));
        assert.ok(user.includes('真琴'));
        assert.ok(user.includes('香水纯'));
        assert.ok(!user.includes('真琴->真琴'), user);
    });

    it('uses NSFW system prompt for AV / explicit flag', () => {
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({}), false);
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({ sakuraNsfwPrompt: true }), true);
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({ sakuraNsfwPrompt: false, contentProfile: 'av_soft' }), false);
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({ contentProfile: 'av_soft' }), true);
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({ presetId: 'ja-av-soft-translate' }), true);
        assert.strictEqual(sakuraCore.shouldUseNsfwPrompt({ faithfulTone: true }), true);

        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'だめぇっ' }],
            { sakuraNsfwPrompt: true },
        );
        assert.ok(msgs[0].content.includes('严禁净化') || msgs[0].content.includes('拟声'));
        assert.ok(msgs[0].content.includes('禁止臆造'));
        assert.ok(msgs[0].content.includes('叠词循环'));
        assert.ok(!msgs[0].content.includes('雌小鬼'));
        assert.ok(msgs[1].content.includes('碎句') || msgs[1].content.includes('拟声'));
    });

    it('estimates max tokens to bound runaway generation', () => {
        const small = sakuraCore.estimateMaxTokens([{ index: 0, text: 'あ' }]);
        const mid = sakuraCore.estimateMaxTokens([
            { index: 0, text: 'これは長い日本語の字幕テキストです。'.repeat(3) },
            { index: 1, text: 'もう一行もそれなりに長い内容になっています。' },
        ]);
        const softWin = sakuraCore.estimateMaxTokens(
            Array.from({ length: 8 }, (_, i) => ({
                index: i,
                text: 'これはやや長めの日本語字幕でトークン予算を確保したい。',
            })),
        );
        assert.ok(small >= 64);
        assert.ok(mid > small);
        assert.ok(mid <= 1024);
        assert.ok(softWin >= 512, `soft window should get more than 512, got ${softWin}`);
        assert.ok(softWin <= 1024);
    });

    it('drops surplus leading /no_think before truncate (prevents whole-window shift)', () => {
        const parsed = sakuraCore.parseLineAlignedOutput('/no_think\nHello\nThanks', [
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, 'Hello');
        assert.strictEqual(parsed.cues[1].text, 'Thanks');
    });

    it('blanks in-window /no_think without shifting neighbors when counts match', () => {
        const parsed = sakuraCore.parseLineAlignedOutput('Hello\n/no_think\nThanks', [
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'あい' },
            { index: 2, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, 'Hello');
        assert.strictEqual(parsed.cues[1].text, '');
        assert.strictEqual(parsed.cues[2].text, 'Thanks');
    });

    it('aligns line output to cue indexes', () => {
        const parsed = sakuraCore.parseLineAlignedOutput('你好\n谢谢', [
            { index: 10, text: 'こんにちは' },
            { index: 11, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].index, 10);
        assert.strictEqual(parsed.cues[0].text, '你好');
        assert.strictEqual(parsed.cues[1].text, '谢谢');
    });

    it('blanks leading NSFW system-prompt echo without shifting later lines', () => {
        const leak = '我是日译中字幕翻译。按汉化组习惯忠实传达语气，含成人向内容。严禁净化、和谐或委婉改写性相关与粗俗用语；术语表有的';
        const parsed = sakuraCore.parseLineAlignedOutput(`${leak}\n你好\n谢谢`, [
            { index: 0, text: 'あ' },
            { index: 1, text: 'こんにちは' },
            { index: 2, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '');
        assert.strictEqual(parsed.cues[1].text, '你好');
        assert.strictEqual(parsed.cues[2].text, '谢谢');
        assert.ok(sakuraCore.isBlankOrPunctTranslation(parsed.cues[0].text)
            || sakuraCore.collectBlankTranslationIndexes(
                [{ index: 0, text: 'あ' }],
                [{ index: 0, text: leak }],
            ).includes(0));
    });

    it('drops surplus leading prompt echo before truncate', () => {
        const leak = '你是日译中字幕翻译。按汉化组习惯忠实传达语气。严禁净化。';
        const parsed = sakuraCore.parseLineAlignedOutput(`${leak}\n你好\n谢谢`, [
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '你好');
        assert.strictEqual(parsed.cues[1].text, '谢谢');
    });

    it('blanks Sakura lineRule prompt echo (FTHTD-193) without shifting dialogue', () => {
        const leak1 = '原文仅为纯语气/拟声（如单独/）时可译为';
        const leak2 = '对应短语气词 对白有完整语';
        assert.ok(sanitize.looksLikePromptLeak(leak1));
        assert.ok(sanitize.looksLikePromptLeak(leak2));
        const parsed = sakuraCore.parseLineAlignedOutput(
            `你好\n${leak1}\n${leak2}\n谢谢`,
            [
                { index: 0, text: 'a' },
                { index: 1, text: 'b' },
                { index: 2, text: 'c' },
                { index: 3, text: 'd' },
            ],
        );
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '你好');
        assert.strictEqual(parsed.cues[1].text, '');
        assert.strictEqual(parsed.cues[2].text, '');
        assert.strictEqual(parsed.cues[3].text, '谢谢');
    });

    it('drops undetected-then-detected lineRule surplus before head truncate', () => {
        const leak = '原文仅为纯语气/拟声（如单独うん/はぁ）时可译为对应短语气词';
        const parsed = sakuraCore.parseLineAlignedOutput(`${leak}\n你好\n谢谢`, [
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '你好');
        assert.strictEqual(parsed.cues[1].text, '谢谢');
    });

    it('truncates surplus lines instead of merging into last cue', () => {
        const loop = Array.from({ length: 20 }, () => '笑我').join('\n');
        const parsed = sakuraCore.parseLineAlignedOutput(`正常\n${loop}`, [
            { index: 0, text: 'a' },
            { index: 1, text: 'b' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues.length, 2);
        assert.strictEqual(parsed.cues[0].text, '正常');
        assert.strictEqual(parsed.cues[1].text, '笑我');
        assert.ok(!parsed.cues[1].text.includes('笑我笑我'));
    });

    it('pads missing lines', () => {
        const parsed = sakuraCore.parseLineAlignedOutput('只有一行', [
            { index: 0, text: 'a' },
            { index: 1, text: 'b' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues.length, 2);
        assert.strictEqual(parsed.cues[0].text, '只有一行');
        assert.strictEqual(parsed.cues[1].text, '');
        assert.strictEqual(parsed.lineCountMismatch, true);
        assert.strictEqual(parsed.gotLineCount, 1);
        assert.strictEqual(parsed.expectedLineCount, 2);
    });

    it('flags mid-window line deficit as lineCountMismatch (not silent realign)', () => {
        // Model skipped cue 1 → 3 lines for 4 cues. Positional pad would mis-attach L2/L3.
        const parsed = sakuraCore.parseLineAlignedOutput('第一行\n第三行\n第四行', [
            { index: 0, text: 'いち' },
            { index: 1, text: 'に' },
            { index: 2, text: 'さん' },
            { index: 3, text: 'よん' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.lineCountMismatch, true);
        assert.strictEqual(parsed.gotLineCount, 3);
        assert.strictEqual(parsed.expectedLineCount, 4);
        // Pad keeps indexes stable for blank collect; caller must re-MT on mismatch.
        assert.strictEqual(parsed.cues[0].text, '第一行');
        assert.strictEqual(parsed.cues[3].text, '');
    });

    it('assessPositionalAlignQuality detects silent +1 mis-attach with digit anchors', () => {
        const src = [
            { index: 0, text: '感度は三千倍' },
            { index: 1, text: '全身が' },
            { index: 2, text: '痛みすら 快楽になる' },
            { index: 3, text: 'どうだい?' },
        ];
        // Digit anchor 三千倍 landed on ZH[1] instead of ZH[0] → +1 scramble.
        const scrambled = [
            { index: 0, text: '全身都' },
            { index: 1, text: '灵敏度为三千倍' },
            { index: 2, text: '连疼痛都会变成快乐' },
            { index: 3, text: '怎么样？' },
        ];
        const q = sakuraCore.assessPositionalAlignQuality(src, scrambled);
        assert.ok(q.suspicious, JSON.stringify(q));
        assert.ok(/offset/.test(String(q.reason || '')), q.reason);
        const ok = sakuraCore.assessPositionalAlignQuality(src, [
            { index: 0, text: '灵敏度为三千倍' },
            { index: 1, text: '全身都' },
            { index: 2, text: '连疼痛都会变成快乐' },
            { index: 3, text: '怎么样？' },
        ]);
        assert.strictEqual(ok.suspicious, false, JSON.stringify(ok));
    });

    it('assessPositionalAlignQuality flags short reactive JA glued to next long ZH', () => {
        const src = [
            { index: 6, text: 'どう?' },
            { index: 7, text: 'ちょっとセクシーな感じにしてみて' },
            { index: 8, text: 'セクシーってかちょっと見えてる?' },
            { index: 9, text: 'あら 大丈夫かな?' },
        ];
        const shifted = [
            { index: 6, text: '稍微打扮得性感一点' },
            { index: 7, text: '性感吗？还是有点儿露出来？' },
            { index: 8, text: '啊 这样合适吗？' },
            { index: 9, text: '应该没问题吧' },
        ];
        const q = sakuraCore.assessPositionalAlignQuality(src, shifted);
        assert.ok(q.suspicious, JSON.stringify(q));
        assert.ok(
            q.reason === 'reactive_long_zh_misfit'
            || /offset_.*semantic/.test(String(q.reason || '')),
            JSON.stringify(q),
        );
    });

    it('collectMisalignedCueIndexes flags filming invent and shifted windows', () => {
        const src = [
            { index: 0, text: 'ちゃんと撮れてるかな?' },
            { index: 1, text: '今日は会社の後輩の翔くんとお出かけします' },
            { index: 2, text: 'どう?' },
            { index: 3, text: 'ちょっとセクシーな感じにしてみて' },
            { index: 4, text: 'セクシーってかちょっと見えてる?' },
            { index: 5, text: 'あら 大丈夫かな?' },
        ];
        const zh = [
            { index: 0, text: '拍得好吗？' },
            { index: 1, text: '拍得好吗？' },
            { index: 2, text: '稍微打扮得性感一点' },
            { index: 3, text: '性感吗？还是有点儿露出来？' },
            { index: 4, text: '啊 这样合适吗？' },
            { index: 5, text: '应该没问题吧' },
        ];
        const bad = sakuraCore.collectMisalignedCueIndexes(src, zh, { windowSize: 4 });
        assert.ok(bad.includes(1), JSON.stringify(bad));
        assert.ok(bad.includes(2) || bad.includes(3), JSON.stringify(bad));
    });

    it('collectMisalignedCueIndexes flags FNS-style opening semantic scramble', () => {
        const src = [
            { index: 0, text: '字幕は Transub Pro で生成されました [ www.transub.cc ]\nちゃんと撮れてるかな?' },
            { index: 1, text: '桜 ふふふ' },
            { index: 2, text: '今日は会社の後輩の翔くんとお出かけします' },
            { index: 3, text: '翔くんとは会社のこう上司部下っていう関係なんやけど' },
            { index: 4, text: 'ちょっと最近翔くんのこと気になってんねんなー' },
            { index: 5, text: 'というわけで今日は翔くんのことちょっといっぱい知りたいなと思ってデートに 行ってきます' },
            { index: 6, text: 'どう?' },
            { index: 7, text: 'ちょっとセクシーな感じにしてみて' },
        ];
        const zh = [
            { index: 0, text: '字幕由 Transub Pro 生成 [ www.transub.cc ]\n樱 呵呵' },
            { index: 1, text: '樱 哈哈' },
            { index: 2, text: '最近有点在意他呢' },
            { index: 3, text: '翔君就是公司里的那种上司和下属的关系啦' },
            { index: 4, text: '稍微打扮得性感点' },
            { index: 5, text: '性感吗？ 还是有点儿露出来？' },
            { index: 6, text: '啊 这样合适吗？' },
            { index: 7, text: '感觉很好' },
        ];
        const bad = sakuraCore.collectMisalignedCueIndexes(src, zh, { windowSize: 8 });
        assert.ok(bad.includes(0), JSON.stringify(bad));
        assert.ok(bad.includes(2), JSON.stringify(bad));
        assert.ok(bad.includes(4), JSON.stringify(bad));
        assert.ok(bad.includes(5), JSON.stringify(bad));
        assert.ok(bad.includes(7), JSON.stringify(bad));
        assert.ok(!bad.includes(3), JSON.stringify(bad));
        const q = sakuraCore.assessPositionalAlignQuality(src, zh);
        assert.ok(q.suspicious, JSON.stringify(q));
    });

    it('collectMisalignedCueIndexes does not mass-blank a healthy lecture window', () => {
        const src = [
            { index: 0, text: 'ホルモンの話をします' },
            { index: 1, text: 'テストステロンが関係しています' },
            { index: 2, text: 'どう?' },
            { index: 3, text: 'わかりましたか' },
            { index: 4, text: 'では続けます' },
            { index: 5, text: 'データがあります' },
        ];
        const zh = [
            { index: 0, text: '来说说激素的事' },
            { index: 1, text: '和睾酮有关' },
            { index: 2, text: '怎么样？' },
            { index: 3, text: '明白了吗' },
            { index: 4, text: '那我们继续' },
            { index: 5, text: '有数据' },
        ];
        const bad = sakuraCore.collectMisalignedCueIndexes(src, zh, { windowSize: 8 });
        assert.deepStrictEqual(bad, []);
    });

    it('exact line count is not a mismatch', () => {
        const parsed = sakuraCore.parseLineAlignedOutput('你好\n谢谢', [
            { index: 10, text: 'こんにちは' },
            { index: 11, text: 'ありがとう' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.lineCountMismatch, false);
        assert.strictEqual(parsed.gotLineCount, 2);
    });

    it('treats punctuation-only translations as blank', () => {
        assert.ok(sakuraCore.isBlankOrPunctTranslation('。'));
        assert.ok(sakuraCore.isBlankOrPunctTranslation('…'));
        assert.ok(sakuraCore.isBlankOrPunctTranslation('  '));
        assert.ok(!sakuraCore.isBlankOrPunctTranslation('你好'));
        const blank = sakuraCore.collectBlankTranslationIndexes(
            [
                { index: 0, text: 'よろしく' },
                { index: 1, text: 'こんにちは' },
            ],
            [
                { index: 0, text: '。' },
                { index: 1, text: '你好' },
            ],
        );
        assert.deepStrictEqual(blank, [0]);
    });

    it('treats filler-only soft omissions as blank for retry', () => {
        assert.ok(sakuraCore.isBlankOrPunctTranslation('嗯，', 'うんちょっと結構緊張しちゃって'));
        assert.ok(sakuraCore.isBlankOrPunctTranslation('请', 'そうするならあってください。'));
        const blank = sakuraCore.collectBlankTranslationIndexes(
            [
                { index: 0, text: 'うんちょっと結構緊張しちゃって' },
                { index: 1, text: 'あんまり集中できなかったです。' },
            ],
            [
                { index: 0, text: '嗯，' },
                { index: 1, text: '集中不了' },
            ],
        );
        assert.deepStrictEqual(blank, [0]);
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'テスト' }],
            { sakuraNsfwPrompt: true },
        );
        assert.ok(msgs[1].content.includes('禁止只输出语气词'));
    });

    it('collects blank translation indexes for non-empty sources', () => {
        const blank = sakuraCore.collectBlankTranslationIndexes(
            [
                { index: 0, text: 'こんにちは' },
                { index: 1, text: 'ありがとう' },
                { index: 2, text: '' },
                { index: 3, text: 'また' },
            ],
            [
                { index: 0, text: '你好' },
                { index: 1, text: '   ' },
                { index: 2, text: '' },
                // index 3 missing → blank
            ],
        );
        assert.deepStrictEqual(blank, [1, 3]);
    });

    it('collects leftover ellipsis cues for final quick-direct fill', () => {
        const src = [
            { index: 0, text: 'こんにちは' },
            { index: 1, text: 'ありがとう' },
            { index: 2, text: 'また' },
        ];
        const zh = [
            { index: 0, text: '你好' },
            { index: 1, text: '…' },
            { index: 2, text: '' },
        ];
        const todo = sakuraCore.collectCuesForEllipsisQuickDirect(src, zh);
        assert.deepStrictEqual(todo.map((c) => c.index), [1, 2]);
        const capped = sakuraCore.collectCuesForEllipsisQuickDirect(src, zh, { maxCount: 1 });
        assert.deepStrictEqual(capped.map((c) => c.index), [1]);
    });
});

describe('engine-options sakura mapping', () => {
    it('keeps translate_mt/dual when sakura MT is selected (external adapter)', () => {
        assert.strictEqual(
            mapTaskToEngineTask('translate', { sakuraMt: true }),
            'translate_mt',
        );
        assert.strictEqual(
            mapTaskToEngineTask('dual', { sakuraMt: true }),
            'dual',
        );
        assert.strictEqual(
            mapTaskToEngineTask('translate', { sakuraMt: false }),
            'translate_mt',
        );
    });
});

describe('sakura-translate TDP D01 preprocess', () => {
    it('applies JA ASR domain fixes before Sakura inference', () => {
        // Avoid loading full Electron sakura-translate (llama bridges); exercise the same helper surface.
        const { preprocessCuesForSakura } = require('../electron/sakura-translate');
        const opaque = require('../src/js/mt-opaque-strings');
        const out = preprocessCuesForSakura([
            { index: 0, text: opaque.d('44GE44Gj44CB44GE44GC44Gh44KF44GE') },
            { index: 1, text: 'キれいだよ、ミカ…' },
        ]);
        assert.ok(out[0].text.includes(opaque.d('44Kk44OD44Gh44KD44GG')));
        assert.ok(out[1].text.includes('綺麗'));
    });
});
