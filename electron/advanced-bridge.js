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
const {
    broadcastManagedLlmProgress,
} = require('./download-window');
const {
    broadcastManagedModelChanged,
} = require('./advanced-llm-pick-window');
const llmFs = require('./advanced-llm-fs');
const { expandDownloadUrls } = require('./advanced-llm-download');

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

/** Pro reconstruct algorithms: packaged installs must use `_advanced` (closed module). */
function allowBuiltinProAlgorithms() {
    return !isAppPackaged();
}

function missingClosedModuleError(featureLabel = 'Pro') {
    return {
        ok: false,
        error: `未找到闭源 ${featureLabel} 模块（安装目录 _advanced）。请使用完整发行包或重新安装。`,
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
        const deviceId = getAdvancedDeviceId();
        const doc = readAdvancedDoc().doc;
        const status = publicStatus(doc, deviceId);
        return status.entitled ? 'Transub Pro' : 'Transub';
    } catch (_) {
        return 'Transub';
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

function persistLicense(doc, license) {
    return writeAdvancedDoc({
        ...doc,
        license,
        byok: doc.byok,
        llmSource: entitlement.normalizeLlmSource(doc.llmSource),
        managedLlm: entitlement.normalizeManagedLlm(doc.managedLlm),
        byokKeyBlob: asString(doc.byokKeyBlob, 16384),
        licenseServerUrl: doc.licenseServerUrl || '',
        reconstructMock: !!doc.reconstructMock,
    });
}

/**
 * 本地验签激活；若配置了 licenseServerUrl，预留服务端同步（当前仍以本地绑定为准）。
 */
function activateWithKey(licenseKey, { transfer = false } = {}) {
    const deviceId = getAdvancedDeviceId();
    const label = getDeviceLabel();
    const now = Date.now();

    const verified = licenseCrypto.verifyLicenseKey(licenseKey);
    if (!verified.ok) {
        return { ok: false, error: verified.error };
    }

    const current = readAdvancedDoc();
    const doc = current.doc;
    ensureByokLoaded(doc);

    let license = entitlement.normalizeLicenseState({
        ...doc.license,
        key: verified.key,
        licenseId: verified.payload.licenseId,
        features: verified.payload.features,
        product: verified.payload.product,
    });

    // 更换不同许可时清空设备绑定
    if (doc.license?.licenseId && doc.license.licenseId !== verified.payload.licenseId) {
        license.devices = [];
        license.lastTransferAt = null;
        license.activatedAt = null;
        license.lastValidatedAt = null;
    }

    let bindResult;
    if (transfer) {
        bindResult = entitlement.transferToDevice(license, deviceId, { now, label });
    } else {
        bindResult = entitlement.bindDevice(license, deviceId, { now, label });
        if (!bindResult.ok && bindResult.code === 'device_limit') {
            return {
                ok: false,
                error: bindResult.error,
                code: 'device_limit',
                hint: '可调用换机（每 30 天最多 1 次）',
            };
        }
    }
    if (!bindResult.ok) {
        return {
            ok: false,
            error: bindResult.error,
            code: bindResult.code,
            retryAt: bindResult.retryAt,
            retryInMs: bindResult.retryInMs,
        };
    }

    license = entitlement.markValidated(bindResult.license, now);
    const saved = persistLicense(doc, license);
    if (!saved.ok) return { ok: false, error: saved.error };

    const status = publicStatus(saved.doc, deviceId);
    syncMainWindowTitle();
    return {
        ok: true,
        transferred: !!transfer && !bindResult.alreadyBound,
        alreadyBound: !!bindResult.alreadyBound,
        status,
    };
}

function revalidateLicense() {
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    const doc = current.doc;
    ensureByokLoaded(doc);
    const lic = doc.license;

    if (isDevUnlockEnabled() && !lic?.key) {
        return {
            ok: true,
            status: publicStatus(doc, deviceId),
            message: '开发解锁模式，无需复核',
        };
    }

    if (!lic?.key) {
        return { ok: false, error: '尚未激活许可' };
    }

    const verified = licenseCrypto.verifyLicenseKey(lic.key);
    if (!verified.ok) {
        return { ok: false, error: verified.error || '许可无效' };
    }
    if (!entitlement.isDeviceBound(lic, deviceId)) {
        return { ok: false, error: '本机未绑定，请先激活或换机', code: 'device_unbound' };
    }

    // 若配置了服务端 URL，此处可扩展为 HTTP 复核；当前本地验签通过即刷新时间戳
    const serverUrl = String(doc.licenseServerUrl || '').trim();
    if (serverUrl) {
        // 预留：未来 POST /v1/revalidate { licenseId, deviceId }
        // 失败时不刷新 lastValidatedAt
    }

    const license = entitlement.markValidated(lic, Date.now());
    const saved = persistLicense(doc, license);
    if (!saved.ok) return { ok: false, error: saved.error };
    syncMainWindowTitle();
    return { ok: true, status: publicStatus(saved.doc, deviceId) };
}

function deactivateLicense() {
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    const doc = current.doc;
    const license = entitlement.emptyLicenseState();
    const saved = persistLicense(doc, license);
    if (!saved.ok) return { ok: false, error: saved.error };
    syncMainWindowTitle();
    return { ok: true, status: publicStatus(saved.doc, deviceId) };
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

async function getManagedLlmStatus() {
    try {
        await require('./advanced-runtime-prefer').ensurePreferCudaReady();
    } catch (_) { /* ignore */ }
    const deviceId = getAdvancedDeviceId();
    // 探测完成后重新 normalize，使空 runtimeId 在 NVIDIA 机器上落为 CUDA 默认
    const doc = readAdvancedDoc().doc;
    const status = publicStatus(doc, deviceId);
    return {
        ok: true,
        status,
        managed: managedStatusForDoc(doc),
    };
}

function selectManagedModel(payload = {}) {
    const deviceId = getAdvancedDeviceId();
    const patch = asPlainObject(payload);
    const modelId = asString(patch.modelId || patch.id, 128).trim();
    const entry = managedCatalog.findCatalogEntry(modelId);
    if (!entry) return { ok: false, error: '未知模型' };

    const current = readAdvancedDoc();
    const doc = current.doc;
    const status = publicStatus(doc, deviceId);
    if (!status.entitled && managedCatalog.isProScaleModel(entry)) {
        return {
            ok: false,
            error: `「${entry.name}」为 Pro 规格模型。解锁 Pro 后可选用 8B 及以上体量与推理专用模型。`,
            code: 'pro_required',
        };
    }

    /** @type {'inference'|'smartTranslate'|'both'} */
    const roleRaw = String(patch.role || patch.purpose || '').trim().toLowerCase();
    const role = roleRaw === 'smarttranslate' || roleRaw === 'smart_translate' || roleRaw === 'translate'
        ? 'smartTranslate'
        : (roleRaw === 'both' ? 'both' : 'inference');

    const prev = entitlement.normalizeManagedLlm(doc.managedLlm);
    const nextPatch = { ...prev };
    if (role === 'smartTranslate' || role === 'both') {
        if (managedCatalog.isTranslateOnlyModel(entry)) {
            return {
                ok: false,
                error: `「${entry.name}」是翻译专用模型，不能用作智能翻译（需影片简要与 JSON）。请改选 Qwen2.5 Instruct 等通用对话模型；Sakura 请用于「推理翻译」。`,
                code: 'model_translate_only',
            };
        }
        nextPatch.smartTranslateModelId = entry.id;
    }
    if (role === 'inference' || role === 'both') {
        nextPatch.activeModelId = entry.id;
        // 首次选用推理模型时，若尚未配置智能翻译且该模型适合对话，则一并填上
        if (
            role === 'inference'
            && !prev.smartTranslateModelId
            && !managedCatalog.isTranslateOnlyModel(entry)
        ) {
            nextPatch.smartTranslateModelId = entry.id;
        }
    }

    const nextManaged = entitlement.normalizeManagedLlm(nextPatch);
    const saved = writeAdvancedDoc({
        ...doc,
        llmSource: 'managed',
        managedLlm: nextManaged,
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    const managed = managedStatusForDoc(saved.doc);
    broadcastManagedModelChanged({
        activeModelId: nextManaged.activeModelId,
        smartTranslateModelId: nextManaged.smartTranslateModelId,
        name: entry.name,
        role,
        managed,
    });
    const roleLabel = role === 'smartTranslate' ? '智能翻译' : (role === 'both' ? '智能翻译与推理' : 'LLM 推理');
    const validated = llmFs.validateModelFile(entry);
    let warn = '';
    if (!validated.ok) {
        const hint = llmFs.buildMisplacedModelHint(entry);
        warn = `（注意：本地文件校验未通过——${validated.error}${hint ? ` ${hint}` : ''}）`;
    }
    return {
        ok: true,
        message: `已将「${entry.name}」设为${roleLabel}模型${warn}`,
        warning: validated.ok ? undefined : validated.error,
        warningCode: validated.ok ? undefined : validated.code,
        status: publicStatus(saved.doc, deviceId),
        managed,
    };
}

async function pullManagedModelJob(event, payload = {}) {
    const patch = asPlainObject(payload);
    const modelId = asString(patch.modelId || patch.id, 128).trim();
    const entry = llmFs.resolveModelEntry(modelId);
    if (!entry) return { ok: false, error: '未知模型' };

    const deviceId = getAdvancedDeviceId();
    const currentPre = readAdvancedDoc();
    const statusPre = publicStatus(currentPre.doc, deviceId);
    if (!statusPre.entitled && managedCatalog.isProScaleModel(entry)) {
        return {
            ok: false,
            error: `「${entry.name}」为 Pro 规格模型。解锁 Pro 后可下载更大规格与推理模型。`,
            code: 'pro_required',
        };
    }

    const sendProgress = (info) => {
        broadcastManagedLlmProgress(info);
        try {
            event?.sender?.send?.('transub-advanced-managed-llm-progress', info);
        } catch (_) { /* ignore */ }
    };

    const result = await managedLlm.pullManagedModel({
        modelId: entry.id,
        force: !!patch.force,
        onProgress: sendProgress,
    });
    if (!result?.ok) return result;

    const current = readAdvancedDoc();
    const doc = current.doc;
    const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
    const pulledIds = Array.from(new Set([...(managed.pulledIds || []), entry.id]));
    const saved = writeAdvancedDoc({
        ...doc,
        llmSource: 'managed',
        managedLlm: {
            ...managed,
            activeModelId: managed.activeModelId || entry.id,
            pulledIds,
            runtimeId: result.meta?.packageId
                || managed.runtimeId
                || managedCatalog.getRuntimePackage()?.id
                || '',
        },
    });
    if (!saved.ok) return { ok: false, error: saved.error };

    const status = publicStatus(saved.doc, deviceId);
    const managedStatus = managedStatusForDoc(saved.doc);
    broadcastManagedModelChanged({
        activeModelId: managedStatus.activeModelId,
        name: managedStatus.activeModel?.name || entry.name,
        managed: managedStatus,
    });
    return {
        ok: true,
        message: result.message || '下载完成',
        status: publicStatus(saved.doc, deviceId),
        managed: managedStatus,
    };
}

function runtimePreferHints() {
    try {
        return require('./advanced-runtime-prefer').getHints();
    } catch (_) {
        return {};
    }
}

async function installManagedRuntimeJob(event, payload = {}) {
    const patch = asPlainObject(payload);
    const sendProgress = (info) => {
        broadcastManagedLlmProgress(info);
        try {
            event?.sender?.send?.('transub-advanced-managed-llm-progress', info);
        } catch (_) { /* ignore */ }
    };
    try {
        await require('./advanced-runtime-prefer').ensurePreferCudaReady();
    } catch (_) { /* ignore */ }
    const hints = runtimePreferHints();
    const deviceId = getAdvancedDeviceId();
    const docBefore = readAdvancedDoc().doc;
    const managedBefore = entitlement.normalizeManagedLlm(docBefore.managedLlm, hints);
    const runtimeId = managedCatalog.normalizeRuntimeId(
        asString(patch.runtimeId || patch.packageId || managedBefore.runtimeId, 64),
        process.platform,
        process.arch,
        hints,
    );
    if (runtimeId && runtimeId !== managedBefore.runtimeId) {
        writeAdvancedDoc({
            ...docBefore,
            managedLlm: { ...managedBefore, runtimeId },
        });
    }
    const result = await managedLlm.ensureRuntimeInstalled({
        force: !!patch.force,
        reinstall: !!patch.reinstall,
        runtimeId,
        onProgress: sendProgress,
    });
    if (!result?.ok) return result;
    const doc = readAdvancedDoc().doc;
    const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
    const saved = writeAdvancedDoc({
        ...doc,
        managedLlm: {
            ...managed,
            runtimeId: result.meta?.packageId || runtimeId || managed.runtimeId || '',
        },
    });
    let message = '运行时安装完成';
    if (result.already) {
        if (result.mismatch) {
            message = '运行时已安装，但与偏好后端不一致，请重新安装';
        } else if (result.outdated) {
            message = '运行时已就绪（版本较旧，可强制更新）';
        } else {
            message = '运行时已就绪，无需重复下载';
        }
    }
    return {
        ok: true,
        already: !!result.already,
        message,
        status: publicStatus((saved.ok ? saved.doc : doc), deviceId),
        managed: managedStatusForDoc(saved.ok ? saved.doc : doc),
    };
}

function setManagedRuntimePreference(payload = {}) {
    const patch = asPlainObject(payload);
    const deviceId = getAdvancedDeviceId();
    const hints = runtimePreferHints();
    const doc = readAdvancedDoc().doc;
    const managed = entitlement.normalizeManagedLlm(doc.managedLlm, hints);
    const runtimeId = managedCatalog.normalizeRuntimeId(
        asString(patch.runtimeId || patch.packageId, 64),
        process.platform,
        process.arch,
        hints,
    );
    if (!runtimeId) {
        return { ok: false, error: '无效的运行时后端', code: 'invalid_runtime' };
    }
    const saved = writeAdvancedDoc({
        ...doc,
        managedLlm: { ...managed, runtimeId },
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    return {
        ok: true,
        message: '已保存运行时偏好',
        status: publicStatus(saved.doc, deviceId),
        managed: managedStatusForDoc(saved.doc),
    };
}

function classifyRuntimeZipPaths(filePaths, pkg) {
    const list = (Array.isArray(filePaths) ? filePaths : [])
        .map((p) => String(p || '').trim())
        .filter(Boolean);
    if (!list.length) {
        return { ok: false, error: '未选择压缩包', code: 'archive_missing' };
    }
    if (!pkg?.companionUrl) {
        return { ok: true, archivePath: list[0], companionPath: '' };
    }
    const cudart = list.find((p) => /cudart/i.test(path.basename(p)));
    const main = list.find((p) => !/cudart/i.test(path.basename(p)));
    if (list.length === 1 && cudart) {
        return {
            ok: false,
            error: '请同时选择主程序 zip（llama-*-bin-win-cuda-*.zip）与 cudart zip',
            code: 'companion_missing',
        };
    }
    if (list.length === 1) {
        return {
            ok: false,
            error: 'CUDA 运行时需同时选择两个 zip：主程序 + cudart 运行库',
            code: 'companion_missing',
        };
    }
    return {
        ok: true,
        archivePath: main || list[0],
        companionPath: cudart || list[1],
    };
}

async function importManagedRuntimeJob(event, payload = {}) {
    const patch = asPlainObject(payload);
    const sendProgress = (info) => {
        broadcastManagedLlmProgress(info);
        try {
            event?.sender?.send?.('transub-advanced-managed-llm-progress', info);
        } catch (_) { /* ignore */ }
    };
    try {
        await require('./advanced-runtime-prefer').ensurePreferCudaReady();
    } catch (_) { /* ignore */ }
    const hints = runtimePreferHints();
    const deviceId = getAdvancedDeviceId();
    const docBefore = readAdvancedDoc().doc;
    const managedBefore = entitlement.normalizeManagedLlm(docBefore.managedLlm, hints);
    const runtimeId = managedCatalog.normalizeRuntimeId(
        asString(patch.runtimeId || patch.packageId || managedBefore.runtimeId, 64),
        process.platform,
        process.arch,
        hints,
    );
    const pkg = managedCatalog.getRuntimePackage(process.platform, process.arch, runtimeId, hints);
    if (!pkg) {
        return { ok: false, error: `当前平台不支持内置运行时（${process.platform}-${process.arch}）` };
    }

    let archivePath = asString(patch.archivePath, 4096).trim();
    let companionPath = asString(patch.companionPath, 4096).trim();
    if (!archivePath) {
        const { dialog, BrowserWindow } = require('electron');
        const win = BrowserWindow.fromWebContents(event?.sender)
            || BrowserWindow.getFocusedWindow()
            || undefined;
        const picked = await dialog.showOpenDialog(win || undefined, {
            title: pkg.companionUrl
                ? `选择 ${pkg.label} 压缩包（可多选：主程序 + cudart）`
                : `选择 ${pkg.label} 压缩包`,
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'ZIP', extensions: ['zip'] },
                { name: '全部文件', extensions: ['*'] },
            ],
        });
        if (picked.canceled || !picked.filePaths?.length) {
            return { ok: false, cancelled: true, error: '已取消' };
        }
        const classified = classifyRuntimeZipPaths(picked.filePaths, pkg);
        if (!classified.ok) return classified;
        archivePath = classified.archivePath;
        companionPath = classified.companionPath;
    } else {
        const classified = classifyRuntimeZipPaths(
            [archivePath, companionPath].filter(Boolean),
            pkg,
        );
        if (!classified.ok) return classified;
        archivePath = classified.archivePath;
        companionPath = classified.companionPath;
    }

    if (runtimeId && runtimeId !== managedBefore.runtimeId) {
        writeAdvancedDoc({
            ...docBefore,
            managedLlm: { ...managedBefore, runtimeId },
        });
    }

    const result = await managedLlm.installRuntimeFromLocalArchives({
        runtimeId,
        archivePath,
        companionPath,
        onProgress: sendProgress,
    });
    if (!result?.ok) return result;

    const doc = readAdvancedDoc().doc;
    const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
    const saved = writeAdvancedDoc({
        ...doc,
        managedLlm: {
            ...managed,
            runtimeId: result.meta?.packageId || runtimeId || managed.runtimeId || '',
        },
    });
    return {
        ok: true,
        message: `已从本地压缩包安装运行时（${pkg.label}）`,
        status: publicStatus((saved.ok ? saved.doc : doc), deviceId),
        managed: managedStatusForDoc(saved.ok ? saved.doc : doc),
    };
}

function archiveNameFromUrl(url) {
    try {
        const name = path.basename(new URL(String(url || '').trim()).pathname || '');
        return decodeURIComponent(name || '') || '';
    } catch (_) {
        return path.basename(String(url || '').trim()) || '';
    }
}

function buildDownloadInfo(payload = {}) {
    const patch = asPlainObject(payload);
    const kind = String(patch.kind || 'model').trim() === 'runtime' ? 'runtime' : 'model';
    if (kind === 'runtime') {
        const hints = runtimePreferHints();
        const doc = readAdvancedDoc().doc;
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm, hints);
        const runtimeId = managedCatalog.normalizeRuntimeId(
            asString(patch.runtimeId || patch.packageId || managed.runtimeId, 64),
            process.platform,
            process.arch,
            hints,
        );
        const pkg = managedCatalog.getRuntimePackage(process.platform, process.arch, runtimeId, hints);
        if (!pkg) {
            return { ok: false, error: `当前平台不支持内置运行时（${process.platform}-${process.arch}）` };
        }
        const urls = expandDownloadUrls(pkg.url);
        const mirrorUrl = urls.find((u) => u !== pkg.url) || '';
        const companionUrl = String(pkg.companionUrl || '').trim();
        const companionUrls = companionUrl ? expandDownloadUrls(companionUrl) : [];
        const companionMirrorUrl = companionUrls.find((u) => u !== companionUrl) || '';
        return {
            ok: true,
            info: {
                kind: 'runtime',
                title: '安装 llama-server 运行时',
                runtimeLabel: pkg.label,
                runtimeTag: managedCatalog.LLAMA_CPP_TAG,
                runtimeId: pkg.id,
                backend: pkg.backend || '',
                runtimeUrl: pkg.url,
                runtimeCompanionUrl: companionUrl,
                runtimeMirrorUrl: mirrorUrl,
                runtimeCompanionMirrorUrl: companionMirrorUrl,
                runtimeArchiveName: archiveNameFromUrl(pkg.url),
                runtimeCompanionArchiveName: archiveNameFromUrl(companionUrl),
                exeName: pkg.exeName || (process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
                mirrorUrl,
                sizeHint: pkg.sizeHint || '',
                note: pkg.note || '',
                folder: llmFs.getRuntimeDir(),
                needsCompanion: !!companionUrl,
            },
        };
    }

    const modelId = asString(patch.modelId || patch.id, 128).trim();
    const entry = llmFs.resolveModelEntry(modelId);
    if (!entry) return { ok: false, error: '未知模型' };
    const deviceId = getAdvancedDeviceId();
    const status = publicStatus(readAdvancedDoc().doc, deviceId);
    if (!status.entitled && managedCatalog.isProScaleModel(entry)) {
        return {
            ok: false,
            error: `「${entry.name}」为 Pro 规格模型。解锁 Pro 后可下载更大规格与推理模型。`,
            code: 'pro_required',
        };
    }
    const urls = expandDownloadUrls(entry.ggufUrl);
    const mirrorUrl = urls.find((u) => u !== entry.ggufUrl) || '';
    return {
        ok: true,
        info: {
            kind: 'model',
            title: `下载 ${entry.name}`,
            modelId: entry.id,
            name: entry.name,
            fileName: entry.fileName,
            sizeHint: entry.sizeHint,
            ramHint: entry.ramHint,
            ggufUrl: entry.ggufUrl,
            ggufMirrorUrl: mirrorUrl,
            mirrorUrl,
            folder: llmFs.getModelsDir(),
            installed: llmFs.isModelInstalled(entry),
        },
    };
}

async function openManualDownload(payload = {}) {
    const patch = asPlainObject(payload);
    const infoRes = buildDownloadInfo(patch);
    if (!infoRes.ok) return infoRes;
    const info = infoRes.info;
    const which = String(patch.which || 'mirror').trim().toLowerCase();
    /** @type {string[]} */
    const urls = [];
    if (info.kind === 'runtime') {
        const wantCompanion = which === 'companion'
            || which === 'companion-mirror'
            || which === 'all'
            || which === 'all-official';
        const wantMain = which !== 'companion' && which !== 'companion-mirror';
        const preferOfficial = which === 'official'
            || which === 'all-official'
            || which === 'companion';
        if (wantMain) {
            urls.push(preferOfficial
                ? info.runtimeUrl
                : (info.runtimeMirrorUrl || info.runtimeUrl));
        }
        if (wantCompanion && info.runtimeCompanionUrl) {
            urls.push(preferOfficial || which === 'companion'
                ? info.runtimeCompanionUrl
                : (info.runtimeCompanionMirrorUrl || info.runtimeCompanionUrl));
        }
    } else {
        urls.push(which === 'official'
            ? info.ggufUrl
            : (info.ggufMirrorUrl || info.ggufUrl));
    }
    const unique = [...new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))];
    if (!unique.length) return { ok: false, error: '没有可用下载链接' };
    try {
        const { shell } = require('electron');
        for (const url of unique) {
            await shell.openExternal(url);
            if (unique.length > 1) {
                await new Promise((r) => setTimeout(r, 400));
            }
        }
        return { ok: true, url: unique[0], urls: unique };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

async function openManagedFolder(payload = {}) {
    const patch = asPlainObject(payload);
    const kind = String(patch.kind || 'model').trim() === 'runtime' ? 'runtime' : 'model';
    llmFs.ensureDirs();
    const folder = kind === 'runtime' ? llmFs.getRuntimeDir() : llmFs.getModelsDir();
    try {
        const { shell } = require('electron');
        const err = await shell.openPath(folder);
        if (err) return { ok: false, error: err, folder };
        return { ok: true, folder };
    } catch (err) {
        return { ok: false, error: err.message || String(err), folder };
    }
}

function verifyManualPlacement(payload = {}) {
    const patch = asPlainObject(payload);
    const kind = String(patch.kind || 'model').trim() === 'runtime' ? 'runtime' : 'model';
    const deviceId = getAdvancedDeviceId();
    const doc = readAdvancedDoc().doc;

    if (kind === 'runtime') {
        const hints = runtimePreferHints();
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm, hints);
        const runtimeId = managedCatalog.normalizeRuntimeId(
            asString(patch.runtimeId || patch.packageId || managed.runtimeId, 64),
            process.platform,
            process.arch,
            hints,
        );
        const pkg = managedCatalog.getRuntimePackage(process.platform, process.arch, runtimeId, hints);
        const runtime = managedLlm.getRuntimeStatus({ runtimeId });
        if (!runtime.installed || !runtime.exePath) {
            return {
                ok: false,
                error: `未检测到 ${pkg?.exeName || 'llama-server'}。请将压缩包内容解压到：${llmFs.getRuntimeDir()}`,
                folder: llmFs.getRuntimeDir(),
                managed: managedStatusForDoc(doc),
            };
        }
        if (pkg?.backend === 'cuda') {
            const cudaDll = llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'ggml-cuda.dll', 4)
                || llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'cudart64_12.dll', 4);
            if (!cudaDll) {
                return {
                    ok: false,
                    error: '已找到 llama-server，但缺少 CUDA 组件。请把 cudart zip 一并解压到同一目录后再检测。',
                    folder: llmFs.getRuntimeDir(),
                    managed: managedStatusForDoc(doc),
                };
            }
        }
        if (pkg) {
            try {
                llmFs.writeRuntimeMeta({
                    tag: managedCatalog.LLAMA_CPP_TAG,
                    packageId: pkg.id,
                    label: pkg.label,
                    backend: pkg.backend || '',
                    exeName: pkg.exeName,
                    exePath: runtime.exePath,
                    installedAt: new Date().toISOString(),
                    source: 'manual-verify',
                });
            } catch (_) { /* ignore */ }
        }
        const saved = writeAdvancedDoc({
            ...doc,
            managedLlm: {
                ...managed,
                runtimeId: pkg?.id || runtimeId || managed.runtimeId || '',
            },
        });
        const nextDoc = saved.ok ? saved.doc : doc;
        return {
            ok: true,
            message: `已检测到本地运行时${pkg?.label ? `（${pkg.label}）` : ''}`,
            status: publicStatus(nextDoc, deviceId),
            managed: managedStatusForDoc(nextDoc),
        };
    }

    const modelId = asString(patch.modelId || patch.id, 128).trim();
    const entry = llmFs.resolveModelEntry(modelId);
    if (!entry) return { ok: false, error: '未知模型' };
    const validated = llmFs.validateModelFile(entry);
    if (!validated.ok) {
        const hint = llmFs.buildMisplacedModelHint(entry);
        return {
            ok: false,
            error: hint ? `${validated.error}\n${hint}` : validated.error,
            code: validated.code || 'model_invalid',
            folder: llmFs.getModelsDir(),
            fileName: entry.fileName,
            path: validated.path || '',
            misplaced: llmFs.findMisplacedModelCandidates(entry),
        };
    }

    const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
    const pulledIds = Array.from(new Set([...(managed.pulledIds || []), entry.id]));
    const saved = writeAdvancedDoc({
        ...doc,
        llmSource: 'managed',
        managedLlm: {
            ...managed,
            activeModelId: managed.activeModelId || entry.id,
            pulledIds,
        },
    });
    if (!saved.ok) return { ok: false, error: saved.error };
    return {
        ok: true,
        message: validated.message || `已检测到 ${entry.name}，可开始使用`,
        status: publicStatus(saved.doc, deviceId),
        managed: managedStatusForDoc(saved.doc),
    };
}

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
 * 语境重构入口：优先闭源模块；否则使用内置 BYOK 实现（便于功能测试）。
 * @param {object} payload
 * @param {(info: object) => void} [payload.onProgress]
 * @param {AbortSignal} [payload.signal]
 * @param {Electron.IpcMainInvokeEvent} [event] - 若提供则�?renderer 推送进。
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
            return missingClosedModuleError('语境重构');
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
            return missingClosedModuleError('双语语义审阅');
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

/**
 * 影片理解重构：Brief + 场景分块（独立功能，保留原语境重构）。
 */
async function runFilmContextReconstruct(payload = {}, event = null) {
    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLockUnlessNested({
        kind: 'advanced_film_reconstruct',
        owner: 'Pro',
        source: 'runFilmContextReconstruct',
    }, payload, () => runFilmContextReconstructBody(payload, event));
}

async function runFilmContextReconstructBody(payload = {}, event = null) {
    const gateFilm = requireFeature(entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT);
    const gateBasic = requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
    if (!gateFilm.ok && !gateBasic.ok) return gateFilm;

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
        }
        const sendProgress = (info) => {
            const payloadOut = {
                mode: input._batchMode ? 'batch' : 'single',
                reconstructMode: 'film',
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
        if (modLoad.loaded && typeof modLoad.module.filmContextReconstruct === 'function') {
            try {
                sendProgress({ phase: 'start', message: '正在调用 Pro 影片理解模块…', pct: 0 });
                const result = await modLoad.module.filmContextReconstruct({
                    ...input,
                    byok: byokPayload,
                    onProgress: sendProgress,
                });
                return { ok: true, ...(result && typeof result === 'object' ? result : { result }), via: 'module', llmSource: llm.source };
            } catch (err) {
                return mapCaughtAbortError(err);
            }
        }

        if (!allowBuiltinProAlgorithms()) {
            return missingClosedModuleError('影片理解重构');
        }
        const { runBuiltinFilmContextReconstruct } = require('./advanced-film-reconstruct');
        const result = await runBuiltinFilmContextReconstruct({
            ...input,
            byok: byokPayload,
            onProgress: sendProgress,
        });
        if (!result?.ok) return result;
        return { ...result, via: result.mock ? 'mock' : 'builtin-film', llmSource: llm.source };
    } finally {
        releaseManagedLlmAfterJob(llm, input);
    }
}

/**
 * 智能翻译：原文 cues → LLM 译文（Pro 专属：影片简要 → 分块译 → 一致性）。
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
    const gate = requireSmartTranslate({ faithfulTone });
    if (!gate.ok) {
        return {
            ...gate,
            error: gate.error || '智能翻译需解锁 Pro',
            code: gate.code || 'not_entitled',
        };
    }

    const doc = readAdvancedDoc().doc;
    const dryRun = !!input.dryRun
        || !!doc.reconstructMock
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

    let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };
    let smartChoice = { modelId: '', requestedId: '', fallbackFrom: '' };

    try {
        if (!dryRun) {
            smartChoice = managedCatalog.resolveSmartTranslateModelChoice(doc.managedLlm);
            const smartModelId = smartChoice.modelId;
            llm = await resolveAdvancedLlmConfig(doc, {
                activeModelId: smartModelId || undefined,
                requireSmartTranslateCapable: true,
            });
            if (!llm.ok) return llm;
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
            sendProgress({
                phase: 'start',
                message: `智能翻译模型「${smartChoice.fallbackFrom}」为翻译专用，已改用「${smartChoice.modelId || llm.modelId || llm.model}」`,
                pct: 0,
                modelFallback: true,
                fallbackFrom: smartChoice.fallbackFrom,
                modelId: smartChoice.modelId,
            });
        }

        const byokPayload = {
            provider: llm.provider || doc.byok?.provider || 'openai',
            baseUrl: llm.baseUrl || '',
            model: llm.model || '',
            apiKey: llm.apiKey || '',
        };

        let glossary = input.glossary || null;
        if (!glossary) {
            try {
                const { readGlossary } = require('./glossary-data');
                const g = readGlossary();
                if (g?.ok && g.glossary) glossary = g.glossary;
            } catch (_) { /* ignore */ }
        }

        const modLoad = loadAdvancedModule();
        if (modLoad.loaded && typeof modLoad.module.smartTranslate === 'function') {
            try {
                sendProgress({ phase: 'start', message: '正在调用 Pro 智能翻译模块…', pct: 0 });
                const result = await modLoad.module.smartTranslate({
                    ...input,
                    byok: byokPayload,
                    glossary,
                    onProgress: sendProgress,
                });
                return { ok: true, ...(result && typeof result === 'object' ? result : { result }), via: 'module', llmSource: llm.source };
            } catch (err) {
                return mapCaughtAbortError(err);
            }
        }

        // Packaged installs must use `_advanced` (film brief helpers are closed-source).
        if (!allowBuiltinProAlgorithms()) {
            return missingClosedModuleError('智能翻译');
        }
        const { runBuiltinSmartTranslate } = require('./advanced-smart-translate');
        const result = await runBuiltinSmartTranslate({
            ...input,
            byok: byokPayload,
            glossary,
            onProgress: sendProgress,
        });
        if (!result?.ok) return result;
        return { ...result, via: result.mock ? 'mock' : 'builtin-smart-translate', llmSource: llm.source };
    } finally {
        releaseManagedLlmAfterJob(llm, input);
    }
}

