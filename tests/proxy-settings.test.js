const assert = require('assert');
const {
    normalizeProxyOptions,
    isProxyActive,
    isHttpProxyUrl,
    mergeBypassList,
    hostMatchesBypass,
    applyProxyToEnv,
    resolveHfProbeUrl,
    chooseBestHfCandidate,
    DEFAULT_HF_MIRROR_ENDPOINT,
} = require('../electron/proxy-settings');

describe('proxy-settings', () => {
    it('normalizes host:port to http URL', () => {
        const n = normalizeProxyOptions({
            proxyEnabled: true,
            proxyUrl: '127.0.0.1:7890',
        });
        assert.strictEqual(n.proxyEnabled, true);
        assert.strictEqual(n.proxyUrl, 'http://127.0.0.1:7890');
        assert.strictEqual(isProxyActive(n), true);
    });

    it('keeps URL when disabled', () => {
        const n = normalizeProxyOptions({
            proxyEnabled: false,
            proxyUrl: 'http://127.0.0.1:7890',
        });
        assert.strictEqual(n.proxyEnabled, false);
        assert.strictEqual(n.proxyUrl, 'http://127.0.0.1:7890');
        assert.strictEqual(isProxyActive(n), false);
    });

    it('rejects non-http schemes for active proxy', () => {
        assert.strictEqual(isHttpProxyUrl('socks5://127.0.0.1:1080'), false);
        assert.strictEqual(isProxyActive({
            proxyEnabled: true,
            proxyUrl: 'socks5://127.0.0.1:1080',
        }), false);
    });

    it('merges default bypass hosts', () => {
        const bypass = mergeBypassList('example.com');
        assert.ok(bypass.includes('localhost'));
        assert.ok(bypass.includes('127.0.0.1'));
        assert.ok(bypass.includes('example.com'));
    });

    it('matches bypass hosts', () => {
        assert.strictEqual(hostMatchesBypass('127.0.0.1', 'localhost'), true);
        assert.strictEqual(hostMatchesBypass('api.example.com', 'example.com'), true);
        assert.strictEqual(hostMatchesBypass('github.com', 'localhost'), false);
    });

    it('applies and clears env vars', () => {
        const env = {};
        applyProxyToEnv(env, {
            proxyEnabled: true,
            proxyUrl: 'http://127.0.0.1:7890',
            proxyBypass: 'localhost',
        });
        assert.strictEqual(env.HTTP_PROXY, 'http://127.0.0.1:7890');
        assert.ok(env.NO_PROXY.includes('localhost'));

        applyProxyToEnv(env, { proxyEnabled: false, proxyUrl: '' });
        assert.strictEqual(env.HTTP_PROXY, undefined);
        assert.strictEqual(env.NO_PROXY, undefined);
    });

    it('resolves HF probe URL defaults and custom mirrors', () => {
        assert.strictEqual(resolveHfProbeUrl('').url, 'https://huggingface.co');
        assert.strictEqual(resolveHfProbeUrl('https://hf-mirror.com/').url, 'https://hf-mirror.com');
        assert.strictEqual(resolveHfProbeUrl('hf-mirror.com').url, 'https://hf-mirror.com');
        assert.strictEqual(resolveHfProbeUrl('not a url').ok, false);
    });

    it('chooseBestHfCandidate prefers reachable then lower latency', () => {
        const pick = chooseBestHfCandidate([
            { id: 'official', hfEndpoint: '', label: '官方 Hub', ok: true, latencyMs: 400 },
            { id: 'mirror', hfEndpoint: DEFAULT_HF_MIRROR_ENDPOINT, label: '国内镜像', ok: true, latencyMs: 80 },
        ]);
        assert.strictEqual(pick.ok, true);
        assert.strictEqual(pick.hfEndpoint, DEFAULT_HF_MIRROR_ENDPOINT);
        assert.strictEqual(pick.id, 'mirror');
        assert.strictEqual(pick.latencyMs, 80);
    });

    it('chooseBestHfCandidate prefers only reachable when other is faster but down', () => {
        const pick = chooseBestHfCandidate([
            { id: 'official', hfEndpoint: '', label: '官方 Hub', ok: true, latencyMs: 900 },
            { id: 'mirror', hfEndpoint: DEFAULT_HF_MIRROR_ENDPOINT, label: '国内镜像', ok: false, latencyMs: 10 },
        ]);
        assert.strictEqual(pick.ok, true);
        assert.strictEqual(pick.hfEndpoint, '');
        assert.strictEqual(pick.id, 'official');
    });

    it('chooseBestHfCandidate falls back to mirror when all fail', () => {
        const pick = chooseBestHfCandidate([
            { id: 'official', hfEndpoint: '', ok: false },
            { id: 'mirror', hfEndpoint: DEFAULT_HF_MIRROR_ENDPOINT, ok: false },
        ]);
        assert.strictEqual(pick.ok, false);
        assert.strictEqual(pick.fallback, true);
        assert.strictEqual(pick.hfEndpoint, DEFAULT_HF_MIRROR_ENDPOINT);
    });
});
