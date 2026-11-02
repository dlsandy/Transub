/**
 * Optional SenseVoice emotion → MT tone hints (default off).
 */
(function (global, factory) {
    const richApi = (typeof module !== 'undefined' && module.exports)
        ? (() => { try { return require('./sensevoice-rich-tags-core'); } catch { return null; } })()
        : (global && global.TransubSensevoiceRichTags);
    const api = factory(richApi);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSensevoiceEmotionMtStyle = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sensevoiceEmotionMtStyleFactory(richApi) {
    /** Neutral tone hints only — no adult / NSFW surface. */
    const HINT_BY_EMOTION = Object.freeze({
        HAPPY: '语气偏轻松愉快，勿夸张到喊叫',
        SAD: '语气偏低沉克制',
        ANGRY: '语气偏急促有力，勿加脏词',
        FEARFUL: '语气偏紧张、短句',
        DISGUSTED: '语气偏嫌弃，勿人身攻击扩写',
        SURPRISED: '语气略惊讶，勿加多余感叹堆叠',
    });

    const FAITHFUL_GUARD = '只调整措辞语气；勿改专名、数字、否定与使被役关系。';

    function normalizeSensevoiceEmotionMtStyle(value) {
        const v = String(value == null ? '' : value).trim().toLowerCase();
        if (!v) return 'off';
        if (v === 'hint' || v === 'on' || v === 'true' || v === '1') return 'hint';
        if (v === 'hint+polish' || v === 'hint_polish' || v === 'polish') return 'hint+polish';
        return 'off';
    }

    function emotionMtStyleActive(style, richTagsMode) {
        const s = normalizeSensevoiceEmotionMtStyle(style);
        if (s === 'off') return false;
        if (richApi?.richTagsEnabled && !richApi.richTagsEnabled(richTagsMode)) return false;
        if (richTagsMode != null && String(richTagsMode).trim().toLowerCase() === 'off') return false;
        return true;
    }

    function normalizeEmotion(raw) {
        if (richApi?.normalizeEmotion) return richApi.normalizeEmotion(raw);
        const u = String(raw || '').trim().toUpperCase();
        if (!u || u === 'NEUTRAL' || u === 'EMO_UNKNOWN') return null;
        return HINT_BY_EMOTION[u] ? u : null;
    }

    function hintForEmotion(emotion) {
        const emo = normalizeEmotion(emotion);
        if (!emo) return '';
        return HINT_BY_EMOTION[emo] || '';
    }

    /**
     * Build a short block for a cue window / batch.
     * @returns {string} empty when off or no usable emotions
     */
    function buildEmotionMtStyleBlock(cues, options = {}) {
        if (!emotionMtStyleActive(options.sensevoiceEmotionMtStyle, options.sensevoiceRichTags)) {
            return '';
        }
        const seen = new Set();
        const lines = [];
        for (const c of Array.isArray(cues) ? cues : []) {
            const emo = normalizeEmotion(
                c?.emotion
                ?? c?.meta?.emotion
                ?? options.emotion,
            );
            if (!emo || seen.has(emo)) continue;
            const hint = hintForEmotion(emo);
            if (!hint) continue;
            seen.add(emo);
            lines.push(`- ${emo}: ${hint}`);
            if (lines.length >= 4) break;
        }
        if (!lines.length) return '';
        return `语气参考（可选，勿改事实）：\n${lines.join('\n')}\n${FAITHFUL_GUARD}`;
    }

    function appendEmotionHintToUserContent(userContent, cues, options = {}) {
        const block = buildEmotionMtStyleBlock(cues, options);
        if (!block) return String(userContent || '');
        const base = String(userContent || '').trimEnd();
        return base ? `${base}\n\n${block}` : block;
    }

    function shouldPreferEmotionForPolish(options = {}) {
        return normalizeSensevoiceEmotionMtStyle(options.sensevoiceEmotionMtStyle) === 'hint+polish'
            && emotionMtStyleActive(options.sensevoiceEmotionMtStyle, options.sensevoiceRichTags);
    }

    return {
        HINT_BY_EMOTION,
        FAITHFUL_GUARD,
        normalizeSensevoiceEmotionMtStyle,
        emotionMtStyleActive,
        hintForEmotion,
        buildEmotionMtStyleBlock,
        appendEmotionHintToUserContent,
        shouldPreferEmotionForPolish,
    };
}));
