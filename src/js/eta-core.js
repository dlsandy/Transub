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
    const MIN_PROGRESS_ETA_ELAPSED_SEC = 12;
    const PROGRESS_STALL_SEC = 45;
    const HIGH_PROGRESS_TAIL_FLOOR = 0.35;
    /** Matches engine-job-progress translate load/work band (overall job %). */
    const TRANSLATE_PROGRESS_LO = 65;
    const TRANSLATE_PROGRESS_HI = 95;
    const TRANSLATE_ETA_MAX_SEC = 12 * 3600;

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

    function pendingItemsMediaSec(items, activePath) {
        const activeKey = String(activePath || '').replace(/\//g, '\\').toLowerCase();
        let pendingMediaSec = 0;
        let preFloor = 0;
        for (const item of items) {
            if (!item) continue;
            const st = String(item.status || '');
            if (st === 'done' || st === 'skipped' || st === 'failed' || st === 'error') continue;
            const key = String(item.path || '').replace(/\//g, '\\').toLowerCase();
            if (activeKey && key === activeKey) continue;
            const dur = Math.max(0, Number(item.duration) || 0);
            pendingMediaSec += dur;
            preFloor += Math.min(PRE_TRANSCRIBE_FLOOR_SEC, 15);
        }
        return { pendingMediaSec, preFloor };
    }

    /**
     * Engine SSE "翻译 N/M" (job-wide). Ignore adapter chunk labels.
     * @returns {{ done: number, total: number }|null}
     */
    function parseTranslateCueProgress(detail) {
        const text = String(detail || '');
        if (/(?:Sakura|推理|重新|分块|机器|Hy-MT2|Index-Translate|GalTransl|TranslateGemma)\s*翻译/i.test(text)) {
            return null;
        }
        const m = text.match(/(?:^|[^a-zA-Z])翻译\s+(\d+)\s*[/／]\s*(\d+)/i);
        if (!m) return null;
        const done = Number(m[1]);
        const total = Number(m[2]);
        if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
        return { done: Math.max(0, done), total };
    }

    /** Map overall job % (65–95 translate band) → local MT progress 0–100. */
    function translateBandLocalPct(itemProgress) {
        const p = Math.max(0, Math.min(100, Number(itemProgress) || 0));
        if (p <= TRANSLATE_PROGRESS_LO) return 0;
        if (p >= TRANSLATE_PROGRESS_HI) return 99;
        return ((p - TRANSLATE_PROGRESS_LO) / (TRANSLATE_PROGRESS_HI - TRANSLATE_PROGRESS_LO)) * 100;
    }

    /**
     * Slow local LLM MT (esp. Hy-MT2 30B MoE) needs a much larger media/wall scale
     * than Opus / Sakura-1.5B history rates.
     * @returns {number} >= 1
     */
    function resolveMtEtaScale(opts = {}) {
        const id = String(opts.mtModelId || opts.engineMtModel || '').trim().toLowerCase();
        const weight = Number(opts.mtWeightGiB);
        const billion = Number(opts.mtParamBillion);
        const activeBillion = Number(opts.mtActiveParamBillion);
        let scale = 1;
        if (/hy-?mt2-30b|30b-a3b-heretic|heretic-apex/i.test(id)) {
            scale = Math.max(scale, 10);
        } else if (/hy-?mt2-7b|translategemma-27|qwen.*72b|llama.*70b/i.test(id)) {
            scale = Math.max(scale, 3.5);
        } else if (/translategemma-12|sakura-14|galtransl-14/i.test(id)) {
            scale = Math.max(scale, 2.2);
        }
        if (Number.isFinite(weight) && weight >= 9) {
            scale = Math.max(scale, Math.min(14, weight / 1.2));
        } else if (Number.isFinite(billion) && billion >= 20) {
            scale = Math.max(scale, Math.min(12, billion / 3));
        } else if (opts.moe === true && Number.isFinite(activeBillion) && activeBillion > 0 && billion >= 20) {
            scale = Math.max(scale, 8);
        }
        return scale;
    }

    function estimateTranslateElapsedSec(opts = {}, elapsedSec = 0, wallFactor = DEFAULT_WALL_FACTOR) {
        const stageElapsed = Number(opts.translateStageElapsedSec);
        if (Number.isFinite(stageElapsed) && stageElapsed > 0) return stageElapsed;
        const startedAt = Number(opts.translateStageStartedAt) || 0;
        if (startedAt > 0) {
            return Math.max(0, (Date.now() - startedAt) / 1000);
        }
        // Attribute ASR wall out of item elapsed so cue/progress rates aren't polluted.
        const itemProgress = Math.max(1, Math.min(99, Number(opts.itemProgress) || 0));
        const mediaSec = Math.max(0, Number(opts.videoTotalSec) || 0);
        const asrWallCap = mediaSec > 0 ? mediaSec * wallFactor * 1.25 : elapsedSec * 0.85;
        const asrWallEst = Math.min(
            elapsedSec * Math.min(1, TRANSLATE_PROGRESS_LO / itemProgress),
            asrWallCap,
        );
        return Math.max(8, elapsedSec - asrWallEst);
    }

    function estimateActiveItemRemainMediaSec(opts = {}) {
        const stage = String(opts.itemStage || '');
        const dur = Math.max(0, Number(opts.videoTotalSec) || 0);
        const cur = Math.max(0, Number(opts.videoCurrentSec) || 0);
        const itemProgress = Math.max(0, Math.min(99, Number(opts.itemProgress) || 0));
        const mtScale = stage === 'translate' ? resolveMtEtaScale(opts) : 1;

        if (stage === 'transcribe' || stage === 'source_cleanup' || stage === 'semantic_repair') {
            const total = dur || cur;
            return Math.max(0, total - cur);
        }

        // Post-ASR bands (translate / polish / QC): timeline no longer tracks media seconds.
        const totalDur = dur || cur;
        if (itemProgress >= 8) {
            const localRemain = stage === 'translate'
                ? Math.max(0, (100 - translateBandLocalPct(itemProgress)) / 100)
                : Math.max(0, (100 - itemProgress) / 100);
            const postShare = stage === 'translate'
                ? 0.55 * mtScale
                : (stage === 'qc_fix' ? 0.08 : (stage === 'cleanup' ? 0.12 : 0.18));
            return totalDur * postShare * localRemain;
        }

        if (stage === 'translate') return totalDur * 0.55 * mtScale;
        if (stage === 'qc_fix') return totalDur * 0.08;
        if (stage === 'cleanup' || stage === 'save') return totalDur * 0.12;
        if (stage === 'starting' || stage === 'vad' || stage === 'model' || !stage) {
            return totalDur > 0 ? totalDur : 0;
        }
        return totalDur * Math.max(0, (100 - itemProgress) / 100);
    }

    /**
     * Prefer cue-count / translate-band progress over ASR-polluted overall %.
     */
    function estimateTranslateRemainWallSec(opts = {}, ctx = {}) {
        const elapsedSec = Math.max(0, Number(ctx.elapsedSec) || 0);
        const wallFactor = Number(ctx.wallFactor) > 0 ? Number(ctx.wallFactor) : DEFAULT_WALL_FACTOR;
        const itemProgress = Math.max(0, Math.min(99, Number(opts.itemProgress) || 0));
        const mtElapsed = estimateTranslateElapsedSec(opts, elapsedSec, wallFactor);
        const cues = (Number.isFinite(Number(opts.translateDone)) && Number.isFinite(Number(opts.translateTotal)))
            ? {
                done: Math.max(0, Number(opts.translateDone) || 0),
                total: Math.max(0, Number(opts.translateTotal) || 0),
            }
            : parseTranslateCueProgress(opts.itemDetail);

        if (cues && cues.done >= 1 && cues.total > cues.done && mtElapsed >= 8) {
            return (mtElapsed / cues.done) * (cues.total - cues.done);
        }

        const local = translateBandLocalPct(itemProgress);
        if (local >= 5 && mtElapsed >= MIN_PROGRESS_ETA_ELAPSED_SEC) {
            return (mtElapsed / local) * (100 - local);
        }

        const tailMedia = estimateActiveItemRemainMediaSec({
            ...opts,
            itemStage: 'translate',
            itemProgress,
        });
        return tailMedia * wallFactor;
    }

    /**
     * Estimate remaining wall seconds for the rest of the batch.
     * @param {object} opts
     * @param {Array<{duration?:number,status?:string,path?:string,startedAt?:number}>} opts.items
     * @param {string} [opts.activePath]
     * @param {number} [opts.videoCurrentSec]
     * @param {number} [opts.videoTotalSec]
     * @param {string} [opts.itemStage]
     * @param {number} [opts.itemProgress] job-wide 0–100 for active item
     * @param {number} [opts.activeStartedAt] ms timestamp
     * @param {number} [opts.lastProgressBumpAt] ms timestamp of last itemProgress increase
     * @param {number} [opts.rate] wallSec per mediaSec
     * @param {string} [opts.itemDetail] progress detail (may include 翻译 N/M)
     * @param {string} [opts.mtModelId] / opts.engineMtModel — slow-MT scale
     * @param {number} [opts.translateStageStartedAt] ms when translate stage began
     * @param {number} [opts.translateStageElapsedSec] override elapsed in translate
     */
    function estimateEtaSec(opts = {}) {
        const rate = Number(opts.rate);
        const wallFactor = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_WALL_FACTOR;
        const items = Array.isArray(opts.items) ? opts.items : [];
        const activePath = String(opts.activePath || '').replace(/\//g, '\\').toLowerCase();
        const itemProgress = Math.max(0, Math.min(99, Number(opts.itemProgress) || 0));
        const activeStartedAt = Number(opts.activeStartedAt) || 0;
        const lastProgressBumpAt = Number(opts.lastProgressBumpAt) || 0;
        const itemStage = String(opts.itemStage || '');
        const { pendingMediaSec, preFloor } = pendingItemsMediaSec(items, activePath);
        const pendingScale = itemStage === 'translate' ? Math.max(1, Math.sqrt(resolveMtEtaScale(opts))) : 1;
        const pendingWall = pendingMediaSec * wallFactor * pendingScale + preFloor;

        let activeRemainWall = 0;
        let activePreFloor = 0;
        const activeItem = items.find(
            (it) => String(it?.path || '').replace(/\//g, '\\').toLowerCase() === activePath,
        );

        if (activePath && activeItem) {
            const st = String(activeItem.status || '');
            if (st !== 'done' && st !== 'skipped' && st !== 'failed' && st !== 'error') {
                const elapsedSec = activeStartedAt > 0
                    ? Math.max(0, (Date.now() - activeStartedAt) / 1000)
                    : 0;
                const mediaOpts = {
                    ...opts,
                    itemStage,
                    videoCurrentSec: opts.videoCurrentSec,
                    videoTotalSec: opts.videoTotalSec || activeItem.duration,
                    itemProgress,
                };
                const tailMedia = estimateActiveItemRemainMediaSec(mediaOpts);
                const tailWall = tailMedia * wallFactor;
                const stallSec = lastProgressBumpAt > 0
                    ? Math.max(0, (Date.now() - lastProgressBumpAt) / 1000)
                    : 0;
                const postAsrStage = itemStage === 'translate' || itemStage === 'qc_fix'
                    || itemStage === 'cleanup' || itemStage === 'save';

                if (itemStage === 'translate') {
                    activeRemainWall = estimateTranslateRemainWallSec(mediaOpts, {
                        elapsedSec,
                        wallFactor,
                    });
                } else if (itemProgress >= 8 && elapsedSec >= MIN_PROGRESS_ETA_ELAPSED_SEC) {
                    activeRemainWall = (elapsedSec / itemProgress) * (100 - itemProgress);
                } else {
                    activeRemainWall = tailWall;
                    if (itemStage === 'starting' || itemStage === 'vad' || itemStage === 'model' || !itemStage) {
                        activePreFloor = PRE_TRANSCRIBE_FLOOR_SEC;
                    }
                }

                // Former Math.min(tailWall) crush made slow LLM MT look almost done at 70%+.
                // Keep a soft ceiling for QC/cleanup only; translate uses cue/band ETA uncapped
                // except a hard sanity max.
                if (postAsrStage && itemProgress >= 70 && itemStage !== 'translate') {
                    activeRemainWall = Math.min(
                        activeRemainWall,
                        Math.max(tailWall, HIGH_PROGRESS_TAIL_FLOOR * tailWall + 15),
                    );
                }
                if (itemStage === 'translate') {
                    activeRemainWall = Math.min(activeRemainWall, TRANSLATE_ETA_MAX_SEC);
                }
                if (postAsrStage && stallSec >= PROGRESS_STALL_SEC) {
                    activeRemainWall = Math.max(activeRemainWall, tailWall);
                }
            }
        }

        const eta = activeRemainWall + activePreFloor + pendingWall;
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
        const parts = ['Transub 字幕工厂'];
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
        MIN_PROGRESS_ETA_ELAPSED_SEC,
        TRANSLATE_PROGRESS_LO,
        TRANSLATE_PROGRESS_HI,
        median,
        rateFromHistory,
        batchProgressPct,
        parseTranslateCueProgress,
        translateBandLocalPct,
        resolveMtEtaScale,
        estimateEtaSec,
        formatEtaCompact,
        buildTrayTooltip,
    };
}));
