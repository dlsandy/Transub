/**
 * Pro 智能翻译任务编排：门控 → LLM 解析 → 闭源/内置 smartTranslate → 释放软件内模型。
 * 不含专有 prompt/算法本体（算法在 advanced-smart-translate / _advanced）。
 */
const { asPlainObject } = require('./ipc-validate');
const { readAdvancedDoc } = require('./advanced-license-data');
const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
const { logAdvancedLlmToEngine } = require('./advanced-llm-log');
const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');

/**
 * Engine hybrid-chunk-only batches skip loading the chat LLM. When Sakura/Gal
 * misaligns or fails, the Pro module returns ok:false — without a chat retry
 * the engine keeps only `.src.srt` and never writes the ZH track.
 * @param {object} result
 * @param {object} input
 * @returns {boolean}
 */
function shouldDegradeHybridChunkOnlyToChat(result, input = {}) {
    if (!input || !input._hybridChunkOnly) return false;
    if (!result || result.ok) return false;
    const code = String(result.code || '').trim();
    if (code === 'cancelled' || code === 'not_entitled' || code === 'byok_missing') return false;
    const err = String(result.error || '');
    if (/已取消/.test(err)) return false;
    if (
        code === 'sakura_misaligned'
        || code === 'sakura_failed'
        || code === 'hybrid_chunk_failed'
        || code === 'no_model'
        || code === 'not_translate_only'
    ) {
        return true;
    }
    return /混合句级|positional_misalign|对位异常|句级/.test(err);
}

/**
 * Resolve a chat-capable LLM for smart translate (not Sakura/Gal chunk-only stub).
 * @returns {Promise<{ ok: true, llm: object, smartChoice: object } | { ok: false, error?: string, code?: string }>}
 */
/**
 * Chat LLM for dialog/brief/polish — never Sakura/GalTransl/Hy-MT/TranslateGemma/Hunyuan.
 * Hybrid / smart translate only use smartTranslateModelId (润色模型); never fall back to
 * activeModelId (语境重构推理模型).
 * @param {object} [managed]
 * @returns {{ modelId: string, requestedId: string, fallbackFrom: string }}
 */
function resolveChatCapableSmartChoice(managed = {}) {
    const smart = String(managed?.smartTranslateModelId || '').trim();
    const smartOk = !!(smart && !managedCatalog.isTranslateOnlyModel(smart));
    if (smartOk) {
        return { modelId: smart, requestedId: smart, fallbackFrom: '' };
    }
    return {
        modelId: '',
        requestedId: smart || '',
        fallbackFrom: smart ? 'translate_only_chat_remap' : '',
    };
}

