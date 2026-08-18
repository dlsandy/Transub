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

    it('asr-qwen3 pins transformers 4.x + tokenizers<=0.23 for qwen-asr', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
pkgs = list(EXTRA_PACKAGES.get('asr-qwen3') or ())
print(json.dumps({'pkgs': pkgs}))
`);
        const j = JSON.parse(out);
        assert.ok(j.pkgs.some((p) => /tokenizers>=0\.22\.0,<=0\.23\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /transformers>=4\.51\.0,<5\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /huggingface-hub>=0\.34\.0,<1\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /numpy>=1\.24\.0,<2\.5/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /qwen-asr/.test(p)), j.pkgs.join(','));
    });

    it('Qwen island path batches in-memory PCM (no per-frame ffmpeg)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
import numpy as np
from transub_engine.asr import qwen3_asr

class FakeModel:
    def __init__(self):
        self.calls = []
        self.max_inference_batch_size = 32
        self.max_new_tokens = 512
    def transcribe(self, audio=None, language=None, return_time_stamps=False):
        n = len(audio) if isinstance(audio, list) else 1
        first = audio[0] if isinstance(audio, list) else audio
        kind = 'tuple' if isinstance(first, tuple) else type(first).__name__
        self.calls.append({'n': n, 'kind': kind})
        class R:
            text = 'あ'
            time_stamps = None
        return [R() for _ in range(n)]

audio = np.zeros(16000 * 20, dtype=np.float32)
intervals = [(0.0, 4.0), (5.0, 9.0), (10.0, 14.0), (15.0, 19.0)]
model = FakeModel()
trim_calls = []

def _boom_trim(*_a, **_k):
    trim_calls.append(1)
    raise RuntimeError('ffmpeg trim should not run when PCM is available')

from transub_engine.vad import ten_vad_seg
with patch.object(ten_vad_seg, 'ten_vad_available', return_value=True):
    with patch.object(ten_vad_seg, 'collect_ten_vad_intervals_with_audio', return_value=(intervals, audio)):
        with patch('transub_engine.audio.preprocess.trim_media_window', side_effect=_boom_trim):
            cues = qwen3_asr._qwen_island_vad_transcribe(
                media_path='clip.mp4',
                model=model,
                lang='Japanese',
                duration_s=20.0,
                vad_backend='ten',
                asr_model='qwen3-asr-1.7b-ja-anime-galgame',
                on_progress=None,
                on_cue=None,
                should_cancel=None,
            )

print(json.dumps({
    'calls': model.calls,
    'cue_n': len(cues or []),
    'trim': len(trim_calls),
    'batch_restored': model.max_inference_batch_size,
    'tok_restored': model.max_new_tokens,
    'b17': qwen3_asr._island_batch_size('qwen3-asr-1.7b-ja-anime-galgame'),
    'b06': qwen3_asr._island_batch_size('qwen3-asr-0.6b'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.b17, 8);
        assert.strictEqual(j.b06, 16);
        assert.strictEqual(j.trim, 0);
        assert.strictEqual(j.calls.length, 1, JSON.stringify(j.calls));
        assert.strictEqual(j.calls[0].n, 4);
        assert.strictEqual(j.calls[0].kind, 'tuple');
        assert.ok(j.cue_n >= 4, `cues ${j.cue_n}`);
        assert.strictEqual(j.batch_restored, 32);
        assert.strictEqual(j.tok_restored, 512);
    });

    it('Qwen transcribe list splits CUDA OOM batches', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr import qwen3_asr

class OomThenOk:
    def __init__(self):
        self.sizes = []
    def transcribe(self, audio=None, language=None, return_time_stamps=False):
        n = len(audio) if isinstance(audio, list) else 1
        self.sizes.append(n)
        if n > 2:
            raise RuntimeError('CUDA out of memory')
        class R:
            text = 'ok'
        return [R() for _ in range(n)]

m = OomThenOk()
audios = ['a.wav', 'b.wav', 'c.wav', 'd.wav']
out = qwen3_asr._transcribe_audio_list(m, audios, 'Japanese', want_ts=False)
print(json.dumps({'sizes': m.sizes, 'n': len(out), 'oom': qwen3_asr._is_cuda_oom(RuntimeError('CUDA out of memory'))}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.oom, true);
        assert.strictEqual(j.n, 4);
        assert.ok(j.sizes[0] === 4, JSON.stringify(j.sizes));
        assert.ok(j.sizes.slice(1).every((n) => n <= 2), JSON.stringify(j.sizes));
    });

    it('pip extras keep numpy numba constraint helper', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import NUMPY_NUMBA_PIN, _with_numpy_numba_constraint
print(json.dumps({
    'pin': NUMPY_NUMBA_PIN,
    'with': _with_numpy_numba_constraint(['transformers>=4.51.0,<5.0']),
    'keep': _with_numpy_numba_constraint(['numpy>=1.24.0,<2.5', 'torch']),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.pin, 'numpy>=1.24.0,<2.5');
        assert.ok(j.with.includes('numpy>=1.24.0,<2.5'));
        assert.strictEqual(j.with.filter((p) => p.startsWith('numpy')).length, 1);
        assert.deepStrictEqual(j.keep, ['numpy>=1.24.0,<2.5', 'torch']);
    });
});
