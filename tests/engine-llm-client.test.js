const assert = require('assert');
const http = require('http');
const {
    engineSupportsLlmServer,
    getLlmHealth,
    ensureLlm,
    stopLlm,
    scheduleLlmIdleStop,
} = require('../electron/engine-llm-client');

function startMock() {
    /** @type {Record<string, any>} */
    const state = { running: false, modelId: '', ensureCount: 0, stopCount: 0 };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const send = (code, obj) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
        };
        if (url.pathname === '/v1/capabilities') {
            return send(200, {
                ok: true,
                apiVersion: '1.0.0',
                features: { llmServer: true, releaseGpuAfter: true },
            });
        }
        if (url.pathname === '/v1/llm/health') {
            return send(200, {
                ok: true,
                running: state.running,
                healthy: state.running,
                modelId: state.modelId,
                port: state.running ? 18081 : null,
                baseUrl: state.running ? 'http://127.0.0.1:18081' : null,
                via: 'engine',
            });
        }
        if (url.pathname === '/v1/llm/ensure' && req.method === 'POST') {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            if (!body.exePath || !Array.isArray(body.args)) {
                return send(400, { ok: false, code: 'bad_args', error: 'bad' });
            }
            state.ensureCount += 1;
            state.running = true;
            state.modelId = String(body.modelId || '');
            return send(200, {
                ok: true,
                already: false,
                modelId: state.modelId,
                model: state.modelId,
                baseUrl: 'http://127.0.0.1:18081',
                apiKey: 'local',
                port: 18081,
                nGpuLayers: body.nGpuLayers ?? 99,
                parallelSlots: body.parallelSlots || 1,
                via: 'engine',
            });
        }
        if (url.pathname === '/v1/llm' && req.method === 'DELETE') {
            state.stopCount += 1;
            state.running = false;
            state.modelId = '';
            return send(200, { ok: true, stopped: true, via: 'engine' });
        }
        if (url.pathname === '/v1/llm/idle-stop' && req.method === 'POST') {
            return send(200, { ok: true, scheduled: true, delayMs: 1000 });
        }
        return send(404, { ok: false });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${port}`, state });
        });
    });
}

describe('engine-llm-client', () => {
    it('detects llmServer capability and round-trips ensure/health/stop', async () => {
        const { server, baseUrl, state } = await startMock();
        try {
            assert.strictEqual(await engineSupportsLlmServer(baseUrl), true);
            const ens = await ensureLlm(baseUrl, {
                modelId: 'demo',
                exePath: 'C:/fake/llama-server.exe',
                args: ['-m', 'x.gguf', '--port', '18081'],
                port: 18081,
                nGpuLayers: 33,
            });
            assert.strictEqual(ens.ok, true);
            assert.strictEqual(ens.data?.via, 'engine');
            assert.strictEqual(state.ensureCount, 1);

            const health = await getLlmHealth(baseUrl);
            assert.strictEqual(health.ok, true);
            assert.strictEqual(health.data?.running, true);
            assert.strictEqual(health.data?.modelId, 'demo');

            const idle = await scheduleLlmIdleStop(baseUrl, { delayMs: 1000 });
            assert.strictEqual(idle.ok, true);

            const stopped = await stopLlm(baseUrl, { reason: 'test' });
            assert.strictEqual(stopped.ok, true);
            assert.strictEqual(state.stopCount, 1);
            assert.strictEqual(state.running, false);
        } finally {
            server.close();
        }
    });

    it('returns false when llmServer feature missing', async () => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, features: {} }));
        });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const { port } = server.address();
        try {
            assert.strictEqual(await engineSupportsLlmServer(`http://127.0.0.1:${port}`), false);
        } finally {
            server.close();
        }
    });
});
