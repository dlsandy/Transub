/**
 * Subtitle library in-window player — pure helpers (Node + browser).
 * Cue lookup, overlay text, default version pick, clock-preserving switch.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLibraryPlayerCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function libraryPlayerCoreFactory() {
    function cueEndMs(cue) {
        if (cue?.endMs != null && Number.isFinite(Number(cue.endMs))) {
            return Number(cue.endMs);
        }
        return (Number(cue?.startMs) || 0) + 2000;
    }

    /**
     * Binary-ish scan for active cue at media time (ms). Prefer last match when overlapping.
     */
    function findCueIndexAt(cues, timeMs, hintIndex = -1) {
        const list = Array.isArray(cues) ? cues : [];
        if (!list.length) return -1;
        const t = Math.max(0, Number(timeMs) || 0);
        const start = Math.max(0, Math.min(list.length - 1, Number(hintIndex) || 0));
        // Walk forward / back from hint — typical playback path.
        let i = start;
        while (i > 0 && cueEndMs(list[i - 1]) > t && (Number(list[i - 1]?.startMs) || 0) > t) {
            i -= 1;
        }
        while (i < list.length - 1 && cueEndMs(list[i]) <= t) {
            i += 1;
        }
        // Verify / scan for last overlapping cue
        let hit = -1;
        const from = Math.max(0, i - 2);
        const to = Math.min(list.length - 1, i + 4);
        for (let j = from; j <= to; j += 1) {
            const startMs = Number(list[j]?.startMs) || 0;
            if (startMs <= t && t < cueEndMs(list[j])) hit = j;
        }
        if (hit >= 0) return hit;
        for (let j = 0; j < list.length; j += 1) {
            const startMs = Number(list[j]?.startMs) || 0;
            if (startMs <= t && t < cueEndMs(list[j])) hit = j;
        }
        return hit;
    }

    /** Strip common ASS/SSA override tags and convert \\N to newlines for CSS overlay. */
    function plainOverlayText(raw) {
        let s = String(raw || '');
        s = s.replace(/\{[^}]*\}/g, '');
        s = s.replace(/\\[nN]/g, '\n');
        s = s.replace(/\\h/g, ' ');
        return s.replace(/\r\n/g, '\n').trim();
    }

    function formatClock(sec) {
        const n = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(n / 3600);
        const m = Math.floor((n % 3600) / 60);
        const s = n % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function playableVersion(v) {
        return !!(v && (v.blobExists || v.exportExists));
    }

    /**
     * Prefer active target → bilingual → source → preferredOpenVersionId → first playable.
     */
    function pickDefaultVersionId(detail) {
        const preferred = String(detail?.media?.preferredOpenVersionId || '').trim();
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        const roleOrder = ['target', 'bilingual', 'source'];

        for (const role of roleOrder) {
            const track = tracks.find((t) => String(t.role || '').toLowerCase() === role);
            if (!track) continue;
            const versions = Array.isArray(track.versions) ? track.versions : [];
            const active = versions.find((v) => v.id === track.activeVersionId && playableVersion(v));
            if (active) return active.id;
            const first = versions.find(playableVersion);
            if (first) return first.id;
        }

        if (preferred) {
            for (const track of tracks) {
                const hit = (track.versions || []).find((v) => v.id === preferred && playableVersion(v));
                if (hit) return preferred;
            }
        }

        for (const track of tracks) {
            const first = (track.versions || []).find(playableVersion);
            if (first) return first.id;
        }
        return '';
    }

    function findVersionContext(detail, versionId) {
        const id = String(versionId || '').trim();
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        for (const track of tracks) {
            const versions = Array.isArray(track.versions) ? track.versions : [];
            const idx = versions.findIndex((v) => v.id === id);
            if (idx >= 0) {
                return { track, versions, index: idx, version: versions[idx] };
            }
        }
        return null;
    }

    /**
     * Next/prev playable version on the same track (wraps). delta: +1 | -1
     */
    function neighborVersionId(detail, currentId, delta = 1, { includeArchived = false } = {}) {
        const ctx = findVersionContext(detail, currentId);
        if (!ctx) return '';
        const list = ctx.versions.filter((v) => includeArchived || playableVersion(v) || v.id === currentId);
        if (list.length < 2) return '';
        const i = list.findIndex((v) => v.id === currentId);
        if (i < 0) return '';
        const step = delta >= 0 ? 1 : -1;
        const next = list[(i + step + list.length) % list.length];
        return next?.id && next.id !== currentId ? next.id : '';
    }

    function findAbPair(detail) {
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        const track = tracks.find((t) => t && t.abPairAvailable && t.abVersionIdA && t.abVersionIdB);
        if (!track) return null;
        return {
            trackId: track.id,
            versionIdA: String(track.abVersionIdA || ''),
            versionIdB: String(track.abVersionIdB || ''),
        };
    }

    /** Prefer target → bilingual → source for the default visible track. */
    function pickPrimaryTrack(detail) {
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        const order = ['target', 'bilingual', 'source'];
        for (const role of order) {
            const hit = tracks.find((t) => String(t.role || '').toLowerCase() === role);
            if (hit) return hit;
        }
        return tracks[0] || null;
    }

    function roleLabel(role) {
        const r = String(role || '').toLowerCase();
        if (r === 'target') return '译文';
        if (r === 'source') return '转录';
        if (r === 'bilingual') return '双语';
        return String(role || '字幕');
    }

    /**
     * Tracks that have at least one playable version, ordered for player tabs.
     */
    function playableTracks(detail, { includeArchived = false } = {}) {
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        const order = ['target', 'bilingual', 'source'];
        const list = tracks
            .map((track) => {
                const versions = (Array.isArray(track.versions) ? track.versions : [])
                    .filter((v) => includeArchived || playableVersion(v));
                return { track, versions };
            })
            .filter((x) => x.versions.length > 0);
        list.sort((a, b) => {
            const ia = order.indexOf(String(a.track.role || '').toLowerCase());
            const ib = order.indexOf(String(b.track.role || '').toLowerCase());
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        return list;
    }

    function sameMediaPath(a, b) {
        const na = String(a || '').trim().replace(/\\/g, '/').toLowerCase();
        const nb = String(b || '').trim().replace(/\\/g, '/').toLowerCase();
        return !!na && na === nb;
    }

    return {
        cueEndMs,
        findCueIndexAt,
        plainOverlayText,
        formatClock,
        playableVersion,
        pickDefaultVersionId,
        findVersionContext,
        neighborVersionId,
        findAbPair,
        pickPrimaryTrack,
        roleLabel,
        playableTracks,
        sameMediaPath,
    };
}));
