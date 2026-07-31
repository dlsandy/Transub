/**
 * 工作区模式切换 + 首次导览
 */
(function (global) {
    function installWorkspaceUi(ctx) {
        const {
            state,
            els,
            setStatus,
            showEditorModal,
            hideEditorModal,
        } = ctx;
        const ws = ctx.workspaceCore || global.TransubEditorWorkspace;
        if (!ws) throw new Error('installWorkspaceUi: TransubEditorWorkspace required');

        state.workspaceMode = ws.loadMode(global.localStorage);
        let tourStep = -1;

        function applyToolsMenuVisibility() {
            const bar = els.modeTools || document.getElementById('editorModeTools') || els.toolsMenu;
            if (!bar) return;
            const mode = ws.normalizeMode(state.workspaceMode);

            bar.querySelectorAll('[data-tool-group]').forEach((el) => {
                const g = el.getAttribute('data-tool-group');
                const visible = ws.isGroupVisible(mode, g);
                el.classList.toggle('hidden', !visible);
            });

            // Hide group dropdown wraps when no visible tools remain inside
            bar.querySelectorAll('[data-tool-menu]').forEach((wrap) => {
                const menu = wrap.querySelector('.editor-dropdown');
                if (!menu) {
                    wrap.classList.add('hidden');
                    return;
                }
                const groupAttr = wrap.getAttribute('data-tool-group');
                if (groupAttr && !ws.isGroupVisible(mode, groupAttr)) {
                    wrap.classList.add('hidden');
                    menu.classList.add('hidden');
                    wrap.querySelector('[data-dd-trigger]')?.setAttribute('aria-expanded', 'false');
                    return;
                }
                const buttons = [...menu.querySelectorAll(':scope > button')];
                const hasVisibleTool = buttons.some((btn) => !btn.classList.contains('hidden'));
                wrap.classList.toggle('hidden', !hasVisibleTool);
                if (!hasVisibleTool) {
                    menu.classList.add('hidden');
                    wrap.querySelector('[data-dd-trigger]')?.setAttribute('aria-expanded', 'false');
                    return;
                }
                // Hide orphan separators inside dropdown (leading / trailing / consecutive)
                const kids = [...menu.children];
                let prevVisible = false;
                kids.forEach((el) => {
                    if (el.classList.contains('dd-sep')) {
                        el.classList.add('hidden');
                        return;
                    }
                    if (!el.classList.contains('hidden') && el.matches?.('button')) {
                        prevVisible = true;
                    }
                });
                prevVisible = false;
                for (let i = 0; i < kids.length; i += 1) {
                    const el = kids[i];
                    if (!el.classList.contains('dd-sep')) {
                        if (!el.classList.contains('hidden') && el.matches?.('button')) {
                            prevVisible = true;
                        }
                        continue;
                    }
                    let nextVis = false;
                    for (let j = i + 1; j < kids.length; j += 1) {
                        const n = kids[j];
                        if (n.classList.contains('dd-sep')) continue;
                        nextVis = !n.classList.contains('hidden');
                        break;
                    }
                    el.classList.toggle('hidden', !(prevVisible && nextVis));
                    if (!el.classList.contains('hidden')) prevVisible = false;
                }
            });
        }

        function refreshWorkspaceUi() {
            const mode = ws.normalizeMode(state.workspaceMode);
            state.workspaceMode = mode;
            if (els.workspaceModeSelect) {
                els.workspaceModeSelect.value = mode;
            }
            document.querySelectorAll('[data-workspace-mode]').forEach((btn) => {
                const active = btn.getAttribute('data-workspace-mode') === mode;
                btn.classList.toggle('is-active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            applyToolsMenuVisibility();
        }

        function setWorkspaceMode(mode) {
            state.workspaceMode = ws.normalizeMode(mode);
            ws.saveMode(global.localStorage, state.workspaceMode);
            refreshWorkspaceUi();
            const meta = ws.MODE_META[state.workspaceMode];
            setStatus?.(`工作区：${meta?.label || state.workspaceMode}（模式工具已切换，低频在 ▾）`, 'ok');
        }

        function clearTourPulses() {
            document.querySelectorAll('.tour-target-pulse').forEach((el) => {
                el.classList.remove('tour-target-pulse');
            });
        }

        function closeTour() {
            tourStep = -1;
            clearTourPulses();
            els.tourOverlay?.classList.add('hidden');
            ws.markTourDone(global.localStorage);
        }

        function resolveTourTargets(targetKey) {
            const map = {
                workspace: [
                    document.querySelector('.editor-workspace-modes'),
                ],
                'list-filter': [
                    els.listToolbar || document.querySelector('.editor-list-toolbar'),
                ],
                timeline: [
                    els.timelinePanel || document.getElementById('editorTimelinePanel'),
                ],
                detail: [
                    els.detailPane || document.getElementById('editorDetailPane'),
                ],
                finish: [
                    document.getElementById('editorWorkflowBtn'),
                    document.getElementById('editorExportChecklistBtn'),
                ],
            };
            return (map[targetKey] || []).filter(Boolean);
        }

        /** Place the tour card near the highlighted control so the step is hard to miss. */
        function positionTourCard(targets) {
            const overlay = els.tourOverlay;
            const card = overlay?.querySelector('.editor-tour-card');
            if (!card) return;

            const pad = 16;
            const gap = 12;
            const vw = global.innerWidth || document.documentElement.clientWidth || 800;
            const vh = global.innerHeight || document.documentElement.clientHeight || 600;

            card.style.left = '0px';
            card.style.top = '0px';
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            card.style.transform = 'none';

            const cw = Math.min(card.offsetWidth || 352, vw - pad * 2);
            const ch = card.offsetHeight || 160;
            const visible = (targets || []).find((el) => {
                const r = el.getBoundingClientRect?.();
                return r && r.width > 2 && r.height > 2;
            });

            let left = (vw - cw) / 2;
            let top = Math.max(pad, vh * 0.28);

            if (visible) {
                const r = visible.getBoundingClientRect();
                left = r.left + (r.width / 2) - (cw / 2);
                top = r.bottom + gap;

                if (top + ch > vh - pad) {
                    top = r.top - ch - gap;
                }
                if (top < pad || top + ch > vh - pad) {
                    // Tall / full-height target: sit beside it near its top edge
                    top = Math.min(Math.max(r.top + gap, pad), Math.max(pad, vh - ch - pad));
                    const rightSlot = r.right + gap;
                    const leftSlot = r.left - cw - gap;
                    if (rightSlot + cw <= vw - pad) {
                        left = rightSlot;
                    } else if (leftSlot >= pad) {
                        left = leftSlot;
                    } else {
                        left = Math.max(pad, Math.min(r.left + gap, vw - cw - pad));
                    }
                }
            }

            left = Math.max(pad, Math.min(left, vw - cw - pad));
            top = Math.max(pad, Math.min(top, vh - ch - pad));
            card.style.left = `${Math.round(left)}px`;
            card.style.top = `${Math.round(top)}px`;
        }

        function renderTourStep(index) {
            const steps = ws.getTourSteps();
            if (index < 0 || index >= steps.length) {
                closeTour();
                setStatus?.('导览完成。视图可换布局与波形；双语 / AI / Pro 下还有对照审阅、翻译与重构等工具。', 'ok');
                return;
            }
            tourStep = index;
            const step = steps[index];
            const overlay = els.tourOverlay;
            if (!overlay) return;
            overlay.classList.remove('hidden');
            if (els.tourTitle) els.tourTitle.textContent = step.title;
            if (els.tourBody) els.tourBody.textContent = step.body;
            if (els.tourProgress) {
                els.tourProgress.textContent = `${index + 1} / ${steps.length}`;
            }
            if (els.tourNextBtn) {
                els.tourNextBtn.textContent = index === steps.length - 1 ? '完成' : '下一步';
            }
            clearTourPulses();
            const targets = resolveTourTargets(step.target);
            targets.forEach((el) => {
                el.classList?.add('tour-target-pulse');
            });
            const primary = targets.find((el) => el.getBoundingClientRect);
            primary?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            const place = () => positionTourCard(targets);
            place();
            if (typeof global.requestAnimationFrame === 'function') {
                global.requestAnimationFrame(place);
            }
        }

        function startTour({ force = false } = {}) {
            if (!force && ws.isTourDone(global.localStorage)) return false;
            renderTourStep(0);
            return true;
        }

        function bindUi() {
            els.workspaceModeSelect?.addEventListener('change', () => {
                setWorkspaceMode(els.workspaceModeSelect.value);
            });
            document.querySelectorAll('[data-workspace-mode]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setWorkspaceMode(btn.getAttribute('data-workspace-mode'));
                });
            });
            els.tourSkipBtn?.addEventListener('click', closeTour);
            els.tourNextBtn?.addEventListener('click', () => {
                renderTourStep(tourStep + 1);
            });
            els.tourReplayBtn?.addEventListener('click', () => {
                startTour({ force: true });
            });
            global.addEventListener?.('resize', () => {
                if (tourStep < 0) return;
                const steps = ws.getTourSteps();
                const step = steps[tourStep];
                if (!step) return;
                positionTourCard(resolveTourTargets(step.target));
            });
            void showEditorModal;
            void hideEditorModal;
        }

        return {
            applyToolsMenuVisibility,
            refreshWorkspaceUi,
            setWorkspaceMode,
            startTour,
            closeTour,
            bindUi,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installWorkspaceUi = installWorkspaceUi;
}(typeof window !== 'undefined' ? window : globalThis));
