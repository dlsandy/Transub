/**
 * Rematerialize ZH cues onto a JA/source subtitle timeline (time-overlap merge).
 * Prevents index-zip 错位 after ZH-only CPS / QC split.
 *
 * When ZH timeline is dead / QC-packed (all ~500ms from t≈0), overlap matching
 * fails and would blank the track — fall back to positional zip onto JA times.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {object[]} sourceCues
 * @param {object[]} translatedCues
 * @param {{ blankText?: string, preferIndex?: boolean, preferPositional?: boolean }} [options]
 */
function rematerializeCuesOntoSource(sourceCues, translatedCues, options = {}) {
    const mtSanitize = require('../src/js/mt-sanitize-core');
    const src = Array.isArray(sourceCues) ? sourceCues : [];
    const zh = Array.isArray(translatedCues) ? translatedCues : [];
    if (!src.length) return { cues: zh, changed: false };

    let preferPositional = options.preferPositional === true;
    if (!preferPositional) {
        try {
            const keep = require('./transcript-keep');
            preferPositional = keep.cuesHaveBrokenTimeline(zh)
                && !keep.cuesHaveBrokenTimeline(src);
        } catch { /* optional */ }
    }

    if (preferPositional) {
        const blankText = options.blankText != null ? String(options.blankText) : '…';
        let changed = 0;
        const cues = src.map((s, i) => {
            const idx = Number.isInteger(Number(s?.index)) ? Number(s.index) : i;
            const text = i < zh.length
                ? String(zh[i]?.text ?? '').trim()
                : blankText;
            if (!text || text === blankText) changed += 1;
            return {
                index: idx,
                startMs: s.startMs,
                endMs: s.endMs,
                text: text || blankText,
            };
        });
        if (cues.length !== zh.length) changed += Math.abs(cues.length - zh.length);
        return {
            cues,
            changed,
            mode: 'positional-dead-timeline',
        };
    }

    return mtSanitize.rematerializeTranslatedOntoSource(sourceCues, translatedCues, options);
}

/**
 * If ZH cue count differs from JA (or force / broken ZH timeline), rewrite ZH onto JA timeline.
 * @returns {{ ok: boolean, skipped?: boolean, written?: boolean, beforeCount?: number, afterCount?: number, changed?: number, reason?: string, error?: string, mode?: string }}
 */
function rematerializeSubtitlePairFiles(targetPath, sourcePath, options = {}) {
    const tgt = String(targetPath || '').trim();
    const src = String(sourcePath || '').trim();
    if (!tgt || !src) {
        return { ok: true, skipped: true, reason: 'missing_path' };
    }
    if (path.resolve(tgt) === path.resolve(src)) {
        return { ok: true, skipped: true, reason: 'same_path' };
    }
    if (!fs.existsSync(tgt) || !fs.existsSync(src)) {
        return { ok: true, skipped: true, reason: 'missing_file' };
    }

    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    const targetDoc = readSubtitleDocument(tgt);
    if (!targetDoc?.ok) return { ok: false, error: targetDoc?.error || 'read_target_failed' };
    const sourceDoc = readSubtitleDocument(src);
    if (!sourceDoc?.ok) return { ok: false, error: sourceDoc?.error || 'read_source_failed' };

    const zhCues = Array.isArray(targetDoc.cues) ? targetDoc.cues : [];
    const jaCues = Array.isArray(sourceDoc.cues) ? sourceDoc.cues : [];
    if (!jaCues.length || !zhCues.length) {
        return { ok: true, skipped: true, reason: 'empty_cues' };
    }

    let force = options.force === true;
    let preferPositional = options.preferPositional === true;
    try {
        const keep = require('./transcript-keep');
        if (!force && keep.cuesHaveBrokenTimeline(zhCues) && !keep.cuesHaveBrokenTimeline(jaCues)) {
            force = true;
            preferPositional = true;
        }
    } catch { /* optional */ }

    if (!force && zhCues.length === jaCues.length && options.onlyWhenCountDiffers !== false) {
        if (options.forceIfSuspicious !== true) {
            return {
                ok: true,
                skipped: true,
                reason: 'counts_match',
                beforeCount: zhCues.length,
                afterCount: zhCues.length,
            };
        }
    }

    const laid = rematerializeCuesOntoSource(jaCues, zhCues, {
        blankText: options.blankText != null ? options.blankText : '…',
        preferIndex: options.preferIndex === true,
        preferPositional,
    });
    if (!laid?.cues?.length) {
        return { ok: false, error: 'rematerialize_empty' };
    }

    const blankText = options.blankText != null ? String(options.blankText) : '…';
    const blankOf = (list) => (Array.isArray(list) ? list : []).filter((c) => {
        const t = String(c?.text ?? '').trim();
        return !t || t === blankText || /^(?:…|\.{3}|⋯)+$/.test(t);
    }).length;
    const blanksAfter = blankOf(laid.cues);
    // Prefer positional zip over shipping a mass-「…」 track into blank-retry storm.
    if (
        !preferPositional
        && laid.cues.length >= 8
        && blanksAfter > Math.ceil(laid.cues.length * 0.35)
    ) {
        const positional = rematerializeCuesOntoSource(jaCues, zhCues, {
            blankText,
            preferPositional: true,
        });
        if (
            Array.isArray(positional?.cues)
            && blankOf(positional.cues) < blanksAfter
        ) {
            Object.assign(laid, positional);
        }
    }

    const written = writeSubtitleDocument(tgt, {
        cues: laid.cues,
        format: targetDoc.format,
        header: targetDoc.header,
        backupMode: options.backupMode || 'off',
    });
    if (!written?.ok) return written;

    return {
        ok: true,
        written: true,
        beforeCount: zhCues.length,
        afterCount: laid.cues.length,
        changed: laid.changed || 0,
        mode: laid.mode,
    };
}

/**
 * In-memory: rematerialize when counts drift, or ZH timeline is dead/QC-packed.
 * @returns {{ cues: object[], rematerialized: boolean, changed: number, mode?: string }}
 */
function rematerializeCuesIfNeeded(zhCues, jaCues, options = {}) {
    const zh = Array.isArray(zhCues) ? zhCues : [];
    const ja = Array.isArray(jaCues) ? jaCues : [];
    if (!ja.length || !zh.length) {
        return { cues: zh, rematerialized: false, changed: 0 };
    }
    let force = options.force === true;
    let preferPositional = options.preferPositional === true;
    try {
        const keep = require('./transcript-keep');
        if (!force && keep.cuesHaveBrokenTimeline(zh) && !keep.cuesHaveBrokenTimeline(ja)) {
            force = true;
            preferPositional = true;
        }
    } catch { /* optional */ }

    if (!force && zh.length === ja.length) {
        return { cues: zh, rematerialized: false, changed: 0 };
    }
    const laid = rematerializeCuesOntoSource(ja, zh, {
        blankText: options.blankText != null ? options.blankText : '…',
        preferIndex: false,
        preferPositional,
    });
    return {
        cues: laid.cues || zh,
        rematerialized: true,
        changed: laid.changed || 0,
        mode: laid.mode,
    };
}

module.exports = {
    rematerializeCuesOntoSource,
    rematerializeSubtitlePairFiles,
    rematerializeCuesIfNeeded,
};
