/**
 * Pre-MT quality pipeline: risk bands → QC gate → source freeze → holdIndexes.
 * Thin electron orchestration (logic lives in *-core.js).
 */
const path = require('path');
const fs = require('fs');
const policy = require('../src/js/quality-pipeline-policy-core');
const bandCore = require('../src/js/cue-risk-band-core');
const gateCore = require('../src/js/pre-mt-qc-gate-core');
const freezeCore = require('../src/js/source-freeze-meta-core');
const { readSubtitleMeta, writeSubtitleMeta } = require('./subtitle-meta');

function annotationsFromSidecar(subPath) {
    if (!subPath || !fs.existsSync(subPath)) return null;
    try {
        const read = readSubtitleMeta(subPath);
        const entries = read?.meta?.entries;
        if (!Array.isArray(entries) || !entries.length) return null;
        return entries;
    } catch {
        return null;
    }
}

function pickSourceMetaPath(outPaths = {}, options = {}) {
    const candidates = [
        options.sourceSubtitlePath,
        outPaths.sourceSubtitlePath,
        outPaths.subtitlePath,
        options.subtitlePath,
    ].filter(Boolean);
    for (const p of candidates) {
        const resolved = path.resolve(String(p));
        if (/\.(srt|vtt|lrc)$/i.test(resolved) && fs.existsSync(resolved)) return resolved;
    }
    return candidates[0] ? path.resolve(String(candidates[0])) : '';
}

function runPreMtQcHandoff({
    sourceCues,
    outPaths = {},
    options = {},
    onLog,
    onProgress,
} = {}) {
    return runPreMtQcHandoffAsync({
        sourceCues,
        outPaths,
        options,
        onLog,
        onProgress,
    });
}

/**
 * @returns {Promise<{
 *   active: boolean,
 *   holdIndexes: number[],
 *   bandResult: object|null,
 *   gate: object|null,
 *   frozen: boolean,
 *   logs: string[],
 * }>}
 */
async function runPreMtQcHandoffAsync({
    sourceCues,
    outPaths = {},
    options = {},
    onLog,
    onProgress,
} = {}) {
    const logs = [];
    const merged = { ...options };
    if (!policy.isQualityPipelineActive(merged)) {
        return {
            active: false,
            holdIndexes: [],
            bandResult: null,
            gate: null,
            frozen: false,
            logs,
        };
    }

    onProgress?.({
        stage: 'pre_mt_qc',
        detail: '译前质量门闸…',
        percent: 58,
        itemDualPhase: 'source',
    });

    const metaPath = pickSourceMetaPath(outPaths, merged);
    const annotations = annotationsFromSidecar(metaPath)
        || (Array.isArray(merged.asrAnnotations) ? merged.asrAnnotations : null);

    const bandResult = bandCore.bandCues(sourceCues, annotations, merged);
    const gate = gateCore.evaluatePreMtQcGate(sourceCues, {
        ...merged,
        bandResult,
        annotations,
    });

    const holdIndexes = gate.holdIndexes || [];
    if (bandResult.summary) {
        const s = bandResult.summary;
        const line = `风险分档：绿 ${s.green} · 黄 ${s.yellow} · 红 ${s.red}`
            + (holdIndexes.length ? `（暂缓翻译 ${holdIndexes.length} 条）` : '');
        logs.push(line);
        onLog?.(line);
    }
    for (const w of gate.softWarnings || []) {
        if (String(w).startsWith('structure:')) {
            logs.push(`译前门闸结构提示: ${w}`);
        }
    }
    if (!gate.allowMt) {
        const msg = '译前门闸：可用源文不足，仍将尝试翻译（全部 hold）';
        logs.push(msg);
        onLog?.(msg);
    } else if (holdIndexes.length) {
        onLog?.(`译前门闸：红窗/结构异常 ${holdIndexes.length} 条本轮不送译，稍后闭环补译`);
    }

    // Soft edge: yellow cues near red — Laya Choice hold vs allow_mt (tiny quota)
    let finalHold = [...holdIndexes];
    try {
        const yellow = bandResult.yellowIndexes || [];
        const softEdge = yellow
            .filter((idx) => !finalHold.includes(idx))
            .slice(0, 8)
            .map((idx) => ({
                index: idx,
                text: String(sourceCues[idx]?.text ?? ''),
                band: 'yellow',
                reasons: (bandResult.bands?.[idx]?.reasons || []).join(','),
                id: `h${idx}`,
            }))
            .filter((r) => r.text);
        if (softEdge.length >= 2) {
            const { runPreMtSoftHold } = require('./jev-laya-pipelines');
            const decided = await runPreMtSoftHold(softEdge, merged, { onLog });
            for (const row of decided.hold || []) {
                const idx = Number(row.index);
                if (Number.isInteger(idx) && !finalHold.includes(idx)) finalHold.push(idx);
            }
            // allow_mt: if somehow in hold from elsewhere, leave as-is (red stays held)
        }
    } catch { /* soft-fail */ }

    let frozen = false;
    if (metaPath) {
        try {
            const read = readSubtitleMeta(metaPath);
            const next = freezeCore.applySourceFreeze(read.meta || { entries: [] }, sourceCues, {
                holdIndexes: finalHold,
                bandSummary: bandResult.summary,
            });
            // Persist bands on sidecar for polish / post-QC loop
            next.cueRiskBands = bandResult.byIndex;
            next.bandSummary = bandResult.summary;
            const written = writeSubtitleMeta(metaPath, next);
            frozen = !!(written?.ok && freezeCore.isSourceFrozen(next));
            if (frozen) {
                onLog?.('源文已定稿（freeze），开译');
            }
        } catch (err) {
            onLog?.(`源定稿写入跳过: ${err.message || err}`);
        }
    }

    return {
        active: true,
        holdIndexes: finalHold,
        bandResult,
        gate: { ...gate, holdIndexes: finalHold },
        frozen,
        logs,
    };
}

