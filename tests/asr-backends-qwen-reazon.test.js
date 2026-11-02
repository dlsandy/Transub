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
    'firered2_backend': get_spec('firered-asr2-aed').backend,
    'firered2_hub': get_spec('firered-asr2-aed').hub_id,
    'firered2_langs': get_spec('firered-asr2-aed').languages,
    'r_resolve': resolve_asr_backend('reazonspeech-k2'),
    'q_resolve': resolve_asr_backend('qwen3-asr-0.6b'),
    'q_gal_resolve': resolve_asr_backend('qwen3-asr-1.7b-ja-anime-galgame'),
    'w_resolve': resolve_asr_backend('anime-whisper'),
    'pk_resolve': resolve_asr_backend('parakeet-tdt-0.6b-v2'),
    'pk_hub_resolve': resolve_asr_backend('nvidia-parakeet-custom'),
    'cohere_resolve': resolve_asr_backend('cohere-transcribe-03-2026'),
    'cohere_hub_resolve': resolve_asr_backend('cohere-asr-custom'),
    'firered2_resolve': resolve_asr_backend('firered-asr2-aed'),
    'firered2_hub_resolve': resolve_asr_backend('fireredasr2-custom'),
    'companions': expand_model_companions(['qwen3-asr-0.6b']),
    'companions_gal': expand_model_companions(['qwen3-asr-1.7b-ja-anime-galgame']),
    'extras_r': extras_for_model_ids(['reazonspeech-k2']),
    'extras_q': extras_for_model_ids(['qwen3-asr-0.6b']),
    'extras_gal': extras_for_model_ids(['qwen3-asr-1.7b-ja-anime-galgame']),
    'extras_pk': extras_for_model_ids(['parakeet-tdt-ctc-0.6b-ja', 'parakeet-tdt-0.6b-v3']),
    'extras_cohere': extras_for_model_ids(['cohere-transcribe-03-2026']),
    'extras_firered2': extras_for_model_ids(['firered-asr2-aed']),
    'extras_firered_vad': extras_for_model_ids(['firered-vad']),
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
        assert.ok(!j.qwen_ids.includes('qwen3-asr-1.7b-ja-anime-lora-v3'), j.qwen_ids);
        assert.ok(j.qwen_ids.includes('qwen3-asr-1.7b'), j.qwen_ids);
        assert.strictEqual(j.align_backend, 'qwen3-align');
        assert.strictEqual(j.pk_ja_backend, 'parakeet');
        assert.strictEqual(j.pk_v2_backend, 'parakeet');
        assert.strictEqual(j.pk_v3_backend, 'parakeet');
        assert.strictEqual(j.cohere_backend, 'cohere-asr');
        assert.ok(j.cohere_langs.includes('en'));
        assert.ok(j.cohere_langs.includes('ja'));
        assert.strictEqual(j.firered2_backend, 'firered-asr2');
        assert.strictEqual(j.firered2_hub, 'FireRedTeam/FireRedASR2-AED');
        assert.ok(j.firered2_langs.includes('zh'));
        assert.ok(j.firered2_langs.includes('en'));
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
        assert.strictEqual(j.firered2_resolve, 'firered-asr2');
        assert.strictEqual(j.firered2_hub_resolve, 'firered-asr2');
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
        assert.ok(j.extras_firered2.includes('asr-firered-asr2'));
        assert.ok(!j.extras_firered2.includes('vad-firered'));
        assert.ok(j.extras_firered_vad.includes('vad-firered'));
        assert.ok(!j.extras_firered_vad.includes('asr-firered-asr2'));
    });

    it('asr-firered-asr2 lists fireredasr2s + kaldi stack', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.runtime_extras import EXTRA_PACKAGES
pkgs = list(EXTRA_PACKAGES.get('asr-firered-asr2') or ())
print(json.dumps({'pkgs': pkgs}))
`);
        const j = JSON.parse(out);
        assert.ok(j.pkgs.some((p) => /fireredasr2s/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /kaldiio/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /kaldi-native-fbank|kaldi_native_fbank/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /^torch$/.test(p) || p === 'torch'), j.pkgs.join(','));
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
        assert.ok(j.pkgs.some((p) => /transformers>=5\.6\.0,<(?:6|5\.16)/.test(p)), j.pkgs.join(','));
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
    'hubRetiredLora': get_spec('qwen3-asr-1.7b-ja-anime-lora-v3').hub_id,
    'hubBase': get_spec('qwen3-asr-1.7b').hub_id,
    'retiredLoraBackend': get_spec('qwen3-asr-1.7b-ja-anime-lora-v3').backend,
    'companionsRetiredLora': expand_model_companions(['qwen3-asr-1.7b-ja-anime-lora-v3']),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.pkgs.some((p) => /tokenizers==0\.22\.2/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /transformers>=5\.13\.0,<5\.16/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /huggingface-hub>=1\.5\.0,<2\.0/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /peft>=0\.17/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /numpy>=1\.24\.0,<2\.5/.test(p)), j.pkgs.join(','));
        assert.ok(j.pkgs.some((p) => /sympy>=1\.13/.test(p)), j.pkgs.join(','));
        assert.ok(!j.pkgs.some((p) => /qwen-asr/.test(p)), j.pkgs.join(','));
        assert.strictEqual(j.hub06, 'Qwen/Qwen3-ASR-0.6B-hf');
        assert.strictEqual(j.hubAlign, 'Qwen/Qwen3-ForcedAligner-0.6B-hf');
        assert.strictEqual(j.hubRetiredLora, 'jaykwok/Qwen3-ASR-1.7B-JA-Anime-Galgame-hf');
        assert.strictEqual(j.hubBase, 'Qwen/Qwen3-ASR-1.7B-hf');
        assert.strictEqual(j.retiredLoraBackend, 'qwen3-asr');
        assert.deepStrictEqual(j.companionsRetiredLora, [
            'qwen3-asr-1.7b-ja-anime-galgame',
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
    rewrite_thinker_weight_key,
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
        'proj': rewrite_thinker_weight_key('thinker.audio_tower.proj1.weight', token_classification=True),
        'lm': rewrite_thinker_weight_key('thinker.model.layers.0.input_layernorm.weight', token_classification=True),
        'score': rewrite_thinker_weight_key('thinker.lm_head.weight', token_classification=True),
        'asr_lm': rewrite_thinker_weight_key('thinker.lm_head.weight', token_classification=False),
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
        assert.strictEqual(j.proj, 'model.multi_modal_projector.linear_1.weight');
        assert.strictEqual(j.lm, 'model.language_model.layers.0.input_layernorm.weight');
        assert.strictEqual(j.score, 'score.weight');
        assert.strictEqual(j.asr_lm, 'lm_head.weight');
    });

    it('ForcedAligner Whisper preprocessor is repaired to Qwen3ASR', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from transub_engine.asr.qwen3_hf_convert import (
    needs_forced_aligner_preprocessor_repair,
    install_forced_aligner_preprocessor,
    ensure_qwen3_hf_checkpoint,
)
with tempfile.TemporaryDirectory() as td:
    root = Path(td) / 'qwen3-forced-aligner-0.6b'
    root.mkdir()
    (root / 'config.json').write_text('{"architectures":["Qwen3ASRForTokenClassification"]}', encoding='utf-8')
    (root / 'tokenizer.json').write_text('{}', encoding='utf-8')
    (root / 'chat_template.jinja').write_text('x', encoding='utf-8')
    (root / 'model.safetensors').write_bytes(b'x' * 2048)
    (root / 'preprocessor_config.json').write_text(json.dumps({
        'feature_extractor_type': 'WhisperFeatureExtractor',
        'feature_size': 128,
        'hop_length': 160,
        'n_fft': 400,
        'processor_class': 'Qwen3ASRProcessor',
    }), encoding='utf-8')
    before = needs_forced_aligner_preprocessor_repair(root)
    repaired = ensure_qwen3_hf_checkpoint(root, model_id='qwen3-forced-aligner-0.6b')
    after = needs_forced_aligner_preprocessor_repair(root)
    data = json.loads((root / 'preprocessor_config.json').read_text(encoding='utf-8'))
    print(json.dumps({
        'before': before,
        'after': after,
        'ok': repaired.get('ok'),
        'converted': bool(repaired.get('converted')),
        'fet': data.get('feature_extractor_type'),
        'n_window': data.get('n_window'),
        'install_skip': install_forced_aligner_preprocessor(root).get('skipped'),
    }))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.before, true);
        assert.strictEqual(j.after, false);
        assert.strictEqual(j.ok, true);
        assert.strictEqual(j.converted, true);
        assert.strictEqual(j.fet, 'Qwen3ASRFeatureExtractor');
        assert.strictEqual(j.n_window, 50);
        assert.strictEqual(j.install_skip, true);
    });

    it('ForcedAligner stamps own cue timing (clamped to island, not rescaled)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from types import SimpleNamespace
from transub_engine.asr.qwen3_asr import _result_to_cues_aligned
class R:
    text = 'こんにちは。元気ですか。'
    time_stamps = [
        SimpleNamespace(text='こん', start_time=0.05, end_time=0.15),
        SimpleNamespace(text='にちは', start_time=0.15, end_time=0.35),
        SimpleNamespace(text='元気', start_time=0.40, end_time=0.55),
        SimpleNamespace(text='ですか', start_time=0.55, end_time=0.80),
    ]
cues = _result_to_cues_aligned(R(), offset_s=10.0, span_s=3.0)
span = max(float(c['end']) for c in cues) - min(float(c['start']) for c in cues)
print(json.dumps({
    'n': len(cues),
    'span': round(span, 2),
    'start0': round(float(cues[0]['start']), 2),
    'end_last': round(float(cues[-1]['end']), 2),
    'words': sum(len(c.get('words') or []) for c in cues),
    'text_chars': sum(len(str(c.get('text') or '')) for c in cues),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.span <= 1.0, `expected acoustic span (~0.75s), got ${j.span}`);
        assert.ok(Math.abs(j.start0 - 10.05) < 0.05, `start0=${j.start0}`);
        assert.ok(Math.abs(j.end_last - 10.80) < 0.05, `end_last=${j.end_last}`);
        assert.ok(j.words >= 1, 'expected word metadata from ForcedAligner');
        assert.ok(j.text_chars >= 8, 'expected full ASR text on cues');
    });

    it('pcm_speech_intervals skips mid-island silence for cue paint', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
import numpy as np
from transub_engine.asr.whisper_fw import pcm_speech_intervals, paint_text_onto_speech_spans
sr = 16000
# 0.5s silence + 0.8s tone + 0.6s silence + 0.7s tone + 0.4s silence
parts = [
    np.zeros(int(0.5 * sr), dtype=np.float32),
    (0.2 * np.sin(2 * np.pi * 220 * np.arange(int(0.8 * sr)) / sr)).astype(np.float32),
    np.zeros(int(0.6 * sr), dtype=np.float32),
    (0.2 * np.sin(2 * np.pi * 330 * np.arange(int(0.7 * sr)) / sr)).astype(np.float32),
    np.zeros(int(0.4 * sr), dtype=np.float32),
]
pcm = np.concatenate(parts)
spans = pcm_speech_intervals(pcm, sr, offset_s=10.0)
cues = paint_text_onto_speech_spans(
    'こんにちは。元気ですか。',
    island_start=10.0,
    island_end=10.0 + len(pcm) / sr,
    speech_spans=spans,
)
print(json.dumps({
    'n_spans': len(spans),
    'span0': [round(spans[0][0], 2), round(spans[0][1], 2)] if spans else None,
    'n_cues': len(cues),
    'cue0_start': round(float(cues[0]['start']), 2) if cues else None,
    'gap_ok': bool(spans) and spans[0][0] >= 10.35,
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.n_spans >= 2, `expected >=2 speech spans, got ${j.n_spans}`);
        assert.ok(j.gap_ok, 'first speech span should skip leading silence');
        assert.ok(j.n_cues >= 1, 'expected painted cues');
        assert.ok(j.cue0_start >= 10.35, `cue0 should not start in pad silence, got ${j.cue0_start}`);
    });

    it('Qwen Demucs full path keeps preserve_acoustic_ends and timingMedia hook', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
import inspect
from transub_engine.asr.qwen3_island import _qwen_island_vad_transcribe
from transub_engine.asr.qwen3_cues import _distribute_text_cues
from transub_engine.asr.qwen3_asr import qwen3_asr_transcribe
from transub_engine.asr import run_asr
sig_island = inspect.signature(_qwen_island_vad_transcribe)
sig_qwen = inspect.signature(qwen3_asr_transcribe)
sig_run = inspect.signature(run_asr)
# Mix-like fat span vs shorter "vocal residual" — distribute must keep mix end.
cues = _distribute_text_cues(
    '\u6628\u65e5\u30c6\u30ec\u30d3\u3067\u3084\u3063\u3066\u305f\u304b\u3089\u4f5c\u3063\u3066\u307f\u305f\u306e\u3002',
    start=5.56,
    end=8.53,
    speech_spans=[(5.59, 7.21), (7.39, 7.93)],
)
print(json.dumps({
    'island_timing': 'timing_media_path' in sig_island.parameters,
    'qwen_timing': 'timing_media_path' in sig_qwen.parameters,
    'run_timing': 'timing_media_path' in sig_run.parameters,
    'c0_end': round(float(cues[0]['end']), 3) if cues else None,
    'c0_dur': round(float(cues[0]['end']) - float(cues[0]['start']), 3) if cues else None,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.island_timing, true);
        assert.strictEqual(j.qwen_timing, true);
        assert.strictEqual(j.run_timing, true);
        assert.ok(j.c0_end >= 7.15, `distribute must keep mix PCM end, end=${j.c0_end}`);
        assert.ok(j.c0_dur >= 1.5, `preserve_acoustic_ends must not soft_cap, dur=${j.c0_dur}`);
    });

    it('paint caps short line on fat RMS span (DLDSS-559 cue3 shape)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import paint_text_onto_speech_spans, ensure_readable_cue_timings
spans = [(5.59, 7.21), (7.39, 7.93)]
cues = paint_text_onto_speech_spans(
    '昨日テレビでやってたから作ってみたの。',
    island_start=5.56,
    island_end=8.53,
    speech_spans=spans,
)
# Default (anime-whisper) path: clamp catches a pre-baked overlong short line
raw = [
    {'start': 5.576, 'end': 7.946, 'text': '昨日テレビで'},
    {'start': 8.246, 'end': 9.328, 'text': 'やってたから作ってみたの。'},
]
clamped = ensure_readable_cue_timings(raw, media_end_s=12.0)
# Qwen TEN/FireRed: acoustic preserve must NOT shrink measured ends
acoustic = paint_text_onto_speech_spans(
    '昨日テレビでやってたから作ってみたの。',
    island_start=5.56,
    island_end=8.53,
    speech_spans=spans,
    preserve_acoustic_ends=True,
)
kept = ensure_readable_cue_timings(raw, media_end_s=12.0, stretch_to_reading_rate=False)
print(json.dumps({
    'n': len(cues),
    'c0_dur': round(float(cues[0]['end']) - float(cues[0]['start']), 3),
    'c1_start': round(float(cues[1]['start']), 3) if len(cues) > 1 else None,
    'clamp0_dur': round(float(clamped[0]['end']) - float(clamped[0]['start']), 3),
    'clamp0_end': round(float(clamped[0]['end']), 3),
    'acoustic0_end': round(float(acoustic[0]['end']), 3) if acoustic else None,
    'acoustic0_dur': round(float(acoustic[0]['end']) - float(acoustic[0]['start']), 3) if acoustic else None,
    'kept0_end': round(float(kept[0]['end']), 3),
    'kept0_dur': round(float(kept[0]['end']) - float(kept[0]['start']), 3),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.n >= 2, `expected split cues, got ${j.n}`);
        assert.ok(j.c0_dur < 1.15, `昨日 must not own 1.6s+ span, dur=${j.c0_dur}`);
        assert.ok(j.c1_start < 6.6, `作ってみた should follow, start=${j.c1_start}`);
        assert.ok(j.clamp0_dur < 1.4, `ensure_readable must shrink 2.37s short line, dur=${j.clamp0_dur}`);
        assert.ok(j.clamp0_end < 7.2, `clamped end must leave room before silence, end=${j.clamp0_end}`);
        assert.ok(j.acoustic0_end >= 7.15, `Qwen paint must keep PCM end ~7.21, end=${j.acoustic0_end}`);
        assert.ok(j.acoustic0_dur >= 1.5, `Qwen paint must not soft_cap fat span, dur=${j.acoustic0_dur}`);
        assert.ok(j.kept0_end >= 7.9, `stretch=False must not shrink 2.37s line, end=${j.kept0_end}`);
        assert.ok(j.kept0_dur >= 2.3, `stretch=False must keep acoustic dur, dur=${j.kept0_dur}`);
    });

    it('ensure_readable does not mid-lexeme shred soft-AV turns (FNS-258)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.cue_retime import ensure_readable_cue_timings

keep = [
    (31.66, 34.64, 'サイさんまた行ってくるね'),
    (34.66, 37.64, '昨日も遅かったのに元気だね'),
    (37.66, 41.076, '今日はミカちゃんたちと会うんだっけ? 違う'),
    (307.58, 310.58, 'なんか美味しいもの食べたい'),
    (586.786, 589.24, '増えてるか分かんないけど'),
    (116.593, 118.90, '悪いわけではないけれど'),
]
split = [
    (0.0, 3.0, 'お父さん、勉強教えられないじゃん。'),
    (5.0, 8.5, '昨日テレビでやってたから作ってみたの。'),
]
kept = []
for s, e, t in keep:
    out_c = ensure_readable_cue_timings(
        [{'start': s, 'end': e, 'text': t}],
        stretch_to_reading_rate=False,
    )
    kept.append({'n': len(out_c), 'text': out_c[0]['text'] if out_c else ''})
split_n = []
for s, e, t in split:
    out_c = ensure_readable_cue_timings(
        [{'start': s, 'end': e, 'text': t}],
        stretch_to_reading_rate=False,
    )
    split_n.append(len(out_c))
print(json.dumps({'kept': kept, 'split_n': split_n}))
`);
        const j = JSON.parse(out);
        for (const row of j.kept) {
            assert.strictEqual(row.n, 1, `must keep one cue: ${row.text}`);
        }
        assert.ok(j.split_n[0] >= 2, 'comma glue must still split');
        assert.ok(j.split_n[1] >= 2, 'から clause glue must still split');
    });

    it('paint does not stretch one short line across all speech spans', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import paint_text_onto_speech_spans
spans = [(19.25, 19.61), (19.82, 21.05), (21.56, 21.95)]
cues = paint_text_onto_speech_spans(
    'また作るね。',
    island_start=19.25,
    island_end=22.03,
    speech_spans=spans,
)
print(json.dumps({
    'n': len(cues),
    'start': round(float(cues[0]['start']), 3),
    'end': round(float(cues[0]['end']), 3),
    'dur': round(float(cues[0]['end']) - float(cues[0]['start']), 3),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 1);
        assert.ok(j.dur < 1.5, `must not span whole island, dur=${j.dur}`);
        assert.ok(j.start >= 19.7, `should pick longer middle span, start=${j.start}`);
    });

    it('paint grows long JA line across consecutive spans (DLDSS-553 flash)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import paint_text_onto_speech_spans, stretch_undersized_cue_timings
# Soft-AV: first RMS blip ~0.56s then consecutive speech — long self-intro must
# cover speaking-rate need (~1.5s), not die at the first blip.
spans = [(353.64, 354.20), (354.30, 355.10), (355.20, 356.00)]
cues = paint_text_onto_speech_spans(
    '私が、社長の、白井と申します',
    island_start=353.0,
    island_end=358.0,
    speech_spans=spans,
    max_chars=40,
)
# Offline safety net: flash cue with orphan gap after must stretch.
raw = [
    {'start': 353.64, 'end': 354.54, 'text': '私が、社長の、白井と申します'},
    {'start': 358.64, 'end': 359.45, 'text': '私は副社長の神田といいます'},
]
stretched = stretch_undersized_cue_timings(raw)
print(json.dumps({
    'n': len(cues),
    'paint_dur': round(float(cues[0]['end']) - float(cues[0]['start']), 3),
    'stretch_dur': round(float(stretched[0]['end']) - float(stretched[0]['start']), 3),
    'stretch_end': round(float(stretched[0]['end']), 3),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.n >= 1);
        assert.ok(j.paint_dur >= 1.4, `paint must cover speaking-rate need, dur=${j.paint_dur}`);
        assert.ok(j.stretch_dur >= 1.4, `stretch must expand orphan flash, dur=${j.stretch_dur}`);
        assert.ok(j.stretch_end <= 358.6, `stretch must not spill into next cue, end=${j.stretch_end}`);
    });

    it('name-call loops estimate ~3s and stretch (DLDSS-553 風香×3)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import (
    paint_text_onto_speech_spans,
    extend_cues_to_speech_spans,
    _repeated_call_units,
)
text = '風香、風香、風香'
# Measured soft-AV peaks for three name calls (DLDSS-553 ~16.3–19.05).
spans = [(16.30, 16.90), (17.45, 17.90), (18.55, 19.05), (19.55, 20.00)]
painted = paint_text_onto_speech_spans(
    text,
    island_start=16.20,
    island_end=21.20,
    speech_spans=spans,
)
raw = [
    {'start': 16.32, 'end': 17.309, 'text': text},
    {'start': 21.27, 'end': 23.05, 'text': '風香、風香風香、迎えにいちゃうぞ'},
]
extended = extend_cues_to_speech_spans(raw, spans, media_end_s=30.0)
c0 = extended[0]
print(json.dumps({
    'units': list(_repeated_call_units(text)) if _repeated_call_units(text) else None,
    'paint_dur': round(float(painted[0]['end']) - float(painted[0]['start']), 3),
    'paint_end': round(float(painted[0]['end']), 3),
    'ext_dur': round(float(c0['end']) - float(c0['start']), 3),
    'ext_end': round(float(c0['end']), 3),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.units && j.units[0] === 3, `units=${JSON.stringify(j.units)}`);
        assert.ok(j.paint_dur >= 2.5 && j.paint_dur <= 3.5, `paint acoustic dur ~3s, got ${j.paint_dur}`);
        assert.ok(j.paint_end <= 19.2, `paint should stop after 3rd peak, end=${j.paint_end}`);
        assert.ok(j.ext_dur >= 2.5 && j.ext_dur <= 3.5, `extend acoustic dur ~3s, got ${j.ext_dur}`);
        assert.ok(j.ext_end <= 19.2, `extend must not swallow 4th peak / next cue, end=${j.ext_end}`);
    });

    it('ensures readable timings for overpacked Galgame TEN flash cues (JUR-854 shape)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import ensure_readable_cue_timings
# Mimic JUR-854: long JA text trapped in 50–150ms spans / near-dup starts
raw = [
    {'start': 64.554, 'end': 64.705, 'text': 'ちょっとなんか変だなって思って部屋の中を見渡してみたのね'},
    {'start': 71.088, 'end': 71.288, 'text': 'なんかオレンジだった気がするの？'},
    {'start': 71.448, 'end': 71.768, 'text': 'そうです'},
    {'start': 1633.606, 'end': 1633.669, 'text': 'その時の記憶はまだ暖かい'},
    {'start': 1633.669, 'end': 1633.727, 'text': 'でもあの景色だけは忘れない'},
    {'start': 1633.727, 'end': 1633.777, 'text': 'ずっと胸にしまって'},
]
fixed = ensure_readable_cue_timings(raw, media_end_s=1650.0)
overlaps = 0
cps_gt_40 = 0
long_short = 0
for i, c in enumerate(fixed):
    d = float(c['end']) - float(c['start'])
    n = len(str(c.get('text') or ''))
    if d > 0 and n / d > 40:
        cps_gt_40 += 1
    if d < 0.25 and n >= 8:
        long_short += 1
    if i + 1 < len(fixed) and float(c['end']) > float(fixed[i + 1]['start']) + 1e-3:
        overlaps += 1
first = next(c for c in fixed if abs(float(c['start']) - 64.554) < 0.01)
cluster = [c for c in fixed if 1633.5 <= float(c['start']) <= 1636.5]
print(json.dumps({
    'n': len(fixed),
    'cps_gt_40': cps_gt_40,
    'long_short': long_short,
    'overlaps': overlaps,
    'first_dur': round(float(first['end']) - float(first['start']), 3),
    'cluster_n': len(cluster),
    'cluster_min_dur': round(min(float(c['end']) - float(c['start']) for c in cluster), 3) if cluster else None,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.cps_gt_40, 0, `cps>40 remaining: ${j.cps_gt_40}`);
        assert.strictEqual(j.long_short, 0, 'long text must not stay under 0.25s');
        assert.strictEqual(j.overlaps, 0, 'repaired cues must not overlap');
        assert.ok(j.first_dur >= 1.5, `64s cue should expand, got ${j.first_dur}`);
        assert.ok(j.cluster_n >= 1 && j.cluster_n <= 3, `cluster_n=${j.cluster_n}`);
        assert.ok(j.cluster_min_dur >= 0.35, `cluster_min_dur=${j.cluster_min_dur}`);
    });

    it('ensure_readable keeps healthy acoustic ends (no speaking-rate shrink)', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import ensure_readable_cue_timings
# DLDSS-559 shape: measured soft-tail span ends must survive redistribute.
raw = [
    {'start': 10.716, 'end': 11.466, 'text': 'うん、どう、おいしい。'},
    {'start': 11.616, 'end': 13.026, 'text': 'ああ、よかった。'},
]
fixed = ensure_readable_cue_timings(raw, media_end_s=14.081)
print(json.dumps({
    'n': len(fixed),
    'c0': [round(float(fixed[0]['start']), 3), round(float(fixed[0]['end']), 3)],
    'c1': [round(float(fixed[1]['start']), 3), round(float(fixed[1]['end']), 3)],
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 2);
        assert.deepStrictEqual(j.c0, [10.716, 11.466]);
        assert.deepStrictEqual(j.c1, [11.616, 13.026]);
    });

    it('splits glued JA dialogue turns without 。！？', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import _split_ja_dialogue_turns, split_frame_text_to_cues
from transub_engine.quality import merge_short_neighbor_cues, _ja_looks_like_new_turn
cases = {
    'desuka_aa': _split_ja_dialogue_turns('いいんですかあーちょっといきなり来られた'),
    'masenka_iya': _split_ja_dialogue_turns('見てきませんかいやそう言われてもねそんな'),
    'kedo_a': _split_ja_dialogue_turns('お伺いしたんですけどあちょっと近所の迷惑で'),
    'cont': _split_ja_dialogue_turns('多いじゃないですかそれに効果がね'),
    # Recent soft-AV corpus (JUR-265 / SIRO-5746 / ROYD-349 / START-644)
    'yo_period_sou': _split_ja_dialogue_turns('最近人気出てきた、モデルの子だよね。 そう今度うちの雑誌の表紙と特集ページ'),
    'desu_oshima': _split_ja_dialogue_turns('仰る通りですお島さんプロのモデルなんて取り飽きてるわけ'),
    'masuyo_datte': _split_ja_dialogue_turns('どんどんしゃぶってますよだって気持ちよくていっぱいイッちゃうから…'),
    'kara_sousou': _split_ja_dialogue_turns('男がおれないと夫婦喧嘩不安ないですからそうそう'),
    'mashou_multi': _split_ja_dialogue_turns('それかちょっとホテル移動しましょうあわかりましたじゃあ行きましょうはいお願いします'),
    'desu_hai': _split_ja_dialogue_turns('こうちょっとドキドキしちゃったのはあのその時がきっかけかなって感じですはい'),
    'jan_ufufu': _split_ja_dialogue_turns('だってレイヤー君の周り綺麗なモデルさんたちいっぱいいるじゃんうふふ…これ'),
    'dayo_aitsu': _split_ja_dialogue_turns('だから俺さ言うたやましたくなかったんだよあいつを…'),
    'iijan_rep': _split_ja_dialogue_turns('いいじゃんいいじゃんやっぱ、ユートン違いな。'),
    'mid_un': _split_ja_dialogue_turns('僕の顔の味です自分で腰を使うんだよ…'),
    'desu_yone': _split_ja_dialogue_turns('このあとドラマの撮影入っちゃってるんですよね'),
    # Ellipsis + other-speaker turn (JUR-265)
    'ell_honto': _split_ja_dialogue_turns('そんなことないけど…ホント?'),
    'ell_ya': _split_ja_dialogue_turns('綺麗な上に可愛いし…やっ、びっびっくりしたな、そう言えよ。'),
    'ell_daijoubu': _split_ja_dialogue_turns('すみちゃう…大丈夫'),
    'ell_yoshi': _split_ja_dialogue_turns('ああ、そんな…よし、こちょこちょ朝、くすって'),
    'ell_sagashite': _split_ja_dialogue_turns('素人感…探してみますよろ'),
    'ell_waa': _split_ja_dialogue_turns('うん…わぁ、すごい'),
    'ell_nande': _split_ja_dialogue_turns('なんで…まだお昼ですよ。'),
    'ell_oo': _split_ja_dialogue_turns('おお…魅力に溢れてるよ本当ですか?'),
    'ell_same_q': _split_ja_dialogue_turns('あ、それってもしかして…ヌードですか?'),
    'ell_demo': _split_ja_dialogue_turns('でも…静かにできない?'),
}
cues = split_frame_text_to_cues('いいんですかあーちょっといきなり来られた', 0.0, 6.0)
merged = merge_short_neighbor_cues([
    {'start': 0.0, 'end': 2.5, 'text': 'いいんですか'},
    {'start': 2.5, 'end': 6.0, 'text': 'あーちょっといきなり来られた'},
])
merged_a = merge_short_neighbor_cues([
    {'start': 77.6, 'end': 79.36, 'text': 'たくてお伺いしたんですけど'},
    {'start': 79.36, 'end': 81.4, 'text': 'あちょっと近所の迷惑でちょっと'},
])
merged_hai = merge_short_neighbor_cues([
    {'start': 0.0, 'end': 2.0, 'text': 'かなって感じです'},
    {'start': 2.0, 'end': 2.4, 'text': 'はい'},
])
print(json.dumps({
    'desuka_n': len(cases['desuka_aa']),
    'desuka0': cases['desuka_aa'][0].endswith('ですか'),
    'desuka1': cases['desuka_aa'][1].startswith('あー'),
    'masenka_n': len(cases['masenka_iya']),
    'masenka1': cases['masenka_iya'][1].startswith('いや'),
    'kedo_n': len(cases['kedo_a']),
    'cont_n': len(cases['cont']),
    'yo_period_sou_n': len(cases['yo_period_sou']),
    'yo_period_sou1': cases['yo_period_sou'][1].startswith('そう') if len(cases['yo_period_sou']) > 1 else False,
    'desu_oshima_n': len(cases['desu_oshima']),
    'desu_oshima1': cases['desu_oshima'][1].startswith('お島') if len(cases['desu_oshima']) > 1 else False,
    'masuyo_datte_n': len(cases['masuyo_datte']),
    'kara_sousou_n': len(cases['kara_sousou']),
    'mashou_multi_n': len(cases['mashou_multi']),
    'desu_hai_n': len(cases['desu_hai']),
    'desu_hai1': cases['desu_hai'][1] == 'はい' if len(cases['desu_hai']) > 1 else False,
    'jan_ufufu_n': len(cases['jan_ufufu']),
    'dayo_aitsu_n': len(cases['dayo_aitsu']),
    'iijan_rep_n': len(cases['iijan_rep']),
    'mid_un_n': len(cases['mid_un']),
    'desu_yone_n': len(cases['desu_yone']),
    'ell_honto_n': len(cases['ell_honto']),
    'ell_ya_n': len(cases['ell_ya']),
    'ell_daijoubu_n': len(cases['ell_daijoubu']),
    'ell_yoshi_n': len(cases['ell_yoshi']),
    'ell_sagashite_n': len(cases['ell_sagashite']),
    'ell_waa_n': len(cases['ell_waa']),
    'ell_nande_n': len(cases['ell_nande']),
    'ell_oo_n': len(cases['ell_oo']),
    'ell_same_q_n': len(cases['ell_same_q']),
    'ell_demo_n': len(cases['ell_demo']),
    'cues_n': len(cues),
    'merged_n': len(merged),
    'merged_a_n': len(merged_a),
    'merged_hai_n': len(merged_hai),
    'new_turn': _ja_looks_like_new_turn('あーちょっと'),
    'new_turn_a': _ja_looks_like_new_turn('あちょっと近所の迷惑でちょっと'),
    'new_turn_hai': _ja_looks_like_new_turn('はい'),
    'new_turn_sou': _ja_looks_like_new_turn('そうそう'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.desuka_n, 2);
        assert.strictEqual(j.desuka0, true);
        assert.strictEqual(j.desuka1, true);
        assert.ok(j.masenka_n >= 2);
        assert.strictEqual(j.masenka1, true);
        assert.strictEqual(j.kedo_n, 2);
        assert.strictEqual(j.cont_n, 1, 'continuation それに must not split');
        assert.strictEqual(j.yo_period_sou_n, 2, '。 + そう turn');
        assert.strictEqual(j.yo_period_sou1, true);
        assert.strictEqual(j.desu_oshima_n, 2, 'です + name');
        assert.strictEqual(j.desu_oshima1, true);
        assert.strictEqual(j.masuyo_datte_n, 2);
        assert.strictEqual(j.kara_sousou_n, 2, 'ですから + そうそう (から$ not eaten by ですか)');
        assert.ok(j.mashou_multi_n >= 3, 'ましょう / じゃあ / はい multi-turn');
        assert.strictEqual(j.desu_hai_n, 2);
        assert.strictEqual(j.desu_hai1, true);
        assert.ok(j.jan_ufufu_n >= 2);
        assert.strictEqual(j.dayo_aitsu_n, 2);
        assert.strictEqual(j.iijan_rep_n, 1, 'じゃん repetition must not false-cut');
        assert.strictEqual(j.mid_un_n, 1, '使うんだよ must not false-cut on うん');
        assert.strictEqual(j.desu_yone_n, 1, 'ですよね particle chain');
        assert.strictEqual(j.ell_honto_n, 2, '…ホント? other-speaker');
        assert.strictEqual(j.ell_ya_n, 2, '…やっ reaction');
        assert.strictEqual(j.ell_daijoubu_n, 2);
        assert.strictEqual(j.ell_yoshi_n, 2);
        assert.strictEqual(j.ell_sagashite_n, 2, 'topic…reply');
        assert.strictEqual(j.ell_waa_n, 2);
        assert.strictEqual(j.ell_nande_n, 2);
        assert.strictEqual(j.ell_oo_n, 2);
        assert.strictEqual(j.ell_same_q_n, 1, 'しかして…ヌード same question');
        assert.strictEqual(j.ell_demo_n, 1, 'でも… same-speaker connective');
        assert.ok(j.cues_n >= 2);
        assert.strictEqual(j.merged_n, 2, 'merge_short must not re-glue new turns');
        assert.strictEqual(j.merged_a_n, 2, 'merge must not re-glue あちょっと turns');
        assert.strictEqual(j.merged_hai_n, 2, 'merge must not re-glue short はい response');
        assert.strictEqual(j.new_turn, true);
        assert.strictEqual(j.new_turn_a, true);
        assert.strictEqual(j.new_turn_hai, true);
        assert.strictEqual(j.new_turn_sou, true);
    });

    it('qwen3 is_model_installed requires every safetensors shard in the index', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json, tempfile
from pathlib import Path
from transub_engine.asr.qwen3_hf_convert import _weight_present, missing_safetensors_shards
from transub_engine.download import _weight_markers_for, is_model_installed, model_local_path
from transub_engine.models_catalog import get_spec

spec = get_spec('qwen3-asr-1.7b-ja-anime-galgame')
markers = _weight_markers_for(spec)
index = json.dumps({
    "weight_map": {
        "a": "model-00001-of-00002.safetensors",
        "b": "model-00002-of-00002.safetensors",
    }
})
with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    (root / 'config.json').write_text('{"model_type":"qwen3_asr"}', encoding='utf-8')
    cfg_only = _weight_present(root)
    (root / 'model.safetensors.index.json').write_text(index, encoding='utf-8')
    (root / 'model-00001-of-00002.safetensors').write_bytes(b'x' * 2048)
    incomplete = _weight_present(root)
    missing = missing_safetensors_shards(root)
    (root / 'model-00002-of-00002.safetensors').write_bytes(b'x' * 2048)
    complete = _weight_present(root)
    (root / 'model.safetensors').write_bytes(b'y' * 2048)
    single = _weight_present(root)
local = model_local_path('qwen3-asr-1.7b-ja-anime-galgame')
print(json.dumps({
    'cfg_only': cfg_only,
    'incomplete': incomplete,
    'missing': missing,
    'complete': complete,
    'single': single,
    'markers_have_config': 'config.json' in markers,
    'local_installed': is_model_installed('qwen3-asr-1.7b-ja-anime-galgame'),
    'has_config': (local / 'config.json').is_file() if local.is_dir() else False,
    'has_tokenizer': (local / 'tokenizer.json').is_file() if local.is_dir() else False,
    'has_weights': _weight_present(local) if local.is_dir() else False,
}))
`);
        const j = parsePyJson(out);
        assert.strictEqual(j.cfg_only, false);
        assert.strictEqual(j.incomplete, false);
        assert.deepStrictEqual(j.missing, ['model-00002-of-00002.safetensors']);
        assert.strictEqual(j.complete, true);
        assert.strictEqual(j.single, true);
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
    with patch('transub_engine.asr.qwen3_batch._probe_gpu_free_mib', return_value=(free, total)):
        with patch('transub_engine.asr.qwen3_batch._asr_runs_on_cuda', return_value=(device != 'cpu')):
            return qwen3_asr.resolve_island_batch_size(
                model,
                batch_mode=mode,
                device=device,
            )

print(json.dumps({
    'norm_auto': qwen3_asr.normalize_qwen_batch_mode('fast'),
    'cons_17': r('conservative', 16000, 16000, 'qwen3-asr-1.7b-ja'),
    'auto_17_low': r('auto', 5000, 12000, 'qwen3-asr-1.7b-ja'),
    'auto_17_8g': r('auto', 8500, 10240, 'qwen3-asr-1.7b-ja'),
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
        assert.strictEqual(j.auto_17_8g, 12);
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
with patch('transub_engine.asr.qwen3_batch._probe_gpu_free_mib', return_value=(16000, 16384)):
    with patch('transub_engine.asr.qwen3_batch._asr_runs_on_cuda', return_value=True):
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

    it('island OOM cap recovers after sustained successes; spoken budget trims batch', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr import qwen3_asr

qwen3_asr.clear_island_batch_oom_caps()
qwen3_asr.note_island_batch_oom_cap('qwen3-asr-1.7b', 'cuda', 'auto', 12)
assert qwen3_asr.get_island_batch_oom_cap('qwen3-asr-1.7b', 'cuda', 'auto') == 6
for _ in range(7):
    qwen3_asr.note_island_batch_success(
        'qwen3-asr-1.7b', 'cuda', 'auto', target_batch=12, used_batch=6,
    )
assert qwen3_asr.get_island_batch_oom_cap('qwen3-asr-1.7b', 'cuda', 'auto') == 6
qwen3_asr.note_island_batch_success(
    'qwen3-asr-1.7b', 'cuda', 'auto', target_batch=12, used_batch=6,
)
recovered = qwen3_asr.get_island_batch_oom_cap('qwen3-asr-1.7b', 'cuda', 'auto')
frames = [(0, 5.0), (5, 10.0), (10, 15.0), (15, 40.0), (40, 45.0)]
n = qwen3_asr.limit_island_batch_by_spoken_s(frames, 0, 5, max_spoken_s=12.0)
n_long = qwen3_asr.limit_island_batch_by_spoken_s(frames, 3, 5, max_spoken_s=12.0)
print(json.dumps({'recovered': recovered, 'n': n, 'n_long': n_long}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.recovered, 9);
        assert.strictEqual(j.n, 2);
        assert.strictEqual(j.n_long, 1);
    });

    it('homogeneous island batches split long and short neighbors', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr import qwen3_asr

# 0.4, 0.4, 5.0, 0.4, 1.2 — 5s must not pad with the breaths around it.
frames = [(0.0, 0.4), (0.5, 0.9), (1.2, 6.2), (6.3, 6.7), (7.0, 8.2)]
close = [(0.0, 1.0), (1.0, 3.4)]
longs = [(0, 5.0), (5, 10.0), (10, 15.0)]
shorts = [(i, i + 0.5) for i in range(10)]
print(json.dumps({
    'n0': qwen3_asr.limit_island_batch_homogeneous(frames, 0, 8),
    'n2': qwen3_asr.limit_island_batch_homogeneous(frames, 2, 8),
    'n3': qwen3_asr.limit_island_batch_homogeneous(frames, 3, 8),
    'close': qwen3_asr.limit_island_batch_homogeneous(close, 0, 8),
    'spoken': qwen3_asr.limit_island_batch_homogeneous(longs, 0, 8, max_spoken_s=12.0),
    'cap': qwen3_asr.limit_island_batch_homogeneous(shorts, 0, 4),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n0, 2);
        assert.strictEqual(j.n2, 1);
        assert.strictEqual(j.n3, 1);
        assert.strictEqual(j.close, 2);
        assert.strictEqual(j.spoken, 2);
        assert.strictEqual(j.cap, 4);
    });

    it('resolve_island_batch_size prefers job VRAM hints over probe', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

with patch('transub_engine.asr.qwen3_batch._probe_gpu_free_mib', return_value=(3000, 8192)):
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

    it('island retry gates: short valid text skips truncated; multi-span short trips it', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr import qwen3_asr

# Short-but-valid on a long single-span island must NOT look truncated.
w1, t1 = qwen3_asr._island_needs_asr_retry(
    'こんにちは。',
    span_s=4.5,
    speech_span_n=1,
)
# Empty / particle → weak
w2, t2 = qwen3_asr._island_needs_asr_retry('は', span_s=2.0, speech_span_n=1)
# Multi-span + long island + too few chars → truncated (not weak)
w3, t3 = qwen3_asr._island_needs_asr_retry(
    'おかえり',
    span_s=5.0,
    speech_span_n=2,
)
# Under 4s never truncated even with multi-span
w4, t4 = qwen3_asr._island_needs_asr_retry(
    'あ',
    span_s=3.2,
    speech_span_n=3,
)
# Duration-bucket: shorter islands first
frames = [(10.0, 14.0, None), (0.0, 1.5, None), (5.0, 7.0, None)]
sorted_fr = qwen3_asr._frames_sorted_by_duration(frames)
durs = [round(e - s, 2) for s, e, _ in sorted_fr]
cues = qwen3_asr._sort_cues_by_start([
    {'start': 8.0, 'end': 9.0, 'text': 'b'},
    {'start': 1.0, 'end': 2.0, 'text': 'a'},
])
print(json.dumps({
    'short_valid': {'weak': w1, 'trunc': t1},
    'particle': {'weak': w2, 'trunc': t2},
    'multi_short': {'weak': w3, 'trunc': t3},
    'under4': {'weak': w4, 'trunc': t4},
    'durs': durs,
    'cue_starts': [c['start'] for c in cues],
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.short_valid.weak, false);
        assert.strictEqual(j.short_valid.trunc, false);
        assert.strictEqual(j.particle.weak, true);
        assert.strictEqual(j.particle.trunc, false);
        assert.strictEqual(j.multi_short.weak, false);
        assert.strictEqual(j.multi_short.trunc, true);
        assert.strictEqual(j.under4.trunc, false);
        assert.deepStrictEqual(j.durs, [1.5, 2, 4]);
        assert.deepStrictEqual(j.cue_starts, [1, 8]);

        const gates = runPy(`
import json
from transub_engine.asr import qwen3_asr
intro = qwen3_asr._should_solo_retry_island(
    '東北出身で、えー…', span_s=5.0, speech_span_n=2,
)
filler = qwen3_asr._should_solo_retry_island(
    '東北出身で、えー…', span_s=3.2, speech_span_n=2,
)
okaeri = qwen3_asr._should_solo_retry_island(
    'おかえり', span_s=5.0, speech_span_n=2,
)
moan = qwen3_asr._should_solo_retry_island(
    'んっはぁっはぁっ', span_s=5.0, speech_span_n=3,
)
short_ok = qwen3_asr._should_solo_retry_island(
    'こんにちは。', span_s=4.5, speech_span_n=1,
)
empty_short = qwen3_asr._should_solo_retry_island('', span_s=0.4, speech_span_n=1)
empty_long = qwen3_asr._should_solo_retry_island('', span_s=1.2, speech_span_n=1)
ellipsis_short = qwen3_asr._should_solo_retry_island('…', span_s=0.35, speech_span_n=1)
ellipsis_long = qwen3_asr._should_solo_retry_island('…', span_s=0.9, speech_span_n=1)
uncovered = qwen3_asr._uncovered_speech_spans(
    [{'start': 86.1, 'end': 87.5, 'text': '東北出身で、えー…'}],
    [(86.1, 87.5), (89.0, 91.4)],
)
print(json.dumps({
    'intro': intro, 'filler': filler, 'okaeri': okaeri, 'moan': moan,
    'short_ok': short_ok,
    'empty_short': empty_short, 'empty_long': empty_long,
    'ellipsis_short': ellipsis_short, 'ellipsis_long': ellipsis_long,
    'uncovered': [[round(a,1), round(b,1)] for a,b in uncovered],
}))
`);
        const g = JSON.parse(gates);
        assert.strictEqual(g.intro, true);
        assert.strictEqual(g.filler, true);
        assert.strictEqual(g.okaeri, true);
        assert.strictEqual(g.moan, false);
        assert.strictEqual(g.short_ok, false);
        assert.strictEqual(g.empty_short, false);
        assert.strictEqual(g.empty_long, true);
        assert.strictEqual(g.ellipsis_short, false);
        assert.strictEqual(g.ellipsis_long, true);
        assert.deepStrictEqual(g.uncovered, [[89.0, 91.4]]);
    });

    it('distribute_text_cues keeps cue midpoints inside island after text change', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr import qwen3_asr

island_start = 12.0
island_end = 16.0
spans = [(12.2, 13.5), (14.0, 15.6)]
cues_a = qwen3_asr._distribute_text_cues(
    'こんにちは。元気ですか。',
    start=island_start,
    end=island_end,
    speech_spans=spans,
)
cues_b = qwen3_asr._distribute_text_cues(
    'はい、わかりました。じゃあね。',
    start=island_start,
    end=island_end,
    speech_spans=spans,
)

def mids_ok(cues):
    for c in cues:
        mid = (float(c['start']) + float(c['end'])) * 0.5
        if mid < island_start - 1e-3 or mid > island_end + 1e-3:
            return False
        if float(c['start']) < island_start - 1e-3 or float(c['end']) > island_end + 1e-3:
            return False
    return True

print(json.dumps({
    'n_a': len(cues_a),
    'n_b': len(cues_b),
    'ok_a': mids_ok(cues_a),
    'ok_b': mids_ok(cues_b),
    'a0': [round(float(cues_a[0]['start']), 2), round(float(cues_a[0]['end']), 2)] if cues_a else None,
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.n_a >= 1, `expected cues_a, got ${j.n_a}`);
        assert.ok(j.n_b >= 1, `expected cues_b, got ${j.n_b}`);
        assert.strictEqual(j.ok_a, true);
        assert.strictEqual(j.ok_b, true);
        assert.ok(j.a0[0] >= 12.0, `cue start ${j.a0}`);
        assert.ok(j.a0[1] <= 16.0, `cue end ${j.a0}`);
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
        # Non-weak text: particle 「あ」 alone would solo-retry every 4s island.
        text = 'こんにちは。元気ですか。'
        time_stamps = None
    return [R() for _ in range(n)]

audio = np.zeros(16000 * 20, dtype=np.float32)
intervals = [(0.0, 4.0), (5.0, 9.0), (10.0, 14.0), (15.0, 19.0)]
trim_calls = []

def _boom_trim(*_a, **_k):
    trim_calls.append(1)
    raise RuntimeError('ffmpeg trim should not run when PCM is available')

from transub_engine.vad import ten_vad_seg
with patch('transub_engine.asr.qwen3_infer.generate_transcriptions', side_effect=fake_generate):
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

    it('Qwen transcribe list splits HIP invalid-argument batches', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from types import SimpleNamespace
from transub_engine.asr.qwen3_hf_generate import (
    generate_transcriptions,
    is_hip_invalid_value,
    is_recoverable_gpu_batch_error,
)
from transub_engine.asr import qwen3_asr

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
    if n > 1:
        raise RuntimeError(
            'CUDA error: invalid argument\\n'
            "Search for \`hipErrorInvalidValue' in https://rocm.docs.amd.com/"
        )
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
    is_lora=False,
    prefer_beam_search=False,
)
err = RuntimeError('CUDA error: invalid argument\\nhipErrorInvalidValue')
out = generate_transcriptions(bundle, ['a.wav', 'b.wav', 'c.wav', 'd.wav'], 'Japanese', max_new_tokens=32)
print(json.dumps({
    'sizes': sizes,
    'n': len(out),
    'hip': is_hip_invalid_value(err),
    'recoverable': is_recoverable_gpu_batch_error(err),
    'systemic': qwen3_asr._is_systemic_qwen_error(err),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.hip, true);
        assert.strictEqual(j.recoverable, true);
        assert.strictEqual(j.systemic, false);
        assert.strictEqual(j.n, 4);
        assert.ok(j.sizes[0] === 4, JSON.stringify(j.sizes));
        assert.ok(j.sizes.slice(1).every((n) => n <= 2), JSON.stringify(j.sizes));
    });

    it('resolve_island_batch_size caps at 1 on ROCm', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from unittest.mock import patch
from transub_engine.asr import qwen3_asr

with patch('transub_engine.asr.qwen3_batch._probe_gpu_free_mib', return_value=(16000, 16384)):
    with patch('transub_engine.asr.qwen3_batch._asr_runs_on_cuda', return_value=True):
        with patch('transub_engine.asr.qwen3_batch._torch_is_rocm', return_value=True):
            n = qwen3_asr.resolve_island_batch_size(
                'qwen3-asr-1.7b-ja-anime-galgame',
                batch_mode='aggressive',
                device='cuda',
            )
print(json.dumps({'n': n}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 1);
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
    with patch('transub_engine.asr.qwen3_infer.generate_transcriptions', side_effect=boom_generate):
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
    with patch('transub_engine.asr.qwen3_infer.generate_transcriptions', side_effect=boom_generate):
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
