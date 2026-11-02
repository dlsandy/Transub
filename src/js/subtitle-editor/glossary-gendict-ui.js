/**
 * Subtitle editor — GenDict glossary draft scan (propose → pick/edit → upsert).
 */
(function (global) {
    function installGlossaryGendictUi(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installGlossaryGendictUi(ctx): ctx.state and ctx.els required');
        }
        if (typeof ctx.setStatus !== 'function') {
            throw new Error('installGlossaryGendictUi(ctx): ctx.setStatus required');
        }

        const {
            state,
            els,
            setStatus,
            gendictCore,
            glossaryCore,
            refreshGlossaryUi,
            saveGlossary,
            openModal,
            closeModal,
        } = ctx;

        const gd = () => gendictCore || global.TransubGlossaryGendict;
        const gc = () => glossaryCore || global.TransubSubtitleGlossary;
        let pendingDrafts = [];

        function escapeHtml(text) {
            return String(text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function showModal(modal, focusEl) {
            if (typeof openModal === 'function') {
                openModal(modal, focusEl);
                return;
            }
            modal?.classList?.remove('hidden');
        }

        function hideModal(modal) {
            if (typeof closeModal === 'function') {
                closeModal(modal);
                return;
            }
            modal?.classList?.add('hidden');
        }

        function renderDraftList(drafts) {
            const host = els.gendictDraftList;
            if (!host) return;
            if (!drafts.length) {
                host.innerHTML = '<p class="gendict-empty">没有可写入的草稿</p>';
                return;
            }
            host.innerHTML = drafts.map((d, i) => {
                const alias = (d.aliases || []).filter((a) => a && a !== d.canonical).slice(0, 3).join(' / ');
                const always = d.promptInject === 'always';
                return `<label class="gendict-draft-row" data-gendict-idx="${i}">
                    <input type="checkbox" class="gendict-sel" ${d.selected === false ? '' : 'checked'}>
                    <span class="gendict-draft-fields">
                        <input type="text" class="gendict-canonical" spellcheck="false" value="${escapeHtml(d.canonical)}">
                        <span class="gendict-alias">${escapeHtml(alias || '（无别名）')}</span>
                        <label class="gendict-always"><input type="checkbox" class="gendict-always-cb" ${always ? 'checked' : ''}> 常驻注入</label>
                    </span>
                </label>`;
            }).join('');
        }

        function readDraftsFromDom() {
            const host = els.gendictDraftList;
            if (!host) return [];
            const rows = [];
            host.querySelectorAll('[data-gendict-idx]').forEach((row) => {
                const idx = Number(row.getAttribute('data-gendict-idx'));
                const base = pendingDrafts[idx] || {};
                const sel = row.querySelector('.gendict-sel');
                const can = row.querySelector('.gendict-canonical');
                const always = row.querySelector('.gendict-always-cb');
                rows.push({
                    ...base,
                    canonical: String(can?.value || base.canonical || '').trim(),
                    aliases: base.aliases || [],
                    role: base.role || 'character',
                    note: base.note,
                    promptInject: always?.checked ? 'always' : 'hit',
                    selected: !!sel?.checked,
                    via: base.via || 'gendict',
                });
            });
            const api = gd();
            return api?.normalizeConfirmedDrafts
                ? api.normalizeConfirmedDrafts(rows)
                : rows.filter((d) => d.canonical);
        }

        function closeGendictModal() {
            hideModal(els.gendictConfirmModal);
            pendingDrafts = [];
        }

        async function commitSelectedDrafts() {
            const api = gd();
            if (!api?.applyGlossaryDrafts) {
                setStatus('专名草稿模块未加载', 'err');
                return { ok: false, error: 'missing_gendict' };
            }
            const drafts = readDraftsFromDom().filter((d) => d.selected !== false);
            if (!drafts.length) {
                setStatus('未勾选任何专名草稿', 'warn');
                return { ok: true, added: 0, canceled: true };
            }
            const applied = api.applyGlossaryDrafts(state.glossary, drafts);
            if (!applied.ok) {
                setStatus(applied.error || '写入专名草稿失败', 'err');
                return applied;
            }
            state.glossary = applied.glossary;
            if (state.glossaryScope === 'project') state.projectGlossary = state.glossary;
            else state.globalGlossary = state.glossary;
            if (typeof saveGlossary === 'function') {
                const saved = await saveGlossary();
                if (saved === false) {
                    setStatus('术语表保存失败', 'err');
                    return { ok: false, error: 'save_failed', added: applied.added };
                }
            }
            if (typeof refreshGlossaryUi === 'function') refreshGlossaryUi();
            closeGendictModal();
            const skipNote = applied.skipped ? `，跳过 ${applied.skipped}` : '';
            setStatus(`已写入 ${applied.added} 条专名草稿（默认命中注入）${skipNote}`, 'ok');
            return { ok: true, added: applied.added };
        }

        async function scanAndConfirmGlossaryDrafts() {
            const api = gd();
            if (!api?.proposeGlossaryDraftsFromCues) {
                setStatus('专名草稿模块未加载', 'err');
                return { ok: false, error: 'missing_gendict' };
            }
            if (!Array.isArray(state.cues) || !state.cues.length) {
                setStatus('没有字幕条目可扫描', 'err');
                return { ok: false, error: 'no_cues' };
            }
            const proposed = api.proposeGlossaryDraftsFromCues(state.cues, state.glossary, {
                minCount: 2,
                maxDrafts: 24,
            });
            if (!proposed.drafts.length) {
                setStatus(proposed.summary, 'ok');
                return { ok: true, added: 0, summary: proposed.summary };
            }

            pendingDrafts = proposed.drafts.map((d) => ({
                ...d,
                selected: true,
                promptInject: d.promptInject === 'always' ? 'always' : 'hit',
            }));

            if (els.gendictConfirmModal && els.gendictDraftList) {
                if (els.gendictConfirmIntro) {
                    els.gendictConfirmIntro.textContent = proposed.summary
                        + '。请勾选要写入的条目，可改标准写法；默认「仅命中时」注入，勾选「常驻注入」才占角色常驻名额。';
                }
                renderDraftList(pendingDrafts);
                showModal(els.gendictConfirmModal, els.gendictConfirmBtn || els.gendictDraftList);
                return { ok: true, pending: pendingDrafts.length, summary: proposed.summary };
            }

            // Fallback: old confirm dialog if modal DOM missing
            if (typeof ctx.confirm === 'function') {
                const msg = api.formatDraftConfirmMessage(pendingDrafts);
                const ok = await ctx.confirm(msg);
                if (!ok) {
                    setStatus('已取消写入专名草稿', 'ok');
                    return { ok: true, canceled: true, added: 0 };
                }
                const applied = api.applyGlossaryDrafts(state.glossary, pendingDrafts);
                if (!applied.ok) {
                    setStatus(applied.error || '写入专名草稿失败', 'err');
                    return applied;
                }
                state.glossary = applied.glossary;
                if (state.glossaryScope === 'project') state.projectGlossary = state.glossary;
                else state.globalGlossary = state.glossary;
                if (typeof saveGlossary === 'function') {
                    const saved = await saveGlossary();
                    if (saved === false) {
                        setStatus('术语表保存失败', 'err');
                        return { ok: false, error: 'save_failed', added: applied.added };
                    }
                }
                if (typeof refreshGlossaryUi === 'function') refreshGlossaryUi();
                setStatus(`已写入 ${applied.added} 条专名草稿`, 'ok');
                return { ok: true, added: applied.added, summary: proposed.summary };
            }

            setStatus('专名确认弹窗未加载', 'err');
            return { ok: false, error: 'missing_modal' };
        }

        els.glossaryGendictBtn?.addEventListener('click', () => {
            void scanAndConfirmGlossaryDrafts();
        });
        els.gendictConfirmBtn?.addEventListener('click', () => {
            void commitSelectedDrafts();
        });
        els.gendictConfirmCancel?.addEventListener('click', () => {
            closeGendictModal();
            setStatus('已取消写入专名草稿', 'ok');
        });
        els.gendictConfirmModal?.querySelectorAll('[data-gendict-dismiss]').forEach((node) => {
            node.addEventListener('click', (ev) => {
                ev.preventDefault();
                closeGendictModal();
            });
        });
        els.gendictSelectAllBtn?.addEventListener('click', () => {
            els.gendictDraftList?.querySelectorAll('.gendict-sel').forEach((cb) => {
                cb.checked = true;
            });
        });
        els.gendictSelectNoneBtn?.addEventListener('click', () => {
            els.gendictDraftList?.querySelectorAll('.gendict-sel').forEach((cb) => {
                cb.checked = false;
            });
        });

        return {
            scanAndConfirmGlossaryDrafts,
            commitSelectedDrafts,
            closeGendictModal,
            gc,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installGlossaryGendictUi = installGlossaryGendictUi;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
