/**
 * Setup wizard HF endpoint auto-pick (speed-test official vs mirror).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) global.TransubSetupWizardHfPick = api;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardHfPickFactory(global) {
    const DEFAULT_MIRROR = 'https://hf-mirror.com';

    function formatHfPickStatus(pick) {
        if (!pick) return '下载源将在应用前自动测速选择';
        if (pick.message) return String(pick.message);
        const label = pick.label || (pick.hfEndpoint ? pick.hfEndpoint : '官方 Hub');
        if (pick.fallback) return `测速失败，已回退${label}；可稍后在设置 → 网络调整`;
        const ms = Number.isFinite(pick.latencyMs) ? `（约 ${pick.latencyMs} ms）` : '';
        return `下载源：${label}${ms}`;
    }

    function writeHfEndpointToForm(hfEndpoint) {
        const endpoint = hfEndpoint != null ? String(hfEndpoint).trim().replace(/\/+$/, '') : '';
        if (typeof document === 'undefined') return endpoint;
        const input = document.getElementById('engineHfEndpointInput');
        if (input) input.value = endpoint;
        return endpoint;
    }

    /**
     * @param {{
     *   electron?: object,
     *   getProxyPayload?: () => object,
     *   getStatusEl?: () => HTMLElement|null,
     *   uiTx?: (t: string) => string,
     * }} [deps]
     */
    function createSetupWizardHfPick(deps = {}) {
        const electron = deps.electron || global.__ELECTRON__;
        const getProxyPayload = typeof deps.getProxyPayload === 'function' ? deps.getProxyPayload : () => ({});
        const getStatusEl = typeof deps.getStatusEl === 'function'
            ? deps.getStatusEl
            : () => (typeof document !== 'undefined' ? document.getElementById('setupWizardHfSourceStatus') : null);
        const uiTx = typeof deps.uiTx === 'function' ? deps.uiTx : ((t) => String(t || ''));

        let cache = null;
        let inflight = null;

        function clearCache() {
            cache = null;
        }

        function getCached() {
            return cache;
        }

        function setStatus(text) {
            const el = getStatusEl();
            if (el) el.textContent = uiTx(text);
        }

        async function ensurePicked({ force = false } = {}) {
            if (!force && cache?.hfEndpoint != null) {
                setStatus(formatHfPickStatus(cache));
                return cache;
            }
            if (inflight) return inflight;
            setStatus(uiTx('正在测速选择下载源…'));
            inflight = (async () => {
                let pick;
                try {
                    const payload = {
                        ...getProxyPayload(),
                    };
                    if (electron?.transubPickHfEndpoint) {
                        pick = await electron.transubPickHfEndpoint(payload);
                    }
                } catch (err) {
                    pick = null;
                }
                if (!pick || pick.hfEndpoint == null) {
                    pick = {
                        ok: false,
                        fallback: true,
                        hfEndpoint: DEFAULT_MIRROR,
                        label: '国内镜像',
                        message: '测速失败，已回退国内镜像；可稍后在设置 → 网络调整',
                    };
                }
                writeHfEndpointToForm(pick.hfEndpoint);
                cache = {
                    ok: !!pick.ok,
                    fallback: !!pick.fallback,
                    hfEndpoint: String(pick.hfEndpoint || '').trim().replace(/\/+$/, ''),
                    label: pick.label || '',
                    latencyMs: pick.latencyMs,
                    message: formatHfPickStatus(pick),
                    results: pick.results || [],
                };
                setStatus(cache.message);
                return cache;
            })();
            try {
                return await inflight;
            } finally {
                inflight = null;
            }
        }

        return {
            DEFAULT_MIRROR,
            clearCache,
            getCached,
            ensurePicked,
            formatHfPickStatus,
            writeHfEndpointToForm,
            setStatus,
        };
    }

    return {
        DEFAULT_MIRROR,
        formatHfPickStatus,
        writeHfEndpointToForm,
        createSetupWizardHfPick,
    };
}));
