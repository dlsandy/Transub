const assert = require('assert');
const { getEntitlementStatusCold } = require('../electron/advanced-status-cold');
const { getProductWindowTitle } = require('../electron/product-title');

describe('cold-start entitlement helpers', () => {
    it('returns entitlement status without throwing', () => {
        const res = getEntitlementStatusCold();
        assert.strictEqual(res.ok, true);
        assert.ok(res.status && typeof res.status === 'object');
        assert.strictEqual(typeof res.status.entitled, 'boolean');
        assert.ok(res.status.freePipelineTranslate && typeof res.status.freePipelineTranslate === 'object');
    });

    it('exposes product title without advanced-bridge', () => {
        assert.strictEqual(getProductWindowTitle(), 'Transub 字幕工厂');
    });
});
