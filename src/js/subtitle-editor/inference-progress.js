/**
 * Shared full-screen progress for LLM / long inference jobs
 * (semantic review, context reconstruct, Sakura/smart translate).
 */
(function (global) {
    function installInferenceProgress(ctx) {
        const { els, state, setStatus } = ctx;
        if (!els) throw new Error('installInferenceProgress: els required');

        let elapsedTimer = null;
        let startedAt = 0;
        let activeKind = '';

        function formatElapsed(ms) {
            const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
            if (sec < 60) return `${sec}s`;
            return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
        }

        function progressNodes() {
            return {
                overlay: document.getElementById('editorReconstructProgress'),
                badge: document.getElementById('editorReconstructProgressBadge'),
                title: document.getElementById('editorReconstructProgressTitle'),
                detail: document.getElementById('editorReconstructProgressDetail'),
                count: document.getElementById('editorReconstructProgressCount'),
                track: document.getElementById('editorReconstructProgressTrack'),
                bar: document.getElementById('editorReconstructProgressBar'),
                hint: document.getElementById('editorReconstructProgressHint'),
                elapsed: document.getElementById('editorReconstructProgressElapsed'),
                cancelBtn: document.getElementById('editorReconstructProgressCancel'),
            };
        }

        function stopElapsedTimer() {
            if (elapsedTimer) {
                clearInterval(elapsedTimer);
                elapsedTimer = null;
            }
        }

        function tickElapsed() {
            const nodes = progressNodes();
            if (!nodes.elapsed || !startedAt) return;
            nodes.elapsed.textContent = `已用时 ${formatElapsed(Date.now() - startedAt)}`;
            nodes.elapsed.classList.remove('hidden');
        }

        /**
         * @param {{
         *   kind?: string,
         *   title?: string,
         *   detail?: string,
         *   hint?: string,
         *   badge?: string,
         *   countText?: string,
         *   pct?: number,
         *   indeterminate?: boolean,
         *   cancellable?: boolean,
         * }} [opts]
         */
        function showInferenceProgress(opts = {}) {
            const nodes = progressNodes();
            activeKind = String(opts.kind || 'inference');
            if (state) {
                state.reconstructBusy = true;
                state.inferenceKind = activeKind;
            }
            document.body.classList.add('editor-inference-busy');

            if (!nodes.overlay) {
                setStatus?.(opts.detail || opts.title || '推理进行中…', 'ok');
                return;
            }

            startedAt = Date.now();
            stopElapsedTimer();
            elapsedTimer = setInterval(tickElapsed, 500);
            tickElapsed();

            nodes.overlay.classList.remove('hidden');
            nodes.overlay.classList.add('is-inference');
            nodes.overlay.setAttribute('aria-busy', 'true');
            nodes.overlay.setAttribute(
                'aria-label',
                opts.title || '推理进行中',
            );

            const indeterminate = opts.indeterminate !== false
                && !(Number.isFinite(Number(opts.pct)) && Number(opts.pct) > 0);
            nodes.overlay.classList.toggle('indeterminate', indeterminate);

            if (nodes.badge) {
                nodes.badge.textContent = opts.badge || '大模型推理';
                nodes.badge.classList.remove('hidden');
            }
            if (nodes.title) nodes.title.textContent = opts.title || '推理进行中';
            if (nodes.detail) {
                nodes.detail.textContent = opts.detail
                    || '正在调用大模型，请稍候…';
            }
            if (nodes.hint) {
                nodes.hint.textContent = opts.hint
                    || '推理可能需要数十秒到数分钟，请勿关闭窗口；可随时取消';
            }
            if (nodes.count) {
                if (opts.countText) {
                    nodes.count.textContent = opts.countText;
                    nodes.count.classList.remove('hidden');
                } else {
                    nodes.count.classList.add('hidden');
                }
            }
            if (nodes.track) nodes.track.classList.remove('hidden');
            if (nodes.bar) {
                if (indeterminate) {
                    nodes.bar.style.width = '';
                } else {
                    const pct = Math.max(0, Math.min(100, Number(opts.pct) || 0));
                    nodes.bar.style.width = `${pct}%`;
                }
            }
            if (nodes.cancelBtn) {
                nodes.cancelBtn.disabled = opts.cancellable === false;
                nodes.cancelBtn.textContent = '取消';
            }

            setStatus?.(opts.detail || `${opts.title || '推理'}进行中…`, 'ok');
        }

        /**
         * @param {{
         *   title?: string,
         *   detail?: string,
         *   message?: string,
         *   hint?: string,
         *   countText?: string,
         *   pct?: number,
         *   percent?: number,
         *   phase?: string,
         *   chunk?: number,
         *   total?: number,
         *   indeterminate?: boolean,
         * }} [info]
         */
        function updateInferenceProgress(info = {}) {
            const nodes = progressNodes();
            if (!nodes.overlay || nodes.overlay.classList.contains('hidden')) {
                if (info.message || info.detail) {
                    setStatus?.(info.message || info.detail, 'ok');
                }
                return;
            }

            if (info.title && nodes.title) nodes.title.textContent = info.title;
            if (nodes.detail) {
                const text = info.message || info.detail;
                if (text) nodes.detail.textContent = text;
            }
            if (info.hint && nodes.hint) nodes.hint.textContent = info.hint;

            if (nodes.count) {
                if (info.countText) {
                    nodes.count.textContent = info.countText;
                    nodes.count.classList.remove('hidden');
                } else if (info.chunk && info.total) {
                    nodes.count.textContent = `块 ${info.chunk} / ${info.total}`;
                    nodes.count.classList.remove('hidden');
                }
            }

            const pctRaw = info.pct ?? info.percent;
            const hasPct = Number.isFinite(Number(pctRaw));
            const indeterminate = info.indeterminate === true
                || (!hasPct && info.indeterminate !== false && info.phase !== 'done');
            if (hasPct) {
                nodes.overlay.classList.remove('indeterminate');
                if (nodes.bar) {
                    nodes.bar.style.width = `${Math.max(0, Math.min(100, Number(pctRaw)))}%`;
                }
            } else if (info.indeterminate === true) {
                nodes.overlay.classList.add('indeterminate');
                if (nodes.bar) nodes.bar.style.width = '';
            } else if (!indeterminate && info.phase === 'done' && nodes.bar) {
                nodes.overlay.classList.remove('indeterminate');
                nodes.bar.style.width = '100%';
            }

            tickElapsed();
        }

        function hideInferenceProgress() {
            stopElapsedTimer();
            activeKind = '';
            if (state) {
                state.reconstructBusy = false;
                state.inferenceKind = '';
                state.translateEngine = '';
            }
            document.body.classList.remove('editor-inference-busy');
            const nodes = progressNodes();
            if (!nodes.overlay) return;
            nodes.overlay.classList.add('hidden');
            nodes.overlay.classList.remove('is-inference', 'indeterminate');
            nodes.overlay.setAttribute('aria-busy', 'false');
            if (nodes.bar) nodes.bar.style.width = '0%';
            if (nodes.count) nodes.count.classList.add('hidden');
            if (nodes.elapsed) {
                nodes.elapsed.textContent = '';
                nodes.elapsed.classList.add('hidden');
            }
            if (nodes.badge) nodes.badge.classList.add('hidden');
            if (nodes.cancelBtn) {
                nodes.cancelBtn.disabled = false;
                nodes.cancelBtn.textContent = '取消';
            }
        }

        function getInferenceKind() {
            return activeKind || state?.inferenceKind || '';
        }

        ctx.showInferenceProgress = showInferenceProgress;
        ctx.updateInferenceProgress = updateInferenceProgress;
        ctx.hideInferenceProgress = hideInferenceProgress;
        ctx.getInferenceKind = getInferenceKind;
        ctx.formatInferenceElapsed = formatElapsed;

        return {
            showInferenceProgress,
            updateInferenceProgress,
            hideInferenceProgress,
            getInferenceKind,
            formatInferenceElapsed: formatElapsed,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installInferenceProgress = installInferenceProgress;
}(typeof globalThis !== 'undefined' ? globalThis : window));
