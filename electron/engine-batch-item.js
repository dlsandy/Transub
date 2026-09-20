/**
 * Per-item engine batch job outcomes / wait-event progress (pure).
 */
function interpretCreateJobResponse(created) {
    if (created?.ok && created?.data?.id) {
        return { ok: true, jobId: String(created.data.id) };
    }
    const status = Number(created?.status);
    const msg = created?.error
        || created?.data?.message
        || created?.data?.error
        || (Number.isFinite(status) && status > 0
            ? `创建任务失败 (HTTP ${status})`
            : '创建任务失败（引擎未响应）');
    return { ok: false, error: String(msg) };
}

/**
 * Row stop / cancel-current: stop this file only; keep the batch running.
 * @param {{ batchCancelled?: boolean, itemCancelled?: boolean } | null | undefined} flags
 */
function shouldContinueBatchAfterItemCancel(flags = {}) {
    return !!(flags && flags.itemCancelled && !flags.batchCancelled);
}

/** Batch-loop / range-ASR: honor both full stop and row stop. */
function isHostStopRequested(host = {}) {
    return !!(host && (host.batchCancelled || host.itemCancelled));
}

/** Desktop post-task (QC / 闭环 / 空白重译): abort when UI cancel fired. */
function isPostTaskStopRequested({ shouldStop, signal } = {}) {
    if (signal?.aborted) return true;
    if (typeof shouldStop === 'function' && shouldStop()) return true;
    return false;
}

