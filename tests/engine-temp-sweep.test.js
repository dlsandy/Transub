/**
 * Engine job temp sweep (Python).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveEnginePython() {
    const root = path.join(__dirname, '..', 'transub-engine');
    const win = path.join(root, 'runtime', 'python.exe');
    if (fs.existsSync(win)) return win;
    return process.platform === 'win32' ? 'python' : 'python3';
}

describe('engine sweep_job_temps', () => {
    it('clears known prefixes and dedicated TRANSUB_ENGINE_TEMP root', () => {
        const py = resolveEnginePython();
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-py-sweep-'));
        const script = `
import os, tempfile
from pathlib import Path
from transub_engine.audio import sweep_job_temps

root = Path(os.environ["TRANSUB_ENGINE_TEMP"])
(root / "transub_audio_abc").mkdir()
(root / "random_third_party.tmp").write_text("x", encoding="utf-8")
(root / "parakeet_xyz").mkdir()
(root / "cohere_asr_xyz").mkdir()
out = sweep_job_temps()
left = sorted(p.name for p in root.iterdir())
print("REMOVED", out.get("removed"), "MODE", out.get("mode"), "LEFT", ",".join(left))
`;
        const scriptPath = path.join(work, 'sweep_check.py');
        fs.writeFileSync(scriptPath, script, 'utf8');
        try {
            const r = spawnSync(py, [scriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    TEMP: work,
                    TMP: work,
                    TMPDIR: work,
                    TRANSUB_ENGINE_TEMP: work,
                    PYTHONUTF8: '1',
                },
                timeout: 30000,
                windowsHide: true,
            });
            const out = `${r.stdout || ''}${r.stderr || ''}`;
            assert.strictEqual(r.status, 0, out);
            assert.ok(/MODE engine_temp_root/.test(out), out);
            assert.ok(/REMOVED [1-9]/.test(out), out);
            const left = fs.readdirSync(work);
            assert.deepStrictEqual(left, [], `expected empty work dir, got ${left.join(',')}`);
        } finally {
            fs.rmSync(work, { recursive: true, force: true });
        }
    });
});
