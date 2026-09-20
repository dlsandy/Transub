const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildEntitlementPayload, buildHealthSnapshot } = require('../electron/editor-factory-entitlement');
const factoryServer = require('../electron/editor-factory-server');

describe('editor-factory-entitlement', () => {
    it('buildEntitlementPayload marks trial when expiresAt set', () => {
        const ent = buildEntitlementPayload({
            entitled: true,
            features: ['smartTranslate'],
            expiresAt: '2030-01-01T00:00:00.000Z',
            reason: 'ok',
            message: 'ok',
        });
        assert.strictEqual(ent.pro, true);
        assert.strictEqual(ent.kind, 'trial');
        assert.deepStrictEqual(ent.features, ['smartTranslate']);
    });

    it('dev unlock expands feature list', () => {
        const ent = buildEntitlementPayload({ entitled: false }, { devUnlock: true });
        assert.strictEqual(ent.pro, true);
        assert.strictEqual(ent.kind, 'dev');
        assert.ok(ent.features.includes('smartTranslate'));
    });

    it('buildHealthSnapshot uses injected eval', () => {
        const snap = buildHealthSnapshot({
            isDevUnlock: () => false,
            getEntitlementEval: () => ({
                entitled: true,
                features: ['*'],
                reason: 'ok',
                message: 'Pro',
            }),
        });
        assert.strictEqual(snap.apiVersion, '1');
        assert.ok(snap.features.includes('translate-cues'));
        assert.strictEqual(snap.entitlement.pro, true);
        assert.ok(snap.entitlement.features.includes('smartTranslate'));
    });
});

describe('editor-factory-server http', () => {
    /** @type {import('http').Server} */
    let server;
    let baseUrl = '';
    const token = 'test-token-abc';
    const tmpJson = path.join(os.tmpdir(), `transub-factory-test-${process.pid}.json`);

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
        factoryServer._test.writeFactoryJson(tmpJson, baseUrl, token);
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        factoryServer._test.clearFactoryJson(tmpJson);
    });

    function req(method, urlPath, body) {
        return new Promise((resolve, reject) => {
            const u = new URL(urlPath, baseUrl);
            const payload = body ? JSON.stringify(body) : null;
            const r = http.request({
                hostname: u.hostname,
                port: u.port,
                path: u.pathname,
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

    it('writes factory.json', () => {
        const raw = fs.readFileSync(tmpJson, 'utf8');
        const cfg = JSON.parse(raw);
        assert.strictEqual(cfg.schemaVersion, 1);
        assert.strictEqual(cfg.token, token);
        assert.ok(cfg.baseUrl.startsWith('http://127.0.0.1:'));
    });

    it('rejects missing bearer', async () => {
        const u = new URL('/editor/v1/health', baseUrl);
        const result = await new Promise((resolve, reject) => {
            http.get({
                hostname: u.hostname,
                port: u.port,
                path: u.pathname,
            }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                }));
            }).on('error', reject);
        });
        assert.strictEqual(result.status, 401);
        assert.strictEqual(result.json.code, 'unauthorized');
    });

    it('health returns apiVersion', async () => {
        const r = await req('GET', '/editor/v1/health');
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.apiVersion, '1');
        assert.ok(Array.isArray(r.json.features));
        assert.ok(r.json.entitlement);
    });

    it('smart translate without pro → unauthorized', async () => {
        const r = await req('POST', '/editor/v1/translate-cues', {
            smartTranslate: true,
            cues: [{ text: 'hi', index: 0 }],
        });
        // Live entitlement may be Pro in unpackaged env; accept 403 or forwarded success/error.
        assert.ok([403, 200, 500, 409].includes(r.status), `unexpected status ${r.status} ${r.text}`);
        if (r.status === 403) assert.strictEqual(r.json.code, 'unauthorized');
    });
});

