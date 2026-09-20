'use strict';

const assert = require('assert');
const { resolveMtTargetFields } = require('../electron/sanitize-target-opts');
const { resolveBatchMtAdapterLaunch } = require('../electron/engine-batch-mt-plan');

describe('resolveMtTargetFields', () => {
    it('keeps English when session has subtitleTargetLang even if engine sends zh', () => {
        const f = resolveMtTargetFields(
            { subtitleTargetLang: 'en', chineseSubtitleVariant: 'simplified' },
            { targetLanguage: 'zh' },
        );
        assert.strictEqual(f.subtitleTargetLang, 'en');
        assert.strictEqual(f.isZhTarget, false);
        assert.strictEqual(f.targetLanguage, 'English');
        assert.strictEqual(f.engineTargetLanguage, 'en');
    });

    it('does not let bare options.targetLanguage=zh override subtitleTargetLang', () => {
        const f = resolveMtTargetFields({
            subtitleTargetLang: 'en',
            targetLanguage: 'zh',
        });
        assert.strictEqual(f.subtitleTargetLang, 'en');
        assert.strictEqual(f.targetLanguage, 'English');
    });

    it('defaults zh-Hans when nothing set', () => {
        const f = resolveMtTargetFields({});
        assert.strictEqual(f.isZhTarget, true);
        assert.ok(/中文/.test(f.targetLanguage) || f.subtitleTargetLang === 'zh-Hans');
    });
});

describe('resolveBatchMtAdapterLaunch intl', () => {
    it('stamps English target fields onto adapter options', () => {
        const launch = resolveBatchMtAdapterLaunch({
            batchWantsSmart: true,
            merged: {
                smartTranslate: true,
                subtitleTargetLang: 'en',
                chineseSubtitleVariant: 'simplified',
            },
            list: [],
        });
        assert.strictEqual(launch.mode, 'smart');
        assert.strictEqual(launch.options.subtitleTargetLang, 'en');
        assert.strictEqual(launch.options.targetLanguage, 'English');
        // en is hybrid-capable (TG/Chimera); do not force hybrid/polish off.
        assert.notStrictEqual(launch.options.smartTranslateHybridMt, false);
    });

    it('keeps hybrid on when English session explicitly enables it', () => {
        const launch = resolveBatchMtAdapterLaunch({
            batchWantsSmart: true,
            merged: {
                smartTranslate: true,
                smartTranslateHybridMt: true,
                smartTranslatePlotPolish: true,
                subtitleTargetLang: 'en',
                hybridMtModelId: 'translategemma-4-sub-e4b',
            },
            list: [],
        });
        assert.strictEqual(launch.options.smartTranslateHybridMt, true);
        assert.strictEqual(launch.options.smartTranslatePlotPolish, true);
        assert.strictEqual(launch.options.subtitleTargetLang, 'en');
    });
});
