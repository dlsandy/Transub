/**
 * Shared dual-track subtitle filesystem helpers (engine + TWAI).
 */

const fs = require('fs');
const path = require('path');
const dualCore = require('../src/js/dual-subtitle-core');

/**
 * `video.ja.srt` + sourceSuffix ja + targetSuffix zh → `video.zh.srt`
 */
function dualTargetPathFromSource(sourcePath, sourceSuffix, targetSuffix) {
    const resolved = path.resolve(String(sourcePath || ''));
    const ext = path.extname(resolved);
    let base = path.basename(resolved, ext);
    const srcTag = String(sourceSuffix || '').trim().toLowerCase();
    const dstTag = String(targetSuffix || '').trim().toLowerCase() || 'zh';
    let stem = base;
    if (srcTag) {
        const suffix = `.${srcTag}`;
        if (base.toLowerCase().endsWith(suffix)) {
            stem = base.slice(0, -suffix.length);
        }
    }
    return path.join(path.dirname(resolved), `${stem}.${dstTag}${ext}`);
}

/**
 * Rename engine output `{stem}.{ext}` → `{stem}.{suffix}.{ext}` for each format.
 */
function renameStemSubtitlesWithSuffix(videoPath, outputDir, subFormats, suffix, { overwrite = true } = {}) {
    const resolved = path.resolve(String(videoPath || ''));
    const dir = path.resolve(String(outputDir || path.dirname(resolved)));
    const stem = path.basename(resolved, path.extname(resolved));
    const tag = String(suffix || '').trim().toLowerCase();
    if (!tag) throw new Error('缺少双语后缀');
    const formats = String(subFormats || 'srt')
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => ['srt', 'vtt', 'lrc'].includes(s));
    const unique = formats.length ? [...new Set(formats)] : ['srt'];
    const renamed = [];
    for (const fmt of unique) {
        const src = path.join(dir, `${stem}.${fmt}`);
        const dest = path.join(dir, `${stem}.${tag}.${fmt}`);
        if (!fs.existsSync(src)) continue;
        if (path.resolve(src) === path.resolve(dest)) {
            renamed.push(dest);
            continue;
        }
        if (fs.existsSync(dest)) {
            if (!overwrite) {
                throw new Error(`目标字幕已存在：${path.basename(dest)}`);
            }
            fs.unlinkSync(dest);
        }
        fs.renameSync(src, dest);
        renamed.push(dest);
    }
    if (!renamed.length) {
        throw new Error(`未找到可重命名的字幕（期望 ${stem}.{srt|vtt|lrc}）`);
    }
    return renamed;
}

/**
 * Merge dual-track subtitle files next to them.
 */
function writeMergedBilingualSubtitleFiles(sourcePath, targetPath, {
    primaryTrack = 'target',
    lineOrder = 'target-first',
    nameAsVideoStem = true,
} = {}) {
    const { parseSubtitle, serializeSubtitle, detectFormat, isEditableFormat } = require('./subtitle-format');
    const srcResolved = path.resolve(String(sourcePath || ''));
    const tgtResolved = path.resolve(String(targetPath || ''));
    if (!fs.existsSync(srcResolved) || !fs.existsSync(tgtResolved)) {
        throw new Error('合并双语失败：原文或译文字幕不存在');
    }
    const readOne = (filePath) => {
        const raw = fs.readFileSync(filePath, 'utf8');
        const format = detectFormat(filePath, raw);
        if (!isEditableFormat(format)) {
            throw new Error(`不支持合并格式：${path.basename(filePath)}`);
        }
        const parsed = parseSubtitle(raw, format);
        return { format: parsed.format, cues: parsed.cues || [], header: parsed.header || [] };
    };
    const sourceDoc = readOne(srcResolved);
    const targetDoc = readOne(tgtResolved);
    const primary = dualCore.normalizeDualPrimaryTrack(primaryTrack);
    const primaryDoc = primary === 'source' ? sourceDoc : targetDoc;
    const pairDoc = primary === 'source' ? targetDoc : sourceDoc;
    const mergedCues = dualCore.buildMergedDualCues(primaryDoc.cues, pairDoc.cues, {
        primaryRole: primary,
        order: dualCore.normalizeDualLineOrder(lineOrder),
    });
    if (!mergedCues.length) {
        throw new Error('合并双语失败：结果为空');
    }
    const format = primaryDoc.format || targetDoc.format || 'srt';
    const suggested = dualCore.suggestMergedExportName(tgtResolved, { asVideoName: !!nameAsVideoStem });
    const dest = path.join(path.dirname(tgtResolved), suggested);
    const content = serializeSubtitle({
        format,
        cues: mergedCues,
        header: primaryDoc.header,
    });
    fs.writeFileSync(dest, content, 'utf8');
    return dest;
}

function unlinkSubtitleFilesQuietly(filePaths) {
    const list = Array.isArray(filePaths) ? filePaths : [filePaths];
    for (const filePath of list) {
        const resolved = path.resolve(String(filePath || ''));
        if (!resolved || !fs.existsSync(resolved)) continue;
        try {
            fs.unlinkSync(resolved);
        } catch (_) {
            // best-effort cleanup
        }
    }
}

module.exports = {
    dualTargetPathFromSource,
    renameStemSubtitlesWithSuffix,
    writeMergedBilingualSubtitleFiles,
    unlinkSubtitleFilesQuietly,
};