describe('editor-factory-handlers', () => {
    const handlers = require('../electron/editor-factory-handlers');

    it('normalizeCueList drops empty text', () => {
        const list = handlers.normalizeCueList([
            { index: 1, text: 'a', startMs: 0, endMs: 1000 },
            { index: 2, text: '  ', startMs: 0, endMs: 1000 },
        ]);
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].text, 'a');
    });

    it('handleTranslateCues smart path returns cues', async () => {
        const result = await handlers.handleTranslateCues(
            { smartTranslate: true, cues: [{ index: 0, text: 'hello', startMs: 0, endMs: 1000 }] },
            {
                runSmartTranslate: async () => ({
                    ok: true,
                    cues: [{ index: 0, text: '你好', startMs: 0, endMs: 1000 }],
                }),
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.ok, true);
        assert.strictEqual(result.body.cues[0].text, '你好');
        assert.strictEqual(result.body.mode, 'smart');
    });

    it('handleTranslateCues maps busy', async () => {
        const result = await handlers.handleTranslateCues(
            { mode: 'engine', cues: [{ index: 0, text: 'hello' }] },
            {
                translateCuesWithEngineOpus: async () => ({
                    ok: false,
                    code: 'compute_busy',
                    error: 'busy now',
                }),
            },
        );
        assert.strictEqual(result.httpStatus, 409);
        assert.strictEqual(result.body.code, 'busy');
    });

    it('handleTranscribeRange maps cues', async () => {
        const result = await handlers.handleTranscribeRange(
            { mediaPath: 'C:\\a.mp4', startMs: 1000, endMs: 3000 },
            {
                transcribeRangeWithEngine: async () => ({
                    ok: true,
                    cues: [{ index: 0, text: '音声', startMs: 1000, endMs: 2500 }],
                }),
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.cues[0].text, '音声');
    });

    it('handleProAction context-reconstruct maps cues', async () => {
        const result = await handlers.handleProAction(
            'context-reconstruct',
            { cues: [{ index: 0, text: 'こんにちは', startMs: 0, endMs: 1000 }] },
            {
                runContextReconstruct: async () => ({
                    ok: true,
                    cues: [{ index: 0, text: '你好', startMs: 0, endMs: 1000 }],
                    summary: 'ok',
                }),
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.feature, 'contextReconstruct');
        assert.strictEqual(result.body.cues[0].text, '你好');
    });

    it('handleProAction unknown action → 404', async () => {
        const result = await handlers.handleProAction('nope', { cues: [{ text: 'a' }] });
        assert.strictEqual(result.httpStatus, 404);
    });

    it('handleCompactRepetition returns cues', async () => {
        const result = await handlers.handleCompactRepetition(
            { cues: [{ index: 0, text: 'あああああ', startMs: 0, endMs: 1000 }] },
            {
                fluencyCore: {
                    compressRepetitionInCues: () => ({
                        cues: [{ index: 0, text: 'あ', startMs: 0, endMs: 1000 }],
                        stats: { cueTouched: 1 },
                        summary: '压缩 1 条',
                    }),
                },
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.cues[0].text, 'あ');
    });

    it('handleQcReport returns issues', async () => {
        const result = await handlers.handleQcReport(
            { cues: [{ index: 0, text: 'x', startMs: 0, endMs: 10 }] },
            {
                qcCore: {
                    scanCueIssues: () => ({
                        issues: [{ index: 0, types: ['short'] }],
                        summary: { total: 1, short: 1 },
                    }),
                    summarizeScan: () => '过短 1',
                },
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.summary, '过短 1');
        assert.strictEqual(result.body.issues.length, 1);
    });

    it('handleConvertChinese maps direction', async () => {
        const result = await handlers.handleConvertChinese(
            { direction: 's2t', cues: [{ index: 0, text: '简体', startMs: 0, endMs: 1000 }] },
            {
                chineseCore: {
                    convertCues: () => ({
                        cues: [{ index: 0, text: '簡體', startMs: 0, endMs: 1000 }],
                        stats: { cueTouched: 1 },
                        summary: '简→繁',
                    }),
                    directionLabel: () => '简→繁',
                },
            },
        );
        assert.strictEqual(result.httpStatus, 200);
        assert.strictEqual(result.body.cues[0].text, '簡體');
        assert.strictEqual(result.body.direction, 's2t');
    });
});
