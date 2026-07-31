/**
 * Bundle Pro algorithms into minified `_advanced/index.js` for commercial installs.
 * Source stays in-tree for tests / unpackaged dev; packaged asar excludes those files.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '_advanced');
const outfile = path.join(outDir, 'index.js');
const entry = path.join(__dirname, 'advanced-module-entry.js');

function main() {
    let esbuild;
    try {
        esbuild = require('esbuild');
    } catch (err) {
        console.error('[build-advanced] esbuild required:', err.message || err);
        process.exit(1);
    }

    fs.mkdirSync(outDir, { recursive: true });

    const result = esbuild.buildSync({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        minify: true,
        legalComments: 'none',
        target: ['node22'],
        // Keep host app modules out of the proprietary blob; algorithms + prompts inline.
        external: [
            'electron',
            'undici',
            'json5',
            'electron-updater',
        ],
        logLevel: 'warning',
    });

    if (result.errors?.length) {
        console.error('[build-advanced] bundle failed');
        process.exit(1);
    }

    const stat = fs.statSync(outfile);
    // Marker so verify/packaging can assert a real proprietary module is present.
    fs.writeFileSync(
        path.join(outDir, 'MODULE.json'),
        `${JSON.stringify({
            name: 'Transub Pro',
            builtAt: new Date().toISOString(),
            bytes: stat.size,
            entry: 'index.js',
        }, null, 2)}\n`,
        'utf8',
    );

    console.log(`[build-advanced] wrote ${path.relative(root, outfile)} (${stat.size} bytes)`);
}

main();
