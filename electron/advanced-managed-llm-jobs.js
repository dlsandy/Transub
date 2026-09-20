/**
 * Managed LLM job orchestration (select / pull / runtime install / manual helpers).
 * Calls into advanced-managed-llm for download/install; bridge wires progress + doc persistence.
 * Bound from advanced-bridge via createAdvancedManagedLlmJobs(host).
 * No proprietary prompts/algorithms.
 */
const path = require('path');
const { asString, asPlainObject } = require('./ipc-validate');
const entitlement = require('../src/js/advanced-entitlement-core');
const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
const managedLlm = require('./advanced-managed-llm');
const llmFs = require('./advanced-llm-fs');
const { expandDownloadUrls } = require('./advanced-llm-download');
const {
    broadcastManagedLlmProgress,
} = require('./download-window');
const {
    broadcastManagedModelChanged,
} = require('./advanced-llm-pick-window');

/**
 * @param {object} host
 * @param {() => string} host.getAdvancedDeviceId
 * @param {() => { doc: object }} host.readAdvancedDoc
 * @param {(patch: object) => { ok: boolean, doc?: object, error?: string }} host.writeAdvancedDoc
 * @param {(doc: object, deviceId: string) => object} host.publicStatus
 * @param {(doc: object) => object} host.managedStatusForDoc
 */
