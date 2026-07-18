const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./data-dir');
const { getWritableRoot, getInstallRoot } = require('./app-paths');

const SETTINGS_FILE_NAME = 'transub-settings.json';
const LEGACY_SETTINGS_FILE_NAME = 'transwithai-settings.json';

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

function loadSettings(getAppRoot) {
    const filePath = getSettingsFilePath(getAppRoot);
    let options = readSettingsFile(filePath);
    if (!options) {
        const legacyCandidates = [
            getLegacyDataSettingsFilePath(),
            getLegacySettingsFilePath(),
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
    return { options: options || null };
}

function saveSettings(getAppRoot, options) {
    const filePath = getSettingsFilePath(getAppRoot);
    const payload = {
        version: 1,
        options: options && typeof options === 'object' ? options : {},
        updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
}

function patchSettings(getAppRoot, patch = {}) {
    const current = loadSettings(getAppRoot).options || {};
    return saveSettings(getAppRoot, { ...current, ...patch });
}

function hasSettingsFile(getAppRoot) {
    return fs.existsSync(getSettingsFilePath(getAppRoot))
        || fs.existsSync(getLegacySettingsFilePath())
        || getLegacyInstallSettingsCandidates().some((p) => fs.existsSync(p));
}

module.exports = {
    SETTINGS_FILE_NAME,
    getSettingsFilePath,
    loadSettings,
    saveSettings,
    patchSettings,
    hasSettingsFile,
};
