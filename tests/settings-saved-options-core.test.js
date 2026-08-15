const assert = require('assert');
const saved = require('../src/js/settings-saved-options-core');
const norm = require('../src/js/settings-options-normalize-core');

describe('settings-saved-options-core', () => {
    it('assembles persist object with clamps', () => {
        const out = saved.assembleSavedOptionsFromFields({
            task: 'dual',
            translateMode: 'engine',
            engineOpusMtModel: 'opus-mt-ja-zh',
            engineLlmMtModel: '',
            advancedEntitled: true,
            filmAudioEnhance: true,
            filmVadPreset: true,
            mergeBilingualSubtitles: true,
            deleteSourcesAfterMergeBilingual: true,
            smartTranslate: true,
            vadMaxSingleSegmentMsRaw: '20000',
            postBatchViewingPunctMode: 'light',
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'off',
            autoSense: true,
            audioSuffixes: '.m4a',
            ffmpegPath: '',
            outputMode: 'same',
            outputDir: '',
        }, norm);
        assert.strictEqual(out.task, 'dual');
        assert.strictEqual(out.engineMtModel, 'opus-mt-ja-zh');
        assert.strictEqual(out.filmAudioEnhance, true);
        assert.strictEqual(out.filmVadPreset, false);
        assert.strictEqual(out.vadMaxSingleSegmentMs, 20000);
        assert.strictEqual(out.targetChunkDurationS, 20);
        assert.strictEqual(out.postBatchSimplifyViewingPunctuation, true);
        assert.strictEqual(out.deleteSourcesAfterMergeBilingual, true);
        assert.strictEqual(out.rememberLastOpenDir, true);
        assert.strictEqual(out.smartTranslateHybridMt, true);
        assert.strictEqual(out.smartTranslatePlotPolish, true);
        assert.strictEqual(out.activePresetId, '');
    });

    it('persists activePresetId when recognition preset is selected', () => {
        const out = saved.assembleSavedOptionsFromFields({
            autoSense: false,
            activePresetId: 'ja-av-soft',
        }, norm);
        assert.strictEqual(out.autoSense, false);
        assert.strictEqual(out.activePresetId, 'ja-av-soft');
    });

    it('persists smartTranslateHybridMt false when unchecked', () => {
        const out = saved.assembleSavedOptionsFromFields({
            task: 'translate',
            smartTranslateHybridMt: false,
            smartTranslatePlotPolish: false,
        }, norm);
        assert.strictEqual(out.smartTranslateHybridMt, false);
        assert.strictEqual(out.smartTranslatePlotPolish, false);
    });

    it('persists rememberLastOpenDir false', () => {
        const out = saved.assembleSavedOptionsFromFields({
            rememberLastOpenDir: false,
        }, norm);
        assert.strictEqual(out.rememberLastOpenDir, false);
    });
});
