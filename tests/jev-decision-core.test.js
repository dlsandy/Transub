const assert = require('assert');
const jev = require('../src/js/jev-decision-core');
const portGuard = require('../electron/jev-port-guard');

describe('jev-decision-core (Laya System One)', () => {
    it('uses reserved local port 39283', () => {
        assert.strictEqual(jev.DEFAULT_LOCAL_PORT, 39283);
        assert.strictEqual(jev.resolveJevEndpoint('local'), jev.ENDPOINT_LOCAL);
        assert.ok(jev.ENDPOINT_LOCAL.includes(':39283/'));
    });

    it('rewrites legacy :8000 loopback to reserved port', () => {
        assert.strictEqual(
            jev.resolveJevEndpoint('http://127.0.0.1:8000/v1/systemone'),
            'http://127.0.0.1:39283/v1/systemone',
        );
    });

    it('port guard blocks engine/llama/sakura ports', () => {
        assert.strictEqual(portGuard.guardEndpoint('http://127.0.0.1:8765/v1/systemone').ok, false);
        assert.strictEqual(portGuard.guardEndpoint('http://127.0.0.1:39281/v1/systemone').ok, false);
        assert.strictEqual(portGuard.guardEndpoint('http://127.0.0.1:39282/v1/systemone').ok, false);
        assert.strictEqual(portGuard.guardEndpoint('local').ok, true);
        assert.strictEqual(portGuard.guardEndpoint('local').port, 39283);
    });

    it('chunks questions to System One cap', () => {
        const pairs = Array.from({ length: 40 }, (_, i) => ({ index: i }));
        const chunks = jev.chunkPairsForSystemOne(pairs);
        assert.strictEqual(chunks.length, 2);
        assert.strictEqual(chunks[0].length, 32);
        assert.strictEqual(chunks[1].length, 8);
    });

    it('skips on speed perf profile', () => {
        assert.strictEqual(jev.shouldSkipJevForPerfProfile({ perfProfile: 'speed' }), true);
        assert.strictEqual(jev.shouldSkipJevForPerfProfile({ perfProfile: 'quality' }), false);
    });
});
