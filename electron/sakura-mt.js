/**
 * Free Sakura MT + general LLM inference MT (managed GGUF + llama-server).
 * Sakura needs no Advanced entitlement; Pro-scale managed models are gated.
 */
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
const managedLlm = require('./advanced-managed-llm');
const llmFs = require('./advanced-llm-fs');
const llamaServer = require('./advanced-llama-server');
const { asString, asPlainObject } = require('./ipc-validate');

const SAKURA_SERVER_PORT_OFFSET = 1; // prefer adjacent port to avoid clashing with Advanced active model briefly

function listSakuraModelsForEngine() {
    return sakuraCatalog.listCatalog().map((entry) => {
        const installed = llmFs.isModelInstalled(entry);
        const item = sakuraCatalog.toEngineListItem(entry, { installed });
        item.path = llmFs.getModelPath(entry) || '';
        return item;
    });
}

function findLlmInferenceEntry(modelId) {
    const id = asString(modelId, 128).trim();
    if (!id) return null;
    return sakuraCatalog.findCatalogEntry(id) || managedCatalog.findCatalogEntry(id) || null;
}

function isLlmInferenceMtModel(modelId) {
    const id = asString(modelId, 128).trim();
    if (!id) return false;
    if (sakuraCatalog.isSakuraMtModel(id)) return true;
    if (managedCatalog.findCatalogEntry(id)) return true;
    return !!sakuraCatalog.isLlmInferenceMtModel?.(id);
}

function getSakuraInstallStatus(modelId) {
    const entry = findLlmInferenceEntry(modelId);
    if (!entry) return { ok: false, error: '未知推理翻译模型', code: 'unknown_model' };
    const installed = llmFs.isModelInstalled(entry);
    const runtime = llamaServer.getRuntimeStatus();
    return {
        ok: true,
        modelId: entry.id,
        name: entry.name,
        installed,
        path: llmFs.getModelPath(entry),
        runtimeInstalled: !!runtime.installed,
        runtimeOutdated: !!runtime.outdated,
        runtimeMismatch: !!runtime.mismatch,
        runtimeTag: runtime.tag || '',
        runtimeInstalledTag: runtime.installedTag || '',
        runtimeMessage: runtime.message || '',
        sizeHint: entry.sizeHint,
        note: entry.note,
    };
}

function assertManagedModelEntitled(entry) {
    if (!entry || !managedCatalog.isProScaleModel(entry)) return { ok: true };
    try {
        const { isDevUnlockEnabled } = require('./advanced-gates');
        if (typeof isDevUnlockEnabled === 'function' && isDevUnlockEnabled()) {
            return { ok: true };
        }
    } catch (_) { /* ignore */ }
    try {
        const entitlement = require('../src/js/advanced-entitlement-core');
        const { readAdvancedDoc } = require('./advanced-license-data');
        const { getAdvancedDeviceId } = require('./advanced-device-id');
        const doc = readAdvancedDoc().doc;
        const status = entitlement.buildStatusView(doc.license, getAdvancedDeviceId());
        if (status?.entitled) return { ok: true };
    } catch (_) { /* ignore */ }
    return {
        ok: false,
        error: `「${entry.name}」为 Pro 规格模型。解锁 Pro 后可用于推理翻译。`,
        code: 'pro_required',
    };
}

/**
 * Ensure GGUF + runtime, start llama-server for Sakura or other managed LLM MT models.
 */
async function resolveSakuraEndpoint(options = {}) {
    const opts = asPlainObject(options);
    const modelId = asString(opts.modelId || sakuraCatalog.DEFAULT_MODEL_ID, 128).trim();
    const sakuraEntry = sakuraCatalog.findCatalogEntry(modelId);
    const managedEntry = sakuraEntry ? null : managedCatalog.findCatalogEntry(modelId);
    const entry = sakuraEntry || managedEntry;
    if (!entry) {
        return { ok: false, error: '未知推理翻译模型', code: 'unknown_model' };
    }

    if (managedEntry) {
        const entitled = assertManagedModelEntitled(managedEntry);
        if (!entitled.ok) return entitled;
    }

    if (!llmFs.isModelInstalled(entry)) {
        const label = sakuraEntry ? 'Sakura' : 'LLM';
        return {
            ok: false,
            error: `${label}「${entry.name}」尚未下载，请在设置 → 模型中下载`,
            code: 'model_not_installed',
            modelId: entry.id,
        };
    }

    const portBase = managedCatalog.DEFAULT_SERVER_PORT;
    const port = Number(opts.port) || (
        sakuraEntry ? (portBase + SAKURA_SERVER_PORT_OFFSET) : portBase
    );

    let runtimeId = asString(opts.runtimeId || opts.packageId, 64).trim();
    if (!runtimeId) {
        try {
            const { readAdvancedDoc } = require('./advanced-license-data');
            runtimeId = managedCatalog.normalizeManagedLlm(readAdvancedDoc().doc?.managedLlm).runtimeId || '';
        } catch (_) { /* ignore */ }
    }

    const started = await llamaServer.ensureLlamaServer({
        modelId: entry.id,
        port,
        nGpuLayers: opts.nGpuLayers,
        contextSize: opts.contextSize || (sakuraEntry ? 4096 : 8192),
        runtimeId,
        onProgress: opts.onProgress,
        signal: opts.signal,
    });
    if (!started.ok) {
        return { ...started, source: sakuraEntry ? 'sakura' : 'managed' };
    }

    return {
        ok: true,
        source: sakuraEntry ? 'sakura' : 'managed',
        apiKey: started.apiKey || 'local',
        baseUrl: started.baseUrl,
        model: started.model || entry.id,
        modelId: entry.id,
        modelName: entry.name,
    };
}

async function pullSakuraModel(options = {}) {
    const opts = asPlainObject(options);
    const modelId = asString(opts.modelId || sakuraCatalog.DEFAULT_MODEL_ID, 128).trim();
    const entry = findLlmInferenceEntry(modelId);
    if (!entry) {
        return { ok: false, error: '未知推理翻译模型', code: 'unknown_model' };
    }
    if (!sakuraCatalog.isSakuraMtModel(entry.id)) {
        const entitled = assertManagedModelEntitled(entry);
        if (!entitled.ok) return entitled;
    }
    return managedLlm.pullManagedModel({
        modelId: entry.id,
        force: !!opts.force,
        signal: opts.signal,
        onProgress: opts.onProgress,
    });
}

module.exports = {
    listSakuraModelsForEngine,
    getSakuraInstallStatus,
    resolveSakuraEndpoint,
    pullSakuraModel,
    findLlmInferenceEntry,
    isLlmInferenceMtModel,
    isSakuraMtModel: sakuraCatalog.isSakuraMtModel,
    findCatalogEntry: sakuraCatalog.findCatalogEntry,
    resolvePromptFamily: sakuraCatalog.resolvePromptFamily,
    DEFAULT_MODEL_ID: sakuraCatalog.DEFAULT_MODEL_ID,
};
