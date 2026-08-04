/**
 * Catalog / dispatch for ReazonSpeech K2 + Qwen3-ASR backends.
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

describe('asr backends qwen3 / reazon-k2', () => {
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
    'r_resolve': resolve_asr_backend('reazonspeech-k2'),
    'q_resolve': resolve_asr_backend('qwen3-asr-0.6b'),
    'w_resolve': resolve_asr_backend('anime-whisper'),
    'companions': expand_model_companions(['qwen3-asr-0.6b']),
    'extras_r': extras_for_model_ids(['reazonspeech-k2']),
    'extras_q': extras_for_model_ids(['qwen3-asr-0.6b']),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.reazon_backend, 'reazon-k2');
        assert.strictEqual(j.qwen_backend, 'qwen3-asr');
        assert.strictEqual(j.align_backend, 'qwen3-align');
        assert.strictEqual(j.r_resolve, 'reazon-k2');
        assert.strictEqual(j.q_resolve, 'qwen3-asr');
        assert.strictEqual(j.w_resolve, 'whisper');
        assert.deepStrictEqual(j.companions, [
            'qwen3-asr-0.6b',
            'qwen3-forced-aligner-0.6b',
        ]);
        assert.ok(j.extras_r.includes('asr-reazon-k2'));
        assert.ok(j.extras_q.includes('asr-qwen3'));
    });
});
