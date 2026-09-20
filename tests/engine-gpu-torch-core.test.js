'use strict';

const assert = require('node:assert/strict');

describe('engine-gpu-torch-core', () => {
    const api = require('../src/js/engine-gpu-torch-core.js');

    it('detects Qwen ASR ids', () => {
        assert.equal(api.isQwenAsrModelId('qwen3-asr-1.7b-ja-anime-galgame'), true);
        assert.equal(api.isQwenAsrModelId('sensevoice-small'), false);
    });

    it('blocks batch when mismatch and Qwen ASR selected', () => {
        const probe = {
            torchCudaMismatch: true,
            torchCudaVariant: 'cu130',
            installedTorchCudaTag: 'cu126',
            gpuName: 'NVIDIA GeForce RTX 5060',
        };
        assert.equal(
            api.shouldBlockBatchOnTorchMismatch(probe, 'qwen3-asr-1.7b-ja-anime-galgame'),
            true,
        );
        assert.equal(api.shouldBlockBatchOnTorchMismatch(probe, 'whisper-large-v3'), false);
    });

    it('treats unsuitable Blackwell torch as mismatch', () => {
        assert.equal(api.isTorchCudaMismatch({
            needsTorchCuda128: true,
            torchCudaSuitable: false,
        }), true);
        assert.equal(api.isTorchCudaMismatch({
            needsTorchCuda128: true,
            torchCudaSuitable: true,
            torchCudaMismatch: false,
        }), false);
    });

    it('builds user-facing mismatch copy', () => {
        const msg = api.buildTorchMismatchMessage({
            torchCudaVariant: 'cu130',
            installedTorchCudaTag: 'cu126',
            gpuName: 'NVIDIA GeForce RTX 5060',
        }, 'qwen3-asr-0.6b');
        assert.match(msg, /cu130/);
        assert.match(msg, /llama-server CUDA 无关/);
    });

    it('does not treat AMD ROCm as CUDA torch mismatch', () => {
        assert.equal(api.isTorchCudaMismatch({
            hasRocm: true,
            hasCuda: false,
            torchCudaMismatch: true,
        }), false);
        assert.equal(api.needsTorchRocmForAsr({
            hasRocm: true,
            hasCuda: false,
            torchRocm: false,
        }, 'qwen3-asr-1.7b-ja-anime-galgame'), true);
        assert.equal(api.shouldBlockBatchOnTorchMismatch({
            hasRocm: true,
            hasCuda: false,
            torchRocm: false,
        }, 'qwen3-asr-1.7b-ja-anime-galgame'), true);
    });
});
