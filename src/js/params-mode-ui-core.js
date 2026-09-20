/**
 * Params-mode / auto-sense / recognition preset chip UI.
 * Shell injects DOM/state via createParamsModeUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubParamsModeUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function paramsModeUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createParamsModeUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const startReadinessApi = d.startReadinessApi || {};
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const isModelsCatalogLoading = d.isModelsCatalogLoading || (() => false);
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const getMtUseForm = d.getMtUseForm || (() => false);
        const formatEngineModelOptionLabel = d.formatEngineModelOptionLabel
            || ((m) => String(m?.id || m?.name || ''));
        const ensureSelectValue = d.ensureSelectValue || (() => {});
        const mirrorSelectValue = d.mirrorSelectValue || (() => {});
        const persistFormOptionsQuiet = d.persistFormOptionsQuiet || (async () => {});
        const setMtUseForm = d.setMtUseForm || (() => {});
        const syncTranslateChipUi = d.syncTranslateChipUi || (() => {});
        const syncModelsMenuDetailUi = d.syncModelsMenuDetailUi || (() => {});
        const syncModelsChipLabel = d.syncModelsChipLabel || (() => {});
        const updateRecipeCapsule = d.updateRecipeCapsule || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const renderList = d.renderList || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const setModelsMenuOpen = d.setModelsMenuOpen || (() => {});
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const getFeatures = d.getFeatures || (() => (global && global.TransubFeatures) || null);
        const getContentProfileApi = d.getContentProfileApi
            || (() => (global && global.TransubContentProfile) || null);
        const getScenePresetsUi = d.getScenePresetsUi
            || (() => (global && global.TransubScenePresetsUi) || null);

        /** Restore recognition preset after preset <select> options are filled. */
        let pendingActivePresetId = '';
        let paramsModeAsrManualBrowse = false;
        let paramsModePresetTabGroup = '';
        let paramsModePresetCache = [];

function isAutoSenseEnabled() {
    return false;
}

function shortParamsModeLabel(text, maxLen = 10) {
    if (startReadinessApi.shortParamsModeLabel) {
        return startReadinessApi.shortParamsModeLabel(text, maxLen);
    }
    const raw = String(text || '').trim();
    return raw || '自定义';
}

function getActiveParamsPresetId() {
    return String(els.presetSelect?.value || pendingActivePresetId || '').trim();
}

function getActiveParamsPresetName() {
    const id = getActiveParamsPresetId();
    if (!id) return '';
    if (els.presetSelect) {
        const opt = [...els.presetSelect.options].find((o) => o.value === id);
        if (opt) {
            return String(opt.textContent || '').replace(/（内置）\s*$/, '').trim();
        }
    }
    const cached = paramsModePresetCache.find((p) => String(p?.id || '') === id);
    return String(cached?.name || '').trim();
}

/**
 * Apply recognition preset id to the settings select (may defer until options load).
 * @returns {boolean} true if applied to the select now
 */
function applyActivePresetIdToSelect(presetId) {
    const want = String(presetId || '').trim();
    if (!els.presetSelect) {
        pendingActivePresetId = want;
        return false;
    }
    if (!want) {
        els.presetSelect.value = '';
        pendingActivePresetId = '';
        return true;
    }
    const has = [...els.presetSelect.options].some((o) => o.value === want);
    if (has) {
        els.presetSelect.value = want;
        pendingActivePresetId = '';
        return true;
    }
    pendingActivePresetId = want;
    return false;
}

function flushPendingActivePresetId() {
    if (!pendingActivePresetId) {
        syncParamsModeChipUi();
        return false;
    }
    const applied = applyActivePresetIdToSelect(pendingActivePresetId);
    syncParamsModeChipUi();
    return applied;
}

function setParamsModeMenuOpen(open) {
    setModelsMenuOpen(open, { slot: 'asr' });
}

function listInstalledAsrModels() {
        const raw = getCachedEngineModels();
        const models = Array.isArray(raw) ? raw : [];
        return models.filter((m) => {
            if (!m?.installed || m?.incomplete) return false;
            if (String(m.kind || '').toLowerCase() !== 'asr') return false;
            return !!String(m.id || '').trim();
        });
    }

