const assert = require('assert');
const { createEngineProcessLifecycle } = require('../electron/engine-process-lifecycle');

describe('engine-process-lifecycle', () => {
    function makeLife(overrides = {}) {
        let proc = overrides.proc ?? null;
        const logs = [];
        const spawns = [];
        const life = createEngineProcessLifecycle({
            getProc: () => proc,
            setProc: (p) => { proc = p; },
            getBaseUrl: () => 'http://127.0.0.1:8765',
            parseHostPort: () => ({ host: '127.0.0.1', port: 8765 }),
            defaultUrl: 'http://127.0.0.1:8765',
            appendEngineLogLine: (line) => logs.push(line),
            releaseGpuMemory: async () => ({ ok: true }),
            mergeEngineOptions: (o) => o || {},
            sleep: async () => {},
            spawnSyncFn: (cmd, args) => {
                spawns.push({ cmd, args });
                return { stdout: '', status: 0 };
            },
            stopLlamaServer: () => { logs.push('llama-stop'); },
            platform: overrides.platform || 'win32',
            ...overrides,
        });
        return { life, logs, spawns, getProc: () => proc, setProc: (p) => { proc = p; } };
    }

    it('stopEngineProcess taskkills on win32', () => {
        const fake = { pid: 4242, kill: () => {} };
        const { life, spawns, getProc, setProc } = makeLife({ proc: fake });
        life.stopEngineProcess();
        assert.strictEqual(getProc(), null);
        assert.ok(spawns.some((s) => s.cmd === 'taskkill'));
        setProc(null);
    });

    it('reclaimLocalComputeAfterEngineBatch matrix', () => {
        const { life, logs } = makeLife();
        life.reclaimLocalComputeAfterEngineBatch({ usedExternalMt: true, failedOrCancelled: false });
        assert.ok(logs.includes('llama-stop'));
        assert.ok(logs.some((l) => l.includes('本地 LLM')));

        const b = makeLife();
        b.life.reclaimLocalComputeAfterEngineBatch({ failedOrCancelled: true });
        assert.ok(b.logs.includes('llama-stop'));
        assert.ok(b.logs.some((l) => l.includes('失败或已中断')));
    });

    it('killListenersOnPort builds powershell on win32', () => {
        const { life, spawns } = makeLife({ platform: 'win32' });
        life.killListenersOnPort(8765);
        assert.ok(spawns.some((s) => s.cmd === 'powershell.exe'));
    });

    it('releaseEngineVramBeforeLocalLlm soft-ok then stop', async () => {
        const { life, logs } = makeLife();
        await life.releaseEngineVramBeforeLocalLlm({});
        assert.ok(logs.some((l) => l.includes('GPU 缓存')));
        assert.ok(logs.some((l) => l.includes('释放显存')));
    });
});
