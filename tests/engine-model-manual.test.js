'use strict';

const assert = require('assert');
const path = require('path');

describe('engine Hub model manual install helpers', () => {
    const {
        buildHubUrls,
    } = require('../electron/engine-download-urls');
    const {
        manualPlaceHintForModel,
        getEngineModelsRoot,
        normalizeEngineDownloadKind,
        resolveDownloadModelIds,
        resolveOrtGpuManualPackage,
    } = require('../electron/engine-download-info');

    it('builds official and mirror Hub URLs', () => {
        const urls = buildHubUrls('quantumcookie/anime-whisper-ct2-fp16', 'https://hf-mirror.com');
        assert.strictEqual(
            urls.officialUrl,
            'https://huggingface.co/quantumcookie/anime-whisper-ct2-fp16',
        );
        assert.strictEqual(
            urls.mirrorUrl,
            'https://hf-mirror.com/quantumcookie/anime-whisper-ct2-fp16',
        );
    });

    it('hints model.bin for anime-whisper / whisper CT2', () => {
        const aw = manualPlaceHintForModel({
            id: 'anime-whisper',
            kind: 'asr',
            backend: 'whisper',
        });
        assert.strictEqual(aw.weightFile, 'model.bin');
        assert.match(aw.placeSteps, /不要再套一层/);
        assert.match(aw.placeSteps, /model\.bin/);
    });

    it('hints model.pt for SenseVoice / FSMN', () => {
        const sv = manualPlaceHintForModel({
            id: 'sensevoice-small',
            kind: 'asr',
            backend: 'sensevoice',
        });
        assert.strictEqual(sv.weightFile, 'model.pt');
    });

    it('resolves models root under engine install path', () => {
        const root = getEngineModelsRoot(path.join('C:', 'Transub', 'engine'));
        assert.ok(root.replace(/\\/g, '/').endsWith('engine/models'));
    });

    it('normalizeEngineDownloadKind aliases', () => {
        assert.strictEqual(normalizeEngineDownloadKind('gpu'), 'gpu');
        assert.strictEqual(normalizeEngineDownloadKind('audio-separate'), 'demucs');
        assert.strictEqual(normalizeEngineDownloadKind('runtime-whisper'), 'whisper');
        assert.strictEqual(normalizeEngineDownloadKind(''), 'models');
    });

    it('resolveDownloadModelIds filters Sakura and expands profile', () => {
        const ids = resolveDownloadModelIds({ profile: 'balanced' });
        assert.ok(ids.includes('sensevoice-small'));
        assert.ok(!ids.some((id) => String(id).startsWith('sakura')));
    });

    it('resolveOrtGpuManualPackage honors requirement pin', () => {
        const c12 = resolveOrtGpuManualPackage({ ortGpuRequirement: 'onnxruntime-gpu>=1.21,<1.27' });
        assert.strictEqual(c12.target, 'cuda12');
        const c13 = resolveOrtGpuManualPackage({ ortGpuRequirement: 'onnxruntime-gpu>=1.27' });
        assert.strictEqual(c13.target, 'cuda13');
    });
});
