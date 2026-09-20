/**
 * Apply delivery underfill QC repair to a ZH/JA subtitle pair on disk.
 */
const path = require('path');

function applyDeliveryUnderfillRepair(zhPath, jaPath, options = {}) {
    const zh = String(zhPath || '').trim();
    const ja = String(jaPath || '').trim();
    if (!zh || !ja) {
        return { ok: false, error: 'missing_path', repaired: 0, totalLeft: 0 };
    }
    let qc;
    try {
        qc = require('../src/js/delivery-underfill-qc-core');
    } catch (err) {
        return { ok: false, error: err.message || 'underfill_qc_unavailable', repaired: 0, totalLeft: 0 };
    }
    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    const zhDoc = readSubtitleDocument(zh);
    if (!zhDoc?.ok) {
        return { ok: false, error: zhDoc?.error || 'zh_read_failed', repaired: 0, totalLeft: 0 };
    }
    const jaDoc = readSubtitleDocument(ja);
    if (!jaDoc?.ok) {
        return { ok: false, error: jaDoc?.error || 'ja_read_failed', repaired: 0, totalLeft: 0 };
    }
    const result = qc.repairDeliveryUnderfillCues(zhDoc.cues || [], jaDoc.cues || [], options);
    if (result.changed) {
        const written = writeSubtitleDocument(zh, {
            cues: result.cues,
            format: zhDoc.format,
            header: zhDoc.header,
            backupMode: options.backupMode || 'off',
        });
        if (!written?.ok) {
            return {
                ok: false,
                error: written?.error || 'zh_write_failed',
                repaired: 0,
                totalLeft: result.stats?.totalLeft || 0,
                stats: result.stats,
            };
        }
    }
    const stats = result.stats || {};
    return {
        ok: true,
        repaired: Number(stats.repaired) || 0,
        totalLeft: Number(stats.totalLeft) || 0,
        stats,
        summary: qc.summarizeUnderfillStats(stats),
        path: path.basename(zh),
    };
}

function countDeliveryUnderfillLeft(zhPath, jaPath) {
    const zh = String(zhPath || '').trim();
    const ja = String(jaPath || '').trim();
    if (!zh || !ja) return { totalLeft: 0, bareHa: 0, underLick: 0, jaLeak: 0, ellipsisRecover: 0 };
    let qc;
    try {
        qc = require('../src/js/delivery-underfill-qc-core');
    } catch {
        return { totalLeft: 0, bareHa: 0, underLick: 0, jaLeak: 0, ellipsisRecover: 0 };
    }
    const fs = require('fs');
    if (!fs.existsSync(zh) || !fs.existsSync(ja)) {
        return { totalLeft: 0, bareHa: 0, underLick: 0, jaLeak: 0, ellipsisRecover: 0 };
    }
    const { readSubtitleDocument } = require('./extensions-bridge');
    const zhDoc = readSubtitleDocument(zh);
    const jaDoc = readSubtitleDocument(ja);
    if (!zhDoc?.ok || !jaDoc?.ok) {
        return { totalLeft: 0, bareHa: 0, underLick: 0, jaLeak: 0, ellipsisRecover: 0 };
    }
    return qc.countDeliveryUnderfill(zhDoc.cues || [], jaDoc.cues || []);
}

module.exports = {
    applyDeliveryUnderfillRepair,
    countDeliveryUnderfillLeft,
};
