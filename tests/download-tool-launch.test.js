const assert = require('assert');
const {
    normalizeHttpUrls,
    toThunderUrl,
    openThunderUrls,
    openDownloadTool,
} = require('../electron/download-tool-launch');

describe('download-tool-launch', () => {
    it('normalizeHttpUrls dedupes and drops non-http', () => {
        const urls = normalizeHttpUrls([
            'https://a/x.whl',
            'HTTPS://a/x.whl',
            'ftp://no',
            'https://b/y.whl',
            '',
        ]);
        assert.deepStrictEqual(urls, ['https://a/x.whl', 'https://b/y.whl']);
    });

    it('toThunderUrl wraps classic thunder task', () => {
        const u = toThunderUrl('https://example.com/a.whl');
        assert.ok(u.startsWith('thunder://'));
        const raw = Buffer.from(u.slice('thunder://'.length), 'base64').toString('utf8');
        assert.strictEqual(raw, 'AAhttps://example.com/a.whlZZ');
    });

    it('openThunderUrls opens every url (not just first 6)', async () => {
        const opened = [];
        const shell = {
            openExternal: async (u) => { opened.push(u); },
        };
        const list = Array.from({ length: 12 }, (_, i) => `https://example.com/${i}.whl`);
        const res = await openThunderUrls(shell, list, { delayMs: 0 });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.opened, 12);
        assert.strictEqual(res.total, 12);
        assert.strictEqual(opened.length, 12);
        assert.ok(opened.every((u) => u.startsWith('thunder://')));
    });

    it('openDownloadTool rejects unknown tool', async () => {
        const res = await openDownloadTool('nope', ['https://a'], {
            shell: { openExternal: async () => {} },
        });
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /未知/);
    });
});
