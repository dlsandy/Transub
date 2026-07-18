/**
 * Publish current HEAD to GitHub main + create Release via gh API
 * (when git://https to github.com is unreachable but `gh api` works).
 *
 * Usage: node tools/publish-release-api.js
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'dlsandy';
const REPO = 'Transub';
const VERSION = require(path.join(ROOT, 'package.json')).version;
const TAG = `v${VERSION}`;
const GH = process.env.GH_BIN
    || path.join(os.tmpdir(), 'gh-cli', 'bin', 'gh.exe');

function sh(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: opts.encoding || 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        ...opts,
    });
    if (r.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout || ''}`);
    }
    return r.stdout;
}

function ghApi(args, input) {
    const r = spawnSync(GH, ['api', ...args], {
        cwd: ROOT,
        input: input || undefined,
        encoding: Buffer.isBuffer(input) ? undefined : 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status !== 0) {
        const err = (r.stderr || r.stdout || '').toString();
        throw new Error(`gh api ${args.join(' ')}\n${err}`);
    }
    const out = Buffer.isBuffer(r.stdout) ? r.stdout.toString('utf8') : (r.stdout || '');
    return out.trim() ? JSON.parse(out) : null;
}

function gitBlobSha(filePath) {
    return sh('git', ['hash-object', filePath]).trim();
}

function listLocalFiles() {
    // tracked files at HEAD + ensure working tree files for release assets not in HEAD
    const tracked = sh('git', ['ls-tree', '-r', '--name-only', 'HEAD'])
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    return tracked;
}

function getRemoteHead() {
    const ref = ghApi([`repos/${OWNER}/${REPO}/git/ref/heads/main`]);
    return ref.object.sha;
}

function getCommit(sha) {
    return ghApi([`repos/${OWNER}/${REPO}/git/commits/${sha}`]);
}

function getRemoteTreeMap(treeSha) {
    const tree = ghApi([`repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`]);
    const map = new Map();
    for (const item of tree.tree || []) {
        if (item.type === 'blob') map.set(item.path, item);
    }
    return map;
}

function createBlobFromFile(absPath) {
    const buf = fs.readFileSync(absPath);
    const body = JSON.stringify({
        content: buf.toString('base64'),
        encoding: 'base64',
    });
    const r = spawnSync(GH, [
        'api',
        '--method', 'POST',
        `repos/${OWNER}/${REPO}/git/blobs`,
        '--input', '-',
    ], {
        cwd: ROOT,
        input: body,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status !== 0) {
        throw new Error(`create blob failed for ${absPath}\n${r.stderr || r.stdout}`);
    }
    return JSON.parse(r.stdout).sha;
}

function createTree(baseTreeSha, entries) {
    const body = JSON.stringify({
        base_tree: baseTreeSha,
        tree: entries,
    });
    const r = spawnSync(GH, [
        'api',
        '--method', 'POST',
        `repos/${OWNER}/${REPO}/git/trees`,
        '--input', '-',
    ], {
        cwd: ROOT,
        input: body,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) {
        throw new Error(`create tree failed\n${r.stderr || r.stdout}`);
    }
    return JSON.parse(r.stdout);
}

function createCommit(message, treeSha, parents) {
    const body = JSON.stringify({
        message,
        tree: treeSha,
        parents,
        author: {
            name: 'Transub',
            email: 'transub@users.noreply.github.com',
            date: new Date().toISOString(),
        },
        committer: {
            name: 'Transub',
            email: 'transub@users.noreply.github.com',
            date: new Date().toISOString(),
        },
    });
    const r = spawnSync(GH, [
        'api',
        '--method', 'POST',
        `repos/${OWNER}/${REPO}/git/commits`,
        '--input', '-',
    ], {
        cwd: ROOT,
        input: body,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        throw new Error(`create commit failed\n${r.stderr || r.stdout}`);
    }
    return JSON.parse(r.stdout);
}

function updateRef(sha) {
    return ghApi([
        '--method', 'PATCH',
        `repos/${OWNER}/${REPO}/git/refs/heads/main`,
        '-f', `sha=${sha}`,
        '-F', 'force=false',
    ]);
}

function ensureExtraRemoteFiles(remoteMap) {
    // Keep files that exist on remote but not in our HEAD (e.g. 222.png)
    const localSet = new Set(listLocalFiles());
    const extras = [];
    for (const [p, item] of remoteMap.entries()) {
        if (!localSet.has(p)) {
            extras.push({ path: p, mode: item.mode || '100644', type: 'blob', sha: item.sha });
        }
    }
    return extras;
}

function buildChangelogNotes() {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const m = changelog.match(/## 1\.3\.1\n([\s\S]*?)(?=\n## |$)/);
    if (!m) return `Transub ${TAG}`;
    return `## Transub ${TAG}\n\n${m[1].trim()}\n`;
}

function createRelease(commitSha) {
    const notes = buildChangelogNotes();
    const assets = [
        path.join(ROOT, 'dist', `Transub-Setup-${VERSION}.exe`),
        path.join(ROOT, 'dist', `Transub-Setup-${VERSION}.exe.blockmap`),
        path.join(ROOT, 'dist', `Transub-${VERSION}-portable.exe`),
        path.join(ROOT, 'dist', 'latest.yml'),
    ];
    for (const a of assets) {
        if (!fs.existsSync(a)) throw new Error(`Missing release asset: ${a}`);
    }

    // Create / recreate tag + release
    try {
        ghApi(['--method', 'DELETE', `repos/${OWNER}/${REPO}/releases/tags/${TAG}`]);
    } catch (_) { /* no existing release */ }
    try {
        ghApi(['--method', 'DELETE', `repos/${OWNER}/${REPO}/git/refs/tags/${TAG}`]);
    } catch (_) { /* no existing tag */ }

    const notesFile = path.join(os.tmpdir(), `transub-release-notes-${VERSION}.md`);
    fs.writeFileSync(notesFile, notes, 'utf8');

    const args = [
        'release', 'create', TAG,
        ...assets,
        '--repo', `${OWNER}/${REPO}`,
        '--title', `Transub ${TAG}`,
        '--notes-file', notesFile,
        '--target', commitSha,
    ];
    console.log('Creating release', TAG, '…');
    execFileSync(GH, args, { cwd: ROOT, stdio: 'inherit' });
}

