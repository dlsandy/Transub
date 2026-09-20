/**
 * Engine model list cache helpers (pure): busy browse-only + persist snapshot shape.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsCache = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsCacheFactory() {
    const ENGINE_JOB_KINDS = Object.freeze([
        'engine_batch',
        'engine_range',
        'engine_resume',
        'engine_opus_text',
    ]);

    function isEngineComputeKind(kind) {
        const k = String(kind || '').trim();
        if (!k) return false;
        if (ENGINE_JOB_KINDS.includes(k)) return true;
        return k.startsWith('engine_');
    }

    /**
     * True when live list/download/delete against the engine must not run.
     * Only real subtitle work (this window or main batchRunning) freezes the catalog.
     * Orphaned compute locks alone must not — they survive app restart on the engine
     * process and would otherwise leave「任务进行中」with a day-old cache forever.
     * @param {{
     *   running?: boolean,
     *   retranslateBusy?: boolean,
     *   batchRunning?: boolean,
     *   computeBusy?: boolean,
     *   computeBusyKind?: string,
     * }} state
     */
    function shouldBrowseModelsFromCacheOnly(state = {}) {
        if (state.running || state.retranslateBusy) return true;
        if (state.batchRunning) return true;
        return false;
    }

    function formatCacheAgeLabel(savedAt, nowMs = Date.now()) {
        const at = Number(savedAt);
        if (!Number.isFinite(at) || at <= 0) return '';
        const sec = Math.max(0, Math.floor((Number(nowMs) - at) / 1000));
        if (sec < 60) return '刚刚';
        if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
        if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
        return `${Math.floor(sec / 86400)} 天前`;
    }

    /**
     * @returns {{ visible: boolean, text: string, tone: 'warn'|'info' }}
     */
    function buildModelsCacheBannerView(input = {}) {
        const browseOnly = !!input.browseOnly;
        const hasCache = !!input.hasCache;
        const fromDisk = !!input.fromDisk;
        const age = formatCacheAgeLabel(input.savedAt, input.now);
        if (browseOnly) {
            if (hasCache) {
                const ageBit = age ? `（缓存于${age}）` : '';
                return {
                    visible: true,
                    text: `任务进行中 · 显示缓存列表${ageBit} · 结束后可刷新 / 下载`,
                    tone: 'warn',
                };
            }
            return {
                visible: true,
                text: '任务进行中 · 暂无本地缓存列表 · 请结束后再刷新',
                tone: 'warn',
            };
        }
        // Idle: hint when UI is showing a disk-backed catalog (not a just-live refresh).
        if (hasCache && fromDisk) {
            const ageBit = age ? `（${age}）` : '';
            return {
                visible: true,
                text: `显示本地缓存列表${ageBit} · 点右上角刷新可更新`,
                tone: 'info',
            };
        }
        return { visible: false, text: '', tone: 'info' };
    }

    /**
     * Collect model ids from engine /v1/models rows and/or pick-catalog rows.
     * @param {Array<{id?: string}>|null|undefined} models
     * @param {Array<{id?: string}>|null|undefined} pickCatalog
     * @returns {Set<string>}
     */
    function collectCachedCatalogIds(models, pickCatalog) {
        const ids = new Set();
        const push = (rows) => {
            if (!Array.isArray(rows)) return;
            for (const m of rows) {
                const id = String(m?.id || '').trim();
                if (id) ids.add(id);
            }
        };
        push(models);
        push(pickCatalog);
        return ids;
    }

    /**
     * True when every required id is present in the cached catalog sets.
     * Empty required list → true (nothing to verify).
     */
    function catalogContainsModelIds(catalogIds, requiredModelIds) {
        const required = [...new Set(
            (Array.isArray(requiredModelIds) ? requiredModelIds : [])
                .map((id) => String(id || '').trim())
                .filter(Boolean),
        )];
        if (!required.length) return true;
        const set = catalogIds instanceof Set
            ? catalogIds
            : new Set(
                (Array.isArray(catalogIds) ? catalogIds : [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean),
            );
        return required.every((id) => set.has(id));
    }

    /**
     * Policy: live refresh only on force, empty cache, or missing required ids.
     * @param {{
     *   force?: boolean,
     *   hasCache?: boolean,
     *   requiredModelIds?: string[],
     *   catalogIds?: Set<string>|string[],
     *   models?: Array<{id?: string}>,
     *   pickCatalog?: Array<{id?: string}>,
     * }} input
     */
    function shouldLiveRefreshEngineModelsCatalog(input = {}) {
        if (input.force) return true;
        if (!input.hasCache) return true;
        const required = Array.isArray(input.requiredModelIds) ? input.requiredModelIds : [];
        if (!required.length) return false;
        const ids = input.catalogIds
            || collectCachedCatalogIds(input.models, input.pickCatalog);
        return !catalogContainsModelIds(ids, required);
    }

    function normalizeLoadedCache(raw) {
        if (!raw || typeof raw !== 'object') {
            return { ok: false, empty: true, models: [], pickCatalog: [], managedCatalog: [], demucsProbe: null, savedAt: 0 };
        }
        const models = Array.isArray(raw.models) ? raw.models.filter((m) => m && m.id) : [];
        const pickCatalog = Array.isArray(raw.pickCatalog)
            ? raw.pickCatalog.filter((m) => m && m.id)
            : (Array.isArray(raw.catalog) ? raw.catalog.filter((m) => m && m.id) : []);
        const managedCatalog = Array.isArray(raw.managedCatalog)
            ? raw.managedCatalog.filter((m) => m && m.id)
            : [];
        const savedAt = Number(raw.savedAt) || 0;
        const empty = !models.length && !pickCatalog.length;
        return {
            ok: !empty,
            empty,
            models,
            pickCatalog,
            managedCatalog,
            demucsProbe: raw.demucsProbe && typeof raw.demucsProbe === 'object' ? raw.demucsProbe : null,
            savedAt,
        };
    }

    function buildPersistableSnapshot(input = {}) {
        const models = Array.isArray(input.models) ? input.models : [];
        const pickCatalog = Array.isArray(input.pickCatalog) ? input.pickCatalog : [];
        if (!models.length && !pickCatalog.length) return null;
        return {
            version: 1,
            savedAt: Number(input.savedAt) || Date.now(),
            models,
            pickCatalog,
            managedCatalog: Array.isArray(input.managedCatalog) ? input.managedCatalog : [],
            demucsProbe: input.demucsProbe && typeof input.demucsProbe === 'object' ? input.demucsProbe : null,
        };
    }

    return {
        ENGINE_JOB_KINDS,
        isEngineComputeKind,
        shouldBrowseModelsFromCacheOnly,
        formatCacheAgeLabel,
        buildModelsCacheBannerView,
        collectCachedCatalogIds,
        catalogContainsModelIds,
        shouldLiveRefreshEngineModelsCatalog,
        normalizeLoadedCache,
        buildPersistableSnapshot,
    };
}));
