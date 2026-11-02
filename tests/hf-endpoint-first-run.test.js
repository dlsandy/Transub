const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ensureFirstRunHfEndpoint,
    readStamp,
    _resetInflightForTests,
} = require('../electron/hf-endpoint-first-run');
const { invalidateSettingsCache, loadSettings } = require('../electron/settings-data');

describe('hf-endpoint-first-run', () => {
    /** @type {string} */
    let tmp;
    /** @type {string|undefined} */
    let prevPortable;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-hf-first-'));
        prevPortable = process.env.PORTABLE_EXECUTABLE_DIR;
        process.env.PORTABLE_EXECUTABLE_DIR = tmp;
        invalidateSettingsCache();
        _resetInflightForTests();
    });

    afterEach(() => {
        invalidateSettingsCache();
        _resetInflightForTests();
        if (prevPortable == null) delete process.env.PORTABLE_EXECUTABLE_DIR;
        else process.env.PORTABLE_EXECUTABLE_DIR = prevPortable;
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    });

    it('defaults to domestic HF mirror on cold start', async () => {
        const res = await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.hfEndpoint, 'https://hf-mirror.com');
        assert.strictEqual(res.stamped, true);
        const stamp = readStamp(tmp);
        assert.ok(stamp?.done);
        assert.strictEqual(stamp.hfEndpoint, 'https://hf-mirror.com');
        const saved = loadSettings(() => tmp).options;
        assert.strictEqual(saved.engineHfEndpoint, 'https://hf-mirror.com');
    });

    it('honors pickFn override when provided', async () => {
        const res = await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
            pickFn: async () => ({
                ok: true,
                hfEndpoint: '',
                label: '官方 Hub',
                latencyMs: 40,
                message: '下载源：官方 Hub（约 40 ms）',
                results: [
                    { id: 'official', ok: true, latencyMs: 40, hfEndpoint: '' },
                    { id: 'mirror', ok: true, latencyMs: 180, hfEndpoint: 'https://hf-mirror.com' },
                ],
            }),
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.hfEndpoint, '');
        assert.strictEqual(res.stamped, true);
        const stamp = readStamp(tmp);
        assert.ok(stamp?.done);
        assert.strictEqual(stamp.hfEndpoint, '');
        const saved = loadSettings(() => tmp).options;
        assert.strictEqual(saved.engineHfEndpoint, '');
    });

    it('persists domestic mirror when pickFn returns mirror', async () => {
        const res = await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
            pickFn: async () => ({
                ok: true,
                hfEndpoint: 'https://hf-mirror.com',
                label: '国内镜像',
                latencyMs: 55,
                message: '下载源：国内镜像（约 55 ms）',
            }),
        });
        assert.strictEqual(res.hfEndpoint, 'https://hf-mirror.com');
        assert.strictEqual(loadSettings(() => tmp).options.engineHfEndpoint, 'https://hf-mirror.com');
    });

    it('does not re-probe after stamp exists', async () => {
        let calls = 0;
        await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
            pickFn: async () => {
                calls += 1;
                return {
                    ok: true,
                    hfEndpoint: 'https://hf-mirror.com',
                    label: '国内镜像',
                    latencyMs: 60,
                };
            },
        });
        const second = await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
            pickFn: async () => {
                calls += 1;
                return { ok: true, hfEndpoint: '', label: '官方 Hub', latencyMs: 10 };
            },
        });
        assert.strictEqual(calls, 1);
        assert.strictEqual(second.already, true);
        assert.strictEqual(second.hfEndpoint, 'https://hf-mirror.com');
    });

    it('preserves an existing saved engineHfEndpoint without probing', async () => {
        fs.writeFileSync(
            path.join(tmp, 'transub-settings.json'),
            `${JSON.stringify({
                version: 1,
                options: { engineHfEndpoint: 'https://example-mirror.test' },
            }, null, 2)}\n`,
            'utf8',
        );
        invalidateSettingsCache();
        let calls = 0;
        const res = await ensureFirstRunHfEndpoint({
            writableRoot: tmp,
            getAppRoot: () => tmp,
            pickFn: async () => {
                calls += 1;
                return { ok: true, hfEndpoint: '', label: '官方 Hub' };
            },
        });
        assert.strictEqual(calls, 0);
        assert.strictEqual(res.preserved, true);
        assert.strictEqual(res.hfEndpoint, 'https://example-mirror.test');
    });
});
