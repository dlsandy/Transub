/**
 * TransubSetupWizardApply — setup wizard apply / download core.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardApply = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardApplyFactory(global) {
    function createSetupWizardApply(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = d.electron;
        const uiTf = d.uiTf || ((t) => t);
        const uiTx = d.uiTx || ((t) => t);
        const esc = d.esc || ((s) => String(s ?? ''));
        const appConfirmMsg = d.appConfirmMsg || (async (m) => !!(typeof window !== 'undefined' && window.confirm(m)));
        const appConfirmChoice = d.appConfirmChoice || (async (opts) => {
            const ok = await appConfirmMsg(opts?.message || opts, opts || {});
            return ok ? 'primary' : 'secondary';
        });
        const getState = d.getState || (() => ({}));
        const readGoals = d.readGoals || (() => ({}));
        const enginePayloadFromForm = d.enginePayloadFromForm || (() => ({}));
        const defaultAsrFor = d.defaultAsrFor || (() => 'sensevoice-small');
        const defaultMtSelection = d.defaultMtSelection || (() => []);
        const mtSelectionOpts = d.mtSelectionOpts || (() => ({}));
        const collectDownloadModelIds = d.collectDownloadModelIds || (() => []);
        const defaultVadFor = d.defaultVadFor || (() => ['fsmn-vad']);
        const WHISPER_JA_PRIMARY = d.WHISPER_JA_PRIMARY || 'whisper-ja-1.5b';
        const isSakuraModelId = d.isSakuraModelId || (() => false);
        const isManagedLlmModelId = d.isManagedLlmModelId || (() => false);
        const isLightManagedLlmModelId = d.isLightManagedLlmModelId || (() => false);
        const asrListHasWhisperJa = d.asrListHasWhisperJa || (() => false);
        const enforceWhisperJaForSakura = d.enforceWhisperJaForSakura || (() => false);
        const modelLabel = d.modelLabel || ((id) => id);
        const senseIsAdopted = d.senseIsAdopted || (() => false);
        const showStep = d.showStep || (() => {});
        const getSteps = d.getSteps || (() => []);
        const stepIndexOf = d.stepIndexOf || ((id) => getSteps().indexOf(id));
        const ensureHfEndpointPicked = d.ensureHfEndpointPicked
            || d.ensureHfEndpoint
            || (async () => ({ hfEndpoint: '' }));
        const endpointFromPick = d.endpointFromPick || ((p) => (p && p.hfEndpoint != null ? p.hfEndpoint : ''));
        const currentHfEndpoint = d.currentHfEndpoint
            || (() => endpointFromPick(getState().hfPick || null));
        const markOnboardingDone = d.markOnboardingDone || (() => {});
        const readAdvancedEntitled = d.readAdvancedEntitled || (async () => false);
        const TASK_LABELS = d.TASK_LABELS || {};
        const PROFILE_LABELS = d.PROFILE_LABELS || {};
        const LANG_LABELS = d.LANG_LABELS || {};
        const downloadUi = d.downloadUi || null;
        const readPrefsPatch = d.readPrefsPatch || (() => ({}));
        const getNeeds = d.getNeeds || (() => getState().needs || {});
        const core = () => global.TransubCore;

        function appendApplyLine(text, ok) {
            const host = $('setupWizardApplyList');
            if (!host) return;
            const li = document.createElement('li');
            const tone = ok === true ? 'text-emerald-700' : (ok === false ? 'text-red-700' : 'text-gray-700');
            const icon = ok === true ? 'fa-check-circle' : (ok === false ? 'fa-times-circle' : 'fa-spinner fa-spin');
            li.className = `flex gap-2 ${tone}`;
            li.innerHTML = `<i class="fa ${icon} mt-0.5 shrink-0"></i><span>${esc(text)}</span>`;
            host.appendChild(li);
            return li;
        }
    
        function setApplyProgress(visible, message, pct, meta = {}) {
            const wrap = $('setupWizardApplyProgressWrap');
            const bar = $('setupWizardApplyProgressBar');
            const text = $('setupWizardApplyProgressText');
            const pctEl = $('setupWizardApplyProgressPct');
            const detailEl = $('setupWizardApplyProgressDetail');
            const status = $('setupWizardApplyStatus');
            if (wrap) wrap.classList.toggle('hidden', !visible);
            if (text && message != null) text.textContent = String(message);
            const n = Number(pct);
            if (Number.isFinite(n)) {
                const clamped = Math.max(0, Math.min(100, Math.round(n)));
                if (bar) bar.style.width = `${clamped}%`;
                if (pctEl) pctEl.textContent = `${clamped}%`;
            }
            const countLine = visible ? updateApplyItemCount(meta, message, pct) : '';
            // Lower line: item count (avoid duplicating the progress message).
            if (status) {
                status.textContent = visible ? (countLine || '') : '';
            }
            if (detailEl) {
                if (!visible) {
                    detailEl.textContent = '';
                    detailEl.classList.add('hidden');
                    getState().applyProgressMeter = { lastBytes: 0, lastAt: 0, speed: 0, shownRecv: 0, shownTotal: 0, shownSpeed: 0 };
                    getState().applyItemDone = 0;
                } else {
                    const sizeLine = formatApplyProgressDetail(meta);
                    // Always keep a size/speed row during download so the UI does not look empty.
                    detailEl.textContent = sizeLine || uiTx('已下载 — / 总大小 — · 速度 —');
                    detailEl.classList.remove('hidden');
                }
            }
        }
    
        function beginApplyItemProgress(total) {
            const n = Math.max(0, Number(total) || 0);
            getState().applyItemTotal = n;
            getState().applyItemDone = 0;
            getState().applyProgressMeter = {
                lastBytes: 0, lastAt: 0, speed: 0,
                shownRecv: 0, shownTotal: 0, shownSpeed: 0, phaseKey: '',
            };
            const status = $('setupWizardApplyStatus');
            if (status && n > 0) status.textContent = uiTf('已下载 {done}/{total} 个', { done: 0, total: n });
        }
    
        function updateApplyItemCount(meta = {}, message = '', pct) {
            const src = meta && typeof meta === 'object' ? meta : {};
            const raw = src.raw && typeof src.raw === 'object' ? src.raw : {};
            const msg = String(message || src.message || src.detail || raw.detail || '');
            const index = Number(src.index ?? raw.index);
            const rawTotal = Number(
                (Number.isFinite(Number(src.itemTotal)) && Number(src.itemTotal) > 0)
                    ? src.itemTotal
                    : (Number.isFinite(Number(raw.itemTotal)) && Number(raw.itemTotal) > 0)
                        ? raw.itemTotal
                        : (Number(src.total ?? raw.total) < 100 ? (src.total ?? raw.total) : NaN),
            );
    
            if (Number.isFinite(rawTotal) && rawTotal > 0 && rawTotal < 100) {
                getState().applyItemTotal = rawTotal;
            }
            const total = Number(getState().applyItemTotal) || 0;
            if (!total) return '';
    
            let done = Number(getState().applyItemDone) || 0;
            if (/GPU\s*[：:]/i.test(msg) || /CUDA|cublas|nvidia-/i.test(msg)) {
                // GPU pre-step: models not started yet.
                done = 0;
            } else if (Number.isFinite(index) && index > 0) {
                if (/已安装|下载完成|已就绪|完成|done/i.test(msg) || Number(pct) >= 100) {
                    done = Math.min(total, index);
                } else {
                    done = Math.max(0, Math.min(total, index - 1));
                }
            } else if (Number(pct) >= 100) {
                done = total;
            } else if (Number.isFinite(Number(src.done ?? raw.done))) {
                done = Math.max(0, Math.min(total, Number(src.done ?? raw.done)));
            }
            getState().applyItemDone = done;
            return uiTf('已下载 {done}/{total} 个', { done, total });
        }
    
        function formatWizardBytes(n) {
            const v = Number(n);
            if (!Number.isFinite(v) || v < 0) return '';
            if (v < 1024) return `${Math.round(v)} B`;
            if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
            if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
            return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
    
        function formatApplyProgressDetail(meta = {}) {
            const src = meta && typeof meta === 'object' ? meta : {};
            const raw = src.raw && typeof src.raw === 'object' ? src.raw : {};
            const phaseKey = [
                src.stage || raw.stage || src.phase || raw.phase || '',
                src.modelId || raw.modelId || '',
                src.index ?? raw.index ?? '',
                /GPU\s*[：:]|CUDA|cublas|nvidia-/i.test(String(
                    src.message || src.detail || raw.detail || raw.message || '',
                )) ? 'gpu' : 'other',
            ].join('|');
            let received = Number(
                src.downloadedBytes ?? src.received ?? src.downloaded
                ?? raw.downloadedBytes ?? raw.received ?? raw.downloaded,
            );
            let total = Number(
                src.totalBytes ?? src.totalSize
                ?? raw.totalBytes ?? raw.totalSize,
            );
            // Managed LLM progress uses `total` for bytes; ignore tiny integers that look like model counts.
            if (!(Number.isFinite(total) && total > 0)) {
                const maybeTotal = Number(src.total ?? raw.total);
                if (Number.isFinite(maybeTotal) && maybeTotal >= 1024) total = maybeTotal;
            }
            let speed = Number(
                src.bytesPerSecond ?? src.speed
                ?? raw.bytesPerSecond ?? raw.speed,
            );
    
            if (!getState().applyProgressMeter) {
                getState().applyProgressMeter = {
                    lastBytes: 0, lastAt: 0, speed: 0,
                    shownRecv: 0, shownTotal: 0, shownSpeed: 0, phaseKey: '',
                };
            }
            const meter = getState().applyProgressMeter;
            // Reset sticky sizes when the download target changes (GPU ↔ models, next model, …).
            if (phaseKey && meter.phaseKey && phaseKey !== meter.phaseKey) {
                meter.shownRecv = 0;
                meter.shownTotal = 0;
                meter.shownSpeed = 0;
                meter.lastBytes = 0;
                meter.lastAt = 0;
                meter.speed = 0;
            }
            if (phaseKey) meter.phaseKey = phaseKey;
    
            if (Number.isFinite(received) && received > 0) {
                const now = Date.now();
                if (meter.lastAt && received >= meter.lastBytes) {
                    const dt = (now - meter.lastAt) / 1000;
                    if (dt >= 0.2) {
                        meter.speed = (received - meter.lastBytes) / dt;
                        meter.lastBytes = received;
                        meter.lastAt = now;
                    }
                } else {
                    meter.lastBytes = received;
                    meter.lastAt = now;
                }
                meter.shownRecv = received;
                if (!(Number.isFinite(speed) && speed > 0) && meter.speed > 0) {
                    speed = meter.speed;
                }
            } else if (meter.shownRecv > 0) {
                // Keep last known downloaded size instead of flashing 0 B.
                received = meter.shownRecv;
            }
            if (Number.isFinite(total) && total > 0) {
                // Ignore totals that merely mirror received ("12 MB / 12 MB" while growing).
                const mirrorsRecv = Number.isFinite(received) && received > 0
                    && Math.abs(total - received) < Math.max(1024, Math.min(total, received) * 0.02);
                if (mirrorsRecv) {
                    total = meter.shownTotal > 0 ? meter.shownTotal : NaN;
                } else {
                    // Allow total to rise when the next wheel/model announces a larger size.
                    meter.shownTotal = Math.max(meter.shownTotal || 0, total);
                    total = meter.shownTotal;
                }
            } else if (meter.shownTotal > 0) {
                total = meter.shownTotal;
            }
            // If accounting briefly overshoots the estimate, raise the shown total once.
            if (Number.isFinite(received) && Number.isFinite(total)
                && received > 0 && total > 0 && received > total * 1.02) {
                total = received;
                meter.shownTotal = Math.max(meter.shownTotal || 0, total);
            }
            if (Number.isFinite(speed) && speed > 0) {
                meter.shownSpeed = speed;
            } else if (meter.shownSpeed > 0 && Number.isFinite(received) && received > 0) {
                speed = meter.shownSpeed;
            }
    
            const parts = [];
            const hasRecv = Number.isFinite(received) && received > 0;
            const hasTotal = Number.isFinite(total) && total > 0;
            if (hasRecv && hasTotal) {
                parts.push(`${formatWizardBytes(received)} / ${formatWizardBytes(total)}`);
            } else if (hasRecv) {
                parts.push(uiTf('已下载 {size}', { size: formatWizardBytes(received) }));
            } else if (hasTotal) {
                parts.push(uiTf('总大小约 {size}', { size: formatWizardBytes(total) }));
            }
            if (Number.isFinite(speed) && speed > 0) {
                parts.push(`${formatWizardBytes(speed)}/s`);
            }
            return parts.join(' · ');
        }
    
        async function probeInstalledModelIds(modelIds) {
            const ids = (modelIds || []).filter(Boolean);
            /** @type {Record<string, boolean>} */
            const map = { ...getState().installById };
            ids.forEach((id) => {
                if (id === 'silero-vad') map[id] = true;
                else if (!(id in map) && getState().catalogById[id]) {
                    map[id] = !!getState().catalogById[id].installed;
                }
            });
            try {
                const engineIds = ids.filter((id) => !isManagedLlmModelId(id));
                if (engineIds.length && electron?.transubEngineDownloadInfo) {
                    const goals = readGoals();
                    const info = await electron.transubEngineDownloadInfo({
                        ...enginePayloadFromForm(),
                        profile: goals.profile,
                        modelIds: engineIds,
                        hfEndpoint: currentHfEndpoint(),
                    });
                    const catalog = info?.info?.catalog || info?.catalog || info?.info?.models || [];
                    if (Array.isArray(catalog)) {
                        catalog.forEach((m) => {
                            if (m?.id) map[String(m.id)] = !!m.installed;
                        });
                    }
                }
            } catch { /* ignore */ }
            try {
                if (ids.some((id) => isManagedLlmModelId(id)) && electron?.transubAdvancedManagedLlmStatus) {
                    const st = await electron.transubAdvancedManagedLlmStatus();
                    const models = Array.isArray(st?.managed?.catalog) ? st.managed.catalog
                        : (Array.isArray(st?.managed?.models) ? st.managed.models
                            : (Array.isArray(st?.models) ? st.models : []));
                    models.forEach((m) => {
                        if (m?.id) map[String(m.id)] = !!m.installed;
                    });
                }
            } catch { /* ignore */ }
            getState().installById = { ...getState().installById, ...map };
            return map;
        }
    
        /**
         * Ask whether to redownload already-installed models.
         * Primary = skip installed (safe default); secondary = force redownload.
         * @returns {{ force: boolean, modelIds: string[], skippedIds: string[] } | null} null = cancel entirely
         */
        async function resolveRedownloadChoice(selectedIds, installMap) {
            const selected = (selectedIds || []).filter(Boolean);
            const installedIds = selected.filter((id) => id !== 'silero-vad' && installMap[id]);
            const needIds = selected.filter((id) => id !== 'silero-vad' && !installMap[id]);
            if (!installedIds.length) {
                return {
                    force: false,
                    modelIds: selected.filter((id) => id !== 'silero-vad'),
                    skippedIds: selected.filter((id) => id === 'silero-vad'),
                };
            }
            const preview = installedIds.length <= 3
                ? installedIds.map((id) => modelLabel(id)).join('、')
                : `${installedIds.slice(0, 3).map((id) => modelLabel(id)).join('、')} 等 ${installedIds.length} 项`;
            const single = selected.length === 1 && installedIds.length === 1;
            // Primary = skip (safe). Secondary = cancel (Escape-safe). Tertiary = force redownload.
            const choice = await appConfirmChoice({
                title: single ? '模型已下载' : '部分模型已安装',
                message: single
                    ? `「${modelLabel(installedIds[0])}」已下载。\n\n保留本地文件并跳过下载，还是重新下载？`
                    : (
                        `已有 ${installedIds.length} 个模型已下载（${preview}）。\n\n`
                        + '建议跳过已安装项，只下载未安装项。\n'
                        + '若选「重新下载」将强制覆盖已安装文件。'
                    ),
                primaryLabel: single ? '跳过下载' : '跳过已安装',
                secondaryLabel: '取消',
                tertiaryLabel: '重新下载',
                escapeResult: 'secondary',
            });
            if (choice === 'primary') {
                return {
                    force: false,
                    modelIds: needIds.slice(),
                    skippedIds: installedIds.concat(selected.filter((id) => id === 'silero-vad')),
                };
            }
            if (choice === 'tertiary') {
                return {
                    force: true,
                    modelIds: selected.filter((id) => id !== 'silero-vad'),
                    skippedIds: selected.filter((id) => id === 'silero-vad'),
                };
            }
            return null;
        }
    
        async function runEngineDownloadsInWizard({ modelIds, force, patch, profile, hfEndpoint }) {
            if (!modelIds.length) return { ok: true, skipped: true };
            if (!getState().detect.engineOk) {
                appendApplyLine('跳过引擎模型下载（Engine 未就绪）', false);
                return { ok: false, error: 'engine_not_ready' };
            }
            if (!electron?.transubEngineRunDownload) {
                appendApplyLine('当前环境不支持引擎模型下载', false);
                return { ok: false, error: 'unsupported' };
            }
            appendApplyLine(`下载引擎模型（${modelIds.length} 项）${force ? ' · 强制重下' : ''}…`, null);
            beginApplyItemProgress(modelIds.length);
            setApplyProgress(true, `正在下载：${modelIds.map((id) => modelLabel(id)).join('、')}`, 0);
            modelIds.forEach((id) => downloadUi?.markPending?.(id));
            let unsub = null;
            try {
                if (electron.onEngineDownloadProgress) {
                    unsub = electron.onEngineDownloadProgress((p) => {
                        const pct = Number(p?.pct ?? p?.percent);
                        const msg = p?.message || p?.detail || '下载中…';
                        setApplyProgress(true, msg, Number.isFinite(pct) ? pct : undefined, {
                            ...(p || {}),
                            itemTotal: modelIds.length,
                        });
                        downloadUi?.applyProgressEvent?.(p);
                        // Keep runtime (PyPI/CUDA) status visible; don't overwrite with "已完成 x/y".
                        const shared = global.TransubSetupWizardDownloadUi?.isSharedRuntimeProgressEvent?.(p);
                        if (!shared) downloadUi?.summarizeProgress?.();
                    });
                }
                const res = await electron.transubEngineRunDownload({
                    engineInstallPath: patch.engineInstallPath,
                    engineUrl: patch.engineUrl,
                    engineHfEndpoint: hfEndpoint,
                    engineAutoStart: true,
                    kind: 'models',
                    profile,
                    modelIds,
                    hfEndpoint,
                    force: !!force,
                    ...(global.TransubPipMirrorUi?.downloadPayloadPatch?.() || {}),
                });
                if (res?.ok) {
                    const msg = res.message || '引擎模型下载完成';
                    getState().applyItemDone = modelIds.length;
                    setApplyProgress(true, msg, 100, { done: modelIds.length, itemTotal: modelIds.length });
                    appendApplyLine(msg, true);
                    modelIds.forEach((id) => downloadUi?.markDone?.(id));
                    downloadUi?.summarizeProgress?.();
                    return { ok: true };
                }
                if (res?.cancelled) {
                    appendApplyLine(res.error || '已取消引擎模型下载', false);
                    modelIds.forEach((id) => {
                        const row = getState().downloadRows?.[id];
                        if (row && row.status !== 'done') {
                            downloadUi?.markError?.(id, res.error || '已取消');
                        }
                    });
                    return { ok: false, cancelled: true };
                }
                appendApplyLine(res?.error || '引擎模型下载失败', false);
                modelIds.forEach((id) => {
                    const row = getState().downloadRows?.[id];
                    if (row && row.status !== 'done') {
                        downloadUi?.markError?.(id, res?.error || '下载失败');
                    }
                });
                return { ok: false, error: res?.error || 'download_failed' };
            } catch (err) {
                appendApplyLine(err?.message || '引擎模型下载失败', false);
                modelIds.forEach((id) => downloadUi?.markError?.(id, err?.message || '下载失败'));
                return { ok: false, error: err?.message || String(err) };
            } finally {
                try { unsub?.(); } catch (_) { /* ignore */ }
            }
        }
    
        async function runManagedDownloadsInWizard({ modelIds, force }) {
            if (!modelIds.length) return { ok: true, skipped: true };
            if (!electron?.transubAdvancedManagedLlmPull) {
                appendApplyLine('当前环境不支持语言模型下载', false);
                return { ok: false, error: 'unsupported' };
            }
            appendApplyLine(`下载语言模型（${modelIds.length} 项）${force ? ' · 强制重下' : ''}…`, null);
            beginApplyItemProgress(modelIds.length);
            modelIds.forEach((id) => downloadUi?.markPending?.(id));
            let unsub = null;
            try {
                if (electron.onAdvancedManagedLlmProgress) {
                    unsub = electron.onAdvancedManagedLlmProgress((p) => {
                        const pct = Number(p?.pct ?? p?.percent);
                        const msg = p?.message || '下载中…';
                        setApplyProgress(true, msg, Number.isFinite(pct) ? pct : undefined, {
                            ...(p || {}),
                            itemTotal: modelIds.length,
                        });
                        downloadUi?.applyProgressEvent?.({
                            ...(p || {}),
                            modelId: p?.modelId || p?.id,
                        });
                        downloadUi?.summarizeProgress?.();
                    });
                }
                // Align llama-server to preferred CUDA / ROCm / Vulkan, then pull managed models.
                try {
                    const st = await electron.transubAdvancedManagedLlmStatus?.();
                    const runtime = st?.managed?.runtime || st?.runtime || {};
                    const preferredId = String(
                        runtime.preferredPackageId || runtime.package?.id || '',
                    ).trim();
                    const needRuntime = !runtime.available
                        || !!runtime.outdated
                        || !!runtime.mismatch;
                    if (needRuntime && electron.transubAdvancedManagedLlmInstallRuntime) {
                        const tip = !runtime.available
                            ? (preferredId
                                ? `安装 llama-server 运行时（${preferredId}）…`
                                : '安装 llama-server 运行时…')
                            : (runtime.mismatch
                                ? (preferredId
                                    ? `重新安装 llama-server（切换至 ${preferredId}）…`
                                    : '重新安装 llama-server（后端不一致）…')
                                : `更新 llama-server（${runtime.installedTag || '旧版'} → ${runtime.tag || '最新'}）…`);
                        appendApplyLine(tip, null);
                        setApplyProgress(true, tip, 0, { itemTotal: modelIds.length });
                        const rt = await electron.transubAdvancedManagedLlmInstallRuntime({
                            force: true,
                            runtimeId: preferredId || undefined,
                        });
                        if (rt?.ok) {
                            appendApplyLine(rt.message || 'llama-server 运行时已就绪', true);
                        } else {
                            appendApplyLine(
                                `运行时安装失败：${rt?.error || '未知错误'}（仍继续下载模型）`,
                                false,
                            );
                        }
                    } else if (runtime.available && runtime.installedTag) {
                        appendApplyLine(
                            `llama-server 已就绪（${runtime.installedTag}${runtime.installedPackageId ? ` · ${runtime.installedPackageId}` : ''}）`,
                            true,
                        );
                    }
                } catch (err) {
                    appendApplyLine(`运行时检查失败：${err?.message || err}（仍继续下载模型）`, false);
                }
                for (let i = 0; i < modelIds.length; i += 1) {
                    const id = modelIds[i];
                    getState().applyItemDone = i;
                    downloadUi?.updateRow?.(id, {
                        status: 'downloading',
                        pct: Math.round((i / modelIds.length) * 100),
                        message: `下载 ${modelLabel(id)}…`,
                    });
                    setApplyProgress(
                        true,
                        `下载 ${modelLabel(id)}（${i + 1}/${modelIds.length}）…`,
                        Math.round((i / modelIds.length) * 100),
                        { index: i + 1, itemTotal: modelIds.length, modelId: id },
                    );
                    const res = await electron.transubAdvancedManagedLlmPull({ modelId: id, force: !!force });
                    if (res?.ok) {
                        getState().applyItemDone = i + 1;
                        downloadUi?.markDone?.(id);
                        downloadUi?.summarizeProgress?.();
                        setApplyProgress(
                            true,
                            res.already ? `${modelLabel(id)} 已就绪（跳过）` : `${modelLabel(id)} 下载完成`,
                            Math.round(((i + 1) / modelIds.length) * 100),
                            { index: i + 1, itemTotal: modelIds.length, done: i + 1, modelId: id },
                        );
                        appendApplyLine(
                            res.already
                                ? `${modelLabel(id)} 已就绪（跳过）`
                                : `${modelLabel(id)} 下载完成`,
                            true,
                        );
                    } else if (res?.code === 'cancelled' || /cancel/i.test(String(res?.error || ''))) {
                        downloadUi?.markError?.(id, res.error || '已取消');
                        appendApplyLine(res.error || '已取消语言模型下载', false);
                        return { ok: false, cancelled: true };
                    } else {
                        downloadUi?.markError?.(id, res?.error || '下载失败');
                        appendApplyLine(res?.error || `${modelLabel(id)} 下载失败`, false);
                        return { ok: false, error: res?.error || 'download_failed' };
                    }
                }
                setApplyProgress(true, '语言模型下载完成', 100);
                return { ok: true };
            } catch (err) {
                appendApplyLine(err?.message || '语言模型下载失败', false);
                return { ok: false, error: err?.message || String(err) };
            } finally {
                try { unsub?.(); } catch (_) { /* ignore */ }
            }
        }
    
        async function applyPlan() {
            if (getState().applying || getState().downloading) return;
            // Lock immediately to block double Next before HF/probe work.
            getState().applying = true;
            const nextLock = $('setupWizardNextBtn');
            if (nextLock) {
                nextLock.disabled = true;
                nextLock.textContent = uiTx('请稍候…');
            }

            const setHint = (text) => {
                const el = $('setupWizardDetectStatus')
                    || $('setupWizardDownloadStatus')
                    || $('setupWizardApplyStatus')
                    || $('setupWizardPlanHint');
                if (el) el.textContent = text || '';
            };

            const unlockApply = () => {
                getState().applying = false;
                getState().downloading = false;
            };
    
            const goals = readGoals();
            const modelPlan = getState().modelPlan || null;
            const hasModelPlan = !!(modelPlan && (
                Array.isArray(modelPlan.items) || Array.isArray(modelPlan.allDownloadIds)
            ));
            const device = $('wizardDeviceSelect')?.value || getState().detect.suggestedDevice || 'cpu';
            const profile = $('wizardProfileSelect')?.value || goals.profile || modelPlan?.engineProfile;
            const sense = senseIsAdopted() ? getState().sense : null;
            const resolvePipe = d.resolveWizardPipeline
                || global.TransubSetupWizardGoals?.resolveWizardPipeline;
            // Pass mtModels even when [] so pipeline does not re-inject default translators.
            const pipe = resolvePipe?.({
                task: goals.task,
                profile,
                variant: goals.variant,
                language: goals.language,
                asrModels: hasModelPlan ? (modelPlan.asrModels || []) : goals.asrModels,
                mtModels: hasModelPlan ? (modelPlan.mtModels || []) : goals.mtModels,
                recommend: getState().detect.recommend,
                sense,
                advancedEntitled: !!getState().advancedEntitled,
                subtitleTargetLang: goals.subtitleTargetLang,
            });
            const asrList = hasModelPlan
                ? (modelPlan.asrModels || []).slice()
                : (goals.asrModels?.length
                    ? goals.asrModels.slice()
                    : (pipe?.asrModels?.slice()
                        || [defaultAsrFor(goals.language, profile, getState().detect.recommend)].filter(Boolean)));
            const mtList = goals.task === 'transcribe'
                ? []
                : (hasModelPlan
                    ? (modelPlan.mtModels || []).slice()
                    : (goals.mtModels?.length
                        ? goals.mtModels.slice()
                        : (pipe?.mtModels?.slice()
                            || defaultMtSelection(
                                goals.language,
                                goals.task,
                                getState().detect.recommend,
                                pipe?.translatePref || 'sakura',
                                goals.subtitleTargetLang || '',
                                mtSelectionOpts(),
                            ))));
            if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
                asrList.unshift(WHISPER_JA_PRIMARY);
            }
            const asr = asrList[0] || '';
            const mt = mtList[0] || '';
            const vadFromPlan = hasModelPlan
                ? (modelPlan.vadModels || []).slice()
                : [];
            const vadList = vadFromPlan.length
                ? vadFromPlan
                : (pipe?.vadModels?.length ? pipe.vadModels.slice() : defaultVadFor(asrList));
            const vad = vadList[0] || 'fsmn-vad';

            // Downloads must match step-3 checkboxes — never re-expand unchecked optional MT.
            let downloadIds = [];
            if (hasModelPlan && Array.isArray(modelPlan.allDownloadIds)) {
                downloadIds = [...new Set(
                    modelPlan.allDownloadIds.map((id) => String(id || '').trim()).filter(Boolean),
                )];
                if (mtList.some((id) => isSakuraModelId(id))
                    && !asrListHasWhisperJa(downloadIds)
                    && WHISPER_JA_PRIMARY
                    && !downloadIds.includes(WHISPER_JA_PRIMARY)) {
                    downloadIds.unshift(WHISPER_JA_PRIMARY);
                }
                // Auto-add VAD only when it was never offered (not when user unchecked it).
                for (const vid of defaultVadFor(asrList)) {
                    if (!vid || downloadIds.includes(vid)) continue;
                    const offered = (modelPlan.items || []).some((it) => it && it.id === vid);
                    if (!offered) downloadIds.push(vid);
                }
                for (const id of (modelPlan.extraModelIds || [])) {
                    const mid = String(id || '').trim();
                    if (mid && !downloadIds.includes(mid)) downloadIds.push(mid);
                }
            } else {
                downloadIds = collectDownloadModelIds({
                    ...goals,
                    asrModels: asrList,
                    mtModels: mtList,
                    asrModel: asr,
                    mtModel: mt,
                    profile,
                });
            }
            const pathInput = $('engineInstallPathInput');
            const urlInput = $('engineUrlInput');
    
            if (!asrList.length && !downloadIds.length) {
                unlockApply();
                setHint(uiTx('请至少勾选一个听写模型。'));
                const prepareIdx = stepIndexOf('prepare');
                if (prepareIdx >= 0) showStep(prepareIdx);
                return;
            }
            if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
                unlockApply();
                enforceWhisperJaForSakura();
                setHint(uiTx('专训推理需同时勾选 Whisper JA。'));
                const prepareIdx = stepIndexOf('prepare');
                if (prepareIdx >= 0) showStep(prepareIdx);
                return;
            }

            // Enter downloads immediately — HF probe / install check can take many seconds when cold.
            const downloadsIdx = stepIndexOf('downloads');
            showStep(downloadsIdx >= 0 ? downloadsIdx : stepIndexOf('apply'));
            const list = $('setupWizardApplyList');
            if (list) list.innerHTML = '';
            const status = $('setupWizardApplyStatus');
            if (status) status.textContent = uiTx('正在测速选择下载源…');
            setApplyProgress(false);

            const engineDownloadIds = downloadIds.filter((id) => !isManagedLlmModelId(id) && id !== 'silero-vad');
            const managedDownloadIds = downloadIds.filter((id) => isManagedLlmModelId(id));
            const allDlIds = [...engineDownloadIds, ...managedDownloadIds];
            const previewIds = allDlIds.length ? allDlIds : downloadIds.slice();
            if (previewIds.length) {
                downloadUi?.renderDownloadRows?.(previewIds);
            }

            await ensureHfEndpointPicked();
            const hfEndpoint = currentHfEndpoint();

            if (status) status.textContent = uiTx('正在核对已安装模型…');

            // Confirm redownload (dialog sits above wizard).
            let downloadChoice = { force: false, modelIds: allDlIds.slice(), skippedIds: [] };
            if (allDlIds.length) {
                const installMap = await probeInstalledModelIds(allDlIds);
                downloadChoice = await resolveRedownloadChoice(allDlIds, installMap);
                if (downloadChoice == null) {
                    unlockApply();
                    const prepareIdx = stepIndexOf('prepare');
                    if (prepareIdx >= 0) showStep(prepareIdx);
                    setHint(uiTx('已取消。可改选模型后重试。'));
                    return;
                }
                // Defense: never re-queue installed ids unless the user chose force.
                if (!downloadChoice.force) {
                    const skipped = new Set(downloadChoice.skippedIds || []);
                    downloadChoice.modelIds = (downloadChoice.modelIds || []).filter((id) => {
                        if (id === 'silero-vad' || installMap[id]) {
                            skipped.add(id);
                            return false;
                        }
                        return true;
                    });
                    downloadChoice.skippedIds = [...skipped];
                }
            }

            getState().downloading = true;
            if (status) status.textContent = '';
            for (const id of downloadChoice.skippedIds || []) {
                downloadUi?.markSkipped?.(id, uiTx('已安装，已跳过'));
            }
    
            const uiLocale = $('wizardUiLocaleList')?.querySelector('input[name="wizardUiLocale"]:checked')?.value
                || $('uiLocaleSelect')?.value
                || '';
            const needs = getNeeds();
            const patch = {
                engineBackend: 'transub',
                engineInstallPath: pathInput?.value.trim() || getState().detect.enginePath || '',
                engineUrl: urlInput?.value.trim() || getState().detect.engineUrl || 'http://127.0.0.1:8765',
                engineHfEndpoint: hfEndpoint,
                engineProfile: profile,
                engineAutoStart: true,
                device,
                task: goals.task,
                language: goals.language || 'auto',
                chineseSubtitleVariant: goals.variant === 'traditional' ? 'traditional' : 'simplified',
                subtitleTargetLang: pipe?.subtitleTargetLang
                    || needs.subtitleTargetLang
                    || (goals.variant === 'traditional' ? 'zh-Hant' : 'zh-Hans'),
                wizardContentTypes: Array.isArray(needs.presetIds)
                    ? needs.presetIds.slice()
                    : (Array.isArray(needs.contentTypes) ? needs.contentTypes.slice() : []),
                wizardPresetIds: Array.isArray(needs.presetIds) ? needs.presetIds.slice() : [],
                wizardTargetLangs: Array.isArray(needs.targetLangs) ? needs.targetLangs.slice() : [],
                activePresetId: needs.primaryPresetId || '',
                smartTranslate: false,
                smartTranslateFaithfulTone: goals.task !== 'transcribe',
                filmAudioEnhance: false,
                filmVadPreset: false,
            };
            if (uiLocale) patch.uiLocale = uiLocale;
            if (goals.task === 'dual') {
                patch.mergeBilingualSubtitles = true;
                patch.outputWriteTarget = true;
                patch.outputWriteSource = true;
                patch.dualLineOrder = 'target-first';
            }
            if (senseIsAdopted() && getState().sense?.patch && typeof getState().sense.patch === 'object') {
                const owned = global.TransubContentProfile?.SENSE_OWNED_KEYS || Object.keys(getState().sense.patch);
                owned.forEach((key) => {
                    if (Object.prototype.hasOwnProperty.call(getState().sense.patch, key)
                        && getState().sense.patch[key] !== undefined) {
                        patch[key] = getState().sense.patch[key];
                    }
                });
                // Prefer explicit plan form language / models over stale patch.
                patch.language = goals.language || patch.language || 'auto';
            }
            if (asr) patch.engineAsrModel = asr;
            const sakuraPick = mtList.find((id) => isSakuraModelId(id));
            const managedPick = mtList.find((id) => isManagedLlmModelId(id));
            const primaryIsSakura = isSakuraModelId(mt);
            const primaryIsManaged = isManagedLlmModelId(mt);
            const advancedEntitled = await readAdvancedEntitled();
            getState().advancedEntitled = advancedEntitled;
            // Pro + both Sakura + chat → full smart hybrid. Else: managed+Pro → smart (may degrade);
            // Sakura / light managed → 推理翻译.
            const enableSmartHybrid = advancedEntitled && !!sakuraPick && !!managedPick;
            const enableSmart = enableSmartHybrid || (primaryIsManaged && advancedEntitled);
            const lightManagedPrimary = primaryIsManaged && isLightManagedLlmModelId(mt);
            const lightManagedPick = managedPick && isLightManagedLlmModelId(managedPick) ? managedPick : '';
            const enableLlm = !enableSmart && (
                primaryIsSakura
                || lightManagedPrimary
                || !!sakuraPick
                || !!lightManagedPick
            );
            const llmModelId = enableSmartHybrid
                ? sakuraPick
                : (primaryIsSakura
                    ? mt
                    : (lightManagedPrimary
                        ? mt
                        : (sakuraPick || lightManagedPick || '')));
            patch.engineOpusMtModel = '';
            if (llmModelId) {
                patch.engineLlmMtModel = llmModelId;
                if (enableLlm && isSakuraModelId(llmModelId)) patch.engineMtModel = llmModelId;
            }
            if (enableSmart) {
                patch.smartTranslate = true;
                patch.translateMode = 'smart';
                patch.smartTranslateHybridMt = enableSmartHybrid || undefined;
                patch.engineMtModel = '';
                if (enableSmartHybrid && sakuraPick) {
                    patch.engineLlmMtModel = sakuraPick;
                }
            } else {
                patch.smartTranslate = false;
                if (enableLlm) {
                    patch.translateMode = 'llm';
                }
            }
            if (!advancedEntitled) {
                patch.filmAudioEnhance = false;
                patch.filmVadPreset = false;
            }
            if (vad) patch.engineVadModel = vad;
    
            appendApplyLine('写入设置…', null);
            try {
                const current = core()?.buildSavedOptionsFromForm?.() || {};
                const merged = { ...current, ...patch };
                core()?.applyOptionsToForm?.(merged, { applyUiMode: false });
                // Ensure translate-mode radios match selected path.
                if (goals.task !== 'transcribe') {
                    const sakuraRadio = $('translateModeSakura');
                    const dialogRadio = $('translateModeDialog');
                    const smartRadio = $('translateModeSmart');
                    if (enableLlm && sakuraRadio) {
                        sakuraRadio.checked = true;
                        if (dialogRadio) dialogRadio.checked = false;
                        if (smartRadio) smartRadio.checked = false;
                        if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = false;
                        try {
                            const llmSel = document.getElementById('engineLlmMtModelSelect');
                            if (llmSel && llmModelId) llmSel.value = llmModelId;
                        } catch { /* ignore */ }
                    } else if (enableSmart && smartRadio) {
                        // Pro + Sakura + chat → 混合翻译 (smart hybrid).
                        smartRadio.checked = true;
                        if (sakuraRadio) sakuraRadio.checked = false;
                        if (dialogRadio) dialogRadio.checked = false;
                        if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = true;
                    } else if (sakuraRadio) {
                        sakuraRadio.checked = true;
                        if (dialogRadio) dialogRadio.checked = false;
                        if (smartRadio) smartRadio.checked = false;
                        if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = false;
                    }
                }
                const toSave = {
                    ...(core()?.buildSavedOptionsFromForm?.() || merged),
                    saveParams: true,
                };
                const saveRes = await electron?.transWithAiSaveOptions?.(toSave);
                if (!saveRes?.ok) throw new Error(saveRes?.error || '保存失败');
    
                if (managedPick && electron?.transubAdvancedSaveByok) {
                    appendApplyLine('配置软件内语言模型…', null);
                    const byok = await electron.transubAdvancedSaveByok({ llmSource: 'managed' });
                    if (!byok?.ok) throw new Error(byok?.error || '切换软件内模型失败');
                    if (electron.transubAdvancedManagedLlmSelect) {
                        const sel = await electron.transubAdvancedManagedLlmSelect({ modelId: managedPick });
                        if (!sel?.ok) throw new Error(sel?.error || `选用模型失败：${managedPick}`);
                    }
                    let managedTip = `已选用 ${modelLabel(managedPick)}`;
                    if (enableSmartHybrid) {
                        managedTip += `（智能翻译润色；句级 ${modelLabel(sakuraPick)}）`;
                    } else if (enableSmart) {
                        managedTip += '（智能翻译）';
                        if (!sakuraPick) {
                            appendApplyLine('提示：未勾选 Sakura/GalTransl，混合句级暂不可用（将降级为对话模型按行）', null);
                        }
                    } else if (enableLlm && (lightManagedPrimary || managedPick === llmModelId)) {
                        managedTip += '（推理翻译）';
                    } else if (!advancedEntitled) {
                        managedTip += '（解锁 Pro 后可用于智能翻译）';
                    }
                    appendApplyLine(managedTip, true);
                }
    
                appendApplyLine('设置已保存', true);
                getState().applied = {
                    device,
                    profile,
                    asr: asr || merged.engineAsrModel || '',
                    mt: mt || '',
                    language: goals.language || 'auto',
                    task: goals.task,
                    openedDownload: false,
                    downloadCount: downloadIds.length,
                };
            } catch (err) {
                appendApplyLine(err?.message || '保存失败', false);
                if (status) status.textContent = uiTx('保存失败，可返回上一步重试。');
                getState().applying = false;
                getState().downloading = false;
                const nextBtn = $('setupWizardNextBtn');
                if (nextBtn) {
                    nextBtn.textContent = uiTx('重试');
                    nextBtn.disabled = false;
                }
                const backBtn = $('setupWizardBackBtn');
                if (backBtn) backBtn.disabled = false;
                return;
            }
    
            const toDlEngine = downloadChoice.modelIds.filter((id) => !isManagedLlmModelId(id));
            const toDlManaged = downloadChoice.modelIds.filter((id) => isManagedLlmModelId(id));
            let downloadedOk = false;
    
            if (!allDlIds.length) {
                appendApplyLine('无需下载模型', true);
            } else if (!downloadChoice.modelIds.length) {
                appendApplyLine('所选模型均已就绪，无需下载', true);
                downloadedOk = true;
            } else {
                let allOk = true;
                if (toDlEngine.length) {
                    const eng = await runEngineDownloadsInWizard({
                        modelIds: toDlEngine,
                        force: downloadChoice.force,
                        patch,
                        profile,
                        hfEndpoint,
                    });
                    if (!eng.ok) allOk = false;
                    else downloadedOk = true;
                }
                if (toDlManaged.length) {
                    const man = await runManagedDownloadsInWizard({
                        modelIds: toDlManaged,
                        force: downloadChoice.force,
                    });
                    if (!man.ok) allOk = false;
                    else downloadedOk = true;
                }
                if (getState().applied) {
                    getState().applied.openedDownload = downloadedOk;
                    getState().applied.downloadOk = allOk;
                }
                if (!allOk) {
                    setApplyProgress(false);
                    getState().applying = false;
                    getState().downloading = false;
                    if (status) status.textContent = uiTx('部分下载失败，可点重试或返回修改。');
                    const nextBtn = $('setupWizardNextBtn');
                    if (nextBtn) {
                        nextBtn.textContent = uiTx('重试');
                        nextBtn.disabled = false;
                    }
                    const backBtn = $('setupWizardBackBtn');
                    if (backBtn) backBtn.disabled = false;
                    return;
                }
            }

            setApplyProgress(false);
            core()?.updateEnvBanner?.();
            if (status) status.textContent = uiTx('完成。');
            getState().applying = false;
            getState().downloading = false;
            finishDoneSummary();
            const prefsIdx = stepIndexOf('prefs');
            showStep(prefsIdx >= 0 ? prefsIdx : stepIndexOf('done'));
        }
    
        function finishDoneSummary() {
            const el = $('setupWizardDoneSummary');
            if (!el) return;
            const a = getState().applied;
            const parts = [
                `任务：${TASK_LABELS[a.task] || a.task}`,
                `语言：${LANG_LABELS[a.language] || a.language || '自动'}`,
                `计算：${a.device === 'cuda' ? '显卡' : 'CPU'}`,
                `速度：${PROFILE_LABELS[a.profile] || a.profile}`,
            ];
            if (a.asr) parts.push(`听写：${modelLabel(a.asr)}`);
            if (a.mt) parts.push(`翻译：${modelLabel(a.mt)}`);
            if (a.openedDownload) parts.push('所需文件已下载');
            else if (a.downloadCount) parts.push(`计划下载 ${a.downloadCount} 项`);
            el.textContent = parts.join(' · ');
        }
    

        return {
            appendApplyLine,
            setApplyProgress,
            beginApplyItemProgress,
            updateApplyItemCount,
            formatWizardBytes,
            formatApplyProgressDetail,
            probeInstalledModelIds,
            resolveRedownloadChoice,
            runEngineDownloadsInWizard,
            runManagedDownloadsInWizard,
            applyPlan,
            finishDoneSummary,
        };
    }

    return { createSetupWizardApply };

}));
