/**
 * Remember / restore the last directory used by media & subtitle open dialogs.
 * Preference: options.rememberLastOpenDir (default true).
 * Sticky path: options.lastOpenDir (persisted quietly — no settings broadcast).
 */

const fs = require('fs');
const path = require('path');
const settingsData = require('./settings-data');

function readOptions(getAppRoot) {
    try {
        return settingsData.loadSettings(getAppRoot).options || {};
    } catch {
        return {};
    }
}

function isRememberEnabled(options = {}) {
    return options.rememberLastOpenDir !== false;
}

/**
 * Directory to open the dialog in, or undefined for OS default.
 * Explicit `hint` (file or directory path) wins when present.
 */
function resolveDialogDefaultPath(getAppRoot, hint = '') {
    const rawHint = String(hint || '').trim();
    if (rawHint) {
        try {
            const resolved = path.resolve(rawHint);
            if (fs.existsSync(resolved)) {
                try {
                    return fs.statSync(resolved).isDirectory()
                        ? resolved
                        : path.dirname(resolved);
                } catch {
                    return path.dirname(resolved);
                }
            }
            const parent = path.dirname(resolved);
            if (parent && fs.existsSync(parent)) return parent;
        } catch { /* fall through */ }
        return undefined;
    }

    const options = readOptions(getAppRoot);
    if (!isRememberEnabled(options)) return undefined;
    const last = String(options.lastOpenDir || '').trim();
    if (!last) return undefined;
    try {
        const resolved = path.resolve(last);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            return resolved;
        }
    } catch { /* ignore */ }
    return undefined;
}

function directoryFromPickedPath(fileOrDirPath) {
    const raw = String(fileOrDirPath || '').trim();
    if (!raw) return '';
    try {
        const resolved = path.resolve(raw);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            return resolved;
        }
        return path.dirname(resolved);
    } catch {
        return '';
    }
}

/**
 * Persist lastOpenDir when remembering is enabled. Skips settings broadcast
 * so a dirty settings form is not clobbered.
 * @returns {string|null} remembered directory, or null if unchanged / skipped
 */
function rememberOpenPath(getAppRoot, fileOrDirPath) {
    const dir = directoryFromPickedPath(fileOrDirPath);
    if (!dir) return null;
    const current = readOptions(getAppRoot);
    if (!isRememberEnabled(current)) return null;
    if (String(current.lastOpenDir || '').trim() === dir) return dir;
    try {
        settingsData.saveSettings(getAppRoot, { ...current, lastOpenDir: dir });
        return dir;
    } catch (err) {
        console.warn('[last-open-dir] save failed:', err?.message || err);
        return null;
    }
}

module.exports = {
    isRememberEnabled,
    resolveDialogDefaultPath,
    directoryFromPickedPath,
    rememberOpenPath,
};
