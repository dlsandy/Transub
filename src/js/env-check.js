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
        { id: 'asrModel', label: 'ASR 模型' },
        { id: 'vadModel', label: 'VAD 模型（FSMN）' },
        { id: 'lidModel', label: '语种探测模型' },
        { id: 'sensevoiceRuntime', label: 'SenseVoice 运行库' },
        { id: 'whisperRuntime', label: 'Whisper 运行库' },
    ];

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';

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

    function renderItems(items) {
        const host = $('envCheckList');
        if (!host) return;
        host.innerHTML = items.map((it) => {
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
        }).join('');
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
        const supportBtn = $('envCheckSupportBtn');
        if (startBtn) startBtn.disabled = busy;
        if (retryBtn) retryBtn.disabled = busy;
        if (supportBtn) supportBtn.disabled = busy;
        if (fixBtn) {
            const fixable = !!state.result?.fix?.fixable;
            fixBtn.classList.toggle('hidden', !fixable && !state.fixing);
            fixBtn.disabled = busy || (!fixable && !state.fixing);
            if (!state.fixing) fixBtn.textContent = '一键修复';
        }
        if (manualBtn) {
            const manualable = canOfferManualDownload();
            manualBtn.classList.toggle('hidden', !manualable);
            manualBtn.disabled = busy || !manualable;
        }
    }

    function hasNvidiaGpu() {
        const gpu = (state.result?.items || []).find((it) => it.id === 'gpu');
        // checkGpu(): NVIDIA → status ok; otherwise warn (CPU).
        return gpu?.status === 'ok';
    }

    function canOfferManualDownload() {
        return listNeededManualKinds().length > 0
            || (Array.isArray(state.result?.fix?.modelIds) && state.result.fix.modelIds.length > 0);
    }

    function listNeededManualKinds() {
        const plan = state.result?.fix || {};
        const steps = Array.isArray(plan.steps) ? plan.steps : [];
        const items = state.result?.items || [];
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
        return kinds;
    }

    function preferredManualKind() {
        const kinds = listNeededManualKinds();
        return kinds[0] || 'gpu';
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
            const items = Array.isArray(res?.info?.items) ? res.info.items : [];
            const urls = items
                .map((it) => it.defaultUrl || it.mirrorUrl || it.officialUrl)
                .filter(Boolean);
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

    async function onManualDownload() {
        if (state.running || state.fixing) return;
        if (!canOfferManualDownload()) {
            setSubtitle('当前没有可手动下载的项。');
            return;
        }
        const plan = state.result?.fix || {};
        const kinds = listNeededManualKinds();

        if (kinds.length && global.TransubManualWhlInstall?.openModal) {
            const labels = kinds.map((k) => {
                if (k === 'sensevoice') return 'SenseVoice';
                if (k === 'whisper') return 'Whisper';
                return 'GPU';
            });
            setSubtitle(`正在打开手动下载（${labels.join(' + ')}）…`);
            const res = await global.TransubManualWhlInstall.openModal({
                kind: kinds[0],
                kinds,
            });
            if (res?.ok) {
                setSubtitle(res.message || '手动安装完成，正在重新检测…');
                await runCheck();
                return;
            }
            if (res?.cancelled) {
                setSubtitle('已取消手动下载。');
                return;
            }
            // Non-cancel failure: stop here (do not auto-open hub pages).
            setSubtitle(res?.error || '手动下载未完成。');
            return;
        }

        if (Array.isArray(plan.modelIds) && plan.modelIds.length) {
            const opened = await openModelMirrorLinks(plan.modelIds);
            if (opened.ok) {
                setSubtitle(opened.message);
            } else {
                setSubtitle(opened.error || '打开模型镜像失败');
            }
            return;
        }

        setSubtitle('当前没有可手动下载的项。');
    }

    function updateFixButton() {
        const fixBtn = $('envCheckFixBtn');
        const manualBtn = $('envCheckManualBtn');
        const fixable = !!state.result?.fix?.fixable;
        if (fixBtn) {
            fixBtn.classList.toggle('hidden', !fixable);
            fixBtn.disabled = state.running || state.fixing || !fixable;
            if (!state.fixing) fixBtn.textContent = '一键修复';
        }
        if (manualBtn) {
            const manualable = canOfferManualDownload();
            manualBtn.classList.toggle('hidden', !manualable);
            manualBtn.disabled = state.running || state.fixing || !manualable;
        }
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
        if (state.running) return;
        if (state.fixing && !duringFix) return;
        state.running = true;
        setBusy(true);
        if (!duringFix) {
            setSubtitle('正在检查依赖项…');
        }
        renderItems(DEFAULT_ITEMS.map((it) => ({ ...it, status: 'checking' })));

        let result = null;
        try {
            result = await electron?.transubEnvCheck?.({ quick: true });
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

        state.result = result;
        renderItems(result.items);
        const fails = Number(result.failCount || result.items.filter((i) => i.status === 'fail').length || 0);
        const warns = Number(result.warnCount || result.items.filter((i) => i.status === 'warn').length || 0);
        if (!duringFix) {
            if (fails > 0) {
                setSubtitle(`检测完成：${fails} 项未通过${warns ? `，${warns} 项需注意` : ''}。可点「一键修复」或仍继续使用。`);
            } else if (warns > 0) {
                setSubtitle(`检测完成：环境可用，有 ${warns} 项提示。可点「一键修复」补齐可选依赖。`);
            } else {
                setSubtitle('检测完成：依赖项正常。');
            }
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
    }

    async function onFix() {
        if (state.running || state.fixing) return;
        const initialPlan = state.result?.fix;
        if (!initialPlan?.fixable) {
            setSubtitle('当前没有可自动修复的项。');
            return;
        }

        const stepLabels = (initialPlan.steps || []).map((s) => s.label).filter(Boolean);
        const manual = (initialPlan.manualHints || []).map((h) => h.label).filter(Boolean);
        const preview = [
            stepLabels.length ? `将执行：\n· ${stepLabels.join('\n· ')}` : '',
            manual.length ? `\n以下项需手动处理：\n· ${manual.join('\n· ')}` : '',
            '\n下载可能需要数分钟，是否开始？\n（网络不佳时可改用「手动下载」）',
            '\n将自动连续修复多项，无需反复点击。',
        ].filter(Boolean).join('');

        const proceed = global.TransubAppConfirm
            ? await global.TransubAppConfirm({
                title: '一键修复',
                message: preview,
                primaryLabel: '开始修复',
                secondaryLabel: '取消',
            })
            : window.confirm(preview);
        if (!proceed) return;

        state.fixing = true;
        setBusy(true);
        setFixHintVisible(true);
        const fixStartedAt = Date.now();
        const fixBtn = $('envCheckFixBtn');
        if (fixBtn) {
            fixBtn.classList.remove('hidden');
            fixBtn.disabled = true;
            fixBtn.textContent = '修复中…';
        }

        let unsub = null;
        let elapsedTimer = null;
        const errors = [];
        let lastFixMsg = '修复中…';
        let lastFixPct = null;
        let lastFixMeta = {};
        let manualCancelled = false;
        let openedVcRedist = false;
        const maxRounds = 5;
        let roundsDone = 0;
        let lastIssues = '';

        try {
            elapsedTimer = setInterval(() => {
                if (!state.fixing) return;
                setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt, lastFixMeta);
            }, 1000);

            if (electron?.onEngineDownloadProgress) {
                unsub = electron.onEngineDownloadProgress((p) => {
                    lastFixMsg = p?.message || p?.detail || '修复中…';
                    const pct = Number(p?.pct ?? p?.percent);
                    if (Number.isFinite(pct)) lastFixPct = pct;
                    lastFixMeta = {
                        downloadedBytes: p?.downloadedBytes,
                        totalBytes: p?.totalBytes,
                        bytesPerSecond: p?.bytesPerSecond,
                    };
                    setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt, lastFixMeta);
                    if (p?.suggestManual) {
                        const hint = $('envCheckFixHint');
                        if (hint) {
                            hint.textContent = '当前镜像吞吐较低或可能卡住；可随时点「手动下载」，用浏览器下载 .whl 后本地安装（支持断点续传）。';
                            setFixHintVisible(true);
                        }
                    }
                });
            }

            while (roundsDone < maxRounds && !manualCancelled) {
                const plan = state.result?.fix;
                if (!plan?.fixable) break;

                const issues = envIssueSignature(state.result);
                // Stop when a previous round made no observable progress.
                if (roundsDone > 0 && issues === lastIssues) {
                    errors.push('修复后仍有相同问题，请改用手动下载或查看详情');
                    break;
                }
                lastIssues = issues;
                roundsDone += 1;

                if (roundsDone > 1) {
                    lastFixMsg = `继续修复剩余项（第 ${roundsDone} 轮）…`;
                    lastFixPct = null;
                    lastFixMeta = {};
                    setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt);
                }

                if (plan.openVcRedist && !openedVcRedist) {
                    openedVcRedist = true;
                    lastFixMsg = '正在打开 Visual C++ 运行库下载页…';
                    setFixProgressLine(lastFixMsg, null, fixStartedAt);
                    const url = state.result?.urls?.vcRedist || 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
                    try {
                        await electron?.openExternal?.(url);
                    } catch (err) {
                        errors.push(err?.message || '打开 VC++ 下载页失败');
                    }
                }

                if (Array.isArray(plan.modelIds) && plan.modelIds.length) {
                    lastFixMsg = `正在下载/补齐：${plan.modelIds.join('、')}…`;
                    lastFixPct = 0;
                    lastFixMeta = {};
                    setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt);
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持引擎下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'models',
                            modelIds: plan.modelIds,
                            force: !!plan.force,
                            forceIds: Array.isArray(plan.forceIds) ? plan.forceIds : undefined,
                            engineAutoStart: true,
                            // 无 NVIDIA 时跳过 CUDA 预装；有 GPU 时仍自动安装。
                            skipGpuPrestep: !hasNvidiaGpu(),
                        });
                        if (!res?.ok) {
                            const errText = res?.error || res?.message || '模型/运行库下载失败';
                            const kinds = listNeededManualKinds().filter((k) => k !== 'gpu' || hasNvidiaGpu());
                            if (kinds.length && global.TransubManualWhlInstall?.openModal) {
                                const useManual = global.TransubAppConfirm
                                    ? await global.TransubAppConfirm({
                                        title: '自动下载失败',
                                        message: `${String(errText).slice(0, 500)}\n\n是否改为手动下载运行库 .whl？`,
                                        primaryLabel: '手动下载',
                                        secondaryLabel: '取消',
                                    })
                                    : window.confirm('自动下载失败，是否改为手动下载？');
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
                                const opened = await openModelMirrorLinks(plan.modelIds);
                                if (opened.ok) {
                                    errors.push(`${errText}（已打开镜像页，可手动下载后重试检测）`);
                                } else {
                                    errors.push(errText);
                                }
                            }
                        }
                    }
                }

                if (!manualCancelled && plan.ensureGpu && hasNvidiaGpu()) {
                    lastFixMsg = '正在安装 GPU 支持组件…';
                    lastFixPct = 0;
                    lastFixMeta = {};
                    setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt);
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持 GPU 组件下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'gpu',
                            force: false,
                            engineAutoStart: true,
                        });
                        if (!res?.ok) {
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

                if (manualCancelled) break;

                lastFixMsg = roundsDone >= maxRounds
                    ? '本轮修复完成，正在重新检测…'
                    : '本轮修复完成，正在重新检测剩余项…';
                setFixProgressLine(lastFixMsg, lastFixPct, fixStartedAt, lastFixMeta);
                await runCheck({ duringFix: true });
            }
        } catch (err) {
            errors.push(err?.message || String(err));
        } finally {
            if (elapsedTimer) clearInterval(elapsedTimer);
            try { unsub?.(); } catch (_) { /* ignore */ }
            state.fixing = false;
            setFixHintVisible(false);
        }

        if (manualCancelled) {
            setSubtitle(errors[0] ? `已取消修复：${errors[0]}` : '已取消修复。');
            setBusy(false);
            updateFixButton();
            return;
        }

        const stillFixable = !!state.result?.fix?.fixable;
        if (stillFixable && errors.length) {
            setSubtitle(`修复未完全成功：${errors[0]}。将重新检测…`);
        } else if (roundsDone > 1) {
            setSubtitle(`已连续修复 ${roundsDone} 轮，正在确认最终状态…`);
        } else {
            setSubtitle('修复步骤已完成，正在重新检测…');
        }
        await runCheck();
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
        // First launch: only the in-main-window system check. No settings window / wizard.
        if (isStandaloneSettings) return false;
        if (isDone()) return false;
        await openModal({ afterStart: null });
        return true;
    }

    function bind() {
        $('openEnvCheckBtn')?.addEventListener('click', () => {
            void openModal({ afterStart: null });
        });
        $('envCheckStartBtn')?.addEventListener('click', () => { void onStart(); });
        $('envCheckFixBtn')?.addEventListener('click', () => { void onFix(); });
        $('envCheckManualBtn')?.addEventListener('click', () => { void onManualDownload(); });
        $('envCheckRetryBtn')?.addEventListener('click', () => { void runCheck(); });
        $('envCheckSupportBtn')?.addEventListener('click', async () => {
            const url = state.result?.urls?.support || 'https://github.com/dlsandy/Transub';
            try {
                await electron?.openExternal?.(url);
            } catch (_) { /* ignore */ }
        });
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
        // Run slightly before setup wizard auto-open (wizard waits on DONE_KEY).
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
        DONE_KEY,
    };
}(window));
