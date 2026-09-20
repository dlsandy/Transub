/**
 * Engine log noise filtering (tqdm / access logs / transformers chatter).
 */
const ENGINE_LOG_DROP_PATTERNS = [
    /^\s*\d+%\|/,
    /rtf_avg:/i,
    /\{'load_data':/,
    /Both `max_new_tokens`/,
    /Token indices sequence length is longer/,
    /Recommended: pip install sacremoses/,
    /Loading weights:\s+\d+%/,
    /Notice: ffmpeg is not installed/i,
    /download models from model hub/i,
    /trust_remote_code:/i,
    /scope_map:/i,
    /excludes:/i,
    /Loading ckpt:/i,
    /Loading pretrained params from/i,
    /Building VAD model/i,
    /funasr version:/i,
    /INFO:\s+\S+\s+-\s+"GET \/v1\/(?:jobs|health|capabilities)/i,
    /WARNING:.*max_new_tokens/i,
];

function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences from engine logs
    return String(text || '').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

function normalizeEngineLogLine(line) {
    return stripAnsi(line)
        .replace(/\r/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shouldDropEngineLogLine(line) {
    const text = normalizeEngineLogLine(line);
    if (!text) return true;
    if (!/[A-Za-z\u4e00-\u9fff]/.test(text) && /[|.\d%-]+/.test(text) && text.length < 80) {
        return true;
    }
    return ENGINE_LOG_DROP_PATTERNS.some((re) => re.test(text));
}

function friendlyEngineError(raw) {
    const msg = String(raw || '').trim();
    if (!msg) return '引擎任务失败';
    const lower = msg.toLowerCase();
    if (/fetch failed|failed to fetch|引擎连接失败|引擎未响应|引擎连接被重置/i.test(msg)) {
        if (msg.includes('重试本条')) return msg;
        return '引擎连接失败，可点「重试本条」';
    }
    if (
        lower === 'aborted'
        || lower === 'cancelled'
        || lower.includes('operation was aborted')
        || lower.includes('user aborted')
        || lower.includes('aborterror')
    ) {
        return '操作已中止或请求超时，请重试';
    }
    // Torch re-import poison after sys.modules strip (Qwen3 / SenseVoice).
    if (isTorchEngineProcessPoisonError(msg)) {
        if (msg.includes('Torch 已在本引擎进程中损坏') && !msg.includes('原始错误：')) {
            return msg;
        }
        return (
            'Torch 已在本引擎进程中损坏（重复加载）。'
            + '请完全退出并重启 Transub 后重试；桌面端会尝试自动重启引擎。'
            + (
                /rocm|amd|radeon/i.test(msg)
                    ? '若仍失败，请点「自动修复」补齐 ROCm PyTorch。'
                    : '若仍失败，在设置中「补齐 CUDA PyTorch」。'
            )
            + ` 原始错误：${msg}`
        );
    }
    // torch\\lib\\cublas WinError 999 = DLL conflict with nvidia-cublas already
    // mapped for CT2 — not a missing Toolkit. Whisper does not need torch.
    if (
        (lower.includes('winerror 999') || lower.includes('[winerror 999]'))
        && lower.includes('torch')
        && lower.includes('cublas')
    ) {
        if (lower.includes('qwen3-asr') || lower.includes('qwen3_asr')) {
            return (
                'Qwen3-ASR 加载 PyTorch CUDA 失败（WinError 999 / cuBLAS 冲突）。'
                + '请完全退出并重启 Transub 后重试；'
                + '若仍失败，将设置 → 推理设备改为 CPU（较慢）。'
                + ` 原始错误：${msg}`
            );
        }
        return (
            'Torch CUDA 库与引擎 cuBLAS 冲突（WinError 999）。'
            + 'Whisper/CTranslate2 不依赖 torch；请完全退出并重启 Transub 后重试。'
            + '若仍失败，将设置 → 推理设备改为 CPU。'
            + ` 原始错误：${msg}`
        );
    }
    if (
        (lower.includes('winerror 1114') || lower.includes('[winerror 1114]'))
        && (lower.includes('torch') || lower.includes('cublas'))
    ) {
        return (
            'Torch CUDA 库加载失败（WinError 1114 · cublas）。'
            + '请完全退出并重启 Transub 后重试；若仍失败，在设置中「补齐 CUDA PyTorch」。'
            + ` 原始错误：${msg}`
        );
    }
    if (/qwen3-asr failed \d+\/\d+ (windows|frames)/i.test(msg)
        && /out of memory|cuda oom|显存不足/i.test(msg)) {
        return (
            'Qwen3-ASR 显存不足。请完全退出 Transub 后重试（释放本地大模型显存），'
            + '或改用 Qwen3-ASR 0.6B / Anime Whisper。'
            + ` 原始错误：${msg}`
        );
    }
    if (lower.includes('cublas64_12') || (lower.includes('cublas') && lower.includes('not found'))) {
        return (
            '缺少 CUDA 12 运行库 cublas64_12.dll（Whisper/CTranslate2 需要）。'
            + '引擎已尽量回退 CPU；若仍失败请将设置 → 推理设备改为 CPU，'
            + '或安装 CUDA Toolkit 12 并把其 bin 加入系统 PATH 后重启引擎。'
            + ` 原始错误：${msg}`
        );
    }
    const mtMissing = msg.match(/MT model not installed:\s*([^\s.]+)/i)
        || msg.match(/未安装翻译模型\s+([A-Za-z0-9][\w.-]*)/);
    if (mtMissing) {
        const id = mtMissing[1];
        const hint = (
            `未安装翻译模型 ${id}。`
            + '请在「设置 → 环境 / 模型」下载后再生成；'
            + '若转写已完成，可查看同目录下的 `*.src.partial.*` / `*.src.*` 原文后单独翻译。'
        );
        // Avoid doubling when the engine already returned the same Chinese hint.
        if (msg.includes('请在「设置 → 环境 / 模型」') || msg.includes(hint.slice(0, 20))) {
            return hint;
        }
        return `${hint} 原始错误：${msg}`;
    }
    return msg;
}

/**
 * True when the engine process poisoned torch (docstring / reimport) and needs a
 * fresh Python process — soft GPU release cannot recover.
 */
function isTorchEngineProcessPoisonError(raw) {
    const msg = String(raw || '');
    const lower = msg.toLowerCase();
    if (!msg) return false;
    if (lower.includes('already has a docstring')) return true;
    if (msg.includes('TORCH_REIMPORT_POISON')) return true;
    if (msg.includes('Torch 已在本引擎进程中损坏')) return true;
    if (/torch reimport poisoned/i.test(msg)) return true;
    return false;
}

module.exports = {
    ENGINE_LOG_DROP_PATTERNS,
    stripAnsi,
    normalizeEngineLogLine,
    shouldDropEngineLogLine,
    friendlyEngineError,
    isTorchEngineProcessPoisonError,
};
