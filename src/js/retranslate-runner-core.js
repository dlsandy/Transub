/**
 * Retranslate batch runner (modal confirm → IPC translate → write-back).
 * Shell keeps open/close modal DOM; injects adapters via createRetranslateRunner(deps).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubRetranslateRunner = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function retranslateRunnerFactory() {
    function createRetranslateRunner(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const appendLog = d.appendLog || (() => {});
        const appendRetranslateLog = d.appendRetranslateLog || appendLog;
        const uiTf = d.uiTf || ((s) => s);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const showToast = d.showToast || (() => {});
        const promptProUnlockRequired = d.promptProUnlockRequired || (() => {});
        const closeRetranslateModal = d.closeRetranslateModal || (() => {});
        const readRetranslateModeFromModal = d.readRetranslateModeFromModal || (() => 'llm');
        const readRetranslateSmartHybrid = d.readRetranslateSmartHybrid || (() => true);
        const readRetranslateSmartPolish = d.readRetranslateSmartPolish || (() => true);
        const readRetranslateStyleFromModal = d.readRetranslateStyleFromModal || (() => ({
            translateStyleEnabled: false,
            translateStylePreset: 'natural_spoken',
            translateStyleCustomNote: '',
        }));
        const primarySubFormatFromForm = d.primarySubFormatFromForm || (() => 'srt');
        const normalizeChineseSubtitleVariant = d.normalizeChineseSubtitleVariant
            || ((raw) => String(raw || 'simplified'));
        const settingsNormApi = d.settingsNormApi || {};
        const retranslatePlanApi = d.retranslatePlanApi || {};
        const translateStyleApi = d.translateStyleApi || {};
        const getManagedLlmCatalogApi = d.getManagedLlmCatalogApi || (() => null);
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getSubtitleTargetLangApi = d.getSubtitleTargetLangApi || (() => null);
        const getSoftwareCreditApi = d.getSoftwareCreditApi || (() => null);
        const updateItem = d.updateItem || (() => {});
        const refreshListRow = d.refreshListRow || (() => {});
        const updateStartButton = d.updateStartButton || (() => {});
        const setBadge = d.setBadge || (() => {});
        const ensureLogExpanded = d.ensureLogExpanded || (() => {});
        const activateInferLogTab = d.activateInferLogTab
            || d.activateAppLogTab
            || (() => {});
        const resetJobProgressState = d.resetJobProgressState || (() => {});
        const updateProgressUi = d.updateProgressUi || (() => {});
        const renderList = d.renderList || (() => {});
        const formatDuration = d.formatDuration || ((n) => String(n));
        const elapsedSecSince = d.elapsedSecSince || (() => 0);
        const finishShelfTranslateRows = d.finishShelfTranslateRows || (async () => {});

async function runRetranslateFromModal() {
    const plan = Array.isArray(state.retranslatePlan) ? state.retranslatePlan.slice() : [];
    if (!plan.length) {
        showToast('没有可翻译的条目', 'warn');
        return;
    }
    const mode = readRetranslateModeFromModal();
    if ((mode === 'smart' || mode === 'dialog') && !getAdvancedEntitled()) {
        void promptProUnlockRequired({
            featureLabel: mode === 'dialog' ? '智能翻译' : '混合翻译',
        });
        return;
    }
    const language = String(els.quickLanguageSelect?.value || els.languageSelect?.value || 'ja').trim() || 'ja';
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
    const isZhRetranslateTarget = getSubtitleTargetLangApi()?.isZhSubtitleTarget?.(subtitleTargetLang) !== false;
    const creditLang = getSoftwareCreditApi()?.normalizeCreditLang?.(subtitleTargetLang) || 'zh';
    // Sakura/Gal hybrid is JA→ZH only — never enable for EN/JA/KO 成片
    // dialog: chat line + optional polish; smart: hybrid sentence + polish
    const hybridOn = mode === 'smart' && isZhRetranslateTarget && readRetranslateSmartHybrid();
    const polishOn = (mode === 'smart' || mode === 'dialog') && readRetranslateSmartPolish();
    const smartUi = (mode === 'smart' || mode === 'dialog') && retranslatePlanApi.buildRetranslateSmartUiState
        ? retranslatePlanApi.buildRetranslateSmartUiState({
            hybridOn: mode === 'smart' ? hybridOn : false,
            polishOn,
        })
        : null;
    const showDialogModel = mode === 'dialog'
        || mode !== 'smart'
        || (smartUi ? smartUi.showDialogModel : true);
    const modelId = showDialogModel
        ? String(els.retranslateModelSelect?.value || '').trim()
        : '';
    const hybridMtModelId = hybridOn
        ? String(els.retranslateHybridMtSelect?.value || '').trim()
        : '';
    if (mode === 'llm' && !modelId) {
        showToast('请选择推理翻译模型', 'warn');
        return;
    }
    if (mode === 'dialog') {
        if (!modelId) {
            showToast('请选择已下载的润色模型（设置 → Pro → 智能翻译）', 'warn');
            return;
        }
        const catalogApi = getManagedLlmCatalogApi();
        const block = catalogApi?.getSmartTranslateModelBlock?.(modelId);
        if (block?.ok === false) {
            showToast(block.error || '所选模型不可用于智能翻译', 'warn');
            return;
        }
    }
    if (mode === 'smart') {
        if (smartUi?.requireDialogModel && !modelId) {
            showToast('请选择已下载的润色模型（设置 → Pro → 智能翻译）', 'warn');
            return;
        }
        if (modelId) {
            const catalogApi = getManagedLlmCatalogApi();
            const block = catalogApi?.getSmartTranslateModelBlock?.(modelId);
            if (block?.ok === false) {
                showToast(block.error || '所选模型不可用于智能翻译', 'warn');
                return;
            }
        }
    }
    closeRetranslateModal();

    const chineseSubtitleVariant = (targetForm === 'en' || targetForm === 'ja' || targetForm === 'ko')
        ? 'simplified'
        : normalizeChineseSubtitleVariant(targetForm);
    const targetLanguageLabel = getSubtitleTargetLangApi()?.subtitleTargetLangLabel?.(subtitleTargetLang)
        || chineseSubtitleVariant;
    const faithfulTone = !!els.smartTranslateFaithfulCheck?.checked;
    const retranslateStyle = readRetranslateStyleFromModal();
    if (retranslateStyle.translateStyleEnabled
        && retranslateStyle.translateStylePreset === 'custom'
        && !getAdvancedEntitled()) {
        showToast('自定义译文风格需 Pro', 'warn');
        return;
    }
    // Sync modal style onto plan items so badges match this run.
    for (const row of plan) {
        const it = row?.item;
        if (!it) continue;
        if (!retranslateStyle.translateStyleEnabled) {
            delete it.translateStylePreset;
            delete it.translateStyleCustomNote;
            delete it.translateStyleUserSet;
            delete it.translateStyleSenseSuggested;
        } else {
            it.translateStylePreset = retranslateStyle.translateStylePreset;
            it.translateStyleUserSet = true;
            delete it.translateStyleSenseSuggested;
            if (retranslateStyle.translateStylePreset === 'custom' && retranslateStyle.translateStyleCustomNote) {
                it.translateStyleCustomNote = retranslateStyle.translateStyleCustomNote;
            } else {
                delete it.translateStyleCustomNote;
            }
        }
        refreshListRow(it);
    }

    state.retranslateBusy = true;
    state.retranslateAbort = false;
    updateStartButton();
    setBadge('重新翻译', 'running');
    ensureLogExpanded();
    activateInferLogTab();
    const modeLabel = mode === 'dialog'
        ? '智能翻译'
        : (mode === 'smart'
            ? '混合翻译'
            : (mode === 'engine' ? '机器翻译' : '推理翻译'));
    const smartBits = [];
    if (mode === 'dialog') {
        if (modelId) smartBits.push(modelId);
    } else if (mode === 'smart') {
        if (hybridOn) smartBits.push(hybridMtModelId ? uiTf('翻译 {id}', { id: hybridMtModelId }) : '翻译自动');
        if (polishOn) smartBits.push(modelId ? uiTf('润色 {id}', { id: modelId }) : '润色自动');
        else if (!hybridOn && modelId) smartBits.push(modelId);
    } else if (modelId) {
        smartBits.push(modelId);
    }
    appendRetranslateLog(
        `开始重新翻译 ${plan.length} 项（${modeLabel}${smartBits.length ? ` · ${smartBits.join(' · ')}` : ''} · 风格 ${
            retranslateStyle.translateStyleEnabled
                ? (translateStyleApi.getPresetLabel?.(retranslateStyle.translateStylePreset)
                    || retranslateStyle.translateStylePreset)
                : '关闭'
        }）…`,
        'info',
    );

    let okCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let aborted = false;
    let activeIndex = 0;
    let activeName = '';
    let activePath = '';
    let lastProgressLogAt = 0;
    let lastProgressLogKey = '';
    const startedAt = Date.now();
    /** @type {Array<object>} */
    const shelfDoneRows = [];

    const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const setRetranslateProgress = ({
        index = activeIndex,
        itemPct = 0,
        detail = '',
        name = activeName,
        path = activePath,
        log = false,
    } = {}) => {
        const pctInfo = retranslatePlanApi.computeRetranslateOverallPct
            ? retranslatePlanApi.computeRetranslateOverallPct({
                index,
                itemPct,
                total: plan.length,
            })
            : (() => {
                const total = Math.max(1, plan.length);
                const idx = Math.max(0, Math.min(total - 1, Number(index) || 0));
                const within = Math.max(0, Math.min(1, (Number(itemPct) || 0) / 100));
                const overall = Math.max(0, Math.min(100, Math.round(((idx + within) / total) * 100)));
                const displayOverall = overall >= 100 && idx < total - 1 ? 99 : Math.min(99, overall);
                return { displayOverall, index: idx, total };
            })();
        const total = pctInfo.total;
        const idx = pctInfo.index;
        const displayOverall = pctInfo.displayOverall;
        const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

        const labelDetail = String(detail || '').trim();
        if (els.progressBar) els.progressBar.style.width = `${displayOverall}%`;
        if (els.progressLabel) {
            els.progressLabel.textContent = labelDetail
                ? uiTf('重新翻译 {i}/{total}：{detail}', { i: idx + 1, total, detail: labelDetail })
                : (name
                    ? uiTf('重新翻译 {i}/{total}：{name}', { i: idx + 1, total, name })
                    : uiTf('重新翻译 {i}/{total}', { i: idx + 1, total }));
        }
        if (els.progressCount) {
            els.progressCount.textContent = `${idx + 1} / ${total} · ${displayOverall}%`;
        }
        if (els.currentFile && (name || path)) {
            els.currentFile.textContent = `${name || basename(path)}（${idx + 1}/${total}）`;
            els.currentFile.title = path || name || '';
        }
        if (path) {
            updateItem(path, {
                status: 'running',
                progress: clampPct(itemPct),
                detail: labelDetail || '重新翻译中…',
                // Skip ASR/prep in the factory pipeline rail (shelf 原文/转录 → 译).
                stage: 'translate',
            });
        }
        if (log && labelDetail) {
            const key = `${idx}|${labelDetail}`;
            const now = Date.now();
            if (key !== lastProgressLogKey && now - lastProgressLogAt >= 1200) {
                lastProgressLogKey = key;
                lastProgressLogAt = now;
                appendRetranslateLog(`· ${name || basename(path) || '条目'} · ${labelDetail}`, 'info');
            }
        }
    };

    const onTranslateProgress = (info) => {
        if (!info || !state.retranslateBusy) return;
        const pctRaw = Number(info.pct ?? info.percent);
        let itemPct = Number.isFinite(pctRaw) ? pctRaw : 0;
        if (!Number.isFinite(pctRaw) && info.chunk && info.total) {
            itemPct = (Number(info.chunk) / Math.max(1, Number(info.total))) * 90;
        }
        // Leave headroom for write-back (≈90–100).
        itemPct = Math.min(92, Math.max(4, itemPct || 8));
        const phase = String(info.phase || '').trim();
        let detail = String(info.message || info.detail || '').trim();
        if (!detail) {
            if (phase === 'brief' || phase === 'brief-done') detail = '理解全文…';
            else if (phase === 'consistency') detail = '一致性校对…';
            else if (info.chunk && info.total) detail = uiTf('翻译分块 {chunk}/{total}', { chunk: info.chunk, total: info.total });
            else if (phase === 'chunk' || phase === 'chunk-done' || phase === 'chunk-retry') {
                detail = phase === 'chunk-retry' ? '分块重试中…' : '分块翻译中…';
            } else if (phase === 'start') detail = '启动翻译引擎…';
            else if (phase === 'done') detail = '翻译完成，准备写回…';
            else detail = '翻译中…';
        }
        setRetranslateProgress({
            index: activeIndex,
            itemPct,
            detail,
            name: activeName,
            path: activePath,
            log: true,
        });
    };

    const unsubs = [];
    if (mode === 'engine' && electron?.onEngineTranslateProgress) {
        unsubs.push(electron.onEngineTranslateProgress(onTranslateProgress));
    } else if ((mode === 'smart' || mode === 'dialog') && electron?.onAdvancedReconstructProgress) {
        unsubs.push(electron.onAdvancedReconstructProgress(onTranslateProgress));
    } else if (mode === 'llm' && electron?.onSakuraTranslateProgress) {
        unsubs.push(electron.onSakuraTranslateProgress(onTranslateProgress));
    }

    setRetranslateProgress({
        index: 0,
        itemPct: 0,
        detail: '准备中…',
    });
    if (els.progressBar) els.progressBar.style.width = '0%';
    if (els.progressCount) els.progressCount.textContent = `0 / ${plan.length}`;

    try {
        for (let i = 0; i < plan.length; i += 1) {
            if (state.retranslateAbort) {
                aborted = true;
                break;
            }
            const row = plan[i];
            const item = row.item;
            const name = basename(item.path);
            activeIndex = i;
            activeName = name;
            activePath = item.path;
            lastProgressLogKey = '';
            const mtLanguage = (() => {
                const fromRow = String(row.sourceLanguage || '').trim().toLowerCase();
                if (fromRow && fromRow !== 'auto' && fromRow !== 'source') return fromRow;
                const fromForm = String(language || '').trim().toLowerCase();
                if (fromForm && fromForm !== 'auto') return fromForm;
                return 'ja';
            })();

            updateItem(item.path, {
                status: 'running',
                progress: 0,
                detail: '准备重新翻译…',
                startedAt: Date.now(),
                stage: 'translate',
                pipeHighWater: Math.max(3, Number(item.pipeHighWater) || 0),
                pipelineFloor: 3,
            });
            setRetranslateProgress({
                index: i,
                itemPct: 2,
                detail: '读取源字幕…',
                name,
                path: item.path,
            });
            appendRetranslateLog(
                uiTf('重新翻译 {i}/{total}：{name} ← {src}', { i: i + 1, total: plan.length, name, src: basename(row.sourcePath) })
                + `（${modeLabel}${modelId ? ` · ${modelId}` : ''}${row.fromShelf ? ` · 源语 ${mtLanguage}` : ''}）`,
                'info',
            );

            let cues = row.cues;
            if (!Array.isArray(cues) || !cues.length) {
                const doc = await electron?.transubReadSubtitle?.({ path: row.sourcePath });
                if (!doc?.ok || !doc.cues?.length) {
                    failCount += 1;
                    updateItem(item.path, {
                        status: 'failed',
                        progress: 0,
                        detail: doc?.error || '读取转录字幕失败',
                        completedAt: Date.now(),
                    });
                    appendRetranslateLog(`失败：${name} — 无法读取转录字幕`, 'err');
                    setRetranslateProgress({
                        index: i,
                        itemPct: 100,
                        detail: '读取失败',
                        name,
                        path: item.path,
                    });
                    continue;
                }
                cues = doc.cues;
                row.format = doc.format || row.format;
            }

            const allPayloadCues = cues.map((c, idx) => ({
                index: Number.isInteger(Number(c.index)) ? Number(c.index) : idx,
                startMs: c.startMs,
                endMs: c.endMs,
                text: String(c.text || ''),
            })).filter((c) => String(c.text || '').trim());

            let destCuesForMerge = null;
            // Shelf first-write / overwrite: do not merge against an old dest track —
            // prior bad files + credit heuristics easily scramble cue order (乱翻).
            if (!row.fromShelf && row.destPath && row.destPath !== row.sourcePath) {
                const destDoc = await electron?.transubReadSubtitle?.({ path: row.destPath });
                if (destDoc?.ok && Array.isArray(destDoc.cues)) destCuesForMerge = destDoc.cues;
            }

            const parted = retranslatePlanApi.partitionRetranslatePayload
                ? retranslatePlanApi.partitionRetranslatePayload(allPayloadCues, {
                    isPro: getAdvancedEntitled(),
                    lang: creditLang,
                })
                : { mtCues: allPayloadCues, restoreByIndex: new Map(), skipped: 0 };
            let restoreByIndex = parted.restoreByIndex instanceof Map
                ? parted.restoreByIndex
                : new Map();
            if (destCuesForMerge && retranslatePlanApi.augmentCreditRestoreMap) {
                restoreByIndex = retranslatePlanApi.augmentCreditRestoreMap(
                    allPayloadCues,
                    destCuesForMerge,
                    restoreByIndex,
                    { isPro: getAdvancedEntitled(), lang: creditLang },
                );
                if (restoreByIndex.size > parted.skipped) {
                    appendRetranslateLog(
                        `· ${name} · 从现有译文恢复软件信息 ${restoreByIndex.size - parted.skipped} 条`,
                        'info',
                    );
                }
            }
            const payloadCues = (parted.mtCues || allPayloadCues)
                .filter((c) => {
                    const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : -1;
                    return String(c.text || '').trim() && !restoreByIndex.has(idx);
                });
            if (parted.skipped > 0 || restoreByIndex.size > 0) {
                appendRetranslateLog(
                    `· ${name} · 软件信息 ${restoreByIndex.size || parted.skipped} 条跳过模型（写回时恢复）`,
                    'info',
                );
            }

            if (!payloadCues.length && !restoreByIndex.size) {
                skipCount += 1;
                updateItem(item.path, {
                    status: 'skipped',
                    progress: 100,
                    detail: '转录字幕为空',
                    completedAt: Date.now(),
                });
                appendRetranslateLog(`跳过：${name} — 转录字幕为空`, 'warn');
                setRetranslateProgress({
                    index: i,
                    itemPct: 100,
                    detail: '已跳过（空字幕）',
                    name,
                    path: item.path,
                });
                continue;
            }

            let translated;
            if (!payloadCues.length) {
                // Only software-credit lines — restore watermark without calling MT.
                translated = {
                    ok: true,
                    cues: [],
                    summary: uiTf('软件信息 {n} 条', { n: restoreByIndex.size }),
                };
            } else {
                appendRetranslateLog(`· ${name} · 共 ${payloadCues.length} 条，开始${modeLabel}…`, 'info');
                setRetranslateProgress({
                    index: i,
                    itemPct: 8,
                    detail: uiTf('翻译中（{n} 条）…', { n: payloadCues.length }),
                    name,
                    path: item.path,
                });

                if (mode === 'smart' || mode === 'dialog') {
                    translated = await electron?.transubAdvancedSmartTranslate?.({
                        cues: payloadCues,
                        chineseSubtitleVariant,
                        subtitleTargetLang,
                        targetLanguage: targetLanguageLabel,
                        targetLang: subtitleTargetLang,
                        smartTranslateFaithfulTone: faithfulTone,
                        faithfulTone,
                        smartTranslateHybridMt: mode === 'smart' && hybridOn,
                        smartTranslatePlotPolish: polishOn,
                        smartTranslateFaithfulVerify: polishOn,
                        smartTranslateAddressConsistency: polishOn,
                        engineLlmMtModel: hybridMtModelId || undefined,
                        hybridMtModelId: hybridMtModelId || undefined,
                        language: mtLanguage,
                        sourceLanguage: mtLanguage,
                        modelId: modelId || undefined,
                        smartTranslateModelId: modelId || undefined,
                        translateMode: mode,
                        fileName: name,
                        sourcePath: row.sourcePath,
                        path: row.sourcePath,
                        mediaPath: item.path,
                        videoPath: item.path,
                        ...retranslateStyle,
                    });
                } else if (mode === 'engine') {
                    translated = await electron?.transubEngineTranslateCues?.({
                        cues: payloadCues,
                        language: mtLanguage,
                        mtModel: modelId || undefined,
                        options: {
                            language: mtLanguage,
                            engineMtModel: modelId || undefined,
                            engineOpusMtModel: modelId || undefined,
                            chineseSubtitleVariant,
                            subtitleTargetLang,
                            targetLang: subtitleTargetLang,
                            targetLanguage: targetLanguageLabel,
                            ...retranslateStyle,
                        },
                    });
                } else {
                    translated = await electron?.transubSakuraTranslate?.({
                        cues: payloadCues,
                        modelId,
                        faithfulTone,
                        smartTranslateFaithfulTone: faithfulTone,
                        sakuraNsfwPrompt: faithfulTone || undefined,
                        applyNsfwLexicon: faithfulTone || undefined,
                        contentProfile: item.sense?.classification?.profile || undefined,
                        fileName: name,
                        sourcePath: row.sourcePath,
                        language: mtLanguage,
                        sourceLanguage: mtLanguage,
                        chineseSubtitleVariant,
                        subtitleTargetLang,
                        targetLang: subtitleTargetLang,
                        targetLanguage: targetLanguageLabel,
                        ...retranslateStyle,
                    });
                }
            }

            if (state.retranslateAbort || translated?.cancelled) {
                aborted = true;
                updateItem(item.path, {
                    status: 'cancelled',
                    detail: '已取消',
                    completedAt: Date.now(),
                });
                appendRetranslateLog(`已取消：${name}`, 'warn');
                break;
            }
            if (!translated?.ok) {
                failCount += 1;
                const err = translated?.error || '翻译失败';
                updateItem(item.path, {
                    status: 'failed',
                    detail: err,
                    completedAt: Date.now(),
                });
                appendRetranslateLog(`失败：${name} — ${err}`, 'err');
                setRetranslateProgress({
                    index: i,
                    itemPct: 100,
                    detail: '翻译失败',
                    name,
                    path: item.path,
                });
                continue;
            }

            setRetranslateProgress({
                index: i,
                itemPct: 94,
                detail: '写回译文…',
                name,
                path: item.path,
            });
            appendRetranslateLog(`· ${name} · 写回 ${basename(row.destPath)}…`, 'info');

            const map = new Map(
                (translated.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]),
            );
            let nextCues = retranslatePlanApi.mergeRetranslateCues
                ? retranslatePlanApi.mergeRetranslateCues(cues, translated.cues || [], {
                    translatedIndexes: payloadCues.map((c) => Number(c.index)),
                    restoreByIndex,
                    destCues: destCuesForMerge,
                    isPro: getAdvancedEntitled(),
                    lang: creditLang,
                })
                : cues.map((c, idx) => {
                    const index = Number.isInteger(Number(c.index)) ? Number(c.index) : idx;
                    if (restoreByIndex.has(index)) {
                        return { ...c, text: restoreByIndex.get(index) };
                    }
                    if (!map.has(index)) {
                        const sent = payloadCues.some((p) => Number(p.index) === index);
                        return sent ? { ...c, text: '…' } : { ...c };
                    }
                    return { ...c, text: map.get(index) };
                });
            if (retranslatePlanApi.ensureRetranslateSoftwareCredit) {
                const hadDestCredit = destCuesForMerge?.some((c) => (
                    getSoftwareCreditApi()?.isSoftwareCreditText?.(String(c?.text ?? ''))
                ));
                const creditEnsured = retranslatePlanApi.ensureRetranslateSoftwareCredit(nextCues, {
                    isPro: getAdvancedEntitled(),
                    lang: creditLang,
                    insertSoftwareCredit: hadDestCredit
                        || els.insertSoftwareCreditCheck?.checked !== false,
                });
                nextCues = creditEnsured.cues;
            }
            const written = await electron?.transubWriteSubtitle?.({
                path: row.destPath,
                format: row.format || primarySubFormatFromForm(),
                cues: nextCues,
                videoPath: item.path,
            });
            if (!written?.ok) {
                failCount += 1;
                const err = written?.error || '写入译文失败';
                updateItem(item.path, {
                    status: 'failed',
                    detail: err,
                    completedAt: Date.now(),
                });
                appendRetranslateLog(`失败：${name} — ${err}`, 'err');
                continue;
            }

            okCount += 1;
            if (row.fromShelf || row.mediaId || item.fromShelf) {
                shelfDoneRows.push({
                    item,
                    sourcePath: row.sourcePath,
                    destPath: row.destPath,
                    mediaId: row.mediaId || item.shelfMediaId || '',
                    fromShelf: true,
                });
            }
            updateItem(item.path, {
                status: 'done',
                progress: 100,
                detail: '重新翻译完成',
                selected: false,
                subtitlePath: row.destPath,
                existingSubtitle: row.destPath,
                targetSubtitlePath: row.destPath,
                sourceSubtitlePath: row.sourceKind === 'kept'
                    ? (item.sourceSubtitlePath || undefined)
                    : row.sourcePath,
                completedAt: Date.now(),
            });
            setRetranslateProgress({
                index: i,
                itemPct: 100,
                detail: '本条完成',
                name,
                path: item.path,
            });
            const via = translated.summary || translated.message || `${(translated.cues || []).length} 条`;
            appendRetranslateLog(`完成：${name} → ${basename(row.destPath)}（${via}）`, 'ok');
        }
    } finally {
        for (const off of unsubs) {
            try { if (typeof off === 'function') off(); } catch { /* ignore */ }
        }
        const shelfRows = shelfDoneRows.slice();
        const fromShelf = !!state.retranslateFromShelf || shelfRows.length > 0;
        state.retranslateBusy = false;
        state.retranslateAbort = false;
        state.retranslatePlan = null;
        state.retranslateFromShelf = false;
        updateStartButton();
        resetJobProgressState();
        updateProgressUi({ force: true });
        const elapsed = formatDuration(elapsedSecSince(startedAt));
        const summary = aborted
            ? uiTf('重新翻译已停止：成功 {ok}{fail} · 用时 {elapsed}', {
                ok: okCount,
                fail: failCount ? uiTf(' · 失败 {n}', { n: failCount }) : '',
                elapsed,
            })
            : uiTf('重新翻译结束：成功 {ok}{fail}{skip} · 用时 {elapsed}', {
                ok: okCount,
                fail: failCount ? uiTf(' · 失败 {n}', { n: failCount }) : '',
                skip: skipCount ? uiTf(' · 跳过 {n}', { n: skipCount }) : '',
                elapsed,
            });
        appendRetranslateLog(summary, aborted || failCount ? 'warn' : 'ok', { toast: false });
        setBadge(
            aborted ? '已停止' : (failCount ? '部分失败' : '已完成'),
            aborted || failCount ? 'error' : 'done',
        );
        showToast(summary, aborted || failCount ? 'warn' : 'ok');
        renderList();
        if (fromShelf && shelfRows.length && !aborted) {
            await finishShelfTranslateRows(shelfRows);
        }
    }
}


        return { runRetranslateFromModal };
    }

    return { createRetranslateRunner };
}));
