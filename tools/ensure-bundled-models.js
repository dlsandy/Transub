/**
 * Ensure small shipped-with-app engine models exist before packaging.
 * Ships: whisper-tiny (LID / smoke) + fsmn-vad (default VAD). Other weights stay on-demand.
 *
 * Usage:
 *   node tools/ensure-bundled-models.js
 *   node tools/ensure-bundled-models.js --check   # exit 1 if missing (no download)
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const engineRoot = path.join(root, 'transub-engine');
const pythonExe = path.join(engineRoot, 'runtime', 'python.exe');

/** @type {{ id: string, kind: string, hubId: string, marker: string }[]} */
const SHIPPED = [
    {
        id: 'whisper-tiny',
        kind: 'asr',
        hubId: 'Systran/faster-whisper-tiny',
        marker: 'model.bin',
    },
    {
        id: 'fsmn-vad',
        kind: 'vad',
        hubId: 'alextomcat/speech_fsmn_vad_zh-cn-16k-common-pytorch',
        marker: 'model.pt',
    },
];

const checkOnly = process.argv.includes('--check');

function modelDir(entry) {
    return path.join(engineRoot, 'models', entry.kind, entry.id);
}

function isReady(entry) {
    const marker = path.join(modelDir(entry), entry.marker);
    try {
        return fs.existsSync(marker) && fs.statSync(marker).size > 1024;
    } catch {
        return false;
    }
}

function downloadMissing(missing) {
    if (!fs.existsSync(pythonExe)) {
        console.error(`[ensure-bundled-models] missing engine python: ${pythonExe}`);
        process.exit(1);
    }
    const payload = JSON.stringify(
        missing.map((e) => ({
            hubId: e.hubId,
            dest: modelDir(e).replace(/\\/g, '/'),
            id: e.id,
        })),
    );
    // Weights only — do not go through models download (that also pip-installs ASR extras).
    const py = `
import json, os, sys
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_ENDPOINT", os.environ.get("HF_ENDPOINT") or "https://hf-mirror.com")
from huggingface_hub import snapshot_download
import huggingface_hub.constants as hf_c
ep = os.environ["HF_ENDPOINT"].rstrip("/")
hf_c.ENDPOINT = ep
items = json.loads(sys.argv[1])
for it in items:
    dest = it["dest"]
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"[ensure-bundled-models] downloading {it['id']} -> {dest}", flush=True)
    snapshot_download(repo_id=it["hubId"], local_dir=dest)
    print(f"[ensure-bundled-models] ok {it['id']}", flush=True)
`;
    const result = spawnSync(pythonExe, ['-c', py, payload], {
        cwd: engineRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            HF_HUB_DISABLE_XET: '1',
            HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
        },
        maxBuffer: 20 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
        console.error('[ensure-bundled-models] download failed');
        process.exit(result.status || 1);
    }
}

function main() {
    const missing = SHIPPED.filter((e) => !isReady(e));
    if (!missing.length) {
        console.log('[ensure-bundled-models] whisper-tiny + fsmn-vad already present');
        return;
    }
    const names = missing.map((e) => e.id).join(', ');
    if (checkOnly) {
        console.error(`[ensure-bundled-models] missing shipped models: ${names}`);
        process.exit(1);
    }
    console.log(`[ensure-bundled-models] fetching: ${names}`);
    downloadMissing(missing);
    const still = SHIPPED.filter((e) => !isReady(e));
    if (still.length) {
        console.error(
            `[ensure-bundled-models] still incomplete: ${still.map((e) => e.id).join(', ')}`,
        );
        process.exit(1);
    }
    console.log('[ensure-bundled-models] ready');
}

main();
