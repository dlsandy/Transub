/**
 * 字幕编辑器 — 原文缓存利用、标记（书签/A-B/审校）、导出检查、情境条
 */
(function (global) {
    function installKeptAndMarkers(ctx) {
        const {
            state,
            els,
            electron,
            setStatus,
            recordUndoBeforeChange,
            setDirty,
            renderCueList,
            refreshListRow,
            renderDetailPane,
            renderTimeline,
            basename,
            esc,
            showEditorModal,
            hideEditorModal,
            hasDualPair,
            clearPairTrack,
            syncDualDisplaySelectVisibility,
            loadDualDisplayMode,
            loadDualLineOrder,
            cueEndMs,
            getSelectedCueIndexes,
            persistCueMeta,
            refreshCueMeta,
            qcCore,
            metaCore,
            editorConfirm,
        } = ctx;

        const compareCore = ctx.compareCore || global.TransubTranscriptCompare;
        const markersCore = ctx.markersCore || global.TransubEditorMarkers;
        const checklistCore = ctx.checklistCore || global.TransubExportChecklist;
        const startContextReconstruct = ctx.startContextReconstruct;
        const startTextTranslate = ctx.startTextTranslate;
        const openSmartSplitModal = ctx.openSmartSplitModal;
        const runSemanticBilingualReview = ctx.runSemanticBilingualReview;
        const exportAssDocument = ctx.exportAssDocument || ctx.exportAssWithSpeakerStyles;
        const selectCue = ctx.selectCue;
        const getAssStylesUi = ctx.getAssStylesUi;
        const editorChoice = ctx.editorChoice;

        if (!compareCore || !markersCore || !checklistCore) {
            throw new Error('installKeptAndMarkers: compare/markers/checklist cores required');
        }

        if (!state.markers) state.markers = markersCore.emptyMarkersDoc();
        if (!state.keptTranscript) {
            state.keptTranscript = {
                found: false,
                path: '',
                cues: [],
                daysLeft: null,
                pinned: false,
            };
        }
        state._abPrevMs = null;
        state._pendingAbPoint = null;
        state._genericModalHandler = null;

        function pathEquals(a, b) {
            const na = String(a || '').replace(/\\/g, '/').toLowerCase();
            const nb = String(b || '').replace(/\\/g, '/').toLowerCase();
            return !!na && na === nb;
        }

        function formatMs(ms) {
            const total = Math.max(0, Math.round(Number(ms) || 0));
            const h = Math.floor(total / 3600000);
            const m = Math.floor((total % 3600000) / 60000);
            const s = Math.floor((total % 60000) / 1000);
            const frac = total % 1000;
            const pad = (n, w = 2) => String(n).padStart(w, '0');
            return `${pad(h)}:${pad(m)}:${pad(s)},${pad(frac, 3)}`;
        }

        function formatDaysLeft(days) {
            if (!Number.isFinite(days)) return '保留中';
            if (days < 0) return '已过期';
            if (days === 0) return '今日可能清理';
            return `约 ${days} 天`;
        }

        function openPanelModal(title, bodyHtml) {
            if (!els.genericModal || !showEditorModal) {
                setStatus(title, 'warn');
                return;
            }
            if (els.genericModalTitle) els.genericModalTitle.textContent = title;
            if (els.genericModalBody) els.genericModalBody.innerHTML = bodyHtml;
            showEditorModal(els.genericModal, els.genericModalBody?.querySelector('button, input, textarea'));
        }

        function closePanelModal() {
            if (els.genericModal) hideEditorModal?.(els.genericModal);
            state._genericModalHandler = null;
        }

        function syncMarkersIntoSidecar() {
            if (!state.sidecarMeta || typeof state.sidecarMeta !== 'object') {
                state.sidecarMeta = { version: 1, entries: [], markers: state.markers };
            } else {
                state.sidecarMeta.markers = markersCore.normalizeMarkersDoc(state.markers);
            }
        }

        async function persistMarkers() {
            syncMarkersIntoSidecar();
            if (typeof persistCueMeta === 'function') {
                await persistCueMeta();
                return;
            }
            if (!state.path || !electron?.transubWriteSubtitleMeta || !metaCore) return;
            const doc = metaCore.buildSidecarDocument(state.cues, state.cueMeta, {
                sourceSub: basename(state.path),
                markers: state.markers,
            });
            state.sidecarMeta = doc;
            try {
                await electron.transubWriteSubtitleMeta({ path: state.path, meta: doc });
            } catch (_) { /* ignore */ }
        }

        function loadMarkersFromSidecar() {
            state.markers = markersCore.extractFromSidecar(state.sidecarMeta);
            refreshMarkersUi();
        }

        function isKeptAttachedAsPair() {
            const kt = state.keptTranscript;
            if (!kt?.found || !kt.path) return false;
            if (kt.sameAsPair) return true;
            return !!(state.pairPath && pathEquals(state.pairPath, kt.path));
        }

        function refreshKeptTools() {
            const kt = state.keptTranscript;
            const available = !!(kt?.found && kt.path);
            const title = available
                ? `原始转录：${kt.path}`
                : '暂无原文缓存';
            if (els.keptDiffBtn) {
                els.keptDiffBtn.disabled = !available;
                els.keptDiffBtn.title = available
                    ? `与原文缓存对照 Diff\n${title}`
                    : '与原文缓存对照 Diff（暂无原文缓存）';
            }
            if (els.keptAttachBtn) {
                const attached = isKeptAttachedAsPair();
                const samePrimary = !!(available && kt.sameAsPrimary);
                els.keptAttachBtn.disabled = !available || samePrimary;
                els.keptAttachBtn.dataset.keptAttachMode = attached ? 'detach' : 'attach';
                if (attached) {
                    els.keptAttachBtn.innerHTML = '<i class="fa fa-unlink"></i>关闭副轨';
                    els.keptAttachBtn.title = `关闭原文缓存副轨\n${title}`;
                } else {
                    els.keptAttachBtn.innerHTML = '<i class="fa fa-link"></i>挂为副轨';
                    if (!available) {
                        els.keptAttachBtn.title = '将原文缓存挂为对照副轨（暂无原文缓存）';
                    } else if (samePrimary) {
                        els.keptAttachBtn.title = '当前文件已是原文轨';
                    } else {
                        els.keptAttachBtn.title = `将原文缓存挂为对照副轨\n${title}`;
                    }
                }
            }
        }

        function refreshKeptBadge() {
            const badge = els.keptTranscriptBadge;
            const kt = state.keptTranscript;
            if (badge) {
                if (!kt?.found || !kt.path) {
                    badge.classList.add('hidden');
                    badge.textContent = '';
                    badge.title = '';
                } else {
                    badge.classList.remove('hidden');
                    badge.textContent = `原文缓存 · ${formatDaysLeft(kt.daysLeft)}`;
                    badge.title = `原始转录：${kt.path}\n点击打开操作`;
                }
            }
            refreshKeptTools();
        }

        async function refreshKeptTranscript() {
            state.keptTranscript = {
                found: false,
                path: '',
                cues: [],
                daysLeft: null,
                pinned: false,
            };
            refreshKeptBadge();
            if (!electron?.transubFindKeptTranscript) return null;
            if (!state.path && !state.videoPath) return null;
            try {
                const res = await electron.transubFindKeptTranscript({
                    videoPath: state.videoPath || '',
                    subPath: state.path || '',
                });
                if (!res?.ok || !res.found || !res.path) {
                    refreshKeptBadge();
                    return null;
                }
                const sameAsPrimary = state.path && pathEquals(state.path, res.path);
                const sameAsPair = state.pairPath && pathEquals(state.pairPath, res.path);
                state.keptTranscript = {
                    found: true,
                    path: res.path,
                    cues: [],
                    daysLeft: res.daysLeft,
                    pinned: !!res.pinned,
                    sameAsPrimary: !!sameAsPrimary,
                    sameAsPair: !!sameAsPair,
                };
                refreshKeptBadge();
                try {
                    await electron.transubPinKeptTranscript?.({ path: res.path, hard: false });
                    state.keptTranscript.pinned = true;
                } catch (_) { /* ignore */ }
                refreshContextActionBar();
                return state.keptTranscript;
            } catch (_) {
                refreshKeptBadge();
                return null;
            }
        }

        async function loadKeptCues() {
            const kt = state.keptTranscript;
            if (!kt?.path || !electron?.transubReadSubtitle) return [];
            if (kt.cues?.length) return kt.cues;
            try {
                const doc = await electron.transubReadSubtitle({ path: kt.path });
                if (!doc?.ok) return [];
                kt.cues = Array.isArray(doc.cues) ? doc.cues : [];
                return kt.cues;
            } catch (_) {
                return [];
            }
        }

        async function attachKeptAsPairTrack() {
            const kt = state.keptTranscript;
            if (!kt?.found || !kt.path) {
                setStatus('没有可用的原文缓存', 'err');
                return false;
            }
            if (kt.sameAsPrimary) {
                setStatus('当前文件已是原文轨', 'warn');
                return false;
            }
            if (!electron?.transubReadSubtitle) return false;
            try {
                const doc = await electron.transubReadSubtitle({ path: kt.path });
                if (!doc?.ok || !doc.cues?.length) {
                    setStatus('原文缓存读取失败', 'err');
                    return false;
                }
                state.pairPath = kt.path;
                state.pairCues = doc.cues;
                state.pairFormat = doc.format || 'srt';
                state.pairHeader = Array.isArray(doc.header) ? doc.header : [];
                state.pairDirty = false;
                state.dualRole = state.dualRole === 'source' ? 'source' : 'target';
                state.dualDisplayMode = typeof loadDualDisplayMode === 'function'
                    ? loadDualDisplayMode()
                    : 'both';
                state.dualLineOrder = typeof loadDualLineOrder === 'function'
                    ? loadDualLineOrder()
                    : 'source-first';
                if (els.dualDisplaySelect) els.dualDisplaySelect.value = state.dualDisplayMode;
                if (els.dualLineOrderSelect) els.dualLineOrderSelect.value = state.dualLineOrder;
                if (typeof syncDualDisplaySelectVisibility === 'function') {
                    syncDualDisplaySelectVisibility();
                }
                kt.sameAsPair = true;
                kt.cues = doc.cues;
                renderCueList?.();
                renderDetailPane?.();
                refreshKeptTools();
                setStatus(`已挂载原文缓存为副轨：${basename(kt.path)}`, 'ok');
                return true;
            } catch (err) {
                setStatus(err?.message || '挂载原文失败', 'err');
                return false;
            }
        }

        async function detachKeptPairTrack() {
            const kt = state.keptTranscript;
            if (!isKeptAttachedAsPair()) {
                setStatus('当前没有原文缓存副轨', 'warn');
                return false;
            }
            if (state.pairDirty) {
                const ok = typeof editorConfirm === 'function'
                    ? await editorConfirm('副轨有未保存修改，关闭后将丢弃，确定继续？')
                    : true;
                if (!ok) return false;
            }
            if (typeof clearPairTrack === 'function') {
                clearPairTrack();
            } else {
                state.pairPath = '';
                state.pairCues = [];
                state.pairFormat = 'srt';
                state.pairHeader = [];
                state.pairDirty = false;
                state.dualRole = null;
                if (typeof syncDualDisplaySelectVisibility === 'function') {
                    syncDualDisplaySelectVisibility();
                }
            }
            if (kt) kt.sameAsPair = false;
            renderCueList?.();
            renderDetailPane?.();
            refreshKeptTools();
            setStatus('已关闭副轨', 'ok');
            return true;
        }

        async function toggleKeptPairTrack() {
            if (isKeptAttachedAsPair()) return detachKeptPairTrack();
            return attachKeptAsPairTrack();
        }

        async function restoreMissingFromKept(rangeStartMs, rangeEndMs) {
            const original = await loadKeptCues();
            if (!original.length) {
                setStatus('原文缓存不可用', 'err');
                return;
            }
            let start = Number(rangeStartMs);
            let end = Number(rangeEndMs);
            const selected = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : [];
            if (!Number.isFinite(start) || !Number.isFinite(end)) {
                if (selected.length) {
                    start = Math.min(...selected.map((i) => Number(state.cues[i]?.startMs) || 0));
                    end = Math.max(...selected.map((i) => cueEndMs(state.cues[i])));
                    start = Math.max(0, start - 500);
                    end += 500;
                } else {
                    start = 0;
                    end = Math.max(
                        ...original.map((c) => cueEndMs(c)),
                        ...state.cues.map((c) => cueEndMs(c)),
                        1,
                    );
                }
            }
            recordUndoBeforeChange?.();
            const res = compareCore.restoreRangeFromOriginal(state.cues, original, start, end);
            state.cues = res.cues;
            setDirty?.(true);
            renderCueList?.();
            renderDetailPane?.();
            renderTimeline?.();
            refreshCueMeta?.();
            setStatus(
                `已从原文恢复：新增 ${res.inserted} · 替换 ${res.replaced}`,
                res.inserted || res.replaced ? 'ok' : 'warn',
            );
        }

        async function showKeptDiffModal() {
            const original = await loadKeptCues();
            if (!original.length) {
                setStatus('原文缓存为空或无法读取', 'err');
                return;
            }
            const diff = compareCore.diffAgainstOriginal(state.cues, original);
            const summary = compareCore.summarizeDiff(diff);
            const missingPreview = diff.missingInCurrent.slice(0, 12).map((row) => {
                const t = compareCore.normalizeText(row.original?.text).slice(0, 48);
                const ms = Math.round(Number(row.original?.startMs) || 0);
                return `<li><code>${esc(formatMs(ms))}</code> ${esc(t || '（空）')}</li>`;
            }).join('');
            state._genericModalHandler = async (action) => {
                if (action === 'close') {
                    closePanelModal();
                    return;
                }
                if (action === 'attach') {
                    closePanelModal();
                    await attachKeptAsPairTrack();
                    return;
                }
                if (action === 'detach') {
                    closePanelModal();
                    await detachKeptPairTrack();
                    return;
                }
                if (action === 'restore-all-missing') {
                    closePanelModal();
                    await restoreMissingFromKept();
                }
            };
            const pairAction = isKeptAttachedAsPair()
                ? '<button type="button" data-kept-action="detach">关闭副轨</button>'
                : '<button type="button" data-kept-action="attach">挂为副轨</button>';
            openPanelModal('与原文缓存对照', `
                <p class="text-sm mb-2">${esc(summary)}</p>
                <p class="text-xs mb-2" style="color:var(--ed-muted)">原文 ${diff.stats.originalCount} 条 · 当前 ${diff.stats.currentCount} 条</p>
                ${missingPreview ? `<p class="text-xs font-medium mb-1">原文中有、当前缺失（部分）：</p><ul class="text-xs space-y-1 max-h-48 overflow-auto mb-3">${missingPreview}</ul>` : ''}
                <div class="editor-modal-actions">
                    <button type="button" data-kept-action="close">关闭</button>
                    ${pairAction}
                    <button type="button" class="primary" data-kept-action="restore-all-missing">恢复缺失条目</button>
                </div>
            `);
        }

        function showKeptMenu() {
            if (!state.keptTranscript?.found) return;
            state._genericModalHandler = async (action) => {
                if (action === 'close') {
                    closePanelModal();
                    return;
                }
                if (action === 'diff') {
                    closePanelModal();
                    await showKeptDiffModal();
                    return;
                }
                if (action === 'attach') {
                    closePanelModal();
                    await attachKeptAsPairTrack();
                    return;
                }
                if (action === 'detach') {
                    closePanelModal();
                    await detachKeptPairTrack();
                    return;
                }
                if (action === 'restore-sel') {
                    closePanelModal();
                    await restoreMissingFromKept();
                }
            };
            const pairAction = isKeptAttachedAsPair()
                ? '<button type="button" data-kept-action="detach">关闭副轨</button>'
                : '<button type="button" data-kept-action="attach">挂为副轨</button>';
            openPanelModal('原文缓存', `
                <p class="text-xs mb-2" style="color:var(--ed-muted)">${esc(state.keptTranscript.path)}</p>
                <p class="text-sm mb-3">保留：${esc(formatDaysLeft(state.keptTranscript.daysLeft))}</p>
                <div class="editor-modal-actions">
                    <button type="button" data-kept-action="close">关闭</button>
                    <button type="button" data-kept-action="diff">对照 Diff</button>
                    ${pairAction}
                    <button type="button" class="primary" data-kept-action="restore-sel">恢复选区/全文缺失</button>
                </div>
            `);
        }

        async function ensureSourceCuesForAi() {
            if (state.pairCues?.length) return state.pairCues;
            if (state.keptTranscript?.found) return loadKeptCues();
            return [];
        }

        function refreshListAfterMarkerChange(indexes) {
            const filter = String(state.listFilter || 'all');
            const needsRescope = filter === 'unseen'
                || filter === 'edited'
                || filter === 'approved'
                || filter === 'review-unseen'
                || filter === 'review-edited'
                || filter === 'review-approved'
                || filter === 'bookmarks';
            if (needsRescope) {
                renderCueList?.({ listOnly: true, reuseMeta: true });
                return;
            }
            if (typeof refreshListRow === 'function' && Array.isArray(indexes) && indexes.length) {
                for (const idx of indexes) refreshListRow(idx);
                return;
            }
            renderCueList?.({ listOnly: true, reuseMeta: true });
        }

        function refreshMarkersUi() {
            const ab = state.markers?.abLoop;
            const abBadge = els.abLoopBadge;
            if (abBadge) {
                if (ab && ab.enabled !== false) {
                    abBadge.classList.remove('hidden');
                    abBadge.textContent = 'A-B';
                    abBadge.title = `A-B 循环 ${formatMs(ab.aMs)} → ${formatMs(ab.bMs)}`;
                } else if (ab) {
                    abBadge.classList.remove('hidden');
                    abBadge.textContent = 'A-B 暂停';
                    abBadge.title = 'A-B 已暂停';
                } else {
                    abBadge.classList.add('hidden');
                }
            }
            if (els.abClearBtn) {
                const hasAb = !!ab;
                els.abClearBtn.classList.toggle('hidden', !hasAb);
                els.abClearBtn.disabled = !hasAb;
                els.abClearBtn.title = ab
                    ? `清除 A-B（${formatMs(ab.aMs)} → ${formatMs(ab.bMs)}）`
                    : '清除 A-B';
            }
            const bmCount = state.markers?.bookmarks?.length || 0;
            if (els.bookmarkCountBadge) {
                if (bmCount) {
                    els.bookmarkCountBadge.classList.remove('hidden');
                    els.bookmarkCountBadge.textContent = `${bmCount} 书签`;
                } else {
                    els.bookmarkCountBadge.classList.add('hidden');
                }
            }
            refreshContextActionBar();
        }

        function playheadMs() {
            const video = els.video;
            if (video && Number.isFinite(video.currentTime)) {
                return Math.round(video.currentTime * 1000);
            }
            return Number(state.playheadMs) || 0;
        }

        function toggleBookmarkAtPlayhead() {
            const t = playheadMs();
            const existing = (state.markers.bookmarks || [])
                .find((b) => Math.abs(b.timeMs - t) <= 40);
            if (existing) {
                state.markers = markersCore.removeBookmark(state.markers, existing.id);
                setStatus('已移除书签', 'ok');
            } else {
                const up = markersCore.upsertBookmark(state.markers, t, '');
                state.markers = up.doc;
                setStatus(`已添加书签 ${formatMs(t)}`, 'ok');
            }
            refreshMarkersUi();
            void persistMarkers();
            renderTimeline?.();
            if (state.listFilter === 'bookmarks') {
                refreshListAfterMarkerChange([]);
            }
        }

        function setAbPoint(which) {
            const t = playheadMs();
            if (which === 'a') {
                const bMs = state._pendingAbPoint?.bMs ?? state.markers?.abLoop?.bMs;
                state._pendingAbPoint = { aMs: t, bMs: bMs ?? null };
                if (bMs != null && bMs > t) {
                    state.markers = markersCore.setAbLoop(state.markers, t, bMs, true);
                    state._pendingAbPoint = null;
                    setStatus('A-B 循环已启用', 'ok');
                    refreshMarkersUi();
                    void persistMarkers();
                    renderTimeline?.();
                    return;
                }
                setStatus(`已设 A 点 ${formatMs(t)}，再设 B 点`, 'ok');
                return;
            }
            const aMs = state._pendingAbPoint?.aMs ?? state.markers?.abLoop?.aMs;
            if (aMs == null) {
                state._pendingAbPoint = { aMs: null, bMs: t };
                setStatus(`已设 B 点 ${formatMs(t)}，请再设 A 点`, 'warn');
                return;
            }
            state.markers = markersCore.setAbLoop(state.markers, aMs, t, true);
            state._pendingAbPoint = null;
            setStatus('A-B 循环已启用', 'ok');
            refreshMarkersUi();
            void persistMarkers();
            renderTimeline?.();
        }

        function clearOrToggleAb() {
            if (!state.markers?.abLoop) {
                setStatus('尚未设置 A-B', 'warn');
                return;
            }
            if (state.markers.abLoop.enabled !== false) {
                state.markers = markersCore.toggleAbEnabled(state.markers, false);
                setStatus('A-B 已暂停', 'ok');
            } else {
                state.markers = markersCore.clearAbLoop(state.markers);
                setStatus('已清除 A-B', 'ok');
            }
            refreshMarkersUi();
            void persistMarkers();
            renderTimeline?.();
        }

        function clearAbLoopNow() {
            if (!state.markers?.abLoop) {
                setStatus('尚未设置 A-B', 'warn');
                return;
            }
            state.markers = markersCore.clearAbLoop(state.markers);
            state._pendingAbPoint = null;
            setStatus('已清除 A-B', 'ok');
            refreshMarkersUi();
            void persistMarkers();
            renderTimeline?.();
        }

        function removeBookmarksForCueIndexes(indexes) {
            const idxList = Array.isArray(indexes) ? indexes : [];
            if (!idxList.length) {
                setStatus('请先选中字幕', 'warn');
                return 0;
            }
            const result = markersCore.removeBookmarksCoveringIndexes(
                state.cues,
                state.markers,
                idxList,
                { padMs: 80 },
            );
            if (!result.removed) {
                setStatus('选中字幕未覆盖书签', 'warn');
                return 0;
            }
            state.markers = result.doc;
            setStatus(`已移除 ${result.removed} 个书签`, 'ok');
            refreshMarkersUi();
            void persistMarkers();
            renderTimeline?.();
            refreshListAfterMarkerChange(idxList);
            return result.removed;
        }

        function removeBookmarksForSelectedCues() {
            const selected = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : [];
            return removeBookmarksForCueIndexes(selected);
        }

        function cueCoversBookmark(index) {
            const covering = markersCore.bookmarksCoveringIndexes(
                state.cues,
                state.markers,
                [index],
                { padMs: 80 },
            );
            return covering.length > 0;
        }

        function tickAbLoop(currentMs) {
            const seekTo = markersCore.abLoopSeekTarget(
                state.markers?.abLoop,
                currentMs,
                state._abPrevMs,
            );
            state._abPrevMs = currentMs;
            if (seekTo == null || !els.video) return;
            try {
                els.video.currentTime = seekTo / 1000;
            } catch (_) { /* ignore */ }
        }

        function setSelectedReviewStatus(status) {
            const indexes = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : (state.selectedIndex >= 0 ? [state.selectedIndex] : []);
            if (!indexes.length) {
                setStatus('请先选择字幕', 'err');
                return;
            }
            for (const idx of indexes) {
                const cue = state.cues[idx];
                if (!cue) continue;
                const key = markersCore.cueMarkerKey(cue, idx);
                state.markers = markersCore.setCueMarker(state.markers, key, {
                    reviewStatus: status,
                });
            }
            refreshMarkersUi();
            refreshListAfterMarkerChange(indexes);
            void persistMarkers();
            setStatus(`已标记为「${markersCore.reviewStatusLabel(status)}」×${indexes.length}`, 'ok');
        }

        async function applyAssStyleToSelected() {
            const indexes = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : (state.selectedIndex >= 0 ? [state.selectedIndex] : []);
            if (!indexes.length) {
                setStatus('请先选择字幕', 'err');
                return;
            }
            const ui = typeof getAssStylesUi === 'function' ? getAssStylesUi() : null;
            if (!ui?.listStyleNames || !ui?.applyStyleByName) {
                setStatus('ASS 样式模块未加载', 'err');
                return;
            }
            const names = ui.listStyleNames();
            if (!names.length) {
                await ui.openModal?.({ tab: 'styles' });
                setStatus('请先在 ASS 样式面板创建样式', 'info');
                return;
            }
            if (names.length === 1) {
                const applied = ui.applyStyleByName(names[0], indexes);
                setStatus(`已将 ${applied.changed} 条套用为 ${applied.styleName}`, 'ok');
                return;
            }
            if (typeof editorChoice === 'function') {
                const buttons = names.slice(0, 8);
                buttons.push('打开样式面板…');
                const pick = await editorChoice('为选中字幕选择 ASS Style', {
                    title: '应用 ASS 样式',
                    buttons,
                    cancelId: buttons.length - 1,
                });
                if (pick < 0) return;
                if (pick >= names.length || pick === buttons.length - 1) {
                    await ui.openModal?.({ tab: 'styles' });
                    return;
                }
                const applied = ui.applyStyleByName(names[pick], indexes);
                setStatus(`已将 ${applied.changed} 条套用为 ${applied.styleName}`, 'ok');
                return;
            }
            await ui.openModal?.({ tab: 'styles' });
        }

        async function assignSpeakerToSelected() {
            const indexes = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : (state.selectedIndex >= 0 ? [state.selectedIndex] : []);
            if (!indexes.length) {
                setStatus('请先选择字幕', 'err');
                return;
            }
            const ui = typeof getAssStylesUi === 'function' ? getAssStylesUi() : null;
            if (!ui?.openSpeakerMap) {
                setStatus('ASS 样式模块未加载', 'err');
                return;
            }
            let speakers = typeof ui.listSpeakers === 'function' ? ui.listSpeakers() : [];
            if (!speakers.length) {
                await ui.openSpeakerMap();
                setStatus('请先在说话人面板添加说话人', 'info');
                return;
            }
            if (typeof editorChoice === 'function') {
                const buttons = speakers.slice(0, 8).map((s) => s.name);
                buttons.push('清除说话人');
                buttons.push('打开说话人面板…');
                const pick = await editorChoice('为选中字幕指定说话人', {
                    title: '指定说话人',
                    buttons,
                    cancelId: buttons.length - 1,
                });
                if (pick < 0) return;
                if (pick === speakers.length) {
                    ui.clearSpeakerFromSelection?.();
                    return;
                }
                if (pick > speakers.length || pick === buttons.length - 1) {
                    await ui.openSpeakerMap();
                    return;
                }
                ui.assignSpeakerToSelection?.(speakers[pick].id);
                return;
            }
            await ui.openSpeakerMap();
        }

        function buildExportChecklistReport() {
            const low = (state.cueMeta || []).filter((m) => m?.low).length;
            const stylesCore = global.TransubAssStyles;
            const overrideCore = global.TransubAssOverride;
            let assFontItems = [];
            if (stylesCore?.parseStylesFromHeader && overrideCore?.buildFontChecklistItems) {
                const styles = stylesCore.parseStylesFromHeader(state.header || []).styles || [];
                let availableFonts = Array.isArray(state.systemFonts) ? state.systemFonts : null;
                assFontItems = overrideCore.buildFontChecklistItems({ styles, availableFonts });
            }
            return checklistCore.buildExportChecklist({
                cues: state.cues,
                qcResult: state.lastQcResult || null,
                markersDoc: state.markers,
                hasVideo: !!state.videoPath,
                hasDualPair: typeof hasDualPair === 'function' ? hasDualPair() : false,
                dualMerged: false,
                lowConfCount: low,
                keptTranscript: state.keptTranscript?.found
                    ? { path: state.keptTranscript.path, daysLeft: state.keptTranscript.daysLeft }
                    : null,
                proExtras: true,
                lastSemanticReview: state.lastSemanticReview || null,
                assExportAvailable: true,
                hasAssDualPair: typeof hasDualPair === 'function' ? hasDualPair() : false,
                assFontItems,
            });
        }

        function showExportChecklistModal() {
            const report = buildExportChecklistReport();
            const rows = report.items.map((item) => {
                const color = item.severity === 'warn'
                    ? 'var(--ed-warn-text)'
                    : (item.severity === 'info' ? 'var(--ed-muted)' : 'var(--ed-ok)');
                return `<li style="color:${color}"><strong>${esc(item.label)}</strong> — ${esc(item.detail)}</li>`;
            }).join('');
            const canSemantic = !!(state.pairCues?.length || state.keptTranscript?.found);
            const proActions = [];
            if (canSemantic) {
                proActions.push('<button type="button" data-kept-action="run-semantic">语义审阅 ◆</button>');
            }
            proActions.push('<button type="button" data-kept-action="export-ass">导出 ASS ◆</button>');
            state._genericModalHandler = (action) => {
                if (action === 'close') {
                    closePanelModal();
                    return;
                }
                if (action === 'run-semantic') {
                    closePanelModal();
                    void runSemanticBilingualReview?.();
                    return;
                }
                if (action === 'export-ass') {
                    closePanelModal();
                    void exportAssDocument?.();
                }
            };
            openPanelModal(`导出前检查 · ${report.summary}`, `
                <ul class="text-sm space-y-1 mb-3">${rows}</ul>
                <div class="editor-modal-actions">
                    ${proActions.join('')}
                    <button type="button" class="primary" data-kept-action="close">关闭</button>
                </div>
            `);
        }

        function collectSelectedQcTypes() {
            const selected = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : [];
            const types = new Set();
            const issues = state.lastQcResult?.issues || [];
            if (!selected.length || !issues.length) return types;
            const byIndex = new Map();
            for (const issue of issues) {
                if (Number.isInteger(issue?.index)) byIndex.set(issue.index, issue);
            }
            for (const idx of selected) {
                const hit = byIndex.get(idx);
                for (const t of (hit?.types || [])) types.add(t);
            }
            return types;
        }

        /** @type {string[]} */
        let ctxBarItemHtml = [];
        /** @type {ResizeObserver | null} */
        let ctxBarRo = null;
        let ctxBarLayoutRaf = 0;

        function buildContextActionItemHtml() {
            const selected = typeof getSelectedCueIndexes === 'function'
                ? getSelectedCueIndexes()
                : [];
            const qcCount = state.qcIssueIndexes?.length
                || state.qcHitSet?.size
                || 0;
            const hasSel = selected.length > 0;
            const hasQc = qcCount > 0;
            const hasBookmarks = (state.markers?.bookmarks || []).length > 0;
            const canSemantic = !!(state.pairCues?.length || state.keptTranscript?.found);

            /** @type {string[]} */
            const qcGroup = [];
            /** @type {string[]} */
            const reviewGroup = [];
            /** @type {string[]} */
            const aiGroup = [];

            // 「下一条问题」已在上方筛选栏，此处不重复
            if (hasQc) {
                qcGroup.push('<button type="button" class="ed-ctx-action" data-ctx="fix-overlap">拉开重叠</button>');
            }
            const qcTypes = collectSelectedQcTypes();
            if (hasSel && (qcTypes.has('high_cps') || qcTypes.has('splittable') || qcTypes.has('long'))) {
                qcGroup.push('<button type="button" class="ed-ctx-action" data-ctx="smart-split">智能断句</button>');
            }
            if (hasSel && (qcTypes.has('high_cps') || qcTypes.has('repetition')) && qcCore?.applyQcFixes) {
                qcGroup.push('<button type="button" class="ed-ctx-action" data-ctx="fix-cps">修读速</button>');
            }

            const bookmarkFilterOn = state.listFilter === 'bookmarks';
            const selectedCoversBm = hasSel && markersCore.bookmarksCoveringIndexes(
                state.cues,
                state.markers,
                selected,
                { padMs: 80 },
            ).length > 0;
            if (hasSel && (bookmarkFilterOn || selectedCoversBm)) {
                reviewGroup.push('<button type="button" class="ed-ctx-action" data-ctx="remove-bookmark" title="移除选中字幕覆盖的书签">移除书签</button>');
            }
            if (hasSel) {
                reviewGroup.push('<button type="button" class="ed-ctx-action" data-ctx="review-approved">标为已通过</button>');
                reviewGroup.push('<button type="button" class="ed-ctx-action" data-ctx="review-edited">标为已改</button>');
                reviewGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="ass-style" title="Pro：为选中字幕套用 ASS Style">◆ ASS 样式</button>');
                reviewGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="ass-speaker" title="Pro：为选中字幕指定说话人">◆ 说话人</button>');
                aiGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="ctx-reconstruct" title="Pro：语境重构选中条">◆ 语境重构</button>');
                aiGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="smart-translate" title="Pro：智能翻译选中条（专训句级 + 剧情贴合润色）">◆ 智能翻译</button>');
            }
            if (hasBookmarks) {
                aiGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="bm-reconstruct" title="Pro：仅重构覆盖书签的字幕">◆ 书签段重构</button>');
            }
            if (canSemantic) {
                aiGroup.push('<button type="button" class="ed-ctx-action is-pro" data-ctx="semantic-review" title="Pro：LLM 语义审阅">◆ 语义审阅</button>');
            }
            if (state.keptTranscript?.found) {
                reviewGroup.push('<button type="button" class="ed-ctx-action" data-ctx="kept-restore">从原文恢复</button>');
            }

            /** @type {string[]} */
            const items = [];
            const pushGroup = (group) => {
                if (!group.length) return;
                if (items.length) items.push('<span class="ed-ctx-sep" role="separator"></span>');
                items.push(...group);
            };
            pushGroup(qcGroup);
            pushGroup(reviewGroup);
            pushGroup(aiGroup);
            return items;
        }

        function layoutContextActionBar() {
            const bar = els.contextActionBar;
            if (!bar || bar.classList.contains('hidden')) return;
            if (!ctxBarItemHtml.length) return;

            const primary = bar.querySelector('.editor-context-action-primary');
            const moreWrap = bar.querySelector('.editor-ctx-more-wrap');
            const dropdown = moreWrap?.querySelector('.editor-dropdown');
            let measure = bar.querySelector('.editor-context-action-measure');
            if (!primary || !moreWrap || !dropdown) return;

            if (!measure) {
                measure = document.createElement('div');
                measure.className = 'editor-context-action-measure';
                measure.setAttribute('aria-hidden', 'true');
                bar.appendChild(measure);
            }
            measure.innerHTML = ctxBarItemHtml.join('');

            const gap = 4;
            const barGap = 4;
            const cs = getComputedStyle(bar);
            const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
            const avail = Math.max(0, bar.clientWidth - pad);
            if (avail <= 0) return;

            moreWrap.classList.remove('hidden');
            moreWrap.style.visibility = 'hidden';
            const moreW = Math.ceil(moreWrap.getBoundingClientRect().width) || 52;
            moreWrap.style.visibility = '';
            moreWrap.classList.add('hidden');

            const nodes = [...measure.children];
            const widths = nodes.map((n) => Math.ceil(n.getBoundingClientRect().width));

            const spanWidth = (from, to) => {
                let w = 0;
                for (let i = from; i < to; i += 1) {
                    if (i > from) w += gap;
                    w += widths[i] || 0;
                }
                return w;
            };

            const allW = spanWidth(0, nodes.length);
            if (allW <= avail) {
                primary.innerHTML = ctxBarItemHtml.join('');
                dropdown.innerHTML = '';
                moreWrap.classList.add('hidden');
                measure.innerHTML = '';
                return;
            }

            const budget = Math.max(0, avail - moreW - barGap);
            let cut = 0;
            for (let end = 1; end <= nodes.length; end += 1) {
                let trim = end;
                while (trim > 0 && nodes[trim - 1]?.classList?.contains('ed-ctx-sep')) trim -= 1;
                if (trim <= 0) continue;
                if (spanWidth(0, trim) <= budget) cut = trim;
                else break;
            }

            /** @type {string[]} */
            const shown = [];
            /** @type {string[]} */
            const overflow = [];
            for (let i = 0; i < nodes.length; i += 1) {
                const html = nodes[i].outerHTML;
                if (i < cut) shown.push(html);
                else if (nodes[i].matches?.('[data-ctx]')) overflow.push(html);
            }
            while (shown.length && shown[shown.length - 1].includes('ed-ctx-sep')) shown.pop();

            primary.innerHTML = shown.join('');
            dropdown.innerHTML = overflow.join('');
            moreWrap.classList.toggle('hidden', overflow.length === 0);
            measure.innerHTML = '';
        }

        function scheduleContextActionBarLayout() {
            if (ctxBarLayoutRaf) cancelAnimationFrame(ctxBarLayoutRaf);
            ctxBarLayoutRaf = requestAnimationFrame(() => {
                ctxBarLayoutRaf = 0;
                layoutContextActionBar();
            });
        }

        function ensureContextActionBarObserver() {
            const bar = els.contextActionBar;
            if (!bar || ctxBarRo || typeof ResizeObserver !== 'function') return;
            ctxBarRo = new ResizeObserver(() => scheduleContextActionBarLayout());
            ctxBarRo.observe(bar);
        }

        function refreshContextActionBar() {
            const bar = els.contextActionBar;
            if (!bar) return;
            ctxBarItemHtml = buildContextActionItemHtml();
            if (!ctxBarItemHtml.some((html) => html.includes('data-ctx='))) {
                bar.classList.add('hidden');
                bar.innerHTML = '';
                ctxBarItemHtml = [];
                return;
            }
            bar.classList.remove('hidden');
            bar.innerHTML = ''
                + '<div class="editor-context-action-primary"></div>'
                + '<div class="editor-menu-wrap editor-ctx-more-wrap hidden">'
                + '<button type="button" class="ed-ctx-more-btn" data-dd-trigger="ctx-more" aria-haspopup="true" aria-expanded="false">更多 <i class="fa fa-caret-down" aria-hidden="true"></i></button>'
                + '<div class="editor-dropdown hidden" role="menu" aria-label="更多情境操作"></div>'
                + '</div>'
                + '<div class="editor-context-action-measure" aria-hidden="true"></div>';
            ensureContextActionBarObserver();
            scheduleContextActionBarLayout();
        }

        function getCueMarkerForIndex(index) {
            const cue = state.cues[index];
            if (!cue) return null;
            return markersCore.getCueMarker(state.markers, markersCore.cueMarkerKey(cue, index));
        }

        let uiBound = false;
        function bindUi() {
            if (uiBound) return;
            uiBound = true;
            els.contextActionBar?.addEventListener('click', (e) => {
                const moreTrigger = e.target.closest('[data-dd-trigger="ctx-more"]');
                if (moreTrigger && els.contextActionBar.contains(moreTrigger)) {
                    e.stopPropagation();
                    const wrap = moreTrigger.closest('.editor-menu-wrap');
                    const menu = wrap?.querySelector('.editor-dropdown');
                    if (!menu) return;
                    const wasHidden = menu.classList.contains('hidden');
                    document.querySelectorAll('.editor-dropdown').forEach((m) => {
                        m.classList.add('hidden');
                        m.closest('.editor-menu-wrap')
                            ?.querySelector('[aria-haspopup="true"], [data-dd-trigger]')
                            ?.setAttribute('aria-expanded', 'false');
                    });
                    if (wasHidden) {
                        menu.classList.remove('hidden');
                        moreTrigger.setAttribute('aria-expanded', 'true');
                    }
                    return;
                }
                const btn = e.target.closest('[data-ctx]');
                if (!btn || !els.contextActionBar.contains(btn)) return;
                const action = btn.getAttribute('data-ctx');
                const closeCtxMenus = () => {
                    els.contextActionBar?.querySelectorAll('.editor-dropdown').forEach((m) => {
                        m.classList.add('hidden');
                    });
                    els.contextActionBar?.querySelectorAll('[data-dd-trigger]').forEach((t) => {
                        t.setAttribute('aria-expanded', 'false');
                    });
                };
                if (action === 'fix-overlap' && qcCore?.applyQcFixes) {
                    recordUndoBeforeChange?.();
                    const fix = qcCore.applyQcFixes(state.cues, {
                        fixOverlap: true,
                        fixCpsBySplit: false,
                        enforceMaxDur: false,
                    });
                    state.cues = fix.cues;
                    setDirty?.(true);
                    renderCueList?.();
                    setStatus(fix.summary || '已处理重叠', 'ok');
                    closeCtxMenus();
                    return;
                }
                if (action === 'fix-cps' && qcCore?.applyQcFixes) {
                    recordUndoBeforeChange?.();
                    const fix = qcCore.applyQcFixes(state.cues, {
                        fixOverlap: false,
                        fixCpsBySplit: true,
                        fixCpsByExtend: true,
                        compressRepetition: true,
                        enforceMaxDur: false,
                    });
                    state.cues = fix.cues;
                    setDirty?.(true);
                    renderCueList?.();
                    setStatus(fix.summary || '已处理读速/叠词', 'ok');
                    closeCtxMenus();
                    return;
                }
                if (action === 'smart-split') {
                    openSmartSplitModal?.();
                    closeCtxMenus();
                    return;
                }
                if (action === 'review-approved') {
                    setSelectedReviewStatus('approved');
                    closeCtxMenus();
                    return;
                }
                if (action === 'review-edited') {
                    setSelectedReviewStatus('edited');
                    closeCtxMenus();
                    return;
                }
                if (action === 'remove-bookmark') {
                    removeBookmarksForSelectedCues();
                    closeCtxMenus();
                    return;
                }
                if (action === 'ass-style') {
                    void applyAssStyleToSelected();
                    closeCtxMenus();
                    return;
                }
                if (action === 'ass-speaker') {
                    void assignSpeakerToSelected();
                    closeCtxMenus();
                    return;
                }
                if (action === 'kept-restore') {
                    void restoreMissingFromKept();
                    closeCtxMenus();
                    return;
                }
                if (action === 'ctx-reconstruct') {
                    void startContextReconstruct?.({ mode: 'basic' });
                    closeCtxMenus();
                    return;
                }
                if (action === 'smart-translate') {
                    void startTextTranslate?.({ engine: 'smart', forceSelected: true });
                    closeCtxMenus();
                    return;
                }
                if (action === 'bm-reconstruct') {
                    void startContextReconstruct?.({ mode: 'basic', scope: 'bookmarks' });
                    closeCtxMenus();
                    return;
                }
                if (action === 'semantic-review') {
                    void runSemanticBilingualReview?.();
                    closeCtxMenus();
                }
            });

            els.keptTranscriptBadge?.addEventListener('click', () => showKeptMenu());
            els.keptDiffBtn?.addEventListener('click', () => {
                void showKeptDiffModal();
            });
            els.keptAttachBtn?.addEventListener('click', () => {
                void toggleKeptPairTrack();
            });
            els.abLoopBadge?.addEventListener('click', () => clearOrToggleAb());
            els.bookmarkCountBadge?.addEventListener('click', () => {
                const list = state.markers?.bookmarks || [];
                if (!list.length) return;
                const items = list.map((b) => `
                    <button type="button" class="ed-btn-block" data-kept-action="goto-bm" data-bm="${esc(b.id)}">
                        ${esc(formatMs(b.timeMs))}${b.label ? ` · ${esc(b.label)}` : ''}
                    </button>
                `).join('');
                state._genericModalHandler = (action, ev) => {
                    if (action === 'close') {
                        closePanelModal();
                        return;
                    }
                    if (action === 'goto-bm') {
                        const id = ev?.target?.closest?.('[data-bm]')?.getAttribute('data-bm');
                        const hit = list.find((b) => b.id === id);
                        if (hit && els.video) {
                            try { els.video.currentTime = hit.timeMs / 1000; } catch (_) { /* ignore */ }
                        }
                        closePanelModal();
                    }
                };
                openPanelModal('书签', `
                    <div class="max-h-64 overflow-auto mb-2 space-y-1">${items}</div>
                    <div class="editor-modal-actions">
                        <button type="button" data-kept-action="close">关闭</button>
                    </div>
                `);
            });

            els.genericModal?.addEventListener('click', (e) => {
                if (e.target.closest('[data-kept-dismiss]')) {
                    closePanelModal();
                    return;
                }
                const btn = e.target.closest('[data-kept-action]');
                if (!btn) return;
                const action = btn.getAttribute('data-kept-action');
                const handler = state._genericModalHandler;
                if (typeof handler === 'function') {
                    void handler(action, e);
                } else if (action === 'close') {
                    closePanelModal();
                }
            });

            els.bookmarkBtn?.addEventListener('click', () => toggleBookmarkAtPlayhead());
            els.abSetABtn?.addEventListener('click', () => setAbPoint('a'));
            els.abSetBBtn?.addEventListener('click', () => setAbPoint('b'));
            els.abClearBtn?.addEventListener('click', () => clearAbLoopNow());
            els.exportChecklistBtn?.addEventListener('click', () => showExportChecklistModal());

            els.cueBody?.addEventListener('click', (e) => {
                const rm = e.target.closest?.('[data-remove-bm]');
                if (!rm || !els.cueBody.contains(rm)) return;
                e.preventDefault();
                e.stopPropagation();
                const idx = Number(rm.getAttribute('data-remove-bm'));
                if (!Number.isInteger(idx)) return;
                removeBookmarksForCueIndexes([idx]);
            });
        }

        return {
            bindUi,
            refreshKeptTranscript,
            loadKeptCues,
            attachKeptAsPairTrack,
            detachKeptPairTrack,
            toggleKeptPairTrack,
            showKeptDiffModal,
            restoreMissingFromKept,
            ensureSourceCuesForAi,
            loadMarkersFromSidecar,
            persistMarkers,
            toggleBookmarkAtPlayhead,
            setAbPoint,
            clearOrToggleAb,
            clearAbLoopNow,
            removeBookmarksForCueIndexes,
            removeBookmarksForSelectedCues,
            cueCoversBookmark,
            tickAbLoop,
            setSelectedReviewStatus,
            buildExportChecklistReport,
            showExportChecklistModal,
            refreshContextActionBar,
            refreshMarkersUi,
            getCueMarkerForIndex,
            markersCore,
            compareCore,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installKeptAndMarkers = installKeptAndMarkers;
}(typeof globalThis !== 'undefined' ? globalThis : window));
