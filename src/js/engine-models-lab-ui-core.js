/**
 * Engine models laboratory modal UI (form, list, add/remove/download).
 * Shell injects DOM/IPC/state via createEngineModelsLabUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsLabUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsLabUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createEngineModelsLabUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
        const showToast = d.showToast || (() => {});
        const getDocument = d.getDocument
            || (() => (global && global.document) || null);
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const promptProUnlockRequired = d.promptProUnlockRequired || (() => {});
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const setCachedManagedLabModels = d.setCachedManagedLabModels || (() => {});
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const setEngineModelsStatusFilter = d.setEngineModelsStatusFilter || (() => {});
        const downloadManagedLlmModels = d.downloadManagedLlmModels || (async () => ({ ok: false }));
        const getLabApi = d.getLabApi
            || (() => (global && global.TransubEngineModelsLab) || null);

        let bound = false;

        function setEngineModelsLabFormStatus(message = '', kind = '') {
            const el = els.engineModelsLabFormStatus;
            if (!el) return;
            el.textContent = String(message || '');
            el.classList.remove('is-ok', 'is-err', 'is-warn');
            if (kind) el.classList.add(`is-${kind}`);
        }

        function syncEngineModelsLabPreview() {
            const preview = els.engineModelsLabPreview;
            const catalogApi = getManagedLlmCatalogApi();
            const url = String(els.engineModelsLabUrlInput?.value || '').trim();
            const fileName = String(els.engineModelsLabFileInput?.value || '').trim()
                || (catalogApi?.fileNameFromGgufUrl?.(url) || '');
            if (!preview) return;
            if (!fileName && !url) {
                preview.hidden = true;
                preview.textContent = '';
                return;
            }
            const name = String(els.engineModelsLabNameInput?.value || '').trim()
                || fileName.replace(/\.gguf$/i, '')
                || '未命名模型';
            const idHint = catalogApi?.slugifyLabModelId?.(fileName || name) || '';
            preview.hidden = false;
            preview.textContent = idHint
                ? `将添加：${name} · 文件 ${fileName || '（待填写）'} · id ${idHint}`
                : `将添加：${name}${fileName ? ` · ${fileName}` : ''}`;
        }

        function maybeAutofillLabFieldsFromUrl() {
            const catalogApi = getManagedLlmCatalogApi();
            const url = String(els.engineModelsLabUrlInput?.value || '').trim();
            const fromUrl = catalogApi?.fileNameFromGgufUrl?.(url) || '';
            if (fromUrl && els.engineModelsLabFileInput && !String(els.engineModelsLabFileInput.value || '').trim()) {
                els.engineModelsLabFileInput.value = fromUrl;
            }
            if (
                fromUrl
                && els.engineModelsLabNameInput
                && !String(els.engineModelsLabNameInput.value || '').trim()
            ) {
                els.engineModelsLabNameInput.value = fromUrl.replace(/\.gguf$/i, '');
            }
            syncEngineModelsLabPreview();
        }

        async function refreshEngineModelsLabList() {
            const listEl = els.engineModelsLabList;
            if (!listEl) return;
            let rows = [];
            try {
                const res = await electron?.transubAdvancedManagedLlmStatus?.();
                const managed = res?.managed || null;
                if (Array.isArray(managed?.managedLlm?.labModels)) {
                    const byId = new Map(
                        (Array.isArray(managed.catalog) ? managed.catalog : [])
                            .map((m) => [String(m.id || ''), m]),
                    );
                    rows = managed.managedLlm.labModels.map((lab) => {
                        const hit = byId.get(String(lab.id || ''));
                        return {
                            ...lab,
                            installed: !!hit?.installed,
                            ggufUrl: lab.ggufUrl || hit?.ggufUrl || '',
                        };
                    });
                    setCachedManagedLabModels(managed.managedLlm.labModels.slice());
                } else {
                    rows = (Array.isArray(managed?.catalog) ? managed.catalog : [])
                        .filter((m) => m?.experimental || m?.lab);
                }
            } catch (_) { /* ignore */ }
            if (els.engineModelsLabListCount) {
                els.engineModelsLabListCount.textContent = String(rows.length);
            }
            if (!rows.length) {
                listEl.innerHTML = '<div class="engine-models-lab-empty">还没有实验模型。<br>粘贴 GGUF 直链或填写文件名后点「添加到实验室」。</div>';
                return;
            }
            listEl.innerHTML = rows.map((entry) => {
                const id = esc(entry.id || '');
                const name = esc(entry.name || entry.id || '');
                const installed = !!entry.installed;
                const badge = installed
                    ? '<span class="engine-models-lab-item-badge is-ok">已安装</span>'
                    : '<span class="engine-models-lab-item-badge is-warn">待放入</span>';
                const meta = esc([entry.fileName, entry.ggufUrl ? '可下载' : '仅本机'].filter(Boolean).join(' · '));
                const downloadBtn = entry.ggufUrl && !installed
                    ? `<button type="button" class="btn btn-primary" data-lab-action="download" data-lab-id="${id}">下载</button>`
                    : '';
                return `<div class="engine-models-lab-item" data-lab-id="${id}">
                    <div class="engine-models-lab-item-main">
                        <div class="engine-models-lab-item-name">${name}${badge}</div>
                        <div class="engine-models-lab-item-meta">${meta}</div>
                    </div>
                    <div class="engine-models-lab-item-actions">
                        ${downloadBtn}
                        <button type="button" class="btn" data-lab-action="remove" data-lab-id="${id}">移除</button>
                    </div>
                </div>`;
            }).join('');
        }

        function setEngineModelsLabModalOpen(open) {
            const doc = getDocument();
            const modal = els.engineModelsLabModal
                || doc?.getElementById?.('engineModelsLabModal');
            if (!modal) return;
            if (open && !getAdvancedEntitled()) {
                void promptProUnlockRequired({ featureLabel: '模型实验室' });
                return;
            }
            if (open) {
                modal.classList.remove('hidden');
                modal.hidden = false;
                modal.setAttribute('aria-hidden', 'false');
                setEngineModelsLabFormStatus('');
                syncEngineModelsLabPreview();
                void refreshEngineModelsLabList();
                try { els.engineModelsLabUrlInput?.focus?.(); } catch (_) { /* ignore */ }
            } else {
                modal.classList.add('hidden');
                modal.hidden = true;
                modal.setAttribute('aria-hidden', 'true');
            }
        }

        function openEngineModelsLab() {
            setEngineModelsLabModalOpen(true);
        }

        function closeEngineModelsLab() {
            setEngineModelsLabModalOpen(false);
        }

        const submitLabAdd = async () => {
            if (!getAdvancedEntitled()) {
                void promptProUnlockRequired({ featureLabel: '模型实验室' });
                return;
            }
            maybeAutofillLabFieldsFromUrl();
            const built = getLabApi()?.buildLabAddPayloadFromForm?.({
                name: els.engineModelsLabNameInput?.value,
                ggufUrl: els.engineModelsLabUrlInput?.value,
                fileName: els.engineModelsLabFileInput?.value,
                paramBillion: els.engineModelsLabParamsInput?.value,
            });
            if (!built?.ok) {
                setEngineModelsLabFormStatus(built?.error || '表单无效', 'warn');
                showToast(built?.error || '表单无效', 'warn');
                return;
            }
            if (els.engineModelsLabAddBtn) els.engineModelsLabAddBtn.disabled = true;
            setEngineModelsLabFormStatus('正在添加…', '');
            try {
                const res = await electron?.transubAdvancedManagedLlmLabAdd?.(built.payload);
                if (!res?.ok) {
                    if (res?.code === 'pro_required') {
                        void promptProUnlockRequired({ featureLabel: '模型实验室' });
                        return;
                    }
                    setEngineModelsLabFormStatus(res?.error || '添加失败', 'err');
                    showToast(res?.error || '添加失败', 'err');
                    return;
                }
                setEngineModelsLabFormStatus(res.message || '已添加；可下载或放入文件后刷新模型列表', 'ok');
                showToast(res.message || '已添加', 'ok');
                if (els.engineModelsLabNameInput) els.engineModelsLabNameInput.value = '';
                if (els.engineModelsLabUrlInput) els.engineModelsLabUrlInput.value = '';
                if (els.engineModelsLabFileInput) els.engineModelsLabFileInput.value = '';
                if (els.engineModelsLabParamsInput) els.engineModelsLabParamsInput.value = '';
                syncEngineModelsLabPreview();
                await refreshEngineModelsLabList();
                await refreshEngineModels({ silent: true });
                setEngineModelsStatusFilter('experimental');
            } catch (err) {
                setEngineModelsLabFormStatus(err?.message || String(err), 'err');
                showToast(err?.message || String(err), 'err');
            } finally {
                if (els.engineModelsLabAddBtn) els.engineModelsLabAddBtn.disabled = false;
            }
        };

        function bindEngineModelsLabUi() {
            if (bound) return;
            // Defer until models workspace fragment (lab button + modal) is injected.
            const btn = els.engineModelsLabBtn
                || getDocument()?.getElementById?.('engineModelsLabBtn');
            if (!btn) return;
            bound = true;
            const doc = getDocument();

            els.engineModelsLabUrlInput?.addEventListener('input', () => {
                maybeAutofillLabFieldsFromUrl();
            });
            els.engineModelsLabUrlInput?.addEventListener('change', () => {
                maybeAutofillLabFieldsFromUrl();
            });
            els.engineModelsLabFileInput?.addEventListener('input', () => syncEngineModelsLabPreview());
            els.engineModelsLabNameInput?.addEventListener('input', () => syncEngineModelsLabPreview());
            els.engineModelsLabParamsInput?.addEventListener('input', () => syncEngineModelsLabPreview());

            els.engineModelsLabBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!getAdvancedEntitled()) {
                    void promptProUnlockRequired({ featureLabel: '模型实验室' });
                    return;
                }
                setEngineModelsLabModalOpen(true);
            });
            els.closeEngineModelsLabBtn?.addEventListener('click', () => {
                setEngineModelsLabModalOpen(false);
            });
            els.engineModelsLabModal?.addEventListener('click', (event) => {
                if (event.target === els.engineModelsLabModal) setEngineModelsLabModalOpen(false);
            });
            doc?.addEventListener?.('keydown', (event) => {
                if (event.key !== 'Escape') return;
                const modal = els.engineModelsLabModal
                    || doc.getElementById('engineModelsLabModal');
                if (!modal || modal.classList.contains('hidden') || modal.hidden) return;
                setEngineModelsLabModalOpen(false);
                event.preventDefault();
            });
            els.engineModelsLabModal?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                const tag = String(event.target?.tagName || '').toLowerCase();
                if (tag === 'textarea') return;
                if (event.target?.closest?.('.engine-models-lab-form')) {
                    event.preventDefault();
                    void submitLabAdd();
                }
            });
            els.engineModelsLabOpenFolderBtn?.addEventListener('click', async () => {
                if (!getAdvancedEntitled()) {
                    void promptProUnlockRequired({ featureLabel: '模型实验室' });
                    return;
                }
                try {
                    const res = await electron?.transubAdvancedManagedLlmOpenFolder?.({ kind: 'models' });
                    if (!res?.ok) {
                        setEngineModelsLabFormStatus(res?.error || '无法打开模型目录', 'err');
                        showToast(res?.error || '无法打开模型目录', 'err');
                        return;
                    }
                    setEngineModelsLabFormStatus('已打开模型目录；放入同名 .gguf 后点刷新即可', 'ok');
                } catch (err) {
                    showToast(err?.message || String(err), 'err');
                }
            });
            els.engineModelsLabAddBtn?.addEventListener('click', () => {
                void submitLabAdd();
            });
            els.engineModelsLabList?.addEventListener('click', async (event) => {
                const btn = event.target.closest?.('[data-lab-action]');
                if (!btn || !els.engineModelsLabList.contains(btn)) return;
                if (!getAdvancedEntitled()) {
                    void promptProUnlockRequired({ featureLabel: '模型实验室' });
                    return;
                }
                const action = btn.getAttribute('data-lab-action') || '';
                const modelId = btn.getAttribute('data-lab-id') || '';
                if (!modelId) return;
                btn.disabled = true;
                try {
                    if (action === 'download') {
                        setEngineModelsLabFormStatus('已开始下载，可在模型列表查看进度…', '');
                        setEngineModelsLabModalOpen(false);
                        await refreshEngineModels({ silent: true });
                        const res = await downloadManagedLlmModels([modelId], { force: false });
                        if (!res?.ok) showToast(res?.error || '下载失败', 'err');
                        return;
                    }
                    if (action !== 'remove') return;
                    const res = await electron?.transubAdvancedManagedLlmLabRemove?.({ modelId });
                    if (!res?.ok) {
                        if (res?.code === 'pro_required') {
                            void promptProUnlockRequired({ featureLabel: '模型实验室' });
                            return;
                        }
                        setEngineModelsLabFormStatus(res?.error || '移除失败', 'err');
                        showToast(res?.error || '移除失败', 'err');
                        return;
                    }
                    setEngineModelsLabFormStatus(res.message || '已移除', 'ok');
                    showToast(res.message || '已移除', 'ok');
                    await refreshEngineModelsLabList();
                    await refreshEngineModels({ silent: true });
                } catch (err) {
                    showToast(err?.message || String(err), 'err');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        return {
            setEngineModelsLabFormStatus,
            syncEngineModelsLabPreview,
            maybeAutofillLabFieldsFromUrl,
            setEngineModelsLabModalOpen,
            openEngineModelsLab,
            closeEngineModelsLab,
            refreshEngineModelsLabList,
            submitLabAdd,
            bindEngineModelsLabUi,
        };
    }

    return { createEngineModelsLabUi };
}));
