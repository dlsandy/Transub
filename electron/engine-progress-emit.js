/**
 * Engine → renderer progress / IPC emit helpers.
 */
const path = require('path');
const {
    buildUiProgress,
    engineStageZh,
    clearTranslateProgressSessions,
    getTranslateProgressSession,
    isPreTranslateProgressStage,
    resetTranslateProgressSession,
    softenTranslateProgressFields,
} = require('./engine-job-progress');
const { sanitizeBatchEngineSseProgress } = require('./engine-batch-item');

/** Factory batch SSE requestId (Desktop/C# D1); empty when idle. */
let factoryBatchRequestId = '';

function setFactoryBatchRequestId(requestId) {
    factoryBatchRequestId = String(requestId || '').trim();
}

function getFactoryBatchRequestId() {
    return factoryBatchRequestId;
}

function emitFactoryBatchProgress(ui, normalized = {}) {
    const id = factoryBatchRequestId;
    if (!id) return;
    try {
        require('./editor-factory-progress').emit(id, {
            phase: ui.phase || normalized.phase || 'running',
            file: ui.fullPath || normalized.file || '',
            index: ui.index,
            total: ui.total,
            itemStage: ui.itemStage || normalized.stage,
            itemProgress: ui.itemProgress,
            itemDetail: ui.itemDetail || normalized.detail,
            message: ui.itemDetail || normalized.detail || '',
            subtitlePath: ui.subtitlePath || normalized.subtitlePath,
            error: ui.error || normalized.error,
        });
    } catch (_) { /* ignore */ }
}

/** Fields the main window reads from `transwithai-progress` (must mirror full engine payload). */
const PROGRESS_UI_PASSTHROUGH = [
    'phase',
    'itemDetail',
    'detail',
    'qcIssueCount',
    'qcFixedMode',
    'qcFixedWritten',
    'qcFixedSummary',
    'subtitlePath',
    'sourceSubtitlePath',
    'targetSubtitlePath',
    'bilingualSubtitlePath',
    'asrModel',
    'primaryAsr',
    'asrAttempts',
    'asrFailedOver',
    'error',
    'errorCode',
    'recovery',
    'resumable',
    'resumeFromJobId',
];

function pickProgressUiPayload(ui, payload = {}) {
    const out = {
        ...ui,
        itemDualPhase: payload.itemDualPhase ?? ui.itemDualPhase,
    };
    for (const key of PROGRESS_UI_PASSTHROUGH) {
        if (payload[key] != null) out[key] = payload[key];
    }
    // Prefer UI-derived terminal phase over sanitize forcing phase:running.
    if (ui.phase === 'cancelled' || ui.phase === 'failed' || ui.phase === 'done' || ui.phase === 'skipped') {
        out.phase = ui.phase;
    } else if (payload.phase != null) {
        out.phase = payload.phase;
    } else if (ui.phase != null) {
        out.phase = ui.phase;
    }
    return out;
}

/**
 * @param {{
 *   getWindowManager: () => { getMainWindow?: Function, sendToRenderer?: Function } | null,
 *   appendEngineLogLine: (line: string, sender?: any) => void,
 *   now?: () => number,
 * }} deps
 */
