/**
 * Shared PyPI mirror picker for setup-wizard prepare + system-check modal.
 * Session preference only (not settings.json); download jobs read via getPreferred().
 * Progress modal shows status text only (no dropdown).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) global.TransubPipMirrorUi = api;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function pipMirrorUiFactory(global) {
    const CATALOG = Object.freeze([
        Object.freeze({ id: 'aliyun', label: '阿里云' }),
        Object.freeze({ id: 'tsinghua', label: '清华大学' }),
        Object.freeze({ id: 'ustc', label: '中科大' }),
        Object.freeze({ id: 'tencent', label: '腾讯云' }),
        Object.freeze({ id: 'huawei', label: '华为云' }),
        Object.freeze({ id: 'huawei-repo', label: '华为云 (repo)' }),
        Object.freeze({ id: 'netease', label: '网易' }),
        Object.freeze({ id: 'official', label: 'PyPI 官方' }),
    ]);

    const SELECT_IDS = Object.freeze([
        'setupWizardPipMirrorSelect',
        'envCheckPipMirrorSelect',
    ]);

    let preferred = '';
    let bound = false;

    function normalizePreferred(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        const low = raw.toLowerCase();
        if (['auto', 'default', 'probe', '测速', '自动', '自动测速'].includes(low)) {
            return '';
        }
        const hit = CATALOG.find((row) => row.id === low || row.label === raw);
        return hit ? hit.id : raw.replace(/\/+$/, '');
    }

    function labelFor(value) {
        const key = normalizePreferred(value);
        if (!key) return '自动测速';
        const hit = CATALOG.find((row) => row.id === key);
        return hit?.label || key;
    }

    function getPreferred() {
        return preferred;
    }

    function setPreferred(value, { syncDom = true } = {}) {
        preferred = normalizePreferred(value);
        if (syncDom) syncSelectsFromState();
        return preferred;
    }

    function optionHtml(uiTx) {
        const tx = typeof uiTx === 'function' ? uiTx : ((t) => String(t || ''));
        const auto = `<option value="">${tx('自动测速')}</option>`;
        const rest = CATALOG.map((row) => (
            `<option value="${row.id}">${tx(row.label)}</option>`
        )).join('');
        return auto + rest;
    }

    function fillSelect(el, uiTx) {
        if (!el) return;
        const prev = normalizePreferred(el.value || preferred);
        el.innerHTML = optionHtml(uiTx);
        el.value = prev;
        if (el.value !== prev && prev) {
            // Unknown id — keep as empty (auto).
            el.value = '';
        }
    }

    function syncSelectsFromState() {
        if (typeof document === 'undefined') return;
        for (const id of SELECT_IDS) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (!el.options.length) fillSelect(el);
            const want = preferred;
            if (el.value !== want) el.value = want;
        }
    }

    function bindSelects({ uiTx } = {}) {
        if (typeof document === 'undefined') return;
        for (const id of SELECT_IDS) {
            const el = document.getElementById(id);
            if (!el) continue;
            fillSelect(el, uiTx);
            if (el.dataset.pipMirrorBound === '1') continue;
            el.dataset.pipMirrorBound = '1';
            el.addEventListener('change', () => {
                setPreferred(el.value, { syncDom: true });
            });
        }
        bound = true;
        syncSelectsFromState();
    }

    function downloadPayloadPatch() {
        const key = getPreferred();
        return key ? { preferredPipMirror: key } : {};
    }

    function formatActiveMirrorLine(ev, uiTx) {
        const tx = typeof uiTx === 'function' ? uiTx : ((t) => String(t || ''));
        const host = String(ev?.mirror || ev?.raw?.mirror || '').trim();
        if (!host) return '';
        // mirror may be index URL or host
        const short = host.replace(/^https?:\/\//, '').split('/')[0] || host;
        const prefer = getPreferred();
        if (prefer) {
            return tx('下载镜像：{label}（当前 {host}）')
                .replace('{label}', labelFor(prefer))
                .replace('{host}', short);
        }
        return tx('下载镜像：{host}').replace('{host}', short);
    }

    return {
        CATALOG,
        SELECT_IDS,
        normalizePreferred,
        labelFor,
        getPreferred,
        setPreferred,
        fillSelect,
        bindSelects,
        syncSelectsFromState,
        downloadPayloadPatch,
        formatActiveMirrorLine,
        isBound: () => bound,
    };
}));
