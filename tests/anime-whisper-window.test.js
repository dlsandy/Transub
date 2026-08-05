/**
 * anime-whisper auto-window helpers (engine).
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
        timeout: 60000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('anime-whisper windowing', () => {
    it('flags anime-whisper for windowed ASR and prompt skip', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.models_catalog import (
    asr_needs_windowed_transcribe,
    asr_skips_whisper_prompt,
    asr_skips_whisperseg_gating,
)
print(json.dumps({
    'win_aw': asr_needs_windowed_transcribe('anime-whisper'),
    'win_ja': asr_needs_windowed_transcribe('whisper-ja-1.5b'),
    'win_kotoba': asr_needs_windowed_transcribe('kotoba-whisper-v2.0-faster'),
    'skip_aw': asr_skips_whisper_prompt('anime-whisper'),
    'skip_kotoba': asr_skips_whisper_prompt('kotoba-whisper-v2.0-faster'),
    'skip_turbo': asr_skips_whisper_prompt('whisper-large-v3-turbo'),
    'seg_aw': asr_skips_whisperseg_gating('anime-whisper'),
    'seg_kotoba': asr_skips_whisperseg_gating('kotoba-whisper-v2.0-faster'),
    'seg_ja': asr_skips_whisperseg_gating('whisper-ja-1.5b'),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.win_aw, true);
        assert.strictEqual(j.win_ja, false);
        assert.strictEqual(j.win_kotoba, true);
        assert.strictEqual(j.skip_aw, true);
        assert.strictEqual(j.skip_kotoba, true);
        assert.strictEqual(j.skip_turbo, false);
        assert.strictEqual(j.seg_aw, true);
        assert.strictEqual(j.seg_kotoba, true);
        assert.strictEqual(j.seg_ja, false);
    });

    it('packs clips into <=180s windows', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import pack_clips_into_windows, fixed_time_windows
clips = [
    {'start': 0.0, 'end': 2.0},
    {'start': 2.4, 'end': 5.0},
    {'start': 200.0, 'end': 205.0},
    {'start': 400.0, 'end': 410.0},
    {'start': 410.5, 'end': 420.0},
]
wins = pack_clips_into_windows(clips, max_span_s=180.0)
fixed = fixed_time_windows(500.0, window_s=180.0, overlap_s=0.75)
print(json.dumps({
    'n': len(wins),
    'spans': [round(w['end']-w['start'], 2) for w in wins],
    'fixed_n': len(fixed),
    'fixed_first': [round(fixed[0]['start'],2), round(fixed[0]['end'],2)],
    'fixed_last_end': round(fixed[-1]['end'], 2),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.n >= 2);
        assert.ok(j.spans.every((s) => s <= 180.01));
        assert.ok(j.fixed_n >= 3);
        assert.strictEqual(j.fixed_first[0], 0);
        assert.ok(j.fixed_first[1] <= 180.01);
        assert.ok(j.fixed_last_end >= 499);
    });

    it('fills large WhisperSeg gaps so dialogue islands are covered', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import pack_clips_into_windows, fill_timeline_gaps, fixed_time_windows
from transub_engine.vad.whisperseg import should_force_full_transcribe
# Sparse soft-AV: two moan islands on a 2h timeline
clips = [
    {'start': 100.0, 'end': 102.0},
    {'start': 6000.0, 'end': 6003.0},
]
packed = pack_clips_into_windows(clips)
filled = fill_timeline_gaps(packed, 7200.0, max_gap_s=12.0)
fixed = fixed_time_windows(7200.0, window_s=180.0)
# coverage: union of filled windows should span most of the media
cov = 0.0
prev = None
for w in sorted(filled, key=lambda x: x['start']):
    s, e = float(w['start']), float(w['end'])
    if prev and s < prev:
        s = prev
    if e > s:
        cov += e - s
        prev = e
sparse = [{'start': 10.0, 'end': 12.0}, {'start': 20.0, 'end': 21.0}]
print(json.dumps({
    'packed_n': len(packed),
    'filled_n': len(filled),
    'fixed_n': len(fixed),
    'cov': round(cov, 1),
    'spans_ok': all((w['end'] - w['start']) <= 181.0 for w in filled),
    'force_sparse': should_force_full_transcribe(sparse, duration_s=7200.0),
    'force_dense': should_force_full_transcribe(
        [{'start': float(i), 'end': float(i) + 5.0} for i in range(0, 3600, 20)],
        duration_s=3600.0,
    ),
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.filled_n > j.packed_n);
        assert.ok(j.cov > 6000, `expected wide coverage, got ${j.cov}`);
        assert.ok(j.fixed_n >= 40, `expected ~40 fixed windows for 2h, got ${j.fixed_n}`);
        assert.strictEqual(j.spans_ok, true);
        assert.strictEqual(j.force_sparse, true);
        assert.strictEqual(j.force_dense, false);
    });

    it('repairs collapsed anime-whisper timestamps so CPS filter keeps dialogue', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import repair_collapsed_asr_cues, retime_wall_to_wall_cues
from transub_engine.quality import filter_hallucinated_cues, is_hallucinated_cue
# Mimic anime-whisper: one blob per 30s step, end≈start
raw = [
    {'start': 0.0, 'end': 0.35, 'text': 'じゃ、ちょっとトイレ行ったから。はい、お茶でも飲んで。お茶もありがとうございます。'},
    {'start': 30.0, 'end': 30.42, 'text': 'エルダイクンが大事な仕事忘れるなんて珍しいね。何かあったの?実は私、先日まで付き合っていた人と別れたんです。'},
    {'start': 60.0, 'end': 60.76, 'text': 'ええと、もうすぐ7ヶ月かな?ということは、もうすぐ出産ですね。うん、長い妊活でね。'},
]
fixed = repair_collapsed_asr_cues(raw, media_end_s=90.0)
kept, after_drop = filter_hallucinated_cues(fixed, ja_av=True)
max_cps = 0.0
spoken = 0.0
chunk_gaps = []
for i, c in enumerate(fixed):
    dur = max(1e-6, float(c['end']) - float(c['start']))
    spoken += dur
    cps = len(str(c['text']).replace(' ', '')) / dur
    max_cps = max(max_cps, cps)
    if i:
        chunk_gaps.append(float(c['start']) - float(fixed[i-1]['end']))
# Wall-to-wall fixture (old buggy repair) must shrink in place
wall = [
    {'start': 0.0, 'end': 10.0, 'text': '短い一文です。'},
    {'start': 10.0, 'end': 20.0, 'text': 'もう少し長めの対白が続きますね。'},
    {'start': 20.0, 'end': 30.0, 'text': '最後の句。'},
]
retimed = retime_wall_to_wall_cues(wall)
retimed_spoken = sum(float(c['end'])-float(c['start']) for c in retimed)
# starts preserved; ends pulled in
starts_ok = [round(float(c['start']), 1) for c in retimed] == [0.0, 10.0, 20.0]
gaps = [float(retimed[i+1]['start'])-float(retimed[i]['end']) for i in range(2)]
print(json.dumps({
    'after_drop': after_drop,
    'raw_n': len(raw),
    'fixed_n': len(fixed),
    'kept_n': len(kept),
    'max_cps': round(max_cps, 1),
    'spoken': round(spoken, 1),
    'min_gap': round(min(chunk_gaps), 2) if chunk_gaps else None,
    'any_hallu': any(is_hallucinated_cue(c, ja_av=True) for c in fixed),
    'raw_spans': [round(float(c['end'])-float(c['start']), 2) for c in raw],
    'chunk_gap_ok': any(g > 1.0 for g in chunk_gaps),
    'wall_spoken': 30.0,
    'retimed_spoken': round(retimed_spoken, 1),
    'retimed_n': len(retimed),
    'starts_ok': starts_ok,
    'retimed_gaps': [round(g, 2) for g in gaps],
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.after_drop, 0, 'repaired cues must survive ja_av CPS filter');
        assert.ok(j.fixed_n >= j.raw_n, 'repair should split into readable cues');
        assert.ok(j.kept_n >= 3);
        assert.ok(j.max_cps <= 28.01, `expected readable CPS, got ${j.max_cps}`);
        assert.ok(j.spoken < 50, `must not fill silence; spoken=${j.spoken}`);
        assert.strictEqual(j.chunk_gap_ok, true, '30s decode steps must leave silence gaps');
        assert.ok(j.raw_spans.every((s) => s < 1.0), 'fixture must be collapsed');
        assert.strictEqual(j.any_hallu, false);
        assert.ok(j.retimed_spoken < 20, `wall retime must shrink; got ${j.retimed_spoken}`);
        assert.strictEqual(j.retimed_n, 3);
        assert.strictEqual(j.starts_ok, true);
        assert.ok(j.retimed_gaps.every((g) => g >= 0.05), `expected in-place gaps, got ${j.retimed_gaps}`);
    });

    it('aligns anime text onto timing-model speech intervals', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import align_text_cues_to_timing
from transub_engine.models_catalog import resolve_timing_align_model
from transub_engine.asr.wav2vec_align import (
    expand_segments_for_align,
    wav2vec_align_available,
)

text_cues = [
    {'start': 0.0, 'end': 1.0, 'text': 'じゃ、ちょっとトイレ行ったから。'},
    {'start': 1.0, 'end': 2.0, 'text': 'はい、お茶でも飲んで。'},
    {'start': 30.0, 'end': 31.0, 'text': '何かあったの?'},
]
timing = [
    {'start': 2.0, 'end': 5.5, 'text': 'トイレ行ってくるわ'},
    {'start': 5.5, 'end': 5.85, 'text': 'はい'},
    {'start': 21.5, 'end': 24.0, 'text': 'お茶でも飲んで'},
    {'start': 40.0, 'end': 42.5, 'text': '何かあった'},
]
aligned = align_text_cues_to_timing(text_cues, timing)
gaps = [aligned[i+1]['start']-aligned[i]['end'] for i in range(len(aligned)-1)]
collapsed = [
    {'start': 0.0, 'end': 0.3, 'text': '長い対白です。'},
    {'start': 30.0, 'end': 30.2, 'text': '次の対白。'},
]
expanded = expand_segments_for_align(collapsed, media_end_s=60.0)
print(json.dumps({
    'n': len(aligned),
    'texts': [c['text'] for c in aligned],
    'starts': [round(float(c['start']), 2) for c in aligned],
    'ends': [round(float(c['end']), 2) for c in aligned],
    'has_silence_gap': any(g > 5.0 for g in gaps),
    'first_in_speech': 2.0 <= float(aligned[0]['start']) <= 5.5,
    'timing_model': resolve_timing_align_model('anime-whisper'),
    'w2v_avail': wav2vec_align_available(),
    'expanded_spans': [round(float(c['end'])-float(c['start']), 2) for c in expanded],
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 3);
        assert.deepStrictEqual(j.texts, [
            'じゃ、ちょっとトイレ行ったから。',
            'はい、お茶でも飲んで。',
            '何かあったの?',
        ]);
        assert.strictEqual(j.first_in_speech, true);
        assert.strictEqual(j.has_silence_gap, true);
        assert.ok(j.timing_model, 'expected an installed timing model');
        assert.notStrictEqual(j.timing_model, 'anime-whisper');
        assert.ok(j.ends[0] <= 5.5 + 0.05, `first cue spans silence: end=${j.ends[0]}`);
        // wav2vec2 is optional (transformers+torch); alignment still works via ASR timing.
        assert.ok(typeof j.w2v_avail === 'boolean');
        assert.ok(j.expanded_spans.every((s) => s >= 2.0));
    });

    it('TEN VAD-only timing maps anime text onto speech islands', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.vad.ten_vad_seg import (
    ten_vad_available,
    intervals_as_timing_cues,
    align_cues_ten_vad,
    _SOUNDFILE_EXTS,
)
from transub_engine.asr.whisper_fw import align_text_cues_to_timing

avail = ten_vad_available()
text_cues = [
    {'start': 0.0, 'end': 1.0, 'text': 'じゃ、ちょっとトイレ行ったから。'},
    {'start': 1.0, 'end': 2.0, 'text': 'はい、お茶でも飲んで。'},
    {'start': 30.0, 'end': 31.0, 'text': '何かあったの?'},
]
intervals = [(0.2, 2.0), (21.5, 26.0), (40.0, 42.0)]
timing = intervals_as_timing_cues(intervals)
aligned = align_text_cues_to_timing(text_cues, timing)
gaps = [aligned[i+1]['start']-aligned[i]['end'] for i in range(len(aligned)-1)]
print(json.dumps({
    'avail': avail,
    'n': len(aligned),
    'starts': [round(float(c['start']), 2) for c in aligned],
    'ends': [round(float(c['end']), 2) for c in aligned],
    'has_silence_gap': any(g > 5.0 for g in gaps),
    'first_in_vad': 0.2 <= float(aligned[0]['start']) <= 2.0,
    'tea_not_at_head': float(aligned[1]['start']) >= 20.0,
    'mp4_not_soundfile': '.mp4' not in _SOUNDFILE_EXTS,
    'mkv_not_soundfile': '.mkv' not in _SOUNDFILE_EXTS,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.avail, true, 'ten-vad should be installed');
        assert.strictEqual(j.n, 3);
        assert.strictEqual(j.first_in_vad, true);
        assert.strictEqual(j.has_silence_gap, true);
        assert.strictEqual(j.tea_not_at_head, true);
        assert.strictEqual(j.mp4_not_soundfile, true);
        assert.strictEqual(j.mkv_not_soundfile, true);
    });

    it('TEN VAD loads mp4 via ffmpeg not soundfile', function () {
        if (process.platform !== 'win32') this.skip();
        const bundledFf = path.join(__dirname, '..', '_internal', 'bin', 'ffmpeg.exe');
        const out = runPy(`
import json
import os
import subprocess
import tempfile
from pathlib import Path
os.environ['FFMPEG_BINARY'] = r${JSON.stringify(bundledFf)}
os.environ['FFMPEG_PATH'] = r${JSON.stringify(bundledFf)}
from transub_engine.ffmpeg_util import resolve_ffmpeg
from transub_engine.vad.ten_vad_seg import (
    _load_int16_mono_16k,
    collect_ten_vad_intervals,
    collect_ten_vad_intervals_with_audio,
    slice_pcm_f32,
    ten_vad_available,
    SAMPLE_RATE,
)
import numpy as np

ffmpeg = resolve_ffmpeg()
if not ffmpeg or not Path(ffmpeg).is_file():
    print(json.dumps({'skip': True, 'ffmpeg': ffmpeg or ''}))
else:
    work = Path(tempfile.mkdtemp(prefix='ten_mp4_'))
    wav = work / 'tone.wav'
    mp4 = work / 'tone.mp4'
    subprocess.run([
        ffmpeg, '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-ac', '1', '-ar', '16000', str(wav),
    ], check=True, capture_output=True)
    subprocess.run([
        ffmpeg, '-hide_banner', '-loglevel', 'error',
        '-i', str(wav), '-c:a', 'aac', '-b:a', '64k', str(mp4),
    ], check=True, capture_output=True)
    pcm = _load_int16_mono_16k(str(mp4))
    intervals = collect_ten_vad_intervals(str(mp4), min_speech_s=0.05, merge_gap_s=0.2)
    iv2, audio_f32 = collect_ten_vad_intervals_with_audio(
        str(mp4), min_speech_s=0.05, merge_gap_s=0.2,
    )
    # Synthetic PCM clock check: slice [0.25, 0.75] on 1s buffer
    fake = np.linspace(-0.5, 0.5, SAMPLE_RATE, dtype=np.float32)
    clip = slice_pcm_f32(fake, 0.25, 0.75)
    print(json.dumps({
        'skip': False,
        'ffmpeg': bool(ffmpeg),
        'avail': ten_vad_available(),
        'n_samples': int(len(pcm)),
        'dtype': str(pcm.dtype),
        'near_1s': 14000 <= len(pcm) <= 18000,
        'intervals_n': len(intervals),
        'with_audio_n': len(iv2),
        'f32_dtype': str(audio_f32.dtype),
        'f32_near_1s': 14000 <= len(audio_f32) <= 18000,
        'slice_n': int(len(clip)),
        'slice_ok': abs(len(clip) - int(0.5 * SAMPLE_RATE)) <= 2,
    }))
`);
        const j = JSON.parse(out);
        if (j.skip) this.skip();
        assert.ok(j.ffmpeg, 'ffmpeg required');
        assert.strictEqual(j.avail, true);
        assert.strictEqual(j.dtype, 'int16');
        assert.strictEqual(j.near_1s, true, `expected ~16k samples, got ${j.n_samples}`);
        assert.strictEqual(j.f32_dtype, 'float32');
        assert.strictEqual(j.f32_near_1s, true);
        assert.strictEqual(j.slice_ok, true, `slice len=${j.slice_n}`);
        assert.strictEqual(j.with_audio_n, j.intervals_n);
    });

    it('PCM slice indices match VAD frame bounds', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
import numpy as np
from transub_engine.vad.ten_vad_seg import SAMPLE_RATE, slice_pcm_f32

# 10s of PCM; frames at 1.0-3.5 and 7.0-9.0
audio = np.arange(SAMPLE_RATE * 10, dtype=np.float32)
frames = [(1.0, 3.5), (7.0, 9.0)]
ok = True
lens = []
starts = []
for s, e in frames:
    clip = slice_pcm_f32(audio, s, e)
    i0 = int(s * SAMPLE_RATE)
    expected = int(e * SAMPLE_RATE) - i0
    lens.append(int(len(clip)))
    starts.append(float(clip[0]) if len(clip) else None)
    if abs(len(clip) - expected) > 1:
        ok = False
    if len(clip) and abs(float(clip[0]) - float(i0)) > 0.5:
        ok = False
print(json.dumps({'ok': ok, 'lens': lens, 'starts': starts, 'sr': SAMPLE_RATE}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.ok, true, JSON.stringify(j));
        assert.ok(j.lens[0] >= 39000 && j.lens[0] <= 41000);
        assert.ok(j.lens[1] >= 31000 && j.lens[1] <= 33000);
    });

    it('anime TEN island ASR forces greedy beam_size=1', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import _anime_ten_beam_size
print(json.dumps({
    'none': _anime_ten_beam_size(None),
    'one': _anime_ten_beam_size(1),
    'five': _anime_ten_beam_size(5),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.none, 1);
        assert.strictEqual(j.one, 1);
        assert.strictEqual(j.five, 1);
    });

    it('anime default timing uses TEN island ASR helper', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import (
    _anime_uses_ten_island_asr,
    _split_island_spans,
    group_vad_intervals,
    split_frame_text_to_cues,
)
spans = _split_island_spans(0.0, 400.0, max_span_s=180.0)
short = _split_island_spans(0.0, 12.0, max_span_s=5.0)
grouped = group_vad_intervals(
    [(0.0, 1.2), (1.4, 2.0), (8.0, 20.0)],
    chunk_threshold_s=0.5,
    max_group_duration_s=5.0,
)
cues = split_frame_text_to_cues(
    'じゃ、ちょっとトイレ行ったから。はい、お茶でも飲んで。',
    10.0,
    15.0,
)
print(json.dumps({
    'auto': _anime_uses_ten_island_asr(None),
    'ten': _anime_uses_ten_island_asr('ten'),
    'off': _anime_uses_ten_island_asr(''),
    'rate': _anime_uses_ten_island_asr('rate'),
    'ja': _anime_uses_ten_island_asr('whisper-ja-1.5b'),
    'n_spans': len(spans),
    'first_end': round(spans[0][1], 1),
    'last_start': round(spans[-1][0], 1),
    'short_n': len(short),
    'short_max': round(max(e - s for s, e in short), 2),
    'grouped_n': len(grouped),
    'grouped_spans': [round(e - s, 2) for s, e in grouped],
    'cue_n': len(cues),
    'cue_starts': [round(float(c['start']), 2) for c in cues],
    'cue_end': round(float(cues[-1]['end']), 2),
    'first_in_frame': float(cues[0]['start']) == 10.0,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.auto, true, 'default must use TEN island ASR');
        assert.strictEqual(j.ten, true);
        assert.strictEqual(j.off, false);
        assert.strictEqual(j.rate, false);
        assert.strictEqual(j.ja, false);
        assert.strictEqual(j.n_spans, 3);
        assert.strictEqual(j.first_end, 180);
        assert.strictEqual(j.last_start, 360);
        assert.ok(j.short_n >= 3);
        assert.ok(j.short_max <= 5.01);
        assert.ok(j.grouped_n >= 3, `expected split long island, got ${j.grouped_n}`);
        assert.ok(j.grouped_spans.every((s) => s <= 5.01));
        assert.ok(j.cue_n >= 2);
        assert.strictEqual(j.first_in_frame, true);
        assert.strictEqual(j.cue_end, 15);
    });

    it('fuzzy-matches anime text onto ja timing cue starts/ends', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import align_text_cues_to_timing
text_cues = [
    {'start': 0.0, 'end': 0.3, 'text': 'じゃ、ちょっとトイレ行ったから。'},
    {'start': 0.3, 'end': 0.6, 'text': 'はい、お茶でも飲んで。'},
    {'start': 0.6, 'end': 0.9, 'text': 'こっちもありがとうございます。'},
    {'start': 0.9, 'end': 1.2, 'text': '何かあったの?'},
]
timing = [
    {'start': 0.0, 'end': 1.9, 'text': 'と、じゃあ俺ちょっとトイレ行ってくるわ。'},
    {'start': 21.86, 'end': 23.0, 'text': 'はい、お茶でも飲んで。'},
    {'start': 24.22, 'end': 25.4, 'text': 'あ、こっちもありがとうございます。'},
    {'start': 37.38, 'end': 38.58, 'text': '何かあったの?'},
]
aligned = align_text_cues_to_timing(text_cues, timing)
print(json.dumps({
    'n': len(aligned),
    'starts': [round(float(c['start']), 2) for c in aligned],
    'ends': [round(float(c['end']), 2) for c in aligned],
    'tea_start': round(float(aligned[1]['start']), 2),
    'tea_end': round(float(aligned[1]['end']), 2),
    'thanks_start': round(float(aligned[2]['start']), 2),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.n, 4);
        assert.ok(Math.abs(j.tea_start - 21.86) < 0.05, `tea start ${j.tea_start}`);
        assert.ok(Math.abs(j.tea_end - 23.0) < 0.05, `tea end ${j.tea_end}`);
        assert.ok(Math.abs(j.thanks_start - 24.22) < 0.05, `thanks ${j.thanks_start}`);
    });

    it('empty TEN-island result is falsy so windowed fallback can run', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
import inspect
from transub_engine.asr import whisper_fw
src = inspect.getsource(whisper_fw._whisper_anime_ten_island_transcribe)
src2 = inspect.getsource(whisper_fw.whisper_transcribe)
print(json.dumps({
    'returns_none_when_empty': 'returning None for windowed fallback' in src,
    'truthy_check_outer': 'if island:' in src2 and 'if island is not None:' not in src2.split('ten_island_attempted')[1][:800],
    'skip_reten_after_attempt': 'ten_island_attempted' in src2 and 'win_align' in src2,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.returns_none_when_empty, true);
        assert.strictEqual(j.truthy_check_outer, true);
        assert.strictEqual(j.skip_reten_after_attempt, true);
    });

    it('Qwen/Reazon refuse unknown duration; streaming flush stride grows', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from transub_engine.asr import qwen3_asr, reazon_k2
from transub_engine.subtitles import StreamingSubtitleWriter
from transub_engine.runtime_release import release_gpu_memory

def _run_qwen_gate():
    with patch.object(qwen3_asr, '_probe_duration_s', return_value=0.0):
        with patch.object(qwen3_asr, 'is_model_installed', return_value=True):
            with patch.object(qwen3_asr, 'model_local_path', return_value=Path('.')):
                with patch.object(qwen3_asr, '_get_asr_model', return_value=object()):
                    with patch('transub_engine.runtime_extras.ensure_extras_for_models'):
                        return qwen3_asr.qwen3_asr_transcribe(media_path='x.mp4')

def _run_reazon_gate():
    with patch.object(reazon_k2, '_probe_duration_s', return_value=0.0):
        with patch.object(reazon_k2, 'is_model_installed', return_value=True):
            with patch.object(reazon_k2, 'model_local_path', return_value=Path('.')):
                with patch.object(reazon_k2, '_get_recognizer', return_value=object()):
                    with patch('transub_engine.runtime_extras.ensure_extras_for_models'):
                        return reazon_k2.reazon_k2_transcribe(media_path='x.mp4')

qe = ''
re = ''
try:
    _run_qwen_gate()
except Exception as err:
    qe = str(err)
try:
    _run_reazon_gate()
except Exception as err:
    re = str(err)

flush_marks = []
with tempfile.TemporaryDirectory() as td:
    w = StreamingSubtitleWriter(Path(td) / 't.srt')
    orig = w.flush
    def tracked():
        flush_marks.append(len(w._cues))
        return orig()
    w.flush = tracked
    for i in range(200):
        w.append({'start': float(i), 'end': float(i)+0.5, 'text': f'c{i}'})
    w.close()

rel = release_gpu_memory(reason='test', unload_models=True)
freed = ' '.join(rel.get('freed') or [])
print(json.dumps({
    'qwen_gate': '时长' in qe or '不能安全' in qe,
    'reazon_gate': '时长' in re or '不能安全' in re,
    'qwen_msg': qe[:160],
    'reazon_msg': re[:160],
    'flush_n': len(flush_marks),
    'flush_lt_old': len(flush_marks) < 200 // 8,
    'has_wav2vec_release': 'wav2vec_align_cache' in freed,
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.qwen_gate, true, j.qwen_msg);
        assert.strictEqual(j.reazon_gate, true, j.reazon_msg);
        assert.ok(j.flush_lt_old, `expected fewer flushes than every-8, got ${j.flush_n}`);
        assert.strictEqual(j.has_wav2vec_release, true);
    });
});
