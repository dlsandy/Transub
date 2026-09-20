/**
 * Factory right-column status bar helpers (latest log line + engine/resources).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryStatusBar = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryStatusBarFactory() {
    /**
     * @param {string} raw
     * @param {number} [maxLen]
     */
    function summarizeLatestLogLine(raw, maxLen = 120) {
        let text = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!text) {
            return { time: '', body: '', full: '' };
        }
        // Strip leading [time] stamp for the compact strip (keep in title/tooltip).
        const m = text.match(/^\[([^\]]+)\]\s*(.*)$/);
        const time = m ? m[1] : '';
        const body = m ? m[2] : text;
        const limit = Math.max(24, Number(maxLen) || 120);
        let display = body;
        if (display.length > limit) {
            display = `${display.slice(0, Math.max(0, limit - 1))}…`;
        }
        return {
            time,
            body: display,
            full: text,
        };
    }

    /**
     * Map engine / job signals to a short status label.
     * @param {{
     *   running?: boolean,
     *   envBannerVisible?: boolean,
     *   envOk?: boolean,
     * }} [opts]
     */
    function resolveEngineStatus(opts = {}) {
        if (opts.running) {
            return { key: 'busy', label: '忙碌', tone: 'info' };
        }
        if (opts.envBannerVisible || opts.envOk === false) {
            return { key: 'offline', label: '待配置', tone: 'warn' };
        }
        return { key: 'ready', label: '就绪', tone: 'ok' };
    }

    /**
     * Build compact resource chips from sampleSystemResources-shaped payload.
     * GPU / VRAM slots are always present (placeholder "—" when undetected).
     * @param {object | null | undefined} sample
     * @returns {Array<{ id: string, label: string, value: string, pct: number|null }>}
     */
    function buildResourceChips(sample) {
        const chips = [];
        const hasSample = !!(sample && typeof sample === 'object');

        if (hasSample) {
            if (sample.cpuPct != null && Number.isFinite(sample.cpuPct)) {
                chips.push({
                    id: 'cpu',
                    label: 'CPU',
                    value: `${sample.cpuPct}%`,
                    pct: sample.cpuPct,
                });
            }

            const mem = sample.memory;
            if (mem && mem.totalBytes > 0) {
                const usedGiB = Number(mem.usedBytes) / (1024 ** 3);
                const totalGiB = Number(mem.totalBytes) / (1024 ** 3);
                const fmt = (n) => (n >= 10 ? n.toFixed(1) : n.toFixed(1));
                chips.push({
                    id: 'mem',
                    label: '内存',
                    value: `${fmt(usedGiB)}/${fmt(totalGiB)}G`,
                    pct: Number.isFinite(mem.usedPct) ? mem.usedPct : null,
                });
            }
        }

        // Always reserve GPU / VRAM slots so the strip layout stays stable
        // when nvidia-smi is missing or the sample has no GPU block.
        const gpu = hasSample ? sample.gpu : null;
        const utilPct = gpu != null ? Number(gpu.utilPct) : NaN;
        const utilOk = Number.isFinite(utilPct);
        chips.push({
            id: 'gpu',
            label: 'GPU',
            value: utilOk ? `${Math.round(utilPct)}%` : '—',
            pct: utilOk ? Math.max(0, Math.min(100, Math.round(utilPct))) : null,
        });

        const memTotalMiB = gpu != null ? Number(gpu.memTotalMiB) : NaN;
        const memUsedMiB = gpu != null ? Number(gpu.memUsedMiB) : NaN;
        if (Number.isFinite(memTotalMiB) && memTotalMiB > 0) {
            const used = (Number.isFinite(memUsedMiB) ? memUsedMiB : 0) / 1024;
            const total = memTotalMiB / 1024;
            const fmt = (n) => n.toFixed(1);
            const pct = total > 0
                ? Math.max(0, Math.min(100, Math.round((used / total) * 100)))
                : null;
            chips.push({
                id: 'vram',
                label: '显存',
                value: `${fmt(used)}/${fmt(total)}G`,
                pct,
            });
        } else {
            chips.push({
                id: 'vram',
                label: '显存',
                value: '—',
                pct: null,
            });
        }

        return chips;
    }

    /**
     * Position the factory log bottom-sheet so it expands from the single-line
     * status log container (bottom edge flush with that strip's bottom).
     * @param {{ left?: number, top?: number, bottom?: number, width?: number, height?: number } | null | undefined} anchorRect
     * @param {{ width?: number, height?: number }} [viewport]
     * @returns {{ left: string, width: string, bottom: string } | null}
     */
    function computeLogSheetAnchorStyle(anchorRect, viewport = {}) {
        if (!anchorRect || typeof anchorRect !== 'object') return null;
        const vh = Number(viewport.height);
        const left = Math.max(0, Math.round(Number(anchorRect.left) || 0));
        const width = Math.max(120, Math.round(Number(anchorRect.width) || 0));
        let edge = Number(anchorRect.bottom);
        if (!Number.isFinite(edge)) {
            const top = Number(anchorRect.top);
            const height = Number(anchorRect.height);
            edge = Number.isFinite(top) && Number.isFinite(height) ? top + height : NaN;
        }
        if (!(vh > 0) || !Number.isFinite(edge)) return null;
        const bottom = Math.max(0, Math.round(vh - edge));
        return {
            left: `${left}px`,
            width: `${width}px`,
            bottom: `${bottom}px`,
        };
    }

    return {
        summarizeLatestLogLine,
        resolveEngineStatus,
        buildResourceChips,
        computeLogSheetAnchorStyle,
    };
}));
