'use strict';

/**
 * Local (sandbox) trained-remap pack — layered on top of official shared/mt-trained-remaps.json.
 * Writes never touch the official pack when target === 'sandbox'.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const OFFICIAL_PATH = path.join(ROOT, 'shared', 'mt-trained-remaps.json');
const PREFS_NAME = 'mt-train-sandbox-prefs.json';
const PACK_NAME = 'mt-user-remaps.json';
const HISTORY_DIR_NAME = 'mt-user-remaps-history';

function emptyPack() {
    return { version: 1, zhRemaps: [], asrPairs: [] };
}

function normalizePack(raw) {
    const pack = raw && typeof raw === 'object' ? raw : {};
    return {
        version: Number(pack.version) || 1,
        zhRemaps: Array.isArray(pack.zhRemaps) ? pack.zhRemaps : [],
        asrPairs: Array.isArray(pack.asrPairs) ? pack.asrPairs : [],
    };
}

function resolveWritableRoot() {
    const fromEnv = String(process.env.TRANSUB_MT_SANDBOX_ROOT || '').trim();
    if (fromEnv) return path.resolve(fromEnv);
    try {
        const { getWritableRoot } = require('../../../electron/app-paths');
        return getWritableRoot();
    } catch (_) {
        return ROOT;
    }
}

function sandboxPackPath() {
    const fromEnv = String(process.env.TRANSUB_MT_USER_REMAPS || '').trim();
    if (fromEnv) return path.resolve(fromEnv);
    return path.join(resolveWritableRoot(), PACK_NAME);
}

function prefsPath() {
    return path.join(resolveWritableRoot(), PREFS_NAME);
}

function historyDir() {
    return path.join(resolveWritableRoot(), HISTORY_DIR_NAME);
}

function readJsonPack(filePath) {
    try {
        if (!fs.existsSync(filePath)) return emptyPack();
        return normalizePack(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (_) {
        return emptyPack();
    }
}

function writeJsonPack(filePath, pack) {
    const next = normalizePack(pack);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

function readOfficialPack() {
    return readJsonPack(OFFICIAL_PATH);
}

function readSandboxPack() {
    return readJsonPack(sandboxPackPath());
}

/**
 * Official first, sandbox appended (sandbox wins on later apply order for ZH).
 */
function mergePacks(official, sandbox) {
    const a = normalizePack(official);
    const b = normalizePack(sandbox);
    return {
        version: Math.max(a.version || 1, b.version || 1),
        zhRemaps: [...a.zhRemaps, ...b.zhRemaps],
        asrPairs: [...a.asrPairs, ...b.asrPairs],
    };
}

function readMergedPack() {
    return mergePacks(readOfficialPack(), readSandboxPack());
}

function readPrefs() {
    try {
        if (!fs.existsSync(prefsPath())) {
            return { target: 'sandbox' };
        }
        const raw = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
        const target = raw.target === 'official' ? 'official' : 'sandbox';
        return { target };
    } catch (_) {
        return { target: 'sandbox' };
    }
}

function writePrefs(prefs) {
    const next = {
        target: prefs?.target === 'official' ? 'official' : 'sandbox',
        updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

function getWriteTarget() {
    const env = String(process.env.MT_TRAIN_TARGET || '').trim().toLowerCase();
    if (env === 'official' || env === 'sandbox') return env;
    return readPrefs().target;
}

function setWriteTarget(target) {
    const next = target === 'official' ? 'official' : 'sandbox';
    process.env.MT_TRAIN_TARGET = next;
    return writePrefs({ target: next });
}

function snapshotSandbox(reason = 'before-write') {
    const pack = readSandboxPack();
    const dir = historyDir();
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `snap-${ts}.json`);
    const payload = {
        reason: String(reason || ''),
        savedAt: new Date().toISOString(),
        pack,
    };
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(
        path.join(dir, 'latest.json'),
        `${JSON.stringify({ file, savedAt: payload.savedAt, reason: payload.reason }, null, 2)}\n`,
        'utf8',
    );
    return { file, savedAt: payload.savedAt };
}

function listSnapshots({ limit = 12 } = {}) {
    const dir = historyDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((n) => /^snap-.*\.json$/i.test(n))
        .map((n) => {
            const file = path.join(dir, n);
            let savedAt = null;
            let reason = '';
            try {
                const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
                savedAt = raw.savedAt || null;
                reason = raw.reason || '';
            } catch (_) { /* ignore */ }
            const st = fs.statSync(file);
            return {
                file,
                name: n,
                savedAt: savedAt || st.mtime.toISOString(),
                reason,
                mtimeMs: st.mtimeMs,
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, Math.max(1, Number(limit) || 12));
}

function rollbackSandbox({ file } = {}) {
    const snaps = listSnapshots({ limit: 40 });
    if (!snaps.length) {
        throw new Error('没有可回滚的沙箱快照');
    }
    let target = file ? path.resolve(String(file)) : snaps[0].file;
    if (file) {
        const ok = snaps.some((s) => path.resolve(s.file) === target);
        if (!ok) throw new Error('快照不在沙箱历史目录内');
    }
    const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
    const pack = normalizePack(raw.pack || raw);
    // Snapshot current before restore
    snapshotSandbox('before-rollback');
    writeJsonPack(sandboxPackPath(), pack);
    return {
        ok: true,
        restoredFrom: target,
        packPath: sandboxPackPath(),
        zhRemaps: pack.zhRemaps.length,
        asrPairs: pack.asrPairs.length,
    };
}

function writeActivePack(pack) {
    const target = getWriteTarget();
    if (target === 'sandbox') {
        snapshotSandbox('before-write');
        const written = writeJsonPack(sandboxPackPath(), pack);
        return { target, path: sandboxPackPath(), pack: written };
    }
    const written = writeJsonPack(OFFICIAL_PATH, pack);
    return { target, path: OFFICIAL_PATH, pack: written };
}

function readActivePack() {
    return getWriteTarget() === 'sandbox' ? readSandboxPack() : readOfficialPack();
}

function status() {
    const prefs = readPrefs();
    const sandbox = readSandboxPack();
    const official = readOfficialPack();
    const snaps = listSnapshots({ limit: 5 });
    return {
        target: getWriteTarget(),
        prefs,
        officialPath: OFFICIAL_PATH,
        sandboxPath: sandboxPackPath(),
        sandboxRoot: resolveWritableRoot(),
        official: {
            zhRemaps: official.zhRemaps.length,
            asrPairs: official.asrPairs.length,
        },
        sandbox: {
            zhRemaps: sandbox.zhRemaps.length,
            asrPairs: sandbox.asrPairs.length,
        },
        merged: {
            zhRemaps: official.zhRemaps.length + sandbox.zhRemaps.length,
            asrPairs: official.asrPairs.length + sandbox.asrPairs.length,
        },
        snapshots: snaps,
        canRollback: snaps.length > 0,
    };
}

module.exports = {
    OFFICIAL_PATH,
    emptyPack,
    normalizePack,
    resolveWritableRoot,
    sandboxPackPath,
    readOfficialPack,
    readSandboxPack,
    readMergedPack,
    mergePacks,
    readPrefs,
    writePrefs,
    getWriteTarget,
    setWriteTarget,
    snapshotSandbox,
    listSnapshots,
    rollbackSandbox,
    writeActivePack,
    readActivePack,
    writeJsonPack,
    status,
};
