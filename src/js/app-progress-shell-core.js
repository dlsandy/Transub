/**
 * Progress display / elapsed ticker shell helpers.
 * Shell injects state + progressDisplayApi via createAppProgressShell(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppProgressShell = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appProgressShellFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createAppProgressShell(deps) {
        const d = deps || {};
        const state = d.state || {};
        const progressDisplayApi = d.progressDisplayApi || {};
        const inferProgress = d.inferProgress || {};
        const STAGE_LABELS = d.STAGE_LABELS || inferProgress.STAGE_LABELS || Object.create(null);
        const stageRank = d.stageRank
            || inferProgress.stageRank
            || ((stage) => 0);
        const scrubProgressDetail = d.scrubProgressDetail
            || inferProgress.scrubProgressDetail
            || ((detail) => String(detail || ''));
        const formatDuration = d.formatDuration || ((sec) => String(sec || 0));
        const isPreTranscribeStageDep = d.isPreTranscribeStage;
        const readTaskFromForm = d.readTaskFromForm || (() => '');
        const updateProgressUi = d.updateProgressUi || (() => {});
        const refreshListRow = d.refreshListRow || (() => {});
        const findItem = d.findItem || (() => null);

        function stageLabel(stage) {
            if (progressDisplayApi.stageLabel) {
                return progressDisplayApi.stageLabel(stage, {
                    stageLabels: STAGE_LABELS,
                    itemDualPhase: state.itemDualPhase,
                    task: readTaskFromForm(),
                });
            }
            return STAGE_LABELS[stage] || '处理中';
        }

        function formatListRunningDetail(rawDetail) {
            if (progressDisplayApi.formatListRunningDetail) {
                return progressDisplayApi.formatListRunningDetail(rawDetail, {
                    scrubProgressDetail,
                    itemDualPhase: state.itemDualPhase,
                });
            }
            return scrubProgressDetail(rawDetail);
        }

        function formatRunningProgressLabel(stage, detail) {
            if (progressDisplayApi.formatRunningProgressLabel) {
                return progressDisplayApi.formatRunningProgressLabel(stage, detail, {
                    stageLabels: STAGE_LABELS,
                    scrubProgressDetail,
                    itemDualPhase: state.itemDualPhase,
                    task: readTaskFromForm(),
                });
            }
            return stageLabel(stage);
        }

        function clearQwenIslandBatchSticky() {
            state.qwenIslandBatchSticky = null;
        }

        function enrichProgressDetail(detail) {
            const core = (global && global.TransubQwenAsrProgress) || d.qwenAsrProgressApi;
            if (!core?.applyProgressDetail) {
                return String(detail || '');
            }
            const out = core.applyProgressDetail(detail, state.qwenIslandBatchSticky);
            state.qwenIslandBatchSticky = out.sticky;
            return out.detail;
        }

        function formatJobProgressLabel(stage, detail) {
            return formatRunningProgressLabel(stage, enrichProgressDetail(detail));
        }

        function isPreTranscribeStage(stage) {
            // Prefer infer-core first. A deps.isPreTranscribeStage that late()-binds
            // back to this same host method used to recurse until stack overflow.
            if (inferProgress.isPreTranscribeStage) {
                return inferProgress.isPreTranscribeStage(stage);
            }
            if (typeof isPreTranscribeStageDep === 'function') {
                return isPreTranscribeStageDep(stage);
            }
            return stageRank(stage) < stageRank('transcribe');
        }

        function effectiveItemProgress(stage, progress) {
            if (progressDisplayApi.effectiveItemProgress) {
                return progressDisplayApi.effectiveItemProgress(stage, progress, {
                    running: state.running,
                    itemDualPhase: state.itemDualPhase,
                    isPreTranscribeStage,
                });
            }
            return Math.max(0, Math.min(100, Number(progress) || 0));
        }

        function computeDisplayProgress() {
            if (progressDisplayApi.computeDisplayProgress) {
                return progressDisplayApi.computeDisplayProgress({
                    running: state.running,
                    itemStage: state.itemStage,
                    itemDualPhase: state.itemDualPhase,
                    videoProgress: state.videoProgress,
                    videoCurrentSec: state.videoCurrentSec,
                    videoTotalSec: state.videoTotalSec,
                    index: state.index,
                    total: state.total,
                    formatDuration,
                    isPreTranscribeStage,
                });
            }
            return { pct: 0, label: '…' };
        }

        /** 与 transwithai-bridge mapInferStageProgress 保持一致（渲染层兜底） */
        function mapStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
            if (inferProgress.mapStageProgress) {
                return inferProgress.mapStageProgress(stage, rawPct, videoCurrentSec, videoTotalSec);
            }
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
                    return Math.min(98, Math.round((timelinePct / 100) * 98));
                }
                case 'save': return 99;
                case 'done': return 100;
                default:
                    return stageRank(stage) >= stageRank('transcribe')
                        ? Math.min(98, local)
                        : 0;
            }
        }

        function elapsedSecSince(ts) {
            if (!ts) return 0;
            return Math.max(0, Math.floor((Date.now() - ts) / 1000));
        }

        function itemElapsedSec(item) {
            if (!item?.startedAt) return 0;
            const endTs = item.status === 'running' ? Date.now() : (item.completedAt || item.startedAt);
            return Math.max(0, Math.floor((endTs - item.startedAt) / 1000));
        }

        function formatElapsedCell(item) {
            if (progressDisplayApi.formatElapsedCell) {
                return progressDisplayApi.formatElapsedCell(item, {
                    formatDuration,
                    itemElapsedSec,
                });
            }
            if (item.status === 'pending' || item.status === 'ready') return '—';
            if (!item.startedAt) return '—';
            return formatDuration(itemElapsedSec(item));
        }

        function formatProcessedCell(item) {
            if (progressDisplayApi.formatProcessedCell) {
                return progressDisplayApi.formatProcessedCell(item, { formatDuration });
            }
            return '—';
        }

        function bumpProgress(current, next) {
            if (inferProgress.bumpProgress) return inferProgress.bumpProgress(current, next);
            const cur = Math.max(0, Math.min(99, Number(current) || 0));
            const nxt = Math.max(0, Math.min(99, Number(next) || 0));
            return Math.max(cur, nxt);
        }

        function startElapsedTicker() {
            if (state.elapsedTicker) return;
            state.elapsedTicker = setInterval(() => {
                if (!state.running && !state.retranslateBusy) {
                    stopElapsedTicker();
                    return;
                }
                if (state.running) updateProgressUi();
                // Light refresh: elapsed/ETA cells only — skip recipe capsule + QC banner.
                const active = state.activePath ? findItem(state.activePath) : null;
                if (active?.status === 'running') {
                    refreshListRow(active, { light: true });
                }
            }, 2000);
        }

        function stopElapsedTicker() {
            if (!state.elapsedTicker) return;
            clearInterval(state.elapsedTicker);
            state.elapsedTicker = null;
        }

        return {
            stageLabel,
            formatListRunningDetail,
            formatRunningProgressLabel,
            clearQwenIslandBatchSticky,
            enrichProgressDetail,
            formatJobProgressLabel,
            effectiveItemProgress,
            computeDisplayProgress,
            mapStageProgress,
            elapsedSecSince,
            itemElapsedSec,
            formatElapsedCell,
            formatProcessedCell,
            bumpProgress,
            isPreTranscribeStage,
            startElapsedTicker,
            stopElapsedTicker,
        };
    }

    return { createAppProgressShell };
}));
