/**
 * Engine batch glossary load, MT abort, and history recording.
 */
const path = require('path');

/**
 * @param {{
 *   buildEngineGlossaryPairs: (glossary: object) => Array,
 *   buildEngineAsrGlossaryPairs?: (glossary: object) => Array,
 *   buildEngineAsrHintsFromGlossary?: (glossary: object) => object,
 *   readGlossary?: () => { ok?: boolean, glossary?: object },
 *   readBatchMergedGlossary?: (opts: object) => object,
 *   getAbortController: () => AbortController | null,
 *   setAbortController: (c: AbortController | null) => void,
 *   appendTaskHistory?: (rec: object) => object,
 *   stripPostTaskFields: (opts: object) => object,
 *   mapEngineResultsToHistoryOutputs: (results: Array) => Array,
 *   now?: () => number,
 * }} deps
 */
function createEngineBatchHistory(deps) {
    function loadEngineGlossaryBundle(merged = {}) {
        const glossary = readBatchGlossary(merged);
        return {
            glossary,
            pairs: loadEngineGlossaryPairs({ ...merged, _glossaryCache: glossary }),
            asrExtras: loadEngineAsrExtras({ ...merged, _glossaryCache: glossary }),
        };
    }

    function readBatchGlossary(merged = {}) {
        if (merged._glossaryCache) return merged._glossaryCache;
        try {
            const readBatch = deps.readBatchMergedGlossary || (() => {
                const { readBatchMergedGlossary } = require('./glossary-data');
                return readBatchMergedGlossary;
            })();
            if (typeof readBatch === 'function') {
                return readBatch({
                    mediaPath: merged.mediaPath,
                    outputDir: merged.outputDir,
                    subtitlePath: merged.subtitlePath,
                });
            }
        } catch { /* ignore */ }
        try {
            const readGlossary = deps.readGlossary || (() => {
                const { readGlossary: rg } = require('./glossary-data');
                return rg();
            });
            const gloss = readGlossary();
            if (!gloss?.ok || !gloss.glossary) return null;
            return gloss.glossary;
        } catch {
            return null;
        }
    }

    function loadEngineGlossaryPairs(merged = {}) {
        if (merged.glossaryMtEnabled === false) return [];
        const task = String(merged.task || '');
        if (task !== 'translate' && task !== 'dual') return [];
        if (merged.mtGlossaryMode === 'prompt' || merged._skipEngineGlossaryProtect) {
            return [];
        }
        const glossary = readBatchGlossary(merged);
        if (!glossary) return [];
        return deps.buildEngineGlossaryPairs(glossary) || [];
    }

    function loadEngineAsrExtras(merged = {}) {
        const empty = { asrGlossary: [], initialPrompt: '', hotwords: '' };
        if (merged.glossaryPromptEnabled === false) return empty;
        const glossary = readBatchGlossary(merged);
        if (!glossary) return empty;
        try {
            const buildAsr = deps.buildEngineAsrGlossaryPairs || (() => []);
            const buildHints = deps.buildEngineAsrHintsFromGlossary || (() => ({
                initial_prompt: '',
                hotwords: '',
            }));
            const asrGlossary = buildAsr(glossary) || [];
            const hints = buildHints(glossary) || {};
            return {
                asrGlossary,
                initialPrompt: String(hints.initial_prompt || '').trim(),
                hotwords: String(hints.hotwords || '').trim(),
            };
        } catch {
            return empty;
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
            const saved = append(record);
            try {
                const ingest = deps.ingestShelfEntry || ((rec) => {
                    const { ingestBatchHistoryEntry } = require('./subtitle-shelf');
                    return ingestBatchHistoryEntry(rec);
                });
                ingest(saved || record);
            } catch { /* ignore shelf ingest */ }
            return saved;
        } catch {
            return null;
        }
    }

    return {
        loadEngineGlossaryPairs,
        loadEngineAsrExtras,
        loadEngineGlossaryBundle,
        abortBatchMtAdapter,
        buildEngineBatchHistoryRecord,
        recordEngineBatchHistory,
    };
}

module.exports = {
    createEngineBatchHistory,
};
