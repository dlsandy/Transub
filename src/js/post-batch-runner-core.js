/**
 * Post-batch QC / autofix / Chinese convert / text-preset runners (orchestration).
 * Shell injects DOM/IPC/state via createPostBatchRunner(deps).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPostBatchRunner = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function postBatchRunnerFactory() {
    /**
     * @param {object} deps shell adapters
     */
    function createPostBatchRunner(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els;
        const electron = d.electron;
        const appendLog = d.appendLog || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const basename = d.basename || ((p) => String(p || '').split(/[/\\]/).pop() || '');
        const appConfirm = d.appConfirm || (async () => false);
        const getSubtitlePathForItem = d.getSubtitlePathForItem;
        const getPostBatchPathsForItem = d.getPostBatchPathsForItem;
        const resolveQcSemanticPairPathForItem = d.resolveQcSemanticPairPathForItem;
        const refreshListRow = d.refreshListRow || (() => {});
        const updateProgressUi = d.updateProgressUi || (() => {});
        const renderList = d.renderList || (() => {});
        const updateQcBanner = d.updateQcBanner || (() => {});
        const perItemQcApi = d.perItemQcApi || {};
        const getPostBatchQcFixMode = d.getPostBatchQcFixMode || (() => 'none');
        const normalizePostBatchQcFixMode = d.normalizePostBatchQcFixMode || ((v) => v);
        const promptProUnlockRequired = d.promptProUnlockRequired || (() => {});
        const markItemQcFixed = d.markItemQcFixed || (() => {});
        const countQcIssues = d.countQcIssues || (() => 0);
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => ({}));
        const setSavedOptionsSnapshot = d.setSavedOptionsSnapshot || (() => {});
        const ensureJobRuntimeScripts = d.ensureJobRuntimeScripts || (async () => {});
        const postBatchAutofixApi = d.postBatchAutofixApi || {};
        const settingsNormApi = d.settingsNormApi || {};
        const normalizeViewingCleanMode = d.normalizeViewingCleanMode;
        const isTranslateLikeTask = d.isTranslateLikeTask || (() => false);
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const readDualLineOrderFromForm = d.readDualLineOrderFromForm || (() => 'target-first');
        const getAdvancedEntitled = typeof d.getAdvancedEntitled === 'function'
            ? d.getAdvancedEntitled
            : () => !!d.advancedEntitled;
        const getContentProfileApi = d.getContentProfileApi || (() => null);
        const getQcSmartApi = d.getQcSmartApi || (() => null);
        const getSubtitleTargetLangApi = d.getSubtitleTargetLangApi || (() => null);

function patchItemQcRunning(item, phase, localPct = 0) {
    if (!item) return;
    const pct = perItemQcApi.mapPostTaskProgress
        ? perItemQcApi.mapPostTaskProgress(phase === 'scan' ? 'qc' : 'fix', localPct)
        : (perItemQcApi.mapQcFixProgress ? perItemQcApi.mapQcFixProgress(localPct) : 98);
    const detail = perItemQcApi.postTaskPhaseDetail
        ? perItemQcApi.postTaskPhaseDetail(phase)
        : (phase === 'scan' ? 'QC检测中…' : 'QC修复中…');
    item.status = 'running';
    item.stage = perItemQcApi.QC_STAGE || 'qc_fix';
    item.progress = pct;
    item.detail = detail;
    refreshListRow(item);
    updateProgressUi({ force: true });
}

async function scanQcForItems(targets, { quiet = false } = {}) {
    if (!electron?.transubScanSubtitleQc) return { withIssues: 0, scanned: 0 };
    const list = (Array.isArray(targets) ? targets : []).filter((item) => {
        if (!item) return false;
        if (item.status !== 'done' && item.status !== 'skipped' && item.stage !== 'qc_fix') return false;
        return !!getSubtitlePathForItem(item);
    });
    if (!list.length) return { withIssues: 0, scanned: 0 };

    if (!quiet) {
        els.progressLabel.textContent = 'QC 检测中…';
        appendLog(`开始 QC 检测（${list.length} 个字幕）…`, 'info');
    }
    let withIssues = 0;
    for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const subPath = getSubtitlePathForItem(item);
        if (!quiet) els.progressLabel.textContent = uiTf('QC 检测中… {i}/{total}', { i: i + 1, total: list.length });
        try {
            const res = await electron.transubScanSubtitleQc({ path: subPath });
            if (res?.ok) {
                item.qcIssueCount = Number(res.issueCount) || 0;
                item.qcSummary = res.shortSummary || res.summaryText || '';
                item.qcIssues = Array.isArray(res.issues) ? res.issues : [];
                item.qcError = '';
                if (item.qcIssueCount > 0) withIssues += 1;
            } else {
                item.qcError = res?.error || 'QC 失败';
                item.qcIssueCount = undefined;
            }
        } catch (err) {
            item.qcError = err?.message || 'QC 失败';
            item.qcIssueCount = undefined;
        }
        refreshListRow(item);
    }
    return { withIssues, scanned: list.length };
}

async function runPostBatchQcScan({ force = false, onlyItem = null } = {}) {
    if (!force && !els.postBatchQcCheck?.checked) return { withIssues: 0, scanned: 0 };
    if (!electron?.transubScanSubtitleQc) return { withIssues: 0, scanned: 0 };
    const targets = onlyItem
        ? [onlyItem]
        : state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return !!getSubtitlePathForItem(item);
        });
    const list = targets.filter(Boolean);
    if (!list.length) return { withIssues: 0, scanned: 0 };

    const { withIssues, scanned } = await scanQcForItems(list);
    const willAutoFix = getPostBatchQcFixMode() !== 'none' && withIssues > 0;
    appendLog(
        withIssues > 0
            ? (willAutoFix
                ? uiTf('QC 完成：{withIssues}/{scanned} 个字幕存在问题，即将自动修复…', { withIssues, scanned })
                : uiTf('QC 完成：{withIssues}/{scanned} 个字幕存在问题（仅标记，未自动修复）', { withIssues, scanned }))
            : uiTf('QC 完成：{scanned} 个字幕均未发现问题', { scanned }),
        withIssues > 0 ? 'warn' : 'ok',
    );
    els.progressLabel.textContent = withIssues > 0 ? 'QC 完成（有问题项）' : 'QC 完成';
    if (withIssues > 0) state.qcBannerDismissed = false;
    renderList();
    updateQcBanner();
    return { withIssues, scanned };
}

