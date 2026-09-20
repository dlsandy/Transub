/**
 * VAD coverage / soft-AV preset contracts (no real media required).
 * Locks WhisperSeg sparse→full failover and FireRed soft-AV geometry.
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

/** Synthetic over-fragment metrics — product cue-rate budget for soft dialogue. */
function cueFragmentStats(cues, mediaDurationMs) {
    const list = Array.isArray(cues) ? cues : [];
    const durs = list.map((c) => Math.max(0, (Number(c.endMs) || 0) - (Number(c.startMs) || 0)));
    const sorted = durs.slice().sort((a, b) => a - b);
    const mid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const mediaMin = Math.max(0.001, (Number(mediaDurationMs) || 1) / 60000);
    return {
        count: list.length,
        medianMs: mid,
        cuesPerMin: list.length / mediaMin,
    };
}

describe('vad-coverage-contract', () => {
    it('WhisperSeg sparse clips force full transcribe; dense do not', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.vad.whisperseg import should_force_full_transcribe
sparse = [{'start': 10.0, 'end': 12.0}, {'start': 20.0, 'end': 21.0}]
dense = [{'start': float(i), 'end': float(i) + 5.0} for i in range(0, 3600, 20)]
hole = [
    {'start': 0.0, 'end': 5.0},
    {'start': 200.0, 'end': 205.0},
]
print(json.dumps({
    'force_sparse_2h': should_force_full_transcribe(sparse, duration_s=7200.0),
    'force_dense_1h': should_force_full_transcribe(dense, duration_s=3600.0),
    'force_big_hole': should_force_full_transcribe(hole, duration_s=400.0),
    'force_empty': should_force_full_transcribe([], duration_s=600.0),
    'skip_short': should_force_full_transcribe(sparse, duration_s=60.0),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.force_sparse_2h, true);
        assert.strictEqual(j.force_dense_1h, false);
        assert.strictEqual(j.force_big_hole, true);
        assert.strictEqual(j.force_empty, true);
        assert.strictEqual(j.skip_short, false);
    });

    it('FireRed soft-AV preset knobs stay at product contract', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.vad.firered_vad_seg import resolve_firered_params
# Anime Whisper + FireRed v3 soft-AV geometry
p = resolve_firered_params({
    'threshold': 0.45,
    'maxSingleSegmentMs': 5000,
    'minSpeechMs': 220,
    'minSilenceMs': 500,
    'speechPadMs': 80,
})
print(json.dumps(p))
`);
        const p = JSON.parse(out);
        assert.strictEqual(p.threshold, 0.45);
        assert.strictEqual(p.max_speech_s, 5);
        assert.ok(Math.abs(p.pad_s - 0.08) < 1e-6);
        assert.ok(Math.abs(p.min_speech_s - 0.22) < 1e-6);
    });

    it('TEN soft default threshold stays recall-biased', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.vad import ten_vad_seg
print(json.dumps({
    'default_threshold': getattr(ten_vad_seg, '_DEFAULT_THRESHOLD', None),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.default_threshold, 0.45);
    });

    it('Qwen TEN sparse islands force windowed fallback like WhisperSeg', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.vad.whisperseg import (
    classify_vad_coverage,
    should_force_full_transcribe,
)
# ~75 min of sparse islands on 2h11m media (NAAC-076-shaped hole at end)
sparse = [{'start': float(i), 'end': float(i) + 2.0} for i in range(0, 4500, 120)]
dense = [{'start': float(i), 'end': float(i) + 4.0} for i in range(0, 7200, 25)]
tail_hole = [
    {'start': 10.0, 'end': 15.0},
    {'start': 100.0, 'end': 105.0},
    {'start': 4500.0, 'end': 4505.0},
]
# Healthy spoken% (~12%) + tail hole >=90s (NAAC-076-like): hybrid holes, not full failover
healthy_holes = [{'start': float(i), 'end': float(i) + 4.0} for i in range(0, 5000, 20)]
print(json.dumps({
    'force_sparse_2h': should_force_full_transcribe(sparse, duration_s=7911.0),
    'force_dense': should_force_full_transcribe(dense, duration_s=7200.0),
    'force_tail_hole': should_force_full_transcribe(tail_hole, duration_s=7911.0),
    'class_sparse': classify_vad_coverage(sparse, duration_s=7911.0),
    'class_healthy_holes': classify_vad_coverage(healthy_holes, duration_s=7911.0),
    'force_healthy_holes': should_force_full_transcribe(healthy_holes, duration_s=7911.0),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.force_sparse_2h, true);
        assert.strictEqual(j.force_dense, false);
        assert.strictEqual(j.force_tail_hole, true);
        assert.strictEqual(j.class_sparse, 'empty');
        assert.strictEqual(j.class_healthy_holes, 'holes');
        assert.strictEqual(j.force_healthy_holes, false);
    });

    it('over-fragment budget flags micro-cue storms', () => {
        const storm = [];
        for (let i = 0; i < 120; i += 1) {
            const s = i * 500;
            storm.push({ startMs: s, endMs: s + 180, text: 'あっ' });
        }
        const bad = cueFragmentStats(storm, 60_000);
        assert.ok(bad.cuesPerMin > 80, `expected storm rate, got ${bad.cuesPerMin}`);
        assert.ok(bad.medianMs < 400);

        const normal = [
            { startMs: 0, endMs: 2200, text: '今日はいい天気ですね' },
            { startMs: 3000, endMs: 5500, text: 'ちょっと待ってください' },
            { startMs: 8000, endMs: 11000, text: 'わかりました' },
        ];
        const ok = cueFragmentStats(normal, 60_000);
        assert.ok(ok.cuesPerMin < 20);
        assert.ok(ok.medianMs >= 1000);
    });

    it('merge_short_neighbor_cues glues JA micro fragments', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.quality import merge_short_neighbor_cues
storm = []
t = 0.0
for i in range(12):
    storm.append({'start': t, 'end': t + 0.18, 'text': 'あっ'})
    t += 0.35
merged = merge_short_neighbor_cues(storm, max_gap_s=0.55, max_merged_duration_s=7.0)
phrase = [
    {'start': 0.0, 'end': 0.4, 'text': 'じゃあ'},
    {'start': 0.5, 'end': 1.2, 'text': 'つきます。'},
]
glued = merge_short_neighbor_cues(phrase, max_gap_s=0.55, max_merged_duration_s=7.0)
print(json.dumps({
    'storm_n': len(storm),
    'merged_n': len(merged),
    'glued_n': len(glued),
    'glued_text': glued[0]['text'] if glued else '',
}))
`);
        const j = JSON.parse(out);
        assert.ok(j.merged_n < j.storm_n, `expected merge, ${j.merged_n} vs ${j.storm_n}`);
        assert.strictEqual(j.glued_n, 1);
        assert.ok(String(j.glued_text).includes('じゃあ'));
        assert.ok(String(j.glued_text).includes('つきます'));
    });
});
