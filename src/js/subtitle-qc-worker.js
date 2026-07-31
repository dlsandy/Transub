/**
 * QC 扫描 Web Worker（importScripts 加载 cores）
 */
/* eslint-disable no-restricted-globals */
try {
    importScripts(
        './subtitle-split-core.js',
        './subtitle-fluency-core.js',
        './subtitle-qc-core.js',
    );
} catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
}

self.onmessage = (event) => {
    const data = event.data || {};
    const id = data.id;
    try {
        const qc = self.TransubSubtitleQc;
        if (!qc?.scanCueIssues) {
            self.postMessage({ id, ok: false, error: 'QC 模块未加载' });
            return;
        }
        if (data.type === 'scan') {
            const scan = qc.scanCueIssues(data.cues || [], data.options || {});
            self.postMessage({
                id,
                ok: true,
                type: 'scan',
                summary: scan.summary,
                issues: scan.issues,
                stats: scan.stats,
            });
            return;
        }
        self.postMessage({ id, ok: false, error: `未知任务：${data.type}` });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message || err) });
    }
};
