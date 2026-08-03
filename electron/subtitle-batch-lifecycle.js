/**
 * Shared batch lifecycle helpers: post-task actions + completion notify.
 */

const { mergeTransWithAiOptions } = require('./transwithai-options');

/**
 * @param {() => object} getSessionPostTaskOptions
 * @param {(raw: object) => object} normalizePostTaskOptions
 * @param {() => boolean} isJobCancelled
 */
function createPostSubtitleTaskRunner({
    getSessionPostTaskOptions,
    normalizePostTaskOptions,
    isJobCancelled,
}) {
    return function runPostSubtitleTaskActions(_options, result, windowManager) {
        if (result?.cancelled || (typeof isJobCancelled === 'function' && isJobCancelled())) return;

        const session = getSessionPostTaskOptions();
        const fromArg = normalizePostTaskOptions(_options || {});
        const preferArg = fromArg.postTaskAction !== 'none' && session.postTaskAction === 'none';
        const merged = mergeTransWithAiOptions({
            ...(preferArg ? fromArg : session),
            lastOutputDir: session.lastOutputDir || fromArg.lastOutputDir || '',
            playSoundOnComplete: preferArg
                ? fromArg.playSoundOnComplete
                : session.playSoundOnComplete,
        });
        const hasFailure = (Number(result?.failed) || 0) > 0;

        if (merged.playSoundOnComplete && !hasFailure) {
            try {
                const { playCompletionSound } = require('./system-actions');
                playCompletionSound();
            } catch { /* ignore */ }
        }

        if (merged.openOutputFolderOnComplete && !hasFailure && merged.lastOutputDir) {
            try {
                const { openPathInShell } = require('./system-actions');
                openPathInShell(merged.lastOutputDir);
            } catch (err) {
                console.warn('[batch-lifecycle] 打开输出目录失败:', err.message || err);
            }
        }

        if (merged.closeWindowOnComplete && !hasFailure && windowManager?.closeMainWindow) {
            setTimeout(() => {
                try {
                    windowManager.closeMainWindow();
                } catch (err) {
                    console.warn('[batch-lifecycle] 关闭任务窗口失败:', err.message || err);
                }
            }, 2000);
        }

        const quit = !!merged.quitAppOnComplete;
        const shutdown = !!merged.shutdownOnComplete;
        const sleep = !!merged.sleepOnComplete;

        if (sleep && !hasFailure) {
            try {
                const { scheduleSystemSleep } = require('./system-actions');
                scheduleSystemSleep();
            } catch (err) {
                console.warn('[batch-lifecycle] 睡眠失败:', err.message || err);
            }
        }

        if (!quit && !shutdown) {
            if (!sleep) return;
            setTimeout(() => {
                try { windowManager?.quitApp?.(); } catch { /* ignore */ }
            }, sleep ? 1200 : 0);
            return;
        }
        if (hasFailure) return;
        if (result?.ok === false && !(Number(result?.skipped) > 0)) return;

        if (shutdown) {
            try {
                const { scheduleSystemShutdown } = require('./system-shutdown');
                const delaySec = merged.shutdownDelaySec;
                const res = scheduleSystemShutdown(
                    delaySec,
                    delaySec > 0
                        ? `字幕任务已完成，${delaySec} 秒后将关机`
                        : '字幕任务已完成，即将关机',
                );
                if (!res.ok) {
                    console.warn('[batch-lifecycle] 安排关机失败:', res.error);
                }
            } catch (err) {
                console.warn('[batch-lifecycle] 安排关机失败:', err.message || err);
            }
        }

        if (quit || shutdown) {
            setTimeout(() => {
                try {
                    windowManager?.quitApp?.();
                } catch (err) {
                    console.warn('[batch-lifecycle] 退出应用失败:', err.message || err);
                }
            }, shutdown ? 800 : 300);
        }
    };
}

function notifyBatchComplete(options, result, extraBody = '') {
    try {
        const { notifySubtitleComplete, setTrayNotifyEnabled } = require('./notifications');
        setTrayNotifyEnabled(!!options?.trayNotifyEnabled);
        const base = `成功 ${result?.generated || 0}，跳过 ${result?.skipped || 0}，失败 ${result?.failed || 0}`;
        const extra = String(extraBody || '').trim();
        notifySubtitleComplete(extra ? `${base} · ${extra}` : base);
    } catch { /* ignore */ }
}

/**
 * Hold tray notify / completion sound / shutdown etc. until UI finishes post-batch
 * (CPS 拆句、QC 扫描、自动修复 QC). Renderer calls flush via IPC.
 */
function createDeferredBatchFinalize({
    notifyBatchComplete: notifyFn,
    runPostSubtitleTaskActions: runPostFn,
}) {
    let pending = null;
    let fallbackTimer = null;

    function clearFallback() {
        if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
    }

    function deferBatchFinalize(options, result, windowManager) {
        clearFallback();
        pending = {
            options: options || {},
            result: result || {},
            windowManager: windowManager || null,
        };
        // Safety net if renderer never acknowledges (crashed / closed).
        fallbackTimer = setTimeout(() => {
            flushDeferredBatchFinalize({ reason: 'fallback' });
        }, 30 * 60 * 1000);
        if (typeof fallbackTimer.unref === 'function') fallbackTimer.unref();
    }

    function flushDeferredBatchFinalize(payload = {}) {
        clearFallback();
        const held = pending;
        pending = null;
        if (!held || held.result?.cancelled) {
            return { ok: true, skipped: true };
        }
        const extra = String(payload.summaryExtra || '').trim();
        try {
            notifyFn(held.options, held.result, extra);
        } catch { /* ignore */ }
        try {
            runPostFn(held.options, held.result, held.windowManager);
        } catch (err) {
            console.warn('[batch-lifecycle] post-task failed:', err?.message || err);
        }
        return { ok: true, skipped: false, reason: payload.reason || 'renderer' };
    }

    function clearDeferredBatchFinalize() {
        clearFallback();
        pending = null;
    }

    return {
        deferBatchFinalize,
        flushDeferredBatchFinalize,
        clearDeferredBatchFinalize,
    };
}

module.exports = {
    createPostSubtitleTaskRunner,
    createDeferredBatchFinalize,
    notifyBatchComplete,
};
