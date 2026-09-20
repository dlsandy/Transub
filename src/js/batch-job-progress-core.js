/**
 * Batch job progress lifecycle (list rows, progress bar, job start/progress/finish).
 * Shell injects DOM/IPC/state via createBatchJobProgress(deps).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBatchJobProgress = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function batchJobProgressFactory() {
    /**
     * @param {object} deps shell adapters
     */
    function createBatchJobProgress(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const normPath = d.normPath || ((p) => String(p || ''));
        const findItem = d.findItem || (() => null);
        const renderList = d.renderList || (() => {});
        const refreshListRow = d.refreshListRow || (() => false);
        const updateStartButton = d.updateStartButton || (() => {});
        const updateQcBanner = d.updateQcBanner || (() => {});
        const clearItemQcFixed = d.clearItemQcFixed || (() => {});
        const countQcIssues = d.countQcIssues || (() => 0);
        const flushPendingQueue = d.flushPendingQueue || (() => {});
        const scheduleExternalImportIdleAfterBatch = d.scheduleExternalImportIdleAfterBatch || (() => {});
        const retryAllFailedItems = d.retryAllFailedItems || (() => {});
        const syncEngineModelsBrowseOnlyFromTaskState = d.syncEngineModelsBrowseOnlyFromTaskState || (async () => {});
        const syncResourceUsageMonitor = d.syncResourceUsageMonitor || (() => {});
        const startElapsedTicker = d.startElapsedTicker || (() => {});
        const stopElapsedTicker = d.stopElapsedTicker || (() => {});
        const taskLabelOf = d.taskLabelOf || ((t) => String(t || ''));
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => '');
        const resolveOutputDirFromForm = d.resolveOutputDirFromForm || (() => '');
        const formatDuration = d.formatDuration || ((s) => String(s || ''));
        const elapsedSecSince = d.elapsedSecSince || (() => 0);
        const setBadge = d.setBadge || (() => {});
        const setFocusedTaskPath = d.setFocusedTaskPath || (() => {});
        const trimTaskLog = d.trimTaskLog || (() => {});
        const updateTaskStation = d.updateTaskStation || (() => {});
        const clearQwenIslandBatchSticky = d.clearQwenIslandBatchSticky || (() => {});
        const computeDisplayProgress = d.computeDisplayProgress || (() => ({ pct: 0, label: '' }));
        const formatJobProgressLabel = d.formatJobProgressLabel || ((stage, detail) => String(detail || stage || ''));
        const stageLabel = d.stageLabel || ((s) => String(s || ''));
        const scrubProgressDetail = d.scrubProgressDetail || ((x) => String(x || ''));
        const bumpProgress = d.bumpProgress || ((cur, next) => Math.max(Number(cur) || 0, Number(next) || 0));
        const stageRank = d.stageRank || (() => 0);
        const isPreTranscribeStage = d.isPreTranscribeStage || (() => false);
        const inferProgress = d.inferProgress || {};
        const progressDisplayApi = d.progressDisplayApi || {};
        const jobProgressLogApi = d.jobProgressLogApi || {};
        const jobLogTrackers = d.jobLogTrackers || {};
        const etaApi = d.etaApi || null;
        const translateStyleApi = d.translateStyleApi || {};
        const rowRefreshAtByPath = d.rowRefreshAtByPath || new Map();
        const ROW_REFRESH_THROTTLE_MS = Number(d.ROW_REFRESH_THROTTLE_MS) || 1000;
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => ({}));
        const buildRuntimeOptions = d.buildRuntimeOptions || (() => ({}));
        const getUx = typeof d.getUx === 'function' ? d.getUx : () => null;
        const getContentProfileApi = d.getContentProfileApi || (() => null);
        const getFeaturesApi = d.getFeaturesApi || (() => null);
        const getBatchRecoveryApi = d.getBatchRecoveryApi
            || (() => (typeof globalThis !== 'undefined' ? globalThis.TransubBatchRecovery : null));

        /** Legacy progress nodes are hidden; still write safely if cacheEls missed them. */
        function resolveProgressDom(id) {
            const cached = els && els[id];
            if (cached) return cached;
            const doc = typeof document !== 'undefined' ? document : null;
            const live = doc?.getElementById?.(id) || null;
            if (live && els) els[id] = live;
            return live;
        }

        function setProgressLabelText(text) {
            const el = resolveProgressDom('progressLabel');
            if (el) el.textContent = text;
        }

        function setCurrentFileText(text, title) {
            const el = resolveProgressDom('currentFile');
            if (!el) return;
            el.textContent = text;
            if (title !== undefined) el.title = title;
        }