async function runPostBatchQcSmartFix(onlyItem = null, { confirm = true, quiet = false } = {}) {
    if (state.qcFixing && !(onlyItem && quiet)) return;
    if (state.running && !onlyItem) return;
    if (!getAdvancedEntitled()) {
        if (!quiet) void promptProUnlockRequired({ featureLabel: 'QC 智能修复' });
        return;
    }
    if (!electron?.transubAdvancedQcSmartFix) {
        if (!quiet) appendLog('当前环境不支持 QC 智能修复', 'err');
        return;
    }
    const targets = onlyItem
        ? [onlyItem]
        : state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!(Number(item.qcIssueCount) > 0)) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
    const list = targets.filter(Boolean);
    if (!list.length) {
        if (confirm && !quiet) appendLog('没有可智能修复的 QC 条目（需为 .srt/.vtt/.lrc）', 'info');
        return;
    }

    const pathCount = list.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
    if (confirm) {
        const confirmMsg = onlyItem
            ? uiTf('确定对「{name}」做 QC 智能修复吗？\n将按素材类型调整强度，并依次：规则修复 → 智能断句 → 局部重转写（连续句/低置信窗，需视频）→ 通顺整理与清怪；有原文对照时再做语义审阅采纳。', { name: basename(onlyItem.path) })
            : uiTf('确定 QC 智能修复吗？\n将处理 {n} 条任务、写回 {pathCount} 个字幕（内容画像 + 规则/断句/连续句与低置信局部重转写/通顺整理与清怪；双语任务含语义审阅）。', { n: list.length, pathCount });
        const yes = await appConfirm({
            title: 'QC 智能修复 (Pro)',
            message: confirmMsg,
            primaryLabel: '开始智能修复',
            secondaryLabel: '取消',
        });
        if (!yes) return;
    }

    if (!quiet) {
        state.qcFixing = true;
        state.qcSmartFixing = true;
        updateQcBanner();
    }
    if (!quiet) {
        els.progressLabel.textContent = 'QC 智能修复中，请稍候…';
        appendLog(
            confirm
                ? uiTf('开始 QC 智能修复（{pathCount} 个字幕文件 / {n} 条任务）…', { pathCount, n: list.length })
                : uiTf('单条 QC 智能修复（{pathCount} 个字幕）…', { pathCount }),
            'info',
        );
    }
    let written = 0;
    let fileTotal = 0;
    let phaseHint = '准备中';
    const unsubQcProgress = electron.onAdvancedReconstructProgress?.((info) => {
        if (!info) return;
        const mode = String(info.mode || '');
        if (mode && mode !== 'qc-smart' && mode !== 'semantic-review' && mode !== 'single') return;
        phaseHint = String(info.message || info.detail || phaseHint).trim() || phaseHint;
        els.progressLabel.textContent = pathCount > 0
            ? uiTf('QC 智能修复中，请稍候… {fileTotal}/{pathCount} · {phaseHint}', { fileTotal, pathCount, phaseHint })
            : uiTf('QC 智能修复中，请稍候… · {phaseHint}', { phaseHint });
    }) || null;
    try {
        for (let i = 0; i < list.length; i += 1) {
            const item = list[i];
            if (onlyItem && quiet) patchItemQcRunning(item, 'fix', 50 + Math.round((i / Math.max(1, list.length)) * 40));
            const paths = getPostBatchPathsForItem(item);
            const profile = item.sense?.classification?.profile
                || (getContentProfileApi()?.classifyContentProfile?.({ path: item.path })?.profile)
                || 'unknown';
            const preset = getContentProfileApi()?.qcPresetForProfile?.(profile) || {};
            let itemOk = false;
            let itemWritten = 0;
            let lastSummary = '';
            for (const subPath of paths) {
                fileTotal += 1;
                phaseHint = basename(subPath);
                els.progressLabel.textContent = uiTf('QC 智能修复中，请稍候… {fileTotal}/{pathCount} · {phaseHint}', { fileTotal, pathCount, phaseHint });
                try {
                    const pairPath = resolveQcSemanticPairPathForItem(item, subPath);
                    let savedQc = getSavedOptionsSnapshot() || {};
                    try {
                        const optsRes = await electron?.transWithAiGetOptions?.();
                        if (optsRes?.options) {
                            savedQc = { ...savedQc, ...optsRes.options };
                            setSavedOptionsSnapshot(optsRes.options);
                        }
                    } catch { /* keep snapshot */ }
                    const silenceCharsRaw = Number(savedQc.qcSilenceSplitChars);
                    const res = await electron.transubAdvancedQcSmartFix({
                        path: subPath,
                        mediaPath: item.path,
                        profile,
                        ...preset,
                        // 用户已点「智能修复」：按设置页步骤开关覆盖画像默认
                        llmSplit: savedQc.qcSmartLlmSplit !== false,
                        retranscribeConnected: savedQc.qcSmartRetranscribe !== false,
                        smartFix: true,
                        pairPath: pairPath || undefined,
                        // Prefer JA/source sidecar for low-confidence retranscribe windows
                        sourceSubtitlePath: pairPath || subPath,
                        subtitlePath: subPath,
                        semanticReview: savedQc.qcSmartSemanticReview !== false && !!pairPath,
                        intensity: savedQc.qcSmartIntensity || preset.intensity || 'light',
                        maxRetranscribeRanges: Number(savedQc.qcSmartMaxRetranscribeRanges) || 8,
                        qcSilenceSplitChars: Number.isFinite(silenceCharsRaw) && silenceCharsRaw >= 0
                            ? silenceCharsRaw
                            : 15,
                        backupMode: 'off',
                    });
                    if (res?.ok && res.written) {
                        written += 1;
                        itemWritten += 1;
                        itemOk = true;
                        lastSummary = res.summary || '已智能修复 QC';
                        appendLog(`${basename(subPath)}：${lastSummary}`, 'ok');
                    } else if (res?.ok) {
                        itemOk = true;
                        lastSummary = res.summary || '无需写回';
                        appendLog(`${basename(subPath)}：${lastSummary}`, 'info');
                    } else {
                        appendLog(`${basename(subPath)}：${res?.error || 'QC 智能修复失败'}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(subPath)}：${err?.message || 'QC 智能修复失败'}`, 'err');
                }
            }
            if (itemOk) {
                markItemQcFixed(item, 'smart', {
                    written: itemWritten > 0,
                    summary: lastSummary || '已智能修复 QC',
                });
            } else if (onlyItem && quiet && item.status === 'running') {
                item.status = 'done';
                item.progress = 100;
                item.stage = '';
                item.detail = item.detail && !/QC/.test(item.detail) ? item.detail : '已完成';
                refreshListRow(item);
            }
        }
        if (!quiet) {
            appendLog(
                written > 0
                    ? uiTf('QC 智能修复写回完成：{written}/{fileTotal} 个字幕；正在复查…', { written, fileTotal })
                    : uiTf('QC 智能修复完成：{fileTotal} 个字幕均无需写回；正在复查…', { fileTotal }),
                written > 0 ? 'ok' : 'info',
            );
        }
        const { withIssues, scanned } = await scanQcForItems(list, { quiet: true });
        if (!quiet) {
            appendLog(
                withIssues > 0
                    ? uiTf('QC 复查：仍有 {withIssues}/{scanned} 个字幕存在问题', { withIssues, scanned })
                    : uiTf('QC 复查：{scanned} 个字幕已通过', { scanned }),
                withIssues > 0 ? 'warn' : 'ok',
            );
        }
        if (withIssues > 0 && !quiet) {
            try {
                const smartApi = getQcSmartApi();
                if (typeof smartApi?.planPostBatchResidualHarvest === 'function') {
                    const residualIssues = [];
                    for (const item of list) {
                        const issueList = Array.isArray(item.qcIssues) ? item.qcIssues : [];
                        for (const issue of issueList) residualIssues.push(issue);
                    }
                    const harvest = smartApi.planPostBatchResidualHarvest(residualIssues);
                    if (harvest.total > 0) {
                        appendLog(`${harvest.summary}（勿整句润色入库）`, 'info');
                        if (harvest.blank?.length) {
                            appendLog(
                                uiTf('其中空/省略 {n} 条可在下次智能修复时优先语义补译', { n: harvest.blank.length }),
                                'info',
                            );
                        }
                    }
                }
            } catch (_) { /* ignore */ }
        }
        if (!quiet) {
            els.progressLabel.textContent = withIssues > 0 ? 'QC 智能修复完成（仍有问题）' : 'QC 智能修复完成';
            state.qcBannerDismissed = countQcIssues() <= 0;
        }
    } finally {
        if (typeof unsubQcProgress === 'function') {
            try { unsubQcProgress(); } catch (_) { /* ignore */ }
        }
        if (!quiet) {
            state.qcFixing = false;
            state.qcSmartFixing = false;
            renderList();
            updateQcBanner();
        }
    }
}

