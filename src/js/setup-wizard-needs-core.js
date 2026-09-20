/**
 * Setup wizard needs step: builtin preset multi-select (+ target langs for MT).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardNeeds = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardNeedsFactory(global) {
    const TARGET_LANGS = Object.freeze([
        { id: 'zh-Hans', label: '简体中文' },
        { id: 'zh-Hant', label: '繁体中文' },
        { id: 'en', label: '英语' },
        { id: 'ja', label: '日语' },
        { id: 'ko', label: '韩语' },
    ]);
    const TARGET_LANG_IDS = Object.freeze(TARGET_LANGS.map((x) => x.id));
    const sceneCore = (global && global.TransubScenePresetsCore) || (
        typeof require === 'function'
            ? (() => { try { return require('./scene-presets-core'); } catch { return null; } })()
            : null
    );
    const PRESET_GROUP_ORDER = Object.freeze(
        sceneCore?.GROUP_ORDER || ['ja', 'ko', 'western', 'zh', 'talk', 'other'],
    );
    const PRESET_GROUP_LABELS = Object.freeze(
        sceneCore?.GROUP_LABELS || {
            ja: '日剧/动漫',
            ko: '韩剧',
            western: '欧美剧',
            zh: '华语片',
            talk: '对白',
            other: '其他',
        },
    );

    function normalizePresetGroupKey(raw, builtin) {
        if (typeof sceneCore?.normalizeGroupKey === 'function') {
            return sceneCore.normalizeGroupKey(raw, { builtin: !!builtin });
        }
        return String(raw || '').trim() || (builtin ? 'other' : 'talk');
    }

    function presetGroupLabel(key) {
        if (typeof sceneCore?.groupLabel === 'function') return sceneCore.groupLabel(key);
        return PRESET_GROUP_LABELS[key] || key;
    }

    function normalizeTargetLangs(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const item of list) {
            const id = String(item || '').trim();
            if (!TARGET_LANG_IDS.includes(id) || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }

    function normalizePresetIds(raw, allowedIds) {
        const allow = allowedIds instanceof Set
            ? allowedIds
            : new Set(Array.isArray(allowedIds) ? allowedIds : []);
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const item of list) {
            const id = String(item || '').trim();
            if (!id || seen.has(id)) continue;
            if (allow.size && !allow.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }

    function listBuiltinPresets(presets) {
        const list = Array.isArray(presets) ? presets : [];
        return list.filter((p) => p && p.builtin !== false && p.id);
    }

    function groupPresets(presets) {
        const builtins = listBuiltinPresets(presets);
        const byGroup = new Map();
        for (const p of builtins) {
            const g = normalizePresetGroupKey(p.group, true);
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g).push(p);
        }
        const ordered = [];
        for (const g of PRESET_GROUP_ORDER) {
            if (byGroup.has(g)) {
                ordered.push({ group: g, label: presetGroupLabel(g), presets: byGroup.get(g) });
                byGroup.delete(g);
            }
        }
        for (const [g, presetsInGroup] of byGroup) {
            ordered.push({ group: g, label: presetGroupLabel(g), presets: presetsInGroup });
        }
        return ordered;
    }

    function resolveNeedsFromPresets(presetIds, targetLangs, presetById) {
        const map = presetById instanceof Map
            ? presetById
            : new Map(Object.entries(presetById || {}));
        const ids = normalizePresetIds(presetIds, new Set(map.keys()));
        const targets = normalizeTargetLangs(targetLangs);
        const selected = ids.map((id) => map.get(id)).filter(Boolean);

        let language = 'auto';
        const langs = new Set();
        let contentProfile = 'unknown';
        for (const p of selected) {
            const lang = String(p.options?.language || '').trim().toLowerCase();
            if (lang) langs.add(lang);
            const profile = String(p.options?.contentProfile || '').trim();
            if (profile === 'av_soft' || profile === 'talk' || profile === 'film') {
                if (profile === 'av_soft' || contentProfile === 'unknown') contentProfile = profile;
                else if (profile === 'talk' && contentProfile === 'film') contentProfile = 'talk';
            }
        }
        if (langs.size === 1) language = [...langs][0];
        else if (langs.size > 1) language = 'auto';

        let subtitleTargetLang = 'zh-Hans';
        if (targets.length) {
            const zhFirst = targets.find((t) => t === 'zh-Hans' || t === 'zh-Hant');
            subtitleTargetLang = zhFirst || targets[0];
        }
        const variant = subtitleTargetLang === 'zh-Hant' ? 'traditional' : 'simplified';
        const primaryPresetId = ids[0] || '';

        return {
            presetIds: ids,
            contentTypes: ids.slice(), // back-compat alias for older apply paths
            targetLangs: targets.length ? targets : ['zh-Hans'],
            language,
            contentProfile,
            subtitleTargetLang,
            variant,
            task: 'translate',
            primaryPresetId,
            selectedPresets: selected,
        };
    }

    /**
     * Union of downloadable model ids required by selected presets.
     * @param {object[]} presets
     * @param {object} [opts]
     */
    function collectModelsFromPresets(presets, opts = {}) {
        const missingApi = opts.missingApi
            || global.TransubEngineMissingModels
            || null;
        const items = [];
        const seen = new Set();
        const push = (id, meta) => {
            const mid = String(id || '').trim();
            if (!mid || seen.has(mid)) return;
            if (missingApi?.isBundledAlwaysReadyModelId?.(mid)) return;
            seen.add(mid);
            items.push({
                id: mid,
                kind: meta.kind || 'asr',
                required: meta.required !== false,
                label: meta.label || mid,
                purpose: meta.purpose || '',
                fromPresets: meta.fromPresets || [],
            });
        };

        for (const p of presets || []) {
            const optsObj = p?.options || {};
            const asr = String(optsObj.engineAsrModel || '').trim();
            if (asr) {
                push(asr, {
                    kind: 'asr',
                    required: true,
                    purpose: '听写模型（预设必需）',
                    label: asr,
                    fromPresets: [p.name || p.id],
                });
            }
            const collected = missingApi?.collectRequiredModelIdsFromOptions?.(optsObj) || [];
            for (const id of collected) {
                if (id === asr) continue;
                push(id, {
                    kind: /vad/i.test(id) ? 'vad' : 'asr',
                    required: true,
                    purpose: '预设依赖',
                    label: id,
                    fromPresets: [p.name || p.id],
                });
            }
            if (optsObj.filmAudioEnhance) {
                push('demucs', {
                    kind: 'pip',
                    required: true,
                    purpose: '影视人声分离（Demucs）',
                    label: 'Demucs',
                    fromPresets: [p.name || p.id],
                });
            }
        }

        // Merge fromPresets when same id appears again
        const byId = new Map();
        for (const it of items) {
            const prev = byId.get(it.id);
            if (!prev) {
                byId.set(it.id, { ...it, fromPresets: (it.fromPresets || []).slice() });
            } else {
                for (const n of it.fromPresets || []) {
                    if (!prev.fromPresets.includes(n)) prev.fromPresets.push(n);
                }
            }
        }
        return [...byId.values()];
    }

    /**
     * @param {object} deps
     */
    function createSetupWizardNeeds(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const getElectron = () => d.electron || global.__ELECTRON__ || null;
        const getState = d.getState || (() => ({}));
        const uiTx = d.uiTx || ((t) => t);
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));

        let presetCatalog = [];
        let presetById = new Map();
        let lastLoadError = '';
        let activePresetGroup = '';

        function setCatalog(presets) {
            presetCatalog = listBuiltinPresets(presets);
            presetById = new Map(presetCatalog.map((p) => [String(p.id), p]));
            const state = getState();
            state.presetCatalog = presetCatalog;
            const groups = groupPresets(presetCatalog);
            if (activePresetGroup && !groups.some((g) => g.group === activePresetGroup)) {
                activePresetGroup = '';
            }
            return presetCatalog;
        }

        function resolveActivePresetGroup(groups, selectedIds) {
            const ordered = Array.isArray(groups) ? groups : [];
            if (!ordered.length) return '';
            if (activePresetGroup && ordered.some((g) => g.group === activePresetGroup)) {
                return activePresetGroup;
            }
            const selected = new Set(selectedIds || []);
            if (selected.size) {
                for (const g of ordered) {
                    if ((g.presets || []).some((p) => selected.has(String(p.id)))) {
                        return g.group;
                    }
                }
            }
            return ordered[0].group;
        }

        function selectedCountByGroup(groups, selectedIds) {
            const selected = new Set(selectedIds || []);
            const counts = new Map();
            for (const g of groups || []) {
                let n = 0;
                for (const p of g.presets || []) {
                    if (selected.has(String(p.id))) n += 1;
                }
                counts.set(g.group, n);
            }
            return counts;
        }

        async function loadPresetCatalog() {
            lastLoadError = '';
            const api = getElectron();
            try {
                const res = await api?.transWithAiGetPresets?.();
                if (res && res.ok === false) {
                    lastLoadError = String(res.error || 'presets ipc failed');
                } else {
                    const list = Array.isArray(res?.presets) ? res.presets
                        : (Array.isArray(res) ? res : []);
                    if (list.length) return setCatalog(list);
                }
            } catch (err) {
                lastLoadError = String(err?.message || err || 'presets ipc error');
            }
            try {
                const features = global.TransubFeatures;
                if (features?.loadPresets && !features.getPresets?.()?.length) {
                    await features.loadPresets();
                }
                const fromFeatures = features?.getPresets?.()
                    || features?.presets
                    || [];
                if (Array.isArray(fromFeatures) && fromFeatures.length) {
                    return setCatalog(fromFeatures);
                }
            } catch { /* ignore */ }
            return setCatalog([]);
        }

        function readChecked(name) {
            if (typeof document === 'undefined') return [];
            return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
                .map((el) => String(el.value || '').trim())
                .filter(Boolean);
        }

        function readNeeds() {
            const state = getState();
            const presetIds = normalizePresetIds(
                readChecked('wizardPresetId'),
                new Set(presetById.keys()),
            );
            const targetLangs = normalizeTargetLangs(readChecked('wizardTargetLang'));
            const mapped = resolveNeedsFromPresets(
                presetIds.length ? presetIds : (state.needs?.presetIds || []),
                targetLangs.length ? targetLangs : (state.needs?.targetLangs || ['zh-Hans']),
                presetById,
            );
            return mapped;
        }

        function syncNeedsToState() {
            const state = getState();
            const needs = readNeeds();
            state.needs = needs;
            return needs;
        }

        function renderTargetLangs(selectedIds) {
            const host = $('wizardTargetLangList');
            if (!host) return;
            const selected = new Set(selectedIds || ['zh-Hans']);
            host.innerHTML = TARGET_LANGS.map((item) => {
                const checked = selected.has(item.id) ? 'checked' : '';
                return `<label class="wizard-choice !items-center">
                    <input type="checkbox" name="wizardTargetLang" value="${esc(item.id)}" class="shrink-0" ${checked}>
                    <span class="font-medium text-gray-800 text-sm">${esc(item.label)}</span>
                </label>`;
            }).join('');
        }

        function renderPresetCards(presets, selected) {
            return (presets || []).map((p) => {
                const id = String(p.id);
                const checked = selected.has(id) ? 'checked' : '';
                const hint = String(p.description || p.sceneBlurb || '').trim();
                const asr = String(p.options?.engineAsrModel || '').trim();
                return `<label class="wizard-choice !flex-col !items-start !gap-0.5 py-2">
                    <span class="flex items-start gap-2 w-full">
                        <input type="checkbox" name="wizardPresetId" value="${esc(id)}" class="mt-0.5 shrink-0" ${checked}>
                        <span class="min-w-0">
                            <span class="font-medium text-gray-800 text-sm">${esc(p.name || id)}</span>
                            ${asr ? `<span class="block text-[10px] text-gray-400 mt-0.5">${esc(asr)}</span>` : ''}
                            ${hint ? `<span class="block text-[10px] text-gray-500 mt-0.5 leading-snug">${esc(hint)}</span>` : ''}
                        </span>
                    </span>
                </label>`;
            }).join('');
        }

        function renderPresetTabs(groups, selectedIds) {
            const tabsHost = $('wizardPresetTabs');
            if (!tabsHost) return;
            if (!groups.length) {
                tabsHost.innerHTML = '';
                tabsHost.classList.add('hidden');
                return;
            }
            const counts = selectedCountByGroup(groups, selectedIds);
            tabsHost.classList.toggle('hidden', groups.length <= 1);
            tabsHost.innerHTML = groups.map((g) => {
                const active = g.group === activePresetGroup;
                const count = counts.get(g.group) || 0;
                const label = g.label || presetGroupLabel(g.group);
                const badge = count > 0
                    ? `<span class="ml-1 inline-flex min-w-[1.1rem] justify-center rounded-full bg-violet-100 text-violet-700 text-[10px] px-1">${count}</span>`
                    : '';
                return `<button type="button"
                    class="params-mode-preset-tab${active ? ' is-active' : ''}"
                    role="tab"
                    aria-selected="${active ? 'true' : 'false'}"
                    data-wizard-preset-group="${esc(g.group)}"
                    title="${esc(label)}">${esc(label)}${badge}</button>`;
            }).join('');
        }

        function renderPresetList(selectedIds) {
            const host = $('wizardPresetList');
            if (!host) return;
            const selected = new Set(selectedIds || []);
            const groups = groupPresets(presetCatalog);
            if (!groups.length) {
                renderPresetTabs([], selectedIds);
                host.innerHTML = `<p class="text-xs text-gray-500">${esc(uiTx('未加载到内置预设，请稍后重试或打开完整设置。'))}</p>`;
                if (lastLoadError && typeof console !== 'undefined') {
                    console.warn('[setup-wizard] preset catalog empty:', lastLoadError);
                }
                return;
            }
            activePresetGroup = resolveActivePresetGroup(groups, selectedIds);
            renderPresetTabs(groups, selectedIds);
            // Keep all group panels in DOM (hidden) so multi-select across tabs survives.
            host.innerHTML = groups.map((g) => {
                const hidden = g.group === activePresetGroup ? '' : ' hidden';
                const cards = renderPresetCards(g.presets, selected);
                return `<div class="wizard-preset-group-panel${hidden}" data-wizard-preset-group="${esc(g.group)}" role="group" aria-label="${esc(g.label || presetGroupLabel(g.group))}">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${cards || `<p class="text-xs text-gray-500 col-span-full">${esc(uiTx('该分类暂无预设'))}</p>`}</div>
                </div>`;
            }).join('');
        }

        function activatePresetGroup(group) {
            const next = String(group || '').trim();
            if (!next || next === activePresetGroup) return false;
            const host = $('wizardPresetList');
            const tabsHost = $('wizardPresetTabs');
            if (!host || !tabsHost) return false;
            const panels = Array.from(host.querySelectorAll('.wizard-preset-group-panel'));
            if (!panels.some((panel) => panel.getAttribute('data-wizard-preset-group') === next)) {
                return false;
            }
            activePresetGroup = next;
            panels.forEach((panel) => {
                panel.classList.toggle('hidden', panel.getAttribute('data-wizard-preset-group') !== next);
            });
            tabsHost.querySelectorAll('.params-mode-preset-tab').forEach((tab) => {
                const on = tab.getAttribute('data-wizard-preset-group') === next;
                tab.classList.toggle('is-active', on);
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            return true;
        }

        async function renderNeedsStep(opts = {}) {
            const state = getState();
            if (!presetCatalog.length) await loadPresetCatalog();
            const presetSel = normalizePresetIds(
                opts.presetIds || state.needs?.presetIds || [],
                new Set(presetById.keys()),
            );
            const targetSel = normalizeTargetLangs(
                opts.targetLangs || state.needs?.targetLangs || ['zh-Hans'],
            );
            renderPresetList(presetSel);
            renderTargetLangs(targetSel.length ? targetSel : ['zh-Hans']);
            const status = $('setupWizardNeedsStatus');
            if (status) {
                status.textContent = uiTx('可多选预设与成片语言。至少选一个预设。');
            }
        }

        function needsAllowNext() {
            const needs = readNeeds();
            return needs.presetIds.length > 0 && needs.targetLangs.length > 0;
        }

        function bindNeedsChange(onChange) {
            const body = $('setupWizardBody');
            if (!body || body.dataset.wizardNeedsBound === '1') return;
            body.dataset.wizardNeedsBound = '1';
            body.addEventListener('change', (ev) => {
                const t = ev.target;
                if (!t || !t.name) return;
                if (t.name !== 'wizardPresetId' && t.name !== 'wizardTargetLang') return;
                syncNeedsToState();
                if (t.name === 'wizardPresetId') {
                    const needs = readNeeds();
                    renderPresetTabs(groupPresets(presetCatalog), needs.presetIds);
                }
                if (typeof onChange === 'function') onChange(readNeeds());
            });
            body.addEventListener('click', (ev) => {
                const tab = ev.target?.closest?.('[data-wizard-preset-group].params-mode-preset-tab');
                if (!tab || !body.contains(tab)) return;
                ev.preventDefault();
                activatePresetGroup(tab.getAttribute('data-wizard-preset-group'));
            });
        }

        function getPresetById(id) {
            return presetById.get(String(id || '')) || null;
        }

        return {
            loadPresetCatalog,
            renderNeedsStep,
            readNeeds,
            syncNeedsToState,
            needsAllowNext,
            bindNeedsChange,
            activatePresetGroup,
            getActivePresetGroup: () => activePresetGroup,
            getPresetById,
            getPresetCatalog: () => presetCatalog.slice(),
            collectModelsFromPresets: (presets) => collectModelsFromPresets(presets),
        };
    }

    return {
        TARGET_LANGS,
        TARGET_LANG_IDS,
        PRESET_GROUP_ORDER,
        PRESET_GROUP_LABELS,
        normalizePresetGroupKey,
        presetGroupLabel,
        normalizeTargetLangs,
        normalizePresetIds,
        listBuiltinPresets,
        groupPresets,
        resolveNeedsFromPresets,
        collectModelsFromPresets,
        createSetupWizardNeeds,
        // Deprecated aliases kept so old tests can soft-fail/migrate
        CONTENT_TYPES: Object.freeze([]),
        CONTENT_TYPE_IDS: Object.freeze([]),
        normalizeContentTypes: (raw) => (Array.isArray(raw) ? raw.map(String) : []),
        resolveNeedsMapping: (contentTypes, targetLangs) => resolveNeedsFromPresets(
            contentTypes,
            targetLangs,
            new Map(),
        ),
    };
}));
