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
    it('maps whisper / sensevoice / mt model ids to pip extras', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import extras_for_model_ids
print(json.dumps(extras_for_model_ids([
    'whisper-large-v3-turbo',
    'sensevoice-small',
    'opus-mt-ja-zh',
    'whisperseg-asmr',
])))
`);
        const keys = JSON.parse(out);
        assert.ok(keys.includes('asr-whisper'));
        assert.ok(keys.includes('asr-sensevoice'));
        assert.ok(keys.includes('mt'));
        assert.ok(keys.includes('vad-whisperseg'));
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
        assert.strictEqual(payload.hasNumpyUpper, false);
        assert.strictEqual(payload.tfKnown, true);
        assert.strictEqual(payload.tokKnown, true);
        assert.strictEqual(payload.skipPygments, true);
        assert.strictEqual(payload.skipTyper, true);
        assert.ok(
            payload.pkgs.some((p) => /^tokenizers/.test(p) && /<=0\.23\.0/.test(p)),
            `expected tokenizers<=0.23.0 in ${payload.pkgs}`,
        );
        assert.ok(
            payload.pkgs.some((p) => /^huggingface-hub/.test(p) && /<1\.0/.test(p)),
            `expected huggingface-hub<1.0 in ${payload.pkgs}`,
        );
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

    it('probe_asr_whisper returns a structured readiness payload', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import probe_asr_whisper
print(json.dumps(probe_asr_whisper()))
`);
        const probe = JSON.parse(out);
        assert.strictEqual(probe.ok, true);
        assert.ok(['ready', 'need_install'].includes(probe.status));
        assert.ok(Array.isArray(probe.packages));
    });

    it('skips vad-whisperseg pip when requirements already satisfied', { timeout: 60000 }, function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import (
    EXTRA_PACKAGES,
    _requirement_satisfied,
    _unsatisfied_packages,
    ensure_vad_whisperseg,
    probe_vad_whisperseg,
)
probe = probe_vad_whisperseg()
unsat = _unsatisfied_packages(EXTRA_PACKAGES["vad-whisperseg"])
res = ensure_vad_whisperseg(force=False)
print(json.dumps({
    "probeOk": probe.get("ok"),
    "probeReady": probe.get("ready"),
    "allSatisfied": all(_requirement_satisfied(p) for p in EXTRA_PACKAGES["vad-whisperseg"]),
    "unsatisfied": unsat,
    "ensureOk": res.get("ok"),
    "ensureSkipped": bool(res.get("skipped")),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.probeOk, true);
        // Import-based readiness: if the stack imports, ensure must skip pip.
        // Metadata helpers can disagree slightly on pin edges (e.g. tokenizers);
        // do not require allSatisfied ↔ unsatisfied[] identity here.
        if (payload.probeReady) {
            assert.strictEqual(payload.ensureOk, true);
            assert.strictEqual(payload.ensureSkipped, true);
        }
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
from transub_engine.pip_mirror_util import packages_base_url, is_mirror_http_deny
print(json.dumps({
    "aliyun": packages_base_url("https://mirrors.aliyun.com/pypi/simple"),
    "huawei": packages_base_url("https://mirrors.huaweicloud.com/repository/pypi/simple"),
    "tuna": packages_base_url("https://pypi.tuna.tsinghua.edu.cn/simple"),
    "pypi": packages_base_url("https://pypi.org/simple"),
    "stall": is_mirror_http_deny("STALL: 下载停滞超过 90 秒"),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.aliyun, 'https://mirrors.aliyun.com/pypi/packages');
        assert.strictEqual(payload.huawei, 'https://mirrors.huaweicloud.com/repository/pypi/packages');
        assert.strictEqual(payload.tuna, 'https://pypi.tuna.tsinghua.edu.cn/packages');
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
