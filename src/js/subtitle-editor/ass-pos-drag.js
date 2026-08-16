/**
 * Drag / nudge / snap ASS subtitle position on the video preview → {\pos(x,y)}
 */
(function (global) {
    function installAssPosDrag(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installAssPosDrag(ctx): ctx.state, ctx.els required');
        }
        const core = ctx.assOverrideCore || global.TransubAssOverride;
        const stylesCore = ctx.assStylesCore || global.TransubAssStyles;
        if (!core?.clientPointToPlayRes || !core?.posCommand) {
            throw new Error('installAssPosDrag: TransubAssOverride pos helpers required');
        }

        const {
            state,
            els,
            setStatus,
            recordUndoBeforeChange,
            setDirty,
            syncDetailToCue,
            renderCueList,
            renderDetailPane,
            refreshOverlay,
        } = ctx;

        let bound = false;
        let dragging = false;
        let dragCueIndex = -1;
        let lastPos = null;
        let pointerId = null;
        let readoutSyncing = false;
        let lastSyncKey = '';
        let stylesCacheKey = '';
        let stylesCache = null;
        let nudgeUndoAt = 0;
        let nudgeUndoIndex = -1;
        let heavyUiTimer = null;
        let dragMoveRaf = 0;
        let pendingDragMapped = null;

        const NUDGE_UNDO_MS = 900;
        const HEAVY_UI_MS = 90;

        function isAssContext() {
            if (typeof ctx.isAssContext === 'function') return !!ctx.isAssContext();
            const fmt = String(state.format || '').toLowerCase();
            return fmt === 'ass' || fmt === 'ssa' || !!state.showAssStyleColumn;
        }

        /** Prefer selected cue for edits; fall back to playing cue. */
        function activeCueIndex() {
            if (state.selectedIndex >= 0 && state.selectedIndex < state.cues.length) {
                return state.selectedIndex;
            }
            if (state.playbackIndex >= 0 && state.playbackIndex < state.cues.length) {
                return state.playbackIndex;
            }
            return -1;
        }

        function cachedStyles() {
            if (!stylesCore?.parseStylesFromHeader) return [];
            const header = Array.isArray(state.header) ? state.header : [];
            const key = `${header.length}:${header[0] || ''}:${header[header.length - 1] || ''}`;
            // Header array identity + length is enough for editor sessions; rebuild on replace.
            if (stylesCache && stylesCacheKey === key && stylesCache._headerRef === header) {
                return stylesCache.styles;
            }
            const styles = stylesCore.parseStylesFromHeader(header).styles || [];
            stylesCache = { styles, _headerRef: header };
            stylesCacheKey = key;
            return styles;
        }

        function lookupStyle(styleName) {
            const styles = cachedStyles();
            const want = String(styleName || 'Default').toLowerCase();
            return styles.find((s) => String(s.name || '').toLowerCase() === want) || styles[0] || null;
        }

        function playRes() {
            return core.parsePlayResFromHeader(state.header, 1920, 1080);
        }

        function resolvePosForIndex(index) {
            const cue = state.cues[index];
            if (!cue) return null;
            const { playResX, playResY } = playRes();
            const style = lookupStyle(cue.ass?.style || 'Default');
            return {
                ...core.resolveCuePos(cue.text || '', style, playResX, playResY),
                playResX,
                playResY,
            };
        }

        function setHandleVisible(on) {
            const handle = els.assPosHandle;
            const hint = els.assPosHint;
            if (handle) handle.classList.toggle('hidden', !on);
            if (hint) hint.classList.toggle('hidden', !on);
            els.videoFrame?.classList.toggle('ass-pos-drag-ready', !!on);
            els.detailAssPosWrap?.classList.toggle('hidden', !isAssContext());
        }

        function placeHandleAtPlayRes(x, y, playResX, playResY) {
            const handle = els.assPosHandle;
            const video = els.video;
            if (!handle || !video) return null;
            const pt = core.playResToClientPoint(x, y, video, playResX, playResY);
            const frame = els.videoFrame?.getBoundingClientRect?.();
            if (!pt || !frame) return null;
            const left = pt.clientX - frame.left;
            const top = pt.clientY - frame.top;
            handle.style.left = `${left}px`;
            handle.style.top = `${top}px`;
            handle.dataset.posX = String(x);
            handle.dataset.posY = String(y);
            return { left, top, frame, pt };
        }

        function applyApproxCssPos(x, y, playResX, playResY) {
            const wrap = els.videoSubtitle;
            if (!wrap) return;
            // Match handle: PlayRes → video content box → frame-local px (letterbox-safe).
            const placed = placeHandleAtPlayRes(x, y, playResX, playResY);
            if (!placed) return;
            wrap.classList.add('ass-pos-dragging');
            wrap.style.left = `${placed.left}px`;
            wrap.style.right = 'auto';
            wrap.style.top = `${placed.top}px`;
            wrap.style.bottom = 'auto';
            wrap.style.transform = 'translate(-50%, -50%)';
            wrap.style.alignItems = 'center';
        }

        function clearApproxCssPos() {
            const wrap = els.videoSubtitle;
            if (!wrap) return;
            wrap.classList.remove('ass-pos-dragging', 'ass-pos-placed');
            wrap.style.left = '';
            wrap.style.right = '';
            wrap.style.top = '';
            wrap.style.bottom = '';
            wrap.style.transform = '';
            wrap.style.alignItems = '';
        }

        function syncPosReadout(pos) {
            const wrap = els.detailAssPosWrap;
            if (wrap) wrap.classList.toggle('hidden', !isAssContext());
            const xEl = els.detailAssPosX;
            const yEl = els.detailAssPosY;
            const label = els.detailAssPosLabel;
            if (!xEl && !yEl && !label) return;
            const active = document.activeElement;
            const editing = active === xEl || active === yEl;
            if (editing && !readoutSyncing) return;
            readoutSyncing = true;
            try {
                if (!pos) {
                    if (xEl) xEl.value = '';
                    if (yEl) yEl.value = '';
                    if (label) label.textContent = 'pos —';
                    return;
                }
                if (xEl) xEl.value = String(pos.x);
                if (yEl) yEl.value = String(pos.y);
                if (label) {
                    label.textContent = pos.fromOverride
                        ? `{\\pos(${pos.x},${pos.y})}`
                        : `≈ (${pos.x},${pos.y})`;
                    label.title = pos.fromOverride
                        ? '当前行内 {\\pos}'
                        : '由 Style 对齐推算；拖动或应用后会写入 {\\pos}';
                }
            } finally {
                readoutSyncing = false;
            }
        }

        function syncHandle(force) {
            if (dragging && !force) return;
            if (!isAssContext() || !els.video || els.video.classList.contains('hidden')) {
                if (lastSyncKey !== 'off') {
                    lastSyncKey = 'off';
                    setHandleVisible(false);
                    syncPosReadout(null);
                }
                return;
            }
            if (els.videoEmpty?.classList?.contains('visible') && !(Number(els.video.videoWidth) > 0)) {
                if (lastSyncKey !== 'empty') {
                    lastSyncKey = 'empty';
                    setHandleVisible(false);
                    syncPosReadout(null);
                }
                return;
            }
            const idx = activeCueIndex();
            if (idx < 0) {
                if (lastSyncKey !== 'none') {
                    lastSyncKey = 'none';
                    setHandleVisible(false);
                    syncPosReadout(null);
                }
                return;
            }
            const pos = resolvePosForIndex(idx);
            if (!pos) {
                setHandleVisible(false);
                syncPosReadout(null);
                return;
            }
            const key = `${idx}:${pos.x}:${pos.y}:${pos.fromOverride ? 1 : 0}:${pos.playResX}x${pos.playResY}`;
            if (!force && key === lastSyncKey) {
                // Still reposition handle if layout may have changed (resize uses force/resize listener).
                return;
            }
            lastSyncKey = key;
            setHandleVisible(true);
            placeHandleAtPlayRes(pos.x, pos.y, pos.playResX, pos.playResY);
            syncPosReadout(pos);
            if (els.assPosHandle) {
                els.assPosHandle.title = pos.fromOverride
                    ? `{\\pos(${pos.x},${pos.y})} — 拖动 / 方向键微调`
                    : `默认位置 ≈ (${pos.x},${pos.y}) — 拖动写入 {\\pos}`;
            }
        }

        function flushHeavyUi(opts = {}) {
            if (heavyUiTimer) {
                clearTimeout(heavyUiTimer);
                heavyUiTimer = null;
            }
            if (opts.list !== false) renderCueList?.({ listOnly: true, reuseMeta: true });
            if (opts.detail !== false) renderDetailPane?.();
            if (opts.overlay !== false) refreshOverlay?.(true);
            if (opts.notify !== false) ctx.onPosCommitted?.(opts.payload || {});
        }

        function scheduleHeavyUi(payload) {
            if (heavyUiTimer) clearTimeout(heavyUiTimer);
            heavyUiTimer = setTimeout(() => {
                heavyUiTimer = null;
                flushHeavyUi({ payload });
            }, HEAVY_UI_MS);
        }

        function shouldRecordUndo(reason, index) {
            if (reason !== 'ass-pos-nudge') {
                nudgeUndoAt = 0;
                nudgeUndoIndex = -1;
                return true;
            }
            const now = Date.now();
            if (index !== nudgeUndoIndex || now - nudgeUndoAt > NUDGE_UNDO_MS) {
                nudgeUndoAt = now;
                nudgeUndoIndex = index;
                return true;
            }
            return false;
        }

        function commitPos(index, x, y, reason = 'ass-pos-drag') {
            const idx = Math.round(Number(index));
            if (!Number.isInteger(idx) || idx < 0 || idx >= state.cues.length) return false;
            const cue = state.cues[idx];
            if (!cue) return false;
            const { playResX, playResY } = playRes();
            const clamped = core.clampPosToPlayRes
                ? core.clampPosToPlayRes(x, y, playResX, playResY)
                : { x: Math.round(x), y: Math.round(y) };
            const cmd = core.posCommand(clamped.x, clamped.y);
            // Only this cue index — never broadcast detail textarea / Style to other lines.
            const nextText = core.setLeadingOverride(String(cue.text || ''), cmd);
            if (nextText === String(cue.text || '')) return false;
            if (shouldRecordUndo(reason, idx)) {
                recordUndoBeforeChange?.(reason);
            }
            state.cues[idx] = { ...cue, text: nextText };
            if (state.selectedIndex === idx && els.detailText && !state.detailSyncing) {
                els.detailText.value = nextText;
            }
            setDirty?.(true);
            lastSyncKey = '';
            clearApproxCssPos();
            placeHandleAtPlayRes(clamped.x, clamped.y, playResX, playResY);
            syncPosReadout({ x: clamped.x, y: clamped.y, fromOverride: true, playResX, playResY });

            const payload = { index: idx, x: clamped.x, y: clamped.y, reason };
            if (reason === 'ass-pos-nudge') {
                scheduleHeavyUi(payload);
                setStatus?.(`{\\${cmd}}`, 'ok');
            } else {
                flushHeavyUi({ payload });
                setStatus?.(`已设置 {\\${cmd}}（仅第 ${idx + 1} 条）`, 'ok');
            }
            return true;
        }

        function clearPos(index) {
            const cue = state.cues[index];
            if (!cue) return false;
            const inline = core.parseInlineOverrides(cue.text || '');
            if (inline.posX == null) return false;
            recordUndoBeforeChange?.('ass-pos-clear');
            nudgeUndoAt = 0;
            const next = core.clearLeadingOverrideFamily(cue.text || '', 'pos');
            state.cues[index] = { ...cue, text: next };
            if (state.selectedIndex === index && els.detailText) els.detailText.value = next;
            setDirty?.(true);
            lastSyncKey = '';
            flushHeavyUi({ payload: { index, cleared: true } });
            setStatus?.('已清除 {\\pos}，恢复 Style 对齐', 'ok');
            syncHandle(true);
            return true;
        }

        function nudge(dx, dy) {
            if (!isAssContext()) return false;
            const idx = activeCueIndex();
            if (idx < 0) {
                setStatus?.('请先选中或播放一条字幕再微调位置', 'warn');
                return false;
            }
            const pos = resolvePosForIndex(idx);
            if (!pos) return false;
            const next = core.nudgePos
                ? core.nudgePos(pos.x, pos.y, dx, dy, pos.playResX, pos.playResY)
                : { x: pos.x + dx, y: pos.y + dy };
            // Avoid syncDetailToCue on every key — it can clobber just-written pos from detail textarea.
            return commitPos(idx, next.x, next.y, 'ass-pos-nudge');
        }

        function snapToAlignment(alignment) {
            if (!isAssContext()) return false;
            const idx = activeCueIndex();
            if (idx < 0) {
                setStatus?.('请先选中或播放一条字幕再定位', 'warn');
                return false;
            }
            const cue = state.cues[idx];
            const { playResX, playResY } = playRes();
            const style = lookupStyle(cue?.ass?.style || 'Default');
            const target = core.posForAlignment
                ? core.posForAlignment(alignment, style, playResX, playResY)
                : core.defaultPosForStyle({ ...style, alignment }, playResX, playResY);
            if (state.selectedIndex === idx) syncDetailToCue?.();
            const ok = commitPos(idx, target.x, target.y, 'ass-pos-snap');
            if (ok) setStatus?.(`已定位到 an${alignment} 锚点 {\\pos(${target.x},${target.y})}（仅第 ${idx + 1} 条）`, 'ok');
            return ok;
        }

        function applyFromReadout() {
            if (!isAssContext()) return;
            const idx = state.selectedIndex >= 0 ? state.selectedIndex : activeCueIndex();
            if (idx < 0) {
                setStatus?.('请先选中一条字幕', 'warn');
                return;
            }
            const x = Number(els.detailAssPosX?.value);
            const y = Number(els.detailAssPosY?.value);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                setStatus?.('请输入有效的 pos X / Y', 'warn');
                return;
            }
            // Sync timing/text for the selected cue only, then write pos onto that same index.
            if (state.selectedIndex === idx) syncDetailToCue?.();
            commitPos(idx, x, y, 'ass-pos-detail');
        }

        function onPointerDown(ev) {
            if (!isAssContext()) return;
            if (ev.button != null && ev.button !== 0) return;
            const idx = activeCueIndex();
            if (idx < 0) {
                setStatus?.('请先选中或播放一条字幕再拖位置', 'warn');
                return;
            }
            const pos = resolvePosForIndex(idx);
            if (!pos || !els.video) return;
            dragging = true;
            dragCueIndex = idx;
            lastPos = { x: pos.x, y: pos.y, playResX: pos.playResX, playResY: pos.playResY };
            pointerId = ev.pointerId;
            try {
                ev.currentTarget.setPointerCapture?.(ev.pointerId);
            } catch { /* ignore */ }
            els.assPosHandle?.classList.add('is-dragging');
            els.videoFrame?.classList.add('ass-pos-dragging');
            applyApproxCssPos(pos.x, pos.y, pos.playResX, pos.playResY);
            if (els.videoSubtitle) {
                const cue = state.cues[idx];
                const plain = core.stripOverrideTags
                    ? core.stripOverrideTags(cue?.text || '')
                    : String(cue?.text || '');
                if (els.videoSubtitleText && !els.videoSubtitleText.textContent) {
                    els.videoSubtitleText.textContent = plain || '字幕';
                }
                els.videoSubtitle.classList.remove('hidden');
            }
            syncPosReadout({ ...pos, fromOverride: true });
            ev.preventDefault();
            ev.stopPropagation();
        }

        function applyPendingDragMove() {
            dragMoveRaf = 0;
            const mapped = pendingDragMapped;
            pendingDragMapped = null;
            if (!mapped || !dragging) return;
            lastPos = {
                x: mapped.x,
                y: mapped.y,
                playResX: mapped.playResX,
                playResY: mapped.playResY,
            };
            applyApproxCssPos(mapped.x, mapped.y, mapped.playResX, mapped.playResY);
            syncPosReadout({ x: mapped.x, y: mapped.y, fromOverride: true });
        }

        function onPointerMove(ev) {
            if (!dragging || dragCueIndex < 0) return;
            if (pointerId != null && ev.pointerId !== pointerId) return;
            const mapped = core.clientPointToPlayRes(
                ev.clientX,
                ev.clientY,
                els.video,
                lastPos?.playResX || 1920,
                lastPos?.playResY || 1080,
            );
            if (!mapped) return;
            pendingDragMapped = {
                x: mapped.x,
                y: mapped.y,
                playResX: lastPos?.playResX || 1920,
                playResY: lastPos?.playResY || 1080,
            };
            if (!dragMoveRaf) {
                dragMoveRaf = global.requestAnimationFrame
                    ? global.requestAnimationFrame(applyPendingDragMove)
                    : (setTimeout(applyPendingDragMove, 16), 1);
            }
            ev.preventDefault();
        }

        function endDrag(ev, commit) {
            if (!dragging) return;
            if (dragMoveRaf && global.cancelAnimationFrame) {
                global.cancelAnimationFrame(dragMoveRaf);
                dragMoveRaf = 0;
            }
            if (pendingDragMapped) applyPendingDragMove();
            const idx = dragCueIndex;
            const pos = lastPos;
            dragging = false;
            dragCueIndex = -1;
            pointerId = null;
            els.assPosHandle?.classList.remove('is-dragging');
            els.videoFrame?.classList.remove('ass-pos-dragging');
            clearApproxCssPos();
            try {
                if (ev?.currentTarget?.releasePointerCapture && ev.pointerId != null) {
                    ev.currentTarget.releasePointerCapture(ev.pointerId);
                }
            } catch { /* ignore */ }
            if (commit && idx >= 0 && pos) {
                // Only fold detail into the cue we actually moved.
                if (state.selectedIndex === idx) syncDetailToCue?.();
                commitPos(idx, pos.x, pos.y, 'ass-pos-drag');
            } else {
                clearApproxCssPos();
                syncHandle(true);
                refreshOverlay?.(true);
            }
        }

        function onPointerUp(ev) {
            if (!dragging) return;
            if (pointerId != null && ev.pointerId !== pointerId) return;
            endDrag(ev, true);
            ev.preventDefault();
            ev.stopPropagation();
        }

        function onPointerCancel(ev) {
            if (!dragging) return;
            endDrag(ev, false);
        }

        function onDblClick(ev) {
            if (!isAssContext()) return;
            const idx = activeCueIndex();
            if (idx < 0) return;
            clearPos(idx);
            ev.preventDefault();
            ev.stopPropagation();
        }

        function nudgeStep(ev) {
            if (ev.altKey) return 50;
            if (ev.shiftKey) return 10;
            return 1;
        }

        function isVideoChromeFocused() {
            if (typeof ctx.isVideoFocused === 'function') return !!ctx.isVideoFocused();
            if (typeof ctx.isMediaFocused === 'function') return !!ctx.isMediaFocused();
            return false;
        }

        function shouldHandleNudgeKeys(ev) {
            if (!isAssContext() || dragging) return false;
            if (ev.ctrlKey || ev.metaKey) return false;
            const t = ev.target;
            if (t === els.detailAssPosX || t === els.detailAssPosY) return false;
            if (typeof ctx.isTypingTarget === 'function' && ctx.isTypingTarget(t)) return false;
            if (t === els.assPosHandle || els.assPosHandle?.contains?.(t)) return true;
            // Video panel only — not timeline (timeline arrows change selection).
            return isVideoChromeFocused();
        }

        function onKeyDown(ev) {
            if (!shouldHandleNudgeKeys(ev)) return;
            const key = ev.key;
            // Do not bind Delete/Backspace here: editor Delete removes cues; Backspace is too easy to hit.
            let dx = 0;
            let dy = 0;
            if (key === 'ArrowLeft') dx = -1;
            else if (key === 'ArrowRight') dx = 1;
            else if (key === 'ArrowUp') dy = -1;
            else if (key === 'ArrowDown') dy = 1;
            else return;
            const step = nudgeStep(ev);
            if (nudge(dx * step, dy * step)) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        }

        function bindUi() {
            if (bound) return;
            bound = true;
            const handle = els.assPosHandle;
            if (handle) {
                handle.addEventListener('pointerdown', onPointerDown);
                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', onPointerUp);
                handle.addEventListener('pointercancel', onPointerCancel);
                handle.addEventListener('dblclick', onDblClick);
            }
            els.videoSubtitleText?.addEventListener('pointerdown', (ev) => {
                if (!isAssContext()) return;
                onPointerDown(ev);
            });
            window.addEventListener('resize', () => {
                if (!dragging) {
                    lastSyncKey = '';
                    syncHandle(true);
                }
            });
            document.addEventListener('keydown', onKeyDown, true);

            els.detailAssPosApply?.addEventListener('click', () => applyFromReadout());
            els.detailAssPosClear?.addEventListener('click', () => {
                const idx = state.selectedIndex >= 0 ? state.selectedIndex : activeCueIndex();
                if (idx >= 0) clearPos(idx);
            });
            const applyOnEnter = (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    applyFromReadout();
                }
            };
            els.detailAssPosX?.addEventListener('keydown', applyOnEnter);
            els.detailAssPosY?.addEventListener('keydown', applyOnEnter);

            const onPosSnapSelect = () => {
                const sel = els.detailAssPosSnap;
                if (!sel) return;
                const raw = sel.value;
                if (!raw) return;
                const an = Number(raw);
                sel.value = '';
                if (Number.isFinite(an) && an >= 1 && an <= 9) snapToAlignment(an);
            };
            els.detailAssPosSnap?.addEventListener('change', onPosSnapSelect);
            // Backward-compatible: any leftover [data-ass-pos-snap] buttons.
            els.detailAssPosWrap?.addEventListener('click', (ev) => {
                const btn = ev.target?.closest?.('[data-ass-pos-snap]');
                if (!btn) return;
                const an = Number(btn.getAttribute('data-ass-pos-snap'));
                if (!Number.isFinite(an)) return;
                snapToAlignment(an);
            });

            syncHandle(true);
        }

        return {
            bindUi,
            syncHandle,
            syncPosReadout,
            nudge,
            snapToAlignment,
            clearPos,
            isDragging: () => dragging,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installAssPosDrag = installAssPosDrag;
}(typeof globalThis !== 'undefined' ? globalThis : window));
