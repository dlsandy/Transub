/**
 * Tiny pure helpers for assembling themed shell deps bags.
 * No business logic — pick / merge / session getter bags only.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppShellDeps = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appShellDepsFactory() {
    /**
     * Pick listed keys from a source object into a new bag.
     * @param {object} source
     * @param {string[]} keys
     * @returns {object}
     */
    function pickDeps(source, keys) {
        const out = {};
        const src = source && typeof source === 'object' ? source : {};
        const list = Array.isArray(keys) ? keys : [];
        for (const key of list) {
            if (key == null || key === '') continue;
            if (Object.prototype.hasOwnProperty.call(src, key)) {
                out[key] = src[key];
            }
        }
        return out;
    }

    /**
     * Normalize a session getter bag. Accepts `{ name: () => value }` maps
     * and returns the same object (pass-through) when already valid.
     * Non-function values are wrapped as getters.
     * @param {Record<string, any>} defs
     * @returns {Record<string, Function>}
     */
    function sessionGetters(defs) {
        const out = {};
        const src = defs && typeof defs === 'object' ? defs : {};
        for (const key of Object.keys(src)) {
            const val = src[key];
            out[key] = typeof val === 'function' ? val : (() => val);
        }
        return out;
    }

    /**
     * Shallow-merge deps bags (later bags win).
     * @param {...object} bags
     * @returns {object}
     */
    function mergeDeps(...bags) {
        return Object.assign({}, ...bags.filter((b) => b && typeof b === 'object'));
    }

    return { pickDeps, sessionGetters, mergeDeps };
}));
