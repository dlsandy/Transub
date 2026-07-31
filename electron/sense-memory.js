/**
 * Persist auto-sense adopt/reject preferences (folder + AV maker keys).
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const FILE_NAME = 'transub-sense-memory.json';
const MAX_ENTRIES = 400;

function getSenseMemoryPath(baseDir) {
    const root = baseDir ? path.resolve(String(baseDir)) : getWritableRoot();
    return path.join(root, FILE_NAME);
}

function loadSenseMemory(baseDir) {
    const filePath = getSenseMemoryPath(baseDir);
    if (!fs.existsSync(filePath)) {
        return { version: 1, entries: {} };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const entries = parsed && typeof parsed.entries === 'object' && parsed.entries
            ? parsed.entries
            : {};
        return { version: 1, entries };
    } catch {
        return { version: 1, entries: {} };
    }
}

function saveSenseMemory(memory, baseDir) {
    const filePath = getSenseMemoryPath(baseDir);
    const entries = memory?.entries && typeof memory.entries === 'object'
        ? memory.entries
        : {};
    const keys = Object.keys(entries);
    if (keys.length > MAX_ENTRIES) {
        const sorted = keys
            .map((k) => ({ k, t: Number(entries[k]?.updatedAt) || 0 }))
            .sort((a, b) => b.t - a.t)
            .slice(0, MAX_ENTRIES);
        const next = {};
        for (const row of sorted) next[row.k] = entries[row.k];
        memory = { version: 1, entries: next };
    } else {
        memory = { version: 1, entries };
    }
    fs.writeFileSync(filePath, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
    return memory;
}

function getSenseMemoryStats(baseDir) {
    const mem = loadSenseMemory(baseDir);
    const count = Object.keys(mem.entries || {}).length;
    return { ok: true, count };
}

function clearSenseMemory(baseDir) {
    const prev = loadSenseMemory(baseDir);
    const cleared = Object.keys(prev.entries || {}).length;
    const filePath = getSenseMemoryPath(baseDir);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        saveSenseMemory({ version: 1, entries: {} }, baseDir);
    }
    return { ok: true, cleared };
}

/**
 * @param {{ key: string, profile: string, prefer: boolean }} input
 */
function recordSenseMemory(input = {}) {
    const key = String(input.key || '').trim();
    const profile = String(input.profile || '').trim();
    const baseDir = input.baseDir;
    if (!key || !profile || profile === 'unknown') {
        return { ok: false, error: 'invalid memory key' };
    }
    const prefer = input.prefer !== false;
    const mem = loadSenseMemory(baseDir);
    const prev = mem.entries[key] || {};
    mem.entries[key] = {
        profile,
        prefer,
        hits: Math.min(999, (Number(prev.hits) || 0) + 1),
        updatedAt: Date.now(),
    };
    saveSenseMemory(mem, baseDir);
    return { ok: true, entry: mem.entries[key], key };
}

function lookupSenseMemory(keys = [], baseDir) {
    const mem = loadSenseMemory(baseDir);
    const hits = [];
    for (const key of keys) {
        const k = String(key || '').trim();
        if (!k || !mem.entries[k]) continue;
        hits.push({ key: k, ...mem.entries[k] });
    }
    return { ok: true, hits };
}

module.exports = {
    getSenseMemoryPath,
    loadSenseMemory,
    saveSenseMemory,
    getSenseMemoryStats,
    clearSenseMemory,
    recordSenseMemory,
    lookupSenseMemory,
};
