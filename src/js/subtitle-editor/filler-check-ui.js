/**
 * Subtitle editor — check multilingual discourse / onomatopoeia fillers,
 * review matches, delete pure cues or strip inline fillers from mixed cues.
 */
(function (global) {
    function getPlan() {
        return global.TransubEditorParts?.fillerCheckPlan || null;
    }

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function previewText(text, max = 48) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (t.length <= max) return t;
        return `${t.slice(0, max)}…`;
    }

    function installFillerCheckUi(ctx) {
        const {
            state,
            els,
            setStatus,
            showEditorModal,
            hideEditorModal,
            syncDetailToCue,
            recordUndoBeforeChange,
            setDirty,
            renderCueList,
            setSelection,
            setListFilter,
            editorConfirm,
            getPreferredLang,
        } = ctx || {};
        if (!state || !els) {
            throw new Error('installFillerCheckUi: state and els required');
        }

        let lastMatches = [];

        function readForm() {
            return {
                checkDiscourse: !!(els.fillerCheckDiscourse?.checked ?? true),
                checkOnomatopoeia: !!(els.fillerCheckOnomatopoeia?.checked ?? true),
                includeInline: !!(els.fillerCheckIncludeInline?.checked ?? false),
                langMode: els.fillerCheckLangTarget?.checked ? 'target' : 'auto',
                preferredLang: typeof getPreferredLang === 'function'
                    ? getPreferredLang()
                    : (state.targetLang || 'zh'),
            };
        }

        function readCheckedMatches() {
            if (!els.fillerCheckMatchList) return [];
            const boxes = els.fillerCheckMatchList.querySelectorAll('input[data-filler-idx]:checked');
            const wanted = new Set();
            boxes.forEach((node) => {
                const idx = Number(node.getAttribute('data-filler-idx'));
                if (Number.isInteger(idx) && idx >= 0) wanted.add(idx);
            });
            return lastMatches.filter((m) => wanted.has(m.index));
        }

        function syncActionLabels(matches) {
            const list = Array.isArray(matches) ? matches : lastMatches;
            const hasStrip = list.some((m) => m.action === 'strip');
            const hasDelete = list.some((m) => m.action !== 'strip');
            if (els.fillerCheckDeleteCheckedBtn) {
                els.fillerCheckDeleteCheckedBtn.textContent = hasStrip && hasDelete
                    ? '应用勾选'
                    : (hasStrip && !hasDelete ? '清理勾选' : '删除勾选');
            }
            if (els.fillerCheckDeleteAllBtn) {
                els.fillerCheckDeleteAllBtn.textContent = hasStrip && hasDelete
                    ? '应用全部匹配'
                    : (hasStrip && !hasDelete ? '清理全部匹配' : '删除全部匹配');
            }
        }

        function setActionEnabled(hasMatches) {
            const checked = readCheckedMatches();
            if (els.fillerCheckSelectBtn) els.fillerCheckSelectBtn.disabled = !hasMatches;
            if (els.fillerCheckDeleteCheckedBtn) {
                els.fillerCheckDeleteCheckedBtn.disabled = !checked.length;
            }
            if (els.fillerCheckDeleteAllBtn) {
                els.fillerCheckDeleteAllBtn.disabled = !hasMatches;
            }
            if (els.fillerCheckSelectAllBtn) els.fillerCheckSelectAllBtn.disabled = !hasMatches;
            if (els.fillerCheckSelectNoneBtn) els.fillerCheckSelectNoneBtn.disabled = !hasMatches;
            syncActionLabels(lastMatches);
        }

        function renderMatchList(matches) {
            lastMatches = Array.isArray(matches) ? matches : [];
            if (!els.fillerCheckMatchList) return;
            if (!lastMatches.length) {
                els.fillerCheckMatchList.innerHTML = '<p class="text-xs" style="color:var(--ed-muted);margin:0">暂无匹配</p>';
                setActionEnabled(false);
                return;
            }
            els.fillerCheckMatchList.innerHTML = lastMatches.map((row) => {
                const idx = row.index;
                const label = escHtml(row.label || '');
                const text = escHtml(previewText(row.text));
                const next = row.action === 'strip' && row.nextText
                    ? `<span style="display:block;color:var(--ed-muted);font-size:.75rem;margin-top:.15rem">→ ${escHtml(previewText(row.nextText))}</span>`
                    : '';
                return `<label class="split-mode-item filler-check-row" style="align-items:flex-start;gap:.5rem">
                    <input type="checkbox" data-filler-idx="${idx}" checked>
                    <span style="flex:1;min-width:0">
                        <span class="text-xs" style="color:var(--ed-muted)">#${idx + 1} · ${label}</span>
                        <span style="display:block;word-break:break-word">${text || '（空）'}</span>
                        ${next}
                    </span>
                </label>`;
            }).join('');
            setActionEnabled(true);
        }

        function runScan() {
            const plan = getPlan();
            if (!els.fillerCheckPreview) return null;
            if (!state.cues?.length) {
                els.fillerCheckPreview.textContent = '没有字幕条目';
                els.fillerCheckPreview.classList.add('err');
                renderMatchList([]);
                return null;
            }
            const form = readForm();
            if (!form.checkDiscourse && !form.checkOnomatopoeia) {
                const preview = plan?.previewFillerCheckPlan?.({
                    matches: [],
                    checkDiscourse: false,
                    checkOnomatopoeia: false,
                }) || { summary: '请至少勾选一类', isErr: true };
                els.fillerCheckPreview.textContent = preview.summary;
                els.fillerCheckPreview.classList.add('err');
                renderMatchList([]);
                return null;
            }
            const matches = plan?.collectFillerMatches
                ? plan.collectFillerMatches(state.cues, form)
                : [];
            const preview = plan?.previewFillerCheckPlan?.({
                matches,
                checkDiscourse: form.checkDiscourse,
                checkOnomatopoeia: form.checkOnomatopoeia,
                includeInline: form.includeInline,
                totalCues: state.cues.length,
            }) || {
                matched: matches.length,
                summary: matches.length ? `匹配 ${matches.length} 条` : '未发现匹配',
                isErr: !matches.length,
            };
            els.fillerCheckPreview.textContent = preview.summary;
            els.fillerCheckPreview.classList.toggle('err', !!preview.isErr);
            renderMatchList(matches);
            return { form, matches, preview };
        }

        function closeModal() {
            if (typeof hideEditorModal === 'function') hideEditorModal(els.fillerCheckModal);
            else els.fillerCheckModal?.classList.add('hidden');
        }

        function openModal() {
            if (!state.cues?.length) {
                setStatus?.('没有字幕可检查', 'warn');
                return;
            }
            if (els.fillerCheckDiscourse) els.fillerCheckDiscourse.checked = true;
            if (els.fillerCheckOnomatopoeia) els.fillerCheckOnomatopoeia.checked = true;
            if (els.fillerCheckIncludeInline) els.fillerCheckIncludeInline.checked = false;
            if (els.fillerCheckLangAuto) els.fillerCheckLangAuto.checked = true;
            runScan();
            if (typeof showEditorModal === 'function') {
                showEditorModal(
                    els.fillerCheckModal,
                    els.fillerCheckScanBtn || els.fillerCheckDeleteCheckedBtn,
                );
            } else {
                els.fillerCheckModal?.classList.remove('hidden');
            }
        }

        function setAllChecked(on) {
            if (!els.fillerCheckMatchList) return;
            els.fillerCheckMatchList.querySelectorAll('input[data-filler-idx]').forEach((node) => {
                node.checked = !!on;
            });
            setActionEnabled(lastMatches.length > 0);
        }

        function filterToList(indexes) {
            const idxs = (Array.isArray(indexes) ? indexes : [])
                .filter((n) => Number.isInteger(n) && n >= 0);
            if (!idxs.length) {
                setStatus?.('没有可筛选的条目', 'warn');
                return;
            }
            state.fillerMatchIndexSet = new Set(idxs);
            if (typeof setListFilter === 'function') setListFilter('filler');
            if (typeof setSelection === 'function') {
                setSelection(idxs, idxs[0]);
            } else {
                state.selectedIndex = idxs[0];
                state.selectedIndices = new Set(idxs);
            }
            renderCueList?.({ listOnly: true, reuseMeta: true });
            closeModal();
            setStatus?.(
                idxs.length === 1
                    ? '已筛选到 1 条语气/拟声，请确认后处理'
                    : `已筛选到 ${idxs.length} 条语气/拟声，可删整条或清理夹杂`,
                'ok',
            );
        }

        async function applyMatches(selectedRows, { allMatched = false } = {}) {
            const plan = getPlan();
            const rows = (Array.isArray(selectedRows) ? selectedRows : [])
                .filter((m) => Number.isInteger(m?.index) && m.index >= 0 && m.index < (state.cues?.length || 0));
            if (!rows.length) {
                setStatus?.('没有可处理的字幕', 'warn');
                return false;
            }
            const deleteCount = rows.filter((m) => m.action !== 'strip').length;
            const stripCount = rows.filter((m) => m.action === 'strip').length;
            const parts = [];
            if (deleteCount) parts.push(`删除整条 ${deleteCount}`);
            if (stripCount) parts.push(`清理夹杂 ${stripCount}`);
            const msg = allMatched
                ? `确定应用全部 ${rows.length} 条匹配（${parts.join('，')}）？此操作可撤销。`
                : `确定应用勾选的 ${rows.length} 条（${parts.join('，')}）？此操作可撤销。`;
            const ok = typeof editorConfirm === 'function'
                ? await editorConfirm(msg, {
                    title: '处理语气/拟声',
                    detail: '整条语气/拟声将删除；夹杂语气/拟声只去掉这些词并保留其余对白。',
                    okLabel: '应用',
                    cancelLabel: '取消',
                    type: 'warning',
                })
                : window.confirm(msg);
            if (!ok) return false;

            syncDetailToCue?.();
            recordUndoBeforeChange?.();
            const applied = plan?.applyFillerMatches
                ? plan.applyFillerMatches(state.cues, rows)
                : null;
            if (!applied || !applied.touched) {
                setStatus?.('没有可处理的字幕', 'ok');
                return false;
            }
            const nextSel = plan?.nextSelectedIndexAfterDelete
                ? plan.nextSelectedIndexAfterDelete(
                    state.selectedIndex,
                    applied.removedIndexes,
                    applied.cues.length,
                )
                : (applied.cues.length ? 0 : -1);
            state.cues.splice(0, state.cues.length, ...applied.cues);
            state.fillerMatchIndexSet = new Set();
            if (typeof setListFilter === 'function' && state.listFilter === 'filler') {
                setListFilter('all');
            }
            if (typeof setSelection === 'function') {
                setSelection(nextSel >= 0 ? [nextSel] : [], nextSel);
            } else {
                state.selectedIndex = nextSel;
                state.selectedIndices = nextSel >= 0 ? new Set([nextSel]) : new Set();
            }
            setDirty?.(true);
            renderCueList?.();
            closeModal();
            const statusParts = [];
            if (applied.removed) statusParts.push(`删除 ${applied.removed} 条`);
            if (applied.stripped) statusParts.push(`清理 ${applied.stripped} 条`);
            setStatus?.(
                `${statusParts.join('，')}，剩余 ${applied.kept} 条`,
                'ok',
            );
            return true;
        }

        function wireUi() {
            if (els.fillerCheckBtn?.dataset?.fillerCheckWired === '1'
                && els.fillerCheckModal?.dataset?.fillerCheckModalWired === '1') {
                return;
            }
            if (els.fillerCheckBtn && els.fillerCheckBtn.dataset.fillerCheckWired !== '1') {
                els.fillerCheckBtn.addEventListener('click', () => openModal());
                els.fillerCheckBtn.dataset.fillerCheckWired = '1';
            }
            if (els.fillerCheckModal?.dataset?.fillerCheckModalWired === '1') return;

            els.fillerCheckScanBtn?.addEventListener('click', () => runScan());
            els.fillerCheckCancel?.addEventListener('click', () => closeModal());
            els.fillerCheckModal?.querySelectorAll('[data-filler-check-dismiss]').forEach((node) => {
                node.addEventListener('click', () => closeModal());
            });
            els.fillerCheckSelectAllBtn?.addEventListener('click', () => setAllChecked(true));
            els.fillerCheckSelectNoneBtn?.addEventListener('click', () => setAllChecked(false));
            els.fillerCheckSelectBtn?.addEventListener('click', () => {
                const checked = readCheckedMatches();
                const idxs = (checked.length ? checked : lastMatches).map((m) => m.index);
                filterToList(idxs);
            });
            els.fillerCheckDeleteCheckedBtn?.addEventListener('click', () => {
                void applyMatches(readCheckedMatches(), { allMatched: false });
            });
            els.fillerCheckDeleteAllBtn?.addEventListener('click', () => {
                void applyMatches(lastMatches, { allMatched: true });
            });
            els.fillerCheckMatchList?.addEventListener('change', (ev) => {
                if (ev.target?.matches?.('input[data-filler-idx]')) {
                    setActionEnabled(lastMatches.length > 0);
                }
            });
            const syncOpts = [
                els.fillerCheckDiscourse,
                els.fillerCheckOnomatopoeia,
                els.fillerCheckIncludeInline,
                els.fillerCheckLangAuto,
                els.fillerCheckLangTarget,
            ];
            syncOpts.forEach((node) => {
                node?.addEventListener('change', () => runScan());
            });
            if (els.fillerCheckModal) els.fillerCheckModal.dataset.fillerCheckModalWired = '1';
        }

        return {
            openModal,
            closeModal,
            runScan,
            wireUi,
            filterToList,
            applyMatches,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installFillerCheckUi = installFillerCheckUi;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { installFillerCheckUi };
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
