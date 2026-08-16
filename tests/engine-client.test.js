const assert = require('assert');
const http = require('http');
const {
    getHealth,
    getCapabilities,
    createJob,
    getJob,
    waitJob,
    listModels,
    recommendModels,
    engineFetch,
    formatEngineNetworkError,
    isRetryableEngineNetworkResult,
} = require('../electron/engine-client');

function startMockEngine() {
    const jobs = new Map();
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const send = (code, obj) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
        };
        if (url.pathname === '/v1/health') {
            return send(200, { ok: true, apiVersion: '1.0.0', engineVersion: '0.1.0', stub: true });
        }
        if (url.pathname === '/v1/capabilities') {
            return send(200, { ok: true, tasks: ['transcribe', 'translate_mt', 'dual'], apiVersion: '1.0.0' });
        }
        if (url.pathname === '/v1/models') {
            return send(200, { ok: true, models: [{ id: 'sensevoice-small', installed: true }], profiles: {} });
        }
        if (url.pathname === '/v1/models/recommend' && req.method === 'POST') {
            return send(200, {
                ok: true,
                profile: 'balanced',
                models: { asrModel: 'sensevoice-small' },
            });
        }
        if (url.pathname === '/v1/jobs' && req.method === 'POST') {
            const id = `job${jobs.size + 1}`;
            jobs.set(id, { status: 'queued', ticks: 0 });
            return send(200, { ok: true, id, status: 'queued' });
        }
        const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
        if (jobMatch && req.method === 'GET') {
            const id = jobMatch[1];
            const job = jobs.get(id);
            if (!job) return send(404, { ok: false, message: 'not found' });
            job.ticks += 1;
            if (job.ticks >= 2) {
                job.status = 'done';
                job.result = {
                    task: 'transcribe',
                    outputs: [{ role: 'source', path: 'C:/tmp/a.srt' }],
                };
            } else {
                job.status = 'running';
            }
            return send(200, { ok: true, id, status: job.status, result: job.result || null });
        }
        return send(404, { ok: false });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

