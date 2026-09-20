/**
 * Transub — 批量字幕生成（主窗口）
 * Thin composition root: session state + helpers + domain wire installers.
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const els = {};

    /** Resolve a deferred UMD global lazily (scripts may load after app.js). */
    function lazyGlobalApi(name) {
        return new Proxy({}, {
            get(_target, prop) {
                const mod = global[name];
                if (!mod || prop === 'then') return undefined;
                const value = mod[prop];
                return typeof value === 'function' ? value.bind(mod) : value;
            },
            has(_target, prop) {
                const mod = global[name];
                return !!(mod && prop in mod);
            },
        });
    }

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
    const liveBatchQueueApi = global.TransubLiveBatchQueue || {};
    const senseRecoveryApi = global.TransubSenseRecovery || {};
    const factoryTaskReorderApi = global.TransubFactoryTaskReorder || {};
    const factoryTaskUiApi = lazyGlobalApi('TransubFactoryTaskUi');
    const factoryStatusBarApi = lazyGlobalApi('TransubFactoryStatusBar');
    const factoryChromeApi = lazyGlobalApi('TransubFactoryChrome');
    const progressDisplayApi = lazyGlobalApi('TransubProgressDisplay');
    const jobProgressLogApi = lazyGlobalApi('TransubJobProgressLog');
    const taskListRowApi = lazyGlobalApi('TransubTaskListRow');
    const factoryTaskTabApi = lazyGlobalApi('TransubFactoryTaskTab');
    const settingsNormApi = global.TransubSettingsOptionsNormalize || {};
    const savedOptionsApi = global.TransubSettingsSavedOptions || settingsNormApi || {};
    const externalImportApi = global.TransubExternalImportAction || {};
    const cliCommandApi = global.TransubCliCommand || {};
    const postTaskQcApi = global.TransubPostTaskQcUi || {};
    const perItemQcApi = global.TransubItemPosttaskProgress || global.TransubPerItemQcPipeline || {};
    const itemPosttaskPathsApi = global.TransubItemPosttaskPaths || {};
    const translateChipApi = global.TransubTranslateModeChip || {};
    const audioMutexApi = global.TransubAudioOptionMutex || {};
    const computeBusyUiApi = global.TransubComputeBusyUi || {};
    const gpuTorchApi = global.TransubEngineGpuTorch || {};
    const appDomIdsApi = global.TransubAppDomIds || {};
    const managedLlmPickApi = global.TransubManagedLlmPick || {};
    const etaApi = global.TransubEta || null;

    const engineModelsWorkspaceApi = lazyGlobalApi('TransubEngineModelsWorkspace');
    const engineModelsLibraryUiApi = lazyGlobalApi('TransubEngineModelsLibraryUi');
    const engineModelsLabUiApi = lazyGlobalApi('TransubEngineModelsLabUi');
    const engineModelsCacheShellApi = lazyGlobalApi('TransubEngineModelsCacheShell');
    const senseRunApi = lazyGlobalApi('TransubSenseRun');
    const senseItemActionsApi = lazyGlobalApi('TransubSenseItemActions');
    const senseOrchestrationApi = lazyGlobalApi('TransubSenseOrchestration');
    const missingModelsPromptApi = lazyGlobalApi('TransubMissingModelsPrompt');
    const smartTranslateReadinessApi = lazyGlobalApi('TransubSmartTranslateReadiness');
    const liveBatchRehydrateApi = lazyGlobalApi('TransubLiveBatchRehydrate');
    const postBatchAutofixApi = lazyGlobalApi('TransubPostBatchAutofixPlan');
    const postBatchRunnerApi = lazyGlobalApi('TransubPostBatchRunner');
    const paramsModeUiApi = lazyGlobalApi('TransubParamsModeUi');
    const settingsFormApplyApi = lazyGlobalApi('TransubSettingsFormApply');
    const settingsModalUiApi = lazyGlobalApi('TransubSettingsModalUi');
    const engineEnvUiApi = lazyGlobalApi('TransubEngineEnvUi');
    const burnSettingsUiApi = lazyGlobalApi('TransubBurnSettingsUi');
    const jobSessionControlApi = lazyGlobalApi('TransubJobSessionControl');
    const factoryStatusChipsApi = lazyGlobalApi('TransubFactoryStatusChips');
    const quickExtrasUiApi = lazyGlobalApi('TransubQuickExtrasUi');
    const bilingualTaskUiApi = lazyGlobalApi('TransubBilingualTaskUi');
    const mediaIntakeApi = lazyGlobalApi('TransubMediaIntake');
    const batchJobProgressApi = lazyGlobalApi('TransubBatchJobProgress');
    const batchStartRunnerApi = lazyGlobalApi('TransubBatchStartRunner');
    const retranslatePlanApi = lazyGlobalApi('TransubRetranslatePlan');
    const retranslateRunnerApi = lazyGlobalApi('TransubRetranslateRunner');
    const retranslateModalUiApi = lazyGlobalApi('TransubRetranslateModalUi');
    const factoryTaskListUiApi = lazyGlobalApi('TransubFactoryTaskListUi');
    const factoryShellUiApi = lazyGlobalApi('TransubFactoryShellUi');
    const advancedEntitlementUiApi = lazyGlobalApi('TransubAdvancedEntitlementUi');
    const resourceUsageUiApi = lazyGlobalApi('TransubResourceUsageUi');
    const mainUiExtrasApi = lazyGlobalApi('TransubMainUiExtras');
    const quickToolbarChipsUiApi = lazyGlobalApi('TransubQuickToolbarChipsUi');
    const taskListActionsUiApi = lazyGlobalApi('TransubTaskListActionsUi');
    const shelfTranslateApi = lazyGlobalApi('TransubSubtitleShelfTranslate');
    const shelfTranslateFlowApi = lazyGlobalApi('TransubShelfTranslateFlow');
    const modelApi = lazyGlobalApi('TransubTransWithAiModels');
    const translateStyleApi = lazyGlobalApi('TransubTranslateStyle');
    const twaiModelSelectUiApi = lazyGlobalApi('TransubTwaiModelSelectUi');
    const cliCommandUiApi = lazyGlobalApi('TransubCliCommandUi');
    const startReadinessUiApi = lazyGlobalApi('TransubStartReadinessUi');
    const appInitApi = lazyGlobalApi('TransubAppInit');
    const listRemovalUiApi = lazyGlobalApi('TransubListRemovalUi');
    const appEventsBinderApi = lazyGlobalApi('TransubAppEventsBinder');
    const translateStylePickerUiApi = lazyGlobalApi('TransubTranslateStylePickerUi');
    const factoryWorkspaceNavApi = lazyGlobalApi('TransubFactoryWorkspaceNav');
    const translateModeUiApi = lazyGlobalApi('TransubTranslateModeUi');

    const MEDIA_EXTENSIONS = new Set(
        mediaExt.MEDIA_EXTENSIONS || [
            'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
            'ts', 'm2ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
            'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus',
        ],
    );
    const DEFAULT_AUDIO_SUFFIXES = mediaExt.DEFAULT_AUDIO_SUFFIXES
        || [...MEDIA_EXTENSIONS].join(',');
    const GITHUB_ISSUES_URL = 'https://github.com/dlsandy/Transub/issues/new';
    const DEVICE_LABELS = {
        cuda: 'GPU', auto: '自动', amd: 'GPU AMD', cpu: 'CPU',
        cuda_low_vram: 'GPU 低显存', cuda_batch: 'GPU 批处理', modal: 'Modal 云端',
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
    const TRANSLATE_MODE_CHIP_LABELS = translateChipApi.TRANSLATE_MODE_CHIP_LABELS
        || { llm: '推理', external: '外部', dialog: '智能', smart: '混合' };
    const POST_BATCH_QC_FIX_MODES = new Set(['none', 'fix', 'smart']);
    const POST_BATCH_QC_FIX_CHIP_LABELS = {
        none: '关闭', fix: '自动', smart: '智能 Pro',
    };
    const STAGE_LABELS = inferProgress.STAGE_LABELS || Object.create(null);
    const STAGE_RANK = inferProgress.STAGE_RANK || Object.create(null);
    const stageRank = inferProgress.stageRank
        || function stageRankFallback(stage) { return STAGE_RANK[stage] ?? 0; };
    const scrubProgressDetail = inferProgress.scrubProgressDetail
        || function scrubProgressDetailFallback(detail) {
            return String(detail || '').trim();
        };
    const ENGINE_DEMUCS_MODEL_ID = 'demucs';
    const LOG_DOM_MAX = 100;

    const managedLlmPick = typeof managedLlmPickApi.createManagedLlmPickState === 'function'
        ? managedLlmPickApi.createManagedLlmPickState()
        : null;
    const getManagedLlmCatalogApi = managedLlmPick?.getManagedLlmCatalogApi
        || (() => global.TransubAdvancedManagedLlmCatalog || null);
    const isSakuraMtModelId = managedLlmPick?.isSakuraMtModelId
        || ((modelId) => /^sakura-/i.test(String(modelId || '').trim()));
    const findManagedLlmCatalogEntry = managedLlmPick?.findManagedLlmCatalogEntry || (() => null);
    const isLlmInferencePickModelId = managedLlmPick?.isLlmInferencePickModelId
        || ((modelId) => isSakuraMtModelId(modelId));
    const setCachedManagedLabModels = managedLlmPick?.setCachedManagedLabModels || (() => {});

    const translateModeFormApi = global.TransubTranslateModeForm || {};
    const numOrFinite = settingsNormApi.numOrFinite
        || ((value, fallback) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        });

    const jobLogTrackers = typeof jobProgressLogApi.createTrackers === 'function'
        ? jobProgressLogApi.createTrackers()
        : {
            lastStartKeyByPath: new Map(),
            lastStageByPath: new Map(),
            lastLogKeyByPath: new Map(),
        };

    const state = {
        items: [],
        running: false,
        dragDepth: 0,
        taskReorderDragging: false,
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
        jobBackend: '',
        jobStartedAt: 0,
        elapsedTicker: null,
        resourceUsageTicker: null,
        resourceUsageInFlight: false,
        pendingQueue: [],
        externalImportIdlePending: false,
        postTaskAction: 'none',
        playSoundOnComplete: false,
        postTaskMenuOpen: false,
        addMenuOpen: false,
        clearListMenuOpen: false,
        moreMenuOpen: false,
        qcBannerDismissed: false,
        qcFixing: false,
        qcSmartFixing: false,
        postBatchBusy: false,
        batchStartInFlight: false,
        retranslateBusy: false,
        retranslateAbort: false,
        retranslatePlan: null,
        retranslateFromShelf: false,
        computeBusy: false,
        computeBusyLabel: '',
        computeBusySince: 0,
        computeBusyOwner: '',
        computeBusyKind: '',
        engineBatchRunning: false,
        etaRate: null,
        lastProgressBumpAt: 0,
        lastProgressBumpPct: 0,
        historyEntries: [],
        focusedTaskPath: '',
        lastContentProfile: null,
        listSort: null,
        qwenIslandBatchSticky: null,
        factoryTaskTab: 'all',
        taskListView: 'cards',
        recipeSheetOpen: false,
        recipeExpert: false,
        factoryWorkspace: 'queue',
        factoryResourceSample: null,
    };

    let twaiLegacyOptions = { ...TWAI_LEGACY_OPTION_DEFAULTS };
    let savedOptionsSnapshot = null;
    let activeParamsTab = 'runtime';
    let settingsFormDirty = false;
    let autoScanFoldersDraft = [];
    let expertExtrasMenuOpen = false;
    let postBatchQcFixMenuOpen = false;
    let mtUseFormState = false;
    const expandedErrorRows = new Set();
    let advancedEntitled = false;
    let advancedEntitlementKnown = false;
    let insertSoftwareCreditIsDefault = false;
    let freePipelineTranslate = { ok: false };
    let lastEngineModelsRefreshAt = 0;
    let cachedEngineModels = [];
    let cachedHardwareRecommend = null;
    let cachedModelItems = [];
    let cachedEnginePickCatalog = [];
    let cachedDemucsProbe = null;
    let cachedGpuRuntimeProbe = null;
    let engineModelsBusy = false;
    let engineModelsBusyKind = null;
    let engineModelsBrowseOnly = false;
    let engineDownloadActiveSource = null;
    let asrRecommendDismissedKey = '';
    let cachedSmartTranslatePick = null;
    const rowRefreshAtByPath = new Map();
    const ROW_REFRESH_THROTTLE_MS = 800;

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';
    const isStandaloneChrome = isStandaloneSettings || isStandaloneWizard;
    const initialSettingsTab = String(pageQuery.get('tab') || '').trim();
    const initialOpenModelsLibrary = pageQuery.get('openLibrary') === '1';

    const ux = () => global.TransubMainUiUx;

    function showToast(message, tone = 'info', options = {}) {
        if (isStandaloneSettings || isStandaloneWizard) return;
        ux()?.showToast?.(message, tone, options);
    }

    function uiTf(template, vars) {
        const api = window.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
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

    const readTranslateModeFromForm = () => translateModeFormApi.readTranslateModeFromForm?.(els);
    const setTranslateModeRadios = (mode) => translateModeFormApi.setTranslateModeRadios?.(els, mode);

    /** @type {object} */
    const host = {
        global,
        electron,
        els,
        state,
        pageQuery,
        ux,

        // api refs
        mediaExt,
        pathUtils,
        inferProgress,
        engineDlFmt,
        senseQueueApi,
        taskListSortApi,
        engineModelsUi,
        manualDownloadApi,
        senseFinalizeApi,
        missingModelsApi,
        startReadinessApi,
        liveBatchQueueApi,
        senseRecoveryApi,
        taskListRowApi,
        factoryTaskTabApi,
        factoryTaskReorderApi,
        factoryTaskUiApi,
        factoryStatusBarApi,
        factoryChromeApi,
        progressDisplayApi,
        jobProgressLogApi,
        settingsNormApi,
        savedOptionsApi,
        externalImportApi,
        cliCommandApi,
        postTaskQcApi,
        perItemQcApi,
        itemPosttaskPathsApi,
        translateChipApi,
        audioMutexApi,
        computeBusyUiApi,
        gpuTorchApi,
        appDomIdsApi,
        etaApi,
        engineModelsWorkspaceApi,
        engineModelsLibraryUiApi,
        engineModelsLabUiApi,
        engineModelsCacheShellApi,
        senseRunApi,
        senseItemActionsApi,
        senseOrchestrationApi,
        missingModelsPromptApi,
        smartTranslateReadinessApi,
        liveBatchRehydrateApi,
        postBatchAutofixApi,
        postBatchRunnerApi,
        paramsModeUiApi,
        settingsFormApplyApi,
        settingsModalUiApi,
        engineEnvUiApi,
        burnSettingsUiApi,
        jobSessionControlApi,
        factoryStatusChipsApi,
        quickExtrasUiApi,
        bilingualTaskUiApi,
        mediaIntakeApi,
        batchJobProgressApi,
        batchStartRunnerApi,
        retranslatePlanApi,
        retranslateRunnerApi,
        retranslateModalUiApi,
        factoryTaskListUiApi,
        factoryShellUiApi,
        advancedEntitlementUiApi,
        resourceUsageUiApi,
        mainUiExtrasApi,
        quickToolbarChipsUiApi,
        taskListActionsUiApi,
        shelfTranslateApi,
        shelfTranslateFlowApi,
        modelApi,
        translateStyleApi,
        twaiModelSelectUiApi,
        cliCommandUiApi,
        startReadinessUiApi,
        appInitApi,
        listRemovalUiApi,
        appEventsBinderApi,
        translateStylePickerUiApi,
        factoryWorkspaceNavApi,
        translateModeUiApi,

        // constants
        MEDIA_EXTENSIONS,
        DEFAULT_AUDIO_SUFFIXES,
        GITHUB_ISSUES_URL,
        DEVICE_LABELS,
        EXPERT_DEVICES,
        EXPERT_PARAM_DEFAULTS,
        TWAI_LEGACY_OPTION_DEFAULTS,
        POST_TASK_SELECT_VALUES,
        POST_TASK_LABELS,
        TRANSLATE_MODE_CHIP_LABELS,
        POST_BATCH_QC_FIX_MODES,
        POST_BATCH_QC_FIX_CHIP_LABELS,
        STAGE_LABELS,
        STAGE_RANK,
        stageRank,
        scrubProgressDetail,
        ENGINE_DEMUCS_MODEL_ID,
        LOG_DOM_MAX,
        ROW_REFRESH_THROTTLE_MS,
        rowRefreshAtByPath,
        jobLogTrackers,
        expandedErrorRows,

        // session getters / setters
        getIsStandaloneSettings: () => !!isStandaloneSettings,
        getIsStandaloneWizard: () => !!isStandaloneWizard,
        getIsStandaloneChrome: () => !!isStandaloneChrome,
        getInitialSettingsTab: () => initialSettingsTab,
        getInitialOpenModelsLibrary: () => !!initialOpenModelsLibrary,
        isStandaloneSettings,
        isStandaloneWizard,
        isStandaloneChrome,
        initialSettingsTab,
        initialOpenModelsLibrary,

        getSavedOptionsSnapshot: () => savedOptionsSnapshot,
        setSavedOptionsSnapshot: (opts) => {
            savedOptionsSnapshot = opts && typeof opts === 'object' ? opts : null;
        },
        getSettingsFormDirty: () => !!settingsFormDirty,
        setSettingsFormDirty: (v) => { settingsFormDirty = !!v; },
        settingsFormDirty,
        getActiveParamsTab: () => activeParamsTab,
        setActiveParamsTab: (v) => { activeParamsTab = v; },
        activeParamsTab,
        getAutoScanFoldersDraft: () => autoScanFoldersDraft,
        setAutoScanFoldersDraft: (folders) => { autoScanFoldersDraft = folders; },
        autoScanFoldersDraft,
        getExpertExtrasMenuOpen: () => !!expertExtrasMenuOpen,
        setExpertExtrasMenuOpenState: (v) => { expertExtrasMenuOpen = !!v; },
        expertExtrasMenuOpen,
        getPostBatchQcFixMenuOpen: () => !!postBatchQcFixMenuOpen,
        setPostBatchQcFixMenuOpenState: (v) => { postBatchQcFixMenuOpen = !!v; },
        postBatchQcFixMenuOpen,
        getMtUseForm: () => !!mtUseFormState,
        getMtUseFormState: () => !!mtUseFormState,
        setMtUseFormState: (v) => { mtUseFormState = !!v; },
        mtUseFormState,
        getAdvancedEntitled: () => !!advancedEntitled,
        setAdvancedEntitledState: (v) => { advancedEntitled = !!v; },
        advancedEntitled,
        getAdvancedEntitlementKnown: () => !!advancedEntitlementKnown,
        setAdvancedEntitlementKnown: (v) => { advancedEntitlementKnown = !!v; },
        getInsertSoftwareCreditIsDefault: () => !!insertSoftwareCreditIsDefault,
        setInsertSoftwareCreditIsDefault: (v) => { insertSoftwareCreditIsDefault = !!v; },
        setFreePipelineTranslate: (v) => { freePipelineTranslate = v; },
        freePipelineTranslate,
        getCachedEngineModels: () => cachedEngineModels,
        setCachedEngineModels: (v) => { cachedEngineModels = Array.isArray(v) ? v : []; },
        cachedEngineModels,
        getCachedHardwareRecommend: () => cachedHardwareRecommend,
        setCachedHardwareRecommend: (v) => { cachedHardwareRecommend = v; },
        cachedHardwareRecommend,
        getCachedModelItems: () => cachedModelItems,
        setCachedModelItems: (items) => { cachedModelItems = Array.isArray(items) ? items : []; },
        cachedModelItems,
        getCachedEnginePickCatalog: () => cachedEnginePickCatalog,
        setCachedEnginePickCatalog: (v) => { cachedEnginePickCatalog = Array.isArray(v) ? v : []; },
        cachedEnginePickCatalog,
        getCachedDemucsProbe: () => cachedDemucsProbe,
        setCachedDemucsProbe: (v) => { cachedDemucsProbe = v || null; },
        cachedDemucsProbe,
        getCachedGpuRuntimeProbe: () => cachedGpuRuntimeProbe,
        setCachedGpuRuntimeProbe: (v) => { cachedGpuRuntimeProbe = v; },
        cachedGpuRuntimeProbe,
        getEngineModelsBusy: () => !!engineModelsBusy,
        setEngineModelsBusy: (v) => { engineModelsBusy = !!v; },
        engineModelsBusy,
        getEngineModelsBusyKind: () => engineModelsBusyKind,
        setEngineModelsBusyKind: (v) => { engineModelsBusyKind = v; },
        engineModelsBusyKind,
        getEngineModelsBrowseOnly: () => !!engineModelsBrowseOnly,
        setEngineModelsBrowseOnlyFlag: (v) => { engineModelsBrowseOnly = !!v; },
        engineModelsBrowseOnly,
        getEngineDownloadActiveSource: () => engineDownloadActiveSource,
        setEngineDownloadActiveSource: (v) => { engineDownloadActiveSource = v; },
        engineDownloadActiveSource,
        getAsrRecommendDismissedKey: () => asrRecommendDismissedKey,
        setAsrRecommendDismissedKey: (v) => { asrRecommendDismissedKey = v; },
        asrRecommendDismissedKey,
        getCachedSmartTranslatePick: () => cachedSmartTranslatePick,
        setCachedSmartTranslatePick: (v) => { cachedSmartTranslatePick = v; },
        cachedSmartTranslatePick,
        markEngineModelsRefreshed: () => { lastEngineModelsRefreshAt = Date.now(); },
        lastEngineModelsRefreshAt,
        twaiLegacyOptions,
        TWAI_LEGACY_OPTION_DEFAULTS,

        // helpers
        showToast,
        uiTf,
        appConfirm,
        appConfirmChoice,
        isDesktop,
        basename,
        normPath,
        esc,
        formatDuration,
        readTranslateModeFromForm,
        setTranslateModeRadios,
        getManagedLlmCatalogApi,
        isSakuraMtModelId,
        findManagedLlmCatalogEntry,
        isLlmInferencePickModelId,
        setCachedManagedLabModels,
        numOrFinite,
        lazyGlobalApi,
    };

    // Domain wires (order: chrome → factory → settings → engine → batch → boot)
    global.TransubAppWireChrome?.install?.(host);
    global.TransubAppWireFactoryUi?.install?.(host);
    global.TransubAppWireSettings?.install?.(host);
    global.TransubAppWireEngineModels?.install?.(host);
    global.TransubAppWireBatch?.install?.(host);
    global.TransubAppWireBoot?.install?.(host);

    global.TransubCore = {
        appendLog: (...a) => host.appendLog?.(...a),
        applyOptionsToForm: (...a) => host.applyOptionsToForm?.(...a),
        buildSavedOptionsFromForm: (...a) => host.buildSavedOptionsFromForm?.(...a),
        openParamsModal: (...a) => host.openParamsModal?.(...a),
        openAppSettings: (...a) => host.openAppSettings?.(...a),
        openEngineModelsLibrary: (...a) => host.openEngineModelsLibrary?.(...a),
        closeEngineModelsLibrary: (...a) => host.closeEngineModelsLibrary?.(...a),
        updateEnvBanner: (...a) => host.updateEnvBanner?.(...a),
        markSettingsDirty: (...a) => host.markSettingsDirty?.(...a),
        setSaveParamsStatus: (...a) => host.setSaveParamsStatus?.(...a),
        setAdvancedEntitled: (...a) => host.setAdvancedEntitled?.(...a),
        isAdvancedEntitled: () => !!advancedEntitled,
        switchParamsTab: (...a) => host.switchParamsTab?.(...a),
        addFiles: (...a) => host.addFiles?.(...a),
        renderList: (...a) => host.renderList?.(...a),
        updateStartButton: (...a) => host.updateStartButton?.(...a),
        getSelectedItems: (...a) => host.getSelectedItems?.(...a),
        resolveOutputDirFromForm: (...a) => host.resolveOutputDirFromForm?.(...a),
        updateParamsSummary: (...a) => host.updateParamsSummary?.(...a),
        syncParamsModeChipUi: (...a) => host.syncParamsModeChipUi?.(...a),
        rebuildParamsModePresetItems: (...a) => host.rebuildParamsModePresetItems?.(...a),
        flushPendingActivePresetId: (...a) => host.flushPendingActivePresetId?.(...a),
        applyActivePresetIdToSelect: (...a) => host.applyActivePresetIdToSelect?.(...a),
        syncTranslateChipUi: (...a) => host.syncTranslateChipUi?.(...a),
        syncParamsMoreChipUi: (...a) => host.syncParamsMoreChipUi?.(...a),
        ensureRequiredModelsReadyOrPrompt: (...a) => host.ensureRequiredModelsReadyOrPrompt?.(...a),
        setSavedOptionsSnapshot: (opts) => {
            savedOptionsSnapshot = opts && typeof opts === 'object' ? opts : null;
        },
        state,
        isStandaloneSettings: () => isStandaloneSettings,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => host.init?.());
    } else {
        host.init?.();
    }
}(window));
