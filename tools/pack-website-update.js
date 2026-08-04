/**
 * Collect auto-update artifacts into a single upload bundle for the official site.
 *
 * Includes (standard / slim channel only):
 *   - Transub-{ver}-win.zip
 *   - Transub-{ver}-update-manifest.json (+ update-manifest.json)  — block digests only
 *   - Transub-{ver}-win-{shell,app,engine,other}.zip
 *   - Transub-{ver}-win-delta.zip (optional)
 *
 * Bundle name: Transub-{ver}-update.zip
 * Excludes first-install CPU/CUDA edition zips (no longer published).
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    BLOCK_NAMES,
    blockZipName,
    deltaZipName,
    manifestAssetName,
} = require('../electron/update-manifest-core');
const {
    standardZipName,
    legacyStandardZipName,
    websiteUpdateZipName,
} = require('../electron/release-artifact-names');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;

function parseArgs(argv) {
    const out = {
        distDir: path.join(ROOT, 'dist'),
        outDir: path.join(ROOT, 'dist', 'website-update'),
    };
    for (const arg of argv) {
        if (arg.startsWith('--dist=')) out.distDir = path.resolve(ROOT, arg.slice(7));
        else if (arg.startsWith('--out=')) out.outDir = path.resolve(ROOT, arg.slice(6));
    }
    return out;
}

function mustExist(abs, label) {
    if (!fs.existsSync(abs)) {
        throw new Error(`Missing ${label}: ${abs}`);
    }
    return abs;
}

function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

function ensureTar() {
    const r = spawnSync('tar', ['--version'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('tar is required to pack website-update zip');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureTar();

    const fullZipName = standardZipName(VERSION);
    const oldChineseZipName = legacyStandardZipName(VERSION);
    const manifestName = manifestAssetName(VERSION);
    const files = [
        { name: fullZipName, required: false },
        { name: oldChineseZipName, required: false },
        { name: manifestName, required: true },
        { name: 'update-manifest.json', required: false },
        { name: deltaZipName(VERSION), required: false },
    ];
    for (const block of BLOCK_NAMES) {
        files.push({ name: blockZipName(VERSION, block), required: false });
    }

    const resolved = [];
    let haveFull = false;
    for (const item of files) {
        const abs = path.join(args.distDir, item.name);
        if (!fs.existsSync(abs)) {
            if (item.required) mustExist(abs, item.name);
            console.log(`[website-update] skip missing optional ${item.name}`);
            continue;
        }
        if (item.name === fullZipName || item.name === oldChineseZipName) haveFull = true;
        resolved.push({ name: item.name, abs, size: fs.statSync(abs).size });
    }
    if (!haveFull) {
        throw new Error(`Missing full zip (${fullZipName})`);
    }

    const stageDir = path.join(args.outDir, `v${VERSION}`);
    fs.mkdirSync(stageDir, { recursive: true });
    for (const ent of fs.readdirSync(stageDir)) {
        fs.rmSync(path.join(stageDir, ent), { recursive: true, force: true });
    }

    let totalBytes = 0;
    for (const f of resolved) {
        // Prefer English name in the upload stage when both exist.
        const stageName = f.name === oldChineseZipName && !resolved.some((x) => x.name === fullZipName)
            ? fullZipName
            : f.name;
        if (f.name === oldChineseZipName && resolved.some((x) => x.name === fullZipName)) {
            console.log(`[website-update] skip obsolete ${f.name} (using ${fullZipName})`);
            continue;
        }
        copyFile(f.abs, path.join(stageDir, stageName));
        totalBytes += f.size;
        if (stageName !== f.name) {
            resolved[resolved.indexOf(f)] = { ...f, name: stageName };
        }
    }

    const stagedManifest = path.join(stageDir, manifestName);
    const stagedAlias = path.join(stageDir, 'update-manifest.json');
    if (fs.existsSync(stagedManifest) && !fs.existsSync(stagedAlias)) {
        copyFile(stagedManifest, stagedAlias);
        resolved.push({
            name: 'update-manifest.json',
            abs: stagedAlias,
            size: fs.statSync(stagedAlias).size,
        });
        totalBytes += fs.statSync(stagedAlias).size;
    }

    const stagedFiles = fs.readdirSync(stageDir).filter((n) => n !== 'UPLOAD.txt');
    const readme = [
        `# Transub v${VERSION} — website update upload bundle`,
        '',
        'Auto-update channel (slim / standard). Manifest is block digests only (shell / app / engine / other).',
        '',
        'Suggested layout:',
        `  /updates/${VERSION}/${fullZipName}`,
        `  /updates/${VERSION}/Transub-${VERSION}-update-manifest.json`,
        '  /updates/latest/update-manifest.json',
        `  /updates/${VERSION}/Transub-${VERSION}-win-shell.zip`,
        `  /updates/${VERSION}/Transub-${VERSION}-win-app.zip`,
        `  /updates/${VERSION}/Transub-${VERSION}-win-engine.zip`,
        `  /updates/${VERSION}/Transub-${VERSION}-win-other.zip`,
        `  /updates/${VERSION}/Transub-${VERSION}-win-delta.zip`,
        '',
        'Files:',
        ...stagedFiles.map((name) => {
            const abs = path.join(stageDir, name);
            const size = fs.statSync(abs).size;
            return `  - ${name}  (${(size / (1024 * 1024)).toFixed(1)} MB)`;
        }),
        '',
        `Total: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
        `Built: ${new Date().toISOString()}`,
        '',
    ].join('\n');
    fs.writeFileSync(path.join(stageDir, 'UPLOAD.txt'), readme, 'utf8');

    const bundleZipName = websiteUpdateZipName(VERSION);
    const bundleZip = path.join(args.outDir, bundleZipName);
    if (fs.existsSync(bundleZip)) fs.unlinkSync(bundleZip);
    // Explicit file list — avoid `tar -C dir .` which embeds "./" and breaks Explorer extract.
    const bundleEntries = fs.readdirSync(stageDir).filter((name) => {
        const abs = path.join(stageDir, name);
        return fs.statSync(abs).isFile();
    });
    const listFile = `${bundleZip}.filelist.txt`;
    fs.writeFileSync(listFile, `${bundleEntries.join('\n')}\n`, 'utf8');
    try {
        const r = spawnSync(
            'tar',
            ['-a', '-c', '-f', bundleZip, '-C', stageDir, '-T', listFile],
            { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        if (r.status !== 0) {
            throw new Error(`website-update zip failed: ${r.stderr || r.stdout || r.status}`);
        }
    } finally {
        try { fs.unlinkSync(listFile); } catch { /* ignore */ }
    }

    const zipMb = (fs.statSync(bundleZip).size / (1024 * 1024)).toFixed(1);
    console.log(`[website-update] staged ${stageDir}`);
    console.log(`[website-update] bundle  ${bundleZip} (${zipMb} MB)`);
    for (const name of stagedFiles) {
        const abs = path.join(stageDir, name);
        console.log(`  ${name} (${(fs.statSync(abs).size / (1024 * 1024)).toFixed(1)} MB)`);
    }
}

if (require.main === module) {
    main();
}
