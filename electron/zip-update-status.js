/**
 * Shared status file helpers for zip update apply + progress UI.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} statusPath
 * @param {{
 *   phase?: string,
 *   message?: string,
 *   percent?: number,
 *   error?: string,
 * }} patch
 */
function writeZipUpdateStatus(statusPath, patch = {}) {
    const file = String(statusPath || '').trim();
    if (!file) return;
    let prev = {};
    try {
        if (fs.existsSync(file)) {
            prev = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
        }
    } catch {
        prev = {};
    }
    const percentRaw = Number(patch.percent);
    const percent = Number.isFinite(percentRaw)
        ? Math.max(0, Math.min(100, percentRaw))
        : (Number.isFinite(Number(prev.percent)) ? Number(prev.percent) : 0);
    const next = {
        ...prev,
        phase: String(patch.phase || prev.phase || 'working'),
        message: String(patch.message != null ? patch.message : (prev.message || '')),
        percent,
        error: patch.error != null ? String(patch.error) : (prev.error || ''),
        updatedAt: new Date().toISOString(),
    };
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    } catch {
        /* ignore */
    }
}

function readZipUpdateStatus(statusPath) {
    const file = String(statusPath || '').trim();
    if (!file || !fs.existsSync(file)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

module.exports = {
    writeZipUpdateStatus,
    readZipUpdateStatus,
};
