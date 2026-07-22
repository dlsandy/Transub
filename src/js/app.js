/**
 * Transub — TransWithAI 字幕生成
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const els = {};

    const VIDEO_EXTENSIONS = new Set([
        'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
        'ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
    ]);

    const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';

    const DEVICE_LABELS = {
        cuda: 'GPU',
        amd: 'GPU AMD',
        cpu: 'CPU',
        cuda_low_vram: 'GPU 低显存',
        cuda_batch: 'GPU 批处理',
        modal: 'Modal 云端',
    };

    const EXPERT_DEVICES = new Set(['cuda_low_vram', 'cuda_batch', 'modal']);
    const DEFAULT_AUDIO_SUFFIXES = 'mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv';
    const EXPERT_PARAM_DEFAULTS = {
        logLevel: 'DEBUG',
        maxBatchSize: 8,
        beamSize: 5,
        vadThreshold: 0.5,
        vadMinSpeechDurationMs: 300,
        vadMinSilenceDurationMs: 100,
        vadSpeechPadMs: 200,
        maxInitialTimestamp: 30,
        repetitionPenalty: 1.1,
        noSpeechThreshold: 0.6,
        logProbThreshold: -1,
        compressionRatioThreshold: 2.4,
        hallucinationSilenceThreshold: null,
        targetChunkDurationS: 30,
        mergeMaxGapMs: 500,
        mergeMaxDurationMs: 15000,
        retranscribeWarmLight: false,
        audioSuffixes: DEFAULT_AUDIO_SUFFIXES,
    };

    const STAGE_LABELS = {
        starting: '启动',
        vad: '语音检测',
        model: '加载模型',
        transcribe: '转写中',
        save: '保存字幕',
        done: '完成',
    };

    const STAGE_RANK = {
        starting: 0,
        vad: 1,
        model: 2,
        transcribe: 3,
        save: 4,
        done: 5,
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
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中|已合并.*)[…\.]*\s*/u, '')
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
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中)[…\.]*\s*/u, '')
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

    const LOG_LEVEL_HINTS = {
        DEBUG: '输出 VAD 分块、模型加载、每句字幕时间轴等全部细节。Transub 可据此精确更新任务进度，安装目录 latest.log 也最完整。适合日常使用与排查问题。',
        INFO: '仅保留启动、扫描文件、加载模型、处理进度（N/M）等关键步骤，不打印每句 [时间轴] 字幕行。任务列表进度将更多依赖时间估算，细粒度更新可能变慢，latest.log 更简洁。',
        WARNING: '仅输出警告与错误，正常转写过程几乎无日志，进行中难以判断当前阶段。仅建议在确认任务异常、需要减少日志量时临时使用。',
        ERROR: '仅在发生错误时输出，无法观察进行中的状态，latest.log 几乎为空。只适合只想捕获失败信息、不关心过程的场景。',
    };

    let savedOptionsSnapshot = null;
    let activeParamsTab = 'runtime';
    let settingsUiMode = 'standard';

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const initialSettingsTab = String(pageQuery.get('tab') || '').trim();

    /** Legacy / alias tab ids → current panel ids */
    const PARAMS_TAB_ALIASES = {
        ffmpeg: 'install',
        advanced: 'editor',
        environment: 'install',
        general: 'runtime',
    };

    function resolveParamsTab(tabId) {
        const raw = String(tabId || '').trim();
        if (!raw) return 'runtime';
        return PARAMS_TAB_ALIASES[raw] || raw;
    }

    function normalizeSettingsUiMode(value) {
        return String(value || '').trim() === 'expert' ? 'expert' : 'standard';
    }

    function nearlyEqual(a, b, eps = 1e-6) {
        return Math.abs(Number(a) - Number(b)) <= eps;
    }

    function hasExpertCustomizations(options = buildSavedOptionsFromForm()) {
        if (EXPERT_DEVICES.has(options.device)) return true;
        if (String(options.logLevel || 'DEBUG').toUpperCase() !== EXPERT_PARAM_DEFAULTS.logLevel) return true;
        if (!nearlyEqual(options.maxBatchSize, EXPERT_PARAM_DEFAULTS.maxBatchSize)) return true;
        if (!nearlyEqual(options.beamSize, EXPERT_PARAM_DEFAULTS.beamSize)) return true;
        if (!nearlyEqual(options.vadThreshold, EXPERT_PARAM_DEFAULTS.vadThreshold)) return true;
        if (!nearlyEqual(options.vadMinSpeechDurationMs, EXPERT_PARAM_DEFAULTS.vadMinSpeechDurationMs)) return true;
        if (!nearlyEqual(options.vadMinSilenceDurationMs, EXPERT_PARAM_DEFAULTS.vadMinSilenceDurationMs)) return true;
        if (!nearlyEqual(options.vadSpeechPadMs, EXPERT_PARAM_DEFAULTS.vadSpeechPadMs)) return true;
        if (!nearlyEqual(options.maxInitialTimestamp, EXPERT_PARAM_DEFAULTS.maxInitialTimestamp)) return true;
        if (!nearlyEqual(options.repetitionPenalty, EXPERT_PARAM_DEFAULTS.repetitionPenalty)) return true;
        if (!nearlyEqual(options.noSpeechThreshold, EXPERT_PARAM_DEFAULTS.noSpeechThreshold)) return true;
        if (!nearlyEqual(options.logProbThreshold, EXPERT_PARAM_DEFAULTS.logProbThreshold)) return true;
        if (!nearlyEqual(options.compressionRatioThreshold, EXPERT_PARAM_DEFAULTS.compressionRatioThreshold)) return true;
        if ((options.hallucinationSilenceThreshold ?? null) !== EXPERT_PARAM_DEFAULTS.hallucinationSilenceThreshold) {
            return true;
        }
        if (!nearlyEqual(options.targetChunkDurationS, EXPERT_PARAM_DEFAULTS.targetChunkDurationS)) return true;
        if (!nearlyEqual(options.mergeMaxGapMs, EXPERT_PARAM_DEFAULTS.mergeMaxGapMs)) return true;
        if (!nearlyEqual(options.mergeMaxDurationMs, EXPERT_PARAM_DEFAULTS.mergeMaxDurationMs)) return true;
        if (!!options.retranscribeWarmLight !== EXPERT_PARAM_DEFAULTS.retranscribeWarmLight) return true;
        const suffixes = String(options.audioSuffixes || DEFAULT_AUDIO_SUFFIXES)
            .split(/[,;\s]+/)
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean)
            .sort()
            .join(',');
        const defaultSuffixes = DEFAULT_AUDIO_SUFFIXES.split(',').map((p) => p.trim()).sort().join(',');
        if (suffixes !== defaultSuffixes) return true;
        return false;
    }

    function syncDeviceOptionsForMode() {
        const current = els.deviceSelect?.value || 'cuda';
        const expertMode = settingsUiMode === 'expert';
        els.deviceSelect?.querySelectorAll('option[data-expert-device="1"]').forEach((opt) => {
            const keepVisible = expertMode || opt.value === current;
            opt.hidden = !keepVisible;
            opt.disabled = !keepVisible;
        });
        const showDeviceHint = !expertMode && EXPERT_DEVICES.has(current);
        els.deviceExpertHint?.classList.toggle('hidden', !showDeviceHint);
    }

    function syncExpertCustomHints() {
        const show = settingsUiMode === 'standard' && hasExpertCustomizations();
        els.transcribeExpertCustomHint?.classList.toggle('hidden', !show);
    }

    function applySettingsUiMode() {
        const mode = normalizeSettingsUiMode(settingsUiMode);
        settingsUiMode = mode;
        els.paramsModal?.classList.toggle('settings-mode-standard', mode === 'standard');
        els.paramsModal?.classList.toggle('settings-mode-expert', mode === 'expert');
        document.querySelectorAll('[data-settings-ui-mode]').forEach((btn) => {
            const active = btn.getAttribute('data-settings-ui-mode') === mode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        syncDeviceOptionsForMode();
        syncBatchSizeUi();
        syncMergeUi();
        syncSmartSplitUi();
        syncExpertCustomHints();
    }

    async function setSettingsUiMode(mode, { persist = true } = {}) {
        const next = normalizeSettingsUiMode(mode);
        if (next === settingsUiMode && els.paramsModal?.classList.contains(`settings-mode-${next}`)) {
            applySettingsUiMode();
            return;
        }
        settingsUiMode = next;
        applySettingsUiMode();
        if (!persist || !isDesktop()) return;
        try {
            await electron?.transWithAiSaveOptions?.({ settingsUiMode: next });
        } catch (_) { /* ignore */ }
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
        jobStartedAt: 0,
        elapsedTicker: null,
        pendingQueue: [],
        postTaskAction: 'none',
        playSoundOnComplete: false,
        postTaskMenuOpen: false,
        addMenuOpen: false,
        moreMenuOpen: false,
        qcBannerDismissed: false,
        etaRate: null,
        historyEntries: [],
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
            if (!state.running) {
                stopElapsedTicker();
                return;
            }
            updateProgressUi();
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

    function isVideoPath(filePath) {
        const ext = String(filePath || '').split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() || '';
        return VIDEO_EXTENSIONS.has(ext);
    }

    function isVideoFile(file, filePath) {
        const path = String(filePath || '').trim();
        if (path && isVideoPath(path)) return true;
        const mime = String(file?.type || '').toLowerCase();
        if (mime.startsWith('video/')) return true;
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
            'appVersionLabel', 'paramsSummary', 'paramsChips', 'quickTaskSelect', 'quickLanguageSelect', 'quickTargetLangSelect', 'quickTargetLangWrap',
            'quickFormatBtn', 'quickFormatLabel', 'transWithAiStatus', 'openParamsBtn',
            'moreMenuWrap', 'moreMenuBtn', 'moreMenu', 'openHistoryMenuBtn', 'toggleDensityBtn', 'toggleDensityLabel',
            'openAboutBtn',
            'envBanner', 'envBannerText', 'envBannerBtn', 'qcBanner', 'qcBannerText', 'qcBannerDismissBtn',
            'paramsModal', 'closeParamsBtn', 'cancelParamsBtn',
            'installPathInput', 'installBrowseBtn', 'installTestBtn', 'installCheckUpdateBtn', 'installDownloadBtn',
            'transcribeModelSelect', 'translateModelSelect', 'modelSelectHint',
            'transcribeModelPathInput', 'translateModelPathInput',
            'transcribeModelBrowseBtn', 'translateModelBrowseBtn',
            'deviceSelect', 'taskSelect', 'overwriteCheck', 'mergeBilingualCheck', 'mergeBilingualWrap',
            'deleteSourcesAfterMergeCheck', 'deleteSourcesAfterMergeWrap',
            'deviceExpertHint', 'maxBatchSizeWrap', 'maxBatchSizeInput', 'logLevelSelect', 'logLevelHint',
            'subFormatSrt', 'subFormatVtt', 'subFormatLrc',
            'glossaryPromptCheck', 'chineseSubtitleVariantSelect',
            'languageSelect', 'beamSizeInput', 'vadThresholdInput',
            'vadMinSpeechDurationInput', 'vadMinSilenceDurationInput', 'vadSpeechPadInput',
            'repetitionPenaltyInput', 'maxInitialTimestampInput',
            'noSpeechThresholdInput', 'logProbThresholdInput', 'compressionRatioThresholdInput',
            'hallucinationSilenceThresholdInput', 'transcribeExpertCustomHint',
            'smartSplitWithVadCheck', 'targetChunkDurationWrap', 'targetChunkDurationInput',
            'mergeSegmentsCheck', 'mergeSettingsWrap', 'mergeMaxGapInput', 'mergeMaxDurationInput',
            'retranscribeWarmLightCheck', 'subtitleBakModeSelect',
            'trayProgressCheck', 'minimizeToTrayOnStartCheck', 'trayNotifyCheck',
            'postBatchQcCheck', 'postBatchCpsSplitCheck', 'postBatchRemoveNoiseCheck', 'postBatchCompressRepCheck',
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
            'logCollapseBtn', 'logSectionBody', 'clearLogBtn', 'copyLogBtn', 'progressEta',
            'saveParamsBtn', 'saveParamsStatus',
            'jobStatusBadge', 'progressLabel', 'progressCount', 'progressBar',
            'currentFile', 'logHost',
            'removeSelectedBtn', 'clearListBtn', 'startBtn', 'selectAllCheck',
            'fileListBody', 'emptyListRow', 'stopBtn', 'filePanel', 'dropZone', 'dropOverlay',
            'openSubtitleFileBtn',
        ].forEach((id) => { els[id] = document.getElementById(id); });
        els.paramsTabBtns = Array.from(document.querySelectorAll('.params-tab-btn'));
        els.paramsTabPanels = Array.from(document.querySelectorAll('.params-tab-panel'));
        els.settingsUiModeBtns = Array.from(document.querySelectorAll('[data-settings-ui-mode]'));
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
            const ok = window.confirm('全部成功后将关机。确定选择「关机」吗？');
            if (!ok) next = getPostTaskAction();
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
        if (open) setAddMenuOpen(false);
    }

    function setAddMenuOpen(open) {
        state.addMenuOpen = !!open;
        els.addMenu?.classList.toggle('hidden', !open);
        if (els.addMenuBtn) {
            els.addMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open) setPostTaskMenuOpen(false);
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
        }
    }

    function applyUiPrefs() {
        let density = 'comfort';
        let logCollapsed = true;
        try {
            density = localStorage.getItem('transub.density') || 'comfort';
            logCollapsed = localStorage.getItem('transub.logCollapsed') !== '0';
        } catch (_) { /* ignore */ }
        document.body.classList.toggle('density-compact', density === 'compact');
        document.body.classList.toggle('log-collapsed', logCollapsed);
        if (els.toggleDensityLabel) {
            els.toggleDensityLabel.textContent = density === 'compact' ? '舒适列表' : '紧凑列表';
        }
        if (els.logCollapseBtn) {
            els.logCollapseBtn.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
        }
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

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!el.isContentEditable;
    }

    function bindMainUiExtras() {
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
        els.envBannerBtn?.addEventListener('click', () => {
            if (electron?.transubOpenSettings) {
                void electron.transubOpenSettings({ tab: 'install' });
                return;
            }
            openParamsModal('install');
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
            if (electron?.transubOpenSettings) {
                void electron.transubOpenSettings({ tab: 'output' });
                return;
            }
            openParamsModal('output');
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
            if (key === 'Escape' && state.running) {
                event.preventDefault();
                stopTask();
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
        };
        if (action === 'quit') {
            return { ...base, postTaskAction: 'quit', closeWindowOnComplete: false, quitAppOnComplete: true, shutdownOnComplete: false };
        }
        if (action === 'shutdown') {
            return { ...base, postTaskAction: 'shutdown', closeWindowOnComplete: false, quitAppOnComplete: true, shutdownOnComplete: true };
        }
        if (action === 'sleep') {
            return { ...base, postTaskAction: 'sleep', closeWindowOnComplete: false, quitAppOnComplete: false, shutdownOnComplete: false, sleepOnComplete: true };
        }
        if (action === 'open_folder') {
            return {
                ...base,
                postTaskAction: 'open_folder',
                closeWindowOnComplete: false,
                quitAppOnComplete: false,
                shutdownOnComplete: false,
                openOutputFolderOnComplete: true,
            };
        }
        return { ...base, postTaskAction: 'none', closeWindowOnComplete: false, quitAppOnComplete: false, shutdownOnComplete: false };
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
        if (els.subFormatLrc?.checked) parts.push('lrc');
        return parts.length ? parts.join(',') : 'srt';
    }

    function applySubFormatsToForm(value) {
        const set = new Set(String(value || 'srt').split(/[,;\s]+/).map((p) => p.trim().toLowerCase()));
        if (els.subFormatSrt) els.subFormatSrt.checked = set.has('srt');
        if (els.subFormatVtt) els.subFormatVtt.checked = set.has('vtt');
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

    function syncMergeUi() {
        const enabled = !!els.mergeSegmentsCheck?.checked;
        els.mergeSettingsWrap?.classList.toggle('hidden', !enabled);
        if (els.mergeMaxGapInput) els.mergeMaxGapInput.disabled = !enabled;
        if (els.mergeMaxDurationInput) els.mergeMaxDurationInput.disabled = !enabled;
    }

    function syncSmartSplitUi() {
        const enabled = !!els.smartSplitWithVadCheck?.checked;
        els.targetChunkDurationWrap?.classList.toggle('hidden', !enabled);
        if (els.targetChunkDurationInput) els.targetChunkDurationInput.disabled = !enabled;
    }

    const modelApi = global.TransubTransWithAiModels || null;
    let cachedModelItems = [];

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
        const opts = ['<option value=\"\">（自动 / 安装默认）</option>'];
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
            const b = modelApi.modelLabelFromPath(opts.translateModelPath);
            els.modelSelectHint.textContent = `双语将使用：转写「${a}」→ 翻译「${b}」`;
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
        updateModelSelectHint();
    }

    function syncMergeBilingualUi() {
        const isDual = readTaskFromForm() === 'dual';
        if (els.mergeBilingualCheck) els.mergeBilingualCheck.disabled = !isDual;
        if (els.mergeBilingualWrap) {
            els.mergeBilingualWrap.classList.toggle('hidden', !isDual);
            els.mergeBilingualWrap.classList.toggle('opacity-50', !isDual);
        }
        const mergeOn = isDual && !!els.mergeBilingualCheck?.checked;
        if (els.deleteSourcesAfterMergeCheck) {
            els.deleteSourcesAfterMergeCheck.disabled = !mergeOn;
            if (!mergeOn) els.deleteSourcesAfterMergeCheck.checked = false;
        }
        if (els.deleteSourcesAfterMergeWrap) {
            els.deleteSourcesAfterMergeWrap.classList.toggle('hidden', !isDual);
            els.deleteSourcesAfterMergeWrap.classList.toggle('opacity-50', !mergeOn);
        }
    }

    function switchParamsTab(tabId) {
        activeParamsTab = resolveParamsTab(tabId || activeParamsTab);
        els.paramsTabBtns?.forEach((btn) => {
            const active = btn.dataset.tab === activeParamsTab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        els.paramsTabPanels?.forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.tabPanel === activeParamsTab);
        });
        if (activeParamsTab === 'install') {
            global.TransubFeatures?.showInstallWizard?.();
        }
    }

    function openParamsModal(tabId) {
        if (!isStandaloneSettings) {
            setPostTaskMenuOpen(false);
            setAddMenuOpen(false);
        }
        savedOptionsSnapshot = buildSavedOptionsFromForm();
        switchParamsTab(tabId || activeParamsTab);
        els.paramsModal?.classList.remove('hidden');
    }

    function closeParamsModal(restore = false) {
        if (restore && savedOptionsSnapshot) {
            applyOptionsToForm(savedOptionsSnapshot, { applyUiMode: false });
        }
        if (isStandaloneSettings) {
            closeStandaloneSettingsWindow();
            return;
        }
        els.paramsModal?.classList.add('hidden');
        if (els.saveParamsStatus) {
            els.saveParamsStatus.textContent = '';
            els.saveParamsStatus.className = 'text-xs text-gray-500';
        }
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
    }

    function applyOptionsToForm(options = {}, { applyUiMode = true } = {}) {
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
        if (els.deleteSourcesAfterMergeCheck) {
            els.deleteSourcesAfterMergeCheck.checked = !!options.mergeBilingualSubtitles
                && !!options.deleteSourcesAfterMergeBilingual;
        }
        applySubFormatsToForm(options.subFormats);
        if (els.chineseSubtitleVariantSelect) {
            els.chineseSubtitleVariantSelect.value = options.chineseSubtitleVariant === 'traditional'
                ? 'traditional'
                : 'simplified';
        }
        if (els.glossaryPromptCheck) {
            els.glossaryPromptCheck.checked = options.glossaryPromptEnabled !== false;
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
        if (els.repetitionPenaltyInput && options.repetitionPenalty != null) {
            els.repetitionPenaltyInput.value = String(options.repetitionPenalty);
        }
        if (els.maxInitialTimestampInput && options.maxInitialTimestamp != null) {
            els.maxInitialTimestampInput.value = String(options.maxInitialTimestamp);
        }
        if (els.noSpeechThresholdInput && options.noSpeechThreshold != null) {
            els.noSpeechThresholdInput.value = String(options.noSpeechThreshold);
        }
        if (els.logProbThresholdInput && options.logProbThreshold != null) {
            els.logProbThresholdInput.value = String(options.logProbThreshold);
        }
        if (els.compressionRatioThresholdInput && options.compressionRatioThreshold != null) {
            els.compressionRatioThresholdInput.value = String(options.compressionRatioThreshold);
        }
        if (els.hallucinationSilenceThresholdInput) {
            els.hallucinationSilenceThresholdInput.value = options.hallucinationSilenceThreshold != null
                ? String(options.hallucinationSilenceThreshold)
                : '';
        }
        if (els.smartSplitWithVadCheck) {
            els.smartSplitWithVadCheck.checked = options.smartSplitWithVad !== false;
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
        if (els.trayProgressCheck) {
            els.trayProgressCheck.checked = !!options.trayProgressEnabled;
        }
        if (els.minimizeToTrayOnStartCheck) {
            els.minimizeToTrayOnStartCheck.checked = !!options.minimizeToTrayOnStart;
        }
        if (els.trayNotifyCheck) {
            els.trayNotifyCheck.checked = !!options.trayNotifyEnabled;
        }
        if (els.postBatchQcCheck) {
            els.postBatchQcCheck.checked = options.postBatchQc !== false;
        }
        if (els.postBatchCpsSplitCheck) {
            els.postBatchCpsSplitCheck.checked = options.postBatchCpsSplit !== false;
        }
        if (els.postBatchRemoveNoiseCheck) {
            els.postBatchRemoveNoiseCheck.checked = options.postBatchRemoveNoise !== false;
        }
        if (els.postBatchCompressRepCheck) {
            els.postBatchCompressRepCheck.checked = options.postBatchCompressRepetition !== false;
        }
        if (els.targetChunkDurationInput && options.targetChunkDurationS != null) {
            els.targetChunkDurationInput.value = String(options.targetChunkDurationS);
        }
        if (els.mergeSegmentsCheck) {
            els.mergeSegmentsCheck.checked = options.mergeSegments !== false;
        }
        if (els.mergeMaxGapInput && options.mergeMaxGapMs != null) {
            els.mergeMaxGapInput.value = String(options.mergeMaxGapMs);
        }
        if (els.mergeMaxDurationInput && options.mergeMaxDurationMs != null) {
            els.mergeMaxDurationInput.value = String(options.mergeMaxDurationMs);
        }
        if (applyUiMode && options.settingsUiMode != null) {
            settingsUiMode = normalizeSettingsUiMode(options.settingsUiMode);
        }
        applySettingsUiMode();
        syncChineseSubtitleVariantUi();
        void refreshModelSelects(options);
        updateParamsSummary();
    }

    function buildSavedOptionsFromForm() {
        return {
            installPath: els.installPathInput?.value.trim() || 'F:\\UltraTools\\TransWithAI',
            device: els.deviceSelect?.value || 'cuda',
            task: readTaskFromForm(),
            overwrite: !!els.overwriteCheck?.checked,
            mergeBilingualSubtitles: readTaskFromForm() === 'dual' && !!els.mergeBilingualCheck?.checked,
            deleteSourcesAfterMergeBilingual: readTaskFromForm() === 'dual'
                && !!els.mergeBilingualCheck?.checked
                && !!els.deleteSourcesAfterMergeCheck?.checked,
            subFormats: readSubFormatsFromForm(),
            modelPath: readModelPathFromForm('translate') || readModelPathFromForm('transcribe') || '',
            transcribeModelPath: readModelPathFromForm('transcribe'),
            translateModelPath: readModelPathFromForm('translate'),
            chineseSubtitleVariant: els.chineseSubtitleVariantSelect?.value === 'traditional'
                ? 'traditional'
                : 'simplified',
            glossaryPromptEnabled: els.glossaryPromptCheck ? !!els.glossaryPromptCheck.checked : true,
            logLevel: els.logLevelSelect?.value || 'DEBUG',
            maxBatchSize: Number(els.maxBatchSizeInput?.value) || 8,
            language: els.languageSelect?.value || 'auto',
            beamSize: Number(els.beamSizeInput?.value) || 5,
            vadThreshold: Number(els.vadThresholdInput?.value) || 0.5,
            vadMinSpeechDurationMs: Number(els.vadMinSpeechDurationInput?.value) || 300,
            vadMinSilenceDurationMs: Number(els.vadMinSilenceDurationInput?.value) || 100,
            vadSpeechPadMs: Number(els.vadSpeechPadInput?.value) || 200,
            repetitionPenalty: Number(els.repetitionPenaltyInput?.value) || 1.1,
            maxInitialTimestamp: Number(els.maxInitialTimestampInput?.value) || 30,
            noSpeechThreshold: Number(els.noSpeechThresholdInput?.value) || 0.6,
            logProbThreshold: Number(els.logProbThresholdInput?.value) || -1,
            compressionRatioThreshold: Number(els.compressionRatioThresholdInput?.value) || 2.4,
            hallucinationSilenceThreshold: (() => {
                const raw = String(els.hallucinationSilenceThresholdInput?.value ?? '').trim();
                if (!raw) return null;
                const n = Number(raw);
                return Number.isFinite(n) && n > 0 ? n : null;
            })(),
            smartSplitWithVad: !!els.smartSplitWithVadCheck?.checked,
            targetChunkDurationS: Number(els.targetChunkDurationInput?.value) || 30,
            retranscribeWarmLight: !!els.retranscribeWarmLightCheck?.checked,
            subtitleBakMode: ['off', 'beside', 'appBackup'].includes(els.subtitleBakModeSelect?.value)
                ? els.subtitleBakModeSelect.value
                : 'off',
            trayProgressEnabled: els.trayProgressCheck ? !!els.trayProgressCheck.checked : true,
            minimizeToTrayOnStart: !!els.minimizeToTrayOnStartCheck?.checked,
            trayNotifyEnabled: !!els.trayNotifyCheck?.checked,
            postBatchQc: els.postBatchQcCheck ? !!els.postBatchQcCheck.checked : true,
            postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
            postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
            postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
            mergeSegments: !!els.mergeSegmentsCheck?.checked,
            mergeMaxGapMs: Number(els.mergeMaxGapInput?.value) || 500,
            mergeMaxDurationMs: Number(els.mergeMaxDurationInput?.value) || 15000,
            outputMode: els.outputModeSelect?.value === 'custom' ? 'custom' : 'same',
            outputDir: resolveOutputDirFromForm(),
            audioSuffixes: els.audioSuffixesInput?.value.trim() || DEFAULT_AUDIO_SUFFIXES,
            ffmpegPath: els.ffmpegPathInput?.value.trim() || '',
            settingsUiMode: normalizeSettingsUiMode(settingsUiMode),
        };
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

    async function openTransWithAiReleases() {
        const res = await electron?.openExternal?.(TRANWITHAI_RELEASES_URL);
        if (res?.ok === false) appendLog(res?.error || '无法打开下载页面', 'err');
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
        global.TransubFeatures?.showInstallWizard?.();
    }

    async function flushPendingQueue() {
        if (state.running || !state.pendingQueue.length) return;
        const queued = state.pendingQueue.splice(0);
        updateQueueBadge();
        appendLog(`正在处理队列中的 ${queued.length} 个文件…`, 'info');
        await addFiles(queued);
        const selectable = getSelectedItems();
        if (selectable.length && !state.running) {
            const yes = window.confirm(`队列中有 ${selectable.length} 个视频已就绪，是否立即开始生成字幕？`);
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
                const open = window.confirm(`${msg}\n\n是否打开下载页面？`);
                if (open) {
                    const url = res.releaseUrl || res.releasesUrl || TRANWITHAI_RELEASES_URL;
                    const openRes = await electron?.openExternal?.(url);
                    if (openRes?.ok === false) appendLog(openRes?.error || '无法打开下载页面', 'err');
                }
            } else if (!res.currentVersion && res.latestVersion) {
                const open = window.confirm(`${msg}\n\n是否打开下载页面查看？`);
                if (open) {
                    const url = res.releaseUrl || res.releasesUrl || TRANWITHAI_RELEASES_URL;
                    await electron?.openExternal?.(url);
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

    async function saveParamsSettings() {
        if (!isDesktop()) {
            appendLog('需在桌面版中使用', 'err');
            return;
        }
        if (els.saveParamsBtn) els.saveParamsBtn.disabled = true;
        if (els.saveParamsStatus) {
            els.saveParamsStatus.textContent = '保存中…';
            els.saveParamsStatus.className = 'text-xs text-gray-400';
        }
        try {
            const res = await electron?.transWithAiSaveOptions?.({
                ...buildSavedOptionsFromForm(),
                saveParams: true,
            });
            if (res?.ok) {
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                appendLog('设置已保存', 'ok');
                if (els.saveParamsStatus) {
                    els.saveParamsStatus.textContent = '已保存';
                    els.saveParamsStatus.className = 'text-xs text-emerald-600';
                }
                updateParamsSummary();
                if (isStandaloneSettings) {
                    setTimeout(() => closeStandaloneSettingsWindow(), 350);
                } else {
                    setTimeout(() => closeParamsModal(false), 400);
                }
            } else {
                appendLog(res?.error || '保存参数失败', 'err');
                if (els.saveParamsStatus) {
                    els.saveParamsStatus.textContent = '保存失败';
                    els.saveParamsStatus.className = 'text-xs text-red-600';
                }
            }
        } catch (err) {
            appendLog(err?.message || '保存参数失败', 'err');
            if (els.saveParamsStatus) {
                els.saveParamsStatus.textContent = '保存失败';
                els.saveParamsStatus.className = 'text-xs text-red-600';
            }
        } finally {
            if (els.saveParamsBtn) els.saveParamsBtn.disabled = false;
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
        const panel = els.logHost.closest('.log-panel') || els.logHost;
        panel.scrollTop = panel.scrollHeight;
    }

    function findItem(path) {
        const key = normPath(path);
        return state.items.find((i) => normPath(i.path) === key);
    }

    function updateStartButton() {
        const hasSelectable = state.items.some((i) => i.selected && i.status !== 'error');
        if (els.startBtn) els.startBtn.disabled = state.running || !hasSelectable;
        if (els.addMenuBtn) els.addMenuBtn.disabled = false;
        if (els.removeSelectedBtn) els.removeSelectedBtn.disabled = state.running;
        if (els.clearListBtn) els.clearListBtn.disabled = state.running;
        if (els.selectAllCheck) els.selectAllCheck.disabled = state.running;
        updateStopButton();
    }

    function updateStopButton() {
        if (els.stopBtn) els.stopBtn.disabled = !state.running;
    }

    async function stopTask() {
        if (!state.running) return;
        if (!confirm('确定停止当前字幕任务？')) return;
        const res = await electron?.transWithAiCancel?.();
        if (res?.cancelled || res?.ok) {
            appendLog('正在停止任务…', 'warn');
        } else {
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
                appendLog('未识别到支持的视频文件（已忽略非视频或无法读取路径）', 'warn');
            }
            return;
        }
        const before = state.items.length;
        await addFiles(paths);
        const added = state.items.length - before;
        const skipped = paths.length - added;
        if (added > 0) {
            appendLog(`拖入添加 ${added} 个视频${skipped > 0 ? `，${skipped} 个已在列表中` : ''}`, 'info');
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
            }));
            state.items.push(...newItems);
            renderList();

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
            failed: { label: '失败', cls: 'row-status-failed' },
            error: { label: '错误', cls: 'row-status-error' },
        };
        return map[status] || { label: status || '—', cls: 'row-status-pending' };
    }

    function countQcIssues() {
        return state.items.filter((i) => Number(i.qcIssueCount) > 0).length;
    }

    function updateQcBanner() {
        if (!els.qcBanner) return;
        const n = countQcIssues();
        if (n <= 0 || state.qcBannerDismissed) {
            els.qcBanner.classList.add('hidden');
            return;
        }
        if (els.qcBannerText) {
            els.qcBannerText.textContent = `${n} 条字幕有 QC 问题，可在编辑器中查看并修复`;
        }
        els.qcBanner.classList.remove('hidden');
    }

    function updateEnvBanner() {
        if (!els.envBanner) return;
        const path = String(els.installPathInput?.value || '').trim();
        const statusOk = els.transWithAiStatus?.className?.includes('emerald');
        const needs = !path || (els.transWithAiStatus && /未|失败|无效|缺少/i.test(els.transWithAiStatus.textContent || '') && !statusOk);
        // Only show when path empty (strong signal); avoid noisy false positives after load
        const show = !path;
        els.envBanner.classList.toggle('hidden', !show);
    }

    function updateEmptyStateUi() {
        const hasItems = state.items.length > 0;
        els.emptyState?.classList.toggle('hidden', hasItems);
        els.listScroll?.classList.toggle('hidden', !hasItems);
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
        let qcCell = '<span class="text-gray-300">—</span>';
        if (item.qcError) {
            qcCell = `<span class="text-amber-600 text-xs" title="${esc(item.qcError)}">?</span>`;
        } else if (Number.isFinite(Number(item.qcIssueCount))) {
            const n = Number(item.qcIssueCount);
            const tip = esc(item.qcSummary || (n ? `${n} 项问题` : '通过'));
            qcCell = n > 0
                ? `<button type="button" data-qc-open="${idx}" class="inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 hover:bg-amber-200" title="${tip}（点击编辑）">${n}</button>`
                : `<span class="text-emerald-600 text-xs" title="${tip}">✓</span>`;
        }
        const editBtn = subPath
            ? `<button type="button" data-edit-sub="${esc(subPath)}" data-edit-video="${esc(item.path)}" class="row-action-btn text-violet-500 hover:text-violet-700 hover:bg-violet-50" title="编辑字幕"><i class="fa fa-pencil text-xs"></i></button>` : '';
        const retryBtn = (item.status === 'failed' || item.status === 'error') && !state.running
            ? `<button type="button" data-retry-idx="${idx}" class="row-action-btn text-amber-600 hover:text-amber-800 hover:bg-amber-50" title="重试本条"><i class="fa fa-repeat text-xs"></i></button>`
            : '';
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
        const detailHtml = detail
            ? `<div class="cell-ellipsis text-[10px] text-gray-400 mt-0.5" title="${esc(detail)}">${esc(detail)}</div>`
            : '';
        return `
            <tr class="task-row hover:bg-gray-50/80" data-idx="${idx}" data-status="${esc(item.status)}" data-path="${esc(normPath(item.path))}">
                <td class="px-2 py-1.5"><input type="checkbox" data-row-check ${item.selected ? 'checked' : ''} ${state.running ? 'disabled' : ''}></td>
                <td class="px-2 py-1.5 text-xs col-file"><div class="cell-ellipsis font-medium text-gray-800" title="${esc(item.path)}">${esc(basename(item.path))}${subBadge}</div></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-500 col-duration">${item.duration ? formatDuration(item.duration) : '—'}</td>
                <td class="px-2 py-1.5 col-progress">${progressCell}</td>
                <td class="px-2 py-1.5 text-xs col-status">
                    <span class="row-status-badge ${meta.cls}">${esc(meta.label)}</span>
                    ${detailHtml}
                </td>
                <td class="px-1 py-1.5 text-center text-xs col-qc">${qcCell}</td>
                <td class="px-1 py-1.5 text-center col-actions">
                    <div class="row-actions">
                    ${retryBtn}
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
        if (!state.items.length) {
            els.fileListBody.innerHTML = '';
            updateEmptyStateUi();
            updateQcBanner();
            return;
        }

        const rows = state.items.map((item, idx) => buildListRowHtml(item, idx));
        els.fileListBody.innerHTML = rows.join('');
        bindListRowEvents(els.fileListBody);
        updateEmptyStateUi();
        updateQcBanner();
        updateStartButton();
    }

    function getSelectedItems() {
        return state.items.filter((i) => i.selected && i.status !== 'error');
    }

    async function addVideos() {
        const res = await electron?.transWithAiSelectVideos?.();
        if (res?.ok && !res.canceled && res.files?.length) {
            await addFiles(res.files);
            appendLog(`已添加 ${res.files.length} 个文件`, 'info');
        }
    }

    async function addFolder() {
        const res = await electron?.selectFolder?.({ title: '选择包含视频的文件夹' });
        if (!res?.ok || res.canceled || !res.path) return;
        const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
        if (!scan?.ok) {
            appendLog(scan?.error || '扫描文件夹失败', 'err');
            return;
        }
        await addFiles(scan.files || []);
        appendLog(`从文件夹添加 ${scan.files?.length || 0} 个视频`, 'info');
    }

    function removeSelected() {
        if (state.running) return;
        state.items = state.items.filter((i) => !i.selected);
        renderList();
        updateStartButton();
    }

    function clearList() {
        if (state.running) return;
        state.items = [];
        renderList();
        updateStartButton();
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
        // VAD / 加载模型等转写前阶段不计入进度百分比，也不写入时间轴
        // 双语第二阶段的启动/VAD 仍保留已映射的 itemProgress，避免进度回跳
        if (isPreTranscribeStage(state.itemStage)) {
            if (p.itemDualPhase && Number.isFinite(Number(p.itemProgress))) {
                state.videoProgress = bumpProgress(state.videoProgress, Number(p.itemProgress));
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
        const durMap = new Map(state.items.map((i) => [normPath(i.path), i.duration]));
        return paths.map((fullPath) => ({
            path: fullPath,
            selected: true,
            status: 'pending',
            progress: 0,
            processedSec: 0,
            processedTotalSec: 0,
            detail: '等待中',
            duration: durMap.get(normPath(fullPath)) || 0,
        }));
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
        state.jobStartedAt = Date.now();
        state.itemStage = 'starting';
        state.itemDualPhase = null;

        const paths = Array.isArray(payload?.items) ? payload.items : [];
        state.items = buildItemsFromPaths(paths);
        resetVideoProgress();

        if (els.logHost) els.logHost.innerHTML = '';
        setBadge('运行中', 'running');
        els.progressLabel.textContent = '正在排队处理…';
        els.currentFile.textContent = '—';
        renderList();
        updateProgressUi();
        updateStartButton();
        startElapsedTicker();
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
                const progress = isPreTranscribeStage(stage) && !keepDualProgress
                    ? (p.itemDualPhase === 'translate'
                        ? bumpProgress(existing?.progress, state.videoProgress)
                        : 0)
                    : bumpProgress(existing?.progress, state.videoProgress);
                state.videoProgress = progress;
                const itemPatch = {
                    status: 'running',
                    progress,
                    detail: formatListRunningDetail(p.itemDetail) || stageLabel(stage),
                    stage,
                };
                if (isPreTranscribeStage(stage) && !keepDualProgress && p.itemDualPhase !== 'translate') {
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
                };
                const doneTotal = Number(p.videoTotalSec) || findItem(path)?.duration || 0;
                if (doneTotal > 0) {
                    donePatch.processedSec = doneTotal;
                    donePatch.processedTotalSec = doneTotal;
                }
                if (findItem(path)?.startedAt) donePatch.completedAt = Date.now();
                updateItem(path, donePatch);
                if (!p.subtitlePath) refreshSubtitlePathsForItems();
            } else if (p.phase === 'failed') {
                const failedPatch = {
                    status: 'failed',
                    progress: state.videoProgress || 0,
                    detail: p.itemDetail || p.error || '失败',
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
        } else if (p.phase === 'failed') {
            state.failed += 1;
            els.progressLabel.textContent = '本条失败';
            appendLog(`失败：${name} — ${p.error || '未知错误'}`, 'err');
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

    async function runPostBatchQcScan() {
        if (!els.postBatchQcCheck?.checked) return;
        if (!electron?.transubScanSubtitleQc) return;
        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return !!getSubtitlePathForItem(item);
        });
        if (!targets.length) return;

        els.progressLabel.textContent = 'QC 检测中…';
        appendLog(`开始 QC 检测（${targets.length} 个字幕）…`, 'info');
        let withIssues = 0;
        for (let i = 0; i < targets.length; i += 1) {
            const item = targets[i];
            const subPath = getSubtitlePathForItem(item);
            els.progressLabel.textContent = `QC 检测中… ${i + 1}/${targets.length}`;
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
        appendLog(
            withIssues > 0
                ? `QC 完成：${withIssues}/${targets.length} 个字幕存在问题（仅标记，未自动修复）`
                : `QC 完成：${targets.length} 个字幕均未发现问题`,
            withIssues > 0 ? 'warn' : 'ok',
        );
        els.progressLabel.textContent = withIssues > 0 ? 'QC 完成（有问题项）' : 'QC 完成';
        if (withIssues > 0) state.qcBannerDismissed = false;
        renderList();
        updateQcBanner();
    }

    async function runPostBatchAutoFix() {
        // 以磁盘配置为准（独立设置窗口保存后，主窗口表单可能尚未同步）
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
        const taskFromSaved = savedOpts?.task === 'transcribe' || savedOpts?.task === 'dual'
            ? savedOpts.task
            : (savedOpts?.task ? 'translate' : null);
        const taskNow = taskFromSaved || readTaskFromForm();
        const isTranslate = isTranslateLikeTask(taskNow);
        const variantFromSaved = savedOpts?.chineseSubtitleVariant === 'traditional'
            ? 'traditional'
            : 'simplified';
        const variantFromForm = els.chineseSubtitleVariantSelect?.value === 'traditional'
            ? 'traditional'
            : 'simplified';
        const chineseSubtitleVariant = isTranslate
            ? (savedOpts ? variantFromSaved : variantFromForm)
            : null;
        const doChinese = !!chineseSubtitleVariant;
        // 翻译/双语任务默认：。？！后补空格（在 CPS 拆句之前）；双语后处理只作用于译文轨
        const doSpacePunct = isTranslate;
        if (!doCps && !doNoise && !doCompressRep && !doChinese && !doSpacePunct) return;
        if (!electron?.transubApplySubtitlePostprocess) return;

        const targets = state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return !!getSubtitlePathForItem(item);
        });
        if (!targets.length) return;

        els.progressLabel.textContent = '后处理中…';
        const parts = [];
        if (doSpacePunct) parts.push('句读后空格');
        if (doCps) parts.push('CPS 拆句');
        if (doNoise) parts.push('清理杂音');
        if (doCompressRep) parts.push('压缩叠词');
        if (doChinese) {
            parts.push(chineseSubtitleVariant === 'traditional' ? '转繁体' : '转简体');
        }
        const dualHint = taskNow === 'dual' ? '（译文轨）' : '';
        appendLog(`开始批量后处理（${targets.length} 个字幕${dualHint} · ${parts.join(' · ')}）…`, 'info');
        let written = 0;
        for (let i = 0; i < targets.length; i += 1) {
            const item = targets[i];
            const subPath = getSubtitlePathForItem(item);
            els.progressLabel.textContent = `后处理中… ${i + 1}/${targets.length}`;
            try {
                const res = await electron.transubApplySubtitlePostprocess({
                    path: subPath,
                    options: {
                        spaceAfterChinesePunctuation: doSpacePunct,
                        cpsSplit: doCps,
                        removeNoise: doNoise,
                        removeHallucinations: doNoise,
                        compressRepetition: doCompressRep,
                        fixOverlap: true,
                        enforceMaxDur: true,
                        maxCps: 18,
                        backupMode: 'off',
                        chineseSubtitleVariant: chineseSubtitleVariant || undefined,
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
        appendLog(
            written > 0
                ? `后处理完成：已写回 ${written}/${targets.length} 个字幕`
                : `后处理完成：${targets.length} 个字幕均无需写回`,
            written > 0 ? 'ok' : 'info',
        );
        els.progressLabel.textContent = '后处理完成';
    }

    async function onJobFinished(payload) {
        state.running = false;
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
                item.status = 'failed';
                item.progress = item.progress || 0;
                item.detail = item.detail || '未完成';
            }
        });
        renderList();
        updateProgressUi();
        updateStartButton();
        await refreshSubtitlePathsForItems();

        const failed = Number(payload?.failed) || state.failed;
        const cancelled = !!payload?.cancelled;

        if (cancelled) {
            setBadge('已停止', 'error');
            els.progressLabel.textContent = '任务已取消';
            appendLog('任务已停止', 'warn');
        } else {
            setBadge(failed > 0 ? '已完成（有失败）' : '已完成', failed > 0 ? 'error' : 'done');
            els.progressLabel.textContent = failed > 0 ? '任务结束，部分失败' : '全部处理完成';
            appendLog(
                `任务结束：成功 ${payload?.generated ?? state.generated} · 跳过 ${payload?.skipped ?? state.skipped} · 失败 ${payload?.failed ?? state.failed}`,
                failed > 0 ? 'warn' : 'ok',
            );
            try {
                await runPostBatchAutoFix();
            } catch (err) {
                appendLog(err?.message || '后处理失败', 'err');
            }
            try {
                await runPostBatchQcScan();
            } catch (err) {
                appendLog(err?.message || 'QC 检测失败', 'err');
            }
        }

        setTimeout(() => {
            if (state.running) return;
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
                applyOptionsToForm(optsRes.options);
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

        const validate = await refreshInstallStatus();
        if (!validate?.ok) {
            appendLog(validate?.error || 'TransWithAI 未就绪', 'err');
            setBadge('未就绪', 'error');
            return;
        }

        await refreshEtaRateFromHistory();
        await reloadSavedOptionsIntoForm();
        const opts = buildRuntimeOptions();

        if (modelApi) {
            const gate = modelApi.validateModelsForTask(opts, cachedModelItems, opts.task);
            if (!gate.ok) {
                appendLog(gate.error || '模型配置无效', 'err');
                setBadge('模型未就绪', 'error');
                openParamsModal('install');
                return;
            }
            (gate.warnings || []).forEach((w) => appendLog(w, 'warn'));
            if (gate.options) {
                opts.transcribeModelPath = gate.options.transcribeModelPath;
                opts.translateModelPath = gate.options.translateModelPath;
                opts.modelPath = gate.options.modelPath;
            }
        }

        appendLog(`开始生成字幕 ${selected.length} 个文件…`, 'info');
        if (document.body.classList.contains('log-collapsed')) {
            // 开跑时展开日志便于观察
            try { localStorage.setItem('transub.logCollapsed', '0'); } catch (_) { /* ignore */ }
            applyUiPrefs();
        }
        if (opts.task === 'dual') {
            appendLog(
                `双语模型：转写=${opts.transcribeModelPath || '默认'} · 翻译=${opts.translateModelPath || '默认'}`,
                'info',
            );
        }
        const res = await electron?.transWithAiGenerateSubtitles?.({
            items: selected.map((i) => ({ fullPath: i.path, durationSec: i.duration || 0 })),
            options: opts,
            minimizeToTray: !!opts.minimizeToTrayOnStart,
        });

        if (!res?.ok && !state.running) {
            setBadge('失败', 'error');
            appendLog(res?.error || '字幕生成失败', 'err');
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

    function bindListActions() {
        if (!els.fileListBody || els.fileListBody.dataset.actionsBound) return;
        els.fileListBody.dataset.actionsBound = '1';
        els.fileListBody.addEventListener('click', (e) => {
            const retryBtn = e.target.closest('[data-retry-idx]');
            if (retryBtn) {
                e.preventDefault();
                e.stopPropagation();
                retrySingleItem(Number(retryBtn.dataset.retryIdx));
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
            applyUiPrefs();
            els.removeSelectedBtn?.addEventListener('click', removeSelected);
            els.clearListBtn?.addEventListener('click', clearList);
            els.startBtn?.addEventListener('click', startSubtitleGeneration);
            els.selectAllCheck?.addEventListener('change', () => {
                const checked = els.selectAllCheck.checked;
                state.items.forEach((i) => { i.selected = checked; });
                renderList();
                updateStartButton();
            });
        }
        els.saveParamsBtn?.addEventListener('click', saveParamsSettings);
        els.openParamsBtn?.addEventListener('click', () => {
            if (electron?.transubOpenSettings) {
                void electron.transubOpenSettings({ tab: 'runtime' });
                return;
            }
            openParamsModal('runtime');
        });
        els.closeParamsBtn?.addEventListener('click', () => closeParamsModal(true));
        els.cancelParamsBtn?.addEventListener('click', () => closeParamsModal(true));
        els.paramsModal?.addEventListener('click', (event) => {
            if (isStandaloneSettings) return;
            if (event.target === els.paramsModal) closeParamsModal(true);
        });
        els.paramsTabBtns?.forEach((btn) => {
            btn.addEventListener('click', () => switchParamsTab(btn.dataset.tab));
        });
        els.settingsUiModeBtns?.forEach((btn) => {
            btn.addEventListener('click', () => {
                void setSettingsUiMode(btn.getAttribute('data-settings-ui-mode'));
            });
        });
        electron?.onOpenParams?.((payload) => {
            const tab = String(payload?.tab || (isStandaloneSettings ? 'runtime' : 'editor')).trim()
                || (isStandaloneSettings ? 'runtime' : 'editor');
            openParamsModal(tab);
            void electron?.transubConsumePendingOpenParams?.();
        });
        electron?.onSettingsUpdated?.((payload) => {
            if (isStandaloneSettings) return;
            const options = payload?.options;
            if (!options || typeof options !== 'object') return;
            applyOptionsToForm(options);
            savedOptionsSnapshot = buildSavedOptionsFromForm();
            updateParamsSummary();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || els.paramsModal?.classList.contains('hidden')) return;
            const presetNameModal = document.getElementById('presetNameModal');
            if (presetNameModal && !presetNameModal.classList.contains('hidden')) {
                presetNameModal.classList.add('hidden');
                event.preventDefault();
                return;
            }
            closeParamsModal(true);
        });
        els.installTestBtn?.addEventListener('click', testInstall);
        els.installCheckUpdateBtn?.addEventListener('click', () => {
            void checkTransWithAiEngineUpdate();
        });
        els.installBrowseBtn?.addEventListener('click', browseInstallPath);
        els.ffmpegBrowseBtn?.addEventListener('click', browseFfmpegPath);
        els.ffmpegFolderBtn?.addEventListener('click', browseFfmpegFolder);
        els.ffmpegTestBtn?.addEventListener('click', () => refreshFfmpegStatus({ quick: false }));
        els.installDownloadBtn?.addEventListener('click', openTransWithAiReleases);
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
        ['subFormatSrt', 'subFormatVtt', 'subFormatLrc'].forEach((id) => {
            els[id]?.addEventListener('change', updateParamsSummary);
        });
        els.mergeSegmentsCheck?.addEventListener('change', () => {
            syncMergeUi();
            syncExpertCustomHints();
        });
        els.smartSplitWithVadCheck?.addEventListener('change', () => {
            syncSmartSplitUi();
            syncExpertCustomHints();
        });
        els.paramsModal?.addEventListener('change', (event) => {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return;
            if (t.closest('[data-settings-level="expert"]') || t.id === 'audioSuffixesInput'
                || t.id === 'retranscribeWarmLightCheck' || t.id === 'logLevelSelect'
                || t.id === 'maxBatchSizeInput') {
                syncExpertCustomHints();
            }
        });
        els.paramsModal?.addEventListener('input', (event) => {
            const t = event.target;
            if (!(t instanceof HTMLElement)) return;
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
                await Promise.all([
                    refreshInstallStatus({ quick: true }),
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
        }

        cacheEls();
        void fillAppVersionLabel();
        bindEvents();
        applySettingsUiMode();
        if (!isStandaloneSettings) {
            setBadge('空闲', 'idle');
        }
        syncBatchSizeUi();
        syncLogLevelHint();
        syncMergeUi();
        syncSmartSplitUi();
        syncChineseSubtitleVariantUi();
        if (!isStandaloneSettings) {
            syncPostTaskMenuUi();
            syncPostTaskExtrasUi();
            resetPostTaskSelect();
            renderList();
            updateStartButton();
            updateEnvBanner();
        }

        if (!isDesktop()) {
            if (!isStandaloneSettings) appendLog('需在桌面版中使用', 'err');
            setLoading(false);
            return;
        }

        setLoading(true, '正在加载配置…');
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                applyOptionsToForm(optsRes.options);
                savedOptionsSnapshot = buildSavedOptionsFromForm();
                updateParamsSummary();
            }
            if (!isStandaloneSettings) {
                resetPostTaskSelect();
                await syncPostTaskToMain();
            }
        } finally {
            setLoading(false);
        }

        if (isStandaloneSettings) {
            const pendingParams = await electron?.transubConsumePendingOpenParams?.().catch(() => null);
            const tab = pendingParams?.tab || initialSettingsTab || 'runtime';
            openParamsModal(tab);
            void global.TransubFeatures?.loadPresets?.();
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
            if (pendingParams?.tab) {
                openParamsModal(pendingParams.tab);
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
        addFiles,
        renderList,
        updateStartButton,
        getSelectedItems,
        resolveOutputDirFromForm,
        state,
    };
}(window));
