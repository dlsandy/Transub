/**
 * Engine batch → UI progress mapping (pure).
 */
function mapEngineStageToItemStage(stage) {
    const s = String(stage || '').toLowerCase();
    if (!s || s === 'queued' || s === 'starting' || s === 'status') return 'starting';
    if (s === 'model' || s === 'vad' || s === 'denoise' || s === 'separate') return s;
    if (s === 'scene' || s === 'vad_failover' || s === 'cleanup') return s;
    if (s === 'translate' || s === 'mt') return 'translate';
    if (s === 'done' || s === 'batch_done') return 'done';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'error' || s === 'failed') return 'failed';
    if (s === 'running') return 'transcribe';
    return s === 'transcribe' ? 'transcribe' : 'transcribe';
}

/** Concise stage labels for main-window engine log (match status badges). */
const ENGINE_STAGE_ZH = Object.freeze({
    starting: '启动',
    denoise: '轻度降噪',
    separate: '人声分离',
    scene: '场景切分',
    vad: '语音检测',
    vad_failover: 'VAD 回退',
    cleanup: '字幕清理',
    model: '加载模型',
    transcribe: '转写',
    translate: '翻译',
    save: '保存',
    done: '完成',
    failed: '失败',
    cancelled: '已取消',
    download: '下载',
    trim: '截取',
    cancel: '取消',
});

function engineStageZh(stage) {
    const s = String(stage || '').toLowerCase();
    return ENGINE_STAGE_ZH[s] || '处理中';
}

function buildUiProgress({
    file,
    index1,
    total,
    stage,
    detail,
    percent,
    error,
    subtitlePath,
    sourceSubtitlePath,
    targetSubtitlePath,
    bilingualSubtitlePath,
    processedSec,
    mediaDurationSec,
    resumable,
    resumeFromJobId,
    errorCode,
    recovery,
    asrModel,
    primaryAsr,
    asrAttempts,
    asrFailedOver,
} = {}) {
    const itemStage = mapEngineStageToItemStage(stage);
    let phase = 'running';
    if (itemStage === 'done') phase = 'done';
    else if (itemStage === 'cancelled') phase = 'cancelled';
    else if (itemStage === 'failed') phase = 'failed';
    const itemProgress = Number.isFinite(Number(percent)) ? Number(percent) : (
        phase === 'done' ? 100 : (
            itemStage === 'starting' || itemStage === 'model' || itemStage === 'vad'
            || itemStage === 'denoise' || itemStage === 'separate'
            || itemStage === 'scene' || itemStage === 'vad_failover' || itemStage === 'cleanup' ? 0 : undefined
        )
    );
    const totalSec = Number(mediaDurationSec);
    const currentSec = Number(processedSec);
    const dualPhase = itemStage === 'translate'
        ? 'translate'
        : (itemStage === 'transcribe' ? 'source' : null);
    const asr = String(asrModel || '').trim();
    const primary = String(primaryAsr || '').trim();
    const attempts = Math.floor(Number(asrAttempts) || 0);
    return {
        fullPath: file,
        index: index1,
        total,
        phase,
        itemStage,
        itemDualPhase: dualPhase,
        itemDetail: detail || stage || '',
        itemProgress,
        error: phase === 'failed' ? (error || detail || '失败') : undefined,
        errorCode: phase === 'failed' ? (errorCode || undefined) : undefined,
        resumable: phase === 'failed' ? !!resumable : undefined,
        resumeFromJobId: phase === 'failed' && resumable ? (resumeFromJobId || '') : undefined,
        recovery: phase === 'failed' ? (recovery || undefined) : undefined,
        subtitlePath,
        sourceSubtitlePath,
        targetSubtitlePath,
        bilingualSubtitlePath,
        videoCurrentSec: Number.isFinite(currentSec) && currentSec >= 0 ? currentSec : undefined,
        videoTotalSec: Number.isFinite(totalSec) && totalSec > 0 ? totalSec : undefined,
        asrModel: asr || undefined,
        primaryAsr: primary || undefined,
        asrAttempts: attempts > 0 ? attempts : undefined,
        asrFailedOver: asrFailedOver === true || (asr && primary && asr !== primary && attempts > 1)
            ? true
            : undefined,
    };
}

function extractOutputPaths(result) {
    const outputs = Array.isArray(result?.outputs) ? result.outputs : [];
    const dual = outputs.find((o) => o?.role === 'dual') || null;
    const source = outputs.find((o) => o?.role === 'source') || null;
    const target = outputs.find((o) => (
        o?.role === 'zh' || o?.role === 'target' || o?.role === 'translation'
    )) || null;
    const any = outputs[0] || null;
    return {
        subtitlePath: dual?.path || target?.path || source?.path || any?.path || '',
        sourceSubtitlePath: source?.path || '',
        targetSubtitlePath: target?.path || '',
        bilingualSubtitlePath: dual?.path || '',
    };
}

function mapEngineResultsToHistoryOutputs(results) {
    return (Array.isArray(results) ? results : []).map((r) => ({
        videoPath: String(r?.path || '').trim(),
        subtitlePath: String(r?.subtitlePath || '').trim(),
        sourceSubtitlePath: String(r?.sourceSubtitlePath || '').trim(),
        targetSubtitlePath: String(r?.targetSubtitlePath || '').trim(),
        bilingualSubtitlePath: String(r?.bilingualSubtitlePath || '').trim(),
        status: r?.cancelled ? 'cancelled' : (r?.ok ? 'done' : 'failed'),
    })).filter((o) => o.subtitlePath || o.videoPath);
}

module.exports = {
    mapEngineStageToItemStage,
    ENGINE_STAGE_ZH,
    engineStageZh,
    buildUiProgress,
    extractOutputPaths,
    mapEngineResultsToHistoryOutputs,
};
