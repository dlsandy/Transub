/**
 * Context reconstruct + bilingual semantic review orchestration.
 * Bound from advanced-bridge via createAdvancedReconstructOrchestration(host).
 * Pro algorithms stay lazy-required inside the bodies.
 */
'use strict';

/**
 * @param {object} host
 * @param {(feature: string) => object} host.requireFeature
 * @param {object} host.entitlement
 * @param {(v: any) => object} host.asPlainObject
 * @param {(s: any, max?: number) => string} host.asString
 * @param {(payload: object) => object} host.enrichReconstructPayloadFromSettings
 * @param {() => { doc: object }} host.readAdvancedDoc
 * @param {(doc: object, opts?: object) => Promise<object>} host.resolveAdvancedLlmConfig
 * @param {(llm: object, meta?: object) => void} host.logAdvancedLlmToEngine
 * @param {() => object} host.loadAdvancedModule
 * @param {() => boolean} host.allowBuiltinProAlgorithms
 * @param {(featureLabel?: string, detail?: string) => object} host.missingClosedModuleError
 * @param {(err: any) => object} host.mapCaughtAbortError
 * @param {(llm: object, input?: object) => void} host.releaseManagedLlmAfterJob
 */
function createAdvancedReconstructOrchestration(host = {}) {
    const required = [
        'requireFeature',
        'entitlement',
        'asPlainObject',
        'asString',
        'enrichReconstructPayloadFromSettings',
        'readAdvancedDoc',
        'resolveAdvancedLlmConfig',
        'logAdvancedLlmToEngine',
        'loadAdvancedModule',
        'allowBuiltinProAlgorithms',
        'missingClosedModuleError',
        'mapCaughtAbortError',
        'releaseManagedLlmAfterJob',
    ];
    for (const key of required) {
        if (host[key] == null || (typeof host[key] !== 'function' && key !== 'entitlement')) {
            if (key === 'entitlement' && host.entitlement && typeof host.entitlement === 'object') continue;
            if (typeof host[key] !== 'function') {
                throw new Error(`createAdvancedReconstructOrchestration: host.${key} required`);
            }
        }
    }

    const {
        requireFeature,
        entitlement,
        asPlainObject,
        asString,
        enrichReconstructPayloadFromSettings,
        readAdvancedDoc,
        resolveAdvancedLlmConfig,
        logAdvancedLlmToEngine,
        loadAdvancedModule,
        allowBuiltinProAlgorithms,
        missingClosedModuleError,
        mapCaughtAbortError,
        releaseManagedLlmAfterJob,
    } = host;

    /**
     * 语境重构入口：优先闭源模块；否则使用内置 BYOK 实现（便于功能测试）。
     * @param {object} payload
     * @param {(info: object) => void} [payload.onProgress]
     * @param {AbortSignal} [payload.signal]
     * @param {Electron.IpcMainInvokeEvent} [event] - 若提供则向 renderer 推送进度。
     */
    async function runContextReconstruct(payload = {}, event = null) {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_reconstruct',
            owner: 'Pro',
            source: 'runContextReconstruct',
        }, payload, () => runContextReconstructBody(payload, event));
    }

    async function runContextReconstructBody(payload = {}, event = null) {
        const gate = requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
        if (!gate.ok) return gate;

        const input = enrichReconstructPayloadFromSettings(asPlainObject(payload));
        const doc = readAdvancedDoc().doc;
        const dryRun = !!input.dryRun
            || !!doc.reconstructMock
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

        let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };

        try {
            if (!dryRun) {
                llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
                if (!llm.ok) return llm;
                logAdvancedLlmToEngine(llm, {
                    feature: asString(input._llmLogFeature, 64).trim() || '语境重构',
                });
            }
            const sendProgress = (info) => {
                const payloadOut = {
                    mode: input._batchMode ? 'batch' : 'single',
                    llmSource: llm.source,
                    ...info,
                };
                if (typeof input.onProgress === 'function') {
                    try { input.onProgress(payloadOut); } catch (_) { /* ignore */ }
                }
                try {
                    event?.sender?.send?.('transub-advanced-reconstruct-progress', payloadOut);
                } catch (_) { /* ignore */ }
            };

            const byokPayload = {
                provider: llm.provider || doc.byok?.provider || 'openai',
                baseUrl: llm.baseUrl || '',
                model: llm.model || '',
                apiKey: llm.apiKey || '',
            };

            const modLoad = loadAdvancedModule();
            if (modLoad.loaded && typeof modLoad.module.contextReconstruct === 'function') {
                try {
                    sendProgress({
                        phase: 'start',
                        message: '正在调用 Pro 模块…',
                        pct: 0,
                    });
                    const result = await modLoad.module.contextReconstruct({
                        ...input,
                        byok: byokPayload,
                        onProgress: sendProgress,
                    });
                    sendProgress({
                        phase: 'done',
                        message: '重构完成',
                        pct: 100,
                    });
                    return { ok: true, ...(result && typeof result === 'object' ? result : { result }), via: 'module', llmSource: llm.source };
                } catch (err) {
                    return mapCaughtAbortError(err);
                }
            }

            if (!allowBuiltinProAlgorithms()) {
                return missingClosedModuleError('语境重构', modLoad.error || modLoad.message);
            }
            const { runBuiltinContextReconstruct } = require('./advanced-context-reconstruct');
            const result = await runBuiltinContextReconstruct({
                ...input,
                byok: byokPayload,
                onProgress: sendProgress,
            });
            if (!result?.ok) return result;
            return { ...result, via: result.mock ? 'mock' : 'builtin', llmSource: llm.source };
        } finally {
            releaseManagedLlmAfterJob(llm, input);
        }
    }

    /**
     * 双语语义审阅（Advanced）。
     */
    async function runBilingualSemanticReview(payload = {}, event = null) {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_semantic_review',
            owner: 'Pro',
            source: 'runBilingualSemanticReview',
        }, payload, () => runBilingualSemanticReviewBody(payload, event));
    }

    async function runBilingualSemanticReviewBody(payload = {}, event = null) {
        const gate = requireFeature(entitlement.FEATURE_BILINGUAL_SEMANTIC_REVIEW);
        const gateFallback = requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
        if (!gate.ok && !gateFallback.ok) return gate;

        const input = asPlainObject(payload);
        const doc = readAdvancedDoc().doc;
        const dryRun = !!input.dryRun
            || !!doc.reconstructMock
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

        let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };

        try {
            if (!dryRun) {
                llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
                if (!llm.ok) return llm;
                logAdvancedLlmToEngine(llm, { feature: '语义审阅' });
            }
            const sendProgress = (info) => {
                const payloadOut = { mode: 'semantic-review', llmSource: llm.source, ...info };
                if (typeof input.onProgress === 'function') {
                    try { input.onProgress(payloadOut); } catch (_) { /* ignore */ }
                }
                try {
                    event?.sender?.send?.('transub-advanced-reconstruct-progress', payloadOut);
                } catch (_) { /* ignore */ }
            };
            const byokPayload = {
                provider: llm.provider || doc.byok?.provider || 'openai',
                baseUrl: llm.baseUrl || '',
                model: llm.model || '',
                apiKey: llm.apiKey || '',
            };

            const modLoad = loadAdvancedModule();
            if (modLoad.loaded && typeof modLoad.module.bilingualSemanticReview === 'function') {
                try {
                    sendProgress({ phase: 'start', message: '正在调用 Pro 语义审阅模块…', pct: 0 });
                    const result = await modLoad.module.bilingualSemanticReview({
                        ...input,
                        byok: byokPayload,
                        dryRun,
                        onProgress: sendProgress,
                    });
                    return {
                        ok: true,
                        ...(result && typeof result === 'object' ? result : { result }),
                        via: 'module',
                        llmSource: llm.source,
                    };
                } catch (err) {
                    return mapCaughtAbortError(err);
                }
            }

            if (!allowBuiltinProAlgorithms()) {
                return missingClosedModuleError('双语语义审阅', modLoad.error || modLoad.message);
            }
            const { runBuiltinBilingualSemanticReview } = require('./advanced-bilingual-semantic');
            const result = await runBuiltinBilingualSemanticReview({
                ...input,
                byok: byokPayload,
                dryRun,
                onProgress: sendProgress,
            });
            if (!result?.ok) return result;
            return { ...result, via: result.mock ? 'mock' : 'builtin', llmSource: llm.source };
        } finally {
            releaseManagedLlmAfterJob(llm, input);
        }
    }

    return {
        runContextReconstruct,
        runContextReconstructBody,
        runBilingualSemanticReview,
        runBilingualSemanticReviewBody,
    };
}

module.exports = { createAdvancedReconstructOrchestration };
