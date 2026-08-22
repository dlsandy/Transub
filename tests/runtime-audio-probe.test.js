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

function runPy(script, timeout = 15000) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('runtime_audio / device probes must not load torch', () => {
    it('probe_audio_separate does not import torch or demucs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json, sys, time
t0 = time.perf_counter()
from transub_engine.runtime_audio import probe_audio_separate
from transub_engine.runtime_gpu import _torch_lib_dirs
from transub_engine.device import detect_device, torch_cuda_libs_present
probe = probe_audio_separate()
detect_device()
_torch_lib_dirs()
elapsed_ms = int((time.perf_counter() - t0) * 1000)
loaded = [n for n in ("torch", "demucs") if n in sys.modules]
print(json.dumps({
    "ok": probe.get("ok"),
    "status": probe.get("status"),
    "elapsedMs": elapsed_ms,
    "loaded": loaded,
    "cudaLibs": bool(torch_cuda_libs_present()),
    "keys": sorted(probe.keys()),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.ok(['ready', 'need_install', 'need_torch_cuda'].includes(payload.status));
        assert.deepStrictEqual(payload.loaded, [], `probe loaded native stacks: ${payload.loaded}`);
        // Filesystem probe should finish in well under a second; 8s is a hang tripwire.
        assert.ok(payload.elapsedMs < 8000, `probe too slow (${payload.elapsedMs}ms) — likely imported torch`);
        assert.ok(payload.keys.includes('torchCuda'));
        assert.ok(payload.keys.includes('installed'));
    });

    it('env-check SenseVoice probe uses importlib.metadata, not import torch', function () {
        const fs = require('fs');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'env-check.js'),
            'utf8',
        );
        const fn = src.slice(src.indexOf('async function checkSensevoiceRuntime'));
        const body = fn.slice(0, fn.indexOf('async function checkWhisperRuntime'));
        assert.match(body, /from importlib\.metadata import PackageNotFoundError, version/);
        assert.doesNotMatch(body, /['"] import torch['"]/);
        assert.doesNotMatch(body, /__import__\(mod\)/);
    });

    it('env-check Whisper probe uses importlib.metadata, not import av', function () {
        const fs = require('fs');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'env-check.js'),
            'utf8',
        );
        const fn = src.slice(src.indexOf('async function checkWhisperRuntime'));
        const body = fn.slice(0, Math.min(fn.length, 3500));
        assert.match(body, /from importlib\.metadata import PackageNotFoundError, version/);
        assert.doesNotMatch(body, /['"] import av['"]/);
        assert.doesNotMatch(body, /['"] import ctranslate2/);
    });

    it('torch CUDA direct-download URLs encode pytorch.org plus signs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.pip_mirror_util import torch_cuda_wheel_url, TORCH_CUDA_WHEEL_FILES
name = TORCH_CUDA_WHEEL_FILES[0]
print(json.dumps({
    "aliyun": torch_cuda_wheel_url("https://mirrors.aliyun.com/pytorch-wheels/cu126/", name),
    "official": torch_cuda_wheel_url("https://download.pytorch.org/whl/cu126/", name),
}))
`);
        const payload = JSON.parse(out);
        assert.ok(payload.aliyun.includes('+cu126'));
        assert.ok(payload.official.includes('%2Bcu126'));
    });
});
