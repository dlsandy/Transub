/**
 * Models-pick UI for translateMode=external: Station vs BYOK source + Station model list.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateExternalPick = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateExternalPickFactory(global) {
    /**
     * @param {object} deps
     */
    function createTranslateExternalPick(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const showToast = d.showToast || (() => {});
        const openAppSettings = d.openAppSettings || (() => {});
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const syncTransubStationSettingsUi = d.syncTransubStationSettingsUi || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const getCachedSmartTranslatePick = d.getCachedSmartTranslatePick || (() => null);
        const ensureSmartTranslatePickCache = d.ensureSmartTranslatePickCache || (async () => null);
        const syncModelsMenuDetailUi = d.syncModelsMenuDetailUi || (() => {});
        const syncTranslateChipUi = d.syncTranslateChipUi || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});

        let stationModelsCache = [];
        let stationModelsLoading = false;
        let stationListInflight = null;
        let lastStationError = '';
        let lastStationReady = false;

        function docEl(id) {
            return getDocument()?.getElementById?.(id) || null;
        }

        function stationEnabledFromForm() {
            const check = docEl('transubStationEnabledCheck') || els.transubStationEnabledCheck;
            if (check) return !!check.checked;
            return !!getCachedSmartTranslatePick()?.transubStationEnabled;
        }

        function stationUrlFromForm() {
            const input = docEl('transubStationUrlInput') || els.transubStationUrlInput;
            return String(
                input?.value
                || getCachedSmartTranslatePick()?.transubStationUrl
                || 'http://127.0.0.1:8787',
            ).trim() || 'http://127.0.0.1:8787';
        }

        function stationModelFromForm() {
            const input = docEl('transubStationModelInput') || els.transubStationModelInput;
            return String(input?.value || '').trim();
        }

        function setStationModelOnForm(modelId) {
            const input = docEl('transubStationModelInput') || els.transubStationModelInput;
            if (input) {
                els.transubStationModelInput = input;
                input.value = String(modelId || '').trim();
            }
        }

        function setStationEnabledOnForm(on) {
            const check = docEl('transubStationEnabledCheck') || els.transubStationEnabledCheck;
            if (check) {
                els.transubStationEnabledCheck = check;
                check.checked = !!on;
            }
            try { syncTransubStationSettingsUi(); } catch (_) { /* ignore */ }
        }

        function externalSource() {
            return stationEnabledFromForm() ? 'station' : 'byok';
        }

        function paintSourceSwitch(active) {
            const switchEl = els.translateExternalSourceSwitch || docEl('translateExternalSourceSwitch');
            const stationBtn = els.translateExternalStationBtn || docEl('translateExternalStationBtn');
            const byokBtn = els.translateExternalByokBtn || docEl('translateExternalByokBtn');
            if (switchEl) {
                switchEl.hidden = false;
                switchEl.removeAttribute?.('hidden');
                switchEl.classList?.remove?.('hidden');
            }
            if (stationBtn) {
                const on = active === 'station';
                stationBtn.classList.toggle('is-active', on);
                stationBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            if (byokBtn) {
                const on = active === 'byok';
                byokBtn.classList.toggle('is-active', on);
                byokBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        }

        function hideSourceSwitch() {
            const switchEl = els.translateExternalSourceSwitch || docEl('translateExternalSourceSwitch');
            if (switchEl) {
                switchEl.hidden = true;
                switchEl.setAttribute?.('hidden', '');
                switchEl.classList?.add?.('hidden');
            }
        }

        function renderHint(_text) {
            if (!els.translateMtAutoHint) return;
            els.translateMtAutoHint.textContent = '';
            els.translateMtAutoHint.hidden = true;
            els.translateMtAutoHint.classList?.add?.('hidden');
        }

        function renderByokPanel(host) {
            if (!host) return;
            host.innerHTML = '';
            const pick = getCachedSmartTranslatePick() || {};
            const model = String(pick.byokModel || '').trim();
            const base = String(pick.byokBaseUrl || '').trim();
            const row = getDocument().createElement('p');
            row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
            row.textContent = model && base
                ? `当前外接 API：${model}`
                : '尚未配置外接 API（Base URL + 模型名）';
            host.appendChild(row);
            const btn = getDocument().createElement('button');
            btn.type = 'button';
            btn.className = 'post-task-menu-item models-pick-settings-link';
            btn.innerHTML = '<i class="fa fa-sliders w-4 text-center text-gray-400" aria-hidden="true"></i><span>打开外部翻译设置…</span>';
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                openAppSettings('external-translate');
            });
            host.appendChild(btn);
        }

        function renderStationModels(host, {
            models = [],
            activeModel = '',
            loading = false,
            error = '',
            ready = false,
        } = {}) {
            if (!host) return;
            host.innerHTML = '';
            if (loading) {
                const row = getDocument().createElement('p');
                row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
                row.textContent = '正在拉取 Station 模型…';
                host.appendChild(row);
                return;
            }
            if (error && !models.length) {
                const row = getDocument().createElement('p');
                row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
                row.textContent = error;
                host.appendChild(row);
                const btn = getDocument().createElement('button');
                btn.type = 'button';
                btn.className = 'post-task-menu-item models-pick-settings-link';
                btn.innerHTML = '<i class="fa fa-sliders w-4 text-center text-gray-400" aria-hidden="true"></i><span>打开外部翻译设置…</span>';
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    openAppSettings('external-translate');
                });
                host.appendChild(btn);
                return;
            }
            if (!models.length) {
                const row = getDocument().createElement('p');
                row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
                row.textContent = ready
                    ? 'Station 已就绪，但未返回模型列表'
                    : 'Station 未就绪 · 请先在控制台启动模型';
                host.appendChild(row);
                return;
            }
            for (const model of models) {
                const id = String(model?.id || '').trim();
                if (!id) continue;
                const btn = getDocument().createElement('button');
                btn.type = 'button';
                btn.className = 'post-task-menu-item';
                btn.dataset.stationModel = id;
                btn.setAttribute('role', 'menuitem');
                if (activeModel && id === activeModel) btn.classList.add('active');
                btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
                btn.querySelector('span').textContent = model.name || id;
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    void selectExternalStationModel(id);
                });
                host.appendChild(btn);
            }
        }

        async function refreshStationModels({ force = false } = {}) {
            if (stationListInflight && !force) return stationListInflight;
            if (stationListInflight) return stationListInflight;
            if (typeof electron?.transubStationListModels !== 'function') {
                lastStationError = '无法拉取 Station 模型（请完全退出后重启应用）';
                lastStationReady = false;
                return {
                    ok: false,
                    models: stationModelsCache.slice(),
                    activeModel: stationModelFromForm(),
                    ready: false,
                    error: lastStationError,
                };
            }
            stationModelsLoading = true;
            stationListInflight = (async () => {
                try {
                    const res = await electron.transubStationListModels({
                        transubStationEnabled: true,
                        transubStationUrl: stationUrlFromForm(),
                        preferredModel: stationModelFromForm(),
                    });
                    stationModelsCache = Array.isArray(res?.models) ? res.models.slice() : [];
                    lastStationError = String(res?.error || '').trim();
                    lastStationReady = !!res?.ready;
                    return {
                        ok: !!res?.ok,
                        models: stationModelsCache,
                        activeModel: String(res?.activeModel || stationModelFromForm() || '').trim(),
                        ready: lastStationReady,
                        error: lastStationError,
                    };
                } catch (err) {
                    lastStationError = err?.message || String(err);
                    lastStationReady = false;
                    return {
                        ok: false,
                        models: stationModelsCache.slice(),
                        activeModel: stationModelFromForm(),
                        ready: false,
                        error: lastStationError,
                    };
                } finally {
                    stationModelsLoading = false;
                    stationListInflight = null;
                }
            })();
            return stationListInflight;
        }

        /**
         * Paint external-mode detail into the shared MT section hosts.
         * @returns {boolean} true when this module handled the paint
         */
        function paintExternalMtSection({
            host,
            listWrap,
            mtPickSwitch,
            sectionLabel,
            allow,
        } = {}) {
            if (!allow) {
                hideSourceSwitch();
                return false;
            }
            const source = externalSource();
            paintSourceSwitch(source);
            if (mtPickSwitch) mtPickSwitch.classList.add('hidden');
            if (sectionLabel) {
                sectionLabel.textContent = source === 'station' ? 'Station 模型' : '外接 API';
                sectionLabel.hidden = false;
                sectionLabel.classList.remove('hidden');
            }
            if (listWrap) listWrap.classList.remove('hidden');
            if (source === 'byok') {
                renderHint('外接 API：使用本机保存的 Base URL / Key / 模型名。');
                renderByokPanel(host);
                void ensureSmartTranslatePickCache({ force: false }).then(() => {
                    if (externalSource() === 'byok') renderByokPanel(host);
                });
                syncModelsMenuDetailUi();
                return true;
            }
            renderHint('从 Transub Station 选用模型；点选后立即生效。');
            const showLoading = !stationModelsCache.length && (stationModelsLoading || !lastStationError);
            renderStationModels(host, {
                models: stationModelsCache,
                activeModel: stationModelFromForm(),
                loading: showLoading && !stationModelsCache.length,
                error: lastStationError,
                ready: lastStationReady,
            });
            void refreshStationModels({ force: false }).then((info) => {
                if (externalSource() !== 'station') return;
                const payload = info && !Array.isArray(info)
                    ? info
                    : {
                        models: stationModelsCache,
                        activeModel: stationModelFromForm(),
                        error: lastStationError,
                        ready: lastStationReady,
                    };
                const active = String(payload.activeModel || stationModelFromForm() || '').trim();
                if (active && !stationModelFromForm()) setStationModelOnForm(active);
                renderStationModels(host, {
                    models: payload.models || stationModelsCache,
                    activeModel: active || stationModelFromForm(),
                    loading: false,
                    error: payload.error || '',
                    ready: !!payload.ready,
                });
                // Do not call syncTranslateChipUi here — it rebuilds this panel and
                // would leave the list stuck on「正在拉取 Station 模型…」.
                syncModelsMenuDetailUi();
                updateReadinessStrip();
            });
            return true;
        }

        async function setExternalTranslateSource(source) {
            const next = String(source || '').trim() === 'byok' ? 'byok' : 'station';
            setStationEnabledOnForm(next === 'station');
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
            await persistFormOptionsQuiet();
            try {
                await ensureSmartTranslatePickCache({ force: true });
            } catch (_) { /* ignore */ }
            syncTranslateChipUi();
            updateReadinessStrip();
            syncModelsMenuDetailUi();
            showToast(
                next === 'station' ? '外部翻译：已改用 Transub Station' : '外部翻译：已改用外接 API',
                'ok',
            );
            return next;
        }

        async function selectExternalStationModel(modelId) {
            const id = String(modelId || '').trim();
            if (!id) return false;
            setStationEnabledOnForm(true);
            setStationModelOnForm(id);
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
            showToast(`正在切换 Station 模型：${id}…`, 'info');
            let warning = '';
            let switched = false;
            let ready = false;
            try {
                const res = await electron?.transubStationSelectModel?.({
                    transubStationEnabled: true,
                    transubStationUrl: stationUrlFromForm(),
                    model: id,
                    wait: true,
                });
                switched = !!res?.switched || !!res?.ok;
                ready = !!res?.ready;
                warning = String(res?.warning || res?.error || '').trim();
                // Prefer the clicked list id so highlight matches the button the user pressed.
                // Only adopt Station-reported id when it appears in the current catalog.
                const reported = String(res?.activeModel || '').trim();
                const chosen = (
                    reported
                    && stationModelsCache.some((m) => String(m?.id || '') === reported)
                )
                    ? reported
                    : id;
                setStationModelOnForm(chosen);
                if (switched) lastStationReady = ready || lastStationReady;
            } catch (err) {
                warning = err?.message || String(err);
            }
            await persistFormOptionsQuiet();
            const host = els.translateMtModelList
                || getDocument()?.getElementById?.('translateMtModelList');
            if (host && externalSource() === 'station') {
                const chosen = stationModelFromForm() || id;
                if (!stationModelsCache.some((m) => String(m?.id || '') === chosen)) {
                    stationModelsCache = [{ id: chosen, name: chosen }, ...stationModelsCache];
                }
                renderStationModels(host, {
                    models: stationModelsCache,
                    activeModel: chosen,
                    loading: false,
                    error: switched ? '' : warning,
                    ready: switched ? (ready || true) : lastStationReady,
                });
            }
            updateReadinessStrip();
            syncModelsMenuDetailUi();
            const label = stationModelFromForm() || id;
            if (switched) {
                showToast(
                    ready
                        ? `已切换 Station 模型：${label}`
                        : `已请求切换 Station 模型：${label}`,
                    'ok',
                );
            } else {
                showToast(
                    warning
                        ? `已记下首选模型「${label}」（${warning}）`
                        : `已记下首选模型：${label}`,
                    'warn',
                );
            }
            return true;
        }

        return {
            externalSource,
            paintExternalMtSection,
            hideSourceSwitch,
            setExternalTranslateSource,
            selectExternalStationModel,
            refreshStationModels,
            getStationModelsCache: () => stationModelsCache.slice(),
        };
    }

    return { createTranslateExternalPick };
}));
