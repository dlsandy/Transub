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
    if (
        lower === 'aborted'
        || lower === 'cancelled'
        || lower.includes('operation was aborted')
        || lower.includes('user aborted')
        || lower.includes('aborterror')
    ) {
        return '操作已中止或请求超时，请重试';
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

module.exports = {
    ENGINE_LOG_DROP_PATTERNS,
    stripAnsi,
    normalizeEngineLogLine,
    shouldDropEngineLogLine,
    friendlyEngineError,
};
