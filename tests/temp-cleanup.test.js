const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    applyEngineTempEnv,
    clearEngineWorkTemp,
    cleanupAfterJob,
    getEngineWorkTempRoot,
    sweepElectronJobTemps,
    ELECTRON_JOB_TEMP_PREFIXES,
} = require('../electron/temp-cleanup');

describe('temp-cleanup', () => {
    it('applyEngineTempEnv redirects TEMP/TMP/TMPDIR to engine-work', () => {
        const env = applyEngineTempEnv({ PATH: 'C:\\x', FOO: '1' });
        const root = getEngineWorkTempRoot();
        assert.strictEqual(env.TEMP, root);
        assert.strictEqual(env.TMP, root);
        assert.strictEqual(env.TMPDIR, root);
        assert.strictEqual(env.TRANSUB_ENGINE_TEMP, root);
        assert.strictEqual(env.FOO, '1');
        assert.ok(fs.existsSync(root));
    });

    it('clearEngineWorkTemp removes children', () => {
        const root = getEngineWorkTempRoot();
        fs.mkdirSync(root, { recursive: true });
        const nested = path.join(root, `sweep-test-${Date.now()}`);
        fs.mkdirSync(nested, { recursive: true });
        fs.writeFileSync(path.join(nested, 'a.txt'), 'x', 'utf8');
        const out = clearEngineWorkTemp();
        assert.strictEqual(out.ok, true);
        assert.ok(out.removed >= 1);
        assert.ok(!fs.existsSync(nested));
    });

    it('sweepElectronJobTemps removes matching prefixes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-cleanup-harness-'));
        try {
            const victim = path.join(dir, `${ELECTRON_JOB_TEMP_PREFIXES[0]}abc`);
            fs.mkdirSync(victim, { recursive: true });
            fs.writeFileSync(path.join(victim, 'clip.wav'), 'x', 'utf8');
            const keep = path.join(dir, 'other-app-tmp');
            fs.mkdirSync(keep, { recursive: true });
            const out = sweepElectronJobTemps({ tmpDir: dir });
            assert.strictEqual(out.ok, true);
            assert.strictEqual(out.removed, 1);
            assert.ok(!fs.existsSync(victim));
            assert.ok(fs.existsSync(keep));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('cleanupAfterJob returns counts', () => {
        const out = cleanupAfterJob();
        assert.ok(out);
        assert.ok(typeof out.engineRemoved === 'number');
        assert.ok(typeof out.electronRemoved === 'number');
    });
});
