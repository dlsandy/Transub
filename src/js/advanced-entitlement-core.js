/**
 * Transub Pro 许可策略（大版本内买断 / 限时体验 / 设备 / 换机 / 复核）
 * 纯逻辑，可在 Node 测试与主进程共用。
 * 限时体验：密钥 payload 带 expiresAt；本地持续校验，到期回免费（不可抵扣买断）。
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAdvancedEntitlement = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function advancedEntitlementCoreFactory() {
    const ADVANCED_DOC_VERSION = 1;
    const FEATURE_CONTEXT_RECONSTRUCT = 'contextReconstruct';
    const FEATURE_FILM_CONTEXT_RECONSTRUCT = 'filmContextReconstruct';
    const FEATURE_SMART_TRANSLATE = 'smartTranslate';
    /** Film audio enhance: Demucs vocal sep + film VAD before ASR */
    const FEATURE_FILM_AUDIO_ENHANCE = 'filmAudioEnhance';
    /** Bilingual semantic review via LLM */
    const FEATURE_BILINGUAL_SEMANTIC_REVIEW = 'bilingualSemanticReview';
    /** ASS export with document styles (Pro) */
    const FEATURE_ASS_STYLE_EXPORT = 'assStyleExport';
    /** QC 一键智能处理（规则修复后对剩余通顺度等做 LLM 润色） */
    const FEATURE_QC_SMART_FIX = 'qcSmartFix';
    /** 字幕库 Pro：多配方 A/B、高保留、diff、发布包、语料导出等 */
    const FEATURE_SUBTITLE_LIBRARY_PRO = 'subtitleLibraryPro';
    const FEATURE_ALL = '*';

    /** 同时绑定设备上限 */
    const MAX_DEVICES = 1;
    /** 换机冷却（毫秒）：每 30 天最多成功换机 1 次 */
    const TRANSFER_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
    /** 联网复核周期（毫秒） */
    const REVALIDATE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

    const DAY_MS = 24 * 60 * 60 * 1000;

    function asIso(value) {
        if (!value) return null;
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    }

    function parseTime(value) {
        if (!value) return null;
        const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
        return Number.isFinite(t) ? t : null;
    }

    function normalizeFeatures(features) {
        if (!Array.isArray(features) || !features.length) return [FEATURE_ALL];
        const out = [];
        const seen = new Set();
        for (const f of features) {
            const id = String(f || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out.length ? out : [FEATURE_ALL];
    }

    function hasFeature(features, featureId) {
        const want = String(featureId || '').trim();
        if (!want) return false;
        const list = normalizeFeatures(features);
        if (list.includes(FEATURE_ALL)) return true;
        return list.includes(want);
    }

    function emptyLicenseState() {
        return {
            key: '',
            licenseId: '',
            features: [],
            activatedAt: null,
            lastValidatedAt: null,
            lastTransferAt: null,
            expiresAt: null,
            devices: [],
            product: 'transub-advanced',
        };
    }

    const managedCatalog = (typeof require === 'function')
        ? require('./advanced-managed-llm-catalog-core')
        : (global.TransubAdvancedManagedLlmCatalog || {});

    function emptyAdvancedDoc() {
        return {
            version: ADVANCED_DOC_VERSION,
            license: emptyLicenseState(),
            byok: {
                provider: 'openai',
                baseUrl: '',
                model: '',
            },
            /** 大模型来源：byok=外接 API；managed=软件内选模型 */
            llmSource: 'byok',
            managedLlm: typeof managedCatalog.emptyManagedLlm === 'function'
                ? managedCatalog.emptyManagedLlm()
                : {
                    activeModelId: '',
                    smartTranslateModelId: '',
                    serverPort: 39281,
                    ollamaBaseUrl: 'http://127.0.0.1:11434/v1',
                    pulledIds: [],
                    runtimeId: '',
                    nGpuLayers: 99,
                    contextSize: 8192,
                },
            /** 为 true 时语境重构走本地模拟，不调用 LLM（便于打通流程） */
            reconstructMock: false,
            /** safeStorage 加密后的 API Key（base64），非明文 */
            byokKeyBlob: '',
            licenseServerUrl: '',
            updatedAt: null,
        };
    }

    function normalizeDevice(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const deviceId = String(raw.deviceId || '').trim();
        if (!deviceId) return null;
        return {
            deviceId,
            boundAt: asIso(raw.boundAt) || new Date(0).toISOString(),
            label: String(raw.label || '').trim().slice(0, 64),
        };
    }

    function normalizeLicenseState(raw) {
        const base = emptyLicenseState();
        if (!raw || typeof raw !== 'object') return base;
        const devices = Array.isArray(raw.devices)
            ? raw.devices.map(normalizeDevice).filter(Boolean).slice(0, MAX_DEVICES)
            : [];
        return {
            key: String(raw.key || '').trim(),
            licenseId: String(raw.licenseId || '').trim(),
            features: normalizeFeatures(raw.features),
            activatedAt: asIso(raw.activatedAt),
            lastValidatedAt: asIso(raw.lastValidatedAt),
            lastTransferAt: asIso(raw.lastTransferAt),
            expiresAt: asIso(raw.expiresAt),
            devices,
            product: String(raw.product || 'transub-advanced').trim() || 'transub-advanced',
        };
    }

    /** 有 expiresAt 的许可视为限时体验（买断通常为 null） */
    function isTimedLicense(license) {
        return !!parseTime(license?.expiresAt);
    }

    function isLicenseExpired(license, now = Date.now()) {
        const exp = parseTime(license?.expiresAt);
        if (exp == null) return false;
        return now > exp;
    }

    function msUntilExpiry(license, now = Date.now()) {
        const exp = parseTime(license?.expiresAt);
        if (exp == null) return null;
        return Math.max(0, exp - now);
    }

    function normalizeByok(raw) {
        const o = raw && typeof raw === 'object' ? raw : {};
        return {
            provider: String(o.provider || 'openai').trim() || 'openai',
            baseUrl: String(o.baseUrl || '').trim(),
            model: String(o.model || '').trim(),
        };
    }

    function normalizeLlmSource(value) {
        if (typeof managedCatalog.normalizeLlmSource === 'function') {
            return managedCatalog.normalizeLlmSource(value);
        }
        const v = String(value || '').trim().toLowerCase();
        return v === 'managed' ? 'managed' : 'byok';
    }

    function normalizeManagedLlm(raw, hints) {
        if (typeof managedCatalog.normalizeManagedLlm === 'function') {
            return managedCatalog.normalizeManagedLlm(raw, hints);
        }
        return emptyAdvancedDoc().managedLlm;
    }

    function normalizeAdvancedDoc(raw, hints) {
        const doc = emptyAdvancedDoc();
        if (!raw || typeof raw !== 'object') {
            return {
                ...doc,
                managedLlm: normalizeManagedLlm(doc.managedLlm, hints),
            };
        }
        return {
            version: ADVANCED_DOC_VERSION,
            license: normalizeLicenseState(raw.license),
            byok: normalizeByok(raw.byok),
            llmSource: normalizeLlmSource(raw.llmSource),
            managedLlm: normalizeManagedLlm(raw.managedLlm, hints),
            byokKeyBlob: String(raw.byokKeyBlob || '').trim(),
            reconstructMock: !!raw.reconstructMock,
            licenseServerUrl: String(raw.licenseServerUrl || '').trim(),
            updatedAt: asIso(raw.updatedAt),
        };
    }

    function findDevice(license, deviceId) {
        const id = String(deviceId || '').trim();
        if (!id) return null;
        return (license?.devices || []).find((d) => d.deviceId === id) || null;
    }

    function isDeviceBound(license, deviceId) {
        return !!findDevice(license, deviceId);
    }

    function needsRevalidation(license, now = Date.now()) {
        const last = parseTime(license?.lastValidatedAt);
        if (last == null) return true;
        return now - last >= REVALIDATE_INTERVAL_MS;
    }

    function msUntilRevalidation(license, now = Date.now()) {
        const last = parseTime(license?.lastValidatedAt);
        if (last == null) return 0;
        return Math.max(0, REVALIDATE_INTERVAL_MS - (now - last));
    }

    function canTransfer(license, now = Date.now()) {
        const last = parseTime(license?.lastTransferAt);
        if (last == null) {
            return { ok: true, retryAt: null, retryInMs: 0 };
        }
        const elapsed = now - last;
        if (elapsed >= TRANSFER_COOLDOWN_MS) {
            return { ok: true, retryAt: null, retryInMs: 0 };
        }
        const retryInMs = TRANSFER_COOLDOWN_MS - elapsed;
        return {
            ok: false,
            retryAt: new Date(last + TRANSFER_COOLDOWN_MS).toISOString(),
            retryInMs,
            message: `换机冷却中，约 ${Math.ceil(retryInMs / DAY_MS)} 天后可再换机`,
        };
    }

    /**
     * 当前设备是否具备 Advanced 使用资格（不含具体功能开关之外的模块加载）。
     */
    function evaluateEntitlement(license, deviceId, { now = Date.now(), requireOnlineFresh = true } = {}) {
        const lic = normalizeLicenseState(license);
        if (!lic.key || !lic.licenseId) {
            return { entitled: false, reason: 'inactive', message: '未激活 Pro 许可' };
        }
        if (isLicenseExpired(lic, now)) {
            return {
                entitled: false,
                reason: 'expired',
                message: 'Pro 体验已到期，已回免费功能；可购买大版本内买断继续使用',
                expiresAt: lic.expiresAt,
            };
        }
        if (!isDeviceBound(lic, deviceId)) {
            return { entitled: false, reason: 'device_unbound', message: '本机未绑定此许可，请激活或换机到本机' };
        }
        if (requireOnlineFresh && needsRevalidation(lic, now)) {
            return {
                entitled: false,
                reason: 'revalidation_required',
                message: '需联网复核许可（每 30 天一次）',
            };
        }
        const timed = isTimedLicense(lic);
        return {
            entitled: true,
            reason: 'ok',
            message: timed ? 'Pro 体验已解锁' : 'Pro 已解锁',
            features: lic.features,
            expiresAt: lic.expiresAt,
        };
    }

    function isFeatureEntitled(license, deviceId, featureId, options) {
        const ev = evaluateEntitlement(license, deviceId, options);
        if (!ev.entitled) return { ...ev, feature: featureId, featureOk: false };
        const featureOk = hasFeature(ev.features || license?.features, featureId);
        if (!featureOk) {
            return {
                entitled: false,
                featureOk: false,
                reason: 'feature_missing',
                message: `当前许可未包含功能：${featureId}`,
                feature: featureId,
            };
        }
        return { ...ev, feature: featureId, featureOk: true };
    }

    /**
     * 未解锁 Pro 时「轻量托管模型」是否已选用（白名单 ≤7B，字段名 freePipelineTranslate 保留兼容）。
     * 不代表可免费用智能翻译——智能翻译始终需 Pro；免费侧请用推理翻译（Sakura）或引擎 Opus。
     * @param {object} doc advanced doc 或 { llmSource, managedLlm }
     * @param {{ isModelInstalled?: (id: string) => boolean, modelInstalled?: boolean }} [options]
     */
    function evaluateFreePipelineTranslate(doc, options = {}) {
        const maxB = typeof managedCatalog.FREE_PIPELINE_TRANSLATE_MAX_B === 'number'
            ? managedCatalog.FREE_PIPELINE_TRANSLATE_MAX_B
            : 7;
        const source = normalizeLlmSource(doc?.llmSource);
        const managed = normalizeManagedLlm(doc?.managedLlm);
        const modelId = typeof managedCatalog.resolveSmartTranslateModelId === 'function'
            ? managedCatalog.resolveSmartTranslateModelId(managed)
            : String(managed.smartTranslateModelId || managed.activeModelId || '').trim();
        if (source !== 'managed') {
            return {
                ok: false,
                reason: 'byok_requires_advanced',
                message: `外接 API / BYOK 需解锁 Pro。未开通时可先下载软件内轻量模型（≤${maxB}B）备用`,
                maxParamBillion: maxB,
                modelId,
            };
        }
        if (!modelId) {
            return {
                ok: false,
                reason: 'model_missing',
                message: `请先在「智能翻译模型」中选用软件内轻量模型（≤${maxB}B，如 Qwen2.5 7B）`,
                maxParamBillion: maxB,
                modelId: '',
            };
        }
        const isFree = typeof managedCatalog.isFreePipelineTranslateModel === 'function'
            && managedCatalog.isFreePipelineTranslateModel(modelId);
        if (!isFree) {
            return {
                ok: false,
                reason: 'model_not_free',
                message: `当前模型不在轻量白名单（需 ≤${maxB}B）。更大规格需解锁 Pro`,
                maxParamBillion: maxB,
                modelId,
            };
        }
        // Optional install gate (main process supplies isModelInstalled / modelInstalled).
        const installed = typeof options.isModelInstalled === 'function'
            ? !!options.isModelInstalled(modelId)
            : options.modelInstalled;
        if (installed === false) {
            return {
                ok: false,
                reason: 'model_not_installed',
                message: `请先下载软件内模型「${modelId}」`,
                maxParamBillion: maxB,
                modelId,
            };
        }
        return {
            ok: true,
            reason: 'ok',
            message: `已选用轻量模型（≤${maxB}B）；智能翻译仍需解锁 Pro`,
            maxParamBillion: maxB,
            modelId,
        };
    }

    /**
     * 将本机加入设备列表。若已满且本机不在列表中，需走换机。
     */
    function bindDevice(license, deviceId, { now = Date.now(), label = '' } = {}) {
        const lic = normalizeLicenseState(license);
        const id = String(deviceId || '').trim();
        if (!id) return { ok: false, error: '缺少设备标识', license: lic };

        if (isDeviceBound(lic, id)) {
            return { ok: true, alreadyBound: true, license: lic, transferred: false };
        }

        if (lic.devices.length < MAX_DEVICES) {
            lic.devices.push({
                deviceId: id,
                boundAt: new Date(now).toISOString(),
                label: String(label || '').trim().slice(0, 64),
            });
            if (!lic.activatedAt) lic.activatedAt = new Date(now).toISOString();
            return { ok: true, alreadyBound: false, license: lic, transferred: false };
        }

        return {
            ok: false,
            error: `已绑定 ${MAX_DEVICES} 台设备，请先换机到本机`,
            code: 'device_limit',
            license: lic,
        };
    }

    /**
     * 换机到本机：移除一台旧设备（优先非本机中最早绑定的），绑定本机，并记录 lastTransferAt。
     */
    function transferToDevice(license, deviceId, { now = Date.now(), label = '' } = {}) {
        const lic = normalizeLicenseState(license);
        const id = String(deviceId || '').trim();
        if (!id) return { ok: false, error: '缺少设备标识', license: lic };

        if (isDeviceBound(lic, id)) {
            return { ok: true, alreadyBound: true, license: lic };
        }

        const gate = canTransfer(lic, now);
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.message,
                code: 'transfer_cooldown',
                retryAt: gate.retryAt,
                retryInMs: gate.retryInMs,
                license: lic,
            };
        }

        if (lic.devices.length >= MAX_DEVICES) {
            const sorted = [...lic.devices].sort((a, b) => parseTime(a.boundAt) - parseTime(b.boundAt));
            const drop = sorted[0];
            lic.devices = lic.devices.filter((d) => d.deviceId !== drop.deviceId);
        }

        lic.devices.push({
            deviceId: id,
            boundAt: new Date(now).toISOString(),
            label: String(label || '').trim().slice(0, 64),
        });
        lic.lastTransferAt = new Date(now).toISOString();
        if (!lic.activatedAt) lic.activatedAt = new Date(now).toISOString();
        return { ok: true, alreadyBound: false, license: lic };
    }

    function markValidated(license, now = Date.now()) {
        const lic = normalizeLicenseState(license);
        lic.lastValidatedAt = new Date(now).toISOString();
        return lic;
    }

    function buildStatusView(license, deviceId, { now = Date.now() } = {}) {
        const lic = normalizeLicenseState(license);
        const ev = evaluateEntitlement(lic, deviceId, { now });
        const transfer = canTransfer(lic, now);
        const timed = isTimedLicense(lic);
        const expiresInMs = timed ? msUntilExpiry(lic, now) : null;
        return {
            active: !!lic.key && !!lic.licenseId,
            entitled: ev.entitled,
            reason: ev.reason,
            message: ev.message,
            licenseId: lic.licenseId || '',
            features: lic.features,
            deviceId: String(deviceId || ''),
            deviceBound: isDeviceBound(lic, deviceId),
            deviceCount: lic.devices.length,
            maxDevices: MAX_DEVICES,
            devices: lic.devices,
            activatedAt: lic.activatedAt,
            lastValidatedAt: lic.lastValidatedAt,
            lastTransferAt: lic.lastTransferAt,
            expiresAt: lic.expiresAt,
            isTrial: timed,
            expired: ev.reason === 'expired' || (timed && isLicenseExpired(lic, now)),
            expiresInMs,
            needsRevalidation: needsRevalidation(lic, now),
            revalidateInMs: msUntilRevalidation(lic, now),
            canTransfer: transfer.ok,
            transferRetryAt: transfer.retryAt || null,
            transferRetryInMs: transfer.retryInMs || 0,
            policy: {
                maxDevices: MAX_DEVICES,
                transferCooldownDays: 30,
                revalidateIntervalDays: 30,
            },
        };
    }

    return {
        ADVANCED_DOC_VERSION,
        FEATURE_CONTEXT_RECONSTRUCT,
        FEATURE_FILM_CONTEXT_RECONSTRUCT,
        FEATURE_SMART_TRANSLATE,
        FEATURE_FILM_AUDIO_ENHANCE,
        FEATURE_BILINGUAL_SEMANTIC_REVIEW,
        FEATURE_ASS_STYLE_EXPORT,
        FEATURE_QC_SMART_FIX,
        FEATURE_SUBTITLE_LIBRARY_PRO,
        FEATURE_ALL,
        MAX_DEVICES,
        TRANSFER_COOLDOWN_MS,
        REVALIDATE_INTERVAL_MS,
        emptyLicenseState,
        emptyAdvancedDoc,
        normalizeFeatures,
        hasFeature,
        normalizeLicenseState,
        normalizeByok,
        normalizeLlmSource,
        normalizeManagedLlm,
        normalizeAdvancedDoc,
        findDevice,
        isDeviceBound,
        isTimedLicense,
        isLicenseExpired,
        msUntilExpiry,
        needsRevalidation,
        msUntilRevalidation,
        canTransfer,
        evaluateEntitlement,
        isFeatureEntitled,
        evaluateFreePipelineTranslate,
        bindDevice,
        transferToDevice,
        markValidated,
        buildStatusView,
    };
}));
