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

describe('asr backends qwen3 / reazon-k2 / parakeet / cohere', () => {
    it('registers catalog entries and resolve_asr_backend', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.models_catalog import (
    get_spec,
    resolve_asr_backend,
    expand_model_companions,
)
from transub_engine.runtime_extras import extras_for_model_ids
from transub_engine.asr.qwen3_asr import wants_forced_aligner
print(json.dumps({
    'reazon_backend': get_spec('reazonspeech-k2').backend,
    'qwen_backend': get_spec('qwen3-asr-0.6b').backend,
    'qwen_gal_backend': get_spec('qwen3-asr-1.7b-ja-anime-galgame').backend,
    'qwen_neo_backend': get_spec('qwen3-asr-1.7b-ja').backend,
    'qwen_gal_hub': get_spec('qwen3-asr-1.7b-ja-anime-galgame').hub_id,
    'qwen_neo_hub': get_spec('qwen3-asr-1.7b-ja').hub_id,
    'align_backend': get_spec('qwen3-forced-aligner-0.6b').backend,
    'pk_ja_backend': get_spec('parakeet-tdt-ctc-0.6b-ja').backend,
    'pk_v2_backend': get_spec('parakeet-tdt-0.6b-v2').backend,
    'pk_v3_backend': get_spec('parakeet-tdt-0.6b-v3').backend,
    'pk_v3_langs': get_spec('parakeet-tdt-0.6b-v3').languages,
    'cohere_backend': get_spec('cohere-transcribe-03-2026').backend,
    'cohere_langs': get_spec('cohere-transcribe-03-2026').languages,
    'r_resolve': resolve_asr_backend('reazonspeech-k2'),
    'q_resolve': resolve_asr_backend('qwen3-asr-0.6b'),
    'q_gal_resolve': resolve_asr_backend('qwen3-asr-1.7b-ja-anime-galgame'),
    'w_resolve': resolve_asr_backend('anime-whisper'),
    'pk_resolve': resolve_asr_backend('parakeet-tdt-0.6b-v2'),
    'pk_hub_resolve': resolve_asr_backend('nvidia-parakeet-custom'),
    'cohere_resolve': resolve_asr_backend('cohere-transcribe-03-2026'),
    'cohere_hub_resolve': resolve_asr_backend('cohere-asr-custom'),
    'companions': expand_model_companions(['qwen3-asr-0.6b']),
    'companions_gal': expand_model_companions(['qwen3-asr-1.7b-ja-anime-galgame']),
    'extras_r': extras_for_model_ids(['reazonspeech-k2']),
    'extras_q': extras_for_model_ids(['qwen3-asr-0.6b']),
    'extras_gal': extras_for_model_ids(['qwen3-asr-1.7b-ja-anime-galgame']),
    'extras_pk': extras_for_model_ids(['parakeet-tdt-ctc-0.6b-ja', 'parakeet-tdt-0.6b-v3']),
    'extras_cohere': extras_for_model_ids(['cohere-transcribe-03-2026']),
    'want_align_none': wants_forced_aligner(None),
    'want_align_ten': wants_forced_aligner('ten'),
    'want_align_id': wants_forced_aligner('qwen3-forced-aligner-0.6b'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.reazon_backend, 'reazon-k2');
        assert.strictEqual(j.qwen_backend, 'qwen3-asr');
        assert.strictEqual(j.qwen_gal_backend, 'qwen3-asr');
        assert.strictEqual(j.qwen_neo_backend, 'qwen3-asr');
        assert.ok(String(j.qwen_gal_hub).includes('Anime-Galgame'));
        assert.ok(String(j.qwen_neo_hub).includes('neosophie'));
        assert.strictEqual(j.align_backend, 'qwen3-align');
        assert.strictEqual(j.pk_ja_backend, 'parakeet');
        assert.strictEqual(j.pk_v2_backend, 'parakeet');
        assert.strictEqual(j.pk_v3_backend, 'parakeet');
        assert.strictEqual(j.cohere_backend, 'cohere-asr');
        assert.ok(j.cohere_langs.includes('en'));
        assert.ok(j.cohere_langs.includes('ja'));
        assert.ok(j.pk_v3_langs.includes('en'));
        assert.ok(j.pk_v3_langs.includes('de'));
        assert.ok(!j.pk_v3_langs.includes('ja'));
        assert.ok(!j.pk_v3_langs.includes('zh'));
        assert.strictEqual(j.r_resolve, 'reazon-k2');
        assert.strictEqual(j.q_resolve, 'qwen3-asr');
        assert.strictEqual(j.q_gal_resolve, 'qwen3-asr');
        assert.strictEqual(j.w_resolve, 'whisper');
        assert.strictEqual(j.pk_resolve, 'parakeet');
        assert.strictEqual(j.pk_hub_resolve, 'parakeet');
        assert.strictEqual(j.cohere_resolve, 'cohere-asr');
        assert.strictEqual(j.cohere_hub_resolve, 'cohere-asr');
        assert.deepStrictEqual(j.companions, ['qwen3-asr-0.6b']);
        assert.deepStrictEqual(j.companions_gal, ['qwen3-asr-1.7b-ja-anime-galgame']);
        assert.strictEqual(j.want_align_none, false);
        assert.strictEqual(j.want_align_ten, false);
        assert.strictEqual(j.want_align_id, true);
        assert.ok(j.extras_r.includes('asr-reazon-k2'));
        assert.ok(j.extras_q.includes('asr-qwen3'));
        assert.ok(j.extras_gal.includes('asr-qwen3'));
        assert.ok(j.extras_pk.includes('asr-parakeet'));
        assert.strictEqual(j.extras_pk.filter((x) => x === 'asr-parakeet').length, 1);
        assert.ok(j.extras_cohere.includes('asr-cohere'));
    });

    it('asr-cohere pins transformers 5.6+ for CohereAsr', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
pkgs = list(EXTRA_PACKAGES.get('asr-cohere') or ())
print(json.dumps({'pkgs': pkgs}))
`);
        const j = JSON.parse(out);
        assert.ok(j.pkgs.some((p) => /tokenizers>=0\.22\.0,<=0\.23\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /transformers>=5\.6\.0,<6/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /huggingface-hub>=1\.5\.0,<2\.0/.test(p)), j.pkgs.join(','));
    });
});
