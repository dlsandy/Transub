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

function runExtras(script) {
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

describe('runtime_extras (engine)', () => {
    it('maps whisper / sensevoice model ids to pip extras', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import extras_for_model_ids
print(json.dumps(extras_for_model_ids([
    'whisper-large-v3-turbo',
    'sensevoice-small',
    'whisperseg-asmr',
])))
`);
        const keys = JSON.parse(out);
        assert.ok(keys.includes('asr-whisper'));
        assert.ok(keys.includes('asr-sensevoice'));
        assert.ok(keys.includes('vad-whisperseg'));
        // Opus-MT retired — opus-mt-* no longer maps to a pip "mt" extra
        const opusKeys = JSON.parse(runExtras(`
import json
from transub_engine.runtime_extras import extras_for_model_ids
print(json.dumps(extras_for_model_ids(['opus-mt-ja-zh'])))
`));
        assert.ok(!opusKeys.includes('mt'));
    });

    it('Whisper extras explicitly include ctranslate2 and onnxruntime (no-deps wheel installs)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
from transub_engine.pip_mirror_util import known_wheel_rel
pkgs = EXTRA_PACKAGES['asr-whisper']
print(json.dumps({
    "pkgs": pkgs,
    "hasCt2": any('ctranslate2' in p for p in pkgs),
    "hasOrt": any(p.startswith('onnxruntime') for p in pkgs),
    "ct2Known": bool(known_wheel_rel('ctranslate2')),
    "ortKnown": bool(known_wheel_rel('onnxruntime')),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.hasCt2, true);
        assert.strictEqual(payload.hasOrt, true);
        assert.strictEqual(payload.ct2Known, true);
        assert.strictEqual(payload.ortKnown, true);
        assert.ok(payload.pkgs.some((p) => /numpy.*<2\.5/.test(p)));
    });

    it('SenseVoice extras include setuptools and funasr runtime deps', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
pkgs = EXTRA_PACKAGES['asr-sensevoice']
print(json.dumps({
    "hasSetuptools": any(p.startswith('setuptools') for p in pkgs),
    "hasLibrosa": any(p.startswith('librosa') for p in pkgs),
    "hasScipy": any(p.startswith('scipy') for p in pkgs),
    "hasJieba": any(p.startswith('jieba') for p in pkgs),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.hasSetuptools, true);
        assert.strictEqual(payload.hasLibrosa, true);
        assert.strictEqual(payload.hasScipy, true);
        assert.strictEqual(payload.hasJieba, true);
    });

    it('followup hard-requires skips Linux-only nvidia CUDA pins on Windows', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import (
    _requirement_applies_here,
    _unsatisfied_hard_requires,
    _is_skipped_auto_require,
)
linux_pin = 'nvidia-cuda-nvrtc-cu12==12.8.93; platform_system == "Linux" and platform_machine == "x86_64"'
miss = _unsatisfied_hard_requires(['torch'])
print(json.dumps({
    "linuxPinApplies": _requirement_applies_here(linux_pin),
    "skipNvidia": _is_skipped_auto_require('nvidia-cuda-runtime-cu12'),
    "skipCudaToolkit": _is_skipped_auto_require('cuda-toolkit'),
    "unmetHasNvidia": any('nvidia-' in m.lower() or m.lower().startswith('cuda-') for m in miss),
    "unmet": miss,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.linuxPinApplies, false);
        assert.strictEqual(payload.skipNvidia, true);
        assert.strictEqual(payload.skipCudaToolkit, true);
        assert.strictEqual(payload.unmetHasNvidia, false);
    });

    it('SenseVoice extras pin numpy<2.5 and prefer binary numba', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
print(json.dumps(EXTRA_PACKAGES['asr-sensevoice']))
`);
        const pkgs = JSON.parse(out);
        assert.ok(pkgs.some((p) => /numpy.*<2\.5/.test(p)), `expected numpy<2.5 in ${pkgs}`);
        assert.ok(pkgs.includes('numba'), 'expected numba preinstall');
    });

    it('WhisperSeg extras pin tokenizers for transformers 5.x', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES, _is_skipped_auto_require
from transub_engine.pip_mirror_util import known_wheel_rel
pkgs = EXTRA_PACKAGES['vad-whisperseg']
print(json.dumps({
    "pkgs": pkgs,
    "hasOrtGpu": any('onnxruntime-gpu' in p for p in pkgs),
    "hasOrt": any(p.startswith('onnxruntime') and 'gpu' not in p for p in pkgs),
    "hasNumpyUpper": any('numpy' in p and '<2.5' in p for p in pkgs),
    "tfKnown": bool(known_wheel_rel('transformers')),
    "tokKnown": bool(known_wheel_rel('tokenizers')),
    "skipPygments": _is_skipped_auto_require('pygments'),
    "skipTyper": _is_skipped_auto_require('typer'),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.hasOrtGpu, false);
        assert.strictEqual(payload.hasOrt, true);
        // NUMPY_NUMBA_PIN keeps WhisperSeg refresh from floating numpy past numba.
        assert.strictEqual(payload.hasNumpyUpper, true);
        assert.strictEqual(payload.tfKnown, true);
        assert.strictEqual(payload.tokKnown, true);
        assert.strictEqual(payload.skipPygments, true);
        assert.strictEqual(payload.skipTyper, true);
        assert.ok(
            payload.pkgs.some((p) => /^tokenizers==0\.22\.2/.test(p)),
            `expected tokenizers==0.22.2 in ${payload.pkgs}`,
        );
        assert.ok(
            payload.pkgs.some((p) => /^huggingface-hub/.test(p) && /<1\.0/.test(p)),
            `expected huggingface-hub<1.0 in ${payload.pkgs}`,
        );
    });

    it('known wheel must satisfy requirement pin (Cohere needs transformers>=5.6)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import (
    known_wheel_version,
    known_wheel_satisfies_requirement,
)
print(json.dumps({
    'tfVer': known_wheel_version('transformers'),
    'whisperOk': known_wheel_satisfies_requirement('transformers>=4.40.0'),
    'cohereOk': known_wheel_satisfies_requirement('transformers>=5.6.0,<6'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.tfVer, '4.57.3');
        assert.strictEqual(j.whisperOk, true);
        assert.strictEqual(j.cohereOk, false);
    });

    it('asr-whisper onnxruntime pin accepts installed onnxruntime-gpu', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from importlib.metadata import PackageNotFoundError, version as pkg_version
from transub_engine.runtime_extras import _requirement_satisfied, _onnxruntime_importable
has_gpu = False
try:
    pkg_version("onnxruntime-gpu")
    has_gpu = True
except PackageNotFoundError:
    pass
print(json.dumps({
    "importable": _onnxruntime_importable(),
    "hasGpu": has_gpu,
    "cpuPinOk": _requirement_satisfied("onnxruntime>=1.14.0,<1.22"),
}))
`);
        const payload = JSON.parse(out);
        if (payload.importable && payload.hasGpu) {
            assert.strictEqual(payload.cpuPinOk, true);
        }
    });

    it('requirement_satisfied tolerates None/blank metadata versions (tokenizers pin)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine.runtime_extras import (
    TOKENIZERS_PIN,
    _requirement_satisfied,
    _tokenizers_pin_violation,
)
results = {}
with patch("transub_engine.runtime_extras.pkg_version", return_value=None):
    results["noneOk"] = _requirement_satisfied(TOKENIZERS_PIN)
    results["noneViolation"] = bool(_tokenizers_pin_violation())
with patch("transub_engine.runtime_extras.pkg_version", return_value=""):
    results["blankOk"] = _requirement_satisfied(TOKENIZERS_PIN)
with patch("transub_engine.runtime_extras.pkg_version", return_value="0.22.2"):
    results["pinOk"] = _requirement_satisfied(TOKENIZERS_PIN)
with patch("transub_engine.runtime_extras.pkg_version", return_value="0.23.1"):
    results["driftOk"] = _requirement_satisfied(TOKENIZERS_PIN)
print(json.dumps(results))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.noneOk, false);
        assert.strictEqual(payload.noneViolation, true);
        assert.strictEqual(payload.blankOk, false);
        assert.strictEqual(payload.pinOk, true);
        assert.strictEqual(payload.driftOk, false);
    });

    it('local wheel install retries with --ignore-installed on uninstall-no-record-file', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json, tempfile
from pathlib import Path
from unittest.mock import patch
from transub_engine import pip_mirror_util as pm

whl = Path(tempfile.gettempdir()) / "numpy-2.4.6-cp312-cp312-win_amd64.whl"
whl.write_bytes(b"fake")
calls = []

class FakeProc:
    def __init__(self, cmd):
        self.cmd = list(cmd)
        self.stdout = self
        self._lines = []
        self._i = 0
        if "--force-reinstall" in self.cmd:
            self._lines = [
                "Processing " + str(whl),
                "ERROR: uninstall-no-record-file",
            ]
            self._code = 1
        else:
            self._lines = ["Successfully installed numpy-2.4.6"]
            self._code = 0
        calls.append({"ignore": "--ignore-installed" in self.cmd, "force": "--force-reinstall" in self.cmd})
    def readline(self):
        if self._i >= len(self._lines):
            return ""
        line = self._lines[self._i] + "\\n"
        self._i += 1
        return line
    def wait(self, timeout=None):
        return self._code
    def kill(self):
        pass

def fake_popen(cmd, **kwargs):
    return FakeProc(cmd)

with patch.object(pm.subprocess if hasattr(pm, "subprocess") else __import__("subprocess"), "Popen", side_effect=fake_popen):
    # patch where used: inside install_local_wheel_files it imports subprocess locally
    pass

import subprocess as sp
with patch.object(sp, "Popen", side_effect=fake_popen), \\
     patch.object(pm, "_dist_info_has_record", return_value=True):
    result = pm.install_local_wheel_files([str(whl)], detail_prefix="测试")
try:
    whl.unlink(missing_ok=True)
except Exception:
    pass
print(json.dumps({
    "ok": bool(result.get("ok")),
    "repaired": bool(result.get("repairedNoRecord")),
    "calls": calls,
    "name": pm._wheel_distribution_name(str(whl)),
    "detect": pm._pip_log_is_uninstall_no_record("ERROR: uninstall-no-record-file"),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.name, 'numpy');
        assert.strictEqual(payload.detect, true);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.repaired, true);
        assert.strictEqual(payload.calls.length, 2);
        assert.strictEqual(payload.calls[0].force, true);
        assert.strictEqual(payload.calls[1].ignore, true);
    });

    it('ensure_asr_qwen3 is metadata-first (does not import-probe before install)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from importlib.metadata import PackageNotFoundError
from unittest.mock import patch
from transub_engine import runtime_extras as re

order = []
def track_runtime(*a, **k):
    order.append("runtime_probe")
    return {"ok": True, "ready": True, "status": "ready", "missing": [], "errors": [], "versions": {}}
def track_np(**kwargs):
    order.append("numpy_fix")
    return {"ok": True, "skipped": True, "version": "2.4.6"}
def track_unsat(pkgs):
    order.append("unsat")
    return [re.TOKENIZERS_PIN]
def track_install(pkgs, **kwargs):
    order.append("install")
    return {"ok": True, "installed": list(pkgs), "skipped": False}
def track_loaded():
    order.append("loaded_check")
    return False

with patch.object(re, "probe_asr_qwen3_runtime", side_effect=track_runtime), \\
     patch.object(re, "ensure_numpy_numba_compatible", side_effect=track_np), \\
     patch.object(re, "_unsatisfied_packages", side_effect=track_unsat), \\
     patch.object(re, "_qwen3_native_modules_loaded", side_effect=track_loaded), \\
     patch.object(re, "_install_packages", side_effect=track_install), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value="tok bad"), \\
     patch.object(re, "pkg_version", side_effect=PackageNotFoundError("qwen-asr")):
    result = re.ensure_asr_qwen3()
print(json.dumps({"ok": bool(result.get("ok")), "order": order}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.deepStrictEqual(
            payload.order.slice(0, 4),
            ['loaded_check', 'numpy_fix', 'unsat', 'install'],
        );
        const runtimeIdx = payload.order.indexOf('runtime_probe');
        const installIdx = payload.order.indexOf('install');
        assert.ok(installIdx >= 0);
        assert.ok(runtimeIdx > installIdx, `order=${JSON.stringify(payload.order)}`);
    });

    it('probe_asr_qwen3 treats blank numpy metadata as missing', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re
import transub_engine.device as device

def ver(name):
    if name == "numpy":
        return None
    mapping = {
        "transformers": "5.13.0",
        "torch": "2.11.0",
        "tokenizers": "0.22.2",
        "numba": "0.60.0",
        "huggingface-hub": "1.5.0",
    }
    return mapping.get(name, "1.0.0")

with patch.object(re, "_pkg_version_str", side_effect=ver), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value=""), \\
     patch.object(re, "_requirement_satisfied", return_value=True), \\
     patch.object(device, "detect_device", return_value={"hasCuda": False}), \\
     patch.object(device, "torch_cuda_libs_present", return_value=False):
    probe = re.probe_asr_qwen3()
print(json.dumps({
    "ready": bool(probe.get("ready")),
    "missing": probe.get("missing") or [],
    "hint": probe.get("hint") or "",
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ready, false);
        assert.ok(payload.missing.includes('numpy'));
        assert.ok(/numpy/i.test(payload.hint));
    });

    it('probe_asr_whisper returns a structured readiness payload', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json, sys, time
t0 = time.perf_counter()
from transub_engine.runtime_extras import probe_asr_whisper
probe = probe_asr_whisper()
elapsed_ms = int((time.perf_counter() - t0) * 1000)
loaded = [n for n in ("av", "ctranslate2", "faster_whisper", "onnxruntime") if n in sys.modules]
print(json.dumps({
    "probe": probe,
    "elapsedMs": elapsed_ms,
    "loaded": loaded,
}))
`);
        const payload = JSON.parse(out);
        const probe = payload.probe;
        assert.strictEqual(probe.ok, true);
        assert.ok(['ready', 'need_install', 'policy_blocked'].includes(probe.status));
        assert.ok(Array.isArray(probe.packages));
        assert.deepStrictEqual(payload.loaded, [], `probe loaded native stacks: ${payload.loaded}`);
        assert.ok(payload.elapsedMs < 5000, `probe too slow (${payload.elapsedMs}ms)`);
    });

    it('skips vad-whisperseg pip when probe reports ready', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine.runtime_extras import ensure_vad_whisperseg

fake_probe = {
    "ok": True,
    "ready": True,
    "status": "ready",
    "missing": [],
    "errors": [],
    "versions": {"onnxruntime": "1.21.1", "transformers": "4.57.3"},
}
with patch("transub_engine.runtime_extras.probe_vad_whisperseg", return_value=fake_probe):
    res = ensure_vad_whisperseg(force=False)
print(json.dumps({
    "ensureOk": res.get("ok"),
    "ensureSkipped": bool(res.get("skipped")),
    "reason": res.get("reason"),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ensureOk, true);
        assert.strictEqual(payload.ensureSkipped, true);
        assert.ok(
            payload.reason === 'already_satisfied' || payload.reason === 'already_ready',
            `unexpected skip reason: ${payload.reason}`,
        );
    });

    it('order_pip_mirrors pins preferred host first without probe', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import order_pip_mirrors, resolve_pip_mirror_order
ordered = order_pip_mirrors(None, prefer="tsinghua")
mirrors, probe_rows, used = resolve_pip_mirror_order(prefer="aliyun")
print(json.dumps({
    "first": ordered[0][1],
    "aliyunFirst": mirrors[0][1],
    "usedPrefer": used,
    "probeEmpty": len(probe_rows) == 0,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.first, 'pypi.tuna.tsinghua.edu.cn');
        assert.strictEqual(payload.aliyunFirst, 'mirrors.aliyun.com');
        assert.strictEqual(payload.usedPrefer, true);
        assert.strictEqual(payload.probeEmpty, true);
    });

    it('order_pip_mirrors prefers higher throughput over lower latency', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import order_pip_mirrors
rows = [
    {"ok": True, "indexUrl": "https://fast-lat.example/simple", "host": "fast-lat.example", "latencyMs": 20, "bytesPerSec": 50_000},
    {"ok": False, "indexUrl": "https://dead.example/simple", "host": "dead.example", "latencyMs": 10, "bytesPerSec": 0},
    {"ok": True, "indexUrl": "https://slow-lat.example/simple", "host": "slow-lat.example", "latencyMs": 200, "bytesPerSec": 2_000_000},
]
print(json.dumps(order_pip_mirrors(rows, mirrors=[
    ("https://fast-lat.example/simple", "fast-lat.example"),
    ("https://dead.example/simple", "dead.example"),
    ("https://slow-lat.example/simple", "slow-lat.example"),
])))
`);
        const ordered = JSON.parse(out);
        assert.strictEqual(ordered[0][1], 'slow-lat.example');
        assert.strictEqual(ordered[1][1], 'fast-lat.example');
        assert.strictEqual(ordered[2][1], 'dead.example');
    });

    it('order_pip_mirrors prefers lower latency when throughput is tied', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import order_pip_mirrors
rows = [
    {"ok": True, "indexUrl": "https://slow.example/simple", "host": "slow.example", "latencyMs": 900, "bytesPerSec": 0},
    {"ok": False, "indexUrl": "https://dead.example/simple", "host": "dead.example", "latencyMs": 10, "bytesPerSec": 0},
    {"ok": True, "indexUrl": "https://fast.example/simple", "host": "fast.example", "latencyMs": 40, "bytesPerSec": 0},
]
print(json.dumps(order_pip_mirrors(rows, mirrors=[
    ("https://slow.example/simple", "slow.example"),
    ("https://dead.example/simple", "dead.example"),
    ("https://fast.example/simple", "fast.example"),
])))
`);
        const ordered = JSON.parse(out);
        assert.strictEqual(ordered[0][1], 'fast.example');
        assert.strictEqual(ordered[1][1], 'slow.example');
        assert.strictEqual(ordered[2][1], 'dead.example');
    });

    it('packages_base_url maps simple indexes to packages roots', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import PIP_MIRRORS, packages_base_url, is_mirror_http_deny
print(json.dumps({
    "hosts": [h for _, h in PIP_MIRRORS],
    "aliyun": packages_base_url("https://mirrors.aliyun.com/pypi/simple"),
    "huawei": packages_base_url("https://mirrors.huaweicloud.com/repository/pypi/simple"),
    "tuna": packages_base_url("https://pypi.tuna.tsinghua.edu.cn/simple"),
    "ustc": packages_base_url("https://pypi.mirrors.ustc.edu.cn/simple"),
    "tencent": packages_base_url("https://mirrors.cloud.tencent.com/pypi/simple"),
    "huawei_repo": packages_base_url("https://repo.huaweicloud.com/repository/pypi/simple"),
    "netease": packages_base_url("https://mirrors.163.com/pypi/simple"),
    "pypi": packages_base_url("https://pypi.org/simple"),
    "stall": is_mirror_http_deny("STALL: 下载停滞超过 90 秒"),
}))
`);
        const payload = JSON.parse(out);
        for (const host of [
            'mirrors.aliyun.com',
            'pypi.tuna.tsinghua.edu.cn',
            'pypi.mirrors.ustc.edu.cn',
            'mirrors.cloud.tencent.com',
            'mirrors.huaweicloud.com',
            'repo.huaweicloud.com',
            'mirrors.163.com',
            'pypi.org',
        ]) {
            assert.ok(payload.hosts.includes(host), `missing pip mirror host ${host}`);
        }
        assert.strictEqual(payload.aliyun, 'https://mirrors.aliyun.com/pypi/packages');
        assert.strictEqual(payload.huawei, 'https://mirrors.huaweicloud.com/repository/pypi/packages');
        assert.strictEqual(payload.tuna, 'https://pypi.tuna.tsinghua.edu.cn/packages');
        assert.strictEqual(payload.ustc, 'https://pypi.mirrors.ustc.edu.cn/packages');
        assert.strictEqual(payload.tencent, 'https://mirrors.cloud.tencent.com/pypi/packages');
        assert.strictEqual(payload.huawei_repo, 'https://repo.huaweicloud.com/repository/pypi/packages');
        assert.strictEqual(payload.netease, 'https://mirrors.163.com/pypi/packages');
        assert.strictEqual(payload.pypi, 'https://files.pythonhosted.org/packages');
        assert.strictEqual(payload.stall, true);
    });

    it('pip_line_marks_activity treats unpack lines as progress (offline install)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import pip_line_marks_activity
print(json.dumps({
    "processing": pip_line_marks_activity("Processing ctranslate2-4.5.0-cp312-cp312-win_amd64.whl"),
    "installing": pip_line_marks_activity("Installing collected packages: ctranslate2, av"),
    "success": pip_line_marks_activity("Successfully installed av-14.0.1 ctranslate2-4.5.0"),
    "downloading": pip_line_marks_activity("Downloading numpy-2.4.6-cp312-cp312-win_amd64.whl (15.5 MB)"),
    "progress": pip_line_marks_activity("1.2 / 15.5 MB  2.1 MB/s"),
    "noise": pip_line_marks_activity("WARNING: You are using pip version 24.0"),
    "empty": pip_line_marks_activity("   "),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.processing, true);
        assert.strictEqual(payload.installing, true);
        assert.strictEqual(payload.success, true);
        assert.strictEqual(payload.downloading, true);
        assert.strictEqual(payload.progress, true);
        assert.strictEqual(payload.noise, false);
        assert.strictEqual(payload.empty, false);
    });

    it('plan_parallel_ranges splits large objects and keeps small ones whole', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import plan_parallel_ranges, DOWNLOAD_PARALLEL_MIN_BYTES
small = plan_parallel_ranges(1024 * 1024)
big = plan_parallel_ranges(DOWNLOAD_PARALLEL_MIN_BYTES * 4, connections=8)
print(json.dumps({
    "smallN": len(small),
    "small": small,
    "bigN": len(big),
    "first": big[0],
    "last": big[-1],
    "cover": big[-1][1] + 1,
    "total": DOWNLOAD_PARALLEL_MIN_BYTES * 4,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.smallN, 1);
        assert.ok(payload.bigN >= 2);
        assert.strictEqual(payload.first[0], 0);
        assert.strictEqual(payload.cover, payload.total);
    });

    it('transfer_should_abort catches stall, too-slow, and max wall time', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import transfer_should_abort
print(json.dumps({
    "ok": transfer_should_abort(elapsed_sec=10, session_bytes=2_000_000, last_progress_age_sec=1),
    "stall": transfer_should_abort(elapsed_sec=10, session_bytes=100, last_progress_age_sec=90),
    "slow": transfer_should_abort(elapsed_sec=60, session_bytes=600_000, last_progress_age_sec=1),
    "max": transfer_should_abort(elapsed_sec=600, session_bytes=50_000_000, last_progress_age_sec=1),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, null);
        assert.ok(String(payload.stall || '').includes('停滞'));
        assert.ok(String(payload.slow || '').includes('过慢'));
        assert.ok(String(payload.max || '').includes('上限'));
    });

    it('detects HTTP 403 and demotes that mirror for later installs', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import (
    clear_demoted_mirrors,
    demoted_mirror_hosts,
    is_mirror_http_deny,
    note_mirror_denied,
    order_pip_mirrors,
)
clear_demoted_mirrors()
sample = (
    "ERROR: HTTP error 403 while getting "
    "https://pypi.tuna.tsinghua.edu.cn/packages/xx/numpy-2.5.1-cp312-cp312-win_amd64.whl "
    "(403 Client Error: Forbidden for url)"
)
assert is_mirror_http_deny(sample)
assert not is_mirror_http_deny("Requirement already satisfied: numpy")
note_mirror_denied("pypi.tuna.tsinghua.edu.cn")
rows = [
    {"ok": True, "indexUrl": "https://pypi.tuna.tsinghua.edu.cn/simple", "host": "pypi.tuna.tsinghua.edu.cn", "latencyMs": 20},
    {"ok": True, "indexUrl": "https://mirrors.aliyun.com/pypi/simple", "host": "mirrors.aliyun.com", "latencyMs": 80},
]
ordered = order_pip_mirrors(rows, mirrors=[
    ("https://pypi.tuna.tsinghua.edu.cn/simple", "pypi.tuna.tsinghua.edu.cn"),
    ("https://mirrors.aliyun.com/pypi/simple", "mirrors.aliyun.com"),
])
print(json.dumps({
    "demoted": sorted(demoted_mirror_hosts()),
    "first": ordered[0][1],
    "second": ordered[1][1],
}))
clear_demoted_mirrors()
`);
        const payload = JSON.parse(out);
        assert.deepStrictEqual(payload.demoted, ['pypi.tuna.tsinghua.edu.cn']);
        assert.strictEqual(payload.first, 'mirrors.aliyun.com');
        assert.strictEqual(payload.second, 'pypi.tuna.tsinghua.edu.cn');
    });

    it('parses pip Downloading / progress size lines', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import _parse_pip_progress_line
a = _parse_pip_progress_line("Downloading torch-2.5.1-cp312-none-win_amd64.whl (203.1 MB)")
b = _parse_pip_progress_line("  45.2/203.1 MB 5.2 MB/s")
print(json.dumps({"a": a, "b": b}))
`);
        const parsed = JSON.parse(out);
        assert.ok(parsed.a);
        assert.ok(parsed.a.totalBytes > 200 * 1024 * 1024);
        assert.ok(parsed.b);
        assert.ok(parsed.b.downloadedBytes > 40 * 1024 * 1024);
        assert.ok(parsed.b.bytesPerSecond > 5 * 1024 * 1024);
    });
});
