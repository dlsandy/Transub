/**
 * Laya / System One API key (optional for local; required for Laya Studio).
 * Electron safeStorage, same pattern as advanced-byok.
 */
const { asString } = require('./ipc-validate');
const byokCrypto = require('./advanced-byok');

/** @type {string} */
let memoryKeyBlob = '';

function setJevApiKey(apiKey) {
    const text = asString(apiKey, 8192).trim();
    if (!text) {
        memoryKeyBlob = '';
        return { ok: true, hasApiKey: false, blob: '' };
    }
    const enc = byokCrypto.encryptSecret(text);
    if (!enc.ok) return enc;
    memoryKeyBlob = enc.blob || '';
    return { ok: true, hasApiKey: !!memoryKeyBlob, blob: memoryKeyBlob, method: enc.method };
}

function clearJevApiKey() {
    memoryKeyBlob = '';
    return { ok: true, hasApiKey: false, blob: '' };
}

function loadJevKeyBlob(blob) {
    memoryKeyBlob = asString(blob, 16384);
    return { ok: true, hasApiKey: !!memoryKeyBlob };
}

function getJevApiKey() {
    if (!memoryKeyBlob) {
        const envKey = String(
            process.env.LAYA_API_KEY
            || process.env.TYPESAFE_API_KEY
            || process.env.JEV_API_KEY
            || '',
        ).trim();
        if (envKey) return { ok: true, apiKey: envKey, hasApiKey: true, fromEnv: true };
        return { ok: true, apiKey: '', hasApiKey: false };
    }
    const dec = byokCrypto.decryptSecret(memoryKeyBlob);
    if (!dec.ok) return { ok: false, error: dec.error, apiKey: '', hasApiKey: false };
    return { ok: true, apiKey: dec.secret || '', hasApiKey: !!dec.secret };
}

function maskJevKeyHint() {
    const got = getJevApiKey();
    if (!got.hasApiKey || !got.apiKey) return '';
    if (got.fromEnv) return 'env';
    const k = got.apiKey;
    if (k.length <= 8) return '••••';
    return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

function getJevPublicConfig() {
    return {
        hasApiKey: !!getJevApiKey().hasApiKey,
        keyHint: maskJevKeyHint(),
    };
}

module.exports = {
    setJevApiKey,
    clearJevApiKey,
    loadJevKeyBlob,
    getJevApiKey,
    maskJevKeyHint,
    getJevPublicConfig,
};
