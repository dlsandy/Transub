const assert = require('assert');
const core = require('../src/js/smart-translate-hybrid-core');

describe('smart-translate-hybrid-core', () => {
    it('defaults hybrid option on unless explicitly false', () => {
        assert.strictEqual(core.normalizeHybridMtOption(undefined), true);
        assert.strictEqual(core.normalizeHybridMtOption(null), true);
        assert.strictEqual(core.normalizeHybridMtOption(''), true);
        assert.strictEqual(core.normalizeHybridMtOption(true), true);
        assert.strictEqual(core.normalizeHybridMtOption(false), false);
        assert.strictEqual(core.normalizeHybridMtOption('false'), false);
        assert.strictEqual(core.normalizeHybridMtOption('off'), false);
    });

    it('detects Japanese from language or kana cues', () => {
        assert.strictEqual(core.isJapaneseSource('ja', []), true);
        assert.strictEqual(core.isJapaneseSource('ja-JP', []), true);
        assert.strictEqual(core.isJapaneseSource('en', [{ text: 'こんにちは' }]), false);
        assert.strictEqual(core.isJapaneseSource('auto', [{ text: 'Hello there' }]), false);
        assert.strictEqual(core.isJapaneseSource('auto', [{ text: '今日はいい天気ですね。' }]), true);
        assert.strictEqual(core.isJapaneseSource('', [{ text: 'おはよう' }]), true);
    });

    it('picks preferred installed translate-only model, else GalTransl/Sakura order', () => {
        assert.strictEqual(core.pickHybridMtModelId({
            preferredId: 'sakura-1.5b',
            installedIds: ['sakura-galtransl-7b', 'sakura-1.5b'],
        }), 'sakura-1.5b');
        assert.strictEqual(core.pickHybridMtModelId({
            preferredId: 'qwen25-7b',
            installedIds: ['sakura-1.5b', 'sakura-galtransl-7b'],
        }), 'sakura-galtransl-7b');
        assert.strictEqual(core.pickHybridMtModelId({
            preferredId: '',
            installedIds: ['sakura-1.5b', 'sakura-7b'],
        }), 'sakura-7b');
        assert.strictEqual(core.pickHybridMtModelId({
            preferredId: 'sakura-7b',
            installedIds: ['qwen25-7b'],
        }), '');
    });

    it('gates hybrid on option, JA source, and translate-only model', () => {
        const ja = [{ text: 'ありがとう' }];
        assert.strictEqual(core.shouldUseHybridChunkMt({
            enabled: true, language: 'ja', cues: ja, modelId: 'sakura-7b',
        }).ok, true);
        assert.strictEqual(core.shouldUseHybridChunkMt({
            enabled: false, language: 'ja', cues: ja, modelId: 'sakura-7b',
        }).reason, 'disabled');
        assert.strictEqual(core.shouldUseHybridChunkMt({
            enabled: true, language: 'ja', cues: ja, modelId: '',
        }).reason, 'no_model');
        assert.strictEqual(core.shouldUseHybridChunkMt({
            enabled: true, language: 'en', cues: [{ text: 'Hello' }], modelId: 'sakura-7b',
        }).reason, 'not_ja');
        assert.strictEqual(core.shouldUseHybridChunkMt({
            enabled: true, language: 'ja', cues: ja, modelId: 'qwen25-7b',
        }).reason, 'not_translate_only');
    });

    it('builds glossary object from brief-style terms', () => {
        const g = core.glossaryObjectFromTerms([
            { term: '香水さん', translation: '香水纯' },
            { src: '真琴', dst: '真琴', note: '人名' },
            { term: '香水さん', translation: 'dup' },
        ]);
        assert.strictEqual(g.entries.length, 2);
        assert.strictEqual(g.entries[0].term, '香水さん');
        assert.strictEqual(g.entries[0].translation, '香水纯');
        assert.strictEqual(g.entries[1].term, '真琴');
    });

    it('extracts cast names including identity pairs skipped by term table', () => {
        const names = core.extractCastNames([
            { term: '香水さん', translation: '香水纯' },
            { term: '真琴', translation: '真琴' },
            { term: '内村', translation: '内村' },
        ]);
        assert.ok(names.includes('香水纯'));
        assert.ok(names.includes('真琴'));
        assert.ok(names.includes('内村'));
        assert.ok(!names.includes('香水さん'));
    });

    it('releases local chat LLM only when hybrid chunk MT will run', () => {
        const ja = [{ text: 'ありがとう' }];
        assert.strictEqual(core.looksLikeLocalLlamaBaseUrl('http://127.0.0.1:8766/v1'), true);
        assert.strictEqual(core.looksLikeLocalLlamaBaseUrl('https://api.openai.com/v1'), false);
        assert.strictEqual(core.shouldReleaseChatLlmForHybridChunk({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-7b',
            baseUrl: 'http://127.0.0.1:8080',
        }), true);
        assert.strictEqual(core.shouldReleaseChatLlmForHybridChunk({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-7b',
            baseUrl: 'https://api.openai.com/v1',
        }), false);
        assert.strictEqual(core.shouldReleaseChatLlmForHybridChunk({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-7b',
            baseUrl: '',
        }), false);
        assert.strictEqual(core.shouldReleaseChatLlmForHybridChunk({
            enabled: true,
            language: 'en',
            cues: [{ text: 'Hello' }],
            modelId: 'sakura-7b',
            baseUrl: 'http://127.0.0.1:8080',
        }), false);
    });

    it('skips local LLM film brief for hybrid, keeps cloud BYOK brief', () => {
        const ja = [{ text: 'ありがとう' }];
        const base = {
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-7b',
        };
        assert.strictEqual(core.shouldSkipLlmFilmBrief(base), true);
        assert.strictEqual(core.shouldSkipLlmFilmBrief({
            ...base,
            llmSource: 'managed',
        }), true);
        assert.strictEqual(core.shouldSkipLlmFilmBrief({
            ...base,
            llmSource: 'byok',
            hasByokKey: true,
        }), false);
        assert.strictEqual(core.shouldSkipLlmFilmBrief({
            ...base,
            llmSource: 'byok',
            hasByokKey: false,
        }), true);
        assert.strictEqual(core.shouldSkipLlmFilmBrief({
            ...base,
            filmBrief: { characters: [{ name: '真琴' }] },
        }), false);
        assert.strictEqual(core.shouldSkipLlmFilmBrief({
            enabled: true,
            language: 'en',
            cues: [{ text: 'Hello' }],
            modelId: 'sakura-7b',
        }), false);
    });
});
