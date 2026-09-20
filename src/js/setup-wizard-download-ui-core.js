/**
 * Per-model download progress UI for setup wizard downloads step.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardDownloadUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardDownloadUiFactory(global) {
    /** Strip accidental `[id]` wrappers from progress payloads. */
    function normalizeProgressModelId(raw) {
        let id = String(raw || '').trim();
        if (!id) return '';
        const bracketed = id.match(/^\[(.+)\]$/);
        if (bracketed) id = String(bracketed[1] || '').trim();
        return id;
    }

    /**
     * Pip / CUDA / install stages are runtime extras, not HF weight download.
     * Must not be stamped onto a model row via the "first active" fallback.
     */
    function isSharedRuntimeProgressEvent(p) {
        const stage = String(p?.stage || p?.raw?.stage || '').trim().toLowerCase();
        if (['pip', 'install', 'torch_cuda', 'extras', 'runtime'].includes(stage)) return true;
        const msg = String(p?.message || p?.detail || p?.raw?.detail || '');
        if (/测速\s*PyPI|PyPI\s*镜像|安装\s*.*运行库|补齐\s*.*运行库|改装\s*cuda|cuda\s*pytorch/i.test(msg)) {
            return true;
        }
        return false;
    }

    /**
     * @param {object} deps
     */
    function createSetupWizardDownloadUi(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const uiTx = d.uiTx || ((t) => t);
        const uiTf = d.uiTf || ((t, v) => {
            return String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
                v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : `{${k}}`
            ));
        });
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
        const getState = d.getState || (() => ({}));
        const modelLabel = d.modelLabel || ((id) => id);

        function ensureRowState(modelId) {
            const state = getState();
            if (!state.downloadRows) state.downloadRows = {};
            if (!state.downloadRows[modelId]) {
                state.downloadRows[modelId] = {
                    id: modelId,
                    status: 'pending',
                    pct: 0,
                    message: '',
                };
            }
            return state.downloadRows[modelId];
        }

        function renderDownloadRows(modelIds) {
            const host = $('setupWizardDownloadList');
            if (!host) return;
            const ids = Array.isArray(modelIds) ? modelIds.filter(Boolean) : [];
            const state = getState();
            state.downloadOrder = ids.slice();
            host.innerHTML = ids.map((id) => {
                const row = ensureRowState(id);
                const label = modelLabel(id) || id;
                return `<div class="wizard-dl-row" data-wizard-dl-id="${esc(id)}">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <p class="text-sm font-medium text-gray-800 min-w-0 truncate">${esc(label)}</p>
                        <span class="wizard-dl-pct text-xs tabular-nums text-gray-500 shrink-0">${Math.round(row.pct || 0)}%</span>
                    </div>
                    <div class="h-1.5 w-full rounded-full overflow-hidden wizard-apply-progress-track">
                        <div class="wizard-dl-bar h-full rounded-full wizard-apply-progress-bar transition-[width] duration-150" style="width:${Math.max(0, Math.min(100, row.pct || 0))}%"></div>
                    </div>
                    <div class="flex items-center justify-between gap-2 mt-1">
                        <p class="wizard-dl-msg text-[11px] text-gray-500 min-w-0 flex-1 truncate">${esc(row.message || uiTx('等待中'))}</p>
                        <button type="button" class="wizard-dl-retry hidden text-[11px] text-sky-700 hover:underline shrink-0" data-wizard-dl-retry="${esc(id)}">${esc(uiTx('重试'))}</button>
                    </div>
                </div>`;
            }).join('');
        }

        function updateRow(modelId, patch) {
            const row = ensureRowState(modelId);
            Object.assign(row, patch || {});
            const root = typeof document !== 'undefined'
                ? document.querySelector(`[data-wizard-dl-id="${CSS?.escape ? CSS.escape(modelId) : modelId}"]`)
                : null;
            if (!root) return;
            const pctEl = root.querySelector('.wizard-dl-pct');
            const bar = root.querySelector('.wizard-dl-bar');
            const msg = root.querySelector('.wizard-dl-msg');
            const retry = root.querySelector('.wizard-dl-retry');
            const pct = Math.max(0, Math.min(100, Number(row.pct) || 0));
            if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
            if (bar) bar.style.width = `${pct}%`;
            if (msg) {
                const statusText = {
                    pending: uiTx('等待中'),
                    downloading: uiTx('下载中…'),
                    done: uiTx('已完成'),
                    error: uiTx('失败'),
                    skipped: uiTx('已跳过'),
                };
                msg.textContent = row.message || statusText[row.status] || '';
            }
            if (retry) retry.classList.toggle('hidden', row.status !== 'error');
            root.dataset.status = row.status || 'pending';
        }

        function applyProgressEvent(p) {
            const modelId = normalizeProgressModelId(p?.modelId);
            const sharedRuntime = isSharedRuntimeProgressEvent(p);
            const msg = String(p?.message || p?.detail || '').trim();

            // Runtime extras (PyPI / CUDA) are job-level — never stamp onto an HF model row.
            if (sharedRuntime) {
                if (msg) setDownloadsStatus(msg);
                return;
            }

            if (!modelId) {
                // Legacy fallback for untagged model progress only.
                const order = getState().downloadOrder || [];
                const active = order.find((id) => {
                    const r = getState().downloadRows?.[id];
                    return r && (r.status === 'pending' || r.status === 'downloading');
                });
                if (!active) return;
                updateRow(active, {
                    status: p?.phase === 'error' ? 'error' : 'downloading',
                    pct: Number(p?.pct ?? p?.percent) || 0,
                    message: msg,
                });
                return;
            }

            const existing = getState().downloadRows?.[modelId];
            if (existing && (existing.status === 'skipped' || existing.status === 'done')) return;
            const phase = String(p?.phase || '').toLowerCase();
            let status = 'downloading';
            if (phase === 'error' || phase === 'cancelled') status = 'error';
            else if (phase === 'done' || phase === 'complete' || (Number(p?.pct) >= 100)) status = 'done';
            updateRow(modelId, {
                status,
                pct: status === 'done' ? 100 : (Number(p?.pct ?? p?.percent) || 0),
                message: msg,
            });
        }

        function markDone(modelId) {
            updateRow(modelId, { status: 'done', pct: 100, message: uiTx('已完成') });
        }

        function markError(modelId, message) {
            updateRow(modelId, {
                status: 'error',
                message: message || uiTx('下载失败'),
            });
        }

        function markSkipped(modelId, message) {
            updateRow(modelId, {
                status: 'skipped',
                pct: 100,
                message: message || uiTx('已跳过'),
            });
        }

        function markPending(modelId) {
            const row = ensureRowState(modelId);
            if (row.status === 'skipped' || row.status === 'done') return;
            updateRow(modelId, { status: 'pending', pct: 0, message: uiTx('等待中') });
        }

        function allFinished() {
            const order = getState().downloadOrder || [];
            if (!order.length) return true;
            return order.every((id) => {
                const r = getState().downloadRows?.[id];
                return r && (r.status === 'done' || r.status === 'skipped');
            });
        }

        function failedIds() {
            const order = getState().downloadOrder || [];
            return order.filter((id) => getState().downloadRows?.[id]?.status === 'error');
        }

        function setDownloadsStatus(text) {
            const el = $('setupWizardDownloadStatus');
            if (el) el.textContent = text || '';
        }

        function summarizeProgress() {
            const order = getState().downloadOrder || [];
            const done = order.filter((id) => {
                const st = getState().downloadRows?.[id]?.status;
                return st === 'done' || st === 'skipped';
            }).length;
            setDownloadsStatus(uiTf('已完成 {done} / {total}', { done, total: order.length }));
        }

        return {
            renderDownloadRows,
            updateRow,
            applyProgressEvent,
            markDone,
            markError,
            markSkipped,
            markPending,
            allFinished,
            failedIds,
            setDownloadsStatus,
            summarizeProgress,
            ensureRowState,
        };
    }

    return {
        createSetupWizardDownloadUi,
        normalizeProgressModelId,
        isSharedRuntimeProgressEvent,
    };
}));
