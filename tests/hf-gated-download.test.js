/**
 * Hub gated-repo error formatting + Cohere ignore patterns.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

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
        timeout: 30000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('hf gated download helpers', () => {
    it('formats gated 403 and ignores cohere eval_results', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.download import (
    format_hub_download_error,
    _hub_ignore_patterns_for,
    _is_hub_gated_error,
    resolve_hf_token,
)
from transub_engine.models_catalog import get_spec

msg = (
    "403 Client Error. Cannot access gated repo for url "
    "https://hf-mirror.com/CohereLabs/cohere-transcribe-03-2026/resolve/x/.eval_results/y.yaml. "
    "Access to model CohereLabs/cohere-transcribe-03-2026 is restricted and you are not in the authorized list."
)
err = RuntimeError(msg)
friendly = format_hub_download_error(
    err,
    model_id='cohere-transcribe-03-2026',
    endpoint='https://hf-mirror.com',
    hub_id='CohereLabs/cohere-transcribe-03-2026',
)
spec = get_spec('cohere-transcribe-03-2026')
print(json.dumps({
    'gated': _is_hub_gated_error(err),
    'has_token_hint': 'Token' in friendly or 'token' in friendly.lower(),
    'has_gate_hint': '门禁' in friendly,
    'has_official_hint': '官方' in friendly,
    'ignore': _hub_ignore_patterns_for(spec),
    'token_from_arg': resolve_hf_token('hf_abc'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.gated, true);
        assert.strictEqual(j.has_token_hint, true);
        assert.strictEqual(j.has_gate_hint, true);
        assert.strictEqual(j.has_official_hint, true);
        assert.ok(Array.isArray(j.ignore));
        assert.ok(j.ignore.some((p) => String(p).includes('eval_results')));
        assert.strictEqual(j.token_from_arg, 'hf_abc');
    });

    it('cohere incomplete weights alone do not count as installed', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from unittest.mock import patch
from transub_engine import download as dl

with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    (root / 'model.safetensors').write_bytes(b'x' * 2048)
    with patch.object(dl, 'model_local_path', return_value=root):
        incomplete = dl.is_model_installed('cohere-transcribe-03-2026')
    (root / 'config.json').write_text('{"model_type":"cohere_asr"}', encoding='utf-8')
    (root / 'preprocessor_config.json').write_text('{"feature_size":80}', encoding='utf-8')
    (root / 'tokenizer_config.json').write_text('{"tokenizer_class":"X"}', encoding='utf-8')
    (root / 'tokenizer.json').write_text('{"version":"1.0"}', encoding='utf-8')
    with patch.object(dl, 'model_local_path', return_value=root):
        complete = dl.is_model_installed('cohere-transcribe-03-2026')
print(json.dumps({'incomplete': incomplete, 'complete': complete}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.incomplete, false);
        assert.strictEqual(j.complete, true);
    });
});
