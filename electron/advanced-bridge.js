/**
 * Transub Advanced IPC：许可激活 / 复核 / 换机 / BYOK / 模块状态。
 */
const path = require('path');
const { asString, asPlainObject } = require('./ipc-validate');
const entitlement = require('../src/js/advanced-entitlement-core');
const licenseCrypto = require('../src/js/advanced-license-crypto-core');
const { readAdvancedDoc, writeAdvancedDoc } = require('./advanced-license-data');
const { getAdvancedDeviceId, getDeviceLabel } = require('./advanced-device-id');
const byok = require('./advanced-byok');
const { loadAdvancedModule, getAdvancedModuleInfo } = require('./advanced-module-loader');
const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
const managedLlm = require('./advanced-managed-llm');
const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
const { logAdvancedLlmToEngine } = require('./advanced-llm-log');
const {
    broadcastManagedLlmProgress,
} = require('./download-window');
const { enrichReconstructPayloadFromSettings } = require('./advanced-reconstruct-payload');
const { createAdvancedQcSmartFix } = require('./advanced-qc-smart-fix');
const { createAdvancedSmartTranslateJob } = require('./advanced-smart-translate-job');
const { createAdvancedSmartTranslateFile } = require('./advanced-smart-translate-file');
const { createAdvancedBatchReconstruct } = require('./advanced-batch-reconstruct');
const { createAdvancedReconstructOrchestration } = require('./advanced-reconstruct-orchestration');
const { createAdvancedLicenseLifecycle } = require('./advanced-license-lifecycle');
const { createAdvancedManagedLlmJobs } = require('./advanced-managed-llm-jobs');
const { registerAdvancedManagedLlmIpc } = require('./advanced-managed-llm-ipc');

function isAppPackaged() {
    try {
        const { app } = require('electron');
        return !!(app && app.isPackaged);
    } catch (_) {
        return false;
    }
}

/** Packaged builds ignore TRANSUB_ADVANCED_DEV_UNLOCK; unpackaged auto-unlocks. */
function isDevUnlockEnabled() {
    if (isAppPackaged()) return false;
    const v = String(process.env.TRANSUB_ADVANCED_DEV_UNLOCK || '').trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    try {
        const { app } = require('electron');
        if (app && typeof app.isPackaged === 'boolean' && !app.isPackaged) return true;
    } catch (_) { /* ignore */ }
    return false;
}

/** Real keys use Worker hard-limit unless explicitly skipped (local offline tests). */
function shouldUseLicenseServer() {
    const skip = String(process.env.TRANSUB_LICENSE_SKIP_SERVER || '').trim().toLowerCase();
    return !(skip === '1' || skip === 'true' || skip === 'yes');
}

/** Pro reconstruct algorithms: packaged installs must use `_advanced` (closed module). */
function allowBuiltinProAlgorithms() {
    return !isAppPackaged();
}

function missingClosedModuleError(featureLabel = 'Pro', detail = '') {
    const hint = String(detail || '').trim();
    return {
        ok: false,
        error: hint
            ? `未找到闭源 ${featureLabel} 模块：${hint}`
            : `未找到闭源 ${featureLabel} 模块（安装目录 _advanced）。请使用完整发行包或重新安装。`,
        code: 'advanced_module_missing',
    };
}

/** Map AbortError / English abort strings so Pro module catches never leak them to the editor. */
function mapCaughtAbortError(err) {
    const name = String(err?.name || '');
    const msg = String(err?.message || err || '').trim();
    const lower = msg.toLowerCase();
    const aborted = name === 'AbortError'
        || err?.code === 'cancelled'
        || err?.code === 'aborted'
        || lower === 'aborted'
        || lower === 'cancelled'
        || lower.includes('operation was aborted')
        || lower.includes('user aborted')
        || lower.includes('aborterror');
    if (aborted) {
        return { ok: false, error: '已取消', code: 'cancelled', cancelled: true };
    }
    return { ok: false, error: msg || '操作失败' };
}

function ensureByokLoaded(doc) {
    const blob = asString(doc?.byokKeyBlob, 16384);
    byok.loadByokKeyBlob(blob);
}

