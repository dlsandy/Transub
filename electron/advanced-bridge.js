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
 * 本地验签 + 服务端设备硬限制（Worker KV）。
 * 开发解锁跳过服务端绑定。
 */
async function activateWithKey(licenseKey, { transfer = false } = {}) {
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
        expiresAt: verified.payload.expiresAt || null,
    });

    if (doc.license?.licenseId && doc.license.licenseId !== verified.payload.licenseId) {
        license.devices = [];
        license.lastTransferAt = null;
        license.activatedAt = null;
        license.lastValidatedAt = null;
    }

    if (shouldUseLicenseServer()) {
        const afdian = require('./advanced-afdian');
        const remote = transfer
            ? await afdian.transferLicenseDevice({ licenseKey: verified.key, deviceId, label })
            : await afdian.bindLicenseDevice({ licenseKey: verified.key, deviceId, label });
        if (!remote.ok) {
            return {
                ok: false,
                error: remote.error || (transfer ? '换机失败' : '激活失败'),
                code: remote.code,
                hint: remote.hint,
                retryAt: remote.retryAt,
                retryInMs: remote.retryInMs,
            };
        }
        license.devices = Array.isArray(remote.devices) ? remote.devices : license.devices;
        if (remote.lastTransferAt) license.lastTransferAt = remote.lastTransferAt;
        if (!license.activatedAt) license.activatedAt = new Date(now).toISOString();
        license = entitlement.markValidated(license, now);
        const saved = persistLicense(doc, license);
        if (!saved.ok) return { ok: false, error: saved.error };
        const status = publicStatus(saved.doc, deviceId);
        syncMainWindowTitle();
        try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
        return {
            ok: true,
            transferred: !!transfer && !!remote.transferred,
            alreadyBound: !!remote.alreadyBound,
            status,
            serverBound: true,
        };
    }

    // Offline / TRANSUB_LICENSE_SKIP_SERVER=1: local-only bind
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
    try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
    return {
        ok: true,
        transferred: !!transfer && !bindResult.alreadyBound,
        alreadyBound: !!bindResult.alreadyBound,
        status,
        serverBound: false,
    };
}

async function revalidateLicense() {
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
        // Persist expiresAt from a previously timed key so UI can show「体验已到期」even if crypto rejects.
        if (String(verified.error || '').includes('过期') && lic.expiresAt) {
            const status = publicStatus(doc, deviceId);
            return { ok: false, error: verified.error || '许可已过期', code: 'expired', status };
        }
        return { ok: false, error: verified.error || '许可无效' };
    }

    if (shouldUseLicenseServer()) {
        const afdian = require('./advanced-afdian');
        const remote = await afdian.revalidateLicenseDevice({
            licenseKey: verified.key,
            deviceId,
        });
        if (!remote.ok) {
            if (remote.code === 'device_unbound') {
                const unbound = entitlement.normalizeLicenseState({
                    ...lic,
                    features: verified.payload.features,
                    expiresAt: verified.payload.expiresAt || null,
                    devices: Array.isArray(remote.devices) ? remote.devices : [],
                    lastTransferAt: remote.lastTransferAt || lic.lastTransferAt,
                });
                const savedUnbound = persistLicense(doc, unbound);
                try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
                syncMainWindowTitle();
                return {
                    ok: false,
                    error: remote.error || '本机未绑定，请先激活或换机',
                    code: 'device_unbound',
                    status: publicStatus(savedUnbound.ok ? savedUnbound.doc : doc, deviceId),
                };
            }
            return {
                ok: false,
                error: remote.error || '联网复核失败',
                code: remote.code,
                status: publicStatus(doc, deviceId),
            };
        }
        const merged = entitlement.normalizeLicenseState({
            ...lic,
            features: verified.payload.features,
            expiresAt: verified.payload.expiresAt || null,
            devices: Array.isArray(remote.devices) ? remote.devices : lic.devices,
            lastTransferAt: remote.lastTransferAt || lic.lastTransferAt,
        });
        if (!entitlement.isDeviceBound(merged, deviceId)) {
            // Persist server view so local entitlement matches unbound state.
            const savedUnbound = persistLicense(doc, merged);
            try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
            syncMainWindowTitle();
            return {
                ok: false,
                error: '本机未绑定，请先激活或换机',
                code: 'device_unbound',
                status: publicStatus(savedUnbound.ok ? savedUnbound.doc : doc, deviceId),
            };
        }
        const license = entitlement.markValidated(merged, Date.now());
        const saved = persistLicense(doc, license);
        if (!saved.ok) return { ok: false, error: saved.error };
        syncMainWindowTitle();
        try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
        return { ok: true, status: publicStatus(saved.doc, deviceId), serverBound: true };
    }

    if (!entitlement.isDeviceBound(lic, deviceId)) {
        try { require('./tdp-runtime').clearAppliedOverlay(); } catch { /* ignore */ }
        return { ok: false, error: '本机未绑定，请先激活或换机', code: 'device_unbound' };
    }

    const license = entitlement.markValidated(
        entitlement.normalizeLicenseState({
            ...lic,
            features: verified.payload.features,
            expiresAt: verified.payload.expiresAt || null,
        }),
        Date.now(),
    );
    const saved = persistLicense(doc, license);
    if (!saved.ok) return { ok: false, error: saved.error };
    syncMainWindowTitle();
    try { require('./tdp-runtime').syncAppliedState(); } catch { /* ignore */ }
    return { ok: true, status: publicStatus(saved.doc, deviceId) };
}

