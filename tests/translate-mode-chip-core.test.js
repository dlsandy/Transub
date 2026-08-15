const assert = require('assert');
const chip = require('../src/js/translate-mode-chip-core');

describe('translate-mode-chip-core', () => {
    it('labels and short model chips', () => {
        assert.strictEqual(chip.translateModeLabel('smart'), 'Pro译');
        assert.strictEqual(chip.translateModeLabel('llm'), '推理');
        assert.strictEqual(chip.shortMtModelChipLabel('', { auto: true }), '自动');
        assert.strictEqual(chip.shortMtModelChipLabel('opus-mt-ja-zh'), 'Opus·日');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-1.5b'), 'Sakura1.5');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-7b'), 'GalTransl7');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-7b-q6k'), 'Gal7·Q6');
        assert.strictEqual(chip.shortMtModelChipLabel('sakura-galtransl-v4-4b'), 'Galv4·4');
        assert.strictEqual(chip.shortMtModelChipLabel('qwen25-7b'), 'Qwen7');
    });

    it('buildTranslateChipViewModel disabled / smart / auto / natural / manual', () => {
        assert.strictEqual(chip.buildTranslateChipViewModel({ task: 'asr' }).label, '—');

        const smart = chip.buildTranslateChipViewModel({ task: 'translate', mode: 'smart' });
        assert.strictEqual(smart.label, '智能翻译');
        assert.ok(smart.title.includes('推理模型句级'));
        assert.ok(smart.title.includes('剧情贴合润色'));
        assert.ok(smart.title.includes('自动'));
        const smartOff = chip.buildTranslateChipViewModel({
            task: 'translate', mode: 'smart', hybridMt: false,
        });
        assert.ok(smartOff.title.includes('对话模型句级'));
        const polishOff = chip.buildTranslateChipViewModel({
            task: 'translate', mode: 'smart', hybridMt: true, plotPolish: false,
        });
        assert.ok(polishOff.title.includes('贴合润色已关'));
        const smartManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'smart',
            hybridMt: true,
            auto: false,
            llmId: 'sakura-7b',
        });
        assert.strictEqual(smartManual.label, '智能翻译 · Sakura7');
        assert.ok(smartManual.title.includes('sakura-7b'));
        const smartDialogManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'smart',
            hybridMt: false,
            auto: false,
            smartId: 'qwen25-7b',
        });
        assert.strictEqual(smartDialogManual.label, '智能翻译 · Qwen7');

        const follow = chip.buildTranslateChipViewModel({
            task: 'dual',
            mode: 'engine',
            followSense: true,
            auto: true,
            autoSenseEnabled: true,
        });
        assert.strictEqual(follow.label, '机器翻译');
        assert.ok(follow.title.includes('片子'));

        const auto = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'llm',
            auto: true,
            recommend: { preferId: 'sakura-7b', reason: '显存充足' },
        });
        assert.strictEqual(auto.label, '推理翻译');
        assert.ok(auto.title.includes('显存充足') || auto.title.includes('自动选'));

        const manual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'engine',
            auto: false,
            opusId: 'opus-mt-en-zh',
        });
        assert.strictEqual(manual.label, '机器翻译 · Opus·英');
        assert.ok(manual.title.includes('opus-mt-en-zh'));

        const llmManual = chip.buildTranslateChipViewModel({
            task: 'translate',
            mode: 'llm',
            auto: false,
            llmId: 'sakura-7b',
        });
        assert.strictEqual(llmManual.label, '推理翻译 · Sakura7');
    });
});
