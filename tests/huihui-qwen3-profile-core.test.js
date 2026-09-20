const assert = require('assert');
const profile = require('../src/js/huihui-qwen3-profile-core');

describe('huihui-qwen3-profile-core', () => {
    it('detects Huihui / abliterated Qwen3 ids and filenames', () => {
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-8b-abliterated'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-8b-abliterated-q5'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-4b-abliterated'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-14b-abliterated'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen35-9b-abliterated'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen35-9b-abliterated-q5'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-30b-a3b-abliterated'), true);
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen35-35b-a3b-abliterated'), true);
        assert.strictEqual(
            profile.isHuihuiQwen3Model('Huihui-Qwen3-8B-abliterated-v2.Q5_K_M.gguf'),
            true,
        );
        assert.strictEqual(
            profile.isHuihuiQwen3Model('Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf'),
            true,
        );
        assert.strictEqual(profile.isHuihuiQwen3Model('qwen3-8b'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model('sakura-7b'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model('hunyuan-mt-chimera-7b-abliterated'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model('hy-mt15-7b-abliterated'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model('gemma4-e4b-abliterated'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model('Huihui-gemma-4-12B-it-abliterated.Q4_K_M.gguf'), false);
        assert.strictEqual(profile.isHuihuiQwen3Model(''), false);
    });

    it('tiers sampling by param size', () => {
        const b4 = profile.resolveHuihuiTranslateProfile('qwen3-4b-abliterated');
        const b8 = profile.resolveHuihuiTranslateProfile('qwen3-8b-abliterated');
        const b14 = profile.resolveHuihuiTranslateProfile('qwen3-14b-abliterated');
        const b9 = profile.resolveHuihuiTranslateProfile('qwen35-9b-abliterated');
        const b30 = profile.resolveHuihuiTranslateProfile('qwen3-30b-a3b-abliterated');
        assert.ok(b4 && b8 && b14 && b9 && b30);
        assert.strictEqual(b4.temperature, 0.14);
        assert.strictEqual(b4.polishTemperature, 0.22);
        assert.strictEqual(b8.temperature, 0.15);
        assert.strictEqual(b8.polishTemperature, 0.23);
        assert.strictEqual(b9.temperature, 0.15);
        assert.strictEqual(b9.paramBillion, 9);
        assert.strictEqual(b14.temperature, 0.16);
        assert.strictEqual(b14.polishTemperature, 0.24);
        assert.strictEqual(b30.temperature, 0.16);
        assert.strictEqual(b30.paramBillion, 30);
        assert.strictEqual(b8.topP, 0.8);
        assert.strictEqual(b8.repeatPenalty, 1.08);
        assert.strictEqual(b8.frequencyPenalty, 0.12);
        assert.strictEqual(b8.disableThinking, true);
        assert.strictEqual(b8.preferPlotPolish, true);
        assert.strictEqual(b8.preferFaithfulVerify, true);
    });

    it('prompt addons emphasize meaning over paraphrase', () => {
        const line = profile.getHuihuiPromptAddon('qwen3-8b-abliterated', 'line');
        const polish = profile.getHuihuiPromptAddon('qwen3-8b-abliterated', 'polish');
        assert.ok(line.includes('语意') || line.includes('忠实'));
        assert.ok(line.includes('禁止') && /改意|换写|性化/.test(line));
        assert.ok(polish.includes('润色') || polish.includes('欠译'));
        assert.ok(/禁止/.test(polish));
        assert.strictEqual(profile.getHuihuiPromptAddon('qwen3-8b', 'line'), '');
        assert.strictEqual(profile.resolveHuihuiTranslateProfile('qwen25-7b'), null);
    });

    it('chatDefaults fragment matches profile sampling', () => {
        const d = profile.resolveHuihuiChatDefaults('qwen3-8b-abliterated-q5');
        assert.deepStrictEqual(d, {
            disableThinking: true,
            temperature: 0.15,
            polishTemperature: 0.23,
            topP: 0.8,
            repeatPenalty: 1.08,
            frequencyPenalty: 0.12,
        });
    });
});
