const assert = require('assert');
const cacheUi = require('../src/js/engine-models-cache-core');
const {
    sanitizeSnapshot,
    saveCache,
    loadCache,
    getCacheFilePath,
} = require('../electron/engine-models-cache');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('engine-models-cache-core', () => {
    it('blocks live refresh during engine jobs / running batch', () => {
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({ running: true }), true);
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({
            retranslateBusy: true,
        }), true);
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({
            batchRunning: true,
        }), true);
        // Orphaned compute lock alone must not freeze model management across restarts.
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({
            computeBusy: true,
            computeBusyKind: 'engine_batch',
        }), false);
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({
            computeBusy: true,
            computeBusyKind: 'advanced_smart_translate',
        }), false);
        assert.strictEqual(cacheUi.shouldBrowseModelsFromCacheOnly({}), false);
    });

    it('builds browse-only banner copy', () => {
        const empty = cacheUi.buildModelsCacheBannerView({ browseOnly: false });
        assert.strictEqual(empty.visible, false);
        const cached = cacheUi.buildModelsCacheBannerView({
            browseOnly: true,
            hasCache: true,
            savedAt: Date.now() - 120_000,
        });
        assert.strictEqual(cached.visible, true);
        assert.ok(cached.text.includes('缓存'));
        const miss = cacheUi.buildModelsCacheBannerView({ browseOnly: true, hasCache: false });
        assert.ok(miss.text.includes('暂无本地缓存'));
        const idleDisk = cacheUi.buildModelsCacheBannerView({
            browseOnly: false,
            hasCache: true,
            fromDisk: true,
            savedAt: Date.now() - 120_000,
        });
        assert.strictEqual(idleDisk.visible, true);
        assert.strictEqual(idleDisk.tone, 'info');
        assert.ok(idleDisk.text.includes('本地缓存'));
        const idleLive = cacheUi.buildModelsCacheBannerView({
            browseOnly: false,
            hasCache: true,
            fromDisk: false,
        });
        assert.strictEqual(idleLive.visible, false);
    });

    it('decides live refresh only on force / miss / missing required ids', () => {
        assert.strictEqual(cacheUi.shouldLiveRefreshEngineModelsCatalog({
            force: true,
            hasCache: true,
        }), true);
        assert.strictEqual(cacheUi.shouldLiveRefreshEngineModelsCatalog({
            force: false,
            hasCache: false,
        }), true);
        assert.strictEqual(cacheUi.shouldLiveRefreshEngineModelsCatalog({
            force: false,
            hasCache: true,
            models: [{ id: 'a' }],
            pickCatalog: [{ id: 'b' }],
        }), false);
        assert.strictEqual(cacheUi.shouldLiveRefreshEngineModelsCatalog({
            force: false,
            hasCache: true,
            requiredModelIds: ['a', 'missing'],
            models: [{ id: 'a' }],
            pickCatalog: [{ id: 'b' }],
        }), true);
        assert.strictEqual(cacheUi.shouldLiveRefreshEngineModelsCatalog({
            force: false,
            hasCache: true,
            requiredModelIds: ['a', 'b'],
            models: [{ id: 'a' }],
            pickCatalog: [{ id: 'b' }],
        }), false);
        assert.ok(cacheUi.catalogContainsModelIds(
            cacheUi.collectCachedCatalogIds([{ id: 'x' }], [{ id: 'y' }]),
            ['x', 'y'],
        ));
    });

    it('normalizes loaded cache payloads', () => {
        const n = cacheUi.normalizeLoadedCache({
            models: [{ id: 'a', name: 'A' }],
            pickCatalog: [{ id: 'a', name: 'A', group: 'asr' }],
            savedAt: 42,
        });
        assert.strictEqual(n.ok, true);
        assert.strictEqual(n.models[0].id, 'a');
        assert.strictEqual(n.savedAt, 42);
        assert.strictEqual(cacheUi.normalizeLoadedCache(null).empty, true);
    });
});