async function resolveSmartChatLlm(input, doc, hybrid, priorChoice = null) {
    let smartChoice = priorChoice && typeof priorChoice === 'object'
        ? { ...priorChoice }
        : { modelId: '', requestedId: '', fallbackFrom: '' };
    const rawOverride = String(
        input.modelId || input.smartTranslateModelId || '',
    ).trim();
    // Translate-only ids belong in hybrid sentence MT — never as chat/dialog LLM.
    const overrideIsLite = !!(rawOverride && managedCatalog.isTranslateOnlyModel(rawOverride));
    const overrideId = overrideIsLite ? '' : rawOverride;
    if (overrideId) {
        const block = managedCatalog.getSmartTranslateModelBlock?.(overrideId) || null;
        if (block?.ok === false) return block;
        smartChoice = {
            modelId: overrideId,
            requestedId: overrideId,
            fallbackFrom: '',
        };
    } else if (!smartChoice.modelId || managedCatalog.isTranslateOnlyModel(smartChoice.modelId)) {
        smartChoice = resolveChatCapableSmartChoice(doc.managedLlm);
        if (overrideIsLite && !smartChoice.fallbackFrom) {
            smartChoice = {
                ...smartChoice,
                requestedId: rawOverride || smartChoice.requestedId,
                fallbackFrom: 'translate_only_chat_remap',
            };
        }
    }
    if (typeof hybrid.pickInstalledSmartTranslateModelId === 'function') {
        const installedId = String(
            hybrid.pickInstalledSmartTranslateModelId(smartChoice.modelId) || '',
        ).trim();
        if (installedId && installedId !== smartChoice.modelId) {
            smartChoice = {
                ...smartChoice,
                modelId: installedId,
                missingFallbackFrom: smartChoice.modelId || smartChoice.requestedId,
            };
        }
    }
    // Final guard: picker may echo a translate-only request when not in chat list.
    if (managedCatalog.isTranslateOnlyModel(smartChoice.modelId)) {
        const remapped = resolveChatCapableSmartChoice(doc.managedLlm);
        const chatId = String(
            (typeof hybrid.pickInstalledSmartTranslateModelId === 'function'
                ? hybrid.pickInstalledSmartTranslateModelId(remapped.modelId)
                : remapped.modelId) || remapped.modelId || '',
        ).trim();
        if (chatId && !managedCatalog.isTranslateOnlyModel(chatId)) {
            smartChoice = {
                ...smartChoice,
                modelId: chatId,
                requestedId: smartChoice.requestedId || rawOverride || remapped.requestedId,
                fallbackFrom: smartChoice.fallbackFrom || 'translate_only_chat_remap',
            };
        }
    }
    // Degrade path: do not downshift to brief-only tiny models — need a full chat MT model.
    if (input.smartTranslateHybridMt !== false && !input._hybridChunkDegrade) {
        const hybridChunk = typeof hybrid.decideHybridChunkMt === 'function'
            ? hybrid.decideHybridChunkMt({
                enabled: input.smartTranslateHybridMt,
                language: input.language || input.sourceLanguage,
                cues: input.cues,
                preferredId: input.hybridMtModelId || input.engineLlmMtModel,
                targetLang: input.targetLang,
                subtitleTargetLang: input.subtitleTargetLang,
                chineseSubtitleVariant: input.chineseSubtitleVariant,
                targetLanguage: input.targetLanguage,
            })
            : { ok: false };
        if (hybridChunk.ok && typeof hybrid.pickHybridBriefModelId === 'function') {
            const briefId = String(hybrid.pickHybridBriefModelId(smartChoice.modelId) || '').trim();
            if (briefId && briefId !== smartChoice.modelId) {
                smartChoice = {
                    ...smartChoice,
                    modelId: briefId,
                    briefDownshiftFrom: smartChoice.modelId,
                };
            }
        }
    }
    const smartModelId = smartChoice.modelId;
    let llm = await resolveAdvancedLlmConfig(doc, {
        activeModelId: smartModelId || undefined,
        requireSmartTranslateCapable: true,
        parallelPurpose: 'smart',
    });
    if (!llm.ok && llm.code === 'byok_missing' && smartModelId) {
        llm = await resolveAdvancedLlmConfig({ ...doc, llmSource: 'managed' }, {
            activeModelId: smartModelId,
            requireSmartTranslateCapable: true,
            parallelPurpose: 'smart',
        });
        if (llm.ok && !smartChoice.missingFallbackFrom) {
            smartChoice.missingFallbackFrom = 'byok';
        }
    }
    if (!llm.ok) return llm;
    logAdvancedLlmToEngine(llm, { feature: '智能翻译' });
    return { ok: true, llm, smartChoice };
}

/**
 * @param {object} host
 * @param {(options?: object) => object} host.requireSmartTranslate
 * @param {(llm: object, input?: object) => void} host.releaseManagedLlmAfterJob
 * @param {() => object} host.loadAdvancedModule
 * @param {() => boolean} host.allowBuiltinProAlgorithms
 * @param {(featureLabel?: string, detail?: string) => object} host.missingClosedModuleError
 * @param {(err: any) => object} host.mapCaughtAbortError
 */
