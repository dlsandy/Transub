/**
 * Shelf → subtitle-task flow (from 校正/翻译 step; skip ASR).
 * Shell injects DOM/IPC/state via createShelfTranslateFlow(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubShelfTranslateFlow = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function shelfTranslateFlowFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createShelfTranslateFlow(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const shelfTranslateApi = d.shelfTranslateApi || {};
        const settingsNormApi = d.settingsNormApi || {};
        const retranslatePlanApi = d.retranslatePlanApi || {};
        const appendLog = d.appendLog || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const showToast = d.showToast || (() => {});
        const setLoading = d.setLoading || (() => {});
        const appConfirm = d.appConfirm || (async () => true);
        const ensureJobRuntimeScripts = d.ensureJobRuntimeScripts || (async () => {});
        const findItem = d.findItem || (() => null);
        const setFactoryWorkspace = d.setFactoryWorkspace || (() => {});
        const resolveOutputDirFromForm = d.resolveOutputDirFromForm || (() => '');
        const pathDirname = d.pathDirname || (() => '');
        const pathJoin = d.pathJoin || ((dir, name) => `${dir}/${name}`);
        const stemNoExt = d.stemNoExt || ((p) => {
            const base = basename(p);
            const i = base.lastIndexOf('.');
            return i > 0 ? base.slice(0, i) : base;
        });
        const normPath = d.normPath || ((p) => String(p || ''));
        const readSubFormatsFromForm = d.readSubFormatsFromForm || (() => []);
        const updateStartButton = d.updateStartButton || (() => {});
        const renderList = d.renderList || (() => {});
        const startSubtitleGeneration = d.startSubtitleGeneration || (async () => {});
        const runPostBatchAutoFix = d.runPostBatchAutoFix || (async () => {});
        const runPostBatchQcScan = d.runPostBatchQcScan || (async () => {});
        const runPostBatchQcAutoFixIfEnabled = d.runPostBatchQcAutoFixIfEnabled || (async () => {});
        const runPostBatchChineseConvert = d.runPostBatchChineseConvert || (async () => {});
        const refreshSubtitleShelf = d.refreshSubtitleShelf || (() => {
            try {
                return global.TransubSubtitleShelfUi?.refreshList?.({ keepSelection: true });
            } catch (_) {
                return undefined;
            }
        });
        const getSubtitleTargetLangApi = d.getSubtitleTargetLangApi
            || (() => (global && global.TransubSubtitleTargetLang) || null);
        const getSubtitleShelfCore = d.getSubtitleShelfCore
            || (() => (global && global.TransubSubtitleShelfCore) || null);

        function readShelfTranslateTargetLangCode() {
            const targetForm = settingsNormApi.normalizeSubtitleTargetFormValue
                ? settingsNormApi.normalizeSubtitleTargetFormValue(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                )
                : String(
                    els.quickTargetLangSelect?.value
                    || els.chineseSubtitleVariantSelect?.value
                    || 'simplified',
                ).trim() || 'simplified';
            const subtitleTargetLang = settingsNormApi.normalizeSubtitleTargetLang
                ? settingsNormApi.normalizeSubtitleTargetLang(targetForm, 'simplified')
                : (getSubtitleTargetLangApi()?.targetLangFromFormValue?.(targetForm) || 'zh-Hans');
            const shelfCore = getSubtitleShelfCore();
            if (shelfCore?.langCodeFromOptions) {
                return shelfCore.langCodeFromOptions({
                    subtitleTargetLang,
                    chineseSubtitleVariant: targetForm,
                    translateTarget: subtitleTargetLang,
                });
            }
            if (subtitleTargetLang === 'zh-Hant-TW' || subtitleTargetLang === 'zh-Hant-HK') return 'zh-Hant';
            return subtitleTargetLang || 'zh-Hans';
        }

        function applyShelfEntryFields(item, planRow) {
            if (!item || !planRow) return item;
            const entry = shelfTranslateApi.resolveShelfTranslateEntry?.(planRow.sourceSlot)
                || {
                    entryStage: planRow.entryStage || 'translate',
                    pipelineFloor: planRow.pipelineFloor != null ? planRow.pipelineFloor : 3,
                };
            item.fromShelf = true;
            item.skipAsr = true;
            item.shelfEntryStage = entry.entryStage || planRow.entryStage || 'translate';
            item.shelfSourceSlot = planRow.sourceSlot || item.shelfSourceSlot || '';
            item.pipelineFloor = Number.isFinite(Number(entry.pipelineFloor))
                ? Number(entry.pipelineFloor)
                : (Number(planRow.pipelineFloor) || 3);
            item.stage = item.shelfEntryStage === 'repair' ? 'source_cleanup' : 'translate';
            item.shelfMediaId = planRow.mediaId || item.shelfMediaId || '';
            item.sourceSubtitlePath = planRow.sourcePath || item.sourceSubtitlePath;
            item.targetSubtitlePath = planRow.destPath || item.targetSubtitlePath;
            item.subtitlePath = planRow.destPath || item.subtitlePath;
            item.existingSubtitle = planRow.destPath || item.existingSubtitle;
            if (!item.sense || item.sense.status === 'off' || item.fromShelf) {
                item.sense = {
                    ...(item.sense || {}),
                    status: 'off',
                    adopted: false,
                    userRejected: true,
                    classification: item.sense?.classification || null,
                    overrides: item.sense?.overrides || {},
                    message: '字幕库翻译：走表单参数（跳过感知）',
                };
            }
            const ov = shelfTranslateApi.buildShelfTranslateOptionOverrides
                ? shelfTranslateApi.buildShelfTranslateOptionOverrides({
                    sourcePath: planRow.sourcePath,
                    sourceSlot: planRow.sourceSlot,
                    sourceLanguage: planRow.sourceLanguage,
                    entryStage: item.shelfEntryStage,
                    destPath: planRow.destPath,
                })
                : {
                    skipAsr: true,
                    overwrite: true,
                    task: 'translate',
                    shelfSourceSubtitlePath: planRow.sourcePath,
                    shelfEntryStage: item.shelfEntryStage,
                    shelfSourceSlot: planRow.sourceSlot,
                };
            item.shelfOptionOverrides = ov;
            return item;
        }

        function ensureShelfTranslateQueueItem(planRow) {
            const mediaPath = String(planRow?.item?.path || '').trim();
            if (!mediaPath) return planRow?.item || null;
            let item = findItem(mediaPath);
            if (!item) {
                item = {
                    ...(planRow.item || {}),
                    path: mediaPath,
                    selected: false,
                    status: 'pending',
                    duration: Number(planRow.item?.duration) || 0,
                    progress: 0,
                    detail: '',
                    fromShelf: true,
                };
                state.items.push(item);
            }
            applyShelfEntryFields(item, planRow);
            planRow.item = item;
            return item;
        }

        function selectOnlyShelfItem(item) {
            if (!item || !state?.items) return;
            for (const row of state.items) {
                if (!row) continue;
                row.selected = row === item;
            }
            item.selected = true;
            if (item.status === 'done' || item.status === 'skipped'
                || item.status === 'failed' || item.status === 'cancelled'
                || item.status === 'error') {
                item.status = 'ready';
                item.progress = 0;
                item.detail = '';
                item.error = '';
                item.recovery = null;
            } else if (item.status === 'pending' || !item.status) {
                item.status = 'ready';
            }
        }

        /**
         * 字幕库：从原文 / 转录槽位进入字幕任务（跳过 ASR，从校正或翻译起）。
         * @param {{ mediaDetail?: object, sourceSlot?: string }} payload
         */
        async function openShelfTranslate(payload = {}) {
            await ensureJobRuntimeScripts();
            if (state.running || state.postBatchBusy || state.retranslateBusy || state.batchStartInFlight) {
                showToast('当前有任务进行中', 'warn');
                return { ok: false, error: 'busy' };
            }
            const media = payload?.mediaDetail || payload?.media || null;
            const sourceSlot = shelfTranslateApi.normalizeSourceSlot?.(payload?.sourceSlot)
                || String(payload?.sourceSlot || '').trim();
            if (!media?.id) {
                showToast('请先选择字幕库中的媒体', 'warn');
                return { ok: false, error: 'no_media' };
            }
            if (!shelfTranslateApi.buildShelfTranslatePlanRow) {
                showToast('字幕库翻译模块未加载', 'err');
                return { ok: false, error: 'no_module' };
            }
            const mediaPath = String(media.mediaPath || '').trim();
            if (!mediaPath) {
                showToast('该媒体缺少视频路径，无法进入字幕任务', 'warn');
                return { ok: false, error: 'no_media_path' };
            }

            setLoading(true, '正在准备字幕任务…');
            let planRow = null;
            try {
                const srcCheck = shelfTranslateApi.resolveShelfSourceSlot(media, sourceSlot);
                if (!srcCheck?.ok) {
                    showToast(srcCheck?.error || '无可用源字幕', 'warn');
                    return { ok: false, error: srcCheck?.error || 'no_source' };
                }
                const doc = await electron?.transubReadSubtitle?.({ path: srcCheck.path });
                if (!doc?.ok || !Array.isArray(doc.cues) || !doc.cues.some((c) => String(c?.text || '').trim())) {
                    showToast(doc?.error || '源字幕为空或无法读取', 'warn');
                    return { ok: false, error: doc?.error || 'empty_source' };
                }
                const langCode = readShelfTranslateTargetLangCode();
                const formLang = String(els.quickLanguageSelect?.value || els.languageSelect?.value || '').trim();
                if (shelfTranslateApi.cuesLookPrimarilyChinese?.(doc.cues)) {
                    const proceed = await appConfirm({
                        title: '源字幕可能已是中文',
                        message: '检测到源字幕以中文为主。若仍按日语去译，结果容易乱翻。是否继续？',
                        primaryLabel: '仍要翻译',
                        secondaryLabel: '取消',
                    });
                    if (!proceed) return { ok: false, error: 'cancelled' };
                }
                planRow = shelfTranslateApi.buildShelfTranslatePlanRow(media, sourceSlot, {
                    langCode,
                    formLanguage: formLang,
                    cues: doc.cues,
                    format: doc.format || 'srt',
                    resolveRetranslateDestPath: retranslatePlanApi.resolveRetranslateDestPath,
                    destDeps: {
                        resolveOutputDir: resolveOutputDirFromForm,
                        pathDirname,
                        pathJoin,
                        stemNoExt,
                        normPath,
                        subFormats: readSubFormatsFromForm(),
                        subtitleTargetLang: langCode,
                    },
                });
                if (!planRow?.ok) {
                    showToast(planRow?.error || '无法准备翻译', 'warn');
                    return { ok: false, error: planRow?.error || 'plan_failed' };
                }
                const item = ensureShelfTranslateQueueItem(planRow);
                if (!item) {
                    showToast('无法加入字幕任务列表', 'err');
                    return { ok: false, error: 'queue_failed' };
                }
                selectOnlyShelfItem(item);
            } finally {
                setLoading(false);
            }

            const slotLabel = shelfTranslateApi.sourceSlotLabel?.(planRow.sourceSlot) || '源字幕';
            const entryLabel = planRow.entryStage === 'repair' ? '校正' : '翻译';
            setFactoryWorkspace('queue');
            renderList();
            updateStartButton();
            appendLog(
                uiTf('字幕库翻译：从{slot}进入字幕任务（自{step}起，跳过识别）「{title}」', {
                    slot: slotLabel,
                    step: entryLabel,
                    title: media.title || basename(media.mediaPath || ''),
                }),
                'info',
            );
            showToast(
                uiTf('已从{slot}加入任务（自{step}起）', { slot: slotLabel, step: entryLabel }),
                'ok',
            );
            try {
                await startSubtitleGeneration();
            } catch (err) {
                const msg = err?.message || String(err) || '启动字幕任务失败';
                appendLog(msg, 'err');
                showToast(msg, 'err');
                return { ok: false, error: msg };
            }
            return { ok: true, entryStage: planRow.entryStage, sourceSlot: planRow.sourceSlot };
        }

        /**
         * After shelf-sourced retranslate (legacy cue path): register translation + cleanup / QC.
         * Engine batch path registers via subtitle-shelf-pipeline-ingest instead.
         * @param {Array<{ item: object, sourcePath: string, destPath: string, mediaId?: string, fromShelf?: boolean }>} rows
         */
        async function finishShelfTranslateRows(rows = []) {
            const list = (Array.isArray(rows) ? rows : []).filter((r) => r?.fromShelf && r?.destPath && r?.item);
            if (!list.length) return;
            const langOpts = (() => {
                const targetForm = settingsNormApi.normalizeSubtitleTargetFormValue
                    ? settingsNormApi.normalizeSubtitleTargetFormValue(
                        els.quickTargetLangSelect?.value
                        || els.chineseSubtitleVariantSelect?.value
                        || 'simplified',
                    )
                    : 'simplified';
                const subtitleTargetLang = settingsNormApi.normalizeSubtitleTargetLang
                    ? settingsNormApi.normalizeSubtitleTargetLang(targetForm, 'simplified')
                    : 'zh-Hans';
                return {
                    subtitleTargetLang,
                    chineseSubtitleVariant: targetForm,
                    translateTarget: subtitleTargetLang,
                };
            })();

            for (const row of list) {
                const mediaId = String(row.mediaId || row.item?.shelfMediaId || '').trim();
                if (!mediaId) continue;
                try {
                    const reg = await electron?.transubShelfRegisterTranslation?.({
                        mediaId,
                        path: row.destPath,
                        options: langOpts,
                    });
                    if (reg?.ok === false) {
                        appendLog(uiTf('字幕库登记译文失败：{err}', { err: reg?.error || '未知错误' }), 'warn');
                    }
                } catch (err) {
                    appendLog(uiTf('字幕库登记译文失败：{err}', { err: err?.message || err }), 'warn');
                }
            }

            appendLog('字幕库翻译：开始按设置执行清除与 QC…', 'info');
            state.postBatchBusy = true;
            updateStartButton();
            try {
                for (const row of list) {
                    const item = row.item;
                    if (!item) continue;
                    item.status = 'done';
                    item.subtitlePath = row.destPath;
                    item.targetSubtitlePath = row.destPath;
                    item.sourceSubtitlePath = row.sourcePath || item.sourceSubtitlePath;
                    item.existingSubtitle = row.destPath;
                }
                renderList();
                const polishItems = list.map((r) => r.item).filter(Boolean);
                await runPostBatchAutoFix(polishItems);
                for (const item of polishItems) {
                    await runPostBatchQcScan({ force: false, onlyItem: item });
                    await runPostBatchQcAutoFixIfEnabled({ onlyItem: item, quiet: true });
                }
                await runPostBatchChineseConvert(polishItems);
                appendLog('字幕库翻译：清除与 QC 完成', 'ok');
            } catch (err) {
                appendLog(uiTf('字幕库翻译后处理失败：{err}', { err: err?.message || err }), 'err');
            } finally {
                for (const row of list) {
                    const item = row?.item;
                    if (!item) continue;
                    item.status = 'done';
                    item.progress = 100;
                    item.stage = '';
                    if (!String(item.detail || '').trim() || /QC|翻译中|重新翻译/.test(String(item.detail || ''))) {
                        item.detail = '字幕库翻译完成';
                    }
                    item.completedAt = item.completedAt || Date.now();
                }
                state.postBatchBusy = false;
                updateStartButton();
                renderList();
                void refreshSubtitleShelf();
            }
        }

        return {
            openShelfTranslate,
            finishShelfTranslateRows,
            readShelfTranslateTargetLangCode,
            ensureShelfTranslateQueueItem,
            applyShelfEntryFields,
            selectOnlyShelfItem,
        };
    }

    return {
        createShelfTranslateFlow,
    };
}));
