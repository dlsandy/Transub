const assert = require('assert');
const {
    EDITION_NAMES,
    editionZipName,
    isEditionZipName,
    isAutoUpdateFullZipName,
    standardZipName,
    legacyStandardZipName,
    websiteUpdateZipName,
    wheelsForEdition,
} = require('../tools/win-edition-wheels');
const { pickZipAsset } = require('../electron/app-updater');

describe('release artifact names', () => {
    it('uses English first-install and update zip names', () => {
        assert.deepStrictEqual(EDITION_NAMES, ['cpu', 'cuda']);
        assert.strictEqual(standardZipName('3.0.3'), 'Transub-3.0.3-win.zip');
        assert.strictEqual(legacyStandardZipName('3.0.3'), 'Transub-3.0.3-Win-标准版.zip');
        assert.strictEqual(editionZipName('3.0.3', 'cpu'), 'Transub-3.0.3-Win-CPU完整版.zip');
        assert.strictEqual(editionZipName('3.0.3', 'cuda'), 'Transub-3.0.3-Win-CUDA显卡版.zip');
        assert.strictEqual(websiteUpdateZipName('3.0.3'), 'Transub-3.0.3-update.zip');
    });

    it('auto-update accepts win.zip and older 标准版, rejects editions/update bundles', () => {
        assert.ok(isAutoUpdateFullZipName('Transub-3.0.3-win.zip'));
        assert.ok(isAutoUpdateFullZipName('Transub-3.0.3-Win-标准版.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-Win-CPU完整版.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-Win-CUDA显卡版.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-win-cpu.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-win-engine.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-update.zip'));
        assert.ok(!isAutoUpdateFullZipName('Transub-3.0.3-官网更新包.zip'));
        assert.ok(isEditionZipName('Transub-3.0.3-Win-CPU完整版.zip'));
        assert.ok(isEditionZipName('Transub-3.0.3-win-cuda.zip'));
    });

    it('pickZipAsset prefers win.zip over older Chinese names and editions', () => {
        const release = {
            assets: [
                { name: 'Transub-1.0.0-Win-CPU完整版.zip', browser_download_url: 'https://x/cpu.zip' },
                { name: 'Transub-1.0.0-Win-标准版.zip', browser_download_url: 'https://x/cn.zip' },
                { name: 'Transub-1.0.0-win.zip', browser_download_url: 'https://x/full.zip' },
            ],
        };
        assert.strictEqual(pickZipAsset(release).name, 'Transub-1.0.0-win.zip');
        assert.strictEqual(
            pickZipAsset({
                assets: [
                    { name: 'Transub-1.0.0-Win-CUDA显卡版.zip', browser_download_url: 'https://x/cuda.zip' },
                    { name: 'Transub-1.0.0-Win-标准版.zip', browser_download_url: 'https://x/cn.zip' },
                ],
            }).name,
            'Transub-1.0.0-Win-标准版.zip',
        );
    });

    it('CPU wheels include ORT CPU + torch CPU; CUDA swaps ORT CPU for nvidia/torch-cuda', () => {
        const cpu = wheelsForEdition('cpu');
        const cuda = wheelsForEdition('cuda');
        assert.ok(cpu.some((w) => w.id === 'onnxruntime'));
        assert.ok(cpu.some((w) => w.id === 'torch'));
        assert.ok(cpu.some((w) => w.id === 'ctranslate2'));
        assert.ok(!cuda.some((w) => w.id === 'onnxruntime'));
        assert.ok(cuda.some((w) => w.id === 'torch-cuda'));
        assert.ok(cuda.some((w) => w.id === 'nvidia-cublas-cu12'));
        assert.ok(cuda.some((w) => w.id === 'ctranslate2'));
    });
});
