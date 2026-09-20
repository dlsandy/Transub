/**
 * Delivery underfill QC (post viewing-punct).
 * Catches residual defects that ellipsis-only gates miss:
 * - bare「哈」over lexical JA
 * - single-char「舔」over object / reduplicated 舐め
 * - JA / [object Object] leaked into ZH
 * - visible「…」still on recover-class JA
 *
 * Pure cue-list API; Electron handoff does read/write.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubDeliveryUnderfillQc = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function deliveryUnderfillQcFactory() {
    function loadSanitize() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (global && global.TransubMtSanitize);
        } catch (_) {
            return null;
        }
    }

    function loadEllipsisPolicy() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./hymt-ellipsis-policy-core')
                : (global && global.TransubHyMtEllipsisPolicy);
        } catch (_) {
            return null;
        }
    }

    function loadDual() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./dual-subtitle-core')
                : (global && global.TransubDualSubtitle);
        } catch (_) {
            return null;
        }
    }

    function isVisibleEllipsisZh(text) {
        const t = String(text || '').trim();
        return /^(?:\.\.\.|……|…)+$/.test(t);
    }

    function isJaLeakZh(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/\[object Object\]/i.test(t)) return true;
        // Hiragana/katakana in ZH delivery (ASR/MT echo) — not CJK punctuation alone.
        return /[\u3040-\u309f\u30a0-\u30ff]/.test(t);
    }

    function resolveJaTextForZhCue(zhCue, jaCues, dual, overlapIndex) {
        const list = Array.isArray(jaCues) ? jaCues : [];
        if (!list.length || !zhCue) return '';
        const startMs = Number(zhCue.startMs);
        if (Number.isFinite(startMs)) {
            const byStart = list.find((j) => Number(j?.startMs) === startMs);
            if (byStart) return String(byStart.text || '');
        }
        if (dual?.findBestOverlapCue) {
            const endMs = zhCue.endMs != null
                ? Number(zhCue.endMs)
                : startMs + 2000;
            const hit = dual.findBestOverlapCue(list, startMs || 0, endMs, {
                index: overlapIndex,
                maxStartGapMs: 2500,
            });
            if (hit?.cue && hit.match !== 'none') {
                return String(hit.cue.text || '');
            }
        }
        const idx = Number(zhCue.index);
        if (Number.isInteger(idx) && idx >= 0 && idx < list.length) {
            return String(list[idx]?.text || '');
        }
        return '';
    }

    /**
     * @returns {{ kind: string, severity: 'repair'|'gate' }|null}
     */
    function classifyDeliveryUnderfill(zhText, jaText, sanitize = null, ellipsisPolicy = null) {
        const zh = String(zhText || '').trim();
        const ja = String(jaText || '').trim();
        const san = sanitize || loadSanitize();
        const policy = ellipsisPolicy || loadEllipsisPolicy();

        if (isJaLeakZh(zh)) {
            return { kind: 'ja_leak', severity: 'repair' };
        }
        if (san?.isBareHaBreathZh?.(zh)) {
            // Pure moan「哈…」is OK; bare「哈」or breath gloss over lexical JA is not.
            const stripped = san.stripJaBreathMoans?.(ja) || ja;
            const lexical = !!(
                san.jaCueHasLexicalResidue?.(ja)
                || (stripped && stripped !== ja && String(stripped).replace(/\s+/g, '').length >= 2)
                || (policy && ja && !policy.isPureMoanOrSfxJa?.(ja)
                    && String(ja).replace(/[\s　]+/g, '').length >= 2)
            );
            if (lexical || zh === '哈' || /^哈+$/u.test(zh)) {
                // Bare「哈」never ships;「哈…」only OK when JA is pure moan.
                if (/^哈+$/u.test(zh) || lexical) {
                    return { kind: 'bare_ha', severity: 'repair' };
                }
            }
        }
        if (san?.isUnderTranslatedLickZh?.(zh, ja)) {
            return { kind: 'under_lick', severity: 'repair' };
        }
        // Thin vocative / filler stub on lexical JA (SNOS-299 vocative-stub collapse).
        // Blank-retry used to classify these as det_only → never LLM-retried.
        if (
            zh
            && ja
            && !isVisibleEllipsisZh(zh)
            && (
                san.looksLikeFillerGlossMisattach?.(zh, ja)
                || san.looksLikeStockGlossMisattach?.(zh, ja)
                || (
                    san.isFillerOnlyZh?.(zh)
                    && san.jaCueHasLexicalResidue?.(ja)
                    && String(ja).replace(/[\s　]+/g, '').length >= 4
                )
            )
        ) {
            return { kind: 'vocative_stub', severity: 'repair' };
        }
        if (isVisibleEllipsisZh(zh) && ja) {
            if (policy?.planEllipsisSlotAction) {
                const plan = policy.planEllipsisSlotAction(ja, zh, {});
                if (plan?.action === 'recover') {
                    return { kind: 'ellipsis_recover', severity: 'gate' };
                }
            } else if (san?.jaCueHasLexicalResidue?.(ja)) {
                return { kind: 'ellipsis_recover', severity: 'gate' };
            }
        }
        return null;
    }

    function tryRepairCueText(zhText, jaText, options = {}, sanitize = null) {
        const san = sanitize || loadSanitize();
        const cur = String(zhText || '').trim();
        const ja = String(jaText || '').trim();
        if (!san || !ja) return { text: cur, changed: false };

        if (isJaLeakZh(cur)) {
            // Prefer lexical recover; fall back to … for blank-retry / prune.
            if (typeof san.sanitizeMtCueText === 'function') {
                const hit = san.sanitizeMtCueText('…', ja, {
                    avSoft: true,
                    smartTranslateFaithfulTone: true,
                    ...options,
                });
                const next = String(hit?.text || '').trim();
                if (next && !isJaLeakZh(next) && next !== cur) {
                    return { text: next, changed: true };
                }
            }
            return { text: '…', changed: cur !== '…' };
        }

        if (typeof san.sanitizeMtCueText === 'function') {
            const hit = san.sanitizeMtCueText(cur, ja, {
                avSoft: true,
                smartTranslateFaithfulTone: true,
                ...options,
            });
            const next = String(hit?.text || '').trim();
            if (next && next !== cur && !isJaLeakZh(next)) {
                const still = classifyDeliveryUnderfill(next, ja, san);
                if (!still || still.kind === 'ellipsis_recover') {
                    return { text: next, changed: true };
                }
            }
        }

        if (san.isBareHaBreathZh?.(cur) && san.recoverBareHaBreathZh) {
            const ha = san.recoverBareHaBreathZh(cur, ja, options);
            if (ha?.changed && ha.text) {
                return { text: String(ha.text), changed: true };
            }
        }
        if (san.isUnderTranslatedLickZh?.(cur, ja) && san.recoverFillerZhFromLexicalJa) {
            const lick = san.recoverFillerZhFromLexicalJa('…', ja);
            if (lick?.changed && lick.text && !san.isUnderTranslatedLickZh(lick.text, ja)) {
                return { text: String(lick.text), changed: true };
            }
        }
        return { text: cur, changed: false };
    }

    function emptyStats() {
        return {
            bareHa: 0,
            underLick: 0,
            jaLeak: 0,
            ellipsisRecover: 0,
            repaired: 0,
            totalLeft: 0,
        };
    }

    /**
     * Repair underfill defects on aligned ZH cues; recount what remains.
     * @returns {{ cues: object[], stats: object, changed: boolean }}
     */
    function repairDeliveryUnderfillCues(zhCues, jaCues, options = {}) {
        const zhList = Array.isArray(zhCues) ? zhCues.map((c) => ({ ...c })) : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        const san = loadSanitize();
        const policy = loadEllipsisPolicy();
        const dual = loadDual();
        const overlapIndex = dual?.buildOverlapIndex?.(jaList) || null;
        const stats = emptyStats();
        let changed = false;

        for (let i = 0; i < zhList.length; i += 1) {
            const z = zhList[i];
            const jaText = resolveJaTextForZhCue(z, jaList, dual, overlapIndex);
            const before = String(z?.text || '');
            let defect = classifyDeliveryUnderfill(before, jaText, san, policy);
            if (!defect) continue;

            const fixed = tryRepairCueText(before, jaText, options, san);
            if (fixed.changed) {
                zhList[i] = { ...z, text: fixed.text };
                stats.repaired += 1;
                changed = true;
                defect = classifyDeliveryUnderfill(fixed.text, jaText, san, policy);
            }
            if (!defect) continue;
            if (defect.kind === 'bare_ha') stats.bareHa += 1;
            else if (defect.kind === 'under_lick') stats.underLick += 1;
            else if (defect.kind === 'ja_leak') stats.jaLeak += 1;
            else if (defect.kind === 'ellipsis_recover') stats.ellipsisRecover += 1;
        }

        // Optional: also fill remaining … via sanitize fillBlank (short lexical).
        if (san?.fillBlankZhSlotsFromJa && options.skipFillBlank !== true) {
            const filled = san.fillBlankZhSlotsFromJa(zhList, jaList, options);
            if (filled?.filled > 0 && Array.isArray(filled.cues)) {
                for (let i = 0; i < zhList.length; i += 1) {
                    zhList[i] = filled.cues[i] || zhList[i];
                }
                stats.repaired += Number(filled.filled) || 0;
                changed = true;
            }
        }

        // Recount after fillBlank (may have cleared some ellipsis / underfills).
        const left = emptyStats();
        left.repaired = stats.repaired;
        for (let i = 0; i < zhList.length; i += 1) {
            const jaText = resolveJaTextForZhCue(zhList[i], jaList, dual, overlapIndex);
            const defect = classifyDeliveryUnderfill(zhList[i]?.text, jaText, san, policy);
            if (!defect) continue;
            if (defect.kind === 'bare_ha') left.bareHa += 1;
            else if (defect.kind === 'under_lick') left.underLick += 1;
            else if (defect.kind === 'ja_leak') left.jaLeak += 1;
            else if (defect.kind === 'ellipsis_recover') left.ellipsisRecover += 1;
        }
        left.totalLeft = left.bareHa + left.underLick + left.jaLeak + left.ellipsisRecover;
        return { cues: zhList, stats: left, changed };
    }

    /**
     * Count remaining delivery defects (no mutation).
     */
    function countDeliveryUnderfill(zhCues, jaCues) {
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        const san = loadSanitize();
        const policy = loadEllipsisPolicy();
        const dual = loadDual();
        const overlapIndex = dual?.buildOverlapIndex?.(jaList) || null;
        const stats = emptyStats();
        for (const z of zhList) {
            const jaText = resolveJaTextForZhCue(z, jaList, dual, overlapIndex);
            const defect = classifyDeliveryUnderfill(z?.text, jaText, san, policy);
            if (!defect) continue;
            if (defect.kind === 'bare_ha') stats.bareHa += 1;
            else if (defect.kind === 'under_lick') stats.underLick += 1;
            else if (defect.kind === 'ja_leak') stats.jaLeak += 1;
            else if (defect.kind === 'ellipsis_recover') stats.ellipsisRecover += 1;
        }
        stats.totalLeft = stats.bareHa + stats.underLick + stats.jaLeak + stats.ellipsisRecover;
        return stats;
    }

    function summarizeUnderfillStats(stats = {}) {
        const s = stats && typeof stats === 'object' ? stats : {};
        const bits = [];
        if (s.repaired > 0) bits.push(`已修 ${s.repaired}`);
        if (s.bareHa > 0) bits.push(`裸哈 ${s.bareHa}`);
        if (s.underLick > 0) bits.push(`欠译舔 ${s.underLick}`);
        if (s.jaLeak > 0) bits.push(`日文泄漏 ${s.jaLeak}`);
        if (s.ellipsisRecover > 0) bits.push(`实义省略号 ${s.ellipsisRecover}`);
        if (!bits.length) return '欠译护栏通过';
        return `欠译护栏 · ${bits.join(' · ')}`;
    }

    return {
        isVisibleEllipsisZh,
        isJaLeakZh,
        classifyDeliveryUnderfill,
        tryRepairCueText,
        repairDeliveryUnderfillCues,
        countDeliveryUnderfill,
        summarizeUnderfillStats,
    };
}));
