/**
 * Subtitle editor I/O IPC channels (read/write/QC/draft/meta/export/pair postprocess).
 * Extracted from extensions-bridge to keep the monolith thin.
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { loadSettings } = require('./settings-data');
const { asString, assertEditableSubtitlePath, assertSubtitleMetaPath } = require('./ipc-validate');
const {
    buildSubtitleSaveDialogOptions,
    formatFromSavePath,
    ensureSubtitleSaveExtension,
} = require('./subtitle-save-dialog');
const { refocusWindow } = require('./window-focus');
const { readSubtitleMeta, writeSubtitleMeta } = require('./subtitle-meta');
const {
    readSubtitleDraft,
    writeSubtitleDraft,
    clearSubtitleDraft,
    shouldOfferDraftRestore,
} = require('./subtitle-draft');

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} deps
 * @param {() => string} deps.getAppRoot
 * @param {(event: any) => any} deps.browserWindowFromEvent
 * @param {typeof dialog} [deps.dialog]
 * @param {typeof refocusWindow} [deps.refocusWindow]
 * @param {(filePath: string, maxLines?: number) => object} deps.readSubtitlePreview
 * @param {(filePath: string) => object} deps.readSubtitleDocument
 * @param {(filePath: string, options?: object) => object} deps.scanSubtitleQc
 * @param {(filePath: string, payload?: object) => object} deps.writeSubtitleDocument
 * @param {(value: any) => string} deps.normalizeSubtitleBakMode
 * @param {(filePath: string, options?: object) => object} deps.applySubtitlePostprocess
 * @param {(targetPath: string, sourcePath: string, options?: object) => object} deps.compactPureInterjectionSubtitlePair
 * @param {(targetPath: string, sourcePath: string, options?: object) => object} deps.removeNoiseFromSubtitlePair
 */
