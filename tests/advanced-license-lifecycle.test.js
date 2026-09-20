const assert = require('assert');
const { createAdvancedLicenseLifecycle } = require('../electron/advanced-license-lifecycle');

function mockHost(overrides = {}) {
    return {
        getAdvancedDeviceId: () => 'device-test',
        getDeviceLabel: () => 'test-pc',
        readAdvancedDoc: () => ({ doc: { license: {}, byok: {}, managedLlm: {} } }),
        ensureByokLoaded: () => {},
        licenseCrypto: {
            verifyLicenseKey: () => ({ ok: false, error: '许可无效' }),
        },
        entitlement: {
            normalizeLicenseState: (x) => x,
            markValidated: (x) => x,
            bindDevice: () => ({ ok: false }),
            transferToDevice: () => ({ ok: false }),
            isDeviceBound: () => false,
            emptyLicenseState: () => ({}),
            normalizeLlmSource: (x) => x || 'managed',
            normalizeManagedLlm: (x) => x || {},
        },
        writeAdvancedDoc: (doc) => ({ ok: true, doc }),
        syncMainWindowTitle: () => {},
        publicStatus: () => ({ entitled: false }),
        shouldUseLicenseServer: () => false,
        isDevUnlockEnabled: () => false,
        ...overrides,
    };
}

describe('advanced-license-lifecycle factory', () => {
    it('exports createAdvancedLicenseLifecycle with lifecycle APIs', () => {
        const api = createAdvancedLicenseLifecycle(mockHost());
        assert.strictEqual(typeof api.activateWithKey, 'function');
        assert.strictEqual(typeof api.revalidateLicense, 'function');
        assert.strictEqual(typeof api.deactivateLicense, 'function');
        assert.strictEqual(typeof api.persistLicense, 'function');
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedLicenseLifecycle({}),
            /createAdvancedLicenseLifecycle: host\.\w+ required/,
        );
    });

    it('activateWithKey returns early on verify failure', async () => {
        let wrote = false;
        const api = createAdvancedLicenseLifecycle(mockHost({
            licenseCrypto: {
                verifyLicenseKey: () => ({ ok: false, error: '密钥格式错误' }),
            },
            writeAdvancedDoc: () => {
                wrote = true;
                return { ok: true, doc: {} };
            },
        }));
        const res = await api.activateWithKey('bad-key');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '密钥格式错误');
        assert.strictEqual(wrote, false);
    });

    it('revalidateLicense returns early when no key', async () => {
        const api = createAdvancedLicenseLifecycle(mockHost({
            readAdvancedDoc: () => ({ doc: { license: {} } }),
            isDevUnlockEnabled: () => false,
        }));
        const res = await api.revalidateLicense();
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '尚未激活许可');
    });

    it('revalidateLicense early-returns in dev unlock without key', async () => {
        const api = createAdvancedLicenseLifecycle(mockHost({
            readAdvancedDoc: () => ({ doc: { license: {} } }),
            isDevUnlockEnabled: () => true,
            publicStatus: () => ({ entitled: true, reason: 'dev_unlock' }),
        }));
        const res = await api.revalidateLicense();
        assert.strictEqual(res.ok, true);
        assert.ok(String(res.message || '').includes('开发解锁'));
    });
});
