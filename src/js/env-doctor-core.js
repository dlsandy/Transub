/**
 * Standalone env-doctor window: GPU hard-pass gate UI over TransubEnvCheck.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEnvDoctor = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function envDoctorFactory(global) {
    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneEnvDoctor = pageQuery.get('envDoctor') === '1';
    let localeApi = null;

    function electronApi() {
        return global.__ELECTRON__;
    }

    function envCheckApi() {
        return global.TransubEnvCheck;
    }

    function getLocaleApi() {
        if (localeApi) return localeApi;
        const factory = global.TransubEnvCheckLocale;
        if (!factory?.createEnvCheckLocale) return null;
        localeApi = factory.createEnvCheckLocale({
            getI18n: () => global.TransubI18n,
            getCore: () => global.TransubI18nCore,
            onLocaleApplied: () => {
                decorateDoctorModal();
            },
        });
        return localeApi;
    }

    function uiTx(text) {
        return global.TransubI18n?.tx?.(text) ?? String(text || '');
    }

    function finishBootOverlay() {
        try {
            const overlay = global.document?.getElementById('loadingOverlay');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex', 'is-open');
                overlay.style.display = 'none';
                overlay.setAttribute('hidden', '');
                overlay.setAttribute('aria-hidden', 'true');
            }
        } catch { /* ignore */ }
    }

    function applyDoctorChrome() {
        try {
            if (global.document?.documentElement) {
                global.document.documentElement.classList.add('env-doctor-standalone');
            }
            if (global.document && global.document.title != null) {
                global.document.title = uiTx('字幕工厂 · 使用前环境检测');
            }
        } catch { /* ignore */ }
    }

    function decorateDoctorModal() {
        const title = global.document?.getElementById('envCheckTitle');
        const subtitle = global.document?.getElementById('envCheckSubtitle');
        const startBtn = global.document?.getElementById('envCheckStartBtn');
        const fixBtn = global.document?.getElementById('envCheckFixBtn');
        const quitBtn = global.document?.getElementById('envDoctorQuitBtn');
        if (title) title.textContent = uiTx('使用前环境检测');
        if (subtitle) {
            subtitle.textContent = uiTx('升级后先确认电脑环境。检测时列表会逐项更新；显卡计算库可能需要半分钟到一分半，属正常现象。');
        }
        if (startBtn) startBtn.textContent = uiTx('进入软件');
        if (fixBtn) {
            fixBtn.textContent = uiTx('一键修复');
            fixBtn.title = uiTx('自动下载并安装缺失组件（推荐）');
        }
        if (quitBtn) {
            quitBtn.classList.remove('hidden');
            quitBtn.textContent = uiTx('退出');
        }
        const chipBase = global.document?.getElementById('envCheckChipBase');
        const chipEngine = global.document?.getElementById('envCheckChipEngine');
        const chipAccel = global.document?.getElementById('envCheckChipAccel');
        const setKicker = (chip, text) => {
            const k = chip?.querySelector?.('.settings-env-chip-kicker');
            if (k) k.textContent = text;
        };
        setKicker(chipBase, uiTx('基础'));
        setKicker(chipEngine, uiTx('引擎'));
        setKicker(chipAccel, uiTx('显卡'));
        try { getLocaleApi()?.decorateGateCopy?.(); } catch { /* ignore */ }
        applyDoctorChrome();
    }

    async function ensureUiLocaleBeforeCheck() {
        const api = getLocaleApi();
        if (!api?.ensureLocaleBeforeCheck) return;
        try {
            await global.TransubI18n?.ensureReady?.();
        } catch { /* ignore */ }
        // First run (no explicit choice yet): block on language pick.
        // Later version upgrades: skip gate if user already chose.
        await api.ensureLocaleBeforeCheck({
            force: !api.hasLocaleChosen(),
            preferOs: true,
        });
        decorateDoctorModal();
    }

    async function openDoctorModal() {
        const api = envCheckApi();
        if (!api?.open) return false;
        // Language gate is the first interactive screen. Drop the boot mask
        // before waiting on Continue so it cannot eat the click.
        finishBootOverlay();
        await ensureUiLocaleBeforeCheck();
        decorateDoctorModal();
        getLocaleApi()?.mountCompactBar?.();
        await api.open({
            doctorMode: true,
            afterStart: async () => {
                try {
                    await electronApi()?.transubEnvDoctorPassed?.();
                } catch (err) {
                    console.warn('[env-doctor] passed IPC failed:', err?.message || err);
                }
            },
        });
        finishBootOverlay();
        return true;
    }

    function bindOpenEvents() {
        const electron = electronApi();
        if (electron?.onOpenEnvDoctor) {
            electron.onOpenEnvDoctor(() => { void openDoctorModal(); });
        }
    }

    async function bootStandalone() {
        if (!isStandaloneEnvDoctor) return false;
        applyDoctorChrome();
        bindOpenEvents();

        let attempts = 0;
        const tryOpen = async () => {
            attempts += 1;
            const modal = global.document?.getElementById('envCheckModal');
            const pending = modal?.getAttribute('data-ui-fragment') === 'pending';
            if (!pending && envCheckApi()?.open) {
                await openDoctorModal();
                return;
            }
            if (attempts >= 60) {
                finishBootOverlay();
                return;
            }
            setTimeout(() => { void tryOpen(); }, 80);
        };
        setTimeout(() => { void tryOpen(); }, 120);
        return true;
    }

    if (isStandaloneEnvDoctor) {
        if (global.document?.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', () => { void bootStandalone(); });
        } else {
            setTimeout(() => { void bootStandalone(); }, 0);
        }
        global.addEventListener?.('transub-ui-fragment-ready', (ev) => {
            if (ev?.detail?.key === 'factory-modals') void openDoctorModal();
        });
    }

    return {
        isStandaloneEnvDoctor,
        bootStandalone,
        openDoctorModal,
    };
}));
