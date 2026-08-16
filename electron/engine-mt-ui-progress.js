/**
 * Map external MT adapter progress → main-window overall percent (MT band 68–96).
 * Engine SSE is authoritative for cue-level overall %; adapter ticks fill gaps during
 * long LLM batches so the bar and status keep moving.
 */
const MT_BAND_LO = 68;
const MT_BAND_HI = 96;

function createMtUiProgressTracker() {
    return {
        file: '',
        index1: 0,
        total: 0,
        lastOverall: MT_BAND_LO,
        lastAdapterPct: null,
    };
}

function noteEngineTranslatePercent(tracker, percent) {
    const n = Number(percent);
    if (!tracker || !Number.isFinite(n)) return;
    tracker.lastOverall = Math.max(
        MT_BAND_LO,
        Math.min(MT_BAND_HI, Math.max(Number(tracker.lastOverall) || MT_BAND_LO, n)),
    );
}

function setMtUiCurrent(tracker, { file, index1, total } = {}) {
    if (!tracker) return;
    if (file) tracker.file = String(file);
    if (Number(index1) > 0) tracker.index1 = Number(index1);
    if (Number(total) > 0) tracker.total = Number(total);
    tracker.lastAdapterPct = null;
    tracker.lastOverall = Math.max(MT_BAND_LO, Number(tracker.lastOverall) || MT_BAND_LO);
}

/**
 * @param {object} info adapter / smart-translate onProgress payload
 * @param {ReturnType<typeof createMtUiProgressTracker>} tracker
 * @returns {{ stage: string, percent: number, detail: string, file: string, index1: number, total: number }|null}
 */
function mapAdapterMtProgress(info, tracker) {
    if (!tracker || !tracker.file) return null;
    const detail = String(info?.message || info?.detail || info?.phase || '').trim() || '翻译中';
    const local = Number(info?.pct ?? info?.percent);
    let overall = Math.max(MT_BAND_LO, Number(tracker.lastOverall) || MT_BAND_LO);

    if (Number.isFinite(local)) {
        const clamped = Math.max(0, Math.min(100, local));
        if (tracker.lastAdapterPct != null && clamped < tracker.lastAdapterPct) {
            // New engine HTTP batch resets adapter-local pct; keep overall floor.
            tracker.lastAdapterPct = clamped;
        } else {
            const prev = tracker.lastAdapterPct == null ? clamped : tracker.lastAdapterPct;
            const gain = Math.max(0, clamped - prev);
            tracker.lastAdapterPct = clamped;
            // One full adapter pass ≈ a few overall points; engine SSE will sync higher.
            const bump = gain > 0 ? Math.max(1, Math.round(gain * 0.04)) : 0;
            overall = Math.min(MT_BAND_HI - 1, overall + bump);
        }
    }

    tracker.lastOverall = Math.max(overall, Number(tracker.lastOverall) || MT_BAND_LO);
    return {
        stage: 'translate',
        percent: tracker.lastOverall,
        detail,
        file: tracker.file,
        index1: tracker.index1 || 1,
        total: tracker.total || 1,
    };
}

module.exports = {
    MT_BAND_LO,
    MT_BAND_HI,
    createMtUiProgressTracker,
    noteEngineTranslatePercent,
    setMtUiCurrent,
    mapAdapterMtProgress,
};
