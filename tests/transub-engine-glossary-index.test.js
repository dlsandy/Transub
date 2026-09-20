/**
 * Python engine glossary index — correctness + large glossary smoke.
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

function runPy(script, timeout = 60000) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('transub-engine-glossary-index', () => {
    const canRun = process.platform === 'win32' && require('fs').existsSync(RUNTIME_PY);

    it('ASR name-safe + index cache', function () {
        if (!canRun) this.skip();
        const out = runPy(`
import json
from transub_engine.glossary import apply_asr_glossary_to_cues, clear_glossary_index_cache

clear_glossary_index_cache()
glossary = [
    {"wrong": "マイ", "correct": "舞", "blacklist": ["マイク"]},
]
cues = [{"start": 0, "end": 1, "text": "マイちゃん、こんにちは"}]
out, hits = apply_asr_glossary_to_cues(cues, glossary, asr_only=True, name_safe=True)
# second call hits index cache
out2, hits2 = apply_asr_glossary_to_cues(cues, glossary, asr_only=True, name_safe=True)
print(json.dumps({
    "text": out[0]["text"],
    "hits": hits,
    "hits2": hits2,
}, ensure_ascii=False))
`);
        const j = JSON.parse(out);
        assert.ok(j.text.includes('舞'));
        assert.ok(j.hits >= 1);
        assert.strictEqual(j.hits, j.hits2);
    });

    it('MT protect + enforce use indexed path', function () {
        if (!canRun) this.skip();
        const out = runPy(`
import json
from transub_engine.glossary import (
    apply_glossary_to_cues,
    restore_glossary_on_cues,
    enforce_glossary_on_cues,
    clear_glossary_index_cache,
)

clear_glossary_index_cache()
glossary = [
    {"src": "トミー", "tgt": "汤米", "stage": "mt"},
    {"src": "さくら", "tgt": "小樱", "stage": "mt"},
]
src = [{"start": 0, "end": 1, "text": "トミーとさくら"}]
protected, maps = apply_glossary_to_cues(src, glossary)
restored = restore_glossary_on_cues(
    [{"start": 0, "end": 1, "text": protected[0]["text"]}],
    maps,
)
zh = [{"start": 0, "end": 1, "text": "トミー和小樱"}]
forced = enforce_glossary_on_cues(src, zh, glossary)
print(json.dumps({
    "protected": protected[0]["text"],
    "mapLen": len(maps[0]),
    "restored": restored[0]["text"],
    "forced": forced[0]["text"],
}, ensure_ascii=False))
`);
        const j = JSON.parse(out);
        assert.ok(j.protected.includes('__GLOSS'));
        assert.ok(j.mapLen >= 2);
        assert.strictEqual(j.restored, '汤米と小樱');
        assert.ok(j.forced.includes('汤米'));
    });

    it('large glossary + many cues stays fast (indexed skips)', function () {
        if (!canRun) this.skip();
        const out = runPy(`
import json
import time
from transub_engine.glossary import apply_asr_glossary_to_cues, clear_glossary_index_cache

clear_glossary_index_cache()
# 3000 decoy terms + one real hit at end of alphabet
glossary = [{"wrong": f"zzz{i:04d}", "correct": f"ZZZ{i:04d}"} for i in range(3000)]
glossary.append({"wrong": "マイ", "correct": "舞"})
cues = [{"start": i, "end": i + 1, "text": "マイ、テスト"} for i in range(200)]
t0 = time.perf_counter()
out, hits = apply_asr_glossary_to_cues(cues, glossary, asr_only=True, name_safe=False)
elapsed = time.perf_counter() - t0
print(json.dumps({
    "cues": len(out),
    "hits": hits,
    "sample": out[0]["text"],
    "elapsedMs": round(elapsed * 1000),
}, ensure_ascii=False))
`, 120000);
        const j = JSON.parse(out);
        assert.strictEqual(j.cues, 200);
        assert.ok(j.hits >= 200);
        assert.ok(j.sample.includes('舞'));
        // 3000 terms × 200 cues naive would be very slow; indexed should finish quickly
        assert.ok(j.elapsedMs < 15000, `expected <15s, got ${j.elapsedMs}ms`);
    });
});