async function deactivateLicense() {
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    const doc = current.doc;
    const prevKey = String(doc.license?.key || '').trim();

    if (prevKey && shouldUseLicenseServer()) {
        try {
            const afdian = require('./advanced-afdian');
            await afdian.unbindLicenseDevice({ licenseKey: prevKey, deviceId });
        } catch (_) { /* best-effort */ }
    }

    const license = entitlement.emptyLicenseState();
    const saved = persistLicense(doc, license);
    if (!saved.ok) return { ok: false, error: saved.error };
    try {
        require('./tdp-runtime').clearAppliedOverlay();
    } catch { /* ignore */ }
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
    // When installing without an explicit package, align preference to detected CUDA 12/13.
    if (!String(patch.runtimeId || patch.packageId || '').trim() && hints.preferCuda) {
        try {
            managedLlm.syncRuntimePreferenceToHardware({ force: true });
        } catch (_) { /* ignore */ }
    }
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
                || llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'cudart64_13.dll', 4)
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
                const probedTag = String(
                    runtime.installedTag
                    || managedLlm.probeLlamaServerTag?.(runtime.exePath)
                    || '',
                ).trim();
                llmFs.writeRuntimeMeta({
                    // 写入二进制真实构建号；探测失败才回退目录目标 tag
                    tag: probedTag || managedCatalog.LLAMA_CPP_TAG,
                    probedTag: probedTag || undefined,
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
 * QC 智能处理门控：qcSmartFix，或兼容 contextReconstruct / *。
 */
function requireQcSmartFix() {
    const primary = requireFeature(entitlement.FEATURE_QC_SMART_FIX);
    if (primary.ok) return primary;
    return requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
}

/**
 * QC 智能修复：规则修复 →（可选）局部重转写 → 语境重构润色 → 写回。
 * 重转写走引擎锁，LLM 润色走 Pro 锁，避免嵌套互斥。
 */
async function runQcSmartFix(payload = {}, event = null) {
    const gate = requireQcSmartFix();
    if (!gate.ok) return gate;

    const input = asPlainObject(payload);
    const prepared = await prepareQcSmartFixState(input, event);
    if (!prepared?.ok) return prepared;
    if (prepared.done) return prepared.result;

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLockUnlessNested({
        kind: 'advanced_qc_smart_fix',
        owner: 'Pro',
        source: 'runQcSmartFix',
    }, payload, () => finishQcSmartFixWithLlm(prepared, input, event));
}

function sendQcSmartProgress(event, input, info) {
    try {
        event?.sender?.send?.('transub-advanced-reconstruct-progress', {
            mode: 'qc-smart',
            ...info,
        });
    } catch (_) { /* ignore */ }
    if (typeof input.onProgress === 'function') {
        try { input.onProgress(info); } catch (_) { /* ignore */ }
    }
}

/**
 * LLM 智能断句（in-memory）：对高 CPS / 连续文本给出 breakIndices。
 */
async function runQcLlmSplitRequest(payload = {}, event = null) {
    const gate = requireQcSmartFix();
    if (!gate.ok) return gate;

    const input = asPlainObject(payload);
    const smartCore = require('../src/js/subtitle-qc-smart-core');
    const items = Array.isArray(input.cues) ? input.cues : [];
    if (!items.length) {
        return { ok: true, splits: [], skipped: true, summary: '无断句目标' };
    }

    const doc = readAdvancedDoc().doc;
    const dryRun = !!input.dryRun
        || !!doc.reconstructMock
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

    sendQcSmartProgress(event, input, {
        phase: 'llm-split',
        message: `智能断句 ${items.length} 条…`,
        pct: 20,
        targetCount: items.length,
    });

    if (dryRun) {
        const mocked = smartCore.mockLlmSplitCues(items);
        return {
            ok: true,
            splits: mocked.splits || [],
            via: 'mock',
            summary: `智能断句（模拟） ${mocked.splits?.length || 0} 条`,
        };
    }

    let llm;
    try {
        llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
        if (!llm.ok) return llm;
        logAdvancedLlmToEngine(llm, { feature: '智能断句' });
        const { chatCompletions } = require('./advanced-llm-client');
        const messages = smartCore.buildLlmSplitChatMessages(items);
        const res = await chatCompletions({
            apiKey: llm.apiKey,
            baseUrl: llm.baseUrl,
            model: llm.model,
            messages,
            temperature: 0.2,
            timeoutMs: 120000,
            signal: input.signal,
            disableThinking: true,
        });
        if (!res?.ok) return res;
        const content = res.content || res.text || res.message || '';
        const parsed = smartCore.parseLlmSplitResponse(
            content,
            items.map((c) => c.index),
        );
        if (!parsed.ok) return parsed;
        return {
            ok: true,
            splits: parsed.splits,
            via: llm.source || 'llm',
            llmSource: llm.source,
            summary: `智能断句 ${parsed.splits.length} 条`,
        };
    } finally {
        try {
            releaseManagedLlmAfterJob(llm, input);
        } catch (_) { /* ignore */ }
    }
}

async function runQcLlmSplitOnCues(cues, issues, input, event) {
    const smartCore = require('../src/js/subtitle-qc-smart-core');
    if (input.llmSplit === false) {
        return { cues, stats: { skipped: true, reason: 'disabled' } };
    }
    const targets = smartCore.selectQcLlmSplitTargets(issues, {
        maxTargets: Number(input.maxLlmSplitTargets) || smartCore.DEFAULT_MAX_LLM_SPLIT,
        types: input.llmSplitTypes,
    });
    if (!targets.length) {
        return {
            cues,
            stats: {
                skipped: true,
                reason: 'no_targets',
                plan: smartCore.summarizeQcLlmSplitPlan(targets),
            },
        };
    }

    const items = smartCore.buildQcLlmSplitPayload(cues, targets, {
        smartMaxChars: Number(input.smartMaxChars) || 20,
    });
    const computeLock = require('./compute-task-lock');
    const llmRes = await computeLock.runWithComputeLockUnlessNested({
        kind: 'advanced_qc_llm_split',
        owner: 'Pro',
        source: 'runQcLlmSplitOnCues',
    }, input, () => runQcLlmSplitRequest({
        ...input,
        cues: items,
    }, event));

    if (!llmRes?.ok) {
        return {
            cues,
            stats: {
                skipped: false,
                failed: true,
                error: llmRes?.error || '智能断句失败',
                plan: smartCore.summarizeQcLlmSplitPlan(targets),
            },
        };
    }

    const applied = smartCore.applyQcLlmSplitResults(cues, llmRes.splits || [], {
        targetCps: Number(input.targetCps) || 3,
        minSec: Number(input.minSec) || 0.5,
        useCpsTime: input.useCpsTime !== false,
    });

    if (applied.splitCount > 0) {
        const qc = require('../src/js/subtitle-qc-core');
        qc.applySmartAdjustToCues(applied.cues, {
            fixOverlap: true,
            fixCps: false,
            enforceMinDur: false,
            enforceMaxDur: false,
            gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
        });
    }

    return {
        cues: applied.cues,
        stats: {
            skipped: false,
            splitCount: applied.splitCount,
            added: applied.added,
            targetCount: targets.length,
            via: llmRes.via,
            plan: smartCore.summarizeQcLlmSplitPlan(targets, {
                maxTargets: Number(input.maxLlmSplitTargets) || smartCore.DEFAULT_MAX_LLM_SPLIT,
            }),
        },
    };
}

async function runQcSilenceSplitPhase(cues, input, event) {
    const qcSilenceSplit = require('./qc-silence-split');
    const maxChars = qcSilenceSplit.clampQcSilenceSplitChars(
        input.qcSilenceSplitChars ?? input.maxChars,
    );
    if (!(maxChars > 0)) {
        return { cues, stats: { skipped: true, reason: 'disabled', splitCount: 0, added: 0 } };
    }
    const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
    if (!mediaPath) {
        return { cues, stats: { skipped: true, reason: 'no_media', splitCount: 0, added: 0 } };
    }

    sendQcSmartProgress(event, input, {
        phase: 'silence-split',
        message: `超长句静音分割（>${maxChars} 字）…`,
        pct: 8,
    });

    const applied = await qcSilenceSplit.runQcSilenceSplitOnCues(cues, {
        mediaPath,
        maxChars,
        ffmpegPath: (() => {
            const fromInput = asString(input.ffmpegPath, 4096).trim();
            if (fromInput) return fromInput;
            try {
                const { loadSettings } = require('./settings-data');
                return String(loadSettings()?.options?.ffmpegPath || '').trim();
            } catch {
                return '';
            }
        })(),
        silenceDb: input.silenceDb,
        silenceDur: input.silenceDur,
        gapMs: input.gapMs,
        fixOverlap: input.fixOverlap !== false,
        onProgress: (info) => {
            sendQcSmartProgress(event, input, {
                phase: 'silence-split',
                message: `超长句静音分割 ${info.current}/${info.total}…`,
                pct: 8 + Math.min(12, Math.round((info.current / Math.max(1, info.total)) * 12)),
            });
        },
        signal: input.signal,
        isCancelled: input.isCancelled,
    });

    return {
        cues: applied.cues,
        stats: {
            ...applied.stats,
            summary: qcSilenceSplit.summarizeQcSilenceSplit(applied.stats),
        },
    };
}

async function loadLowConfidenceIndexesForQc(cues, input = {}) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return [];
    const explicit = Array.isArray(input.lowConfidenceIndexes)
        ? input.lowConfidenceIndexes
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length)
        : null;
    if (explicit) return [...new Set(explicit)].sort((a, b) => a - b);
    if (input.retranscribeLowConfidence === false) return [];

    const metaPath = asString(
        input.sourceSubtitlePath
            || input.pairPath
            || input.subtitlePath
            || input.path
            || input.subPath
            || '',
        4096,
    ).trim();
    if (!metaPath) return [];
    try {
        const { readSubtitleMeta } = require('./subtitle-meta');
        const metaCore = require('../src/js/subtitle-meta-core');
        const read = readSubtitleMeta(metaPath);
        if (!read?.ok || !read.meta) return [];
        const anns = typeof metaCore.mergeConfidenceAnnotations === 'function'
            ? metaCore.mergeConfidenceAnnotations(list, read.meta, {
                lowThreshold: input.lowConfidenceThreshold,
            })
            : [];
        return anns
            .map((a, i) => (a?.low ? i : -1))
            .filter((i) => i >= 0);
    } catch (_) {
        return [];
    }
}