function updateItem(path, patch = {}) {
    const item = findItem(path);
    if (!item) return;
    const wasRunning = item.status === 'running';
    const terminal = patch.status === 'done' || patch.status === 'skipped'
        || patch.status === 'failed' || patch.status === 'cancelled' || patch.status === 'error';
    Object.assign(item, patch);
    const key = normPath(path);
    const nowRunning = item.status === 'running';
    // Entering/leaving running must rebuild the card so `.task-card-run` pipeline exists.
    const structureChange = wasRunning !== nowRunning || terminal;
    const throttleRow = nowRunning && state.running && !structureChange;
    if (throttleRow) {
        const now = Date.now();
        const last = rowRefreshAtByPath.get(key) || 0;
        if (now - last < ROW_REFRESH_THROTTLE_MS) {
            // Data updated; DOM refresh deferred to reduce progress-tick churn.
        } else {
            rowRefreshAtByPath.set(key, now);
            if (!refreshListRow(item, { light: true })) renderList();
        }
    } else {
        rowRefreshAtByPath.delete(key);
        if (!refreshListRow(item, { light: false })) renderList();
    }
    if (wasRunning && (patch.status === 'done' || patch.status === 'skipped')) {
        const idx = state.items.indexOf(item);
        const row = idx >= 0
            ? els.fileListBody?.querySelector(`tr[data-idx="${idx}"]`)
            : null;
        row?.classList.add('task-row-flash');
    }
}

function resetVideoProgress() {
    state.videoProgress = 0;
    state.videoCurrentSec = 0;
    state.videoTotalSec = 0;
    state.lastProgressBumpAt = 0;
    state.lastProgressBumpPct = 0;
    clearQwenIslandBatchSticky();
}

function isProgressIdle() {
    return !state.running
        && !state.postBatchBusy
        && !state.retranslateBusy
        && !state.qcFixing;
}

function resetJobProgressState() {
    resetVideoProgress();
    state.itemStage = '';
    state.itemDualPhase = null;
    state.index = 0;
    state.total = 0;
    state.activePath = '';
    state.jobStartedAt = 0;
    if (typeof jobProgressLogApi.clearTrackers === 'function') {
        jobProgressLogApi.clearTrackers(jobLogTrackers);
    } else {
        jobLogTrackers.lastStartKeyByPath?.clear();
        jobLogTrackers.lastStageByPath?.clear();
        jobLogTrackers.lastLogKeyByPath?.clear();
    }
}

function maybeAppendJobStageLog(path, p, name) {
    if (p.phase !== 'running' || !path) return;
    const payload = {
        fullPath: path,
        itemStage: p.itemStage || state.itemStage,
        itemDualPhase: p.itemDualPhase ?? state.itemDualPhase,
        itemDetail: p.itemDetail || p.detail || '',
    };
    const shouldLog = typeof jobProgressLogApi.shouldLogStageTransition === 'function'
        ? jobProgressLogApi.shouldLogStageTransition(jobLogTrackers, payload)
        : payload.itemStage === 'starting';
    if (!shouldLog) return;
    const line = typeof jobProgressLogApi.formatStageLogLine === 'function'
        ? jobProgressLogApi.formatStageLogLine({
            fileName: name,
            index: state.index,
            total: state.total,
            itemStage: payload.itemStage,
            itemDualPhase: payload.itemDualPhase,
            itemDetail: payload.itemDetail,
        }, {
            stageLabelFn: stageLabel,
            scrubDetailFn: scrubProgressDetail,
        })
        : `${stageLabel(payload.itemStage)}：${name}`;
    appendLog(line, 'info');
    if (typeof jobProgressLogApi.recordStageLog === 'function') {
        jobProgressLogApi.recordStageLog(jobLogTrackers, payload);
    }
}

