/**
 * Preset film-audio gate — strip Pro / Demucs flags on apply.
 */
const assert = require('assert');
const {
    stripFilmAudioFromPresetOptions,
    buildStripToastMessages,
    isDemucsReadyFromProbe,
} = require('../src/js/preset-film-audio-gate-core');

describe('preset-film-audio-gate-core', () => {
    it('strips film enhance when not entitled', () => {
        const result = stripFilmAudioFromPresetOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
            language: 'ja',
        }, { entitled: false, demucsReady: true });
        assert.strictEqual(result.changed, true);
        assert.deepStrictEqual(result.reasons, ['pro']);
        assert.strictEqual(result.options.filmAudioEnhance, false);
        assert.strictEqual(result.options.enhanceForVadOnly, false);
        assert.strictEqual(result.options.language, 'ja');
        assert.strictEqual(result.strippedFilm, true);
    });

    it('strips film enhance when Demucs is missing (Pro)', () => {
        const result = stripFilmAudioFromPresetOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
        }, { entitled: true, demucsReady: false });
        assert.strictEqual(result.changed, true);
        assert.deepStrictEqual(result.reasons, ['demucs']);
        assert.strictEqual(result.options.filmAudioEnhance, false);
        assert.strictEqual(result.options.enhanceForVadOnly, false);
    });

    it('keeps film enhance when Pro and Demucs ready', () => {
        const result = stripFilmAudioFromPresetOptions({
            filmAudioEnhance: true,
            enhanceForVadOnly: true,
        }, { entitled: true, demucsReady: true });
        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.options.filmAudioEnhance, true);
        assert.strictEqual(result.options.enhanceForVadOnly, true);
    });

    it('strips filmVadPreset when not entitled without needing Demucs', () => {
        const result = stripFilmAudioFromPresetOptions({
            filmVadPreset: true,
            filmAudioEnhance: false,
        }, { entitled: false, demucsReady: false });
        assert.strictEqual(result.changed, true);
        assert.deepStrictEqual(result.reasons, ['pro']);
        assert.strictEqual(result.options.filmVadPreset, false);
        assert.strictEqual(result.strippedVad, true);
    });

    it('keeps filmVadPreset when entitled even if Demucs missing', () => {
        const result = stripFilmAudioFromPresetOptions({
            filmVadPreset: true,
        }, { entitled: true, demucsReady: false });
        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.options.filmVadPreset, true);
    });

    it('builds toast messages for pro and demucs', () => {
        assert.deepStrictEqual(
            buildStripToastMessages(['pro'], { strippedFilm: true }),
            ['预设含「影视音频增强」，当前未解锁 Pro，已自动关闭'],
        );
        assert.deepStrictEqual(
            buildStripToastMessages(['pro'], { strippedVad: true }),
            ['预设含「影视 VAD」，当前未解锁 Pro，已自动关闭'],
        );
        assert.deepStrictEqual(
            buildStripToastMessages(['demucs']),
            ['未安装 Demucs，已自动关闭「影视音频增强」。可在模型管理中下载'],
        );
    });

    it('detects Demucs readiness from probe', () => {
        assert.strictEqual(isDemucsReadyFromProbe({ ok: true, status: 'ready' }), true);
        assert.strictEqual(isDemucsReadyFromProbe({ ok: true, status: 'partial' }), true);
        assert.strictEqual(isDemucsReadyFromProbe({ ok: false, status: 'ready' }), false);
        assert.strictEqual(isDemucsReadyFromProbe({ ok: true, status: 'missing' }), false);
        assert.strictEqual(
            isDemucsReadyFromProbe({ ok: true, status: 'x' }, {
                isDemucsRuntimeUsable: () => true,
            }),
            true,
        );
    });
});
