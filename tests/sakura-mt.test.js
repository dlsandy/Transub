const assert = require('assert');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const sakuraCore = require('../src/js/sakura-translate-core');
const { mapTaskToEngineTask } = require('../electron/engine-options');

describe('sakura-mt-catalog-core', () => {
    it('lists 1.5b default and 7b only (≤7B)', () => {
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-1.5b'));
        assert.ok(sakuraCatalog.findCatalogEntry('sakura-7b'));
        assert.ok(!sakuraCatalog.findCatalogEntry('sakura-14b'));
        assert.ok(!sakuraCatalog.findCatalogEntry('sakura-14b-q4km'));
        assert.strictEqual(sakuraCatalog.DEFAULT_MODEL_ID, 'sakura-1.5b');
        assert.ok(sakuraCatalog.isSakuraMtModel('sakura-1.5b'));
        assert.ok(!sakuraCatalog.isSakuraMtModel('opus-mt-ja-zh'));
        assert.ok(sakuraCatalog.listCatalog().every((e) => !/14b/i.test(e.id)));
    });

    it('resolves translate mode like settings (empty MT = Opus auto, not LLM)', () => {
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({ smartTranslate: true }), 'smart');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'sakura-1.5b',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'opus-mt-ja-zh',
        }), 'engine');
        // Future non-Sakura LLM MT should still be 推理翻译
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: 'qwen-mt-7b',
        }), 'llm');
        // Auto Opus: empty active MT must NOT fall back to LLM/Sakura
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            smartTranslate: false,
            engineMtModel: '',
            engineOpusMtModel: '',
            engineLlmMtModel: 'sakura-1.5b',
        }), 'engine');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({}), 'engine');
        // Explicit translateMode wins over engineMtModel inference (settings save/load)
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
        }), 'engine');
        assert.strictEqual(sakuraCatalog.resolveTranslateModeFromOptions({
            translateMode: 'sakura',
            engineMtModel: '',
        }), 'llm');
        assert.strictEqual(sakuraCatalog.normalizeTranslateMode('sakura'), 'llm');
        assert.strictEqual(sakuraCatalog.translateModeLabel('llm'), '推理翻译');
        assert.strictEqual(sakuraCatalog.translateModeLabel('sakura'), '推理翻译');
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
        assert.ok(small >= 48);
        assert.ok(mid > small);
        assert.ok(mid <= 512);
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
