/**
 * Subtitle editor — batch re-translate by text condition (补译条件).
 */
(function (global) {
    function getFilterPlan() {
        return global.TransubEditorParts?.batchCueFilterPlan || null;
    }

    function installBatchRetranslateUi(ctx) {
        const {
            state,
            els,
            electron,
            setStatus,
            showEditorModal,
            hideEditorModal,
            getSelectedCueIndexes,
            runTextTranslateOnce,
        } = ctx || {};
        if (!state || !els) {
            throw new Error('installBatchRetranslateUi: state and els required');
        }

        function readForm() {
            const pattern = String(els.batchRetranslatePattern?.value || '').trim();
            const matchMode = els.batchRetranslateMatchContains?.checked ? 'contains' : 'equals';
            const scope = els.batchRetranslateScopeSelected?.checked ? 'selected' : 'all';
            const engine = els.batchRetranslateEngineSmart?.checked ? 'smart' : 'llm';
            let scopeIndexes = null;
            if (scope === 'selected') {
                const selected = typeof getSelectedCueIndexes === 'function'
                    ? getSelectedCueIndexes()
                    : [];
                scopeIndexes = Array.isArray(selected) && selected.length
                    ? selected.slice()
                    : (state.selectedIndex >= 0 ? [state.selectedIndex] : []);
            }
            return { pattern, matchMode, scope, engine, scopeIndexes };
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
            if (!els.batchRetranslatePreview) return;
            const form = readForm();
            const plan = getFilterPlan();
            if (!state.cues?.length) {
                els.batchRetranslatePreview.textContent = '没有字幕条目';
                els.batchRetranslatePreview.classList.add('err');
                if (els.batchRetranslateConfirm) els.batchRetranslateConfirm.disabled = true;
                return;
            }
            if (form.scope === 'selected' && (!form.scopeIndexes || !form.scopeIndexes.length)) {
                els.batchRetranslatePreview.textContent = '请先选中一条或多条字幕';
                els.batchRetranslatePreview.classList.add('err');
                if (els.batchRetranslateConfirm) els.batchRetranslateConfirm.disabled = true;
                return;
            }
            const matched = collectMatches(form);
            const preview = plan?.previewBatchRetranslatePlan?.({
                matchedIndexes: matched,
                pattern: form.pattern,
                engine: form.engine,
                scope: form.scope,
            }) || {
                matched: matched.length,
                summary: matched.length ? `将重译 ${matched.length} 条` : '没有符合条件的字幕',
                isErr: !matched.length,
            };
            els.batchRetranslatePreview.textContent = preview.summary;
            els.batchRetranslatePreview.classList.toggle('err', !!preview.isErr);
            if (els.batchRetranslateConfirm) els.batchRetranslateConfirm.disabled = !!preview.isErr;
            return { form, matched, preview };
        }

        function closeModal() {
            if (typeof hideEditorModal === 'function') hideEditorModal(els.batchRetranslateModal);
            else els.batchRetranslateModal?.classList.add('hidden');
        }

        function openModal() {
            if (!state.cues?.length) {
                setStatus?.('没有字幕可重译', 'warn');
                return;
            }
            if (state.reconstructBusy) {
                setStatus?.('翻译或重构进行中…', 'warn');
                return;
            }
            if (state.computeBusy) {
                setStatus?.(
                    state.computeBusyLabel
                        ? `已有${state.computeBusyLabel}正在运行，请等待完成后再试`
                        : '其它窗口有引擎或 LLM 任务正在运行，请稍后再试',
                    'err',
                );
                return;
            }
            if (!els.batchRetranslatePattern?.value?.trim()) {
                els.batchRetranslatePattern.value = '…';
            }
            if (els.batchRetranslateMatchEquals) els.batchRetranslateMatchEquals.checked = true;
            if (els.batchRetranslateScopeAll) els.batchRetranslateScopeAll.checked = true;
            if (els.batchRetranslateEngineLlm) els.batchRetranslateEngineLlm.checked = true;
            syncPreview();
            if (typeof showEditorModal === 'function') {
                showEditorModal(els.batchRetranslateModal, els.batchRetranslatePattern || els.batchRetranslateConfirm);
            } else {
                els.batchRetranslateModal?.classList.remove('hidden');
                els.batchRetranslatePattern?.focus?.();
            }
        }

        async function confirmRun() {
            const snap = syncPreview();
            if (!snap || snap.preview?.isErr || !snap.matched?.length) return;
            const { form, matched } = snap;
            if (form.engine === 'smart') {
                if (!electron?.transubAdvancedSmartTranslate) {
                    setStatus?.('当前环境不支持智能翻译', 'err');
                    return;
                }
                try {
                    const gate = await electron.transubAdvancedRequireFeature?.({
                        featureId: 'smartTranslate',
                    });
                    if (gate && gate.ok === false) {
                        setStatus?.(gate.error || gate.message || '需要 Pro 才能使用智能翻译', 'err');
                        return;
                    }
                } catch (err) {
                    setStatus?.(err?.message || '智能翻译门控失败', 'err');
                    return;
                }
            } else if (!electron?.transubSakuraTranslate) {
                setStatus?.('当前环境不支持推理翻译', 'err');
                return;
            }
            if (typeof runTextTranslateOnce !== 'function') {
                setStatus?.('翻译能力未就绪', 'err');
                return;
            }
            closeModal();
            const result = await runTextTranslateOnce({
                cueIndexes: matched,
                engine: form.engine === 'smart' ? 'smart' : 'llm',
            });
            setStatus?.(
                result?.summary || '批量重译结束',
                result?.status === 'failed' ? 'err'
                    : result?.status === 'cancelled' ? 'warn'
                        : 'ok',
            );
        }

        function wireUi() {
            if (els.batchRetranslateBtn?.dataset?.batchRetranslateWired === '1') return;
            els.batchRetranslateBtn?.addEventListener('click', () => openModal());
            els.batchRetranslateConfirm?.addEventListener('click', () => {
                void confirmRun();
            });
            els.batchRetranslateCancel?.addEventListener('click', () => closeModal());
            els.batchRetranslateModal?.querySelectorAll('[data-batch-retranslate-dismiss]').forEach((node) => {
                node.addEventListener('click', () => closeModal());
            });
            const syncInputs = [
                els.batchRetranslatePattern,
                els.batchRetranslateMatchEquals,
                els.batchRetranslateMatchContains,
                els.batchRetranslateScopeAll,
                els.batchRetranslateScopeSelected,
                els.batchRetranslateEngineLlm,
                els.batchRetranslateEngineSmart,
            ];
            syncInputs.forEach((node) => {
                node?.addEventListener('input', () => syncPreview());
                node?.addEventListener('change', () => syncPreview());
            });
            if (els.batchRetranslateBtn) els.batchRetranslateBtn.dataset.batchRetranslateWired = '1';
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
    global.TransubEditorParts.installBatchRetranslateUi = installBatchRetranslateUi;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { installBatchRetranslateUi };
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