async function runQcRetranscribeOnCues(cues, issues, input, event) {
    const smartCore = require('../src/js/subtitle-qc-smart-core');
    const meta = require('../src/js/subtitle-meta-core');
    const qc = require('../src/js/subtitle-qc-core');
    const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
    if (!mediaPath || input.retranscribeConnected === false) {
        return { cues, stats: { skipped: true, reason: mediaPath ? 'disabled' : 'no_media' } };
    }

    const lowConfidenceIndexes = await loadLowConfidenceIndexesForQc(cues, input);
    const merged = typeof smartCore.planMergedQcRetranscribeRanges === 'function'
        ? smartCore.planMergedQcRetranscribeRanges(cues, issues, lowConfidenceIndexes, {
            maxTargets: Number(input.maxRetranscribeTargets) || 24,
            maxRanges: Number(input.maxRetranscribeRanges) || smartCore.DEFAULT_MAX_RETRANSCRIBE_RANGES,
            maxDurationSec: Number(input.maxRetranscribeSec) || smartCore.DEFAULT_MAX_RANGE_SEC,
            mergeAdjacentGapMs: Number(input.mergeAdjacentGapMs) || smartCore.DEFAULT_MERGE_GAP_MS,
        })
        : null;
    const ranges = merged?.ranges || (() => {
        const targets = smartCore.selectQcRetranscribeTargets(issues, {
            maxTargets: Number(input.maxRetranscribeTargets) || 24,
        });
        return smartCore.buildQcRetranscribeRanges(cues, targets.map((t) => t.index), {
            maxRanges: Number(input.maxRetranscribeRanges) || smartCore.DEFAULT_MAX_RETRANSCRIBE_RANGES,
            maxDurationSec: Number(input.maxRetranscribeSec) || smartCore.DEFAULT_MAX_RANGE_SEC,
            mergeAdjacentGapMs: Number(input.mergeAdjacentGapMs) || smartCore.DEFAULT_MERGE_GAP_MS,
        });
    })();
    const planText = merged?.plan
        || smartCore.summarizeQcRetranscribePlan(ranges);
    if (!ranges.length) {
        return {
            cues,
            stats: {
                skipped: true,
                reason: 'no_ranges',
                plan: planText,
                lowConfidenceCueCount: lowConfidenceIndexes.length,
            },
        };
    }

    let working = cues;
    let okCount = 0;
    let failCount = 0;
    let replaced = 0;
    const { transcribeRangeWithEngine } = require('./engine-bridge');

    for (let i = 0; i < ranges.length; i += 1) {
        const range = ranges[i];
        sendQcSmartProgress(event, input, {
            phase: 'retranscribe',
            message: `局部重转写 ${i + 1}/${ranges.length}…`,
            pct: Math.round(8 + (i / Math.max(1, ranges.length)) * 22),
            range: i + 1,
            totalRanges: ranges.length,
        });
        try {
            const res = await transcribeRangeWithEngine({
                mediaPath,
                startMs: range.startMs,
                endMs: range.endMs,
                padMs: Number(input.padMs) >= 0 ? Number(input.padMs) : smartCore.DEFAULT_PAD_MS,
                subtitlePath: asString(
                    input.subtitlePath || input.sourceSubtitlePath || input.subPath || input.path || '',
                    4096,
                ).trim(),
                options: { task: 'transcribe', mergeSegments: false, subFormats: 'srt' },
            }, {
                onProgress: (info) => sendQcSmartProgress(event, input, {
                    phase: 'retranscribe',
                    message: info?.detail || info?.message || `局部重转写 ${i + 1}/${ranges.length}`,
                    pct: Math.round(8 + ((i + 0.5) / Math.max(1, ranges.length)) * 22),
                    stage: info?.stage,
                }),
            });
            if (!res?.ok || !Array.isArray(res.cues)) {
                failCount += 1;
                const why = String(res?.error || '重转写失败').trim();
                try {
                    console.warn(`[qc-smart] 局部重转写 ${i + 1}/${ranges.length} 失败: ${why}`);
                } catch { /* ignore */ }
                continue;
            }
            const replacedDoc = meta.replaceCuesInTimeRange(
                working,
                range.startMs,
                range.endMs,
                res.cues,
            );
            working = replacedDoc.cues;
            replaced += Number(replacedDoc.replaced) || 0;
            okCount += 1;
        } catch (err) {
            failCount += 1;
            try {
                console.warn(
                    `[qc-smart] 局部重转写 ${i + 1}/${ranges.length} 异常: ${err?.message || err}`,
                );
            } catch { /* ignore */ }
        }
    }

    if (okCount > 0) {
        const adj = qc.applySmartAdjustToCues(working, {
            fixOverlap: true,
            fixCps: false,
            enforceMinDur: false,
            enforceMaxDur: false,
            gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
        });
        void adj;
    }

    return {
        cues: working,
        stats: {
            skipped: false,
            okCount,
            failCount,
            replaced,
            rangeCount: ranges.length,
            plan: planText,
            connectedCueCount: merged?.connectedIndexes?.length || 0,
            lowConfidenceCueCount: merged?.lowConfidenceIndexes?.length || lowConfidenceIndexes.length,
            indexes: merged?.indexes || ranges.flatMap((r) => r.indexes || []),
        },
    };
}

