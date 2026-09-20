const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const {
    acquireComputeLockSync,
    releaseComputeLockSync,
    getComputeStatusSync,
} = require('../electron/engine-compute-client');
const lock = require('../electron/compute-task-lock');

const MOCK_JS = path.join(__dirname, 'fixtures', 'mock-compute-lock-server.js');

function startMockProcess(port = 0) {
    // port 0 → pick free; child prints "ready <port>"
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [MOCK_JS, String(port || 0)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let buf = '';
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('mock server start timeout'));
        }, 5000);
        child.stdout.on('data', (d) => {
            buf += d.toString('utf8');
            const m = buf.match(/ready\s+(\d+)/);
            if (m) {
                clearTimeout(timer);
                resolve({
                    child,
                    baseUrl: `http://127.0.0.1:${m[1]}`,
                    stop: () => {
                        try { child.kill(); } catch (_) { /* ignore */ }
                    },
                });
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.stderr.on('data', () => { /* ignore */ });
    });
}

describe('engine-compute-client + compute-task-lock engine path', () => {
    afterEach(() => {
        lock.forceRelease();
        lock.__resetEngineLockCacheForTests?.();
    });

    it('sync acquire/release against separate mock engine process', async () => {
        const mock = await startMockProcess(0);
        try {
            // Give listen a tick (ready already printed after listen)
            await new Promise((r) => setTimeout(r, 50));
            const a = acquireComputeLockSync(mock.baseUrl, { kind: 'engine_batch', owner: 'A' });
            assert.strictEqual(a.ok, true, a.error || JSON.stringify(a));
            assert.strictEqual(a.data?.token, 'tok-1');
            const busy = acquireComputeLockSync(mock.baseUrl, { kind: 'sakura_translate' });
            assert.strictEqual(busy.ok, false);
            assert.ok((busy.data?.code || busy.code) === 'compute_busy');
            const st = getComputeStatusSync(mock.baseUrl);
            assert.strictEqual(st.data?.busy, true);
            const rel = releaseComputeLockSync(mock.baseUrl, 'tok-1');
            assert.strictEqual(rel.ok, true);
            assert.strictEqual(getComputeStatusSync(mock.baseUrl).data?.busy, false);
        } finally {
            mock.stop();
        }
    });

    it('compute-task-lock uses engine when base URL pinned', async () => {
        const mock = await startMockProcess(0);
        try {
            await new Promise((r) => setTimeout(r, 50));
            lock.setEngineLockBaseUrl(mock.baseUrl);
            const a = lock.tryAcquire({ kind: 'engine_batch', owner: '引擎' });
            assert.strictEqual(a.ok, true);
            assert.strictEqual(a.via, 'engine');
            const b = lock.tryAcquire({ kind: 'advanced_smart_translate', owner: 'Pro' });
            assert.strictEqual(b.ok, false);
            assert.strictEqual(b.code, 'compute_busy');
            assert.strictEqual(lock.release(a.token).ok, true);
            assert.strictEqual(lock.getStatus().busy, false);
        } finally {
            mock.stop();
        }
    });
});
