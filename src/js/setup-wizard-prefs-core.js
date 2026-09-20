/**
 * Setup wizard prefs step: theme, subtitle formats.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardPrefs = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardPrefsFactory(global) {
    /**
     * @param {object} deps
     */
    function createSetupWizardPrefs(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = d.electron;
        const uiTx = d.uiTx || ((t) => t);
        const getState = d.getState || (() => ({}));
        const applyTheme = d.applyTheme || (async () => {});
        const readStoredTheme = d.readStoredTheme || (() => 'light');

        function readThemeFromWizard() {
            const el = typeof document !== 'undefined'
                ? document.querySelector('#setupWizardModal input[name="wizardAppTheme"]:checked')
                : null;
            const v = String(el?.value || '').trim();
            if (v === 'dark' || v === 'light') return v;
            return readStoredTheme() === 'dark' ? 'dark' : 'light';
        }

        function setThemeRadios(theme) {
            const want = theme === 'dark' ? 'dark' : 'light';
            if (typeof document === 'undefined') return;
            document.querySelectorAll('#setupWizardModal input[name="wizardAppTheme"]').forEach((input) => {
                input.checked = input.value === want;
            });
        }

        function readSubFormatsFromWizard() {
            const ids = [
                ['wizardSubFormatSrt', 'srt'],
                ['wizardSubFormatVtt', 'vtt'],
                ['wizardSubFormatAss', 'ass'],
                ['wizardSubFormatLrc', 'lrc'],
            ];
            const out = [];
            for (const [elId, fmt] of ids) {
                if ($(elId)?.checked) out.push(fmt);
            }
            return out.length ? out.join(',') : 'srt';
        }

        function applySubFormatsToWizard(value) {
            const raw = String(value || 'srt').toLowerCase();
            const set = new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
            if (set.has('ass-dual')) set.add('ass');
            const map = {
                wizardSubFormatSrt: 'srt',
                wizardSubFormatVtt: 'vtt',
                wizardSubFormatAss: 'ass',
                wizardSubFormatLrc: 'lrc',
            };
            for (const [elId, fmt] of Object.entries(map)) {
                const el = $(elId);
                if (el) el.checked = set.has(fmt) || (fmt === 'srt' && set.size === 0);
            }
        }

        function syncPrefsToMainForm() {
            const theme = readThemeFromWizard();
            const mainTheme = $('appThemeSelect');
            if (mainTheme) mainTheme.value = theme;

            const formats = readSubFormatsFromWizard();
            try {
                global.TransubPostTaskUi?.applySubFormatsToForm?.(formats);
            } catch { /* ignore */ }
            const map = {
                subFormatSrt: formats.includes('srt'),
                subFormatVtt: formats.includes('vtt'),
                subFormatAss: formats.includes('ass'),
                subFormatLrc: formats.includes('lrc'),
            };
            for (const [id, on] of Object.entries(map)) {
                const el = $(id);
                if (el) el.checked = on;
            }
        }

        function readPrefsPatch() {
            return {
                subFormats: readSubFormatsFromWizard(),
            };
        }

        async function onThemeChange() {
            const theme = readThemeFromWizard();
            await applyTheme(theme);
            setThemeRadios(theme);
            syncPrefsToMainForm();
        }

        function onEnterPrefsStep() {
            const state = getState();
            const form = global.TransubCore?.buildSavedOptionsFromForm?.() || {};
            setThemeRadios(readStoredTheme());
            applySubFormatsToWizard(form.subFormats || state.prefs?.subFormats || 'srt');
            const summary = $('setupWizardPrefsReadySummary');
            if (summary) {
                summary.textContent = uiTx('环境与模型已就绪。可再调整个人偏好，然后点完成。');
            }
        }

        function bindPrefsControls() {
            const themeHost = $('wizardAppThemeList');
            if (themeHost && themeHost.dataset.wizardPrefsThemeBound !== '1') {
                themeHost.dataset.wizardPrefsThemeBound = '1';
                themeHost.addEventListener('change', (ev) => {
                    const input = ev.target?.closest?.('input[name="wizardAppTheme"]');
                    if (!input) return;
                    void onThemeChange();
                });
            }
            ['wizardSubFormatSrt', 'wizardSubFormatVtt', 'wizardSubFormatAss', 'wizardSubFormatLrc']
                .forEach((id) => {
                    const el = $(id);
                    if (el && el.dataset.wizardPrefsFmtBound !== '1') {
                        el.dataset.wizardPrefsFmtBound = '1';
                        el.addEventListener('change', () => syncPrefsToMainForm());
                    }
                });
            const openSettings = $('setupWizardOpenSettingsBtn');
            if (openSettings && openSettings.dataset.wizardPrefsSettingsBound !== '1') {
                openSettings.dataset.wizardPrefsSettingsBound = '1';
                openSettings.addEventListener('click', () => {
                    try {
                        // Downloads already applied — don't force wizard again next launch.
                        global.TransubSetupWizard?.markDone?.()
                            || global.TransubSetupWizardOnboarding?.markWizardCompleted?.();
                        global.TransubSetupWizard?.close?.({ dismiss: false });
                    } catch { /* ignore */ }
                    void electron?.transubOpenSettings?.({ tab: 'runtime' });
                });
            }
        }

        async function savePrefsAndFinish() {
            syncPrefsToMainForm();
            const prefsPatch = readPrefsPatch();
            try {
                const current = global.TransubCore?.buildSavedOptionsFromForm?.() || {};
                const merged = {
                    ...current,
                    ...prefsPatch,
                    saveParams: true,
                };
                const saveRes = await electron?.transWithAiSaveOptions?.(merged);
                if (!saveRes?.ok) throw new Error(saveRes?.error || '保存失败');
                return { ok: true };
            } catch (err) {
                return { ok: false, error: err?.message || String(err) };
            }
        }

        return {
            onEnterPrefsStep,
            bindPrefsControls,
            readPrefsPatch,
            syncPrefsToMainForm,
            readSubFormatsFromWizard,
            savePrefsAndFinish,
            setThemeRadios,
            readThemeFromWizard,
        };
    }

    return { createSetupWizardPrefs };
}));