function publicStatus(doc, deviceId) {
    ensureByokLoaded(doc);
    const status = entitlement.buildStatusView(doc.license, deviceId);
    if (isDevUnlockEnabled() && !status.entitled) {
        status.entitled = true;
        status.reason = 'dev_unlock';
        status.message = '开发解锁（TRANSUB_ADVANCED_DEV_UNLOCK）';
        status.devUnlock = true;
    }
    return {
        ...status,
        byok: byok.getByokPublicConfig(doc.byok),
        byokKeyHint: byok.maskKeyHint(),
        llmSource: entitlement.normalizeLlmSource(doc.llmSource),
        managedLlm: entitlement.normalizeManagedLlm(doc.managedLlm),
        managedCatalog: managedCatalog.listCatalogVisible({
            entitled: !!status.entitled,
            alwaysIncludeIds: [
                doc?.managedLlm?.activeModelId,
                doc?.managedLlm?.smartTranslateModelId,
            ].filter(Boolean),
        }),
        freePipelineTranslate: (() => {
            try {
                const { evaluateFreeWithInstall } = require('./advanced-gates');
                return evaluateFreeWithInstall(doc);
            } catch (_) {
                return entitlement.evaluateFreePipelineTranslate(doc);
            }
        })(),
        reconstructMock: !!doc.reconstructMock,
        licenseServerUrl: doc.licenseServerUrl || '',
        module: getAdvancedModuleInfo(),
        path: undefined,
    };
}

/** @type {{ setMainWindowTitle?: Function, refreshProductTitle?: Function } | null} */
let windowManagerRef = null;

function getProductWindowTitle() {
    try {
        return require('./product-title').getProductWindowTitle();
    } catch (_) {
        return 'Transub 字幕工厂';
    }
}

function syncMainWindowTitle() {
    const title = getProductWindowTitle();
    try {
        if (windowManagerRef?.setMainWindowTitle) {
            windowManagerRef.setMainWindowTitle(title);
            return;
        }
    } catch (_) { /* ignore */ }
    try {
        const { windowManager } = require('./main');
        windowManager?.setMainWindowTitle?.(title);
    } catch (_) { /* ignore */ }
}

/** Managed catalog status filtered by current Pro entitlement. */
function managedStatusForDoc(doc) {
    const deviceId = getAdvancedDeviceId();
    const status = publicStatus(doc, deviceId);
    return managedLlm.buildManagedStatus(doc, { entitled: !!status.entitled });
}

const {
    activateWithKey,
    revalidateLicense,
    deactivateLicense,
} = createAdvancedLicenseLifecycle({
    getAdvancedDeviceId,
    getDeviceLabel,
    readAdvancedDoc,
    ensureByokLoaded,
    licenseCrypto,
    entitlement,
    writeAdvancedDoc,
    syncMainWindowTitle,
    publicStatus,
    shouldUseLicenseServer,
    isDevUnlockEnabled,
});


function runLegacyByokTranslateModeMigrate() {
    try {
        const { migrateLegacyByokTranslateMode } = require('./translate-mode-byok-migrate');
        const { loadSettings, patchSettings } = require('./settings-data');
        return migrateLegacyByokTranslateMode({
            readAdvancedDoc,
            writeAdvancedDoc,
            loadSettings,
            patchSettings,
        });
    } catch (err) {
        return { ok: false, migrated: false, error: err?.message || String(err) };
    }
}

