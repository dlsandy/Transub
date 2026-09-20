/**
 * Factory RPC handlers — forward to Engine / Advanced / Sakura (no new algorithms).
 */
const path = require('path');

function progressFor(requestId, deps = {}) {
    if (typeof deps.onProgress === 'function') return deps.onProgress;
    const id = String(requestId || '').trim();
    if (!id) return undefined;
    try {
        return require('./editor-factory-progress').makeProgressEmitter(id);
    } catch (_) {
        return undefined;
    }
}

function emitPhase(onProgress, phase, message, extra = {}) {
    if (typeof onProgress !== 'function') return;
    try {
        onProgress({ phase, message, ...extra });
    } catch (_) { /* ignore */ }
}

function normalizeCueList(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const c = list[i] && typeof list[i] === 'object' ? list[i] : {};
        const text = String(c.text ?? c.Text ?? '').trim();
        if (!text) continue;
        const index = Number.isInteger(Number(c.index))
            ? Number(c.index)
            : (Number.isInteger(Number(c.id)) ? Number(c.id) : i);
        const startMs = Number(c.startMs ?? c.start_ms ?? c.start);
        const endMs = Number(c.endMs ?? c.end_ms ?? c.end);
        out.push({
            index,
            id: index,
            text,
            startMs: Number.isFinite(startMs) ? startMs : 0,
            endMs: Number.isFinite(endMs) ? endMs : 0,
            start: Number.isFinite(startMs) ? startMs / 1000 : undefined,
            end: Number.isFinite(endMs) ? endMs / 1000 : undefined,
        });
    }
    return out;
}

function resolveTranslateMode(body = {}) {
    const mode = String(body.mode || body.translateMode || '').trim().toLowerCase();
    if (mode === 'smart' || body.smartTranslate || body.feature === 'smartTranslate') return 'smart';
    if (mode === 'sakura' || mode === 'llm' || body.sakuraMt) return 'sakura';
    if (mode === 'engine' || mode === 'opus') return 'engine';
    // Default: smart when requested via Pro UI; otherwise engine opus.
    if (body.preferSmart) return 'smart';
    return 'engine';
}

function mapBusyOrError(result) {
    if (!result || result.ok) return null;
    const code = String(result.code || '');
    if (code === 'compute_busy' || code === 'busy') {
        return {
            httpStatus: 409,
            body: {
                ok: false,
                code: 'busy',
                error: result.error || '计算任务繁忙',
                holder: result.holder || null,
            },
        };
    }
    if (code === 'not_entitled' || code === 'unauthorized' || code === 'inactive' || code === 'expired') {
        return {
            httpStatus: 403,
            body: {
                ok: false,
                code: 'unauthorized',
                error: result.error || result.message || '未授权',
            },
        };
    }
    if (result.cancelled || code === 'cancelled' || code === 'aborted') {
        return {
            httpStatus: 499,
            body: {
                ok: false,
                code: 'aborted',
                error: result.error || '已取消',
            },
        };
    }
    return {
        httpStatus: 500,
        body: {
            ok: false,
            code: code || 'error',
            error: result.error || result.message || 'Factory 调用失败',
        },
    };
}

function cuesFromResult(result, fallback = []) {
    const list = Array.isArray(result?.cues) ? result.cues : fallback;
    return list.map((c, i) => ({
        index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
        startMs: Number(c.startMs) || 0,
        endMs: Number(c.endMs) || 0,
        text: String(c.text ?? ''),
    }));
}

/**
 * @param {object} body
 * @param {{ runSmartTranslate?: Function, translateCuesWithEngineOpus?: Function, runSakuraTranslate?: Function }} [deps]
 */
