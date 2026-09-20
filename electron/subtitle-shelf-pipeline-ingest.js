/**
 * Soft mid-pipeline subtitle-shelf ingest for Engine batch items.
 * Keeps engine-batch-loop thin: one-liner calls + optional log lines.
 */
'use strict';

function softCall(fn, onLog, { okMsg, failMsg } = {}) {
    try {
        const result = fn();
        if (result?.ok) {
            if (okMsg) onLog?.(okMsg);
            return result;
        }
        if (result?.skipped) return result;
        if (result?.error && failMsg) {
            onLog?.(`${failMsg}跳过: ${result.error}`);
        }
        return result || { ok: false };
    } catch (err) {
        if (failMsg) onLog?.(`${failMsg}跳过: ${err?.message || err}`);
        return { ok: false, error: err?.message || String(err) };
    }
}

function resolveSourcePath({ transcriptPath, outPaths, keptSourcePath } = {}) {
    const direct = String(transcriptPath || '').trim();
    if (direct) return direct;
    const fromOut = String(
        outPaths?.sourceSubtitlePath
        || outPaths?.subtitlePath
        || '',
    ).trim();
    if (fromOut) return fromOut;
    return String(keptSourcePath || '').trim();
}

/**
 * After ASR keep: register 转录 slot.
 */
function saveShelfTranscriptAfterAsr(input = {}) {
    const {
        mediaPath,
        transcriptPath,
        outPaths,
        keptSourcePath,
        options,
        onLog,
        root,
    } = input;
    const pathToSave = resolveSourcePath({ transcriptPath, outPaths, keptSourcePath });
    if (!mediaPath || !pathToSave) return { ok: false, skipped: true };
    return softCall(() => {
        const { ingestPipelineTranscript } = require('./subtitle-shelf');
        return ingestPipelineTranscript(
            { mediaPath, transcriptPath: pathToSave, options },
            { root },
        );
    }, onLog, { okMsg: '字幕库已保存转录', failMsg: '字幕库保存转录' });
}

/**
 * After source phase is final (post ASR handoff / SO): ensure 原文 slot.
 */
function saveShelfOriginalAfterSourceReady(input = {}) {
    const {
        mediaPath,
        transcriptPath,
        outPaths,
        keptSourcePath,
        options,
        onLog,
        root,
    } = input;
    if (!mediaPath) return { ok: false, skipped: true };
    const pathToSave = resolveSourcePath({ transcriptPath, outPaths, keptSourcePath });
    return softCall(() => {
        const { ingestPipelineOriginal } = require('./subtitle-shelf');
        return ingestPipelineOriginal(
            { mediaPath, transcriptPath: pathToSave, options },
            { root },
        );
    }, onLog, { okMsg: '字幕库已保存原文', failMsg: '字幕库保存原文' });
}

/**
 * Pre-MT (split dual/translate): materialize keep transcript from final source cues,
 * then register 转录 + 原文 so the shelf lists the item before translation finishes.
 */
function saveShelfSourceSlotsBeforeMt(input = {}) {
    const {
        mediaPath,
        sourceCues,
        outPaths,
        options,
        onLog,
        root,
    } = input;
    if (!mediaPath) return { ok: false, skipped: true };

    let paths = { ...(outPaths && typeof outPaths === 'object' ? outPaths : {}) };
    let keptSourcePath = resolveSourcePath({ outPaths: paths });

    if (Array.isArray(sourceCues) && sourceCues.length) {
        try {
            const { keepTranscriptFromSourceCues } = require('./transcript-keep');
            const kept = keepTranscriptFromSourceCues(sourceCues, mediaPath, {
                ...(options || {}),
                subtitlePath: paths.sourceSubtitlePath || keptSourcePath || '',
                targetSubtitlePath: paths.targetSubtitlePath || paths.subtitlePath || '',
                outputDir: options?.outputDir || '',
            });
            if (kept?.ok && kept.kept?.length) {
                keptSourcePath = String(kept.kept[0] || '').trim() || keptSourcePath;
                if (keptSourcePath) {
                    paths = {
                        ...paths,
                        sourceSubtitlePath: paths.sourceSubtitlePath || keptSourcePath,
                    };
                    onLog?.(`已保存转录字幕 ${kept.kept.length} 条 → ${kept.dir || ''}`);
                }
            } else if (kept && kept.ok === false && kept.error) {
                onLog?.(`保存转录字幕失败: ${kept.error}`);
            }
        } catch (err) {
            onLog?.(`保存转录字幕跳过: ${err?.message || err}`);
        }
    }

    const transcript = saveShelfTranscriptAfterAsr({
        mediaPath,
        keptSourcePath,
        outPaths: paths,
        options,
        onLog,
        root,
    });
    const original = saveShelfOriginalAfterSourceReady({
        mediaPath,
        keptSourcePath,
        outPaths: paths,
        options,
        onLog,
        root,
    });
    return {
        ok: !!(transcript?.ok || original?.ok),
        transcript,
        original,
        outPaths: paths,
        keptSourcePath,
    };
}

/**
 * After per-item success: register 译文 slot (no-op when ASR-only / no target).
 */
function saveShelfTranslationAfterTaskDone(input = {}) {
    const {
        mediaPath,
        translationPath,
        outPaths,
        options,
        onLog,
        root,
    } = input;
    if (!mediaPath) return { ok: false, skipped: true };
    return softCall(() => {
        const { ingestPipelineTranslation } = require('./subtitle-shelf');
        return ingestPipelineTranslation(
            { mediaPath, translationPath, outPaths, options },
            { root },
        );
    }, onLog, { okMsg: '字幕库已保存译文', failMsg: '字幕库保存译文' });
}

module.exports = {
    saveShelfTranscriptAfterAsr,
    saveShelfOriginalAfterSourceReady,
    saveShelfSourceSlotsBeforeMt,
    saveShelfTranslationAfterTaskDone,
    resolveSourcePath,
};