function resolveQcSmartProfile(input = {}) {
    const contentProfile = (() => {
        try { return require('../src/js/content-profile-core'); } catch { return null; }
    })();
    const explicit = asString(input.profile, 64).trim();
    if (explicit) return { profile: explicit, contentProfile };
    const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
    if (mediaPath && contentProfile?.classifyContentProfile) {
        try {
            const c = contentProfile.classifyContentProfile({ path: mediaPath });
            if (c?.profile) return { profile: c.profile, contentProfile };
        } catch (_) { /* ignore */ }
    }
    return { profile: 'unknown', contentProfile };
}

/**
 * QC 联动：对问题条做双语语义审阅，可选采纳 suggestedTarget。
 */
async function runQcSemanticReviewOnCues(cues, issues, input, event, extra = {}) {
    const smartCore = require('../src/js/subtitle-qc-smart-core');
    const pairCues = Array.isArray(input.pairCues) ? input.pairCues : [];
    if (!pairCues.length) return { ok: true, skipped: true, reason: 'no_pair' };

    let dualApi = null;
    try {
        dualApi = require('../src/js/dual-subtitle-core');
    } catch (_) { /* optional */ }

    const blankPrefer = smartCore.collectBlankEllipsisIndexes(cues, pairCues, {
        findBestOverlapCue: dualApi?.findBestOverlapCue || null,
        maxIndexes: input.maxSemanticPairs || 40,
    });
    const mergedIssues = smartCore.mergeBlankEllipsisIssues(cues, issues, {
        blankIndexes: blankPrefer,
        pairCues,
        findBestOverlapCue: dualApi?.findBestOverlapCue || null,
    });
    const indexes = smartCore.selectQcSemanticIndexes(mergedIssues, {
        maxPairs: input.maxSemanticPairs || 40,
        preferIndexes: extra.preferIndexes,
        blankPreferIndexes: blankPrefer,
    });
    if (!indexes.length) return { ok: true, skipped: true, reason: 'no_targets' };

    const pairs = smartCore.buildQcSemanticPairs(cues, pairCues, indexes, dualApi);
    if (!pairs.length) return { ok: true, skipped: true, reason: 'empty_pairs' };

    const blankInBatch = indexes.filter((i) => blankPrefer.includes(i)).length;
    sendQcSmartProgress(event, input, {
        phase: 'semantic',
        message: blankInBatch
            ? `语义审阅 ${pairs.length} 条（含空/省略补译 ${blankInBatch}）…`
            : `语义审阅 ${pairs.length} 条…`,
        pct: 88,
    });

    const review = await runBilingualSemanticReviewBody({
        pairs,
        note: [
            input.semanticNote || smartCore.QC_SEMANTIC_NOTE || '',
            blankInBatch
                ? '其中含空/省略号译文：请根据原文给出可直接替换的 suggestedTarget，勿留「…」。'
                : '',
        ].filter(Boolean).join(''),
        suggestFixes: input.suggestSemanticFixes !== false,
        dryRun: input.dryRun,
        signal: input.signal,
        _keepManagedServer: input._keepManagedServer,
        maxPairs: input.maxSemanticPairs || 40,
    }, event);

    if (!review?.ok) {
        return {
            ok: false,
            skipped: false,
            error: review?.error || '语义审阅失败',
            code: review?.code,
            cues,
            changed: 0,
        };
    }

    const issueList = Array.isArray(review.issues) ? review.issues : [];
    const autoApply = input.autoApplySemantic !== false;
    let next = cues;
    let changed = 0;
    let changedIndexes = [];
    if (autoApply && issueList.some((it) => it.suggestedTarget)) {
        const applied = smartCore.applyQcSemanticSuggestions(cues, issueList);
        next = applied.cues;
        changed = applied.changed;
        changedIndexes = applied.changedIndexes;
    }

    return {
        ok: true,
        skipped: false,
        cues: next,
        changed,
        changedIndexes,
        issueCount: issueList.length,
        suggestions: issueList.filter((it) => it.suggestedTarget).length,
        blankPreferCount: blankPrefer.length,
        blankFilled: changedIndexes.filter((i) => blankPrefer.includes(i)).length,
        issues: issueList,
        summary: review.summary,
        via: review.via,
    };
}

/** 批次内复用同一原文轨，避免每个译文文件都重读盘 */
const qcPairCueCache = new Map();
const QC_PAIR_CACHE_MAX = 12;

function loadQcPairCuesFromInput(input) {
    if (Array.isArray(input.pairCues) && input.pairCues.length) {
        return {
            pairCues: input.pairCues.map((c) => ({
                startMs: c?.startMs,
                endMs: c?.endMs,
                text: c?.text ?? '',
            })),
            pairPath: asString(input.pairPath || input.sourcePath, 4096).trim() || null,
        };
    }
    const pairPath = asString(input.pairPath || input.sourcePath, 4096).trim();
    if (!pairPath) return { pairCues: [], pairPath: '' };
    const cached = qcPairCueCache.get(pairPath);
    if (cached) return { pairPath, pairCues: cached };
    try {
        const { readSubtitleDocument } = require('./extensions-bridge');
        const doc = readSubtitleDocument(pairPath);
        if (!doc?.ok || !Array.isArray(doc.cues)) return { pairCues: [], pairPath };
        const pairCues = doc.cues.map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text ?? '',
        }));
        if (qcPairCueCache.size >= QC_PAIR_CACHE_MAX) {
            const oldest = qcPairCueCache.keys().next().value;
            if (oldest != null) qcPairCueCache.delete(oldest);
        }
        qcPairCueCache.set(pairPath, pairCues);
        return { pairPath, pairCues };
    } catch (_) {
        return { pairCues: [], pairPath };
    }
}

