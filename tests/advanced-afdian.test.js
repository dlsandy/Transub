const assert = require('assert');
const afdian = require('../electron/advanced-afdian');

describe('advanced-afdian client', () => {
    it('rejects empty order', async () => {
        const empty = await afdian.redeemLicenseByOrder('');
        assert.strictEqual(empty.ok, false);
        assert.strictEqual(empty.code, 'bad_request');
    });

    it('posts redeem and returns license key', async () => {
        const prev = process.env.TRANSUB_AFDIAN_FULFILL_URL;
        const prevSecret = process.env.TRANSUB_AFDIAN_REDEEM_SECRET;
        process.env.TRANSUB_AFDIAN_FULFILL_URL = 'https://example.test';
        process.env.TRANSUB_AFDIAN_REDEEM_SECRET = 'sec';
        try {
            const res = await afdian.redeemLicenseByOrder('ord1', {
                bases: ['https://example.test'],
                fetchImpl: async (url, init) => {
                    assert.ok(String(url).endsWith('/redeem'));
                    assert.strictEqual(init.method, 'POST');
                    assert.strictEqual(init.headers['X-Transub-Redeem-Secret'], 'sec');
                    const body = JSON.parse(init.body);
                    assert.strictEqual(body.outTradeNo, 'ord1');
                    return {
                        status: 200,
                        async json() {
                            return {
                                ok: true,
                                licenseKey: 'TSUB1.a.b',
                                licenseId: 'afd_ord1',
                                outTradeNo: 'ord1',
                                cached: false,
                            };
                        },
                    };
                },
            });
            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.licenseKey, 'TSUB1.a.b');
            assert.strictEqual(res.licenseId, 'afd_ord1');
        } finally {
            if (prev == null) delete process.env.TRANSUB_AFDIAN_FULFILL_URL;
            else process.env.TRANSUB_AFDIAN_FULFILL_URL = prev;
            if (prevSecret == null) delete process.env.TRANSUB_AFDIAN_REDEEM_SECRET;
            else process.env.TRANSUB_AFDIAN_REDEEM_SECRET = prevSecret;
        }
    });

    it('falls back to next base on fetch failed', async () => {
        let calls = 0;
        const res = await afdian.redeemLicenseByOrder('ord2', {
            bases: ['https://primary.test', 'https://backup.test'],
            fetchImpl: async (url) => {
                calls += 1;
                if (String(url).includes('primary.test')) {
                    const err = new Error('fetch failed');
                    err.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' };
                    throw err;
                }
                return {
                    status: 200,
                    async json() {
                        return { ok: true, licenseKey: 'TSUB1.x.y', licenseId: 'afd_ord2' };
                    },
                };
            },
        });
        assert.strictEqual(calls, 2);
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.fulfillBase, 'https://backup.test');
    });

    it('formats opaque fetch failed for users', () => {
        const err = new Error('fetch failed');
        err.cause = { message: 'fetch failed' };
        assert.match(afdian.formatNetworkError(err), /pay\.kimtem\.net\/health/);
    });
});
