/**
 * Resolve an installed Sakura/GalTransl model and run sentence MT for smart-translate hybrid.
 */
const core = require('../src/js/smart-translate-hybrid-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const llmFs = require('./advanced-llm-fs');
const { asString, asPlainObject } = require('./ipc-validate');

function listInstalledTranslateOnlyIds() {
    const ids = [];
    const seen = new Set();
    const push = (id) => {
        const key = String(id || '').trim();
        if (!key || seen.has(key.toLowerCase())) return;
        seen.add(key.toLowerCase());
        ids.push(key);
    };
    try {
        for (const entry of sakuraCatalog.listCatalog() || []) {
            if (llmFs.isModelInstalled(entry)) push(entry.id);
        }
    } catch (_) { /* ignore */ }
    return ids;
}

function resolveHybridChunkModelId(preferredId) {
    return core.pickHybridMtModelId({
        preferredId: asString(preferredId, 128).trim(),
        installedIds: listInstalledTranslateOnlyIds(),
    });
}

function modelLabel(modelId) {
    const id = asString(modelId, 128).trim();
    if (!id) return '';
    try {
        const entry = sakuraCatalog.findCatalogEntry(id);
        if (entry?.name) return entry.name;
    } catch (_) { /* ignore */ }
    try {
        const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
        const entry = managedCatalog.findCatalogEntry(id);
        if (entry?.name) return entry.name;
    } catch (_) { /* ignore */ }
    return id;
}

/**
 * @param {{
 *   enabled?: *,
 *   language?: string,
 *   cues?: Array,
 *   preferredId?: string,
 * }} input
 */
function decideHybridChunkMt(input = {}) {
    const preferredId = asString(input.preferredId, 128).trim();
    const modelId = resolveHybridChunkModelId(preferredId);
    const gate = core.shouldUseHybridChunkMt({
        enabled: input.enabled,
        language: input.language,
        cues: input.cues,
        modelId,
    });
    return {
        ...gate,
        modelId: gate.ok ? modelId : '',
        name: gate.ok ? modelLabel(modelId) : '',
        preferredId,
    };
}

/**
 * Later engine batches already have a film brief — skip loading the chat LLM.
 */
function canRunHybridChunkOnly(input = {}) {
    const p = input && typeof input === 'object' ? input : {};
    if (!core.normalizeHybridMtOption(p.smartTranslateHybridMt)) {
        return { ok: false, reason: 'disabled' };
    }
    if (!(p.filmBrief || p.skipFilmBrief)) {
        return { ok: false, reason: 'need_brief' };
    }
    return decideHybridChunkMt({
        enabled: true,
        language: p.language || p.sourceLanguage,
        cues: p.cues,
        preferredId: p.hybridMtModelId || p.engineLlmMtModel,
    });
}

/**
 * Prefer a small installed Instruct for film brief when hybrid will unload it.
 */
function pickHybridBriefModelId(requestedId) {
    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
    if (typeof managedCatalog.pickHybridBriefModelId !== 'function') {
        return asString(requestedId, 128).trim();
    }
    const installedIds = [];
    try {
        for (const entry of managedCatalog.listCatalog() || []) {
            if (managedCatalog.isTranslateOnlyModel(entry)) continue;
            if (llmFs.isModelInstalled(entry)) installedIds.push(entry.id);
        }
    } catch (_) { /* ignore */ }
    return managedCatalog.pickHybridBriefModelId({
        requestedId: asString(requestedId, 128).trim(),
        installedIds,
    }) || asString(requestedId, 128).trim();
}

function listInstalledChatModelIds() {
    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
    const ids = [];
    try {
        for (const entry of managedCatalog.listCatalog() || []) {
            if (managedCatalog.isTranslateOnlyModel(entry)) continue;
            if (llmFs.isModelInstalled(entry)) ids.push(entry.id);
        }
    } catch (_) { /* ignore */ }
    return ids;
}

function pickInstalledSmartTranslateModelId(requestedId) {
    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
    if (typeof managedCatalog.pickInstalledSmartTranslateModelId !== 'function') {
        return asString(requestedId, 128).trim();
    }
    return managedCatalog.pickInstalledSmartTranslateModelId({
        requestedId: asString(requestedId, 128).trim(),
        installedIds: listInstalledChatModelIds(),
    }) || asString(requestedId, 128).trim();
}

function shouldSkipLlmFilmBrief(input = {}) {
    const decided = decideHybridChunkMt({
        enabled: input.enabled,
        language: input.language || input.sourceLanguage,
        cues: input.cues,
        preferredId: input.hybridMtModelId || input.engineLlmMtModel || input.preferredId,
    });
    return !!core.shouldSkipLlmFilmBrief({
        enabled: input.enabled,
        language: input.language || input.sourceLanguage,
        cues: input.cues,
        modelId: decided.modelId,
        llmSource: input.llmSource,
        hasByokKey: !!input.hasByokKey,
        filmBrief: input.filmBrief,
        skipFilmBrief: input.skipFilmBrief,
    });
}

/**
 * After a local chat-model film brief, free VRAM before loading Sakura.
 */
async function releaseChatLlmForHybridChunk(payload = {}) {
    const p = asPlainObject(payload);
    const preferredId = asString(p.preferredId, 128).trim();
    const modelId = resolveHybridChunkModelId(preferredId);
    if (!core.shouldReleaseChatLlmForHybridChunk({
        enabled: p.enabled,
        language: p.language || p.sourceLanguage,
        cues: p.cues,
        modelId,
        baseUrl: p.baseUrl,
    })) {
        return { released: false, modelId };
    }
    const onProgress = typeof p.onProgress === 'function' ? p.onProgress : null;
    const name = modelLabel(modelId);
    onProgress?.({
        phase: 'chunk',
        message: `影片简要已就绪，正在释放对话模型并加载 ${name || modelId}…`,
        pct: 9,
        hybridMt: true,
        hybridHandoff: true,
        hybridMtModelId: modelId,
    });
    try {
        require('./advanced-llama-server').stopLlamaServer();
    } catch (_) { /* ignore */ }
    const rawDelay = Number(p.vramReleaseMs);
    const wait = Number.isFinite(rawDelay)
        ? Math.max(0, Math.min(3000, rawDelay))
        : 400;
    if (wait > 0 && !p.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    return { released: true, modelId, name };
}

async function runHybridChunkTranslate(payload = {}) {
    const p = asPlainObject(payload);
    const { runSakuraTranslate } = require('./sakura-translate');
    const modelId = asString(p.modelId, 128).trim();
    if (!modelId) {
        return { ok: false, error: '缺少推理翻译模型', code: 'no_model' };
    }
    const onProgress = typeof p.onProgress === 'function' ? p.onProgress : null;
    const glossary = p.glossary && typeof p.glossary === 'object'
        ? p.glossary
        : core.glossaryObjectFromTerms([]);
    const castNames = Array.isArray(p.castNames)
        ? p.castNames
        : core.extractCastNames(glossary.entries);
    return runSakuraTranslate({
        cues: p.cues,
        modelId,
        glossary,
        castNames,
        nameMap: p.nameMap,
        sakuraNsfwPrompt: p.sakuraNsfwPrompt,
        nsfwPrompt: p.nsfwPrompt,
        contentProfile: p.contentProfile,
        senseProfile: p.senseProfile,
        faithfulTone: p.faithfulTone,
        smartTranslateFaithfulTone: p.smartTranslateFaithfulTone,
        applyNsfwLexicon: p.applyNsfwLexicon,
        presetId: p.presetId,
        timeoutMs: p.timeoutMs,
        signal: p.signal,
        dryRun: p.dryRun,
        fileName: p.fileName,
        sourcePath: p.sourcePath,
        path: p.path,
        onProgress: onProgress
            ? (info) => {
                const detail = String(info?.detail || info?.message || '').trim();
                onProgress({
                    ...info,
                    phase: info?.phase === 'translate' ? 'chunk' : (info?.phase || 'chunk'),
                    message: detail
                        ? `混合句级（${modelLabel(modelId)}）：${detail}`
                        : `混合句级（${modelLabel(modelId)}）…`,
                    hybridMt: true,
                    hybridMtModelId: modelId,
                });
            }
            : null,
        _batchMode: true,
        _skipComputeLock: true,
        _engineExternalMt: !!p._engineExternalMt,
    });
}

module.exports = {
    listInstalledTranslateOnlyIds,
    resolveHybridChunkModelId,
    decideHybridChunkMt,
    canRunHybridChunkOnly,
    pickHybridBriefModelId,
    pickInstalledSmartTranslateModelId,
    shouldSkipLlmFilmBrief,
    releaseChatLlmForHybridChunk,
    runHybridChunkTranslate,
    modelLabel,
};