async function runPostBatchQcFix(onlyItem = null, { confirm = true, quiet = false } = {}) {
    if (state.qcFixing && !(onlyItem && quiet)) return;
    if (state.running && !onlyItem) return;
    if (!electron?.transubApplySubtitlePostprocess) {
        if (!quiet) appendLog('当前环境不支持字幕后处理，无法一键修复 QC', 'err');
        return;
    }
    const targets = onlyItem
        ? [onlyItem]
        : state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!(Number(item.qcIssueCount) > 0)) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
    const list = targets.filter(Boolean);
    if (!list.length) {
        if (confirm && !quiet) appendLog('没有可写回修复的 QC 条目（需为 .srt/.vtt/.lrc）', 'info');
        return;
    }

    const pathCount = list.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
    if (confirm) {
        const confirmMsg = onlyItem
            ? uiTf('确定对「{name}」一键修复 QC 问题吗？\n将写回 {pathCount} 个字幕文件（时间轴 / 读速 / 叠词等）。', { name: basename(onlyItem.path), pathCount })
            : uiTf('确定一键修复 QC 问题吗？\n将处理 {n} 条任务、写回 {pathCount} 个字幕文件（时间轴 / 读速 / 叠词等）。', { n: list.length, pathCount });
        const yes = await appConfirm({
            title: '一键修复 QC',
            message: confirmMsg,
            primaryLabel: '一键修复',
            secondaryLabel: '取消',
        });
        if (!yes) return;
    }

    if (!quiet) {
        state.qcFixing = true;
        updateQcBanner();
        els.progressLabel.textContent = '一键修复 QC 中，请稍候…';
        appendLog(
            confirm
                ? uiTf('开始一键修复 QC（{pathCount} 个字幕文件 / {n} 条任务）…', { pathCount, n: list.length })
                : uiTf('单条 QC 修复（{pathCount} 个字幕）…', { pathCount }),
            'info',
        );
    }
    let written = 0;
    let fileTotal = 0;
    try {
        for (let i = 0; i < list.length; i += 1) {
            const item = list[i];
            if (onlyItem && quiet) patchItemQcRunning(item, 'fix', 50 + Math.round((i / Math.max(1, list.length)) * 40));
            const paths = getPostBatchPathsForItem(item);
            let itemOk = false;
            let itemWritten = 0;
            let lastSummary = '';
            for (const subPath of paths) {
                fileTotal += 1;
                els.progressLabel.textContent = uiTf('一键修复 QC 中，请稍候… {fileTotal}/{pathCount} · {name}', { fileTotal, pathCount, name: basename(subPath) });
                try {
                    const res = await electron.transubApplySubtitlePostprocess({
                        path: subPath,
                        options: {
                            cpsSplit: true,
                            fixOverlap: true,
                            fixCpsByExtend: true,
                            enforceMinDur: true,
                            enforceMaxDur: true,
                            fixInvalid: true,
                            compressRepetition: true,
                            removeNoise: true,
                            removeHallucinations: true,
                            removeDuplicates: true,
                            maxCps: 18,
                            maxSec: 10,
                            gapMs: 1,
                            backupMode: 'off',
                        },
                    });
                    let fileWritten = !!(res?.ok && res.written);
                    const remainHint = res?.cpsSplit?.remainingText
                        ? `；${res.cpsSplit.remainingText}`
                        : '';
                    let fileSummary = `${res?.summary || uiTf('已修复 QC')}${remainHint}`;
                    if (res?.ok && electron.transubQcSilenceSplit) {
                        let silenceChars = Number(getSavedOptionsSnapshot()?.qcSilenceSplitChars);
                        try {
                            const optsRes = await electron?.transWithAiGetOptions?.();
                            if (optsRes?.options && optsRes.options.qcSilenceSplitChars != null) {
                                silenceChars = Number(optsRes.options.qcSilenceSplitChars);
                                setSavedOptionsSnapshot({
                                    ...(getSavedOptionsSnapshot() || {}),
                                    ...optsRes.options,
                                });
                            }
                        } catch { /* keep snapshot */ }
                        const maxChars = Number.isFinite(silenceChars) && silenceChars >= 0
                            ? silenceChars
                            : 15;
                        if (maxChars > 0 && item.path) {
                            try {
                                const sil = await electron.transubQcSilenceSplit({
                                    path: subPath,
                                    mediaPath: item.path,
                                    maxChars,
                                    backupMode: 'off',
                                });
                                if (sil?.ok && sil.written) {
                                    fileWritten = true;
                                    fileSummary = [fileSummary, sil.summary].filter(Boolean).join('；');
                                } else if (sil?.ok && sil.summary) {
                                    fileSummary = [fileSummary, sil.summary].filter(Boolean).join('；');
                                }
                            } catch (_) { /* silence optional */ }
                        }
                    }
                    if (res?.ok && fileWritten) {
                        written += 1;
                        itemWritten += 1;
                        itemOk = true;
                        lastSummary = fileSummary;
                        appendLog(`${basename(subPath)}：${lastSummary}`, 'ok');
                    } else if (res?.ok) {
                        itemOk = true;
                        lastSummary = fileSummary || res.summary || '无需写回';
                        appendLog(`${basename(subPath)}：${lastSummary}`, 'info');
                    } else {
                        appendLog(`${basename(subPath)}：${res?.error || 'QC 修复失败'}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(subPath)}：${err?.message || 'QC 修复失败'}`, 'err');
                }
            }
            if (itemOk) {
                markItemQcFixed(item, 'fix', {
                    written: itemWritten > 0,
                    summary: lastSummary || '已一键修复 QC',
                });
            } else if (onlyItem && quiet && item.status === 'running') {
                item.status = 'done';
                item.progress = 100;
                item.stage = '';
                item.detail = item.detail && !/QC/.test(item.detail) ? item.detail : '已完成';
                refreshListRow(item);
            }
        }
        if (!quiet) {
            appendLog(
                written > 0
                    ? uiTf('QC 修复写回完成：{written}/{fileTotal} 个字幕；正在复查…', { written, fileTotal })
                    : uiTf('QC 修复完成：{fileTotal} 个字幕均无需写回；正在复查…', { fileTotal }),
                written > 0 ? 'ok' : 'info',
            );
        }
        const { withIssues, scanned } = await scanQcForItems(list, { quiet: true });
        if (!quiet) {
            appendLog(
                withIssues > 0
                    ? uiTf('QC 复查：仍有 {withIssues}/{scanned} 个字幕存在问题', { withIssues, scanned })
                    : uiTf('QC 复查：{scanned} 个字幕已通过', { scanned }),
                withIssues > 0 ? 'warn' : 'ok',
            );
            els.progressLabel.textContent = withIssues > 0 ? 'QC 修复完成（仍有问题）' : 'QC 修复完成';
            state.qcBannerDismissed = countQcIssues() <= 0;
        }
    } finally {
        if (!quiet) {
            state.qcFixing = false;
            renderList();
            updateQcBanner();
        }
    }
}

