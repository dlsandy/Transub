const assert = require('assert');
const {
    shouldAutoEnsureLocalLaya,
    ensureLocalLayaForProTask,
    resetLocalLayaEnsureMemo,
} = require('../electron/jev-laya-ensure');

describe('jev-laya-ensure', () => {
    beforeEach(() => {
        resetLocalLayaEnsureMemo();
    });

    it('shouldAutoEnsureLocalLaya only for local auto', () => {
        assert.strictEqual(shouldAutoEnsureLocalLaya({ jevDecisionMode: 'off' }), false);
        assert.strictEqual(shouldAutoEnsureLocalLaya({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }), true);
        assert.strictEqual(shouldAutoEnsureLocalLaya({
            jevDecisionMode: 'auto',
            jevEndpoint: 'https://api.laya.studio/v1/systemone',
        }), false);
    });

    it('skips when not entitled', async () => {
        const res = await ensureLocalLayaForProTask({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }, {
            gates: { requireJevDecision: () => ({ ok: false, error: 'need pro' }) },
            local: {
                getLocalLayaStatus: async () => { throw new Error('should not call'); },
            },
        });
        assert.strictEqual(res.skipped, true);
        assert.strictEqual(res.reason, 'not_entitled');
    });

    it('installs when missing then reports ok', async () => {
        const calls = [];
        const res = await ensureLocalLayaForProTask({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }, {
            gates: { requireJevDecision: () => ({ ok: true }) },
            local: {
                getLocalLayaStatus: async () => ({
                    local: true,
                    installed: false,
                    reachable: false,
                }),
                installLocalLaya: async () => {
                    calls.push('install');
                    return { ok: true, installed: true, started: true, message: 'ok' };
                },
                startLocalLaya: async () => {
                    calls.push('start');
                    return { ok: true, started: true };
                },
            },
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.installed, true);
        assert.deepStrictEqual(calls, ['install']);
    });

    it('starts when installed but down', async () => {
        const res = await ensureLocalLayaForProTask({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }, {
            force: true,
            gates: { requireJevDecision: () => ({ ok: true }) },
            local: {
                getLocalLayaStatus: async () => ({
                    local: true,
                    installed: true,
                    reachable: false,
                }),
                installLocalLaya: async () => ({ ok: false, error: 'should not install' }),
                startLocalLaya: async () => ({ ok: true, started: true }),
            },
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.started, true);
    });

    it('no-ops when already reachable', async () => {
        let started = 0;
        const res = await ensureLocalLayaForProTask({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }, {
            force: true,
            gates: { requireJevDecision: () => ({ ok: true }) },
            local: {
                getLocalLayaStatus: async () => ({
                    local: true,
                    installed: true,
                    reachable: true,
                }),
                startLocalLaya: async () => {
                    started += 1;
                    return { ok: true };
                },
            },
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.already, true);
        assert.strictEqual(started, 0);
    });

    it('soft-times out so batch can continue', async () => {
        const res = await ensureLocalLayaForProTask({
            jevDecisionMode: 'auto',
            jevDecisionEndpoint: 'local',
        }, {
            force: true,
            timeoutMs: 40,
            gates: { requireJevDecision: () => ({ ok: true }) },
            local: {
                getLocalLayaStatus: async () => {
                    await new Promise((r) => setTimeout(r, 500));
                    return { local: true, installed: false, reachable: false };
                },
                installLocalLaya: async () => ({ ok: false, error: 'late' }),
            },
        });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.timedOut, true);
    });
});
