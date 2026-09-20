/**
 * Managed-LLM IPC channels (status / select / pull / runtime / lab / stop).
 * Extracted from advanced-bridge to keep the monolith thin.
 */

const { asString, asPlainObject } = require('./ipc-validate');

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} deps
 */
function registerAdvancedManagedLlmIpc(register, deps = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerAdvancedManagedLlmIpc: register required');
    }

    const {
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
        readAdvancedDoc,
        writeAdvancedDoc,
        publicStatus,
        managedStatusForDoc,
        getAdvancedDeviceId,
    } = deps;

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

    register('transub-advanced-managed-llm-scan-cuda', async (_event, payload = {}) => (
        managedLlm.scanSystemCudaCompanion(payload)
    ));

    register('transub-advanced-managed-llm-adopt-cuda', async (_event, payload = {}) => (
        managedLlm.adoptSystemCudaCompanion(payload)
    ));

    register('transub-advanced-managed-llm-set-runtime', async (_event, payload = {}) => (
        setManagedRuntimePreference(payload)
    ));

    register('transub-advanced-managed-llm-import-runtime', async (event, payload = {}) => (
        importManagedRuntimeJob(event, payload)
    ));

    register('transub-advanced-managed-llm-cancel-pull', async () => managedLlm.cancelManagedPull());

    register('transub-advanced-managed-llm-lab-add', async (_event, payload = {}) => {
        const patch = asPlainObject(payload);
        const deviceId = getAdvancedDeviceId();
        const current = readAdvancedDoc();
        const doc = current.doc;
        const status = publicStatus(doc, deviceId);
        if (!status.entitled) {
            return {
                ok: false,
                error: '实验室为 Pro 功能。解锁 Pro 后可自由添加任意 llama 兼容 GGUF。',
                code: 'pro_required',
            };
        }
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const built = managedLlm.buildLabModelFromInput(patch, managed.labModels);
        if (!built.ok) return built;
        const nextLabs = managedLlm.appendLabModel(managed.labModels, built.entry);
        const saved = writeAdvancedDoc({
            ...doc,
            managedLlm: {
                ...managed,
                labModels: nextLabs,
            },
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        const managedStatus = managedStatusForDoc(saved.doc);
        return {
            ok: true,
            entry: built.entry,
            message: `已添加实验室模型「${built.entry.name}」`,
            managed: managedStatus,
            status: publicStatus(saved.doc, deviceId),
        };
    });

    register('transub-advanced-managed-llm-lab-remove', async (_event, payload = {}) => {
        const patch = asPlainObject(payload);
        const modelId = asString(patch.modelId || patch.id, 128).trim();
        if (!modelId) return { ok: false, error: '缺少模型 id' };
        const deviceId = getAdvancedDeviceId();
        const current = readAdvancedDoc();
        const doc = current.doc;
        const status = publicStatus(doc, deviceId);
        if (!status.entitled) {
            return {
                ok: false,
                error: '实验室为 Pro 功能。解锁 Pro 后可管理实验模型。',
                code: 'pro_required',
            };
        }
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const before = (managed.labModels || []).length;
        const nextLabs = managedLlm.removeLabModelById(managed.labModels, modelId);
        if (nextLabs.length === before) {
            return { ok: false, error: '未找到该实验室模型', code: 'lab_model_missing' };
        }
        const nextManaged = { ...managed, labModels: nextLabs };
        if (String(nextManaged.activeModelId || '').toLowerCase() === modelId.toLowerCase()) {
            nextManaged.activeModelId = '';
        }
        if (String(nextManaged.smartTranslateModelId || '').toLowerCase() === modelId.toLowerCase()) {
            nextManaged.smartTranslateModelId = '';
        }
        nextManaged.pulledIds = (nextManaged.pulledIds || []).filter(
            (id) => String(id || '').toLowerCase() !== modelId.toLowerCase(),
        );
        const saved = writeAdvancedDoc({
            ...doc,
            managedLlm: nextManaged,
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        const managedStatus = managedStatusForDoc(saved.doc);
        return {
            ok: true,
            modelId,
            message: '已移除实验室模型',
            managed: managedStatus,
            status: publicStatus(saved.doc, deviceId),
        };
    });

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
}

module.exports = { registerAdvancedManagedLlmIpc };
