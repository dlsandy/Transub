const assert = require('assert');
const { registerAdvancedManagedLlmIpc } = require('../electron/advanced-managed-llm-ipc');

describe('registerAdvancedManagedLlmIpc', () => {
    it('registers eighteen transub-advanced-managed-llm-* channels', () => {
        const channels = [];
        registerAdvancedManagedLlmIpc((name) => {
            channels.push(name);
        }, {});

        assert.strictEqual(channels.length, 18);
        assert.ok(channels.every((c) => c.startsWith('transub-advanced-managed-llm-')));
        assert.deepStrictEqual(channels, [
            'transub-advanced-managed-llm-status',
            'transub-advanced-managed-llm-select',
            'transub-advanced-managed-llm-open-pick',
            'transub-advanced-managed-llm-open-download',
            'transub-advanced-managed-llm-download-info',
            'transub-advanced-managed-llm-open-manual',
            'transub-advanced-managed-llm-open-folder',
            'transub-advanced-managed-llm-verify-manual',
            'transub-advanced-managed-llm-pull',
            'transub-advanced-managed-llm-install-runtime',
            'transub-advanced-managed-llm-scan-cuda',
            'transub-advanced-managed-llm-adopt-cuda',
            'transub-advanced-managed-llm-set-runtime',
            'transub-advanced-managed-llm-import-runtime',
            'transub-advanced-managed-llm-cancel-pull',
            'transub-advanced-managed-llm-lab-add',
            'transub-advanced-managed-llm-lab-remove',
            'transub-advanced-managed-llm-stop-server',
        ]);
    });
});