function resolveIdleProgressLabel() {
    if (progressDisplayApi.resolveIdleProgressLabel) {
        return progressDisplayApi.resolveIdleProgressLabel(state.items);
    }
    const pending = state.items.some(
        (item) => item && (item.status === 'pending' || item.status === 'ready'),
    );
    return pending ? '等待执行任务...' : '等待新任务...';
}

function paintIdleProgressUi() {
    if (els.progressBar) els.progressBar.style.width = '0%';
    setProgressLabelText(resolveIdleProgressLabel());
    if (els.progressCount) els.progressCount.textContent = '0 / 0';
    setCurrentFileText('—', '');
    if (els.progressEta) {
        els.progressEta.textContent = '';
        els.progressEta.classList.add('hidden');
    }
}

function dismissLoadingOverlay() {
    state.loadingDepth = 0;
    const overlay = els.loadingOverlay
        || (typeof document !== 'undefined' ? document.getElementById('loadingOverlay') : null);
    if (overlay) {
        els.loadingOverlay = overlay;
        overlay.classList.add('hidden');
        overlay.classList.remove('flex', 'is-open');
        if (overlay.style) overlay.style.display = 'none';
    }
}

function computeEtaSec() {
    if (!etaApi?.estimateEtaSec || !state.running) return 0;
    const active = state.activePath ? findItem(state.activePath) : null;
    return etaApi.estimateEtaSec({
        items: state.items,
        activePath: state.activePath,
        videoCurrentSec: state.videoCurrentSec,
        videoTotalSec: state.videoTotalSec,
        itemStage: state.itemStage,
        itemProgress: state.videoProgress,
        activeStartedAt: active?.startedAt,
        lastProgressBumpAt: state.lastProgressBumpAt,
        rate: state.etaRate,
    });
}

let progressUiTimer = 0;

function paintProgressUi() {
    if (isProgressIdle()) {
        paintIdleProgressUi();
        return;
    }
    const { pct, label } = computeDisplayProgress();
    if (els.progressBar) els.progressBar.style.width = `${pct}%`;

    let countText = label;
    if (state.running && state.jobStartedAt) {
        const elapsed = formatDuration(elapsedSecSince(state.jobStartedAt));
        countText = uiTf('{label} · 已用 {elapsed}', { label, elapsed });
        const etaSec = computeEtaSec();
        if (els.progressEta) {
            const etaText = etaApi?.formatEtaCompact
                ? uiTf('预计剩余 {eta}', { eta: etaApi.formatEtaCompact(etaSec) })
                : '';
            els.progressEta.textContent = etaText;
            els.progressEta.classList.toggle('hidden', !etaText);
        }
    } else if (els.progressEta) {
        els.progressEta.textContent = '';
        els.progressEta.classList.add('hidden');
    }
    if (els.progressCount) els.progressCount.textContent = countText;
    if (state.running) updateTaskStation();
}

function updateProgressUi(opts = {}) {
    const force = opts.force === true;
    if (force) {
        if (progressUiTimer) {
            clearTimeout(progressUiTimer);
            progressUiTimer = 0;
        }
        paintProgressUi();
        return;
    }
    if (progressUiTimer) return;
    progressUiTimer = window.setTimeout(() => {
        progressUiTimer = 0;
        paintProgressUi();
    }, 300);
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
        const next = {
            path: fullPath,
            selected: true,
            status: 'pending',
            progress: 0,
            processedSec: 0,
            processedTotalSec: 0,
            detail: '等待中',
            duration: prev?.duration || 0,
            sense: prev?.sense || null,
            ...(translateStyleApi.pickItemStyleFields?.(prev) || {}),
        };
        if (prev?.senseAcoustic) next.senseAcoustic = prev.senseAcoustic;
        if (prev?.existingSubtitle) next.existingSubtitle = prev.existingSubtitle;
        // Preserve shelf translate entry (from 原文/转录) so the rail does not reset to 准备.
        if (prev?.fromShelf) next.fromShelf = true;
        if (prev?.shelfMediaId) next.shelfMediaId = prev.shelfMediaId;
        if (prev?.sourceSubtitlePath) next.sourceSubtitlePath = prev.sourceSubtitlePath;
        if (prev?.targetSubtitlePath) next.targetSubtitlePath = prev.targetSubtitlePath;
        if (prev?.subtitlePath) next.subtitlePath = prev.subtitlePath;
        const floor = Number(prev?.pipelineFloor);
        if (Number.isFinite(floor) && floor > 0) {
            next.pipelineFloor = floor;
            next.pipeHighWater = floor;
        }
        if (prev?.shelfEntryStage) next.shelfEntryStage = prev.shelfEntryStage;
        if (prev?.shelfSourceSlot) next.shelfSourceSlot = prev.shelfSourceSlot;
        if (prev?.skipAsr) next.skipAsr = true;
        if (prev?.shelfOptionOverrides) next.shelfOptionOverrides = prev.shelfOptionOverrides;
        if (prev?.stage && (prev.skipAsr || prev.shelfEntryStage || Number.isFinite(floor))) {
            next.stage = prev.stage;
        }
        return next;
    });
}

