'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('jassub vendor assets', () => {
    const vendor = path.join(__dirname, '..', 'src', 'vendor', 'jassub');
    const editorHtml = path.join(__dirname, '..', 'src', 'subtitle-editor.html');

    it('has bundled ESM entry, worker, wasm and default font', () => {
        const needed = [
            'jassub.js',
            'worker.js',
            'default.woff2',
            path.join('wasm', 'jassub-worker.wasm'),
            path.join('wasm', 'jassub-worker-modern.wasm'),
        ];
        for (const rel of needed) {
            const full = path.join(vendor, rel);
            assert.ok(fs.existsSync(full), `missing ${rel}`);
            assert.ok(fs.statSync(full).size > 1000, `${rel} too small`);
        }
        const main = fs.readFileSync(path.join(vendor, 'jassub.js'), 'utf8');
        assert.ok(main.includes('workerUrl') || main.includes('new Worker'));
        const worker = fs.readFileSync(path.join(vendor, 'worker.js'), 'utf8');
        assert.ok(worker.includes('setTrack'));
    });

    it('editor CSP allows wasm + workers for JASSUB', () => {
        const html = fs.readFileSync(editorHtml, 'utf8');
        const m = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i);
        assert.ok(m, 'CSP meta missing');
        const csp = m[1];
        assert.ok(csp.includes("'wasm-unsafe-eval'"), 'script-src needs wasm-unsafe-eval');
        assert.ok(/worker-src[^;]*'self'/.test(csp), 'worker-src should allow self');
    });
});