function registerExtensionsSubtitleEditorIpc(register, deps = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerExtensionsSubtitleEditorIpc: register required');
    }
    const {
        getAppRoot,
        browserWindowFromEvent,
        readSubtitlePreview,
        readSubtitleDocument,
        scanSubtitleQc,
        writeSubtitleDocument,
        normalizeSubtitleBakMode,
        applySubtitlePostprocess,
        compactPureInterjectionSubtitlePair,
        removeNoiseFromSubtitlePair,
    } = deps;
    const showDialog = deps.dialog || dialog;
    const doRefocus = deps.refocusWindow || refocusWindow;

    register('transwithai-subtitle-preview', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitlePreview(filePath, Number(payload.maxLines) || 24);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitleDocument(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-scan-subtitle-qc', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return scanSubtitleQc(filePath, payload.options || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-apply-subtitle-postprocess', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return applySubtitlePostprocess(filePath, payload.options || payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-insert-text-preset-group', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            const { applyTextPresetGroupToSubtitle } = require('./post-batch-text-preset');
            return applyTextPresetGroupToSubtitle(
                filePath,
                payload.groupId || payload.textPresetGroupId,
                payload.options || {},
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-qc-silence-split', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            const mediaPath = asString(payload.mediaPath || payload.videoPath, 4096).trim();
            if (!mediaPath) {
                return { ok: true, skipped: true, reason: 'no_media', written: false, summary: '未关联视频，跳过超长句静音分割' };
            }
            const doc = readSubtitleDocument(filePath);
            if (!doc?.ok) return { ok: false, error: doc?.error || '读取字幕失败', path: filePath };
            const cues = Array.isArray(doc.cues) ? doc.cues : [];
            if (!cues.length) {
                return { ok: true, skipped: true, reason: 'empty', written: false, summary: '无字幕条目' };
            }
            const qcSilenceSplit = require('./qc-silence-split');
            const settings = loadSettings(getAppRoot).options || {};
            const applied = await qcSilenceSplit.runQcSilenceSplitOnCues(cues, {
                mediaPath,
                maxChars: payload.maxChars ?? payload.qcSilenceSplitChars ?? settings.qcSilenceSplitChars,
                ffmpegPath: asString(payload.ffmpegPath, 4096).trim() || String(settings.ffmpegPath || '').trim(),
                silenceDb: payload.silenceDb,
                silenceDur: payload.silenceDur,
                gapMs: payload.gapMs,
                fixOverlap: payload.fixOverlap !== false,
            });
            const summary = qcSilenceSplit.summarizeQcSilenceSplit(applied.stats);
            if (applied.stats?.skipped || !(applied.stats?.splitCount > 0)) {
                return {
                    ok: true,
                    skipped: true,
                    written: false,
                    path: filePath,
                    stats: applied.stats,
                    summary,
                };
            }
            const written = writeSubtitleDocument(filePath, {
                cues: applied.cues,
                format: doc.format,
                header: doc.header,
                backupMode: payload.backupMode || 'off',
            });
            if (!written.ok) return written;
            return {
                ok: true,
                written: true,
                path: filePath,
                stats: applied.stats,
                summary,
                beforeCount: cues.length,
                afterCount: applied.cues.length,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-compact-pure-interjections', async (_event, payload = {}) => {
        try {
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const sourcePath = payload.sourcePath
                ? assertEditableSubtitlePath(payload.sourcePath)
                : '';
            return compactPureInterjectionSubtitlePair(
                targetPath,
                sourcePath,
                payload.options || payload || {},
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-merge-bilingual-subtitles', async (_event, payload = {}) => {
        try {
            const sourcePath = assertEditableSubtitlePath(payload.sourcePath);
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const { writeMergedBilingualSubtitleFiles } = require('./subtitle-fs-helpers');
            const mergedPath = writeMergedBilingualSubtitleFiles(sourcePath, targetPath, {
                primaryTrack: payload.primaryTrack || payload.dualPrimaryTrack || 'target',
                lineOrder: payload.lineOrder || payload.dualLineOrder || 'target-first',
                nameAsVideoStem: payload.nameAsVideoStem !== false,
            });
            return { ok: true, path: mergedPath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-remove-noise-pair', async (_event, payload = {}) => {
        try {
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const sourcePath = payload.sourcePath
                ? assertEditableSubtitlePath(payload.sourcePath)
                : '';
            return removeNoiseFromSubtitlePair(
                targetPath,
                sourcePath,
                payload.options || payload || {},
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-copy-subtitle-as', async (_event, payload = {}) => {
        try {
            const src = assertEditableSubtitlePath(payload.path || payload.sourcePath);
            const destName = asString(payload.destName || payload.asName || '', 512).trim();
            if (!destName) return { ok: false, error: '未指定目标文件名' };
            const dest = path.join(path.dirname(src), destName);
            if (path.resolve(dest) === path.resolve(src)) {
                return { ok: true, path: dest, skipped: true };
            }
            fs.copyFileSync(src, dest);
            return { ok: true, path: dest, source: src };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitleDraft(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return writeSubtitleDraft(filePath, payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-clear-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return clearSubtitleDraft(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-check-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return shouldOfferDraftRestore(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            const settings = loadSettings(getAppRoot).options || {};
            const backupMode = payload.backupMode != null
                ? payload.backupMode
                : normalizeSubtitleBakMode(settings.subtitleBakMode);
            const written = writeSubtitleDocument(filePath, { ...payload, backupMode });
            return written;
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-subtitle', async (event, payload = {}) => {
        try {
            const cues = Array.isArray(payload.cues) ? payload.cues : [];
            if (!cues.length) return { ok: false, error: '字幕内容为空' };
            const dialogOpts = buildSubtitleSaveDialogOptions({
                format: payload.format,
                defaultName: payload.defaultName || payload.suggestedName,
                title: payload.title || '导出字幕',
            });
            const win = browserWindowFromEvent(event);
            const result = await showDialog.showSaveDialog(win || undefined, {
                title: dialogOpts.title,
                defaultPath: dialogOpts.defaultPath,
                filters: dialogOpts.filters,
            });
            doRefocus(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const dest = ensureSubtitleSaveExtension(result.filePath, dialogOpts.format);
            const saveFormat = formatFromSavePath(dest, dialogOpts.format);
            if (saveFormat === 'ass') {
                const { serializeSubtitle, serializeDualAss } = require('./subtitle-format');
                const assMode = String(payload.assMode || '').trim().toLowerCase();
                const header = Array.isArray(payload.header) ? payload.header : null;
                let content;
                if (assMode === 'dual' && Array.isArray(payload.pairCues)) {
                    content = serializeDualAss(cues, payload.pairCues, {
                        title: path.basename(dest, path.extname(dest)),
                        primaryRole: payload.primaryRole || payload.dualRole || 'target',
                        lineOrder: payload.lineOrder || payload.dualLineOrder,
                        dualTemplate: payload.dualTemplate,
                        sourceStyle: payload.sourceStyle,
                        targetStyle: payload.targetStyle,
                        marginGap: payload.marginGap,
                    });
                } else {
                    // Non-dual ASS always uses document styles (legacy "speakers" coerced).
                    content = serializeSubtitle({
                        format: 'ass',
                        cues,
                        header: header && header.length ? header : undefined,
                        assOptions: {
                            title: path.basename(dest, path.extname(dest)),
                            styles: payload.styles,
                            pairCues: payload.pairCues,
                            lineOrder: payload.lineOrder || payload.dualLineOrder,
                        },
                    });
                }
                fs.writeFileSync(dest, content, 'utf8');
                return {
                    ok: true,
                    path: dest,
                    cueCount: cues.length,
                    format: 'ass',
                    assMode: assMode === 'dual' ? 'dual' : 'document',
                };
            }
            return writeSubtitleDocument(dest, {
                format: saveFormat,
                cues,
                header: payload.header,
                backupMode: 'off',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-pick-save-subtitle', async (event, payload = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const dialogOpts = buildSubtitleSaveDialogOptions({
                format: payload.format,
                defaultPath: payload.defaultPath || payload.defaultName,
                title: payload.title || '另存为',
            });
            let defaultPath = dialogOpts.defaultPath;
            const hinted = asString(payload.defaultPath || payload.defaultName || '', 4096).trim();
            if (!hinted) {
                const { resolveDialogDefaultPath } = require('./last-open-dir');
                const dir = resolveDialogDefaultPath(getAppRoot, '');
                if (dir) defaultPath = path.join(dir, `subtitle.${dialogOpts.format}`);
            }
            const result = await showDialog.showSaveDialog(win || undefined, {
                title: dialogOpts.title,
                defaultPath,
                filters: dialogOpts.filters,
            });
            doRefocus(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const dest = path.resolve(ensureSubtitleSaveExtension(result.filePath, dialogOpts.format));
            try {
                const { rememberOpenPath } = require('./last-open-dir');
                rememberOpenPath(getAppRoot, dest);
            } catch { /* ignore */ }
            return {
                ok: true,
                canceled: false,
                path: dest,
                format: formatFromSavePath(dest, dialogOpts.format),
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-delete-subtitle-files', async (_event, payload = {}) => {
        try {
            const rawPaths = Array.isArray(payload.paths) ? payload.paths : [payload.path];
            const deleted = [];
            const missing = [];
            for (const raw of rawPaths) {
                if (!raw) continue;
                const filePath = assertEditableSubtitlePath(raw);
                if (!fs.existsSync(filePath)) {
                    missing.push(filePath);
                    continue;
                }
                fs.unlinkSync(filePath);
                deleted.push(filePath);
            }
            if (!deleted.length && !missing.length) {
                return { ok: false, error: '未指定要删除的字幕文件' };
            }
            return { ok: true, deleted, missing };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle-meta', async (_event, payload = {}) => {
        try {
            const filePath = assertSubtitleMetaPath(payload.path);
            return readSubtitleMeta(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle-meta', async (_event, payload = {}) => {
        try {
            const filePath = assertSubtitleMetaPath(payload.path);
            return writeSubtitleMeta(filePath, payload.meta || payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
}

module.exports = {
    registerExtensionsSubtitleEditorIpc,
};
