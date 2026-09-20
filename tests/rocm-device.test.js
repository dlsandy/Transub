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

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 60000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('ROCm PyTorch device map', function () {
    it('maps RX 9070 to gfx1201 and pins the official ROCm wheel', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.rocm_device import gfx_for_gpu_name, rocm_pip_specs, ROCM_INDEX_URLS
print(json.dumps({
    "g9070": gfx_for_gpu_name("AMD Radeon RX 9070"),
    "g9070xt": gfx_for_gpu_name("AMD Radeon RX 9070 XT"),
    "g9060": gfx_for_gpu_name("AMD Radeon RX 9060 XT"),
    "g7900": gfx_for_gpu_name("AMD Radeon RX 7900 XTX"),
    "specs": rocm_pip_specs("gfx1201"),
    "index": ROCM_INDEX_URLS[0],
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.g9070, 'gfx1201');
        assert.strictEqual(payload.g9070xt, 'gfx1201');
        assert.strictEqual(payload.g9060, 'gfx1200');
        assert.strictEqual(payload.g7900, 'gfx1100');
        assert.ok(payload.specs[0].includes('torch[device-gfx1201]=='));
        assert.ok(payload.specs[0].includes('+rocm'));
        assert.ok(payload.index.includes('repo.amd.com'));
    });

    it('treats ROCm-ready AMD probe as ready (not no_gpu)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine import runtime_gpu

fake_device = {
    "hasCuda": False,
    "hasRocm": True,
    "rocmGfx": "gfx1201",
    "gpuName": "AMD Radeon RX 9070",
    "vramMb": 16384,
    "device": "cuda",
    "cublas12": False,
    "cublas13": False,
    "computeCap": 0,
    "driverCudaVersion": "",
    "driverCudaMajor": 0,
    "needsTorchCuda128": False,
    "torchCudaVariant": "cu126",
}
with patch("transub_engine.runtime_gpu.detect_device", return_value=fake_device), \\
     patch("transub_engine.runtime_gpu.find_cublas64_12", return_value=""), \\
     patch("transub_engine.runtime_gpu.find_cublas64_13", return_value=""), \\
     patch("transub_engine.runtime_gpu.ctranslate2_cuda_status", return_value={"ok": False, "reason": "no"}), \\
     patch("transub_engine.runtime_gpu._parse_driver_cuda_version", return_value=""), \\
     patch("transub_engine.runtime_gpu.resolve_ort_gpu_readiness", return_value={"ok": False}), \\
     patch("transub_engine.rocm_device.torch_rocm_libs_present", return_value=True):
    p = runtime_gpu.probe_gpu_runtime()
print(json.dumps({
    "status": p.get("status"),
    "hasRocm": p.get("hasRocm"),
    "torchRocm": p.get("torchRocm"),
    "asrGpuReady": p.get("asrGpuReady"),
    "target": p.get("target"),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.status, 'ready');
        assert.strictEqual(payload.hasRocm, true);
        assert.strictEqual(payload.torchRocm, true);
        assert.strictEqual(payload.asrGpuReady, true);
        assert.strictEqual(payload.target, 'rocm');
    });
});
