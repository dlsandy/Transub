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
        cleanup: '字幕清理',
        model: '加载模型',
        transcribe: '转写中',
        translate: '翻译中',
        save: '保存字幕',
        done: '完成',
        failed: '失败',
    };

    const STAGE_RANK = {
        starting: 0,
        denoise: 1,
        separate: 1,
        vad: 2,
        vad_failover: 2,
        model: 3,
        transcribe: 4,
        translate: 4,
        save: 5,
        done: 6,
        failed: 6,
    };

    function stageRank(stage) {
        return STAGE_RANK[stage] ?? 0;
    }

    function scrubProgressDetail(detail) {
        return String(detail || '')
            .trim()
            .replace(/^(转写\s*\/\s*翻译中|转写中|翻译中|转写|翻译|识别中)\s*[·•]?\s*/u, '')
            .trim();
    }

    /** Align with transwithai-bridge mapInferStageProgress (renderer fallback). */
    function mapStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
        const local = Math.max(0, Math.min(100, Number(rawPct) || 0));
        const mediaSec = Number(videoTotalSec) || 0;
        const currentSec = Number(videoCurrentSec) || 0;
        switch (stage) {
            case 'starting':
            case 'vad':
            case 'model':
                return 0;
            case 'transcribe': {
                const timelinePct = mediaSec >= 60
                    ? Math.min(100, Math.round((currentSec / mediaSec) * 100))
                    : local;
                // Leave ~28% for translate / finalize (align with engine remap_job_progress).
                return Math.min(68, Math.round((timelinePct / 100) * 68));
            }
            case 'translate':
                return Math.min(96, 68 + Math.round((local / 100) * 28));
            case 'save': return 99;
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
            videoProgress = 0;
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
        videoProgress = bumpProgress(videoProgress, mapped);
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
        mapStageProgress,
        bumpProgress,
        isPreTranscribeStage,
        applyVideoProgressPayload,
    };
}));
