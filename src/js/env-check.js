/**
 * First-run system check modal (install path / FFmpeg / VC++ / GPU / Engine / ASR).
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const DONE_KEY = 'transub.envCheck.done';

    function uiTf(template, vars) {
        const api = global.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        return global.TransubI18n?.tx?.(text) ?? String(text || '');
    }

    /** Live-merge preferred PyPI mirror so mid-fix select changes apply to the next download. */
    function withDownloadExtras(base) {
        return {
            ...(base && typeof base === 'object' ? base : {}),
            ...(global.TransubPipMirrorUi?.downloadPayloadPatch?.() || {}),
        };
    }

    /** @type {ReturnType<typeof global.TransubEnvFixStart.createWhlDropController>|null} */
    let envCheckWhlDrop = null;

    function buildGpuFormPayloadFromResult(result) {
        const gpuItem = (result?.items || []).find((it) => it.id === 'gpuRuntime') || {};
        return manualFormPayload(result, {
            asrGpuReady: gpuItem.asrGpuReady === true,
            ortGpuCuda: gpuItem.ortGpuCuda === true,
            ortGpuRequirement: gpuItem.ortGpuRequirement || '',
            ortOnly: gpuItem.asrGpuReady === true && gpuItem.ortGpuCuda === false,
        });
    }

    function ensureEnvCheckWhlDrop() {
        if (envCheckWhlDrop) return envCheckWhlDrop;
        const FixStart = global.TransubEnvFixStart;
        if (typeof FixStart?.createWhlDropController !== 'function') return null;
        envCheckWhlDrop = FixStart.createWhlDropController({
            $,
            electron,
            uiTx,
            uiTf,
            esc,
            ids: FixStart.ENV_CHECK_WHL_IDS || {
                zone: 'envCheckWhlDropZone',
                list: 'envCheckWhlPathList',
                empty: 'envCheckWhlPathEmpty',
                clear: 'envCheckWhlClearPathsBtn',
                install: 'envCheckWhlInstallBtn',
                status: 'envCheckWhlStatus',
                exportBtn: 'envCheckWhlExportBtn',
                panel: 'envCheckWhlPanel',
            },
            onInstall: (paths) => {
                void (async () => {
                    envCheckWhlDrop?.setBusy(true);
                    try {
                        const res = await runManualDownloadSession({
                            initialPaths: paths,
                            preferInstall: true,
                        });
                        if (res?.ok) envCheckWhlDrop?.clearPaths(uiTx('安装完成，已重新检测'));
                    } finally {
                        envCheckWhlDrop?.setBusy(false);
                        syncEnvCheckRepairTools();
                    }
                })();
            },
            onExport: (paths) => {
                void (async () => {
                    envCheckWhlDrop?.setBusy(true);
                    try {
                        await runManualDownloadSession({
                            initialPaths: paths,
                            preferInstall: false,
                        });
                    } finally {
                        envCheckWhlDrop?.setBusy(false);
                        syncEnvCheckRepairTools();
                    }
                })();
            },
        });
        return envCheckWhlDrop;
    }

    function syncEnvCheckRepairTools() {
        try {
            global.TransubPipMirrorUi?.bindSelects?.({ uiTx });
        } catch (_) { /* ignore */ }
        const drop = ensureEnvCheckWhlDrop();
        drop?.bindOnce();
        // Inline .whl panel stays collapsed;「手动修复」opens shared manualWhlModal.
        drop?.setPanelVisible(false);
        if (state.result) {
            drop?.setFormPayload(buildGpuFormPayloadFromResult(state.result));
        }
        drop?.setBusy(state.running || state.fixing);
    }

    /** Keep「手动修复」visible whenever「自动修复」is shown (wizard parity). */
    function syncManualBesideFix(fixBtn, manualBtn) {
        if (!manualBtn || !fixBtn) return;
        if (!fixBtn.classList.contains('hidden')) {
            manualBtn.classList.remove('hidden');
        }
    }

    const DEFAULT_ITEMS = [
        { id: 'installPath', label: '安装路径（仅限 ASCII 字符）' },
        { id: 'ffmpeg', label: 'FFmpeg / FFprobe' },
        { id: 'vcRedist', label: 'Visual C++ 运行库' },
        { id: 'gpu', label: 'GPU' },
        { id: 'gpuDriver', label: 'GPU 驱动版本' },
        { id: 'gpuRuntime', label: 'GPU 运行时' },
        { id: 'engine', label: 'Transub Engine' },
        { id: 'llamaServerRuntime', label: 'llama-server 运行时' },
        { id: 'torchEngineStartup', label: 'PyTorch 引擎启动探测' },
        { id: 'asrModel', label: 'ASR 模型' },
        { id: 'vadModel', label: 'VAD 模型（FSMN）' },
        { id: 'lidModel', label: '语种探测模型' },
        { id: 'sensevoiceRuntime', label: 'SenseVoice 运行库' },
        { id: 'qwenRuntime', label: 'Qwen3-ASR 运行库' },
        { id: 'whisperRuntime', label: 'Whisper 运行库' },
    ];
    const BASE_ITEM_IDS = [
        'installPath', 'ffmpeg', 'vcRedist', 'gpu', 'gpuDriver', 'gpuRuntime', 'engine',
        'llamaServerRuntime', 'torchEngineStartup',
    ];
    const RUNTIME_ITEM_IDS = [
        'asrModel', 'vadModel', 'lidModel', 'sensevoiceRuntime', 'qwenRuntime', 'torchEngineStartup', 'whisperRuntime',
    ];

    function itemsForScope(scope) {
        const s = String(scope || 'full').trim().toLowerCase();
        if (s === 'base') return DEFAULT_ITEMS.filter((it) => BASE_ITEM_IDS.includes(it.id));
        if (s === 'runtime') return DEFAULT_ITEMS.filter((it) => RUNTIME_ITEM_IDS.includes(it.id));
        return DEFAULT_ITEMS.slice();
    }

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';

    const state = {
        running: false,
        fixing: false,
        open: false,
        result: null,
        afterStart: null,
        envKeysBound: false,
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
                + `<span class="env-check-passed-summary-text">${uiTf('已通过 {count} 项', { count: okItems.length })}</span>`
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
        const torchItem = items.find((it) => it.id === 'torchEngineStartup');
        const torchBad = !!(torchItem
            && (torchItem.status === 'fail' || torchItem.status === 'warn')
            && !torchItem.skipped);
        if (torchBad) {
            const amd = items.some((it) => it.id === 'gpu' && String(it.vendor || '').toLowerCase() === 'amd');
            return uiTx(
                amd
                    ? '检测完成：PyTorch 引擎启动探测未通过。请点「自动修复」把 ROCm PyTorch 装进引擎运行时（系统 pip 无效），完成后重新检测。'
                    : '检测完成：PyTorch 引擎启动探测未通过（与真实转写同序）。请点「自动修复」或「手动修复」补齐 CUDA PyTorch，完成后重新检测。',
            );
        }
        if (fails > 0) {
            return whisperPolicy
                ? uiTf('检测完成：{fails} 项未通过。Whisper 可能被系统策略拦截，可点「自动修复」或「手动修复」。', { fails })
                : (warns
                    ? uiTf('检测完成：{fails} 项未通过，{warns} 项需注意。缺什么可点「自动修复」或「手动修复」。', { fails, warns })
                    : uiTf('检测完成：{fails} 项未通过。缺什么可点「自动修复」或「手动修复」。', { fails }));
        }
        if (warns > 0) {
            return uiTf('检测完成：环境可用，有 {count} 项提示。可点「自动修复」或「手动修复」补齐。', { count: warns });
        }
        return uiTx('检测完成：依赖项正常（含 PyTorch 引擎启动探测）。');
    }

    function chipStateFromItem(item) {
        if (!item) return { state: 'busy', label: '待检测' };
        if (item.status === 'ok') {
            const short = String(item.detail || '正常').trim();
            return { state: 'ok', label: short.length > 28 ? `${short.slice(0, 28)}…` : (short || '正常') };
        }
        if (item.status === 'warn') return { state: 'warn', label: '注意' };
        if (item.status === 'fail') return { state: 'err', label: '需修复' };
        if (item.status === 'checking') return { state: 'busy', label: '检测中…' };
        return { state: 'busy', label: '待检测' };
    }

    function mergeChipStates(...infos) {
        const list = infos.filter(Boolean);
        const merge = global.TransubSetupWizardDetect?.mergeChipStates;
        if (typeof merge === 'function') return merge(...list);
        if (!list.length) return { state: 'busy', label: '待检测' };
        if (list.some((x) => x.state === 'fail' || x.state === 'error' || x.state === 'err')) {
            const bad = list.find((x) => x.state === 'fail' || x.state === 'error' || x.state === 'err');
            return { state: 'err', label: bad.label || '需修复' };
        }
        if (list.some((x) => x.state === 'busy' || x.state === 'checking')) {
            return { state: 'busy', label: '检测中…' };
        }
        if (list.some((x) => x.state === 'warn')) {
            return { state: 'warn', label: '注意' };
        }
        if (list.every((x) => x.state === 'ok')) {
            return { state: 'ok', label: '正常' };
        }
        return list[0];
    }

    function setEnvCheckModalChip(which, info = {}) {
        const map = {
            base: { chip: 'envCheckChipBase', state: 'envCheckChipBaseState' },
            engine: { chip: 'envCheckChipEngine', state: 'envCheckChipEngineState' },
            accel: { chip: 'envCheckChipAccel', state: 'envCheckChipAccelState' },
        };
        const ids = map[which];
        if (!ids) return;
        const chip = $(ids.chip);
        const stateEl = $(ids.state);
        const state = String(info?.state || '').trim() || 'busy';
        const label = String(info?.label || '').trim();
        if (chip) chip.setAttribute('data-state', state);
        if (stateEl && label) stateEl.textContent = label;
    }

    function syncEnvCheckModalChips(result) {
        const items = Array.isArray(result?.items) ? result.items : [];
        const byId = (id) => items.find((it) => it && it.id === id);
        const pathItem = byId('installPath');
        const ffmpegItem = byId('ffmpeg');
        const vcItem = byId('vcRedist');
        const engineItem = byId('engine');
        const asrItem = byId('asrModel');
        const senseItem = byId('sensevoiceRuntime');
        const qwenItem = byId('qwenRuntime');
        const whisperItem = byId('whisperRuntime');
        const gpuItem = byId('gpu');
        const gpuRtItem = byId('gpuRuntime');
        const llamaItem = byId('llamaServerRuntime');
        const torchItem = byId('torchEngineStartup');

        setEnvCheckModalChip('base', mergeChipStates(
            chipStateFromItem(pathItem),
            chipStateFromItem(ffmpegItem),
            chipStateFromItem(vcItem),
        ));
        setEnvCheckModalChip('engine', mergeChipStates(
            chipStateFromItem(engineItem),
            asrItem ? chipStateFromItem(asrItem) : null,
            senseItem ? chipStateFromItem(senseItem) : null,
            qwenItem ? chipStateFromItem(qwenItem) : null,
            whisperItem ? chipStateFromItem(whisperItem) : null,
        ));
        setEnvCheckModalChip('accel', mergeChipStates(
            chipStateFromItem(gpuItem),
            chipStateFromItem(gpuRtItem),
            chipStateFromItem(llamaItem),
            torchItem && !torchItem.skipped ? chipStateFromItem(torchItem) : null,
        ));

        // Keep 设置 → 运行环境 overview chips in sync with the same result.
        try {
            const ui = global.TransubSettingsModalUi;
            if (!ui?.setEnvOverviewChip) return;
            ui.setEnvOverviewChip('engine', chipStateFromItem(engineItem));
            const gpuChip = mergeChipStates(
                chipStateFromItem(gpuItem),
                chipStateFromItem(gpuRtItem),
                torchItem && !torchItem.skipped ? chipStateFromItem(torchItem) : null,
            );
            ui.setEnvOverviewChip('gpu', gpuChip);
            ui.setEnvOverviewChip('llama', chipStateFromItem(llamaItem));
            if (engineItem?.status === 'ok') {
                ui.setEnvGpuActionsEnabled?.(true);
            }
        } catch (_) { /* optional */ }
    }

    function bindEnvCheckOverviewChips() {
        const overview = $('envCheckOverview');
        if (!overview || overview.dataset.bound === '1') return;
        overview.dataset.bound = '1';
        overview.addEventListener('click', (event) => {
            const chip = event.target?.closest?.('.settings-env-chip[data-env-target]');
            if (!chip || !overview.contains(chip)) return;
            const list = $('envCheckList');
            if (!list) return;
            try {
                list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (_) {
                list.scrollIntoView();
            }
            list.classList.add('is-env-flash');
            setTimeout(() => list.classList.remove('is-env-flash'), 700);
        });
    }

    function whisperRuntimeBad(result) {
        return (result?.items || []).some((it) => (
            it?.id === 'whisperRuntime'
            && (it.status === 'fail' || it.status === 'warn')
            && !it.probeTimedOut
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
        const showReuseCuda = hasNvidiaGpuInResult(result)
            && !!(electron?.transubEngineScanCuda && electron?.transubEngineAdoptCuda);
        return { showFix, showManual, showReuseCuda, fixable };
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
        const sizeHint = info.sizeHint ? `\n${uiTf('体积约 {size}。', { size: info.sizeHint })}` : '';
        const message = (
            (detail ? `${detail}\n\n` : '')
            + uiTf('将打开「{label}」下载链接。{sizeHint}\n目标版本：{tag}\n\n下载完成后请到设置 → 运行环境 →「选择 zip 安装」或「检测」。', {
                label: info.runtimeLabel || 'llama-server',
                sizeHint,
                tag: info.runtimeTag || '—',
            })
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
                    ? uiTf('已打开下载链接。解压或安装目标：{folder}', { folder: info.folder })
                    : uiTx('已打开下载链接'),
            };
        } catch (err) {
            return { ok: false, error: err?.message || '无法打开下载链接' };
        }
    }

    function resolveLiveCheckPayload(extra = {}) {
        const asr = String(
            $('engineAsrModelSelect')?.value
            || $('quickAsrModelSelect')?.value
            || '',
        ).trim();
        const ffmpegPath = String($('ffmpegPathInput')?.value || '').trim();
        const engineInstallPath = String($('engineInstallPathInput')?.value || '').trim();
        return {
            quick: true,
            // Settings「系统检查」与向导 prepare 同源：完整项 + Torch serve 启动探测。
            scope: 'full',
            syncLlamaBackend: true,
            ...(ffmpegPath ? { ffmpegPath } : {}),
            ...(engineInstallPath ? { engineInstallPath } : {}),
            // Prefer live form ASR so soft-AV Anime Whisper / SenseVoice scopes match UI.
            ...(asr ? { engineAsrModel: asr } : {}),
            ...(extra && typeof extra === 'object' ? extra : {}),
        };
    }

    async function performEnvCheck(payload = {}) {
        let result = null;
        const request = {
            ...resolveLiveCheckPayload(),
            ...(payload && typeof payload === 'object' ? payload : {}),
            // System check + wizard: align llama-server to detected CUDA (NVIDIA) or ROCm (AMD).
            syncLlamaBackend: payload?.syncLlamaBackend !== false,
        };
        const scopeItems = itemsForScope(request.scope);
        try {
            result = await electron?.transubEnvCheck?.(request);
        } catch (err) {
            result = {
                ok: false,
                error: err?.message || String(err),
                items: scopeItems.map((it) => ({
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
                items: scopeItems.map((it) => ({
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
        if (m <= 0) return uiTf('{s} 秒', { s });
        return uiTf('{m} 分 {s} 秒', { m, s: String(s).padStart(2, '0') });
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
        const msg = String(message || uiTx('修复中…')).trim();
        const n = Number(pct);
        const pctPart = Number.isFinite(n) ? uiTf('（{pct}%）', { pct: Math.round(Math.max(0, Math.min(100, n))) }) : '';
        const elapsed = startedAt ? uiTf(' · 已等待 {elapsed}', { elapsed: formatElapsed(Date.now() - startedAt) }) : '';
        const recv = Number(meta.downloadedBytes);
        const total = Number(meta.totalBytes);
        const speed = Number(meta.bytesPerSecond);
        const sizeBits = [];
        if (Number.isFinite(recv) && recv >= 0) {
            const recvLabel = formatFixBytes(recv) || `${Math.round(recv)} B`;
            if (Number.isFinite(total) && total > 0) {
                sizeBits.push(`${recvLabel} / ${formatFixBytes(total)}`);
            } else {
                sizeBits.push(uiTf('已下 {size}', { size: recvLabel }));
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
        const reuseBtn = $('envCheckReuseCudaBtn');
        const retryBtn = $('envCheckRetryBtn');
        if (startBtn) startBtn.disabled = busy;
        if (retryBtn) retryBtn.disabled = busy;
        if (fixBtn) {
            const fixable = !!state.result?.fix?.fixable;
            const whisperBad = (state.result?.items || []).some((it) => (
                it?.id === 'whisperRuntime'
                && (it.status === 'fail' || it.status === 'warn')
                && !it.probeTimedOut
            ));
            const showFix = fixable || whisperBad || state.fixing;
            fixBtn.classList.toggle('hidden', !showFix);
            if (state.fixing) {
                fixBtn.disabled = false;
                fixBtn.textContent = '取消修复';
                fixBtn.title = '停止当前自动修复';
            } else {
                fixBtn.disabled = busy || !showFix;
                fixBtn.title = showFix ? '自动联网下载并安装缺失依赖' : '';
                fixBtn.textContent = '自动修复';
            }
        }
        if (manualBtn) {
            const manualable = canOfferManualDownload();
            manualBtn.classList.toggle('hidden', !manualable);
            manualBtn.disabled = !manualable || (busy && !state.fixing);
            syncManualBesideFix(fixBtn, manualBtn);
        }
        if (reuseBtn) {
            const showReuse = computeFixVisibility(state.result).showReuseCuda;
            reuseBtn.classList.toggle('hidden', !showReuse);
            reuseBtn.disabled = busy || !showReuse;
        }
        syncEnvCheckRepairTools();
    }

    function hasNvidiaGpu() {
        return hasNvidiaGpuInResult(state.result);
    }

    function isTorchCudaInstallError(text) {
        const s = String(text || '');
        return /TORCH_CUDA|TORCH_REIMPORT|no kernel image|cudaerrornokernelimagefordevice|改装\s*CUDA|CUDA\s*版\s*PyTorch|CPU\s*版\s*PyTorch|WinError 1114|already has a docstring|引擎启动探测/i.test(s);
    }

    function isTokenizersMismatchResult(result) {
        const items = result?.items || [];
        const qwen = items.find((it) => it.id === 'qwenRuntime');
        if (qwen?.tokenizersMismatch) return true;
        const detail = String(qwen?.detail || '');
        return /tokenizers.*不兼容|tokenizers==0\.22\.2|tokenizers.*0\.23\.1/i.test(detail);
    }

    function torchCudaFormPayload(result = state.result) {
        const items = result?.items || [];
        const gpuRt = items.find((it) => it.id === 'gpuRuntime') || {};
        const gpuHw = items.find((it) => it.id === 'gpu') || {};
        const gpuDriver = items.find((it) => it.id === 'gpuDriver') || {};
        const cudaFromDriver = String(gpuDriver.detail || '').match(/CUDA\s+([\d.]+)/i);
        const driverCudaVersion = String(
            gpuRt.driverCudaVersion
                || (cudaFromDriver ? cudaFromDriver[1] : ''),
        ).trim();
        let driverCudaMajor = gpuRt.driverCudaMajor;
        if (!driverCudaMajor && driverCudaVersion) {
            driverCudaMajor = Number(String(driverCudaVersion).split('.')[0]);
        }
        const gpuName = String(gpuRt.gpuName || gpuHw.detail || '').trim();
        return {
            needsTorchCuda128: gpuRt.needsTorchCuda128 ?? undefined,
            torchCudaVariant: gpuRt.torchCudaVariant || undefined,
            computeCap: gpuRt.computeCap ?? undefined,
            gpuName: gpuName || undefined,
            driverCudaVersion: driverCudaVersion || undefined,
            driverCudaMajor: driverCudaMajor ?? undefined,
        };
    }

    function manualFormPayload(result, extras = {}) {
        return { ...torchCudaFormPayload(result), ...extras };
    }

    function manualKindsForFailure(errText, result) {
        const kinds = listNeededManualKindsFromResult(result)
            .filter((k) => k !== 'gpu' || hasNvidiaGpuInResult(result));
        if (isTorchCudaInstallError(errText) && hasNvidiaGpuInResult(result)) {
            return ['torch-cuda', ...kinds.filter((k) => k !== 'torch-cuda')];
        }
        return kinds;
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
            if (hasNvidiaGpuInResult(result)) {
                kinds.push('torch-cuda');
            } else if (hasAmdGpuInResult(result)) {
                kinds.push('torch-rocm');
            }
        }
        if (
            steps.some((s) => s?.id === 'qwenRuntime')
            || statusOf('qwenRuntime') === 'fail'
            || statusOf('qwenRuntime') === 'warn'
            || isTokenizersMismatchResult(result)
            || (Array.isArray(plan.modelIds) && plan.modelIds.some((id) => /qwen3-asr/i.test(String(id))))
        ) {
            if (hasAmdGpuInResult(result)) kinds.push('torch-rocm');
            else kinds.push('torch-cuda');
        }
        const gpuRt = items.find((it) => it.id === 'gpuRuntime') || {};
        if (gpuRt.torchCudaMismatch && hasNvidiaGpuInResult(result)) {
            kinds.push('torch-cuda');
        }
        if (gpuRt.hasRocm && !gpuRt.torchRocm && hasAmdGpuInResult(result)) {
            kinds.push('torch-rocm');
        }
        if (
            plan.ensureTorchRocm
            || steps.some((s) => s?.id === 'torchRocm')
        ) {
            kinds.push('torch-rocm');
        }
        if (
            plan.ensureTorchCuda
            || steps.some((s) => s?.id === 'torchEngineStartup' || s?.id === 'audioSeparate')
            || statusOf('torchEngineStartup') === 'fail'
            || statusOf('torchEngineStartup') === 'warn'
        ) {
            if (hasAmdGpuInResult(result)) {
                kinds.push('torch-rocm');
            } else if (hasNvidiaGpuInResult(result)) {
                kinds.push('torch-cuda');
            }
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
        return [...new Set(kinds.filter(Boolean))];
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

    function hasAmdGpuInResult(result) {
        const gpu = (result?.items || []).find((it) => it.id === 'gpu');
        return String(gpu?.vendor || '').toLowerCase() === 'amd';
    }

    function hasNvidiaGpuInResult(result) {
        const gpu = (result?.items || []).find((it) => it.id === 'gpu');
        if (!gpu || gpu.status !== 'ok') return false;
        const vendor = String(gpu.vendor || '').toLowerCase();
        if (vendor === 'amd') return false;
        if (vendor === 'nvidia') return true;
        const detail = String(gpu.detail || '');
        // AMD discrete GPUs are also status=ok for llama-server; do not treat as NVIDIA/CUDA.
        if (/AMD|Radeon|ROCm/i.test(detail) && !/NVIDIA|GeForce|RTX|GTX/i.test(detail)) {
            return false;
        }
        return true;
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
                    ? uiTf('已打开镜像页。请将文件放到：{folder}', { folder })
                    : uiTx('已打开模型镜像页'),
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
            setSubtitleFn('当前没有可手动修复的项。');
            return { ok: false, error: 'nothing_to_manual' };
        }
        const plan = result?.fix || {};
        const kinds = listNeededManualKindsFromResult(result);
        const modalKinds = kinds.filter((k) => k !== 'llamaRuntime' || !!electron?.transubAdvancedManagedLlmDownloadInfo);
        const whlKinds = modalKinds.filter((k) => k !== 'llamaRuntime');

        if (modalKinds.length && global.TransubManualWhlInstall?.openModal) {
            const labels = modalKinds.map((k) => {
                if (k === 'sensevoice') return 'SenseVoice';
                if (k === 'whisper') return 'Whisper';
                if (k === 'llamaRuntime') return 'llama-server';
                return 'GPU';
            });
            setSubtitleFn(uiTf('正在打开手动修复（{labels}）…', { labels: labels.join(' + ') }));
            // PreferInstall path shows progress inside the manual modal; keep a calm outer tip.
            if (ui.preferInstall) {
                setSubtitleFn('正在打开手动安装窗口…安装可能需要几分钟，请耐心等待。');
            }
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
                kind: modalKinds[0],
                kinds: modalKinds,
                formPayload: manualFormPayload(result, gpuExtras),
                initialPaths: Array.isArray(ui.initialPaths) ? ui.initialPaths : [],
                preferInstall: !!ui.preferInstall && whlKinds.length > 0,
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
            setSubtitleFn(res?.error || '手动修复未完成。');
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

        setSubtitleFn('当前没有可手动修复的项。');
        return { ok: false, error: 'nothing_to_manual' };
    }

    /** Active auto-fix session; used so「手动修复 / 取消修复」can abort mid-fix. */
    let activeFixSession = null;

    function requestFixSwitchToManual() {
        if (!activeFixSession?.requestSwitchToManual) return false;
        activeFixSession.requestSwitchToManual();
        return true;
    }

    function requestCancelFix() {
        if (!activeFixSession?.requestCancel) return false;
        activeFixSession.requestCancel();
        return true;
    }

    function abortInFlightFixDownloads() {
        try { void electron?.transubEngineCancelDownload?.(); } catch (_) { /* ignore */ }
        try { void electron?.transubAdvancedManagedLlmCancelPull?.(); } catch (_) { /* ignore */ }
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

    function setFixButtonCancelMode(fixBtn, on) {
        const btn = fixBtn || $('envCheckFixBtn');
        if (!btn) return;
        btn.classList.remove('hidden');
        if (on) {
            btn.disabled = false;
            btn.textContent = '取消修复';
            btn.title = '停止当前自动修复';
        }
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
        const downloadExtraBase = ui.downloadPayload && typeof ui.downloadPayload === 'object'
            ? ui.downloadPayload
            : {};
        const downloadExtra = () => withDownloadExtras(downloadExtraBase);
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
            ensureTorchCuda: false,
            ensureTorchRocm: false,
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
                ? uiTf('当前项需手动处理：{item}', { item: manual[0] })
                : uiTx('当前没有可自动修复的项。'));
            return { ok: false, error: 'nothing_fixable' };
        }

        const FixProgress = global.TransubEnvFixProgress || {};
        const FixStart = global.TransubEnvFixStart || {};
        const startSummary = typeof FixStart.buildFixStartSummary === 'function'
            ? FixStart.buildFixStartSummary(initialPlan, { uiTx, uiTf })
            : (typeof FixProgress.buildFixModeChoiceMessage === 'function'
                ? FixProgress.buildFixModeChoiceMessage(initialPlan, { uiTx, uiTf })
                : uiTx('请选择修复方式。可「手动修复」下载安装，或「自动修复」联网补齐。'));
        let choice = 'cancel';
        /** @type {string[]} */
        let startPaths = [];
        const preferStart = String(ui.startMode || '').trim().toLowerCase();
        if (preferStart === 'auto' || preferStart === 'manual') {
            choice = preferStart;
        } else if (typeof FixStart.createEnvFixStartModal === 'function') {
            const startUi = FixStart.createEnvFixStartModal({
                $,
                electron,
                uiTx,
                uiTf,
                esc,
            });
            const gpuItem = (getResult()?.items || []).find((it) => it.id === 'gpuRuntime') || {};
            const picked = await startUi.open(initialPlan, {
                formPayload: manualFormPayload(getResult(), {
                    asrGpuReady: gpuItem.asrGpuReady === true,
                    ortGpuCuda: gpuItem.ortGpuCuda === true,
                    ortGpuRequirement: gpuItem.ortGpuRequirement || '',
                }),
            });
            choice = picked?.action || 'cancel';
            startPaths = Array.isArray(picked?.paths) ? picked.paths.filter(Boolean) : [];
        } else if (global.TransubAppConfirmChoice) {
            const legacy = await global.TransubAppConfirmChoice({
                title: '选择修复方式',
                message: startSummary,
                primaryLabel: '手动修复',
                secondaryLabel: '自动修复',
                tertiaryLabel: '取消',
            });
            choice = legacy === 'primary' ? 'manual' : (legacy === 'secondary' ? 'auto' : 'cancel');
        } else {
            choice = window.confirm(startSummary) ? 'manual' : 'cancel';
        }
        if (choice === 'manual' || choice === 'install') {
            return runManualDownloadSession({
                getResult,
                setSubtitle: setSubtitleFn,
                recheck: (opts) => recheck(opts),
                initialPaths: startPaths,
                preferInstall: choice === 'install',
            });
        }
        if (choice !== 'auto') return { ok: false, cancelled: true };

        let switchToManual = false;
        let userCancelled = false;
        const requestSwitchToManual = () => {
            if (switchToManual || userCancelled) return;
            switchToManual = true;
            setSubtitleFn('正在取消自动修复，改为手动修复…');
            enableManualButton(manualBtn);
            abortInFlightFixDownloads();
        };
        const requestCancel = () => {
            if (userCancelled) return;
            userCancelled = true;
            setSubtitleFn('正在取消修复…');
            setFixButtonCancelMode(fixBtn, true);
            if (fixBtn) {
                fixBtn.disabled = true;
                fixBtn.textContent = '取消中…';
            }
            abortInFlightFixDownloads();
        };
        activeFixSession = { requestSwitchToManual, requestCancel, getResult };

        markFixing(true);
        setBusyFn(true);
        setFixHintFn(true);
        // 修复中保持「手动修复」可点
        enableManualButton(manualBtn);
        setSubtitleFn('正在开始自动修复…');
        await new Promise((r) => setTimeout(r, 120));

        const fixStartedAt = Date.now();
        setFixButtonCancelMode(fixBtn, true);

        let unsub = null;
        let elapsedTimer = null;
        const errors = [];
        let lastFixMsg = '正在开始自动修复…';
        let lastFixPct = null;
        let lastFixMeta = {};
        let manualCancelled = false;
        let openedVcRedist = false;
        const maxRounds = 5;
        let roundsDone = 0;
        let lastIssues = '';
        let plan = initialPlan;
        let sessionOk = false;
        let progressUi = null;
        let activeFixStepId = '';
        let activeFixPhaseIds = [];
        if (typeof FixProgress.createEnvFixProgressModal === 'function') {
            progressUi = FixProgress.createEnvFixProgressModal({ $, esc, uiTx, uiTf });
            progressUi.open(
                typeof FixProgress.collectFixProgressItems === 'function'
                    ? FixProgress.collectFixProgressItems(initialPlan)
                    : [],
                {
                    onCancel: requestCancel,
                    onSwitchManual: requestSwitchToManual,
                },
            );
        }

        const beginFixPhase = (kind, msg) => {
            lastFixMeta = {};
            lastFixPct = null;
            progressUi?.setTransferLine?.('');
            activeFixPhaseIds = typeof FixProgress.stepIdsForFixPhase === 'function'
                ? FixProgress.stepIdsForFixPhase(kind, plan)
                : [];
            activeFixStepId = activeFixPhaseIds[0] || '';
            if (progressUi && activeFixStepId) {
                progressUi.setActive(activeFixStepId, { message: msg || '', pct: 0, transfer: '' });
            }
        };
        const completeFixPhase = (msg) => {
            progressUi?.completeMany?.(activeFixPhaseIds, msg);
            activeFixPhaseIds = [];
        };
        const failFixPhase = (msg) => {
            progressUi?.failMany?.(activeFixPhaseIds, msg);
            activeFixPhaseIds = [];
        };

        const isAbortRequested = () => userCancelled || switchToManual || manualCancelled;

        const setProgress = (msg, pct, meta) => {
            lastFixMsg = msg || lastFixMsg;
            if (pct != null) lastFixPct = pct;
            if (meta) {
                lastFixMeta = {
                    ...lastFixMeta,
                    ...meta,
                    bytesPerSecond: meta.bytesPerSecond ?? meta.speed ?? lastFixMeta.bytesPerSecond,
                    downloadedBytes: meta.downloadedBytes ?? lastFixMeta.downloadedBytes,
                    totalBytes: meta.totalBytes ?? lastFixMeta.totalBytes,
                };
            }
            const n = Number(lastFixPct);
            const pctPart = Number.isFinite(n) ? uiTf('（{pct}%）', { pct: Math.round(Math.max(0, Math.min(100, n))) }) : '';
            const elapsed = uiTf(' · 已等待 {elapsed}', { elapsed: formatElapsed(Date.now() - fixStartedAt) });
            const transfer = typeof FixProgress.formatTransferDetail === 'function'
                ? FixProgress.formatTransferDetail(lastFixMeta)
                : (() => {
                    const recv = Number(lastFixMeta.downloadedBytes);
                    const total = Number(lastFixMeta.totalBytes);
                    const speed = Number(lastFixMeta.bytesPerSecond);
                    const sizeBits = [];
                    if (Number.isFinite(recv) && recv >= 0) {
                        const recvLabel = formatFixBytes(recv) || `${Math.round(recv)} B`;
                        if (Number.isFinite(total) && total > 0) {
                            sizeBits.push(`${recvLabel} / ${formatFixBytes(total)}`);
                        } else {
                            sizeBits.push(uiTf('已下 {size}', { size: recvLabel }));
                        }
                    }
                    if (Number.isFinite(speed) && speed > 0) {
                        sizeBits.push(`${formatFixBytes(speed)}/s`);
                    }
                    return sizeBits.join(' · ');
                })();
            const sizePart = transfer ? ` · ${transfer}` : '';
            const line = `${lastFixMsg}${pctPart}${elapsed}${sizePart}`;
            setSubtitleFn(line);
            if (progressUi) {
                const matched = typeof FixProgress.matchFixStepFromProgress === 'function'
                    ? FixProgress.matchFixStepFromProgress(lastFixMsg, progressUi.getRows?.() || [], activeFixStepId)
                    : activeFixStepId;
                if (matched && matched !== activeFixStepId) {
                    activeFixStepId = matched;
                    if (!activeFixPhaseIds.includes(matched)) activeFixPhaseIds.push(matched);
                    progressUi.setActive(matched);
                }
                if (activeFixStepId) {
                    progressUi.update(activeFixStepId, {
                        message: lastFixMsg,
                        pct: Number.isFinite(n) ? n : lastFixPct,
                        transfer,
                    });
                }
                // Subtitle keeps the status text; transfer line is dedicated for size/speed.
                progressUi.setSubtitle?.(`${lastFixMsg}${pctPart}${elapsed}`);
                progressUi.setTransferLine?.(transfer);
            }
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
                            downloadedBytes: p?.downloadedBytes ?? p?.receivedBytes ?? p?.loaded,
                            totalBytes: p?.totalBytes ?? p?.total,
                            bytesPerSecond: p?.bytesPerSecond ?? p?.speed,
                        },
                    );
                    try {
                        progressUi?.noteProgressMirror?.(p);
                    } catch (_) { /* ignore */ }
                    if (p?.suggestManual) {
                        setFixHintFn(true);
                        enableManualButton(manualBtn);
                        const cudaHint = /改装\s*CUDA|CUDA\s*PyTorch|torch_cuda/i.test(String(p?.message || ''));
                        const hintText = cudaHint
                            ? 'CUDA PyTorch 下载较慢（约 2.5GB）；若长时间无进度请点「手动修复」用浏览器直链下载 torch / torchaudio（RTX 50 系：CUDA 13 驱动选 cu130，否则 cu128）。'
                            : '当前镜像吞吐较低或可能卡住；可随时点「手动修复」，用浏览器下载 .whl 后本地安装。';
                        if (ui.fixHintEl) {
                            ui.fixHintEl.textContent = hintText;
                        } else {
                            const hint = $('envCheckFixHint');
                            if (hint) hint.textContent = hintText;
                        }
                    }
                });
            }

            while (roundsDone < maxRounds && !isAbortRequested()) {
                if (!planHasAutoWork(plan)) break;

                const issues = envIssueSignature(getResult());
                if (roundsDone > 0 && issues === lastIssues) {
                    errors.push('修复后仍有相同问题，请改用「手动修复」或查看详情');
                    break;
                }
                lastIssues = issues;
                roundsDone += 1;

                if (roundsDone > 1) {
                    setProgress(uiTf('继续修复剩余项（第 {n} 轮）…', { n: roundsDone }), null, {});
                    lastFixPct = null;
                    lastFixMeta = {};
                }

                if (plan.openVcRedist && !openedVcRedist) {
                    openedVcRedist = true;
                    beginFixPhase('vc', uiTx('正在打开 Visual C++ 运行库下载页…'));
                    setProgress(uiTx('正在打开 Visual C++ 运行库下载页…'), null, {});
                    const url = getResult()?.urls?.vcRedist || 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
                    try {
                        await electron?.openExternal?.(url);
                        completeFixPhase(uiTx('已打开下载页'));
                    } catch (err) {
                        errors.push(err?.message || '打开 VC++ 下载页失败');
                        failFixPhase(err?.message || '打开失败');
                    }
                }
                if (isAbortRequested()) break;

                const modelIds = Array.isArray(plan.modelIds) ? plan.modelIds.filter(Boolean) : [];
                if (modelIds.length) {
                    beginFixPhase('models', uiTf('正在下载/补齐：{ids}…', { ids: modelIds.join('、') }));
                    setProgress(uiTf('正在下载/补齐：{ids}…', { ids: modelIds.join('、') }), 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持引擎下载');
                        failFixPhase('当前环境不支持引擎下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'models',
                            modelIds,
                            force: !!plan.force,
                            forceIds: Array.isArray(plan.forceIds) ? plan.forceIds : undefined,
                            engineAutoStart: true,
                            skipGpuPrestep: !hasNvidiaGpuInResult(getResult()),
                            ...downloadExtra(),
                        });
                        if (isAbortRequested()) break;
                        if (!res?.ok) {
                            failFixPhase(res?.error || res?.message || '下载失败');
                            if (res?.cancelled || userCancelled) {
                                manualCancelled = true;
                                errors.push(res?.error || '已取消下载');
                                break;
                            }
                            const errText = res?.error || res?.message || '模型/运行库下载失败';
                            const kinds = res?.manualKind
                                ? [String(res.manualKind), ...manualKindsForFailure(errText, getResult())]
                                : manualKindsForFailure(errText, getResult());
                            const uniqueKinds = [...new Set(kinds.filter(Boolean))];
                            if (uniqueKinds.length && global.TransubManualWhlInstall?.openModal) {
                                const useManual = global.TransubAppConfirm
                                    ? await global.TransubAppConfirm({
                                        title: '自动下载失败',
                                        message: uiTf('{err}\n\n是否改为「手动修复」下载运行库 .whl？', {
                                            err: String(errText).slice(0, 500),
                                        }),
                                        primaryLabel: '手动修复',
                                        secondaryLabel: '取消',
                                    })
                                    : window.confirm('自动下载失败，是否改为手动修复？');
                                if (isAbortRequested()) break;
                                if (useManual) {
                                    const manualRes = await global.TransubManualWhlInstall.openModal({
                                        kind: uniqueKinds[0],
                                        kinds: uniqueKinds,
                                        errorText: errText,
                                        formPayload: torchCudaFormPayload(getResult()),
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
                        } else {
                            completeFixPhase(uiTx('已完成'));
                        }
                    }
                }

                if (!isAbortRequested() && plan.ensureGpu && hasNvidiaGpuInResult(getResult())) {
                    // Prefer adopting system / nearby CUDA before downloading nvidia-* wheels.
                    beginFixPhase('gpu', '正在尝试复用本机 CUDA…');
                    setProgress('正在尝试复用本机 CUDA…', 0, {});
                    if (electron?.transubEngineScanCuda && electron?.transubEngineAdoptCuda) {
                        try {
                            const scan = await electron.transubEngineScanCuda({
                                major: 12,
                                engineAutoStart: true,
                                ...downloadExtra(),
                            });
                            if (scan?.ok && scan.found) {
                                setProgress('正在复用本机 CUDA 到引擎…', 0, {});
                                const adopt = await electron.transubEngineAdoptCuda({
                                    major: 12,
                                    engineAutoStart: true,
                                    ...downloadExtra(),
                                });
                                if (adopt?.ok) {
                                    setSubtitleFn(adopt.message || '已复用本机 CUDA');
                                }
                            }
                        } catch (_) { /* fall through to download */ }
                    }
                    if (isAbortRequested()) break;
                    setProgress('正在安装 GPU 支持组件…', 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持 GPU 组件下载');
                        failFixPhase('当前环境不支持 GPU 组件下载');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'gpu',
                            force: false,
                            engineAutoStart: true,
                            ...downloadExtra(),
                        });
                        if (isAbortRequested()) break;
                        if (!res?.ok) {
                            failFixPhase(res?.error || res?.message || 'GPU 支持安装失败');
                            if (res?.cancelled || userCancelled) {
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
                        } else {
                            completeFixPhase(uiTx('已完成'));
                        }
                    }
                }

                if (!isAbortRequested() && plan.ensureTorchCuda && hasNvidiaGpuInResult(getResult())) {
                    beginFixPhase('torch', '正在补齐 CUDA PyTorch…');
                    setProgress('正在补齐 CUDA PyTorch…', 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持 CUDA PyTorch 安装');
                        failFixPhase('当前环境不支持 CUDA PyTorch 安装');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'demucs',
                            force: true,
                            engineAutoStart: true,
                            ...downloadExtra(),
                        });
                        if (isAbortRequested()) break;
                        if (!res?.ok) {
                            failFixPhase(res?.error || res?.message || 'CUDA PyTorch 安装失败');
                            if (res?.cancelled || userCancelled) {
                                manualCancelled = true;
                                errors.push(res?.error || '已取消下载');
                                break;
                            }
                            const errText = res?.error || res?.message || 'CUDA PyTorch 安装失败';
                            const manualRes = await global.TransubManualWhlInstall?.offerAfterFailure?.({
                                kind: 'torch-cuda',
                                errorText: errText,
                                formPayload: torchCudaFormPayload(getResult()),
                            });
                            if (manualRes?.cancelled) {
                                manualCancelled = true;
                                errors.push(errText);
                            } else if (!manualRes?.ok) {
                                errors.push(errText);
                            }
                        } else {
                            completeFixPhase(uiTx('已完成'));
                        }
                    }
                }

                if (!isAbortRequested() && plan.ensureTorchRocm) {
                    beginFixPhase('torch', '正在补齐 ROCm PyTorch…');
                    setProgress('正在把 ROCm PyTorch 装进引擎运行时…', 0, {});
                    if (!electron?.transubEngineRunDownload) {
                        errors.push('当前环境不支持 ROCm PyTorch 安装');
                        failFixPhase('当前环境不支持 ROCm PyTorch 安装');
                    } else {
                        const res = await electron.transubEngineRunDownload({
                            kind: 'torch-rocm',
                            force: true,
                            engineAutoStart: true,
                            ...downloadExtra(),
                        });
                        if (isAbortRequested()) break;
                        if (!res?.ok) {
                            failFixPhase(res?.error || res?.message || 'ROCm PyTorch 安装失败');
                            if (res?.cancelled || userCancelled) {
                                manualCancelled = true;
                                errors.push(res?.error || '已取消下载');
                                break;
                            }
                            errors.push(res?.error || res?.message || 'ROCm PyTorch 安装失败');
                        } else {
                            completeFixPhase(uiTx('已完成'));
                        }
                    }
                }

                if (!isAbortRequested() && plan.ensureLlamaRuntime) {
                    const llamaStep = (plan.steps || []).find((s) => s?.id === 'llamaServerRuntime');
                    const llamaRuntimeId = String(
                        plan.llamaRuntimeId || llamaStep?.runtimeId || '',
                    ).trim();
                    const llamaMsg = llamaRuntimeId
                        ? uiTf('正在安装 llama-server 运行时（{id}）…', { id: llamaRuntimeId })
                        : uiTx('正在更新 llama-server 运行时…');
                    beginFixPhase('llama', llamaMsg);
                    setProgress(llamaMsg, 0, {});
                    if (!electron?.transubAdvancedManagedLlmInstallRuntime) {
                        errors.push('当前环境不支持 llama-server 运行时安装');
                        failFixPhase('当前环境不支持 llama-server 运行时安装');
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
                                            downloadedBytes: p?.downloadedBytes ?? p?.receivedBytes,
                                            totalBytes: p?.totalBytes,
                                            bytesPerSecond: p?.bytesPerSecond ?? p?.speed,
                                        },
                                    );
                                });
                            }
                        // Prefer hardware-matched CUDA / ROCm package when known.
                        const res = await electron.transubAdvancedManagedLlmInstallRuntime({
                                force: true,
                                runtimeId: llamaRuntimeId || undefined,
                            });
                            if (isAbortRequested()) break;
                            if (!res?.ok) {
                                failFixPhase(res?.error || res?.message || 'llama-server 运行时更新失败');
                                const errText = res?.error || res?.message || 'llama-server 运行时更新失败';
                                if (res?.cancelled || userCancelled) {
                                    manualCancelled = true;
                                    errors.push(errText);
                                    break;
                                }
                                const useManual = global.TransubAppConfirm
                                    ? await global.TransubAppConfirm({
                                        title: '运行时自动下载失败',
                                        message: uiTf('{err}\n\n是否改为「手动修复」？', {
                                            err: String(errText).slice(0, 500),
                                        }),
                                        primaryLabel: '手动修复',
                                        secondaryLabel: '跳过',
                                    })
                                    : window.confirm('运行时自动下载失败，是否改为手动修复？');
                                if (isAbortRequested()) break;
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
                            } else {
                                completeFixPhase(uiTx('已完成'));
                            }
                        } catch (err) {
                            failFixPhase(err?.message || 'llama-server 运行时更新失败');
                            errors.push(err?.message || 'llama-server 运行时更新失败');
                        } finally {
                            try { unsubLlama?.(); } catch (_) { /* ignore */ }
                        }
                    }
                }

                if (isAbortRequested()) break;

                setProgress('本轮修复完成，正在重新检测剩余项…', lastFixPct, lastFixMeta);
                setFixButtonCancelMode(fixBtn, true);
                const next = await recheck({ duringFix: true });
                if (isAbortRequested()) break;
                if (next) setResult(next);
                plan = cloneFixPlan(getResult()?.fix);
                enableManualButton(manualBtn);
                setFixButtonCancelMode(fixBtn, true);
            }

            if (!isAbortRequested()) {
                if (roundsDone === 0) {
                    setSubtitleFn(errors[0] || uiTx('未能开始自动修复。'));
                } else {
                    const stillFixable = planHasAutoWork(getResult()?.fix);
                    if (stillFixable && errors.length) {
                        setSubtitleFn(uiTf('修复未完全成功：{err}。将重新检测…', { err: errors[0] }));
                    } else if (roundsDone > 1) {
                        setSubtitleFn(uiTf('已连续修复 {n} 轮，正在确认最终状态…', { n: roundsDone }));
                    } else {
                        setSubtitleFn(uiTx('修复步骤已完成，正在重新检测…'));
                    }
                    setFixButtonCancelMode(fixBtn, true);
                    const finalResult = await recheck({ duringFix: true });
                    if (!userCancelled && finalResult) setResult(finalResult);
                }
                sessionOk = !userCancelled && errors.length === 0 && roundsDone > 0;
            }
        } catch (err) {
            errors.push(err?.message || String(err));
        } finally {
            if (elapsedTimer) clearInterval(elapsedTimer);
            try { unsub?.(); } catch (_) { /* ignore */ }
            activeFixSession = null;
            markFixing(false);
            setFixHintFn(false);
            if (progressUi) {
                if (switchToManual) {
                    failFixPhase(uiTx('改为手动修复'));
                    progressUi.close();
                } else {
                    if (userCancelled) failFixPhase(uiTx('已取消'));
                    progressUi.finish({
                        ok: !userCancelled && errors.length === 0,
                        subtitle: lastFixMsg || uiTx('修复结束'),
                    });
                }
            }
        }

        if (switchToManual && !userCancelled) {
            setSubtitleFn('已改为手动修复…');
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

        if (userCancelled || manualCancelled) {
            setSubtitleFn(
                userCancelled
                    ? uiTx('已取消修复。')
                    : (errors[0] ? uiTf('已取消修复：{err}', { err: errors[0] }) : uiTx('已取消修复。')),
            );
            setBusyFn(false);
            if (typeof ui.onDone === 'function') ui.onDone({ cancelled: true, userCancelled: !!userCancelled });
            return { ok: false, cancelled: true, userCancelled: !!userCancelled, errors };
        }

        if (roundsDone === 0) {
            setBusyFn(false);
            if (typeof ui.onDone === 'function') ui.onDone({ ok: false });
            return { ok: false, error: errors[0] || 'no_rounds', errors };
        }

        setBusyFn(false);
        if (typeof ui.onDone === 'function') ui.onDone({ ok: sessionOk, roundsDone, errors });
        return { ok: sessionOk, roundsDone, errors };
    }

    async function onFix() {
        if (state.fixing) {
            requestCancelFix();
            return { ok: false, cancelling: true };
        }
        if (state.running) return;
        return runAutoFixSession({
            startMode: 'auto',
            onDone: () => updateFixButton(),
        });
    }

    /**
     * Scan + optionally adopt system / nearby CUDA into the engine.
     * Shared by system-check modal and setup wizard.
     */
    function dirnamePath(p) {
        const s = String(p || '').trim();
        if (!s) return '';
        const cut = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
        if (cut <= 0) return s;
        if (/\.(dll|so|dylib)$/i.test(s.slice(cut + 1))) return s.slice(0, cut);
        return s;
    }

    function uniqueCudaScanPaths(scan) {
        const out = [];
        const seen = new Set();
        const add = (raw) => {
            const dir = dirnamePath(raw);
            if (!dir) return;
            const key = dir.replace(/\//g, '\\').toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(dir);
        };
        const walkHits = (cov) => {
            if (!cov || typeof cov !== 'object') return;
            const markers = cov.markers && typeof cov.markers === 'object' ? cov.markers : {};
            Object.values(markers).forEach(add);
            (Array.isArray(cov.best?.dirs) ? cov.best.dirs : []).forEach(add);
        };
        walkHits(scan?.cuda13);
        walkHits(scan?.cuda12);
        (Array.isArray(scan?.paths) ? scan.paths : []).forEach(add);
        (Array.isArray(scan?.best?.dirs) ? scan.best.dirs : []).forEach(add);
        return collapseCudaSourceRoots(out);
    }

    /** Keep 1–2 source roots so the confirm dialog stays short. */
    function collapseCudaSourceRoots(dirs) {
        const list = Array.isArray(dirs) ? dirs.filter(Boolean) : [];
        if (list.length <= 2) return list;
        const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '');
        const ranked = list.slice().sort((a, b) => a.length - b.length);
        const roots = [];
        for (const dir of ranked) {
            const n = norm(dir).toLowerCase();
            if (roots.some((r) => n === norm(r).toLowerCase() || n.startsWith(`${norm(r).toLowerCase()}\\`))) {
                continue;
            }
            roots.push(dir);
            if (roots.length >= 2) break;
        }
        return roots;
    }

    function formatCudaScanFoundMessage(scan) {
        const paths = uniqueCudaScanPaths(scan);
        const pathLine = paths.length
            ? paths.map((p) => p).join('\n')
            : '';
        if (pathLine) {
            return uiTf('已找到可复用的本机 CUDA。\n\n来源路径：\n{path}\n\n将复制到引擎目录（跳过 nvidia-* 大包下载）。', {
                path: pathLine,
            });
        }
        return uiTx('已找到可复用的本机 CUDA。\n\n将复制到引擎目录（跳过 nvidia-* 大包下载）。');
    }

    /**
     * Shared by system-check modal and setup wizard.
     */
    async function runReuseCudaSession(ui = {}) {
        const setSubtitleFn = typeof ui.setSubtitle === 'function' ? ui.setSubtitle : setSubtitle;
        const recheck = typeof ui.recheck === 'function' ? ui.recheck : runCheck;
        const downloadExtraBase = ui.downloadPayload && typeof ui.downloadPayload === 'object'
            ? ui.downloadPayload
            : {};
        const downloadExtra = () => withDownloadExtras(downloadExtraBase);
        if (!electron?.transubEngineScanCuda || !electron?.transubEngineAdoptCuda) {
            setSubtitleFn('当前环境不支持扫描本机 CUDA');
            return { ok: false, error: 'unsupported' };
        }
        if (state.running || state.fixing) {
            return { ok: false, error: 'busy' };
        }
        setSubtitleFn('正在扫描本机 CUDA…');
        try {
            const scan = await electron.transubEngineScanCuda({
                major: 12,
                engineAutoStart: true,
                ...downloadExtra(),
            });
            if (!scan?.ok) {
                setSubtitleFn(scan?.error || '扫描失败');
                return scan || { ok: false, error: 'scan_failed' };
            }
            if (!scan.found) {
                const pick = global.TransubAppConfirmChoice
                    ? await global.TransubAppConfirmChoice({
                        title: '未找到可复用 CUDA',
                        message: uiTf('{msg}\n\n可手动选择含 cudart/cublas 或 nvidia 包的目录后再扫；或使用「自动修复 / 手动修复」。', {
                            msg: scan.message || '未找到齐全的本机 CUDA 运行库。',
                        }),
                        primaryLabel: '选择 CUDA 目录',
                        secondaryLabel: '知道了',
                    })
                    : 'secondary';
                if (pick === 'primary' && electron.transubEnginePickCudaRoot) {
                    const picked = await electron.transubEnginePickCudaRoot({});
                    if (picked?.ok) {
                        setSubtitleFn(picked.message || '已加入扫描目录，正在重试…');
                        return runReuseCudaSession(ui);
                    }
                    if (picked?.cancelled) {
                        setSubtitleFn('已取消选择目录。');
                        return { ok: false, cancelled: true };
                    }
                    setSubtitleFn(picked?.error || '选择目录失败');
                    return picked || { ok: false, error: 'pick_failed' };
                }
                setSubtitleFn(scan.message || '未找到可复用 CUDA');
                return { ok: true, found: false, message: scan.message };
            }
            const foundMsg = formatCudaScanFoundMessage(scan);
            const choice = global.TransubAppConfirmChoice
                ? await global.TransubAppConfirmChoice({
                    title: '找到可复用本机 CUDA',
                    message: foundMsg,
                    primaryLabel: '复用到引擎',
                    secondaryLabel: '仅查看',
                })
                : 'primary';
            const paths = uniqueCudaScanPaths(scan);
            setSubtitleFn(
                paths.length
                    ? uiTf('已找到可复用 CUDA：{path}', { path: paths[0] })
                    : uiTx('已找到可复用本机 CUDA'),
            );
            if (choice !== 'primary') {
                return { ok: true, found: true, adopted: false, ...(scan || {}) };
            }
            setSubtitleFn('正在复用本机 CUDA 到引擎…');
            const adopt = await electron.transubEngineAdoptCuda({
                major: 12,
                engineAutoStart: true,
                ...downloadExtra(),
            });
            if (!adopt?.ok) {
                setSubtitleFn(adopt?.error || '复用失败');
                return adopt || { ok: false, error: 'adopt_failed' };
            }
            setSubtitleFn(adopt.message || '已复用本机 CUDA，正在重新检测…');
            await recheck();
            return { ok: true, found: true, adopted: true, ...(adopt || {}) };
        } catch (err) {
            const msg = err?.message || String(err);
            setSubtitleFn(msg);
            return { ok: false, error: msg };
        }
    }

    async function onReuseCuda() {
        if (state.running || state.fixing) return;
        return runReuseCudaSession();
    }

    function updateFixButton() {
        const fixBtn = $('envCheckFixBtn');
        const manualBtn = $('envCheckManualBtn');
        const reuseBtn = $('envCheckReuseCudaBtn');
        const vis = computeFixVisibility(state.result);
        if (fixBtn) {
            fixBtn.classList.toggle('hidden', !vis.showFix && !state.fixing);
            if (state.fixing) {
                fixBtn.disabled = false;
                fixBtn.textContent = '取消修复';
                fixBtn.title = '停止当前自动修复';
            } else {
                fixBtn.disabled = state.running || !vis.showFix;
                fixBtn.title = vis.showFix ? '自动联网下载并安装缺失依赖' : '';
                fixBtn.textContent = '自动修复';
            }
        }
        if (manualBtn) {
            manualBtn.classList.toggle('hidden', !vis.showManual);
            manualBtn.disabled = !vis.showManual || (state.running && !state.fixing);
            syncManualBesideFix(fixBtn, manualBtn);
        }
        if (reuseBtn) {
            reuseBtn.classList.toggle('hidden', !vis.showReuseCuda);
            reuseBtn.disabled = state.running || state.fixing || !vis.showReuseCuda;
        }
        syncEnvCheckRepairTools();
    }

    function applyFixButtons(fixBtn, manualBtn, result, {
        busy = false,
        fixing = false,
        hideWhenIdle = true,
        idleLabel,
    } = {}) {
        const vis = computeFixVisibility(result);
        if (fixBtn) {
            if (hideWhenIdle) {
                fixBtn.classList.toggle('hidden', !vis.showFix && !fixing);
            } else {
                fixBtn.classList.remove('hidden');
            }
            if (fixing) {
                fixBtn.disabled = false;
                fixBtn.textContent = '取消修复';
                fixBtn.title = '停止当前自动修复';
            } else {
                fixBtn.disabled = busy || !vis.showFix;
                fixBtn.title = '';
                if (idleLabel) fixBtn.textContent = idleLabel;
                else if (hideWhenIdle) fixBtn.textContent = '自动修复';
            }
        }
        if (manualBtn) {
            manualBtn.classList.toggle('hidden', !vis.showManual);
            // busy 时仅在「非修复」场景禁用；自动修复中保持可点（改为手动修复）
            manualBtn.disabled = !vis.showManual || (busy && !fixing);
            syncManualBesideFix(fixBtn, manualBtn);
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
        syncEnvCheckModalChips({
            items: DEFAULT_ITEMS.map((it) => ({ ...it, status: 'checking' })),
        });

        const result = await performEnvCheck(opts.payload || resolveLiveCheckPayload());
        state.result = result;
        renderItems(result.items);
        syncEnvCheckModalChips(result);
        if (!duringFix) {
            setSubtitle(summarizeCheckResult(result));
        }
        state.running = false;
        if (duringFix) {
            // Keep UI locked while multi-round fix continues; cancel stays available.
            setBusy(true);
            setFixButtonCancelMode($('envCheckFixBtn'), true);
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
                ensureTorchCuda: !!plan.ensureTorchCuda,
                ensureTorchRocm: !!plan.ensureTorchRocm,
                ensureLlamaRuntime: !!plan.ensureLlamaRuntime,
                llamaRuntimeId: String(plan.llamaRuntimeId || '').trim(),
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
            || !!plan.ensureTorchCuda
            || !!plan.ensureTorchRocm
            || !!plan.ensureLlamaRuntime
            || models.length > 0;
    }

    function closeModal() {
        const modal = $('envCheckModal');
        if (modal) modal.classList.add('hidden');
        state.open = false;
    }

    async function openModal(opts = {}) {
        // Fragment may load after first bind(); ensure handlers + chips exist.
        bind();
        const modal = $('envCheckModal');
        if (!modal || modal.getAttribute('data-ui-fragment') === 'pending') return;
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
        syncEnvCheckRepairTools();
        await runCheck();
    }

    async function onStart() {
        if (state.running || state.fixing) return;
        const blocking = (state.result?.items || []).filter((it) => it.blocking && it.status === 'fail');
        const torchFail = blocking.find((it) => it.id === 'torchEngineStartup');
        if (torchFail) {
            const amd = hasAmdGpuInResult(state.result)
                || !!torchFail.needsTorchRocm
                || /ROCm|AMD|Radeon/i.test(String(torchFail.detail || ''));
            const proceed = global.TransubAppConfirm
                ? await global.TransubAppConfirm({
                    title: 'PyTorch 引擎启动未通过',
                    message: (
                        uiTx('PyTorch 引擎启动探测失败（与真实 Qwen/SenseVoice 转写同序）。')
                        + '\n\n'
                        + (amd
                            ? uiTx('建议先点「自动修复」把 ROCm PyTorch 装进引擎运行时并重新检测；强行继续时转写仍可能立刻失败。仍要关闭吗？')
                            : uiTx('建议先点「自动修复」或「手动修复」补齐 CUDA PyTorch 并重新检测；强行继续时转写仍可能立刻失败。仍要关闭吗？'))
                    ),
                    primaryLabel: '仍要关闭',
                    secondaryLabel: '返回修复',
                })
                : window.confirm(uiTx('PyTorch 引擎启动探测未通过，仍要关闭系统检查吗？'));
            if (!proceed) return;
        } else if (blocking.length) {
            const names = blocking.map((it) => it.label).join('、');
            const proceed = global.TransubAppConfirm
                ? await global.TransubAppConfirm({
                    title: '仍有未通过项',
                    message: uiTf('以下项未通过：{names}。缺少 Visual C++ 等依赖时，SenseVoice 可能无法加载。仍要继续吗？', { names }),
                    primaryLabel: '仍要继续',
                    secondaryLabel: '返回修复',
                })
                : window.confirm(uiTf('以下项未通过：{names}。缺少 Visual C++ 等依赖时，SenseVoice 可能无法加载。仍要继续吗？', { names }));
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

    function bindEnvCheckOpener() {
        const openBtn = $('openEnvCheckBtn');
        if (!openBtn || openBtn.dataset.envCheckOpenBound === '1') return;
        openBtn.dataset.envCheckOpenBound = '1';
        openBtn.addEventListener('click', () => {
            void openModal({ afterStart: null });
        });
    }

    function bind() {
        const modal = $('envCheckModal');
        bindEnvCheckOpener();
        if (!modal || modal.getAttribute('data-ui-fragment') === 'pending') return;
        if (modal.dataset.envCheckBound === '1') return;
        modal.dataset.envCheckBound = '1';
        bindEnvCheckOverviewChips();
        syncEnvCheckRepairTools();

        $('envCheckStartBtn')?.addEventListener('click', () => { void onStart(); });
        $('envCheckFixBtn')?.addEventListener('click', () => { void onFix(); });
        $('envCheckReuseCudaBtn')?.addEventListener('click', () => { void onReuseCuda(); });
        $('envCheckManualBtn')?.addEventListener('click', () => { void onManualDownload(); });
        $('envCheckRetryBtn')?.addEventListener('click', () => { void runCheck(); });
        $('envCheckList')?.addEventListener('click', (event) => {
            const btn = event.target?.closest?.('[data-env-action-url]');
            if (!btn) return;
            const url = btn.getAttribute('data-env-action-url');
            if (url) void electron?.openExternal?.(url);
        });
        if (!state.envKeysBound) {
            state.envKeysBound = true;
            document.addEventListener('keydown', (event) => {
                const m = $('envCheckModal');
                if (!m || m.classList.contains('hidden')) return;
                const confirmEl = $('appConfirmModal');
                if (confirmEl && !confirmEl.classList.contains('hidden')) return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    if (state.fixing) {
                        requestCancelFix();
                        return;
                    }
                    if (state.running) return;
                    // First-run: Escape does not skip without marking; require 开始使用.
                    if (!isDone()) return;
                    closeModal();
                }
            });
        }
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
    global.addEventListener?.('transub-ui-fragment-ready', (ev) => {
        const key = ev?.detail?.key;
        if (key === 'factory-modals' || key === 'settings-panels') bind();
    });

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
        itemsForScope,
        BASE_ITEM_IDS,
        RUNTIME_ITEM_IDS,
        resolveLiveCheckPayload,
        renderItemsInto,
        performEnvCheck,
        summarizeCheckResult,
        syncEnvCheckModalChips,
        computeFixVisibility,
        applyFixButtons,
        runAutoFixSession,
        runManualDownloadSession,
        runReuseCudaSession,
        requestFixSwitchToManual,
        requestCancelFix,
        listNeededManualKindsFromResult,
    };
}(window));
