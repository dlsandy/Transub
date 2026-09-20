/**
 * Apply Transub software credit cues to a finished subtitle file.
 */
const fs = require('fs');
const path = require('path');
const { isSubtitleFile } = require('./subtitle-utils');
const {
    detectFormat,
    parseSubtitle,
    serializeSubtitle,
    isEditableFormat,
} = require('./subtitle-format');
const creditCore = require('../src/js/subtitle-software-credit-core');

function resolveIsPro(explicit) {
    if (explicit === true || explicit === false) return explicit;
    try {
        const entitlement = require('../src/js/advanced-entitlement-core');
        const { readAdvancedDoc } = require('./advanced-license-data');
        const { getAdvancedDeviceId } = require('./advanced-device-id');
        const { isDevUnlockEnabled } = require('./advanced-gates');
        if (isDevUnlockEnabled()) return true;
        const ev = entitlement.evaluateEntitlement(
            readAdvancedDoc().doc.license,
            getAdvancedDeviceId(),
        );
        return !!ev?.entitled;
    } catch {
        return false;
    }
}

async function resolveMediaDurationMs(mediaPath, cues, options = {}) {
    const explicit = Number(options.mediaDurationMs);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    const media = String(mediaPath || '').trim();
    if (media && fs.existsSync(media)) {
        try {
            const { probeVideo } = require('./ffmpeg-bridge');
            const probe = await probeVideo(media, options.ffprobePath);
            const sec = Number(probe?.duration ?? probe?.format?.duration);
            if (Number.isFinite(sec) && sec > 0) return Math.round(sec * 1000);
        } catch { /* fall through */ }
    }
    return creditCore.resolveMediaDurationMs(cues, 0);
}

function readSubtitleCues(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    if (!isSubtitleFile(path.basename(resolved))) return { ok: false, error: '不是支持的字幕文件' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const format = detectFormat(resolved, raw);
        if (!isEditableFormat(format)) {
            return { ok: false, error: `暂不支持编辑 ${format.toUpperCase()} 格式` };
        }
        const parsed = parseSubtitle(raw, format);
        return {
            ok: true,
            path: resolved,
            format: parsed.format,
            cues: parsed.cues,
            header: parsed.header || [],
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function writeSubtitleCues(filePath, payload = {}) {
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
        fs.writeFileSync(resolved, content, 'utf8');
        return { ok: true, path: resolved, cueCount: cues.length };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

/**
 * @param {string} filePath
 * @param {{
 *   mediaPath?: string,
 *   isPro?: boolean,
 *   lang?: 'zh'|'en'|'ja'|'ko'|'bilingual',
 *   dualLineOrder?: string,
 *   mediaDurationMs?: number,
 *   ffprobePath?: string,
 * }} [options]
 */
async function applySoftwareCreditToSubtitle(filePath, options = {}) {
    const doc = readSubtitleCues(filePath);
    if (!doc.ok) return doc;
    const isPro = resolveIsPro(options.isPro);
    const mediaDurationMs = await resolveMediaDurationMs(
        options.mediaPath,
        doc.cues,
        options,
    );
    const applied = creditCore.insertSoftwareCreditIntoCues(doc.cues, {
        isPro,
        lang: options.lang || 'zh',
        dualLineOrder: options.dualLineOrder,
        mediaDurationMs,
        durationMs: creditCore.CREDIT_DURATION_MS,
    });
    if (!applied.changed) {
        return {
            ok: true,
            skipped: true,
            written: false,
            path: doc.path,
            summary: '软件信息已存在',
            isPro,
            mediaDurationMs,
        };
    }
    const written = writeSubtitleCues(doc.path, {
        cues: applied.cues,
        format: doc.format,
        header: doc.header,
    });
    if (!written.ok) return written;
    const parts = [];
    if (applied.headInserted) parts.push('片头');
    if (applied.headMerged) parts.push('片头合并');
    if (applied.tailInserted) parts.push('片尾');
    if (applied.tailMerged) parts.push('片尾合并');
    return {
        ok: true,
        written: true,
        path: doc.path,
        isPro,
        creditText: applied.creditText,
        mediaDurationMs: applied.mediaDurationMs,
        summary: `已插入软件信息（${parts.join('·') || '更新'}）`,
        headInserted: !!applied.headInserted,
        headMerged: !!applied.headMerged,
        tailInserted: !!applied.tailInserted,
        tailMerged: !!applied.tailMerged,
    };
}

module.exports = {
    applySoftwareCreditToSubtitle,
    resolveIsPro,
};
