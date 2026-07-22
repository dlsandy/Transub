/**
 * 字幕编辑器 — 工作流抽屉与一键跑批
 */
(function (global) {
    function installWorkflows(ctx) {
        const {
            workflowsCore,
            state,
            els,
            electron,
            showEditorModal,
            hideEditorModal,
            setStatus,
            recordUndoBeforeChange,
            syncDetailToCue,
            setDirty,
            renderCueList,
            renderDetailPane,
            refreshQcBadge,
            getDefaultQcScanOptions,
            getTargetCps,
            loadSplitPrefs,
            getEffectiveGlossary,
            getSelectedCueIndexes,
            qcCore,
            fluencyCore,
            chineseCore,
            glossaryCore,
            textPresetsCore,
            metaCore,
            insertPresetGroup,
            exportMergedDualSubtitle,
            saveDocument,
            flushDraftAutosave,
            shiftAllCues,
            applyGlossaryUnification,
            openGlossaryModal,
            openBreakWordsModal,
            openTextPresetsModal,
            openFindReplaceModal,
            openQcModal,
            restoreInitialSnapshot,
            mergeSelectedCues,
            confirmBatchSilenceSplit,
            confirmBatchSilenceDurAdjust,
            confirmBatchAudioSnapAdjust,
            collectBatchDurMatches,
            collectSmartSplitMatches,
            collectSilenceSplitMatches,
            computeSplitParts,
            maybeFixOverlapAfterSplit,
            cueEndMs,
            runRetranscribeRange,
            retranslateSelectedCue,
            retranscribeDualSelectedCue,
            selectCue,
            showSilenceSplitProgress,
            updateSilenceSplitProgress,
            hideSilenceSplitProgress,
            flushSilenceProgressPaint,
            setSilenceSplitBusy,
            canSilenceSplitCue,
            loadRetranscribeDurPrefs,
            esc,
        } = ctx;

        if (!workflowsCore) {
            throw new Error('installWorkflows: workflowsCore required');
        }

        state.workflowsDoc = workflowsCore.emptyWorkflowsDoc();
        state.workflowBusy = false;
        state.workflowPause = null;
        state.workflowAbortController = null;

        function activeWorkflow() {
            return workflowsCore.findWorkflow(state.workflowsDoc, state.workflowsDoc.activeId);
        }

        function isEditableWorkflow(wf) {
            return !!(wf && !wf.builtin);
        }

        async function loadWorkflows() {
            try {
                if (electron?.transubGetEditorWorkflows) {
                    const res = await electron.transubGetEditorWorkflows();
                    if (res?.ok && res.workflowsDoc) {
                        state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(res.workflowsDoc);
                    } else {
                        state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(
                            workflowsCore.emptyWorkflowsDoc(),
                        );
                    }
                } else {
                    state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(
                        workflowsCore.emptyWorkflowsDoc(),
                    );
                }
            } catch {
                state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(
                    workflowsCore.emptyWorkflowsDoc(),
                );
            }
            renderWorkflowSelect();
            renderWorkflowPanel();
        }

        async function persistWorkflows() {
            if (!electron?.transubSaveEditorWorkflows) return { ok: true };
            const res = await electron.transubSaveEditorWorkflows({
                workflowsDoc: state.workflowsDoc,
            });
            if (res?.ok && res.workflowsDoc) {
                state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(res.workflowsDoc);
            }
            return res || { ok: false, error: '保存失败' };
        }

        function setWorkflowStatus(msg) {
            if (els.workflowStatus) els.workflowStatus.textContent = msg || '—';
        }

        function renderWorkflowSelect() {
            if (!els.workflowSelect) return;
            const doc = workflowsCore.ensureBuiltinWorkflows(state.workflowsDoc);
            state.workflowsDoc = doc;
            const cur = doc.activeId;
            els.workflowSelect.innerHTML = doc.workflows.map((w) => {
                const tag = w.builtin ? '（内置）' : '';
                return `<option value="${esc(w.id)}"${w.id === cur ? ' selected' : ''}>${esc(w.name)}${tag}</option>`;
            }).join('');
        }

        function renderAddStepSelect() {
            if (!els.workflowAddStepSelect) return;
            const groups = new Map();
            for (const s of workflowsCore.listStepCatalog()) {
                if (!groups.has(s.group)) groups.set(s.group, []);
                groups.get(s.group).push(s);
            }
            const parts = [];
            for (const [group, steps] of groups) {
                parts.push(`<optgroup label="${esc(group)}">`);
                for (const s of steps) {
                    parts.push(`<option value="${esc(s.id)}">${esc(s.label)}</option>`);
                }
                parts.push('</optgroup>');
            }
            els.workflowAddStepSelect.innerHTML = parts.join('');
        }

        function renderWorkflowPanel() {
            const wf = activeWorkflow();
            if (els.workflowNote) {
                els.workflowNote.textContent = wf
                    ? (wf.note || (wf.builtin ? '内置模板（只读，可复制后编辑）' : '自定义工作流'))
                    : '未选择工作流';
            }
            const editable = isEditableWorkflow(wf);
            if (els.workflowAddRow) els.workflowAddRow.classList.toggle('hidden', !editable);
            if (els.workflowDeleteBtn) els.workflowDeleteBtn.disabled = !editable;
            if (els.workflowDupBtn) els.workflowDupBtn.disabled = !wf;
            if (els.workflowRunBtn) els.workflowRunBtn.disabled = !wf || state.workflowBusy;
            if (els.workflowCancelRunBtn) {
                els.workflowCancelRunBtn.disabled = !state.workflowBusy;
            }

            if (!els.workflowStepList) return;
            if (!wf) {
                els.workflowStepList.innerHTML = '<div class="workflow-step-item" style="display:block;color:var(--ed-muted)">暂无工作流</div>';
                return;
            }
            if (!wf.steps.length) {
                els.workflowStepList.innerHTML = '<div class="workflow-step-item" style="display:block;color:var(--ed-muted)">暂无步骤，请添加</div>';
                return;
            }
            els.workflowStepList.innerHTML = wf.steps.map((s, idx) => {
                const meta = workflowsCore.getStepMeta(s.type);
                const chips = [];
                if (s.requireConfirm) chips.push('<span class="wf-chip warn">需确认</span>');
                if (s.params?.scope) chips.push(`<span class="wf-chip">${esc(s.params.scope)}</span>`);
                const moveBtns = editable
                    ? `<div style="display:flex;flex-direction:column;gap:0.15rem">
                        <button type="button" data-wf-move="-1" data-wf-idx="${idx}" title="上移" ${idx === 0 ? 'disabled' : ''}>▲</button>
                        <button type="button" data-wf-move="1" data-wf-idx="${idx}" title="下移" ${idx >= wf.steps.length - 1 ? 'disabled' : ''}>▼</button>
                        <button type="button" data-wf-remove="${esc(s.id)}" title="移除">×</button>
                       </div>`
                    : '';
                return `<div class="workflow-step-item${s.enabled ? '' : ' is-disabled'}" role="listitem" data-step-id="${esc(s.id)}">
                    <label title="启用">
                        <input type="checkbox" data-wf-enable="${esc(s.id)}" ${s.enabled ? 'checked' : ''} ${editable ? '' : 'disabled'}>
                    </label>
                    <div class="wf-step-main">
                        <div class="wf-step-title">${esc(s.label || meta?.label || s.type)}${chips.join('')}</div>
                        <div class="wf-step-meta">${esc(meta?.group || '')} · ${esc(s.type)}</div>
                    </div>
                    ${moveBtns}
                </div>`;
            }).join('');
        }

        function openWorkflowModal() {
            if (!els.workflowModal) return;
            renderWorkflowSelect();
            renderAddStepSelect();
            renderWorkflowPanel();
            setWorkflowStatus(state.workflowBusy ? '工作流运行中…' : '选择工作流后点击「运行」');
            showEditorModal(els.workflowModal, els.workflowRunBtn);
        }

        function closeWorkflowModal() {
            if (state.workflowBusy) return;
            hideEditorModal(els.workflowModal);
            hideWorkflowPause();
        }

        function hideWorkflowPause() {
            els.workflowPauseBanner?.classList.remove('visible');
            els.workflowPauseOverlay?.classList.add('hidden');
            if (state.workflowPause) {
                const p = state.workflowPause;
                state.workflowPause = null;
                p.resolve({ action: 'abort' });
            }
        }

        function waitWorkflowPause(message, { allowSkip = true } = {}) {
            return new Promise((resolve) => {
                // 进度全屏层会挡住抽屉内暂停条；人工/确认步先收起进度，改用置顶确认卡
                hideSilenceSplitProgress();
                state.workflowPause = {
                    resolve: (result) => {
                        els.workflowPauseBanner?.classList.remove('visible');
                        els.workflowPauseOverlay?.classList.add('hidden');
                        resolve(result);
                    },
                };
                const text = message || '请确认后继续';
                if (els.workflowPauseMessage) els.workflowPauseMessage.textContent = text;
                if (els.workflowPauseOverlayMessage) els.workflowPauseOverlayMessage.textContent = text;
                if (els.workflowSkipStepBtn) {
                    els.workflowSkipStepBtn.style.display = allowSkip ? '' : 'none';
                }
                if (els.workflowOverlaySkipBtn) {
                    els.workflowOverlaySkipBtn.style.display = allowSkip ? '' : 'none';
                }
                els.workflowPauseBanner?.classList.add('visible');
                els.workflowPauseOverlay?.classList.remove('hidden');
                requestAnimationFrame(() => {
                    els.workflowOverlayContinueBtn?.focus?.();
                });
            });
        }

        function resolveWorkflowPause(action) {
            const p = state.workflowPause;
            if (!p) return;
            state.workflowPause = null;
            els.workflowPauseBanner?.classList.remove('visible');
            els.workflowPauseOverlay?.classList.add('hidden');
            p.resolve({ action });
        }

        function updateActiveWorkflow(mutator) {
            const wf = activeWorkflow();
            if (!isEditableWorkflow(wf)) return false;
            const next = mutator(workflowsCore.normalizeWorkflow(wf));
            const up = workflowsCore.upsertWorkflow(state.workflowsDoc, next);
            if (!up.ok) {
                setWorkflowStatus(up.error || '更新失败');
                return false;
            }
            state.workflowsDoc = up.doc;
            renderWorkflowPanel();
            void persistWorkflows();
            return true;
        }

        function resolveScopeIndexes(scope, { maxCues = 0 } = {}) {
            const mode = workflowsCore.normalizeScope(scope, 'all');
            let indexes = [];
            if (mode === 'selected') {
                indexes = getSelectedCueIndexes();
            } else if (mode === 'filtered') {
                // filtered ≈ current list filter: prefer QC/low if active via selected set; else all
                if (state.listFilter === 'low') {
                    indexes = state.cues.map((_, i) => i).filter((i) => state.cueMeta[i]?.low);
                } else if (state.listFilter === 'qc') {
                    const scan = qcCore.scanCueIssues(state.cues, getDefaultQcScanOptions());
                    const set = new Set((scan.issues || []).map((x) => x.index));
                    indexes = state.cues.map((_, i) => i).filter((i) => set.has(i));
                } else {
                    indexes = state.cues.map((_, i) => i);
                }
            } else if (mode === 'lowConfidence') {
                indexes = state.cues.map((_, i) => i).filter((i) => state.cueMeta[i]?.low);
            } else {
                indexes = state.cues.map((_, i) => i);
            }
            if (maxCues > 0 && indexes.length > maxCues) {
                indexes = indexes.slice(0, maxCues);
            }
            return indexes;
        }

        function applySplitModeToIndexes(mode, indexes, splitOpts) {
            const sorted = [...indexes].sort((a, b) => b - a);
            let splitCount = 0;
            let added = 0;
            for (const idx of sorted) {
                const result = computeSplitParts(mode, state.cues[idx], splitOpts);
                if (!result.cues || result.cues.length < 2) continue;
                state.cues.splice(idx, 1, ...result.cues);
                splitCount += 1;
                added += result.cues.length - 1;
            }
            return { splitCount, added };
        }

        function buildAllHandlers() {
            const base = {
                'qc.scan': async () => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const scan = qcCore.scanCueIssues(state.cues, getDefaultQcScanOptions());
                    refreshQcBadge();
                    return {
                        status: 'done',
                        summary: qcCore.summarizeScan(scan.summary) || `问题 ${scan.summary?.total || 0}`,
                    };
                },
                'qc.fix': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const prefs = loadSplitPrefs();
                    const opts = {
                        fixOverlap: true,
                        fixCpsBySplit: true,
                        fixCpsByExtend: true,
                        enforceMinDur: true,
                        enforceMaxDur: true,
                        compressRepetition: false,
                        maxCps: 18,
                        minSec: 0.5,
                        maxSec: 10,
                        gapMs: 1,
                        smartMaxChars: prefs.smartMaxChars,
                        smartLineChars: prefs.smartLineChars,
                        targetCps: getTargetCps(),
                        useCpsTime: prefs.useCps !== false,
                        ...(step.params || {}),
                    };
                    syncDetailToCue();
                    const plan = qcCore.buildQcFixPlan(state.cues, opts);
                    if (!plan.ok) return { status: 'skipped', summary: plan.summary || '无需修复' };
                    recordUndoBeforeChange();
                    const result = qcCore.applyQcFixes(state.cues, opts);
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    refreshQcBadge();
                    return { status: 'done', summary: plan.summary, changed: true };
                },
                'timing.shift': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const deltaMs = Math.round(Number(step.params?.deltaMs) || 0);
                    if (!deltaMs) return { status: 'skipped', summary: '偏移为 0' };
                    const scope = step.params?.scope || 'all';
                    if (scope === 'all') {
                        const prevSel = state.selectedIndex;
                        const prevSet = new Set(state.selectedIndices);
                        state.selectedIndices.clear();
                        state.selectedIndex = -1;
                        shiftAllCues(deltaMs);
                        state.selectedIndices = prevSet;
                        state.selectedIndex = prevSel;
                    } else {
                        shiftAllCues(deltaMs);
                    }
                    return { status: 'done', summary: `偏移 ${deltaMs}ms`, changed: true };
                },
                'timing.batchDuration': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const opts = {
                        mode: 'fixed',
                        condition: 'all',
                        targetSec: 2,
                        avoidOverlap: true,
                        silenceDb: -35,
                        silenceDur: 0.25,
                        snapPadMs: 50,
                        textKeyword: '',
                        ...(step.params || {}),
                    };
                    if (opts.mode === 'silence') {
                        if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                        await confirmBatchSilenceDurAdjust(opts);
                        return { status: 'done', summary: '静音时长调整完成', changed: true };
                    }
                    if (opts.mode === 'audio_snap') {
                        if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                        await confirmBatchAudioSnapAdjust(opts);
                        return { status: 'done', summary: '音频贴边完成', changed: true };
                    }
                    const indices = collectBatchDurMatches(opts);
                    if (!indices.length) return { status: 'skipped', summary: '无匹配条目' };
                    recordUndoBeforeChange();
                    const targetMs = Math.round(Number(opts.targetSec) * 1000);
                    let adjusted = 0;
                    for (const idx of indices) {
                        const cue = state.cues[idx];
                        let endMs = cue.startMs + targetMs;
                        if (opts.avoidOverlap && idx < state.cues.length - 1) {
                            endMs = Math.min(endMs, state.cues[idx + 1].startMs - 1);
                        }
                        endMs = Math.max(cue.startMs + 100, endMs);
                        if (endMs !== cueEndMs(cue)) adjusted += 1;
                        cue.endMs = endMs;
                    }
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: `已调整 ${adjusted || indices.length} 条时长`,
                        changed: true,
                    };
                },
                'timing.smartAdjust': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const opts = {
                        fixOverlap: true,
                        fixCps: true,
                        enforceMinDur: true,
                        enforceMaxDur: true,
                        maxCps: 18,
                        minSec: 0.5,
                        maxSec: 10,
                        gapMs: 1,
                        ...(step.params || {}),
                    };
                    syncDetailToCue();
                    const probe = qcCore.applySmartAdjustToCues(
                        state.cues.map((c) => ({ ...c, text: c.text })),
                        opts,
                    );
                    if (!probe.affected) return { status: 'skipped', summary: '无需调整' };
                    recordUndoBeforeChange();
                    const stats = qcCore.applySmartAdjustToCues(state.cues, opts);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: `已更新 ${stats.affected} 条`,
                        changed: true,
                    };
                },
                'timing.smartSplit': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const opts = {
                        condition: 'all',
                        smartMaxChars: 20,
                        smartLineChars: 18,
                        useCps: true,
                        fixOverlap: true,
                        cpsAbove: 18,
                        durLongSec: 3,
                        charsLong: 16,
                        ...(step.params || {}),
                    };
                    const indices = collectSmartSplitMatches(opts);
                    if (!indices.length) return { status: 'skipped', summary: '无匹配条目' };
                    recordUndoBeforeChange();
                    const { splitCount, added } = applySplitModeToIndexes('smart', indices, {
                        smartMaxChars: opts.smartMaxChars,
                        smartLineChars: opts.smartLineChars,
                        useCps: opts.useCps,
                        fixOverlap: false,
                    });
                    if (!splitCount) return { status: 'skipped', summary: '无法分割' };
                    if (opts.fixOverlap) maybeFixOverlapAfterSplit();
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: `分割 ${splitCount} 条，新增 ${added}`,
                        changed: true,
                    };
                },
                'timing.silenceSplit': async (_c, step) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    // Reuse batch silence split by temporarily writing options into a shim:
                    // call confirmBatchSilenceSplit after ensuring DOM radios match params if possible.
                    const params = step.params || {};
                    const cond = params.condition || 'all';
                    const radio = document.querySelector(`input[name="editorSilenceSplitCond"][value="${cond}"]`);
                    if (radio) radio.checked = true;
                    if (els.silenceSplitDb && params.silenceDb != null) {
                        els.silenceSplitDb.value = String(params.silenceDb);
                    }
                    if (els.silenceSplitDur && params.silenceDur != null) {
                        els.silenceSplitDur.value = String(params.silenceDur);
                    }
                    if (els.silenceSplitFixOverlap && params.fixOverlap != null) {
                        els.silenceSplitFixOverlap.checked = !!params.fixOverlap;
                    }
                    const matched = collectSilenceSplitMatches({
                        condition: cond,
                        silenceDb: Number(params.silenceDb) || -35,
                        silenceDur: Number(params.silenceDur) || 0.25,
                        durLongSec: Number(params.durLongSec) || 3,
                        cpsAbove: Number(params.cpsAbove) || 18,
                        charsLong: Number(params.charsLong) || 16,
                        fixOverlap: params.fixOverlap !== false,
                    });
                    if (!matched.length) return { status: 'skipped', summary: '无匹配条目' };
                    await confirmBatchSilenceSplit();
                    return { status: 'done', summary: '静音分割完成', changed: true };
                },
                'text.chineseConvert': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const direction = step.params?.direction === 's2t' ? 's2t' : 't2s';
                    const scope = step.params?.scope || 'all';
                    let indexes = null;
                    if (scope === 'selected') {
                        indexes = getSelectedCueIndexes();
                        if (!indexes.length) return { status: 'skipped', summary: '未选中条目' };
                    }
                    syncDetailToCue();
                    const result = chineseCore.convertCues(state.cues, {
                        direction,
                        indexes,
                        protectTerms: step.params?.protectTerms !== false,
                    });
                    if (!result.stats?.cueTouched) return { status: 'skipped', summary: '无变化' };
                    recordUndoBeforeChange();
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: result.summary || `已转换 ${result.stats.cueTouched} 条`,
                        changed: true,
                    };
                },
                'text.compressRep': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const scope = step.params?.scope || 'all';
                    let indexes = null;
                    if (scope === 'selected') {
                        indexes = getSelectedCueIndexes();
                        if (!indexes.length) return { status: 'skipped', summary: '未选中条目' };
                    }
                    syncDetailToCue();
                    const opts = {
                        indexes,
                        compressSingleChar: step.params?.compressSingleChar !== false,
                        addExclaim: step.params?.addExclaim !== false,
                        minRepeats: Number(step.params?.minRepeats) || 2,
                    };
                    const preview = fluencyCore.compressRepetitionInCues(state.cues, opts);
                    if (!preview.stats?.cueTouched) return { status: 'skipped', summary: '无叠词可压缩' };
                    recordUndoBeforeChange();
                    const result = fluencyCore.compressRepetitionInCues(state.cues, opts);
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: result.summary || `已压缩 ${result.stats.cueTouched} 条`,
                        changed: true,
                    };
                },
                'text.removeNoise': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const opts = {
                        removeEmpty: true,
                        removeFragments: true,
                        removeSoundEffects: true,
                        removeSymbolOnly: true,
                        removeDuplicates: false,
                        removeHallucinations: false,
                        ...(step.params || {}),
                    };
                    syncDetailToCue();
                    const preview = fluencyCore.removeNoiseFromCues(state.cues, opts);
                    if (!preview.stats?.removed) return { status: 'skipped', summary: '无杂音可删' };
                    recordUndoBeforeChange();
                    const result = fluencyCore.removeNoiseFromCues(state.cues, opts);
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: fluencyCore.summarizeNoiseRemoval(result.stats),
                        changed: true,
                    };
                },
                'text.findReplace': async (_c, step) => {
                    const find = String(step.params?.find || '');
                    if (!find) return { status: 'skipped', summary: '未配置查找内容' };
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    syncDetailToCue();
                    const caseSensitive = !!step.params?.caseSensitive;
                    const re = ctx.buildFindRegex
                        ? ctx.buildFindRegex(find, caseSensitive)
                        : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
                    const replacement = String(step.params?.replace ?? '');
                    let count = 0;
                    recordUndoBeforeChange();
                    for (const cue of state.cues) {
                        const text = cue.text ?? '';
                        const newText = text.replace(re, () => {
                            count += 1;
                            return replacement;
                        });
                        if (newText !== text) cue.text = newText;
                    }
                    if (!count) return { status: 'skipped', summary: '无匹配' };
                    setDirty(true);
                    renderCueList();
                    return { status: 'done', summary: `替换 ${count} 处`, changed: true };
                },
                'text.glossaryUnify': async () => {
                    const glossary = getEffectiveGlossary();
                    if (!glossary?.entries?.length) {
                        return { status: 'skipped', summary: '无术语表' };
                    }
                    const before = state.cues.map((c) => c.text).join('\0');
                    await applyGlossaryUnification(null);
                    const after = state.cues.map((c) => c.text).join('\0');
                    if (before === after) return { status: 'skipped', summary: '无术语命中' };
                    return { status: 'done', summary: '术语已统一', changed: true };
                },
                'text.glossaryScan': async () => {
                    const glossary = getEffectiveGlossary();
                    if (!glossary?.entries?.length) {
                        return { status: 'skipped', summary: '无术语表' };
                    }
                    const issues = glossaryCore.scanGlossaryIssues(state.cues, glossary) || [];
                    state.glossaryIssues = issues;
                    return {
                        status: 'done',
                        summary: issues.length ? `发现 ${issues.length} 处不一致` : '术语一致',
                    };
                },
                'presets.insertGroup': async (_c, step) => {
                    const groupId = String(step.params?.groupId || '');
                    const groupName = String(step.params?.groupName || '').trim();
                    let group = groupId
                        ? textPresetsCore.findGroup(state.textPresetsDoc, groupId)
                        : null;
                    if (!group && groupName) {
                        group = (state.textPresetsDoc?.groups || [])
                            .find((g) => g.name === groupName) || null;
                    }
                    if (!group) return { status: 'skipped', summary: '未找到预设组' };
                    insertPresetGroup(group);
                    return { status: 'done', summary: `已插入「${group.name}」`, changed: true };
                },
                'dual.exportMerged': async () => {
                    if (!state.pairPath || !state.pairCues?.length) {
                        return { status: 'skipped', summary: '无双语对照轨' };
                    }
                    await exportMergedDualSubtitle();
                    return { status: 'done', summary: '已导出合并双语' };
                },
                'file.save': async () => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    await saveDocument();
                    return { status: 'done', summary: '已保存' };
                },
                'file.saveDraft': async () => {
                    await flushDraftAutosave();
                    return { status: 'done', summary: '已写草稿' };
                },
                'ai.retranscribeDuration': async (_c, step) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const prefs = loadRetranscribeDurPrefs?.() || {};
                    const durationSec = Number(step.params?.durationSec) || prefs.durationSec || 10;
                    const padMs = Number(step.params?.padMs) ?? prefs.padMs ?? 350;
                    const snapAfter = step.params?.snapAfter !== false;
                    const startMode = step.params?.startMode || 'selected';
                    let startMs = 0;
                    if (startMode === 'playhead') {
                        startMs = ctx.getPlaybackTimeMs?.() || 0;
                    } else if (state.selectedIndex >= 0) {
                        startMs = state.cues[state.selectedIndex].startMs;
                    } else {
                        startMs = ctx.getPlaybackTimeMs?.() || 0;
                    }
                    const endMs = startMs + Math.round(durationSec * 1000);
                    await runRetranscribeRange({
                        startMs,
                        endMs,
                        padMs,
                        mode: 'duration',
                        snapAfter,
                        detail: `工作流按时长重转 ${durationSec}s…`,
                    });
                    return { status: 'done', summary: `已重转 ${durationSec}s`, changed: true };
                },
                'ai.retranscribeLowConfidence': async (_c, step, helpers) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const indexes = resolveScopeIndexes(step.params?.scope || 'lowConfidence', {
                        maxCues: Number(step.params?.maxCues) || 50,
                    });
                    if (!indexes.length) return { status: 'skipped', summary: '无低置信条目' };
                    const prefs = loadRetranscribeDurPrefs?.() || {};
                    const padMs = Number(step.params?.padMs) ?? prefs.padMs ?? 350;
                    const snapAfter = step.params?.snapAfter !== false;
                    let done = 0;
                    for (let i = 0; i < indexes.length; i += 1) {
                        if (helpers?.signal?.aborted || state.jobAbortRequested) {
                            return { status: 'cancelled', summary: `已取消（完成 ${done}）` };
                        }
                        const idx = indexes[i];
                        const cue = state.cues[idx];
                        if (!cue) continue;
                        selectCue(idx);
                        helpers?.onProgress?.({ current: i + 1, total: indexes.length });
                        await runRetranscribeRange({
                            startMs: cue.startMs,
                            endMs: cueEndMs(cue),
                            padMs,
                            mode: 'cue',
                            snapAfter,
                            detail: `低置信重转 ${i + 1}/${indexes.length}…`,
                        });
                        done += 1;
                    }
                    return {
                        status: 'done',
                        summary: `已重转 ${done} 条`,
                        changed: done > 0,
                    };
                },
                'ai.retranslateScope': async (_c, step, helpers) => {
                    if (!state.pairPath) return { status: 'skipped', summary: '无双语对照' };
                    const indexes = resolveScopeIndexes(step.params?.scope || 'selected', {
                        maxCues: Number(step.params?.maxCues) || 30,
                    });
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    let done = 0;
                    for (let i = 0; i < indexes.length; i += 1) {
                        if (helpers?.signal?.aborted || state.jobAbortRequested) {
                            return { status: 'cancelled', summary: `已取消（完成 ${done}）` };
                        }
                        selectCue(indexes[i]);
                        await retranslateSelectedCue();
                        done += 1;
                    }
                    return { status: 'done', summary: `已重译 ${done} 条`, changed: done > 0 };
                },
                'ai.retranscribeDualScope': async (_c, step, helpers) => {
                    if (!state.pairPath) return { status: 'skipped', summary: '无双语对照' };
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const indexes = resolveScopeIndexes(step.params?.scope || 'selected', {
                        maxCues: Number(step.params?.maxCues) || 30,
                    });
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    let done = 0;
                    for (let i = 0; i < indexes.length; i += 1) {
                        if (helpers?.signal?.aborted || state.jobAbortRequested) {
                            return { status: 'cancelled', summary: `已取消（完成 ${done}）` };
                        }
                        selectCue(indexes[i]);
                        await retranscribeDualSelectedCue();
                        done += 1;
                    }
                    return { status: 'done', summary: `双语重跑 ${done} 条`, changed: done > 0 };
                },
                'history.restoreInitial': async () => {
                    restoreInitialSnapshot();
                    return { status: 'done', summary: '已复原到初始', changed: true };
                },
                'cue.smartSplit': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    recordUndoBeforeChange();
                    const { splitCount, added } = applySplitModeToIndexes('smart', indexes, {
                        smartMaxChars: Number(step.params?.smartMaxChars) || 20,
                        smartLineChars: Number(step.params?.smartLineChars) || 18,
                        useCps: step.params?.useCps !== false,
                        fixOverlap: false,
                    });
                    if (!splitCount) return { status: 'skipped', summary: '无法分割' };
                    setDirty(true);
                    renderCueList();
                    return {
                        status: 'done',
                        summary: `分割 ${splitCount} 条，新增 ${added}`,
                        changed: true,
                    };
                },
                'cue.splitLines': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    recordUndoBeforeChange();
                    const { splitCount, added } = applySplitModeToIndexes('lines', indexes, {});
                    if (!splitCount) return { status: 'skipped', summary: '无法分割' };
                    setDirty(true);
                    renderCueList();
                    return {
                        status: 'done',
                        summary: `分割 ${splitCount} 条，新增 ${added}`,
                        changed: true,
                    };
                },
                'cue.splitSpaces': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    recordUndoBeforeChange();
                    const { splitCount, added } = applySplitModeToIndexes('spaces', indexes, {});
                    if (!splitCount) return { status: 'skipped', summary: '无法分割' };
                    setDirty(true);
                    renderCueList();
                    return {
                        status: 'done',
                        summary: `分割 ${splitCount} 条，新增 ${added}`,
                        changed: true,
                    };
                },
                'cue.silenceSplit': async (_c, step) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const indexes = resolveScopeIndexes(step.params?.scope || 'filtered')
                        .filter((i) => canSilenceSplitCue(state.cues[i]));
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    // Use batch silence path with selected-only by selecting each — fall back to batch all matched
                    const radio = document.querySelector('input[name="editorSilenceSplitCond"][value="all"]');
                    if (radio) radio.checked = true;
                    await confirmBatchSilenceSplit();
                    return { status: 'done', summary: '条目静音分割完成', changed: true };
                },
                'cue.compressRep': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    syncDetailToCue();
                    const opts = {
                        indexes,
                        compressSingleChar: step.params?.compressSingleChar !== false,
                        addExclaim: step.params?.addExclaim !== false,
                        minRepeats: Number(step.params?.minRepeats) || 2,
                    };
                    const preview = fluencyCore.compressRepetitionInCues(state.cues, opts);
                    if (!preview.stats?.cueTouched) return { status: 'skipped', summary: '无叠词' };
                    recordUndoBeforeChange();
                    const result = fluencyCore.compressRepetitionInCues(state.cues, opts);
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    return {
                        status: 'done',
                        summary: result.summary || `已压缩 ${result.stats.cueTouched} 条`,
                        changed: true,
                    };
                },
                'cue.charDuration': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    const targetCps = getTargetCps();
                    if (!targetCps) return { status: 'skipped', summary: '未设置目标 CPS' };
                    recordUndoBeforeChange();
                    let changed = 0;
                    for (const idx of indexes) {
                        const cue = state.cues[idx];
                        const chars = (cue.text || '').replace(/\s/g, '').length;
                        if (!chars) continue;
                        const durMs = Math.max(100, Math.round((chars / targetCps) * 1000));
                        const endMs = cue.startMs + durMs;
                        if (endMs !== cueEndMs(cue)) {
                            cue.endMs = endMs;
                            changed += 1;
                        }
                    }
                    if (!changed) return { status: 'skipped', summary: '无需调整' };
                    setDirty(true);
                    renderCueList();
                    return { status: 'done', summary: `已调 ${changed} 条时长`, changed: true };
                },
                'cue.smartDuration': async (_c, step) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const opts = {
                        mode: 'silence',
                        condition: step.params?.scope === 'selected' ? 'selected' : 'all',
                        silenceDb: Number(step.params?.silenceDb) || -35,
                        silenceDur: Number(step.params?.silenceDur) || 0.25,
                        avoidOverlap: true,
                        targetSec: 2,
                        textKeyword: '',
                    };
                    await confirmBatchSilenceDurAdjust(opts);
                    return { status: 'done', summary: '静音贴边调时长完成', changed: true };
                },
                'cue.audioSnap': async (_c, step) => {
                    if (!state.videoPath) return { status: 'skipped', summary: '未关联视频' };
                    const opts = {
                        mode: 'audio_snap',
                        condition: step.params?.scope === 'selected' ? 'selected' : 'all',
                        silenceDb: Number(step.params?.silenceDb) || -35,
                        silenceDur: Number(step.params?.silenceDur) || 0.25,
                        snapPadMs: Number(step.params?.snapPadMs) || 50,
                        avoidOverlap: true,
                        targetSec: 2,
                        textKeyword: '',
                    };
                    await confirmBatchAudioSnapAdjust(opts);
                    return { status: 'done', summary: '音频贴边完成', changed: true };
                },
                'cue.mergeSelected': async () => {
                    const selected = getSelectedCueIndexes();
                    if (selected.length < 2) return { status: 'skipped', summary: '请选中至少 2 条' };
                    await mergeSelectedCues();
                    return { status: 'done', summary: '已合并选中', changed: true };
                },
                'ui.openGlossary': async (_c, step) => {
                    await openGlossaryModal();
                    const pause = await waitWorkflowPause(step.params?.message || '请检查术语表后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
                'ui.openBreakWords': async (_c, step) => {
                    openBreakWordsModal();
                    const pause = await waitWorkflowPause(step.params?.message || '请检查断句词后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
                'ui.openTextPresets': async (_c, step) => {
                    await openTextPresetsModal();
                    const pause = await waitWorkflowPause(step.params?.message || '请检查预设组后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
                'ui.openFindReplace': async (_c, step) => {
                    openFindReplaceModal(false);
                    const pause = await waitWorkflowPause(step.params?.message || '请完成查找替换后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
                'ui.openQc': async (_c, step) => {
                    openQcModal();
                    const pause = await waitWorkflowPause(step.params?.message || '请过目质量问题后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
                'ui.pause': async (_c, step) => {
                    const pause = await waitWorkflowPause(step.params?.message || '请确认后继续');
                    if (pause.action === 'abort') return { status: 'cancelled', summary: '已中止' };
                    if (pause.action === 'skip') return { status: 'skipped', summary: '已跳过' };
                    return { status: 'done', summary: '已继续' };
                },
            };
            return base;
        }

        async function runActiveWorkflow() {
            const wf = activeWorkflow();
            if (!wf || state.workflowBusy) return;
            if (!state.cues.length && !wf.steps.every((s) => String(s.type).startsWith('ui.'))) {
                setWorkflowStatus('请先打开字幕文件');
                setStatus('请先打开字幕文件', 'err');
                return;
            }

            const enabledCount = (wf.steps || []).filter((s) => s.enabled).length;
            state.workflowBusy = true;
            state.jobAbortRequested = false;
            const ac = { aborted: false };
            state.workflowAbortController = ac;
            renderWorkflowPanel();
            setWorkflowStatus(`正在运行「${wf.name}」…`);
            setStatus(`工作流「${wf.name}」开始（${enabledCount} 步）`, '');

            showSilenceSplitProgress({
                title: `工作流：${wf.name}`,
                detail: `共 ${enabledCount} 步，准备执行…`,
                current: 0,
                total: Math.max(enabledCount, 1),
                indeterminate: enabledCount <= 1,
                hint: '可随时点击「取消」中止工作流',
                statusMessage: `工作流「${wf.name}」运行中…`,
            });
            if (typeof flushSilenceProgressPaint === 'function') {
                await flushSilenceProgressPaint();
            }

            // One undo boundary for the whole run
            syncDetailToCue();
            recordUndoBeforeChange();
            state.undoRecording = true;

            let run = null;
            try {
                const handlers = buildAllHandlers();
                run = await workflowsCore.runWorkflow(wf, handlers, {
                    signal: ac,
                    shouldConfirm: async (stepDef) => {
                        hideSilenceSplitProgress();
                        const pause = await waitWorkflowPause(
                            `即将执行「${stepDef.label || stepDef.type}」，是否继续？`,
                            { allowSkip: true },
                        );
                        if (pause.action === 'abort') {
                            ac.aborted = true;
                            return false;
                        }
                        return pause.action === 'continue';
                    },
                    onProgress: async ({ index, total, step, phase, status, summary, label }) => {
                        const stepLabel = label || step.label || step.type;
                        if (phase === 'start') {
                            const isUiStep = String(step.type || '').startsWith('ui.');
                            if (!isUiStep) {
                                showSilenceSplitProgress({
                                    title: `工作流：${wf.name}`,
                                    detail: `步骤 ${index + 1}/${total}：${stepLabel}`,
                                    current: index,
                                    total,
                                    indeterminate: false,
                                    hint: '可随时点击「取消」中止工作流',
                                    statusMessage: `工作流 ${index + 1}/${total}：${stepLabel}`,
                                });
                                if (typeof flushSilenceProgressPaint === 'function') {
                                    await flushSilenceProgressPaint();
                                }
                            } else {
                                hideSilenceSplitProgress();
                            }
                            setWorkflowStatus(`步骤 ${index + 1}/${total}：${stepLabel}`);
                            setStatus(`工作流 ${index + 1}/${total}：${stepLabel}`, '');
                        } else if (phase === 'end') {
                            const endDetail = `${stepLabel} — ${status}${summary ? `（${summary}）` : ''}`;
                            if (!String(step.type || '').startsWith('ui.')) {
                                showSilenceSplitProgress({
                                    title: `工作流：${wf.name}`,
                                    detail: endDetail,
                                    current: index + 1,
                                    total,
                                    indeterminate: false,
                                    hint: '可随时点击「取消」中止工作流',
                                    statusMessage: `工作流 ${index + 1}/${total}：${status}`,
                                });
                                if (typeof flushSilenceProgressPaint === 'function') {
                                    await flushSilenceProgressPaint();
                                }
                            }
                            setWorkflowStatus(`步骤 ${index + 1}/${total}：${endDetail}`);
                        }
                    },
                });

                const msg = workflowsCore.summarizeRun(run);
                const ok = !!(run?.ok);
                const statusType = run?.summary?.failed || run?.summary?.cancelled || run?.summary?.aborted
                    ? (run.summary.failed ? 'err' : 'warn')
                    : 'ok';
                const doneTitle = ok ? `工作流完成：${wf.name}` : `工作流结束：${wf.name}`;

                state.undoRecording = false;
                state.workflowBusy = false;
                state.workflowAbortController = null;
                hideWorkflowPause();
                renderWorkflowPanel();

                showSilenceSplitProgress({
                    title: doneTitle,
                    detail: msg,
                    current: enabledCount,
                    total: Math.max(enabledCount, 1),
                    indeterminate: false,
                    hint: ok ? '全部步骤已处理完毕' : '部分步骤未完成，可在工作流面板查看摘要',
                    statusMessage: `${wf.name}：${msg}`,
                });
                setSilenceSplitBusy(false);
                if (els.silenceProgressCancel) {
                    els.silenceProgressCancel.textContent = '关闭';
                    els.silenceProgressCancel.disabled = false;
                }
                setWorkflowStatus(msg);
                setStatus(`${wf.name}：${msg}`, statusType);
                if (typeof flushSilenceProgressPaint === 'function') {
                    await flushSilenceProgressPaint();
                }

                // 让用户看清完成摘要
                await new Promise((r) => setTimeout(r, ok ? 1400 : 2000));
            } finally {
                if (els.silenceProgressCancel) {
                    els.silenceProgressCancel.textContent = '取消';
                }
                hideSilenceSplitProgress();
                state.undoRecording = false;
                state.workflowBusy = false;
                state.workflowAbortController = null;
                hideWorkflowPause();
                renderWorkflowPanel();
                if (run) {
                    const msg = workflowsCore.summarizeRun(run);
                    const statusType = run.summary?.failed
                        ? 'err'
                        : (run.summary?.cancelled || run.summary?.aborted ? 'warn' : 'ok');
                    setWorkflowStatus(msg);
                    setStatus(`${wf.name}：${msg}`, statusType);
                    if (els.workflowModal?.classList.contains('hidden')) {
                        openWorkflowModal();
                    } else {
                        renderWorkflowPanel();
                    }
                }
                refreshQcBadge();
            }
        }

        function cancelWorkflowRun() {
            if (!state.workflowBusy) return;
            if (state.workflowAbortController) state.workflowAbortController.aborted = true;
            state.jobAbortRequested = true;
            resolveWorkflowPause('abort');
            setWorkflowStatus('正在取消…');
            setStatus('正在取消工作流…', 'warn');
            if (els.silenceProgressDetail) {
                els.silenceProgressDetail.textContent = '正在取消工作流…';
            }
        }

        function bindWorkflowEvents() {
            els.workflowBtn?.addEventListener('click', () => { void openWorkflowModal(); });
            els.workflowClose?.addEventListener('click', closeWorkflowModal);
            els.workflowModal?.querySelectorAll('[data-workflow-dismiss]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    closeWorkflowModal();
                });
            });
            els.workflowSelect?.addEventListener('change', () => {
                state.workflowsDoc.activeId = els.workflowSelect.value;
                renderWorkflowPanel();
                void persistWorkflows();
            });
            els.workflowRunBtn?.addEventListener('click', () => { void runActiveWorkflow(); });
            els.workflowCancelRunBtn?.addEventListener('click', cancelWorkflowRun);
            els.workflowContinueBtn?.addEventListener('click', () => resolveWorkflowPause('continue'));
            els.workflowSkipStepBtn?.addEventListener('click', () => resolveWorkflowPause('skip'));
            els.workflowAbortBtn?.addEventListener('click', () => resolveWorkflowPause('abort'));
            els.workflowOverlayContinueBtn?.addEventListener('click', () => resolveWorkflowPause('continue'));
            els.workflowOverlaySkipBtn?.addEventListener('click', () => resolveWorkflowPause('skip'));
            els.workflowOverlayAbortBtn?.addEventListener('click', () => resolveWorkflowPause('abort'));

            els.workflowDupBtn?.addEventListener('click', () => {
                const res = workflowsCore.duplicateWorkflow(state.workflowsDoc, state.workflowsDoc.activeId);
                if (!res.ok) {
                    setWorkflowStatus(res.error || '复制失败');
                    return;
                }
                state.workflowsDoc = res.doc;
                renderWorkflowSelect();
                renderWorkflowPanel();
                void persistWorkflows();
                setWorkflowStatus(`已复制为「${res.workflow.name}」`);
            });

            els.workflowNewBtn?.addEventListener('click', () => {
                const res = workflowsCore.upsertWorkflow(state.workflowsDoc, {
                    name: '自定义工作流',
                    note: '',
                    steps: [workflowsCore.step('qc.scan'), workflowsCore.step('timing.smartAdjust')],
                });
                if (!res.ok) {
                    setWorkflowStatus(res.error || '新建失败');
                    return;
                }
                state.workflowsDoc = res.doc;
                renderWorkflowSelect();
                renderWorkflowPanel();
                void persistWorkflows();
                setWorkflowStatus('已新建自定义工作流');
            });

            els.workflowDeleteBtn?.addEventListener('click', () => {
                const wf = activeWorkflow();
                if (!isEditableWorkflow(wf)) return;
                state.workflowsDoc = workflowsCore.removeWorkflow(state.workflowsDoc, wf.id);
                renderWorkflowSelect();
                renderWorkflowPanel();
                void persistWorkflows();
                setWorkflowStatus('已删除');
            });

            els.workflowAddStepBtn?.addEventListener('click', () => {
                const type = els.workflowAddStepSelect?.value;
                if (!type) return;
                updateActiveWorkflow((wf) => {
                    wf.steps.push(workflowsCore.step(type));
                    return wf;
                });
            });

            els.workflowStepList?.addEventListener('click', (e) => {
                const enable = e.target.closest?.('[data-wf-enable]');
                if (enable && e.target.matches?.('input[type="checkbox"]')) {
                    const id = enable.getAttribute('data-wf-enable');
                    updateActiveWorkflow((wf) => workflowsCore.setStepEnabled(wf, id, enable.checked));
                    return;
                }
                const move = e.target.closest?.('[data-wf-move]');
                if (move) {
                    const idx = Number(move.getAttribute('data-wf-idx'));
                    const delta = Number(move.getAttribute('data-wf-move'));
                    updateActiveWorkflow((wf) => workflowsCore.reorderSteps(wf, idx, idx + delta));
                    return;
                }
                const remove = e.target.closest?.('[data-wf-remove]');
                if (remove) {
                    const id = remove.getAttribute('data-wf-remove');
                    updateActiveWorkflow((wf) => {
                        wf.steps = wf.steps.filter((s) => s.id !== id);
                        return wf;
                    });
                }
            });

            els.workflowExportBtn?.addEventListener('click', () => {
                void electron?.transubExportEditorWorkflows?.().then((res) => {
                    if (res?.canceled) return;
                    if (!res?.ok) setWorkflowStatus(res?.error || '导出失败');
                    else setWorkflowStatus('已导出工作流');
                });
            });
            els.workflowImportBtn?.addEventListener('click', () => {
                void electron?.transubImportEditorWorkflows?.().then(async (res) => {
                    if (res?.canceled) return;
                    if (!res?.ok) {
                        setWorkflowStatus(res?.error || '导入失败');
                        return;
                    }
                    if (res.workflowsDoc) {
                        state.workflowsDoc = workflowsCore.ensureBuiltinWorkflows(res.workflowsDoc);
                    } else {
                        await loadWorkflows();
                    }
                    renderWorkflowSelect();
                    renderWorkflowPanel();
                    setWorkflowStatus('已导入工作流');
                });
            });
        }

        return {
            loadWorkflows,
            openWorkflowModal,
            closeWorkflowModal,
            bindWorkflowEvents,
            runActiveWorkflow,
            cancelWorkflowRun,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installWorkflows = installWorkflows;
}(typeof globalThis !== 'undefined' ? globalThis : window));
