const assert = require('assert');
const { registerExtensionsShelfIpc } = require('../electron/extensions-shelf-ipc');

describe('registerExtensionsShelfIpc', () => {
    it('registers eleven transub-shelf-* channels', () => {
        const channels = [];
        registerExtensionsShelfIpc((name) => {
            channels.push(name);
        }, {});

        assert.strictEqual(channels.length, 11);
        assert.ok(channels.every((c) => c.startsWith('transub-shelf-')));
        assert.deepStrictEqual(channels, [
            'transub-shelf-status',
            'transub-shelf-list',
            'transub-shelf-get-media',
            'transub-shelf-delete-media',
            'transub-shelf-delete-translation',
            'transub-shelf-register-translation',
            'transub-shelf-set-media-path',
            'transub-shelf-rename-media',
            'transub-shelf-open-slot',
            'transub-shelf-preview-slot',
            'transub-shelf-scan-media',
        ]);
    });
});
