/**
 * 字幕文本预设组（片名/演员等按时段批量插入）
 * 浏览器与 Node 测试共用
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleTextPresets = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleTextPresetsCoreFactory() {
    const PRESETS_VERSION = 2;
    const ANCHORS = new Set(['playhead', 'absolute']);

    const ANCHOR_LABELS = {
        playhead: '相对当前播放位置',
        absolute: '相对视频起点（绝对时间）',
    };

    function makeId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function makeGroupId() {
        return makeId('tg');
    }

    function makeItemId() {
        return makeId('ti');
    }

    function normalizeAnchor(anchor) {
        const a = String(anchor || 'playhead').trim();
        return ANCHORS.has(a) ? a : 'playhead';
    }

    function normalizeSec(raw, fallback = 0) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return fallback;
        return Math.round(n * 1000) / 1000;
    }

    function normalizeItem(raw = {}) {
        let startSec = normalizeSec(raw.startSec, 0);
        let endSec;
        if (raw.endSec != null && raw.endSec !== '') {
            endSec = normalizeSec(raw.endSec, startSec + 0.5);
        } else if (raw.durationSec != null && raw.durationSec !== '') {
            const dur = Math.max(0.1, normalizeSec(raw.durationSec, 0.5));
            endSec = Math.round((startSec + dur) * 1000) / 1000;
        } else {
            endSec = Math.round((startSec + 0.5) * 1000) / 1000;
        }
        if (endSec <= startSec) endSec = Math.round((startSec + 0.5) * 1000) / 1000;
        return {
            id: String(raw.id || makeItemId()),
            label: String(raw.label || '').trim(),
            text: String(raw.text ?? '').replace(/\r\n/g, '\n'),
            startSec,
            endSec,
        };
    }

    function normalizeGroup(raw = {}) {
        const items = Array.isArray(raw.items)
            ? raw.items.map(normalizeItem).filter((it) => it.label && it.text.trim())
            : [];
        items.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
        return {
            id: String(raw.id || makeGroupId()),
            name: String(raw.name || '').trim(),
            note: String(raw.note || '').trim(),
            anchor: normalizeAnchor(raw.anchor),
            items,
        };
    }

    /** Migrate legacy flat presets[] into a single group when needed. */
    function migrateLegacyPresets(doc = {}) {
        if (Array.isArray(doc.groups)) return doc;
        const legacy = Array.isArray(doc.presets) ? doc.presets : [];
        if (!legacy.length) {
            return { version: PRESETS_VERSION, updatedAt: doc.updatedAt || null, groups: [] };
        }
        const items = legacy.map((p, i) => {
            const durMs = Number(p.durationMs);
            const durSec = Number.isFinite(durMs) && durMs > 0 ? durMs / 1000 : 3;
            const startSec = i === 0 ? 0 : normalizeSec(legacy.slice(0, i).reduce((acc, prev) => {
                const d = Number(prev.durationMs);
                return acc + ((Number.isFinite(d) && d > 0 ? d : 3000) / 1000) + 0.1;
            }, 0));
            return {
                label: String(p.name || `条目${i + 1}`).trim(),
                text: String(p.text || ''),
                startSec,
                endSec: normalizeSec(startSec + durSec),
            };
        });
        return {
            version: PRESETS_VERSION,
            updatedAt: doc.updatedAt || null,
            groups: [{
                name: '迁移的预设',
                note: '由旧版单条预设自动转换',
                anchor: 'playhead',
                items,
            }],
        };
    }

    function normalizePresetsDoc(doc = {}) {
        const migrated = migrateLegacyPresets(doc);
        const groups = Array.isArray(migrated.groups)
            ? migrated.groups.map(normalizeGroup).filter((g) => g.name && g.items.length)
            : [];
        return {
            version: PRESETS_VERSION,
            updatedAt: migrated.updatedAt || null,
            groups,
        };
    }

    function emptyPresetsDoc() {
        return { version: PRESETS_VERSION, updatedAt: null, groups: [] };
    }

    function defaultStarterGroups() {
        return normalizePresetsDoc({
            groups: [
                {
                    name: '常规预设1',
                    note: '片头常用：片名 → 演员',
                    anchor: 'playhead',
                    items: [
                        {
                            label: '片名',
                            text: '《影片名称》',
                            startSec: 0,
                            endSec: 0.5,
                        },
                        {
                            label: '演员',
                            text: '主演\n演员甲\n演员乙',
                            startSec: 0.6,
                            endSec: 1.5,
                        },
                        {
                            label: '字幕制作',
                            text: '字幕制作：YourName',
                            startSec: 1.6,
                            endSec: 2.5,
                        },
                    ],
                },
            ],
        }).groups;
    }

    /** @deprecated alias for callers expecting presets list */
    function defaultStarterPresets() {
        return defaultStarterGroups();
    }

    function upsertGroup(doc, raw) {
        const normalized = normalizeGroup(raw);
        if (!normalized.name) return { ok: false, error: '组名称不能为空' };
        if (!normalized.items.length) return { ok: false, error: '组内至少需要一条有效条目（标签+文本）' };
        const next = normalizePresetsDoc(doc);
        const idx = next.groups.findIndex((g) => g.id === normalized.id);
        if (idx >= 0) next.groups[idx] = normalized;
        else next.groups.push(normalized);
        next.updatedAt = new Date().toISOString();
        return { ok: true, doc: next, group: normalized };
    }

    function removeGroup(doc, id) {
        const next = normalizePresetsDoc(doc);
        const want = String(id || '');
        next.groups = next.groups.filter((g) => g.id !== want);
        next.updatedAt = new Date().toISOString();
        return next;
    }

    function findGroup(doc, id) {
        const want = String(id || '');
        return normalizePresetsDoc(doc).groups.find((g) => g.id === want) || null;
    }

    function filterGroups(doc, { query = '' } = {}) {
        const list = normalizePresetsDoc(doc).groups;
        const q = String(query || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter((g) => {
            if (g.name.toLowerCase().includes(q) || (g.note && g.note.toLowerCase().includes(q))) {
                return true;
            }
            return g.items.some((it) => it.label.toLowerCase().includes(q)
                || it.text.toLowerCase().includes(q));
        });
    }

    /**
     * Build cues from a group.
     * @param {object} group
     * @param {{ baseMs?: number }} opts baseMs = playhead when anchor=playhead; ignored when absolute
     */
    function buildCuesFromGroup(group, opts = {}) {
        const g = normalizeGroup(group);
        const baseMs = g.anchor === 'absolute'
            ? 0
            : Math.max(0, Number(opts.baseMs) || 0);
        return g.items.map((it) => {
            const startMs = Math.round(baseMs + it.startSec * 1000);
            let endMs = Math.round(baseMs + it.endSec * 1000);
            if (endMs <= startMs) endMs = startMs + 500;
            return {
                startMs,
                endMs,
                text: it.text,
                label: it.label,
            };
        });
    }

    function formatItemTiming(item) {
        const a = normalizeSec(item?.startSec, 0);
        const b = normalizeSec(item?.endSec, a + 0.5);
        const dur = Math.max(0.1, Math.round((b - a) * 1000) / 1000);
        const fmt = (n) => (Math.round(n * 100) / 100).toString();
        return `${fmt(a)}+${fmt(dur)}s`;
    }

    function summarizeGroup(group) {
        const g = normalizeGroup(group);
        const parts = g.items.map((it) => `${it.label}(${formatItemTiming(it)})`);
        return parts.join(' · ');
    }

    return {
        PRESETS_VERSION,
        ANCHOR_LABELS,
        ANCHORS: [...ANCHORS],
        makeGroupId,
        makeItemId,
        normalizeItem,
        normalizeGroup,
        normalizePresetsDoc,
        emptyPresetsDoc,
        defaultStarterGroups,
        defaultStarterPresets,
        upsertGroup,
        removeGroup,
        findGroup,
        filterGroups,
        buildCuesFromGroup,
        formatItemTiming,
        summarizeGroup,
        normalizeAnchor,
        normalizeSec,
        // Back-compat aliases used by older editor snippets (map to group APIs)
        upsertPreset: upsertGroup,
        removePreset: removeGroup,
        findPreset: findGroup,
        filterPresets: filterGroups,
    };
}));
