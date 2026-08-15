/**
 * 编辑器标记：书签、A-B 循环、审校状态（浏览器与 Node 共用）
 * 兼容旧 sidecar 中的 speakers / speakerId（只读容忍，无产品 UI）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEditorMarkers = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function editorMarkersCoreFactory() {
    const REVIEW_STATUSES = new Set(['unseen', 'edited', 'approved']);
    const MAX_BOOKMARKS = 200;
    const MAX_SPEAKERS = 32;

    function normalizeReviewStatus(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'pending') return 'unseen';
        if (v === 'done' || v === 'ok' || v === 'pass') return 'approved';
        if (v === 'changed' || v === 'dirty') return 'edited';
        return REVIEW_STATUSES.has(v) ? v : 'unseen';
    }

    function reviewStatusLabel(status) {
        const map = {
            unseen: '未看',
            edited: '已改',
            approved: '已通过',
        };
        return map[normalizeReviewStatus(status)] || '未看';
    }

    function emptyMarkersDoc() {
        return {
            version: 1,
            bookmarks: [],
            abLoop: null,
            speakers: [],
            cueMarkers: {},
            speakerStyleMap: {},
        };
    }

    function normalizeBookmark(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const timeMs = Math.max(0, Math.round(Number(raw.timeMs) || 0));
        const label = String(raw.label || '').trim().slice(0, 80);
        const id = String(raw.id || `bm_${timeMs}_${Math.random().toString(36).slice(2, 7)}`);
        return { id, timeMs, label, createdAt: String(raw.createdAt || new Date().toISOString()) };
    }

    function normalizeSpeaker(raw, index = 0) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const name = raw.trim().slice(0, 40);
            if (!name) return null;
            return { id: `spk_${index + 1}`, name, color: speakerColor(index) };
        }
        if (typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim().slice(0, 40);
        if (!name) return null;
        return {
            id: String(raw.id || `spk_${index + 1}`).slice(0, 40),
            name,
            // Always map by slot so palette upgrades apply to existing sidecars
            color: speakerColor(index),
        };
    }

    function speakerColor(index) {
        // High-contrast categorical palette (small-dot friendly; avoids adjacent teal/green/indigo)
        const palette = [
            '#e11d48', // rose
            '#2563eb', // blue
            '#ca8a04', // gold
            '#16a34a', // green
            '#9333ea', // purple
            '#ea580c', // orange
            '#0891b2', // cyan
            '#db2777', // pink
        ];
        return palette[Math.abs(index) % palette.length];
    }

    function normalizeCueMarker(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const out = {};
        if (raw.speakerId != null && String(raw.speakerId).trim()) {
            out.speakerId = String(raw.speakerId).trim().slice(0, 40);
        }
        if (raw.reviewStatus != null) {
            out.reviewStatus = normalizeReviewStatus(raw.reviewStatus);
        }
        if (raw.bookmarked === true) out.bookmarked = true;
        return Object.keys(out).length ? out : null;
    }

    function normalizeMarkersDoc(raw) {
        const doc = emptyMarkersDoc();
        if (!raw || typeof raw !== 'object') return doc;
        doc.version = 1;
        doc.bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : [])
            .map(normalizeBookmark)
            .filter(Boolean)
            .slice(0, MAX_BOOKMARKS)
            .sort((a, b) => a.timeMs - b.timeMs);
        if (raw.abLoop && typeof raw.abLoop === 'object') {
            const a = Number(raw.abLoop.aMs);
            const b = Number(raw.abLoop.bMs);
            if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
                doc.abLoop = {
                    aMs: Math.max(0, Math.round(a)),
                    bMs: Math.max(0, Math.round(b)),
                    enabled: raw.abLoop.enabled !== false,
                };
            }
        }
        doc.speakers = (Array.isArray(raw.speakers) ? raw.speakers : [])
            .map((s, i) => normalizeSpeaker(s, i))
            .filter(Boolean)
            .slice(0, MAX_SPEAKERS);
        const cueMarkers = {};
        const src = raw.cueMarkers && typeof raw.cueMarkers === 'object' ? raw.cueMarkers : {};
        for (const [key, value] of Object.entries(src)) {
            const marker = normalizeCueMarker(value);
            if (marker) cueMarkers[String(key)] = marker;
        }
        doc.cueMarkers = cueMarkers;
        const styleMap = {};
        const rawMap = raw.speakerStyleMap && typeof raw.speakerStyleMap === 'object'
            ? raw.speakerStyleMap
            : {};
        for (const [id, styleName] of Object.entries(rawMap)) {
            const sid = String(id || '').trim().slice(0, 40);
            const style = String(styleName || '').replace(/[,]/g, ' ').trim().slice(0, 64);
            if (sid && style) styleMap[sid] = style;
        }
        doc.speakerStyleMap = styleMap;
        return doc;
    }

    function upsertBookmark(doc, timeMs, label = '') {
        const next = normalizeMarkersDoc(doc);
        const t = Math.max(0, Math.round(Number(timeMs) || 0));
        const existing = next.bookmarks.find((b) => Math.abs(b.timeMs - t) <= 40);
        if (existing) {
            if (label) existing.label = String(label).trim().slice(0, 80);
            return { doc: next, bookmark: existing, created: false };
        }
        const bookmark = normalizeBookmark({ timeMs: t, label });
        next.bookmarks.push(bookmark);
        next.bookmarks.sort((a, b) => a.timeMs - b.timeMs);
        if (next.bookmarks.length > MAX_BOOKMARKS) {
            next.bookmarks = next.bookmarks.slice(0, MAX_BOOKMARKS);
        }
        return { doc: next, bookmark, created: true };
    }

    function removeBookmark(doc, idOrTimeMs) {
        const next = normalizeMarkersDoc(doc);
        const key = String(idOrTimeMs || '');
        const time = Number(idOrTimeMs);
        next.bookmarks = next.bookmarks.filter((b) => {
            if (b.id === key) return false;
            if (Number.isFinite(time) && Math.abs(b.timeMs - time) <= 40) return false;
            return true;
        });
        return next;
    }

    function setAbLoop(doc, aMs, bMs, enabled = true) {
        const next = normalizeMarkersDoc(doc);
        let a = Math.max(0, Math.round(Number(aMs) || 0));
        let b = Math.max(0, Math.round(Number(bMs) || 0));
        if (b < a) {
            const tmp = a;
            a = b;
            b = tmp;
        }
        if (b <= a) {
            next.abLoop = null;
            return next;
        }
        next.abLoop = { aMs: a, bMs: b, enabled: enabled !== false };
        return next;
    }

    function clearAbLoop(doc) {
        const next = normalizeMarkersDoc(doc);
        next.abLoop = null;
        return next;
    }

    function toggleAbEnabled(doc, enabled) {
        const next = normalizeMarkersDoc(doc);
        if (!next.abLoop) return next;
        next.abLoop.enabled = enabled !== false;
        return next;
    }

    /**
     * If playhead crossed B while A-B enabled, return seek target A.
     */
    function abLoopSeekTarget(abLoop, currentMs, prevMs) {
        if (!abLoop || abLoop.enabled === false) return null;
        const a = Number(abLoop.aMs);
        const b = Number(abLoop.bMs);
        const cur = Number(currentMs);
        const prev = Number(prevMs);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
        if (!Number.isFinite(cur)) return null;
        if (cur >= b && (!Number.isFinite(prev) || prev < b)) return a;
        if (cur > b + 80) return a;
        return null;
    }

    function ensureSpeaker(doc, name) {
        const next = normalizeMarkersDoc(doc);
        const n = String(name || '').trim().slice(0, 40);
        if (!n) return { doc: next, speaker: null };
        const existing = next.speakers.find((s) => s.name === n);
        if (existing) return { doc: next, speaker: existing };
        if (next.speakers.length >= MAX_SPEAKERS) {
            return { doc: next, speaker: null, error: '说话人数量已达上限' };
        }
        const speaker = normalizeSpeaker({ name: n }, next.speakers.length);
        next.speakers.push(speaker);
        return { doc: next, speaker };
    }

    /**
     * Rename speaker by id; cue speakerId references stay valid.
     */
    function renameSpeaker(doc, speakerId, newName) {
        const next = normalizeMarkersDoc(doc);
        const id = String(speakerId || '').trim();
        const n = String(newName || '').trim().slice(0, 40);
        if (!id) return { doc: next, speaker: null, error: '缺少说话人' };
        if (!n) return { doc: next, speaker: null, error: '名称不能为空' };
        const speaker = next.speakers.find((s) => s.id === id);
        if (!speaker) return { doc: next, speaker: null, error: '找不到该说话人' };
        if (speaker.name === n) return { doc: next, speaker, unchanged: true };
        const clash = next.speakers.find((s) => s.id !== id && s.name === n);
        if (clash) return { doc: next, speaker: null, error: '已有同名说话人' };
        speaker.name = n;
        const normalized = normalizeMarkersDoc(next);
        const updated = normalized.speakers.find((s) => s.id === id) || null;
        return { doc: normalized, speaker: updated };
    }

    function setCueMarker(doc, cueKey, patch = {}) {
        const next = normalizeMarkersDoc(doc);
        const key = String(cueKey);
        const prev = next.cueMarkers[key] || {};
        const merged = normalizeCueMarker({ ...prev, ...patch });
        if (!merged) {
            delete next.cueMarkers[key];
        } else {
            next.cueMarkers[key] = merged;
        }
        return next;
    }

    function getCueMarker(doc, cueKey) {
        const normalized = normalizeMarkersDoc(doc);
        return normalized.cueMarkers[String(cueKey)] || null;
    }

    function cueMarkerKey(cue, index) {
        const start = Math.round(Number(cue?.startMs) || 0);
        return `${index}:${start}`;
    }

    function filterIndexesByReview(cues, doc, status) {
        const want = normalizeReviewStatus(status);
        const list = Array.isArray(cues) ? cues : [];
        const normalized = normalizeMarkersDoc(doc);
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const key = cueMarkerKey(list[i], i);
            const marker = normalized.cueMarkers[key];
            const cur = normalizeReviewStatus(marker?.reviewStatus);
            if (cur === want) out.push(i);
        }
        return out;
    }

    function filterIndexesBySpeaker(cues, doc, speakerId) {
        const want = String(speakerId || '').trim();
        if (!want) return [];
        const list = Array.isArray(cues) ? cues : [];
        const normalized = normalizeMarkersDoc(doc);
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const key = cueMarkerKey(list[i], i);
            if (normalized.cueMarkers[key]?.speakerId === want) out.push(i);
        }
        return out;
    }

    /**
     * Cues whose time range covers a bookmark (optional pad).
     */
    function filterIndexesByBookmarks(cues, doc, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const bookmarks = normalizeMarkersDoc(doc).bookmarks || [];
        if (!bookmarks.length) return [];
        const pad = Math.max(0, Math.round(Number(options.padMs) || 0));
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            if (!cue) continue;
            const start = (Number(cue.startMs) || 0) - pad;
            const endRaw = cue.endMs != null && Number.isFinite(Number(cue.endMs))
                ? Number(cue.endMs)
                : (Number(cue.startMs) || 0) + 2000;
            const end = endRaw + pad;
            if (bookmarks.some((b) => b.timeMs >= start && b.timeMs <= end)) out.push(i);
        }
        return out;
    }

    /**
     * Bookmarks whose time falls within any of the given cue ranges.
     */
    function bookmarksCoveringIndexes(cues, doc, indexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const bookmarks = normalizeMarkersDoc(doc).bookmarks || [];
        if (!bookmarks.length) return [];
        const pad = Math.max(0, Math.round(Number(options.padMs) || 0));
        const idxList = Array.isArray(indexes) ? indexes : [];
        const hit = [];
        const seen = new Set();
        for (const raw of idxList) {
            const i = Number(raw);
            if (!Number.isInteger(i) || i < 0 || i >= list.length) continue;
            const cue = list[i];
            if (!cue) continue;
            const start = (Number(cue.startMs) || 0) - pad;
            const endRaw = cue.endMs != null && Number.isFinite(Number(cue.endMs))
                ? Number(cue.endMs)
                : (Number(cue.startMs) || 0) + 2000;
            const end = endRaw + pad;
            for (const b of bookmarks) {
                if (!b?.id || seen.has(b.id)) continue;
                if (b.timeMs >= start && b.timeMs <= end) {
                    seen.add(b.id);
                    hit.push(b);
                }
            }
        }
        return hit;
    }

    function removeBookmarksCoveringIndexes(cues, doc, indexes, options = {}) {
        const covering = bookmarksCoveringIndexes(cues, doc, indexes, options);
        if (!covering.length) return { doc: normalizeMarkersDoc(doc), removed: 0 };
        let next = normalizeMarkersDoc(doc);
        for (const b of covering) {
            next = removeBookmark(next, b.id);
        }
        return { doc: next, removed: covering.length };
    }

    function mergeIntoSidecarExtras(markersDoc) {
        return {
            markers: normalizeMarkersDoc(markersDoc),
        };
    }

    function extractFromSidecar(sidecar) {
        if (!sidecar || typeof sidecar !== 'object') return emptyMarkersDoc();
        if (sidecar.markers) return normalizeMarkersDoc(sidecar.markers);
        return normalizeMarkersDoc(sidecar);
    }

    return {
        REVIEW_STATUSES,
        MAX_BOOKMARKS,
        MAX_SPEAKERS,
        normalizeReviewStatus,
        reviewStatusLabel,
        emptyMarkersDoc,
        normalizeMarkersDoc,
        upsertBookmark,
        removeBookmark,
        setAbLoop,
        clearAbLoop,
        toggleAbEnabled,
        abLoopSeekTarget,
        ensureSpeaker,
        renameSpeaker,
        setCueMarker,
        getCueMarker,
        cueMarkerKey,
        filterIndexesByReview,
        filterIndexesBySpeaker,
        filterIndexesByBookmarks,
        bookmarksCoveringIndexes,
        removeBookmarksCoveringIndexes,
        speakerColor,
        mergeIntoSidecarExtras,
        extractFromSidecar,
    };
}));
