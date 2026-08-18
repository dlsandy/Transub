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

module.exports = {
    attachSourceTexts,
    mergeTextsIntoCues,
    reconstructOneSubtitleFile,
    runBatchContextReconstruct,
};
