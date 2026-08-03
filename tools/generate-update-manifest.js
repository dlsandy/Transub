/**
 * Build block-only update-manifest.json + per-block zips from dist/win-unpacked.
 * Also refreshes the full win.zip so it embeds resources/update-manifest.json.
 *
 * Manifest contains only block digests (shell / app / engine / other) — no file list.
 *
 * Optional changed-files delta zip (no file list published):
 *   --prev-unpacked=path/to/previous/win-unpacked
 *
 * Usage:
 *   node tools/generate-update-manifest.js
 *   node tools/generate-update-manifest.js --unpacked=dist/win-unpacked --out=dist
 *   node tools/generate-update-manifest.js --prev-unpacked=../prev/win-unpacked
 *
 * PREV_UNPACKED / PREV_MANIFEST env also accepted (PREV_MANIFEST only used for deltaFromVersion label).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    BLOCK_NAMES,
    buildBlockManifestSkeleton,
    collectBlockFileLists,
    defaultIgnoreRel,
    deltaZipName,
    finalizeManifestBlocks,
    manifestAssetName,
    normalizeRelPath,
    readJsonFile,
    sha256File,
    walkFiles,
} = require('../electron/update-manifest-core');
const {
    standardZipName,
    legacyStandardZipName,
} = require('../electron/release-artifact-names');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;

function parseArgs(argv) {
    const out = {
        unpacked: path.join(ROOT, 'dist', 'win-unpacked'),
        outDir: path.join(ROOT, 'dist'),
        prevUnpacked: String(process.env.PREV_UNPACKED || '').trim(),
        prevManifest: String(process.env.PREV_MANIFEST || '').trim(),
    };
    for (const arg of argv) {
        if (arg.startsWith('--unpacked=')) out.unpacked = path.resolve(ROOT, arg.slice(11));
        else if (arg.startsWith('--out=')) out.outDir = path.resolve(ROOT, arg.slice(6));
        else if (arg.startsWith('--prev-unpacked=')) {
            out.prevUnpacked = path.resolve(ROOT, arg.slice(16));
        } else if (arg.startsWith('--prev-manifest=')) {
            // Kept for labeling / CI convenience; file digests are not published.
            out.prevManifest = path.resolve(ROOT, arg.slice(16));
        }
    }
    return out;
}

function ensureTar() {
    const r = spawnSync('tar', ['--version'], { encoding: 'utf8' });
    if (r.status !== 0) {
        throw new Error('tar is required to build block / full update zips');
    }
}

function createZipFromFileList(outZip, baseDir, relFiles) {
    if (!relFiles.length) return false;
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
    const listFile = `${outZip}.filelist.txt`;
    fs.writeFileSync(listFile, `${relFiles.join('\n')}\n`, 'utf8');
    try {
        const r = spawnSync(
            'tar',
            ['-a', '-c', '-f', outZip, '-C', baseDir, '-T', listFile],
            { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        if (r.status !== 0) {
            throw new Error(`tar zip failed: ${r.stderr || r.stdout || r.status}`);
        }
    } finally {
        try { fs.unlinkSync(listFile); } catch { /* ignore */ }
    }
    return true;
}

