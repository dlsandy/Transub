/**
 * Advanced 软件内模型：GGUF 下载 + llama-server（主路径）
 */
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const llmFs = require('./advanced-llm-fs');
const downloader = require('./advanced-llm-download');
const llamaServer = require('./advanced-llama-server');
const { asString, asPlainObject } = require('./ipc-validate');

let pullAbort = null;

function getSystemMemoryGb() {
    try {
        const info = process.getSystemMemoryInfo?.();
        if (info?.total) return Math.round((info.total / 1024 / 1024) * 10) / 10;
    } catch (_) { /* ignore */ }
    try {
        const os = require('os');
        return Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
    } catch (_) { /* ignore */ }
    return 0;
}

function cancelManagedPull() {
    llamaServer.cancelRuntimeInstall();
    if (pullAbort) {
        try { pullAbort.abort(); } catch (_) { /* ignore */ }
        pullAbort = null;
        return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
}

function summarizeCatalogEntry(entry) {
    if (!entry) return null;
    return {
        id: entry.id,
        name: entry.name,
        fileName: entry.fileName,
        family: entry.family || '',
        translateOnly: !!entry.translateOnly
            || String(entry.family || '').toLowerCase() === 'sakura',
        freePipelineTranslate: !!entry.freePipelineTranslate,
        proScale: catalog.isProScaleModel(entry),
        installed: llmFs.isModelInstalled(entry),
    };
}

function buildManagedStatus(doc, options = {}) {
    const managed = catalog.normalizeManagedLlm(doc?.managedLlm);
    const active = catalog.findCatalogEntry(managed.activeModelId);
    const smartId = catalog.resolveSmartTranslateModelId(managed);
    const smart = catalog.findCatalogEntry(smartId);
    const runtime = llamaServer.getRuntimeStatus();
    const server = llamaServer.getServerState();
    const entitled = !!options.entitled;

    const alwaysIncludeIds = [managed.activeModelId, managed.smartTranslateModelId, smartId]
        .map((id) => String(id || '').trim())
        .filter(Boolean);
    const visible = catalog.listCatalogVisible({
        entitled,
        alwaysIncludeIds,
    });
    const fullCount = catalog.listCatalog().length;
    const items = visible.map((entry) => {
        const present = llmFs.isModelInstalled(entry);
        const validated = present ? llmFs.validateModelFile(entry) : null;
        const installed = !!(validated?.ok);
        return {
            id: entry.id,
            name: entry.name,
            family: entry.family || '',
            familyLabel: entry.familyLabel || '',
            fileName: entry.fileName,
            sizeHint: entry.sizeHint,
            sizeBytes: entry.sizeBytes || 0,
            ramHint: entry.ramHint,
            note: entry.note,
            recommended: !!entry.recommended,
            freePipelineTranslate: !!entry.freePipelineTranslate,
            translateOnly: !!entry.translateOnly
                || String(entry.family || '').toLowerCase() === 'sakura',
            proScale: !!entry.proScale || catalog.isProScaleModel(entry),
            scaleTier: entry.scaleTier || catalog.getModelScaleTier(entry),
            paramBillion: Number(entry.paramBillion) || 0,
            ollamaTag: entry.ollamaTag || '',
            installed,
            present,
            installError: present && !installed ? (validated?.error || '') : '',
            installErrorCode: present && !installed ? (validated?.code || '') : '',
            active: !!(active && active.id === entry.id),
            smartTranslate: !!(smart && smart.id === entry.id),
            pulledByApp: (managed.pulledIds || []).includes(entry.id),
        };
    });

    let message = runtime.message;
    if (runtime.installed && server) {
        message = `${runtime.message} · 服务运行中（${server.modelId} @ ${server.port}）`;
    } else if (runtime.installed) {
        message = `${runtime.message} · 服务未启动（调用重构时自动启动）`;
    }

    return {
        llmSource: catalog.normalizeLlmSource(doc?.llmSource),
        managedLlm: managed,
        systemMemoryGb: getSystemMemoryGb(),
        entitled,
        catalogFullCount: fullCount,
        catalogVisibleCount: items.length,
        proScaleLocked: !entitled,
        runtime: {
            kind: 'llama-server',
            available: !!runtime.installed,
            supported: !!runtime.supported,
            package: runtime.package,
            preferredPackageId: runtime.preferredPackageId || managed.runtimeId || '',
            installedPackageId: runtime.installedPackageId || '',
            mismatch: !!runtime.mismatch,
            outdated: !!runtime.outdated,
            choices: Array.isArray(runtime.choices) ? runtime.choices : [],
            preferCuda: (() => {
                try {
                    return !!require('./advanced-runtime-prefer').getHints().preferCuda;
                } catch (_) {
                    return false;
                }
            })(),
            tag: runtime.tag,
            installedTag: runtime.installedTag || '',
            exePath: runtime.exePath || '',
            baseUrl: llamaServer.getServerBaseUrl(managed.serverPort),
            serverRunning: !!server,
            serverModelId: server?.modelId || '',
            message,
        },
        catalog: items,
        activeModelId: managed.activeModelId || '',
        activeModel: summarizeCatalogEntry(active),
        smartTranslateModelId: smartId || '',
        smartTranslateModel: summarizeCatalogEntry(smart),
    };
}

/**
 * 下载推荐 GGUF 到 advanced-llm/models。
 */
async function pullManagedModel(options = {}) {
    const opts = asPlainObject(options);
    const entry = llmFs.resolveModelEntry(opts.modelId);
    if (!entry) {
        return { ok: false, error: '未知模型', code: 'unknown_model' };
    }
    if (!entry.ggufUrl || !entry.fileName) {
        return { ok: false, error: '该模型缺少 GGUF 下载信息', code: 'gguf_missing' };
    }

    cancelManagedPull();
    const controller = new AbortController();
    pullAbort = controller;
    if (opts.signal) {
        if (opts.signal.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const send = (info) => {
        if (typeof opts.onProgress === 'function') {
            try { opts.onProgress(info); } catch (_) { /* ignore */ }
        }
    };

    try {
        // 先确保运行时：缺失 / 构建号落后 / 后端不一致时安装或强制更新
        const runtimeStatus = llamaServer.getRuntimeStatus({ runtimeId: opts.runtimeId });
        const needRuntime = !runtimeStatus.installed
            || !!runtimeStatus.outdated
            || !!runtimeStatus.mismatch;
        if (needRuntime) {
            const reason = !runtimeStatus.installed
                ? '首次使用：先安装 llama-server 运行时…'
                : (runtimeStatus.mismatch
                    ? '运行时后端与偏好不一致，正在重新安装…'
                    : `运行时版本较旧（${runtimeStatus.installedTag || '旧版'}），正在更新至 ${runtimeStatus.tag}…`);
            send({
                phase: 'start',
                kind: 'runtime',
                modelId: entry.id,
                message: reason,
                pct: 0,
            });
            const rt = await llamaServer.ensureRuntimeInstalled({
                force: !!runtimeStatus.installed,
                runtimeId: opts.runtimeId,
                signal: controller.signal,
                onProgress: (p) => send({ ...p, modelId: entry.id }),
            });
            if (!rt.ok && rt.code !== 'cancelled') {
                // 继续下模型，运行时可稍后单独装
                send({
                    phase: 'warn',
                    modelId: entry.id,
                    message: `运行时安装失败：${rt.error}（仍继续下载模型）`,
                });
            }
            if (rt.code === 'cancelled') {
                return { ok: false, error: '已取消', code: 'cancelled', modelId: entry.id };
            }
        }

        const existing = llmFs.validateModelFile(entry);
        if (existing.ok && !opts.force) {
            send({
                phase: 'done',
                modelId: entry.id,
                message: `${entry.name} 已存在且校验通过，跳过下载`,
                pct: 100,
            });
            return {
                ok: true,
                already: true,
                modelId: entry.id,
                path: existing.path || llmFs.getModelPath(entry),
                message: `${entry.name} 已就绪`,
            };
        }
        if (!existing.ok && llmFs.isModelInstalled(entry) && !opts.force) {
            send({
                phase: 'warn',
                modelId: entry.id,
                message: `本地「${entry.name}」校验失败，将重新下载：${existing.error}`,
            });
        }

        llmFs.ensureDirs();
        const dest = llmFs.getModelPath(entry);
        send({
            phase: 'start',
            kind: 'model',
            modelId: entry.id,
            message: `开始下载 ${entry.name}（${entry.sizeHint}）…`,
            pct: 0,
        });

        await downloader.downloadFile(entry.ggufUrl, dest, {
            signal: controller.signal,
            expectedBytes: entry.sizeBytes,
            onProgress: (p) => send({
                ...p,
                kind: 'model',
                modelId: entry.id,
                message: p.message || `下载 ${entry.name}…`,
            }),
        });

        const validated = llmFs.validateModelFile(entry);
        if (!validated.ok) {
            send({
                phase: 'error',
                kind: 'model',
                modelId: entry.id,
                message: validated.error || '模型文件校验失败',
            });
            return {
                ok: false,
                error: validated.error || '模型文件校验失败',
                code: validated.code || 'model_invalid',
                modelId: entry.id,
                path: dest,
            };
        }

        send({
            phase: 'done',
            kind: 'model',
            modelId: entry.id,
            message: `${entry.name} 下载完成`,
            pct: 100,
        });
        return {
            ok: true,
            modelId: entry.id,
            path: dest,
            message: `${entry.name} 已就绪`,
        };
    } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'cancelled') {
            send({ phase: 'cancelled', modelId: entry.id, message: '已取消下载' });
            return { ok: false, error: '已取消', code: 'cancelled', modelId: entry.id };
        }
        return {
            ok: false,
            error: downloader.formatError(err),
            code: 'download_failed',
            modelId: entry.id,
        };
    } finally {
        pullAbort = null;
    }
}

/**
 * 解析软件内模型为 OpenAI 兼容连接参数（必要时启动 llama-server）。
 */
async function resolveManagedEndpoint(doc, options = {}) {
    const managed = catalog.normalizeManagedLlm(doc?.managedLlm);
    const modelId = asString(options.activeModelId || managed.activeModelId, 128).trim();
    const entry = catalog.findCatalogEntry(modelId);
    if (!entry) {
        return {
            ok: false,
            source: 'managed',
            error: '请先在设置 → 高级 →「软件内选模型」中选择模型',
            code: 'managed_model_missing',
        };
    }
    const validated = llmFs.validateModelFile(entry);
    if (!validated.ok) {
        const hint = llmFs.buildMisplacedModelHint(entry);
        const missing = validated.code === 'model_file_missing';
        return {
            ok: false,
            source: 'managed',
            error: missing
                ? (hint
                    ? `模型「${entry.name}」尚未正确放置。${hint}`
                    : `模型「${entry.name}」尚未下载，请先在设置中下载或手动放入：${llmFs.getModelsDir()}`)
                : (hint ? `${validated.error} ${hint}` : validated.error),
            code: validated.code || 'model_not_installed',
            modelId: entry.id,
            fileName: entry.fileName,
            folder: llmFs.getModelsDir(),
        };
    }

    const started = await llamaServer.ensureLlamaServer({
        modelId: entry.id,
        port: managed.serverPort,
        nGpuLayers: managed.nGpuLayers,
        contextSize: managed.contextSize,
        runtimeId: managed.runtimeId,
        onProgress: options.onProgress,
        signal: options.signal,
    });
    if (!started.ok) return { ...started, source: 'managed' };

    return {
        ok: true,
        source: 'managed',
        apiKey: started.apiKey || 'local',
        baseUrl: started.baseUrl,
        model: started.model || entry.id,
        modelId: entry.id,
        modelName: entry.name,
    };
}

function estimateCompletionTokens(text) {
    const s = String(text || '');
    if (!s) return 0;
    // 中英混合粗估：字符数 / 1.8
    return Math.max(1, Math.round(s.length / 1.8));
}

/**
 * 本地 llama-server + GGUF 简单性能测试（启动耗时 + 生成吞吐）。
 */
async function runManagedPerfBenchmark(doc, options = {}) {
    const opts = asPlainObject(options);
    const send = (info) => {
        if (typeof opts.onProgress === 'function') {
            try { opts.onProgress(info); } catch (_) { /* ignore */ }
        }
    };

    const { chatCompletions } = require('./advanced-llm-client');

    const beforeState = llamaServer.getServerState();
    const alreadyRunning = !!beforeState;

    send({ phase: 'start', message: alreadyRunning ? '服务已在运行，开始性能测试…' : '正在启动本地模型服务…' });

    const tBoot = Date.now();
    const llm = await resolveManagedEndpoint(doc, {
        onProgress: opts.onProgress,
        signal: opts.signal,
    });
    const bootMs = Date.now() - tBoot;
    if (!llm.ok) return llm;

    send({ phase: 'warmup', message: '预热中（短请求）…' });
    const warm = await chatCompletions({
        apiKey: llm.apiKey,
        baseUrl: llm.baseUrl,
        model: llm.model,
        temperature: 0,
        max_tokens: 8,
        timeoutMs: 120000,
        signal: opts.signal,
        messages: [{ role: 'user', content: '只回复一个字：好' }],
    });
    if (!warm.ok) {
        return {
            ok: false,
            error: `预热失败：${warm.error || '未知错误'}`,
            code: warm.code || 'warmup_failed',
            bootMs,
            alreadyRunning,
            modelId: llm.modelId,
            modelName: llm.modelName,
        };
    }

    send({ phase: 'bench', message: '正式测速中…' });
    const prompt = '用中文写一段约80字的短文，主题是字幕翻译质量。不要解释、不要标题，直接写正文。';
    const tGen = Date.now();
    const gen = await chatCompletions({
        apiKey: llm.apiKey,
        baseUrl: llm.baseUrl,
        model: llm.model,
        temperature: 0.3,
        max_tokens: 160,
        timeoutMs: 180000,
        signal: opts.signal,
        messages: [{ role: 'user', content: prompt }],
    });
    const genMs = Date.now() - tGen;
    if (!gen.ok) {
        return {
            ok: false,
            error: `测速生成失败：${gen.error || '未知错误'}`,
            code: gen.code || 'bench_failed',
            bootMs,
            alreadyRunning,
            modelId: llm.modelId,
            modelName: llm.modelName,
        };
    }

    const usage = gen.usage && typeof gen.usage === 'object' ? gen.usage : null;
    const completionTokens = Number(usage?.completion_tokens);
    const promptTokens = Number(usage?.prompt_tokens);
    const tokens = Number.isFinite(completionTokens) && completionTokens > 0
        ? completionTokens
        : estimateCompletionTokens(gen.content);
    const tokensPerSec = genMs > 0 ? (tokens / (genMs / 1000)) : 0;
    // Keep the full bench sample (already capped by max_tokens); do not mid-cut mid-sentence for the dialog.
    const sample = String(gen.content || '').replace(/\s+/g, ' ').trim();

    const message = [
        `${llm.modelName || llm.modelId}`,
        alreadyRunning ? '服务已热' : `冷启动 ${Math.round(bootMs / 1000)}s`,
        `生成 ${tokens} tok / ${(genMs / 1000).toFixed(1)}s`,
        `约 ${tokensPerSec.toFixed(1)} tok/s`,
    ].join(' · ');

    send({ phase: 'done', message, pct: 100 });

    return {
        ok: true,
        message,
        modelId: llm.modelId,
        modelName: llm.modelName,
        alreadyRunning,
        bootMs,
        warmupOk: true,
        genMs,
        tokens,
        tokensEstimated: !(Number.isFinite(completionTokens) && completionTokens > 0),
        promptTokens: Number.isFinite(promptTokens) ? promptTokens : null,
        tokensPerSec: Math.round(tokensPerSec * 10) / 10,
        sample,
        usage,
    };
}

module.exports = {
    buildManagedStatus,
    pullManagedModel,
    cancelManagedPull,
    resolveManagedEndpoint,
    runManagedPerfBenchmark,
    ensureRuntimeInstalled: (...args) => llamaServer.ensureRuntimeInstalled(...args),
    installRuntimeFromLocalArchives: (...args) => llamaServer.installRuntimeFromLocalArchives(...args),
    stopLlamaServer: (...args) => llamaServer.stopLlamaServer(...args),
    getRuntimeStatus: (...args) => llamaServer.getRuntimeStatus(...args),
    syncRuntimePreferenceToHardware: (...args) => llamaServer.syncRuntimePreferenceToHardware(...args),
    probeLlamaServerTag: (...args) => llamaServer.probeLlamaServerTag(...args),
    isModelInstalled: (...args) => llmFs.isModelInstalled(...args),
};
