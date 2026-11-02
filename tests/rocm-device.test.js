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
        assert.ok(
            payload.specs[0].includes('2.12.0+rocm10.1.0'),
            'torch pin must be the Windows-stable rocm10.1 pair',
        );
        assert.strictEqual(
            payload.specs[2],
            'torchaudio==2.11.0+rocm10.1.0',
            'torchaudio 2.11.0.2+rocm10.0.0 crashes on Windows (torch_new_stable_ivalue)',
        );
        assert.ok(!payload.specs[2].includes('torchaudio[device-'), 'torchaudio has no device-* extras');
        assert.ok(payload.specs.some((s) => s.includes('amd-torch-device-gfx1201==')), 'gfx kernels extra must be pinned');
        assert.ok(payload.index.includes('repo.amd.com'));
    });

    it('treats missing amd-torch-device extra as incomplete ROCm', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine import rocm_device as rd

with patch.object(rd, "_dist_version", side_effect=lambda n: "" if "amd-torch-device" in n else "2.13.0+rocm10.0.0"), \\
     patch.object(rd, "_torch_version_text", return_value="2.13.0+rocm10.0.0"):
    missing = rd.amd_device_kernels_present("gfx1100")
    unknown = rd.amd_device_kernels_present("all")
with patch.object(rd, "_dist_version", return_value="2.13.0+rocm10.0.0"), \\
     patch.object(rd, "_torch_version_text", return_value="2.13.0+rocm10.0.0"):
    ok = rd.amd_device_kernels_present("gfx1100")
unpinned = rd.rocm_pip_specs("gfx1100", pinned=False)
print(json.dumps({"missing": missing, "unknown": unknown, "ok": ok, "unpinned": unpinned}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.missing, false);
        assert.strictEqual(payload.unknown, true);
        assert.strictEqual(payload.ok, true);
        assert.ok(payload.unpinned.includes('amd-torch-device-gfx1100'));
        assert.ok(payload.unpinned[0].includes('torch[device-gfx1100]'));
    });

    it('rejects PyPI and ancient +rocm7 torch versions', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.rocm_device import is_acceptable_rocm_torch_version
print(json.dumps({
    "ok12": is_acceptable_rocm_torch_version("2.12.0+rocm10.0.0"),
    "badPy": is_acceptable_rocm_torch_version("2.14.1"),
    "bad7": is_acceptable_rocm_torch_version("2.11.0+rocm7.14.1"),
    "empty": is_acceptable_rocm_torch_version(""),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok12, true);
        assert.strictEqual(payload.badPy, false);
        assert.strictEqual(payload.bad7, false);
        assert.strictEqual(payload.empty, false);
    });

    it('treats the Windows rocm10.0 torchaudio pair as a crash that must be reinstalled', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine import rocm_device as rd
with patch.object(rd, "_dist_version", return_value="2.11.0.2+rocm10.0.0"), \\
     patch.object(rd, "_torch_version_text", return_value="2.12.0+rocm10.0.0"):
    bad = rd.rocm_windows_audio_abi_broken()
with patch.object(rd, "_dist_version", return_value="2.11.0+rocm10.1.0"), \\
     patch.object(rd, "_torch_version_text", return_value="2.12.0+rocm10.1.0"):
    good = rd.rocm_windows_audio_abi_broken()
print(json.dumps({"bad": bad, "good": good}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.bad, true);
        assert.strictEqual(payload.good, false);
    });

    it('does not treat leftover nvcuda.dll as NVIDIA (unblocks RX 7900 ROCm)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine import rocm_device as rd

rd.probe_amd_gpu.cache_clear()
with patch.object(rd, "_nvidia_smi_lists_gpu", return_value=False), \\
     patch.object(rd, "_video_controllers", return_value=[
         {"name": "AMD Radeon RX 7900 XTX", "adapterRam": 24 * 1024**3}
     ]):
    # Old bug: nvcuda.dll alone made _nvidia_present True and hid the Radeon.
    present = rd._nvidia_present()
    probe = rd.probe_amd_gpu()
rd.probe_amd_gpu.cache_clear()
print(json.dumps({
    "nvidiaPresent": present,
    "name": probe.get("name") or "",
    "gfx": probe.get("gfx") or "",
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.nvidiaPresent, false);
        assert.match(payload.name, /7900/);
        assert.strictEqual(payload.gfx, 'gfx1100');
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
     patch("transub_engine.rocm_device.torch_rocm_libs_present", return_value=True), \\
     patch("transub_engine.rocm_device.amd_device_kernels_present", return_value=True):
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
