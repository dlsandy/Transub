/**
 * Subtitle editor — batch delete cues by text condition.
 */
(function (global) {
    function getFilterPlan() {
        return global.TransubEditorParts?.batchCueFilterPlan || null;
    }

    function installBatchDeleteUi(ctx) {
        const {
            state,
            els,
            setStatus,
            showEditorModal,
            hideEditorModal,
            getSelectedCueIndexes,
            syncDetailToCue,
            recordUndoBeforeChange,
            setDirty,
            renderCueList,
            setSelection,
            editorConfirm,
        } = ctx || {};
        if (!state || !els) {
            throw new Error('installBatchDeleteUi: state and els required');
        }

        function readForm() {
            const pattern = String(els.batchDeletePattern?.value || '').trim();
            const matchMode = els.batchDeleteMatchContains?.checked ? 'contains' : 'equals';
            const scope = els.batchDeleteScopeSelected?.checked ? 'selected' : 'all';
            let scopeIndexes = null;
            if (scope === 'selected') {
                const selected = typeof getSelectedCueIndexes === 'function'
                    ? getSelectedCueIndexes()
                    : [];
                scopeIndexes = Array.isArray(selected) && selected.length
                    ? selected.slice()
                    : (state.selectedIndex >= 0 ? [state.selectedIndex] : []);
            }
            return { pattern, matchMode, scope, scopeIndexes };
        }

        function collectMatches(form) {
            const plan = getFilterPlan();
            if (!plan?.collectRetranslateTextMatches) return [];
            return plan.collectRetranslateTextMatches(state.cues, {
                pattern: form.pattern,
                matchMode: form.matchMode,
                scopeIndexes: form.scope === 'selected' ? form.scopeIndexes : null,
            });
        }

        function syncPreview() {
            if (!els.batchDeletePreview) return;
            const form = readForm();
            const plan = getFilterPlan();
            if (!state.cues?.length) {
                els.batchDeletePreview.textContent = '没有字幕条目';
                els.batchDeletePreview.classList.add('err');
                if (els.batchDeleteConfirm) els.batchDeleteConfirm.disabled = true;
                return;
            }
            if (form.scope === 'selected' && (!form.scopeIndexes || !form.scopeIndexes.length)) {
                els.batchDeletePreview.textContent = '请先选中一条或多条字幕';
                els.batchDeletePreview.classList.add('err');
                if (els.batchDeleteConfirm) els.batchDeleteConfirm.disabled = true;
                return;
            }
            const matched = collectMatches(form);
            const preview = plan?.previewBatchDeletePlan?.({
                matchedIndexes: matched,
                pattern: form.pattern,
                scope: form.scope,
                totalCues: state.cues.length,
            }) || {
                matched: matched.length,
                summary: matched.length
                    ? `将删除 ${matched.length} 条`
                    : '没有符合条件的字幕',
                isErr: !matched.length,
            };
            els.batchDeletePreview.textContent = preview.summary;
            els.batchDeletePreview.classList.toggle('err', !!preview.isErr);
            if (els.batchDeleteConfirm) els.batchDeleteConfirm.disabled = !!preview.isErr;
            return { form, matched, preview };
        }

        function closeModal() {
            if (typeof hideEditorModal === 'function') hideEditorModal(els.batchDeleteModal);
            else els.batchDeleteModal?.classList.add('hidden');
        }

        function openModal() {
            if (!state.cues?.length) {
                setStatus?.('没有字幕可删除', 'warn');
                return;
            }
            if (!els.batchDeletePattern?.value?.trim()) {
                els.batchDeletePattern.value = '…';
            }
            if (els.batchDeleteMatchEquals) els.batchDeleteMatchEquals.checked = true;
            if (els.batchDeleteScopeAll) els.batchDeleteScopeAll.checked = true;
            syncPreview();
            if (typeof showEditorModal === 'function') {
                showEditorModal(els.batchDeleteModal, els.batchDeletePattern || els.batchDeleteConfirm);
            } else {
                els.batchDeleteModal?.classList.remove('hidden');
                els.batchDeletePattern?.focus?.();
            }
        }

        async function confirmRun() {
            const snap = syncPreview();
            if (!snap || snap.preview?.isErr || !snap.matched?.length) return;
            const { matched } = snap;
            const msg = matched.length === 1
                ? `确定删除第 ${matched[0] + 1} 条字幕？此操作可撤销。`
                : `确定删除符合条件的 ${matched.length} 条字幕？此操作可撤销。`;
            const ok = typeof editorConfirm === 'function'
                ? await editorConfirm(msg, {
                    title: '批量删除',
                    detail: String(snap.preview?.summary || ''),
                    okLabel: '删除',
                    cancelLabel: '取消',
                    type: 'warning',
                })
                : window.confirm(msg);
            if (!ok) return;

            const plan = getFilterPlan();
            syncDetailToCue?.();
            recordUndoBeforeChange?.();
            const applied = plan?.applyDeleteCueIndexes
                ? plan.applyDeleteCueIndexes(state.cues, matched)
                : (() => {
                    const remove = new Set(matched);
                    return {
                        cues: state.cues.filter((_, i) => !remove.has(i)),
                        removedIndexes: matched.slice(),
                        removed: matched.length,
                        kept: state.cues.length - matched.length,
                    };
                })();
            if (!applied.removed) {
                syncPreview();
                setStatus?.('没有可删除的字幕', 'ok');
                return;
            }
            const nextSel = plan?.nextSelectedIndexAfterDelete
                ? plan.nextSelectedIndexAfterDelete(
                    state.selectedIndex,
                    applied.removedIndexes,
                    applied.cues.length,
                )
                : (applied.cues.length ? 0 : -1);
            state.cues.splice(0, state.cues.length, ...applied.cues);
            if (typeof setSelection === 'function') {
                setSelection(nextSel >= 0 ? [nextSel] : [], nextSel);
            } else {
                state.selectedIndex = nextSel;
                state.selectedIndices = nextSel >= 0 ? new Set([nextSel]) : new Set();
            }
            setDirty?.(true);
            renderCueList?.();
            closeModal();
            setStatus?.(
                applied.removed === 1
                    ? `已删除 1 条字幕，剩余 ${applied.kept} 条`
                    : `已删除 ${applied.removed} 条字幕，剩余 ${applied.kept} 条`,
                'ok',
            );
        }

        function wireUi() {
            if (els.batchDeleteBtn?.dataset?.batchDeleteWired === '1'
                && els.batchDeleteMenuBtn?.dataset?.batchDeleteWired === '1') {
                return;
            }
            const open = () => openModal();
            if (els.batchDeleteBtn && els.batchDeleteBtn.dataset.batchDeleteWired !== '1') {
                els.batchDeleteBtn.addEventListener('click', open);
                els.batchDeleteBtn.dataset.batchDeleteWired = '1';
            }
            if (els.batchDeleteMenuBtn && els.batchDeleteMenuBtn.dataset.batchDeleteWired !== '1') {
                els.batchDeleteMenuBtn.addEventListener('click', open);
                els.batchDeleteMenuBtn.dataset.batchDeleteWired = '1';
            }
            if (els.batchDeleteModal?.dataset?.batchDeleteModalWired === '1') return;
            els.batchDeleteConfirm?.addEventListener('click', () => {
                void confirmRun();
            });
            els.batchDeleteCancel?.addEventListener('click', () => closeModal());
            els.batchDeleteModal?.querySelectorAll('[data-batch-delete-dismiss]').forEach((node) => {
                node.addEventListener('click', () => closeModal());
            });
            const syncInputs = [
                els.batchDeletePattern,
                els.batchDeleteMatchEquals,
                els.batchDeleteMatchContains,
                els.batchDeleteScopeAll,
                els.batchDeleteScopeSelected,
            ];
            syncInputs.forEach((node) => {
                node?.addEventListener('input', () => syncPreview());
                node?.addEventListener('change', () => syncPreview());
            });
            if (els.batchDeleteModal) els.batchDeleteModal.dataset.batchDeleteModalWired = '1';
        }

        return {
            openModal,
            closeModal,
            syncPreview,
            confirmRun,
            collectMatches,
            readForm,
            wireUi,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installBatchDeleteUi = installBatchDeleteUi;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { installBatchDeleteUi };
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
