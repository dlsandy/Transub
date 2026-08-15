/**
 * Post-task action + QC banner view-model helpers (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPostTaskQcUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function postTaskQcUiFactory() {
    const POST_TASK_ACTIONS = Object.freeze([
        'none', 'quit', 'shutdown', 'sleep', 'open_folder',
    ]);
    const POST_TASK_LABELS = Object.freeze({
        none: '无额外操作',
        open_folder: '打开输出目录',
        sleep: '睡眠',
        quit: '退出应用',
        shutdown: '关机',
    });

    function normalizePostTaskAction(action) {
        const a = String(action || 'none');
        return POST_TASK_ACTIONS.includes(a) ? a : 'none';
    }

    function postTaskActionLabel(action) {
        const a = normalizePostTaskAction(action);
        return POST_TASK_LABELS[a] || POST_TASK_LABELS.none;
    }

    /**
     * @param {string} action
     * @param {{ shutdownDelaySec?: number, playSoundOnComplete?: boolean }} [extras]
     */
    function buildPostTaskOptionsFromAction(action, extras = {}) {
        const next = normalizePostTaskAction(action);
        const base = {
            shutdownDelaySec: Number(extras.shutdownDelaySec) || 60,
            playSoundOnComplete: !!extras.playSoundOnComplete,
            sleepOnComplete: false,
            openOutputFolderOnComplete: false,
            closeWindowOnComplete: false,
            quitAppOnComplete: false,
            shutdownOnComplete: false,
        };
        if (next === 'quit') {
            return { ...base, postTaskAction: 'quit', quitAppOnComplete: true };
        }
        if (next === 'shutdown') {
            return {
                ...base,
                postTaskAction: 'shutdown',
                quitAppOnComplete: true,
                shutdownOnComplete: true,
            };
        }
        if (next === 'sleep') {
            return { ...base, postTaskAction: 'sleep', sleepOnComplete: true };
        }
        if (next === 'open_folder') {
            return { ...base, postTaskAction: 'open_folder', openOutputFolderOnComplete: true };
        }
        return { ...base, postTaskAction: 'none' };
    }

    function countQcIssues(items) {
        return (items || []).filter((i) => Number(i?.qcIssueCount) > 0).length;
    }

    function markItemQcFixed(item, mode, {
        written = false,
        summary = '',
        now = Date.now(),
    } = {}) {
        if (!item) return item;
        item.qcFixedMode = mode === 'smart' ? 'smart' : 'fix';
        item.qcFixedWritten = !!written;
        item.qcFixedSummary = String(summary || '').trim().slice(0, 200);
        item.qcFixedAt = now;
        return item;
    }

    function clearItemQcFixed(item, { clearScan = false } = {}) {
        if (!item) return item;
        item.qcFixedMode = '';
        item.qcFixedWritten = false;
        item.qcFixedSummary = '';
        item.qcFixedAt = 0;
        if (clearScan) {
            item.qcIssueCount = undefined;
            item.qcSummary = '';
            item.qcError = '';
        }
        return item;
    }

    /**
     * @returns {{
     *   visible: boolean,
     *   text: string,
     *   fixDisabled: boolean,
     *   fixLabel: string,
     *   smartVisible: boolean,
     *   smartDisabled: boolean,
     *   smartLabel: string,
     * }}
     */
    function buildQcBannerViewModel({
        issueCount = 0,
        dismissed = false,
        fixing = false,
        smartFixing = false,
        running = false,
        advancedEntitled = false,
        smartFixAvailable = false,
    } = {}) {
        const n = Number(issueCount) || 0;
        if (n <= 0 || dismissed) {
            return {
                visible: false,
                text: '',
                fixDisabled: true,
                fixLabel: '一键修复QC',
                smartVisible: false,
                smartDisabled: true,
                smartLabel: '智能修复 (Pro)',
            };
        }
        const smartOk = !!advancedEntitled && !!smartFixAvailable;
        return {
            visible: true,
            text: fixing
                ? `正在${smartFixing ? '智能' : '一键'}修复 QC（${n} 条有问题）…`
                : `${n} 条字幕有 QC 问题，可一键修复${advancedEntitled ? ' / 智能修复' : ''}或在编辑器中查看`,
            fixDisabled: !!running || !!fixing,
            fixLabel: fixing && !smartFixing ? '修复中…' : '一键修复QC',
            smartVisible: smartOk,
            smartDisabled: !smartOk || !!running || !!fixing,
            smartLabel: smartFixing ? '智能修复中…' : '智能修复 (Pro)',
        };
    }

    return {
        POST_TASK_ACTIONS,
        POST_TASK_LABELS,
        normalizePostTaskAction,
        postTaskActionLabel,
        buildPostTaskOptionsFromAction,
        countQcIssues,
        markItemQcFixed,
        clearItemQcFixed,
        buildQcBannerViewModel,
    };
}));
