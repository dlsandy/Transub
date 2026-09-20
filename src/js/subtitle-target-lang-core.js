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