describe('engine-client against mock HTTP', () => {
    /** @type {{ server: import('http').Server, baseUrl: string }} */
    let mock;

    beforeAll(async () => {
        mock = await startMockEngine();
    });

    afterAll(async () => {
        await new Promise((r) => mock.server.close(r));
    });

    it('reads health and capabilities', async () => {
        const health = await getHealth(mock.baseUrl);
        assert.strictEqual(health.ok, true);
        assert.strictEqual(health.data.apiVersion, '1.0.0');
        const caps = await getCapabilities(mock.baseUrl);
        assert.ok(caps.data.tasks.includes('translate_mt'));
    });

    it('lists and recommends models', async () => {
        const models = await listModels(mock.baseUrl);
        assert.strictEqual(models.ok, true);
        assert.strictEqual(models.data.models[0].id, 'sensevoice-small');
        const rec = await recommendModels(mock.baseUrl, { hasCuda: true, vramMb: 8000 });
        assert.strictEqual(rec.data.profile, 'balanced');
    });

    it('creates and waits for job completion', async () => {
        const created = await createJob(mock.baseUrl, {
            task: 'transcribe',
            mediaPath: 'C:/tmp/a.wav',
        });
        assert.strictEqual(created.ok, true);
        assert.ok(created.data.id);
        const waited = await waitJob(mock.baseUrl, created.data.id, { intervalMs: 20, timeoutMs: 2000 });
        assert.strictEqual(waited.ok, true);
        assert.strictEqual(waited.data.status, 'done');
        assert.ok(waited.data.result.outputs[0].path);
    });

    it('golden path: translate_mt job returns dual-ready outputs', async () => {
        const created = await createJob(mock.baseUrl, {
            task: 'translate_mt',
            mediaPath: 'C:/tmp/b.wav',
            mtBackend: 'opus',
        });
        assert.strictEqual(created.ok, true);
        const waited = await waitJob(mock.baseUrl, created.data.id, { intervalMs: 20, timeoutMs: 2000 });
        assert.strictEqual(waited.ok, true);
        assert.strictEqual(waited.data.status, 'done');
        assert.ok(Array.isArray(waited.data.result.outputs));
        assert.ok(waited.data.result.outputs.length >= 1);
        // External MT adapter dryRun is covered in engine-mt-adapter.test.js;
        // this skeleton locks the Engine HTTP job contract used by engine-bridge.
    });

    it('maps fetch AbortError to Chinese timeout instead of throwing', async () => {
        const server = http.createServer((_req, _res) => {
            // Intentionally never respond — forces client-side abort/timeout.
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        try {
            const res = await engineFetch(`http://127.0.0.1:${port}`, '/v1/health', { timeoutMs: 50 });
            assert.strictEqual(res.ok, false);
            assert.strictEqual(res.code, 'timeout');
            assert.strictEqual(res.error, '请求超时');
            assert.ok(!/this operation was aborted/i.test(String(res.error || '')));
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('maps outer abort signal to cancelled', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        const res = await engineFetch(mock.baseUrl, '/v1/health', { signal: ctrl.signal, timeoutMs: 5000 });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'cancelled');
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(res.error, '已取消');
    });

    it('retries through structured poll timeouts until job completes', async () => {
        let polls = 0;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            const send = (code, obj) => {
                res.writeHead(code, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(obj));
            };
            if (url.pathname === '/v1/jobs' && req.method === 'POST') {
                return send(200, { ok: true, id: 'retry1', status: 'queued' });
            }
            const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
            if (jobMatch && req.method === 'GET') {
                polls += 1;
                if (polls < 3) {
                    // Never respond: short pollTimeoutMs → structured timeout → waitJob retries.
                    return;
                }
                return send(200, {
                    ok: true,
                    id: jobMatch[1],
                    status: 'done',
                    result: { outputs: [{ path: 'C:/tmp/b.srt' }] },
                });
            }
            return send(404, { ok: false });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}`;
        try {
            const created = await createJob(baseUrl, { task: 'transcribe', mediaPath: 'C:/tmp/b.wav' });
            assert.strictEqual(created.ok, true);
            const waited = await waitJob(baseUrl, created.data.id, {
                intervalMs: 10,
                timeoutMs: 5000,
                pollTimeoutMs: 40,
            });
            assert.strictEqual(waited.ok, true);
            assert.strictEqual(waited.data.status, 'done');
            assert.ok(polls >= 3);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('allows jobs longer than idle window while engine keeps responding', async () => {
        let polls = 0;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            const send = (code, obj) => {
                res.writeHead(code, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(obj));
            };
            if (url.pathname === '/v1/jobs' && req.method === 'POST') {
                return send(200, { ok: true, id: 'long1', status: 'queued' });
            }
            const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
            if (jobMatch && req.method === 'GET') {
                polls += 1;
                if (polls < 6) {
                    return send(200, {
                        ok: true,
                        id: jobMatch[1],
                        status: 'running',
                        progress: { stage: 'asr', percent: polls * 10, detail: `tick ${polls}` },
                    });
                }
                return send(200, {
                    ok: true,
                    id: jobMatch[1],
                    status: 'done',
                    result: { outputs: [{ path: 'C:/tmp/long.srt' }] },
                });
            }
            return send(404, { ok: false });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}`;
        try {
            const created = await createJob(baseUrl, { task: 'transcribe', mediaPath: 'C:/tmp/long.wav' });
            assert.strictEqual(created.ok, true);
            const started = Date.now();
            const waited = await waitJob(baseUrl, created.data.id, {
                intervalMs: 40,
                idleTimeoutMs: 80,
                pollTimeoutMs: 1000,
            });
            assert.strictEqual(waited.ok, true);
            assert.strictEqual(waited.data.status, 'done');
            // Wall time exceeds idle window; success proves idle (not absolute) timeout.
            assert.ok(Date.now() - started > 80);
            assert.ok(polls >= 6);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('fails when engine stops responding for longer than idleTimeoutMs', async () => {
        let polls = 0;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            const send = (code, obj) => {
                res.writeHead(code, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(obj));
            };
            if (url.pathname === '/v1/jobs' && req.method === 'POST') {
                return send(200, { ok: true, id: 'idle1', status: 'queued' });
            }
            const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
            if (jobMatch && req.method === 'GET') {
                polls += 1;
                if (polls === 1) {
                    return send(200, {
                        ok: true,
                        id: jobMatch[1],
                        status: 'running',
                        progress: { stage: 'asr', percent: 5 },
                    });
                }
                // Subsequent polls hang → idle timeout after last successful response.
                return;
            }
            return send(404, { ok: false });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}`;
        try {
            const created = await createJob(baseUrl, { task: 'transcribe', mediaPath: 'C:/tmp/idle.wav' });
            assert.strictEqual(created.ok, true);
            const waited = await waitJob(baseUrl, created.data.id, {
                intervalMs: 10,
                idleTimeoutMs: 120,
                pollTimeoutMs: 40,
            });
            assert.strictEqual(waited.ok, false);
            assert.strictEqual(waited.error, '任务长时间无响应');
            assert.strictEqual(waited.code, 'idle_timeout');
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('formats opaque fetch failed for local engine', () => {
        const opaque = new Error('fetch failed');
        opaque.cause = { message: 'fetch failed' };
        assert.strictEqual(formatEngineNetworkError(opaque), '引擎连接失败');
        const refused = new Error('fetch failed');
        refused.cause = { code: 'ECONNREFUSED' };
        assert.ok(formatEngineNetworkError(refused).includes('连接被拒绝'));
        assert.strictEqual(
            isRetryableEngineNetworkResult({ ok: false, code: 'network', error: 'fetch failed' }),
            true,
        );
        assert.strictEqual(
            isRetryableEngineNetworkResult({ ok: false, code: 'timeout', error: '请求超时' }),
            false,
        );
    });

    it('retries createJob after a dropped connection', async () => {
        let posts = 0;
        const server = http.createServer((req, res) => {
            if (req.method === 'POST' && req.url === '/v1/jobs') {
                posts += 1;
                if (posts === 1) {
                    req.destroy();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id: 'job-retry', status: 'queued' }));
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        try {
            const created = await createJob(`http://127.0.0.1:${port}`, { task: 'transcribe' });
            assert.strictEqual(created.ok, true);
            assert.strictEqual(created.data.id, 'job-retry');
            assert.ok(posts >= 2);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('falls back to poll when SSE done snapshot GET fails', async () => {
        let jobGets = 0;
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            if (url.pathname.endsWith('/events')) {
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.write('data: {"type":"done","status":"done"}\n\n');
                res.end();
                return;
            }
            if (url.pathname === '/v1/jobs' && req.method === 'POST') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, id: 'snap1', status: 'queued' }));
                return;
            }
            const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
            if (jobMatch && req.method === 'GET') {
                jobGets += 1;
                if (jobGets <= 3) {
                    req.destroy();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: true,
                    id: jobMatch[1],
                    status: 'done',
                    result: { outputs: [{ path: 'C:/tmp/ok.srt' }] },
                }));
                return;
            }
            res.writeHead(404);
            res.end();
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        try {
            const waited = await waitJob(`http://127.0.0.1:${port}`, 'snap1', {
                intervalMs: 20,
                idleTimeoutMs: 4000,
                pollTimeoutMs: 500,
            });
            assert.strictEqual(waited.ok, true);
            assert.strictEqual(waited.data.status, 'done');
            assert.ok(jobGets > 3);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });
});
