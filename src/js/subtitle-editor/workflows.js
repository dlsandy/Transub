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
            loadFilmHints,
            getEffectiveGlossary,
            getSelectedCueIndexes,
            getVisibleCueIndexes,
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
            refreshListRow,
            showSilenceSplitProgress,
            updateSilenceSplitProgress,
            hideSilenceSplitProgress,
            flushSilenceProgressPaint,
            showInferenceProgress,
            updateInferenceProgress,
            hideInferenceProgress,
            formatInferenceElapsed,
            setSilenceSplitBusy,
            canSilenceSplitCue,
            loadRetranscribeDurPrefs,
            esc,
            syncDualDisplaySelectVisibility,
            invalidatePairOverlapIndex,
            loadDualDisplayMode,
            loadDualLineOrder,
            savePairDocument,
            basename: basenameFn,
            editorConfirm,
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

        /**
         * 简繁转换只应在整条工作流结束后执行一次（避免中途译/改写后再被后续步骤按简体规则处理）。
         * 翻译/重构步骤保持简体；设置了繁体时，在全部步骤完成后统一转繁。
         */
        async function applyTraditionalAtWorkflowEndIfNeeded() {
            if (!chineseCore?.convertCues || !state.cues?.length) return { changed: false };
            try {
                const optsRes = await electron?.transWithAiGetOptions?.({});
                const variant = optsRes?.options?.chineseSubtitleVariant;
                const trad = typeof chineseCore.isTraditionalVariant === 'function'
                    ? chineseCore.isTraditionalVariant(variant)
                    : variant === 'traditional'
                        || variant === 'traditional-tw'
                        || variant === 'traditional-hk';
                if (!trad) return { changed: false };
                const convertOpts = typeof chineseCore.variantToConvertOptions === 'function'
                    ? chineseCore.variantToConvertOptions(variant)
                    : { direction: 's2t', locale: 'twp' };
                const result = chineseCore.convertCues(state.cues, {
                    direction: convertOpts.direction,
                    locale: convertOpts.locale,
                });
                if (!result.stats?.cueTouched) return { changed: false, summary: result.summary };
                state.cues.splice(0, state.cues.length, ...result.cues);
                setDirty(true);
                renderCueList();
                if (state.selectedIndex >= 0) renderDetailPane();
                return { changed: true, summary: result.summary };
            } catch (_) {
                return { changed: false };
            }
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
                    const suffix = s.advanced ? ' · 需许可' : '';
                    parts.push(`<option value="${esc(s.id)}">${esc(s.label)}${suffix}</option>`);
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
                if (s.params?.scope) chips.push(`<span class="wf-chip">${esc(scopeChipLabel(s.params.scope))}</span>`);
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

        function scopeChipLabel(scope) {
            const map = {
                all: '全部',
                selected: '选中',
                filtered: '当前筛选',
                lowConfidence: '低置信',
                bookmarks: '书签',
            };
            return map[scope] || scope;
        }

        function resolveScopeIndexes(scope, { maxCues = 0 } = {}) {
            const mode = workflowsCore.normalizeScope(scope, 'all');
            let indexes = [];
            if (mode === 'selected') {
                indexes = getSelectedCueIndexes();
            } else if (mode === 'bookmarks') {
                const markersCore = global.TransubEditorMarkers;
                if (markersCore?.filterIndexesByBookmarks) {
                    indexes = markersCore.filterIndexesByBookmarks(state.cues, state.markers, { padMs: 80 });
                } else {
                    indexes = [];
                }
            } else if (mode === 'filtered') {
                if (typeof getVisibleCueIndexes === 'function') {
                    indexes = getVisibleCueIndexes();
                } else if (state.listFilter === 'low') {
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

        /**
         * 重构结果对照确认。
         * @param {Array<{ index: number, before: string, after: string, changed: boolean, fallback?: boolean, fallbackReason?: string }>} rows
         * @param {{ title?: string, lead?: string, failedIndexes?: number[], onRetryFailed?: () => Promise<Array<{ index: number, text: string }>|null> }} [options]
         * @returns {Promise<Array<{ index: number, text: string }>|null>}
         */
        const RECON_REVIEW_ONLY_CHANGED_KEY = 'transub-editor-recon-review-only-changed';

        function promptReconstructReview(rows, options = {}) {
            const modal = els.reconstructReviewModal;
            const listEl = els.reconstructReviewList;
            if (!modal || !listEl || !showEditorModal || !hideEditorModal) {
                return Promise.resolve(
                    rows.filter((r) => r.changed && !r.fallback).map((r) => ({ index: r.index, text: r.after })),
                );
            }

            const failedSet = new Set(
                (Array.isArray(options.failedIndexes) ? options.failedIndexes : [])
                    .filter((n) => Number.isInteger(n)),
            );

            return new Promise((resolve) => {
                let onlyChanged = true;
                try {
                    const raw = localStorage.getItem(RECON_REVIEW_ONLY_CHANGED_KEY);
                    if (raw === 'false') onlyChanged = false;
                } catch (_) { /* ignore */ }

                // Do not auto-check fallback / failed rows (e.g. MT source-echo / alignment revert)
                const selected = new Set(
                    rows
                        .filter((r) => r.changed && !r.fallback && !failedSet.has(r.index))
                        .map((r) => r.index),
                );
                const escape = typeof esc === 'function'
                    ? esc
                    : (s) => String(s ?? '')
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');

                if (els.reconstructReviewTitle) {
                    els.reconstructReviewTitle.textContent = options.title || '重构结果对照';
                }
                if (els.reconstructReviewLead) {
                    els.reconstructReviewLead.textContent = options.lead
                        || '左边为原文，右边为重构结果。勾选要替换的条目后确认，才会覆盖字幕。';
                }
                if (els.reconstructReviewBeforeLabel) {
                    els.reconstructReviewBeforeLabel.textContent = options.beforeLabel || '原文';
                }
                if (els.reconstructReviewAfterLabel) {
                    els.reconstructReviewAfterLabel.textContent = options.afterLabel || '重构后';
                }

                const updateMeta = () => {
                    if (!els.reconstructReviewMeta) return;
                    const changed = rows.filter((r) => r.changed && !r.fallback).length;
                    const reverted = rows.filter((r) => r.fallback || failedSet.has(r.index)).length;
                    const revertPart = reverted ? ` · 已回退 ${reverted}` : '';
                    els.reconstructReviewMeta.textContent = `变更 ${changed} / 共 ${rows.length} 条${revertPart} · 已勾选 ${selected.size}`;
                };

                const syncOnlyChangedBtn = () => {
                    if (!els.reconstructReviewOnlyChanged) return;
                    els.reconstructReviewOnlyChanged.textContent = onlyChanged
                        ? '显示全部返回'
                        : '仅显示变更';
                };

                const fallbackTagHtml = (row) => {
                    if (!(row.fallback || failedSet.has(row.index))) return '';
                    const reason = String(row.fallbackReason || '').trim();
                    const label = reason === 'alignment'
                        ? '已回退原文'
                        : (reason === 'failed' ? '块失败回退' : '回退');
                    return `<span class="recon-fallback-tag" title="${escape(label)}">${escape(label)}</span>`;
                };

                const renderList = () => {
                    // 变更与回退条目默认可见，便于核对防合并回退
                    const visible = onlyChanged
                        ? rows.filter((r) => r.changed || r.fallback || failedSet.has(r.index))
                        : rows;
                    if (!visible.length) {
                        listEl.innerHTML = '<div class="recon-review-empty">没有文本变更</div>';
                        updateMeta();
                        return;
                    }
                    listEl.innerHTML = visible.map((row) => {
                        const isFallback = row.fallback || failedSet.has(row.index);
                        const checked = selected.has(row.index) ? ' checked' : '';
                        const disabled = (row.changed && !isFallback) ? '' : ' disabled';
                        const rowClass = [
                            row.changed && !isFallback ? '' : ' is-unchanged',
                            isFallback ? ' is-fallback' : '',
                        ].join('');
                        const label = Number.isInteger(row.index) ? `#${row.index + 1}` : '—';
                        return `
                            <div class="recon-review-row${rowClass}" role="listitem" data-recon-index="${row.index}">
                                <input type="checkbox" class="recon-check" data-recon-check="${row.index}"${checked}${disabled}>
                                <button type="button" class="recon-idx" data-recon-jump="${row.index}">${escape(label)}${fallbackTagHtml(row)}</button>
                                <span class="recon-review-cell is-before">${escape(row.before || '（空）')}</span>
                                <textarea class="recon-review-after recon-review-cell is-after" data-recon-after="${row.index}" rows="2"${isFallback ? ' readonly' : ''}>${escape(row.after || '')}</textarea>
                            </div>
                        `;
                    }).join('');
                    updateMeta();
                };

                let settled = false;
                const cleanup = () => {
                    modal.querySelectorAll('[data-recon-review-dismiss]').forEach((el) => {
                        el.removeEventListener('click', onCancel);
                    });
                    els.reconstructReviewConfirm?.removeEventListener('click', onConfirm);
                    els.reconstructReviewSelectAll?.removeEventListener('click', onSelectAll);
                    els.reconstructReviewSelectNone?.removeEventListener('click', onSelectNone);
                    els.reconstructReviewOnlyChanged?.removeEventListener('click', onToggleOnlyChanged);
                    els.reconstructReviewRetryFailed?.removeEventListener('click', onRetryFailed);
                    listEl.removeEventListener('change', onListChange);
                    listEl.removeEventListener('click', onListClick);
                    document.removeEventListener('keydown', onKey);
                };
                const finish = (payload) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    hideEditorModal(modal);
                    resolve(payload);
                };
                const readAcceptedFromUi = () => rows
                    .filter((r) => r.changed && !r.fallback && !failedSet.has(r.index) && selected.has(r.index))
                    .map((r) => {
                        const ta = listEl.querySelector(`[data-recon-after="${r.index}"]`);
                        const text = ta ? String(ta.value ?? '') : String(r.after ?? '');
                        return { index: r.index, text };
                    });
                const onCancel = () => finish(null);
                const onConfirm = () => finish(readAcceptedFromUi());
                const onSelectAll = () => {
                    rows.forEach((r) => {
                        if (r.changed && !r.fallback && !failedSet.has(r.index)) {
                            selected.add(r.index);
                        }
                    });
                    renderList();
                };
                const onSelectNone = () => {
                    selected.clear();
                    renderList();
                };
                const onToggleOnlyChanged = () => {
                    onlyChanged = !onlyChanged;
                    try {
                        localStorage.setItem(RECON_REVIEW_ONLY_CHANGED_KEY, onlyChanged ? 'true' : 'false');
                    } catch (_) { /* ignore */ }
                    syncOnlyChangedBtn();
                    renderList();
                };
                const onListChange = (ev) => {
                    const input = ev.target?.closest?.('[data-recon-check]');
                    if (!input) return;
                    const idx = Number(input.getAttribute('data-recon-check'));
                    if (!Number.isInteger(idx)) return;
                    if (input.checked) selected.add(idx);
                    else selected.delete(idx);
                    updateMeta();
                };
                const onListClick = (ev) => {
                    if (ev.target.closest('[data-recon-check]')) return;
                    if (ev.target.closest('textarea')) return;
                    const jump = ev.target.closest?.('[data-recon-jump]');
                    const row = jump || ev.target.closest?.('[data-recon-index]');
                    if (!row) return;
                    const idx = Number(row.getAttribute('data-recon-jump') ?? row.getAttribute('data-recon-index'));
                    if (Number.isInteger(idx) && typeof selectCue === 'function') {
                        selectCue(idx, { scroll: true, seek: true });
                    }
                };
                const onRetryFailed = async () => {
                    if (!options.onRetryFailed || settled) return;
                    const retryBtn = els.reconstructReviewRetryFailed;
                    if (retryBtn) retryBtn.disabled = true;
                    try {
                        const merged = await options.onRetryFailed();
                        if (!merged?.length) return;
                        for (const u of merged) {
                            const idx = Number(u.index);
                            if (!Number.isInteger(idx)) continue;
                            const row = rows.find((r) => r.index === idx);
                            if (!row) continue;
                            const after = String(u.text ?? '');
                            row.after = after;
                            row.changed = row.before !== after;
                            row.fallback = false;
                            failedSet.delete(idx);
                            if (row.changed) selected.add(idx);
                        }
                        if (els.reconstructReviewRetryFailed) {
                            els.reconstructReviewRetryFailed.classList.toggle('hidden', failedSet.size === 0);
                        }
                        renderList();
                    } finally {
                        if (retryBtn) retryBtn.disabled = false;
                    }
                };
                const onKey = (ev) => {
                    if (ev.key === 'Escape') {
                        ev.preventDefault();
                        onCancel();
                    }
                };

                modal.querySelectorAll('[data-recon-review-dismiss]').forEach((el) => {
                    el.addEventListener('click', onCancel);
                });
                els.reconstructReviewConfirm?.addEventListener('click', onConfirm);
                els.reconstructReviewSelectAll?.addEventListener('click', onSelectAll);
                els.reconstructReviewSelectNone?.addEventListener('click', onSelectNone);
                els.reconstructReviewOnlyChanged?.addEventListener('click', onToggleOnlyChanged);
                if (els.reconstructReviewRetryFailed) {
                    const showRetry = failedSet.size > 0 && typeof options.onRetryFailed === 'function';
                    els.reconstructReviewRetryFailed.classList.toggle('hidden', !showRetry);
                    els.reconstructReviewRetryFailed.disabled = !showRetry;
                    if (showRetry) {
                        els.reconstructReviewRetryFailed.addEventListener('click', onRetryFailed);
                    }
                }
                listEl.addEventListener('change', onListChange);
                listEl.addEventListener('click', onListClick);
                document.addEventListener('keydown', onKey);

                syncOnlyChangedBtn();
                renderList();
                showEditorModal(modal, els.reconstructReviewConfirm);
            });
        }

        /**
         * 影片简要预览确认（可编辑后再改写）。
         * @param {object} brief
         * @param {{ sourceCoverage?: { message?: string, level?: string } }} [options]
         * @returns {Promise<object|null>}
         */
        function promptFilmBriefPreview(brief, options = {}) {
            const modal = els.filmBriefModal;
            if (!modal || !showEditorModal || !hideEditorModal) {
                return Promise.resolve(brief || null);
            }
            const filmCore = global.TransubAdvancedFilmReconstruct;
            const normalized = filmCore?.normalizeFilmBrief
                ? filmCore.normalizeFilmBrief(brief)
                : (brief || {});

            const formatChars = (list) => {
                if (filmCore?.formatCharactersForEdit) return filmCore.formatCharactersForEdit(list);
                return (Array.isArray(list) ? list : []).map((c) => {
                    if (typeof c === 'string') return c;
                    let line = c?.name || '';
                    if (c?.role) line += `（${c.role}）`;
                    if (c?.notes) line += `：${c.notes}`;
                    return line;
                }).filter(Boolean).join('\n');
            };
            const formatTerms = (list) => {
                if (filmCore?.formatTermsForEdit) return filmCore.formatTermsForEdit(list);
                return (Array.isArray(list) ? list : []).map((t) => {
                    if (typeof t === 'string') return t;
                    return t?.meaning ? `${t.term}：${t.meaning}` : (t?.term || '');
                }).filter(Boolean).join('\n');
            };
            const formatLines = (list) => (Array.isArray(list) ? list : [])
                .map((x) => String(x || '').trim())
                .filter(Boolean)
                .join('\n');

            return new Promise((resolve) => {
                const audienceOpts = {
                    fileName: state.videoPath || state.path || '',
                    path: state.videoPath || state.path || '',
                };
                try {
                    const profileApi = global.TransubContentProfile;
                    const hit = profileApi?.classifyContentProfile?.({
                        path: state.videoPath || state.path || '',
                        fileName: String(state.videoPath || state.path || '').split(/[/\\]/).pop() || '',
                    });
                    if (hit?.profile) audienceOpts.contentProfile = hit.profile;
                    if (hit?.strongAv) audienceOpts.strongAv = true;
                } catch (_) { /* ignore */ }
                const cleaned = filmCore?.scrubAvoidForAudience
                    ? filmCore.scrubAvoidForAudience(normalized, audienceOpts)
                    : normalized;

                if (els.filmBriefTitleGuess) els.filmBriefTitleGuess.value = cleaned.titleGuess || '';
                if (els.filmBriefGenre) els.filmBriefGenre.value = cleaned.genre || '';
                if (els.filmBriefSynopsis) els.filmBriefSynopsis.value = cleaned.synopsis || '';
                if (els.filmBriefTone) els.filmBriefTone.value = cleaned.tone || '';
                if (els.filmBriefStyleNotes) els.filmBriefStyleNotes.value = cleaned.styleNotes || '';
                if (els.filmBriefCharacters) {
                    els.filmBriefCharacters.value = formatChars(cleaned.characters);
                }
                if (els.filmBriefTerms) {
                    els.filmBriefTerms.value = formatTerms(cleaned.terms);
                }
                if (els.filmBriefTimeline) {
                    els.filmBriefTimeline.value = filmCore?.formatTimelineForEdit
                        ? filmCore.formatTimelineForEdit(cleaned.timeline)
                        : formatLines(cleaned.timeline);
                }
                if (els.filmBriefAvoid) {
                    els.filmBriefAvoid.value = filmCore?.formatAvoidForEdit
                        ? filmCore.formatAvoidForEdit(cleaned.avoid)
                        : formatLines(cleaned.avoid);
                }

                const coverage = options.sourceCoverage || null;
                const leadEl = document.getElementById('editorFilmBriefLead');
                if (leadEl) {
                    const baseLead = '请先核对人物、专名与梗概；确认后才会开始场景改写。Brief 不准时后面整片都会跟着偏。';
                    const coverMsg = String(coverage?.message || '').trim();
                    leadEl.textContent = coverMsg ? `${baseLead}\n${coverMsg}` : baseLead;
                }
                const coverHint = document.getElementById('editorFilmBriefSourceHint');
                if (coverHint) {
                    const coverMsg = String(coverage?.message || '').trim();
                    const level = String(coverage?.level || '');
                    if (coverMsg) {
                        coverHint.textContent = coverMsg;
                        coverHint.classList.remove('hidden');
                        coverHint.classList.toggle('is-warn', level === 'none' || level === 'low');
                        coverHint.classList.toggle('is-ok', level === 'full' || level === 'partial');
                    } else {
                        coverHint.textContent = '';
                        coverHint.classList.add('hidden');
                        coverHint.classList.remove('is-warn', 'is-ok');
                    }
                }

                let settled = false;
                const finish = (payload) => {
                    if (settled) return;
                    settled = true;
                    modal.querySelectorAll('[data-film-brief-dismiss]').forEach((el) => {
                        el.removeEventListener('click', onCancel);
                    });
                    els.filmBriefConfirm?.removeEventListener('click', onConfirm);
                    document.removeEventListener('keydown', onKey);
                    hideEditorModal(modal);
                    resolve(payload);
                };
                const onCancel = () => finish(null);
                const onConfirm = () => {
                    const draft = {
                        titleGuess: els.filmBriefTitleGuess?.value || '',
                        genre: els.filmBriefGenre?.value || '',
                        synopsis: els.filmBriefSynopsis?.value || '',
                        tone: els.filmBriefTone?.value || '',
                        styleNotes: els.filmBriefStyleNotes?.value || '',
                        characters: els.filmBriefCharacters?.value || '',
                        terms: els.filmBriefTerms?.value || '',
                        timeline: els.filmBriefTimeline?.value || '',
                        avoid: els.filmBriefAvoid?.value || '',
                    };
                    const next = filmCore?.normalizeFilmBrief
                        ? filmCore.normalizeFilmBrief(draft)
                        : {
                            ...normalized,
                            ...draft,
                            characters: String(draft.characters || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                            terms: String(draft.terms || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                            timeline: String(draft.timeline || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                            avoid: String(draft.avoid || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                        };
                    const scrubbed = filmCore?.scrubAvoidForAudience
                        ? filmCore.scrubAvoidForAudience(next, {
                            ...audienceOpts,
                            genre: next.genre,
                            titleGuess: next.titleGuess,
                            synopsis: next.synopsis,
                        })
                        : next;
                    finish(scrubbed);
                };
                const onKey = (ev) => {
                    if (ev.key === 'Escape') {
                        ev.preventDefault();
                        onCancel();
                    }
                };

                modal.querySelectorAll('[data-film-brief-dismiss]').forEach((el) => {
                    el.addEventListener('click', onCancel);
                });
                els.filmBriefConfirm?.addEventListener('click', onConfirm);
                document.addEventListener('keydown', onKey);
                const body = modal.querySelector('.film-brief-body');
                if (body) body.scrollTop = 0;
                showEditorModal(modal, els.filmBriefTitleGuess || els.filmBriefConfirm);
            });
        }

        async function runContextReconstructOnce({
            scope = 'all',
            windowCues,
            overlapCues,
            preserveTiming,
            mode = 'basic',
            sceneMaxCues = 36,
            sceneGapMs = 2500,
            filmTitle = '',
            filmSynopsis = '',
            filmTerms = '',
            filmBrief = null,
            userNote = '',
            note = '',
            intensity,
            skipConsistency,
            briefSampleMode,
            skipReview = false,
            cueIndexes = null,
        } = {}) {
            const prefsApi = global.TransubEditorSettingsPrefs;
            const prefs = typeof prefsApi?.getReconstructPrefs === 'function'
                ? prefsApi.getReconstructPrefs()
                : {
                    windowCues: 30,
                    overlapCues: 2,
                    intensity: 'balanced',
                    preserveTiming: true,
                    skipConsistency: false,
                    briefSampleMode: 'auto',
                };
            windowCues = Number.isFinite(Number(windowCues)) ? Number(windowCues) : prefs.windowCues;
            overlapCues = Number.isFinite(Number(overlapCues)) ? Number(overlapCues) : prefs.overlapCues;
            preserveTiming = preserveTiming != null ? !!preserveTiming : prefs.preserveTiming !== false;
            intensity = String(intensity || prefs.intensity || 'balanced').trim() || 'balanced';
            skipConsistency = skipConsistency != null ? !!skipConsistency : !!prefs.skipConsistency;
            let resolvedBriefSampleMode = String(briefSampleMode || '').trim().toLowerCase() === 'full'
                ? 'full'
                : '';
            if (!resolvedBriefSampleMode) {
                // Editor window cannot read main-window localStorage; use disk settings.
                try {
                    const optsRes = await electron?.transWithAiGetOptions?.({});
                    if (optsRes?.options?.filmBriefSampleMode === 'full') {
                        resolvedBriefSampleMode = 'full';
                    }
                } catch (_) { /* ignore */ }
            }
            if (!resolvedBriefSampleMode) {
                resolvedBriefSampleMode = String(prefs.briefSampleMode || 'auto').trim().toLowerCase() === 'full'
                    ? 'full'
                    : 'auto';
            }
            const filmMode = mode === 'film';
            const invoke = filmMode
                ? electron?.transubAdvancedFilmContextReconstruct
                : electron?.transubAdvancedContextReconstruct;
            if (!invoke) {
                return { status: 'failed', summary: '当前环境不支持 Pro' };
            }
            if (state.reconstructBusy) {
                return { status: 'skipped', summary: '语境重构进行中' };
            }
            if (state.computeBusy) {
                return {
                    status: 'skipped',
                    summary: state.computeBusyLabel
                        ? `已有${state.computeBusyLabel}正在运行`
                        : '其它窗口有引擎或 LLM 任务正在运行',
                };
            }
            let indexes = Array.isArray(cueIndexes) && cueIndexes.length
                ? [...cueIndexes].filter((n) => Number.isInteger(n))
                : resolveScopeIndexes(scope);
            if (!indexes.length) {
                return { status: 'skipped', summary: '范围内无字幕' };
            }
            if (!state.pairCues?.length && state.keptTranscript?.found && !state.keptTranscript.cues?.length) {
                try {
                    const doc = await electron?.transubReadSubtitle?.({ path: state.keptTranscript.path });
                    if (doc?.ok) state.keptTranscript.cues = Array.isArray(doc.cues) ? doc.cues : [];
                } catch (_) { /* ignore */ }
            }
            const dualApi = global.TransubDualSubtitle || null;
            const buildCuesPayload = (idxList) => idxList.map((idx) => {
                const cue = state.cues[idx];
                let sourceText = '';
                if (dualApi && state.pairCues?.length && cue) {
                    const hit = dualApi.findBestOverlapCue(
                        state.pairCues,
                        cue.startMs,
                        cue.endMs,
                    );
                    sourceText = String(hit?.cue?.text || '');
                }
                // Fallback: kept ASR transcript cache when no dual pair is mounted
                if (!sourceText && state.keptTranscript?.cues?.length && cue) {
                    const compare = global.TransubTranscriptCompare;
                    const hit = compare?.findBestOverlapCue?.(
                        state.keptTranscript.cues,
                        cue.startMs,
                        cue.endMs,
                    );
                    sourceText = String(hit?.cue?.text || '');
                }
                return {
                    index: idx,
                    startMs: cue?.startMs,
                    endMs: cue?.endMs,
                    text: cue?.text || '',
                    sourceText,
                };
            });

            const effectiveNote = String(userNote || note || '').trim();
            const effectiveTitle = String(filmTitle || '').trim();
            const effectiveSynopsis = String(filmSynopsis || '').trim();
            const effectiveTerms = String(filmTerms || '').trim();
            const effectiveIntensity = String(intensity || 'balanced').trim() || 'balanced';
            const filmCoreApi = global.TransubAdvancedFilmReconstruct;
            const rewriteLimits = filmMode && filmCoreApi?.suggestSceneRewriteLimits
                ? filmCoreApi.suggestSceneRewriteLimits({ intensity: effectiveIntensity })
                : (filmMode ? ({
                    light: { sceneMaxCues: 40 },
                    strong: { sceneMaxCues: 22 },
                    balanced: { sceneMaxCues: 36 },
                }[effectiveIntensity] || { sceneMaxCues: 36 }) : null);
            const effectiveSceneMaxCues = rewriteLimits?.sceneMaxCues
                || Number(sceneMaxCues) || 36;

            const summarizeCoverageLocal = (probe) => {
                const list = Array.isArray(probe) ? probe : [];
                const total = list.length;
                const withSource = list.filter((c) => String(c?.sourceText || '').trim()).length;
                const ratio = total ? withSource / total : 0;
                if (!total) return { total: 0, withSource: 0, ratio: 0, level: 'none', message: '' };
                if (withSource === 0) {
                    return {
                        total, withSource, ratio, level: 'none',
                        message: '未找到原字幕：影片理解将依据译文字幕，建议先挂载或生成原文轨。',
                    };
                }
                if (ratio < 0.5) {
                    return {
                        total, withSource, ratio, level: 'low',
                        message: `原字幕覆盖约 ${Math.round(ratio * 100)}%（${withSource}/${total}）：无原文的条目将用译文补齐理解。`,
                    };
                }
                if (withSource < total) {
                    return {
                        total, withSource, ratio, level: 'partial',
                        message: `原字幕覆盖 ${withSource}/${total} 条；Brief 优先依据原文，缺原文条用译文补齐。`,
                    };
                }
                return {
                    total, withSource, ratio, level: 'full',
                    message: `已挂载原字幕（${total} 条），Brief 将优先依据原文理解。`,
                };
            };

            // 原文覆盖率（Brief 优先原字幕）
            let sourceCoverage = null;
            if (filmMode) {
                try {
                    const probe = buildCuesPayload(
                        state.cues.length > indexes.length
                            ? state.cues.map((_, i) => i)
                            : indexes,
                    );
                    sourceCoverage = filmCoreApi?.summarizeSourceCoverage
                        ? filmCoreApi.summarizeSourceCoverage(probe)
                        : summarizeCoverageLocal(probe);
                } catch (_) {
                    sourceCoverage = null;
                }
            }

            state.reconstructBusy = true;
            const titleText = filmMode ? '影片理解重构中' : '语境重构中';
            const formatElapsed = typeof formatInferenceElapsed === 'function'
                ? formatInferenceElapsed
                : ((ms) => {
                    const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
                    if (sec < 60) return `${sec}s`;
                    return `${Math.floor(sec / 60)}m${sec % 60}s`;
                });
            const chunkDurations = [];
            let lastChunkMark = Date.now();
            const showProgress = (info = {}) => {
                if (info.phase === 'chunk-done' && info.chunk) {
                    const now = Date.now();
                    if (lastChunkMark) chunkDurations.push(now - lastChunkMark);
                    lastChunkMark = now;
                } else if (info.phase === 'chunk' && info.chunk === 1) {
                    lastChunkMark = Date.now();
                }
                let countText = `${indexes.length} 条`;
                if (info.phase === 'brief' || info.phase === 'brief-done') countText = 'Brief';
                else if (info.phase === 'consistency') countText = '校对';
                else if (info.chunk && info.total) countText = `块 ${info.chunk} / ${info.total}`;

                const elapsed = info.elapsedMs != null ? ` · 已用时 ${formatElapsed(info.elapsedMs)}` : '';
                let eta = '';
                if (info.chunk && info.total && chunkDurations.length) {
                    const avg = chunkDurations.reduce((a, b) => a + b, 0) / chunkDurations.length;
                    const remaining = Math.max(0, Number(info.total) - Number(info.chunk));
                    if (remaining > 0) {
                        eta = ` · 预计剩余 ~${formatElapsed(avg * remaining)}`;
                    }
                }
                const hint = filmMode
                    ? (info.phase === 'consistency'
                        ? `正在按影片简要统一专名与人称，可随时取消${elapsed}`
                        : `先分析全片 Brief，再按场景改写，可随时取消${elapsed}${eta}`)
                    : `正在按块调用大模型改写译文，可随时取消${elapsed}${eta}`;

                if (typeof showInferenceProgress === 'function') {
                    const overlay = document.getElementById('editorReconstructProgress');
                    if (!overlay || overlay.classList.contains('hidden')) {
                        showInferenceProgress({
                            kind: filmMode ? 'film' : 'reconstruct',
                            badge: '大模型推理',
                            title: titleText,
                            detail: info.message || `正在处理 ${indexes.length} 条字幕…`,
                            countText,
                            hint,
                            pct: info.pct,
                            indeterminate: !Number.isFinite(Number(info.pct)),
                        });
                    } else {
                        updateInferenceProgress({
                            title: titleText,
                            message: info.message || `正在处理 ${indexes.length} 条字幕…`,
                            countText,
                            hint,
                            pct: info.pct,
                            phase: info.phase,
                            chunk: info.chunk,
                            total: info.total,
                        });
                    }
                } else {
                    setStatus(info.message || `${titleText}…`);
                }
            };
            const hideProgress = () => {
                if (typeof hideInferenceProgress === 'function') hideInferenceProgress();
                else {
                    const overlay = document.getElementById('editorReconstructProgress');
                    overlay?.classList.add('hidden');
                    overlay?.setAttribute('aria-busy', 'false');
                    state.reconstructBusy = false;
                }
            };

            const collectFailedIndexes = (res) => {
                const out = new Set();
                for (const f of res?.failures || []) {
                    for (const idx of f?.indexes || []) {
                        if (Number.isInteger(idx)) out.add(idx);
                    }
                }
                return [...out];
            };

            const buildRowsFromUpdates = (updates, failedIndexes = [], alignmentRevertedIndexes = []) => {
                const failedSet = new Set(failedIndexes);
                const alignmentSet = new Set(
                    (Array.isArray(alignmentRevertedIndexes) ? alignmentRevertedIndexes : [])
                        .filter((n) => Number.isInteger(n)),
                );
                const rows = [];
                for (const u of updates) {
                    const idx = Number(u.index);
                    if (!Number.isInteger(idx) || !state.cues[idx]) continue;
                    const before = String(state.cues[idx].text ?? '');
                    const after = String(u.text ?? '');
                    const isAlignment = alignmentSet.has(idx);
                    const isFailed = failedSet.has(idx);
                    const fallback = isAlignment || isFailed;
                    rows.push({
                        index: idx,
                        before,
                        after,
                        changed: before !== after || fallback,
                        fallback,
                        fallbackReason: isAlignment ? 'alignment' : (isFailed ? 'failed' : ''),
                    });
                }
                // 整块回退时 after===before，仍要把回退 index 补进列表
                for (const idx of alignmentSet) {
                    if (rows.some((r) => r.index === idx)) continue;
                    if (!state.cues[idx]) continue;
                    const text = String(state.cues[idx].text ?? '');
                    rows.push({
                        index: idx,
                        before: text,
                        after: text,
                        changed: true,
                        fallback: true,
                        fallbackReason: 'alignment',
                    });
                }
                return rows.sort((a, b) => a.index - b.index);
            };

            const invokeReconstruct = async ({
                idxList,
                brief = filmBrief,
                keepServer = false,
                briefOnly = false,
            } = {}) => {
                const payload = {
                    cues: buildCuesPayload(idxList),
                    scope,
                    windowCues,
                    overlapCues,
                    preserveTiming,
                    skipConsistency,
                    sceneMaxCues: filmMode ? effectiveSceneMaxCues : sceneMaxCues,
                    sceneGapMs,
                    glossary: getEffectiveGlossary(),
                    filmTitle: effectiveTitle,
                    filmSynopsis: effectiveSynopsis,
                    filmTerms: effectiveTerms,
                    userNote: effectiveNote,
                    note: effectiveNote,
                    intensity: effectiveIntensity,
                    fileName: state.videoPath || state.path || '',
                    path: state.videoPath || state.path || '',
                    videoPath: state.videoPath || '',
                    _keepManagedServer: keepServer,
                };
                if (filmMode) payload.briefSampleMode = resolvedBriefSampleMode;
                try {
                    const profileApi = global.TransubContentProfile;
                    const hit = profileApi?.classifyContentProfile?.({
                        path: state.videoPath || state.path || '',
                        fileName: String(state.videoPath || state.path || '').split(/[/\\]/).pop() || '',
                    });
                    if (hit?.profile) payload.contentProfile = hit.profile;
                    if (hit?.strongAv) payload.strongAv = true;
                } catch (_) { /* ignore */ }
                if (brief) payload.filmBrief = brief;
                if (briefOnly) payload.briefOnly = true;
                return invoke(payload);
            };

            showProgress({
                message: filmMode
                    ? `影片理解重构中（${indexes.length} 条）…`
                    : `语境重构中（${indexes.length} 条）…`,
                pct: 0,
            });
            const offProgress = electron.onAdvancedReconstructProgress?.((info) => {
                if (!info || info.mode === 'batch') return;
                showProgress(info);
            });

            try {
                let resolvedBrief = filmBrief;
                if (filmMode && !resolvedBrief) {
                    // 局部改写也用全片抽样生成 Brief，避免「影片理解」只见选区
                    const briefIndexes = state.cues.length > indexes.length
                        ? state.cues.map((_, i) => i)
                        : indexes;
                    const briefRes = await invokeReconstruct({
                        idxList: briefIndexes,
                        brief: null,
                        keepServer: true,
                        briefOnly: true,
                    });
                    if (!briefRes?.ok) {
                        try { await electron?.transubAdvancedManagedLlmStopServer?.(); } catch (_) { /* ignore */ }
                        return {
                            status: briefRes?.code === 'aborted' ? 'cancelled' : 'failed',
                            summary: briefRes?.error || '影片简要生成失败',
                        };
                    }
                    if (briefRes.briefOnly && briefRes.filmBrief) {
                        hideProgress();
                        const confirmedBrief = await promptFilmBriefPreview(briefRes.filmBrief, {
                            sourceCoverage,
                        });
                        if (!confirmedBrief) {
                            try { await electron?.transubAdvancedManagedLlmStopServer?.(); } catch (_) { /* ignore */ }
                            return { status: 'cancelled', summary: '已取消 Brief 确认' };
                        }
                        resolvedBrief = confirmedBrief;
                        showProgress({
                            message: `Brief 已确认，开始场景改写（${indexes.length} 条）…`,
                            pct: 12,
                        });
                    }
                }

                let res = await invokeReconstruct({
                    idxList: indexes,
                    brief: resolvedBrief,
                    keepServer: false,
                });
                if (!res?.ok) {
                    return {
                        status: res?.code === 'aborted' ? 'cancelled' : 'failed',
                        summary: res?.error || (filmMode ? '影片理解重构失败' : '语境重构失败'),
                    };
                }
                const updates = Array.isArray(res.cues) ? res.cues : [];
                if (!updates.length && !res.briefOnly) {
                    return {
                        status: 'skipped',
                        summary: res.message || '未返回改写结果',
                    };
                }

                let failedIndexes = collectFailedIndexes(res);
                const alignmentRevertedIndexes = Array.isArray(res.stats?.alignmentRevertedIndexes)
                    ? res.stats.alignmentRevertedIndexes
                    : [];
                let rows = buildRowsFromUpdates(updates, failedIndexes, alignmentRevertedIndexes);
                if (!rows.length) {
                    return { status: 'skipped', summary: '未返回可应用条目' };
                }
                const changedCount = rows.filter((r) => r.changed && !r.fallback).length;
                const revertedCount = rows.filter((r) => r.fallback).length;
                if (!changedCount && !revertedCount) {
                    return { status: 'skipped', summary: '无文本变更' };
                }
                // 若只有回退、无真正改写，仍展示对照，方便用户知情
                if (!changedCount && revertedCount) {
                    hideProgress();
                    setStatus(`重构未产生可用改写（已回退 ${revertedCount} 条防合并/失败）`, 'warn');
                } else {
                    hideProgress();
                    setStatus(`重构完成，请对照确认（变更 ${changedCount} 条）…`);
                }

                const via = res.via === 'mock' ? '模拟'
                    : (res.via === 'module' ? '模块'
                        : (filmMode ? '影片理解' : '内置'));
                const failHint = res.stats?.failedChunks
                    ? `，${res.stats.failedChunks} 块回退`
                    : '';
                const alignHint = alignmentRevertedIndexes.length
                    ? `，防合并回退 ${alignmentRevertedIndexes.length} 条`
                    : '';

                let accepted = null;
                if (skipReview) {
                    accepted = rows
                        .filter((r) => r.changed && !r.fallback)
                        .map((r) => ({ index: r.index, text: r.after }));
                } else {
                    accepted = await promptReconstructReview(rows, {
                        title: filmMode ? '影片理解重构 · 结果对照' : '语境重构 · 结果对照',
                        lead: `来源：${via}${failHint}${alignHint}。带「已回退原文」的条目因合并/错位已自动保留原译，不会勾选。确认后才会覆盖字幕。`,
                        failedIndexes,
                        onRetryFailed: failedIndexes.length
                            ? async () => {
                                showProgress({
                                    message: `重试失败块（${failedIndexes.length} 条）…`,
                                    pct: 0,
                                });
                                const retryRes = await invokeReconstruct({
                                    idxList: failedIndexes,
                                    brief: resolvedBrief,
                                    keepServer: true,
                                });
                                hideProgress();
                                if (!retryRes?.ok) {
                                    setStatus(retryRes?.error || '重试失败', 'err');
                                    return null;
                                }
                                const retryUpdates = Array.isArray(retryRes.cues) ? retryRes.cues : [];
                                const retryFailed = collectFailedIndexes(retryRes);
                                failedIndexes = retryFailed;
                                res = retryRes;
                                return retryUpdates.map((u) => ({
                                    index: Number(u.index),
                                    text: String(u.text ?? ''),
                                })).filter((u) => Number.isInteger(u.index));
                            }
                            : undefined,
                    });
                }

                if (!accepted) {
                    return { status: 'cancelled', summary: '已放弃替换' };
                }
                if (!accepted.length) {
                    return { status: 'skipped', summary: '未勾选任何变更' };
                }

                recordUndoBeforeChange();
                let changed = 0;
                for (const u of accepted) {
                    const idx = Number(u.index);
                    if (!Number.isInteger(idx) || !state.cues[idx]) continue;
                    const nextText = String(u.text ?? '');
                    if (nextText !== state.cues[idx].text) {
                        state.cues[idx].text = nextText;
                        changed += 1;
                    }
                }
                if (!changed) return { status: 'skipped', summary: '无文本变更' };
                setDirty(true);
                if (changed > 80 || typeof refreshListRow !== 'function') {
                    renderCueList();
                } else {
                    for (const u of accepted) {
                        const idx = Number(u.index);
                        if (Number.isInteger(idx)) refreshListRow(idx);
                    }
                }
                renderDetailPane();
                return {
                    status: 'done',
                    summary: `已替换 ${changed} 条（${via}${failHint}）`,
                    changed: true,
                };
            } finally {
                if (typeof offProgress === 'function') offProgress();
                state.reconstructBusy = false;
                hideProgress();
            }
        }

        function pathBasename(filePath) {
            if (typeof basenameFn === 'function') return basenameFn(filePath);
            const s = String(filePath || '');
            const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
            return i >= 0 ? s.slice(i + 1) : s;
        }

        function pathDirname(filePath) {
            const s = String(filePath || '');
            const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
            return i >= 0 ? s.slice(0, i) : '';
        }

        function pathSep(filePath) {
            return String(filePath || '').includes('\\') ? '\\' : '/';
        }

        function stemNoExt(filePath) {
            const base = pathBasename(filePath);
            const i = base.lastIndexOf('.');
            return i > 0 ? base.slice(0, i) : base;
        }

        function fileExt(filePath) {
            const base = pathBasename(filePath);
            const i = base.lastIndexOf('.');
            return i > 0 ? base.slice(i) : '.srt';
        }

        /**
         * Effective source/target role for MT routing.
         * Priority: explicit dual mount → filename suffix (.ja/.zh) → cue text script.
         * Video-homonymous files (no suffix) rely on text: kana→原文, 汉字无假名→译文.
         */
        function inferPrimaryDualRole() {
            const dualApi = global.TransubDualSubtitle;
            if (state.dualRole === 'source' || state.dualRole === 'target') return state.dualRole;
            const primary = String(state.path || '').trim();
            if (primary && dualApi?.inferDualRole) {
                const videoStem = state.videoPath ? stemNoExt(state.videoPath) : '';
                const fromName = dualApi.inferDualRole(stemNoExt(primary), videoStem || undefined);
                if (fromName?.role === 'source' || fromName?.role === 'target') return fromName.role;
            }
            // No suffix / unknown name → judge from dialogue script
            if (dualApi?.inferDualRoleFromCues && state.cues?.length) {
                const fromText = dualApi.inferDualRoleFromCues(state.cues);
                if (fromText?.role === 'source' || fromText?.role === 'target') {
                    return fromText.role;
                }
            }
            return null;
        }

        function cueListHasText(list) {
            return (Array.isArray(list) ? list : []).some((c) => String(c?.text || '').trim());
        }

        /**
         * Resolve where JA/source text for MT comes from.
         * Translation must never use the translation-track text as input.
         */
        function resolveOriginalSourceInfo() {
            const role = inferPrimaryDualRole();
            if (state.dualRole === 'source' && cueListHasText(state.cues)) {
                return { available: true, kind: 'current', role: 'source' };
            }
            if (state.dualRole === 'target' && cueListHasText(state.pairCues)) {
                return { available: true, kind: 'pair', role: 'target' };
            }
            if (state.keptTranscript?.found && cueListHasText(state.keptTranscript.cues)) {
                return { available: true, kind: 'kept', role: state.dualRole || role };
            }
            if (state.keptTranscript?.found && !state.keptTranscript.cues?.length) {
                // path known but not loaded yet — caller should load first
                return { available: true, kind: 'kept', role: state.dualRole || role, needsLoad: true };
            }
            if (!state.pairCues?.length) {
                if (role === 'target') {
                    return {
                        available: false,
                        kind: null,
                        role: 'target',
                        canGenerate: !!state.videoPath,
                    };
                }
                // source-named or unsuffixed monolingual → current cues are the original
                if (cueListHasText(state.cues)) {
                    return { available: true, kind: 'current', role: role || 'source' };
                }
            }
            if (state.pairCues?.length && state.dualRole !== 'target' && cueListHasText(state.cues)) {
                return { available: true, kind: 'current', role: state.dualRole || role || 'source' };
            }
            return {
                available: false,
                kind: null,
                role: role || state.dualRole || null,
                canGenerate: !!state.videoPath,
            };
        }

        /**
         * How accepted MT text should be written back.
         * - current: editing target track (or target-named monolingual) → write ZH here
         * - pair / promote-dual: keep JA on primary, write ZH to target pair track
         */
        function resolveTranslateWriteMode() {
            if (state.pairCues?.length && state.dualRole === 'target') return 'current';
            if (state.pairCues?.length) return 'pair';
            const role = inferPrimaryDualRole();
            if (role === 'target') return 'current';
            return 'promote-dual';
        }

        /**
         * Derive a sibling `.zh` (or inferred pair) path for monolingual → dual promote.
         */
        function deriveTargetPairPath(primaryPath, videoPath) {
            const dualApi = global.TransubDualSubtitle;
            const primary = String(primaryPath || '').trim();
            if (!primary) return '';
            const dir = pathDirname(primary);
            const sep = pathSep(primary);
            const ext = fileExt(primary);
            const noExt = stemNoExt(primary);
            const videoStem = videoPath ? stemNoExt(videoPath) : '';
            if (dualApi?.inferDualRole) {
                const inferred = dualApi.inferDualRole(noExt, videoStem || undefined);
                const stem = inferred.videoStem || videoStem || noExt;
                if (inferred.role === 'source' && inferred.pairSuffix) {
                    const next = `${dir}${sep}${stem}.${inferred.pairSuffix}${ext}`;
                    return next === primary ? '' : next;
                }
                if (inferred.role === 'target') {
                    return '';
                }
                const next = `${dir}${sep}${stem}.zh${ext}`;
                return next === primary ? '' : next;
            }
            const next = `${dir}${sep}${noExt}.zh${ext}`;
            return next === primary ? '' : next;
        }

        /** Sibling source path when primary is a target-named file (e.g. .zh → .ja/.source). */
        function deriveSourcePairPath(primaryPath, videoPath) {
            const dualApi = global.TransubDualSubtitle;
            const primary = String(primaryPath || '').trim();
            if (!primary) return '';
            const dir = pathDirname(primary);
            const sep = pathSep(primary);
            const ext = fileExt(primary);
            const noExt = stemNoExt(primary);
            const videoStem = videoPath ? stemNoExt(videoPath) : '';
            if (dualApi?.inferDualRole) {
                const inferred = dualApi.inferDualRole(noExt, videoStem || undefined);
                const stem = inferred.videoStem || videoStem || noExt;
                if (inferred.role === 'target') {
                    const suffix = inferred.pairSuffix || 'ja';
                    const next = `${dir}${sep}${stem}.${suffix}${ext}`;
                    return next === primary ? '' : next;
                }
            }
            const stem = videoStem || noExt.replace(/\.zh$/i, '') || noExt;
            const next = `${dir}${sep}${stem}.ja${ext}`;
            return next === primary ? '' : next;
        }

        function cloneCueShell(cue) {
            return {
                index: cue?.index,
                startMs: cue?.startMs,
                endMs: cue?.endMs,
                text: String(cue?.text ?? ''),
            };
        }

        function syncDualUiAfterMount() {
            state.dualDisplayMode = typeof loadDualDisplayMode === 'function'
                ? loadDualDisplayMode()
                : (state.dualDisplayMode || 'both');
            state.dualLineOrder = typeof loadDualLineOrder === 'function'
                ? loadDualLineOrder()
                : (state.dualLineOrder || 'source-first');
            if (els.dualDisplaySelect) els.dualDisplaySelect.value = state.dualDisplayMode;
            if (els.dualLineOrderSelect) els.dualLineOrderSelect.value = state.dualLineOrder;
            if (typeof invalidatePairOverlapIndex === 'function') invalidatePairOverlapIndex();
            else state._pairOverlapIndex = null;
            if (typeof syncDualDisplaySelectVisibility === 'function') {
                syncDualDisplaySelectVisibility();
            }
        }

        /**
         * Ensure a source pair track exists so ASR can write 原文 without overwriting 译文.
         */
        async function ensureSourceTrackForGenerate() {
            if (state.dualRole === 'source') return { ok: true };
            if (state.dualRole === 'target' && state.pairCues?.length) return { ok: true };

            const sourcePath = deriveSourcePairPath(state.path, state.videoPath);
            if (!sourcePath) {
                return { ok: false, error: '无法推导原文对照轨路径，请先保存为 .zh 字幕或手动配对原文' };
            }
            let seeded = null;
            if (electron?.transubReadSubtitle) {
                try {
                    const existing = await electron.transubReadSubtitle({ path: sourcePath });
                    if (existing?.ok && Array.isArray(existing.cues) && existing.cues.length) {
                        seeded = existing.cues;
                    }
                } catch (_) { /* create fresh */ }
            }
            state.pairPath = sourcePath;
            state.pairCues = seeded
                ? seeded.map(cloneCueShell)
                : state.cues.map((c) => {
                    const shell = cloneCueShell(c);
                    shell.text = '';
                    return shell;
                });
            state.pairFormat = state.format || 'srt';
            state.pairHeader = Array.isArray(state.header) ? [...state.header] : [];
            state.pairDirty = false;
            state.dualRole = 'target';
            syncDualUiAfterMount();
            renderCueList?.();
            return { ok: true, created: !seeded };
        }

        async function generateOriginalForIndexes(indexes) {
            if (typeof runRetranscribeRange !== 'function') {
                return { ok: false, error: '当前环境不支持生成原文' };
            }
            if (!state.videoPath) {
                return { ok: false, error: '请先关联视频后再生成原文' };
            }
            const ensured = await ensureSourceTrackForGenerate();
            if (!ensured.ok) return ensured;

            let startMs = Infinity;
            let endMs = 0;
            for (const idx of indexes) {
                const cue = state.cues[idx];
                if (!cue) continue;
                const a = Math.round(Number(cue.startMs) || 0);
                const b = typeof cueEndMs === 'function'
                    ? Math.round(Number(cueEndMs(cue)) || 0)
                    : Math.round(Number(cue.endMs) || a);
                if (a < startMs) startMs = a;
                if (b > endMs) endMs = b;
            }
            if (!Number.isFinite(startMs) || endMs <= startMs) {
                startMs = 0;
                endMs = Math.max(1000, Math.round(Number(state.durationMs) || 0));
            }
            const padMs = Math.max(0, Math.min(2000, Number(loadRetranscribeDurPrefs?.()?.padMs) || 350));
            const res = await runRetranscribeRange({
                startMs,
                endMs,
                padMs,
                mode: 'range',
                writeAs: 'source',
                snapAfter: false,
                detail: '正在生成原文（语音识别）…',
            });
            if (!res?.ok) {
                return {
                    ok: false,
                    cancelled: !!res?.cancelled,
                    error: res?.error || '生成原文失败',
                };
            }
            return { ok: true };
        }

        /**
         * Read original text for one primary-track cue index.
         * Never returns translation-track text when a source role is known.
         */
        function readOriginalTextForCue(idx, dualApi) {
            const cue = state.cues[idx];
            if (!cue) return '';
            if (state.dualRole === 'source') {
                return String(cue.text || '').trim();
            }
            if (state.dualRole === 'target' && dualApi && state.pairCues?.length) {
                const hit = dualApi.findBestOverlapCue(
                    state.pairCues,
                    cue.startMs,
                    typeof cueEndMs === 'function' ? cueEndMs(cue) : cue.endMs,
                );
                const pairText = String(hit?.cue?.text || '').trim();
                if (pairText) return pairText;
            }
            if (state.keptTranscript?.cues?.length) {
                const compare = global.TransubTranscriptCompare;
                const hit = compare?.findBestOverlapCue?.(
                    state.keptTranscript.cues,
                    cue.startMs,
                    typeof cueEndMs === 'function' ? cueEndMs(cue) : cue.endMs,
                );
                const keptText = String(hit?.cue?.text || '').trim();
                if (keptText) return keptText;
            }
            // Monolingual source / unsuffixed: current is original
            if (!state.pairCues?.length && state.dualRole !== 'target') {
                const role = inferPrimaryDualRole();
                if (role !== 'target') return String(cue.text || '').trim();
            }
            return '';
        }

        /**
         * 文本翻译（推理翻译：本地 LLM MT / 智能翻译 / 机器翻译 Opus）。
         * 始终从原文翻译；无原文时提示是否先生成原文。
         * 写入：译文轨 / 自动挂载译文对照轨，不覆盖原文。
         */
        async function runTextTranslateOnce({
            scope = 'all',
            engine = 'llm',
            skipReview = false,
            cueIndexes = null,
            modelId = '',
            faithfulTone = null,
            smartTranslateHybridMt = null,
            smartTranslatePlotPolish = null,
        } = {}) {
            const useSmart = engine === 'smart' || engine === 'advanced';
            const useOpus = engine === 'opus' || engine === 'engine';
            const invoke = useSmart
                ? electron?.transubAdvancedSmartTranslate
                : (useOpus
                    ? electron?.transubEngineTranslateCues
                    : electron?.transubSakuraTranslate);
            if (!invoke) {
                return {
                    status: 'failed',
                    summary: useSmart
                        ? '当前环境不支持智能翻译'
                        : (useOpus ? '当前环境不支持机器翻译' : '当前环境不支持推理翻译'),
                };
            }
            if (state.reconstructBusy) {
                return { status: 'skipped', summary: '翻译或重构进行中' };
            }
            if (state.computeBusy) {
                return {
                    status: 'skipped',
                    summary: state.computeBusyLabel
                        ? `已有${state.computeBusyLabel}正在运行`
                        : '其它窗口有引擎或 LLM 任务正在运行',
                };
            }

            let indexes = Array.isArray(cueIndexes) && cueIndexes.length
                ? [...cueIndexes].filter((n) => Number.isInteger(n))
                : resolveScopeIndexes(scope);
            if (!indexes.length) {
                return { status: 'skipped', summary: '范围内无字幕' };
            }

            if (state.keptTranscript?.found && !state.keptTranscript.cues?.length) {
                try {
                    const doc = await electron?.transubReadSubtitle?.({ path: state.keptTranscript.path });
                    if (doc?.ok) state.keptTranscript.cues = Array.isArray(doc.cues) ? doc.cues : [];
                } catch (_) { /* ignore */ }
            }

            let sourceInfo = resolveOriginalSourceInfo();
            if (!sourceInfo.available) {
                if (skipReview || typeof editorConfirm !== 'function') {
                    return {
                        status: 'failed',
                        summary: sourceInfo.canGenerate
                            ? '原文不存在。请先生成原文（语音识别）后再翻译'
                            : '原文不存在。请配对原文轨、挂载原文缓存，或关联视频后生成原文',
                    };
                }
                const confirmGen = await editorConfirm(
                    '原文不存在，是否先生成原文？',
                    {
                        title: '缺少原文',
                        detail: sourceInfo.canGenerate
                            ? '将按当前字幕时间范围做语音识别，写入原文对照轨；完成后继续翻译。'
                            : '当前未关联视频，无法自动生成原文。仍可取消后手动配对原文轨或挂载原文缓存。',
                        okLabel: sourceInfo.canGenerate ? '生成原文' : '知道了',
                        cancelLabel: '取消',
                        type: 'warning',
                    },
                );
                if (!confirmGen || !sourceInfo.canGenerate) {
                    return {
                        status: 'cancelled',
                        summary: sourceInfo.canGenerate
                            ? '已取消（原文不存在）'
                            : '原文不存在：请先关联视频，或配对/挂载原文轨',
                    };
                }
                const gen = await generateOriginalForIndexes(indexes);
                if (!gen.ok) {
                    return {
                        status: gen.cancelled ? 'cancelled' : 'failed',
                        summary: gen.error || '生成原文失败',
                    };
                }
                sourceInfo = resolveOriginalSourceInfo();
                if (!sourceInfo.available) {
                    return { status: 'failed', summary: '已尝试生成原文，但仍未找到可用原文' };
                }
            }

            let faithfulPreferred = faithfulTone;
            let settingsOpts = null;
            try {
                const res = await electron?.transWithAiGetOptions?.({});
                settingsOpts = res?.options && typeof res.options === 'object' ? res.options : null;
            } catch (_) {
                settingsOpts = null;
            }
            if ((useSmart || (!useOpus)) && faithfulPreferred == null) {
                faithfulPreferred = !!settingsOpts?.smartTranslateFaithfulTone;
            }

            const dualApi = global.TransubDualSubtitle || null;
            const buildCuesPayload = (idxList) => idxList.map((idx) => {
                const cue = state.cues[idx];
                const sourceText = readOriginalTextForCue(idx, dualApi);
                return {
                    index: idx,
                    startMs: cue?.startMs,
                    endMs: cue?.endMs,
                    text: sourceText,
                };
            }).filter((c) => String(c.text || '').trim());

            const titleText = useSmart ? '智能翻译中'
                : (useOpus ? '机器翻译中' : '推理翻译中');
            state.reconstructBusy = true;
            state.translateEngine = useSmart ? 'smart' : (useOpus ? 'opus' : 'llm');

            const showProgress = (info = {}) => {
                const pct = info.pct ?? info.percent;
                const phase = String(info.phase || '').trim();
                let countText = `${indexes.length} 条`;
                let stageHint = '正在调用 Pro 大模型翻译，通常需要数十秒到数分钟，可随时取消';
                if (useSmart) {
                    if (phase === 'brief' || phase === 'brief-done') {
                        countText = '理解全文';
                        stageHint = '正在生成影片简要，归纳人物 / 专名 / 语气…';
                    } else if (phase === 'consistency') {
                        countText = '一致性校对';
                        stageHint = '正在统一人名、专名与称呼…';
                    } else if (info.chunk && info.total) {
                        countText = `分块翻译 ${info.chunk} / ${info.total}`;
                        stageHint = '正在按块翻译，并带入 Brief 与上下文…';
                    } else if (phase === 'chunk' || phase === 'chunk-done' || phase === 'chunk-retry') {
                        countText = '分块翻译';
                        stageHint = '正在按块翻译，并带入 Brief 与上下文…';
                    }
                }
                const hint = useSmart
                    ? stageHint
                    : (useOpus
                        ? '正在调用引擎 Opus 机器翻译，通常较快，可随时取消'
                        : '正在调用本地 LLM 推理翻译（单遍局部上下文），通常需要数十秒到数分钟，可随时取消');
                if (typeof showInferenceProgress === 'function') {
                    const overlay = document.getElementById('editorReconstructProgress');
                    if (!overlay || overlay.classList.contains('hidden')) {
                        showInferenceProgress({
                            kind: useSmart ? 'smart' : (useOpus ? 'opus' : 'llm'),
                            badge: useOpus ? '机器翻译' : '大模型推理',
                            title: titleText,
                            detail: info.message || info.detail
                                || `正在翻译 ${indexes.length} 条字幕…`,
                            countText,
                            hint,
                            pct,
                            indeterminate: !Number.isFinite(Number(pct)) || Number(pct) <= 0,
                        });
                    } else {
                        updateInferenceProgress({
                            title: titleText,
                            message: info.message || info.detail
                                || `正在翻译 ${indexes.length} 条字幕…`,
                            countText,
                            hint,
                            pct,
                            phase: info.phase,
                            chunk: info.chunk,
                            total: info.total,
                        });
                    }
                } else {
                    setStatus(info.message || info.detail || `${titleText}…`);
                }
            };
            const hideProgress = () => {
                if (typeof hideInferenceProgress === 'function') hideInferenceProgress();
                else {
                    const overlay = document.getElementById('editorReconstructProgress');
                    overlay?.classList.add('hidden');
                    overlay?.setAttribute('aria-busy', 'false');
                    state.reconstructBusy = false;
                }
            };

            const writeMode = resolveTranslateWriteMode();
            const mtSanitize = global.TransubMtSanitize || null;

            const readDestText = (idx) => {
                const cue = state.cues[idx];
                if (!cue) return '';
                if (writeMode === 'current') return String(cue.text ?? '');
                if (writeMode === 'pair' && dualApi && state.pairCues?.length) {
                    const hit = dualApi.findBestOverlapCue(
                        state.pairCues,
                        cue.startMs,
                        cue.endMs ?? cue.startMs,
                    );
                    return String(hit?.cue?.text || '');
                }
                return '';
            };

            const sourceLooksLikeJapanese = (text) => {
                if (mtSanitize?.sourceLooksLikeJapanese) {
                    return mtSanitize.sourceLooksLikeJapanese(text);
                }
                return (String(text || '').match(/[\u3040-\u30ff]/g) || []).length >= 2;
            };

            const isBadTranslation = (translated, original) => {
                const after = String(translated ?? '').trim();
                const src = String(original ?? '').trim();
                if (!after) return true;
                if (mtSanitize?.looksLikeSourceEcho?.(after, src)) return true;
                if (mtSanitize?.isBlankOrPunctTranslation?.(after, src)) return true;
                // Fallback if sanitize module is not loaded in the editor window
                const srcIsJa = sourceLooksLikeJapanese(src);
                if (srcIsJa && after.replace(/\s+/g, '') === src.replace(/\s+/g, '')) return true;
                if (srcIsJa) {
                    const kana = (after.match(/[\u3040-\u30ff]/g) || []).length;
                    const han = (after.match(/[\u4e00-\u9fff]/g) || []).length;
                    if (kana >= 6 && kana >= Math.max(4, Math.floor(han * 0.35))) return true;
                }
                return false;
            };

            const buildRowsFromUpdates = (updates) => {
                const rows = [];
                for (const u of updates) {
                    const idx = Number(u.index);
                    if (!Number.isInteger(idx) || !state.cues[idx]) continue;
                    const original = readOriginalTextForCue(idx, dualApi)
                        || String(state.cues[idx].text ?? '');
                    const destBefore = readDestText(idx);
                    const after = String(u.text ?? '');
                    const bad = isBadTranslation(after, original);
                    const trimmed = after.trim();
                    // Show model output even when bad so user can manually edit in review.
                    // Auto-select only good new translations.
                    const usable = !bad && !!trimmed && trimmed !== String(destBefore || '').trim();
                    rows.push({
                        index: idx,
                        before: original,
                        after,
                        destBefore,
                        changed: usable || (bad && !!trimmed),
                        fallback: bad,
                    });
                }
                return rows;
            };

            showProgress({ message: `${titleText}（${indexes.length} 条）…`, pct: 0 });
            const offSmartProgress = useSmart
                ? electron.onAdvancedReconstructProgress?.((info) => {
                    if (!info || info.mode === 'batch') return;
                    if (info.feature && info.feature !== 'smartTranslate') return;
                    // Surface hybrid / polish phases in the editor progress line.
                    showProgress(info);
                })
                : null;
            const offOpusProgress = useOpus
                ? electron.onEngineTranslateProgress?.((info) => showProgress(info))
                : null;
            const offSakuraProgress = !useSmart && !useOpus
                ? electron.onSakuraTranslateProgress?.((info) => showProgress(info))
                : null;

            try {
                const cuesPayload = buildCuesPayload(indexes);
                if (!cuesPayload.length) {
                    return {
                        status: 'skipped',
                        summary: '范围内没有可用原文（对照轨/原文缓存无重叠文本）',
                    };
                }
                const payload = {
                    cues: cuesPayload,
                    glossary: getEffectiveGlossary(),
                    fileName: state.path || state.videoPath || '',
                    sourcePath: state.path || '',
                };
                if (useSmart) {
                    payload.smartTranslateFaithfulTone = !!faithfulPreferred;
                    payload.faithfulTone = !!faithfulPreferred;
                    // Follow main-window Pro settings (hybrid sentence MT + plot polish).
                    const hybridFromStep = smartTranslateHybridMt;
                    const polishFromStep = smartTranslatePlotPolish;
                    payload.smartTranslateHybridMt = hybridFromStep == null
                        ? settingsOpts?.smartTranslateHybridMt !== false
                        : hybridFromStep !== false;
                    payload.smartTranslatePlotPolish = polishFromStep == null
                        ? settingsOpts?.smartTranslatePlotPolish !== false
                        : polishFromStep !== false;
                    const llmMt = String(
                        modelId
                        || settingsOpts?.engineLlmMtModel
                        || settingsOpts?.hybridMtModelId
                        || '',
                    ).trim();
                    if (llmMt) {
                        payload.engineLlmMtModel = llmMt;
                        payload.hybridMtModelId = llmMt;
                    }
                    const lang = String(settingsOpts?.language || '').trim();
                    if (lang) payload.language = lang;
                    const variant = String(settingsOpts?.chineseSubtitleVariant || '').trim();
                    if (variant) payload.chineseSubtitleVariant = variant;
                } else if (!useOpus) {
                    if (modelId) payload.modelId = modelId;
                    // Align Sakura with smart-translate NSFW / faithful postprocess.
                    payload.smartTranslateFaithfulTone = !!faithfulPreferred;
                    payload.faithfulTone = !!faithfulPreferred;
                    if (faithfulPreferred) {
                        payload.sakuraNsfwPrompt = true;
                        payload.applyNsfwLexicon = true;
                    }
                }

                const res = await invoke(payload);
                if (!res?.ok) {
                    return {
                        status: res?.cancelled || res?.code === 'cancelled' || res?.code === 'aborted'
                            ? 'cancelled'
                            : 'failed',
                        summary: res?.error || (useSmart
                            ? '智能翻译失败'
                            : (useOpus ? '机器翻译失败' : '推理翻译失败')),
                    };
                }
                const updates = Array.isArray(res.cues) ? res.cues : [];
                if (!updates.length) {
                    return { status: 'skipped', summary: res.summary || '未返回翻译结果' };
                }

                const rows = buildRowsFromUpdates(updates);
                if (!rows.length) {
                    return { status: 'skipped', summary: '未返回可应用条目' };
                }
                const usableCount = rows.filter((r) => r.changed && !r.fallback).length;
                const failedCount = rows.filter((r) => r.fallback).length;
                if (!usableCount && !failedCount) {
                    return { status: 'skipped', summary: '译文与目标轨相同，无变更' };
                }
                if (!usableCount && failedCount && skipReview) {
                    return {
                        status: 'failed',
                        summary: `翻译未产出有效中文（${failedCount} 条仍为原文或被清理）。原文已找到，请重试或更换模型`,
                    };
                }

                hideProgress();
                setStatus(
                    usableCount
                        ? `翻译完成，请对照确认（可用 ${usableCount} 条）…`
                        : `模型未产出可用译文（${failedCount} 条），请在对照中手动修改或放弃后重试…`,
                );

                const via = useSmart
                    ? (res.via === 'mock' ? '模拟' : (res.via === 'module' ? '模块' : '智能翻译'))
                    : (useOpus ? '机器翻译' : '推理翻译');
                const smartBits = [];
                if (useSmart) {
                    if (res.hybridMt || res.stats?.hybridMt) {
                        smartBits.push(res.hybridMtModelId || res.stats?.hybridMtModelId
                            ? `句级 ${res.hybridMtModelId || res.stats.hybridMtModelId}`
                            : '专训句级');
                    }
                    const polishN = Number(res.polishFixed ?? res.stats?.polishFixed);
                    if (Number.isFinite(polishN) && polishN > 0) {
                        smartBits.push(`贴合润色 ${polishN}`);
                    } else if (res.plotPolish || res.stats?.plotPolish) {
                        smartBits.push('贴合润色');
                    }
                }
                const viaLabel = smartBits.length ? `${via}（${smartBits.join(' · ')}）` : via;

                let accepted = null;
                const reviewLead = usableCount
                    ? (writeMode === 'current'
                        ? `来源：${viaLabel}。左边为原文，右边为译文。确认后写入当前译文轨；标记「回退」的条目默认不覆盖。放弃则不做任何修改。`
                        : `来源：${viaLabel}。左边为原文，右边为译文。确认后将保留原文并写入译文对照轨；放弃则不做任何修改。`)
                    : `来源：${viaLabel}。已找到原文，但模型未产出有效中文（可能原样返回日文）。请在右侧手动改成译文后勾选确认，或放弃后重试/换模型。`;
                if (skipReview) {
                    accepted = rows
                        .filter((r) => r.changed && !r.fallback && String(r.after || '').trim())
                        .map((r) => ({ index: r.index, text: r.after }));
                } else {
                    accepted = await promptReconstructReview(rows, {
                        title: useSmart ? '智能翻译 · 结果对照'
                            : (useOpus ? '机器翻译 · 结果对照' : '推理翻译 · 结果对照'),
                        lead: reviewLead,
                        beforeLabel: '原文',
                        afterLabel: '译文',
                        failedIndexes: rows.filter((r) => r.fallback).map((r) => r.index),
                    });
                }

                if (!accepted) {
                    return { status: 'cancelled', summary: '已放弃替换' };
                }
                if (!accepted.length) {
                    return { status: 'skipped', summary: '未勾选任何变更' };
                }

                recordUndoBeforeChange();
                let changed = 0;
                let wrotePair = false;
                let effectiveMode = writeMode;

                // Target-named monolingual file with no pair → fall back to in-place.
                // Unsaved buffer cannot create a sibling .zh track — ask user to save first.
                if (effectiveMode === 'promote-dual') {
                    const targetPath = deriveTargetPairPath(state.path, state.videoPath);
                    if (!targetPath) {
                        if (!String(state.path || '').trim()) {
                            return {
                                status: 'failed',
                                summary: '请先保存字幕文件，再翻译以生成译文对照轨（避免覆盖原文）',
                            };
                        }
                        effectiveMode = 'current';
                    }
                }

                if (effectiveMode === 'current') {
                    for (const u of accepted) {
                        const idx = Number(u.index);
                        if (!Number.isInteger(idx) || !state.cues[idx]) continue;
                        const nextText = String(u.text ?? '').trim();
                        if (!nextText) continue;
                        const original = readOriginalTextForCue(idx, dualApi);
                        if (isBadTranslation(nextText, original)) continue;
                        if (nextText !== state.cues[idx].text) {
                            state.cues[idx].text = nextText;
                            changed += 1;
                        }
                    }
                } else {
                    // Write ZH into pair track; keep primary (source) texts intact
                    if (effectiveMode === 'promote-dual') {
                        const targetPath = deriveTargetPairPath(state.path, state.videoPath);
                        if (!targetPath) {
                            return { status: 'failed', summary: '无法推导译文对照轨路径' };
                        }
                        let seeded = null;
                        if (electron?.transubReadSubtitle) {
                            try {
                                const existing = await electron.transubReadSubtitle({ path: targetPath });
                                if (existing?.ok && Array.isArray(existing.cues) && existing.cues.length) {
                                    seeded = existing.cues;
                                }
                            } catch (_) { /* create fresh */ }
                        }
                        if (seeded) {
                            state.pairCues = seeded.map(cloneCueShell);
                        } else {
                            state.pairCues = state.cues.map((c) => {
                                const shell = cloneCueShell(c);
                                shell.text = '';
                                return shell;
                            });
                        }
                        state.pairPath = targetPath;
                        state.pairFormat = state.format || 'srt';
                        state.pairHeader = Array.isArray(state.header) ? [...state.header] : [];
                        state.dualRole = 'source';
                        syncDualUiAfterMount();
                    }

                    if (!state.pairCues?.length) {
                        return { status: 'failed', summary: '译文对照轨不可用' };
                    }

                    for (const u of accepted) {
                        const idx = Number(u.index);
                        const srcCue = state.cues[idx];
                        if (!Number.isInteger(idx) || !srcCue) continue;
                        const nextText = String(u.text ?? '').trim();
                        if (!nextText) continue;
                        const original = readOriginalTextForCue(idx, dualApi)
                            || String(srcCue.text || '');
                        if (isBadTranslation(nextText, original)) continue;
                        let dest = null;
                        if (dualApi?.findBestOverlapCue) {
                            const hit = dualApi.findBestOverlapCue(
                                state.pairCues,
                                srcCue.startMs,
                                srcCue.endMs ?? srcCue.startMs,
                            );
                            if (hit?.match === 'overlap' && hit.cue) dest = hit.cue;
                            else if (hit?.index >= 0 && state.pairCues[hit.index]) {
                                dest = state.pairCues[hit.index];
                            }
                        }
                        if (!dest && state.pairCues[idx]) dest = state.pairCues[idx];
                        if (!dest) {
                            dest = cloneCueShell(srcCue);
                            dest.text = '';
                            state.pairCues.push(dest);
                        }
                        if (nextText !== String(dest.text ?? '')) {
                            dest.text = nextText;
                            changed += 1;
                        }
                    }
                    state.pairDirty = true;
                    wrotePair = true;
                    if (typeof invalidatePairOverlapIndex === 'function') {
                        invalidatePairOverlapIndex();
                    } else {
                        state._pairOverlapIndex = null;
                    }
                    if (typeof savePairDocument === 'function') {
                        try { await savePairDocument(); } catch (_) { /* keep dirty */ }
                    } else if (electron?.transubWriteSubtitle && state.pairPath) {
                        try {
                            const written = await electron.transubWriteSubtitle({
                                path: state.pairPath,
                                format: state.pairFormat || state.format || 'srt',
                                cues: state.pairCues,
                                header: state.pairHeader,
                                backupMode: 'off',
                            });
                            if (written?.ok) state.pairDirty = false;
                        } catch (_) { /* keep dirty */ }
                    }
                }

                if (!changed) return { status: 'skipped', summary: '无文本变更' };
                if (effectiveMode === 'current') setDirty(true);
                else if (!wrotePair) setDirty(true);
                if (changed > 80 || typeof refreshListRow !== 'function' || wrotePair) {
                    renderCueList();
                } else {
                    for (const u of accepted) {
                        const idx = Number(u.index);
                        if (Number.isInteger(idx)) refreshListRow(idx);
                    }
                }
                renderDetailPane();
                const summary = effectiveMode === 'current'
                    ? `已翻译替换 ${changed} 条（${via}）`
                    : `已翻译 ${changed} 条并写入译文对照轨（${via}，原文已保留）`;
                return {
                    status: 'done',
                    summary,
                    changed: true,
                };
            } finally {
                if (typeof offSmartProgress === 'function') offSmartProgress();
                if (typeof offOpusProgress === 'function') offOpusProgress();
                if (typeof offSakuraProgress === 'function') offSakuraProgress();
                state.reconstructBusy = false;
                state.translateEngine = '';
                hideProgress();
            }
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
                        fixInvalid: true,
                        compressRepetition: true,
                        removeNoise: true,
                        removeDuplicates: true,
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
                    const result = qcCore.applyQcFixes(state.cues, opts);
                    const ok = !!(result.stats?.affected || result.stats?.splitCount
                        || result.stats?.compressRepFixed || result.stats?.noiseRemoved);
                    if (!ok) return { status: 'skipped', summary: result.summary || '无需修复' };
                    recordUndoBeforeChange();
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    refreshQcBadge();
                    return { status: 'done', summary: result.summary, changed: true };
                },
                'qc.smartFix': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const gate = await electron?.transubAdvancedRequireFeature?.({ featureId: 'qcSmartFix' });
                    const gateFb = gate?.ok
                        ? gate
                        : await electron?.transubAdvancedRequireFeature?.({ featureId: 'contextReconstruct' });
                    if (!gateFb?.ok) {
                        return { status: 'failed', summary: gateFb?.error || gate?.error || '需解锁 Pro' };
                    }
                    const prefs = loadSplitPrefs();
                    const profileApi = global.TransubContentProfile;
                    const profile = profileApi?.classifyContentProfile?.({
                        path: state.videoPath || state.path || '',
                        fileName: String(state.videoPath || state.path || '').split(/[/\\]/).pop() || '',
                    })?.profile || 'unknown';
                    const profilePreset = profileApi?.qcPresetForProfile?.(profile) || {};
                    const opts = {
                        fixOverlap: true,
                        fixCpsBySplit: true,
                        fixCpsByExtend: true,
                        enforceMinDur: true,
                        enforceMaxDur: true,
                        fixInvalid: true,
                        compressRepetition: true,
                        removeNoise: true,
                        removeDuplicates: true,
                        maxCps: 18,
                        minSec: 0.5,
                        maxSec: 10,
                        gapMs: 1,
                        maxSmartCues: 40,
                        intensity: 'light',
                        llmSplit: false,
                        retranscribeConnected: false,
                        semanticReview: false,
                        ...profilePreset,
                        smartMaxChars: prefs.smartMaxChars,
                        smartLineChars: prefs.smartLineChars,
                        targetCps: getTargetCps(),
                        useCpsTime: prefs.useCps !== false,
                        profile,
                        ...(step.params || {}),
                    };
                    syncDetailToCue();
                    // 勿占用 reconstructBusy；阶段提示用状态栏，润色时由 runContextReconstructOnce 自带遮罩
                    const qcWaitStatus = (msg) => {
                        setStatus(msg || 'QC 处理中，请稍候…', '');
                    };
                    qcWaitStatus('QC 处理中，请稍候…');
                    const unsubWfQc = electron?.onAdvancedReconstructProgress?.((info) => {
                        if (!info) return;
                        const mode = String(info.mode || '');
                        if (mode && mode !== 'qc-smart' && mode !== 'semantic-review' && mode !== 'single') return;
                        qcWaitStatus(info.message || info.detail || 'QC 处理进行中，请稍候…');
                    }) || null;
                    try {
                    const ruleResult = qcCore.applyQcFixes(state.cues, opts);
                    const ruleOk = !!(ruleResult.stats?.affected || ruleResult.stats?.splitCount
                        || ruleResult.stats?.compressRepFixed || ruleResult.stats?.noiseRemoved);
                    if (ruleOk) {
                        recordUndoBeforeChange();
                        state.cues.splice(0, state.cues.length, ...ruleResult.cues);
                        setDirty(true);
                        renderCueList();
                        if (state.selectedIndex >= 0) renderDetailPane();
                    }
                    const smartApi = global.TransubSubtitleQcSmart;
                    const parts = [];
                    if (ruleOk) parts.push(ruleResult.summary);
                    let changed = !!ruleOk;
                    let reuseScan = ruleResult.scan || null;

                    const doLlmSplit = opts.llmSplit === true || step.params?.llmSplit === true;
                    if (doLlmSplit && smartApi?.selectQcLlmSplitTargets && electron?.transubAdvancedQcLlmSplit) {
                        qcWaitStatus('智能断句中，请稍候…');
                        const splitScan = reuseScan || qcCore.scanCueIssues(state.cues, {
                            ...opts,
                            checkFluency: false,
                        });
                        const splitTargets = smartApi.selectQcLlmSplitTargets(splitScan.issues, {
                            maxTargets: Number(step.params?.maxLlmSplitTargets) || 24,
                        });
                        if (splitTargets.length) {
                            if (!changed) recordUndoBeforeChange();
                            const items = smartApi.buildQcLlmSplitPayload(state.cues, splitTargets, {
                                smartMaxChars: Number(opts.smartMaxChars) || 20,
                            });
                            const splitRes = await electron.transubAdvancedQcLlmSplit({ cues: items });
                            if (splitRes?.ok && Array.isArray(splitRes.splits)) {
                                const applied = smartApi.applyQcLlmSplitResults(state.cues, splitRes.splits, {
                                    targetCps: getTargetCps(),
                                    minSec: Number(opts.minSec) || 0.5,
                                    useCpsTime: opts.useCpsTime !== false,
                                });
                                if (applied.splitCount) {
                                    state.cues.splice(0, state.cues.length, ...applied.cues);
                                    maybeFixOverlapAfterSplit?.();
                                    setDirty(true);
                                    changed = true;
                                    reuseScan = null;
                                    parts.push(`智能断句 ${applied.splitCount} 条(+${applied.added})`);
                                    renderCueList();
                                    if (state.selectedIndex >= 0) renderDetailPane();
                                }
                            } else if (splitRes && !splitRes.ok) {
                                parts.push(splitRes.error || '智能断句失败');
                            }
                        }
                    }

                    const doRetranscribe = opts.retranscribeConnected === true
                        || step.params?.retranscribeConnected === true;
                    if (doRetranscribe && state.videoPath && typeof runRetranscribeRange === 'function' && smartApi?.buildQcRetranscribeRanges) {
                        qcWaitStatus('局部重转写中，请稍候…');
                        const reScan = reuseScan || qcCore.scanCueIssues(state.cues, {
                            ...opts,
                            checkFluency: false,
                        });
                        const reTargets = smartApi.selectQcRetranscribeTargets(reScan.issues);
                        const ranges = smartApi.buildQcRetranscribeRanges(
                            state.cues,
                            reTargets.map((t) => t.index),
                            {
                                maxRanges: Number(step.params?.maxRetranscribeRanges) || 8,
                                maxDurationSec: Number(step.params?.maxRetranscribeSec) || 45,
                            },
                        );
                        if (ranges.length) {
                            if (!changed) recordUndoBeforeChange();
                            let okCount = 0;
                            for (let ri = 0; ri < ranges.length; ri += 1) {
                                const range = ranges[ri];
                                const res = await runRetranscribeRange({
                                    startMs: range.startMs,
                                    endMs: range.endMs,
                                    padMs: Number(step.params?.padMs) || smartApi.DEFAULT_PAD_MS || 350,
                                    mode: 'range',
                                    writeAs: 'source',
                                    snapAfter: step.params?.snapAfter !== false,
                                    detail: `QC 连续文本重转写 ${ri + 1}/${ranges.length}`,
                                });
                                if (res?.ok) {
                                    okCount += 1;
                                    changed = true;
                                } else if (res?.cancelled) {
                                    refreshQcBadge();
                                    parts.push(`局部重转写已取消（${okCount}/${ranges.length}）`);
                                    return { status: 'cancelled', summary: parts.join('；'), changed };
                                }
                            }
                            parts.push(`局部重转写 ${okCount}/${ranges.length} 窗`);
                            if (okCount > 0) reuseScan = null;
                            renderCueList();
                            if (state.selectedIndex >= 0) renderDetailPane();
                        }
                    }

                    if (!smartApi?.selectQcSmartTargets) {
                        refreshQcBadge();
                        return {
                            status: changed ? 'done' : 'skipped',
                            summary: parts.join('；') || '智能模块不可用',
                            changed,
                        };
                    }
                    const scan = reuseScan || qcCore.scanCueIssues(state.cues, opts);
                    reuseScan = null;
                    const targets = smartApi.selectQcSmartTargets(scan.issues, {
                        maxSmartCues: Number(opts.maxSmartCues) || Number(step.params?.maxSmartCues) || 40,
                    });
                    let polishedIndexes = [];
                    let smartStatus = changed ? 'done' : 'skipped';
                    if (!targets.length) {
                        parts.push('无需智能润色');
                    } else {
                        polishedIndexes = targets.map((row) => row.index);
                        const smartRes = await runContextReconstructOnce({
                            cueIndexes: polishedIndexes,
                            scope: 'selected',
                            mode: 'basic',
                            intensity: opts.intensity || step.params?.intensity || 'light',
                            windowCues: Number(step.params?.windowCues) || 16,
                            preserveTiming: true,
                            skipReview: step.params?.skipReview === true,
                            userNote: smartApi.QC_SMART_NOTE || '',
                            note: smartApi.QC_SMART_NOTE || '',
                        });
                        parts.push(smartRes?.summary || '智能润色结束');
                        changed = !!(changed || smartRes?.status === 'done');
                        smartStatus = smartRes?.status || 'done';
                    }

                    const doSemantic = opts.semanticReview === true || step.params?.semanticReview === true;
                    if (doSemantic && smartApi.buildQcSemanticPairs && electron?.transubAdvancedBilingualSemanticReview) {
                        qcWaitStatus('双语语义审阅中，请稍候…');
                        const pairCues = Array.isArray(state.pairCues) && state.pairCues.length
                            ? state.pairCues
                            : null;
                        if (pairCues?.length) {
                            const semScan = qcCore.scanCueIssues(state.cues, opts);
                            const semIndexes = smartApi.selectQcSemanticIndexes(semScan.issues, {
                                maxPairs: 40,
                                preferIndexes: polishedIndexes,
                            });
                            const dualApi = global.TransubDualSubtitle;
                            const pairs = smartApi.buildQcSemanticPairs(state.cues, pairCues, semIndexes, dualApi);
                            if (pairs.length) {
                                const review = await electron.transubAdvancedBilingualSemanticReview({
                                    pairs,
                                    suggestFixes: true,
                                    note: smartApi.QC_SEMANTIC_NOTE || '',
                                });
                                if (review?.ok) {
                                    state.lastSemanticReview = review;
                                    const issues = Array.isArray(review.issues) ? review.issues : [];
                                    if (opts.autoApplySemantic !== false && issues.some((it) => it.suggestedTarget)) {
                                        if (!changed) recordUndoBeforeChange();
                                        const applied = smartApi.applyQcSemanticSuggestions(state.cues, issues);
                                        if (applied.changed) {
                                            state.cues.splice(0, state.cues.length, ...applied.cues);
                                            setDirty(true);
                                            changed = true;
                                            parts.push(`语义采纳 ${applied.changed} 条`);
                                            renderCueList();
                                            if (state.selectedIndex >= 0) renderDetailPane();
                                        } else if (issues.length) {
                                            parts.push(review.summary || `语义审阅 ${issues.length} 处`);
                                        }
                                    } else if (issues.length) {
                                        parts.push(review.summary || `语义审阅 ${issues.length} 处`);
                                    }
                                    if (smartStatus === 'skipped' && (changed || issues.length)) smartStatus = 'done';
                                } else if (review && !review.ok) {
                                    parts.push(review.error || '语义审阅失败');
                                }
                            }
                        }
                    }

                    refreshQcBadge();
                    return {
                        status: smartStatus,
                        summary: parts.join('；') || '无需智能处理',
                        changed,
                    };
                    } finally {
                        if (typeof unsubWfQc === 'function') {
                            try { unsubWfQc(); } catch (_) { /* ignore */ }
                        }
                    }
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
                    const locale = ['twp', 'tw', 'hk', 't'].includes(step.params?.locale)
                        ? step.params.locale
                        : 'twp';
                    const scope = step.params?.scope || 'all';
                    let indexes = null;
                    if (scope === 'selected') {
                        indexes = getSelectedCueIndexes();
                        if (!indexes.length) return { status: 'skipped', summary: '未选中条目' };
                    }
                    let protectTerms = [];
                    if (step.params?.protectTerms !== false && glossaryCore?.collectProtectTerms) {
                        try {
                            protectTerms = glossaryCore.collectProtectTerms(getEffectiveGlossary()) || [];
                        } catch { /* optional */ }
                    }
                    syncDetailToCue();
                    const result = chineseCore.convertCues(state.cues, {
                        direction,
                        locale,
                        indexes,
                        protectTerms,
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
                'text.viewingPunct': async (_c, step) => {
                    if (!state.cues.length) return { status: 'skipped', summary: '无字幕' };
                    const scope = step.params?.scope || 'all';
                    let indexes = null;
                    if (scope === 'selected') {
                        indexes = getSelectedCueIndexes();
                        if (!indexes.length) return { status: 'skipped', summary: '未选中条目' };
                    }
                    syncDetailToCue();
                    const preview = fluencyCore.simplifyViewingPunctuationInCues(state.cues, {
                        indexes,
                        level: step.params?.level || 'clear',
                    });
                    if (!preview.stats?.cueTouched) return { status: 'skipped', summary: '无需精简标点' };
                    recordUndoBeforeChange();
                    const result = fluencyCore.simplifyViewingPunctuationInCues(state.cues, {
                        indexes,
                        level: step.params?.level || 'clear',
                    });
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    if (state.selectedIndex >= 0) renderDetailPane();
                    return {
                        status: 'done',
                        summary: result.summary || `已精简 ${result.stats.cueTouched} 条`,
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
                'text.sakuraTranslate': async (_c, step) => {
                    const scope = String(step.params?.scope || 'all');
                    let faithfulTone = null;
                    if (step.params?.faithfulTone === true
                        || step.params?.smartTranslateFaithfulTone === true) {
                        faithfulTone = true;
                    } else if (step.params?.faithfulTone === false
                        || step.params?.smartTranslateFaithfulTone === false) {
                        faithfulTone = false;
                    }
                    return runTextTranslateOnce({
                        scope,
                        engine: 'llm',
                        modelId: String(step.params?.modelId || '').trim(),
                        faithfulTone,
                        skipReview: step.params?.skipReview === true,
                    });
                },
                'text.smartTranslate': async (_c, step) => {
                    const scope = String(step.params?.scope || 'all');
                    let faithfulTone = null;
                    if (step.params?.faithfulTone === true
                        || step.params?.smartTranslateFaithfulTone === true) {
                        faithfulTone = true;
                    } else if (step.params?.faithfulTone === false
                        || step.params?.smartTranslateFaithfulTone === false) {
                        faithfulTone = false;
                    }
                    return runTextTranslateOnce({
                        scope,
                        engine: 'smart',
                        faithfulTone,
                        skipReview: step.params?.skipReview === true,
                        // Hybrid / polish follow settings unless step overrides.
                        smartTranslateHybridMt: step.params?.smartTranslateHybridMt,
                        smartTranslatePlotPolish: step.params?.smartTranslatePlotPolish,
                        modelId: String(step.params?.modelId || step.params?.hybridMtModelId || '').trim(),
                    });
                },
                'text.contextReconstruct': async (_c, step) => {
                    const scope = String(step.params?.scope || 'all');
                    const prefs = global.TransubEditorSettingsPrefs?.getReconstructPrefs?.() || {};
                    return runContextReconstructOnce({
                        scope,
                        windowCues: Number(step.params?.windowCues) || prefs.windowCues,
                        overlapCues: Number(step.params?.overlapCues) || prefs.overlapCues,
                        preserveTiming: step.params?.preserveTiming != null
                            ? step.params.preserveTiming !== false
                            : prefs.preserveTiming !== false,
                        skipConsistency: step.params?.skipConsistency != null
                            ? !!step.params.skipConsistency
                            : !!prefs.skipConsistency,
                        mode: 'basic',
                        intensity: step.params?.intensity || prefs.intensity || 'balanced',
                    });
                },
                'text.filmContextReconstruct': async (_c, step) => {
                    const scope = String(step.params?.scope || 'all');
                    const filmCore = global.TransubAdvancedFilmReconstruct;
                    const title = String(step.params?.filmTitle || step.params?.title || '').trim();
                    const synopsis = String(step.params?.filmSynopsis || step.params?.synopsis || '').trim();
                    const terms = String(step.params?.filmTerms || step.params?.terms || '').trim();
                    let userNote = String(step.params?.userNote || step.params?.note || '').trim();
                    if (!userNote && (title || synopsis || terms)) {
                        userNote = filmCore?.composeFilmUserNote
                            ? filmCore.composeFilmUserNote({ title, synopsis, terms })
                            : [title && `片名：${title}`, synopsis && `简介：${synopsis}`, terms && `译名与补充：${terms}`]
                                .filter(Boolean)
                                .join('\n');
                    }
                    if (!userNote && !title && typeof loadFilmHints === 'function') {
                        const saved = loadFilmHints(state.path);
                        const prefs = global.TransubEditorSettingsPrefs?.getReconstructPrefs?.() || {};
                        return runContextReconstructOnce({
                            scope,
                            preserveTiming: step.params?.preserveTiming !== false,
                            mode: 'film',
                            sceneMaxCues: Number(step.params?.sceneMaxCues) || 36,
                            sceneGapMs: Number(step.params?.sceneGapMs) || 2500,
                            filmTitle: saved.title || '',
                            filmSynopsis: saved.synopsis || '',
                            filmTerms: saved.terms || '',
                            intensity: saved.intensity || 'balanced',
                            briefSampleMode: step.params?.briefSampleMode || prefs.briefSampleMode,
                            userNote: filmCore?.composeFilmUserNote
                                ? filmCore.composeFilmUserNote(saved)
                                : '',
                        });
                    }
                    {
                        const prefs = global.TransubEditorSettingsPrefs?.getReconstructPrefs?.() || {};
                        return runContextReconstructOnce({
                            scope,
                            preserveTiming: step.params?.preserveTiming !== false,
                            mode: 'film',
                            sceneMaxCues: Number(step.params?.sceneMaxCues) || 36,
                            sceneGapMs: Number(step.params?.sceneGapMs) || 2500,
                            filmTitle: title,
                            filmSynopsis: synopsis,
                            filmTerms: terms,
                            intensity: step.params?.intensity || 'balanced',
                            briefSampleMode: step.params?.briefSampleMode || prefs.briefSampleMode,
                            userNote,
                        });
                    }
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
                    const padRaw = step.params?.padMs != null ? Number(step.params.padMs) : Number(prefs.padMs);
                    const padMs = Number.isFinite(padRaw) ? padRaw : 350;
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
                    const smartApi = global.TransubSubtitleQcSmart;
                    const prefs = loadRetranscribeDurPrefs?.() || {};
                    const padRaw = step.params?.padMs != null ? Number(step.params.padMs) : Number(prefs.padMs);
                    const padMs = Number.isFinite(padRaw) ? padRaw : (smartApi?.DEFAULT_PAD_MS || 350);
                    const snapAfter = step.params?.snapAfter !== false;
                    const planned = typeof smartApi?.planLowConfidenceRetranscribeRanges === 'function'
                        ? smartApi.planLowConfidenceRetranscribeRanges(state.cues, indexes, {
                            maxCues: Number(step.params?.maxCues) || 50,
                            maxRanges: Number(step.params?.maxRanges) || smartApi.DEFAULT_MAX_RETRANSCRIBE_RANGES,
                            maxDurationSec: Number(step.params?.maxDurationSec) || smartApi.DEFAULT_MAX_RANGE_SEC,
                            mergeAdjacentGapMs: Number(step.params?.mergeAdjacentGapMs) || smartApi.DEFAULT_MERGE_GAP_MS,
                        })
                        : { indexes, ranges: indexes.map((idx) => {
                            const cue = state.cues[idx];
                            const startMs = Number(cue?.startMs) || 0;
                            const endMs = typeof cueEndMs === 'function' ? cueEndMs(cue) : (cue?.endMs || startMs);
                            return {
                                startMs,
                                endMs,
                                indexes: [idx],
                                durationMs: Math.max(200, endMs - startMs),
                            };
                        }), cueCount: indexes.length, rangeCount: indexes.length };
                    const ranges = Array.isArray(planned.ranges) ? planned.ranges : [];
                    if (!ranges.length) return { status: 'skipped', summary: '无低置信条目' };
                    let done = 0;
                    for (let i = 0; i < ranges.length; i += 1) {
                        if (helpers?.signal?.aborted || state.jobAbortRequested) {
                            return { status: 'cancelled', summary: `已取消（完成 ${done} 窗）` };
                        }
                        const range = ranges[i];
                        const firstIdx = Array.isArray(range.indexes) ? range.indexes[0] : -1;
                        if (firstIdx >= 0) selectCue(firstIdx);
                        helpers?.onProgress?.({ current: i + 1, total: ranges.length });
                        await runRetranscribeRange({
                            startMs: range.startMs,
                            endMs: range.endMs,
                            padMs,
                            mode: 'range',
                            snapAfter,
                            detail: `低置信重转 ${i + 1}/${ranges.length}（${planned.cueCount} 条）…`,
                        });
                        done += 1;
                    }
                    return {
                        status: 'done',
                        summary: `已重转 ${done} 窗（约 ${planned.cueCount} 条）`,
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
                'cue.viewingPunct': async (_c, step) => {
                    const indexes = resolveScopeIndexes(step.params?.scope || 'all');
                    if (!indexes.length) return { status: 'skipped', summary: '无目标条目' };
                    syncDetailToCue();
                    const preview = fluencyCore.simplifyViewingPunctuationInCues(state.cues, {
                        indexes,
                        level: step.params?.level || 'clear',
                    });
                    if (!preview.stats?.cueTouched) return { status: 'skipped', summary: '无需精简标点' };
                    recordUndoBeforeChange();
                    const result = fluencyCore.simplifyViewingPunctuationInCues(state.cues, {
                        indexes,
                        level: step.params?.level || 'clear',
                    });
                    state.cues.splice(0, state.cues.length, ...result.cues);
                    setDirty(true);
                    renderCueList();
                    return {
                        status: 'done',
                        summary: result.summary || `已精简 ${result.stats.cueTouched} 条`,
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
                let finalMsg = msg;
                // 全部步骤成功后，再统一做繁体转换（最终步骤）
                if (ok && !run?.summary?.cancelled && !run?.summary?.aborted) {
                    const zh = await applyTraditionalAtWorkflowEndIfNeeded();
                    if (zh?.changed && zh.summary) {
                        finalMsg = `${msg}；${zh.summary}`;
                        setStatus(`${wf.name}：${finalMsg}`, 'ok');
                    }
                }
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
                    detail: finalMsg,
                    current: enabledCount,
                    total: Math.max(enabledCount, 1),
                    indeterminate: false,
                    hint: ok ? '全部步骤已处理完毕' : '部分步骤未完成，可在工作流面板查看摘要',
                    statusMessage: `${wf.name}：${finalMsg}`,
                });
                setSilenceSplitBusy(false);
                if (els.silenceProgressCancel) {
                    els.silenceProgressCancel.textContent = '关闭';
                    els.silenceProgressCancel.disabled = false;
                }
                setWorkflowStatus(finalMsg);
                setStatus(`${wf.name}：${finalMsg}`, statusType);
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
            // Stop in-flight engine / LLM / FFmpeg work started by workflow steps.
            void Promise.allSettled([
                electron?.transubEngineCancel?.(),
                electron?.transubSakuraCancelTranslate?.(),
                electron?.transubAdvancedCancelContextReconstruct?.(),
                electron?.transubAdvancedCancelBatchContextReconstruct?.(),
                electron?.transWithAiCancel?.(),
                electron?.ffmpegCancel?.(),
            ]);
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
            runContextReconstructOnce,
            runTextTranslateOnce,
            promptReconstructReview,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installWorkflows = installWorkflows;
}(typeof globalThis !== 'undefined' ? globalThis : window));
