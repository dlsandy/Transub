const assert = require('assert');
const http = require('http');
const {
    startFactoryBatch,
    getFactoryBatchStatus,
    getFactoryOptionsSnapshot,
    clearActiveBatch,
    noteFactoryBatchAborted,
    _test,
} = require('../electron/editor-factory-batch');
const { setFactoryBatchRequestId, getFactoryBatchRequestId } = require('../electron/engine-progress-emit');
const factoryServer = require('../electron/editor-factory-server');

describe('editor-factory-batch', () => {
    afterEach(() => {
        clearActiveBatch();
        setFactoryBatchRequestId('');
    });

    it('rejects empty items', async () => {
        const r = await startFactoryBatch({ items: [] }, {
            getComputeStatus: () => ({ busy: false }),
        });
        assert.strictEqual(r.httpStatus, 400);
        assert.strictEqual(r.body.code, 'empty_items');
    });

    it('rejects when compute busy', async () => {
        const r = await startFactoryBatch(
            { items: [{ fullPath: 'C:\\a.mp4' }] },
            {
                getComputeStatus: () => ({
                    busy: true,
                    kind: 'advanced_smart_translate',
                    label: '智能翻译',
                }),
            },
        );
        assert.strictEqual(r.httpStatus, 409);
        assert.strictEqual(r.body.code, 'busy');
    });

    it('accepts batch and runs in background', async () => {
        const events = [];
        let resolveRun;
        const runPromise = new Promise((resolve) => { resolveRun = resolve; });
        const r = await startFactoryBatch(
            {
                requestId: 'batch-1',
                items: [{ fullPath: 'C:\\video.mp4' }],
                options: { language: 'ja' },
            },
            {
                getComputeStatus: () => ({ busy: false }),
                loadMergedOptions: async (o) => ({ ...o, merged: true }),
                emitProgress: (e) => events.push(e),
                runEngineBatch: async (payload) => {
                    assert.strictEqual(payload.items.length, 1);
                    assert.strictEqual(payload.options.merged, true);
                    await new Promise((r2) => setTimeout(r2, 20));
                    resolveRun();
                    return { ok: true, message: 'done', results: [] };
                },
            },
        );
        assert.strictEqual(r.httpStatus, 202);
        assert.strictEqual(r.body.accepted, true);
        assert.strictEqual(r.body.requestId, 'batch-1');
        assert.strictEqual(getFactoryBatchRequestId(), 'batch-1');

        await runPromise;
        await new Promise((r2) => setTimeout(r2, 30));

        const st = getFactoryBatchStatus('batch-1');
        assert.strictEqual(st.state, 'done');
        assert.strictEqual(st.result.ok, true);
        assert.ok(events.some((e) => e.phase === 'accepted'));
        assert.ok(events.some((e) => e.phase === 'done'));
        assert.strictEqual(getFactoryBatchRequestId(), '');
    });

    it('getFactoryOptionsSnapshot strips secrets', () => {
        const snap = getFactoryOptionsSnapshot({
            loadSettings: () => ({
                options: {
                    language: 'ja',
                    advancedLicenseKey: 'SECRET',
                    afdianToken: 'tok',
                },
            }),
        });
        assert.strictEqual(snap.ok, true);
        assert.strictEqual(snap.options.language, 'ja');
        assert.strictEqual(snap.options.advancedLicenseKey, undefined);
        assert.strictEqual(snap.options.afdianToken, undefined);
    });

    it('saveFactoryOptions patches via normalize whitelist', async () => {
        const { saveFactoryOptions } = require('../electron/editor-factory-batch');
        let saved = null;
        const r = await saveFactoryOptions(
            { options: { language: 'en', advancedLicenseKey: 'SHOULD_DROP' } },
            {
                loadSettings: () => ({ options: { language: 'ja', engineAsrModel: 'sensevoice-small' } }),
                buildFromPayload: (patch, cur) => ({ ...cur, ...patch, normalized: true }),
                saveOptions: async (next) => { saved = next; },
            },
        );
        assert.strictEqual(r.httpStatus, 200);
        assert.strictEqual(r.body.ok, true);
        assert.strictEqual(saved.language, 'en');
        assert.strictEqual(saved.engineAsrModel, 'sensevoice-small');
        assert.strictEqual(saved.advancedLicenseKey, undefined);
        assert.strictEqual(r.body.options.advancedLicenseKey, undefined);
    });

    it('noteFactoryBatchAborted marks running batch', () => {
        _test.setActiveBatch({
            requestId: 'x',
            state: 'running',
            startedAt: Date.now(),
        });
        setFactoryBatchRequestId('x');
        noteFactoryBatchAborted();
        const st = getFactoryBatchStatus('x');
        assert.strictEqual(st.state, 'error');
        assert.strictEqual(st.result.code, 'aborted');
        assert.strictEqual(getFactoryBatchRequestId(), '');
    });
});

describe('editor-factory-server batch routes', () => {
    /** @type {import('http').Server} */
    let server;
    let baseUrl = '';
    const token = 'batch-route-token';

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
        clearActiveBatch();
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

    it('health lists batch feature', async () => {
        const r = await req('GET', '/editor/v1/health');
        assert.strictEqual(r.status, 200);
        assert.ok(r.json.features.includes('batch'));
        assert.ok(r.json.features.includes('options'));
    });

    it('GET options returns object', async () => {
        const r = await req('GET', '/editor/v1/options');
        assert.ok([200, 500].includes(r.status));
        assert.ok(r.json && typeof r.json.options === 'object');
    });

    it('POST batch empty → 400', async () => {
        const r = await req('POST', '/editor/v1/batch', { items: [] });
        assert.strictEqual(r.status, 400);
        assert.strictEqual(r.json.code, 'empty_items');
    });

    it('GET batch/status idle', async () => {
        clearActiveBatch();
        const r = await req('GET', '/editor/v1/batch/status');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.state, 'idle');
    });
});
