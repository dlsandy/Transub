'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assembleSavedOptionsFromFields } = require('../src/js/settings-saved-options-core');
const settingsNormCore = require('../src/js/settings-options-normalize-core');
const { normalizeTransWithAiRuntimeOptions } = require('../electron/transwithai-runtime-options-normalize');

/** Keys written by factory command-bar chips via persistFormOptionsQuiet. */
const FACTORY_CHIP_OPTION_KEYS = Object.freeze([
    // 片源 / 目标
    'language',
    'chineseSubtitleVariant',
    'subtitleTargetLang',
    // 双语
    'mergeBilingualSubtitles',
    'dualLineOrder',
    'deleteSourcesAfterMergeBilingual',
    // 模型
    'translateMode',
    'engineLlmMtModel',
    'engineMtModel',
    'engineAsrModel',
    'activePresetId',
    'activeComboPlanId',
    'mtUseForm',
    // 风格
    'translateStyleEnabled',
    'translateStylePreset',
    'translateStyleCustomNote',
    // QC修复
    'postBatchQcFixMode',
]);

describe('factory command-bar chip persistence', () => {
    it('assembles + normalizes all chip option keys', () => {
        const assembled = assembleSavedOptionsFromFields({
            language: 'ja',
            chineseSubtitleVariant: 'simplified',
            mergeBilingualSubtitles: true,
            dualLineOrder: 'source-first',
            deleteSourcesAfterMergeBilingual: true,
            translateMode: 'llm',
            engineLlmMtModel: 'sakura-x',
            engineMtModel: '',
            engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            activePresetId: '',
            activeComboPlanId: '',
            mtUseForm: true,
            translateStyleEnabled: true,
            translateStylePreset: 'web_slang',
            translateStyleCustomNote: '',
            postBatchQcFixMode: 'smart',
            task: 'dual',
            advancedEntitled: true,
        }, settingsNormCore);
        const normalized = normalizeTransWithAiRuntimeOptions(assembled);
        for (const key of FACTORY_CHIP_OPTION_KEYS) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(assembled, key),
                `assembleSavedOptionsFromFields missing chip key: ${key}`,
            );
            assert.ok(
                Object.prototype.hasOwnProperty.call(normalized, key),
                `normalizeTransWithAiRuntimeOptions missing chip key: ${key}`,
            );
        }
        assert.strictEqual(normalized.translateStyleEnabled, true);
        assert.strictEqual(normalized.translateStylePreset, 'web_slang');
        assert.strictEqual(normalized.mtUseForm, true);
        assert.strictEqual(normalized.postBatchQcFixMode, 'smart');
        assert.strictEqual(normalized.mergeBilingualSubtitles, true);
    });

    it('partial-save whitelist in transwithai-bridge includes chip keys', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '../electron/transwithai-bridge.js'),
            'utf8',
        );
        const start = src.indexOf("register('transwithai-save-options'");
        assert.ok(start >= 0, 'transwithai-save-options handler missing');
        const slice = src.slice(start, start + 12000);
        for (const key of FACTORY_CHIP_OPTION_KEYS) {
            assert.ok(
                slice.includes(`'${key}'`),
                `transwithai-save-options whitelist missing chip key: ${key}`,
            );
        }
    });
});
