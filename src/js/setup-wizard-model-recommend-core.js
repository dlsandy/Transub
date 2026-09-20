/**
 * Model list for setup wizard step 3: union of models required by selected presets.
 * Required items are locked (checked + disabled). Translation (MT) models are not recommended here.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardModelRecommend = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardModelRecommendFactory(global) {
    const LIGHT_PROBE_TIMEOUT_MS = 2500;

    function withTimeout(promise, ms, fallback) {
        let timer = null;
        return Promise.race([
            Promise.resolve(promise).finally(() => {
                if (timer) clearTimeout(timer);
            }),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(fallback), Math.max(200, Number(ms) || 0));
            }),
        ]);
    }

    function buildRecommendFromLightProbe(input = {}) {
        const wrap = input.gpuInfo || {};
        const info = wrap.info && typeof wrap.info === 'object' ? wrap.info : wrap;
        const vendor = String(info.vendor || '').trim().toLowerCase();
        const detected = info.detected === true
            || (vendor === 'nvidia' && info.detected !== false && !!info.gpuName);
        const gpuName = String(info.gpuName || '').trim();
        const memTotalMiB = Number(input.resources?.gpu?.memTotalMiB) || 0;
        const vramGb = memTotalMiB > 0 ? memTotalMiB / 1024 : 0;
        const amdOk = vendor === 'amd' && (detected || !!gpuName);
        const nvidiaOk = vendor === 'nvidia' && detected;
        const gpuOk = nvidiaOk || amdOk;
        const device = gpuOk ? 'cuda' : 'cpu';
        let profile = 'balanced';
        if (!gpuOk) profile = 'speed';
        else if (vramGb >= 10) profile = 'quality';
        else if (vramGb > 0 && vramGb < 6) profile = 'speed';
        return {
            ok: true,
            lightProbe: true,
            profile,
            device,
            suggestedDevice: device,
            gpuOk,
            gpuName,
            gpuVendor: vendor,
            vramGb,
            vramMb: memTotalMiB,
            models: {},
        };
    }

    function resolveHardwareTier(recommend) {
        const r = recommend && recommend.ok !== false ? recommend : null;
        const vramGb = Number(r?.vramGb || r?.vram_gb) || 0;
        const profile = String(r?.profile || '').trim().toLowerCase();
        const deviceHint = String(r?.device || r?.suggestedDevice || '').trim().toLowerCase();
        const hasGpu = deviceHint === 'cuda' || !!r?.gpuOk;
        let tier = 'cpu';
        if (vramGb >= 10 || profile === 'quality') tier = 'high';
        else if (vramGb >= 6 || profile === 'balanced') tier = 'mid';
        else if (vramGb >= 3.5 || profile === 'speed' || hasGpu) tier = 'low';
        else if (hasGpu && vramGb <= 0) tier = 'low';
        return {
            tier,
            profile: profile || (tier === 'high' ? 'quality' : tier === 'cpu' ? 'speed' : 'balanced'),
            device: hasGpu && tier !== 'cpu' ? 'cuda' : 'cpu',
            hardwareKnown: !!(r && (vramGb > 0 || hasGpu || profile)),
            vramGb,
            gpuName: String(r?.gpuName || '').trim(),
            recommend: r,
        };
    }

    /**
     * @param {object} input
     */
    function buildModelRecommendations(input) {
        const opts = input || {};
        const needs = opts.needs || {};
        const goalsApi = opts.goalsApi || global.TransubSetupWizardGoals || {};
        const needsApi = opts.needsApi || global.TransubSetupWizardNeeds || {};
        const hw = resolveHardwareTier(opts.recommend);
        hw.advancedEntitled = !!opts.advancedEntitled;
        hw.recommend = opts.recommend;

        const selectedPresets = Array.isArray(needs.selectedPresets) && needs.selectedPresets.length
            ? needs.selectedPresets
            : (needs.presetIds || []).map((id) => needsApi.getPresetById?.(id)).filter(Boolean);

        const collect = typeof needsApi.collectModelsFromPresets === 'function'
            ? needsApi.collectModelsFromPresets
            : (global.TransubSetupWizardNeeds?.collectModelsFromPresets);

        const requiredItems = typeof collect === 'function'
            ? collect(selectedPresets)
            : [];

        const labelOf = (id, kind) => {
            if (typeof opts.modelLabel === 'function') return opts.modelLabel(id, kind);
            const asr = (goalsApi.ASR_OPTIONS || []).find((o) => o.id === id);
            if (asr) return asr.label;
            return id;
        };

        const items = requiredItems.map((it) => ({
            id: it.id,
            kind: it.kind || 'asr',
            required: true,
            checked: true,
            disabled: true,
            label: labelOf(it.id, it.kind) || it.label || it.id,
            purpose: it.purpose
                || (it.fromPresets?.length
                    ? `预设：${it.fromPresets.join('、')}`
                    : '预设必需'),
        }));

        const asrModels = items.filter((x) => x.kind === 'asr' && x.checked).map((x) => x.id);
        const mtChecked = [];
        const vadModels = items.filter((x) => x.kind === 'vad' && x.checked).map((x) => x.id);
        const otherRequired = items.filter((x) => x.required && x.kind !== 'asr' && x.kind !== 'mt' && x.kind !== 'vad')
            .map((x) => x.id);

        let hardwareNote = '';
        if (selectedPresets.length) {
            hardwareNote = `已根据 ${selectedPresets.length} 个预设汇总需下载模型；标「必需」的不可取消。`;
        } else {
            hardwareNote = '请先在上一步选择至少一个预设。';
        }

        return {
            items,
            asrModels,
            mtModels: mtChecked,
            vadModels,
            extraModelIds: otherRequired,
            allDownloadIds: items.filter((x) => x.checked).map((x) => x.id),
            hardware: hw,
            hardwareNote,
            engineProfile: hw.profile,
            device: hw.device,
        };
    }

    /**
     * @param {object} deps
     */
    function createSetupWizardModelRecommend(deps) {
        const d = deps || {};
        const electron = d.electron;
        const getState = d.getState || (() => ({}));
        const readNeeds = d.readNeeds || (() => getState().needs || {});
        const goalsApi = d.goalsApi || (() => global.TransubSetupWizardGoals || {});
        const needsApi = d.needsApi || (() => global.TransubSetupWizardNeeds || {});
        const modelLabel = d.modelLabel || ((id) => id);
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const uiTx = d.uiTx || ((t) => t);
        const setWaitVisible = typeof d.setWaitVisible === 'function' ? d.setWaitVisible : (() => {});
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));

        async function probeHardwareRecommend() {
            const state = getState();
            try {
                const gpuP = typeof electron?.transWithAiDetectGpu === 'function'
                    ? electron.transWithAiDetectGpu()
                    : Promise.resolve(null);
                const resP = typeof electron?.transubGetSystemResources === 'function'
                    ? electron.transubGetSystemResources({ includeGpu: true })
                    : Promise.resolve(null);
                const [gpuInfo, resources] = await withTimeout(
                    Promise.all([
                        withTimeout(gpuP, LIGHT_PROBE_TIMEOUT_MS, null),
                        withTimeout(resP, LIGHT_PROBE_TIMEOUT_MS, null),
                    ]),
                    LIGHT_PROBE_TIMEOUT_MS + 400,
                    [null, null],
                );
                if (gpuInfo?.ok || gpuInfo?.info || resources?.gpu) {
                    const rec = buildRecommendFromLightProbe({ gpuInfo, resources });
                    state.detect.recommend = rec;
                    state.detect.gpuOk = !!rec.gpuOk;
                    state.detect.suggestedDevice = rec.device || 'cpu';
                    return rec;
                }
            } catch { /* ignore */ }
            const fallback = { ok: false, lightProbe: true, profile: 'balanced', device: 'cpu' };
            state.detect.recommend = fallback;
            return fallback;
        }

        function buildFromState(recommend) {
            const state = getState();
            const plan = buildModelRecommendations({
                needs: readNeeds(),
                recommend: recommend || state.detect.recommend,
                advancedEntitled: !!state.advancedEntitled,
                goalsApi: typeof goalsApi === 'function' ? goalsApi() : goalsApi,
                needsApi: typeof needsApi === 'function' ? needsApi() : needsApi,
                modelLabel,
            });
            state.modelPlan = plan;
            return plan;
        }

        function renderModelsStep(plan) {
            const host = $('setupWizardModelSuggestList');
            const note = $('setupWizardModelHardwareNote');
            const p = plan || getState().modelPlan;
            if (note) note.textContent = uiTx(p?.hardwareNote || '');
            if (!host || !p) return;
            host.innerHTML = (p.items || []).map((it) => {
                const checked = it.checked ? 'checked' : '';
                const disabled = it.disabled || it.required ? 'disabled' : '';
                const badge = it.required
                    ? `<span class="ml-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-1 rounded">${esc(uiTx('必需'))}</span>`
                    : `<span class="ml-1 text-[10px] text-gray-400">${esc(uiTx('可选'))}</span>`;
                // Use data-locked so change handler can force required back on
                return `<label class="wizard-model-suggest-row flex items-start gap-2 py-2 border-b border-gray-100 last:border-0 ${it.required ? 'opacity-95' : ''}">
                    <input type="checkbox" data-wizard-model-id="${esc(it.id)}" data-wizard-model-kind="${esc(it.kind)}" data-wizard-model-required="${it.required ? '1' : '0'}" class="mt-1 shrink-0" ${checked} ${disabled}>
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium text-gray-800">${esc(it.label || it.id)}${badge}</span>
                        <span class="block text-[11px] text-gray-500 mt-0.5">${esc(uiTx(it.purpose || it.kind))}</span>
                    </span>
                </label>`;
            }).join('');
        }

        function readSelectedModelPlan() {
            const state = getState();
            const host = $('setupWizardModelSuggestList');
            if (!host) return state.modelPlan;
            const asrModels = [];
            const mtModels = [];
            const vadModels = [];
            const extraModelIds = [];
            host.querySelectorAll('input[data-wizard-model-id]').forEach((el) => {
                const id = String(el.getAttribute('data-wizard-model-id') || '').trim();
                const kind = String(el.getAttribute('data-wizard-model-kind') || '').trim();
                const required = el.getAttribute('data-wizard-model-required') === '1';
                if (!id) return;
                if (required) {
                    el.checked = true;
                    el.disabled = true;
                }
                if (!el.checked) return;
                if (kind === 'asr') asrModels.push(id);
                else if (kind === 'mt') mtModels.push(id);
                else if (kind === 'vad') vadModels.push(id);
                else extraModelIds.push(id);
            });
            const next = {
                ...(state.modelPlan || {}),
                asrModels,
                mtModels,
                vadModels,
                extraModelIds,
                allDownloadIds: [...asrModels, ...mtModels, ...vadModels, ...extraModelIds],
                items: (state.modelPlan?.items || []).map((it) => ({
                    ...it,
                    checked: it.required
                        || asrModels.includes(it.id)
                        || mtModels.includes(it.id)
                        || vadModels.includes(it.id)
                        || extraModelIds.includes(it.id),
                })),
            };
            state.modelPlan = next;
            return next;
        }

        function modelsAllowNext() {
            const plan = readSelectedModelPlan();
            return (plan?.asrModels || []).length > 0
                || (plan?.allDownloadIds || []).length > 0;
        }

        async function onEnterModelsStep() {
            const host = $('setupWizardModelSuggestList');
            const note = $('setupWizardModelHardwareNote');
            if (host) host.innerHTML = '';
            if (note) note.textContent = '';
            setWaitVisible(true, uiTx('正在根据所选预设整理下载列表…'));
            try {
                const rec = await probeHardwareRecommend();
                const plan = buildFromState(rec);
                renderModelsStep(plan);
                return plan;
            } finally {
                setWaitVisible(false);
            }
        }

        return {
            probeHardwareRecommend,
            buildFromState,
            renderModelsStep,
            readSelectedModelPlan,
            modelsAllowNext,
            onEnterModelsStep,
        };
    }

    return {
        LIGHT_PROBE_TIMEOUT_MS,
        withTimeout,
        buildRecommendFromLightProbe,
        resolveHardwareTier,
        buildModelRecommendations,
        createSetupWizardModelRecommend,
    };
}));