function createAdvancedManagedLlmJobs(host = {}) {
    const required = [
        'getAdvancedDeviceId',
        'readAdvancedDoc',
        'writeAdvancedDoc',
        'publicStatus',
        'managedStatusForDoc',
    ];
    for (const key of required) {
        if (typeof host[key] !== 'function') {
            throw new Error(`createAdvancedManagedLlmJobs: host.${key} required`);
        }
    }

    function runtimePreferHints() {
        try {
            return require('./advanced-runtime-prefer').getHints();
        } catch (_) {
            return {};
        }
    }

    async function getManagedLlmStatus() {
        try {
            await require('./advanced-runtime-prefer').ensurePreferCudaReady();
        } catch (_) { /* ignore */ }
        // Soft-fill empty runtimeId from hardware (NVIDIA→CUDA / AMD→ROCm); keep user-chosen backends.
        try {
            managedLlm.syncRuntimePreferenceToHardware({ force: false });
        } catch (_) { /* ignore */ }
        const deviceId = host.getAdvancedDeviceId();
        const doc = host.readAdvancedDoc().doc;
        const status = host.publicStatus(doc, deviceId);
        return {
            ok: true,
            status,
            managed: host.managedStatusForDoc(doc),
        };
    }

    function selectManagedModel(payload = {}) {
        const deviceId = host.getAdvancedDeviceId();
        const patch = asPlainObject(payload);
        const modelId = asString(patch.modelId || patch.id, 128).trim();
        const current = host.readAdvancedDoc();
        const doc = current.doc;
        const managedPrev = entitlement.normalizeManagedLlm(doc.managedLlm);
        const entry = managedCatalog.findCatalogEntry(modelId, { labModels: managedPrev.labModels });
        if (!entry) return { ok: false, error: '未知模型' };

        const status = host.publicStatus(doc, deviceId);
        const isLab = entry.lab === true || entry.experimental === true;
        if (!status.entitled && isLab) {
            return {
                ok: false,
                error: '模型实验室为 Pro 功能。解锁 Pro 后可添加与选用任意 llama 兼容 GGUF。',
                code: 'pro_required',
            };
        }
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

        const prev = managedPrev;
        const nextPatch = { ...prev };
        if (role === 'smartTranslate' || role === 'both') {
            if (managedCatalog.isTranslateOnlyModel(entry)) {
                return {
                    ok: false,
                    error: `「${entry.name}」是翻译专用模型，不能用作智能翻译/润色对话模型。请改选 Qwen2.5 Instruct 等通用对话模型；句级请到「句级专训模型」或推理翻译选用。`,
                    code: 'model_translate_only',
                };
            }
            nextPatch.smartTranslateModelId = entry.id;
        }
        if (role === 'inference' || role === 'both') {
            nextPatch.activeModelId = entry.id;
            // Do not auto-fill smartTranslateModelId from inference — hybrid/smart
            // polish must be an explicit 润色模型 pick (avoids reconstruct→translate confusion).
        }

        const nextManaged = entitlement.normalizeManagedLlm(nextPatch);
        const saved = host.writeAdvancedDoc({
            ...doc,
            llmSource: 'managed',
            managedLlm: nextManaged,
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        const managed = host.managedStatusForDoc(saved.doc);
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
            status: host.publicStatus(saved.doc, deviceId),
            managed,
        };
    }

    async function pullManagedModelJob(event, payload = {}) {
        const patch = asPlainObject(payload);
        const modelId = asString(patch.modelId || patch.id, 128).trim();
        const entry = llmFs.resolveModelEntry(modelId);
        if (!entry) return { ok: false, error: '未知模型' };

        const deviceId = host.getAdvancedDeviceId();
        const currentPre = host.readAdvancedDoc();
        const statusPre = host.publicStatus(currentPre.doc, deviceId);
        const isLab = entry.lab === true || entry.experimental === true;
        if (!statusPre.entitled && isLab) {
            return {
                ok: false,
                error: '实验室模型需解锁 Pro 后可用。',
                code: 'pro_required',
            };
        }
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

        const current = host.readAdvancedDoc();
        const doc = current.doc;
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const pulledIds = Array.from(new Set([...(managed.pulledIds || []), entry.id]));
        const saved = host.writeAdvancedDoc({
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

        const managedStatus = host.managedStatusForDoc(saved.doc);
        broadcastManagedModelChanged({
            activeModelId: managedStatus.activeModelId,
            name: managedStatus.activeModel?.name || entry.name,
            managed: managedStatus,
        });
        return {
            ok: true,
            message: result.message || '下载完成',
            status: host.publicStatus(saved.doc, deviceId),
            managed: managedStatus,
        };
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
        // When installing without an explicit package, align preference to detected CUDA / ROCm.
        if (!String(patch.runtimeId || patch.packageId || '').trim() && (hints.preferCuda || hints.preferRocm)) {
            try {
                managedLlm.syncRuntimePreferenceToHardware({ force: true });
            } catch (_) { /* ignore */ }
        }
        const deviceId = host.getAdvancedDeviceId();
        const docBefore = host.readAdvancedDoc().doc;
        const managedBefore = entitlement.normalizeManagedLlm(docBefore.managedLlm, hints);
        const runtimeId = managedCatalog.normalizeRuntimeId(
            asString(patch.runtimeId || patch.packageId || managedBefore.runtimeId, 64),
            process.platform,
            process.arch,
            hints,
        );
        if (runtimeId && runtimeId !== managedBefore.runtimeId) {
            host.writeAdvancedDoc({
                ...docBefore,
                managedLlm: { ...managedBefore, runtimeId },
            });
        }
        const channelRaw = String(patch.channel || '').trim().toLowerCase();
        const channel = (channelRaw === 'latest' || channelRaw === 'upstream' || channelRaw === 'official')
            ? 'latest'
            : (channelRaw === 'recommended' ? 'recommended' : (channelRaw || 'recommended'));
        const llamaCppTag = String(patch.llamaCppTag || patch.tag || '').trim() || undefined;
        const result = await managedLlm.ensureRuntimeInstalled({
            force: !!patch.force,
            reinstall: !!patch.reinstall,
            runtimeId,
            channel,
            llamaCppTag,
            onProgress: sendProgress,
        });
        if (!result?.ok) return result;
        const doc = host.readAdvancedDoc().doc;
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const saved = host.writeAdvancedDoc({
            ...doc,
            managedLlm: {
                ...managed,
                runtimeId: result.meta?.packageId || runtimeId || managed.runtimeId || '',
            },
        });
        const tagPart = result.targetTag || result.meta?.tag || '';
        const channelPart = result.channel === 'latest' ? '官方最新' : '建议版';
        let message = tagPart
            ? `运行时安装完成（${channelPart} ${tagPart}）`
            : '运行时安装完成';
        if (result.already) {
            if (result.mismatch) {
                message = '运行时已安装，但与偏好后端不一致，请重新安装';
            } else if (result.outdated) {
                message = '运行时已就绪（版本较旧，可强制更新）';
            } else {
                message = tagPart
                    ? `运行时已就绪（${channelPart} ${tagPart}），无需重复下载`
                    : '运行时已就绪，无需重复下载';
            }
        } else if (result.companionFromSystem) {
            message = tagPart
                ? `运行时安装完成（${channelPart} ${tagPart}，已复用本机 CUDA 运行库）`
                : '运行时安装完成（已复用本机 CUDA 运行库，跳过 cudart 下载）';
        } else if (result.companionReused) {
            message = tagPart
                ? `运行时安装完成（${channelPart} ${tagPart}，已复用已有 CUDA 运行库）`
                : '运行时安装完成（已复用已有 CUDA 运行库）';
        }
        return {
            ok: true,
            already: !!result.already,
            companionReused: !!result.companionReused,
            companionFromSystem: !!result.companionFromSystem,
            channel: result.channel || channel,
            targetTag: result.targetTag || result.meta?.tag || null,
            message,
            meta: result.meta || null,
            status: host.publicStatus((saved.ok ? saved.doc : doc), deviceId),
            managed: host.managedStatusForDoc(saved.ok ? saved.doc : doc),
        };
    }

    function setManagedRuntimePreference(payload = {}) {
        const patch = asPlainObject(payload);
        const deviceId = host.getAdvancedDeviceId();
        const hints = runtimePreferHints();
        const doc = host.readAdvancedDoc().doc;
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
        const saved = host.writeAdvancedDoc({
            ...doc,
            managedLlm: { ...managed, runtimeId },
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        return {
            ok: true,
            message: '已保存运行时偏好',
            status: host.publicStatus(saved.doc, deviceId),
            managed: host.managedStatusForDoc(saved.doc),
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
        const deviceId = host.getAdvancedDeviceId();
        const docBefore = host.readAdvancedDoc().doc;
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
            host.writeAdvancedDoc({
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

        const doc = host.readAdvancedDoc().doc;
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const saved = host.writeAdvancedDoc({
            ...doc,
            managedLlm: {
                ...managed,
                runtimeId: result.meta?.packageId || runtimeId || managed.runtimeId || '',
            },
        });
        return {
            ok: true,
            message: `已从本地压缩包安装运行时（${pkg.label}）`,
            meta: result.meta || null,
            status: host.publicStatus((saved.ok ? saved.doc : doc), deviceId),
            managed: host.managedStatusForDoc(saved.ok ? saved.doc : doc),
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
            const doc = host.readAdvancedDoc().doc;
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
        const deviceId = host.getAdvancedDeviceId();
        const status = host.publicStatus(host.readAdvancedDoc().doc, deviceId);
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
        const deviceId = host.getAdvancedDeviceId();
        const doc = host.readAdvancedDoc().doc;

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
                    managed: host.managedStatusForDoc(doc),
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
                        managed: host.managedStatusForDoc(doc),
                    };
                }
            }
            if (pkg?.backend === 'rocm') {
                const hipDll = llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'ggml-hip.dll', 4)
                    || llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'amdhip64_7.dll', 4)
                    || llmFs.findFileRecursive(llmFs.getRuntimeDir(), 'amdhip64.dll', 4);
                if (!hipDll) {
                    return {
                        ok: false,
                        error: '已找到 llama-server，但缺少 ROCm/HIP 组件（如 ggml-hip.dll）。请确认解压的是 win-rocm / ubuntu-rocm 包，并完成本机 ROCm/HIP 安装。',
                        folder: llmFs.getRuntimeDir(),
                        managed: host.managedStatusForDoc(doc),
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
            const saved = host.writeAdvancedDoc({
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
                status: host.publicStatus(nextDoc, deviceId),
                managed: host.managedStatusForDoc(nextDoc),
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
        const saved = host.writeAdvancedDoc({
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
            status: host.publicStatus(saved.doc, deviceId),
            managed: host.managedStatusForDoc(saved.doc),
        };
    }

    return {
        getManagedLlmStatus,
        selectManagedModel,
        pullManagedModelJob,
        installManagedRuntimeJob,
        importManagedRuntimeJob,
        setManagedRuntimePreference,
        classifyRuntimeZipPaths,
        runtimePreferHints,
        archiveNameFromUrl,
        buildDownloadInfo,
        openManualDownload,
        openManagedFolder,
        verifyManualPlacement,
    };
}

module.exports = {
    createAdvancedManagedLlmJobs,
};
