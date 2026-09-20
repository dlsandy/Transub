'use strict';

const assert = require('assert');
const {
    createEngineEnsureRunning,
    REQUIRED_HOST_KEYS,
} = require('../electron/engine-ensure-running');

function mockHost(overrides = {}) {
    const {
        proc: initialProc = null,
        baseUrl: initialBaseUrl = 'http://127.0.0.1:8765',
        batchRunning: initialBatchRunning = false,
        ...hostOverrides
    } = overrides;
    let proc = initialProc;
    let baseUrl = initialBaseUrl;
    let batchRunning = !!initialBatchRunning;
    const host = {
        getEngineProc: () => proc,
        setEngineProc: (p) => { proc = p; },
        getEngineBaseUrl: () => baseUrl,
        setEngineBaseUrl: (u) => { baseUrl = u; },
        getBatchRunning: () => batchRunning,
        mergeEngineOptions: (o) => o || {},
        resolveEngineInstallPath: (p) => p || '',
        DEFAULT_ENGINE_URL: 'http://127.0.0.1:8765',
        parseHostPort: () => ({ host: '127.0.0.1', port: 8765 }),
        stopEngineProcess: () => {},
        stopEngineProcessAndPort: () => {},
        killListenersOnPort: () => {},
        sleep: async () => {},
        getHealth: async () => ({ ok: false }),
        waitForHealthPoll: async () => ({ ok: false }),
        isApiCompatible: () => true,
        appendEngineLogLine: () => {},
        resolveEngineEntrypoints: () => null,
        getBundledEnginePath: () => '',
        injectFfmpegPathEnv: (env) => env,
        resetEngineLogFile: () => {},
        attachEngineProcessLogs: () => {},
        ...hostOverrides,
    };
    return { host, getProc: () => proc, setProc: (p) => { proc = p; } };
}

describe('engine-ensure-running', () => {
    it('exports createEngineEnsureRunning', () => {
        assert.strictEqual(typeof createEngineEnsureRunning, 'function');
        assert.ok(Array.isArray(REQUIRED_HOST_KEYS));
        assert.ok(REQUIRED_HOST_KEYS.length > 5);
    });

    it('throws without host', () => {
        assert.throws(() => createEngineEnsureRunning(null), /host required/);
        assert.throws(() => createEngineEnsureRunning(undefined), /host required/);
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createEngineEnsureRunning({ getEngineProc: () => null }),
            /incomplete host/,
        );
    });

    it('exports expected functions', () => {
        const api = createEngineEnsureRunning(mockHost().host);
        assert.strictEqual(typeof api.ensureEngineRunning, 'function');
        assert.strictEqual(typeof api.readEngineEnsurePolicy, 'function');
        assert.strictEqual(typeof api.isEngineChildAlive, 'function');
        assert.strictEqual(typeof api.waitForHealth, 'function');
    });

    it('isEngineChildAlive is false when child is null', () => {
        const { host } = mockHost({ proc: null });
        const { isEngineChildAlive } = createEngineEnsureRunning(host);
        assert.strictEqual(isEngineChildAlive(), false);
    });

    it('isEngineChildAlive is true for live child', () => {
        const { host } = mockHost({
            proc: { exitCode: null, killed: false, pid: 1 },
        });
        const { isEngineChildAlive } = createEngineEnsureRunning(host);
        assert.strictEqual(isEngineChildAlive(), true);
    });

    it('readEngineEnsurePolicy smoke when idle', () => {
        const { host } = mockHost({ proc: null, batchRunning: false });
        const { readEngineEnsurePolicy } = createEngineEnsureRunning(host);
        const policy = readEngineEnsurePolicy(false);
        assert.ok(policy && typeof policy === 'object');
        assert.strictEqual(typeof policy.allowKill, 'boolean');
        assert.strictEqual(policy.allowKill, true);
    });

    it('forceRestart fails closed when port stays healthy after kill', async () => {
        const logs = [];
        const { host } = mockHost({
            proc: { exitCode: null, killed: false, pid: 42 },
            batchRunning: false,
            getHealth: async () => ({ ok: true, data: { ok: true, apiVersion: '1' } }),
            appendEngineLogLine: (line) => { logs.push(String(line || '')); },
            resolveEngineEntrypoints: () => ({
                command: 'python',
                args: ['-m', 'transub_engine'],
                cwd: '.',
            }),
            mergeEngineOptions: (o) => ({ engineAutoStart: true, ...(o || {}) }),
        });
        const { ensureEngineRunning } = createEngineEnsureRunning(host);
        const result = await ensureEngineRunning({ forceRestart: true });
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.code, 'force_restart_port_busy');
        assert.ok(logs.some((l) => l.includes('强制重启失败')));
    });

    it('serializes concurrent ensureEngineRunning calls', async () => {
        let concurrent = 0;
        let maxConcurrent = 0;
        const { host } = mockHost({
            getHealth: async () => {
                concurrent += 1;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise((r) => setTimeout(r, 40));
                concurrent -= 1;
                return { ok: true, data: { ok: true, apiVersion: '1' } };
            },
        });
        const { ensureEngineRunning } = createEngineEnsureRunning(host);
        const [a, b, c] = await Promise.all([
            ensureEngineRunning({}),
            ensureEngineRunning({}),
            ensureEngineRunning({}),
        ]);
        assert.strictEqual(a.ok, true);
        assert.strictEqual(b.ok, true);
        assert.strictEqual(c.ok, true);
        assert.strictEqual(maxConcurrent, 1);
    });
});
