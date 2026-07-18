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
        cuda: 'GPU 翻译',
        amd: 'GPU AMD',
        cpu: 'CPU 翻译',
        cuda_low_vram: 'GPU 低显存',
        cuda_batch: 'GPU 批处理',
    };

    const STAGE_LABELS = {
        starting: '启动',
        vad: 'VAD 分析',
        model: '加载模型',
        transcribe: '转写',
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

    function stageLabel(stage) {
        return STAGE_LABELS[stage] || '处理中';
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
    let activeParamsTab = 'install';

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
        jobStartedAt: 0,
        elapsedTicker: null,
        pendingQueue: [],
        postTaskAction: 'none',
        playSoundOnComplete: false,
        postTaskMenuOpen: false,
        addMenuOpen: false,
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

    function effectiveItemProgress(stage, progress) {
        if (isPreTranscribeStage(stage)) return 0;
        return Math.max(0, Math.min(99, Number(progress) || 0));
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
            'paramsSummary', 'transWithAiStatus', 'openParamsBtn',
            'paramsModal', 'closeParamsBtn', 'cancelParamsBtn',
            'installPathInput', 'installBrowseBtn', 'installTestBtn', 'installDownloadBtn',
            'deviceSelect', 'taskSelect', 'overwriteCheck',
            'maxBatchSizeWrap', 'maxBatchSizeInput', 'logLevelSelect', 'logLevelHint',
            'subFormatSrt', 'subFormatVtt', 'subFormatLrc', 'modelPathInput',
            'languageSelect', 'beamSizeInput', 'vadThresholdInput',
            'vadMinSpeechDurationInput', 'vadMinSilenceDurationInput', 'vadSpeechPadInput',
            'repetitionPenaltyInput', 'maxInitialTimestampInput',
            'smartSplitWithVadCheck', 'targetChunkDurationWrap', 'targetChunkDurationInput',
            'mergeSegmentsCheck', 'mergeSettingsWrap', 'mergeMaxGapInput', 'mergeMaxDurationInput',
            'retranscribeWarmLightCheck',
            'trayProgressCheck', 'minimizeToTrayOnStartCheck', 'postBatchQcCheck',
            'postTaskMenuBtn', 'postTaskMenu', 'postTaskMenuWrap', 'postTaskMenuItems',
            'shutdownDelayInput', 'shutdownDelayWrap', 'playSoundOnCompleteCheck',
            'presetSelect', 'savePresetBtn', 'outputModeSelect', 'outputDirInput', 'outputDirWrap', 'outputDirBrowseBtn', 'audioSuffixesInput',
            'ffmpegPathInput', 'ffmpegBrowseBtn', 'ffmpegFolderBtn', 'ffmpegTestBtn', 'ffmpegStatus',
            'addMenuBtn', 'addMenu', 'addMenuWrap',
            'retryFailedBtn', 'pendingQueueBadge',
            'saveParamsBtn', 'saveParamsStatus',
            'jobStatusBadge', 'progressLabel', 'progressCount', 'progressBar',
            'currentFile', 'logHost',
            'removeSelectedBtn', 'clearListBtn', 'startBtn', 'selectAllCheck',
            'fileListBody', 'emptyListRow', 'stopBtn', 'filePanel', 'dropZone', 'dropOverlay',
            'openSubtitleFileBtn',
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
        const next = POST_TASK_SELECT_VALUES.has(action) ? action : 'none';
        state.postTaskAction = next;
        syncPostTaskMenuUi();
        syncPostTaskExtrasUi();
        syncPostTaskToMain();
    }

    function syncPostTaskMenuUi() {
        const action = getPostTaskAction();
        const label = POST_TASK_LABELS[action] || POST_TASK_LABELS.none;
        els.postTaskMenuBtn?.classList.toggle('active', action !== 'none');
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
        const set = new Set(String(value || 'srt,vtt,lrc').split(/[,;\s]+/).map((p) => p.trim().toLowerCase()));
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

    function switchParamsTab(tabId) {
        activeParamsTab = tabId || 'install';
        els.paramsTabBtns?.forEach((btn) => {
            const active = btn.dataset.tab === activeParamsTab;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        els.paramsTabPanels?.forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.tabPanel === activeParamsTab);
        });
    }

    function openParamsModal(tabId) {
        setPostTaskMenuOpen(false);
        setAddMenuOpen(false);
        savedOptionsSnapshot = buildSavedOptionsFromForm();
        switchParamsTab(tabId || activeParamsTab);
        els.paramsModal?.classList.remove('hidden');
        if ((tabId || activeParamsTab) === 'install') {
            global.TransubFeatures?.showInstallWizard?.();
        }
    }

    function closeParamsModal(restore = false) {
        if (restore && savedOptionsSnapshot) applyOptionsToForm(savedOptionsSnapshot);
        els.paramsModal?.classList.add('hidden');
        if (els.saveParamsStatus) {
            els.saveParamsStatus.textContent = '';
            els.saveParamsStatus.className = 'text-xs text-gray-500';
        }
    }

    function updateParamsSummary() {
        if (!els.paramsSummary) return;
        const device = els.deviceSelect?.value || 'cuda';
        const deviceLabel = DEVICE_LABELS[device] || device;
        const taskLabel = els.taskSelect?.value === 'transcribe' ? '仅转写' : '翻译';
        const overwriteLabel = els.overwriteCheck?.checked ? ' · 覆盖' : '';
        const formatLabel = readSubFormatsFromForm().replace(/,/g, '/');
        els.paramsSummary.textContent = `（${deviceLabel} · ${taskLabel} · ${formatLabel}${overwriteLabel}）`;
    }

    function applyOptionsToForm(options = {}) {
        if (els.installPathInput && options.installPath) {
            els.installPathInput.value = options.installPath;
        }
        if (els.deviceSelect && options.device) {
            els.deviceSelect.value = options.device;
        }
        if (els.taskSelect) {
            els.taskSelect.value = options.task === 'transcribe' ? 'transcribe' : 'translate';
        }
        if (els.overwriteCheck) {
            els.overwriteCheck.checked = !!options.overwrite;
        }
        applySubFormatsToForm(options.subFormats);
        if (els.modelPathInput && options.modelPath != null) {
            els.modelPathInput.value = options.modelPath;
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
        if (els.smartSplitWithVadCheck) {
            els.smartSplitWithVadCheck.checked = options.smartSplitWithVad !== false;
        }
        if (els.retranscribeWarmLightCheck) {
            els.retranscribeWarmLightCheck.checked = !!options.retranscribeWarmLight;
        }
        if (els.trayProgressCheck) {
            els.trayProgressCheck.checked = options.trayProgressEnabled !== false;
        }
        if (els.minimizeToTrayOnStartCheck) {
            els.minimizeToTrayOnStartCheck.checked = !!options.minimizeToTrayOnStart;
        }
        if (els.postBatchQcCheck) {
            els.postBatchQcCheck.checked = !!options.postBatchQc;
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
        syncBatchSizeUi();
        syncLogLevelHint();
        syncMergeUi();
        syncSmartSplitUi();
        updateParamsSummary();
    }

    function buildSavedOptionsFromForm() {
        return {
            installPath: els.installPathInput?.value.trim() || 'F:\\UltraTools\\TransWithAI',
            device: els.deviceSelect?.value || 'cuda',
            task: els.taskSelect?.value === 'transcribe' ? 'transcribe' : 'translate',
            overwrite: !!els.overwriteCheck?.checked,
            subFormats: readSubFormatsFromForm(),
            modelPath: els.modelPathInput?.value.trim() || '',
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
            smartSplitWithVad: !!els.smartSplitWithVadCheck?.checked,
            targetChunkDurationS: Number(els.targetChunkDurationInput?.value) || 30,
            retranscribeWarmLight: !!els.retranscribeWarmLightCheck?.checked,
            trayProgressEnabled: els.trayProgressCheck ? !!els.trayProgressCheck.checked : true,
            minimizeToTrayOnStart: !!els.minimizeToTrayOnStartCheck?.checked,
            postBatchQc: !!els.postBatchQcCheck?.checked,
            mergeSegments: !!els.mergeSegmentsCheck?.checked,
            mergeMaxGapMs: Number(els.mergeMaxGapInput?.value) || 2000,
            mergeMaxDurationMs: Number(els.mergeMaxDurationInput?.value) || 20000,
            outputMode: els.outputModeSelect?.value === 'custom' ? 'custom' : 'same',
            outputDir: resolveOutputDirFromForm(),
            audioSuffixes: els.audioSuffixesInput?.value.trim() || 'mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv',
            ffmpegPath: els.ffmpegPathInput?.value.trim() || '',
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
        } else if (els.transWithAiStatus) {
            els.transWithAiStatus.textContent = res?.error || '检测失败';
            els.transWithAiStatus.className = 'text-xs text-red-600';
        }
        return res;
    }

    async function testInstall() {
        const res = await refreshInstallStatus({ quick: false });
        if (res?.ok) appendLog(formatTransWithAiStatusText(res.version), 'ok');
        else appendLog(res?.error || 'TransWithAI 未就绪', 'err');
        global.TransubFeatures?.showInstallWizard?.();
    }

    function retryFailedItems() {
        if (state.running) return;
        let count = 0;
        state.items.forEach((item) => {
            if (item.status === 'failed') {
                item.status = 'ready';
                item.progress = 0;
                item.processedSec = 0;
                item.processedTotalSec = 0;
                item.detail = '';
                item.error = '';
                item.selected = true;
                count += 1;
            }
        });
        if (!count) return;
        renderList();
        updateStartButton();
        appendLog(`已选中 ${count} 个失败项，可点击开始重新处理`, 'info');
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
                setTimeout(() => closeParamsModal(false), 400);
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
        const hasFailed = state.items.some((i) => i.status === 'failed');
        if (els.retryFailedBtn) els.retryFailedBtn.classList.toggle('hidden', !hasFailed || state.running);
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
        return item.subtitlePath || item.existingSubtitle || '';
    }

    function showPathForItem(item) {
        return getSubtitlePathForItem(item) || item.path || '';
    }

    async function openItemInFolder(item) {
        const target = showPathForItem(item);
        if (!target) return;
        const res = await electron?.showInFolder?.(target);
        if (res?.ok === false && res?.error) {
            appendLog(res.error, 'err');
        }
    }

    function buildListRowHtml(item, idx) {
        const revealPath = showPathForItem(item);
        const subPath = getSubtitlePathForItem(item);
        const folderTitle = subPath
            ? `在文件夹中显示字幕：${basename(subPath)}`
            : `在文件夹中显示：${basename(item.path)}`;
        const detail = item.detail || item.error || '—';
        const subBadge = item.existingSubtitle && item.status === 'ready'
            ? '<span class="ml-1 text-amber-600" title="已有字幕">●</span>' : '';
        let qcCell = '<span class="text-gray-300">—</span>';
        if (item.qcError) {
            qcCell = `<span class="text-amber-600 text-xs" title="${esc(item.qcError)}">?</span>`;
        } else if (Number.isFinite(Number(item.qcIssueCount))) {
            const n = Number(item.qcIssueCount);
            const tip = esc(item.qcSummary || (n ? `${n} 项问题` : '通过'));
            qcCell = n > 0
                ? `<span class="inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5" title="${tip}">${n}</span>`
                : `<span class="text-emerald-600 text-xs" title="${tip}">✓</span>`;
        }
        const editBtn = subPath
            ? `<button type="button" data-edit-sub="${esc(subPath)}" data-edit-video="${esc(item.path)}" class="row-action-btn text-violet-500 hover:text-violet-700 hover:bg-violet-50" title="编辑字幕"><i class="fa fa-pencil text-xs"></i></button>` : '';
        return `
            <tr class="hover:bg-gray-50/80" data-idx="${idx}" data-path="${esc(normPath(item.path))}">
                <td class="px-2 py-1.5"><input type="checkbox" data-row-check ${item.selected ? 'checked' : ''} ${state.running ? 'disabled' : ''}></td>
                <td class="px-2 py-1.5 text-xs col-file"><div class="cell-ellipsis" title="${esc(item.path)}">${esc(basename(item.path))}${subBadge}</div></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums col-duration">${item.duration ? formatDuration(item.duration) : '—'}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-600 col-elapsed">${formatElapsedCell(item)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-600 col-processed">${formatProcessedCell(item)}</td>
                <td class="px-2 py-1.5 text-xs col-detail text-gray-500"><div class="cell-ellipsis" title="${esc(detail)}">${esc(detail)}</div></td>
                <td class="px-1 py-1.5 text-center text-xs">${qcCell}</td>
                <td class="px-1 py-1.5 text-center col-actions">
                    <div class="row-actions">
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
        if (!row) return false;
        const tmp = document.createElement('tbody');
        tmp.innerHTML = buildListRowHtml(item, idx).trim();
        const next = tmp.firstElementChild;
        if (!next) return false;
        row.replaceWith(next);
        bindListRowEvents(next);
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
            els.emptyListRow = document.createElement('tr');
            els.emptyListRow.id = 'emptyListRow';
            els.emptyListRow.innerHTML = '<td colspan="8" class="px-4 py-8 text-center text-gray-400 text-sm">点击「添加视频」选择文件，或将多个视频拖入此区域</td>';
            els.fileListBody.appendChild(els.emptyListRow);
            return;
        }

        els.fileListBody.innerHTML = state.items.map((item, idx) => buildListRowHtml(item, idx)).join('');
        bindListRowEvents(els.fileListBody);
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
        Object.assign(item, patch);
        if (!refreshListRow(item)) renderList();
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

    function computeDisplayProgress() {
        const cap = state.running ? 99 : 100;
        const itemPct = effectiveItemProgress(state.itemStage, state.videoProgress);
        const displayPct = Math.max(0, Math.min(cap, itemPct));
        const stageText = state.running ? stageLabel(state.itemStage) : '';
        const hasMediaTimeline = state.videoTotalSec >= 60 && state.itemStage === 'transcribe';
        if (hasMediaTimeline && displayPct > 0) {
            const timeline = `${formatDuration(state.videoCurrentSec)} / ${formatDuration(state.videoTotalSec)}`;
            return {
                pct: displayPct,
                label: stageText ? `${stageText} · ${timeline} · ${displayPct}%` : `${timeline} · ${displayPct}%`,
            };
        }
        if (state.total > 0 && state.index > 0) {
            const batchPct = Math.round(((state.index - 1) + displayPct / 100) / state.total * 100);
            const pct = Math.min(cap, batchPct);
            const batch = `第 ${state.index} / ${state.total} 个 · ${pct}%`;
            return { pct, label: stageText ? `${stageText} · ${batch}` : batch };
        }
        if (stageText) {
            return { pct: displayPct, label: displayPct > 0 ? `${stageText} · ${displayPct}%` : `${stageText}…` };
        }
        return { pct: displayPct, label: displayPct > 0 ? `${displayPct}%` : '处理中…' };
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
            const etaSec = computeEtaSec();
            const etaPart = etaApi?.formatEtaCompact
                ? ` · 剩余 ${etaApi.formatEtaCompact(etaSec)}`
                : '';
            countText = `${label} · 已用 ${elapsed}${etaPart}`;
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
            const task = els.taskSelect?.value === 'transcribe' ? 'transcribe' : 'translate';
            state.etaRate = etaApi.rateFromHistory(entries, { device, task })
                ?? etaApi.DEFAULT_WALL_FACTOR
                ?? 0.35;
        } catch {
            state.etaRate = etaApi.DEFAULT_WALL_FACTOR ?? 0.35;
        }
    }

    function syncVideoProgressFromPayload(p) {
        if (p.phase !== 'running') return;
        const stage = p.itemStage || 'transcribe';
        if (stageRank(stage) >= stageRank(state.itemStage)) {
            state.itemStage = stage;
        }
        // VAD / 加载模型等转写前阶段不计入进度百分比，也不写入时间轴
        if (isPreTranscribeStage(state.itemStage)) {
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
            resetVideoProgress();
            state.itemStage = 'starting';
        }

        if (path) {
            if (p.phase === 'running') {
                syncVideoProgressFromPayload(p);
                const existing = findItem(path);
                const stage = state.itemStage;
                const progress = isPreTranscribeStage(stage)
                    ? 0
                    : bumpProgress(existing?.progress, state.videoProgress);
                state.videoProgress = progress;
                const itemPatch = {
                    status: 'running',
                    progress,
                    detail: p.itemDetail || '处理中…',
                    stage,
                };
                if (isPreTranscribeStage(stage)) {
                    itemPatch.processedSec = 0;
                } else {
                    if (Number(p.videoTotalSec) > 0) {
                        itemPatch.processedTotalSec = Number(p.videoTotalSec);
                    }
                    if (Number(p.videoCurrentSec) > 0) {
                        itemPatch.processedSec = Number(p.videoCurrentSec);
                    }
                }
                if (!existing?.startedAt || p.itemStage === 'starting') {
                    itemPatch.startedAt = Date.now();
                }
                updateItem(path, itemPatch);
            } else if (p.phase === 'skipped') {
                const skippedPatch = {
                    status: 'skipped',
                    progress: 100,
                    detail: p.itemDetail || '已有字幕',
                    subtitlePath: p.subtitlePath,
                    existingSubtitle: p.subtitlePath,
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
                    subtitlePath: p.subtitlePath || undefined,
                    existingSubtitle: p.subtitlePath || undefined,
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
            const stage = stageLabel(state.itemStage);
            const detail = String(p.itemDetail || '').trim();
            els.progressLabel.textContent = detail ? `${stage} · ${detail}` : `${stage}…`;
            if (p.itemStage === 'starting') {
                appendLog(`处理中：${name}`, 'info');
            }
        } else if (p.phase === 'skipped') {
            state.skipped += 1;
            resetVideoProgress();
            els.progressLabel.textContent = '已跳过（已有字幕）';
            appendLog(`跳过：${name}`, 'warn');
        } else if (p.phase === 'done') {
            state.generated += 1;
            els.progressLabel.textContent = '本条已完成';
            appendLog(`完成：${name}${p.subtitlePath ? ` → ${basename(p.subtitlePath)}` : ''}`, 'ok');
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
            if (!sub) continue;
            if (item.subtitlePath !== sub) {
                item.subtitlePath = sub;
                changed = true;
            }
            if (item.status === 'done' || item.status === 'skipped') {
                item.existingSubtitle = sub;
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
        renderList();
    }

    async function onJobFinished(payload) {
        state.running = false;
        state.index = state.total;
        state.activePath = '';
        state.videoProgress = 100;
        state.itemStage = 'done';
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

        appendLog(`开始生成字幕 ${selected.length} 个文件…`, 'info');
        await refreshEtaRateFromHistory();
        const opts = buildRuntimeOptions();
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

        bindListActions();
        setupDragDrop();
        bindPostTaskMenu();
        bindAddMenu();
        els.removeSelectedBtn?.addEventListener('click', removeSelected);
        els.clearListBtn?.addEventListener('click', clearList);
        els.startBtn?.addEventListener('click', startSubtitleGeneration);
        els.selectAllCheck?.addEventListener('change', () => {
            const checked = els.selectAllCheck.checked;
            state.items.forEach((i) => { i.selected = checked; });
            renderList();
            updateStartButton();
        });
        els.saveParamsBtn?.addEventListener('click', saveParamsSettings);
        els.openParamsBtn?.addEventListener('click', () => openParamsModal('install'));
        els.closeParamsBtn?.addEventListener('click', () => closeParamsModal(true));
        els.cancelParamsBtn?.addEventListener('click', () => closeParamsModal(true));
        els.paramsModal?.addEventListener('click', (event) => {
            if (event.target === els.paramsModal) closeParamsModal(true);
        });
        els.paramsTabBtns?.forEach((btn) => {
            btn.addEventListener('click', () => switchParamsTab(btn.dataset.tab));
        });
        electron?.onOpenParams?.((payload) => {
            const tab = String(payload?.tab || 'editor').trim() || 'editor';
            openParamsModal(tab);
            void electron?.transubConsumePendingOpenParams?.();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !els.paramsModal?.classList.contains('hidden')) {
                closeParamsModal(true);
            }
        });
        els.installTestBtn?.addEventListener('click', testInstall);
        els.installBrowseBtn?.addEventListener('click', browseInstallPath);
        els.ffmpegBrowseBtn?.addEventListener('click', browseFfmpegPath);
        els.ffmpegFolderBtn?.addEventListener('click', browseFfmpegFolder);
        els.ffmpegTestBtn?.addEventListener('click', () => refreshFfmpegStatus({ quick: false }));
        els.installDownloadBtn?.addEventListener('click', openTransWithAiReleases);
        els.deviceSelect?.addEventListener('change', () => {
            syncBatchSizeUi();
            updateParamsSummary();
        });
        els.logLevelSelect?.addEventListener('change', syncLogLevelHint);
        els.taskSelect?.addEventListener('change', updateParamsSummary);
        els.overwriteCheck?.addEventListener('change', updateParamsSummary);
        ['subFormatSrt', 'subFormatVtt', 'subFormatLrc'].forEach((id) => {
            els[id]?.addEventListener('change', updateParamsSummary);
        });
        els.mergeSegmentsCheck?.addEventListener('change', syncMergeUi);
        els.smartSplitWithVadCheck?.addEventListener('change', syncSmartSplitUi);
        els.shutdownDelayInput?.addEventListener('change', syncPostTaskToMain);
        els.shutdownDelayInput?.addEventListener('click', (event) => event.stopPropagation());
        els.retryFailedBtn?.addEventListener('click', retryFailedItems);
        els.stopBtn?.addEventListener('click', stopTask);
        els.openSubtitleFileBtn?.addEventListener('click', () => {
            global.TransubSubtitleEditor?.pickAndOpen?.();
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

    async function runBackgroundStartupChecks() {
        try {
            await Promise.all([
                refreshFfmpegStatus({ quick: true, persist: false }),
                refreshInstallStatus({ quick: true }),
            ]);
        } catch (_) { /* ignore */ }

        // Full FFmpeg spawn check after UI is interactive (fills version string)
        const schedule = global.requestIdleCallback
            || ((cb) => setTimeout(() => cb({ didTimeout: false }), 1800));
        schedule(async () => {
            try {
                await refreshFfmpegStatus({ quick: false, persist: false });
            } catch (_) { /* ignore */ }
        }, { timeout: 2500 });
    }

    async function init() {
        cacheEls();
        bindEvents();
        setBadge('空闲', 'idle');
        syncBatchSizeUi();
        syncLogLevelHint();
        syncMergeUi();
        syncSmartSplitUi();
        syncPostTaskMenuUi();
        syncPostTaskExtrasUi();
        resetPostTaskSelect();
        renderList();
        updateStartButton();

        if (!isDesktop()) {
            appendLog('需在桌面版中使用', 'err');
            setLoading(false);
            return;
        }

        setLoading(true, '正在加载配置…');
        try {
            const optsRes = await electron?.transWithAiGetOptions?.();
            if (optsRes?.options) {
                applyOptionsToForm(optsRes.options);
                savedOptionsSnapshot = buildSavedOptionsFromForm();
            }
            resetPostTaskSelect();
            await syncPostTaskToMain();
        } finally {
            // Show main UI ASAP — FFmpeg / TransWithAI / GPU checks run in background
            setLoading(false);
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
        addFiles,
        renderList,
        updateStartButton,
        getSelectedItems,
        resolveOutputDirFromForm,
        state,
    };
}(window));