function createProgressEmitter(deps) {
    let lastEngineUiLogAt = 0;
    let lastEngineUiLogKey = '';
    /** @type {Map<string, number>} */
    const lastRunningPctByFile = new Map();
    const nowFn = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const coalesceMs = Math.max(0, Number(
        deps.progressCoalesceMs != null ? deps.progressCoalesceMs : 120,
    ));
    /** @type {{ invokeSender: any, ui: object, normalized: object } | null} */
    let pendingUiEmit = null;
    let coalesceTimer = null;

    function getMainWebContents() {
        try {
            const win = deps.getWindowManager?.()?.getMainWindow?.();
            if (!win || win.isDestroyed()) return null;
            const wc = win.webContents;
            if (!wc || wc.isDestroyed()) return null;
            return wc;
        } catch {
            return null;
        }
    }

    function emitToSubtitleUi(channel, payload, invokeSender = null) {
        try {
            deps.getWindowManager?.()?.sendToRenderer?.(channel, payload);
        } catch { /* ignore */ }
        try {
            if (!invokeSender || invokeSender.isDestroyed?.()) return;
            const mainWc = getMainWebContents();
            if (mainWc && mainWc.id === invokeSender.id) return;
            invokeSender.send(channel, payload);
        } catch { /* ignore */ }
    }

    function buildProgressLogKey(itemStage, detail) {
        return `${itemStage}|${String(detail || '')
            .replace(/\d+:\d{2}/g, 't')
            .replace(/\d+\s*\/\s*\d+/g, 'n/m')
            .replace(/\d+/g, '#')}`;
    }

    function isTerminalUiPhase(phase) {
        const p = String(phase || '').toLowerCase();
        return p === 'done' || p === 'failed' || p === 'cancelled' || p === 'skipped' || p === 'error';
    }

    function flushPendingUiEmit() {
        if (coalesceTimer) {
            clearTimeout(coalesceTimer);
            coalesceTimer = null;
        }
        const pending = pendingUiEmit;
        pendingUiEmit = null;
        if (!pending) return;
        const { invokeSender, ui, normalized } = pending;
        emitToSubtitleUi('transub-engine-progress', {
            ...ui,
            ...normalized,
            itemDualPhase: normalized.itemDualPhase ?? ui.itemDualPhase,
        }, invokeSender);
        emitToSubtitleUi('transwithai-progress', pickProgressUiPayload(ui, normalized), invokeSender);
        emitFactoryBatchProgress(ui, normalized);
        try {
            require('./engine-tray-progress').updateBatchTrayFromProgress(ui);
        } catch { /* ignore */ }
    }

    function progressFileKey(ui, normalized) {
        return String(ui?.fullPath || normalized?.file || normalized?.fullPath || '')
            .replace(/\//g, '\\')
            .toLowerCase();
    }

    function isItemStartStage(ui, normalized) {
        const stage = String(ui?.itemStage || normalized?.stage || normalized?.itemStage || '')
            .toLowerCase();
        return stage === 'starting' || stage === 'queued';
    }

    function queueUiEmit(invokeSender, ui, normalized) {
        if (pendingUiEmit) {
            const prevFile = progressFileKey(pendingUiEmit.ui, pendingUiEmit.normalized);
            const nextFile = progressFileKey(ui, normalized);
            if (prevFile && nextFile && prevFile !== nextFile) {
                flushPendingUiEmit();
            }
        }
        pendingUiEmit = { invokeSender, ui, normalized };
        if (coalesceMs <= 0
            || isTerminalUiPhase(ui.phase || normalized.phase)
            || isItemStartStage(ui, normalized)) {
            flushPendingUiEmit();
            return;
        }
        if (coalesceTimer) return;
        coalesceTimer = setTimeout(() => {
            coalesceTimer = null;
            flushPendingUiEmit();
        }, coalesceMs);
    }

    function sendProgress(invokeSender, payload) {
        const explicitDone = payload?.phase === 'done';
        // Status-only terminal (no stage-local percent) must not invent save@97.
        if (!explicitDone) {
            const st = String(payload?.stage || payload?.itemStage || '').toLowerCase();
            const pct = Number(payload?.percent ?? payload?.itemProgress);
            if ((st === 'done' || st === 'batch_done') && !Number.isFinite(pct)) {
                return null;
            }
        }
        let normalized = explicitDone
            ? { ...payload }
            : sanitizeBatchEngineSseProgress({ ...payload });
        const normStage = String(normalized.stage || normalized.itemStage || '').toLowerCase();
        const terminalStage = normStage === 'cancelled'
            || normStage === 'error'
            || normStage === 'failed'
            || normStage === 'skipped'
            || normStage === 'done'
            || normStage === 'batch_done';
        if (terminalStage && !normalized.phase) {
            if (normStage === 'cancelled') normalized = { ...normalized, phase: 'cancelled' };
            else if (normStage === 'error' || normStage === 'failed') {
                normalized = { ...normalized, phase: 'failed' };
            } else if (normStage === 'skipped') {
                normalized = { ...normalized, phase: 'skipped' };
            }
        }
        if (!explicitDone && !terminalStage && normalized.phase !== 'running') {
            normalized = { ...normalized, phase: 'running' };
        }

        const fileKey = String(normalized.file || normalized.fullPath || '')
            .replace(/\//g, '\\')
            .toLowerCase();
        if (fileKey) {
            const stage = String(normalized.stage || normalized.itemStage || '').toLowerCase();
            if (isPreTranslateProgressStage(stage)) {
                resetTranslateProgressSession(fileKey);
            } else if (stage === 'translate' || stage === 'mt') {
                normalized = softenTranslateProgressFields(
                    normalized,
                    getTranslateProgressSession(fileKey),
                );
            }
        }

        const ui = buildUiProgress({
            file: normalized.file || normalized.fullPath || '',
            index1: Number(normalized.index1) || ((Number(normalized.index) || 0) + 1),
            total: normalized.total,
            stage: normalized.stage || normalized.itemStage,
            detail: normalized.detail || normalized.itemDetail,
            percent: normalized.percent ?? normalized.itemProgress,
            error: normalized.error,
            subtitlePath: normalized.subtitlePath,
            sourceSubtitlePath: normalized.sourceSubtitlePath,
            targetSubtitlePath: normalized.targetSubtitlePath,
            bilingualSubtitlePath: normalized.bilingualSubtitlePath,
            processedSec: normalized.processedSec ?? normalized.videoCurrentSec,
            mediaDurationSec: normalized.mediaDurationSec ?? normalized.videoTotalSec,
            resumable: normalized.resumable,
            resumeFromJobId: normalized.resumeFromJobId,
            errorCode: normalized.errorCode || normalized.code,
            recovery: normalized.recovery,
            asrModel: normalized.asrModel,
            primaryAsr: normalized.primaryAsr,
            asrAttempts: normalized.asrAttempts,
            asrFailedOver: normalized.asrFailedOver,
        });

        const uiFileKey = String(ui.fullPath || '').replace(/\//g, '\\').toLowerCase();
        if (!explicitDone && ui.phase === 'done') {
            ui.phase = 'running';
            ui.itemStage = normalized.itemStage || normalized.stage || 'save';
            ui.itemProgress = Math.min(97, Number(ui.itemProgress) || 97);
        }
        if (ui.phase === 'running' && uiFileKey) {
            const last = lastRunningPctByFile.get(uiFileKey) || 0;
            const cur = Number(ui.itemProgress);
            const stage = String(ui.itemStage || normalized.stage || '').toLowerCase();
            if (Number.isFinite(cur) && cur > 0) {
                // Premature ASR-done hold (save@97) must not lock out the translate band.
                const recoverTranslate = (stage === 'translate' || stage === 'mt')
                    && last >= 96
                    && cur < last
                    && cur <= 95;
                ui.itemProgress = recoverTranslate ? cur : Math.max(last, cur);
                lastRunningPctByFile.set(uiFileKey, ui.itemProgress);
            }
        } else if (explicitDone && uiFileKey) {
            lastRunningPctByFile.delete(uiFileKey);
            resetTranslateProgressSession(uiFileKey);
        }

        queueUiEmit(invokeSender, ui, normalized);
        const detail = String(ui.itemDetail || payload.detail || '').trim();
        if (!detail) return ui;
        const name = ui.fullPath ? path.basename(ui.fullPath) : '';
        const stageZh = engineStageZh(ui.itemStage);
        const line = `[engine] #${ui.index}/${ui.total} ${stageZh}${name ? ` ${name}` : ''} · ${detail}`;
        const isHeartbeat = /提取原文|转写中|转写重试|分片转写|首次加载|Transcribing|翻译\s+\d+\/\d+|TEN\s+\d+[–-]\d+/i.test(detail);
        const now = nowFn();
        const key = buildProgressLogKey(ui.itemStage, detail);
        const throttleMs = /翻译/.test(detail) ? 8000 : 12000;
        if (isHeartbeat && key === lastEngineUiLogKey && now - lastEngineUiLogAt < throttleMs) {
            return ui;
        }
        lastEngineUiLogKey = key;
        lastEngineUiLogAt = now;
        deps.appendEngineLogLine?.(line, invokeSender);
        return ui;
    }

    function _testResetThrottle() {
        lastEngineUiLogAt = 0;
        lastEngineUiLogKey = '';
        lastRunningPctByFile.clear();
        clearTranslateProgressSessions();
        if (coalesceTimer) {
            clearTimeout(coalesceTimer);
            coalesceTimer = null;
        }
        pendingUiEmit = null;
    }

    return {
        getMainWebContents,
        emitToSubtitleUi,
        sendProgress,
        buildProgressLogKey,
        pickProgressUiPayload,
        flushPendingUiEmit,
        _testResetThrottle,
    };
}

module.exports = {
    createProgressEmitter,
    pickProgressUiPayload,
    PROGRESS_UI_PASSTHROUGH,
    setFactoryBatchRequestId,
    getFactoryBatchRequestId,
};
