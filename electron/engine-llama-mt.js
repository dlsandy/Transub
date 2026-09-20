/**
 * Free 推理翻译 (Sakura / GalTransl GGUF) via engine mtBackend=llama (no desktop MT adapter).
 * Smart translate stays on engine-mt-adapter (external).
 */
const path = require('path');
const { asPlainObject, asString } = require('./ipc-validate');
const llmFs = require('./advanced-llm-fs');
const llamaTuning = require('../src/js/llama-server-tuning-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
const { buildEngineGlossaryPairs } = require('./engine-job-options');

/**
 * Hy-MT / complex prompt families still need the desktop adapter for now.
 * @param {string} modelId
 */
function canUseEngineLlamaMt(modelId) {
    const id = asString(modelId, 128).trim();
    if (!id) return false;
    if (sakuraCatalog.isSakuraMtModel?.(id)) {
        const family = sakuraCatalog.resolvePromptFamily?.(id) || 'sakura';
        // Hy-MT / TranslateGemma need desktop adapter for specialized prompts.
        return family !== 'hymt' && family !== 'translategemma';
    }
    if (managedCatalog.findCatalogEntry?.(id) && !managedCatalog.isProScaleModel?.(managedCatalog.findCatalogEntry(id))) {
        return true;
    }
    // Free-tier GalTransl / Sakura-catalog ids (not Hy-MT / TranslateGemma)
    if (/sakura|galtransl/i.test(id) && !/hymt|hy-mt|ornith|translategemma/i.test(id)) return true;
    return false;
}

/**
 * Build llama-server ensure payload (first-choice ngl; engine owns process).
 * @param {object} options
 */
function buildLlamaEnsureBody(options = {}) {
    const opts = asPlainObject(options);
    const modelId = asString(opts.modelId, 128).trim();
    const entry = llmFs.resolveModelEntry(modelId);
    if (!entry) {
        return { ok: false, error: '未知推理翻译模型', code: 'unknown_model' };
    }
    if (!llmFs.isModelInstalled(entry)) {
        return {
            ok: false,
            error: `模型「${entry.name}」尚未下载`,
            code: 'model_not_installed',
            modelId: entry.id,
        };
    }
    const exe = llmFs.resolveServerExe();
    if (!exe) {
        return { ok: false, error: '未找到 llama-server 可执行文件', code: 'exe_missing' };
    }
    const portBase = managedCatalog.DEFAULT_SERVER_PORT || 8080;
    const port = Number(opts.port) || (
        sakuraCatalog.isSakuraMtModel?.(entry.id) ? portBase + 1 : portBase
    );
    const modelPath = llmFs.getModelPath(entry);
    const contextSize = Number.isFinite(Number(opts.contextSize))
        ? Number(opts.contextSize)
        : (Number.isFinite(Number(entry.contextSize)) ? Number(entry.contextSize) : 4096);
    const nGpuLayers = Number.isFinite(Number(opts.nGpuLayers))
        ? Math.max(0, Math.round(Number(opts.nGpuLayers)))
        : 99;
    const entryServerOpts = llamaTuning.resolveLlamaServerOptsFromEntry(entry);
    const args = llamaTuning.buildLlamaServerSpawnArgs({
        modelPath,
        host: '127.0.0.1',
        port,
        contextSize,
        nGpuLayers,
        alias: entry.id,
        parallelSlots: 1,
        llamaJinja: entry.llamaJinja === true,
        ...entryServerOpts,
    });
    return {
        ok: true,
        modelId: entry.id,
        name: entry.name,
        ensure: {
            modelId: entry.id,
            exePath: exe,
            args,
            port,
            afterAsr: true,
            cwd: path.dirname(exe),
            nGpuLayers,
            parallelSlots: 1,
            healthTimeoutMs: 300000,
        },
        port,
    };
}

/**
 * @param {object} options
 * @returns {{ mtBackend: 'llama', mtLlama: object } | { ok: false, error: string, code?: string }}
 */
function buildLlamaMtJobFields(options = {}) {
    const opts = asPlainObject(options);
    const modelId = asString(opts.modelId, 128).trim();
    if (!canUseEngineLlamaMt(modelId)) {
        return { ok: false, error: '该模型暂不走引擎内 llama MT', code: 'unsupported_model' };
    }
    const ensured = buildLlamaEnsureBody(opts);
    if (!ensured.ok) return ensured;

    let systemPrompt = '';
    try {
        const sakuraCore = require('../src/js/sakura-translate-core');
        if (typeof sakuraCore.resolveSystemPrompt === 'function') {
            systemPrompt = String(sakuraCore.resolveSystemPrompt({
                modelId,
                engineMtModel: modelId,
                sakuraNsfwPrompt: opts.sakuraNsfwPrompt,
                promptFamily: sakuraCatalog.resolvePromptFamily?.(modelId),
            }) || '');
        }
    } catch (_) { /* optional */ }

    let glossary = [];
    if (opts.glossaryMtEnabled !== false) {
        try {
            const glossaryObj = opts.glossary && typeof opts.glossary === 'object'
                ? opts.glossary
                : require('./glossary-data').readGlossary()?.glossary;
            glossary = buildEngineGlossaryPairs(glossaryObj) || [];
        } catch (_) {
            glossary = [];
        }
    }

    const batchSize = Math.max(1, Math.min(40, Number(opts.batchSize) || 8));
    return {
        ok: true,
        mtBackend: 'llama',
        mtLlama: {
            model: ensured.modelId,
            modelId: ensured.modelId,
            apiKey: 'local',
            batchSize,
            timeoutSec: Number(opts.timeoutSec) || 600,
            systemPrompt: systemPrompt || undefined,
            glossary,
            ensure: ensured.ensure,
            temperature: 0.1,
            topP: 0.9,
        },
    };
}

module.exports = {
    canUseEngineLlamaMt,
    buildLlamaEnsureBody,
    buildLlamaMtJobFields,
};
