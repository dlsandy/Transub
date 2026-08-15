const assert = require('assert');
const missing = require('../src/js/engine-missing-models-core');

describe('engine-missing-models-core', () => {
    it('resolves expected opus ids', () => {
        assert.deepStrictEqual(missing.resolveExpectedOpusMtModelIds({
            task: 'asr',
            translateMode: 'engine',
        }), []);
        assert.deepStrictEqual(missing.resolveExpectedOpusMtModelIds({
            task: 'translate',
            translateMode: 'engine',
            explicitOpusMtId: 'opus-mt-en-zh',
        }), ['opus-mt-en-zh']);
        assert.deepStrictEqual(missing.resolveExpectedOpusMtModelIds({
            task: 'dual',
            translateMode: 'engine',
            formLang: 'ja',
            selectedItems: [],
        }), ['opus-mt-ja-zh']);
        assert.deepStrictEqual(missing.resolveExpectedOpusMtModelIds({
            task: 'translate',
            translateMode: 'engine',
            selectedItems: [{
                sense: {
                    adopted: true,
                    overrides: { engineMtModel: 'sakura-1.5b' },
                },
            }],
            isSakuraMtModelId: (id) => /sakura/i.test(id),
        }), []);
    });

    it('warns when models missing', () => {
        const models = [
            { id: 'sensevoice-small', installed: true },
            { id: 'fsmn-vad', installed: false, incomplete: true },
            { id: 'opus-mt-ja-zh', installed: false },
        ];
        const msg = missing.warnIfSelectedEngineModelsMissing({
            task: 'translate',
            translateMode: 'engine',
            explicitOpusMtId: 'opus-mt-ja-zh',
            asrModelId: 'sensevoice-small',
            cachedEngineModels: models,
        });
        assert.ok(msg.includes('opus-mt-ja-zh'));
        assert.ok(msg.includes('fsmn-vad'));

        assert.strictEqual(missing.anyCommonOpusMtInstalled([
            { id: 'opus-mt-en-zh', installed: true },
        ]), true);
    });

    it('collects preset required model ids and finds missing catalog rows', () => {
        assert.deepStrictEqual(missing.collectRequiredModelIdsFromOptions({
            engineAsrModel: 'anime-whisper',
            engineVadModel: 'silero-vad',
            engineMtModel: 'opus-mt-ja-zh',
        }), ['anime-whisper', 'silero-vad']);

        const missingRows = missing.findMissingCatalogModels(
            ['anime-whisper', 'silero-vad', 'fsmn-vad'],
            [
                { id: 'anime-whisper', name: 'Anime Whisper', installed: false },
                { id: 'silero-vad', name: 'Silero VAD', installed: true },
                { id: 'fsmn-vad', name: 'FSMN VAD', installed: true, incomplete: true },
            ],
        );
        assert.deepStrictEqual(missingRows.map((m) => m.id), ['anime-whisper', 'fsmn-vad']);
        assert.strictEqual(missingRows[0].reason, 'not_installed');
        assert.strictEqual(missingRows[1].reason, 'incomplete');

        const copy = missing.buildMissingModelsConfirmCopy({
            contextLabel: '预设「Anime Whisper」',
            missing: missingRows,
            settingsHint: '设置 → 模型',
        });
        assert.strictEqual(copy.title, '需要先下载模型');
        assert.ok(copy.message.includes('预设「Anime Whisper」'));
        assert.ok(copy.message.includes('设置 → 模型'));
        assert.ok(copy.message.includes('anime-whisper'));
        assert.strictEqual(copy.primaryLabel, '去下载');
        assert.strictEqual(copy.secondaryLabel, '取消');
    });
});
