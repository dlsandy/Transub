/**
 * Cantonese preset apply — 原文→transcribe; 简繁→translate (粤→普通话).
 */
const assert = require('assert');
const {
    YUE_BUILTIN_PRESET_ID,
    TIP_MESSAGE,
    isYueSourceLanguage,
    shouldForceTranscribeTask,
    mergeYueTranscribeTask,
    inferLanguageFromPresetId,
    resolvePresetSourceLanguage,
} = require('../src/js/preset-yue-transcribe-core');
const { BUILTIN_PRESETS, sanitizePresetOptions } = require('../electron/presets-data');

describe('preset-yue-transcribe-core', () => {
    it('recognizes yue language aliases', () => {
        assert.strictEqual(isYueSourceLanguage('yue'), true);
        assert.strictEqual(isYueSourceLanguage('zh-yue'), true);
        assert.strictEqual(isYueSourceLanguage('Cantonese'), true);
        assert.strictEqual(isYueSourceLanguage('zh'), false);
    });

    it('forces transcribe for yue + 原文 chip', () => {
        assert.strictEqual(
            shouldForceTranscribeTask({
                presetId: YUE_BUILTIN_PRESET_ID,
                options: { language: 'yue', subtitleTargetChip: 'source', task: 'translate' },
            }),
            true,
        );
        const result = mergeYueTranscribeTask(
            {
                language: 'yue',
                task: 'translate',
                subtitleTargetChip: 'source',
                engineAsrModel: 'qwen3-asr-1.7b',
            },
            { presetId: YUE_BUILTIN_PRESET_ID },
        );
        assert.strictEqual(result.changed, true);
        assert.strictEqual(result.options.task, 'transcribe');
        assert.strictEqual(result.tipMessage, TIP_MESSAGE);
        assert.strictEqual(result.options.language, 'yue');
    });

    it('does not force transcribe for yue + 简体 (粤→普通话)', () => {
        assert.strictEqual(
            shouldForceTranscribeTask({
                presetId: YUE_BUILTIN_PRESET_ID,
                options: { language: 'yue', subtitleTargetChip: 'simplified', task: 'translate' },
            }),
            false,
        );
        const result = mergeYueTranscribeTask(
            {
                language: 'yue',
                task: 'translate',
                subtitleTargetChip: 'simplified',
                engineAsrModel: 'qwen3-asr-1.7b',
            },
            { presetId: YUE_BUILTIN_PRESET_ID },
        );
        assert.strictEqual(result.options.task, 'translate');
        assert.strictEqual(result.options.language, 'yue');
        assert.strictEqual(result.tipMessage, '');
    });

    it('keeps dual when yue + translate-like target without chip', () => {
        const result = mergeYueTranscribeTask({ language: 'yue', task: 'dual' }, {});
        assert.strictEqual(result.options.task, 'dual');
        assert.strictEqual(result.options.language, 'yue');
    });

    it('does not force for Mandarin / other languages', () => {
        assert.strictEqual(
            shouldForceTranscribeTask({ presetId: 'zh-sensevoice', options: { language: 'zh' } }),
            false,
        );
        const result = mergeYueTranscribeTask(
            { language: 'zh', task: 'translate' },
            { presetId: 'zh-sensevoice' },
        );
        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.options.task, 'translate');
        assert.strictEqual(result.tipMessage, '');
    });

    it('is silent when already transcribe + 原文', () => {
        const result = mergeYueTranscribeTask(
            { language: 'yue', task: 'transcribe', subtitleTargetChip: 'source' },
            { presetId: YUE_BUILTIN_PRESET_ID },
        );
        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.options.task, 'transcribe');
        assert.strictEqual(result.tipMessage, '');
    });

    it('builtin Cantonese preset does not persist task in options', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === YUE_BUILTIN_PRESET_ID);
        assert.ok(p);
        assert.strictEqual(p.options.language, 'yue');
        assert.strictEqual(p.options.engineAsrModel, 'qwen3-asr-1.7b');
        assert.strictEqual(p.options.timingAlignModel, 'qwen3-forced-aligner-0.6b');
        assert.strictEqual(p.options.task, undefined);
        const cleaned = sanitizePresetOptions({ ...p.options, task: 'translate' });
        assert.strictEqual(cleaned.task, undefined);
    });

    it('Cantonese song preset keeps translate for 简体 and still sets karaoke flags', () => {
        const p = BUILTIN_PRESETS.find((x) => x.id === 'zh-yue-qwen3-song');
        assert.ok(p);
        const result = mergeYueTranscribeTask(
            { ...p.options, task: 'translate', subtitleTargetChip: 'simplified' },
            { presetId: p.id },
        );
        assert.strictEqual(result.options.task, 'translate');
        assert.strictEqual(result.options.singingKaraoke, true);
        assert.strictEqual(sanitizePresetOptions({ ...p.options, task: 'dual' }).task, undefined);
    });

    it('song preset id forces language=yue and disables film enhance even from auto', () => {
        const result = mergeYueTranscribeTask(
            {
                language: 'auto',
                task: 'transcribe',
                subtitleTargetChip: 'source',
                filmAudioEnhance: true,
                enhanceForVadOnly: true,
            },
            { presetId: 'zh-yue-qwen3-song' },
        );
        assert.strictEqual(result.changed, true);
        assert.strictEqual(result.options.language, 'yue');
        assert.strictEqual(result.options.task, 'transcribe');
        assert.strictEqual(result.options.filmAudioEnhance, false);
        assert.strictEqual(result.options.enhanceForVadOnly, false);
        assert.strictEqual(result.options.singingKaraoke, true);
        assert.ok(String(result.tipMessage || '').length > 0);
    });

    it('infers 片源 from ja/ko/zh/yue preset ids', () => {
        assert.strictEqual(inferLanguageFromPresetId('ja-av-anime-whisper-firered'), 'ja');
        assert.strictEqual(inferLanguageFromPresetId('ko-sensevoice'), 'ko');
        assert.strictEqual(inferLanguageFromPresetId('zh-sensevoice'), 'zh');
        assert.strictEqual(inferLanguageFromPresetId('zh-yue-qwen3'), 'yue');
        // Western presets use film-* ids; language comes from options.language.
        assert.strictEqual(inferLanguageFromPresetId('film-sensevoice'), '');
    });

    it('applying ja/ko/en presets switches language without forcing transcribe', () => {
        const ja = mergeYueTranscribeTask(
            { language: 'auto', task: 'translate' },
            { presetId: 'ja-av-anime-whisper-firered' },
        );
        assert.strictEqual(ja.options.language, 'ja');
        assert.strictEqual(ja.options.task, 'translate');
        assert.strictEqual(ja.changed, true);

        const ko = mergeYueTranscribeTask(
            { language: 'ja', task: 'dual' },
            { presetId: 'ko-sensevoice' },
        );
        assert.strictEqual(ko.options.language, 'ko');
        assert.strictEqual(ko.options.task, 'dual');

        const en = mergeYueTranscribeTask(
            { language: 'en', task: 'translate' },
            { presetId: 'film-sensevoice' },
        );
        assert.strictEqual(en.options.language, 'en');
        assert.strictEqual(en.options.task, 'translate');
        // No builtin id → fall back to options.language
        assert.strictEqual(resolvePresetSourceLanguage({ language: 'yue' }, 'custom-1'), 'yue');
    });
});