function resolveParamsModeAsrLabel() {
    const id = String(els.engineAsrModelSelect?.value || els.quickAsrModelSelect?.value || '').trim();
    if (!id) return '';
    const fromSelect = [...(els.engineAsrModelSelect?.options || [])]
        .find((o) => o.value === id);
    const selectLabel = String(fromSelect?.textContent || '').trim();
    if (selectLabel) return selectLabel;
    const model = listInstalledAsrModels().find((m) => String(m.id || '') === id);
    return formatEngineModelOptionLabel(model) || id;
}

function rebuildParamsModeAsrSection() {
    const host = els.paramsModeAsrModelList || document.getElementById('paramsModeAsrModelList');
    const listWrap = els.paramsModeAsrModelListWrap || document.getElementById('paramsModeAsrModelListWrap');
    const autoBtn = els.paramsModeAsrAutoBtn || document.getElementById('paramsModeAsrAutoBtn');
    const manualBtn = els.paramsModeAsrManualBtn || document.getElementById('paramsModeAsrManualBtn');
    const hint = els.paramsModeAsrHint || document.getElementById('paramsModeAsrHint');
    const presetTabs = els.paramsModePresetTabs || document.getElementById('paramsModePresetTabs');
    const presetList = els.paramsModePresetList || document.getElementById('paramsModePresetList');
    const asrSection = els.paramsModeAsrSection || document.getElementById('paramsModeAsrSection');
    // Segment is the source of truth: 预设场景 always shows presets (even before one is chosen).
    const showManual = !!paramsModeAsrManualBrowse;
    const activeId = String(els.engineAsrModelSelect?.value || '').trim();
    const hasPreset = !!getActiveParamsPresetId();

    if (autoBtn) {
        autoBtn.classList.toggle('is-active', !showManual);
        autoBtn.setAttribute('aria-pressed', (!showManual) ? 'true' : 'false');
    }
    if (manualBtn) {
        manualBtn.classList.toggle('is-active', !!showManual);
        manualBtn.setAttribute('aria-pressed', showManual ? 'true' : 'false');
    }
    if (hint) {
        hint.textContent = '';
        hint.hidden = true;
        hint.classList?.add?.('hidden');
    }
    // Flat popover: 预设场景 shows presets; 自定义 shows ASR list (same pane, one layer).
    if (presetList) {
        presetList.classList?.toggle?.('hidden', !!showManual);
        presetList.hidden = !!showManual;
    }
    if (presetTabs) {
        if (showManual) {
            presetTabs.classList?.add?.('hidden');
            presetTabs.hidden = true;
        } else {
            // Visibility of multi-group tabs is owned by rebuildParamsModePresetItems.
            presetTabs.hidden = false;
            if (paramsModePresetCache.length > 1) {
                // Ensure tabs can repaint when returning from manual.
                presetTabs.classList?.remove?.('hidden');
            }
        }
    }
    if (asrSection) {
        asrSection.classList?.toggle?.('hidden', !showManual);
        asrSection.hidden = !showManual;
    }
    if (listWrap) {
        listWrap.classList.toggle('hidden', !showManual);
    }
    if (!host) return;
    host.innerHTML = '';
    if (!showManual) return;
    const list = listInstalledAsrModels();
    if (!list.length) {
        const row = document.createElement('p');
        row.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
        row.setAttribute('aria-live', 'polite');
        row.textContent = isModelsCatalogLoading()
            ? '正在加载模型数据…'
            : '暂无已下载识别模型 · 请到主界面 → 模型管理下载';
        host.appendChild(row);
        return;
    }
    for (const model of list) {
        const id = String(model.id || '').trim();
        if (!id) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'post-task-menu-item';
        btn.dataset.asrModel = id;
        btn.setAttribute('role', 'menuitem');
        if (!hasPreset && id === activeId) btn.classList.add('active');
        btn.innerHTML = '<i class="fa fa-check post-task-check" aria-hidden="true"></i><span></span>';
        btn.querySelector('span').textContent = formatEngineModelOptionLabel(model) || id;
        host.appendChild(btn);
    }
}

async function setParamsModeAsrPickMode(pick) {
    const next = String(pick || '').trim() === 'manual' ? 'manual' : 'auto';
    if (next === 'auto') {
        paramsModeAsrManualBrowse = false;
        rebuildParamsModeAsrSection();
        // Repaint presets when returning to 预设场景 (list may have been empty/hidden).
        if (paramsModePresetCache.length) {
            rebuildParamsModePresetItems(paramsModePresetCache, { preferActiveGroup: true });
        }
        syncParamsModeChipUi();
        return;
    }
    paramsModeAsrManualBrowse = true;
    applyActivePresetIdToSelect('');
    await persistFormOptionsQuiet();
    rebuildParamsModeAsrSection();
    syncParamsModeChipUi();
}

