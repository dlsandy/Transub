/**
 * Chrome wire: media intake, external import, CLI command UI.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppWireChromeIntake = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appWireChromeIntakeFactory(global) {
    function wireUtils() {
        return (global && global.TransubAppWireUtils)
            || (typeof require === 'function' ? require('./app-wire-utils-core.js') : null)
            || {};
    }

    /**
     * @param {object} host
     * @returns {object} host
     */
    function install(host) {
        const h = host || {};
        const utils = wireUtils();
        const { getBindApi, resolveApi, late, entitled } = utils;
        const bindApi = typeof getBindApi === 'function' ? getBindApi() : {};
        const { createLazyFactory } = bindApi;
        if (typeof createLazyFactory !== 'function') return h;

        const g = global;
        const mediaExt = h.mediaExt || (g && g.TransubMediaExtensions) || {};
        const externalImportApi = h.externalImportApi
            || (g && g.TransubExternalImportAction)
            || {};
        const cliCommandApi = h.cliCommandApi
            || (g && g.TransubCliCommand)
            || {};
        const MEDIA_EXTENSIONS = h.MEDIA_EXTENSIONS || new Set(
            mediaExt.MEDIA_EXTENSIONS || [
                'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
                'ts', 'm2ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
                'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus',
            ],
        );

        // --- media intake ---
        h.getMediaIntake = createLazyFactory(
            () => resolveApi(h, 'mediaIntakeApi', 'TransubMediaIntake').createMediaIntake,
            () => ({
                state: h.state,
                els: h.els,
                electron: h.electron,
                mediaExt,
                mediaExtensions: MEDIA_EXTENSIONS,
                externalImportApi,
                factoryTaskReorderApi: h.factoryTaskReorderApi
                    || (g && g.TransubFactoryTaskReorder)
                    || {},
                appendLog: late(h, 'appendLog'),
                uiTf: late(h, 'uiTf'),
                findItem: (...a) => h.findItem(...a),
                refreshListRow: late(h, 'refreshListRow'),
                renderList: late(h, 'renderList'),
                updateStartButton: late(h, 'updateStartButton'),
                updateProgressUi: late(h, 'updateProgressUi'),
                setLoading: (...a) => h.setLoading(...a),
                updateLoadingMessage: (...a) => h.updateLoadingMessage(...a),
                isProgressIdle: late(h, 'isProgressIdle'),
                getFfmpegPathFromForm: late(h, 'getFfmpegPathFromForm'),
                resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                getSelectedItems: (...a) => h.getSelectedItems(...a),
                appendItemsToLiveBatch: late(h, 'appendItemsToLiveBatch'),
                startSubtitleGeneration: (...a) => h.startSubtitleGeneration(...a),
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                applyOptionsToForm: late(h, 'applyOptionsToForm'),
                toQuickTargetLang: (...a) => h.toQuickTargetLang(...a),
                getAdvancedEntitled: () => entitled(h),
                getContentProfileApi: () => (g && g.TransubContentProfile) || null,
            }),
        );
        h.setDropActive = (active) => h.getMediaIntake()?.setDropActive?.(active);
        h.handleDroppedFiles = async (dataTransfer) => {
            const intake = h.getMediaIntake();
            if (!intake?.handleDroppedFiles) return;
            return intake.handleDroppedFiles(dataTransfer);
        };
        h.addFiles = async (paths, options = {}) => {
            const intake = h.getMediaIntake();
            if (!intake?.addFiles) {
                if (typeof h.appendLog === 'function') h.appendLog('添加文件核心未加载（media-intake）', 'err');
                return;
            }
            return intake.addFiles(paths, options);
        };
        h.addVideos = async () => {
            const intake = h.getMediaIntake();
            if (!intake?.addVideos) {
                if (typeof h.appendLog === 'function') h.appendLog('添加文件核心未加载（media-intake）', 'err');
                return;
            }
            return intake.addVideos();
        };
        h.addFolder = async () => {
            const intake = h.getMediaIntake();
            if (!intake?.addFolder) {
                if (typeof h.appendLog === 'function') h.appendLog('添加文件核心未加载（media-intake）', 'err');
                return;
            }
            return intake.addFolder();
        };
        h.getExternalImportAction = () => (
            h.getMediaIntake()?.getExternalImportAction?.()
            || externalImportApi.DEFAULT_EXTERNAL_IMPORT_ACTION
            || 'list_when_idle'
        );
        h.stopExternalImportIdleWatcher = () => h.getMediaIntake()?.stopExternalImportIdleWatcher?.();
        h.resetExternalImportIdle = () => h.getMediaIntake()?.resetExternalImportIdle?.();
        h.scheduleExternalImportIdleAfterBatch = () => h.getMediaIntake()?.scheduleExternalImportIdleAfterBatch?.();
        h.consumeExternalImportFiles = async () => {
            const intake = h.getMediaIntake();
            if (!intake?.consumeExternalImportFiles) return;
            return intake.consumeExternalImportFiles();
        };
        h.setupDragDrop = () => h.getMediaIntake()?.setupDragDrop?.();

        h.autoAddMissingSubtitles = async function autoAddMissingSubtitles() {
            const api = typeof h.getAutoScanApi === 'function' ? h.getAutoScanApi() : null;
            const run = api?.runAutoAddMissingSubtitles
                || (g && g.TransubAutoScanFolders)?.runAutoAddMissingSubtitles;
            if (typeof run !== 'function') {
                if (typeof h.appendLog === 'function') h.appendLog('自动扫描核心未加载', 'err');
                return;
            }
            return run({
                electron: h.electron,
                els: h.els,
                getFoldersDraft: () => (typeof h.getAutoScanFoldersDraft === 'function'
                    ? h.getAutoScanFoldersDraft()
                    : h.autoScanFoldersDraft),
                setFoldersDraft: (folders) => {
                    if (typeof h.setAutoScanFoldersDraft === 'function') h.setAutoScanFoldersDraft(folders);
                    else h.autoScanFoldersDraft = folders;
                },
                getSavedOptionsSnapshot: () => (typeof h.getSavedOptionsSnapshot === 'function'
                    ? h.getSavedOptionsSnapshot()
                    : h.savedOptionsSnapshot),
                refreshFoldersListUi: () => late(h, 'refreshAutoScanFoldersListUi')(),
                resolveOutputDirFromForm: late(h, 'resolveOutputDirFromForm'),
                addFiles: (...a) => h.addFiles(...a),
                getItemCount: () => (h.state?.items || []).length,
                clearInvalidFiles: async () => {
                    if (typeof h.clearInvalid === 'function') {
                        return h.clearInvalid({ silentEmpty: true });
                    }
                    return { removed: 0 };
                },
                setLoading: (...a) => h.setLoading(...a),
                appendLog: late(h, 'appendLog'),
                showToast: late(h, 'showToast'),
                openAppSettings: late(h, 'openAppSettings'),
            });
        };

        // --- CLI command UI ---
        h.getCliCommandUi = createLazyFactory(
            () => resolveApi(h, 'cliCommandUiApi', 'TransubCliCommandUi').createCliCommandUi,
            () => ({
                els: h.els,
                electron: h.electron,
                cliCommandApi,
                getSelectedItems: (...a) => h.getSelectedItems(...a),
            }),
        );
        h.callCliCommandUi = (method, ...args) => {
            const ui = h.getCliCommandUi();
            if (!ui || typeof ui[method] !== 'function') return undefined;
            return ui[method](...args);
        };
        h.readCliCommandKindFromModal = (...a) => h.callCliCommandUi('readCliCommandKindFromModal', ...a) || 'regular';
        h.selectedMediaPathsForCli = (...a) => h.callCliCommandUi('selectedMediaPathsForCli', ...a) || [];
        h.ensureCliCommandLauncher = async (...a) => (
            h.callCliCommandUi('ensureCliCommandLauncher', ...a)
            || { packaged: true, transubExe: 'D:\\Transub\\transub.exe' }
        );
        h.renderCliCommandPreview = (...a) => h.callCliCommandUi('renderCliCommandPreview', ...a);
        h.refreshCliCommandPreview = async (...a) => h.callCliCommandUi('refreshCliCommandPreview', ...a);
        h.closeCliCommandModal = (...a) => h.callCliCommandUi('closeCliCommandModal', ...a);
        h.openCliCommandModal = async (...a) => h.callCliCommandUi('openCliCommandModal', ...a);

        return h;
    }

    return { install };
}));
