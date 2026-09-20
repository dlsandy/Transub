/**
 * CLI command modal UI (preview / open / close).
 * Pure command builders live in TransubCliCommand; inject via deps.cliCommandApi.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubCliCommandUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function cliCommandUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createCliCommandUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const cliCommandApi = d.cliCommandApi
            || (global && global.TransubCliCommand)
            || {};
        const getSelectedItems = d.getSelectedItems || (() => []);
        const queryCheckedKind = d.queryCheckedKind || (() => {
            const checked = typeof document !== 'undefined'
                ? document.querySelector('input[name="cliCommandKind"]:checked')
                : null;
            return checked?.value || 'regular';
        });

        let cliCommandLauncherCache = null;

        function readCliCommandKindFromModal() {
            const raw = queryCheckedKind();
            return cliCommandApi.normalizeCliKind
                ? cliCommandApi.normalizeCliKind(raw)
                : String(raw || 'regular');
        }

        function selectedMediaPathsForCli() {
            return getSelectedItems()
                .map((item) => String(item?.path || '').trim())
                .filter(Boolean);
        }

        async function ensureCliCommandLauncher() {
            if (cliCommandLauncherCache) return cliCommandLauncherCache;
            try {
                const res = await electron?.transubGetCliLauncher?.();
                if (res?.ok) {
                    cliCommandLauncherCache = res;
                    return res;
                }
            } catch (_) { /* ignore */ }
            return { packaged: true, transubExe: 'D:\\Transub\\transub.exe' };
        }

        function renderCliCommandPreview(launcher, kind) {
            const build = cliCommandApi.buildCliCommand
                || ((k, l, paths) => (k === 'jasna'
                    ? cliCommandApi.buildJasnaTransubCommand?.(l)
                    : cliCommandApi.buildRegularTransubCommand?.(l, paths)));
            const payload = build(kind, launcher, selectedMediaPathsForCli()) || {};
            if (els.cliCommandHint) {
                els.cliCommandHint.textContent = String(payload.hint || '');
            }
            if (els.cliCommandText) {
                els.cliCommandText.value = String(payload.command || '');
            }
            const showJasna = kind === 'jasna';
            els.cliCommandJasnaExampleWrap?.classList.toggle('hidden', !showJasna);
            if (els.cliCommandJasnaExample) {
                els.cliCommandJasnaExample.value = showJasna
                    ? String(payload.cliExample || '')
                    : '';
            }
        }

        async function refreshCliCommandPreview() {
            const launcher = await ensureCliCommandLauncher();
            renderCliCommandPreview(launcher, readCliCommandKindFromModal());
        }

        function closeCliCommandModal() {
            els.cliCommandModal?.classList.add('hidden');
            els.cliCommandModal?.classList.remove('flex');
        }

        async function openCliCommandModal() {
            if (!els.cliCommandModal) return;
            els.cliCommandModal.classList.remove('hidden');
            els.cliCommandModal.classList.add('flex');
            await refreshCliCommandPreview();
            try { els.copyCliCommandBtn?.focus?.({ preventScroll: true }); } catch (_) { /* ignore */ }
        }

        function clearLauncherCache() {
            cliCommandLauncherCache = null;
        }

        return {
            readCliCommandKindFromModal,
            selectedMediaPathsForCli,
            ensureCliCommandLauncher,
            renderCliCommandPreview,
            refreshCliCommandPreview,
            closeCliCommandModal,
            openCliCommandModal,
            clearLauncherCache,
        };
    }

    return { createCliCommandUi };
}));
