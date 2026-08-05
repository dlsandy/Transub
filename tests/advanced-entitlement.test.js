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
    it('rejects entitlement after expiresAt (timed trial)', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic-trial';
        lic.features = ['*'];
        lic.expiresAt = '2026-01-08T00:00:00.000Z';
        const t0 = Date.parse('2026-01-01T00:00:00.000Z');
        lic = entitlement.bindDevice(lic, 'dev-a', { now: t0 }).license;
        lic = entitlement.markValidated(lic, t0);

        const mid = entitlement.evaluateEntitlement(lic, 'dev-a', { now: t0 + 3 * 24 * 60 * 60 * 1000 });
        assert.strictEqual(mid.entitled, true);
        assert.ok(/体验/.test(mid.message));

        const after = entitlement.evaluateEntitlement(lic, 'dev-a', {
            now: Date.parse('2026-01-08T00:00:00.001Z'),
        });
        assert.strictEqual(after.entitled, false);
        assert.strictEqual(after.reason, 'expired');

        const view = entitlement.buildStatusView(lic, 'dev-a', { now: t0 + 24 * 60 * 60 * 1000 });
        assert.strictEqual(view.isTrial, true);
        assert.strictEqual(view.expired, false);
        assert.ok(view.expiresInMs > 0);

        const expiredView = entitlement.buildStatusView(lic, 'dev-a', {
            now: Date.parse('2026-01-09T00:00:00.000Z'),
        });
        assert.strictEqual(expiredView.expired, true);
        assert.strictEqual(expiredView.entitled, false);
    });

    it('buyout without expiresAt stays entitled until revalidation', () => {
        let lic = entitlement.emptyLicenseState();
        lic.key = 'k';
        lic.licenseId = 'lic-buyout';
        const t0 = Date.parse('2026-01-01T00:00:00.000Z');
        lic = entitlement.bindDevice(lic, 'dev-a', { now: t0 }).license;
        lic = entitlement.markValidated(lic, t0);
        assert.strictEqual(lic.expiresAt, null);
        assert.strictEqual(entitlement.isTimedLicense(lic), false);
        assert.strictEqual(
            entitlement.evaluateEntitlement(lic, 'dev-a', { now: t0 + 7 * 24 * 60 * 60 * 1000 }).entitled,
            true,
        );
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

    it('rejects expired keys', () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        const key = cryptoApi.signLicensePayload({
            licenseId: 'trial-1',
            features: ['*'],
            expiresAt: '2026-01-01T00:00:00.000Z',
        }, privB64);
        const expired = cryptoApi.verifyLicenseKey(key, {
            publicKeySpkiB64: pubB64,
            now: Date.parse('2026-01-02T00:00:00.000Z'),
        });
        assert.strictEqual(expired.ok, false);
        assert.ok(/过期/.test(expired.error || ''));
        const ok = cryptoApi.verifyLicenseKey(key, {
            publicKeySpkiB64: pubB64,
            now: Date.parse('2025-12-31T00:00:00.000Z'),
        });
        assert.strictEqual(ok.ok, true);
        assert.strictEqual(ok.payload.expiresAt, '2026-01-01T00:00:00.000Z');
    });
});
