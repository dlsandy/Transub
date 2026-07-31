const assert = require('assert');
const { generateKeyPairSync } = require('crypto');
const entitlement = require('../src/js/advanced-entitlement-core');
const cryptoApi = require('../src/js/advanced-license-crypto-core');

describe('advanced-entitlement-core', () => {
    it('enforces max 1 device and transfer cooldown 30 days', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic1';
        lic.features = ['*'];

        const t0 = Date.parse('2026-01-01T00:00:00.000Z');
        let r = entitlement.bindDevice(lic, 'dev-a', { now: t0, label: 'A' });
        assert.strictEqual(r.ok, true);
        lic = r.license;
        r = entitlement.bindDevice(lic, 'dev-b', { now: t0 + 1000, label: 'B' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.code, 'device_limit');

        lic = entitlement.markValidated(lic, t0);
        const ev = entitlement.evaluateEntitlement(lic, 'dev-a', { now: t0 });
        assert.strictEqual(ev.entitled, true);

        // transfer immediately after bind without lastTransferAt should work
        r = entitlement.transferToDevice(lic, 'dev-c', { now: t0 + 3000, label: 'C' });
        assert.strictEqual(r.ok, true);
        lic = r.license;
        assert.ok(entitlement.isDeviceBound(lic, 'dev-c'));
        assert.ok(!entitlement.isDeviceBound(lic, 'dev-a'));
        assert.strictEqual(lic.devices.length, 1);

        // second transfer within 30 days blocked
        r = entitlement.transferToDevice(lic, 'dev-d', { now: t0 + 3000 + 1000 });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.code, 'transfer_cooldown');

        const afterCooldown = t0 + 3000 + entitlement.TRANSFER_COOLDOWN_MS + 1;
        r = entitlement.transferToDevice(lic, 'dev-d', { now: afterCooldown });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.license.devices.length, 1);
    });

    it('requires revalidation after 30 days', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic1';
        const t0 = Date.parse('2026-01-01T00:00:00.000Z');
        lic = entitlement.bindDevice(lic, 'dev-a', { now: t0 }).license;
        lic = entitlement.markValidated(lic, t0);

        assert.strictEqual(
            entitlement.evaluateEntitlement(lic, 'dev-a', { now: t0 + 1000 }).entitled,
            true,
        );
        const stale = t0 + entitlement.REVALIDATE_INTERVAL_MS + 1;
        const ev = entitlement.evaluateEntitlement(lic, 'dev-a', { now: stale });
        assert.strictEqual(ev.entitled, false);
        assert.strictEqual(ev.reason, 'revalidation_required');
    });

    it('gates features', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic1';
        lic.features = ['contextReconstruct'];
        const t0 = Date.now();
        lic = entitlement.bindDevice(lic, 'd1', { now: t0 }).license;
        lic = entitlement.markValidated(lic, t0);
        assert.strictEqual(
            entitlement.isFeatureEntitled(lic, 'd1', 'contextReconstruct', { now: t0 }).entitled,
            true,
        );
        assert.strictEqual(
            entitlement.isFeatureEntitled(lic, 'd1', 'otherFeature', { now: t0 }).entitled,
            false,
        );
        assert.strictEqual(
            entitlement.isFeatureEntitled(lic, 'd1', entitlement.FEATURE_FILM_AUDIO_ENHANCE, { now: t0 }).entitled,
            false,
        );
    });

    it('entitles filmAudioEnhance when listed', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic1';
        lic.features = [entitlement.FEATURE_FILM_AUDIO_ENHANCE];
        const t0 = Date.now();
        lic = entitlement.bindDevice(lic, 'd1', { now: t0 }).license;
        lic = entitlement.markValidated(lic, t0);
        assert.strictEqual(
            entitlement.isFeatureEntitled(lic, 'd1', entitlement.FEATURE_FILM_AUDIO_ENHANCE, { now: t0 }).entitled,
            true,
        );
    });

    it('evaluates free pipeline translate without license', () => {
        const okDoc = entitlement.normalizeAdvancedDoc({
            llmSource: 'managed',
            managedLlm: { activeModelId: 'qwen25-7b' },
        });
        const freeOk = entitlement.evaluateFreePipelineTranslate(okDoc);
        assert.strictEqual(freeOk.ok, true);
        assert.strictEqual(freeOk.modelId, 'qwen25-7b');

        const smartOverride = entitlement.evaluateFreePipelineTranslate(
            entitlement.normalizeAdvancedDoc({
                llmSource: 'managed',
                managedLlm: { activeModelId: 'qwen25-14b', smartTranslateModelId: 'qwen25-7b' },
            }),
        );
        assert.strictEqual(smartOverride.ok, true);
        assert.strictEqual(smartOverride.modelId, 'qwen25-7b');

        const byok = entitlement.evaluateFreePipelineTranslate(
            entitlement.normalizeAdvancedDoc({ llmSource: 'byok', managedLlm: { activeModelId: 'qwen25-7b' } }),
        );
        assert.strictEqual(byok.ok, false);
        assert.strictEqual(byok.reason, 'byok_requires_advanced');

        const big = entitlement.evaluateFreePipelineTranslate(
            entitlement.normalizeAdvancedDoc({ llmSource: 'managed', managedLlm: { activeModelId: 'qwen25-14b' } }),
        );
        assert.strictEqual(big.ok, false);
        assert.strictEqual(big.reason, 'model_not_free');

        const faithful = entitlement.evaluateFreePipelineTranslate(okDoc, { faithfulTone: true });
        assert.strictEqual(faithful.ok, true);
        assert.strictEqual(faithful.modelId, 'qwen25-7b');

        const missing = entitlement.evaluateFreePipelineTranslate(
            entitlement.normalizeAdvancedDoc({ llmSource: 'managed', managedLlm: { activeModelId: '' } }),
        );
        assert.strictEqual(missing.ok, false);
        assert.strictEqual(missing.reason, 'model_missing');

        const notInstalled = entitlement.evaluateFreePipelineTranslate(okDoc, {
            isModelInstalled: () => false,
        });
        assert.strictEqual(notInstalled.ok, false);
        assert.strictEqual(notInstalled.reason, 'model_not_installed');

        const installed = entitlement.evaluateFreePipelineTranslate(okDoc, {
            isModelInstalled: () => true,
        });
        assert.strictEqual(installed.ok, true);
    });
});
describe('advanced-license-crypto-core', () => {
    it('signs and verifies with matching keypair', () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        const key = cryptoApi.signLicensePayload({
            licenseId: 'test-lic-1',
            features: ['*'],
        }, privB64);
        assert.ok(key.startsWith('TSUB1.'));
        const verified = cryptoApi.verifyLicenseKey(key, { publicKeySpkiB64: pubB64 });
        assert.strictEqual(verified.ok, true);
        assert.strictEqual(verified.payload.licenseId, 'test-lic-1');
    });

    it('rejects tampered payload', () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        const key = cryptoApi.signLicensePayload({ licenseId: 'x' }, privB64);
        const parts = key.split('.');
        parts[1] = cryptoApi.b64urlEncode(Buffer.from(JSON.stringify({
            v: 1,
            licenseId: 'hacked',
            features: ['*'],
            product: 'transub-advanced',
        }), 'utf8'));
        const bad = parts.join('.');
        const verified = cryptoApi.verifyLicenseKey(bad, { publicKeySpkiB64: pubB64 });
        assert.strictEqual(verified.ok, false);
    });
});
