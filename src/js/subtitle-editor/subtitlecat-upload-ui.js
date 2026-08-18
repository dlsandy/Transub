/**
 * Dev-only: one-click upload current editor cues to subtitlecat.com
 */
(function (global) {
    function installSubtitleCatUploadUi(ctx) {
        if (!ctx?.state) {
            throw new Error('installSubtitleCatUploadUi(ctx): ctx.state required');
        }
        if (typeof ctx.setStatus !== 'function') {
            throw new Error('installSubtitleCatUploadUi(ctx): ctx.setStatus required');
        }

        const {
            state,
            electron,
            setStatus,
            basename,
        } = ctx;

        let uploading = false;

        async function uploadCurrentToSubtitleCat(opts = {}) {
            if (uploading) {
                setStatus('SubtitleCat 上传进行中…', 'warn');
                return { ok: false, error: 'busy' };
            }
            if (!Array.isArray(state.cues) || !state.cues.length) {
                setStatus('无法上传：字幕为空', 'err');
                return { ok: false, error: 'empty' };
            }
            if (!electron?.transubUploadSubtitleCat) {
                setStatus('当前环境不支持上传到 SubtitleCat', 'err');
                return { ok: false, error: 'unsupported' };
            }

            const fileName = opts.fileName
                || (typeof basename === 'function'
                    ? basename(state.path || 'subtitle.srt')
                    : 'subtitle.srt');
            uploading = true;
            setStatus('正在上传到 SubtitleCat…', '');
            try {
                const result = await electron.transubUploadSubtitleCat({
                    cues: state.cues,
                    fileName,
                    sourcePath: state.path || '',
                    targetLanguage: opts.targetLanguage || 'Chinese (Simplified)',
                    openResult: opts.openResult !== false,
                });
                if (!result?.ok) {
                    const msg = result?.error || '上传失败';
                    setStatus(result?.note ? `${msg}（${result.note}）` : msg, 'err');
                    return result || { ok: false, error: msg };
                }
                if (result.mode === 'http') {
                    setStatus('已上传到 SubtitleCat（已打开结果页）', 'ok');
                } else if (result.mode === 'assist') {
                    setStatus(result.note || '已打开 SubtitleCat 辅助上传窗口', 'ok');
                } else {
                    setStatus(result.note || '已打开 SubtitleCat 上传页', 'ok');
                }
                return result;
            } catch (err) {
                const msg = err?.message || String(err);
                setStatus(`SubtitleCat 上传失败：${msg}`, 'err');
                return { ok: false, error: msg };
            } finally {
                uploading = false;
            }
        }

        ctx.uploadCurrentToSubtitleCat = uploadCurrentToSubtitleCat;
        return ctx;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installSubtitleCatUploadUi = installSubtitleCatUploadUi;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
