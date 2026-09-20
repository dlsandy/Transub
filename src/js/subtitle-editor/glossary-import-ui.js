/**
 * Subtitle editor — AniList / bad-pool glossary import buttons.
 */
(function (global) {
    function installGlossaryImportUi(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installGlossaryImportUi(ctx): ctx.state and ctx.els required');
        }
        if (typeof ctx.setStatus !== 'function') {
            throw new Error('installGlossaryImportUi(ctx): ctx.setStatus required');
        }

        const {
            state,
            els,
            electron,
            setStatus,
            glossaryCore,
            importCore,
            getEffectiveGlossary,
            refreshGlossaryUi,
            saveGlossary,
            getGlossaryScope,
        } = ctx;

        const ic = () => importCore || global.TransubSubtitleGlossaryImport;

        function populateAnilistHelp() {
            const guide = ic()?.getAnilistImportGuide?.();
            if (!guide) return;
            if (els.glossaryAnilistHelpSteps) {
                els.glossaryAnilistHelpSteps.innerHTML = (guide.steps || [])
                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                    .join('');
            }
            if (els.glossaryAnilistHelpNote) {
                els.glossaryAnilistHelpNote.textContent = guide.note || '';
            }
            if (els.anilistImportTitle) els.anilistImportTitle.textContent = guide.title;
            if (els.anilistImportIntro) els.anilistImportIntro.textContent = guide.intro;
            if (els.anilistImportSteps) {
                els.anilistImportSteps.innerHTML = (guide.steps || [])
                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                    .join('');
            }
            if (els.anilistImportInputLabel) {
                els.anilistImportInputLabel.textContent = guide.inputLabel || '作品链接或 ID';
            }
            if (els.anilistImportInput) {
                els.anilistImportInput.placeholder = guide.inputPlaceholder || '';
            }
            if (els.anilistOpenSiteBtn) {
                els.anilistOpenSiteBtn.textContent = guide.openSiteLabel || '打开 AniList 搜索番剧';
            }
            if (els.anilistImportConfirm) {
                els.anilistImportConfirm.textContent = guide.submitLabel || '开始导入';
            }
            if (els.anilistImportNote) els.anilistImportNote.textContent = guide.note || '';
        }

        function escapeHtml(text) {
            return String(text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function openExternal(url) {
            const target = String(url || '').trim();
            if (!target) return;
            if (electron?.openExternal) {
                void electron.openExternal(target).catch(() => {
                    window.open(target, '_blank', 'noopener,noreferrer');
                });
                return;
            }
            window.open(target, '_blank', 'noopener,noreferrer');
        }

        function showAnilistImportModal() {
            if (!els.anilistImportModal) {
                return promptAnilistImportFallback();
            }
            populateAnilistHelp();
            if (els.anilistImportInput) els.anilistImportInput.value = '';
            els.anilistImportModal.classList.remove('hidden');
            els.anilistImportModal.removeAttribute('inert');
            setTimeout(() => els.anilistImportInput?.focus(), 0);
            return Promise.resolve({ ok: true, opened: true });
        }

        function hideAnilistImportModal() {
            if (!els.anilistImportModal) return;
            els.anilistImportModal.classList.add('hidden');
            els.anilistImportModal.setAttribute('inert', '');
        }

        function promptAnilistImportFallback() {
            const raw = window.prompt(
                ic()?.buildAnilistImportPromptMessage?.()
                    || '粘贴 anilist.co 作品页链接或 ID（例：9253）',
                '',
            );
            if (raw == null || !String(raw).trim()) {
                return Promise.resolve({ ok: true, canceled: true });
            }
            return runAnilistImport(String(raw).trim());
        }

        async function runAnilistImport(raw) {
            if (!electron?.transubImportAnilistGlossary) {
                setStatus('当前环境不支持动漫资料库导入', 'err');
                return { ok: false };
            }
            const id = ic()?.parseAnilistMediaId?.(raw) ?? Number(String(raw).trim());
            if (!Number.isFinite(id) || id <= 0) {
                setStatus('无效的作品链接或 ID，请从 anilist.co 作品页复制', 'err');
                return { ok: false };
            }
            const scope = typeof getGlossaryScope === 'function' ? getGlossaryScope() : 'global';
            const payload = {
                id,
                type: ic()?.detectAnilistMediaType?.(raw) || 'ANIME',
                scope,
            };
            if (scope === 'project') {
                if (!state.path) {
                    setStatus('请先保存字幕文件后再导入项目术语表', 'err');
                    return { ok: false };
                }
                payload.subtitlePath = state.path;
            }
            setStatus('正在从动漫资料库拉取角色名…', '');
            try {
                const result = await electron.transubImportAnilistGlossary(payload);
                if (!result?.ok) {
                    setStatus(result?.error || '角色名导入失败', 'err');
                    return result;
                }
                if (scope === 'project') {
                    state.projectGlossary = glossaryCore.normalizeGlossary(result.glossary);
                } else {
                    state.globalGlossary = glossaryCore.normalizeGlossary(result.glossary);
                }
                if (typeof refreshGlossaryUi === 'function') refreshGlossaryUi();
                if (typeof saveGlossary === 'function') await saveGlossary();
                const msg = ic()?.formatAnilistImportMessage?.(result)
                    || `已导入 ${result.entryCount || 0} 条`;
                setStatus(msg, 'ok');
                return result;
            } catch (err) {
                setStatus(err?.message || String(err), 'err');
                return { ok: false, error: String(err) };
            }
        }

        async function importAnilistGlossary() {
            await showAnilistImportModal();
        }

        async function confirmAnilistImportFromModal() {
            const raw = String(els.anilistImportInput?.value || '').trim();
            if (!raw) {
                setStatus('请粘贴 anilist.co 作品页链接或 ID', 'warn');
                els.anilistImportInput?.focus();
                return { ok: false };
            }
            hideAnilistImportModal();
            return runAnilistImport(raw);
        }

        async function importBadPoolGlossary() {
            if (!electron?.transubImportBadPoolGlossary) {
                setStatus('当前环境不支持坏句池导入', 'err');
                return { ok: false };
            }
            const scope = typeof getGlossaryScope === 'function' ? getGlossaryScope() : 'global';
            const payload = { scope };
            if (scope === 'project') {
                if (!state.path) {
                    setStatus('请先保存字幕文件后再导入项目术语表', 'err');
                    return { ok: false };
                }
                payload.subtitlePath = state.path;
            }
            setStatus('正在读取本地坏句池…', '');
            try {
                const result = await electron.transubImportBadPoolGlossary(payload);
                if (!result?.ok) {
                    setStatus(result?.error || '坏句池导入失败', 'err');
                    return result;
                }
                if (scope === 'project') {
                    state.projectGlossary = glossaryCore.normalizeGlossary(result.glossary);
                } else {
                    state.globalGlossary = glossaryCore.normalizeGlossary(result.glossary);
                }
                if (typeof refreshGlossaryUi === 'function') refreshGlossaryUi();
                if (typeof saveGlossary === 'function') await saveGlossary();
                const msg = ic()?.formatBadPoolImportMessage?.(result)
                    || `已导入 ${result.entryCount || 0} 条`;
                setStatus(msg, result.entryCount ? 'ok' : 'warn');
                return result;
            } catch (err) {
                setStatus(err?.message || String(err), 'err');
                return { ok: false, error: String(err) };
            }
        }

        populateAnilistHelp();

        els.glossaryAnilistBtn?.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            void importAnilistGlossary();
        });
        els.glossaryBadPoolBtn?.addEventListener('click', () => {
            importBadPoolGlossary();
        });
        els.anilistImportConfirm?.addEventListener('click', () => {
            confirmAnilistImportFromModal();
        });
        els.anilistOpenSiteBtn?.addEventListener('click', () => {
            openExternal(ic()?.ANILIST_SEARCH_URL || 'https://anilist.co/search/anime');
        });
        els.anilistImportModal?.querySelectorAll('[data-anilist-import-dismiss]').forEach((node) => {
            node.addEventListener('click', () => hideAnilistImportModal());
        });
        els.anilistImportInput?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                confirmAnilistImportFromModal();
            }
        });

        return {
            importAnilistGlossary,
            importBadPoolGlossary,
            showAnilistImportModal,
            hideAnilistImportModal,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installGlossaryImportUi = installGlossaryImportUi;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
