/**
 * Bundle jassub (ESM + worker) into src/vendor/jassub for the subtitle editor.
 * Run: node tools/sync-jassub-vendor.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'node_modules', 'jassub', 'dist');
const OUT = path.join(ROOT, 'src', 'vendor', 'jassub');

async function syncJassubVendor() {
    if (!fs.existsSync(path.join(DIST, 'jassub.js'))) {
        console.warn('[sync-jassub-vendor] jassub not installed; skip');
        return;
    }
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (err) {
        console.warn('[sync-jassub-vendor] esbuild unavailable:', err.message);
        return;
    }

    fs.mkdirSync(path.join(OUT, 'wasm'), { recursive: true });

    await esbuild.build({
        entryPoints: [path.join(DIST, 'jassub.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: path.join(OUT, 'jassub.js'),
        logLevel: 'warning',
    });

    await esbuild.build({
        entryPoints: [path.join(DIST, 'worker', 'worker.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: path.join(OUT, 'worker.js'),
        logLevel: 'warning',
    });

    for (const name of ['jassub-worker.wasm', 'jassub-worker-modern.wasm']) {
        fs.copyFileSync(path.join(DIST, 'wasm', name), path.join(OUT, 'wasm', name));
    }
    fs.copyFileSync(path.join(DIST, 'default.woff2'), path.join(OUT, 'default.woff2'));

    const licenseSrc = path.join(ROOT, 'node_modules', 'jassub', 'LICENSE');
    if (fs.existsSync(licenseSrc)) {
        fs.copyFileSync(licenseSrc, path.join(OUT, 'LICENSE'));
    }

    console.log(
        `[sync-jassub-vendor] ready (${fs.statSync(path.join(OUT, 'jassub.js')).size} + worker ${fs.statSync(path.join(OUT, 'worker.js')).size} bytes)`,
    );
}

module.exports = { syncJassubVendor };

if (require.main === module) {
    syncJassubVendor().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
