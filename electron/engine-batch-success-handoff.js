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
        let startMs = Number(c.startMs);
        let endMs = Number(c.endMs);
        if (!Number.isFinite(startMs)) {
            startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : i * 1000;
        }
        if (!Number.isFinite(endMs)) {
            endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : startMs + 1000;
        }
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
 * Run confidence handoff + optional low-confidence ASR second opinion.
 * Returns log lines for the bridge.
 */
async function runBatchSuccessHandoff(jobResult, outPaths = {}, options = {}) {
    const logs = [];
    const confidence = handoffAsrConfidence(jobResult, outPaths, options);
    if (confidence.ok && confidence.entryCount) {
        logs.push(
            `已写入 ASR 置信度 ${confidence.entryCount} 条${confidence.heuristic ? '（启发式）' : ''} → ${path.basename(confidence.path || '')}`,
        );
    } else if (confidence.ok === false && confidence.error) {
        logs.push(`ASR 置信度写入跳过: ${confidence.error}`);
    }

    let secondOpinion = { ok: true, skipped: true, reason: 'not_run' };
    try {
        const mediaPath = asStringLike(options.mediaPath || outPaths.mediaPath);
        const subtitlePath = pickSecondOpinionSubtitlePath(outPaths, confidence);
        if (mediaPath && subtitlePath) {
            const { runAsrSecondOpinionPass } = require('./engine-asr-second-opinion');
            secondOpinion = await runAsrSecondOpinionPass({
                mediaPath,
                subtitlePath,
                targetSubtitlePath: pickSecondOpinionTargetPath(outPaths, subtitlePath),
                primaryAsr: options.primaryAsr || options.engineAsrModel || options.asrModel,
                options,
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

    return { confidence, secondOpinion, logs };
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
    runBatchSuccessHandoff,
    pickSecondOpinionSubtitlePath,
    pickSecondOpinionTargetPath,
};
