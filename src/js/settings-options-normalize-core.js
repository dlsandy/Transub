/**
 * Settings option normalize / clamp helpers (pure — no DOM).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsOptionsNormalize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsOptionsNormalizeFactory() {
    const POST_BATCH_QC_FIX_MODES = Object.freeze(['none', 'fix', 'smart']);
    const VIEWING_CLEAN_MODES = Object.freeze(['off', 'light', 'clear']);
    const CHINESE_SUBTITLE_VARIANTS = Object.freeze([
        'simplified',
        'traditional',
        'traditional-tw',
        'traditional-hk',
    ]);
    const SUBTITLE_BAK_MODES = Object.freeze(['off', 'beside', 'appBackup']);
    const AUTO_UPDATE_INTERVALS = Object.freeze(['off', 'daily', 'weekly', 'monthly']);

    function numOrFinite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizePostBatchQcFixMode(value) {
        const mode = String(value || '').trim().toLowerCase();
        return POST_BATCH_QC_FIX_MODES.includes(mode) ? mode : 'none';
    }

    function normalizeViewingCleanMode(value, fallback = 'clear') {
        const mode = String(value || '').trim().toLowerCase();
        if (VIEWING_CLEAN_MODES.includes(mode)) return mode;
        return VIEWING_CLEAN_MODES.includes(fallback) ? fallback : 'clear';
    }

    function normalizeChineseSubtitleVariant(raw) {
        const cv = String(raw || 'simplified');
        return CHINESE_SUBTITLE_VARIANTS.includes(cv) ? cv : 'simplified';
    }

    function chineseSubtitleVariantLabel(variant) {
        if (variant === 'simplified') return '转简体';
        if (variant === 'traditional-hk') return '转繁体（香港）';
        if (variant === 'traditional-tw') return '转繁体（台湾字形）';
        return '转繁体（台湾）';
    }

    function loadSubtitleTargetLangApi() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./subtitle-target-lang-core');
            }
        } catch { /* optional */ }
        return (typeof globalThis !== 'undefined' && globalThis.TransubSubtitleTargetLang)
            || null;
    }

    /**
     * Persistable 成片目标语 (independent of uiLocale).
     * Accepts canonical codes or legacy form values (simplified / en / …).
     */
    function normalizeSubtitleTargetLang(value, fallbackVariant = 'simplified') {
        const api = loadSubtitleTargetLangApi();
        if (api?.normalizePersistedSubtitleTargetLang) {
            return api.normalizePersistedSubtitleTargetLang(value, fallbackVariant);
        }
        const v = String(value || '').trim().toLowerCase();
        if (v === 'en' || v === 'ja' || v === 'ko') return v;
        if (v === 'zh-hans' || v === 'simplified') return 'zh-Hans';
        if (v === 'zh-hant-hk' || v === 'traditional-hk') return 'zh-Hant-HK';
        if (v === 'zh-hant-tw' || v === 'traditional-tw') return 'zh-Hant-TW';
        if (v === 'zh-hant' || v === 'traditional') return 'zh-Hant';
        const fromVariant = normalizeChineseSubtitleVariant(fallbackVariant);
        if (fromVariant === 'traditional-hk') return 'zh-Hant-HK';
        if (fromVariant === 'traditional-tw') return 'zh-Hant-TW';
        if (fromVariant === 'traditional') return 'zh-Hant';
        return 'zh-Hans';
    }

    /**
     * Form select value for 目标语言 chip / settings (legacy variant keys + en/ja/ko).
     */
    function normalizeSubtitleTargetFormValue(raw) {
        const api = loadSubtitleTargetLangApi();
        const s = String(raw || '').trim();
        if (api?.isIntlSubtitleFormValue?.(s)) return s.toLowerCase();
        if (s === 'en' || s === 'ja' || s === 'ko') return s;
        if (api?.formValueFromTargetLang && api?.normalizeSubtitleTargetLang) {
            const n = api.normalizeSubtitleTargetLang(s) || api.targetLangFromFormValue?.(s);
            if (n) return api.formValueFromTargetLang(n);
        }
        return normalizeChineseSubtitleVariant(s);
    }

    function clampVadMaxSingleSegmentMs(raw) {
        const text = String(raw ?? '').trim();
        const n = text === '' ? NaN : Number(text);
        if (!Number.isFinite(n)) return 30000;
        return Math.max(5000, Math.min(60000, Math.round(n)));
    }

    function clampHallucinationSilenceThreshold(raw) {
        if (raw == null || String(raw).trim() === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.max(0.1, Math.min(30, n));
    }

    function clampTranscriptKeepLimit(_raw) {
        return 0;
    }

    function clampTranscriptKeepDays(_raw) {
        return 0;
    }

    function normalizeSubtitleBakMode(value) {
        const v = String(value || '');
        return SUBTITLE_BAK_MODES.includes(v) ? v : 'off';
    }

    function normalizeStartupWindow(value) {
        return value === 'editor' ? 'editor' : 'generator';
    }

    function resolveExternalImportCore() {
        if (typeof module !== 'undefined' && module.exports) {
            try { return require('./external-import-action-core'); } catch { /* ignore */ }
        }
        const g = typeof globalThis !== 'undefined' ? globalThis : null;
        return (g && g.TransubExternalImportAction) || null;
    }

    function normalizeExternalImportAction(value) {
        const core = resolveExternalImportCore();
        if (core && typeof core.normalizeExternalImportAction === 'function') {
            return core.normalizeExternalImportAction(value);
        }
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'list_only' || raw === 'list_and_start' || raw === 'list_when_idle') return raw;
        return 'list_when_idle';
    }

    function resolveI18nCore() {
        if (typeof module !== 'undefined' && module.exports) {
            try { return require('./i18n-core'); } catch { /* ignore */ }
        }
        const g = typeof globalThis !== 'undefined' ? globalThis : null;
        return (g && g.TransubI18nCore) || null;
    }

    function normalizeUiLocale(value) {
        const core = resolveI18nCore();
        if (core && typeof core.normalizeUiLocale === 'function') {
            return core.normalizeUiLocale(value);
        }
        const s = String(value || '').trim();
        const known = ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko'];
        return known.includes(s) ? s : 'zh-Hans';
    }

    function normalizeAutoUpdateCheckInterval(value) {
        const v = String(value || '');
        return AUTO_UPDATE_INTERVALS.includes(v) ? v : 'off';
    }

    function resolveTranslateStyleCore() {
        if (typeof module !== 'undefined' && module.exports) {
            try { return require('./translate-style-core'); } catch { /* ignore */ }
        }
        const g = typeof globalThis !== 'undefined' ? globalThis : null;
        return (g && g.TransubTranslateStyle) || null;
    }

    function normalizeTranslateStyleOptions(options = {}, { entitled = true } = {}) {
        try {
            const core = resolveTranslateStyleCore();
            if (core?.normalizeTranslateStyleOptions) {
                return core.normalizeTranslateStyleOptions(options, { entitled });
            }
        } catch { /* ignore */ }
        // Renderer fallback when translate-style-core is not yet on globalThis —
        // must preserve enabled; never force false (that wiped chip toggles on save).
        const raw = options && typeof options === 'object' ? options.translateStyleEnabled : false;
        const enabled = raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on';
        let preset = String(options?.translateStylePreset || 'natural_spoken').trim() || 'natural_spoken';
        if (preset === 'custom' && entitled === false) preset = 'natural_spoken';
        const note = preset === 'custom'
            ? String(options?.translateStyleCustomNote || '').trim().slice(0, 200)
            : '';
        return {
            translateStyleEnabled: enabled,
            translateStylePreset: preset,
            translateStyleCustomNote: note,
        };
    }

    function clampPolishSampleLimit(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 36;
        return Math.max(4, Math.min(36, Math.round(n)));
    }

    function clampQcSmartMaxRetranscribeRanges(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 8;
        return Math.max(1, Math.min(24, Math.round(n)));
    }

    /** 0 = disabled; default 15. QC repair silence-splits cues longer than this. */
    function clampQcSilenceSplitChars(raw) {
        if (raw == null || String(raw).trim() === '') return 15;
        const n = Number(raw);
        if (!Number.isFinite(n)) return 15;
        return Math.max(0, Math.min(500, Math.round(n)));
    }

    function normalizeQcSmartIntensity(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'medium' || v === 'strong' || v === 'light') return v;
        return 'light';
    }

    /** ASR low-confidence second opinion: auto | on | off */
    function normalizeAsrSecondOpinion(value) {
        if (value === false || value === 0) return 'off';
        if (value === true || value === 1) return 'on';
        const s = String(value == null ? 'off' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        if (s === 'auto') return 'auto';
        return 'off';
    }

    /** Quality pipeline v2: auto (follow perfProfile) | on | off */
    function normalizeQualityPipelineMode(value) {
        try {
            const policy = (typeof globalThis !== 'undefined' && globalThis.TransubQualityPipelinePolicy)
                || (typeof window !== 'undefined' && window.TransubQualityPipelinePolicy)
                || (typeof module !== 'undefined' && module.exports
                    ? require('./quality-pipeline-policy-core')
                    : null);
            if (policy?.normalizeQualityPipelineMode) {
                return policy.normalizeQualityPipelineMode(value);
            }
        } catch (_) { /* browser / optional */ }
        const v = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (v === 'on' || v === 'true' || v === '1' || v === 'always') return 'on';
        if (v === 'off' || v === 'false' || v === '0' || v === 'no') return 'off';
        return 'auto';
    }

    function clampPostQcLoopMaxPasses(value) {
        try {
            const policy = (typeof globalThis !== 'undefined' && globalThis.TransubQualityPipelinePolicy)
                || (typeof window !== 'undefined' && window.TransubQualityPipelinePolicy)
                || (typeof module !== 'undefined' && module.exports
                    ? require('./quality-pipeline-policy-core')
                    : null);
            if (policy?.clampPostQcLoopMaxPasses) {
                return policy.clampPostQcLoopMaxPasses(value);
            }
        } catch (_) { /* optional */ }
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        return Math.max(0, Math.min(2, Math.round(n)));
    }

    /** Qwen3-ASR island batch: auto | conservative | aggressive */
    function normalizeQwenAsrBatchMode(value) {
        const core = (typeof globalThis !== 'undefined' ? globalThis.TransubQwenAsrBatch : null)
            || (typeof window !== 'undefined' ? window.TransubQwenAsrBatch : null);
        if (core && typeof core.normalizeQwenAsrBatchMode === 'function') {
            return core.normalizeQwenAsrBatchMode(value);
        }
        const v = String(value ?? '').trim().toLowerCase();
        if (v === 'conservative' || v === 'safe' || v === 'low') return 'conservative';
        if (v === 'aggressive' || v === 'fast' || v === 'high') return 'aggressive';
        return 'auto';
    }

    /** Pro ASR semantic repair: off | auto | thorough */
    function normalizeAsrSemanticRepair(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'thorough' || s === 'full' || s === 'all' || s === 'on' || s === 'true' || s === '1') {
            return 'thorough';
        }
        return 'auto';
    }

    /** Empty / invalid → null (caller uses film built-in defaults). */
    function optionalFiniteNumber(raw, { min, max } = {}) {
        if (raw == null || String(raw).trim() === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        let out = n;
        if (Number.isFinite(min)) out = Math.max(min, out);
        if (Number.isFinite(max)) out = Math.min(max, out);
        return out;
    }

    /**
     * Normalize translate mode:
     * - llm: 推理翻译 (Sakura/Gal free path)
     * - external: 外部翻译 (BYOK OpenAI-compat sentence MT)
     * - dialog: 智能翻译 (Pro · single chat LLM line-by-line)
     * - smart: 混合翻译 (Pro · sentence MT + polish; persisted id kept for BC)
     * Aliases: sakura/engine→llm; byok/openai→external; hybrid/advanced/mixed→smart; chat/llm_line→dialog.
     */
    function normalizeTranslateMode(raw) {
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
        if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'sakura' || m === 'engine' || m === 'llm') return 'llm';
        return 'llm';
    }

    /** Pro modes: 智能翻译 (dialog) or 混合翻译 (smart). */
    function isProTranslateMode(raw) {
        const m = normalizeTranslateMode(raw);
        return m === 'smart' || m === 'dialog';
    }

    /** 混合翻译 only (sentence specialist + polish). */
    function isHybridTranslateMode(raw) {
        return normalizeTranslateMode(raw) === 'smart';
    }

    /** 智能翻译 only (single dialog model). */
    function isDialogTranslateMode(raw) {
        return normalizeTranslateMode(raw) === 'dialog';
    }

    /** 推理翻译 only (Sakura/GalTransl free path — not Pro dialog/hybrid). */
    function isInferenceTranslateMode(raw) {
        return normalizeTranslateMode(raw) === 'llm';
    }

    /** 外部翻译 (BYOK OpenAI-compat sentence MT). */
    function isExternalTranslateMode(raw) {
        return normalizeTranslateMode(raw) === 'external';
    }

    /**
     * Persist engineMtModel from translate mode + form picks.
     * Pro / external → ''; llm → LLM id (Opus retired).
     */
    function resolveEngineMtModelForPersist(mode, opusMtModel, llmMtModel) {
        if (isProTranslateMode(mode) || isExternalTranslateMode(mode)) return '';
        return String(llmMtModel || '');
    }

    /**
     * Legacy boolean flags derived from viewing-clean three-way modes.
     */
    function viewingCleanModesToLegacyFlags(punctMode, interjectionMode, onomatopoeiaMode) {
        const punct = normalizeViewingCleanMode(punctMode, 'clear');
        const interj = normalizeViewingCleanMode(interjectionMode, 'clear');
        const onomato = normalizeViewingCleanMode(onomatopoeiaMode, 'clear');
        return {
            postBatchSimplifyViewingPunctuation: punct !== 'off',
            postBatchCompactPureInterjections: interj === 'clear' || onomato === 'clear',
        };
    }

    function normalizeAutoScanFolders(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const entry of list) {
            const folder = String(entry || '').trim();
            if (!folder) continue;
            const key = folder.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(folder);
        }
        return out;
    }

    const WIZARD_TARGET_LANG_IDS = Object.freeze([
        'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko',
    ]);

    function normalizeWizardContentTypes(raw) {
        // Legacy key: now stores wizard preset ids (free-form builtin ids).
        return normalizeWizardPresetIds(raw);
    }

    function normalizeWizardPresetIds(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const item of list) {
            const id = String(item || '').trim();
            if (!id || seen.has(id) || id.length > 128) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }

    function normalizeWizardTargetLangs(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const item of list) {
            const id = String(item || '').trim();
            if (!WIZARD_TARGET_LANG_IDS.includes(id) || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out.length ? out : ['zh-Hans'];
    }

    function loadBurnCoreApi() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./subtitle-burn-core');
            }
        } catch { /* optional */ }
        return (typeof globalThis !== 'undefined' && globalThis.TransubSubtitleBurnCore) || null;
    }

    function normalizeBurnSettingsOptions(input = {}) {
        const burn = loadBurnCoreApi();
        if (burn?.normalizeBurnSettingsOptions) {
            return burn.normalizeBurnSettingsOptions(input);
        }
        const src = input && typeof input === 'object' ? input : {};
        const clamp = (n, min, max, fb) => {
            const v = Math.round(Number(n));
            return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;
        };
        const cont = String(src.burnContainer || 'mp4').toLowerCase() === 'mkv' ? 'mkv' : 'mp4';
        const encRaw = String(src.burnEncoderId || 'libx264').trim().toLowerCase() || 'libx264';
        const encOk = ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'].includes(encRaw);
        const audio = String(src.burnAudioMode || 'copy').toLowerCase() === 'aac' ? 'aac' : 'copy';
        const res = String(src.burnResolutionId || 'source').trim().toLowerCase();
        const resOk = ['source', '1080p', '720p', '480p'].includes(res) ? res : 'source';
        const fps = String(src.burnFpsId || 'source').trim();
        const fpsOk = ['source', '23.976', '24', '25', '30', '60'].includes(fps) ? fps : 'source';
        const speed = String(src.burnEncodeSpeedId || 'medium').toLowerCase();
        const speedOk = ['slow', 'medium', 'fast'].includes(speed) ? speed : 'medium';
        const suffix = String(src.burnOutputSuffix || 'burned')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
            .slice(0, 40) || 'burned';
        return {
            burnContainer: cont,
            burnEncoderId: encOk ? encRaw : 'libx264',
            burnAudioMode: audio,
            burnCrf: clamp(src.burnCrf, 14, 28, 18),
            burnResolutionId: resOk,
            burnFpsId: fpsOk,
            burnEncodeSpeedId: speedOk,
            burnOutputSuffix: suffix,
            burnOutputDir: String(src.burnOutputDir || '').trim(),
        };
    }

    function normalizeTargetSubtitleNaming(value) {
        try {
            const dual = (typeof module !== 'undefined' && module.exports)
                ? require('./dual-subtitle-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubDualSubtitle : null);
            if (dual?.normalizeTargetSubtitleNaming) {
                return dual.normalizeTargetSubtitleNaming(value);
            }
        } catch { /* optional */ }
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'media' || raw === 'same' || raw === 'video' || raw === 'bare') return 'media';
        return 'lang';
    }

    return {
        POST_BATCH_QC_FIX_MODES,
        VIEWING_CLEAN_MODES,
        CHINESE_SUBTITLE_VARIANTS,
        SUBTITLE_BAK_MODES,
        AUTO_UPDATE_INTERVALS,
        numOrFinite,
        normalizePostBatchQcFixMode,
        normalizeViewingCleanMode,
        normalizeChineseSubtitleVariant,
        chineseSubtitleVariantLabel,
        normalizeSubtitleTargetLang,
        normalizeSubtitleTargetFormValue,
        clampVadMaxSingleSegmentMs,
        clampHallucinationSilenceThreshold,
        clampTranscriptKeepLimit,
        clampTranscriptKeepDays,
        clampPolishSampleLimit,
        clampQcSmartMaxRetranscribeRanges,
        clampQcSilenceSplitChars,
        normalizeQcSmartIntensity,
        normalizeAsrSecondOpinion,
        normalizeQualityPipelineMode,
        clampPostQcLoopMaxPasses,
        normalizeQwenAsrBatchMode,
        normalizeAsrSemanticRepair,
        optionalFiniteNumber,
        normalizeSubtitleBakMode,
        normalizeStartupWindow,
        normalizeExternalImportAction,
        normalizeUiLocale,
        normalizeAutoUpdateCheckInterval,
        normalizeTranslateStyleOptions,
        normalizeTargetSubtitleNaming,
        normalizeTranslateMode,
        isProTranslateMode,
        isHybridTranslateMode,
        isDialogTranslateMode,
        isInferenceTranslateMode,
        isExternalTranslateMode,
        resolveEngineMtModelForPersist,
        viewingCleanModesToLegacyFlags,
        normalizeAutoScanFolders,
        normalizeWizardContentTypes,
        normalizeWizardPresetIds,
        normalizeWizardTargetLangs,
        WIZARD_TARGET_LANG_IDS,
        normalizeBurnSettingsOptions,
    };
}));
