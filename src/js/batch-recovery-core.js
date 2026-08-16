/**
 * Actionable recovery tips when engine batch / ASR items fail.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBatchRecovery = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function batchRecoveryFactory() {
    const ACTIONS = Object.freeze([
        { id: 'retry-item', label: '重试本条' },
        { id: 'resume-from-asr', label: '从断点继续' },
        { id: 'open-engine-log', label: '打开引擎日志' },
        { id: 'switch-device-cpu', label: '改用 CPU' },
        { id: 'open-models', label: '更换 ASR 模型' },
        { id: 'export-diagnostics', label: '导出诊断包' },
    ]);

    /**
     * @param {{ code?: string, message?: string, resumable?: boolean }} input
     * @returns {string} action id
     */
    function inferPrimaryActionId(input = {}) {
        const code = String(input.code || '').toLowerCase();
        const raw = String(input.message || '');
        if (input.resumable || code === 'asr_done' || /断点|resume/i.test(raw)) {
            return 'resume-from-asr';
        }
        if (code === 'idle_timeout' || /长时间无响应|idle/i.test(raw)) {
            return 'retry-item';
        }
        if (code === 'network' || /引擎连接|fetch failed|连接被重置|连接被拒绝/i.test(raw)) {
            return 'retry-item';
        }
        if (/模型|未下载|未安装|未就绪|missing model|not found|ASR_EMPTY/i.test(raw) || code === 'asr_empty') {
            return 'open-models';
        }
        if (/cuda|gpu|显存|oom|out of memory/i.test(raw)) {
            return 'switch-device-cpu';
        }
        if (/引擎|engine|spawn|启动失败/i.test(raw)) {
            return 'open-engine-log';
        }
        return 'retry-item';
    }

    /**
     * @param {{
     *   message?: string,
     *   code?: string,
     *   resumable?: boolean,
     *   resumeFromJobId?: string,
     *   asrCandidates?: string[],
     *   asrAttempts?: number,
     *   primaryAsr?: string,
     *   asrModel?: string,
     * }} [input]
     */
    function buildBatchFailureGuidance(input = {}) {
        const raw = String(input.message || '').trim() || '任务失败';
        const code = String(input.code || '').trim();
        const resumable = !!input.resumable && !!String(input.resumeFromJobId || '').trim();
        const trailApi = (typeof globalThis !== 'undefined' && globalThis.TransubComputeBusyUi)
            || (typeof module !== 'undefined' ? (() => { try { return require('./compute-busy-ui-core'); } catch { return null; } })() : null);
        const trail = trailApi?.formatAsrFailoverTrail
            ? trailApi.formatAsrFailoverTrail(input.asrCandidates, input.asrAttempts)
            : '';
        const primaryId = inferPrimaryActionId({
            code,
            message: raw,
            resumable,
        });
        let actions = ACTIONS.map((a) => {
            const row = { ...a };
            if (a.id === 'switch-device-cpu') {
                row.label = '改用 CPU 并重试';
            }
            if (a.id === 'open-models' && trail) {
                row.label = '另选 ASR 模型';
                row.title = `已试 ${trail}`;
            }
            return row;
        });
        if (!resumable) {
            actions = actions.filter((a) => a.id !== 'resume-from-asr');
        }
        actions.sort((a, b) => {
            if (a.id === primaryId) return -1;
            if (b.id === primaryId) return 1;
            return 0;
        });
        const primaryAction = actions.find((a) => a.id === primaryId) || actions[0];
        const shortTip = trail
            ? (resumable
                ? `已试 ${trail} · 可：${primaryAction.label}`
                : `已试 ${trail} · 可：${primaryAction.label}`)
            : (resumable
                ? `可：${primaryAction.label} · 重试 · 打开日志 · 导出诊断`
                : `可：${primaryAction.label} · 打开日志 · 换模型 / CPU · 导出诊断`);
        const tip = code
            ? `${raw}（${code}）。${trail ? `已试 ${trail}。` : ''}下一步：${primaryAction.label}`
            : `${raw}。${trail ? `已试 ${trail}。` : ''}下一步：${primaryAction.label}`;
        return {
            tip,
            shortTip,
            actions,
            primaryAction,
            logLine: `${raw}${code ? ` [${code}]` : ''}${trail ? ` · 已试 ${trail}` : ''} → ${primaryAction.label}`,
            resumable,
            resumeFromJobId: resumable ? String(input.resumeFromJobId) : '',
            code,
            asrTrail: trail,
            asrCandidates: Array.isArray(input.asrCandidates) ? input.asrCandidates.slice() : [],
            asrAttempts: Math.max(0, Math.floor(Number(input.asrAttempts) || 0)),
        };
    }

    /**
     * Compact action chips for a failed / resumable task row.
     * @param {{ actions?: Array<{id:string,label:string}> }|null} recovery
     * @param {number} idx
     * @param {(s: string) => string} esc
     * @param {{ max?: number, running?: boolean }} [opts]
     */
    function buildBatchRecoveryChipsHtml(recovery, idx, esc, opts = {}) {
        if (opts.running) return '';
        const actions = Array.isArray(recovery?.actions) ? recovery.actions : [];
        if (!actions.length) return '';
        const escape = typeof esc === 'function' ? esc : ((s) => String(s ?? ''));
        const max = Math.max(1, Math.min(6, Number(opts.max) || 4));
        const chips = actions.slice(0, max).map((a) => {
            const id = String(a?.id || '').trim();
            const label = String(a?.label || id).trim();
            if (!id || !label) return '';
            const title = String(a?.title || label).trim();
            return `<button type="button" class="file-batch-recover-btn" data-batch-recover="${escape(id)}" data-batch-recover-idx="${idx}" title="${escape(title)}">${escape(label)}</button>`;
        }).filter(Boolean).join('');
        if (!chips) return '';
        return `<span class="file-batch-recover" role="group" aria-label="失败可执行下一步">${chips}</span>`;
    }

    return {
        ACTIONS,
        inferPrimaryActionId,
        buildBatchFailureGuidance,
        buildBatchRecoveryChipsHtml,
    };
}));