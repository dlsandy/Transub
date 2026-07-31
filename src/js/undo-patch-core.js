/**
 * 字幕 Undo 补丁：相对基线只存变更条，降低长片内存占用
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubUndoPatch = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function undoPatchCoreFactory() {
    const OVERLAY_MAX_RATIO = 0.35;
    const OVERLAY_MAX_ABS = 400;

    function cloneCue(c) {
        if (!c) return null;
        return {
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        };
    }

    function cloneCues(cues) {
        return (cues || []).map(cloneCue);
    }

    function cueEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.startMs === b.startMs
            && a.endMs === b.endMs
            && (a.text ?? '') === (b.text ?? '');
    }

    function headerEqual(a, b) {
        const left = a || [];
        const right = b || [];
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i += 1) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    }

    /**
     * Encode `target` relative to `baseline`.
     * @returns {{ type: 'overlay', length: number, changes: object[] } | { type: 'full', cues: object[] }}
     */
    function encodeCuePatch(baseline, target) {
        const base = Array.isArray(baseline) ? baseline : [];
        const next = Array.isArray(target) ? target : [];
        if (base.length !== next.length) {
            return { type: 'full', cues: cloneCues(next) };
        }
        const changes = [];
        for (let i = 0; i < next.length; i += 1) {
            if (!cueEqual(base[i], next[i])) {
                changes.push({ i, cue: cloneCue(next[i]) });
            }
        }
        const maxChanges = Math.max(
            OVERLAY_MAX_ABS,
            Math.ceil(next.length * OVERLAY_MAX_RATIO),
        );
        if (changes.length > maxChanges) {
            return { type: 'full', cues: cloneCues(next) };
        }
        return { type: 'overlay', length: next.length, changes };
    }

    function decodeCuePatch(baseline, patch) {
        if (!patch || patch.type === 'full') {
            return cloneCues(patch?.cues || []);
        }
        const base = Array.isArray(baseline) ? baseline : [];
        if (patch.type === 'overlay') {
            if (base.length !== patch.length) {
                // Baseline drifted; cannot safely overlay
                return cloneCues(base);
            }
            const out = cloneCues(base);
            for (const ch of patch.changes || []) {
                const i = Number(ch.i);
                if (i >= 0 && i < out.length) out[i] = cloneCue(ch.cue);
            }
            return out;
        }
        return cloneCues(base);
    }

    function encodeEditorEntry(baseline, snapshot) {
        const snap = snapshot || {};
        return {
            selectedIndex: snap.selectedIndex,
            header: Array.isArray(snap.header) ? [...snap.header] : [],
            cuePatch: encodeCuePatch(baseline?.cues, snap.cues),
        };
    }

    function decodeEditorEntry(baseline, entry) {
        return {
            selectedIndex: entry?.selectedIndex ?? -1,
            header: Array.isArray(entry?.header) ? [...entry.header] : [],
            cues: decodeCuePatch(baseline?.cues, entry?.cuePatch),
        };
    }

    function entriesEqual(a, b, baseline) {
        if (!a || !b) return false;
        if (a.selectedIndex !== b.selectedIndex) return false;
        if (!headerEqual(a.header, b.header)) return false;
        const cuesA = decodeCuePatch(baseline?.cues, a.cuePatch);
        const cuesB = decodeCuePatch(baseline?.cues, b.cuePatch);
        if (cuesA.length !== cuesB.length) return false;
        for (let i = 0; i < cuesA.length; i += 1) {
            if (!cueEqual(cuesA[i], cuesB[i])) return false;
        }
        return true;
    }

    function patchMemoryHint(patch) {
        if (!patch) return 0;
        if (patch.type === 'full') return (patch.cues || []).length;
        return (patch.changes || []).length;
    }

    return {
        OVERLAY_MAX_RATIO,
        OVERLAY_MAX_ABS,
        cloneCue,
        cloneCues,
        cueEqual,
        headerEqual,
        encodeCuePatch,
        decodeCuePatch,
        encodeEditorEntry,
        decodeEditorEntry,
        entriesEqual,
        patchMemoryHint,
    };
}));
