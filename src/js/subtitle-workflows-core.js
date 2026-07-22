/**
 * 字幕编辑器工作流（多套可命名批处理配方）
 * 浏览器与 Node 测试共用
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleWorkflows = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleWorkflowsCoreFactory() {
    const WORKFLOWS_VERSION = 1;
    const FAIL_POLICIES = new Set(['pause', 'skip', 'abort']);
    const SCOPES = new Set(['all', 'selected', 'filtered', 'lowConfidence']);

    /** @type {Record<string, { id: string, label: string, group: string, preferConfirm?: boolean, defaultParams?: object }>} */
    const STEP_CATALOG = {
        'qc.scan': { id: 'qc.scan', label: '质量检查扫描', group: '质检', defaultParams: {} },
        'qc.fix': {
            id: 'qc.fix',
            label: '质量检查一键修复',
            group: '质检',
            preferConfirm: false,
            defaultParams: {
                fixOverlap: true,
                fixCpsBySplit: true,
                fixCpsByExtend: true,
                enforceMinDur: true,
                enforceMaxDur: true,
                compressRepetition: false,
                maxCps: 18,
                minSec: 0.5,
                maxSec: 10,
                gapMs: 1,
            },
        },
        'timing.shift': {
            id: 'timing.shift',
            label: '时间轴偏移',
            group: '时间轴',
            defaultParams: { deltaMs: -500, scope: 'all' },
        },
        'timing.batchDuration': {
            id: 'timing.batchDuration',
            label: '批量时长调整',
            group: '时间轴',
            defaultParams: {
                mode: 'fixed',
                condition: 'all',
                targetSec: 2,
                avoidOverlap: true,
                silenceDb: -35,
                silenceDur: 0.25,
                snapPadMs: 50,
            },
        },
        'timing.smartAdjust': {
            id: 'timing.smartAdjust',
            label: '智能调整',
            group: '时间轴',
            defaultParams: {
                fixOverlap: true,
                fixCps: true,
                enforceMinDur: true,
                enforceMaxDur: true,
                maxCps: 18,
                minSec: 0.5,
                maxSec: 10,
                gapMs: 1,
            },
        },
        'timing.smartSplit': {
            id: 'timing.smartSplit',
            label: '智能分割（批量）',
            group: '时间轴',
            defaultParams: {
                condition: 'all',
                smartMaxChars: 20,
                smartLineChars: 18,
                useCps: true,
                fixOverlap: true,
                cpsAbove: 18,
                durLongSec: 3,
                charsLong: 16,
            },
        },
        'timing.silenceSplit': {
            id: 'timing.silenceSplit',
            label: '静音分割（批量）',
            group: '时间轴',
            preferConfirm: true,
            defaultParams: {
                condition: 'all',
                silenceDb: -35,
                silenceDur: 0.25,
                durLongSec: 3,
                cpsAbove: 18,
                charsLong: 16,
                fixOverlap: true,
            },
        },
        'text.chineseConvert': {
            id: 'text.chineseConvert',
            label: '简繁转换',
            group: '文本',
            defaultParams: { direction: 't2s', scope: 'all', protectTerms: true },
        },
        'text.compressRep': {
            id: 'text.compressRep',
            label: '压缩叠词',
            group: '文本',
            defaultParams: { scope: 'all', compressSingleChar: true, addExclaim: true, minRepeats: 2 },
        },
        'text.removeNoise': {
            id: 'text.removeNoise',
            label: '删除杂音',
            group: '文本',
            preferConfirm: true,
            defaultParams: {
                removeEmpty: true,
                removeFragments: true,
                removeSoundEffects: true,
                removeSymbolOnly: true,
                removeDuplicates: false,
                removeHallucinations: false,
            },
        },
        'text.findReplace': {
            id: 'text.findReplace',
            label: '查找替换',
            group: '文本',
            defaultParams: { find: '', replace: '', caseSensitive: false },
        },
        'text.glossaryUnify': {
            id: 'text.glossaryUnify',
            label: '术语统一',
            group: '文本',
            defaultParams: {},
        },
        'text.glossaryScan': {
            id: 'text.glossaryScan',
            label: '术语扫描',
            group: '文本',
            defaultParams: {},
        },
        'presets.insertGroup': {
            id: 'presets.insertGroup',
            label: '插入预设组',
            group: '预设',
            defaultParams: { groupId: '', groupName: '' },
        },
        'dual.exportMerged': {
            id: 'dual.exportMerged',
            label: '导出合并双语',
            group: '交付',
            preferConfirm: false,
            defaultParams: {},
        },
        'file.save': { id: 'file.save', label: '保存字幕', group: '交付', defaultParams: {} },
        'file.saveDraft': { id: 'file.saveDraft', label: '保存草稿', group: '交付', defaultParams: {} },
        'ai.retranscribeDuration': {
            id: 'ai.retranscribeDuration',
            label: '按时长重转写',
            group: 'AI',
            preferConfirm: true,
            defaultParams: {
                durationSec: 10,
                padMs: 350,
                snapAfter: true,
                startMode: 'selected',
            },
        },
        'ai.retranscribeLowConfidence': {
            id: 'ai.retranscribeLowConfidence',
            label: '低置信批量重转',
            group: 'AI',
            preferConfirm: true,
            defaultParams: { scope: 'lowConfidence', padMs: 350, snapAfter: true, maxCues: 50 },
        },
        'ai.retranslateScope': {
            id: 'ai.retranslateScope',
            label: '批量重译',
            group: 'AI',
            preferConfirm: true,
            defaultParams: { scope: 'selected', maxCues: 30 },
        },
        'ai.retranscribeDualScope': {
            id: 'ai.retranscribeDualScope',
            label: '双语重跑',
            group: 'AI',
            preferConfirm: true,
            defaultParams: { scope: 'selected', maxCues: 30 },
        },
        'history.restoreInitial': {
            id: 'history.restoreInitial',
            label: '复原到初始',
            group: '历史',
            preferConfirm: true,
            defaultParams: {},
        },
        'cue.smartSplit': {
            id: 'cue.smartSplit',
            label: '条目智能断句',
            group: '条目',
            defaultParams: { scope: 'all', smartMaxChars: 20, smartLineChars: 18, useCps: true },
        },
        'cue.splitLines': {
            id: 'cue.splitLines',
            label: '按换行分割条目',
            group: '条目',
            defaultParams: { scope: 'all' },
        },
        'cue.splitSpaces': {
            id: 'cue.splitSpaces',
            label: '按空格分割条目',
            group: '条目',
            defaultParams: { scope: 'all' },
        },
        'cue.silenceSplit': {
            id: 'cue.silenceSplit',
            label: '条目静音分割',
            group: '条目',
            preferConfirm: true,
            defaultParams: { scope: 'filtered', silenceDb: -35, silenceDur: 0.25 },
        },
        'cue.compressRep': {
            id: 'cue.compressRep',
            label: '条目叠词压缩',
            group: '条目',
            defaultParams: { scope: 'all', compressSingleChar: true, addExclaim: true, minRepeats: 2 },
        },
        'cue.charDuration': {
            id: 'cue.charDuration',
            label: '按 CPS 调条目时长',
            group: '条目',
            defaultParams: { scope: 'all' },
        },
        'cue.smartDuration': {
            id: 'cue.smartDuration',
            label: '静音贴边调时长',
            group: '条目',
            preferConfirm: true,
            defaultParams: { scope: 'selected', silenceDb: -35, silenceDur: 0.25 },
        },
        'cue.audioSnap': {
            id: 'cue.audioSnap',
            label: '音频贴边',
            group: '条目',
            preferConfirm: true,
            defaultParams: { scope: 'selected', silenceDb: -35, silenceDur: 0.25, snapPadMs: 50 },
        },
        'cue.mergeSelected': {
            id: 'cue.mergeSelected',
            label: '合并选中条目',
            group: '条目',
            defaultParams: {},
        },
        'ui.openGlossary': { id: 'ui.openGlossary', label: '打开术语表（人工）', group: '人工', defaultParams: { message: '请检查术语表后继续' } },
        'ui.openBreakWords': { id: 'ui.openBreakWords', label: '打开断句词（人工）', group: '人工', defaultParams: { message: '请检查断句词后继续' } },
        'ui.openTextPresets': { id: 'ui.openTextPresets', label: '打开预设组（人工）', group: '人工', defaultParams: { message: '请检查预设组后继续' } },
        'ui.openFindReplace': { id: 'ui.openFindReplace', label: '打开查找替换（人工）', group: '人工', defaultParams: { message: '请完成查找替换后继续' } },
        'ui.openQc': { id: 'ui.openQc', label: '打开质量检查（人工）', group: '人工', defaultParams: { message: '请过目质量问题后继续' } },
        'ui.pause': { id: 'ui.pause', label: '暂停确认', group: '人工', defaultParams: { message: '请确认后继续' } },
    };

    function makeId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function makeWorkflowId() {
        return makeId('wf');
    }

    function makeStepId() {
        return makeId('ws');
    }

    function listStepCatalog() {
        return Object.values(STEP_CATALOG).map((s) => ({ ...s, defaultParams: { ...(s.defaultParams || {}) } }));
    }

    function getStepMeta(type) {
        return STEP_CATALOG[type] || null;
    }

    function normalizeFailPolicy(raw, fallback = 'pause') {
        const v = String(raw || fallback).trim();
        return FAIL_POLICIES.has(v) ? v : fallback;
    }

    function normalizeScope(raw, fallback = 'all') {
        const v = String(raw || fallback).trim();
        return SCOPES.has(v) ? v : fallback;
    }

    function normalizeStep(raw = {}) {
        const type = String(raw.type || '').trim();
        const meta = getStepMeta(type);
        const baseParams = meta ? { ...(meta.defaultParams || {}) } : {};
        const params = { ...baseParams, ...(raw.params && typeof raw.params === 'object' ? raw.params : {}) };
        if (params.scope != null) params.scope = normalizeScope(params.scope, baseParams.scope || 'all');
        const preferConfirm = meta?.preferConfirm === true;
        return {
            id: String(raw.id || makeStepId()),
            type,
            enabled: raw.enabled !== false,
            requireConfirm: raw.requireConfirm == null ? preferConfirm : !!raw.requireConfirm,
            onFail: raw.onFail == null || raw.onFail === ''
                ? null
                : normalizeFailPolicy(raw.onFail, 'pause'),
            params,
            label: String(raw.label || meta?.label || type || '未命名步骤').trim(),
        };
    }

    function normalizeWorkflow(raw = {}) {
        const steps = Array.isArray(raw.steps)
            ? raw.steps.map(normalizeStep).filter((s) => s.type && getStepMeta(s.type))
            : [];
        return {
            id: String(raw.id || makeWorkflowId()),
            name: String(raw.name || '').trim(),
            note: String(raw.note || '').trim(),
            builtin: !!raw.builtin,
            onFail: normalizeFailPolicy(raw.onFail, 'pause'),
            steps,
        };
    }

    function normalizeWorkflowsDoc(doc = {}) {
        const workflows = Array.isArray(doc.workflows)
            ? doc.workflows.map(normalizeWorkflow).filter((w) => w.name)
            : [];
        return {
            version: WORKFLOWS_VERSION,
            updatedAt: doc.updatedAt || null,
            activeId: doc.activeId ? String(doc.activeId) : (workflows[0]?.id || null),
            workflows,
        };
    }

    function emptyWorkflowsDoc() {
        return { version: WORKFLOWS_VERSION, updatedAt: null, activeId: null, workflows: [] };
    }

    function step(type, overrides = {}) {
        const meta = getStepMeta(type);
        if (!meta) throw new Error(`Unknown step type: ${type}`);
        return normalizeStep({
            type,
            enabled: overrides.enabled !== false,
            requireConfirm: overrides.requireConfirm,
            onFail: overrides.onFail,
            params: { ...(meta.defaultParams || {}), ...(overrides.params || {}) },
            label: overrides.label || meta.label,
            id: overrides.id,
        });
    }

    function builtinWorkflows() {
        return [
            normalizeWorkflow({
                id: 'builtin_timeline',
                name: '时间轴优先',
                note: '先理顺时间轴：扫描 → 智能调整 → 再扫描（可选人工过目 QC）',
                builtin: true,
                steps: [
                    step('qc.scan'),
                    step('timing.smartAdjust'),
                    step('qc.scan', { label: '质量检查（复查）' }),
                    step('ui.openQc', { enabled: false }),
                ],
            }),
            normalizeWorkflow({
                id: 'builtin_dual_delivery',
                name: '双语交付',
                note: '质检 → 调轴 → 术语 → 合并导出 → 存盘',
                builtin: true,
                steps: [
                    step('qc.scan'),
                    step('timing.smartAdjust'),
                    step('text.glossaryUnify'),
                    step('dual.exportMerged'),
                    step('file.save'),
                ],
            }),
        ];
    }

    function ensureBuiltinWorkflows(doc) {
        const next = normalizeWorkflowsDoc(doc);
        const builtins = builtinWorkflows();
        const byId = new Map(next.workflows.map((w) => [w.id, w]));
        for (const b of builtins) {
            const existing = byId.get(b.id);
            if (!existing) {
                next.workflows.unshift(b);
            } else if (existing.builtin) {
                // Keep user-disabled flags on steps if same ids; otherwise refresh builtin definition
                byId.set(b.id, { ...b, id: existing.id });
            }
        }
        // Re-apply map order: builtins first (catalog order), then custom
        const builtinIds = new Set(builtins.map((b) => b.id));
        const refreshedBuiltins = builtins.map((b) => byId.get(b.id) || b);
        const customs = next.workflows.filter((w) => !builtinIds.has(w.id) && !w.builtin);
        next.workflows = [...refreshedBuiltins, ...customs];
        if (!next.activeId || !next.workflows.some((w) => w.id === next.activeId)) {
            next.activeId = next.workflows[0]?.id || null;
        }
        return next;
    }

    function findWorkflow(doc, id) {
        const want = String(id || '');
        return normalizeWorkflowsDoc(doc).workflows.find((w) => w.id === want) || null;
    }

    function upsertWorkflow(doc, raw) {
        const normalized = normalizeWorkflow({ ...raw, builtin: false });
        if (!normalized.name) return { ok: false, error: '工作流名称不能为空' };
        if (!normalized.steps.length) return { ok: false, error: '至少需要一个有效步骤' };
        const next = ensureBuiltinWorkflows(doc);
        const existing = next.workflows.find((w) => w.id === normalized.id);
        if (existing?.builtin) {
            return { ok: false, error: '内置工作流不可直接覆盖，请先复制' };
        }
        const idx = next.workflows.findIndex((w) => w.id === normalized.id && !w.builtin);
        if (idx >= 0) next.workflows[idx] = normalized;
        else next.workflows.push(normalized);
        next.activeId = normalized.id;
        next.updatedAt = new Date().toISOString();
        return { ok: true, doc: next, workflow: normalized };
    }

    function removeWorkflow(doc, id) {
        const next = ensureBuiltinWorkflows(doc);
        const want = String(id || '');
        const target = next.workflows.find((w) => w.id === want);
        if (!target) return next;
        if (target.builtin) return next;
        next.workflows = next.workflows.filter((w) => w.id !== want);
        if (next.activeId === want) next.activeId = next.workflows[0]?.id || null;
        next.updatedAt = new Date().toISOString();
        return next;
    }

    function duplicateWorkflow(doc, id, nameSuffix = '（副本）') {
        const src = findWorkflow(doc, id);
        if (!src) return { ok: false, error: '未找到工作流' };
        const copy = normalizeWorkflow({
            ...src,
            id: makeWorkflowId(),
            name: `${src.name}${nameSuffix}`,
            builtin: false,
            steps: src.steps.map((s) => ({
                ...s,
                id: makeStepId(),
                params: { ...(s.params || {}) },
            })),
        });
        return upsertWorkflow(doc, copy);
    }

    function reorderSteps(workflow, fromIndex, toIndex) {
        const w = normalizeWorkflow(workflow);
        const from = Number(fromIndex);
        const to = Number(toIndex);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return w;
        if (from < 0 || to < 0 || from >= w.steps.length || to >= w.steps.length) return w;
        const [item] = w.steps.splice(from, 1);
        w.steps.splice(to, 0, item);
        return w;
    }

    function setStepEnabled(workflow, stepId, enabled) {
        const w = normalizeWorkflow(workflow);
        const s = w.steps.find((x) => x.id === String(stepId || ''));
        if (s) s.enabled = !!enabled;
        return w;
    }

    /**
     * Pure runner: invokes async handlers[type](ctx, step, helpers).
     * Handler returns { status: 'done'|'skipped'|'failed'|'cancelled', summary?: string, changed?: boolean }
     */
    async function runWorkflow(workflow, handlers, options = {}) {
        const w = normalizeWorkflow(workflow);
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const shouldConfirm = typeof options.shouldConfirm === 'function' ? options.shouldConfirm : null;
        const signal = options.signal || null;
        const results = [];
        let aborted = false;
        let cancelled = false;

        const enabledSteps = w.steps.filter((s) => s.enabled);
        const total = enabledSteps.length;

        for (let i = 0; i < enabledSteps.length; i += 1) {
            if (signal?.aborted) {
                cancelled = true;
                break;
            }
            const stepDef = enabledSteps[i];
            const meta = getStepMeta(stepDef.type);
            if (onProgress) {
                await onProgress({
                    index: i,
                    total,
                    step: stepDef,
                    label: stepDef.label || meta?.label || stepDef.type,
                    phase: 'start',
                });
            }

            if (stepDef.requireConfirm && shouldConfirm) {
                const ok = await shouldConfirm(stepDef, { index: i, total });
                if (!ok) {
                    results.push({
                        stepId: stepDef.id,
                        type: stepDef.type,
                        status: 'skipped',
                        summary: '用户跳过确认',
                    });
                    if (onProgress) {
                        await onProgress({
                            index: i,
                            total,
                            step: stepDef,
                            phase: 'end',
                            status: 'skipped',
                        });
                    }
                    continue;
                }
            }

            const handler = handlers?.[stepDef.type];
            let result;
            try {
                if (typeof handler !== 'function') {
                    result = { status: 'failed', summary: `未注册步骤处理器：${stepDef.type}` };
                } else {
                    result = await handler(options.ctx || {}, stepDef, {
                        signal,
                        index: i,
                        total,
                        onProgress: async (detail) => {
                            if (onProgress) {
                                await onProgress({
                                    index: i,
                                    total,
                                    step: stepDef,
                                    phase: 'progress',
                                    detail,
                                });
                            }
                        },
                    });
                }
            } catch (err) {
                result = { status: 'failed', summary: err?.message || String(err) };
            }

            const status = result?.status || 'failed';
            const entry = {
                stepId: stepDef.id,
                type: stepDef.type,
                status,
                summary: result?.summary || '',
                changed: !!result?.changed,
            };
            results.push(entry);

            if (onProgress) {
                await onProgress({
                    index: i,
                    total,
                    step: stepDef,
                    phase: 'end',
                    status,
                    summary: entry.summary,
                });
            }

            if (status === 'cancelled') {
                cancelled = true;
                break;
            }
            if (status === 'failed') {
                const policy = stepDef.onFail || w.onFail || 'pause';
                if (policy === 'abort' || policy === 'pause') {
                    aborted = true;
                    break;
                }
                // skip → continue
            }
        }

        const summary = {
            total,
            done: results.filter((r) => r.status === 'done').length,
            skipped: results.filter((r) => r.status === 'skipped').length,
            failed: results.filter((r) => r.status === 'failed').length,
            cancelled: cancelled || results.some((r) => r.status === 'cancelled'),
            aborted,
            changed: results.some((r) => r.changed),
        };

        return {
            ok: !summary.failed && !summary.cancelled && !aborted,
            workflowId: w.id,
            workflowName: w.name,
            results,
            summary,
        };
    }

    function summarizeRun(runResult) {
        if (!runResult) return '';
        const s = runResult.summary || {};
        const parts = [
            `完成 ${s.done || 0}/${s.total || 0}`,
        ];
        if (s.skipped) parts.push(`跳过 ${s.skipped}`);
        if (s.failed) parts.push(`失败 ${s.failed}`);
        if (s.cancelled) parts.push('已取消');
        else if (s.aborted) parts.push('已中止');
        return parts.join(' · ');
    }

    return {
        WORKFLOWS_VERSION,
        STEP_CATALOG,
        FAIL_POLICIES: [...FAIL_POLICIES],
        SCOPES: [...SCOPES],
        makeWorkflowId,
        makeStepId,
        listStepCatalog,
        getStepMeta,
        normalizeFailPolicy,
        normalizeScope,
        normalizeStep,
        normalizeWorkflow,
        normalizeWorkflowsDoc,
        emptyWorkflowsDoc,
        step,
        builtinWorkflows,
        ensureBuiltinWorkflows,
        findWorkflow,
        upsertWorkflow,
        removeWorkflow,
        duplicateWorkflow,
        reorderSteps,
        setStepEnabled,
        runWorkflow,
        summarizeRun,
    };
}));
