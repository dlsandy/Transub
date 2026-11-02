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

    it('followup scan includes already-present torch after --no-deps extras', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import _nodeps_followup_scan, EXTRA_PACKAGES, TORCH_HARD_PY_DEPS
scan = _nodeps_followup_scan(['tokenizers==0.22.2', 'huggingface-hub>=1.5.0,<2.0'])
print(json.dumps({
    "scan": scan,
    "torchDeps": list(TORCH_HARD_PY_DEPS),
    "qwenHasSympy": any(str(p).startswith("sympy") for p in EXTRA_PACKAGES["asr-qwen3"]),
}))
`);
        const payload = JSON.parse(out);
        assert.ok(payload.scan.includes('tokenizers'), JSON.stringify(payload.scan));
        assert.ok(payload.qwenHasSympy);
        assert.ok(payload.torchDeps.some((p) => /sympy>=1\.13/.test(p)));
        assert.ok(payload.scan.includes('torch'), JSON.stringify(payload.scan));
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
            `expected default huggingface-hub<1.0 in EXTRA_PACKAGES ${payload.pkgs}`,
        );
    });

    it('keeps Qwen transformers below 5.16 so tokenizers 0.22.2 still matches', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES, TRANSFORMERS_QWEN_PIN, TRANSFORMERS_COHERE_PIN
print(json.dumps({
    "qwen": EXTRA_PACKAGES["asr-qwen3"],
    "cohere": EXTRA_PACKAGES["asr-cohere"],
    "qwenPin": TRANSFORMERS_QWEN_PIN,
    "coherePin": TRANSFORMERS_COHERE_PIN,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.qwenPin, 'transformers>=5.13.0,<5.16');
        assert.strictEqual(payload.coherePin, 'transformers>=5.6.0,<5.16');
        assert.ok(payload.qwen.includes('transformers>=5.13.0,<5.16'));
        assert.ok(payload.qwen.includes('tokenizers==0.22.2'));
        assert.ok(payload.qwen.some((p) => /sympy>=1\.13\.3/.test(p)), payload.qwen.join(','));
        assert.ok(payload.cohere.some((p) => /sympy>=1\.13\.3/.test(p)), payload.cohere.join(','));
        assert.ok(!payload.qwen.some((p) => /<6/.test(p)));
    });

    it('unwraps transformers LazyModule import errors for Qwen probe', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from transub_engine.runtime_extras import (
    _exception_chain_text,
    _qwen3_repair_hint,
    _evict_imported_prefixes,
)
class Root(Exception):
    pass
class Wrap(Exception):
    pass
root = Root("operator torchvision::nms does not exist")
wrap = Wrap("Could not import module 'AutoModelForMultimodalLM'. Are this object's requirements defined correctly?")
wrap.__cause__ = root
sys_modules_before = __import__("sys").modules
fake = "transub_test_evict_mod"
sys_modules_before[fake] = object()
removed = _evict_imported_prefixes((fake,))
print(json.dumps({
    "chain": _exception_chain_text(wrap),
    "hint": _qwen3_repair_hint([
        "AutoModelForMultimodalLM: Could not import module 'AutoModelForMultimodalLM'. Are this object's requirements defined correctly?"
    ], ["transformers"]),
    "numpyHint": _qwen3_repair_hint(["numpy: 2.5.1 超出 Numba 上限"], ["numpy"]),
    "sympyHint": _qwen3_repair_hint([
        "AutoModelForMultimodalLM: No module named 'sympy'"
    ], []),
    "removed": removed,
    "gone": fake not in sys_modules_before,
}))
`);
        const payload = JSON.parse(out);
        assert.ok(
            payload.chain.includes('torchvision::nms'),
            `expected unwrapped cause, got ${payload.chain}`,
        );
        assert.ok(!/Are this object's requirements defined correctly/.test(payload.chain));
        assert.ok(/torchvision|transformers 5\.15/.test(payload.hint), payload.hint);
        assert.ok(!/numpy 降到/.test(payload.hint), payload.hint);
        assert.ok(/一键修复会/.test(payload.hint), payload.hint);
        assert.ok(/numpy 降到/.test(payload.numpyHint), payload.numpyHint);
        assert.ok(/一键修复会把 numpy/.test(payload.numpyHint), payload.numpyHint);
        assert.ok(/补齐缺失模块 sympy/.test(payload.sympyHint), payload.sympyHint);
        assert.ok(!/重装 transformers/.test(payload.sympyHint), payload.sympyHint);
        assert.ok(payload.removed >= 1);
        assert.strictEqual(payload.gone, true);
    });

    it('qwen3 repair hint mentions ROCm torchvision mismatch', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from transub_engine.runtime_extras import _qwen3_repair_hint
print(json.dumps({
    "hint": _qwen3_repair_hint([
        "Qwen3ASRProcessor: operator torchvision::nms does not exist"
    ], ["transformers"]),
}))
`);
        const payload = JSON.parse(out);
        assert.ok(/torchvision/.test(payload.hint), payload.hint);
    });

    it('imports AutoModelForMultimodalLM via the concrete auto module', { timeout: 120000 }, function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
from transub_engine.runtime_extras import _import_auto_model_for_multimodal_lm
_import_auto_model_for_multimodal_lm()
print("ok")
`);
        assert.strictEqual(out, 'ok');
    });

    it('does not evict PyO3 tokenizers after pip and treats in-process reinit as ready', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re
from importlib.metadata import PackageNotFoundError

assert "tokenizers" not in re._QWEN3_REPROBE_PREFIXES
assert "safetensors" not in re._QWEN3_REPROBE_PREFIXES
assert "transformers" in re._QWEN3_REPROBE_PREFIXES
pyo3 = "PyO3 modules compiled for CPython 3.8 or older may only be initialized once per interpreter process"
probe_fail = {
    "ok": True, "ready": False, "status": "need_install",
    "missing": ["transformers", "tokenizers"],
    "errors": ["AutoModelForMultimodalLM: " + pyo3, "tokenizers: " + pyo3],
    "hint": re._qwen3_repair_hint(["AutoModelForMultimodalLM: " + pyo3], ["transformers", "tokenizers"]),
    "versions": {"transformers": "5.15.1", "tokenizers": "0.22.2"},
    "hasCudaGpu": False, "torchCuda": False,
}
meta_ok = {
    "ok": True, "ready": True, "status": "ready",
    "missing": [], "errors": [],
    "versions": {"transformers": "5.15.1", "tokenizers": "0.22.2", "torch": "2.11.0"},
    "hasCudaGpu": False, "torchCuda": False, "hint": "meta ready",
}
order = []
def track_runtime():
    order.append("runtime")
    return dict(probe_fail)
def track_meta():
    order.append("meta")
    return dict(meta_ok)
def track_install(*a, **k):
    order.append("install")
    return {"ok": True, "installed": ["transformers"], "skipped": False}
def track_np(**k):
    return {"ok": True, "skipped": True, "version": "2.4.6"}
def track_unsat(pkgs):
    return list(pkgs)
def track_loaded():
    return False
with patch.object(re, "probe_asr_qwen3_runtime", side_effect=track_runtime), \\
     patch.object(re, "probe_asr_qwen3", side_effect=track_meta), \\
     patch.object(re, "ensure_numpy_numba_compatible", side_effect=track_np), \\
     patch.object(re, "_unsatisfied_packages", side_effect=track_unsat), \\
     patch.object(re, "_qwen3_native_modules_loaded", side_effect=track_loaded), \\
     patch.object(re, "_install_packages", side_effect=track_install), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value=""), \\
     patch.object(re, "pkg_version", side_effect=PackageNotFoundError("qwen-asr")):
    result = re.ensure_asr_qwen3()
