/**
 * Engine → renderer progress / IPC emit helpers.
 */
const path = require('path');
const {
    buildUiProgress,
    engineStageZh,
} = require('./engine-job-progress');

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
    const nowFn = typeof deps.now === 'function' ? deps.now : () => Date.now();

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

    function sendProgress(invokeSender, payload) {
        const ui = buildUiProgress({
            file: payload.file || payload.fullPath || '',
            index1: Number(payload.index1) || ((Number(payload.index) || 0) + 1),
            total: payload.total,
            stage: payload.stage || payload.itemStage,
            detail: payload.detail || payload.itemDetail,
            percent: payload.percent ?? payload.itemProgress,
            error: payload.error,
            subtitlePath: payload.subtitlePath,
            sourceSubtitlePath: payload.sourceSubtitlePath,
            targetSubtitlePath: payload.targetSubtitlePath,
            bilingualSubtitlePath: payload.bilingualSubtitlePath,
            processedSec: payload.processedSec ?? payload.videoCurrentSec,
            mediaDurationSec: payload.mediaDurationSec ?? payload.videoTotalSec,
            resumable: payload.resumable,
            resumeFromJobId: payload.resumeFromJobId,
            errorCode: payload.errorCode || payload.code,
            recovery: payload.recovery,
            asrModel: payload.asrModel,
            primaryAsr: payload.primaryAsr,
            asrAttempts: payload.asrAttempts,
            asrFailedOver: payload.asrFailedOver,
        });
        emitToSubtitleUi('transub-engine-progress', { ...payload, ...ui }, invokeSender);
        emitToSubtitleUi('transwithai-progress', ui, invokeSender);
        const detail = String(ui.itemDetail || payload.detail || '').trim();
        if (!detail) return ui;
        const name = ui.fullPath ? path.basename(ui.fullPath) : '';
        const stageZh = engineStageZh(ui.itemStage);
        const line = `[engine] #${ui.index}/${ui.total} ${stageZh}${name ? ` ${name}` : ''} · ${detail}`;
        const isHeartbeat = /转写中|转写重试|分片转写|首次加载|Transcribing|翻译\s+\d+\/\d+/i.test(detail);
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
    }

    return {
        getMainWebContents,
        emitToSubtitleUi,
        sendProgress,
        buildProgressLogKey,
        _testResetThrottle,
    };
}

module.exports = {
    createProgressEmitter,
};
