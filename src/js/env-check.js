/**
 * First-run system check modal (install path / FFmpeg / VC++ / GPU / Engine / ASR).
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const DONE_KEY = 'transub.envCheck.done';
    const DEFAULT_ITEMS = [
        { id: 'installPath', label: '安装路径（仅限 ASCII 字符）' },
        { id: 'ffmpeg', label: 'FFmpeg / FFprobe' },
        { id: 'vcRedist', label: 'Visual C++ 运行库' },
        { id: 'gpu', label: 'GPU' },
        { id: 'gpuDriver', label: 'GPU 驱动版本' },
        { id: 'gpuRuntime', label: 'GPU 运行时' },
        { id: 'engine', label: 'Transub Engine' },
        { id: 'llamaServerRuntime', label: 'llama-server 运行时' },
        { id: 'asrModel', label: 'ASR 模型' },
        { id: 'vadModel', label: 'VAD 模型（FSMN）' },
        { id: 'lidModel', label: '语种探测模型' },
        { id: 'sensevoiceRuntime', label: 'SenseVoice 运行库' },
        { id: 'whisperRuntime', label: 'Whisper 运行库' },
    ];

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';

    const state = {
        running: false,
        fixing: false,
        open: false,
        result: null,
        afterStart: null,
    };

    function $(id) {
        return document.getElementById(id);
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isDone() {
        try {
            return localStorage.getItem(DONE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function markDone() {
        try {
            localStorage.setItem(DONE_KEY, '1');
        } catch (_) { /* ignore */ }
    }

    function statusLabel(status) {
        if (status === 'ok') return '通过';
        if (status === 'warn') return '注意';
        if (status === 'fail') return '未通过';
        return '检查中…';
    }

    function markIcon(status) {
        if (status === 'ok') return '<i class="fa fa-check"></i>';
        if (status === 'warn') return '<i class="fa fa-exclamation"></i>';
        if (status === 'fail') return '<i class="fa fa-times"></i>';
        return '';
    }

    function renderItemRow(it) {
        const status = it.status || 'checking';
        const action = it.action?.url
            ? `<button type="button" class="env-check-action" data-env-action-url="${esc(it.action.url)}">${esc(it.action.label || '打开')}</button>`
            : '';
        const detail = it.detail
            ? `<span class="env-check-detail">${esc(it.detail)}${action}</span>`
            : (action ? `<span class="env-check-detail">${action}</span>` : '');
        return (
            `<div class="env-check-row" data-status="${esc(status)}" data-id="${esc(it.id)}" role="listitem">`
            + `<span class="env-check-mark" aria-hidden="true">${markIcon(status)}</span>`
            + `<div class="env-check-label">${esc(it.label)}${detail}</div>`
            + `<span class="env-check-status">${esc(statusLabel(status))}</span>`
            + `</div>`
        );
    }

    function renderItemsInto(host, items) {
        if (!host) return;
        const list = Array.isArray(items) ? items : [];
        const settled = list.length > 0 && list.every((it) => it.status && it.status !== 'checking');
        const okItems = list.filter((it) => it.status === 'ok');
        const issueItems = list.filter((it) => it.status !== 'ok');
        // All passed → list every item. Any fail/warn → collapse passed, show issues.
        if (settled && issueItems.length > 0 && okItems.length > 0) {
            host.innerHTML = (
                `<details class="env-check-passed-group">`
                + `<summary class="env-check-passed-summary">`
                + `<span class="env-check-mark" aria-hidden="true"><i class="fa fa-check"></i></span>`
                + `<span class="env-check-passed-summary-text">已通过 ${okItems.length} 项</span>`
                + `<span class="env-check-passed-summary-hint"></span>`
                + `</summary>`
                + `<div class="env-check-passed-list">${okItems.map(renderItemRow).join('')}</div>`
                + `</details>`
                + issueItems.map(renderItemRow).join('')
            );
            return;
        }
        host.innerHTML = list.map(renderItemRow).join('');
    }

    function renderItems(items) {
        renderItemsInto($('envCheckList'), items);
    }

    function summarizeCheckResult(result) {
        const items = Array.isArray(result?.items) ? result.items : [];
        const fails = Number(result?.failCount || items.filter((i) => i.status === 'fail').length || 0);
        const warns = Number(result?.warnCount || items.filter((i) => i.status === 'warn').length || 0);
        const whisperItem = items.find((it) => it.id === 'whisperRuntime');
        const whisperPolicy = !!(whisperItem?.policyBlocked
            || /应用程序控制策略|智能应用控制|4551/i.test(String(whisperItem?.detail || '')));
        if (fails > 0) {
            return whisperPolicy
                ? `检测完成：${fails} 项未通过。Whisper 可能被系统策略拦截，可点「一键修复」重试或「手动下载」。`
                : `检测完成：${fails} 项未通过${warns ? `，${warns} 项需注意` : ''}。缺什么可点「一键修复」。`;
        }
        if (warns > 0) {
            return `检测完成：环境可用，有 ${warns} 项提示。可点「一键修复」补齐。`;
        }
        return '检测完成：依赖项正常。';
    }

    function whisperRuntimeBad(result) {
        return (result?.items || []).some((it) => (
            it?.id === 'whisperRuntime' && (it.status === 'fail' || it.status === 'warn')
        ));
    }

    function computeFixVisibility(result) {
        const fixable = !!result?.fix?.fixable;
        const showFix = fixable || whisperRuntimeBad(result);
        const kinds = listNeededManualKindsFromResult(result);
        const showManual = kinds.some((k) => k !== 'llamaRuntime')
            || (Array.isArray(result?.fix?.modelIds) && result.fix.modelIds.length > 0)
            || (kinds.includes('llamaRuntime')
                && !!electron?.transubAdvancedManagedLlmOpenManual);
        return { showFix, showManual, fixable };
    }

    async function offerManualLlamaRuntimeDownload(errorText = '') {
        if (!electron?.transubAdvancedManagedLlmDownloadInfo
            || !electron?.transubAdvancedManagedLlmOpenManual) {
            return { ok: false, error: '当前环境不支持手动下载 llama-server' };
        }
        let infoRes;
        try {
            infoRes = await electron.transubAdvancedManagedLlmDownloadInfo({ kind: 'runtime' });
        } catch (err) {
            return { ok: false, error: err?.message || '无法获取运行时下载信息' };
        }
        if (!infoRes?.ok) {
            return { ok: false, error: infoRes?.error || '无法获取运行时下载信息' };
        }
        const info = infoRes.info || {};
        const detail = String(errorText || '').trim();
        const sizeHint = info.sizeHint ? `\n体积约 ${info.sizeHint}。` : '';
        const message = (
            (detail ? `${detail}\n\n` : '')
            + `将打开「${info.runtimeLabel || 'llama-server'}」下载链接。${sizeHint}\n`
            + `目标版本：${info.runtimeTag || '—'}\n\n`
            + '下载完成后请到设置 → 运行环境 →「选择 zip 安装」或「检测」。'
        );
        const proceed = global.TransubAppConfirm
            ? await global.TransubAppConfirm({
                title: '手动下载 llama-server',
                message,
                primaryLabel: '打开下载链接',
                secondaryLabel: '取消',
            })
            : window.confirm(message);
        if (!proceed) return { ok: false, cancelled: true };
        try {
            const openRes = await electron.transubAdvancedManagedLlmOpenManual({
                kind: 'runtime',
                runtimeId: info.runtimeId || undefined,
                which: info.needsCompanion ? 'all-official' : 'official',
            });
            if (!openRes?.ok) {
                return { ok: false, error: openRes?.error || '无法打开下载链接' };
            }
            return {
                ok: true,
                message: info.folder
                    ? `已打开下载链接。解压或安装目标：${info.folder}`
                    : '已打开下载链接',
            };
        } catch (err) {
            return { ok: false, error: err?.message || '无法打开下载链接' };
        }
    }

    async function performEnvCheck(payload = {}) {
        let result = null;
        const request = {
            ...(payload && typeof payload === 'object' ? payload : {}),
            // System check + wizard: align llama-server backend to detected CUDA 12/13.
            syncLlamaBackend: payload?.syncLlamaBackend !== false,
        };
        try {
            result = await electron?.transubEnvCheck?.(request);
        } catch (err) {
            result = {
                ok: false,
                error: err?.message || String(err),
                items: DEFAULT_ITEMS.map((it) => ({
                    ...it,
                    status: 'fail',
                    detail: err?.message || '检测失败',
                    blocking: true,
                })),
                fix: { fixable: false },
            };
        }
        if (!result?.items?.length) {
            result = {
                ok: false,
                items: DEFAULT_ITEMS.map((it) => ({
                    ...it,
                    status: 'fail',
                    detail: result?.error || '检测无结果',
                    blocking: true,
                })),
                fix: { fixable: false },
            };
        }
        return result;
    }

    function setSubtitle(text) {
        const el = $('envCheckSubtitle');
        if (el) el.textContent = text;
    }

    function setFixHintVisible(visible) {
        const el = $('envCheckFixHint');
        if (!el) return;
        el.classList.toggle('hidden', !visible);
    }

    function formatElapsed(ms) {
        const sec = Math.max(0, Math.floor(Number(ms) / 1000));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m <= 0) return `${s} 秒`;
        return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
    }

    function formatFixBytes(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '';
        if (v < 1024) return `${Math.round(v)} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
        return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setFixProgressLine(message, pct, startedAt, meta = {}) {
        const msg = String(message || '修复中…').trim();
        const n = Number(pct);
        const pctPart = Number.isFinite(n) ? `（${Math.round(Math.max(0, Math.min(100, n)))}%）` : '';
        const elapsed = startedAt ? ` · 已等待 ${formatElapsed(Date.now() - startedAt)}` : '';
        const recv = Number(meta.downloadedBytes);
        const total = Number(meta.totalBytes);
        const speed = Number(meta.bytesPerSecond);
        const sizeBits = [];
        if (Number.isFinite(recv) && recv >= 0) {
            const recvLabel = formatFixBytes(recv) || `${Math.round(recv)} B`;
            if (Number.isFinite(total) && total > 0) {
                sizeBits.push(`${recvLabel} / ${formatFixBytes(total)}`);
            } else {
                sizeBits.push(`已下 ${recvLabel}`);
            }
        }
        if (Number.isFinite(speed) && speed > 0) {
            sizeBits.push(`${formatFixBytes(speed)}/s`);
        }
        const sizePart = sizeBits.length ? ` · ${sizeBits.join(' · ')}` : '';
        setSubtitle(`${msg}${pctPart}${elapsed}${sizePart}`);
    }

    function setBusy(busy) {
        const startBtn = $('envCheckStartBtn');
        const fixBtn = $('envCheckFixBtn');
        const manualBtn = $('envCheckManualBtn');
        const retryBtn = $('envCheckRetryBtn');
        if (startBtn) startBtn.disabled = busy;
        if (retryBtn) retryBtn.disabled = busy;
        if (fixBtn) {
            const fixable = !!state.result?.fix?.fixable;
            const whisperBad = (state.result?.items || []).some((it) => (
                it?.id === 'whisperRuntime' && (it.status === 'fail' || it.status === 'warn')
            ));
            const showFix = fixable || whisperBad || state.fixing;
            fixBtn.classList.toggle('hidden', !showFix);
            fixBtn.disabled = busy || (!showFix && !state.fixing);
            if (!state.fixing) fixBtn.textContent = '一键修复';
        }
        if (manualBtn) {
            const manualable = canOfferManualDownload();
            manualBtn.classList.toggle('hidden', !manualable);
            // 一键修复进行中仍可点「手动下载」（吞吐低/卡住时的逃生口）
            manualBtn.disabled = !manualable || (busy && !state.fixing);
        }
    }

    function hasNvidiaGpu() {
        return hasNvidiaGpuInResult(state.result);
    }

    function listNeededManualKindsFromResult(result) {
        const plan = result?.fix || {};
        const steps = Array.isArray(plan.steps) ? plan.steps : [];
        const items = result?.items || [];
        const statusOf = (id) => String(items.find((it) => it.id === id)?.status || '');
        const kinds = [];

        if (plan.ensureGpu || steps.some((s) => s?.id === 'gpuRuntime')) {
            kinds.push('gpu');
        }
        if (
            steps.some((s) => s?.id === 'sensevoiceRuntime')
            || statusOf('sensevoiceRuntime') === 'fail'
            || statusOf('sensevoiceRuntime') === 'warn'
            || (Array.isArray(plan.modelIds) && plan.modelIds.some((id) => /sensevoice/i.test(String(id))))
        ) {
            kinds.push('sensevoice');
        }
        if (
            steps.some((s) => s?.id === 'whisperRuntime')
            || statusOf('whisperRuntime') === 'fail'
            || statusOf('whisperRuntime') === 'warn'
        ) {
            kinds.push('whisper');
        }
        if (plan.ensureLlamaRuntime || steps.some((s) => s?.id === 'llamaServerRuntime')) {
            kinds.push('llamaRuntime');
        }
        return kinds;
    }

    function canOfferManualDownload() {
        return computeFixVisibility(state.result).showManual;
    }

    function listNeededManualKinds() {
        return listNeededManualKindsFromResult(state.result);
    }

    function preferredManualKind() {
        const kinds = listNeededManualKinds();
        return kinds[0] || 'gpu';
    }

    function hasNvidiaGpuInResult(result) {
        const gpu = (result?.items || []).find((it) => it.id === 'gpu');
        return gpu?.status === 'ok';
    }

    async function openModelMirrorLinks(modelIds) {
        const ids = (Array.isArray(modelIds) ? modelIds : []).filter(Boolean);
        if (!ids.length || !electron?.transubEngineDownloadInfo) {
            return { ok: false, error: '无可打开的模型镜像' };
        }
        try {
            const res = await electron.transubEngineDownloadInfo({
                kind: 'models',
                modelIds: ids,
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
            for (const url of urls.slice(0, 6)) {
                try {
                    if (electron.transubEngineOpenManualUrl) {
                        await electron.transubEngineOpenManualUrl({ url });
                    } else {
                        await electron.openExternal?.(url);
                    }
                } catch (_) { /* ignore single failure */ }
            }
            const folder = res?.info?.folder;
            return {
                ok: true,
                message: folder
                    ? `已打开镜像页。请将文件放到：${folder}`
                    : '已打开模型镜像页',
                folder,
            };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function runManualDownloadSession(ui = {}) {
        const getResult = typeof ui.getResult === 'function' ? ui.getResult : () => state.result;
        const setSubtitleFn = typeof ui.setSubtitle === 'function' ? ui.setSubtitle : setSubtitle;
        const recheck = typeof ui.recheck === 'function' ? ui.recheck : runCheck;
        const result = getResult();
        const vis = computeFixVisibility(result);
        if (!vis.showManual) {
            setSubtitleFn('当前没有可手动下载的项。');
            return { ok: false, error: 'nothing_to_manual' };
        }
        const plan = result?.fix || {};
        const kinds = listNeededManualKindsFromResult(result);
        const whlKinds = kinds.filter((k) => k !== 'llamaRuntime');

        if (whlKinds.length && global.TransubManualWhlInstall?.openModal) {
            const labels = whlKinds.map((k) => {
                if (k === 'sensevoice') return 'SenseVoice';
                if (k === 'whisper') return 'Whisper';
                return 'GPU';
            });
            setSubtitleFn(`正在打开手动下载（${labels.join(' + ')}）…`);
            const gpuItem = (result?.items || []).find((it) => it.id === 'gpuRuntime') || {};
            const gpuExtras = whlKinds.includes('gpu')
                ? {
                    asrGpuReady: gpuItem.asrGpuReady === true,
                    ortGpuCuda: gpuItem.ortGpuCuda === true,
                    ortGpuRequirement: gpuItem.ortGpuRequirement || '',
                    ortOnly: gpuItem.asrGpuReady === true && gpuItem.ortGpuCuda === false,
                }
                : {};
            const res = await global.TransubManualWhlInstall.openModal({
                kind: whlKinds[0],
                kinds: whlKinds,
                formPayload: gpuExtras,
            });
            if (res?.ok) {
                setSubtitleFn(res.message || '手动安装完成，正在重新检测…');
                await recheck();
                return { ok: true };
            }
            if (res?.cancelled) {
                setSubtitleFn('已取消手动下载。');
                return { ok: false, cancelled: true };
            }
            setSubtitleFn(res?.error || '手动下载未完成。');
            return { ok: false, error: res?.error || 'manual_failed' };
        }

        if (kinds.includes('llamaRuntime')) {
            setSubtitleFn('正在打开 llama-server 手动下载…');
            const opened = await offerManualLlamaRuntimeDownload();
            setSubtitleFn(opened.ok
                ? (opened.message || '已打开 llama-server 下载链接')
                : (opened.cancelled ? '已取消手动下载。' : (opened.error || '打开失败')));
            if (opened.ok) await recheck();
            return opened;
        }

        if (Array.isArray(plan.modelIds) && plan.modelIds.length) {
            const opened = await openModelMirrorLinks(plan.modelIds);
            setSubtitleFn(opened.ok ? opened.message : (opened.error || '打开模型镜像失败'));
            return opened;
        }

        setSubtitleFn('当前没有可手动下载的项。');
        return { ok: false, error: 'nothing_to_manual' };
    }

    /** Active auto-fix session; used so「手动下载」can abort download mid-fix. */
    let activeFixSession = null;

    function requestFixSwitchToManual() {
        if (!activeFixSession?.requestSwitchToManual) return false;
        activeFixSession.requestSwitchToManual();
        return true;
    }

    function enableManualButton(manualBtn) {
        const btn = manualBtn || $('envCheckManualBtn');
        if (!btn) return;
        if (!computeFixVisibility(
            activeFixSession?.getResult?.() || state.result,
        ).showManual) return;
        btn.classList.remove('hidden');
        btn.disabled = false;
    }

    async function onManualDownload() {
        if (state.fixing && requestFixSwitchToManual()) return;
        if (state.running || state.fixing) return;
        return runManualDownloadSession();
    }

    /**
     * Shared one-click fix loop for system check modal and setup wizard.
     * @param {object} ui
     */
    async function runAutoFixSession(ui = {}) {
        const getResult = typeof ui.getResult === 'function' ? ui.getResult : () => state.result;
        const setResult = typeof ui.setResult === 'function' ? ui.setResult : (r) => { state.result = r; };
        const setSubtitleFn = typeof ui.setSubtitle === 'function' ? ui.setSubtitle : setSubtitle;
        const setBusyFn = typeof ui.setBusy === 'function' ? ui.setBusy : setBusy;
        const setFixHintFn = typeof ui.setFixHintVisible === 'function' ? ui.setFixHintVisible : setFixHintVisible;
        const fixBtn = ui.fixBtn || $('envCheckFixBtn');
        const manualBtn = ui.manualBtn || $('envCheckManualBtn');
        const recheck = typeof ui.recheck === 'function'
            ? ui.recheck
            : async (opts) => runCheck(opts);
        const downloadExtra = ui.downloadPayload && typeof ui.downloadPayload === 'object'
            ? ui.downloadPayload
            : {};
        const markFixing = typeof ui.setFixing === 'function'
            ? ui.setFixing
            : (v) => { state.fixing = !!v; };
        const isFixing = typeof ui.isFixing === 'function'
            ? ui.isFixing
            : () => state.fixing;
        const isRunning = typeof ui.isRunning === 'function'
            ? ui.isRunning
            : () => state.running;

        if (isRunning() || isFixing()) return { ok: false, busy: true };

        let initialPlan = cloneFixPlan(getResult()?.fix) || {
            fixable: false,
            openVcRedist: false,
            ensureGpu: false,
            ensureLlamaRuntime: false,
            force: false,
            modelIds: [],
            forceIds: [],
            steps: [],
            manualHints: [],
        };
        if (!planHasAutoWork(initialPlan) && whisperRuntimeBad(getResult())) {
            initialPlan = {
                ...initialPlan,
                fixable: true,
                force: true,
                modelIds: ['whisper-tiny'],
                forceIds: ['whisper-tiny'],
                steps: [{
                    id: 'whisperRuntime',
                    label: '重试补齐 Whisper 运行库（numpy / faster-whisper / av）',
                }],
                manualHints: Array.isArray(initialPlan.manualHints) ? initialPlan.manualHints : [],
            };
        }
        if (!planHasAutoWork(initialPlan)) {
            const manual = (initialPlan?.manualHints || []).map((h) => h.label || h.detail).filter(Boolean);
            setSubtitleFn(manual.length
                ? `当前项需手动处理：${manual[0]}`
                : '当前没有可自动修复的项。');
            return { ok: false, error: 'nothing_fixable' };
        }

        const autoSteps = (initialPlan.steps || []).filter((s) => s && !s.manual);
        const stepLabels = autoSteps.map((s) => s.label).filter(Boolean);
        const manual = (initialPlan.manualHints || []).map((h) => h.label || h.detail).filter(Boolean);
        const preview = [
            stepLabels.length ? `将自动执行：\n· ${stepLabels.join('\n· ')}` : '',
            manual.length ? `\n以下项需手动处理（不会自动下载）：\n· ${manual.join('\n· ')}` : '',
            '\n下载可能需要数分钟，是否开始？\n（网络不佳时可改用「手动下载」）',
        ].filter(Boolean).join('');

        const proceed = global.TransubAppConfirm
            ? await global.TransubAppConfirm({
                title: '一键修复',
                message: preview,
                primaryLabel: '开始修复',
                secondaryLabel: '取消',
            })
            : window.confirm(preview);
        if (!proceed) return { ok: false, cancelled: true };

        let switchToManual = false;
        const requestSwitchToManual = () => {
            if (switchToManual) return;
            switchToManual = true;
            setSubtitleFn('正在取消自动下载，改为手动下载…');
            enableManualButton(manualBtn);
            try { void electron?.transubEngineCancelDownload?.(); } catch (_) { /* ignore */ }
        };
        activeFixSession = { requestSwitchToManual, getResult };

        markFixing(true);
        setBusyFn(true);
        setFixHintFn(true);
        // 修复中保持「手动下载」可点（提示文案写「可随时点」）
        enableManualButton(manualBtn);
        setSubtitleFn('正在开始修复…');
        await new Promise((r) => setTimeout(r, 120));

        const fixStartedAt = Date.now();
        if (fixBtn) {
            fixBtn.classList.remove('hidden');
            fixBtn.disabled = true;
            fixBtn.textContent = '修复中…';
        }

        let unsub = null;
        let elapsedTimer = null;
        const errors = [];
        let lastFixMsg = '正在开始修复…';
        let lastFixPct = null;
        let lastFixMeta = {};
        let manualCancelled = false;
        let openedVcRedist = false;
        const maxRounds = 5;
        let roundsDone = 0;
        let lastIssues = '';
        let plan = initialPlan;

        const setProgress = (msg, pct, meta) => {
            lastFixMsg = msg || lastFixMsg;
            if (pct != null) lastFixPct = pct;
            if (meta) lastFixMeta = meta;
            const n = Number(lastFixPct);
            const pctPart = Number.isFinite(n) ? `（${Math.round(Math.max(0, Math.min(100, n)))}%）` : '';
            const elapsed = ` · 已等待 ${formatElapsed(Date.now() - fixStartedAt)}`;
            const recv = Number(lastFixMeta.downloadedBytes);
            const total = Number(lastFixMeta.totalBytes);
            const speed = Number(lastFixMeta.bytesPerSecond);
            const sizeBits = [];
            if (Number.isFinite(recv) && recv >= 0) {
                const recvLabel = formatFixBytes(recv) || `${Math.round(recv)} B`;
                if (Number.isFinite(total) && total > 0) {
                    sizeBits.push(`${recvLabel} / ${formatFixBytes(total)}`);
                } else {
                    sizeBits.push(`已下 ${recvLabel}`);
                }
            }
            if (Number.isFinite(speed) && speed > 0) {
                sizeBits.push(`${formatFixBytes(speed)}/s`);
            }
            const sizePart = sizeBits.length ? ` · ${sizeBits.join(' · ')}` : '';
            setSubtitleFn(`${lastFixMsg}${pctPart}${elapsed}${sizePart}`);
        };

        try {
            elapsedTimer = setInterval(() => {
                if (!isFixing()) return;
                setProgress(lastFixMsg, lastFixPct, lastFixMeta);
            }, 1000);

            if (electron?.onEngineDownloadProgress) {
                unsub = electron.onEngineDownloadProgress((p) => {
                    setProgress(
                        p?.message || p?.detail || '修复中…',
                        Number.isFinite(Number(p?.pct ?? p?.percent)) ? Number(p.pct ?? p.percent) : lastFixPct,
                        {
                            downloadedBytes: p?.downloadedBytes,
                            totalBytes: p?.totalBytes,
                            bytesPerSecond: p?.bytesPerSecond,
                        },
                    );
                    if (p?.suggestManual) {
                        setFixHintFn(true);
                        enableManualButton(manualBtn);
                        if (ui.fixHintEl) {
                            ui.fixHintEl.textContent = '当前镜像吞吐较低或可能卡住；可随时点「手动下载」，用浏览器下载 .whl 后本地安装。';
                        } else {
                            const hint = $('envCheckFixHint');
                            if (hint) {
                                hint.textContent = '当前镜像吞吐较低或可能卡住；可随时点「手动下载」，用浏览器下载 .whl 后本地安装（支持断点续传）。';
                            }
                        }
                    }
                });
            }

            while (roundsDone < maxRounds && !manualCancelled && !switchToManual) {
                if (!planHasAutoWork(plan)) break;

                const issues = envIssueSignature(getResult());
                if (roundsDone > 0 && issues === lastIssues) {
                    errors.push('修复后仍有相同问题，请改用手动下载或查看详情');
                    break;
                }
                lastIssues = issues;
                roundsDone += 1;

                if (roundsDone > 1) {
                    setProgress(`继续修复剩余项（第 ${roundsDone} 轮）…`, null, {});
                    lastFixPct = null;
                    lastFixMeta = {};
                }

                if (plan.openVcRedist && !openedVcRedist) {
                    openedVcRedist = true;
                    setProgress('正在打开 Visual C++ 运行库下载页…', null, {});
                    const url = getResult()?.urls?.vcRedist || 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
                    try {
                        await electron?.openExternal?.(url);
                    } catch (err) {
                        errors.push(err?.message || '打开 VC++ 下载页失败');
                    }
                }
                if (switchToManual) break;

                const modelIds = Array.isArray(plan.modelIds) ? plan.modelIds.filter(Boolean) : [];
                if (modelIds.length) {
                    setProgress(`正在下载/补齐：${modelIds.join('、')}…`, 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持引擎下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'models',
                            modelIds,
                            force: !!plan.force,
                            forceIds: Array.isArray(plan.forceIds) ? plan.forceIds : undefined,
                            engineAutoStart: true,
                            skipGpuPrestep: !hasNvidiaGpuInResult(getResult()),
                            ...downloadExtra,
                        });
                        if (switchToManual) break;
                        if (!res?.ok) {
                            if (res?.cancelled) {
                                manualCancelled = true;
                                errors.push(res?.error || '已取消下载');
                                break;
                            }
                            const errText = res?.error || res?.message || '模型/运行库下载失败';
                            const kinds = listNeededManualKindsFromResult(getResult())
                                .filter((k) => k !== 'gpu' || hasNvidiaGpuInResult(getResult()));
                            if (kinds.length && global.TransubManualWhlInstall?.openModal) {
                                const useManual = global.TransubAppConfirm
                                    ? await global.TransubAppConfirm({
                                        title: '自动下载失败',
                                        message: `${String(errText).slice(0, 500)}\n\n是否改为手动下载运行库 .whl？`,
                                        primaryLabel: '手动下载',
                                        secondaryLabel: '取消',
                                    })
                                    : window.confirm('自动下载失败，是否改为手动下载？');
                                if (switchToManual) break;
                                if (useManual) {
                                    const manualRes = await global.TransubManualWhlInstall.openModal({
                                        kind: kinds[0],
                                        kinds,
                                        errorText: errText,
                                    });
                                    if (manualRes?.cancelled) {
                                        manualCancelled = true;
                                        errors.push(errText);
                                    } else if (!manualRes?.ok) {
                                        errors.push(errText);
                                    }
                                } else {
                                    manualCancelled = true;
                                    errors.push(errText);
                                }
                            } else {
                                const opened = await openModelMirrorLinks(modelIds);
                                if (opened.ok) {
                                    errors.push(`${errText}（已打开镜像页，可手动下载后重试检测）`);
                                } else {
                                    errors.push(errText);
                                }
                            }
                        }
                    }
                }

                if (!manualCancelled && !switchToManual && plan.ensureGpu && hasNvidiaGpuInResult(getResult())) {
                    setProgress('正在安装 GPU 支持组件…', 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持 GPU 组件下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'gpu',
                            force: false,
                            engineAutoStart: true,
                            ...downloadExtra,
                        });
                        if (switchToManual) break;
                        if (!res?.ok) {
                            if (res?.cancelled) {
                                manualCancelled = true;
                                errors.push(res?.error || '已取消下载');
                                break;
                            }
                            const errText = res?.error || res?.message || 'GPU 支持安装失败';
                            const manualRes = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                                kind: 'gpu',
                                errorText: errText,
                            });
                            if (manualRes?.cancelled) {
                                manualCancelled = true;
                                errors.push(errText);
                            } else if (!manualRes?.ok) {
                                errors.push(errText);
                            }
                        }
                    }
                }

                if (!manualCancelled && !switchToManual && plan.ensureLlamaRuntime) {
                    const llamaStep = (plan.steps || []).find((s) => s?.id === 'llamaServerRuntime');
                    const llamaRuntimeId = String(
                        plan.llamaRuntimeId || llamaStep?.runtimeId || '',
                    ).trim();
                    setProgress(
                        llamaRuntimeId
                            ? `正在安装 llama-server 运行时（${llamaRuntimeId}）…`
                            : '正在更新 llama-server 运行时…',
                        0,
                        {},
                    );
                    if (!electron?.transubAdvancedManagedLlmInstallRuntime) {
                        errors.push('当前环境不支持 llama-server 运行时安装');
                    } else {
                        let unsubLlama = null;
                        try {
                            if (electron.onAdvancedManagedLlmProgress) {
                                unsubLlama = electron.onAdvancedManagedLlmProgress((p) => {
                                    setProgress(
                                        p?.message || '更新 llama-server…',
                                        Number.isFinite(Number(p?.pct ?? p?.percent))
                                            ? Number(p.pct ?? p.percent)
                                            : lastFixPct,
                                        {
                                            downloadedBytes: p?.downloadedBytes,
                                            totalBytes: p?.totalBytes,
                                            bytesPerSecond: p?.bytesPerSecond,
                                        },
                                    );
                                });
                            }
                            // Prefer hardware-matched CUDA 12/13 package when known.
                            const res = await electron.transubAdvancedManagedLlmInstallRuntime({
                                force: true,
                                runtimeId: llamaRuntimeId || undefined,
                            });
                            if (switchToManual) break;
                            if (!res?.ok) {
                                const errText = res?.error || res?.message || 'llama-server 运行时更新失败';
                                const useManual = global.TransubAppConfirm
                                    ? await global.TransubAppConfirm({
                                        title: '运行时自动下载失败',
                                        message: `${String(errText).slice(0, 500)}\n\n是否改为浏览器手动下载？`,
                                        primaryLabel: '手动下载',
                                        secondaryLabel: '跳过',
                                    })
                                    : window.confirm('运行时自动下载失败，是否改为手动下载？');
                                if (switchToManual) break;
                                if (useManual) {
                                    const manualRes = await offerManualLlamaRuntimeDownload(errText);
                                    if (manualRes?.cancelled) {
                                        manualCancelled = true;
                                        errors.push(errText);
                                    } else if (!manualRes?.ok) {
                                        errors.push(errText);
                                    }
                                } else {
                                    errors.push(errText);
                                }
                            }
                        } catch (err) {
                            errors.push(err?.message || 'llama-server 运行时更新失败');
                        } finally {
                            try { unsubLlama?.(); } catch (_) { /* ignore */ }
                        }
                    }
                }

                if (manualCancelled || switchToManual) break;

                setProgress('本轮修复完成，正在重新检测剩余项…', lastFixPct, lastFixMeta);
                const next = await recheck({ duringFix: true });
                if (next) setResult(next);
                plan = cloneFixPlan(getResult()?.fix);
                enableManualButton(manualBtn);
            }
        } catch (err) {
            errors.push(err?.message || String(err));
        } finally {
            if (elapsedTimer) clearInterval(elapsedTimer);
            try { unsub?.(); } catch (_) { /* ignore */ }
            activeFixSession = null;
            markFixing(false);
            setFixHintFn(false);
        }

        if (switchToManual) {
            setSubtitleFn('已改为手动下载…');
            setBusyFn(false);
            const manualUi = {
                getResult,
                setSubtitle: setSubtitleFn,
                recheck: (opts) => recheck(opts),
            };
            const manualRes = await runManualDownloadSession(manualUi);
            if (typeof ui.onDone === 'function') {
                ui.onDone({ switchedToManual: true, manual: manualRes });
            }
            return { ok: !!manualRes?.ok, switchedToManual: true, manual: manualRes };
        }

        if (manualCancelled) {
            setSubtitleFn(errors[0] ? `已取消修复：${errors[0]}` : '已取消修复。');
            setBusyFn(false);
            if (typeof ui.onDone === 'function') ui.onDone({ cancelled: true });
            return { ok: false, cancelled: true, errors };
        }

        if (roundsDone === 0) {
            setSubtitleFn(errors[0] || '未能开始自动修复。');
            setBusyFn(false);
            if (typeof ui.onDone === 'function') ui.onDone({ ok: false });
            return { ok: false, error: errors[0] || 'no_rounds', errors };
        }

        const stillFixable = planHasAutoWork(getResult()?.fix);
        if (stillFixable && errors.length) {
            setSubtitleFn(`修复未完全成功：${errors[0]}。将重新检测…`);
        } else if (roundsDone > 1) {
            setSubtitleFn(`已连续修复 ${roundsDone} 轮，正在确认最终状态…`);
        } else {
            setSubtitleFn('修复步骤已完成，正在重新检测…');
        }
        const finalResult = await recheck();
        if (finalResult) setResult(finalResult);
        setBusyFn(false);
        if (typeof ui.onDone === 'function') ui.onDone({ ok: true, roundsDone, errors });
        return { ok: errors.length === 0, roundsDone, errors };
    }

    async function onFix() {
        if (state.running || state.fixing) return;
        return runAutoFixSession({
            onDone: () => updateFixButton(),
        });
    }

    function updateFixButton() {
        const fixBtn = $('envCheckFixBtn');
        const manualBtn = $('envCheckManualBtn');
        const vis = computeFixVisibility(state.result);
        if (fixBtn) {
            fixBtn.classList.toggle('hidden', !vis.showFix);
            fixBtn.disabled = state.running || state.fixing || !vis.showFix;
            if (!state.fixing) fixBtn.textContent = '一键修复';
        }
        if (manualBtn) {
            manualBtn.classList.toggle('hidden', !vis.showManual);
            // 检测中禁用；一键修复中（含修复内重检）仍可点「手动下载」
            manualBtn.disabled = !vis.showManual || (state.running && !state.fixing);
        }
    }

    function applyFixButtons(fixBtn, manualBtn, result, { busy = false, fixing = false } = {}) {
        const vis = computeFixVisibility(result);
        if (fixBtn) {
            fixBtn.classList.toggle('hidden', !vis.showFix && !fixing);
            fixBtn.disabled = busy || (!vis.showFix && !fixing);
            if (!fixing) fixBtn.textContent = '一键修复';
        }
        if (manualBtn) {
            manualBtn.classList.toggle('hidden', !vis.showManual);
            // busy 时仅在「非修复」场景禁用；一键修复中保持可点
            manualBtn.disabled = !vis.showManual || (busy && !fixing);
        }
        return vis;
    }

    /** Track real check outcomes so a partial fix (e.g. GPU only) still continues. */
    function envIssueSignature(result) {
        const items = Array.isArray(result?.items) ? result.items : [];
        return items
            .filter((it) => it && (it.status === 'fail' || it.status === 'warn'))
            .map((it) => `${it.id}|${it.status}|${String(it.detail || '').slice(0, 120)}`)
            .sort()
            .join('\n');
    }

    async function runCheck(opts = {}) {
        const duringFix = !!opts.duringFix;
        if (state.running) return state.result;
        if (state.fixing && !duringFix) return state.result;
        state.running = true;
        setBusy(true);
        if (!duringFix) {
            setSubtitle('正在检查依赖项…');
        }
        renderItems(DEFAULT_ITEMS.map((it) => ({ ...it, status: 'checking' })));

        const result = await performEnvCheck(opts.payload || { quick: true, syncLlamaBackend: true });
        state.result = result;
        renderItems(result.items);
        if (!duringFix) {
            setSubtitle(summarizeCheckResult(result));
        }
        state.running = false;
        if (duringFix) {
            // Keep UI locked while multi-round fix continues.
            setBusy(true);
            const fixBtn = $('envCheckFixBtn');
            if (fixBtn) {
                fixBtn.classList.remove('hidden');
                fixBtn.disabled = true;
                fixBtn.textContent = '修复中…';
            }
        } else {
            setBusy(false);
            updateFixButton();
        }
        return result;
    }

    function cloneFixPlan(plan) {
        if (!plan || typeof plan !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(plan));
        } catch (_) {
            return {
                fixable: !!plan.fixable,
                openVcRedist: !!plan.openVcRedist,
                ensureGpu: !!plan.ensureGpu,
                ensureLlamaRuntime: !!plan.ensureLlamaRuntime,
                force: !!plan.force,
                modelIds: Array.isArray(plan.modelIds) ? plan.modelIds.slice() : [],
                forceIds: Array.isArray(plan.forceIds) ? plan.forceIds.slice() : [],
                steps: Array.isArray(plan.steps) ? plan.steps.map((s) => ({ ...s })) : [],
                manualHints: Array.isArray(plan.manualHints) ? plan.manualHints.map((h) => ({ ...h })) : [],
            };
        }
    }

    function planHasAutoWork(plan) {
        if (!plan) return false;
        const models = Array.isArray(plan.modelIds) ? plan.modelIds.filter(Boolean) : [];
        return !!plan.openVcRedist
            || !!plan.ensureGpu
            || !!plan.ensureLlamaRuntime
            || models.length > 0;
    }

    function closeModal() {
        const modal = $('envCheckModal');
        if (modal) modal.classList.add('hidden');
        state.open = false;
    }

    async function openModal(opts = {}) {
        const modal = $('envCheckModal');
        if (!modal) return;
        state.open = true;
        state.afterStart = typeof opts.afterStart === 'function' ? opts.afterStart : null;
        const startBtn = $('envCheckStartBtn');
        if (startBtn) startBtn.textContent = '完成';
        // Keep above main UI stacking contexts (emptyState z-5 / filePanel z-10).
        try {
            if (modal.parentElement === document.body) {
                document.body.appendChild(modal);
            }
        } catch (_) { /* ignore */ }
        modal.classList.remove('hidden');
        await runCheck();
    }

    async function onStart() {
        if (state.running || state.fixing) return;
        const blocking = (state.result?.items || []).filter((it) => it.blocking && it.status === 'fail');
        if (blocking.length) {
            const names = blocking.map((it) => it.label).join('、');
            const proceed = global.TransubAppConfirm
                ? await global.TransubAppConfirm({
                    title: '仍有未通过项',
                    message: `以下项未通过：${names}。缺少 Visual C++ 等依赖时，SenseVoice 可能无法加载。仍要继续吗？`,
                    primaryLabel: '仍要继续',
                    secondaryLabel: '返回修复',
                })
                : window.confirm(`以下项未通过：${names}。仍要继续吗？`);
            if (!proceed) return;
        }
        markDone();
        closeModal();
        if (typeof state.afterStart === 'function') {
            state.afterStart({ result: state.result });
        }
    }

    async function maybeAutoOpen() {
        // First launch opens setup wizard (not the system-check modal).
        return false;
    }

    function bind() {
        $('openEnvCheckBtn')?.addEventListener('click', () => {
            void openModal({ afterStart: null });
        });
        $('envCheckStartBtn')?.addEventListener('click', () => { void onStart(); });
        $('envCheckFixBtn')?.addEventListener('click', () => { void onFix(); });
        $('envCheckManualBtn')?.addEventListener('click', () => { void onManualDownload(); });
        $('envCheckRetryBtn')?.addEventListener('click', () => { void runCheck(); });
        $('envCheckList')?.addEventListener('click', (event) => {
            const btn = event.target?.closest?.('[data-env-action-url]');
            if (!btn) return;
            const url = btn.getAttribute('data-env-action-url');
            if (url) void electron?.openExternal?.(url);
        });
        document.addEventListener('keydown', (event) => {
            const modal = $('envCheckModal');
            if (!modal || modal.classList.contains('hidden')) return;
            const confirmEl = $('appConfirmModal');
            if (confirmEl && !confirmEl.classList.contains('hidden')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (state.fixing || state.running) return;
                // First-run: Escape does not skip without marking; require 开始使用.
                if (!isDone()) return;
                closeModal();
            }
        });
    }

    function init() {
        bind();
        setTimeout(() => { void maybeAutoOpen(); }, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }

    global.TransubEnvCheck = {
        open: openModal,
        close: closeModal,
        run: runCheck,
        fix: onFix,
        manualDownload: onManualDownload,
        maybeAutoOpen,
        isDone,
        markDone,
        DONE_KEY,
        DEFAULT_ITEMS,
        renderItemsInto,
        performEnvCheck,
        summarizeCheckResult,
        computeFixVisibility,
        applyFixButtons,
        runAutoFixSession,
        runManualDownloadSession,
        requestFixSwitchToManual,
        listNeededManualKindsFromResult,
    };
}(window));
