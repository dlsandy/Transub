const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('node:stream');

const {
    buildMediaUrl,
    resolveMediaUrl,
    isAllowedMediaPath,
    clearAllowedMediaPaths,
} = require('../electron/media-protocol');

function testBuildMediaUrl() {
    const url = buildMediaUrl('F:\\Videos\\clip.mp4');
    assert.ok(url.startsWith('transub-media://video?path='));
    assert.ok(url.includes(encodeURIComponent('clip.mp4')));
}

function testResolveMediaUrl() {
    clearAllowedMediaPaths();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-media-'));
    const file = path.join(tmp, 'sample.mp4');
    fs.writeFileSync(file, Buffer.alloc(128, 0));
    assert.strictEqual(isAllowedMediaPath(file), false);
    const resolved = resolveMediaUrl(file);
    assert.strictEqual(resolved.ok, true);
    assert.strictEqual(resolved.path, file);
    assert.ok(resolved.url.includes(encodeURIComponent(file)));
    assert.strictEqual(isAllowedMediaPath(file), true);
    const missing = resolveMediaUrl(path.join(tmp, 'missing.mp4'));
    assert.strictEqual(missing.ok, false);
    const badExt = path.join(tmp, 'notes.txt');
    fs.writeFileSync(badExt, 'x');
    const rejected = resolveMediaUrl(badExt);
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(isAllowedMediaPath(badExt), false);
    fs.rmSync(tmp, { recursive: true, force: true });
}

async function testReadableWebStream() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-range-'));
    const file = path.join(tmp, 'sample.bin');
    fs.writeFileSync(file, Buffer.from('0123456789'));
    const stream = fs.createReadStream(file, { start: 0, end: 4 });
    const web = Readable.toWeb(stream);
    const reader = web.getReader();
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
    }
    assert.strictEqual(Buffer.concat(chunks).toString(), '01234');
    fs.rmSync(tmp, { recursive: true, force: true });
}

describe("media-protocol", () => {
    it("build media url", () => {
        testBuildMediaUrl();
    });
    it("resolve media url", () => {
        testResolveMediaUrl();
    });
    it("readable web stream", async () => {
        await testReadableWebStream();
    });
});
