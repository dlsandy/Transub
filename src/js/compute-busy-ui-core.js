/**
 * Compute-busy strip / elapsed / windowed-ASR tip helpers (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubComputeBusyUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function computeBusyUiFactory() {
    const WINDOWED_ASR_RE = /anime-whisper|kotoba-whisper/i;

    function formatComputeElapsed(sinceMs, nowMs = Date.now()) {
        const since = Number(sinceMs);
        if (!Number.isFinite(since) || since <= 0) return '';
        const sec = Math.max(0, Math.floor((Number(nowMs) - since) / 1000));
        if (sec < 60) return `${sec}s`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * @returns {{ visible: boolean, text: string, title: string, showCancel: boolean }}
     */
    function buildComputeBusyStripView(input = {}) {
        const busy = !!input.busy;
        if (!busy) {
            return { visible: false, text: '', title: '', showCancel: false };
        }
        const label = String(input.label || input.kind || '计算任务').trim() || '计算任务';
        const owner = String(input.owner || '').trim();
        const elapsed = formatComputeElapsed(input.since, input.now);
        const bits = [`正在运行：${label}`];
        if (owner) bits.push(owner);
        if (elapsed) bits.push(`已用 ${elapsed}`);
        const text = bits.join(' · ');
        return {
            visible: true,
            text,
            title: text,
            showCancel: true,
        };
    }

    function needsWindowedAsrTip(asrModelId) {
        return WINDOWED_ASR_RE.test(String(asrModelId || ''));
    }

    function describeWindowedAsrTip(_asrModelId) {
        // UI tip removed: windowing still happens in the engine when needed.
        return { visible: false, text: '' };
    }

    /**
     * Parse engine progress detail for windowed ASR ("分窗 3/12" etc.).
     * @returns {{ current: number, total: number, label: string }|null}
     */
    function parseAsrWindowProgress(detail) {
        const raw = String(detail || '');
        const m = raw.match(/分窗\s*(\d+)\s*[/／]\s*(\d+)/)
            || raw.match(/window(?:ed)?\s*(\d+)\s*[/／]\s*(\d+)/i)
            || raw.match(/(\d+)\s*[/／]\s*(\d+)\s*窗/);
        if (!m) return null;
        const current = Math.max(0, Math.floor(Number(m[1]) || 0));
        const total = Math.max(0, Math.floor(Number(m[2]) || 0));
        if (!(total > 0) || current > total) return null;
        return {
            current,
            total,
            label: `分窗 ${current}/${total}`,
        };
    }

    /**
     * Annotate a running progress label with parsed window progress when present.
     */
    function annotateProgressWithWindow(label, detail) {
        const base = String(label || '').trim();
        const win = parseAsrWindowProgress(detail);
        if (!win) return base;
        if (base.includes(win.label) || /分窗\s*\d/.test(base)) return base;
        return base ? `${base} · ${win.label}` : win.label;
    }

    /**
     * @param {string[]} candidates
     * @param {number} [attempts]
     */
    function formatAsrFailoverTrail(candidates, attempts) {
        const list = (Array.isArray(candidates) ? candidates : [])
            .map((c) => String(c || '').trim())
            .filter(Boolean);
        if (!list.length) return '';
        const n = Math.max(1, Math.min(list.length, Math.floor(Number(attempts) || list.length)));
        const tried = list.slice(0, n);
        return tried.join(' → ');
    }

    return {
        formatComputeElapsed,
        buildComputeBusyStripView,
        needsWindowedAsrTip,
        describeWindowedAsrTip,
        parseAsrWindowProgress,
        annotateProgressWithWindow,
        formatAsrFailoverTrail,
    };
}));
