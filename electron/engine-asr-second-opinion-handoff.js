'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../src/js/asr-second-opinion-core');
const { extractOutputPaths } = require('./engine-job-progress');
const { runAsrPostTranscribeHandoff, engineCuesToMs } = require('./engine-batch-success-handoff');

function isTranslateLikeEngineTask(engineTask) {
    const t = String(engineTask || '').trim().toLowerCase();
    return t === 'translate_mt' || t === 'dual';
}

/**
 * @param {object} fileMerged
 * @param {string} engineTask
 * @param {object} [options]
 */
function planAsrSecondOpinionBatch(fileMerged = {}, engineTask = '', options = {}) {
    const merged = { ...fileMerged, ...options };
    const mode = core.normalizeAsrSecondOpinionOption(merged.asrSecondOpinion);
    if (mode === 'off') {
        return { enabled: false, mode, reason: 'off' };
    }
    const primaryAsr = merged.primaryAsr || merged.engineAsrModel || merged.asrModel || '';
    const should = core.shouldRunAsrSecondOpinion({
        asrSecondOpinion: mode,
        contentProfile: merged.contentProfile || merged.senseProfile,
        primaryAsr,
        engineAsrModel: primaryAsr,
        perfProfile: merged.perfProfile,
    });
    if (!should) {
        const speedSkip = mode !== 'off' && core.isSpeedPerfProfile(merged);
        return { enabled: false, mode, reason: speedSkip ? 'speed_profile' : 'auto_skip' };
    }
    return {
        enabled: true,
        mode,
        splitBeforeMt: isTranslateLikeEngineTask(engineTask),
        reusePrimary: core.shouldReusePrimaryAsrForSecondOpinion(primaryAsr),
    };
}

/**
 * Keep primary ASR loaded through the transcribe-only split when second opinion
 * will re-decode with the same weights (not fragile CT2).
 */
function applyPreMtTranscribeGpuHold(transcribeBody = {}, soPlan = {}) {
    if (!soPlan.enabled || !soPlan.reusePrimary) return transcribeBody;
    return { ...transcribeBody, releaseGpuAfter: false };
}

/**
 * Phase-1 hold with no range jobs still leaves ASR in VRAM; range bursts release themselves.
 */
function shouldReleaseAsrGpuAfterSkippedSecondOpinion(soPlan = {}, soApplied = {}) {
    if (!soPlan.enabled || !soPlan.reusePrimary) return false;
    const attempted = Number(soApplied?.secondOpinion?.attempted);
    return !(Number.isFinite(attempted) && attempted > 0);
}

function engineCuesFromMs(cues) {
    return (Array.isArray(cues) ? cues : []).map((c, i) => {
        const startMs = Number(c?.startMs);
        const endMs = Number(c?.endMs);
        const start = Number.isFinite(startMs) ? startMs / 1000 : i;
        const end = Number.isFinite(endMs) ? endMs / 1000 : start + 1;
        return {
            start,
            end,
            text: String(c?.text || '').trim(),
        };
    }).filter((c) => c.text);
}

/**
 * Ensure a writable JA subtitle path exists for confidence / second opinion.
 */
async function resolveTranscribeSourcePaths(phase1Result, ctx = {}) {
    const outPaths = extractOutputPaths(phase1Result || {});
    let sourcePath = String(outPaths.sourceSubtitlePath || outPaths.subtitlePath || '').trim();
    const mediaPath = String(ctx.mediaPath || ctx.options?.mediaPath || ctx.repairMeta?.mediaPath || '').trim();
    const options = { ...(ctx.options || {}), ...(ctx.fileMerged || {}) };

    if (sourcePath && fs.existsSync(sourcePath)) {
        return { outPaths: { ...outPaths, sourceSubtitlePath: sourcePath }, sourcePath };
    }

    const sourceCues = Array.isArray(ctx.sourceCues) && ctx.sourceCues.length
        ? ctx.sourceCues
        : (phase1Result?.cues?.source || []);
    if (!sourceCues.length) {
        return { outPaths, sourcePath: '' };
    }

    try {
        const { keepTranscriptFromSourceCues } = require('./transcript-keep');
        const kept = keepTranscriptFromSourceCues(sourceCues, mediaPath, options);
        if (kept?.ok && kept.kept?.length) {
            sourcePath = String(kept.kept[0] || '').trim();
            return {
                outPaths: { ...outPaths, sourceSubtitlePath: sourcePath },
                sourcePath,
            };
        }
    } catch { /* fall through */ }

    if (sourcePath) {
        try {
            const { writeSubtitleDocument } = require('./extensions-bridge');
            const msCues = engineCuesToMs(sourceCues);
            const written = writeSubtitleDocument(sourcePath, {
                cues: msCues,
                format: path.extname(sourcePath).replace(/^\./, '') || 'srt',
                backupMode: 'off',
            });
            if (written?.ok) {
                return { outPaths: { ...outPaths, sourceSubtitlePath: sourcePath }, sourcePath };
            }
        } catch { /* ignore */ }
    }

    return { outPaths, sourcePath: '' };
}

/**
 * Seed confidence + optional second opinion immediately after transcribe phase.
 * @returns {{ ok: boolean, sourceCues?: object[], logs?: string[], secondOpinion?: object }}
 */
async function applySecondOpinionAfterTranscribe(ctx = {}) {
    const jobResult = ctx.jobResult || ctx.phase1?.result || null;
    const sourceCuesIn = Array.isArray(ctx.sourceCues) ? ctx.sourceCues : [];
    const resolved = await resolveTranscribeSourcePaths(jobResult, ctx);
    const logs = [];
    const onLog = (line) => {
        logs.push(line);
        ctx.onLog?.(line);
    };

    if (!resolved.sourcePath) {
        return {
            ok: true,
            skipped: true,
            reason: 'no_source_path',
            sourceCues: sourceCuesIn,
            logs,
        };
    }

    const handoff = await runAsrPostTranscribeHandoff(jobResult, resolved.outPaths, {
        ...(ctx.options || {}),
        ...(ctx.fileMerged || {}),
        mediaPath: ctx.mediaPath || ctx.repairMeta?.mediaPath || ctx.options?.mediaPath,
        primaryAsr: ctx.primaryAsr || ctx.repairMeta?.primaryAsr,
        engineAsrModel: ctx.primaryAsr || ctx.repairMeta?.primaryAsr,
        includeSecondOpinion: ctx.includeSecondOpinion !== false,
        onProgress: ctx.onProgress,
        onLog,
    });
    for (const line of handoff.logs || []) {
        if (!logs.includes(line)) logs.push(line);
    }

    let sourceCues = sourceCuesIn;
    try {
        const { loadSubtitleCues } = require('./engine-asr-second-opinion');
        const reread = loadSubtitleCues(resolved.sourcePath);
        if (reread.length) sourceCues = engineCuesFromMs(reread);
    } catch { /* keep input cues */ }

    return {
        ok: true,
        sourceCues,
        sourcePath: resolved.sourcePath,
        outPaths: resolved.outPaths,
        handoff,
        logs,
        secondOpinion: handoff.secondOpinion,
        preMtSecondOpinionDone: true,
    };
}

module.exports = {
    isTranslateLikeEngineTask,
    planAsrSecondOpinionBatch,
    applyPreMtTranscribeGpuHold,
    shouldReleaseAsrGpuAfterSkippedSecondOpinion,
    resolveTranscribeSourcePaths,
    applySecondOpinionAfterTranscribe,
    engineCuesFromMs,
};
