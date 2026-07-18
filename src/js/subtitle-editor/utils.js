/**
 * 字幕编辑器 — 纯工具函数（无 state / DOM 依赖）
 */
(function (global) {
    const DEFAULT_TARGET_CPS = 3;

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function basename(p) {
        const s = String(p || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
    }

    function formatDisplayTime(ms, format) {
        const n = Math.max(0, Math.round(Number(ms) || 0));
        const h = Math.floor(n / 3600000);
        const m = Math.floor((n % 3600000) / 60000);
        const s = Math.floor((n % 60000) / 1000);
        const f = n % 1000;
        if (format === 'lrc') {
            const cs = Math.floor(f / 10);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        }
        const sep = format === 'vtt' ? '.' : ',';
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`;
    }

    function parseInputTime(str, format) {
        const s = String(str || '').trim();
        if (!s) return null;
        if (format === 'lrc') {
            const m = s.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
            if (!m) return null;
            const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac;
        }
        const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})([.,](\d{1,3}))?$/);
        if (m) {
            const frac = m[5] ? Number(m[5].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + frac;
        }
        const m2 = s.match(/^(\d{1,2}):(\d{2})([.,](\d{1,3}))?$/);
        if (m2) {
            const frac = m2[4] ? Number(m2[4].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m2[1]) * 60000 + Number(m2[2]) * 1000 + frac;
        }
        return null;
    }

    function cloneCues(cues) {
        return (cues || []).map((c) => ({
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        }));
    }

    function cuesEqual(a, b) {
        const left = a || [];
        const right = b || [];
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i += 1) {
            if (left[i].startMs !== right[i].startMs) return false;
            if (left[i].endMs !== right[i].endMs) return false;
            if ((left[i].text ?? '') !== (right[i].text ?? '')) return false;
        }
        return true;
    }

    function cueEndMs(cue) {
        return cue.endMs != null ? cue.endMs : cue.startMs + 2000;
    }

    function cueDurationMs(cue) {
        return Math.max(0, cueEndMs(cue) - cue.startMs);
    }

    function formatDurationSec(ms) {
        return (Math.max(0, ms) / 1000).toFixed(3);
    }

    function textCharCount(text) {
        const splitCore = global.TransubSubtitleSplit;
        return splitCore.textCharCount(text);
    }

    function lineCharCount(text) {
        const splitCore = global.TransubSubtitleSplit;
        return splitCore.lineCharCount(text);
    }

    function computeCps(text, durationMs) {
        const dur = durationMs / 1000;
        if (dur <= 0) return null;
        const chars = textCharCount(text);
        if (!chars) return null;
        return (chars / dur).toFixed(2);
    }

    function getCueWarnings(cue, prev, next) {
        const start = cue.startMs;
        const end = cueEndMs(cue);
        const dur = end - start;
        const warn = { start: false, end: false, dur: false, msg: [] };
        if (dur < 500) {
            warn.dur = true;
            warn.msg.push('时长过短');
        }
        if (dur > 10000) {
            warn.dur = true;
            warn.msg.push('时长过长');
        }
        if (end <= start) {
            warn.start = true;
            warn.end = true;
            warn.msg.push('结束早于起始');
        }
        if (prev && start < cueEndMs(prev)) {
            warn.start = true;
            warn.msg.push('与上条重叠');
        }
        if (next && end > next.startMs) {
            warn.end = true;
            warn.msg.push('与下条重叠');
        }
        return warn;
    }

    function findPlaybackIndex(cues, tMs, hint) {
        const list = cues || [];
        const n = list.length;
        if (!n) return -1;

        if (hint >= 0 && hint < n) {
            const c = list[hint];
            if (tMs >= c.startMs && tMs < cueEndMs(c)) return hint;
            if (hint + 1 < n) {
                const next = list[hint + 1];
                if (tMs >= next.startMs && tMs < cueEndMs(next)) return hint + 1;
            }
            if (hint > 0) {
                const prev = list[hint - 1];
                if (tMs >= prev.startMs && tMs < cueEndMs(prev)) return hint - 1;
            }
        }

        let lo = 0;
        let hi = n - 1;
        let best = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].startMs <= tMs) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        if (best >= 0 && tMs < cueEndMs(list[best])) return best;
        return -1;
    }

    function clampTargetCps(value, defaultCps) {
        const fallback = defaultCps != null ? defaultCps : DEFAULT_TARGET_CPS;
        return Math.max(0.1, Math.min(100, Number(value) || fallback));
    }

    function describeVideoCodec(codec, width, height) {
        const name = String(codec || '').toLowerCase();
        const res = width && height ? `${width}×${height}` : '';
        const labels = {
            h264: 'H.264',
            hevc: 'HEVC',
            h265: 'HEVC',
            av1: 'AV1',
            vp9: 'VP9',
            vp8: 'VP8',
            mpeg4: 'MPEG-4',
        };
        const label = labels[name] || (name ? name.toUpperCase() : '');
        if (!label && !res) return '';
        const softDecode = new Set(['hevc', 'h265', 'av1', 'vp9']).has(name);
        const parts = [res, label].filter(Boolean).join(' · ');
        return softDecode ? `${parts}（浏览器可能软解）` : parts;
    }

    function escapeRegex(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildFindRegex(query, caseSensitive) {
        const flags = caseSensitive ? 'g' : 'gi';
        return new RegExp(escapeRegex(query), flags);
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.utils = {
        DEFAULT_TARGET_CPS,
        esc,
        basename,
        formatDisplayTime,
        parseInputTime,
        cloneCues,
        cuesEqual,
        cueEndMs,
        cueDurationMs,
        formatDurationSec,
        textCharCount,
        lineCharCount,
        computeCps,
        getCueWarnings,
        findPlaybackIndex,
        clampTargetCps,
        describeVideoCodec,
        escapeRegex,
        buildFindRegex,
    };
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
