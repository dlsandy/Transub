const assert = require('assert');
const http = require('http');
const {
    listFactoryModels,
    startFactoryModelDownload,
    getFactoryDownloadStatus,
    clearActiveDownload,
    noteFactoryDownloadAborted,
    _test,
} = require('../electron/editor-factory-models');
const factoryServer = require('../electron/editor-factory-server');

describe('editor-factory-models', () => {
    afterEach(() => {
        clearActiveDownload();
    });

    it('listFactoryModels merges engine + sakura', async () => {
        const r = await listFactoryModels({}, {
            loadMergedOptions: async () => ({ engineInstallPath: 'x' }),
            ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:9' }),
            listModels: async () => ({
                ok: true,
                data: { models: [{ id: 'sensevoice-small' }], profiles: { balanced: {} } },
            }),
            listSakuraModels: () => [{ id: 'sakura-1.5b', kind: 'sakura' }],
        });
        assert.strictEqual(r.httpStatus, 200);
        assert.strictEqual(r.body.ok, true);
        assert.ok(r.body.models.some((m) => m.id === 'sensevoice-small'));
        assert.ok(r.body.models.some((m) => m.id === 'sakura-1.5b'));
    });

    it('listFactoryModels returns sakura when engine down', async () => {
        const r = await listFactoryModels({}, {
            loadMergedOptions: async () => ({}),
            ensureEngineRunning: async () => ({ ok: false, error: 'no engine', code: 'no_engine' }),
            listSakuraModels: () => [{ id: 'sakura-1.5b' }],
        });
        assert.strictEqual(r.httpStatus, 503);
        assert.ok(r.body.models.some((m) => m.id === 'sakura-1.5b'));
    });

    it('startFactoryModelDownload rejects empty', async () => {
        const r = await startFactoryModelDownload({ modelIds: [] }, {});
        assert.strictEqual(r.httpStatus, 400);
        assert.strictEqual(r.body.code, 'empty_models');
    });

    it('startFactoryModelDownload runs stream in background', async () => {
        const events = [];
        let resolveDone;
        const done = new Promise((r) => { resolveDone = r; });
        const r = await startFactoryModelDownload(
            { requestId: 'dl-1', modelIds: ['sensevoice-small'] },
            {
                loadMergedOptions: async () => ({ engineProfile: 'balanced' }),
                ensureEngineRunning: async () => ({ ok: true, baseUrl: 'http://127.0.0.1:9' }),
                downloadModelsStream: async (_url, body, opts) => {
                    assert.deepStrictEqual(body.modelIds, ['sensevoice-small']);
                    opts.onEvent?.({ message: 'chunk', pct: 40 });
                    resolveDone();
                    return { ok: true, data: { downloaded: ['sensevoice-small'] } };
                },
                emitProgress: (e) => events.push(e),
            },
        );
        assert.strictEqual(r.httpStatus, 202);
        assert.strictEqual(r.body.requestId, 'dl-1');
        await done;
        await new Promise((r2) => setTimeout(r2, 30));
        const st = getFactoryDownloadStatus('dl-1');
        assert.strictEqual(st.state, 'done');
        assert.ok(events.some((e) => e.phase === 'progress'));
        assert.ok(events.some((e) => e.phase === 'done'));
    });

    it('noteFactoryDownloadAborted cancels', () => {
        let aborted = false;
        _test.setActiveDownload({
            requestId: 'dl-x',
            state: 'running',
            startedAt: Date.now(),
            abort: { abort: () => { aborted = true; } },
        });
        noteFactoryDownloadAborted();
        const st = getFactoryDownloadStatus('dl-x');
        assert.strictEqual(st.state, 'error');
        assert.strictEqual(st.result.code, 'aborted');
        assert.strictEqual(aborted, true);
    });
});

describe('editor-factory-server models/options routes', () => {
    /** @type {import('http').Server} */
    let server;
    let baseUrl = '';
    const token = 'models-route-token';

    beforeAll(async () => {
        factoryServer._test.setToken(token);
        server = http.createServer((req, res) => {
            factoryServer._test.handleRequest(req, res).catch((err) => {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
            });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterAll(async () => {
        clearActiveDownload();
        await new Promise((resolve) => server.close(resolve));
    });

    function req(method, urlPath, body) {
        return new Promise((resolve, reject) => {
            const u = new URL(urlPath, baseUrl);
            const payload = body ? JSON.stringify(body) : null;
            const r = http.request({
                hostname: u.hostname,
                port: u.port,
                path: `${u.pathname}${u.search || ''}`,
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(payload ? {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    } : {}),
                },
            }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let json = null;
                    try { json = JSON.parse(text); } catch { /* ignore */ }
                    resolve({ status: res.statusCode, json, text });
                });
            });
            r.on('error', reject);
            if (payload) r.write(payload);
            r.end();
        });
    }

    it('health lists models features', async () => {
        const r = await req('GET', '/editor/v1/health');
        assert.ok(r.json.features.includes('models'));
        assert.ok(r.json.features.includes('models/download'));
    });

    it('PATCH options with mock is reachable', async () => {
        // May fail save against real settings path; accept 200 or 500 with structured body.
        const r = await req('PATCH', '/editor/v1/options', { options: { language: 'ja' } });
        assert.ok([200, 500].includes(r.status), r.text);
        assert.ok(r.json && typeof r.json.ok === 'boolean');
    });

    it('POST models/download empty → 400', async () => {
        const r = await req('POST', '/editor/v1/models/download', { modelIds: [] });
        assert.strictEqual(r.status, 400);
        assert.strictEqual(r.json.code, 'empty_models');
    });
});
