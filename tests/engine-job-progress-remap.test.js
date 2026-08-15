const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

describe('engine remap_job_progress bands', () => {
    const py = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');

    it('keeps cleanup before MT and leaves ~28% for translate', function () {
        if (!fs.existsSync(py)) {
            this.skip();
            return;
        }
        const script = `
from transub_engine.progress import remap_job_progress

def pct(task, stage, percent):
    return remap_job_progress(task, {"stage": stage, "percent": percent})["percent"]

# Cleanup must not jump past the MT band start (was 90–95 and froze the bar).
assert pct("translate_mt", "cleanup", 88) < pct("translate_mt", "translate", 1), (
    pct("translate_mt", "cleanup", 88), pct("translate_mt", "translate", 1)
)
assert pct("translate_mt", "cleanup", 100) <= 67
assert pct("translate_mt", "translate", 0) >= 68
assert pct("translate_mt", "translate", 100) >= 95
assert pct("translate_mt", "translate", 100) <= 96

# Monotonic: ASR end → cleanup → MT mid → MT end → save
asr = pct("translate_mt", "transcribe", 100)
cleanup = pct("translate_mt", "cleanup", 100)
mt0 = pct("translate_mt", "translate", 1)
mt50 = pct("translate_mt", "translate", 50)
mt100 = pct("translate_mt", "translate", 100)
save = pct("translate_mt", "save", 50)
assert asr <= cleanup < mt0 < mt50 < mt100 <= 96
assert save >= 96
# MT band width ≈ 25–30 points
assert 25 <= (mt100 - mt0) <= 30, (mt0, mt100)
print("ok", asr, cleanup, mt0, mt50, mt100, save)
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