/**
 * After confidence sidecar seed: write green/yellow/red bands for SO priority + later gate.
 * @returns {{ ok: boolean, skipped?: boolean, bandResult?: object, path?: string, summaryLine?: string }}
 */
function seedCueRiskBandsAfterConfidence(subtitlePath, options = {}) {
    if (!policy.isQualityPipelineActive(options)) {
        return { ok: true, skipped: true, reason: 'pipeline_off' };
    }
    const filePath = String(subtitlePath || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
        return { ok: true, skipped: true, reason: 'no_path' };
    }
    let cues = [];
    try {
        const { loadSubtitleCues } = require('./engine-asr-second-opinion');
        cues = loadSubtitleCues(filePath);
    } catch {
        return { ok: true, skipped: true, reason: 'no_cues_loader' };
    }
    if (!cues.length) return { ok: true, skipped: true, reason: 'no_cues' };

    const annotations = annotationsFromSidecar(filePath);
    const bandResult = bandCore.bandCues(cues, annotations, options);
    try {
        const read = readSubtitleMeta(filePath);
        const base = read.meta && typeof read.meta === 'object' ? { ...read.meta } : { entries: [] };
        base.cueRiskBands = bandResult.byIndex;
        base.bandSummary = bandResult.summary;
        const written = writeSubtitleMeta(filePath, base);
        if (!written?.ok) {
            return { ok: false, error: written?.error || 'write_failed', bandResult };
        }
        const s = bandResult.summary || {};
        return {
            ok: true,
            path: written.path || filePath,
            bandResult,
            summaryLine: `风险分档：绿 ${s.green || 0} · 黄 ${s.yellow || 0} · 红 ${s.red || 0}`,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err), bandResult };
    }
}

function shouldSplitBeforeMtForQualityPipeline(options = {}) {
    return policy.isQualityPipelineActive(options);
}

module.exports = {
    runPreMtQcHandoff,
    runPreMtQcHandoffAsync,
    seedCueRiskBandsAfterConfidence,
    shouldSplitBeforeMtForQualityPipeline,
    annotationsFromSidecar,
    pickSourceMetaPath,
};
