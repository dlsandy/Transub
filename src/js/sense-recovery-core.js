/**
 * Actionable recovery tips when auto-sense fails.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSenseRecovery = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function senseRecoveryFactory() {
    const ACTIONS = Object.freeze([
        { id: 'deep-resense', label: '深度感知' },
        { id: 'disable-sense', label: '关闭智能感知' },
        { id: 'open-params-scene', label: '选识别场景' },
        { id: 'open-models', label: '指定 ASR 模型' },
    ]);

    /**
     * Pick a primary recovery action from the raw error message.
     * @param {string} message
     * @returns {string} action id
     */
    function inferPrimaryActionId(message) {
        const raw = String(message || '');
        if (/模型|未下载|未安装|未就绪|missing model|not found/i.test(raw)) {
            return 'open-models';
        }
        if (/超时|timeout|网络|ECONN|ENOTFOUND/i.test(raw)) {
            return 'deep-resense';
        }
        if (/引擎|engine|后端|spawn|启动失败/i.test(raw)) {
            return 'disable-sense';
        }
        return 'deep-resense';
    }

    /**
     * @param {{ message?: string, autoEnabled?: boolean }} [input]
     * @returns {{
     *   tip: string,
     *   shortTip: string,
     *   actions: Array<{ id: string, label: string }>,
     *   primaryAction: { id: string, label: string },
     *   logLine: string,
     * }}
     */
    function buildSenseFailureGuidance(input = {}) {
        const raw = String(input.message || '').trim() || '感知失败';
        const autoEnabled = input.autoEnabled !== false;
        const primaryId = inferPrimaryActionId(raw);
        const actions = ACTIONS
            .filter((a) => autoEnabled || a.id !== 'disable-sense')
            .map((a) => ({ ...a }));
        // Put primary first for UI chips
        actions.sort((a, b) => {
            if (a.id === primaryId) return -1;
            if (b.id === primaryId) return 1;
            return 0;
        });
        const primaryAction = actions.find((a) => a.id === primaryId) || actions[0];
        const shortTip = autoEnabled
            ? `可：${primaryAction.label} · 关感知用表单 · 参数选场景 / 指定模型`
            : `可：${primaryAction.label} · 参数选场景 / 指定模型`;
        const tip = `${raw}。下一步：${primaryAction.label}`;
        return {
            tip,
            shortTip,
            actions,
            primaryAction,
            logLine: `${raw} → ${primaryAction.label}`,
        };
    }

    /**
     * Enrich describeAutoSenseUi-style chip when failures exist.
     * @param {object} baseUi from describeAutoSenseUi
     * @param {{ errorCount?: number, autoEnabled?: boolean }} [opts]
     */
    function enrichAutoSenseUiForErrors(baseUi = {}, opts = {}) {
        const errorCount = Number(opts.errorCount) || 0;
        if (errorCount <= 0) return baseUi;
        const guide = buildSenseFailureGuidance({
            message: `${errorCount} 项感知失败`,
            autoEnabled: opts.autoEnabled !== false,
        });
        return {
            ...baseUi,
            tone: 'warn',
            chipLabel: `感知失败 ${errorCount}`,
            detail: guide.shortTip,
            title: `${guide.tip}（${guide.shortTip}）`,
            senseErrorCount: errorCount,
            senseRecovery: guide,
        };
    }

    return {
        ACTIONS,
        inferPrimaryActionId,
        buildSenseFailureGuidance,
        enrichAutoSenseUiForErrors,
    };
}));