function onJobStart(payload) {
    dismissLoadingOverlay();
    state.batchStartInFlight = false;
    rowRefreshAtByPath.clear();
    state.total = Number(payload?.total) || 0;
    state.index = 0;
    state.generated = 0;
    state.skipped = 0;
    state.failed = 0;
    state.running = true;
    state.activePath = '';
    void syncEngineModelsBrowseOnlyFromTaskState();
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
    if (typeof jobProgressLogApi.clearTrackers === 'function') {
        jobProgressLogApi.clearTrackers(jobLogTrackers);
    }
    setBadge('运行中', 'running');
    // Always refresh the list even if legacy progress DOM is missing (hidden chrome).
    try {
        setProgressLabelText('正在排队处理…');
        setCurrentFileText('—', '');
    } catch { /* ignore */ }
    try {
        renderList();
    } catch (err) {
        console.warn('[batch] renderList on job start failed:', err?.message || err);
    }
    try {
        updateProgressUi({ force: true });
    } catch { /* ignore */ }
    updateStartButton();
    startElapsedTicker();
    syncResourceUsageMonitor();
    appendLog(
        typeof jobProgressLogApi.formatJobStartLine === 'function'
            ? jobProgressLogApi.formatJobStartLine(state.total, taskLabelOf(readTaskFromForm()))
            : `开始任务，共 ${state.total} 个文件`,
        'info',
    );
}

function onProgress(p) {
    if (!p) return;
    try {
        onProgressImpl(p);
    } catch (err) {
        console.warn('[batch] onProgress failed:', err?.message || err);
    }
}

function progressPathKey(fullPath) {
    return fullPath ? normPath(fullPath) : '';
}

function resetSharedProgressForNewQueueItem(payload, existing) {
    resetVideoProgress();
    state.itemDualPhase = payload.itemDualPhase || null;
    const floor = Number(existing?.pipelineFloor);
    if ((existing?.skipAsr || existing?.fromShelf || existing?.shelfEntryStage)
        && Number.isFinite(floor) && floor > 0) {
        state.itemStage = existing.shelfEntryStage || payload.itemStage || 'starting';
        return;
    }
    state.itemStage = payload.itemStage || 'starting';
}