async function handleTranslateCues(body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    if (!cues.length) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_cues', error: '没有可翻译的字幕' },
        };
    }

    const mode = resolveTranslateMode(body);
    const requestId = String(body.requestId || '').trim() || null;
    const fileName = String(body.fileName || body.sourcePath || '').trim();
    const onProgress = progressFor(requestId, deps);
    emitPhase(onProgress, 'start', mode === 'smart' ? '智能翻译开始…' : '翻译开始…', { mode });

    let result;
    try {
        if (mode === 'smart') {
            const runSmart = deps.runSmartTranslate
                || require('./advanced-bridge').runSmartTranslate;
            result = await runSmart({
                cues,
                language: body.sourceLanguage || body.language || 'ja',
                targetLanguage: body.targetLanguage || 'zh',
                fileName,
                smartTranslateFaithfulTone: !!body.smartTranslateFaithfulTone || !!body.faithfulTone,
                contentProfile: body.contentProfile || null,
                clientId: body.clientId || 'editor-factory',
                onProgress,
            });
        } else if (mode === 'sakura') {
            const runSakura = deps.runSakuraTranslate
                || require('./sakura-translate').runSakuraTranslate;
            result = await runSakura({
                cues,
                language: body.sourceLanguage || body.language || 'ja',
                fileName,
                contentProfile: body.contentProfile || null,
                onProgress,
            });
        } else {
            const translateOpus = deps.translateCuesWithEngineOpus
                || require('./engine-bridge').translateCuesWithEngineOpus;
            result = await translateOpus({
                cues,
                language: body.sourceLanguage || body.language || 'ja',
                fileName,
                glossary: body.glossary || null,
                onProgress,
            });
        }
    } catch (err) {
        emitPhase(onProgress, 'error', err.message || String(err), { mode });
        return {
            httpStatus: 500,
            body: {
                ok: false,
                code: 'internal',
                error: err.message || String(err),
                requestId,
            },
        };
    }

    const mapped = mapBusyOrError(result);
    if (mapped) {
        mapped.body.requestId = requestId;
        mapped.body.mode = mode;
        emitPhase(onProgress, 'error', mapped.body.error || mapped.body.code, { mode });
        return mapped;
    }

    emitPhase(onProgress, 'done', result.summary || '翻译完成', { mode, pct: 100 });
    return {
        httpStatus: 200,
        body: {
            ok: true,
            mode,
            requestId,
            cues: cuesFromResult(result, cues),
            summary: result.summary || null,
        },
    };
}

/**
 * @param {object} body
 * @param {{ transcribeRangeWithEngine?: Function }} [deps]
 */
async function handleTranscribeRange(body = {}, deps = {}) {
    const mediaPath = path.resolve(String(body.mediaPath || body.videoPath || ''));
    const startMs = Number(body.startMs);
    const endMs = Number(body.endMs);
    const requestId = String(body.requestId || '').trim() || null;

    if (!mediaPath) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'bad_request', error: '缺少 mediaPath', requestId },
        };
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs < 200) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'bad_request', error: '时间范围无效', requestId },
        };
    }

    const onProgress = progressFor(requestId, deps);
    emitPhase(onProgress, 'start', '区间重转写开始…', { startMs, endMs });

    let result;
    try {
        const run = deps.transcribeRangeWithEngine
            || require('./engine-bridge').transcribeRangeWithEngine;
        result = await run({
            mediaPath,
            startMs,
            endMs,
            padMs: body.padMs,
            sourceLanguage: body.sourceLanguage || body.language || 'ja',
            contentProfile: body.contentProfile || null,
            clientId: body.clientId || 'editor-factory',
            options: body.options || {},
            onProgress,
        });
    } catch (err) {
        emitPhase(onProgress, 'error', err.message || String(err));
        return {
            httpStatus: 500,
            body: {
                ok: false,
                code: 'internal',
                error: err.message || String(err),
                requestId,
            },
        };
    }

    const mapped = mapBusyOrError(result);
    if (mapped) {
        mapped.body.requestId = requestId;
        emitPhase(onProgress, 'error', mapped.body.error || mapped.body.code);
        return mapped;
    }

    emitPhase(onProgress, 'done', result.summary || '区间重转写完成', { pct: 100 });
    return {
        httpStatus: 200,
        body: {
            ok: true,
            requestId,
            cues: cuesFromResult(result),
            startMs,
            endMs,
            summary: result.summary || null,
        },
    };
}

function extractCuesFromProResult(result, fallback = []) {
    if (!result || typeof result !== 'object') return cuesFromResult({ cues: fallback }, fallback);
    if (Array.isArray(result.cues)) return cuesFromResult(result, fallback);
    if (result.result && Array.isArray(result.result.cues)) return cuesFromResult(result.result, fallback);
    if (Array.isArray(result.updatedCues)) return cuesFromResult({ cues: result.updatedCues }, fallback);
    return cuesFromResult({ cues: fallback }, fallback);
}

