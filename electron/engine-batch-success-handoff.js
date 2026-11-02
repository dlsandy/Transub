/**
 * Post-ASR success handoff: confidence sidecar seeding.
 * Kept out of engine-bridge (thin wiring only).
 */
const path = require('path');
const fs = require('fs');
const { seedAsrConfidenceMeta, pickEngineCuesForConfidence } = require('./asr-confidence-seed');

function listSubtitleSeedTargets(outPaths = {}) {
    const seedTargets = [
        outPaths.sourceSubtitlePath,
        outPaths.subtitlePath,
        outPaths.targetSubtitlePath,
    ].filter(Boolean);
    return [...new Set(seedTargets.map((p) => path.resolve(String(p))))];
}

function engineCuesToMs(engineCues) {
    return (Array.isArray(engineCues) ? engineCues : []).map((c, i) => {
        const startSec = Number(c.start ?? c.startSec);
        const endSec = Number(c.end ?? c.endSec);
        const rawStartMs = c.startMs;
        const rawEndMs = c.endMs;
        let startMs = rawStartMs == null || rawStartMs === '' ? NaN : Number(rawStartMs);
        let endMs = rawEndMs == null || rawEndMs === '' ? NaN : Number(rawEndMs);
        if (!Number.isFinite(startMs)
            || (startMs <= 0 && Number.isFinite(startSec) && startSec > 0.05)) {
            startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : i * 1000;
        }
        if (!Number.isFinite(endMs)
            || (endMs <= startMs && Number.isFinite(endSec) && endSec > (Number.isFinite(startSec) ? startSec : startMs / 1000))) {
            endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : startMs + 1000;
        }
        if (!(endMs > startMs)) endMs = startMs + 1000;
        return { startMs, endMs, text: String(c.text || '') };
    }).filter((c) => c.text);
}

/**
 * Seed .transub.json confidence from engine job cues onto the first writable subtitle.
 * @returns {{ ok: boolean, entryCount?: number, heuristic?: boolean, path?: string, skipped?: boolean, reason?: string, error?: string }}
 */
function handoffAsrConfidence(jobResult, outPaths = {}, options = {}) {
    const engineCues = pickEngineCuesForConfidence(jobResult);
    if (!engineCues.length) {
        return { ok: true, skipped: true, reason: 'no_cues' };
    }
    const uniqueSeeds = listSubtitleSeedTargets(outPaths);
    const existsSync = options.existsSync || ((p) => fs.existsSync(p));
    for (const subPath of uniqueSeeds) {
        if (!existsSync(subPath)) continue;
        if (!/\.(srt|vtt|lrc)$/i.test(subPath)) continue;
        const seeded = seedAsrConfidenceMeta(subPath, engineCues, options);
        if (seeded?.ok && seeded.entryCount) {
            return {
                ok: true,
                entryCount: seeded.entryCount,
                heuristic: !!seeded.heuristic,
                path: seeded.path || subPath,
            };
        }
        if (seeded?.skipped) continue;
        if (seeded && seeded.ok === false) {
            return { ok: false, error: seeded.error || 'seed_failed', path: subPath };
        }
    }
    return { ok: true, skipped: true, reason: 'no_seed_target' };
}

/**
 * When 解析标签 = 保存并加音效旁注: write [笑声] etc. onto source subtitle text.
 */
