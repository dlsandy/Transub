const assert = require('assert');
const chip = require('../src/js/translate-mode-chip-core');

describe('translate-mode-chip-core', () => {
    it('labels and short model chips', () => {
        assert.strictEqual(chip.translateModeLabel('smart'), '混合');
        assert.strictEqual(chip.translateModeLabel('dialog'), '智能');
        assert.strictEqual(chip.translateModeLabel('llm'), '推理');
        assert.strictEqual(chip.translateModeLabel('external'), '外部');
        assert.strictEqual(chip.translateModeLabel('byok'), '外部');
        assert.strictEqual(chip.shortMtModelChipLabel('', { auto: true }), '自动');
        assert.strictEqual(chip.shortMtModelChipLabel('opus-mt-ja-zh'), '自动');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-1.5b'), 'Sakura1.5');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-7b'), 'GalTransl7');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-7b-q6k'), 'Gal7·Q6');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-v4-4b'), 'Galv4·4');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-14b'), 'GalTransl14');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-14b-q4km'), 'Gal14·Q4');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-14b-q6k'), 'Gal14·Q6');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-14b'), 'Sakura14');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-14b-q4km'), 'Sakura14·Q4');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-14b-q6k'), 'Sakura14·Q6');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-14b-qwen3'), 'Sakura14·Q3');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-8b-qwen3'), 'Sakura8');
        assert.strictEqual(chip.shortMtModelChipLabel('translategemma-4b'), 'TG·4');
        assert.strictEqual(chip.shortMtModelChipLabel('translategemma-4-sub-e4b'), 'TGSub·E4');
        assert.strictEqual(chip.shortMtModelChipLabel('hunyuan-mt-chimera-7b-abliterated'), 'HyChimera·A');
        assert.strictEqual(chip.shortMtModelChipLabel('hunyuan-mt-7b-abliterated'), 'HyMT·A');
        assert.strictEqual(chip.shortMtModelChipLabel('hy-mt15-7b-abliterated'), 'HyMT15·A');
        assert.strictEqual(chip.shortMtModelChipLabel('hy-mt15-1.8b-abliterated'), 'HyMT15·1.8A');
        assert.strictEqual(chip.shortMtModelChipLabel('translategemma-12b'), 'TG·12');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen25-7b'), 'Qwen7');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen3-8b-abliterated'), 'Qwen8·A');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen3-8b-abliterated-q5'), 'Qwen8·A5');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen35-9b-abliterated'), 'Q35·9A');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen35-9b-abliterated-q5'), 'Q35·9A5');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen3-30b-a3b-abliterated'), 'Qwen30·A');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen35-35b-a3b-abliterated'), 'Q35·35A');
        assert.strictEqual(chip.shortMtModelChipLabel('gemma4-e2b-abliterated'), 'G4·E2A');
        assert.strictEqual(chip.shortMtModelChipLabel('gemma4-e4b-abliterated'), 'G4·E4A');
        assert.strictEqual(chip.shortMtModelChipLabel('gemma4-12b-abliterated'), 'G4·12A');
        assert.strictEqual(chip.shortMtModelChipLabel('gemma4-26b-a4b-abliterated'), 'G4·26A');
    });

    it('buildTranslateChipViewModel disabled / smart / dialog / auto / natural / manual', () => {
        assert.strictEqual(chip.buildTranslateChipViewModel({ task: 'asr' }).label, '—');

        const dialog = chip.buildTranslateChipViewModel({ task: 'translate', mode: 'dialog' });
        assert.strictEqual(dialog.label, '智能翻译');
        assert.ok(dialog.title.includes('对话模型按行'));
        assert.ok(dialog.title.includes('Pro'));

        const smart = chip.buildTranslateChipViewModel({ task: 'translate', mode: 'smart' });
        assert.strictEqual(smart.label, '混合翻译');
        assert.ok(smart.title.includes('混合翻译（翻译 + 剧情贴合润色）'));
        assert.ok(smart.title.includes('自动'));
        const smartOff = chip.buildTranslateChipViewModel({
            task: 'translate', mode: 'smart', hybridMt: false,
        });
        assert.ok(smartOff.title.includes('对话模型按行'));
        assert.ok(smartOff.title.includes('混合翻译'));
        const polishOff = chip.buildTranslateChipViewModel({
            task: 'translate', mode: 'smart', hybridMt: true, plotPolish: false,
        });
        assert.ok(polishOff.title.includes('贴合润色已关'));
        assert.ok(polishOff.title.includes('混合翻译（翻译；贴合润色已关）'));
        const smartManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'smart',
            hybridMt: true,
            auto: false,
            llmId: 'sakura-7b',
        });
        assert.strictEqual(smartManual.label, '混合翻译 · Sakura7');
        assert.ok(smartManual.title.includes('sakura-7b'));
        const dualManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'smart',
            hybridMt: true,
            auto: false,
            llmId: 'sakura-7b',
            smartId: 'qwen25-7b',
        });
        assert.strictEqual(dualManual.label, '混合 · Sakura7+Qwen7');
        assert.ok(dualManual.title.includes('润色'));
        assert.ok(dualManual.title.includes('翻译 sakura-7b'));
        assert.ok(dualManual.title.includes('混合翻译（翻译 + 剧情贴合润色）'));
        const smartDialogManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'smart',
            hybridMt: false,
            auto: false,
            smartId: 'qwen25-7b',
        });
        assert.strictEqual(smartDialogManual.label, '混合翻译 · Qwen7');

        const dialogManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'dialog',
            auto: false,
            smartId: 'qwen25-7b',
        });
        assert.strictEqual(dialogManual.label, '智能翻译 · Qwen7');

        const follow = chip.buildTranslateChipViewModel({
            task: 'dual',
            mode: 'engine',
            followSense: true,
            auto: true,
            autoSenseEnabled: true,
        });
        assert.strictEqual(follow.label, '推理翻译');
        assert.ok(follow.title.includes('自动选模型'));

        const auto = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'llm',
            auto: true,
            recommend: { preferId: 'sakura-7b', reason: '显存充足' },
        });
        assert.strictEqual(auto.label, '推理翻译');
        assert.ok(auto.title.includes('显存充足') || auto.title.includes('自动选'));

        const legacyEngine = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'engine',
            auto: false,
            opusId: 'opus-mt-en-zh',
            llmId: 'sakura-1.5b',
        });
        assert.strictEqual(legacyEngine.mode, 'llm');
        assert.strictEqual(legacyEngine.label, '推理翻译 · Sakura1.5');

        const llmManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'llm',
            auto: false,
            llmId: 'sakura-7b',
        });
        assert.strictEqual(llmManual.label, '推理翻译 · Sakura7');
    });
});
