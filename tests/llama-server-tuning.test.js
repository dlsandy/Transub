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

    it('builds spawn args with Ornith MTP / MoE / FA presets', () => {
        const args = tuning.buildLlamaServerSpawnArgs({
            modelPath: 'C:\\models\\ornith.gguf',
            port: 39281,
            contextSize: 8192,
            nGpuLayers: 999,
            alias: 'ornith-15-35b-ymq-m',
            parallelSlots: 1,
            forceSingleSlot: true,
            flashAttn: true,
            batchSize: 512,
            reasoning: 'off',
            cacheTypeK: 'q8_0',
            cacheTypeV: 'q8_0',
            moe: true,
            nCpuMoe: 14,
            gpuTotalMiB: 10240,
            specType: 'draft-mtp',
            specDraftNMax: 2,
            temp: 0.1,
            topP: 0.7,
            topK: 0,
            repeatLastN: 256,
            repeatPenalty: 1.2,
        });
        assert.ok(args.includes('--spec-type'));
        assert.ok(args.includes('draft-mtp'));
        assert.ok(args.includes('--n-cpu-moe'));
        assert.ok(args.includes('14'));
        assert.ok(args.includes('-fa'));
        assert.ok(args.includes('--reasoning'));
        assert.ok(args.includes('off'));
        assert.ok(args.includes('--cache-type-k'));
        assert.ok(args.includes('--repeat-penalty'));
        assert.ok(!args.includes('-md'));
    });

    it('resolveNCpuMoe lowers offload on high VRAM', () => {
        assert.strictEqual(tuning.resolveNCpuMoe({
            moe: true,
            nCpuMoe: 14,
            gpuTotalMiB: 24576,
        }), 0);
        assert.strictEqual(tuning.resolveNCpuMoe({
            moe: true,
            nCpuMoe: 14,
            gpuTotalMiB: 10240,
        }), 14);
    });

    it('resolveLlamaServerOptsFromEntry maps catalog llamaServer', () => {
        const opts = tuning.resolveLlamaServerOptsFromEntry({
            moe: true,
            paramBillion: 35,
            activeParamBillion: 3,
            weightGiB: 16.1,
            llamaServer: {
                flashAttn: true,
                nCpuMoe: 14,
                specType: 'draft-mtp',
                reasoning: 'off',
            },
            chatDefaults: { temperature: 0.1, topP: 0.7 },
        });
        assert.strictEqual(opts.specType, 'draft-mtp');
        assert.strictEqual(opts.flashAttn, true);
        assert.strictEqual(opts.temp, 0.1);
        assert.strictEqual(opts.moe, true);
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

    it('estimateLlamaLoadMinFreeMiB scales with context for 7B', () => {
        const ctx4k = tuning.estimateLlamaLoadMinFreeMiB({ paramBillion: 7, contextSize: 4096 });
        const ctx8k = tuning.estimateLlamaLoadMinFreeMiB({ paramBillion: 7, contextSize: 8192 });
        assert.ok(ctx8k > ctx4k);
        assert.ok(ctx8k >= 7000);
    });

    it('resolveMtPostAsrSlotCap stays 1 until VRAM handoff, then scales by model', () => {
        assert.strictEqual(tuning.resolveMtPostAsrSlotCap({
            afterAsr: true,
            vramHandoffReady: false,
            paramBillion: 1.5,
        }), 1);
        assert.strictEqual(tuning.resolveMtPostAsrSlotCap({
            afterAsr: true,
            vramHandoffReady: true,
            paramBillion: 1.5,
        }), 3);
        assert.strictEqual(tuning.resolveMtPostAsrSlotCap({
            afterAsr: true,
            vramHandoffReady: true,
            paramBillion: 4,
        }), 2);
        assert.strictEqual(tuning.resolveMtPostAsrSlotCap({
            afterAsr: true,
            vramHandoffReady: true,
            paramBillion: 7,
        }), 2);
        assert.strictEqual(tuning.resolveLlamaHandoffSettleMs({ headroomOk: true }), 0);
        assert.strictEqual(tuning.resolveLlamaHandoffSettleMs({
            headroomOk: false,
            releasedOk: true,
        }), 400);
        assert.strictEqual(tuning.resolveLlamaHandoffSettleMs({
            headroomOk: false,
            releasedOk: false,
        }), 800);
    });

    it('buildLlamaNglAttempts omits CPU unless allowCpuFallback', () => {
        assert.deepStrictEqual(tuning.buildLlamaNglAttempts(99), [99, 40, 20]);
        assert.deepStrictEqual(tuning.buildLlamaNglAttempts(99, { allowCpuFallback: true }), [99, 40, 20, 0]);
        assert.deepStrictEqual(tuning.buildLlamaNglAttempts(0), [0]);
        assert.deepStrictEqual(tuning.buildLlamaNglAttempts(15), [15]);
    });

    it('resolveLlamaNglFallbackAction retries stall when VRAM ample, never jumps to CPU', () => {
        const ample = {
            failCode: 'gpu_load_stalled',
            nGpuLayers: 99,
            gpuFreeMiB: 14000,
            minFreeMiB: 7000,
            sameNglRetries: 0,
        };
        assert.strictEqual(tuning.resolveLlamaNglFallbackAction(ample).action, 'retry_same');
        assert.strictEqual(tuning.resolveLlamaNglFallbackAction({
            ...ample,
            sameNglRetries: 1,
        }).action, 'lower_ngl');
        assert.strictEqual(tuning.resolveLlamaNglFallbackAction({
            failCode: 'gpu_load_stalled',
            nGpuLayers: 20,
            gpuFreeMiB: 14000,
            minFreeMiB: 7000,
            sameNglRetries: 1,
            allowCpuFallback: false,
        }).action, 'lower_ngl');
    });

    it('resolveLlamaNglFallbackAction allows CPU path only on OOM when permitted', () => {
        assert.strictEqual(tuning.resolveLlamaNglFallbackAction({
            failCode: 'gpu_load_failed',
            nGpuLayers: 20,
            allowCpuFallback: true,
            oomHint: true,
        }).action, 'allow_cpu');
        assert.strictEqual(tuning.resolveLlamaNglFallbackAction({
            failCode: 'gpu_load_failed',
            nGpuLayers: 20,
            allowCpuFallback: false,
        }).action, 'lower_ngl');
    });

    it('resolveLlamaGpuStallAfterMs is longer after ASR / for 7B+', () => {
        assert.ok(tuning.resolveLlamaGpuStallAfterMs({ nGpuLayers: 99, afterAsr: true, paramBillion: 7 })
            >= 210000);
        assert.ok(tuning.resolveLlamaGpuStallAfterMs({ nGpuLayers: 99, afterAsr: false, paramBillion: 1.5 })
            >= 150000);
        assert.strictEqual(tuning.resolveLlamaGpuStallAfterMs({ nGpuLayers: 0 }), 0);
    });

    it('isLlamaGpuHeadroomAmple requires enough free MiB', () => {
        assert.strictEqual(tuning.isLlamaGpuHeadroomAmple({
            gpuFreeMiB: 12000,
            minFreeMiB: 7000,
        }), true);
        assert.strictEqual(tuning.isLlamaGpuHeadroomAmple({
            gpuFreeMiB: 2000,
            minFreeMiB: 7000,
        }), false);
    });
});
