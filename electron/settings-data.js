const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./data-dir');
const { getWritableRoot, getInstallRoot, getLegacyUserDataRoot } = require('./app-paths');

const SETTINGS_FILE_NAME = 'transub-settings.json';
const LEGACY_SETTINGS_FILE_NAME = 'transwithai-settings.json';

/** In-memory options cache — loadSettings is hit from many IPC/batch paths. */
let _cachedFilePath = '';
let _cachedOptions = undefined; // undefined = cold; null = loaded empty
let _cachedOptionsKey = ''; // compact JSON of options only (skip identical writes)
let _cachedSerialized = '';
/** Frozen deep clone returned by loadSettings (shared; O(1) after warm). */
let _readonlyOptions = undefined;

function getSettingsFilePath(_getAppRoot) {
    return path.join(getWritableRoot(), SETTINGS_FILE_NAME);
}

function getLegacySettingsFilePath() {
    return path.join(getDataDir(() => getWritableRoot()), LEGACY_SETTINGS_FILE_NAME);
}

function getLegacyDataSettingsFilePath() {
    return path.join(getDataDir(() => getWritableRoot()), SETTINGS_FILE_NAME);
}

/** Pre-1.3.x wrote settings next to the exe (install / temp extract). */
function getLegacyInstallSettingsCandidates() {
    let installRoot;
    try {
        installRoot = getInstallRoot();
    } catch {
        return [];
    }
    const writable = getWritableRoot();
    if (!installRoot || path.resolve(installRoot) === path.resolve(writable)) {
        return [];
    }
    return [
        path.join(installRoot, SETTINGS_FILE_NAME),
        path.join(installRoot, 'data', SETTINGS_FILE_NAME),
        path.join(installRoot, 'data', LEGACY_SETTINGS_FILE_NAME),
    ];
}

/** Builds that stored settings under Electron userData / AppData. */
function getLegacyUserDataSettingsCandidates() {
    let legacyRoot;
    try {
        legacyRoot = getLegacyUserDataRoot();
    } catch {
        return [];
    }
    const writable = getWritableRoot();
    if (!legacyRoot || path.resolve(legacyRoot) === path.resolve(writable)) {
        return [];
    }
    return [
        path.join(legacyRoot, SETTINGS_FILE_NAME),
        path.join(legacyRoot, 'data', SETTINGS_FILE_NAME),
        path.join(legacyRoot, 'data', LEGACY_SETTINGS_FILE_NAME),
        path.join(legacyRoot, LEGACY_SETTINGS_FILE_NAME),
    ];
}

function invalidateSettingsCache() {
    _cachedFilePath = '';
    _cachedOptions = undefined;
    _cachedOptionsKey = '';
    _cachedSerialized = '';
    _readonlyOptions = undefined;
}

function cloneOptions(options) {
    if (!options || typeof options !== 'object') return null;
    try {
        return JSON.parse(JSON.stringify(options));
    } catch {
        return { ...options };
    }
}

function optionsKey(options) {
    try {
        return JSON.stringify(options || {});
    } catch {
        return '';
    }
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) deepFreeze(value[i]);
    } else {
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i += 1) deepFreeze(value[keys[i]]);
    }
    return Object.freeze(value);
}

function setCache(filePath, options) {
    _cachedFilePath = filePath;
    _cachedOptions = options && typeof options === 'object' ? cloneOptions(options) : null;
    _cachedOptionsKey = optionsKey(_cachedOptions);
    _readonlyOptions = _cachedOptions ? deepFreeze(cloneOptions(_cachedOptions)) : null;
}

function getReadonlyOptions() {
    if (_cachedOptions === undefined) return undefined;
    if (_readonlyOptions === undefined) {
        _readonlyOptions = _cachedOptions ? deepFreeze(cloneOptions(_cachedOptions)) : null;
    }
    return _readonlyOptions;
}

function readSettingsFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const options = parsed.options ?? parsed;
        return options && typeof options === 'object' ? options : null;
    } catch (err) {
        console.warn('[settings-data] 读取失败:', err.message);
        return null;
    }
}

/**
 * @param {Function} getAppRoot
 * @param {{ clone?: boolean }} [opts] — `clone: true` returns a mutable deep copy (rare write paths).
 *   Default returns a shared frozen snapshot (safe for MT/hot-path reads).
 */
function loadSettings(getAppRoot, opts = {}) {
    const filePath = getSettingsFilePath(getAppRoot);
    const wantClone = opts && opts.clone === true;
    if (_cachedOptions !== undefined && _cachedFilePath === filePath) {
        if (wantClone) return { options: cloneOptions(_cachedOptions) };
        return { options: getReadonlyOptions() };
    }
    let options = readSettingsFile(filePath);
    if (!options) {
        const legacyCandidates = [
            getLegacyDataSettingsFilePath(),
            getLegacySettingsFilePath(),
            ...getLegacyUserDataSettingsCandidates(),
            ...getLegacyInstallSettingsCandidates(),
        ];
        for (const legacyPath of legacyCandidates) {
            options = readSettingsFile(legacyPath);
            if (options) {
                try {
                    saveSettings(getAppRoot, options);
                } catch (err) {
                    console.warn('[settings-data] 迁移设置失败:', err.message);
                }
                break;
            }
        }
    }
    setCache(filePath, options || null);
    _cachedSerialized = '';
    if (wantClone) return { options: cloneOptions(_cachedOptions) };
    return { options: getReadonlyOptions() };
}

function saveSettings(getAppRoot, options) {
    const filePath = getSettingsFilePath(getAppRoot);
    const nextOptions = options && typeof options === 'object' ? options : {};
    const nextKey = optionsKey(nextOptions);
    // Compare options-only first (avoid pretty-print + updatedAt noise).
    if (_cachedFilePath === filePath && _cachedOptionsKey && _cachedOptionsKey === nextKey) {
        if (_readonlyOptions === undefined) setCache(filePath, nextOptions);
        return {
            version: 1,
            options: getReadonlyOptions() || cloneOptions(nextOptions) || {},
            updatedAt: new Date().toISOString(),
        };
    }

    const payload = {
        version: 1,
        options: nextOptions,
        updatedAt: new Date().toISOString(),
    };
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    if (_cachedFilePath === filePath && _cachedSerialized === body) {
        setCache(filePath, nextOptions);
        return payload;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, 'utf8');
    setCache(filePath, nextOptions);
    _cachedSerialized = body;
    return payload;
}

function patchSettings(getAppRoot, patch = {}) {
    // Need a mutable base for spread; use clone so callers never mutate the frozen view.
    const current = loadSettings(getAppRoot, { clone: true }).options || {};
    return saveSettings(getAppRoot, { ...current, ...patch });
}

function hasSettingsFile(getAppRoot) {
    return fs.existsSync(getSettingsFilePath(getAppRoot))
        || fs.existsSync(getLegacySettingsFilePath())
        || getLegacyUserDataSettingsCandidates().some((p) => fs.existsSync(p))
        || getLegacyInstallSettingsCandidates().some((p) => fs.existsSync(p));
}

module.exports = {
    SETTINGS_FILE_NAME,
    getSettingsFilePath,
    loadSettings,
    saveSettings,
    patchSettings,
    hasSettingsFile,
    invalidateSettingsCache,
};
