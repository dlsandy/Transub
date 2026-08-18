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
        assert.strictEqual(out.uiLocale, 'zh-Hans');
        assert.strictEqual(out.smartTranslateHybridMt, true);
        assert.strictEqual(out.smartTranslatePlotPolish, true);
        assert.strictEqual(out.smartTranslateFaithfulVerify, true);
        assert.strictEqual(out.smartTranslateAddressConsistency, true);
        assert.strictEqual(out.asrSecondOpinion, 'auto');
        assert.strictEqual(out.filmBriefSampleMode, 'auto');
        assert.strictEqual(out.activePresetId, '');
    });

    it('persists filmBriefSampleMode full', () => {
        const out = saved.assembleSavedOptionsFromFields({
            filmBriefSampleMode: 'full',
        }, norm);
        assert.strictEqual(out.filmBriefSampleMode, 'full');
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
            smartTranslateFaithfulVerify: false,
            smartTranslateAddressConsistency: false,
            asrSecondOpinion: 'off',
        }, norm);
        assert.strictEqual(out.smartTranslateHybridMt, false);
        assert.strictEqual(out.smartTranslatePlotPolish, false);
        assert.strictEqual(out.smartTranslateFaithfulVerify, false);
        assert.strictEqual(out.smartTranslateAddressConsistency, false);
        assert.strictEqual(out.asrSecondOpinion, 'off');
    });

    it('normalizes asrSecondOpinion on/auto', () => {
        assert.strictEqual(norm.normalizeAsrSecondOpinion('ON'), 'on');
        assert.strictEqual(norm.normalizeAsrSecondOpinion(undefined), 'auto');
        assert.strictEqual(norm.normalizeAsrSecondOpinion(false), 'off');
        const on = saved.assembleSavedOptionsFromFields({ asrSecondOpinion: 'always' }, norm);
        assert.strictEqual(on.asrSecondOpinion, 'on');
    });

    it('persists rememberLastOpenDir false', () => {
        const out = saved.assembleSavedOptionsFromFields({
            rememberLastOpenDir: false,
        }, norm);
        assert.strictEqual(out.rememberLastOpenDir, false);
    });

    it('persists qcSilenceSplitChars (default 15)', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.qcSilenceSplitChars, 15);
        const off = saved.assembleSavedOptionsFromFields({
            qcSilenceSplitCharsRaw: '0',
        }, norm);
        assert.strictEqual(off.qcSilenceSplitChars, 0);
        const custom = saved.assembleSavedOptionsFromFields({
            qcSilenceSplitCharsRaw: '20',
        }, norm);
        assert.strictEqual(custom.qcSilenceSplitChars, 20);
    });
});