async function prepareQcSmartFixState(input, event) {
    const filePath = asString(input.path || input.filePath, 4096).trim();
    if (!filePath) return { ok: false, error: '缺少字幕路径' };

    const smartCore = require('../src/js/subtitle-qc-smart-core');
    const qc = require('../src/js/subtitle-qc-core');
    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    const { profile, contentProfile } = resolveQcSmartProfile(input);
    const pairLoaded = loadQcPairCuesFromInput(input);
    if (pairLoaded.pairCues.length) {
        input.pairCues = pairLoaded.pairCues;
        if (pairLoaded.pairPath) input.pairPath = pairLoaded.pairPath;
        // 有对照轨时默认开启语义审阅（画像 unknown 的 false 会被这里抬起）
        if (input.semanticReview == null) input.semanticReview = true;
    }
    const merged = contentProfile?.mergeQcOptsWithProfile
        ? contentProfile.mergeQcOptsWithProfile(input, profile)
        : { ...input };
    // 回写画像填充后的字段，供后续润色 / 语义阶段使用
    Object.assign(input, {
        profile,
        maxCps: merged.maxCps,
        removeNoise: merged.removeNoise,
        removeDuplicates: merged.removeDuplicates,
        compressRepetition: merged.compressRepetition,
        llmSplit: merged.llmSplit,
        retranscribeConnected: merged.retranscribeConnected,
        intensity: merged.intensity,
        maxSmartCues: merged.maxSmartCues,
        maxLlmSplitTargets: merged.maxLlmSplitTargets,
        semanticReview: pairLoaded.pairCues.length
            ? (merged.semanticReview !== false)
            : !!merged.semanticReview,
    });

    let doc;
    try {
        doc = readSubtitleDocument(filePath);
    } catch (err) {
        return { ok: false, error: err.message || '读取字幕失败', path: filePath };
    }
    if (!doc?.ok) return { ok: false, error: doc?.error || '读取字幕失败', path: filePath };

    let cues = Array.isArray(doc.cues) ? doc.cues.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text ?? '',
    })) : [];
    if (!cues.length) {
        return {
            ok: true,
            done: true,
            result: { ok: true, skipped: true, path: filePath, summary: '无字幕条目' },
        };
    }

    const ruleOpts = {
        fixOverlap: input.fixOverlap !== false,
        fixCpsBySplit: input.fixCpsBySplit !== false,
        fixCpsByExtend: input.fixCpsByExtend !== false,
        enforceMinDur: input.enforceMinDur !== false,
        enforceMaxDur: input.enforceMaxDur !== false,
        fixInvalid: input.fixInvalid !== false,
        compressRepetition: input.compressRepetition !== false,
        removeNoise: input.removeNoise !== false,
        removeDuplicates: input.removeDuplicates !== false,
        removeHallucinations: input.removeHallucinations !== false,
        // Default: delete noise. Opt-in blank mode only when explicitly requested;
        // batch postprocess pairs JA↔ZH deletions to keep cue counts aligned.
        blankInsteadOfRemove: input.blankInsteadOfRemove === true,
        maxCps: Number(input.maxCps) || 18,
        maxSec: Number(input.maxSec) || 10,
        gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
        smartMaxChars: Number(input.smartMaxChars) || 20,
        smartLineChars: Number(input.smartLineChars) || 18,
        targetCps: Number(input.targetCps) || 3,
    };

    const structuralScanOpts = { ...ruleOpts, checkFluency: false };

    let ruleResult = null;
    /** @type {{ issues: any[], summary: any }|null} */
    let workingScan = null;
    let scanIsFull = false;

    if (input.skipRuleFix !== true) {
        sendQcSmartProgress(event, input, {
            phase: 'rule',
            message: '规则修复中…',
            pct: 3,
        });
        ruleResult = qc.applyQcFixes(cues, ruleOpts);
        cues = ruleResult.cues;
        if (ruleResult.scan) {
            workingScan = ruleResult.scan;
            scanIsFull = true;
        }
    }
    if (!workingScan) {
        workingScan = qc.scanCueIssues(cues, ruleOpts);
        scanIsFull = true;
    }

    let silenceSplit = { stats: { skipped: true } };
    if (input.silenceSplit !== false) {
        // Resolve threshold from input or saved options (default 15)
        if (input.qcSilenceSplitChars == null && input.maxChars == null) {
            try {
                const { loadSettings } = require('./settings-data');
                const saved = loadSettings()?.options || {};
                if (saved.qcSilenceSplitChars != null) {
                    input.qcSilenceSplitChars = saved.qcSilenceSplitChars;
                }
            } catch (_) { /* keep default via clamp */ }
        }
        silenceSplit = await runQcSilenceSplitPhase(cues, input, event);
        cues = silenceSplit.cues;
        if (silenceSplit?.stats && !silenceSplit.stats.skipped && silenceSplit.stats.splitCount > 0) {
            workingScan = qc.scanCueIssues(cues, structuralScanOpts);
            scanIsFull = false;
        }
    }

    let llmSplit = { stats: { skipped: true } };
    let retranscribe = { stats: { skipped: true } };
    if (input.llmSplit !== false) {
        llmSplit = await runQcLlmSplitOnCues(cues, workingScan.issues, input, event);
        cues = llmSplit.cues;
        if (llmSplit?.stats && !llmSplit.stats.skipped && llmSplit.stats.splitCount > 0) {
            // 断句改索引：重转写只需结构类问题，跳过通顺度
            workingScan = qc.scanCueIssues(cues, structuralScanOpts);
            scanIsFull = false;
        }
    }
    if (input.retranscribeConnected !== false && asString(input.mediaPath || input.videoPath, 4096).trim()) {
        retranscribe = await runQcRetranscribeOnCues(cues, workingScan.issues, input, event);
        cues = retranscribe.cues;
        if (retranscribe?.stats && !retranscribe.stats.skipped && retranscribe.stats.okCount > 0) {
            workingScan = qc.scanCueIssues(cues, ruleOpts);
            scanIsFull = true;
        }
    }
    // 润色目标需要 fluency / 怪句；若上一趟是结构扫则补一次完整扫
    if (!scanIsFull) {
        workingScan = qc.scanCueIssues(cues, ruleOpts);
        scanIsFull = true;
    }

    const beforeSmartScan = {
        ...workingScan,
        issues: smartCore.mergeWeirdTextIssues(cues, workingScan.issues),
    };
    const targets = smartCore.selectQcSmartTargets(beforeSmartScan.issues, {
        maxSmartCues: input.maxSmartCues,
        types: input.smartTypes,
    });

    const changedByRule = !!(ruleResult?.stats?.affected);
    const changedBySilenceSplit = !!(silenceSplit?.stats && !silenceSplit.stats.skipped && silenceSplit.stats.splitCount > 0);
    const changedByLlmSplit = !!(llmSplit?.stats && !llmSplit.stats.skipped && llmSplit.stats.splitCount > 0);
    const changedByRetranscribe = !!(retranscribe?.stats && !retranscribe.stats.skipped && retranscribe.stats.okCount > 0);

    const wantSemantic = !!(input.semanticReview && Array.isArray(input.pairCues) && input.pairCues.length);

    if (!targets.length && !wantSemantic) {
        const remainingText = typeof qc.summarizeRemaining === 'function'
            ? qc.summarizeRemaining(beforeSmartScan.summary)
            : '';
        const parts = [];
        if (ruleResult?.summary) parts.push(ruleResult.summary);
        {
            const ss = silenceSplit?.stats;
            if (ss?.summary && (!ss.skipped || ss.reason === 'no_media' || (ss.skipNoSilence > 0))) {
                parts.push(ss.summary);
            } else if (ss?.splitCount) {
                parts.push(`超长句静音分割 ${ss.splitCount} 条(+${ss.added || 0})`);
            }
        }
        if (llmSplit?.stats?.splitCount) {
            parts.push(`智能断句 ${llmSplit.stats.splitCount} 条(+${llmSplit.stats.added || 0})`);
        }
        if (retranscribe?.stats?.plan && !retranscribe.stats.skipped) {
            const failN = Number(retranscribe.stats.failCount) || 0;
            parts.push(
                failN > 0
                    ? `局部重转写 ${retranscribe.stats.okCount}/${retranscribe.stats.rangeCount} 窗（失败 ${failN}）`
                    : `局部重转写 ${retranscribe.stats.okCount}/${retranscribe.stats.rangeCount} 窗`,
            );
        } else if (retranscribe?.stats?.skipped && retranscribe.stats.reason === 'disabled') {
            parts.push('已跳过局部重转写');
        }
        parts.push('无需智能润色');
        if (remainingText) parts.push(remainingText);

        if (changedByRule || changedBySilenceSplit || changedByLlmSplit || changedByRetranscribe || cues.length !== doc.cues.length) {
            const written = writeSubtitleDocument(filePath, {
                cues,
                format: doc.format,
                header: doc.header,
                backupMode: input.backupMode || 'off',
            });
            if (!written.ok) return written;
            return {
                ok: true,
                done: true,
                result: {
                    ok: true,
                    path: filePath,
                    written: true,
                    smartSkipped: true,
                    profile,
                    rule: ruleResult,
                    silenceSplit: silenceSplit.stats,
                    llmSplit: llmSplit.stats,
                    retranscribe: retranscribe.stats,
                    remaining: beforeSmartScan.summary,
                    summary: parts.join('；'),
                },
            };
        }
        return {
            ok: true,
            done: true,
            result: {
                ok: true,
                path: filePath,
                written: false,
                smartSkipped: true,
                profile,
                rule: ruleResult,
                silenceSplit: silenceSplit.stats,
                llmSplit: llmSplit.stats,
                retranscribe: retranscribe.stats,
                remaining: beforeSmartScan.summary,
                summary: parts.join('；'),
            },
        };
    }

    return {
        ok: true,
        done: false,
        filePath,
        doc,
        cues,
        ruleOpts,
        ruleResult,
        silenceSplit: silenceSplit.stats,
        llmSplit: llmSplit.stats,
        retranscribe: retranscribe.stats,
        beforeSmartScan,
        targets,
        profile,
        skipPolish: !targets.length,
        changedByRule,
        changedBySilenceSplit,
        changedByLlmSplit,
        changedByRetranscribe,
    };
}

