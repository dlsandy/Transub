/**
 * CUDA PyTorch vs llama-server GPU — shared copy and guards (RTX 50 / Blackwell).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineGpuTorch = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineGpuTorchFactory() {
    const QWEN_ASR_RE = /qwen3-asr|qwen3-forced-aligner/i;

    function isQwenAsrModelId(modelId) {
        return QWEN_ASR_RE.test(String(modelId || ''));
    }

    function isTorchCudaMismatch(probe) {
        return !!(probe && probe.torchCudaMismatch);
    }

    function needsTorchCudaForAsr(asrModelId) {
        const id = String(asrModelId || '').trim();
        if (!id) return false;
        return isQwenAsrModelId(id) || /sensevoice/i.test(id);
    }

    function buildTorchMismatchMessage(probe, asrModelId) {
        const want = String(probe?.torchCudaVariant || 'cu128/cu130').trim();
        const have = String(probe?.installedTorchCudaTag || 'cu126').trim();
        const gpu = String(probe?.gpuName || 'Blackwell GPU').trim();
        const asrNote = isQwenAsrModelId(asrModelId)
            ? 'Qwen3-ASR 转写'
            : (needsTorchCudaForAsr(asrModelId) ? '当前 ASR' : 'Demucs / 人声分离');
        return (
            `${asrNote} 需要 ${want} 版 PyTorch；当前为 ${have}，与本机 ${gpu} 不兼容，`
            + '将回退 CPU（极慢）。\n\n'
            + '与 llama-server CUDA 无关，请在「运行环境」点「补齐 CUDA PyTorch」（约 2.5GB）。'
        );
    }

    function buildLlamaFollowUpMessage(probe) {
        const want = String(probe?.torchCudaVariant || 'cu128/cu130').trim();
        return (
            'llama-server 翻译运行时已就绪。\n\n'
            + `本机 RTX 50 系转写/Qwen 还需 ${want} 版 PyTorch（约 2.5GB），`
            + '与刚安装的 llama-server 不是同一组件。\n\n'
            + '是否现在前往运行环境补齐 CUDA PyTorch？'
        );
    }

    function shouldBlockBatchOnTorchMismatch(probe, asrModelId) {
        return isTorchCudaMismatch(probe) && needsTorchCudaForAsr(asrModelId);
    }

    function shouldPromptOnAsrSelect(probe, asrModelId) {
        return isTorchCudaMismatch(probe) && isQwenAsrModelId(asrModelId);
    }

    return {
        isQwenAsrModelId,
        isTorchCudaMismatch,
        needsTorchCudaForAsr,
        buildTorchMismatchMessage,
        buildLlamaFollowUpMessage,
        shouldBlockBatchOnTorchMismatch,
        shouldPromptOnAsrSelect,
    };
}));
