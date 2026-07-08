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
        host.scrollTop = host.scrollHeight;
    }

    function bindLogTabs() {
        document.querySelectorAll('.log-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.logTab;
                document.querySelectorAll('.log-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.logTab === tab));
                document.querySelectorAll('.log-panel').forEach((p) => {
                    p.classList.toggle('active', p.id === (tab === 'infer' ? 'logPanelInfer' : 'logPanelApp'));
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

    async function showInstallWizard() {
        const res = await electron?.transWithAiDetectGpu?.();
        const box = document.getElementById('installWizardBox');
        const text = document.getElementById('installWizardText');
        if (!box || !text || !res?.ok) return;
        const info = res.info || {};
        text.textContent = info.friendlyRecommendation || info.recommendation || '—';
        box.classList.remove('hidden');
    }

    async function openHistoryModal() {
        const modal = document.getElementById('historyModal');
        const list = document.getElementById('historyList');
        if (!modal || !list) return;
        const res = await electron?.transWithAiGetTaskHistory?.();
        list.innerHTML = '';
        if (!res?.ok || !res.entries?.length) {
            list.innerHTML = '<p class="text-gray-400">暂无历史记录</p>';
        } else {
            res.entries.forEach((e) => {
                const div = document.createElement('div');
                div.className = 'border rounded-lg p-2 bg-gray-50';
                div.innerHTML = `<div class="font-medium">${e.finishedAt || e.startedAt}</div>
                    <div>共 ${e.total} · 成功 ${e.generated} · 跳过 ${e.skipped} · 失败 ${e.failed}${e.cancelled ? ' · 已取消' : ''}</div>`;
                list.appendChild(div);
            });
        }
        modal.classList.remove('hidden');
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
        document.getElementById('previewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') e.currentTarget.classList.add('hidden');
        });
        document.getElementById('historyModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') e.currentTarget.classList.add('hidden');
        });
    }

    function bindAdvanced() {
        document.getElementById('exportConfigBtn')?.addEventListener('click', async () => {
            const res = await electron?.transWithAiExportConfig?.();
            const el = document.getElementById('advancedStatus');
            if (res?.ok && !res.canceled && el) el.textContent = `已导出：${res.path}`;
            else if (res?.error && el) el.textContent = res.error;
        });
        document.getElementById('importConfigBtn')?.addEventListener('click', async () => {
            const res = await electron?.transWithAiImportConfig?.();
            if (res?.ok && res.options) {
                core()?.applyOptionsToForm(res.options);
                if (document.getElementById('advancedStatus')) {
                    document.getElementById('advancedStatus').textContent = '配置已导入';
                }
            }
        });
        document.getElementById('checkUpdateBtn')?.addEventListener('click', async () => {
            const res = await electron?.transWithAiCheckAppUpdate?.();
            const el = document.getElementById('advancedStatus');
            if (res?.ok && el) {
                el.textContent = `当前版本 v${res.currentVersion}，请访问 GitHub Releases 查看 TransWithAI 更新`;
            }
        });
        document.getElementById('openHistoryBtn')?.addEventListener('click', openHistoryModal);
        document.getElementById('openLatestLogBtn')?.addEventListener('click', async () => {
            const path = document.getElementById('installPathInput')?.value?.trim();
            const res = await electron?.transWithAiOpenLatestLog?.({ installPath: path });
            if (res?.ok === false) core()?.appendLog(res?.error || '打开日志失败', 'err');
        });
    }

    function bindPresets() {
        document.getElementById('presetSelect')?.addEventListener('change', (e) => {
            if (e.target.value) applyPreset(e.target.value);
        });
        document.getElementById('savePresetBtn')?.addEventListener('click', async () => {
            const name = prompt('预设名称');
            if (!name || !core()?.buildSavedOptionsFromForm) return;
            const res = await electron?.transWithAiSavePreset?.({
                name,
                options: core().buildSavedOptionsFromForm(),
            });
            if (res?.ok) {
                await loadPresets();
                core()?.appendLog(`已保存预设：${name}`, 'ok');
            }
        });
    }

    function init() {
        if (!electron?.isDesktop) return;
        bindLogTabs();
        bindModals();
        bindAdvanced();
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
        showInstallWizard();
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
