/**
 * Offline ASR runtime extras install (Whisper / SenseVoice pip wheels).
 * Engine HTTP server must be stopped first (WinError 5 on mapped native wheels).
 */
const { spawn } = require('child_process');
const fs = require('fs');

function modelIdsNeedWhisperExtras(modelIds) {
    const list = Array.isArray(modelIds) ? modelIds : [];
    return list.some((id) => {
        const s = String(id || '').toLowerCase();
        return s.includes('whisper') && !s.includes('whisperseg');
    });
}

function modelIdsNeedSensevoiceExtras(modelIds) {
    const list = Array.isArray(modelIds) ? modelIds : [];
    return list.some((id) => String(id || '').toLowerCase().includes('sensevoice'));
}

/**
 * @param {object} opts
 * @param {'ensure-asr-whisper'|'ensure-asr-sensevoice'} opts.command
 * @param {string} [opts.label]
 */
function ensureRuntimeExtrasOffline(opts = {}) {
    const pythonPath = String(opts.pythonPath || '').trim();
    const cwd = String(opts.cwd || '').trim();
    const command = String(opts.command || '').trim();
    const label = String(opts.label || '运行库').trim() || '运行库';
    if (!pythonPath || !fs.existsSync(pythonPath)) {
        return Promise.resolve({ ok: false, error: '找不到引擎 Python（runtime\\python.exe）' });
    }
    if (!command) {
        return Promise.resolve({ ok: false, error: '缺少 runtime ensure 命令' });
    }
    const force = !!opts.force;
    const timeoutMs = Math.max(60_000, Number(opts.timeoutMs) || 1_800_000);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const signal = opts.signal;
    const args = [
        '-m', 'transub_engine', 'runtime', command,
        '--progress', 'jsonl',
    ];
    if (force) args.push('--force');

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve({ ok: false, cancelled: true, error: 'cancelled' });
            return;
        }
        let child;
        try {
            child = spawn(pythonPath, args, {
                cwd: cwd || undefined,
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1',
                    PYTHONIOENCODING: 'utf-8',
                },
            });
        } catch (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
        }

        const lines = [];
        let settled = false;
        let resultPayload = null;
        const finish = (payload) => {
            if (settled) return;
            settled = true;
            try { signal?.removeEventListener?.('abort', onAbort); } catch { /* ignore */ }
            clearTimeout(timer);
            resolve(payload);
        };
        const onAbort = () => {
            try { child.kill(); } catch { /* ignore */ }
            finish({ ok: false, cancelled: true, error: 'cancelled' });
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
            finish({ ok: false, error: `${label}安装超时（${Math.round(timeoutMs / 1000)} 秒）` });
        }, timeoutMs);

        const handleLine = (raw) => {
            const text = String(raw || '').trim();
            if (!text) return;
            lines.push(text);
            if (lines.length > 80) lines.splice(0, lines.length - 60);
            let ev;
            try { ev = JSON.parse(text); } catch { return; }
            if (!ev || typeof ev !== 'object') return;
            if (ev.type === 'progress' || ev.stage || ev.detail) {
                onProgress?.(ev);
            }
            if (ev.type === 'result' || (ev.ok != null && (ev.ready != null || ev.code || ev.installed))) {
                resultPayload = ev;
            }
        };

        let buf = '';
        const onChunk = (chunk) => {
            buf += chunk.toString('utf8');
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || '';
            for (const part of parts) handleLine(part);
        };
        child.stdout?.on('data', onChunk);
        child.stderr?.on('data', onChunk);
        child.on('error', (err) => {
            finish({ ok: false, error: err.message || String(err), logTail: lines.slice(-20).join('\n') });
        });
        child.on('close', (code) => {
            if (buf.trim()) handleLine(buf);
            const logTail = lines.slice(-20).join('\n');
            if (resultPayload && resultPayload.ok) {
                finish({ ok: true, ...resultPayload, logTail });
                return;
            }
            if (code === 0) {
                finish({ ok: true, ...(resultPayload || {}), logTail });
                return;
            }
            const err = resultPayload?.message
                || resultPayload?.error
                || (logTail ? logTail.slice(-400) : `${label}安装失败（exit ${code}）`);
            finish({
                ok: false,
                error: err,
                code: resultPayload?.code || '',
                logTail,
                ...(resultPayload || {}),
            });
        });
    });
}

function ensureAsrWhisperOffline(opts = {}) {
    return ensureRuntimeExtrasOffline({
        ...opts,
        command: 'ensure-asr-whisper',
        label: 'Whisper 运行库',
    });
}

function ensureAsrSensevoiceOffline(opts = {}) {
    return ensureRuntimeExtrasOffline({
        ...opts,
        command: 'ensure-asr-sensevoice',
        label: 'SenseVoice 运行库',
    });
}

module.exports = {
    modelIdsNeedWhisperExtras,
    modelIdsNeedSensevoiceExtras,
    ensureRuntimeExtrasOffline,
    ensureAsrWhisperOffline,
    ensureAsrSensevoiceOffline,
};
