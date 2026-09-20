const assert = require('assert');
const { createAdvancedManagedLlmJobs } = require('../electron/advanced-managed-llm-jobs');

function mockHost(overrides = {}) {
    return {
        getAdvancedDeviceId: () => 'device-test',
        readAdvancedDoc: () => ({
            doc: {
                license: {},
                byok: {},
                managedLlm: {},
                llmSource: 'managed',
            },
        }),
        writeAdvancedDoc: (doc) => ({ ok: true, doc }),
        publicStatus: () => ({ entitled: false }),
        managedStatusForDoc: () => ({ activeModelId: '', models: [] }),
        ...overrides,
    };
}

describe('advanced-managed-llm-jobs factory', () => {
    it('exports createAdvancedManagedLlmJobs with job APIs', () => {
        const api = createAdvancedManagedLlmJobs(mockHost());
        assert.strictEqual(typeof api.getManagedLlmStatus, 'function');
        assert.strictEqual(typeof api.selectManagedModel, 'function');
        assert.strictEqual(typeof api.pullManagedModelJob, 'function');
        assert.strictEqual(typeof api.installManagedRuntimeJob, 'function');
        assert.strictEqual(typeof api.importManagedRuntimeJob, 'function');
        assert.strictEqual(typeof api.setManagedRuntimePreference, 'function');
        assert.strictEqual(typeof api.buildDownloadInfo, 'function');
        assert.strictEqual(typeof api.openManualDownload, 'function');
        assert.strictEqual(typeof api.openManagedFolder, 'function');
        assert.strictEqual(typeof api.verifyManualPlacement, 'function');
        assert.strictEqual(typeof api.classifyRuntimeZipPaths, 'function');
        assert.strictEqual(typeof api.runtimePreferHints, 'function');
        assert.strictEqual(typeof api.archiveNameFromUrl, 'function');
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedManagedLlmJobs({}),
            /createAdvancedManagedLlmJobs: host\.\w+ required/,
        );
    });

    it('selectManagedModel returns early on unknown model', () => {
        let wrote = false;
        const api = createAdvancedManagedLlmJobs(mockHost({
            writeAdvancedDoc: () => {
                wrote = true;
                return { ok: true, doc: {} };
            },
        }));
        const res = api.selectManagedModel({ modelId: '__no_such_model__' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '未知模型');
        assert.strictEqual(wrote, false);
    });

    it('pullManagedModelJob returns early on unknown model', async () => {
        const api = createAdvancedManagedLlmJobs(mockHost());
        const res = await api.pullManagedModelJob(null, { modelId: '__no_such_model__' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '未知模型');
    });

    it('buildDownloadInfo returns early on unknown model', () => {
        const api = createAdvancedManagedLlmJobs(mockHost());
        const res = api.buildDownloadInfo({ kind: 'model', modelId: '__no_such_model__' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '未知模型');
    });

    it('verifyManualPlacement returns early on unknown model', () => {
        let wrote = false;
        const api = createAdvancedManagedLlmJobs(mockHost({
            writeAdvancedDoc: () => {
                wrote = true;
                return { ok: true, doc: {} };
            },
        }));
        const res = api.verifyManualPlacement({ kind: 'model', modelId: '__no_such_model__' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '未知模型');
        assert.strictEqual(wrote, false);
    });

    it('classifyRuntimeZipPaths early-returns when empty', () => {
        const api = createAdvancedManagedLlmJobs(mockHost());
        const res = api.classifyRuntimeZipPaths([], { companionUrl: 'https://x/cudart.zip' });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'archive_missing');
    });
});
