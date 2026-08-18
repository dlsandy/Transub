/**
 * CT2 4.x imports torch via converters; on Windows torch\\lib\\cublas can
 * WinError 999 after nvidia-cublas is mapped. Whisper must still load.
 */
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const RUNTIME_PY = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    'python.exe',
);

function runPy(script, timeout = 60000) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout,
        env: {
            ...process.env,
            PATH: [
                path.join(
                    __dirname,
                    '..',
                    'transub-engine',
                    'runtime',
                    'Lib',
                    'site-packages',
                    'nvidia',
                    'cublas',
                    'bin',
                ),
                process.env.PATH || '',
            ].join(path.delimiter),
        },
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('whisper CT2 import soft-fails torch CUDA DLL errors', () => {
    const winOnly = process.platform !== 'win32';

    it.skipIf(winOnly)('is_cublas_missing_error ignores torch\\lib WinError 999', () => {
        const out = runPy(`
from transub_engine.device import is_cublas_missing_error, is_torch_cublas_load_conflict
msg = (
    '[WinError 999] Error loading '
    r'"F:\\x\\torch\\lib\\cublas64_12.dll" or one of its dependencies.'
)
assert is_torch_cublas_load_conflict(msg)
assert not is_cublas_missing_error(msg)
assert is_cublas_missing_error('cublas64_12.dll not found')
print('ok')
`);
        assert.strictEqual(out, 'ok');
    });

    it.skipIf(winOnly)('import_whisper_model_class loads despite torch cublas OSError', () => {
        const out = runPy(`
import json
from transub_engine.runtime_gpu import inject_nvidia_lib_path
from transub_engine.asr.whisper_av_shim import import_whisper_model_class
inject_nvidia_lib_path()
WhisperModel, used_ffmpeg = import_whisper_model_class()
import ctranslate2
print(json.dumps({
    "cls": getattr(WhisperModel, "__name__", ""),
    "usedFfmpeg": bool(used_ffmpeg),
    "cuda": int(ctranslate2.get_cuda_device_count() or 0),
    "torchLoaded": "torch" in __import__("sys").modules,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.cls, 'WhisperModel');
        assert.ok(payload.cuda >= 0);
    }, 90000);

    it.skipIf(winOnly)('inject_nvidia_lib_path prefers nvidia cublas over torch\\\\lib', () => {
        const out = runPy(`
import json
from pathlib import Path
from transub_engine.device import find_cublas64_12
from transub_engine.runtime_gpu import inject_nvidia_lib_path
find_cublas64_12.cache_clear()
inject_nvidia_lib_path()
find_cublas64_12.cache_clear()
dll = find_cublas64_12()
norm = dll.lower().replace('/', '\\\\')
print(json.dumps({
    "dll": dll,
    "isTorch": '\\\\torch\\\\lib\\\\' in norm,
    "isNvidia": '\\\\nvidia\\\\' in norm,
}))
`);
        const payload = JSON.parse(out);
        assert.ok(payload.dll, 'expected a cublas path');
        assert.strictEqual(payload.isTorch, false, `torch/lib must not win: ${payload.dll}`);
        assert.strictEqual(payload.isNvidia, true, `expected nvidia cublas: ${payload.dll}`);
    });
});
