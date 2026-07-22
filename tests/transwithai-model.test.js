const assert = require('assert');
const modelCore = require('../src/js/transwithai-model-core');
const { normalizeTransWithAiRuntimeOptions } = require('../electron/transwithai-bridge');

describe('transwithai-model-core', () => {
    const items = [
        { id: 'ja', path: 'models/whisper-ja-1.5B-ct2', label: 'ja', kind: 'transcribe', ready: true },
        { id: 'tr', path: 'models/ChickenRice-translate', label: 'tr', kind: 'translate', ready: true },
        { id: 'bad', path: 'models/broken', label: 'bad', kind: 'transcribe', ready: false },
    ];

    it('resolves pass model by task with legacy fallback', () => {
        assert.strictEqual(
            modelCore.resolvePassModelPath({
                transcribeModelPath: 'models/a',
                translateModelPath: 'models/b',
            }, 'transcribe'),
            'models/a',
        );
        assert.strictEqual(
            modelCore.resolvePassModelPath({
                transcribeModelPath: 'models/a',
                translateModelPath: 'models/b',
            }, 'translate'),
            'models/b',
        );
        assert.strictEqual(
            modelCore.resolvePassModelPath({ modelPath: 'models/legacy' }, 'transcribe'),
            'models/legacy',
        );
    });

    it('suggests and fills models from list', () => {
        const suggested = modelCore.suggestModelsFromList(items);
        assert.strictEqual(suggested.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(suggested.translateModelPath, 'models/ChickenRice-translate');

        const filled = modelCore.fillMissingModelPaths({}, items);
        assert.strictEqual(filled.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(filled.translateModelPath, 'models/ChickenRice-translate');
    });

    it('auto-swaps crossed transcribe/translate selections', () => {
        const fixed = modelCore.fillMissingModelPaths({
            transcribeModelPath: 'models/ChickenRice-translate',
            translateModelPath: 'models/whisper-ja-1.5B-ct2',
        }, items);
        assert.strictEqual(fixed.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(fixed.translateModelPath, 'models/ChickenRice-translate');
    });

    it('auto-corrects translate pack placed in transcribe slot', () => {
        const fixed = modelCore.fillMissingModelPaths({
            transcribeModelPath: 'models/ChickenRice-translate',
            translateModelPath: '',
        }, items);
        assert.strictEqual(fixed.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(fixed.translateModelPath, 'models/ChickenRice-translate');
    });

    it('gates dual when a model is missing', () => {
        const onlyTranscribe = items.filter((i) => i.kind === 'transcribe' && i.ready);
        const fail = modelCore.validateModelsForTask({
            transcribeModelPath: 'models/whisper-ja-1.5B-ct2',
            translateModelPath: '',
        }, onlyTranscribe, 'dual');
        assert.strictEqual(fail.ok, false);
        assert.ok(/翻译模型/.test(fail.error || ''));

        const ok = modelCore.validateModelsForTask({
            transcribeModelPath: 'models/whisper-ja-1.5B-ct2',
            translateModelPath: 'models/ChickenRice-translate',
        }, items, 'dual');
        assert.strictEqual(ok.ok, true);
    });

    it('warns when both paths are identical', () => {
        const customItems = [
            { id: 'c', path: 'models/custom-pack', label: 'c', kind: 'custom', ready: true },
        ];
        const res = modelCore.validateModelsForTask({
            transcribeModelPath: 'models/custom-pack',
            translateModelPath: 'models/custom-pack',
        }, customItems, 'dual');
        assert.strictEqual(res.ok, true);
        assert.ok((res.warnings || []).some((w) => /同一目录/.test(w)));
    });

    it('auto-corrects identical translate packs before dual validate', () => {
        const res = modelCore.validateModelsForTask({
            transcribeModelPath: 'models/ChickenRice-translate',
            translateModelPath: 'models/ChickenRice-translate',
        }, items, 'dual');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.options.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(res.options.translateModelPath, 'models/ChickenRice-translate');
    });

    it('detects kind from CT2 config fingerprints', () => {
        const translate = modelCore.detectModelKind({
            folderName: 'renamed-pack',
            config: {
                alignment_heads: Array.from({ length: 23 }, (_, i) => (i === 0 ? [10, 12] : [i, 1])),
                lang_ids: Array.from({ length: 99 }, (_, i) => 50259 + i),
            },
        });
        assert.strictEqual(translate.kind, 'translate');
        assert.strictEqual(translate.source, 'signature');
        assert.strictEqual(translate.matchId, 'chickenrice-large-v2-zh');

        const transcribe = modelCore.detectModelKind({
            folderName: 'mystery-model',
            config: {
                alignment_heads: Array.from({ length: 20 }, (_, i) => (i === 0 ? [0, 1] : [i, 2])),
                lang_ids: Array.from({ length: 100 }, (_, i) => 50259 + i),
            },
        });
        assert.strictEqual(transcribe.kind, 'transcribe');
        assert.strictEqual(transcribe.source, 'signature');
        assert.strictEqual(transcribe.matchId, 'whisper-ja-1.5B');
    });

    it('falls back to folder name when fingerprint unknown', () => {
        const byName = modelCore.detectModelKindFromName('ChickenRice-translate');
        assert.strictEqual(byName.kind, 'translate');
        assert.strictEqual(byName.source, 'name');

        const unknown = modelCore.detectModelKind({
            folderName: 'my-custom-ct2',
            config: { alignment_heads: [[1, 2]], lang_ids: [1, 2, 3] },
        });
        assert.strictEqual(unknown.kind, 'custom');
        assert.strictEqual(unknown.source, 'unknown');
    });

    it('prefers signature-detected models when suggesting', () => {
        const list = [
            {
                id: 'default',
                path: 'models',
                kind: 'translate',
                ready: true,
                kindSource: 'signature',
                kindConfidence: 1,
            },
            {
                id: 'ja',
                path: 'models/whisper-ja-1.5B-ct2',
                kind: 'transcribe',
                ready: true,
                kindSource: 'signature',
                kindConfidence: 1,
            },
        ];
        const suggested = modelCore.suggestModelsFromList(list);
        assert.strictEqual(suggested.transcribeModelPath, 'models/whisper-ja-1.5B-ct2');
        assert.strictEqual(suggested.translateModelPath, 'models');
    });
});

describe('normalize model path options', () => {
    it('keeps dedicated model fields', () => {
        const opts = normalizeTransWithAiRuntimeOptions({
            task: 'dual',
            transcribeModelPath: 'models/ja',
            translateModelPath: 'models/zh',
        });
        assert.strictEqual(opts.task, 'dual');
        assert.strictEqual(opts.transcribeModelPath, 'models/ja');
        assert.strictEqual(opts.translateModelPath, 'models/zh');
    });
});
