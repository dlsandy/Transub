/**
 * 字幕编辑器 — 启动加载遮罩
 */
(function (global) {
    function installBootProgress(ctx) {
        if (!ctx?.els) {
            throw new Error('installBootProgress(ctx): ctx.els required');
        }
        if (typeof ctx.setStatus !== 'function') {
            throw new Error('installBootProgress(ctx): ctx.setStatus required');
        }

        async function flushBootProgressPaint() {
            await new Promise((resolve) => {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            });
        }

        function showBootProgress(opts = {}) {
            const { els, setStatus } = ctx;
            if (!els.bootProgress) return;
            els.bootProgress.classList.remove('hidden');
            els.bootProgress.setAttribute('aria-busy', 'true');
            if (opts.title && els.bootProgressTitle) {
                els.bootProgressTitle.textContent = opts.title;
            }
            if (opts.detail != null && els.bootProgressDetail) {
                els.bootProgressDetail.textContent = opts.detail;
            }
            if (opts.statusMessage) setStatus(opts.statusMessage, '');
        }

        function updateBootProgress(opts = {}) {
            const { els, setStatus } = ctx;
            if (!els.bootProgress) return;
            if (opts.title && els.bootProgressTitle) {
                els.bootProgressTitle.textContent = opts.title;
            }
            if (opts.detail != null && els.bootProgressDetail) {
                els.bootProgressDetail.textContent = opts.detail;
            }
            if (opts.statusMessage) setStatus(opts.statusMessage, '');
        }

        function hideBootProgress() {
            const { els } = ctx;
            if (!els.bootProgress) return;
            els.bootProgress.classList.add('hidden');
            els.bootProgress.setAttribute('aria-busy', 'false');
        }

        ctx.flushBootProgressPaint = flushBootProgressPaint;
        ctx.showBootProgress = showBootProgress;
        ctx.updateBootProgress = updateBootProgress;
        ctx.hideBootProgress = hideBootProgress;

        return ctx;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installBootProgress = installBootProgress;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
