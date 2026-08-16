/**
 * Mutable in-flight subtitle batch: append upcoming items / skip not-yet-started paths.
 * Shared by engine + TWAI (only one compute batch runs at a time).
 */
const path = require('path');

/** @type {{ list: object[], skipped: Set<string>, currentKey: string } | null} */
let session = null;

function normKey(p) {
    const raw = String(p || '').trim();
    if (!raw) return '';
    try {
        const resolved = path.resolve(raw);
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    } catch {
        return process.platform === 'win32' ? raw.toLowerCase() : raw;
    }
}

function itemPath(item) {
    return String(item?.fullPath || item?.path || item || '').trim();
}

function begin(list) {
    const arr = Array.isArray(list) ? list : [];
    session = {
        list: arr,
        skipped: new Set(),
        currentKey: '',
    };
    return session;
}

function end() {
    session = null;
}

function isActive() {
    return !!session;
}

function getTotal() {
    return session ? session.list.length : 0;
}

function setCurrent(mediaPath) {
    if (!session) return;
    session.currentKey = normKey(mediaPath);
}

function getCurrent() {
    if (!session || !session.currentKey) return '';
    const item = session.list.find((it) => normKey(itemPath(it)) === session.currentKey);
    return itemPath(item) || '';
}

function getCurrentIndex1() {
    if (!session || !session.currentKey) return 0;
    const idx = session.list.findIndex((it) => normKey(itemPath(it)) === session.currentKey);
    return idx >= 0 ? idx + 1 : 0;
}

function clearCurrent() {
    if (!session) return;
    session.currentKey = '';
}

function hasPath(mediaPath) {
    if (!session) return false;
    const key = normKey(mediaPath);
    if (!key) return false;
    return session.list.some((item) => normKey(itemPath(item)) === key);
}

/**
 * @param {object[]} items
 * @returns {{ ok: boolean, appended: string[], total: number, error?: string, code?: string }}
 */
function append(items) {
    if (!session) {
        return { ok: false, appended: [], total: 0, error: '没有进行中的批次', code: 'no_batch' };
    }
    const incoming = Array.isArray(items) ? items : [];
    const appended = [];
    for (const raw of incoming) {
        const fullPath = itemPath(raw);
        if (!fullPath) continue;
        const key = normKey(fullPath);
        if (!key) continue;
        if (hasPath(fullPath)) continue;
        session.skipped.delete(key);
        const entry = {
            fullPath,
            path: fullPath,
            durationSec: Math.max(0, Number(raw?.durationSec ?? raw?.duration) || 0),
            optionOverrides: raw?.optionOverrides && typeof raw.optionOverrides === 'object'
                ? raw.optionOverrides
                : undefined,
        };
        session.list.push(entry);
        appended.push(fullPath);
    }
    return { ok: true, appended, total: session.list.length };
}

/**
 * Mark paths to skip when the loop reaches them (cannot skip the current file).
 * @param {string[]} paths
 */
function skip(paths) {
    if (!session) {
        return {
            ok: false,
            skipped: [],
            blocked: [],
            total: 0,
            error: '没有进行中的批次',
            code: 'no_batch',
        };
    }
    const list = Array.isArray(paths) ? paths : [];
    const skipped = [];
    const blocked = [];
    for (const p of list) {
        const fullPath = String(p || '').trim();
        const key = normKey(fullPath);
        if (!key) continue;
        if (session.currentKey && key === session.currentKey) {
            blocked.push(fullPath);
            continue;
        }
        session.skipped.add(key);
        skipped.push(fullPath);
    }
    return { ok: true, skipped, blocked, total: session.list.length };
}

/** @returns {boolean} true if this path should be skipped (and clears the mark) */
function consumeSkip(mediaPath) {
    if (!session) return false;
    const key = normKey(mediaPath);
    if (!key || !session.skipped.has(key)) return false;
    session.skipped.delete(key);
    return true;
}

/**
 * Update optionOverrides for an upcoming (not current) item.
 * @param {string} mediaPath
 * @param {object} [optionOverrides]
 */
function updateOverrides(mediaPath, optionOverrides) {
    if (!session) {
        return { ok: false, error: '没有进行中的批次', code: 'no_batch' };
    }
    const key = normKey(mediaPath);
    if (!key) return { ok: false, error: '无效路径' };
    if (session.currentKey && key === session.currentKey) {
        return { ok: false, error: '当前任务已开始，无法更新感知覆盖', code: 'current' };
    }
    const item = session.list.find((it) => normKey(itemPath(it)) === key);
    if (!item) return { ok: false, error: '不在当前批次中', code: 'not_found' };
    if (optionOverrides && typeof optionOverrides === 'object') {
        item.optionOverrides = optionOverrides;
    } else {
        delete item.optionOverrides;
    }
    return { ok: true };
}

module.exports = {
    normKey,
    begin,
    end,
    isActive,
    getTotal,
    setCurrent,
    getCurrent,
    getCurrentIndex1,
    clearCurrent,
    append,
    skip,
    consumeSkip,
    updateOverrides,
    hasPath,
};
