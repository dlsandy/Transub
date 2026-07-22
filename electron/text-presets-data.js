const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const TEXT_PRESETS_FILE_NAME = 'transub-text-presets.json';

function textPresetsCore() {
    return require('../src/js/subtitle-text-presets-core');
}

function getTextPresetsFilePath() {
    return path.join(getWritableRoot(), TEXT_PRESETS_FILE_NAME);
}

function emptyPresets() {
    return textPresetsCore().emptyPresetsDoc();
}

function readTextPresets() {
    const filePath = getTextPresetsFilePath();
    const { normalizePresetsDoc, defaultStarterGroups } = textPresetsCore();
    if (!fs.existsSync(filePath)) {
        return {
            ok: true,
            path: filePath,
            presetsDoc: {
                ...emptyPresets(),
                groups: defaultStarterGroups(),
            },
            exists: false,
        };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            ok: true,
            path: filePath,
            presetsDoc: normalizePresetsDoc(parsed),
            exists: true,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function writeTextPresets(presetsDoc) {
    const filePath = getTextPresetsFilePath();
    try {
        const { normalizePresetsDoc, PRESETS_VERSION } = textPresetsCore();
        const payload = normalizePresetsDoc({
            ...presetsDoc,
            version: PRESETS_VERSION,
            updatedAt: new Date().toISOString(),
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        return { ok: true, path: filePath, presetsDoc: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

module.exports = {
    TEXT_PRESETS_FILE_NAME,
    getTextPresetsFilePath,
    emptyPresets,
    readTextPresets,
    writeTextPresets,
};
