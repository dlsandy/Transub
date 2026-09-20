/**
 * Setup wizard goals: catalogs, defaults, readGoals (no manual HF mode).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardGoals = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardGoalsFactory(global) {
    const TASK_LABELS = {
        translate: '外语→中文字幕',
        transcribe: '只要听写',
        dual: '双语字幕',
    };
    const PROFILE_LABELS = {
        speed: '更快',
        balanced: '均衡',
        quality: '更好',
    };
    const LANG_LABELS = {
        auto: '自动检测',
        ja: '日语',
        en: '英语',
        ko: '韩语',
        zh: '中文',
        yue: '粤语',
    };
    const ASR_OPTIONS = [
        { id: 'sensevoice-small', label: 'SenseVoice Small（多语种·推荐）', langs: ['auto', 'ja', 'zh', 'en', 'ko', 'yue'] },
        { id: 'whisper-tiny', label: 'Whisper tiny（最快）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v3-turbo', label: 'Whisper large-v3-turbo（可选·高质量）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v2', label: 'Whisper large-v2（可选·经典）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v3', label: 'Whisper large-v3（最高质量）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'anime-whisper', label: 'Anime Whisper（动画/Galgame）', langs: ['ja', 'auto'] },
        { id: 'whisper-ja-1.5b', label: 'Whisper JA 1.5B（日语微调）', langs: ['ja', 'auto'] },
        { id: 'kotoba-whisper-v2.0-faster', label: 'Kotoba Whisper v2.0（日语）', langs: ['ja', 'auto'] },
        { id: 'reazonspeech-k2', label: 'ReazonSpeech K2（日语·带时间戳）', langs: ['ja', 'auto'] },
        { id: 'qwen3-asr-0.6b', label: 'Qwen3-ASR 0.6B（多语·VAD 时间戳）', langs: ['auto', 'ja', 'zh', 'en'] },
        { id: 'qwen3-asr-1.7b', label: 'Qwen3-ASR 1.7B（官方 -hf·多语）', langs: ['auto', 'ja', 'zh', 'en'] },
        { id: 'qwen3-asr-1.7b-ja-anime-galgame', label: 'Qwen3-ASR 1.7B JA Anime/Galgame（-hf·约4GB）', langs: ['ja', 'auto'] },
        { id: 'qwen3-asr-1.7b-ja-anime-lora-v3', label: 'Qwen3-ASR 1.7B JA Anime LoRA v3（hhim8826·附带基座）', langs: ['ja', 'auto'] },
    ];
    const WHISPER_JA_PRIMARY = 'whisper-ja-1.5b';
    const WHISPER_JA_IDS = [
        'whisper-ja-1.5b',
        'kotoba-whisper-v2.0-faster',
        'anime-whisper',
    ];
    /** @deprecated use WHISPER_JA_PRIMARY / isWhisperJaId */
    const WHISPER_JA_ID = WHISPER_JA_PRIMARY;
    const SAMPLE_MAX = 5;
    const OPUS_MT_OPTIONS = [];
    /** @deprecated UI removed; pipeline always prefers Sakura path for JA/auto */
    const TRANSLATE_PREF_LABELS = {
        sakura: '推理翻译',
        engine: '托管翻译',
    };

    function normalizeLang(language) {
        const lang = String(language || 'auto').trim().toLowerCase();
        if (lang === 'jp' || lang === 'jpn') return 'ja';
        return lang || 'auto';
    }

    function isJaLikeLang(language) {
        const lang = normalizeLang(language);
        return lang === 'ja' || lang === 'auto';
    }

    /**
     * Shared ASR/MT/mode defaults for confirm + apply.
     * @param {object} input
     */
    function resolveWizardPipeline(input) {
        const opts = input || {};
        const task = opts.task || 'translate';
        const profile = opts.profile || 'balanced';
        const variant = opts.variant === 'traditional' ? 'traditional' : 'simplified';
        const sense = opts.sense || null;
        const recommend = opts.recommend || null;
        const advancedEntitled = !!opts.advancedEntitled;
        let language = normalizeLang(opts.language || 'auto');
        if (sense?.language) language = normalizeLang(sense.language);
        const subtitleTargetLang = opts.subtitleTargetLang
            || (variant === 'traditional' ? 'zh-Hant' : 'zh-Hans');

        let asrModel = '';
        if (Array.isArray(opts.asrModels) && opts.asrModels.length) {
            asrModel = String(opts.asrModels[0] || '').trim();
        } else if (opts.asrModel) {
            asrModel = String(opts.asrModel || '').trim();
        } else if (Array.isArray(sense?.asrModels) && sense.asrModels.length) {
            asrModel = String(sense.asrModels[0] || '').trim();
        } else if (sense?.asrModel) {
            asrModel = String(sense.asrModel || '').trim();
        }
        if (!asrModel) {
            const softAv = !!(sense?.softAv || sense?.contentProfile === 'soft-av' || sense?.patch?.contentProfile === 'soft-av');
            const anime = !!(sense?.anime || /anime/i.test(String(sense?.contentProfile || sense?.patch?.contentProfile || '')));
            if ((language === 'ja' || language === 'auto') && (profile === 'quality' || softAv || anime)) {
                asrModel = anime && !softAv ? 'anime-whisper' : WHISPER_JA_PRIMARY;
            } else {
                asrModel = defaultAsrForPure(language, profile, recommend);
            }
        }

        const asrModels = (Array.isArray(opts.asrModels) && opts.asrModels.length)
            ? opts.asrModels.map((id) => String(id || '').trim()).filter(Boolean)
            : (asrModel ? [asrModel] : ['sensevoice-small']);

        let mtModels = [];
        if (task !== 'transcribe') {
            // Empty array is intentional (user unchecked optional MT on the models step).
            if (Object.prototype.hasOwnProperty.call(opts, 'mtModels') && Array.isArray(opts.mtModels)) {
                mtModels = opts.mtModels.map((id) => String(id || '').trim()).filter(Boolean);
            } else if (Array.isArray(sense?.mtModels) && sense.mtModels.length) {
                mtModels = sense.mtModels.map((id) => String(id || '').trim()).filter(Boolean);
            } else {
                mtModels = defaultMtSelectionPure(
                    language,
                    task,
                    recommend,
                    isJaLikeLang(language) ? 'sakura' : 'engine',
                    subtitleTargetLang,
                    { advancedEntitled },
                );
            }
        }

        if (mtModels.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrModels)) {
            asrModels.unshift(WHISPER_JA_PRIMARY);
        }

        const sakuraPick = mtModels.find((id) => isSakuraModelId(id));
        const managedPick = mtModels.find((id) => isManagedLlmModelId(id));
        const smartTranslate = !!(advancedEntitled && sakuraPick && managedPick && task !== 'transcribe');
        const translateMode = task === 'transcribe'
            ? 'off'
            : (smartTranslate ? 'smart' : 'llm');

        const vadModels = defaultVadForPure(asrModels);

        return {
            task,
            profile,
            variant,
            language,
            subtitleTargetLang,
            asrModel: asrModels[0] || asrModel || 'sensevoice-small',
            asrModels,
            mtModel: mtModels[0] || '',
            mtModels,
            vadModels,
            translateMode,
            smartTranslate,
            smartTranslateHybridMt: smartTranslate || undefined,
            /** @deprecated kept for older call sites */
            translatePref: isJaLikeLang(language) ? 'sakura' : 'engine',
        };
    }

    function defaultAsrForPure(language, profile, recommend) {
        const rec = recommend?.models?.asrModel || recommend?.models?.asr_model || '';
        if (rec) return rec;
        if (normalizeLang(language) === 'ja' && profile === 'quality') return WHISPER_JA_PRIMARY;
        return 'sensevoice-small';
    }

    function defaultChatForSmartPure() {
        const general = listGeneralLlmOptions();
        return general.find((o) => o.id === 'qwen25-7b')?.id
            || general.find((o) => o.id === 'qwen25-3b')?.id
            || general.find((o) => !isSakuraModelId(o.id))?.id
            || 'qwen25-7b';
    }

    function defaultMtForPure(language, task, recommend, translatePref = 'sakura', subtitleTargetLang = '') {
        if (task === 'transcribe') return '';
        let allowSakura = isJaLikeLang(language)
            && (translatePref === 'sakura' || translatePref === 'engine' || !translatePref);
        try {
            const route = global.TransubMtTargetRoute;
            if (route?.resolveMtCapability) {
                allowSakura = !!route.resolveMtCapability({
                    language,
                    subtitleTargetLang: subtitleTargetLang || undefined,
                    translateMode: translatePref === 'smart' ? 'smart' : 'llm',
                }).allowSakuraModels;
            } else if (subtitleTargetLang && /^(en|ja|ko)\b/i.test(String(subtitleTargetLang))) {
                allowSakura = false;
            }
        } catch { /* optional */ }
        if (allowSakura && (translatePref === 'sakura' || translatePref === 'engine' || !translatePref)) {
            if (isJaLikeLang(language)) return 'sakura-1.5b';
        }
        const rec = recommend?.models?.mtModel || recommend?.models?.mt_model || '';
        if (rec && !isSakuraModelId(rec) && !/^opus-mt-/i.test(rec)) return rec;
        return defaultChatForSmartPure();
    }

    function defaultMtSelectionPure(language, task, recommend, translatePref = 'sakura', subtitleTargetLang = '', opts = {}) {
        if (task === 'transcribe') return [];
        let allowSakura = isJaLikeLang(language);
        try {
            const route = global.TransubMtTargetRoute;
            if (route?.resolveMtCapability) {
                allowSakura = !!route.resolveMtCapability({
                    language,
                    subtitleTargetLang: subtitleTargetLang || undefined,
                    translateMode: translatePref === 'smart' ? 'smart' : 'llm',
                }).allowSakuraModels;
            } else if (subtitleTargetLang && /^(en|ja|ko)\b/i.test(String(subtitleTargetLang))) {
                allowSakura = false;
            }
        } catch { /* optional */ }
        const primary = defaultMtForPure(language, task, recommend, translatePref, subtitleTargetLang);
        const readyApi = global.TransubSmartTranslateReadiness;
        if (readyApi?.recommendWizardMtPair) {
            return readyApi.recommendWizardMtPair({
                task,
                translatePref: isJaLikeLang(language) ? 'sakura' : 'engine',
                language,
                advancedEntitled: !!opts.advancedEntitled,
                allowSakura,
                sakuraId: 'sakura-1.5b',
                chatId: defaultChatForSmartPure(),
                primaryId: primary,
                fallbackId: primary || defaultChatForSmartPure(),
            });
        }
        if (allowSakura && opts.advancedEntitled && primary && isSakuraModelId(primary)) {
            return [primary, defaultChatForSmartPure()];
        }
        if (allowSakura && primary && isSakuraModelId(primary)) {
            return [primary];
        }
        return primary ? [primary] : [defaultChatForSmartPure()];
    }

    function defaultVadForPure(asrIds) {
        const list = Array.isArray(asrIds) ? asrIds : [asrIds];
        const ids = new Set();
        list.filter(Boolean).forEach((asrId) => {
            const id = String(asrId || '');
            if (!id || id.includes('sensevoice')) ids.add('fsmn-vad');
            else if (id.includes('whisper')) ids.add('silero-vad');
            else ids.add('fsmn-vad');
        });
        if (!ids.size) ids.add('fsmn-vad');
        ids.add('whisperseg-asmr');
        return [...ids];
    }

    function isWhisperJaId(id) {
        return WHISPER_JA_IDS.includes(String(id || '').trim());
    }

    function asrListHasWhisperJa(ids = []) {
        return (ids || []).some((id) => isWhisperJaId(id));
    }

    function isSakuraModelId(id) {
        return /^sakura-/i.test(String(id || ''))
            || !!global.TransubSakuraMtCatalog?.isSakuraMtModel?.(id);
    }

    function listSakuraMtOptions() {
        const catalog = global.TransubSakuraMtCatalog?.listCatalog?.() || [];
        if (catalog.length) {
            return catalog
                .filter((e) => Number(e.paramBillion || (/7b/i.test(e.id) ? 7 : 1.5)) <= 7)
                .filter((e) => !/14b|32b/i.test(String(e.id)))
                .map((e) => ({
                    id: e.id,
                    label: `${e.name}${e.sizeHint ? ` · ${e.sizeHint}` : ''}（日→中·推理翻译）`,
                    langs: ['ja', 'auto'],
                    kind: 'sakura',
                }));
        }
        return [
            { id: 'sakura-1.5b', label: 'Sakura 1.5B（日→中·推理翻译）', langs: ['ja', 'auto'], kind: 'sakura' },
            { id: 'sakura-7b', label: 'Sakura 7B（日→中·推理翻译）', langs: ['ja', 'auto'], kind: 'sakura' },
        ];
    }

    function listGeneralLlmOptions() {
        const api = global.TransubAdvancedManagedLlmCatalog;
        const list = typeof api?.listFreePipelineTranslateModels === 'function'
            ? api.listFreePipelineTranslateModels()
            : (typeof api?.listCatalog === 'function'
                ? api.listCatalog().filter((e) => e.freePipelineTranslate === true)
                : []);
        return list
            .filter((e) => String(e.family || '').toLowerCase() !== 'sakura')
            .filter((e) => !isSakuraModelId(e.id))
            .filter((e) => Number(e.paramBillion || 99) <= 7)
            .map((e) => ({
                id: e.id,
                label: `${e.name}${e.sizeHint ? ` · ${e.sizeHint}` : ''}（通用语言模型）`,
                langs: ['auto', 'ja', 'en', 'ko', 'zh', 'yue'],
                kind: 'llm',
            }));
    }

    function listInferenceMtOptions() {
        return [...listSakuraMtOptions(), ...listGeneralLlmOptions()];
    }

    function allMtOptions() {
        return [...OPUS_MT_OPTIONS, ...listInferenceMtOptions()];
    }

    function isManagedLlmModelId(id) {
        const raw = String(id || '').trim();
        if (!raw || isSakuraModelId(raw) || /^opus-mt-/i.test(raw)) return false;
        const api = global.TransubAdvancedManagedLlmCatalog;
        if (typeof api?.findCatalogEntry === 'function') {
            return !!api.findCatalogEntry(raw);
        }
        return listGeneralLlmOptions().some((o) => o.id === raw);
    }

    function isLightManagedLlmModelId(id) {
        const raw = String(id || '').trim();
        if (!raw || !isManagedLlmModelId(raw)) return false;
        const api = global.TransubAdvancedManagedLlmCatalog;
        if (typeof api?.isProScaleModel === 'function' && api.isProScaleModel(raw)) return false;
        if (typeof api?.isFreePipelineTranslateModel === 'function') {
            return api.isFreePipelineTranslateModel(raw);
        }
        return listGeneralLlmOptions().some((o) => o.id === raw);
    }

    /**
     * @param {object} deps
     */
    function createSetupWizardGoals(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const radioValue = d.radioValue || ((name, fallback) => {
            const el = typeof document !== 'undefined'
                ? document.querySelector(`input[name="${name}"]:checked`)
                : null;
            return el ? String(el.value) : fallback;
        });
        const getState = d.getState || (() => ({}));
        const getHfEndpoint = d.getHfEndpoint || (() => '');

        function readCheckedIds(containerId) {
            const host = $(containerId);
            if (!host) return [];
            return [...host.querySelectorAll('input[type="checkbox"][data-model-id]:checked')]
                .map((el) => String(el.getAttribute('data-model-id') || '').trim())
                .filter(Boolean);
        }

        function readGoals() {
            const asrModels = readCheckedIds('wizardAsrList');
            const mtModels = readCheckedIds('wizardMtList');
            const language = $('wizardLanguageSelect')?.value || 'auto';
            const profile = radioValue('wizardProfile', 'balanced') || $('wizardProfileSelect')?.value || 'balanced';
            const task = radioValue('wizardTask', 'translate');
            const variant = radioValue('wizardVariant', 'simplified');
            // Hidden lists are synced from the models step (possibly with zero MT checked).
            // Treat "host has been filled" as explicit so empty ≠ fall back to defaults.
            const mtHost = $('wizardMtList');
            const asrHost = $('wizardAsrList');
            const mtExplicit = !!(mtHost && (mtHost.dataset.wizardSynced === '1'
                || mtHost.querySelectorAll('input[data-model-id]').length > 0
                || mtModels.length > 0));
            const asrExplicit = !!(asrHost && (asrHost.dataset.wizardSynced === '1'
                || asrHost.querySelectorAll('input[data-model-id]').length > 0
                || asrModels.length > 0));
            const pipe = resolveWizardPipeline({
                task,
                profile,
                variant,
                language,
                asrModels: asrExplicit ? asrModels : undefined,
                mtModels: mtExplicit ? mtModels : undefined,
                asrModel: asrModels[0] || '',
                mtModel: mtModels[0] || '',
                recommend: getState().detect?.recommend,
                sense: null,
                advancedEntitled: !!getState().advancedEntitled,
            });
            return {
                task,
                profile,
                variant,
                language,
                translatePref: pipe.translatePref,
                asrModels: asrExplicit ? asrModels : (asrModels.length ? asrModels : pipe.asrModels),
                mtModels: mtExplicit ? mtModels : (mtModels.length ? mtModels : pipe.mtModels),
                asrModel: asrModels[0] || pipe.asrModel || '',
                mtModel: mtModels[0] || pipe.mtModel || '',
                subtitleTargetLang: pipe.subtitleTargetLang,
                translateMode: pipe.translateMode,
                smartTranslate: pipe.smartTranslate,
            };
        }

        function defaultAsrFor(language, profile, recommend) {
            return defaultAsrForPure(language, profile, recommend);
        }

        function defaultChatForSmart() {
            return defaultChatForSmartPure();
        }

        function defaultMtFor(language, task, recommend, translatePref = 'sakura', subtitleTargetLang = '') {
            return defaultMtForPure(language, task, recommend, translatePref, subtitleTargetLang);
        }

        function defaultMtSelection(language, task, recommend, translatePref = 'sakura', subtitleTargetLang = '', opts = {}) {
            return defaultMtSelectionPure(language, task, recommend, translatePref, subtitleTargetLang, opts);
        }

        function mtSelectionOpts() {
            return { advancedEntitled: !!getState().advancedEntitled };
        }

        function defaultVadFor(asrIds) {
            return defaultVadForPure(asrIds);
        }

        function asrOptionsFor(language) {
            const lang = language || 'auto';
            return ASR_OPTIONS.filter((o) => o.langs.includes(lang) || o.langs.includes('auto'));
        }

        function mtOptionsFor(language, task) {
            if (task === 'transcribe') return [];
            const lang = language || 'auto';
            return listInferenceMtOptions().filter((o) => o.langs.includes(lang) || o.langs.includes('auto'));
        }

        function collectDownloadModelIds(goals) {
            const state = getState();
            const g = goals || {};
            const mtExplicit = Object.prototype.hasOwnProperty.call(g, 'mtModels') && Array.isArray(g.mtModels);
            const asrExplicit = Object.prototype.hasOwnProperty.call(g, 'asrModels') && Array.isArray(g.asrModels);
            const pipe = resolveWizardPipeline({
                task: g.task,
                profile: g.profile,
                variant: g.variant,
                language: g.language,
                asrModels: asrExplicit ? g.asrModels : undefined,
                mtModels: mtExplicit ? g.mtModels : undefined,
                asrModel: g.asrModel,
                mtModel: g.mtModel,
                recommend: state.detect?.recommend,
                sense: null,
                advancedEntitled: !!state.advancedEntitled,
                subtitleTargetLang: g.subtitleTargetLang,
            });
            const asrList = asrExplicit
                ? g.asrModels.map((id) => String(id || '').trim()).filter(Boolean)
                : pipe.asrModels.slice();
            const mtList = g.task === 'transcribe'
                ? []
                : (mtExplicit
                    ? g.mtModels.map((id) => String(id || '').trim()).filter(Boolean)
                    : pipe.mtModels.slice());
            if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
                asrList.unshift(WHISPER_JA_PRIMARY);
            }
            const vadList = defaultVadFor(asrList);
            const ids = [];
            [...asrList, ...mtList, ...vadList].forEach((id) => {
                if (id && !ids.includes(id)) ids.push(id);
            });
            return ids;
        }

        function enginePayloadFromForm() {
            const pathInput = $('engineInstallPathInput');
            const urlInput = $('engineUrlInput');
            const autoStart = $('engineAutoStartCheck');
            const state = getState();
            return {
                engineInstallPath: pathInput?.value.trim() || state.detect?.enginePath || '',
                engineUrl: urlInput?.value.trim() || state.detect?.engineUrl || 'http://127.0.0.1:8765',
                engineHfEndpoint: getHfEndpoint(),
                engineAutoStart: autoStart ? !!autoStart.checked : true,
            };
        }

        function resolvePipelineFromState(extra) {
            const goals = readGoals();
            const state = getState();
            return resolveWizardPipeline({
                task: goals.task,
                profile: $('wizardProfileSelect')?.value || goals.profile,
                variant: goals.variant,
                language: $('wizardLanguageSelect')?.value || goals.language,
                asrModels: goals.asrModels,
                mtModels: goals.mtModels,
                recommend: state.detect?.recommend,
                sense: (typeof d.senseIsAdopted === 'function' && d.senseIsAdopted()) ? state.sense : null,
                advancedEntitled: !!state.advancedEntitled,
                ...(extra || {}),
            });
        }

        return {
            TASK_LABELS,
            PROFILE_LABELS,
            LANG_LABELS,
            ASR_OPTIONS,
            WHISPER_JA_PRIMARY,
            WHISPER_JA_IDS,
            WHISPER_JA_ID,
            SAMPLE_MAX,
            TRANSLATE_PREF_LABELS,
            isWhisperJaId,
            asrListHasWhisperJa,
            isSakuraModelId,
            isManagedLlmModelId,
            isLightManagedLlmModelId,
            listSakuraMtOptions,
            listGeneralLlmOptions,
            listInferenceMtOptions,
            allMtOptions,
            readCheckedIds,
            readGoals,
            resolveWizardPipeline,
            resolvePipelineFromState,
            defaultAsrFor,
            defaultChatForSmart,
            defaultMtFor,
            defaultMtSelection,
            mtSelectionOpts,
            defaultVadFor,
            asrOptionsFor,
            mtOptionsFor,
            collectDownloadModelIds,
            enginePayloadFromForm,
        };
    }

    return {
        TASK_LABELS,
        PROFILE_LABELS,
        LANG_LABELS,
        ASR_OPTIONS,
        WHISPER_JA_PRIMARY,
        WHISPER_JA_IDS,
        WHISPER_JA_ID,
        SAMPLE_MAX,
        TRANSLATE_PREF_LABELS,
        isWhisperJaId,
        asrListHasWhisperJa,
        isSakuraModelId,
        isManagedLlmModelId,
        isLightManagedLlmModelId,
        listSakuraMtOptions,
        listGeneralLlmOptions,
        listInferenceMtOptions,
        allMtOptions,
        resolveWizardPipeline,
        createSetupWizardGoals,
    };
}));
