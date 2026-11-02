const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const RUNTIME_PY = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    const lines = String(res.stdout || '').trim().split(/\r?\n/).filter(Boolean);
    return JSON.parse(lines[lines.length - 1]);
}

describe('qwen3 TEN island grouping', () => {
    it('does not pack TEN islands with FireRed merge-gap', function () {
        if (process.platform !== 'win32') this.skip();
        const j = runPy(`
import json
from transub_engine.asr.qwen3_island import _qwen_island_group_params
vad = {"minSilenceMs": 280, "maxSingleSegmentMs": 4000, "speechPadMs": 120, "threshold": 0.30}
ten = _qwen_island_group_params("ten", vad, demucs_active=False)
fr = _qwen_island_group_params("firered", vad, demucs_active=False)
print(json.dumps({"ten": list(ten), "fr": list(fr)}))
`);
        assert.ok(j.ten[0] <= 0.16, j.ten);
        assert.ok(j.ten[0] < j.fr[0], j);
        assert.ok(j.fr[0] >= 0.22, j.fr);
        assert.ok(j.ten[1] <= 5.0);
    });

    it('drops leftover 身長が175cm echo next to the full intro cue', function () {
        if (process.platform !== 'win32') this.skip();
        const j = runPy(`
import json
from transub_engine.asr.qwen3_cues import _cue_text_is_echo, _dedupe_overlap_cues
cues = [
    {"start": 86.07, "end": 87.48, "text": "東北出身で、身長が175cm"},
    {"start": 89.04, "end": 90.96, "text": "身長が175センチ"},
    {"start": 90.98, "end": 91.91, "text": "レンチの"},
    {"start": 92.00, "end": 93.20, "text": "センチのFカップです…"},
]
out = _dedupe_overlap_cues(cues)
print(json.dumps({
    "echo": _cue_text_is_echo("身長が175cm", "東北出身で、身長が175cm"),
    "echo_centi": _cue_text_is_echo("身長が175センチ", "東北出身で、身長が175cm"),
    "shard": _cue_text_is_echo("レンチの", "東北出身で、身長が175cm"),
    "keep_f": _cue_text_is_echo("センチのFカップです", "東北出身で、身長が175cm"),
    "texts": [c["text"] for c in out],
}))
`);
        assert.strictEqual(j.echo, true);
        assert.strictEqual(j.echo_centi, true);
        assert.strictEqual(j.shard, true);
        assert.strictEqual(j.keep_f, false);
        assert.deepStrictEqual(j.texts, [
            '東北出身で、身長が175cm',
            'センチのFカップです…',
        ]);
    });

    it('glues leftover のセンチのFカップ onto the intro across えー', function () {
        if (process.platform !== 'win32') this.skip();
        const j = runPy(`
import json
from transub_engine.asr.qwen3_cues import _dedupe_overlap_cues
from transub_engine.asr.speech_spans import _split_frame_text_chunks
cues = [
    {"start": 86.07, "end": 87.48, "text": "東北出身で、身長が175cm"},
    {"start": 87.84, "end": 88.93, "text": "えー…"},
    {"start": 90.98, "end": 93.15, "text": "のセンチのFカップです…"},
]
out = _dedupe_overlap_cues(cues)
out2 = _dedupe_overlap_cues([
    {"start": 86.07, "end": 89.40, "text": "東北出身で、身長が175cm"},
    {"start": 89.44, "end": 93.15, "text": "えー…のセンチのFカップです…"},
])
print(json.dumps({
    "texts": [c["text"] for c in out],
    "n": len(out),
    "texts2": [c["text"] for c in out2],
    "n2": len(out2),
    "comma": _split_frame_text_chunks("東北出身で、身長が175cm"),
}))
`);
        assert.strictEqual(j.n, 1);
        assert.ok(j.texts[0].includes('175cm'));
        assert.ok(j.texts[0].includes('Fカップ'));
        assert.ok(!/^の/.test(j.texts[0]), j.texts[0]);
        assert.strictEqual(j.n2, 1);
        assert.ok(j.texts2[0].includes('Fカップ'));
        assert.ok(!j.texts2[0].includes('のセンチ'), j.texts2[0]);
        assert.strictEqual(j.comma.length, 1);
    });

    it('keeps polite ていただく and て+大変だ as one cue', function () {
        if (process.platform !== 'win32') this.skip();
        const j = runPy(`
import json
from transub_engine.asr.qwen3_cues import _dedupe_overlap_cues
from transub_engine.asr.speech_spans import _split_frame_text_chunks
from transub_engine.asr.cue_retime import _split_overlong_punct_cues, ensure_readable_cue_timings
sase = _dedupe_overlap_cues([
    {"start": 53.50, "end": 56.40, "text": "当店は120分以上のみのコースとさせてい"},
    {"start": 56.42, "end": 57.58, "text": "ただいております"},
])
chg = _dedupe_overlap_cues([
    {"start": 67.69, "end": 69.41, "text": "ナミちゃんも生活環境が変わって"},
    {"start": 69.45, "end": 70.44, "text": "大変だと思うけど"},
])
qkeep = _dedupe_overlap_cues([
    {"start": 1.0, "end": 2.0, "text": "じゃないの?"},
    {"start": 2.05, "end": 3.2, "text": "でも前ずっと"},
])
tte = _dedupe_overlap_cues([
    {"start": 190.34, "end": 191.49, "text": "好きなだけ触って"},
    {"start": 191.53, "end": 192.65, "text": "ってくださいね…"},
])
tte_ol = _split_overlong_punct_cues([
    {"start": 190.34, "end": 193.5, "text": "好きなだけ触ってってくださいね…"},
])
merged = [{"start": 67.69, "end": 70.44, "text": "ナミちゃんも生活環境が変わって大変だと思うけど"}]
print(json.dumps({
    "sase": [c["text"] for c in sase],
    "chg": [c["text"] for c in chg],
    "q": [c["text"] for c in qkeep],
    "tte": [c["text"] for c in tte],
    "tte_ol_n": len(tte_ol),
    "chunks": _split_frame_text_chunks("当店は120分以上のみのコースとさせていただいております"),
    "overlong_n": len(_split_overlong_punct_cues(merged)),
    "readable_n": len(ensure_readable_cue_timings(merged, stretch_to_reading_rate=False)),
}))
`);
        assert.strictEqual(j.sase.length, 1);
        assert.ok(j.sase[0].includes('ただいて'));
        assert.strictEqual(j.chg.length, 1);
        assert.ok(j.chg[0].includes('大変だ'));
        assert.strictEqual(j.q.length, 2);
        assert.strictEqual(j.tte.length, 1);
        assert.strictEqual(j.tte_ol_n, 1);
        assert.strictEqual(j.chunks.length, 1);
        assert.strictEqual(j.overlong_n, 1);
        assert.strictEqual(j.readable_n, 1);
    });
});
