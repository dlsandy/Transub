/**
 * Batch ETA helpers — shared by main (tray) and renderer.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEta = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function etaCoreFactory() {
    const DEFAULT_WALL_FACTOR = 0.35;
    const PRE_TRANSCRIBE_FLOOR_SEC = 25;

    function median(nums) {
        const list = (Array.isArray(nums) ? nums : [])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        if (!list.length) return null;
        const mid = Math.floor(list.length / 2);
        return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
    }

    /**
     * Derive wallSec / totalDurationSec rates from task history entries.
     * @returns {number|null} seconds of wall time per second of media
     */
    function rateFromHistory(entries, { device, task, maxSamples = 20 } = {}) {
        const wantDevice = String(device || '').trim();
        const wantTask = String(task || '').trim();
        const rates = [];
        const list = Array.isArray(entries) ? entries : [];
        for (const entry of list) {
            if (!entry || entry.cancelled) continue;
            const d = String(entry.device || entry.options?.device || '').trim();
            const t = String(entry.task || entry.options?.task || '').trim();
            if (wantDevice && d && d !== wantDevice) continue;
            if (wantTask && t && t !== wantTask) continue;
            let wallSec = Number(entry.wallSec);
            if (!Number.isFinite(wallSec) || wallSec <= 0) {
                const start = Date.parse(entry.startedAt || '');
                const end = Date.parse(entry.finishedAt || '');
                if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                    wallSec = (end - start) / 1000;
                }
            }
            const totalDur = Number(entry.totalDurationSec) || 0;
            if (wallSec > 0 && totalDur > 0) {
                rates.push(wallSec / totalDur);
            }
            if (rates.length >= maxSamples) break;
        }
        return median(rates);
    }

    function batchProgressPct({ index, total, itemProgress }) {
        const i = Math.max(0, Number(index) || 0);
        const t = Math.max(0, Number(total) || 0);
        const itemPct = Math.max(0, Math.min(100, Number(itemProgress) || 0));
        if (t <= 0 || i <= 0) return Math.round(itemPct);
        return Math.min(99, Math.round(((i - 1) + itemPct / 100) / t * 100));
    }

    /**
     * Estimate remaining wall seconds for the rest of the batch.
     * @param {object} opts
     * @param {Array<{duration?:number,status?:string,path?:string}>} opts.items
     * @param {string} [opts.activePath]
     * @param {number} [opts.videoCurrentSec]
     * @param {number} [opts.videoTotalSec]
     * @param {string} [opts.itemStage]
     * @param {number} [opts.rate] wallSec per mediaSec
     */
    function estimateEtaSec(opts = {}) {
        const rate = Number(opts.rate);
        const wallFactor = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_WALL_FACTOR;
        const items = Array.isArray(opts.items) ? opts.items : [];
        const activePath = String(opts.activePath || '').replace(/\//g, '\\').toLowerCase();
        const stage = String(opts.itemStage || '');
        let remainingMediaSec = 0;
        let preFloor = 0;

        for (const item of items) {
            if (!item) continue;
            const st = String(item.status || '');
            if (st === 'done' || st === 'skipped' || st === 'failed' || st === 'error') continue;
            const dur = Math.max(0, Number(item.duration) || 0);
            const key = String(item.path || '').replace(/\//g, '\\').toLowerCase();
            const isActive = activePath && key === activePath;
            if (isActive) {
                const total = Math.max(0, Number(opts.videoTotalSec) || dur);
                const cur = Math.max(0, Number(opts.videoCurrentSec) || 0);
                if (stage === 'transcribe' || stage === 'save') {
                    remainingMediaSec += Math.max(0, total - cur);
                } else {
                    remainingMediaSec += total > 0 ? total : dur;
                    if (stage === 'starting' || stage === 'vad' || stage === 'model' || !stage) {
                        preFloor += PRE_TRANSCRIBE_FLOOR_SEC;
                    }
                }
            } else if (st === 'pending' || st === 'ready' || st === 'running' || st === 'probing' || !st) {
                remainingMediaSec += dur;
                preFloor += Math.min(PRE_TRANSCRIBE_FLOOR_SEC, 15);
            }
        }

        const eta = remainingMediaSec * wallFactor + preFloor;
        return Math.max(0, Math.round(eta));
    }

    function formatEtaCompact(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        if (s < 60) return `约 ${s}s`;
        const m = Math.floor(s / 60);
        const r = s % 60;
        if (m < 60) return r > 0 ? `约 ${m}分${r}秒` : `约 ${m} 分钟`;
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return rm > 0 ? `约 ${h}小时${rm}分` : `约 ${h} 小时`;
    }

    function buildTrayTooltip({ batchPct, index, total, etaText } = {}) {
        const parts = ['Transub 字幕生成'];
        const i = Number(index) || 0;
        const t = Number(total) || 0;
        const pct = Number(batchPct);
        if (t > 0 && i > 0) {
            parts.push(`第 ${i}/${t}`);
        }
        if (Number.isFinite(pct)) {
            parts.push(`${Math.max(0, Math.min(100, Math.round(pct)))}%`);
        }
        if (etaText) parts.push(`剩余 ${etaText}`);
        return parts.join(' · ');
    }

    return {
        DEFAULT_WALL_FACTOR,
        PRE_TRANSCRIBE_FLOOR_SEC,
        median,
        rateFromHistory,
        batchProgressPct,
        estimateEtaSec,
        formatEtaCompact,
        buildTrayTooltip,
    };
}));
