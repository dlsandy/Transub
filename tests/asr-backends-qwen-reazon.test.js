/**
 * Catalog / dispatch for ReazonSpeech K2 + Qwen3-ASR + Parakeet backends.
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

describe('asr backends qwen3 / reazon-k2 / parakeet', () => {
    it('registers catalog entries and resolve_asr_backend', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.models_catalog import (
    get_spec,
    resolve_asr_backend,
    expand_model_companions,
    MODEL_COMPANIONS,
)
from transub_engine.runtime_extras import extras_for_model_ids
print(json.dumps({
    'reazon_backend': get_spec('reazonspeech-k2').backend,
    'qwen_backend': get_spec('qwen3-asr-0.6b').backend,
    'align_backend': get_spec('qwen3-forced-aligner-0.6b').backend,
    'pk_ja_backend': get_spec('parakeet-tdt-ctc-0.6b-ja').backend,
    'pk_v2_backend': get_spec('parakeet-tdt-0.6b-v2').backend,
    'pk_v3_backend': get_spec('parakeet-tdt-0.6b-v3').backend,
    'pk_v3_langs': get_spec('parakeet-tdt-0.6b-v3').languages,
    'r_resolve': resolve_asr_backend('reazonspeech-k2'),
    'q_resolve': resolve_asr_backend('qwen3-asr-0.6b'),
    'w_resolve': resolve_asr_backend('anime-whisper'),
    'pk_resolve': resolve_asr_backend('parakeet-tdt-0.6b-v2'),
    'pk_hub_resolve': resolve_asr_backend('nvidia-parakeet-custom'),
    'companions': expand_model_companions(['qwen3-asr-0.6b']),
    'extras_r': extras_for_model_ids(['reazonspeech-k2']),
    'extras_q': extras_for_model_ids(['qwen3-asr-0.6b']),
    'extras_pk': extras_for_model_ids(['parakeet-tdt-ctc-0.6b-ja', 'parakeet-tdt-0.6b-v3']),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.reazon_backend, 'reazon-k2');
        assert.strictEqual(j.qwen_backend, 'qwen3-asr');
        assert.strictEqual(j.align_backend, 'qwen3-align');
        assert.strictEqual(j.pk_ja_backend, 'parakeet');
        assert.strictEqual(j.pk_v2_backend, 'parakeet');
        assert.strictEqual(j.pk_v3_backend, 'parakeet');
        assert.ok(j.pk_v3_langs.includes('en'));
        assert.ok(j.pk_v3_langs.includes('de'));
        assert.ok(!j.pk_v3_langs.includes('ja'));
        assert.ok(!j.pk_v3_langs.includes('zh'));
        assert.strictEqual(j.r_resolve, 'reazon-k2');
        assert.strictEqual(j.q_resolve, 'qwen3-asr');
        assert.strictEqual(j.w_resolve, 'whisper');
        assert.strictEqual(j.pk_resolve, 'parakeet');
        assert.strictEqual(j.pk_hub_resolve, 'parakeet');
        assert.deepStrictEqual(j.companions, [
            'qwen3-asr-0.6b',
            'qwen3-forced-aligner-0.6b',
        ]);
        assert.ok(j.extras_r.includes('asr-reazon-k2'));
        assert.ok(j.extras_q.includes('asr-qwen3'));
        assert.ok(j.extras_pk.includes('asr-parakeet'));
        assert.strictEqual(j.extras_pk.filter((x) => x === 'asr-parakeet').length, 1);
    });
});
