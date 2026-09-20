/**
 * Player → Transub queue handoff: load manifest, stash form patch for renderer.
 */
const fs = require('fs');
const path = require('path');
const core = require('../src/js/player-protocol-core');

/** @type {object|null} */
let pendingFormPatch = null;
/** @type {object|null} */
let pendingMeta = null;

function readManifestFile(manifestPath) {
    const p = String(manifestPath || '').trim();
    if (!p) return null;
    try {
        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) return null;
        const raw = fs.readFileSync(abs, 'utf8');
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : null;
    } catch (err) {
        console.warn('[player-handoff] manifest read failed:', err?.message || err);
        return null;
    }
}

/**
 * @param {object|null} handoff from parsePlayerProtocolUrl
 * @returns {{ meta: object, formPatch: object }}
 */
function enrichPlayerHandoff(handoff) {
    const parsed = handoff && typeof handoff === 'object' ? handoff : null;
    const manifest = parsed?.manifest ? readManifestFile(parsed.manifest) : null;
    const meta = core.mergePlayerHandoffMeta(parsed, manifest);
    const formPatch = core.buildPlayerHandoffFormPatch(meta);
    return { meta, formPatch };
}

function setPendingHandoffOptions(meta, formPatch) {
    pendingMeta = meta && typeof meta === 'object' ? { ...meta } : null;
    pendingFormPatch = formPatch && typeof formPatch === 'object' && Object.keys(formPatch).length
        ? { ...formPatch }
        : null;
}

function consumePendingHandoffOptions() {
    const out = {
        meta: pendingMeta,
        formPatch: pendingFormPatch,
    };
    pendingMeta = null;
    pendingFormPatch = null;
    return out;
}

function peekPendingHandoffOptions() {
    return {
        meta: pendingMeta,
        formPatch: pendingFormPatch,
    };
}

/**
 * Prepare queue handoff side-effects (call before setPendingFilesForWindow).
 * @param {object} handoff
 */
function prepareQueueHandoff(handoff) {
    const { meta, formPatch } = enrichPlayerHandoff(handoff);
    setPendingHandoffOptions(meta, formPatch);
    return { meta, formPatch };
}

module.exports = {
    readManifestFile,
    enrichPlayerHandoff,
    setPendingHandoffOptions,
    consumePendingHandoffOptions,
    peekPendingHandoffOptions,
    prepareQueueHandoff,
    ...core,
};