function cancelledPostTaskResult(extra = {}) {
    return {
        ok: false,
        cancelled: true,
        error: 'cancelled',
        code: 'cancelled',
        skipped: true,
        reason: 'cancelled',
        ...extra,
    };
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
 * Percent is already job-wide (see transub_engine.jobs.progress → remap_job_progress).
 * Do NOT pass through remapBridgeProgress again.
 * @param {object} ev
 * @returns {object|null} null = status-only terminal; do not update the progress bar
 */
function progressFieldsFromWaitEvent(ev = {}) {
    const progress = ev.progress || {};
    // Engine finishes with a bare `{type:done, ok, result}` after the last progress
    // tick. Treating that as stage=done@undefined → sanitize → 97% freezes the bar
    // before MT (monotonic) when ASR was split into a temporary transcribe job.
    const progressType = String(progress.type || '').toLowerCase();
    if (
        (progressType === 'done' || progressType === 'error' || progressType === 'cancelled')
        && progress.stage == null
        && progress.percent == null
        && progress.detail == null
    ) {
        return null;
    }
    const stage = progress.stage || ev.status || 'running';
    const detail = progress.detail
        || (ev.status === 'queued' ? '排队中…'
            : ev.status === 'running' ? '引擎提取原文中…'
                : String(ev.status || '处理中'));
    const percent = Number.isFinite(Number(progress.percent))
        ? Number(progress.percent)
        : undefined;
    const out = {
        stage,
        detail,
        ...(percent != null ? { percent } : {}),
        processedSec: progress.processedSec,
        mediaDurationSec: progress.mediaDurationSec ?? progress.audioDurationSec,
    };
    return out;
}

/**
 * Engine job SSE emits stage=done@100% when Python finishes; desktop post-task
 * (QC / 简繁 / preset) still runs. Keep UI in running/save band until bridge phase=done.
 * @param {object} fields from progressFieldsFromWaitEvent
 * @returns {object}
 */
function looksLikeEngineCompletionDetail(detail) {
    return /完成|done|finished/i.test(String(detail || '').trim());
}

/** ASR-only job end (split before MT) — not post-MT polish. */
function looksLikeAsrOnlyCompletionDetail(detail) {
    return /转写完成|原文提取完成|提取原文完成/i.test(String(detail || '').trim());
}

/** Desktop post-task ticks — never remap to save@收尾 (that caused QC 闭环 log spam). */
function isPostTaskProgressStage(stage) {
    const s = String(stage || '').trim().toLowerCase();
    return s === 'qc_fix' || s === 'qc' || s === 'qc_loop' || s === 'loop'
        || s === 'postprocess' || s === 'finalize';
}

function sanitizeBatchEngineSseProgress(fields = {}) {
    if (!fields || typeof fields !== 'object') return fields;
    const stage = String(fields.stage || fields.itemStage || '').trim().toLowerCase();
    const pct = Number(fields.percent ?? fields.itemProgress);
    const detail = String(fields.detail || fields.itemDetail || '').trim();
    const nearDone = Number.isFinite(pct) && pct >= 99;
    const completionStage = stage === 'done' || stage === 'batch_done';
    const terminalStage = completionStage || stage === 'skipped' || stage === 'error'
        || stage === 'failed' || stage === 'cancelled';
    if (terminalStage && completionStage) {
        // handled below
    } else if (terminalStage) {
        return fields;
    }
    // Intermediate ASR-only completion must stay in extract-source band (≤65).
    if (completionStage && looksLikeAsrOnlyCompletionDetail(detail)) {
        return {
            ...fields,
            stage: 'transcribe',
            percent: Number.isFinite(pct) && pct > 0 && pct <= 65 ? pct : 65,
            detail: detail || '原文提取完成',
            phase: 'running',
        };
    }
    // Bare done without percent: ignore — prior progress tick already applied.
    if (completionStage && !Number.isFinite(pct)) {
        return fields;
    }
    // Post-task (QC / 闭环 / 后期) already owns the tail band — do not bounce to save.
    if (isPostTaskProgressStage(stage)) return fields;
    // Hold engine near-complete / translate-done so UI stays in save band until bridge phase=done.
    // (cleanup@nearDone with 完成 is included via nearDone — same as prior preQc hold.)
    const shouldHold = completionStage || nearDone;
    if (!shouldHold) return fields;
    return {
        ...fields,
        stage: 'save',
        percent: Number.isFinite(pct) && pct > 0 ? Math.min(97, pct) : 97,
        detail: detail
            ? `${detail} · 收尾中…`
            : '引擎完成，收尾中…',
        phase: 'running',
    };
}

/**
 * Resolve whether this file should use external MT (Sakura / smart).
 */
function resolveFileMtPlan(fileMerged = {}, {
    isLlmMtId = () => false,
    usesExternalMt = () => false,
    mapTaskToEngineTask = (task) => task,
    preferEngineLlamaMt = false,
    canUseEngineLlamaMt = () => false,
} = {}) {
    let merged = fileMerged && typeof fileMerged === 'object' ? { ...fileMerged } : {};
    let route = null;
    let blockedNativeOpus = false;
    let mtRouteApi = null;
    try {
        mtRouteApi = require('../src/js/mt-target-route-core');
        const applied = mtRouteApi.applyMtTargetRouteToOptions(merged, { isLlmMtId });
        merged = applied.options;
        route = applied.route;
        blockedNativeOpus = !!applied.blockedNativeOpus;
    } catch { /* optional */ }

    const task = merged.task;
    const intlTarget = !!(route && route.isZhTarget === false);
    const modelId = String(merged.engineMtModel || '').trim();
    const modelIsSakuraFamily = mtRouteApi?.isSakuraOrGalMtId
        ? mtRouteApi.isSakuraOrGalMtId(modelId)
        : /^sakura-|galtransl|^hy-?mt/i.test(modelId);

    let useSakuraMt = isLlmMtId(merged.engineMtModel)
        && !merged.smartTranslate
        && (task === 'translate' || task === 'dual');
    // Sakura/Gal/Hy-MT are JA→ZH specialists — never use for intl 成片
    if (intlTarget && modelIsSakuraFamily) {
        useSakuraMt = false;
        blockedNativeOpus = true;
    }

    const useSmartTranslate = !!merged.smartTranslate
        && (task === 'translate' || task === 'dual');
    const useLlamaMt = !!(
        useSakuraMt
        && preferEngineLlamaMt
        && canUseEngineLlamaMt(merged.engineMtModel)
    );
    const useExternalMt = usesExternalMt({
        smartTranslate: useSmartTranslate,
        sakuraMt: useSakuraMt && !useLlamaMt,
    });
    const engineTask = mapTaskToEngineTask(task, {
        smartTranslate: useSmartTranslate,
        sakuraMt: useSakuraMt,
    });
    const jobMtModel = (useExternalMt || useLlamaMt) ? null : (merged.engineMtModel || null);

    // Opus native path is never allowed
    const isOpusJob = !!(jobMtModel && (
        mtRouteApi?.isOpusMtId
            ? mtRouteApi.isOpusMtId(jobMtModel)
            : /^opus[-_]?mt/i.test(jobMtModel)
    ));
    const intlBlocksNativeOpus = intlTarget
        && !useExternalMt
        && !useLlamaMt
        && !useSmartTranslate
        && !(jobMtModel && isLlmMtId(jobMtModel) && !modelIsSakuraFamily);
    const opusOnlyPlan = isOpusJob
        || (
            !useExternalMt
            && !useLlamaMt
            && !useSmartTranslate
            && !jobMtModel
            && String(merged.translateMode || '').toLowerCase() === 'engine'
        );

    const blocked = blockedNativeOpus || intlBlocksNativeOpus || opusOnlyPlan || isOpusJob;
    const opusRemovedMsg = mtRouteApi?.OPUS_REMOVED_MSG
        || '机器翻译（Opus）已移除，请改用推理翻译或智能翻译';
    return {
        useSakuraMt,
        useSmartTranslate,
        useExternalMt,
        useLlamaMt,
        engineTask,
        jobMtModel: isOpusJob ? null : jobMtModel,
        fileMerged: merged,
        mtRoute: route,
        blockedNativeOpus: blocked,
        intlMtError: blocked
            ? (isOpusJob || opusOnlyPlan
                ? opusRemovedMsg
                : (route?.reason
                    || '非中文成片：请使用通用推理模型或智能翻译；Sakura 仅支持译入中文'))
            : '',
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
    shouldContinueBatchAfterItemCancel,
    isHostStopRequested,
    isPostTaskStopRequested,
    cancelledPostTaskResult,
    progressFieldsFromWaitEvent,
    isPostTaskProgressStage,
    sanitizeBatchEngineSseProgress,
    resolveFileMtPlan,
    buildFailedItemResult,
    buildCancelledItemResult,
    buildSkippedItemResult,
    summarizeAsrRunMeta,
    appendAsrRunToDetail,
};
