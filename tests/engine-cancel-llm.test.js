const assert = require('assert');
const { interruptLocalMtLlm } = require('../electron/engine-cancel-llm');

describe('engine-cancel-llm', () => {
    it('interruptLocalMtLlm returns ok for batch and item scopes', async () => {
        const batch = await interruptLocalMtLlm({ scope: 'batch' });
        assert.strictEqual(batch.ok, true);
        assert.strictEqual(batch.scope, 'batch');
        assert.ok(typeof batch.sakuraCancelled === 'boolean');
        assert.ok(typeof batch.llamaStopped === 'boolean');
        assert.ok(typeof batch.engineLlmStopped === 'boolean');

        const item = await interruptLocalMtLlm({ scope: 'item' });
        assert.strictEqual(item.ok, true);
        assert.strictEqual(item.scope, 'item');
    });
});
