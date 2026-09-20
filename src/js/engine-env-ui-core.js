/**
 * Engine / TWAI env settings UI: install path, FFmpeg, proxy/HF, banner, save params.
 * Shell injects DOM/IPC/state via createEngineEnvUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineEnvUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineEnvUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */

    function createEngineEnvUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const uiTf = d.uiTf || ((s) => s);
        const appendLog = d.appendLog || (() => {});
        const appConfirm = d.appConfirm || (async () => false);
        const isDesktop = d.isDesktop || (() => false);
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const switchParamsTab = d.switchParamsTab || (() => {});
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'transub');
        const canUseSmartTranslateUi = d.canUseSmartTranslateUi || (() => false);
        const isSakuraMtModelId = d.isSakuraMtModelId || (() => false);
        const applyTranslateModeToForm = d.applyTranslateModeToForm || (() => {});
        const buildSavedOptionsFromForm = d.buildSavedOptionsFromForm || (() => ({}));
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const closeStandaloneSettingsWindow = d.closeStandaloneSettingsWindow || (() => {});
        const closeParamsModal = d.closeParamsModal || (() => {});
        const refreshModelSelects = d.refreshModelSelects || (async () => {});
        const updateEmptyStateUi = d.updateEmptyStateUi || (() => {});
        const syncFactoryEngineStatus = d.syncFactoryEngineStatus || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});
        const getIsStandaloneSettings = d.getIsStandaloneSettings
            || (() => !!d.isStandaloneSettings);
        const getAdvancedEntitled = d.getAdvancedEntitled
            || (() => !!d.advancedEntitled);
        const getCachedGpuRuntimeProbe = d.getCachedGpuRuntimeProbe || (() => null);
        const getEngineModelsUi = d.getEngineModelsUi
            || (() => d.engineModelsUi || (global && global.TransubEngineModelsUi) || {});
        let bundledEnginePath = String(d.initialBundledEnginePath || '').trim();

        function getFfmpegPathFromForm() {
            return els.ffmpegPathInput?.value.trim()
                || String(getSavedOptionsSnapshot()?.ffmpegPath || '').trim()
                || '';
        }

        function formatTransWithAiStatusText(version) {
            const ver = String(version || '').trim();
            return ver ? uiTf('已识别到 TransWithAI ({ver})', { ver }) : '已识别到 TransWithAI';
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
                let text = res.version
                    ? uiTf('FFmpeg 可用（{source}） · {version}', { source, version: res.version })
                    : uiTf('FFmpeg 可用（{source}）', { source });
                let tone = 'text-xs text-emerald-600';
                if (res.insideInstall || res.warning) {
                    text += res.warning
                        ? uiTf('。{warning}', { warning: res.warning })
                        : uiTf('。请勿放在软件安装目录内，更新时可能被覆盖');
                    tone = 'text-xs text-amber-600';
                }
                els.ffmpegStatus.textContent = text;
                els.ffmpegStatus.className = tone;
                const pathToSave = getFfmpegPathFromForm();
                if (persist && pathToSave) {
                    try {
                        const saveRes = await electron?.transWithAiSaveOptions?.({ ffmpegPath: pathToSave });
                        if (!saveRes?.ok) {
                            els.ffmpegStatus.textContent = uiTf('{text}（路径未写入设置：{error}）', { text, error: saveRes?.error || '保存失败' });
                            els.ffmpegStatus.className = 'text-xs text-amber-600';
                        }
                    } catch (err) {
                        els.ffmpegStatus.textContent = uiTf('{text}（路径未写入设置：{error}）', { text, error: err?.message || '保存失败' });
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
                    ? uiTf('发现新版本 v{ver}', { ver: res.latestVersion })
                    : (res.currentVersion
                        ? uiTf('当前已是最新 v{ver}', { ver: res.currentVersion })
                        : uiTf('当前已是最新')));
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
                        message: uiTf('{msg}\n\n是否打开下载页面？', { msg }),
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
                        message: uiTf('{msg}\n\n是否打开下载页面查看？', { msg }),
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
            // Bundled installs persist engineInstallPath as "" and only show the path as
            // placeholder / after ensureEngineInstallPathFilled. Do not treat empty input
            // as missing — that incorrectly jumps every Save to 「运行环境」.
            if (readEngineBackendFromForm() !== 'twai') {
                await ensureEngineInstallPathFilled();
                const enginePath = els.engineInstallPathInput?.value.trim()
                    || bundledEnginePath
                    || '';
                if (!enginePath) {
                    setSaveParamsStatus('请先在「运行环境」填写引擎安装目录', 'err');
                    switchParamsTab('install');
                    return;
                }
            }
            const task = readTaskFromForm();
            const wantsSmart = (task === 'translate' || task === 'dual') && !!els.smartTranslateCheck?.checked;
            const wantsFilm = !!els.filmAudioEnhanceCheck?.checked || !!els.filmVadPresetCheck?.checked;
            if (wantsFilm && !getAdvancedEntitled()) {
                // Clear stuck checks so save can proceed for free users after license expiry.
                if (els.filmAudioEnhanceCheck) els.filmAudioEnhanceCheck.checked = false;
                if (els.filmVadPresetCheck) els.filmVadPresetCheck.checked = false;
            }
            if (wantsSmart && !canUseSmartTranslateUi()) {
                const llmId = String(els.engineLlmMtModelSelect?.value || '').trim();
                const fallback = (isSakuraMtModelId(llmId)
                    || global.TransubSakuraMtCatalog?.isLlmInferenceMtModel?.(llmId))
                    ? 'llm'
                    : 'engine';
                applyTranslateModeToForm(fallback);
                setSaveParamsStatus('智能翻译需解锁 Pro，已改回可用译法', 'warn');
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
                    setSavedOptionsSnapshot(buildSavedOptionsFromForm());
                    markSettingsDirty(false);
                    appendLog('设置已保存', 'ok');
                    setSaveParamsStatus('已保存', 'ok');
                    updateParamsSummary();
                    try { global.TransubSubtitleBurnUi?.reloadEncodeSettings?.(); } catch (_) { /* ignore */ }
                    if (closeAfter) {
                        setTimeout(() => {
                            if (getIsStandaloneSettings()) closeStandaloneSettingsWindow();
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

        function syncProxySettingsUi() {
            const on = !!els.proxyEnabledCheck?.checked;
            if (els.proxySettingsFields) {
                els.proxySettingsFields.classList.toggle('opacity-50', !on);
            }
            if (els.proxyUrlInput) els.proxyUrlInput.disabled = !on;
            if (els.proxyBypassInput) els.proxyBypassInput.disabled = !on;
            if (els.proxyTestBtn) els.proxyTestBtn.disabled = false;
        }

        function syncTransubStationSettingsUi() {
            const doc = typeof document !== 'undefined' ? document : null;
            const enabledCheck = doc?.getElementById('transubStationEnabledCheck')
                || els.transubStationEnabledCheck;
            const fields = doc?.getElementById('transubStationFields')
                || els.transubStationFields;
            const urlInput = doc?.getElementById('transubStationUrlInput')
                || els.transubStationUrlInput;
            const testBtn = doc?.getElementById('transubStationTestBtn')
                || els.transubStationTestBtn;
            if (enabledCheck) els.transubStationEnabledCheck = enabledCheck;
            if (fields) els.transubStationFields = fields;
            if (urlInput) els.transubStationUrlInput = urlInput;
            if (testBtn) els.transubStationTestBtn = testBtn;
            const on = !!enabledCheck?.checked;
            if (fields) fields.classList.toggle('opacity-50', !on);
            if (urlInput) urlInput.disabled = !on;
            if (testBtn) testBtn.disabled = false;
        }

        function setTransubStationStatus(text, kind = '') {
            const statusEl = (typeof document !== 'undefined'
                ? document.getElementById('transubStationStatus')
                : null)
                || els.transubStationStatus
                || null;
            if (!statusEl) return;
            els.transubStationStatus = statusEl;
            statusEl.textContent = text || '';
            statusEl.className = kind === 'ok'
                ? 'text-xs text-emerald-600 min-h-[1rem]'
                : kind === 'err'
                    ? 'text-xs text-red-600 min-h-[1rem]'
                    : kind === 'busy'
                        ? 'text-xs text-sky-600 min-h-[1rem]'
                        : 'text-xs text-gray-500 min-h-[1rem]';
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

        function setNetworkGithubMirrorStatus(text, kind = '') {
            const el = (typeof document !== 'undefined'
                ? document.getElementById('networkGithubMirrorStatus')
                : null)
                || els.networkGithubMirrorStatus
                || null;
            if (!el) return;
            els.networkGithubMirrorStatus = el;
            el.textContent = text || '';
            el.className = kind === 'ok'
                ? 'text-xs text-emerald-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                : kind === 'err'
                    ? 'text-xs text-red-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                    : kind === 'busy'
                        ? 'text-xs text-sky-600 min-h-[1rem] whitespace-pre-wrap basis-full'
                        : 'text-xs text-gray-500 min-h-[1rem] whitespace-pre-wrap basis-full';
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
            if (bundledEnginePath) return bundledEnginePath;
            try {
                const res = await electron?.transubEngineBundledPath?.();
                if (res?.ok && res.path) {
                    // Cache the expected bundled path even if validation markers are missing,
                    // so 「内置」 can still fill the field; presence is checked separately.
                    bundledEnginePath = String(res.path);
                    if (els.engineInstallPathInput) {
                        els.engineInstallPathInput.placeholder = bundledEnginePath;
                    }
                }
            } catch { /* ignore */ }
            return bundledEnginePath;
        }

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

        function engineInstallPathForSave() {
            const v = els.engineInstallPathInput?.value.trim() || '';
            if (!v) return '';
            if (bundledEnginePath && sameFsPath(v, bundledEnginePath)) return '';
            return v;
        }

        function updateEnvBanner() {
            if (!els.envBanner) return;
            const backend = readEngineBackendFromForm();
            if (backend === 'twai') {
                const path = String(els.installPathInput?.value || '').trim();
                els.envBanner.classList.toggle('hidden', !!path);
                updateEmptyStateUi();
                syncFactoryEngineStatus();
                return;
            }
            const enginePath = String(els.engineInstallPathInput?.value || '').trim()
                || String(bundledEnginePath || '').trim();
            const statusOk = els.engineStatus?.className?.includes('emerald');
            // Only hide when a real path is set (or engine already verified OK).
            // Bundled installs persist engineInstallPath as "" and refill on load via
            // ensureEngineInstallPathFilled — keep empty-state hint in sync here.
            const show = !enginePath && !statusOk;
            els.envBanner.classList.toggle('hidden', !show);
            updateEmptyStateUi();
            syncFactoryEngineStatus();
        }

        function engineFormPayload() {
            const dev = getCachedGpuRuntimeProbe()?.device || {};

            return {
                engineInstallPath: els.engineInstallPathInput?.value.trim() || bundledEnginePath || '',
                engineUrl: els.engineUrlInput?.value.trim() || '',
                engineHfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
                engineHfToken: els.engineHfTokenInput?.value.trim() || '',
                engineAutoStart: !!els.engineAutoStartCheck?.checked,
                needsTorchCuda128: getCachedGpuRuntimeProbe()?.needsTorchCuda128
                    ?? dev.needsTorchCuda128
                    ?? undefined,
                torchCudaVariant: getCachedGpuRuntimeProbe()?.torchCudaVariant
                    ?? dev.torchCudaVariant
                    ?? undefined,
                computeCap: getCachedGpuRuntimeProbe()?.computeCap
                    ?? dev.computeCap
                    ?? undefined,
                gpuName: String(
                    getCachedGpuRuntimeProbe()?.gpuName || dev.gpuName || '',
                ).trim() || undefined,
                driverCudaVersion: String(
                    getCachedGpuRuntimeProbe()?.driverCudaVersion
                        || dev.driverCudaVersion
                        || '',
                ).trim() || undefined,
                driverCudaMajor: getCachedGpuRuntimeProbe()?.driverCudaMajor
                    ?? dev.driverCudaMajor
                    ?? undefined,
            };
        }

        function formatEngineDownloadError(raw) {
            if (getEngineModelsUi().formatEngineDownloadError) {
                return getEngineModelsUi().formatEngineDownloadError(raw, {
                    hfEndpoint: els.engineHfEndpointInput?.value.trim() || '',
                });
            }
            const msg = String(raw || '').trim();
            return msg || '模型下载失败';
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

        return {
            getFfmpegPathFromForm,
            formatTransWithAiStatusText,
            refreshInstallStatus,
            testInstall,
            browseFfmpegPath,
            browseFfmpegFolder,
            refreshFfmpegStatus,
            checkTransWithAiEngineUpdate,
            browseInstallPath,
            saveParamsSettings,
            syncProxySettingsUi,
            syncTransubStationSettingsUi,
            setTransubStationStatus,
            setProxyTestStatus,
            setNetworkHfStatus,
            setNetworkGithubMirrorStatus,
            readProxyOptionsFromForm,
            sameFsPath,
            ensureBundledEnginePathCached,
            ensureEngineInstallPathFilled,
            engineInstallPathForSave,
            updateEnvBanner,
            engineFormPayload,
            formatEngineDownloadError,
            setEngineStatusText,
            getCachedBundledEnginePath: () => bundledEnginePath,
            setCachedBundledEnginePath: (v) => { bundledEnginePath = String(v || '').trim(); },
        };
    }

    return { createEngineEnvUi };
}));
