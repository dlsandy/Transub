const assert = require('assert');
const { createLlmPortReclaim } = require('../electron/llm-port-reclaim');
const { emitRepairLoadProgress } = require('../electron/asr-semantic-repair');

describe('llm port reclaim', () => {
    it('async kill does not use spawnSync and still reports a hit', async () => {
        let syncCalls = 0;
        const reclaim = createLlmPortReclaim({
            platform: 'win32',
            spawnSyncFn: () => {
                syncCalls += 1;
                return { stdout: '' };
            },
            execFileFn: (_cmd, _args, _opts, cb) => {
                setTimeout(() => cb(null, '1\n', ''), 0);
            },
        });
        const hit = await reclaim.killListenersOnPortAsync(39281);
        assert.strictEqual(hit, true);
        assert.strictEqual(syncCalls, 0);
        assert.strictEqual(reclaim.killListenersOnPortSync(1), false);
        assert.strictEqual(syncCalls, 1);
    });

    it('async kill of both reserved ports stays off the sync path', async () => {
        const seen = [];
        const reclaim = createLlmPortReclaim({
            platform: 'win32',
            execFileFn: (_cmd, args, _opts, cb) => {
                seen.push(String(args.join(' ')));
                cb(null, '0', '');
            },
            spawnSyncFn: () => {
                throw new Error('spawnSync must not run');
            },
        });
        const hit = await reclaim.killPortsAsync([39281, 39282]);
        assert.strictEqual(hit, false);
        assert.strictEqual(seen.length, 2);
        assert.match(seen[0], /39281/);
        assert.match(seen[1], /39282/);
    });
});

describe('asr semantic repair load progress', () => {
    it('maps llama load messages onto the repair stage', () => {
        const seen = [];
        emitRepairLoadProgress((info) => seen.push(info), {
            message: '正在加载模型到内存…',
        });
        assert.strictEqual(seen.length, 1);
        assert.strictEqual(seen[0].stage, 'asr_semantic_repair');
        assert.strictEqual(seen[0].detail, '正在加载模型到内存…');
        assert.strictEqual(seen[0].itemDualPhase, 'source');
        emitRepairLoadProgress((info) => seen.push(info), { message: '' });
        assert.strictEqual(seen.length, 1);
    });
});