/**
 * @param {string} action context-reconstruct | film-context-reconstruct | qc-smart-fix
 * @param {object} body
 * @param {object} [deps]
 */
async function handleProAction(action, body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    const requestId = String(body.requestId || '').trim() || null;
    if (!cues.length && action !== 'qc-smart-fix') {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_cues', error: '没有可处理的字幕', requestId },
        };
    }

    const advanced = deps.advanced || (() => {
        try { return require('./advanced-bridge'); } catch (_) { return null; }
    })();
    if (!advanced) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'no_advanced', error: 'Advanced 模块不可用', requestId },
        };
    }

    let runner = null;
    let feature = action;
    if (action === 'context-reconstruct') {
        runner = deps.runContextReconstruct || advanced.runContextReconstruct;
        feature = 'contextReconstruct';
    } else if (action === 'film-context-reconstruct') {
        runner = deps.runFilmContextReconstruct || advanced.runFilmContextReconstruct;
        feature = 'filmContextReconstruct';
    } else if (action === 'qc-smart-fix') {
        runner = deps.runQcSmartFix || advanced.runQcSmartFix;
        feature = 'qcSmartFix';
    } else {
        return {
            httpStatus: 404,
            body: { ok: false, code: 'not_found', error: `未知 Pro 动作: ${action}`, requestId },
        };
    }
    if (typeof runner !== 'function') {
        return {
            httpStatus: 501,
            body: { ok: false, code: 'not_implemented', error: `Pro 动作未导出: ${action}`, requestId },
        };
    }

    let result;
    try {
        const onProgress = progressFor(requestId, deps);
        emitPhase(onProgress, 'start', `Pro ${feature} 开始…`, { feature, action });
        result = await runner({
            cues,
            language: body.sourceLanguage || body.language || 'ja',
            targetLanguage: body.targetLanguage || 'zh',
            fileName: body.fileName || body.sourcePath || '',
            contentProfile: body.contentProfile || null,
            mediaPath: body.mediaPath || body.videoPath || null,
            clientId: body.clientId || 'editor-factory',
            onProgress,
            ...((body.options && typeof body.options === 'object') ? body.options : {}),
        });
        const mappedEarly = mapBusyOrError(result);
        if (mappedEarly) {
            mappedEarly.body.requestId = requestId;
            mappedEarly.body.feature = feature;
            emitPhase(onProgress, 'error', mappedEarly.body.error || mappedEarly.body.code, { feature });
            return mappedEarly;
        }
        emitPhase(onProgress, 'done', result.summary || result.message || 'Pro 完成', {
            feature,
            pct: 100,
        });
        return {
            httpStatus: 200,
            body: {
                ok: true,
                feature,
                requestId,
                cues: extractCuesFromProResult(result, cues),
                summary: result.summary || result.message || null,
                via: result.via || null,
            },
        };
    } catch (err) {
        const onProgress = progressFor(requestId, deps);
        emitPhase(onProgress, 'error', err.message || String(err), { feature });
        return {
            httpStatus: 500,
            body: { ok: false, code: 'internal', error: err.message || String(err), requestId },
        };
    }
}

async function handleConvertChinese(body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    const requestId = String(body.requestId || '').trim() || null;
    if (!cues.length) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_cues', error: '没有可转换的字幕', requestId },
        };
    }
    const chinese = deps.chineseCore || require('../src/js/subtitle-chinese-core');
    const direction = String(body.direction || 's2t').toLowerCase() === 't2s' ? 't2s' : 's2t';
    const locale = body.locale || 'twp';
    try {
        const converted = chinese.convertCues(cues, {
            direction,
            locale,
            protectTerms: Array.isArray(body.protectTerms) ? body.protectTerms : undefined,
        });
        return {
            httpStatus: 200,
            body: {
                ok: true,
                requestId,
                direction,
                locale,
                cues: cuesFromResult({ cues: converted.cues || converted.nextCues || converted }, cues),
                stats: converted.stats || null,
                summary: converted.summary
                    || (chinese.directionLabel
                        ? chinese.directionLabel(direction, locale)
                        : `${direction} 转换完成`),
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'opencc_error', error: err.message || String(err), requestId },
        };
    }
}

