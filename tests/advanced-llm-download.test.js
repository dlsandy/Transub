const assert = require('assert');
const {
    expandDownloadUrls,
    orderDownloadUrlsByProbe,
    downloadSourceLabel,
} = require('../electron/advanced-llm-download');

describe('advanced-llm-download mirrors', () => {
    it('expands Hugging Face and GitHub mirror candidates', () => {
        const hf = expandDownloadUrls('https://huggingface.co/org/model/resolve/main/a.gguf');
        assert.ok(hf[0].includes('hf-mirror.com'));
        assert.ok(hf.includes('https://huggingface.co/org/model/resolve/main/a.gguf'));

        const gh = expandDownloadUrls('https://github.com/owner/repo/releases/download/v1/file.zip');
        assert.ok(gh.some((u) => u.includes('ghfast.top')));
        assert.ok(gh.some((u) => u.includes('ghproxy.com')));
        assert.ok(gh.includes('https://github.com/owner/repo/releases/download/v1/file.zip'));
    });

    it('orderDownloadUrlsByProbe prefers reachable faster hosts', () => {
        const urls = [
            'https://slow.example/file',
            'https://dead.example/file',
            'https://fast.example/file',
        ];
        const ordered = orderDownloadUrlsByProbe([
            { url: urls[0], ok: true, latencyMs: 900, bytesPerSec: 50_000 },
            { url: urls[1], ok: false, latencyMs: 10, bytesPerSec: 0 },
            { url: urls[2], ok: true, latencyMs: 120, bytesPerSec: 800_000 },
        ], urls);
        assert.strictEqual(ordered[0], urls[2]);
        assert.strictEqual(ordered[1], urls[0]);
        assert.strictEqual(ordered[2], urls[1]);
    });

    it('orderDownloadUrlsByProbe falls back to latency when throughput is tied', () => {
        const urls = [
            'https://b.example/file',
            'https://a.example/file',
        ];
        const ordered = orderDownloadUrlsByProbe([
            { url: urls[0], ok: true, latencyMs: 200, bytesPerSec: 0 },
            { url: urls[1], ok: true, latencyMs: 40, bytesPerSec: 0 },
        ], urls);
        assert.strictEqual(ordered[0], urls[1]);
        assert.strictEqual(ordered[1], urls[0]);
    });

    it('labels known mirror hosts', () => {
        const official = 'https://huggingface.co/x';
        assert.strictEqual(downloadSourceLabel('https://hf-mirror.com/x', official), 'HF 镜像');
        assert.strictEqual(downloadSourceLabel('https://ghfast.top/https://github.com/a', official), 'ghfast');
        assert.strictEqual(downloadSourceLabel(official, official), '官方源');
    });
});
