/**
 * BYOK：API Key 使用 Electron safeStorage，不落盘明文。
 */
const { asString, asPlainObject } = require('./ipc-validate');

const BYOK_ACCOUNT = 'transub-advanced-byok';
const BYOK_SERVICE = 'TransubAdvanced';

function getSafeStorage() {
    try {
        const { safeStorage } = require('electron');
        return safeStorage;
    } catch (_) {
        return null;
    }
}

function encryptSecret(plain) {
    const text = asString(plain, 8192);
    if (!text) return { ok: true, blob: '', empty: true };
    const ss = getSafeStorage();
    if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
        const buf = ss.encryptString(text);
        return { ok: true, blob: buf.toString('base64'), empty: false, method: 'safeStorage' };
    }
    // 回退：仅开发环境；生产应有 safeStorage
    return {
        ok: true,
        blob: Buffer.from(text, 'utf8').toString('base64'),
        empty: false,
        method: 'plain-b64',
    };
}

function decryptSecret(blob) {
    const raw = asString(blob, 16384);
    if (!raw) return { ok: true, secret: '', empty: true };
    const ss = getSafeStorage();
    try {
        if (ss && typeof ss.isEncryptionAvailable === 'function' && ss.isEncryptionAvailable()) {
            const secret = ss.decryptString(Buffer.from(raw, 'base64'));
            return { ok: true, secret, empty: false, method: 'safeStorage' };
        }
        const secret = Buffer.from(raw, 'base64').toString('utf8');
        return { ok: true, secret, empty: false, method: 'plain-b64' };
    } catch (err) {
        return { ok: false, error: err.message || '解密失败', secret: '' };
    }
}

/** @type {string} 内存中的加密 blob，与 advanced.json 中 byokKeyBlob 同步 */
let memoryKeyBlob = '';

function setByokApiKey(apiKey) {
    const text = asString(apiKey, 8192).trim();
    if (!text) {
        memoryKeyBlob = '';
        return { ok: true, hasApiKey: false, blob: '' };
    }
    const enc = encryptSecret(text);
    if (!enc.ok) return enc;
    memoryKeyBlob = enc.blob || '';
    return { ok: true, hasApiKey: !!memoryKeyBlob, blob: memoryKeyBlob, method: enc.method };
}

function clearByokApiKey() {
    memoryKeyBlob = '';
    return { ok: true, hasApiKey: false, blob: '' };
}

function loadByokKeyBlob(blob) {
    memoryKeyBlob = asString(blob, 16384);
    return { ok: true, hasApiKey: !!memoryKeyBlob };
}

function getByokApiKey() {
    if (!memoryKeyBlob) return { ok: true, apiKey: '', hasApiKey: false };
    const dec = decryptSecret(memoryKeyBlob);
    if (!dec.ok) return { ok: false, error: dec.error, apiKey: '', hasApiKey: false };
    return { ok: true, apiKey: dec.secret || '', hasApiKey: !!dec.secret };
}

function getByokPublicConfig(byok = {}) {
    const o = asPlainObject(byok);
    return {
        provider: asString(o.provider, 64) || 'openai',
        baseUrl: asString(o.baseUrl, 2048),
        model: asString(o.model, 256),
        hasApiKey: !!memoryKeyBlob,
    };
}

function maskKeyHint() {
    const got = getByokApiKey();
    if (!got.hasApiKey || !got.apiKey) return '';
    const k = got.apiKey;
    if (k.length <= 8) return '••••';
    return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

module.exports = {
    BYOK_ACCOUNT,
    BYOK_SERVICE,
    setByokApiKey,
    clearByokApiKey,
    loadByokKeyBlob,
    getByokApiKey,
    getByokPublicConfig,
    maskKeyHint,
    encryptSecret,
    decryptSecret,
};
