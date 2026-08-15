/**
 * Engine batch glossary load, MT abort, and history recording.
 */
const path = require('path');

/**
 * @param {{
 *   buildEngineGlossaryPairs: (glossary: object) => Array,
 *   readGlossary?: () => { ok?: boolean, glossary?: object },
 *   getAbortController: () => AbortController | null,
 *   setAbortController: (c: AbortController | null) => void,
 *   appendTaskHistory?: (rec: object) => object,
 *   ingestBatchHistoryEntry?: (rec: object) => void,
 *   stripPostTaskFields: (opts: object) => object,
 *   mapEngineResultsToHistoryOutputs: (results: Array) => Array,
 *   now?: () => number,
 * }} deps
 */
function createEngineBatchHistory(deps) {
    function loadEngineGlossaryPairs(merged = {}) {
        if (merged.glossaryMtEnabled === false) return [];
        const task = String(merged.task || '');
        if (task !== 'translate' && task !== 'dual') return [];
        if (merged.mtGlossaryMode === 'prompt' || merged._skipEngineGlossaryProtect) {
            return [];
        }
        try {
            const readGlossary = deps.readGlossary || (() => {
                const { readGlossary: rg } = require('./glossary-data');
                return rg();
            });
            const gloss = readGlossary();
            if (!gloss?.ok || !gloss.glossary) return [];
            return deps.buildEngineGlossaryPairs(gloss.glossary) || [];
        } catch {
            return [];
        }
    }

    function abortBatchMtAdapter() {
        const ctrl = deps.getAbortController();
        if (ctrl) {
            try {
                ctrl.abort();
            } catch { /* ignore */ }
            deps.setAbortController(null);
        }
    }

    function buildEngineBatchHistoryRecord({
        list,
        merged,
        finished,
        startedAt,
        startedMs,
        extraErrors = [],
    } = {}) {
        const results = Array.isArray(finished?.results) ? finished.results : [];
        const resultErrors = results
            .filter((r) => !r?.ok && r?.error && r.error !== 'cancelled')
            .slice(0, 8)
            .map((r) => `${path.basename(String(r.path || ''))}: ${r.error}`);
        const errors = [...(extraErrors || []), ...resultErrors].slice(0, 8);
        const totalDurationSec = (Array.isArray(list) ? list : []).reduce(
            (sum, item) => sum + Math.max(0, Number(item?.durationSec || item?.duration) || 0),
            0,
        );
        const now = typeof deps.now === 'function' ? deps.now() : Date.now();
        return {
            startedAt,
            finishedAt: new Date(now).toISOString(),
            wallSec: Math.max(0, Math.round((now - startedMs) / 1000)),
            totalDurationSec,
            device: merged?.device,
            task: merged?.task,
            total: Array.isArray(list) ? list.length : (Number(finished?.total) || 0),
            generated: Number(finished?.generated) || 0,
            skipped: Number(finished?.skipped) || 0,
            failed: Number(finished?.failed) || 0,
            cancelled: !!finished?.cancelled,
            options: deps.stripPostTaskFields(merged || {}),
            errors,
            outputs: deps.mapEngineResultsToHistoryOutputs(results),
        };
    }

    function recordEngineBatchHistory(input) {
        try {
            const record = buildEngineBatchHistoryRecord(input);
            const append = deps.appendTaskHistory || ((rec) => {
                const { appendTaskHistory } = require('./task-history');
                return appendTaskHistory(rec);
            });
            const historyRecord = append(record);
            try {
                const ingest = deps.ingestBatchHistoryEntry || ((rec) => {
                    const { ingestBatchHistoryEntry } = require('./subtitle-library');
                    return ingestBatchHistoryEntry(rec);
                });
                if (historyRecord && !historyRecord.cancelled) {
                    ingest(historyRecord);
                }
            } catch { /* ignore library ingest errors */ }
            return historyRecord;
        } catch {
            return null;
        }
    }

    return {
        loadEngineGlossaryPairs,
        abortBatchMtAdapter,
        buildEngineBatchHistoryRecord,
        recordEngineBatchHistory,
    };
}

module.exports = {
    createEngineBatchHistory,
};