print(json.dumps({
    "ok": bool(result.get("ok")),
    "ready": bool(result.get("ready")),
    "skipped": result.get("reprobeSkipped") or "",
    "hint": result.get("hint") or result.get("message") or "",
    "pyo3Hint": re._qwen3_repair_hint(["tokenizers: " + pyo3], ["tokenizers"]),
    "isPyo3": re._probe_is_pyo3_reinit(probe_fail),
    "order": order,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.ready, true);
        assert.strictEqual(payload.skipped, 'pyo3_reinit');
        assert.ok(/引擎重启后即可使用/.test(payload.hint), payload.hint);
        assert.ok(/二次初始化/.test(payload.pyo3Hint), payload.pyo3Hint);
        assert.ok(!/一键修复会把 tokenizers/.test(payload.pyo3Hint), payload.pyo3Hint);
        assert.strictEqual(payload.isPyo3, true);
        assert.ok(!payload.order.includes('pin'), `order=${JSON.stringify(payload.order)}`);
    });

    it('does not chase transformers tokenizers>=0.23.1 over the 0.22.2 pin', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import (
    TOKENIZERS_PIN,
    NUMPY_NUMBA_PIN,
    _upstream_allows_pin,
    _coerce_upstream_to_shared_pin,
    _requirement_satisfied,
)
upstream = "tokenizers<0.24.0,>=0.23.1"
coerced = _coerce_upstream_to_shared_pin("tokenizers", upstream)
print(json.dumps({
    "allowsPin": _upstream_allows_pin(TOKENIZERS_PIN, upstream),
    "allowsLoose": _upstream_allows_pin(TOKENIZERS_PIN, "tokenizers>=0.13"),
    "numpyConflict": _upstream_allows_pin(NUMPY_NUMBA_PIN, "numpy>=2.5"),
    "numpyOk": _upstream_allows_pin(NUMPY_NUMBA_PIN, "numpy>=1.24"),
    "pinInstalled": _requirement_satisfied(TOKENIZERS_PIN),
    "coerced": coerced,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.allowsPin, false);
        assert.strictEqual(payload.allowsLoose, true);
        assert.strictEqual(payload.numpyConflict, false);
        assert.strictEqual(payload.numpyOk, true);
        if (payload.pinInstalled) {
            assert.strictEqual(payload.coerced, '');
        } else {
            assert.strictEqual(payload.coerced, 'tokenizers==0.22.2');
        }
    });

    it('WhisperSeg hub pin widens when transformers 5.x is installed', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine.runtime_extras import vad_whisperseg_packages
with patch("transub_engine.runtime_extras._pkg_version_str", side_effect=lambda n: "5.13.0" if n == "transformers" else None):
    pkgs5 = list(vad_whisperseg_packages())
with patch("transub_engine.runtime_extras._pkg_version_str", side_effect=lambda n: "4.57.3" if n == "transformers" else None):
    pkgs4 = list(vad_whisperseg_packages())
print(json.dumps({"pkgs5": pkgs5, "pkgs4": pkgs4}))
`);
        const payload = JSON.parse(out);
        assert.ok(
            payload.pkgs5.some((p) => /^huggingface-hub/.test(p) && /<2\.0/.test(p)),
            `expected hub<2.0 with transformers 5.x: ${payload.pkgs5}`,
        );
        assert.ok(
            payload.pkgs4.some((p) => /^huggingface-hub/.test(p) && /<1\.0/.test(p)),
            `expected hub<1.0 with transformers 4.x: ${payload.pkgs4}`,
        );
    });

    it('skips known transformers 4.57 wheel when 5.x already satisfies', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine.runtime_extras import _prefer_skip_known_wheel
with patch("transub_engine.runtime_extras._pkg_version_str", return_value="5.13.0"), \\
     patch("transub_engine.runtime_extras._requirement_satisfied", return_value=True):
    skipSat = _prefer_skip_known_wheel("transformers>=4.40.0")
with patch("transub_engine.runtime_extras._pkg_version_str", return_value="5.13.0"), \\
     patch("transub_engine.runtime_extras._requirement_satisfied", return_value=False), \\
     patch("transub_engine.runtime_extras.known_wheel_version", return_value="4.57.3"), \\
     patch("transub_engine.runtime_extras.known_wheel_satisfies_requirement", return_value=True):
    skipNewer = _prefer_skip_known_wheel("transformers>=4.40.0")
with patch("transub_engine.runtime_extras._pkg_version_str", return_value=None), \\
     patch("transub_engine.runtime_extras._requirement_satisfied", return_value=False), \\
     patch("transub_engine.runtime_extras.known_wheel_satisfies_requirement", return_value=True):
    skipFresh = _prefer_skip_known_wheel("transformers>=4.40.0")
print(json.dumps({"skipSat": skipSat, "skipNewer": skipNewer, "skipFresh": skipFresh}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.skipSat, true);
        assert.strictEqual(j.skipNewer, true);
        assert.strictEqual(j.skipFresh, false);
    });

    it('installs asr-qwen3 before vad-whisperseg for mixed model ids', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from transub_engine.runtime_extras import extras_for_model_ids
print(json.dumps(extras_for_model_ids([
    'whisperseg-asmr',
    'qwen3-asr-1.7b',
    'anime-whisper',
])))
`);
        const keys = JSON.parse(out);
        const qi = keys.indexOf('asr-qwen3');
        const wi = keys.indexOf('vad-whisperseg');
        assert.ok(qi >= 0 && wi >= 0);
        assert.ok(qi < wi, `expected qwen before whisperseg: ${keys}`);
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

    it('dist_info_has_record reads *.dist-info/RECORD (not site-packages/RECORD)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        // Regression for GH #76: PathDistribution.locate_file("RECORD") resolves under
        // site-packages/, so a healthy numpy looked "missing RECORD" and serve exit-75 looped.
        const out = runExtras(`
import json
from importlib.metadata import distribution
from pathlib import Path
from transub_engine.pip_mirror_util import _dist_info_has_record
from transub_engine.runtime_extras import numpy_needs_numba_heal

dist = distribution("numpy")
locate = Path(str(dist.locate_file("RECORD")))
meta_record = Path(str(getattr(dist, "_path"))) / "RECORD"
print(json.dumps({
    "hasRecord": _dist_info_has_record("numpy"),
    "missingPkg": _dist_info_has_record("definitely-not-a-real-dist-xyz"),
    "locateIsSitePackagesRoot": locate.name == "RECORD" and locate.parent.name == "site-packages",
    "metaRecordExists": meta_record.is_file(),
    "heal": numpy_needs_numba_heal() or "",
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.hasRecord, true);
        assert.strictEqual(payload.missingPkg, null);
        assert.strictEqual(payload.locateIsSitePackagesRoot, true);
        assert.strictEqual(payload.metaRecordExists, true);
        assert.strictEqual(payload.heal, '');
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

    it('ensure_asr_qwen3 returns EXTRAS_REQUIRES_COLD_INSTALL when CUDA torch needed under lock', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from importlib.metadata import PackageNotFoundError
from unittest.mock import patch
from transub_engine import runtime_extras as re

probe_fail = {
    "ok": True, "ready": False, "status": "need_install",
    "missing": [], "errors": ["need cuda torch"],
    "needsTorchCuda": True, "needsTorchRocm": False,
    "versions": {"torch": "2.11.0"},
}
with patch.object(re, "probe_asr_qwen3_runtime", return_value=dict(probe_fail)), \\
     patch.object(re, "ensure_numpy_numba_compatible", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_unsatisfied_packages", return_value=[]), \\
     patch.object(re, "_qwen3_native_modules_loaded", return_value=True), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value=""), \\
     patch.object(re, "_requirement_satisfied", return_value=True), \\
     patch.object(re, "pkg_version", side_effect=PackageNotFoundError("qwen-asr")), \\
     patch.object(re, "_install_packages", side_effect=AssertionError("must not pip under lock")):
    result = re.ensure_asr_qwen3()
print(json.dumps({
    "ok": bool(result.get("ok")),
    "code": result.get("code") or "",
    "message": result.get("message") or "",
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, false);
        assert.strictEqual(payload.code, 'EXTRAS_REQUIRES_COLD_INSTALL');
        assert.ok(/GPU|CUDA|冷安装|原地重装/i.test(payload.message), payload.message);
    });

    it('ensure_asr_qwen3 heals tokenizers while only numpy is mapped (CLI self-lock)', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json, sys
from importlib.metadata import PackageNotFoundError
from unittest.mock import patch
from transub_engine import runtime_extras as re

sys.modules.setdefault("numpy", type(sys)("numpy"))
probe_ok = {
    "ok": True, "ready": True, "status": "ready",
    "missing": [], "errors": [], "versions": {},
    "needsTorchCuda": False, "needsTorchRocm": False,
}
installed = []
def track_install(pkgs, **kwargs):
    installed.extend(list(pkgs))
    return {"ok": True, "installed": list(pkgs), "skipped": False}
with patch.object(re, "probe_asr_qwen3_runtime", return_value=dict(probe_ok)), \\
     patch.object(re, "ensure_numpy_numba_compatible", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_unsatisfied_packages", return_value=["tokenizers==0.22.2"]), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value="mismatch"), \\
     patch.object(re, "pkg_version", side_effect=PackageNotFoundError("qwen-asr")), \\
     patch.object(re, "_install_packages", side_effect=track_install), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_probe_is_pyo3_reinit", return_value=False):
    result = re.ensure_asr_qwen3()
print(json.dumps({
    "ok": bool(result.get("ok")),
    "code": result.get("code") or "",
    "installed": installed,
    "loaded": re._qwen3_native_modules_loaded(),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true, JSON.stringify(payload));
        assert.ok(payload.loaded, 'numpy stub should count as loaded');
        assert.ok(
            payload.installed.some((p) => String(p).includes('tokenizers')),
            JSON.stringify(payload.installed),
        );
        assert.notStrictEqual(payload.code, 'EXTRAS_LOCKED_IN_PROCESS');
    });

    it('ensure_asr_qwen3 heals pure-Python pin gaps even when natives are mapped', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from importlib.metadata import PackageNotFoundError
from unittest.mock import patch
from transub_engine import runtime_extras as re

probe_fail = {
    "ok": True, "ready": False, "status": "need_install",
    "missing": ["transformers"], "errors": ["pin"],
    "needsTorchCuda": False, "needsTorchRocm": False, "versions": {},
}
installed = []
def track_install(pkgs, **kwargs):
    installed.extend(list(pkgs))
    return {"ok": True, "installed": list(pkgs), "skipped": False}
def req_ok(req):
    return "transformers" not in str(req)
with patch.object(re, "probe_asr_qwen3_runtime", side_effect=[
        dict(probe_fail),
        {"ok": True, "ready": True, "status": "ready", "missing": [], "errors": [], "versions": {}},
     ]), \\
     patch.object(re, "ensure_numpy_numba_compatible", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_unsatisfied_packages", return_value=[]), \\
     patch.object(re, "_qwen3_native_modules_loaded", return_value=True), \\
     patch.object(re, "_tokenizers_pin_mismatch", return_value=""), \\
     patch.object(re, "_requirement_satisfied", side_effect=req_ok), \\
     patch.object(re, "pkg_version", side_effect=PackageNotFoundError("qwen-asr")), \\
     patch.object(re, "_install_packages", side_effect=track_install), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_probe_is_pyo3_reinit", return_value=False):
    result = re.ensure_asr_qwen3()
print(json.dumps({
    "ok": bool(result.get("ok")),
    "code": result.get("code") or "",
    "installed": installed,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.ok(payload.installed.some((p) => String(p).includes('transformers')), JSON.stringify(payload.installed));
        assert.notStrictEqual(payload.code, 'EXTRAS_LOCKED_IN_PROCESS');
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

    it('ensure_asr_whisper skips when the stack is already installed', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const probeOut = runExtras(`
import json
from transub_engine.runtime_extras import probe_asr_whisper
print(json.dumps({"ready": bool(probe_asr_whisper().get("ready"))}))
`);
        if (!JSON.parse(probeOut).ready) {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.runtime_extras import ensure_asr_whisper
res = ensure_asr_whisper(force=False)
print(json.dumps({
    "ok": bool(res.get("ok")),
    "skipped": bool(res.get("skipped")),
    "reason": res.get("reason") or "",
    "code": res.get("code") or "",
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        assert.strictEqual(payload.skipped, true);
        assert.strictEqual(payload.reason, 'already_satisfied');
        assert.notStrictEqual(payload.code, 'EXTRAS_LOCKED_IN_PROCESS');
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

    it('picks a cp312 win_amd64 wheel from a simple index and skips yanked / wrong tags', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import choose_wheel_link, parse_simple_index_wheels
html = """
<a href="../../packages/aa/av-16.0.0-cp312-cp312-manylinux_2_17_x86_64.whl#sha256=abc">linux</a>
<a href="../../packages/bb/av-11.0.0-cp312-cp312-win_amd64.whl#sha256=def" data-requires-python="&gt;=3.8">win</a>
<a href="../../packages/cc/av-15.0.0-cp312-cp312-win_amd64.whl#sha256=old" data-yanked="broken">yanked</a>
<a href="../../packages/dd/av-12.0.0-py3-none-any.whl">pure</a>
<a href="../../packages/ee/av-17.0.0-cp312-cp312-win_amd64.whl" data-requires-python="&gt;=3.13">too-new</a>
<a href="../../packages/ff/av-9.0.0-cp312-cp312-win_amd64.whl">too-old</a>
"""
links = parse_simple_index_wheels(html)
chosen = choose_wheel_link(links, "av>=10")
extras = choose_wheel_link(links, "nemo_toolkit[asr]>=2.2")
print(json.dumps({
    "file": chosen.get("filename") if chosen else "",
    "version": chosen.get("version") if chosen else "",
    "extras": extras,
    "count": len(links),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.file, 'av-11.0.0-cp312-cp312-win_amd64.whl');
        assert.strictEqual(payload.version, '11.0.0');
        assert.strictEqual(payload.extras, null);
        assert.ok(payload.count >= 4);
    });

    it('choose_wheel_link skips pre-release mpmath unless the pin asks for it', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const out = runExtras(`
import json
from transub_engine.pip_mirror_util import choose_wheel_link, parse_simple_index_wheels
from transub_engine.runtime_extras import TORCH_HARD_PY_DEPS
html = """
<a href="../../packages/aa/mpmath-1.5.0a1-py3-none-any.whl">alpha</a>
<a href="../../packages/bb/mpmath-1.3.0-py3-none-any.whl">stable</a>
<a href="../../packages/cc/mpmath-1.4.0a2-py3-none-any.whl">older-alpha</a>
"""
links = parse_simple_index_wheels(html)
stable = choose_wheel_link(links, "mpmath>=1.3.0")
pinned = choose_wheel_link(links, "mpmath>=1.3.0,<1.5")
explicit_pre = choose_wheel_link(links, "mpmath>=1.5.0a1")
hard = next(x for x in TORCH_HARD_PY_DEPS if x.startswith("mpmath"))
print(json.dumps({
    "stable": (stable or {}).get("version"),
    "pinned": (pinned or {}).get("version"),
    "explicit_pre": (explicit_pre or {}).get("version"),
    "hard_pin": hard,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.stable, '1.3.0');
        assert.strictEqual(payload.pinned, '1.3.0');
        assert.strictEqual(payload.explicit_pre, '1.5.0a1');
        assert.ok(
            payload.hard_pin.includes('<1.5'),
            `expected mpmath cap <1.5, got ${payload.hard_pin}`,
        );
    });

    it('NVIDIA force-heal strips bare torch/torchaudio when CUDA already matches', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re

calls = []
seen_pkgs = []
def track_cuda(**k):
    calls.append("cuda")
    return {"ok": True, "installed": ["torch", "torchaudio"]}
def track_download(pkgs, *a, **k):
    calls.append("download")
    seen_pkgs.extend(list(pkgs or []))
    return {"ok": False, "error": "stop after asserting stripped pkgs"}

with patch.object(re, "_nvidia_gpu_present", return_value=True), \\
     patch.object(re, "_torch_cuda_importable", return_value=True), \\
     patch.object(re, "_torchaudio_cuda_variant_mismatch", return_value=False), \\
     patch.object(re, "_prefer_skip_known_wheel", return_value=False), \\
     patch.object(re, "_unsatisfied_packages", side_effect=lambda pkgs: list(pkgs)), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch("transub_engine.device.torch_cuda_variant_mismatch", return_value=False), \\
     patch("transub_engine.runtime_audio._install_torch_cuda", side_effect=track_cuda), \\
     patch("transub_engine.runtime_extras.download_requirements_direct", side_effect=track_download), \\
     patch("transub_engine.runtime_extras.resolve_pip_mirror_order", return_value=(
         [("https://example.com/simple", "example.com")], [], False
     )):
    only_torch = re._install_packages(
        ["torch", "torchaudio"],
        force=True,
        reassert_pins=False,
    )
    mixed = re._install_packages(
        ["transformers>=5.13.0,<5.16", "torch", "torchaudio"],
        force=True,
        reassert_pins=False,
    )
print(json.dumps({
    "onlyOk": bool(only_torch.get("ok")),
    "onlyReason": only_torch.get("reason") or "",
    "mixedCalls": calls,
    "mixedPkgs": seen_pkgs,
    "mixedHasTorch": any(re._torch_family_req(p) for p in seen_pkgs),
    "mismatchHint": "成对重装 CUDA" in re._qwen3_repair_hint(
        ["Qwen3ASRProcessor: Could not load this library: libtorchaudio.pyd ← [WinError 127] 找不到指定的程序。"],
        ["transformers"],
    ),
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.onlyOk, true);
        assert.strictEqual(payload.onlyReason, 'torch_cuda_already_satisfied');
        assert.deepStrictEqual(payload.mixedCalls, ['download']);
        assert.strictEqual(payload.mixedHasTorch, false);
        assert.ok(payload.mixedPkgs.some((p) => String(p).includes('transformers')));
        assert.strictEqual(payload.mismatchHint, true);
    });

    it('qwen3 repair hint says ROCm not CUDA on AMD torchaudio WinError 127', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re

with patch.object(re, "_nvidia_gpu_present", return_value=False), \\
     patch("transub_engine.rocm_device.amd_gpu_present", return_value=True):
    hint = re._qwen3_repair_hint(
        ["torchaudio: Could not load this library: libtorchaudio.pyd ← [WinError 127] 找不到指定的程序。",
         "Qwen3ASRProcessor: Could not load this library: libtorchaudio.pyd ← [WinError 127] 找不到指定的程序。"],
        ["torchaudio", "transformers"],
    )
print(json.dumps({"hint": hint}))
`);
        const payload = JSON.parse(out);
        assert.ok(/ROCm/.test(payload.hint), payload.hint);
        assert.ok(!/成对重装 CUDA/.test(payload.hint), payload.hint);
    });

    it('NVIDIA force-heal reinstalls CUDA when torchaudio is a CPU hybrid', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re

calls = []
def track_cuda(**k):
    calls.append("cuda")
    return {"ok": True, "installed": ["torch", "torchaudio"]}
def track_download(*a, **k):
    calls.append("download")
    return {"ok": False, "error": "should not download CPU torch"}

with patch.object(re, "_nvidia_gpu_present", return_value=True), \\
     patch.object(re, "_torch_cuda_importable", return_value=True), \\
     patch.object(re, "_torchaudio_cuda_variant_mismatch", return_value=True), \\
     patch.object(re, "_prefer_skip_known_wheel", return_value=False), \\
     patch.object(re, "_unsatisfied_packages", side_effect=lambda pkgs: list(pkgs)), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch("transub_engine.device.torch_cuda_variant_mismatch", return_value=False), \\
     patch("transub_engine.runtime_audio._install_torch_cuda", side_effect=track_cuda), \\
     patch("transub_engine.runtime_extras.download_requirements_direct", side_effect=track_download):
    result = re._install_packages(
        ["torch", "torchaudio"],
        force=True,
        reassert_pins=False,
    )
print(json.dumps({
    "ok": bool(result.get("ok")),
    "calls": calls,
    "hasCuda": bool(result.get("torchCuda")),
    "installed": result.get("installed") or [],
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.ok, true);
        // May run CUDA once in the torch_pkgs branch and again in the
        // pre-pip reassert while the mismatch probe is still patched True.
        assert.ok(payload.calls.length >= 1);
        assert.ok(payload.calls.every((c) => c === 'cuda'));
        assert.ok(!payload.calls.includes('download'));
        assert.strictEqual(payload.hasCuda, true);
        assert.ok(payload.installed.includes('torch') || payload.installed.includes('torchaudio'));
    });

    it('torchaudio CPU metadata is unsatisfied on NVIDIA when CUDA torch libs exist', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re

with patch.object(re, "_nvidia_gpu_present", return_value=True), \\
     patch.object(re, "_torch_cuda_importable", return_value=True), \\
     patch.object(re, "_pkg_version_str", side_effect=lambda n: {
         "torchaudio": "2.11.0",
         "torch": "2.11.0+cu126",
         "mpmath": None,
     }.get(n)), \\
     patch("transub_engine.device.installed_torch_cuda_tag", return_value="cu126"), \\
     patch.object(re, "pkg_version", side_effect=lambda n: {
         "torchaudio": "2.11.0",
         "torch": "2.11.0+cu126",
     }[n]):
    ta_ok = re._requirement_satisfied("torchaudio")
    torch_ok = re._requirement_satisfied("torch")
    mismatch = re._torchaudio_cuda_variant_mismatch()
print(json.dumps({"taOk": ta_ok, "torchOk": torch_ok, "mismatch": mismatch}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.mismatch, true);
        assert.strictEqual(payload.taOk, false);
        assert.strictEqual(payload.torchOk, true);
    });

    it('AMD force-heal keeps ROCm and does not install CUDA torch', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runExtras(`
import json
from unittest.mock import patch
from transub_engine import runtime_extras as re

calls = []
def track_rocm(**k):
    calls.append("rocm")
    return {"ok": True, "installed": ["torch", "torchaudio"], "gfx": "gfx1100"}
def track_cuda(**k):
    calls.append("cuda")
    return {"ok": True, "installed": ["torch", "torchaudio"]}
def track_download(pkgs, *a, **k):
    calls.append("download")
    return {"ok": False, "error": "stop"}

with patch.object(re, "_nvidia_gpu_present", return_value=False), \\
     patch("transub_engine.rocm_device.amd_gpu_present", return_value=True), \\
     patch("transub_engine.rocm_device.torch_rocm_libs_present", return_value=True), \\
     patch("transub_engine.rocm_device.install_torch_rocm", side_effect=track_rocm), \\
     patch.object(re, "_torch_rocm_variant_mismatch", return_value=False), \\
     patch.object(re, "_prefer_skip_known_wheel", return_value=False), \\
     patch.object(re, "_unsatisfied_packages", side_effect=lambda pkgs: list(pkgs)), \\
     patch.object(re, "_reassert_shared_runtime_pins", return_value={"ok": True, "skipped": True}), \\
     patch.object(re, "_reassert_gpu_torch_after_extras", return_value={"ok": True, "skipped": True}), \\
     patch("transub_engine.runtime_audio._install_torch_cuda", side_effect=track_cuda), \\
     patch("transub_engine.runtime_extras.download_requirements_direct", side_effect=track_download), \\
     patch("transub_engine.runtime_extras.resolve_pip_mirror_order", return_value=(
         [("https://example.com/simple", "example.com")], [], False
     )), \\
     patch("transub_engine.rocm_device.probe_torchvision_import", return_value=(True, "")), \\
     patch("transub_engine.rocm_device.reconcile_broken_torchvision", return_value={"ok": True}):
    only = re._install_packages(["torch", "torchaudio"], force=True, reassert_pins=False)
    mixed = re._install_packages(
        ["peft>=0.17.0,<1", "torch", "torchaudio"],
        force=True,
        reassert_pins=False,
    )
print(json.dumps({
    "onlyOk": bool(only.get("ok")),
    "onlyReason": only.get("reason") or "",
    "calls": calls,
    "skippedCuda": "cuda" not in calls,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.onlyOk, true);
        assert.strictEqual(payload.onlyReason, 'torch_rocm_already_satisfied');
        assert.strictEqual(payload.skippedCuda, true);
        assert.ok(!payload.calls.includes('rocm'), 'should not reinstall ROCm when already OK');
        assert.ok(payload.calls.includes('download'));
    });
});
