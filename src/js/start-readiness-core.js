/**
 * Main-window start-button block reason + readiness strip view-model (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubStartReadiness = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function startReadinessFactory() {
    /**
     * @param {{
     *   running?: boolean,
     *   postBatchBusy?: boolean,
     *   retranslateBusy?: boolean,
     *   batchStartInFlight?: boolean,
     *   computeBusy?: boolean,
     *   computeBusyLabel?: string,
     *   items?: object[],
     *   autoSenseEnabled?: boolean,
     * }} state
     */
    function computeStartBlockReason(state = {}) {
        if (state.running || state.postBatchBusy || state.retranslateBusy || state.batchStartInFlight) {
            return '任务或后处理进行中';
        }
        if (state.computeBusy) {
            return state.computeBusyLabel
                ? `已有${state.computeBusyLabel}正在运行`
                : '其它窗口有引擎或 LLM 任务正在运行';
        }
        const items = Array.isArray(state.items) ? state.items : [];
        const selectable = items.filter((i) => i.selected && i.status !== 'error');
        if (!selectable.length) {
            if (!items.length) return '请先添加媒体文件';
            if (!items.some((i) => i.selected)) return '请勾选要处理的条目';
            return '所选条目不可用（含错误项）';
        }
        const probing = items.some((i) => i.selected && (i.status === 'probing' || i.status === 'pending'));
        if (probing) return '正在探测视频信息…';
        return '';
    }

    /**
     * When main window is idle but compute lock is held, Start is blocked with no feedback.
     * Safe to force-release in that case (range/editor crash leftovers).
     */
    function shouldForceReleaseStaleComputeLock(state = {}) {
        if (!state.computeBusy) return false;
        if (state.running || state.postBatchBusy || state.retranslateBusy) return false;
        return true;
    }

    /**
     * Renderer job flags can stick after a missed job-finished IPC while the engine
     * is already idle. Safe to clear when main reports no batch and no compute lock.
     */
    function shouldClearStuckSubtitleTaskFlags(state = {}) {
        if (!state.running && !state.retranslateBusy && !state.postBatchBusy) return false;
        if (state.computeBusy || state.batchRunning) return false;
        return true;
    }

    /**
     * @returns {{
     *   parts: string[],
     *   text: string,
     *   tone: 'ok'|'warn',
     *   action?: { label: string, action: string }|null,
     * }}
     */
    function buildReadinessStripViewModel(input = {}) {
        const backend = String(input.backend || 'transub');
        const task = String(input.task || 'transcribe');
        const taskLabel = String(input.taskLabel || task);
        const mode = String(input.mode || 'engine');
        const modeLabel = String(input.modeLabel || mode);
        const asr = String(input.asrLabel || '默认 ASR');
        const engineOk = !!input.engineOk;
        const advancedEntitled = !!input.advancedEntitled;
        const parts = [
            backend === 'twai' ? 'TWAI' : 'Engine',
            engineOk ? '就绪' : '未配置',
            `${taskLabel} · ${modeLabel}`,
            `ASR ${asr}`,
        ];
        if (task !== 'transcribe') {
            if (mode === 'engine') {
                const opus = String(input.opusMtId || '');
                parts.push(opus ? `MT ${opus}` : 'MT 智能');
            } else if (mode === 'llm' || mode === 'sakura') {
                if (input.sentenceMtByok && input.sentenceMtByokLabel) {
                    parts.push(String(input.sentenceMtByokLabel));
                } else {
                    const llm = String(input.llmMtId || '');
                    if (llm) parts.push(`推理 ${llm}`);
                    else {
                        const prefer = String(input.llmPreferId || '');
                        parts.push(prefer ? `推理 智能→${prefer}` : '推理 智能→…');
                    }
                }
            } else if (mode === 'smart' || mode === 'dialog') {
                const smartPart = String(input.smartStripPart || '').trim();
                if (!advancedEntitled) parts.push('需解锁 Pro');
                else if (smartPart) parts.push(smartPart);
                else parts.push(mode === 'dialog' ? '智能译' : '混合译');
            }
        }

        if (!engineOk) {
            return {
                parts,
                text: parts.join(' · '),
                tone: 'warn',
                action: { label: '去配置环境', action: 'install' },
            };
        }
        if ((mode === 'smart' || mode === 'dialog') && !advancedEntitled) {
            return {
                parts,
                text: parts.join(' · '),
                tone: 'warn',
                action: { label: '解锁 Pro', action: 'pro' },
            };
        }
        if ((mode === 'smart' || mode === 'dialog') && advancedEntitled && input.smartTone === 'warn') {
            return {
                parts,
                text: parts.join(' · '),
                tone: 'warn',
                action: input.smartAction && typeof input.smartAction === 'object'
                    ? input.smartAction
                    : null,
            };
        }
        return {
            parts,
            text: parts.join(' · '),
            tone: 'ok',
            action: null,
        };
    }

    function shortParamsModeLabel(text, maxLen = 10) {
        const raw = String(text || '').replace(/（内置）|（可选）/g, '').trim();
        if (!raw) return '自定义';
        if (raw.length <= maxLen) return raw;
        return `${raw.slice(0, maxLen - 1)}…`;
    }

    /**
     * @returns {{ label: string, title: string, tone: string, autoEnabled: boolean, presetId: string }}
     */
    function buildParamsModeChipViewModel(input = {}) {
        const autoEnabled = false;
        const presetId = String(input.presetId || '');
        const presetName = String(input.presetName || '');
        const mtUseForm = !!input.mtUseForm;
        const translateTask = !!input.translateTask;
        const presetDesc = String(input.presetDesc || '').trim();

        let label = '设置';
        let title = '按设置里的识别参数';
        let tone = 'off';

        if (presetId && presetName) {
            tone = 'off';
            label = shortParamsModeLabel(presetName, 12);
            title = presetDesc
                ? `按「${presetName}」识别：${presetDesc}`
                : `按「${presetName}」识别`;
        } else if (presetId) {
            tone = 'off';
            label = shortParamsModeLabel(presetId, 12);
            title = `按预设「${presetId}」识别`;
        } else {
            const asrLabel = String(input.asrModelLabel || input.asrModelId || '').trim();
            if (asrLabel) {
                tone = 'off';
                label = shortParamsModeLabel(asrLabel, 12);
                title = `手动 ASR：${asrLabel}`;
            } else {
                tone = 'off';
                label = '设置';
                title = '按设置里的识别参数';
            }
        }

        return {
            label,
            title,
            tone,
            autoEnabled,
            presetId,
        };
    }

    return {
        computeStartBlockReason,
        shouldForceReleaseStaleComputeLock,
        shouldClearStuckSubtitleTaskFlags,
        buildReadinessStripViewModel,
        shortParamsModeLabel,
        buildParamsModeChipViewModel,
    };
}));