function handoffAudioEventSideNotes(jobResult, outPaths = {}, options = {}) {
    try {
        const richApi = require('../src/js/sensevoice-rich-tags-core');
        if (richApi.normalizeSensevoiceRichTagsMode(options.sensevoiceRichTags) !== 'sdh') {
            return { ok: true, skipped: true, reason: 'mode_not_sdh' };
        }
        const engineCues = pickEngineCuesForConfidence(jobResult);
        if (!engineCues.length) return { ok: true, skipped: true, reason: 'no_cues' };

        const { readSubtitleMeta } = require('./subtitle-meta');
        const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');

        const targets = [
            outPaths.sourceSubtitlePath,
            outPaths.subtitlePath,
        ].filter(Boolean).map((p) => path.resolve(String(p)));
        const unique = [...new Set(targets)];
        for (const subPath of unique) {
            if (!fs.existsSync(subPath) || !/\.(srt|vtt|lrc)$/i.test(subPath)) continue;
            const doc = readSubtitleDocument(subPath);
            if (!doc?.ok || !Array.isArray(doc.cues) || !doc.cues.length) continue;

            let cues = doc.cues;
            const metaDoc = readSubtitleMeta(subPath);
            if (Array.isArray(metaDoc?.meta?.entries) && metaDoc.meta.entries.length) {
                cues = richApi.attachRichFromSidecarEntries(cues, metaDoc.meta.entries, options);
            } else {
                // Fall back to engine cue rich fields by time overlap.
                const engMs = engineCues.map((c, i) => {
                    const startSec = Number(c.start ?? c.startSec);
                    const endSec = Number(c.end ?? c.endSec);
                    let startMs = Number(c.startMs);
                    let endMs = Number(c.endMs);
                    if (!Number.isFinite(startMs)) {
                        startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : i * 1000;
                    }
                    if (!Number.isFinite(endMs)) {
                        endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : startMs + 1000;
                    }
                    return {
                        startMs,
                        endMs,
                        text: String(c.text || ''),
                        emotion: c.emotion,
                        audioEvent: c.audioEvent || c.audio_event,
                        senseLang: c.senseLang,
                    };
                });
                cues = richApi.attachRichFromSidecarEntries(cues, engMs, options);
            }

            const applied = richApi.applyAudioEventSideNotes(cues, options);
            if (!applied.changed) continue;
            const written = writeSubtitleDocument(subPath, {
                cues: applied.cues,
                format: doc.format,
                header: doc.header,
                backupMode: options.backupMode || 'off',
            });
            if (written?.ok) {
                return {
                    ok: true,
                    changed: applied.changed,
                    path: subPath,
                };
            }
        }
        return { ok: true, skipped: true, reason: 'no_changes' };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

/**
 * Seed confidence and optionally run second opinion (before MT / post-batch).
 * @returns {{ confidence: object, secondOpinion: object, logs: string[] }}
 */
async function runAsrPostTranscribeHandoff(jobResult, outPaths = {}, options = {}) {
    const logs = [];
    const confidence = handoffAsrConfidence(jobResult, outPaths, options);
    if (confidence.ok && confidence.entryCount) {
        logs.push(
            `已写入 ASR 置信度 ${confidence.entryCount} 条${confidence.heuristic ? '（启发式）' : ''} → ${path.basename(confidence.path || '')}`,
        );
    } else if (confidence.ok === false && confidence.error) {
        logs.push(`ASR 置信度写入跳过: ${confidence.error}`);
    }

    const sideNotes = handoffAudioEventSideNotes(jobResult, outPaths, options);
    if (sideNotes.ok && sideNotes.changed) {
        logs.push(
            `已加音效旁注 ${sideNotes.changed} 条 → ${path.basename(sideNotes.path || '')}`,
        );
    } else if (sideNotes.ok === false && sideNotes.error) {
        logs.push(`音效旁注跳过: ${sideNotes.error}`);
    }

    // Quality pipeline: band cues after confidence so SO can prefer yellow/red.
    let bandByIndex = options.bandByIndex || options.cueRiskBands || null;
    const bandSeedPath = pickSecondOpinionSubtitlePath(outPaths, confidence)
        || String(outPaths.sourceSubtitlePath || outPaths.subtitlePath || '').trim();
    if (bandSeedPath) {
        try {
            const { seedCueRiskBandsAfterConfidence } = require('./engine-pre-mt-qc-handoff');
            const seeded = seedCueRiskBandsAfterConfidence(bandSeedPath, options);
            if (seeded?.ok && seeded.bandResult?.byIndex) {
                bandByIndex = seeded.bandResult.byIndex;
                if (seeded.summaryLine) logs.push(seeded.summaryLine);
            }
        } catch (_) { /* optional */ }
    }

    const mediaPathForPass = asStringLike(options.mediaPath || outPaths.mediaPath);
    const subtitlePathForPass = pickSecondOpinionSubtitlePath(outPaths, confidence);

    // Scene-acoustic band re-listen before second opinion (VAD coverage first).
    let acousticBands = { ok: true, skipped: true, reason: 'not_run' };
    const includeAcoustic = options.includeAcousticBandAdapt !== false
        && options.skipAcousticBandAdapt !== true;
    if (includeAcoustic && mediaPathForPass && subtitlePathForPass) {
        try {
            const { runAcousticBandRelistenPass } = require('./engine-acoustic-bands');
            acousticBands = await runAcousticBandRelistenPass({
                mediaPath: mediaPathForPass,
                subtitlePath: subtitlePathForPass,
                durationSec: options.durationSec,
                bands: options.acousticBands,
                primaryHint: options.primaryAcousticHint
                    || options.senseAcoustic?.hint
                    || 'neutral',
                options,
                onLog: (line) => logs.push(line),
                onProgress: options.onProgress,
            });
            if (acousticBands?.replacedWindows > 0) {
                logs.push(`声学分带补听已采纳 ${acousticBands.replacedWindows} 段`);
            }
        } catch (err) {
            logs.push(`声学分带补听跳过: ${err.message || err}`);
            acousticBands = { ok: false, error: err.message || String(err) };
        }
    }

    // Sentence ladder after re-listen so a replaced window is not glued again,
    // and before second opinion so new boundaries can expose real gaps.
    let sentenceSplit = { ok: true, skipped: true, reason: 'not_run' };
    if (includeAcoustic && mediaPathForPass && subtitlePathForPass) {
        try {
            const { runAcousticSentenceSplitPass } = require('./engine-acoustic-sentence-split');
            sentenceSplit = await runAcousticSentenceSplitPass({
                mediaPath: mediaPathForPass,
                subtitlePath: subtitlePathForPass,
                bands: options.acousticBands,
                primaryAsr: options.primaryAsr || options.engineAsrModel || options.asrModel,
                options,
                onLog: (line) => logs.push(line),
                onProgress: options.onProgress,
            });
        } catch (err) {
            logs.push(`声学断句跳过: ${err.message || err}`);
            sentenceSplit = { ok: false, error: err.message || String(err) };
        }
    }

    // Cheap energy start/edge snap after split (soft-AV island pad → first speech).
    let startSnap = { ok: true, skipped: true, reason: 'not_run' };
    if (mediaPathForPass && subtitlePathForPass && options.skipAsrStartSnap !== true) {
        try {
            const { runAsrStartSnapPass } = require('./engine-asr-start-snap');
            startSnap = await runAsrStartSnapPass({
                mediaPath: mediaPathForPass,
                subtitlePath: subtitlePathForPass,
                timingAudioPath: options.timingAudioPath,
                options,
                onLog: (line) => logs.push(line),
                onProgress: options.onProgress,
            });
        } catch (err) {
            logs.push(`ASR 起点吸附跳过: ${err.message || err}`);
            startSnap = { ok: false, error: err.message || String(err) };
        }
    }

    let secondOpinion = { ok: true, skipped: true, reason: 'not_run' };
    const includeSecondOpinion = options.includeSecondOpinion !== false
        && options.skipSecondOpinion !== true;

    if (includeSecondOpinion) {
        try {
            const mediaPath = mediaPathForPass;
            const subtitlePath = subtitlePathForPass;
            if (mediaPath && subtitlePath) {
                const { runAsrSecondOpinionPass } = require('./engine-asr-second-opinion');
                secondOpinion = await runAsrSecondOpinionPass({
                    mediaPath,
                    subtitlePath,
                    targetSubtitlePath: pickSecondOpinionTargetPath(outPaths, subtitlePath),
                    primaryAsr: options.primaryAsr || options.engineAsrModel || options.asrModel,
                    options: {
                        ...options,
                        bandByIndex: bandByIndex || options.bandByIndex,
                        cueRiskBands: bandByIndex || options.cueRiskBands,
                    },
                    onLog: (line) => logs.push(line),
                    onProgress: options.onProgress,
                });
                if (secondOpinion?.replacedWindows > 0) {
                    logs.push(
                        `ASR 低置信二意见已采纳 ${secondOpinion.replacedWindows} 窗`
                        + (secondOpinion.sibling ? `（${secondOpinion.sibling}）` : ''),
                    );
                    if (secondOpinion.targetBlanked > 0) {
                        logs.push(
                            `ASR 二意见译文档已对齐清空 ${secondOpinion.targetBlanked} 条（可补译）`,
                        );
                    }
                } else if (secondOpinion && !secondOpinion.skipped && secondOpinion.attempted) {
                    logs.push('ASR 低置信二意见已跑，未采纳更优结果');
                }
            }
        } catch (err) {
            logs.push(`ASR 二意见跳过: ${err.message || err}`);
            secondOpinion = { ok: false, error: err.message || String(err) };
        }
    }

    return { confidence, secondOpinion, acousticBands, sentenceSplit, startSnap, logs, bandByIndex };
}

/** @deprecated alias — prefer runAsrPostTranscribeHandoff */
async function runBatchSuccessHandoff(jobResult, outPaths = {}, options = {}) {
    return runAsrPostTranscribeHandoff(jobResult, outPaths, options);
}

function asStringLike(v) {
    return String(v || '').trim();
}

function pickSecondOpinionSubtitlePath(outPaths = {}, confidence = {}) {
    const candidates = [
        outPaths.sourceSubtitlePath,
        confidence.path,
        outPaths.subtitlePath,
    ].filter(Boolean).map((p) => path.resolve(String(p)));
    for (const p of candidates) {
        if (/\.(srt|vtt|lrc)$/i.test(p) && fs.existsSync(p)) return p;
    }
    return '';
}

function pickSecondOpinionTargetPath(outPaths = {}, sourcePath = '') {
    const src = path.resolve(String(sourcePath || ''));
    const candidates = [
        outPaths.targetSubtitlePath,
        outPaths.subtitlePath,
    ].filter(Boolean).map((p) => path.resolve(String(p)));
    for (const p of candidates) {
        if (!p || p === src) continue;
        if (/\.src\.(srt|vtt|lrc)$/i.test(p)) continue;
        if (/\.(srt|vtt|lrc)$/i.test(p) && fs.existsSync(p)) return p;
    }
    return '';
}

module.exports = {
    listSubtitleSeedTargets,
    engineCuesToMs,
    handoffAsrConfidence,
    handoffAudioEventSideNotes,
    runAsrPostTranscribeHandoff,
    runBatchSuccessHandoff,
    pickSecondOpinionSubtitlePath,
    pickSecondOpinionTargetPath,
};
