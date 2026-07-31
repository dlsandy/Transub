/**
 * 主线程 QC Worker 包装：失败时回退同步扫描
 */
(function (global) {
    function createQcWorkerClient(options = {}) {
        let worker = null;
        let seq = 0;
        const pending = new Map();
        const workerUrl = options.workerUrl || 'js/subtitle-qc-worker.js';

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
                    else wait.reject(new Error(msg.error || 'QC Worker 失败'));
                };
                worker.onerror = () => {
                    try { worker.terminate(); } catch (_) { /* ignore */ }
                    worker = null;
                    for (const [, wait] of pending) {
                        wait.reject(new Error('QC Worker 崩溃'));
                    }
                    pending.clear();
                };
                return worker;
            } catch (_) {
                worker = null;
                return null;
            }
        }

        function scanSync(cues, scanOptions, qcCore) {
            const qc = qcCore || global.TransubSubtitleQc;
            if (!qc?.scanCueIssues) throw new Error('QC 模块不可用');
            return qc.scanCueIssues(cues || [], scanOptions || {});
        }

        async function scanCueIssuesAsync(cues, scanOptions, qcCore) {
            const w = ensureWorker();
            if (!w) return scanSync(cues, scanOptions, qcCore);
            const id = `qc_${Date.now()}_${seq++}`;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    try {
                        resolve(scanSync(cues, scanOptions, qcCore));
                    } catch (err) {
                        reject(err);
                    }
                }, options.timeoutMs || 8000);
                pending.set(id, {
                    resolve: (msg) => {
                        clearTimeout(timer);
                        resolve({
                            summary: msg.summary,
                            issues: msg.issues,
                            stats: msg.stats,
                        });
                    },
                    reject: (err) => {
                        clearTimeout(timer);
                        try {
                            resolve(scanSync(cues, scanOptions, qcCore));
                        } catch (_) {
                            reject(err);
                        }
                    },
                });
                try {
                    const list = Array.isArray(cues) ? cues : [];
                    w.postMessage({
                        id,
                        type: 'scan',
                        cues: list.map((c) => ({
                            text: c?.text ?? '',
                            startMs: Number(c?.startMs) || 0,
                            endMs: c?.endMs != null
                                ? Number(c.endMs)
                                : (Number(c?.startMs) || 0) + 2000,
                        })),
                        options: scanOptions || {},
                    });
                } catch (err) {
                    clearTimeout(timer);
                    pending.delete(id);
                    try {
                        resolve(scanSync(cues, scanOptions, qcCore));
                    } catch (_) {
                        reject(err);
                    }
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
            scanCueIssuesAsync,
            scanSync,
            dispose,
            get hasWorker() { return !!worker; },
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.createQcWorkerClient = createQcWorkerClient;
}(typeof globalThis !== 'undefined' ? globalThis : window));
