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
 * Run confidence handoff; returns log lines for the bridge.
 */
function runBatchSuccessHandoff(jobResult, outPaths = {}, options = {}) {
    const logs = [];
    const confidence = handoffAsrConfidence(jobResult, outPaths, options);
    if (confidence.ok && confidence.entryCount) {
        logs.push(
            `已写入 ASR 置信度 ${confidence.entryCount} 条${confidence.heuristic ? '（启发式）' : ''} → ${path.basename(confidence.path || '')}`,
        );
    } else if (confidence.ok === false && confidence.error) {
        logs.push(`ASR 置信度写入跳过: ${confidence.error}`);
    }

    return { confidence, logs };
}

module.exports = {
    listSubtitleSeedTargets,
    engineCuesToMs,
    handoffAsrConfidence,
    runBatchSuccessHandoff,
};
