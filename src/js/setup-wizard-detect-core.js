/**
 * Setup wizard detect/runtime: TransubEnvCheck adapter, overview chips, CUDA gating.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardDetect = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardDetectFactory(global) {
    /** Software deps that must be green before leaving the prepare step. */
    const PREPARE_GATE_IDS = Object.freeze([
        'installPath', 'ffmpeg', 'vcRedist', 'engine', 'gpuRuntime', 'llamaServerRuntime',
        'torchEngineStartup',
    ]);

    function listPrepareBlockers(result) {
        const items = Array.isArray(result?.items) ? result.items : [];
        const byId = new Set(PREPARE_GATE_IDS);
        return items.filter((it) => {
            if (!it || !byId.has(it.id)) return false;
            return it.status === 'fail' || it.status === 'warn';
        });
    }

    function isPrepareEnvComplete(result) {
        if (!result) return false;
        if (result.fix?.fixable) return false;
        return listPrepareBlockers(result).length === 0;
    }

    function mergeChipStates(...infos) {
        const list = infos.filter(Boolean);
        if (!list.length) return { state: 'busy', label: '待检测' };
        if (list.some((x) => x.state === 'fail' || x.state === 'error' || x.state === 'err')) {
            const bad = list.find((x) => x.state === 'fail' || x.state === 'error' || x.state === 'err');
            return { state: 'err', label: bad.label || '需修复' };
        }
        if (list.some((x) => x.state === 'busy' || x.state === 'checking')) {
            return { state: 'busy', label: '检测中…' };
        }
        if (list.some((x) => x.state === 'warn')) {
            const warn = list.find((x) => x.state === 'warn');
            return { state: 'warn', label: warn.label || '注意' };
        }
        if (list.every((x) => x.state === 'ok')) {
            return { state: 'ok', label: list.map((x) => x.label).filter(Boolean)[0] || '正常' };
        }
        return list[0];
    }

    /**
     * @param {object} deps
     */
    function createSetupWizardDetect(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = d.electron;
        const uiTf = d.uiTf || ((t) => t);
        const uiTx = d.uiTx || ((t) => t);
        const appConfirmMsg = d.appConfirmMsg || (async (m) => !!(typeof window !== 'undefined' && window.confirm(m)));
        const getState = d.getState || (() => ({}));
        const readGoals = d.readGoals || (() => ({}));
        const enginePayloadFromForm = d.enginePayloadFromForm || (() => ({}));
        const defaultAsrFor = d.defaultAsrFor || (() => 'sensevoice-small');
        const senseIsAdopted = d.senseIsAdopted || (() => false);
        const syncModelSelects = d.syncModelSelects || (() => {});
        const syncWizardDeviceSelect = d.syncWizardDeviceSelect || (() => {});
        const getSteps = d.getSteps || (() => ['detect']);
        const resolveWizardAsrHint = d.resolveWizardAsrHint || (() => 'sensevoice-small');

        function envApi() {
            return global.TransubEnvCheck;
        }

        function detectScopeFromStep(stepId) {
            if (stepId === 'runtime') return 'runtime';
            if (stepId === 'env' || stepId === 'prepare') return stateDetectActiveScope();
            return 'base';
        }

        function stateDetectActiveScope() {
            try {
                return getState().detect?.activeScope === 'runtime' ? 'runtime' : 'base';
            } catch {
                return 'base';
            }
        }

        function detectUi(scope) {
            const runtime = scope === 'runtime';
            return {
                scope: runtime ? 'runtime' : 'base',
                list: $(runtime ? 'setupWizardRuntimeList' : 'setupWizardDetectList'),
                status: $(runtime ? 'setupWizardRuntimeStatus' : 'setupWizardDetectStatus'),
                fixHint: $(runtime ? 'setupWizardRuntimeFixHint' : 'setupWizardFixHint'),
                fixBtn: $(runtime ? 'setupWizardRuntimeFixBtn' : 'setupWizardPrepareFixBtn')
                    || $(runtime ? 'setupWizardRuntimeFixBtn' : 'setupWizardFixBtn'),
                hideFixWhenIdle: true,
                fixIdleLabel: '自动修复',
                manualBtn: $(runtime ? 'setupWizardRuntimeManualBtn' : 'setupWizardManualBtn'),
                retryBtn: $(runtime ? 'setupWizardRuntimeRetryBtn' : 'setupWizardRetryDetectBtn'),
                resultKey: runtime ? 'runtimeResult' : 'envResult',
                waitMessage: runtime ? '正在按听写推荐检查运行库…' : '正在检查本机依赖…',
                checkingText: runtime ? '正在检查听写运行库…' : '正在检查依赖项…',
            };
        }

        function getDetectResult(scope) {
            const state = getState();
            return scope === 'runtime' ? state.detect.runtimeResult : state.detect.envResult;
        }

        function setDetectResult(scope, result) {
            const state = getState();
            if (scope === 'runtime') state.detect.runtimeResult = result;
            else state.detect.envResult = result;
        }

        function chipStateFromItem(item) {
            if (!item) return { state: 'busy', label: '待检测' };
            if (item.status === 'ok') return { state: 'ok', label: item.detail || '正常' };
            if (item.status === 'warn') return { state: 'warn', label: item.detail || '警告' };
            if (item.status === 'fail') return { state: 'err', label: item.detail || '失败' };
            if (item.status === 'checking') return { state: 'busy', label: '检测中…' };
            return { state: 'busy', label: item.detail || '待检测' };
        }

        function setWizardChip(which, info) {
            const map = {
                engine: { chip: 'wizardDetectChipEngine', state: 'wizardDetectChipEngineState' },
                gpu: { chip: 'wizardDetectChipGpu', state: 'wizardDetectChipGpuState' },
                llama: { chip: 'wizardDetectChipLlama', state: 'wizardDetectChipLlamaState' },
                runtimeAsr: { chip: 'wizardRuntimeChipAsr', state: 'wizardRuntimeChipAsrState' },
                runtimeVad: { chip: 'wizardRuntimeChipVad', state: 'wizardRuntimeChipVadState' },
                runtimeGpu: { chip: 'wizardRuntimeChipGpu', state: 'wizardRuntimeChipGpuState' },
            };
            const ids = map[which];
            if (!ids) return;
            const chip = $(ids.chip);
            const stateEl = $(ids.state);
            const state = String(info.state || '').trim() || 'busy';
            const label = String(info.label || '').trim();
            if (chip) chip.setAttribute('data-state', state);
            if (stateEl && label) stateEl.textContent = label;
        }

        function setPrepareChip(kind, info) {
            const map = {
                base: { chip: 'wizardPrepareChipBase', state: 'wizardPrepareChipBaseState' },
                engine: { chip: 'wizardPrepareChipEngine', state: 'wizardPrepareChipEngineState' },
                accel: { chip: 'wizardPrepareChipAccel', state: 'wizardPrepareChipAccelState' },
            };
            const ids = map[kind];
            if (!ids) return;
            const chip = $(ids.chip);
            const stateEl = $(ids.state);
            const state = String(info?.state || '').trim() || 'busy';
            const label = String(info?.label || '').trim();
            if (chip) chip.setAttribute('data-state', state);
            if (stateEl && label) stateEl.textContent = label;
        }

        function syncOverviewChips(scope) {
            const state = getState();
            const base = state.detect.envResult;
            const runtime = state.detect.runtimeResult;
            const baseItems = base?.items || [];
            const runtimeItems = runtime?.items || [];
            const engineItem = baseItems.find((it) => it.id === 'engine');
            const gpuItem = baseItems.find((it) => it.id === 'gpu')
                || baseItems.find((it) => it.id === 'gpuRuntime');
            const llamaItem = baseItems.find((it) => it.id === 'llamaServerRuntime');
            const pathItem = baseItems.find((it) => it.id === 'installPath');
            const ffmpegItem = baseItems.find((it) => it.id === 'ffmpeg');
            const vcItem = baseItems.find((it) => it.id === 'vcRedist');
            const asrItem = runtimeItems.find((it) => it.id === 'asrModel');
            const vadItem = runtimeItems.find((it) => it.id === 'vadModel')
                || runtimeItems.find((it) => it.id === 'sensevoiceRuntime')
                || runtimeItems.find((it) => it.id === 'whisperRuntime');
            const runtimeGpuItem = runtimeItems.find((it) => it.id === 'gpuRuntime')
                || baseItems.find((it) => it.id === 'gpuRuntime');
            const torchStartupItem = runtimeItems.find((it) => it.id === 'torchEngineStartup')
                || baseItems.find((it) => it.id === 'torchEngineStartup');

            if (scope === 'base' || base) {
                setWizardChip('engine', chipStateFromItem(engineItem));
                setWizardChip('gpu', chipStateFromItem(gpuItem));
                setWizardChip('llama', chipStateFromItem(llamaItem));
            }
            if (scope === 'runtime' || runtime) {
                setWizardChip('runtimeAsr', chipStateFromItem(asrItem));
                setWizardChip('runtimeVad', chipStateFromItem(vadItem));
                setWizardChip('runtimeGpu', chipStateFromItem(runtimeGpuItem));
            }

            setPrepareChip('base', mergeChipStates(
                chipStateFromItem(pathItem),
                chipStateFromItem(ffmpegItem),
                chipStateFromItem(vcItem),
            ));
            // Model / runtime rows are checked on demand; missing items must not keep chips "busy".
            setPrepareChip('engine', mergeChipStates(
                chipStateFromItem(engineItem),
                asrItem ? chipStateFromItem(asrItem) : null,
                vadItem ? chipStateFromItem(vadItem) : null,
            ));
            setPrepareChip('accel', mergeChipStates(
                chipStateFromItem(gpuItem),
                chipStateFromItem(llamaItem),
                runtimeGpuItem ? chipStateFromItem(runtimeGpuItem) : null,
                torchStartupItem && !torchStartupItem.skipped
                    ? chipStateFromItem(torchStartupItem)
                    : null,
            ));
        }

        function prepareAllowsNext() {
            const state = getState();
            if (state.detecting || state.fixing) return false;
            return isPrepareEnvComplete(getDetectResult('base'));
        }

        async function runPrepareDetect(opts = {}) {
            const state = getState();
            const force = opts.force === true;
            if (state.detecting || state.fixing) return getDetectResult('base');
            // Entering prepare used to call showStep after detect → onEnter → detect again.
            // Cache a successful/finished base result unless the user clicks「重新检测」.
            if (!force && state.detect?.envResult) {
                syncOverviewChips('base');
                syncPrepareBlockerStatus();
                return state.detect.envResult;
            }
            // Runtime list is hidden on the unified prepare step; models download next.
            // One base pass is enough for gate + overview chips.
            return runDetect({ scope: 'base' });
        }

        async function runPrepareFix() {
            const state = getState();
            const api = envApi();
            if (state.fixing) {
                api?.requestCancelFix?.();
                const status = $('setupWizardDetectStatus');
                if (status) status.textContent = uiTx('正在取消修复…');
                return { ok: false, cancelling: true };
            }
            if (!api?.runAutoFixSession || state.detecting) {
                if (state.detecting) {
                    const status = $('setupWizardDetectStatus');
                    if (status) status.textContent = uiTx('正在检测或修复中，请稍候…');
                }
                return;
            }

            // Base-scope fix plans only carry runtime packages (e.g. whisper-tiny for
            // CTranslate2 / GPU). ASR weight downloads belong to the downloads step and
            // are not present here — do not strip modelIds or GPU/CT2 repair is skipped.
            const runScoped = async (resolved) => {
                const ui = detectUi(resolved);
                state.detect.activeScope = resolved;
                return api.runAutoFixSession({
                    startMode: 'auto',
                    getResult: () => getDetectResult(resolved),
                    setResult: (r) => { setDetectResult(resolved, r); },
                    setSubtitle: (t) => {
                        if (ui.status) ui.status.textContent = t;
                        const prep = $('setupWizardDetectStatus');
                        if (prep && resolved === 'base') prep.textContent = t;
                    },
                    setBusy: (b) => setDetectBusy(b, resolved),
                    setFixHintVisible: (v) => {
                        if (ui.fixHint) ui.fixHint.classList.toggle('hidden', !v);
                    },
                    fixBtn: $('setupWizardPrepareFixBtn') || ui.fixBtn,
                    manualBtn: ui.manualBtn,
                    fixHintEl: ui.fixHint,
                    downloadPayload: {
                        engineInstallPath: enginePayloadFromForm().engineInstallPath,
                        engineUrl: enginePayloadFromForm().engineUrl,
                        ...(global.TransubPipMirrorUi?.downloadPayloadPatch?.() || {}),
                    },
                    setFixing: (v) => { state.fixing = !!v; },
                    isFixing: () => state.fixing,
                    isRunning: () => state.detecting,
                    recheck: async (opts) => {
                        if (opts?.duringFix && ui.status) {
                            ui.status.textContent = '本轮修复完成，正在重新检测…';
                        }
                        return runDetect({ duringFix: !!opts?.duringFix, scope: resolved });
                    },
                    onDone: () => {
                        state.fixing = false;
                        setDetectBusy(false, resolved);
                    },
                });
            };

            const res = await runScoped('base');
            if (res?.error === 'nothing_fixable') {
                await appConfirmMsg(
                    uiTx('当前没有可自动修复的项。若 llama-server 未安装，请先点「重新检测」。'),
                    {
                        title: uiTx('无法自动修复'),
                        primaryLabel: uiTx('知道了'),
                        hideSecondary: true,
                    },
                );
            }
            return res;
        }

        function syncFromResults({ envResult, runtimeResult } = {}) {
            const state = getState();
            if (envResult) state.detect.envResult = envResult;
            if (runtimeResult) state.detect.runtimeResult = runtimeResult;
            syncOverviewChips(envResult ? 'base' : (runtimeResult ? 'runtime' : undefined));
            gateReuseCudaButtons(!!state.detect.engineOk);
        }

        function setEngineGatedActionsEnabled(on) {
            gateReuseCudaButtons(on);
        }

        function bindOverviewChipClicks() {
            const modal = $('setupWizardModal');
            if (!modal) return;
            modal.querySelectorAll('.settings-env-chip[data-env-target]').forEach((chip) => {
                if (chip.dataset.wizardChipBound === '1') return;
                chip.dataset.wizardChipBound = '1';
                chip.addEventListener('click', () => {
                    const targetId = chip.getAttribute('data-env-target');
                    const el = targetId ? $(targetId) : null;
                    if (!el) return;
                    try {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch {
                        el.scrollIntoView();
                    }
                    el.classList.add('is-env-flash');
                    setTimeout(() => el.classList.remove('is-env-flash'), 700);
                });
            });
        }

        async function guardEngineAction(run) {
            const state = getState();
            if (state.detect?.engineOk) {
                return typeof run === 'function' ? run() : { ok: true };
            }
            await appConfirmMsg(uiTx('请先通过「检查电脑」中的引擎底座检测，再执行 GPU / CUDA 相关操作。'), {
                title: uiTx('请先检测引擎'),
                primaryLabel: uiTx('知道了'),
                hideSecondary: true,
            });
            return { ok: false, blocked: true };
        }

        function gateReuseCudaButtons(engineOk) {
            const ready = !!engineOk;
            const tip = ready ? '' : '请先完成「① Transub引擎」检测通过后再复用 CUDA';
            const roots = [];
            const modal = $('setupWizardModal');
            if (modal) roots.push(modal);
            roots.forEach((root) => {
                root.querySelectorAll('[data-requires-engine="1"]').forEach((el) => {
                    if (!el || typeof el !== 'object') return;
                    if (!el.dataset) el.dataset = {};
                    if (!el.dataset.baseTitle) {
                        const current = typeof el.getAttribute === 'function'
                            ? (el.getAttribute('title') || '')
                            : '';
                        el.dataset.baseTitle = current.includes('请先完成') ? '' : current;
                    }
                    el.disabled = !ready;
                    const base = el.dataset.baseTitle || '';
                    if (ready) {
                        if (base && typeof el.setAttribute === 'function') el.setAttribute('title', base);
                        else if (typeof el.removeAttribute === 'function') el.removeAttribute('title');
                    } else if (typeof el.setAttribute === 'function') {
                        el.setAttribute('title', tip);
                    }
                });
            });
        }

        function detectAllowsNext(scope) {
            const state = getState();
            if (state.detecting || state.fixing) return false;
            return !!getDetectResult(scope)?.ok;
        }

        function setDetectBusy(busy, scope) {
            const state = getState();
            const active = scope || state.detect.activeScope || 'base';
            const ui = detectUi(active);
            if (ui.retryBtn) ui.retryBtn.disabled = !!busy;
            envApi()?.applyFixButtons?.(ui.fixBtn, ui.manualBtn, getDetectResult(active), {
                busy: !!busy,
                fixing: state.fixing,
                hideWhenIdle: ui.hideFixWhenIdle !== false,
                idleLabel: ui.fixIdleLabel,
            });
            // Keep「手动修复」visible whenever auto-fix is shown (or when manual is allowed).
            try {
                const fixBtn = ui.fixBtn;
                const manualBtn = ui.manualBtn;
                if (manualBtn && fixBtn && !fixBtn.classList.contains('hidden')) {
                    manualBtn.classList.remove('hidden');
                }
            } catch { /* ignore */ }
            const nextBtn = $('setupWizardNextBtn');
            const backBtn = $('setupWizardBackBtn');
            const steps = getSteps();
            const stepId = steps[state.stepIndex];
            if (nextBtn && (stepId === 'detect' || stepId === 'runtime' || stepId === 'env' || stepId === 'prepare')) {
                if (busy) nextBtn.disabled = true;
                else if (stepId === 'prepare') {
                    const ok = prepareAllowsNext();
                    nextBtn.disabled = !ok;
                    nextBtn.title = ok ? '' : uiTx('请先修复未通过项');
                } else nextBtn.disabled = false;
            }
            if (backBtn && (stepId === 'prepare' || stepId === 'detect' || stepId === 'runtime' || stepId === 'env')) {
                backBtn.disabled = !!busy || !!state.fixing;
            }
            gateReuseCudaButtons(!!state.detect.engineOk && !busy);
            if (!busy && stepId === 'prepare') {
                syncPrepareBlockerStatus();
            }
        }

        function syncPrepareBlockerStatus() {
            const status = $('setupWizardDetectStatus');
            if (!status) return;
            if (prepareAllowsNext()) {
                if (/未就绪|请先修复/.test(String(status.textContent || ''))) {
                    status.textContent = uiTx('环境已就绪，可继续');
                }
                return;
            }
            const blockers = listPrepareBlockers(getDetectResult('base'));
            if (!blockers.length) return;
            const names = blockers.map((it) => it.label).filter(Boolean).slice(0, 3).join('、');
            status.textContent = names
                ? uiTf('未就绪：{names} — 可「自动修复」或「手动修复」', { names })
                : uiTx('环境未就绪 — 可「自动修复」或「手动修复」');
        }

        function setDetectWaitVisible(visible, message) {
            const el = $('setupWizardDetectWait');
            if (!el) return;
            el.classList.toggle('hidden', !visible);
            el.setAttribute('aria-busy', visible ? 'true' : 'false');
            const msg = $('setupWizardDetectWaitMessage');
            if (message && msg) msg.textContent = message;
            const closeBtn = $('setupWizardCloseBtn');
            if (closeBtn) closeBtn.disabled = !!visible;
            const skipBtn = $('setupWizardSkipBtn');
            if (skipBtn) skipBtn.disabled = !!visible;
            const backBtn = $('setupWizardBackBtn');
            if (backBtn) backBtn.disabled = !!visible;
        }

        async function promptDetectFixBeforeNext(scope) {
            const result = getDetectResult(scope);
            const blockers = listPrepareBlockers(result);
            const names = blockers.map((it) => it.label).filter(Boolean).join('、');
            const message = names
                ? uiTf('以下项尚未就绪：{names}。\n请先完成修复后再继续。', { names })
                : uiTx('环境尚未修复完整，请先完成修复后再继续。');
            const vis = envApi()?.computeFixVisibility?.(result)
                || { showFix: !!result?.fix?.fixable };

            if (vis.showFix) {
                const ok = await appConfirmMsg(message, {
                    title: uiTx('请先修复依赖'),
                    primaryLabel: uiTx('自动修复'),
                    secondaryLabel: uiTx('返回'),
                });
                if (ok) void runPrepareFix();
                return;
            }

            await appConfirmMsg(
                vis.showManual
                    ? uiTf('{message}\n可点「手动修复」下载并安装。', { message })
                    : message,
                {
                    title: uiTx('请先修复依赖'),
                    primaryLabel: uiTx('知道了'),
                    hideSecondary: true,
                },
            );
        }

        async function runDetect(opts = {}) {
            const state = getState();
            const duringFix = !!opts.duringFix;
            const scope = opts.scope === 'runtime' ? 'runtime' : 'base';
            if (state.fixing && !duringFix) return getDetectResult(scope);
            const api = envApi();
            const ui = detectUi(scope);
            state.detect.activeScope = scope;
            state.detecting = true;
            setDetectBusy(true, scope);
            setDetectWaitVisible(true, duringFix ? '正在重新检测，请稍候…' : ui.waitMessage);
            if (ui.status) ui.status.textContent = ui.checkingText;
            const placeholderItems = (api?.itemsForScope?.(scope) || api?.DEFAULT_ITEMS || [])
                .map((it) => ({ ...it, status: 'checking' }));
            api?.renderItemsInto?.(ui.list, placeholderItems);
            syncOverviewChips(scope);

            let result = null;
            try {
                const goals = readGoals();

                try {
                    const pathInput = $('engineInstallPathInput');
                    if (pathInput && !pathInput.value.trim()) {
                        const bundled = await electron?.transubEngineBundledPath?.();
                        if (bundled?.ok && bundled.present && bundled.path) {
                            pathInput.value = bundled.path;
                            state.detect.enginePath = bundled.path;
                        }
                    }
                } catch { /* ignore */ }

                const payload = enginePayloadFromForm();
                state.detect.enginePath = payload.engineInstallPath;
                state.detect.engineUrl = payload.engineUrl;

                const asrHint = scope === 'runtime'
                    ? resolveWizardAsrHint()
                    : (goals.asrModel
                        || defaultAsrFor(goals.language, goals.profile, state.detect.recommend)
                        || 'sensevoice-small');
                const checkPayload = {
                    engineInstallPath: payload.engineInstallPath,
                    engineAsrModel: asrHint,
                    syncLlamaBackend: scope === 'base',
                    scope,
                };
                if (api?.performEnvCheck) {
                    result = await api.performEnvCheck(checkPayload);
                } else {
                    try {
                        result = await electron?.transubEnvCheck?.(checkPayload);
                    } catch (err) {
                        result = { ok: false, error: err?.message || String(err), items: [], fix: { fixable: false } };
                    }
                }

                setDetectResult(scope, result);
                api?.renderItemsInto?.(ui.list, result?.items || []);
                if (ui.status) {
                    ui.status.textContent = api?.summarizeCheckResult?.(result)
                        || (result?.ok ? '检测完成。' : '检测未通过，请先修复后再继续。');
                }

                if (scope === 'base') {
                    const items = result?.items || [];
                    const gpuItem = items.find((it) => it.id === 'gpu');
                    const engineItem = items.find((it) => it.id === 'engine');

                    state.detect.gpuOk = gpuItem?.status === 'ok';
                    state.detect.gpuName = String(gpuItem?.detail || '').split(/[·（(]/)[0].trim();
                    const detailStr = String(gpuItem?.detail || '');
                    const vendorRaw = String(gpuItem?.vendor || '').toLowerCase();
                    const gpuVendor = vendorRaw === 'amd' || vendorRaw === 'nvidia'
                        ? vendorRaw
                        : (/AMD|Radeon|ROCm/i.test(detailStr) && !/NVIDIA|GeForce|RTX|GTX/i.test(detailStr)
                            ? 'amd'
                            : (state.detect.gpuOk ? 'nvidia' : ''));
                    state.detect.gpuVendor = gpuVendor;
                    if (gpuVendor === 'amd' || state.detect.gpuOk) {
                        // AMD uses ROCm torch via device=cuda; Whisper/CT2 still fall back to CPU.
                        state.detect.suggestedDevice = 'cuda';
                    } else {
                        state.detect.suggestedDevice = 'cpu';
                    }
                    state.detect.engineOk = engineItem?.status === 'ok';
                    state.detect.engineError = state.detect.engineOk ? '' : (engineItem?.detail || result?.error || '引擎未就绪');

                    state.detect.recommend = state.detect.recommend || null;
                    if (state.detect.engineOk && !state.detect.recommend) {
                        try {
                            const rec = await electron?.transubEngineRecommend?.({
                                ...payload,
                                engineProfile: goals.profile,
                                engineHfEndpoint: payload.engineHfEndpoint,
                            });
                            if (rec?.ok) state.detect.recommend = rec;
                        } catch { /* ignore */ }
                    }

                    syncWizardDeviceSelect();
                    const profileSel = $('wizardProfileSelect');
                    if (profileSel) profileSel.value = goals.profile;
                } else {
                    const items = result?.items || [];
                    const whisperItem = items.find((it) => it.id === 'whisperRuntime');
                    state.detect.asrWhisperOk = whisperItem?.status === 'ok';
                    state.detect.numpyVersion = '';
                    state.detect.fasterWhisperVersion = '';
                    if (whisperItem?.detail) {
                        const np = String(whisperItem.detail).match(/numpy\s+([\d.]+)/i);
                        const fw = String(whisperItem.detail).match(/faster-whisper\s+([\d.]+|ok)/i);
                        if (np) state.detect.numpyVersion = np[1];
                        if (fw) state.detect.fasterWhisperVersion = fw[1];
                    }
                }

                syncOverviewChips(scope);
                gateReuseCudaButtons(!!state.detect.engineOk);
                syncModelSelects({ preserve: false });
            } finally {
                state.detecting = false;
                setDetectBusy(!!state.fixing, scope);
                setDetectWaitVisible(false);
            }
            return result;
        }

        async function runWizardFix(scope) {
            const state = getState();
            const steps = getSteps();
            const resolved = scope || state.detect.activeScope || detectScopeFromStep(steps[state.stepIndex]);
            const api = envApi();
            const ui = detectUi(resolved);
            if (state.fixing) {
                api?.requestCancelFix?.();
                if (ui.status) ui.status.textContent = uiTx('正在取消修复…');
                return { ok: false, cancelling: true };
            }
            if (!api?.runAutoFixSession || state.detecting) return;
            state.detect.activeScope = resolved;
            await api.runAutoFixSession({
                startMode: 'auto',
                getResult: () => getDetectResult(resolved),
                setResult: (r) => { setDetectResult(resolved, r); },
                setSubtitle: (t) => {
                    if (ui.status) ui.status.textContent = t;
                },
                setBusy: (b) => setDetectBusy(b, resolved),
                setFixHintVisible: (v) => {
                    if (ui.fixHint) ui.fixHint.classList.toggle('hidden', !v);
                },
                fixBtn: ui.fixBtn,
                manualBtn: ui.manualBtn,
                fixHintEl: ui.fixHint,
                downloadPayload: {
                    engineInstallPath: enginePayloadFromForm().engineInstallPath,
                    engineUrl: enginePayloadFromForm().engineUrl,
                },
                setFixing: (v) => { state.fixing = !!v; },
                isFixing: () => state.fixing,
                isRunning: () => state.detecting,
                recheck: async (opts) => {
                    if (opts?.duringFix) {
                        if (ui.status) ui.status.textContent = '本轮修复完成，正在重新检测…';
                    }
                    return runDetect({ duringFix: !!opts?.duringFix, scope: resolved });
                },
                onDone: () => {
                    state.fixing = false;
                    setDetectBusy(false, resolved);
                },
            });
        }

        async function runWizardReuseCuda(scope) {
            const state = getState();
            if (!state.detect.engineOk) {
                const ui = detectUi(scope || 'base');
                if (ui.status) ui.status.textContent = '请先完成引擎检测后再复用本机 CUDA。';
                return;
            }
            const steps = getSteps();
            const resolved = scope || state.detect.activeScope || detectScopeFromStep(steps[state.stepIndex]);
            const api = envApi();
            const ui = detectUi(resolved);
            if (!api?.runReuseCudaSession || state.detecting || state.fixing) return;
            state.detect.activeScope = resolved;
            await api.runReuseCudaSession({
                setSubtitle: (t) => {
                    if (ui.status) ui.status.textContent = t;
                },
                downloadPayload: {
                    engineInstallPath: enginePayloadFromForm().engineInstallPath,
                    engineUrl: enginePayloadFromForm().engineUrl,
                },
                recheck: () => runDetect({ scope: resolved }),
            });
        }

        async function runWizardManual(scope) {
            const state = getState();
            const steps = getSteps();
            const resolved = scope || state.detect.activeScope || detectScopeFromStep(steps[state.stepIndex]);
            const api = envApi();
            const ui = detectUi(resolved);
            if (!api?.runManualDownloadSession) return;
            if (state.fixing && api.requestFixSwitchToManual?.()) return;
            if (state.detecting || state.fixing) return;
            state.detect.activeScope = resolved;
            await api.runManualDownloadSession({
                getResult: () => getDetectResult(resolved),
                setSubtitle: (t) => {
                    if (ui.status) ui.status.textContent = t;
                },
                recheck: () => runDetect({ scope: resolved }),
            });
        }

        return {
            envApi,
            detectScopeFromStep,
            detectUi,
            getDetectResult,
            setDetectResult,
            syncOverviewChips,
            syncFromResults,
            gateReuseCudaButtons,
            setEngineGatedActionsEnabled,
            bindOverviewChipClicks,
            guardEngineAction,
            detectAllowsNext,
            prepareAllowsNext,
            isPrepareEnvComplete: () => isPrepareEnvComplete(getDetectResult('base')),
            setDetectBusy,
            setDetectWaitVisible,
            syncPrepareBlockerStatus,
            promptDetectFixBeforeNext,
            runDetect,
            runPrepareDetect,
            runPrepareFix,
            runWizardFix,
            runWizardReuseCuda,
            runWizardManual,
        };
    }

    return {
        createSetupWizardDetect,
        PREPARE_GATE_IDS,
        listPrepareBlockers,
        isPrepareEnvComplete,
        mergeChipStates,
    };
}));
