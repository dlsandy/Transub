/**
 * Auto-sense job queue — concurrency + deep/quick mutual exclusion.
 * DOM / IPC stay in app.js; this owns queue scheduling only.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSenseQueue = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function senseQueueFactory() {
    const DEFAULT_QUICK = 4;
    const DEFAULT_DEEP = 1;

    /**
     * @param {{
     *   quickLimit?: number,
     *   deepLimit?: number,
     *   isEnabled?: () => boolean,
     *   tryInstant?: (item: object, opts: object) => boolean,
     *   ensurePrefetch?: () => Promise<void>,
     *   runJob: (item: object, opts: object) => Promise<unknown>,
     *   onAfterInstant?: (item: object) => void,
     *   onIdle?: () => void,
     * }} hooks
     */
    function createSenseQueue(hooks = {}) {
        const quickLimit = Math.max(1, Number(hooks.quickLimit) || DEFAULT_QUICK);
        const deepLimit = Math.max(1, Number(hooks.deepLimit) || DEFAULT_DEEP);
        const queue = [];
        let senseRunning = 0;
        let senseDeepRunning = 0;
        let senseModelsPrefetch = null;

        function stats() {
            return {
                queued: queue.length,
                running: senseRunning,
                deepRunning: senseDeepRunning,
            };
        }

        function clearPrefetchIfIdle() {
            if (!senseRunning && !senseDeepRunning && !queue.length) {
                senseModelsPrefetch = null;
            }
        }

        async function ensurePrefetchOnce() {
            if (typeof hooks.ensurePrefetch !== 'function') return;
            if (senseModelsPrefetch) return senseModelsPrefetch;
            senseModelsPrefetch = Promise.resolve()
                .then(() => hooks.ensurePrefetch())
                .catch(() => { /* ignore */ });
            return senseModelsPrefetch;
        }

        function drain() {
            while (queue.length) {
                const peek = queue[0];
                const wantDeep = !!(peek.opts?.deep || peek.opts?.force);
                const limit = wantDeep ? deepLimit : quickLimit;
                const running = wantDeep ? senseDeepRunning : senseRunning;
                if (wantDeep && senseRunning > 0) break;
                if (!wantDeep && senseDeepRunning > 0) break;
                if (running >= limit) break;

                const job = queue.shift();
                if (wantDeep) senseDeepRunning += 1;
                else senseRunning += 1;

                Promise.resolve()
                    .then(() => (wantDeep ? ensurePrefetchOnce() : Promise.resolve()))
                    .then(() => hooks.runJob(job.item, job.opts || {}))
                    .finally(() => {
                        if (wantDeep) senseDeepRunning -= 1;
                        else senseRunning -= 1;
                        clearPrefetchIfIdle();
                        drain();
                        if (!senseRunning && !senseDeepRunning && !queue.length) {
                            try { hooks.onIdle?.(); } catch { /* ignore */ }
                        }
                    });
            }
        }

        function enqueue(item, opts = {}) {
            if (!item) return false;
            const force = !!opts.force;
            if (!force && typeof hooks.isEnabled === 'function' && !hooks.isEnabled()) {
                return false;
            }
            if (!force && !opts.deep && typeof hooks.tryInstant === 'function') {
                try {
                    if (hooks.tryInstant(item, opts)) {
                        try { hooks.onAfterInstant?.(item); } catch { /* ignore */ }
                        return true;
                    }
                } catch { /* fall through to queue */ }
            }
            queue.push({ item, opts });
            drain();
            return true;
        }

        return {
            enqueue,
            drain,
            stats,
            clearPrefetchIfIdle,
            /** @internal test helper */
            _queue: queue,
        };
    }

    /**
     * Pure gate: whether the next peek job can start given running counters.
     * @returns {{ canStart: boolean, wantDeep: boolean }}
     */
    function evaluateSenseDrainGate(peek, state = {}, limits = {}) {
        const wantDeep = !!(peek?.opts?.deep || peek?.opts?.force);
        const quickLimit = Math.max(1, Number(limits.quickLimit) || DEFAULT_QUICK);
        const deepLimit = Math.max(1, Number(limits.deepLimit) || DEFAULT_DEEP);
        const senseRunning = Number(state.senseRunning) || 0;
        const senseDeepRunning = Number(state.senseDeepRunning) || 0;
        const limit = wantDeep ? deepLimit : quickLimit;
        const running = wantDeep ? senseDeepRunning : senseRunning;
        if (wantDeep && senseRunning > 0) return { canStart: false, wantDeep };
        if (!wantDeep && senseDeepRunning > 0) return { canStart: false, wantDeep };
        if (running >= limit) return { canStart: false, wantDeep };
        return { canStart: true, wantDeep };
    }

    return {
        SENSE_CONCURRENCY_QUICK: DEFAULT_QUICK,
        SENSE_CONCURRENCY_DEEP: DEFAULT_DEEP,
        createSenseQueue,
        evaluateSenseDrainGate,
    };
}));
