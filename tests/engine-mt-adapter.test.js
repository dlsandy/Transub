const assert = require('assert');
const http = require('http');
const {
    parseEngineMtRequest,
    buildEngineMtResponse,
    resolvePromptGlossary,
    startEngineMtAdapter,
    PATH_TRANSLATE,
    DEFAULT_BATCH_SIZE,
    DEFAULT_SMART_BATCH_SIZE,
    DEFAULT_TIMEOUT_SEC,
    DEFAULT_SMART_TIMEOUT_SEC,
} = require('../electron/engine-mt-adapter');

function postTranslate(url, auth, cues, { timeoutMs = 30000 } = {}) {
    const payload = JSON.stringify({
        apiVersion: 1,
        language: 'ja',
        targetLanguage: 'zh',
        cues,
    });
    return new Promise((resolve, reject) => {
        const req = http.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: auth,
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch (_) { /* ignore */ }
                resolve({ status: res.statusCode, json, raw });
            });
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('test request timeout'));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

describe('engine-mt-adapter', () => {
    it('parses engine cue batches', () => {
        const parsed = parseEngineMtRequest({
            apiVersion: 1,
            jobId: 'j1',
            language: 'ja',
            targetLanguage: 'zh',
            cues: [
                { id: 2, start: 1.5, end: 2.5, text: 'こんにちは' },
                { id: 3, start: 3, end: 4, text: 'ありがとう' },
            ],
        });
        assert.ok(parsed.ok);
        assert.strictEqual(parsed.jobId, 'j1');
        assert.strictEqual(parsed.cues[0].index, 2);
        assert.strictEqual(parsed.cues[0].startMs, 1500);
        assert.strictEqual(parsed.cues[1].text, 'ありがとう');
    });

    it('builds response by cue id', () => {
        const res = buildEngineMtResponse(
            [{ id: 2, index: 2, text: 'a' }, { id: 3, index: 3, text: 'b' }],
            [{ index: 2, text: '你好' }, { index: 3, text: '谢谢' }],
        );
        assert.deepStrictEqual(res.cues, [
            { id: 2, text: '你好' },
            { id: 3, text: '谢谢' },
        ]);
    });

    it('does not echo Japanese source when a cue translation is missing', () => {
        const res = buildEngineMtResponse(
            [{ id: 1, index: 1, text: 'こんにちは' }, { id: 2, index: 2, text: 'ありがとう' }],
            [{ index: 1, text: '你好' }],
        );
        assert.strictEqual(res.cues[0].text, '你好');
        // Missing cue may be recovered via short-JA fallback lexicon, but never echoes source JA.
        assert.ok(!String(res.cues[1].text || '').includes('ありがとう'));
        assert.ok(!/[\u3040-\u30ff]/.test(String(res.cues[1].text || '')));
    });

    it('sanitizes pathological / Gloss-polluted MT responses', () => {
        const res = buildEngineMtResponse(
            [{ id: 1, index: 1, text: 'きれいなお店。' }],
            [{ index: 1, text: `Gloss2266__店。 ${'玲奈'.repeat(1)}` }],
        );
        assert.ok(!/Gloss/i.test(res.cues[0].text));
        assert.ok(!res.cues[0].text.includes('玲奈'));
        assert.ok(res.cues[0].text.includes('店'));
    });

    it('unifies names via glossary in MT response', () => {
        const res = buildEngineMtResponse(
            [
                { id: 1, index: 1, text: '花さん' },
                { id: 2, index: 2, text: '花さん' },
            ],
            [
                { index: 1, text: '花菜小姐来了' },
                { index: 2, text: '华小姐在吗' },
            ],
            {
                glossary: {
                    version: 1,
                    entries: [{
                        id: 'g1',
                        enabled: true,
                        canonical: '仓木花',
                        aliases: ['花菜小姐', '华小姐', '花菜'],
                    }],
                },
            },
        );
        assert.ok(res.cues[0].text.includes('仓木花'));
        assert.ok(res.cues[1].text.includes('仓木花'));
    });

    it('resolves prompt glossary from options', () => {
        const gloss = { entries: [{ canonical: '真寻', aliases: ['まひろ'] }] };
        assert.strictEqual(resolvePromptGlossary({ glossaryMtEnabled: false }), null);
        assert.deepStrictEqual(resolvePromptGlossary({ glossary: gloss }), gloss);
    });

    it('serves /translate with bearer token (mock sakura)', async () => {
        const adapter = await startEngineMtAdapter({
            mode: 'sakura',
            modelId: 'sakura-1.5b',
            options: { dryRun: true, engineMtModel: 'sakura-1.5b' },
        });
        assert.ok(adapter.ok, adapter.error);
        try {
            const mt = adapter.mtExternal({ batchSize: 8, timeoutSec: 60 });
            assert.strictEqual(mt.url, adapter.url);
            assert.ok(String(mt.url).endsWith(PATH_TRANSLATE));

            const payload = JSON.stringify({
                apiVersion: 1,
                language: 'ja',
                targetLanguage: 'zh',
                cues: [{ id: 0, start: 0, end: 1, text: 'テスト' }],
            });
            const body = await new Promise((resolve, reject) => {
                const req = http.request(mt.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: mt.headers.Authorization,
                        'Content-Length': Buffer.byteLength(payload),
                    },
                }, (res) => {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                        });
                    });
                });
                req.on('error', reject);
                req.write(payload);
                req.end();
            });
            assert.strictEqual(body.status, 200);
            assert.strictEqual(body.json.cues.length, 1);
            assert.strictEqual(body.json.cues[0].id, 0);
            assert.ok(Object.prototype.hasOwnProperty.call(body.json.cues[0], 'text'));
        } finally {
            adapter.stop();
        }
    });

    it('defaults batchSize 40 for smart and 8 for sakura', async () => {
        const smart = await startEngineMtAdapter({
            mode: 'smart',
            options: { dryRun: true },
        });
        assert.ok(smart.ok, smart.error);
        try {
            const mt = smart.mtExternal();
            assert.strictEqual(mt.batchSize, DEFAULT_SMART_BATCH_SIZE);
            assert.strictEqual(DEFAULT_SMART_BATCH_SIZE, 40);
            assert.strictEqual(mt.timeoutSec, DEFAULT_SMART_TIMEOUT_SEC);
            assert.strictEqual(DEFAULT_SMART_TIMEOUT_SEC, 1800);
        } finally {
            smart.stop();
        }

        const sakura = await startEngineMtAdapter({
            mode: 'sakura',
            options: { dryRun: true },
        });
        assert.ok(sakura.ok, sakura.error);
        try {
            const mt = sakura.mtExternal();
            assert.strictEqual(mt.batchSize, DEFAULT_BATCH_SIZE);
            assert.strictEqual(DEFAULT_BATCH_SIZE, 8);
            assert.strictEqual(mt.timeoutSec, DEFAULT_TIMEOUT_SEC);
        } finally {
            sakura.stop();
        }
    });

    it('queues concurrent /translate instead of hard 429', async () => {
        const adapter = await startEngineMtAdapter({
            mode: 'sakura',
            modelId: 'sakura-1.5b',
            options: { dryRun: true, engineMtModel: 'sakura-1.5b' },
        });
        assert.ok(adapter.ok, adapter.error);
        try {
            const mt = adapter.mtExternal({ batchSize: 8, timeoutSec: 60 });
            const cuesA = [{ id: 0, start: 0, end: 1, text: 'いち' }];
            const cuesB = [{ id: 1, start: 1, end: 2, text: 'に' }];
            const [a, b] = await Promise.all([
                postTranslate(mt.url, mt.headers.Authorization, cuesA),
                postTranslate(mt.url, mt.headers.Authorization, cuesB),
            ]);
            assert.strictEqual(a.status, 200, a.raw);
            assert.strictEqual(b.status, 200, b.raw);
            assert.strictEqual(a.json.cues[0].id, 0);
            assert.strictEqual(b.json.cues[0].id, 1);
        } finally {
            adapter.stop();
        }
    });

    it('rejects unauthorized requests', async () => {
        const adapter = await startEngineMtAdapter({
            mode: 'sakura',
            options: { dryRun: true },
        });
        assert.ok(adapter.ok);
        try {
            const status = await new Promise((resolve, reject) => {
                const req = http.request(adapter.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }, (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode));
                });
                req.on('error', reject);
                req.end('{"cues":[]}');
            });
            assert.strictEqual(status, 401);
        } finally {
            adapter.stop();
        }
    });

    it('returns 499 when adapter signal is aborted', async () => {
        const ac = new AbortController();
        ac.abort();
        const adapter = await startEngineMtAdapter({
            mode: 'sakura',
            options: { dryRun: true },
            signal: ac.signal,
        });
        assert.ok(adapter.ok);
        try {
            const mt = adapter.mtExternal({ batchSize: 8, timeoutSec: 60 });
            const payload = JSON.stringify({
                apiVersion: 1,
                language: 'ja',
                targetLanguage: 'zh',
                cues: [{ id: 0, start: 0, end: 1, text: 'テスト' }],
            });
            const body = await new Promise((resolve, reject) => {
                const req = http.request(mt.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: mt.headers.Authorization,
                        'Content-Length': Buffer.byteLength(payload),
                    },
                }, (res) => {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                        });
                    });
                });
                req.on('error', reject);
                req.write(payload);
                req.end();
            });
            assert.strictEqual(body.status, 499);
            assert.ok(body.json.code === 'cancelled' || /取消/.test(String(body.json.error || '')));
        } finally {
            adapter.stop();
        }
    });
});
