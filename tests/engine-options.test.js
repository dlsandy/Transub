const assert = require('assert');
const {
    mergeEngineOptions,
    mapTaskToEngineTask,
    isApiCompatible,
    normalizeEngineBackend,
    normalizeVadModelId,
} = require('../electron/engine-options');
const { joinUrl } = require('../electron/engine-client');

describe('engine-options', () => {
    it('defaults to transub backend', () => {
        const opts = mergeEngineOptions({});
        assert.strictEqual(opts.engineBackend, 'transub');
        assert.strictEqual(opts.engineAsrModel, 'sensevoice-small');
        assert.strictEqual(opts.engineInstallPath, '');
        assert.ok(String(opts.engineUrl).includes('127.0.0.1'));
        assert.strictEqual(opts.engineHfEndpoint, 'https://hf-mirror.com');
    });

    it('preserves empty engine install path', () => {
        const opts = mergeEngineOptions({ engineInstallPath: '' });
        assert.strictEqual(opts.engineInstallPath, '');
    });

    it('resolves empty install path to vendored transub-engine when present', () => {
        const { resolveEngineInstallPath } = require('../electron/engine-options');
        const { getBundledEnginePathIfPresent, isValidEngineRoot } = require('../electron/app-paths');
        const path = require('path');
        const bundled = getBundledEnginePathIfPresent();
        assert.ok(bundled, 'expected vendored transub-engine/ in repo');
        assert.ok(isValidEngineRoot(bundled), 'bundled engine root should be valid');
        assert.strictEqual(resolveEngineInstallPath(''), bundled);
        assert.strictEqual(resolveEngineInstallPath(bundled), path.resolve(bundled));
        const custom = path.join(bundled, '..', 'does-not-exist-engine');
        assert.strictEqual(resolveEngineInstallPath(custom), path.resolve(custom));
    });

    it('prefers standalone runtime python over source layout', () => {
        const { resolveEngineEntrypoints } = require('../electron/engine-bridge');
        const { getBundledEnginePathIfPresent } = require('../electron/app-paths');
        const path = require('path');
        const fs = require('fs');
        const bundled = getBundledEnginePathIfPresent();
        assert.ok(bundled);
        const entry = resolveEngineEntrypoints(bundled);
        assert.ok(entry, 'expected engine entrypoint');
        assert.strictEqual(entry.type, 'module');
        assert.ok(
            String(entry.command).toLowerCase().endsWith(`${path.sep}runtime${path.sep}python.exe`.toLowerCase())
            || String(entry.command).toLowerCase().includes(`${path.sep}runtime${path.sep}python`.toLowerCase()),
            `expected runtime python, got ${entry.command}`,
        );
        assert.ok(fs.existsSync(entry.command));
        assert.deepStrictEqual(entry.args, ['-m', 'transub_engine']);
        assert.strictEqual(entry.runtime, true);
    });

    it('keeps empty hf endpoint when explicitly cleared', () => {
        const opts = mergeEngineOptions({ engineHfEndpoint: '' });
        assert.strictEqual(opts.engineHfEndpoint, '');
    });

    it('normalizes twai aliases', () => {
        assert.strictEqual(normalizeEngineBackend('transwithai'), 'twai');
        assert.strictEqual(normalizeEngineBackend('TWAI'), 'twai');
        assert.strictEqual(normalizeEngineBackend(''), 'transub');
    });

    it('normalizes legacy silero VAD alias to silero-vad', () => {
        assert.strictEqual(normalizeVadModelId('silero'), 'silero-vad');
        assert.strictEqual(normalizeVadModelId('Silero'), 'silero-vad');
        assert.strictEqual(normalizeVadModelId('silero_vad'), 'silero-vad');
        assert.strictEqual(normalizeVadModelId('silero-vad'), 'silero-vad');
        assert.strictEqual(normalizeVadModelId('fsmn-vad'), 'fsmn-vad');
        const opts = mergeEngineOptions({ engineVadModel: 'silero' });
        assert.strictEqual(opts.engineVadModel, 'silero-vad');
    });

    it('maps tasks for free MT and external LLM (smart / Sakura)', () => {
        assert.strictEqual(mapTaskToEngineTask('translate'), 'translate_mt');
        assert.strictEqual(mapTaskToEngineTask('dual'), 'dual');
        assert.strictEqual(mapTaskToEngineTask('transcribe'), 'transcribe');
        // External LLM keeps translate_mt|dual; Engine calls desktop adapter.
        assert.strictEqual(mapTaskToEngineTask('translate', { smartTranslate: true }), 'translate_mt');
        assert.strictEqual(mapTaskToEngineTask('dual', { smartTranslate: true }), 'dual');
        assert.strictEqual(mapTaskToEngineTask('translate', { sakuraMt: true }), 'translate_mt');
        assert.strictEqual(mapTaskToEngineTask('dual', { sakuraMt: true }), 'dual');
    });

    it('detects external MT mode', () => {
        const { usesExternalMt } = require('../electron/engine-options');
        assert.strictEqual(usesExternalMt({ smartTranslate: true }), true);
        assert.strictEqual(usesExternalMt({ sakuraMt: true }), true);
        assert.strictEqual(usesExternalMt({}), false);
    });

    it('checks api major compatibility', () => {
        assert.strictEqual(isApiCompatible('1.0.0'), true);
        assert.strictEqual(isApiCompatible('2.0.0'), false);
        assert.strictEqual(isApiCompatible(''), false);
    });
});

describe('engine-client helpers', () => {
    it('joins urls', () => {
        assert.strictEqual(
            joinUrl('http://127.0.0.1:8765/', '/v1/health'),
            'http://127.0.0.1:8765/v1/health',
        );
        assert.strictEqual(
            joinUrl('http://127.0.0.1:8765', 'v1/health'),
            'http://127.0.0.1:8765/v1/health',
        );
    });
});
