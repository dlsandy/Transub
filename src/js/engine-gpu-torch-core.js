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
        if (!probe) return false;
        // AMD ROCm path is not a CUDA-tag mismatch — do not block on cu128 prompts.
        if (probe.hasRocm && !probe.hasCuda) return false;
        if (probe.torchCudaMismatch) return true;
        // Probe may expose suitability without setting mismatch on older engines.
        return !!(probe.needsTorchCuda128 && probe.torchCudaSuitable === false);
    }

    function needsTorchRocmForAsr(probe, asrModelId) {
        if (!probe?.hasRocm || probe.hasCuda) return false;
        if (probe.torchRocm) return false;
        return needsTorchCudaForAsr(asrModelId);
    }

    function buildTorchRocmMessage(probe, asrModelId) {
        const gpu = String(probe?.gpuName || 'AMD GPU').trim();
        const asrNote = isQwenAsrModelId(asrModelId)
            ? 'Qwen3-ASR 转写'
            : (needsTorchCudaForAsr(asrModelId) ? '当前 ASR' : 'Demucs / 人声分离');
        return (
            `${asrNote} 需要引擎运行时里的 ROCm PyTorch（${gpu}）。\n\n`
            + '在系统 Python 里 pip 安装无效。请点「自动修复」把 ROCm 版装进引擎。'
        );
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
            + '与 llama-server CUDA 无关，请在「运行环境 → GPU」点「补齐 CUDA PyTorch」（约 2.5GB）。'
        );
    }

    function buildLlamaFollowUpMessage(probe) {
        const want = String(probe?.torchCudaVariant || 'cu128/cu130').trim();
        return (
            'llama-server 翻译运行时已就绪。\n\n'
            + `本机 RTX 50 系转写/Qwen 还需 ${want} 版 PyTorch（约 2.5GB），`
            + '与刚安装的 llama-server 不是同一组件。\n\n'
            + '是否现在前往「运行环境 → GPU」补齐 CUDA PyTorch？'
        );
    }

    function shouldBlockBatchOnTorchMismatch(probe, asrModelId) {
        if (needsTorchRocmForAsr(probe, asrModelId)) return true;
        return isTorchCudaMismatch(probe) && needsTorchCudaForAsr(asrModelId);
    }

    function shouldPromptOnAsrSelect(probe, asrModelId) {
        if (needsTorchRocmForAsr(probe, asrModelId)) return true;
        return isTorchCudaMismatch(probe) && isQwenAsrModelId(asrModelId);
    }

    return {
        isQwenAsrModelId,
        isTorchCudaMismatch,
        needsTorchCudaForAsr,
        needsTorchRocmForAsr,
        buildTorchMismatchMessage,
        buildTorchRocmMessage,
        buildLlamaFollowUpMessage,
        shouldBlockBatchOnTorchMismatch,
        shouldPromptOnAsrSelect,
    };
}));
