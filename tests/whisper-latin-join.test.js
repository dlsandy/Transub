/**
 * Regression: Whisper Latin word tokens must keep spaces when joined.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

describe('whisper latin word join', () => {
    it('preserves spaces for leading-space and stripped tokens', function () {
        const engineRoot = path.join(__dirname, '..', 'transub-engine', 'runtime', 'Lib', 'site-packages');
        const py = `
import sys
sys.path.insert(0, r${JSON.stringify(engineRoot)})
from transub_engine.asr.whisper_fw import _join_whisper_words, normalize_whisper_text

a = _join_whisper_words(["my", " name", " is", " Peter", " Parker"])
assert a == "my name is Peter Parker", a

b = _join_whisper_words(["my", "name", "is", "Peter", "Parker"])
assert b == "my name is Peter Parker", b

c = _join_whisper_words(["I", "'m", "pretty", ",", "sure"])
assert c == "I'm pretty, sure", c

d = _join_whisper_words(["don't", "really", "talk"])
assert d == "don't really talk", d

e = _join_whisper_words(["私", "の", "名前"])
assert e == "私の名前", e

assert normalize_whisper_text("All right , let ' s") == "All right, let's"
print("ok")
`;
        const candidates = [];
        if (process.env.TRANSUB_ENGINE_PYTHON) candidates.push(process.env.TRANSUB_ENGINE_PYTHON);
        candidates.push('py', 'python', 'python3');
        let r = null;
        for (const bin of candidates) {
            const args = bin === 'py' ? ['-3', '-c', py] : ['-c', py];
            r = spawnSync(bin, args, {
                encoding: 'utf8',
                env: { ...process.env, PYTHONPATH: engineRoot },
                windowsHide: true,
            });
            if (r.error && (r.error.code === 'ENOENT' || /not found/i.test(String(r.error)))) {
                continue;
            }
            // Windows missing python often exits 9009 with empty stderr.
            if (r.status === 9009) continue;
            break;
        }
        if (!r || r.status === 9009 || (r.error && r.error.code === 'ENOENT')) {
            this.skip();
            return;
        }
        if (r.status !== 0) {
            assert.fail((r.stderr || r.stdout || 'python failed').toString());
        }
        assert.ok(String(r.stdout || '').includes('ok'));
    });
});
