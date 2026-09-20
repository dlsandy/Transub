const {
    getTranslateProgressSession,
    normalizeProgressFileKey,
    parseTranslateWorkNumerator,
    resetTranslateProgressSession,
    softenTranslateProgressFields,
    translateRatioCap,
    TRANSLATE_WORK_LO,
} = require('./engine-job-progress');

/**
 * Bands (translate/dual): load prep 65–70, translate 70–95.
 * Engine SSE is authoritative for cue-level overall %; adapter ticks fill gaps during
 * long LLM batches so the bar and status keep moving.
 */
const MT_LOAD_LO = 65;
const MT_BAND_LO = 70;
const MT_BAND_HI = 95;

function createMtUiProgressTracker() {
    return {
        file: '',
        index1: 0,
        total: 0,
        lastOverall: MT_LOAD_LO,
        lastAdapterPct: null,
    };
}

function noteEngineTranslatePercent(tracker, percent) {
    const n = Number(percent);
    if (!tracker || !Number.isFinite(n)) return;
    tracker.lastOverall = Math.max(
        MT_LOAD_LO,
        Math.min(MT_BAND_HI, Math.max(Number(tracker.lastOverall) || MT_LOAD_LO, n)),
    );
    // Engine cue progress counts as real work so soften won't collapse back to load band.
    if (n > TRANSLATE_WORK_LO && tracker.file) {
        getTranslateProgressSession(tracker.file).sawWork = true;
    }
}

function setMtUiCurrent(tracker, { file, index1, total } = {}) {
    if (!tracker) return;
    const nextFile = file ? String(file) : '';
    if (nextFile && normalizeProgressFileKey(nextFile) !== normalizeProgressFileKey(tracker.file)) {
        resetTranslateProgressSession(nextFile);
    }
    if (file) tracker.file = String(file);
    if (Number(index1) > 0) tracker.index1 = Number(index1);
    if (Number(total) > 0) tracker.total = Number(total);
    tracker.lastAdapterPct = null;
    tracker.lastOverall = MT_LOAD_LO;
}

/**
 * Map adapter-local 0–100 into overall load(65–70) + translate(70–95).
 * @param {number} localPct
 */
function mapMtLocalToOverall(localPct) {
    const local = Math.max(0, Math.min(100, Number(localPct) || 0));
    if (local <= 8) {
        return Math.round(MT_LOAD_LO + (local / 8) * (MT_BAND_LO - MT_LOAD_LO));
    }
    return Math.round(MT_BAND_LO + ((local - 8) / 92) * (MT_BAND_HI - MT_BAND_LO));
}

/**
 * @param {object} info adapter / smart-translate onProgress payload
 * @param {ReturnType<typeof createMtUiProgressTracker>} tracker
 * @returns {{ stage: string, percent: number, detail: string, file: string, index1: number, total: number }|null}
 */
function mapAdapterMtProgress(info, tracker) {
    if (!tracker) return null;
    // Film-brief dump lines belong in the engine log, not the status badge.
    if (info?.logOnly) return null;
    if (!tracker.file) return null;
    const detail = String(info?.message || info?.detail || info?.phase || '').trim() || '翻译中';
    const local = Number(info?.pct ?? info?.percent);
    const batch = parseTranslateWorkNumerator(detail);

    const session = getTranslateProgressSession(tracker.file || '_pending');
    const engineWorkTotal = Number(session.maxTotal) || 0;
    const engineWorkDone = Number(session.maxDone) || 0;
    const batchHeadroom = Math.max(1, Math.round((MT_BAND_HI - MT_BAND_LO) * 0.08));

    let overall = Math.max(MT_LOAD_LO, Number(tracker.lastOverall) || MT_LOAD_LO);
    if (engineWorkTotal > 0) {
        const engineCap = translateRatioCap(engineWorkDone, engineWorkTotal);
        if (engineCap != null) {
            overall = Math.min(overall, engineCap + batchHeadroom);
        }
    }

    if (Number.isFinite(local)) {
        const clamped = Math.max(0, Math.min(100, local));
        if (tracker.lastAdapterPct != null && clamped < tracker.lastAdapterPct) {
            // New engine HTTP batch resets adapter-local pct; keep overall floor.
            tracker.lastAdapterPct = clamped;
        } else {
            tracker.lastAdapterPct = clamped;
            let mapped;
            if (engineWorkTotal > 0) {
                // Adapter pct is chunk progress inside one engine HTTP batch — micro-bump only.
                const ratioCap = translateRatioCap(engineWorkDone, engineWorkTotal) ?? MT_LOAD_LO;
                const micro = Math.round((clamped / 100) * batchHeadroom);
                mapped = Math.min(MT_BAND_HI, ratioCap + micro);
            } else {
                // Model load / first tick before engine SSE "翻译 0/N" — stay in load band.
                mapped = mapMtLocalToOverall(Math.min(clamped, 8));
            }
            overall = Math.max(overall, Math.min(MT_BAND_HI, mapped));
        }
    }

    if (batch && batch.total > 0) {
        const fromWork = translateRatioCap(batch.done, batch.total);
        if (fromWork != null) {
            const headroom = batch.done > 0 ? batchHeadroom : 0;
            overall = Math.max(overall, Math.min(MT_BAND_HI, fromWork + headroom));
        }
    }

    const preSoftOverall = overall;
    const softened = softenTranslateProgressFields({
        stage: 'translate',
        percent: preSoftOverall,
        detail,
    }, session);
    // Soften must win (do not Math.max back up to preSoftOverall).
    const softPct = Number(softened.percent);
    tracker.lastOverall = Number.isFinite(softPct) ? softPct : Math.max(MT_LOAD_LO, preSoftOverall);
    const out = {
        stage: 'translate',
        percent: tracker.lastOverall,
        detail: softened.detail || detail,
        file: tracker.file,
        index1: tracker.index1 || 1,
        total: tracker.total || 1,
    };
    return out;
}

module.exports = {
    MT_LOAD_LO,
    MT_BAND_LO,
    MT_BAND_HI,
    createMtUiProgressTracker,
    noteEngineTranslatePercent,
    setMtUiCurrent,
    mapMtLocalToOverall,
    mapAdapterMtProgress,
};
