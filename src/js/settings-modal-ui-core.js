/**
 * Settings modal chrome: open/close, tab switch, nav search, tip bubbles.
 * Shell injects DOM/state/IPC via createSettingsModalUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsModalUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsModalUiFactory(global) {
    /** Legacy / alias tab ids → current panel ids */
    const PARAMS_TAB_ALIASES = {
        ffmpeg: 'install',
        advanced: 'pro',
        pro: 'pro',
        license: 'pro',
        'pro-license': 'pro',
        'pro-llm': 'pro-smart-translate',
        llm: 'pro-smart-translate',
        byok: 'external-translate',
        external: 'external-translate',
        'external-translate': 'external-translate',
        'external-mt': 'external-translate',
        station: 'external-translate',
        'transub-station': 'external-translate',
        外部翻译: 'external-translate',
        外接API: 'external-translate',
        '外接 API': 'external-translate',
        'Transub Station': 'external-translate',
        'pro-smart-translate': 'pro-smart-translate',
        'smart-translate': 'pro-smart-translate',
        'pro-film-audio': 'pro-film-audio',
        'film-audio': 'pro-film-audio',
        filmAudio: 'pro-film-audio',
        'pro-qc-smart': 'pro-qc-smart',
        'qc-smart': 'pro-qc-smart',
        qcSmart: 'pro-qc-smart',
        'pro-reconstruct': 'pro-reconstruct',
        reconstruct: 'pro-reconstruct',
        film: 'pro-reconstruct',
        environment: 'install',
        install: 'install',
        运行环境: 'install',
        环境: 'install',
        general: 'runtime',
        runtime: 'runtime',
        常规: 'runtime',
        editorAdvanced: 'editor',
        editor: 'editor',
        字幕编辑器: 'editor',
        transcribe: 'process',
        transcription: 'process',
        process: 'process',
        任务处理: 'process',
        字幕处理: 'process',
        models: 'install',
        处理模型: 'install',
        模型: 'install',
        模型库: 'install',
        output: 'output',
        字幕输出: 'output',
        输出: 'output',
        notify: 'runtime',
        notification: 'runtime',
        notifications: 'runtime',
        tray: 'runtime',
        taskbar: 'runtime',
        托盘: 'runtime',
        任务栏: 'runtime',
        任务栏与通知: 'runtime',
        history: 'output',
        历史记录: 'output',
        转录保留: 'output',
        转录: 'output',
        performance: 'process',
        perf: 'process',
        硬件: 'process',
        性能: 'process',
        params: 'params',
        presets: 'params',
        识别参数: 'params',
        参数: 'params',
        场景: 'params',
        network: 'network',
        proxy: 'network',
        网络与代理: 'network',
        网络: 'network',
        more: 'more',
        更多: 'more',
        burn: 'burn',
        hardsub: 'burn',
        字幕烧录: 'burn',
        烧录: 'burn',
        'auto-scan': 'auto-scan',
        autoscan: 'auto-scan',
        扫描目录: 'auto-scan',
        Pro许可: 'pro',
        许可: 'pro',
        大模型设置: 'pro-reconstruct',
        智能翻译模型: 'pro-smart-translate',
        混合润色模型: 'pro-smart-translate',
        智能翻译: 'pro-smart-translate',
        混合翻译: 'pro-smart-translate',
        影视音频增强: 'pro-film-audio',
        智能修复: 'pro-qc-smart',
        QC智能修复: 'pro-qc-smart',
        语境和理解重构: 'pro-reconstruct',
        Station: 'external-translate',
    };

    const ENV_CHIP_IDS = {
        engine: { chip: 'settingsEnvChipEngine', state: 'settingsEnvChipEngineState' },
        gpu: { chip: 'settingsEnvChipGpu', state: 'settingsEnvChipGpuState' },
        llama: { chip: 'settingsEnvChipLlama', state: 'settingsEnvChipLlamaState' },
    };

    function getEnvDoc() {
        return (typeof document !== 'undefined' ? document : null)
            || global?.document
            || null;
    }

    /**
     * Update one overview chip on 运行环境.
     * @param {'engine'|'gpu'|'llama'} which
     * @param {{ state?: string, label?: string }} info
     */
    function setEnvOverviewChip(which, info = {}) {
        const doc = getEnvDoc();
        const ids = ENV_CHIP_IDS[which];
        if (!doc || !ids) return;
        const chip = doc.getElementById(ids.chip);
        const stateEl = doc.getElementById(ids.state);
        const state = String(info.state || '').trim() || 'busy';
        const label = String(info.label || '').trim();
        if (chip) chip.setAttribute('data-state', state);
        if (stateEl && label) stateEl.textContent = label;
    }

    /**
     * Enable/disable Engine-GPU actions that require a validated engine.
     * @param {boolean} ready
     */
    function setEnvGpuActionsEnabled(ready) {
        const doc = getEnvDoc();
        if (!doc) return;
        const tip = ready
            ? ''
            : '请先在「① Transub引擎」检测通过后再安装 GPU 组件';
        doc.querySelectorAll('[data-requires-engine="1"]').forEach((el) => {
            if (!el || typeof el !== 'object') return;
            if (!el.dataset) el.dataset = {};
            if (!el.dataset.baseTitle) {
                const current = typeof el.getAttribute === 'function'
                    ? (el.getAttribute('title') || '')
                    : '';
                // Prefer explicit data-base-title; avoid capturing the lock tip as base.
                el.dataset.baseTitle = current.includes('请先在「① Transub引擎」') ? '' : current;
            }
            el.disabled = !ready;
            const base = el.dataset.baseTitle || '';
            if (ready) {
                if (base && typeof el.setAttribute === 'function') el.setAttribute('title', base);
                else if (typeof el.removeAttribute === 'function') el.removeAttribute('title');
            } else if (typeof el.setAttribute === 'function') {
                el.setAttribute('title', tip);
            }
        });
    }

    function flashEnvSection(sectionEl) {
        if (!sectionEl) return;
        sectionEl.classList.add('is-env-flash');
        setTimeout(() => sectionEl.classList.remove('is-env-flash'), 900);
    }

    function scrollToEnvSection(targetId) {
        const doc = getEnvDoc();
        if (!doc || !targetId) return;
        const section = doc.getElementById(String(targetId));
        if (!section) return;
        try {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {
            section.scrollIntoView();
        }
        flashEnvSection(section);
    }

    function bindSettingsEnvOverview(doc = getEnvDoc()) {
        const overview = doc?.getElementById?.('settingsEnvOverview');
        if (!overview || overview.dataset.bound === '1') return;
        overview.dataset.bound = '1';
        overview.addEventListener('click', (event) => {
            const chip = event.target?.closest?.('.settings-env-chip');
            if (!chip || !overview.contains(chip)) return;
            scrollToEnvSection(chip.getAttribute('data-env-target'));
        });
    }

    /**
     * @param {object} deps shell adapters
     */
    function createSettingsModalUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const getWindow = d.getWindow
            || (() => (typeof window !== 'undefined' ? window : (global && global.window)));
        const getGlobal = d.getGlobal || (() => global);

        const getActiveParamsTab = d.getActiveParamsTab || (() => 'runtime');
        const setActiveParamsTab = d.setActiveParamsTab || (() => {});
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const getIsStandaloneSettings = d.getIsStandaloneSettings || (() => false);
        const getIsStandaloneWizard = d.getIsStandaloneWizard || (() => false);
        const getIsStandaloneChrome = d.getIsStandaloneChrome || (() => false);
        const getSettingsFormDirty = d.getSettingsFormDirty || (() => false);
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});

        const isProGatedTab = d.isProGatedTab || ((tabId) => String(tabId || '').startsWith('pro-'));
        const PRO_GATED_TAB_TITLES = d.PRO_GATED_TAB_TITLES || {};
        const promptProUnlockRequired = d.promptProUnlockRequired || (async () => false);
        const ensureSettingsFeatureScripts = d.ensureSettingsFeatureScripts || (async () => {});
        const ensureSettingsShellReady = d.ensureSettingsShellReady || (async () => {});
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'transub');
        const ensureEngineModelsCacheApplied = d.ensureEngineModelsCacheApplied || (async () => {});
        const refreshEngineStatus = d.refreshEngineStatus || (async () => {});
        const isDesktop = d.isDesktop || (() => false);
        const setPostTaskMenuOpen = d.setPostTaskMenuOpen || (() => {});
        const setAddMenuOpen = d.setAddMenuOpen || (() => {});
        const reloadSavedOptionsIntoForm = d.reloadSavedOptionsIntoForm || (async () => false);
        const buildSavedOptionsFromForm = d.buildSavedOptionsFromForm || (() => ({}));
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});
        const refreshAdvancedEntitlement = d.refreshAdvancedEntitlement || (async () => {});
        const refreshSettingsBurnEncoderSelect = d.refreshSettingsBurnEncoderSelect || (async () => {});
        const refreshSenseMemoryStatus = d.refreshSenseMemoryStatus || (() => {});
        const refreshPostBatchTextPresetSelect = d.refreshPostBatchTextPresetSelect || (async () => {});
        const openEngineModelsLibrary = d.openEngineModelsLibrary || (() => {});
        const closeEngineModelsLibrary = d.closeEngineModelsLibrary || (() => {});
        const applyOptionsToForm = d.applyOptionsToForm || (async () => {});

        /** Latest openParamsModal generation — overlapping opens must not clobber a newer tab. */
        let openParamsModalGeneration = 0;

        function resolveParamsTab(tabId) {
            const raw = String(tabId || '').trim();
            if (!raw) return 'runtime';
            return PARAMS_TAB_ALIASES[raw] || raw;
        }

        /** Prefer live DOM after settings fragment replaceWith; keep els.* as fallback. */
        function listParamsTabButtons() {
            const doc = getDocument();
            const live = doc?.querySelectorAll?.('.params-tab-btn');
            if (live && live.length) return Array.from(live);
            return Array.isArray(els.paramsTabBtns) ? els.paramsTabBtns : [];
        }

        function listParamsTabPanels() {
            const doc = getDocument();
            const live = doc?.querySelectorAll?.('.params-tab-panel');
            if (live && live.length) return Array.from(live);
            return Array.isArray(els.paramsTabPanels) ? els.paramsTabPanels : [];
        }

        function switchParamsTab(tabId, opts = {}) {
            let next = resolveParamsTab(tabId || getActiveParamsTab());
            if (isProGatedTab(next) && !getAdvancedEntitled()) {
                if (!opts.fromGate) {
                    const label = PRO_GATED_TAB_TITLES[next] || 'Pro 功能';
                    void promptProUnlockRequired({ featureLabel: label });
                }
                next = 'pro';
            }
            void ensureSettingsFeatureScripts(next);
            setActiveParamsTab(next);
            const active = getActiveParamsTab();
            const buttons = listParamsTabButtons();
            const panels = listParamsTabPanels();
            els.paramsTabBtns = buttons;
            els.paramsTabPanels = panels;
            buttons.forEach((btn) => {
                const on = btn.dataset.tab === active;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            panels.forEach((panel) => {
                panel.classList.toggle('active', panel.dataset.tabPanel === active);
            });
            if (active === 'install') {
                // Soft probe only (no GPU spawn). Full GPU/PyTorch status is via「检测引擎」.
                if (readEngineBackendFromForm() !== 'twai') {
                    void ensureEngineModelsCacheApplied().catch(() => {});
                    void refreshEngineStatus({ soft: true }).catch(() => {});
                }
                try {
                    getWindow().dispatchEvent(new CustomEvent('transub:settings-install-shown'));
                } catch (_) { /* ignore */ }
            }
        }

        function syncSettingsNavGroups() {
            getDocument().querySelectorAll('[data-settings-nav-group]').forEach((group) => {
                const buttons = Array.from(group.querySelectorAll('.params-tab-btn'));
                const anyVisible = buttons.some((btn) => !btn.classList.contains('settings-nav-hidden'));
                group.classList.toggle('settings-nav-group-empty', buttons.length > 0 && !anyVisible);
            });
        }

        /** Prebuilt haystacks — avoid panel.textContent (forces layout over the whole settings tree). */
        let settingsSearchIndex = null;

        function invalidateSettingsSearchIndex() {
            settingsSearchIndex = null;
        }

        function buildPanelSearchHay(panel, navBtn) {
            const bits = [
                panel.dataset.settingsSearch || '',
                navBtn?.textContent || '',
                navBtn?.getAttribute('title') || '',
                navBtn?.getAttribute('aria-label') || '',
            ];
            panel.querySelectorAll('[data-settings-search]').forEach((el) => {
                bits.push(el.getAttribute('data-settings-search') || '');
            });
            // Labels / section titles only — not every input value under the panel.
            panel.querySelectorAll('label, legend, h3, h4, .params-section-title, .form-hint, .settings-hint').forEach((el) => {
                const t = (el.textContent || '').trim();
                if (t) bits.push(t);
            });
            return bits.join(' ').toLowerCase();
        }

        function ensureSettingsSearchIndex() {
            if (settingsSearchIndex) return settingsSearchIndex;
            const buttons = listParamsTabButtons();
            const panels = listParamsTabPanels();
            settingsSearchIndex = panels.map((panel) => {
                const tab = panel.dataset.tabPanel;
                const navBtn = buttons.find((b) => b.dataset.tab === tab) || null;
                return {
                    tab,
                    navBtn,
                    panel,
                    hay: buildPanelSearchHay(panel, navBtn),
                };
            });
            return settingsSearchIndex;
        }

        function filterSettingsNav(query) {
            const q = String(query || '').trim().toLowerCase();
            const emptyEl = getDocument().getElementById('settingsSearchEmpty');
            const buttons = listParamsTabButtons();
            const panels = listParamsTabPanels();
            if (!q) {
                buttons.forEach((btn) => btn.classList.remove('settings-nav-hidden'));
                panels.forEach((panel) => {
                    panel.querySelectorAll('[data-settings-hit]').forEach((el) => el.removeAttribute('data-settings-hit'));
                });
                emptyEl?.classList.add('hidden');
                syncSettingsNavGroups();
                return;
            }
            let any = false;
            let firstMatch = null;
            const index = ensureSettingsSearchIndex();
            index.forEach((entry) => {
                const match = entry.hay.includes(q);
                if (entry.navBtn) entry.navBtn.classList.toggle('settings-nav-hidden', !match);
                if (match) {
                    any = true;
                    if (!firstMatch) firstMatch = entry.tab;
                }
            });
            emptyEl?.classList.toggle('hidden', any);
            syncSettingsNavGroups();
            if (firstMatch && getActiveParamsTab() !== firstMatch) {
                const visible = !buttons.find((b) => b.dataset.tab === getActiveParamsTab())
                    ?.classList.contains('settings-nav-hidden');
                if (!visible) switchParamsTab(firstMatch);
            }
        }

        function bindSettingsSearch() {
            const input = getDocument().getElementById('settingsSearchInput');
            if (!input || input.dataset.bound === '1') return;
            input.dataset.bound = '1';
            input.addEventListener('input', () => filterSettingsNav(input.value));
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    input.value = '';
                    filterSettingsNav('');
                    input.blur();
                }
            });
        }

        function closeStandaloneSettingsWindow() {
            try {
                getGlobal().close();
            } catch (_) { /* ignore */ }
        }

        async function openParamsModal(tabId) {
            const generation = ++openParamsModalGeneration;
            const requested = resolveParamsTab(tabId || getActiveParamsTab());
            if (!getIsStandaloneSettings()) {
                setPostTaskMenuOpen(false);
                setAddMenuOpen(false);
            }
            await ensureSettingsShellReady();
            if (generation !== openParamsModalGeneration) return;

            // Activate the target tab immediately so deep-links (burn / output / …) are
            // visible even if later option reload / entitlement IPC is slow or throws.
            // Pro-gated tabs still need entitlement before the panel can stay open.
            if (isProGatedTab(requested) && !getAdvancedEntitled()) {
                try {
                    await refreshAdvancedEntitlement();
                } catch (_) { /* ignore — switchParamsTab will gate to pro */ }
                if (generation !== openParamsModalGeneration) return;
            }
            switchParamsTab(requested);
            const modal = getDocument()?.getElementById?.('paramsModal') || els.paramsModal;
            modal?.classList.remove('hidden');
            if (els.paramsModal !== modal && modal) els.paramsModal = modal;

            try {
                await ensureSettingsFeatureScripts(requested);
            } catch (err) {
                console.warn('[Transub] ensureSettingsFeatureScripts failed:', err?.message || err);
            }
            if (generation !== openParamsModalGeneration) return;

            try { getGlobal().TransubAdvancedSettings?.bind?.(); } catch (_) { /* ignore */ }
            try { void getGlobal().TransubAdvancedSettings?.refresh?.(); } catch (_) { /* ignore */ }
            try { getGlobal().TransubFeatures?.bindSettingsExtras?.(); } catch (_) { /* ignore */ }

            // When clean, reload from disk so a prior save (this or another window) is shown.
            // When dirty, keep unsaved edits — do not clear the dirty flag on focus/re-open IPC.
            if (!getSettingsFormDirty()) {
                try {
                    const reloaded = await reloadSavedOptionsIntoForm();
                    if (generation !== openParamsModalGeneration) return;
                    if (!reloaded) {
                        setSavedOptionsSnapshot(buildSavedOptionsFromForm());
                    }
                    markSettingsDirty(false);
                    setSaveParamsStatus('修改后请点「保存设置」写入磁盘');
                } catch (err) {
                    console.warn('[Transub] reloadSavedOptionsIntoForm failed:', err?.message || err);
                }
            }

            // Soft refresh entitlement in background for non-gated tabs / already-entitled.
            if (!(isProGatedTab(requested) && !getAdvancedEntitled())) {
                void refreshAdvancedEntitlement();
            }
            // Re-assert tab after async work in case form apply / entitlement sync moved it.
            if (generation === openParamsModalGeneration) {
                switchParamsTab(requested);
            }

            void refreshSettingsBurnEncoderSelect(
                els.settingsBurnEncoderSelect?.value
                || getDocument()?.getElementById?.('settingsBurnEncoderSelect')?.value
                || 'libx264',
            );
            try { getGlobal().TransubEditorSettingsPrefs?.loadIntoForm?.(); } catch (_) { /* ignore */ }
            try { getGlobal().TransubEditorSettingsPrefs?.bind?.(); } catch (_) { /* ignore */ }
            void refreshSenseMemoryStatus();
            if (getSettingsFormDirty()) {
                void refreshPostBatchTextPresetSelect();
            }
        }

        /**
         * Desktop: always open the dedicated settings BrowserWindow.
         * Wizard requests use the dedicated setup-wizard window.
         * Standalone settings window / non-desktop: use in-page params modal.
         */
        function openAppSettings(tabId, opts = {}) {
            const tab = tabId || 'runtime';
            // Prefer main-window DOCK for engine model library (settings「模型」tab removed).
            if (opts.openLibrary && !getIsStandaloneSettings() && !getIsStandaloneWizard()) {
                void openEngineModelsLibrary();
                return;
            }
            if (opts.wizard) {
                if (!getIsStandaloneChrome() && isDesktop() && electron?.transubOpenSetupWizard) {
                    void electron.transubOpenSetupWizard({
                        forceWizard: opts.forceWizard !== false,
                    });
                    return;
                }
                if (!getIsStandaloneChrome() && isDesktop() && electron?.transubOpenSettings) {
                    void electron.transubOpenSettings({
                        tab,
                        wizard: true,
                        forceWizard: opts.forceWizard !== false,
                        openLibrary: !!opts.openLibrary,
                    });
                    return;
                }
                openParamsModal(tab);
                void getGlobal().TransubSetupWizard?.open?.({ force: opts.forceWizard !== false });
                return;
            }
            if (!getIsStandaloneSettings() && isDesktop() && electron?.transubOpenSettings) {
                void electron.transubOpenSettings({
                    tab,
                    openLibrary: !!opts.openLibrary,
                });
                return;
            }
            openParamsModal(tab);
            if (opts.openLibrary) {
                void openEngineModelsLibrary();
            }
        }

        function closeParamsModal(restore = false) {
            closeEngineModelsLibrary();
            if (restore && getSavedOptionsSnapshot()) {
                void applyOptionsToForm(getSavedOptionsSnapshot(), { applyUiMode: false });
            }
            markSettingsDirty(false);
            closeAllSettingsTips();
            if (getIsStandaloneSettings()) {
                closeStandaloneSettingsWindow();
                return;
            }
            if (getIsStandaloneWizard()) {
                try { getGlobal().close(); } catch (_) { /* ignore */ }
                return;
            }
            els.paramsModal?.classList.add('hidden');
            setSaveParamsStatus('');
        }

        function closeAllSettingsTips() {
            getDocument().querySelectorAll('.settings-tip.is-open').forEach((tip) => {
                tip.classList.remove('is-open');
            });
            hideFloatingSettingsTip();
        }

        /** @type {HTMLElement | null} */
        let floatingSettingsTipEl = null;

        function getFloatingSettingsTip() {
            if (!floatingSettingsTipEl || !floatingSettingsTipEl.isConnected) {
                floatingSettingsTipEl = getDocument().createElement('div');
                floatingSettingsTipEl.id = 'settingsTipHost';
                floatingSettingsTipEl.className = 'settings-tip-bubble is-fixed';
                floatingSettingsTipEl.setAttribute('role', 'tooltip');
                floatingSettingsTipEl.style.display = 'none';
                getDocument().body.appendChild(floatingSettingsTipEl);
            }
            return floatingSettingsTipEl;
        }

        function hideFloatingSettingsTip() {
            if (!floatingSettingsTipEl) return;
            floatingSettingsTipEl.style.display = 'none';
            floatingSettingsTipEl.classList.remove('tip-up', 'tip-end', 'is-visible');
            floatingSettingsTipEl.innerHTML = '';
        }

        function placeFloatingSettingsTip(tip) {
            const btn = tip?.querySelector?.('.settings-tip-btn');
            const source = tip?.querySelector?.('.settings-tip-bubble');
            if (!btn || !source) return;
            const bubble = getFloatingSettingsTip();
            bubble.innerHTML = source.innerHTML;
            bubble.classList.remove('tip-up', 'tip-end');
            bubble.classList.add('is-visible');
            bubble.style.display = 'block';

            const preferEnd = tip.classList.contains('tip-end');
            const preferUp = tip.classList.contains('tip-up');
            const gap = 6;
            const pad = 8;
            const btnRect = btn.getBoundingClientRect();
            const vw = getWindow().innerWidth || getDocument().documentElement.clientWidth || 0;
            const vh = getWindow().innerHeight || getDocument().documentElement.clientHeight || 0;
            const maxW = Math.min(18 * 16, vw * 0.7, Math.max(0, vw - pad * 2));
            bubble.style.maxWidth = `${Math.max(160, maxW)}px`;
            // Provisional place to measure wrapped size.
            bubble.style.left = `${Math.round(btnRect.left)}px`;
            bubble.style.top = `${Math.round(btnRect.bottom + gap)}px`;
            bubble.style.right = 'auto';
            bubble.style.bottom = 'auto';

            const rect = bubble.getBoundingClientRect();
            let useEnd = preferEnd;
            let useUp = preferUp;
            const spaceBelow = vh - btnRect.bottom - gap - pad;
            const spaceAbove = btnRect.top - gap - pad;
            if (!useUp && rect.height > spaceBelow && spaceAbove > spaceBelow) useUp = true;
            if (useUp && rect.height > spaceAbove && spaceBelow >= spaceAbove) useUp = false;

            let left = useEnd ? (btnRect.right - rect.width) : btnRect.left;
            if (left + rect.width > vw - pad) {
                left = vw - pad - rect.width;
                useEnd = true;
            }
            if (left < pad) {
                left = pad;
                useEnd = false;
            }
            let top = useUp ? (btnRect.top - gap - rect.height) : (btnRect.bottom + gap);
            if (top < pad) top = pad;
            if (top + rect.height > vh - pad) top = Math.max(pad, vh - pad - rect.height);

            bubble.classList.toggle('tip-up', useUp);
            bubble.classList.toggle('tip-end', useEnd);
            bubble.style.left = `${Math.round(left)}px`;
            bubble.style.top = `${Math.round(top)}px`;
        }

        function bindSettingsTips() {
            const openTip = (tip) => {
                if (!tip) return;
                closeAllSettingsTips();
                tip.classList.add('is-open');
                placeFloatingSettingsTip(tip);
            };
            const closeTip = (tip) => {
                tip?.classList.remove('is-open');
                hideFloatingSettingsTip();
            };
            const toggleTip = (tip) => {
                if (!tip) return;
                if (tip.classList.contains('is-open')) closeTip(tip);
                else openTip(tip);
            };

            // Main toolbar tips + settings modal tips
            getDocument().querySelectorAll('.settings-tip-btn').forEach((btn) => {
                if (btn.dataset.tipBound === '1') return;
                btn.dataset.tipBound = '1';
                const tip = btn.closest('.settings-tip');
                if (!tip) return;
                btn.addEventListener('pointerenter', () => openTip(tip));
                btn.addEventListener('pointerleave', () => closeTip(tip));
                btn.addEventListener('focus', () => openTip(tip));
                btn.addEventListener('blur', () => closeTip(tip));
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleTip(tip);
                });
            });

            const repositionOpenTips = () => {
                getDocument().querySelectorAll('.settings-tip.is-open').forEach((tip) => {
                    placeFloatingSettingsTip(tip);
                });
            };
            const win = getWindow();
            if (win && win.__transubSettingsTipResizeBound !== true) {
                win.__transubSettingsTipResizeBound = true;
                win.addEventListener('resize', repositionOpenTips);
            }
            const settingsContent = getDocument().getElementById('settingsContent');
            if (settingsContent && settingsContent.dataset.tipScrollBound !== '1') {
                settingsContent.dataset.tipScrollBound = '1';
                settingsContent.addEventListener('scroll', repositionOpenTips, { passive: true });
            }

            const modal = getDocument().getElementById('paramsModal');
            if (modal && modal.dataset.envMoreBound !== '1') {
                modal.dataset.envMoreBound = '1';
                modal.addEventListener('click', (event) => {
                    const item = event.target?.closest?.('.settings-env-more-menu button');
                    const details = item?.closest?.('details.settings-env-more');
                    if (details) details.open = false;
                });
            }
            bindSettingsEnvOverview(getDocument());
        }

        return {
            PARAMS_TAB_ALIASES,
            resolveParamsTab,
            switchParamsTab,
            syncSettingsNavGroups,
            invalidateSettingsSearchIndex,
            filterSettingsNav,
            bindSettingsSearch,
            openParamsModal,
            openAppSettings,
            closeParamsModal,
            closeAllSettingsTips,
            bindSettingsTips,
            closeStandaloneSettingsWindow,
            setEnvOverviewChip,
            setEnvGpuActionsEnabled,
            scrollToEnvSection,
            bindSettingsEnvOverview,
        };
    }

    return {
        PARAMS_TAB_ALIASES,
        createSettingsModalUi,
        setEnvOverviewChip,
        setEnvGpuActionsEnabled,
        scrollToEnvSection,
        bindSettingsEnvOverview,
    };
}));