function onProgressImpl(p) {
    // Engine SSE may emit done@100% before desktop post-task QC; keep batch running.
    if (p.phase === 'done' && state.running
        && !('qcIssueCount' in p) && p.qcFixedWritten == null
        && (p.itemStage === 'done' || Number(p.itemProgress) >= 97)) {
        p = {
            ...p,
            phase: 'running',
            itemStage: 'save',
            itemProgress: Math.min(97, Number(p.itemProgress) || 97),
            itemDetail: p.itemDetail ? `${p.itemDetail} · 收尾中…` : '收尾中…',
        };
    }
    const prevIndex = Number(state.index) || 0;
    const nextIndex = Number(p.index) || prevIndex;
    state.index = nextIndex;
    state.total = Number(p.total) || state.total;

    const name = basename(p.fullPath);
    const path = p.fullPath || '';
    const nextPathKey = progressPathKey(path);
    const prevPathKey = progressPathKey(state.activePath);
    const switchedByPath = !!(nextPathKey && prevPathKey && nextPathKey !== prevPathKey);
    // When activePath is still empty after item-1 done, path compare is false — use index.
    const switchedByIndex = !!(
        nextPathKey
        && prevIndex > 0
        && nextIndex > prevIndex
    );
    const switchedItem = switchedByPath || switchedByIndex;
    const existingItem = path ? findItem(path) : null;
    if (switchedItem) {
        resetSharedProgressForNewQueueItem(p, existingItem);
    }
    if (path) state.activePath = path;

    if (p.itemStage === 'starting') {
        const resumeTranslate = !switchedItem
            && p.itemDualPhase === 'translate'
            && (state.itemDualPhase === 'transcribe'
                || state.itemDualPhase === 'source'
                || state.itemStage === 'transcribe'
                || state.itemStage === 'semantic_repair');
        const itemAlreadyStarted = !switchedItem && !!existingItem?.startedAt;
        // 双语第二阶段（翻译）或语义校正后的翻译续跑，以及同一条目内的引擎重启/排队回退：不要清零进度/耗时
        if (!resumeTranslate && !itemAlreadyStarted) {
            if (!p.itemDualPhase || p.itemDualPhase === 'transcribe' || p.itemDualPhase === 'source') {
                resetVideoProgress();
            }
            state.itemStage = 'starting';
        }
        // Mid-job engine restart / QC re-queue: keep the furthest stage so the rail never snaps back.
        if (p.itemDualPhase) state.itemDualPhase = p.itemDualPhase;
    }

    if (path) {
        if (p.phase === 'running') {
            const prevProgress = state.videoProgress;
            syncVideoProgressFromPayload(p);
            if (Number(state.videoProgress) > Number(prevProgress)) {
                state.lastProgressBumpAt = Date.now();
                state.lastProgressBumpPct = state.videoProgress;
            }
            const existing = findItem(path);
            // Monotonic stage for UI: stageRank already applies inside sync, but also
            // refuse to publish a lower pipe stage than the item's high-water.
            let stage = state.itemStage;
            if (existing && stageRank(stage) < stageRank(existing.stage)) {
                stage = existing.stage;
                state.itemStage = stage;
            }
            const resumeTranslate = !switchedItem
                && p.itemDualPhase === 'translate'
                && (state.itemDualPhase === 'transcribe'
                    || state.itemDualPhase === 'source'
                    || state.itemStage === 'semantic_repair');
            const keepDualProgress = !!p.itemDualPhase
                && isPreTranscribeStage(stage)
                && Number.isFinite(Number(p.itemProgress));
            const keepEnginePrepProgress = isPreTranscribeStage(stage)
                && Number.isFinite(Number(p.itemProgress))
                && Number(p.itemProgress) > 0;
            const keepSemanticRepairProgress = stage === 'semantic_repair'
                && Number.isFinite(Number(p.itemProgress));
            const progress = isPreTranscribeStage(stage) && !keepDualProgress && !keepEnginePrepProgress && !resumeTranslate
                ? (p.itemDualPhase === 'translate'
                    ? bumpProgress(existing?.progress, state.videoProgress)
                    : 0)
                : bumpProgress(
                    existing?.progress,
                    keepSemanticRepairProgress
                        ? Number(p.itemProgress)
                        : state.videoProgress,
                );
            state.videoProgress = progress;
            // New run replaces subtitle — clear previous QC scan / fix markers
            clearItemQcFixed(existing, { clearScan: true });
            const itemPatch = {
                status: 'running',
                progress,
                detail: formatJobProgressLabel(stage, p.itemDetail || p.detail || ''),
                stage,
            };
            if (isPreTranscribeStage(stage) && !keepDualProgress && !keepEnginePrepProgress
                && p.itemDualPhase !== 'translate' && !resumeTranslate && stage !== 'semantic_repair') {
                itemPatch.processedSec = 0;
            } else {
                if (Number(p.videoTotalSec) > 0) {
                    itemPatch.processedTotalSec = Number(p.videoTotalSec);
                }
                if (Number(p.videoCurrentSec) > 0) {
                    itemPatch.processedSec = Number(p.videoCurrentSec);
                }
            }
            if (!existing?.startedAt) {
                itemPatch.startedAt = Date.now();
                const floor = Number(existing?.pipelineFloor);
                itemPatch.pipeHighWater = Number.isFinite(floor) && floor > 0 ? floor : 0;
            } else {
                // Never let a late re-ASR / unknown stage roll the rail backward.
                const factoryUi = (typeof globalThis !== 'undefined' && globalThis.TransubFactoryTaskUi)
                    || null;
                if (factoryUi?.resolvePipelineIndex) {
                    const preview = { ...existing, ...itemPatch };
                    itemPatch.pipeHighWater = factoryUi.resolvePipelineIndex(preview);
                } else {
                    const prev = Number(existing.pipeHighWater) || 0;
                    itemPatch.pipeHighWater = prev;
                }
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
                stage: 'done',
                detail: p.itemDetail || '完成',
                selected: false,
                subtitlePath: p.subtitlePath || undefined,
                existingSubtitle: p.subtitlePath || undefined,
                sourceSubtitlePath: p.sourceSubtitlePath || undefined,
                targetSubtitlePath: p.targetSubtitlePath || undefined,
                bilingualSubtitlePath: p.bilingualSubtitlePath || undefined,
            };
            if (p.qcIssueCount != null) {
                donePatch.qcIssueCount = Number(p.qcIssueCount) || 0;
                donePatch.qcSummary = Number(p.qcIssueCount) > 0 ? `QC ${donePatch.qcIssueCount} 项` : '';
                donePatch.qcError = '';
                if (donePatch.qcIssueCount > 0) state.qcBannerDismissed = false;
            }
            const fixedMode = String(p.qcFixedMode || '').trim();
            if (fixedMode === 'fix' || fixedMode === 'smart') {
                donePatch.qcFixedMode = fixedMode;
                donePatch.qcFixedWritten = p.qcFixedWritten !== false;
                donePatch.qcFixedSummary = String(p.qcFixedSummary || '').trim();
                donePatch.qcFixedAt = Date.now();
            }
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
            updateQcBanner();
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
                const recoveryApi = getBatchRecoveryApi();
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

    setCurrentFileText(
        path ? `${name}（${state.index}/${state.total}）` : '—',
        path || '',
    );

    if (p.phase === 'running') {
        setProgressLabelText(formatJobProgressLabel(state.itemStage, p.itemDetail));
        maybeAppendJobStageLog(path, p, name);
    } else if (p.phase === 'skipped') {
        state.skipped += 1;
        resetVideoProgress();
        setProgressLabelText('已跳过（已有字幕）');
        appendLog(`跳过：${name}`, 'warn');
    } else if (p.phase === 'done') {
        state.generated += 1;
        setProgressLabelText('本条已完成');
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
            setProgressLabelText('本条已取消');
            appendLog(`已取消：${name}`, 'warn');
        } else {
            state.failed += 1;
            setProgressLabelText('本条失败');
            appendLog(`失败：${name} — ${p.error || '未知错误'}`, 'err');
        }
    }

    try {
        updateProgressUi({ force: p.phase !== 'running' });
    } catch { /* ignore */ }
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

async function onJobFinished(payload) {
    const cancelled = !!payload?.cancelled;
    const finishedJobStartedAt = state.jobStartedAt;
    state.jobBackend = '';
    state.activePath = '';
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
    void syncEngineModelsBrowseOnlyFromTaskState();
    resetJobProgressState();
    syncResourceUsageMonitor();
    renderList();
    updateProgressUi({ force: true });
    updateStartButton();
    // Do not await path refresh before the completion dialog — that IPC can stall
    // while main is still reclaiming GPU/LLM after job-finished.
    void refreshSubtitlePathsForItems().catch(() => {});

    const failed = Number(payload?.failed) || state.failed;
    const finishError = String(payload?.error || '').trim();

    if (cancelled) {
        state.postBatchBusy = false;
        updateStartButton();
        setBadge('已停止', 'error');
        appendLog('任务已停止', 'warn');
        updateProgressUi({ force: true });
    } else {
        if (finishError) {
            appendLog(finishError, 'err');
        }
        setBadge(failed > 0 ? '已完成（有失败）' : '已完成', failed > 0 ? 'error' : 'done');
        appendLog(
            `任务结束：成功 ${payload?.generated ?? state.generated} · 跳过 ${payload?.skipped ?? state.skipped} · 失败 ${payload?.failed ?? state.failed}`,
            failed > 0 ? 'warn' : 'ok',
        );
        // Completion toast / tray notify / sound — post-task already ran per item in main process.
        try {
            try {
                // Only suggest reconstruct when the batch fully succeeded.
                if (failed === 0) {
                    const profileApi = getContentProfileApi();
                    const profile = state.lastContentProfile?.profile;
                    if (profileApi?.suggestPostReconstructMode && profile) {
                        const tip = profileApi.suggestPostReconstructMode({
                            profile,
                            task: getSavedOptionsSnapshot()?.task || buildRuntimeOptions().task,
                        });
                        if (tip?.message) appendLog(tip.message, 'info');
                    }
                }
            } catch { /* ignore */ }

            const qcIssues = countQcIssues();
            const totalElapsedSec = finishedJobStartedAt
                ? elapsedSecSince(finishedJobStartedAt)
                : 0;
            const totalElapsedText = totalElapsedSec > 0
                ? formatDuration(totalElapsedSec)
                : '';
            const generatedCount = Number(payload?.generated ?? state.generated) || 0;
            const summaryLines = [
                uiTf('成功 {ok} · 跳过 {skip} · 失败 {fail}', { ok: generatedCount, skip: payload?.skipped ?? state.skipped, fail: payload?.failed ?? state.failed }),
            ];
            if (qcIssues > 0) summaryLines.push(`${qcIssues} 条字幕存在 QC 问题`);
            if (finishError) summaryLines.push(finishError);
            const summaryText = summaryLines.join('\n');
            const donePaths = [...new Set(
                (state.items || [])
                    .filter((it) => String(it?.status || '') === 'done')
                    .map((it) => String(it?.path || '').trim())
                    .filter(Boolean),
            )];
            if (donePaths[0]) {
                setFocusedTaskPath(donePaths[0]);
            }
            try {
                const openShelf = !!els.shelfOpenAfterBatchCheck?.checked
                    || !!getSavedOptionsSnapshot()?.shelfOpenAfterBatch;
                if (openShelf && donePaths[0]) {
                    void getFeaturesApi()?.openSubtitleShelf?.({ mediaPath: donePaths[0] });
                }
            } catch { /* ignore */ }
            showToast(summaryText.split('\n')[0], failed > 0 || qcIssues > 0 ? 'warn' : 'ok');
            if (getUx()?.showBatchSummary) {
                void getUx().showBatchSummary({
                    title: failed > 0 ? '任务完成（有失败）' : '任务完成',
                    summaryText,
                    elapsedText: totalElapsedText,
                    primaryLabel: failed > 0 ? '重试失败项' : '',
                    secondaryLabel: '关闭',
                    tertiaryLabel: '',
                    onPrimary: failed > 0,
                    onTertiary: false,
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
                    summaryExtra: qcIssues > 0 ? uiTf('仍有 {n} 条 QC 问题', { n: qcIssues }) : '',
                });
            } catch (err) {
                appendLog(err?.message || '完成通知失败', 'warn');
            }
            state.postBatchBusy = false;
            updateStartButton();
            updateProgressUi({ force: true });
        }
    }

    setTimeout(() => {
        if (state.running || state.postBatchBusy) return;
        trimTaskLog(200);
    }, 5000);

    if (!cancelled) flushPendingQueue();
    scheduleExternalImportIdleAfterBatch();
}

        return {
            updateItem,
            resetVideoProgress,
            isProgressIdle,
            resetJobProgressState,
            maybeAppendJobStageLog,
            resolveIdleProgressLabel,
            paintIdleProgressUi,
            dismissLoadingOverlay,
            computeEtaSec,
            paintProgressUi,
            updateProgressUi,
            syncVideoProgressFromPayload,
            buildItemsFromPaths,
            onJobStart,
            onProgress,
            refreshSubtitlePathsForItems,
            onJobFinished,
        };
    }

    return { createBatchJobProgress };
}));
