/**
 * Subtitle document read/write/QC/preview helpers.
 * Extracted from extensions-bridge (pure I/O; no IPC registration).
 */

const fs = require('fs');
const path = require('path');
const {
    collectSubtitleSidecars,
    isSubtitleFile,
} = require('./subtitle-utils');
const { parseSubtitle, serializeSubtitle, detectFormat, isEditableFormat } = require('./subtitle-format');
const { getWritableRoot } = require('./app-paths');

function readSubtitleDocument(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    if (!isSubtitleFile(path.basename(resolved))) return { ok: false, error: '不是支持的字幕文件' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const format = detectFormat(resolved, raw);
        if (!isEditableFormat(format)) {
            return { ok: false, error: `暂不支持编辑 ${format.toUpperCase()} 格式，请使用 SRT / VTT / LRC / ASS` };
        }
        const parsed = parseSubtitle(raw, format);
        return {
            ok: true,
            path: resolved,
            basename: path.basename(resolved),
            format: parsed.format,
            cues: parsed.cues,
            header: parsed.header || [],
            cueCount: parsed.cues.length,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function scanSubtitleQc(filePath, options = {}) {
    const doc = readSubtitleDocument(filePath);
    if (!doc.ok) return doc;
    let qc;
    try {
        qc = require('../src/js/subtitle-qc-core');
    } catch (err) {
        return { ok: false, error: err.message || '无法加载 QC 模块' };
    }
    const scanOpts = typeof qc.defaultPostBatchQcScanOptions === 'function'
        ? qc.defaultPostBatchQcScanOptions(options)
        : { checkFluency: true, gapMs: 1, ...options };
    const { issues, summary } = qc.scanCueIssues(doc.cues, scanOpts);
    const summaryText = typeof qc.summarizeScan === 'function'
        ? qc.summarizeScan(summary)
        : (summary?.total ? `${summary.total} 条有问题` : '未发现问题');
    const shortParts = [];
    if (summary?.overlap) shortParts.push(`重叠 ${summary.overlap}`);
    if (summary?.highCps) shortParts.push(`CPS ${summary.highCps}`);
    if (summary?.splittable) shortParts.push(`可分割 ${summary.splittable}`);
    if (summary?.connected) shortParts.push(`连续文本 ${summary.connected}`);
    if (summary?.repetition) shortParts.push(`叠词 ${summary.repetition}`);
    if (summary?.short) shortParts.push(`过短 ${summary.short}`);
    if (summary?.long) shortParts.push(`过长 ${summary.long}`);
    if (summary?.duplicate) shortParts.push(`连续重复 ${summary.duplicate}`);
    if (summary?.fluency) shortParts.push(`通顺度 ${summary.fluency}`);
    if (summary?.invalid) shortParts.push(`无效 ${summary.invalid}`);
    if (summary?.autoFixable && summary?.advisory) {
        shortParts.push(`可修 ${summary.autoFixable}`);
    }
    return {
        ok: true,
        path: doc.path,
        cueCount: Array.isArray(doc.cues) ? doc.cues.length : 0,
        issueCount: Number(summary?.total) || 0,
        summary,
        summaryText,
        shortSummary: shortParts.length ? shortParts.join(' · ') : (summary?.total ? `${summary.total} 项` : '通过'),
        issues: Array.isArray(issues) ? issues.slice(0, 50) : [],
    };
}

/**
 * True for JA/source archive tracks (noise may be deleted).
 * Translation tracks should blank noise so cue count stays aligned.
 */
function isSourceSubtitleTrack(filePath) {
    const base = path.basename(String(filePath || ''));
    return /\.src\.|_src\.|\.source\./i.test(base)
        || /\.transcribe\./i.test(base)
        || /\.original\./i.test(base)
        || /[.\\_-]ja(?:\.|$)/i.test(base);
}

const SUBTITLE_BAK_MODES = new Set(['off', 'beside', 'appBackup']);

function normalizeSubtitleBakMode(value) {
    const mode = String(value || '').trim();
    return SUBTITLE_BAK_MODES.has(mode) ? mode : 'off';
}

function resolveSubtitleBackupPath(resolved, backupMode) {
    const mode = normalizeSubtitleBakMode(backupMode);
    if (mode === 'off') return null;
    if (mode === 'appBackup') {
        return path.join(getWritableRoot(), 'backup', `${path.basename(resolved)}.bak`);
    }
    return `${resolved}.bak`;
}

function resolveWriteBackupMode(payload = {}) {
    if (payload.backupMode != null) {
        return normalizeSubtitleBakMode(payload.backupMode);
    }
    if (payload.createBackup === true) return 'beside';
    if (payload.createBackup === false) return 'off';
    return 'off';
}

function writeSubtitleDocument(filePath, payload = {}) {
    const resolved = path.resolve(String(filePath || ''));
    const format = detectFormat(resolved, '');
    const saveFormat = isEditableFormat(payload.format) ? payload.format : format;
    if (!isEditableFormat(saveFormat)) {
        return { ok: false, error: '不支持的字幕格式' };
    }
    const cues = Array.isArray(payload.cues) ? payload.cues : [];
    if (!cues.length) return { ok: false, error: '字幕内容为空' };
    try {
        const content = serializeSubtitle({
            format: saveFormat,
            cues,
            header: payload.header,
        });
        let backupPath;
        const backupMode = resolveWriteBackupMode(payload);
        const targetBackup = resolveSubtitleBackupPath(resolved, backupMode);
        if (targetBackup && fs.existsSync(resolved)) {
            fs.mkdirSync(path.dirname(targetBackup), { recursive: true });
            fs.copyFileSync(resolved, targetBackup);
            backupPath = targetBackup;
        }
        fs.writeFileSync(resolved, content, 'utf8');
        return { ok: true, path: resolved, backupPath, cueCount: cues.length };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function listSubtitleSidecars(videoPath, outputDir) {
    const resolved = path.resolve(String(videoPath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '媒体文件不存在' };
    const seen = new Set();
    const sidecars = [];
    const add = (p) => {
        const key = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
        if (seen.has(key)) return;
        seen.add(key);
        sidecars.push(path.resolve(p));
    };

    for (const p of collectSubtitleSidecars(resolved)) add(p);

    if (outputDir) {
        const dir = path.resolve(String(outputDir));
        const stem = path.basename(resolved, path.extname(resolved));
        try {
            for (const name of fs.readdirSync(dir)) {
                if (!isSubtitleFile(name)) continue;
                const fileStem = name.slice(0, name.length - path.extname(name).length);
                if (fileStem === stem || fileStem.startsWith(`${stem}.`)) {
                    add(path.join(dir, name));
                }
            }
        } catch (_) { /* skip */ }
    }

    const items = sidecars.map((p) => {
        let format = detectFormat(p, '');
        const editable = isEditableFormat(format);
        return {
            path: p,
            basename: path.basename(p),
            format,
            editable,
        };
    });
    return { ok: true, sidecars: items };
}

function readSubtitlePreview(filePath, maxLines = 24) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const lines = raw.split(/\r?\n/).slice(0, maxLines);
        return { ok: true, path: resolved, preview: lines.join('\n'), truncated: raw.split(/\r?\n/).length > maxLines };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

module.exports = {
    readSubtitleDocument,
    writeSubtitleDocument,
    scanSubtitleQc,
    readSubtitlePreview,
    listSubtitleSidecars,
    isSourceSubtitleTrack,
    normalizeSubtitleBakMode,
    resolveSubtitleBackupPath,
    resolveWriteBackupMode,
};
