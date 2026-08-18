/**
 * Transub — 批量字幕生成（主窗口）
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const els = {};
    const mediaExt = global.TransubMediaExtensions || {};
    const pathUtils = global.TransubAppPathUtils || {};
    const inferProgress = global.TransubInferStageProgress || {};
    const engineDlFmt = global.TransubEngineDownloadFormat || {};
    const senseQueueApi = global.TransubSenseQueue || {};
    const taskListSortApi = global.TransubTaskListSort || {};
    const engineModelsUi = global.TransubEngineModelsUi || {};
    const manualDownloadApi = global.TransubEngineManualDownload || {};
    const senseFinalizeApi = global.TransubSenseFinalize || {};
    const missingModelsApi = global.TransubEngineMissingModels || {};
    const startReadinessApi = global.TransubStartReadiness || {};
    const selectionToolbarApi = global.TransubSelectionToolbar || {};
    const liveBatchQueueApi = global.TransubLiveBatchQueue || {};
    const postBatchAutofixApi = global.TransubPostBatchAutofixPlan || {};
    const retranslatePlanApi = global.TransubRetranslatePlan || {};
    const senseRecoveryApi = global.TransubSenseRecovery || {};
    const taskListRowApi = global.TransubTaskListRow || {};
    const progressDisplayApi = global.TransubProgressDisplay || {};
    const settingsNormApi = global.TransubSettingsOptionsNormalize || {};
    const savedOptionsApi = global.TransubSettingsSavedOptions || settingsNormApi || {};
    const postTaskQcApi = global.TransubPostTaskQcUi || {};
    const translateChipApi = global.TransubTranslateModeChip || {};
    const audioMutexApi = global.TransubAudioOptionMutex || {};
    const computeBusyUiApi = global.TransubComputeBusyUi || {};
    const MEDIA_EXTENSIONS = new Set(
        mediaExt.MEDIA_EXTENSIONS
        || [
            'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
            'ts', 'm2ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
            'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus',
        ],
    );
    const DEFAULT_AUDIO_SUFFIXES = mediaExt.DEFAULT_AUDIO_SUFFIXES
        || [...MEDIA_EXTENSIONS].join(',');

    const GITHUB_ISSUES_URL = 'https://github.com/dlsandy/Transub/issues/new';

    const DEVICE_LABELS = {
        cuda: 'GPU',
        auto: '自动',
        amd: 'GPU AMD',
        cpu: 'CPU',
        cuda_low_vram: 'GPU 低显存',
        cuda_batch: 'GPU 批处理',
        modal: 'Modal 云端',
    };

    const EXPERT_DEVICES = new Set(['cuda_low_vram', 'cuda_batch', 'modal']);
    const EXPERT_PARAM_DEFAULTS = {
        logLevel: 'DEBUG',
        maxBatchSize: 8,
        beamSize: 5,
        vadThreshold: 0.5,
        vadMinSpeechDurationMs: 300,
        vadMinSilenceDurationMs: 100,
        vadSpeechPadMs: 200,
        vadMaxSingleSegmentMs: 30000,
        retranscribeWarmLight: false,
        audioSuffixes: DEFAULT_AUDIO_SUFFIXES,
    };

    /** TWAI-only keys preserved from snapshot when transcription UI no longer edits them. */
    const TWAI_LEGACY_OPTION_DEFAULTS = {
        maxInitialTimestamp: 30,
        repetitionPenalty: 1.1,
        noSpeechThreshold: 0.6,
        logProbThreshold: -1,
        compressionRatioThreshold: 2.4,
        smartSplitWithVad: true,
        targetChunkDurationS: 30,
        mergeSegments: true,
        mergeMaxGapMs: 500,
        mergeMaxDurationMs: 15000,
    };

    /** @type {Record<string, unknown>} */
    let twaiLegacyOptions = { ...TWAI_LEGACY_OPTION_DEFAULTS };

    function stashTwaiLegacyFromOptions(options = {}) {
        const next = { ...TWAI_LEGACY_OPTION_DEFAULTS, ...twaiLegacyOptions };
        for (const key of Object.keys(TWAI_LEGACY_OPTION_DEFAULTS)) {
            if (options[key] !== undefined) next[key] = options[key];
        }
        twaiLegacyOptions = next;
    }

    function readTwaiLegacyOptions() {
        return { ...TWAI_LEGACY_OPTION_DEFAULTS, ...twaiLegacyOptions };
    }

    const STAGE_LABELS = inferProgress.STAGE_LABELS || {
        starting: '启动',
        denoise: '轻度降噪',
        separate: '人声分离',
        scene: '场景切分',
        vad: '语音检测',
        vad_failover: 'VAD 回退',
        cleanup: '字幕清理',
        model: '加载模型',
        transcribe: '转写中',
        translate: '翻译中',
        save: '保存字幕',
        done: '完成',
        failed: '失败',
    };

    const STAGE_RANK = inferProgress.STAGE_RANK || {
        starting: 0,
        denoise: 1,
        separate: 1,
        vad: 2,
        vad_failover: 2,
        model: 3,
        transcribe: 4,
        translate: 4,
        save: 5,
        done: 6,
        failed: 6,
    };

    const stageRank = inferProgress.stageRank
        || function stageRankFallback(stage) { return STAGE_RANK[stage] ?? 0; };

    const scrubProgressDetail = inferProgress.scrubProgressDetail
        || function scrubProgressDetailFallback(detail) {
            return String(detail || '')
                .trim()
                .replace(/^(转写\s*\/\s*翻译中|转写中|翻译中|转写|翻译|识别中)\s*[·•]?\s*/u, '')
                .trim();
        };

    function stageLabel(stage) {
        if (progressDisplayApi.stageLabel) {
            return progressDisplayApi.stageLabel(stage, {
                stageLabels: STAGE_LABELS,
                itemDualPhase: state.itemDualPhase,
                task: readTaskFromForm(),
            });
        }
        return STAGE_LABELS[stage] || '处理中';
    }

    /** 列表行副文案：只保留时间轴 / 语音检测等补充信息，避免与状态徽章叠词 */
    function formatListRunningDetail(rawDetail) {
        if (progressDisplayApi.formatListRunningDetail) {
            return progressDisplayApi.formatListRunningDetail(rawDetail, {
                scrubProgressDetail,
                itemDualPhase: state.itemDualPhase,
            });
        }
        return scrubProgressDetail(rawDetail);
    }

    function formatRunningProgressLabel(stage, detail) {
        if (progressDisplayApi.formatRunningProgressLabel) {
            return progressDisplayApi.formatRunningProgressLabel(stage, detail, {
                stageLabels: STAGE_LABELS,
                scrubProgressDetail,
                itemDualPhase: state.itemDualPhase,
                task: readTaskFromForm(),
            });
        }
        return stageLabel(stage);
    }

    function effectiveItemProgress(stage, progress) {
        if (progressDisplayApi.effectiveItemProgress) {
            return progressDisplayApi.effectiveItemProgress(stage, progress, {
                running: state.running,
                itemDualPhase: state.itemDualPhase,
                isPreTranscribeStage,
            });
        }
        return Math.max(0, Math.min(100, Number(progress) || 0));
    }

    function computeDisplayProgress() {
        if (progressDisplayApi.computeDisplayProgress) {
            return progressDisplayApi.computeDisplayProgress({
                running: state.running,
                itemStage: state.itemStage,
                itemDualPhase: state.itemDualPhase,
                videoProgress: state.videoProgress,
                videoCurrentSec: state.videoCurrentSec,
                videoTotalSec: state.videoTotalSec,
                index: state.index,
                total: state.total,
                formatDuration,
                isPreTranscribeStage,
            });
        }
        return { pct: 0, label: '…' };
    }

    const POST_TASK_SELECT_VALUES = new Set(
        postTaskQcApi.POST_TASK_ACTIONS || ['none', 'quit', 'shutdown', 'sleep', 'open_folder'],
    );

    const POST_TASK_LABELS = postTaskQcApi.POST_TASK_LABELS || {
        none: '无额外操作',
        open_folder: '打开输出目录',
        sleep: '睡眠',
        quit: '退出应用',
        shutdown: '关机',
    };

    const PROBE_CONCURRENCY = 6;

    const TRANSLATE_MODE_CHIP_LABELS = translateChipApi.TRANSLATE_MODE_CHIP_LABELS || {
        engine: '机器',
        llm: '推理',
        sakura: '推理', // legacy alias
        smart: 'Pro译',
    };

    const POST_BATCH_QC_FIX_MODES = new Set(['none', 'fix', 'smart']);
    const POST_BATCH_QC_FIX_CHIP_LABELS = {
        none: '关闭',
        fix: '自动',
        smart: '智能 Pro',
    };

    const ux = () => global.TransubMainUiUx;

        function showToast(message, tone = 'info', options = {}) {
        if (isStandaloneSettings || isStandaloneWizard) return;
        ux()?.showToast?.(message, tone, options);
    }

    async function appConfirm(options = {}) {
        if (typeof options === 'string') {
            return ux()?.confirmYesNo?.(options) ?? window.confirm(options);
        }
        if (ux()?.confirmDialog) {
            const result = await ux().confirmDialog(options);
            return result === 'primary';
        }
        return window.confirm(String(options.message || options.title || '确认？'));
    }

    async function appConfirmChoice(options = {}) {
        if (ux()?.confirmDialog) return ux().confirmDialog(options);
        const ok = window.confirm(String(options.message || options.title || '确认？'));
        return ok ? 'primary' : 'secondary';
    }

    global.TransubAppConfirm = appConfirm;
    global.TransubAppConfirmChoice = appConfirmChoice;

    const LOG_LEVEL_HINTS = {
        DEBUG: '输出 VAD 分块、模型加载、每句字幕时间轴等全部细节。Transub 可据此精确更新任务进度，安装目录 latest.log 也最完整。适合日常使用与排查问题。',
        INFO: '仅保留启动、扫描文件、加载模型、处理进度（N/M）等关键步骤，不打印每句 [时间轴] 字幕行。任务列表进度将更多依赖时间估算，细粒度更新可能变慢，latest.log 更简洁。',
        WARNING: '仅输出警告与错误，正常转写过程几乎无日志，进行中难以判断当前阶段。仅建议在确认任务异常、需要减少日志量时临时使用。',
        ERROR: '仅在发生错误时输出，无法观察进行中的状态，latest.log 几乎为空。只适合只想捕获失败信息、不关心过程的场景。',
    };

    let savedOptionsSnapshot = null;
    let activeParamsTab = 'runtime';
    let settingsFormDirty = false;
    let translateMenuOpen = false;
    let paramsMoreMenuOpen = false;
    let expertExtrasMenuOpen = false;
    let postBatchQcFixMenuOpen = false;
    let paramsModeMenuOpen = false;
    /** Local mirror of autoSense when the dedicated toggle chip is gone. */
    let autoSenseEnabledState = true;
    /** Restore recognition preset after preset <select> options are filled. */
    let pendingActivePresetId = '';
    /** When true, MT uses form pick/auto even if 智能感知 is on (ASR still follows sense). */
    let mtUseFormState = false;
    /** Cached path of vendored `transub-engine/` (empty until probed). */
    let cachedBundledEnginePath = '';
    /** @type {Set<number>} */
    const expandedErrorRows = new Set();
    let advancedEntitled = false;
    /** @type {{ ok: boolean, modelId?: string, message?: string, reason?: string }} */
    let freePipelineTranslate = { ok: false };
    let syncingTranslateMode = false;
    let lastEngineModelsRefreshAt = 0;
    /** @type {Array<object>} */
    let cachedEngineModels = [];
    /** @type {{ vramMb?: number, profile?: string, gpuName?: string, at?: number }|null} */
    let cachedHardwareRecommend = null;

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';
    const isStandaloneChrome = isStandaloneSettings || isStandaloneWizard;
    const initialSettingsTab = String(pageQuery.get('tab') || '').trim();
    const initialOpenModelsLibrary = pageQuery.get('openLibrary') === '1';

    /** Legacy / alias tab ids → current panel ids */
    const PARAMS_TAB_ALIASES = {
        ffmpeg: 'install',
        advanced: 'pro',
        pro: 'pro',
        license: 'pro',
        'pro-license': 'pro',
        'pro-llm': 'pro-llm',
        llm: 'pro-llm',
        byok: 'pro-llm',
        'pro-smart-translate': 'pro-smart-translate',
        'smart-translate': 'pro-smart-translate',
        'pro-film-audio': 'pro-film-audio',
        'film-audio': 'pro-film-audio',
        filmAudio: 'pro-film-audio',
        'pro-qc-smart': 'pro-qc-smart',
        'qc-smart': 'pro-qc-smart',
        qcSmart: 'pro-qc-smart',
        'pro-reconstruct': 'pro-reconstruct',
        reconstruct: 'pro-reconstruct',
        film: 'pro-reconstruct',
        environment: 'install',
        install: 'install',
        运行环境: 'install',
        环境: 'install',
        general: 'runtime',
        runtime: 'runtime',
        常规: 'runtime',
        editorAdvanced: 'editor',
        editor: 'editor',
        字幕编辑器: 'editor',
        transcribe: 'process',
        transcription: 'process',
        process: 'process',
        任务处理: 'process',
        字幕处理: 'process',
        models: 'models',
        处理模型: 'models',
        模型: 'models',
        模型库: 'models',
        output: 'output',
        字幕输出: 'output',
        输出: 'output',
        notify: 'notify',
        notification: 'notify',
        notifications: 'notify',
        tray: 'notify',
        taskbar: 'notify',
        托盘: 'notify',
        任务栏: 'notify',
        任务栏与通知: 'notify',
        history: 'history',
        历史记录: 'history',
        performance: 'performance',
        perf: 'performance',
        硬件: 'performance',
        性能: 'performance',
        params: 'params',
        presets: 'params',
        识别参数: 'params',
        参数: 'params',
        场景: 'params',
        network: 'network',
        proxy: 'network',
        网络与代理: 'network',
        网络: 'network',
        more: 'more',
        更多: 'more',
        Pro许可: 'pro',
        许可: 'pro',
        大模型设置: 'pro-llm',
        智能翻译模型: 'pro-llm',
        智能翻译: 'pro-smart-translate',
        影视音频增强: 'pro-film-audio',
        QC智能修复: 'pro-qc-smart',
        语境和理解重构: 'pro-reconstruct',
    };

    function isSakuraMtModelId(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        try {
            const catalog = global.TransubSakuraMtCatalog || global.SakuraMtCatalog;
            if (catalog?.isSakuraMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return /^sakura-/i.test(id);
    }

    function getManagedLlmCatalogApi() {
        return global.TransubAdvancedManagedLlmCatalog || null;
    }

    /** Managed GGUF catalog entry (Qwen / Llama / Sakura / …). */
    function findManagedLlmCatalogEntry(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return null;
        try {
            return getManagedLlmCatalogApi()?.findCatalogEntry?.(id) || null;
        } catch (_) {
            return null;
        }
    }

    /** Models listed under「LLM推理翻译」and selectable for 推理翻译. */
    function isLlmInferencePickModelId(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (isSakuraMtModelId(id)) return true;
        if (findManagedLlmCatalogEntry(id)) return true;
        try {
            const catalog = global.TransubSakuraMtCatalog || global.SakuraMtCatalog;
            if (catalog?.isLlmInferenceMtModel?.(id)) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    function numOrFinite(value, fallback) {
        if (settingsNormApi.numOrFinite) return settingsNormApi.numOrFinite(value, fallback);
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function readTranslateModeFromForm() {
        if (els.translateModeSmart?.checked) return 'smart';
        if (els.translateModeSakura?.checked) return 'llm';
        if (els.translateModeEngine?.checked) return 'engine';
        return 'llm';
    }

    function setTranslateModeRadios(mode) {
        const next = mode === 'smart' || mode === 'llm' || mode === 'sakura' ? (
            mode === 'smart' ? 'smart' : 'llm'
        ) : 'engine';
        if (els.translateModeEngine) els.translateModeEngine.checked = next === 'engine';
        if (els.translateModeSakura) {
            els.translateModeSakura.value = 'llm';
            els.translateModeSakura.checked = next === 'llm';
        }
        if (els.translateModeSmart) els.translateModeSmart.checked = next === 'smart';
    }

    function markSettingsDirty(dirty = true) {
        settingsFormDirty = !!dirty;
        els.settingsDirtyBadge?.classList.toggle('hidden', !settingsFormDirty);
        els.headerSettingsDirtyBadge?.classList.toggle('hidden', !settingsFormDirty || isStandaloneSettings);
        if (els.cancelParamsBtn) {
            els.cancelParamsBtn.textContent = settingsFormDirty ? '取消' : '关闭';
        }
        if (!settingsFormDirty && els.saveParamsStatus
            && /未保存|已载入|已应用预设|请点/.test(els.saveParamsStatus.textContent || '')) {
            // keep guidance text until next save
        }
    }

    function setSaveParamsStatus(text, tone = '') {
        if (!els.saveParamsStatus) return;
        els.saveParamsStatus.textContent = text || '';
        if (tone === 'ok') els.saveParamsStatus.className = 'text-xs text-emerald-600';
        else if (tone === 'err') els.saveParamsStatus.className = 'text-xs text-red-600';
        else if (tone === 'warn') els.saveParamsStatus.className = 'text-xs text-amber-700';
        else els.saveParamsStatus.className = 'text-xs text-gray-500';
    }

    function setAdvancedEntitled(entitled, freeInfo) {
        advancedEntitled = !!entitled;
        freePipelineTranslate = (freeInfo && typeof freeInfo === 'object')
            ? {
                ok: !!freeInfo.ok,
                modelId: String(freeInfo.modelId || ''),
                message: String(freeInfo.message || ''),
                reason: String(freeInfo.reason || ''),
            }
            : { ok: false };
        try {
            if (!isStandaloneSettings && !isStandaloneWizard) {
                const brand = advancedEntitled ? 'Transub Pro' : 'Transub';
                document.title = brand;
                if (els.appBrandName) els.appBrandName.textContent = brand;
            }
        } catch (_) { /* ignore */ }
        // After status is known, drop Advanced-only flags so free users are not stuck
        // with disabled-but-checked boxes that block save / fail every batch file.
        if (!advancedEntitled) {
            if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
            if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
            if (readTranslateModeFromForm() === 'smart' || els.smartTranslateCheck?.checked) {
                const llmId = String(els.engineLlmMtModelSelect?.value || '').trim();
                const fallback = (isSakuraMtModelId(llmId)
                    || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(llmId))
                    ? 'llm'
                    : 'engine';
                applyTranslateModeToForm(fallback);
            }
            if (getPostBatchQcFixMode() === 'smart') {
                void setPostBatchQcFixMode('fix', { fromUser: false, persist: false });
            }
        }
        syncSmartTranslateUi();
        syncAdvancedFeaturesGate();
        syncMtModelChipUi();
        syncProGatedNav();
        syncTranslateModeChipUi();
        syncPostBatchQcFixChipUi();
        updateReadinessStrip();
        updateQcBanner();
        // Pro unlock changes which LLM models appear in「模型 → LLM推理翻译」.
        if (cachedEnginePickCatalog.length) {
            void refreshEngineModels({ silent: true });
        }
    }

    const AFDIAN_PRO_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

    function isProGatedTab(tabId) {
        const id = resolveParamsTab(tabId);
        return id.startsWith('pro-');
    }

    const PRO_GATED_TAB_TITLES = {
        'pro-llm': '智能翻译模型',
        'pro-smart-translate': '智能翻译',
        'pro-film-audio': '影视音频增强',
        'pro-qc-smart': 'QC 智能修复',
        'pro-reconstruct': '语境和理解重构',
    };

    async function promptProUnlockRequired({ featureLabel = '' } = {}) {
        const label = String(featureLabel || '').trim() || '该功能';
        setSaveParamsStatus('需先解锁 Pro 功能', 'warn');
        const action = await appConfirmChoice({
            title: '需要解锁 Pro',
            message: `「${label}」需先解锁 Pro 功能。可前往爱发电购买本大版本买断，付款后在「Pro许可」页用订单号领取并激活。`,
            primaryLabel: '去解锁 Pro',
            secondaryLabel: '取消',
            tertiaryLabel: '打开许可页',
            type: 'question',
        });
        if (action === 'primary') {
            try {
                await electron?.openExternal?.(AFDIAN_PRO_PURCHASE_URL);
            } catch (_) { /* ignore */ }
            switchParamsTab('pro', { fromGate: true });
            return true;
        }
        if (action === 'tertiary') {
            switchParamsTab('pro', { fromGate: true });
            return true;
        }
        return false;
    }

    function syncProGatedNav() {
        els.paramsTabBtns?.forEach((btn) => {
            const gated = btn.getAttribute('data-pro-gated') === '1' || isProGatedTab(btn.dataset.tab);
            const locked = gated && !advancedEntitled;
            btn.classList.toggle('is-pro-locked', locked);
            btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
            if (gated) {
                const baseTitle = PRO_GATED_TAB_TITLES[btn.dataset.tab]
                    || String(btn.title || '').replace(/（需解锁 Pro）$/, '')
                    || 'Pro 功能';
                btn.title = locked ? `${baseTitle}（需解锁 Pro）` : baseTitle;
            }
        });
        if (isProGatedTab(activeParamsTab) && !advancedEntitled) {
            switchParamsTab('pro', { fromGate: true });
        }
        syncProGatedSettingsControls();
    }

    /** Disable Pro-only controls that live outside gated tabs. */
    function syncProGatedSettingsControls() {
        const locked = !advancedEntitled;
        document.querySelectorAll('[data-pro-setting]').forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            const interactive = el.matches('input, select, button, textarea')
                ? el
                : el.querySelector('input, select, button, textarea');
            if (interactive instanceof HTMLInputElement
                || interactive instanceof HTMLSelectElement
                || interactive instanceof HTMLButtonElement
                || interactive instanceof HTMLTextAreaElement) {
                interactive.disabled = locked || interactive.dataset.forceDisabled === '1';
            }
            el.classList.toggle('opacity-50', locked);
            el.classList.toggle('pointer-events-none', locked);
            if (locked) {
                el.title = el.dataset.proLockTitle || '需解锁 Pro 后可用';
            } else if (el.dataset.proLockTitle) {
                el.removeAttribute('title');
            }
        });
    }

    function switchParamsTab(tabId, opts = {}) {
        let next = resolveParamsTab(tabId || activeParamsTab);
        if (isProGatedTab(next) && !advancedEntitled) {
            if (!opts.fromGate) {
                const label = PRO_GATED_TAB_TITLES[next] || 'Pro 功能';
                void promptProUnlockRequired({ featureLabel: label });
            }
            next = 'pro';
        }
        activeParamsTab = next;
        els.paramsTabBtns?.forEach((btn) => {
            const active = btn.dataset.tab === activeParamsTab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        els.paramsTabPanels?.forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.tabPanel === activeParamsTab);
        });
        if (activeParamsTab === 'install' || activeParamsTab === 'models') {
            if (readEngineBackendFromForm() !== 'twai') {
                const now = Date.now();
                if (now - lastEngineModelsRefreshAt > 8000) {
                    lastEngineModelsRefreshAt = now;
                    // Do not hammer a busy engine (health/list can wedge or used to kill the job).
                    void (async () => {
                        try {
                            const st = await electron?.transubComputeTaskStatus?.();
                            const kind = String(st?.kind || '').trim();
                            if (st?.busy && /^engine_/.test(kind)) return;
                        } catch (_) { /* ignore */ }
                        await refreshEngineModels({ silent: true });
                    })();
                }
            }
        }
        if (activeParamsTab === 'history') {
            void global.TransubFeatures?.refreshLibrarySettingsStatus?.();
        }
    }

    function canUseSmartTranslateUi() {
        return !!advancedEntitled;
    }

    function syncFaithfulToneUi(translateOn) {
        // Faithful tone is free for all translate/dual tasks (not Advanced-gated).
        const faithfulOk = !!translateOn;
        if (els.smartTranslateFaithfulCheck) {
            els.smartTranslateFaithfulCheck.disabled = !faithfulOk;
            if (!translateOn) els.smartTranslateFaithfulCheck.checked = false;
        }
        if (els.smartTranslateFaithfulWrap) {
            els.smartTranslateFaithfulWrap.classList.toggle('opacity-50', !faithfulOk);
            els.smartTranslateFaithfulWrap.classList.toggle('pointer-events-none', !faithfulOk);
        }
        syncExpertExtraChipsUi();
    }

    function syncHybridMtUi() {
        // Pipeline prefs live on the Pro「智能翻译」page; allow editing whenever Pro is
        // unlocked (not only when the current task/mode is already 智能翻译).
        const ok = canUseSmartTranslateUi();
        if (els.smartTranslateHybridCheck) {
            els.smartTranslateHybridCheck.disabled = !ok;
        }
        if (els.smartTranslateHybridWrap) {
            els.smartTranslateHybridWrap.classList.toggle('opacity-50', !ok);
            els.smartTranslateHybridWrap.classList.toggle('pointer-events-none', !ok);
        }
        if (els.smartTranslatePolishCheck) {
            els.smartTranslatePolishCheck.disabled = !ok;
        }
        if (els.smartTranslatePolishWrap) {
            els.smartTranslatePolishWrap.classList.toggle('opacity-50', !ok);
            els.smartTranslatePolishWrap.classList.toggle('pointer-events-none', !ok);
        }
        if (els.smartTranslateVerifyCheck) {
            els.smartTranslateVerifyCheck.disabled = !ok;
        }
        if (els.smartTranslateVerifyWrap) {
            els.smartTranslateVerifyWrap.classList.toggle('opacity-50', !ok);
            els.smartTranslateVerifyWrap.classList.toggle('pointer-events-none', !ok);
        }
        if (els.smartTranslateAddressCheck) {
            els.smartTranslateAddressCheck.disabled = !ok;
        }
        if (els.smartTranslateAddressWrap) {
            els.smartTranslateAddressWrap.classList.toggle('opacity-50', !ok);
            els.smartTranslateAddressWrap.classList.toggle('pointer-events-none', !ok);
        }
        if (els.smartTranslatePolishLimitInput) {
            els.smartTranslatePolishLimitInput.disabled = !ok;
        }
        if (els.smartTranslatePolishLimitWrap) {
            els.smartTranslatePolishLimitWrap.classList.toggle('opacity-50', !ok);
            els.smartTranslatePolishLimitWrap.classList.toggle('pointer-events-none', !ok);
        }
    }

    function syncAdvancedFeaturesGate() {
        const locked = !advancedEntitled;
        const smartLocked = !canUseSmartTranslateUi();
        els.advancedFeaturesLockHint?.classList.toggle('hidden', !locked);
        if (els.filmAudioEnhanceWrap) {
            els.filmAudioEnhanceWrap.classList.toggle('opacity-50', locked);
            // Keep clickable so locked users get the unlock prompt.
            els.filmAudioEnhanceWrap.classList.remove('pointer-events-none');
        }
        if (els.filmAudioEnhanceCheck) {
            els.filmAudioEnhanceCheck.disabled = locked;
        }
        if (els.filmVadPresetWrap) {
            els.filmVadPresetWrap.classList.toggle('opacity-50', locked);
            els.filmVadPresetWrap.classList.remove('pointer-events-none');
        }
        if (els.filmVadPresetCheck) {
            els.filmVadPresetCheck.disabled = locked;
        }
        if (els.translateModeSmartWrap) {
            els.translateModeSmartWrap.classList.toggle('is-disabled', smartLocked);
        }
        els.translateModeGotoProBtn?.classList.toggle('hidden', !smartLocked);
    }

    function applyTranslateModeToForm(mode, { fromUser = false } = {}) {
        if (syncingTranslateMode) return;
        syncingTranslateMode = true;
        try {
            const task = readTaskFromForm();
            const allowTranslate = task === 'translate' || task === 'dual';
            let next = mode === 'smart' || mode === 'llm' || mode === 'sakura'
                ? (mode === 'smart' ? 'smart' : 'llm')
                : 'engine';
            if (!allowTranslate) next = 'engine';
            if (next === 'smart' && !canUseSmartTranslateUi()) {
                if (fromUser) {
                    void promptProUnlockRequired({ featureLabel: '智能翻译' });
                }
                const llmId = String(els.engineLlmMtModelSelect?.value || '').trim();
                next = (isSakuraMtModelId(llmId)
                    || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(llmId))
                    ? 'llm'
                    : 'engine';
            }

            setTranslateModeRadios(next);
            if (els.smartTranslateCheck) {
                els.smartTranslateCheck.checked = next === 'smart';
            }

            if (els.engineLlmMtModelSelect && next === 'llm') {
                // Keep empty as「智能选择」; only seed a concrete id when user had none and
                // the select has no auto option yet (legacy). Prefer leaving '' when allowEmpty.
                const cur = els.engineLlmMtModelSelect.value || '';
                if (!String(cur).trim()) {
                    const hasAuto = [...(els.engineLlmMtModelSelect.options || [])]
                        .some((o) => o.value === '');
                    if (!hasAuto) {
                        const fallback = [...(els.engineLlmMtModelSelect.options || [])]
                            .map((o) => o.value)
                            .find((v) => v);
                        els.engineLlmMtModelSelect.value = fallback || 'sakura-1.5b';
                    }
                }
            }

            const hybridOn = next === 'smart'
                && (els.smartTranslateHybridCheck?.checked !== false);
            const opusPickDisabled = next === 'smart' || !allowTranslate;
            const llmPickDisabled = !allowTranslate || (next === 'smart' && !hybridOn);
            if (els.engineMtModelSelect) els.engineMtModelSelect.disabled = opusPickDisabled;
            if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.disabled = llmPickDisabled;
            els.engineMtModelWrap?.classList.toggle('opacity-50', opusPickDisabled);
            els.engineLlmMtModelWrap?.classList.toggle('opacity-50', llmPickDisabled);
            if (els.engineMtModelHint) {
                if (!allowTranslate) {
                    els.engineMtModelHint.textContent = '当前为「原语言」任务，不使用机器翻译模型。';
                } else if (next === 'smart') {
                    els.engineMtModelHint.textContent = '智能翻译不使用引擎 Opus；句级可走推理模型，润色走 Pro 对话模型。';
                } else if (next === 'llm') {
                    els.engineMtModelHint.textContent = '当前为推理翻译，请改用「LLM 推理翻译模型」。';
                } else {
                    els.engineMtModelHint.textContent = '引擎 Opus MT：可留空自动按片源语言选择，或指定已下载的 opus-mt-* 模型。';
                }
            }
            if (els.engineLlmMtModelHint) {
                if (!allowTranslate) {
                    els.engineLlmMtModelHint.textContent = '当前为「原语言」任务，不使用推理翻译模型。';
                } else if (next === 'smart' && hybridOn) {
                    const polishOn = els.smartTranslatePolishCheck?.checked !== false;
                    els.engineLlmMtModelHint.textContent = polishOn
                        ? '智能翻译：句级用此推理模型（Sakura / GalTransl）；可留空自动选用。对话模型做剧情贴合润色。'
                        : '智能翻译：句级用此推理模型（Sakura / GalTransl）；可留空自动选用。贴合润色已关。';
                } else if (next === 'smart') {
                    els.engineLlmMtModelHint.textContent = '智能翻译：句级由 Pro 对话模型按行翻译（混合已关）。人名本地统一。';
                } else if (next === 'llm') {
                    els.engineLlmMtModelHint.textContent = '本地 LLM 推理翻译（Sakura / Qwen 等）：可留空启用自动匹配（按片源语言、Pro 与硬件），或指定已下载模型。';
                } else {
                    els.engineLlmMtModelHint.textContent = '当前为机器翻译；推理翻译请在「常规」切换方式后再选用。';
                }
            }
            if (els.translateModeHint) {
                if (!allowTranslate) {
                    els.translateModeHint.textContent = '「原语言」任务不翻译，上方选项暂时无效。';
                } else if (next === 'smart' && !canUseSmartTranslateUi()) {
                    els.translateModeHint.textContent = '智能翻译为 Pro 专属，请先激活 Pro。';
                } else if (next === 'smart' && hybridOn && els.smartTranslatePolishCheck?.checked !== false) {
                    els.translateModeHint.textContent = 'Pro：专训句级 + 剧情贴合润色（补欠译、锁人名、纠错译）。';
                } else {
                    els.translateModeHint.textContent = '';
                }
            }
        } finally {
            syncingTranslateMode = false;
        }
        // Faithful + lock UI only (avoid re-entering translate mode sync)
        const task = readTaskFromForm();
        const allow = task === 'translate' || task === 'dual';
        syncFaithfulToneUi(allow);
        syncHybridMtUi();
        syncAdvancedFeaturesGate();
        syncTranslateModeChipUi();
        syncMtModelChipUi();
        syncExpertExtraChipsUi();
        updateReadinessStrip();
        // Magic wand tips show effective MT (Sakura vs 智能翻译); refresh when mode changes.
        if (fromUser && !isStandaloneSettings && state.items.some((i) => (
            i?.sense?.status === 'done' || i?.sense?.status === 'error'
        ))) {
            renderList();
        }
    }

    function readOpusMtModelFromForm() {
        return String(els.engineMtModelSelect?.value || '').trim();
    }

    function readLlmMtModelFromForm() {
        // Empty =「智能选择」; resolve at readActive / job start.
        return String(els.engineLlmMtModelSelect?.value || '').trim();
    }

    function contentProfileApi() {
        return global.TransubContentProfile || null;
    }

    function parseVramGbHint() {
        const cachedMb = Number(cachedHardwareRecommend?.vramMb || 0);
        if (cachedMb > 0) return cachedMb / 1024;
        const text = String(els.engineGpuStatus?.textContent || '');
        const m = text.match(/(\d+(?:\.\d+)?)\s*GB/i);
        if (!m) return undefined;
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : undefined;
    }

    function recommendMtContext(extra = {}) {
        return {
            translateMode: readTranslateModeFromForm(),
            language: els.languageSelect?.value || els.quickLanguageSelect?.value || 'auto',
            device: els.deviceSelect?.value || 'cuda',
            vramGb: parseVramGbHint(),
            hwProfile: cachedHardwareRecommend?.profile || '',
            advancedEntitled,
            installedModels: cachedEngineModels,
            ...extra,
        };
    }

    function recommendFormMtModel(extra = {}) {
        const api = contentProfileApi();
        if (typeof api?.recommendFormMtModel === 'function') {
            return api.recommendFormMtModel(recommendMtContext(extra));
        }
        return { id: '', preferId: '', reason: '', mode: readTranslateModeFromForm() };
    }

    function shortMtModelChipLabel(modelId, { auto = false } = {}) {
        if (translateChipApi.shortMtModelChipLabel) {
            return translateChipApi.shortMtModelChipLabel(modelId, { auto });
        }
        if (auto || !modelId) return '自动';
        return String(modelId || '').trim() || '自动';
    }

    function readActiveEngineMtModelFromForm() {
        const mode = readTranslateModeFromForm();
        if (mode === 'smart') return '';
        if (mode === 'llm' || mode === 'sakura') {
            const picked = readLlmMtModelFromForm();
            if (picked) return picked;
            const rec = recommendFormMtModel({ translateMode: 'llm' });
            return String(rec.id || rec.preferId || 'sakura-1.5b').trim();
        }
        return readOpusMtModelFromForm();
    }

    function isMtModelAutoSelected() {
        const mode = readTranslateModeFromForm();
        if (mode === 'smart') {
            if (els.smartTranslateHybridCheck?.checked !== false) {
                return !readLlmMtModelFromForm();
            }
            return !String(cachedSmartTranslatePick?.smartTranslateModelId || '').trim();
        }
        if (mode === 'llm' || mode === 'sakura') return !readLlmMtModelFromForm();
        return !readOpusMtModelFromForm();
    }

    function syncTranslateModeFromOptions(options = {}) {
        const catalog = global.TransubSakuraMtCatalog || global.SakuraMtCatalog;
        if (typeof catalog?.resolveTranslateModeFromOptions === 'function') {
            applyTranslateModeToForm(catalog.resolveTranslateModeFromOptions(options));
            return;
        }
        if (options.translateMode != null && String(options.translateMode).trim() !== '') {
            applyTranslateModeToForm(options.translateMode);
            return;
        }
        const smart = !!options.smartTranslate;
        const mt = options.engineMtModel != null
            ? options.engineMtModel
            : readActiveEngineMtModelFromForm();
        if (smart) applyTranslateModeToForm('smart');
        else if (isSakuraMtModelId(mt) || (catalog?.isLlmInferenceMtModel?.(mt))) {
            applyTranslateModeToForm('llm');
        } else applyTranslateModeToForm('engine');
    }

    function resolveParamsTab(tabId) {
        const raw = String(tabId || '').trim();
        if (!raw) return 'runtime';
        return PARAMS_TAB_ALIASES[raw] || raw;
    }

    function nearlyEqual(a, b, eps = 1e-6) {
        return Math.abs(Number(a) - Number(b)) <= eps;
    }

    function hasExpertCustomizations() {
        return false;
    }

    function syncDeviceOptionsForMode() {
        /* all device options always visible after settings refactor */
    }

    function syncExpertCustomHints() {
        els.transcribeExpertCustomHint?.classList.add('hidden');
    }

    function syncSettingsNavGroups() {
        document.querySelectorAll('[data-settings-nav-group]').forEach((group) => {
            const buttons = Array.from(group.querySelectorAll('.params-tab-btn'));
            const anyVisible = buttons.some((btn) => !btn.classList.contains('settings-nav-hidden'));
            group.classList.toggle('settings-nav-group-empty', buttons.length > 0 && !anyVisible);
        });
    }

    function filterSettingsNav(query) {
        const q = String(query || '').trim().toLowerCase();
        const emptyEl = document.getElementById('settingsSearchEmpty');
        const buttons = els.paramsTabBtns || [];
        const panels = els.paramsTabPanels || [];
        if (!q) {
            buttons.forEach((btn) => btn.classList.remove('settings-nav-hidden'));
            panels.forEach((panel) => {
                panel.querySelectorAll('[data-settings-hit]').forEach((el) => el.removeAttribute('data-settings-hit'));
            });
            emptyEl?.classList.add('hidden');
            syncSettingsNavGroups();
            return;
        }
        let any = false;
        let firstMatch = null;
        panels.forEach((panel) => {
            const tab = panel.dataset.tabPanel;
            const navBtn = buttons.find((b) => b.dataset.tab === tab);
            const hay = [
                panel.dataset.settingsSearch || '',
                panel.textContent || '',
                navBtn?.textContent || '',
                navBtn?.getAttribute('title') || '',
            ].join(' ').toLowerCase();
            const match = hay.includes(q);
            if (navBtn) navBtn.classList.toggle('settings-nav-hidden', !match);
            if (match) {
                any = true;
                if (!firstMatch) firstMatch = tab;
            }
        });
        emptyEl?.classList.toggle('hidden', any);
        syncSettingsNavGroups();
        if (firstMatch && activeParamsTab !== firstMatch) {
            const visible = !buttons.find((b) => b.dataset.tab === activeParamsTab)?.classList.contains('settings-nav-hidden');
            if (!visible) switchParamsTab(firstMatch);
        }
    }

    function bindSettingsSearch() {
        const input = document.getElementById('settingsSearchInput');
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        input.addEventListener('input', () => filterSettingsNav(input.value));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                input.value = '';
                filterSettingsNav('');
                input.blur();
            }
        });
    }

    function closeStandaloneSettingsWindow() {
        try {
            global.close();
        } catch (_) { /* ignore */ }
    }

    const state = {
        items: [],
        running: false,
        dragDepth: 0,
        loadingDepth: 0,
        total: 0,
        index: 0,
        generated: 0,
        skipped: 0,
        failed: 0,
        activePath: '',
        videoProgress: 0,
        videoCurrentSec: 0,
        videoTotalSec: 0,
        itemStage: 'starting',
        itemDualPhase: null,
        /** @type {''|'transub'|'twai'} backend that started the active job */
        jobBackend: '',
        jobStartedAt: 0,
        elapsedTicker: null,
        resourceUsageTicker: null,
        resourceUsageInFlight: false,
        pendingQueue: [],
        postTaskAction: 'none',
        playSoundOnComplete: false,
        postTaskMenuOpen: false,
        addMenuOpen: false,
        moreMenuOpen: false,
        qcBannerDismissed: false,
        qcFixing: false,
        qcSmartFixing: false,
        postBatchBusy: false,
        /** Main-window retranslate-from-kept-transcript batch. */
        retranslateBusy: false,
        retranslateAbort: false,
        /** @type {Array<{ item: object, sourcePath: string, destPath: string, sourceKind: string }>|null} */
        retranslatePlan: null,
        /** Cross-window engine / LLM single-slot busy (main process lock). */
        computeBusy: false,
        computeBusyLabel: '',
        computeBusySince: 0,
        computeBusyOwner: '',
        computeBusyKind: '',
        etaRate: null,
        historyEntries: [],
        /** Normalized media path for the task-library asset rail focus. */
        focusedTaskPath: '',
        /** @type {object|null} last matched library media summary for the rail */
        libraryRailMedia: null,
        lastContentProfile: null,
        autoSenseUi: null,
        senseBusy: false,
        /** @type {{ key: string, dir: 'asc'|'desc' }|null} */
        listSort: null,
    };

    /** @type {Record<string, number>} user-fitted column widths (px) */
    const taskColumnWidths = Object.create(null);

    const TASK_TABLE_COLS = [
        { key: 'check', sortable: false, min: 28, max: 48, pad: 8 },
        { key: 'file', sortable: true, min: 96, max: 2400, pad: 16 },
        { key: 'duration', sortable: true, min: 40, max: 160, pad: 16 },
        { key: 'elapsed', sortable: true, min: 40, max: 160, pad: 16 },
        { key: 'progress', sortable: true, min: 64, max: 240, pad: 16 },
        { key: 'status', sortable: true, min: 120, max: 960, pad: 16 },
        { key: 'qc', sortable: true, min: 36, max: 100, pad: 8 },
        { key: 'actions', sortable: false, min: 72, max: 220, pad: 8 },
    ];

    const TASK_STATUS_SORT_RANK = taskListSortApi.TASK_STATUS_SORT_RANK || {
        pending: 0,
        probing: 1,
        ready: 2,
        running: 3,
        done: 4,
        skipped: 5,
        cancelled: 6,
        failed: 7,
        error: 8,
    };

    const etaApi = global.TransubEta || null;

    function isDesktop() {
        return !!electron?.isDesktop;
    }

    function basename(p) {
        return pathUtils.basename ? pathUtils.basename(p) : (String(p || '').split(/[/\\]/).pop() || '—');
    }

    function normPath(p) {
        return pathUtils.normPath
            ? pathUtils.normPath(p)
            : String(p || '').replace(/\//g, '\\').toLowerCase();
    }

    function esc(s) {
        return pathUtils.esc
            ? pathUtils.esc(s)
            : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDuration(sec) {
        if (pathUtils.formatDuration) return pathUtils.formatDuration(sec);
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    /** 与 transwithai-bridge mapInferStageProgress 保持一致（渲染层兜底） */
    function mapStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
        if (inferProgress.mapStageProgress) {
            return inferProgress.mapStageProgress(stage, rawPct, videoCurrentSec, videoTotalSec);
        }
        const local = Math.max(0, Math.min(100, Number(rawPct) || 0));
        const mediaSec = Number(videoTotalSec) || 0;
        const currentSec = Number(videoCurrentSec) || 0;
        switch (stage) {
            case 'starting':
            case 'vad':
            case 'model':
                return 0;
            case 'transcribe': {
                const timelinePct = mediaSec >= 60
                    ? Math.min(100, Math.round((currentSec / mediaSec) * 100))
                    : local;
                return Math.min(98, Math.round((timelinePct / 100) * 98));
            }
            case 'save': return 99;
            case 'done': return 100;
            default:
                return stageRank(stage) >= stageRank('transcribe')
                    ? Math.min(98, local)
                    : 0;
        }
    }

    function elapsedSecSince(ts) {
        if (!ts) return 0;
        return Math.max(0, Math.floor((Date.now() - ts) / 1000));
    }

    function itemElapsedSec(item) {
        if (!item.startedAt) return 0;
        const endTs = item.status === 'running' ? Date.now() : (item.completedAt || item.startedAt);
        return Math.max(0, Math.floor((endTs - item.startedAt) / 1000));
    }

    function formatElapsedCell(item) {
        if (progressDisplayApi.formatElapsedCell) {
            return progressDisplayApi.formatElapsedCell(item, {
                formatDuration,
                itemElapsedSec,
            });
        }
        if (item.status === 'pending' || item.status === 'ready') return '—';
        if (!item.startedAt) return '—';
        return formatDuration(itemElapsedSec(item));
    }

    function formatProcessedCell(item) {
        if (progressDisplayApi.formatProcessedCell) {
            return progressDisplayApi.formatProcessedCell(item, { formatDuration });
        }
        return '—';
    }

    function bumpProgress(current, next) {
        if (inferProgress.bumpProgress) return inferProgress.bumpProgress(current, next);
        const cur = Math.max(0, Math.min(99, Number(current) || 0));
        const nxt = Math.max(0, Math.min(99, Number(next) || 0));
        return Math.max(cur, nxt);
    }

    function isPreTranscribeStage(stage) {
        if (inferProgress.isPreTranscribeStage) return inferProgress.isPreTranscribeStage(stage);
        return stageRank(stage) < stageRank('transcribe');
    }

    function startElapsedTicker() {
        if (state.elapsedTicker) return;
        state.elapsedTicker = setInterval(() => {
            if (!state.running && !state.retranslateBusy) {
                stopElapsedTicker();
                return;
            }
            if (state.running) updateProgressUi();
            // Avoid full-table rebuild every second — only refresh running rows
            state.items.forEach((item, idx) => {
                if (item.status === 'running') refreshListRowByIndex(idx);
            });
        }, 1000);
    }

    function stopElapsedTicker() {
        if (!state.elapsedTicker) return;
        clearInterval(state.elapsedTicker);
        state.elapsedTicker = null;
    }


    function isShowTaskResourceUsageEnabled() {
        if (els.showTaskResourceUsageCheck) {
            return !!els.showTaskResourceUsageCheck.checked;
        }
        return savedOptionsSnapshot?.showTaskResourceUsage !== false;
    }

    function clearResourceUsageLabel() {
        if (!els.resourceUsageLabel) return;
        els.resourceUsageLabel.textContent = '';
        els.resourceUsageLabel.classList.add('hidden');
        els.resourceUsageLabel.removeAttribute('title');
    }

    function setResourceUsageLabel(text) {
        if (!els.resourceUsageLabel) return;
        const t = String(text || '').trim();
        if (!t) {
            clearResourceUsageLabel();
            return;
        }
        els.resourceUsageLabel.textContent = t;
        els.resourceUsageLabel.title = `整机资源占用（约 2 秒刷新）\n${t}`;
        els.resourceUsageLabel.classList.remove('hidden');
    }

    async function refreshResourceUsageLabel() {
        if (!isShowTaskResourceUsageEnabled() || !state.running) {
            clearResourceUsageLabel();
            return;
        }
        if (!electron?.transubGetSystemResources) return;
        if (state.resourceUsageInFlight) return;
        state.resourceUsageInFlight = true;
        try {
            const sample = await electron.transubGetSystemResources({ includeGpu: true });
            if (!state.running || !isShowTaskResourceUsageEnabled()) {
                clearResourceUsageLabel();
                return;
            }
            const text = String(sample?.text || '').trim();
            // First CPU sample often lacks a baseline — keep prior text if empty.
            if (text) setResourceUsageLabel(text);
            else if (!els.resourceUsageLabel?.textContent) {
                setResourceUsageLabel('采样中…');
            }
        } catch {
            /* ignore transient IPC errors */
        } finally {
            state.resourceUsageInFlight = false;
        }
    }

    function stopResourceUsageMonitor() {
        if (state.resourceUsageTicker) {
            clearInterval(state.resourceUsageTicker);
            state.resourceUsageTicker = null;
        }
        state.resourceUsageInFlight = false;
        clearResourceUsageLabel();
    }

    function syncResourceUsageMonitor() {
        const want = state.running && isShowTaskResourceUsageEnabled();
        if (!want) {
            stopResourceUsageMonitor();
            return;
        }
        if (state.resourceUsageTicker) return;
        void refreshResourceUsageLabel();
        state.resourceUsageTicker = setInterval(() => {
            if (!state.running || !isShowTaskResourceUsageEnabled()) {
                stopResourceUsageMonitor();
                return;
            }
            void refreshResourceUsageLabel();
        }, 2000);
    }

    function bindResourceUsageSetting() {
        els.showTaskResourceUsageCheck?.addEventListener('change', () => {
            syncResourceUsageMonitor();
            markSettingsDirty(true);
        });
        els.rememberLastOpenDirCheck?.addEventListener('change', () => {
            markSettingsDirty(true);
        });
    }

    function isVideoPath(filePath) {
        if (typeof mediaExt.isMediaExt === 'function') return mediaExt.isMediaExt(filePath);
        const ext = String(filePath || '').split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() || '';
        return MEDIA_EXTENSIONS.has(ext);
    }

    function isVideoFile(file, filePath) {
        const path = String(filePath || '').trim();
        if (path && isVideoPath(path)) return true;
        const mime = String(file?.type || '').toLowerCase();
        if (typeof mediaExt.isMediaMimeType === 'function') {
            if (mediaExt.isMediaMimeType(mime)) return true;
        } else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
            return true;
        }
        const name = String(file?.name || path || '').trim();
        return name && isVideoPath(name);
    }

    function pathFromDroppedFile(file) {
        if (!file) return '';
        const legacy = file.path || '';
        if (legacy) return legacy;
        return electron?.getPathForFile?.(file) || '';
    }

    function pathsFromFileList(fileList) {
        const paths = [];
        for (const file of fileList || []) {
            const p = pathFromDroppedFile(file);
            if (p && isVideoFile(file, p)) paths.push(p);
        }
        return paths;
    }

    function pathsFromDataTransfer(dt) {
        const paths = [];
        if (!dt) return paths;

        if (dt.items?.length) {
            for (const item of dt.items) {
                if (item.kind !== 'file') continue;
                const file = item.getAsFile();
                const p = pathFromDroppedFile(file);
                if (p && isVideoFile(file, p)) paths.push(p);
            }
            if (paths.length) return paths;
        }

        return pathsFromFileList(dt.files);
    }

    function cacheEls() {
        [
            'loadingOverlay', 'loadingMessage',
            'appBrandName', 'appVersionLabel', 'headerSettingsDirtyBadge', 'paramsSummary', 'paramsChips',
            'quickTaskSelect', 'quickLanguageSelect', 'quickTargetLangSelect', 'quickTargetLangWrap',
            'quickFormatLabel',
            'translateMenuWrap', 'translateMenu', 'quickTranslateBtn', 'quickTranslateLabel',
            'translateMtSection', 'translateMtSectionLabel', 'translateMtPickSwitch', 'translateMtAutoBtn', 'translateMtManualBtn',
            'translateMtAutoDesc', 'translateMtAutoHint', 'translateMtModelListWrap', 'translateMtModelList',
            'paramsSceneCards',
            'paramsMoreMenuWrap', 'paramsMoreBtn', 'paramsMoreMenu', 'paramsMoreLabel',
            'paramsMoreExtrasHost', 'paramsExpertExtraChips',
            'expertDrawerMenuWrap', 'expertDrawerBody', 'expertDrawerToggle', 'expertDrawerToggleLabel',
            'expertDrawerSenseHint', 'quickAsrChipGroup',
            'quickLanguageChip',
            'quickAsrModelSelect', 'quickVadModelSelect',
            'quickAsrRecommendBtn',
            'quickPerfProfileSelect', 'quickPerfProfileChip',
            'quickVadSensitiveCheck', 'quickVadSensitiveWrap',
            'quickFaithfulCheck', 'quickFaithfulWrap',
            'quickGlossaryMtCheck', 'quickGlossaryMtWrap',
            'readinessStrip', 'readinessStripText', 'readinessStripAction',
            'paramsModeMenuWrap', 'paramsModeChip', 'paramsModeBtn', 'paramsModeLabel', 'paramsModeMenu', 'paramsModePresetList',
            'paramsModePresetTabs', 'paramsModeCustomHint',
            'paramsModeAsrSection', 'paramsModeAsrSectionLabel', 'paramsModeAsrPickSwitch',
            'paramsModeAsrAutoBtn', 'paramsModeAsrManualBtn', 'paramsModeAsrHint',
            'paramsModeAsrModelListWrap', 'paramsModeAsrModelList',
            'postBatchQcFixLabel', 'postBatchQcFixMenuWrap', 'postBatchQcFixMenu',
            'senseMemoryStatus', 'clearSenseMemoryBtn',
            'transWithAiStatus', 'openFeedbackBtn', 'openParamsBtn',
            'moreMenuWrap', 'moreMenuBtn', 'moreMenu', 'openLibraryToolbarBtn', 'toggleDensityBtn', 'toggleDensityLabel',
            'openAboutBtn', 'openMtTrainMenuBtn',
            'envBanner', 'envBannerText', 'envBannerBtn', 'envBannerWizardBtn',
            'qcBanner', 'qcBannerText', 'qcBannerFixBtn', 'qcBannerSmartFixBtn', 'qcBannerViewBtn', 'qcBannerDismissBtn',
            'emptyStateEnvHint', 'emptyStateWizardBtn', 'emptyStateEnvBtn',
            'toggleMainThemeBtn', 'toggleMainThemeLabel', 'openShortcutsMenuBtn',
            'paramsModal', 'closeParamsBtn', 'cancelParamsBtn', 'saveAndCloseParamsBtn', 'settingsDirtyBadge',
            'settingsGotoInstallBtn', 'openSetupWizardFromGuideBtn',
            'translateModeEngine', 'translateModeSakura', 'translateModeSmart',
            'translateModeEngineWrap', 'translateModeSakuraWrap', 'translateModeSmartWrap',
            'translateModeGotoProBtn', 'translateModeHint', 'translateModeFieldset',
            'advancedFeaturesLockHint', 'advancedFeaturesGotoProBtn',
            'engineBackendSelect', 'engineSettingsBlock', 'twaiSettingsBlock', 'twaiCompatFieldset', 'twaiCompatDetails',
            'engineInstallPathInput', 'engineInstallBrowseBtn', 'engineInstallUseBundledBtn', 'engineUrlInput',
            'engineHfEndpointInput', 'engineHfTokenInput', 'engineHfMirrorPresetBtn', 'engineHfOfficialPresetBtn', 'engineHfTestBtn', 'networkHfStatus',
            'proxyEnabledCheck', 'proxyUrlInput', 'proxyBypassInput', 'proxyTestBtn', 'proxyTestStatus', 'proxySettingsFields',
            'engineProfileSelect', 'perfProfileSelect', 'engineAsrModelSelect',
            'asrRecommendChip', 'asrRecommendChipLabel', 'asrRecommendChipDetail',
            'asrRecommendApplyBtn', 'asrRecommendDismissBtn',
            'engineMtModelSelect', 'engineMtModelWrap', 'engineMtModelHint',
            'engineLlmMtModelSelect', 'engineLlmMtModelWrap', 'engineLlmMtModelHint',
            'engineVadModelSelect',
            'engineAutoStartCheck', 'engineTestBtn',
            'engineCancelDownloadBtn',
            'engineEnsureGpuBtn', 'engineManualGpuBtn', 'engineGpuStatus',
            'engineRefreshModelsBtn', 'engineRefreshModelsSummaryBtn',
            'openEngineModelsLibraryBtn', 'closeEngineModelsLibraryBtn', 'engineModelsLibraryModal',
            'engineModelsLibraryTabSummary', 'engineModelsLibraryDlStrip', 'engineModelsLibraryDlStripText',
            'engineDownloadProgress', 'engineDownloadProgressBar',
            'engineDownloadProgressText', 'engineDownloadProgressPct', 'engineDownloadLog',
            'engineModelsPanel', 'engineModelsSummary', 'engineModelsSelectedHint', 'engineModelsList',
            'engineModelsSearch', 'engineModelsFilters',
            'engineStatus',
            'installPathInput', 'installBrowseBtn', 'installTestBtn', 'installCheckUpdateBtn',
            'transcribeModelSelect', 'translateModelSelect', 'modelSelectHint',
            'transcribeModelPathInput', 'translateModelPathInput',
            'transcribeModelBrowseBtn', 'translateModelBrowseBtn',
            'deviceSelect', 'taskSelect', 'overwriteCheck', 'mergeBilingualCheck', 'mergeBilingualWrap', 'mergeBilingualHint',
            'mergeBilingualOrderSelect', 'mergeBilingualOrderWrap',
            'smartTranslateCheck', 'smartTranslateWrap',
            'smartTranslateFaithfulCheck', 'smartTranslateFaithfulWrap',
            'smartTranslateHybridCheck', 'smartTranslateHybridWrap',
            'smartTranslatePolishCheck', 'smartTranslatePolishWrap',
            'smartTranslateVerifyCheck', 'smartTranslateVerifyWrap',
            'smartTranslateAddressCheck', 'smartTranslateAddressWrap',
            'smartTranslatePolishLimitInput', 'smartTranslatePolishLimitWrap',
            'asrSecondOpinionSelect',
            'filmAudioEnhanceCheck', 'filmAudioEnhanceWrap',
            'filmVadPresetCheck', 'filmVadPresetWrap',
            'filmVadThresholdInput', 'filmVadMinSpeechInput', 'filmVadMinSilenceInput',
            'filmHallucinationSilenceInput',
            'qcSmartLlmSplitCheck', 'qcSmartRetranscribeCheck', 'qcSmartSemanticReviewCheck',
            'qcSmartIntensitySelect', 'qcSmartMaxRetranscribeInput',
            'libraryOpenAfterBatchCheck',
            'deleteSourcesAfterMergeCheck', 'deleteSourcesAfterMergeWrap',
            'deviceExpertHint', 'maxBatchSizeWrap', 'maxBatchSizeInput', 'logLevelSelect', 'logLevelHint',
            'subFormatSrt', 'subFormatVtt', 'subFormatAss', 'subFormatLrc',
            'subFormatAssWrap', 'subFormatLrcWrap', 'engineOutputExtrasWrap',
            'releaseGpuAfterCheck',
            'glossaryMtCheck', 'glossaryMtWrap',
            'chineseSubtitleVariantSelect',
            'languageSelect', 'beamSizeInput', 'vadThresholdInput',
            'vadMinSpeechDurationInput', 'vadMinSilenceDurationInput', 'vadSpeechPadInput',
            'vadEnabledCheck', 'vadSensitiveCheck', 'vadAggressiveCheck', 'vadMaxSingleSegmentInput',
            'hallucinationSilenceInput',
            'audioLightDenoiseCheck',
            'transcribeExpertCustomHint',
            'retranscribeWarmLightCheck', 'subtitleBakModeSelect',
            'keepTranscriptCheck', 'transcriptKeepDirInput', 'transcriptKeepLimitInput',
            'transcriptKeepDaysInput', 'clearTranscriptCacheBtn', 'historySettingsStatus',
            'trayProgressCheck', 'showTaskResourceUsageCheck', 'rememberLastOpenDirCheck', 'minimizeToTrayCheck', 'minimizeToTrayOnStartCheck', 'trayNotifyCheck',
            'startupWindowSelect', 'uiLocaleSelect', 'autoUpdateCheckIntervalSelect',
            'postBatchQcCheck', 'postBatchQcFixModeSelect', 'postBatchCpsSplitCheck', 'postBatchRemoveNoiseCheck', 'postBatchCompressRepCheck',
            'postBatchViewingPunctModeSelect', 'postBatchInterjectionModeSelect', 'postBatchOnomatopoeiaModeSelect',
            'qcSilenceSplitCharsInput',
            'autoDeepSenseCheck',
            'trialCompareBtn', 'trialCompareModal', 'closeTrialCompareBtn', 'closeTrialCompareBtn2',
            'runTrialCompareBtn', 'trialDurationInput', 'trialPresetASelect', 'trialPresetBSelect',
            'trialCompareStatus', 'trialCompareResult',
            'postTaskMenuBtn', 'postTaskMenu', 'postTaskMenuWrap', 'postTaskMenuItems', 'postTaskMenuLabel',
            'shutdownDelayInput', 'shutdownDelayWrap', 'playSoundOnCompleteCheck',
            'presetSelect', 'savePresetBtn', 'outputModeSelect', 'outputDirInput', 'outputDirWrap', 'outputDirBrowseBtn', 'audioSuffixesInput',
            'ffmpegPathInput', 'ffmpegBrowseBtn', 'ffmpegFolderBtn', 'ffmpegTestBtn', 'ffmpegStatus',
            'addMenuBtn', 'addMenu', 'addMenuWrap',
            'pendingQueueBadge',
            'emptyState', 'listScroll', 'emptyAddVideosBtn', 'emptyAddFolderBtn',
            'logCollapseBtn', 'logSectionBody', 'logSection', 'clearLogBtn', 'copyLogBtn', 'progressEta',
            'saveParamsBtn', 'saveParamsStatus',
            'jobStatusBadge', 'progressLabel', 'progressCount', 'progressBar', 'resourceUsageLabel',
            'currentFile', 'logHost',
            'removeSelectedBtn', 'clearListBtn', 'startBtn', 'selectAllCheck',
            'openSubtitleFileBtn', 'retranslateBtn', 'reconstructBtn', 'paramsProActions',
            'retranslateModal', 'retranslateModalSummary', 'retranslateModalMissing',
            'retranslateModeEngine', 'retranslateModeLlm', 'retranslateModeSmart',
            'retranslateModeSmartWrap', 'retranslateSmartOptions',
            'retranslateSmartHybridCheck', 'retranslateSmartHybridWrap',
            'retranslateSmartPolishCheck', 'retranslateSmartPolishWrap', 'retranslateSmartSchemeHint',
            'retranslateHybridMtWrap', 'retranslateHybridMtLabel', 'retranslateHybridMtSelect',
            'retranslateModelWrap', 'retranslateModelLabel',
            'retranslateModelSelect', 'retranslateModelHint', 'retranslateCancelBtn',
            'retranslateConfirmBtn',
            'fileListBody', 'emptyListRow', 'stopBtn', 'asrWindowTip', 'filePanel', 'dropZone', 'dropOverlay',
            'taskWorkspace',
            'mainSplitHost', 'mainLogSplitter', 'taskRowContextMenu', 'taskColContextMenu',
            'subtitleTaskTable', 'taskTableHead', 'taskTableColgroup',
        ].forEach((id) => { els[id] = document.getElementById(id); });
        els.paramsTabBtns = Array.from(document.querySelectorAll('.params-tab-btn'));
        els.paramsTabPanels = Array.from(document.querySelectorAll('.params-tab-panel'));
        els.postTaskMenuItems = Array.from(document.querySelectorAll('#postTaskMenu .post-task-menu-item'));
        els.addMenuItems = Array.from(document.querySelectorAll('[data-add-action]'));
    }

    function getPostTaskAction() {
        const action = state.postTaskAction || 'none';
        if (postTaskQcApi.normalizePostTaskAction) {
            return postTaskQcApi.normalizePostTaskAction(action);
        }
        return POST_TASK_SELECT_VALUES.has(action) ? action : 'none';
    }

    function setPostTaskAction(action) {
        let next = postTaskQcApi.normalizePostTaskAction
            ? postTaskQcApi.normalizePostTaskAction(action)
            : (POST_TASK_SELECT_VALUES.has(action) ? action : 'none');
        if (next === 'shutdown') {
            void appConfirm({
                title: '确认关机',
                message: '全部成功后将关机。确定选择「关机」吗？',
                primaryLabel: '确定',
                secondaryLabel: '取消',
            }).then((ok) => {
                if (!ok) next = getPostTaskAction();
                else {
                    state.postTaskAction = 'shutdown';
                    syncPostTaskMenuUi();
                    syncPostTaskExtrasUi();
                    syncPostTaskToMain();
                }
            });
            return;
        }
        state.postTaskAction = next;
        syncPostTaskMenuUi();
        syncPostTaskExtrasUi();
        syncPostTaskToMain();
    }

    function syncPostTaskMenuUi() {
        const action = getPostTaskAction();
        const label = postTaskQcApi.postTaskActionLabel
            ? postTaskQcApi.postTaskActionLabel(action)
            : (POST_TASK_LABELS[action] || POST_TASK_LABELS.none);
        els.postTaskMenuBtn?.classList.toggle('active', action !== 'none');
        if (els.postTaskMenuLabel) {
            els.postTaskMenuLabel.textContent = action === 'none' ? '完成后' : label;
        }
        if (els.postTaskMenuBtn) {
            els.postTaskMenuBtn.title = action === 'none'
                ? '任务完成后操作'
                : `任务完成后：${label}`;
        }
        els.postTaskMenuItems?.forEach((item) => {
            const active = item.dataset.postTask === action;
            item.classList.toggle('active', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
    }

    function setPostTaskMenuOpen(open) {
        state.postTaskMenuOpen = !!open;
        els.postTaskMenu?.classList.toggle('hidden', !open);
        if (els.postTaskMenuBtn) {
            els.postTaskMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open) {
            setAddMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setMtModelMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
            setExpertExtrasMenuOpen(false);
        }
    }

    function setAddMenuOpen(open) {
        state.addMenuOpen = !!open;
        els.addMenu?.classList.toggle('hidden', !open);
        if (els.addMenuBtn) {
            els.addMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open) {
            setPostTaskMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setMtModelMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
            setExpertExtrasMenuOpen(false);
        }
    }

    function toggleAddMenu() {
        setAddMenuOpen(!state.addMenuOpen);
    }

    function bindAddMenu() {
        els.addMenuBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleAddMenu();
        });
        els.addMenuItems?.forEach((item) => {
            item.addEventListener('click', async (event) => {
                event.stopPropagation();
                setAddMenuOpen(false);
                const action = item.dataset.addAction;
                if (action === 'videos') await addVideos();
                else if (action === 'folder') await addFolder();
            });
        });
        els.addMenu?.addEventListener('click', (event) => event.stopPropagation());
    }

    function togglePostTaskMenu() {
        setPostTaskMenuOpen(!state.postTaskMenuOpen);
    }

    function bindPostTaskMenu() {
        els.postTaskMenuBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePostTaskMenu();
        });
        els.postTaskMenuItems?.forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setPostTaskAction(item.dataset.postTask || 'none');
                setPostTaskMenuOpen(false);
            });
        });
        els.playSoundOnCompleteCheck?.addEventListener('change', () => {
            state.playSoundOnComplete = !!els.playSoundOnCompleteCheck.checked;
            syncPostTaskToMain();
        });
        els.playSoundOnCompleteCheck?.addEventListener('click', (event) => event.stopPropagation());
        els.postTaskMenu?.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', () => {
            if (state.postTaskMenuOpen) setPostTaskMenuOpen(false);
            if (state.addMenuOpen) setAddMenuOpen(false);
            if (state.moreMenuOpen) setMoreMenuOpen(false);
            if (translateMenuOpen) setTranslateMenuOpen(false);
            if (paramsMoreMenuOpen) setParamsMoreMenuOpen(false);
            if (expertExtrasMenuOpen) setExpertExtrasMenuOpen(false);
            if (postBatchQcFixMenuOpen) setPostBatchQcFixMenuOpen(false);
            if (paramsModeMenuOpen) setParamsModeMenuOpen(false);
        });
    }

    function setMoreMenuOpen(open) {
        state.moreMenuOpen = !!open;
        els.moreMenu?.classList.toggle('hidden', !open);
        if (els.moreMenuBtn) {
            els.moreMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setMtModelMenuOpen(false);
            setParamsMoreMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
            setExpertExtrasMenuOpen(false);
        }
    }

    const LOG_HEIGHT_KEY = 'transub.logHeight';
    const DEFAULT_LOG_HEIGHT = 168;
    const MIN_LOG_HEIGHT = 96;
    const MIN_LIST_HEIGHT = 160;

    function readStoredLogHeight() {
        try {
            const n = Number(localStorage.getItem(LOG_HEIGHT_KEY));
            if (Number.isFinite(n) && n >= MIN_LOG_HEIGHT) return Math.round(n);
        } catch (_) { /* ignore */ }
        return DEFAULT_LOG_HEIGHT;
    }

    function writeStoredLogHeight(px) {
        try {
            localStorage.setItem(LOG_HEIGHT_KEY, String(Math.round(px)));
        } catch (_) { /* ignore */ }
    }

    function clampLogHeight(px, hostHeight) {
        const hostH = Math.max(0, Number(hostHeight) || 0);
        const maxLog = hostH > 0
            ? Math.max(MIN_LOG_HEIGHT, hostH - MIN_LIST_HEIGHT)
            : Math.max(MIN_LOG_HEIGHT, px);
        return Math.min(maxLog, Math.max(MIN_LOG_HEIGHT, Math.round(px)));
    }

    function applyLogSplitLayout() {
        const host = els.mainSplitHost;
        const log = els.logSection;
        if (!host || !log) return;
        if (document.body.classList.contains('log-collapsed')) {
            log.style.height = '';
            log.style.flex = '';
            return;
        }
        const hostH = host.getBoundingClientRect().height;
        const h = clampLogHeight(readStoredLogHeight(), hostH);
        log.style.height = `${h}px`;
        log.style.flex = '0 0 auto';
    }

    function syncLocalThemeKeys(theme) {
        const t = theme === 'dark' ? 'dark' : 'light';
        try {
            localStorage.setItem('transub.mainTheme', t);
            localStorage.setItem('transub-editor-theme', t);
        } catch (_) { /* ignore */ }
        const sel = document.getElementById('appThemeSelect')
            || document.getElementById('editorThemeSelect');
        if (sel) sel.value = t;
    }

    function applyUiPrefs() {
        let density = 'comfort';
        let logCollapsed = true;
        let mainTheme = 'light';
        try {
            density = localStorage.getItem('transub.density') || 'comfort';
            logCollapsed = localStorage.getItem('transub.logCollapsed') !== '0';
            mainTheme = localStorage.getItem('transub.mainTheme')
                || localStorage.getItem('transub-editor-theme')
                || 'light';
        } catch (_) { /* ignore */ }
        mainTheme = mainTheme === 'dark' ? 'dark' : 'light';
        syncLocalThemeKeys(mainTheme);
        document.body.classList.toggle('density-compact', density === 'compact');
        document.body.classList.toggle('log-collapsed', logCollapsed);
        document.documentElement.classList.toggle('main-theme-dark', mainTheme === 'dark');
        try {
            document.documentElement.style.colorScheme = mainTheme === 'dark' ? 'dark' : 'light';
        } catch (_) { /* ignore */ }
        if (els.toggleDensityLabel) {
            els.toggleDensityLabel.textContent = density === 'compact' ? '舒适列表' : '紧凑列表';
        }
        if (els.toggleMainThemeLabel) {
            els.toggleMainThemeLabel.textContent = mainTheme === 'dark' ? '浅色界面' : '深色界面';
        }
        if (els.logCollapseBtn) {
            els.logCollapseBtn.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
        }
        applyLogSplitLayout();
    }

    async function hydrateAppThemeFromMain() {
        try {
            const res = await electron?.transubGetAppTheme?.();
            let theme = res?.theme === 'dark' ? 'dark' : 'light';
            if (!res?.persisted) {
                let localDark = false;
                try {
                    localDark = localStorage.getItem('transub.mainTheme') === 'dark'
                        || localStorage.getItem('transub-editor-theme') === 'dark';
                } catch (_) { /* ignore */ }
                if (localDark && theme !== 'dark') {
                    await electron?.transubSetAppTheme?.({ theme: 'dark' });
                    theme = 'dark';
                }
            }
            syncLocalThemeKeys(theme);
            applyUiPrefs();
        } catch (_) {
            applyUiPrefs();
        }
    }

    function bindMainLogSplitter() {
        const splitter = els.mainLogSplitter;
        const host = els.mainSplitHost;
        const log = els.logSection;
        if (!splitter || !host || !log || splitter.dataset.bound === '1') return;
        splitter.dataset.bound = '1';

        const beginDrag = (clientY) => {
            if (document.body.classList.contains('log-collapsed')) {
                ensureLogExpanded();
            }
            const startY = clientY;
            const startH = log.getBoundingClientRect().height || readStoredLogHeight();
            const hostH = host.getBoundingClientRect().height;
            splitter.classList.add('is-dragging');
            document.body.classList.add('main-log-splitting');

            const onMove = (ev) => {
                const y = ev.touches?.[0]?.clientY ?? ev.clientY;
                if (!Number.isFinite(y)) return;
                // Dragging the handle upward enlarges the log pane.
                const next = clampLogHeight(startH + (startY - y), hostH);
                log.style.height = `${next}px`;
                log.style.flex = '0 0 auto';
            };
            const onUp = (ev) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
                window.removeEventListener('touchcancel', onUp);
                splitter.classList.remove('is-dragging');
                document.body.classList.remove('main-log-splitting');
                const y = ev?.changedTouches?.[0]?.clientY ?? ev?.clientY;
                if (Number.isFinite(y)) {
                    const next = clampLogHeight(startH + (startY - y), host.getBoundingClientRect().height);
                    writeStoredLogHeight(next);
                    log.style.height = `${next}px`;
                } else {
                    writeStoredLogHeight(log.getBoundingClientRect().height || startH);
                }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
            window.addEventListener('touchcancel', onUp);
        };

        splitter.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            beginDrag(e.clientY);
        });
        splitter.addEventListener('touchstart', (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            e.preventDefault();
            beginDrag(t.clientY);
        }, { passive: false });
        splitter.addEventListener('dblclick', () => {
            writeStoredLogHeight(DEFAULT_LOG_HEIGHT);
            ensureLogExpanded();
            applyLogSplitLayout();
        });
        splitter.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            ensureLogExpanded();
            const hostH = host.getBoundingClientRect().height;
            const cur = log.getBoundingClientRect().height || readStoredLogHeight();
            const step = e.shiftKey ? 48 : 16;
            const delta = e.key === 'ArrowUp' ? step : -step;
            const next = clampLogHeight(cur + delta, hostH);
            writeStoredLogHeight(next);
            applyLogSplitLayout();
        });

        window.addEventListener('resize', () => {
            if (document.body.classList.contains('log-collapsed')) return;
            applyLogSplitLayout();
        });
        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(() => {
                if (document.body.classList.contains('log-collapsed')) return;
                if (document.body.classList.contains('main-log-splitting')) return;
                applyLogSplitLayout();
            });
            ro.observe(host);
        }
    }

    function toggleMainTheme() {
        const next = document.documentElement.classList.contains('main-theme-dark') ? 'light' : 'dark';
        syncLocalThemeKeys(next);
        applyUiPrefs();
        void electron?.transubSetAppTheme?.({ theme: next });
    }

    function toggleDensity() {
        const next = document.body.classList.contains('density-compact') ? 'comfort' : 'compact';
        try { localStorage.setItem('transub.density', next); } catch (_) { /* ignore */ }
        applyUiPrefs();
    }

    function toggleLogCollapsed() {
        const nextCollapsed = !document.body.classList.contains('log-collapsed');
        try { localStorage.setItem('transub.logCollapsed', nextCollapsed ? '1' : '0'); } catch (_) { /* ignore */ }
        applyUiPrefs();
    }

    function ensureLogExpanded() {
        if (!document.body.classList.contains('log-collapsed')) return;
        try { localStorage.setItem('transub.logCollapsed', '0'); } catch (_) { /* ignore */ }
        applyUiPrefs();
    }

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!el.isContentEditable;
    }

    function bindSettingsGuideLinks() {
        els.settingsGotoInstallBtn?.addEventListener('click', () => switchParamsTab('install'));
        els.openSetupWizardFromGuideBtn?.addEventListener('click', () => {
            void global.TransubSetupWizard?.open?.({ force: false });
        });
        els.translateModeGotoProBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!advancedEntitled) {
                void promptProUnlockRequired({ featureLabel: '智能翻译' });
                return;
            }
            switchParamsTab('pro-llm');
        });
        els.advancedFeaturesGotoProBtn?.addEventListener('click', () => switchParamsTab('pro'));
        const bindGoto = (id, tab) => {
            document.getElementById(id)?.addEventListener('click', (e) => {
                e.preventDefault();
                switchParamsTab(tab);
            });
        };
        bindGoto('runtimeGotoProSmartTranslateBtn', 'pro-smart-translate');
        bindGoto('runtimeGotoProLlmBtn', 'pro-llm');
        bindGoto('runtimeGotoProFilmAudioBtn', 'pro-film-audio');
        bindGoto('runtimeGotoProQcBtn', 'pro-qc-smart');
        bindGoto('processGotoProQcBtn', 'pro-qc-smart');
        bindGoto('proSmartGotoLlmBtn', 'pro-llm');
        bindGoto('proFilmAudioGotoProcessBtn', 'process');
        bindGoto('proFilmAudioGotoModelsBtn', 'models');
        bindGoto('proQcGotoProcessBtn', 'process');
        bindGoto('proQcGotoProcessAsrBtn', 'process');
        bindGoto('proQcGotoLlmBtn', 'pro-llm');

        const bindProLockedClick = (el, featureLabel) => {
            el?.addEventListener('click', (e) => {
                if (advancedEntitled) return;
                if (e.target?.closest?.('.settings-tip, .settings-tip-btn, .settings-tip-bubble')) return;
                e.preventDefault();
                e.stopPropagation();
                void promptProUnlockRequired({ featureLabel });
            }, true);
        };
        bindProLockedClick(els.translateModeSmartWrap, '智能翻译');
        bindProLockedClick(els.filmAudioEnhanceWrap, '影视音频增强');
        bindProLockedClick(els.filmVadPresetWrap, '影视音频增强');
        bindProLockedClick(els.retranslateModeSmartWrap, '智能翻译');
    }

    function bindMainUiExtras() {
        bindMainLogSplitter();
        els.moreMenuBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setMoreMenuOpen(!state.moreMenuOpen);
        });
        els.moreMenu?.addEventListener('click', (event) => {
            const item = event.target.closest('[role="menuitem"]');
            if (item) setMoreMenuOpen(false);
            event.stopPropagation();
        });
        els.toggleDensityBtn?.addEventListener('click', () => {
            toggleDensity();
            setMoreMenuOpen(false);
        });
        els.openAboutBtn?.addEventListener('click', () => {
            setMoreMenuOpen(false);
            void electron?.transubOpenAboutWindow?.();
        });
        (async () => {
            const btn = els.openMtTrainMenuBtn;
            if (!btn) return;
            const hideTrainMenu = () => {
                btn.classList.add('hidden');
                btn.setAttribute('hidden', '');
                btn.remove();
            };
            try {
                let canOpen = false;
                if (typeof electron?.transubMtTrainAccess === 'function') {
                    const access = await electron.transubMtTrainAccess();
                    canOpen = !!access?.canOpen;
                } else if (typeof electron?.transubIsDevBuild === 'function') {
                    const st = await electron.transubIsDevBuild();
                    canOpen = !!st?.isDev;
                }
                if (!canOpen) {
                    hideTrainMenu();
                    return;
                }
                btn.classList.remove('hidden');
                btn.removeAttribute('hidden');
                btn.addEventListener('click', () => {
                    setMoreMenuOpen(false);
                    void electron?.transubOpenMtTrain?.().then((res) => {
                        if (res?.ok === false) {
                            appendLog?.(res.error || '打开学习向导失败', 'err');
                        }
                    });
                });
            } catch (_) {
                hideTrainMenu();
            }
        })();
        els.openLibraryToolbarBtn?.addEventListener('click', () => {
            void global.TransubFeatures?.openSubtitleLibrary?.();
        });
        els.emptyAddVideosBtn?.addEventListener('click', () => addVideos());
        els.emptyAddFolderBtn?.addEventListener('click', () => addFolder());
        els.qcBannerDismissBtn?.addEventListener('click', () => {
            state.qcBannerDismissed = true;
            updateQcBanner();
        });
        els.qcBannerFixBtn?.addEventListener('click', () => {
            void runPostBatchQcFix();
        });
        els.qcBannerSmartFixBtn?.addEventListener('click', () => {
            void runPostBatchQcSmartFix();
        });
        els.qcBannerViewBtn?.addEventListener('click', () => {
            openFirstQcIssueItem();
        });
        els.emptyStateWizardBtn?.addEventListener('click', () => {
            void global.TransubSetupWizard?.open?.({ force: false });
        });
        els.emptyStateEnvBtn?.addEventListener('click', () => {
            openAppSettings('install');
        });
        els.readinessStripAction?.addEventListener('click', () => {
            const action = els.readinessStripAction.dataset.action || 'install';
            if (action === 'wizard') openAppSettings('install', { wizard: true });
            else if (action === 'runtime') openAppSettings('runtime');
            else if (action === 'pro') openAppSettings('pro');
            else openAppSettings('install');
        });
        els.toggleMainThemeBtn?.addEventListener('click', () => {
            toggleMainTheme();
            setMoreMenuOpen(false);
        });
        els.openShortcutsMenuBtn?.addEventListener('click', () => {
            setMoreMenuOpen(false);
            ux()?.openShortcutsModal?.();
        });
        els.envBannerBtn?.addEventListener('click', () => {
            openAppSettings('install');
        });
        els.envBannerWizardBtn?.addEventListener('click', () => {
            openAppSettings('install', { wizard: true });
        });
        els.quickTranslateBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setTranslateMenuOpen(!translateMenuOpen);
        });
        els.translateMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setTranslateMenuOpen(false);
                setQuickTranslateMode(item.dataset.translateMode || 'engine');
            });
        });
        els.translateMtAutoBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            void setTranslateMtPickMode('auto');
        });
        els.translateMtManualBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            void setTranslateMtPickMode('manual');
        });
        els.translateMenu?.addEventListener('click', (event) => event.stopPropagation());
        els.paramsMoreBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setParamsMoreMenuOpen(!paramsMoreMenuOpen);
        });
        els.paramsMoreMenu?.addEventListener('click', (event) => event.stopPropagation());
        els.expertDrawerToggle?.addEventListener('click', (event) => {
            event.stopPropagation();
            setExpertExtrasMenuOpen(!expertExtrasMenuOpen);
        });
        els.expertDrawerBody?.addEventListener('click', (event) => event.stopPropagation());
        els.quickAsrModelSelect?.addEventListener('change', () => {
            if (!els.engineAsrModelSelect) return;
            els.engineAsrModelSelect.value = els.quickAsrModelSelect.value;
            els.engineAsrModelSelect.dispatchEvent(new Event('change'));
            adoptManualAsrFromUserChange({ persist: true });
        });
        els.quickVadModelSelect?.addEventListener('change', () => {
            if (!els.engineVadModelSelect) return;
            els.engineVadModelSelect.value = els.quickVadModelSelect.value;
            els.engineVadModelSelect.dispatchEvent(new Event('change'));
            void persistFormOptionsQuiet();
        });
        els.quickVadSensitiveCheck?.addEventListener('change', () => {
            if (!els.vadSensitiveCheck) return;
            els.vadSensitiveCheck.checked = !!els.quickVadSensitiveCheck.checked;
            els.vadSensitiveCheck.dispatchEvent(new Event('change'));
            void persistFormOptionsQuiet();
        });
        els.quickFaithfulCheck?.addEventListener('change', () => {
            if (!els.smartTranslateFaithfulCheck) return;
            els.smartTranslateFaithfulCheck.checked = !!els.quickFaithfulCheck.checked;
            markSettingsDirty(true);
            void persistFormOptionsQuiet();
            updateParamsSummary();
        });
        els.quickGlossaryMtCheck?.addEventListener('change', () => {
            if (!els.glossaryMtCheck) return;
            els.glossaryMtCheck.checked = !!els.quickGlossaryMtCheck.checked;
            markSettingsDirty(true);
            void persistFormOptionsQuiet();
            updateParamsSummary();
        });
        els.quickPerfProfileSelect?.addEventListener('change', () => {
            if (!els.perfProfileSelect) return;
            els.perfProfileSelect.value = els.quickPerfProfileSelect.value === 'speed' ? 'speed' : 'quality';
            markSettingsDirty(true);
            void persistFormOptionsQuiet();
        });
        els.quickAsrRecommendBtn?.addEventListener('click', () => {
            const id = String(
                els.quickAsrRecommendBtn?.dataset?.recommendedAsr
                || cachedHardwareRecommend?.asrModel
                || '',
            ).trim();
            if (!id) return;
            if (els.asrRecommendChip) els.asrRecommendChip.dataset.recommendedAsr = id;
            applyAsrRecommendFromChip();
            syncExpertExtraChipsUi();
        });
        els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setPostBatchQcFixMenuOpen(false);
                setParamsMoreMenuOpen(false);
                void setPostBatchQcFixMode(item.dataset.qcFixMode || 'none', { fromUser: true });
            });
        });
        els.postBatchQcFixMenu?.addEventListener('click', (event) => event.stopPropagation());
        els.paramsModeBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setParamsModeMenuOpen(!paramsModeMenuOpen);
        });
        els.paramsModeMenu?.addEventListener('click', (event) => {
            event.stopPropagation();
            const recover = event.target?.closest?.('[data-sense-recover-global]');
            if (recover && els.paramsModeMenu.contains(recover)) {
                setParamsModeMenuOpen(false);
                applySenseRecoveryAction(recover.getAttribute('data-sense-recover-global'));
                return;
            }
            const asrPick = event.target?.closest?.('[data-asr-pick]');
            if (asrPick && els.paramsModeMenu.contains(asrPick)) {
                void setParamsModeAsrPickMode(asrPick.getAttribute('data-asr-pick'));
                return;
            }
            const asrModel = event.target?.closest?.('[data-asr-model]');
            if (asrModel && els.paramsModeMenu.contains(asrModel)) {
                const id = String(asrModel.getAttribute('data-asr-model') || '').trim();
                if (id) {
                    setParamsModeMenuOpen(false);
                    void selectParamsModeAsrManual(id, { persist: true });
                }
                return;
            }
            const item = event.target?.closest?.('[data-params-mode], [data-preset-id]');
            if (!item || !els.paramsModeMenu.contains(item)) return;
            const mode = item.getAttribute('data-params-mode');
            const presetId = item.getAttribute('data-preset-id');
            setParamsModeMenuOpen(false);
            if (mode === 'sense') {
                selectParamsModeSense({ persist: true });
                return;
            }
            if (mode === 'custom') {
                selectParamsModeCustom({ persist: true });
                return;
            }
            if (mode === 'open-settings') {
                openAppSettings('params');
                return;
            }
            if (presetId) {
                void selectParamsModePreset(presetId, { persist: true });
            }
        });
        els.postBatchQcFixModeSelect?.addEventListener('change', () => {
            void setPostBatchQcFixMode(els.postBatchQcFixModeSelect.value || 'none', {
                fromUser: true,
                persist: false,
            });
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
        });
        ['translateModeEngine', 'translateModeSakura', 'translateModeSmart'].forEach((id) => {
            els[id]?.addEventListener('change', () => {
                if (!els[id]?.checked) return;
                applyTranslateModeToForm(els[id].value, { fromUser: true });
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
                updateModelSelectHint();
            });
        });
        els.engineMtModelSelect?.addEventListener('change', () => {
            if (syncingTranslateMode) return;
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
            syncMtModelChipUi();
            updateReadinessStrip();
        });
        els.engineLlmMtModelSelect?.addEventListener('change', () => {
            if (syncingTranslateMode) return;
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
            syncMtModelChipUi();
            updateReadinessStrip();
        });
        els.logCollapseBtn?.addEventListener('click', toggleLogCollapsed);
        els.clearLogBtn?.addEventListener('click', () => {
            if (els.logHost) els.logHost.innerHTML = '<span class="text-gray-400">日志已清空</span>';
        });
        els.copyLogBtn?.addEventListener('click', async () => {
            const text = els.logHost?.innerText || '';
            try {
                await navigator.clipboard?.writeText?.(text);
                appendLog('已复制应用日志', 'ok');
            } catch (_) {
                appendLog('复制日志失败', 'err');
            }
        });
        els.quickTaskSelect?.addEventListener('change', () => {
            if (els.taskSelect) {
                els.taskSelect.value = els.quickTaskSelect.value;
                els.taskSelect.dispatchEvent(new Event('change'));
            }
            void persistFormOptionsQuiet();
        });
        els.quickLanguageSelect?.addEventListener('change', () => {
            if (els.languageSelect) {
                els.languageSelect.value = els.quickLanguageSelect.value;
            }
            updateParamsSummary();
            syncMtModelChipUi();
            syncParamsMoreChipUi();
            void persistFormOptionsQuiet();
        });
        els.quickTargetLangSelect?.addEventListener('change', () => {
            if (els.chineseSubtitleVariantSelect) {
                els.chineseSubtitleVariantSelect.value = els.quickTargetLangSelect.value || 'simplified';
            }
            syncParamsMoreChipUi();
            updateParamsSummary();
            void persistFormOptionsQuiet();
        });
        els.chineseSubtitleVariantSelect?.addEventListener('change', () => {
            if (els.quickTargetLangSelect) {
                els.quickTargetLangSelect.value = els.chineseSubtitleVariantSelect.value || 'simplified';
            }
            syncParamsMoreChipUi();
            updateParamsSummary();
        });
        els.languageSelect?.addEventListener('change', () => {
            updateParamsSummary();
            syncMtModelChipUi();
            syncParamsMoreChipUi();
        });
        document.addEventListener('keydown', (event) => {
            if (isStandaloneSettings) return;
            if (!els.paramsModal?.classList.contains('hidden')) return;
            if (isTypingTarget(event.target)) return;
            const key = event.key;
            if ((key === 'a' || key === 'A') && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                setAddMenuOpen(true);
                return;
            }
            if (key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (!els.startBtn?.disabled) {
                    event.preventDefault();
                    startSubtitleGeneration();
                }
                return;
            }
            if (key === 'Escape') {
                if (els.retranslateModal && !els.retranslateModal.classList.contains('hidden')) {
                    event.preventDefault();
                    closeRetranslateModal();
                    return;
                }
                if (els.taskColContextMenu && !els.taskColContextMenu.classList.contains('hidden')) {
                    event.preventDefault();
                    closeTaskColContextMenu();
                    return;
                }
                if (els.taskRowContextMenu && !els.taskRowContextMenu.classList.contains('hidden')) {
                    event.preventDefault();
                    closeTaskRowContextMenu();
                    return;
                }
                if (state.running || state.retranslateBusy) {
                    event.preventDefault();
                    stopTask();
                }
                return;
            }
            if ((key === '?' || (key === '/' && event.shiftKey)) && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                ux()?.openShortcutsModal?.();
                return;
            }
            if ((key === 'a' || key === 'A') && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                if (els.selectAllCheck && !els.selectAllCheck.disabled) {
                    els.selectAllCheck.checked = true;
                    state.items.forEach((i) => { i.selected = true; });
                    renderList();
                    updateStartButton();
                }
                return;
            }
            if ((key === 'Delete' || key === 'Backspace') && !event.ctrlKey && !event.metaKey) {
                if (state.retranslateBusy) return;
                if (state.items.some((i) => i.selected)) {
                    event.preventDefault();
                    removeSelected();
                }
            }
        });
    }

    function setLoading(show, message) {
        if (!els.loadingOverlay) return;
        state.loadingDepth = Math.max(0, state.loadingDepth + (show ? 1 : -1));
        const visible = state.loadingDepth > 0;
        els.loadingOverlay.classList.toggle('hidden', !visible);
        els.loadingOverlay.classList.toggle('flex', visible);
        if (message && els.loadingMessage) els.loadingMessage.textContent = message;
    }

    function updateLoadingMessage(message) {
        if (message && els.loadingMessage) els.loadingMessage.textContent = message;
    }

    function getPostTaskOptionsFromUi() {
        if (postTaskQcApi.buildPostTaskOptionsFromAction) {
            return postTaskQcApi.buildPostTaskOptionsFromAction(getPostTaskAction(), {
                shutdownDelaySec: Number(els.shutdownDelayInput?.value) || 60,
                playSoundOnComplete: !!state.playSoundOnComplete,
            });
        }
        return { postTaskAction: 'none', shutdownDelaySec: 60, playSoundOnComplete: false };
    }

    function resolveOutputDirFromForm() {
        const mode = els.outputModeSelect?.value || 'same';
        if (mode !== 'custom') return '';
        return els.outputDirInput?.value.trim() || '';
    }

    function syncPostTaskExtrasUi() {
        const shutdown = getPostTaskAction() === 'shutdown';
        els.shutdownDelayWrap?.classList.toggle('hidden', !shutdown);
        if (els.shutdownDelayInput) els.shutdownDelayInput.disabled = !shutdown;
    }

    function updateQueueBadge() {
        const n = state.pendingQueue.length;
        if (!els.pendingQueueBadge) return;
        els.pendingQueueBadge.classList.toggle('hidden', n === 0);
        els.pendingQueueBadge.textContent = `队列 ${n}`;
    }

    function resetPostTaskSelect() {
        state.postTaskAction = 'none';
        state.playSoundOnComplete = false;
        if (els.playSoundOnCompleteCheck) els.playSoundOnCompleteCheck.checked = false;
        setPostTaskMenuOpen(false);
        syncPostTaskMenuUi();
        syncPostTaskExtrasUi();
    }

    async function syncPostTaskToMain() {
        if (!electron?.transWithAiSetPostTask) return;
        try {
            await electron.transWithAiSetPostTask(getPostTaskOptionsFromUi());
        } catch { /* ignore */ }
    }

    function readSubFormatsFromForm() {
        const parts = [];
        if (els.subFormatSrt?.checked) parts.push('srt');
        if (els.subFormatVtt?.checked) parts.push('vtt');
        if (els.subFormatAss?.checked) parts.push('ass');
        if (els.subFormatLrc?.checked) parts.push('lrc');
        return parts.length ? parts.join(',') : 'srt';
    }

    function applySubFormatsToForm(value) {
        const set = new Set(String(value || 'srt').split(/[,;\s]+/).map((p) => p.trim().toLowerCase()));
        if (els.subFormatSrt) els.subFormatSrt.checked = set.has('srt');
        if (els.subFormatVtt) els.subFormatVtt.checked = set.has('vtt');
        if (els.subFormatAss) els.subFormatAss.checked = set.has('ass') || set.has('ass-dual');
        if (els.subFormatLrc) els.subFormatLrc.checked = set.has('lrc');
    }

    function syncLogLevelHint() {
        const level = String(els.logLevelSelect?.value || 'DEBUG').toUpperCase();
        if (els.logLevelHint) {
            els.logLevelHint.textContent = LOG_LEVEL_HINTS[level] || LOG_LEVEL_HINTS.DEBUG;
        }
    }

    function syncBatchSizeUi() {
        const show = els.deviceSelect?.value === 'cuda_batch';
        els.maxBatchSizeWrap?.classList.toggle('hidden', !show);
        if (els.maxBatchSizeInput) els.maxBatchSizeInput.disabled = !show;
    }

    const modelApi = global.TransubTransWithAiModels || null;
    let cachedModelItems = [];
    let cachedEnginePickCatalog = [];
    /** @type {object | null} */
    let cachedDemucsProbe = null;
    const ENGINE_DEMUCS_MODEL_ID = 'demucs';
    let engineModelsBusy = false;
    let engineModelsFilter = 'all';
    let engineModelsSearchQuery = '';
    /** @type {'engine'|'managed'|null} */
    let engineDownloadActiveSource = null;

    function readTaskFromForm() {
        const v = els.taskSelect?.value;
        if (v === 'transcribe' || v === 'dual') return v;
        return 'translate';
    }

    function taskLabelOf(task) {
        if (task === 'transcribe') return '原语言';
        if (task === 'dual') return '双语';
        return '翻译';
    }

    function isTranslateLikeTask(task) {
        return task === 'translate' || task === 'dual';
    }

    function kindBadge(kind, item = null) {
        const base = kind === 'transcribe' ? '转写'
            : kind === 'translate' ? '翻译'
                : kind === 'root' ? '默认'
                    : '其他';
        if (item?.kindSource === 'signature') return `${base}·特征`;
        if (item?.kindSource === 'name') return `${base}·名称`;
        return base;
    }

    function readModelPathFromForm(kind) {
        if (kind === 'translate') {
            return String(els.translateModelPathInput?.value || '').trim();
        }
        return String(els.transcribeModelPathInput?.value || '').trim();
    }

    function syncModelSelectToPath(kind, pathValue) {
        const selectEl = kind === 'translate' ? els.translateModelSelect : els.transcribeModelSelect;
        if (!selectEl) return;
        const want = String(pathValue || '').replace(/\\/g, '/');
        const match = [...selectEl.options].find(
            (opt) => String(opt.value || '').replace(/\\/g, '/') === want,
        );
        if (match) {
            selectEl.value = match.value;
            return;
        }
        if (want) {
            const opt = document.createElement('option');
            opt.value = pathValue;
            opt.textContent = `${pathValue}（自定义）`;
            selectEl.appendChild(opt);
            selectEl.value = pathValue;
            return;
        }
        selectEl.value = '';
    }

    function setModelPathOnForm(kind, pathValue, { syncSelect = true } = {}) {
        const raw = String(pathValue || '').trim();
        const inputEl = kind === 'translate' ? els.translateModelPathInput : els.transcribeModelPathInput;
        if (inputEl) inputEl.value = raw;
        if (syncSelect) syncModelSelectToPath(kind, raw);
    }

    function fillModelSelect(selectEl, items, selectedPath, preferKind) {
        if (!selectEl) return;
        const list = Array.isArray(items) ? items : [];
        const want = String(selectedPath || '').replace(/\\/g, '/');
        const opts = ['<option value="">（自动 / 安装默认）</option>'];
        const sorted = [...list].sort((a, b) => {
            const score = (it) => {
                if (preferKind && it.kind === preferKind) return 0;
                if (it.kind === 'root') return 2;
                return 1;
            };
            return score(a) - score(b) || String(a.label || '').localeCompare(String(b.label || ''));
        });
        for (const it of sorted) {
            const pathVal = String(it.path || '').replace(/\\/g, '/');
            const ready = it.ready !== false ? '' : ' · 不完整';
            const label = `${it.label || pathVal} [${kindBadge(it.kind, it)}]${ready}`;
            const sel = pathVal === want ? ' selected' : '';
            opts.push(`<option value="${esc(pathVal)}"${sel}>${esc(label)}</option>`);
        }
        if (want && !list.some((it) => String(it.path || '').replace(/\\/g, '/') === want)) {
            opts.push(`<option value="${esc(want)}" selected>${esc(want)}（自定义）</option>`);
        }
        selectEl.innerHTML = opts.join('');
        if (want) selectEl.value = want;
        else selectEl.value = '';
    }

    async function refreshModelSelects(options = {}) {
        const installPath = els.installPathInput?.value.trim()
            || options.installPath
            || 'F:\\UltraTools\\TransWithAI';
        let items = [];
        try {
            const res = await electron?.transWithAiListModels?.({ installPath });
            if (res?.ok && Array.isArray(res.items)) items = res.items;
        } catch { /* ignore */ }
        cachedModelItems = items;

        let transcribePath = options.transcribeModelPath != null
            ? String(options.transcribeModelPath || '').trim()
            : readModelPathFromForm('transcribe');
        let translatePath = options.translateModelPath != null
            ? String(options.translateModelPath || '').trim()
            : readModelPathFromForm('translate');

        if (modelApi) {
            const filled = modelApi.fillMissingModelPaths({
                transcribeModelPath: transcribePath,
                translateModelPath: translatePath,
                modelPath: options.modelPath || '',
            }, items);
            transcribePath = filled.transcribeModelPath || '';
            translatePath = filled.translateModelPath || '';
        }

        fillModelSelect(els.transcribeModelSelect, items, transcribePath, 'transcribe');
        fillModelSelect(els.translateModelSelect, items, translatePath, 'translate');
        setModelPathOnForm('transcribe', transcribePath, { syncSelect: false });
        setModelPathOnForm('translate', translatePath, { syncSelect: false });
        syncModelSelectToPath('transcribe', transcribePath);
        syncModelSelectToPath('translate', translatePath);
        updateModelSelectHint();
    }

    /** Auto-correct crossed / wrong-kind model picks using the last listed packages. */
    function applyAutoDetectedModelsFromCache() {
        if (!modelApi || !cachedModelItems.length) return;
        const before = {
            transcribeModelPath: readModelPathFromForm('transcribe'),
            translateModelPath: readModelPathFromForm('translate'),
        };
        const filled = modelApi.fillMissingModelPaths(before, cachedModelItems);
        const nextTranscribe = filled.transcribeModelPath || '';
        const nextTranslate = filled.translateModelPath || '';
        if (nextTranscribe !== before.transcribeModelPath) {
            setModelPathOnForm('transcribe', nextTranscribe);
            fillModelSelect(els.transcribeModelSelect, cachedModelItems, nextTranscribe, 'transcribe');
        }
        if (nextTranslate !== before.translateModelPath) {
            setModelPathOnForm('translate', nextTranslate);
            fillModelSelect(els.translateModelSelect, cachedModelItems, nextTranslate, 'translate');
        }
    }

    async function browseModelPath(kind) {
        const title = kind === 'translate'
            ? '选择翻译模型文件夹'
            : '选择转写模型文件夹';
        const res = await electron?.selectFolder?.({ title });
        if (!res?.ok || res.canceled || !res.path) return;
        const modelPath = String(res.path || '').trim();
        if (!modelPath) return;

        const installPath = els.installPathInput?.value.trim() || '';
        try {
            const check = await electron?.transWithAiValidateModel?.({ installPath, modelPath });
            if (check && check.ok === false) {
                const warn = check.error || '模型目录可能不完整';
                appendLog(`${kind === 'translate' ? '翻译' : '转写'}模型：${warn}`, 'info');
            }
        } catch { /* ignore */ }

        setModelPathOnForm(kind, modelPath);
        fillModelSelect(
            kind === 'translate' ? els.translateModelSelect : els.transcribeModelSelect,
            cachedModelItems,
            modelPath,
            kind,
        );
        syncModelSelectToPath(kind, modelPath);
        updateModelSelectHint();
        updateParamsSummary();
    }

    function updateModelSelectHint() {
        if (!els.modelSelectHint || !modelApi) return;
        const task = readTaskFromForm();
        const opts = {
            transcribeModelPath: readModelPathFromForm('transcribe'),
            translateModelPath: readModelPathFromForm('translate'),
        };
        const gate = modelApi.validateModelsForTask(opts, cachedModelItems, task);
        if (!gate.ok) {
            els.modelSelectHint.textContent = gate.error || '';
            els.modelSelectHint.className = 'text-xs text-red-600 min-h-[1rem]';
            return;
        }
        const warnings = gate.warnings || [];
        if (warnings.length) {
            els.modelSelectHint.textContent = warnings.join(' ');
            els.modelSelectHint.className = 'text-xs text-amber-700 min-h-[1rem]';
            return;
        }
        if (task === 'dual') {
            const a = modelApi.modelLabelFromPath(opts.transcribeModelPath);
            if (opts.smartTranslate || els.smartTranslateCheck?.checked) {
                els.modelSelectHint.textContent = advancedEntitled
                    ? `双语 + 智能翻译：转写「${a}」→ Pro 大模型翻译`
                    : '双语 + 智能翻译需解锁 Pro';
            } else {
                const b = modelApi.modelLabelFromPath(opts.translateModelPath);
                els.modelSelectHint.textContent = `双语将使用：转写「${a}」→ 翻译「${b}」`;
            }
            els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
            return;
        }
        if (task === 'translate' && (opts.smartTranslate || els.smartTranslateCheck?.checked)) {
            const a = modelApi.modelLabelFromPath(opts.transcribeModelPath || opts.translateModelPath);
            els.modelSelectHint.textContent = advancedEntitled
                ? `智能翻译：先转写「${a}」→ Pro 大模型翻译`
                : '智能翻译需解锁 Pro';
            els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
            return;
        }
        els.modelSelectHint.textContent = '';
        els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
    }

    function syncChineseSubtitleVariantUi() {
        const isTranslate = isTranslateLikeTask(readTaskFromForm());
        if (els.chineseSubtitleVariantSelect) {
            els.chineseSubtitleVariantSelect.disabled = !isTranslate;
        }
        if (els.quickTargetLangSelect) {
            els.quickTargetLangSelect.disabled = !isTranslate;
        }
        document.getElementById('chineseSubtitleVariantWrap')
            ?.classList.toggle('opacity-50', !isTranslate);
        els.quickTargetLangWrap?.classList.toggle('opacity-50', !isTranslate);
        els.quickTargetLangWrap?.classList.toggle('pointer-events-none', !isTranslate);
        syncMergeBilingualUi();
        syncSmartTranslateUi();
        updateModelSelectHint();
    }

    function syncSmartTranslateUi() {
        const task = readTaskFromForm();
        const allow = task === 'translate' || task === 'dual';
        els.translateModeFieldset?.classList.toggle('opacity-50', !allow);
        els.translateModeFieldset?.classList.toggle('pointer-events-none', !allow);

        if (els.translateModeEngine) els.translateModeEngine.disabled = !allow;
        if (els.translateModeSakura) els.translateModeSakura.disabled = !allow;
        if (els.translateModeSmart) els.translateModeSmart.disabled = !allow || !canUseSmartTranslateUi();

        if (!allow) {
            if (els.smartTranslateCheck) els.smartTranslateCheck.checked = false;
            if (!syncingTranslateMode) {
                applyTranslateModeToForm('engine');
            } else {
                syncFaithfulToneUi(false);
                syncHybridMtUi();
                syncAdvancedFeaturesGate();
            }
            return;
        }

        // Keep dependent controls in sync with the current radios. Do not re-derive mode
        // from smartTranslateCheck alone — that raced with HTML defaults (机器翻译) during
        // applyOptionsToForm and wiped a just-loaded 推理/智能 selection.
        if (!syncingTranslateMode) {
            applyTranslateModeToForm(readTranslateModeFromForm());
        } else {
            syncFaithfulToneUi(allow);
            syncHybridMtUi();
            syncAdvancedFeaturesGate();
        }
    }

    function readDualLineOrderFromForm() {
        const raw = els.mergeBilingualOrderSelect?.value || 'translation-first';
        if (typeof TransubDualSubtitle?.normalizeDualLineOrder === 'function') {
            return TransubDualSubtitle.normalizeDualLineOrder(raw);
        }
        if (raw === 'source-first' || raw === 'source') return 'source-first';
        return 'target-first';
    }

    function applyDualLineOrderToForm(value) {
        if (!els.mergeBilingualOrderSelect) return;
        const order = typeof TransubDualSubtitle?.normalizeDualLineOrder === 'function'
            ? TransubDualSubtitle.normalizeDualLineOrder(value)
            : (value === 'source-first' || value === 'source' ? 'source-first' : 'target-first');
        // UI uses translation-first / source-first; runtime stores target-first / source-first.
        els.mergeBilingualOrderSelect.value = order === 'source-first'
            ? 'source-first'
            : 'translation-first';
    }

    function syncMergeBilingualUi() {
        const isDual = readTaskFromForm() === 'dual';
        if (els.mergeBilingualCheck) els.mergeBilingualCheck.disabled = !isDual;
        if (els.mergeBilingualWrap) {
            els.mergeBilingualWrap.classList.toggle('hidden', !isDual);
            els.mergeBilingualWrap.classList.toggle('opacity-50', !isDual);
        }
        const mergeOn = isDual && !!els.mergeBilingualCheck?.checked;
        if (els.mergeBilingualOrderSelect) els.mergeBilingualOrderSelect.disabled = !mergeOn;
        if (els.mergeBilingualOrderWrap) {
            els.mergeBilingualOrderWrap.classList.toggle('hidden', !isDual);
            els.mergeBilingualOrderWrap.classList.toggle('opacity-50', !mergeOn);
        }
        if (els.deleteSourcesAfterMergeCheck) {
            els.deleteSourcesAfterMergeCheck.disabled = !mergeOn;
            if (!mergeOn) els.deleteSourcesAfterMergeCheck.checked = false;
        }
        if (els.deleteSourcesAfterMergeWrap) {
            els.deleteSourcesAfterMergeWrap.classList.toggle('hidden', !isDual);
            els.deleteSourcesAfterMergeWrap.classList.toggle('opacity-50', !mergeOn);
        }
    }

    async function openParamsModal(tabId) {
        if (!isStandaloneSettings) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
        }
        // When clean, reload from disk so a prior save (this or another window) is shown.
        // When dirty, keep unsaved edits — do not clear the dirty flag on focus/re-open IPC.
        if (!settingsFormDirty) {
            const reloaded = await reloadSavedOptionsIntoForm();
            if (!reloaded) {
                savedOptionsSnapshot = buildSavedOptionsFromForm();
            }
            markSettingsDirty(false);
            setSaveParamsStatus('修改后请点「保存设置」写入磁盘');
        }
        const requested = resolveParamsTab(tabId || activeParamsTab);
        // Entitlement must be known before opening Pro-gated panels.
        if (isProGatedTab(requested) || !advancedEntitled) {
            await refreshAdvancedEntitlement();
        } else {
            void refreshAdvancedEntitlement();
        }
        switchParamsTab(requested);
        els.paramsModal?.classList.remove('hidden');
        try { global.TransubEditorSettingsPrefs?.loadIntoForm?.(); } catch (_) { /* ignore */ }
        try { global.TransubEditorSettingsPrefs?.bind?.(); } catch (_) { /* ignore */ }
        void refreshSenseMemoryStatus();
    }

    /**
     * Desktop: always open the dedicated settings BrowserWindow.
     * Wizard requests use the dedicated setup-wizard window.
     * Standalone settings window / non-desktop: use in-page params modal.
     */
    function openAppSettings(tabId, opts = {}) {
        const tab = tabId || 'runtime';
        if (opts.wizard) {
            if (!isStandaloneChrome && isDesktop() && electron?.transubOpenSetupWizard) {
                void electron.transubOpenSetupWizard({
                    forceWizard: opts.forceWizard !== false,
                });
                return;
            }
            if (!isStandaloneChrome && isDesktop() && electron?.transubOpenSettings) {
                void electron.transubOpenSettings({
                    tab,
                    wizard: true,
                    forceWizard: opts.forceWizard !== false,
                    openLibrary: !!opts.openLibrary,
                });
                return;
            }
            openParamsModal(tab);
            void global.TransubSetupWizard?.open?.({ force: opts.forceWizard !== false });
            return;
        }
        if (!isStandaloneSettings && isDesktop() && electron?.transubOpenSettings) {
            void electron.transubOpenSettings({
                tab,
                openLibrary: !!opts.openLibrary,
            });
            return;
        }
        openParamsModal(tab);
        if (opts.openLibrary) {
            void openEngineModelsLibrary({ refresh: true });
        }
    }

    function closeParamsModal(restore = false) {
        closeEngineModelsLibrary();
        if (restore && savedOptionsSnapshot) {
            void applyOptionsToForm(savedOptionsSnapshot, { applyUiMode: false });
        }
        markSettingsDirty(false);
        closeAllSettingsTips();
        if (isStandaloneSettings) {
            closeStandaloneSettingsWindow();
            return;
        }
        if (isStandaloneWizard) {
            try { global.close(); } catch (_) { /* ignore */ }
            return;
        }
        els.paramsModal?.classList.add('hidden');
        setSaveParamsStatus('');
    }

    function closeAllSettingsTips() {
        document.querySelectorAll('.settings-tip.is-open').forEach((tip) => {
            tip.classList.remove('is-open');
        });
        hideFloatingSettingsTip();
    }

    /** @type {HTMLElement | null} */
    let floatingSettingsTipEl = null;

    function getFloatingSettingsTip() {
        if (!floatingSettingsTipEl || !floatingSettingsTipEl.isConnected) {
            floatingSettingsTipEl = document.createElement('div');
            floatingSettingsTipEl.id = 'settingsTipHost';
            floatingSettingsTipEl.className = 'settings-tip-bubble is-fixed';
            floatingSettingsTipEl.setAttribute('role', 'tooltip');
            floatingSettingsTipEl.style.display = 'none';
            document.body.appendChild(floatingSettingsTipEl);
        }
        return floatingSettingsTipEl;
    }

    function hideFloatingSettingsTip() {
        if (!floatingSettingsTipEl) return;
        floatingSettingsTipEl.style.display = 'none';
        floatingSettingsTipEl.classList.remove('tip-up', 'tip-end', 'is-visible');
        floatingSettingsTipEl.innerHTML = '';
    }

    function placeFloatingSettingsTip(tip) {
        const btn = tip?.querySelector?.('.settings-tip-btn');
        const source = tip?.querySelector?.('.settings-tip-bubble');
        if (!btn || !source) return;
        const bubble = getFloatingSettingsTip();
        bubble.innerHTML = source.innerHTML;
        bubble.classList.remove('tip-up', 'tip-end');
        bubble.classList.add('is-visible');
        bubble.style.display = 'block';

        const preferEnd = tip.classList.contains('tip-end');
        const preferUp = tip.classList.contains('tip-up');
        const gap = 6;
        const pad = 8;
        const btnRect = btn.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const maxW = Math.min(18 * 16, vw * 0.7, Math.max(0, vw - pad * 2));
        bubble.style.maxWidth = `${Math.max(160, maxW)}px`;
        // Provisional place to measure wrapped size.
        bubble.style.left = `${Math.round(btnRect.left)}px`;
        bubble.style.top = `${Math.round(btnRect.bottom + gap)}px`;
        bubble.style.right = 'auto';
        bubble.style.bottom = 'auto';

        const rect = bubble.getBoundingClientRect();
        let useEnd = preferEnd;
        let useUp = preferUp;
        const spaceBelow = vh - btnRect.bottom - gap - pad;
        const spaceAbove = btnRect.top - gap - pad;
        if (!useUp && rect.height > spaceBelow && spaceAbove > spaceBelow) useUp = true;
        if (useUp && rect.height > spaceAbove && spaceBelow >= spaceAbove) useUp = false;

        let left = useEnd ? (btnRect.right - rect.width) : btnRect.left;
        if (left + rect.width > vw - pad) {
            left = vw - pad - rect.width;
            useEnd = true;
        }
        if (left < pad) {
            left = pad;
            useEnd = false;
        }
        let top = useUp ? (btnRect.top - gap - rect.height) : (btnRect.bottom + gap);
        if (top < pad) top = pad;
        if (top + rect.height > vh - pad) top = Math.max(pad, vh - pad - rect.height);

        bubble.classList.toggle('tip-up', useUp);
        bubble.classList.toggle('tip-end', useEnd);
        bubble.style.left = `${Math.round(left)}px`;
        bubble.style.top = `${Math.round(top)}px`;
    }

    function bindSettingsTips() {
        const openTip = (tip) => {
            if (!tip) return;
            closeAllSettingsTips();
            tip.classList.add('is-open');
            placeFloatingSettingsTip(tip);
        };
        const closeTip = (tip) => {
            tip?.classList.remove('is-open');
            hideFloatingSettingsTip();
        };
        const toggleTip = (tip) => {
            if (!tip) return;
            if (tip.classList.contains('is-open')) closeTip(tip);
            else openTip(tip);
        };

        // Main toolbar tips (e.g. 智能感知) + settings modal tips
        document.querySelectorAll('.settings-tip-btn').forEach((btn) => {
            if (btn.dataset.tipBound === '1') return;
            btn.dataset.tipBound = '1';
            const tip = btn.closest('.settings-tip');
            if (!tip) return;
            btn.addEventListener('pointerenter', () => openTip(tip));
            btn.addEventListener('pointerleave', () => closeTip(tip));
            btn.addEventListener('focus', () => openTip(tip));
            btn.addEventListener('blur', () => closeTip(tip));
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleTip(tip);
            });
        });

        const repositionOpenTips = () => {
            document.querySelectorAll('.settings-tip.is-open').forEach((tip) => {
                placeFloatingSettingsTip(tip);
            });
        };
        window.addEventListener('resize', repositionOpenTips);
        document.getElementById('settingsContent')?.addEventListener('scroll', repositionOpenTips, { passive: true });
    }

    async function refreshAdvancedEntitlement() {
        if (!electron?.transubAdvancedGetStatus) {
            setAdvancedEntitled(false, { ok: false });
            return;
        }
        try {
            const res = await electron.transubAdvancedGetStatus();
            setAdvancedEntitled(
                !!res?.ok && !!res?.status?.entitled,
                res?.status?.freePipelineTranslate || { ok: false },
            );
        } catch (_) {
            setAdvancedEntitled(false, { ok: false });
        }
    }

    function translateModeLabel(mode) {
        if (translateChipApi.translateModeLabel) return translateChipApi.translateModeLabel(mode);
        return TRANSLATE_MODE_CHIP_LABELS[mode] || TRANSLATE_MODE_CHIP_LABELS.engine;
    }

    function setTranslateMenuOpen(open) {
        translateMenuOpen = !!open;
        els.translateMenu?.classList.toggle('hidden', !open);
        els.quickTranslateBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            rebuildTranslateMenuMtSection();
            const mode = readTranslateModeFromForm();
            const hybridOff = mode === 'smart'
                && els.smartTranslateHybridCheck
                && els.smartTranslateHybridCheck.checked === false;
            if (hybridOff) {
                void ensureSmartTranslatePickCache({ force: !cachedSmartTranslatePick }).then(() => {
                    if (translateMenuOpen) rebuildTranslateMenuMtSection();
                });
            }
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setParamsMoreMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
            setExpertExtrasMenuOpen(false);
        }
    }

    // Back-compat aliases for older call sites in this file.
    function setTranslateModeMenuOpen(open) { setTranslateMenuOpen(open); }
    function setMtModelMenuOpen(open) { setTranslateMenuOpen(open); }

    function setParamsMoreMenuOpen(open) {
        paramsMoreMenuOpen = !!open;
        els.paramsMoreMenu?.classList.toggle('hidden', !open);
        els.paramsMoreBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            syncParamsMoreChipUi();
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
            setExpertExtrasMenuOpen(false);
        }
    }

    function setExpertExtrasMenuOpen(open) {
        expertExtrasMenuOpen = !!open;
        els.expertDrawerBody?.classList.toggle('hidden', !open);
        els.expertDrawerToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            syncExpertQuickModelSelects();
            syncExpertExtraChipsUi();
            syncSenseLockedExtras();
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateMenuOpen(false);
            setParamsMoreMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setParamsModeMenuOpen(false);
        }
    }

    function syncParamsMoreChipUi() {
        const qc = getPostBatchQcFixMode();
        const label = postBatchQcFixModeLabel(qc);
        if (els.paramsMoreLabel) els.paramsMoreLabel.textContent = label;
        if (els.paramsMoreBtn) {
            els.paramsMoreBtn.title = `QC修复 · ${label}`;
        }
    }

    function syncSenseLockedExtras() {
        const locked = isAutoSenseEnabled();
        const group = els.quickAsrChipGroup || document.getElementById('quickAsrChipGroup');
        group?.classList.toggle('is-sense-locked', locked);
        group?.querySelectorAll('select, input, button').forEach((el) => {
            el.disabled = locked;
        });
        const hint = els.expertDrawerSenseHint || document.getElementById('expertDrawerSenseHint');
        if (hint) {
            hint.hidden = !locked;
            hint.classList.toggle('hidden', !locked);
        }
    }

    function syncQuickExtrasBar() {
        if (els.paramsMoreMenuWrap) {
            els.paramsMoreMenuWrap.classList.remove('hidden');
        }
        if (els.expertDrawerMenuWrap) {
            els.expertDrawerMenuWrap.classList.remove('hidden');
        }
        if (els.paramsExpertExtraChips) {
            els.paramsExpertExtraChips.hidden = false;
            els.paramsExpertExtraChips.classList.remove('hidden');
            els.paramsExpertExtraChips.classList.add('flex');
        }
        els.expertDrawerToggle?.setAttribute('aria-expanded', expertExtrasMenuOpen ? 'true' : 'false');
        els.expertDrawerBody?.classList.toggle('hidden', !expertExtrasMenuOpen);
        syncExpertQuickModelSelects();
        syncExpertExtraChipsUi();
        syncSenseLockedExtras();
    }

    function syncExpertQuickModelSelects() {
        const asr = els.engineAsrModelSelect?.value || '';
        const vad = els.engineVadModelSelect?.value || '';
        if (els.quickAsrModelSelect) {
            fillEngineModelSelect(els.quickAsrModelSelect, cachedEngineModels, 'asr', asr);
        }
        if (els.quickVadModelSelect) {
            fillEngineModelSelect(els.quickVadModelSelect, cachedEngineModels, 'vad', vad);
        }
    }

    function syncExpertExtraChipsUi() {
        const task = readTaskFromForm();
        const translateOn = task === 'translate' || task === 'dual';
        const mode = readTranslateModeFromForm();
        const showGlossary = translateOn && mode === 'engine';
        const showFaithful = translateOn;

        if (els.quickVadSensitiveCheck && els.vadSensitiveCheck) {
            els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck.checked;
        }
        if (els.quickFaithfulCheck && els.smartTranslateFaithfulCheck) {
            els.quickFaithfulCheck.checked = !!els.smartTranslateFaithfulCheck.checked;
            els.quickFaithfulCheck.disabled = !showFaithful;
        }
        if (els.quickGlossaryMtCheck && els.glossaryMtCheck) {
            els.quickGlossaryMtCheck.checked = !!els.glossaryMtCheck.checked;
            els.quickGlossaryMtCheck.disabled = !showGlossary;
        }
        if (els.quickPerfProfileSelect && els.perfProfileSelect) {
            els.quickPerfProfileSelect.value = els.perfProfileSelect.value === 'speed' ? 'speed' : 'quality';
        }
        els.quickFaithfulWrap?.classList.toggle('opacity-50', !showFaithful);
        els.quickFaithfulWrap?.classList.toggle('pointer-events-none', !showFaithful);
        els.quickGlossaryMtWrap?.classList.toggle('hidden', !showGlossary);
        els.quickGlossaryMtWrap?.classList.toggle('opacity-50', !showGlossary);
        els.quickAsrModelSelect && (els.quickAsrModelSelect.value = els.engineAsrModelSelect?.value || els.quickAsrModelSelect.value);
        els.quickVadModelSelect && (els.quickVadModelSelect.value = els.engineVadModelSelect?.value || els.quickVadModelSelect.value);
        syncQuickAsrRecommendChip();
    }

    function syncQuickAsrRecommendChip() {
        const btn = els.quickAsrRecommendBtn;
        const api = global.TransubAsrSettings;
        if (!btn || !api?.describeAsrRecommendChip) return;
        const ui = api.describeAsrRecommendChip({
            currentAsr: els.engineAsrModelSelect?.value || els.quickAsrModelSelect?.value || '',
            recommendedAsr: cachedHardwareRecommend?.asrModel || '',
            profile: cachedHardwareRecommend?.profile || '',
        });
        const show = !!ui.visible && !isAutoSenseEnabled();
        btn.hidden = !show;
        btn.classList.toggle('hidden', !show);
        if (show) {
            btn.title = ui.detail || ui.label;
            btn.dataset.recommendedAsr = ui.recommendedAsr || '';
        }
    }

    function mirrorSelectValue(fromEl, toEl) {
        if (!fromEl || !toEl) return;
        const v = String(fromEl.value || '');
        if ([...toEl.options].some((o) => o.value === v)) {
            toEl.value = v;
        } else if (v) {
            ensureSelectValue(toEl, v, { label: v, allowEmpty: false });
        }
    }

    function normalizePostBatchQcFixMode(value) {
        if (settingsNormApi.normalizePostBatchQcFixMode) {
            return settingsNormApi.normalizePostBatchQcFixMode(value);
        }
        const mode = String(value || '').trim().toLowerCase();
        return POST_BATCH_QC_FIX_MODES.has(mode) ? mode : 'none';
    }

    function normalizeViewingCleanMode(value, fallback = 'clear') {
        if (settingsNormApi.normalizeViewingCleanMode) {
            return settingsNormApi.normalizeViewingCleanMode(value, fallback);
        }
        const mode = String(value || '').trim().toLowerCase();
        if (mode === 'off' || mode === 'light' || mode === 'clear') return mode;
        return fallback === 'off' || fallback === 'light' || fallback === 'clear' ? fallback : 'clear';
    }

    function getPostBatchQcFixMode() {
        if (els.postBatchQcFixModeSelect) {
            return normalizePostBatchQcFixMode(els.postBatchQcFixModeSelect.value);
        }
        return normalizePostBatchQcFixMode(savedOptionsSnapshot?.postBatchQcFixMode);
    }

    function postBatchQcFixModeLabel(mode) {
        return POST_BATCH_QC_FIX_CHIP_LABELS[mode] || POST_BATCH_QC_FIX_CHIP_LABELS.none;
    }

    function setPostBatchQcFixMenuOpen(open) {
        postBatchQcFixMenuOpen = !!open;
        if (els.postBatchQcFixMenu) {
            els.postBatchQcFixMenu.classList.remove('hidden');
        }
        if (open) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateMenuOpen(false);
            setParamsModeMenuOpen(false);
            setParamsMoreMenuOpen(true);
        }
    }

    function syncPostBatchQcFixChipUi() {
        const mode = getPostBatchQcFixMode();
        if (els.postBatchQcFixLabel) {
            els.postBatchQcFixLabel.textContent = postBatchQcFixModeLabel(mode);
        }
        els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
            const active = item.dataset.qcFixMode === mode;
            item.classList.toggle('active', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        if (els.postBatchQcFixModeSelect && els.postBatchQcFixModeSelect.value !== mode) {
            els.postBatchQcFixModeSelect.value = mode;
        }
        syncParamsMoreChipUi();
    }

    async function setPostBatchQcFixMode(nextMode, { fromUser = false, persist = true } = {}) {
        let mode = normalizePostBatchQcFixMode(nextMode);
        if (mode === 'smart' && !advancedEntitled) {
            if (fromUser) {
                void promptProUnlockRequired({ featureLabel: 'QC 智能修复' });
            }
            mode = 'fix';
        }
        if (els.postBatchQcFixModeSelect) {
            els.postBatchQcFixModeSelect.value = mode;
        }
        syncPostBatchQcFixChipUi();
        if (persist && fromUser) {
            await persistFormOptionsQuiet();
            updateParamsSummary();
        }
    }

    function shouldFollowSenseForMt() {
        return isAutoSenseEnabled()
            && !mtUseFormState
            && readTranslateModeFromForm() !== 'smart'
            && (readTaskFromForm() === 'translate' || readTaskFromForm() === 'dual');
    }

    function setMtUseForm(on, { persist = false } = {}) {
        mtUseFormState = !!on;
        if (persist) void persistFormOptionsQuiet();
    }

    /** Sense overrides for a job item; strip MT when user chose 表单自动匹配 / 指定模型. */
    function senseOverridesForJob(item) {
        if (!isAutoSenseEnabled() || !item?.sense?.adopted || !item.sense.overrides) return undefined;
        const ov = { ...item.sense.overrides };
        if (mtUseFormState) {
            delete ov.engineMtModel;
            delete ov.engineLlmMtModel;
            delete ov.engineOpusMtModel;
        }
        return Object.keys(ov).length ? ov : undefined;
    }

    function listInstalledMtModelsForMode(mode) {
        const models = Array.isArray(cachedEngineModels) ? cachedEngineModels : [];
        const wantLlm = mode === 'llm' || mode === 'sakura';
        return models.filter((m) => {
            if (!m?.installed || m?.incomplete) return false;
            const id = String(m.id || '').trim();
            if (!id) return false;
            const isLlm = isLlmInferencePickModelId(id);
            if (wantLlm) {
                if (!isLlm) return false;
                if (!advancedEntitled) {
                    const entry = findManagedLlmCatalogEntry(id);
                    if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry)) return false;
                    if (m.proScale) return false;
                }
                return true;
            }
            if (isLlm) return false;
            const kind = String(m.kind || '').toLowerCase();
            return !kind || kind === 'mt';
        });
    }

    function listInstalledSmartTranslateModels() {
        const catalog = retranslatePlanApi.filterSmartTranslateCatalog
            ? retranslatePlanApi.filterSmartTranslateCatalog(
                cachedSmartTranslatePick?.catalog,
                getManagedLlmCatalogApi(),
            )
            : (Array.isArray(cachedSmartTranslatePick?.catalog)
                ? cachedSmartTranslatePick.catalog.filter((item) => item?.installed
                    && isSmartTranslateCapableModel(item))
                : []);
        return catalog.map((item) => ({
            id: String(item.id || '').trim(),
            name: item.name || item.id,
            installed: true,
            paramBillion: item.paramBillion,
            proScale: item.proScale,
        })).filter((m) => m.id);
    }

    let translateMtManualBrowse = false;

    function rebuildTranslateMenuMtSection() {
        const host = els.translateMtModelList || document.getElementById('translateMtModelList');
        const listWrap = els.translateMtModelListWrap || document.getElementById('translateMtModelListWrap');
        const section = els.translateMtSection || document.getElementById('translateMtSection');
        const sectionLabel = els.translateMtSectionLabel || document.getElementById('translateMtSectionLabel');
        const autoBtn = els.translateMtAutoBtn || document.getElementById('translateMtAutoBtn');
        const manualBtn = els.translateMtManualBtn || document.getElementById('translateMtManualBtn');
        const autoDesc = els.translateMtAutoDesc || document.getElementById('translateMtAutoDesc');
        const task = readTaskFromForm();
        const allow = task === 'translate' || task === 'dual';
        const mode = allow ? readTranslateModeFromForm() : 'engine';
        const smartHybrid = mode === 'smart'
            && (els.smartTranslateHybridCheck?.checked !== false);
        const smartDialog = mode === 'smart' && !smartHybrid;
        const auto = isMtModelAutoSelected();
        const showManual = allow && (!auto || translateMtManualBrowse);
        const activeId = mode === 'smart'
            ? (smartHybrid
                ? readLlmMtModelFromForm()
                : String(cachedSmartTranslatePick?.smartTranslateModelId || '').trim())
            : (mode === 'llm' || mode === 'sakura'
                ? readLlmMtModelFromForm()
                : readOpusMtModelFromForm());

        if (auto && !translateMtManualBrowse) translateMtManualBrowse = false;

        section?.classList.toggle('hidden', !allow);
        if (els.translateMtPickSwitch) {
            els.translateMtPickSwitch.classList.toggle('hidden', !allow);
        }
        if (sectionLabel) {
            if (smartHybrid) sectionLabel.textContent = '句级推理模型';
            else if (smartDialog) sectionLabel.textContent = '对话模型';
            else sectionLabel.textContent = '模型';
        }
        if (autoBtn) {
            autoBtn.classList.toggle('is-active', allow && !showManual);
            autoBtn.setAttribute('aria-pressed', (!showManual && allow) ? 'true' : 'false');
        }
        if (manualBtn) {
            manualBtn.classList.toggle('is-active', !!showManual);
            manualBtn.setAttribute('aria-pressed', showManual ? 'true' : 'false');
        }
        // Auto pick is per-title at run time — don't show a static language/hardware model hint.
        if (autoDesc) autoDesc.textContent = '';
        if (els.translateMtAutoHint) {
            if (allow && mode === 'smart' && !showManual) {
                els.translateMtAutoHint.textContent = smartHybrid
                    ? '句级用专训推理模型；可自动匹配或手动指定。'
                    : '混合已关：对话模型按行翻译；可自动选用或手动指定已下载项。';
            } else {
                els.translateMtAutoHint.textContent = '';
            }
        }
        if (listWrap) {
            listWrap.classList.toggle('hidden', !showManual);
        }
        if (!host) return;
        host.innerHTML = '';
        if (!showManual) return;
        const list = smartDialog
            ? listInstalledSmartTranslateModels()
            : listInstalledMtModelsForMode(smartHybrid ? 'llm' : mode);
        if (!list.length) {
            const row = document.createElement('p');
            row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
            row.textContent = smartDialog
                ? '暂无已下载的对话模型 · 请到设置 → Pro → 大模型'
                : '暂无已下载模型 · 请到设置 → 模型下载';
            host.appendChild(row);
            return;
        }
        for (const model of list) {
            const id = String(model.id || '').trim();
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'post-task-menu-item';
            btn.dataset.mtModel = id;
            btn.setAttribute('role', 'menuitem');
            if (!auto && id === activeId) btn.classList.add('active');
            btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
            const label = smartDialog
                ? (model.name || id)
                : (formatEngineModelOptionLabel(model) || id);
            btn.querySelector('span').textContent = label;
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                translateMtManualBrowse = false;
                setTranslateMenuOpen(false);
                void setQuickMtModel(id);
            });
            host.appendChild(btn);
        }
    }

    async function setTranslateMtPickMode(pick) {
        const next = String(pick || '').trim() === 'manual' ? 'manual' : 'auto';
        if (next === 'auto') {
            translateMtManualBrowse = false;
            await setQuickMtModel('__auto__');
            rebuildTranslateMenuMtSection();
            return;
        }
        translateMtManualBrowse = true;
        setMtUseForm(true, { persist: false });
        // Keep current model if already manual; otherwise stay empty until user picks.
        rebuildTranslateMenuMtSection();
        syncTranslateChipUi();
    }

    function syncTranslateChipUi() {
        const task = readTaskFromForm();
        const allow = task === 'translate' || task === 'dual';
        const mode = allow ? readTranslateModeFromForm() : 'engine';
        const followSense = shouldFollowSenseForMt();
        const auto = isMtModelAutoSelected();
        let label = '—';
        let title = '翻译方式和模型';
        if (translateChipApi.buildTranslateChipViewModel) {
            const smartHybrid = mode === 'smart'
                && (els.smartTranslateHybridCheck?.checked !== false);
            const rec = (allow && auto && !followSense && (mode !== 'smart' || smartHybrid))
                ? recommendFormMtModel({ translateMode: smartHybrid ? 'llm' : mode })
                : {};
            const vm = translateChipApi.buildTranslateChipViewModel({
                task,
                mode,
                followSense,
                auto,
                autoSenseEnabled: isAutoSenseEnabled(),
                recommend: rec,
                opusId: readOpusMtModelFromForm(),
                llmId: readLlmMtModelFromForm(),
                smartId: String(cachedSmartTranslatePick?.smartTranslateModelId || '').trim(),
                hybridMt: els.smartTranslateHybridCheck
                    ? !!els.smartTranslateHybridCheck.checked
                    : true,
                plotPolish: els.smartTranslatePolishCheck
                    ? !!els.smartTranslatePolishCheck.checked
                    : true,
            });
            label = vm.label;
            title = vm.title;
        } else if (allow) {
            label = translateModeLabel(mode);
        }
        if (els.quickTranslateLabel) els.quickTranslateLabel.textContent = label;
        if (els.quickTranslateBtn) els.quickTranslateBtn.title = title;
        els.translateMenuWrap?.classList.toggle('opacity-50', !allow);
        els.translateMenuWrap?.classList.toggle('pointer-events-none', !allow);
        els.translateMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
            item.classList.toggle('active', item.dataset.translateMode === mode);
        });
        rebuildTranslateMenuMtSection();
    }

    function syncTranslateModeChipUi() { syncTranslateChipUi(); }
    function syncMtModelChipUi() { syncTranslateChipUi(); }

    function ensureMtSelectAllowsEmpty(selectEl, emptyLabel) {
        if (!selectEl) return;
        if ([...selectEl.options].some((o) => o.value === '')) return;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = emptyLabel || '自动匹配';
        selectEl.insertBefore(opt, selectEl.firstChild);
    }

    async function setQuickMtModel(modelId) {
        const task = readTaskFromForm();
        if (task !== 'translate' && task !== 'dual') return;
        const mode = readTranslateModeFromForm();
        const raw = String(modelId || '').trim();
        const emptyLlmLabel = '自动匹配（按语言 / Pro / 硬件）';
        const emptyOpusLabel = '自动匹配（按源语言 · Opus）';
        const smartHybrid = mode === 'smart'
            && (els.smartTranslateHybridCheck?.checked !== false);
        const smartDialog = mode === 'smart' && !smartHybrid;

        if (raw === '__sense__' || raw === '__auto__') {
            translateMtManualBrowse = false;
            const follow = isAutoSenseEnabled();
            setMtUseForm(!follow, { persist: false });
            if (smartDialog) {
                const res = await electron?.transubAdvancedSaveByok?.({
                    llmSource: 'managed',
                    smartTranslateModelId: '',
                });
                if (res && res.ok === false) {
                    showToast(res.error || '无法切换为自动', 'warn');
                    return;
                }
                cachedSmartTranslatePick = null;
                await ensureSmartTranslatePickCache({ force: true });
                showToast('智能翻译改回自动选对话模型', 'ok');
            } else {
                ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.value = '';
                if (!smartHybrid && els.engineMtModelSelect) els.engineMtModelSelect.value = '';
                showToast(
                    mode === 'smart'
                        ? '智能翻译改回自动选句级模型'
                        : (follow ? '翻译改回自动（按片子选）' : '翻译改回自动选模型'),
                    'ok',
                );
            }
        } else {
            const auto = !raw;
            translateMtManualBrowse = auto ? false : translateMtManualBrowse;
            setMtUseForm(true, { persist: false });
            if (smartDialog) {
                if (auto) {
                    const res = await electron?.transubAdvancedSaveByok?.({
                        llmSource: 'managed',
                        smartTranslateModelId: '',
                    });
                    if (res && res.ok === false) {
                        showToast(res.error || '无法切换为自动', 'warn');
                        return;
                    }
                    cachedSmartTranslatePick = null;
                    await ensureSmartTranslatePickCache({ force: true });
                    showToast('智能翻译改回自动选对话模型', 'ok');
                } else {
                    const pick = await ensureSmartTranslatePickCache({ force: !cachedSmartTranslatePick });
                    const ready = await ensureRequiredModelsReadyOrPrompt({
                        modelIds: [raw],
                        contextLabel: `对话模型「${raw}」`,
                        catalog: Array.isArray(pick?.catalog) ? pick.catalog : [],
                        settingsTab: 'pro-llm',
                        settingsHint: '设置 → Pro → 大模型',
                    });
                    if (!ready) return;
                    const res = await electron?.transubAdvancedManagedLlmSelect?.({
                        modelId: raw,
                        role: 'smartTranslate',
                    });
                    if (!res?.ok) {
                        showToast(res?.error || '无法选用智能翻译模型', 'warn');
                        return;
                    }
                    cachedSmartTranslatePick = null;
                    await ensureSmartTranslatePickCache({ force: true });
                    showToast(`已指定对话模型：${raw}`, 'ok');
                }
            } else if (mode === 'llm' || mode === 'sakura' || smartHybrid) {
                if (!auto) {
                    const ready = await ensureRequiredModelsReadyOrPrompt({
                        modelIds: [raw],
                        contextLabel: mode === 'smart'
                            ? `句级模型「${raw}」`
                            : `翻译模型「${raw}」`,
                    });
                    if (!ready) return;
                }
                ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                if (els.engineLlmMtModelSelect) {
                    els.engineLlmMtModelSelect.value = auto ? '' : raw;
                    if (!auto && els.engineLlmMtModelSelect.value !== raw) {
                        ensureSelectValue(els.engineLlmMtModelSelect, raw, { label: raw, allowEmpty: true });
                    }
                }
                if (auto) {
                    showToast(mode === 'smart' ? '智能翻译改回自动选句级模型' : '翻译改回自动选模型', 'ok');
                } else if (mode === 'smart') {
                    showToast(`已指定句级模型：${raw}`, 'ok');
                } else if (isAutoSenseEnabled()) {
                    showToast('已指定翻译模型（识别仍走自动）', 'ok');
                }
            } else {
                if (!auto) {
                    const ready = await ensureRequiredModelsReadyOrPrompt({
                        modelIds: [raw],
                        contextLabel: `翻译模型「${raw}」`,
                    });
                    if (!ready) return;
                }
                ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                if (els.engineMtModelSelect) {
                    els.engineMtModelSelect.value = auto ? '' : raw;
                    if (!auto && els.engineMtModelSelect.value !== raw) {
                        ensureSelectValue(els.engineMtModelSelect, raw, { label: raw, allowEmpty: true });
                    }
                }
                if (auto) {
                    showToast('翻译改回自动选模型', 'ok');
                } else if (isAutoSenseEnabled()) {
                    showToast('已指定翻译模型（识别仍走自动）', 'ok');
                }
            }
        }
        markSettingsDirty(true);
        setSaveParamsStatus('有未保存更改', 'warn');
        syncTranslateChipUi();
        syncParamsModeChipUi();
        updateReadinessStrip();
        await persistFormOptionsQuiet();
        // Re-assert after persist in case a normalize/reload path raced.
        if (!raw || raw === '__auto__' || raw === '__sense__') {
            if (mode === 'llm' || mode === 'sakura' || smartHybrid) {
                ensureMtSelectAllowsEmpty(els.engineLlmMtModelSelect, emptyLlmLabel);
                if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.value = '';
            } else if (!smartDialog) {
                ensureMtSelectAllowsEmpty(els.engineMtModelSelect, emptyOpusLabel);
                if (els.engineMtModelSelect) els.engineMtModelSelect.value = '';
            }
            syncTranslateChipUi();
        }
        updateParamsSummary();
    }

    async function setQuickTranslateMode(mode) {
        const task = readTaskFromForm();
        if (task !== 'translate' && task !== 'dual') return;
        applyTranslateModeToForm(mode, { fromUser: true });
        markSettingsDirty(true);
        setSaveParamsStatus('有未保存更改', 'warn');
        syncTranslateChipUi();
        updateReadinessStrip();
        updateModelSelectHint();
        await persistFormOptionsQuiet();
        updateParamsSummary();
    }

    function updateReadinessStrip() {
        if (!els.readinessStrip || isStandaloneSettings) return;
        const backend = readEngineBackendFromForm();
        const task = readTaskFromForm();
        const mode = readTranslateModeFromForm();
        const enginePath = String(els.engineInstallPathInput?.value || '').trim();
        const engineOk = backend === 'twai'
            ? !!String(els.installPathInput?.value || '').trim()
            : !!enginePath || !!els.engineStatus?.className?.includes('emerald');
        let llmPreferId = '';
        if ((mode === 'llm' || mode === 'sakura') && !(els.engineLlmMtModelSelect?.value || '')) {
            const rec = recommendFormMtModel({ translateMode: 'llm' });
            llmPreferId = rec.preferId || rec.id || '';
        }
        const vm = startReadinessApi.buildReadinessStripViewModel
            ? startReadinessApi.buildReadinessStripViewModel({
                backend,
                task,
                taskLabel: taskLabelOf(task),
                mode,
                modeLabel: translateModeLabel(mode),
                asrLabel: els.engineAsrModelSelect?.value || '默认 ASR',
                engineOk,
                advancedEntitled,
                opusMtId: els.engineMtModelSelect?.value || '',
                llmMtId: els.engineLlmMtModelSelect?.value || '',
                llmPreferId,
            })
            : { text: '界面核心未加载，请重启应用', tone: 'warn', action: null };
        els.readinessStripText.textContent = vm.text;
        els.readinessStrip.classList.remove('hidden', 'is-warn', 'is-ok');
        if (vm.tone === 'warn') {
            els.readinessStrip.classList.add('is-warn');
        } else {
            els.readinessStrip.classList.add('is-ok');
        }
        if (els.readinessStripAction && vm.action) {
            els.readinessStripAction.classList.remove('hidden');
            els.readinessStripAction.textContent = vm.action.label;
            els.readinessStripAction.dataset.action = vm.action.action;
            delete els.readinessStripAction.dataset.recommendedAsr;
        } else {
            els.readinessStripAction?.classList.add('hidden');
        }
    }

    function warnMissingRendererCores() {
        const checks = [
            ['TransubStartReadiness', !!startReadinessApi.computeStartBlockReason],
            ['TransubSenseFinalize', !!senseFinalizeApi.planEnforceSenseAdopt],
            ['TransubSettingsSavedOptions', !!(savedOptionsApi.assembleSavedOptionsFromFields
                || settingsNormApi.assembleSavedOptionsFromFields)],
            ['TransubPostBatchAutofixPlan', !!postBatchAutofixApi.planPostBatchAutofixFlags],
            ['TransubRetranslatePlan', !!retranslatePlanApi.computeRetranslateOverallPct],
            ['TransubInferStageProgress', !!inferProgress.applyVideoProgressPayload],
            ['TransubEngineMissingModels', !!missingModelsApi.resolveExpectedOpusMtModelIds],
        ];
        const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
        if (!missing.length) return;
        const msg = `关键界面核心未加载：${missing.join('、')}（请重启或重装）`;
        console.warn('[Transub]', msg);
        if (!isStandaloneChrome) appendLog(msg, 'err');
    }

    function computeStartBlockReason() {
        if (startReadinessApi.computeStartBlockReason) {
            return startReadinessApi.computeStartBlockReason({
                running: state.running,
                postBatchBusy: state.postBatchBusy,
                retranslateBusy: state.retranslateBusy,
                computeBusy: state.computeBusy,
                computeBusyLabel: state.computeBusyLabel,
                items: state.items,
                autoSenseEnabled: isAutoSenseEnabled(),
            });
        }
        // Fail closed: never silently allow start if readiness core is missing.
        return '界面核心未加载，请重启应用';
    }

    async function syncComputeBusyFromMain() {
        if (!electron?.transubComputeTaskStatus) return state.computeBusy;
        try {
            const st = await electron.transubComputeTaskStatus();
            const busy = !!st?.busy;
            state.computeBusy = busy;
            state.computeBusyLabel = busy
                ? String(st.label || st.kind || '').trim()
                : '';
            state.computeBusySince = busy ? Number(st.since) || state.computeBusySince || Date.now() : 0;
            state.computeBusyOwner = busy ? String(st.owner || '').trim() : '';
            state.computeBusyKind = busy ? String(st.kind || '').trim() : '';
            updateComputeBusyStrip();
            return busy;
        } catch {
            return state.computeBusy;
        }
    }

    async function clearStaleComputeBusyIfNeeded() {
        const busy = await syncComputeBusyFromMain();
        const shouldClear = startReadinessApi.shouldForceReleaseStaleComputeLock
            ? startReadinessApi.shouldForceReleaseStaleComputeLock({
                computeBusy: busy,
                running: state.running,
                postBatchBusy: state.postBatchBusy,
                retranslateBusy: state.retranslateBusy,
            })
            : (busy && !state.running && !state.postBatchBusy && !state.retranslateBusy);
        if (!shouldClear) {
            updateStartButton();
            return { cleared: false, busy: !!busy, label: state.computeBusyLabel };
        }
        if (!electron?.transubComputeTaskForceRelease) {
            return { cleared: false, busy: true, label: state.computeBusyLabel };
        }
        try {
            const res = await electron.transubComputeTaskForceRelease();
            state.computeBusy = false;
            state.computeBusyLabel = '';
            state.computeBusySince = 0;
            state.computeBusyOwner = '';
            state.computeBusyKind = '';
            updateStartButton();
            updateStopButton();
            return {
                cleared: !!res?.released || !!res?.ok,
                busy: false,
                before: res?.before || null,
            };
        } catch (err) {
            return {
                cleared: false,
                busy: true,
                label: state.computeBusyLabel,
                error: err?.message || String(err),
            };
        }
    }

    function updateStartHint() {
        const reason = computeStartBlockReason();
        if (!els.startBtn) return;
        els.startBtn.title = reason || '开始执行选中条目';
        els.startBtn.setAttribute('aria-disabled', els.startBtn.disabled ? 'true' : 'false');
    }

    function openFirstQcIssueItem() {
        const idx = state.items.findIndex((i) => Number(i.qcIssueCount) > 0);
        if (idx < 0) return;
        openItemEditor(state.items[idx]);
    }

    function retryAllFailedItems() {
        if (state.running) return;
        const failed = state.items.filter((i) => i.status === 'failed' || i.status === 'error');
        if (!failed.length) return;
        failed.forEach((item) => {
            item.status = 'ready';
            item.progress = 0;
            item.detail = '';
            item.error = '';
            item.selected = true;
        });
        renderList();
        updateStartButton();
        showToast(`已选中 ${failed.length} 个失败条目，可点击开始重试`, 'info');
    }

    function updateParamsSummary() {
        const device = els.deviceSelect?.value || 'cuda';
        const deviceLabel = DEVICE_LABELS[device] || device;
        const task = readTaskFromForm();
        const taskLabel = taskLabelOf(task);
        const overwriteLabel = els.overwriteCheck?.checked ? ' · 覆盖' : '';
        const mergeBiLabel = task === 'dual' && els.mergeBilingualCheck?.checked
            ? (els.deleteSourcesAfterMergeCheck?.checked ? ' · 合并双语并删原轨' : ' · 合并双语')
            : '';
        const formatLabel = readSubFormatsFromForm().replace(/,/g, '/');
        let modelLabel = '';
        if (modelApi) {
            if (task === 'dual') {
                modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('transcribe'))}→${modelApi.modelLabelFromPath(readModelPathFromForm('translate'))}`;
            } else if (task === 'transcribe') {
                modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('transcribe'))}`;
            } else {
                modelLabel = ` · ${modelApi.modelLabelFromPath(readModelPathFromForm('translate'))}`;
            }
        }
        const summary = `${deviceLabel} · ${taskLabel}${modelLabel} · ${formatLabel}${overwriteLabel}${mergeBiLabel}`;
        if (els.paramsSummary) els.paramsSummary.textContent = summary;
        if (els.quickTaskSelect && els.taskSelect) {
            els.quickTaskSelect.value = els.taskSelect.value || 'translate';
        }
        if (els.quickLanguageSelect && els.languageSelect) {
            els.quickLanguageSelect.value = els.languageSelect.value || 'auto';
        }
        if (els.quickTargetLangSelect && els.chineseSubtitleVariantSelect) {
            els.quickTargetLangSelect.value = els.chineseSubtitleVariantSelect.value || 'simplified';
        }
        if (els.quickFormatLabel) {
            els.quickFormatLabel.textContent = formatLabel || 'srt';
        }
        syncParamsMoreChipUi();
        updateEnvBanner();
        updateAutoSenseUi();
        syncTranslateModeChipUi();
        syncMtModelChipUi();
        syncPostBatchQcFixChipUi();
        updateReadinessStrip();
    }

    function isAutoSenseEnabled() {
        return autoSenseEnabledState !== false;
    }

    function isAutoDeepSenseEnabled() {
        if (els.autoDeepSenseCheck) {
            return !!els.autoDeepSenseCheck.checked;
        }
        return !!savedOptionsSnapshot?.autoDeepSense;
    }

    /** Sense opts for newly added media (drag / browse). Deep only when both switches allow it. */
    function senseOptsForNewMedia() {
        if (isAutoSenseEnabled() && isAutoDeepSenseEnabled()) {
            return { deep: true };
        }
        return {};
    }

    function shortParamsModeLabel(text, maxLen = 10) {
        if (startReadinessApi.shortParamsModeLabel) {
            return startReadinessApi.shortParamsModeLabel(text, maxLen);
        }
        const raw = String(text || '').trim();
        return raw || '自定义';
    }

    function getActiveParamsPresetId() {
        if (isAutoSenseEnabled()) return '';
        return String(els.presetSelect?.value || pendingActivePresetId || '').trim();
    }

    function getActiveParamsPresetName() {
        const id = getActiveParamsPresetId();
        if (!id) return '';
        if (els.presetSelect) {
            const opt = [...els.presetSelect.options].find((o) => o.value === id);
            if (opt) {
                return String(opt.textContent || '').replace(/（内置）\s*$/, '').trim();
            }
        }
        const cached = paramsModePresetCache.find((p) => String(p?.id || '') === id);
        return String(cached?.name || '').trim();
    }

    /**
     * Apply recognition preset id to the settings select (may defer until options load).
     * @returns {boolean} true if applied to the select now
     */
    function applyActivePresetIdToSelect(presetId) {
        const want = String(presetId || '').trim();
        if (!els.presetSelect) {
            pendingActivePresetId = want;
            return false;
        }
        if (!want) {
            els.presetSelect.value = '';
            pendingActivePresetId = '';
            return true;
        }
        const has = [...els.presetSelect.options].some((o) => o.value === want);
        if (has) {
            els.presetSelect.value = want;
            pendingActivePresetId = '';
            return true;
        }
        pendingActivePresetId = want;
        return false;
    }

    function flushPendingActivePresetId() {
        if (!pendingActivePresetId) {
            syncParamsModeChipUi();
            return false;
        }
        const applied = applyActivePresetIdToSelect(pendingActivePresetId);
        syncParamsModeChipUi();
        return applied;
    }

    function setParamsModeMenuOpen(open) {
        paramsModeMenuOpen = !!open;
        els.paramsModeMenu?.classList.toggle('hidden', !open);
        els.paramsModeBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateModeMenuOpen(false);
            setMtModelMenuOpen(false);
            setParamsMoreMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
            setExpertExtrasMenuOpen(false);
            if (paramsModePresetCache.length) {
                rebuildParamsModePresetItems(paramsModePresetCache, { preferActiveGroup: true });
            }
            rebuildParamsModeAsrSection();
        }
    }

    let paramsModeAsrManualBrowse = false;

    function listInstalledAsrModels() {
        const models = Array.isArray(cachedEngineModels) ? cachedEngineModels : [];
        return models.filter((m) => {
            if (!m?.installed || m?.incomplete) return false;
            if (String(m.kind || '').toLowerCase() !== 'asr') return false;
            return !!String(m.id || '').trim();
        });
    }

    function resolveParamsModeAsrLabel() {
        const id = String(els.engineAsrModelSelect?.value || els.quickAsrModelSelect?.value || '').trim();
        if (!id) return '';
        const fromSelect = [...(els.engineAsrModelSelect?.options || [])]
            .find((o) => o.value === id);
        const selectLabel = String(fromSelect?.textContent || '').trim();
        if (selectLabel) return selectLabel;
        const model = listInstalledAsrModels().find((m) => String(m.id || '') === id);
        return formatEngineModelOptionLabel(model) || id;
    }

    function rebuildParamsModeAsrSection() {
        const host = els.paramsModeAsrModelList || document.getElementById('paramsModeAsrModelList');
        const listWrap = els.paramsModeAsrModelListWrap || document.getElementById('paramsModeAsrModelListWrap');
        const autoBtn = els.paramsModeAsrAutoBtn || document.getElementById('paramsModeAsrAutoBtn');
        const manualBtn = els.paramsModeAsrManualBtn || document.getElementById('paramsModeAsrManualBtn');
        const hint = els.paramsModeAsrHint || document.getElementById('paramsModeAsrHint');
        const auto = isAutoSenseEnabled() || !!getActiveParamsPresetId();
        const showManual = !auto || paramsModeAsrManualBrowse;
        const activeId = String(els.engineAsrModelSelect?.value || '').trim();

        if (auto && !paramsModeAsrManualBrowse) paramsModeAsrManualBrowse = false;

        if (autoBtn) {
            autoBtn.classList.toggle('is-active', !showManual);
            autoBtn.setAttribute('aria-pressed', (!showManual) ? 'true' : 'false');
        }
        if (manualBtn) {
            manualBtn.classList.toggle('is-active', !!showManual);
            manualBtn.setAttribute('aria-pressed', showManual ? 'true' : 'false');
        }
        if (hint) {
            hint.textContent = showManual
                ? '选用已下载的识别模型；将关闭智能感知与预设类型。'
                : (isAutoSenseEnabled()
                    ? '智能感知开启时，ASR 由每部片子决定。'
                    : '当前随所选预设类型使用其 ASR。');
        }
        if (listWrap) {
            listWrap.classList.toggle('hidden', !showManual);
        }
        if (!host) return;
        host.innerHTML = '';
        if (!showManual) return;
        const list = listInstalledAsrModels();
        if (!list.length) {
            const row = document.createElement('p');
            row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
            row.textContent = '暂无已下载识别模型 · 请到设置 → 模型下载';
            host.appendChild(row);
            return;
        }
        for (const model of list) {
            const id = String(model.id || '').trim();
            if (!id) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'post-task-menu-item';
            btn.dataset.asrModel = id;
            btn.setAttribute('role', 'menuitem');
            if (!auto && id === activeId) btn.classList.add('active');
            btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
            btn.querySelector('span').textContent = formatEngineModelOptionLabel(model) || id;
            host.appendChild(btn);
        }
    }

    async function setParamsModeAsrPickMode(pick) {
        const next = String(pick || '').trim() === 'manual' ? 'manual' : 'auto';
        if (next === 'auto') {
            paramsModeAsrManualBrowse = false;
            selectParamsModeSense({ persist: true });
            rebuildParamsModeAsrSection();
            return;
        }
        paramsModeAsrManualBrowse = true;
        applyActivePresetIdToSelect('');
        setAutoSenseEnabled(false, { persist: false });
        await persistFormOptionsQuiet();
        rebuildParamsModeAsrSection();
        syncParamsModeChipUi();
        syncSenseLockedExtras();
    }

    async function selectParamsModeAsrManual(modelId, { persist = true } = {}) {
        const id = String(modelId || '').trim();
        if (!id || !els.engineAsrModelSelect) return;
        paramsModeAsrManualBrowse = false;
        applyActivePresetIdToSelect('');
        setAutoSenseEnabled(false, { persist: false });
        ensureSelectValue(els.engineAsrModelSelect, id, { label: id });
        els.engineAsrModelSelect.dispatchEvent(new Event('change'));
        mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
        if (persist) await persistFormOptionsQuiet();
        syncParamsModeChipUi();
        rebuildParamsModeAsrSection();
        syncTranslateChipUi();
        syncSenseLockedExtras();
        const label = resolveParamsModeAsrLabel() || id;
        showToast(`已手动选用 ASR：${label}`, 'ok');
    }

    /**
     * User changed ASR outside the recognition menu (settings / 快捷): leave preset chip.
     */
    function adoptManualAsrFromUserChange({ persist = true } = {}) {
        if (isAutoSenseEnabled()) {
            if (persist) void persistFormOptionsQuiet();
            return;
        }
        const hadPreset = !!getActiveParamsPresetId();
        paramsModeAsrManualBrowse = false;
        if (hadPreset) applyActivePresetIdToSelect('');
        syncParamsModeChipUi();
        rebuildParamsModeAsrSection();
        if (persist) void persistFormOptionsQuiet();
    }

    let paramsModePresetTabGroup = '';
    let paramsModePresetCache = [];

    const PARAMS_MODE_PRESET_GROUP_ORDER = Object.freeze([
        '软声', '影视', '动漫', '对话', '自定义', '其他',
    ]);
    const PARAMS_MODE_PRESET_TAB_LABELS = Object.freeze({
        软声: '软声',
        影视: '影视',
        动漫: '动漫',
        对话: '对话',
        自定义: '自定义',
        其他: '其他',
    });

    function paramsModePresetGroupOf(preset) {
        return String(preset?.group || (preset?.builtin ? '其他' : '自定义')).trim()
            || (preset?.builtin ? '其他' : '自定义');
    }

    function bucketParamsModePresets(presets = []) {
        const list = Array.isArray(presets) ? presets.filter((p) => p?.id) : [];
        const buckets = new Map();
        for (const p of list) {
            const group = paramsModePresetGroupOf(p);
            if (!buckets.has(group)) buckets.set(group, []);
            buckets.get(group).push(p);
        }
        const orderedGroups = [
            ...PARAMS_MODE_PRESET_GROUP_ORDER.filter((g) => buckets.has(g)),
            ...[...buckets.keys()].filter((g) => !PARAMS_MODE_PRESET_GROUP_ORDER.includes(g)),
        ];
        return { buckets, orderedGroups, list };
    }

    function resolveParamsModePresetTab(orderedGroups, activeId, buckets, { preferActiveGroup = false } = {}) {
        if (preferActiveGroup && activeId) {
            for (const group of orderedGroups) {
                if ((buckets.get(group) || []).some((p) => p.id === activeId)) return group;
            }
        }
        if (paramsModePresetTabGroup && orderedGroups.includes(paramsModePresetTabGroup)) {
            return paramsModePresetTabGroup;
        }
        if (activeId) {
            for (const group of orderedGroups) {
                if ((buckets.get(group) || []).some((p) => p.id === activeId)) return group;
            }
        }
        return orderedGroups[0] || '';
    }

    function rebuildParamsModePresetItems(presets = [], { preferActiveGroup = false } = {}) {
        const host = els.paramsModePresetList || document.getElementById('paramsModePresetList');
        const tabsHost = els.paramsModePresetTabs || document.getElementById('paramsModePresetTabs');
        if (!host) return;
        if (Array.isArray(presets)) paramsModePresetCache = presets.slice();
        const { buckets, orderedGroups, list } = bucketParamsModePresets(paramsModePresetCache);
        const activeId = getActiveParamsPresetId();
        const activeGroup = resolveParamsModePresetTab(orderedGroups, activeId, buckets, { preferActiveGroup });
        paramsModePresetTabGroup = activeGroup;

        if (tabsHost) {
            tabsHost.innerHTML = '';
            tabsHost.classList.toggle('hidden', orderedGroups.length <= 1);
            for (const group of orderedGroups) {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'params-mode-preset-tab' + (group === activeGroup ? ' is-active' : '');
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-selected', group === activeGroup ? 'true' : 'false');
                tab.dataset.presetGroup = group;
                tab.textContent = PARAMS_MODE_PRESET_TAB_LABELS[group] || group;
                tab.title = group;
                tab.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (paramsModePresetTabGroup === group) return;
                    paramsModePresetTabGroup = group;
                    rebuildParamsModePresetItems(paramsModePresetCache);
                });
                tabsHost.appendChild(tab);
            }
        }

        host.innerHTML = '';
        const rows = activeGroup ? (buckets.get(activeGroup) || []) : list;
        const renderItem = (p) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const sceneStyle = !!(p.scenePrimary && p.scene);
            btn.className = sceneStyle
                ? 'post-task-menu-item params-mode-preset-item params-mode-scene-item'
                : 'post-task-menu-item params-mode-preset-item';
            btn.setAttribute('role', 'menuitem');
            btn.dataset.presetId = p.id;
            if (p.id === activeId) btn.classList.add('active');
            const title = String(p.scene || p.name || p.id).trim();
            const desc = String(p.sceneBlurb || p.description || '').trim();
            if (desc) btn.title = desc;
            const check = document.createElement('i');
            check.className = 'fa fa-check post-task-check';
            check.setAttribute('aria-hidden', 'true');
            const body = document.createElement('span');
            body.className = 'params-mode-preset-body';
            const titleEl = document.createElement('span');
            titleEl.className = 'params-mode-preset-title';
            titleEl.textContent = title;
            body.appendChild(titleEl);
            if (desc) {
                const descEl = document.createElement('span');
                descEl.className = 'params-mode-preset-desc';
                descEl.textContent = desc;
                body.appendChild(descEl);
            }
            btn.appendChild(check);
            btn.appendChild(body);
            host.appendChild(btn);
        };
        if (!rows.length) {
            const empty = document.createElement('p');
            empty.className = 'translate-menu-hint';
            empty.textContent = '该分类暂无预设';
            host.appendChild(empty);
        } else {
            rows.forEach((p) => renderItem(p));
        }
        syncParamsModeChipUi();
        rebuildParamsSceneCards(list);
    }

    function rebuildParamsSceneCards(presets = []) {
        const host = els.paramsSceneCards || document.getElementById('paramsSceneCards');
        if (!host) return;
        host.innerHTML = '';
        const list = Array.isArray(presets) ? presets : [];
        const primary = list.filter((p) => p?.id && p.scenePrimary && p.scene);
        const activeId = String(document.getElementById('presetSelect')?.value || '').trim();
        for (const p of primary) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'params-scene-card';
            btn.dataset.presetId = p.id;
            btn.setAttribute('role', 'listitem');
            if (p.id === activeId) btn.classList.add('is-active');
            const title = document.createElement('span');
            title.className = 'params-scene-card-title';
            title.textContent = p.scene || p.name || p.id;
            const desc = document.createElement('span');
            desc.className = 'params-scene-card-desc';
            desc.textContent = p.sceneBlurb || p.description || '';
            btn.appendChild(title);
            btn.appendChild(desc);
            btn.addEventListener('click', () => {
                const sel = document.getElementById('presetSelect');
                if (sel) {
                    sel.value = p.id;
                    sel.dispatchEvent(new Event('change'));
                }
                host.querySelectorAll('.params-scene-card').forEach((el) => {
                    el.classList.toggle('is-active', el.dataset.presetId === p.id);
                });
            });
            host.appendChild(btn);
        }
    }

    function syncParamsModeChipUi() {
        const autoEnabled = isAutoSenseEnabled();
        const presetId = getActiveParamsPresetId();
        const presetName = getActiveParamsPresetName();
        const activeItem = [...(els.paramsModeMenu?.querySelectorAll?.('[data-preset-id]') || [])]
            .find((el) => el.dataset.presetId === presetId);
        const vm = startReadinessApi.buildParamsModeChipViewModel
            ? startReadinessApi.buildParamsModeChipViewModel({
                autoEnabled,
                presetId,
                presetName,
                autoSenseUi: state.autoSenseUi || {},
                mtUseForm: !!mtUseFormState,
                translateTask: readTaskFromForm() === 'translate' || readTaskFromForm() === 'dual',
                presetDesc: String(activeItem?.title || '').trim(),
                asrModelId: String(els.engineAsrModelSelect?.value || '').trim(),
                asrModelLabel: resolveParamsModeAsrLabel(),
            })
            : { label: '设置', title: '', tone: 'off', autoEnabled, presetId };

        if (els.paramsModeLabel) els.paramsModeLabel.textContent = vm.label;
        if (els.paramsModeBtn) {
            els.paramsModeBtn.title = vm.title;
            els.paramsModeBtn.setAttribute('aria-pressed', autoEnabled ? 'true' : 'false');
        }
        if (els.paramsModeChip) {
            els.paramsModeChip.className = `content-profile-chip tone-${vm.tone}`;
        }

        const custom = !autoEnabled && !presetId;
        const customHint = els.paramsModeCustomHint || document.getElementById('paramsModeCustomHint');
        if (customHint) {
            customHint.hidden = !custom;
            customHint.classList.toggle('hidden', !custom);
        }

        els.paramsModeMenu?.querySelectorAll('[data-params-mode="sense"]').forEach((item) => {
            item.classList.toggle('active', autoEnabled);
            item.setAttribute('aria-checked', autoEnabled ? 'true' : 'false');
        });
        els.paramsModeMenu?.querySelectorAll('[data-params-mode="custom"]').forEach((item) => {
            const active = !autoEnabled && !presetId;
            item.classList.toggle('active', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        els.paramsModeMenu?.querySelectorAll('[data-preset-id]').forEach((item) => {
            const active = !autoEnabled && item.dataset.presetId === presetId;
            item.classList.toggle('active', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        rebuildParamsModeAsrSection();
        syncSenseLockedExtras();
    }

    function selectParamsModeSense({ persist = true } = {}) {
        paramsModeAsrManualBrowse = false;
        if (els.presetSelect) els.presetSelect.value = '';
        setMtUseForm(false, { persist: false });
        setAutoSenseEnabled(true, { persist });
        showToast('已改回智能感知', 'ok');
        syncTranslateChipUi();
        syncSenseLockedExtras();
    }

    function selectParamsModeCustom({ persist = true } = {}) {
        paramsModeAsrManualBrowse = true;
        applyActivePresetIdToSelect('');
        setAutoSenseEnabled(false, { persist: false });
        if (persist) void persistFormOptionsQuiet();
        showToast('已改用手动 ASR', 'warn');
        syncTranslateChipUi();
        syncParamsModeChipUi();
        syncSenseLockedExtras();
    }

    async function selectParamsModePreset(presetId, { persist = true } = {}) {
        const id = String(presetId || '').trim();
        if (!id) return;
        paramsModeAsrManualBrowse = false;
        const features = global.TransubFeatures;
        const name = (() => {
            const item = [...(els.paramsModeMenu?.querySelectorAll?.('[data-preset-id]') || [])]
                .find((el) => el.dataset.presetId === id);
            return String(item?.querySelector?.('.params-mode-preset-title')?.textContent
                || item?.textContent
                || id).trim();
        })();
        if (typeof features?.applyPreset === 'function') {
            const applied = await features.applyPreset(id, { persist, autoSense: false });
            if (applied === false) return;
            syncParamsModeChipUi();
            syncTranslateChipUi();
            showToast(`已按「${name}」识别`, 'ok');
            return;
        }
        setAutoSenseEnabled(false, { persist: false });
        applyActivePresetIdToSelect(id);
        if (persist) void persistFormOptionsQuiet();
        syncParamsModeChipUi();
        showToast(`已按「${name}」识别`, 'ok');
    }

    function setAutoSenseEnabled(on, { persist = true } = {}) {
        const enabled = !!on;
        autoSenseEnabledState = enabled;
        if (enabled) {
            applyActivePresetIdToSelect('');
        }
        updateAutoSenseUi();
        syncTranslateChipUi();
        renderList();
        if (persist) {
            void persistFormOptionsQuiet();
        }
        if (enabled) {
            const pending = state.items.filter((i) => i.status === 'ready' || i.status === 'pending');
            pending.forEach((item) => {
                if (!item.sense || item.sense.status === 'idle' || item.sense.status === 'off') {
                    enqueueSense(item);
                }
            });
        }
    }

    function updateAutoSenseUi() {
        const profileApi = global.TransubContentProfile;
        if (!profileApi?.describeAutoSenseUi && !profileApi?.describeContentProfileUi) {
            syncParamsModeChipUi();
            return;
        }

        const autoEnabled = isAutoSenseEnabled();
        let sensingCount = 0;
        let adoptedCount = 0;
        let doneCount = 0;
        let errorCount = 0;
        for (const item of state.items) {
            const s = item.sense;
            if (!s) continue;
            if (s.status === 'sensing') sensingCount += 1;
            if (s.status === 'error') errorCount += 1;
            if (s.status === 'done') {
                doneCount += 1;
                if (s.adopted) adoptedCount += 1;
            }
        }

        const describe = profileApi.describeAutoSenseUi || profileApi.describeContentProfileUi;
        let ui = describe({
            autoEnabled,
            sensingCount,
            adoptedCount,
            doneCount,
            itemCount: state.items.length,
        });
        if (senseRecoveryApi.enrichAutoSenseUiForErrors) {
            ui = senseRecoveryApi.enrichAutoSenseUiForErrors(ui, {
                errorCount,
                autoEnabled,
            });
        }
        state.autoSenseUi = ui;
        syncParamsModeChipUi();
        const recoveryHost = document.getElementById('paramsModeRecovery');
        if (recoveryHost) {
            const show = errorCount > 0;
            recoveryHost.hidden = !show;
            recoveryHost.classList.toggle('hidden', !show);
        }
        updateStartButton();
    }

    function applySenseRecoveryAction(actionId, item = null) {
        const id = String(actionId || '').trim();
        if (!id) return;
        if (id === 'deep-resense') {
            if (item) {
                resenseItem(item);
                return;
            }
            const errors = state.items.filter((it) => it?.sense?.status === 'error');
            if (!errors.length) {
                showToast('当前没有感知失败的条目', 'info');
                return;
            }
            errors.forEach((it) => resenseItem(it));
            showToast(`已对 ${errors.length} 项启动深度感知`, 'ok');
            return;
        }
        if (id === 'disable-sense') {
            selectParamsModeCustom({ persist: true });
            setParamsModeMenuOpen(false);
            openAppSettings('params');
            return;
        }
        if (id === 'open-params-scene') {
            setParamsModeMenuOpen(true);
            showToast('请选一种片子类型', 'info');
            return;
        }
        if (id === 'open-models') {
            void openParamsModal('models');
            void openEngineModelsLibrary({ refresh: true });
            showToast('请在模型库下载或指定 ASR', 'info');
        }
    }

    function applyBatchRecoveryAction(actionId, idx) {
        const id = String(actionId || '').trim();
        const index = Number(idx);
        if (!id || !Number.isFinite(index)) return;
        const item = state.items[index];
        if (!item) return;
        if (id === 'retry-item') {
            retrySingleItem(index);
            return;
        }
        if (id === 'resume-from-asr') {
            void resumeSingleItem(index);
            return;
        }
        if (id === 'export-diagnostics') {
            void exportItemDiagnostics(index);
            return;
        }
        if (id === 'open-engine-log') {
            if (electron?.transubEngineOpenLatestLog) {
                void electron.transubEngineOpenLatestLog().then((res) => {
                    if (res?.ok === false) {
                        showToast(res.error || '无法打开引擎日志', 'warn');
                        return;
                    }
                    showToast('已打开引擎日志', 'ok');
                }).catch((err) => {
                    showToast(err?.message || '无法打开引擎日志', 'warn');
                });
            } else {
                openAppSettings('runtime');
                showToast('请在设置中查看引擎日志路径', 'info');
            }
            return;
        }
        if (id === 'switch-device-cpu') {
            if (els.deviceSelect) {
                els.deviceSelect.value = 'cpu';
                els.deviceSelect.dispatchEvent(new Event('change'));
            }
            markSettingsDirty(true);
            void persistFormOptionsQuiet();
            showToast('已切换为 CPU，正在重试本条…', 'ok');
            appendLog('恢复引导：设备已改为 CPU，自动重试本条', 'ok');
            retrySingleItem(index);
            return;
        }
        if (id === 'open-models') {
            openAppSettings('models', { openLibrary: true });
            showToast('请更换或下载 ASR 模型后重试', 'info');
        }
    }

    /** @deprecated */
    function updateContentProfileUi() {
        updateAutoSenseUi();
    }

    function getSenseBaseOptions() {
        try {
            return buildRuntimeOptions();
        } catch {
            return {
                language: els.languageSelect?.value || 'auto',
                task: readTaskFromForm(),
            };
        }
    }

    async function resolveSenseLanguagePrior(item, base, senseHints = {}) {
        const profileApi = global.TransubContentProfile;
        const backend = String(base.engineBackend || els.engineBackendSelect?.value || 'transub');
        const planned = senseFinalizeApi.planSenseLanguagePrior
            ? senseFinalizeApi.planSenseLanguagePrior({
                formLang: base.language,
                metaRaw: item.metaLanguage || item.audioLanguages?.[0] || '',
                itemPath: item.path,
                senseHints,
                backend,
                hasDetectApi: !!electron?.transubEngineDetectLanguage,
                senseBase: base,
                profileApi,
            })
            : { done: true, prior: { language: String(base.language || 'auto').toLowerCase() || 'auto', source: 'form', confidence: 0 } };
        if (planned.done) return planned.prior;

        appendLog(`短窗语种探测：${basename(item.path)}…`, 'info');
        const sniffWin = profileApi?.resolveSenseSniffWindow?.({
            durationSec: item.duration || 0,
            windowSec: 12,
        }) || { startSec: 0, durationSec: 12, reason: '片头区', skippedIntro: false };
        let sniffRes = null;
        let sniffError = '';
        try {
            sniffRes = await electron.transubEngineDetectLanguage({
                mediaPath: item.path,
                asrModel: base.engineAsrModel,
                device: base.device || 'auto',
                durationSec: sniffWin.durationSec,
                startSec: sniffWin.startSec,
                options: base,
            });
        } catch (err) {
            sniffError = `语种探测失败：${err?.message || err}`;
        }
        const after = senseFinalizeApi.resolveSenseLanguagePriorAfterSniff
            ? senseFinalizeApi.resolveSenseLanguagePriorAfterSniff({
                sniffRes,
                sniffWin,
                pathPrior: planned.pathPrior,
                metaGuess: planned.metaGuess,
                nameGuess: planned.nameGuess,
                senseHints,
                profileApi,
                sniffError,
            })
            : { prior: { language: 'auto', source: 'form', confidence: 0 }, logLines: [] };
        for (const line of (after.logLines || [])) {
            appendLog(line.text, line.level || 'info');
        }
        return after.prior;
    }

    /**
     * Apply resolveItemSense result + optional lang prior / model refine onto item.sense.
     * Shared by instant AV path and queued sense.
     */
    function finalizeSenseResult(item, resolved, langPrior, senseBase, {
        depth = 'quick',
        refineModels = true,
        quietSkip = false,
    } = {}) {
        const profileApi = global.TransubContentProfile;
        const asrSettingsApi = global.TransubAsrSettings || {};
        const enrichedBase = {
            ...(senseBase || {}),
            hardwareRecommendAsr: cachedHardwareRecommend?.asrModel || '',
            hardwareRecommendProfile: cachedHardwareRecommend?.profile || '',
            hwProfile: cachedHardwareRecommend?.profile || senseBase?.hwProfile || '',
            vramGb: parseVramGbHint(),
            applyHardwareAsrRecommend: asrSettingsApi.applyHardwareAsrRecommend,
        };
        if (senseFinalizeApi.buildFinalizedSenseState) {
            const built = senseFinalizeApi.buildFinalizedSenseState({
                itemName: basename(item.path),
                resolved,
                langPrior,
                senseBase: enrichedBase,
                depth,
                refineModels,
                quietSkip,
                installedModels: cachedEngineModels,
                advancedEntitled,
                demucsReady: true,
                profileApi,
            });
            item.sense = built.sense;
            for (const line of (built.logLines || [])) {
                appendLog(line.text, line.level || 'info');
            }
            if (built.recordMemory) {
                recordSenseMemoryForItem(item, true);
            }
            return;
        }
        item.sense = {
            status: 'done',
            adopted: !!resolved.adopted,
            classification: resolved.classification || null,
            overrides: { ...(resolved.overrides || {}) },
            supportGaps: [],
            message: resolved.message || '',
            action: resolved.action || 'skip',
            languagePrior: langPrior || null,
            depth,
        };
    }

    /**
     * Instant finish for known 番号 / strong AV — sync, no probe / LID / acoustic / IPC.
     * @returns {boolean} true when sense completed immediately
     */
    function tryInstantAvSense(item) {
        if (!item || item.status === 'error') return false;
        if (!isAutoSenseEnabled()) return false;
        // Already finished on drop — keep result for instant callers
        if (item.sense?.status === 'done') {
            return item.sense?.depth === 'instant'
                || !!item.sense?.classification?.strongAv;
        }
        if (item.sense?.status === 'sensing') return false;
        const profileApi = global.TransubContentProfile;
        if (!profileApi?.resolveItemSense || !profileApi.isInstantAvSenseCandidate) return false;

        const planned = senseFinalizeApi.planInstantAvSense
            ? senseFinalizeApi.planInstantAvSense({
                path: item.path,
                durationSec: item.duration || 0,
                advancedEntitled,
                senseBaseOptions: getSenseBaseOptions(),
                profileApi,
            })
            : null;
        if (!planned) return false;

        finalizeSenseResult(item, planned.resolved, planned.langPrior, planned.senseBase, {
            depth: 'instant',
            refineModels: true,
        });
        const nameClassification = planned.classification || {};
        appendLog(
            `编号即感：${basename(item.path)} · ${nameClassification.label}`
            + ` ${Math.round((nameClassification.confidence || 0) * 100)}%（深入感知请点深度感知）`,
            'info',
        );
        return true;
    }

    async function runSenseForItem(item, { force = false, deep = false } = {}) {
        if (!item || item.status === 'error') return;
        const profileApi = global.TransubContentProfile;
        if (!profileApi?.resolveItemSense) return;

        if (!isAutoSenseEnabled() && !force) {
            item.sense = {
                status: 'off',
                adopted: false,
                classification: item.sense?.classification || null,
                overrides: item.sense?.overrides || {},
                message: '',
            };
            refreshListRow(item);
            updateAutoSenseUi();
            return;
        }

        // Deep probes (LID / acoustic / memory / model refresh) only on 重感
        const wantDeep = !!(deep || force);

        // Drag-in: known 番号 finishes immediately (may also hit after probe if not yet sensed)
        if (!wantDeep && tryInstantAvSense(item)) {
            refreshListRow(item);
            updateAutoSenseUi();
            return;
        }

        item.sense = {
            status: 'sensing',
            adopted: false,
            classification: null,
            overrides: {},
            message: wantDeep ? '正在深入感知…' : '正在感知…',
            depth: wantDeep ? 'deep' : 'quick',
        };
        refreshListRow(item);
        updateAutoSenseUi();
        appendLog(
            wantDeep
                ? `深入感知：${basename(item.path)}`
                : `正在感知：${basename(item.path)}`,
            'info',
        );

        try {
            const base = getSenseBaseOptions();

            const nameLangGuess = profileApi.guessLanguageFromName?.(item.path) || null;
            const quickLang = (nameLangGuess?.language
                && Number(nameLangGuess.confidence || 0) >= 0.55)
                ? nameLangGuess.language
                : undefined;
            const nameClassification = profileApi.classifyContentProfile?.({
                path: item.path,
                durationSec: item.duration || 0,
                language: quickLang,
            }) || null;
            const filenameConfident = profileApi.isFilenameSenseConfident?.(nameClassification)
                || false;
            if (filenameConfident && !wantDeep) {
                appendLog(
                    `文件名已确信「${nameClassification.label || nameClassification.profile}」`
                    + ` ${Math.round((nameClassification.confidence || 0) * 100)}%`
                    + `，拖入快感完成（深入请点深度感知）`,
                    'info',
                );
            }

            // Quick drag: name / meta priors only. Deep (重感): may run short-window LID.
            let langPrior;
            if (wantDeep) {
                langPrior = await resolveSenseLanguagePrior(item, base, {
                    profile: nameClassification?.profile,
                    profileConfidence: nameClassification?.confidence,
                    profileConfident: false,
                    strongAv: !!nameClassification?.strongAv,
                    forceDeep: true,
                });
            } else {
                const formLang = String(base.language || '').trim().toLowerCase();
                if (formLang && formLang !== 'auto') {
                    langPrior = { language: formLang, source: 'form', confidence: 1 };
                } else if (nameLangGuess?.language
                    && Number(nameLangGuess.confidence || 0) >= 0.55) {
                    langPrior = {
                        language: nameLangGuess.language,
                        source: 'name',
                        confidence: nameLangGuess.confidence,
                        reason: nameLangGuess.reason,
                    };
                } else {
                    const metaRaw = String(item.metaLanguage || item.audioLanguages?.[0] || '')
                        .trim()
                        .toLowerCase();
                    const metaGuess = profileApi.priorFromMetaLanguage?.(metaRaw) || null;
                    if (metaGuess?.language && Number(metaGuess.confidence || 0) >= 0.65) {
                        langPrior = {
                            language: metaGuess.language,
                            source: 'meta',
                            confidence: metaGuess.confidence,
                            reason: metaGuess.reason,
                        };
                    } else {
                        langPrior = { language: 'auto', source: 'form', confidence: 0 };
                    }
                }
            }
            if (profileApi?.coerceLanguageForSoftAv && langPrior) {
                const coerced = profileApi.coerceLanguageForSoftAv(langPrior.language, {
                    strongAv: !!nameClassification?.strongAv,
                    profile: nameClassification?.profile || '',
                });
                if (coerced && coerced !== langPrior.language) {
                    langPrior = { ...langPrior, language: coerced };
                }
            }

            const senseBase = {
                ...base,
                language: (langPrior.language && langPrior.language !== 'auto')
                    ? langPrior.language
                    : (base.language || 'auto'),
            };

            let memoryHits = [];
            if (wantDeep) {
                try {
                    const keys = profileApi.buildSenseMemoryKeys?.(item.path) || [];
                    if (keys.length && electron?.transubSenseMemoryLookup) {
                        const memRes = await electron.transubSenseMemoryLookup({ keys });
                        if (memRes?.ok && Array.isArray(memRes.hits)) memoryHits = memRes.hits;
                    }
                } catch { /* ignore */ }
            }

            const resolved = profileApi.resolveItemSense(
                { path: item.path, durationSec: item.duration || 0 },
                senseBase,
                { autoSense: true, advancedEntitled, memoryHits },
            );

            let overrides = { ...(resolved.overrides || {}) };
            // Acoustic only on deep 重感
            const profile = resolved.classification?.profile || 'unknown';
            if (wantDeep
                && profileApi.shouldProbeAcoustic?.({
                    profile,
                    strongAv: !!resolved.classification?.strongAv,
                    confidence: resolved.classification?.confidence,
                    force: true,
                })
                && electron?.ffmpegProbeAcoustic) {
                try {
                    appendLog(`声学探测：${basename(item.path)}…`, 'info');
                    const acWin = profileApi.resolveSenseSniffWindow?.({
                        durationSec: item.duration || 0,
                        windowSec: 12,
                    }) || { startSec: 0, durationSec: 12 };
                    const acoustic = await electron.ffmpegProbeAcoustic({
                        path: item.path,
                        durationSec: acWin.durationSec,
                        startSec: acWin.startSec,
                        ffmpegPath: getFfmpegPathFromForm(),
                    });
                    if (acoustic?.ok || acoustic?.hint) {
                        item.senseAcoustic = acoustic;
                        const ac = profileApi.applyAcousticHints?.(overrides, acoustic, {
                            profile,
                            advancedEntitled,
                            language: overrides.language || senseBase.language,
                        });
                        if (ac?.overrides) {
                            overrides = ac.overrides;
                            resolved.overrides = overrides;
                        }
                        if (ac?.notes?.length) {
                            appendLog(`声学：${basename(item.path)} · ${ac.notes.join('；')}`, 'info');
                        }
                    }
                } catch (err) {
                    appendLog(`声学探测跳过：${err?.message || err}`, 'warn');
                }
            }

            if (wantDeep
                && !cachedEngineModels.length
                && (base.engineBackend || 'transub') !== 'twai') {
                try {
                    await refreshEngineModels({ silent: true });
                } catch { /* ignore */ }
            }

            // Deep path: filename still 未识别 → promote from acoustic / LID / duration
            if (wantDeep
                && profileApi.promoteClassificationFromEvidence
                && profileApi.resolveSenseFromClassification) {
                const promo = profileApi.promoteClassificationFromEvidence(
                    resolved.classification,
                    {
                        acoustic: item.senseAcoustic || null,
                        language: overrides.language || senseBase.language || langPrior?.language,
                        languageConfidence: langPrior?.confidence || 0,
                        durationSec: item.duration || 0,
                        path: item.path,
                        strongAv: !!resolved.classification?.strongAv,
                        avLikely: !!resolved.classification?.strongAv
                            || /编号|软声/.test(String(resolved.classification?.reasons?.join(' ') || ''))
                            || /软声/.test(String(langPrior?.reason || '')),
                    },
                );
                if (promo?.promoted && promo.classification) {
                    const promoted = profileApi.resolveSenseFromClassification(
                        promo.classification,
                        senseBase,
                        { autoSense: true, advancedEntitled },
                    );
                    // Keep language / acoustic tweaks already gathered
                    const keptLang = overrides.language;
                    overrides = { ...(promoted.overrides || {}), ...overrides };
                    if (keptLang) overrides.language = keptLang;
                    resolved.action = promoted.action;
                    resolved.adopted = promoted.adopted;
                    resolved.classification = promo.classification;
                    resolved.message = promoted.message || resolved.message;
                    if (promo.notes?.length) {
                        appendLog(`加强识别：${basename(item.path)} · ${promo.notes.join('；')}`, 'info');
                    }
                }
            }

            // Quick sense → 未识别：自动加深（短窗语种 / 声学 / 记忆）
            const willEscalate = !wantDeep
                && isAutoSenseEnabled()
                && profileApi.shouldEscalateSenseDepth?.(resolved.classification, {
                    depth: 'quick',
                    alreadyEscalated: !!item.senseEscalated,
                });

            // Re-attach acoustic-adjusted overrides before finalize
            resolved.overrides = overrides;
            finalizeSenseResult(item, resolved, langPrior, senseBase, {
                depth: wantDeep ? 'deep' : 'quick',
                refineModels: true,
                quietSkip: willEscalate,
            });

            if (willEscalate) {
                item.senseEscalated = true;
                appendLog(
                    `未识别明确类型，加强感知：${basename(item.path)}`,
                    'info',
                );
                enqueueSense(item, { deep: true, escalate: true });
            }
        } catch (err) {
            const guide = senseRecoveryApi.buildSenseFailureGuidance
                ? senseRecoveryApi.buildSenseFailureGuidance({
                    message: err?.message || '感知失败',
                    autoEnabled: isAutoSenseEnabled(),
                })
                : {
                    tip: err?.message || '感知失败',
                    shortTip: '可：深度感知 · 关感知用表单 · 参数选场景',
                    logLine: err?.message || '感知失败',
                };
            item.sense = {
                status: 'error',
                adopted: false,
                classification: null,
                overrides: {},
                message: guide.tip,
                recovery: guide,
            };
            appendLog(`感知失败：${basename(item.path)} · ${guide.logLine}`, 'err');
            if (!isStandaloneSettings) {
                showToast(`${basename(item.path)}：${guide.shortTip}`, 'warn');
            }
        }
        refreshListRow(item);
        updateAutoSenseUi();
    }

    const SENSE_CONCURRENCY_QUICK = senseQueueApi.SENSE_CONCURRENCY_QUICK || 4;
    const SENSE_CONCURRENCY_DEEP = senseQueueApi.SENSE_CONCURRENCY_DEEP || 1;
    let senseModelsPrefetch = null;

    async function ensureSenseModelsPrefetch() {
        if (senseModelsPrefetch) return senseModelsPrefetch;
        senseModelsPrefetch = (async () => {
            try {
                const backend = readEngineBackendFromForm()
                    || els.engineBackendSelect?.value
                    || 'transub';
                if (backend === 'twai') return;
                if (!cachedEngineModels.length) {
                    await refreshEngineModels({ silent: true });
                }
            } catch { /* ignore */ }
        })();
        return senseModelsPrefetch;
    }

    const senseQueueCtl = typeof senseQueueApi.createSenseQueue === 'function'
        ? senseQueueApi.createSenseQueue({
            quickLimit: SENSE_CONCURRENCY_QUICK,
            deepLimit: SENSE_CONCURRENCY_DEEP,
            isEnabled: () => isAutoSenseEnabled(),
            tryInstant: (item) => tryInstantAvSense(item),
            onAfterInstant: (item) => {
                refreshListRow(item);
                updateAutoSenseUi();
            },
            ensurePrefetch: () => ensureSenseModelsPrefetch(),
            runJob: (item, opts) => runSenseForItem(item, opts),
            onIdle: () => {
                senseModelsPrefetch = null;
                updateAutoSenseUi();
            },
        })
        : null;

    function enqueueSense(item, opts = {}) {
        if (senseQueueCtl) {
            senseQueueCtl.enqueue(item, opts);
            return;
        }
        // Fallback if core missing (should not happen in packaged UI)
        if (!item) return;
        if (!isAutoSenseEnabled() && !opts.force) return;
        if (!opts.force && !opts.deep && tryInstantAvSense(item)) {
            refreshListRow(item);
            updateAutoSenseUi();
        }
    }

    function drainSenseQueue() {
        senseQueueCtl?.drain?.();
    }

    function recordSenseMemoryForItem(item, prefer) {
        const profileApi = global.TransubContentProfile;
        const profile = item?.sense?.classification?.profile;
        if (!profile || profile === 'unknown' || !electron?.transubSenseMemoryRecord) return;
        const keys = profileApi?.buildSenseMemoryKeys?.(item.path) || [];
        keys.forEach((key) => {
            void electron.transubSenseMemoryRecord({ key, profile, prefer: !!prefer });
        });
    }

    async function refreshSenseMemoryStatus() {
        if (!els.senseMemoryStatus) return;
        if (!electron?.transubSenseMemoryStats) {
            els.senseMemoryStatus.textContent = '记忆条目：桌面端可用';
            return;
        }
        try {
            const res = await electron.transubSenseMemoryStats();
            const count = Number(res?.count) || 0;
            els.senseMemoryStatus.textContent = res?.ok === false
                ? `记忆条目：读取失败${res.error ? `（${res.error}）` : ''}`
                : `记忆条目：${count}`;
            if (els.clearSenseMemoryBtn) {
                els.clearSenseMemoryBtn.disabled = count <= 0;
            }
        } catch (err) {
            els.senseMemoryStatus.textContent = `记忆条目：读取失败（${err?.message || err}）`;
        }
    }

    async function clearSenseMemoryFromSettings() {
        if (!electron?.transubSenseMemoryClear) {
            appendLog('清空感知记忆仅桌面端可用', 'warn');
            return;
        }
        const yes = await appConfirm({
            title: '清空感知记忆',
            message: '确定清空全部自动感知纠错记忆（目录 / 系列偏好）？\n当前列表里已有的感知结果不会被清除。',
            primaryLabel: '清空',
            secondaryLabel: '取消',
            danger: true,
        });
        if (!yes) return;
        try {
            const res = await electron.transubSenseMemoryClear();
            if (!res?.ok) {
                appendLog(`清空感知记忆失败：${res?.error || '未知错误'}`, 'err');
                return;
            }
            appendLog(`已清空感知记忆（${Number(res.cleared) || 0} 条）`, 'info');
            await refreshSenseMemoryStatus();
        } catch (err) {
            appendLog(`清空感知记忆失败：${err?.message || err}`, 'err');
        }
    }

    function isExplicitSenseReject(item) {
        if (senseFinalizeApi.isExplicitSenseReject) {
            return senseFinalizeApi.isExplicitSenseReject(item);
        }
        return false;
    }

    function rejectItemSense(item) {
        if (!item?.sense) return;
        item.sense = senseFinalizeApi.buildRejectedSenseState
            ? senseFinalizeApi.buildRejectedSenseState(item.sense)
            : { ...item.sense, adopted: false, userRejected: true };
        recordSenseMemoryForItem(item, false);
        refreshListRow(item);
        updateAutoSenseUi();
        appendLog(`不采纳感知：${basename(item.path)}`, 'info');
    }

    function adoptItemSense(item, { quiet = false } = {}) {
        const built = senseFinalizeApi.buildAdoptedSenseState
            ? senseFinalizeApi.buildAdoptedSenseState(item?.sense)
            : { ok: false };
        if (!built.ok) {
            if (!quiet && built.reason === 'no_overrides') {
                appendLog(`无法采纳：${basename(item.path)} · 无可用感知参数`, 'warn');
            }
            return false;
        }
        item.sense = built.sense;
        recordSenseMemoryForItem(item, true);
        refreshListRow(item);
        updateAutoSenseUi();
        if (state.running) {
            void syncLiveBatchOverrides(item);
        }
        if (!quiet) appendLog(`采纳感知：${basename(item.path)}`, 'info');
        return true;
    }

    async function syncLiveBatchOverrides(item) {
        if (!item?.path || !electron?.transubLiveBatchUpdateOverrides) return;
        try {
            await electron.transubLiveBatchUpdateOverrides({
                path: item.path,
                optionOverrides: senseOverridesForJob(item),
            });
        } catch { /* ignore */ }
    }

    function enforceSenseAdoptForStart(selectedItems = []) {
        const list = Array.isArray(selectedItems) ? selectedItems : [];
        // Fail closed if core missing: treat every item as uncovered.
        if (!senseFinalizeApi.planEnforceSenseAdopt) return list.slice();
        const planned = senseFinalizeApi.planEnforceSenseAdopt(list);
        const uncovered = Array.isArray(planned.uncovered) ? planned.uncovered.slice() : [];
        for (const idx of (planned.adoptIndexes || [])) {
            const item = list[idx];
            if (!item) continue;
            const ok = adoptItemSense(item, { quiet: true });
            if (!ok || !item.sense?.adopted) uncovered.push(item);
        }
        return uncovered;
    }

    function toggleItemSenseAdopt(item) {
        if (!item?.sense || item.sense.status !== 'done' || state.running) return;
        if (item.sense.adopted) {
            rejectItemSense(item);
            return;
        }
        adoptItemSense(item);
    }

    function resenseItem(item) {
        if (!item || state.running) return;
        item.sense = {
            status: 'idle',
            adopted: false,
            classification: null,
            overrides: {},
            message: '',
        };
        // 重感：启动深入感知（短窗语种 + 声学 + 记忆 + 模型刷新）
        enqueueSense(item, { force: true, deep: true });
    }

    async function applyOptionsToForm(options = {}, { applyUiMode = true } = {}) {
        void applyUiMode;
        stashTwaiLegacyFromOptions(options);
        if (els.engineBackendSelect) {
            els.engineBackendSelect.value = options.engineBackend === 'twai' ? 'twai' : 'transub';
        }
        if (els.engineInstallPathInput && options.engineInstallPath != null) {
            els.engineInstallPathInput.value = options.engineInstallPath;
        }
        // Await bundled-path refill before any renderList (e.g. setAutoSenseEnabled),
        // otherwise empty-state env hint sticks after the banner is later hidden.
        await ensureEngineInstallPathFilled();
        if (els.engineUrlInput && options.engineUrl != null) {
            els.engineUrlInput.value = options.engineUrl;
        }
        if (els.engineHfEndpointInput && options.engineHfEndpoint != null) {
            els.engineHfEndpointInput.value = options.engineHfEndpoint;
        }
        if (els.engineHfTokenInput && options.engineHfToken != null) {
            els.engineHfTokenInput.value = options.engineHfToken;
        }
        if (els.proxyEnabledCheck) {
            els.proxyEnabledCheck.checked = !!options.proxyEnabled;
        }
        if (els.proxyUrlInput) {
            els.proxyUrlInput.value = options.proxyUrl != null ? options.proxyUrl : '';
        }
        if (els.proxyBypassInput) {
            els.proxyBypassInput.value = options.proxyBypass != null && String(options.proxyBypass).trim()
                ? options.proxyBypass
                : 'localhost,127.0.0.1,::1,<local>';
        }
        syncProxySettingsUi();
        if (els.engineProfileSelect && options.engineProfile) {
            els.engineProfileSelect.value = options.engineProfile;
        }
        if (els.engineAsrModelSelect && options.engineAsrModel) {
            ensureSelectValue(els.engineAsrModelSelect, options.engineAsrModel, {
                label: `${options.engineAsrModel}`,
            });
        }
        {
            const activeMt = options.engineMtModel != null ? String(options.engineMtModel || '') : '';
            const activeIsLlm = isLlmInferencePickModelId(activeMt);
            const opusMt = options.engineOpusMtModel != null
                ? String(options.engineOpusMtModel || '')
                : (activeIsLlm ? '' : activeMt);
            const llmMt = options.engineLlmMtModel != null
                ? String(options.engineLlmMtModel || '')
                : (activeIsLlm ? activeMt : '');
            ensureSelectValue(els.engineMtModelSelect, opusMt, {
                label: opusMt ? `${opusMt}` : '',
                allowEmpty: true,
            });
            ensureSelectValue(els.engineLlmMtModelSelect, llmMt, {
                label: llmMt ? `${llmMt}` : '',
                allowEmpty: true,
            });
        }
        if (els.engineVadModelSelect && options.engineVadModel) {
            ensureSelectValue(els.engineVadModelSelect, options.engineVadModel, {
                label: `${options.engineVadModel}`,
            });
        }
        if (els.engineAutoStartCheck) {
            els.engineAutoStartCheck.checked = options.engineAutoStart !== false;
        }
        syncEngineBackendUi();
        if (els.installPathInput && options.installPath) {
            els.installPathInput.value = options.installPath;
        }
        if (els.deviceSelect && options.device) {
            els.deviceSelect.value = options.device;
        }
        if (els.taskSelect) {
            const task = options.task === 'transcribe' || options.task === 'dual'
                ? options.task
                : 'translate';
            els.taskSelect.value = task;
        }
        if (els.overwriteCheck) {
            els.overwriteCheck.checked = !!options.overwrite;
        }
        if (els.mergeBilingualCheck) {
            els.mergeBilingualCheck.checked = !!options.mergeBilingualSubtitles;
        }
        applyDualLineOrderToForm(options.dualLineOrder || 'target-first');
        if (els.smartTranslateCheck) {
            els.smartTranslateCheck.checked = !!options.smartTranslate;
        }
        if (els.smartTranslateFaithfulCheck) {
            const task = options.task === 'transcribe' || options.task === 'dual'
                ? options.task
                : 'translate';
            els.smartTranslateFaithfulCheck.checked = (task === 'translate' || task === 'dual')
                && !!options.smartTranslateFaithfulTone;
        }
        if (els.smartTranslateHybridCheck) {
            els.smartTranslateHybridCheck.checked = options.smartTranslateHybridMt !== false;
        }
        if (els.smartTranslatePolishCheck) {
            els.smartTranslatePolishCheck.checked = options.smartTranslatePlotPolish !== false;
        }
        if (els.smartTranslateVerifyCheck) {
            els.smartTranslateVerifyCheck.checked = options.smartTranslateFaithfulVerify !== false;
        }
        if (els.smartTranslateAddressCheck) {
            els.smartTranslateAddressCheck.checked = options.smartTranslateAddressConsistency !== false;
        }
        if (els.smartTranslatePolishLimitInput) {
            const lim = Number(options.smartTranslatePolishSampleLimit);
            els.smartTranslatePolishLimitInput.value = String(
                Number.isFinite(lim) ? Math.max(4, Math.min(36, Math.round(lim))) : 36,
            );
        }
        if (els.asrSecondOpinionSelect) {
            const mode = settingsNormApi.normalizeAsrSecondOpinion
                ? settingsNormApi.normalizeAsrSecondOpinion(options.asrSecondOpinion)
                : (String(options.asrSecondOpinion || 'auto').toLowerCase() === 'off' ? 'off'
                    : (String(options.asrSecondOpinion || '').toLowerCase() === 'on' ? 'on' : 'auto'));
            els.asrSecondOpinionSelect.value = mode;
        }
        {
            const briefSel = document.getElementById('reconstructBriefSampleModeSelect')
                || els.reconstructBriefSampleModeSelect;
            const mode = options.filmBriefSampleMode === 'full' ? 'full' : 'auto';
            if (briefSel) briefSel.value = mode;
            // Keep localStorage reconstruct prefs aligned (main window UI); editor reads options via IPC.
            try {
                const key = 'transub-editor-reconstruct-prefs';
                const raw = JSON.parse(localStorage.getItem(key) || '{}') || {};
                if (raw.briefSampleMode !== mode) {
                    raw.briefSampleMode = mode;
                    localStorage.setItem(key, JSON.stringify(raw));
                }
            } catch (_) { /* ignore */ }
        }
        if (els.filmAudioEnhanceCheck) {
            els.filmAudioEnhanceCheck.checked = !!options.filmAudioEnhance;
        }
        if (els.filmVadPresetCheck) {
            els.filmVadPresetCheck.checked = !!options.filmVadPreset && !options.filmAudioEnhance;
        }
        const setOptNum = (el, value) => {
            if (!el) return;
            el.value = value == null || value === '' ? '' : String(value);
        };
        setOptNum(els.filmVadThresholdInput, options.filmVadThreshold);
        setOptNum(els.filmVadMinSpeechInput, options.filmVadMinSpeechDurationMs);
        setOptNum(els.filmVadMinSilenceInput, options.filmVadMinSilenceDurationMs);
        setOptNum(els.filmHallucinationSilenceInput, options.filmHallucinationSilenceThreshold);
        if (els.qcSmartLlmSplitCheck) {
            els.qcSmartLlmSplitCheck.checked = options.qcSmartLlmSplit !== false;
        }
        if (els.qcSmartRetranscribeCheck) {
            els.qcSmartRetranscribeCheck.checked = options.qcSmartRetranscribe !== false;
        }
        if (els.qcSmartSemanticReviewCheck) {
            els.qcSmartSemanticReviewCheck.checked = options.qcSmartSemanticReview !== false;
        }
        if (els.qcSmartIntensitySelect) {
            const v = String(options.qcSmartIntensity || 'light').toLowerCase();
            els.qcSmartIntensitySelect.value = (v === 'medium' || v === 'strong') ? v : 'light';
        }
        if (els.qcSmartMaxRetranscribeInput) {
            const n = Number(options.qcSmartMaxRetranscribeRanges);
            els.qcSmartMaxRetranscribeInput.value = String(
                Number.isFinite(n) ? Math.max(1, Math.min(24, Math.round(n))) : 8,
            );
        }
        if (els.libraryOpenAfterBatchCheck) {
            els.libraryOpenAfterBatchCheck.checked = !!options.libraryOpenAfterBatch;
        }
        if (els.deleteSourcesAfterMergeCheck) {
            els.deleteSourcesAfterMergeCheck.checked = !!options.mergeBilingualSubtitles
                && !!options.deleteSourcesAfterMergeBilingual;
        }
        applySubFormatsToForm(options.subFormats);
        if (els.releaseGpuAfterCheck) {
            // null = auto (unchecked in UI means use default sakura/smart behavior)
            els.releaseGpuAfterCheck.checked = options.releaseGpuAfter === true;
        }
        if (els.chineseSubtitleVariantSelect) {
            const cv = String(options.chineseSubtitleVariant || 'simplified');
            const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
            els.chineseSubtitleVariantSelect.value = allowed.has(cv) ? cv : 'simplified';
        }
        if (els.glossaryMtCheck) {
            els.glossaryMtCheck.checked = options.glossaryMtEnabled !== false;
        }
        if (els.outputModeSelect) {
            els.outputModeSelect.value = options.outputMode === 'custom' || options.outputDir ? 'custom' : 'same';
        }
        if (els.outputDirInput && options.outputDir != null) {
            els.outputDirInput.value = options.outputDir;
        }
        if (els.audioSuffixesInput && options.audioSuffixes) {
            els.audioSuffixesInput.value = options.audioSuffixes;
        }
        if (els.ffmpegPathInput && options.ffmpegPath != null) {
            els.ffmpegPathInput.value = options.ffmpegPath;
        }
        els.outputDirWrap?.classList.toggle('hidden', (els.outputModeSelect?.value || 'same') !== 'custom');
        if (els.logLevelSelect && options.logLevel) {
            els.logLevelSelect.value = String(options.logLevel).toUpperCase();
        }
        syncLogLevelHint();
        if (els.maxBatchSizeInput && options.maxBatchSize != null) {
            els.maxBatchSizeInput.value = String(options.maxBatchSize);
        }
        if (els.languageSelect && options.language) {
            const lang = String(options.language).trim().toLowerCase();
            const supported = ['auto', 'ja', 'zh', 'yue', 'ko', 'en'];
            // Ignore exotic tags (nn/de/…) so the form never sticks on garbage ISO codes.
            if (supported.includes(lang)
                && [...els.languageSelect.options].some((o) => o.value === lang)) {
                els.languageSelect.value = lang;
            }
        }
        if (els.beamSizeInput && options.beamSize != null) {
            els.beamSizeInput.value = String(options.beamSize);
        }
        if (els.vadEnabledCheck) {
            els.vadEnabledCheck.checked = options.vadEnabled !== false;
        }
        if (els.vadSensitiveCheck) {
            els.vadSensitiveCheck.checked = !!options.vadSensitive;
        }
        if (els.vadThresholdInput && options.vadThreshold != null) {
            els.vadThresholdInput.value = String(options.vadThreshold);
        }
        if (els.vadMinSpeechDurationInput && options.vadMinSpeechDurationMs != null) {
            els.vadMinSpeechDurationInput.value = String(options.vadMinSpeechDurationMs);
        }
        if (els.vadMinSilenceDurationInput && options.vadMinSilenceDurationMs != null) {
            els.vadMinSilenceDurationInput.value = String(options.vadMinSilenceDurationMs);
        }
        if (els.vadSpeechPadInput && options.vadSpeechPadMs != null) {
            els.vadSpeechPadInput.value = String(options.vadSpeechPadMs);
        }
        if (els.vadMaxSingleSegmentInput) {
            let maxSeg = options.vadMaxSingleSegmentMs;
            if (maxSeg == null && options.targetChunkDurationS != null) {
                const sec = Number(options.targetChunkDurationS);
                if (Number.isFinite(sec) && sec > 0) maxSeg = Math.round(sec * 1000);
            }
            if (maxSeg != null) els.vadMaxSingleSegmentInput.value = String(maxSeg);
        }
        if (els.hallucinationSilenceInput) {
            const hallu = options.hallucinationSilenceThreshold;
            els.hallucinationSilenceInput.value = (hallu != null && hallu !== '' && Number(hallu) > 0)
                ? String(hallu)
                : '';
        }
        if (els.vadAggressiveCheck) {
            els.vadAggressiveCheck.checked = !!options.vadAggressive && !options.vadSensitive;
        }
        if (els.audioLightDenoiseCheck) {
            els.audioLightDenoiseCheck.checked = !!options.audioLightDenoise;
        }
        if (els.perfProfileSelect) {
            els.perfProfileSelect.value = String(options.perfProfile || 'quality') === 'speed'
                ? 'speed'
                : 'quality';
        }
        syncExpertExtraChipsUi();
        if (els.retranscribeWarmLightCheck) {
            els.retranscribeWarmLightCheck.checked = !!options.retranscribeWarmLight;
        }
        if (els.subtitleBakModeSelect) {
            const bakMode = String(options.subtitleBakMode || 'off').trim();
            els.subtitleBakModeSelect.value = ['off', 'beside', 'appBackup'].includes(bakMode)
                ? bakMode
                : 'off';
        }
        if (els.keepTranscriptCheck) {
            els.keepTranscriptCheck.checked = options.keepTranscript !== false;
        }
        if (els.transcriptKeepDirInput && options.transcriptKeepDir != null) {
            els.transcriptKeepDirInput.value = options.transcriptKeepDir;
        }
        if (els.transcriptKeepLimitInput && options.transcriptKeepLimit != null) {
            els.transcriptKeepLimitInput.value = String(options.transcriptKeepLimit);
        }
        if (els.transcriptKeepDaysInput && options.transcriptKeepDays != null) {
            els.transcriptKeepDaysInput.value = String(options.transcriptKeepDays);
        }
        if (els.trayProgressCheck) {
            els.trayProgressCheck.checked = !!options.trayProgressEnabled;
        }
        if (els.showTaskResourceUsageCheck) {
            els.showTaskResourceUsageCheck.checked = options.showTaskResourceUsage !== false;
        }
        if (els.rememberLastOpenDirCheck) {
            els.rememberLastOpenDirCheck.checked = options.rememberLastOpenDir !== false;
        }
        if (els.minimizeToTrayCheck) {
            els.minimizeToTrayCheck.checked = options.minimizeToTrayEnabled !== false;
        }
        if (els.minimizeToTrayOnStartCheck) {
            els.minimizeToTrayOnStartCheck.checked = !!options.minimizeToTrayOnStart;
        }
        if (els.trayNotifyCheck) {
            els.trayNotifyCheck.checked = !!options.trayNotifyEnabled;
        }
        if (els.startupWindowSelect) {
            const startup = String(options.startupWindow || '').trim().toLowerCase();
            els.startupWindowSelect.value = (startup === 'editor' || startup === 'subtitle-editor')
                ? 'editor'
                : 'generator';
        }
        if (els.uiLocaleSelect) {
            const nextLocale = (window.TransubI18n?.normalizeUiLocale
                || ((v) => (String(v || '').trim() === 'zh-Hant-TW' ? 'zh-Hant-TW' : 'zh-Hans')))(
                options.uiLocale,
            );
            els.uiLocaleSelect.value = nextLocale;
            window.TransubI18n?.setLocale?.(nextLocale, { apply: true, persist: true });
        }
        if (els.autoUpdateCheckIntervalSelect) {
            const interval = String(options.autoUpdateCheckInterval || 'weekly').trim().toLowerCase();
            els.autoUpdateCheckIntervalSelect.value = ['off', 'daily', 'weekly', 'monthly'].includes(interval)
                ? interval
                : 'weekly';
        }
        if (els.postBatchQcCheck) {
            els.postBatchQcCheck.checked = options.postBatchQc !== false;
        }
        void setPostBatchQcFixMode(options.postBatchQcFixMode || 'smart', { persist: false });
        if (els.autoDeepSenseCheck) {
            els.autoDeepSenseCheck.checked = !!options.autoDeepSense;
        }
        mtUseFormState = !!options.mtUseForm;
        setAutoSenseEnabled(options.autoSense !== false, { persist: false });
        // Only touch the recognition preset when the payload explicitly carries it, or when
        // turning 智能感知 back on. Otherwise applying a preset options patch (without
        // activePresetId) would wipe the chip back to「设置」immediately.
        if (options.autoSense !== false) {
            applyActivePresetIdToSelect('');
        } else if (Object.prototype.hasOwnProperty.call(options, 'activePresetId')) {
            applyActivePresetIdToSelect(options.activePresetId || '');
        }
        syncQuickExtrasBar();
        if (els.postBatchCpsSplitCheck) {
            els.postBatchCpsSplitCheck.checked = options.postBatchCpsSplit !== false;
        }
        if (els.qcSilenceSplitCharsInput) {
            const n = Number(options.qcSilenceSplitChars);
            els.qcSilenceSplitCharsInput.value = String(
                Number.isFinite(n) ? Math.max(0, Math.min(500, Math.round(n))) : 15,
            );
        }
        if (els.postBatchRemoveNoiseCheck) {
            els.postBatchRemoveNoiseCheck.checked = options.postBatchRemoveNoise !== false;
        }
        if (els.postBatchCompressRepCheck) {
            els.postBatchCompressRepCheck.checked = options.postBatchCompressRepetition !== false;
        }
        if (els.postBatchViewingPunctModeSelect) {
            els.postBatchViewingPunctModeSelect.value = normalizeViewingCleanMode(
                options.postBatchViewingPunctMode,
                options.postBatchSimplifyViewingPunctuation === false ? 'off' : 'clear',
            );
        }
        if (els.postBatchInterjectionModeSelect) {
            els.postBatchInterjectionModeSelect.value = normalizeViewingCleanMode(
                options.postBatchInterjectionMode,
                options.postBatchCompactPureInterjections === false ? 'off' : 'clear',
            );
        }
        if (els.postBatchOnomatopoeiaModeSelect) {
            els.postBatchOnomatopoeiaModeSelect.value = normalizeViewingCleanMode(
                options.postBatchOnomatopoeiaMode,
                options.postBatchCompactPureInterjections === false ? 'off' : 'clear',
            );
        }
        syncDeviceOptionsForMode();
        syncBatchSizeUi();
        syncExpertCustomHints();
        // Apply 翻译方式 from options BEFORE Chinese-variant / smart-UI sync, which
        // re-reads radios (HTML default is 机器翻译) and would otherwise clobber llm/smart.
        syncTranslateModeFromOptions(options);
        syncChineseSubtitleVariantUi();
        void refreshModelSelects(options);
        syncExpertExtraChipsUi();
        syncParamsModeChipUi();
        updateParamsSummary();
        updateAsrWindowTip();
    }

    function readTwaiLegacyOptionsFromSnapshot() {
        return readTwaiLegacyOptions();
    }

    function buildSavedOptionsFromForm() {
        const task = readTaskFromForm();
        const translateMode = readTranslateModeFromForm();
        const viewingPunct = els.postBatchViewingPunctModeSelect
            ? normalizeViewingCleanMode(els.postBatchViewingPunctModeSelect.value, 'clear')
            : 'clear';
        const viewingInterj = els.postBatchInterjectionModeSelect
            ? normalizeViewingCleanMode(els.postBatchInterjectionModeSelect.value, 'clear')
            : 'clear';
        const viewingOnomato = els.postBatchOnomatopoeiaModeSelect
            ? normalizeViewingCleanMode(els.postBatchOnomatopoeiaModeSelect.value, 'clear')
            : 'clear';
        const assemble = savedOptionsApi.assembleSavedOptionsFromFields
            || settingsNormApi.assembleSavedOptionsFromFields;
        if (!assemble) {
            throw new Error('settings-saved-options-core 未加载，无法保存设置');
        }
        const built = assemble({
                engineBackend: readEngineBackendFromForm(),
                engineInstallPath: engineInstallPathForSave(),
                engineUrl: els.engineUrlInput?.value.trim() || 'http://127.0.0.1:8765',
                engineHfEndpoint: els.engineHfEndpointInput?.value?.trim() ?? 'https://hf-mirror.com',
                engineHfToken: els.engineHfTokenInput?.value?.trim() ?? '',
                proxyEnabled: !!els.proxyEnabledCheck?.checked,
                proxyUrl: els.proxyUrlInput?.value?.trim() || '',
                proxyBypass: els.proxyBypassInput?.value?.trim() || '',
                engineProfile: els.engineProfileSelect?.value || 'balanced',
                engineAsrModel: els.engineAsrModelSelect?.value || 'sensevoice-small',
                engineOpusMtModel: readOpusMtModelFromForm(),
                engineLlmMtModel: readLlmMtModelFromForm(),
                translateMode,
                engineVadModel: els.engineVadModelSelect?.value || 'fsmn-vad',
                engineAutoStart: els.engineAutoStartCheck ? !!els.engineAutoStartCheck.checked : true,
                // TWAI path UI removed; keep snapshot so old twai configs are not wiped on save.
                installPath: els.installPathInput
                    ? (els.installPathInput.value.trim() || '')
                    : String(savedOptionsSnapshot?.installPath || '').trim(),
                device: els.deviceSelect?.value || 'cuda',
                task,
                overwrite: !!els.overwriteCheck?.checked,
                mergeBilingualSubtitles: !!els.mergeBilingualCheck?.checked,
                dualLineOrder: readDualLineOrderFromForm(),
                smartTranslate: !!els.smartTranslateCheck?.checked,
                smartTranslateFaithfulTone: !!els.smartTranslateFaithfulCheck?.checked,
                smartTranslateHybridMt: els.smartTranslateHybridCheck
                    ? !!els.smartTranslateHybridCheck.checked
                    : true,
                smartTranslatePlotPolish: els.smartTranslatePolishCheck
                    ? !!els.smartTranslatePolishCheck.checked
                    : true,
                smartTranslateFaithfulVerify: els.smartTranslateVerifyCheck
                    ? !!els.smartTranslateVerifyCheck.checked
                    : true,
                smartTranslateAddressConsistency: els.smartTranslateAddressCheck
                    ? !!els.smartTranslateAddressCheck.checked
                    : true,
                smartTranslatePolishSampleLimitRaw: els.smartTranslatePolishLimitInput?.value,
                asrSecondOpinion: els.asrSecondOpinionSelect?.value || 'auto',
                filmBriefSampleMode: document.getElementById('reconstructBriefSampleModeSelect')?.value
                    || els.reconstructBriefSampleModeSelect?.value,
                advancedEntitled,
                filmAudioEnhance: !!els.filmAudioEnhanceCheck?.checked,
                filmVadPreset: !!els.filmVadPresetCheck?.checked,
                filmVadThresholdRaw: els.filmVadThresholdInput?.value,
                filmVadMinSpeechDurationMsRaw: els.filmVadMinSpeechInput?.value,
                filmVadMinSilenceDurationMsRaw: els.filmVadMinSilenceInput?.value,
                filmHallucinationSilenceThresholdRaw: els.filmHallucinationSilenceInput?.value,
                qcSmartLlmSplit: els.qcSmartLlmSplitCheck ? !!els.qcSmartLlmSplitCheck.checked : true,
                qcSmartRetranscribe: els.qcSmartRetranscribeCheck
                    ? !!els.qcSmartRetranscribeCheck.checked
                    : true,
                qcSmartSemanticReview: els.qcSmartSemanticReviewCheck
                    ? !!els.qcSmartSemanticReviewCheck.checked
                    : true,
                qcSmartIntensity: els.qcSmartIntensitySelect?.value || 'light',
                qcSmartMaxRetranscribeRangesRaw: els.qcSmartMaxRetranscribeInput?.value,
                libraryOpenAfterBatch: !!els.libraryOpenAfterBatchCheck?.checked,
                deleteSourcesAfterMergeBilingual: !!els.deleteSourcesAfterMergeCheck?.checked,
                subFormats: readSubFormatsFromForm(),
                releaseGpuAfter: els.releaseGpuAfterCheck?.checked ? true : null,
                modelPath: readModelPathFromForm('translate') || readModelPathFromForm('transcribe') || '',
                transcribeModelPath: readModelPathFromForm('transcribe'),
                translateModelPath: readModelPathFromForm('translate'),
                chineseSubtitleVariant: normalizeChineseSubtitleVariant(
                    els.chineseSubtitleVariantSelect?.value || 'simplified',
                ),
                glossaryMtEnabled: els.glossaryMtCheck ? !!els.glossaryMtCheck.checked : true,
                logLevel: els.logLevelSelect?.value || 'DEBUG',
                maxBatchSize: Number(els.maxBatchSizeInput?.value) || 8,
                language: els.languageSelect?.value || 'auto',
                beamSize: Number(els.beamSizeInput?.value) || 5,
                vadEnabled: els.vadEnabledCheck ? !!els.vadEnabledCheck.checked : true,
                vadSensitive: !!els.vadSensitiveCheck?.checked,
                vadThreshold: els.vadThresholdInput?.value,
                vadMinSpeechDurationMs: els.vadMinSpeechDurationInput?.value,
                vadMinSilenceDurationMs: els.vadMinSilenceDurationInput?.value,
                vadSpeechPadMs: els.vadSpeechPadInput?.value,
                vadMaxSingleSegmentMsRaw: els.vadMaxSingleSegmentInput?.value,
                vadAggressive: !!els.vadAggressiveCheck?.checked,
                audioLightDenoise: !!els.audioLightDenoiseCheck?.checked,
                perfProfile: els.perfProfileSelect?.value || 'quality',
                twaiLegacy: readTwaiLegacyOptionsFromSnapshot(),
                hallucinationSilenceThresholdRaw: els.hallucinationSilenceInput?.value,
                retranscribeWarmLight: !!els.retranscribeWarmLightCheck?.checked,
                subtitleBakMode: els.subtitleBakModeSelect?.value,
                keepTranscript: els.keepTranscriptCheck ? !!els.keepTranscriptCheck.checked : true,
                transcriptKeepDir: els.transcriptKeepDirInput?.value.trim() || '',
                transcriptKeepLimitRaw: els.transcriptKeepLimitInput?.value,
                transcriptKeepDaysRaw: els.transcriptKeepDaysInput?.value,
                trayProgressEnabled: els.trayProgressCheck ? !!els.trayProgressCheck.checked : true,
                showTaskResourceUsage: els.showTaskResourceUsageCheck
                    ? !!els.showTaskResourceUsageCheck.checked
                    : true,
                rememberLastOpenDir: els.rememberLastOpenDirCheck
                    ? !!els.rememberLastOpenDirCheck.checked
                    : true,
                minimizeToTrayEnabled: els.minimizeToTrayCheck ? !!els.minimizeToTrayCheck.checked : true,
                minimizeToTrayOnStart: !!els.minimizeToTrayOnStartCheck?.checked,
                trayNotifyEnabled: !!els.trayNotifyCheck?.checked,
                startupWindow: els.startupWindowSelect?.value,
                uiLocale: els.uiLocaleSelect?.value
                    || window.TransubI18n?.getLocale?.()
                    || 'zh-Hans',
                autoUpdateCheckInterval: els.autoUpdateCheckIntervalSelect?.value,
                autoSense: isAutoSenseEnabled(),
                activePresetId: isAutoSenseEnabled()
                    ? ''
                    : String(els.presetSelect?.value || pendingActivePresetId || '').trim(),
                mtUseForm: !!mtUseFormState,
                settingsUiMode: 'standard',
                autoDeepSense: !!els.autoDeepSenseCheck?.checked,
                postBatchQc: els.postBatchQcCheck ? !!els.postBatchQcCheck.checked : true,
                postBatchQcFixMode: getPostBatchQcFixMode(),
                qcSilenceSplitCharsRaw: els.qcSilenceSplitCharsInput?.value,
                postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
                postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
                postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
                postBatchViewingPunctMode: viewingPunct,
                postBatchInterjectionMode: viewingInterj,
                postBatchOnomatopoeiaMode: viewingOnomato,
                outputMode: els.outputModeSelect?.value,
                outputDir: resolveOutputDirFromForm(),
                audioSuffixes: els.audioSuffixesInput?.value.trim() || DEFAULT_AUDIO_SUFFIXES,
                ffmpegPath: els.ffmpegPathInput
                    ? (els.ffmpegPathInput.value.trim() || '')
                    : (savedOptionsSnapshot?.ffmpegPath || ''),
            }, settingsNormApi);
        stashTwaiLegacyFromOptions(built);
        return built;
    }

    function getFfmpegPathFromForm() {
        return els.ffmpegPathInput?.value.trim() || '';
    }

    function buildRuntimeOptions() {
        const saved = buildSavedOptionsFromForm();
        const activeMt = readActiveEngineMtModelFromForm();
        const mode = readTranslateModeFromForm();
        return {
            ...saved,
            ...getPostTaskOptionsFromUi(),
            // Job start needs a concrete MT id; resolve「自动匹配」here (do not persist).
            engineMtModel: activeMt,
            ...(mode === 'llm' || mode === 'sakura'
                ? { engineLlmMtModel: activeMt || saved.engineLlmMtModel }
                : {}),
        };
    }

    function formatTransWithAiStatusText(version) {
        const ver = String(version || '').trim();
        return ver ? `已识别到 TransWithAI (${ver})` : '已识别到 TransWithAI';
    }

    async function refreshInstallStatus(options = {}) {
        const { quick = false } = options;
        const installPath = els.installPathInput?.value.trim();
        if (!installPath) {
            if (els.transWithAiStatus) {
                els.transWithAiStatus.textContent = '请填写安装目录';
                els.transWithAiStatus.className = 'text-xs text-amber-600';
            }
            updateEnvBanner();
            return { ok: false };
        }
        if (els.transWithAiStatus) {
            els.transWithAiStatus.textContent = '检测中…';
            els.transWithAiStatus.className = 'text-xs text-gray-400';
        }
        const res = await electron?.transWithAiValidate?.({ installPath, quick });
        if (res?.ok) {
            if (els.transWithAiStatus) {
                els.transWithAiStatus.textContent = formatTransWithAiStatusText(res.version);
                els.transWithAiStatus.className = 'text-xs text-emerald-600';
            }
            await refreshModelSelects(buildSavedOptionsFromForm());
        } else if (els.transWithAiStatus) {
            els.transWithAiStatus.textContent = res?.error || '检测失败';
            els.transWithAiStatus.className = 'text-xs text-red-600';
        }
        updateEnvBanner();
        return res;
    }

    async function testInstall() {
        const res = await refreshInstallStatus({ quick: false });
        if (res?.ok) appendLog(formatTransWithAiStatusText(res.version), 'ok');
        else appendLog(res?.error || 'TransWithAI 未就绪', 'err');
    }

    async function flushPendingQueue() {
        if (state.running || state.postBatchBusy || !state.pendingQueue.length) return;
        const queued = state.pendingQueue.splice(0);
        updateQueueBadge();
        appendLog(`正在处理队列中的 ${queued.length} 个文件…`, 'info');
        await addFiles(queued);
        const selectable = getSelectedItems();
        if (selectable.length && !state.running) {
            const yes = await appConfirm({
                title: '继续处理队列',
                message: `队列中有 ${selectable.length} 个视频已就绪，是否立即开始生成字幕？`,
                primaryLabel: '立即开始',
                secondaryLabel: '稍后再说',
            });
            if (yes) startSubtitleGeneration();
            else appendLog('已加入列表，可在准备好后点击「开始生成」', 'info');
        }
    }

    async function browseFfmpegPath() {
        const res = await electron?.selectFfmpeg?.({ title: '选择 ffmpeg.exe' });
        if (res?.ok && !res.canceled && res.path && els.ffmpegPathInput) {
            els.ffmpegPathInput.value = res.path;
            await refreshFfmpegStatus();
        }
    }

    async function browseFfmpegFolder() {
        const res = await electron?.selectFolder?.({ title: '选择 FFmpeg 所在文件夹（含 ffmpeg.exe / ffprobe.exe）' });
        if (res?.ok && !res.canceled && res.path && els.ffmpegPathInput) {
            els.ffmpegPathInput.value = res.path;
            await refreshFfmpegStatus();
        }
    }

    async function refreshFfmpegStatus(options = {}) {
        if (!els.ffmpegStatus) return;
        const { quick = false, persist = !quick } = options;
        els.ffmpegStatus.textContent = '检测中…';
        els.ffmpegStatus.className = 'text-xs text-gray-400';
        const res = await electron?.ffmpegValidate?.({
            ffmpegPath: getFfmpegPathFromForm(),
            quick,
        });
        if (res?.ok) {
            const source = res.custom ? '自定义路径' : (res.bundled ? '内置' : '系统 PATH');
            let text = `FFmpeg 可用（${source}）${res.version ? ` · ${res.version}` : ''}`;
            let tone = 'text-xs text-emerald-600';
            if (res.insideInstall || res.warning) {
                text += `。${res.warning || '请勿放在软件安装目录内，更新时可能被覆盖'}`;
                tone = 'text-xs text-amber-600';
            }
            els.ffmpegStatus.textContent = text;
            els.ffmpegStatus.className = tone;
            const pathToSave = getFfmpegPathFromForm();
            if (persist && pathToSave) {
                try {
                    const saveRes = await electron?.transWithAiSaveOptions?.({ ffmpegPath: pathToSave });
                    if (!saveRes?.ok) {
                        els.ffmpegStatus.textContent = `${text}（路径未写入设置：${saveRes?.error || '保存失败'}）`;
                        els.ffmpegStatus.className = 'text-xs text-amber-600';
                    }
                } catch (err) {
                    els.ffmpegStatus.textContent = `${text}（路径未写入设置：${err?.message || '保存失败'}）`;
                    els.ffmpegStatus.className = 'text-xs text-amber-600';
                }
            }
        } else if (!getFfmpegPathFromForm()) {
            els.ffmpegStatus.textContent = res?.error || '系统 PATH 中未找到 ffprobe，请指定 FFmpeg 路径';
            els.ffmpegStatus.className = 'text-xs text-amber-600';
        } else {
            els.ffmpegStatus.textContent = res?.error || 'FFmpeg 不可用';
            els.ffmpegStatus.className = 'text-xs text-red-600';
        }
    }

    async function checkTransWithAiEngineUpdate() {
        const installPath = els.installPathInput?.value.trim();
        if (!installPath) {
            if (els.transWithAiStatus) {
                els.transWithAiStatus.textContent = '请先填写安装目录';
                els.transWithAiStatus.className = 'text-xs text-amber-600';
            }
            return;
        }
        if (els.installCheckUpdateBtn) els.installCheckUpdateBtn.disabled = true;
        if (els.transWithAiStatus) {
            els.transWithAiStatus.textContent = '正在检查 TransWithAI 新版本…';
            els.transWithAiStatus.className = 'text-xs text-gray-400';
        }
        try {
            const res = await electron?.transWithAiCheckEngineUpdate?.({ installPath });
            if (!res?.ok) {
                const err = res?.error || '检查更新失败';
                if (els.transWithAiStatus) {
                    els.transWithAiStatus.textContent = err;
                    els.transWithAiStatus.className = 'text-xs text-red-600';
                }
                appendLog(err, 'err');
                return;
            }
            const msg = res.message || (res.updateAvailable
                ? `发现新版本 v${res.latestVersion}`
                : `当前已是最新${res.currentVersion ? ` v${res.currentVersion}` : ''}`);
            if (els.transWithAiStatus) {
                els.transWithAiStatus.textContent = msg;
                els.transWithAiStatus.className = res.updateAvailable
                    ? 'text-xs text-amber-700'
                    : 'text-xs text-emerald-600';
            }
            appendLog(msg, res.updateAvailable ? 'info' : 'ok');
            if (res.updateAvailable) {
                const open = await appConfirm({
                    title: '发现更新',
                    message: `${msg}\n\n是否打开下载页面？`,
                    primaryLabel: '打开下载页',
                    secondaryLabel: '关闭',
                });
                if (open) {
                    const url = res.releaseUrl || res.releasesUrl;
                    if (!url) {
                        appendLog('未返回下载地址', 'err');
                    } else {
                        const openRes = await electron?.openExternal?.(url);
                        if (openRes?.ok === false) appendLog(openRes?.error || '无法打开下载页面', 'err');
                    }
                }
            } else if (!res.currentVersion && res.latestVersion) {
                const open = await appConfirm({
                    title: '查看版本',
                    message: `${msg}\n\n是否打开下载页面查看？`,
                    primaryLabel: '打开',
                    secondaryLabel: '关闭',
                });
                if (open) {
                    const url = res.releaseUrl || res.releasesUrl;
                    if (!url) appendLog('未返回下载地址', 'err');
                    else await electron?.openExternal?.(url);
                }
            }
        } catch (err) {
            const text = err?.message || '检查更新失败';
            if (els.transWithAiStatus) {
                els.transWithAiStatus.textContent = text;
                els.transWithAiStatus.className = 'text-xs text-red-600';
            }
            appendLog(text, 'err');
        } finally {
            if (els.installCheckUpdateBtn) els.installCheckUpdateBtn.disabled = false;
        }
    }

    async function browseInstallPath() {
        const res = await electron?.selectFolder?.({ title: '选择 TransWithAI 安装目录' });
        if (res?.ok && res.path && els.installPathInput) {
            els.installPathInput.value = res.path;
            await refreshInstallStatus();
        }
    }

    async function saveParamsSettings({ closeAfter = false } = {}) {
        if (!isDesktop()) {
            appendLog('需在桌面版中使用', 'err');
            return;
        }
        const enginePath = els.engineInstallPathInput?.value.trim() || '';
        if (readEngineBackendFromForm() !== 'twai' && !enginePath) {
            setSaveParamsStatus('请先在「运行环境」填写引擎安装目录', 'err');
            switchParamsTab('install');
            return;
        }
        const task = readTaskFromForm();
        const wantsSmart = (task === 'translate' || task === 'dual') && !!els.smartTranslateCheck?.checked;
        const wantsFilm = !!els.filmAudioEnhanceCheck?.checked || !!els.filmVadPresetCheck?.checked;
        if (wantsFilm && !advancedEntitled) {
            // Clear stuck checks so save can proceed for free users after license expiry.
            if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
            if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
        }
        if (wantsSmart && !canUseSmartTranslateUi()) {
            const llmId = String(els.engineLlmMtModelSelect?.value || '').trim();
            const fallback = (isSakuraMtModelId(llmId)
                || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(llmId))
                ? 'llm'
                : 'engine';
            applyTranslateModeToForm(fallback);
            setSaveParamsStatus('智能翻译需解锁 Pro，已改回可用译法', 'warn');
        }
        if (els.saveParamsBtn) els.saveParamsBtn.disabled = true;
        if (els.saveAndCloseParamsBtn) els.saveAndCloseParamsBtn.disabled = true;
        setSaveParamsStatus('保存中…');
        try {
            const res = await electron?.transWithAiSaveOptions?.({
                ...buildSavedOptionsFromForm(),
                saveParams: true,
            });
            if (res?.ok) {
                try { global.TransubEditorSettingsPrefs?.saveFromForm?.(); } catch (_) { /* ignore */ }
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                markSettingsDirty(false);
                appendLog('设置已保存', 'ok');
                setSaveParamsStatus('已保存', 'ok');
                updateParamsSummary();
                if (closeAfter) {
                    setTimeout(() => {
                        if (isStandaloneSettings) closeStandaloneSettingsWindow();
                        else closeParamsModal(false);
                    }, 250);
                }
            } else {
                appendLog(res?.error || '保存参数失败', 'err');
                setSaveParamsStatus('保存失败', 'err');
            }
        } catch (err) {
            appendLog(err?.message || '保存参数失败', 'err');
            setSaveParamsStatus('保存失败', 'err');
        } finally {
            if (els.saveParamsBtn) els.saveParamsBtn.disabled = false;
            if (els.saveAndCloseParamsBtn) els.saveAndCloseParamsBtn.disabled = false;
        }
    }

    function setBadge(text, tone) {
        const map = {
            idle: 'bg-gray-100 text-gray-600',
            running: 'bg-violet-100 text-violet-800',
            done: 'bg-emerald-100 text-emerald-800',
            error: 'bg-red-100 text-red-800',
        };
        els.jobStatusBadge.textContent = text;
        els.jobStatusBadge.className = `text-xs px-2 py-1 rounded-full ${map[tone] || map.idle}`;
    }

    const LOG_DOM_MAX = 500;

    function appendLog(line, tone) {
        if (!els.logHost) return;
        if (els.logHost.textContent === '日志将显示在此处…' || els.logHost.querySelector('.text-gray-400')) {
            els.logHost.innerHTML = '';
        }
        const row = document.createElement('div');
        const colors = {
            ok: 'text-emerald-700',
            warn: 'text-amber-700',
            err: 'text-red-700',
            info: 'text-gray-600',
        };
        row.className = `log-line ${colors[tone] || colors.info}`;
        const ts = new Date().toLocaleTimeString();
        row.textContent = `[${ts}] ${line}`;
        els.logHost.appendChild(row);
        while (els.logHost.childElementCount > LOG_DOM_MAX) {
            els.logHost.removeChild(els.logHost.firstChild);
        }
        const panel = els.logHost.closest('.log-panel') || els.logHost;
        panel.scrollTop = panel.scrollHeight;
        if (!isStandaloneSettings && (tone === 'err' || tone === 'warn')) {
            showToast(line, tone);
        }
    }

    /** Retranslate batch progress → 引擎日志 tab (same panel as engine/LLM lines). */
    function appendRetranslateLog(line, tone, opts = {}) {
        const ts = new Date().toLocaleTimeString();
        const text = `[${ts}] [重新翻译] ${line}`;
        const features = global.TransubFeatures;
        if (typeof features?.appendInferLog === 'function') {
            features.appendInferLog(text, tone);
        } else {
            appendLog(line, tone);
            return;
        }
        const wantToast = opts.toast !== false;
        if (wantToast && !isStandaloneSettings && (tone === 'err' || tone === 'warn')) {
            showToast(line, tone);
        }
    }

    function activateInferLogTab() {
        global.TransubFeatures?.activateLogTab?.('infer');
    }

    function findItem(path) {
        const key = normPath(path);
        return state.items.find((i) => normPath(i.path) === key);
    }

    function updateStartButton() {
        const busy = state.running || state.postBatchBusy || state.retranslateBusy;
        const blockReason = computeStartBlockReason();
        if (els.startBtn) els.startBtn.disabled = !!blockReason;
        if (els.retranslateBtn) els.retranslateBtn.disabled = !!busy;
        if (els.reconstructBtn) els.reconstructBtn.disabled = !!busy;
        if (els.addMenuBtn) els.addMenuBtn.disabled = false;
        // Mid-run: allow add/remove of non-running rows; retranslate keeps list locked.
        const listEditLocked = !!state.retranslateBusy;
        if (els.removeSelectedBtn) els.removeSelectedBtn.disabled = listEditLocked;
        if (els.clearListBtn) els.clearListBtn.disabled = listEditLocked;
        if (els.selectAllCheck) els.selectAllCheck.disabled = listEditLocked;
        updateStopButton();
        updateStartHint();
        syncSelectionToolbarActions();
    }

    function syncSelectionToolbarActions() {
        const selected = getSelectedItems();
        const compute = selectionToolbarApi.computeSelectionToolbarVisibility;
        const vis = typeof compute === 'function'
            ? compute({
                itemCount: state.items.length,
                selectedCount: selected.length,
                singleHasSubtitle: selected.length === 1
                    && !!String(getSubtitlePathForItem(selected[0]) || '').trim(),
            })
            : {
                showEditor: true,
                showRetranslate: selected.length >= 1,
                showReconstruct: selected.length === 1
                    && !!String(getSubtitlePathForItem(selected[0]) || '').trim(),
                showProActions: selected.length >= 1,
            };
        if (els.openSubtitleFileBtn) {
            els.openSubtitleFileBtn.hidden = false;
            els.openSubtitleFileBtn.removeAttribute('hidden');
            els.openSubtitleFileBtn.classList.add('command-bar-editor-btn--visible');
        }
        if (els.openLibraryToolbarBtn) {
            els.openLibraryToolbarBtn.hidden = false;
            els.openLibraryToolbarBtn.removeAttribute('hidden');
        }
        if (els.retranslateBtn) els.retranslateBtn.hidden = !vis.showRetranslate;
        if (els.reconstructBtn) els.reconstructBtn.hidden = !vis.showReconstruct;
        if (els.paramsProActions) {
            els.paramsProActions.hidden = !vis.showProActions;
        }
    }

    function updateStopButton() {
        if (els.stopBtn) {
            els.stopBtn.disabled = !(state.running || state.retranslateBusy || state.computeBusy);
        }
        updateComputeBusyStrip();
    }

    let computeBusyStripTimer = null;
    function updateComputeBusyStrip() {
        // Strip removed from main UI; cancel remains available via Stop when compute-busy.
        if (computeBusyStripTimer) {
            clearInterval(computeBusyStripTimer);
            computeBusyStripTimer = null;
        }
    }

    function updateAsrWindowTip() {
        if (!els.asrWindowTip) return;
        const asrId = String(els.engineAsrModelSelect?.value || '').trim();
        const tip = (global.TransubAsrSettings?.describeWindowedAsrTip
            || computeBusyUiApi.describeWindowedAsrTip
            || (() => ({ visible: false, text: '' })))(asrId);
        const visible = !!tip?.visible && !!tip?.text;
        els.asrWindowTip.classList.toggle('hidden', !visible);
        els.asrWindowTip.textContent = visible ? tip.text : '';
    }

    async function cancelComputeBusyTask() {
        if (!state.computeBusy && !state.running && !state.retranslateBusy) return;
        const ok = await appConfirm({
            title: '取消算力任务',
            message: state.computeBusyLabel
                ? `确定取消正在运行的「${state.computeBusyLabel}」？`
                : '确定取消当前算力任务？',
            primaryLabel: '取消任务',
            secondaryLabel: '继续运行',
            danger: true,
        });
        if (!ok) return;
        appendLog('正在取消算力任务…', 'warn');
        setBadge('正在取消…', 'error');
        try {
            if (electron?.transubComputeTaskCancel) {
                await electron.transubComputeTaskCancel();
            } else {
                await electron?.transubEngineCancel?.();
                await electron?.transWithAiCancel?.();
                await electron?.transubSakuraCancelTranslate?.();
                await electron?.transubAdvancedCancelContextReconstruct?.();
            }
        } catch (err) {
            appendLog(err?.message || '取消失败', 'err');
        }
        await syncComputeBusyFromMain();
        updateStopButton();
    }

    async function stopTask() {
        if (!state.running && !state.retranslateBusy) {
            if (state.computeBusy) {
                await cancelComputeBusyTask();
            }
            return;
        }
        const ok = await appConfirm({
            title: state.retranslateBusy ? '停止重新翻译' : '停止任务',
            message: state.retranslateBusy
                ? '确定停止当前重新翻译？'
                : '确定停止当前字幕任务？',
            primaryLabel: '停止',
            secondaryLabel: '继续运行',
            danger: true,
        });
        if (!ok) return;
        if (state.retranslateBusy) {
            state.retranslateAbort = true;
            ensureLogExpanded();
            activateInferLogTab();
            appendRetranslateLog('正在停止重新翻译…', 'warn');
            setBadge('正在停止…', 'error');
            try { await electron?.transubSakuraCancelTranslate?.(); } catch { /* ignore */ }
            try { await electron?.transubAdvancedCancelContextReconstruct?.(); } catch { /* ignore */ }
            try { await electron?.transubEngineCancel?.(); } catch { /* ignore */ }
            return;
        }
        // Prefer the backend that started the job — form may have changed mid-run.
        const backend = state.jobBackend || readEngineBackendFromForm();
        appendLog('正在停止任务…', 'warn');
        setBadge('正在停止…', 'error');
        let res = backend === 'twai'
            ? await electron?.transWithAiCancel?.()
            : await electron?.transubEngineCancel?.();
        if (!(res?.cancelled || res?.ok)) {
            res = backend === 'twai'
                ? await electron?.transubEngineCancel?.()
                : await electron?.transWithAiCancel?.();
        }
        if (!(res?.cancelled || res?.ok)) {
            appendLog(res?.error || '停止失败', 'err');
        }
    }

    function setDropActive(active) {
        if (!els.filePanel || !els.dropOverlay) return;
        els.filePanel.classList.toggle('ring-2', active);
        els.filePanel.classList.toggle('ring-violet-400', active);
        els.dropOverlay.classList.toggle('hidden', !active);
        els.dropOverlay.classList.toggle('flex', active);
    }

    async function handleDroppedFiles(dataTransfer) {
        const paths = pathsFromDataTransfer(dataTransfer);
        if (!paths.length) {
            const total = dataTransfer?.files?.length || dataTransfer?.items?.length || 0;
            if (total > 0) {
                appendLog('未识别到支持的媒体文件（已忽略不支持的格式或无法读取路径）', 'warn');
            }
            return;
        }
        const before = state.items.length;
        await addFiles(paths);
        const added = state.items.length - before;
        const skipped = paths.length - added;
        if (added > 0) {
            appendLog(`拖入添加 ${added} 个媒体文件${skipped > 0 ? `，${skipped} 个已在列表中` : ''}`, 'info');
        }
    }

    async function probeItem(item, options = {}) {
        const { skipFullRender = false } = options;
        item.status = 'probing';
        if (skipFullRender) refreshListRow(item);
        else renderList();
        const res = await electron?.ffmpegProbe?.({
            path: item.path,
            ffmpegPath: getFfmpegPathFromForm(),
        });
        if (res?.ok) {
            item.duration = res.duration;
            item.status = 'ready';
            item.metaLanguage = res.language || '';
            item.audioLanguages = Array.isArray(res.audioLanguages) ? res.audioLanguages : [];
            const subRes = await electron?.transWithAiCheckSubtitles?.({
                paths: [item.path],
                outputDir: resolveOutputDirFromForm(),
            });
            if (subRes?.ok && subRes.subtitles?.[item.path]) {
                item.existingSubtitle = subRes.subtitles[item.path];
                item.subtitlePath = item.existingSubtitle;
                if (!els.overwriteCheck?.checked) item.detail = '已有字幕';
            }
        } else {
            item.status = 'error';
            item.error = res?.error || '探测失败';
        }
        if (skipFullRender) refreshListRow(item);
        else renderList();
        // Instant 番号 already done on drop — do not re-queue; others get quick sense after probe
        if (item.status === 'ready' && isAutoSenseEnabled()) {
            const st = item.sense?.status;
            if (st !== 'done' && st !== 'sensing') {
                enqueueSense(item, senseOptsForNewMedia());
            }
        }
    }

    async function mapPool(items, concurrency, worker) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return;
        let next = 0;
        const limit = Math.max(1, Math.min(concurrency || 1, list.length));
        async function run() {
            while (next < list.length) {
                const index = next;
                next += 1;
                await worker(list[index], index);
            }
        }
        await Promise.all(Array.from({ length: limit }, () => run()));
    }

    async function addFiles(paths, options = {}) {
        const { withLoading = true } = options;
        const list = Array.isArray(paths) ? paths : [];
        const toProbe = list
            .map((p) => String(p || '').trim())
            .filter((path) => path && !findItem(path));
        if (!toProbe.length) return;

        const showLoading = withLoading && !state.running;
        if (showLoading) {
            setLoading(true, toProbe.length > 1
                ? `正在探测视频信息 (0/${toProbe.length})…`
                : '正在探测视频信息…');
        }
        try {
            const newItems = toProbe.map((path) => ({
                path,
                selected: true,
                status: 'pending',
                duration: 0,
                progress: 0,
                detail: '',
                sense: {
                    status: isAutoSenseEnabled() ? 'idle' : 'off',
                    adopted: false,
                    classification: null,
                    overrides: {},
                    message: '',
                },
            }));
            state.items.push(...newItems);
            // Known 番号: finish sense immediately on drop (before ffmpeg probe)
            if (isAutoSenseEnabled()) {
                for (const item of newItems) {
                    tryInstantAvSense(item);
                }
            }
            renderList();
            updateAutoSenseUi();

            let probed = 0;
            await mapPool(newItems, PROBE_CONCURRENCY, async (item) => {
                await probeItem(item, { skipFullRender: true });
                probed += 1;
                if (toProbe.length > 1 && (showLoading || state.loadingDepth > 0)) {
                    updateLoadingMessage(`正在探测视频信息 (${probed}/${toProbe.length})…`);
                }
            });

            if (state.running) {
                await appendItemsToLiveBatch(newItems);
            }
        } finally {
            if (showLoading) setLoading(false);
        }
        updateStartButton();
    }

    async function appendItemsToLiveBatch(items) {
        const build = liveBatchQueueApi.buildAppendPayloadItems;
        const payloadItems = typeof build === 'function'
            ? build(items, senseOverridesForJob)
            : (Array.isArray(items) ? items : []).map((item) => ({
                fullPath: item.path,
                durationSec: Math.max(0, Number(item.duration) || 0),
                optionOverrides: senseOverridesForJob(item),
            }));
        if (!payloadItems.length) return;
        try {
            const res = await electron?.transubLiveBatchAppend?.({ items: payloadItems });
            if (res?.ok) {
                const n = Array.isArray(res.appended) ? res.appended.length : payloadItems.length;
                if (n > 0) {
                    if (Number(res.total) > 0) state.total = Number(res.total);
                    updateProgressUi();
                    appendLog(`已加入当前批次 ${n} 个文件`, 'info');
                }
                return;
            }
            if (res?.code === 'no_batch') {
                appendLog(`已加入列表 ${payloadItems.length} 个文件（当前批次已结束，可再次开始）`, 'info');
                return;
            }
            appendLog(
                `已加入列表，但未能并入当前批次：${res?.error || '未知错误'}`,
                'warn',
            );
        } catch (err) {
            appendLog(`已加入列表，并入当前批次失败：${err?.message || err}`, 'warn');
        }
    }

    function getSubtitlePathForItem(item) {
        // 双语任务后处理/编辑应优先译文轨，避免叠词等中文后处理打到原文轨
        return item.targetSubtitlePath
            || item.subtitlePath
            || item.existingSubtitle
            || '';
    }

    /** Paths that need post-batch Chinese / CPS / noise fix (target + merged dual ASS). */
    function getPostBatchPathsForItem(item) {
        const paths = [];
        const seen = new Set();
        const push = (p) => {
            const v = String(p || '').trim();
            // Post-batch Chinese/CPS cleanup targets plain text tracks (ASS styles skip).
            if (!v || seen.has(v) || !/\.(srt|vtt|lrc)$/i.test(v)) return;
            seen.add(v);
            paths.push(v);
        };
        push(getSubtitlePathForItem(item));
        push(item.bilingualSubtitlePath);
        return paths;
    }

    /** 译文轨 QC 智能修复时的对照原文路径（与 subtitle-qc-smart-core.resolveQcSemanticPairPath 一致）。 */
    function resolveQcSemanticPairPathForItem(item, fixingPath) {
        const fixing = String(fixingPath || '').trim();
        const src = String(item?.sourceSubtitlePath || '').trim();
        if (!fixing || !src) return '';
        const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
        if (norm(fixing) === norm(src)) return '';
        const tgt = String(item?.targetSubtitlePath || getSubtitlePathForItem(item) || '').trim();
        if (tgt && norm(fixing) !== norm(tgt)) return '';
        return src;
    }

    function showPathForItem(item) {
        return getSubtitlePathForItem(item) || item.path || '';
    }

    function statusMeta(status) {
        if (taskListRowApi.statusMeta) return taskListRowApi.statusMeta(status);
        return { label: status || '—', cls: 'row-status-pending' };
    }

    function countQcIssues() {
        if (postTaskQcApi.countQcIssues) return postTaskQcApi.countQcIssues(state.items);
        return state.items.filter((i) => Number(i.qcIssueCount) > 0).length;
    }

    function markItemQcFixed(item, mode, { written = false, summary = '' } = {}) {
        if (postTaskQcApi.markItemQcFixed) {
            return postTaskQcApi.markItemQcFixed(item, mode, { written, summary });
        }
        if (!item) return;
        item.qcFixedMode = mode === 'smart' ? 'smart' : 'fix';
        item.qcFixedWritten = !!written;
        item.qcFixedSummary = String(summary || '').trim().slice(0, 200);
        item.qcFixedAt = Date.now();
    }

    function clearItemQcFixed(item, { clearScan = false } = {}) {
        if (postTaskQcApi.clearItemQcFixed) {
            return postTaskQcApi.clearItemQcFixed(item, { clearScan });
        }
        if (!item) return;
        item.qcFixedMode = '';
        item.qcFixedWritten = false;
        item.qcFixedSummary = '';
        item.qcFixedAt = 0;
        if (clearScan) {
            item.qcIssueCount = undefined;
            item.qcSummary = '';
            item.qcError = '';
        }
    }

    function qcFixedTagHtml(item) {
        if (taskListRowApi.qcFixedTagHtml) return taskListRowApi.qcFixedTagHtml(item, esc);
        return '';
    }

    function updateQcBanner() {
        if (!els.qcBanner) return;
        const vm = postTaskQcApi.buildQcBannerViewModel
            ? postTaskQcApi.buildQcBannerViewModel({
                issueCount: countQcIssues(),
                dismissed: !!state.qcBannerDismissed,
                fixing: !!state.qcFixing,
                smartFixing: !!state.qcSmartFixing,
                running: !!state.running,
                advancedEntitled: !!advancedEntitled,
                smartFixAvailable: !!electron?.transubAdvancedQcSmartFix,
            })
            : null;
        if (!vm) {
            els.qcBanner.classList.add('hidden');
            return;
        }
        if (!vm.visible) {
            els.qcBanner.classList.add('hidden');
            return;
        }
        if (els.qcBannerText) els.qcBannerText.textContent = vm.text;
        if (els.qcBannerFixBtn) {
            els.qcBannerFixBtn.disabled = vm.fixDisabled;
            els.qcBannerFixBtn.textContent = vm.fixLabel;
        }
        if (els.qcBannerSmartFixBtn) {
            els.qcBannerSmartFixBtn.classList.toggle('hidden', !vm.smartVisible);
            els.qcBannerSmartFixBtn.disabled = vm.smartDisabled;
            els.qcBannerSmartFixBtn.textContent = vm.smartLabel;
        }
        els.qcBanner.classList.remove('hidden');
    }

    function readEngineBackendFromForm() {
        const selectEl = els.engineBackendSelect;
        const rawSelect = selectEl ? String(selectEl.value || '').trim().toLowerCase() : '';
        if (rawSelect === 'twai' || rawSelect === 'transwithai') return 'twai';
        if (rawSelect === 'transub') return 'transub';
        // Select missing / empty: keep disk snapshot so expert TWAI recovery survives saves.
        const fromSaved = String(savedOptionsSnapshot?.engineBackend || '').trim().toLowerCase();
        if (fromSaved === 'twai' || fromSaved === 'transwithai') return 'twai';
        return 'transub';
    }

    function syncEngineBackendUi() {
        const backend = readEngineBackendFromForm();
        const isTwai = backend === 'twai';
        els.engineSettingsBlock?.classList.toggle('opacity-50', isTwai);
        els.twaiSettingsBlock?.classList.toggle('opacity-50', !isTwai);
        // Format / glossary availability differs by backend
        els.subFormatLrcWrap?.classList.toggle('hidden', !isTwai);
        els.subFormatAssWrap?.classList.toggle('hidden', isTwai);
        els.engineOutputExtrasWrap?.classList.toggle('hidden', isTwai);
        els.glossaryMtWrap?.classList.toggle('hidden', isTwai);
        if (!isTwai && els.subFormatLrc) els.subFormatLrc.checked = false;
        if (isTwai && els.subFormatAss) els.subFormatAss.checked = false;
        if (els.envBannerText) {
            els.envBannerText.textContent = isTwai
                ? '配置仍指向已冻结的 TransWithAI；请改用 Transub Engine（设置 → 运行环境）。'
                : '尚未配置 Transub Engine：请在「设置 → 运行环境」检测内置引擎并下载模型。';
        }
    }

    let asrRecommendDismissedKey = '';

    function updateAsrRecommendChip(rec = null) {
        const api = global.TransubAsrSettings;
        const chip = els.asrRecommendChip;
        if (!chip || !api?.describeAsrRecommendChip) return;
        const currentAsr = els.engineAsrModelSelect?.value || '';
        const recommendedAsr = String(
            rec?.models?.asrModel
            || rec?.asrModel
            || cachedHardwareRecommend?.asrModel
            || '',
        ).trim();
        const profile = String(
            rec?.profile || cachedHardwareRecommend?.profile || '',
        ).trim();
        const key = `${recommendedAsr}|${profile}`;
        if (asrRecommendDismissedKey && asrRecommendDismissedKey === key) {
            chip.classList.add('hidden');
            chip.hidden = true;
            syncQuickAsrRecommendChip();
            return;
        }
        const ui = api.describeAsrRecommendChip({
            currentAsr,
            recommendedAsr,
            profile,
        });
        if (!ui.visible) {
            chip.classList.add('hidden');
            chip.hidden = true;
            syncQuickAsrRecommendChip();
            return;
        }
        if (els.asrRecommendChipLabel) els.asrRecommendChipLabel.textContent = ui.label;
        if (els.asrRecommendChipDetail) els.asrRecommendChipDetail.textContent = ui.detail;
        chip.dataset.recommendedAsr = ui.recommendedAsr || '';
        chip.classList.remove('hidden');
        chip.hidden = false;
        syncQuickAsrRecommendChip();
        updateReadinessStrip();
    }

    function applyAsrRecommendFromChip() {
        const id = String(els.asrRecommendChip?.dataset?.recommendedAsr || '').trim();
        if (!id || !els.engineAsrModelSelect) return;
        ensureSelectValue(els.engineAsrModelSelect, id, { label: id });
        els.engineAsrModelSelect.dispatchEvent(new Event('change'));
        if (els.quickAsrModelSelect) {
            els.quickAsrModelSelect.value = id;
        }
        asrRecommendDismissedKey = '';
        appendLog(`已应用硬件推荐 ASR：${id}`, 'ok');
        showToast(`ASR 已切换为 ${id}`, 'ok');
        markSettingsDirty(true);
        updateAsrRecommendChip({
            models: { asrModel: id },
            profile: cachedHardwareRecommend?.profile,
        });
        updateReadinessStrip();
    }

    function syncProxySettingsUi() {
        const on = !!els.proxyEnabledCheck?.checked;
        if (els.proxySettingsFields) {
            els.proxySettingsFields.classList.toggle('opacity-50', !on);
        }
        if (els.proxyUrlInput) els.proxyUrlInput.disabled = !on;
        if (els.proxyBypassInput) els.proxyBypassInput.disabled = !on;
        if (els.proxyTestBtn) els.proxyTestBtn.disabled = false;
    }

    function setProxyTestStatus(text, kind = '') {
        if (!els.proxyTestStatus) return;
        els.proxyTestStatus.textContent = text || '';
        els.proxyTestStatus.className = kind === 'ok'
            ? 'text-xs text-emerald-600 min-h-[1rem]'
            : kind === 'err'
                ? 'text-xs text-red-600 min-h-[1rem]'
                : kind === 'busy'
                    ? 'text-xs text-sky-600 min-h-[1rem]'
                    : 'text-xs text-gray-500 min-h-[1rem]';
    }

    function setNetworkHfStatus(text, kind = '') {
        if (!els.networkHfStatus) return;
        els.networkHfStatus.textContent = text || '';
        els.networkHfStatus.className = kind === 'ok'
            ? 'text-xs text-emerald-600 min-h-[1rem]'
            : kind === 'err'
                ? 'text-xs text-red-600 min-h-[1rem]'
                : kind === 'busy'
                    ? 'text-xs text-sky-600 min-h-[1rem]'
                    : 'text-xs text-gray-500 min-h-[1rem]';
    }

    function readProxyOptionsFromForm() {
        return {
            proxyEnabled: !!els.proxyEnabledCheck?.checked,
            proxyUrl: els.proxyUrlInput?.value?.trim() || '',
            proxyBypass: els.proxyBypassInput?.value?.trim()
                || 'localhost,127.0.0.1,::1,<local>',
        };
    }

    function sameFsPath(a, b) {
        const norm = (p) => String(p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const left = norm(a);
        const right = norm(b);
        return !!left && left === right;
    }

    async function ensureBundledEnginePathCached() {
        if (cachedBundledEnginePath) return cachedBundledEnginePath;
        try {
            const res = await electron?.transubEngineBundledPath?.();
            if (res?.ok && res.path) {
                // Cache the expected bundled path even if validation markers are missing,
                // so 「内置」 can still fill the field; presence is checked separately.
                cachedBundledEnginePath = String(res.path);
                if (els.engineInstallPathInput) {
                    els.engineInstallPathInput.placeholder = cachedBundledEnginePath;
                }
            }
        } catch { /* ignore */ }
        return cachedBundledEnginePath;
    }

    /** Fill empty engine path with vendored dist; keep placeholder for upgrades. */
    async function ensureEngineInstallPathFilled() {
        if (!els.engineInstallPathInput) return '';
        const bundled = await ensureBundledEnginePathCached();
        if (!els.engineInstallPathInput.value.trim() && bundled) {
            els.engineInstallPathInput.value = bundled;
        }
        updateEnvBanner();
        updateReadinessStrip();
        return els.engineInstallPathInput.value.trim();
    }

    /** Persist empty when using bundled path so upgrades re-resolve next to the exe. */
    function engineInstallPathForSave() {
        const v = els.engineInstallPathInput?.value.trim() || '';
        if (!v) return '';
        if (cachedBundledEnginePath && sameFsPath(v, cachedBundledEnginePath)) return '';
        return v;
    }

    function updateEnvBanner() {
        if (!els.envBanner) return;
        const backend = readEngineBackendFromForm();
        if (backend === 'twai') {
            const path = String(els.installPathInput?.value || '').trim();
            els.envBanner.classList.toggle('hidden', !!path);
            updateEmptyStateUi();
            return;
        }
        const enginePath = String(els.engineInstallPathInput?.value || '').trim();
        const statusOk = els.engineStatus?.className?.includes('emerald');
        // Only hide when a real path is set (or engine already verified OK).
        // Bundled installs persist engineInstallPath as "" and refill on load via
        // ensureEngineInstallPathFilled — keep empty-state hint in sync here.
        const show = !enginePath && !statusOk;
        els.envBanner.classList.toggle('hidden', !show);
        updateEmptyStateUi();
    }

    function engineFormPayload() {
        return {
            engineInstallPath: els.engineInstallPathInput?.value.trim() || cachedBundledEnginePath || '',
            engineUrl: els.engineUrlInput?.value.trim() || '',
            engineHfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            engineHfToken: els.engineHfTokenInput?.value.trim() || '',
            engineAutoStart: !!els.engineAutoStartCheck?.checked,
        };
    }

    function formatEngineDownloadError(raw) {
        if (engineModelsUi.formatEngineDownloadError) {
            return engineModelsUi.formatEngineDownloadError(raw, {
                hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            });
        }
        const msg = String(raw || '').trim();
        return msg || '模型下载失败';
    }

    function setEngineStatusText(text, kind = '') {
        if (!els.engineStatus) return;
        els.engineStatus.textContent = text || '';
        if (kind === 'ok') els.engineStatus.className = 'text-xs text-emerald-600';
        else if (kind === 'err') els.engineStatus.className = 'text-xs text-red-600';
        else if (kind === 'warn') els.engineStatus.className = 'text-xs text-amber-600';
        else if (kind === 'busy') els.engineStatus.className = 'text-xs text-emerald-700';
        else els.engineStatus.className = 'text-xs text-gray-500';
    }

    const engineDownloadLogLines = [];

    function setEngineDownloadBusy(busy) {
        engineModelsBusy = !!busy;
        if (els.engineManualGpuBtn) els.engineManualGpuBtn.disabled = !!busy;
        if (els.engineCancelDownloadBtn) els.engineCancelDownloadBtn.disabled = !busy;
        if (els.engineRefreshModelsBtn) els.engineRefreshModelsBtn.disabled = !!busy;
        if (els.engineRefreshModelsSummaryBtn) els.engineRefreshModelsSummaryBtn.disabled = !!busy;
        if (els.engineModelsSearch) els.engineModelsSearch.disabled = !!busy;
        els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
            btn.disabled = !!busy;
        });
        if (!busy) {
            engineDownloadActiveSource = null;
            renderEngineModelsCards();
            syncEngineModelsLibraryDlStrip();
        } else {
            els.engineModelsList?.querySelectorAll('[data-model-action]').forEach((btn) => {
                btn.disabled = true;
            });
        }
    }

    function appendEngineDownloadLog(line) {
        const text = String(line || '').trim();
        if (!text) return;
        if (engineModelsUi.pushDownloadLogLine) {
            engineModelsUi.pushDownloadLogLine(engineDownloadLogLines, text, 80);
        } else {
            engineDownloadLogLines.push(text);
            while (engineDownloadLogLines.length > 80) engineDownloadLogLines.shift();
        }
        if (els.engineDownloadLog) {
            els.engineDownloadLog.textContent = engineDownloadLogLines.join('\n');
            els.engineDownloadLog.scrollTop = els.engineDownloadLog.scrollHeight;
        }
    }

    function setEngineDownloadProgressPct(pct) {
        const clamped = engineModelsUi.clampDownloadProgressPct
            ? engineModelsUi.clampDownloadProgressPct(pct)
            : (() => {
                const n = Number(pct);
                const finite = Number.isFinite(n);
                const width = finite ? Math.max(0, Math.min(100, n)) : 0;
                return { width, finite, label: finite ? `${Math.round(width)}%` : '…' };
            })();
        if (els.engineDownloadProgressBar) {
            els.engineDownloadProgressBar.style.width = `${clamped.width}%`;
            els.engineDownloadProgressBar.classList.toggle('animate-pulse', !clamped.finite);
        }
        if (els.engineDownloadProgressPct) {
            els.engineDownloadProgressPct.textContent = clamped.label;
        }
        if (engineModelsBusy) syncEngineModelsLibraryDlStrip();
    }

    function formatEngineDownloadBytes(n) {
        return engineDlFmt.formatEngineDownloadBytes
            ? engineDlFmt.formatEngineDownloadBytes(n)
            : '';
    }

    function formatEngineDownloadSpeed(bps) {
        return engineDlFmt.formatEngineDownloadSpeed
            ? engineDlFmt.formatEngineDownloadSpeed(bps)
            : '';
    }

    function formatEngineDownloadSizeLine(info = {}) {
        return engineDlFmt.formatEngineDownloadSizeLine
            ? engineDlFmt.formatEngineDownloadSizeLine(info)
            : '';
    }

    /** 主窗口应用日志：下载进度就地刷新，避免字节级刷屏 */
    let lastAppEngineDlProgressText = '';
    let lastAppEngineDlProgressAt = 0;

    function appendAppEngineDownloadProgressLog(text, { force = false } = {}) {
        if (isStandaloneSettings || !els.logHost) return;
        const line = String(text || '').trim();
        if (!line) return;
        ensureLogExpanded();
        const now = Date.now();
        const last = els.logHost.lastElementChild;
        const canReuse = last?.dataset?.engineDlProgress === '1';
        const action = engineModelsUi.decideEngineDlProgressLogAction
            ? engineModelsUi.decideEngineDlProgressLogAction({
                force,
                line,
                lastText: lastAppEngineDlProgressText,
                canReuse,
                now,
                lastAt: lastAppEngineDlProgressAt,
            })
            : (() => {
                if (!force && line === lastAppEngineDlProgressText && canReuse) return 'skip';
                if (!force && !canReuse && now - lastAppEngineDlProgressAt < 1200) return 'skip';
                if (!force && canReuse && now - lastAppEngineDlProgressAt < 400) return 'reuse';
                if (canReuse && !force) return 'reuse';
                return 'append';
            })();
        if (action === 'skip') return;
        if (action === 'reuse' && last) {
            const ts = new Date().toLocaleTimeString();
            last.textContent = `[${ts}] ${line}`;
            lastAppEngineDlProgressText = line;
            if (!(canReuse && !force && now - lastAppEngineDlProgressAt < 400)) {
                lastAppEngineDlProgressAt = now;
                const panel = els.logHost.closest('.log-panel') || els.logHost;
                panel.scrollTop = panel.scrollHeight;
            }
            return;
        }
        lastAppEngineDlProgressText = line;
        lastAppEngineDlProgressAt = now;
        if (els.logHost.textContent === '日志将显示在此处…' || els.logHost.querySelector('.text-gray-400')) {
            els.logHost.innerHTML = '';
        }
        const row = document.createElement('div');
        row.className = 'log-line text-gray-600';
        row.dataset.engineDlProgress = '1';
        const ts = new Date().toLocaleTimeString();
        row.textContent = `[${ts}] ${line}`;
        els.logHost.appendChild(row);
        while (els.logHost.childElementCount > LOG_DOM_MAX) {
            els.logHost.removeChild(els.logHost.firstChild);
        }
        const panel = els.logHost.closest('.log-panel') || els.logHost;
        panel.scrollTop = panel.scrollHeight;
    }

    function setEngineDownloadProgressVisible(visible, detail = '') {
        els.engineDownloadProgress?.classList.toggle('hidden', !visible);
        if (els.engineDownloadProgressText) {
            els.engineDownloadProgressText.textContent = detail
                || (visible ? '正在下载模型，可能需要数分钟…' : '');
        }
        if (visible && engineDownloadLogLines.length === 0 && detail) {
            appendEngineDownloadLog(detail);
        }
        syncEngineModelsLibraryDlStrip(detail);
    }

    function isEngineModelsLibraryOpen() {
        return !!els.engineModelsLibraryModal && !els.engineModelsLibraryModal.classList.contains('hidden');
    }

    function syncEngineModelsLibraryDlStrip(detail = '') {
        const strip = els.engineModelsLibraryDlStrip;
        const textEl = els.engineModelsLibraryDlStripText;
        if (!strip) return;
        const show = !!engineModelsBusy && !isEngineModelsLibraryOpen();
        strip.classList.toggle('hidden', !show);
        if (!show || !textEl) return;
        const pct = String(els.engineDownloadProgressPct?.textContent || '').trim();
        const msg = String(detail || els.engineDownloadProgressText?.textContent || '').trim()
            || '正在下载模型…';
        textEl.textContent = pct && pct !== '0%' ? `${msg}（${pct}）· 可再次打开模型库查看详情` : `${msg} · 可再次打开模型库查看详情`;
    }

    function syncEngineModelsLibraryTabSummary() {
        if (!els.engineModelsLibraryTabSummary) return;
        const total = cachedEnginePickCatalog.length;
        if (!total) {
            els.engineModelsLibraryTabSummary.textContent = engineModelsBusy
                ? '正在下载模型…可打开模型库查看进度'
                : '打开模型库可查看本机已装与可下载项';
            return;
        }
        const installed = cachedEnginePickCatalog.filter((m) => m?.installed && !m?.incomplete).length;
        const base = installed
            ? `已安装 ${installed} / 共 ${total} 个模型`
            : `共 ${total} 个模型（尚未标记已安装）`;
        els.engineModelsLibraryTabSummary.textContent = engineModelsBusy
            ? `${base} · 下载进行中`
            : `${base} · 点「打开模型库」浏览下载`;
    }

    async function openEngineModelsLibrary(opts = {}) {
        const modal = els.engineModelsLibraryModal;
        if (!modal) return;
        // Ensure settings shell is visible when opening from main recovery paths.
        if (els.paramsModal?.classList.contains('hidden')) {
            await openParamsModal('models');
        } else {
            switchParamsTab('models');
        }
        modal.classList.remove('hidden');
        syncEngineModelsLibraryDlStrip();
        const refresh = opts.refresh !== false;
        if (refresh && readEngineBackendFromForm() !== 'twai') {
            lastEngineModelsRefreshAt = Date.now();
            await refreshEngineModels({ silent: true });
        } else {
            syncEngineModelsLibraryTabSummary();
            syncEngineModelPickSummary();
        }
        try { els.engineModelsSearch?.focus?.(); } catch (_) { /* ignore */ }
    }

    function closeEngineModelsLibrary() {
        els.engineModelsLibraryModal?.classList.add('hidden');
        syncEngineModelsLibraryDlStrip();
        syncEngineModelsLibraryTabSummary();
    }

    function filteredEnginePickItems() {
        if (engineModelsUi.filterAndSortEnginePickItems) {
            return engineModelsUi.filterAndSortEnginePickItems(cachedEnginePickCatalog, {
                filter: engineModelsFilter,
                query: engineModelsSearchQuery,
            });
        }
        return cachedEnginePickCatalog.slice();
    }

    function syncEngineModelPickSummary() {
        const total = cachedEnginePickCatalog.length;
        const visible = filteredEnginePickItems().length;
        if (els.engineModelsSummary) {
            els.engineModelsSummary.textContent = engineModelsUi.formatModelsSummary
                ? engineModelsUi.formatModelsSummary({ total, visible })
                : (!total ? '检测引擎后显示' : (visible === total ? `共 ${total} 个模型` : `显示 ${visible} / ${total}`));
        }
        syncEngineModelsLibraryTabSummary();
        if (els.engineModelsSelectedHint) {
            const llmCount = cachedEnginePickCatalog.filter((m) => m.group === 'llm').length;
            const llmHint = llmCount
                ? (advancedEntitled
                    ? `LLM 推理翻译 ${llmCount} 个（含 Pro）`
                    : `LLM 推理翻译 ${llmCount} 个（轻量档；解锁 Pro 可浏览全部）`)
                : '';
            els.engineModelsSelectedHint.textContent = llmHint
                ? `点卡片「下载」获取模型 · ${llmHint} · 选用已在「模型」页上方设置`
                : '点卡片「下载」获取模型 · 选用已在「模型」页上方设置';
            els.engineModelsSelectedHint.classList.remove('is-ok');
        }
    }

    function setEngineModelsFilter(next) {
        engineModelsFilter = engineModelsUi.normalizeModelsFilter
            ? engineModelsUi.normalizeModelsFilter(next)
            : (['all', 'asr', 'vad', 'mt', 'llm', 'separate'].includes(next) ? next : 'all');
        els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
            const active = btn.getAttribute('data-models-filter') === engineModelsFilter;
            btn.classList.toggle('is-on', active);
        });
        renderEngineModelsCards();
    }

    function engineModelKindLabel(kind) {
        return engineModelsUi.engineModelKindLabel
            ? engineModelsUi.engineModelKindLabel(kind)
            : String(kind || '').toUpperCase() || '模型';
    }

    function formatEngineModelOptionLabel(model) {
        return engineModelsUi.formatEngineModelOptionLabel
            ? engineModelsUi.formatEngineModelOptionLabel(model)
            : (String(model?.name || model?.id || '').trim() || 'unknown');
    }

    /** Ensure <select> can hold a saved id even before the catalog is loaded. */
    function ensureSelectValue(selectEl, value, { label = '', allowEmpty = false } = {}) {
        if (!selectEl) return;
        const want = String(value || '');
        if (!want) {
            if (allowEmpty) selectEl.value = '';
            return;
        }
        if (![...selectEl.options].some((o) => o.value === want)) {
            const opt = document.createElement('option');
            opt.value = want;
            opt.textContent = label || want;
            selectEl.appendChild(opt);
        }
        selectEl.value = want;
    }

    function fillEngineModelSelect(selectEl, models, kind, selectedId, {
        allowEmpty = false,
        emptyLabel = '自动（按源语言）',
        modelFilter = null,
    } = {}) {
        if (!selectEl) return;
        if (engineModelsUi.buildInstalledModelSelectOptionsHtml) {
            const built = engineModelsUi.buildInstalledModelSelectOptionsHtml({
                models,
                kind,
                selectedId,
                allowEmpty,
                emptyLabel,
                esc,
                formatLabel: formatEngineModelOptionLabel,
                modelFilter,
            });
            selectEl.innerHTML = built.html;
            const want = built.want;
            if (want && [...selectEl.options].some((o) => o.value === want)) {
                selectEl.value = want;
            } else if (allowEmpty) {
                selectEl.value = '';
            } else if (selectEl.options.length) {
                selectEl.selectedIndex = 0;
            }
            return;
        }
        selectEl.innerHTML = '';
    }

    function pickCatalogDeps() {
        const catalogApi = getManagedLlmCatalogApi();
        return {
            demucsModelId: ENGINE_DEMUCS_MODEL_ID,
            isSakuraMtModelId,
            findManagedLlmCatalogEntry,
            isProScaleModel: (entry) => !!catalogApi?.isProScaleModel?.(entry),
            entitled: advancedEntitled,
            listCatalogVisible: catalogApi?.listCatalogVisible
                ? (opts) => catalogApi.listCatalogVisible(opts)
                : undefined,
        };
    }

    function normalizeEnginePickCatalog(models) {
        if (engineModelsUi.normalizeEnginePickCatalog) {
            return engineModelsUi.normalizeEnginePickCatalog(models, pickCatalogDeps());
        }
        return [];
    }

    function buildManagedLlmPickItems(statusCatalog = null) {
        if (engineModelsUi.buildManagedLlmPickItems) {
            return engineModelsUi.buildManagedLlmPickItems(statusCatalog, pickCatalogDeps());
        }
        return [];
    }

    function mergeManagedLlmIntoPickCatalog(engineItems, managedItems) {
        if (engineModelsUi.mergeManagedLlmIntoPickCatalog) {
            return engineModelsUi.mergeManagedLlmIntoPickCatalog(engineItems, managedItems);
        }
        return Array.isArray(engineItems) ? engineItems.slice() : [];
    }

    function buildDemucsPickItem(probe = cachedDemucsProbe) {
        if (engineModelsUi.buildDemucsPickItem) {
            return engineModelsUi.buildDemucsPickItem(probe, ENGINE_DEMUCS_MODEL_ID);
        }
        return { id: ENGINE_DEMUCS_MODEL_ID, name: 'Demucs', kind: 'demucs', group: 'separate' };
    }

    function mergeDemucsPickItem(items) {
        if (engineModelsUi.mergeDemucsPickItem) {
            return engineModelsUi.mergeDemucsPickItem(items, cachedDemucsProbe, ENGINE_DEMUCS_MODEL_ID);
        }
        const list = Array.isArray(items) ? items.slice() : [];
        list.push(buildDemucsPickItem());
        return list;
    }

    function engineModelGroupLabel(group) {
        if (engineModelsUi.engineModelGroupLabel) {
            return engineModelsUi.engineModelGroupLabel(group);
        }
        return engineModelKindLabel(group);
    }

    function renderEngineModelsList(models, managedStatusCatalog = null) {
        const normalized = normalizeEnginePickCatalog(models);
        const managedItems = buildManagedLlmPickItems(managedStatusCatalog);
        const merged = mergeManagedLlmIntoPickCatalog(normalized, managedItems);
        const items = merged.length ? mergeDemucsPickItem(merged) : [];
        cachedEnginePickCatalog = items;
        renderEngineModelsCards();
    }

    function renderEngineModelsCards() {
        const listEl = els.engineModelsList;
        if (!listEl) return;
        const items = filteredEnginePickItems();
        if (!cachedEnginePickCatalog.length) {
            listEl.innerHTML = '<div class="engine-model-empty">暂无模型目录。请先在「运行环境」检测引擎后，回到本页点「刷新状态」。</div>';
            syncEngineModelPickSummary();
            return;
        }
        if (!items.length) {
            listEl.innerHTML = '<div class="engine-model-empty">没有匹配的模型</div>';
            syncEngineModelPickSummary();
            return;
        }
        listEl.innerHTML = items.map((item) => {
            const badges = [];
            if (item.recommended) badges.push('<span class="engine-model-badge is-rec">推荐</span>');
            if (item.id === 'whisperseg-asmr') badges.push('<span class="engine-model-badge is-rec">必装</span>');
            if (item.translateOnly) badges.push('<span class="engine-model-badge is-warn">仅译中</span>');
            else if (item.freePipelineTranslate) badges.push('<span class="engine-model-badge is-ok">轻量</span>');
            if (item.proScale) badges.push('<span class="engine-model-badge is-use">Pro</span>');
            if (item.shipped && item.installed) badges.push('<span class="engine-model-badge is-ok">内置</span>');
            else if (item.installed) badges.push('<span class="engine-model-badge is-ok">已下载</span>');
            else if (item.incomplete) badges.push('<span class="engine-model-badge is-warn">不完整</span>');
            badges.push(`<span class="engine-model-badge">${esc(engineModelGroupLabel(item.group))}</span>`);
            if (item.familyLabel && item.group === 'llm') {
                badges.push(`<span class="engine-model-badge">${esc(item.familyLabel)}</span>`);
            }
            const subParts = [item.id, item.sizeHint];
            if (item.paramBillion) subParts.push(`${item.paramBillion}B`);
            const sub = subParts.filter(Boolean).join(' · ');
            const managedManual = item.source === 'managed'
                || item.source === 'sakura'
                || isManagedLlmDownloadId(item.id, item.source);
            const hubManual = !managedManual && canManualEngineHubDownload(item);
            return `
                <article class="engine-model-card" data-model-id="${esc(item.id)}" data-installed="${item.installed ? '1' : '0'}" data-source="${esc(item.source || 'engine')}">
                    <div class="engine-model-card-top">
                        <div>
                            <div class="engine-model-card-title">${esc(item.name || item.id)}</div>
                            <div class="engine-model-card-sub">${esc(sub)}</div>
                        </div>
                        <div class="engine-model-card-badges">${badges.join('')}</div>
                    </div>
                    ${item.note ? `<p class="engine-model-card-note">${esc(item.note)}</p>` : ''}
                    <div class="engine-model-card-actions">
                        <button type="button" class="btn btn-primary" data-model-action="download" data-model-id="${esc(item.id)}" ${engineModelsBusy ? 'disabled' : ''}>
                            ${item.id === ENGINE_DEMUCS_MODEL_ID && item.incomplete
                                ? '补齐 CUDA PyTorch'
                                : (item.installed ? '重新下载' : '下载')}
                        </button>
                        ${managedManual
                            ? `<button type="button" class="btn" data-model-action="manual" data-model-id="${esc(item.id)}" ${engineModelsBusy ? 'disabled' : ''} title="浏览器下载 GGUF 后放到指定目录">手动下载</button>`
                            : (hubManual
                                ? `<button type="button" class="btn" data-model-action="manual-hub" data-model-id="${esc(item.id)}" ${engineModelsBusy ? 'disabled' : ''} title="浏览器打开仓库页，按说明放到引擎 models 目录">手动下载</button>`
                                : '')}
                    </div>
                </article>`;
        }).join('');
        syncEngineModelPickSummary();
    }

    function missingModelsCtx() {
        const profileApi = global.TransubContentProfile;
        return {
            task: readTaskFromForm(),
            translateMode: readTranslateModeFromForm(),
            explicitOpusMtId: readOpusMtModelFromForm(),
            formLang: els.languageSelect?.value || '',
            selectedItems: (state.items || []).filter((i) => i?.selected !== false),
            cachedEngineModels,
            asrModelId: els.engineAsrModelSelect?.value || '',
            opusMtByLang: profileApi?.OPUS_MT_BY_LANG,
            normalizeSenseLang: profileApi?.normalizeSenseLang,
            isSakuraMtModelId,
            isLlmInferenceMtModel: (id) => !!global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(id),
        };
    }

    function resolveExpectedOpusMtModelIds() {
        if (missingModelsApi.resolveExpectedOpusMtModelIds) {
            return missingModelsApi.resolveExpectedOpusMtModelIds(missingModelsCtx());
        }
        return [];
    }

    function anyCommonOpusMtInstalled() {
        if (missingModelsApi.anyCommonOpusMtInstalled) {
            return missingModelsApi.anyCommonOpusMtInstalled(cachedEngineModels);
        }
        return false;
    }

    function warnIfSelectedEngineModelsMissing() {
        if (missingModelsApi.warnIfSelectedEngineModelsMissing) {
            return missingModelsApi.warnIfSelectedEngineModelsMissing(missingModelsCtx());
        }
        return '';
    }

    /**
     * If any listed model is missing/incomplete, confirm and optionally open settings.
     * @returns {Promise<boolean>} true when all ready (or nothing to check); false if blocked
     */
    async function ensureRequiredModelsReadyOrPrompt({
        modelIds = [],
        contextLabel = '',
        catalog = null,
        settingsTab = 'models',
        settingsHint = '',
    } = {}) {
        const ids = [...new Set(
            (Array.isArray(modelIds) ? modelIds : [])
                .map((id) => String(id || '').trim())
                .filter(Boolean),
        )];
        if (!ids.length) return true;

        let models = Array.isArray(catalog) ? catalog : null;
        if (!models) {
            try { await refreshEngineModels({ silent: true }); } catch { /* ignore */ }
            models = Array.isArray(cachedEngineModels) ? cachedEngineModels : [];
        }
        // Empty catalog: engine list unavailable — don't block selection.
        if (!models.length) return true;

        const missing = missingModelsApi.findMissingCatalogModels
            ? missingModelsApi.findMissingCatalogModels(ids, models)
            : ids
                .filter((id) => {
                    const row = models.find((m) => String(m?.id || '') === id);
                    return !row || !row.installed || row.incomplete;
                })
                .map((id) => ({ id, name: id, reason: 'missing' }));
        if (!missing.length) return true;

        const tab = String(settingsTab || 'models').trim() || 'models';
        const hint = String(settingsHint || '').trim()
            || (tab === 'pro-llm' || tab === 'pro' ? '设置 → Pro → 大模型' : '设置 → 模型');
        const copy = missingModelsApi.buildMissingModelsConfirmCopy
            ? missingModelsApi.buildMissingModelsConfirmCopy({
                contextLabel,
                missing,
                settingsHint: hint,
            })
            : {
                title: '需要先下载模型',
                message: `${contextLabel || '所选配置'}需要的模型尚未下载。请先到「${hint}」下载。`,
                primaryLabel: '去下载',
                secondaryLabel: '取消',
            };
        const go = await appConfirm(copy);
        if (go) openAppSettings(tab, { openLibrary: tab === 'models' });
        return false;
    }

    /**
     * Collect preferred sense support/models that are not yet installed across adopted items.
     * @returns {Promise<object[]>}
     */
    async function collectAdoptedSenseSupportGaps(selectedItems = []) {
        const profileApi = global.TransubContentProfile;
        if (!profileApi?.collectSenseSupportGaps) return [];
        const adopted = (Array.isArray(selectedItems) ? selectedItems : [])
            .filter((i) => i?.sense?.adopted && i.sense?.classification?.profile);
        if (!adopted.length) return [];

        if (!cachedEngineModels.length) {
            try { await refreshEngineModels({ silent: true }); } catch { /* ignore */ }
        }
        let demucsReady = true;
        const wantsDemucs = adopted.some((i) => i.sense?.overrides?.filmAudioEnhance);
        if (wantsDemucs) {
            const demucs = await refreshEngineDemucsStatus({ silent: true });
            demucsReady = engineModelsUi.isDemucsRuntimeUsable
                ? engineModelsUi.isDemucsRuntimeUsable(demucs)
                : (demucs?.ok === true && String(demucs?.status || '').trim() === 'ready');
            if (
                demucsReady
                && engineModelsUi.isDemucsFullyReady
                && !engineModelsUi.isDemucsFullyReady(demucs)
            ) {
                appendLog('Demucs 可用（CPU）；CUDA 未就绪，影视增强将走 CPU 分离', 'warn');
            }
        }

        const base = getSenseBaseOptions();
        const translateMode = readTranslateModeFromForm();
        const gapLists = adopted.map((item) => {
            const overrides = item.sense?.overrides || {};
            return profileApi.collectSenseSupportGaps(overrides, {
                profile: item.sense?.classification?.profile,
                language: overrides.language || item.sense?.classification?.language || base.language,
                task: base.task,
                installedModels: cachedEngineModels,
                demucsReady,
                advancedEntitled,
                translateMode,
                smartTranslate: translateMode === 'smart' || !!base.smartTranslate,
            });
        });
        return profileApi.mergeSenseSupportGaps
            ? profileApi.mergeSenseSupportGaps(gapLists)
            : gapLists.flatMap((g) => g.missing || []);
    }

    async function promptInstallSenseSupportGaps(missing = []) {
        const list = Array.isArray(missing) ? missing.filter(Boolean) : [];
        if (!list.length) return 'continue';
        const lines = list.map((m) => `· ${m.label || m.id}`).join('\n');
        const choice = await appConfirmChoice({
            title: '感知方案缺少支持项',
            message: (
                '已采纳的智能感知方案需要以下尚未安装的支持项或模型：\n\n'
                + `${lines}\n\n`
                + '须安装后才能按感知方案开始（避免误用表单低配模型）。'
                + '也可关闭智能感知或不采纳该项后再开始。\n\n'
                + '是否现在安装？安装完成后请再次点击「开始生成」。'
            ),
            primaryLabel: '去安装',
            secondaryLabel: '取消',
        });
        if (choice === 'primary') {
            await installSenseSupportGaps(list);
            return 'install';
        }
        return 'cancel';
    }

    async function installSenseSupportGaps(missing = []) {
        const list = Array.isArray(missing) ? missing.filter(Boolean) : [];
        const modelIds = list
            .filter((m) => (m.kind || 'model') === 'model')
            .map((m) => String(m.id || '').trim())
            .filter(Boolean);
        const needDemucs = list.some((m) => m.kind === 'demucs');

        // 串行：引擎下载全局忙锁，模型与 Demucs 并行会把后开任务标成「失败」
        if (modelIds.length) {
            openAppSettings('models', { openLibrary: true });
            appendLog(`感知缺项：开始下载 ${modelIds.join('、')}`, 'info');
            showToast(`正在下载感知所需模型（${modelIds.length}）…`, 'info');
            await downloadEngineModels({ modelIds, force: false });
        }
        if (needDemucs) {
            setEngineModelsFilter('separate');
            renderEngineModelsCards();
            appendLog('感知缺项：打开 Demucs 安装窗口', 'info');
            showToast('请完成 Demucs（影视人声分离）安装', 'warn');
            await ensureEngineDemucs({ force: false });
        }
        if (!modelIds.length && !needDemucs) {
            openAppSettings('models', { openLibrary: true });
        }
    }

    async function refreshEngineModels({ silent = false } = {}) {
        if (!electron?.transubEngineListModels && !electron?.transubEngineDownloadInfo) {
            renderEngineModelsList([]);
            if (!silent) setEngineStatusText('当前环境不支持引擎模型列表', 'warn');
            return { ok: false, error: 'unsupported' };
        }
        try {
            const st = await electron?.transubComputeTaskStatus?.();
            const kind = String(st?.kind || '').trim();
            if (st?.busy && /^engine_/.test(kind)) {
                if (els.engineModelsSummary) {
                    els.engineModelsSummary.textContent = '任务进行中，暂不刷新模型列表';
                }
                syncEngineModelsLibraryTabSummary();
                if (!silent) {
                    setEngineStatusText('字幕任务进行中，请结束后再刷新模型列表', 'warn');
                }
                return { ok: true, deferred: true, code: 'compute_busy' };
            }
        } catch (_) { /* ignore */ }
        if (els.engineModelsSummary) els.engineModelsSummary.textContent = '刷新中…';
        if (els.engineModelsLibraryTabSummary) {
            els.engineModelsLibraryTabSummary.textContent = '正在刷新模型状态…';
        }
        const prevAsr = els.engineAsrModelSelect?.value || '';
        const prevMt = readOpusMtModelFromForm();
        const prevLlm = readLlmMtModelFromForm();
        const prevVad = els.engineVadModelSelect?.value || '';
        try {
            const payload = engineFormPayload();
            const [listRes, infoRes, managedRes] = await Promise.all([
                electron.transubEngineListModels?.(payload) || Promise.resolve(null),
                electron.transubEngineDownloadInfo?.({
                    ...payload,
                    kind: 'models',
                    profile: els.engineProfileSelect?.value || payload.engineProfile || 'balanced',
                    modelIds: [
                        prevAsr,
                        prevMt,
                        prevLlm,
                        prevVad,
                    ].filter(Boolean),
                    hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
                }) || Promise.resolve(null),
                electron.transubAdvancedManagedLlmStatus?.() || Promise.resolve(null),
            ]);
            const models = Array.isArray(listRes?.models) ? listRes.models : [];
            const catalog = Array.isArray(infoRes?.info?.catalog) ? infoRes.info.catalog : [];
            const managedCatalogRows = Array.isArray(managedRes?.managed?.catalog)
                ? managedRes.managed.catalog
                : (Array.isArray(managedRes?.catalog) ? managedRes.catalog : null);
            if ((!listRes?.ok && !models.length) && !catalog.length && !managedCatalogRows?.length) {
                cachedEngineModels = [];
                cachedDemucsProbe = null;
                renderEngineModelsList([]);
                if (els.engineModelsSummary) {
                    els.engineModelsSummary.textContent = listRes?.error || infoRes?.error || '无法获取';
                }
                if (!silent) setEngineStatusText(listRes?.error || infoRes?.error || '无法获取模型列表', 'err');
                return listRes || infoRes || { ok: false, error: 'list failed' };
            }
            cachedEngineModels = models.length
                ? models
                : catalog.map((c) => ({
                    id: c.id,
                    name: c.name,
                    kind: c.kind,
                    installed: !!c.installed,
                    incomplete: !!c.incomplete,
                    size_hint_mb: 0,
                }));
            // Surface installed managed LLMs in环境 → LLM 推理翻译 select.
            const managedAsMt = (managedCatalogRows || buildManagedLlmPickItems())
                .filter((m) => m?.id && !!m.installed)
                .map((m) => ({
                    id: m.id,
                    name: m.name || m.id,
                    kind: 'mt',
                    installed: true,
                    incomplete: false,
                    size_hint_mb: 0,
                }));
            for (const row of managedAsMt) {
                if (!cachedEngineModels.some((m) => m.id === row.id)) {
                    cachedEngineModels.push(row);
                }
            }
            fillEngineModelSelect(els.engineAsrModelSelect, cachedEngineModels, 'asr', prevAsr);
            fillEngineModelSelect(els.engineMtModelSelect, cachedEngineModels, 'mt', prevMt, {
                allowEmpty: true,
                emptyLabel: '自动匹配（按源语言 · Opus）',
                modelFilter: (m) => !isLlmInferencePickModelId(m.id),
            });
            fillEngineModelSelect(els.engineLlmMtModelSelect, cachedEngineModels, 'mt', prevLlm, {
                allowEmpty: true,
                emptyLabel: '自动匹配（按语言 / Pro / 硬件）',
                modelFilter: (m) => {
                    if (!isLlmInferencePickModelId(m.id)) return false;
                    if (advancedEntitled) return true;
                    if (m.proScale) return false;
                    const entry = findManagedLlmCatalogEntry(m.id);
                    if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry)) return false;
                    return true;
                },
            });
            fillEngineModelSelect(els.engineVadModelSelect, cachedEngineModels, 'vad', prevVad);
            syncExpertQuickModelSelects();
            syncExpertExtraChipsUi();
            // Demucs probe is best-effort and must not block painting the catalog.
            // Under Smart App Control, a hung prior /v1/runtime/* request can wedge
            // the engine; keep UI responsive and refresh Demucs in the background.
            void (async () => {
                try {
                    const demucsRes = await electron.transubEngineAudioSeparateStatus?.(payload);
                    if (demucsRes?.ok) {
                        cachedDemucsProbe = demucsRes;
                        if (cachedEnginePickCatalog.length) {
                            renderEngineModelsList(
                                catalog.length ? catalog : cachedEngineModels,
                                managedCatalogRows,
                            );
                        }
                    }
                } catch { /* keep previous probe */ }
            })();
            renderEngineModelsList(catalog.length ? catalog : cachedEngineModels, managedCatalogRows);
            syncMtModelChipUi();
            updateReadinessStrip();
            if (!silent && listRes && !listRes.ok && (models.length || catalog.length || managedCatalogRows?.length)) {
                setEngineStatusText(`${listRes?.error || '引擎未就绪'}（已列出可用模型）`, 'warn');
            }
            return listRes || infoRes || { ok: true, models: cachedEngineModels };
        } catch (err) {
            cachedEngineModels = [];
            cachedDemucsProbe = null;
            renderEngineModelsList([]);
            const msg = err?.message || String(err);
            if (els.engineModelsSummary) els.engineModelsSummary.textContent = '刷新失败';
            if (!silent) setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
    }

    function setEngineGpuStatusText(text, kind = '') {
        if (!els.engineGpuStatus) return;
        els.engineGpuStatus.textContent = text || '';
        const colors = {
            ok: 'text-xs text-emerald-600',
            warn: 'text-xs text-amber-600',
            err: 'text-xs text-red-600',
            busy: 'text-xs text-sky-600',
        };
        els.engineGpuStatus.className = colors[kind] || 'text-xs text-gray-500';
    }

    function applyGpuRuntimeProbe(probe = {}) {
        const status = String(probe.status || '').trim();
        const hint = String(probe.hint || '').trim();
        if (!status && !hint) {
            setEngineGpuStatusText('');
            return;
        }
        const kind = status === 'ready'
            ? 'ok'
            : (status === 'need_install' || status === 'partial' || status === 'driver_too_old' ? 'warn' : 'busy');
        const gpu = probe.gpuName ? `${probe.gpuName}` : '';
        const cuda = probe.driverCudaVersion ? `驱动 CUDA ${probe.driverCudaVersion}` : '';
        const bits = [hint || status, gpu, cuda].filter(Boolean);
        setEngineGpuStatusText(bits.join(' · '), kind);
        if (els.engineEnsureGpuBtn) {
            const need = status === 'need_install' || status === 'partial';
            els.engineEnsureGpuBtn.classList.toggle('ring-1', need);
            els.engineEnsureGpuBtn.classList.toggle('ring-sky-300', need);
        }
    }

    async function refreshHardwareRecommend({ silent = true } = {}) {
        if (!electron?.transubEngineRecommend) return null;
        try {
            const res = await electron.transubEngineRecommend(engineFormPayload());
            if (res?.ok) {
                const vramMb = Number(res.device?.vramMb || res.reason?.vramMb || 0);
                cachedHardwareRecommend = {
                    vramMb: vramMb > 0 ? vramMb : undefined,
                    profile: String(res.profile || '').trim() || undefined,
                    asrModel: String(res.models?.asrModel || res.asrModel || '').trim() || undefined,
                    gpuName: String(res.device?.gpuName || '').trim() || undefined,
                    at: Date.now(),
                };
                syncTranslateChipUi();
                updateAsrRecommendChip(res);
                return res;
            }
            if (!silent) appendLog(res?.error || '硬件推荐失败', 'warn');
            return res;
        } catch (err) {
            if (!silent) appendLog(err?.message || String(err), 'warn');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function refreshEngineGpuStatus({ silent = true } = {}) {
        if (!electron?.transubEngineGpuStatus) return null;
        try {
            const res = await electron.transubEngineGpuStatus(engineFormPayload());
            if (res?.ok) {
                applyGpuRuntimeProbe(res);
                const vramMb = Number(res.vramMb || res.device?.vramMb || 0);
                if (vramMb > 0) {
                    cachedHardwareRecommend = {
                        ...(cachedHardwareRecommend || {}),
                        vramMb,
                        gpuName: String(res.gpuName || res.device?.gpuName || cachedHardwareRecommend?.gpuName || '').trim()
                            || undefined,
                        at: Date.now(),
                    };
                }
                // Full profile (speed/balanced/quality) comes from recommend.
                void refreshHardwareRecommend({ silent: true });
                return res;
            }
            if (!silent) setEngineGpuStatusText(res?.error || '无法获取 GPU 状态', 'err');
            return res;
        } catch (err) {
            if (!silent) setEngineGpuStatusText(err?.message || String(err), 'err');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    function applyDemucsProbe(probe = {}) {
        cachedDemucsProbe = probe && typeof probe === 'object' ? probe : null;
        if (cachedEnginePickCatalog.length) {
            const rest = cachedEnginePickCatalog.filter((m) => m.id !== ENGINE_DEMUCS_MODEL_ID);
            cachedEnginePickCatalog = mergeDemucsPickItem(rest);
            renderEngineModelsCards();
        }
    }

    async function refreshEngineDemucsStatus({ silent = true } = {}) {
        if (!electron?.transubEngineAudioSeparateStatus) return null;
        try {
            const res = await electron.transubEngineAudioSeparateStatus(engineFormPayload());
            if (res?.ok) {
                applyDemucsProbe(res);
                return res;
            }
            if (!silent) setEngineStatusText(res?.error || '无法获取 Demucs 状态', 'err');
            return res;
        } catch (err) {
            if (!silent) setEngineStatusText(err?.message || String(err), 'err');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function ensureEngineDemucs({ force = false, silent = false, assumeBusy = false } = {}) {
        if (!electron?.transubEngineRunDownload) {
            if (!silent) {
                appendLog('当前环境不支持 Demucs 安装', 'err');
                setEngineStatusText('当前环境不支持 Demucs 安装', 'err');
            }
            return { ok: false, error: 'unsupported' };
        }
        if (!assumeBusy && engineModelsBusy) return { ok: false, error: 'busy' };
        appendLog('开始安装 Demucs（人声分离）…', 'info');
        setEngineStatusText('正在安装 Demucs…', 'busy');
        if (!assumeBusy) {
            setEngineDownloadBusy(true);
            setEngineDownloadProgressPct(0);
            setEngineDownloadProgressVisible(true, '正在安装 Demucs（人声分离）…');
            appendEngineDownloadLog('开始安装 Demucs（人声分离）');
        }
        try {
            const res = await electron.transubEngineRunDownload({
                ...engineFormPayload(),
                kind: 'demucs',
                force: !!force,
            });
            if (res?.ok) {
                await refreshEngineDemucsStatus({ silent: true });
                const probe = cachedDemucsProbe || res.probe || res;
                const partial = !!(res.partial
                    || (engineModelsUi.isDemucsRuntimeUsable
                        && engineModelsUi.isDemucsRuntimeUsable(probe)
                        && engineModelsUi.isDemucsFullyReady
                        && !engineModelsUi.isDemucsFullyReady(probe)));
                const msg = partial
                    ? (res.message || 'Demucs 已可用（CPU），CUDA 未就绪')
                    : (res.message || 'Demucs 安装完成');
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                if (!silent) {
                    appendLog(msg, partial ? 'warn' : 'ok');
                    setEngineStatusText(msg, partial ? 'warn' : 'ok');
                }
                return { ...res, partial: partial || !!res.partial };
            }
            if (res?.cancelled) {
                const msg = res.error || '已取消安装';
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                if (!silent) {
                    appendLog(msg, 'warn');
                    setEngineStatusText(msg, 'warn');
                }
                return res;
            }
            const err = formatEngineDownloadError(res?.error || 'Demucs 安装失败');
            setEngineDownloadProgressVisible(true, err);
            appendEngineDownloadLog(err);
            if (!silent) {
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
            }
            if (!silent && !res?.cancelled) {
                if (!assumeBusy) setEngineDownloadBusy(false);
                const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                    kind: 'demucs',
                    errorText: err,
                    formPayload: engineFormPayload(),
                });
                if (manual?.ok) {
                    const msg = manual.message || 'Demucs 本地安装完成';
                    setEngineDownloadProgressPct(100);
                    setEngineDownloadProgressVisible(true, msg);
                    appendEngineDownloadLog(msg);
                    appendLog(msg, 'ok');
                    setEngineStatusText(msg, 'ok');
                    await refreshEngineDemucsStatus({ silent: true });
                    return { ok: true, message: msg, manual: true, ...(manual || {}) };
                }
            }
            return res || { ok: false, error: err };
        } catch (err) {
            const msg = formatEngineDownloadError(err?.message || String(err));
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'err');
                setEngineStatusText(msg, 'err');
            }
            if (!silent) {
                if (!assumeBusy) setEngineDownloadBusy(false);
                const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                    kind: 'demucs',
                    errorText: msg,
                    formPayload: engineFormPayload(),
                });
                if (manual?.ok) {
                    const okMsg = manual.message || 'Demucs 本地安装完成';
                    setEngineDownloadProgressPct(100);
                    setEngineDownloadProgressVisible(true, okMsg);
                    appendEngineDownloadLog(okMsg);
                    appendLog(okMsg, 'ok');
                    setEngineStatusText(okMsg, 'ok');
                    await refreshEngineDemucsStatus({ silent: true });
                    return { ok: true, message: okMsg, manual: true, ...(manual || {}) };
                }
            }
            return { ok: false, error: msg };
        } finally {
            if (!assumeBusy) setEngineDownloadBusy(false);
        }
    }

    async function ensureEngineGpuSupport({ force = false, silent = false } = {}) {
        if (!electron?.transubEngineRunDownload) {
            if (!silent) {
                appendLog('当前环境不支持 GPU 支持安装', 'err');
                setEngineStatusText('当前环境不支持 GPU 支持安装', 'err');
            }
            return { ok: false, error: 'unsupported' };
        }
        if (engineModelsBusy) return { ok: false, error: 'busy' };
        appendLog('开始安装 GPU 支持…', 'info');
        setEngineGpuStatusText('正在安装…', 'busy');
        setEngineStatusText('正在安装 GPU 支持…', 'busy');
        setEngineDownloadBusy(true);
        setEngineDownloadProgressPct(0);
        setEngineDownloadProgressVisible(true, '正在安装 GPU 支持…');
        appendEngineDownloadLog('开始安装 GPU 支持');
        try {
            const res = await electron.transubEngineRunDownload({
                ...engineFormPayload(),
                kind: 'gpu',
                force: !!force,
            });
            if (res?.ok) {
                const msg = res.message || 'GPU 支持安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                if (!silent) {
                    appendLog(msg, 'ok');
                    setEngineStatusText(msg, 'ok');
                }
                await refreshEngineGpuStatus({ silent: true });
                return res;
            }
            if (res?.cancelled) {
                const msg = res.error || '已取消安装';
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                if (!silent) {
                    appendLog(msg, 'warn');
                    setEngineStatusText(msg, 'warn');
                    setEngineGpuStatusText(msg, 'warn');
                }
                return res;
            }
            const err = formatEngineDownloadError(res?.error || 'GPU 支持安装失败');
            setEngineDownloadProgressVisible(true, err);
            appendEngineDownloadLog(err);
            if (!silent) {
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
                setEngineGpuStatusText(err, 'err');
            }
            if (!silent && !res?.cancelled) {
                // Release busy so local install IPC can run.
                setEngineDownloadBusy(false);
                const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                    kind: 'gpu',
                    errorText: err,
                    formPayload: engineFormPayload(),
                });
                if (manual?.ok) {
                    const msg = manual.message || 'GPU 支持本地安装完成';
                    setEngineDownloadProgressPct(100);
                    setEngineDownloadProgressVisible(true, msg);
                    appendEngineDownloadLog(msg);
                    appendLog(msg, 'ok');
                    setEngineStatusText(msg, 'ok');
                    await refreshEngineGpuStatus({ silent: true });
                    return { ok: true, message: msg, manual: true, ...(manual || {}) };
                }
            }
            return res || { ok: false, error: err };
        } catch (err) {
            const msg = formatEngineDownloadError(err?.message || String(err));
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            if (!silent) {
                appendLog(msg, 'err');
                setEngineStatusText(msg, 'err');
                setEngineGpuStatusText(msg, 'err');
            }
            if (!silent) {
                setEngineDownloadBusy(false);
                const manual = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                    kind: 'gpu',
                    errorText: msg,
                    formPayload: engineFormPayload(),
                });
                if (manual?.ok) {
                    const okMsg = manual.message || 'GPU 支持本地安装完成';
                    setEngineDownloadProgressPct(100);
                    setEngineDownloadProgressVisible(true, okMsg);
                    appendEngineDownloadLog(okMsg);
                    appendLog(okMsg, 'ok');
                    setEngineStatusText(okMsg, 'ok');
                    await refreshEngineGpuStatus({ silent: true });
                    return { ok: true, message: okMsg, manual: true, ...(manual || {}) };
                }
            }
            return { ok: false, error: msg };
        } finally {
            setEngineDownloadBusy(false);
        }
    }

    function formatEngineTestResultMessage(res) {
        if (engineModelsUi.formatEngineTestResultMessage) {
            return engineModelsUi.formatEngineTestResultMessage(res, {
                installPath: els.engineInstallPathInput?.value || '',
                gpuStatus: els.engineGpuStatus?.textContent || '',
                models: cachedEngineModels,
                demucs: cachedDemucsProbe,
            });
        }
        if (!res?.ok) return String(res?.error || '引擎未就绪');
        return '引擎已就绪。';
    }

    async function showEngineTestResultDialog(res) {
        const ok = !!res?.ok;
        const message = formatEngineTestResultMessage(res);
        await appConfirm({
            title: ok ? '引擎检测结果' : '引擎检测未通过',
            message,
            primaryLabel: '确定',
            hideSecondary: true,
        });
    }

    async function refreshEngineStatus() {
        setEngineStatusText('检测中…', 'busy');
        const res = await electron?.transubEngineValidate?.(engineFormPayload());
        if (res?.ok) {
            const ver = res.version || res.health?.engineVersion || '';
            const stub = res.health?.stub ? ', stub' : '';
            setEngineStatusText(
                ver ? `Transub Engine 引擎就绪 (${ver}${stub})` : 'Transub Engine 引擎就绪',
                'ok',
            );
            // Models are optional (e.g. LLM-only translate); do not fold install gaps into「检测引擎」.
            await refreshEngineModels({ silent: true });
            await refreshEngineGpuStatus({ silent: true });
            await refreshEngineDemucsStatus({ silent: true });
        } else {
            setEngineStatusText(res?.error || 'Transub Engine 引擎未就绪', 'err');
            if (els.engineModelsSummary) els.engineModelsSummary.textContent = 'Transub Engine 引擎未就绪';
            cachedEngineModels = [];
            cachedDemucsProbe = null;
            renderEngineModelsList([]);
            setEngineGpuStatusText('');
        }
        updateEnvBanner();
        return res;
    }

    function getEngineDownloadModelMeta(modelIds) {
        const byId = new Map(cachedEnginePickCatalog.map((m) => [m.id, m]));
        return (Array.isArray(modelIds) ? modelIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
            .map((id) => ({
                id,
                installed: !!byId.get(id)?.installed,
                source: byId.get(id)?.source || (
                    isSakuraMtModelId(id) ? 'sakura'
                        : (findManagedLlmCatalogEntry(id) ? 'managed' : 'engine')
                ),
            }));
    }

    function manualDownloadDeps() {
        return {
            demucsModelId: ENGINE_DEMUCS_MODEL_ID,
            isSakuraMtModelId,
            findManagedLlmCatalogEntry,
        };
    }

    function isManagedLlmDownloadId(modelId, source = '') {
        if (manualDownloadApi.isManagedLlmDownloadId) {
            return manualDownloadApi.isManagedLlmDownloadId(modelId, source, manualDownloadDeps());
        }
        return false;
    }

    /** Hub ASR/MT/VAD models that can be placed manually under engine models/. */
    function canManualEngineHubDownload(item) {
        if (manualDownloadApi.canManualEngineHubDownload) {
            return manualDownloadApi.canManualEngineHubDownload(item, manualDownloadDeps());
        }
        return false;
    }

    function buildManualHubModelHint(info = {}) {
        if (manualDownloadApi.buildManualHubModelHint) {
            return manualDownloadApi.buildManualHubModelHint(info);
        }
        return String(info?.name || info?.modelId || '模型');
    }

    async function verifyManualEngineHubModel(modelId, info = null) {
        const id = String(modelId || '').trim();
        await refreshEngineModels({ silent: true });
        const row = (cachedEnginePickCatalog || []).find((m) => m.id === id);
        if (row?.installed && !row?.incomplete) {
            const msg = `已检测到本地模型：${row.name || id}`;
            appendLog(msg, 'ok');
            setEngineStatusText(msg, 'ok');
            return { ok: true, message: msg };
        }
        const folder = String(info?.localDir || info?.folder || row?.localDir || '').trim();
        const weightFile = String(info?.weightFile || '').trim();
        const err = [
            row?.incomplete ? `「${id}」目录不完整` : `未检测到已安装的「${id}」`,
            weightFile ? `请确认 ${weightFile} 已完整放入目录` : '',
            folder ? `目录：${folder}` : '',
        ].filter(Boolean).join('\n');
        appendLog(err, 'err');
        setEngineStatusText(err, 'err');
        return { ok: false, error: err };
    }

    async function openEngineHubModelFolder(modelId, info = null) {
        const id = String(modelId || '').trim();
        const folderHint = String(info?.localDir || info?.folder || '').trim();
        if (!electron?.transubEngineOpenDownloadFolder && !electron?.openPath) {
            return { ok: false, error: '当前环境无法打开目录' };
        }
        try {
            if (electron.transubEngineOpenDownloadFolder) {
                const res = await electron.transubEngineOpenDownloadFolder({
                    ...engineFormPayload(),
                    kind: 'models',
                    modelId: id,
                    folder: folderHint || undefined,
                    hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
                });
                if (res?.ok) {
                    return {
                        ok: true,
                        folder: res.folder || res.path || folderHint,
                    };
                }
                return { ok: false, error: res?.error || '无法打开存放目录' };
            }
            if (folderHint && electron.openPath) {
                await electron.openPath(folderHint);
                return { ok: true, folder: folderHint };
            }
            return { ok: false, error: '无法打开存放目录' };
        } catch (err) {
            return { ok: false, error: err?.message || '无法打开存放目录' };
        }
    }

    /**
     * Hub 模型（非 GGUF）：弹窗给出仓库网址、放置说明，并可打开存放目录。
     */
    async function manualEngineHubModelDownload(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return { ok: false, error: '未选择模型' };
        if (engineModelsBusy) return { ok: false, error: 'busy' };
        if (!electron?.transubEngineDownloadInfo) {
            setEngineStatusText('当前环境不支持手动下载模型', 'err');
            return { ok: false, error: 'unsupported' };
        }
        setEngineStatusText('正在准备手动下载说明…', 'busy');
        let infoRes;
        try {
            infoRes = await electron.transubEngineDownloadInfo({
                ...engineFormPayload(),
                kind: 'models',
                modelIds: [id],
                hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            });
        } catch (err) {
            const msg = err?.message || '无法获取下载信息';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        if (!infoRes?.ok) {
            const msg = infoRes?.error || '无法获取下载信息';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        const item = (Array.isArray(infoRes.info?.items) ? infoRes.info.items : [])
            .find((it) => String(it?.id || '') === id)
            || (Array.isArray(infoRes.info?.items) ? infoRes.info.items[0] : null);
        if (!item) {
            setEngineStatusText('未找到该模型的下载信息', 'err');
            return { ok: false, error: 'missing_item' };
        }
        if (item.bundled || !item.hubId) {
            const msg = `「${item.name || id}」无需单独下载（运行时内置）`;
            setEngineStatusText(msg, 'info');
            return { ok: true, bundled: true, message: msg };
        }
        const info = {
            ...item,
            modelId: id,
            folder: item.localDir || item.folder || '',
        };
        await new Promise((r) => setTimeout(r, 50));
        const choice = await appConfirmChoice({
            title: '手动下载模型',
            message: buildManualHubModelHint(info),
            primaryLabel: '打开下载页',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '取消',
        });
        if (choice === 'secondary') {
            setEngineStatusText('已取消手动下载', 'warn');
            return { ok: false, cancelled: true };
        }
        if (choice === 'tertiary') {
            const folderRes = await openEngineHubModelFolder(id, info);
            if (folderRes.ok) {
                setEngineStatusText(`已打开存放目录：${folderRes.folder || info.folder || ''}`, 'info');
            } else {
                setEngineStatusText(folderRes.error || '无法打开存放目录', 'err');
            }
            const again = await appConfirmChoice({
                title: '手动下载模型',
                message: `${buildManualHubModelHint(info)}\n\n目录已打开。是否继续打开下载页？`,
                primaryLabel: '打开下载页',
                secondaryLabel: '稍后',
            });
            if (again !== 'primary') return { ok: true, folderOnly: true };
        }
        const url = String(info.defaultUrl || info.mirrorUrl || info.officialUrl || '').trim();
        if (!url) {
            setEngineStatusText('未找到模型下载链接', 'err');
            return { ok: false, error: 'no_url' };
        }
        try {
            if (electron.transubEngineOpenManualUrl) {
                const openRes = await electron.transubEngineOpenManualUrl({ url });
                if (!openRes?.ok) {
                    const msg = openRes?.error || '无法打开下载链接';
                    setEngineStatusText(msg, 'err');
                    return { ok: false, error: msg };
                }
            } else if (electron.openExternal) {
                await electron.openExternal(url);
            } else {
                setEngineStatusText('无法打开下载链接', 'err');
                return { ok: false, error: 'no_open' };
            }
        } catch (err) {
            const msg = err?.message || '无法打开下载链接';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        const folder = String(info.localDir || info.folder || '').trim();
        const placedMsg = folder
            ? `已打开下载页。请将仓库文件放到：${folder}`
            : '已打开下载页。请按提示将文件放到引擎 models 目录';
        appendLog(placedMsg, 'info');
        setEngineStatusText(placedMsg, 'info');
        const verifyChoice = await appConfirmChoice({
            title: '检测本地文件',
            message: (
                `若已将文件放到指定目录，可立即检测是否可用。\n\n`
                + (info.weightFile ? `关键权重：${info.weightFile}\n` : '')
                + (folder ? `目录：${folder}` : '')
            ),
            primaryLabel: '我已放入，检测',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '稍后',
        });
        if (verifyChoice === 'tertiary') {
            try {
                await openEngineHubModelFolder(id, info);
            } catch (_) { /* ignore */ }
            const retry = await appConfirm({
                title: '检测本地文件',
                message: '文件放好后，是否现在检测？',
                primaryLabel: '检测',
                secondaryLabel: '稍后',
            });
            if (!retry) return { ok: true, opened: true, message: placedMsg };
            return verifyManualEngineHubModel(id, info);
        }
        if (verifyChoice === 'primary') {
            return verifyManualEngineHubModel(id, info);
        }
        return { ok: true, opened: true, message: placedMsg };
    }

    function classifyManualKindsForModelIds(modelIds) {
        if (manualDownloadApi.classifyManualKindsForModelIds) {
            return manualDownloadApi.classifyManualKindsForModelIds(modelIds, ENGINE_DEMUCS_MODEL_ID);
        }
        return { kinds: [], hubIds: [] };
    }

    function buildManualGgufHint(info = {}) {
        if (manualDownloadApi.buildManualGgufHint) {
            return manualDownloadApi.buildManualGgufHint(info);
        }
        return String(info?.name || info?.modelId || '模型');
    }

    async function verifyManualManagedLlmModel(modelId, info = null) {
        const res = await electron?.transubAdvancedManagedLlmVerifyManual?.({ modelId, kind: 'model' });
        if (res?.ok) {
            const msg = res.message || '已检测到本地 GGUF';
            appendLog(msg, 'ok');
            setEngineStatusText(msg, 'ok');
            await refreshEngineModels({ silent: true });
            return { ok: true, message: msg };
        }
        const folder = res?.folder || info?.folder || '';
        const fileName = res?.fileName || info?.fileName || '';
        const err = [res?.error || '未检测到有效的模型文件', fileName && folder ? `请确认 ${fileName} 已放在：${folder}` : '']
            .filter(Boolean)
            .join('\n');
        appendLog(err, 'err');
        setEngineStatusText(err, 'err');
        return { ok: false, error: err };
    }

    /**
     * 单文件 GGUF：浏览器手动下载，并提示放到 advanced-llm/models。
     */
    async function manualManagedLlmDownload(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return { ok: false, error: '未选择模型' };
        if (engineModelsBusy) return { ok: false, error: 'busy' };
        if (!electron?.transubAdvancedManagedLlmDownloadInfo || !electron?.transubAdvancedManagedLlmOpenManual) {
            setEngineStatusText('当前环境不支持手动下载 GGUF', 'err');
            return { ok: false, error: 'unsupported' };
        }
        setEngineStatusText('正在准备手动下载说明…', 'busy');
        let infoRes;
        try {
            infoRes = await electron.transubAdvancedManagedLlmDownloadInfo({ modelId: id, kind: 'model' });
        } catch (err) {
            const msg = err?.message || '无法获取下载信息';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        if (!infoRes?.ok) {
            const msg = infoRes?.error || '无法获取下载信息';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        const info = infoRes.info || {};
        await new Promise((r) => setTimeout(r, 50));
        const choice = await appConfirmChoice({
            title: '手动下载 GGUF',
            message: buildManualGgufHint(info),
            primaryLabel: '打开下载链接',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '取消',
        });
        if (choice === 'secondary') {
            setEngineStatusText('已取消手动下载', 'warn');
            return { ok: false, cancelled: true };
        }
        if (choice === 'tertiary') {
            try {
                const folderRes = await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
                if (folderRes?.ok) {
                    setEngineStatusText(`已打开存放目录：${folderRes.folder || info.folder || ''}`, 'info');
                } else {
                    setEngineStatusText(folderRes?.error || '无法打开存放目录', 'err');
                }
            } catch (err) {
                setEngineStatusText(err?.message || '无法打开存放目录', 'err');
            }
            const again = await appConfirmChoice({
                title: '手动下载 GGUF',
                message: `${buildManualGgufHint(info)}\n\n目录已打开。是否继续打开下载链接？`,
                primaryLabel: '打开下载链接',
                secondaryLabel: '稍后',
            });
            if (again !== 'primary') return { ok: true, folderOnly: true };
        }
        try {
            const openRes = await electron.transubAdvancedManagedLlmOpenManual({
                modelId: id,
                kind: 'model',
                which: 'mirror',
            });
            if (!openRes?.ok) {
                const msg = openRes?.error || '无法打开下载链接';
                setEngineStatusText(msg, 'err');
                return { ok: false, error: msg };
            }
        } catch (err) {
            const msg = err?.message || '无法打开下载链接';
            setEngineStatusText(msg, 'err');
            return { ok: false, error: msg };
        }
        const folder = String(info.folder || '').trim();
        const fileName = String(info.fileName || '').trim();
        const placedMsg = fileName && folder
            ? `已打开下载页。请将 ${fileName} 放到：${folder}`
            : '已打开下载页。请按提示将 GGUF 放到 advanced-llm/models 目录';
        appendLog(placedMsg, 'info');
        setEngineStatusText(placedMsg, 'info');
        const verifyChoice = await appConfirmChoice({
            title: '检测本地文件',
            message: (
                `若已将文件放到指定目录，可立即检测是否可用。\n\n`
                + (fileName ? `文件名：${fileName}\n` : '')
                + (folder ? `目录：${folder}` : '')
            ),
            primaryLabel: '我已放入，检测',
            tertiaryLabel: '打开存放目录',
            secondaryLabel: '稍后',
        });
        if (verifyChoice === 'tertiary') {
            try {
                await electron.transubAdvancedManagedLlmOpenFolder?.({ kind: 'model' });
            } catch (_) { /* ignore */ }
            const retry = await appConfirm({
                title: '检测本地文件',
                message: '文件放好后，是否现在检测？',
                primaryLabel: '检测',
                secondaryLabel: '稍后',
            });
            if (!retry) return { ok: true, opened: true, message: placedMsg };
            return verifyManualManagedLlmModel(id, info);
        }
        if (verifyChoice === 'primary') {
            return verifyManualManagedLlmModel(id, info);
        }
        return { ok: true, opened: true, message: placedMsg };
    }

    async function openEngineModelHubLinks(modelIds) {
        const ids = (Array.isArray(modelIds) ? modelIds : []).filter(Boolean);
        if (!ids.length || !electron?.transubEngineDownloadInfo) {
            return { ok: false, error: '无可打开的模型镜像' };
        }
        try {
            const res = await electron.transubEngineDownloadInfo({
                ...engineFormPayload(),
                kind: 'models',
                modelIds: ids,
                hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
            });
            const idSet = new Set(ids);
            const items = (Array.isArray(res?.info?.items) ? res.info.items : [])
                .filter((it) => !it?.id || idSet.has(String(it.id)));
            const urls = [...new Set(
                items
                    .map((it) => it.defaultUrl || it.mirrorUrl || it.officialUrl)
                    .filter(Boolean),
            )];
            if (!urls.length) return { ok: false, error: '未找到模型下载链接' };
            for (const url of urls.slice(0, 8)) {
                try {
                    if (electron.transubEngineOpenManualUrl) {
                        await electron.transubEngineOpenManualUrl({ url });
                    } else {
                        await electron.openExternal?.(url);
                    }
                } catch (_) { /* ignore */ }
            }
            const folder = res?.info?.folder;
            const msg = folder
                ? `已打开模型镜像页。请将文件放到：${folder}`
                : '已打开模型镜像页';
            return { ok: true, message: msg, folder };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function manualEngineDownloadInstall({ modelIds = null, kinds: forceKinds = null } = {}) {
        if (engineModelsBusy) return { ok: false, error: 'busy' };
        if (!global.TransubManualWhlInstall?.openModal && !electron?.transubEngineDownloadInfo) {
            setEngineStatusText('当前环境不支持手动下载安装', 'err');
            return { ok: false, error: 'unsupported' };
        }

        const selectedIds = Array.isArray(modelIds)
            ? modelIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        let { kinds, hubIds } = classifyManualKindsForModelIds(selectedIds);
        if (Array.isArray(forceKinds) && forceKinds.length) {
            kinds = [...new Set(forceKinds.map((k) => String(k || '').trim()).filter(Boolean))];
        }

        // Nothing selected → offer common runtime wheels (SenseVoice / Whisper / Demucs / GPU).
        if (!kinds.length && !hubIds.length) {
            kinds = ['sensevoice', 'whisper', 'demucs', 'gpu'];
            setEngineStatusText('将列出常用运行库供手动下载', 'info');
        }

        let installedOk = false;
        if (kinds.length && global.TransubManualWhlInstall?.openModal) {
            const labels = kinds.map((k) => {
                if (k === 'sensevoice') return 'SenseVoice';
                if (k === 'whisper') return 'Whisper';
                if (k === 'demucs') return 'Demucs';
                return 'GPU';
            });
            setEngineStatusText(`打开手动下载（${labels.join(' + ')}）…`, 'busy');
            appendLog(`手动下载安装：${labels.join('、')}`, 'info');
            const manual = await global.TransubManualWhlInstall.openModal({
                kind: kinds[0],
                kinds,
                formPayload: engineFormPayload(),
            });
            if (manual?.ok) {
                installedOk = true;
                const msg = manual.message || '手动安装完成';
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
                setEngineDownloadProgressVisible(true, msg);
                await refreshEngineModels({ silent: true });
                await refreshEngineGpuStatus({ silent: true });
                await refreshEngineDemucsStatus({ silent: true });
                // Local .whl install finished — do not auto-open HF mirror tabs
                // (same as env-check). Weights can still be fetched via 自动下载.
                return { ok: true, installed: true, message: msg };
            } else if (manual?.cancelled) {
                // User dismissed the dialog — do not open hub pages or another modal.
                setEngineStatusText('已取消手动下载', 'warn');
                return { ok: false, cancelled: true };
            }
        }

        if (hubIds.length) {
            const opened = await openEngineModelHubLinks(hubIds);
            if (opened.ok) {
                appendLog(opened.message, 'info');
                setEngineStatusText(opened.message, 'info');
                return { ok: true, hub: true, installed: installedOk, message: opened.message };
            }
            if (!installedOk) {
                setEngineStatusText(opened.error || '打开模型镜像失败', 'err');
                return { ok: false, error: opened.error };
            }
        }

        return installedOk
            ? { ok: true, installed: true }
            : { ok: false, cancelled: true };
    }

    async function downloadManagedLlmModels(modelIds, { force = false } = {}) {
        const ids = (Array.isArray(modelIds) ? modelIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        if (!ids.length) return { ok: false, error: '未选择模型' };
        if (!electron?.transubAdvancedManagedLlmPull) {
            return { ok: false, error: '当前环境不支持 LLM 模型下载' };
        }
        engineDownloadActiveSource = 'managed';
        engineDownloadLogLines.length = 0;
        if (els.engineDownloadLog) els.engineDownloadLog.textContent = '';
        lastAppEngineDlProgressText = '';
        lastAppEngineDlProgressAt = 0;
        setEngineDownloadBusy(true);
        setEngineDownloadProgressPct(0);
        setEngineDownloadProgressVisible(true, `正在下载 LLM：${ids.join(', ')}`);
        appendEngineDownloadLog(`开始下载 LLM 推理模型：${ids.join(', ')}`);
        appendLog(`开始下载 LLM 模型：${ids.join(', ')}`, 'info');
        setEngineStatusText('正在下载 LLM 模型…', 'busy');
        try {
            for (let i = 0; i < ids.length; i += 1) {
                const id = ids[i];
                const entry = findManagedLlmCatalogEntry(id);
                if (entry && getManagedLlmCatalogApi()?.isProScaleModel?.(entry) && !advancedEntitled) {
                    const err = `「${entry.name || id}」为 Pro 规格模型。解锁 Pro 后可下载。`;
                    setEngineDownloadProgressVisible(true, err);
                    appendEngineDownloadLog(err);
                    appendLog(err, 'err');
                    setEngineStatusText(err, 'err');
                    return { ok: false, error: err, code: 'pro_required' };
                }
                appendEngineDownloadLog(`下载 ${id}（${i + 1}/${ids.length}）…`);
                const res = await electron.transubAdvancedManagedLlmPull({
                    modelId: id,
                    force: !!force,
                });
                if (res?.cancelled || res?.code === 'cancelled') {
                    const msg = res.error || '已取消下载';
                    setEngineDownloadProgressVisible(true, msg);
                    appendEngineDownloadLog(msg);
                    appendLog(msg, 'warn');
                    setEngineStatusText(msg, 'warn');
                    return { ok: false, cancelled: true, error: msg };
                }
                if (!res?.ok) {
                    const err = formatEngineDownloadError(res?.error || `下载 ${id} 失败`);
                    setEngineDownloadProgressVisible(true, err);
                    appendEngineDownloadLog(err);
                    appendLog(err, 'err');
                    setEngineStatusText(err, 'err');
                    setEngineDownloadBusy(false);
                    const proceed = await appConfirm({
                        title: '模型下载失败',
                        message: `${String(err).slice(0, 500)}\n\n是否改为浏览器手动下载 GGUF，并按提示放到模型目录？`,
                        primaryLabel: '手动下载',
                        secondaryLabel: '取消',
                    });
                    if (proceed) {
                        await manualManagedLlmDownload(id);
                    }
                    return res || { ok: false, error: err };
                }
                appendEngineDownloadLog(res.message || `${id} 下载完成`);
            }
            const msg = ids.length === 1
                ? `模型 ${ids[0]} 下载完成`
                : `已下载 ${ids.length} 个 LLM 模型`;
            setEngineDownloadProgressPct(100);
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            appendLog(msg, 'ok');
            setEngineStatusText(msg, 'ok');
            await refreshEngineModels({ silent: true });
            return { ok: true, message: msg };
        } catch (err) {
            const msg = formatEngineDownloadError(err?.message || String(err));
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            appendLog(msg, 'err');
            setEngineStatusText(msg, 'err');
            setEngineDownloadBusy(false);
            const failedId = ids[0] || '';
            if (failedId) {
                const proceed = await appConfirm({
                    title: '模型下载失败',
                    message: `${String(msg).slice(0, 500)}\n\n是否改为浏览器手动下载 GGUF，并按提示放到模型目录？`,
                    primaryLabel: '手动下载',
                    secondaryLabel: '取消',
                });
                if (proceed) {
                    await manualManagedLlmDownload(failedId);
                }
            }
            return { ok: false, error: msg };
        } finally {
            setEngineDownloadBusy(false);
        }
    }

    async function downloadEngineModels(options = {}) {
        if (engineModelsBusy) return;
        const overrideIds = Array.isArray(options.modelIds)
            ? options.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
            : null;
        if (!overrideIds?.length) {
            setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
            return;
        }
        const selected = getEngineDownloadModelMeta(overrideIds);
        if (!selected.length) {
            setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
            return;
        }
        const installedIds = selected.filter((m) => m.installed).map((m) => m.id);
        let modelIds = selected.map((m) => m.id);
        let force = options.force === true;
        if (installedIds.length && options.force !== true && options.force !== false) {
            const preview = installedIds.length <= 3
                ? installedIds.join('、')
                : `${installedIds.slice(0, 3).join('、')} 等 ${installedIds.length} 项`;
            const single = selected.length === 1;
            const redownload = await appConfirm({
                title: single ? '重新下载模型' : '部分模型已安装',
                message: single
                    ? `「${installedIds[0]}」已下载。是否重新下载？`
                    : (
                        `其中 ${installedIds.length} 个已下载（${preview}）。\n\n`
                        + '是否重新下载全部（含已安装）？\n'
                        + '选择「取消」将跳过已安装项，只下载未安装项。'
                    ),
                primaryLabel: '重新下载',
                secondaryLabel: single ? '取消' : '跳过已安装',
            });
            if (redownload) {
                force = true;
            } else if (single) {
                setEngineStatusText('已取消重新下载', 'warn');
                return;
            } else {
                modelIds = selected.filter((m) => !m.installed).map((m) => m.id);
                if (!modelIds.length) {
                    setEngineStatusText('已跳过全部已安装项，没有需要下载的模型', 'warn');
                    return;
                }
            }
        }
        const wantDemucs = modelIds.includes(ENGINE_DEMUCS_MODEL_ID);
        modelIds = modelIds.filter((id) => id !== ENGINE_DEMUCS_MODEL_ID);
        if (wantDemucs && !modelIds.length) {
            await ensureEngineDemucs({ force, silent: false });
            return;
        }
        if (!modelIds.length) {
            setEngineStatusText('请点卡片上的「下载」获取模型', 'warn');
            return;
        }

        const byId = new Map(selected.map((m) => [m.id, m]));
        const managedIds = modelIds.filter((id) => isManagedLlmDownloadId(id, byId.get(id)?.source));
        const engineIds = modelIds.filter((id) => !isManagedLlmDownloadId(id, byId.get(id)?.source));

        // Managed LLM GGUF (non-Sakura) → Advanced pull; Sakura / Hub → engine download.
        if (managedIds.length && !engineIds.length && !wantDemucs) {
            await downloadManagedLlmModels(managedIds, { force });
            return;
        }
        if (managedIds.length && (engineIds.length || wantDemucs)) {
            const managedRes = await downloadManagedLlmModels(managedIds, { force });
            if (!managedRes?.ok) return managedRes;
            if (!engineIds.length && wantDemucs) {
                await ensureEngineDemucs({ force, silent: false });
                return;
            }
            modelIds = engineIds;
        }

        if (!electron?.transubEngineRunDownload) {
            appendLog('当前环境不支持引擎模型下载', 'err');
            setEngineStatusText('当前环境不支持引擎模型下载', 'err');
            return;
        }
        if (!modelIds.length) {
            if (wantDemucs) await ensureEngineDemucs({ force, silent: false });
            return;
        }

        const profile = els.engineProfileSelect?.value || 'balanced';
        const hfEndpoint = els.engineHfEndpointInput?.value.trim() || '';
        const hfToken = els.engineHfTokenInput?.value.trim() || '';
        engineDownloadActiveSource = 'engine';
        engineDownloadLogLines.length = 0;
        if (els.engineDownloadLog) els.engineDownloadLog.textContent = '';
        lastAppEngineDlProgressText = '';
        lastAppEngineDlProgressAt = 0;
        setEngineDownloadBusy(true);
        setEngineDownloadProgressPct(0);
        setEngineDownloadProgressVisible(true, `正在下载：${modelIds.join(', ')}`);
        appendEngineDownloadLog(
            `开始下载（档位 ${profile}${force ? ' · 强制重下' : ''}）：${modelIds.join(', ')}`,
        );
        appendLog(`开始下载模型：${modelIds.join(', ')}`, 'info');
        setEngineStatusText('正在下载模型…', 'busy');
        try {
            const res = await electron.transubEngineRunDownload({
                ...engineFormPayload(),
                kind: 'models',
                profile,
                modelIds,
                hfEndpoint,
                hfToken,
                force,
            });
            if (res?.ok) {
                const msg = res.message || '模型下载完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                appendLog(msg, 'ok');
                setEngineStatusText(msg, 'ok');
                await refreshEngineModels({ silent: true });
                if (wantDemucs) {
                    appendEngineDownloadLog('继续安装 Demucs（人声分离）…');
                    await ensureEngineDemucs({ force, silent: false, assumeBusy: true });
                }
            } else if (res?.cancelled) {
                const msg = res.error || '已取消下载';
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                appendLog(msg, 'warn');
                setEngineStatusText(msg, 'warn');
            } else {
                const err = formatEngineDownloadError(res?.error || '模型下载失败');
                setEngineDownloadProgressVisible(true, err);
                appendEngineDownloadLog(err);
                appendLog(err, 'err');
                setEngineStatusText(err, 'err');
                setEngineDownloadBusy(false);
                const { kinds, hubIds } = classifyManualKindsForModelIds(modelIds);
                const singleHubId = modelIds.length === 1 && hubIds.includes(modelIds[0])
                    ? modelIds[0]
                    : '';
                const proceed = await appConfirm({
                    title: '模型下载失败',
                    message: singleHubId
                        ? `${String(err).slice(0, 500)}\n\n是否改为浏览器手动下载，并按说明放到引擎 models 目录？`
                        : `${String(err).slice(0, 500)}\n\n是否改为手动下载安装（运行库 .whl / 模型镜像）？`,
                    primaryLabel: singleHubId ? '手动下载' : '手动下载安装',
                    secondaryLabel: '取消',
                });
                if (proceed) {
                    if (singleHubId) {
                        await manualEngineHubModelDownload(singleHubId);
                    } else {
                        const manualKinds = kinds.length ? kinds : ['sensevoice', 'whisper'];
                        await manualEngineDownloadInstall({
                            modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                            kinds: manualKinds,
                        });
                    }
                }
                return;
            }
        } catch (err) {
            const msg = formatEngineDownloadError(err?.message || String(err));
            setEngineDownloadProgressVisible(true, msg);
            appendEngineDownloadLog(msg);
            appendLog(msg, 'err');
            setEngineStatusText(msg, 'err');
            setEngineDownloadBusy(false);
            const { hubIds } = classifyManualKindsForModelIds(modelIds);
            const singleHubId = modelIds.length === 1 && hubIds.includes(modelIds[0])
                ? modelIds[0]
                : '';
            const proceed = await appConfirm({
                title: '模型下载失败',
                message: singleHubId
                    ? `${String(msg).slice(0, 500)}\n\n是否改为浏览器手动下载，并按说明放到引擎 models 目录？`
                    : `${String(msg).slice(0, 500)}\n\n是否改为手动下载安装？`,
                primaryLabel: singleHubId ? '手动下载' : '手动下载安装',
                secondaryLabel: '取消',
            });
            if (proceed) {
                if (singleHubId) {
                    await manualEngineHubModelDownload(singleHubId);
                } else {
                    await manualEngineDownloadInstall({
                        modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                    });
                }
            }
            return;
        } finally {
            setEngineDownloadBusy(false);
        }
    }

    function updateEmptyStateUi() {
        const hasItems = state.items.length > 0;
        els.emptyState?.classList.toggle('hidden', hasItems);
        els.listScroll?.classList.toggle('hidden', !hasItems);
        const envVisible = els.envBanner && !els.envBanner.classList.contains('hidden');
        els.emptyStateEnvHint?.classList.toggle('hidden', hasItems || !envVisible);
        if (!hasItems) {
            state.focusedTaskPath = '';
            state.libraryRailMedia = null;
            syncFocusedTaskRowHighlight();
        }
    }

    function syncFocusedTaskRowHighlight() {
        const want = normPath(state.focusedTaskPath);
        els.fileListBody?.querySelectorAll('tr.task-row').forEach((row) => {
            const path = String(row.dataset.path || '');
            row.classList.toggle('is-focused', !!want && path === want);
        });
    }

    function refreshTaskLibraryRail() {
        // Side rail removed: keep row focus highlight only.
        syncFocusedTaskRowHighlight();
    }

    function setFocusedTaskPath(filePath) {
        const next = normPath(filePath);
        if (!next) {
            state.focusedTaskPath = '';
            state.libraryRailMedia = null;
            syncFocusedTaskRowHighlight();
            return;
        }
        state.focusedTaskPath = next;
        syncFocusedTaskRowHighlight();
    }

    function focusTaskFromSelection() {
        const selected = state.items.filter((i) => i.selected);
        if (selected.length === 1) {
            setFocusedTaskPath(selected[0].path);
            return;
        }
        if (state.focusedTaskPath) {
            const still = state.items.some((i) => normPath(i.path) === state.focusedTaskPath);
            if (still) {
                syncFocusedTaskRowHighlight();
                return;
            }
        }
        setFocusedTaskPath('');
    }

    async function openItemInFolder(item) {
        const target = showPathForItem(item);
        if (!target) return;
        const res = await electron?.showInFolder?.(target);
        if (res?.ok === false && res?.error) {
            appendLog(res.error, 'err');
        }
    }

    function openItemEditor(item) {
        if (!item) return;
        const subPath = getSubtitlePathForItem(item);
        if (!subPath) {
            appendLog('该条目尚无字幕可编辑', 'warn');
            return;
        }
        global.TransubSubtitleEditor?.openEditor?.(subPath, item.path || '');
    }

    function retrySingleItem(idx) {
        if (state.running) return;
        const item = state.items[idx];
        if (!item || (item.status !== 'failed' && item.status !== 'error')) return;
        item.status = 'ready';
        item.progress = 0;
        item.processedSec = 0;
        item.processedTotalSec = 0;
        item.detail = '';
        item.error = '';
        item.recovery = null;
        item.selected = true;
        state.items.forEach((it, i) => {
            if (i !== idx) it.selected = false;
        });
        renderList();
        updateStartButton();
        appendLog(`正在重试「${basename(item.path)}」…`, 'info');
        showToast('正在重试本条…', 'ok');
        void startSubtitleGeneration();
    }

    async function resumeSingleItem(idx) {
        if (state.running) return;
        const item = state.items[idx];
        if (!item?.resumable || !item.resumeFromJobId) {
            showToast('没有可恢复的断点', 'warn');
            return;
        }
        if (!electron?.transubEngineResumeJob) {
            showToast('当前环境不支持断点恢复', 'warn');
            return;
        }
        item.status = 'running';
        item.detail = '从断点继续…';
        renderList();
        appendLog(`断点恢复：${basename(item.path)} ← ${item.resumeFromJobId}`, 'info');
        try {
            const res = await electron.transubEngineResumeJob({
                jobId: item.resumeFromJobId,
                mediaPath: item.path,
                options: buildRuntimeOptions(),
            });
            if (!res?.ok) {
                item.status = 'failed';
                item.detail = res?.error || '断点恢复失败';
                item.error = item.detail;
                appendLog(`断点恢复失败：${item.detail}`, 'err');
                showToast(item.detail, 'err');
            } else {
                item.status = 'done';
                item.progress = 100;
                item.detail = '断点恢复完成';
                item.subtitlePath = res.subtitlePath || item.subtitlePath;
                item.sourceSubtitlePath = res.sourceSubtitlePath || item.sourceSubtitlePath;
                item.targetSubtitlePath = res.targetSubtitlePath || item.targetSubtitlePath;
                item.bilingualSubtitlePath = res.bilingualSubtitlePath || item.bilingualSubtitlePath;
                item.resumable = false;
                item.resumeFromJobId = '';
                appendLog(`断点恢复完成：${basename(item.path)}`, 'ok');
                showToast('断点恢复完成', 'ok');
            }
        } catch (err) {
            item.status = 'failed';
            item.detail = err?.message || String(err);
            item.error = item.detail;
            appendLog(`断点恢复异常：${item.detail}`, 'err');
        }
        renderList();
        updateStartButton();
        updateProgressUi();
    }

    async function exportItemDiagnostics(idx) {
        const item = state.items[idx];
        if (!item || !electron?.transubEngineExportDiagnostics) return;
        const res = await electron.transubEngineExportDiagnostics({
            jobId: item.resumeFromJobId || '',
            mediaPath: item.path,
            options: buildRuntimeOptions(),
            logLines: els.logHost?.innerText
                ? String(els.logHost.innerText).split(/\r?\n/).slice(-120)
                : [],
        });
        if (res?.ok) {
            appendLog(`已导出诊断包：${res.dir}`, 'ok');
            showToast(`诊断包：${res.dir}`, 'ok');
        } else {
            showToast(res?.error || '导出失败', 'err');
        }
    }

    function buildListRowHtml(item, idx) {
        if (taskListRowApi.buildListRowHtml) {
            const revealPath = showPathForItem(item);
            const subPath = getSubtitlePathForItem(item);
            const sense = item.sense;
            const profileApi = global.TransubContentProfile;
            const hit = sense?.classification;
            const badge = hit ? (profileApi?.profileBadge?.(hit.profile) || hit.label || '') : '';
            const method = profileApi?.describeAudioMethod?.(sense?.overrides || {}) || null;
            const translateMode = readTranslateModeFromForm();
            const senseMtLabel = profileApi?.describeSenseMtForUi?.(sense?.overrides || {}, {
                task: readTaskFromForm(),
                translateMode,
                smartTranslate: translateMode === 'smart',
            }) || (
                translateMode === 'smart' && readTaskFromForm() !== 'transcribe'
                    ? '智能翻译'
                    : (sense?.overrides?.engineMtModel || '')
            );
            const acousticHint = item.senseAcoustic?.hint && item.senseAcoustic.hint !== 'neutral'
                ? item.senseAcoustic.hint
                : '';
            return taskListRowApi.buildListRowHtml(item, idx, {
                esc,
                basename,
                normPath,
                formatDuration,
                revealPath,
                subPath,
                autoOn: isAutoSenseEnabled(),
                running: !!state.running,
                qcFixing: !!state.qcFixing,
                advancedEntitled: !!advancedEntitled,
                hasSmartQcFix: !!electron?.transubAdvancedQcSmartFix,
                errorExpanded: expandedErrorRows.has(idx),
                elapsed: formatElapsedCell(item),
                processed: formatProcessedCell(item),
                profileBadge: badge,
                methodShort: method?.short || '',
                senseMtLabel,
                acousticHint,
                canPostBatch: getPostBatchPathsForItem(item).length > 0,
            });
        }
        return '';
    }

    function bindListRowEvents(scope) {
        const root = scope || els.fileListBody;
        if (!root) return;
        root.querySelectorAll('[data-row-check]').forEach((cb) => {
            if (cb.dataset.bound === '1') return;
            cb.dataset.bound = '1';
            cb.addEventListener('change', () => {
                const row = cb.closest('tr');
                const idx = Number(row?.dataset.idx);
                if (state.items[idx]) state.items[idx].selected = cb.checked;
                updateStartButton();
                updateAutoSenseUi();
                if (cb.checked && state.items[idx]) {
                    setFocusedTaskPath(state.items[idx].path);
                } else {
                    focusTaskFromSelection();
                }
            });
        });
    }

    function refreshListRowByIndex(idx) {
        if (!els.fileListBody || idx < 0 || idx >= state.items.length) return false;
        const item = state.items[idx];
        const row = els.fileListBody.querySelector(`tr[data-idx="${idx}"]`);
        if (!row) {
            renderList();
            return true;
        }
        const tmp = document.createElement('tbody');
        tmp.innerHTML = buildListRowHtml(item, idx).trim();
        const next = tmp.firstElementChild;
        if (!next) return false;
        row.replaceWith(next);
        bindListRowEvents(next);
        syncFocusedTaskRowHighlight();
        updateQcBanner();
        return true;
    }

    function refreshListRow(item) {
        if (!item) return false;
        const idx = state.items.indexOf(item);
        if (idx < 0) {
            const byPath = state.items.findIndex((it) => normPath(it.path) === normPath(item.path));
            if (byPath < 0) return false;
            return refreshListRowByIndex(byPath);
        }
        return refreshListRowByIndex(idx);
    }

    function renderList() {
        if (!els.fileListBody) return;
        applyListSortInPlace();
        if (!state.items.length) {
            els.fileListBody.innerHTML = '';
            syncTaskTableSortHeaders();
            applyTaskColumnWidths();
            updateEmptyStateUi();
            updateQcBanner();
            updateContentProfileUi();
            updateStartButton();
            return;
        }

        const rows = state.items.map((item, idx) => buildListRowHtml(item, idx));
        els.fileListBody.innerHTML = rows.join('');
        bindListRowEvents(els.fileListBody);
        syncTaskTableSortHeaders();
        applyTaskColumnWidths();
        updateEmptyStateUi();
        updateQcBanner();
        updateStartButton();
        updateContentProfileUi();
        if (state.focusedTaskPath) {
            const still = state.items.some((i) => normPath(i.path) === state.focusedTaskPath);
            if (still) syncFocusedTaskRowHighlight();
            else setFocusedTaskPath('');
        }
    }

    function getSelectedItems() {
        return state.items.filter((i) => i.selected && i.status !== 'error');
    }

    function pathDirname(filePath) {
        return pathUtils.pathDirname
            ? pathUtils.pathDirname(filePath)
            : (() => {
                const p = String(filePath || '');
                const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
                return i >= 0 ? p.slice(0, i) : '';
            })();
    }

    function pathJoin(dir, name) {
        if (pathUtils.pathJoin) return pathUtils.pathJoin(dir, name);
        const d = String(dir || '');
        const n = String(name || '');
        if (!d) return n;
        const sep = d.includes('/') && !d.includes('\\') ? '/' : '\\';
        return d.endsWith('/') || d.endsWith('\\') ? `${d}${n}` : `${d}${sep}${n}`;
    }

    function stemNoExt(filePath) {
        return pathUtils.stemNoExt ? pathUtils.stemNoExt(filePath) : (() => {
            const base = basename(filePath);
            const dot = base.lastIndexOf('.');
            return dot > 0 ? base.slice(0, dot) : base;
        })();
    }

    function primarySubFormatFromForm() {
        if (retranslatePlanApi.primarySubFormatFromList) {
            return retranslatePlanApi.primarySubFormatFromList(readSubFormatsFromForm());
        }
        return 'srt';
    }

    function resolveRetranslateDestPath(item, sourcePath) {
        if (retranslatePlanApi.resolveRetranslateDestPath) {
            return retranslatePlanApi.resolveRetranslateDestPath(item, sourcePath, {
                resolveOutputDir: resolveOutputDirFromForm,
                pathDirname,
                pathJoin,
                stemNoExt,
                normPath,
                subFormats: readSubFormatsFromForm(),
            });
        }
        return String(item?.targetSubtitlePath || item?.subtitlePath || '').trim();
    }

    /**
     * Retranslate source = same-name transcript in the keep dir (`subtitles/`).
     * Match by video basename stem only (e.g. SQTE-704.mp4 → SQTE-704.src.srt).
     */
    async function resolveTranscriptSourceForItem(item) {
        const videoPath = String(item?.path || '').trim();
        if (!videoPath || !electron?.transubFindKeptTranscript) {
            return { ok: false, found: false };
        }
        try {
            const kept = await electron.transubFindKeptTranscript({ videoPath });
            if (!(kept?.ok && kept.found && kept.path)) {
                return {
                    ok: false,
                    found: false,
                    dir: kept?.dir || '',
                    stem: kept?.stem || stemNoExt(videoPath),
                };
            }
            const doc = await electron?.transubReadSubtitle?.({ path: kept.path });
            if (doc?.ok && Array.isArray(doc.cues) && doc.cues.some((c) => String(c?.text || '').trim())) {
                return {
                    ok: true,
                    path: kept.path,
                    kind: 'kept',
                    cues: doc.cues,
                    format: doc.format,
                    daysLeft: kept.daysLeft,
                    dir: kept.dir,
                    stem: kept.stem,
                };
            }
            return {
                ok: false,
                found: false,
                path: kept.path,
                dir: kept.dir,
                stem: kept.stem,
                error: doc?.error || '转录字幕为空或无法读取',
            };
        } catch (err) {
            return { ok: false, found: false, error: err?.message || String(err) };
        }
    }

    function readRetranslateModeFromModal() {
        if (els.retranslateModeSmart?.checked) return 'smart';
        if (els.retranslateModeEngine?.checked) return 'engine';
        return 'llm';
    }

    /** @type {{ catalog: Array, smartTranslateModelId: string, llmSource: string }|null} */
    let cachedSmartTranslatePick = null;

    function isSmartTranslateCapableModel(item) {
        if (retranslatePlanApi.isSmartTranslateCapableModel) {
            return retranslatePlanApi.isSmartTranslateCapableModel(item, getManagedLlmCatalogApi());
        }
        return !!item?.id && !item.translateOnly;
    }

    async function ensureSmartTranslatePickCache({ force = false } = {}) {
        if (!force && cachedSmartTranslatePick) return cachedSmartTranslatePick;
        try {
            const res = await electron?.transubAdvancedManagedLlmStatus?.();
            const managed = res?.managed || null;
            cachedSmartTranslatePick = {
                catalog: Array.isArray(managed?.catalog) ? managed.catalog : [],
                smartTranslateModelId: String(
                    managed?.smartTranslateModelId
                    || managed?.smartTranslateModel?.id
                    || managed?.activeModelId
                    || '',
                ).trim(),
                llmSource: String(managed?.llmSource || res?.status?.llmSource || '').trim(),
            };
        } catch {
            cachedSmartTranslatePick = { catalog: [], smartTranslateModelId: '', llmSource: '' };
        }
        return cachedSmartTranslatePick;
    }

    function readRetranslateSmartHybrid() {
        return els.retranslateSmartHybridCheck?.checked !== false;
    }

    function readRetranslateSmartPolish() {
        return els.retranslateSmartPolishCheck?.checked !== false;
    }

    function seedRetranslateSmartOptionsFromSettings() {
        if (els.retranslateSmartHybridCheck) {
            els.retranslateSmartHybridCheck.checked = els.smartTranslateHybridCheck
                ? els.smartTranslateHybridCheck.checked !== false
                : true;
        }
        if (els.retranslateSmartPolishCheck) {
            els.retranslateSmartPolishCheck.checked = els.smartTranslatePolishCheck
                ? els.smartTranslatePolishCheck.checked !== false
                : true;
        }
    }

    function fillRetranslateSmartModelSelect(pick, { allowEmpty = false } = {}) {
        const selectEl = els.retranslateModelSelect;
        if (!selectEl) return;
        const catalog = retranslatePlanApi.filterSmartTranslateCatalog
            ? retranslatePlanApi.filterSmartTranslateCatalog(pick?.catalog, getManagedLlmCatalogApi())
            : (Array.isArray(pick?.catalog) ? pick.catalog : [])
                .filter((item) => item?.installed && isSmartTranslateCapableModel(item));
        const want = String(pick?.smartTranslateModelId || '').trim();
        const opts = [];
        if (allowEmpty) {
            opts.push('<option value="">自动（设置 / 已下载优先）</option>');
        }
        if (!catalog.length && !allowEmpty) {
            opts.push('<option value="">（暂无已下载的智能翻译模型）</option>');
        } else {
            for (const item of catalog) {
                const id = String(item.id || '');
                if (!id) continue;
                const bits = [];
                if (item.proScale) bits.push('Pro');
                if (item.paramBillion) bits.push(`${item.paramBillion}B`);
                const label = bits.length
                    ? `${item.name || id}（${bits.join(' · ')}）`
                    : (item.name || id);
                const sel = !allowEmpty && id === want ? ' selected' : '';
                opts.push(`<option value="${esc(id)}"${sel}>${esc(label)}</option>`);
            }
            if (want && !catalog.some((m) => String(m.id) === want)) {
                opts.push(`<option value="${esc(want)}">${esc(want)}（未下载或不可用于智能翻译）</option>`);
            }
        }
        selectEl.innerHTML = opts.join('');
        if (want && [...selectEl.options].some((o) => o.value === want)) {
            selectEl.value = want;
        } else if (allowEmpty) {
            selectEl.value = '';
        } else if (catalog[0]?.id) {
            selectEl.value = catalog[0].id;
        } else {
            selectEl.value = '';
        }
    }

    function fillRetranslateHybridMtSelect() {
        const selectEl = els.retranslateHybridMtSelect;
        if (!selectEl) return;
        const prefer = String(
            selectEl.value
            || els.engineLlmMtModelSelect?.value
            || readLlmMtModelFromForm()
            || '',
        ).trim();
        fillEngineModelSelect(selectEl, cachedEngineModels, 'mt', prefer, {
            allowEmpty: true,
            emptyLabel: '自动匹配（按语言 / Pro / 硬件）',
            modelFilter: (m) => isLlmInferencePickModelId(m.id),
        });
    }

    function syncRetranslateModalModelUi() {
        const mode = readRetranslateModeFromModal();
        const smartLocked = !advancedEntitled;
        if (els.retranslateModeSmartWrap) {
            els.retranslateModeSmartWrap.classList.toggle('is-disabled', smartLocked);
            if (els.retranslateModeSmart) els.retranslateModeSmart.disabled = smartLocked;
        }
        els.retranslateSmartOptions?.classList.add('hidden');
        els.retranslateHybridMtWrap?.classList.add('hidden');
        if (mode === 'smart') {
            const hybridOn = readRetranslateSmartHybrid();
            const polishOn = readRetranslateSmartPolish();
            const ui = retranslatePlanApi.buildRetranslateSmartUiState
                ? retranslatePlanApi.buildRetranslateSmartUiState({
                    hybridOn,
                    polishOn,
                    smartLocked,
                })
                : {
                    showSmartOptions: !smartLocked,
                    showHybridMt: !smartLocked && hybridOn,
                    showDialogModel: !smartLocked && (!hybridOn || polishOn),
                    dialogLabel: '智能翻译模型',
                    schemeHint: '',
                    modelHint: smartLocked
                        ? '智能翻译为 Pro 专属，请先激活 Pro。'
                        : '',
                    allowEmptyDialog: hybridOn,
                };
            if (ui.showSmartOptions) {
                els.retranslateSmartOptions?.classList.remove('hidden');
            }
            if (els.retranslateSmartSchemeHint && ui.schemeHint) {
                els.retranslateSmartSchemeHint.textContent = ui.schemeHint;
            }
            if (ui.showHybridMt) {
                els.retranslateHybridMtWrap?.classList.remove('hidden');
                const fillHybrid = () => {
                    if (readRetranslateModeFromModal() !== 'smart') return;
                    fillRetranslateHybridMtSelect();
                };
                if (!cachedEngineModels.length) {
                    void refreshEngineModels({ silent: true }).then(fillHybrid);
                } else {
                    fillHybrid();
                }
            }
            if (ui.showDialogModel) {
                els.retranslateModelWrap?.classList.remove('hidden');
                if (els.retranslateModelLabel) {
                    els.retranslateModelLabel.textContent = ui.dialogLabel || '智能翻译模型';
                }
                void ensureSmartTranslatePickCache().then((pick) => {
                    if (readRetranslateModeFromModal() !== 'smart') return;
                    fillRetranslateSmartModelSelect(pick, {
                        allowEmpty: !!ui.allowEmptyDialog,
                    });
                });
            } else {
                els.retranslateModelWrap?.classList.add('hidden');
            }
            if (els.retranslateModelHint) {
                els.retranslateModelHint.textContent = ui.modelHint || '';
            }
            return;
        }
        els.retranslateModelWrap?.classList.remove('hidden');
        if (els.retranslateModelLabel) {
            els.retranslateModelLabel.textContent = mode === 'engine' ? '机器翻译模型' : '推理翻译模型';
        }
        if (!cachedEngineModels.length) {
            void refreshEngineModels({ silent: true }).then(() => fillRetranslateModelSelect(mode));
        } else {
            fillRetranslateModelSelect(mode);
        }
        if (els.retranslateModelHint) {
            els.retranslateModelHint.textContent = mode === 'engine'
                ? '引擎 Opus 机器翻译；可留空按片源语言自动选择。'
                : '本地 LLM 推理翻译（如 Sakura）。仅列出已下载项。';
        }
    }

    function fillRetranslateModelSelect(mode) {
        const selectEl = els.retranslateModelSelect;
        if (!selectEl) return;
        if (mode === 'smart') {
            const allowEmpty = readRetranslateSmartHybrid();
            void ensureSmartTranslatePickCache().then((pick) => {
                fillRetranslateSmartModelSelect(pick, { allowEmpty });
            });
            return;
        }
        if (mode === 'engine') {
            const cur = String(els.engineMtModelSelect?.value || '').trim();
            fillEngineModelSelect(selectEl, cachedEngineModels, 'mt', cur, {
                allowEmpty: true,
                emptyLabel: '自动（按源语言 · Opus）',
                modelFilter: (m) => !isLlmInferencePickModelId(m.id),
            });
            return;
        }
        const cur = String(els.engineLlmMtModelSelect?.value || readLlmMtModelFromForm() || 'sakura-1.5b').trim();
        fillEngineModelSelect(selectEl, cachedEngineModels, 'mt', cur, {
            allowEmpty: false,
            modelFilter: (m) => isLlmInferencePickModelId(m.id),
        });
    }

    function closeRetranslateModal() {
        els.retranslateModal?.classList.add('hidden');
        els.retranslateModal?.classList.remove('flex');
        state.retranslatePlan = null;
    }

    async function openRetranslateModal() {
        if (state.running || state.postBatchBusy || state.retranslateBusy) {
            showToast('当前有任务进行中', 'warn');
            return;
        }
        const selected = getSelectedItems();
        if (!selected.length) {
            appendLog('请先勾选要重新翻译的条目', 'warn');
            showToast('请先勾选要重新翻译的条目', 'warn');
            return;
        }
        setLoading(true, '正在检查转录字幕…');
        const ready = [];
        const missing = [];
        try {
            for (const item of selected) {
                const src = await resolveTranscriptSourceForItem(item);
                if (src?.ok && src.path) {
                    ready.push({
                        item,
                        sourcePath: src.path,
                        destPath: resolveRetranslateDestPath(item, src.path),
                        sourceKind: src.kind || 'source',
                        cues: src.cues,
                        format: src.format || 'srt',
                    });
                } else {
                    missing.push(item);
                }
            }
        } finally {
            setLoading(false);
        }
        if (!ready.length) {
            const names = missing.slice(0, 4).map((i) => basename(i.path)).join('、');
            const more = missing.length > 4 ? ` 等 ${missing.length} 项` : '';
            await appConfirm({
                title: '无可用转录字幕',
                message: `勾选的 ${selected.length} 项均未在「转录字幕」目录找到与影片同名的原文（如 SQTE-704.mp4 → SQTE-704.src.srt）。\n\n${names}${more}\n\n请先完成一次听写/翻译并开启「保存转录字幕」，或将同名转录字幕放入该目录。`,
                primaryLabel: '知道了',
                hideSecondary: true,
            });
            return;
        }
        state.retranslatePlan = ready;
        if (els.retranslateModalSummary) {
            els.retranslateModalSummary.textContent = `将对 ${ready.length} 项使用已有转录字幕重新翻译（跳过语音识别）。`;
        }
        if (els.retranslateModalMissing) {
            if (missing.length) {
                const names = missing.slice(0, 6).map((i) => basename(i.path)).join('、');
                const more = missing.length > 6 ? ` 等 ${missing.length} 项` : '';
                els.retranslateModalMissing.textContent = `将跳过无转录字幕的 ${missing.length} 项：${names}${more}`;
                els.retranslateModalMissing.classList.remove('hidden');
            } else {
                els.retranslateModalMissing.textContent = '';
                els.retranslateModalMissing.classList.add('hidden');
            }
        }
        const mode = readTranslateModeFromForm();
        if (els.retranslateModeEngine) els.retranslateModeEngine.checked = mode === 'engine';
        if (els.retranslateModeLlm) els.retranslateModeLlm.checked = mode === 'llm';
        if (els.retranslateModeSmart) {
            els.retranslateModeSmart.checked = mode === 'smart' && advancedEntitled;
            if (mode === 'smart' && !advancedEntitled && els.retranslateModeLlm) {
                els.retranslateModeLlm.checked = true;
            }
        }
        seedRetranslateSmartOptionsFromSettings();
        cachedSmartTranslatePick = null;
        syncRetranslateModalModelUi();
        els.retranslateModal?.classList.remove('hidden');
        els.retranslateModal?.classList.add('flex');
        try { document.body.appendChild(els.retranslateModal); } catch { /* ignore */ }
        setTimeout(() => {
            try { els.retranslateConfirmBtn?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
        }, 80);
    }

    /**
     * Open retranslate flow from subtitle library (explicit source path + recipe hints).
     * @param {{ mediaPath: string, sourcePath: string, destPath?: string, hints?: object, recipeSummary?: string }} payload
     */
    async function openLibraryRetranslate(payload = {}) {
        if (state.running || state.postBatchBusy || state.retranslateBusy) {
            showToast('当前有任务进行中', 'warn');
            return { ok: false, error: 'busy' };
        }
        const mediaPath = String(payload.mediaPath || '').trim();
        const sourcePath = String(payload.sourcePath || payload.keptPath || '').trim();
        if (!mediaPath || !sourcePath) {
            showToast('缺少视频或原文路径', 'warn');
            return { ok: false, error: 'missing_paths' };
        }
        if (!findItem(mediaPath)) {
            await addFiles([mediaPath], { withLoading: true });
        }
        const item = findItem(mediaPath);
        if (!item) {
            showToast('无法将视频加入列表', 'err');
            return { ok: false, error: 'add_failed' };
        }
        // Select only this item for clarity
        for (const it of state.items) it.selected = it.path === item.path;
        renderList();

        const preferredSource = String(payload.keptPath || sourcePath).trim() || sourcePath;
        let doc = await electron?.transubReadSubtitle?.({ path: preferredSource });
        let usePath = preferredSource;
        if (!(doc?.ok && Array.isArray(doc.cues) && doc.cues.some((c) => String(c?.text || '').trim()))) {
            if (preferredSource !== sourcePath) {
                doc = await electron?.transubReadSubtitle?.({ path: sourcePath });
                usePath = sourcePath;
            }
        }
        if (!(doc?.ok && Array.isArray(doc.cues) && doc.cues.some((c) => String(c?.text || '').trim()))) {
            showToast(doc?.error || '无法读取原文字幕', 'err');
            return { ok: false, error: 'read_failed' };
        }
        const destPath = String(payload.destPath || '').trim()
            || resolveRetranslateDestPath(item, usePath);

        state.retranslatePlan = [{
            item,
            sourcePath: usePath,
            destPath,
            sourceKind: 'library',
            cues: doc.cues,
            format: doc.format || 'srt',
            libraryVersionId: payload.sourceVersionId || '',
            librarySeedVersionId: payload.seedVersionId || '',
            libraryRecipe: payload.recipe || null,
        }];

        const hints = payload.hints && typeof payload.hints === 'object' ? payload.hints : {};
        let mode = String(hints.mode || '').trim();
        if (mode === 'smart' && !advancedEntitled) mode = 'llm';
        if (!['engine', 'llm', 'smart'].includes(mode)) mode = 'llm';
        if (els.retranslateModeEngine) els.retranslateModeEngine.checked = mode === 'engine';
        if (els.retranslateModeLlm) els.retranslateModeLlm.checked = mode === 'llm';
        if (els.retranslateModeSmart) els.retranslateModeSmart.checked = mode === 'smart';

        seedRetranslateSmartOptionsFromSettings();
        if (hints.smartTranslateHybridMt != null && els.retranslateSmartHybridCheck) {
            els.retranslateSmartHybridCheck.checked = !!hints.smartTranslateHybridMt;
        }
        if (hints.smartTranslatePlotPolish != null && els.retranslateSmartPolishCheck) {
            els.retranslateSmartPolishCheck.checked = !!hints.smartTranslatePlotPolish;
        }

        cachedSmartTranslatePick = null;
        syncRetranslateModalModelUi();
        try {
            if (mode === 'smart') {
                const pick = await ensureSmartTranslatePickCache({ force: true });
                fillRetranslateSmartModelSelect(pick, {
                    allowEmpty: readRetranslateSmartHybrid(),
                });
                if (readRetranslateSmartHybrid()) {
                    if (!cachedEngineModels.length) {
                        await refreshEngineModels({ silent: true });
                    }
                    fillRetranslateHybridMtSelect();
                    const hybridId = String(hints.hybridMtModelId || hints.engineLlmMtModel || '').trim();
                    if (hybridId && els.retranslateHybridMtSelect) {
                        const has = [...els.retranslateHybridMtSelect.options]
                            .some((o) => o.value === hybridId);
                        if (has) els.retranslateHybridMtSelect.value = hybridId;
                    }
                }
            } else {
                if (!cachedEngineModels.length) {
                    await refreshEngineModels({ silent: true });
                }
                fillRetranslateModelSelect(mode);
            }
        } catch { /* ignore model fill errors */ }

        const modelId = String(hints.modelId || '').trim();
        if (modelId && els.retranslateModelSelect) {
            const has = [...els.retranslateModelSelect.options].some((o) => o.value === modelId);
            if (has) els.retranslateModelSelect.value = modelId;
        }

        const summary = payload.recipeSummary || hints.recipeSummary || '';
        if (els.retranslateModalSummary) {
            els.retranslateModalSummary.textContent = summary
                ? `字幕库配方再跑：${basename(mediaPath)}\n${summary}`
                : `字幕库原文再跑：${basename(mediaPath)}（跳过语音识别）`;
        }
        if (els.retranslateModalMissing) {
            els.retranslateModalMissing.textContent = '';
            els.retranslateModalMissing.classList.add('hidden');
        }

        els.retranslateModal?.classList.remove('hidden');
        els.retranslateModal?.classList.add('flex');
        try { document.body.appendChild(els.retranslateModal); } catch { /* ignore */ }
        appendLog(`已从字幕库准备再跑：${basename(mediaPath)}`, 'ok');
        return { ok: true };
    }

    async function runRetranslateFromModal() {
        const plan = Array.isArray(state.retranslatePlan) ? state.retranslatePlan.slice() : [];
        if (!plan.length) {
            showToast('没有可翻译的条目', 'warn');
            return;
        }
        const mode = readRetranslateModeFromModal();
        if (mode === 'smart' && !advancedEntitled) {
            void promptProUnlockRequired({ featureLabel: '智能翻译' });
            return;
        }
        const hybridOn = mode === 'smart' && readRetranslateSmartHybrid();
        const polishOn = mode === 'smart' && readRetranslateSmartPolish();
        const smartUi = mode === 'smart' && retranslatePlanApi.buildRetranslateSmartUiState
            ? retranslatePlanApi.buildRetranslateSmartUiState({ hybridOn, polishOn })
            : null;
        const showDialogModel = mode !== 'smart' || (smartUi ? smartUi.showDialogModel : true);
        const modelId = showDialogModel
            ? String(els.retranslateModelSelect?.value || '').trim()
            : '';
        const hybridMtModelId = hybridOn
            ? String(els.retranslateHybridMtSelect?.value || '').trim()
            : '';
        if (mode === 'llm' && !modelId) {
            showToast('请选择推理翻译模型', 'warn');
            return;
        }
        if (mode === 'smart') {
            if (smartUi?.requireDialogModel && !modelId) {
                showToast('请选择已下载的智能翻译模型（设置 → Pro → 大模型）', 'warn');
                return;
            }
            if (modelId) {
                const catalogApi = getManagedLlmCatalogApi();
                const block = catalogApi?.getSmartTranslateModelBlock?.(modelId);
                if (block?.ok === false) {
                    showToast(block.error || '所选模型不可用于智能翻译', 'warn');
                    return;
                }
            }
        }
        closeRetranslateModal();

        const language = String(els.quickLanguageSelect?.value || els.languageSelect?.value || 'ja').trim() || 'ja';
        const chineseSubtitleVariant = String(
            els.quickTargetLangSelect?.value
            || els.chineseSubtitleVariantSelect?.value
            || 'simplified',
        ).trim() || 'simplified';
        const faithfulTone = !!els.smartTranslateFaithfulCheck?.checked;

        state.retranslateBusy = true;
        state.retranslateAbort = false;
        updateStartButton();
        setBadge('重新翻译', 'running');
        ensureLogExpanded();
        activateInferLogTab();
        const modeLabel = mode === 'smart' ? '智能翻译' : (mode === 'engine' ? '机器翻译' : '推理翻译');
        const smartBits = [];
        if (mode === 'smart') {
            if (hybridOn) smartBits.push(hybridMtModelId ? `句级 ${hybridMtModelId}` : '句级自动');
            if (polishOn) smartBits.push(modelId ? `润色 ${modelId}` : '润色自动');
            else if (!hybridOn && modelId) smartBits.push(modelId);
        } else if (modelId) {
            smartBits.push(modelId);
        }
        appendRetranslateLog(
            `开始重新翻译 ${plan.length} 项（${modeLabel}${smartBits.length ? ` · ${smartBits.join(' · ')}` : ''}）…`,
            'info',
        );

        let okCount = 0;
        let failCount = 0;
        let skipCount = 0;
        let aborted = false;
        let activeIndex = 0;
        let activeName = '';
        let activePath = '';
        let lastProgressLogAt = 0;
        let lastProgressLogKey = '';
        const startedAt = Date.now();

        const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
        const setRetranslateProgress = ({
            index = activeIndex,
            itemPct = 0,
            detail = '',
            name = activeName,
            path = activePath,
            log = false,
        } = {}) => {
            const pctInfo = retranslatePlanApi.computeRetranslateOverallPct
                ? retranslatePlanApi.computeRetranslateOverallPct({
                    index,
                    itemPct,
                    total: plan.length,
                })
                : (() => {
                    const total = Math.max(1, plan.length);
                    const idx = Math.max(0, Math.min(total - 1, Number(index) || 0));
                    const within = Math.max(0, Math.min(1, (Number(itemPct) || 0) / 100));
                    const overall = Math.max(0, Math.min(100, Math.round(((idx + within) / total) * 100)));
                    const displayOverall = overall >= 100 && idx < total - 1 ? 99 : Math.min(99, overall);
                    return { displayOverall, index: idx, total };
                })();
            const total = pctInfo.total;
            const idx = pctInfo.index;
            const displayOverall = pctInfo.displayOverall;
            const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

            const labelDetail = String(detail || '').trim();
            if (els.progressBar) els.progressBar.style.width = `${displayOverall}%`;
            if (els.progressLabel) {
                els.progressLabel.textContent = labelDetail
                    ? `重新翻译 ${idx + 1}/${total}：${labelDetail}`
                    : `重新翻译 ${idx + 1}/${total}${name ? `：${name}` : ''}`;
            }
            if (els.progressCount) {
                els.progressCount.textContent = `${idx + 1} / ${total} · ${displayOverall}%`;
            }
            if (els.currentFile && (name || path)) {
                els.currentFile.textContent = `${name || basename(path)}（${idx + 1}/${total}）`;
                els.currentFile.title = path || name || '';
            }
            if (path) {
                updateItem(path, {
                    status: 'running',
                    progress: clampPct(itemPct),
                    detail: labelDetail || '重新翻译中…',
                });
            }
            if (log && labelDetail) {
                const key = `${idx}|${labelDetail}`;
                const now = Date.now();
                if (key !== lastProgressLogKey && now - lastProgressLogAt >= 1200) {
                    lastProgressLogKey = key;
                    lastProgressLogAt = now;
                    appendRetranslateLog(`· ${name || basename(path) || '条目'} · ${labelDetail}`, 'info');
                }
            }
        };

        const onTranslateProgress = (info) => {
            if (!info || !state.retranslateBusy) return;
            const pctRaw = Number(info.pct ?? info.percent);
            let itemPct = Number.isFinite(pctRaw) ? pctRaw : 0;
            if (!Number.isFinite(pctRaw) && info.chunk && info.total) {
                itemPct = (Number(info.chunk) / Math.max(1, Number(info.total))) * 90;
            }
            // Leave headroom for write-back (≈90–100).
            itemPct = Math.min(92, Math.max(4, itemPct || 8));
            const phase = String(info.phase || '').trim();
            let detail = String(info.message || info.detail || '').trim();
            if (!detail) {
                if (phase === 'brief' || phase === 'brief-done') detail = '理解全文…';
                else if (phase === 'consistency') detail = '一致性校对…';
                else if (info.chunk && info.total) detail = `翻译分块 ${info.chunk}/${info.total}`;
                else if (phase === 'chunk' || phase === 'chunk-done' || phase === 'chunk-retry') {
                    detail = phase === 'chunk-retry' ? '分块重试中…' : '分块翻译中…';
                } else if (phase === 'start') detail = '启动翻译引擎…';
                else if (phase === 'done') detail = '翻译完成，准备写回…';
                else detail = '翻译中…';
            }
            setRetranslateProgress({
                index: activeIndex,
                itemPct,
                detail,
                name: activeName,
                path: activePath,
                log: true,
            });
        };

        const unsubs = [];
        if (mode === 'engine' && electron?.onEngineTranslateProgress) {
            unsubs.push(electron.onEngineTranslateProgress(onTranslateProgress));
        } else if (mode === 'smart' && electron?.onAdvancedReconstructProgress) {
            unsubs.push(electron.onAdvancedReconstructProgress(onTranslateProgress));
        } else if (mode === 'llm' && electron?.onSakuraTranslateProgress) {
            unsubs.push(electron.onSakuraTranslateProgress(onTranslateProgress));
        }

        setRetranslateProgress({
            index: 0,
            itemPct: 0,
            detail: '准备中…',
        });
        if (els.progressBar) els.progressBar.style.width = '0%';
        if (els.progressCount) els.progressCount.textContent = `0 / ${plan.length}`;

        try {
            for (let i = 0; i < plan.length; i += 1) {
                if (state.retranslateAbort) {
                    aborted = true;
                    break;
                }
                const row = plan[i];
                const item = row.item;
                const name = basename(item.path);
                activeIndex = i;
                activeName = name;
                activePath = item.path;
                lastProgressLogKey = '';

                updateItem(item.path, {
                    status: 'running',
                    progress: 0,
                    detail: '准备重新翻译…',
                    startedAt: Date.now(),
                });
                setRetranslateProgress({
                    index: i,
                    itemPct: 2,
                    detail: '读取转录字幕…',
                    name,
                    path: item.path,
                });
                appendRetranslateLog(
                    `重新翻译 ${i + 1}/${plan.length}：${name} ← ${basename(row.sourcePath)}`
                    + `（${modeLabel}${modelId ? ` · ${modelId}` : ''}）`,
                    'info',
                );

                let cues = row.cues;
                if (!Array.isArray(cues) || !cues.length) {
                    const doc = await electron?.transubReadSubtitle?.({ path: row.sourcePath });
                    if (!doc?.ok || !doc.cues?.length) {
                        failCount += 1;
                        updateItem(item.path, {
                            status: 'failed',
                            progress: 0,
                            detail: doc?.error || '读取转录字幕失败',
                            completedAt: Date.now(),
                        });
                        appendRetranslateLog(`失败：${name} — 无法读取转录字幕`, 'err');
                        setRetranslateProgress({
                            index: i,
                            itemPct: 100,
                            detail: '读取失败',
                            name,
                            path: item.path,
                        });
                        continue;
                    }
                    cues = doc.cues;
                    row.format = doc.format || row.format;
                }

                const payloadCues = cues.map((c, idx) => ({
                    index: Number.isInteger(Number(c.index)) ? Number(c.index) : idx,
                    startMs: c.startMs,
                    endMs: c.endMs,
                    text: String(c.text || ''),
                })).filter((c) => String(c.text || '').trim());

                if (!payloadCues.length) {
                    skipCount += 1;
                    updateItem(item.path, {
                        status: 'skipped',
                        progress: 100,
                        detail: '转录字幕为空',
                        completedAt: Date.now(),
                    });
                    appendRetranslateLog(`跳过：${name} — 转录字幕为空`, 'warn');
                    setRetranslateProgress({
                        index: i,
                        itemPct: 100,
                        detail: '已跳过（空字幕）',
                        name,
                        path: item.path,
                    });
                    continue;
                }

                appendRetranslateLog(`· ${name} · 共 ${payloadCues.length} 条，开始${modeLabel}…`, 'info');
                setRetranslateProgress({
                    index: i,
                    itemPct: 8,
                    detail: `翻译中（${payloadCues.length} 条）…`,
                    name,
                    path: item.path,
                });

                let translated;
                if (mode === 'smart') {
                    translated = await electron?.transubAdvancedSmartTranslate?.({
                        cues: payloadCues,
                        chineseSubtitleVariant,
                        targetLanguage: chineseSubtitleVariant,
                        smartTranslateFaithfulTone: faithfulTone,
                        faithfulTone,
                        smartTranslateHybridMt: hybridOn,
                        smartTranslatePlotPolish: polishOn,
                        engineLlmMtModel: hybridMtModelId || undefined,
                        hybridMtModelId: hybridMtModelId || undefined,
                        language,
                        modelId: modelId || undefined,
                        smartTranslateModelId: modelId || undefined,
                        fileName: name,
                        sourcePath: row.sourcePath,
                        path: row.sourcePath,
                        mediaPath: item.path,
                        videoPath: item.path,
                    });
                } else if (mode === 'engine') {
                    translated = await electron?.transubEngineTranslateCues?.({
                        cues: payloadCues,
                        language,
                        mtModel: modelId || undefined,
                        options: {
                            language,
                            engineMtModel: modelId || undefined,
                            engineOpusMtModel: modelId || undefined,
                        },
                    });
                } else {
                    translated = await electron?.transubSakuraTranslate?.({
                        cues: payloadCues,
                        modelId,
                        faithfulTone,
                        smartTranslateFaithfulTone: faithfulTone,
                        sakuraNsfwPrompt: faithfulTone || undefined,
                        applyNsfwLexicon: faithfulTone || undefined,
                        contentProfile: item.sense?.classification?.profile || undefined,
                        fileName: name,
                        sourcePath: row.sourcePath,
                    });
                }

                if (state.retranslateAbort || translated?.cancelled) {
                    aborted = true;
                    updateItem(item.path, {
                        status: 'cancelled',
                        detail: '已取消',
                        completedAt: Date.now(),
                    });
                    appendRetranslateLog(`已取消：${name}`, 'warn');
                    break;
                }
                if (!translated?.ok) {
                    failCount += 1;
                    const err = translated?.error || '翻译失败';
                    updateItem(item.path, {
                        status: 'failed',
                        detail: err,
                        completedAt: Date.now(),
                    });
                    appendRetranslateLog(`失败：${name} — ${err}`, 'err');
                    setRetranslateProgress({
                        index: i,
                        itemPct: 100,
                        detail: '翻译失败',
                        name,
                        path: item.path,
                    });
                    continue;
                }

                setRetranslateProgress({
                    index: i,
                    itemPct: 94,
                    detail: '写回译文…',
                    name,
                    path: item.path,
                });
                appendRetranslateLog(`· ${name} · 写回 ${basename(row.destPath)}…`, 'info');

                const map = new Map(
                    (translated.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]),
                );
                const nextCues = cues.map((c, idx) => {
                    const index = Number.isInteger(Number(c.index)) ? Number(c.index) : idx;
                    if (!map.has(index)) return { ...c };
                    return { ...c, text: map.get(index) };
                });
                const written = await electron?.transubWriteSubtitle?.({
                    path: row.destPath,
                    format: row.format || primarySubFormatFromForm(),
                    cues: nextCues,
                    videoPath: item.path,
                    ...(row.sourceKind === 'library' ? {
                        librarySource: 'retranslate',
                        libraryNote: '对照B',
                        libraryTags: ['对照B', 'rerun'],
                        librarySourceVersionId: row.libraryVersionId || '',
                        libraryParentVersionId: row.librarySeedVersionId || '',
                        libraryRecipe: row.libraryRecipe || null,
                    } : {}),
                });
                if (!written?.ok) {
                    failCount += 1;
                    const err = written?.error || '写入译文失败';
                    updateItem(item.path, {
                        status: 'failed',
                        detail: err,
                        completedAt: Date.now(),
                    });
                    appendRetranslateLog(`失败：${name} — ${err}`, 'err');
                    continue;
                }

                okCount += 1;
                updateItem(item.path, {
                    status: 'done',
                    progress: 100,
                    detail: '重新翻译完成',
                    selected: false,
                    subtitlePath: row.destPath,
                    existingSubtitle: row.destPath,
                    targetSubtitlePath: row.destPath,
                    sourceSubtitlePath: row.sourceKind === 'kept'
                        ? (item.sourceSubtitlePath || undefined)
                        : row.sourcePath,
                    completedAt: Date.now(),
                });
                setRetranslateProgress({
                    index: i,
                    itemPct: 100,
                    detail: '本条完成',
                    name,
                    path: item.path,
                });
                const via = translated.summary || translated.message || `${map.size} 条`;
                appendRetranslateLog(`完成：${name} → ${basename(row.destPath)}（${via}）`, 'ok');
            }
        } finally {
            for (const off of unsubs) {
                try { if (typeof off === 'function') off(); } catch { /* ignore */ }
            }
            state.retranslateBusy = false;
            state.retranslateAbort = false;
            state.retranslatePlan = null;
            updateStartButton();
            if (els.progressBar) els.progressBar.style.width = '100%';
            const elapsed = formatDuration(elapsedSecSince(startedAt));
            const summary = aborted
                ? `重新翻译已停止：成功 ${okCount}`
                    + (failCount ? ` · 失败 ${failCount}` : '')
                    + ` · 用时 ${elapsed}`
                : `重新翻译结束：成功 ${okCount}`
                    + (failCount ? ` · 失败 ${failCount}` : '')
                    + (skipCount ? ` · 跳过 ${skipCount}` : '')
                    + ` · 用时 ${elapsed}`;
            if (els.progressLabel) els.progressLabel.textContent = summary;
            if (els.progressCount) {
                els.progressCount.textContent = `${okCount + failCount + skipCount} / ${plan.length}`;
            }
            appendRetranslateLog(summary, aborted || failCount ? 'warn' : 'ok', { toast: false });
            setBadge(
                aborted ? '已停止' : (failCount ? '部分失败' : '已完成'),
                aborted || failCount ? 'error' : 'done',
            );
            showToast(summary, aborted || failCount ? 'warn' : 'ok');
            renderList();
        }
    }

    /**
     * Open subtitle editor and start film understanding reconstruct (same UX as editor).
     * Limited to exactly one selected task — multi-title batch is not supported here.
     * @param {object|null} [onlyItem]
     */
    async function runFilmReconstructFromSelection(onlyItem = null) {
        if (state.running || state.postBatchBusy || state.retranslateBusy) {
            showToast('当前有任务进行中', 'warn');
            return;
        }
        if (!advancedEntitled) {
            void promptProUnlockRequired({ featureLabel: '语境和理解重构' });
            return;
        }

        let item = onlyItem || null;
        if (!item) {
            const selected = getSelectedItems();
            if (!selected.length) {
                appendLog('请先勾选一部要理解重构的影片', 'warn');
                showToast('请先勾选一部影片', 'warn');
                return;
            }
            if (selected.length > 1) {
                appendLog('理解重构一次只能勾选一部影片（请在字幕编辑器内操作对照确认）', 'warn');
                showToast('请只勾选一部影片再理解重构', 'warn');
                return;
            }
            item = selected[0];
        }

        const subPath = getSubtitlePathForItem(item);
        if (!subPath) {
            appendLog('该条目尚无字幕可重构', 'warn');
            showToast('该条目尚无字幕', 'warn');
            return;
        }

        appendLog(`打开字幕编辑器并启动影片理解重构：${basename(subPath)}`, 'info');
        const ok = await global.TransubSubtitleEditor?.openEditor?.(subPath, item.path || '', {
            action: 'film-context-reconstruct',
        });
        if (!ok) {
            showToast('无法打开字幕编辑器', 'err');
        }
    }

    async function addVideos() {
        const res = await electron?.transWithAiSelectVideos?.();
        if (res?.ok && !res.canceled && res.files?.length) {
            await addFiles(res.files);
            appendLog(`已添加 ${res.files.length} 个文件`, 'info');
        }
    }

    async function addFolder() {
        const res = await electron?.selectFolder?.({
            title: '选择包含媒体文件的文件夹',
            useLastOpenDir: true,
        });
        if (!res?.ok || res.canceled || !res.path) return;
        const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
        if (!scan?.ok) {
            appendLog(scan?.error || '扫描文件夹失败', 'err');
            return;
        }
        await addFiles(scan.files || []);
        appendLog(`从文件夹添加 ${scan.files?.length || 0} 个媒体文件`, 'info');
    }

    function removeSelected() {
        if (state.retranslateBusy) return;
        const partition = liveBatchQueueApi.partitionSelectedForRemove
            ? liveBatchQueueApi.partitionSelectedForRemove(state.items, {
                running: !!state.running,
                retranslateBusy: !!state.retranslateBusy,
            })
            : {
                removable: state.items.filter((i) => i.selected
                    && !(state.running && i.status === 'running')),
                blocked: [],
            };
        const removed = partition.removable || [];
        if (!removed.length) {
            if (state.running && (partition.blocked || []).length) {
                appendLog('进行中的任务无法移除，可先停止或等待完成', 'warn');
            }
            return;
        }
        void removeItemsFromList(removed, {
            blockedRunning: (partition.blocked || []).length > 0,
        });
    }

    function clearList() {
        if (state.retranslateBusy) return;
        if (!state.items.length) return;
        if (state.running) {
            const removable = state.items.filter((i) => i.status !== 'running');
            if (!removable.length) {
                appendLog('进行中的任务无法清空，可先停止或等待完成', 'warn');
                return;
            }
            void removeItemsFromList(removable, { blockedRunning: true });
            return;
        }
        const snapshot = state.items.map((i) => ({ ...i, sense: i.sense ? { ...i.sense } : undefined }));
        state.items = [];
        renderList();
        updateStartButton();
        ux()?.pushUndo?.(`已清空 ${snapshot.length} 项`, () => {
            state.items = snapshot;
            renderList();
            updateStartButton();
        });
    }

    async function removeItemsFromList(removed, { blockedRunning = false } = {}) {
        const list = Array.isArray(removed) ? removed : [];
        if (!list.length) return;
        if (state.running) {
            const needSkip = liveBatchQueueApi.pathsNeedingBatchSkip
                ? liveBatchQueueApi.pathsNeedingBatchSkip(list, normPath)
                : list
                    .filter((i) => !['done', 'skipped', 'cancelled', 'failed', 'error', 'running']
                        .includes(String(i.status || '')))
                    .map((i) => i.path);
            if (needSkip.length) {
                try {
                    const res = await electron?.transubLiveBatchSkip?.({ paths: needSkip });
                    if (res?.ok === false && res?.code !== 'no_batch') {
                        appendLog(`从批次移除失败：${res?.error || '未知错误'}`, 'warn');
                    }
                } catch (err) {
                    appendLog(`从批次移除失败：${err?.message || err}`, 'warn');
                }
            }
        }
        const removeKeys = new Set(list.map((i) => normPath(i.path)));
        const snapshot = list.map((i) => ({ ...i, sense: i.sense ? { ...i.sense } : undefined }));
        state.items = state.items.filter((i) => !removeKeys.has(normPath(i.path)));
        renderList();
        updateStartButton();
        const note = blockedRunning
            ? `已移除 ${list.length} 项（进行中的任务已保留）`
            : `已移除 ${list.length} 项`;
        ux()?.pushUndo?.(note, () => {
            state.items.push(...snapshot);
            renderList();
            updateStartButton();
            if (state.running) {
                const requeue = snapshot.filter((i) => {
                    const s = String(i.status || '');
                    return !['done', 'skipped', 'cancelled', 'failed', 'error', 'running']
                        .includes(s);
                });
                if (requeue.length) void appendItemsToLiveBatch(requeue);
            }
        });
        if (blockedRunning) appendLog(note, 'info');
    }

    function updateItem(path, patch = {}) {
        const item = findItem(path);
        if (!item) return;
        const wasRunning = item.status === 'running';
        Object.assign(item, patch);
        if (!refreshListRow(item)) renderList();
        if (wasRunning && (patch.status === 'done' || patch.status === 'skipped')) {
            const idx = state.items.indexOf(item);
            const row = idx >= 0
                ? els.fileListBody?.querySelector(`tr[data-idx="${idx}"]`)
                : null;
            row?.classList.add('task-row-flash');
        }
    }

    async function persistFormOptionsQuiet() {
        try {
            const opts = buildSavedOptionsFromForm();
            const res = await electron?.transWithAiSaveOptions?.(opts);
            if (res?.ok) savedOptionsSnapshot = opts;
        } catch (_) { /* ignore */ }
    }

    function resetVideoProgress() {
        state.videoProgress = 0;
        state.videoCurrentSec = 0;
        state.videoTotalSec = 0;
    }

    function dismissLoadingOverlay() {
        state.loadingDepth = 0;
        if (els.loadingOverlay) {
            els.loadingOverlay.classList.add('hidden');
            els.loadingOverlay.classList.remove('flex');
        }
    }

    function computeEtaSec() {
        if (!etaApi?.estimateEtaSec || !state.running) return 0;
        return etaApi.estimateEtaSec({
            items: state.items,
            activePath: state.activePath,
            videoCurrentSec: state.videoCurrentSec,
            videoTotalSec: state.videoTotalSec,
            itemStage: state.itemStage,
            rate: state.etaRate,
        });
    }

    function updateProgressUi() {
        const { pct, label } = computeDisplayProgress();
        if (els.progressBar) els.progressBar.style.width = `${pct}%`;

        let countText = label;
        if (state.running && state.jobStartedAt) {
            const elapsed = formatDuration(elapsedSecSince(state.jobStartedAt));
            countText = `${label} · 已用 ${elapsed}`;
            const etaSec = computeEtaSec();
            if (els.progressEta) {
                const etaText = etaApi?.formatEtaCompact
                    ? `预计剩余 ${etaApi.formatEtaCompact(etaSec)}`
                    : '';
                els.progressEta.textContent = etaText;
                els.progressEta.classList.toggle('hidden', !etaText);
            }
        } else if (els.progressEta) {
            els.progressEta.textContent = '';
            els.progressEta.classList.add('hidden');
        }
        if (els.progressCount) els.progressCount.textContent = countText;
    }

    async function refreshEtaRateFromHistory() {
        if (!etaApi?.rateFromHistory) {
            state.etaRate = 0.35;
            return;
        }
        try {
            const res = await electron?.transWithAiGetTaskHistory?.();
            const entries = res?.ok && Array.isArray(res.entries)
                ? res.entries
                : (Array.isArray(res?.entries) ? res.entries : []);
            state.historyEntries = entries;
            const device = els.deviceSelect?.value || 'cuda';
            const task = readTaskFromForm();
            state.etaRate = etaApi.rateFromHistory(entries, { device, task })
                ?? (task === 'dual'
                    ? (etaApi.DEFAULT_WALL_FACTOR ?? 0.35) * 2
                    : (etaApi.DEFAULT_WALL_FACTOR ?? 0.35));
        } catch {
            state.etaRate = etaApi.DEFAULT_WALL_FACTOR ?? 0.35;
        }
    }

    function syncVideoProgressFromPayload(p) {
        if (inferProgress.applyVideoProgressPayload) {
            const next = inferProgress.applyVideoProgressPayload(state, p);
            if (!next) return;
            state.itemDualPhase = next.itemDualPhase;
            state.itemStage = next.itemStage;
            state.videoProgress = next.videoProgress;
            if (next.videoTotalSec != null) state.videoTotalSec = next.videoTotalSec;
            if (next.videoCurrentSec != null) state.videoCurrentSec = next.videoCurrentSec;
            return;
        }
        // Minimal fallback if infer-stage-progress-core failed to load.
        if (p.phase !== 'running') return;
        if (p.itemDualPhase && p.itemDualPhase !== state.itemDualPhase) {
            state.itemDualPhase = p.itemDualPhase;
            state.itemStage = p.itemStage || 'starting';
        }
        const stage = p.itemStage || 'transcribe';
        if (stageRank(stage) >= stageRank(state.itemStage)) state.itemStage = stage;
        if (Number.isFinite(Number(p.itemProgress))) {
            state.videoProgress = bumpProgress(state.videoProgress, Number(p.itemProgress));
        }
        if (Number(p.videoTotalSec) > 0) {
            state.videoTotalSec = Number(p.videoTotalSec);
            state.videoCurrentSec = Number(p.videoCurrentSec) || 0;
        }
    }

    function buildItemsFromPaths(paths) {
        const prevMap = new Map(state.items.map((i) => [normPath(i.path), i]));
        return paths.map((fullPath) => {
            const prev = prevMap.get(normPath(fullPath));
            return {
                path: fullPath,
                selected: true,
                status: 'pending',
                progress: 0,
                processedSec: 0,
                processedTotalSec: 0,
                detail: '等待中',
                duration: prev?.duration || 0,
                sense: prev?.sense || null,
            };
        });
    }

    function onJobStart(payload) {
        dismissLoadingOverlay();
        state.total = Number(payload?.total) || 0;
        state.index = 0;
        state.generated = 0;
        state.skipped = 0;
        state.failed = 0;
        state.running = true;
        state.activePath = '';
        const backend = String(payload?.backend || '').trim().toLowerCase();
        state.jobBackend = backend === 'twai' || backend === 'transub'
            ? backend
            : readEngineBackendFromForm();
        state.jobStartedAt = Date.now();
        state.itemStage = 'starting';
        state.itemDualPhase = null;

        const paths = Array.isArray(payload?.items) ? payload.items : [];
        // Reset only items in this job; keep unchecked / non-job rows in the list.
        const jobItems = buildItemsFromPaths(paths);
        const jobByPath = new Map(jobItems.map((i) => [normPath(i.path), i]));
        const next = [];
        const seenJob = new Set();
        for (const item of state.items) {
            const key = normPath(item.path);
            const jobItem = jobByPath.get(key);
            if (jobItem) {
                next.push(jobItem);
                seenJob.add(key);
            } else {
                next.push(item);
            }
        }
        for (const jobItem of jobItems) {
            const key = normPath(jobItem.path);
            if (!seenJob.has(key)) next.push(jobItem);
        }
        state.items = next;
        resetVideoProgress();

        if (els.logHost) els.logHost.innerHTML = '';
        setBadge('运行中', 'running');
        els.progressLabel.textContent = '正在排队处理…';
        els.currentFile.textContent = '—';
        renderList();
        updateProgressUi();
        updateStartButton();
        updateAutoSenseUi();
        startElapsedTicker();
        syncResourceUsageMonitor();
        appendLog(`开始任务，共 ${state.total} 个文件`, 'info');
    }

    function onProgress(p) {
        if (!p) return;
        state.index = Number(p.index) || state.index;
        state.total = Number(p.total) || state.total;

        const name = basename(p.fullPath);
        const path = p.fullPath || '';
        if (path) state.activePath = path;

        if (p.itemStage === 'starting') {
            // 双语第二阶段（翻译）开始时不要清零进度
            if (!(p.itemDualPhase === 'translate' && state.itemDualPhase === 'transcribe')) {
                if (!p.itemDualPhase || p.itemDualPhase === 'transcribe') {
                    resetVideoProgress();
                }
            }
            state.itemStage = 'starting';
            if (p.itemDualPhase) state.itemDualPhase = p.itemDualPhase;
        }

        if (path) {
            if (p.phase === 'running') {
                syncVideoProgressFromPayload(p);
                const existing = findItem(path);
                const stage = state.itemStage;
                const keepDualProgress = !!p.itemDualPhase
                    && isPreTranscribeStage(stage)
                    && Number.isFinite(Number(p.itemProgress));
                const keepEnginePrepProgress = isPreTranscribeStage(stage)
                    && Number.isFinite(Number(p.itemProgress))
                    && Number(p.itemProgress) > 0;
                const progress = isPreTranscribeStage(stage) && !keepDualProgress && !keepEnginePrepProgress
                    ? (p.itemDualPhase === 'translate'
                        ? bumpProgress(existing?.progress, state.videoProgress)
                        : 0)
                    : bumpProgress(existing?.progress, state.videoProgress);
                state.videoProgress = progress;
                // New run replaces subtitle — clear previous QC scan / fix markers
                clearItemQcFixed(existing, { clearScan: true });
                const itemPatch = {
                    status: 'running',
                    progress,
                    detail: formatListRunningDetail(p.itemDetail) || stageLabel(stage),
                    stage,
                };
                if (isPreTranscribeStage(stage) && !keepDualProgress && !keepEnginePrepProgress && p.itemDualPhase !== 'translate') {
                    itemPatch.processedSec = 0;
                } else {
                    if (Number(p.videoTotalSec) > 0) {
                        itemPatch.processedTotalSec = Number(p.videoTotalSec);
                    }
                    if (Number(p.videoCurrentSec) > 0) {
                        itemPatch.processedSec = Number(p.videoCurrentSec);
                    }
                }
                if (!existing?.startedAt || (p.itemStage === 'starting' && p.itemDualPhase !== 'translate')) {
                    itemPatch.startedAt = Date.now();
                }
                updateItem(path, itemPatch);
            } else if (p.phase === 'skipped') {
                const skippedPatch = {
                    status: 'skipped',
                    progress: 100,
                    detail: p.itemDetail || '已有字幕',
                    selected: false,
                    subtitlePath: p.subtitlePath,
                    existingSubtitle: p.subtitlePath,
                    sourceSubtitlePath: p.sourceSubtitlePath || undefined,
                    targetSubtitlePath: p.targetSubtitlePath || undefined,
                    bilingualSubtitlePath: p.bilingualSubtitlePath || undefined,
                };
                if (findItem(path)?.startedAt) skippedPatch.completedAt = Date.now();
                updateItem(path, skippedPatch);
            } else if (p.phase === 'done') {
                state.videoProgress = 100;
                if (Number(p.videoTotalSec) > 0) {
                    state.videoTotalSec = Number(p.videoTotalSec);
                    state.videoCurrentSec = state.videoTotalSec;
                }
                const donePatch = {
                    status: 'done',
                    progress: 100,
                    detail: p.itemDetail || '完成',
                    selected: false,
                    subtitlePath: p.subtitlePath || undefined,
                    existingSubtitle: p.subtitlePath || undefined,
                    sourceSubtitlePath: p.sourceSubtitlePath || undefined,
                    targetSubtitlePath: p.targetSubtitlePath || undefined,
                    bilingualSubtitlePath: p.bilingualSubtitlePath || undefined,
                };
                if (p.asrModel) donePatch.asrModel = String(p.asrModel);
                if (p.primaryAsr) donePatch.primaryAsr = String(p.primaryAsr);
                if (Number(p.asrAttempts) > 0) donePatch.asrAttempts = Number(p.asrAttempts);
                if (p.asrFailedOver) donePatch.asrFailedOver = true;
                const doneTotal = Number(p.videoTotalSec) || findItem(path)?.duration || 0;
                if (doneTotal > 0) {
                    donePatch.processedSec = doneTotal;
                    donePatch.processedTotalSec = doneTotal;
                }
                if (findItem(path)?.startedAt) donePatch.completedAt = Date.now();
                updateItem(path, donePatch);
                if (!p.subtitlePath) refreshSubtitlePathsForItems();
            } else if (p.phase === 'failed' || p.phase === 'cancelled') {
                const isCancel = p.phase === 'cancelled'
                    || /取消|cancelled/i.test(String(p.error || p.itemDetail || ''));
                const failedPatch = {
                    status: isCancel ? 'cancelled' : 'failed',
                    progress: state.videoProgress || 0,
                    detail: p.itemDetail || p.error || (isCancel ? '已取消' : '失败'),
                };
                if (Number(state.videoCurrentSec) > 0) {
                    failedPatch.processedSec = Number(state.videoCurrentSec);
                }
                if (Number(state.videoTotalSec) > 0) {
                    failedPatch.processedTotalSec = Number(state.videoTotalSec);
                }
                if (findItem(path)?.startedAt) failedPatch.completedAt = Date.now();
                if (p.resumable && p.resumeFromJobId) {
                    failedPatch.resumable = true;
                    failedPatch.resumeFromJobId = String(p.resumeFromJobId);
                }
                if (p.errorCode) failedPatch.errorCode = String(p.errorCode);
                try {
                    const recoveryApi = globalThis.TransubBatchRecovery;
                    if (recoveryApi?.buildBatchFailureGuidance) {
                        failedPatch.recovery = p.recovery || recoveryApi.buildBatchFailureGuidance({
                            message: p.error || p.itemDetail || failedPatch.detail,
                            code: p.errorCode || '',
                            resumable: !!failedPatch.resumable,
                            resumeFromJobId: failedPatch.resumeFromJobId || '',
                            asrCandidates: p.asrCandidates || p.recovery?.asrCandidates,
                            asrAttempts: p.asrAttempts || p.recovery?.asrAttempts,
                            primaryAsr: p.primaryAsr,
                            asrModel: p.asrModel,
                        });
                        if (Array.isArray(p.asrCandidates) && p.asrCandidates.length) {
                            failedPatch.asrCandidates = p.asrCandidates.slice();
                        }
                        if (p.asrAttempts) failedPatch.asrAttempts = p.asrAttempts;
                        if (failedPatch.recovery?.shortTip && !isCancel) {
                            failedPatch.detail = `${failedPatch.detail} · ${failedPatch.recovery.shortTip}`;
                        }
                    }
                } catch { /* ignore */ }
                updateItem(path, failedPatch);
            }
        }

        els.currentFile.textContent = path ? `${name}（${state.index}/${state.total}）` : '—';
        els.currentFile.title = path || '';

        if (p.phase === 'running') {
            els.progressLabel.textContent = formatRunningProgressLabel(state.itemStage, p.itemDetail);
            if (p.itemStage === 'starting') {
                appendLog(`${stageLabel(state.itemStage)}：${name}`, 'info');
            }
        } else if (p.phase === 'skipped') {
            state.skipped += 1;
            resetVideoProgress();
            els.progressLabel.textContent = '已跳过（已有字幕）';
            appendLog(`跳过：${name}`, 'warn');
        } else if (p.phase === 'done') {
            state.generated += 1;
            els.progressLabel.textContent = '本条已完成';
            const asrNote = p.asrFailedOver && p.asrModel
                ? ` · ASR ${p.asrModel}（回退）`
                : (p.asrModel ? ` · ASR ${p.asrModel}` : '');
            appendLog(
                p.bilingualSubtitlePath && !p.sourceSubtitlePath && !p.targetSubtitlePath
                    ? `完成：${name} → ${basename(p.subtitlePath)}（已合并并清理原轨）${asrNote}`
                    : p.sourceSubtitlePath && p.targetSubtitlePath
                        ? `完成：${name} → ${basename(p.targetSubtitlePath)}（原文 ${basename(p.sourceSubtitlePath)}${p.bilingualSubtitlePath ? ` · 合并 ${basename(p.bilingualSubtitlePath)}` : ''}）${asrNote}`
                        : `完成：${name}${p.subtitlePath ? ` → ${basename(p.subtitlePath)}` : ''}${asrNote}`,
                'ok',
            );
        } else if (p.phase === 'failed' || p.phase === 'cancelled') {
            const isCancel = p.phase === 'cancelled'
                || /取消|cancelled/i.test(String(p.error || p.itemDetail || ''));
            if (isCancel) {
                els.progressLabel.textContent = '本条已取消';
                appendLog(`已取消：${name}`, 'warn');
            } else {
                state.failed += 1;
                els.progressLabel.textContent = '本条失败';
                appendLog(`失败：${name} — ${p.error || '未知错误'}`, 'err');
            }
        }

        updateProgressUi();
    }

    async function refreshSubtitlePathsForItems() {
        const paths = state.items.map((i) => i.path).filter(Boolean);
        if (!paths.length || !electron?.transWithAiCheckSubtitles) return;
        const res = await electron.transWithAiCheckSubtitles({
            paths,
            outputDir: resolveOutputDirFromForm(),
        });
        if (!res?.ok || !res.subtitles) return;
        let changed = false;
        for (const item of state.items) {
            const sub = res.subtitles[item.path];
            // 已记录双语译文轨时勿被 sidecar 探测改回原文（.ja/.source）
            const preferred = item.targetSubtitlePath || sub;
            if (!preferred) continue;
            if (item.subtitlePath !== preferred) {
                item.subtitlePath = preferred;
                changed = true;
            }
            if (item.status === 'done' || item.status === 'skipped') {
                item.existingSubtitle = preferred;
            }
        }
        if (changed) renderList();
    }

    async function scanQcForItems(targets, { quiet = false } = {}) {
        if (!electron?.transubScanSubtitleQc) return { withIssues: 0, scanned: 0 };
        const list = (Array.isArray(targets) ? targets : []).filter((item) => {
            if (!item) return false;
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return !!getSubtitlePathForItem(item);
        });
        if (!list.length) return { withIssues: 0, scanned: 0 };

        if (!quiet) {
            els.progressLabel.textContent = 'QC 检测中…';
            appendLog(`开始 QC 检测（${list.length} 个字幕）…`, 'info');
        }
        let withIssues = 0;
        for (let i = 0; i < list.length; i += 1) {
            const item = list[i];
            const subPath = getSubtitlePathForItem(item);
            if (!quiet) els.progressLabel.textContent = `QC 检测中… ${i + 1}/${list.length}`;
            try {
                const res = await electron.transubScanSubtitleQc({ path: subPath });
                if (res?.ok) {
                    item.qcIssueCount = Number(res.issueCount) || 0;
                    item.qcSummary = res.shortSummary || res.summaryText || '';
                    item.qcError = '';
                    if (item.qcIssueCount > 0) withIssues += 1;
                } else {
                    item.qcError = res?.error || 'QC 失败';
                    item.qcIssueCount = undefined;
                }
            } catch (err) {
                item.qcError = err?.message || 'QC 失败';
                item.qcIssueCount = undefined;
            }
            refreshListRow(item);
        }
        return { withIssues, scanned: list.length };
    }

    async function runPostBatchQcScan({ force = false } = {}) {
        if (!force && !els.postBatchQcCheck?.checked) return { withIssues: 0, scanned: 0 };
        if (!electron?.transubScanSubtitleQc) return { withIssues: 0, scanned: 0 };
        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return !!getSubtitlePathForItem(item);
        });
        if (!targets.length) return { withIssues: 0, scanned: 0 };

        const { withIssues, scanned } = await scanQcForItems(targets);
        const willAutoFix = getPostBatchQcFixMode() !== 'none' && withIssues > 0;
        appendLog(
            withIssues > 0
                ? (willAutoFix
                    ? `QC 完成：${withIssues}/${scanned} 个字幕存在问题，即将自动修复…`
                    : `QC 完成：${withIssues}/${scanned} 个字幕存在问题（仅标记，未自动修复）`)
                : `QC 完成：${scanned} 个字幕均未发现问题`,
            withIssues > 0 ? 'warn' : 'ok',
        );
        els.progressLabel.textContent = withIssues > 0 ? 'QC 完成（有问题项）' : 'QC 完成';
        if (withIssues > 0) state.qcBannerDismissed = false;
        renderList();
        updateQcBanner();
        return { withIssues, scanned };
    }

    async function runPostBatchQcSmartFix(onlyItem = null, { confirm = true } = {}) {
        if (state.running || state.qcFixing) return;
        if (!advancedEntitled) {
            void promptProUnlockRequired({ featureLabel: 'QC 智能修复' });
            return;
        }
        if (!electron?.transubAdvancedQcSmartFix) {
            appendLog('当前环境不支持 QC 智能修复', 'err');
            return;
        }
        const targets = state.items.filter((item) => {
            if (onlyItem && item !== onlyItem) return false;
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!(Number(item.qcIssueCount) > 0)) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
        if (!targets.length) {
            if (confirm) appendLog('没有可智能修复的 QC 条目（需为 .srt/.vtt/.lrc）', 'info');
            return;
        }

        const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
        if (confirm) {
            const confirmMsg = onlyItem
                ? `确定对「${basename(onlyItem.path)}」做 QC 智能修复吗？\n将按素材类型调整强度，并依次：规则修复 → 智能断句 → 局部重转写（连续句/低置信窗，需视频）→ 通顺整理与清怪；有原文对照时再做语义审阅采纳。`
                : `确定 QC 智能修复吗？\n将处理 ${targets.length} 条任务、写回 ${pathCount} 个字幕（内容画像 + 规则/断句/连续句与低置信局部重转写/通顺整理与清怪；双语任务含语义审阅）。`;
            const yes = await appConfirm({
                title: 'QC 智能修复 (Pro)',
                message: confirmMsg,
                primaryLabel: '开始智能修复',
                secondaryLabel: '取消',
            });
            if (!yes) return;
        }

        state.qcFixing = true;
        state.qcSmartFixing = true;
        updateQcBanner();
        els.progressLabel.textContent = 'QC 智能修复中，请稍候…';
        appendLog(
            confirm
                ? `开始 QC 智能修复（${pathCount} 个字幕文件 / ${targets.length} 条任务）…`
                : `任务完成后自动智能修复 QC（${pathCount} 个字幕文件 / ${targets.length} 条任务）…`,
            'info',
        );
        let written = 0;
        let fileTotal = 0;
        let phaseHint = '准备中';
        const unsubQcProgress = electron.onAdvancedReconstructProgress?.((info) => {
            if (!info) return;
            const mode = String(info.mode || '');
            if (mode && mode !== 'qc-smart' && mode !== 'semantic-review' && mode !== 'single') return;
            phaseHint = String(info.message || info.detail || phaseHint).trim() || phaseHint;
            els.progressLabel.textContent = pathCount > 0
                ? `QC 智能修复中，请稍候… ${fileTotal}/${pathCount} · ${phaseHint}`
                : `QC 智能修复中，请稍候… · ${phaseHint}`;
        }) || null;
        try {
            for (let i = 0; i < targets.length; i += 1) {
                const item = targets[i];
                const paths = getPostBatchPathsForItem(item);
                const profile = item.sense?.classification?.profile
                    || (typeof TransubContentProfile !== 'undefined'
                        && TransubContentProfile.classifyContentProfile?.({ path: item.path })?.profile)
                    || 'unknown';
                const preset = (typeof TransubContentProfile !== 'undefined'
                    && TransubContentProfile.qcPresetForProfile?.(profile))
                    || {};
                let itemOk = false;
                let itemWritten = 0;
                let lastSummary = '';
                for (const subPath of paths) {
                    fileTotal += 1;
                    phaseHint = basename(subPath);
                    els.progressLabel.textContent = `QC 智能修复中，请稍候… ${fileTotal}/${pathCount} · ${phaseHint}`;
                    try {
                        const pairPath = resolveQcSemanticPairPathForItem(item, subPath);
                        let savedQc = savedOptionsSnapshot || {};
                        try {
                            const optsRes = await electron?.transWithAiGetOptions?.();
                            if (optsRes?.options) {
                                savedQc = { ...savedQc, ...optsRes.options };
                                savedOptionsSnapshot = optsRes.options;
                            }
                        } catch { /* keep snapshot */ }
                        const silenceCharsRaw = Number(savedQc.qcSilenceSplitChars);
                        const res = await electron.transubAdvancedQcSmartFix({
                            path: subPath,
                            mediaPath: item.path,
                            profile,
                            ...preset,
                            // 用户已点「智能修复」：按设置页步骤开关覆盖画像默认
                            llmSplit: savedQc.qcSmartLlmSplit !== false,
                            retranscribeConnected: savedQc.qcSmartRetranscribe !== false,
                            smartFix: true,
                            pairPath: pairPath || undefined,
                            // Prefer JA/source sidecar for low-confidence retranscribe windows
                            sourceSubtitlePath: pairPath || subPath,
                            subtitlePath: subPath,
                            semanticReview: savedQc.qcSmartSemanticReview !== false && !!pairPath,
                            intensity: savedQc.qcSmartIntensity || preset.intensity || 'light',
                            maxRetranscribeRanges: Number(savedQc.qcSmartMaxRetranscribeRanges) || 8,
                            qcSilenceSplitChars: Number.isFinite(silenceCharsRaw) && silenceCharsRaw >= 0
                                ? silenceCharsRaw
                                : 15,
                            backupMode: 'off',
                        });
                        if (res?.ok && res.written) {
                            written += 1;
                            itemWritten += 1;
                            itemOk = true;
                            lastSummary = res.summary || '已智能修复 QC';
                            appendLog(`${basename(subPath)}：${lastSummary}`, 'ok');
                        } else if (res?.ok) {
                            itemOk = true;
                            lastSummary = res.summary || '无需写回';
                            appendLog(`${basename(subPath)}：${lastSummary}`, 'info');
                        } else {
                            appendLog(`${basename(subPath)}：${res?.error || 'QC 智能修复失败'}`, 'err');
                        }
                    } catch (err) {
                        appendLog(`${basename(subPath)}：${err?.message || 'QC 智能修复失败'}`, 'err');
                    }
                }
                if (itemOk) {
                    markItemQcFixed(item, 'smart', {
                        written: itemWritten > 0,
                        summary: lastSummary || '已智能修复 QC',
                    });
                }
            }
            appendLog(
                written > 0
                    ? `QC 智能修复写回完成：${written}/${fileTotal} 个字幕；正在复查…`
                    : `QC 智能修复完成：${fileTotal} 个字幕均无需写回；正在复查…`,
                written > 0 ? 'ok' : 'info',
            );
            const { withIssues, scanned } = await scanQcForItems(targets, { quiet: true });
            appendLog(
                withIssues > 0
                    ? `QC 复查：仍有 ${withIssues}/${scanned} 个字幕存在问题`
                    : `QC 复查：${scanned} 个字幕已通过`,
                withIssues > 0 ? 'warn' : 'ok',
            );
            if (withIssues > 0) {
                try {
                    const smartApi = global.TransubSubtitleQcSmart;
                    if (typeof smartApi?.planPostBatchResidualHarvest === 'function') {
                        const residualIssues = [];
                        for (const item of targets) {
                            const list = Array.isArray(item.qcIssues) ? item.qcIssues : [];
                            for (const issue of list) residualIssues.push(issue);
                        }
                        const harvest = smartApi.planPostBatchResidualHarvest(residualIssues);
                        if (harvest.total > 0) {
                            appendLog(`${harvest.summary}（可开学习向导对照训练，勿整句润色入库）`, 'info');
                            if (harvest.blank?.length) {
                                appendLog(
                                    `其中空/省略 ${harvest.blank.length} 条可在下次智能修复时优先语义补译`,
                                    'info',
                                );
                            }
                        }
                    }
                } catch (_) { /* ignore */ }
            }
            els.progressLabel.textContent = withIssues > 0 ? 'QC 智能修复完成（仍有问题）' : 'QC 智能修复完成';
            // 按全表剩余问题数决定横幅，避免单条修复把其它项的 QC 提示一并关掉
            state.qcBannerDismissed = countQcIssues() <= 0;
        } finally {
            if (typeof unsubQcProgress === 'function') {
                try { unsubQcProgress(); } catch (_) { /* ignore */ }
            }
            state.qcFixing = false;
            state.qcSmartFixing = false;
            // 必须在清掉 qcFixing 后再渲染，否则 canQcFix 会把所有行的 QC 操作图标去掉
            renderList();
            updateQcBanner();
        }
    }

    async function runPostBatchQcFix(onlyItem = null, { confirm = true } = {}) {
        if (state.running || state.qcFixing) return;
        if (!electron?.transubApplySubtitlePostprocess) {
            appendLog('当前环境不支持字幕后处理，无法一键修复 QC', 'err');
            return;
        }
        const targets = state.items.filter((item) => {
            if (onlyItem && item !== onlyItem) return false;
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!(Number(item.qcIssueCount) > 0)) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
        if (!targets.length) {
            if (confirm) appendLog('没有可写回修复的 QC 条目（需为 .srt/.vtt/.lrc）', 'info');
            return;
        }

        const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
        if (confirm) {
            const confirmMsg = onlyItem
                ? `确定对「${basename(onlyItem.path)}」一键修复 QC 问题吗？\n将写回 ${pathCount} 个字幕文件（时间轴 / 读速 / 叠词等）。`
                : `确定一键修复 QC 问题吗？\n将处理 ${targets.length} 条任务、写回 ${pathCount} 个字幕文件（时间轴 / 读速 / 叠词等）。`;
            const yes = await appConfirm({
                title: '一键修复 QC',
                message: confirmMsg,
                primaryLabel: '一键修复',
                secondaryLabel: '取消',
            });
            if (!yes) return;
        }

        state.qcFixing = true;
        updateQcBanner();
        els.progressLabel.textContent = '一键修复 QC 中，请稍候…';
        appendLog(
            confirm
                ? `开始一键修复 QC（${pathCount} 个字幕文件 / ${targets.length} 条任务）…`
                : `任务完成后自动一键修复 QC（${pathCount} 个字幕文件 / ${targets.length} 条任务）…`,
            'info',
        );
        let written = 0;
        let fileTotal = 0;
        try {
            for (let i = 0; i < targets.length; i += 1) {
                const item = targets[i];
                const paths = getPostBatchPathsForItem(item);
                let itemOk = false;
                let itemWritten = 0;
                let lastSummary = '';
                for (const subPath of paths) {
                    fileTotal += 1;
                    els.progressLabel.textContent = `一键修复 QC 中，请稍候… ${fileTotal}/${pathCount} · ${basename(subPath)}`;
                    try {
                        const res = await electron.transubApplySubtitlePostprocess({
                            path: subPath,
                            options: {
                                cpsSplit: true,
                                fixOverlap: true,
                                fixCpsByExtend: true,
                                enforceMinDur: true,
                                enforceMaxDur: true,
                                fixInvalid: true,
                                compressRepetition: true,
                                removeNoise: true,
                                removeHallucinations: true,
                                removeDuplicates: true,
                                maxCps: 18,
                                maxSec: 10,
                                gapMs: 1,
                                backupMode: 'off',
                            },
                        });
                        let fileWritten = !!(res?.ok && res.written);
                        const remainHint = res?.cpsSplit?.remainingText
                            ? `；${res.cpsSplit.remainingText}`
                            : '';
                        let fileSummary = `${res?.summary || '已修复 QC'}${remainHint}`;
                        if (res?.ok && electron.transubQcSilenceSplit) {
                            let silenceChars = Number(savedOptionsSnapshot?.qcSilenceSplitChars);
                            try {
                                const optsRes = await electron?.transWithAiGetOptions?.();
                                if (optsRes?.options && optsRes.options.qcSilenceSplitChars != null) {
                                    silenceChars = Number(optsRes.options.qcSilenceSplitChars);
                                    savedOptionsSnapshot = {
                                        ...(savedOptionsSnapshot || {}),
                                        ...optsRes.options,
                                    };
                                }
                            } catch { /* keep snapshot */ }
                            const maxChars = Number.isFinite(silenceChars) && silenceChars >= 0
                                ? silenceChars
                                : 15;
                            if (maxChars > 0 && item.path) {
                                try {
                                    const sil = await electron.transubQcSilenceSplit({
                                        path: subPath,
                                        mediaPath: item.path,
                                        maxChars,
                                        backupMode: 'off',
                                    });
                                    if (sil?.ok && sil.written) {
                                        fileWritten = true;
                                        fileSummary = [fileSummary, sil.summary].filter(Boolean).join('；');
                                    } else if (sil?.ok && sil.summary) {
                                        fileSummary = [fileSummary, sil.summary].filter(Boolean).join('；');
                                    }
                                } catch (_) { /* silence optional */ }
                            }
                        }
                        if (res?.ok && fileWritten) {
                            written += 1;
                            itemWritten += 1;
                            itemOk = true;
                            lastSummary = fileSummary;
                            appendLog(`${basename(subPath)}：${lastSummary}`, 'ok');
                        } else if (res?.ok) {
                            itemOk = true;
                            lastSummary = fileSummary || res.summary || '无需写回';
                            appendLog(`${basename(subPath)}：${lastSummary}`, 'info');
                        } else {
                            appendLog(`${basename(subPath)}：${res?.error || 'QC 修复失败'}`, 'err');
                        }
                    } catch (err) {
                        appendLog(`${basename(subPath)}：${err?.message || 'QC 修复失败'}`, 'err');
                    }
                }
                if (itemOk) {
                    markItemQcFixed(item, 'fix', {
                        written: itemWritten > 0,
                        summary: lastSummary || '已一键修复 QC',
                    });
                }
            }
            appendLog(
                written > 0
                    ? `QC 修复写回完成：${written}/${fileTotal} 个字幕；正在复查…`
                    : `QC 修复完成：${fileTotal} 个字幕均无需写回；正在复查…`,
                written > 0 ? 'ok' : 'info',
            );
            const { withIssues, scanned } = await scanQcForItems(targets, { quiet: true });
            appendLog(
                withIssues > 0
                    ? `QC 复查：仍有 ${withIssues}/${scanned} 个字幕存在问题`
                    : `QC 复查：${scanned} 个字幕已通过`,
                withIssues > 0 ? 'warn' : 'ok',
            );
            els.progressLabel.textContent = withIssues > 0 ? 'QC 修复完成（仍有问题）' : 'QC 修复完成';
            // 按全表剩余问题数决定横幅，避免单条修复把其它项的 QC 提示一并关掉
            state.qcBannerDismissed = countQcIssues() <= 0;
        } finally {
            state.qcFixing = false;
            // 必须在清掉 qcFixing 后再渲染，否则 canQcFix 会把所有行的 QC 操作图标去掉
            renderList();
            updateQcBanner();
        }
    }

    async function resolveQcSilenceSplitCharsFromSaved() {
        let n = Number(savedOptionsSnapshot?.qcSilenceSplitChars);
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                savedOptionsSnapshot = { ...(savedOptionsSnapshot || {}), ...optsRes.options };
                if (optsRes.options.qcSilenceSplitChars != null) {
                    n = Number(optsRes.options.qcSilenceSplitChars);
                }
            }
        } catch { /* keep snapshot */ }
        if (!Number.isFinite(n) || n < 0) return 15;
        return Math.max(0, Math.min(500, Math.round(n)));
    }

    /** 无 QC 问题项时仍按字数阈值做超长句静音分割（需视频）。 */
    async function runPostBatchQcSilenceSplitOnly() {
        if (!electron?.transubQcSilenceSplit) return;
        const maxChars = await resolveQcSilenceSplitCharsFromSaved();
        if (!(maxChars > 0)) return;
        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!item.path) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
        if (!targets.length) return;
        let written = 0;
        let touched = 0;
        for (const item of targets) {
            for (const subPath of getPostBatchPathsForItem(item)) {
                try {
                    const sil = await electron.transubQcSilenceSplit({
                        path: subPath,
                        mediaPath: item.path,
                        maxChars,
                        backupMode: 'off',
                    });
                    if (sil?.ok && sil.written) {
                        written += 1;
                        touched += 1;
                        appendLog(`${basename(subPath)}：${sil.summary || '超长句静音分割'}`, 'ok');
                    } else if (sil?.ok && sil.summary && !sil.skipped) {
                        touched += 1;
                        appendLog(`${basename(subPath)}：${sil.summary}`, 'info');
                    }
                } catch (err) {
                    appendLog(`${basename(subPath)}：${err?.message || '超长句静音分割失败'}`, 'warn');
                }
            }
        }
        if (touched > 0) {
            appendLog(
                written > 0
                    ? `超长句静音分割写回 ${written} 个字幕`
                    : `超长句静音分割已分析，无可用静音切点`,
                written > 0 ? 'ok' : 'info',
            );
        }
    }

    async function runPostBatchQcAutoFixIfEnabled() {
        // Prefer saved options so a standalone settings window stays in sync.
        let savedMode = null;
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                savedMode = normalizePostBatchQcFixMode(optsRes.options.postBatchQcFixMode);
                savedOptionsSnapshot = { ...(savedOptionsSnapshot || {}), ...optsRes.options };
            }
        } catch { /* ignore */ }
        const mode = savedMode || getPostBatchQcFixMode();
        if (mode === 'none') return;
        if (countQcIssues() <= 0) {
            // 扫描无 QC 问题：仍按「超长句静音分割字数」处理（否则永远跑不到）
            await runPostBatchQcSilenceSplitOnly();
            return;
        }
        if (mode === 'smart') {
            if (!advancedEntitled) {
                // Pro 默认智能修复：未解锁时不自动跑，也不降级成一键（避免免费版行为突变）
                // 仍做超长句静音分割（不依赖 Pro）
                await runPostBatchQcSilenceSplitOnly();
                return;
            }
            await runPostBatchQcSmartFix(null, { confirm: false });
            return;
        }
        await runPostBatchQcFix(null, { confirm: false });
    }

    function normalizeChineseSubtitleVariant(raw) {
        if (settingsNormApi.normalizeChineseSubtitleVariant) {
            return settingsNormApi.normalizeChineseSubtitleVariant(raw);
        }
        const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
        const cv = String(raw || 'simplified');
        return allowed.has(cv) ? cv : 'simplified';
    }

    function chineseSubtitleVariantLabel(variant) {
        if (settingsNormApi.chineseSubtitleVariantLabel) {
            return settingsNormApi.chineseSubtitleVariantLabel(variant);
        }
        if (variant === 'simplified') return '转简体';
        if (variant === 'traditional-hk') return '转繁体（香港）';
        if (variant === 'traditional-tw') return '转繁体（台湾字形）';
        return '转繁体（台湾）';
    }

    /** 解析翻译任务最终应写回的中文变体；非翻译任务返回 null */
    async function resolvePostBatchChineseVariant() {
        let savedOpts = null;
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) savedOpts = optsRes.options;
        } catch { /* ignore */ }
        const taskFromSaved = savedOpts?.task === 'transcribe' || savedOpts?.task === 'dual'
            ? savedOpts.task
            : (savedOpts?.task ? 'translate' : null);
        const taskNow = taskFromSaved || readTaskFromForm();
        if (!isTranslateLikeTask(taskNow)) return null;
        const variantFromSaved = normalizeChineseSubtitleVariant(savedOpts?.chineseSubtitleVariant);
        const variantFromForm = normalizeChineseSubtitleVariant(els.chineseSubtitleVariantSelect?.value);
        return savedOpts ? variantFromSaved : variantFromForm;
    }

    async function runPostBatchAutoFix() {
        // 以磁盘配置为准（独立设置窗口保存后，主窗口表单可能尚未同步）
        // 注意：简繁转换刻意不在此执行，留到 QC 之后的最后一步
        let savedOpts = null;
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) savedOpts = optsRes.options;
        } catch { /* ignore */ }
        if (!postBatchAutofixApi.planPostBatchAutofixFlags) {
            appendLog('后处理核心未加载（post-batch-autofix-plan），已跳过批量后处理', 'err');
            return;
        }
        const flags = postBatchAutofixApi.planPostBatchAutofixFlags({
            savedOpts,
            form: {
                postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
                postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
                postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
                postBatchViewingPunctMode: els.postBatchViewingPunctModeSelect?.value,
                postBatchInterjectionMode: els.postBatchInterjectionModeSelect?.value,
                postBatchOnomatopoeiaMode: els.postBatchOnomatopoeiaModeSelect?.value,
                task: readTaskFromForm(),
            },
            taskFallback: readTaskFromForm(),
            normalizeViewingCleanMode,
            isTranslateLikeTask,
        });
        const {
            doCps, doNoise, doCompressRep,
            viewingPunctMode, interjectionMode, onomatopoeiaMode,
            doViewingPunct, doSoftenDiscourse, doSoftenOnomatopoeia, doCompactInterjections,
            taskNow, doSpacePunct, doPostprocess,
        } = flags;
        if (!flags.shouldRun) return;

        const targets = postBatchAutofixApi.filterPostBatchAutofixTargets
            ? postBatchAutofixApi.filterPostBatchAutofixTargets(state.items, getPostBatchPathsForItem)
            : state.items.filter((item) => {
                if (item.status !== 'done' && item.status !== 'skipped') return false;
                return getPostBatchPathsForItem(item).length > 0;
            });

        els.progressLabel.textContent = '后处理中…';
        const parts = postBatchAutofixApi.buildPostBatchAutofixLabelParts
            ? postBatchAutofixApi.buildPostBatchAutofixLabelParts({
                doSpacePunct, doCps, doNoise, doCompressRep,
                viewingPunctMode, interjectionMode, onomatopoeiaMode,
                doSoftenDiscourse, doSoftenOnomatopoeia,
            })
            : [];
        const dualHint = taskNow === 'dual' ? '（译文轨 + 合并双语）' : '';

        if (doPostprocess && targets.length && electron?.transubApplySubtitlePostprocess) {
            const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
            appendLog(`开始批量后处理（${pathCount} 个字幕文件 / ${targets.length} 条任务${dualHint} · ${parts.join(' · ')}）…`, 'info');
            let written = 0;
            let fileTotal = 0;
            /** @type {Set<string>} paths already cleared by paired JA↔ZH noise removal */
            const pairedNoiseDone = new Set();

            if (doNoise && electron?.transubRemoveNoisePair) {
                for (const item of targets) {
                    const zhPath = String(getSubtitlePathForItem(item) || '').trim();
                    const jaPath = String(item.sourceSubtitlePath || '').trim();
                    if (!zhPath || !jaPath) continue;
                    if (!/\.(srt|vtt|lrc)$/i.test(zhPath) || !/\.(srt|vtt|lrc)$/i.test(jaPath)) continue;
                    try {
                        const pairRes = await electron.transubRemoveNoisePair({
                            path: zhPath,
                            sourcePath: jaPath,
                            options: {
                                removeDuplicates: true,
                                removeHallucinations: true,
                                backupMode: 'off',
                            },
                        });
                        if (pairRes?.ok && !pairRes.skipped) {
                            pairedNoiseDone.add(zhPath);
                            pairedNoiseDone.add(jaPath);
                            if (pairRes.removed || pairRes.written) {
                                written += 1;
                                appendLog(
                                    `${basename(zhPath)} ↔ ${basename(jaPath)}：${pairRes.summary || '成对清噪'}`,
                                    'ok',
                                );
                            }
                        }
                    } catch (err) {
                        appendLog(`${basename(zhPath)}：成对清噪失败（${err?.message || err}）`, 'err');
                    }
                }
            }

            for (let i = 0; i < targets.length; i += 1) {
                const item = targets[i];
                const paths = getPostBatchPathsForItem(item);
                for (const subPath of paths) {
                    fileTotal += 1;
                    els.progressLabel.textContent = `后处理中… ${fileTotal}/${pathCount}`;
                    const skipNoise = doNoise && pairedNoiseDone.has(subPath);
                    try {
                        const res = await electron.transubApplySubtitlePostprocess({
                            path: subPath,
                            options: {
                                spaceAfterChinesePunctuation: doSpacePunct,
                                cpsSplit: doCps,
                                removeNoise: doNoise && !skipNoise,
                                removeHallucinations: doNoise && !skipNoise,
                                compressRepetition: doCompressRep,
                                viewingPunctMode: viewingPunctMode,
                                simplifyViewingPunctuation: doViewingPunct,
                                softenDiscourseFillers: doSoftenDiscourse,
                                softenOnomatopoeiaFillers: doSoftenOnomatopoeia,
                                dropBilingualPureFillers: doCompactInterjections,
                                dropBilingualDiscourse: interjectionMode === 'clear',
                                dropBilingualOnomatopoeia: onomatopoeiaMode === 'clear',
                                blankInsteadOfRemove: false,
                                fixOverlap: true,
                                enforceMaxDur: true,
                                maxCps: 18,
                                backupMode: 'off',
                            },
                        });
                        if (res?.ok && res.written) {
                            written += 1;
                            appendLog(`${basename(subPath)}：${res.summary || '已后处理'}`, 'ok');
                        } else if (res?.ok) {
                            appendLog(`${basename(subPath)}：${res.summary || '无需后处理'}`, 'info');
                        } else {
                            appendLog(`${basename(subPath)}：${res?.error || '后处理失败'}`, 'err');
                        }
                    } catch (err) {
                        appendLog(`${basename(subPath)}：${err?.message || '后处理失败'}`, 'err');
                    }
                }
            }
            appendLog(
                written > 0
                    ? `后处理完成：已写回 ${written}/${fileTotal} 个字幕`
                    : `后处理完成：${fileTotal} 个字幕均无需写回`,
                written > 0 ? 'ok' : 'info',
            );
        } else if (doCompactInterjections) {
            appendLog(`开始批量后处理（${parts.join(' · ')}）…`, 'info');
        }

        if (doCompactInterjections && electron?.transubCompactPureInterjections) {
            const compactTargets = state.items.filter((item) => {
                if (item.status !== 'done' && item.status !== 'skipped') return false;
                const zh = String(getSubtitlePathForItem(item) || '').trim();
                const ja = String(item.sourceSubtitlePath || '').trim();
                return zh && ja
                    && /\.(srt|vtt|lrc)$/i.test(zh)
                    && /\.(srt|vtt|lrc)$/i.test(ja);
            });
            let compactWritten = 0;
            for (let i = 0; i < compactTargets.length; i += 1) {
                const item = compactTargets[i];
                const zhPath = getSubtitlePathForItem(item);
                const jaPath = item.sourceSubtitlePath;
                els.progressLabel.textContent = `清除语气/拟声… ${i + 1}/${compactTargets.length}`;
                try {
                    const res = await electron.transubCompactPureInterjections({
                        path: zhPath,
                        sourcePath: jaPath,
                        options: {
                            backupMode: 'off',
                            dropDiscourse: interjectionMode === 'clear',
                            dropOnomatopoeia: onomatopoeiaMode === 'clear',
                        },
                    });
                    if (res?.ok && res.dropped) {
                        compactWritten += 1;
                        appendLog(`${basename(zhPath)}：${res.summary || '已清除语气/拟声'}`, 'ok');
                    } else if (res?.ok && !res.skipped) {
                        appendLog(`${basename(zhPath)}：${res.summary || '无需清除语气/拟声'}`, 'info');
                    } else if (res?.ok && res.skipped) {
                        appendLog(`${basename(zhPath)}：跳过清除（${res.reason || '无原文对照'}）`, 'info');
                    } else {
                        appendLog(`${basename(zhPath)}：${res?.error || '清除语气/拟声失败'}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(zhPath)}：${err?.message || '清除语气/拟声失败'}`, 'err');
                }
            }
            if (compactTargets.length) {
                appendLog(
                    compactWritten > 0
                        ? `清除语气/拟声完成：已写回 ${compactWritten}/${compactTargets.length} 个字幕对`
                        : `清除语气/拟声完成：${compactTargets.length} 个字幕对均无需写回`,
                    compactWritten > 0 ? 'ok' : 'info',
                );
            }

            // Remake merged bilingual from cleaned tracks so player `{stem}.srt` stays in sync.
            if (electron?.transubMergeBilingualSubtitles && taskNow === 'dual') {
                let remade = 0;
                for (const item of compactTargets) {
                    const zhPath = String(getSubtitlePathForItem(item) || '').trim();
                    const jaPath = String(item.sourceSubtitlePath || '').trim();
                    const biPath = String(item.bilingualSubtitlePath || '').trim();
                    if (!zhPath || !jaPath || !biPath) continue;
                    if (zhPath === biPath) continue;
                    try {
                        const merged = await electron.transubMergeBilingualSubtitles({
                            path: zhPath,
                            sourcePath: jaPath,
                            dualLineOrder: els.mergeBilingualOrderSelect
                                ? readDualLineOrderFromForm()
                                : 'target-first',
                            nameAsVideoStem: true,
                        });
                        if (merged?.ok && merged.path) {
                            remade += 1;
                            item.bilingualSubtitlePath = merged.path;
                            if (!item.targetSubtitlePath) item.subtitlePath = merged.path;
                        }
                    } catch (err) {
                        appendLog(
                            `${basename(biPath)}：合并双语刷新失败（${err?.message || err}）`,
                            'err',
                        );
                    }
                }
                if (remade) {
                    appendLog(`已按清理后的原/译轨重写合并双语 ${remade} 个`, 'ok');
                }
            }
        }

        els.progressLabel.textContent = '后处理完成';
    }

    /** 整条完成后处理的最后一步：简→繁（须在 CPS/清噪/叠词/QC 之后；简体目标跳过） */
    async function runPostBatchChineseConvert() {
        if (!electron?.transubApplySubtitlePostprocess) return;
        const chineseSubtitleVariant = await resolvePostBatchChineseVariant();
        if (!chineseSubtitleVariant || chineseSubtitleVariant === 'simplified') return;

        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
        if (!targets.length) return;

        const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
        const zhLabel = chineseSubtitleVariantLabel(chineseSubtitleVariant);
        els.progressLabel.textContent = `${zhLabel}…`;
        appendLog(`开始${zhLabel}（最终步骤 · ${pathCount} 个字幕文件）…`, 'info');
        let written = 0;
        let fileTotal = 0;
        for (let i = 0; i < targets.length; i += 1) {
            const item = targets[i];
            const paths = getPostBatchPathsForItem(item);
            for (const subPath of paths) {
                fileTotal += 1;
                els.progressLabel.textContent = `${zhLabel}… ${fileTotal}/${pathCount}`;
                try {
                    const res = await electron.transubApplySubtitlePostprocess({
                        path: subPath,
                        options: {
                            chineseSubtitleVariant,
                            backupMode: 'off',
                        },
                    });
                    if (res?.ok && res.written) {
                        written += 1;
                        appendLog(`${basename(subPath)}：${res.chinese?.summary || res.summary || zhLabel}`, 'ok');
                    } else if (res?.ok) {
                        appendLog(`${basename(subPath)}：${res.summary || '无需转换'}`, 'info');
                    } else {
                        appendLog(`${basename(subPath)}：${res?.error || `${zhLabel}失败`}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(subPath)}：${err?.message || `${zhLabel}失败`}`, 'err');
                }
            }
        }
        appendLog(
            written > 0
                ? `${zhLabel}完成：已写回 ${written}/${fileTotal} 个字幕`
                : `${zhLabel}完成：${fileTotal} 个字幕均无需写回`,
            written > 0 ? 'ok' : 'info',
        );
        els.progressLabel.textContent = `${zhLabel}完成`;
    }

    async function onJobFinished(payload) {
        const cancelled = !!payload?.cancelled;
        state.jobBackend = '';
        state.index = state.total;
        state.activePath = '';
        state.videoProgress = 100;
        state.itemStage = 'done';
        state.itemDualPhase = null;
        stopElapsedTicker();

        state.items.forEach((item) => {
            if (item.status === 'pending' || item.status === 'running') {
                if (item.status === 'running' && item.startedAt && !item.completedAt) {
                    item.completedAt = Date.now();
                }
                if (cancelled) {
                    item.status = 'cancelled';
                    item.progress = item.progress || 0;
                    item.detail = item.detail || '已取消';
                } else {
                    item.status = 'failed';
                    item.progress = item.progress || 0;
                    item.detail = item.detail || '未完成';
                }
            } else if (cancelled && item.status === 'failed'
                && /取消|cancelled/i.test(String(item.detail || ''))) {
                // Progress may have marked the interrupted file as failed before finish.
                item.status = 'cancelled';
                item.detail = item.detail || '已取消';
            }
        });

        // Clear running before the first progress paint — otherwise computeDisplayProgress
        // keeps the in-flight 99% cap and never refreshes to 100% after post-batch.
        state.running = false;
        state.postBatchBusy = !cancelled;
        stopResourceUsageMonitor();
        renderList();
        updateProgressUi();
        updateStartButton();
        await refreshSubtitlePathsForItems();

        const failed = Number(payload?.failed) || state.failed;
        const finishError = String(payload?.error || '').trim();

        if (cancelled) {
            state.postBatchBusy = false;
            updateStartButton();
            setBadge('已停止', 'error');
            els.progressLabel.textContent = '任务已取消';
            appendLog('任务已停止', 'warn');
        } else {
            if (finishError) {
                appendLog(finishError, 'err');
            }
            setBadge(failed > 0 ? '已完成（有失败）' : '已完成', failed > 0 ? 'error' : 'done');
            els.progressLabel.textContent = failed > 0
                ? (finishError || '任务结束，部分失败')
                : '后处理中…';
            appendLog(
                `任务结束：成功 ${payload?.generated ?? state.generated} · 跳过 ${payload?.skipped ?? state.skipped} · 失败 ${payload?.failed ?? state.failed}`,
                failed > 0 ? 'warn' : 'ok',
            );
            // Hold start/queue until post-batch finishes so a new job cannot race writes.
            // Completion toast / tray notify / sound wait until after QC auto-fix.
            try {
                try {
                    await runPostBatchAutoFix();
                } catch (err) {
                    appendLog(err?.message || '后处理失败', 'err');
                }
                try {
                    const fixMode = getPostBatchQcFixMode();
                    await runPostBatchQcScan({ force: fixMode !== 'none' });
                } catch (err) {
                    appendLog(err?.message || 'QC 检测失败', 'err');
                }
                try {
                    await runPostBatchQcAutoFixIfEnabled();
                } catch (err) {
                    appendLog(err?.message || 'QC 自动修复失败', 'err');
                }
                try {
                    // 简繁必须在 CPS/清噪/叠词/QC 全部完成之后再做
                    await runPostBatchChineseConvert();
                } catch (err) {
                    appendLog(err?.message || '简繁转换失败', 'err');
                }
                try {
                    // Only suggest reconstruct when the batch fully succeeded.
                    if (failed === 0) {
                        const profileApi = global.TransubContentProfile;
                        const profile = state.lastContentProfile?.profile;
                        if (profileApi?.suggestPostReconstructMode && profile) {
                            const tip = profileApi.suggestPostReconstructMode({
                                profile,
                                task: savedOptionsSnapshot?.task || buildRuntimeOptions().task,
                            });
                            if (tip?.message) appendLog(tip.message, 'info');
                        }
                    }
                } catch { /* ignore */ }

                const qcIssues = countQcIssues();
                const totalElapsedSec = state.jobStartedAt
                    ? elapsedSecSince(state.jobStartedAt)
                    : 0;
                const totalElapsedText = totalElapsedSec > 0
                    ? formatDuration(totalElapsedSec)
                    : '';
                const generatedCount = Number(payload?.generated ?? state.generated) || 0;
                const summaryLines = [
                    `成功 ${generatedCount} · 跳过 ${payload?.skipped ?? state.skipped} · 失败 ${payload?.failed ?? state.failed}`,
                ];
                if (qcIssues > 0) summaryLines.push(`${qcIssues} 条字幕存在 QC 问题`);
                if (finishError) summaryLines.push(finishError);
                const summaryText = summaryLines.join('\n');
                const libraryMediaPaths = [...new Set(
                    (state.items || [])
                        .filter((it) => String(it?.status || '') === 'done')
                        .map((it) => String(it?.path || '').trim())
                        .filter(Boolean),
                )];
                const libraryText = generatedCount > 0
                    ? (libraryMediaPaths.length > 1
                        ? `成功项已自动入库字幕库（${libraryMediaPaths.length} 部作品）。可打开字幕库查看版本与对照。`
                        : '成功项已自动入库字幕库。可打开字幕库查看当前版、历史版本与对照。')
                    : '';
                if (libraryMediaPaths[0]) {
                    setFocusedTaskPath(libraryMediaPaths[0]);
                }
                if (
                    generatedCount > 0
                    && (savedOptionsSnapshot?.libraryOpenAfterBatch
                        || els.libraryOpenAfterBatchCheck?.checked)
                ) {
                    try {
                        void global.TransubFeatures?.openSubtitleLibrary?.({
                            mediaPath: libraryMediaPaths[0] || '',
                        });
                    } catch (_) { /* ignore */ }
                }
                els.progressLabel.textContent = failed > 0
                    ? (finishError || '任务结束，部分失败')
                    : (qcIssues > 0 ? '全部处理完成（仍有 QC 问题）' : '全部处理完成');
                showToast(summaryText.split('\n')[0], failed > 0 || qcIssues > 0 ? 'warn' : 'ok');
                if (ux()?.showBatchSummary) {
                    const hasLibraryCta = generatedCount > 0;
                    void ux().showBatchSummary({
                        title: failed > 0 ? '任务完成（有失败）' : '任务完成',
                        summaryText,
                        elapsedText: totalElapsedText,
                        libraryText,
                        primaryLabel: failed > 0 ? '重试失败项' : (hasLibraryCta ? '在字幕库查看' : ''),
                        secondaryLabel: '关闭',
                        tertiaryLabel: failed > 0 && hasLibraryCta ? '在字幕库查看' : '',
                        onPrimary: failed > 0 || hasLibraryCta,
                        onTertiary: failed > 0 && hasLibraryCta,
                    }).then((action) => {
                        if (action === 'primary' && failed > 0) {
                            retryAllFailedItems();
                            return;
                        }
                        const openLib = (action === 'primary' && failed === 0 && hasLibraryCta)
                            || (action === 'tertiary' && hasLibraryCta);
                        if (openLib) {
                            void global.TransubFeatures?.openSubtitleLibrary?.({
                                mediaPath: libraryMediaPaths[0] || '',
                            });
                        }
                    });
                }
            } finally {
                try {
                    const qcIssues = countQcIssues();
                    await electron?.transubBatchFinalize?.({
                        summaryExtra: qcIssues > 0 ? `仍有 ${qcIssues} 条 QC 问题` : '',
                    });
                } catch (err) {
                    appendLog(err?.message || '完成通知失败', 'warn');
                }
                state.postBatchBusy = false;
                updateStartButton();
                updateProgressUi();
            }
        }

        setTimeout(() => {
            if (state.running || state.postBatchBusy) return;
            trimTaskLog(200);
        }, 5000);

        if (!cancelled) flushPendingQueue();
    }

    function trimTaskLog(maxLines) {
        if (!els.logHost) return;
        const lines = [...els.logHost.querySelectorAll('.log-line')];
        if (lines.length <= maxLines) return;
        for (let i = 0; lines.length - maxLines > 0 && i < lines.length; i += 1) {
            lines[i].remove();
        }
    }

    async function reloadSavedOptionsIntoForm() {
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                await applyOptionsToForm(optsRes.options);
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                updateParamsSummary();
                return optsRes.options;
            }
        } catch { /* ignore */ }
        return null;
    }

    async function startSubtitleGeneration() {
        dismissLoadingOverlay();
        try {
            // Phantom compute locks (e.g. aborted editor range) disable Start with no click feedback.
            if (state.computeBusy && !state.running && !state.postBatchBusy && !state.retranslateBusy) {
                const cleared = await clearStaleComputeBusyIfNeeded();
                if (cleared.cleared) {
                    appendLog(
                        cleared.before?.label
                            ? `已清除卡住的算力锁（${cleared.before.label}）`
                            : '已清除卡住的算力锁',
                        'warn',
                    );
                }
            } else if (state.computeBusy) {
                await syncComputeBusyFromMain();
                updateStartButton();
            }

            const blockReason = computeStartBlockReason();
            if (blockReason) {
                appendLog(blockReason, 'warn');
                showToast(blockReason, 'warn');
                updateStartButton();
                return;
            }

            const selected = getSelectedItems();
            if (!selected.length) {
                appendLog('请至少选择一个有效视频', 'warn');
                showToast('请至少选择一个有效视频', 'warn');
                return;
            }

            // Failed / cancelled rows stay selected — normalize so the batch path treats them as ready.
            selected.forEach((item) => {
                if (item.status === 'failed' || item.status === 'cancelled' || item.status === 'error') {
                    item.status = 'ready';
                    item.progress = 0;
                    item.detail = '';
                    item.error = '';
                    item.recovery = null;
                }
            });
            renderList();

            if (settingsFormDirty) {
                const choice = await appConfirmChoice({
                    title: '设置未保存',
                    message: '设置有未保存的修改。开始任务前如何处理？',
                    primaryLabel: '保存并开始',
                    secondaryLabel: '取消',
                    tertiaryLabel: '不保存并开始',
                });
                if (choice === 'secondary') return;
                if (choice === 'primary') {
                    await saveParamsSettings({ closeAfter: false });
                    if (settingsFormDirty) {
                        appendLog('设置保存失败，已中止任务', 'err');
                        return;
                    }
                }
            } else {
                await reloadSavedOptionsIntoForm();
            }
            const optsPreview = buildRuntimeOptions();
            const useEnginePreview = (optsPreview.engineBackend || 'transub') !== 'twai';
            const validate = useEnginePreview
                ? await refreshEngineStatus()
                : await refreshInstallStatus();
            if (!validate?.ok) {
                appendLog(
                    validate?.error || (useEnginePreview ? 'Transub Engine 未就绪' : 'TransWithAI 未就绪'),
                    'err',
                );
                setBadge('未就绪', 'error');
                openAppSettings('install');
                return;
            }

        await refreshEtaRateFromHistory();
        // Re-read after validate in case install/engine probe updated options on disk.
        if (!settingsFormDirty) {
            await reloadSavedOptionsIntoForm();
        }
        let opts = buildRuntimeOptions();
        const useEngine = (opts.engineBackend || 'transub') !== 'twai';

        state.lastContentProfile = null;
        const autoSenseOn = isAutoSenseEnabled();
        if (autoSenseOn) {
            const uncovered = enforceSenseAdoptForStart(selected);
            if (uncovered.length) {
                const names = uncovered.slice(0, 4).map((i) => basename(i.path)).join('、');
                const more = uncovered.length > 4 ? ` 等 ${uncovered.length} 项` : '';
                appendLog(
                    '智能感知已开启：须等待感知完成并采纳方案，或点魔术棒「不采纳」，'
                    + `或关闭智能感知后再按表单参数生成（未覆盖：${names}${more}）`,
                    'warn',
                );
                setBadge('待感知', 'warn');
                updateAutoSenseUi();
                return;
            }
            const adopted = selected.filter((i) => i.sense?.adopted && i.sense?.classification?.profile);
            const rejected = selected.filter((i) => isExplicitSenseReject(i));
            if (adopted.length) {
                state.lastContentProfile = adopted[0].sense.classification;
                appendLog(
                    `感知方案：强制采纳 ${adopted.length}/${selected.length} 项`
                    + (rejected.length ? `（${rejected.length} 项已不采纳·走表单）` : '')
                    + '（按文件覆盖参数）',
                    'info',
                );
                const startTranslateMode = readTranslateModeFromForm();
                const profileApi = global.TransubContentProfile;
                adopted.slice(0, 12).forEach((i) => {
                    const o = i.sense.overrides || {};
                    const mtLabel = mtUseFormState
                        ? (isMtModelAutoSelected() ? '自动' : '指定模型')
                        : (profileApi?.describeSenseMtForUi?.(o, {
                            task: opts.task || readTaskFromForm(),
                            translateMode: startTranslateMode,
                            smartTranslate: startTranslateMode === 'smart' || !!opts.smartTranslate,
                        }) || (
                            (startTranslateMode === 'smart' || opts.smartTranslate)
                                ? '智能翻译 Pro'
                                : o.engineMtModel
                        ));
                    const bits = [
                        i.sense.classification?.label || i.sense.classification?.profile,
                        o.language,
                        o.engineAsrModel,
                        mtLabel,
                        o.engineVadModel || (o.vadSensitive ? '灵敏' : ''),
                    ].filter(Boolean);
                    appendLog(`· ${basename(i.path)} → ${bits.join(' · ')}`, 'info');
                });
                if (adopted.length > 12) {
                    appendLog(`· …其余 ${adopted.length - 12} 项已省略`, 'info');
                }
            } else if (rejected.length === selected.length) {
                appendLog('本批均已不采纳感知，将按表单参数生成', 'info');
            }
        }
        updateAutoSenseUi();

        if (autoSenseOn && useEngine) {
            const senseGaps = await collectAdoptedSenseSupportGaps(selected);
            if (senseGaps.length) {
                const decision = await promptInstallSenseSupportGaps(senseGaps);
                if (decision === 'install') {
                    setBadge('待安装', 'warn');
                    appendLog('已打开安装流程；完成后请再次开始生成', 'info');
                    return;
                }
                appendLog('已取消开始生成（感知方案缺少支持项，须安装后才能按感知方案运行）', 'warn');
                return;
            }
        }

        if (!useEngine && modelApi) {
            const gate = modelApi.validateModelsForTask(opts, cachedModelItems, opts.task);
            if (!gate.ok) {
                appendLog(gate.error || '模型配置无效', 'err');
                setBadge('模型未就绪', 'error');
                openAppSettings('install');
                return;
            }
            (gate.warnings || []).forEach((w) => appendLog(w, 'warn'));
            if (gate.options) {
                opts.transcribeModelPath = gate.options.transcribeModelPath;
                opts.translateModelPath = gate.options.translateModelPath;
                opts.modelPath = gate.options.modelPath;
            }
        }

        // When every selected item uses a sense scheme, form model picks are irrelevant.
        const allSenseCovered = autoSenseOn && selected.every((i) => (
            i.sense?.adopted && i.sense.overrides && Object.keys(i.sense.overrides).length
        ));
        if (useEngine && !allSenseCovered) {
            if (!cachedEngineModels.length) {
                await refreshEngineModels({ silent: true });
            }
            const miss = warnIfSelectedEngineModelsMissing();
            if (miss) {
                const choice = await appConfirmChoice({
                    title: '模型未安装',
                    message: `${miss}\n\n是否现在下载缺失模型？`,
                    primaryLabel: '去下载',
                    secondaryLabel: '取消',
                });
                if (choice === 'primary') {
                    const asrId = els.engineAsrModelSelect?.value || '';
                    const asrNeedsFsmn = !asrId || !String(asrId).includes('whisper');
                    let mtIds = resolveExpectedOpusMtModelIds();
                    if (!mtIds.length && !anyCommonOpusMtInstalled()) {
                        // Auto language: offer the common ja/en/ko set (user may cancel later).
                        mtIds = ['opus-mt-ja-zh', 'opus-mt-en-zh', 'opus-mt-ko-zh'];
                    }
                    const ids = [
                        asrId,
                        ...mtIds,
                        asrNeedsFsmn ? 'fsmn-vad' : '',
                    ]
                        .filter(Boolean)
                        .filter((id) => {
                            const row = cachedEngineModels.find((m) => m.id === id);
                            return !row || !row.installed;
                        });
                    if (ids.length) {
                        void downloadEngineModels({ modelIds: ids, force: false });
                    } else {
                        openAppSettings('models', { openLibrary: true });
                    }
                    setBadge('待安装', 'warn');
                    appendLog('已打开模型下载；完成后请再次开始生成', 'info');
                    return;
                }
                appendLog(miss, 'err');
                setBadge('模型未安装', 'error');
                return;
            }
        } else if (useEngine && allSenseCovered && !cachedEngineModels.length) {
            await refreshEngineModels({ silent: true });
        }

        appendLog(`开始生成字幕 ${selected.length} 个文件…`, 'info');
        ensureLogExpanded();
        if (opts.task === 'dual' && !useEngine) {
            appendLog(
                `双语模型：转写=${opts.transcribeModelPath || '默认'} · 翻译=${opts.translateModelPath || '默认'}`,
                'info',
            );
        }
        if (useEngine) {
            appendLog(
                `引擎后端：Transub Engine · ASR=${opts.engineAsrModel || 'sensevoice-small'} · 档位=${opts.engineProfile || 'balanced'}`,
                'info',
            );
            appendLog('正在提交引擎任务（首次加载模型可能需数分钟）…', 'info');
        }
        const generateApi = useEngine
            ? electron?.transubEngineGenerateSubtitles
            : electron?.transWithAiGenerateSubtitles;
        if (!generateApi) {
            setBadge('失败', 'error');
            appendLog('当前环境不支持字幕生成接口', 'err');
            return;
        }
        try {
            const res = await generateApi({
                items: selected.map((i) => ({
                    fullPath: i.path,
                    durationSec: i.duration || 0,
                    optionOverrides: senseOverridesForJob(i),
                })),
                options: opts,
                minimizeToTray: !!opts.minimizeToTrayOnStart,
            });
            if (!res?.ok) {
                // Cancel / normal finish already handled by onJobFinished — do not clobber UI.
                if (res?.cancelled) return;
                if (res && ('generated' in res || 'failed' in res || 'skipped' in res)) return;
                const errMsg = res?.error || '字幕生成失败';
                appendLog(errMsg, 'err');
                if (!state.running) {
                    setBadge('失败', 'error');
                }
            }
        } catch (err) {
            appendLog(err?.message || '字幕生成失败', 'err');
            if (!state.running) {
                setBadge('失败', 'error');
            }
        }
        } catch (err) {
            const msg = err?.message || String(err) || '开始执行失败';
            appendLog(msg, 'err');
            showToast(msg, 'err');
            dismissLoadingOverlay();
            updateStartButton();
        }
    }

    function fillTrialPresetSelects(presets) {
        const list = Array.isArray(presets) ? presets : [];
        [els.trialPresetASelect, els.trialPresetBSelect].forEach((sel, idx) => {
            if (!sel) return;
            sel.innerHTML = '';
            for (const p of list) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                sel.appendChild(opt);
            }
            if (list.length) {
                sel.value = list[Math.min(idx, list.length - 1)].id;
                if (idx === 1 && list.length > 1) {
                    const anti = list.find((p) => p.id === 'translate-anti-hallucination');
                    if (anti) sel.value = anti.id;
                }
            }
        });
    }

    async function openTrialCompareModal() {
        if (!els.trialCompareModal) return;
        const res = await electron?.transWithAiGetPresets?.();
        fillTrialPresetSelects(res?.presets || []);
        if (els.trialCompareResult) {
            els.trialCompareResult.classList.add('hidden');
            els.trialCompareResult.textContent = '';
        }
        if (els.trialCompareStatus) els.trialCompareStatus.textContent = '—';
        els.trialCompareModal.classList.remove('hidden');
        els.trialCompareModal.classList.add('flex');
    }

    function closeTrialCompareModal() {
        els.trialCompareModal?.classList.add('hidden');
        els.trialCompareModal?.classList.remove('flex');
    }

    async function runTrialCompare() {
        const selected = getSelectedItems();
        if (!selected.length) {
            if (els.trialCompareStatus) els.trialCompareStatus.textContent = '请先在列表中勾选一个视频';
            return;
        }
        if (state.running) {
            if (els.trialCompareStatus) els.trialCompareStatus.textContent = '已有任务运行中';
            return;
        }
        const presetsRes = await electron?.transWithAiGetPresets?.();
        const presets = presetsRes?.presets || [];
        const presetA = presets.find((p) => p.id === els.trialPresetASelect?.value);
        const presetB = presets.find((p) => p.id === els.trialPresetBSelect?.value);
        if (!presetA?.options || !presetB?.options) {
            if (els.trialCompareStatus) els.trialCompareStatus.textContent = '请选择两个预设';
            return;
        }
        const durationSec = Number(els.trialDurationInput?.value) || 30;
        const base = buildRuntimeOptions();
        if (els.trialCompareStatus) els.trialCompareStatus.textContent = '准备试跑…';
        if (els.runTrialCompareBtn) els.runTrialCompareBtn.disabled = true;
        try {
            const unsub = electron?.onTransubTrialCompareProgress?.((p) => {
                if (els.trialCompareStatus && p?.detail) {
                    els.trialCompareStatus.textContent = p.detail;
                }
            });
            const res = await electron.transubTrialCompare({
                mediaPath: selected[0].path,
                durationSec,
                baseOptions: base,
                optionsA: presetA.options,
                optionsB: presetB.options,
                labelA: presetA.name,
                labelB: presetB.name,
            });
            if (typeof unsub === 'function') unsub();
            if (!res?.ok) {
                if (els.trialCompareStatus) {
                    els.trialCompareStatus.textContent = res?.error || '试跑失败';
                }
                return;
            }
            const fmt = (side) => {
                if (!side?.ok) return `${side?.label || '?'}: 失败 — ${side?.error || ''}`;
                const prev = (side.preview || []).slice(0, 3).map((t) => `  · ${t}`).join('\n');
                return [
                    `${side.label}`,
                    `  条数 ${side.cueCount} · QC问题 ${side.issueCount}`,
                    prev || '  （无预览）',
                ].join('\n');
            };
            const text = [
                `试跑 ${res.durationSec}s · ${basename(selected[0].path)}`,
                '',
                fmt(res.a),
                '',
                fmt(res.b),
            ].join('\n');
            if (els.trialCompareResult) {
                els.trialCompareResult.textContent = text;
                els.trialCompareResult.classList.remove('hidden');
            }
            if (els.trialCompareStatus) els.trialCompareStatus.textContent = '对比完成';
            appendLog('参数试跑对比完成，详见弹窗结果', 'ok');
        } catch (err) {
            if (els.trialCompareStatus) {
                els.trialCompareStatus.textContent = err?.message || '试跑失败';
            }
        } finally {
            if (els.runTrialCompareBtn) els.runTrialCompareBtn.disabled = false;
        }
    }

    function setupDragDrop() {
        const zone = els.filePanel || els.dropZone;
        if (!zone) return;

        const onDragEnter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.dragDepth += 1;
            if (state.dragDepth === 1) setDropActive(true);
        };

        const onDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };

        const onDragLeave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!zone.contains(e.relatedTarget)) {
                state.dragDepth = 0;
                setDropActive(false);
            }
        };

        const onDrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.dragDepth = 0;
            setDropActive(false);
            if (state.running) {
                if (e.dataTransfer) await handleDroppedFiles(e.dataTransfer);
                return;
            }
            if (e.dataTransfer) await handleDroppedFiles(e.dataTransfer);
        };

        zone.addEventListener('dragenter', onDragEnter);
        zone.addEventListener('dragover', onDragOver);
        zone.addEventListener('dragleave', onDragLeave);
        zone.addEventListener('drop', onDrop);

        document.body.addEventListener('dragover', (e) => e.preventDefault());
    }

    let taskRowContextIdx = -1;
    let taskColContextKey = '';

    function taskColMeta(key) {
        return TASK_TABLE_COLS.find((c) => c.key === key) || null;
    }

    function syncTaskTableSortHeaders() {
        const head = els.taskTableHead;
        if (!head) return;
        const sort = state.listSort;
        head.querySelectorAll('th[data-sort-key]').forEach((th) => {
            const key = th.getAttribute('data-sort-key') || '';
            const active = !!(sort && sort.key === key);
            th.classList.toggle('is-sort-asc', active && sort.dir === 'asc');
            th.classList.toggle('is-sort-desc', active && sort.dir === 'desc');
            const label = (th.textContent || '').replace(/\s+/g, ' ').trim().replace(/[▲▼↕]/g, '').trim();
            const baseTitle = th.getAttribute('data-base-title') || th.getAttribute('title') || label;
            if (!th.getAttribute('data-base-title')) th.setAttribute('data-base-title', baseTitle);
            if (active) {
                th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
                th.title = `${baseTitle}（${sort.dir === 'asc' ? '升序' : '降序'}，再点切换）`;
            } else {
                th.removeAttribute('aria-sort');
                th.title = baseTitle;
            }
        });
    }

    function measureTaskColumnFitWidth(colKey) {
        const meta = taskColMeta(colKey);
        const table = els.subtitleTaskTable;
        if (!meta || !table) return meta?.min || 64;
        const colIdx = TASK_TABLE_COLS.findIndex((c) => c.key === colKey);
        const targets = [];
        table.querySelectorAll('tr').forEach((tr) => {
            const cell = tr.children[colIdx];
            if (cell) targets.push(cell);
        });
        if (!targets.length) return meta.min;

        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = [
            'position:absolute',
            'left:-99999px',
            'top:0',
            'visibility:hidden',
            'height:auto',
            'width:max-content',
            'max-width:none',
            'white-space:nowrap',
            'display:inline-block',
            'pointer-events:none',
            'box-sizing:border-box',
        ].join(';');
        document.body.appendChild(probe);

        let max = 0;
        targets.forEach((cell) => {
            const cs = getComputedStyle(cell);
            probe.style.font = cs.font;
            probe.style.letterSpacing = cs.letterSpacing;
            probe.style.paddingLeft = cs.paddingLeft;
            probe.style.paddingRight = cs.paddingRight;
            const clone = cell.cloneNode(true);
            if (cell.tagName === 'TH') {
                clone.querySelectorAll('.task-col-sort-ind').forEach((n) => n.remove());
            }
            // Flatten flex/block layout so content width is measurable
            clone.querySelectorAll('*').forEach((n) => {
                if (!(n instanceof HTMLElement)) return;
                n.style.maxWidth = 'none';
                n.style.width = 'auto';
                n.style.overflow = 'visible';
                n.style.textOverflow = 'clip';
                n.style.whiteSpace = 'nowrap';
                if (n.classList.contains('file-cell-main')
                    || n.classList.contains('row-actions')
                    || n.classList.contains('qc-cell')
                    || n.classList.contains('row-mini-progress')) {
                    n.style.display = 'inline-flex';
                } else if (n.tagName !== 'BUTTON' && n.tagName !== 'INPUT' && n.tagName !== 'SPAN'
                    && n.tagName !== 'I' && n.tagName !== 'A') {
                    n.style.display = 'inline';
                }
            });
            probe.innerHTML = '';
            while (clone.firstChild) probe.appendChild(clone.firstChild);
            max = Math.max(max, Math.ceil(probe.getBoundingClientRect().width));
        });
        probe.remove();
        return Math.max(meta.min, Math.min(meta.max, max + (meta.pad || 0)));
    }

    function applyTaskColumnWidths() {
        const group = els.taskTableColgroup;
        const table = els.subtitleTaskTable;
        if (!group) return;
        let sum = 0;
        let fittedCount = 0;
        group.querySelectorAll('col[data-col]').forEach((col) => {
            const key = col.getAttribute('data-col') || '';
            const px = taskColumnWidths[key];
            if (Number.isFinite(px) && px > 0) {
                col.style.width = `${Math.round(px)}px`;
                sum += px;
                fittedCount += 1;
            } else {
                col.style.width = '';
            }
        });
        if (!table) return;
        // After fitting every column, size the table to content (scroll if needed)
        if (fittedCount === TASK_TABLE_COLS.length && sum > 0) {
            const hostW = els.listScroll?.clientWidth || 0;
            table.style.width = `${Math.max(Math.round(sum), hostW || 0)}px`;
            table.style.minWidth = `${Math.round(sum)}px`;
        } else if (fittedCount > 0) {
            table.style.width = '100%';
            table.style.minWidth = '';
        } else {
            table.style.width = '';
            table.style.minWidth = '';
        }
    }

    function remapExpandedErrorRows(prevItems) {
        if (!expandedErrorRows.size) return;
        const next = new Set();
        for (const oldIdx of expandedErrorRows) {
            const item = prevItems[oldIdx];
            if (!item) continue;
            const newIdx = state.items.indexOf(item);
            if (newIdx >= 0) next.add(newIdx);
        }
        expandedErrorRows.clear();
        for (const i of next) expandedErrorRows.add(i);
    }

    function listSortHelpers() {
        return {
            basename,
            itemElapsedSec,
            statusRank: TASK_STATUS_SORT_RANK,
        };
    }

    function listSortValue(item, key) {
        if (taskListSortApi.listSortValue) {
            return taskListSortApi.listSortValue(item, key, listSortHelpers());
        }
        switch (key) {
            case 'file':
                return basename(item.path).toLocaleLowerCase('zh-CN');
            case 'duration':
                return Number(item.duration) || 0;
            case 'elapsed':
                return itemElapsedSec(item);
            case 'progress': {
                const pct = Number(item.progress);
                if (Number.isFinite(pct)) return pct;
                const total = Number(item.duration) || Number(item.processedTotalSec) || 0;
                const processed = Number(item.processedSec) || 0;
                if (total > 0 && processed > 0) return (processed / total) * 100;
                return processed > 0 ? 100 : 0;
            }
            case 'status':
                return TASK_STATUS_SORT_RANK[item.status] ?? 50;
            case 'qc': {
                if (item.qcError) return -1;
                if (!Number.isFinite(Number(item.qcIssueCount))) return -2;
                return Number(item.qcIssueCount) || 0;
            }
            default:
                return '';
        }
    }

    function compareListSortValues(a, b, key) {
        if (taskListSortApi.compareListSortValues) {
            return taskListSortApi.compareListSortValues(a, b, key, listSortHelpers());
        }
        const va = listSortValue(a, key);
        const vb = listSortValue(b, key);
        if (typeof va === 'number' && typeof vb === 'number') {
            return va - vb;
        }
        return String(va).localeCompare(String(vb), 'zh-CN', { numeric: true, sensitivity: 'base' });
    }

    function sortTaskListBy(key) {
        if (!taskColMeta(key)?.sortable) return;
        state.listSort = taskListSortApi.nextListSortState
            ? taskListSortApi.nextListSortState(state.listSort, key)
            : {
                key,
                dir: (state.listSort && state.listSort.key === key && state.listSort.dir === 'asc')
                    ? 'desc'
                    : 'asc',
            };
        renderList();
    }

    function applyListSortInPlace() {
        const sort = state.listSort;
        if (!sort?.key || !taskColMeta(sort.key)?.sortable) return;
        if (state.items.length < 2) return;
        if (taskListSortApi.sortTaskItems) {
            const result = taskListSortApi.sortTaskItems(state.items, sort, listSortHelpers());
            state.items = result.items;
            if (result.changed) remapExpandedErrorRows(result.prev);
            return;
        }
        const prev = state.items.slice();
        const mult = sort.dir === 'asc' ? 1 : -1;
        const key = sort.key;
        state.items.sort((a, b) => {
            const cmp = compareListSortValues(a, b, key);
            if (cmp !== 0) return cmp * mult;
            return basename(a.path).localeCompare(basename(b.path), 'zh-CN');
        });
        let changed = false;
        for (let i = 0; i < prev.length; i += 1) {
            if (prev[i] !== state.items[i]) {
                changed = true;
                break;
            }
        }
        if (changed) remapExpandedErrorRows(prev);
    }

    function autoFitTaskColumn(colKey) {
        if (!taskColMeta(colKey)) return;
        taskColumnWidths[colKey] = measureTaskColumnFitWidth(colKey);
        applyTaskColumnWidths();
    }

    function autoFitAllTaskColumns() {
        TASK_TABLE_COLS.forEach((c) => {
            taskColumnWidths[c.key] = measureTaskColumnFitWidth(c.key);
        });
        applyTaskColumnWidths();
    }

    function closeTaskColContextMenu() {
        taskColContextKey = '';
        if (!els.taskColContextMenu) return;
        els.taskColContextMenu.classList.add('hidden');
        els.taskColContextMenu.style.left = '';
        els.taskColContextMenu.style.top = '';
    }

    function isTaskColContextMenuOpen() {
        return !!(els.taskColContextMenu && !els.taskColContextMenu.classList.contains('hidden'));
    }

    function showTaskColContextMenu(colKey, clientX, clientY) {
        const menu = els.taskColContextMenu;
        if (!menu || !taskColMeta(colKey)) return;
        closeTaskRowContextMenu();
        setPostTaskMenuOpen(false);
        setAddMenuOpen(false);
        setMoreMenuOpen(false);
        setTranslateModeMenuOpen(false);
        setPostBatchQcFixMenuOpen(false);
        taskColContextKey = colKey;
        const fitOne = menu.querySelector('[data-task-col-ctx="fit-one"]');
        if (fitOne) {
            const label = fitOne.querySelector('span');
            if (label) label.textContent = '将列调整为合适的大小';
            fitOne.disabled = false;
        }
        menu.classList.remove('hidden');
        try { document.body.appendChild(menu); } catch { /* ignore */ }
        const pad = 8;
        const mw = menu.offsetWidth || 220;
        const mh = menu.offsetHeight || 80;
        const vw = window.innerWidth || 800;
        const vh = window.innerHeight || 600;
        let left = Number(clientX) || 0;
        let top = Number(clientY) || 0;
        if (left + mw + pad > vw) left = Math.max(pad, vw - mw - pad);
        if (top + mh + pad > vh) top = Math.max(pad, vh - mh - pad);
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    function runTaskColContextAction(action) {
        const colKey = taskColContextKey;
        closeTaskColContextMenu();
        if (action === 'fit-one' && colKey) autoFitTaskColumn(colKey);
        else if (action === 'fit-all') autoFitAllTaskColumns();
    }

    function bindTaskTableColumns() {
        const head = els.taskTableHead;
        if (!head || head.dataset.colBound) return;
        head.dataset.colBound = '1';

        head.addEventListener('click', (e) => {
            if (e.target.closest('input, button, a, label')) return;
            const th = e.target.closest('th[data-sort-key]');
            if (!th || !head.contains(th)) return;
            e.preventDefault();
            const key = th.getAttribute('data-sort-key') || '';
            if (key) sortTaskListBy(key);
        });

        const onHeaderContextMenu = (e) => {
            const th = e.target.closest('th[data-col]');
            if (!th || !head.contains(th)) return;
            if (e.target.closest('input, textarea, select')) return;
            e.preventDefault();
            e.stopPropagation();
            const colKey = th.getAttribute('data-col') || '';
            if (!colKey) return;
            showTaskColContextMenu(colKey, e.clientX, e.clientY);
        };
        head.addEventListener('contextmenu', onHeaderContextMenu);

        // Also allow right-click on body cells to auto-fit that column (Excel-like),
        // but only when not on a task row action — row menu takes priority on rows.
        // Header-only is enough per product ask; keep header path only.

        els.taskColContextMenu?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-task-col-ctx]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            runTaskColContextAction(btn.getAttribute('data-task-col-ctx'));
        });
        els.taskColContextMenu?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        document.addEventListener('click', (e) => {
            if (!isTaskColContextMenuOpen()) return;
            if (els.taskColContextMenu.contains(e.target)) return;
            closeTaskColContextMenu();
        }, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isTaskColContextMenuOpen()) {
                e.preventDefault();
                e.stopPropagation();
                closeTaskColContextMenu();
            }
        }, true);
        els.listScroll?.addEventListener('scroll', () => {
            if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
        }, { passive: true });
        window.addEventListener('resize', () => {
            if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
        });

        // Ensure default col widths apply once DOM is ready
        applyTaskColumnWidths();
        syncTaskTableSortHeaders();
    }

    function closeTaskRowContextMenu() {
        taskRowContextIdx = -1;
        if (!els.taskRowContextMenu) return;
        els.taskRowContextMenu.classList.add('hidden');
        els.taskRowContextMenu.style.left = '';
        els.taskRowContextMenu.style.top = '';
    }

    function isTaskRowContextMenuOpen() {
        return !!(els.taskRowContextMenu && !els.taskRowContextMenu.classList.contains('hidden'));
    }

    /** If the row is not already selected, select only that row (keeps multi-select when right-clicking a selected row). */
    function ensureContextRowSelected(idx) {
        const item = state.items[idx];
        if (!item) return null;
        if (!item.selected) {
            state.items.forEach((it, i) => { it.selected = i === idx; });
            if (els.selectAllCheck) {
                els.selectAllCheck.checked = state.items.length > 0
                    && state.items.every((it) => it.selected);
            }
            renderList();
            updateStartButton();
        }
        setFocusedTaskPath(item.path);
        return state.items[idx] || item;
    }

    function syncTaskRowContextMenuState(idx) {
        const menu = els.taskRowContextMenu;
        if (!menu) return;
        const item = state.items[idx];
        if (!item) {
            closeTaskRowContextMenu();
            return;
        }
        const subPath = getSubtitlePathForItem(item);
        const canEdit = !!subPath;
        const canLibrary = !!(String(item?.path || '').trim() || subPath);
        const busy = state.running || state.postBatchBusy || state.retranslateBusy;
        const canRetranslate = !busy;
        const canReconstruct = !busy && !!getSubtitlePathForItem(item);
        const canQcFix = !state.running && !state.qcFixing
            && Number(item.qcIssueCount) > 0
            && getPostBatchPathsForItem(item).length > 0;
        const canQcSmart = canQcFix && advancedEntitled && !!electron?.transubAdvancedQcSmartFix;
        const canRetry = (item.status === 'failed' || item.status === 'error') && !state.running;
        const canShowFolder = !!showPathForItem(item);
        const sense = item.sense;
        const hasSenseOverrides = !!(sense?.overrides && Object.keys(sense.overrides).length);
        const canToggleSense = sense?.status === 'done'
            && !state.running
            && (sense.adopted || hasSenseOverrides);
        const canResense = !state.running
            && !!sense
            && (sense.status === 'done' || sense.status === 'error' || sense.status === 'sensing')
            && sense.status !== 'sensing';
        const canRemove = liveBatchQueueApi.canRemoveTaskItem
            ? liveBatchQueueApi.canRemoveTaskItem(item, {
                running: !!state.running,
                retranslateBusy: !!state.retranslateBusy,
            })
            : (!state.retranslateBusy && !(state.running && item.status === 'running'));

        const setEnabled = (action, enabled) => {
            const btn = menu.querySelector(`[data-task-ctx="${action}"]`);
            if (btn) btn.disabled = !enabled;
        };
        setEnabled('edit', canEdit);
        setEnabled('library', canLibrary);
        setEnabled('retranslate', canRetranslate);
        setEnabled('reconstruct', canReconstruct);
        setEnabled('qc-fix', canQcFix);
        setEnabled('qc-smart-fix', canQcSmart);
        setEnabled('retry', canRetry);
        setEnabled('show-folder', canShowFolder);
        setEnabled('sense-toggle', canToggleSense);
        setEnabled('sense-resense', canResense);
        setEnabled('remove', canRemove);

        const senseLabel = menu.querySelector('[data-task-ctx-label="sense-toggle"]');
        if (senseLabel) {
            senseLabel.textContent = sense?.adopted ? '取消采纳感知' : '采纳感知';
        }
    }

    function showTaskRowContextMenu(idx, clientX, clientY) {
        const menu = els.taskRowContextMenu;
        if (!menu || !state.items[idx]) return;
        taskRowContextIdx = idx;
        closeTaskColContextMenu();
        setPostTaskMenuOpen(false);
        setAddMenuOpen(false);
        setMoreMenuOpen(false);
        setTranslateModeMenuOpen(false);
        setPostBatchQcFixMenuOpen(false);
        ensureContextRowSelected(idx);
        syncTaskRowContextMenuState(idx);
        menu.classList.remove('hidden');
        try { document.body.appendChild(menu); } catch { /* ignore */ }
        const pad = 8;
        const mw = menu.offsetWidth || 200;
        const mh = menu.offsetHeight || 280;
        const vw = window.innerWidth || 800;
        const vh = window.innerHeight || 600;
        let left = Number(clientX) || 0;
        let top = Number(clientY) || 0;
        if (left + mw + pad > vw) left = Math.max(pad, vw - mw - pad);
        if (top + mh + pad > vh) top = Math.max(pad, vh - mh - pad);
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    function runTaskRowContextAction(action) {
        const idx = taskRowContextIdx;
        const item = state.items[idx];
        closeTaskRowContextMenu();
        if (!item || idx < 0) return;
        switch (action) {
            case 'edit':
                openItemEditor(item);
                break;
            case 'library': {
                const mediaPath = String(item.path || '').trim() || getSubtitlePathForItem(item) || '';
                if (mediaPath) {
                    void global.TransubFeatures?.openSubtitleLibrary?.({ mediaPath });
                } else {
                    void global.TransubFeatures?.openSubtitleLibrary?.();
                }
                break;
            }
            case 'retranslate':
                ensureContextRowSelected(idx);
                void openRetranslateModal();
                break;
            case 'reconstruct':
                // Force single selection — editor film reconstruct is one title at a time.
                state.items.forEach((it, i) => { it.selected = i === idx; });
                if (els.selectAllCheck) {
                    els.selectAllCheck.checked = state.items.length === 1;
                }
                renderList();
                updateStartButton();
                void runFilmReconstructFromSelection(state.items[idx]);
                break;
            case 'qc-fix':
                void runPostBatchQcFix(item);
                break;
            case 'qc-smart-fix':
                void runPostBatchQcSmartFix(item);
                break;
            case 'retry':
                retrySingleItem(idx);
                break;
            case 'resume':
                void resumeSingleItem(idx);
                break;
            case 'export-diagnostics':
                void exportItemDiagnostics(idx);
                break;
            case 'show-folder':
                void openItemInFolder(item);
                break;
            case 'sense-toggle':
                toggleItemSenseAdopt(item);
                break;
            case 'sense-resense':
                resenseItem(item);
                break;
            case 'remove':
                ensureContextRowSelected(idx);
                removeSelected();
                break;
            default:
                break;
        }
    }

    function bindTaskRowContextMenu() {
        if (!els.fileListBody || els.fileListBody.dataset.ctxBound) return;
        els.fileListBody.dataset.ctxBound = '1';
        els.fileListBody.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('tr[data-idx]');
            if (!row || !els.fileListBody.contains(row)) return;
            if (e.target.closest('input, textarea, select')) return;
            e.preventDefault();
            e.stopPropagation();
            const idx = Number(row.dataset.idx);
            if (!Number.isFinite(idx) || !state.items[idx]) return;
            showTaskRowContextMenu(idx, e.clientX, e.clientY);
        });
        els.taskRowContextMenu?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-task-ctx]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            runTaskRowContextAction(btn.getAttribute('data-task-ctx'));
        });
        els.taskRowContextMenu?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        document.addEventListener('click', (e) => {
            if (!isTaskRowContextMenuOpen()) return;
            if (els.taskRowContextMenu.contains(e.target)) return;
            closeTaskRowContextMenu();
        }, true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isTaskRowContextMenuOpen()) {
                e.preventDefault();
                e.stopPropagation();
                closeTaskRowContextMenu();
            }
        }, true);
        els.listScroll?.addEventListener('scroll', () => {
            if (isTaskRowContextMenuOpen()) closeTaskRowContextMenu();
            if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
        }, { passive: true });
        window.addEventListener('resize', () => {
            if (isTaskRowContextMenuOpen()) closeTaskRowContextMenu();
            if (isTaskColContextMenuOpen()) closeTaskColContextMenu();
        });
    }

    function bindListActions() {
        if (!els.fileListBody || els.fileListBody.dataset.actionsBound) return;
        els.fileListBody.dataset.actionsBound = '1';
        bindTaskTableColumns();
        bindTaskRowContextMenu();
        els.fileListBody.addEventListener('click', (e) => {
            const focusRow = e.target.closest('tr[data-idx]');
            if (focusRow && !e.target.closest('input[type="checkbox"]')) {
                const focusItem = state.items[Number(focusRow.dataset.idx)];
                if (focusItem) setFocusedTaskPath(focusItem.path);
            }
            const resenseBtn = e.target.closest('[data-sense-resense]');
            if (resenseBtn) {
                e.preventDefault();
                e.stopPropagation();
                resenseItem(state.items[Number(resenseBtn.dataset.senseResense)]);
                return;
            }
            const recoverBtn = e.target.closest('[data-sense-recover]');
            if (recoverBtn) {
                e.preventDefault();
                e.stopPropagation();
                const idx = Number(recoverBtn.getAttribute('data-sense-recover-idx'));
                applySenseRecoveryAction(
                    recoverBtn.getAttribute('data-sense-recover'),
                    Number.isFinite(idx) ? state.items[idx] : null,
                );
                return;
            }
            const batchRecoverBtn = e.target.closest('[data-batch-recover]');
            if (batchRecoverBtn) {
                e.preventDefault();
                e.stopPropagation();
                applyBatchRecoveryAction(
                    batchRecoverBtn.getAttribute('data-batch-recover'),
                    Number(batchRecoverBtn.getAttribute('data-batch-recover-idx')),
                );
                return;
            }
            const toggleSenseBtn = e.target.closest('[data-sense-toggle]');
            if (toggleSenseBtn) {
                e.preventDefault();
                e.stopPropagation();
                toggleItemSenseAdopt(state.items[Number(toggleSenseBtn.dataset.senseToggle)]);
                return;
            }
            const retryBtn = e.target.closest('[data-retry-idx]');
            if (retryBtn) {
                e.preventDefault();
                e.stopPropagation();
                retrySingleItem(Number(retryBtn.dataset.retryIdx));
                return;
            }
            const resumeBtn = e.target.closest('[data-resume-idx]');
            if (resumeBtn) {
                e.preventDefault();
                e.stopPropagation();
                void resumeSingleItem(Number(resumeBtn.dataset.resumeIdx));
                return;
            }
            const diagBtn = e.target.closest('[data-diag-idx]');
            if (diagBtn) {
                e.preventDefault();
                e.stopPropagation();
                void exportItemDiagnostics(Number(diagBtn.dataset.diagIdx));
                return;
            }
            const errToggle = e.target.closest('[data-error-toggle]');
            if (errToggle) {
                e.preventDefault();
                e.stopPropagation();
                const idx = Number(errToggle.dataset.errorToggle);
                if (expandedErrorRows.has(idx)) expandedErrorRows.delete(idx);
                else expandedErrorRows.add(idx);
                refreshListRowByIndex(idx);
                return;
            }
            const qcFixRowBtn = e.target.closest('[data-qc-fix]');
            if (qcFixRowBtn) {
                e.preventDefault();
                e.stopPropagation();
                void runPostBatchQcFix(state.items[Number(qcFixRowBtn.dataset.qcFix)]);
                return;
            }
            const qcSmartFixRowBtn = e.target.closest('[data-qc-smart-fix]');
            if (qcSmartFixRowBtn) {
                e.preventDefault();
                e.stopPropagation();
                void runPostBatchQcSmartFix(state.items[Number(qcSmartFixRowBtn.dataset.qcSmartFix)]);
                return;
            }
            const openEditorBtn = e.target.closest('[data-open-editor]');
            if (openEditorBtn) {
                e.preventDefault();
                e.stopPropagation();
                openItemEditor(state.items[Number(openEditorBtn.dataset.openEditor)]);
                return;
            }
            const qcBtn = e.target.closest('[data-qc-open]');
            if (qcBtn) {
                e.preventDefault();
                e.stopPropagation();
                openItemEditor(state.items[Number(qcBtn.dataset.qcOpen)]);
                return;
            }
            const btn = e.target.closest('[data-show-folder]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            const item = state.items[idx];
            if (item) {
                openItemInFolder(item);
                return;
            }
            const path = btn.getAttribute('data-show-folder');
            if (path) {
                electron?.showInFolder?.(path);
            }
        });
        els.fileListBody.addEventListener('dblclick', (e) => {
            if (e.target.closest('input,button,a,select,label')) return;
            const row = e.target.closest('tr[data-idx]');
            if (!row) return;
            openItemEditor(state.items[Number(row.dataset.idx)]);
        });
    }

    function bindTaskLibraryRail() {
        // Main-window library side rail removed; open library via header / row context menu.
    }

    function bindJobEventListeners() {
        if (!electron || bindJobEventListeners.done) return;
        bindJobEventListeners.done = true;
        electron.onSubtitleTaskJobStart?.((payload) => onJobStart(payload));
        electron.onTransWithAiProgress?.((payload) => onProgress(payload));
        electron.onSubtitleTaskJobFinished?.((payload) => {
            onJobFinished(payload);
            if (state.focusedTaskPath) void refreshTaskLibraryRail();
        });
        electron.onTransubComputeTaskChanged?.((payload) => {
            state.computeBusy = !!payload?.busy;
            state.computeBusyLabel = payload?.busy
                ? String(payload.label || payload.kind || '').trim()
                : '';
            state.computeBusySince = payload?.busy
                ? (Number(payload.since) || state.computeBusySince || Date.now())
                : 0;
            state.computeBusyOwner = payload?.busy ? String(payload.owner || '').trim() : '';
            state.computeBusyKind = payload?.busy ? String(payload.kind || '').trim() : '';
            updateStartButton();
            updateStopButton();
        });
        void (async () => {
            try {
                const st = await electron.transubComputeTaskStatus?.();
                if (st?.busy) {
                    state.computeBusy = true;
                    state.computeBusyLabel = String(st.label || st.kind || '').trim();
                    state.computeBusySince = Number(st.since) || Date.now();
                    state.computeBusyOwner = String(st.owner || '').trim();
                    state.computeBusyKind = String(st.kind || '').trim();
                    updateStartButton();
                    updateStopButton();
                }
            } catch { /* ignore */ }
        })();
    }
    bindJobEventListeners.done = false;

    function bindEvents() {
        if (!electron) return;

        if (!isStandaloneSettings) {
            bindListActions();
            setupDragDrop();
            bindPostTaskMenu();
            bindAddMenu();
            bindMainUiExtras();
            els.removeSelectedBtn?.addEventListener('click', removeSelected);
            els.clearListBtn?.addEventListener('click', clearList);
            els.startBtn?.addEventListener('click', () => {
                void startSubtitleGeneration();
            });
            els.retranslateBtn?.addEventListener('click', () => {
                void openRetranslateModal();
            });
            els.reconstructBtn?.addEventListener('click', () => {
                void runFilmReconstructFromSelection();
            });
            els.retranslateCancelBtn?.addEventListener('click', () => closeRetranslateModal());
            els.retranslateConfirmBtn?.addEventListener('click', () => {
                void runRetranslateFromModal();
            });
            els.retranslateModal?.addEventListener('click', (event) => {
                if (event.target === els.retranslateModal) closeRetranslateModal();
            });
            [
                els.retranslateModeEngine,
                els.retranslateModeLlm,
                els.retranslateModeSmart,
            ].forEach((radio) => {
                radio?.addEventListener('change', () => syncRetranslateModalModelUi());
            });
            els.retranslateSmartHybridCheck?.addEventListener('change', () => {
                syncRetranslateModalModelUi();
            });
            els.retranslateSmartPolishCheck?.addEventListener('change', () => {
                syncRetranslateModalModelUi();
            });
            els.selectAllCheck?.addEventListener('change', () => {
                const checked = els.selectAllCheck.checked;
                state.items.forEach((i) => { i.selected = checked; });
                renderList();
                updateStartButton();
                focusTaskFromSelection();
            });
        }
        bindTaskLibraryRail();
        applyUiPrefs();
        void hydrateAppThemeFromMain();
        try {
            electron?.onAppThemeChanged?.((payload) => {
                const theme = payload?.theme === 'dark' ? 'dark' : 'light';
                syncLocalThemeKeys(theme);
                applyUiPrefs();
            });
        } catch (_) { /* ignore */ }
        els.saveParamsBtn?.addEventListener('click', () => {
            void saveParamsSettings({ closeAfter: false });
        });
        els.saveAndCloseParamsBtn?.addEventListener('click', () => {
            void saveParamsSettings({ closeAfter: true });
        });
        bindResourceUsageSetting();
        els.openFeedbackBtn?.addEventListener('click', () => {
            void (async () => {
                try {
                    const res = await electron?.openExternal?.(GITHUB_ISSUES_URL);
                    if (res?.ok === false) {
                        showToast(res?.error || '无法打开反馈页面', 'err');
                        return;
                    }
                    showToast('已在浏览器中打开 GitHub Issues', 'ok');
                } catch (err) {
                    showToast(err?.message || '无法打开反馈页面', 'err');
                }
            })();
        });
        els.openParamsBtn?.addEventListener('click', () => {
            openAppSettings('runtime');
        });
        els.clearSenseMemoryBtn?.addEventListener('click', () => {
            void clearSenseMemoryFromSettings();
        });
        els.closeParamsBtn?.addEventListener('click', () => closeParamsModal(settingsFormDirty));
        els.cancelParamsBtn?.addEventListener('click', () => closeParamsModal(settingsFormDirty));
        els.paramsModal?.addEventListener('click', (event) => {
            if (isStandaloneSettings) return;
            if (event.target === els.paramsModal) closeParamsModal(settingsFormDirty);
        });
        bindSettingsTips();
        bindSettingsSearch();
        bindSettingsGuideLinks();
        els.paramsTabBtns?.forEach((btn) => {
            btn.addEventListener('click', () => {
                closeAllSettingsTips();
                switchParamsTab(btn.dataset.tab);
            });
        });
        const densityCheck = document.getElementById('settingsDensityCompactCheck');
        if (densityCheck && densityCheck.dataset.bound !== '1') {
            densityCheck.dataset.bound = '1';
            try {
                densityCheck.checked = localStorage.getItem('transub.density') === 'compact';
            } catch (_) { /* ignore */ }
            densityCheck.addEventListener('change', () => {
                const next = densityCheck.checked ? 'compact' : 'comfort';
                try { localStorage.setItem('transub.density', next); } catch (_) { /* ignore */ }
                document.body.classList.toggle('density-compact', next === 'compact');
                if (els.toggleDensityLabel) {
                    els.toggleDensityLabel.textContent = next === 'compact' ? '舒适列表' : '紧凑列表';
                }
            });
        }
        const uiZoomSelect = document.getElementById('settingsUiZoomSelect');
        if (uiZoomSelect && uiZoomSelect.dataset.bound !== '1') {
            uiZoomSelect.dataset.bound = '1';
            const syncUiZoomSelect = async () => {
                if (!electron?.transubGetUiZoom) return;
                try {
                    const res = await electron.transubGetUiZoom();
                    if (!res?.ok) return;
                    const v = res.uiZoom;
                    const asStr = v === 'auto' || v == null ? 'auto' : String(v);
                    if ([...uiZoomSelect.options].some((o) => o.value === asStr)) {
                        uiZoomSelect.value = asStr;
                    } else {
                        uiZoomSelect.value = 'auto';
                    }
                } catch (_) { /* ignore */ }
            };
            void syncUiZoomSelect();
            uiZoomSelect.addEventListener('change', () => {
                const raw = String(uiZoomSelect.value || 'auto');
                const uiZoom = raw === 'auto' ? 'auto' : Number(raw);
                void electron?.transubSetUiZoom?.({ uiZoom });
            });
        }
        if (els.uiLocaleSelect && els.uiLocaleSelect.dataset.bound !== '1') {
            els.uiLocaleSelect.dataset.bound = '1';
            els.uiLocaleSelect.addEventListener('change', () => {
                const next = window.TransubI18n?.normalizeUiLocale?.(els.uiLocaleSelect.value)
                    || (els.uiLocaleSelect.value === 'zh-Hant-TW' ? 'zh-Hant-TW' : 'zh-Hans');
                els.uiLocaleSelect.value = next;
                window.TransubI18n?.setLocale?.(next, { apply: true, persist: true });
                void persistFormOptionsQuiet();
            });
        }
        electron?.onOpenParams?.((payload) => {
            const tab = String(payload?.tab || 'runtime').trim() || 'runtime';
            const openLibrary = !!payload?.openLibrary;
            if (!isStandaloneSettings) {
                openAppSettings(tab, {
                    wizard: !!payload?.wizard,
                    forceWizard: !!payload?.forceWizard,
                    openLibrary,
                });
                void electron?.transubConsumePendingOpenParams?.();
                return;
            }
            openParamsModal(tab);
            void electron?.transubConsumePendingOpenParams?.();
            if (openLibrary) {
                void openEngineModelsLibrary({ refresh: true });
            }
            if (payload?.wizard) {
                // Explicit wizard open from main → force; avoid confirm swallowing the UI.
                const force = payload.forceWizard !== false;
                const open = () => global.TransubSetupWizard?.open?.({ force });
                if (!open()) {
                    setTimeout(() => open(), 80);
                    setTimeout(() => open(), 200);
                }
            }
        });
        electron?.onSettingsUpdated?.((payload) => {
            const options = payload?.options;
            if (!options || typeof options !== 'object') return;
            if (isStandaloneSettings && settingsFormDirty) return;
            void (async () => {
                await applyOptionsToForm(options);
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                markSettingsDirty(false);
                updateParamsSummary();
                syncResourceUsageMonitor();
            })();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || els.paramsModal?.classList.contains('hidden')) return;
            const setupWizard = document.getElementById('setupWizardModal');
            if (setupWizard && !setupWizard.classList.contains('hidden')) return;
            const presetNameModal = document.getElementById('presetNameModal');
            if (presetNameModal && !presetNameModal.classList.contains('hidden')) {
                presetNameModal.classList.add('hidden');
                event.preventDefault();
                return;
            }
            closeParamsModal(settingsFormDirty);
        });
        els.installTestBtn?.addEventListener('click', testInstall);
        els.installCheckUpdateBtn?.addEventListener('click', () => {
            void checkTransWithAiEngineUpdate();
        });
        els.installBrowseBtn?.addEventListener('click', browseInstallPath);
        els.engineBackendSelect?.addEventListener('change', () => {
            syncEngineBackendUi();
            updateEnvBanner();
            if (readEngineBackendFromForm() !== 'twai') {
                void refreshEngineModels({ silent: true });
            }
        });
        els.engineInstallBrowseBtn?.addEventListener('click', async () => {
            const res = await electron?.selectFolder?.({ title: '选择 Transub Engine 目录' });
            if (res?.ok && !res.canceled && res.path && els.engineInstallPathInput) {
                els.engineInstallPathInput.value = res.path;
                await refreshEngineStatus();
            }
        });
        els.engineInstallUseBundledBtn?.addEventListener('click', async () => {
            let res = null;
            try {
                res = await electron?.transubEngineBundledPath?.();
            } catch (err) {
                setEngineStatusText(err?.message || '无法读取内置引擎路径', 'err');
                return;
            }
            if (!res?.ok || !res.path) {
                setEngineStatusText(res?.error || '未找到内置引擎目录（transub-engine）', 'err');
                return;
            }
            if (!res.present) {
                setEngineStatusText(
                    `未找到内置引擎目录：${res.path}（需含 ENGINE_ROOT 或 runtime\\python.exe）`,
                    'err',
                );
                return;
            }
            cachedBundledEnginePath = String(res.path);
            if (els.engineInstallPathInput) {
                els.engineInstallPathInput.value = cachedBundledEnginePath;
                els.engineInstallPathInput.placeholder = cachedBundledEnginePath;
            }
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
            await refreshEngineStatus();
        });
        els.engineHfMirrorPresetBtn?.addEventListener('click', () => {
            if (els.engineHfEndpointInput) els.engineHfEndpointInput.value = 'https://hf-mirror.com';
            setNetworkHfStatus('已填入国内镜像 https://hf-mirror.com，请保存设置后重新下载', 'ok');
        });
        els.engineHfOfficialPresetBtn?.addEventListener('click', () => {
            if (els.engineHfEndpointInput) els.engineHfEndpointInput.value = '';
            setNetworkHfStatus('已改为直连官方 Hugging Face，请保存设置后重试', 'ok');
        });
        els.engineHfTestBtn?.addEventListener('click', async () => {
            const payload = {
                hfEndpoint: els.engineHfEndpointInput?.value?.trim() || '',
                ...readProxyOptionsFromForm(),
            };
            setNetworkHfStatus('测试中…', 'busy');
            if (els.engineHfTestBtn) els.engineHfTestBtn.disabled = true;
            try {
                const res = await electron?.transubTestHfEndpoint?.(payload);
                if (res?.ok) {
                    setNetworkHfStatus(res.message || '连接成功', 'ok');
                } else {
                    setNetworkHfStatus(res?.error || '连接失败', 'err');
                }
            } catch (err) {
                setNetworkHfStatus(err?.message || String(err), 'err');
            } finally {
                if (els.engineHfTestBtn) els.engineHfTestBtn.disabled = false;
            }
        });
        els.proxyEnabledCheck?.addEventListener('change', () => {
            syncProxySettingsUi();
        });
        els.proxyTestBtn?.addEventListener('click', async () => {
            const payload = readProxyOptionsFromForm();
            setProxyTestStatus('测试中…', 'busy');
            if (els.proxyTestBtn) els.proxyTestBtn.disabled = true;
            try {
                const res = await electron?.transubTestProxy?.(payload);
                if (res?.ok) {
                    setProxyTestStatus(res.message || '连接成功', 'ok');
                } else {
                    setProxyTestStatus(res?.error || '连接失败', 'err');
                }
            } catch (err) {
                setProxyTestStatus(err?.message || String(err), 'err');
            } finally {
                if (els.proxyTestBtn) els.proxyTestBtn.disabled = false;
                syncProxySettingsUi();
            }
        });
        els.engineTestBtn?.addEventListener('click', async () => {
            const btn = els.engineTestBtn;
            const prevLabel = btn?.textContent || '检测引擎';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '检测中…';
            }
            try {
                const res = await refreshEngineStatus();
                if (res?.ok) {
                    appendLog(els.engineStatus?.textContent || '引擎就绪', 'ok');
                } else {
                    appendLog(res?.error || '引擎未就绪', 'err');
                }
                await showEngineTestResultDialog(res);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = prevLabel;
                }
            }
        });
        els.engineCancelDownloadBtn?.addEventListener('click', () => {
            if (engineDownloadActiveSource === 'managed') {
                void electron?.transubAdvancedManagedLlmCancelPull?.();
            } else {
                void electron?.transubEngineCancelDownload?.();
            }
            appendEngineDownloadLog('已请求取消');
            setEngineDownloadProgressVisible(true, '正在取消…');
        });
        els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                setEngineModelsFilter(btn.getAttribute('data-models-filter') || 'all');
            });
        });
        els.engineModelsSearch?.addEventListener('input', () => {
            engineModelsSearchQuery = String(els.engineModelsSearch.value || '');
            renderEngineModelsCards();
        });
        els.engineModelsList?.addEventListener('click', (event) => {
            const btn = event.target.closest?.('[data-model-action]');
            if (!btn || !els.engineModelsList.contains(btn)) return;
            const id = String(btn.getAttribute('data-model-id') || '').trim();
            const action = btn.getAttribute('data-model-action');
            if (!id) return;
            if (action === 'download') {
                void downloadEngineModels({ modelIds: [id] });
            } else if (action === 'manual') {
                void manualManagedLlmDownload(id);
            } else if (action === 'manual-hub') {
                void manualEngineHubModelDownload(id);
            }
        });
        els.engineEnsureGpuBtn?.addEventListener('click', () => {
            void ensureEngineGpuSupport({ force: false });
        });
        els.engineManualGpuBtn?.addEventListener('click', () => {
            void manualEngineDownloadInstall({ kinds: ['gpu'] });
        });
        if (electron?.onAdvancedManagedLlmProgress) {
            electron.onAdvancedManagedLlmProgress((p) => {
                if (!p || engineDownloadActiveSource !== 'managed') return;
                const phase = String(p.phase || '');
                const msg = String(p.message || '').trim();
                const sizeLine = formatEngineDownloadSizeLine(p);
                const sizeAlreadyInMsg = !!(sizeLine && msg && /\/\s*[\d.]+\s*(B|KB|MB|GB)/i.test(msg));
                const displayMsg = msg && sizeLine && !sizeAlreadyInMsg
                    ? `${msg} · ${sizeLine}`
                    : (msg || sizeLine);
                if (Number.isFinite(Number(p.pct ?? p.percent))) {
                    setEngineDownloadProgressPct(p.pct ?? p.percent);
                }
                if (displayMsg) {
                    setEngineDownloadProgressVisible(true, displayMsg);
                    if (msg) appendEngineDownloadLog(msg);
                    if (phase === 'done') setEngineDownloadProgressPct(100);
                    else if (phase === 'progress' || phase === 'start') {
                        appendAppEngineDownloadProgressLog(displayMsg, { force: phase === 'start' });
                        setEngineStatusText(displayMsg, 'busy');
                    }
                }
            });
        }
        if (electron?.onEngineDownloadProgress) {
            electron.onEngineDownloadProgress((p) => {
                if (!p) return;
                const phase = String(p.phase || '');
                const msg = String(p.message || '').trim();
                const sizeLine = formatEngineDownloadSizeLine(p);
                const sizeAlreadyInMsg = !!(sizeLine && msg && /\/\s*[\d.]+\s*(B|KB|MB|GB)/i.test(msg));
                const displayMsg = msg && sizeLine && !sizeAlreadyInMsg
                    ? `${msg} · ${sizeLine}`
                    : (msg || sizeLine);
                if (Number.isFinite(Number(p.pct ?? p.percent))) {
                    setEngineDownloadProgressPct(p.pct ?? p.percent);
                }
                if (displayMsg && (phase === 'progress' || phase === 'done' || phase === 'error' || phase === 'cancelled' || phase === 'start')) {
                    setEngineDownloadProgressVisible(true, displayMsg);
                    // Log message text only (size ticks live on the progress line).
                    if (msg) appendEngineDownloadLog(msg);
                    if (phase === 'done') {
                        appendLog(msg || displayMsg, 'ok');
                        setEngineStatusText(msg || displayMsg, 'ok');
                        setEngineDownloadProgressPct(100);
                        void refreshEngineModels({ silent: true });
                        void refreshEngineGpuStatus({ silent: true });
                        void refreshEngineDemucsStatus({ silent: true });
                    } else if (phase === 'error' || phase === 'cancelled') {
                        appendLog(msg || displayMsg, phase === 'cancelled' ? 'warn' : 'err');
                        setEngineStatusText(msg || displayMsg, phase === 'cancelled' ? 'warn' : 'err');
                        void refreshEngineDemucsStatus({ silent: true });
                    } else if (phase === 'progress' || phase === 'start') {
                        appendAppEngineDownloadProgressLog(displayMsg, { force: phase === 'start' });
                        setEngineStatusText(displayMsg, 'busy');
                    }
                } else if (sizeLine && phase === 'progress') {
                    setEngineDownloadProgressVisible(true, sizeLine);
                    appendAppEngineDownloadProgressLog(sizeLine);
                    setEngineStatusText(sizeLine, 'busy');
                }
            });
        }
        els.engineRefreshModelsBtn?.addEventListener('click', async () => {
            const btn = els.engineRefreshModelsBtn;
            const prevLabel = btn?.textContent || '刷新状态';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '刷新中…';
            }
            try {
                const res = await refreshEngineModels({ silent: false });
                if (res?.ok || cachedEngineModels.length) {
                    const list = res.models || cachedEngineModels;
                    const installed = list.filter((m) => m.installed).length;
                    const total = list.length;
                    const msg = `模型状态已刷新：已安装 ${installed} / ${total}`;
                    appendLog(msg, 'ok');
                    setEngineStatusText(msg, 'ok');
                    await appConfirm({
                        title: '模型状态',
                        message: msg,
                        primaryLabel: '确定',
                        hideSecondary: true,
                    });
                } else {
                    const err = res?.error || '刷新模型状态失败';
                    appendLog(err, 'err');
                    await appConfirm({
                        title: '刷新失败',
                        message: err,
                        primaryLabel: '确定',
                        hideSecondary: true,
                    });
                }
            } finally {
                if (btn) {
                    btn.disabled = !!engineModelsBusy;
                    btn.textContent = prevLabel;
                }
            }
        });
        els.engineRefreshModelsSummaryBtn?.addEventListener('click', async () => {
            const btn = els.engineRefreshModelsSummaryBtn;
            if (btn) btn.disabled = true;
            try {
                const res = await refreshEngineModels({ silent: false });
                if (res?.code === 'compute_busy' || res?.deferred) {
                    showToast('任务进行中，暂不刷新', 'warn');
                } else if (res?.ok || cachedEngineModels.length) {
                    showToast('模型状态已刷新', 'ok');
                } else {
                    showToast(res?.error || '刷新失败', 'warn');
                }
            } finally {
                if (btn) btn.disabled = !!engineModelsBusy;
            }
        });
        els.openEngineModelsLibraryBtn?.addEventListener('click', () => {
            void openEngineModelsLibrary({ refresh: true });
        });
        els.closeEngineModelsLibraryBtn?.addEventListener('click', () => {
            closeEngineModelsLibrary();
        });
        els.engineModelsLibraryModal?.addEventListener('click', (event) => {
            if (event.target === els.engineModelsLibraryModal) closeEngineModelsLibrary();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!isEngineModelsLibraryOpen()) return;
            event.preventDefault();
            event.stopPropagation();
            closeEngineModelsLibrary();
        }, true);
        els.ffmpegBrowseBtn?.addEventListener('click', browseFfmpegPath);
        els.ffmpegFolderBtn?.addEventListener('click', browseFfmpegFolder);
        els.ffmpegTestBtn?.addEventListener('click', () => refreshFfmpegStatus({ quick: false }));
        els.deviceSelect?.addEventListener('change', () => {
            syncBatchSizeUi();
            syncDeviceOptionsForMode();
            syncExpertCustomHints();
            updateParamsSummary();
            syncMtModelChipUi();
        });
        els.logLevelSelect?.addEventListener('change', () => {
            syncLogLevelHint();
            syncExpertCustomHints();
        });
        els.taskSelect?.addEventListener('change', () => {
            syncChineseSubtitleVariantUi();
            updateParamsSummary();
        });
        els.mergeBilingualCheck?.addEventListener('change', () => {
            syncMergeBilingualUi();
            updateParamsSummary();
        });
        els.mergeBilingualOrderSelect?.addEventListener('change', () => {
            updateParamsSummary();
        });
        els.filmAudioEnhanceCheck?.addEventListener('change', () => {
            if (els.filmAudioEnhanceCheck?.checked) {
                const n = audioMutexApi.applyFilmEnhanceOn
                    ? audioMutexApi.applyFilmEnhanceOn({
                        filmAudioEnhance: true,
                        filmVadPreset: !!els.filmVadPresetCheck?.checked,
                        vadSensitive: !!els.vadSensitiveCheck?.checked,
                        audioLightDenoise: !!els.audioLightDenoiseCheck?.checked,
                    })
                    : {
                        filmVadPreset: false,
                        vadSensitive: false,
                        audioLightDenoise: false,
                    };
                if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = !!n.filmVadPreset;
                if (els.vadSensitiveCheck) els.vadSensitiveCheck.checked = !!n.vadSensitive;
                if (els.quickVadSensitiveCheck) {
                    els.quickVadSensitiveCheck.checked = !!n.vadSensitive;
                }
                if (els.audioLightDenoiseCheck) {
                    els.audioLightDenoiseCheck.checked = !!n.audioLightDenoise;
                }
            }
            updateParamsSummary();
        });
        els.filmVadPresetCheck?.addEventListener('change', () => {
            if (els.filmVadPresetCheck?.checked && els.filmAudioEnhanceCheck) {
                els.filmAudioEnhanceCheck.checked = false;
            }
            updateParamsSummary();
        });
        els.audioLightDenoiseCheck?.addEventListener('change', () => {
            if (els.audioLightDenoiseCheck?.checked) {
                const n = audioMutexApi.applyLightDenoiseOn
                    ? audioMutexApi.applyLightDenoiseOn({
                        audioLightDenoise: true,
                        filmAudioEnhance: !!els.filmAudioEnhanceCheck?.checked,
                    })
                    : { filmAudioEnhance: false };
                if (els.filmAudioEnhanceCheck) {
                    els.filmAudioEnhanceCheck.checked = !!n.filmAudioEnhance;
                }
            }
            updateParamsSummary();
        });
        els.smartTranslateCheck?.addEventListener('change', () => {
            syncSmartTranslateUi();
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.smartTranslateFaithfulCheck?.addEventListener('change', () => {
            if (els.quickFaithfulCheck) {
                els.quickFaithfulCheck.checked = !!els.smartTranslateFaithfulCheck.checked;
            }
            updateParamsSummary();
        });
        els.smartTranslateHybridCheck?.addEventListener('change', () => {
            syncTranslateChipUi();
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.smartTranslatePolishCheck?.addEventListener('change', () => {
            syncTranslateChipUi();
            updateParamsSummary();
        });
        els.deleteSourcesAfterMergeCheck?.addEventListener('change', updateParamsSummary);
        els.transcribeModelSelect?.addEventListener('change', () => {
            setModelPathOnForm('transcribe', els.transcribeModelSelect.value, { syncSelect: false });
            applyAutoDetectedModelsFromCache();
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.translateModelSelect?.addEventListener('change', () => {
            setModelPathOnForm('translate', els.translateModelSelect.value, { syncSelect: false });
            applyAutoDetectedModelsFromCache();
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.transcribeModelPathInput?.addEventListener('change', () => {
            syncModelSelectToPath('transcribe', readModelPathFromForm('transcribe'));
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.translateModelPathInput?.addEventListener('change', () => {
            syncModelSelectToPath('translate', readModelPathFromForm('translate'));
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.transcribeModelBrowseBtn?.addEventListener('click', () => {
            void browseModelPath('transcribe');
        });
        els.translateModelBrowseBtn?.addEventListener('click', () => {
            void browseModelPath('translate');
        });
        els.installPathInput?.addEventListener('change', () => {
            void refreshModelSelects(buildSavedOptionsFromForm());
        });
        els.overwriteCheck?.addEventListener('change', updateParamsSummary);
        ['subFormatSrt', 'subFormatVtt', 'subFormatAss', 'subFormatLrc'].forEach((id) => {
            els[id]?.addEventListener('change', updateParamsSummary);
        });
        els.vadEnabledCheck?.addEventListener('change', syncExpertCustomHints);
        els.vadSensitiveCheck?.addEventListener('change', () => {
            if (els.vadSensitiveCheck?.checked && els.vadAggressiveCheck) {
                els.vadAggressiveCheck.checked = false;
            }
            if (els.vadSensitiveCheck?.checked && els.engineVadModelSelect) {
                els.engineVadModelSelect.value = 'whisperseg-asmr';
                // WhisperSeg only works with Whisper ASR (not SenseVoice / FunASR).
                const asrNow = String(els.engineAsrModelSelect?.value || '').toLowerCase();
                if (els.engineAsrModelSelect && !asrNow.includes('whisper')) {
                    const prefer = [...els.engineAsrModelSelect.options].some((o) => o.value === 'whisper-large-v3-turbo')
                        ? 'whisper-large-v3-turbo'
                        : ([...els.engineAsrModelSelect.options].find((o) => String(o.value).includes('whisper'))?.value || '');
                    if (prefer) {
                        els.engineAsrModelSelect.value = prefer;
                        appendLog(`灵敏检出：ASR 已从 SenseVoice 切换为 ${prefer}（WhisperSeg 仅支持 Whisper）`, 'info');
                    }
                }
                // Align expert knobs with Engine WhisperSeg sensitive preset (JA AV soft recall).
                if (els.vadThresholdInput) els.vadThresholdInput.value = '0.18';
                if (els.vadMinSpeechDurationInput) els.vadMinSpeechDurationInput.value = '60';
                if (els.vadMinSilenceDurationInput) els.vadMinSilenceDurationInput.value = '140';
                if (els.vadSpeechPadInput) els.vadSpeechPadInput.value = '350';
                if (els.hallucinationSilenceInput && !String(els.hallucinationSilenceInput.value || '').trim()) {
                    els.hallucinationSilenceInput.value = '4';
                }
                if (els.audioLightDenoiseCheck) els.audioLightDenoiseCheck.checked = false;
                if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
                if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
                if (audioMutexApi.applySensitiveOn) {
                    const n = audioMutexApi.applySensitiveOn({
                        vadSensitive: true,
                        filmAudioEnhance: true,
                        filmVadPreset: true,
                        audioLightDenoise: true,
                    });
                    if (els.filmAudioEnhanceCheck) {
                        els.filmAudioEnhanceCheck.checked = !!n.filmAudioEnhance;
                    }
                    if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = !!n.filmVadPreset;
                    if (els.audioLightDenoiseCheck) {
                        els.audioLightDenoiseCheck.checked = !!n.audioLightDenoise;
                    }
                }
                setSaveParamsStatus('灵敏检出：Whisper ASR + whisperseg-asmr（请确认两者已下载）', 'warn');
                appendLog('灵敏检出：VAD 已切换为 whisperseg-asmr，请确认模型已下载', 'info');
            }
            if (els.quickVadSensitiveCheck) {
                els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
            }
            mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
            mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
            syncExpertCustomHints();
            syncExpertExtraChipsUi();
        });
        els.engineAsrModelSelect?.addEventListener('change', () => {
            updateAsrWindowTip();
            const asr = String(els.engineAsrModelSelect?.value || '').toLowerCase();
            if (!asr.includes('whisper')) {
                if (els.vadSensitiveCheck?.checked) {
                    els.vadSensitiveCheck.checked = false;
                }
                const vadNow = String(els.engineVadModelSelect?.value || '').toLowerCase();
                if (
                    els.engineVadModelSelect
                    && (
                        vadNow.includes('whisperseg')
                        || vadNow === 'silero-vad'
                        || vadNow === 'silero'
                    )
                ) {
                    els.engineVadModelSelect.value = 'fsmn-vad';
                    setSaveParamsStatus('SenseVoice 仅支持 fsmn-vad，已自动切换', 'warn');
                    appendLog('ASR 为 SenseVoice：VAD 已改回 fsmn-vad（Silero/WhisperSeg 仅支持 Whisper）', 'info');
                }
            }
            mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
            mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
            if (els.quickVadSensitiveCheck) {
                els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
            }
            syncExpertCustomHints();
            syncExpertExtraChipsUi();
            // Settings / recommend / quick-ASR may change the model while a preset chip is shown.
            adoptManualAsrFromUserChange({ persist: false });
        });
        els.vadAggressiveCheck?.addEventListener('change', () => {
            if (els.vadAggressiveCheck?.checked && els.vadSensitiveCheck) {
                els.vadSensitiveCheck.checked = false;
            }
            if (els.quickVadSensitiveCheck) {
                els.quickVadSensitiveCheck.checked = !!els.vadSensitiveCheck?.checked;
            }
            syncExpertCustomHints();
            syncExpertExtraChipsUi();
        });
        els.engineVadModelSelect?.addEventListener('change', () => {
            mirrorSelectValue(els.engineVadModelSelect, els.quickVadModelSelect);
            syncExpertExtraChipsUi();
        });
        els.glossaryMtCheck?.addEventListener('change', () => {
            if (els.quickGlossaryMtCheck) {
                els.quickGlossaryMtCheck.checked = !!els.glossaryMtCheck.checked;
            }
            syncExpertExtraChipsUi();
        });
        const markDirtyFromParamsEvent = (event) => {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return;
            if (t.closest('#presetNameModal')) return;
            if (t.id === 'presetSelect') return;
            markSettingsDirty(true);
            if (els.saveParamsStatus && !/保存中|已保存失败/.test(els.saveParamsStatus.textContent || '')) {
                setSaveParamsStatus('有未保存更改', 'warn');
            }
        };
        els.paramsModal?.addEventListener('change', (event) => {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return;
            markDirtyFromParamsEvent(event);
            if (t.id === 'engineAsrModelSelect' || t.id === 'engineProfileSelect') {
                updateAsrRecommendChip();
            }
            if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                || t.id === 'retranscribeWarmLightCheck' || t.id === 'logLevelSelect'
                || t.id === 'maxBatchSizeInput') {
                syncExpertCustomHints();
            }
        });
        els.asrRecommendApplyBtn?.addEventListener('click', () => applyAsrRecommendFromChip());
        els.asrRecommendDismissBtn?.addEventListener('click', () => {
            const id = String(els.asrRecommendChip?.dataset?.recommendedAsr || '').trim();
            const profile = String(cachedHardwareRecommend?.profile || '').trim();
            asrRecommendDismissedKey = `${id}|${profile}`;
            if (els.asrRecommendChip) {
                els.asrRecommendChip.classList.add('hidden');
                els.asrRecommendChip.hidden = true;
            }
            syncQuickAsrRecommendChip();
        });
        updateAsrRecommendChip();
        els.paramsModal?.addEventListener('input', (event) => {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return;
            markDirtyFromParamsEvent(event);
            if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                || t.id === 'maxBatchSizeInput') {
                syncExpertCustomHints();
            }
        });
        els.trialCompareBtn?.addEventListener('click', () => openTrialCompareModal());
        els.closeTrialCompareBtn?.addEventListener('click', closeTrialCompareModal);
        els.closeTrialCompareBtn2?.addEventListener('click', closeTrialCompareModal);
        els.runTrialCompareBtn?.addEventListener('click', () => runTrialCompare());
        els.trialCompareModal?.addEventListener('click', (event) => {
            if (event.target === els.trialCompareModal) closeTrialCompareModal();
        });
        if (!isStandaloneSettings) {
            els.shutdownDelayInput?.addEventListener('change', syncPostTaskToMain);
            els.shutdownDelayInput?.addEventListener('click', (event) => event.stopPropagation());
            els.stopBtn?.addEventListener('click', stopTask);
            els.openSubtitleFileBtn?.addEventListener('click', () => {
                global.TransubSubtitleEditor?.openWelcome?.();
            });
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-edit-sub]');
                if (!btn) return;
                e.preventDefault();
                global.TransubSubtitleEditor?.openEditor?.(
                    btn.getAttribute('data-edit-sub'),
                    btn.getAttribute('data-edit-video') || '',
                );
            });
            bindJobEventListeners();
        }
    }

    async function runBackgroundStartupChecks() {
        // Keep first paint light: only a quick FFmpeg path check; defer install probe.
        try {
            await refreshFfmpegStatus({ quick: true, persist: false });
        } catch (_) { /* ignore */ }

        const schedule = global.requestIdleCallback
            || ((cb) => setTimeout(() => cb({ didTimeout: false }), 2200));
        schedule(async () => {
            try {
                const backend = readEngineBackendFromForm();
                await Promise.all([
                    backend === 'twai'
                        ? refreshInstallStatus({ quick: true })
                        : refreshEngineStatus(),
                    refreshFfmpegStatus({ quick: false, persist: false }),
                ]);
            } catch (_) { /* ignore */ }
        }, { timeout: 4000 });
    }

    async function fillAppVersionLabel() {
        if (!els.appVersionLabel) return;
        let ver = '';
        if (typeof electron?.getAppVersion === 'function') {
            try {
                const res = await electron.getAppVersion();
                ver = String(res?.version || '').trim();
            } catch (_) { /* ignore */ }
        }
        ver = ver.replace(/^v/i, '');
        els.appVersionLabel.textContent = ver ? `v${ver}` : '';
    }

    async function init() {
        if (isStandaloneSettings) {
            document.documentElement.classList.add('settings-standalone');
            document.title = 'Transub 设置';
        } else if (isStandaloneWizard) {
            document.documentElement.classList.add('wizard-standalone');
            document.title = 'Transub 设置向导';
        }

        cacheEls();
        syncQuickExtrasBar();
        void fillAppVersionLabel();
        bindEvents();
        syncDeviceOptionsForMode();
        syncExpertCustomHints();
        if (!isStandaloneChrome) {
            setBadge('空闲', 'idle');
        }
        syncBatchSizeUi();
        syncLogLevelHint();
        syncChineseSubtitleVariantUi();
        if (!isStandaloneChrome) {
            syncPostTaskMenuUi();
            syncPostTaskExtrasUi();
            resetPostTaskSelect();
            renderList();
            updateStartButton();
        }

        if (!isDesktop()) {
            if (!isStandaloneChrome) appendLog('需在桌面版中使用', 'err');
            setLoading(false);
            return;
        }

        warnMissingRendererCores();

        setLoading(true, '正在加载配置…');
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                await applyOptionsToForm(optsRes.options);
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                updateParamsSummary();
            } else {
                await ensureEngineInstallPathFilled();
            }
            // Ensure recognition presets are loaded so activePresetId can bind to the chip.
            try {
                await global.TransubFeatures?.loadPresets?.();
            } catch { /* ignore */ }
            flushPendingActivePresetId();
            if (!isStandaloneChrome) {
                resetPostTaskSelect();
                await syncPostTaskToMain();
            }
        } finally {
            setLoading(false);
        }

        if (isStandaloneWizard) {
            const pending = await electron?.transubConsumePendingSetupWizard?.().catch(() => null);
            const force = pending?.forceWizard !== false
                && pageQuery.get('forceWizard') !== '0';
            const open = () => {
                if (global.TransubSetupWizard?.open) {
                    void global.TransubSetupWizard.open({ force: !!force });
                    return true;
                }
                return false;
            };
            if (!open()) {
                let n = 0;
                const timer = setInterval(() => {
                    n += 1;
                    if (open() || n >= 40) clearInterval(timer);
                }, 50);
            }
            return;
        }

        if (isStandaloneSettings) {
            const pendingParams = await electron?.transubConsumePendingOpenParams?.().catch(() => null);
            const tab = pendingParams?.tab || initialSettingsTab || 'runtime';
            openParamsModal(tab);
            if (pendingParams?.openLibrary || initialOpenModelsLibrary) {
                void openEngineModelsLibrary({ refresh: true });
            }
            void global.TransubFeatures?.loadPresets?.();
            const wantWizard = !!pendingParams?.wizard
                || pageQuery.get('wizard') === '1';
            if (wantWizard) {
                // Legacy: settings window opened with wizard=1 — prefer dedicated wizard if available.
                if (electron?.transubOpenSetupWizard) {
                    void electron.transubOpenSetupWizard({
                        forceWizard: pendingParams?.forceWizard !== false
                            && pageQuery.get('forceWizard') !== '0',
                    });
                    try { global.close(); } catch (_) { /* ignore */ }
                    return;
                }
                const force = pendingParams?.forceWizard !== false
                    && pageQuery.get('forceWizard') !== '0';
                const open = () => {
                    if (global.TransubSetupWizard?.open) {
                        void global.TransubSetupWizard.open({ force: !!force });
                        return true;
                    }
                    return false;
                };
                if (!open()) {
                    let n = 0;
                    const timer = setInterval(() => {
                        n += 1;
                        if (open() || n >= 40) clearInterval(timer);
                    }, 50);
                }
            }
            return;
        }

        void runBackgroundStartupChecks();

        try {
            electron?.onTransubLibraryStartRetranslate?.((payload) => {
                void openLibraryRetranslate(payload || {});
            });
        } catch (_) { /* ignore */ }

        try {
            const pending = await electron?.transWithAiGetPendingFiles?.();
            if (pending?.ok && pending.files?.length) {
                setLoading(true, '正在探测视频信息…');
                try {
                    await addFiles(pending.files, { withLoading: false });
                    appendLog(`已带入 ${pending.files.length} 个待处理文件`, 'info');
                } finally {
                    setLoading(false);
                }
            }

            const pendingParams = await electron?.transubConsumePendingOpenParams?.();
            if (pendingParams?.tab || pendingParams?.wizard) {
                openAppSettings(pendingParams.tab || 'runtime', {
                    wizard: !!pendingParams.wizard,
                    forceWizard: !!pendingParams.forceWizard,
                });
            }
        } catch (_) { /* ignore */ }

        global.TransubAnimeWhisperPresetTip?.maybeShow?.({
            getVersion: async () => {
                try {
                    return await electron?.getAppVersion?.();
                } catch (_) {
                    return { version: '' };
                }
            },
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    global.TransubCore = {
        appendLog,
        applyOptionsToForm,
        buildSavedOptionsFromForm,
        openParamsModal,
        openAppSettings,
        openEngineModelsLibrary,
        closeEngineModelsLibrary,
        updateEnvBanner,
        markSettingsDirty,
        setSaveParamsStatus,
        setAdvancedEntitled,
        switchParamsTab,
        addFiles,
        renderList,
        updateStartButton,
        getSelectedItems,
        resolveOutputDirFromForm,
        setAutoSenseEnabled,
        updateParamsSummary,
        syncParamsModeChipUi,
        rebuildParamsModePresetItems,
        flushPendingActivePresetId,
        applyActivePresetIdToSelect,
        syncTranslateChipUi,
        syncParamsMoreChipUi,
        openLibraryRetranslate,
        ensureRequiredModelsReadyOrPrompt,
        setSavedOptionsSnapshot: (opts) => {
            savedOptionsSnapshot = opts && typeof opts === 'object' ? opts : null;
        },
        state,
        isStandaloneSettings: () => isStandaloneSettings,
    };
}(window));