async function resolveQcSilenceSplitCharsFromSaved() {
    let n = Number(getSavedOptionsSnapshot()?.qcSilenceSplitChars);
    try {
        const optsRes = await electron?.transWithAiGetOptions?.();
        if (optsRes?.options) {
            setSavedOptionsSnapshot({ ...(getSavedOptionsSnapshot() || {}), ...optsRes.options });
            if (optsRes.options.qcSilenceSplitChars != null) {
                n = Number(optsRes.options.qcSilenceSplitChars);
            }
        }
    } catch { /* keep snapshot */ }
    if (!Number.isFinite(n) || n < 0) return 15;
    return Math.max(0, Math.min(500, Math.round(n)));
}

/** 无 QC 问题项时仍按字数阈值做超长句静音分割（需视频）。 */
async function runPostBatchQcSilenceSplitOnly(onlyItem = null) {
    if (!electron?.transubQcSilenceSplit) return;
    const maxChars = await resolveQcSilenceSplitCharsFromSaved();
    if (!(maxChars > 0)) return;
    const targets = onlyItem
        ? [onlyItem]
        : state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            if (!item.path) return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
    const list = targets.filter(Boolean);
    if (!list.length) return;
    let written = 0;
    let touched = 0;
    for (const item of list) {
        for (const subPath of getPostBatchPathsForItem(item)) {
            try {
                const sil = await electron.transubQcSilenceSplit({
                    path: subPath,
                    mediaPath: item.path,
                    maxChars,
                    backupMode: 'off',
                });
                if (sil?.ok && sil.written) {
                    written += 1;
                    touched += 1;
                    appendLog(`${basename(subPath)}：${sil.summary || '超长句静音分割'}`, 'ok');
                } else if (sil?.ok && sil.summary && !sil.skipped) {
                    touched += 1;
                    appendLog(`${basename(subPath)}：${sil.summary}`, 'info');
                }
            } catch (err) {
                appendLog(`${basename(subPath)}：${err?.message || '超长句静音分割失败'}`, 'warn');
            }
        }
    }
    if (touched > 0) {
        appendLog(
            written > 0
                ? uiTf('超长句静音分割写回 {n} 个字幕', { n: written })
                : `超长句静音分割已分析，无可用静音切点`,
            written > 0 ? 'ok' : 'info',
        );
    }
}

