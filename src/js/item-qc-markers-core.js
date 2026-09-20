/**
 * Per-item QC path helpers and fixed-marker mutations.
 * Shell injects list/QC APIs via createItemQcMarkers(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubItemQcMarkers = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function itemQcMarkersFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createItemQcMarkers(deps) {
        const d = deps || {};
        const state = d.state || {};
        const itemPosttaskPathsApi = d.itemPosttaskPathsApi || {};
        const postTaskQcApi = d.postTaskQcApi || {};
        const taskListRowApi = d.taskListRowApi || d.factoryTaskUiApi || {};
        const esc = d.esc || ((s) => String(s ?? ''));

        function getSubtitlePathForItem(item) {
            if (itemPosttaskPathsApi.pickSubtitlePath) {
                return itemPosttaskPathsApi.pickSubtitlePath(item);
            }
            return item?.targetSubtitlePath
                || item?.subtitlePath
                || item?.existingSubtitle
                || '';
        }

        /** Paths that need post-task Chinese / CPS / noise fix (target + merged dual). */
        function getPostBatchPathsForItem(item) {
            if (itemPosttaskPathsApi.collectPostBatchPaths) {
                return itemPosttaskPathsApi.collectPostBatchPaths(item);
            }
            return [];
        }

        /** 译文轨 QC 智能修复时的对照原文路径（与 subtitle-qc-smart-core.resolveQcSemanticPairPath 一致）。 */
        function resolveQcSemanticPairPathForItem(item, fixingPath) {
            if (itemPosttaskPathsApi.resolveQcSemanticPairPath) {
                return itemPosttaskPathsApi.resolveQcSemanticPairPath(item, fixingPath);
            }
            return '';
        }

        function showPathForItem(item) {
            return getSubtitlePathForItem(item) || item.path || '';
        }

        function statusMeta(status) {
            if (taskListRowApi.statusMeta) return taskListRowApi.statusMeta(status);
            return { label: status || '—', cls: 'row-status-pending' };
        }

        function countQcIssues() {
            if (postTaskQcApi.countQcIssues) return postTaskQcApi.countQcIssues(state.items);
            return (state.items || []).filter((i) => Number(i.qcIssueCount) > 0).length;
        }

        function markItemQcFixed(item, mode, { written = false, summary = '' } = {}) {
            if (postTaskQcApi.markItemQcFixed) {
                return postTaskQcApi.markItemQcFixed(item, mode, { written, summary });
            }
            if (!item) return;
            item.qcFixedMode = mode === 'smart' ? 'smart' : 'fix';
            item.qcFixedWritten = !!written;
            item.qcFixedSummary = String(summary || '').trim().slice(0, 200);
            item.qcFixedAt = Date.now();
            if (String(item.status || '') === 'running'
                && (String(item.stage || '') === 'qc_fix' || /QC/.test(String(item.detail || '')))) {
                item.status = 'done';
                item.progress = 100;
                item.stage = '';
                item.detail = String(summary || '已完成').trim() || '已完成';
            }
        }

        function clearItemQcFixed(item, { clearScan = false } = {}) {
            if (postTaskQcApi.clearItemQcFixed) {
                return postTaskQcApi.clearItemQcFixed(item, { clearScan });
            }
            if (!item) return;
            item.qcFixedMode = '';
            item.qcFixedWritten = false;
            item.qcFixedSummary = '';
            item.qcFixedAt = 0;
            if (clearScan) {
                item.qcIssueCount = undefined;
                item.qcSummary = '';
                item.qcError = '';
            }
        }

        function qcFixedTagHtml(item) {
            if (taskListRowApi.qcFixedTagHtml) return taskListRowApi.qcFixedTagHtml(item, esc);
            return '';
        }

        return {
            getSubtitlePathForItem,
            getPostBatchPathsForItem,
            resolveQcSemanticPairPathForItem,
            showPathForItem,
            statusMeta,
            countQcIssues,
            markItemQcFixed,
            clearItemQcFixed,
            qcFixedTagHtml,
        };
    }

    return { createItemQcMarkers };
}));
