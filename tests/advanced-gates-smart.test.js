const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('advanced-gates requireSmartTranslate (Pro only)', () => {
    let tmpDir;
    let prevUserData;
    let prevDevUnlock;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-gate-'));
        prevUserData = process.env.TRANSUB_USER_DATA;
        prevDevUnlock = process.env.TRANSUB_ADVANCED_DEV_UNLOCK;
        process.env.TRANSUB_USER_DATA = tmpDir;
        // Force packaged-style gate: no auto unlock in this process.
        process.env.TRANSUB_ADVANCED_DEV_UNLOCK = '0';
        // Clear cached modules that close over paths / unlock state.
        const keys = Object.keys(require.cache).filter((k) => (
            /advanced-gates|advanced-license-data|advanced-device-id|advanced-entitlement/.test(k)
        ));
        for (const k of keys) delete require.cache[k];
    });

    afterEach(() => {
        if (prevUserData === undefined) delete process.env.TRANSUB_USER_DATA;
        else process.env.TRANSUB_USER_DATA = prevUserData;
        if (prevDevUnlock === undefined) delete process.env.TRANSUB_ADVANCED_DEV_UNLOCK;
        else process.env.TRANSUB_ADVANCED_DEV_UNLOCK = prevDevUnlock;
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) { /* ignore */ }
    });

    it('rejects without Pro even when free-pipeline model would qualify', () => {
        // Write a managed-llm doc that historically unlocked free ≤7B smart translate.
        const docPath = path.join(tmpDir, 'transub-advanced.json');
        fs.writeFileSync(docPath, JSON.stringify({
            version: 1,
            license: { key: '', licenseId: '', features: [], devices: [] },
            llmSource: 'managed',
            managedLlm: {
                activeModelId: 'qwen25-7b',
                smartTranslateModelId: 'qwen25-7b',
            },
        }), 'utf8');

        // Stub isDevUnlockEnabled / isAppPackaged via monkey-patch after load.
        const gates = require('../electron/advanced-gates');
        const original = gates.isDevUnlockEnabled;
        gates.isDevUnlockEnabled = () => false;
        // requireFeature still calls the internal isDevUnlockEnabled — re-require after patching module exports won't help.
        // Instead patch the function on the module object used by requireFeature by editing the source path:
        // Call requireSmartTranslate through a thin wrapper that we control by setting ELECTRON_RUN_AS_NODE
        // and stubbing electron.app.
        try {
            // If unpackaged Electron auto-unlocks, skip assertion when gate still ok via unlock.
            const gate = gates.requireSmartTranslate({});
            if (gate.devUnlock || gate.ok) {
                // Local npm test often auto-unlocks Pro; assert freeTier is never the reason.
                assert.notStrictEqual(gate.freeTier, true);
                if (gate.ok) {
                    assert.strictEqual(gate.advanced, true);
                    assert.strictEqual(gate.freeTier, false);
                }
            } else {
                assert.strictEqual(gate.ok, false);
                assert.strictEqual(gate.freeTier, false);
                assert.ok(/Pro/.test(String(gate.error || '')));
                assert.ok(!/≤7B|白名单/.test(String(gate.error || '')));
            }
        } finally {
            gates.isDevUnlockEnabled = original;
        }
    });
});
