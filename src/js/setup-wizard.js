/**
 * Transub 设置向导 — thin shell: state + bind/open/close wiring only.
 * Logic lives in setup-wizard-*-core.js modules.
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const StepsMod = global.TransubSetupWizardSteps || {};
    const AppearanceMod = global.TransubSetupWizardAppearance || {};
    const GoalsMod = global.TransubSetupWizardGoals || {};
    const NeedsMod = global.TransubSetupWizardNeeds || {};
    const RecommendMod = global.TransubSetupWizardModelRecommend || {};
    const HfPickMod = global.TransubSetupWizardHfPick || {};
    const DetectMod = global.TransubSetupWizardDetect || {};
    const SenseMod = global.TransubSetupWizardSense || {};
    const PlanMod = global.TransubSetupWizardPlan || {};
    const ApplyMod = global.TransubSetupWizardApply || {};
    const DownloadUiMod = global.TransubSetupWizardDownloadUi || {};
    const PrefsMod = global.TransubSetupWizardPrefs || {};
    const Onboarding = global.TransubSetupWizardOnboarding || {};

    function uiTf(template, vars) {
        const api = global.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        if (typeof global.TransubUiTf === 'function') return global.TransubUiTf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        return global.TransubI18n?.tx?.(text) ?? String(text || '');
    }
    async function appConfirmMsg(message, options = {}) {
        const fn = global.TransubAppConfirm;
        if (fn) return fn({ message, ...options });
        return window.confirm(message);
    }

    const HF_MIRROR = HfPickMod.DEFAULT_MIRROR || 'https://hf-mirror.com';
    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';

    const state = {
        stepIndex: 0,
        applying: false,
        detecting: false,
        fixing: false,
        sensing: false,
        downloading: false,
        modelsStepLoading: false,
        prepareDetectLoading: false,
        hadSettings: false,
        opening: false,
        shellBound: false,
        docListenersBound: false,
        detect: {
            gpuOk: false,
            gpuName: '',
            gpuVendor: '',
            suggestedDevice: 'cpu',
            engineOk: false,
            engineError: '',
            enginePath: '',
            engineUrl: '',
            recommend: null,
            asrWhisperOk: false,
            numpyVersion: '',
            fasterWhisperVersion: '',
            envResult: null,
            runtimeResult: null,
            activeScope: 'base',
        },
        samples: [],
        sense: null,
        needs: { contentTypes: [], targetLangs: ['zh-Hans'] },
        modelPlan: null,
        prefs: {},
        downloadRows: {},
        downloadOrder: [],
        applied: {
            device: '', profile: '', asr: '', mt: '', language: '', task: '', openedDownload: false,
        },
        catalogById: {},
        installById: {},
        downloadListSeq: 0,
        applyProgressMeter: { lastBytes: 0, lastAt: 0, speed: 0 },
        advancedEntitled: false,
        applyItemTotal: 0,
        applyItemDone: 0,
        hfPick: null,
    };

    let stepsApi = null;
    let appearanceApi = null;
    let goalsApi = null;
    let needsApi = null;
    let recommendApi = null;
    let hfPickApi = null;
    let detectApi = null;
    let senseApi = null;
    let planApi = null;
    let applyApi = null;
    let downloadUiApi = null;
    let prefsApi = null;

    function $(id) {
        return document.getElementById(id);
    }
    function radioValue(name, fallback) {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? String(el.value) : fallback;
    }
    function setRadio(name, value) {
        const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (el) el.checked = true;
    }
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function core() {
        return global.TransubCore;
    }
    async function readAdvancedEntitled() {
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            return !!(res?.ok && res.status?.entitled);
        } catch {
            return false;
        }
    }

    function proxyPayloadFromForm() {
        const form = core()?.buildSavedOptionsFromForm?.() || {};
        return {
            proxyEnabled: !!form.proxyEnabled,
            proxyUrl: String(form.proxyUrl || '').trim(),
            proxyBypass: String(form.proxyBypass || '').trim(),
        };
    }

    function currentHfEndpoint() {
        if (state.hfPick && state.hfPick.hfEndpoint != null) {
            return String(state.hfPick.hfEndpoint).trim().replace(/\/+$/, '');
        }
        const cached = hfPickApi?.getCached?.();
        if (cached && cached.hfEndpoint != null) {
            return String(cached.hfEndpoint).trim().replace(/\/+$/, '');
        }
        const fromForm = $('engineHfEndpointInput')?.value;
        if (fromForm != null && String(fromForm).trim() !== '') {
            return String(fromForm).trim().replace(/\/+$/, '');
        }
        if (fromForm === '') return '';
        return HF_MIRROR;
    }

    async function ensureHfEndpointPicked({ force = false } = {}) {
        if (!hfPickApi?.ensurePicked) {
            state.hfPick = {
                ok: false,
                fallback: true,
                hfEndpoint: HF_MIRROR,
                message: uiTx('测速失败，已回退国内镜像；可稍后在设置 → 网络调整'),
            };
            return state.hfPick;
        }
        const pick = await hfPickApi.ensurePicked({ force });
        state.hfPick = pick;
        return pick;
    }

    function markWizardStarted() {
        if (typeof Onboarding.markWizardStarted === 'function') {
            Onboarding.markWizardStarted();
            return;
        }
        try { localStorage.setItem('transub.setupWizard.started', '1'); } catch (_) { /* ignore */ }
    }
    function markOnboardingDone() {
        if (typeof Onboarding.markWizardCompleted === 'function') {
            Onboarding.markWizardCompleted();
        } else {
            try {
                localStorage.setItem('transub.setupWizard.completed', '1');
                localStorage.setItem('transub.setupWizard.started', '1');
            } catch (_) { /* ignore */ }
        }
        try { global.TransubEnvCheck?.markDone?.(); } catch (_) { /* ignore */ }
        try {
            const key = global.TransubEnvCheck?.DONE_KEY || 'transub.envCheck.done';
            localStorage.setItem(key, '1');
        } catch (_) { /* ignore */ }
    }

    function sharedGoalsFns() {
        return goalsApi || {};
    }

    function syncNeedsIntoHiddenForm(needs) {
        const n = needs || needsApi?.readNeeds?.() || state.needs || {};
        state.needs = n;
        if ($('wizardLanguageSelect')) $('wizardLanguageSelect').value = n.language || 'auto';
        setRadio('wizardTask', n.task || 'translate');
        setRadio('wizardVariant', n.variant || 'simplified');
        const plan = state.modelPlan;
        const profile = plan?.engineProfile || 'balanced';
        setRadio('wizardProfile', profile);
        if ($('wizardProfileSelect')) $('wizardProfileSelect').value = profile;
        if ($('wizardDeviceSelect') && plan?.device) $('wizardDeviceSelect').value = plan.device;
        try {
            const presetSel = $('presetSelect');
            if (presetSel && n.primaryPresetId) {
                presetSel.value = n.primaryPresetId;
            }
        } catch { /* ignore */ }
    }

    function syncModelPlanIntoHiddenLists() {
        const plan = recommendApi?.readSelectedModelPlan?.() || state.modelPlan;
        if (!plan) return plan;
        const asrHost = $('wizardAsrList');
        const mtHost = $('wizardMtList');
        if (asrHost) {
            asrHost.dataset.wizardSynced = '1';
            asrHost.innerHTML = (plan.asrModels || []).map((id) => (
                `<input type="checkbox" data-model-id="${esc(id)}" checked>`
            )).join('');
        }
        if (mtHost) {
            mtHost.dataset.wizardSynced = '1';
            // Keep zero checked boxes when user cleared optional MT — do not omit the host sync flag.
            mtHost.innerHTML = (plan.mtModels || []).map((id) => (
                `<input type="checkbox" data-model-id="${esc(id)}" checked>`
            )).join('');
        }
        return plan;
    }

    function readGoalsForWizard() {
        const base = sharedGoalsFns().readGoals?.() || {};
        const needs = needsApi?.readNeeds?.() || state.needs || {};
        const plan = recommendApi?.readSelectedModelPlan?.() || state.modelPlan || {};
        syncNeedsIntoHiddenForm(needs);
        const hasPlan = !!(plan && (Array.isArray(plan.items) || Array.isArray(plan.allDownloadIds)));
        return {
            ...base,
            task: needs.task || 'translate',
            language: needs.language || base.language || 'auto',
            variant: needs.variant || base.variant || 'simplified',
            subtitleTargetLang: needs.subtitleTargetLang || base.subtitleTargetLang || 'zh-Hans',
            profile: plan.engineProfile || base.profile || 'balanced',
            // Honor empty MT selection from the models step (do not fall back to defaults).
            asrModels: hasPlan && Array.isArray(plan.asrModels)
                ? plan.asrModels.slice()
                : base.asrModels,
            mtModels: hasPlan && Array.isArray(plan.mtModels)
                ? plan.mtModels.slice()
                : base.mtModels,
            asrModel: (hasPlan && plan.asrModels && plan.asrModels[0]) || base.asrModel,
            mtModel: (hasPlan && plan.mtModels && plan.mtModels[0]) || (hasPlan ? '' : base.mtModel),
        };
    }

    function wireCores() {
        goalsApi = GoalsMod.createSetupWizardGoals?.({
            $,
            radioValue,
            getState: () => state,
            getHfEndpoint: currentHfEndpoint,
        }) || null;

        needsApi = NeedsMod.createSetupWizardNeeds?.({
            $,
            getState: () => state,
            uiTx,
            electron,
        }) || null;

        hfPickApi = HfPickMod.createSetupWizardHfPick?.({
            electron,
            getProxyPayload: proxyPayloadFromForm,
            getStatusEl: () => $('setupWizardHfSourceStatus'),
            uiTx,
        }) || null;

        appearanceApi = AppearanceMod.createSetupWizardAppearance?.({
            electron,
            $,
            onLocaleApplied: () => {
                stepsApi?.showStep?.(state.stepIndex);
            },
        }) || null;

        prefsApi = PrefsMod.createSetupWizardPrefs?.({
            $,
            electron,
            uiTx,
            esc,
            getState: () => state,
            applyTheme: (theme) => appearanceApi?.applyAppTheme?.(theme),
            readStoredTheme: () => appearanceApi?.readStoredTheme?.() || 'light',
        }) || null;

        planApi = PlanMod.createSetupWizardPlan?.({
            $,
            electron,
            uiTf,
            uiTx,
            esc,
            getState: () => state,
            radioValue,
            readGoals: () => readGoalsForWizard(),
            readCheckedIds: (...a) => sharedGoalsFns().readCheckedIds?.(...a),
            enginePayloadFromForm: (...a) => sharedGoalsFns().enginePayloadFromForm?.(...a),
            ensureHfEndpoint: ensureHfEndpointPicked,
            getHfEndpoint: currentHfEndpoint,
            defaultAsrFor: (...a) => sharedGoalsFns().defaultAsrFor?.(...a),
            defaultMtSelection: (...a) => sharedGoalsFns().defaultMtSelection?.(...a),
            mtSelectionOpts: (...a) => sharedGoalsFns().mtSelectionOpts?.(...a),
            asrOptionsFor: (...a) => sharedGoalsFns().asrOptionsFor?.(...a),
            mtOptionsFor: (...a) => sharedGoalsFns().mtOptionsFor?.(...a),
            collectDownloadModelIds: (...a) => sharedGoalsFns().collectDownloadModelIds?.(...a),
            resolveWizardPipeline: (...a) => GoalsMod.resolveWizardPipeline?.(...a)
                || sharedGoalsFns().resolveWizardPipeline?.(...a),
            ASR_OPTIONS: GoalsMod.ASR_OPTIONS || sharedGoalsFns().ASR_OPTIONS,
            WHISPER_JA_PRIMARY: GoalsMod.WHISPER_JA_PRIMARY,
            WHISPER_JA_IDS: GoalsMod.WHISPER_JA_IDS,
            isWhisperJaId: GoalsMod.isWhisperJaId || ((id) => sharedGoalsFns().isWhisperJaId?.(id)),
            asrListHasWhisperJa: GoalsMod.asrListHasWhisperJa || ((ids) => sharedGoalsFns().asrListHasWhisperJa?.(ids)),
            isSakuraModelId: GoalsMod.isSakuraModelId || ((id) => sharedGoalsFns().isSakuraModelId?.(id)),
            isManagedLlmModelId: GoalsMod.isManagedLlmModelId || ((id) => sharedGoalsFns().isManagedLlmModelId?.(id)),
            allMtOptions: GoalsMod.allMtOptions || (() => sharedGoalsFns().allMtOptions?.() || []),
            TASK_LABELS: GoalsMod.TASK_LABELS,
            PROFILE_LABELS: GoalsMod.PROFILE_LABELS,
            LANG_LABELS: GoalsMod.LANG_LABELS,
            TRANSLATE_PREF_LABELS: GoalsMod.TRANSLATE_PREF_LABELS,
            senseIsAdopted: (...a) => senseApi?.senseIsAdopted?.(...a),
            getSteps: () => StepsMod.STEPS || stepsApi?.STEPS || [],
        }) || null;

        recommendApi = RecommendMod.createSetupWizardModelRecommend?.({
            $,
            electron,
            uiTx,
            esc,
            getState: () => state,
            readNeeds: () => needsApi?.readNeeds?.() || state.needs,
            goalsApi: () => goalsApi || GoalsMod,
            needsApi: () => needsApi || NeedsMod,
            modelLabel: (...a) => planApi?.modelLabel?.(...a) || String(a[0] || ''),
            setWaitVisible: (visible, message) => {
                detectApi?.setDetectWaitVisible?.(visible, message);
            },
        }) || null;

        downloadUiApi = DownloadUiMod.createSetupWizardDownloadUi?.({
            $,
            uiTx,
            uiTf,
            esc,
            getState: () => state,
            modelLabel: (...a) => planApi?.modelLabel?.(...a) || String(a[0] || ''),
        }) || null;

        senseApi = SenseMod.createSetupWizardSense?.({
            $,
            electron,
            uiTx,
            esc,
            getState: () => state,
            readGoals: () => readGoalsForWizard(),
            enginePayloadFromForm: (...a) => sharedGoalsFns().enginePayloadFromForm?.(...a),
            defaultAsrFor: (...a) => sharedGoalsFns().defaultAsrFor?.(...a),
            defaultMtFor: (...a) => sharedGoalsFns().defaultMtFor?.(...a),
            isSakuraModelId: GoalsMod.isSakuraModelId || ((id) => sharedGoalsFns().isSakuraModelId?.(id)),
            modelLabel: (...a) => planApi?.modelLabel?.(...a) || String(a[0] || ''),
            LANG_LABELS: GoalsMod.LANG_LABELS,
            SAMPLE_MAX: GoalsMod.SAMPLE_MAX || 5,
            getSteps: () => StepsMod.STEPS || [],
            setRadio,
            readAdvancedEntitled,
            syncModelSelects: (...a) => planApi?.syncModelSelects?.(...a),
            renderPlanCard: (...a) => planApi?.renderPlanCard?.(...a),
            refreshDownloadModelList: (...a) => planApi?.refreshDownloadModelList?.(...a),
        }) || null;

        detectApi = DetectMod.createSetupWizardDetect?.({
            $,
            electron,
            uiTf,
            uiTx,
            appConfirmMsg,
            getState: () => state,
            readGoals: () => readGoalsForWizard(),
            enginePayloadFromForm: (...a) => sharedGoalsFns().enginePayloadFromForm?.(...a),
            defaultAsrFor: (...a) => sharedGoalsFns().defaultAsrFor?.(...a),
            senseIsAdopted: (...a) => senseApi?.senseIsAdopted?.(...a),
            syncModelSelects: (...a) => planApi?.syncModelSelects?.(...a),
            syncWizardDeviceSelect: (...a) => planApi?.syncWizardDeviceSelect?.(...a),
            getSteps: () => StepsMod.STEPS || [],
            resolveWizardAsrHint: () => {
                const plan = state.modelPlan;
                if (plan?.asrModels?.[0]) return plan.asrModels[0];
                return sharedGoalsFns().defaultAsrFor?.(
                    state.needs?.language || 'auto',
                    plan?.engineProfile || 'balanced',
                    state.detect.recommend,
                ) || 'sensevoice-small';
            },
            resolveWizardPipeline: (...a) => GoalsMod.resolveWizardPipeline?.(...a)
                || sharedGoalsFns().resolveWizardPipeline?.(...a),
        }) || null;

        applyApi = ApplyMod.createSetupWizardApply?.({
            $,
            electron,
            uiTf,
            uiTx,
            esc,
            appConfirmMsg,
            appConfirmChoice: async (options = {}) => {
                const fn = global.TransubAppConfirmChoice;
                if (fn) return fn(options);
                const ok = await appConfirmMsg(options.message || options, options);
                return ok ? 'primary' : 'secondary';
            },
            getState: () => state,
            readGoals: () => readGoalsForWizard(),
            enginePayloadFromForm: (...a) => sharedGoalsFns().enginePayloadFromForm?.(...a),
            defaultAsrFor: (...a) => sharedGoalsFns().defaultAsrFor?.(...a),
            defaultMtSelection: (...a) => sharedGoalsFns().defaultMtSelection?.(...a),
            mtSelectionOpts: (...a) => sharedGoalsFns().mtSelectionOpts?.(...a),
            collectDownloadModelIds: (...a) => sharedGoalsFns().collectDownloadModelIds?.(...a),
            resolveWizardPipeline: (...a) => GoalsMod.resolveWizardPipeline?.(...a)
                || sharedGoalsFns().resolveWizardPipeline?.(...a),
            defaultVadFor: (...a) => sharedGoalsFns().defaultVadFor?.(...a),
            WHISPER_JA_PRIMARY: GoalsMod.WHISPER_JA_PRIMARY,
            isSakuraModelId: GoalsMod.isSakuraModelId || ((id) => sharedGoalsFns().isSakuraModelId?.(id)),
            isManagedLlmModelId: GoalsMod.isManagedLlmModelId || ((id) => sharedGoalsFns().isManagedLlmModelId?.(id)),
            isLightManagedLlmModelId: GoalsMod.isLightManagedLlmModelId || ((id) => sharedGoalsFns().isLightManagedLlmModelId?.(id)),
            asrListHasWhisperJa: GoalsMod.asrListHasWhisperJa || ((ids) => sharedGoalsFns().asrListHasWhisperJa?.(ids)),
            enforceWhisperJaForSakura: (...a) => planApi?.enforceWhisperJaForSakura?.(...a),
            modelLabel: (...a) => planApi?.modelLabel?.(...a) || String(a[0] || ''),
            senseIsAdopted: (...a) => senseApi?.senseIsAdopted?.(...a),
            showStep: (i) => stepsApi?.showStep?.(i),
            getSteps: () => StepsMod.STEPS || [],
            stepIndexOf: (id) => (StepsMod.STEPS || []).indexOf(id),
            ensureHfEndpointPicked,
            currentHfEndpoint,
            markOnboardingDone,
            readAdvancedEntitled,
            downloadUi: downloadUiApi,
            getNeeds: () => needsApi?.readNeeds?.() || state.needs,
            readPrefsPatch: () => prefsApi?.readPrefsPatch?.() || {},
            TASK_LABELS: GoalsMod.TASK_LABELS,
            PROFILE_LABELS: GoalsMod.PROFILE_LABELS,
            LANG_LABELS: GoalsMod.LANG_LABELS,
        }) || null;

        stepsApi = StepsMod.createSetupWizardSteps?.({
            $,
            uiTf,
            uiTx,
            getState: () => state,
            radioValue,
            closeAllModelDropdowns: (...a) => planApi?.closeAllModelDropdowns?.(...a),
            refineNextButton: (id, nextBtn) => {
                if (!nextBtn) return;
                if (id === 'needs') {
                    const ok = !!needsApi?.needsAllowNext?.();
                    nextBtn.disabled = !ok;
                    nextBtn.title = ok ? '' : uiTx('请先选预设和成片语言');
                } else if (id === 'models') {
                    const ok = !!recommendApi?.modelsAllowNext?.();
                    nextBtn.disabled = !ok || !!state.modelsStepLoading;
                    nextBtn.title = state.modelsStepLoading
                        ? uiTx('正在检测硬件…')
                        : (ok ? '' : uiTx('请先勾选听写模型'));
                } else if (id === 'prepare') {
                    const busy = !!(state.detecting || state.fixing || state.prepareDetectLoading);
                    const ok = !!detectApi?.prepareAllowsNext?.();
                    nextBtn.disabled = busy || !ok;
                    nextBtn.title = busy
                        ? uiTx('请稍候…')
                        : (ok ? '' : uiTx('请先修复未通过项'));
                } else if (id === 'downloads') {
                    nextBtn.title = nextBtn.disabled ? uiTx('下载进行中') : uiTx('重新下载');
                } else {
                    nextBtn.removeAttribute('title');
                }
            },
            onEnterStep: (id) => {
                if (id === 'locale') appearanceApi?.onEnterAppearanceStep?.();
                if (id === 'needs') {
                    needsApi?.renderNeedsStep?.();
                    needsApi?.bindNeedsChange?.(() => {
                        stepsApi?.showStep?.(state.stepIndex);
                    });
                }
                if (id === 'models') {
                    if (state.modelsStepLoading) return;
                    state.modelsStepLoading = true;
                    syncNeedsIntoHiddenForm();
                    // Warm HF pick while hardware recommend runs (applyPlan used to block ~10s on Next).
                    void ensureHfEndpointPicked();
                    // Show wait overlay immediately (before async recommend paints content).
                    detectApi?.setDetectWaitVisible?.(true, uiTx('正在检测本机硬件，请稍候…'));
                    const nextBtn = $('setupWizardNextBtn');
                    const backBtn = $('setupWizardBackBtn');
                    if (nextBtn) nextBtn.disabled = true;
                    if (backBtn) backBtn.disabled = true;
                    void recommendApi?.onEnterModelsStep?.()
                        .catch(() => { /* wait overlay cleared in finally */ })
                        .finally(() => {
                            state.modelsStepLoading = false;
                            detectApi?.setDetectWaitVisible?.(false);
                            const btn = $('setupWizardNextBtn');
                            if (btn && (StepsMod.STEPS || [])[state.stepIndex] === 'models') {
                                btn.textContent = uiTx('下一步');
                                btn.disabled = !recommendApi?.modelsAllowNext?.();
                                btn.title = recommendApi?.modelsAllowNext?.()
                                    ? ''
                                    : uiTx('请先勾选听写模型');
                            }
                            const back = $('setupWizardBackBtn');
                            if (back && (StepsMod.STEPS || [])[state.stepIndex] === 'models') {
                                back.disabled = false;
                            }
                        });
                }
                if (id === 'prepare') {
                    if (state.detecting || state.fixing || state.prepareDetectLoading) return;
                    syncModelPlanIntoHiddenLists();
                    state.prepareDetectLoading = true;
                    // Keep warming / refresh cache while env detect runs.
                    void ensureHfEndpointPicked();
                    const nextBtn = $('setupWizardNextBtn');
                    if (nextBtn) nextBtn.disabled = true;
                    void detectApi?.runPrepareDetect?.()
                        .catch(() => { /* overlay cleared in detect finally */ })
                        .finally(() => {
                            state.prepareDetectLoading = false;
                            detectApi?.syncPrepareBlockerStatus?.();
                            const btn = $('setupWizardNextBtn');
                            if (btn && (StepsMod.STEPS || [])[state.stepIndex] === 'prepare') {
                                btn.textContent = uiTx('下一步');
                                const ok = !!detectApi?.prepareAllowsNext?.();
                                btn.disabled = !!(state.detecting || state.fixing) || !ok;
                                btn.title = ok ? '' : uiTx('请先修复未通过项');
                            }
                        });
                }
                if (id === 'downloads') {
                    // applyPlan navigates here; no extra enter work
                }
                if (id === 'prefs') {
                    prefsApi?.onEnterPrefsStep?.();
                    prefsApi?.bindPrefsControls?.();
                }
            },
        }) || null;
    }

    async function requestCloseWizard() {
        if (state.applying || state.detecting || state.fixing || state.sensing || state.downloading
            || state.modelsStepLoading || state.prepareDetectLoading) {
            closeWizard({ dismiss: false });
            return;
        }
        if (!state.hadSettings) {
            const ok = await appConfirmMsg(uiTx('下次启动仍会打开设置向导。确定稍后？'), {
                title: uiTx('稍后设置'),
                primaryLabel: uiTx('稍后'),
                secondaryLabel: uiTx('留下'),
            });
            if (!ok) return;
        }
        closeWizard({ dismiss: true });
    }

    function closeWizard({ dismiss = false } = {}) {
        if (state.applying || state.detecting || state.fixing || state.sensing || state.downloading
            || state.modelsStepLoading || state.prepareDetectLoading) {
            const tip = uiTx('进行中，请稍候');
            const status = $('setupWizardDetectStatus')
                || $('setupWizardDownloadStatus')
                || $('setupWizardApplyStatus');
            if (status) status.textContent = tip;
            return;
        }
        void dismiss;
        $('setupWizardModal')?.classList.add('hidden');
        if (isStandaloneWizard) {
            try { global.close(); } catch (_) { /* ignore */ }
        }
    }

    async function openWizard({ force = false } = {}) {
        if (!isStandaloneWizard && electron?.transubOpenSetupWizard) {
            markWizardStarted();
            return electron.transubOpenSetupWizard({ forceWizard: !!force });
        }
        if (!isStandaloneWizard && electron?.transubOpenSettings) {
            markWizardStarted();
            return electron.transubOpenSettings({ tab: 'runtime', wizard: true, forceWizard: !!force });
        }

        try {
            await global.TransubUiFragmentLoad?.ensureUiFragment?.('setup-wizard');
        } catch (err) {
            console.warn('[setup-wizard] fragment load failed:', err?.message || err);
        }
        try { bind(); } catch (_) { /* ignore */ }
        try {
            global.TransubPipMirrorUi?.bindSelects?.({ uiTx });
        } catch (_) { /* optional */ }

        const modal = $('setupWizardModal');
        if (!modal) return { ok: false, error: 'wizard modal missing' };
        if (!modal.classList.contains('hidden')) return { ok: true, alreadyOpen: true };
        if (state.opening) return { ok: true, busy: true };
        state.opening = true;

        try {
            let exists = false;
            try {
                const res = await electron?.transubHasSettingsFile?.();
                exists = !!res?.exists;
            } catch (_) {
                exists = false;
            }
            state.hadSettings = exists;
            state.advancedEntitled = await readAdvancedEntitled();

            if (exists && force !== true) {
                const ok = await appConfirmMsg('检测到已有设置。继续将覆盖设备、档位、任务与模型相关默认项，是否继续？', { title: '设置向导' });
                if (!ok) return { ok: false, cancelled: true };
            }

            const form = core()?.buildSavedOptionsFromForm?.() || {};
            appearanceApi?.syncAppearanceControls?.();
            if (form.uiLocale) void appearanceApi?.applyUiLocale?.(form.uiLocale);
            state.needs = {
                presetIds: Array.isArray(form.wizardPresetIds) ? form.wizardPresetIds.slice()
                    : (Array.isArray(form.wizardContentTypes) ? form.wizardContentTypes.slice() : []),
                targetLangs: Array.isArray(form.wizardTargetLangs) && form.wizardTargetLangs.length
                    ? form.wizardTargetLangs.slice()
                    : [form.subtitleTargetLang || 'zh-Hans'],
            };
            void needsApi?.renderNeedsStep?.(state.needs);

            state.applying = false;
            state.detecting = false;
            state.fixing = false;
            state.sensing = false;
            state.downloading = false;
            state.modelsStepLoading = false;
            state.prepareDetectLoading = false;
            state.detect.recommend = null;
            state.detect.envResult = null;
            state.detect.runtimeResult = null;
            state.detect.activeScope = 'base';
            state.samples = [];
            state.sense = null;
            state.modelPlan = null;
            state.downloadRows = {};
            state.downloadOrder = [];
            state.hfPick = null;
            hfPickApi?.clearCache?.();
            detectApi?.setDetectWaitVisible?.(false);
            detectApi?.setEngineGatedActionsEnabled?.(false);
            markWizardStarted();
            modal.classList.remove('hidden');
            stepsApi?.showStep?.(0);
            return { ok: true };
        } finally {
            state.opening = false;
        }
    }

    function scheduleOpenWizard(opts = {}) {
        const tryOpen = (attempt) => {
            if (typeof global.TransubSetupWizard?.open === 'function') {
                void openWizard(opts);
                return;
            }
            if (attempt >= 20) return;
            setTimeout(() => tryOpen(attempt + 1), 50);
        };
        setTimeout(() => tryOpen(0), 0);
    }

    async function maybeAutoOpen() {
        if (isStandaloneSettings || isStandaloneWizard) return false;
        const completed = typeof Onboarding.isWizardCompleted === 'function'
            ? Onboarding.isWizardCompleted()
            : (() => {
                try { return localStorage.getItem('transub.setupWizard.completed') === '1'; }
                catch (_) { return false; }
            })();
        const started = typeof Onboarding.isWizardStarted === 'function'
            ? Onboarding.isWizardStarted()
            : (() => {
                try { return localStorage.getItem('transub.setupWizard.started') === '1'; }
                catch (_) { return false; }
            })();
        let hasSettings = false;
        try {
            const res = await electron?.transubHasSettingsFile?.();
            hasSettings = !!res?.exists;
        } catch (_) {
            hasSettings = false;
        }
        const resolve = Onboarding.resolveSetupWizardAutoOpen
            || ((flags) => {
                if (flags.completed) return { open: false };
                if (flags.hasSettings && !flags.started) return { open: false, migrateComplete: true };
                return { open: true };
            });
        const decision = resolve({ completed, started, hasSettings });
        if (decision.migrateComplete) {
            markOnboardingDone();
            return false;
        }
        if (!decision.open) return false;
        await openWizard({ force: true });
        return true;
    }

    async function onNext() {
        if (state.applying || state.detecting || state.fixing || state.sensing || state.downloading
            || state.modelsStepLoading || state.prepareDetectLoading) {
            return;
        }
        const steps = StepsMod.STEPS || [];
        const id = steps[state.stepIndex];
        if (id === 'needs') {
            const needs = needsApi?.syncNeedsToState?.() || needsApi?.readNeeds?.();
            if (!needsApi?.needsAllowNext?.()) {
                await appConfirmMsg(uiTx('请至少选择一个预设和一种成片语言。'), {
                    title: uiTx('还不完整'),
                    primaryLabel: uiTx('知道了'),
                    hideSecondary: true,
                });
                return;
            }
            syncNeedsIntoHiddenForm(needs);
        }
        if (id === 'models') {
            if (!recommendApi?.modelsAllowNext?.()) {
                await appConfirmMsg(uiTx('请至少勾选一个听写模型。'), {
                    title: uiTx('还不完整'),
                    primaryLabel: uiTx('知道了'),
                    hideSecondary: true,
                });
                return;
            }
            syncModelPlanIntoHiddenLists();
        }
        if (id === 'prepare') {
            if (!detectApi?.prepareAllowsNext?.()) {
                await detectApi?.promptDetectFixBeforeNext?.('base');
                return;
            }
            syncModelPlanIntoHiddenLists();
            await applyApi?.applyPlan?.();
            return;
        }
        if (id === 'downloads') {
            await applyApi?.applyPlan?.();
            return;
        }
        if (id === 'prefs') {
            prefsApi?.syncPrefsToMainForm?.();
            const saved = await prefsApi?.savePrefsAndFinish?.();
            if (saved && saved.ok === false) {
                await appConfirmMsg(saved.error || uiTx('保存偏好失败'), {
                    title: uiTx('保存失败'),
                    primaryLabel: uiTx('知道了'),
                    hideSecondary: true,
                });
                return;
            }
            markOnboardingDone();
            closeWizard({ dismiss: false });
            return;
        }
        stepsApi?.showStep?.(state.stepIndex + 1);
    }

    function onBack() {
        if (state.applying || state.fixing || state.sensing || state.downloading || state.detecting
            || state.modelsStepLoading || state.prepareDetectLoading) {
            return;
        }
        const steps = StepsMod.STEPS || [];
        const id = steps[state.stepIndex];
        if (id === 'downloads') {
            const prepareIdx = (StepsMod.STEPS || []).indexOf('prepare');
            stepsApi?.showStep?.(prepareIdx >= 0 ? prepareIdx : state.stepIndex - 1);
            return;
        }
        stepsApi?.showStep?.(state.stepIndex - 1);
    }

    function bind() {
        wireCores();

        const openBtn = $('openSetupWizardFromParamsBtn');
        if (openBtn && openBtn.dataset.wizardOpenBound !== '1') {
            openBtn.dataset.wizardOpenBound = '1';
            openBtn.addEventListener('click', () => { void openWizard({ force: false }); });
        }

        const modal = $('setupWizardModal');
        if (!modal || modal.getAttribute('data-ui-fragment') === 'pending') {
            if (!state.shellBound) {
                state.shellBound = true;
                if (isStandaloneWizard && electron?.onOpenSetupWizard) {
                    electron.onOpenSetupWizard((payload) => {
                        scheduleOpenWizard({ force: payload?.forceWizard !== false });
                    });
                }
                if (isStandaloneSettings && electron?.onOpenParams) {
                    electron.onOpenParams((payload) => {
                        if (!payload?.wizard) return;
                        scheduleOpenWizard({ force: payload.forceWizard !== false });
                    });
                }
                if (isStandaloneWizard) {
                    scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
                } else if (isStandaloneSettings && pageQuery.get('wizard') === '1') {
                    scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
                }
            }
            return;
        }
        if (modal.dataset.wizardBound === '1') return;
        modal.dataset.wizardBound = '1';

        appearanceApi?.bindAppearanceControls?.();
        prefsApi?.bindPrefsControls?.();
        detectApi?.bindOverviewChipClicks?.();
        detectApi?.setEngineGatedActionsEnabled?.(false);
        needsApi?.bindNeedsChange?.(() => {
            if ((StepsMod.STEPS || [])[state.stepIndex] === 'needs') {
                stepsApi?.showStep?.(state.stepIndex);
            }
        });

        $('setupWizardCloseBtn')?.addEventListener('click', () => { void requestCloseWizard(); });
        $('setupWizardSkipBtn')?.addEventListener('click', () => { void requestCloseWizard(); });
        $('setupWizardBackBtn')?.addEventListener('click', onBack);
        $('setupWizardNextBtn')?.addEventListener('click', () => { void onNext(); });

        $('setupWizardPrepareFixBtn')?.addEventListener('click', () => { void detectApi?.runPrepareFix?.(); });
        $('setupWizardRetryDetectBtn')?.addEventListener('click', () => { void detectApi?.runPrepareDetect?.({ force: true }); });
        $('setupWizardReuseCudaBtn')?.addEventListener('click', () => { void detectApi?.runWizardReuseCuda?.('base'); });
        $('setupWizardManualBtn')?.addEventListener('click', () => { void detectApi?.runWizardManual?.('base'); });
        $('setupWizardFixBtn')?.addEventListener('click', () => { void detectApi?.runWizardFix?.('base'); });
        $('setupWizardRuntimeFixBtn')?.addEventListener('click', () => { void detectApi?.runWizardFix?.('runtime'); });
        $('setupWizardRuntimeReuseCudaBtn')?.addEventListener('click', () => { void detectApi?.runWizardReuseCuda?.('runtime'); });
        $('setupWizardRuntimeManualBtn')?.addEventListener('click', () => { void detectApi?.runWizardManual?.('runtime'); });
        $('setupWizardRuntimeRetryBtn')?.addEventListener('click', () => { void detectApi?.runDetect?.({ scope: 'runtime' }); });

        const onEnvActionClick = (event) => {
            const btn = event.target?.closest?.('[data-env-action-url]');
            if (!btn) return;
            const url = btn.getAttribute('data-env-action-url');
            if (url) void electron?.openExternal?.(url);
        };
        $('setupWizardDetectList')?.addEventListener('click', onEnvActionClick);
        $('setupWizardRuntimeList')?.addEventListener('click', onEnvActionClick);

        $('setupWizardDownloadList')?.addEventListener('click', (ev) => {
            const btn = ev.target?.closest?.('[data-wizard-dl-retry]');
            if (!btn) return;
            // Full re-apply is safer than partial; user can re-enter from prepare.
            void applyApi?.applyPlan?.();
        });

        $('setupWizardOpenProBtn')?.addEventListener('click', () => {
            markOnboardingDone();
            closeWizard({ dismiss: false });
            if (electron?.transubOpenSettings) void electron.transubOpenSettings({ tab: 'pro' });
            else core()?.openParamsModal?.('pro');
        });
        $('setupWizardModal')?.addEventListener('click', (event) => {
            if (isStandaloneWizard) return;
            if (event.target === $('setupWizardModal')) void requestCloseWizard();
        });

        $('setupWizardModelSuggestList')?.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t?.matches?.('input[data-wizard-model-id]')) return;
            if (t.getAttribute('data-wizard-model-required') === '1') {
                t.checked = true;
                t.disabled = true;
            }
            recommendApi?.readSelectedModelPlan?.();
            const btn = $('setupWizardNextBtn');
            if (btn && (StepsMod.STEPS || [])[state.stepIndex] === 'models') {
                btn.disabled = !recommendApi?.modelsAllowNext?.();
            }
        });

        if (!state.docListenersBound) {
            state.docListenersBound = true;
            document.addEventListener('keydown', (event) => {
                const m = $('setupWizardModal');
                if (!m || m.classList.contains('hidden')) return;
                const confirmEl = $('appConfirmModal');
                if (confirmEl && !confirmEl.classList.contains('hidden')) return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    void requestCloseWizard();
                }
            });
        }

        if (!state.shellBound) {
            state.shellBound = true;
            if (isStandaloneWizard && electron?.onOpenSetupWizard) {
                electron.onOpenSetupWizard((payload) => {
                    scheduleOpenWizard({ force: payload?.forceWizard !== false });
                });
            }
            if (isStandaloneSettings && electron?.onOpenParams) {
                electron.onOpenParams((payload) => {
                    if (!payload?.wizard) return;
                    scheduleOpenWizard({ force: payload.forceWizard !== false });
                });
            }
            if (isStandaloneWizard) {
                scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
            } else if (isStandaloneSettings && pageQuery.get('wizard') === '1') {
                scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
            }
        }
    }

    function init() {
        bind();
        setTimeout(() => { void maybeAutoOpen(); }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }
    global.addEventListener?.('transub-ui-fragment-ready', (ev) => {
        const key = ev?.detail?.key;
        if (key === 'setup-wizard' || key === 'settings-panels') bind();
    });

    global.TransubSetupWizard = {
        open: openWizard,
        close: closeWizard,
        maybeAutoOpen,
        markDone: markOnboardingDone,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
