const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./data-dir');
const { getProjectRoot } = require('./app-paths');

const SETTINGS_FILE_NAME = 'transub-settings.json';
const LEGACY_SETTINGS_FILE_NAME = 'transwithai-settings.json';

function getSettingsFilePath(_getAppRoot) {
    return path.join(getProjectRoot(), SETTINGS_FILE_NAME);
}

function getLegacySettingsFilePath() {
    return path.join(getDataDir(() => getProjectRoot()), LEGACY_SETTINGS_FILE_NAME);
}

function getLegacyDataSettingsFilePath() {
    return path.join(getDataDir(() => getProjectRoot()), SETTINGS_FILE_NAME);
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
        ];
        for (const legacyPath of legacyCandidates) {
            options = readSettingsFile(legacyPath);
            if (options) {
                saveSettings(getAppRoot, options);
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
        || fs.existsSync(getLegacySettingsFilePath(getAppRoot));
}

module.exports = {
    SETTINGS_FILE_NAME,
    getSettingsFilePath,
    loadSettings,
    saveSettings,
    patchSettings,
    hasSettingsFile,
};