async function selectParamsModeAsrManual(modelId, { persist = true } = {}) {
    const id = String(modelId || '').trim();
    if (!id || !els.engineAsrModelSelect) return;
    paramsModeAsrManualBrowse = true;
    applyActivePresetIdToSelect('');
    ensureSelectValue(els.engineAsrModelSelect, id, { label: id });
    els.engineAsrModelSelect.dispatchEvent(new Event('change'));
    mirrorSelectValue(els.engineAsrModelSelect, els.quickAsrModelSelect);
    if (persist) await persistFormOptionsQuiet();
    syncParamsModeChipUi();
    rebuildParamsModeAsrSection();
    syncTranslateChipUi();
    const label = resolveParamsModeAsrLabel() || id;
    showToast(uiTf('已手动选用 ASR：{label}', { label }), 'ok');
}

/**
 * User changed ASR outside the recognition menu (settings / 快捷): leave preset chip.
 */
function adoptManualAsrFromUserChange({ persist = true } = {}) {
    const hadPreset = !!getActiveParamsPresetId();
    paramsModeAsrManualBrowse = true;
    if (hadPreset) applyActivePresetIdToSelect('');
    syncParamsModeChipUi();
    rebuildParamsModeAsrSection();
    if (persist) void persistFormOptionsQuiet();
}

const PARAMS_MODE_PRESET_GROUP_ORDER = Object.freeze(
        (global.TransubScenePresetsCore && global.TransubScenePresetsCore.GROUP_ORDER)
            ? global.TransubScenePresetsCore.GROUP_ORDER
            : ['ja', 'ko', 'western', 'zh', 'talk', 'other'],
    );
    const PARAMS_MODE_PRESET_TAB_LABELS = Object.freeze(
        (global.TransubScenePresetsCore && global.TransubScenePresetsCore.GROUP_LABELS)
            ? global.TransubScenePresetsCore.GROUP_LABELS
            : {
                ja: '日剧/动漫',
                ko: '韩剧',
                western: '欧美剧',
                zh: '华语片',
                talk: '对白',
                other: '其他',
            },
    );

    function paramsModePresetGroupOf(preset) {
        const coreApi = global.TransubScenePresetsCore;
        if (typeof coreApi?.groupOf === 'function') return coreApi.groupOf(preset);
        return String(preset?.group || (preset?.builtin ? 'other' : 'talk')).trim()
            || (preset?.builtin ? 'other' : 'talk');
    }

    function bucketParamsModePresets(presets = []) {
        const list = Array.isArray(presets) ? presets.filter((p) => p?.id) : [];
        const buckets = new Map();
        for (const p of list) {
            const group = paramsModePresetGroupOf(p);
            if (!buckets.has(group)) buckets.set(group, []);
            buckets.get(group).push(p);
        }
        const orderedGroups = [
            ...PARAMS_MODE_PRESET_GROUP_ORDER.filter((g) => buckets.has(g)),
            ...[...buckets.keys()].filter((g) => !PARAMS_MODE_PRESET_GROUP_ORDER.includes(g)),
        ];
        return { buckets, orderedGroups, list };
    }

    function resolveParamsModePresetTab(orderedGroups, activeId, buckets, { preferActiveGroup = false } = {}) {
        if (preferActiveGroup && activeId) {
            for (const group of orderedGroups) {
                if ((buckets.get(group) || []).some((p) => p.id === activeId)) return group;
            }
        }
        if (paramsModePresetTabGroup && orderedGroups.includes(paramsModePresetTabGroup)) {
            return paramsModePresetTabGroup;
        }
        if (activeId) {
            for (const group of orderedGroups) {
                if ((buckets.get(group) || []).some((p) => p.id === activeId)) return group;
            }
        }
        return orderedGroups[0] || '';
    }

    function rebuildParamsModePresetItems(presets, { preferActiveGroup = false } = {}) {
        const host = els.paramsModePresetList || document.getElementById('paramsModePresetList');
        const tabsHost = els.paramsModePresetTabs || document.getElementById('paramsModePresetTabs');
        if (!host) return;
        if (Array.isArray(presets)) paramsModePresetCache = presets.slice();
    const { buckets, orderedGroups, list } = bucketParamsModePresets(paramsModePresetCache);
    const activeId = getActiveParamsPresetId();
    const activeGroup = resolveParamsModePresetTab(orderedGroups, activeId, buckets, { preferActiveGroup });
    paramsModePresetTabGroup = activeGroup;

    if (tabsHost) {
        tabsHost.innerHTML = '';
        tabsHost.classList.toggle('hidden', orderedGroups.length <= 1);
        for (const group of orderedGroups) {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'params-mode-preset-tab' + (group === activeGroup ? ' is-active' : '');
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', group === activeGroup ? 'true' : 'false');
            tab.dataset.presetGroup = group;
            tab.textContent = uiTf(PARAMS_MODE_PRESET_TAB_LABELS[group] || group);
            tab.title = uiTf(PARAMS_MODE_PRESET_TAB_LABELS[group] || group);
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (paramsModePresetTabGroup === group) return;
                paramsModePresetTabGroup = group;
                rebuildParamsModePresetItems(paramsModePresetCache);
            });
            tabsHost.appendChild(tab);
        }
    }

    host.innerHTML = '';
    const rows = activeGroup ? (buckets.get(activeGroup) || []) : list;
    const renderItem = (p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'post-task-menu-item params-mode-preset-item';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.presetId = p.id;
        if (p.id === activeId) btn.classList.add('active');
        const title = String(p.name || p.id).trim();
        const desc = String(p.description || p.sceneBlurb || '').trim();
        if (desc) btn.title = desc;
        const check = document.createElement('i');
        check.className = 'fa fa-check post-task-check';
        check.setAttribute('aria-hidden', 'true');
        const body = document.createElement('span');
        body.className = 'params-mode-preset-body';
        const titleEl = document.createElement('span');
        titleEl.className = 'params-mode-preset-title';
        titleEl.textContent = title;
        body.appendChild(titleEl);
        if (desc) {
            const descEl = document.createElement('span');
            descEl.className = 'params-mode-preset-desc';
            descEl.textContent = desc;
            body.appendChild(descEl);
        }
        btn.appendChild(check);
        btn.appendChild(body);
        host.appendChild(btn);
    };
    if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'post-task-menu-hint px-1 py-1 border-0 mb-0';
        empty.textContent = '该分类暂无预设';
        host.appendChild(empty);
    } else {
        rows.forEach((p) => renderItem(p));
    }
    syncParamsModeChipUi();
    rebuildParamsSceneCards(list);
}

