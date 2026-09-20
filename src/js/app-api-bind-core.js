/**
 * Bind shell API method names to thin local wrappers.
 * Also: lazy createX caches + module method binding with optional missing logs.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppApiBind = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appApiBindFactory() {
    /**
     * @param {() => object|null|undefined} getApi
     * @param {string[]} names
     * @param {Record<string, (v: any) => any>} [coerce]
     */
    function bindApiMethods(getApi, names, coerce = {}) {
        const out = {};
        const list = Array.isArray(names) ? names : [];
        for (const name of list) {
            const key = String(name || '').trim();
            if (!key) continue;
            const c = coerce && typeof coerce[key] === 'function' ? coerce[key] : null;
            out[key] = (...args) => {
                const apiObj = typeof getApi === 'function' ? getApi() : getApi;
                if (!apiObj || typeof apiObj[key] !== 'function') return undefined;
                const result = apiObj[key](...args);
                if (!c) return result;
                // Async methods return a Promise; !!promise is always true and would
                // break callers that `await` the bound wrapper (e.g. browse-only).
                if (result != null && typeof result.then === 'function') {
                    return result.then((v) => c(v));
                }
                return c(result);
            };
        }
        return out;
    }

    /**
     * @param {(method: string, ...args: any[]) => any} callFn
     * @param {string[]} names
     * @param {Record<string, (v: any) => any>} [coerce]
     */
    function bindCallMethods(callFn, names, coerce = {}) {
        const out = {};
        const list = Array.isArray(names) ? names : [];
        for (const name of list) {
            const key = String(name || '').trim();
            if (!key) continue;
            const c = coerce && typeof coerce[key] === 'function' ? coerce[key] : null;
            out[key] = (...args) => {
                const result = callFn(key, ...args);
                if (!c) return result;
                if (result != null && typeof result.then === 'function') {
                    return result.then((v) => c(v));
                }
                return c(result);
            };
        }
        return out;
    }

    /**
     * Cache a create*(deps) instance. getCreate/getDeps run on first use.
     * @param {() => ((deps: object) => object)|null|undefined} getCreate
     * @param {() => object} getDeps
     * @returns {() => object|null}
     */
    function createLazyFactory(getCreate, getDeps) {
        let cached = null;
        let created = false;
        return function getLazyInstance() {
            if (created) return cached;
            const create = typeof getCreate === 'function' ? getCreate() : getCreate;
            if (typeof create !== 'function') {
                created = true;
                cached = null;
                return null;
            }
            const deps = typeof getDeps === 'function' ? getDeps() : (getDeps || {});
            cached = create(deps);
            created = true;
            return cached;
        };
    }

    /**
     * Like bindApiMethods, but logs once per missing method when onMissing is set.
     * @param {() => object|null|undefined} getApi
     * @param {string[]} names
     * @param {{
     *   coerce?: Record<string, (v: any) => any>,
     *   onMissing?: (method: string) => void,
     *   missingDefault?: any,
     * }} [opts]
     */
    function bindModuleMethods(getApi, names, opts = {}) {
        const coerce = opts.coerce || {};
        const onMissing = typeof opts.onMissing === 'function' ? opts.onMissing : null;
        const hasDefault = Object.prototype.hasOwnProperty.call(opts, 'missingDefault');
        const out = {};
        const list = Array.isArray(names) ? names : [];
        for (const name of list) {
            const key = String(name || '').trim();
            if (!key) continue;
            const c = typeof coerce[key] === 'function' ? coerce[key] : null;
            out[key] = (...args) => {
                const apiObj = typeof getApi === 'function' ? getApi() : getApi;
                if (!apiObj || typeof apiObj[key] !== 'function') {
                    if (onMissing) onMissing(key);
                    return hasDefault ? opts.missingDefault : undefined;
                }
                const result = apiObj[key](...args);
                if (!c) return result;
                if (result != null && typeof result.then === 'function') {
                    return result.then((v) => c(v));
                }
                return c(result);
            };
        }
        return out;
    }

    /**
     * Bind module methods and warn with a fixed message when the module is missing.
     * @param {() => object|null|undefined} getApi
     * @param {string[]} names
     * @param {{
     *   coerce?: Record<string, (v: any) => any>,
     *   missingMessage?: string,
     *   appendLog?: (msg: string, tone?: string) => void,
     * }} [opts]
     */
    function bindModuleMethodsWithLog(getApi, names, opts = {}) {
        const msg = String(opts.missingMessage || '').trim();
        const appendLog = typeof opts.appendLog === 'function' ? opts.appendLog : null;
        let warned = false;
        return bindModuleMethods(getApi, names, {
            coerce: opts.coerce,
            onMissing: msg && appendLog
                ? () => {
                    if (warned) return;
                    warned = true;
                    appendLog(msg, 'err');
                }
                : null,
        });
    }

    /**
     * Install createLazyFactory + bindModuleMethods onto a host under given keys.
     * @param {object} host
     * @param {{
     *   apiKey: string,
     *   createName: string,
     *   getDeps: () => object,
     *   methodNames: string[],
     *   coerce?: Record<string, (v: any) => any>,
     *   missingMessage?: string,
     *   getterName?: string,
     * }} spec
     */
    function installLazyModule(host, spec) {
        const h = host || {};
        const apiBag = h[spec.apiKey] || {};
        const createName = spec.createName;
        const getterName = spec.getterName || `get${createName.replace(/^create/, '')}`;
        const getInstance = createLazyFactory(
            () => apiBag[createName],
            typeof spec.getDeps === 'function' ? spec.getDeps : () => ({}),
        );
        h[getterName] = getInstance;
        const bound = bindModuleMethodsWithLog(getInstance, spec.methodNames || [], {
            coerce: spec.coerce,
            missingMessage: spec.missingMessage,
            appendLog: (...args) => {
                if (typeof h.appendLog === 'function') return h.appendLog(...args);
                return undefined;
            },
        });
        Object.assign(h, bound);
        return bound;
    }

    return {
        bindApiMethods,
        bindCallMethods,
        createLazyFactory,
        bindModuleMethods,
        bindModuleMethodsWithLog,
        installLazyModule,
    };
}));
