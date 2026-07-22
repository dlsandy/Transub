/**
 * Transub 扩展功能模块
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = () => global.TransubCore;

    function appendInferLog(line) {
        const host = document.getElementById('inferLogHost');
        if (!host) return;
        if (host.textContent.includes('infer 日志将显示在此处')) host.textContent = '';
        const row = document.createElement('div');
        row.className = 'infer-log-line text-gray-600';
        row.textContent = line;
        host.appendChild(row);
        while (host.childElementCount > 400) host.firstChild?.remove();
        const panel = host.closest('.log-panel') || host;
        panel.scrollTop = panel.scrollHeight;
    }

    function bindLogTabs() {
        document.querySelectorAll('.log-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.logTab;
                document.querySelectorAll('.log-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.logTab === tab));
                document.querySelectorAll('.log-panel').forEach((p) => {
                    const active = p.id === (tab === 'infer' ? 'logPanelInfer' : 'logPanelApp');
                    p.classList.toggle('active', active);
                    if (active) p.scrollTop = p.scrollHeight;
                });
            });
        });
    }

    async function loadPresets() {
        const res = await electron?.transWithAiGetPresets?.();
        const sel = document.getElementById('presetSelect');
        if (!sel || !res?.ok) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— 选择预设 —</option>';
        res.presets.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + (p.builtin ? '（内置）' : '');
            sel.appendChild(opt);
        });
        if (current) sel.value = current;
    }

    async function applyPreset(presetId) {
        const res = await electron?.transWithAiGetPresets?.();
        const preset = res?.presets?.find((p) => p.id === presetId);
        if (!preset?.options || !core()?.applyOptionsToForm) return;
        const current = core().buildSavedOptionsFromForm();
        core().applyOptionsToForm({ ...current, ...preset.options });
        core().appendLog(`已应用预设：${preset.name}`, 'info');
    }

    function syncOutputModeUi() {
        const mode = document.getElementById('outputModeSelect')?.value || 'same';
        const wrap = document.getElementById('outputDirWrap');
        wrap?.classList.toggle('hidden', mode !== 'custom');
    }

    async function scanFolder() {
        const res = await electron?.selectFolder?.({ title: '选择包含视频的文件夹' });
        if (!res?.ok || res.canceled || !res.path) return;
        const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
        if (!scan?.ok) {
            core()?.appendLog(scan?.error || '扫描文件夹失败', 'err');
            return;
        }
        await core()?.addFiles(scan.files || []);
        core()?.appendLog(`从文件夹添加 ${scan.files?.length || 0} 个视频`, 'info');
    }

    let installWizardPromise = null;

    async function showInstallWizard() {
        const box = document.getElementById('installWizardBox');
        const text = document.getElementById('installWizardText');
        const applyBtn = document.getElementById('applySuggestedDeviceBtn');
        if (!box || !text) return;
        if (box.dataset.loaded === '1') return;
        if (installWizardPromise) return installWizardPromise;

        installWizardPromise = (async () => {
            const res = await electron?.transWithAiDetectGpu?.();
            if (!res?.ok) return;
            const info = res.info || {};
            text.textContent = info.friendlyRecommendation || info.recommendation || '—';
            box.classList.remove('hidden');
            box.dataset.loaded = '1';
            if (applyBtn) {
                const device = String(info.suggestedDevice || '').trim();
                const sel = document.getElementById('deviceSelect');
                const hasOption = !!device && !!sel?.querySelector(`option[value="${device}"]`);
                applyBtn.classList.toggle('hidden', !hasOption);
                applyBtn.dataset.device = hasOption ? device : '';
            }
        })().finally(() => {
            installWizardPromise = null;
        });
        return installWizardPromise;
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

    function escHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function basenamePath(p) {
        return String(p || '').split(/[/\\]/).pop() || '—';
    }

    function formatHistoryTime(iso) {
        const raw = String(iso || '');
        if (!raw) return '—';
        try {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return raw;
            return d.toLocaleString();
        } catch {
            return raw;
        }
    }

    function statusLabel(status) {
        if (status === 'skipped') return '跳过';
        if (status === 'failed') return '失败';
        return '完成';
    }

    function renderHistoryList(entries) {
        const list = document.getElementById('historyList');
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (!list) return;
        list.innerHTML = '';
        const items = Array.isArray(entries) ? entries : [];
        if (!items.length) {
            list.innerHTML = '<p class="text-gray-400">暂无历史记录</p>';
        } else {
            items.forEach((e, jobIdx) => {
                const div = document.createElement('div');
                div.className = 'border rounded-lg p-2.5 bg-gray-50 space-y-1.5';
                const outputs = Array.isArray(e.outputs) ? e.outputs : [];
                const openable = outputs.filter((o) => o.openPath || o.subtitlePath);
                let filesHtml = '';
                if (openable.length) {
                    filesHtml = `<div class="mt-1.5 space-y-1 border-t border-gray-200 pt-1.5">
                        ${openable.map((o, fileIdx) => {
                            const subPath = o.openPath || o.subtitlePath || '';
                            const videoPath = o.videoPath || '';
                            const exists = o.exists !== false;
                            const name = basenamePath(subPath);
                            const st = statusLabel(o.status);
                            return `<div class="flex items-center gap-2 text-[11px]">
                                <span class="min-w-0 flex-1 truncate text-gray-700" title="${escHtml(subPath)}">${escHtml(name)}</span>
                                <span class="shrink-0 text-gray-400">${escHtml(st)}</span>
                                <button type="button"
                                    class="shrink-0 px-1.5 py-0.5 rounded border text-[11px] ${exists
                                        ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
                                        : 'border-gray-200 text-gray-400 cursor-not-allowed opacity-60'}"
                                    data-history-open-sub="${escHtml(subPath)}"
                                    data-history-open-video="${escHtml(videoPath)}"
                                    data-history-job="${jobIdx}"
                                    data-history-file="${fileIdx}"
                                    ${exists ? '' : 'disabled'}
                                    title="${exists ? '在字幕编辑器中打开' : '文件不存在'}">
                                    ${exists ? '打开字幕' : '文件缺失'}
                                </button>
                            </div>`;
                        }).join('')}
                    </div>`;
                } else {
                    filesHtml = '<p class="text-[11px] text-gray-400 mt-1">此记录无字幕路径（旧版历史或未生成文件）</p>';
                }
                div.innerHTML = `
                    <div class="font-medium text-gray-800">${escHtml(formatHistoryTime(e.finishedAt || e.startedAt))}</div>
                    <div class="text-gray-600">共 ${e.total || 0} · 成功 ${e.generated || 0} · 跳过 ${e.skipped || 0} · 失败 ${e.failed || 0}${e.cancelled ? ' · 已取消' : ''}${e.task ? ` · ${escHtml(e.task)}` : ''}</div>
                    ${filesHtml}`;
                list.appendChild(div);
            });
        }
        if (clearBtn) clearBtn.disabled = items.length === 0;
    }

    async function openHistorySubtitle(subPath, videoPath) {
        const path = String(subPath || '').trim();
        if (!path) {
            core()?.appendLog('缺少字幕路径', 'err');
            return;
        }
        try {
            const check = await electron?.transubFileExists?.({ path });
            if (!check?.ok) {
                core()?.appendLog(check?.error || '无法检测字幕文件', 'err');
                return;
            }
            if (!check.exists) {
                core()?.appendLog(`字幕文件不存在：${basenamePath(path)}`, 'err');
                window.alert(`字幕文件不存在：\n${path}`);
                // Refresh list so the button state updates
                const res = await electron?.transWithAiGetTaskHistory?.();
                if (res?.ok) renderHistoryList(res.entries);
                return;
            }
            const opened = await global.TransubSubtitleEditor?.openEditor?.(path, videoPath || '');
            if (opened) {
                document.getElementById('historyModal')?.classList.add('hidden');
            }
        } catch (err) {
            core()?.appendLog(err?.message || '打开字幕失败', 'err');
        }
    }

    async function openHistoryModal() {
        const modal = document.getElementById('historyModal');
        if (!modal) return;
        const res = await electron?.transWithAiGetTaskHistory?.();
        renderHistoryList(res?.ok ? res.entries : []);
        if (!res?.ok) {
            core()?.appendLog(res?.error || '加载任务历史失败', 'err');
        }
        modal.classList.remove('hidden');
    }

    async function clearHistoryRecords() {
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn?.disabled) return;
        if (!window.confirm('确定清除全部任务历史？此操作不可恢复。')) return;
        if (clearBtn) clearBtn.disabled = true;
        try {
            const res = await electron?.transWithAiClearTaskHistory?.();
            if (!res?.ok) {
                core()?.appendLog(res?.error || '清除任务历史失败', 'err');
                renderHistoryList((await electron?.transWithAiGetTaskHistory?.())?.entries || []);
                return;
            }
            renderHistoryList([]);
            core()?.appendLog('已清除全部任务历史', 'ok');
        } catch (err) {
            core()?.appendLog(err?.message || '清除任务历史失败', 'err');
            if (clearBtn) clearBtn.disabled = false;
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
        document.getElementById('closeHistoryBtn')?.addEventListener('click', () => {
            document.getElementById('historyModal')?.classList.add('hidden');
        });
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
            void clearHistoryRecords();
        });
        document.getElementById('historyList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-history-open-sub]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            void openHistorySubtitle(
                btn.getAttribute('data-history-open-sub'),
                btn.getAttribute('data-history-open-video') || '',
            );
        });
        document.getElementById('previewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') e.currentTarget.classList.add('hidden');
        });
        document.getElementById('historyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') e.currentTarget.classList.add('hidden');
        });
    }

    const PROJECT_HOME_URL = 'https://github.com/dlsandy/Transub';

    function moreStatusEl() {
        return document.getElementById('moreStatus');
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
                    const yes = window.confirm(
                        `发现新版本 v${res.latestVersion}。\n\n是否下载并在重启后安装？\n（仅 NSIS 安装版支持应用内更新）`,
                    );
                    if (yes) {
                        if (el) el.textContent = `正在下载 v${res.latestVersion}…`;
                        renderUpdateDownloadProgress({ percent: 0 }, res.latestVersion);
                        unsubProgress = electron.onAppUpdateDownloadProgress?.((progress) => {
                            renderUpdateDownloadProgress(progress, res.latestVersion);
                        });
                        const dl = await electron.transubDownloadAppUpdate();
                        if (!dl?.ok) {
                            setUpdateDownloadProgressVisible(false);
                            if (el) el.textContent = dl?.error || '下载失败';
                            const open = window.confirm('应用内下载失败，是否打开 GitHub Releases 手动下载？');
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
                        const install = window.confirm('更新已下载完成，是否立即重启安装？');
                        if (install) {
                            await electron.transubQuitAndInstallUpdate?.();
                        }
                    }
                } else {
                    const open = window.confirm(
                        `发现新版本 v${res.latestVersion}。\n\n是否打开下载页面？`,
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
                const el = moreStatusEl();
                if (el) el.textContent = '配置已导入';
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
        electron?.onSettingsCheckUpdate?.(() => {
            void runCheckAppUpdate({
                triggerBtn: document.getElementById('checkUpdateBtn'),
            });
        });
        document.getElementById('openHistoryBtn')?.addEventListener('click', openHistoryModal);
        document.getElementById('openWebsiteBtn')?.addEventListener('click', async () => {
            const el = moreStatusEl();
            try {
                const res = await electron?.openExternal?.(PROJECT_HOME_URL);
                if (res?.ok === false) {
                    if (el) el.textContent = res?.error || '打开官网失败';
                    return;
                }
                if (el) el.textContent = '已在浏览器中打开项目主页';
            } catch (err) {
                if (el) el.textContent = err?.message || '打开官网失败';
            }
        });
        document.getElementById('openLatestLogBtn')?.addEventListener('click', async () => {
            const path = document.getElementById('installPathInput')?.value?.trim();
            const res = await electron?.transWithAiOpenLatestLog?.({ installPath: path });
            if (res?.ok === false) core()?.appendLog(res?.error || '打开日志失败', 'err');
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
                options: core().buildSavedOptionsFromForm(),
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

    function bindPresets() {
        document.getElementById('presetSelect')?.addEventListener('change', (e) => {
            if (e.target.value) applyPreset(e.target.value);
        });
        document.getElementById('savePresetBtn')?.addEventListener('click', () => {
            openPresetNameModal();
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

    global.TransubFeatures = { loadPresets, showInstallWizard, showSubtitlePreview, appendInferLog };
}(window));
