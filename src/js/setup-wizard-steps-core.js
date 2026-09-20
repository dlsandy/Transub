/**
 * Setup wizard step order, titles, and showStep / progress helpers.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardSteps = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardStepsFactory(global) {
    const STEPS = ['locale', 'needs', 'models', 'prepare', 'downloads', 'prefs'];
    const STEP_TITLES = {
        locale: '界面语言',
        needs: '选择预设',
        models: '确认模型',
        prepare: '环境检测',
        downloads: '模型下载',
        prefs: '个人偏好',
    };

    /**
     * @param {object} deps
     */
    function createSetupWizardSteps(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const uiTf = d.uiTf || ((t) => t);
        const uiTx = d.uiTx || ((t) => t);
        const getState = d.getState || (() => ({}));
        const closeAllModelDropdowns = d.closeAllModelDropdowns || (() => {});
        const onEnterStep = d.onEnterStep || (() => {});
        const refineNextButton = d.refineNextButton || (() => {});

        function renderProgress() {
            const state = getState();
            const host = $('setupWizardProgress');
            if (!host) return;
            host.innerHTML = STEPS.map((_, i) => {
                const cls = i < state.stepIndex ? 'done' : (i === state.stepIndex ? 'active' : '');
                return `<span class="wizard-progress-dot ${cls}"></span>`;
            }).join('');
        }

        function showStep(index) {
            const state = getState();
            closeAllModelDropdowns();
            state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
            const id = STEPS[state.stepIndex];
            if (typeof document !== 'undefined') {
                document.querySelectorAll('#setupWizardModal .wizard-step').forEach((el) => {
                    el.classList.toggle('active', el.dataset.wizardStep === id);
                });
            }
            if ($('setupWizardStepLabel')) {
                $('setupWizardStepLabel').textContent = uiTf('步骤 {i} / {total} · {title}', {
                    i: state.stepIndex + 1,
                    total: STEPS.length,
                    title: uiTx(STEP_TITLES[id] || ''),
                });
            }
            renderProgress();

            const backBtn = $('setupWizardBackBtn');
            const nextBtn = $('setupWizardNextBtn');
            const skipBtn = $('setupWizardSkipBtn');
            const busy = !!(
                state.applying || state.detecting || state.fixing
                || state.sensing || state.downloading
                || state.modelsStepLoading || state.prepareDetectLoading
            );
            if (backBtn) {
                // Allow Back on downloads after failure (not while busy).
                backBtn.disabled = state.stepIndex === 0 || busy;
                backBtn.classList.toggle('invisible', id === 'prefs' && !state.hadSettings);
            }
            if (skipBtn) {
                skipBtn.classList.toggle('hidden', id === 'prefs' || id === 'downloads');
                skipBtn.textContent = state.hadSettings ? uiTx('取消') : uiTx('稍后');
                skipBtn.disabled = !!busy;
                if (!state.hadSettings && !busy) {
                    skipBtn.title = uiTx('下次启动仍会打开向导');
                } else {
                    skipBtn.removeAttribute('title');
                }
            }
            if (nextBtn) {
                if (id === 'prefs') {
                    nextBtn.textContent = uiTx('完成');
                    nextBtn.disabled = !!busy;
                } else if (id === 'downloads') {
                    if (busy) {
                        nextBtn.textContent = uiTx('请稍候…');
                        nextBtn.disabled = true;
                    } else {
                        nextBtn.textContent = uiTx('重试');
                        nextBtn.disabled = false;
                    }
                } else if (id === 'prepare') {
                    nextBtn.textContent = uiTx('下一步');
                    nextBtn.disabled = !!busy;
                } else if (id === 'models') {
                    nextBtn.textContent = uiTx('下一步');
                    nextBtn.disabled = !!busy;
                } else if (id === 'needs') {
                    nextBtn.textContent = uiTx('下一步');
                    nextBtn.disabled = !!busy;
                } else {
                    nextBtn.textContent = uiTx('下一步');
                    nextBtn.disabled = !!busy;
                }
            }

            refineNextButton(id, nextBtn);
            onEnterStep(id, state.stepIndex);
        }

        function currentStepId() {
            const state = getState();
            return STEPS[state.stepIndex] || STEPS[0];
        }

        function stepIndexOf(id) {
            return STEPS.indexOf(id);
        }

        return {
            STEPS,
            STEP_TITLES,
            showStep,
            currentStepId,
            stepIndexOf,
            renderProgress,
        };
    }

    return {
        STEPS,
        STEP_TITLES,
        createSetupWizardSteps,
    };
}));
