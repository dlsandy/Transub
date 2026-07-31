/**
 * 查找匹配 Web Worker
 */
/* eslint-disable no-restricted-globals */
try {
    importScripts('./find-replace-core.js');
} catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
}

self.onmessage = (event) => {
    const data = event.data || {};
    const id = data.id;
    try {
        const api = self.TransubFindReplace;
        if (!api?.collectFindMatches) {
            self.postMessage({ id, ok: false, error: '查找模块未加载' });
            return;
        }
        if (data.type === 'find') {
            const matches = api.collectFindMatches(
                data.cues || [],
                data.query || '',
                !!data.caseSensitive,
            );
            self.postMessage({ id, ok: true, type: 'find', matches });
            return;
        }
        self.postMessage({ id, ok: false, error: `未知任务：${data.type}` });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message || err) });
    }
};
