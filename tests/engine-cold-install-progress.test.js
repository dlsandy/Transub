'use strict';

const assert = require('assert');
const {
    coldInstallStartMessage,
    coldInstallWaitMessage,
    coldInstallWaitPct,
    coldInstallRestartFailMessage,
    formatWaitLabel,
    mustFailClosedOnRestart,
    ensureEngineRunningWithColdInstallProgress,
} = require('../electron/engine-cold-install-progress');

describe('engine-cold-install-progress', () => {
    it('formats wait labels', () => {
        assert.strictEqual(formatWaitLabel(12), '12 秒');
        assert.strictEqual(formatWaitLabel(75), '1 分 15 秒');
    });

    it('keeps wait pct in 92–98', () => {
        assert.strictEqual(coldInstallWaitPct(0), 92);
        assert.strictEqual(coldInstallWaitPct(44), 92);
        assert.strictEqual(coldInstallWaitPct(45), 93);
        assert.strictEqual(coldInstallWaitPct(9999), 98);
    });

    it('mentions cold install and patience in torch messages', () => {
        const start = coldInstallStartMessage('torch-cuda');
        assert.match(start, /2\.5GB/);
        assert.match(start, /92%/);
        const wait = coldInstallWaitMessage('torch-cuda', 90, { deferred: true });
        assert.match(wait, /已等待/);
        assert.match(wait, /手动修复/);
    });

    it('fail message steers users past 92% and to manual whl', () => {
        const msg = coldInstallRestartFailMessage('健康检查超时', {
            deferred: true,
            mode: 'torch-cuda',
        });
        assert.match(msg, /健康检查超时/);
        assert.match(msg, /92%/);
        assert.match(msg, /手动修复/);
    });

    it('mustFailClosedOnRestart honors deferred flag', () => {
        assert.strictEqual(mustFailClosedOnRestart({ deferred: true }), true);
    });

    it('mustFailClosedOnRestart fail-closes ROCm installs', () => {
        assert.strictEqual(mustFailClosedOnRestart({ mode: 'rocm' }), true);
    });

    it('mustFailClosedOnRestart fail-closes XPU installs', () => {
        assert.strictEqual(mustFailClosedOnRestart({ mode: 'xpu' }), true);
        assert.match(coldInstallStartMessage('xpu'), /XPU/);
        assert.match(coldInstallWaitMessage('xpu', 60), /XPU/);
    });

    it('emits heartbeat progress while ensureEngineRunning runs', async () => {
        const events = [];
        let resolveEnsure;
        const ensurePromise = new Promise((resolve) => {
            resolveEnsure = resolve;
        });
        const running = ensureEngineRunningWithColdInstallProgress({
            emit: (info) => events.push(info),
            ensureEngineRunning: async () => ensurePromise,
            ensureOptions: { forceRestart: true },
            mode: 'torch-cuda',
            deferred: true,
            intervalMs: 250,
        });
        await new Promise((r) => setTimeout(r, 600));
        resolveEnsure({ ok: true, baseUrl: 'http://127.0.0.1:8765' });
        const res = await running;
        assert.strictEqual(res.ok, true);
        assert.ok(events.length >= 2, `expected heartbeat events, got ${events.length}`);
        assert.strictEqual(events[0].pct, 92);
        assert.strictEqual(events[0].suggestManual, true);
        assert.ok(events.some((e) => e.coldInstall && /已等待|冷安装/.test(String(e.message || ''))));
    });
});