/**
 * 读字幕文�?�?智能翻译 �?写到 dest（可与源相同）。
 */
async function smartTranslateSubtitleFile(options = {}) {
    const opts = asPlainObject(options);
    const nested = asPlainObject(opts.options);
    const sourcePath = asString(opts.sourcePath || opts.path, 4096).trim();
    const destPath = asString(opts.destPath || sourcePath, 4096).trim();
    if (!sourcePath) return { ok: false, error: '缺少字幕路径' };

    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    let doc;
    try {
        doc = readSubtitleDocument(sourcePath);
    } catch (err) {
        return { ok: false, error: err.message || '读取字幕失败', path: sourcePath };
    }
    if (!doc?.ok) return { ok: false, error: doc?.error || '读取字幕失败', path: sourcePath };
    if (!doc.cues?.length) {
        return { ok: true, skipped: true, path: destPath, summary: '无字幕条目' };
    }

    const result = await runSmartTranslate({
        cues: doc.cues.map((c, i) => ({
            index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text || '',
        })),
        chineseSubtitleVariant: opts.chineseSubtitleVariant ?? nested.chineseSubtitleVariant,
        targetLanguage: opts.targetLanguage ?? nested.targetLanguage,
        note: opts.note ?? nested.note,
        windowCues: opts.windowCues ?? nested.windowCues,
        overlapCues: opts.overlapCues ?? nested.overlapCues,
        smartTranslateFaithfulTone: !!(
            opts.smartTranslateFaithfulTone
            ?? opts.faithfulTone
            ?? nested.smartTranslateFaithfulTone
            ?? nested.faithfulTone
        ),
        dryRun: opts.dryRun ?? nested.dryRun,
        signal: opts.signal,
        onProgress: opts.onProgress,
        _batchMode: !!opts._batchMode,
    }, opts.event || null);

    if (!result?.ok) {
        return { ok: false, error: result?.error || '智能翻译失败', code: result?.code, path: sourcePath };
    }

    const map = new Map((result.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    let changed = 0;
    const nextCues = (doc.cues || []).map((c, i) => {
        const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
        if (!map.has(idx)) return { ...c };
        const text = map.get(idx);
        if (text !== c.text) changed += 1;
        return { ...c, text };
    });

    const written = writeSubtitleDocument(destPath, {
        format: doc.format,
        cues: nextCues,
    });
    if (!written?.ok) {
        return { ok: false, error: written?.error || '写回字幕失败', path: destPath };
    }

    return {
        ok: true,
        path: destPath,
        sourcePath,
        changed,
        summary: result.message || '智能翻译完成',
        stats: result.stats,
        via: result.via,
        llmSource: result.llmSource,
    };
}

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

async function runBatchContextReconstructJob(event, payload = {}) {
    const input = asPlainObject(payload);
    const filmMode = String(input.mode || input.reconstructMode || '').trim() === 'film';
    const gate = filmMode
        ? (requireFeature(entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT).ok
            ? requireFeature(entitlement.FEATURE_FILM_CONTEXT_RECONSTRUCT)
            : requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT))
        : requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
    if (!gate.ok) return gate;

    const files = Array.isArray(input.files) ? input.files : [];
    if (!files.length) {
        return { ok: false, error: '请选择至少一个字幕文件' };
    }

    const computeLock = require('./compute-task-lock');
    cancelContextReconstruct();
    await waitForComputeLockIdle();
    return computeLock.runWithComputeLock({
        kind: 'advanced_batch_reconstruct',
        owner: 'Pro',
        source: 'runBatchContextReconstructJob',
    }, () => runBatchContextReconstructJobLocked(event, payload));
}

async function runBatchContextReconstructJobLocked(event, payload = {}) {
    const input = asPlainObject(payload);
    const filmMode = String(input.mode || input.reconstructMode || '').trim() === 'film';
    const files = Array.isArray(input.files) ? input.files : [];

    batchAbortController = new AbortController();
    const signal = batchAbortController.signal;

    let glossary = null;
    try {
        const { readGlossary } = require('./glossary-data');
        const g = readGlossary();
        if (g?.ok && g.glossary) glossary = g.glossary;
        else if (g?.glossary) glossary = g.glossary;
        else if (g?.entries) glossary = g;
    } catch (_) { /* ignore */ }

    const { runBatchContextReconstruct } = require('./advanced-batch-reconstruct');
    const sendProgress = (info) => {
        const payloadOut = {
            mode: 'batch',
            reconstructMode: filmMode ? 'film' : 'basic',
            ...info,
        };
        try {
            event?.sender?.send?.('transub-advanced-batch-progress', payloadOut);
            event?.sender?.send?.('transub-advanced-reconstruct-progress', payloadOut);
        } catch (_) { /* ignore */ }
    };

    const runOne = filmMode ? runFilmContextReconstruct : runContextReconstruct;
    const label = filmMode ? '批量影片理解重构' : '批量语境重构';

    try {
        sendProgress({
            phase: 'start',
            fileIndex: 0,
            fileTotal: files.length,
            message: `${label}：共 ${files.length} 个文件`,
            pct: 0,
        });
        const result = await runBatchContextReconstruct(files, {
            glossary,
            options: {
                windowCues: input.windowCues,
                overlapCues: input.overlapCues,
                preserveTiming: input.preserveTiming,
                note: input.note,
                dryRun: input.dryRun,
                backupMode: input.backupMode || 'off',
                sceneGapMs: input.sceneGapMs,
                sceneMaxCues: input.sceneMaxCues,
                userNote: input.userNote,
            },
            signal,
            reconstructCues: (cuePayload) => runOne({
                ...cuePayload,
                signal,
                _batchMode: true,
                onProgress: (chunkInfo) => {
                    const fileLabel = cuePayload._fileName
                        ? `�?{cuePayload._fileName}」`
                        : `文件 ${cuePayload._fileIndex}/${files.length}`;
                    const baseMsg = chunkInfo.message || '';
                    sendProgress({
                        ...chunkInfo,
                        fileIndex: cuePayload._fileIndex,
                        fileTotal: files.length,
                        fileName: cuePayload._fileName,
                        message: baseMsg
                            ? `${fileLabel} ${baseMsg}`
                            : `${fileLabel} 处理中…`,
                    });
                },
            }),
            onProgress: (fileInfo) => {
                if (fileInfo.phase === 'file') {
                    const filePct = Math.round(((fileInfo.index - 1) / Math.max(1, fileInfo.total)) * 100);
                    sendProgress({
                        ...fileInfo,
                        fileIndex: fileInfo.index,
                        fileTotal: fileInfo.total,
                        fileName: fileInfo.name,
                        message: `文件 ${fileInfo.index}/${fileInfo.total}�?{fileInfo.name}`,
                        pct: filePct,
                    });
                } else {
                    sendProgress(fileInfo);
                }
            },
        });
        sendProgress({
            phase: result?.cancelled ? 'cancelled' : 'done',
            fileTotal: files.length,
            message: result?.summary || '批量完成',
            pct: result?.cancelled ? undefined : 100,
        });
        return result;
    } finally {
        batchAbortController = null;
        stopManagedLlmServerQuiet();
    }
}

function setupAdvancedBridge(api, deps = {}) {
    const { register } = api;
    windowManagerRef = deps.windowManager || null;
    const current = readAdvancedDoc();
    ensureByokLoaded(current.doc);
    syncMainWindowTitle();

    register('transub-advanced-get-status', async () => {
        const deviceId = getAdvancedDeviceId();
        const doc = readAdvancedDoc().doc;
        return { ok: true, status: publicStatus(doc, deviceId) };
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
        const activated = activateWithKey(redeemed.licenseKey, { transfer: false });
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

    register('transub-advanced-managed-llm-status', async () => getManagedLlmStatus());

    register('transub-advanced-managed-llm-select', async (_event, payload = {}) => (
        selectManagedModel(payload)
    ));

    register('transub-advanced-managed-llm-open-pick', async () => {
        // 独立选模窗口已移除；请在设置 → Pro → 大模型设置（软件内选模型）内选用/下载
        return { ok: true, removed: true, message: '请在大模型设置页内选用模型' };
    });

    register('transub-advanced-managed-llm-open-download', async (_event, payload = {}) => {
        // 下载管理窗口已移除；调用方应直接使用 pull / install-runtime
        const patch = asPlainObject(payload);
        const kind = String(patch.kind || 'model').trim() === 'runtime' ? 'runtime' : 'model';
        return { ok: true, removed: true, kind };
    });

    register('transub-advanced-managed-llm-download-info', async (_event, payload = {}) => (
        buildDownloadInfo(payload)
    ));

    register('transub-advanced-managed-llm-open-manual', async (_event, payload = {}) => (
        openManualDownload(payload)
    ));

    register('transub-advanced-managed-llm-open-folder', async (_event, payload = {}) => (
        openManagedFolder(payload)
    ));

    register('transub-advanced-managed-llm-verify-manual', async (_event, payload = {}) => (
        verifyManualPlacement(payload)
    ));

    register('transub-advanced-managed-llm-pull', async (event, payload = {}) => (
        pullManagedModelJob(event, payload)
    ));

    register('transub-advanced-managed-llm-install-runtime', async (event, payload = {}) => (
        installManagedRuntimeJob(event, payload)
    ));

    register('transub-advanced-managed-llm-set-runtime', async (_event, payload = {}) => (
        setManagedRuntimePreference(payload)
    ));

    register('transub-advanced-managed-llm-import-runtime', async (event, payload = {}) => (
        importManagedRuntimeJob(event, payload)
    ));

    register('transub-advanced-managed-llm-cancel-pull', async () => managedLlm.cancelManagedPull());

    register('transub-advanced-managed-llm-stop-server', async () => {
        const res = managedLlm.stopLlamaServer();
        const deviceId = getAdvancedDeviceId();
        const doc = readAdvancedDoc().doc;
        return {
            ok: true,
            ...res,
            status: publicStatus(doc, deviceId),
            managed: managedStatusForDoc(doc),
        };
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
}

module.exports = {
    setupAdvancedBridge,
    requireFeature,
    requireFilmAudioEnhance,
    requireSmartTranslate,
    runContextReconstruct,
    runFilmContextReconstruct,
    runBilingualSemanticReview,
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
