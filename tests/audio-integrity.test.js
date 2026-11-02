/**
 * Engine audio integrity (hole / backwards detection) + timeline stabilize helpers.
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

function runPy(code, env = {}) {
    const py = resolveEnginePython();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-aintegrity-'));
    const scriptPath = path.join(work, 'check.py');
    fs.writeFileSync(scriptPath, code, 'utf8');
    try {
        const r = spawnSync(py, [scriptPath], {
            encoding: 'utf8',
            env: { ...process.env, PYTHONUTF8: '1', ...env },
            timeout: 60000,
            windowsHide: true,
        });
        const out = `${r.stdout || ''}${r.stderr || ''}`;
        assert.strictEqual(r.status, 0, out);
        return String(r.stdout || '').trim();
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

describe('audio integrity', () => {
    it('find_timeline_breaks detects packet gaps and hidden overlong packets', () => {
        const raw = runPy(`
import json
from transub_engine.audio.audio_integrity import find_timeline_breaks, assess

# Contiguous packets: no findings
clean = find_timeline_breaks([0.0, 0.5, 1.0], [0.5, 0.5, 0.5])
# 2 s gap between packet end 0.5 and next start 2.5
gappy = find_timeline_breaks([0.0, 2.5], [0.5, 0.5])
# Hidden hole: one packet claims 3 s while typical packet length is 0.5
hidden = find_timeline_breaks(
    [0.0, 0.5, 1.0, 4.0],
    [0.5, 0.5, 3.0, 0.5],
)
# Backwards jump (also has a forward gap before the jump)
back = find_timeline_breaks([0.0, 5.0, 2.0], [0.5, 0.5, 0.5])
findings = assess({"n_audio": 1, "has_video": False}, [0.0, 2.5], [0.5, 0.5])
print(json.dumps({
    "clean": len(clean),
    "gap_kinds": [f.kind for f in gappy],
    "gap_size": gappy[0].size_s if gappy else 0,
    "hidden_kinds": [f.kind for f in hidden],
    "back_kinds": [f.kind for f in back],
    "assess_kinds": [f.kind for f in findings],
}))
`);
        const j = JSON.parse(raw);
        assert.strictEqual(j.clean, 0);
        assert.deepStrictEqual(j.gap_kinds, ['hole']);
        assert.ok(j.gap_size >= 1.9);
        assert.ok(j.hidden_kinds.includes('hole'));
        assert.ok(j.back_kinds.includes('backwards'));
        assert.ok(j.assess_kinds.includes('hole'));
    });

    it('stabilize_media_timeline writes 16 kHz mono wav with aresample async', function () {
        const ffmpegCandidates = [
            path.join(__dirname, '..', '_internal', 'bin', 'ffmpeg.exe'),
            path.join(__dirname, '..', 'transub-engine', '_internal', 'bin', 'ffmpeg.exe'),
        ];
        const ffmpeg = ffmpegCandidates.find((p) => fs.existsSync(p));
        if (!ffmpeg) this.skip();

        const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-stable-'));
        try {
            const raw = runPy(
                `
import json, os, struct, wave
from pathlib import Path
from transub_engine.audio.preprocess import stabilize_media_timeline
from transub_engine.ffmpeg_util import resolve_ffmpeg

assert resolve_ffmpeg(), "ffmpeg missing"
work = Path(os.environ["TRANSUB_STABLE_ROOT"])
sr = 16000
n = sr // 4
src = work / "tone.wav"
with wave.open(str(src), "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(struct.pack("<" + "h" * n, *([0] * n)))
out, stderr, dur = stabilize_media_timeline(str(src), out_dir=work / "out")
p = Path(out)
print(json.dumps({
    "exists": p.is_file(),
    "size": p.stat().st_size if p.is_file() else 0,
    "dur": dur,
    "name": p.name,
}))
`,
                {
                    TRANSUB_STABLE_ROOT: mediaRoot,
                    FFMPEG_BINARY: ffmpeg,
                }
            );
            const j = JSON.parse(raw);
            assert.strictEqual(j.exists, true);
            assert.ok(j.size >= 64);
            assert.ok(String(j.name).includes('stable'));
        } finally {
            fs.rmSync(mediaRoot, { recursive: true, force: true });
        }
    });
});