describe('engine-models-cache disk', () => {
    let tmpRoot;
    let prevPortable;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-models-cache-'));
        prevPortable = process.env.PORTABLE_EXECUTABLE_DIR;
        process.env.PORTABLE_EXECUTABLE_DIR = tmpRoot;
    });

    afterEach(() => {
        if (prevPortable == null) delete process.env.PORTABLE_EXECUTABLE_DIR;
        else process.env.PORTABLE_EXECUTABLE_DIR = prevPortable;
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('round-trips sanitize + save/load under writable root', () => {
        const snap = sanitizeSnapshot({
            models: [{ id: 'whisper-tiny', name: 'Tiny', kind: 'asr', installed: true }],
            pickCatalog: [{
                id: 'whisper-tiny',
                name: 'Tiny',
                group: 'asr',
                installed: true,
                recommended: true,
            }],
            managedCatalog: [{ id: 'sakura', name: 'Sakura', group: 'llm', installed: true }],
            demucsProbe: { ok: true, status: 'ready', message: 'ok' },
            savedAt: 1_700_000_000_000,
        });
        assert.ok(snap);
        const saved = saveCache(snap);
        assert.strictEqual(saved.ok, true);
        assert.ok(fs.existsSync(getCacheFilePath()));
        const loaded = loadCache();
        assert.strictEqual(loaded.ok, true);
        assert.strictEqual(loaded.cache.models[0].id, 'whisper-tiny');
        assert.strictEqual(loaded.cache.pickCatalog[0].recommended, true);
        assert.strictEqual(loaded.cache.demucsProbe.status, 'ready');
    });

    it('drops retired non-hf Qwen3 JA from snapshots', () => {
        const snap = sanitizeSnapshot({
            models: [
                { id: 'qwen3-asr-1.7b-ja', name: 'neosophie', kind: 'asr' },
                { id: 'qwen3-asr-1.7b', name: 'Qwen3 1.7B', kind: 'asr' },
            ],
            pickCatalog: [
                { id: 'qwen3-asr-1.7b-ja', name: 'neosophie', group: 'asr' },
                { id: 'qwen3-asr-1.7b', name: 'Qwen3 1.7B', group: 'asr' },
            ],
        });
        assert.deepStrictEqual(snap.models.map((m) => m.id), ['qwen3-asr-1.7b']);
        assert.deepStrictEqual(snap.pickCatalog.map((m) => m.id), ['qwen3-asr-1.7b']);
    });

    it('drops retired transub-ja MT ids from snapshots', () => {
        const snap = sanitizeSnapshot({
            models: [
                { id: 'transub-ja-1.5b-q4km', name: 'Transub-JA', kind: 'mt' },
                { id: 'sakura-1.5b', name: 'Sakura', kind: 'mt' },
            ],
            pickCatalog: [
                { id: 'transub-ja-1.5b-f16', name: 'Transub-JA F16', group: 'llm' },
                { id: 'sakura-1.5b', name: 'Sakura', group: 'llm' },
            ],
            managedCatalog: [
                { id: 'transub-ja-1.5b-q4km', name: 'Transub-JA', group: 'llm' },
                { id: 'sakura-1.5b', name: 'Sakura', group: 'llm' },
            ],
        });
        assert.deepStrictEqual(snap.models.map((m) => m.id), ['sakura-1.5b']);
        assert.deepStrictEqual(snap.pickCatalog.map((m) => m.id), ['sakura-1.5b']);
        assert.deepStrictEqual(snap.managedCatalog.map((m) => m.id), ['sakura-1.5b']);
    });

    it('rejects empty snapshots', () => {
        assert.strictEqual(sanitizeSnapshot({ models: [], pickCatalog: [] }), null);
        assert.strictEqual(saveCache({ models: [] }).ok, false);
    });
});
