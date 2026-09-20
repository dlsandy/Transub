/**
 * 字幕分割核心逻辑（浏览器与 Node 测试共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleSplit = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleSplitCoreFactory() {
    const STRONG_PUNCT_RE = /[。！？!?….]/;
    const WEAK_PUNCT_RE = /[，、；：,;:]/;
    /** Leading punct to strip after a split (next cue must not start with ，。！ etc.). */
    const LEADING_CUE_PUNCT_RE = /^[。！？!?…⋯．，、；：,;:\.·•—–\-─～~「」『』""''“”‘’（）()【】\[\]《》<>〈〉]+/;
    const ORPHAN_TONE_PARTICLE_RE = /^[吧呢啊呀嘛哦哈哟哪罢么嗯哼唉诶喂]+$/;
    const DEFAULT_BREAK_WORDS = [
        '而且', '但是', '因为', '所以', '然后', '不过', '然而', '并且', '同时', '另外',
        '因此', '于是', '可是', '虽然', '如果', '那么', '或者', '以及',
        'but', 'and then', 'however', 'therefore', 'because', 'so', 'then', 'although',
        // Extra English connectors — whole-token match only (see isBreakWordMatchAt).
        'and', 'or', 'if', 'when', 'while', 'though', 'yet',
    ];
    /** @deprecated use DEFAULT_BREAK_WORDS */
    const CONNECTOR_WORDS = DEFAULT_BREAK_WORDS;
    /** Common 2-char compounds — do not split between the two chars (e.g. 命|令). */
    const ZH_NO_SPLIT_PAIRS = new Set([
        '命令', '公司', '上司', '经理', '老板', '同事', '客户', '工作', '公司',
        '已经', '以前', '以后', '之前', '之后', '现在', '今天', '明天', '昨天',
        '最后', '开始', '结束', '继续', '停止', '完成', '成功', '失败', '可能',
        '应该', '需要', '想要', '觉得', '认为', '知道', '明白', '清楚', '记得',
        '忘记', '感谢', '抱歉', '对不起', '什么', '怎么', '为什么', '哪里', '哪个',
        '这样', '那样', '这个', '那个', '这些', '那些', '非常', '特别', '真的',
        '确实', '当然', '其实', '还是', '就是', '不是', '没有', '可以', '不能',
        '不会', '是不是', '有没有', '能不能', '我们', '你们', '他们', '她们', '它们',
        '自己', '大家', '个人', '事情', '问题', '地方', '时间', '时候', '电话',
        '手机', '电脑', '视频', '照片', '房间', '家里', '学校', '医院', '因为',
        '所以', '但是', '然后', '不过', '如果', '虽然', '或者', '以及', '同时',
        '另外', '因此', '于是', '可是', '那么', '而且', '然而', '并且', '进入',
        '进去', '进来', '出去', '出来', '回去', '回来', '下来', '上去', '过来',
        '过去', '看起来', '听起来', '精神', '身体', '意思', '办法', '方法', '结果',
        '原因', '情况', '状态', '关系', '活动', '运动', '游戏', '电影', '音乐',
        '新闻', '信息', '数据', '系统', '程序', '软件', '硬件', '网络', '安全',
        '重要', '必要', '完全', '全部', '部分', '全部', '一定', '一样', '一般',
        '一点', '一些', '一下', '一起', '一直', '一定', '当然', '自然', '突然',
        '忽然', '终于', '立刻', '马上', '刚才', '刚刚', '马上', '直接', '简单',
        '复杂', '困难', '容易', '方便', '麻烦', '正常', '奇怪', '有趣', '无聊',
    ]);

    function isConnectedText(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        return !/\s/.test(raw);
    }

    function normalizeBreakWords(list) {
        const source = Array.isArray(list) ? list : [];
        const seen = new Set();
        const out = [];
        for (const raw of source) {
            const word = String(raw || '').trim();
            if (!word) continue;
            const key = word.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(word);
        }
        out.sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh'));
        return out;
    }

    /**
     * Latin / Hangul / user-added alphabetic break-words must match as whole tokens
     * ("so" ≠ prefix of "sorry"; "but" ≠ "butter"; Hangul 안 ≠ 안녕하세요 prefix).
     * CJK connectors stay substring matches (no spaces between characters).
     */
    function isSpacedScriptBreakWord(word) {
        const w = String(word || '').trim();
        if (!w) return false;
        // Latin (incl. accented) — single or multi-word phrases like "and then"
        if (/^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-]*(?:\s+[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’\-]*)*$/u.test(w)) {
            return true;
        }
        // Hangul tokens / short phrases
        if (/^[\uac00-\ud7af]+(?:\s+[\uac00-\ud7af]+)*$/u.test(w)) return true;
        return false;
    }

    function hasAlphaTokenBoundaryBefore(text, index) {
        if (index <= 0) return true;
        return !/[A-Za-zÀ-ɏ\uac00-\ud7af]/u.test(text[index - 1] || '');
    }

    function hasAlphaTokenBoundaryAfter(text, index) {
        if (index >= text.length) return true;
        return !/[A-Za-zÀ-ɏ\uac00-\ud7af'’\-]/u.test(text[index] || '');
    }

    /** True when needle at idx is a valid break-word hit (whole-token for alphabetic scripts). */
    function isBreakWordMatchAt(textLower, idx, needle) {
        if (idx < 0 || !needle) return false;
        if (!isSpacedScriptBreakWord(needle)) return true;
        return hasAlphaTokenBoundaryBefore(textLower, idx)
            && hasAlphaTokenBoundaryAfter(textLower, idx + needle.length);
    }

    /** Prefer splitting Latin/Hangul on spaces/boundaries — never mid-token when possible. */
    function findAlphabeticWordSafeBreak(text, preferAt, minPos = 1) {
        const raw = String(text || '');
        const at = Math.min(raw.length, Math.max(0, Math.round(Number(preferAt) || 0)));
        const min = Math.max(1, Math.floor(Number(minPos) || 1));
        if (at <= 0 || at >= raw.length) return -1;
        const left = raw[at - 1] || '';
        const right = raw[at] || '';
        const midAlpha = (
            (/[A-Za-zÀ-ɏ]/u.test(left) && /[A-Za-zÀ-ɏ'’\-]/u.test(right))
            || (/[\uac00-\ud7af]/u.test(left) && /[\uac00-\ud7af]/u.test(right))
        );
        if (!midAlpha) return at;
        for (let i = at; i >= min; i -= 1) {
            if (/\s/.test(raw[i - 1] || '')) return i;
        }
        const forwardLimit = Math.min(raw.length, Math.max(at + 1, Math.ceil(at * 1.5) + 8));
        for (let i = at; i < forwardLimit; i += 1) {
            if (/\s/.test(raw[i] || '')) return i + 1;
        }
        return -1;
    }

    /** @deprecated use findAlphabeticWordSafeBreak */
    function findLatinWordSafeBreak(text, preferAt, minPos = 1) {
        return findAlphabeticWordSafeBreak(text, preferAt, minPos);
    }

    function resolveBreakWords(opts = {}) {
        if (opts && Object.prototype.hasOwnProperty.call(opts, 'breakWords')) {
            return normalizeBreakWords(opts.breakWords);
        }
        return DEFAULT_BREAK_WORDS.slice();
    }

    function textCharCount(text) {
        return String(text || '').replace(/\s/g, '').length;
    }

    function hasSubtitlePunctuation(text) {
        const raw = String(text || '');
        return STRONG_PUNCT_RE.test(raw) || WEAK_PUNCT_RE.test(raw);
    }

    /** Continuous text with no whitespace and no ，。！？等标点. */
    function isUnpunctuatedConnectedText(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        return isConnectedText(raw) && !hasSubtitlePunctuation(raw);
    }

    /**
     * Spaced alphabetic subtitle (English / Korean) — smart/silence split must not
     * treat every space as a hard breakpoint (only punctuation / whole break words).
     */
    function isEnglishLikeText(text) {
        const raw = String(text || '').trim();
        if (!raw || !/\s/.test(raw)) return false;
        const latin = (raw.match(/[A-Za-zÀ-ɏ]/g) || []).length;
        const hangul = (raw.match(/[\uac00-\ud7af]/g) || []).length;
        const cjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
        if (hangul >= 2 && hangul > cjk) return true;
        return latin >= 4 && latin > cjk;
    }

    function allowsWhitespaceBreak(text) {
        return !isEnglishLikeText(text);
    }

    function isOrphanShortSegment(text) {
        return textCharCount(text) < 2;
    }

    function isMidWordZhBreakIndex(text, index) {
        const raw = String(text || '');
        const at = Math.round(Number(index) || 0);
        if (at <= 0 || at >= raw.length) return false;
        const left = raw[at - 1];
        const right = raw[at];
        if (!/[\u4e00-\u9fff]/.test(left) || !/[\u4e00-\u9fff]/.test(right)) return false;
        return ZH_NO_SPLIT_PAIRS.has(left + right);
    }

    function passesBasicBreakChecks(text, index, minPartChars = 2) {
        const raw = String(text || '');
        const at = Math.round(Number(index) || 0);
        const min = Math.max(1, Math.floor(Number(minPartChars) || 2));
        if (at <= 0 || at >= raw.length) return false;
        if (isMidWordZhBreakIndex(raw, at)) return false;
        return textCharCount(raw.slice(0, at)) >= min
            && textCharCount(raw.slice(at)) >= min;
    }

    function isBreakWordBreakIndex(text, index, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        const at = Math.round(Number(index) || 0);
        if (!passesBasicBreakChecks(raw, at)) return false;
        const lower = raw.toLowerCase();
        for (const word of normalizeBreakWords(breakWords)) {
            const needle = word.toLowerCase();
            if (!needle) continue;
            let from = 0;
            while (from < lower.length) {
                const idx = lower.indexOf(needle, from);
                if (idx < 0) break;
                if (!isBreakWordMatchAt(lower, idx, needle)) {
                    from = idx + 1;
                    continue;
                }
                let breakAt = idx + needle.length;
                while (breakAt < raw.length && /\s/.test(raw[breakAt])) breakAt += 1;
                if (breakAt === at) return true;
                from = idx + Math.max(1, needle.length);
            }
        }
        return false;
    }

    /**
     * Valid split point: min segment length, not mid-compound, and only at
     * whitespace / punctuation / break-word — never arbitrary mid-sentence on
     * unpunctuated continuous text.
     */
    function isValidTextBreakIndex(text, index, minPartChars = 2, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        const at = Math.round(Number(index) || 0);
        if (!passesBasicBreakChecks(raw, at, minPartChars)) return false;

        const prev = raw[at - 1] || '';
        const ch = raw[at] || '';
        if (allowsWhitespaceBreak(raw) && (/\s/.test(prev) || /\s/.test(ch))) return true;
        if (STRONG_PUNCT_RE.test(prev) || WEAK_PUNCT_RE.test(prev)) return true;
        if (isBreakWordBreakIndex(raw, at, breakWords)) return true;

        if (isUnpunctuatedConnectedText(raw)) return false;
        if (isConnectedText(raw)) return false;
        if (isEnglishLikeText(raw)) return false;
        return true;
    }

    function findNearestSafeBreakIndex(text, pos, radius = 16, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        const center = Math.min(raw.length - 1, Math.max(1, Math.round(Number(pos) || 0)));
        const span = Math.max(1, Math.floor(Number(radius) || 16));
        let best = null;
        let bestDist = Infinity;
        for (let i = Math.max(1, center - span); i <= Math.min(raw.length - 1, center + span); i += 1) {
            if (!isValidTextBreakIndex(raw, i, 2, breakWords)) continue;
            const dist = Math.abs(i - center);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    /**
     * After silence/smart split: drop leading punctuation so a cue does not start with ，。！
     */
    function isOrphanToneParticleOnly(text) {
        const s = String(text || '').trim();
        if (!s) return true;
        if (s.length <= 2 && ORPHAN_TONE_PARTICLE_RE.test(s)) return true;
        if (s.length === 1 && /[吧呢啊呀嘛哦哈哟]/.test(s)) return true;
        return false;
    }

    function shouldCollapseOrphanSegment(segment) {
        const s = String(segment || '').trim();
        return isOrphanToneParticleOnly(s) || isOrphanShortSegment(s);
    }

    function collapseOrphanParticleSegments(parts) {
        const out = (parts || []).map((p) => String(p || '')).filter(Boolean);
        while (out.length >= 2) {
            const tail = out[out.length - 1].trim();
            if (!shouldCollapseOrphanSegment(tail)) break;
            out[out.length - 2] = out[out.length - 2] + out[out.length - 1];
            out.pop();
        }
        while (out.length >= 2) {
            const head = out[0].trim();
            if (!shouldCollapseOrphanSegment(head)) break;
            out[1] = out[0] + out[1];
            out.shift();
        }
        return out;
    }

    function stripLeadingCuePunctuation(text) {
        const raw = String(text || '').trim();
        if (!raw) return '';
        return raw.replace(LEADING_CUE_PUNCT_RE, '').trim();
    }

    function lineCharCount(text) {
        const lines = String(text || '').split(/\r?\n/);
        return lines.reduce((max, line) => Math.max(max, line.replace(/\s/g, '').length), 0);
    }

    function splitTextByLines(text) {
        return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }

    /**
     * Collapse multiple non-empty lines into one line (inverse of splitTextByLines).
     * Latin-heavy text joins with a space; CJK / JA text joins without a separator.
     * @returns {string|null} merged text, or null when fewer than 2 lines
     */
    function mergeTextLines(text) {
        const lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        if (lines.length < 2) return null;
        const combined = lines.join('');
        const latin = (combined.match(/[A-Za-z]/g) || []).length;
        const cjk = (combined.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
        const sep = latin >= 4 && latin >= cjk ? ' ' : '';
        return lines.join(sep).replace(/\s+/g, ' ').trim();
    }

    function splitTextBySpaces(text) {
        return String(text || '').trim().split(/\s+/).filter(Boolean);
    }

    function findBestBreakInSlice(slice, minPos, allowWhitespace = true) {
        let best = -1;
        let bestScore = -1;
        for (let i = slice.length - 1; i >= minPos; i -= 1) {
            const ch = slice[i];
            let score = 0;
            if (STRONG_PUNCT_RE.test(ch)) score = 4;
            else if (WEAK_PUNCT_RE.test(ch)) score = 3;
            else if (allowWhitespace && /\s/.test(ch)) score = 2;
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        return bestScore >= 2 ? best + 1 : -1;
    }

    function findConnectorBreak(text, maxIndex, breakWords = DEFAULT_BREAK_WORDS) {
        let best = -1;
        const raw = String(text || '');
        const lower = raw.toLowerCase();
        const words = normalizeBreakWords(breakWords);
        for (const word of words) {
            const needle = word.toLowerCase();
            if (!needle) continue;
            let from = 0;
            while (from < lower.length) {
                const idx = lower.indexOf(needle, from);
                if (idx < 0) break;
                if (!isBreakWordMatchAt(lower, idx, needle)) {
                    from = idx + 1;
                    continue;
                }
                const breakAt = idx + needle.length;
                if (breakAt > 0 && breakAt <= maxIndex && breakAt < raw.length && breakAt > best) {
                    best = breakAt;
                }
                from = idx + Math.max(1, needle.length);
            }
        }
        return best;
    }

    function splitTextByCharCount(text, maxChars) {
        const max = Math.max(2, Math.floor(Number(maxChars) || 20));
        let remaining = String(text || '').trim();
        if (isConnectedText(remaining)) return remaining ? [remaining] : [];
        const parts = [];
        while (remaining.length > max) {
            // Don't mid-cut a trailing connected alphabetic token (morning → mornin|g).
            if (isConnectedText(remaining) && /[A-Za-zÀ-ɏ\uac00-\ud7af]/u.test(remaining)) {
                parts.push(remaining);
                remaining = '';
                break;
            }
            let breakAt = max;
            const slice = remaining.slice(0, max);
            const punctBreak = findBestBreakInSlice(slice, Math.floor(max * 0.4));
            if (punctBreak > 0) breakAt = punctBreak;
            // Never cut inside a Latin/Hangul token when a safer space break exists.
            const alphaSafe = findAlphabeticWordSafeBreak(remaining, breakAt, Math.floor(max * 0.35));
            if (alphaSafe > 0) {
                breakAt = alphaSafe;
            } else if (
                breakAt < remaining.length
                && /[A-Za-zÀ-ɏ\uac00-\ud7af]/u.test(remaining[breakAt - 1] || '')
                && /[A-Za-zÀ-ɏ\uac00-\ud7af'’\-]/u.test(remaining[breakAt] || '')
            ) {
                // No safe break — keep the whole remaining token rather than shred letters.
                parts.push(remaining);
                remaining = '';
                break;
            }
            const chunk = remaining.slice(0, breakAt).trim();
            if (!chunk) break;
            parts.push(chunk);
            remaining = remaining.slice(breakAt).trim();
        }
        if (remaining) parts.push(remaining);
        return parts;
    }

    function splitTextIntoNParts(text, n) {
        const count = Math.max(2, Math.floor(Number(n) || 2));
        const raw = String(text || '').trim();
        if (!raw) return [];
        if (isConnectedText(raw)) return null;

        // Spaced alphabetic (EN/KO): split on whitespace near ideal cuts — never mid-token.
        if (isEnglishLikeText(raw) || (/[A-Za-zÀ-ɏ\uac00-\ud7af]/u.test(raw) && /\s/.test(raw))) {
            const words = raw.split(/\s+/).filter(Boolean);
            if (words.length < count) return null;
            const parts = [];
            const base = Math.floor(words.length / count);
            let extra = words.length % count;
            let idx = 0;
            for (let i = 0; i < count; i += 1) {
                const size = base + (extra > 0 ? 1 : 0);
                if (extra > 0) extra -= 1;
                parts.push(words.slice(idx, idx + size).join(' '));
                idx += size;
            }
            return parts.filter(Boolean);
        }

        const chars = [...raw];
        if (chars.length < count) return null;
        const parts = [];
        const base = Math.floor(chars.length / count);
        let extra = chars.length % count;
        let idx = 0;
        for (let i = 0; i < count; i += 1) {
            const size = base + (extra > 0 ? 1 : 0);
            if (extra > 0) extra -= 1;
            parts.push(chars.slice(idx, idx + size).join('').trim());
            idx += size;
        }
        return parts.filter(Boolean);
    }
    function splitTextSmart(text, opts = {}) {
        const maxChars = Math.max(4, Math.floor(Number(opts.maxChars) || 20));
        const maxLineChars = Math.max(4, Math.floor(Number(opts.maxLineChars) || maxChars));
        const minChars = Math.max(2, Math.floor(Number(opts.minChars) || 4));
        const breakWords = resolveBreakWords(opts);
        let remaining = String(text || '').trim();
        if (!remaining) return [];
        const connected = isConnectedText(remaining);
        const englishLike = isEnglishLikeText(remaining);
        const noHardSplit = connected || englishLike;
        const allowWhitespace = allowsWhitespaceBreak(remaining);

        const parts = [];
        while (remaining.length > 0) {
            if (remaining.length <= maxChars && lineCharCount(remaining) <= maxLineChars) {
                parts.push(remaining);
                break;
            }

            let limit = Math.min(maxChars, remaining.length);
            if (lineCharCount(remaining.slice(0, limit)) > maxLineChars) {
                limit = Math.min(limit, maxLineChars + 2);
            }

            const slice = remaining.slice(0, limit);
            let breakAt = -1;

            const punctBreak = findBestBreakInSlice(slice, Math.floor(limit * 0.35), allowWhitespace);
            if (punctBreak > 0) breakAt = punctBreak;

            if (breakAt < 0) {
                const connectorBreak = findConnectorBreak(remaining, limit, breakWords);
                if (connectorBreak > minChars) breakAt = connectorBreak;
            }

            if (breakAt < 0 && remaining.length > maxChars) {
                if (noHardSplit) {
                    const extended = Math.min(
                        remaining.length,
                        Math.max(maxChars * 3, maxChars + 24),
                    );
                    const extPunct = findBestBreakInSlice(
                        remaining.slice(0, extended),
                        Math.floor(maxChars * 0.35),
                        allowWhitespace,
                    );
                    if (extPunct > minChars) breakAt = extPunct;
                    if (breakAt < 0) {
                        const extConn = findConnectorBreak(remaining, extended, breakWords);
                        if (extConn > minChars) breakAt = extConn;
                    }
                    if (breakAt < 0) {
                        parts.push(remaining);
                        break;
                    }
                } else {
                    breakAt = findBestBreakInSlice(
                        remaining.slice(0, maxChars),
                        Math.floor(maxChars * 0.35),
                        allowWhitespace,
                    );
                    if (breakAt < 0) breakAt = maxChars;
                }
            }

            if (breakAt < 0) {
                if (noHardSplit) {
                    parts.push(remaining);
                    break;
                }
                breakAt = limit;
            }

            let chunk = remaining.slice(0, breakAt).trim();
            if (!chunk && remaining.length) {
                if (noHardSplit) {
                    parts.push(remaining);
                    break;
                }
                chunk = remaining.slice(0, Math.min(maxChars, remaining.length)).trim();
                breakAt = chunk.length;
            }
            if (!chunk) break;

            parts.push(chunk);
            remaining = remaining.slice(breakAt).trim();
        }

        return parts.filter(Boolean);
    }

    function splitTextAtIndex(text, index, options = {}) {
        const raw = String(text || '');
        const at = Math.round(Number(index) || 0);
        if (!options.force
            && isConnectedText(raw)
            && !isValidTextBreakIndex(raw, at, 2, DEFAULT_BREAK_WORDS)) return null;
        const before = raw.slice(0, at).trim();
        const after = raw.slice(at).trim();
        if (!before || !after) return null;
        return [before, after];
    }

    function getWhitespaceBreakIndices(text) {
        const raw = String(text || '');
        const breaks = [];
        for (let i = 0; i < raw.length; i += 1) {
            if (!/\s/.test(raw[i])) continue;
            let end = i;
            while (end < raw.length && /\s/.test(raw[end])) end += 1;
            if (end > 0 && end < raw.length) breaks.push(end);
            i = end - 1;
        }
        return breaks;
    }

    /**
     * Indices after each断句词 (same rule as smart split: cut after the word/phrase).
     */
    function getBreakWordBreakIndices(text, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        if (!raw) return [];
        const lower = raw.toLowerCase();
        const words = normalizeBreakWords(breakWords);
        const breaks = new Set();
        for (const word of words) {
            const needle = word.toLowerCase();
            if (!needle) continue;
            let from = 0;
            while (from < lower.length) {
                const idx = lower.indexOf(needle, from);
                if (idx < 0) break;
                if (!isBreakWordMatchAt(lower, idx, needle)) {
                    from = idx + 1;
                    continue;
                }
                let breakAt = idx + needle.length;
                while (breakAt < raw.length && /\s/.test(raw[breakAt])) breakAt += 1;
                if (breakAt > 0 && breakAt < raw.length && passesBasicBreakChecks(raw, breakAt)) {
                    breaks.add(breakAt);
                }
                from = idx + Math.max(1, needle.length);
            }
        }
        return [...breaks].sort((a, b) => a - b);
    }

    /**
     * Sentence boundaries only (after 。！？ etc.), not clause commas.
     * Indices point to the first char of the next sentence.
     */
    function getSentenceBreakIndices(text) {
        const raw = String(text || '');
        if (!raw) return [];
        const breaks = [];
        for (let i = 0; i < raw.length - 1; i += 1) {
            if (!STRONG_PUNCT_RE.test(raw[i])) continue;
            let end = i + 1;
            while (end < raw.length && (/\s/.test(raw[end]) || STRONG_PUNCT_RE.test(raw[end]))) {
                end += 1;
            }
            if (end > 0 && end < raw.length) breaks.push(end);
        }
        const out = [];
        for (const idx of breaks) {
            if (!out.length || idx - out[out.length - 1] >= 2) out.push(idx);
        }
        return out;
    }

    function endsWithStrongSentencePunct(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        return STRONG_PUNCT_RE.test(raw[raw.length - 1]);
    }

    /**
     * Text breakpoints for silence split: whitespace + 断句词 (+ optional punctuation).
     */
    function getSilenceTextBreakIndices(text, opts = {}) {
        const raw = String(text || '');
        if (!raw) return [];
        const breakWords = resolveBreakWords(opts);
        const merged = new Set();
        if (allowsWhitespaceBreak(raw)) {
            for (const idx of getWhitespaceBreakIndices(raw)) merged.add(idx);
        }
        for (const idx of getBreakWordBreakIndices(raw, breakWords)) merged.add(idx);

        if (opts.includePunctuation !== false) {
            for (let i = 0; i < raw.length - 1; i += 1) {
                const ch = raw[i];
                if (!STRONG_PUNCT_RE.test(ch) && !WEAK_PUNCT_RE.test(ch)) continue;
                let end = i + 1;
                while (end < raw.length && /\s/.test(raw[end])) end += 1;
                if (end > 0 && end < raw.length) merged.add(end);
            }
        }

        const sorted = [...merged].sort((a, b) => a - b);
        const out = [];
        for (const idx of sorted) {
            if (!isValidTextBreakIndex(raw, idx, 2, breakWords)) continue;
            if (!out.length || idx - out[out.length - 1] >= 2) out.push(idx);
        }
        return out;
    }

    function idealTimesForTextBreaks(startMs, endMs, text, breakIndices) {
        const raw = String(text || '').trim();
        const len = Math.max(1, raw.length);
        const totalDur = Math.max(1, endMs - startMs);
        return (breakIndices || []).map((idx) => {
            const ratio = Math.max(0, Math.min(1, idx / len));
            return Math.round(startMs + ratio * totalDur);
        });
    }

    function pickClosestValues(source, targets, count) {
        const picked = [];
        const used = new Set();
        const sortedTargets = [...targets].sort((a, b) => a - b);
        for (let n = 0; n < count; n += 1) {
            const target = sortedTargets[Math.min(n, sortedTargets.length - 1)];
            let best = null;
            let bestDist = Infinity;
            for (let i = 0; i < source.length; i += 1) {
                if (used.has(i)) continue;
                const dist = Math.abs(source[i] - target);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            if (best == null) break;
            used.add(best);
            picked.push(source[best]);
        }
        return picked.sort((a, b) => a - b);
    }

    /**
     * Map each silence candidate to the nearest unused text-break ideal.
     * Cuts only exist where silence was detected — never invent a cut for every space.
     */
    function pickSplitPointsForSafeBreaks(candidates, idealTimes, silences, options = {}) {
        const source = (candidates || []).map((ms) => Math.round(Number(ms) || 0)).filter(Number.isFinite);
        const ideals = (idealTimes || []).map((ms) => Math.round(Number(ms) || 0)).filter(Number.isFinite);
        if (!source.length) return [];
        if (!ideals.length) return source.slice().sort((a, b) => a - b);

        const cueStart = Math.round(Number(options.cueStartMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(Number(options.cueEndMs) || 0));
        const cueDur = Math.max(1, cueEnd - cueStart);
        const maxSplits = Math.max(
            1,
            Math.min(
                source.length,
                ideals.length,
                Math.round(Number(options.maxSplits) || source.length) || source.length,
            ),
        );
        const usedIdeals = new Set();
        const scored = [];

        for (let i = 0; i < source.length; i += 1) {
            const ms = source[i];
            if (!(ms > cueStart && ms < cueEnd)) continue;
            let bestIdeal = -1;
            let bestDist = Infinity;
            for (let n = 0; n < ideals.length; n += 1) {
                const dist = Math.abs(ms - ideals[n]);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdeal = n;
                }
            }
            if (bestIdeal < 0) continue;
            const maxDist = Math.max(cueDur * 0.55, Math.min(cueDur * 0.9, 4000));
            if (bestDist > maxDist) continue;
            const proximity = 1 - (bestDist / Math.max(1, maxDist));
            const dur = silenceDurationNearPoint(ms, silences);
            const durNorm = Math.min(1, dur / Math.max(280, cueDur * 0.08));
            scored.push({
                ms,
                idealIdx: bestIdeal,
                score: (proximity * 0.45) + (durNorm * 0.55),
            });
        }

        scored.sort((a, b) => b.score - a.score || a.ms - b.ms);
        const picked = [];
        for (const row of scored) {
            if (picked.length >= maxSplits) break;
            if (usedIdeals.has(row.idealIdx)) continue;
            usedIdeals.add(row.idealIdx);
            picked.push(row.ms);
        }

        const uniq = [...new Set(picked)].sort((a, b) => a - b);
        return uniq.filter((ms, i) => {
            if (!(ms > cueStart && ms < cueEnd)) return false;
            if (i > 0 && ms - uniq[i - 1] < 80) return false;
            return true;
        });
    }

    /** Snap silence cut times onto nearest whitespace / sentence break indices. */
    function snapTimesToNearestBreakIndices(text, startMs, endMs, timesMs, breakIndices, options = {}) {
        const raw = String(text || '');
        const len = Math.max(1, raw.length);
        const start = Math.round(Number(startMs) || 0);
        const end = Math.max(start + 1, Math.round(Number(endMs) || 0));
        const dur = Math.max(1, end - start);
        const minPartChars = Math.max(1, Math.round(Number(options.minPartChars) || 2));
        const countChars = typeof options.textCharCount === 'function'
            ? options.textCharCount
            : ((t) => String(t || '').replace(/\s/g, '').length);
        const breaks = [...new Set(
            (breakIndices || [])
                .map((i) => Math.round(Number(i) || 0))
                .filter((i) => i > 0 && i < len),
        )].sort((a, b) => a - b);
        if (!breaks.length) return [];

        const times = (timesMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > start && ms < end)
            .sort((a, b) => a - b);
        const used = new Set();
        const out = [];
        for (const ms of times) {
            const approx = Math.round(((ms - start) / dur) * len);
            const ranked = breaks
                .filter((b) => !used.has(b))
                .map((b) => ({ b, dist: Math.abs(b - approx) }))
                .sort((a, b) => a.dist - b.dist || a.b - b.b);
            let chosen = null;
            for (const row of ranked) {
                const left = countChars(raw.slice(0, row.b));
                const right = countChars(raw.slice(row.b));
                if (left >= minPartChars && right >= minPartChars) {
                    chosen = row.b;
                    break;
                }
            }
            if (chosen == null) continue;
            used.add(chosen);
            out.push(chosen);
        }
        return out.sort((a, b) => a - b);
    }

    function splitTextAtBreakIndices(text, breakIndices, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        if (!raw) return [];
        const cuts = [...new Set(
            (breakIndices || [])
                .map((i) => Math.round(Number(i) || 0))
                .filter((i) => i > 0 && i < raw.length && isValidTextBreakIndex(raw, i, 2, breakWords)),
        )].sort((a, b) => a - b);
        if (!cuts.length) return [raw.trim()].filter(Boolean);
        const parts = [];
        let prev = 0;
        for (const idx of cuts) {
            const chunk = stripLeadingCuePunctuation(raw.slice(prev, idx).trim());
            if (chunk) parts.push(chunk);
            prev = idx;
        }
        const tail = stripLeadingCuePunctuation(raw.slice(prev).trim());
        if (tail) parts.push(tail);
        const collapsed = collapseOrphanParticleSegments(parts);
        return collapsed.length >= 2 ? collapsed : collapsed.filter(Boolean);
    }

    function alignSilenceSplitPointsToText(text, startMs, endMs, splitPointsMs, intervals = null, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const sorted = (splitPointsMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > start && ms < end)
            .sort((a, b) => a - b);

        const silences = normalizeSilenceIntervals(intervals, start, end);

        // Prefer safe text cuts: sentence ends (。！？) and whitespace.
        // Only cut where silence was detected (snap to nearest space / sentence break).
        if (options.respectSentenceBoundaries !== false) {
            const sentenceBreaks = getSentenceBreakIndices(text);
            const spaceBreaks = allowsWhitespaceBreak(text)
                ? getWhitespaceBreakIndices(text)
                : [];
            const safeBreaks = [...new Set([...sentenceBreaks, ...spaceBreaks])]
                .sort((a, b) => a - b);
            const hasSilence = sorted.length > 0 || silences.length > 0;
            if (safeBreaks.length) {
                if (!hasSilence) return [];
                const idealTimes = idealTimesForTextBreaks(start, end, text, safeBreaks);
                return pickSplitPointsForSafeBreaks(sorted, idealTimes, silences, {
                    cueStartMs: start,
                    cueEndMs: end,
                    maxSplits: options.maxSplits,
                });
            }
            if (endsWithStrongSentencePunct(text)) {
                return [];
            }
        }

        if (!sorted.length) return [];

        const textBreaks = getSilenceTextBreakIndices(text, options);
        if (!textBreaks.length) return sorted;

        const idealTimes = idealTimesForTextBreaks(start, end, text, textBreaks);
        const targetSplitCount = textBreaks.length;

        if (sorted.length > targetSplitCount || silences.length) {
            return pickScoredSplitPointsNearIdeals(sorted, idealTimes, silences, {
                cueStartMs: start,
                cueEndMs: end,
                maxCount: targetSplitCount,
            });
        }

        return sorted;
    }

    function silenceDurationNearPoint(ms, silences) {
        const t = Math.round(Number(ms) || 0);
        let best = 0;
        for (const s of silences || []) {
            if (t >= s.start && t <= s.end) return s.end - s.start;
            const dist = t < s.start ? s.start - t : t - s.end;
            if (dist <= 120) best = Math.max(best, s.end - s.start);
        }
        return best;
    }

    /**
     * Prefer longer pauses that sit near ideal text-break times (not merely nearest).
     */
    function pickScoredSplitPointsNearIdeals(candidates, idealTimes, silences, options = {}) {
        const source = (candidates || []).map((ms) => Math.round(Number(ms) || 0)).filter(Number.isFinite);
        const ideals = (idealTimes || []).map((ms) => Math.round(Number(ms) || 0)).filter(Number.isFinite);
        if (!source.length || !ideals.length) return source.slice().sort((a, b) => a - b);

        const cueStart = Math.round(Number(options.cueStartMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(Number(options.cueEndMs) || 0));
        const cueDur = Math.max(1, cueEnd - cueStart);
        const maxDist = Math.max(700, Math.min(1100, Math.round(cueDur * 0.28)));
        const maxCount = Math.max(1, Math.min(
            ideals.length,
            Math.round(Number(options.maxCount) || ideals.length),
        ));
        const used = new Set();
        const picked = [];

        for (let n = 0; n < maxCount; n += 1) {
            const ideal = ideals[Math.min(n, ideals.length - 1)];
            let bestIdx = -1;
            let bestScore = -Infinity;
            for (let i = 0; i < source.length; i += 1) {
                if (used.has(i)) continue;
                const ms = source[i];
                const dist = Math.abs(ms - ideal);
                if (dist > maxDist) continue;
                const proximity = 1 - (dist / maxDist);
                const dur = silenceDurationNearPoint(ms, silences);
                const durNorm = Math.min(1, dur / Math.max(280, cueDur * 0.08));
                const score = (proximity * 0.58) + (durNorm * 0.42);
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            }
            if (bestIdx < 0 || bestScore < 0.22) break;
            used.add(bestIdx);
            picked.push(source[bestIdx]);
        }

        if (!picked.length && source.length) {
            return pickClosestValues(source, ideals, maxCount);
        }
        return picked.sort((a, b) => a - b);
    }

    /**
     * Score silence / speech-gap candidates and pick split midpoints for a cue.
     */
    function pickScoredSilenceSplitPoints(intervals, cueStartMs, cueEndMs, options = {}) {
        const cueStart = Math.round(Number(cueStartMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(Number(cueEndMs) || 0));
        const cueDur = Math.max(1, cueEnd - cueStart);
        const edgeMs = Math.max(
            80,
            Math.min(
                Math.round(Number(options.edgeMs) || Math.floor(cueDur * 0.12)),
                Math.floor(cueDur * 0.2),
            ),
        );
        const minSilenceMs = Math.max(40, Math.round(Number(options.minSilenceMs) || 120));
        const minSpeechMs = Math.max(80, Math.round(Number(options.minSpeechMs) || 120));
        const idealBreakMs = (options.idealBreakMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > cueStart && ms < cueEnd);
        const interiorLo = cueStart + edgeMs;
        const interiorHi = cueEnd - edgeMs;
        if (interiorHi <= interiorLo) return [];

        const silences = normalizeSilenceIntervals(intervals, cueStart, cueEnd);
        const candidates = [];
        const pushCandidate = (mid, dur, start, end) => {
            const ms = Math.round(Number(mid) || 0);
            if (!(ms > interiorLo && ms < interiorHi)) return;
            const d = Math.max(0, Math.round(Number(dur) || 0));
            candidates.push({
                ms,
                dur: d,
                start: Math.round(Number(start) || ms),
                end: Math.round(Number(end) || ms),
            });
        };

        for (const s of silences) {
            const dur = s.end - s.start;
            if (dur < Math.max(40, minSilenceMs * 0.45)) continue;
            pushCandidate((s.start + s.end) / 2, dur, s.start, s.end);
        }

        const regions = buildSpeechRegionsFromSilence(cueStart, cueEnd, silences, minSpeechMs);
        for (let i = 0; i < regions.length - 1; i += 1) {
            const gapStart = regions[i].endMs;
            const gapEnd = regions[i + 1].startMs;
            const gapDur = gapEnd - gapStart;
            if (gapDur < 40) continue;
            pushCandidate((gapStart + gapEnd) / 2, gapDur, gapStart, gapEnd);
        }

        if (!candidates.length) return [];

        const dedupeMinGap = Math.max(edgeMs, Math.round(Number(options.minGapMs) || edgeMs));
        const dedupeByTime = (points) => {
            const sorted = [...points].sort((a, b) => a - b);
            const out = [];
            for (const ms of sorted) {
                if (!out.length || ms - out[out.length - 1] >= dedupeMinGap) out.push(ms);
            }
            return out;
        };

        if (idealBreakMs.length) {
            const maxFromOpts = Math.round(Number(options.maxSplits) || 0);
            const maxCount = Math.max(
                1,
                Math.min(
                    idealBreakMs.length,
                    candidates.length,
                    maxFromOpts > 0 ? maxFromOpts : idealBreakMs.length,
                ),
            );
            const picked = pickScoredSplitPointsNearIdeals(
                candidates.map((c) => c.ms),
                idealBreakMs,
                silences,
                {
                    cueStartMs: cueStart,
                    cueEndMs: cueEnd,
                    maxCount,
                },
            );
            // Only top up with extra silences when we still need more cuts and they are real pauses
            if (picked.length < maxCount) {
                const used = new Set(picked);
                const ranked = [...candidates]
                    .filter((c) => c.dur >= minSilenceMs)
                    .sort((a, b) => b.dur - a.dur || a.ms - b.ms);
                for (const ideal of idealBreakMs) {
                    if (picked.length >= maxCount) break;
                    let best = null;
                    let bestDist = Infinity;
                    for (const c of ranked) {
                        if (used.has(c.ms)) continue;
                        const dist = Math.abs(c.ms - ideal);
                        const nearBreakMax = Math.max(550, Math.round(cueDur * 0.18));
                        if (dist > nearBreakMax) continue;
                        if (dist < bestDist) {
                            bestDist = dist;
                            best = c.ms;
                        }
                    }
                    if (best != null) {
                        used.add(best);
                        picked.push(best);
                    }
                }
            }
            return dedupeByTime(picked).slice(0, maxCount);
        }

        // No whitespace ideals: keep the clearest interior pauses (longest first)
        const maxSplits = Math.max(
            1,
            Math.min(
                Math.round(Number(options.maxSplits) || Math.floor(cueDur / 1600)),
                candidates.length,
            ),
        );
        const ranked = [...candidates].sort((a, b) => b.dur - a.dur || a.ms - b.ms);
        const out = [];
        for (const c of ranked) {
            if (out.length >= maxSplits) break;
            if (c.dur < minSilenceMs) continue;
            if (out.some((ms) => Math.abs(ms - c.ms) < dedupeMinGap)) continue;
            out.push(c.ms);
        }
        return out.sort((a, b) => a - b);
    }

    /**
     * When a shared split boundary sits inside a silence gap, expand to silence edges
     * so adjacent cues do not share the pause midpoint.
     */
    function applySilenceEdgeBoundaries(cues, intervals, parentStart, parentEnd, options = {}) {
        if (!cues?.length || cues.length < 2) return cues;
        const silences = normalizeSilenceIntervals(intervals, parentStart, parentEnd);
        if (!silences.length) return cues;

        const headPadMs = Math.max(0, Math.round(Number(options.headPadMs) || 60));
        const tailPadMs = Math.max(0, Math.round(Number(options.tailPadMs) || 60));
        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 400));
        const maxSnapMs = Math.max(120, Math.round(Number(options.maxSnapMs) || 350));

        const refined = cues.map((c) => ({
            startMs: Math.round(Number(c.startMs) || 0),
            endMs: Math.round(Number(c.endMs) || 0),
            text: c.text,
        }));

        for (let i = 0; i < refined.length - 1; i += 1) {
            const boundary = refined[i].endMs;
            let best = null;
            let bestDist = Infinity;
            for (const s of silences) {
                const mid = (s.start + s.end) / 2;
                const contains = boundary >= s.start && boundary <= s.end;
                const dist = contains ? 0 : Math.abs(mid - boundary);
                if (dist > maxSnapMs && !contains) continue;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = s;
                }
            }
            if (!best) continue;

            const leftEnd = Math.max(
                refined[i].startMs + minDurMs,
                Math.min(boundary, best.start + tailPadMs),
            );
            const rightStart = Math.min(
                refined[i + 1].endMs - minDurMs,
                Math.max(boundary, best.end - headPadMs),
            );
            if (leftEnd < rightStart && leftEnd > refined[i].startMs && rightStart < refined[i + 1].endMs) {
                refined[i].endMs = leftEnd;
                refined[i + 1].startMs = rightStart;
            }
        }

        return refined.filter((c) => c.text && c.endMs > c.startMs);
    }

    function redistributeBoundariesForTexts(startMs, endMs, texts) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const parts = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (parts.length < 2) return null;

        const totalDur = Math.max(1, end - start);
        const totalChars = parts.reduce((sum, part) => sum + textCharCount(part), 0) || 1;
        const boundaries = [start];
        let usedChars = 0;
        for (let i = 0; i < parts.length - 1; i += 1) {
            usedChars += textCharCount(parts[i]);
            const ratio = usedChars / totalChars;
            boundaries.push(Math.round(start + ratio * totalDur));
        }
        boundaries.push(end);
        for (let i = 1; i < boundaries.length; i += 1) {
            boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + 1);
        }
        boundaries[boundaries.length - 1] = end;
        return boundaries;
    }

    function snapSplitIndexNearPunctuation(text, index, radius = 10, breakWords = null) {
        const raw = String(text || '');
        const pos = Math.min(raw.length - 1, Math.max(1, Math.round(Number(index) || 0)));
        const start = Math.max(1, pos - radius);
        const end = Math.min(raw.length - 1, pos + radius);
        let best = pos;
        let bestScore = -1;
        let bestDist = Infinity;
        const breakWordSet = breakWords != null
            ? new Set(getBreakWordBreakIndices(raw, breakWords))
            : null;

        for (let i = start; i <= end; i += 1) {
            const left = raw.slice(0, i).trim();
            const right = raw.slice(i).trim();
            if (!left || !right) continue;
            if (!isValidTextBreakIndex(raw, i, 2, breakWords)) continue;

            const prev = raw[i - 1] || '';
            const ch = raw[i] || '';
            let score = 0;
            if (breakWordSet && breakWordSet.has(i)) score = 6;
            else if (allowsWhitespaceBreak(raw) && (/\s/.test(prev) || /\s/.test(ch))) score = 5;
            else if (STRONG_PUNCT_RE.test(prev) || STRONG_PUNCT_RE.test(ch)) score = 4;
            else if (WEAK_PUNCT_RE.test(prev) || WEAK_PUNCT_RE.test(ch)) score = 3;
            if (score <= 0) continue;

            const dist = Math.abs(i - pos);
            if (score > bestScore || (score === bestScore && dist < bestDist)) {
                bestScore = score;
                bestDist = dist;
                best = i;
            }
        }

        if (bestScore < 0) {
            const wsIdx = snapSplitIndexAtWhitespace(text, pos, Math.max(radius, 16), breakWords || DEFAULT_BREAK_WORDS);
            if (wsIdx !== pos && isValidTextBreakIndex(raw, wsIdx, 2, breakWords)) return wsIdx;
            const safe = findNearestSafeBreakIndex(raw, pos, Math.max(radius, 16), breakWords || DEFAULT_BREAK_WORDS);
            return safe != null ? safe : -1;
        }
        if (!isValidTextBreakIndex(raw, best, 2, breakWords)) {
            const safe = findNearestSafeBreakIndex(raw, pos, Math.max(radius, 16), breakWords || DEFAULT_BREAK_WORDS);
            return safe != null ? safe : -1;
        }
        return best;
    }

    function snapSplitIndexAtWhitespace(text, index, radius = 16, breakWords = DEFAULT_BREAK_WORDS) {
        const raw = String(text || '');
        const pos = Math.min(raw.length - 1, Math.max(1, Math.round(Number(index) || 0)));
        let best = -1;
        let bestDist = Infinity;
        for (let i = 1; i < raw.length; i += 1) {
            const prev = raw[i - 1] || '';
            const ch = raw[i] || '';
            if (!/\s/.test(prev) && !/\s/.test(ch)) continue;
            const left = raw.slice(0, i).trim();
            const right = raw.slice(i).trim();
            if (!left || !right) continue;
            if (!isValidTextBreakIndex(raw, i, 2, breakWords)) continue;
            const dist = Math.abs(i - pos);
            if (dist > radius) continue;
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best >= 0 ? best : pos;
    }

    function mergeTinyTextSegments(texts, boundaries, minChars = 2) {
        const parts = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (parts.length < 2) {
            return { texts: parts, boundaries };
        }

        let mergedTexts = [...parts];
        let mergedBounds = [...(boundaries || [])];
        if (mergedBounds.length !== mergedTexts.length + 1) {
            mergedBounds = redistributeBoundariesForTexts(
                mergedBounds[0],
                mergedBounds[mergedBounds.length - 1],
                mergedTexts,
            ) || mergedBounds;
        }

        let changed = true;
        while (changed && mergedTexts.length >= 2) {
            changed = false;
            for (let i = 0; i < mergedTexts.length; i += 1) {
                const chars = textCharCount(mergedTexts[i]);
                const orphanParticle = isOrphanToneParticleOnly(mergedTexts[i]);
                if (chars >= minChars && !orphanParticle) continue;
                if (i > 0) {
                    mergedTexts[i - 1] = `${mergedTexts[i - 1]} ${mergedTexts[i]}`.replace(/\s+/g, ' ').trim();
                    mergedTexts.splice(i, 1);
                    mergedBounds.splice(i, 1);
                    changed = true;
                    break;
                }
                if (i < mergedTexts.length - 1) {
                    mergedTexts[i + 1] = `${mergedTexts[i]} ${mergedTexts[i + 1]}`.replace(/\s+/g, ' ').trim();
                    mergedTexts.splice(i, 1);
                    mergedBounds.splice(i, 1);
                    changed = true;
                    break;
                }
            }
        }
        return { texts: mergedTexts, boundaries: mergedBounds };
    }

    function buildCuesFromTexts(startMs, endMs, texts, timeMode = 'proportional', timeOpts = {}) {
        const list = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (!list.length) return [];
        const end = endMs != null ? endMs : startMs + 2000;
        const totalDur = Math.max(100, end - startMs);
        if (list.length === 1) {
            return [{ startMs, endMs: end, text: list[0] }];
        }

        const minDurMs = Math.max(100, Math.round(Number(timeOpts.minDurMs) || 500));

        if (timeMode === 'equal') {
            const step = Math.floor(totalDur / list.length);
            let cur = startMs;
            return list.map((text, i) => {
                const isLast = i === list.length - 1;
                const cueEnd = isLast ? end : cur + step;
                const cue = { startMs: cur, endMs: cueEnd, text };
                cur = cueEnd;
                return cue;
            });
        }

        if (timeMode === 'cps') {
            const targetCps = Math.max(0.1, Number(timeOpts.targetCps) || 3);
            const idealDurs = list.map((text) => {
                const chars = textCharCount(text);
                return Math.max(minDurMs, Math.ceil((chars / targetCps) * 1000));
            });
            const totalIdeal = idealDurs.reduce((sum, d) => sum + d, 0);
            let cur = startMs;
            if (totalIdeal <= totalDur) {
                return list.map((text, i) => {
                    const isLast = i === list.length - 1;
                    const dur = isLast ? end - cur : idealDurs[i];
                    const cue = { startMs: cur, endMs: cur + dur, text };
                    cur += dur;
                    return cue;
                });
            }
            const scale = totalDur / totalIdeal;
            return list.map((text, i) => {
                const isLast = i === list.length - 1;
                const dur = isLast
                    ? end - cur
                    : Math.max(minDurMs, Math.round(idealDurs[i] * scale));
                const cue = { startMs: cur, endMs: cur + dur, text };
                cur += dur;
                return cue;
            });
        }

        const totalWeight = list.reduce((s, t) => s + Math.max(1, textCharCount(t)), 0);
        let cur = startMs;
        return list.map((text, i) => {
            const isLast = i === list.length - 1;
            const weight = Math.max(1, textCharCount(text));
            const dur = isLast ? end - cur : Math.max(minDurMs, Math.round(totalDur * (weight / totalWeight)));
            const cue = { startMs: cur, endMs: cur + dur, text };
            cur += dur;
            return cue;
        });
    }

    function summarizeSplitCues(cues) {
        const list = cues || [];
        if (!list.length) return { count: 0, cpsMin: null, cpsMax: null };
        const cpsValues = list.map((cue) => {
            const dur = Math.max(1, (cue.endMs ?? cue.startMs + 2000) - cue.startMs);
            const chars = textCharCount(cue.text);
            return chars ? chars / (dur / 1000) : null;
        }).filter((v) => v != null);
        if (!cpsValues.length) {
            return { count: list.length, cpsMin: null, cpsMax: null };
        }
        return {
            count: list.length,
            cpsMin: Math.min(...cpsValues),
            cpsMax: Math.max(...cpsValues),
        };
    }

    function normalizeSilenceIntervals(intervals, startMs, endMs) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        return (intervals || [])
            .map((iv) => ({
                start: Math.round(Number(iv.startMs != null ? iv.startMs : (iv.startSec || 0) * 1000)),
                end: Math.round(Number(iv.endMs != null ? iv.endMs : (iv.endSec || 0) * 1000)),
            }))
            .filter((s) => s.end > s.start && s.start < end && s.end > start)
            .map((s) => ({
                start: Math.max(start, s.start),
                end: Math.min(end, s.end),
            }))
            .filter((s) => s.end > s.start)
            .sort((a, b) => a.start - b.start);
    }

    function inferSpeechStartFromSilence(startMs, endMs, intervals, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        if (end <= start) return start;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const nearStartMs = Math.max(50, Math.round(Number(options.nearStartMs) || 200));
        const minLeadingSilenceMs = Math.max(
            100,
            Math.round(Number(options.minLeadingSilenceMs) || options.minTrailingSilenceMs || 300),
        );
        const headPadMs = Math.max(0, Math.round(Number(options.headPadMs) || 80));
        const minShiftMs = Math.max(50, Math.round(Number(options.minShiftMs) || 150));

        const silences = normalizeSilenceIntervals(intervals, start, end);
        if (!silences.length) return start;

        for (const s of silences) {
            if (start >= s.start && start < s.end) {
                const newStart = Math.min(end - minDurMs, Math.max(start, s.end - headPadMs));
                if (newStart > start) return newStart;
            }
        }

        for (const s of silences) {
            const reachesStart = s.start <= start + nearStartMs;
            const dur = s.end - s.start;
            if (reachesStart && dur >= minLeadingSilenceMs) {
                const newStart = Math.min(end - minDurMs, Math.max(start, s.end - headPadMs));
                if (newStart - start >= minShiftMs || newStart > start) return newStart;
            }
        }

        return start;
    }

    function inferSpeechEndFromSilence(startMs, endMs, intervals, options = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        if (end <= start) return null;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const minTrailingSilenceMs = Math.max(100, Math.round(Number(options.minTrailingSilenceMs) || 300));
        const nearEndMs = Math.max(50, Math.round(Number(options.nearEndMs) || 200));
        const tailPadMs = Math.max(0, Math.round(Number(options.tailPadMs) || 80));
        const minShrinkMs = Math.max(50, Math.round(Number(options.minShrinkMs) || 150));

        const silences = normalizeSilenceIntervals(intervals, start, end);
        if (!silences.length) return null;

        for (const s of silences) {
            if (end > s.start && end <= s.end + nearEndMs) {
                const newEnd = Math.max(start + minDurMs, s.start + tailPadMs);
                if (newEnd < end) return Math.min(end, newEnd);
            }
        }

        let trailingStart = null;
        for (let i = silences.length - 1; i >= 0; i -= 1) {
            const s = silences[i];
            const dur = s.end - s.start;
            const reachesEnd = s.end >= end - nearEndMs;
            if (reachesEnd && dur >= minTrailingSilenceMs) {
                trailingStart = s.start;
                break;
            }
        }

        if (trailingStart == null) {
            const midpoint = start + (end - start) * 0.35;
            let bestDur = 0;
            for (const s of silences) {
                const dur = s.end - s.start;
                if (s.start >= midpoint && dur >= minTrailingSilenceMs && dur > bestDur) {
                    bestDur = dur;
                    trailingStart = s.start;
                }
            }
        }

        if (trailingStart == null) return null;

        const newEnd = Math.min(end, Math.max(start + minDurMs, trailingStart + tailPadMs));
        if (end - newEnd < minShrinkMs) return null;
        return newEnd;
    }

    /**
     * 由静音区间求分析窗内的语音段（绝对毫秒）
     */
    function buildSpeechRegionsFromSilence(windowStartMs, windowEndMs, intervals, minSpeechMs = 200) {
        const windowStart = Math.round(Number(windowStartMs) || 0);
        const windowEnd = Math.max(windowStart + 1, Math.round(Number(windowEndMs) || 0));
        const silences = normalizeSilenceIntervals(intervals, windowStart, windowEnd);
        const regions = [];
        let cursor = windowStart;
        for (const s of silences) {
            if (s.start > cursor + 1) {
                regions.push({ startMs: cursor, endMs: s.start });
            }
            cursor = Math.max(cursor, s.end);
        }
        if (windowEnd > cursor + 1) {
            regions.push({ startMs: cursor, endMs: windowEnd });
        }
        const minMs = Math.max(50, Math.round(Number(minSpeechMs) || 200));
        return regions.filter((r) => r.endMs - r.startMs >= minMs);
    }

    function pickPrimarySpeechRegion(regions, cueStartMs, cueEndMs) {
        const list = Array.isArray(regions) ? regions : [];
        if (!list.length) return null;
        const cueStart = Math.round(Number(cueStartMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(Number(cueEndMs) || 0));
        let best = null;
        let bestOverlap = -1;
        for (const r of list) {
            const overlap = Math.max(0, Math.min(r.endMs, cueEnd) - Math.max(r.startMs, cueStart));
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                best = r;
            }
        }
        if (best && bestOverlap > 0) return best;

        const mid = (cueStart + cueEnd) / 2;
        let nearest = list[0];
        let nearestDist = Infinity;
        for (const r of list) {
            const rMid = (r.startMs + r.endMs) / 2;
            const dist = Math.abs(rMid - mid);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = r;
            }
        }
        return nearest;
    }

    /**
     * 按静音检测将字幕起止贴到语音边界（保留文本）
     * @returns {{ startMs: number, endMs: number, changed: boolean, reason?: string, region?: object }}
     */
    function snapCueTimingFromSilenceIntervals(cueStartMs, cueEndMs, intervals, options = {}) {
        const cueStart = Math.round(Number(cueStartMs) || 0);
        const cueEnd = Math.max(cueStart + 1, Math.round(Number(cueEndMs) || 0));
        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const headPadMs = Math.max(0, Math.round(Number(options.headPadMs) || 80));
        const tailPadMs = Math.max(0, Math.round(Number(options.tailPadMs) || 80));
        const minSpeechMs = Math.max(80, Math.round(Number(options.minSpeechMs) || 200));
        const minShiftMs = Math.max(20, Math.round(Number(options.minShiftMs) || 80));
        const allowExtend = options.allowExtend !== false;

        const windowStart = Math.round(Number(options.windowStartMs != null ? options.windowStartMs : cueStart) || 0);
        const windowEnd = Math.max(
            windowStart + 1,
            Math.round(Number(options.windowEndMs != null ? options.windowEndMs : cueEnd) || 0),
        );
        const prevLimit = options.prevLimitMs != null
            ? Math.round(Number(options.prevLimitMs))
            : windowStart;
        const nextLimit = options.nextLimitMs != null
            ? Math.round(Number(options.nextLimitMs))
            : windowEnd;

        const regions = buildSpeechRegionsFromSilence(windowStart, windowEnd, intervals, minSpeechMs);
        if (!regions.length) {
            return { startMs: cueStart, endMs: cueEnd, changed: false, reason: 'no_speech' };
        }

        const region = pickPrimarySpeechRegion(regions, cueStart, cueEnd);
        if (!region) {
            return { startMs: cueStart, endMs: cueEnd, changed: false, reason: 'no_region' };
        }

        let newStart = region.startMs - headPadMs;
        let newEnd = region.endMs + tailPadMs;

        newStart = Math.max(windowStart, prevLimit, newStart);
        newEnd = Math.min(windowEnd, nextLimit, newEnd);

        if (!allowExtend) {
            newStart = Math.max(newStart, cueStart);
            newEnd = Math.min(newEnd, cueEnd);
        }

        if (newEnd - newStart < minDurMs) {
            const grow = minDurMs - (newEnd - newStart);
            const roomBefore = newStart - Math.max(windowStart, prevLimit);
            const roomAfter = Math.min(windowEnd, nextLimit) - newEnd;
            const takeBefore = Math.min(roomBefore, Math.ceil(grow / 2));
            newStart -= takeBefore;
            newEnd = Math.min(Math.min(windowEnd, nextLimit), newEnd + (grow - takeBefore));
            if (newEnd - newStart < minDurMs) {
                return { startMs: cueStart, endMs: cueEnd, changed: false, reason: 'too_short', region };
            }
        }

        newStart = Math.round(newStart);
        newEnd = Math.round(newEnd);
        const startDelta = Math.abs(newStart - cueStart);
        const endDelta = Math.abs(newEnd - cueEnd);
        if (startDelta < minShiftMs && endDelta < minShiftMs) {
            return { startMs: cueStart, endMs: cueEnd, changed: false, reason: 'unchanged', region };
        }

        return {
            startMs: newStart,
            endMs: newEnd,
            changed: true,
            region,
            startDelta: newStart - cueStart,
            endDelta: newEnd - cueEnd,
        };
    }

    function refineSilenceSplitCueTimings(cues, intervals, parentStart, parentEnd, options = {}) {
        if (!cues?.length) return cues;

        const minDurMs = Math.max(100, Math.round(Number(options.minDurMs) || 500));
        const gapMs = Math.max(0, Math.round(Number(options.gapMs) || 1));
        const silences = normalizeSilenceIntervals(intervals, parentStart, parentEnd);
        if (!silences.length) return cues;

        const refined = cues.map((c) => ({
            startMs: Math.round(Number(c.startMs) || 0),
            endMs: Math.round(Number(c.endMs) || 0),
            text: c.text,
        }));

        for (let i = 0; i < refined.length; i += 1) {
            const cue = refined[i];
            const speechStart = inferSpeechStartFromSilence(cue.startMs, cue.endMs, intervals, options);
            if (speechStart > cue.startMs) {
                cue.startMs = Math.min(speechStart, cue.endMs - minDurMs);
            }

            const speechEnd = inferSpeechEndFromSilence(cue.startMs, cue.endMs, intervals, options);
            if (speechEnd != null && speechEnd < cue.endMs) {
                cue.endMs = Math.max(speechEnd, cue.startMs + minDurMs);
            }
        }

        for (let i = 1; i < refined.length; i += 1) {
            if (refined[i].startMs < refined[i - 1].endMs + gapMs) {
                refined[i - 1].endMs = Math.max(
                    refined[i - 1].startMs + minDurMs,
                    refined[i].startMs - gapMs,
                );
            }
            if (refined[i].startMs < refined[i - 1].endMs + gapMs) {
                refined[i].startMs = refined[i - 1].endMs + gapMs;
            }
            if (refined[i].endMs <= refined[i].startMs) {
                refined[i].endMs = refined[i].startMs + minDurMs;
            }
        }

        return refined.filter((c) => c.text && c.endMs > c.startMs);
    }

    function buildCuesFromSilenceSplits(text, startMs, endMs, splitPointsMs, snapRadius = 16, intervals = null, timingOptions = {}) {
        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const raw = String(text || '').trim();
        const breakOpts = {
            breakWords: resolveBreakWords(timingOptions),
            includePunctuation: timingOptions.includePunctuation !== false,
            // Default on: never bisect a complete sentence (。！？) without spaces
            respectSentenceBoundaries: timingOptions.respectSentenceBoundaries !== false,
        };

        const spaceBreaks = allowsWhitespaceBreak(raw)
            ? getWhitespaceBreakIndices(raw)
            : [];
        const sentenceBreaks = getSentenceBreakIndices(raw);
        const safeBreaks = [...new Set([...sentenceBreaks, ...spaceBreaks])].sort((a, b) => a - b);

        const alignOpts = {
            ...breakOpts,
            maxSplits: timingOptions.maxSplits,
        };
        let sorted = alignSilenceSplitPointsToText(raw, start, end, splitPointsMs, intervals, alignOpts);
        if (!sorted.length) return null;

        let texts;
        if (safeBreaks.length && breakOpts.respectSentenceBoundaries) {
            // Cut only at spaces / sentence breaks nearest to detected silence (not every space)
            const cutBreaks = snapTimesToNearestBreakIndices(raw, start, end, sorted, safeBreaks, {
                minPartChars: 2,
            });
            texts = splitTextAtBreakIndices(raw, cutBreaks, breakOpts.breakWords);
            if (!texts || texts.length < 2) {
                texts = buildTextsFromTimeBoundaries(raw, start, end, sorted, snapRadius, breakOpts);
            }
            if (!texts || texts.length < 2) return null;
            if (sorted.length !== texts.length - 1) {
                const redistributed = redistributeBoundariesForTexts(start, end, texts);
                if (!redistributed) return null;
                sorted = redistributed.slice(1, -1);
            }
        } else {
            texts = buildTextsFromTimeBoundaries(raw, start, end, sorted, snapRadius, breakOpts);
            if (!texts || texts.length < 2) return null;
        }

        let boundaries = [start, ...sorted, end];
        if (texts.length !== boundaries.length - 1) {
            boundaries = redistributeBoundariesForTexts(start, end, texts);
            if (!boundaries) return null;
        }

        const minMergeChars = 2;
        const merged = mergeTinyTextSegments(texts, boundaries, minMergeChars);
        texts = merged.texts;
        boundaries = merged.boundaries;

        if (texts.length < 2 || boundaries.length !== texts.length + 1) return null;

        let cues = [];
        for (let i = 0; i < texts.length; i += 1) {
            const rawText = String(texts[i] || '').trim();
            const cleaned = stripLeadingCuePunctuation(rawText);
            cues.push({
                startMs: boundaries[i],
                endMs: boundaries[i + 1],
                text: cleaned || rawText,
            });
        }
        if (cues.length < 2) return null;

        if (intervals?.length) {
            cues = applySilenceEdgeBoundaries(cues, intervals, start, end, timingOptions);
            if (!cues || cues.length < 2) return null;
            const refined = refineSilenceSplitCueTimings(cues, intervals, start, end, timingOptions);
            return refined.length >= 2 ? refined : null;
        }
        return cues;
    }

    function buildTextsFromTimeBoundaries(text, startMs, endMs, splitPointsMs, snapRadius = 16, options = {}) {
        const raw = String(text || '').trim();
        if (!raw) return null;

        const start = Math.round(Number(startMs) || 0);
        const end = Math.round(Number(endMs) || 0);
        const totalDur = end - start;
        if (totalDur <= 0) return null;

        const sorted = (splitPointsMs || [])
            .map((ms) => Math.round(Number(ms) || 0))
            .filter((ms) => ms > start && ms < end)
            .sort((a, b) => a - b);
        const boundaries = [start, ...sorted, end];
        if (boundaries.length < 3) return null;

        const breakWords = resolveBreakWords(options);
        const textBreaks = getSilenceTextBreakIndices(raw, {
            breakWords,
            includePunctuation: options.includePunctuation !== false,
        });
        const len = raw.length;
        const indices = boundaries.map((ms, i) => {
            if (i === 0) return 0;
            if (i === boundaries.length - 1) return len;
            if (textBreaks.length === 1 && boundaries.length === 3) {
                const only = textBreaks[0];
                return isValidTextBreakIndex(raw, only, 2, breakWords) ? only : -1;
            }
            const ratio = (ms - start) / totalDur;
            return snapSplitIndexNearPunctuation(
                raw,
                Math.round(ratio * len),
                snapRadius,
                breakWords,
            );
        });

        for (let i = 1; i < indices.length; i += 1) {
            if (i < indices.length - 1) {
                if (indices[i] < 0 || !isValidTextBreakIndex(raw, indices[i], 2, breakWords)) {
                    return null;
                }
            }
            indices[i] = Math.max(indices[i], indices[i - 1] + 1);
        }
        indices[indices.length - 1] = len;

        const texts = [];
        for (let i = 0; i < indices.length - 1; i += 1) {
            const chunk = stripLeadingCuePunctuation(raw.slice(indices[i], indices[i + 1]).trim());
            if (chunk) texts.push(chunk);
        }
        return texts.length >= 2 ? texts : null;
    }

    return {
        DEFAULT_BREAK_WORDS,
        CONNECTOR_WORDS,
        isConnectedText,
        textCharCount,
        lineCharCount,
        stripLeadingCuePunctuation,
        isOrphanToneParticleOnly,
        collapseOrphanParticleSegments,
        isMidWordZhBreakIndex,
        isValidTextBreakIndex,
        hasSubtitlePunctuation,
        isUnpunctuatedConnectedText,
        isEnglishLikeText,
        isSpacedScriptBreakWord,
        isBreakWordMatchAt,
        findAlphabeticWordSafeBreak,
        findLatinWordSafeBreak,
        allowsWhitespaceBreak,
        findNearestSafeBreakIndex,
        normalizeBreakWords,
        resolveBreakWords,
        findConnectorBreak,
        splitTextByLines,
        mergeTextLines,
        splitTextBySpaces,
        splitTextByCharCount,
        splitTextSmart,
        splitTextIntoNParts,
        splitTextAtIndex,
        alignSilenceSplitPointsToText,
        pickScoredSilenceSplitPoints,
        pickSplitPointsForSafeBreaks,
        snapTimesToNearestBreakIndices,
        splitTextAtBreakIndices,
        idealTimesForTextBreaks,
        pickScoredSplitPointsNearIdeals,
        applySilenceEdgeBoundaries,
        normalizeSilenceIntervals,
        inferSpeechStartFromSilence,
        inferSpeechEndFromSilence,
        buildSpeechRegionsFromSilence,
        pickPrimarySpeechRegion,
        snapCueTimingFromSilenceIntervals,
        refineSilenceSplitCueTimings,
        getWhitespaceBreakIndices,
        getBreakWordBreakIndices,
        getSilenceTextBreakIndices,
        getSentenceBreakIndices,
        endsWithStrongSentencePunct,
        snapSplitIndexNearPunctuation,
        buildCuesFromTexts,
        buildTextsFromTimeBoundaries,
        buildCuesFromSilenceSplits,
        summarizeSplitCues,
    };
}));
