/**
 * Transub — TransWithAI 字幕生成
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const els = {};
    const mediaExt = global.TransubMediaExtensions || {};
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

    const STAGE_LABELS = {
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

    const STAGE_RANK = {
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

    function stageRank(stage) {
        return STAGE_RANK[stage] ?? 0;
    }

    function scrubProgressDetail(detail) {
        return String(detail || '')
            .trim()
            .replace(/^(转写\s*\/\s*翻译中|转写中|翻译中|转写|翻译|识别中)\s*[·•]?\s*/u, '')
            .trim();
    }

    function stageLabel(stage) {
        const base = STAGE_LABELS[stage] || '处理中';
        if (state.itemDualPhase === 'transcribe') {
            if (stage === 'starting') return '双语 · 准备原文';
            if (stage === 'transcribe') return '双语 · 生成原文';
            return `双语 · 原文 · ${base}`;
        }
        if (state.itemDualPhase === 'translate') {
            // 引擎第二阶段仍上报 itemStage=transcribe
            if (stage === 'starting') return '双语 · 准备译文';
            if (stage === 'transcribe') return '双语 · 生成译文';
            return `双语 · 译文 · ${base}`;
        }
        const task = readTaskFromForm();
        if (task === 'translate' && stage === 'transcribe') return '翻译中';
        if (task === 'transcribe' && stage === 'transcribe') return '转写中';
        return base;
    }

    /** 列表行副文案：只保留时间轴 / 语音检测等补充信息，避免与状态徽章叠词 */
    function formatListRunningDetail(rawDetail) {
        let scrubbed = scrubProgressDetail(rawDetail);
        if (state.itemDualPhase) {
            scrubbed = scrubbed
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中|已合并.*)[….]*\s*/u, '')
                .trim();
        }
        return scrubbed;
    }

    function formatRunningProgressLabel(stage, detail) {
        const head = stageLabel(stage);
        let scrubbed = scrubProgressDetail(detail);
        // 去掉与双语标题重复的「生成原文/译文」「双语准备」等套话
        if (state.itemDualPhase) {
            scrubbed = scrubbed
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中)[….]*\s*/u, '')
                .trim();
        }
        if (!scrubbed) return `${head}…`;
        if (scrubbed === head || scrubbed.startsWith(`${head} ·`)) return scrubbed;
        return `${head} · ${scrubbed}`;
    }

    function effectiveItemProgress(stage, progress) {
        const raw = Math.max(0, Number(progress) || 0);
        // 运行中故意封顶 99%，避免未完成时显示 100%；结束后允许到 100%
        const cap = (!state.running || stage === 'done' || stage === 'skipped') ? 100 : 99;
        const pct = Math.min(cap, raw);
        if (isPreTranscribeStage(stage)) {
            // 双语第二阶段启动/VAD 时保留已映射进度
            if (state.running && state.itemDualPhase === 'translate') return Math.min(99, pct);
            // 引擎会给出加载/预处理的真实百分比（>0）——保留，避免进度条长期卡在 0
            if (state.running && pct > 0) return Math.min(99, pct);
            if (!state.running) return pct;
            return 0;
        }
        return pct;
    }

    function computeDisplayProgress() {
        // 任务已正常结束：进度条到 100%（顶部文案由 progressLabel 负责）
        if (!state.running && state.itemStage === 'done' && state.total > 0) {
            return { pct: 100, label: '100%' };
        }
        const cap = state.running ? 99 : 100;
        const itemPct = effectiveItemProgress(state.itemStage, state.videoProgress);
        const displayPct = Math.max(0, Math.min(cap, itemPct));
        const hasMediaTimeline = state.running
            && state.videoTotalSec >= 60
            && state.itemStage === 'transcribe'
            && state.itemDualPhase !== 'translate';
        if (hasMediaTimeline && displayPct > 0) {
            const timeline = `${formatDuration(state.videoCurrentSec)} / ${formatDuration(state.videoTotalSec)}`;
            // 底部计数区只显示时间轴与百分比，阶段文案留给 progressLabel
            return {
                pct: displayPct,
                label: `${timeline} · ${displayPct}%`,
            };
        }
        if (state.total > 0 && state.index > 0) {
            const batchPct = Math.round(((state.index - 1) + displayPct / 100) / state.total * 100);
            const pct = Math.min(cap, batchPct);
            return { pct, label: `第 ${state.index} / ${state.total} 个 · ${pct}%` };
        }
        return { pct: displayPct, label: displayPct > 0 ? `${displayPct}%` : '…' };
    }

    const POST_TASK_SELECT_VALUES = new Set(['none', 'quit', 'shutdown', 'sleep', 'open_folder']);

    const POST_TASK_LABELS = {
        none: '无额外操作',
        open_folder: '打开输出目录',
        sleep: '睡眠',
        quit: '退出应用',
        shutdown: '关机',
    };

    const PROBE_CONCURRENCY = 6;

    const TRANSLATE_MODE_CHIP_LABELS = {
        engine: '机器',
        llm: '推理',
        sakura: '推理', // legacy alias
        smart: '智能',
    };

    const POST_BATCH_QC_FIX_MODES = new Set(['none', 'fix', 'smart']);
    const POST_BATCH_QC_FIX_CHIP_LABELS = {
        none: '关',
        fix: '一键',
        smart: 'Pro',
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
    let translateModeMenuOpen = false;
    let postBatchQcFixMenuOpen = false;
    /** Cached path of vendored `transub-engine/` (empty until probed). */
    let cachedBundledEnginePath = '';
    /** @type {Set<number>} */
    const expandedErrorRows = new Set();
    let advancedEntitled = false;
    /** @type {{ ok: boolean, modelId?: string, message?: string, reason?: string }} */
    let freePipelineTranslate = { ok: false };
    let syncingTranslateMode = false;
    let lastEngineModelsRefreshAt = 0;

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';
    const isStandaloneChrome = isStandaloneSettings || isStandaloneWizard;
    const initialSettingsTab = String(pageQuery.get('tab') || '').trim();

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
        network: 'network',
        proxy: 'network',
        网络与代理: 'network',
        网络: 'network',
        more: 'more',
        更多: 'more',
        Pro许可: 'pro',
        许可: 'pro',
        大模型设置: 'pro-llm',
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
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function readTranslateModeFromForm() {
        if (els.translateModeSmart?.checked) return 'smart';
        if (els.translateModeSakura?.checked) return 'llm';
        return 'engine';
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
        }
        syncSmartTranslateUi();
        syncAdvancedFeaturesGate();
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

    function isProGatedTab(tabId) {
        const id = resolveParamsTab(tabId);
        return id === 'pro-llm' || id === 'pro-reconstruct';
    }

    function syncProGatedNav() {
        els.paramsTabBtns?.forEach((btn) => {
            const gated = btn.getAttribute('data-pro-gated') === '1' || isProGatedTab(btn.dataset.tab);
            const locked = gated && !advancedEntitled;
            btn.classList.toggle('is-pro-locked', locked);
            btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
            if (gated) {
                const baseTitle = btn.dataset.tab === 'pro-reconstruct'
                    ? '语境重构与影片理解'
                    : '外接 API 与软件内大模型';
                btn.title = locked ? `${baseTitle}（需解锁 Pro）` : baseTitle;
            }
        });
        if (isProGatedTab(activeParamsTab) && !advancedEntitled) {
            switchParamsTab('pro', { fromGate: true });
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
    }

    function syncAdvancedFeaturesGate() {
        const locked = !advancedEntitled;
        const smartLocked = !canUseSmartTranslateUi();
        els.advancedFeaturesLockHint?.classList.toggle('hidden', !locked);
        if (els.filmAudioEnhanceWrap) {
            els.filmAudioEnhanceWrap.classList.toggle('opacity-50', locked);
            els.filmAudioEnhanceWrap.classList.toggle('pointer-events-none', locked);
        }
        if (els.filmAudioEnhanceCheck) {
            els.filmAudioEnhanceCheck.disabled = locked;
        }
        if (els.filmVadPresetWrap) {
            els.filmVadPresetWrap.classList.toggle('opacity-50', locked);
            els.filmVadPresetWrap.classList.toggle('pointer-events-none', locked);
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
            if (fromUser && next === 'smart' && !canUseSmartTranslateUi()) {
                setSaveParamsStatus(
                    '智能翻译需解锁 Pro',
                    'warn',
                );
                next = 'engine';
            }

            setTranslateModeRadios(next);
            if (els.smartTranslateCheck) {
                els.smartTranslateCheck.checked = next === 'smart';
            }

            if (els.engineLlmMtModelSelect && next === 'llm') {
                const cur = els.engineLlmMtModelSelect.value || '';
                if (!String(cur).trim()) {
                    const fallback = [...(els.engineLlmMtModelSelect.options || [])]
                        .map((o) => o.value)
                        .find((v) => v);
                    els.engineLlmMtModelSelect.value = fallback || 'sakura-1.5b';
                }
            }

            const pickDisabled = next === 'smart' || !allowTranslate;
            if (els.engineMtModelSelect) els.engineMtModelSelect.disabled = pickDisabled;
            if (els.engineLlmMtModelSelect) els.engineLlmMtModelSelect.disabled = pickDisabled;
            els.engineMtModelWrap?.classList.toggle('opacity-50', pickDisabled);
            els.engineLlmMtModelWrap?.classList.toggle('opacity-50', pickDisabled);
            if (els.engineMtModelHint) {
                if (!allowTranslate) {
                    els.engineMtModelHint.textContent = '当前为「原语言」任务，不使用机器翻译模型。';
                } else if (next === 'smart') {
                    els.engineMtModelHint.textContent = '智能翻译不使用引擎 MT；翻译由大模型完成。';
                } else if (next === 'llm') {
                    els.engineMtModelHint.textContent = '当前为推理翻译，请改用「LLM 推理翻译模型」。';
                } else {
                    els.engineMtModelHint.textContent = '引擎 Opus MT：可留空自动按片源语言选择，或指定已下载的 opus-mt-* 模型。';
                }
            }
            if (els.engineLlmMtModelHint) {
                if (!allowTranslate) {
                    els.engineLlmMtModelHint.textContent = '当前为「原语言」任务，不使用推理翻译模型。';
                } else if (next === 'smart') {
                    els.engineLlmMtModelHint.textContent = '智能翻译已启用：引擎只负责转录，翻译由 Pro 大模型完成（影片简要 → 分块译 → 一致性）。';
                } else if (next === 'llm') {
                    els.engineLlmMtModelHint.textContent = '本地 LLM 推理翻译（Sakura / Qwen 等）：请先在「模型 → LLM推理翻译」下载对应模型。';
                } else {
                    els.engineLlmMtModelHint.textContent = '当前为机器翻译；推理翻译请在「常规」切换方式后再选用。';
                }
            }
            if (els.translateModeHint) {
                if (!allowTranslate) {
                    els.translateModeHint.textContent = '「原语言」任务不翻译，上方选项暂时无效。';
                } else if (next === 'smart' && !canUseSmartTranslateUi()) {
                    els.translateModeHint.textContent = '智能翻译为 Pro 专属，请先激活 Pro。';
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
        syncAdvancedFeaturesGate();
        syncTranslateModeChipUi();
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
        const v = String(els.engineLlmMtModelSelect?.value || '').trim();
        return v || 'sakura-1.5b';
    }

    function readActiveEngineMtModelFromForm() {
        const mode = readTranslateModeFromForm();
        if (mode === 'llm' || mode === 'sakura') return readLlmMtModelFromForm();
        if (mode === 'smart') return '';
        return readOpusMtModelFromForm();
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
        etaRate: null,
        historyEntries: [],
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

    const TASK_STATUS_SORT_RANK = {
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
        return String(p || '').split(/[/\\]/).pop() || '—';
    }

    function normPath(p) {
        return String(p || '').replace(/\//g, '\\').toLowerCase();
    }

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatDuration(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    /** 与 transwithai-bridge mapInferStageProgress 保持一致（渲染层兜底） */
    function mapStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
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
        if (item.status === 'pending' || item.status === 'ready') return '—';
        if (!item.startedAt) return '—';
        return formatDuration(itemElapsedSec(item));
    }

    function formatProcessedCell(item) {
        const total = Number(item.duration) || Number(item.processedTotalSec) || 0;
        const processed = Number(item.processedSec) || 0;

        if (item.status === 'done') {
            const sec = total > 0 ? total : processed;
            return sec > 0 ? formatDuration(sec) : '—';
        }
        if (item.status === 'skipped') return '—';
        if (processed > 0) {
            return total > 0
                ? `${formatDuration(processed)} / ${formatDuration(total)}`
                : formatDuration(processed);
        }
        return '—';
    }

    function bumpProgress(current, next) {
        const cur = Math.max(0, Math.min(99, Number(current) || 0));
        const nxt = Math.max(0, Math.min(99, Number(next) || 0));
        return Math.max(cur, nxt);
    }

    function isPreTranscribeStage(stage) {
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
            'quickFormatBtn', 'quickFormatLabel', 'quickTranslateModeBtn', 'quickTranslateModeLabel',
            'translateModeMenuWrap', 'translateModeMenu',
            'readinessStrip', 'readinessStripText', 'readinessStripAction',
            'autoSenseToggle', 'autoSenseToggleLabel',
            'postBatchQcFixBtn', 'postBatchQcFixLabel', 'postBatchQcFixMenuWrap', 'postBatchQcFixMenu',
            'senseMemoryStatus', 'clearSenseMemoryBtn',
            'transWithAiStatus', 'openFeedbackBtn', 'openParamsBtn',
            'moreMenuWrap', 'moreMenuBtn', 'moreMenu', 'openHistoryMenuBtn', 'toggleDensityBtn', 'toggleDensityLabel',
            'openAboutBtn',
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
            'engineBackendSelect', 'engineSettingsBlock', 'twaiSettingsBlock',
            'engineInstallPathInput', 'engineInstallBrowseBtn', 'engineInstallUseBundledBtn', 'engineUrlInput',
            'engineHfEndpointInput', 'engineHfMirrorPresetBtn', 'engineHfOfficialPresetBtn', 'engineHfTestBtn', 'networkHfStatus',
            'proxyEnabledCheck', 'proxyUrlInput', 'proxyBypassInput', 'proxyTestBtn', 'proxyTestStatus', 'proxySettingsFields',
            'engineProfileSelect', 'engineAsrModelSelect',
            'engineMtModelSelect', 'engineMtModelWrap', 'engineMtModelHint',
            'engineLlmMtModelSelect', 'engineLlmMtModelWrap', 'engineLlmMtModelHint',
            'engineVadModelSelect',
            'engineAutoStartCheck', 'engineTestBtn',
            'engineCancelDownloadBtn',
            'engineEnsureGpuBtn', 'engineManualGpuBtn', 'engineGpuStatus',
            'engineRefreshModelsBtn', 'engineDownloadProgress', 'engineDownloadProgressBar',
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
            'filmAudioEnhanceCheck', 'filmAudioEnhanceWrap',
            'filmVadPresetCheck', 'filmVadPresetWrap',
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
            'audioLightDenoiseCheck', 'transcribeExpertCustomHint',
            'retranscribeWarmLightCheck', 'subtitleBakModeSelect',
            'keepTranscriptCheck', 'transcriptKeepDirInput', 'transcriptKeepLimitInput',
            'transcriptKeepDaysInput', 'clearTranscriptCacheBtn', 'historySettingsStatus',
            'trayProgressCheck', 'showTaskResourceUsageCheck', 'minimizeToTrayCheck', 'minimizeToTrayOnStartCheck', 'trayNotifyCheck',
            'startupWindowSelect', 'autoUpdateCheckIntervalSelect',
            'postBatchQcCheck', 'postBatchQcFixModeSelect', 'postBatchCpsSplitCheck', 'postBatchRemoveNoiseCheck', 'postBatchCompressRepCheck',
            'postBatchCompactPureInterjectionsCheck',
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
            'openSubtitleFileBtn', 'retranslateBtn', 'reconstructBtn',
            'retranslateModal', 'retranslateModalSummary', 'retranslateModalMissing',
            'retranslateModeEngine', 'retranslateModeLlm', 'retranslateModeSmart',
            'retranslateModeSmartWrap', 'retranslateModelWrap', 'retranslateModelLabel',
            'retranslateModelSelect', 'retranslateModelHint', 'retranslateCancelBtn',
            'retranslateConfirmBtn',
            'fileListBody', 'emptyListRow', 'stopBtn', 'filePanel', 'dropZone', 'dropOverlay',
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
        return POST_TASK_SELECT_VALUES.has(action) ? action : 'none';
    }

    function setPostTaskAction(action) {
        let next = POST_TASK_SELECT_VALUES.has(action) ? action : 'none';
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
        const label = POST_TASK_LABELS[action] || POST_TASK_LABELS.none;
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
            setPostBatchQcFixMenuOpen(false);
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
            setPostBatchQcFixMenuOpen(false);
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
            if (translateModeMenuOpen) setTranslateModeMenuOpen(false);
            if (postBatchQcFixMenuOpen) setPostBatchQcFixMenuOpen(false);
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
            setPostBatchQcFixMenuOpen(false);
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
        els.openHistoryMenuBtn?.addEventListener('click', () => {
            setMoreMenuOpen(false);
            document.getElementById('openHistoryBtn')?.click();
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
        els.settingsGotoInstallBtn?.addEventListener('click', () => switchParamsTab('install'));
        els.openSetupWizardFromGuideBtn?.addEventListener('click', () => {
            void global.TransubSetupWizard?.open?.({ force: false });
        });
        els.translateModeGotoProBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchParamsTab('pro-llm');
        });
        els.advancedFeaturesGotoProBtn?.addEventListener('click', () => switchParamsTab('pro'));
        els.quickTranslateModeBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setTranslateModeMenuOpen(!translateModeMenuOpen);
        });
        els.translateModeMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setTranslateModeMenuOpen(false);
                setQuickTranslateMode(item.dataset.translateMode || 'engine');
            });
        });
        els.translateModeMenu?.addEventListener('click', (event) => event.stopPropagation());
        els.postBatchQcFixBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            setPostBatchQcFixMenuOpen(!postBatchQcFixMenuOpen);
        });
        els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setPostBatchQcFixMenuOpen(false);
                void setPostBatchQcFixMode(item.dataset.qcFixMode || 'none', { fromUser: true });
            });
        });
        els.postBatchQcFixMenu?.addEventListener('click', (event) => event.stopPropagation());
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
        });
        els.engineLlmMtModelSelect?.addEventListener('change', () => {
            if (syncingTranslateMode) return;
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
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
            void persistFormOptionsQuiet();
        });
        els.quickTargetLangSelect?.addEventListener('change', () => {
            if (els.chineseSubtitleVariantSelect) {
                els.chineseSubtitleVariantSelect.value = els.quickTargetLangSelect.value || 'simplified';
            }
            updateParamsSummary();
            void persistFormOptionsQuiet();
        });
        els.chineseSubtitleVariantSelect?.addEventListener('change', () => {
            if (els.quickTargetLangSelect) {
                els.quickTargetLangSelect.value = els.chineseSubtitleVariantSelect.value || 'simplified';
            }
            updateParamsSummary();
        });
        els.quickFormatBtn?.addEventListener('click', () => {
            openAppSettings('output');
        });
        els.languageSelect?.addEventListener('change', updateParamsSummary);
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
                if (state.running) return;
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
        const action = getPostTaskAction();
        const shutdownDelaySec = Number(els.shutdownDelayInput?.value) || 60;
        const base = {
            shutdownDelaySec,
            playSoundOnComplete: !!state.playSoundOnComplete,
            sleepOnComplete: false,
            openOutputFolderOnComplete: false,
            closeWindowOnComplete: false,
            quitAppOnComplete: false,
            shutdownOnComplete: false,
        };
        if (action === 'quit') {
            return { ...base, postTaskAction: 'quit', quitAppOnComplete: true };
        }
        if (action === 'shutdown') {
            return { ...base, postTaskAction: 'shutdown', quitAppOnComplete: true, shutdownOnComplete: true };
        }
        if (action === 'sleep') {
            return { ...base, postTaskAction: 'sleep', sleepOnComplete: true };
        }
        if (action === 'open_folder') {
            return { ...base, postTaskAction: 'open_folder', openOutputFolderOnComplete: true };
        }
        return { ...base, postTaskAction: 'none' };
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
    /** @type {Array<object>} */
    let cachedEngineModels = [];
    let cachedEnginePickCatalog = [];
    /** @type {object|null} */
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

    function switchParamsTab(tabId, opts = {}) {
        let next = resolveParamsTab(tabId || activeParamsTab);
        if (isProGatedTab(next) && !advancedEntitled) {
            if (!opts.fromGate) {
                setSaveParamsStatus('请先在「Pro许可」解锁后再使用此功能', 'warn');
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
                    void refreshEngineModels({ silent: true });
                }
            }
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
            });
            return;
        }
        openParamsModal(tab);
    }

    function closeParamsModal(restore = false) {
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
        return TRANSLATE_MODE_CHIP_LABELS[mode] || TRANSLATE_MODE_CHIP_LABELS.engine;
    }

    function setTranslateModeMenuOpen(open) {
        translateModeMenuOpen = !!open;
        els.translateModeMenu?.classList.toggle('hidden', !open);
        els.quickTranslateModeBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setPostBatchQcFixMenuOpen(false);
        }
    }

    function normalizePostBatchQcFixMode(value) {
        const mode = String(value || '').trim().toLowerCase();
        return POST_BATCH_QC_FIX_MODES.has(mode) ? mode : 'none';
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
        els.postBatchQcFixMenu?.classList.toggle('hidden', !open);
        els.postBatchQcFixBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
            setTranslateModeMenuOpen(false);
        }
    }

    function syncPostBatchQcFixChipUi() {
        const mode = getPostBatchQcFixMode();
        if (els.postBatchQcFixLabel) {
            els.postBatchQcFixLabel.textContent = postBatchQcFixModeLabel(mode);
        }
        if (els.postBatchQcFixBtn) {
            const titles = {
                none: '任务完成后不自动修复 QC',
                fix: '任务完成后自动一键修复 QC',
                smart: '任务完成后自动智能修复 QC (Pro)',
            };
            els.postBatchQcFixBtn.title = titles[mode] || titles.none;
            els.postBatchQcFixBtn.classList.toggle('ring-1', mode !== 'none');
            els.postBatchQcFixBtn.classList.toggle('ring-violet-200', mode === 'fix');
            els.postBatchQcFixBtn.classList.toggle('border-violet-300', mode === 'fix');
            els.postBatchQcFixBtn.classList.toggle('bg-violet-50/60', mode === 'fix');
            els.postBatchQcFixBtn.classList.toggle('ring-amber-200', mode === 'smart');
            els.postBatchQcFixBtn.classList.toggle('border-amber-300', mode === 'smart');
            els.postBatchQcFixBtn.classList.toggle('bg-amber-50/60', mode === 'smart');
        }
        els.postBatchQcFixMenu?.querySelectorAll('[data-qc-fix-mode]').forEach((item) => {
            const active = item.dataset.qcFixMode === mode;
            item.classList.toggle('active', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        if (els.postBatchQcFixModeSelect && els.postBatchQcFixModeSelect.value !== mode) {
            els.postBatchQcFixModeSelect.value = mode;
        }
    }

    async function setPostBatchQcFixMode(nextMode, { fromUser = false, persist = true } = {}) {
        let mode = normalizePostBatchQcFixMode(nextMode);
        if (mode === 'smart' && fromUser && !advancedEntitled) {
            appendLog('智能修复 QC 为 Pro 功能，请先在设置 → Pro 解锁', 'warn');
            openAppSettings('pro');
            syncPostBatchQcFixChipUi();
            return;
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

    function syncTranslateModeChipUi() {
        const task = readTaskFromForm();
        const allow = task === 'translate' || task === 'dual';
        const mode = allow ? readTranslateModeFromForm() : 'engine';
        if (els.quickTranslateModeLabel) {
            els.quickTranslateModeLabel.textContent = allow ? translateModeLabel(mode) : '—';
        }
        els.translateModeMenuWrap?.classList.toggle('opacity-50', !allow);
        els.translateModeMenuWrap?.classList.toggle('pointer-events-none', !allow);
        els.translateModeMenu?.querySelectorAll('[data-translate-mode]').forEach((item) => {
            const active = item.dataset.translateMode === mode;
            item.classList.toggle('active', active);
        });
    }

    async function setQuickTranslateMode(mode) {
        const task = readTaskFromForm();
        if (task !== 'translate' && task !== 'dual') return;
        applyTranslateModeToForm(mode, { fromUser: true });
        markSettingsDirty(true);
        setSaveParamsStatus('有未保存更改', 'warn');
        syncTranslateModeChipUi();
        updateReadinessStrip();
        updateModelSelectHint();
        await persistFormOptionsQuiet();
        updateParamsSummary();
    }

    function updateReadinessStrip() {
        if (!els.readinessStrip || isStandaloneSettings) return;
        const backend = readEngineBackendFromForm();
        const task = readTaskFromForm();
        const taskLabel = taskLabelOf(task);
        const mode = readTranslateModeFromForm();
        const modeLabel = translateModeLabel(mode);
        const asr = els.engineAsrModelSelect?.value || '默认 ASR';
        const enginePath = String(els.engineInstallPathInput?.value || '').trim();
        const engineOk = backend === 'twai'
            ? !!String(els.installPathInput?.value || '').trim()
            : !!enginePath || !!els.engineStatus?.className?.includes('emerald');
        const parts = [
            backend === 'twai' ? 'TWAI' : 'Engine',
            engineOk ? '就绪' : '未配置',
            `${taskLabel} · ${modeLabel}`,
            `ASR ${asr}`,
        ];
        if (task !== 'transcribe') {
            if (mode === 'engine') {
                parts.push(`MT ${els.engineMtModelSelect?.value || '自动'}`);
            } else if (mode === 'llm' || mode === 'sakura') {
                parts.push(`推理 ${els.engineLlmMtModelSelect?.value || '默认'}`);
            } else if (mode === 'smart') {
                parts.push(advancedEntitled ? 'Pro LLM' : '需解锁 Pro');
            }
        }
        els.readinessStripText.textContent = parts.join(' · ');
        els.readinessStrip.classList.remove('hidden', 'is-warn', 'is-ok');
        if (!engineOk) {
            els.readinessStrip.classList.add('is-warn');
            if (els.readinessStripAction) {
                els.readinessStripAction.classList.remove('hidden');
                els.readinessStripAction.textContent = '去配置环境';
                els.readinessStripAction.dataset.action = 'install';
            }
        } else if (mode === 'smart' && !advancedEntitled) {
            els.readinessStrip.classList.add('is-warn');
            if (els.readinessStripAction) {
                els.readinessStripAction.classList.remove('hidden');
                els.readinessStripAction.textContent = '解锁 Pro';
                els.readinessStripAction.dataset.action = 'pro';
            }
        } else {
            els.readinessStrip.classList.add('is-ok');
            els.readinessStripAction?.classList.add('hidden');
        }
    }

    function computeStartBlockReason() {
        if (state.running || state.postBatchBusy || state.retranslateBusy) {
            return '任务或后处理进行中';
        }
        if (state.computeBusy) {
            return state.computeBusyLabel
                ? `已有${state.computeBusyLabel}正在运行`
                : '其它窗口有引擎或 LLM 任务正在运行';
        }
        const selectable = state.items.filter((i) => i.selected && i.status !== 'error');
        if (!selectable.length) {
            if (!state.items.length) return '请先添加媒体文件';
            if (!state.items.some((i) => i.selected)) return '请勾选要处理的条目';
            return '所选条目不可用（含错误项）';
        }
        const probing = state.items.some((i) => i.selected && (i.status === 'probing' || i.status === 'pending'));
        if (probing) return '正在探测视频信息…';
        const sensing = isAutoSenseEnabled()
            && state.items.some((i) => i.selected && i.sense?.status === 'sensing');
        if (sensing) return '智能感知进行中…';
        return '';
    }

    function updateStartHint() {
        const reason = computeStartBlockReason();
        if (!els.startBtn) return;
        els.startBtn.title = (els.startBtn.disabled && reason) ? reason : '';
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
        updateEnvBanner();
        updateAutoSenseUi();
        syncTranslateModeChipUi();
        syncPostBatchQcFixChipUi();
        updateReadinessStrip();
    }

    function isAutoSenseEnabled() {
        if (els.autoSenseToggle) {
            return els.autoSenseToggle.getAttribute('aria-pressed') !== 'false';
        }
        return savedOptionsSnapshot?.autoSense !== false;
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

    function setAutoSenseEnabled(on, { persist = true } = {}) {
        const enabled = !!on;
        if (els.autoSenseToggle) {
            els.autoSenseToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }
        if (els.autoSenseToggleLabel) {
            els.autoSenseToggleLabel.textContent = enabled ? '开' : '关';
        }
        updateAutoSenseUi();
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
        if (!profileApi?.describeAutoSenseUi && !profileApi?.describeContentProfileUi) return;

        const autoEnabled = isAutoSenseEnabled();
        let sensingCount = 0;
        let adoptedCount = 0;
        let doneCount = 0;
        for (const item of state.items) {
            const s = item.sense;
            if (!s) continue;
            if (s.status === 'sensing') sensingCount += 1;
            if (s.status === 'done') {
                doneCount += 1;
                if (s.adopted) adoptedCount += 1;
            }
        }

        const describe = profileApi.describeAutoSenseUi || profileApi.describeContentProfileUi;
        const ui = describe({
            autoEnabled,
            sensingCount,
            adoptedCount,
            doneCount,
            itemCount: state.items.length,
        });
        state.autoSenseUi = ui;

        if (els.autoSenseToggleLabel && autoEnabled) {
            // Keep short "开" when idle; show counts when busy / adopted
            if (sensingCount > 0 || adoptedCount > 0) {
                els.autoSenseToggleLabel.textContent = ui.chipLabel.replace(/^感知[·\s]*/, '') || '开';
            } else {
                els.autoSenseToggleLabel.textContent = '开';
            }
        } else if (els.autoSenseToggleLabel && !autoEnabled) {
            els.autoSenseToggleLabel.textContent = '关';
        }
        if (els.autoSenseToggle) {
            const tone = autoEnabled ? (ui.tone && ui.tone !== 'off' ? ui.tone : 'idle') : 'off';
            const chip = els.autoSenseToggle.closest('.content-profile-chip') || els.autoSenseToggle;
            chip.className = `content-profile-chip tone-${tone}`;
            els.autoSenseToggle.setAttribute('aria-pressed', autoEnabled ? 'true' : 'false');
            els.autoSenseToggle.title = ui.title || ui.detail || '智能感知';
        }
        updateStartButton();
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
        const formLang = String(base.language || '').trim().toLowerCase();
        if (formLang && formLang !== 'auto') {
            return { language: formLang, source: 'form', confidence: 1 };
        }

        const metaRaw = String(item.metaLanguage || item.audioLanguages?.[0] || '').trim().toLowerCase();
        const metaGuess = profileApi?.priorFromMetaLanguage?.(metaRaw)
            || (metaRaw ? { language: metaRaw, confidence: 0.85, reason: '音轨标记' } : null);

        const nameGuess = profileApi?.guessLanguageFromName?.(item.path) || null;

        // Prefer the stronger non-form prior when deciding whether to skip sniff / fall back
        const pathPrior = (() => {
            const candidates = [nameGuess, metaGuess].filter((g) => g?.language);
            if (!candidates.length) return null;
            return candidates.reduce((best, cur) => (
                Number(cur.confidence) > Number(best.confidence) ? cur : best
            ));
        })();

        const sniffGate = {
            metaLanguage: metaGuess?.language || '',
            metaConfidence: metaGuess?.confidence || 0,
            nameLanguage: nameGuess?.language || '',
            nameConfidence: nameGuess?.confidence || 0,
            profile: senseHints.profile,
            profileConfidence: senseHints.profileConfidence,
            profileConfident: senseHints.profileConfident,
            strongAv: senseHints.strongAv,
            forceDeep: !!senseHints.forceDeep,
        };

        if (pathPrior?.language && Number(pathPrior.confidence || 0) >= 0.55) {
            const source = pathPrior === nameGuess ? 'name' : (pathPrior === metaGuess ? 'meta' : 'name');
            if (!profileApi.shouldSniffSpokenLanguage?.(sniffGate, base)) {
                return {
                    language: pathPrior.language,
                    source,
                    confidence: pathPrior.confidence,
                    reason: pathPrior.reason,
                };
            }
        }

        const backend = String(base.engineBackend || els.engineBackendSelect?.value || 'transub');
        if (backend === 'twai' || !electron?.transubEngineDetectLanguage) {
            if (pathPrior?.language) {
                return {
                    language: pathPrior.language,
                    source: pathPrior === metaGuess ? 'meta' : 'name',
                    confidence: pathPrior.confidence,
                    reason: pathPrior.reason,
                };
            }
            return { language: formLang || 'auto', source: 'form', confidence: 0 };
        }

        const needSniff = profileApi?.shouldSniffSpokenLanguage?.(sniffGate, base) !== false;

        if (!needSniff) {
            if (pathPrior?.language) {
                return {
                    language: pathPrior.language,
                    source: pathPrior === metaGuess ? 'meta' : 'name',
                    confidence: pathPrior.confidence,
                    reason: pathPrior.reason,
                };
            }
            return { language: 'auto', source: 'form', confidence: 0 };
        }

        appendLog(`短窗语种探测：${basename(item.path)}…`, 'info');
        const sniffWin = profileApi?.resolveSenseSniffWindow?.({
            durationSec: item.duration || 0,
            windowSec: 12,
        }) || { startSec: 0, durationSec: 12, reason: '片头区', skippedIntro: false };
        try {
            const res = await electron.transubEngineDetectLanguage({
                mediaPath: item.path,
                asrModel: base.engineAsrModel,
                device: base.device || 'auto',
                durationSec: sniffWin.durationSec,
                startSec: sniffWin.startSec,
                options: base,
            });
            if (res?.ok && res.language && res.language !== 'auto') {
                const conf = Number(res.confidence) || 0;
                const usedStart = Number(res.startSec);
                const skippedIntro = Number.isFinite(usedStart)
                    ? usedStart >= 30
                    : !!sniffWin.skippedIntro;
                const sniff = {
                    language: String(res.language).toLowerCase(),
                    confidence: conf,
                };
                // Compete against the strongest path/meta prior (weak en must not lock sniff out)
                const avLikely = !!senseHints.strongAv
                    || /AV/.test(String(pathPrior?.reason || ''));
                if (profileApi?.shouldPreferSniffLanguage?.(sniff, pathPrior, {
                    skippedIntro,
                    avLikely,
                })) {
                    const winNote = sniffWin.reason && sniffWin.startSec > 0
                        ? `，${sniffWin.reason}`
                        : '';
                    return {
                        language: sniff.language,
                        source: 'sniff',
                        confidence: conf,
                        reason: `短窗探测 ${(conf * 100).toFixed(0)}%${winNote}`,
                    };
                }
            }
            if (res?.error) {
                appendLog(`语种探测跳过：${res.error}`, 'warn');
            }
        } catch (err) {
            appendLog(`语种探测失败：${err?.message || err}`, 'warn');
        }

        if (pathPrior?.language) {
            return {
                language: pathPrior.language,
                source: pathPrior === metaGuess ? 'meta' : 'name',
                confidence: pathPrior.confidence,
                reason: pathPrior.reason,
            };
        }
        return { language: 'auto', source: 'form', confidence: 0 };
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
        let overrides = { ...(resolved.overrides || {}) };
        if (resolved.adopted
            && langPrior?.language
            && langPrior.language !== 'auto'
            && !overrides.language) {
            overrides.language = langPrior.language;
        }
        if (langPrior?.source === 'sniff'
            && langPrior.confidence >= 0.55
            && langPrior.language
            && langPrior.language !== 'auto') {
            overrides.language = langPrior.language;
            if (resolved.action === 'skip' || resolved.action === 'suggest') {
                if (!resolved.adopted && Object.keys(overrides).length) {
                    resolved.action = 'suggest';
                    resolved.adopted = false;
                }
            }
        }

        if (refineModels && profileApi?.refineSenseModels) {
            const refined = profileApi.refineSenseModels(overrides, {
                profile: resolved.classification?.profile,
                language: overrides.language || senseBase.language,
                task: senseBase.task,
                installedModels: cachedEngineModels,
            });
            overrides = refined.overrides || overrides;
            if (refined.notes?.length) {
                appendLog(`模型匹配：${basename(item.path)} · ${refined.notes.join('；')}`, 'info');
            }
        }
        if (profileApi?.sanitizeSakuraMtForLanguage) {
            const safe = profileApi.sanitizeSakuraMtForLanguage(
                overrides,
                overrides.language || senseBase.language,
                { installedModels: cachedEngineModels },
            );
            if (safe?.changed) {
                overrides = safe.options || overrides;
                if (safe.note) {
                    appendLog(`模型匹配：${basename(item.path)} · ${safe.note}`, 'warn');
                }
            }
        }

        let supportGaps = [];
        if (profileApi?.collectSenseSupportGaps) {
            const gaps = profileApi.collectSenseSupportGaps(overrides, {
                profile: resolved.classification?.profile,
                language: overrides.language || senseBase.language,
                task: senseBase.task,
                installedModels: cachedEngineModels,
                demucsReady: true,
                advancedEntitled,
            });
            supportGaps = gaps.missing || [];
        }

        const langNote = langPrior?.source === 'sniff'
            || langPrior?.source === 'meta'
            || langPrior?.source === 'name'
            ? ` · 语种 ${langPrior.language}${langPrior.reason ? `（${langPrior.reason}）` : ''}`
            : '';
        item.sense = {
            status: 'done',
            adopted: !!resolved.adopted,
            classification: resolved.classification || null,
            overrides,
            supportGaps,
            message: (resolved.message || '') + langNote,
            action: resolved.action || 'skip',
            languagePrior: langPrior || null,
            depth,
        };
        if (!item.sense.adopted
            && langPrior?.source === 'sniff'
            && langPrior.confidence >= 0.7
            && overrides.language) {
            const keys = Object.keys(overrides);
            const onlyLangOrModels = keys.every((k) => (
                k === 'language' || k === 'engineAsrModel' || k === 'engineMtModel'
            ));
            if (onlyLangOrModels) {
                item.sense.adopted = true;
                item.sense.action = 'apply';
                item.sense.message = `短窗语种 ${overrides.language}（${Math.round(langPrior.confidence * 100)}%）→ 已采纳`
                    + (overrides.engineAsrModel ? ` · ASR ${overrides.engineAsrModel}` : '')
                    + (overrides.engineMtModel ? ` · MT ${overrides.engineMtModel}` : '')
                    + (resolved.message ? `；${resolved.message}` : '');
            }
        }
        if (item.sense.message) {
            appendLog(item.sense.message, item.sense.adopted ? 'info' : 'warn');
        } else if (resolved.action === 'skip' && !quietSkip) {
            appendLog(`感知完成：${basename(item.path)} · 未识别明确类型`, 'info');
        }
        if (item.sense.adopted && item.sense.classification?.profile) {
            recordSenseMemoryForItem(item, true);
        }
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

        const nameLangGuess = profileApi.guessLanguageFromName?.(item.path) || null;
        const quickLang = (nameLangGuess?.language
            && Number(nameLangGuess.confidence || 0) >= 0.55)
            ? nameLangGuess.language
            : 'ja';
        const nameClassification = profileApi.classifyContentProfile?.({
            path: item.path,
            durationSec: item.duration || 0,
            language: quickLang,
        }) || null;
        if (!profileApi.isInstantAvSenseCandidate(nameClassification)) return false;

        const base = getSenseBaseOptions();
        const senseBase = {
            ...base,
            language: quickLang || 'ja',
        };
        const langPrior = {
            language: senseBase.language,
            source: 'name',
            confidence: nameLangGuess?.confidence || 0.7,
            reason: nameLangGuess?.reason || 'AV 番号先验',
        };
        const resolved = profileApi.resolveItemSense(
            { path: item.path, durationSec: item.duration || 0 },
            senseBase,
            { autoSense: true, advancedEntitled, memoryHits: [] },
        );
        finalizeSenseResult(item, resolved, langPrior, senseBase, {
            depth: 'instant',
            refineModels: true,
        });
        appendLog(
            `番号即感：${basename(item.path)} · ${nameClassification.label}`
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
                            || /番号|AV/.test(String(resolved.classification?.reasons?.join(' ') || ''))
                            || /AV/.test(String(langPrior?.reason || '')),
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
            item.sense = {
                status: 'error',
                adopted: false,
                classification: null,
                overrides: {},
                message: err?.message || '感知失败',
            };
            appendLog(`感知失败：${basename(item.path)} · ${item.sense.message}`, 'err');
        }
        refreshListRow(item);
        updateAutoSenseUi();
    }

    const SENSE_CONCURRENCY_QUICK = 4;
    const SENSE_CONCURRENCY_DEEP = 1;
    let senseQueue = [];
    let senseRunning = 0;
    let senseDeepRunning = 0;
    let senseModelsPrefetch = null;

    function enqueueSense(item, opts = {}) {
        if (!item) return;
        if (!isAutoSenseEnabled() && !opts.force) return;
        // Instant 番号: finish now, skip queue
        if (!opts.force && !opts.deep && tryInstantAvSense(item)) {
            refreshListRow(item);
            updateAutoSenseUi();
            return;
        }
        senseQueue.push({ item, opts });
        drainSenseQueue();
    }

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

    function drainSenseQueue() {
        while (senseQueue.length) {
            const peek = senseQueue[0];
            const wantDeep = !!(peek.opts?.deep || peek.opts?.force);
            const limit = wantDeep ? SENSE_CONCURRENCY_DEEP : SENSE_CONCURRENCY_QUICK;
            const running = wantDeep ? senseDeepRunning : senseRunning;
            // Deep jobs must not share slots with quick jobs (avoid starving either)
            if (wantDeep && senseRunning > 0) break;
            if (!wantDeep && senseDeepRunning > 0) break;
            if (running >= limit) break;

            const job = senseQueue.shift();
            if (wantDeep) senseDeepRunning += 1;
            else senseRunning += 1;

            Promise.resolve()
                .then(() => (wantDeep ? ensureSenseModelsPrefetch() : Promise.resolve()))
                .then(() => runSenseForItem(job.item, job.opts))
                .finally(() => {
                    if (wantDeep) senseDeepRunning -= 1;
                    else senseRunning -= 1;
                    if (!senseRunning && !senseDeepRunning && !senseQueue.length) {
                        senseModelsPrefetch = null;
                    }
                    drainSenseQueue();
                    if (!senseRunning && !senseDeepRunning && !senseQueue.length) {
                        updateAutoSenseUi();
                    }
                });
        }
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
            message: '确定清空全部自动感知纠错记忆（目录 / 厂牌偏好）？\n当前列表里已有的感知结果不会被清除。',
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
        const s = item?.sense;
        if (!s) return false;
        if (s.userRejected) return true;
        // Memory avoid: visible suggest, not auto-adopted — treat as sticky 不采纳.
        return s.action === 'suggest' && !s.adopted;
    }

    function rejectItemSense(item) {
        if (!item?.sense) return;
        item.sense = {
            ...item.sense,
            adopted: false,
            userRejected: true,
            status: item.sense.status === 'sensing' ? 'done' : item.sense.status,
            message: item.sense.message
                ? `${String(item.sense.message).replace(/（已不采纳）$/, '')}（已不采纳）`
                : '已不采纳感知方案',
        };
        recordSenseMemoryForItem(item, false);
        refreshListRow(item);
        updateAutoSenseUi();
        appendLog(`不采纳感知：${basename(item.path)}`, 'info');
    }

    function adoptItemSense(item, { quiet = false } = {}) {
        if (!item?.sense || item.sense.status !== 'done') return false;
        const overrides = item.sense.overrides || {};
        if (!Object.keys(overrides).length) {
            if (!quiet) appendLog(`无法采纳：${basename(item.path)} · 无可用感知参数`, 'warn');
            return false;
        }
        item.sense = {
            ...item.sense,
            adopted: true,
            userRejected: false,
            action: item.sense.action === 'suggest' ? 'apply' : (item.sense.action || 'apply'),
            message: item.sense.message
                ? String(item.sense.message).replace(/（已不采纳）/g, '').replace(/；未自动采纳$/, '')
                : '已采纳感知方案',
        };
        recordSenseMemoryForItem(item, true);
        refreshListRow(item);
        updateAutoSenseUi();
        if (!quiet) appendLog(`采纳感知：${basename(item.path)}`, 'info');
        return true;
    }

    /**
     * While 智能感知 is on: force-adopt any finished sense scheme unless the user
     * explicitly rejected it (wand / sticky memory avoid). Returns items still
     * uncovered (no adopted overrides and not explicitly rejected).
     */
    function enforceSenseAdoptForStart(selectedItems = []) {
        const list = Array.isArray(selectedItems) ? selectedItems : [];
        const uncovered = [];
        for (const item of list) {
            const s = item?.sense;
            if (s?.status === 'sensing') {
                uncovered.push(item);
                continue;
            }
            if (isExplicitSenseReject(item)) continue;
            if (s?.adopted && s.overrides && Object.keys(s.overrides).length) continue;
            if (s?.status === 'done' && s.overrides && Object.keys(s.overrides).length) {
                adoptItemSense(item, { quiet: true });
                if (item.sense?.adopted) continue;
            }
            uncovered.push(item);
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
                : (activeIsLlm ? activeMt : 'sakura-1.5b');
            ensureSelectValue(els.engineMtModelSelect, opusMt, {
                label: opusMt ? `${opusMt}` : '',
                allowEmpty: true,
            });
            ensureSelectValue(els.engineLlmMtModelSelect, llmMt || 'sakura-1.5b', {
                label: llmMt || 'sakura-1.5b',
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
        if (els.filmAudioEnhanceCheck) {
            els.filmAudioEnhanceCheck.checked = !!options.filmAudioEnhance;
        }
        if (els.filmVadPresetCheck) {
            els.filmVadPresetCheck.checked = !!options.filmVadPreset && !options.filmAudioEnhance;
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
            els.languageSelect.value = options.language;
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
        if (els.autoUpdateCheckIntervalSelect) {
            const interval = String(options.autoUpdateCheckInterval || 'weekly').trim().toLowerCase();
            els.autoUpdateCheckIntervalSelect.value = ['off', 'daily', 'weekly', 'monthly'].includes(interval)
                ? interval
                : 'weekly';
        }
        if (els.postBatchQcCheck) {
            els.postBatchQcCheck.checked = options.postBatchQc !== false;
        }
        void setPostBatchQcFixMode(options.postBatchQcFixMode || 'none', { persist: false });
        if (els.autoDeepSenseCheck) {
            els.autoDeepSenseCheck.checked = !!options.autoDeepSense;
        }
        setAutoSenseEnabled(options.autoSense !== false, { persist: false });
        if (els.postBatchCpsSplitCheck) {
            els.postBatchCpsSplitCheck.checked = options.postBatchCpsSplit !== false;
        }
        if (els.postBatchRemoveNoiseCheck) {
            els.postBatchRemoveNoiseCheck.checked = options.postBatchRemoveNoise !== false;
        }
        if (els.postBatchCompressRepCheck) {
            els.postBatchCompressRepCheck.checked = options.postBatchCompressRepetition !== false;
        }
        if (els.postBatchCompactPureInterjectionsCheck) {
            els.postBatchCompactPureInterjectionsCheck.checked = !!options.postBatchCompactPureInterjections;
        }
        syncDeviceOptionsForMode();
        syncBatchSizeUi();
        syncExpertCustomHints();
        // Apply 翻译方式 from options BEFORE Chinese-variant / smart-UI sync, which
        // re-reads radios (HTML default is 机器翻译) and would otherwise clobber llm/smart.
        syncTranslateModeFromOptions(options);
        syncChineseSubtitleVariantUi();
        void refreshModelSelects(options);
        updateParamsSummary();
    }

    function readTwaiLegacyOptionsFromSnapshot() {
        return readTwaiLegacyOptions();
    }

    function buildSavedOptionsFromForm() {
        const maxSegText = String(els.vadMaxSingleSegmentInput?.value ?? '').trim();
        const maxSegRaw = maxSegText === '' ? NaN : Number(maxSegText);
        const vadMaxSingleSegmentMs = Number.isFinite(maxSegRaw)
            ? Math.max(5000, Math.min(60000, Math.round(maxSegRaw)))
            : 30000;
        const translateTask = readTaskFromForm() === 'translate' || readTaskFromForm() === 'dual';
        const built = {
            engineBackend: readEngineBackendFromForm(),
            engineInstallPath: engineInstallPathForSave(),
            engineUrl: els.engineUrlInput?.value.trim() || 'http://127.0.0.1:8765',
            engineHfEndpoint: els.engineHfEndpointInput?.value?.trim() ?? 'https://hf-mirror.com',
            proxyEnabled: !!els.proxyEnabledCheck?.checked,
            proxyUrl: els.proxyUrlInput?.value?.trim() || '',
            proxyBypass: els.proxyBypassInput?.value?.trim()
                || 'localhost,127.0.0.1,::1,<local>',
            engineProfile: els.engineProfileSelect?.value || 'balanced',
            engineAsrModel: els.engineAsrModelSelect?.value || 'sensevoice-small',
            engineOpusMtModel: readOpusMtModelFromForm(),
            engineLlmMtModel: readLlmMtModelFromForm(),
            engineMtModel: readActiveEngineMtModelFromForm(),
            // Explicit mode so load does not depend solely on inferring from engineMtModel.
            translateMode: readTranslateModeFromForm(),
            engineVadModel: els.engineVadModelSelect?.value || 'fsmn-vad',
            engineAutoStart: els.engineAutoStartCheck ? !!els.engineAutoStartCheck.checked : true,
            installPath: els.installPathInput?.value.trim() || '',
            device: els.deviceSelect?.value || 'cuda',
            task: readTaskFromForm(),
            overwrite: !!els.overwriteCheck?.checked,
            mergeBilingualSubtitles: readTaskFromForm() === 'dual' && !!els.mergeBilingualCheck?.checked,
            dualLineOrder: readDualLineOrderFromForm(),
            smartTranslate: translateTask && !!els.smartTranslateCheck?.checked,
            smartTranslateFaithfulTone: translateTask && !!els.smartTranslateFaithfulCheck?.checked,
            // Advanced-only: never persist while not entitled (disabled checkboxes can stay checked).
            filmAudioEnhance: advancedEntitled && !!els.filmAudioEnhanceCheck?.checked,
            filmVadPreset: advancedEntitled
                && !!els.filmVadPresetCheck?.checked
                && !els.filmAudioEnhanceCheck?.checked,
            deleteSourcesAfterMergeBilingual: readTaskFromForm() === 'dual'
                && !!els.mergeBilingualCheck?.checked
                && !!els.deleteSourcesAfterMergeCheck?.checked,
            subFormats: readSubFormatsFromForm(),
            includeWords: false,
            karaokeVtt: false,
            releaseGpuAfter: els.releaseGpuAfterCheck?.checked ? true : null,
            modelPath: readModelPathFromForm('translate') || readModelPathFromForm('transcribe') || '',
            transcribeModelPath: readModelPathFromForm('transcribe'),
            translateModelPath: readModelPathFromForm('translate'),
            chineseSubtitleVariant: (() => {
                const cv = String(els.chineseSubtitleVariantSelect?.value || 'simplified');
                const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
                return allowed.has(cv) ? cv : 'simplified';
            })(),
            glossaryPromptEnabled: false,
            glossaryMtEnabled: els.glossaryMtCheck ? !!els.glossaryMtCheck.checked : true,
            logLevel: els.logLevelSelect?.value || 'DEBUG',
            maxBatchSize: Number(els.maxBatchSizeInput?.value) || 8,
            language: els.languageSelect?.value || 'auto',
            beamSize: Number(els.beamSizeInput?.value) || 5,
            vadEnabled: els.vadEnabledCheck ? !!els.vadEnabledCheck.checked : true,
            vadSensitive: !!els.vadSensitiveCheck?.checked,
            vadThreshold: numOrFinite(els.vadThresholdInput?.value, 0.5),
            vadMinSpeechDurationMs: numOrFinite(els.vadMinSpeechDurationInput?.value, 300),
            vadMinSilenceDurationMs: numOrFinite(els.vadMinSilenceDurationInput?.value, 100),
            vadSpeechPadMs: numOrFinite(els.vadSpeechPadInput?.value, 200),
            vadMaxSingleSegmentMs,
            vadAggressive: !!els.vadAggressiveCheck?.checked && !els.vadSensitiveCheck?.checked,
            audioLightDenoise: !!els.audioLightDenoiseCheck?.checked,
            ...readTwaiLegacyOptionsFromSnapshot(),
            // Keep targetChunkDurationS in sync for TWAI / legacy readers
            targetChunkDurationS: Math.round(vadMaxSingleSegmentMs / 1000),
            hallucinationSilenceThreshold: (() => {
                const raw = els.hallucinationSilenceInput?.value;
                if (raw == null || String(raw).trim() === '') return null;
                const n = Number(raw);
                if (!Number.isFinite(n) || n <= 0) return null;
                return Math.max(0.1, Math.min(30, n));
            })(),
            retranscribeWarmLight: !!els.retranscribeWarmLightCheck?.checked,
            subtitleBakMode: ['off', 'beside', 'appBackup'].includes(els.subtitleBakModeSelect?.value)
                ? els.subtitleBakModeSelect.value
                : 'off',
            keepTranscript: els.keepTranscriptCheck ? !!els.keepTranscriptCheck.checked : true,
            transcriptKeepDir: els.transcriptKeepDirInput?.value.trim() || '',
            transcriptKeepLimit: (() => {
                const n = Number(els.transcriptKeepLimitInput?.value);
                if (!Number.isFinite(n)) return 200;
                return Math.max(0, Math.min(9999, Math.round(n)));
            })(),
            transcriptKeepDays: (() => {
                const n = Number(els.transcriptKeepDaysInput?.value);
                if (!Number.isFinite(n)) return 90;
                return Math.max(0, Math.min(3650, Math.round(n)));
            })(),
            trayProgressEnabled: els.trayProgressCheck ? !!els.trayProgressCheck.checked : true,
            showTaskResourceUsage: els.showTaskResourceUsageCheck
                ? !!els.showTaskResourceUsageCheck.checked
                : true,
            minimizeToTrayEnabled: els.minimizeToTrayCheck ? !!els.minimizeToTrayCheck.checked : true,
            minimizeToTrayOnStart: !!els.minimizeToTrayOnStartCheck?.checked,
            trayNotifyEnabled: !!els.trayNotifyCheck?.checked,
            startupWindow: els.startupWindowSelect?.value === 'editor' ? 'editor' : 'generator',
            autoUpdateCheckInterval: ['off', 'daily', 'weekly', 'monthly'].includes(
                els.autoUpdateCheckIntervalSelect?.value,
            )
                ? els.autoUpdateCheckIntervalSelect.value
                : 'weekly',
            autoSense: isAutoSenseEnabled(),
            autoDeepSense: !!els.autoDeepSenseCheck?.checked,
            postBatchQc: els.postBatchQcCheck ? !!els.postBatchQcCheck.checked : true,
            postBatchQcFixMode: getPostBatchQcFixMode(),
            postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
            postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
            postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
            postBatchCompactPureInterjections: !!els.postBatchCompactPureInterjectionsCheck?.checked,
            outputMode: els.outputModeSelect?.value === 'custom' ? 'custom' : 'same',
            outputDir: resolveOutputDirFromForm(),
            audioSuffixes: els.audioSuffixesInput?.value.trim() || DEFAULT_AUDIO_SUFFIXES,
            ffmpegPath: els.ffmpegPathInput
                ? (els.ffmpegPathInput.value.trim() || '')
                : (savedOptionsSnapshot?.ffmpegPath || ''),
        };
        stashTwaiLegacyFromOptions(built);
        return built;
    }

    function getFfmpegPathFromForm() {
        return els.ffmpegPathInput?.value.trim() || '';
    }

    function buildRuntimeOptions() {
        return {
            ...buildSavedOptionsFromForm(),
            ...getPostTaskOptionsFromUi(),
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
            setSaveParamsStatus(
                '智能翻译需解锁 Pro',
                'warn',
            );
            switchParamsTab('pro');
            return;
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
        if (els.removeSelectedBtn) els.removeSelectedBtn.disabled = busy;
        if (els.clearListBtn) els.clearListBtn.disabled = busy;
        if (els.selectAllCheck) els.selectAllCheck.disabled = busy;
        updateStopButton();
        updateStartHint();
    }

    function updateStopButton() {
        if (els.stopBtn) {
            els.stopBtn.disabled = !(state.running || state.retranslateBusy);
        }
    }

    async function stopTask() {
        if (!state.running && !state.retranslateBusy) return;
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

        if (state.running) {
            state.pendingQueue.push(...toProbe);
            updateQueueBadge();
            appendLog(`已加入队列 ${toProbe.length} 个文件，当前任务结束后询问是否继续`, 'info');
            return;
        }

        if (withLoading) {
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
                if (toProbe.length > 1 && (withLoading || state.loadingDepth > 0)) {
                    updateLoadingMessage(`正在探测视频信息 (${probed}/${toProbe.length})…`);
                }
            });
        } finally {
            if (withLoading) setLoading(false);
        }
        updateStartButton();
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
        const map = {
            pending: { label: '排队', cls: 'row-status-pending' },
            probing: { label: '探测中', cls: 'row-status-probing' },
            ready: { label: '就绪', cls: 'row-status-ready' },
            running: { label: '进行中', cls: 'row-status-running' },
            done: { label: '完成', cls: 'row-status-done' },
            skipped: { label: '已跳过', cls: 'row-status-skipped' },
            cancelled: { label: '已取消', cls: 'row-status-skipped' },
            failed: { label: '失败', cls: 'row-status-failed' },
            error: { label: '错误', cls: 'row-status-error' },
        };
        return map[status] || { label: status || '—', cls: 'row-status-pending' };
    }

    function countQcIssues() {
        return state.items.filter((i) => Number(i.qcIssueCount) > 0).length;
    }

    function markItemQcFixed(item, mode, { written = false, summary = '' } = {}) {
        if (!item) return;
        item.qcFixedMode = mode === 'smart' ? 'smart' : 'fix';
        item.qcFixedWritten = !!written;
        item.qcFixedSummary = String(summary || '').trim().slice(0, 200);
        item.qcFixedAt = Date.now();
    }

    function clearItemQcFixed(item, { clearScan = false } = {}) {
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
        const mode = String(item?.qcFixedMode || '');
        if (mode !== 'fix' && mode !== 'smart') return '';
        const label = mode === 'smart' ? 'Pro修' : '已修';
        const tip = esc(
            item.qcFixedSummary
            || (mode === 'smart' ? '已智能修复 QC' : '已一键修复 QC')
            || '',
        );
        return `<span class="qc-fixed-tag is-${mode}" title="${tip}">${label}</span>`;
    }

    function updateQcBanner() {
        if (!els.qcBanner) return;
        const n = countQcIssues();
        if (n <= 0 || state.qcBannerDismissed) {
            els.qcBanner.classList.add('hidden');
            return;
        }
        if (els.qcBannerText) {
            els.qcBannerText.textContent = state.qcFixing
                ? `正在${state.qcSmartFixing ? '智能' : '一键'}修复 QC（${n} 条有问题）…`
                : `${n} 条字幕有 QC 问题，可一键修复${advancedEntitled ? ' / 智能修复' : ''}或在编辑器中查看`;
        }
        if (els.qcBannerFixBtn) {
            els.qcBannerFixBtn.disabled = !!state.running || !!state.qcFixing;
            els.qcBannerFixBtn.textContent = state.qcFixing && !state.qcSmartFixing ? '修复中…' : '一键修复QC';
        }
        if (els.qcBannerSmartFixBtn) {
            const smartOk = !!advancedEntitled && !!electron?.transubAdvancedQcSmartFix;
            els.qcBannerSmartFixBtn.classList.toggle('hidden', !smartOk);
            els.qcBannerSmartFixBtn.disabled = !smartOk || !!state.running || !!state.qcFixing;
            els.qcBannerSmartFixBtn.textContent = state.qcSmartFixing ? '智能修复中…' : '智能修复 (Pro)';
        }
        els.qcBanner.classList.remove('hidden');
    }

    function readEngineBackendFromForm() {
        const v = String(els.engineBackendSelect?.value || 'transub').trim().toLowerCase();
        return v === 'twai' ? 'twai' : 'transub';
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
                ? '尚未配置 TransWithAI 引擎：请在「设置 → 环境」完成检测。'
                : '尚未配置 Transub Engine：请在「设置 → 环境」检测内置引擎并下载模型。';
        }
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
            engineAutoStart: !!els.engineAutoStartCheck?.checked,
        };
    }

    function formatEngineDownloadError(raw) {
        const msg = String(raw || '').trim();
        if (!msg) return '模型下载失败';
        // Engine already produced a localized, actionable message — keep it.
        if (
            msg.includes('无法连接模型仓库')
            || msg.includes('浏览器能打开镜像站')
            || msg.includes('文件实际跳转到')
            || msg.includes('Hub 仓库不存在')
        ) {
            return msg;
        }
        const lower = msg.toLowerCase();
        if (
            lower.includes('numba')
            && (lower.includes('failed to build') || lower.includes('getting requirements to build'))
        ) {
            return (
                '安装依赖失败：numba 无法源码编译。'
                + '请改用 numpy 2.4.x（不要装 2.5+），并优先安装预编译的 numba / llvmlite .whl。'
                + ` 原始错误：${msg.slice(0, 400)}`
            );
        }
        const isConnectivity = (
            lower.includes('connecttimeout')
            || lower.includes('connecterror')
            || msg.includes('10060')
            || msg.includes('10054')
            || lower.includes('timed out')
            || lower.includes('timeout')
            || lower.includes('connection attempt failed')
            || lower.includes('connection reset')
            || lower.includes('econnreset')
            || msg.includes('远程主机强迫关闭')
            || (lower.includes('hub') && lower.includes('internet connection'))
            || (lower.includes('snapshot folder') && lower.includes('internet'))
        );
        if (!isConnectivity) return msg;

        const ep = els.engineHfEndpointInput?.value.trim() || '';
        const onMirror = /hf-mirror\.com/i.test(ep) || /hf-mirror\.com/i.test(msg);
        if (onMirror || /已使用镜像|当前已使用镜像/.test(msg)) {
            return (
                `无法连接模型仓库（连接被重置/超时）。当前已使用镜像 ${ep || 'https://hf-mirror.com'}。`
                + '请尝试切换或关闭「设置→网络」代理后重试；浏览器能下不等于软件内下载链路可用。'
            );
        }
        return (
            `无法连接模型仓库（网络中断/超时）。请到「设置 → 网络」将 Hugging Face 镜像设为`
            + ` https://hf-mirror.com（当前：${ep || '官方 Hub'}），保存设置后重试下载。`
        );
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
        if (els.engineModelsSearch) els.engineModelsSearch.disabled = !!busy;
        els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
            btn.disabled = !!busy;
        });
        if (!busy) {
            engineDownloadActiveSource = null;
            renderEngineModelsCards();
        } else {
            els.engineModelsList?.querySelectorAll('[data-model-action]').forEach((btn) => {
                btn.disabled = true;
            });
        }
    }

    function appendEngineDownloadLog(line) {
        const text = String(line || '').trim();
        if (!text) return;
        engineDownloadLogLines.push(text);
        while (engineDownloadLogLines.length > 80) engineDownloadLogLines.shift();
        if (els.engineDownloadLog) {
            els.engineDownloadLog.textContent = engineDownloadLogLines.join('\n');
            els.engineDownloadLog.scrollTop = els.engineDownloadLog.scrollHeight;
        }
    }

    function setEngineDownloadProgressPct(pct) {
        const n = Number(pct);
        const width = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
        if (els.engineDownloadProgressBar) {
            els.engineDownloadProgressBar.style.width = `${width}%`;
            els.engineDownloadProgressBar.classList.toggle('animate-pulse', !Number.isFinite(n));
        }
        if (els.engineDownloadProgressPct) {
            els.engineDownloadProgressPct.textContent = Number.isFinite(n) ? `${Math.round(width)}%` : '…';
        }
    }

    function formatEngineDownloadBytes(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '';
        if (v < 1024) return `${Math.round(v)} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
        return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function formatEngineDownloadSpeed(bps) {
        const v = Number(bps);
        if (!Number.isFinite(v) || v <= 0) return '';
        if (v < 1024) return `${Math.round(v)} B/s`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB/s`;
        return `${(v / (1024 * 1024)).toFixed(1)} MB/s`;
    }

    function formatEngineDownloadSizeLine(info = {}) {
        const received = Number(info.downloadedBytes ?? info.received ?? info.transferred);
        const total = Number(info.totalBytes ?? info.totalSize);
        const speed = Number(info.bytesPerSecond ?? info.speed);
        const parts = [];
        const hasRecv = Number.isFinite(received) && received >= 0;
        const hasTotal = Number.isFinite(total) && total > 0;
        if (hasRecv && hasTotal) {
            parts.push(`${formatEngineDownloadBytes(received)} / ${formatEngineDownloadBytes(total)}`);
        } else if (hasRecv) {
            parts.push(`已下载 ${formatEngineDownloadBytes(received)}`);
        } else if (hasTotal) {
            parts.push(`总大小约 ${formatEngineDownloadBytes(total)}`);
        }
        const speedText = formatEngineDownloadSpeed(speed);
        if (speedText) parts.push(speedText);
        return parts.join(' · ');
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
        if (!force && line === lastAppEngineDlProgressText && canReuse) return;
        if (!force && !canReuse && now - lastAppEngineDlProgressAt < 1200) return;
        if (!force && canReuse && now - lastAppEngineDlProgressAt < 400) {
            // 高频进度：只改最后一行文案，节流写时间戳
            const ts = new Date().toLocaleTimeString();
            last.textContent = `[${ts}] ${line}`;
            lastAppEngineDlProgressText = line;
            return;
        }
        lastAppEngineDlProgressText = line;
        lastAppEngineDlProgressAt = now;
        if (canReuse && !force) {
            const ts = new Date().toLocaleTimeString();
            last.textContent = `[${ts}] ${line}`;
            const panel = els.logHost.closest('.log-panel') || els.logHost;
            panel.scrollTop = panel.scrollHeight;
            return;
        }
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
    }

    function filteredEnginePickItems() {
        const items = cachedEnginePickCatalog.slice();
        items.sort((a, b) => {
            if (!!b.recommended !== !!a.recommended) return b.recommended ? 1 : -1;
            if (!!b.installed !== !!a.installed) return b.installed ? 1 : -1;
            const ga = String(a.group || '');
            const gb = String(b.group || '');
            if (ga !== gb) {
                const order = { asr: 0, vad: 1, mt: 2, llm: 3, separate: 4 };
                return (order[ga] ?? 9) - (order[gb] ?? 9);
            }
            const ba = Number(a.paramBillion) || 0;
            const bb = Number(b.paramBillion) || 0;
            if (ga === 'llm' && ba !== bb) return ba - bb;
            return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh');
        });
        const q = engineModelsSearchQuery.trim().toLowerCase();
        return items.filter((item) => {
            if (engineModelsFilter !== 'all' && String(item.group || '') !== engineModelsFilter) {
                return false;
            }
            if (!q) return true;
            const hayParts = [item.name, item.id, item.note, item.group, item.kind, item.sizeHint, item.familyLabel];
            if (item.group === 'separate') hayParts.push('人声分离', 'demucs');
            if (item.group === 'llm') hayParts.push('llm', '推理', 'gguf');
            const hay = hayParts.map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.includes(q);
        });
    }

    function syncEngineModelPickSummary() {
        const total = cachedEnginePickCatalog.length;
        const visible = filteredEnginePickItems().length;
        if (els.engineModelsSummary) {
            if (!total) els.engineModelsSummary.textContent = '检测引擎后显示';
            else if (visible === total) els.engineModelsSummary.textContent = `共 ${total} 个模型`;
            else els.engineModelsSummary.textContent = `显示 ${visible} / ${total}`;
        }
        if (els.engineModelsSelectedHint) {
            const llmCount = cachedEnginePickCatalog.filter((m) => m.group === 'llm').length;
            const llmHint = llmCount
                ? (advancedEntitled
                    ? `LLM 推理翻译 ${llmCount} 个（含 Pro）`
                    : `LLM 推理翻译 ${llmCount} 个（免费档；解锁 Pro 可浏览全部）`)
                : '';
            els.engineModelsSelectedHint.textContent = llmHint
                ? `点卡片上的「下载」获取模型 · ${llmHint} · 任务选用请到「运行环境」页设置`
                : '点卡片上的「下载」获取模型 · 任务选用请到「运行环境」页设置';
            els.engineModelsSelectedHint.classList.remove('is-ok');
        }
    }

    function setEngineModelsFilter(next) {
        const allowed = new Set(['all', 'asr', 'vad', 'mt', 'llm', 'separate']);
        engineModelsFilter = allowed.has(next) ? next : 'all';
        els.engineModelsFilters?.querySelectorAll('[data-models-filter]').forEach((btn) => {
            const active = btn.getAttribute('data-models-filter') === engineModelsFilter;
            btn.classList.toggle('is-on', active);
        });
        renderEngineModelsCards();
    }

    function engineModelKindLabel(kind) {
        if (kind === 'asr') return 'ASR';
        if (kind === 'mt') return 'MT';
        if (kind === 'vad') return 'VAD';
        if (kind === 'demucs' || kind === 'separate') return '人声分离';
        return String(kind || '').toUpperCase() || '模型';
    }

    function formatEngineModelOptionLabel(model) {
        // Environment selects: plain name only (no size / install badge)
        return String(model?.name || model?.id || '').trim() || 'unknown';
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
        // Only list models already downloaded/installed
        const list = (Array.isArray(models) ? models : []).filter((m) => {
            if (m?.kind !== kind || !m?.installed || m?.incomplete) return false;
            if (typeof modelFilter === 'function' && !modelFilter(m)) return false;
            return true;
        });
        const want = String(selectedId || '');
        const opts = [];
        if (allowEmpty) {
            opts.push(`<option value="">${esc(emptyLabel)}</option>`);
        }
        for (const model of list) {
            const id = String(model.id || '');
            if (!id) continue;
            const sel = id === want ? ' selected' : '';
            opts.push(`<option value="${esc(id)}"${sel}>${esc(formatEngineModelOptionLabel(model))}</option>`);
        }
        // Keep current setting visible if it is not among installed options yet
        if (want && !list.some((m) => String(m.id || '') === want)) {
            opts.push(`<option value="${esc(want)}" selected>${esc(want)}（未下载）</option>`);
        }
        if (!opts.length) {
            opts.push(`<option value="">（暂无已下载模型）</option>`);
        }
        selectEl.innerHTML = opts.join('');
        if (want && [...selectEl.options].some((o) => o.value === want)) {
            selectEl.value = want;
        } else if (allowEmpty) {
            selectEl.value = '';
        } else if (selectEl.options.length) {
            selectEl.selectedIndex = 0;
        }
    }

    function normalizeEnginePickCatalog(models) {
        const items = Array.isArray(models) ? models.slice() : [];
        return items.map((model) => {
            const id = String(model.id || '').trim();
            const rawKind = String(model.kind || '').toLowerCase();
            const managedEntry = findManagedLlmCatalogEntry(id);
            const group = (rawKind === 'mt' && (isSakuraMtModelId(id) || managedEntry))
                || model.group === 'llm'
                || model.source === 'managed'
                ? 'llm'
                : (rawKind === 'demucs' || rawKind === 'separate'
                    ? 'separate'
                    : (rawKind === 'asr' || rawKind === 'mt' || rawKind === 'vad' ? rawKind : rawKind || 'other'));
            const sizeHint = model.sizeHint
                || (Number(model.size_hint_mb) > 0 ? `约 ${model.size_hint_mb} MB` : '');
            return {
                id,
                name: String(model.name || id),
                kind: rawKind || (group === 'llm' ? 'mt' : ''),
                group,
                source: model.source
                    || (isSakuraMtModelId(id) ? 'sakura' : (managedEntry ? 'managed' : 'engine')),
                installed: !!model.installed,
                incomplete: !!model.incomplete,
                shipped: !!model.shipped || !!model.bundled,
                recommended: model.recommended === true,
                sizeHint: String(sizeHint || ''),
                note: String(model.note || ''),
                familyLabel: String(model.familyLabel || managedEntry?.familyLabel || ''),
                paramBillion: Number(model.paramBillion ?? managedEntry?.paramBillion) || 0,
                proScale: model.proScale === true
                    || !!(managedEntry && getManagedLlmCatalogApi()?.isProScaleModel?.(managedEntry)),
                freePipelineTranslate: model.freePipelineTranslate === true
                    || !!managedEntry?.freePipelineTranslate,
                translateOnly: model.translateOnly === true
                    || !!managedEntry?.translateOnly
                    || isSakuraMtModelId(id),
            };
        }).filter((m) => m.id && m.id !== ENGINE_DEMUCS_MODEL_ID);
    }

    /**
     * Merge Pro-gated managed LLM catalog into the models pick list (LLM推理翻译).
     * Free users see whitelist ≤7B + Sakura; Pro sees full catalog.
     */
    function buildManagedLlmPickItems(statusCatalog = null) {
        const catalogApi = getManagedLlmCatalogApi();
        let rows = Array.isArray(statusCatalog) ? statusCatalog.slice() : null;
        if (!rows?.length && catalogApi?.listCatalogVisible) {
            rows = catalogApi.listCatalogVisible({ entitled: advancedEntitled });
        }
        if (!rows?.length) return [];
        return rows.map((entry) => {
            const id = String(entry.id || '').trim();
            if (!id) return null;
            return {
                id,
                name: String(entry.name || id),
                kind: 'mt',
                group: 'llm',
                source: isSakuraMtModelId(id) ? 'sakura' : 'managed',
                installed: !!entry.installed,
                incomplete: false,
                recommended: !!entry.recommended,
                sizeHint: String(entry.sizeHint || ''),
                note: String(entry.note || ''),
                familyLabel: String(entry.familyLabel || entry.family || ''),
                paramBillion: Number(entry.paramBillion) || 0,
                proScale: !!entry.proScale
                    || !!(catalogApi?.isProScaleModel?.(entry)),
                freePipelineTranslate: !!entry.freePipelineTranslate,
                translateOnly: !!entry.translateOnly || isSakuraMtModelId(id),
            };
        }).filter(Boolean);
    }

    function mergeManagedLlmIntoPickCatalog(engineItems, managedItems) {
        const byId = new Map();
        for (const item of (Array.isArray(engineItems) ? engineItems : [])) {
            if (!item?.id) continue;
            byId.set(item.id, { ...item });
        }
        for (const item of (Array.isArray(managedItems) ? managedItems : [])) {
            if (!item?.id) continue;
            const existing = byId.get(item.id);
            if (existing) {
                byId.set(item.id, {
                    ...existing,
                    group: 'llm',
                    source: existing.source === 'engine' ? item.source : (existing.source || item.source),
                    installed: !!(existing.installed || item.installed),
                    name: existing.name || item.name,
                    note: existing.note || item.note,
                    sizeHint: existing.sizeHint || item.sizeHint,
                    familyLabel: item.familyLabel || existing.familyLabel || '',
                    paramBillion: item.paramBillion || existing.paramBillion || 0,
                    proScale: !!(item.proScale || existing.proScale),
                    freePipelineTranslate: !!(item.freePipelineTranslate || existing.freePipelineTranslate),
                    translateOnly: !!(item.translateOnly || existing.translateOnly),
                    recommended: !!(existing.recommended || item.recommended),
                });
            } else {
                byId.set(item.id, { ...item, group: 'llm' });
            }
        }
        return [...byId.values()];
    }

    function buildDemucsPickItem(probe = cachedDemucsProbe) {
        const status = String(probe?.status || '').trim();
        const hint = String(probe?.hint || '').trim();
        const ver = probe?.version ? `v${probe.version}` : '';
        const installed = status === 'ready';
        const incomplete = status === 'need_torch_cuda';
        let note = '开启「常规 → 影视音频增强」前请先下载。pip 安装 Demucs；有 GPU 时会补齐 CUDA PyTorch。';
        if (hint || ver) note = [hint || status, ver].filter(Boolean).join(' · ');
        else if (incomplete) note = '已装 Demucs，建议补齐 CUDA PyTorch';
        return {
            id: ENGINE_DEMUCS_MODEL_ID,
            name: 'Demucs（人声分离）',
            kind: 'demucs',
            group: 'separate',
            installed,
            incomplete,
            selected: false,
            recommended: false,
            sizeHint: 'pip 包',
            note,
        };
    }

    function mergeDemucsPickItem(items) {
        const list = Array.isArray(items) ? items.slice() : [];
        list.push(buildDemucsPickItem());
        return list;
    }

    function engineModelGroupLabel(group) {
        if (group === 'asr') return 'ASR语音识别';
        if (group === 'mt') return 'MT机器翻译';
        if (group === 'llm') return 'LLM推理翻译';
        if (group === 'vad') return 'VAD语音活动检测';
        if (group === 'separate') return '人声分离';
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
            listEl.innerHTML = '<div class="engine-model-empty">暂无模型目录。请先在「运行环境」检测引擎后点「刷新状态」。</div>';
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
                        ${(item.source === 'managed' || item.source === 'sakura' || isManagedLlmDownloadId(item.id, item.source))
                            ? `<button type="button" class="btn" data-model-action="manual" data-model-id="${esc(item.id)}" ${engineModelsBusy ? 'disabled' : ''} title="浏览器下载 GGUF 后放到指定目录">手动下载</button>`
                            : ''}
                    </div>
                </article>`;
        }).join('');
        syncEngineModelPickSummary();
    }

    function resolveExpectedOpusMtModelIds() {
        const task = readTaskFromForm();
        if (task !== 'translate' && task !== 'dual') return [];
        const mode = readTranslateModeFromForm();
        if (mode === 'smart' || mode === 'llm' || mode === 'sakura') return [];
        // Per-item sense may adopt Sakura even when the form MT mode is still Opus.
        try {
            const selected = (state.items || []).filter((i) => i?.selected !== false);
            const anySakura = selected.some((item) => {
                if (!item?.sense?.adopted) return false;
                const mt = String(item.sense.overrides?.engineMtModel || '');
                return /^sakura-/i.test(mt) || isSakuraMtModelId(mt);
            });
            if (anySakura) return [];
        } catch { /* ignore */ }
        const explicit = readOpusMtModelFromForm();
        if (explicit) {
            if (/^sakura-/i.test(explicit) || isSakuraMtModelId(explicit)) return [];
            return [explicit];
        }
        // Auto MT: resolve from language (and per-item sense overrides when available).
        const profileApi = global.TransubContentProfile;
        const map = profileApi?.OPUS_MT_BY_LANG || {
            ja: 'opus-mt-ja-zh',
            en: 'opus-mt-en-zh',
            ko: 'opus-mt-ko-zh',
            de: 'opus-mt-de-zh',
            es: 'opus-mt-es-zh',
            fi: 'opus-mt-fi-zh',
            sv: 'opus-mt-sv-zh',
        };
        const normalize = typeof profileApi?.normalizeSenseLang === 'function'
            ? profileApi.normalizeSenseLang
            : (lang) => String(lang || '').trim().toLowerCase().split('-')[0];
        const ids = new Set();
        const formLang = normalize(els.languageSelect?.value || '');
        if (formLang && map[formLang]) ids.add(map[formLang]);
        try {
            const selected = (state.items || []).filter((i) => i?.selected !== false);
            for (const item of selected) {
                const ov = item?.sense?.adopted ? (item.sense.overrides || {}) : {};
                const mt = String(ov.engineMtModel || '');
                if (/^sakura-/i.test(mt) || isSakuraMtModelId(mt)) continue;
                // Sense preferred 推理翻译 — do not require Opus for that item.
                if (mt && !mt.startsWith('opus-mt-') && (
                    isSakuraMtModelId(mt)
                    || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(mt)
                    || /^(qwen|llama|mistral|gemma|chatglm|yi-|deepseek|phi)/i.test(mt)
                )) {
                    continue;
                }
                if (mt.startsWith('opus-mt-')) {
                    ids.add(mt);
                    continue;
                }
                const lang = normalize(ov.language || item?.sense?.classification?.language || formLang);
                if (lang && map[lang]) ids.add(map[lang]);
            }
        } catch { /* ignore */ }
        // Language still auto / unknown: require *at least one* common Opus model,
        // but do not expand to all three IDs (that made「检测引擎」look like three must-haves).
        return [...ids];
    }

    function anyCommonOpusMtInstalled() {
        const common = ['opus-mt-ja-zh', 'opus-mt-en-zh', 'opus-mt-ko-zh'];
        return common.some((id) => {
            const row = cachedEngineModels.find((m) => m.id === id);
            return row && row.installed;
        });
    }

    function warnIfSelectedEngineModelsMissing() {
        if (!cachedEngineModels.length) return '';
        const missing = [];
        const asrId = els.engineAsrModelSelect?.value || '';
        if (asrId) {
            const asr = cachedEngineModels.find((m) => m.id === asrId);
            if (asr && !asr.installed) missing.push(asr.incomplete ? `${asrId}（不完整）` : asrId);
        }
        const expectedMt = resolveExpectedOpusMtModelIds();
        if (expectedMt.length) {
            for (const mtId of expectedMt) {
                const mt = cachedEngineModels.find((m) => m.id === mtId);
                if (mt && !mt.installed) missing.push(mt.incomplete ? `${mtId}（不完整）` : mtId);
                else if (!mt) missing.push(mtId);
            }
        } else {
            // Auto language + auto MT: only warn when *none* of the common Opus models are ready.
            const task = readTaskFromForm();
            const mode = readTranslateModeFromForm();
            const needsOpus = (task === 'translate' || task === 'dual')
                && mode !== 'smart' && mode !== 'llm' && mode !== 'sakura'
                && !isSakuraMtModelId(readOpusMtModelFromForm());
            if (needsOpus && !anyCommonOpusMtInstalled()) {
                missing.push('Opus-MT（日/英/韩→中至少其一）');
            }
        }
        const asrNeedsFsmn = !asrId || !String(asrId).includes('whisper');
        if (asrNeedsFsmn) {
            const vad = cachedEngineModels.find((m) => m.id === 'fsmn-vad');
            if (vad && !vad.installed) missing.push(vad.incomplete ? 'fsmn-vad（不完整）' : 'fsmn-vad');
        }
        return missing.length ? `未安装：${missing.join('、')}，请先下载模型` : '';
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
            const st = String(demucs?.status || '').trim();
            demucsReady = demucs?.ok === true && st === 'ready';
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
            openAppSettings('models');
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
            openAppSettings('models');
        }
    }

    async function refreshEngineModels({ silent = false } = {}) {
        if (!electron?.transubEngineListModels && !electron?.transubEngineDownloadInfo) {
            renderEngineModelsList([]);
            if (!silent) setEngineStatusText('当前环境不支持引擎模型列表', 'warn');
            return { ok: false, error: 'unsupported' };
        }
        if (els.engineModelsSummary) els.engineModelsSummary.textContent = '刷新中…';
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
                emptyLabel: '自动（按源语言 · Opus）',
                modelFilter: (m) => !isLlmInferencePickModelId(m.id),
            });
            fillEngineModelSelect(els.engineLlmMtModelSelect, cachedEngineModels, 'mt', prevLlm, {
                allowEmpty: false,
                modelFilter: (m) => isLlmInferencePickModelId(m.id),
            });
            fillEngineModelSelect(els.engineVadModelSelect, cachedEngineModels, 'vad', prevVad);
            // Probe Demucs before painting the pick catalog so the 人声分离 card has status.
            try {
                const demucsRes = await electron.transubEngineAudioSeparateStatus?.(payload);
                if (demucsRes?.ok) cachedDemucsProbe = demucsRes;
            } catch { /* keep previous probe */ }
            renderEngineModelsList(catalog.length ? catalog : cachedEngineModels, managedCatalogRows);
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

    async function refreshEngineGpuStatus({ silent = true } = {}) {
        if (!electron?.transubEngineGpuStatus) return null;
        try {
            const res = await electron.transubEngineGpuStatus(engineFormPayload());
            if (res?.ok) {
                applyGpuRuntimeProbe(res);
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
                const msg = res.message || 'Demucs 安装完成';
                setEngineDownloadProgressPct(100);
                setEngineDownloadProgressVisible(true, msg);
                appendEngineDownloadLog(msg);
                if (!silent) {
                    appendLog(msg, 'ok');
                    setEngineStatusText(msg, 'ok');
                }
                await refreshEngineDemucsStatus({ silent: true });
                return res;
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
        if (!res?.ok) {
            const lines = [
                '检测未通过。',
                '',
                String(res?.error || '引擎未就绪').trim(),
            ];
            if (res?.baseUrl) lines.push(`地址：${res.baseUrl}`);
            const path = String(els.engineInstallPathInput?.value || '').trim();
            if (path) lines.push(`目录：${path}`);
            return lines.filter(Boolean).join('\n');
        }
        const ver = String(res.version || res.health?.engineVersion || '').trim();
        const stub = res.health?.stub ? '（stub）' : '';
        const lines = [
            '引擎已就绪。',
            '',
            ver ? `版本：${ver}${stub}` : null,
            res.baseUrl ? `地址：${res.baseUrl}` : null,
            res.spawned ? '服务：本次已自动启动' : '服务：已在运行',
        ];
        const gpu = String(els.engineGpuStatus?.textContent || '').trim();
        if (gpu) lines.push(`GPU：${gpu}`);
        const models = Array.isArray(cachedEngineModels) ? cachedEngineModels : [];
        if (models.length) {
            const installed = models.filter((m) => m?.installed).length;
            lines.push(`模型目录：共 ${models.length} 个` + (installed ? `，已安装 ${installed} 个` : ''));
        }
        const demucs = cachedDemucsProbe;
        if (demucs && (demucs.status || demucs.hint || demucs.ok != null)) {
            const status = String(demucs.status || '').trim();
            const demucsHint = String(demucs.hint || demucs.message || '').trim();
            const ready = status === 'ready';
            lines.push(
                demucsHint
                    ? `人声分离：${demucsHint}`
                    : (ready ? '人声分离：Demucs 可用' : '人声分离：Demucs 未安装'),
            );
        }
        const path = String(els.engineInstallPathInput?.value || '').trim();
        if (path) lines.push(`目录：${path}`);
        return lines.filter((line) => line != null).join('\n');
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

    function isManagedLlmDownloadId(modelId, source = '') {
        const id = String(modelId || '').trim();
        if (!id || id === ENGINE_DEMUCS_MODEL_ID) return false;
        if (source === 'managed') return true;
        if (isSakuraMtModelId(id)) return false; // Sakura still goes through engine download path
        return !!findManagedLlmCatalogEntry(id);
    }

    function classifyManualKindsForModelIds(modelIds) {
        const ids = (Array.isArray(modelIds) ? modelIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        const kinds = [];
        const hubIds = [];
        for (const id of ids) {
            if (id === ENGINE_DEMUCS_MODEL_ID || /^demucs$/i.test(id)) {
                kinds.push('demucs');
                continue;
            }
            if (/sensevoice/i.test(id)) {
                kinds.push('sensevoice');
                hubIds.push(id);
                continue;
            }
            if (/^whisper/i.test(id)) {
                kinds.push('whisper');
                hubIds.push(id);
                continue;
            }
            hubIds.push(id);
        }
        return {
            kinds: [...new Set(kinds)],
            hubIds: [...new Set(hubIds)],
        };
    }

    function buildManualGgufHint(info = {}) {
        const name = String(info.name || info.modelId || '模型').trim();
        const fileName = String(info.fileName || '').trim();
        const folder = String(info.folder || '').trim();
        const sizeHint = String(info.sizeHint || '').trim();
        const sizeLine = sizeHint ? `\n体积约 ${sizeHint}。` : '';
        return (
            `将在浏览器打开「${name}」的 GGUF 下载链接。${sizeLine}\n\n`
            + `下载完成后，请将文件保存为：\n${fileName || '（见模型卡片）'}\n\n`
            + `并放到以下目录（文件名需完全一致）：\n${folder || '（软件目录）/advanced-llm/models'}`
        );
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
                const { kinds } = classifyManualKindsForModelIds(modelIds);
                const manualKinds = kinds.length ? kinds : ['sensevoice', 'whisper'];
                const proceed = await appConfirm({
                    title: '模型下载失败',
                    message: `${String(err).slice(0, 500)}\n\n是否改为手动下载安装（运行库 .whl / 模型镜像）？`,
                    primaryLabel: '手动下载安装',
                    secondaryLabel: '取消',
                });
                if (proceed) {
                    await manualEngineDownloadInstall({
                        modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                        kinds: manualKinds,
                    });
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
            const proceed = await appConfirm({
                title: '模型下载失败',
                message: `${String(msg).slice(0, 500)}\n\n是否改为手动下载安装？`,
                primaryLabel: '手动下载安装',
                secondaryLabel: '取消',
            });
            if (proceed) {
                await manualEngineDownloadInstall({
                    modelIds: [...modelIds, ...(wantDemucs ? [ENGINE_DEMUCS_MODEL_ID] : [])],
                });
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
        item.selected = true;
        state.items.forEach((it, i) => {
            if (i !== idx) it.selected = false;
        });
        renderList();
        updateStartButton();
        appendLog(`已选中「${basename(item.path)}」，可点击开始重新处理`, 'info');
    }

    function buildListRowHtml(item, idx) {
        const revealPath = showPathForItem(item);
        const subPath = getSubtitlePathForItem(item);
        const folderTitle = subPath
            ? `在文件夹中显示字幕：${basename(subPath)}`
            : `在文件夹中显示：${basename(item.path)}`;
        const detail = item.detail || item.error || '';
        const meta = statusMeta(item.status);
        const subBadge = item.existingSubtitle && item.status === 'ready'
            ? '<span class="ml-1 text-amber-600" title="已有字幕">●</span>' : '';
        let profileBadgeHtml = '';
        const sense = item.sense;
        const autoOn = isAutoSenseEnabled();
        if (sense?.status === 'sensing') {
            profileBadgeHtml = '<span class="file-sense-status" title="正在感知…" aria-label="正在感知"><span class="file-sense-icon is-sensing"><i class="fa fa-magic" aria-hidden="true"></i></span><span class="file-sense-label">感知中...</span></span>';
        } else if (sense?.status === 'done' || sense?.status === 'error') {
            const profileApi = global.TransubContentProfile;
            const hit = sense.classification;
            const badge = hit ? (profileApi?.profileBadge?.(hit.profile) || hit.label || '') : '';
            const method = profileApi?.describeAudioMethod?.(sense.overrides || {}) || null;
            const confPct = hit?.confidence ? Math.round(hit.confidence * 100) : 0;
            const lang = sense.overrides?.language || sense.languagePrior?.language || '';
            const acousticHint = item.senseAcoustic?.hint && item.senseAcoustic.hint !== 'neutral'
                ? item.senseAcoustic.hint
                : '';
            const acousticLabel = acousticHint === 'music' ? '配乐'
                : acousticHint === 'soft' ? '软声'
                    : acousticHint === 'noisy' ? '底噪' : '';
            const hasSenseOverrides = !!(sense.overrides && Object.keys(sense.overrides).length);
            const canToggleAdopt = sense.status === 'done'
                && !state.running
                && (sense.adopted || hasSenseOverrides);
            const translateMode = readTranslateModeFromForm();
            const senseMtLabel = profileApi?.describeSenseMtForUi?.(sense.overrides || {}, {
                task: readTaskFromForm(),
                translateMode,
                smartTranslate: translateMode === 'smart',
            }) || (
                translateMode === 'smart' && readTaskFromForm() !== 'transcribe'
                    ? '智能翻译'
                    : (sense.overrides?.engineMtModel || '')
            );
            const tipParts = [
                sense.adopted ? '将使用感知参数' : (autoOn ? '感知未采纳' : '感知已关'),
                hit?.label || badge || '未识别',
                confPct ? `${confPct}%` : '',
                lang && lang !== 'auto' ? `语种 ${lang}` : '',
                method?.short && sense.adopted ? method.short : '',
                sense.overrides?.engineAsrModel || '',
                senseMtLabel,
                acousticLabel ? `声学·${acousticLabel}` : '',
                ...(hit?.reasons || []).slice(0, 2),
                canToggleAdopt
                    ? (sense.adopted ? '点击改为不采纳' : '点击采纳')
                    : '',
            ].filter(Boolean);
            const tip = tipParts.join(' · ') || sense.message || '';
            const rejectedCls = !sense.adopted ? ' is-rejected' : '';
            const suggestCls = !sense.adopted && sense.action === 'suggest' ? ' is-suggest' : '';
            const adoptedCls = sense.adopted ? ' is-adopted' : '';
            const profileCls = hit?.profile && hit.profile !== 'unknown'
                ? ` profile-${esc(hit.profile)}`
                : '';
            const aria = sense.adopted
                ? `已采纳感知参数：${badge || hit?.label || '已采纳'}（点击不采纳）`
                : (canToggleAdopt
                    ? `未采纳：${badge || hit?.label || '感知结果'}（点击采纳）`
                    : (badge || hit?.label || '感知结果'));
            const toggleAttrs = canToggleAdopt
                ? ` type="button" data-sense-toggle="${idx}"`
                : ' type="button" disabled';
            profileBadgeHtml = `<button${toggleAttrs} class="file-sense-icon${profileCls}${adoptedCls}${rejectedCls}${suggestCls}" title="${esc(tip)}" aria-label="${esc(aria)}"><i class="fa fa-magic" aria-hidden="true"></i></button>`;
        } else if (!autoOn && sense?.status === 'off') {
            profileBadgeHtml = '';
        }

        let resenseIconHtml = '';
        if (!state.running && sense && (sense.status === 'done' || sense.status === 'error' || sense.status === 'sensing')) {
            resenseIconHtml = `<button type="button" data-sense-resense="${idx}" class="file-sense-icon is-resense" title="深入感知：短窗语种、声学分析并刷新匹配" aria-label="深度感知"${sense.status === 'sensing' ? ' disabled' : ''}><i class="fa fa-search-plus" aria-hidden="true"></i></button>`;
        }
        let qcStatusHtml = '<span class="text-gray-300">—</span>';
        if (item.qcError) {
            qcStatusHtml = `<span class="text-amber-600 text-xs" title="${esc(item.qcError)}">?</span>`;
        } else if (Number.isFinite(Number(item.qcIssueCount))) {
            const n = Number(item.qcIssueCount);
            const fixedHint = item.qcFixedMode
                ? (item.qcFixedMode === 'smart' ? ' · 已智能修复' : ' · 已一键修复')
                : '';
            const tip = esc((item.qcSummary || (n ? `${n} 项问题` : '通过')) + fixedHint);
            qcStatusHtml = n > 0
                ? `<button type="button" data-qc-open="${idx}" class="inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 hover:bg-amber-200" title="${tip}（点击编辑）">${n}</button>`
                : `<span class="text-emerald-600 text-xs" title="${tip}">✓</span>`;
        }
        const qcFixedHtml = qcFixedTagHtml(item);
        const qcCell = qcFixedHtml
            ? `<span class="qc-cell">${qcStatusHtml}${qcFixedHtml}</span>`
            : qcStatusHtml;
        const editBtn = subPath
            ? `<button type="button" data-edit-sub="${esc(subPath)}" data-edit-video="${esc(item.path)}" class="row-action-btn text-violet-500 hover:text-violet-700 hover:bg-violet-50" title="编辑字幕"><i class="fa fa-pencil text-xs"></i></button>` : '';
        const canQcFix = !state.running && !state.qcFixing
            && Number(item.qcIssueCount) > 0
            && getPostBatchPathsForItem(item).length > 0;
        const qcFixBtn = canQcFix
            ? `<button type="button" data-qc-fix="${idx}" class="row-action-btn text-amber-600 hover:text-amber-800 hover:bg-amber-50" title="一键修复QC" aria-label="一键修复QC"><i class="fa fa-wrench text-xs"></i></button>`
            : '';
        const qcSmartFixBtn = canQcFix && advancedEntitled && electron?.transubAdvancedQcSmartFix
            ? `<button type="button" data-qc-smart-fix="${idx}" class="row-action-btn text-violet-600 hover:text-violet-800 hover:bg-violet-50" title="智能修复QC (Pro)" aria-label="智能修复QC"><i class="fa fa-magic text-xs"></i></button>`
            : '';
        const retryBtn = (item.status === 'failed' || item.status === 'error') && !state.running
            ? `<button type="button" data-retry-idx="${idx}" class="row-action-btn text-amber-600 hover:text-amber-800 hover:bg-amber-50" title="重试本条" aria-label="重试本条"><i class="fa fa-repeat text-xs"></i></button>`
            : '';
        const isFailed = item.status === 'failed' || item.status === 'error';
        const errText = item.error || (isFailed ? detail : '');
        const errExpanded = expandedErrorRows.has(idx);
        let detailHtml = '';
        if (isFailed && errText) {
            const short = errText.length > 72 && !errExpanded ? `${errText.slice(0, 72)}…` : errText;
            const toggle = errText.length > 72
                ? `<button type="button" class="row-error-toggle" data-error-toggle="${idx}">${errExpanded ? '收起' : '展开'}</button>`
                : '';
            detailHtml = `<div class="row-error-expand">${esc(short)}${toggle}</div>`;
        } else if (detail) {
            detailHtml = `<div class="cell-ellipsis text-[10px] text-gray-400 mt-0.5" title="${esc(detail)}">${esc(detail)}</div>`;
        }
        const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
        const elapsed = formatElapsedCell(item);
        const processed = formatProcessedCell(item);
        let progressCell = `<span class="text-gray-400 text-xs">—</span>`;
        if (item.status === 'running') {
            progressCell = `
                <div class="space-y-0.5" title="已用 ${esc(elapsed)} · ${esc(processed)}">
                    <div class="row-mini-progress"><span style="width:${pct}%"></span></div>
                    <div class="text-[10px] text-gray-500 tabular-nums">${pct}%</div>
                </div>`;
        } else if (item.status === 'done' || item.status === 'skipped') {
            progressCell = `<span class="text-xs text-gray-500 tabular-nums" title="已用 ${esc(elapsed)}">${esc(processed)}</span>`;
        } else if (item.status === 'failed') {
            progressCell = `<span class="text-xs text-gray-400 tabular-nums" title="已用 ${esc(elapsed)}">${pct ? `${pct}%` : '—'}</span>`;
        }
        const canOpenByName = !!subPath
            && (item.status === 'done' || item.status === 'skipped');
        const nameTitle = canOpenByName
            ? `打开字幕编辑器：${basename(item.path)}`
            : item.path;
        const nameHtml = canOpenByName
            ? `<button type="button" class="cell-ellipsis file-name-link" data-open-editor="${idx}" title="${esc(nameTitle)}">${esc(basename(item.path))}</button>`
            : `<span class="cell-ellipsis font-medium text-gray-800">${esc(basename(item.path))}</span>`;
        return `
            <tr class="task-row hover:bg-gray-50/80" data-idx="${idx}" data-status="${esc(item.status)}" data-path="${esc(normPath(item.path))}">
                <td class="px-2 py-1.5"><input type="checkbox" data-row-check ${item.selected ? 'checked' : ''} ${state.running ? 'disabled' : ''}></td>
                <td class="px-2 py-1.5 text-xs col-file"><div class="file-cell-main" title="${esc(item.path)}">${nameHtml}${subBadge}${profileBadgeHtml}${resenseIconHtml}</div></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-500 col-duration">${item.duration ? formatDuration(item.duration) : '—'}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-500 col-elapsed"${elapsed !== '—' ? ` title="已用 ${esc(elapsed)}"` : ''}>${esc(elapsed)}</td>
                <td class="px-2 py-1.5 col-progress">${progressCell}</td>
                <td class="px-2 py-1.5 text-xs col-status">
                    <span class="row-status-badge ${meta.cls}">${esc(meta.label)}</span>
                    ${detailHtml}
                </td>
                <td class="px-1 py-1.5 text-center text-xs col-qc">${qcCell}</td>
                <td class="px-1 py-1.5 text-center col-actions">
                    <div class="row-actions">
                    ${retryBtn}
                    ${qcFixBtn}
                    ${qcSmartFixBtn}
                    ${editBtn}
                    <button type="button" data-show-folder="${esc(revealPath)}" data-idx="${idx}"
                        class="row-action-btn text-gray-400 hover:text-primary hover:bg-gray-100 disabled:opacity-30"
                        title="${esc(folderTitle)}" ${revealPath ? '' : 'disabled'}>
                        <i class="fa fa-folder-open text-xs"></i>
                    </button>
                    </div>
                </td>
            </tr>`;
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
    }

    function getSelectedItems() {
        return state.items.filter((i) => i.selected && i.status !== 'error');
    }

    function pathDirname(filePath) {
        const p = String(filePath || '');
        const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
        return i >= 0 ? p.slice(0, i) : '';
    }

    function pathJoin(dir, name) {
        const d = String(dir || '');
        const n = String(name || '');
        if (!d) return n;
        const sep = d.includes('/') && !d.includes('\\') ? '/' : '\\';
        return d.endsWith('/') || d.endsWith('\\') ? `${d}${n}` : `${d}${sep}${n}`;
    }

    function stemNoExt(filePath) {
        const base = basename(filePath);
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
    }

    function primarySubFormatFromForm() {
        const parts = String(readSubFormatsFromForm() || 'srt')
            .split(/[,;\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter((s) => ['srt', 'vtt', 'lrc', 'ass'].includes(s));
        return parts[0] || 'srt';
    }

    function resolveRetranslateDestPath(item, sourcePath) {
        const tgt = String(item?.targetSubtitlePath || '').trim();
        if (tgt) return tgt;
        const sub = String(item?.subtitlePath || item?.existingSubtitle || '').trim();
        const src = String(sourcePath || '').trim();
        if (sub && normPath(sub) !== normPath(src)) return sub;
        const video = String(item?.path || '').trim();
        const outDir = resolveOutputDirFromForm() || pathDirname(video) || pathDirname(src);
        const stem = stemNoExt(video) || stemNoExt(src) || 'subtitle';
        const fmt = primarySubFormatFromForm();
        return pathJoin(outDir, `${stem}.${fmt}`);
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
        if (!item?.id) return false;
        if (item.translateOnly) return false;
        const catalogApi = getManagedLlmCatalogApi();
        if (catalogApi?.isTranslateOnlyModel?.(item.id) || catalogApi?.isTranslateOnlyModel?.(item)) {
            return false;
        }
        if (catalogApi?.supportsAdvancedReconstruct) {
            return !!catalogApi.supportsAdvancedReconstruct(item.id);
        }
        return String(item.family || '').toLowerCase() !== 'sakura';
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

    function fillRetranslateSmartModelSelect(pick) {
        const selectEl = els.retranslateModelSelect;
        if (!selectEl) return;
        const catalog = (Array.isArray(pick?.catalog) ? pick.catalog : [])
            .filter((item) => item?.installed && isSmartTranslateCapableModel(item));
        catalog.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh'));
        const want = String(pick?.smartTranslateModelId || '').trim();
        const opts = [];
        if (!catalog.length) {
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
                const sel = id === want ? ' selected' : '';
                opts.push(`<option value="${esc(id)}"${sel}>${esc(label)}</option>`);
            }
            if (want && !catalog.some((m) => String(m.id) === want)) {
                opts.push(`<option value="${esc(want)}" selected>${esc(want)}（未下载或不可用于智能翻译）</option>`);
            }
        }
        selectEl.innerHTML = opts.join('');
        if (want && [...selectEl.options].some((o) => o.value === want)) {
            selectEl.value = want;
        } else if (catalog[0]?.id) {
            selectEl.value = catalog[0].id;
        } else {
            selectEl.value = '';
        }
    }

    function syncRetranslateModalModelUi() {
        const mode = readRetranslateModeFromModal();
        const smartLocked = !advancedEntitled;
        if (els.retranslateModeSmartWrap) {
            els.retranslateModeSmartWrap.classList.toggle('is-disabled', smartLocked);
            if (els.retranslateModeSmart) els.retranslateModeSmart.disabled = smartLocked;
        }
        if (mode === 'smart') {
            if (smartLocked) {
                els.retranslateModelWrap?.classList.add('hidden');
                if (els.retranslateModelHint) {
                    els.retranslateModelHint.textContent = '智能翻译为 Pro 专属，请先激活 Pro。';
                }
                return;
            }
            els.retranslateModelWrap?.classList.remove('hidden');
            if (els.retranslateModelLabel) els.retranslateModelLabel.textContent = '智能翻译模型';
            if (els.retranslateModelHint) {
                els.retranslateModelHint.textContent = '仅列出已下载且可用于智能翻译的通用对话模型（不含 Sakura 等仅译中模型）。';
            }
            void ensureSmartTranslatePickCache().then((pick) => {
                if (readRetranslateModeFromModal() !== 'smart') return;
                fillRetranslateSmartModelSelect(pick);
            });
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
            void ensureSmartTranslatePickCache().then((pick) => fillRetranslateSmartModelSelect(pick));
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
        cachedSmartTranslatePick = null;
        syncRetranslateModalModelUi();
        els.retranslateModal?.classList.remove('hidden');
        els.retranslateModal?.classList.add('flex');
        try { document.body.appendChild(els.retranslateModal); } catch { /* ignore */ }
        setTimeout(() => {
            try { els.retranslateConfirmBtn?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
        }, 80);
    }

    async function runRetranslateFromModal() {
        const plan = Array.isArray(state.retranslatePlan) ? state.retranslatePlan.slice() : [];
        if (!plan.length) {
            showToast('没有可翻译的条目', 'warn');
            return;
        }
        const mode = readRetranslateModeFromModal();
        if (mode === 'smart' && !advancedEntitled) {
            showToast('智能翻译为 Pro 专属', 'warn');
            return;
        }
        const modelId = String(els.retranslateModelSelect?.value || '').trim();
        if (mode === 'llm' && !modelId) {
            showToast('请选择推理翻译模型', 'warn');
            return;
        }
        if (mode === 'smart') {
            if (!modelId) {
                showToast('请选择已下载的智能翻译模型（设置 → Pro → 大模型）', 'warn');
                return;
            }
            const catalogApi = getManagedLlmCatalogApi();
            const block = catalogApi?.getSmartTranslateModelBlock?.(modelId);
            if (block?.ok === false) {
                showToast(block.error || '所选模型不可用于智能翻译', 'warn');
                return;
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
        appendRetranslateLog(
            `开始重新翻译 ${plan.length} 项（${modeLabel}${modelId ? ` · ${modelId}` : ''}）…`,
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
            const total = Math.max(1, plan.length);
            const idx = Math.max(0, Math.min(total - 1, Number(index) || 0));
            const within = Math.max(0, Math.min(1, (Number(itemPct) || 0) / 100));
            // Cap mid-item at 99% so the bar keeps moving until the batch finishes.
            const overall = clampPct(((idx + within) / total) * 100);
            const displayOverall = overall >= 100 && idx < total - 1 ? 99 : Math.min(99, overall);
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
                        modelId,
                        smartTranslateModelId: modelId,
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
            appendLog('影片理解重构为 Pro 功能，请先在设置 → Pro 解锁', 'warn');
            showToast('理解重构为 Pro 专属', 'warn');
            openAppSettings('pro');
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
        const res = await electron?.selectFolder?.({ title: '选择包含媒体文件的文件夹' });
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
        if (state.running || state.retranslateBusy) return;
        const removed = state.items.filter((i) => i.selected);
        if (!removed.length) return;
        const snapshot = removed.map((i) => ({ ...i, sense: i.sense ? { ...i.sense } : undefined }));
        state.items = state.items.filter((i) => !i.selected);
        renderList();
        updateStartButton();
        ux()?.pushUndo?.(`已移除 ${removed.length} 项`, () => {
            state.items.push(...snapshot);
            renderList();
            updateStartButton();
        });
    }

    function clearList() {
        if (state.running || state.retranslateBusy) return;
        if (!state.items.length) return;
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
        if (p.phase !== 'running') return;
        if (p.itemDualPhase && p.itemDualPhase !== state.itemDualPhase) {
            state.itemDualPhase = p.itemDualPhase;
            state.itemStage = p.itemStage || 'starting';
        }
        const stage = p.itemStage || 'transcribe';
        if (stageRank(stage) >= stageRank(state.itemStage)) {
            state.itemStage = stage;
        }
        // VAD / 加载模型等转写前阶段：引擎若已给出整体进度则采用；否则保持 0（TWAI 兼容）
        if (isPreTranscribeStage(state.itemStage)) {
            if (p.itemDualPhase && Number.isFinite(Number(p.itemProgress))) {
                state.videoProgress = bumpProgress(state.videoProgress, Number(p.itemProgress));
                return;
            }
            if (Number.isFinite(Number(p.itemProgress)) && Number(p.itemProgress) > 0) {
                state.videoProgress = bumpProgress(state.videoProgress, Number(p.itemProgress));
                if (Number(p.videoTotalSec) > 0) {
                    state.videoTotalSec = Number(p.videoTotalSec);
                    state.videoCurrentSec = Number(p.videoCurrentSec) || 0;
                }
                return;
            }
            state.videoProgress = 0;
            return;
        }
        const mapped = Number.isFinite(Number(p.itemProgress))
            ? Number(p.itemProgress)
            : mapStageProgress(
                stage,
                Number(p.itemProgress) || 0,
                Number(p.videoCurrentSec) || 0,
                Number(p.videoTotalSec) || 0,
            );
        state.videoProgress = bumpProgress(state.videoProgress, mapped);
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
            appendLog(
                p.bilingualSubtitlePath && !p.sourceSubtitlePath && !p.targetSubtitlePath
                    ? `完成：${name} → ${basename(p.subtitlePath)}（已合并并清理原轨）`
                    : p.sourceSubtitlePath && p.targetSubtitlePath
                        ? `完成：${name} → ${basename(p.targetSubtitlePath)}（原文 ${basename(p.sourceSubtitlePath)}${p.bilingualSubtitlePath ? ` · 合并 ${basename(p.bilingualSubtitlePath)}` : ''}）`
                        : `完成：${name}${p.subtitlePath ? ` → ${basename(p.subtitlePath)}` : ''}`,
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
            appendLog('QC 智能修复为 Pro 功能，请先在设置 → Pro 解锁', 'warn');
            openAppSettings('pro');
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
                ? `确定对「${basename(onlyItem.path)}」做 QC 智能修复吗？\n将按素材类型调整强度，并依次：规则修复 → 智能断句 → 局部重转写（需视频；有必要时执行）→ 大模型润色；有原文对照时再做语义审阅采纳。`
                : `确定 QC 智能修复吗？\n将处理 ${targets.length} 条任务、写回 ${pathCount} 个字幕（内容画像 + 规则/断句/必要时局部重转写/润色；双语任务含语义审阅）。`;
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
                        const res = await electron.transubAdvancedQcSmartFix({
                            path: subPath,
                            mediaPath: item.path,
                            profile,
                            ...preset,
                            // 用户已点「智能修复」：显式开启 Pro 链路（画像仅调 CPS/强度等）
                            // 局部重转写：有 connected/高 CPS 等目标时才跑；SenseVoice 空则引擎侧可回退 Whisper
                            llmSplit: true,
                            retranscribeConnected: true,
                            smartFix: true,
                            pairPath: pairPath || undefined,
                            semanticReview: !!pairPath,
                            maxRetranscribeRanges: 8,
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
                        if (res?.ok && res.written) {
                            written += 1;
                            itemWritten += 1;
                            itemOk = true;
                            const remainHint = res.cpsSplit?.remainingText
                                ? `；${res.cpsSplit.remainingText}`
                                : '';
                            lastSummary = `${res.summary || '已修复 QC'}${remainHint}`;
                            appendLog(`${basename(subPath)}：${lastSummary}`, 'ok');
                        } else if (res?.ok) {
                            itemOk = true;
                            lastSummary = res.summary || '无需写回';
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

    async function runPostBatchQcAutoFixIfEnabled() {
        // Prefer saved options so a standalone settings window stays in sync.
        let savedMode = null;
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                savedMode = normalizePostBatchQcFixMode(optsRes.options.postBatchQcFixMode);
            }
        } catch { /* ignore */ }
        const mode = savedMode || getPostBatchQcFixMode();
        if (mode === 'none') return;
        if (countQcIssues() <= 0) return;
        if (mode === 'smart') {
            if (!advancedEntitled) {
                appendLog('已设置完成后 Pro 修复 QC，但未解锁 Pro，改为规则一键修复', 'warn');
                await runPostBatchQcFix(null, { confirm: false });
                return;
            }
            await runPostBatchQcSmartFix(null, { confirm: false });
            return;
        }
        await runPostBatchQcFix(null, { confirm: false });
    }

    function normalizeChineseSubtitleVariant(raw) {
        const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
        const cv = String(raw || 'simplified');
        return allowed.has(cv) ? cv : 'simplified';
    }

    function chineseSubtitleVariantLabel(variant) {
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
        const doCps = savedOpts
            ? savedOpts.postBatchCpsSplit !== false
            : (els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true);
        const doNoise = savedOpts
            ? savedOpts.postBatchRemoveNoise !== false
            : (els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true);
        const doCompressRep = savedOpts
            ? savedOpts.postBatchCompressRepetition !== false
            : (els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true);
        const doCompactInterjections = savedOpts
            ? !!savedOpts.postBatchCompactPureInterjections
            : !!els.postBatchCompactPureInterjectionsCheck?.checked;
        const taskFromSaved = savedOpts?.task === 'transcribe' || savedOpts?.task === 'dual'
            ? savedOpts.task
            : (savedOpts?.task ? 'translate' : null);
        const taskNow = taskFromSaved || readTaskFromForm();
        const isTranslate = isTranslateLikeTask(taskNow);
        // 翻译/双语任务默认：。？！后补空格（在 CPS 拆句之前）；双语后处理只作用于译文轨
        const doSpacePunct = isTranslate;
        const doPostprocess = doCps || doNoise || doCompressRep || doSpacePunct;
        if (!doPostprocess && !doCompactInterjections) return;

        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return getPostBatchPathsForItem(item).length > 0;
        });

        els.progressLabel.textContent = '后处理中…';
        const parts = [];
        if (doSpacePunct) parts.push('句读后空格');
        if (doCps) parts.push('CPS 拆句');
        if (doNoise) parts.push('清理杂音');
        if (doCompressRep) parts.push('压缩叠词');
        if (doCompactInterjections) parts.push('精简纯语气词');
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
                els.progressLabel.textContent = `精简纯语气词… ${i + 1}/${compactTargets.length}`;
                try {
                    const res = await electron.transubCompactPureInterjections({
                        path: zhPath,
                        sourcePath: jaPath,
                        options: { backupMode: 'off' },
                    });
                    if (res?.ok && res.dropped) {
                        compactWritten += 1;
                        appendLog(`${basename(zhPath)}：${res.summary || '已精简纯语气词'}`, 'ok');
                    } else if (res?.ok && !res.skipped) {
                        appendLog(`${basename(zhPath)}：${res.summary || '无需精简纯语气词'}`, 'info');
                    } else if (res?.ok && res.skipped) {
                        appendLog(`${basename(zhPath)}：跳过精简（${res.reason || '无原文对照'}）`, 'info');
                    } else {
                        appendLog(`${basename(zhPath)}：${res?.error || '精简纯语气词失败'}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(zhPath)}：${err?.message || '精简纯语气词失败'}`, 'err');
                }
            }
            if (compactTargets.length) {
                appendLog(
                    compactWritten > 0
                        ? `精简纯语气词完成：已写回 ${compactWritten}/${compactTargets.length} 个字幕对`
                        : `精简纯语气词完成：${compactTargets.length} 个字幕对均无需写回`,
                    compactWritten > 0 ? 'ok' : 'info',
                );
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
                const summaryLines = [
                    `成功 ${payload?.generated ?? state.generated} · 跳过 ${payload?.skipped ?? state.skipped} · 失败 ${payload?.failed ?? state.failed}`,
                ];
                if (qcIssues > 0) summaryLines.push(`${qcIssues} 条字幕存在 QC 问题`);
                if (finishError) summaryLines.push(finishError);
                const summaryText = summaryLines.join('\n');
                els.progressLabel.textContent = failed > 0
                    ? (finishError || '任务结束，部分失败')
                    : (qcIssues > 0 ? '全部处理完成（仍有 QC 问题）' : '全部处理完成');
                showToast(summaryText.split('\n')[0], failed > 0 || qcIssues > 0 ? 'warn' : 'ok');
                if (ux()?.showBatchSummary) {
                    void ux().showBatchSummary({
                        title: failed > 0 ? '任务完成（有失败）' : '任务完成',
                        summaryText,
                        elapsedText: totalElapsedText,
                        primaryLabel: failed > 0 ? '重试失败项' : '',
                        secondaryLabel: '关闭',
                        onPrimary: failed > 0,
                    }).then((action) => {
                        if (action === 'primary' && failed > 0) {
                            retryAllFailedItems();
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
        const selected = getSelectedItems();
        if (!selected.length) {
            appendLog('请至少选择一个有效视频', 'warn');
            return;
        }
        const blockReason = computeStartBlockReason();
        if (blockReason) {
            appendLog(blockReason, 'warn');
            updateStartButton();
            return;
        }

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
                    const mtLabel = profileApi?.describeSenseMtForUi?.(o, {
                        task: opts.task || readTaskFromForm(),
                        translateMode: startTranslateMode,
                        smartTranslate: startTranslateMode === 'smart' || !!opts.smartTranslate,
                    }) || (
                        (startTranslateMode === 'smart' || opts.smartTranslate)
                            ? '智能翻译'
                            : o.engineMtModel
                    );
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
                        openAppSettings('models');
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
                    optionOverrides: (autoSenseOn && i.sense?.adopted && i.sense.overrides)
                        ? i.sense.overrides
                        : undefined,
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

    function listSortValue(item, key) {
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
        const va = listSortValue(a, key);
        const vb = listSortValue(b, key);
        if (typeof va === 'number' && typeof vb === 'number') {
            return va - vb;
        }
        return String(va).localeCompare(String(vb), 'zh-CN', { numeric: true, sensitivity: 'base' });
    }

    function sortTaskListBy(key) {
        if (!taskColMeta(key)?.sortable) return;
        const cur = state.listSort;
        const dir = (cur && cur.key === key && cur.dir === 'asc') ? 'desc' : 'asc';
        state.listSort = { key, dir };
        renderList();
    }

    function applyListSortInPlace() {
        const sort = state.listSort;
        if (!sort?.key || !taskColMeta(sort.key)?.sortable) return;
        if (state.items.length < 2) return;
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
        const canRemove = !state.running && !state.retranslateBusy;

        const setEnabled = (action, enabled) => {
            const btn = menu.querySelector(`[data-task-ctx="${action}"]`);
            if (btn) btn.disabled = !enabled;
        };
        setEnabled('edit', canEdit);
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
            const resenseBtn = e.target.closest('[data-sense-resense]');
            if (resenseBtn) {
                e.preventDefault();
                e.stopPropagation();
                resenseItem(state.items[Number(resenseBtn.dataset.senseResense)]);
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

    function bindJobEventListeners() {
        if (!electron || bindJobEventListeners.done) return;
        bindJobEventListeners.done = true;
        electron.onSubtitleTaskJobStart?.((payload) => onJobStart(payload));
        electron.onTransWithAiProgress?.((payload) => onProgress(payload));
        electron.onSubtitleTaskJobFinished?.((payload) => onJobFinished(payload));
        electron.onTransubComputeTaskChanged?.((payload) => {
            state.computeBusy = !!payload?.busy;
            state.computeBusyLabel = payload?.busy
                ? String(payload.label || payload.kind || '').trim()
                : '';
            updateStartButton();
        });
        void (async () => {
            try {
                const st = await electron.transubComputeTaskStatus?.();
                if (st?.busy) {
                    state.computeBusy = true;
                    state.computeBusyLabel = String(st.label || st.kind || '').trim();
                    updateStartButton();
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
            els.startBtn?.addEventListener('click', startSubtitleGeneration);
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
            els.selectAllCheck?.addEventListener('change', () => {
                const checked = els.selectAllCheck.checked;
                state.items.forEach((i) => { i.selected = checked; });
                renderList();
                updateStartButton();
            });
        }
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
        els.autoSenseToggle?.addEventListener('click', () => {
            setAutoSenseEnabled(!isAutoSenseEnabled(), { persist: true });
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
        electron?.onOpenParams?.((payload) => {
            const tab = String(payload?.tab || 'runtime').trim() || 'runtime';
            if (!isStandaloneSettings) {
                openAppSettings(tab, {
                    wizard: !!payload?.wizard,
                    forceWizard: !!payload?.forceWizard,
                });
                void electron?.transubConsumePendingOpenParams?.();
                return;
            }
            openParamsModal(tab);
            void electron?.transubConsumePendingOpenParams?.();
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
                    btn.disabled = false;
                    btn.textContent = prevLabel;
                }
            }
        });
        els.ffmpegBrowseBtn?.addEventListener('click', browseFfmpegPath);
        els.ffmpegFolderBtn?.addEventListener('click', browseFfmpegFolder);
        els.ffmpegTestBtn?.addEventListener('click', () => refreshFfmpegStatus({ quick: false }));
        els.deviceSelect?.addEventListener('change', () => {
            syncBatchSizeUi();
            syncDeviceOptionsForMode();
            syncExpertCustomHints();
            updateParamsSummary();
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
            if (els.filmAudioEnhanceCheck?.checked && els.filmVadPresetCheck) {
                els.filmVadPresetCheck.checked = false;
            }
            updateParamsSummary();
        });
        els.filmVadPresetCheck?.addEventListener('change', () => {
            if (els.filmVadPresetCheck?.checked && els.filmAudioEnhanceCheck) {
                els.filmAudioEnhanceCheck.checked = false;
            }
            updateParamsSummary();
        });
        els.smartTranslateCheck?.addEventListener('change', () => {
            syncSmartTranslateUi();
            updateModelSelectHint();
            updateParamsSummary();
        });
        els.smartTranslateFaithfulCheck?.addEventListener('change', updateParamsSummary);
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
                setSaveParamsStatus('灵敏检出：Whisper ASR + whisperseg-asmr（请确认两者已下载）', 'warn');
                appendLog('灵敏检出：VAD 已切换为 whisperseg-asmr，请确认模型已下载', 'info');
            }
            syncExpertCustomHints();
        });
        els.engineAsrModelSelect?.addEventListener('change', () => {
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
            syncExpertCustomHints();
        });
        els.vadAggressiveCheck?.addEventListener('change', () => {
            if (els.vadAggressiveCheck?.checked && els.vadSensitiveCheck) {
                els.vadSensitiveCheck.checked = false;
            }
            syncExpertCustomHints();
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
            if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                || t.id === 'retranscribeWarmLightCheck' || t.id === 'logLevelSelect'
                || t.id === 'maxBatchSizeInput') {
                syncExpertCustomHints();
            }
        });
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
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    global.TransubCore = {
        appendLog,
        applyOptionsToForm,
        buildSavedOptionsFromForm,
        openParamsModal,
        openAppSettings,
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
        state,
        isStandaloneSettings: () => isStandaloneSettings,
    };
}(window));
