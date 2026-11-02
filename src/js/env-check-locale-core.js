/**
 * Env-check / env-doctor UI locale gate: pick interface language before system check.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEnvCheckLocale = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function envCheckLocaleFactory(global) {
    const CHOSEN_KEY = 'transub.uiLocaleChosen';

    /**
     * @param {object} [deps]
     */
    function createEnvCheckLocale(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const getI18n = d.getI18n || (() => global.TransubI18n);
        const getCore = d.getCore || (() => global.TransubI18nCore);
        const getNavigator = d.getNavigator || (() => global.navigator);
        const onLocaleApplied = typeof d.onLocaleApplied === 'function' ? d.onLocaleApplied : () => {};
        let applyingLocale = false;
        let boundContinueBtn = null;
        let boundLocaleHost = null;
        let continueResolver = null;
        /** @type {Promise<string>|null} */
        let pendingEnsure = null;

        function uiTx(text) {
            return getI18n()?.tx?.(text) ?? String(text || '');
        }

        function currentLocale() {
            const i18n = getI18n();
            const core = getCore();
            return i18n?.getLocale?.()
                || core?.normalizeUiLocale?.(global.localStorage?.getItem?.('transub.uiLocale'))
                || core?.DEFAULT_UI_LOCALE
                || 'zh-Hans';
        }

        function markLocaleChosen() {
            try { global.localStorage?.setItem(CHOSEN_KEY, '1'); } catch { /* ignore */ }
        }

        function hasLocaleChosen() {
            try {
                return global.localStorage?.getItem(CHOSEN_KEY) === '1';
            } catch {
                return false;
            }
        }

        function suggestLocaleFromOs() {
            const core = getCore();
            const nav = getNavigator() || {};
            const candidates = [];
            if (Array.isArray(nav.languages)) candidates.push(...nav.languages);
            if (nav.language) candidates.push(nav.language);
            if (nav.userLanguage) candidates.push(nav.userLanguage);
            for (const raw of candidates) {
                const n = core?.normalizeUiLocale?.(raw);
                if (n && n !== (core?.DEFAULT_UI_LOCALE || 'zh-Hans')) return n;
                // Accept zh-Hans when OS is explicitly Chinese
                const lower = String(raw || '').toLowerCase();
                if (lower.startsWith('zh')) return n || 'zh-Hans';
            }
            return currentLocale();
        }

        function listLocaleEntries() {
            const i18n = getI18n();
            const core = getCore();
            if (typeof i18n?.listUiLocales === 'function') {
                return i18n.listUiLocales({ enabledOnly: true }) || [];
            }
            if (typeof core?.listUiLocales === 'function') {
                return core.listUiLocales({ enabledOnly: true }) || [];
            }
            return (i18n?.UI_LOCALES || core?.UI_LOCALES || ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko'])
                .map((id) => ({ id, nativeName: id }));
        }

        function setVisible(el, on) {
            if (!el) return;
            if (on) {
                el.classList.remove('hidden');
                el.removeAttribute('hidden');
            } else {
                el.classList.add('hidden');
                el.setAttribute('hidden', '');
            }
        }

        function decorateGateCopy() {
            const title = $('envCheckLocaleTitle');
            const hint = $('envCheckLocaleHint');
            const btn = $('envCheckLocaleContinueBtn');
            if (title) title.textContent = uiTx('选择界面语言');
            if (hint) {
                hint.textContent = uiTx('请选择软件显示语言。界面语言与成片字幕语言无关。');
            }
            if (btn) btn.textContent = uiTx('继续');
        }

        function renderLocaleList(selected) {
            const host = $('envCheckUiLocaleList');
            if (!host) return;
            const i18n = getI18n();
            const core = getCore();
            const want = i18n?.normalizeUiLocale?.(selected)
                || core?.normalizeUiLocale?.(selected)
                || currentLocale();
            const entries = listLocaleEntries();
            host.innerHTML = entries.map((entry) => {
                const id = String(entry.id || '').trim();
                if (!id) return '';
                const checked = id === want ? 'checked' : '';
                const native = entry.nativeName || id;
                return `<label class="env-check-locale-choice">
                    <input type="radio" name="envCheckUiLocale" value="${id}" class="mt-0.5" ${checked}>
                    <span class="font-medium text-gray-800">${native}</span>
                </label>`;
            }).join('');
        }

        function syncCompactSelect(selected) {
            const select = $('envCheckUiLocaleSelect');
            if (!select) return;
            const i18n = getI18n();
            const want = i18n?.normalizeUiLocale?.(selected) || currentLocale();
            if (typeof i18n?.fillUiLocaleSelect === 'function') {
                i18n.fillUiLocaleSelect(select, { selected: want });
            } else {
                select.value = want;
            }
        }

        async function applyUiLocale(raw, { commit = false } = {}) {
            if (applyingLocale) return currentLocale();
            const i18n = getI18n();
            const core = getCore();
            const next = i18n?.normalizeUiLocale?.(raw)
                || core?.normalizeUiLocale?.(raw)
                || String(raw || 'zh-Hans').trim()
                || 'zh-Hans';
            const prev = currentLocale();
            applyingLocale = true;
            try {
                if (i18n?.setLocale) {
                    await i18n.setLocale(next, { apply: true, persist: true });
                } else {
                    try { global.localStorage?.setItem('transub.uiLocale', next); } catch { /* ignore */ }
                }
                try { i18n?.applyLocale?.(global.document); } catch { /* ignore */ }

                const mainLocale = $('uiLocaleSelect');
                if (mainLocale) {
                    i18n?.fillUiLocaleSelect?.(mainLocale, { selected: next });
                    mainLocale.value = next;
                }
                try {
                    const appCore = global.TransubCore;
                    const current = appCore?.buildSavedOptionsFromForm?.() || {};
                    if (appCore?.applyOptionsToForm) {
                        appCore.applyOptionsToForm({ ...current, uiLocale: next }, { applyUiMode: false });
                    }
                } catch { /* ignore */ }

                if (commit) markLocaleChosen();
                renderLocaleList(next);
                syncCompactSelect(next);
                decorateGateCopy();
                onLocaleApplied(next, prev);
                return next;
            } finally {
                applyingLocale = false;
            }
        }

        function showGate() {
            const modal = $('envCheckModal');
            const gate = $('envCheckLocaleGate');
            const main = $('envCheckMainPane');
            if (!gate || !main) return false;
            if (modal) {
                modal.classList.remove('hidden');
                modal.removeAttribute('hidden');
                modal.setAttribute('aria-hidden', 'false');
                modal.classList.add('env-check-locale-picking');
                try {
                    if (modal.parentElement === document.body) {
                        document.body.appendChild(modal);
                    }
                } catch { /* ignore */ }
            }
            setVisible(gate, true);
            setVisible(main, false);
            return true;
        }

        function hideGate() {
            const modal = $('envCheckModal');
            const gate = $('envCheckLocaleGate');
            const main = $('envCheckMainPane');
            modal?.classList.remove('env-check-locale-picking');
            setVisible(gate, false);
            setVisible(main, true);
            const bar = $('envCheckLocaleBar');
            setVisible(bar, true);
        }

        function onContinueClick() {
            const host = $('envCheckUiLocaleList');
            const checked = host?.querySelector?.('input[name="envCheckUiLocale"]:checked');
            const value = checked?.value || currentLocale();
            // Leave the gate immediately. Locale apply already ran for the
            // preselected / radio choice; awaiting setLocale here can hang on
            // a full-document pass and leave the user stuck on this screen.
            markLocaleChosen();
            hideGate();
            const resolve = continueResolver;
            continueResolver = null;
            if (resolve) resolve(currentLocale());
            void applyUiLocale(value, { commit: true }).catch((err) => {
                console.warn('[env-check-locale] apply failed:', err?.message || err);
            });
        }

        function bindGateControls() {
            const host = $('envCheckUiLocaleList');
            if (host && host !== boundLocaleHost) {
                boundLocaleHost = host;
                host.addEventListener('change', (event) => {
                    const input = event.target?.closest?.('input[name="envCheckUiLocale"]');
                    if (!input || input.disabled) return;
                    void applyUiLocale(input.value, { commit: false });
                });
            }
            const continueBtn = $('envCheckLocaleContinueBtn');
            if (continueBtn && continueBtn !== boundContinueBtn) {
                boundContinueBtn = continueBtn;
                continueBtn.addEventListener('click', onContinueClick);
            }
            const select = $('envCheckUiLocaleSelect');
            if (select && select.dataset.localeBound !== '1') {
                select.dataset.localeBound = '1';
                select.addEventListener('change', () => {
                    void applyUiLocale(select.value, { commit: true });
                });
            }
        }

        /**
         * Show language gate before system check (env-doctor first-run).
         * Resolves after the user clicks Continue.
         * @param {{ force?: boolean, preferOs?: boolean }} [opts]
         */
        function ensureLocaleBeforeCheck(opts = {}) {
            if (pendingEnsure) return pendingEnsure;
            pendingEnsure = runEnsureLocaleBeforeCheck(opts).finally(() => {
                pendingEnsure = null;
            });
            return pendingEnsure;
        }

        async function runEnsureLocaleBeforeCheck(opts = {}) {
            const force = opts.force !== false;
            const preferOs = opts.preferOs !== false;
            bindGateControls();

            if (!force && hasLocaleChosen()) {
                hideGate();
                syncCompactSelect(currentLocale());
                return currentLocale();
            }

            const gate = $('envCheckLocaleGate');
            const main = $('envCheckMainPane');
            if (!gate || !main) {
                return currentLocale();
            }

            let initial = currentLocale();
            if (preferOs && !hasLocaleChosen()) {
                initial = suggestLocaleFromOs();
            }
            try {
                await applyUiLocale(initial);
            } catch (err) {
                console.warn('[env-check-locale] preview apply failed:', err?.message || err);
            }
            decorateGateCopy();
            renderLocaleList(initial);
            showGate();

            return new Promise((resolve) => {
                continueResolver = resolve;
            });
        }

        function mountCompactBar() {
            bindGateControls();
            hideGate();
            syncCompactSelect(currentLocale());
            setVisible($('envCheckLocaleBar'), true);
        }

        return {
            CHOSEN_KEY,
            currentLocale,
            hasLocaleChosen,
            markLocaleChosen,
            suggestLocaleFromOs,
            renderLocaleList,
            applyUiLocale,
            ensureLocaleBeforeCheck,
            mountCompactBar,
            showGate,
            hideGate,
            decorateGateCopy,
        };
    }

    return {
        CHOSEN_KEY,
        createEnvCheckLocale,
    };
}));
