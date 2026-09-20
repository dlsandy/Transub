/**
 * Pro license activation lifecycle: activate / revalidate / deactivate + persist.
 * Bound from advanced-bridge via createAdvancedLicenseLifecycle(host).
 * No proprietary prompts/algorithms.
 */
const { asString } = require('./ipc-validate');

/**
 * @param {object} host
 * @param {() => string} host.getAdvancedDeviceId
 * @param {() => string} host.getDeviceLabel
 * @param {() => { doc: object }} host.readAdvancedDoc
 * @param {(doc: object) => void} host.ensureByokLoaded
 * @param {object} host.licenseCrypto
 * @param {object} host.entitlement
 * @param {(doc: object, license: object) => { ok: boolean, doc?: object, error?: string }} [host.persistLicense]
 * @param {(patch: object) => { ok: boolean, doc?: object, error?: string }} [host.writeAdvancedDoc]
 * @param {() => void} host.syncMainWindowTitle
 * @param {(doc: object, deviceId: string) => object} host.publicStatus
 * @param {() => boolean} host.shouldUseLicenseServer
 * @param {() => boolean} host.isDevUnlockEnabled
 */
function createAdvancedLicenseLifecycle(host = {}) {
    const required = [
        'getAdvancedDeviceId',
        'getDeviceLabel',
        'readAdvancedDoc',
        'ensureByokLoaded',
        'licenseCrypto',
        'entitlement',
        'syncMainWindowTitle',
        'publicStatus',
        'shouldUseLicenseServer',
        'isDevUnlockEnabled',
    ];
    for (const key of required) {
        if (host[key] == null) {
            throw new Error(`createAdvancedLicenseLifecycle: host.${key} required`);
        }
        if (key === 'licenseCrypto' || key === 'entitlement') {
            if (typeof host[key] !== 'object') {
                throw new Error(`createAdvancedLicenseLifecycle: host.${key} required`);
            }
            continue;
        }
        if (typeof host[key] !== 'function') {
            throw new Error(`createAdvancedLicenseLifecycle: host.${key} required`);
        }
    }
    if (typeof host.persistLicense !== 'function' && typeof host.writeAdvancedDoc !== 'function') {
        throw new Error('createAdvancedLicenseLifecycle: host.persistLicense or host.writeAdvancedDoc required');
    }

    function persistLicense(doc, license) {
        if (typeof host.persistLicense === 'function') {
            return host.persistLicense(doc, license);
        }
        const entitlement = host.entitlement;
        return host.writeAdvancedDoc({
            ...doc,
            license,
            byok: doc.byok,
            llmSource: entitlement.normalizeLlmSource(doc.llmSource),
            managedLlm: entitlement.normalizeManagedLlm(doc.managedLlm),
            byokKeyBlob: asString(doc.byokKeyBlob, 16384),
            licenseServerUrl: doc.licenseServerUrl || '',
            reconstructMock: !!doc.reconstructMock,
        });
    }

    /**
     * 本地验签 + 服务端设备硬限制（Worker KV）。
     * 开发解锁跳过服务端绑定。
     */
    async function activateWithKey(licenseKey, { transfer = false } = {}) {
        const deviceId = host.getAdvancedDeviceId();
        const label = host.getDeviceLabel();
        const now = Date.now();
        const { licenseCrypto, entitlement } = host;

        const verified = licenseCrypto.verifyLicenseKey(licenseKey);
        if (!verified.ok) {
            return { ok: false, error: verified.error };
        }

        const current = host.readAdvancedDoc();
        const doc = current.doc;
        host.ensureByokLoaded(doc);

        let license = entitlement.normalizeLicenseState({
            ...doc.license,
            key: verified.key,
            licenseId: verified.payload.licenseId,
            features: verified.payload.features,
            product: verified.payload.product,
            expiresAt: verified.payload.expiresAt || null,
        });

        if (doc.license?.licenseId && doc.license.licenseId !== verified.payload.licenseId) {
            license.devices = [];
            license.lastTransferAt = null;
            license.activatedAt = null;
            license.lastValidatedAt = null;
        }

        if (host.shouldUseLicenseServer()) {
            const afdian = require('./advanced-afdian');
            const remote = transfer
                ? await afdian.transferLicenseDevice({ licenseKey: verified.key, deviceId, label })
                : await afdian.bindLicenseDevice({ licenseKey: verified.key, deviceId, label });
            if (!remote.ok) {
                return {
                    ok: false,
                    error: remote.error || (transfer ? '换机失败' : '激活失败'),
                    code: remote.code,
                    hint: remote.hint,
                    retryAt: remote.retryAt,
                    retryInMs: remote.retryInMs,
                };
            }
            license.devices = Array.isArray(remote.devices) ? remote.devices : license.devices;
            if (remote.lastTransferAt) license.lastTransferAt = remote.lastTransferAt;
            if (!license.activatedAt) license.activatedAt = new Date(now).toISOString();
            license = entitlement.markValidated(license, now);
            const saved = persistLicense(doc, license);
            if (!saved.ok) return { ok: false, error: saved.error };
            const status = host.publicStatus(saved.doc, deviceId);
            host.syncMainWindowTitle();
            try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
            return {
                ok: true,
                transferred: !!transfer && !!remote.transferred,
                alreadyBound: !!remote.alreadyBound,
                status,
                serverBound: true,
            };
        }

        // Offline / TRANSUB_LICENSE_SKIP_SERVER=1: local-only bind
        let bindResult;
        if (transfer) {
            bindResult = entitlement.transferToDevice(license, deviceId, { now, label });
        } else {
            bindResult = entitlement.bindDevice(license, deviceId, { now, label });
            if (!bindResult.ok && bindResult.code === 'device_limit') {
                return {
                    ok: false,
                    error: bindResult.error,
                    code: 'device_limit',
                    hint: '可调用换机（每 30 天最多 1 次）',
                };
            }
        }
        if (!bindResult.ok) {
            return {
                ok: false,
                error: bindResult.error,
                code: bindResult.code,
                retryAt: bindResult.retryAt,
                retryInMs: bindResult.retryInMs,
            };
        }

        license = entitlement.markValidated(bindResult.license, now);
        const saved = persistLicense(doc, license);
        if (!saved.ok) return { ok: false, error: saved.error };

        const status = host.publicStatus(saved.doc, deviceId);
        host.syncMainWindowTitle();
        try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
        return {
            ok: true,
            transferred: !!transfer && !bindResult.alreadyBound,
            alreadyBound: !!bindResult.alreadyBound,
            status,
            serverBound: false,
        };
    }

    async function revalidateLicense() {
        const deviceId = host.getAdvancedDeviceId();
        const current = host.readAdvancedDoc();
        const doc = current.doc;
        host.ensureByokLoaded(doc);
        const lic = doc.license;
        const { licenseCrypto, entitlement } = host;

        if (host.isDevUnlockEnabled() && !lic?.key) {
            return {
                ok: true,
                status: host.publicStatus(doc, deviceId),
                message: '开发解锁模式，无需复核',
            };
        }

        if (!lic?.key) {
            return { ok: false, error: '尚未激活许可' };
        }

        const verified = licenseCrypto.verifyLicenseKey(lic.key);
        if (!verified.ok) {
            // Persist expiresAt from a previously timed key so UI can show「体验已到期」even if crypto rejects.
            if (String(verified.error || '').includes('过期') && lic.expiresAt) {
                const status = host.publicStatus(doc, deviceId);
                return { ok: false, error: verified.error || '许可已过期', code: 'expired', status };
            }
            return { ok: false, error: verified.error || '许可无效' };
        }

        if (host.shouldUseLicenseServer()) {
            const afdian = require('./advanced-afdian');
            const remote = await afdian.revalidateLicenseDevice({
                licenseKey: verified.key,
                deviceId,
            });
            if (!remote.ok) {
                if (remote.code === 'device_unbound') {
                    const unbound = entitlement.normalizeLicenseState({
                        ...lic,
                        features: verified.payload.features,
                        expiresAt: verified.payload.expiresAt || null,
                        devices: Array.isArray(remote.devices) ? remote.devices : [],
                        lastTransferAt: remote.lastTransferAt || lic.lastTransferAt,
                    });
                    const savedUnbound = persistLicense(doc, unbound);
                    try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
                    host.syncMainWindowTitle();
                    return {
                        ok: false,
                        error: remote.error || '本机未绑定，请先激活或换机',
                        code: 'device_unbound',
                        status: host.publicStatus(savedUnbound.ok ? savedUnbound.doc : doc, deviceId),
                    };
                }
                return {
                    ok: false,
                    error: remote.error || '联网复核失败',
                    code: remote.code,
                    status: host.publicStatus(doc, deviceId),
                };
            }
            const merged = entitlement.normalizeLicenseState({
                ...lic,
                features: verified.payload.features,
                expiresAt: verified.payload.expiresAt || null,
                devices: Array.isArray(remote.devices) ? remote.devices : lic.devices,
                lastTransferAt: remote.lastTransferAt || lic.lastTransferAt,
            });
            if (!entitlement.isDeviceBound(merged, deviceId)) {
                // Persist server view so local entitlement matches unbound state.
                const savedUnbound = persistLicense(doc, merged);
                try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
                host.syncMainWindowTitle();
                return {
                    ok: false,
                    error: '本机未绑定，请先激活或换机',
                    code: 'device_unbound',
                    status: host.publicStatus(savedUnbound.ok ? savedUnbound.doc : doc, deviceId),
                };
            }
            const license = entitlement.markValidated(merged, Date.now());
            const saved = persistLicense(doc, license);
            if (!saved.ok) return { ok: false, error: saved.error };
            host.syncMainWindowTitle();
            try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
            return { ok: true, status: host.publicStatus(saved.doc, deviceId), serverBound: true };
        }

        if (!entitlement.isDeviceBound(lic, deviceId)) {
            try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
            return { ok: false, error: '本机未绑定，请先激活或换机', code: 'device_unbound' };
        }

        const license = entitlement.markValidated(
            entitlement.normalizeLicenseState({
                ...lic,
                features: verified.payload.features,
                expiresAt: verified.payload.expiresAt || null,
            }),
            Date.now(),
        );
        const saved = persistLicense(doc, license);
        if (!saved.ok) return { ok: false, error: saved.error };
        host.syncMainWindowTitle();
        try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
        return { ok: true, status: host.publicStatus(saved.doc, deviceId) };
    }

    async function deactivateLicense() {
        const deviceId = host.getAdvancedDeviceId();
        const current = host.readAdvancedDoc();
        const doc = current.doc;
        const prevKey = String(doc.license?.key || '').trim();

        if (prevKey && host.shouldUseLicenseServer()) {
            try {
                const afdian = require('./advanced-afdian');
                await afdian.unbindLicenseDevice({ licenseKey: prevKey, deviceId });
            } catch (_) { /* best-effort */ }
        }

        const license = host.entitlement.emptyLicenseState();
        const saved = persistLicense(doc, license);
        if (!saved.ok) return { ok: false, error: saved.error };
        try {
            require('./tdp-runtime').clearAppliedOverlay();
        } catch { /* ignore */ }
        host.syncMainWindowTitle();
        return { ok: true, status: host.publicStatus(saved.doc, deviceId) };
    }

    return {
        persistLicense,
        activateWithKey,
        revalidateLicense,
        deactivateLicense,
    };
}

module.exports = {
    createAdvancedLicenseLifecycle,
};
