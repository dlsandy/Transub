/**
 * On-demand 省略号直译 for a finished batch item (task-list one-click).
 * Thin IPC — reuses engine-ellipsis-quick-direct with full-track context.
 */
const fs = require('fs');

function registerEngineEllipsisBackfillIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineEllipsisBackfillIpc: register required');
    }
    const {
        readMergedOptions,
        appendEngineLogLine,
        sendProgress,
    } = host;

    register('transub-engine-ellipsis-backfill', async (event, payload = {}) => {
        const zhPath = String(payload.subtitlePath || payload.targetSubtitlePath || '').trim();
        const srcPath = String(payload.sourceSubtitlePath || '').trim();
        const mediaPath = String(payload.mediaPath || payload.path || '').trim();
        if (!zhPath || !fs.existsSync(zhPath)) {
            return { ok: false, error: '缺少译文字幕路径' };
        }
        if (!srcPath || !fs.existsSync(srcPath)) {
            return { ok: false, error: '缺少原文轨（请先配对 .src.srt / .transcribe.srt）' };
        }

        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'ellipsis_backfill',
            owner: '省略号补译',
            source: 'transub-engine-ellipsis-backfill',
        }, payload, async () => {
            try {
                const options = typeof readMergedOptions === 'function'
                    ? await readMergedOptions(payload.options || {})
                    : (payload.options || {});
                const { runEllipsisQuickDirectPass } = require('./engine-ellipsis-quick-direct');
                const item = {
                    sourceSubtitlePath: srcPath,
                    targetSubtitlePath: zhPath,
                    subtitlePath: zhPath,
                    path: mediaPath,
                };
                const onLog = (line) => {
                    if (typeof appendEngineLogLine === 'function') {
                        appendEngineLogLine(`[ellipsis-backfill] ${line}`, event?.sender);
                    }
                };
                const onProgress = (info) => {
                    if (typeof sendProgress === 'function' && event?.sender) {
                        sendProgress(event.sender, {
                            stage: 'cleanup',
                            phase: 'ellipsis-backfill',
                            file: mediaPath || zhPath,
                            percent: Number(info?.percent) || 97,
                            detail: info?.detail || '省略号补译…',
                        });
                    }
                };
                const result = await runEllipsisQuickDirectPass(item, {
                    ...options,
                    translateMode: options.translateMode || 'llm',
                }, {
                    onProgress,
                    onLog,
                    event,
                    signal: null,
                    shouldStop: () => false,
                });
                if (result?.cancelled) {
                    return { ok: false, cancelled: true, error: '已取消', ...result };
                }
                if (result?.skipped) {
                    return {
                        ok: false,
                        skipped: true,
                        error: '当前翻译模式不支持省略号直译扫尾',
                        ...result,
                    };
                }
                onLog(
                    result?.filled
                        ? `完成：补译 ${result.filled} 条，仍剩 ${result.left || 0}`
                        : `无进展（仍剩 ${result?.left || 0}）`,
                );
                return {
                    ok: true,
                    filled: Number(result?.filled) || 0,
                    left: Number(result?.left) || 0,
                    rounds: Number(result?.rounds) || 0,
                    subtitlePath: zhPath,
                    sourceSubtitlePath: srcPath,
                };
            } catch (err) {
                return { ok: false, error: err?.message || String(err) };
            }
        });
    });
}

module.exports = {
    registerEngineEllipsisBackfillIpc,
};
