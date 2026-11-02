const assert = require('assert');
const index = require('../src/js/index-translate-core');
const sakuraCore = require('../src/js/sakura-translate-core');

describe('index-translate-core', () => {
    it('detects Index-Translate model ids', () => {
        assert.strictEqual(index.isIndexTranslateModel('index-translate-9b'), true);
        assert.strictEqual(index.isIndexTranslateModel('index-translate-35b-a3b-mini'), true);
        assert.strictEqual(index.isIndexTranslateModel('IndexTeam/Index-Translate-2B'), true);
        assert.strictEqual(index.isIndexTranslateModel('index'), true);
        assert.strictEqual(index.isIndexTranslateModel('hy-mt2-7b'), false);
        assert.strictEqual(index.isIndexTranslateModel('translategemma-4b'), false);
    });

    it('builds official Chinese instruction prompt', () => {
        const msgs = index.buildIndexChatMessages(
            [{ index: 0, text: 'こんにちは' }],
            { subtitleTargetLang: 'zh-Hans', language: 'ja' },
        );
        assert.strictEqual(msgs.length, 1);
        assert.strictEqual(msgs[0].role, 'user');
        const content = msgs[0].content;
        assert.match(content, /请将以下日语文本翻译为简体中文/);
        assert.match(content, /直接输出翻译结果，不要进行任何解释/);
        assert.match(content, /こんにちは/);
        assert.doesNotMatch(content, /你是一个/);
    });

    it('uses English target label in Chinese', () => {
        const content = index.buildIndexUserContent(
            [{ index: 0, text: '你好' }],
            { subtitleTargetLang: 'en', language: 'zh' },
        );
        assert.match(content, /翻译为英语/);
    });

    it('asks to preserve newlines for multi-line windows', () => {
        const content = index.buildIndexUserContent(
            [
                { index: 0, text: '一行目' },
                { index: 1, text: '二行目' },
            ],
            { subtitleTargetLang: 'zh-Hans' },
        );
        assert.match(content, /保留等量换行/);
        assert.match(content, /一行目\n二行目/);
    });

    it('resolves greedy inference knobs', () => {
        const inf = index.resolveIndexInferenceOptions({});
        assert.strictEqual(inf.temperature, 0);
        assert.strictEqual(inf.enableThinking, false);
        assert.strictEqual(inf.llamaJinja, true);
        assert.strictEqual(inf.windowLines, 1);
    });

    it('strips instruction echo leaks', () => {
        const leaked = '请将以下文本翻译为简体中文，直接输出翻译结果，不要进行任何解释。\n你好';
        assert.strictEqual(index.looksLikeIndexPromptLeak(leaked), true);
        const cleaned = index.stripIndexLeak(leaked);
        assert.doesNotMatch(cleaned, /请将以下/);
        assert.match(cleaned, /你好/);
        const shortNudge = index.stripIndexLeak('短句也须译出语义或语气；禁止仅用省略号代替译文。\n嗨');
        assert.doesNotMatch(shortNudge, /短句也须译/);
        assert.match(shortNudge, /嗨/);
    });

    it('nudges single short cues not to collapse to ellipsis', () => {
        const content = index.buildIndexUserContent(
            [{ index: 0, text: 'やっほー' }],
            { subtitleTargetLang: 'zh-Hans' },
        );
        assert.match(content, /短句也须译出语义或语气/);
    });

    it('is wired through sakura-translate-core prompt family', () => {
        assert.strictEqual(
            sakuraCore.resolvePromptFamily({ modelId: 'index-translate-2b' }),
            'index',
        );
        const msgs = sakuraCore.buildChatMessages(
            [{ index: 0, text: 'hello' }],
            { modelId: 'index-translate-2b', subtitleTargetLang: 'zh-Hans', language: 'en' },
        );
        assert.match(msgs[0].content, /请将以下英语文本翻译为简体中文/);
    });
});
