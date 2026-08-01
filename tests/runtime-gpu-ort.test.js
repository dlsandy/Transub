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

describe('runtime_gpu onnxruntime-gpu CUDA target', () => {
    it('parses classic and R610+ nvidia-smi CUDA banners', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import _parse_driver_cuda_version_from_text
classic = "| NVIDIA-SMI 566.14    Driver Version: 566.14    CUDA Version: 12.7     |"
modern = "| NVIDIA-SMI 610.62                 KMD Version: 610.62        CUDA UMD Version: 13.3     |"
print(json.dumps({
    "classic": _parse_driver_cuda_version_from_text(classic),
    "modern": _parse_driver_cuda_version_from_text(modern),
    "live": __import__("transub_engine.runtime_gpu", fromlist=["_parse_driver_cuda_version"])._parse_driver_cuda_version(),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.classic, '12.7');
        assert.strictEqual(payload.modern, '13.3');
        // Live machine may lack a GPU in CI; only assert shape when present.
        if (payload.live) {
            assert.ok(/^\d+\.\d+/.test(payload.live), `unexpected live cuda: ${payload.live}`);
        }
    });

    it('maps driver CUDA 12/13 to matching onnxruntime-gpu pins', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import (
    resolve_ort_gpu_cuda_target,
    ort_gpu_spec_for_target,
    ort_gpu_install_hint,
)

rows = []
for driver, prefer in (("12.4", True), ("13.2", True), ("11.8", True), ("", True)):
    target = resolve_ort_gpu_cuda_target(
        driver,
        has_cublas12=False,
        has_cublas13=False,
        prefer_driver=prefer,
    )
    spec = ort_gpu_spec_for_target(target)
    rows.append({
        "driver": driver,
        "target": target,
        "requirement": (spec or {}).get("requirement"),
    })

# Userspace-only cu12 must not pick CUDA 13 ORT (ABI mismatch).
assert resolve_ort_gpu_cuda_target(
    "13.2",
    has_cublas12=True,
    has_cublas13=False,
    prefer_driver=False,
) == "cuda12"
# Planning with prefer_driver still follows the driver banner.
assert resolve_ort_gpu_cuda_target(
    "13.2",
    has_cublas12=True,
    has_cublas13=False,
    prefer_driver=True,
) == "cuda13"
# cu13-only userspace → cuda13 even if driver string is empty.
assert resolve_ort_gpu_cuda_target(
    "",
    has_cublas12=False,
    has_cublas13=True,
    prefer_driver=False,
) == "cuda13"

hint12 = ort_gpu_install_hint("12.6")
hint13 = ort_gpu_install_hint("13.0")
print(json.dumps({"rows": rows, "hint12": hint12, "hint13": hint13}))
`);
        const payload = JSON.parse(out);
        const byDriver = Object.fromEntries(payload.rows.map((r) => [r.driver, r]));
        assert.strictEqual(byDriver['12.4'].target, 'cuda12');
        assert.ok(/>=1\.21,<1\.27/.test(byDriver['12.4'].requirement));
        assert.strictEqual(byDriver['13.2'].target, 'cuda13');
        assert.ok(/>=1\.27/.test(byDriver['13.2'].requirement));
        assert.strictEqual(byDriver['11.8'].target, null);
        assert.strictEqual(byDriver[''].target, 'cuda12');
        assert.ok(/CUDA 12/.test(payload.hint12));
        assert.ok(/1\.21/.test(payload.hint12));
        assert.ok(/CUDA 13/.test(payload.hint13));
        assert.ok(/1\.27/.test(payload.hint13));
    });

    it('probe_gpu_runtime exposes ortGpuTarget fields', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runPy(`
import json
from transub_engine.runtime_gpu import probe_gpu_runtime
p = probe_gpu_runtime()
print(json.dumps({
    "ok": p.get("ok"),
    "hasOrtTarget": "ortGpuTarget" in p,
    "hasOrtReq": "ortGpuRequirement" in p,
    "hasCublas13": "cublas13" in p,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.hasOrtTarget, true);
        assert.strictEqual(payload.hasOrtReq, true);
        assert.strictEqual(payload.hasCublas13, true);
    });
});
