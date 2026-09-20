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
            audioSuffixes: '.m4a',
            ffmpegPath: '',
            outputMode: 'same',
            outputDir: '',
        }, norm);
        assert.strictEqual(out.task, 'dual');
        assert.strictEqual(out.translateMode, 'llm');
        assert.strictEqual(out.engineOpusMtModel, '');
        assert.strictEqual(out.engineMtModel, '');
        assert.strictEqual(out.glossaryMtEnabled, false);
        assert.strictEqual(out.filmAudioEnhance, true);
        assert.strictEqual(out.filmVadPreset, false);
        assert.strictEqual(out.vadMaxSingleSegmentMs, 20000);
        assert.strictEqual(out.targetChunkDurationS, 20);
        assert.strictEqual(out.postBatchSimplifyViewingPunctuation, true);
        assert.strictEqual(out.deleteSourcesAfterMergeBilingual, true);
        assert.strictEqual(out.rememberLastOpenDir, true);
        assert.strictEqual(out.uiLocale, 'zh-Hans');
        assert.strictEqual(out.insertSoftwareCredit, true);
        // engine→llm: not a Pro mode, so hybrid/polish prefs stay off
        assert.strictEqual(out.smartTranslate, false);
        assert.strictEqual(out.smartTranslateHybridMt, false);
        assert.strictEqual(out.smartTranslatePlotPolish, false);
        assert.strictEqual(out.subtitleEditorBackend, 'auto');
        assert.strictEqual(out.subtitleEditorPath, '');
        assert.strictEqual(out.smartTranslateFaithfulVerify, false);
        assert.strictEqual(out.smartTranslateAddressConsistency, false);
        assert.strictEqual(out.asrSecondOpinion, 'off');
        assert.strictEqual(out.qualityPipelineMode, 'auto');
        assert.strictEqual(out.postQcLoopMaxPasses, 1);
        assert.strictEqual(out.asrSemanticRepair, 'auto');
        assert.strictEqual(out.filmBriefSampleMode, 'auto');
        assert.strictEqual(out.activePresetId, '');
        assert.deepStrictEqual(out.autoScanFolders, []);
        assert.strictEqual(out.autoScanRecursive, true);
    });

    it('persists autoScanFolders and recursive flag', () => {
        const out = saved.assembleSavedOptionsFromFields({
            autoScanFolders: ['D:\\Media', 'D:/Media', 'E:\\More'],
            autoScanRecursive: false,
        }, norm);
        assert.deepStrictEqual(out.autoScanFolders, ['D:\\Media', 'E:\\More']);
        assert.strictEqual(out.autoScanRecursive, false);
    });

    it('persists glossaryMtEnabled when enabled', () => {
        const out = saved.assembleSavedOptionsFromFields({
            glossaryMtEnabled: true,
        }, norm);
        assert.strictEqual(out.glossaryMtEnabled, true);
    });

    it('persists subtitleTargetLang independent of uiLocale', () => {
        const en = saved.assembleSavedOptionsFromFields({
            uiLocale: 'zh-Hans',
            subtitleTargetForm: 'en',
            chineseSubtitleVariant: 'simplified',
        }, norm);
        assert.strictEqual(en.subtitleTargetLang, 'en');
        assert.strictEqual(en.dualTargetSuffix, 'en');
        assert.strictEqual(en.chineseSubtitleVariant, 'simplified');
        assert.strictEqual(en.uiLocale, 'zh-Hans');

        const hant = saved.assembleSavedOptionsFromFields({
            subtitleTargetLang: 'zh-Hant',
            chineseSubtitleVariant: 'traditional',
        }, norm);
        assert.strictEqual(hant.subtitleTargetLang, 'zh-Hant');
        assert.strictEqual(hant.dualTargetSuffix, 'zh-tw');
        assert.strictEqual(hant.chineseSubtitleVariant, 'traditional');
    });

    it('persists lastMtByTarget buckets', () => {
        const out = saved.assembleSavedOptionsFromFields({
            lastMtByTarget: { zh: 'sakura-1.5b', en: 'qwen25-7b', junk: 'x' },
        }, norm);
        assert.strictEqual(out.lastMtByTarget.zh, 'sakura-1.5b');
        assert.strictEqual(out.lastMtByTarget.en, 'qwen25-7b');
        assert.strictEqual(out.lastMtByTarget.ja, '');
        assert.strictEqual(out.lastMtByTarget.ko, '');
        assert.ok(!Object.prototype.hasOwnProperty.call(out.lastMtByTarget, 'junk'));
    });

    it('persists uiLocale for catalog languages', () => {
        for (const id of ['en', 'ja', 'ko', 'zh-Hant-TW']) {
            const out = saved.assembleSavedOptionsFromFields({ uiLocale: id }, norm);
            assert.strictEqual(out.uiLocale, id);
        }
        assert.strictEqual(
            saved.assembleSavedOptionsFromFields({ uiLocale: 'en-US' }, norm).uiLocale,
            'en',
        );
    });

    it('persists filmBriefSampleMode full', () => {
        const out = saved.assembleSavedOptionsFromFields({
            filmBriefSampleMode: 'full',
        }, norm);
        assert.strictEqual(out.filmBriefSampleMode, 'full');
    });

    it('persists activePresetId when recognition preset is selected', () => {
        const out = saved.assembleSavedOptionsFromFields({
            activePresetId: 'ja-av-soft',
        }, norm);
        assert.strictEqual(out.activePresetId, 'ja-av-soft');
        assert.strictEqual(Object.prototype.hasOwnProperty.call(out, 'autoSense'), false);
    });

    it('persists activeComboPlanId when combo plan is applied', () => {
        const out = saved.assembleSavedOptionsFromFields({
            activeComboPlanId: 'ja-anime-sakura-balanced',
        }, norm);
        assert.strictEqual(out.activeComboPlanId, 'ja-anime-sakura-balanced');
    });

    it('smart mode enables hybrid; dialog enables polish without hybrid', () => {
        const smart = saved.assembleSavedOptionsFromFields({
            task: 'translate',
            translateMode: 'smart',
            smartTranslateHybridMt: false,
            smartTranslatePlotPolish: false,
            smartTranslateFaithfulVerify: false,
            smartTranslateAddressConsistency: false,
            asrSecondOpinion: 'off',
        }, norm);
        assert.strictEqual(smart.translateMode, 'smart');
        assert.strictEqual(smart.smartTranslate, true);
        assert.strictEqual(smart.smartTranslateHybridMt, true);
        assert.strictEqual(smart.smartTranslatePlotPolish, false);
        assert.strictEqual(smart.smartTranslateFaithfulVerify, false);
        assert.strictEqual(smart.smartTranslateAddressConsistency, false);
        assert.strictEqual(smart.asrSecondOpinion, 'off');

        const dialog = saved.assembleSavedOptionsFromFields({
            task: 'translate',
            translateMode: 'dialog',
            smartTranslatePlotPolish: true,
            smartTranslateFaithfulVerify: true,
            smartTranslateAddressConsistency: true,
        }, norm);
        assert.strictEqual(dialog.translateMode, 'dialog');
        assert.strictEqual(dialog.smartTranslate, true);
        assert.strictEqual(dialog.smartTranslateHybridMt, false);
        assert.strictEqual(dialog.smartTranslatePlotPolish, true);
        assert.strictEqual(dialog.smartTranslateFaithfulVerify, true);
        assert.strictEqual(dialog.smartTranslateAddressConsistency, true);
    });

    it('normalizes asrSecondOpinion on/auto', () => {
        assert.strictEqual(norm.normalizeAsrSecondOpinion('ON'), 'on');
        assert.strictEqual(norm.normalizeAsrSecondOpinion(undefined), 'off');
        assert.strictEqual(norm.normalizeAsrSecondOpinion(false), 'off');
        const on = saved.assembleSavedOptionsFromFields({ asrSecondOpinion: 'always' }, norm);
        assert.strictEqual(on.asrSecondOpinion, 'on');
    });

    it('normalizes qualityPipelineMode and postQcLoopMaxPasses', () => {
        assert.strictEqual(norm.normalizeQualityPipelineMode('ON'), 'on');
        assert.strictEqual(norm.normalizeQualityPipelineMode(undefined), 'auto');
        assert.strictEqual(norm.clampPostQcLoopMaxPasses(9), 2);
        const out = saved.assembleSavedOptionsFromFields({
            qualityPipelineMode: 'off',
            postQcLoopMaxPassesRaw: '2',
        }, norm);
        assert.strictEqual(out.qualityPipelineMode, 'off');
        assert.strictEqual(out.postQcLoopMaxPasses, 2);
    });

    it('persists asrBadPoolDrafts default false', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.asrBadPoolDrafts, false);
        const off = saved.assembleSavedOptionsFromFields({ asrBadPoolDrafts: false }, norm);
        assert.strictEqual(off.asrBadPoolDrafts, false);
        const on = saved.assembleSavedOptionsFromFields({ asrBadPoolDrafts: true }, norm);
        assert.strictEqual(on.asrBadPoolDrafts, true);
    });

    it('persists insertSoftwareCredit false when unchecked', () => {
        const out = saved.assembleSavedOptionsFromFields({
            insertSoftwareCredit: false,
        }, norm);
        assert.strictEqual(out.insertSoftwareCredit, false);
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.insertSoftwareCredit, true);
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

    it('persists externalImportAction', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.externalImportAction, 'list_when_idle');
        const start = saved.assembleSavedOptionsFromFields({
            externalImportAction: 'list_and_start',
        }, norm);
        assert.strictEqual(start.externalImportAction, 'list_and_start');
        const idle = saved.assembleSavedOptionsFromFields({
            externalImportAction: 'list_when_idle',
        }, norm);
        assert.strictEqual(idle.externalImportAction, 'list_when_idle');
    });

    it('persists postBatchTextPresetGroupId only when Pro entitled', () => {
        const locked = saved.assembleSavedOptionsFromFields({
            advancedEntitled: false,
            postBatchTextPresetGroupId: 'tg_abc',
        }, norm);
        assert.strictEqual(locked.postBatchTextPresetGroupId, '');
        const pro = saved.assembleSavedOptionsFromFields({
            advancedEntitled: true,
            postBatchTextPresetGroupId: 'tg_abc',
        }, norm);
        assert.strictEqual(pro.postBatchTextPresetGroupId, 'tg_abc');
    });

    it('assembles translate style preset and strips custom note for non-Pro', () => {
        const pro = saved.assembleSavedOptionsFromFields({
            advancedEntitled: true,
            translateStyleEnabled: true,
            translateStylePreset: 'custom',
            translateStyleCustomNote: ' 口语自然 ',
        }, norm);
        assert.strictEqual(pro.translateStyleEnabled, true);
        assert.strictEqual(pro.translateStylePreset, 'custom');
        assert.strictEqual(pro.translateStyleCustomNote, '口语自然');
        const free = saved.assembleSavedOptionsFromFields({
            advancedEntitled: false,
            translateStyleEnabled: true,
            translateStylePreset: 'custom',
            translateStyleCustomNote: '口语自然',
        }, norm);
        assert.strictEqual(free.translateStyleEnabled, true);
        assert.strictEqual(free.translateStylePreset, 'natural_spoken');
        assert.strictEqual(free.translateStyleCustomNote, '');
        const off = saved.assembleSavedOptionsFromFields({
            translateStyleEnabled: false,
            translateStylePreset: 'web_slang',
        }, norm);
        assert.strictEqual(off.translateStyleEnabled, false);
        assert.strictEqual(off.translateStylePreset, 'web_slang');
    });

    it('assembles subtitleEditorBackend external', () => {
        const out = saved.assembleSavedOptionsFromFields({
            subtitleEditorBackend: 'external',
            subtitleEditorPath: ' D:\\Apps\\Transub.Editor.exe ',
        }, norm);
        assert.strictEqual(out.subtitleEditorBackend, 'external');
        assert.strictEqual(out.subtitleEditorPath, 'D:\\Apps\\Transub.Editor.exe');
    });

    it('assembles shelfOpenAfterBatch', () => {
        const off = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(off.shelfOpenAfterBatch, false);
        const on = saved.assembleSavedOptionsFromFields({ shelfOpenAfterBatch: true }, norm);
        assert.strictEqual(on.shelfOpenAfterBatch, true);
    });

    it('assembles output track write prefs and target naming', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.outputWriteTarget, true);
        assert.strictEqual(def.outputWriteSource, true);
        assert.strictEqual(def.targetSubtitleNaming, 'lang');
        const media = saved.assembleSavedOptionsFromFields({
            outputWriteTarget: true,
            outputWriteSource: true,
            targetSubtitleNaming: 'media',
        }, norm);
        assert.strictEqual(media.outputWriteTarget, true);
        assert.strictEqual(media.outputWriteSource, true);
        assert.strictEqual(media.targetSubtitleNaming, 'media');
        const sourceOnly = saved.assembleSavedOptionsFromFields({
            outputWriteTarget: false,
            outputWriteSource: true,
        }, norm);
        assert.strictEqual(sourceOnly.outputWriteTarget, false);
        assert.strictEqual(sourceOnly.outputWriteSource, true);
        const bothOff = saved.assembleSavedOptionsFromFields({
            outputWriteTarget: false,
            outputWriteSource: false,
        }, norm);
        assert.strictEqual(bothOff.outputWriteTarget, true);
        assert.strictEqual(bothOff.outputWriteSource, false);
        const targetOnly = saved.assembleSavedOptionsFromFields({
            outputWriteTarget: true,
            outputWriteSource: false,
        }, norm);
        assert.strictEqual(targetOnly.outputWriteTarget, true);
        assert.strictEqual(targetOnly.outputWriteSource, false);
    });

    it('assembles burn encode settings keys', () => {
        const out = saved.assembleSavedOptionsFromFields({
            burnContainer: 'mkv',
            burnEncoderId: 'h264_nvenc',
            burnAudioMode: 'aac',
            burnCrf: 22,
            burnResolutionId: '720p',
            burnFpsId: '24',
            burnEncodeSpeedId: 'fast',
            burnOutputSuffix: 'softsub',
            burnOutputDir: ' D:\\Out ',
        }, norm);
        assert.strictEqual(out.burnContainer, 'mkv');
        assert.strictEqual(out.burnEncoderId, 'h264_nvenc');
        assert.strictEqual(out.burnAudioMode, 'aac');
        assert.strictEqual(out.burnCrf, 22);
        assert.strictEqual(out.burnResolutionId, '720p');
        assert.strictEqual(out.burnFpsId, '24');
        assert.strictEqual(out.burnEncodeSpeedId, 'fast');
        assert.strictEqual(out.burnOutputSuffix, 'softsub');
        assert.strictEqual(out.burnOutputDir, 'D:\\Out');
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.burnContainer, 'mp4');
        assert.strictEqual(def.burnEncoderId, 'libx264');
        assert.strictEqual(def.burnAudioMode, 'copy');
        assert.strictEqual(def.burnCrf, 18);
        assert.strictEqual(def.burnOutputSuffix, 'burned');
        assert.strictEqual(def.burnOutputDir, '');
    });

    it('assembles autoCpuOnGpuBusy (default off)', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.autoCpuOnGpuBusy, false);
        const on = saved.assembleSavedOptionsFromFields({ autoCpuOnGpuBusy: true }, norm);
        assert.strictEqual(on.autoCpuOnGpuBusy, true);
        const off = saved.assembleSavedOptionsFromFields({ autoCpuOnGpuBusy: false }, norm);
        assert.strictEqual(off.autoCpuOnGpuBusy, false);
    });

    it('persists githubMirrorUrls from textarea (one per line)', () => {
        const filled = saved.assembleSavedOptionsFromFields({
            githubMirrorsText: 'g.blfrp.cn\nhttps://ghproxy.net\ng.blfrp.cn\n',
        }, norm);
        assert.deepStrictEqual(filled.githubMirrorUrls, [
            'https://g.blfrp.cn/',
            'https://ghproxy.net/',
        ]);
        const cleared = saved.assembleSavedOptionsFromFields({
            githubMirrorsText: '',
        }, norm);
        assert.deepStrictEqual(cleared.githubMirrorUrls, []);
    });

    it('persists wizardContentTypes and wizardTargetLangs', () => {
        const out = saved.assembleSavedOptionsFromFields({
            wizardPresetIds: ['ja-av-anime-whisper-firered', 'film-sensevoice'],
            wizardTargetLangs: ['zh-Hans', 'en', 'zh-Hant-TW'],
        }, norm);
        assert.deepStrictEqual(out.wizardPresetIds, ['ja-av-anime-whisper-firered', 'film-sensevoice']);
        assert.deepStrictEqual(out.wizardContentTypes, ['ja-av-anime-whisper-firered', 'film-sensevoice']);
        assert.deepStrictEqual(out.wizardTargetLangs, ['zh-Hans', 'en']);
    });

    it('persists Transub Station options', () => {
        const def = saved.assembleSavedOptionsFromFields({}, norm);
        assert.strictEqual(def.transubStationEnabled, false);
        assert.strictEqual(def.transubStationUrl, 'http://127.0.0.1:8787');
        assert.strictEqual(def.transubStationModel, '');

        const on = saved.assembleSavedOptionsFromFields({
            transubStationEnabled: true,
            transubStationUrl: '192.168.31.107:8787/v1',
            transubStationModel: 'Sakura-14B',
        }, norm);
        assert.strictEqual(on.transubStationEnabled, true);
        assert.strictEqual(on.transubStationUrl, 'http://192.168.31.107:8787');
        assert.strictEqual(on.transubStationModel, 'Sakura-14B');
    });
});
