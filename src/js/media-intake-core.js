/**
 * Media intake: drop / browse / probe / external import.
 * Shell injects DOM/IPC/state via createMediaIntake(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMediaIntake = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mediaIntakeFactory(global) {
    const PROBE_CONCURRENCY = 6;

    /**
     * @param {object} deps shell adapters
     */
    function createMediaIntake(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const mediaExt = d.mediaExt
            || (global && global.TransubMediaExtensions)
            || {};
        const mediaExtensions = d.mediaExtensions
            || (mediaExt.MEDIA_EXTENSIONS
                ? new Set(mediaExt.MEDIA_EXTENSIONS)
                : new Set([
                    'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
                    'ts', 'm2ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
                    'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus',
                ]));
        const externalImportApi = d.externalImportApi || {};
        const factoryTaskReorderApi = d.factoryTaskReorderApi || {};
        const appendLog = d.appendLog || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const findItem = d.findItem || (() => null);
        const refreshListRow = d.refreshListRow || (() => {});
        const renderList = d.renderList || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const updateProgressUi = d.updateProgressUi || (() => {});
        const isProgressIdle = d.isProgressIdle || (() => false);
        const getFfmpegPathFromForm = d.getFfmpegPathFromForm || (() => '');
        const resolveOutputDirFromForm = d.resolveOutputDirFromForm || (() => '');
        const getSelectedItems = d.getSelectedItems || (() => []);
        const appendItemsToLiveBatch = d.appendItemsToLiveBatch || (async () => {});
        const startSubtitleGeneration = d.startSubtitleGeneration || (async () => {});
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const applyOptionsToForm = d.applyOptionsToForm || (async () => {});
        const toQuickTargetLang = d.toQuickTargetLang || ((v) => v);
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getContentProfileApi = d.getContentProfileApi
            || (() => (global && global.TransubContentProfile) || null);

        let externalImportIdleTimer = null;
        let externalImportResourceIdleStreak = 0;
        let externalImportLastBlockerText = '';
        /** @type {Promise<void>} */
        let probeQueueTail = Promise.resolve();

        function isVideoPath(filePath) {
            if (typeof mediaExt.isMediaExt === 'function') return mediaExt.isMediaExt(filePath);
            const ext = String(filePath || '').split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() || '';
            return mediaExtensions.has(ext);
        }

        function isVideoFile(file, filePath) {
            const path = String(filePath || '').trim();
            if (path && isVideoPath(path)) return true;
            const mime = String(file?.type || '').toLowerCase();
            if (typeof mediaExt.isMediaMimeType === 'function') {
                if (mediaExt.isMediaMimeType(mime)) return true;
            } else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
                return true;
            }
            const name = String(file?.name || path || '').trim();
            return !!(name && isVideoPath(name));
        }

        function pathFromDroppedFile(file) {
            if (!file) return '';
            const legacy = file.path || '';
            if (legacy) return legacy;
            return electron?.getPathForFile?.(file) || '';
        }

        function pathsFromFileList(fileList) {
            const paths = [];
            for (const file of fileList || []) {
                const p = pathFromDroppedFile(file);
                if (p && isVideoFile(file, p)) paths.push(p);
            }
            return paths;
        }

        function pathsFromDataTransfer(dt) {
            const paths = [];
            if (!dt) return paths;

            if (dt.items?.length) {
                for (const item of dt.items) {
                    if (item.kind !== 'file') continue;
                    const file = item.getAsFile();
                    const p = pathFromDroppedFile(file);
                    if (p && isVideoFile(file, p)) paths.push(p);
                }
                if (paths.length) return paths;
            }

            return pathsFromFileList(dt.files);
        }

        function setDropActive(active) {
            if (!els.filePanel || !els.dropOverlay) return;
            els.filePanel.classList.toggle('ring-2', active);
            els.filePanel.classList.toggle('ring-violet-400', active);
            els.dropOverlay.classList.toggle('hidden', !active);
            els.dropOverlay.classList.toggle('flex', active);
        }

        async function handleDroppedFiles(dataTransfer) {
            const paths = pathsFromDataTransfer(dataTransfer);
            if (!paths.length) {
                const total = dataTransfer?.files?.length || dataTransfer?.items?.length || 0;
                if (total > 0) {
                    appendLog('未识别到支持的媒体文件（已忽略不支持的格式或无法读取路径）', 'warn');
                }
                return;
            }
            const before = state.items.length;
            await addFiles(paths);
            const added = state.items.length - before;
            const skipped = paths.length - added;
            if (added > 0) {
                appendLog(`拖入添加 ${added} 个媒体文件${skipped > 0 ? `，${skipped} 个已在列表中` : ''}`, 'info');
            }
        }

        async function probeItem(item, options = {}) {
            const { skipFullRender = false } = options;
            item.status = 'probing';
            if (skipFullRender) refreshListRow(item);
            else renderList();
            const res = await electron?.ffmpegProbe?.({
                path: item.path,
                ffmpegPath: getFfmpegPathFromForm(),
            });
            if (res?.ok) {
                item.duration = res.duration;
                item.status = 'ready';
                item.metaLanguage = res.language || '';
                item.audioLanguages = Array.isArray(res.audioLanguages) ? res.audioLanguages : [];
                const subRes = await electron?.transWithAiCheckSubtitles?.({
                    paths: [item.path],
                    outputDir: resolveOutputDirFromForm(),
                });
                if (subRes?.ok && subRes.subtitles?.[item.path]) {
                    item.existingSubtitle = subRes.subtitles[item.path];
                    item.subtitlePath = item.existingSubtitle;
                    if (!els.overwriteCheck?.checked) item.detail = '已有字幕';
                }
            } else {
                item.status = 'error';
                item.error = res?.error || '探测失败';
            }
            if (skipFullRender) refreshListRow(item);
            else renderList();
        }

        async function mapPool(items, concurrency, worker) {
            const list = Array.isArray(items) ? items : [];
            if (!list.length) return;
            let next = 0;
            const limit = Math.max(1, Math.min(concurrency || 1, list.length));
            async function run() {
                while (next < list.length) {
                    const index = next;
                    next += 1;
                    await worker(list[index], index);
                }
            }
            await Promise.all(Array.from({ length: limit }, () => run()));
        }

        async function addFiles(paths) {
            const list = Array.isArray(paths) ? paths : [];
            const toProbe = list
                .map((p) => String(p || '').trim())
                .filter((path) => path && !findItem(path));
            if (!toProbe.length) return;

            // Clear any leftover busy mask from older builds.
            try {
                (global && global.TransubBusyOverlay)?.hideBusyOverlay?.();
            } catch { /* ignore */ }

            const newItems = toProbe.map((path) => ({
                path,
                selected: true,
                status: 'pending',
                duration: 0,
                progress: 0,
                detail: '',
            }));

            // Instant list paint — no full-screen overlay. Probe runs in background.
            state.items.push(...newItems);
            renderList();
            updateStartButton();
            if (isProgressIdle()) updateProgressUi({ force: true });

            const runProbe = async () => {
                await mapPool(newItems, PROBE_CONCURRENCY, async (item) => {
                    await probeItem(item, { skipFullRender: true });
                });
                if (state.running) {
                    await appendItemsToLiveBatch(newItems);
                }
                updateStartButton();
                if (isProgressIdle()) updateProgressUi({ force: true });
            };

            // Serialize probe batches so overlapping drops don't stomp row refresh ordering.
            const pending = probeQueueTail.then(runProbe, runProbe);
            probeQueueTail = pending.catch(() => {});
            // When a live batch is running, caller still needs probe+append to finish.
            if (state.running) await pending;
        }

        function getExternalImportAction() {
            const savedOptionsSnapshot = getSavedOptionsSnapshot();
            const raw = els.externalImportActionSelect?.value
                || savedOptionsSnapshot?.externalImportAction
                || externalImportApi.DEFAULT_EXTERNAL_IMPORT_ACTION
                || 'list_when_idle';
            return externalImportApi.normalizeExternalImportAction
                ? externalImportApi.normalizeExternalImportAction(raw)
                : raw;
        }

        function stopExternalImportIdleWatcher() {
            if (externalImportIdleTimer) {
                clearInterval(externalImportIdleTimer);
                externalImportIdleTimer = null;
            }
        }

        function resetExternalImportIdle() {
            externalImportResourceIdleStreak = 0;
            externalImportLastBlockerText = '';
            stopExternalImportIdleWatcher();
        }

        function startExternalImportIdleWatcher() {
            stopExternalImportIdleWatcher();
            if (getExternalImportAction() !== 'list_when_idle') return;
            if (!state.externalImportIdlePending) return;
            externalImportIdleTimer = setInterval(() => {
                void tickExternalImportIdleWatcher();
            }, 15000);
        }

        async function tickExternalImportIdleWatcher() {
            if (!state.externalImportIdlePending) {
                stopExternalImportIdleWatcher();
                return;
            }
            if (getExternalImportAction() !== 'list_when_idle') {
                state.externalImportIdlePending = false;
                resetExternalImportIdle();
                return;
            }
            if (state.running || state.postBatchBusy || state.retranslateBusy) return;
            let sample = null;
            try {
                sample = await electron?.transubGetSystemResources?.({ includeGpu: true });
            } catch (_) { /* ignore */ }
            const evaluated = externalImportApi.evaluateResourceIdleSample
                ? externalImportApi.evaluateResourceIdleSample(sample)
                : { ok: false, blockers: ['资源采样失败'] };
            if (!evaluated.ok) {
                externalImportResourceIdleStreak = 0;
                const blockers = externalImportApi.formatResourceIdleBlockers
                    ? externalImportApi.formatResourceIdleBlockers(evaluated.blockers)
                    : (evaluated.blockers || []).join(' · ');
                if (blockers && blockers !== externalImportLastBlockerText) {
                    externalImportLastBlockerText = blockers;
                    appendLog(`等待 GPU/显存/内存低占用后再开始（当前 ${blockers}）`, 'info');
                }
                return;
            }
            externalImportResourceIdleStreak += 1;
            const needStreak = externalImportApi.REQUIRED_RESOURCE_IDLE_STREAK || 2;
            if (externalImportResourceIdleStreak < needStreak) return;
            const selectable = getSelectedItems().filter(
                (i) => i.status === 'ready' || i.status === 'pending',
            );
            if (!selectable.length) {
                state.externalImportIdlePending = false;
                resetExternalImportIdle();
                return;
            }
            state.externalImportIdlePending = false;
            resetExternalImportIdle();
            appendLog('GPU/显存/内存占用已处于低水平，开始处理外部传入的任务…', 'info');
            await startSubtitleGeneration();
        }

        function scheduleExternalImportIdleAfterBatch() {
            if (!state.externalImportIdlePending) return;
            if (getExternalImportAction() !== 'list_when_idle') {
                state.externalImportIdlePending = false;
                return;
            }
            if (state.running || state.postBatchBusy || state.retranslateBusy) return;
            startExternalImportIdleWatcher();
        }

        async function applyExternalImportActionAfterAdd({ runningBefore = false } = {}) {
            const action = getExternalImportAction();
            if (action === 'list_only') return;
            if (action === 'list_and_start') {
                if (runningBefore || state.running) return;
                await startSubtitleGeneration();
                return;
            }
            if (action === 'list_when_idle') {
                state.externalImportIdlePending = true;
                externalImportResourceIdleStreak = 0;
                externalImportLastBlockerText = '';
                if (state.running || state.postBatchBusy || state.retranslateBusy) {
                    appendLog(
                        '外部传入任务已加入列表，当前任务结束后将在 GPU/显存/内存低占用时自动开始',
                        'info',
                    );
                    return;
                }
                appendLog(
                    '外部传入任务已加入列表，将在 GPU/显存/内存低占用时自动开始',
                    'info',
                );
                void tickExternalImportIdleWatcher();
                startExternalImportIdleWatcher();
            }
        }

        async function applyPlayerHandoffOptionsToForm(handoffOptions = null, handoffMeta = null) {
            const patch = handoffOptions && typeof handoffOptions === 'object'
                ? { ...handoffOptions }
                : null;
            if (!patch || !Object.keys(patch).length) return;

            const api = getContentProfileApi();
            const advancedEntitled = getAdvancedEntitled();
            if (patch.contentProfile && typeof api?.optionPatchForProfile === 'function'
                && !patch.vadEnabled && !patch.filmVadPreset) {
                try {
                    const sense = api.optionPatchForProfile(patch.contentProfile, {
                        task: patch.task || els.taskSelect?.value || 'translate',
                        advancedEntitled,
                    }) || {};
                    Object.assign(patch, sense);
                } catch (_) { /* ignore */ }
            }

            try {
                await applyOptionsToForm(patch, { applyUiMode: false });
            } catch (_) { /* ignore */ }

            if (els.quickLanguageSelect && els.languageSelect) {
                els.quickLanguageSelect.value = els.languageSelect.value || 'auto';
            }
            if (els.quickTargetLangSelect && els.chineseSubtitleVariantSelect) {
                els.quickTargetLangSelect.value = toQuickTargetLang(
                    els.chineseSubtitleVariantSelect.value || 'simplified',
                );
            }

            const summary = (() => {
                const parts = [];
                const lang = handoffMeta?.sourceLanguage || patch.language;
                const profile = handoffMeta?.contentProfile || patch.contentProfile;
                const tgt = handoffMeta?.translateTarget;
                if (lang) parts.push(`语种=${lang}`);
                if (profile) parts.push(`画像=${profile}`);
                if (tgt) parts.push(`译文=${tgt}`);
                return parts.join(' · ');
            })();
            if (summary) {
                appendLog(`已按 Player 交接预填：${summary}`, 'info');
            }
            const note = String(patch._playerHandoffNote || '').trim();
            if (note) appendLog(note, 'info');
        }

        async function consumeExternalImportFiles() {
            try {
                const pending = await electron?.transWithAiGetPendingFiles?.();
                if (!pending?.ok || !pending.files?.length) return;
                const runningBefore = !!state.running;
                await applyPlayerHandoffOptionsToForm(
                    pending.handoffOptions || null,
                    pending.handoffMeta || null,
                );
                await addFiles(pending.files);
                appendLog(`已带入 ${pending.files.length} 个外部传入文件`, 'info');
                await applyExternalImportActionAfterAdd({ runningBefore });
            } catch (_) { /* ignore */ }
        }

        async function addVideos() {
            const res = await electron?.transWithAiSelectVideos?.();
            if (res?.ok && !res.canceled && res.files?.length) {
                await addFiles(res.files);
                appendLog(`已添加 ${res.files.length} 个文件`, 'info');
            }
        }

        async function addFolder() {
            const res = await electron?.selectFolder?.({
                title: '选择包含媒体文件的文件夹',
                useLastOpenDir: true,
            });
            if (!res?.ok || res.canceled || !res.path) return;
            const scan = await electron?.transWithAiScanFolder?.({ folder: res.path, recursive: true });
            if (!scan?.ok) {
                appendLog(scan?.error || '扫描文件夹失败', 'err');
                return;
            }
            await addFiles(scan.files || []);
            appendLog(`从文件夹添加 ${scan.files?.length || 0} 个媒体文件`, 'info');
        }

        function setupDragDrop() {
            const zone = els.filePanel || els.dropZone;
            if (!zone) return;

            const isTaskReorderDrag = (dt) => {
                if (state.taskReorderDragging) return true;
                if (factoryTaskReorderApi.isTaskReorderDrag) {
                    return !!factoryTaskReorderApi.isTaskReorderDrag(dt);
                }
                return false;
            };

            const onDragEnter = (e) => {
                if (isTaskReorderDrag(e.dataTransfer)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                state.dragDepth += 1;
                if (state.dragDepth === 1) setDropActive(true);
            };

            const onDragOver = (e) => {
                if (isTaskReorderDrag(e.dataTransfer)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            };

            const onDragLeave = (e) => {
                if (isTaskReorderDrag(e.dataTransfer)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                if (!zone.contains(e.relatedTarget)) {
                    state.dragDepth = 0;
                    setDropActive(false);
                }
            };

            const clearDropUi = () => {
                state.dragDepth = 0;
                setDropActive(false);
            };

            const onDrop = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearDropUi();
                if (isTaskReorderDrag(e.dataTransfer)) return;
                if (e.dataTransfer) await handleDroppedFiles(e.dataTransfer);
            };

            zone.addEventListener('dragenter', onDragEnter);
            zone.addEventListener('dragover', onDragOver);
            zone.addEventListener('dragleave', onDragLeave);
            zone.addEventListener('drop', onDrop);
            // Capture: clear overlay even if a child stops drop bubbling.
            zone.addEventListener('drop', clearDropUi, true);

            if (typeof document !== 'undefined' && document.body) {
                document.body.addEventListener('dragover', (e) => {
                    if (isTaskReorderDrag(e.dataTransfer)) return;
                    e.preventDefault();
                });
                // OS drag cancelled / left window without a clean dragleave.
                document.addEventListener('dragend', clearDropUi);
                window.addEventListener('blur', clearDropUi);
            }
        }

        return {
            pathFromDroppedFile,
            pathsFromFileList,
            pathsFromDataTransfer,
            isVideoPath,
            isVideoFile,
            setDropActive,
            handleDroppedFiles,
            probeItem,
            addFiles,
            getExternalImportAction,
            stopExternalImportIdleWatcher,
            startExternalImportIdleWatcher,
            tickExternalImportIdleWatcher,
            resetExternalImportIdle,
            scheduleExternalImportIdleAfterBatch,
            applyExternalImportActionAfterAdd,
            applyPlayerHandoffOptionsToForm,
            consumeExternalImportFiles,
            addVideos,
            addFolder,
            setupDragDrop,
        };
    }

    return { createMediaIntake };
}));
