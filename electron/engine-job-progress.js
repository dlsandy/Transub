/**
 * Engine batch → UI progress mapping (pure).
 */
const TRANSLATE_LOAD_LO = 65;
const TRANSLATE_WORK_LO = 70;
const TRANSLATE_BAND_HI = 95;

/** @type {Map<string, { sawWork: boolean, entryEmitted: boolean }>} */
const translateProgressSessions = new Map();

function normalizeProgressFileKey(filePath) {
    return String(filePath || '').replace(/\//g, '\\').toLowerCase();
}

function getTranslateProgressSession(filePath) {
    const key = normalizeProgressFileKey(filePath);
    if (!key) return { sawWork: false, entryEmitted: false, maxDone: 0, maxTotal: 0 };
    let session = translateProgressSessions.get(key);
    if (!session) {
        session = { sawWork: false, entryEmitted: false, maxDone: 0, maxTotal: 0 };
        translateProgressSessions.set(key, session);
    }
    return session;
}

function translateRatioCap(done, total) {
    const d = Math.max(0, Number(done) || 0);
    const t = Math.max(0, Number(total) || 0);
    if (t <= 0) return null;
    if (d <= 0) return TRANSLATE_LOAD_LO;
    return Math.round(
        TRANSLATE_WORK_LO + (d / t) * (TRANSLATE_BAND_HI - TRANSLATE_WORK_LO),
    );
}

function applyTranslateProgressFloor(fields, session = {}, floor) {
    const f = Number(floor);
    const p = Number(fields.percent ?? fields.itemProgress);
    if (!Number.isFinite(f) || !Number.isFinite(p) || p >= f) return fields;
    const done = Number(session.maxDone) || 0;
    const total = Number(session.maxTotal) || 0;
    if (f >= TRANSLATE_BAND_HI - 1 && done <= 0) return fields;
    if (total > 0) {
        const cap = translateRatioCap(done, total);
        if (cap != null && f > cap + 3) return fields;
    }
    return {
        ...fields,
        percent: f,
        itemProgress: f,
    };
}

function resetTranslateProgressSession(filePath) {
    const key = normalizeProgressFileKey(filePath);
    if (key) translateProgressSessions.delete(key);
}

function clearTranslateProgressSessions() {
    translateProgressSessions.clear();
}

function parseTranslateWorkNumerator(detail) {
    const text = String(detail || '');
    // Engine SSE / external_http: "翻译 40/1283". Ignore adapter chunk labels
    // (推理翻译 2/5, Sakura 翻译 2/5, 分块翻译, 窗口 5/10) — those are batch-local, not job-wide.
    if (/(?:Sakura|推理|重新|分块|机器|Hy-MT2|GalTransl|TranslateGemma)\s*翻译/i.test(text)) return null;
    const m = text.match(/(?:^|[^a-zA-Z])翻译\s+(\d+)\s*[/／]\s*(\d+)/i);
    if (!m) return null;
    const done = Number(m[1]);
    const total = Number(m[2]);
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
    return { done: Math.max(0, done), total };
}

function isPreTranslateProgressStage(stage) {
    const s = String(stage || '').toLowerCase();
    return !s || s === 'starting' || s === 'queued' || s === 'model' || s === 'vad'
        || s === 'vad_failover' || s === 'denoise' || s === 'separate' || s === 'scene'
        || s === 'transcribe' || s === 'asr' || s === 'running' || s === 'asr-second-opinion'
        || s === 'source_cleanup' || s === 'asr_semantic_repair' || s === 'semantic_repair'
        || s === 'pre_mt_qc';
}

/**
 * Hold premature translate-band spikes (engine done@100 remapped to 95, adapter pct 100)
 * until batch detail shows real cue progress.
 * @param {object} fields
 * @param {{ sawWork?: boolean, entryEmitted?: boolean }} session
 * @param {{ floor?: number }} [opts]
 * @returns {object}
 */
function softenTranslateProgressFields(fields = {}, session = {}, opts = {}) {
    const stage = String(fields.stage || fields.itemStage || '').toLowerCase();
    if (stage !== 'translate' && stage !== 'mt') return fields;
    const pct = Number(fields.percent ?? fields.itemProgress);
    if (!Number.isFinite(pct)) return fields;

    const detail = String(fields.detail || fields.itemDetail || '');
    const batch = parseTranslateWorkNumerator(detail);
    if (batch && batch.total > 0) {
        if (batch.done > 0) session.sawWork = true;
        session.maxDone = Math.max(Number(session.maxDone) || 0, batch.done);
        session.maxTotal = Math.max(Number(session.maxTotal) || 0, batch.total);
    }
    const workDone = batch?.done ?? session.maxDone ?? 0;
    const workTotal = batch?.total ?? session.maxTotal ?? 0;
    const ratioCap = translateRatioCap(workDone, workTotal);
    let result = null;
    if (ratioCap != null) {
        const headroom = workDone <= 0 ? 5 : 2;
        if (pct > ratioCap + headroom) {
            if (workDone <= 0 && !session.entryEmitted) {
                session.entryEmitted = true;
                result = {
                    ...fields,
                    percent: TRANSLATE_LOAD_LO,
                    itemProgress: TRANSLATE_LOAD_LO,
                    detail: detail && !/完成|done|finished/i.test(detail)
                        ? detail
                        : '翻译加载中…',
                };
            } else {
                const capped = Math.min(pct, ratioCap + headroom);
                result = {
                    ...fields,
                    percent: capped,
                    itemProgress: capped,
                };
            }
        }
    }

    if (!result && !session.sawWork && pct > TRANSLATE_WORK_LO) {
        if (!session.entryEmitted) {
            session.entryEmitted = true;
            result = {
                ...fields,
                percent: TRANSLATE_LOAD_LO,
                itemProgress: TRANSLATE_LOAD_LO,
                detail: detail && !/完成|done|finished/i.test(detail)
                    ? detail
                    : '翻译加载中…',
            };
        } else {
            result = {
                ...fields,
                percent: Math.min(pct, TRANSLATE_LOAD_LO + 5),
                itemProgress: Math.min(pct, TRANSLATE_LOAD_LO + 5),
            };
        }
    }

    return applyTranslateProgressFloor(result || fields, session, opts.floor);
}

function mapEngineStageToItemStage(stage) {
    const s = String(stage || '').toLowerCase();
    if (!s || s === 'queued' || s === 'starting' || s === 'status') return 'starting';
    if (s === 'model' || s === 'vad' || s === 'denoise' || s === 'separate') return s;
    if (s === 'scene' || s === 'vad_failover' || s === 'cleanup') return s;
    if (s === 'source_cleanup') return 'source_cleanup';
    if (s === 'asr_semantic_repair' || s === 'semantic_repair') return 'semantic_repair';
    if (s === 'pre_mt_qc') return 'pre_mt_qc';
    if (s === 'translate' || s === 'mt') return 'translate';
    if (s === 'polish' || s === 'plot_polish') return 'cleanup';
    if (s === 'save' || s === 'write') return 'save';
    if (s === 'qc_fix' || s === 'qc') return 'qc_fix';
    if (s === 'qc_loop' || s === 'loop') return 'qc_loop';
    if (s === 'postprocess' || s === 'finalize') return 'postprocess';
    if (s === 'done' || s === 'batch_done') return 'done';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'error' || s === 'failed') return 'failed';
    if (s === 'running' || s === 'asr' || s === 'asr-second-opinion' || s === 'transcribe') {
        return 'transcribe';
    }
    // Preserve unknown named stages (do not collapse to ASR — that rolls the UI pipe back).
    return s;
}

