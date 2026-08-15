const assert = require('assert');
const plan = require('../electron/engine-batch-mt-plan');

describe('engine-batch-mt-plan', () => {
    it('builds sanitized file list and resolves smart/sakura', () => {
        const list = [
            { optionOverrides: { language: 'en', engineMtModel: 'sakura-1.5b' } },
            { optionOverrides: { language: 'ja', engineMtModel: 'sakura-1.5b' } },
        ];
        const merged = { task: 'dual', engineMtModel: 'sakura-1.5b', smartTranslate: false };
        const files = plan.buildSanitizedFileMergedList(list, merged, {
            mergeSenseOverrides: (base, ov) => ({ ...base, ...ov }),
            sanitizeSakuraMtForLanguage: (opts, lang) => ({
                options: lang === 'en'
                    ? { ...opts, engineMtModel: 'opus-mt-en-zh' }
                    : opts,
            }),
        });
        assert.strictEqual(files[0].engineMtModel, 'opus-mt-en-zh');
        assert.strictEqual(files[1].engineMtModel, 'sakura-1.5b');

        const resolved = plan.resolveBatchMtPlan({
            fileMergedList: files,
            merged,
            listLength: list.length,
            isLlmMtId: (id) => /sakura/i.test(String(id || '')),
        });
        assert.strictEqual(resolved.batchWantsSmart, false);
        assert.strictEqual(resolved.batchWantsSakura, true);
        assert.strictEqual(resolved.sakuraModelId, 'sakura-1.5b');
    });

    it('detects film gate and builds adapter launch', () => {
        assert.strictEqual(plan.batchNeedsFilmAudioGate(
            [{ optionOverrides: { filmAudioEnhance: true } }],
            { filmAudioEnhance: false },
            (a, b) => ({ ...a, ...b }),
        ), true);

        const launch = plan.resolveBatchMtAdapterLaunch({
            batchWantsSmart: true,
            merged: {
                engineMtModel: 'qwen',
                smartTranslateFaithfulTone: true,
                windowCues: 8,
            },
            list: [],
        });
        assert.strictEqual(launch.mode, 'smart');
        assert.strictEqual(launch.options.sakuraNsfwPrompt, true);
        assert.strictEqual(launch.options.windowCues, 8);
    });

    it('passes hybrid MT flags through adapter launch options', () => {
        const launch = plan.resolveBatchMtAdapterLaunch({
            batchWantsSmart: true,
            merged: {
                smartTranslateHybridMt: false,
                engineLlmMtModel: 'sakura-galtransl-7b',
            },
            list: [],
        });
        assert.strictEqual(launch.options.smartTranslateHybridMt, false);
        assert.strictEqual(launch.options.engineLlmMtModel, 'sakura-galtransl-7b');
        assert.strictEqual(launch.options.windowCues, 8);
    });
});
