'use strict';

const assert = require('assert');
const path = require('path');

describe('engine Hub model manual install helpers', () => {
    const {
        buildHubUrls,
        manualPlaceHintForModel,
        getEngineModelsRoot,
    } = require('../electron/engine-bridge');

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
});
