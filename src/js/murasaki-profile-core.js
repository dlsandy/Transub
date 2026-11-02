/**
 * Murasaki JA→ZH subtitle profile (sampling + leak strip).
 * Tuned on reusable spoken-JA cue shapes (fillers, insults, short interjections,
 * ゴミ compounds, polite+vocative, feel-good stem) — not title-gated.
 * F16 quant retired; profile targets Q8_0 / Q6_K / Q4_K_M.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMurasakiProfile = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function murasakiProfileFactory() {
    /** Appended to Script Mode system text — keep short; high-signal only. */
    const LINE_PROMPT_ADDON = [
        '对白调校：每行只输出对应那一行中文台词，不要编号、解释、分析或标签。',
        '禁止「女主/男主/旁白」前缀、【我】、英文方括号标签、[Style & Persona]、禁止输出「~~」拖腔。',
        '禁止单独输出「{」「}」「[」「]」或残缺英文括号；禁止给整句台词外加弯引号“”。',
        'ゴミ屋敷=垃圾屋（不是垃圾场）；ゴミ袋=垃圾袋。',
        'くそ/クソ生意気 → 可恶/嚣张/臭屁，不要译成「没礼貌」。くっさ/汚い是脏臭不是「卑鄙」。くそ后的うえ是恶心干呕，不是「痛」也不是「上面」。',
        '短语气只译短词：こっち来て＝过来；そのまま＝就这样；うわ＝哇；どっちに＝往哪边；あ…そうだね＝啊…也是呢；んーんしょ＝嗯…嘿咻。',
        'いいでしょ／いいでしょう＝可以吧／挺好的；いいか?／いい?＝可以吗／好吗（不是「挺好吗」）。',
        '気持ちいい／きもちいい 必须保留「舒服」词干，禁止塌成单独的「吗？」。',
        '禁止用单独的「…」「......」「-」代替任何一行译文；即使是「ええと／あの…／んー…」也要译成「呃／那个…／嗯…」等短中文，不要空行。',
        '禁止输出语尾/语气/属性分析、方括号标签或「- 语尾：」这类说明行。',
        '句末不要加句号「。」或「．」（问号、感叹号、省略号可保留）。',
    ].join('');

    const THINK_HINT_LARGE = [
        '先用一两句想清说话人语气与指示对象，再输出译文。',
        '思考不要写入译文行；译文行数必须与日文行数一致。',
    ].join('');

    /** Reserved for future ≥8B Murasaki (v0.2 8B/14B retired). */
    const INFERENCE_LARGE = Object.freeze({
        temperature: 0.22,
        top_p: 0.8,
        repetition_penalty: 1.08,
        contextSize: 4096,
        cachePrompt: true,
        windowLines: 4,
        enableThinking: false,
        maxTokensCap: 640,
    });

    /**
     * v0.3 4B: window=6 flooded blank-retry; stay at 3.
     * Slightly cooler than official ~0.3 to cut invent / brace stubs on Q8.
     */
    const INFERENCE_SMALL = Object.freeze({
        temperature: 0.26,
        top_p: 0.8,
        repetition_penalty: 1.06,
        contextSize: 4096,
        cachePrompt: true,
        windowLines: 3,
        enableThinking: false,
        maxTokensCap: 640,
    });

    function looksLikeMurasakiPromptLeak(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^请翻译[:：]/.test(t)) return true;
        if (/^\[[A-Za-z][A-Za-z0-9 &._-]{2,32}\]$/.test(t)) return true;
        // Truncated English analysis tags (model often cuts mid-bracket).
        if (/^\[[A-Za-z][A-Za-z0-9 &._-]{2,40}/.test(t) && /Structure|Logic|Style|Persona|Analysis|Tone/i.test(t)) {
            return true;
        }
        if (/\[Style\s*&\s*Persona\]/i.test(t)) return true;
        if (/Structure\s*&\s*Logic/i.test(t)) return true;
        if (/^\s*-?\s*基调[：:]/.test(t)) return true;
        if (/^[*\-\s]*[男女]方[：:]/.test(t)) return true;
        if (/垃圾屋（不是垃圾场）/.test(t) && /=/.test(t)) return true;
        if (/极度蔑视|长辈对晚辈|拟声词|宠溺感/.test(t)) return true;
        if (/说话人[（(：:]/.test(t) || /使用了[「『]/.test(t)) return true;
        if (/第一人称|说话者|听话者|询问者/.test(t)) return true;
        if (/^[\[［]\s*说话人/.test(t)) return true;
        if (/^\[+\s*$/.test(t)) return true;
        if (/第[一二三四五六七八九十\d]+句/.test(t)) return true;
        if (/属性[：:]/.test(t) && /角色|少女|典型/.test(t)) return true;
        if (/^[*\-\s]*[“「"'].{0,16}[”」"'][：:]/.test(t)) return true;
        if (/动作流分析|说话人：|决策：/.test(t)) return true;
        if (/角色[AB]\s*[（(]/.test(t)) return true;
        if (/第[一二三四五六七八九十\d]+句/.test(t) && /：/.test(t)) return true;
        if (/^\s*-\s/.test(t) && /语气|属性|动作|弱势|口语|语尾|体现出|使用/.test(t)) return true;
        if (/语尾[：:]/.test(t) || /体现出/.test(t) && /吗|呢|～/.test(t)) return true;
        if (/^[-—–]\s*$/.test(t)) return true;
        if (/角色语分析/.test(t)) return true;
        if (/二次元/.test(t) && /吐槽|毒舌|属性/.test(t)) return true;
        if (/场景[：:]/.test(t) && /角色|对话|转折/.test(t)) return true;
        if (/专注于\s*Galgame|拒绝翻译腔|角色还原/.test(t)) return true;
        if (/对白调校：|每行只输出对应那一行/.test(t)) return true;
        // Neighbor-context header echoed into the cue (Script prev-line prompt).
        if (/[上下]文参考\s*[（(]?勿翻译/.test(t)) return true;
        if (/^(?:女主|男主|旁白|我)[「『]/.test(t)) return true;
        if (/^【我】/.test(t)) return true;
        if (/^[{}\[\]]+$/.test(t)) return true;
        return false;
    }

    /** Feel-good JA collapsed to bare 「吗？」/「X，吗？」— force blank-retry. */
    function looksLikeFeelGoodStemDrop(sourceText, text) {
        const src = String(sourceText || '');
        const t = String(text || '').trim();
        if (!t || !src) return false;
        if (!/気持ちいい|きもちいい|きもちいっ|きもちぃ|キモチイイ|気持ちよ[くかたっ]|きもちよ[くかたっ]|気持ち良|きもちい[いっ]/.test(src)) {
            return false;
        }
        if (/どんな(?:気持ち|きもち)/.test(src)) return false;
        if (/舒服|爽/.test(t)) return false;
        if (!/吗/.test(t)) return false;
        return [...t].length <= 16;
    }

    function stripMurasakiLeak(text) {
        let out = String(text || '');
        out = out.replace(/^[*\-\s]*场景[：:][^\n]*$/gm, '');
        out = out.replace(/^[*\-\s]*基调[：:][^\n]*$/gm, '');
        out = out.replace(/^[*\-\s]*角色语分析[：:]?[^\n]*$/gm, '');
        out = out.replace(/^[*\-\s]*(?:动作流分析|说话人|决策)[：:][^\n]*$/gm, '');
        out = out.replace(/[\[［]\s*说话人[\]］]?/g, '');
        out = out.replace(/^\[+\s*$/gm, '');
        out = out.replace(/^[*\-\s]*动作流\s*$/gm, '');
        out = out.replace(/^[*\-\s]*[男女]方[：:][^\n]*$/gm, '');
        out = out.replace(/垃圾屋（不是垃圾场）\s*=\s*[^\n]*/g, '');
        out = out.replace(/^[*\-\s]*“[^”]{0,24}”[：:][^\n]*$/gm, '');
        out = out.replace(/[~～]{2,}/g, '');
        out = out.replace(/^(?:女主|男主|旁白)\s*[「『]/gm, '');
        out = out.replace(/^【我】\s*[「『]?/gm, '');
        out = out.replace(/~~+/g, '');
        out = out.replace(/^（[^）]{8,}）$/gm, '');
        out = out.replace(/^[（(]我会[^)）]*[)）]\s*$/gm, '');
        out = out.replace(/^[*\-\s]*语尾[：:][^\n]*$/gm, '');
        out = out.replace(/^[*\-\s]*-?\s*语尾[：:][^\n]*$/gm, '');
        out = out.replace(/^[*\-\s]*动[…….]{1,6}\s*$/gm, '');
        out = out.replace(/^\[[A-Za-z][^\]]{0,48}$/gm, '');
        out = out.replace(/Structure\s*&\s*Logic[^\n]*/gi, '');
        // Neighbor-context prompt headers the model sometimes echoes — drop the
        // header and everything after it (JA/ZH neighbors are not cue text).
        out = out.replace(/[*\-\s]*[上下]文参考\s*[（(]?勿翻译[)）]?[：:][\s\S]*$/g, '');
        out = out.replace(/\s*[上下]文参考\s*[（(]?勿翻译[)）]?[：:][\s\S]*$/g, '');
        // Decorative whole-cue curly/straight quotes (not mid-sentence quotes).
        out = out.replace(/^[“"]([^”"]+)[”"]$/u, '$1');
        // Bare brace / bracket stubs from truncated analysis tags.
        out = out.replace(/^[{}\[\]]+$/gm, '');
        // Bare dash / analysis stub left after partial strip.
        if (/^[-—–]\s*$/.test(out.trim())) return '';
        return out.trim();
    }

    /** Unusable as a subtitle line after strip — blank-retry must not accept these. */
    function isMurasakiUnusableZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^(?:\.\.\.|……|…)+$/.test(t)) return true;
        if (/^[-—–_~～·•.\s]+$/.test(t)) return true;
        if (/^[{}\[\]]+$/.test(t)) return true;
        if (looksLikeMurasakiPromptLeak(t)) return true;
        return false;
    }

    /**
     * Spoken ZH cues rarely need a terminal full stop; Murasaki often adds「。」.
     * Prefer shared fluency helper when available (same rules as post-batch).
     */
    function stripTrailingZhSentencePeriod(text) {
        try {
            const fluency = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-fluency-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleFluency : null);
            if (typeof fluency?.stripTrailingZhSentencePeriod === 'function') {
                return fluency.stripTrailingZhSentencePeriod(text);
            }
        } catch (_) { /* optional */ }
        let out = String(text || '');
        const trimmed = out.trim();
        if (!trimmed) return out;
        if (/^(?:\.\.\.|……|…)+$/.test(trimmed)) return trimmed;
        out = out.replace(/[。．]+(\s*)$/gu, '$1');
        out = out.replace(/(?<=[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff])\.+(\s*)$/gu, '$1');
        out = out.replace(/[。．]+(?=\n)/gu, '');
        out = out.replace(/(?<=[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff])\.+(?=\n)/gu, '');
        return out.replace(/[ \t]+\n/g, '\n').replace(/\s+$/u, '');
    }

    function finalizeMurasakiCue(sourceText, text) {
        let out = stripMurasakiLeak(text);
        out = stripTrailingZhSentencePeriod(out);
        if (isMurasakiUnusableZh(out) || looksLikeMurasakiPromptLeak(out)) return '';
        if (looksLikeFeelGoodStemDrop(sourceText, out)) return '';
        return out;
    }

    function resolveMurasakiProfile(options = {}) {
        const id = String(
            options.modelId || options.engineMtModel || options.engineLlmMtModel || '',
        ).trim().toLowerCase();
        const n = Number(options.paramBillion);
        // v0.2 8B/14B removed from catalog; only param size gates "large".
        const large = Number.isFinite(n) && n >= 8;
        const inf = large ? { ...INFERENCE_LARGE } : { ...INFERENCE_SMALL };
        return {
            large,
            inference: inf,
            linePromptAddon: LINE_PROMPT_ADDON,
            thinkHint: (large && inf.enableThinking) ? THINK_HINT_LARGE : '',
            // Retained for callers that log active id; F16 aliases canonicalize elsewhere.
            modelId: id,
        };
    }

    return {
        LINE_PROMPT_ADDON,
        THINK_HINT_LARGE,
        INFERENCE_LARGE,
        INFERENCE_SMALL,
        looksLikeMurasakiPromptLeak,
        looksLikeFeelGoodStemDrop,
        stripMurasakiLeak,
        stripTrailingZhSentencePeriod,
        isMurasakiUnusableZh,
        finalizeMurasakiCue,
        resolveMurasakiProfile,
    };
}));