async function runPostBatchQcAutoFixIfEnabled({ onlyItem = null, quiet = false } = {}) {
    // Prefer saved options so a standalone settings window stays in sync.
    let savedMode = null;
    try {
        const optsRes = await electron?.transWithAiGetOptions?.();
        if (optsRes?.options) {
            savedMode = normalizePostBatchQcFixMode(optsRes.options.postBatchQcFixMode);
            setSavedOptionsSnapshot({ ...(getSavedOptionsSnapshot() || {}), ...optsRes.options });
        }
    } catch { /* ignore */ }
    const mode = savedMode || getPostBatchQcFixMode();
    if (mode === 'none') return;
    const issueCount = onlyItem
        ? (Number(onlyItem.qcIssueCount) || 0)
        : countQcIssues();
    if (issueCount <= 0) {
        // 扫描无 QC 问题：仍按「超长句静音分割字数」处理（否则永远跑不到）
        await runPostBatchQcSilenceSplitOnly(onlyItem);
        return;
    }
    if (mode === 'smart') {
        if (!getAdvancedEntitled()) {
            // Pro 默认智能修复：未解锁时不自动跑，也不降级成一键（避免免费版行为突变）
            // 仍做超长句静音分割（不依赖 Pro）
            await runPostBatchQcSilenceSplitOnly(onlyItem);
            return;
        }
        await runPostBatchQcSmartFix(onlyItem, { confirm: false, quiet });
        return;
    }
    await runPostBatchQcFix(onlyItem, { confirm: false, quiet });
}

function normalizeChineseSubtitleVariant(raw) {
    if (settingsNormApi.normalizeChineseSubtitleVariant) {
        return settingsNormApi.normalizeChineseSubtitleVariant(raw);
    }
    const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
    const cv = String(raw || 'simplified');
    return allowed.has(cv) ? cv : 'simplified';
}

function chineseSubtitleVariantLabel(variant) {
    if (settingsNormApi.chineseSubtitleVariantLabel) {
        return settingsNormApi.chineseSubtitleVariantLabel(variant);
    }
    if (variant === 'simplified') return '转简体';
    if (variant === 'traditional-hk') return '转繁体（香港）';
    if (variant === 'traditional-tw') return '转繁体（台湾字形）';
    return '转繁体（台湾）';
}

/** 解析翻译任务最终应写回的中文变体；非翻译 / 非中文成片返回 null */
async function resolvePostBatchChineseVariant() {
    let savedOpts = null;
    try {
        const optsRes = await electron?.transWithAiGetOptions?.();
        if (optsRes?.options) savedOpts = optsRes.options;
    } catch { /* ignore */ }
    const taskFromSaved = savedOpts?.task === 'transcribe' || savedOpts?.task === 'dual'
        ? savedOpts.task
        : (savedOpts?.task ? 'translate' : null);
    const taskNow = taskFromSaved || readTaskFromForm();
    if (!isTranslateLikeTask(taskNow)) return null;
    const tgtApi = getSubtitleTargetLangApi();
    const formRaw = els.chineseSubtitleVariantSelect?.value
        || els.quickTargetLangSelect?.value
        || '';
    const targetLang = settingsNormApi.normalizeSubtitleTargetLang
        ? settingsNormApi.normalizeSubtitleTargetLang(
            savedOpts?.subtitleTargetLang || formRaw || savedOpts?.chineseSubtitleVariant,
            savedOpts?.chineseSubtitleVariant || 'simplified',
        )
        : (tgtApi?.resolveSubtitleTargetLang?.(savedOpts || { chineseSubtitleVariant: formRaw }) || 'zh-Hans');
    if (tgtApi?.isZhSubtitleTarget && !tgtApi.isZhSubtitleTarget(targetLang)) {
        return null;
    }
    if (targetLang === 'en' || targetLang === 'ja' || targetLang === 'ko') return null;
    const variantFromSaved = normalizeChineseSubtitleVariant(savedOpts?.chineseSubtitleVariant);
    const variantFromForm = normalizeChineseSubtitleVariant(
        (formRaw === 'en' || formRaw === 'ja' || formRaw === 'ko') ? 'simplified' : formRaw,
    );
    return savedOpts ? variantFromSaved : variantFromForm;
}