async function handleCompactRepetition(body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    const requestId = String(body.requestId || '').trim() || null;
    if (!cues.length) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_cues', error: '没有可压缩的字幕', requestId },
        };
    }
    const fluency = deps.fluencyCore || require('../src/js/subtitle-fluency-core');
    try {
        const out = fluency.compressRepetitionInCues(cues, body.options || {});
        return {
            httpStatus: 200,
            body: {
                ok: true,
                requestId,
                cues: cuesFromResult({ cues: out.cues || out }, cues),
                stats: out.stats || null,
                summary: out.summary
                    || (out.stats?.cueTouched ? `已压缩 ${out.stats.cueTouched} 条` : '无叠词可压缩'),
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'internal', error: err.message || String(err), requestId },
        };
    }
}

async function handleQcReport(body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    const requestId = String(body.requestId || '').trim() || null;
    const qc = deps.qcCore || require('../src/js/subtitle-qc-core');
    try {
        const scan = qc.scanCueIssues(cues, body.options || qc.defaultPostBatchQcScanOptions?.() || {});
        const summaryText = qc.summarizeScan ? qc.summarizeScan(scan.summary || scan) : '';
        return {
            httpStatus: 200,
            body: {
                ok: true,
                requestId,
                summary: summaryText || scan.summary || null,
                issues: scan.issues || scan.items || [],
                counts: scan.summary || null,
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'internal', error: err.message || String(err), requestId },
        };
    }
}

async function handleQcFix(body = {}, deps = {}) {
    const cues = normalizeCueList(body.cues);
    const requestId = String(body.requestId || '').trim() || null;
    if (!cues.length) {
        return {
            httpStatus: 400,
            body: { ok: false, code: 'empty_cues', error: '没有可修复的字幕', requestId },
        };
    }
    const qc = deps.qcCore || require('../src/js/subtitle-qc-core');
    try {
        const fixed = qc.applyQcFixes(cues, body.options || {});
        return {
            httpStatus: 200,
            body: {
                ok: true,
                requestId,
                cues: cuesFromResult({ cues: fixed.cues || fixed }, cues),
                stats: fixed.stats || null,
                summary: qc.summarizeFixStats
                    ? qc.summarizeFixStats(fixed.stats || {}, cues.length, (fixed.cues || cues).length)
                    : 'QC 修复完成',
            },
        };
    } catch (err) {
        return {
            httpStatus: 500,
            body: { ok: false, code: 'internal', error: err.message || String(err), requestId },
        };
    }
}

function abortFactoryJobs() {
    // Best-effort: cancel engine range / opus text / factory batch and force-release editor-owned locks.
    try {
        require('./editor-factory-batch').noteFactoryBatchAborted();
    } catch (_) { /* ignore */ }
    try {
        require('./editor-factory-models').noteFactoryDownloadAborted();
    } catch (_) { /* ignore */ }
    try {
        const engine = require('./engine-bridge');
        if (typeof engine.stopEngineJobs === 'function') engine.stopEngineJobs();
    } catch (_) { /* ignore */ }
    try {
        const sakura = require('./sakura-translate');
        if (typeof sakura.cancelSakuraTranslate === 'function') sakura.cancelSakuraTranslate();
    } catch (_) { /* ignore */ }
    try {
        const advanced = require('./advanced-bridge');
        if (typeof advanced.cancelContextReconstruct === 'function') advanced.cancelContextReconstruct();
    } catch (_) { /* ignore */ }
    try {
        const lock = require('./compute-task-lock');
        const st = lock.getStatus();
        if (st.busy) {
            const src = String(st.source || '');
            if (
                src === 'editor-factory'
                || src === 'runSmartTranslate'
                || src === 'translateCuesWithEngineOpus'
                || src === 'transcribeRangeWithEngine'
                || src === 'runSakuraTranslate'
                || src === 'runContextReconstruct'
                || src === 'runFilmContextReconstruct'
                || src === 'runQcSmartFix'
                || src === 'runEngineBatch'
                || src === 'factory-batch'
            ) {
                lock.forceRelease();
                return { ok: true, aborted: true, forced: true, source: src };
            }
        }
    } catch (_) { /* ignore */ }
    return { ok: true, aborted: false };
}

module.exports = {
    normalizeCueList,
    resolveTranslateMode,
    handleTranslateCues,
    handleTranscribeRange,
    handleProAction,
    handleConvertChinese,
    handleCompactRepetition,
    handleQcReport,
    handleQcFix,
    abortFactoryJobs,
    mapBusyOrError,
};
