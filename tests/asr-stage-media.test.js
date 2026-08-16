/**
 * Long-ASR media staging (hardlink/copy) to survive temp cleaners.
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

describe('stage_media_for_long_asr', () => {
    it('keeps audio reachable after original path is unlinked (hardlink)', function () {
        if (process.platform !== 'win32') this.skip();
        const py = resolveEnginePython();
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-stage-'));
        const script = `
import json, os, tempfile
from pathlib import Path
from transub_engine.audio.preprocess import stage_media_for_long_asr

root = Path(os.environ["TRANSUB_STAGE_ROOT"])
src_dir = root / "transub_audio_x" / "denoise"
src_dir.mkdir(parents=True)
src = src_dir / "film.denoise.wav"
src.write_bytes(b"RIFF" + bytes([0]) * 200)
asr_work = root / "cohere_asr_y"
asr_work.mkdir()
staged = Path(stage_media_for_long_asr(str(src), asr_work))
src.unlink()
print(json.dumps({
    "staged_exists": staged.is_file(),
    "staged_size": staged.stat().st_size if staged.is_file() else 0,
    "src_gone": not src.exists(),
}))
`;
        const scriptPath = path.join(work, 'stage_check.py');
        fs.writeFileSync(scriptPath, script, 'utf8');
        try {
            const r = spawnSync(py, [scriptPath], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    TRANSUB_STAGE_ROOT: work,
                    PYTHONUTF8: '1',
                },
                timeout: 30000,
                windowsHide: true,
            });
            const out = `${r.stdout || ''}${r.stderr || ''}`;
            assert.strictEqual(r.status, 0, out);
            const j = JSON.parse(String(r.stdout || '').trim());
            assert.strictEqual(j.src_gone, true);
            assert.strictEqual(j.staged_exists, true);
            assert.ok(j.staged_size >= 64);
        } finally {
            fs.rmSync(work, { recursive: true, force: true });
        }
    });
});