async function runPostBatchAutoFix(onlyItems = null) {
    await ensureJobRuntimeScripts();
    // 以磁盘配置为准（独立设置窗口保存后，主窗口表单可能尚未同步）
    // 注意：简繁转换刻意不在此执行，留到 QC 之后的最后一步
    let savedOpts = null;
    try {
        const optsRes = await electron?.transWithAiGetOptions?.();
        if (optsRes?.options) savedOpts = optsRes.options;
    } catch { /* ignore */ }
    if (!postBatchAutofixApi.planPostBatchAutofixFlags) {
        appendLog('后处理核心未加载（post-batch-autofix-plan），已跳过批量后处理', 'err');
        return;
    }
    const flags = postBatchAutofixApi.planPostBatchAutofixFlags({
        savedOpts,
        form: {
            postBatchCpsSplit: els.postBatchCpsSplitCheck ? !!els.postBatchCpsSplitCheck.checked : true,
            postBatchRemoveNoise: els.postBatchRemoveNoiseCheck ? !!els.postBatchRemoveNoiseCheck.checked : true,
            postBatchCompressRepetition: els.postBatchCompressRepCheck ? !!els.postBatchCompressRepCheck.checked : true,
            postBatchViewingPunctMode: els.postBatchViewingPunctModeSelect?.value,
            postBatchInterjectionMode: els.postBatchInterjectionModeSelect?.value,
            postBatchOnomatopoeiaMode: els.postBatchOnomatopoeiaModeSelect?.value,
            task: (Array.isArray(onlyItems) && onlyItems.length)
                ? 'translate'
                : readTaskFromForm(),
        },
        taskFallback: (Array.isArray(onlyItems) && onlyItems.length)
            ? 'translate'
            : readTaskFromForm(),
        normalizeViewingCleanMode,
        isTranslateLikeTask,
    });
    const {
        doCps, doNoise, doCompressRep,
        viewingPunctMode, interjectionMode, onomatopoeiaMode,
        doViewingPunct, doSoftenDiscourse, doSoftenOnomatopoeia, doCompactInterjections,
        taskNow, doSpacePunct, doPostprocess,
    } = flags;
    if (!flags.shouldRun) return;

    const subtitleTargetLang = settingsNormApi.normalizeSubtitleTargetLang
        ? settingsNormApi.normalizeSubtitleTargetLang(
            savedOpts?.subtitleTargetLang
                || els.chineseSubtitleVariantSelect?.value
                || els.quickTargetLangSelect?.value
                || savedOpts?.chineseSubtitleVariant,
            savedOpts?.chineseSubtitleVariant || 'simplified',
        )
        : (getSubtitleTargetLangApi()?.resolveSubtitleTargetLang?.(savedOpts || {}) || 'zh-Hans');

    const scoped = Array.isArray(onlyItems) && onlyItems.length
        ? onlyItems.filter(Boolean)
        : null;
    const targets = scoped
        ? scoped.filter((item) => getPostBatchPathsForItem(item).length > 0)
        : (postBatchAutofixApi.filterPostBatchAutofixTargets
            ? postBatchAutofixApi.filterPostBatchAutofixTargets(state.items, getPostBatchPathsForItem)
            : state.items.filter((item) => {
                if (item.status !== 'done' && item.status !== 'skipped') return false;
                return getPostBatchPathsForItem(item).length > 0;
            }));

    els.progressLabel.textContent = '后处理中…';
    const parts = postBatchAutofixApi.buildPostBatchAutofixLabelParts
        ? postBatchAutofixApi.buildPostBatchAutofixLabelParts({
            doSpacePunct, doCps, doNoise, doCompressRep,
            viewingPunctMode, interjectionMode, onomatopoeiaMode,
            doSoftenDiscourse, doSoftenOnomatopoeia,
        })
        : [];
    const dualHint = taskNow === 'dual' ? '（译文轨 + 合并双语）' : '';

    if (doPostprocess && targets.length && electron?.transubApplySubtitlePostprocess) {
        const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
        appendLog(`开始批量后处理（${pathCount} 个字幕文件 / ${targets.length} 条任务${dualHint} · ${parts.join(' · ')}）…`, 'info');
        let written = 0;
        let fileTotal = 0;
        /** @type {Set<string>} paths already cleared by paired JA↔ZH noise removal */
        const pairedNoiseDone = new Set();

        if (doNoise && electron?.transubRemoveNoisePair) {
            for (const item of targets) {
                const zhPath = String(getSubtitlePathForItem(item) || '').trim();
                const jaPath = String(item.sourceSubtitlePath || '').trim();
                if (!zhPath || !jaPath) continue;
                if (!/\.(srt|vtt|lrc)$/i.test(zhPath) || !/\.(srt|vtt|lrc)$/i.test(jaPath)) continue;
                try {
                    const pairRes = await electron.transubRemoveNoisePair({
                        path: zhPath,
                        sourcePath: jaPath,
                        options: {
                            removeDuplicates: true,
                            removeHallucinations: true,
                            backupMode: 'off',
                        },
                    });
                    if (pairRes?.ok && !pairRes.skipped) {
                        pairedNoiseDone.add(zhPath);
                        pairedNoiseDone.add(jaPath);
                        if (pairRes.removed || pairRes.written) {
                            written += 1;
                            appendLog(
                                `${basename(zhPath)} ↔ ${basename(jaPath)}：${pairRes.summary || '成对清噪'}`,
                                'ok',
                            );
                        }
                    }
                } catch (err) {
                    appendLog(`${basename(zhPath)}：成对清噪失败（${err?.message || err}）`, 'err');
                }
            }
        }

        for (let i = 0; i < targets.length; i += 1) {
            const item = targets[i];
            const paths = getPostBatchPathsForItem(item);
            for (const subPath of paths) {
                fileTotal += 1;
                els.progressLabel.textContent = uiTf('后处理中… {fileTotal}/{pathCount}', { fileTotal, pathCount });
                const skipNoise = doNoise && pairedNoiseDone.has(subPath);
                try {
                    const res = await electron.transubApplySubtitlePostprocess({
                        path: subPath,
                        options: {
                            spaceAfterChinesePunctuation: doSpacePunct,
                            cpsSplit: doCps,
                            removeNoise: doNoise && !skipNoise,
                            removeHallucinations: doNoise && !skipNoise,
                            compressRepetition: doCompressRep,
                            viewingPunctMode: viewingPunctMode,
                            simplifyViewingPunctuation: doViewingPunct,
                            softenDiscourseFillers: doSoftenDiscourse,
                            softenOnomatopoeiaFillers: doSoftenOnomatopoeia,
                            dropBilingualPureFillers: doCompactInterjections,
                            dropBilingualDiscourse: interjectionMode === 'clear',
                            dropBilingualOnomatopoeia: onomatopoeiaMode === 'clear',
                            blankInsteadOfRemove: false,
                            fixOverlap: true,
                            enforceMaxDur: true,
                            maxCps: 18,
                            backupMode: 'off',
                            subtitleTargetLang,
                            targetLang: subtitleTargetLang,
                        },
                    });
                    if (res?.ok && res.written) {
                        written += 1;
                        appendLog(`${basename(subPath)}：${res.summary || '已后处理'}`, 'ok');
                    } else if (res?.ok) {
                        appendLog(`${basename(subPath)}：${res.summary || '无需后处理'}`, 'info');
                    } else {
                        appendLog(`${basename(subPath)}：${res?.error || '后处理失败'}`, 'err');
                    }
                } catch (err) {
                    appendLog(`${basename(subPath)}：${err?.message || '后处理失败'}`, 'err');
                }
            }
        }
        appendLog(
            written > 0
                ? uiTf('后处理完成：已写回 {written}/{fileTotal} 个字幕', { written, fileTotal })
                : uiTf('后处理完成：{fileTotal} 个字幕均无需写回', { fileTotal }),
            written > 0 ? 'ok' : 'info',
        );
    } else if (doCompactInterjections) {
        appendLog(`开始批量后处理（${parts.join(' · ')}）…`, 'info');
    }

    if (doCompactInterjections && electron?.transubCompactPureInterjections) {
        const compactTargets = targets.filter((item) => {
            const zh = String(getSubtitlePathForItem(item) || '').trim();
            const ja = String(item.sourceSubtitlePath || '').trim();
            return zh && ja
                && /\.(srt|vtt|lrc)$/i.test(zh)
                && /\.(srt|vtt|lrc)$/i.test(ja);
        });
        let compactWritten = 0;
        for (let i = 0; i < compactTargets.length; i += 1) {
            const item = compactTargets[i];
            const zhPath = getSubtitlePathForItem(item);
            const jaPath = item.sourceSubtitlePath;
            els.progressLabel.textContent = uiTf('清除语气/拟声… {i}/{total}', { i: i + 1, total: compactTargets.length });
            try {
                const res = await electron.transubCompactPureInterjections({
                    path: zhPath,
                    sourcePath: jaPath,
                    options: {
                        backupMode: 'off',
                        dropDiscourse: interjectionMode === 'clear',
                        dropOnomatopoeia: onomatopoeiaMode === 'clear',
                        subtitleTargetLang,
                        targetLang: subtitleTargetLang,
                    },
                });
                if (res?.ok && res.dropped) {
                    compactWritten += 1;
                    appendLog(`${basename(zhPath)}：${res.summary || '已清除语气/拟声'}`, 'ok');
                } else if (res?.ok && !res.skipped) {
                    appendLog(`${basename(zhPath)}：${res.summary || '无需清除语气/拟声'}`, 'info');
                } else if (res?.ok && res.skipped) {
                    appendLog(`${basename(zhPath)}：跳过清除（${res.reason || '无原文对照'}）`, 'info');
                } else {
                    appendLog(`${basename(zhPath)}：${res?.error || '清除语气/拟声失败'}`, 'err');
                }
            } catch (err) {
                appendLog(`${basename(zhPath)}：${err?.message || '清除语气/拟声失败'}`, 'err');
            }
        }
        if (compactTargets.length) {
            appendLog(
                compactWritten > 0
                    ? uiTf('清除语气/拟声完成：已写回 {written}/{total} 个字幕对', { written: compactWritten, total: compactTargets.length })
                    : uiTf('清除语气/拟声完成：{total} 个字幕对均无需写回', { total: compactTargets.length }),
                compactWritten > 0 ? 'ok' : 'info',
            );
        }

        // Remake merged bilingual from cleaned tracks so player `{stem}.srt` stays in sync.
        if (electron?.transubMergeBilingualSubtitles && taskNow === 'dual') {
            let remade = 0;
            for (const item of compactTargets) {
                const zhPath = String(getSubtitlePathForItem(item) || '').trim();
                const jaPath = String(item.sourceSubtitlePath || '').trim();
                const biPath = String(item.bilingualSubtitlePath || '').trim();
                if (!zhPath || !jaPath || !biPath) continue;
                if (zhPath === biPath) continue;
                try {
                    const merged = await electron.transubMergeBilingualSubtitles({
                        path: zhPath,
                        sourcePath: jaPath,
                        dualLineOrder: els.mergeBilingualOrderSelect
                            ? readDualLineOrderFromForm()
                            : 'target-first',
                        nameAsVideoStem: true,
                    });
                    if (merged?.ok && merged.path) {
                        remade += 1;
                        item.bilingualSubtitlePath = merged.path;
                        if (!item.targetSubtitlePath) item.subtitlePath = merged.path;
                    }
                } catch (err) {
                    appendLog(
                        uiTf('{name}：合并双语刷新失败（{error}）', { name: basename(biPath), error: err?.message || err }),
                        'err',
                    );
                }
            }
            if (remade) {
                appendLog(`已按清理后的原/译轨重写合并双语 ${remade} 个`, 'ok');
            }
        }
    }

    els.progressLabel.textContent = '后处理完成';
}