function saveByokConfig(payload = {}) {
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    const doc = current.doc;
    ensureByokLoaded(doc);

    const patch = asPlainObject(payload);
    const nextByok = entitlement.normalizeByok({
        ...doc.byok,
        provider: patch.provider != null ? patch.provider : doc.byok.provider,
        baseUrl: patch.baseUrl != null ? patch.baseUrl : doc.byok.baseUrl,
        model: patch.model != null ? patch.model : doc.byok.model,
    });

    let keyBlob = asString(doc.byokKeyBlob, 16384);
    if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')) {
        const apiKey = asString(patch.apiKey, 8192).trim();
        if (!apiKey) {
            byok.clearByokApiKey();
            keyBlob = '';
        } else {
            const set = byok.setByokApiKey(apiKey);
            if (!set.ok) return set;
            keyBlob = set.blob || '';
        }
    }

    const nextManaged = entitlement.normalizeManagedLlm({
        ...doc.managedLlm,
        ...(patch.managedLlm && typeof patch.managedLlm === 'object' ? patch.managedLlm : {}),
        activeModelId: patch.activeModelId != null
            ? patch.activeModelId
            : (patch.managedLlm?.activeModelId != null
                ? patch.managedLlm.activeModelId
                : doc.managedLlm?.activeModelId),
        smartTranslateModelId: patch.smartTranslateModelId != null
            ? patch.smartTranslateModelId
            : (patch.managedLlm?.smartTranslateModelId != null
                ? patch.managedLlm.smartTranslateModelId
                : doc.managedLlm?.smartTranslateModelId),
        ollamaBaseUrl: patch.ollamaBaseUrl != null
            ? patch.ollamaBaseUrl
            : (patch.managedLlm?.ollamaBaseUrl != null
                ? patch.managedLlm.ollamaBaseUrl
                : doc.managedLlm?.ollamaBaseUrl),
    });

    const saved = writeAdvancedDoc({
        ...doc,
        byok: nextByok,
        byokKeyBlob: keyBlob,
        llmSource: Object.prototype.hasOwnProperty.call(patch, 'llmSource')
            ? entitlement.normalizeLlmSource(patch.llmSource)
            : entitlement.normalizeLlmSource(doc.llmSource),
        managedLlm: nextManaged,
        reconstructMock: Object.prototype.hasOwnProperty.call(patch, 'reconstructMock')
            ? !!patch.reconstructMock
            : !!doc.reconstructMock,
        licenseServerUrl: patch.licenseServerUrl != null
            ? asString(patch.licenseServerUrl, 2048).trim()
            : (doc.licenseServerUrl || ''),
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    ensureByokLoaded(saved.doc);
    return { ok: true, status: publicStatus(saved.doc, deviceId) };
}

const {
    getManagedLlmStatus,
    selectManagedModel,
    pullManagedModelJob,
    installManagedRuntimeJob,
    importManagedRuntimeJob,
    setManagedRuntimePreference,
    buildDownloadInfo,
    openManualDownload,
    openManagedFolder,
    verifyManualPlacement,
} = createAdvancedManagedLlmJobs({
    getAdvancedDeviceId,
    readAdvancedDoc,
    writeAdvancedDoc,
    publicStatus,
    managedStatusForDoc,
});

function requireFeature(featureId) {
    const gates = require('./advanced-gates');
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    ensureByokLoaded(current.doc);
    const gate = gates.requireFeature(featureId);
    return {
        ...gate,
        status: publicStatus(current.doc, deviceId),
    };
}

/**
 * 智能翻译门控：Pro 专属（smartTranslate / contextReconstruct）。
 * @param {{ faithfulTone?: boolean }} [options] 保留兼容
 */
function requireSmartTranslate(options = {}) {
    const gates = require('./advanced-gates');
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    ensureByokLoaded(current.doc);
    const gate = gates.requireSmartTranslate(options);
    return {
        ...gate,
        status: publicStatus(current.doc, deviceId),
    };
}

/**
 * 影视音频增强许可：filmAudioEnhance，或兼容 contextReconstruct / *。
 */
function requireFilmAudioEnhance() {
    const gates = require('./advanced-gates');
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    ensureByokLoaded(current.doc);
    const gate = gates.requireFilmAudioEnhance();
    return {
        ...gate,
        status: gate.status || publicStatus(current.doc, deviceId),
    };
}

/**
 * 软件内模型任务结束后延迟释放 llama-server，避免频繁冷启动；空�?5 分钟后自动停止�? * 批量任务（_batchMode）由外层统一释放，避免每文件冷启动。
 */
const MANAGED_IDLE_STOP_MS = 5 * 60 * 1000;

function clearManagedIdleStopTimer() {
    try {
        require('./advanced-llama-server').clearIdleStopTimer();
    } catch (_) { /* ignore */ }
}

function scheduleManagedIdleStop(delayMs = MANAGED_IDLE_STOP_MS) {
    try {
        require('./advanced-llama-server').scheduleIdleStop(delayMs);
    } catch (_) { /* ignore */ }
}

function releaseManagedLlmAfterJob(llm, input = {}) {
    if (llm?.source !== 'managed') return;
    if (input._batchMode || input._engineExternalMt) return;
    // User cancel / abort: stop immediately so llama-server does not linger for 5 minutes.
    if (input.signal?.aborted) {
        stopManagedLlmServerQuiet();
        return;
    }
    // Always arm idle stop (including keepServer hops) so cancel cannot orphan the process.
    scheduleManagedIdleStop();
}

function stopManagedLlmServerQuiet() {
    try {
        require('./advanced-llama-server').stopLlamaServer();
    } catch (_) { /* ignore */ }
}

/**
 * QC 智能处理门控：qcSmartFix，或兼容 contextReconstruct / *。
 */
function requireQcSmartFix() {
    const primary = requireFeature(entitlement.FEATURE_QC_SMART_FIX);
    if (primary.ok) return primary;
    return requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
}

let runContextReconstruct;
let runContextReconstructBody;
let runBilingualSemanticReview;
let runBilingualSemanticReviewBody;
let runQcSmartFix;
let runQcLlmSplitRequest;
let runSmartTranslate;
let smartTranslateSubtitleFile;
let runFilmContextReconstruct;
let runFilmContextReconstructBody;
let runBatchContextReconstructJob;
let runBatchContextReconstructJobLocked;

({
    runContextReconstruct,
    runContextReconstructBody,
    runBilingualSemanticReview,
    runBilingualSemanticReviewBody,
} = createAdvancedReconstructOrchestration({
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
}));

({
    runQcSmartFix,
    runQcLlmSplitRequest,
} = createAdvancedQcSmartFix({
    requireQcSmartFix,
    releaseManagedLlmAfterJob,
    runContextReconstructBody,
    runBilingualSemanticReviewBody,
}));

({
    runSmartTranslate,
} = createAdvancedSmartTranslateJob({
    requireSmartTranslate,
    releaseManagedLlmAfterJob,
    loadAdvancedModule,
    allowBuiltinProAlgorithms,
    missingClosedModuleError,
    mapCaughtAbortError,
}));

({
    smartTranslateSubtitleFile,
} = createAdvancedSmartTranslateFile({
    runSmartTranslate,
    asPlainObject,
    asString,
}));

/** @type {AbortController | null} */
let batchAbortController = null;
/** @type {AbortController | null} */
let singleAbortController = null;

function cancelBatchContextReconstruct() {
    if (batchAbortController) {
        batchAbortController.abort();
        batchAbortController = null;
        return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
}

function cancelContextReconstruct() {
    let cancelled = false;
    if (singleAbortController) {
        singleAbortController.abort();
        singleAbortController = null;
        cancelled = true;
    }
    const batch = cancelBatchContextReconstruct();
    // Abort alone can leave llama-server hot if the job never reaches finally.
    stopManagedLlmServerQuiet();
    return { ok: true, cancelled: cancelled || !!batch.cancelled };
}

/**
 * After aborting prior Advanced work, wait briefly for the global compute lock to free.
 * @param {number} [timeoutMs]
 */
async function waitForComputeLockIdle(timeoutMs = 4000) {
    const computeLock = require('./compute-task-lock');
    if (!computeLock.isBusy()) return true;
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (!computeLock.isBusy()) return true;
    }
    return !computeLock.isBusy();
}

({
    runFilmContextReconstruct,
    runFilmContextReconstructBody,
    runBatchContextReconstructJob,
    runBatchContextReconstructJobLocked,
} = createAdvancedBatchReconstruct({
    requireFeature,
    entitlement,
    asPlainObject,
    enrichReconstructPayloadFromSettings,
    readAdvancedDoc,
    clearManagedIdleStopTimer,
    resolveAdvancedLlmConfig,
    logAdvancedLlmToEngine,
    loadAdvancedModule,
    isAppPackaged,
    allowBuiltinProAlgorithms,
    missingClosedModuleError,
    mapCaughtAbortError,
    releaseManagedLlmAfterJob,
    runContextReconstruct,
    cancelContextReconstruct,
    waitForComputeLockIdle,
    stopManagedLlmServerQuiet,
    get batchAbortController() { return batchAbortController; },
    set batchAbortController(v) { batchAbortController = v; },
}));

function setupAdvancedBridge(api, deps = {}) {
    const { register } = api;
    windowManagerRef = deps.windowManager || null;
    const current = readAdvancedDoc();
    ensureByokLoaded(current.doc);
    syncMainWindowTitle();

    register('transub-advanced-get-status', async () => {
        const mig = runLegacyByokTranslateModeMigrate();
        const deviceId = getAdvancedDeviceId();
        const doc = readAdvancedDoc().doc;
        const status = publicStatus(doc, deviceId);
        if (mig && (mig.migrated || mig.sourceForcedManaged)) {
            status.translateModeByokMigrate = mig;
        }
        return { ok: true, status };
    });

    register('transub-advanced-activate', async (_event, payload = {}) => {
        const key = asString(payload.licenseKey || payload.key, 4096).trim();
        if (!key) return { ok: false, error: '请输入许可密钥' };
        return activateWithKey(key, { transfer: false });
    });

    register('transub-advanced-transfer', async (_event, payload = {}) => {
        const doc = readAdvancedDoc().doc;
        const key = asString(payload.licenseKey || payload.key || doc.license?.key, 4096).trim();
        if (!key) return { ok: false, error: '请输入许可密钥' };
        return activateWithKey(key, { transfer: true });
    });

    register('transub-advanced-redeem-afdian', async (_event, payload = {}) => {
        const outTradeNo = asString(payload.outTradeNo || payload.out_trade_no || payload.order, 128).trim();
        if (!outTradeNo) return { ok: false, error: '请填写爱发电订单号' };
        const { redeemLicenseByOrder } = require('./advanced-afdian');
        const redeemed = await redeemLicenseByOrder(outTradeNo);
        if (!redeemed.ok) {
            return { ok: false, error: redeemed.error || '领取失败', code: redeemed.code };
        }
        const activated = await activateWithKey(redeemed.licenseKey, { transfer: false });
        if (!activated.ok) return activated;
        return {
            ...activated,
            licenseKey: redeemed.licenseKey,
            message: activated.message || (redeemed.cached ? '已领取并激活（订单曾发货）' : '已领取并激活'),
            licenseId: redeemed.licenseId || activated.status?.licenseId,
            outTradeNo: redeemed.outTradeNo || outTradeNo,
        };
    });

    register('transub-advanced-revalidate', async () => revalidateLicense());

    register('transub-advanced-deactivate', async () => deactivateLicense());

    register('transub-advanced-save-byok', async (_event, payload = {}) => saveByokConfig(payload));

    registerAdvancedManagedLlmIpc(register, {
        getManagedLlmStatus,
        selectManagedModel,
        buildDownloadInfo,
        openManualDownload,
        openManagedFolder,
        verifyManualPlacement,
        pullManagedModelJob,
        installManagedRuntimeJob,
        importManagedRuntimeJob,
        setManagedRuntimePreference,
        managedLlm,
        entitlement,
        managedCatalog,
        readAdvancedDoc,
        writeAdvancedDoc,
        publicStatus,
        managedStatusForDoc,
        getAdvancedDeviceId,
    });

    register('transub-advanced-open-ollama-download', async () => {
        try {
            const { shell } = require('electron');
            await shell.openExternal(managedCatalog.OLLAMA_DOWNLOAD_URL);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-advanced-clear-byok-key', async () => {
        byok.clearByokApiKey();
        const deviceId = getAdvancedDeviceId();
        const currentDoc = readAdvancedDoc().doc;
        const written = writeAdvancedDoc({ ...currentDoc, byokKeyBlob: '' });
        if (!written.ok) return { ok: false, error: written.error };
        return { ok: true, status: publicStatus(written.doc, deviceId) };
    });

    register('transub-advanced-require-feature', async (_event, payload = {}) => {
        const featureId = asString(payload.featureId || payload.feature, 128).trim();
        if (!featureId) return { ok: false, error: '缺少 featureId' };
        return requireFeature(featureId);
    });

    register('transub-advanced-qc-smart-fix', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            return await runQcSmartFix({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event);
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-qc-llm-split', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            const computeLock = require('./compute-task-lock');
            return await computeLock.runWithComputeLockUnlessNested({
                kind: 'advanced_qc_llm_split',
                owner: 'Pro',
                source: 'transub-advanced-qc-llm-split',
            }, payload, () => runQcLlmSplitRequest({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event));
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-context-reconstruct', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            return await runContextReconstruct({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event);
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-film-context-reconstruct', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            return await runFilmContextReconstruct({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event);
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-batch-context-reconstruct', async (event, payload = {}) => (
        runBatchContextReconstructJob(event, payload)
    ));

    register('transub-advanced-cancel-batch-context-reconstruct', async () => (
        cancelContextReconstruct()
    ));

    register('transub-advanced-cancel-context-reconstruct', async () => (
        cancelContextReconstruct()
    ));

    register('transub-advanced-managed-llm-perf-test', async (event, payload = {}) => {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLock({
            kind: 'managed_llm_perf',
            owner: 'Pro',
            source: 'managed-llm-perf-test',
        }, async () => {
            const doc = readAdvancedDoc().doc;
            const patch = asPlainObject(payload);
            if (entitlement.normalizeLlmSource(doc.llmSource) !== 'managed' && !patch.forceManaged) {
                // 仍允许在软件内面板直接测，不强制�?llmSource
            }
            const sendProgress = (info) => {
                broadcastManagedLlmProgress(info);
                try {
                    event?.sender?.send?.('transub-advanced-managed-llm-progress', info);
                } catch (_) { /* ignore */ }
            };
            const result = await managedLlm.runManagedPerfBenchmark(doc, {
                onProgress: sendProgress,
            });
            if (!result?.ok) return result;
            return {
                ...result,
                status: publicStatus(doc, getAdvancedDeviceId()),
                managed: managedStatusForDoc(doc),
            };
        });
    });

    register('transub-advanced-test-byok', async (_event, payload = {}) => {
        const { testConnection } = require('./advanced-llm-client');
        const patch = asPlainObject(payload);
        const doc = readAdvancedDoc().doc;
        ensureByokLoaded(doc);

        const preferSource = patch.llmSource != null
            ? entitlement.normalizeLlmSource(patch.llmSource)
            : entitlement.normalizeLlmSource(doc.llmSource);

        if (preferSource === 'managed' && !patch.baseUrl && !patch.apiKey) {
            const llm = await resolveAdvancedLlmConfig(doc, { llmSource: 'managed' });
            if (!llm.ok) return llm;
            return testConnection({
                apiKey: llm.apiKey,
                baseUrl: llm.baseUrl,
                model: llm.model,
            });
        }

        const saved = byok.getByokPublicConfig(doc.byok);
        const keyRes = byok.getByokApiKey();
        const apiKey = asString(patch.apiKey, 8192).trim() || keyRes.apiKey || 'ollama';
        const baseUrl = asString(patch.baseUrl, 2048).trim() || saved.baseUrl || '';
        const model = asString(patch.model, 256).trim() || saved.model || '';
        if (!asString(apiKey, 8192).trim()) {
            return { ok: false, error: '请填写 API Key（Ollama 可填 ollama）' };
        }
        return testConnection({ apiKey, baseUrl, model });
    });

    register('transub-advanced-smart-translate', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            return await runSmartTranslate({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event);
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-bilingual-semantic-review', async (event, payload = {}) => {
        cancelContextReconstruct();
        await waitForComputeLockIdle();
        singleAbortController = new AbortController();
        try {
            return await runBilingualSemanticReview({
                ...asPlainObject(payload),
                signal: singleAbortController.signal,
            }, event);
        } finally {
            singleAbortController = null;
        }
    });

    register('transub-advanced-reload-module', async () => {
        const { clearAdvancedModuleCache } = require('./advanced-module-loader');
        clearAdvancedModuleCache();
        const info = getAdvancedModuleInfo();
        return { ok: true, module: info };
    });

    // Language data pack (TDP) — CDN open download; Pro-only apply.
    // Defer syncAppliedState off the first advanced IPC so entitlement/UI can settle first.
    try {
        const tdpRuntime = require('./tdp-runtime');
        const schedule = (typeof setImmediate === 'function')
            ? setImmediate
            : (fn) => setTimeout(fn, 0);
        schedule(() => {
            try {
                tdpRuntime.syncAppliedState();
            } catch (syncErr) {
                console.warn('[tdp] deferred sync failed:', syncErr?.message || syncErr);
            }
        });

        register('transub-tdp-get-status', async () => ({
            ok: true,
            tdp: tdpRuntime.localStatus(),
        }));

        register('transub-tdp-check', async () => tdpRuntime.checkForUpdate());

        register('transub-tdp-pull', async (event) => {
            const sendProgress = (info) => {
                try {
                    event.sender.send('transub-tdp-progress', info);
                } catch { /* ignore */ }
            };
            return tdpRuntime.pullUpdate({ onProgress: sendProgress });
        });

        register('transub-tdp-cancel-pull', async () => tdpRuntime.cancelPull());

        register('transub-tdp-sync', async () => tdpRuntime.syncAppliedState());
    } catch (err) {
        console.warn('[tdp] bridge setup skipped:', err?.message || err);
    }
}

module.exports = {
    setupAdvancedBridge,
    requireFeature,
    requireFilmAudioEnhance,
    requireSmartTranslate,
    requireQcSmartFix,
    runContextReconstruct,
    runFilmContextReconstruct,
    runBilingualSemanticReview,
    runQcSmartFix,
    runQcLlmSplitRequest,
    runSmartTranslate,
    smartTranslateSubtitleFile,
    runBatchContextReconstructJob,
    cancelBatchContextReconstruct,
    cancelContextReconstruct,
    stopManagedLlmServerQuiet,
    publicStatus,
    isDevUnlockEnabled,
    getProductWindowTitle,
    syncMainWindowTitle,
    clearManagedIdleStopTimer,
    scheduleManagedIdleStop,
};
