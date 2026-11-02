/**
 * Version-scoped env-doctor gate stamp (main-process readable).
 * Survives across launches; independent of setupWizard localStorage flags.
 */

const fs = require('fs');
const path = require('path');

const GATE_FILE_NAME = 'env-doctor-gate.json';

function getGateFilePath() {
    const { getWritableRoot } = require('./app-paths');
    return path.join(getWritableRoot(), GATE_FILE_NAME);
}

function readGateState() {
    const filePath = getGateFilePath();
    try {
        if (!fs.existsSync(filePath)) return { okForVersion: '' };
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            okForVersion: String(raw?.okForVersion || '').trim(),
        };
    } catch {
        return { okForVersion: '' };
    }
}

function writeOkForVersion(version) {
    const ver = String(version || '').trim();
    if (!ver) return { ok: false, error: 'missing version' };
    const filePath = getGateFilePath();
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const next = { okForVersion: ver, updatedAt: new Date().toISOString() };
        fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
        return { ok: true, okForVersion: ver };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

function clearOkForVersion() {
    const filePath = getGateFilePath();
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

/**
 * @param {string} appVersion
 * @param {{ getAppRoot?: Function, hasSettings?: boolean }} [opts]
 * @returns {boolean} true when env-doctor must run before main UI
 */
function needsEnvDoctorGate(appVersion, _opts = {}) {
    const ver = String(appVersion || '').trim();
    if (!ver) return false;
    // Version stamp only. Do not skip when this install folder has no settings:
    // wizard completion lives in Chromium localStorage and often will not open,
    // which previously dropped users straight into the main UI.
    const { okForVersion } = readGateState();
    return okForVersion !== ver;
}

function isOkForVersion(appVersion) {
    const ver = String(appVersion || '').trim();
    if (!ver) return false;
    return readGateState().okForVersion === ver;
}

module.exports = {
    GATE_FILE_NAME,
    getGateFilePath,
    readGateState,
    writeOkForVersion,
    clearOkForVersion,
    needsEnvDoctorGate,
    isOkForVersion,
};
