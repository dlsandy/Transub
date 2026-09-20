const assert = require('assert');
const dl = require('../src/js/setup-wizard-download-ui-core.js');

describe('setup-wizard-download-ui progress attribution', () => {
    it('normalizeProgressModelId strips bracket wrappers', () => {
        assert.strictEqual(dl.normalizeProgressModelId(' [qwen3-asr-1.7b] '), 'qwen3-asr-1.7b');
        assert.strictEqual(dl.normalizeProgressModelId('[qwen3-asr-1.7b]'), 'qwen3-asr-1.7b');
        assert.strictEqual(dl.normalizeProgressModelId('qwen3-asr-1.7b'), 'qwen3-asr-1.7b');
        assert.strictEqual(dl.normalizeProgressModelId(''), '');
    });

    it('isSharedRuntimeProgressEvent detects pip / PyPI probe', () => {
        assert.strictEqual(dl.isSharedRuntimeProgressEvent({ stage: 'pip' }), true);
        assert.strictEqual(dl.isSharedRuntimeProgressEvent({
            message: '正在测速 PyPI 镜像（索引 + 包文件吞吐，共 8 个）…',
        }), true);
        assert.strictEqual(dl.isSharedRuntimeProgressEvent({
            message: 'Qwen3-ASR 运行库 · 正在测速 PyPI 镜像…',
        }), true);
        assert.strictEqual(dl.isSharedRuntimeProgressEvent({
            modelId: 'qwen3-asr-1.7b-ja-anime-galgame',
            message: 'Downloading weights…',
        }), false);
    });

    it('applyProgressEvent does not stamp pip progress onto HF model rows', () => {
        const state = {
            downloadOrder: ['qwen3-asr-1.7b-ja-anime-galgame', 'fsmn-vad'],
            downloadRows: {
                'qwen3-asr-1.7b-ja-anime-galgame': {
                    id: 'qwen3-asr-1.7b-ja-anime-galgame',
                    status: 'pending',
                    pct: 0,
                    message: '等待中',
                },
                'fsmn-vad': { id: 'fsmn-vad', status: 'pending', pct: 0, message: '等待中' },
            },
        };
        let statusText = '';
        const api = dl.createSetupWizardDownloadUi({
            getState: () => state,
            $: (id) => {
                if (id === 'setupWizardDownloadStatus') {
                    return {
                        get textContent() { return statusText; },
                        set textContent(v) { statusText = String(v || ''); },
                    };
                }
                return null;
            },
            uiTx: (t) => t,
        });

        api.applyProgressEvent({
            stage: 'pip',
            message: 'Qwen3-ASR 运行库 · 正在测速 PyPI 镜像（索引 + 包文件吞吐，共 8 个）…',
            pct: 5,
        });

        assert.match(statusText, /PyPI/);
        assert.strictEqual(
            state.downloadRows['qwen3-asr-1.7b-ja-anime-galgame'].message,
            '等待中',
        );
        assert.strictEqual(state.downloadRows['qwen3-asr-1.7b-ja-anime-galgame'].pct, 0);
        assert.strictEqual(state.downloadRows['fsmn-vad'].message, '等待中');
    });

    it('applyProgressEvent attributes HF progress by raw modelId (incl. bracketed)', () => {
        const state = {
            downloadOrder: ['qwen3-asr-1.7b-ja-anime-galgame'],
            downloadRows: {
                'qwen3-asr-1.7b-ja-anime-galgame': {
                    id: 'qwen3-asr-1.7b-ja-anime-galgame',
                    status: 'pending',
                    pct: 0,
                    message: '等待中',
                },
            },
        };
        const api = dl.createSetupWizardDownloadUi({
            getState: () => state,
            $: () => null,
            uiTx: (t) => t,
        });

        api.applyProgressEvent({
            modelId: ' [qwen3-asr-1.7b-ja-anime-galgame] ',
            message: '从 Hugging Face 下载权重…',
            pct: 42,
            phase: 'progress',
        });

        assert.strictEqual(state.downloadRows['qwen3-asr-1.7b-ja-anime-galgame'].pct, 42);
        assert.match(state.downloadRows['qwen3-asr-1.7b-ja-anime-galgame'].message, /Hugging Face/);
        assert.strictEqual(state.downloadRows['qwen3-asr-1.7b-ja-anime-galgame'].status, 'downloading');
    });
});
