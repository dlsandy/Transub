/**
 * Post-task extras / queue badge / subtitle formats / log+batch UI sync.
 * Shell injects DOM/IPC/state via createPostTaskUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPostTaskUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function postTaskUiFactory(global) {
    const LOG_LEVEL_HINTS = {
        DEBUG: '输出 VAD 分块、模型加载、每句字幕时间轴等全部细节。Transub 可据此精确更新任务进度，安装目录 latest.log 也最完整。适合日常使用与排查问题。',
        INFO: '仅保留启动、扫描文件、加载模型、处理进度（N/M）等关键步骤，不打印每句 [时间轴] 字幕行。任务列表进度将更多依赖时间估算，细粒度更新可能变慢，latest.log 更简洁。',
        WARNING: '仅输出警告与错误，正常转写过程几乎无日志，进行中难以判断当前阶段。仅建议在确认任务异常、需要减少日志量时临时使用。',
        ERROR: '仅在发生错误时输出，无法观察进行中的状态，latest.log 几乎为空。只适合只想捕获失败信息、不关心过程的场景。',
    };

    /**
     * @param {object} deps shell adapters
     */
    function createPostTaskUi(deps) {
        const d = deps || {};
        const state = d.state || {};
        const els = d.els || {};
        const electron = d.electron;
        const postTaskQcApi = d.postTaskQcApi || {};

        const getPostTaskAction = d.getPostTaskAction || (() => state.postTaskAction || 'none');
        const setPostTaskMenuOpen = d.setPostTaskMenuOpen || (() => {});
        const syncPostTaskMenuUi = d.syncPostTaskMenuUi || (() => {});
        const uiTf = d.uiTf || ((template, vars) => {
            return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
                vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                    ? String(vars[name])
                    : `{${name}}`
            ));
        });
        const logLevelHints = d.LOG_LEVEL_HINTS || LOG_LEVEL_HINTS;

        function getPostTaskOptionsFromUi() {
            if (postTaskQcApi.buildPostTaskOptionsFromAction) {
                return postTaskQcApi.buildPostTaskOptionsFromAction(getPostTaskAction(), {
                    shutdownDelaySec: Number(els.shutdownDelayInput?.value) || 60,
                    playSoundOnComplete: !!state.playSoundOnComplete,
                });
            }
            return { postTaskAction: 'none', shutdownDelaySec: 60, playSoundOnComplete: false };
        }

        function resolveOutputDirFromForm() {
            const mode = els.outputModeSelect?.value || 'same';
            if (mode !== 'custom') return '';
            return els.outputDirInput?.value.trim() || '';
        }

        function syncPostTaskExtrasUi() {
            const shutdown = getPostTaskAction() === 'shutdown';
            els.shutdownDelayWrap?.classList.toggle('hidden', !shutdown);
            if (els.shutdownDelayInput) els.shutdownDelayInput.disabled = !shutdown;
        }

        function updateQueueBadge() {
            const n = state.pendingQueue?.length || 0;
            if (!els.pendingQueueBadge) return;
            els.pendingQueueBadge.classList.toggle('hidden', n === 0);
            els.pendingQueueBadge.textContent = uiTf('队列 {n}', { n });
        }

        function resetPostTaskSelect() {
            state.postTaskAction = 'none';
            state.playSoundOnComplete = false;
            if (els.playSoundOnCompleteCheck) els.playSoundOnCompleteCheck.checked = false;
            setPostTaskMenuOpen(false);
            syncPostTaskMenuUi();
            syncPostTaskExtrasUi();
        }

        async function syncPostTaskToMain() {
            if (!electron?.transWithAiSetPostTask) return;
            try {
                await electron.transWithAiSetPostTask(getPostTaskOptionsFromUi());
            } catch { /* ignore */ }
        }

        function readSubFormatsFromForm() {
            const parts = [];
            if (els.subFormatSrt?.checked) parts.push('srt');
            if (els.subFormatVtt?.checked) parts.push('vtt');
            if (els.subFormatAss?.checked) parts.push('ass');
            if (els.subFormatLrc?.checked) parts.push('lrc');
            return parts.length ? parts.join(',') : 'srt';
        }

        function applySubFormatsToForm(value) {
            const set = new Set(String(value || 'srt').split(/[,;\s]+/).map((p) => p.trim().toLowerCase()));
            if (els.subFormatSrt) els.subFormatSrt.checked = set.has('srt');
            if (els.subFormatVtt) els.subFormatVtt.checked = set.has('vtt');
            if (els.subFormatAss) els.subFormatAss.checked = set.has('ass') || set.has('ass-dual');
            if (els.subFormatLrc) els.subFormatLrc.checked = set.has('lrc');
        }

        function syncLogLevelHint() {
            const level = String(els.logLevelSelect?.value || 'DEBUG').toUpperCase();
            if (els.logLevelHint) {
                els.logLevelHint.textContent = logLevelHints[level] || logLevelHints.DEBUG;
            }
        }

        function syncBatchSizeUi() {
            const show = els.deviceSelect?.value === 'cuda_batch';
            els.maxBatchSizeWrap?.classList.toggle('hidden', !show);
            if (els.maxBatchSizeInput) els.maxBatchSizeInput.disabled = !show;
        }

        return {
            LOG_LEVEL_HINTS: logLevelHints,
            getPostTaskOptionsFromUi,
            resolveOutputDirFromForm,
            syncPostTaskExtrasUi,
            updateQueueBadge,
            resetPostTaskSelect,
            syncPostTaskToMain,
            readSubFormatsFromForm,
            applySubFormatsToForm,
            syncLogLevelHint,
            syncBatchSizeUi,
        };
    }

    return { createPostTaskUi, LOG_LEVEL_HINTS };
}));
