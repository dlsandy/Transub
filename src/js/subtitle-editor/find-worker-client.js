/**
 * 主线程查找 Worker 包装：失败时回退同步扫描
 */
(function (global) {
    function createFindWorkerClient(options = {}) {
        let worker = null;
        let seq = 0;
        const pending = new Map();
        const workerUrl = options.workerUrl || 'js/subtitle-find-worker.js';
        const findCore = options.findCore || global.TransubFindReplace;

        function ensureWorker() {
            if (worker) return worker;
            if (typeof Worker === 'undefined') return null;
            try {
                worker = new Worker(workerUrl);
                worker.onmessage = (ev) => {
                    const msg = ev.data || {};
                    const wait = pending.get(msg.id);
                    if (!wait) return;
                    pending.delete(msg.id);
                    if (msg.ok) wait.resolve(msg);
                    else wait.reject(new Error(msg.error || '查找 Worker 失败'));
                };
                worker.onerror = () => {
                    try { worker.terminate(); } catch (_) { /* ignore */ }
                    worker = null;
                    for (const [, wait] of pending) {
                        wait.reject(new Error('查找 Worker 崩溃'));
                    }
                    pending.clear();
                };
                return worker;
            } catch (_) {
                worker = null;
                return null;
            }
        }

        function collectSync(cues, query, caseSensitive) {
            const api = findCore || global.TransubFindReplace;
            if (api?.collectFindMatches) {
                return api.collectFindMatches(cues, query, caseSensitive);
            }
            return [];
        }

        async function collectFindMatchesAsync(cues, query, caseSensitive, meta = {}) {
            const list = Array.isArray(cues) ? cues : [];
            const abortId = meta.abortId;
            const isAborted = typeof meta.isAborted === 'function'
                ? meta.isAborted
                : () => false;
            const threshold = options.threshold
                || findCore?.WORKER_THRESHOLD
                || 200;
            if (list.length < threshold) {
                if (isAborted()) return [];
                return collectSync(list, query, caseSensitive);
            }
            const w = ensureWorker();
            if (!w) {
                if (isAborted()) return [];
                return collectSync(list, query, caseSensitive);
            }
            // Supersede older in-flight find jobs so stale matches are not applied.
            for (const [oldId, wait] of pending) {
                pending.delete(oldId);
                try { wait.reject(new Error('find superseded')); } catch (_) { /* ignore */ }
            }
            const id = `find_${Date.now()}_${seq++}`;
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    if (isAborted()) {
                        resolve([]);
                        return;
                    }
                    resolve(collectSync(list, query, caseSensitive));
                }, options.timeoutMs || 8000);
                pending.set(id, {
                    abortId,
                    resolve: (msg) => {
                        clearTimeout(timer);
                        if (isAborted()) {
                            resolve([]);
                            return;
                        }
                        resolve(Array.isArray(msg.matches) ? msg.matches : []);
                    },
                    reject: () => {
                        clearTimeout(timer);
                        if (isAborted()) {
                            resolve([]);
                            return;
                        }
                        resolve(collectSync(list, query, caseSensitive));
                    },
                });
                try {
                    w.postMessage({
                        id,
                        type: 'find',
                        abortId,
                        cues: list.map((c) => ({ text: c?.text ?? '' })),
                        query,
                        caseSensitive: !!caseSensitive,
                    });
                } catch (_) {
                    clearTimeout(timer);
                    pending.delete(id);
                    if (isAborted()) {
                        resolve([]);
                        return;
                    }
                    resolve(collectSync(list, query, caseSensitive));
                }
            });
        }

        function dispose() {
            if (worker) {
                try { worker.terminate(); } catch (_) { /* ignore */ }
                worker = null;
            }
            pending.clear();
        }

        return {
            collectFindMatchesAsync,
            collectSync,
            dispose,
            get hasWorker() { return !!worker; },
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.createFindWorkerClient = createFindWorkerClient;
}(typeof globalThis !== 'undefined' ? globalThis : window));
