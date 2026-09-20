/**
 * Shared helpers for TransubAppWire* installers (bind API, late bind, entitlement).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireUtilsFactory(global) {
    function getBindApi() {
        return (global && global.TransubAppApiBind)
            || (typeof require === 'function' ? require('./app-api-bind-core.js') : null)
            || {};
    }

    function resolveApi(host, hostKey, globalName) {
        if (host && host[hostKey]) return host[hostKey];
        return (global && global[globalName]) || {};
    }

    function late(host, name) {
        return (...args) => {
            const fn = host[name];
            return typeof fn === 'function' ? fn(...args) : undefined;
        };
    }

    function entitled(h) {
        return typeof h.getAdvancedEntitled === 'function' ? !!h.getAdvancedEntitled() : !!h.advancedEntitled;
    }

    return {
        getBindApi,
        resolveApi,
        late,
        entitled,
    };
}));
