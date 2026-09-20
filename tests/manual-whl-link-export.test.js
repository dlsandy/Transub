const assert = require('assert');
const api = require('../src/js/manual-whl-link-export-core.js');

describe('manual-whl link export', () => {
    const items = [
        {
            id: 'nvidia-cublas-cu12',
            name: 'cuBLAS',
            group: 'GPU',
            fileName: 'nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
            mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/aa/cublas.whl',
            defaultUrl: 'https://mirrors.aliyun.com/pypi/packages/aa/cublas.whl',
            officialUrl: 'https://files.pythonhosted.org/packages/aa/cublas.whl',
        },
        {
            id: 'torch',
            name: 'torch',
            group: 'CUDA PyTorch',
            defaultUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torch.whl',
            mirrorUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torch.whl',
            officialUrl: 'https://download.pytorch.org/whl/cu126/torch.whl',
        },
        {
            id: 'dup',
            defaultUrl: 'https://mirrors.aliyun.com/pypi/packages/aa/cublas.whl',
        },
    ];

    it('collects unique preferred urls', () => {
        const urls = api.collectManualWhlUrls(items);
        assert.strictEqual(urls.length, 2);
        assert.ok(urls[0].includes('aliyun.com'));
        assert.ok(urls[1].includes('pytorch-wheels'));
    });

    it('builds batch-import text with one url per line and official comments', () => {
        const text = api.buildManualWhlLinkExportText(items, { title: '测试导出' });
        assert.ok(text.includes('# 测试导出'));
        assert.ok(text.includes('https://mirrors.aliyun.com/pypi/packages/aa/cublas.whl'));
        assert.ok(text.includes('# official: https://files.pythonhosted.org/packages/aa/cublas.whl'));
        assert.ok(text.includes('https://mirrors.aliyun.com/pytorch-wheels/cu126/torch.whl'));
        const urlLines = text.split(/\n/).filter((l) => /^https?:\/\//i.test(l));
        assert.strictEqual(urlLines.length, 2);
    });

    it('defaultExportFileName sanitizes kind', () => {
        assert.strictEqual(api.defaultExportFileName('torch-cuda'), 'transub-manual-torch-cuda-urls.txt');
        assert.ok(api.defaultExportFileName('a/b').includes('urls.txt'));
    });

    it('buildThunderUrl wraps http url as thunder:// task', () => {
        const u = api.buildThunderUrl('https://example.com/a.whl');
        assert.ok(u.startsWith('thunder://'));
        const b64 = u.slice('thunder://'.length);
        const raw = Buffer.from(b64, 'base64').toString('utf8');
        assert.strictEqual(raw, 'AAhttps://example.com/a.whlZZ');
        assert.strictEqual(api.buildThunderUrl('ftp://x'), '');
    });

    it('lists download tools for dropdown', () => {
        assert.ok(Array.isArray(api.DOWNLOAD_TOOLS));
        assert.ok(api.DOWNLOAD_TOOLS.some((t) => t.id === 'thunder'));
        assert.ok(api.DOWNLOAD_TOOLS.some((t) => t.id === 'idm'));
        assert.ok(api.DOWNLOAD_TOOLS.some((t) => /工具|迅雷|IDM|Motrix/i.test(t.label) || t.id === 'motrix'));
    });
});
