/**
 * Engine batch → system tray progress tooltip (mirrors TWAI tray ETA path).
 */
/** @type {{
 *   items: Array<{ path: string, duration: number, status: string }>,
 *   rate: number,
 *   trayProgressEnabled: boolean,
 *   windowManager: object | null,
 * } | null} */
let activeBatchTrayCtx = null;

function itemPath(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') {
        return String(item).trim();
    }
    return String(item.fullPath || item.path || '').trim();
}

function buildTrayItems(list = []) {
    return (Array.isArray(list) ? list : [])
        .map((item) => ({
            path: itemPath(item),
            duration: Math.max(0, Number(item?.durationSec || item?.duration) || 0),
            status: 'pending',
        }))
        .filter((i) => i.path);
}

function resolveHistoryRate(merged = {}) {
    try {
        const { loadTaskHistory } = require('./task-history');
        const { rateFromHistory, DEFAULT_WALL_FACTOR } = require('../src/js/eta-core');
        const task = String(merged.task || 'dual');
        const fallback = task === 'dual' ? DEFAULT_WALL_FACTOR * 2 : DEFAULT_WALL_FACTOR;
        return rateFromHistory(loadTaskHistory().entries, {
            device: merged.device,
            task,
        }) ?? fallback;
    } catch {
        return String(merged.task || 'dual') === 'dual' ? 0.7 : 0.35;
    }
}

/**
 * @param {object | null} windowManager
 * @param {{ list?: any[], merged?: object }} [opts]
 */
function beginBatchTrayProgress(windowManager, opts = {}) {
    const merged = opts.merged || {};
    const enabled = merged.trayProgressEnabled !== false;
    activeBatchTrayCtx = {
        items: buildTrayItems(opts.list),
        rate: resolveHistoryRate(merged),
        trayProgressEnabled: enabled,
        windowManager: windowManager || null,
    };
    try {
        windowManager?.setTrayProgressEnabled?.(enabled);
    } catch { /* ignore */ }
}

/**
 * @param {object} [progress] UI progress payload (buildUiProgress shape)
 */
function updateBatchTrayFromProgress(progress = {}) {
    const ctx = activeBatchTrayCtx;
    if (!ctx?.trayProgressEnabled || !ctx.windowManager?.updateTrayProgress) return;
    try {
        const eta = require('../src/js/eta-core');
        const index = Number(progress.index) || 0;
        const total = Number(progress.total) || ctx.items.length || 0;
        const itemProgress = Number(progress.itemProgress) || 0;
        const batchPct = eta.batchProgressPct({ index, total, itemProgress });
        const phase = String(progress.phase || '');
        const fullPath = String(progress.fullPath || progress.sourcePath || '').trim();
        if (fullPath && ctx.items.length) {
            const key = fullPath.replace(/\//g, '\\').toLowerCase();
            for (const item of ctx.items) {
                const ik = String(item.path || '').replace(/\//g, '\\').toLowerCase();
                if (ik !== key) continue;
                if (phase === 'done' || phase === 'skipped') {
                    item.status = phase === 'skipped' ? 'skipped' : 'done';
                } else if (phase === 'failed') {
                    item.status = 'failed';
                } else if (phase === 'running') {
                    item.status = 'running';
                }
                break;
            }
        }
        const etaSec = eta.estimateEtaSec({
            items: ctx.items,
            activePath: phase === 'running' ? fullPath : '',
            videoCurrentSec: progress.videoCurrentSec,
            videoTotalSec: progress.videoTotalSec,
            itemStage: progress.itemStage,
            rate: ctx.rate,
        });
        ctx.windowManager.setTrayProgressEnabled?.(true);
        ctx.windowManager.updateTrayProgress({
            batchPct,
            index,
            total,
            etaText: eta.formatEtaCompact(etaSec),
        });
    } catch { /* ignore */ }
}

function endBatchTrayProgress() {
    const wm = activeBatchTrayCtx?.windowManager;
    activeBatchTrayCtx = null;
    try {
        wm?.clearTrayProgress?.();
    } catch { /* ignore */ }
}

function _testReset() {
    activeBatchTrayCtx = null;
}

function _testGetCtx() {
    return activeBatchTrayCtx;
}

module.exports = {
    beginBatchTrayProgress,
    updateBatchTrayFromProgress,
    endBatchTrayProgress,
    buildTrayItems,
    _testReset,
    _testGetCtx,
};
