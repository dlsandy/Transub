/**
 * TDP (language data pack) Ed25519 verify/sign.
 * Message: UTF-8 "TDP1|" + version + "|" + sha256_hex_lowercase
 * Separate keypair from TSUB1 license keys.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTdpCrypto = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function tdpCryptoFactory() {
    const crypto = require('crypto');

    /** Built-in verify key (SPKI DER, base64). Private key: .tdp-private.b64 / TRANSUB_TDP_PRIVATE_KEY_PKCS8_B64 */
    const DEFAULT_PUBLIC_KEY_SPKI_B64 = 'MCowBQYDK2VwAyEAxfnmf81yGxWXiOGXWmsqOit8Tx1qFnItpY/db6ZRnq0=';

    const MESSAGE_PREFIX = 'TDP1|';

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
        if (!der.length) throw new Error('缺少 TDP 私钥');
        return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    }

    function normalizeVersion(version) {
        return String(version || '').trim();
    }

    function normalizeSha256Hex(sha256) {
        return String(sha256 || '').trim().toLowerCase();
    }

    function buildSignMessage(version, sha256Hex) {
        const v = normalizeVersion(version);
        const h = normalizeSha256Hex(sha256Hex);
        if (!v) throw new Error('缺少 version');
        if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('sha256 无效');
        return `${MESSAGE_PREFIX}${v}|${h}`;
    }

    function sha256HexOfBuffer(buf) {
        return crypto.createHash('sha256').update(buf).digest('hex');
    }

    function signPackHash(version, sha256Hex, privateKeyPkcs8B64) {
        const message = buildSignMessage(version, sha256Hex);
        const key = loadPrivateKey(privateKeyPkcs8B64);
        const sig = crypto.sign(null, Buffer.from(message, 'utf8'), key);
        return b64urlEncode(sig);
    }

    /**
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function verifyPackSignature({
        version,
        sha256,
        sig,
        publicKeySpkiB64 = DEFAULT_PUBLIC_KEY_SPKI_B64,
    } = {}) {
        try {
            const message = buildSignMessage(version, sha256);
            const pub = loadPublicKey(publicKeySpkiB64);
            const sigBuf = b64urlDecode(sig);
            if (!sigBuf.length) return { ok: false, error: '签名缺失' };
            const good = crypto.verify(null, Buffer.from(message, 'utf8'), pub, sigBuf);
            if (!good) return { ok: false, error: '数据签名无效' };
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || '验签失败' };
        }
    }

    /**
     * Verify file bytes against manifest fields.
     * @returns {{ ok: true, sha256: string } | { ok: false, error: string }}
     */
    function verifyPackBuffer(buf, {
        version,
        sha256,
        sig,
        size,
        publicKeySpkiB64 = DEFAULT_PUBLIC_KEY_SPKI_B64,
    } = {}) {
        if (!Buffer.isBuffer(buf) || !buf.length) {
            return { ok: false, error: '数据包为空' };
        }
        if (size != null && Number(size) > 0 && buf.length !== Number(size)) {
            return { ok: false, error: `大小不匹配（期望 ${size}，实际 ${buf.length}）` };
        }
        const actual = sha256HexOfBuffer(buf);
        const expected = normalizeSha256Hex(sha256);
        if (expected && actual !== expected) {
            return { ok: false, error: '校验和不匹配' };
        }
        const signed = verifyPackSignature({
            version,
            sha256: expected || actual,
            sig,
            publicKeySpkiB64,
        });
        if (!signed.ok) return signed;
        return { ok: true, sha256: actual };
    }

    return {
        DEFAULT_PUBLIC_KEY_SPKI_B64,
        MESSAGE_PREFIX,
        b64urlEncode,
        b64urlDecode,
        loadPublicKey,
        loadPrivateKey,
        buildSignMessage,
        sha256HexOfBuffer,
        signPackHash,
        verifyPackSignature,
        verifyPackBuffer,
    };
}));
