/**
 * Subtitle output target language (成片目标语) — independent of UI uiLocale.
 * Canonical codes: zh-Hans | zh-Hant | zh-Hant-TW | zh-Hant-HK | en | ja | ko
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleTargetLang = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleTargetLangFactory() {
    const SUBTITLE_TARGET_LANGS = Object.freeze([
        'zh-Hans',
        'zh-Hant',
        'zh-Hant-TW',
        'zh-Hant-HK',
        'en',
        'ja',
        'ko',
    ]);

    const ZH_FAMILY = Object.freeze(new Set([
        'zh-Hans',
        'zh-Hant',
        'zh-Hant-TW',
        'zh-Hant-HK',
    ]));

    /** Select / settings form values (legacy chineseSubtitleVariant + intl). */
    const FORM_TARGET_VALUES = Object.freeze([
        'simplified',
        'traditional',
        'traditional-tw',
        'traditional-hk',
        'en',
        'ja',
        'ko',
    ]);

    /** Main-window 目标 chip: 原文 = 仅转写（task=transcribe），不写入成片目标语。 */
    const SOURCE_TARGET_FORM_VALUE = 'source';

    function isSourceTargetFormValue(raw) {
        const v = String(raw || '').trim().toLowerCase();
        return v === SOURCE_TARGET_FORM_VALUE
            || v === 'original'
            || v === 'transcribe'
            || v === '源文'
            || v === '原文';
    }

    /** Cantonese ASR already emits Chinese characters (no JA/EN MT pair). */
    function isYueSourceLanguage(raw) {
        const lang = String(raw || '').trim().toLowerCase();
        return lang === 'yue' || lang === 'zh-yue' || lang === 'cantonese';
    }

    /**
     * Normalize source language codes. Keep `zh-yue` / cantonese as `yue`
     * (must run before split('-')[0] which would collapse to `zh`).
     */
    function normalizeSourceLanguageCode(raw) {
        const full = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
        if (!full || full === 'auto' || full === 'unknown') return '';
        if (isYueSourceLanguage(full)) return 'yue';
        if (full === 'jp' || full === 'jpn' || full === 'japanese') return 'ja';
        if (full === 'eng' || full === 'english') return 'en';
        if (full === 'kr' || full === 'kor' || full === 'korean') return 'ko';
        if (full === 'cn' || full === 'chinese' || full === 'zh-cn' || full === 'zh-hans') return 'zh';
        const s = full.split(/[-_]/)[0];
        if (!s || s === 'auto' || s === 'unknown') return '';
        return s;
    }

    /** Written Cantonese particle heuristic (simplified ASR forms). */
    function cuesLookLikeWrittenCantonese(cuesOrText) {
        const sample = typeof cuesOrText === 'string'
            ? cuesOrText
            : (Array.isArray(cuesOrText) ? cuesOrText : [])
                .slice(0, 48)
                .map((c) => String(c?.text || ''))
                .join('');
        if (!sample.trim()) return false;
        const hits = (sample.match(/[嘅佢喺啲唔哋冇嚟嗰噉嘢]/g) || []).length;
        return hits >= 2;
    }

    /**
     * Use Yue→Mandarin prompts when language is yue, or zh/auto/empty + cue heuristic.
     * @param {string|object} langOrOptions
     * @param {Array|{text?:string}|string|null} [chunkCues]
     */
    function shouldUseYueToMandarinPrompt(langOrOptions, chunkCues = null) {
        let lang = '';
        let cues = chunkCues;
        if (langOrOptions && typeof langOrOptions === 'object' && !Array.isArray(langOrOptions)) {
            lang = String(langOrOptions.language || langOrOptions.sourceLanguage || '').trim().toLowerCase();
            if (cues == null && Array.isArray(langOrOptions.cues)) cues = langOrOptions.cues;
        } else {
            lang = String(langOrOptions || '').trim().toLowerCase();
        }
        if (isYueSourceLanguage(lang)) return true;
        const n = normalizeSourceLanguageCode(lang);
        if (n && n !== 'zh' && n !== 'yue') return false;
        return cuesLookLikeWrittenCantonese(cues);
    }

    /** Short lock line for chat / Qwen / smart prompts. */
    function yueToMandarinPromptLock() {
        return '片源为粤语书面语：必须译成普通话简体中文，须改写粤语特有用法，禁止照抄粤语原文。';
    }

    /** Form chip / settings values that stay in the Chinese script family. */
    function isZhSubtitleFormValue(raw) {
        if (isSourceTargetFormValue(raw)) return false;
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return false;
        if (v === 'en' || v === 'ja' || v === 'ko') return false;
        if (
            v === 'simplified' || v === 'traditional'
            || v === 'traditional-tw' || v === 'traditional-hk' || v === 'traditional-twp'
        ) {
            return true;
        }
        return isZhSubtitleTarget(v);
    }

    /**
     * Yue + 原文：仅听写，不跑机器/推理翻译。
     * Yue + 简体/繁体：走翻译（粤语书面→普通话；繁体再按需 OpenCC）。
     * Yue + en/ja/ko：仍走翻译任务。
     */
    function yueTargetSkipsMachineTranslate(sourceLang, targetForm) {
        if (!isYueSourceLanguage(sourceLang)) return false;
        return isSourceTargetFormValue(targetForm);
    }

    function normalizeSubtitleTargetLang(raw) {
        const t = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
        if (!t) return '';
        if (
            t === 'zh-hans' || t === 'zh-cn' || t === 'zh-sg' || t === 'cn'
            || t === 'simplified' || t === 'hans'
        ) {
            return 'zh-Hans';
        }
        if (t === 'zh-hant-tw' || t === 'traditional-tw' || t === 'tw') {
            return 'zh-Hant-TW';
        }
        if (t === 'zh-hant-hk' || t === 'traditional-hk' || t === 'hk') {
            return 'zh-Hant-HK';
        }
        if (
            t === 'zh-hant' || t === 'zh-tw' || t === 'traditional'
            || t === 'traditional-twp' || t === 'twp' || t === 'hant'
        ) {
            return 'zh-Hant';
        }
        if (t === 'zh' || t === 'chinese') return 'zh-Hans';
        if (t === 'en' || t === 'eng' || t === 'english') return 'en';
        if (t === 'ja' || t === 'jp' || t === 'jpn' || t === 'japanese') return 'ja';
        if (t === 'ko' || t === 'kr' || t === 'kor' || t === 'korean') return 'ko';
        if (SUBTITLE_TARGET_LANGS.includes(String(raw || '').trim())) {
            return String(raw).trim();
        }
        return '';
    }

    function isZhSubtitleTarget(lang) {
        const n = normalizeSubtitleTargetLang(lang) || String(lang || '').trim();
        return ZH_FAMILY.has(n) || n === 'zh' || /^zh[-_]/i.test(String(lang || ''));
    }

    /**
     * Map form / legacy chineseSubtitleVariant value → canonical target lang.
     */
    function targetLangFromFormValue(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return '';
        if (v === 'en' || v === 'ja' || v === 'ko') return v;
        return normalizeSubtitleTargetLang(v);
    }

    /**
     * Canonical target → form select value (keeps OpenCC variant keys for zh).
     */
    function formValueFromTargetLang(lang) {
        const n = normalizeSubtitleTargetLang(lang) || 'zh-Hans';
        if (n === 'en' || n === 'ja' || n === 'ko') return n;
        if (n === 'zh-Hant-HK') return 'traditional-hk';
        if (n === 'zh-Hant-TW') return 'traditional-tw';
        if (n === 'zh-Hant') return 'traditional';
        return 'simplified';
    }

    /**
     * When target is Chinese, which OpenCC / post-batch variant to use.
     * Non-zh → 'simplified' (unused; callers should skip Hans/Hant convert).
     */
    function chineseSubtitleVariantFromTargetLang(lang) {
        const form = formValueFromTargetLang(lang);
        if (form === 'en' || form === 'ja' || form === 'ko') return 'simplified';
        return form;
    }

    /**
     * Resolve 成片目标语 from task/options. Does not read uiLocale.
     * Precedence: subtitleTargetLang → targetLang → targetLanguage → translateTarget
     * → nonChineseTarget → chineseSubtitleVariant → default zh-Hans.
     */
    function resolveSubtitleTargetLang(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const candidates = [
            o.subtitleTargetLang,
            o.targetLang,
            o.targetLanguage,
            o.translateTarget,
            o.nonChineseTarget,
            o.chineseSubtitleVariant,
        ];
        for (const c of candidates) {
            const n = normalizeSubtitleTargetLang(c);
            if (n) return n;
            const fromForm = targetLangFromFormValue(c);
            if (fromForm) return fromForm;
        }
        return 'zh-Hans';
    }

    /**
     * Normalize persisted subtitleTargetLang; empty/invalid → derive or zh-Hans.
     */
    function normalizePersistedSubtitleTargetLang(raw, fallbackVariant = 'simplified') {
        const n = normalizeSubtitleTargetLang(raw) || targetLangFromFormValue(raw);
        if (n) return n;
        return targetLangFromFormValue(fallbackVariant) || 'zh-Hans';
    }

    /**
     * Which sanitize layers to run for a target language.
     * zh* keeps full deep path; intl gets light QA only.
     */
    function sanitizeLayersForTarget(lang) {
        const resolved = normalizeSubtitleTargetLang(lang) || resolveSubtitleTargetLang({ targetLang: lang });
        const zhDeep = isZhSubtitleTarget(resolved);
        return Object.freeze({
            lang: resolved || 'zh-Hans',
            zhDeep,
            /** JA ASR domain on source cues (language of source, not target). */
            jaSourceFix: true,
            stripArtifacts: true,
            nameUnify: true,
            lightFluency: true,
            /** ZH wet-SFX / lemma→中文 / opaque / domain / blank recover / trained remaps */
            zhWetSfx: zhDeep,
            zhPolish: zhDeep,
            zhDomain: zhDeep,
            zhNsfwLexicon: zhDeep,
            zhBlankRecover: zhDeep,
            zhHonorific: zhDeep,
            zhTrainedRemap: zhDeep,
        });
    }

    function resolveSanitizeLayers(options = {}) {
        const lang = resolveSubtitleTargetLang(options);
        return sanitizeLayersForTarget(lang);
    }

    /** Human label for prompts / logs (not UI i18n). */
    function subtitleTargetLangLabel(lang) {
        const n = normalizeSubtitleTargetLang(lang) || 'zh-Hans';
        if (n === 'en') return 'English';
        if (n === 'ja') return '日本語';
        if (n === 'ko') return '한국어';
        if (n === 'zh-Hant-HK') return '繁体中文（香港）';
        if (n === 'zh-Hant-TW') return '繁体中文（台湾字形）';
        if (n === 'zh-Hant') return '繁体中文（台湾）';
        return '简体中文';
    }

    function isIntlSubtitleFormValue(raw) {
        const v = String(raw || '').trim().toLowerCase();
        return v === 'en' || v === 'ja' || v === 'ko';
    }

    /**
     * Fields to merge into Sakura / smart-translate / reconstruct IPC payloads.
     * Keeps chineseSubtitleVariant (form) for OpenCC + legacy callers.
     */
    function buildTargetLangPayloadFields(options = {}) {
        const lang = resolveSubtitleTargetLang(options);
        const form = formValueFromTargetLang(lang);
        const label = subtitleTargetLangLabel(lang);
        const zh = isZhSubtitleTarget(lang);
        return {
            subtitleTargetLang: lang,
            targetLang: lang,
            targetLanguage: label,
            chineseSubtitleVariant: form,
            translateTarget: label,
            nonChineseTarget: zh ? '' : lang,
        };
    }

    /** Select options for editor / main quick target chip (form values). */
    function listTargetLangFormOptions() {
        return Object.freeze([
            { value: 'simplified', label: '简体中文' },
            { value: 'traditional', label: '繁体(台湾)' },
            { value: 'traditional-tw', label: '繁体(字形)' },
            { value: 'traditional-hk', label: '繁体(香港)' },
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
        ]);
    }

    return {
        SUBTITLE_TARGET_LANGS,
        FORM_TARGET_VALUES,
        SOURCE_TARGET_FORM_VALUE,
        isSourceTargetFormValue,
        isYueSourceLanguage,
        normalizeSourceLanguageCode,
        cuesLookLikeWrittenCantonese,
        shouldUseYueToMandarinPrompt,
        yueToMandarinPromptLock,
        isZhSubtitleFormValue,
        yueTargetSkipsMachineTranslate,
        normalizeSubtitleTargetLang,
        isZhSubtitleTarget,
        targetLangFromFormValue,
        formValueFromTargetLang,
        chineseSubtitleVariantFromTargetLang,
        resolveSubtitleTargetLang,
        normalizePersistedSubtitleTargetLang,
        sanitizeLayersForTarget,
        resolveSanitizeLayers,
        subtitleTargetLangLabel,
        isIntlSubtitleFormValue,
        buildTargetLangPayloadFields,
        listTargetLangFormOptions,
    };
}));
