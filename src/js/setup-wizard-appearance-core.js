/**
 * Setup wizard appearance step: UI locale (radio list) + app theme (immediate apply).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardAppearance = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardAppearanceFactory(global) {
    /**
     * @param {object} deps
     */
    function createSetupWizardAppearance(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = d.electron;
        const getI18n = d.getI18n || (() => global.TransubI18n);
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const onLocaleApplied = typeof d.onLocaleApplied === 'function' ? d.onLocaleApplied : () => {};
        let applyingLocale = false;

        function readStoredTheme() {
            try {
                const t = String(
                    global.localStorage?.getItem('transub.mainTheme')
                    || global.localStorage?.getItem('transub-editor-theme')
                    || 'light',
                ).trim();
                return t === 'dark' ? 'dark' : 'light';
            } catch {
                return 'light';
            }
        }

        function syncThemeStorage(theme) {
            const t = theme === 'dark' ? 'dark' : 'light';
            try {
                global.localStorage?.setItem('transub.mainTheme', t);
                global.localStorage?.setItem('transub-editor-theme', t);
            } catch { /* ignore */ }
            return t;
        }

        function setThemeRadios(theme) {
            const want = theme === 'dark' ? 'dark' : 'light';
            if (typeof document === 'undefined') return;
            document.querySelectorAll('#setupWizardModal input[name="wizardAppTheme"]').forEach((input) => {
                input.checked = input.value === want;
            });
        }

        function currentLocale() {
            const i18n = getI18n();
            return i18n?.getLocale?.()
                || i18n?.normalizeUiLocale?.(global.localStorage?.getItem?.('transub.uiLocale'))
                || 'zh-Hans';
        }

        function listLocaleEntries() {
            const i18n = getI18n();
            const core = global.TransubI18nCore;
            if (typeof i18n?.listUiLocales === 'function') {
                return i18n.listUiLocales({ enabledOnly: true }) || [];
            }
            if (typeof core?.listUiLocales === 'function') {
                return core.listUiLocales({ enabledOnly: true }) || [];
            }
            return (i18n?.UI_LOCALES || core?.UI_LOCALES || ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko'])
                .map((id) => ({ id, nativeName: id }));
        }

        function localeOptionLabel(entry) {
            const i18n = getI18n();
            const id = entry?.id || '';
            const key = `settings.uiLocale.locale.${id}`;
            // Prefer catalog label; fall back to native name so the list stays readable
            // even before catalogs finish loading.
            return i18n?.t?.(key) || entry?.nativeName || id;
        }

        function renderLocaleList(selected) {
            const host = $('wizardUiLocaleList');
            if (!host) return;
            const want = getI18n()?.normalizeUiLocale?.(selected) || currentLocale();
            const entries = listLocaleEntries();
            host.innerHTML = entries.map((entry) => {
                const id = String(entry.id || '').trim();
                if (!id) return '';
                const checked = id === want ? 'checked' : '';
                const label = localeOptionLabel(entry);
                return `<label class="wizard-choice">
                    <input type="radio" name="wizardUiLocale" value="${id}" class="mt-0.5" ${checked}>
                    <span><span class="font-medium text-gray-800">${label}</span>
                    <span class="block text-xs text-gray-500 mt-0.5">${entry.nativeName && entry.nativeName !== label ? entry.nativeName : ''}</span></span>
                </label>`;
            }).join('');
            // Clear empty secondary lines
            host.querySelectorAll('.wizard-choice .text-xs').forEach((el) => {
                if (!String(el.textContent || '').trim()) el.remove();
            });
        }

        function syncAppearanceControls() {
            const i18n = getI18n();
            const locale = currentLocale();
            renderLocaleList(locale);
            setThemeRadios(readStoredTheme());
            const mainLocale = $('uiLocaleSelect');
            if (mainLocale && i18n?.fillUiLocaleSelect) {
                i18n.fillUiLocaleSelect(mainLocale, { selected: locale });
                mainLocale.value = locale;
            } else if (mainLocale) {
                mainLocale.value = locale;
            }
            const mainTheme = $('appThemeSelect');
            if (mainTheme) mainTheme.value = readStoredTheme();
        }

        async function applyUiLocale(raw) {
            if (applyingLocale) return currentLocale();
            const i18n = getI18n();
            const next = i18n?.normalizeUiLocale?.(raw) || String(raw || 'zh-Hans').trim() || 'zh-Hans';
            const prev = currentLocale();
            applyingLocale = true;
            try {
                if (i18n?.setLocale) {
                    await i18n.setLocale(next, { apply: true, persist: true });
                } else {
                    try { global.localStorage?.setItem('transub.uiLocale', next); } catch { /* ignore */ }
                }
                // Force a second DOM pass: first switch may leave non-CJK live text that
                // still needs re-translation from stored Hans originals.
                try { i18n?.applyLocale?.(global.document); } catch { /* ignore */ }

                const mainLocale = $('uiLocaleSelect');
                if (mainLocale) {
                    i18n?.fillUiLocaleSelect?.(mainLocale, { selected: next });
                    mainLocale.value = next;
                }
                try {
                    const core = global.TransubCore;
                    const current = core?.buildSavedOptionsFromForm?.() || {};
                    if (core?.applyOptionsToForm) {
                        core.applyOptionsToForm({ ...current, uiLocale: next }, { applyUiMode: false });
                    }
                    markSettingsDirty();
                } catch { /* ignore */ }

                renderLocaleList(next);
                onLocaleApplied(next, prev);
                return next;
            } finally {
                applyingLocale = false;
            }
        }

        async function applyAppTheme(raw) {
            const theme = syncThemeStorage(raw);
            try {
                if (typeof document !== 'undefined') {
                    document.documentElement.classList.toggle('main-theme-dark', theme === 'dark');
                    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
                }
            } catch { /* ignore */ }
            try {
                await electron?.transubSetAppTheme?.({ theme });
            } catch { /* ignore */ }
            setThemeRadios(theme);
            const mainTheme = $('appThemeSelect') || $('editorThemeSelect');
            if (mainTheme) mainTheme.value = theme;
            return theme;
        }

        function bindAppearanceControls() {
            const host = $('wizardUiLocaleList');
            if (host && host.dataset.wizardBound !== '1') {
                host.dataset.wizardBound = '1';
                host.addEventListener('change', (event) => {
                    const input = event.target?.closest?.('input[name="wizardUiLocale"]');
                    if (!input || input.disabled) return;
                    void applyUiLocale(input.value);
                });
            }
        }

        function onEnterAppearanceStep() {
            syncAppearanceControls();
            bindAppearanceControls();
        }

        return {
            syncAppearanceControls,
            renderLocaleList,
            applyUiLocale,
            applyAppTheme,
            bindAppearanceControls,
            onEnterAppearanceStep,
            readStoredTheme,
            currentLocale,
        };
    }

    return { createSetupWizardAppearance };
}));
