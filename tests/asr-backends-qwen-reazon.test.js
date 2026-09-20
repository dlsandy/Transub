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
    const text = String(res.stdout || '').trim();
    // Prefer the last JSON object when libraries print warnings to stdout.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
            return JSON.stringify(JSON.parse(lines[i]));
        } catch { /* keep looking */ }
    }
    return text;
}

function parsePyJson(out) {
    return JSON.parse(String(out || '').trim());
}

describe('asr backends qwen3 / reazon-k2 / parakeet / cohere', () => {
    it('registers catalog entries and resolve_asr_backend', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.models_catalog import (
    get_spec,
    get_catalog,
    resolve_asr_backend,
    expand_model_companions,
)
from transub_engine.runtime_extras import extras_for_model_ids
from transub_engine.asr.qwen3_asr import wants_forced_aligner
print(json.dumps({
    'reazon_backend': get_spec('reazonspeech-k2').backend,
    'qwen_backend': get_spec('qwen3-asr-0.6b').backend,
    'qwen_gal_backend': get_spec('qwen3-asr-1.7b-ja-anime-galgame').backend,
    'qwen_legacy_alias_id': get_spec('qwen3-asr-1.7b-ja').id,
    'qwen_gal_hub': get_spec('qwen3-asr-1.7b-ja-anime-galgame').hub_id,
    'qwen_legacy_alias_hub': get_spec('qwen3-asr-1.7b-ja').hub_id,
    'qwen_ids': [s.id for s in get_catalog() if 'qwen3-asr' in s.id],
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
        assert.strictEqual(j.qwen_legacy_alias_id, 'qwen3-asr-1.7b');
        assert.ok(String(j.qwen_gal_hub).includes('Anime-Galgame-hf'), j.qwen_gal_hub);
        assert.strictEqual(j.qwen_legacy_alias_hub, 'Qwen/Qwen3-ASR-1.7B-hf');
        assert.ok(!j.qwen_ids.includes('qwen3-asr-1.7b-ja'), j.qwen_ids);
        assert.ok(j.qwen_ids.includes('qwen3-asr-1.7b'), j.qwen_ids);
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
        assert.ok(j.pkgs.some((p) => /tokenizers==0\.22\.2/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /transformers>=5\.6\.0,<6/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /huggingface-hub>=1\.5\.0,<2\.0/.test(p)), j.pkgs.join(','));
    });

    it('asr-qwen3 pins transformers 5.13+ (-hf) without qwen-asr', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
from transub_engine.models_catalog import get_spec, expand_model_companions
pkgs = list(EXTRA_PACKAGES.get('asr-qwen3') or ())
print(json.dumps({
    'pkgs': pkgs,
    'hub06': get_spec('qwen3-asr-0.6b').hub_id,
    'hubAlign': get_spec('qwen3-forced-aligner-0.6b').hub_id,
    'hubLora': get_spec('qwen3-asr-1.7b-ja-anime-lora-v3').hub_id,
    'hubBase': get_spec('qwen3-asr-1.7b').hub_id,
    'loraBackend': get_spec('qwen3-asr-1.7b-ja-anime-lora-v3').backend,
    'companionsLora': expand_model_companions(['qwen3-asr-1.7b-ja-anime-lora-v3']),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.pkgs.some((p) => /tokenizers==0\.22\.2/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /transformers>=5\.13\.0,<6/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /huggingface-hub>=1\.5\.0,<2\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /peft>=0\.17/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /numpy>=1\.24\.0,<2\.5/.test(p)), j.pkgs.join(','));
        assert.ok(!j.pkgs.some((p) => /qwen-asr/.test(p)), j.pkgs.join(','));
        assert.strictEqual(j.hub06, 'Qwen/Qwen3-ASR-0.6B-hf');
        assert.strictEqual(j.hubAlign, 'Qwen/Qwen3-ForcedAligner-0.6B-hf');
        assert.strictEqual(j.hubLora, 'hhim8826/qwen3-asr-lora-ja-anime-v3');
        assert.strictEqual(j.hubBase, 'Qwen/Qwen3-ASR-1.7B-hf');
        assert.strictEqual(j.loraBackend, 'qwen3-asr-lora');
        assert.deepStrictEqual(j.companionsLora, [
            'qwen3-asr-1.7b-ja-anime-lora-v3',
            'qwen3-asr-1.7b',
        ]);
    });

    it('qwen3_hf_lora adapter layout detection', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from transub_engine.asr.qwen3_hf_lora import looks_like_lora_adapter, read_adapter_base_hub
with tempfile.TemporaryDirectory() as td:
    root = Path(td) / 'lora'
    root.mkdir()
    (root / 'adapter_config.json').write_text(
        '{"base_model_name_or_path":"Qwen/Qwen3-ASR-1.7B-hf"}',
        encoding='utf-8',
    )
    (root / 'adapter_model.safetensors').write_bytes(b'x' * 2048)
    print(json.dumps({
        'is_lora': looks_like_lora_adapter(root),
        'base': read_adapter_base_hub(root),
        'empty': looks_like_lora_adapter(Path(td) / 'missing'),
    }))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.is_lora, true);
        assert.strictEqual(j.base, 'Qwen/Qwen3-ASR-1.7B-hf');
        assert.strictEqual(j.empty, false);
    });

    it('qwen3_hf_convert layout detection', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from transub_engine.asr.qwen3_hf_convert import (
    looks_like_hf_layout,
    looks_like_legacy_qwen_layout,
    CONVERT_AFTER_DOWNLOAD_IDS,
)
with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    legacy = root / 'legacy'
    hf = root / 'hf'
    legacy.mkdir(); hf.mkdir()
    (legacy / 'config.json').write_text('{}', encoding='utf-8')
    (legacy / 'merges.txt').write_text('a', encoding='utf-8')
    (hf / 'config.json').write_text('{}', encoding='utf-8')
    (hf / 'tokenizer.json').write_text('{}', encoding='utf-8')
    hybrid = root / 'hybrid'
    hybrid.mkdir()
    (hybrid / 'config.json').write_text('{}', encoding='utf-8')
    (hybrid / 'tokenizer.json').write_text('{}', encoding='utf-8')
    (hybrid / 'chat_template.json').write_text('{"chat_template":"{% if add_generation_prompt %}x{% endif %}"}', encoding='utf-8')
    print(json.dumps({
        'legacy_is_legacy': looks_like_legacy_qwen_layout(legacy),
        'legacy_is_hf': looks_like_hf_layout(legacy),
        'hf_is_hf': looks_like_hf_layout(hf),
        'hf_is_legacy': looks_like_legacy_qwen_layout(hf),
        'hybrid_is_hf': looks_like_hf_layout(hybrid),
        'hybrid_is_legacy': looks_like_legacy_qwen_layout(hybrid),
        'neo': 'qwen3-asr-1.7b-ja' in CONVERT_AFTER_DOWNLOAD_IDS,
    }))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.legacy_is_legacy, true);
        assert.strictEqual(j.legacy_is_hf, false);
        assert.strictEqual(j.hf_is_hf, true);
        assert.strictEqual(j.hf_is_legacy, false);
        assert.strictEqual(j.hybrid_is_hf, false);
        assert.strictEqual(j.hybrid_is_legacy, true);
        assert.strictEqual(j.neo, false);
    });

    it('qwen3 is_model_installed treats local weights as installed without tokenizer.json', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from transub_engine.asr.qwen3_hf_convert import _weight_present
from transub_engine.download import _weight_markers_for, is_model_installed, model_local_path
from transub_engine.models_catalog import get_spec

spec = get_spec('qwen3-asr-1.7b-ja-anime-galgame')
markers = _weight_markers_for(spec)
with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    (root / 'config.json').write_text('{"model_type":"qwen3_asr"}', encoding='utf-8')
    cfg_only = _weight_present(root)
    (root / 'model.safetensors.index.json').write_text('{"weight_map":{}}', encoding='utf-8')
    (root / 'model-00001-of-00006.safetensors').write_bytes(b'x' * 2048)
    with_weights = _weight_present(root)
local = model_local_path('qwen3-asr-1.7b-ja-anime-galgame')
print(json.dumps({
    'cfg_only': cfg_only,
    'with_weights': with_weights,
    'markers_have_config': 'config.json' in markers,
    'local_installed': is_model_installed('qwen3-asr-1.7b-ja-anime-galgame'),
    'has_config': (local / 'config.json').is_file() if local.is_dir() else False,
    'has_tokenizer': (local / 'tokenizer.json').is_file() if local.is_dir() else False,
    'has_weights': _weight_present(local) if local.is_dir() else False,
}))
`);
        const j = parsePyJson(out);
        assert.strictEqual(j.cfg_only, false);
        assert.strictEqual(j.with_weights, true);
        assert.strictEqual(j.markers_have_config, false);
        if (j.has_weights && j.has_config) {
            assert.strictEqual(j.local_installed, true);
        }
    });

    it('apply_transcription_inputs works with legacy chat_template.json', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from pathlib import Path
import numpy as np
from transub_engine.asr.qwen3_hf_generate import apply_transcription_inputs

root = Path(r'F:/Transub3/transub-engine/models/asr/qwen3-asr-1.7b-ja-anime-galgame')
if not (root / 'tokenizer.json').is_file():
    print(json.dumps({'skip': True}))
else:
    from transformers import AutoProcessor
    proc = AutoProcessor.from_pretrained(str(root))
    audio = np.zeros(16000, dtype=np.float32)
    inputs = apply_transcription_inputs(proc, [audio], 'Japanese')
    ids = inputs['input_ids']
    decoded = proc.tokenizer.decode(ids[0][-12:])
    print(json.dumps({
        'skip': False,
        'has_features': 'input_features' in inputs,
        'tail': decoded,
        'ok': 'language Japanese' in decoded and '<asr_text>' in decoded,
    }))
`);
        const j = parsePyJson(out);
        if (j.skip) return;
        assert.strictEqual(j.has_features, true);
        assert.strictEqual(j.ok, true, j.tail);
    });

    it('resolve_island_batch_size modes and VRAM tiers', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

def r(mode, free, total, model, device='cuda'):
    with patch.object(qwen3_asr, '_probe_gpu_free_mib', return_value=(free, total)):
        with patch.object(qwen3_asr, '_asr_runs_on_cuda', return_value=(device != 'cpu')):
            return qwen3_asr.resolve_island_batch_size(
                model,
                batch_mode=mode,
                device=device,
            )

print(json.dumps({
    'norm_auto': qwen3_asr.normalize_qwen_batch_mode('fast'),
    'cons_17': r('conservative', 16000, 16000, 'qwen3-asr-1.7b-ja'),
    'auto_17_low': r('auto', 5000, 12000, 'qwen3-asr-1.7b-ja'),
    'auto_17_high': r('auto', 15000, 16000, 'qwen3-asr-1.7b-ja'),
    'agg_06': r('aggressive', 14000, 16000, 'qwen3-asr-0.6b'),
    'agg_17_post_load': r('aggressive', 7000, 12288, 'qwen3-asr-1.7b-ja-anime-galgame'),
    'agg_17_16g': r('aggressive', 9000, 16384, 'qwen3-asr-1.7b-ja-anime-galgame'),
    'cpu_06': r('auto', 16000, 16000, 'qwen3-asr-0.6b', device='cpu'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.norm_auto, 'aggressive');
        assert.strictEqual(j.cons_17, 8);
        assert.strictEqual(j.auto_17_low, 6);
        assert.strictEqual(j.auto_17_high, 16);
        assert.strictEqual(j.agg_06, 32);
        assert.strictEqual(j.agg_17_post_load, 12);
        assert.strictEqual(j.agg_17_16g, 16);
        assert.ok(j.cpu_06 <= 2, `cpu batch ${j.cpu_06}`);
    });

    it('resolve_island_batch_size honors perf speed and OOM session cap', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

qwen3_asr.clear_island_batch_oom_caps()
with patch.object(qwen3_asr, '_probe_gpu_free_mib', return_value=(16000, 16384)):
    with patch.object(qwen3_asr, '_asr_runs_on_cuda', return_value=True):
        speed = qwen3_asr.resolve_island_batch_size(
            'qwen3-asr-1.7b-ja',
            batch_mode='aggressive',
            perf_profile='speed',
            device='cuda',
        )
        qwen3_asr.note_island_batch_oom_cap(
            'qwen3-asr-1.7b-ja',
            'cuda',
            'conservative',
            12,
        )
        capped = qwen3_asr.resolve_island_batch_size(
            'qwen3-asr-1.7b-ja',
            batch_mode='aggressive',
            perf_profile='speed',
            device='cuda',
        )
print(json.dumps({'speed': speed, 'capped': capped}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.speed, 8);
        assert.strictEqual(j.capped, 6);
    });

    it('resolve_island_batch_size prefers job VRAM hints over probe', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

with patch.object(qwen3_asr, '_probe_gpu_free_mib', return_value=(3000, 8192)):
    n = qwen3_asr.resolve_island_batch_size(
        'qwen3-asr-1.7b-ja-anime-galgame',
        batch_mode='aggressive',
        device='cuda',
        job_gpu_free_mib=15000,
        job_gpu_total_mib=16384,
    )
print(json.dumps({'n': n}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 16);
    });

    it('Qwen island path batches in-memory PCM (no per-frame ffmpeg)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
import numpy as np
from transub_engine.asr import qwen3_asr

calls = []

def fake_generate(bundle, audios, language, **kwargs):
    n = len(audios)
    first = audios[0] if audios else None
    kind = 'tuple' if isinstance(first, tuple) else type(first).__name__
    calls.append({'n': n, 'kind': kind})
    class R:
        text = 'あ'
        time_stamps = None
    return [R() for _ in range(n)]

audio = np.zeros(16000 * 20, dtype=np.float32)
intervals = [(0.0, 4.0), (5.0, 9.0), (10.0, 14.0), (15.0, 19.0)]
trim_calls = []

def _boom_trim(*_a, **_k):
    trim_calls.append(1)
    raise RuntimeError('ffmpeg trim should not run when PCM is available')

from transub_engine.vad import ten_vad_seg
with patch.object(qwen3_asr, 'generate_transcriptions', side_effect=fake_generate):
    with patch.object(ten_vad_seg, 'ten_vad_available', return_value=True):
        with patch.object(ten_vad_seg, 'collect_ten_vad_intervals_with_audio', return_value=(intervals, audio)):
            with patch('transub_engine.audio.preprocess.trim_media_window', side_effect=_boom_trim):
                cues = qwen3_asr._qwen_island_vad_transcribe(
                    media_path='clip.mp4',
                    model=object(),
                    lang='Japanese',
                    duration_s=20.0,
                    vad_backend='ten',
                    asr_model='qwen3-asr-1.7b-ja-anime-galgame',
                    on_progress=None,
                    on_cue=None,
                    should_cancel=None,
                )

print(json.dumps({
    'calls': calls,
    'cue_n': len(cues or []),
    'trim': len(trim_calls),
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
    });

    it('Qwen transcribe list splits CUDA OOM batches', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from types import SimpleNamespace
from transub_engine.asr.qwen3_hf_generate import generate_transcriptions, is_cuda_oom

sizes = []

class FakeTensor:
    def __init__(self, rows, cols):
        self.shape = (rows, cols)
    def __getitem__(self, idx):
        rows = self.shape[0]
        if isinstance(idx, tuple) and len(idx) == 2:
            return FakeTensor(rows, 3)
        return self

class FakeInputs(dict):
    def to(self, *a, **k):
        return self

def apply_transcription_request(audio=None, language=None, **kwargs):
    items = audio if isinstance(audio, list) else [audio]
    n = len(items)
    sizes.append(n)
    return FakeInputs(input_ids=FakeTensor(n, 8))

def decode(ids, return_format=None):
    n = ids.shape[0]
    if return_format == 'parsed':
        return [{'transcription': 'ok', 'language': 'Japanese'} for _ in range(n)]
    return ['ok'] * n

def generate(**kwargs):
    n = kwargs['input_ids'].shape[0]
    if n > 2:
        raise RuntimeError('CUDA out of memory')
    return FakeTensor(n, 11)

bundle = SimpleNamespace(
    processor=SimpleNamespace(
        apply_transcription_request=apply_transcription_request,
        decode=decode,
        batch_decode=lambda *a, **k: ['ok'],
    ),
    model=SimpleNamespace(generate=generate, device='cpu', dtype=None),
    dtype=None,
    has_aligner=False,
)
out = generate_transcriptions(bundle, ['a.wav', 'b.wav', 'c.wav', 'd.wav'], 'Japanese', max_new_tokens=32)
print(json.dumps({
    'sizes': sizes,
    'n': len(out),
    'oom': is_cuda_oom(RuntimeError('CUDA out of memory')),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.oom, true);
        assert.strictEqual(j.n, 4);
        assert.ok(j.sizes[0] === 4, JSON.stringify(j.sizes));
        assert.ok(j.sizes.slice(1).every((n) => n <= 2), JSON.stringify(j.sizes));
    });

    it('Qwen windowed path fail-fasts on CUDA OOM and includes the cause', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

calls = {'n': 0}

def boom_generate(bundle, audios, language, **kwargs):
    calls['n'] += 1
    raise RuntimeError('CUDA out of memory')

err = ''
try:
    with patch.object(qwen3_asr, 'generate_transcriptions', side_effect=boom_generate):
        with patch('transub_engine.audio.preprocess.stage_media_for_long_asr', return_value='staged.wav'):
            with patch('transub_engine.audio.preprocess.trim_media_window', return_value='w.wav'):
                with patch('transub_engine.audio.preprocess.touch_path'):
                    qwen3_asr._qwen_windowed_transcribe(
                        media_path='clip.mp4',
                        model=object(),
                        lang='Japanese',
                        duration_s=8000.0,
                        want_ts=False,
                        on_progress=None,
                        on_cue=None,
                        should_cancel=None,
                    )
except Exception as e:
    err = str(e)
print(json.dumps({
    'calls': calls['n'],
    'windows': len(qwen3_asr._windows(8000.0)),
    'err': err,
    'systemic': qwen3_asr._is_systemic_qwen_error(RuntimeError('CUDA out of memory')),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.windows >= 80, `windows ${j.windows}`);
        assert.ok(j.calls <= 2, `should abort on first OOM, calls=${j.calls}`);
        assert.ok(/failed \d+\/\d+ windows/i.test(j.err), j.err);
        assert.ok(/out of memory|显存不足/i.test(j.err), j.err);
        assert.strictEqual(j.systemic, true);
    });

    it('Qwen island path raises instead of windowed fallback when inference fails', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
import numpy as np
from transub_engine.asr import qwen3_asr
from transub_engine.vad import ten_vad_seg

calls = {'n': 0}

def boom_generate(bundle, audios, language, **kwargs):
    calls['n'] += 1
    raise RuntimeError('CUDA out of memory')

audio = np.zeros(16000 * 20, dtype=np.float32)
intervals = [(0.0, 4.0), (5.0, 9.0), (10.0, 14.0), (15.0, 19.0)]
err = ''
cues = 'not-run'
try:
    with patch.object(qwen3_asr, 'generate_transcriptions', side_effect=boom_generate):
        with patch.object(ten_vad_seg, 'ten_vad_available', return_value=True):
            with patch.object(ten_vad_seg, 'collect_ten_vad_intervals_with_audio', return_value=(intervals, audio)):
                cues = qwen3_asr._qwen_island_vad_transcribe(
                    media_path='clip.mp4',
                    model=object(),
                    lang='Japanese',
                    duration_s=20.0,
                    vad_backend='ten',
                    asr_model='qwen3-asr-1.7b-ja-anime-galgame',
                    on_progress=None,
                    on_cue=None,
                    should_cancel=None,
                )
except Exception as e:
    err = str(e)
print(json.dumps({'calls': calls['n'], 'err': err, 'cues': cues if isinstance(cues, str) else None}))
`);
        const j = JSON.parse(out);
        assert.ok(j.calls >= 1 && j.calls <= 8, `calls=${j.calls}`);
        assert.ok(/failed \d+\/\d+ frames/i.test(j.err), j.err);
        assert.ok(/out of memory|显存不足/i.test(j.err), j.err);
    });

    it('pip extras keep numpy numba constraint helper', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import NUMPY_NUMBA_PIN, _with_numpy_numba_constraint, _requirement_satisfied
numpy_ok = _requirement_satisfied(NUMPY_NUMBA_PIN)
with_tf = _with_numpy_numba_constraint(['transformers>=5.13.0,<6'])
print(json.dumps({
    'pin': NUMPY_NUMBA_PIN,
    'numpyOk': numpy_ok,
    'with': with_tf,
    'keep': _with_numpy_numba_constraint(['numpy>=1.24.0,<2.5', 'torch']),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.pin, 'numpy>=1.24.0,<2.5');
        if (j.numpyOk) {
            assert.deepStrictEqual(j.with, ['transformers>=5.13.0,<6']);
        } else {
            assert.ok(j.with.includes('numpy>=1.24.0,<2.5'));
            assert.strictEqual(j.with.filter((p) => p.startsWith('numpy')).length, 1);
        }
        assert.deepStrictEqual(j.keep, ['numpy>=1.24.0,<2.5', 'torch']);
    });

    it('index pip keeps numpy and tokenizers pins even when already listed separately', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import (
    NUMPY_NUMBA_PIN,
    TOKENIZERS_PIN,
    _pip_keep_shared_pins,
    _with_tokenizers_pin_constraint,
)
keep = _pip_keep_shared_pins(['transformers>=5.13.0,<6', 'huggingface-hub>=1.5.0,<2'])
keep_dup = _pip_keep_shared_pins(['transformers>=5.13.0,<6', TOKENIZERS_PIN, NUMPY_NUMBA_PIN])
print(json.dumps({
    'keep': keep,
    'keepDup': keep_dup,
    'tok': TOKENIZERS_PIN,
    'np': NUMPY_NUMBA_PIN,
    'withTokOnTf': _with_tokenizers_pin_constraint(['transformers>=5.13.0,<6']),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.keep.includes(j.np), j.keep);
        assert.ok(j.keep.includes(j.tok), j.keep);
        assert.deepStrictEqual(j.keepDup, []);
    });
});
