const assert = require('assert');
const manual = require('../src/js/engine-manual-download-core');

describe('engine-manual-download-core', () => {
    const deps = {
        demucsModelId: 'demucs',
        isSakuraMtModelId: (id) => /sakura/i.test(id),
        findManagedLlmCatalogEntry: (id) => (id === 'qwen25-7b' ? { id } : null),
    };

    it('gates managed / hub / demucs ids', () => {
        assert.strictEqual(manual.isManagedLlmDownloadId('qwen25-7b', '', deps), true);
        assert.strictEqual(manual.isManagedLlmDownloadId('sakura-1.5b', '', deps), false);
        assert.strictEqual(manual.isManagedLlmDownloadId('demucs', '', deps), false);
        assert.strictEqual(manual.canManualEngineHubDownload({
            id: 'whisper-tiny',
            group: 'asr',
            hubId: 'openai/whisper-tiny',
        }, deps), true);
        assert.strictEqual(manual.canManualEngineHubDownload({
            id: 'qwen25-7b',
            group: 'llm',
            source: 'managed',
        }, deps), false);
        assert.strictEqual(manual.canManualEngineHubDownload({
            id: 'silero-vad',
            group: 'vad',
            hubId: 'x',
        }, deps), false);
    });

    it('builds hub / gguf hints and classifies kinds', () => {
        const hub = manual.buildManualHubModelHint({
            name: 'Whisper',
            hubId: 'openai/whisper-tiny',
            mirrorUrl: 'https://hf-mirror.com/x',
            localDir: 'D:/models/asr/whisper-tiny',
            weightFile: 'model.bin',
            sizeHint: '75 MB',
        });
        assert.ok(hub.includes('Whisper'));
        assert.ok(hub.includes('model.bin'));
        assert.ok(hub.includes('D:/models'));

        const gguf = manual.buildManualGgufHint({
            name: 'Qwen',
            fileName: 'q.gguf',
            folder: 'D:/advanced-llm/models',
            sizeHint: '4G',
        });
        assert.ok(gguf.includes('q.gguf'));
        assert.ok(gguf.includes('GGUF'));

        const kinds = manual.classifyManualKindsForModelIds([
            'demucs',
            'sensevoice-small',
            'qwen3-asr-0.6b',
            'whisper-tiny',
            'opus-mt-ja-zh',
        ]);
        assert.deepStrictEqual(
            kinds.kinds.sort(),
            ['demucs', 'sensevoice', 'torch-cuda', 'whisper'].sort(),
        );
        assert.ok(kinds.hubIds.includes('opus-mt-ja-zh'));
    });
});
