/**
 * 批量语境重构：读字幕 → 重构 → 写回
 */
const path = require('path');
const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
const dualCore = require('../src/js/dual-subtitle-core');
const { asString, asPlainObject, asNumber } = require('./ipc-validate');

function attachSourceTexts(cues, sourceCues) {
    const list = Array.isArray(cues) ? cues : [];
    const sources = Array.isArray(sourceCues) ? sourceCues : [];
    if (!sources.length) {
        return list.map((c) => ({
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text || '',
            sourceText: '',
        }));
    }
    return list.map((c) => {
        const hit = dualCore.findBestOverlapCue(sources, c.startMs, c.endMs);
        return {
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text || '',
            sourceText: String(hit?.cue?.text || ''),
        };
    });
}

function mergeTextsIntoCues(cues, updates) {
    const map = new Map((updates || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    let changed = 0;
    const next = (cues || []).map((c, i) => {
        const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
        if (!map.has(idx)) return { ...c };
        const text = map.get(idx);
        if (text !== c.text) changed += 1;
        return { ...c, text };
    });
    return { cues: next, changed };
}

/**
 * @param {object} deps
 * @param {(payload: object) => Promise<object>} deps.reconstructCues - 已含许可/BYOK/模块逻辑
 */
async function reconstructOneSubtitleFile(file, deps = {}) {
    const filePath = asString(file?.path || file, 4096).trim();
    if (!filePath) return { ok: false, error: '缺少字幕路径' };

    const sourcePath = asString(file?.sourcePath, 4096).trim();
    const reconstructCues = deps.reconstructCues;
    if (typeof reconstructCues !== 'function') {
        return { ok: false, error: '缺少 reconstructCues' };
    }

    let doc;
    try {
        doc = readSubtitleDocument(filePath);
    } catch (err) {
        return { ok: false, error: err.message || '读取字幕失败', path: filePath };
    }
    if (!doc?.ok) {
        return { ok: false, error: doc?.error || '读取字幕失败', path: filePath };
    }
    if (!doc.cues?.length) {
        return { ok: true, skipped: true, path: filePath, summary: '无字幕条目' };
    }

    let sourceCues = [];
    if (sourcePath) {
        try {
            const srcDoc = readSubtitleDocument(sourcePath);
            if (srcDoc?.ok) sourceCues = srcDoc.cues || [];
        } catch (_) { /* ignore */ }
    }

    const cuesPayload = attachSourceTexts(doc.cues, sourceCues);
    const options = asPlainObject(deps.options);
    const result = await reconstructCues({
        cues: cuesPayload,
        windowCues: asNumber(options.windowCues, { min: 5, max: 80, fallback: 30 }),
        overlapCues: asNumber(options.overlapCues, { min: 0, max: 12, fallback: 2 }),
        preserveTiming: options.preserveTiming !== false,
        note: asString(options.note || options.userNote, 2000),
        userNote: asString(options.userNote, 2000),
        sceneGapMs: options.sceneGapMs,
        sceneMaxCues: options.sceneMaxCues,
        sceneMinCues: options.sceneMinCues,
        sceneMaxMs: options.sceneMaxMs,
        filmTitle: asString(options.filmTitle || options.title, 120),
        filmSynopsis: asString(options.filmSynopsis || options.synopsis, 800),
        filmTerms: asString(options.filmTerms || options.terms, 800),
        intensity: options.intensity,
        filmBrief: options.filmBrief || null,
        skipConsistency: options.skipConsistency === true,
        briefSampleMode: options.briefSampleMode,
        glossary: deps.glossary || null,
        dryRun: !!options.dryRun,
        signal: deps.signal,
    });

    if (!result?.ok) {
        return {
            ok: false,
            error: result?.error || '重构失败',
            code: result?.code,
            path: filePath,
        };
    }

    const merged = mergeTextsIntoCues(doc.cues, result.cues);
    if (!merged.changed) {
        return {
            ok: true,
            written: false,
            path: filePath,
            summary: result.message || '无文本变更',
            stats: result.stats,
            via: result.via,
        };
    }

    const written = writeSubtitleDocument(filePath, {
        format: doc.format,
        cues: merged.cues,
        header: doc.header,
        backupMode: options.backupMode || 'off',
    });
    if (!written?.ok) {
        return { ok: false, error: written?.error || '写回失败', path: filePath };
    }

    return {
        ok: true,
        written: true,
        path: filePath,
        summary: `已改写 ${merged.changed} 条`,
        changed: merged.changed,
        stats: result.stats,
        via: result.via,
        mock: !!result.mock,
    };
}

async function runBatchContextReconstruct(files, deps = {}) {
    const list = Array.isArray(files) ? files : [];
    const results = [];
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;

    for (let i = 0; i < list.length; i += 1) {
        if (deps.signal?.aborted) {
            return {
                ok: false,
                cancelled: true,
                error: '已取消',
                results,
                summary: `已取消（完成 ${results.length}/${list.length}）`,
            };
        }
        const file = list[i];
        const filePath = asString(file?.path || file, 4096).trim();
        onProgress?.({
            phase: 'file',
            index: i + 1,
            total: list.length,
            path: filePath,
            name: path.basename(filePath),
        });
        const one = await reconstructOneSubtitleFile(file, {
            ...deps,
            reconstructCues: (cuePayload) => deps.reconstructCues({
                ...cuePayload,
                _fileIndex: i + 1,
                _fileName: path.basename(filePath),
            }),
        });
        results.push(one);
        onProgress?.({
            phase: 'file-done',
            index: i + 1,
            total: list.length,
            path: filePath,
            name: path.basename(filePath),
            result: one,
        });
    }

    const okCount = results.filter((r) => r.ok && !r.skipped).length;
    const written = results.filter((r) => r.written).length;
    const failed = results.filter((r) => !r.ok).length;
    return {
        ok: failed === 0,
        results,
        summary: `批量完成：写回 ${written}/${list.length} · 失败 ${failed}`,
        stats: { total: list.length, ok: okCount, written, failed },
    };
}

/**
 * Film + batch reconstruct job orchestration (no proprietary prompts/algorithms).
 * Bound from advanced-bridge via createAdvancedBatchReconstruct(host).
 *
 * @param {object} host
 * @param {(feature: string) => object} host.requireFeature
 * @param {object} host.entitlement
 * @param {(v: any) => object} host.asPlainObject
 * @param {(payload: object) => object} host.enrichReconstructPayloadFromSettings
 * @param {() => { doc: object }} host.readAdvancedDoc
 * @param {() => void} host.clearManagedIdleStopTimer
 * @param {(doc: object, opts?: object) => Promise<object>} host.resolveAdvancedLlmConfig
 * @param {(llm: object, meta?: object) => void} host.logAdvancedLlmToEngine
 * @param {() => object} host.loadAdvancedModule
 * @param {() => boolean} host.isAppPackaged
 * @param {() => boolean} host.allowBuiltinProAlgorithms
 * @param {(featureLabel?: string, detail?: string) => object} host.missingClosedModuleError
 * @param {(err: any) => object} host.mapCaughtAbortError
 * @param {(llm: object, input?: object) => void} host.releaseManagedLlmAfterJob
 * @param {(payload?: object, event?: any) => Promise<object>} host.runContextReconstruct
 * @param {() => void} host.cancelContextReconstruct
 * @param {(timeoutMs?: number) => Promise<boolean>} host.waitForComputeLockIdle
 * @param {() => void} host.stopManagedLlmServerQuiet
 * @param {AbortController | null} host.batchAbortController (mutable get/set)
 */
function createAdvancedBatchReconstruct(host = {}) {
    const required = [
        'requireFeature',
        'entitlement',
        'asPlainObject',
        'enrichReconstructPayloadFromSettings',
        'readAdvancedDoc',
        'clearManagedIdleStopTimer',
        'resolveAdvancedLlmConfig',
        'logAdvancedLlmToEngine',
        'loadAdvancedModule',
        'isAppPackaged',
        'allowBuiltinProAlgorithms',
        'missingClosedModuleError',
        'mapCaughtAbortError',
        'releaseManagedLlmAfterJob',
        'runContextReconstruct',
        'cancelContextReconstruct',
        'waitForComputeLockIdle',
        'stopManagedLlmServerQuiet',
    ];
    for (const key of required) {
        if (host[key] == null || (typeof host[key] !== 'function' && key !== 'entitlement')) {
            if (key === 'entitlement' && host.entitlement && typeof host.entitlement === 'object') continue;
            if (typeof host[key] !== 'function') {
                throw new Error(`createAdvancedBatchReconstruct: host.${key} required`);
            }
        }
    }

    /**
     * 影片理解重构：Brief + 场景分块（独立功能，保留原语境重构）。
     */
    async function runFilmContextReconstruct(payload = {}, event = null) {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_film_reconstruct',
            owner: 'Pro',
            source: 'runFilmContextReconstruct',
        }, payload, () => runFilmContextReconstructBody(payload, event));
    }

    async function runFilmContextReconstructBody(payload = {}, event = null) {
        const gateFilm = host.requireFeature(host.entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT);
        const gateBasic = host.requireFeature(host.entitlement.FEATURE_CONTEXT_RECONSTRUCT);
        if (!gateFilm.ok && !gateBasic.ok) return gateFilm;

        const input = host.enrichReconstructPayloadFromSettings(host.asPlainObject(payload));
        // Disk setting is source of truth when editor omitted briefSampleMode (separate BrowserWindow).
        if (!input.briefSampleMode && !input.briefUseFullText && !input.useFullText) {
            try {
                const { loadSettings } = require('./settings-data');
                const mode = String(loadSettings()?.options?.filmBriefSampleMode || '').trim().toLowerCase();
                if (mode === 'full' || mode === 'auto') input.briefSampleMode = mode;
            } catch (_) { /* ignore */ }
        }
        const doc = host.readAdvancedDoc().doc;
        const dryRun = !!input.dryRun
            || !!doc.reconstructMock
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

        let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };

        try {
            if (!dryRun) {
                host.clearManagedIdleStopTimer();
                llm = await host.resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
                if (!llm.ok) return llm;
                host.logAdvancedLlmToEngine(llm, { feature: '影片理解' });
                // Keep llama-server alive for the whole multi-step film job.
                host.clearManagedIdleStopTimer();
            }
            const sendProgress = (info) => {
                const payloadOut = {
                    mode: input._batchMode ? 'batch' : 'single',
                    reconstructMode: 'film',
                    llmSource: llm.source,
                    ...info,
                };
                if (typeof input.onProgress === 'function') {
                    try { input.onProgress(payloadOut); } catch (_) { /* ignore */ }
                }
                try {
                    event?.sender?.send?.('transub-advanced-reconstruct-progress', payloadOut);
                } catch (_) { /* ignore */ }
            };

            const byokPayload = {
                provider: llm.provider || doc.byok?.provider || 'openai',
                baseUrl: llm.baseUrl || '',
                model: llm.model || '',
                apiKey: llm.apiKey || '',
            };

            const modLoad = host.loadAdvancedModule();
            // Unpackaged (npm start): always use live electron/ sources so Brief/local-LLM
            // fixes apply without rebuilding `_advanced`. Packaged installs keep the closed blob.
            const useClosedFilm = host.isAppPackaged()
                && modLoad.loaded
                && typeof modLoad.module.filmContextReconstruct === 'function';
            if (useClosedFilm) {
                try {
                    sendProgress({ phase: 'start', message: '正在调用 Pro 影片理解模块…', pct: 0 });
                    const result = await modLoad.module.filmContextReconstruct({
                        ...input,
                        byok: byokPayload,
                        onProgress: sendProgress,
                    });
                    return { ok: true, ...(result && typeof result === 'object' ? result : { result }), via: 'module', llmSource: llm.source };
                } catch (err) {
                    return host.mapCaughtAbortError(err);
                }
            }

            if (!host.allowBuiltinProAlgorithms()) {
                return host.missingClosedModuleError('影片理解重构', modLoad.error || modLoad.message);
            }
            const { runBuiltinFilmContextReconstruct } = require('./advanced-film-reconstruct');
            const result = await runBuiltinFilmContextReconstruct({
                ...input,
                byok: byokPayload,
                onProgress: sendProgress,
            });
            if (!result?.ok) return result;
            return { ...result, via: result.mock ? 'mock' : 'builtin-film', llmSource: llm.source };
        } finally {
            host.releaseManagedLlmAfterJob(llm, input);
        }
    }

    async function runBatchContextReconstructJob(event, payload = {}) {
        const input = host.asPlainObject(payload);
        const filmMode = String(input.mode || input.reconstructMode || '').trim() === 'film';
        const gate = filmMode
            ? (host.requireFeature(host.entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT).ok
                ? host.requireFeature(host.entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT)
                : host.requireFeature(host.entitlement.FEATURE_CONTEXT_RECONSTRUCT))
            : host.requireFeature(host.entitlement.FEATURE_CONTEXT_RECONSTRUCT);
        if (!gate.ok) return gate;

        const files = Array.isArray(input.files) ? input.files : [];
        if (!files.length) {
            return { ok: false, error: '请选择至少一个字幕文件' };
        }

        const computeLock = require('./compute-task-lock');
        host.cancelContextReconstruct();
        await host.waitForComputeLockIdle();
        return computeLock.runWithComputeLock({
            kind: 'advanced_batch_reconstruct',
            owner: 'Pro',
            source: 'runBatchContextReconstructJob',
        }, () => runBatchContextReconstructJobLocked(event, payload));
    }

    async function runBatchContextReconstructJobLocked(event, payload = {}) {
        const input = host.asPlainObject(payload);
        const filmMode = String(input.mode || input.reconstructMode || '').trim() === 'film';
        const files = Array.isArray(input.files) ? input.files : [];

        host.batchAbortController = new AbortController();
        const signal = host.batchAbortController.signal;

        let glossary = null;
        try {
            const { readGlossary } = require('./glossary-data');
            const g = readGlossary();
            if (g?.ok && g.glossary) glossary = g.glossary;
            else if (g?.glossary) glossary = g.glossary;
            else if (g?.entries) glossary = g;
        } catch (_) { /* ignore */ }

        const sendProgress = (info) => {
            const payloadOut = {
                mode: 'batch',
                reconstructMode: filmMode ? 'film' : 'basic',
                ...info,
            };
            try {
                event?.sender?.send?.('transub-advanced-batch-progress', payloadOut);
                event?.sender?.send?.('transub-advanced-reconstruct-progress', payloadOut);
            } catch (_) { /* ignore */ }
        };

        const runOne = filmMode ? runFilmContextReconstruct : host.runContextReconstruct;
        const label = filmMode ? '批量影片理解重构' : '批量语境重构';

        try {
            sendProgress({
                phase: 'start',
                fileIndex: 0,
                fileTotal: files.length,
                message: `${label}：共 ${files.length} 个文件`,
                pct: 0,
            });
            const result = await runBatchContextReconstruct(files, {
                glossary,
                options: {
                    windowCues: input.windowCues,
                    overlapCues: input.overlapCues,
                    preserveTiming: input.preserveTiming,
                    note: input.note,
                    dryRun: input.dryRun,
                    backupMode: input.backupMode || 'off',
                    sceneGapMs: input.sceneGapMs,
                    sceneMaxCues: input.sceneMaxCues,
                    sceneMaxMs: input.sceneMaxMs,
                    userNote: input.userNote,
                    filmTitle: input.filmTitle || input.title,
                    filmSynopsis: input.filmSynopsis || input.synopsis,
                    filmTerms: input.filmTerms || input.terms,
                    intensity: input.intensity,
                    filmBrief: input.filmBrief || null,
                    skipConsistency: input.skipConsistency === true,
                    briefSampleMode: input.briefSampleMode,
                },
                signal,
                reconstructCues: (cuePayload) => runOne({
                    ...cuePayload,
                    signal,
                    _batchMode: true,
                    onProgress: (chunkInfo) => {
                        const fileLabel = cuePayload._fileName
                            ? `「${cuePayload._fileName}」`
                            : `文件 ${cuePayload._fileIndex}/${files.length}`;
                        const baseMsg = chunkInfo.message || '';
                        sendProgress({
                            ...chunkInfo,
                            fileIndex: cuePayload._fileIndex,
                            fileTotal: files.length,
                            fileName: cuePayload._fileName,
                            message: baseMsg
                                ? `${fileLabel} ${baseMsg}`
                                : `${fileLabel} 处理中…`,
                        });
                    },
                }),
                onProgress: (fileInfo) => {
                    if (fileInfo.phase === 'file') {
                        const filePct = Math.round(((fileInfo.index - 1) / Math.max(1, fileInfo.total)) * 100);
                        sendProgress({
                            ...fileInfo,
                            fileIndex: fileInfo.index,
                            fileTotal: fileInfo.total,
                            fileName: fileInfo.name,
                            message: `文件 ${fileInfo.index}/${fileInfo.total}「${fileInfo.name}」`,
                            pct: filePct,
                        });
                    } else {
                        sendProgress(fileInfo);
                    }
                },
            });
            sendProgress({
                phase: result?.cancelled ? 'cancelled' : 'done',
                fileTotal: files.length,
                message: result?.summary || '批量完成',
                pct: result?.cancelled ? undefined : 100,
            });
            return result;
        } finally {
            host.batchAbortController = null;
            host.stopManagedLlmServerQuiet();
        }
    }

    return {
        runFilmContextReconstruct,
        runFilmContextReconstructBody,
        runBatchContextReconstructJob,
        runBatchContextReconstructJobLocked,
    };
}

module.exports = {
    attachSourceTexts,
    mergeTextsIntoCues,
    reconstructOneSubtitleFile,
    runBatchContextReconstruct,
    createAdvancedBatchReconstruct,
};
