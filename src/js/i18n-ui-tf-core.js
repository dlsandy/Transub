/**
 * Shared UI template formatter (renderer). Prefer TransubI18n.tf when booted.
 * Do not assign this function onto TransubI18n.tf (would recurse).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubUiTf = api.formatUiTf;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function uiTfFactory(global) {
    function fallbackTf(template, vars) {
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }

    function formatUiTf(template, vars) {
        try {
            const i18n = global && global.TransubI18n;
            if (i18n && typeof i18n.tf === 'function') return i18n.tf(template, vars);
        } catch { /* ignore */ }
        return fallbackTf(template, vars);
    }

    return { formatUiTf, fallbackTf };
}));
