/**
 * Infer / batch stage progress math (shared with TWAI bridge mapping).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubInferStageProgress = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function inferStageProgressFactory() {
    const STAGE_LABELS = {
        starting: '启动',
        denoise: '轻度降噪',
        separate: '人声分离',
        scene: '场景切分',
        vad: '语音检测',
        vad_failover: 'VAD 回退',
        cleanup: '译文校正',
        source_cleanup: '原文校正',
        semantic_repair: '原文校正',
        pre_mt_qc: '译前质量门闸',
        model: '加载识别模型',
        transcribe: '原文提取',
        translate: '翻译中',
        qc_fix: '译文校正 · QC修复',
        qc_loop: 'QC 闭环',
        save: '保存字幕',
        postprocess: '字幕后期处理',
        done: '完成',
        failed: '失败',
    };

    const STAGE_RANK = {
        starting: 0,
        denoise: 1,
        separate: 1,
        vad: 2,
        vad_failover: 2,
        scene: 2,
        model: 3,
        transcribe: 4,
        source_cleanup: 5,
        semantic_repair: 5,
        pre_mt_qc: 5,
        translate: 6,
        cleanup: 7,
        save: 8,
        write: 8,
        qc_fix: 9,
        qc_loop: 9,
        postprocess: 9,
        done: 10,
        failed: 10,
    };

    function stageRank(stage) {
        return STAGE_RANK[stage] ?? 0;
    }

    function scrubProgressDetail(detail) {
        return String(detail || '')
            .trim()
            .replace(/^(转写\s*\/\s*翻译中|转写中|提取原文中|原文提取中|翻译中|转写|提取原文|原文提取|翻译|识别中)\s*[·•]?\s*/u, '')
            .trim();
    }

    function parseTranslateWorkNumerator(detail) {
        const text = String(detail || '');
        if (/(?:Sakura|推理|重新|分块|机器|Hy-MT2|GalTransl|TranslateGemma)\s*翻译/i.test(text)) return null;
        const m = text.match(/(?:^|[^a-zA-Z])翻译\s+(\d+)\s*[/／]\s*(\d+)/i);
        if (!m) return null;
        const done = Number(m[1]);
        const total = Number(m[2]);
        if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
        return { done: Math.max(0, done), total };
    }

    function capTranslateProgressByWork(mapped, detail, videoProgress = 0) {
        const batch = parseTranslateWorkNumerator(detail);
        if (batch && batch.total > 0) {
            const ratioCap = batch.done <= 0
                ? 65
                : Math.round(70 + (batch.done / batch.total) * 25);
            const headroom = batch.done <= 0 ? 5 : 2;
            if (mapped > ratioCap + headroom) {
                return Math.max(65, Math.min(mapped, ratioCap + headroom));
            }
            return mapped;
        }
        if (Number.isFinite(mapped) && mapped > videoProgress + 25
            && videoProgress < 72 && mapped >= 88) {
            return Math.min(mapped, Math.max(videoProgress + 6, 65));
        }
        return mapped;
    }

    function scaleBand(localPct, lo, hi) {
        const ratio = Math.max(0, Math.min(100, Number(localPct) || 0)) / 100;
        return Math.round(lo + (hi - lo) * ratio);
    }

    /** Align with transwithai-bridge / engine remap_job_progress (renderer fallback). */
    function mapStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
        const local = Math.max(0, Math.min(100, Number(rawPct) || 0));
        const mediaSec = Number(videoTotalSec) || 0;
        const currentSec = Number(videoCurrentSec) || 0;
        switch (stage) {
            case 'starting':
            case 'vad':
            case 'model':
                return Math.min(5, scaleBand(Math.max(local, 5), 1, 5));
            case 'cleanup':
                return scaleBand(local, 95, 97);
            case 'source_cleanup':
            case 'semantic_repair':
            case 'pre_mt_qc':
                return scaleBand(local, 62, 65);
            case 'transcribe': {
                const timelinePct = mediaSec >= 60
                    ? Math.min(100, Math.round((currentSec / mediaSec) * 100))
                    : local;
                return Math.min(65, Math.round(5 + (timelinePct / 100) * 60));
            }
            case 'translate': {
                if (local <= 8) return scaleBand((local / 8) * 100, 65, 70);
                return scaleBand(((local - 8) / 92) * 100, 70, 95);
            }
            case 'qc_fix':
            case 'qc_loop':
                return scaleBand(local, 98, 100);
            case 'save': return scaleBand(local, 97, 98);
            case 'done': return 100;
            default:
                return stageRank(stage) >= stageRank('transcribe')
                    ? Math.min(96, local)
                    : 0;
        }
    }

    function bumpProgress(current, next) {
        const cur = Math.max(0, Math.min(99, Number(current) || 0));
        const nxt = Math.max(0, Math.min(99, Number(next) || 0));
        return Math.max(cur, nxt);
    }

    function isPreTranscribeStage(stage) {
        return stageRank(stage) < stageRank('transcribe');
    }

    /**
     * Pure video progress state transition from an infer/progress payload.
     * @returns {{ itemDualPhase: string, itemStage: string, videoProgress: number, videoTotalSec?: number, videoCurrentSec?: number }|null}
     */
    function applyVideoProgressPayload(state = {}, payload = {}) {
        if (payload.phase !== 'running') return null;
        let itemDualPhase = state.itemDualPhase;
        let itemStage = state.itemStage || 'starting';
        let videoProgress = Number(state.videoProgress) || 0;
        let videoTotalSec = state.videoTotalSec;
        let videoCurrentSec = state.videoCurrentSec;

        if (payload.itemDualPhase && payload.itemDualPhase !== itemDualPhase) {
            itemDualPhase = payload.itemDualPhase;
            itemStage = payload.itemStage || 'starting';
        }
        const stage = payload.itemStage || 'transcribe';
        if (stageRank(stage) >= stageRank(itemStage)) {
            itemStage = stage;
        }

        if (isPreTranscribeStage(itemStage)) {
            if (payload.itemDualPhase && Number.isFinite(Number(payload.itemProgress))) {
                videoProgress = bumpProgress(videoProgress, Number(payload.itemProgress));
                return { itemDualPhase, itemStage, videoProgress, videoTotalSec, videoCurrentSec };
            }
            if (Number.isFinite(Number(payload.itemProgress)) && Number(payload.itemProgress) > 0) {
                videoProgress = bumpProgress(videoProgress, Number(payload.itemProgress));
                if (Number(payload.videoTotalSec) > 0) {
                    videoTotalSec = Number(payload.videoTotalSec);
                    videoCurrentSec = Number(payload.videoCurrentSec) || 0;
                }
                return { itemDualPhase, itemStage, videoProgress, videoTotalSec, videoCurrentSec };
            }
            const mappedPrep = mapStageProgress(
                itemStage,
                Number(payload.itemProgress) || 0,
                Number(payload.videoCurrentSec) || 0,
                Number(payload.videoTotalSec) || 0,
            );
            videoProgress = bumpProgress(videoProgress, mappedPrep);
            return { itemDualPhase, itemStage, videoProgress, videoTotalSec, videoCurrentSec };
        }

        const mapped = Number.isFinite(Number(payload.itemProgress))
            ? Number(payload.itemProgress)
            : mapStageProgress(
                stage,
                Number(payload.itemProgress) || 0,
                Number(payload.videoCurrentSec) || 0,
                Number(payload.videoTotalSec) || 0,
            );
        const progressDetail = payload.itemDetail || payload.detail || '';
        let nextMapped = stage === 'translate'
            ? capTranslateProgressByWork(mapped, progressDetail, videoProgress)
            : mapped;
        // Drop premature save/done hold (~97%) when real translate ticks arrive.
        if (stage === 'translate' && videoProgress >= 96 && nextMapped < videoProgress && nextMapped <= 95) {
            videoProgress = Math.max(0, Math.min(99, nextMapped));
        } else {
            videoProgress = bumpProgress(videoProgress, nextMapped);
        }
        if (Number(payload.videoTotalSec) > 0) {
            videoTotalSec = Number(payload.videoTotalSec);
            videoCurrentSec = Number(payload.videoCurrentSec) || 0;
        }
        return { itemDualPhase, itemStage, videoProgress, videoTotalSec, videoCurrentSec };
    }

    return {
        STAGE_LABELS,
        STAGE_RANK,
        stageRank,
        scrubProgressDetail,
        parseTranslateWorkNumerator,
        capTranslateProgressByWork,
        mapStageProgress,
        bumpProgress,
        isPreTranscribeStage,
        applyVideoProgressPayload,
    };
}));
