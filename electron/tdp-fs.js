/**
 * Writable TDP layout under {writableRoot}/tdp/
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot, getProjectRoot, getInstallRoot } = require('./app-paths');

const TDP_DIR_NAME = 'tdp';
const CURRENT_PACK = 'current.tpack';
const CURRENT_META = 'current.meta.json';
const STAGING_DIR = 'staging';
const ACTIVE_DIR = 'active';
const BUNDLED_REL = path.join('shared', 'tdp', 'tdp-bundled.tpack');

/** @type {string|null} */
let rootOverride = null;

function getTdpRoot() {
    if (rootOverride) return rootOverride;
    return path.join(getWritableRoot(), TDP_DIR_NAME);
}

function __setTdpRootForTests(dir) {
    rootOverride = dir ? String(dir) : null;
}

function getCurrentPackPath() {
    return path.join(getTdpRoot(), CURRENT_PACK);
}

function getCurrentMetaPath() {
    return path.join(getTdpRoot(), CURRENT_META);
}

function getStagingDir() {
    return path.join(getTdpRoot(), STAGING_DIR);
}

function getActiveDir() {
    return path.join(getTdpRoot(), ACTIVE_DIR);
}

function getActiveD01Path() {
    return path.join(getActiveDir(), 'd01.df1');
}

function ensureDirs() {
    fs.mkdirSync(getTdpRoot(), { recursive: true });
    fs.mkdirSync(getStagingDir(), { recursive: true });
    fs.mkdirSync(getActiveDir(), { recursive: true });
}

function resolveBundledPackPath() {
    const candidates = [
        path.join(getInstallRoot(), BUNDLED_REL),
        path.join(getProjectRoot(), BUNDLED_REL),
        path.join(__dirname, '..', BUNDLED_REL),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch { /* ignore */ }
    }
    return candidates[candidates.length - 1];
}

function readMeta() {
    const filePath = getCurrentMetaPath();
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function writeMeta(meta) {
    ensureDirs();
    fs.writeFileSync(getCurrentMetaPath(), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function clearActiveOverlay() {
    const dir = getActiveDir();
    try {
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            try {
                fs.unlinkSync(path.join(dir, name));
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

module.exports = {
    TDP_DIR_NAME,
    BUNDLED_REL,
    getTdpRoot,
    getCurrentPackPath,
    getCurrentMetaPath,
    getStagingDir,
    getActiveDir,
    getActiveD01Path,
    ensureDirs,
    resolveBundledPackPath,
    readMeta,
    writeMeta,
    clearActiveOverlay,
    __setTdpRootForTests,
};
