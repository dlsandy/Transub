const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

describe('engine remap_job_progress bands', () => {
    const py = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');

    it('keeps source cleanup before MT and leaves ~28% for translate', function () {
        if (!fs.existsSync(py)) {
            this.skip();
            return;
        }
        const script = `
from transub_engine.progress import remap_job_progress

def pct(task, stage, percent):
    return remap_job_progress(task, {"stage": stage, "percent": percent})["percent"]

asr = pct("translate_mt", "transcribe", 100)
repair = pct("translate_mt", "asr_semantic_repair", 50)
asr_cleanup = pct("translate_mt", "source_cleanup", 88)
polish = pct("translate_mt", "cleanup", 50)
mt0 = pct("translate_mt", "translate", 0)
mt50 = pct("translate_mt", "translate", 50)
mt100 = pct("translate_mt", "translate", 100)
save = pct("translate_mt", "save", 50)
qc = pct("translate_mt", "qc_fix", 50)

assert asr <= 65, asr
assert 62 <= repair <= 65, repair
assert 62 <= asr_cleanup <= 65, asr_cleanup
assert asr_cleanup < polish, (asr_cleanup, polish)
assert mt0 == 65, mt0
assert 70 < mt50 < 95, mt50
assert mt100 >= 95, mt100
assert 95 <= polish <= 97, polish
assert 97 <= save <= 98, save
assert 98 <= qc <= 100, qc
print("ok", asr, repair, asr_cleanup, polish, mt0, mt50, mt100, save, qc)
`;
        const res = spawnSync(py, ['-c', script], {
            encoding: 'utf8',
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONPATH: path.join(__dirname, '..', 'transub-engine', 'runtime', 'Lib', 'site-packages'),
            },
        });
        if (res.status !== 0) {
            throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
        }
        assert.match(String(res.stdout || ''), /ok/);
    });
});
