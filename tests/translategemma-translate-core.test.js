'use strict';

const assert = require('assert');
const tg = require('../src/js/translategemma-translate-core');
const sakuraCore = require('../src/js/sakura-translate-core');
const route = require('../src/js/mt-target-route-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');

describe('translategemma-translate-core', () => {
    it('detects TranslateGemma model ids', () => {
        assert.ok(tg.isTranslateGemmaModel('translategemma-4b'));
        assert.ok(tg.isTranslateGemmaModel('translategemma-12b'));
        assert.ok(tg.isTranslateGemmaModel('translategemma'));
        assert.ok(tg.isTranslateGemmaSubModel('translategemma-4-sub-e4b'));
        assert.ok(tg.isTranslateGemmaModel('translategemma-4-sub-e4b'));
        assert.strictEqual(tg.isTranslateGemmaOfficialModel('translategemma-4-sub-e4b'), false);
        assert.ok(tg.isTranslateGemmaOfficialModel('translategemma-4b'));
        assert.strictEqual(tg.isTranslateGemmaModel('gemma3-4b'), false);
        assert.strictEqual(tg.isTranslateGemmaModel('hy-mt2-7b'), false);
    });

    it('builds Translate Gemma 4 Sub subtitle prompts', () => {
        const msgs = tg.buildTranslateGemmaSubChatMessages(
            [{ index: 0, text: 'Yeah, well... I changed my mind.' }],
            {
                modelId: 'translategemma-4-sub-e4b',
                language: 'en',
                subtitleTargetLang: 'zh-Hans',
                previousSourceText: 'I thought you said you weren\'t coming.',
                previousTranslationText: '我以为你说你不来了。',
            },
        );
        assert.strictEqual(msgs.length, 2);
        assert.strictEqual(msgs[0].role, 'system');
        assert.ok(/TASK: Translate English subtitles into Chinese/i.test(msgs[0].content));
        assert.ok(/CURRENT_SOURCE/i.test(msgs[1].content));
        assert.ok(/PREVIOUS_SOURCE/i.test(msgs[1].content));
        assert.ok(msgs[1].content.includes('Yeah, well... I changed my mind.'));
        assert.ok(/TranslateGemma Sub profile|preserve meaning/i.test(msgs[0].content));
        assert.strictEqual(
            tg.resolveTranslateGemmaInferenceOptions({ modelId: 'translategemma-4-sub-e4b' }).temperature,
            0,
        );
        assert.strictEqual(
            tg.resolveTranslateGemmaInferenceOptions({ modelId: 'translategemma-4-sub-e4b' }).preferSerialChunks,
            true,
        );
    });

    it('normalizes source/target language codes', () => {
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('ja', 'source'), 'ja');
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('jp', 'source'), 'ja');
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('simplified', 'target'), 'zh-Hans');
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('traditional-tw', 'target'), 'zh-Hant');
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('en', 'target'), 'en');
        assert.strictEqual(tg.normalizeTranslateGemmaLangCode('ko', 'target'), 'ko');
    });

    it('builds structured JSON user content for chat API', () => {
        const msgs = tg.buildTranslateGemmaChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            { language: 'ja', subtitleTargetLang: 'zh-Hans', tgSystemAddon: false },
        );
        assert.strictEqual(msgs.length, 1);
        assert.strictEqual(msgs[0].role, 'user');
        const payload = JSON.parse(msgs[0].content);
        assert.strictEqual(payload.type, 'text');
        assert.strictEqual(payload.source_lang_code, 'ja');
        assert.strictEqual(payload.target_lang_code, 'zh-Hans');
        assert.strictEqual(payload.text, 'こんにちは');
    });

    it('builds natural prompt with two blank lines before text', () => {
        const content = tg.buildNaturalUserContent('Hello', 'en', 'es');
        assert.ok(content.includes('professional English (en) to Spanish (es)'));
        assert.ok(/\n\nHello\n/.test(content) || content.includes('\n\nHello'));
    });

    it('strips JSON wrapper / stop tails from model output', () => {
        assert.strictEqual(
            tg.stripTranslateGemmaLeak('{"type":"text","source_lang_code":"ja","target_lang_code":"zh-Hans","text":"你好"}'),
            '你好',
        );
        assert.strictEqual(tg.stripTranslateGemmaLeak('你好"}'), '你好');
        assert.ok(tg.looksLikeTranslateGemmaPromptLeak(
            'You are a professional Japanese (ja) to Chinese (zh-Hans) translator.',
        ));
    });

    it('wires through sakura-translate-core prompt family', () => {
        assert.strictEqual(
            sakuraCore.resolvePromptFamily({ modelId: 'translategemma-4b' }),
            'translategemma',
        );
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'テスト' }],
            {
                modelId: 'translategemma-4b',
                language: 'ja',
                subtitleTargetLang: 'en',
                tgSystemAddon: false,
            },
        );
        const payload = JSON.parse(msgs[0].content);
        assert.strictEqual(payload.target_lang_code, 'en');
        assert.strictEqual(payload.text, 'テスト');
    });

    it('allows TranslateGemma for non-ZH targets (unlike Sakura)', () => {
        assert.strictEqual(sakuraCatalog.resolvePromptFamily('translategemma-4b'), 'translategemma');
        assert.strictEqual(sakuraCatalog.isJaZhOnlyMtModel('translategemma-4b'), false);
        assert.strictEqual(route.isSakuraOrGalMtId('translategemma-4b'), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('translategemma-4b', {
            subtitleTargetLang: 'en',
            language: 'ja',
        }), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-1.5b', {
            subtitleTargetLang: 'en',
            language: 'ja',
        }), false);
        assert.strictEqual(
            sakuraCatalog.mtChunkProgressLabel('translategemma-12b'),
            'TranslateGemma 翻译',
        );
    });

    it('exposes inference defaults', () => {
        const opts = tg.resolveTranslateGemmaInferenceOptions({
            language: 'ja',
            subtitleTargetLang: 'ko',
            modelId: 'translategemma-12b',
        });
        assert.strictEqual(opts.llamaJinja, true);
        assert.strictEqual(opts.windowLines, 1);
        assert.strictEqual(opts.temperature, 0.25);
        assert.strictEqual(opts.top_p, 0.9);
        assert.strictEqual(opts.repetition_penalty, 1.06);
        assert.strictEqual(opts.sourceLangCode, 'ja');
        assert.strictEqual(opts.targetLangCode, 'ko');
        assert.ok(Array.isArray(opts.stop) && opts.stop.includes('<end_of_turn>'));
    });

    it('applies official 4B profile sampling and natural prompt addon', () => {
        const opts = tg.resolveTranslateGemmaInferenceOptions({ modelId: 'translategemma-4b' });
        assert.strictEqual(opts.temperature, 0.2);
        assert.strictEqual(opts.top_p, 0.85);
        assert.strictEqual(opts.repetition_penalty, 1.08);
        const content = tg.buildNaturalUserContent('Hello', 'en', 'zh-Hans', {
            modelId: 'translategemma-4b',
        });
        assert.ok(/TranslateGemma profile|preserve meaning/i.test(content));
    });

    it('builds previous context from cues for Sub', () => {
        const sourceCues = [
            { index: 0, text: 'First line.' },
            { index: 1, text: 'Second line.' },
        ];
        const map = new Map([[0, '第一行。']]);
        const withBoth = tg.buildPreviousContextFromCues({
            sourceCues,
            translatedByIndex: map,
            currentChunkCues: [{ index: 1, text: 'Second line.' }],
        });
        assert.strictEqual(withBoth.previousSourceText, 'First line.');
        assert.strictEqual(withBoth.previousTranslationText, '第一行。');
        const sourceOnly = tg.buildPreviousContextFromCues({
            sourceCues,
            translatedByIndex: new Map(),
            currentChunkCues: [{ index: 1, text: 'Second line.' }],
        });
        assert.strictEqual(sourceOnly.previousSourceText, 'First line.');
        assert.strictEqual(sourceOnly.previousTranslationText, undefined);
        const none = tg.buildPreviousContextFromCues({
            sourceCues,
            translatedByIndex: map,
            currentChunkCues: [{ index: 0, text: 'First line.' }],
        });
        assert.deepStrictEqual(none, {});
    });

    it('omits previous translation for fragile short CURRENT cues', () => {
        const sourceCues = [
            { index: 0, text: 'お、祐佳です' },
            { index: 1, text: 'ちゅくちゅく' },
            { index: 2, text: '頑張ります' },
        ];
        const map = new Map([[0, '啊，我是祐佳'], [1, '啾咕啾咕']]);
        assert.ok(tg.isFragileShortSource('ちゅくちゅく'));
        assert.ok(tg.isFragileShortSource('あは'));
        assert.ok(tg.isFragileShortSource('頑張ります'));
        assert.strictEqual(tg.isFragileShortSource('今までがいろいろな衣装に着替えて自由にポーズをとる感じでした'), false);
        const fragile = tg.buildPreviousContextFromCues({
            sourceCues,
            translatedByIndex: map,
            currentChunkCues: [{ index: 1, text: 'ちゅくちゅく' }],
        });
        assert.strictEqual(fragile.previousSourceText, 'お、祐佳です');
        assert.strictEqual(fragile.previousTranslationText, undefined);
        const effort = tg.buildPreviousContextFromCues({
            sourceCues,
            translatedByIndex: map,
            currentChunkCues: [{ index: 2, text: '頑張ります' }],
        });
        assert.ok(effort.previousSourceText);
        assert.strictEqual(effort.previousTranslationText, undefined);
    });

    it('detects meta leaks and identity echo; blanks echo in sakura parse', () => {
        assert.ok(tg.looksLikeTranslateGemmaMetaLeak('我来帮你翻译这条字幕'));
        assert.ok(tg.looksLikeTranslateGemmaPromptLeak('我来帮你翻译这条字幕'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('頑張ります', '我叫祐佳'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('ちゅくちゅく', '祐佳 我是'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho(
            '今までがいろいろな衣装に着替えて自由にポーズをとる感じでした',
            '祐佳 我是你',
        ));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho(
            'えへへ…ははは…はっ…',
            '祐佳 我是你的好朋友',
        ));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('いきまーす', '你好 祐佳'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho(
            '頑張ります',
            '祐佳 我是你们的翻译',
        ));
        // Huihui name-card spam on non-intro JA
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('いきまーす', '哦 佑佳'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('やばい、やばい', '我 佑佳'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('ちゅくちゅく', '哦 佑佳'));
        assert.strictEqual(tg.looksLikeTranslateGemmaIdentityEcho('ああ、大丈夫', '哦 好的'), false);
        // Real self-intro: keep clean 我是X / casual 哦 佑佳; reject 你-addressing / translator stubs
        assert.ok(tg.isJaSelfIntroSource('お、祐佳です'));
        assert.strictEqual(tg.isJaSelfIntroSource('感じでした'), false);
        assert.strictEqual(
            tg.looksLikeTranslateGemmaIdentityEcho('お、祐佳です', '我是祐佳'),
            false,
        );
        assert.strictEqual(
            tg.looksLikeTranslateGemmaIdentityEcho('お、祐佳です', '哦 佑佳'),
            false,
        );
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('お、祐佳です', '祐佳 我是你'));
        assert.ok(tg.looksLikeTranslateGemmaIdentityEcho('お、祐佳です', '祐佳 我是你们的翻译'));
        assert.ok(tg.looksLikeTranslateGemmaInventedPlot('映像で着れて', '考试'));
        assert.strictEqual(
            tg.looksLikeTranslateGemmaInventedPlot('試験がある', '有考试'),
            false,
        );
        const parsed = sakuraCore.parseLineAlignedOutput('我叫祐佳', [{ index: 0, text: '頑張ります' }]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '');
        assert.strictEqual(
            tg.finalizeTranslateGemmaCue('人知れず勝ちました!', '…'),
            '',
        );
        assert.strictEqual(
            tg.finalizeTranslateGemmaCue('お、祐佳です', '祐佳 我是你'),
            '',
        );
        assert.strictEqual(
            tg.finalizeTranslateGemmaCue('いきまーす', '你好 祐佳'),
            '',
        );
        assert.strictEqual(
            tg.finalizeTranslateGemmaCue('映像で着れて', '考试'),
            '',
        );
        assert.strictEqual(
            tg.finalizeTranslateGemmaCue('あ今日は初めてのその着る衣装がたくさんあって…', '今天第一次穿那么多衣服去'),
            '今天第一次穿那么多衣服去……',
        );
        const delivery = tg.finalizeTranslateGemmaCueList(
            [
                { index: 0, text: 'お、祐佳です' },
                { index: 1, text: 'いきまーす' },
                { index: 2, text: 'あ今日は…' },
            ],
            [
                { index: 0, text: '祐佳 我是你' },
                { index: 1, text: '你好 祐佳' },
                { index: 2, text: '今天啊' },
            ],
        );
        assert.strictEqual(delivery[0].text, '');
        assert.strictEqual(delivery[1].text, '');
        assert.strictEqual(delivery[2].text, '今天啊……');
    });

    it('rejects lexical JA collapsed to bare ellipsis and restores trailing ……', () => {
        assert.ok(tg.looksLikeTranslateGemmaEllipsisCollapse('と、3本目になります', '…'));
        assert.ok(tg.looksLikeTranslateGemmaEllipsisCollapse('人知れず勝ちました!', '……'));
        assert.ok(tg.looksLikeTranslateGemmaEllipsisCollapse('待つポイントだ', '...'));
        assert.ok(tg.looksLikeTranslateGemmaEllipsisCollapse('今日ね…', '…'));
        assert.ok(tg.looksLikeTranslateGemmaEllipsisCollapse('だ、ダメですよ…', '…'));
        assert.strictEqual(tg.looksLikeTranslateGemmaEllipsisCollapse('あは', '…'), false);
        assert.strictEqual(
            tg.preserveTrailingEllipsis('あ今日は初めてのその着る衣装がたくさんあって…', '今天第一次穿那么多衣服去'),
            '今天第一次穿那么多衣服去……',
        );
        assert.strictEqual(
            tg.preserveTrailingEllipsis('とてもお楽しみにしてます。', '我非常期待'),
            '我非常期待',
        );
        assert.strictEqual(
            tg.preserveTrailingEllipsis('あ今日は…', '今天啊…'),
            '今天啊……',
        );
        const collapsed = sakuraCore.parseLineAlignedOutput('…', [{ index: 0, text: 'と、3本目になります' }]);
        assert.strictEqual(collapsed.cues[0].text, '');
        const trail = sakuraCore.parseLineAlignedOutput(
            '今天第一次穿那么多衣服去',
            [{ index: 0, text: 'あ今日は初めてのその着る衣装がたくさんあって…' }],
        );
        assert.strictEqual(trail.cues[0].text, '今天第一次穿那么多衣服去……');
    });

    it('detects safety refusals and blanks them in sakura parse', () => {
        const refuse = '对不起 我不能处理包含敏感内容的请求 如果你有其他问题或需要帮助 请告诉我';
        assert.ok(tg.looksLikeTranslateGemmaSafetyRefusal(refuse));
        assert.ok(tg.looksLikeTranslateGemmaPromptLeak(refuse));
        const parsed = sakuraCore.parseLineAlignedOutput(refuse, [
            { index: 0, text: 'お世話…なっちゃった…俺が…し' },
        ]);
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.cues[0].text, '');
    });

    it('adds official system addon beside structured JSON', () => {
        const msgs = tg.buildTranslateGemmaChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            {
                modelId: 'translategemma-4b',
                language: 'ja',
                subtitleTargetLang: 'zh-Hans',
            },
        );
        assert.strictEqual(msgs.length, 2);
        assert.strictEqual(msgs[0].role, 'system');
        assert.ok(/TranslateGemma profile|self-ID/i.test(msgs[0].content));
        const payload = JSON.parse(msgs[1].content);
        assert.strictEqual(payload.text, 'こんにちは');
    });
});
