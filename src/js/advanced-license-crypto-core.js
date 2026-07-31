/**
 * Advanced 许可密钥：TSUB1.<payload_b64url>.<sig_b64url>（Ed25519）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAdvancedLicenseCrypto = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function advancedLicenseCryptoFactory() {
    const crypto = require('crypto');

    /** 内置验签公钥（SPKI DER，base64）。签发私钥勿入库，见 tools/sign-advanced-license.js */
    const DEFAULT_PUBLIC_KEY_SPKI_B64 = 'MCowBQYDK2VwAyEAS9Rf/Av29ZuVFc0DxRouNvbyhcA3XF5dd6pbKKhqnAs=';

    function b64urlEncode(buf) {
        return Buffer.from(buf).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function b64urlDecode(str) {
        const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
        return Buffer.from(s + pad, 'base64');
    }

    function loadPublicKey(spkiB64 = DEFAULT_PUBLIC_KEY_SPKI_B64) {
        const der = Buffer.from(String(spkiB64 || DEFAULT_PUBLIC_KEY_SPKI_B64), 'base64');
        return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    }

    function loadPrivateKey(pkcs8B64) {
        const der = Buffer.from(String(pkcs8B64 || ''), 'base64');
        if (!der.length) throw new Error('缺少私钥');
        return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    }

    function normalizePayload(input = {}) {
        const licenseId = String(input.licenseId || input.lid || '').trim();
        if (!licenseId) throw new Error('缺少 licenseId');
        const features = Array.isArray(input.features) && input.features.length
            ? input.features.map((f) => String(f).trim()).filter(Boolean)
            : ['*'];
        return {
            v: 1,
            licenseId,
            features,
            product: String(input.product || 'transub-advanced').trim() || 'transub-advanced',
            issuedAt: input.issuedAt || new Date().toISOString(),
            expiresAt: input.expiresAt || null,
        };
    }

    function signLicensePayload(payloadInput, privateKeyPkcs8B64) {
        const payload = normalizePayload(payloadInput);
        const payloadJson = JSON.stringify(payload);
        const payloadPart = b64urlEncode(Buffer.from(payloadJson, 'utf8'));
        const key = loadPrivateKey(privateKeyPkcs8B64);
        const sig = crypto.sign(null, Buffer.from(payloadPart, 'utf8'), key);
        return `TSUB1.${payloadPart}.${b64urlEncode(sig)}`;
    }

    /**
     * @returns {{ ok: true, payload: object, key: string } | { ok: false, error: string }}
     */
    function verifyLicenseKey(licenseKey, { publicKeySpkiB64 = DEFAULT_PUBLIC_KEY_SPKI_B64, now = Date.now() } = {}) {
        const key = String(licenseKey || '').trim();
        const parts = key.split('.');
        if (parts.length !== 3 || parts[0] !== 'TSUB1') {
            return { ok: false, error: '许可密钥格式无效' };
        }
        const [, payloadPart, sigPart] = parts;
        if (!payloadPart || !sigPart) {
            return { ok: false, error: '许可密钥格式无效' };
        }
        let payload;
        try {
            payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'));
        } catch (_) {
            return { ok: false, error: '许可载荷无法解析' };
        }
        if (!payload || typeof payload !== 'object') {
            return { ok: false, error: '许可载荷无效' };
        }
        if (Number(payload.v) !== 1) {
            return { ok: false, error: '不支持的许可版本' };
        }
        if (!String(payload.licenseId || '').trim()) {
            return { ok: false, error: '许可缺少 licenseId' };
        }
        if (String(payload.product || '') !== 'transub-advanced') {
            return { ok: false, error: '许可产品不匹配' };
        }
        if (payload.expiresAt) {
            const exp = new Date(payload.expiresAt).getTime();
            if (Number.isFinite(exp) && now > exp) {
                return { ok: false, error: '许可已过期' };
            }
        }
        try {
            const pub = loadPublicKey(publicKeySpkiB64);
            const sig = b64urlDecode(sigPart);
            const good = crypto.verify(null, Buffer.from(payloadPart, 'utf8'), pub, sig);
            if (!good) return { ok: false, error: '许可签名无效' };
        } catch (err) {
            return { ok: false, error: err.message || '验签失败' };
        }
        return {
            ok: true,
            key,
            payload: {
                v: 1,
                licenseId: String(payload.licenseId).trim(),
                features: Array.isArray(payload.features) ? payload.features : ['*'],
                product: 'transub-advanced',
                issuedAt: payload.issuedAt || null,
                expiresAt: payload.expiresAt || null,
            },
        };
    }

    return {
        DEFAULT_PUBLIC_KEY_SPKI_B64,
        b64urlEncode,
        b64urlDecode,
        loadPublicKey,
        loadPrivateKey,
        normalizePayload,
        signLicensePayload,
        verifyLicenseKey,
    };
}));
