/**
 * Apply pre-MT source filler clean (ono + discourse + inline breath)
 * to in-memory source cues and sync on-disk source SRT.
 */
const fs = require('fs');
const path = require('path');
const onoCore = require('../src/js/pre-mt-onomatopoeia-clean-core');
const sourceFiller = require('../src/js/pre-mt-source-filler-clean-core');

function enrichCuesWithSidecar(cues, options = {}) {
    try {
        const richApi = require('../src/js/sensevoice-rich-tags-core');
        if (!richApi.richTagsEnabled(options.sensevoiceRichTags)) return cues;
        const subPath = String(
            options.sourceSubtitlePath
            || options.subtitlePath
            || '',
        ).trim();
        if (!subPath) return cues;
        const { readSubtitleMeta } = require('./subtitle-meta');
        const doc = readSubtitleMeta(subPath);
        const entries = doc?.meta?.entries;
        if (!Array.isArray(entries) || !entries.length) return cues;
        return richApi.attachRichFromSidecarEntries(cues, entries, options);
    } catch {
        return cues;
    }
}

/**
 * @param {{
 *   sourceCues?: object[],
 *   options?: object,
 *   outPaths?: object,
 *   onLog?: (line: string) => void,
 * }} [input]
 */
function applyPreMtOnomatopoeiaClean(input = {}) {
    const options = input.options && typeof input.options === 'object' ? input.options : {};
    const sourceCues = enrichCuesWithSidecar(input.sourceCues, {
        ...options,
        sourceSubtitlePath: options.sourceSubtitlePath
            || input.outPaths?.sourceSubtitlePath
            || input.outPaths?.subtitlePath,
    });
    // Full pre-MT source pass (keeps export name for handoff compatibility).
    const result = sourceFiller.applyPreMtSourceFillerClean(sourceCues, options);

    if (result.summary && !/无需修改/.test(result.summary)) {
        input.onLog?.(result.summary);
    } else if (
        result.onomatopoeia?.mode !== 'off'
        || result.discourse?.mode !== 'off'
    ) {
        // Still log quiet “无需修改” when either clear/light mode is active.
        input.onLog?.(result.summary);
    }

    let writtenPath = '';
    if (result.changed) {
        writtenPath = syncSourceSubtitleFile(result.cues, input.outPaths || {}, options) || '';
        if (writtenPath) {
            input.onLog?.(`译前源轨清理已写回 ${path.basename(writtenPath)}`);
        }
    }

    return {
        ...result,
        // Compat fields expected by older callers / tests.
        mode: result.onomatopoeia?.mode || result.discourse?.mode || 'clear',
        writtenPath: writtenPath || undefined,
    };
}

function pickSourcePath(outPaths = {}, options = {}) {
    const candidates = [
        outPaths.sourceSubtitlePath,
        options.sourceSubtitlePath,
        outPaths.subtitlePath,
    ];
    for (const raw of candidates) {
        const p = String(raw || '').trim();
        if (!p || !/\.(srt|vtt|lrc)$/i.test(p)) continue;
        try {
            if (fs.existsSync(p)) return p;
        } catch { /* ignore */ }
    }
    return '';
}

function cuesForWrite(cues) {
    try {
        const keep = require('./transcript-keep');
        if (typeof keep.engineCuesToKeepCues === 'function') {
            return keep.engineCuesToKeepCues(cues);
        }
    } catch { /* fall through */ }
    return (Array.isArray(cues) ? cues : []).map((c, i) => {
        let startMs = Number(c?.startMs);
        let endMs = Number(c?.endMs);
        if (!Number.isFinite(startMs)) {
            const s = Number(c?.start);
            startMs = Number.isFinite(s) ? Math.round(s * 1000) : i * 1000;
        }
        if (!Number.isFinite(endMs)) {
            const e = Number(c?.end);
            endMs = Number.isFinite(e) ? Math.round(e * 1000) : startMs + 1000;
        }
        return {
            index: i + 1,
            startMs: Math.max(0, startMs),
            endMs: Math.max(startMs + 1, endMs),
            text: String(c?.text || '').trim(),
        };
    }).filter((c) => c.text);
}

function syncSourceSubtitleFile(cues, outPaths, options) {
    const filePath = pickSourcePath(outPaths, options);
    if (!filePath) return '';
    try {
        const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
        const doc = readSubtitleDocument(filePath);
        if (!doc?.ok) return '';
        const nextCues = cuesForWrite(cues);
        const written = writeSubtitleDocument(filePath, {
            cues: nextCues,
            format: doc.format || 'srt',
            header: doc.header,
            backupMode: 'off',
        });
        if (written?.ok) return filePath;
    } catch { /* optional */ }
    return '';
}

module.exports = {
    applyPreMtOnomatopoeiaClean,
    applyPreMtSourceFillerClean: applyPreMtOnomatopoeiaClean,
    resolveModeFromOptions: onoCore.resolveModeFromOptions,
    resolveInterjectionMode: sourceFiller.resolveInterjectionMode,
    applyPreMtOnomatopoeiaCleanCore: onoCore.applyPreMtOnomatopoeiaClean,
    applyPreMtSourceFillerCleanCore: sourceFiller.applyPreMtSourceFillerClean,
};
