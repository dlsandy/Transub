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

    it('skip_torch does not tear down an already-loaded torch', () => {
        const out = runPy(`
import json
import sys
import types
from transub_engine.device import (
    clear_partial_torch_modules,
    is_torch_c_extension_loaded,
    soften_torch_cuda_import_failure,
)
from transub_engine.runtime_release import release_gpu_memory

torch = types.ModuleType("torch")
torch._C = types.ModuleType("torch._C")
sys.modules["torch"] = torch
sys.modules["torch._C"] = torch._C
ct2 = types.ModuleType("ctranslate2")
ct2.clear_cache = lambda: None
sys.modules["ctranslate2"] = ct2
assert is_torch_c_extension_loaded()

clear_partial_torch_modules()
assert sys.modules.get("torch") is torch

with soften_torch_cuda_import_failure(skip_torch=True):
    import torch as t2
assert t2 is torch
assert sys.modules.get("torch") is torch

release_gpu_memory(reason="test_keep_torch", unload_models=False)
assert sys.modules.get("torch") is torch
print(json.dumps({"kept": True}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.kept, true);
    });

    it('skip_torch still blocks a fresh torch import', () => {
        const out = runPy(`
import json
from transub_engine.device import soften_torch_cuda_import_failure
err = ""
with soften_torch_cuda_import_failure(skip_torch=True):
    try:
        import torch
    except ImportError as e:
        err = str(e)
print(json.dumps({"skipped": "skipped during CTranslate2" in err}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.skipped, true);
    });

    it('clear_partial_torch_modules drops incomplete torch stubs', () => {
        const out = runPy(`
import json
import sys
import types
from transub_engine.device import clear_partial_torch_modules, is_torch_c_extension_loaded

partial = types.ModuleType("torch")
sys.modules["torch"] = partial
sys.modules["torch.foo"] = types.ModuleType("torch.foo")
assert not is_torch_c_extension_loaded()
clear_partial_torch_modules()
print(json.dumps({
    "torchGone": "torch" not in sys.modules,
    "fooGone": "torch.foo" not in sys.modules,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.torchGone, true);
        assert.strictEqual(payload.fooGone, true);
    });

    it('clear_partial_torch_modules keeps torch._C and marks poison after package strip', () => {
        const out = runPy(`
import json
import sys
import types
from transub_engine.device import (
    clear_partial_torch_modules,
    format_torch_cuda_load_failure,
    is_torch_c_extension_loaded,
    is_torch_reimport_poisoned,
    mark_torch_import_ok,
)

torch = types.ModuleType("torch")
torch._C = types.ModuleType("torch._C")
sys.modules["torch"] = torch
sys.modules["torch._C"] = torch._C
mark_torch_import_ok()
assert is_torch_c_extension_loaded()

# Simulate a bad purge that only deletes the package entry.
del sys.modules["torch"]
assert is_torch_reimport_poisoned()
clear_partial_torch_modules()
assert "torch._C" in sys.modules
msg = format_torch_cuda_load_failure("function '_has_torch_function' already has a docstring")
print(json.dumps({
    "poisoned": is_torch_reimport_poisoned(),
    "cKept": "torch._C" in sys.modules,
    "msgHasPoison": "损坏" in msg,
    "msgNot1114Wrap": "WinError 1114" not in msg or "损坏" in msg,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.poisoned, true);
        assert.strictEqual(payload.cKept, true);
        assert.strictEqual(payload.msgHasPoison, true);
    });

    it('clear_partial_torch_modules does not strip when only torch._C remains', () => {
        const out = runPy(`
import json
import sys
import types
from transub_engine.device import clear_partial_torch_modules, is_torch_c_extension_loaded

sys.modules["torch._C"] = types.ModuleType("torch._C")
assert is_torch_c_extension_loaded()
clear_partial_torch_modules()
print(json.dumps({"cKept": "torch._C" in sys.modules}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.cKept, true);
    });

    it('format_torch_cuda_load_failure prefers WinError 1114 over sticky poison', () => {
        const out = runPy(`
import json
import sys
import types
from transub_engine.device import (
    format_torch_cuda_load_failure,
    mark_torch_import_failed_after_native,
)

sys.modules["torch._C"] = types.ModuleType("torch._C")
mark_torch_import_failed_after_native()
msg1114 = (
    '[WinError 1114] Error loading '
    r'"F:\\\\x\\\\torch\\\\lib\\\\cublas64_12.dll" or one of its dependencies.'
)
msg = format_torch_cuda_load_failure(msg1114)
poison = format_torch_cuda_load_failure(
    "function '_has_torch_function' already has a docstring"
)
print(json.dumps({
    "has1114": "WinError 1114" in msg or "cublas" in msg.lower(),
    "notDocstringWrap": "already has a docstring" not in msg,
    "poisonDoc": "损坏" in poison,
}))
`);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.has1114, true);
        assert.strictEqual(payload.notDocstringWrap, true);
        assert.strictEqual(payload.poisonDoc, true);
    });

    it('probe_torch_engine_startup returns structured ready/code fields', () => {
        const out = runPy(`
import json
from transub_engine.runtime_gpu import probe_torch_engine_startup
out = probe_torch_engine_startup(soft_ct2=False)
assert "ready" in out and "code" in out and "ok" in out
print(json.dumps({
    "ready": bool(out.get("ready")),
    "ok": bool(out.get("ok")),
    "hasCode": isinstance(out.get("code"), str),
    "hasMessage": bool(str(out.get("message") or "")),
}))
`, 120000);
        const payload = JSON.parse(out);
        assert.strictEqual(payload.hasCode, true);
        assert.strictEqual(payload.hasMessage, true);
        assert.strictEqual(typeof payload.ready, 'boolean');
        assert.strictEqual(typeof payload.ok, 'boolean');
    });

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