function recreateFullZip(outZip, unpackedDir) {
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
    const r = spawnSync(
        'tar',
        ['-a', '-c', '-f', outZip, '-C', unpackedDir, '.'],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    if (r.status !== 0) {
        throw new Error(`full zip failed: ${r.stderr || r.stdout || r.status}`);
    }
}

function fileDigestMap(unpackedDir) {
    const root = path.resolve(unpackedDir);
    /** @type {Map<string, string>} */
    const map = new Map();
    for (const rel of walkFiles(root, { ignoreRel: defaultIgnoreRel })) {
        map.set(rel, sha256File(path.join(root, rel)));
    }
    return map;
}

function buildDeltaRelPaths(prevUnpacked, currUnpacked) {
    const prev = fileDigestMap(prevUnpacked);
    const curr = fileDigestMap(currUnpacked);
    const changed = [];
    for (const [rel, sha] of curr.entries()) {
        if (prev.get(rel) === sha) continue;
        changed.push(rel);
    }
    return changed;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureTar();
    if (!fs.existsSync(path.join(args.unpacked, 'Transub.exe'))) {
        throw new Error(`Missing Transub.exe under ${args.unpacked}`);
    }
    fs.mkdirSync(args.outDir, { recursive: true });

    const fullZipName = standardZipName(VERSION);
    const existingFull = path.join(args.outDir, fullZipName);
    const priorChinese = path.join(args.outDir, legacyStandardZipName(VERSION));
    const priorBytes = fs.existsSync(existingFull)
        ? fs.statSync(existingFull).size
        : (fs.existsSync(priorChinese) ? fs.statSync(priorChinese).size : 0);

    const editionPath = path.join(args.unpacked, 'resources', 'transub-edition.json');
    fs.mkdirSync(path.dirname(editionPath), { recursive: true });
    fs.writeFileSync(
        editionPath,
        `${JSON.stringify({
            edition: 'standard',
            version: VERSION,
            role: 'first-install',
            label: '标准版',
            autoUpdateUses: fullZipName,
            note: 'Automatic updates compare block digests (shell/app/engine/other), then download dirty block zips or a delta zip; local ASR/GPU libs are preserved.',
        }, null, 2)}\n`,
        'utf8',
    );

    console.log(`[update-manifest] scanning blocks in ${args.unpacked}`);
    const { byBlock } = collectBlockFileLists(args.unpacked);
    const manifest = buildBlockManifestSkeleton({
        version: VERSION,
        fullZipName,
        fullZipBytes: priorBytes,
    });

    const written = [];
    /** @type {Record<string, { absPath: string, fileCount: number }>} */
    const blockZipPaths = {};

    for (const block of BLOCK_NAMES) {
        const files = (byBlock[block] || []).map((p) => normalizeRelPath(p));
        if (!files.length) {
            console.log(`[update-manifest] skip empty block ${block}`);
            continue;
        }
        const name = `Transub-${VERSION}-win-${block}.zip`;
        const outZip = path.join(args.outDir, name);
        console.log(`[update-manifest] zipping ${block} (${files.length} files) → ${name}`);
        createZipFromFileList(outZip, args.unpacked, files);
        blockZipPaths[block] = { absPath: outZip, fileCount: files.length };
        written.push(name);
    }
    finalizeManifestBlocks(manifest, blockZipPaths);

    // Optional delta from previous unpacked tree (digests stay local; not published as file list).
    let prevLabel = '';
    if (args.prevManifest && fs.existsSync(args.prevManifest)) {
        try {
            prevLabel = String(readJsonFile(args.prevManifest).version || '').trim();
        } catch { /* ignore */ }
    }
    if (args.prevUnpacked && fs.existsSync(path.join(args.prevUnpacked, 'Transub.exe'))) {
        console.log(`[update-manifest] building delta vs ${args.prevUnpacked}`);
        const deltaRels = buildDeltaRelPaths(args.prevUnpacked, args.unpacked);
        if (!deltaRels.length) {
            console.log('[update-manifest] no file changes vs prev unpacked; skip delta zip');
        } else {
            const name = deltaZipName(VERSION);
            const outZip = path.join(args.outDir, name);
            console.log(`[update-manifest] zipping delta (${deltaRels.length} files) → ${name}`);
            createZipFromFileList(outZip, args.unpacked, deltaRels);
            const st = fs.statSync(outZip);
            manifest.deltaZip = name;
            manifest.deltaZipBytes = st.size;
            manifest.deltaSha256 = sha256File(outZip);
            manifest.deltaFromVersion = prevLabel || path.basename(path.dirname(args.prevUnpacked));
            written.push(name);
        }
    } else {
        console.log('[update-manifest] no --prev-unpacked / PREV_UNPACKED; skip delta zip');
    }

    const manifestName = manifestAssetName(VERSION);
    const manifestPath = path.join(args.outDir, manifestName);
    const manifestAlso = path.join(args.outDir, 'update-manifest.json');
    const embedded = path.join(args.unpacked, 'resources', 'update-manifest.json');
    fs.mkdirSync(path.dirname(embedded), { recursive: true });

    const embedText = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(embedded, embedText, 'utf8');
    console.log(`[update-manifest] rewriting full zip ${fullZipName}`);
    if (!fs.existsSync(existingFull) && fs.existsSync(priorChinese)) {
        fs.renameSync(priorChinese, existingFull);
    }
    recreateFullZip(existingFull, args.unpacked);
    manifest.fullZipBytes = fs.statSync(existingFull).size;
    // Re-embed after fullZipBytes update (still no file list).
    const finalText = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(manifestPath, finalText, 'utf8');
    fs.writeFileSync(manifestAlso, finalText, 'utf8');
    fs.writeFileSync(embedded, finalText, 'utf8');
    written.push(manifestName, 'update-manifest.json', fullZipName);

    console.log(`[update-manifest] done · v${VERSION} · format ${manifest.format} (block digests only)`);
    for (const name of written) {
        const abs = path.join(args.outDir, name);
        if (!fs.existsSync(abs)) continue;
        const mb = (fs.statSync(abs).size / (1024 * 1024)).toFixed(1);
        console.log(`  ${name} (${mb} MB)`);
    }
    for (const block of BLOCK_NAMES) {
        const b = manifest.blocks[block];
        if (!b?.sha256) continue;
        console.log(`  block ${block}: files=${b.fileCount} sha=${b.sha256.slice(0, 12)}…`);
    }
}

if (require.main === module) {
    main();
}
