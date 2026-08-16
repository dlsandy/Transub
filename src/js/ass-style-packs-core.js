/**
 * User-saved ASS style packs (localStorage) — browser + Node
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAssStylePacks = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function assStylePacksCoreFactory() {
    const STORAGE_KEY = 'transub-editor-ass-style-packs';
    const MAX_PACKS = 24;
    const MAX_NAME = 40;
    const MAX_STYLES = 32;

    function sanitizePackName(name) {
        return String(name || '').replace(/[\r\n]/g, ' ').trim().slice(0, MAX_NAME) || '我的预设';
    }

    function packId() {
        return `pack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function normalizeStyleSnapshot(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || raw.Name || '').replace(/[,]/g, ' ').trim().slice(0, 64);
        if (!name) return null;
        return { ...raw, name };
    }

    function normalizePack(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = sanitizePackName(raw.name);
        const styles = (Array.isArray(raw.styles) ? raw.styles : [])
            .map(normalizeStyleSnapshot)
            .filter(Boolean)
            .slice(0, MAX_STYLES);
        if (!styles.length) return null;
        const dualTemplate = raw.dualTemplate && typeof raw.dualTemplate === 'object'
            ? { ...raw.dualTemplate }
            : null;
        return {
            id: String(raw.id || packId()).slice(0, 64),
            name,
            styles,
            dualTemplate,
            createdAt: String(raw.createdAt || new Date().toISOString()),
            updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
        };
    }

    function readStorage(storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.getItem) return [];
        try {
            const raw = store.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.packs) ? parsed.packs : []);
            return list.map(normalizePack).filter(Boolean).slice(0, MAX_PACKS);
        } catch (_) {
            return [];
        }
    }

    function writeStorage(packs, storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.setItem) return { ok: false, error: '无本地存储' };
        try {
            store.setItem(STORAGE_KEY, JSON.stringify({
                version: 1,
                packs: (Array.isArray(packs) ? packs : []).slice(0, MAX_PACKS),
            }));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }

    function listPacks(storage) {
        return readStorage(storage);
    }

    function getPack(id, storage) {
        const want = String(id || '').trim();
        if (!want) return null;
        return listPacks(storage).find((p) => p.id === want) || null;
    }

    function upsertPack(input, storage) {
        const pack = normalizePack({
            ...input,
            id: input?.id || packId(),
            updatedAt: new Date().toISOString(),
            createdAt: input?.createdAt || new Date().toISOString(),
        });
        if (!pack) return { ok: false, error: '预设无效（需至少一个样式）' };
        const list = listPacks(storage).filter((p) => p.id !== pack.id);
        list.unshift(pack);
        const written = writeStorage(list.slice(0, MAX_PACKS), storage);
        if (!written.ok) return written;
        return { ok: true, pack };
    }

    function deletePack(id, storage) {
        const want = String(id || '').trim();
        if (!want) return { ok: false, error: '缺少预设 id' };
        const prev = listPacks(storage);
        const next = prev.filter((p) => p.id !== want);
        if (next.length === prev.length) return { ok: false, error: '找不到该预设' };
        const written = writeStorage(next, storage);
        if (!written.ok) return written;
        return { ok: true, deletedId: want };
    }

    function createPackFromStyles(name, styles, options = {}) {
        return normalizePack({
            id: packId(),
            name,
            styles,
            dualTemplate: options.dualTemplate || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }

    return {
        STORAGE_KEY,
        MAX_PACKS,
        sanitizePackName,
        listPacks,
        getPack,
        upsertPack,
        deletePack,
        createPackFromStyles,
        normalizePack,
    };
}));
