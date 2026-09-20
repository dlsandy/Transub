/**
 * releaseGpuAfter policy for Engine batch jobs (multi-file auto release; Sakura/smart unchanged).
 */
const qwenBatchCore = require('../src/js/qwen-asr-batch-core');

function isQwenAsrModelId(asrModelId) {
    return qwenBatchCore.isQwenAsrModel(asrModelId);
}

/**
 * Per batch item. Explicit user true/false is always honored.
 * Auto (null): Sakura/smart → release; multi-file → release between items
 * (avoids sticky CUDA→CPU caches and VRAM poison on later queue items);
 * single-file → hold until batch-end soft-release.
 *
 * @param {object} merged
 * @param {{ sakuraOrSmart?: boolean, batchItemCount?: number, asrModel?: string }} ctx
 */
function resolveReleaseGpuAfterForBatchItem(merged = {}, ctx = {}) {
    const sakuraOrSmart = !!ctx.sakuraOrSmart;
    const explicit = merged.releaseGpuAfter;

    if (sakuraOrSmart) {
        if (explicit != null) return !!explicit;
        return true;
    }

    if (explicit === true) return true;
    if (explicit === false) return false;

    const batchN = Math.max(0, Number(ctx.batchItemCount) || 0);
    // Multi-file auto: unload between items so WhisperSeg/SenseVoice/Qwen CPU fallback
    // and fragmented CUDA context do not stick across the rest of the queue.
    if (batchN > 1) {
        return true;
    }

    // Auto + single-file: hold during the job; batch-end release handles VRAM.
    return false;
}

/**
 * After a multi-file Qwen batch that kept GPU loaded, release once if user did not opt into per-job release.
 * @deprecated Prefer shouldReleaseGpuAfterBatch — kept for older call sites/tests.
 */
function shouldReleaseGpuAfterQwenBatch(merged = {}, ctx = {}) {
    if (ctx.sakuraOrSmart) return false;
    if (merged.releaseGpuAfter === true) return false;
    const batchN = Number(ctx.batchItemCount) || 0;
    const asr = String(ctx.primaryAsr || ctx.asrModel || merged.engineAsrModel || '').trim();
    if (!isQwenAsrModelId(asr) || batchN <= 1) return false;
    return true;
}

/**
 * Soft-release engine VRAM once after the whole batch finishes.
 * - releaseGpuAfter === false → keep warm (never)
 * - true / null (auto) → always release at end so SenseVoice/Whisper/Qwen do not leave VRAM stuck
 *
 * Per-job unload is still controlled by resolveReleaseGpuAfterForBatchItem.
 */
function shouldReleaseGpuAfterBatch(merged = {}, _ctx = {}) {
    if (merged.releaseGpuAfter === false) return false;
    return true;
}

module.exports = {
    isQwenAsrModelId,
    resolveReleaseGpuAfterForBatchItem,
    shouldReleaseGpuAfterQwenBatch,
    shouldReleaseGpuAfterBatch,
};