/** Concise stage labels for main-window engine log (match status badges). */
const ENGINE_STAGE_ZH = Object.freeze({
    starting: '启动',
    denoise: '轻度降噪',
    separate: '人声分离',
    scene: '场景切分',
    vad: '语音检测',
    vad_failover: 'VAD 回退',
    cleanup: '译文校正',
    source_cleanup: '原文校正',
    semantic_repair: '原文校正',
    pre_mt_qc: '译前质量门闸',
    qc_loop: 'QC 闭环',
    model: '加载识别模型',
    transcribe: '原文提取',
    translate: '翻译',
    save: '保存',
    postprocess: '字幕后期处理',
    qc_fix: '译文校正 · QC修复',
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

function clampPct(value, lo = 0, hi = 100) {
    const n = Number(value);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function scaleBand(localPct, lo, hi) {
    const ratio = clampPct(localPct) / 100;
    return Math.round(lo + (hi - lo) * ratio);
}

function taskHasMt(task) {
    const t = String(task || '').trim().toLowerCase();
    return t === 'translate_mt' || t === 'dual' || t === 'translate';
}

/**
 * Mirror transub_engine.progress.remap_job_progress — map stage-local percent to job-wide.
 * Engine SSE events are already remapped; call this only for bridge-originated ticks.
 */
function remapJobProgress(task, event = {}) {
    const ev = { ...event };
    const stage = String(ev.stage || '').trim().toLowerCase();
    const raw = clampPct(ev.percent);
    const hasMt = taskHasMt(task);

    let overall;
    if (stage === 'done' || stage === 'batch_done') {
        overall = 100;
    } else if (stage === 'error' || stage === 'failed' || stage === 'cancelled') {
        overall = raw > 0 ? Math.round(raw) : Math.round(clampPct(ev.percent));
    } else if (stage === 'starting' || stage === 'queued') {
        overall = 1;
    } else if (['preprocess', 'denoise', 'separate', 'audio', 'scene'].includes(stage)) {
        overall = scaleBand(raw, 1, 5);
    } else if (['model', 'vad', 'vad_failover'].includes(stage)) {
        overall = scaleBand(Math.max(raw, 5), 2, 5);
    } else if (['asr_semantic_repair', 'semantic_repair', 'source_cleanup', 'pre_mt_qc'].includes(stage)) {
        // End of extract-source band (before MT load 65–70).
        overall = scaleBand(raw, hasMt ? 62 : 88, hasMt ? 65 : 92);
    } else if (stage === 'translate' || stage === 'mt') {
        const local = clampPct(raw);
        if (hasMt && local <= 8) {
            overall = scaleBand((local / 8) * 100, 65, 70);
        } else if (hasMt) {
            overall = scaleBand(((local - 8) / 92) * 100, 70, 95);
        } else {
            overall = scaleBand(local, 70, 95);
        }
    } else if (stage === 'cleanup') {
        overall = scaleBand(raw, hasMt ? 95 : 92, hasMt ? 97 : 98);
    } else if (stage === 'postprocess' || stage === 'finalize') {
        overall = scaleBand(raw, 97, 99);
    } else if (stage === 'save' || stage === 'write') {
        overall = scaleBand(raw, hasMt ? 97 : 96, 98);
    } else if (stage === 'qc_fix' || stage === 'qc' || stage === 'qc_loop') {
        overall = scaleBand(raw, 98, 100);
    } else if (['transcribe', 'asr', 'running', 'asr-second-opinion'].includes(stage)) {
        overall = scaleBand(raw, 5, hasMt ? 65 : 92);
    } else {
        overall = Math.round(raw);
    }

    if (stage !== 'done' && stage !== 'batch_done' && overall >= 100) {
        overall = 99;
    }
    if (overall < 1 && !['error', 'failed', 'cancelled'].includes(stage)) {
        overall = 1;
    }

    return {
        ...ev,
        stage: stage || ev.stage,
        percent: overall,
    };
}

/**
 * @param {string} engineTask
 * @param {object} payload bridge onProgress / sendProgress fields
 */
function remapBridgeProgress(engineTask, payload = {}) {
    const remapped = remapJobProgress(engineTask, {
        stage: payload.stage || payload.itemStage,
        percent: payload.percent ?? payload.itemProgress,
    });
    return {
        ...payload,
        stage: remapped.stage,
        percent: remapped.percent,
    };
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
        ellipsisLeft: Number(r?.ellipsisLeft) || 0,
        underfillLeft: Number(r?.underfillLeft) || 0,
        bareHaLeft: Number(r?.bareHaLeft) || 0,
        underLickLeft: Number(r?.underLickLeft) || 0,
        blankRecovered: Number(r?.blankRecovered) || 0,
        blankRounds: Number(r?.blankRounds) || 0,
        blankLeft: Number(r?.blankLeft) || 0,
        qcLoopRetranscribed: Number(r?.qcLoopRetranscribed) || 0,
        qcLoopRetranslated: Number(r?.qcLoopRetranslated) || 0,
        qcIssueCount: Number(r?.qcIssueCount) || 0,
    })).filter((o) => o.subtitlePath || o.videoPath);
}

module.exports = {
    TRANSLATE_LOAD_LO,
    TRANSLATE_WORK_LO,
    TRANSLATE_BAND_HI,
    getTranslateProgressSession,
    resetTranslateProgressSession,
    clearTranslateProgressSessions,
    normalizeProgressFileKey,
    parseTranslateWorkNumerator,
    translateRatioCap,
    applyTranslateProgressFloor,
    isPreTranslateProgressStage,
    softenTranslateProgressFields,
    mapEngineStageToItemStage,
    ENGINE_STAGE_ZH,
    engineStageZh,
    clampPct,
    scaleBand,
    taskHasMt,
    remapJobProgress,
    remapBridgeProgress,
    buildUiProgress,
    extractOutputPaths,
    mapEngineResultsToHistoryOutputs,
};
