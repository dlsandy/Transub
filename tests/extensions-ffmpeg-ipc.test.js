const assert = require('assert');
const { registerExtensionsFfmpegIpc } = require('../electron/extensions-ffmpeg-ipc');

describe('registerExtensionsFfmpegIpc', () => {
    it('registers fourteen ffmpeg / burn / env-check channels', () => {
        const channels = [];
        registerExtensionsFfmpegIpc((name) => {
            channels.push(name);
        }, {
            getAppRoot: () => '',
            browserWindowFromEvent: () => null,
        });

        assert.strictEqual(channels.length, 14);
        assert.deepStrictEqual(channels, [
            'ffmpeg-probe',
            'ffmpeg-probe-acoustic',
            'ffmpeg-validate',
            'transub-env-check',
            'ffmpeg-detect-silence',
            'ffmpeg-cancel',
            'ffmpeg-burn-hardsub',
            'ffmpeg-burn-preview-clip',
            'ffmpeg-burn-delete-preview',
            'ffmpeg-burn-list-encoders',
            'ffmpeg-burn-read-text',
            'ffmpeg-burn-select-output',
            'ffmpeg-extract-waveform',
            'electron-select-ffmpeg',
        ]);
    });
});
