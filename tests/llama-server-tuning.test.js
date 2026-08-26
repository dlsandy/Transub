const assert = require('assert');
const tuning = require('../src/js/llama-server-tuning-core');

describe('llama-server-tuning-core', () => {
    it('normalizes parallel mode', () => {
        assert.strictEqual(tuning.normalizeLlamaParallelMode('auto'), 'auto');
        assert.strictEqual(tuning.normalizeLlamaParallelMode('off'), 'off');
        assert.strictEqual(tuning.normalizeLlamaParallelMode('2'), '2');
        assert.strictEqual(tuning.normalizeLlamaParallelMode(''), 'auto');
    });

    it('builds spawn args with -np when slots > 1', () => {
        const args = tuning.buildLlamaServerSpawnArgs({
            modelPath: 'C:\\models\\a.gguf',
            port: 39281,
            contextSize: 4096,
            nGpuLayers: 99,
            alias: 'sakura-1.5b',
            parallelSlots: 2,
        });
        assert.ok(args.includes('-np'));
        assert.ok(args.includes('2'));
        assert.ok(args.includes('-m'));
    });

    it('builds spawn args with speculative draft when enabled', () => {
        const args = tuning.buildLlamaServerSpawnArgs({
            modelPath: 'C:\\models\\main.gguf',
            port: 39281,
            contextSize: 4096,
            nGpuLayers: 99,
            alias: 'qwen25-7b',
            parallelSlots: 1,
            draftModelPath: 'C:\\models\\draft.gguf',
            speculativeEnabled: true,
        });
        assert.ok(args.includes('-md'));
        assert.ok(args.includes('C:\\models\\draft.gguf'));
        assert.ok(args.includes('--spec-type'));
        assert.ok(args.includes('draft-simple'));
        assert.ok(args.includes('--spec-draft-n-max'));
    });

    it('forces single slot after ASR or when mode is off', () => {
        assert.strictEqual(tuning.resolveParallelSlots({
            mode: '4',
            paramBillion: 1.5,
            nGpuLayers: 99,
            gpuFreeMiB: 16384,
            afterAsr: true,
        }), 1);
        assert.strictEqual(tuning.resolveParallelSlots({
            mode: 'off',
            paramBillion: 1.5,
            nGpuLayers: 99,
            gpuFreeMiB: 16384,
        }), 1);
    });

    it('auto mode caps 7B to 2 slots on moderate VRAM', () => {
        const slots = tuning.resolveParallelSlots({
            mode: 'auto',
            paramBillion: 7,
            contextSize: 8192,
            nGpuLayers: 99,
            gpuFreeMiB: 14000,
        });
        assert.ok(slots >= 1 && slots <= 2);
    });

    it('blocks smart translate parallel unless enabled', () => {
        assert.strictEqual(tuning.resolveParallelSlots({
            mode: 'auto',
            purpose: 'smart',
            smartTranslateParallel: false,
            paramBillion: 7,
            nGpuLayers: 99,
            gpuFreeMiB: 20000,
        }), 1);
        assert.ok(tuning.resolveParallelSlots({
            mode: 'auto',
            purpose: 'smart',
            smartTranslateParallel: true,
            paramBillion: 7,
            nGpuLayers: 99,
            gpuFreeMiB: 20000,
        }) >= 1);
    });
});
