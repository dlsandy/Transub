/**
 * Batch post-process: insert subtitle editor text-preset groups into output files.
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
const { readTextPresets } = require('./text-presets-data');

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
 * @param {string} groupId
 * @param {{ baseMs?: number }} options
 */
function applyTextPresetGroupToSubtitle(filePath, groupId, options = {}) {
    const wantId = String(groupId || '').trim();
    if (!wantId) {
        return { ok: true, skipped: true, written: false, summary: '未选择预设组' };
    }
    const presetsRes = readTextPresets();
    if (!presetsRes?.ok) {
        return { ok: false, error: presetsRes?.error || '无法读取字幕预设组' };
    }
    const textPresetsCore = require('../src/js/subtitle-text-presets-core');
    const group = textPresetsCore.findGroup(presetsRes.presetsDoc, wantId);
    if (!group) {
        return { ok: false, error: '未找到预设组', groupId: wantId };
    }
    const doc = readSubtitleCues(filePath);
    if (!doc.ok) return doc;
    const beforeCount = doc.cues.length;
    const applied = textPresetsCore.insertGroupIntoCues(doc.cues, group, {
        baseMs: options.baseMs,
    });
    if (!(applied.inserted > 0)) {
        return {
            ok: true,
            skipped: true,
            written: false,
            path: doc.path,
            summary: '预设组无有效条目',
            groupName: applied.groupName || group.name,
        };
    }
    const written = writeSubtitleCues(doc.path, {
        cues: applied.cues,
        format: doc.format,
        header: doc.header,
    });
    if (!written.ok) return written;
    const anchorLabel = applied.anchor === 'absolute' ? '视频起点' : '视频起点（批量）';
    return {
        ok: true,
        written: true,
        path: doc.path,
        beforeCount,
        afterCount: applied.cues.length,
        inserted: applied.inserted,
        groupName: applied.groupName || group.name,
        summary: `已插入预设组「${applied.groupName || group.name}」${applied.inserted} 条（相对${anchorLabel}）`,
    };
}

module.exports = {
    applyTextPresetGroupToSubtitle,
};
