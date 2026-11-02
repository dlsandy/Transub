/**
 * Pre-MT source-track onomatopoeia clean (honor postBatchOnomatopoeiaMode).
 * Clear drops pure onomatopoeia cues from JA (etc.) before translation to cut MT load;
 * light softens stacks without deleting; off is a no-op.
 * Post-batch compact remains as bilingual delivery fallback.
 */
(function (global, factory) {
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
    const api = factory(fluency, settingsNorm, softViewing);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPreMtOnomatopoeiaClean = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function preMtOnomatopoeiaCleanFactory(fluency, settingsNorm, softViewing) {
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
        const raw = String(
            options.sourceLang
            || options.language
            || options.asrLanguage
            || options.engineLanguage
            || 'ja',
        ).trim().toLowerCase();
        if (fluency && typeof fluency.normalizeFillerLang === 'function') {
            return fluency.normalizeFillerLang(raw);
        }
        if (raw.startsWith('zh')) return 'zh';
        if (raw.startsWith('en')) return 'en';
        if (raw.startsWith('ko')) return 'ko';
        return 'ja';
    }

    function resolveModeFromOptions(options = {}) {
        let mode = 'clear';
        if (Object.prototype.hasOwnProperty.call(options, 'postBatchOnomatopoeiaMode')) {
            mode = normalizeMode(options.postBatchOnomatopoeiaMode, 'clear');
        } else if (options.postBatchCompactPureInterjections === false) {
            // Legacy boolean: only when mode field absent.
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
     * @param {object[]} cues engine or editor cues
     * @param {object} [options] runtime / saved options
     * @returns {{
     *   cues: object[],
     *   mode: 'off'|'light'|'clear',
     *   dropped: number,
     *   droppedIndexes: number[],
     *   softened: number,
     *   changed: boolean,
     *   summary: string,
     *   skipped?: boolean,
     *   reason?: string,
     * }}
     */
    function applyPreMtOnomatopoeiaClean(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const mode = resolveModeFromOptions(options);
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
                summary: '译前拟声清理：无原文条目',
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
                summary: '译前拟声清理：已关闭',
            };
        }
        if (!fluency || typeof fluency.isPureOnomatopoeiaForLang !== 'function') {
            return {
                cues: list,
                mode,
                dropped: 0,
                droppedIndexes: [],
                softened: 0,
                changed: false,
                skipped: true,
                reason: 'no_fluency',
                summary: '译前拟声清理：通顺度模块不可用',
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
                    summary: '译前拟声轻度：不可用',
                };
            }
            let softened = 0;
            const next = list.map((c) => {
                const text = String(c?.text ?? '');
                if (!text.trim() || !fluency.isPureOnomatopoeiaForLang(text, lang)) return c;
                const soft = fluency.softenPureFillerInCues(
                    [{ startMs: 0, endMs: 1, text }],
                    { kind: 'onomatopoeia', lang },
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
                    ? `译前拟声轻度精简 ${softened} 条`
                    : '译前拟声轻度：无需修改',
            };
        }

        // clear — drop pure onomatopoeia cues from the source track before MT.
        const kept = [];
        const droppedIndexes = [];
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const text = String(cue?.text ?? '').trim();
            const evt = String(cue?.audioEvent || cue?.audio_event || '').trim().toUpperCase();
            const nonspeechEvt = evt && evt !== 'SPEECH'
                && /^(BGM|APPLAUSE|LAUGHTER|CRY|SNEEZE|BREATH|COUGH|MUSIC)$/.test(evt);
            // Short nonspeech SenseVoice events: treat as pure onomatopoeia-like drop.
            const shortNonspeech = nonspeechEvt && text.length > 0 && text.length <= 12;
            if ((text && fluency.isPureOnomatopoeiaForLang(text, lang)) || shortNonspeech) {
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
                ? `译前清除拟声 ${dropped} 条（${list.length}→${kept.length}）`
                : '译前清除拟声：无需删除',
        };
    }

    return {
        normalizeMode,
        resolveModeFromOptions,
        resolveSourceLang,
        applyPreMtOnomatopoeiaClean,
    };
}));