/** 整条完成后处理的最后一步：简→繁（须在 CPS/清噪/叠词/QC 之后；简体目标跳过） */
async function runPostBatchChineseConvert(onlyItems = null) {
    if (!electron?.transubApplySubtitlePostprocess) return;
    const chineseSubtitleVariant = await resolvePostBatchChineseVariant();
    if (!chineseSubtitleVariant || chineseSubtitleVariant === 'simplified') return;

    const scoped = Array.isArray(onlyItems) && onlyItems.length
        ? onlyItems.filter(Boolean)
        : null;
    const targets = scoped
        ? scoped.filter((item) => getPostBatchPathsForItem(item).length > 0)
        : state.items.filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return getPostBatchPathsForItem(item).length > 0;
        });
    if (!targets.length) return;

    const pathCount = targets.reduce((n, item) => n + getPostBatchPathsForItem(item).length, 0);
    const zhLabel = chineseSubtitleVariantLabel(chineseSubtitleVariant);
    els.progressLabel.textContent = `${zhLabel}…`;
    appendLog(`开始${zhLabel}（最终步骤 · ${pathCount} 个字幕文件）…`, 'info');
    let written = 0;
    let fileTotal = 0;
    for (let i = 0; i < targets.length; i += 1) {
        const item = targets[i];
        const paths = getPostBatchPathsForItem(item);
        for (const subPath of paths) {
            fileTotal += 1;
            els.progressLabel.textContent = `${zhLabel}… ${fileTotal}/${pathCount}`;
            try {
                const res = await electron.transubApplySubtitlePostprocess({
                    path: subPath,
                    options: {
                        chineseSubtitleVariant,
                        backupMode: 'off',
                    },
                });
                if (res?.ok && res.written) {
                    written += 1;
                    appendLog(`${basename(subPath)}：${res.chinese?.summary || res.summary || zhLabel}`, 'ok');
                } else if (res?.ok) {
                    appendLog(`${basename(subPath)}：${res.summary || '无需转换'}`, 'info');
                } else {
                    appendLog(`${basename(subPath)}：${res?.error || `${zhLabel}失败`}`, 'err');
                }
            } catch (err) {
                appendLog(`${basename(subPath)}：${err?.message || `${zhLabel}失败`}`, 'err');
            }
        }
    }
    appendLog(
        written > 0
            ? uiTf('{zhLabel}完成：已写回 {written}/{fileTotal} 个字幕', { zhLabel, written, fileTotal })
            : uiTf('{zhLabel}完成：{fileTotal} 个字幕均无需写回', { zhLabel, fileTotal }),
        written > 0 ? 'ok' : 'info',
    );
    els.progressLabel.textContent = uiTf('{zhLabel}完成', { zhLabel });
}