async function finishQcSmartFixWithLlm(prepared, input, event) {
    const smartCore = require('../src/js/subtitle-qc-smart-core');
    const qc = require('../src/js/subtitle-qc-core');
    const { writeSubtitleDocument } = require('./extensions-bridge');

    let cues = prepared.cues;
    const { filePath, doc, ruleOpts, ruleResult, targets, beforeSmartScan } = prepared;
    const targetIndexes = (Array.isArray(targets) ? targets : []).map((t) => t.index);
    let applied = { changed: 0, changedIndexes: [] };
    let recon = { ok: true, via: 'skipped', llmSource: '' };

    if (!prepared.skipPolish && targetIndexes.length) {
        const payloadIndexes = smartCore.expandIndexesWithNeighbors(
            targetIndexes,
            cues.length,
            input.neighborRadius,
        );
        const reconstructOpts = smartCore.buildQcSmartReconstructOptions(input);
        const cuePayload = smartCore.buildQcSmartCuePayload(cues, payloadIndexes);

        sendQcSmartProgress(event, input, {
            phase: 'start',
            message: `QC 智能润色 ${targets.length} 条…`,
            pct: 35,
            targetCount: targets.length,
        });

        recon = await runContextReconstructBody({
            cues: cuePayload,
            preserveTiming: reconstructOpts.preserveTiming,
            intensity: reconstructOpts.intensity,
            windowCues: reconstructOpts.windowCues,
            note: reconstructOpts.note,
            userNote: reconstructOpts.userNote,
            dryRun: input.dryRun,
            signal: input.signal,
            _keepManagedServer: input._keepManagedServer,
            _llmLogFeature: 'QC智能润色',
            onProgress: (info) => {
                sendQcSmartProgress(event, input, {
                    ...info,
                    targetCount: targets.length,
                });
            },
        }, event);

        if (!recon?.ok) {
            if (prepared.changedByRule || prepared.changedBySilenceSplit
                || prepared.changedByLlmSplit || prepared.changedByRetranscribe) {
                const written = writeSubtitleDocument(filePath, {
                    cues,
                    format: doc.format,
                    header: doc.header,
                    backupMode: input.backupMode || 'off',
                });
                return {
                    ok: false,
                    error: recon?.error || 'QC 智能处理失败',
                    code: recon?.code,
                    path: filePath,
                    ruleWritten: !!written?.ok,
                    rule: ruleResult,
                    silenceSplit: prepared.silenceSplit,
                    llmSplit: prepared.llmSplit,
                    retranscribe: prepared.retranscribe,
                };
            }
            return {
                ok: false,
                error: recon?.error || 'QC 智能处理失败',
                code: recon?.code,
                path: filePath,
            };
        }

        const updates = Array.isArray(recon.cues) ? recon.cues : [];
        applied = smartCore.applyQcSmartUpdates(cues, updates, {
            allowIndexes: targetIndexes,
        });
        cues = applied.cues;

        // Light domain-safe pin after LLM polish so weird cleanup cannot undo sanitize remaps.
        if (applied.changed > 0 && Array.isArray(applied.changedIndexes) && applied.changedIndexes.length) {
            try {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                const pairCues = Array.isArray(input.pairCues) ? input.pairCues : [];
                const dual = (() => {
                    try { return require('../src/js/dual-subtitle-core'); } catch { return null; }
                })();
                let pinChanged = 0;
                for (const idx of applied.changedIndexes) {
                    const cue = cues[idx];
                    if (!cue) continue;
                    let sourceText = '';
                    if (pairCues.length && dual?.findBestOverlapCue) {
                        try {
                            const hit = dual.findBestOverlapCue(
                                pairCues,
                                Number(cue.startMs) || 0,
                                cue.endMs != null
                                    ? Number(cue.endMs)
                                    : (Number(cue.startMs) || 0) + 2000,
                            );
                            sourceText = String(hit?.cue?.text || '');
                        } catch { /* ignore */ }
                    }
                    const before = String(cue.text ?? '');
                    const sanitized = mtSanitize.sanitizeMtCueText(before, sourceText, {
                        faithfulTone: input.faithfulTone,
                        adultLexicon: input.adultLexicon,
                    });
                    const after = String(sanitized?.text ?? before);
                    if (after !== before) {
                        cues[idx] = { ...cue, text: after };
                        pinChanged += 1;
                    }
                }
                if (pinChanged > 0) {
                    applied = {
                        ...applied,
                        changed: applied.changedIndexes.length,
                        pinSanitized: pinChanged,
                    };
                }
            } catch (_) { /* optional pin */ }
        }
    }

    let workingScan = prepared.beforeSmartScan;
    let semantic = { skipped: true };
    if (input.semanticReview && Array.isArray(input.pairCues) && input.pairCues.length) {
        if (applied.changed > 0) {
            workingScan = qc.scanCueIssues(cues, ruleOpts);
        }
        semantic = await runQcSemanticReviewOnCues(
            cues,
            workingScan.issues,
            input,
            event,
            { preferIndexes: applied.changedIndexes || targetIndexes },
        );
        if (semantic?.ok && !semantic.skipped) {
            cues = semantic.cues;
        }
    }

    const semanticChanged = !!(semantic?.ok && semantic.changed > 0);
    // 润色后已刷新 workingScan；仅语义写回时再扫
    const afterScan = semanticChanged
        ? qc.scanCueIssues(cues, ruleOpts)
        : workingScan;
    const remainingText = typeof qc.summarizeRemaining === 'function'
        ? qc.summarizeRemaining(afterScan.summary)
        : '';
    const shouldWrite = applied.changed > 0
        || prepared.changedByRule
        || prepared.changedBySilenceSplit
        || prepared.changedByLlmSplit
        || prepared.changedByRetranscribe
        || semanticChanged
        || cues.length !== doc.cues.length;

    const parts = [];
    if (ruleResult?.summary) parts.push(ruleResult.summary);
    {
        const ss = prepared.silenceSplit;
        if (ss?.summary && (!ss.skipped || ss.reason === 'no_media' || (ss.skipNoSilence > 0))) {
            parts.push(ss.summary);
        } else if (ss?.splitCount) {
            parts.push(`超长句静音分割 ${ss.splitCount} 条(+${ss.added || 0})`);
        }
    }
    if (prepared.llmSplit?.splitCount) {
        parts.push(`智能断句 ${prepared.llmSplit.splitCount} 条(+${prepared.llmSplit.added || 0})`);
    }
    if (prepared.retranscribe && !prepared.retranscribe.skipped) {
        const failN = Number(prepared.retranscribe.failCount) || 0;
        const okN = Number(prepared.retranscribe.okCount) || 0;
        const totalN = Number(prepared.retranscribe.rangeCount) || 0;
        if (okN > 0 || failN > 0) {
            parts.push(
                failN > 0
                    ? `局部重转写 ${okN}/${totalN} 窗（失败 ${failN}）`
                    : `局部重转写 ${okN}/${totalN} 窗`,
            );
        }
    } else if (prepared.retranscribe?.skipped && prepared.retranscribe.reason === 'disabled') {
        parts.push('已跳过局部重转写');
    }
    if (!prepared.skipPolish && targetIndexes.length) {
        parts.push(`智能润色 ${applied.changed}/${targets.length} 条`);
    } else if (prepared.skipPolish) {
        parts.push('无需智能润色');
    }
    if (semanticChanged) {
        parts.push(`语义采纳 ${semantic.changed}/${semantic.suggestions || semantic.changed} 条`);
        if (Number(semantic.blankFilled) > 0) {
            parts.push(`空/省略补译 ${semantic.blankFilled}`);
        }
    } else if (semantic?.ok && semantic.issueCount) {
        parts.push(`语义审阅 ${semantic.issueCount} 处`);
    } else if (semantic && !semantic.ok && !semantic.skipped) {
        parts.push(semantic.error || '语义审阅失败');
    }
    if (remainingText) parts.push(remainingText);

    if (!shouldWrite) {
        return {
            ok: true,
            path: filePath,
            written: false,
            smartChanged: 0,
            targets: targets.length,
            profile: prepared.profile,
            rule: ruleResult,
            silenceSplit: prepared.silenceSplit,
            llmSplit: prepared.llmSplit,
            retranscribe: prepared.retranscribe,
            semantic,
            remaining: afterScan.summary,
            summary: '智能处理无文本变更',
            via: recon.via,
            llmSource: recon.llmSource,
        };
    }

    const written = writeSubtitleDocument(filePath, {
        cues,
        format: doc.format,
        header: doc.header,
        backupMode: input.backupMode || 'off',
    });
    if (!written.ok) return written;

    sendQcSmartProgress(event, input, {
        phase: 'done',
        message: 'QC 智能处理完成',
        pct: 100,
        changed: applied.changed + (semantic.changed || 0),
    });

    return {
        ok: true,
        path: filePath,
        written: true,
        smartChanged: applied.changed,
        changedIndexes: applied.changedIndexes,
        targets: targets.length,
        targetIndexes,
        profile: prepared.profile,
        rule: ruleResult,
        silenceSplit: prepared.silenceSplit,
        llmSplit: prepared.llmSplit,
        retranscribe: prepared.retranscribe,
        semantic,
        beforeSmart: beforeSmartScan.summary,
        remaining: afterScan.summary,
        remainingText,
        summary: parts.join('；'),
        via: recon.via,
        llmSource: recon.llmSource,
        plan: smartCore.summarizeQcSmartPlan(targets, { maxSmartCues: input.maxSmartCues }),
    };
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
    // Disk setting is source of truth when editor omitted briefSampleMode (separate BrowserWindow).
    if (!input.briefSampleMode && !input.briefUseFullText && !input.useFullText) {
        try {
            const { loadSettings } = require('./settings-data');
            const mode = String(loadSettings()?.options?.filmBriefSampleMode || '').trim().toLowerCase();
            if (mode === 'full' || mode === 'auto') input.briefSampleMode = mode;
        } catch (_) { /* ignore */ }
    }
    const doc = readAdvancedDoc().doc;
    const dryRun = !!input.dryRun
        || !!doc.reconstructMock
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
        || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

    let llm = { ok: true, apiKey: '', baseUrl: '', model: '', source: 'mock' };

    try {
        if (!dryRun) {
            clearManagedIdleStopTimer();
            llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
            if (!llm.ok) return llm;
            logAdvancedLlmToEngine(llm, { feature: '影片理解' });
            // Keep llama-server alive for the whole multi-step film job.
            clearManagedIdleStopTimer();
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
        // Unpackaged (npm start): always use live electron/ sources so Brief/local-LLM
        // fixes apply without rebuilding `_advanced`. Packaged installs keep the closed blob.
        const useClosedFilm = isAppPackaged()
            && modLoad.loaded
            && typeof modLoad.module.filmContextReconstruct === 'function';
        if (useClosedFilm) {
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
            return missingClosedModuleError('影片理解重构', modLoad.error || modLoad.message);
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
        } catch (_) {
            input.smartTranslateHybridMt = true;
        }
    }
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
    const gate = requireSmartTranslate({ faithfulTone });
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
                const skipBrief = hybrid.shouldSkipLlmFilmBrief({
                    enabled: input.smartTranslateHybridMt,
                    language: input.language || input.sourceLanguage,
                    cues: input.cues,
                    hybridMtModelId: input.hybridMtModelId,
                    engineLlmMtModel: input.engineLlmMtModel,
                    llmSource,
                    hasByokKey,
                    filmBrief: input.filmBrief,
                    skipFilmBrief: input.skipFilmBrief,
                });
                if (skipBrief) {
                    input.skipFilmBrief = true;
                    input._hybridSkipLlmBrief = true;
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
            } else {
                const overrideId = String(
                    input.modelId || input.smartTranslateModelId || '',
                ).trim();
                if (overrideId) {
                    const block = managedCatalog.getSmartTranslateModelBlock?.(overrideId)
                        || null;
                    if (block?.ok === false) return block;
                    smartChoice = {
                        modelId: overrideId,
                        requestedId: overrideId,
                        fallbackFrom: '',
                    };
                } else {
                    smartChoice = managedCatalog.resolveSmartTranslateModelChoice(doc.managedLlm);
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
                const hybridChunk = typeof hybrid.decideHybridChunkMt === 'function'
                    ? hybrid.decideHybridChunkMt({
                        enabled: input.smartTranslateHybridMt,
                        language: input.language || input.sourceLanguage,
                        cues: input.cues,
                        preferredId: input.hybridMtModelId || input.engineLlmMtModel,
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
                const smartModelId = smartChoice.modelId;
                llm = await resolveAdvancedLlmConfig(doc, {
                    activeModelId: smartModelId || undefined,
                    requireSmartTranslateCapable: true,
                });
                if (!llm.ok && llm.code === 'byok_missing' && smartModelId) {
                    llm = await resolveAdvancedLlmConfig({ ...doc, llmSource: 'managed' }, {
                        activeModelId: smartModelId,
                        requireSmartTranslateCapable: true,
                    });
                    if (llm.ok && !smartChoice.missingFallbackFrom) {
                        smartChoice.missingFallbackFrom = 'byok';
                    }
                }
                if (!llm.ok) return llm;
                logAdvancedLlmToEngine(llm, { feature: '智能翻译' });
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
            sendProgress({
                phase: 'start',
                message: `智能翻译模型「${smartChoice.fallbackFrom}」为翻译专用，已改用「${smartChoice.modelId || llm.modelId || llm.model}」`,
                pct: 0,
                modelFallback: true,
                fallbackFrom: smartChoice.fallbackFrom,
                modelId: smartChoice.modelId,
            });
        }
        if (smartChoice.briefDownshiftFrom) {
            sendProgress({
                phase: 'start',
                message: `混合翻译：影片简要用较小的「${smartChoice.modelId}」，句级仍走推理模型`,
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
        if (input._hybridSkipLlmBrief) {
            sendProgress({
                phase: 'start',
                message: '混合翻译：跳过对话模型简要，人名由原文敬称收获，直接加载推理模型',
                pct: 0,
                hybridSkipLlmBrief: true,
                hybridMt: true,
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
        // polishOnly must use builtin (or rebuilt module); old closed blobs would re-run full MT.
        if (polishOnly && allowBuiltinProAlgorithms()) {
            const { runBuiltinSmartTranslate } = require('./advanced-smart-translate');
            const result = await runBuiltinSmartTranslate({
                ...input,
                byok: byokPayload,
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
                sendProgress({ phase: 'start', message: polishOnly ? '剧情贴合润色…' : '正在调用 Pro 智能翻译模块…', pct: 0 });
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
            return missingClosedModuleError('智能翻译', modLoad.error || modLoad.message);
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
        smartTranslateHybridMt: opts.smartTranslateHybridMt ?? nested.smartTranslateHybridMt,
        smartTranslatePlotPolish: opts.smartTranslatePlotPolish ?? nested.smartTranslatePlotPolish,
        smartTranslateFaithfulVerify: opts.smartTranslateFaithfulVerify ?? nested.smartTranslateFaithfulVerify,
        smartTranslateAddressConsistency: opts.smartTranslateAddressConsistency
            ?? nested.smartTranslateAddressConsistency,
        engineLlmMtModel: opts.engineLlmMtModel ?? nested.engineLlmMtModel,
        hybridMtModelId: opts.hybridMtModelId ?? nested.hybridMtModelId
            ?? opts.engineLlmMtModel ?? nested.engineLlmMtModel,
        language: opts.language ?? nested.language,
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
                sceneMaxMs: input.sceneMaxMs,
                userNote: input.userNote,
                filmTitle: input.filmTitle || input.title,
                filmSynopsis: input.filmSynopsis || input.synopsis,
                filmTerms: input.filmTerms || input.terms,
                intensity: input.intensity,
                filmBrief: input.filmBrief || null,
                skipConsistency: input.skipConsistency === true,
                briefSampleMode: input.briefSampleMode,
            },
            signal,
            reconstructCues: (cuePayload) => runOne({
                ...cuePayload,
                signal,
                _batchMode: true,
                onProgress: (chunkInfo) => {
                    const fileLabel = cuePayload._fileName
                        ? `「${cuePayload._fileName}」`
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
                        message: `文件 ${fileInfo.index}/${fileInfo.total}「${fileInfo.name}」`,
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

    register('transub-advanced-managed-llm-status', async () => getManagedLlmStatus());

    register('transub-advanced-managed-llm-select', async (_event, payload = {}) => (
        selectManagedModel(payload)
    ));

    register('transub-advanced-managed-llm-open-pick', async () => {
        // 独立选模窗口已移除；请在设置 → Pro → 智能翻译模型（软件内选模型）内选用/下载
        return { ok: true, removed: true, message: '请在智能翻译模型页内选用模型' };
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

    // Language data pack (TDP) — CDN open download; Pro-only apply
    try {
        const tdpRuntime = require('./tdp-runtime');
        try {
            tdpRuntime.syncAppliedState();
        } catch (syncErr) {
            console.warn('[tdp] sync on bridge setup failed:', syncErr?.message || syncErr);
        }

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
