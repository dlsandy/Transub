/**
 * Main-window batch job progress log lines (dedupe + stage transitions).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJobProgressLog = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jobProgressLogFactory(global) {
    function uiTf(template, vars) {
        try {
            if (typeof global !== 'undefined' && typeof global.TransubUiTf === 'function') {
                return global.TransubUiTf(template, vars);
            }
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tf === 'function') {
                return global.TransubI18n.tf(template, vars);
            }
        } catch { /* ignore */ }
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        try {
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tx === 'function') {
                return global.TransubI18n.tx(text);
            }
        } catch { /* ignore */ }
        return String(text || '');
    }

    /** Major user-facing stages only; sub-steps stay on the progress bar / 引擎日志. */
    const LOGGABLE_STAGES = new Set([
        'starting',
        'denoise',
        'separate',
        'model',
        'transcribe',
        'semantic_repair',
        'source_cleanup',
        'pre_mt_qc',
        'translate',
        'save',
        'cleanup',
        'qc_fix',
        'qc_loop',
        'postprocess',
    ]);

    /** After these, synthetic save@收尾 holds must not re-enter the app log. */
    const POST_TASK_LOG_STAGES = new Set([
        'cleanup',
        'qc_fix',
        'qc_loop',
        'postprocess',
    ]);

    const HEARTBEAT_DETAIL_PATTERNS = [
        /原文提取|提取原文|转写中|转写重试|分片转写|Transcribing/i,
        /转写\s+\d+\s*[/／]\s*\d+/i,
        /翻译\s+\d+\s*[/／]\s*\d+/i,
        /TEN\s+\d+[–-]\d+/i,
        /首次加载/i,
    ];

    function createTrackers() {
        return {
            lastStartKeyByPath: new Map(),
            lastStageByPath: new Map(),
            lastLogKeyByPath: new Map(),
        };
    }

    function clearTrackers(trackers) {
        if (!trackers) return;
        trackers.lastStartKeyByPath?.clear();
        trackers.lastStageByPath?.clear();
        trackers.lastLogKeyByPath?.clear();
    }

    function normalizePathKey(path) {
        return String(path || '').replace(/\//g, '\\').toLowerCase();
    }

    function buildStageLogKey(stage, dualPhase, detail) {
        const normalizedDetail = String(detail || '')
            .replace(/\d+:\d{2}/g, 't')
            .replace(/\d+\s*[/／]\s*\d+/g, 'n/m')
            .replace(/\d+/g, '#')
            .trim();
        return `${stage}|${dualPhase || ''}|${normalizedDetail}`;
    }

    function isHeartbeatDetail(stage, detail) {
        const s = String(stage || '').toLowerCase();
        if (s !== 'transcribe' && s !== 'translate') return false;
        const d = String(detail || '');
        return HEARTBEAT_DETAIL_PATTERNS.some((re) => re.test(d));
    }

    /**
     * One app-log line per stage (per file). Detail-only updates within the
     * same stage stay on the progress bar / 引擎日志, not the 应用日志.
     * @param {ReturnType<typeof createTrackers>} trackers
     * @param {{ fullPath?: string, itemStage?: string, itemDualPhase?: string, itemDetail?: string, detail?: string }} payload
     */
    function shouldLogStageTransition(trackers, payload = {}) {
        const stage = String(payload.itemStage || '').trim();
        if (!stage || !LOGGABLE_STAGES.has(stage)) return false;

        const pathKey = normalizePathKey(payload.fullPath);
        if (!pathKey) return false;

        const dualPhase = String(payload.itemDualPhase || '');
        const lastStage = trackers.lastStageByPath.get(pathKey) || '';

        if (stage === 'starting') {
            const startKey = `${dualPhase}|starting`;
            if (trackers.lastStartKeyByPath.get(pathKey) === startKey) return false;
            return true;
        }

        if (stage === lastStage) return false;

        // Engine/sanitize may bounce qc_loop@99 → save@收尾; never spam the app log.
        if (stage === 'save' && POST_TASK_LOG_STAGES.has(lastStage)) return false;
        if (POST_TASK_LOG_STAGES.has(stage) && lastStage === 'save') {
            const prevKey = String(trackers.lastLogKeyByPath.get(pathKey) || '');
            if (prevKey.startsWith(`${stage}|`)) return false;
        }

        return true;
    }

    /**
     * @param {ReturnType<typeof createTrackers>} trackers
     * @param {{ fullPath?: string, itemStage?: string, itemDualPhase?: string, itemDetail?: string, detail?: string }} payload
     */
    function recordStageLog(trackers, payload = {}) {
        const pathKey = normalizePathKey(payload.fullPath);
        if (!pathKey) return;

        const stage = String(payload.itemStage || '').trim();
        const dualPhase = String(payload.itemDualPhase || '');
        const detail = String(payload.itemDetail || payload.detail || '').trim();

        if (stage === 'starting') {
            trackers.lastStartKeyByPath.set(pathKey, `${dualPhase}|starting`);
        }
        if (stage) trackers.lastStageByPath.set(pathKey, stage);

        const key = buildStageLogKey(stage, dualPhase, detail);
        trackers.lastLogKeyByPath.set(pathKey, key);
    }

    function formatJobStartLine(total, taskLabel) {
        const n = Math.max(0, Number(total) || 0);
        const task = String(taskLabel || '').trim();
        if (task) return uiTf('开始任务（{task}），共 {count} 个文件', { task, count: n });
        return uiTf('开始任务，共 {count} 个文件', { count: n });
    }

    function formatStageHead(stage, stageLabelText, dualPhase) {
        if (stage === 'starting') {
            if (dualPhase === 'translate') return uiTx('开始翻译');
            return uiTx('开始处理');
        }
        if (stage === 'save') {
            if (dualPhase === 'translate' || dualPhase === 'target') return uiTx('保存译文字幕');
            if (dualPhase === 'transcribe' || dualPhase === 'source') return uiTx('保存原文字幕');
            if (stageLabelText && /原文|译文/.test(stageLabelText)) return stageLabelText;
            return uiTx('保存字幕');
        }
        return stageLabelText;
    }

    /**
     * @param {{ fileName?: string, index?: number, total?: number, itemStage?: string, itemDualPhase?: string, itemDetail?: string, detail?: string }} payload
     * @param {{ stageLabelFn?: (stage: string) => string, scrubDetailFn?: (detail: string) => string }} ctx
     */
    function formatStageLogLine(payload = {}, ctx = {}) {
        const stage = String(payload.itemStage || '').trim();
        const fileName = String(payload.fileName || '').trim();
        const index = Number(payload.index) || 0;
        const total = Number(payload.total) || 0;
        const dualPhase = String(payload.itemDualPhase || '');
        const rawDetail = String(payload.itemDetail || payload.detail || '').trim();
        const scrub = typeof ctx.scrubDetailFn === 'function'
            ? ctx.scrubDetailFn
            : (d) => String(d || '').trim();
        const stageLabelFn = typeof ctx.stageLabelFn === 'function'
            ? ctx.stageLabelFn
            : (s) => s;
        const stageLabelText = stageLabelFn(stage);
        const head = formatStageHead(stage, stageLabelText, dualPhase);
        const detail = scrub(rawDetail);

        const prefix = index > 0 && total > 0 ? `#${index}/${total} ` : '';
        let line = `${prefix}${head}：${fileName || '—'}`;
        // Skip progress heartbeats on the single stage line (e.g. 转写 12/120).
        if (detail && !isHeartbeatDetail(stage, detail)
            && detail !== head && detail !== stageLabelText
            && !detail.startsWith(`${head} ·`) && !detail.startsWith(`${stageLabelText} ·`)) {
            line += ` · ${detail}`;
        }
        return line;
    }

    return {
        LOGGABLE_STAGES,
        createTrackers,
        clearTrackers,
        normalizePathKey,
        buildStageLogKey,
        isHeartbeatDetail,
        shouldLogStageTransition,
        recordStageLog,
        formatJobStartLine,
        formatStageLogLine,
    };
}));
