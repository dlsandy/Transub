const assert = require('assert');
const { registerExtensionsSubtitleEditorIpc } = require('../electron/extensions-subtitle-editor-ipc');

describe('registerExtensionsSubtitleEditorIpc', () => {
    it('registers twenty subtitle editor I/O channels', () => {
        const channels = [];
        registerExtensionsSubtitleEditorIpc((name) => {
            channels.push(name);
        }, {
            getAppRoot: () => '',
            browserWindowFromEvent: () => null,
            readSubtitlePreview: () => ({ ok: true }),
            readSubtitleDocument: () => ({ ok: true }),
            scanSubtitleQc: () => ({ ok: true }),
            writeSubtitleDocument: () => ({ ok: true }),
            normalizeSubtitleBakMode: (v) => v || 'off',
            applySubtitlePostprocess: () => ({ ok: true }),
            compactPureInterjectionSubtitlePair: () => ({ ok: true }),
            removeNoiseFromSubtitlePair: () => ({ ok: true }),
        });

        assert.strictEqual(channels.length, 20);
        assert.deepStrictEqual(channels, [
            'transwithai-subtitle-preview',
            'transub-read-subtitle',
            'transub-scan-subtitle-qc',
            'transub-apply-subtitle-postprocess',
            'transub-insert-text-preset-group',
            'transub-qc-silence-split',
            'transub-compact-pure-interjections',
            'transub-merge-bilingual-subtitles',
            'transub-remove-noise-pair',
            'transub-copy-subtitle-as',
            'transub-read-subtitle-draft',
            'transub-write-subtitle-draft',
            'transub-clear-subtitle-draft',
            'transub-check-subtitle-draft',
            'transub-write-subtitle',
            'transub-export-subtitle',
            'transub-pick-save-subtitle',
            'transub-delete-subtitle-files',
            'transub-read-subtitle-meta',
            'transub-write-subtitle-meta',
        ]);
    });
});
