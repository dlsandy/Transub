/**
 * Burn-in workspace preview: ffmpeg hardsub clip (same filter as成片) → play mp4.
 *
 * Overlay/JASSUB over the source file is unreliable in Electron (HEVC black
 * frames, WebGL/RVFC compositing). A short libx264 burned preview is the
 * pixel-accurate path that Chromium can always paint.
 */
(function (global) {
    const electron = global.__ELECTRON__;

    function waitForVideoReady(videoEl, timeoutMs = 20000) {
        if (!videoEl) return Promise.reject(new Error('缺少预览视频元素'));
        if (videoEl.readyState >= 2) return Promise.resolve();
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                videoEl.removeEventListener('loadeddata', onReady);
                videoEl.removeEventListener('canplay', onReady);
                videoEl.removeEventListener('error', onErr);
                fn(arg);
            };
            const onReady = () => finish(resolve);
            const onErr = () => finish(reject, new Error('预览视频加载失败'));
            const timer = setTimeout(() => finish(reject, new Error('预览视频加载超时')), timeoutMs);
            videoEl.addEventListener('loadeddata', onReady);
            videoEl.addEventListener('canplay', onReady);
            videoEl.addEventListener('error', onErr);
        });
    }

    async function tryPlayVideo(videoEl) {
        if (!videoEl) return { ok: false, error: '缺少预览视频元素' };
        try {
            await videoEl.play();
            return { ok: true };
        } catch (_) {
            try {
                videoEl.muted = true;
                await videoEl.play();
                try { videoEl.muted = false; } catch (_) { /* keep muted */ }
                return { ok: true, mutedFallback: true };
            } catch (err) {
                return { ok: false, error: err?.message || '无法自动播放，请点播放按钮' };
            }
        }
    }

    function createBurnPreview(opts = {}) {
        const videoEl = opts.videoEl;
        const canvasEl = opts.canvasEl || document.getElementById('burnPreviewCanvas');
        const overlayEl = opts.overlayEl || document.getElementById('burnPreviewOverlay');
        let destroyed = false;
        let previewPath = '';
        let unsubProgress = null;

        function hideOverlays() {
            if (canvasEl) {
                canvasEl.classList.add('hidden');
                canvasEl.style.display = 'none';
            }
            if (overlayEl) {
                overlayEl.classList.add('hidden');
                overlayEl.setAttribute('aria-hidden', 'true');
            }
        }

        function clearVideo() {
            if (!videoEl) return;
            try { videoEl.pause(); } catch (_) { /* ignore */ }
            videoEl.removeAttribute('src');
            try { videoEl.load(); } catch (_) { /* ignore */ }
        }

        async function cleanupPreviewFile() {
            const p = previewPath;
            previewPath = '';
            if (!p) return;
            try {
                if (typeof electron?.ffmpegBurnDeletePreview === 'function') {
                    await electron.ffmpegBurnDeletePreview({ path: p });
                }
            } catch (_) { /* ignore */ }
        }

        async function loadFromPaths({
            videoPath,
            subtitlePath,
            bilingualSubtitlePath,
            sourceSubtitlePath,
            subtitleTrack,
            basicStyle,
            styleMode,
            startSec,
            durationSec,
            onProgress,
        } = {}) {
            if (!videoEl) return { ok: false, error: '缺少预览视频元素' };
            if (typeof electron?.ffmpegBurnPreviewClip !== 'function') {
                return { ok: false, error: '当前环境不支持烧录像素预览' };
            }
            hideOverlays();
            clearVideo();
            await cleanupPreviewFile();

            if (typeof electron?.onFfmpegBurnProgress === 'function' && typeof onProgress === 'function') {
                try { unsubProgress?.(); } catch (_) { /* ignore */ }
                unsubProgress = electron.onFfmpegBurnProgress((payload) => {
                    if (destroyed) return;
                    if (!payload || !String(payload.phase || '').startsWith('preview')) return;
                    try { onProgress(payload); } catch (_) { /* ignore */ }
                });
            }

            const encoded = await electron.ffmpegBurnPreviewClip({
                videoPath,
                subtitlePath,
                bilingualSubtitlePath,
                sourceSubtitlePath,
                subtitleTrack,
                basicStyle,
                styleMode,
                startSec: Number(startSec) || 0,
                durationSec: Number(durationSec) || 45,
                maxHeight: 720,
            });
            if (destroyed) {
                if (encoded?.ok && encoded.outputPath) {
                    try {
                        await electron.ffmpegBurnDeletePreview?.({ path: encoded.outputPath });
                    } catch (_) { /* ignore */ }
                }
                return { ok: false, error: '预览已关闭' };
            }
            if (!encoded?.ok) {
                return { ok: false, error: encoded?.error || '预览编码失败' };
            }
            previewPath = String(encoded.outputPath || '').trim();
            if (!previewPath) return { ok: false, error: '预览文件缺失' };

            let mediaUrl = '';
            let fileUrl = '';
            if (typeof electron?.transubResolveMediaUrl === 'function') {
                const resolved = await electron.transubResolveMediaUrl({ path: previewPath });
                if (!resolved?.ok) {
                    return { ok: false, error: resolved?.error || '无法解析预览地址' };
                }
                mediaUrl = String(resolved.url || '').trim();
                fileUrl = String(resolved.fileUrl || '').trim();
            } else {
                mediaUrl = electron?.getMediaUrl?.(previewPath) || '';
            }
            if (!mediaUrl && !fileUrl) return { ok: false, error: '无法解析预览地址' };

            const candidates = [mediaUrl, fileUrl].filter(Boolean);
            let loaded = false;
            let lastError = '预览视频加载失败';
            for (const candidate of candidates) {
                try {
                    videoEl.src = candidate;
                    videoEl.setAttribute('src', candidate);
                    try { videoEl.load(); } catch (_) { /* ignore */ }
                    await waitForVideoReady(videoEl);
                    loaded = true;
                    break;
                } catch (err) {
                    lastError = err?.message || '预览视频加载失败';
                }
            }
            if (!loaded) return { ok: false, error: lastError };

            const playRes = await tryPlayVideo(videoEl);
            return {
                ok: true,
                playing: !!playRes.ok,
                playError: playRes.ok ? '' : (playRes.error || ''),
                burnedPreview: true,
                durationSec: encoded.durationSec,
                startSec: encoded.startSec,
            };
        }

        async function destroy() {
            destroyed = true;
            try { unsubProgress?.(); } catch (_) { /* ignore */ }
            unsubProgress = null;
            clearVideo();
            await cleanupPreviewFile();
            hideOverlays();
        }

        hideOverlays();
        return {
            loadFromPaths,
            tryPlayVideo: () => tryPlayVideo(videoEl),
            destroy,
        };
    }

    global.TransubSubtitleBurnPreview = {
        create: createBurnPreview,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createBurnPreview };
    }
}(typeof globalThis !== 'undefined' ? globalThis : window));
