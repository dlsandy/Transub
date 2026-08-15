const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('engine-resume-mt', () => {
    const {
        planResumeMt,
        buildResumeMtOverrides,
    } = require('../electron/engine-resume-mt');
    const { usesExternalMt, mapTaskToEngineTask } = require('../electron/engine-options');

    it('plans smart-translate resume as external MT', () => {
        const plan = planResumeMt({
            task: 'translate',
            smartTranslate: true,
            language: 'ja',
            engineMtModel: 'opus-mt-ja-zh',
        }, {
            usesExternalMt,
            mapTaskToEngineTask,
            isLlmMtId: () => false,
        });
        assert.strictEqual(plan.useExternalMt, true);
        assert.strictEqual(plan.useSmartTranslate, true);
        assert.strictEqual(plan.engineTask, 'translate_mt');
    });

    it('builds overrides with fresh mtExternal URL', () => {
        const built = buildResumeMtOverrides({
            useExternalMt: true,
            useSmartTranslate: true,
            fileMerged: { releaseGpuAfter: true },
            mtAdapter: {
                ok: true,
                url: 'http://127.0.0.1:2600/translate',
                token: 'tok',
                mtExternal: ({ batchSize, timeoutSec }) => ({
                    url: 'http://127.0.0.1:2600/translate',
                    batchSize,
                    timeoutSec,
                    headers: { Authorization: 'Bearer tok' },
                }),
            },
        });
        assert.strictEqual(built.ok, true);
        assert.strictEqual(built.overrides.mtBackend, 'external');
        assert.strictEqual(built.overrides.mtExternal.url, 'http://127.0.0.1:2600/translate');
        assert.strictEqual(built.overrides.mtExternal.batchSize, 40);
        assert.strictEqual(built.overrides.mtModel, null);
    });

    it('fails clearly when adapter missing', () => {
        const built = buildResumeMtOverrides({
            useExternalMt: true,
            useSmartTranslate: true,
            mtAdapter: { ok: false, error: 'adapter down' },
        });
        assert.strictEqual(built.ok, false);
        assert.match(built.error, /adapter down|适配器/);
    });
});

describe('checkpoint mtBackend preserve', () => {
    it('keeps mtBackend/mtExternal in _safe_request', () => {
        // Import via python so we test the installed engine module the app actually runs.
        const { spawnSync } = require('child_process');
        const py = path.join(
            __dirname,
            '..',
            'transub-engine',
            'runtime',
            'python.exe',
        );
        if (!fs.existsSync(py)) {
            // Skip on machines without vendored runtime.
            return;
        }
        const script = `
from transub_engine.checkpoint import _safe_request, build_resume_request
req = {
  "task": "translate_mt",
  "mediaPath": "x.mp4",
  "language": "ja",
  "asrModel": "anime-whisper",
  "mtBackend": "external",
  "mtExternal": {"url": "http://127.0.0.1:9/t", "timeoutSec": 60, "batchSize": 8, "headers": {}},
  "secret": "drop-me",
}
safe = _safe_request(req)
assert safe.get("mtBackend") == "external", safe
assert isinstance(safe.get("mtExternal"), dict), safe
assert "secret" not in safe
ckpt = {"id": "abc", "stage": "asr_done", "request": safe, "sourceCues": [{"index":0,"text":"a"}], "zhCues": None}
out = build_resume_request(ckpt)
assert out["mtBackend"] == "external"
assert out["mtExternal"]["url"].startswith("http")
print("ok")
`;
        const tmp = path.join(os.tmpdir(), `ckpt-mt-${Date.now()}.py`);
        fs.writeFileSync(tmp, script, 'utf8');
        try {
            const res = spawnSync(py, ['-c', `exec(open(r'''${tmp}''', encoding='utf-8').read())`], {
                encoding: 'utf8',
                cwd: path.join(__dirname, '..', 'transub-engine'),
            });
            assert.strictEqual(res.status, 0, res.stderr || res.stdout);
            assert.match(String(res.stdout || ''), /ok/);
        } finally {
            try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        }
    });
});