function main() {
    if (!fs.existsSync(GH)) {
        throw new Error(`gh not found at ${GH}. Set GH_BIN.`);
    }
    console.log('gh:', GH);
    console.log('version:', VERSION);

    const remoteHead = getRemoteHead();
    console.log('remote main:', remoteHead);
    const remoteCommit = getCommit(remoteHead);
    const remoteTreeSha = remoteCommit.tree.sha;
    const remoteMap = getRemoteTreeMap(remoteTreeSha);
    console.log('remote blobs:', remoteMap.size);

    const localFiles = listLocalFiles();
    console.log('local files:', localFiles.length);

    const treeEntries = [];
    let uploaded = 0;
    let reused = 0;

    for (const rel of localFiles) {
        const abs = path.join(ROOT, rel);
        if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
        const mode = '100644';
        const localSha = gitBlobSha(abs);
        const remote = remoteMap.get(rel.replace(/\\/g, '/'));
        const norm = rel.replace(/\\/g, '/');
        let sha = localSha;
        if (!remote || remote.sha !== localSha) {
            // Verify object exists on GitHub; if not, upload
            let exists = false;
            if (remote && remote.sha === localSha) exists = true;
            else {
                try {
                    ghApi([`repos/${OWNER}/${REPO}/git/blobs/${localSha}`]);
                    exists = true;
                } catch (_) {
                    exists = false;
                }
            }
            if (!exists) {
                sha = createBlobFromFile(abs);
                uploaded += 1;
                if (uploaded % 10 === 0) console.log(`  uploaded ${uploaded} blobs…`);
            } else {
                sha = localSha;
                reused += 1;
            }
        } else {
            sha = remote.sha;
            reused += 1;
        }
        treeEntries.push({ path: norm, mode, type: 'blob', sha });
    }

    // Preserve remote-only files (222.png etc.)
    for (const extra of ensureExtraRemoteFiles(remoteMap)) {
        treeEntries.push(extra);
        console.log('keep remote-only:', extra.path);
    }

    console.log(`blobs uploaded=${uploaded} reused=${reused} entries=${treeEntries.length}`);

    // Use flat tree (no base_tree) to avoid stale deleted paths from remote
    const body = JSON.stringify({ tree: treeEntries });
    const treeRes = spawnSync(GH, [
        'api', '--method', 'POST', `repos/${OWNER}/${REPO}/git/trees`, '--input', '-',
    ], { cwd: ROOT, input: body, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (treeRes.status !== 0) {
        throw new Error(`create full tree failed\n${treeRes.stderr || treeRes.stdout}`);
    }
    const newTree = JSON.parse(treeRes.stdout);
    console.log('new tree:', newTree.sha);

    const localMsg = sh('git', ['log', '-1', '--format=%B', 'HEAD']).trim();
    const commit = createCommit(localMsg, newTree.sha, [remoteHead]);
    console.log('new commit:', commit.sha);

    updateRef(commit.sha);
    console.log('updated main ->', commit.sha);

    createRelease(commit.sha);
    console.log('Done.');
    console.log(`https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`);
}

main();