async function runPostBatchInsertTextPreset() {
    if (!getAdvancedEntitled() || !electron?.transubInsertTextPresetGroup) return;
    let groupId = '';
    try {
        const optsRes = await electron?.transWithAiGetOptions?.();
        groupId = String(optsRes?.options?.postBatchTextPresetGroupId || '').trim();
    } catch { /* ignore */ }
    if (!groupId) {
        groupId = String(els.postBatchTextPresetGroupSelect?.value || '').trim();
    }
    if (!groupId) return;

    const targets = state.items.filter((item) => {
        if (item.status !== 'done' && item.status !== 'skipped') return false;
        const subPath = String(getSubtitlePathForItem(item) || '').trim();
        return !!subPath && /\.(srt|vtt|lrc)$/i.test(subPath);
    });
    if (!targets.length) return;

    els.progressLabel.textContent = '插入字幕预设…';
    appendLog(`开始插入字幕预设组（${targets.length} 条任务）…`, 'info');
    let written = 0;
    let skipped = 0;
    for (let i = 0; i < targets.length; i += 1) {
        const item = targets[i];
        const subPath = String(getSubtitlePathForItem(item) || '').trim();
        els.progressLabel.textContent = uiTf('插入字幕预设… {i}/{total}', { i: i + 1, total: targets.length });
        try {
            const res = await electron.transubInsertTextPresetGroup({
                path: subPath,
                groupId,
            });
            if (res?.ok && res.written) {
                written += 1;
                appendLog(`${basename(subPath)}：${res.summary || '已插入预设组'}`, 'ok');
            } else if (res?.ok && res.skipped) {
                skipped += 1;
                appendLog(`${basename(subPath)}：${res.summary || '跳过预设组插入'}`, 'info');
            } else {
                appendLog(`${basename(subPath)}：${res?.error || '插入预设组失败'}`, 'err');
            }
        } catch (err) {
            appendLog(`${basename(subPath)}：${err?.message || '插入预设组失败'}`, 'err');
        }
    }
    appendLog(
        written > 0
            ? uiTf('字幕预设插入完成：已写回 {written}/{total} 个字幕', { written, total: targets.length })
            : uiTf('字幕预设插入完成：{detail}', { detail: skipped ? uiTf('{n} 个跳过', { n: skipped }) : '无字幕写回' }),
        written > 0 ? 'ok' : 'info',
    );
    els.progressLabel.textContent = '字幕预设插入完成';
}


        return {
            patchItemQcRunning,
            scanQcForItems,
            runPostBatchQcScan,
            runPostBatchQcSmartFix,
            runPostBatchQcFix,
            resolveQcSilenceSplitCharsFromSaved,
            runPostBatchQcSilenceSplitOnly,
            runPostBatchQcAutoFixIfEnabled,
            normalizeChineseSubtitleVariant,
            chineseSubtitleVariantLabel,
            resolvePostBatchChineseVariant,
            runPostBatchAutoFix,
            runPostBatchChineseConvert,
            runPostBatchInsertTextPreset,
        };
    }

    return { createPostBatchRunner };
}));
