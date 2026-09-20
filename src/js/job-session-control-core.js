/**
 * Job session chrome: badge, app log, start/stop busy strip, compute cancel, job IPC listeners.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJobSessionControl = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jobSessionControlFactory(global) {
    const LOG_DOM_MAX_DEFAULT = 100;

    /**
     * @param {object} deps shell adapters
     */
    function createJobSessionControl(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const factoryStatusBarApi = d.factoryStatusBarApi
            || (global && global.TransubFactoryStatusBar)
            || {};
        const computeBusyUiApi = d.computeBusyUiApi
            || (global && global.TransubComputeBusyUi)
            || {};
        const logDomMax = Number(d.logDomMax) > 0 ? Number(d.logDomMax) : LOG_DOM_MAX_DEFAULT;
        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const scrollMainLogPanel = d.scrollMainLogPanel || (() => {});
        const showToast = d.showToast || (() => {});
        const computeStartBlockReason = d.computeStartBlockReason || (() => '');
        const updateStartHint = d.updateStartHint || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const appConfirm = d.appConfirm || (async () => false);
        const ensureLogExpanded = d.ensureLogExpanded || (() => {});
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'engine');
        const syncComputeBusyFromMain = d.syncComputeBusyFromMain || (async () => !!state?.computeBusy);
        const clearStaleComputeBusyIfNeeded = d.clearStaleComputeBusyIfNeeded
            || (async () => ({ cleared: false, busy: !!state?.computeBusy }));
        const syncEngineModelsBrowseOnlyFromTaskState = d.syncEngineModelsBrowseOnlyFromTaskState || (() => {});
        const onJobStart = d.onJobStart || (() => {});
        const onProgress = d.onProgress || (() => {});
        const onJobFinished = d.onJobFinished || (() => {});
        const syncFocusedTaskRowHighlight = d.syncFocusedTaskRowHighlight || (() => {});

        let computeBusyStripTimer = null;
        /** Avoid duplicate app-log lines when compute lock toggles. */
        let computeBusyAppLogActive = false;
        let qwenAsrBatchHintInFlight = false;
        let jobListenersBound = false;

        function setBadge(text, tone) {
            const key = ['idle', 'running', 'done', 'error'].includes(tone) ? tone : 'idle';
            if (!els.jobStatusBadge) return;
            els.jobStatusBadge.textContent = text;
            els.jobStatusBadge.className = `factory-job-badge factory-job-badge--${key}`;
        }

        function getAppLogRenderer() {
            const host = els.logHost;
            if (!host) return null;
            const api = (global && global.TransubLogPanelRender) || null;
            if (!api?.getOrCreate) return null;
            return api.getOrCreate(host, {
                maxLines: logDomMax,
                lineClass: 'log-line',
                onAfterFlush(h, meta) {
                    if (!meta?.live) return;
                    const panel = h.closest?.('.log-panel') || h;
                    scrollMainLogPanel(panel);
                },
            });
        }

        function updateFactoryStatusLogFromHost() {
            const bodyEl = els.factoryStatusLogBody || (typeof document !== 'undefined'
                ? document.getElementById('factoryStatusLogBody')
                : null);
            const timeEl = els.factoryStatusLogTime || (typeof document !== 'undefined'
                ? document.getElementById('factoryStatusLogTime')
                : null);
            const btnEl = els.factoryStatusLogBtn || (typeof document !== 'undefined'
                ? document.getElementById('factoryStatusLogBtn')
                : null);
            if (!bodyEl) return;
            const host = els.logHost || (typeof document !== 'undefined'
                ? document.getElementById('logHost')
                : null);
            const renderer = getAppLogRenderer();
            const fromBuf = renderer?.getLastEntry?.()?.text;
            const last = !fromBuf
                ? (host?.querySelector?.('.log-line:last-of-type')
                    || host?.lastElementChild
                    || null)
                : null;
            const raw = String(fromBuf || last?.textContent || '').replace(/\s+/g, ' ').trim();
            let summary = factoryStatusBarApi.summarizeLatestLogLine
                ? factoryStatusBarApi.summarizeLatestLogLine(raw, 140)
                : null;
            if (!summary || typeof summary !== 'object') {
                summary = raw ? { time: '', body: raw, full: raw } : { time: '', body: '', full: '' };
            }
            if (!summary.full) {
                if (timeEl) timeEl.textContent = '';
                bodyEl.textContent = '暂无日志';
                btnEl?.removeAttribute('title');
                return;
            }
            if (timeEl) timeEl.textContent = summary.time || '';
            bodyEl.textContent = summary.body || summary.full;
            if (btnEl) btnEl.title = summary.full;
        }

        function appendLog(line, tone) {
            if (!els.logHost) return;
            const ts = new Date().toLocaleTimeString();
            const text = `[${ts}] ${line}`;
            const renderer = getAppLogRenderer();
            if (renderer) {
                renderer.append(text, { tone });
            } else {
                // Fallback when render core is missing (tests / partial boot).
                if (els.logHost.textContent === '日志将显示在此处…'
                    || els.logHost.textContent === 'Transub日志将显示在此处…'
                    || els.logHost.querySelector?.('.text-gray-400')) {
                    els.logHost.innerHTML = '';
                }
                const doc = typeof document !== 'undefined' ? document : null;
                if (!doc?.createElement) return;
                const row = doc.createElement('div');
                const colors = {
                    ok: 'text-emerald-700',
                    warn: 'text-amber-700',
                    err: 'text-red-700',
                    info: 'text-gray-600',
                };
                row.className = `log-line ${colors[tone] || colors.info}`;
                row.textContent = text;
                els.logHost.appendChild(row);
                while (els.logHost.childElementCount > logDomMax) {
                    els.logHost.removeChild(els.logHost.firstChild);
                }
                const panel = els.logHost.closest('.log-panel') || els.logHost;
                scrollMainLogPanel(panel);
            }
            updateFactoryStatusLogFromHost();
            if (!getIsStandaloneSettings() && (tone === 'err' || tone === 'warn')) {
                showToast(line, tone);
            }
        }

        /** Retranslate batch progress → 引擎日志 (same sink as engine-batch MT) */
        function appendRetranslateLog(line, tone, opts = {}) {
            const text = `[重新翻译] ${line}`;
            const features = global?.TransubFeatures;
            if (typeof features?.appendInferLog === 'function') {
                features.appendInferLog(text, tone);
                const wantToast = opts.toast !== false;
                if (wantToast && !getIsStandaloneSettings() && (tone === 'err' || tone === 'warn')) {
                    showToast(line, tone);
                }
                return;
            }
            appendLog(text, tone);
        }

        function activateAppLogTab() {
            global?.TransubFeatures?.activateLogTab?.('app');
        }

        function activateInferLogTab() {
            global?.TransubFeatures?.activateLogTab?.('infer');
        }

        function syncSelectionToolbarActions() {
            // Toolbar 理解重构 / 重新翻译 removed; style chip stays always visible.
            if (els.openSubtitleFileBtn) {
                els.openSubtitleFileBtn.hidden = false;
                els.openSubtitleFileBtn.removeAttribute('hidden');
            }
            if (els.setTranslateStyleBtn) {
                els.setTranslateStyleBtn.hidden = false;
                els.setTranslateStyleBtn.removeAttribute('hidden');
            }
            if (els.setTranslateStyleWrap) {
                els.setTranslateStyleWrap.hidden = false;
                els.setTranslateStyleWrap.removeAttribute('hidden');
            }
        }

        function updateComputeBusyStrip() {
            // Strip removed from main UI; cancel remains available via Stop when compute-busy.
            if (computeBusyStripTimer) {
                clearInterval(computeBusyStripTimer);
                computeBusyStripTimer = null;
            }
        }

        function updateStopButton() {
            if (els.stopBtn) {
                els.stopBtn.disabled = !(state.running || state.retranslateBusy || state.computeBusy);
            }
            updateComputeBusyStrip();
        }

        function updateStartButton() {
            const busy = state.running || state.postBatchBusy || state.retranslateBusy;
            const blockReason = computeStartBlockReason();
            if (els.startBtn) {
                // Keep HTML enabled so clicks still fire (toast block reason / force-release stale lock).
                // Visual + a11y blocked state uses class + aria-disabled (see docs/asr.md).
                els.startBtn.disabled = false;
                els.startBtn.classList.toggle('is-blocked', !!blockReason);
                els.startBtn.setAttribute('aria-disabled', blockReason ? 'true' : 'false');
                const label = els.startBtn.querySelector('span');
                if (label) {
                    const inTask = !!(busy || state.batchStartInFlight);
                    label.textContent = inTask ? uiTf('任务中') : uiTf('开始执行');
                }
            }
            if (els.setTranslateStyleBtn) els.setTranslateStyleBtn.disabled = !!busy;
            if (els.addMenuBtn) els.addMenuBtn.disabled = false;
            // Mid-run: allow add/remove of non-running rows; retranslate keeps list locked.
            const listEditLocked = !!state.retranslateBusy;
            const listEmpty = !(state.items && state.items.length);
            if (els.selectAllItemsBtn) els.selectAllItemsBtn.disabled = listEditLocked || listEmpty;
            if (els.clearListBtn) els.clearListBtn.disabled = listEditLocked;
            if (els.selectAllCheck) els.selectAllCheck.disabled = listEditLocked || listEmpty;
            updateStopButton();
            updateStartHint();
            syncSelectionToolbarActions();
        }

        function updateAsrWindowTip() {
            if (!els.asrWindowTip) return;
            const asrId = String(els.engineAsrModelSelect?.value || '').trim();
            const parts = [];
            const windowTip = (global?.TransubAsrSettings?.describeWindowedAsrTip
                || computeBusyUiApi.describeWindowedAsrTip
                || (() => ({ visible: false, text: '' })))(asrId);
            if (windowTip?.visible && windowTip?.text) parts.push(windowTip.text);
            const qwenTip = global?.TransubAsrSettings?.describeQwenAsrRuntimeTip?.(asrId);
            if (qwenTip?.visible && qwenTip?.text) parts.push(qwenTip.text);
            const visible = parts.length > 0;
            els.asrWindowTip.classList.toggle('hidden', !visible);
            els.asrWindowTip.textContent = visible ? parts.join(' ') : '';
        }

        async function updateQwenAsrBatchHint() {
            if (!els.qwenAsrBatchHint) return;
            const core = global?.TransubQwenAsrBatch;
            const asr = String(els.engineAsrModelSelect?.value || '').trim();
            if (!core?.formatQwenAsrBatchHintText || !core?.isQwenAsrModel?.(asr)) {
                els.qwenAsrBatchHint.classList.add('hidden');
                els.qwenAsrBatchHint.textContent = '';
                return;
            }
            let gpuFreeMiB;
            let gpuTotalMiB;
            if (electron?.transubGetSystemResources && !qwenAsrBatchHintInFlight) {
                qwenAsrBatchHintInFlight = true;
                try {
                    const sample = await electron.transubGetSystemResources({ includeGpu: true });
                    const gpu = sample?.gpu;
                    if (gpu?.memTotalMiB > 0) {
                        gpuTotalMiB = gpu.memTotalMiB;
                        gpuFreeMiB = Math.max(0, gpu.memTotalMiB - (gpu.memUsedMiB || 0));
                    }
                } catch {
                    /* ignore transient IPC errors */
                } finally {
                    qwenAsrBatchHintInFlight = false;
                }
            }
            const hint = core.formatQwenAsrBatchHintText({
                engineAsrModel: asr,
                qwenAsrBatchMode: els.qwenAsrBatchModeSelect?.value || 'auto',
                perfProfile: els.perfProfileSelect?.value || 'quality',
                device: els.deviceSelect?.value || 'cuda',
                gpuFreeMiB,
                gpuTotalMiB,
            });
            if (!hint.visible) {
                els.qwenAsrBatchHint.classList.add('hidden');
                els.qwenAsrBatchHint.textContent = '';
                return;
            }
            els.qwenAsrBatchHint.textContent = hint.text;
            els.qwenAsrBatchHint.classList.remove('hidden');
        }

        async function cancelComputeBusyTask() {
            if (!state.computeBusy && !state.running && !state.retranslateBusy) return;
            const ok = await appConfirm({
                title: '取消算力任务',
                message: state.computeBusyLabel
                    ? uiTf('确定取消正在运行的「{label}」？', { label: state.computeBusyLabel })
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
            // Cancel stops jobs but does not release orphaned holders; clear when main is idle.
            if (state.computeBusy && !state.running && !state.postBatchBusy && !state.retranslateBusy) {
                const cleared = await clearStaleComputeBusyIfNeeded();
                if (cleared?.cleared) {
                    const msg = cleared.before?.label
                        ? uiTf('已清除卡住的算力锁（{label}）', { label: cleared.before.label })
                        : '已清除卡住的算力锁';
                    appendLog(msg, 'warn');
                    showToast(msg, 'warn');
                }
            }
            updateStopButton();
            updateStartButton();
            void syncEngineModelsBrowseOnlyFromTaskState();
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

        /**
         * Row stop: cancel only the in-flight file; remaining queue keeps running.
         * @param {number} idx
         */
        async function stopSingleItem(idx) {
            if (!state.running || state.retranslateBusy) return;
            const item = state.items[idx];
            if (!item || String(item.status || '') !== 'running') return;
            const basename = d.basename || ((p) => {
                const s = String(p || '').trim();
                if (!s) return '';
                const parts = s.split(/[/\\]/);
                return parts[parts.length - 1] || s;
            });
            const name = basename(item.path) || '本条';
            const ok = await appConfirm({
                title: '停止本条任务',
                message: uiTf('确定停止「{name}」？其余任务将继续处理。', { name }),
                primaryLabel: '停止本条',
                secondaryLabel: '继续运行',
                danger: true,
            });
            if (!ok) return;
            ensureLogExpanded();
            activateAppLogTab();
            appendLog(uiTf('正在停止本条：{name}…', { name }), 'warn');
            const backend = state.jobBackend || readEngineBackendFromForm();
            let res = backend === 'twai'
                ? await electron?.transWithAiCancelCurrent?.()
                : await electron?.transubEngineCancelCurrent?.();
            if (!(res?.cancelled || res?.ok)) {
                res = backend === 'twai'
                    ? await electron?.transubEngineCancelCurrent?.()
                    : await electron?.transWithAiCancelCurrent?.();
            }
            if (!(res?.cancelled || res?.ok)) {
                appendLog(res?.error || '停止本条失败', 'err');
            }
        }

        function bindJobEventListeners() {
            if (!electron || jobListenersBound) return;
            jobListenersBound = true;
            electron.onSubtitleTaskJobStart?.((payload) => onJobStart(payload));
            electron.onTransWithAiProgress?.((payload) => onProgress(payload));
            electron.onSubtitleTaskJobFinished?.((payload) => {
                onJobFinished(payload);
                if (state.focusedTaskPath) syncFocusedTaskRowHighlight();
            });
            electron.onTransubComputeTaskChanged?.((payload) => {
                const wasBusy = computeBusyAppLogActive;
                const isBusy = !!payload?.busy;
                state.computeBusy = isBusy;
                state.computeBusyLabel = isBusy
                    ? String(payload.label || payload.kind || '').trim()
                    : '';
                state.computeBusySince = isBusy
                    ? (Number(payload.since) || state.computeBusySince || Date.now())
                    : 0;
                state.computeBusyOwner = isBusy ? String(payload.owner || '').trim() : '';
                state.computeBusyKind = isBusy ? String(payload.kind || '').trim() : '';
                if (isBusy && !wasBusy && !state.running && !state.retranslateBusy) {
                    const label = state.computeBusyLabel || state.computeBusyKind || '计算任务';
                    appendLog(`[任务] 开始：${label}`, 'info');
                    ensureLogExpanded();
                    activateAppLogTab();
                } else if (!isBusy && wasBusy && !state.running && !state.retranslateBusy) {
                    appendLog('[任务] 结束', 'info');
                }
                computeBusyAppLogActive = isBusy;
                updateStartButton();
                updateStopButton();
                void syncEngineModelsBrowseOnlyFromTaskState();
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
                        computeBusyAppLogActive = true;
                        updateStartButton();
                        updateStopButton();
                        void syncEngineModelsBrowseOnlyFromTaskState();
                    }
                } catch { /* ignore */ }
            })();
        }

        return {
            setBadge,
            updateFactoryStatusLogFromHost,
            appendLog,
            appendRetranslateLog,
            activateAppLogTab,
            activateInferLogTab,
            updateStartButton,
            syncSelectionToolbarActions,
            updateStopButton,
            updateComputeBusyStrip,
            updateAsrWindowTip,
            updateQwenAsrBatchHint,
            cancelComputeBusyTask,
            stopTask,
            stopSingleItem,
            bindJobEventListeners,
        };
    }

    return { createJobSessionControl };
}));
