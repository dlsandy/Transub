/**
 * Smoke that Python job_pipeline extract keeps critical symbols resolvable.
 * Runs via bundled engine interpreter (no full ASR).
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const enginePy = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    process.platform === 'win32' ? 'python.exe' : 'bin/python',
);

const pyScriptPath = path.join(__dirname, 'fixtures', 'job_pipeline_extract_smoke.py');

describe('job_pipeline extract', () => {
    it('AST clean + resume-MT path resolves BACKEND_* / beam_size', () => {
        assert.ok(fs.existsSync(enginePy), `missing ${enginePy}`);
        assert.ok(fs.existsSync(pyScriptPath), `missing ${pyScriptPath}`);
        const site = path.join(
            __dirname,
            '..',
            'transub-engine',
            'runtime',
            'Lib',
            'site-packages',
        );
        const r = spawnSync(enginePy, [pyScriptPath], {
            encoding: 'utf8',
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, PYTHONPATH: site },
            timeout: 90000,
        });
        if (r.status !== 0) {
            console.error(r.stdout);
            console.error(r.stderr);
        }
        assert.strictEqual(r.status, 0, r.stderr || r.stdout || 'python smoke failed');
        assert.match(String(r.stdout || ''), /RESUME_MT_OK/);
    });
});
