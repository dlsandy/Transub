/**
 * Whisper DTW word-timestamp defaults (engine).
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

describe('whisper word timestamps default', () => {
    it('stays off unless words/karaoke or explicit True', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.asr.whisper_fw import resolve_whisper_word_timestamps
from transub_engine.jobs import _resolve_word_timestamps
print(json.dumps({
    'fw_none': resolve_whisper_word_timestamps(False, None),
    'fw_false': resolve_whisper_word_timestamps(False, False),
    'fw_true': resolve_whisper_word_timestamps(False, True),
    'fw_words': resolve_whisper_word_timestamps(True, None),
    'job_none': _resolve_word_timestamps(False, None),
    'job_quality_false': _resolve_word_timestamps(False, None),
    'job_words': _resolve_word_timestamps(True, False),
    'job_explicit': _resolve_word_timestamps(False, True),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.fw_none, false);
        assert.strictEqual(j.fw_false, false);
        assert.strictEqual(j.fw_true, true);
        assert.strictEqual(j.fw_words, true);
        assert.strictEqual(j.job_none, false);
        assert.strictEqual(j.job_quality_false, false);
        assert.strictEqual(j.job_words, true);
        assert.strictEqual(j.job_explicit, true);
    });
});
