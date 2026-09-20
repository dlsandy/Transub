/**
 * Sync Pro 智能翻译「句级专训」mirror select with hidden engineLlmMtModelSelect
 * (canonical persisted pick; not shown under 识别参数).
 * Pure DOM helpers — no IPC.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHybridModelPickSync = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function hybridModelPickSyncFactory() {
    function createOption(value, text, disabled) {
        const doc = typeof globalThis !== 'undefined' ? globalThis.document : undefined;
        if (doc && typeof doc.createElement === 'function') {
            const opt = doc.createElement('option');
            opt.value = value;
            opt.textContent = text;
            opt.disabled = !!disabled;
            return opt;
        }
        return { value, textContent: text, disabled: !!disabled };
    }

    /**
     * Copy options + value from primary → mirror (or vice versa).
     * @param {HTMLSelectElement|null|undefined} from
     * @param {HTMLSelectElement|null|undefined} to
     * @returns {boolean} whether the target was updated
     */
    function copySelectState(from, to) {
        if (!from || !to || from === to) return false;
        const want = String(from.value || '');
        const fromOpts = [...(from.options || [])];
        const toOpts = [...(to.options || [])];
        const sameShape = fromOpts.length === toOpts.length
            && fromOpts.every((o, i) => o.value === toOpts[i]?.value && o.textContent === toOpts[i]?.textContent);
        if (!sameShape) {
            if (typeof to.innerHTML === 'string') to.innerHTML = '';
            if (Array.isArray(to.options)) to.options.length = 0;
            for (const o of fromOpts) {
                const opt = createOption(o.value, o.textContent, o.disabled);
                if (typeof to.appendChild === 'function') to.appendChild(opt);
                else if (Array.isArray(to.options)) to.options.push(opt);
            }
        }
        if (to.value !== want) {
            to.value = want;
            if (to.value !== want && want) {
                const orphan = createOption(want, want, false);
                if (typeof to.appendChild === 'function') to.appendChild(orphan);
                else if (Array.isArray(to.options)) to.options.push(orphan);
                to.value = want;
            }
        }
        to.disabled = !!from.disabled;
        return true;
    }

    /**
     * @param {{ primary?: HTMLSelectElement|null, mirror?: HTMLSelectElement|null }} els
     */
    function syncMirrorFromPrimary(els = {}) {
        return copySelectState(els.primary, els.mirror);
    }

    /**
     * @param {{ primary?: HTMLSelectElement|null, mirror?: HTMLSelectElement|null }} els
     */
    function syncPrimaryFromMirror(els = {}) {
        return copySelectState(els.mirror, els.primary);
    }

    return {
        copySelectState,
        syncMirrorFromPrimary,
        syncPrimaryFromMirror,
    };
}));
