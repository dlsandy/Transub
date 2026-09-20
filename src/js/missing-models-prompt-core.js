/**
 * Missing-models confirm + sense support-gap install prompts.
 * Shell injects catalog/IPC/state via createMissingModelsPrompt(deps).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMissingModelsPrompt = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function missingModelsPromptFactory() {
    /**
     * @param {object} deps shell adapters
     */
    function createMissingModelsPrompt(deps) {
        const d = deps || {};
        const missingModelsApi = d.missingModelsApi || {};
        const engineModelsUi = d.engineModelsUi || {};
        const getCachedEngineModels = d.getCachedEngineModels || (() => []);
        const getCachedEnginePickCatalog = d.getCachedEnginePickCatalog || (() => []);
        const refreshEngineModels = d.refreshEngineModels || (async () => {});
        const ensureEngineModelsCatalog = d.ensureEngineModelsCatalog
            || (async (opts = {}) => {
                if (opts.force) {
                    return refreshEngineModels({ silent: opts.silent !== false });
                }
                const cached = getCachedEngineModels();
                const pick = getCachedEnginePickCatalog();
                const hasCache = (Array.isArray(cached) && cached.length)
                    || (Array.isArray(pick) && pick.length);
                const required = Array.isArray(opts.requiredModelIds) ? opts.requiredModelIds : [];
                if (hasCache && required.length) {
                    const ids = new Set([
                        ...cached.map((m) => String(m?.id || '').trim()).filter(Boolean),
                        ...pick.map((m) => String(m?.id || '').trim()).filter(Boolean),
                    ]);
                    if (required.every((id) => ids.has(String(id || '').trim()))) {
                        return { ok: true, fromCache: true, models: cached };
                    }
                } else if (hasCache) {
                    return { ok: true, fromCache: true, models: cached };
                }
                return refreshEngineModels({ silent: opts.silent !== false });
            });
        const appConfirm = d.appConfirm || (async () => false);
        const appConfirmChoice = d.appConfirmChoice || (async () => 'secondary');
        const resolveParamsTab = d.resolveParamsTab || ((tab) => tab);
        const openAppSettings = d.openAppSettings || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const getContentProfileApi = d.getContentProfileApi
            || (() => (typeof globalThis !== 'undefined' ? globalThis.TransubContentProfile : null));
        const refreshEngineDemucsStatus = d.refreshEngineDemucsStatus || (async () => ({}));
        const getSenseBaseOptions = d.getSenseBaseOptions || (() => ({}));
        const readTranslateModeFromForm = d.readTranslateModeFromForm || (() => 'normal');
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const downloadEngineModels = d.downloadEngineModels || (async () => {});
        const setEngineModelsFilter = d.setEngineModelsFilter || (() => {});
        const renderEngineModelsCards = d.renderEngineModelsCards || (() => {});
        const ensureEngineDemucs = d.ensureEngineDemucs || (async () => {});

        /**
         * If any listed model is missing/incomplete, confirm and optionally open settings.
         * @returns {Promise<boolean>} true when all ready (or nothing to check); false if blocked
         */
        async function ensureRequiredModelsReadyOrPrompt({
            modelIds = [],
            contextLabel = '',
            catalog = null,
            settingsTab = 'install',
            settingsHint = '',
        } = {}) {
            const ids = [...new Set(
                (Array.isArray(modelIds) ? modelIds : [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean),
            )];
            if (!ids.length) return true;

            let models = Array.isArray(catalog) ? catalog : null;
            if (!models) {
                try {
                    await ensureEngineModelsCatalog({
                        silent: true,
                        requiredModelIds: ids,
                    });
                } catch { /* ignore */ }
                const cached = getCachedEngineModels();
                models = Array.isArray(cached) ? cached : [];
            }
            // Empty catalog: engine list unavailable — don't block selection.
            if (!models.length) return true;

            const missing = missingModelsApi.findMissingCatalogModels
                ? missingModelsApi.findMissingCatalogModels(ids, models)
                : ids
                    .filter((id) => {
                        const row = models.find((m) => String(m?.id || '') === id);
                        return !row || !row.installed || row.incomplete;
                    })
                    .map((id) => ({ id, name: id, reason: 'missing' }));
            if (!missing.length) return true;

            const tab = String(settingsTab || 'install').trim() || 'install';
            const hint = String(settingsHint || '').trim()
                || (tab === 'pro-llm' || tab === 'pro-smart-translate' || tab === 'pro'
                    ? '设置 → Pro → 智能翻译'
                    : '主界面 → 模型管理');
            const copy = missingModelsApi.buildMissingModelsConfirmCopy
                ? missingModelsApi.buildMissingModelsConfirmCopy({
                    contextLabel,
                    missing,
                    settingsHint: hint,
                })
                : {
                    title: '需要先下载模型',
                    message: contextLabel
                        ? uiTf('{context}需要的模型尚未下载。请先到「{hint}」下载。', { context: contextLabel, hint })
                        : uiTf('所选配置需要的模型尚未下载。请先到「{hint}」下载。', { hint }),
                    primaryLabel: '去下载',
                    secondaryLabel: '取消',
                };
            const go = await appConfirm(copy);
            if (go) {
                const resolved = resolveParamsTab(tab);
                openAppSettings(tab, {
                    openLibrary: resolved === 'install' || tab === 'models' || tab === '模型库',
                });
            }
            return false;
        }

        /**
         * Collect preferred sense support/models that are not yet installed across adopted items.
         * @returns {Promise<object[]>}
         */
        async function collectAdoptedSenseSupportGaps(selectedItems = []) {
            const profileApi = getContentProfileApi();
            if (!profileApi?.collectSenseSupportGaps) return [];
            const adopted = (Array.isArray(selectedItems) ? selectedItems : [])
                .filter((i) => i?.sense?.adopted && i.sense?.classification?.profile);
            if (!adopted.length) return [];

            let cached = getCachedEngineModels();
            if (!Array.isArray(cached) || !cached.length) {
                try {
                    await ensureEngineModelsCatalog({ silent: true });
                } catch { /* ignore */ }
                cached = getCachedEngineModels();
            }
            const installedModels = Array.isArray(cached) ? cached : [];

            let demucsReady = true;
            const wantsDemucs = adopted.some((i) => i.sense?.overrides?.filmAudioEnhance);
            if (wantsDemucs) {
                const demucs = await refreshEngineDemucsStatus({ silent: true });
                demucsReady = engineModelsUi.isDemucsRuntimeUsable
                    ? engineModelsUi.isDemucsRuntimeUsable(demucs)
                    : (demucs?.ok === true && String(demucs?.status || '').trim() === 'ready');
                if (
                    demucsReady
                    && engineModelsUi.isDemucsFullyReady
                    && !engineModelsUi.isDemucsFullyReady(demucs)
                ) {
                    appendLog('Demucs 可用（CPU）；CUDA 未就绪，影视增强将走 CPU 分离', 'warn');
                }
            }

            const base = getSenseBaseOptions() || {};
            const translateMode = readTranslateModeFromForm();
            const advancedEntitled = !!getAdvancedEntitled();
            const gapLists = adopted.map((item) => {
                const overrides = item.sense?.overrides || {};
                return profileApi.collectSenseSupportGaps(overrides, {
                    profile: item.sense?.classification?.profile,
                    language: overrides.language || item.sense?.classification?.language || base.language,
                    task: base.task,
                    installedModels,
                    demucsReady,
                    advancedEntitled,
                    translateMode,
                    smartTranslate: translateMode === 'smart' || !!base.smartTranslate,
                });
            });
            return profileApi.mergeSenseSupportGaps
                ? profileApi.mergeSenseSupportGaps(gapLists)
                : gapLists.flatMap((g) => g.missing || []);
        }

        async function promptInstallSenseSupportGaps(missing = []) {
            const list = Array.isArray(missing) ? missing.filter(Boolean) : [];
            if (!list.length) return 'continue';
            const lines = list.map((m) => `· ${m.label || m.id}`).join('\n');
            const choice = await appConfirmChoice({
                title: '缺少支持项',
                message: (
                    '当前识别方案需要以下尚未安装的支持项或模型：\n\n'
                    + `${lines}\n\n`
                    + '须安装后才能按所选预设开始。\n\n'
                    + '是否现在安装？安装完成后请再次点击「开始生成」。'
                ),
                primaryLabel: '去安装',
                secondaryLabel: '取消',
            });
            if (choice === 'primary') {
                await installSenseSupportGaps(list);
                return 'install';
            }
            return 'cancel';
        }

        async function installSenseSupportGaps(missing = []) {
            const list = Array.isArray(missing) ? missing.filter(Boolean) : [];
            const modelIds = list
                .filter((m) => (m.kind || 'model') === 'model')
                .map((m) => String(m.id || '').trim())
                .filter(Boolean);
            const needDemucs = list.some((m) => m.kind === 'demucs');

            // 串行：引擎下载全局忙锁，模型与 Demucs 并行会把后开任务标成「失败」
            if (modelIds.length) {
                openAppSettings('models', { openLibrary: true });
                appendLog(`感知缺项：开始下载 ${modelIds.join('、')}`, 'info');
                showToast(uiTf('正在下载感知所需模型（{count}）…', { count: modelIds.length }), 'info');
                await downloadEngineModels({ modelIds, force: false });
            }
            if (needDemucs) {
                setEngineModelsFilter('separate');
                renderEngineModelsCards();
                appendLog('感知缺项：打开 Demucs 安装窗口', 'info');
                showToast('请完成 Demucs（影视人声分离）安装', 'warn');
                await ensureEngineDemucs({ force: false });
            }
            if (!modelIds.length && !needDemucs) {
                openAppSettings('models', { openLibrary: true });
            }
        }

        return {
            ensureRequiredModelsReadyOrPrompt,
            collectAdoptedSenseSupportGaps,
            promptInstallSenseSupportGaps,
            installSenseSupportGaps,
        };
    }

    return { createMissingModelsPrompt };
}));
