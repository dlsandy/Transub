const assert = require('assert');
const post = require('../electron/engine-batch-postprocess-plan');
const autofix = require('../src/js/post-batch-autofix-plan-core');
const retrans = require('../src/js/retranslate-plan-core');
const infer = require('../src/js/infer-stage-progress-core');
const ready = require('../src/js/start-readiness-core');

describe('final-round cores', () => {
    it('engine postprocess plan', () => {
        assert.strictEqual(post.isTranslateLikeTask('dual', 'transcribe'), true);
        const paths = post.collectUniqueZhSubtitlePaths({
            sourceSubtitlePath: 'D:/a.src.srt',
            targetSubtitlePath: 'D:/a.srt',
            subtitlePath: 'D:/a.srt',
        }, {
            resolve: (p) => p.replace(/\\/g, '/'),
            existsSync: () => true,
        });
        assert.deepStrictEqual(paths, ['D:/a.srt']);
        const flags = post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'off',
        });
        assert.strictEqual(flags.dropDiscourse, true);
        assert.strictEqual(flags.dropOnomatopoeia, false);
        assert.strictEqual(post.resolveInterjectionDropFlags({}).shouldCompact, false);
        assert.strictEqual(post.resolveInterjectionDropFlags({
            postBatchCompactPureInterjections: true,
        }).shouldCompact, true);
    });

    it('av_soft / 番号 still honor clear settings', () => {
        const flags = post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'clear',
            contentProfile: 'av_soft',
            strongAv: true,
            sakuraNsfwPrompt: true,
            mediaPath: 'E:/迅雷下载/FNS-247.mp4',
            language: 'ja',
        });
        assert.strictEqual(flags.dropDiscourse, true);
        assert.strictEqual(flags.dropOnomatopoeia, true);
        assert.strictEqual(flags.shouldCompact, true);
        assert.strictEqual(flags.softAvSkipped, false);
        assert.strictEqual(post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'off',
            contentProfile: 'av_soft',
        }).shouldCompact, true);
        assert.strictEqual(post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'clear',
            translateMode: 'smart',
            engineLlmMtModel: 'hy-mt2-7b-q4_k_m',
        }).shouldCompact, true);
    });

    it('post-batch autofix flags', () => {
        const flags = autofix.planPostBatchAutofixFlags({
            savedOpts: {
                task: 'translate',
                postBatchCpsSplit: true,
                postBatchRemoveNoise: false,
                postBatchCompressRepetition: true,
                postBatchViewingPunctMode: 'clear',
                postBatchInterjectionMode: 'off',
                postBatchOnomatopoeiaMode: 'light',
            },
            normalizeViewingCleanMode: (v, fb) => v || fb,
            isTranslateLikeTask: (t) => t === 'translate' || t === 'dual',
        });
        assert.strictEqual(flags.doNoise, false);
        assert.strictEqual(flags.doSpacePunct, true);
        assert.strictEqual(flags.doSoftenOnomatopoeia, true);
        assert.ok(autofix.buildPostBatchAutofixLabelParts(flags).includes('观影清除标点'));
    });

    it('retranslate plan helpers', () => {
        assert.strictEqual(retrans.primarySubFormatFromList('vtt,srt'), 'vtt');
        const dest = retrans.resolveRetranslateDestPath(
            { path: 'D:/v/a.mp4' },
            'D:/k/a.src.srt',
            {
                resolveOutputDir: () => 'D:/out',
                pathDirname: (p) => p.replace(/[/\\][^/\\]+$/, ''),
                pathJoin: (...xs) => xs.join('/'),
                stemNoExt: (p) => p.split(/[/\\]/).pop().replace(/\.[^.]+$/, ''),
                normPath: (p) => p.toLowerCase(),
                subFormats: 'srt',
            },
        );
        assert.strictEqual(dest, 'D:/out/a.zh-cn.srt');
        const pct = retrans.computeRetranslateOverallPct({ index: 0, itemPct: 50, total: 2 });
        assert.strictEqual(pct.displayOverall, 25);
        assert.strictEqual(
            retrans.isSmartTranslateCapableModel({ id: 'x', family: 'sakura' }),
            false,
        );
        assert.strictEqual(
            retrans.isSmartTranslateCapableModel({ id: 'sakura-7b', translateOnly: true }),
            false,
        );
        assert.ok(
            retrans.formatSmartTranslateModelLabel({ id: 'sakura-7b', name: 'Sakura 7B', translateOnly: true })
                .includes('不支持简要/润色'),
        );
        assert.strictEqual(
            retrans.formatSmartTranslateModelLabel({ id: 'qwen25-7b', name: 'Qwen2.5 7B' }),
            'Qwen2.5 7B',
        );
        const filtered = retrans.filterSmartTranslateCatalog([
            { id: 'sakura-7b', name: 'Sakura 7B', installed: true, translateOnly: true },
            { id: 'qwen25-7b', name: 'Qwen2.5 7B', installed: true },
            { id: 'missing', name: 'X', installed: false },
        ]);
        assert.deepStrictEqual(filtered.map((x) => x.id), ['qwen25-7b']);
        assert.strictEqual(
            retrans.isSmartTranslateCapableModel({ id: 'hy-mt2-7b', family: 'hymt' }),
            false,
        );
        assert.strictEqual(
            retrans.isSmartTranslateCapableModel(
                { id: 'galtransl-v3-7b' },
                { isTranslateOnlyModel: (id) => String(id).includes('galtransl') },
            ),
            false,
        );
        const smartUi = retrans.buildRetranslateSmartUiState({ hybridOn: true, polishOn: true });
        assert.match(smartUi.modelHint, /润色模型/);
        assert.strictEqual(smartUi.showHybridMt, true);
        assert.strictEqual(smartUi.showDialogModel, true);
        assert.strictEqual(smartUi.requireDialogModel, false);
        assert.match(smartUi.dialogLabel, /润色/);
        const lineOnly = retrans.buildRetranslateSmartUiState({ hybridOn: false, polishOn: false });
        assert.strictEqual(lineOnly.showHybridMt, false);
        assert.strictEqual(lineOnly.requireDialogModel, true);
        const hybridOnly = retrans.buildRetranslateSmartUiState({ hybridOn: true, polishOn: false });
        assert.strictEqual(hybridOnly.showDialogModel, false);
        assert.strictEqual(hybridOnly.showHybridMt, true);

        const src = [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: '今日は' },
            { index: 3, text: 'さよなら' },
        ];
        const merged = retrans.mergeRetranslateCues(
            src,
            [
                { index: 1, text: '你好' },
                { index: 3, text: '再见' },
            ],
            { translatedIndexes: [1, 2, 3] },
        );
        assert.deepStrictEqual(merged.map((c) => c.text), ['你好', '…', '再见']);

        const mangled = retrans.mergeRetranslateCues(
            src,
            [
                { index: 0, text: '你好' },
                { index: 1, text: '今天' },
                { index: 2, text: '再见' },
            ],
        );
        assert.deepStrictEqual(mangled.map((c) => c.text), ['你好', '今天', '再见']);

        // Credit head: never positional-zip 0-based rows onto 1-based source (would clear watermark).
        const withCredit = [
            { index: 1, startMs: 0, endMs: 2000, text: '字幕は Transub Pro で生成されました [ www.transub.cc ]' },
            { index: 2, startMs: 100000, endMs: 102000, text: 'ただいまー' },
            { index: 3, startMs: 103000, endMs: 105000, text: 'あ かなめくん' },
        ];
        const parted = retrans.partitionRetranslatePayload(withCredit, { isPro: true, lang: 'zh' });
        assert.strictEqual(parted.skipped, 1);
        assert.strictEqual(parted.mtCues.length, 2);
        const restored = retrans.mergeRetranslateCues(
            withCredit,
            [
                { index: 2, text: '我回来了。' },
                { index: 3, text: '啊，奏君。' },
            ],
            {
                translatedIndexes: parted.mtCues.map((c) => c.index),
                restoreByIndex: parted.restoreByIndex,
            },
        );
        assert.ok(/字幕由\s*Transub\s*Pro/.test(restored[0].text), restored[0].text);
        assert.ok(/回来了/.test(restored[1].text), restored[1].text);
        assert.ok(/奏君/.test(restored[2].text), restored[2].text);

        // Dialogue-only MT renumbered to 0..n-1 after peel → order-zip onto non-credit slots
        // (index merge would collide restore key 1 and shift ZH by +2).
        const zeroBased = retrans.mergeRetranslateCues(
            withCredit,
            [
                { index: 0, text: '我回来了。' },
                { index: 1, text: '啊，奏君。' },
            ],
            {
                translatedIndexes: parted.mtCues.map((c) => c.index),
                restoreByIndex: parted.restoreByIndex,
            },
        );
        assert.ok(/字幕由\s*Transub\s*Pro/.test(zeroBased[0].text), zeroBased[0].text);
        assert.ok(/回来了/.test(zeroBased[1].text), zeroBased[1].text);
        assert.ok(/奏君/.test(zeroBased[2].text), zeroBased[2].text);

        // Head+tail credit peel + dense 0-based dialogue payload (JUFE-625 shape)
        const withHeadTail = [
            { index: 1, startMs: 0, endMs: 2000, text: '字幕は Transub Pro で生成されました [ www.transub.cc ]' },
            { index: 2, startMs: 100000, endMs: 102000, text: 'ただいまー' },
            { index: 3, startMs: 103000, endMs: 105000, text: 'あ かなめくん' },
            { index: 4, startMs: 106000, endMs: 108000, text: 'あ 沙羅さん' },
            { index: 5, startMs: 9000000, endMs: 9002000, text: '字幕は Transub Pro で生成されました [ www.transub.cc ]' },
        ];
        const parted2 = retrans.partitionRetranslatePayload(withHeadTail, { isPro: true, lang: 'zh' });
        assert.strictEqual(parted2.skipped, 2);
        assert.strictEqual(parted2.mtCues.length, 3);
        const zeroHeadTail = retrans.mergeRetranslateCues(
            withHeadTail,
            [
                { index: 0, text: '我回来了。' },
                { index: 1, text: '啊，奏君。' },
                { index: 2, text: '啊，沙罗小姐。' },
            ],
            {
                translatedIndexes: parted2.mtCues.map((c) => c.index),
                restoreByIndex: parted2.restoreByIndex,
            },
        );
        assert.ok(/字幕由\s*Transub\s*Pro/.test(zeroHeadTail[0].text), zeroHeadTail[0].text);
        assert.ok(/回来了/.test(zeroHeadTail[1].text), zeroHeadTail[1].text);
        assert.ok(/奏君/.test(zeroHeadTail[2].text), zeroHeadTail[2].text);
        assert.ok(/沙罗/.test(zeroHeadTail[3].text), zeroHeadTail[3].text);
        assert.ok(/字幕由\s*Transub\s*Pro/.test(zeroHeadTail[4].text), zeroHeadTail[4].text);

        // Invented dialogue on credit slot + shifted rows → auto repair
        const shifted = retrans.mergeRetranslateCues(
            withCredit,
            [
                { index: 1, text: '我回来了。' },
                { index: 2, text: '啊，奏君。' },
                { index: 3, text: '啊，沙罗小姐。' },
            ],
            { translatedIndexes: [1, 2, 3] },
        );
        assert.ok(/字幕由\s*Transub\s*Pro/.test(shifted[0].text), shifted[0].text);
        assert.ok(/回来了/.test(shifted[1].text), shifted[1].text);

        // Source lost credit after re-ASR; dest still has watermark → augment restore map
        const sourceNoCredit = [
            { index: 1, startMs: 100000, endMs: 102000, text: 'ただいまー' },
            { index: 2, startMs: 103000, endMs: 105000, text: 'あ かなめくん' },
        ];
        const destWithCredit = [
            { index: 1, startMs: 0, endMs: 2000, text: '字幕由 Transub Pro 生成 [ www.transub.cc ]' },
            { index: 2, startMs: 100000, endMs: 102000, text: '我回来了。' },
            { index: 3, startMs: 103000, endMs: 105000, text: '啊，奏君。' },
        ];
        const augmented = retrans.augmentCreditRestoreMap(sourceNoCredit, destWithCredit, new Map(), {
            isPro: true,
            lang: 'zh',
        });
        assert.strictEqual(augmented.size, 0);
        const ensured = retrans.ensureRetranslateSoftwareCredit(sourceNoCredit, { isPro: true, lang: 'zh' });
        assert.ok(ensured.changed);
        assert.ok(/字幕由\s*Transub\s*Pro/.test(ensured.cues[0].text));
    });

    it('infer progress payload + params chip', () => {
        const next = infer.applyVideoProgressPayload(
            { itemStage: 'starting', videoProgress: 0 },
            { phase: 'running', itemStage: 'transcribe', itemProgress: 40, videoTotalSec: 100, videoCurrentSec: 40 },
        );
        assert.ok(next.videoProgress >= 40 || next.videoProgress > 0);
        const recovered = infer.applyVideoProgressPayload(
            { itemStage: 'save', videoProgress: 97 },
            { phase: 'running', itemStage: 'translate', itemProgress: 65, itemDetail: '翻译 0/100' },
        );
        assert.ok(recovered.videoProgress <= 70, `got ${recovered.videoProgress}`);
        assert.ok(recovered.videoProgress >= 65, `got ${recovered.videoProgress}`);
        const chip = ready.buildParamsModeChipViewModel({
            mtUseForm: true,
            translateTask: true,
        });
        assert.strictEqual(chip.label, '设置');
        assert.ok(chip.title.includes('设置'));
        const manualAsr = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
            presetId: '',
            asrModelLabel: 'SenseVoice Small',
            asrModelId: 'sensevoice-small',
        });
        assert.strictEqual(manualAsr.label, 'SenseVoice …');
        assert.ok(manualAsr.title.includes('手动 ASR'));
        assert.ok(manualAsr.title.includes('SenseVoice Small'));
        const presetStillWins = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
            presetId: 'ja-av',
            presetName: '日语软声',
            asrModelLabel: 'whisper-large-v3-turbo',
        });
        assert.strictEqual(presetStillWins.label, '日语软声');
    });
});