function createAdvancedSmartTranslateJob(host = {}) {
    if (typeof host.requireSmartTranslate !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.requireSmartTranslate required');
    }
    if (typeof host.releaseManagedLlmAfterJob !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.releaseManagedLlmAfterJob required');
    }
    if (typeof host.loadAdvancedModule !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.loadAdvancedModule required');
    }
    if (typeof host.allowBuiltinProAlgorithms !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.allowBuiltinProAlgorithms required');
    }
    if (typeof host.missingClosedModuleError !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.missingClosedModuleError required');
    }
    if (typeof host.mapCaughtAbortError !== 'function') {
        throw new Error('createAdvancedSmartTranslateJob: host.mapCaughtAbortError required');
    }

    /**
     * 智能翻译：原文 cues → LLM 译文（Pro 专属：影片简要 → 句级译；默认可混推理模型）。
     * 许可：smartTranslate / contextReconstruct。
     */
    async function runSmartTranslate(payload = {}, event = null) {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_smart_translate',
            owner: 'Pro',
            source: 'runSmartTranslate',
        }, payload, () => runSmartTranslateBody(payload, event));
    }

    async function runSmartTranslateBody(payload = {}, event = null) {
        const input = asPlainObject(payload);
        // Inherit faithful/NSFW from settings when caller omitted the flags (editor menu etc.)
        if (input.smartTranslateFaithfulTone == null && input.faithfulTone == null) {
            try {
                const { loadSettings } = require('./settings-data');
                const opts = loadSettings()?.options || {};
                if (opts.smartTranslateFaithfulTone) {
                    input.smartTranslateFaithfulTone = true;
                }
                if (input.sakuraNsfwPrompt == null
                    && (opts.sakuraNsfwPrompt === true || opts.sakuraNsfwPrompt === false)) {
                    input.sakuraNsfwPrompt = opts.sakuraNsfwPrompt;
                }
            } catch (_) { /* ignore */ }
        }
        if (input.smartTranslateHybridMt == null) {
            try {
                const { loadSettings } = require('./settings-data');
                const opts = loadSettings()?.options || {};
                input.smartTranslateHybridMt = opts.smartTranslateHybridMt !== false;
                if (!input.engineLlmMtModel && opts.engineLlmMtModel) {
                    input.engineLlmMtModel = opts.engineLlmMtModel;
                }
                if (!input.hybridMtModelId && (opts.engineLlmMtModel || opts.hybridMtModelId)) {
                    input.hybridMtModelId = opts.hybridMtModelId || opts.engineLlmMtModel;
                }
                if (input.smartTranslatePlotPolish == null) {
                    input.smartTranslatePlotPolish = opts.smartTranslatePlotPolish !== false;
                }
                if (input.smartTranslateFaithfulVerify == null) {
                    input.smartTranslateFaithfulVerify = opts.smartTranslateFaithfulVerify !== false;
                }
                if (input.smartTranslateAddressConsistency == null) {
                    input.smartTranslateAddressConsistency = opts.smartTranslateAddressConsistency !== false;
                }
                if (!input.subtitleTargetLang && !input.targetLang) {
                    if (opts.subtitleTargetLang) input.subtitleTargetLang = opts.subtitleTargetLang;
                    else if (opts.targetLang) input.targetLang = opts.targetLang;
                }
                if (!input.chineseSubtitleVariant && opts.chineseSubtitleVariant) {
                    input.chineseSubtitleVariant = opts.chineseSubtitleVariant;
                }
            } catch (_) {
                input.smartTranslateHybridMt = true;
            }
        }
        // Intl: never inherit hybrid-on from settings when 成片 is non-zh
        try {
            const mtRoute = require('../src/js/mt-target-route-core');
            const smartCore = require('../src/js/advanced-smart-translate-core');
            const route = mtRoute.resolveMtTargetRoute(input);
            if (!route.isZhTarget) {
                input.smartTranslateHybridMt = false;
                input._hybridChunkOnly = false;
                input._hybridSkipLlmBrief = false;
                input.subtitleTargetLang = route.targetLang;
                input.targetLang = route.targetLang;
                // Closed Pro blob resolves label from targetLanguage first — must be human label
                input.targetLanguage = smartCore.resolveTargetLanguageLabel({
                    ...input,
                    subtitleTargetLang: route.targetLang,
                    targetLanguage: route.targetLanguageLabel,
                }) || route.targetLanguageLabel || 'English';
                // Intl: force-off ZH-shaped polish/verify/address (ignore settings=true).
                // polishOnly callers still set plotPolish after this block.
                if (!input.polishOnly && !input.plotPolishOnly) {
                    input.smartTranslatePlotPolish = false;
                    input.smartTranslateFaithfulVerify = false;
                    input.smartTranslateAddressConsistency = false;
                }
            } else if (!input.targetLanguage || String(input.targetLanguage).toLowerCase() === 'zh') {
                input.targetLanguage = route.targetLanguageLabel || input.targetLanguage;
            }
        } catch { /* optional */ }
        if (input.smartTranslatePlotPolish == null) {
            input.smartTranslatePlotPolish = true;
        }
        if (input.smartTranslateFaithfulVerify == null) {
            input.smartTranslateFaithfulVerify = true;
        }
        if (input.smartTranslateAddressConsistency == null) {
            input.smartTranslateAddressConsistency = true;
        }
        if (!input.contentProfile && !input.senseProfile) {
            const name = String(input.fileName || input.sourcePath || input.path || '').trim();
            if (name) {
                try {
                    const { classifyContentProfile } = require('../src/js/content-profile-core');
                    const hit = classifyContentProfile({ fileName: name, language: 'ja' });
                    if (hit?.profile) input.contentProfile = hit.profile;
                } catch (_) { /* ignore */ }
            }
        }
        const faithfulTone = !!(input.smartTranslateFaithfulTone || input.faithfulTone);
        const gate = host.requireSmartTranslate({ faithfulTone });
        if (!gate.ok) {
            return {
                ...gate,
                error: gate.error || '智能翻译需解锁 Pro',
                code: gate.code || 'not_entitled',
            };
        }

        const doc = readAdvancedDoc().doc;
        // Engine external MT must always resolve a real LLM — reconstructMock is for
        // UI/dev reconstruct probes only. If dryRun is forced, also set input.dryRun so
        // the Pro module takes the mock path instead of failing on empty byok.
        const mockForced = !!doc.reconstructMock
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';
        const dryRun = !!input.dryRun
            || (!!mockForced && !input._engineExternalMt);
        if (dryRun) input.dryRun = true;

        let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };
        let smartChoice = { modelId: '', requestedId: '', fallbackFrom: '' };
        const polishOnly = !!(input.polishOnly || input.plotPolishOnly);
        if (polishOnly) {
            input.smartTranslateHybridMt = false;
            input.skipFilmBrief = true;
            input._hybridChunkOnly = false;
            input.smartTranslatePlotPolish = input.smartTranslatePlotPolish !== false;
        } else if (!input._blankRetry) {
            // Engine MT adapter often omits smartTranslateModelId; seed from Advanced settings
            // so GalTransl/Sakura picks engage lite (句级) instead of loading as chat LLM.
            // Blank-retry must not re-enter lite/hybrid (it already chose Sakura or chat).
            if (!String(input.smartTranslateModelId || input.modelId || '').trim()) {
                const managedSmart = String(doc.managedLlm?.smartTranslateModelId || '').trim();
                if (managedSmart) input.smartTranslateModelId = managedSmart;
            }
            // Translate-only smart pick → lite: skip brief/polish, force sentence MT.
            try {
                const hybridCore = require('../src/js/smart-translate-hybrid-core');
                const lite = hybridCore.applySmartTranslateLiteOptions(input, {
                    isTranslateOnly: (id) => !!managedCatalog.isTranslateOnlyModel(id),
                });
                Object.assign(input, lite);
            } catch (_) { /* ignore */ }
        }

        try {
            if (!dryRun) {
                const hybrid = require('./smart-translate-hybrid');
                const llmSource = managedCatalog.normalizeLlmSource(doc.llmSource);
                let hasByokKey = false;
                if (llmSource === 'byok') {
                    try {
                        hasByokKey = !!require('./advanced-byok').getByokApiKey()?.apiKey;
                    } catch (_) { hasByokKey = false; }
                }
                if (!polishOnly && !input.filmBrief && typeof hybrid.shouldSkipLlmFilmBrief === 'function') {
                    const skipBrief = input._smartTranslateLite
                        || hybrid.shouldSkipLlmFilmBrief({
                            enabled: input.smartTranslateHybridMt,
                            language: input.language || input.sourceLanguage,
                            cues: input.cues,
                            hybridMtModelId: input.hybridMtModelId,
                            engineLlmMtModel: input.engineLlmMtModel,
                            llmSource,
                            hasByokKey,
                            filmBrief: input.filmBrief,
                            skipFilmBrief: input.skipFilmBrief,
                            targetLang: input.targetLang,
                            subtitleTargetLang: input.subtitleTargetLang,
                            chineseSubtitleVariant: input.chineseSubtitleVariant,
                            targetLanguage: input.targetLanguage,
                        });
                    if (skipBrief) {
                        input.skipFilmBrief = true;
                        // Only label as「智能翻译」when hybrid is actually on (blank-retry
                        // passes skipFilmBrief without wanting Sakura).
                        try {
                            const hybridCore = require('../src/js/smart-translate-hybrid-core');
                            if (hybridCore.normalizeHybridMtOption(input.smartTranslateHybridMt)) {
                                input._hybridSkipLlmBrief = true;
                            }
                        } catch {
                            if (input.smartTranslateHybridMt) input._hybridSkipLlmBrief = true;
                        }
                    }
                }
                const chunkOnly = !polishOnly && typeof hybrid.canRunHybridChunkOnly === 'function'
                    ? hybrid.canRunHybridChunkOnly(input)
                    : { ok: false };
                if (chunkOnly.ok) {
                    input._hybridChunkOnly = true;
                    llm = {
                        ok: true,
                        apiKey: 'local',
                        baseUrl: '',
                        model: chunkOnly.modelId || '',
                        source: 'hybrid-chunk',
                    };
                } else if (input._smartTranslateLite) {
                    return {
                        ok: false,
                        error: '翻译专用智能翻译需要已下载的句级模型，且当前目标语言需支持专训路径。',
                        code: 'smart_translate_lite_unavailable',
                        modelId: String(input.smartTranslateModelId || input.modelId || '').trim(),
                    };
                } else {
                    const resolved = await resolveSmartChatLlm(input, doc, hybrid, smartChoice);
                    if (!resolved.ok) return resolved;
                    smartChoice = resolved.smartChoice;
                    llm = resolved.llm;
                }
            }
            const sendProgress = (info) => {
                const payloadOut = {
                    mode: input._batchMode ? 'batch' : 'single',
                    feature: 'smartTranslate',
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

            if (smartChoice.fallbackFrom) {
                // fallbackFrom may be a reason code (e.g. translate_only_chat_remap), not a model id.
                const fromLabel = String(
                    smartChoice.requestedId
                    || (smartChoice.fallbackFrom === 'translate_only_chat_remap'
                        ? ''
                        : smartChoice.fallbackFrom)
                    || '',
                ).trim();
                const toLabel = String(
                    smartChoice.modelId || llm.modelId || llm.model || '',
                ).trim();
                sendProgress({
                    phase: 'start',
                    message: fromLabel
                        ? `智能翻译模型「${fromLabel}」为翻译专用，已改用「${toLabel}」`
                        : `智能翻译句级模型为翻译专用，对话补译已改用「${toLabel}」`,
                    pct: 0,
                    modelFallback: true,
                    fallbackFrom: smartChoice.fallbackFrom,
                    requestedId: smartChoice.requestedId || '',
                    modelId: smartChoice.modelId,
                });
            }
            if (smartChoice.briefDownshiftFrom) {
                sendProgress({
                    phase: 'start',
                    message: `智能翻译：影片简要用较小的「${smartChoice.modelId}」，句级仍走推理模型`,
                    pct: 0,
                    briefDownshift: true,
                    briefDownshiftFrom: smartChoice.briefDownshiftFrom,
                    modelId: smartChoice.modelId,
                });
            }
            if (smartChoice.missingFallbackFrom) {
                sendProgress({
                    phase: 'start',
                    message: smartChoice.missingFallbackFrom === 'byok'
                        ? `未配置云端 API Key，已改用本机「${smartChoice.modelId || llm.modelId || llm.model}」`
                        : `智能翻译模型尚未下载，已改用已安装的「${smartChoice.modelId || llm.modelId || llm.model}」`,
                    pct: 0,
                    missingFallback: true,
                    missingFallbackFrom: smartChoice.missingFallbackFrom,
                    modelId: smartChoice.modelId,
                });
            }
            if (input._smartTranslateLite) {
                sendProgress({
                    phase: 'start',
                    message: '翻译专用模型：已跳过影片简要与润色',
                    pct: 0,
                    smartTranslateLite: true,
                    hybridSkipLlmBrief: true,
                    hybridMt: true,
                });
            } else if (input._hybridSkipLlmBrief && input.smartTranslateHybridMt) {
                sendProgress({
                    phase: 'start',
                    message: '智能翻译：跳过对话模型简要，人名由原文敬称收获，直接加载推理模型',
                    pct: 0,
                    hybridSkipLlmBrief: true,
                    hybridMt: true,
                });
            }

            let glossary = input.glossary || null;
            if (!glossary) {
                try {
                    const { readGlossary } = require('./glossary-data');
                    const g = readGlossary();
                    if (g?.ok && g.glossary) glossary = g.glossary;
                } catch (_) { /* ignore */ }
            }

            const modLoad = host.loadAdvancedModule();

            async function invokeSmartTranslateOnce(byok) {
                // polishOnly must use builtin (or rebuilt module); old closed blobs would re-run full MT.
                if (polishOnly && host.allowBuiltinProAlgorithms()) {
                    const { runBuiltinSmartTranslate } = require('./advanced-smart-translate');
                    const result = await runBuiltinSmartTranslate({
                        ...input,
                        byok,
                        glossary,
                        onProgress: sendProgress,
                    });
                    if (!result?.ok) return result;
                    return {
                        ...result,
                        via: result.mock ? 'mock' : 'builtin-smart-translate',
                        llmSource: llm.source,
                    };
                }
                // Unpackaged/dev: prefer plaintext source so progress extras (live translate
                // preview deltas) apply without rebuilding `_advanced`.
                if (host.allowBuiltinProAlgorithms()) {
                    const { runBuiltinSmartTranslate } = require('./advanced-smart-translate');
                    const result = await runBuiltinSmartTranslate({
                        ...input,
                        byok,
                        glossary,
                        onProgress: sendProgress,
                    });
                    if (!result?.ok) return result;
                    return {
                        ...result,
                        via: result.mock ? 'mock' : 'builtin-smart-translate',
                        llmSource: llm.source,
                    };
                }
                if (modLoad.loaded && typeof modLoad.module.smartTranslate === 'function') {
                    try {
                        sendProgress({
                            phase: 'start',
                            message: polishOnly ? '剧情贴合润色…' : '正在调用 Pro 智能翻译模块…',
                            pct: 0,
                        });
                        const result = await modLoad.module.smartTranslate({
                            ...input,
                            byok,
                            glossary,
                            onProgress: sendProgress,
                        });
                        return {
                            ok: true,
                            ...(result && typeof result === 'object' ? result : { result }),
                            via: 'module',
                            llmSource: llm.source,
                        };
                    } catch (err) {
                        return host.mapCaughtAbortError(err);
                    }
                }
                // Packaged installs must use `_advanced` (film brief helpers are closed-source).
                return host.missingClosedModuleError('智能翻译', modLoad.error || modLoad.message);
            }

            let byokPayload = {
                provider: llm.provider || doc.byok?.provider || 'openai',
                baseUrl: llm.baseUrl || '',
                model: llm.model || '',
                apiKey: llm.apiKey || '',
            };
            let result = await invokeSmartTranslateOnce(byokPayload);

            // Chunk-only hybrid hard-fail → load chat LLM and finish with line MT so ZH is written.
            if (shouldDegradeHybridChunkOnlyToChat(result, input) && !dryRun && !polishOnly) {
                const hybridErr = String(result?.error || result?.code || 'hybrid_failed');
                sendProgress({
                    phase: 'chunk-retry',
                    message: `句级失败（${hybridErr}），改用对话模型按行翻译以保证产出字幕`,
                    pct: 12,
                    hybridMt: false,
                    hybridDegradeToChat: true,
                });
                try {
                    host.releaseManagedLlmAfterJob(llm, input);
                } catch (_) { /* ignore */ }
                try {
                    require('./advanced-llama-server').stopLlamaServer();
                } catch (_) { /* ignore */ }
                input._hybridChunkOnly = false;
                input._hybridChunkDegrade = true;
                input.smartTranslateHybridMt = false;
                input.skipFilmBrief = true;
                // Do not pass GalTransl/Sakura as dialog override after chunk degrade.
                if (managedCatalog.isTranslateOnlyModel(input.smartTranslateModelId)
                    || managedCatalog.isTranslateOnlyModel(input.modelId)) {
                    input._degradedFromTranslateOnly = String(
                        input.smartTranslateModelId || input.modelId || '',
                    ).trim();
                    input.smartTranslateModelId = '';
                    input.modelId = '';
                }
                const hybrid = require('./smart-translate-hybrid');
                const resolved = await resolveSmartChatLlm(input, doc, hybrid, {
                    modelId: '',
                    requestedId: '',
                    fallbackFrom: '',
                });
                if (resolved.ok) {
                    smartChoice = resolved.smartChoice;
                    llm = resolved.llm;
                    byokPayload = {
                        provider: llm.provider || doc.byok?.provider || 'openai',
                        baseUrl: llm.baseUrl || '',
                        model: llm.model || '',
                        apiKey: llm.apiKey || '',
                    };
                    result = await invokeSmartTranslateOnce(byokPayload);
                    if (result?.ok) {
                        result = {
                            ...result,
                            hybridDegradedToChat: true,
                            hybridDegradeFrom: hybridErr,
                        };
                    }
                }
                // If chat LLM cannot be resolved, keep the original hybrid failure.
            }

            return result;
        } finally {
            host.releaseManagedLlmAfterJob(llm, input);
        }
    }

    return {
        runSmartTranslate,
        runSmartTranslateBody,
    };
}

module.exports = {
    createAdvancedSmartTranslateJob,
    shouldDegradeHybridChunkOnlyToChat,
    resolveChatCapableSmartChoice,
};
