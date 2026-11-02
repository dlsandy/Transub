/**
 * Scene-preset apply side-effects:
 * - Force 片源 language from preset (ja / ko / en / yue / zh)
 * - Cantonese + 原文: force task=transcribe (skip MT)
 * - Cantonese + 简/繁/外文: keep translate (粤→普通话 / 外文)
 *
 * Does not store `task` on preset JSON (still PRESET_SKIP_KEYS); only mutates the
 * apply-time options merge that goes into the form / settings.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPresetYueTranscribe = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function presetYueTranscribeFactory() {
    const YUE_BUILTIN_PRESET_ID = 'zh-yue-qwen3';
    const YUE_SONG_PRESET_ID = 'zh-yue-qwen3-song';
    const TIP_MESSAGE = '粤语听写：目标为原文，跳过翻译';
    const SONG_TIP_MESSAGE = '粤语歌曲：已切粤语并开启演唱后处理';
    const PRESET_SOURCE_LANGS = Object.freeze(['ja', 'ko', 'en', 'yue', 'zh']);

    function isYueSourceLanguage(language) {
        const lang = String(language || '').trim().toLowerCase();
        return lang === 'yue' || lang === 'zh-yue' || lang === 'cantonese';
    }

    function isSourceTargetForm(raw) {
        const v = String(raw || '').trim().toLowerCase();
        return !v || v === 'source' || v === 'original' || v === 'transcribe' || v === '原文' || v === '源文';
    }

    /** Resolve 目标 chip/form for the Yue transcribe-vs-translate gate. */
    function resolveYueTargetForm(options = {}) {
        const chip = String(options.subtitleTargetChip || '').trim();
        if (chip) return chip;
        const task = String(options.task || '').trim();
        if (task === 'translate' || task === 'dual') {
            return String(
                options.chineseSubtitleVariant
                || options.subtitleTargetLang
                || 'simplified',
            ).trim() || 'simplified';
        }
        return 'source';
    }

    function isYueBuiltinPresetId(presetId) {
        const id = String(presetId || '').trim();
        return id === YUE_BUILTIN_PRESET_ID || id === YUE_SONG_PRESET_ID;
    }

    function normalizePresetSourceLang(raw) {
        const lang = String(raw || '').trim().toLowerCase();
        if (lang === 'jp' || lang === 'jpn' || lang === 'japanese') return 'ja';
        if (lang === 'kr' || lang === 'kor' || lang === 'korean') return 'ko';
        if (lang === 'eng' || lang === 'english') return 'en';
        if (lang === 'zh-yue' || lang === 'cantonese') return 'yue';
        if (lang === 'cn' || lang === 'chinese' || lang === 'zh-cn' || lang === 'zh-hans') return 'zh';
        if (PRESET_SOURCE_LANGS.includes(lang)) return lang;
        return '';
    }

    /** Infer 片源 from stable builtin preset ids when options.language is missing. */
    function inferLanguageFromPresetId(presetId) {
        const id = String(presetId || '').trim().toLowerCase();
        if (!id) return '';
        if (id === YUE_BUILTIN_PRESET_ID || id === YUE_SONG_PRESET_ID
            || id.startsWith('zh-yue') || id.includes('-yue-')) {
            return 'yue';
        }
        if (id.startsWith('ja-') || id.includes('-ja-')) return 'ja';
        if (id.startsWith('ko-') || id.includes('-ko-')) return 'ko';
        if (id.startsWith('en-') || id.includes('-en-')) return 'en';
        if (id.startsWith('zh-')) return 'zh';
        return '';
    }

    function resolvePresetSourceLanguage(options = {}, presetId = '') {
        // Builtin id wins so switching ja→ko/en presets always retargets 片源,
        // even when the previous form language is still merged into options.
        const fromId = inferLanguageFromPresetId(presetId);
        if (fromId) return fromId;
        return normalizePresetSourceLang(options?.language);
    }

    /**
     * @param {{ presetId?: string, options?: object }} [ctx]
     */
    function shouldForceTranscribeTask(ctx = {}) {
        const presetId = String(ctx.presetId || '').trim();
        const options = ctx.options && typeof ctx.options === 'object' ? ctx.options : {};
        const lang = resolvePresetSourceLanguage(options, presetId)
            || (isYueBuiltinPresetId(presetId) ? 'yue' : '');
        if (!isYueSourceLanguage(lang)) return false;
        const targetForm = resolveYueTargetForm(options);
        try {
            const tgt = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-target-lang-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleTargetLang : null);
            if (typeof tgt?.yueTargetSkipsMachineTranslate === 'function') {
                return !!tgt.yueTargetSkipsMachineTranslate(lang, targetForm);
            }
        } catch { /* optional */ }
        return isSourceTargetForm(targetForm);
    }

    /**
     * Merge 片源 language + Cantonese transcribe side-effects into apply-time options.
     * @param {object} options full options about to apply to the form
     * @param {{ presetId?: string }} [ctx]
     * @returns {{ options: object, changed: boolean, tipMessage: string }}
     */
    function mergeYueTranscribeTask(options, ctx = {}) {
        const out = options && typeof options === 'object' ? { ...options } : {};
        const presetId = String(ctx.presetId || '').trim();
        let changed = false;
        let tipMessage = '';

        const wantLang = resolvePresetSourceLanguage(out, presetId);
        if (wantLang) {
            const prevLang = String(out.language || '').trim().toLowerCase();
            if (prevLang !== wantLang) {
                out.language = wantLang;
                changed = true;
            }
        }

        const forceTranscribe = shouldForceTranscribeTask({ presetId, options: out });
        if (forceTranscribe) {
            const prevTask = String(out.task || '').trim();
            if (prevTask !== 'transcribe') {
                out.task = 'transcribe';
                changed = true;
            }
            if (!isYueSourceLanguage(out.language)) {
                out.language = 'yue';
                changed = true;
            }
        } else if (isYueBuiltinPresetId(presetId) || isYueSourceLanguage(out.language)) {
            if (!isYueSourceLanguage(out.language)) {
                out.language = 'yue';
                changed = true;
            }
        }

        // Song: turn off film Demucs enhance (settings-owned, stripped from preset JSON).
        if (presetId === YUE_SONG_PRESET_ID) {
            if (out.filmAudioEnhance !== false) {
                out.filmAudioEnhance = false;
                changed = true;
            }
            if (out.enhanceForVadOnly !== false) {
                out.enhanceForVadOnly = false;
                changed = true;
            }
            if (out.singingKaraoke !== true) {
                out.singingKaraoke = true;
                changed = true;
            }
        }
        if (changed) {
            if (presetId === YUE_SONG_PRESET_ID) {
                tipMessage = SONG_TIP_MESSAGE;
            } else if (forceTranscribe) {
                tipMessage = TIP_MESSAGE;
            }
        }
        return {
            options: out,
            changed,
            tipMessage,
        };
    }

    return {
        YUE_BUILTIN_PRESET_ID,
        YUE_SONG_PRESET_ID,
        TIP_MESSAGE,
        SONG_TIP_MESSAGE,
        PRESET_SOURCE_LANGS,
        isYueSourceLanguage,
        isYueBuiltinPresetId,
        normalizePresetSourceLang,
        inferLanguageFromPresetId,
        resolvePresetSourceLanguage,
        resolveYueTargetForm,
        shouldForceTranscribeTask,
        mergeYueTranscribeTask,
    };
}));