function rebuildParamsSceneCards(presets = []) {
    const ui = getScenePresetsUi();
    if (ui?.onPresetsLoaded) {
        ui.onPresetsLoaded(Array.isArray(presets) ? presets : []);
        return;
    }
    if (ui?.setPresets) {
        ui.setPresets(Array.isArray(presets) ? presets : []);
    }
}

function syncParamsModeChipUi() {
    const autoEnabled = false;
    const presetId = getActiveParamsPresetId();
    const presetName = getActiveParamsPresetName();
    const activeItem = [...(els.modelsMenu?.querySelectorAll?.('[data-preset-id]') || els.paramsModeMenu?.querySelectorAll?.('[data-preset-id]') || [])]
        .find((el) => el.dataset.presetId === presetId);
    const vm = startReadinessApi.buildParamsModeChipViewModel
        ? startReadinessApi.buildParamsModeChipViewModel({
            autoEnabled,
            presetId,
            presetName,
            mtUseForm: !!getMtUseForm(),
            translateTask: readTaskFromForm() === 'translate' || readTaskFromForm() === 'dual',
            presetDesc: String(activeItem?.title || '').trim(),
            asrModelId: String(els.engineAsrModelSelect?.value || '').trim(),
            asrModelLabel: resolveParamsModeAsrLabel(),
        })
        : { label: '设置', title: '', tone: 'off', autoEnabled, presetId };

    if (els.paramsModeLabel) els.paramsModeLabel.textContent = vm.label;
    if (els.paramsModeBtn) {
        els.paramsModeBtn.title = vm.title;
        els.paramsModeBtn.setAttribute('aria-pressed', 'false');
    }
    const chipHost = els.asrChipBtn || els.modelsChipBtn || els.paramsModeChip;
    if (chipHost) {
        const keep = ['param-chip', 'param-chip-btn', 'content-profile-chip'];
        chipHost.className = `${keep.join(' ')} tone-${vm.tone}`;
        chipHost.setAttribute('aria-pressed', 'false');
    }
    if (els.paramsModeChip && els.paramsModeChip !== chipHost) {
        els.paramsModeChip.className = `sr-only tone-${vm.tone}`;
    }
    syncModelsChipLabel();
    updateRecipeCapsule();

    const customHint = els.paramsModeCustomHint || document.getElementById('paramsModeCustomHint');
    if (customHint) {
        customHint.textContent = '';
        customHint.hidden = true;
        customHint.classList.toggle('hidden', true);
    }

    const modeRoot = els.modelsMenu || els.paramsModeMenu;
    modeRoot?.querySelectorAll('[data-preset-id]').forEach((item) => {
        const active = item.dataset.presetId === presetId;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    rebuildParamsModeAsrSection();
    syncModelsMenuDetailUi();
}

function selectParamsModePresetsBrowse({ persist = true } = {}) {
    paramsModeAsrManualBrowse = false;
    if (persist) void persistFormOptionsQuiet();
    if (paramsModePresetCache.length) {
        rebuildParamsModePresetItems(paramsModePresetCache, { preferActiveGroup: true });
    }
    rebuildParamsModeAsrSection();
    syncTranslateChipUi();
    syncParamsModeChipUi();
    syncModelsMenuDetailUi();
}

function selectParamsModeCustom({ persist = true } = {}) {
    paramsModeAsrManualBrowse = true;
    applyActivePresetIdToSelect('');
    if (persist) void persistFormOptionsQuiet();
    showToast('已改用手动 ASR', 'warn');
    syncTranslateChipUi();
    syncParamsModeChipUi();
    syncModelsMenuDetailUi();
}

async function selectParamsModePreset(presetId, { persist = true } = {}) {
    const id = String(presetId || '').trim();
    if (!id) return;
    paramsModeAsrManualBrowse = false;
    const features = getFeatures();
    const name = (() => {
        const item = [...(els.paramsModeMenu?.querySelectorAll?.('[data-preset-id]') || [])]
            .find((el) => el.dataset.presetId === id);
        return String(item?.querySelector?.('.params-mode-preset-title')?.textContent
            || item?.textContent
            || id).trim();
    })();
    if (typeof features?.applyPreset === 'function') {
        const applied = await features.applyPreset(id, { persist });
        if (applied === false) return;
        syncParamsModeChipUi();
        syncTranslateChipUi();
        showToast(uiTf('已按「{name}」识别', { name }), 'ok');
        return;
    }
    applyActivePresetIdToSelect(id);
    if (persist) void persistFormOptionsQuiet();
    syncParamsModeChipUi();
    showToast(uiTf('已按「{name}」识别', { name }), 'ok');
}

        return {
            isAutoSenseEnabled,
            isAutoDeepSenseEnabled: () => false,
            senseOptsForNewMedia: () => ({}),
            shortParamsModeLabel,
            getActiveParamsPresetId,
            getActiveParamsPresetName,
            applyActivePresetIdToSelect,
            flushPendingActivePresetId,
            setParamsModeMenuOpen,
            listInstalledAsrModels,
            resolveParamsModeAsrLabel,
            rebuildParamsModeAsrSection,
            setParamsModeAsrPickMode,
            selectParamsModeAsrManual,
            adoptManualAsrFromUserChange,
            getParamsModePresetCache: () => paramsModePresetCache.slice(),
            getPendingActivePresetId: () => pendingActivePresetId,
            paramsModePresetGroupOf,
            bucketParamsModePresets,
            resolveParamsModePresetTab,
            rebuildParamsModePresetItems,
            rebuildParamsSceneCards,
            syncParamsModeChipUi,
            selectParamsModeSense: () => {},
            selectParamsModePresetsBrowse,
            selectParamsModeCustom,
            selectParamsModePreset,
            setAutoSenseEnabled: () => {},
            updateAutoSenseUi: () => { syncParamsModeChipUi(); },
            isParamsModeAsrManualBrowse: () => !!paramsModeAsrManualBrowse,
            getParamsModeAsrManualBrowse: () => !!paramsModeAsrManualBrowse,
        };
    }

    return { createParamsModeUi };
}));
