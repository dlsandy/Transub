/**
 * Qwen3-ASR batch mode for Engine jobs (shared by batch / range / QC paths).
 */
const qwenBatchCore = require('../src/js/qwen-asr-batch-core');

function resolveQwenAsrBatchModeForJob(options = {}) {
    let mode = qwenBatchCore.normalizeQwenAsrBatchMode(options.qwenAsrBatchMode);
    if (String(options.perfProfile || 'quality').trim().toLowerCase() === 'speed') {
        mode = 'conservative';
    }
    return mode;
}

module.exports = {
    resolveQwenAsrBatchModeForJob,
};
