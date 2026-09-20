/**
 * Reconstruct payload helpers safe to ship in app.asar (settings merge only).
 */

/**
 * Align reconstruct / film reconstruct with main-window smart-translate settings.
 * @param {object} payload
 * @returns {object}
 */
function enrichReconstructPayloadFromSettings(payload = {}) {
    const out = payload && typeof payload === 'object' ? payload : {};
    try {
        const { loadSettings } = require('./settings-data');
        const opts = loadSettings()?.options || {};
        if (out.sakuraNsfwPrompt == null && out.nsfw == null) {
            if (opts.sakuraNsfwPrompt === true || opts.smartTranslateFaithfulTone) {
                out.sakuraNsfwPrompt = true;
            }
        }
        if (out.faithfulTone == null && out.smartTranslateFaithfulTone == null) {
            if (opts.smartTranslateFaithfulTone) {
                out.faithfulTone = true;
                out.smartTranslateFaithfulTone = true;
            }
        }
        if (!out.contentProfile && !out.senseProfile) {
            const name = String(
                out.fileName || out.path || out.videoPath || out.sourcePath || '',
            ).trim();
            if (name) {
                const { classifyContentProfile } = require('../src/js/content-profile-core');
                const hit = classifyContentProfile({
                    fileName: name,
                    path: name,
                    language: 'ja',
                });
                if (hit?.profile) out.contentProfile = hit.profile;
                if (hit?.strongAv) out.strongAv = true;
            }
        }
    } catch (_) { /* ignore */ }
    return out;
}

module.exports = {
    enrichReconstructPayloadFromSettings,
};
