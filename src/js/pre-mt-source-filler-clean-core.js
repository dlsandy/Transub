/**
 * Pre-MT source-track filler clean (onomatopoeia + discourse + inline breath).
 * Cuts MT load before translation; post-batch bilingual compact remains fallback.
 */
(function (global, factory) {
    const onoCore = (typeof module !== 'undefined' && module.exports)
        ? require('./pre-mt-onomatopoeia-clean-core')
        : (global && global.TransubPreMtOnomatopoeiaClean);
    const fluency = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-fluency-core')
        : (global && global.TransubSubtitleFluency);
    const settingsNorm = (typeof module !== 'undefined' && module.exports)
        ? (() => {
            try { return require('./settings-options-normalize-core'); } catch { return null; }
        })()
        : (global && global.TransubSettingsOptionsNormalize);
    const softViewing = (typeof module !== 'undefined' && module.exports)
        ? (() => {
            try { return require('./av-soft-viewing-policy-core'); } catch { return null; }
        })()
        : (global && global.TransubAvSoftViewingPolicy);
    const api = factory(onoCore, fluency, settingsNorm, softViewing);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPreMtSourceFillerClean = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function preMtSourceFillerCleanFactory(onoCore, fluency, settingsNorm, softViewing) {
    function normalizeMode(raw, fallback = 'clear') {
        if (settingsNorm && typeof settingsNorm.normalizeViewingCleanMode === 'function') {
            return settingsNorm.normalizeViewingCleanMode(raw, fallback);
        }
        const v = String(raw || '').trim().toLowerCase();
        if (v === 'off' || v === 'light' || v === 'clear') return v;
        if (raw === false) return 'off';
        if (raw === true) return 'clear';
        return fallback;
    }

    function resolveSourceLang(options = {}) {
        if (onoCore && typeof onoCore.resolveSourceLang === 'function') {
            return onoCore.resolveSourceLang(options);
        }
        return 'ja';
    }

    function resolveOnomatopoeiaMode(options = {}) {
        if (onoCore && typeof onoCore.resolveModeFromOptions === 'function') {
            return onoCore.resolveModeFromOptions(options);
        }
        return 'clear';
    }

    /**
     * Honor postBatchInterjectionMode (+ av_soft pin to clear).
     * Legacy compact boolean only when mode field absent.
     */
    function resolveInterjectionMode(options = {}) {
        let mode = 'clear';
        if (Object.prototype.hasOwnProperty.call(options, 'postBatchInterjectionMode')) {
            mode = normalizeMode(options.postBatchInterjectionMode, 'clear');
        } else if (options.postBatchCompactPureInterjections === false) {
            mode = 'off';
        } else if (options.postBatchCompactPureInterjections === true) {
            mode = 'clear';
        }
        if (softViewing && typeof softViewing.resolveAvSoftViewingCleanMode === 'function') {
            return softViewing.resolveAvSoftViewingCleanMode(options, mode);
        }
        return mode;
    }

    /**
     * Drop / soften pure discourse cues on the source track before MT.
     */
    function applyPreMtDiscourseClean(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const mode = resolveInterjectionMode(options);
        if (!list.length) {
            return {
                cues: list,
                mode,
                dropped: 0,
                droppedIndexes: [],
                softened: 0,
                changed: false,
                skipped: true,
                reason: 'empty',
                summary: '译前语气清理：无原文条目',
            };
        }
        if (mode === 'off') {
            return {
                cues: list,
                mode,
                dropped: 0,
                droppedIndexes: [],
                softened: 0,
                changed: false,
                skipped: true,
                reason: 'off',
                summary: '译前语气清理：已关闭',
            };
        }
        if (!fluency || typeof fluency.isPureDiscourseForLang !== 'function') {
            return {
                cues: list,
                mode,
                dropped: 0,
                droppedIndexes: [],
                softened: 0,
                changed: false,
                skipped: true,
                reason: 'no_fluency',
                summary: '译前语气清理：通顺度模块不可用',
            };
        }
        const lang = resolveSourceLang(options);

        if (mode === 'light') {
            if (typeof fluency.softenPureFillerInCues !== 'function') {
                return {
                    cues: list,
                    mode,
                    dropped: 0,
                    droppedIndexes: [],
                    softened: 0,
                    changed: false,
                    skipped: true,
                    reason: 'no_soften',
                    summary: '译前语气轻度：不可用',
                };
            }
            let softened = 0;
            const next = list.map((c) => {
                const text = String(c?.text ?? '');
                if (!text.trim() || !fluency.isPureDiscourseForLang(text, lang)) return c;
                const soft = fluency.softenPureFillerInCues(
                    [{ startMs: 0, endMs: 1, text }],
                    { kind: 'discourse', lang },
                );
                const outText = soft?.cues?.[0]?.text;
                if (!soft?.stats?.cueTouched || outText == null || outText === text) return c;
                softened += 1;
                return { ...c, text: outText };
            });
            return {
                cues: next,
                mode,
                dropped: 0,
                droppedIndexes: [],
                softened,
                changed: softened > 0,
                summary: softened
                    ? `译前语气轻度精简 ${softened} 条`
                    : '译前语气轻度：无需修改',
            };
        }

        const kept = [];
        const droppedIndexes = [];
        for (let i = 0; i < list.length; i += 1) {
            const text = String(list[i]?.text ?? '').trim();
            if (text && fluency.isPureDiscourseForLang(text, lang)) {
                droppedIndexes.push(i);
                continue;
            }
            kept.push(list[i]);
        }
        const dropped = droppedIndexes.length;
        return {
            cues: kept,
            mode,
            dropped,
            droppedIndexes,
            softened: 0,
            changed: dropped > 0,
            summary: dropped
                ? `译前清除语气 ${dropped} 条（${list.length}→${kept.length}）`
                : '译前清除语气：无需删除',
        };
    }

    /**
     * Peel lead/mid JA breath on mixed cues (あぁ、大丈夫 → 大丈夫).
     * Only when clear-mode discourse or onomatopoeia is active.
     */
    function applyPreMtInlineBreathClean(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const onoMode = resolveOnomatopoeiaMode(options);
        const discMode = resolveInterjectionMode(options);
        const doDisc = discMode === 'clear';
        const doOno = onoMode === 'clear';
        if (!doDisc && !doOno) {
            return {
                cues: list,
                changed: false,
                skipped: true,
                reason: 'modes_off',
                stats: { cueTouched: 0, dropped: 0 },
                summary: '译前行内气声：跳过（非清除档）',
            };
        }
        if (!fluency || typeof fluency.stripInlineFillersInCues !== 'function') {
            return {
                cues: list,
                changed: false,
                skipped: true,
                reason: 'no_fluency',
                stats: { cueTouched: 0, dropped: 0 },
                summary: '译前行内气声：通顺度模块不可用',
            };
        }
        const lang = resolveSourceLang(options);
        const stripped = fluency.stripInlineFillersInCues(list, {
            checkDiscourse: doDisc,
            checkOnomatopoeia: doOno,
            lang,
            targetLang: lang,
            dropEmptied: true,
            // JA source: do not collapse ZH stutter here.
            collapseStutter: false,
        });
        const touched = Number(stripped.stats?.cueTouched) || 0;
        const dropped = Number(stripped.stats?.dropped) || 0;
        return {
            cues: stripped.cues,
            changed: touched > 0 || dropped > 0,
            skipped: false,
            stats: stripped.stats,
            changedIndexes: stripped.changedIndexes,
            droppedIndexes: stripped.droppedIndexes,
            summary: (touched || dropped)
                ? (stripped.summary || `译前行内气声 ${touched} 条`)
                : '译前行内气声：无需修改',
        };
    }

    /**
     * Full pre-MT source filler pass: pure ono → pure discourse → inline breath.
     */
    function applyPreMtSourceFillerClean(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const before = list.length;
        const bits = [];
        let next = list;
        let changed = false;
        let droppedTotal = 0;
        let softenedTotal = 0;
        let inlineTouched = 0;

        const ono = (onoCore && typeof onoCore.applyPreMtOnomatopoeiaClean === 'function')
            ? onoCore.applyPreMtOnomatopoeiaClean(next, options)
            : {
                cues: next,
                mode: 'off',
                dropped: 0,
                softened: 0,
                changed: false,
                skipped: true,
                summary: '',
            };
        next = ono.cues || next;
        if (ono.changed) changed = true;
        droppedTotal += Number(ono.dropped) || 0;
        softenedTotal += Number(ono.softened) || 0;
        if (ono.summary && !ono.skipped && ono.mode !== 'off') bits.push(ono.summary);

        const disc = applyPreMtDiscourseClean(next, options);
        next = disc.cues || next;
        if (disc.changed) changed = true;
        droppedTotal += Number(disc.dropped) || 0;
        softenedTotal += Number(disc.softened) || 0;
        if (disc.summary && !disc.skipped && disc.mode !== 'off') bits.push(disc.summary);

        const inline = applyPreMtInlineBreathClean(next, options);
        next = inline.cues || next;
        if (inline.changed) changed = true;
        droppedTotal += Number(inline.stats?.dropped) || 0;
        inlineTouched = Number(inline.stats?.cueTouched) || 0;
        if (inline.summary && !inline.skipped && inline.changed) bits.push(inline.summary);

        return {
            cues: next,
            changed,
            dropped: droppedTotal,
            softened: softenedTotal,
            inlineTouched,
            beforeCount: before,
            afterCount: next.length,
            onomatopoeia: ono,
            discourse: disc,
            inlineBreath: inline,
            summary: bits.length
                ? `译前源轨清理：${bits.join(' · ')}（${before}→${next.length}）`
                : (changed ? '译前源轨清理：已处理' : '译前源轨清理：无需修改'),
        };
    }

    return {
        normalizeMode,
        resolveSourceLang,
        resolveOnomatopoeiaMode,
        resolveInterjectionMode,
        applyPreMtDiscourseClean,
        applyPreMtInlineBreathClean,
        applyPreMtSourceFillerClean,
    };
}));
