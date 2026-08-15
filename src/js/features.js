/**
 * Transub 扩展功能模块
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = () => global.TransubCore;

    async function appConfirmMsg(message, options = {}) {
        const fn = global.TransubAppConfirm;
        if (fn) return fn({ message, ...options });
        return window.confirm(message);
    }

    function appAlert(message) {
        global.TransubMainUiUx?.showToast?.(message, 'err', { duration: 8000 })
            || window.alert(message);
    }

    function appendInferLog(line, tone) {
        const host = document.getElementById('inferLogHost');
        if (!host) return;
        const placeholder = host.textContent || '';
        if (
            placeholder.includes('引擎日志将显示在此处')
            || placeholder.includes('TransWithAI日志将显示在此处')
            || placeholder.includes('infer 日志将显示在此处')
            || placeholder.includes('Transub Engine 日志将显示在此处')
        ) {
            host.textContent = '';
        }
        const row = document.createElement('div');
        const colors = {
            ok: 'text-emerald-700',
            warn: 'text-amber-700',
            err: 'text-red-700',
            info: 'text-gray-600',
        };
        row.className = `infer-log-line ${colors[tone] || colors.info}`;
        row.textContent = line;
        host.appendChild(row);
        while (host.childElementCount > 400) host.firstChild?.remove();
        const panel = host.closest('.log-panel') || host;
        panel.scrollTop = panel.scrollHeight;
    }

    function activateLogTab(tab) {
        const want = tab === 'infer' ? 'infer' : 'app';
        document.querySelectorAll('.log-tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.logTab === want);
        });
        document.querySelectorAll('.log-panel').forEach((p) => {
            const active = p.id === (want === 'infer' ? 'logPanelInfer' : 'logPanelApp');
            p.classList.toggle('active', active);
            if (active) p.scrollTop = p.scrollHeight;
        });
    }

    async function openEngineRawLog() {
        const res = await electron?.transubEngineOpenLatestLog?.();
        if (res?.ok === false) {
            core()?.appendLog(res?.error || '打开引擎日志失败', 'err');
            return;
        }
        if (res?.path) core()?.appendLog(`已打开引擎日志：${res.path}`, 'info');
    }

    function bindLogTabs() {
        document.querySelectorAll('.log-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                activateLogTab(btn.dataset.logTab);
            });
        });
    }

    async function loadPresets() {
        const res = await electron?.transWithAiGetPresets?.();
        const sel = document.getElementById('presetSelect');
        if (!sel || !res?.ok) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— 选择预设 —</option>';
        const presets = Array.isArray(res.presets) ? res.presets : [];
        const groupOrder = ['软声', '影视', '动漫', '对话', '自定义', '其他'];
        const buckets = new Map();
        for (const p of presets) {
            if (!p?.id) continue;
            const group = String(p.group || (p.builtin ? '其他' : '自定义')).trim() || (p.builtin ? '其他' : '自定义');
            if (!buckets.has(group)) buckets.set(group, []);
            buckets.get(group).push(p);
        }
        const orderedGroups = [
            ...groupOrder.filter((g) => buckets.has(g)),
            ...[...buckets.keys()].filter((g) => !groupOrder.includes(g)),
        ];
        for (const group of orderedGroups) {
            const rows = buckets.get(group) || [];
            const og = document.createElement('optgroup');
            og.label = group;
            for (const p of rows) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name + (p.builtin ? '（内置）' : '');
                if (p.builtin) opt.dataset.builtin = '1';
                const desc = String(p.description || '').trim();
                if (desc) {
                    opt.title = desc;
                    opt.dataset.description = desc;
                }
                og.appendChild(opt);
            }
            sel.appendChild(og);
        }
        if (current && [...sel.options].some((o) => o.value === current)) {
            sel.value = current;
        }
        // Options may load after applyOptionsToForm stashed activePresetId.
        core()?.flushPendingActivePresetId?.();
        syncPresetSelectDescription();
        core()?.rebuildParamsModePresetItems?.(presets, { preferActiveGroup: true });
        // Keep scene cards in sync when settings select changes after load.
        const cards = document.getElementById('paramsSceneCards');
        const active = String(sel.value || '').trim();
        cards?.querySelectorAll('.params-scene-card').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.presetId === active);
        });
        core()?.syncParamsModeChipUi?.();
    }

    function syncPresetSelectDescription() {
        const sel = document.getElementById('presetSelect');
        const status = document.getElementById('paramsPresetStatus');
        if (!sel || !status) return;
        // Keep error/success messages from import/export until the next selection change.
        if (status.dataset.tone === 'err' || status.dataset.tone === 'ok') return;
        const opt = sel.selectedOptions?.[0];
        const desc = String(opt?.dataset?.description || opt?.title || '').trim();
        if (sel.value && desc) {
            status.textContent = desc;
            status.className = 'text-xs text-gray-500 min-h-[1rem]';
            status.dataset.tone = 'info';
        } else if (!sel.value) {
            status.textContent = '';
            status.dataset.tone = '';
        }
    }

    /** Keys owned by task / MT chips — presets must not overwrite or persist them. */
    const PRESET_SKIP_KEYS = Object.freeze([
        'task',
        'translateMode',
        'engineMtModel',
        'engineLlmMtModel',
        'glossaryMtEnabled',
        'sakuraNsfwPrompt',
    ]);

    function optionsForApply(preset) {
        const raw = preset?.options && typeof preset.options === 'object' ? preset.options : {};
        const out = { ...raw };
        for (const key of PRESET_SKIP_KEYS) delete out[key];
        return out;
    }

    function optionsForSavePreset(fullOptions) {
        const out = fullOptions && typeof fullOptions === 'object' ? { ...fullOptions } : {};
        for (const key of PRESET_SKIP_KEYS) delete out[key];
        delete out.autoSense;
        return out;
    }

    async function applyPreset(presetId, { persist = false, autoSense } = {}) {
        const res = await electron?.transWithAiGetPresets?.();
        const preset = res?.presets?.find((p) => p.id === presetId);
        if (!preset?.options || !core()?.applyOptionsToForm) return false;
        const patch = optionsForApply(preset);
        const requiredIds = (typeof (global.TransubEngineMissingModels?.collectRequiredModelIdsFromOptions) === 'function')
            ? global.TransubEngineMissingModels.collectRequiredModelIdsFromOptions(patch)
            : [patch.engineAsrModel, patch.engineVadModel].map((id) => String(id || '').trim()).filter(Boolean);
        if (requiredIds.length && typeof core()?.ensureRequiredModelsReadyOrPrompt === 'function') {
            const ready = await core().ensureRequiredModelsReadyOrPrompt({
                modelIds: requiredIds,
                contextLabel: `预设「${preset.name || presetId}」`,
                settingsTab: 'models',
                settingsHint: '设置 → 模型',
            });
            if (!ready) return false;
        }
        const current = core().buildSavedOptionsFromForm();
        const next = { ...current, ...patch };
        if (autoSense !== undefined) next.autoSense = !!autoSense;
        if (autoSense === false) next.activePresetId = presetId;
        else if (autoSense === true) next.activePresetId = '';
        await core().applyOptionsToForm(next);
        if (autoSense !== undefined) {
            core().setAutoSenseEnabled?.(!!autoSense, { persist: false });
        }
        if (autoSense === false) {
            core().applyActivePresetIdToSelect?.(presetId);
        } else if (autoSense === true) {
            core().applyActivePresetIdToSelect?.('');
        } else {
            const sel = document.getElementById('presetSelect');
            if (sel) {
                const has = [...sel.options].some((o) => o.value === presetId);
                if (has) sel.value = presetId;
            }
        }
        document.getElementById('paramsSceneCards')?.querySelectorAll('.params-scene-card').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.presetId === presetId);
        });
        core().updateParamsSummary?.();
        core().syncParamsModeChipUi?.();
        core().syncTranslateChipUi?.();
        if (persist) {
            const opts = {
                ...core().buildSavedOptionsFromForm(),
                ...(autoSense !== undefined ? { autoSense: !!autoSense } : {}),
                ...(autoSense === false ? { activePresetId: presetId } : { activePresetId: '' }),
                ...(patch.contentProfile
                    ? { contentProfile: patch.contentProfile }
                    : {}),
            };
            const saveRes = await electron?.transWithAiSaveOptions?.(opts);
            if (saveRes?.ok !== false) {
                core().setSavedOptionsSnapshot?.(opts);
                core().markSettingsDirty?.(false);
                core().setSaveParamsStatus?.(`已应用并保存预设「${preset.name}」`, 'ok');
                core().appendLog(
                    autoSense === false
                        ? `已应用并保存预设：${preset.name}（已关闭智能感知）`
                        : `已应用并保存预设：${preset.name}`,
                    'ok',
                );
                core().syncParamsModeChipUi?.();
                return true;
            }
        }
        core().markSettingsDirty?.(true);
        core().setSaveParamsStatus?.(`已应用预设「${preset.name}」，请点「保存设置」写入磁盘`, 'warn');
        core().appendLog(`已应用预设：${preset.name}（尚未保存）`, 'info');
        core().syncParamsModeChipUi?.();
        return true;
    }

    function syncOutputModeUi() {
        const mode = document.getElementById('outputModeSelect')?.value || 'same';
        const wrap = document.getElementById('outputDirWrap');
        wrap?.classList.toggle('hidden', mode !== 'custom');
    }

    async function scanFolder() {
        const res = await electron?.selectFolder?.({ title: '选择包含媒体文件的文件夹' });
        if (!res?.ok || res.canceled || !res.path) return;
        const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
        if (!scan?.ok) {
            core()?.appendLog(scan?.error || '扫描文件夹失败', 'err');
            return;
        }
        await core()?.addFiles(scan.files || []);
        core()?.appendLog(`从文件夹添加 ${scan.files?.length || 0} 个媒体文件`, 'info');
    }

    async function showInstallWizard() {
        // Legacy stub: GPU tip box was removed. Prefer the full setup wizard.
        if (global.TransubSetupWizard?.open) {
            return global.TransubSetupWizard.open({ force: false });
        }
    }

    function applySuggestedDevice() {
        const applyBtn = document.getElementById('applySuggestedDeviceBtn');
        const device = String(applyBtn?.dataset.device || '').trim();
        const sel = document.getElementById('deviceSelect');
        if (!device || !sel?.querySelector(`option[value="${device}"]`)) return;
        sel.value = device;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        core()?.appendLog(`已应用推荐设备：${sel.options[sel.selectedIndex]?.text || device}`, 'ok');
    }

    async function openSubtitleLibrary(opts = {}) {
        try {
            const res = await electron?.transubOpenSubtitleLibrary?.({
                mediaId: opts.mediaId || '',
                mediaPath: opts.mediaPath || '',
                versionId: opts.versionId || '',
            });
            if (res?.ok === false) {
                core()?.appendLog(res?.error || '无法打开字幕库', 'err');
                appAlert(res?.error || '无法打开字幕库');
            }
            return res;
        } catch (err) {
            core()?.appendLog(err?.message || '无法打开字幕库', 'err');
            appAlert(err?.message || '无法打开字幕库');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    /** @deprecated use openSubtitleLibrary */
    async function openLibraryModal(opts = {}) {
        return openSubtitleLibrary(opts);
    }

    let cachedLibraryRoot = '';

    async function refreshLibrarySettingsStatus() {
        const els = [
            document.getElementById('librarySettingsStatus'),
        ].filter(Boolean);
        if (!els.length) return null;
        const setAll = (text, title) => {
            for (const el of els) {
                el.textContent = text;
                if (title != null) el.title = title;
            }
        };
        try {
            const res = await electron?.transubLibraryStatus?.();
            if (!res?.ok) {
                setAll(res?.error || '无法读取字幕库状态', '');
                cachedLibraryRoot = '';
                return res;
            }
            cachedLibraryRoot = String(res.root || '').trim();
            const media = Number(res.mediaCount) || 0;
            const versions = Number(res.versionCount) || 0;
            const tracks = Number(res.trackCount) || 0;
            const limit = res.caps?.maxVersionsPerTrack;
            const limitText = Number.isFinite(Number(limit)) ? ` · 每轨最多 ${limit} 版` : '';
            const proText = res.caps?.libraryPro ? ' · Pro' : ' · 免费';
            const line = `${media} 部作品 · ${tracks} 轨 · ${versions} 版${limitText}${proText}`
                + (cachedLibraryRoot ? `\n${cachedLibraryRoot}` : '');
            setAll(line, cachedLibraryRoot || '');
            return res;
        } catch (err) {
            setAll(err?.message || '无法读取字幕库状态', '');
            cachedLibraryRoot = '';
            return { ok: false, error: err?.message || String(err) };
        }
    }

    async function revealLibraryRoot() {
        let root = cachedLibraryRoot;
        if (!root) {
            const st = await refreshLibrarySettingsStatus();
            root = String(st?.root || cachedLibraryRoot || '').trim();
        }
        if (!root) {
            core()?.appendLog('未找到字幕库目录', 'err');
            return;
        }
        try {
            const res = await electron?.showInFolder?.(root);
            if (res?.ok === false) {
                core()?.appendLog(res?.error || '无法打开库目录', 'err');
            }
        } catch (err) {
            core()?.appendLog(err?.message || '无法打开库目录', 'err');
        }
    }

    async function showSubtitlePreview(path) {
        const res = await electron?.transWithAiSubtitlePreview?.({ path });
        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        if (!modal || !content) return;
        if (!res?.ok) {
            core()?.appendLog(res?.error || '预览失败', 'err');
            return;
        }
        content.textContent = res.preview + (res.truncated ? '\n\n…' : '');
        modal.classList.remove('hidden');
    }

    function bindModals() {
        document.getElementById('closePreviewBtn')?.addEventListener('click', () => {
            document.getElementById('previewModal')?.classList.add('hidden');
        });
        document.getElementById('previewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') e.currentTarget.classList.add('hidden');
        });
    }

    const OFFICIAL_SITE_URL = 'https://www.transub.cc/';
    const GITHUB_RELEASES_URL = 'https://github.com/dlsandy/Transub/releases';
    const CODEBERG_RELEASES_URL = 'https://codeberg.org/flyforyou/Transub/releases';
    const AFDIAN_PURCHASE_URL = 'https://afdian.com/item/41fef1a28bf211f189e252540025c377';

    function moreStatusEl() {
        return document.getElementById('moreStatus');
    }

    function setMoreAfdianVisible(visible) {
        const btn = document.getElementById('openAfdianFromSettingsBtn');
        if (!btn) return;
        btn.hidden = !visible;
        btn.classList.toggle('hidden', !visible);
    }

    async function syncMoreAfdianVisibility() {
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            setMoreAfdianVisible(!(res?.ok && res.status?.entitled));
        } catch (_) {
            setMoreAfdianVisible(true);
        }
    }

    async function openExternalLink(url, okMessage) {
        const el = moreStatusEl();
        try {
            const res = await electron?.openExternal?.(url);
            if (res?.ok === false) {
                if (el) el.textContent = res?.error || '打开链接失败';
                return;
            }
            if (el) el.textContent = okMessage || '已在浏览器中打开';
        } catch (err) {
            if (el) el.textContent = err?.message || '打开链接失败';
        }
    }

    function formatDownloadBytes(bytes) {
        const n = Number(bytes);
        if (!Number.isFinite(n) || n < 0) return '';
        if (n < 1024) return `${Math.round(n)} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function setUpdateDownloadProgressVisible(visible) {
        const host = document.getElementById('updateDownloadProgress');
        if (!host) return;
        host.classList.toggle('hidden', !visible);
        if (!visible) {
            const bar = document.getElementById('updateDownloadBar');
            const pctEl = document.getElementById('updateDownloadPercent');
            const detail = document.getElementById('updateDownloadDetail');
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
            if (detail) detail.textContent = '';
        }
    }

    function renderUpdateDownloadProgress(progress = {}, version = '') {
        const host = document.getElementById('updateDownloadProgress');
        if (!host) return;
        host.classList.remove('hidden');
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
        const transferred = Number(progress.transferred) || 0;
        const total = Number(progress.total) || 0;
        const speed = Number(progress.bytesPerSecond) || 0;
        const label = document.getElementById('updateDownloadLabel');
        const pctEl = document.getElementById('updateDownloadPercent');
        const bar = document.getElementById('updateDownloadBar');
        const detail = document.getElementById('updateDownloadDetail');
        if (label) {
            label.textContent = version
                ? `正在下载 v${version}…`
                : '正在下载更新…';
        }
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (detail) {
            const parts = [];
            const done = formatDownloadBytes(transferred);
            const all = formatDownloadBytes(total);
            if (done && all) parts.push(`${done} / ${all}`);
            else if (done) parts.push(done);
            const rate = formatDownloadBytes(speed);
            if (rate) parts.push(`${rate}/s`);
            detail.textContent = parts.join(' · ');
        }
    }

    async function openAppUpdateWindow({ autoCheck = true } = {}) {
        if (electron?.transubOpenUpdateWindow) {
            return electron.transubOpenUpdateWindow({ autoCheck });
        }
        return null;
    }

    async function runCheckAppUpdate({ triggerBtn } = {}) {
        const opened = await openAppUpdateWindow({ autoCheck: true });
        if (opened?.ok) return;

        // Browser / non-Electron fallback: keep inline check in settings.
        const el = moreStatusEl();
        const btn = triggerBtn || document.getElementById('checkUpdateBtn');
        const toolbarBtn = document.getElementById('checkUpdateToolbarBtn');
        if (btn) btn.disabled = true;
        if (toolbarBtn) toolbarBtn.disabled = true;
        setUpdateDownloadProgressVisible(false);
        if (el) el.textContent = '正在检查更新…';
        let unsubProgress = null;
        try {
            const res = await electron?.transWithAiCheckAppUpdate?.();
            if (!res?.ok) {
                if (el) el.textContent = res?.error || '检查更新失败';
                return;
            }
            if (el) el.textContent = res.message || `当前版本 v${res.currentVersion}`;

            if (res.updateAvailable) {
                if (res.canAutoInstall && electron?.transubDownloadAppUpdate) {
                    const yes = await appConfirmMsg(
                        res.preservesEngineData || res.installKind === 'zip'
                            ? `发现新版本 v${res.latestVersion}。\n\n是否下载并在重启后安装？\n（优先增量更新；将保留已下载的模型、GPU/Demucs 支持库与 Advanced LLM）`
                            : `发现新版本 v${res.latestVersion}。\n\nSetup/NSIS 已停更，是否打开发布页下载 zip 解压版？`,
                        { title: '发现更新', primaryLabel: '下载更新' },
                    );
                    if (yes) {
                        if (el) el.textContent = `正在下载 v${res.latestVersion}…`;
                        renderUpdateDownloadProgress({ percent: 0 }, res.latestVersion);
                        unsubProgress = electron.onAppUpdateDownloadProgress?.((progress) => {
                            renderUpdateDownloadProgress(progress, res.latestVersion);
                        });
                        const dl = await electron.transubDownloadAppUpdate({
                            version: res.latestVersion,
                        });
                        if (!dl?.ok) {
                            setUpdateDownloadProgressVisible(false);
                            if (el) el.textContent = dl?.error || '下载失败';
                            const open = await appConfirmMsg('应用内下载失败，是否打开 GitHub Releases 手动下载？', { title: '下载失败' });
                            if (open) {
                                await electron.transubOpenUpdatePage?.({
                                    url: res.downloadUrl || res.releasesUrl,
                                });
                            }
                            return;
                        }
                        renderUpdateDownloadProgress({ percent: 100 }, res.latestVersion);
                        const detail = document.getElementById('updateDownloadDetail');
                        const label = document.getElementById('updateDownloadLabel');
                        if (label) label.textContent = `v${res.latestVersion} 已下载完成`;
                        if (detail) detail.textContent = '可立即重启安装';
                        if (el) el.textContent = dl.message || '更新已下载';
                        const install = await appConfirmMsg('更新已下载完成，是否立即重启安装？', { title: '安装更新' });
                        if (install) {
                            await electron.transubQuitAndInstallUpdate?.();
                        }
                    }
                } else {
                    const open = await appConfirmMsg(
                        `发现新版本 v${res.latestVersion}。\n\n是否打开下载页面？`,
                        { title: '发现更新' },
                    );
                    if (open) {
                        await electron?.transubOpenUpdatePage?.({
                            url: res.downloadUrl || res.releasesUrl,
                        });
                    }
                }
            }
        } catch (err) {
            setUpdateDownloadProgressVisible(false);
            if (el) el.textContent = err?.message || '检查更新失败';
        } finally {
            try { unsubProgress?.(); } catch { /* ignore */ }
            if (btn) btn.disabled = false;
            if (toolbarBtn) toolbarBtn.disabled = false;
        }
    }

    function bindMoreTab() {
        document.getElementById('exportConfigBtn')?.addEventListener('click', async () => {
            const res = await electron?.transWithAiExportConfig?.();
            const el = moreStatusEl();
            if (res?.ok && !res.canceled && el) el.textContent = `已导出：${res.path}`;
            else if (res?.error && el) el.textContent = res.error;
        });
        document.getElementById('importConfigBtn')?.addEventListener('click', async () => {
            const res = await electron?.transWithAiImportConfig?.();
            if (res?.ok && res.options) {
                core()?.applyOptionsToForm(res.options);
                core()?.markSettingsDirty?.(true);
                core()?.setSaveParamsStatus?.('配置已导入到表单，请点「保存设置」写入磁盘', 'warn');
                const el = moreStatusEl();
                if (el) el.textContent = '配置已导入到表单 — 请点底部「保存设置」';
            }
        });
        document.getElementById('checkUpdateBtn')?.addEventListener('click', () => {
            void runCheckAppUpdate();
        });
        document.getElementById('checkUpdateToolbarBtn')?.addEventListener('click', () => {
            void runCheckAppUpdate({
                triggerBtn: document.getElementById('checkUpdateToolbarBtn'),
            });
        });
        document.getElementById('openLibraryBtn')?.addEventListener('click', () => { void openSubtitleLibrary(); });
        document.getElementById('revealLibraryRootBtn')?.addEventListener('click', () => { void revealLibraryRoot(); });
        void refreshLibrarySettingsStatus();
        document.getElementById('clearTranscriptCacheBtn')?.addEventListener('click', async () => {
            const status = document.getElementById('historySettingsStatus');
            if (!(await appConfirmMsg('确定清理历史转录缓存？将删除「保留位置」目录中的字幕文件。', { title: '清理缓存', danger: true }))) return;
            try {
                const opts = core()?.buildSavedOptionsFromForm?.() || {};
                const res = await electron?.transubClearTranscriptCache?.(opts);
                if (res?.ok) {
                    if (status) {
                        status.textContent = `已清理 ${res.removed || 0} 个文件${res.dir ? `（${res.dir}）` : ''}`;
                    }
                } else if (status) {
                    status.textContent = res?.error || '清理失败';
                }
            } catch (err) {
                if (status) status.textContent = err?.message || '清理失败';
            }
        });
        document.getElementById('openWebsiteBtn')?.addEventListener('click', () => {
            void openExternalLink(OFFICIAL_SITE_URL, '已在浏览器中打开官方网站');
        });
        document.getElementById('openGithubReleasesBtn')?.addEventListener('click', () => {
            void openExternalLink(GITHUB_RELEASES_URL, '已在浏览器中打开 Github Releases');
        });
        document.getElementById('openCodebergReleasesBtn')?.addEventListener('click', () => {
            void openExternalLink(CODEBERG_RELEASES_URL, '已在浏览器中打开 Codeberg Releases');
        });
        document.getElementById('openAfdianFromSettingsBtn')?.addEventListener('click', () => {
            void openExternalLink(AFDIAN_PURCHASE_URL, '已在浏览器中打开赞助页面');
        });
        document.getElementById('openAboutFromSettingsBtn')?.addEventListener('click', () => {
            void electron?.transubOpenAboutWindow?.();
        });
        void syncMoreAfdianVisibility();
        document.getElementById('resetSettingsBtn')?.addEventListener('click', async () => {
            const status = document.getElementById('resetSettingsStatus');
            if (!(await appConfirmMsg('确定将设置重置为默认值？当前表单会被覆盖（仍需点「保存设置」才会写入磁盘）。', { title: '重置设置', danger: true }))) return;
            try {
                const list = await electron?.transWithAiGetPresets?.();
                const builtin = (list?.presets || []).find((p) => p.builtin && /默认|均衡|default/i.test(p.name || ''))
                    || (list?.presets || []).find((p) => p.builtin);
                if (builtin?.options) {
                    core()?.applyOptionsToForm?.(builtin.options);
                    core()?.markSettingsDirty?.(true);
                    core()?.setSaveParamsStatus?.(`已套用「${builtin.name}」，请点「保存设置」写入磁盘`, 'warn');
                    if (status) status.textContent = `已套用内置预设「${builtin.name}」— 请点底部「保存设置」`;
                } else if (status) {
                    status.textContent = '未找到可用的内置默认预设';
                }
            } catch (err) {
                if (status) status.textContent = err?.message || '重置失败';
            }
        });
        document.getElementById('openLatestLogBtn')?.addEventListener('click', async () => {
            const path = document.getElementById('installPathInput')?.value?.trim();
            const res = await electron?.transWithAiOpenLatestLog?.({ installPath: path });
            if (res?.ok === false) core()?.appendLog(res?.error || '打开日志失败', 'err');
        });
        document.getElementById('openEngineRawLogBtn')?.addEventListener('click', () => {
            void openEngineRawLog();
        });
        document.getElementById('engineOpenLogBtn')?.addEventListener('click', () => {
            void openEngineRawLog();
        });
    }

    function openPresetNameModal() {
        const modal = document.getElementById('presetNameModal');
        const input = document.getElementById('presetNameInput');
        const status = document.getElementById('presetNameStatus');
        if (!modal || !input) return;
        if (status) {
            status.textContent = '';
            status.className = 'text-xs text-gray-500 min-h-[1rem]';
        }
        input.value = '';
        modal.classList.remove('hidden');
        setTimeout(() => {
            input.focus();
            input.select?.();
        }, 0);
    }

    function closePresetNameModal() {
        document.getElementById('presetNameModal')?.classList.add('hidden');
    }

    async function confirmSavePreset() {
        const input = document.getElementById('presetNameInput');
        const status = document.getElementById('presetNameStatus');
        const confirmBtn = document.getElementById('presetNameConfirmBtn');
        const name = String(input?.value || '').trim();
        if (!name) {
            if (status) {
                status.textContent = '请输入预设名称';
                status.className = 'text-xs text-amber-600 min-h-[1rem]';
            }
            input?.focus();
            return;
        }
        if (!core()?.buildSavedOptionsFromForm) {
            if (status) {
                status.textContent = '无法读取当前参数';
                status.className = 'text-xs text-red-600 min-h-[1rem]';
            }
            return;
        }
        if (confirmBtn) confirmBtn.disabled = true;
        if (status) {
            status.textContent = '保存中…';
            status.className = 'text-xs text-gray-400 min-h-[1rem]';
        }
        try {
            const res = await electron?.transWithAiSavePreset?.({
                name,
                options: optionsForSavePreset(core().buildSavedOptionsFromForm()),
            });
            if (res?.ok) {
                await loadPresets();
                const sel = document.getElementById('presetSelect');
                if (sel && res.preset?.id) sel.value = res.preset.id;
                closePresetNameModal();
                core()?.appendLog(`已保存预设：${name}`, 'ok');
                const footer = document.getElementById('saveParamsStatus');
                if (footer) {
                    footer.textContent = `已保存预设：${name}`;
                    footer.className = 'text-xs text-emerald-600';
                }
            } else if (status) {
                status.textContent = res?.error || '保存失败';
                status.className = 'text-xs text-red-600 min-h-[1rem]';
            }
        } catch (err) {
            if (status) {
                status.textContent = err?.message || '保存失败';
                status.className = 'text-xs text-red-600 min-h-[1rem]';
            }
        } finally {
            if (confirmBtn) confirmBtn.disabled = false;
        }
    }

    function setPresetStatus(text, tone = '') {
        const el = document.getElementById('paramsPresetStatus');
        if (!el) return;
        el.textContent = text || '';
        el.dataset.tone = tone || '';
        if (tone === 'ok') el.className = 'text-xs text-emerald-600 min-h-[1rem]';
        else if (tone === 'err') el.className = 'text-xs text-red-600 min-h-[1rem]';
        else if (tone === 'warn') el.className = 'text-xs text-amber-700 min-h-[1rem]';
        else el.className = 'text-xs text-gray-500 min-h-[1rem]';
    }

    async function deleteSelectedPreset() {
        const sel = document.getElementById('presetSelect');
        const id = String(sel?.value || '').trim();
        if (!id) {
            setPresetStatus('请先选择要删除的自定义预设', 'warn');
            return;
        }
        const opt = sel?.selectedOptions?.[0];
        if (opt?.dataset?.builtin === '1' || /内置|builtin/i.test(opt?.textContent || '')) {
            setPresetStatus('内置预设不能删除', 'warn');
            return;
        }
        if (!(await appConfirmMsg(`确定删除预设「${opt?.textContent || id}」？`, { title: '删除预设', danger: true }))) return;
        try {
            const res = await electron?.transWithAiDeletePreset?.({ id });
            if (res?.ok) {
                await loadPresets();
                setPresetStatus('已删除预设', 'ok');
            } else {
                setPresetStatus(res?.error || '删除失败', 'err');
            }
        } catch (err) {
            setPresetStatus(err?.message || '删除失败', 'err');
        }
    }

    async function exportSelectedPreset() {
        const sel = document.getElementById('presetSelect');
        const id = String(sel?.value || '').trim();
        if (!id) {
            setPresetStatus('请先选择要导出的预设', 'warn');
            return;
        }
        try {
            const res = await electron?.transWithAiExportPreset?.({ id });
            if (res?.ok && !res.canceled) setPresetStatus(`已导出：${res.path || ''}`, 'ok');
            else if (res?.canceled) setPresetStatus('');
            else setPresetStatus(res?.error || '导出失败', 'err');
        } catch (err) {
            setPresetStatus(err?.message || '导出失败', 'err');
        }
    }

    async function importPresetFile() {
        try {
            const res = await electron?.transWithAiImportPreset?.();
            if (res?.ok && !res.canceled) {
                await loadPresets();
                const sel = document.getElementById('presetSelect');
                if (sel && res.preset?.id) sel.value = res.preset.id;
                setPresetStatus(`已导入预设：${res.preset?.name || ''}`, 'ok');
            } else if (res?.canceled) {
                setPresetStatus('');
            } else {
                setPresetStatus(res?.error || '导入失败', 'err');
            }
        } catch (err) {
            setPresetStatus(err?.message || '导入失败', 'err');
        }
    }

    function bindPresets() {
        document.getElementById('presetSelect')?.addEventListener('focus', (e) => {
            e.target.dataset.prevPresetId = e.target.value || '';
        });
        document.getElementById('presetSelect')?.addEventListener('change', (e) => {
            // Clear sticky ok/err so the description can show after picking another preset.
            const status = document.getElementById('paramsPresetStatus');
            if (status) status.dataset.tone = '';
            syncPresetSelectDescription();
            if (e.target.value) {
                // Settings apply keeps prior sense unless explicitly disabled; main-window
                // menu always passes autoSense:false. Align settings with closing sense
                // so the toolbar「参数」chip reflects the chosen preset.
                const sel = e.target;
                const prev = String(sel.dataset.prevPresetId || '').trim();
                void applyPreset(sel.value, { autoSense: false }).then((ok) => {
                    if (ok === false) {
                        sel.value = prev;
                        syncPresetSelectDescription();
                        return;
                    }
                    sel.dataset.prevPresetId = sel.value || '';
                });
            }
        });
        document.getElementById('savePresetBtn')?.addEventListener('click', () => {
            openPresetNameModal();
        });
        document.getElementById('deletePresetBtn')?.addEventListener('click', () => {
            void deleteSelectedPreset();
        });
        document.getElementById('exportPresetBtn')?.addEventListener('click', () => {
            void exportSelectedPreset();
        });
        document.getElementById('importPresetBtn')?.addEventListener('click', () => {
            void importPresetFile();
        });
        document.getElementById('presetNameCancelBtn')?.addEventListener('click', closePresetNameModal);
        document.getElementById('presetNameConfirmBtn')?.addEventListener('click', () => {
            void confirmSavePreset();
        });
        document.getElementById('presetNameInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void confirmSavePreset();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePresetNameModal();
            }
        });
        document.getElementById('presetNameModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePresetNameModal();
        });
    }

    function init() {
        if (!electron?.isDesktop) return;
        bindLogTabs();
        bindModals();
        bindMoreTab();
        bindPresets();
        syncOutputModeUi();
        document.getElementById('outputModeSelect')?.addEventListener('change', syncOutputModeUi);
        document.getElementById('outputDirBrowseBtn')?.addEventListener('click', async () => {
            const res = await electron?.selectFolder?.({ title: '选择字幕输出目录' });
            if (res?.ok && res.path) {
                const input = document.getElementById('outputDirInput');
                if (input) input.value = res.path;
            }
        });
        loadPresets();
        // GPU detect (nvidia-smi / PowerShell) is deferred until the install tab opens
        document.getElementById('applySuggestedDeviceBtn')?.addEventListener('click', applySuggestedDevice);
        electron.onTransWithAiInferLog?.((payload) => {
            if (payload?.line) appendInferLog(payload.line);
        });
        // Engine logs are also broadcast on transwithai-infer-log for this panel.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preview-sub]');
            if (!btn) return;
            e.preventDefault();
            showSubtitlePreview(btn.getAttribute('data-preview-sub'));
        });
        // 字幕编辑在独立窗口 subtitle-editor-launcher.js 中打开
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }

    global.TransubFeatures = {
        loadPresets,
        applyPreset,
        showInstallWizard,
        showSubtitlePreview,
        openSubtitleLibrary,
        openLibraryModal,
        refreshLibrarySettingsStatus,
        appendInferLog,
        activateLogTab,
    };
}(window));
