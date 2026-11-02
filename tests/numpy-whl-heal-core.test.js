const assert = require('node:assert/strict');
const heal = require('../src/js/numpy-whl-heal-core');

describe('numpy-whl-heal-core', () => {
    it('detects Win32 / multiarray / 2.5 pin failures', () => {
        assert.equal(
            heal.isNumpyPinOrDllError(
                'DLL load failed while importing _multiarray_umath: %1 不是有效的 Win32 应用程序。',
            ),
            true,
        );
        assert.equal(heal.isNumpyPinOrDllError('The NumPy version is: "2.5.3"'), true);
        assert.equal(heal.isNumpyPinOrDllError('NUMPY_DLL_BROKEN'), true);
        assert.equal(heal.isNumpyPinOrDllError('missing ctranslate2 only'), false);
    });

    it('formats manual heal hint with pinned 2.4.6 urls', () => {
        const hint = heal.formatNumpyManualHealHint(
            'Original error was: DLL load failed while importing _multiarray_umath',
        );
        assert.match(hint, /numpy-2\.4\.6-cp312-cp312-win_amd64\.whl/);
        assert.match(hint, /files\.pythonhosted\.org/);
        assert.match(hint, /mirrors\.aliyun\.com/);
        assert.match(hint, /勿安装 2\.5/);
    });

    it('exports the same wheel catalog used by Whisper manual packages', () => {
        const { WHISPER_MANUAL_PACKAGES } = require('../electron/engine-download-info');
        const catalog = WHISPER_MANUAL_PACKAGES.find((p) => p.id === 'numpy');
        assert.ok(catalog);
        assert.equal(catalog.fileName, heal.NUMPY_MANUAL_WHEEL.fileName);
        assert.equal(catalog.officialUrl, heal.NUMPY_MANUAL_WHEEL.officialUrl);
        assert.equal(catalog.mirrorUrl, heal.NUMPY_MANUAL_WHEEL.mirrorUrl);
    });
});
