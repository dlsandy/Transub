/**
 * Per-item engine batch job outcomes / wait-event progress (pure).
 */
function interpretCreateJobResponse(created) {
    if (created?.ok && created?.data?.id) {
        return { ok: true, jobId: String(created.data.id) };
    }
    const msg = created?.data?.message
        || created?.data?.error
        || `创建任务失败 (HTTP ${created?.status || '?'})`;
    return { ok: false, error: String(msg) };
}

/**
 * @param {object} waited waitJob result
 * @param {boolean} batchCancelled
 */
function interpretWaitJobResult(waited, batchCancelled = false) {
    if (batchCancelled || waited?.cancelled || waited?.error === 'cancelled') {
        return {
            kind: 'cancelled',
            error: 'cancelled',
            code: waited?.code || 'cancelled',
            jobId: waited?.jobId || waited?.data?.id || '',
        };
    }
    if (!waited?.ok) {
        return {
            kind: 'failed',
            error: String(waited?.error || '任务失败'),
            code: waited?.code || waited?.data?.error?.code || '',
            jobId: waited?.jobId || waited?.data?.id || '',
            result: waited?.data?.result || waited?.result || null,
        };
    }
    return {
        kind: 'ok',
        result: waited.data?.result || waited.result || null,
        jobId: waited?.jobId || waited?.data?.id || '',
        asrModel: waited?.asrModel,
    };
}

/**
 * Map waitJob onEvent payload → sendProgress fields (sans index/file).
 * @param {object} ev
 */
function progressFieldsFromWaitEvent(ev = {}) {
    const progress = ev.progress || {};
    const stage = progress.stage || ev.status || 'running';
    const detail = progress.detail
        || (ev.status === 'queued' ? '排队中…'
            : ev.status === 'running' ? '引擎转写中…'
                : String(ev.status || '处理中'));
    const percent = Number.isFinite(Number(progress.percent))
        ? Number(progress.percent)
        : (ev.status === 'running' ? 15 : 5);
    return {
        stage,
        detail,
        percent,
        processedSec: progress.processedSec,
        mediaDurationSec: progress.mediaDurationSec ?? progress.audioDurationSec,
    };
}

/**
 * Resolve whether this file should use external MT (Sakura / smart).
 */
function resolveFileMtPlan(fileMerged = {}, {
    isLlmMtId = () => false,
    usesExternalMt = () => false,
    mapTaskToEngineTask = (task) => task,
} = {}) {
    const task = fileMerged.task;
    const useSakuraMt = isLlmMtId(fileMerged.engineMtModel)
        && !fileMerged.smartTranslate
        && (task === 'translate' || task === 'dual');
    const useSmartTranslate = !!fileMerged.smartTranslate
        && (task === 'translate' || task === 'dual');
    const useExternalMt = usesExternalMt({
        smartTranslate: useSmartTranslate,
        sakuraMt: useSakuraMt,
    });
    const engineTask = mapTaskToEngineTask(task, {
        smartTranslate: useSmartTranslate,
        sakuraMt: useSakuraMt,
    });
    return {
        useSakuraMt,
        useSmartTranslate,
        useExternalMt,
        engineTask,
        jobMtModel: useExternalMt ? null : (fileMerged.engineMtModel || null),
    };
}

function buildFailedItemResult(mediaPath, error, extra = {}) {
    return {
        ok: false,
        path: mediaPath,
        error: String(error || '失败'),
        ...(extra && typeof extra === 'object' ? extra : {}),
    };
}

function buildCancelledItemResult(mediaPath, extra = {}) {
    return {
        ok: false,
        path: mediaPath,
        error: 'cancelled',
        cancelled: true,
        ...(extra && typeof extra === 'object' ? extra : {}),
    };
}

function buildSkippedItemResult(mediaPath, paths = {}) {
    return {
        ok: true,
        path: mediaPath,
        skipped: true,
        subtitlePath: paths.subtitlePath || '',
        sourceSubtitlePath: paths.sourceSubtitlePath || '',
        targetSubtitlePath: paths.targetSubtitlePath || '',
        bilingualSubtitlePath: paths.bilingualSubtitlePath || '',
    };
}

/**
 * Summarize which ASR model actually ran (incl. failover).
 * @param {{
 *   asrModel?: string,
 *   primaryAsr?: string,
 *   asrAttempts?: number,
 * }} [input]
 * @returns {{
 *   asrModel: string,
 *   primaryAsr: string,
 *   asrAttempts: number,
 *   failedOver: boolean,
 *   label: string,
 * }}
 */
function summarizeAsrRunMeta(input = {}) {
    const asrModel = String(input.asrModel || '').trim();
    const primaryAsr = String(input.primaryAsr || '').trim() || asrModel;
    const attempts = Math.max(1, Math.floor(Number(input.asrAttempts) || 1));
    const failedOver = !!(asrModel && primaryAsr && asrModel !== primaryAsr && attempts > 1);
    let label = '';
    if (asrModel) {
        label = failedOver
            ? `ASR ${asrModel}（回退自 ${primaryAsr}）`
            : `ASR ${asrModel}`;
    }
    return {
        asrModel,
        primaryAsr,
        asrAttempts: attempts,
        failedOver,
        label,
    };
}

/**
 * Append ASR run summary onto a done/fail detail line.
 */
function appendAsrRunToDetail(detail, asrMeta) {
    const base = String(detail || '').trim() || '完成';
    const label = String(asrMeta?.label || '').trim();
    if (!label) return base;
    if (base.includes(label) || (asrMeta.asrModel && base.includes(asrMeta.asrModel))) return base;
    return `${base} · ${label}`;
}

module.exports = {
    interpretCreateJobResponse,
    interpretWaitJobResult,
    progressFieldsFromWaitEvent,
    resolveFileMtPlan,
    buildFailedItemResult,
    buildCancelledItemResult,
    buildSkippedItemResult,
    summarizeAsrRunMeta,
    appendAsrRunToDetail,
};
