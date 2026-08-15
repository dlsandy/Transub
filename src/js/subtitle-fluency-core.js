/**
 * 字幕通顺度规则检查（浏览器与 Node 测试共用）
 * 只做嫌疑标注，不自动润色文案。
 */
(function (global, factory) {
    const splitCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-split-core')
        : (global && global.TransubSubtitleSplit);
    let jaNames = null;
    try {
        jaNames = (typeof module !== 'undefined' && module.exports)
            ? require('./ja-person-names-core')
            : (global && global.TransubJaPersonNames);
    } catch (_) {
        jaNames = null;
    }
    const api = factory(splitCore, jaNames);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleFluency = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleFluencyCoreFactory(splitCore, jaNames) {
    let mtOpaque = null;
    try {
        mtOpaque = (typeof module !== 'undefined' && module.exports)
            ? require('./mt-opaque-strings')
            : (globalThis && globalThis.TransubMtOpaque);
    } catch (_) {
        mtOpaque = null;
    }
    const JA_MID_CUT_RE = mtOpaque?.RE?.chinchiTruncSrc || /(?:ご|少)$/;

    const CJK_PARTICLES = new Set([
        '的', '了', '着', '过', '和', '与', '及', '或', '在', '把', '被', '对', '向', '从', '给',
        '吗', '呢', '吧', '啊', '呀', '嘛', '哎', '嗯',
    ]);
    const EN_DANGLING = new Set([
        'a', 'an', 'the', 'to', 'of', 'and', 'or', 'but', 'with', 'for', 'in', 'on', 'at',
        'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
        'i', 'we', 'you', 'he', 'she', 'they', 'it', 'my', 'your', 'our', 'their',
    ]);
    const FRAGMENT_ONLY = new Set([
        ...CJK_PARTICLES,
        '啊', '呃', '额', '哦', '喔', '哼', '嘿', '哈', '欸', '诶', '唔', '噢', '唉',
        'uh', 'um', 'er', 'ah', 'oh', 'hmm', 'mm', 'uhm', 'err',
    ]);

    /** 常见 ASR 音效/杂音标签（整条仅为该内容） */
    const SOUND_EFFECT_RE = new RegExp(
        '^[\\s\\[\\(（【〈《「『]*'
        + '(音乐|片头曲|片尾曲|背景音乐|bgm|掌声|笑声|哭声|咳嗽|清嗓|喘气|吸气|呼气'
        + '|喧哗|嘈杂|杂音|噪音|音效|沉默|静音|bell|铃声'
        + '|noise|music|applause|laughter|laughing|cough(?:ing)?'
        + '|breathing|silence|inaudible|unintelligible)'
        + '[\\s\\]\\)）】〉》」』]*$',
        'i',
    );

    function textCharCount(text) {
        if (splitCore?.textCharCount) return splitCore.textCharCount(text);
        return Array.from(String(text || '').replace(/\s+/g, '')).length;
    }

    function isConnectedText(text) {
        if (splitCore?.isConnectedText) return splitCore.isConnectedText(text);
        const s = String(text || '').trim();
        if (!s) return false;
        return !/\s/.test(s) && /[\u4e00-\u9fff]/.test(s);
    }

    function hasHeavyRepetition(text) {
        const raw = String(text || '').trim();
        if (raw.length < 4) return false;
        if (/(.)\1{4,}/.test(raw)) return true;
        if (/(.{2,6})\1{2,}/.test(raw)) return true;
        return false;
    }

    function isCompressiblePhrase(phrase) {
        const s = String(phrase || '');
        if (!s || /^\s+$/.test(s)) return false;
        // 纯标点/省略号不压
        if (/^[。！？!?…·.•,，、；;:：\-—_~～"'「」『』【】[\]()（）\s]+$/.test(s)) return false;
        return /[\u4e00-\u9fffA-Za-z0-9]/.test(s);
    }

    function absorbTrailingPartial(chars, end, phrase) {
        const phraseChars = Array.from(phrase);
        if (phraseChars.length < 2 || end >= chars.length) return end;
        const minPrefix = Math.max(2, Math.ceil(phraseChars.length / 2));
        for (let prefixLen = phraseChars.length - 1; prefixLen >= minPrefix; prefixLen -= 1) {
            const prefix = phraseChars.slice(0, prefixLen);
            let match = true;
            for (let k = 0; k < prefixLen; k += 1) {
                if (chars[end + k] !== prefix[k]) {
                    match = false;
                    break;
                }
            }
            if (!match) continue;
            // 后面若还能接完整 phrase，则交给下一轮，不吸收半截
            const after = end + prefixLen;
            if (after + phraseChars.length <= chars.length) {
                let fullNext = true;
                for (let k = 0; k < phraseChars.length; k += 1) {
                    if (chars[after + k] !== phraseChars[k]) {
                        fullNext = false;
                        break;
                    }
                }
                if (fullNext) continue;
            }
            return after;
        }
        return end;
    }

    /**
     * 从 chars[i] 起查找「连续 / 空白分隔」的短语重复。
     * 同覆盖长度下优先重复次数更多（更短原子短语），避免「好的好的」抢先于「好的」。
     * @returns {{ phrase: string, count: number, end: number } | null}
     */
    function findRepetitionRun(chars, i, options = {}) {
        const minRepeats = Math.max(2, Number(options.minRepeats) || 3);
        const minPhraseLen = Math.max(1, Number(options.minPhraseLen) || 1);
        const maxPhraseLen = Math.max(minPhraseLen, Number(options.maxPhraseLen) || 6);
        const remain = chars.length - i;
        if (remain < minPhraseLen * minRepeats) return null;

        let best = null;

        function consider(phrase, count, end) {
            if (count < minRepeats) return;
            const resolvedEnd = absorbTrailingPartial(chars, end, phrase);
            if (!best
                || count > best.count
                || (count === best.count && resolvedEnd > best.end)
                || (count === best.count && resolvedEnd === best.end && phrase.length < best.phrase.length)) {
                best = { phrase, count, end: resolvedEnd };
            }
        }

        for (let plen = Math.min(maxPhraseLen, Math.floor(remain / minRepeats)); plen >= minPhraseLen; plen -= 1) {
            const phraseArr = chars.slice(i, i + plen);
            const phrase = phraseArr.join('');
            if (!isCompressiblePhrase(phrase)) continue;

            // 无间隔连续重复
            let count = 1;
            let pos = i + plen;
            while (pos + plen <= chars.length) {
                let same = true;
                for (let k = 0; k < plen; k += 1) {
                    if (chars[pos + k] !== phraseArr[k]) {
                        same = false;
                        break;
                    }
                }
                if (!same) break;
                count += 1;
                pos += plen;
            }
            consider(phrase, count, pos);

            // 空白分隔重复：词 + 空白 + 词…
            count = 1;
            pos = i + plen;
            while (pos < chars.length) {
                let ws = 0;
                while (pos + ws < chars.length && /\s/.test(chars[pos + ws])) ws += 1;
                if (ws < 1 || pos + ws + plen > chars.length) break;
                let same = true;
                for (let k = 0; k < plen; k += 1) {
                    if (chars[pos + ws + k] !== phraseArr[k]) {
                        same = false;
                        break;
                    }
                }
                if (!same) break;
                count += 1;
                pos = pos + ws + plen;
            }
            consider(phrase, count, pos);
        }
        return best;
    }

    function formatCompressedRun(phrase, options = {}) {
        const addExclaim = options.addExclaim !== false;
        // 观影友好：压成两次叠写，不用省略号（好的好的！ / 哈哈！）
        let out = `${phrase}${phrase}`;
        if (addExclaim && !/[。！？!?…]$/.test(out)) out += '！';
        return out;
    }

    /** 旧版「词…词！」→「词词！」；顺带收掉叠词省略号形态。 */
    function normalizeLegacyEllipsisRepetition(text) {
        let out = String(text ?? '');
        if (!out || !out.includes('…')) return out;
        // Longer phrases first via iterative replace until stable
        let prev = '';
        while (prev !== out) {
            prev = out;
            out = out.replace(
                /([\u4e00-\u9fffA-Za-zぁ-んァ-ンー]{1,6})…+\1([！!]?)/g,
                (_, phrase, bang) => phrase + phrase + (bang || ''),
            );
        }
        return out;
    }

    /**
     * 压缩单条文本中的叠词/叠句（如「好的」×N →「好的好的！」）。
     * @returns {{ text: string, changed: boolean, runs: number }}
     */
    function compressRepetitionInText(text, options = {}) {
        const raw = String(text ?? '');
        const legacy = normalizeLegacyEllipsisRepetition(raw);
        const chars = Array.from(legacy);
        if (chars.length < 3) {
            return {
                text: legacy,
                changed: legacy !== raw,
                runs: legacy !== raw ? 1 : 0,
            };
        }

        const opts = {
            minRepeats: Math.max(2, Number(options.minRepeats) || 3),
            minPhraseLen: options.compressSingleChar === false ? 2 : 1,
            maxPhraseLen: Math.max(1, Number(options.maxPhraseLen) || 6),
            addExclaim: options.addExclaim !== false,
        };

        const out = [];
        let i = 0;
        let runs = legacy !== raw ? 1 : 0;
        while (i < chars.length) {
            const hit = findRepetitionRun(chars, i, opts);
            if (hit) {
                const nextCh = hit.end < chars.length ? chars[hit.end] : '';
                const skipExclaim = /[。！？!?]/.test(nextCh);
                out.push(formatCompressedRun(hit.phrase, {
                    addExclaim: opts.addExclaim && !skipExclaim,
                }));
                runs += 1;
                i = hit.end;
                continue;
            }
            out.push(chars[i]);
            i += 1;
        }

        let result = out.join('');
        // 压缩后可能紧贴原有感叹号：好的好的！！ → 好的好的！
        result = result.replace(/！{2,}/g, '！').replace(/!{2,}/g, '!');
        return {
            text: result,
            changed: result !== raw,
            runs,
        };
    }

    /**
     * 观影文本精简档位：off | light | clear
     * 兼容旧布尔：true→light（历史「开启」≈轻度），false→off；缺省由调用方给默认 clear。
     */
    function normalizeViewingCleanLevel(raw, fallback = 'clear') {
        const v = String(raw ?? '').trim().toLowerCase();
        if (v === 'off' || v === 'none' || v === '0' || v === 'false') return 'off';
        if (v === 'light' || v === 'mild' || v === 'soft') return 'light';
        if (v === 'clear' || v === 'remove' || v === 'drop' || v === 'full') return 'clear';
        if (raw === true || raw === 1) return 'light';
        if (raw === false || raw === 0) return 'off';
        const fb = String(fallback || 'clear').toLowerCase();
        if (fb === 'off' || fb === 'light' || fb === 'clear') return fb;
        return 'clear';
    }

    /**
     * 观影精简标点。
     * light：标点改空格（句号/顿号逗号/破折号/装饰省略号），保留问号与感叹号（多感叹压成一个）。
     * clear：在 light 基础上再把感叹号改空格，仅保留问号。
     */
    function simplifyViewingPunctuationInText(text, options = {}) {
        const raw = String(text ?? '');
        if (!raw) return { text: raw, changed: false };
        const level = normalizeViewingCleanLevel(options.level, 'light');
        if (level === 'off') return { text: raw, changed: false };
        let out = raw;
        // 破折号 / 波浪作停顿装饰 → 空格
        out = out.replace(/[—―–﹣－]+/g, ' ');
        out = out.replace(/[〜～]+/g, ' ');
        // 句号（避开小数 3.14 / 版本号）
        out = out.replace(/。/g, ' ');
        out = out.replace(/．/g, ' ');
        out = out.replace(/(\d)\.(\d)/g, '$1\uE000$2');
        out = out.replace(/\./g, ' ');
        out = out.replace(/\uE000/g, '.');
        // 顿号、中英文逗号
        out = out.replace(/[、，,]/g, ' ');
        // 分号、中文冒号（保留英文 : 以免破坏 Name: 对话）
        out = out.replace(/[；;：]/g, ' ');
        // 装饰省略号（含旧叠词残留）
        out = out.replace(/…+/g, ' ');
        out = out.replace(/\.{3,}/g, ' ');
        if (level === 'clear') {
            out = out.replace(/[！!]+/g, ' ');
            out = out.replace(/？{2,}/g, '？').replace(/\?{2,}/g, '?');
        } else {
            out = out.replace(/！{2,}/g, '！').replace(/!{2,}/g, '!');
            out = out.replace(/？{2,}/g, '？').replace(/\?{2,}/g, '?');
        }
        // 收紧空白：多空格合一，去首尾；保留的 ？！ 前若多余空格也收掉
        out = out.replace(/[ \t]+/g, ' ');
        out = out.replace(/ +([？?！!])/g, '$1');
        out = out.replace(/^[ \t]+|[ \t]+$/g, '');
        out = out.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
        return { text: out, changed: out !== raw };
    }

    function simplifyViewingPunctuationInCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const level = normalizeViewingCleanLevel(options.level, 'light');
        if (level === 'off') {
            return {
                cues: list.map((c) => ({ startMs: c?.startMs, endMs: c?.endMs, text: c?.text })),
                stats: { cueTotal: list.length, cueTouched: 0, charSaved: 0, level },
                changedIndexes: [],
                summary: '观影精简标点：已关闭',
            };
        }
        const indexSet = options.indexes == null
            ? null
            : new Set((Array.isArray(options.indexes) ? options.indexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0));
        const next = list.map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text,
        }));
        const changedIndexes = [];
        let charSaved = 0;
        for (let i = 0; i < next.length; i += 1) {
            if (indexSet && !indexSet.has(i)) continue;
            const before = String(next[i].text ?? '');
            const { text, changed } = simplifyViewingPunctuationInText(before, { level });
            if (!changed) continue;
            next[i] = { ...next[i], text };
            changedIndexes.push(i);
            charSaved += Math.max(0, textCharCount(before) - textCharCount(text));
        }
        const stats = {
            cueTotal: list.length,
            cueTouched: changedIndexes.length,
            charSaved,
            level,
        };
        const label = level === 'clear' ? '观影清除标点' : '观影精简标点';
        return {
            cues: next,
            stats,
            changedIndexes,
            summary: stats.cueTouched
                ? `${label} ${stats.cueTouched} 条${stats.charSaved ? `（约少 ${stats.charSaved} 字）` : ''}`
                : `${label}：无需修改`,
        };
    }

    /**
     * 批量压缩字幕叠词。不改时间轴。
     * @returns {{ cues: object[], stats: object, changedIndexes: number[], summary: string }}
     */
    function compressRepetitionInCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const indexSet = options.indexes == null
            ? null
            : new Set((Array.isArray(options.indexes) ? options.indexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0));
        const next = list.map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text,
        }));
        const changedIndexes = [];
        let runTotal = 0;
        let charSaved = 0;

        for (let i = 0; i < next.length; i += 1) {
            if (indexSet && !indexSet.has(i)) continue;
            const before = String(next[i].text ?? '');
            const { text, changed, runs } = compressRepetitionInText(before, options);
            if (!changed) continue;
            next[i] = { ...next[i], text };
            changedIndexes.push(i);
            runTotal += runs;
            charSaved += Math.max(0, textCharCount(before) - textCharCount(text));
        }

        const stats = {
            cueTotal: list.length,
            cueTouched: changedIndexes.length,
            runs: runTotal,
            charSaved,
        };
        return {
            cues: next,
            stats,
            changedIndexes,
            summary: summarizeRepetitionCompress(stats),
        };
    }

    function summarizeRepetitionCompress(stats) {
        if (!stats?.cueTouched) return '未发现可压缩的叠词条目';
        const parts = [`${stats.cueTouched} 条`];
        if (stats.runs) parts.push(`${stats.runs} 处叠词`);
        if (stats.charSaved) parts.push(`约少 ${stats.charSaved} 字`);
        return `将压缩 ${parts.join(' · ')}`;
    }

    function hasStutter(text) {
        const raw = String(text || '').trim();
        if (raw.length < 3) return false;
        // 单字口吃：我我我 / 好好好（至少连续 3 次）
        if (/([\u4e00-\u9fffA-Za-z])\1{2,}/.test(raw)) return true;
        // 英文单词口吃：I I I / the the
        if (/\b([A-Za-z]{1,12})\b(?:\s+\1\b){2,}/i.test(raw)) return true;
        return false;
    }

    function endsWithDangling(text) {
        const raw = String(text || '').trim().replace(/["""''「」『』【】[\]()（）…·.•-]+$/g, '').trim();
        if (!raw) return false;
        const lastChar = raw.slice(-1);
        if (CJK_PARTICLES.has(lastChar) && /[\u4e00-\u9fff]/.test(raw) && raw.length >= 2) {
            // 「吗/呢/吧/啊」作句末语气词时不算残缺
            if (!['吗', '呢', '吧', '啊', '呀', '嘛'].includes(lastChar)) return true;
        }
        const m = raw.match(/([A-Za-z]+)$/);
        if (m && EN_DANGLING.has(m[1].toLowerCase())) return true;
        return false;
    }

    function isFragmentCue(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        const normalized = raw.replace(/["""''「」『』【】[\]()（）。！？!?…,.，、；;:：·.•-]+/g, '').trim();
        if (!normalized) return false;
        const lower = normalized.toLowerCase();
        if (FRAGMENT_ONLY.has(lower)) return true;
        if (EN_DANGLING.has(lower) && !/\s/.test(normalized)) return true;
        if (/^[\u4e00-\u9fff]$/.test(normalized) && CJK_PARTICLES.has(normalized)) return true;
        // JA ASR word-tail / orphan fragments (しい / こで / bare っ)
        if (/^(しい|こで|っ|ゃ|ゅ|ょ)$/.test(normalized)) return true;
        return false;
    }

    function isJaScriptHeavy(text) {
        const t = String(text || '').replace(/\s+/g, '');
        if (!t) return false;
        const ja = (t.match(/[\u3040-\u30ff々ー]/g) || []).length;
        return ja >= 2 && ja / Math.max(1, t.length) >= 0.45;
    }

    function endsJaBroken(text) {
        const t = String(text || '').trim();
        if (!t || /[。！？!?]$/.test(t)) return false;
        const plain = t.replace(/\s+/g, '');
        // Explicit mid-word cuts seen in AV ASR
        if (JA_MID_CUT_RE.test(plain)) return true;
        if (/[てでにとをはがのっンん]$/.test(plain) && plain.length >= 6) return true;
        return false;
    }

    function startsJaContinuation(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        if (!t) return false;
        if (/^(めん?なさい|なさい|しだけ|んいっぱい|こで|しい)/.test(t)) return true;
        if (/^っ[、,]/.test(t)) return true;
        return false;
    }

    function isStrongJaContinuation(text) {
        const t = String(text || '').trim().replace(/\s+/g, '');
        return /^(めん?なさい|しだけ|こで|しい|んいっぱい)/.test(t);
    }

    /**
     * Stitch JA ASR mid-phrase splits (e.g. 「…ご」+「めんなさい…」).
     * Conservative: only strong continuation patterns / tiny kana tails.
     * @param {Array<{startMs?:number,endMs?:number,text?:string}>} cues
     * @param {object} [options]
     * @returns {{ cues: object[], stats: object, mergedPairs: number }}
     */
    function stitchJaFragmentCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxGapMs = Math.max(0, Math.min(2000, Number(options.maxGapMs) || 600));
        const wideGapMs = Math.max(maxGapMs, Math.min(4000, Number(options.wideGapMs) || 2200));
        const maxMergedDurMs = Math.max(3000, Math.min(60000, Number(options.maxMergedDurMs) || 12000));
        const out = [];
        let mergedPairs = 0;
        let i = 0;
        while (i < list.length) {
            const cur = {
                startMs: list[i]?.startMs,
                endMs: list[i]?.endMs,
                text: list[i]?.text,
            };
            let j = i + 1;
            while (j < list.length) {
                const next = list[j];
                const aEnd = Number(cur.endMs);
                const bStart = Number(next?.startMs);
                const gap = Number.isFinite(aEnd) && Number.isFinite(bStart)
                    ? bStart - aEnd
                    : 0;

                const at = String(cur.text || '').trim();
                const bt = String(next?.text || '').trim();
                if (!at || !bt) break;
                if (!isJaScriptHeavy(at) && !isJaScriptHeavy(bt)) break;
                if (/[。！？!?]$/.test(at)) break;

                const broken = endsJaBroken(at);
                const cont = startsJaContinuation(bt);
                const strongCont = isStrongJaContinuation(bt);
                const bPlain = bt.replace(/[。．.！？!?…\s　♪♫、，,]+/g, '');
                const tinyTail = gap <= 200 && /^(しい|ゃ|ゅ|ょ)$/.test(bPlain);

                let allow = false;
                if (tinyTail) {
                    allow = true;
                } else if (strongCont && gap <= wideGapMs) {
                    allow = true;
                } else if (cont && broken && gap <= maxGapMs) {
                    allow = true;
                } else if (cont && /^っ[、,]/.test(bt.replace(/\s+/g, '')) && gap <= maxGapMs) {
                    allow = true;
                }
                if (!allow) break;

                const nextEnd = Number(next?.endMs);
                const mergedEnd = Number.isFinite(nextEnd) ? nextEnd : cur.endMs;
                const mergedDur = Number.isFinite(Number(cur.startMs)) && Number.isFinite(Number(mergedEnd))
                    ? Number(mergedEnd) - Number(cur.startMs)
                    : 0;
                if (mergedDur > maxMergedDurMs) break;

                cur.text = `${at}${bt}`;
                cur.endMs = mergedEnd;
                mergedPairs += 1;
                j += 1;
            }
            out.push(cur);
            i = Math.max(j, i + 1);
        }
        return {
            cues: out,
            mergedPairs,
            stats: {
                before: list.length,
                after: out.length,
                mergedPairs,
            },
        };
    }

    function summarizeJaStitch(stats) {
        if (!stats?.mergedPairs) return '无需拼接日语断词';
        return `拼接日语断词 ${stats.mergedPairs} 处（${stats.before}→${stats.after} 条）`;
    }

    function isSoundEffectCue(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        if (SOUND_EFFECT_RE.test(raw)) return true;
        // ♪…♫ / ◆… 纯乐符、章节标记行
        if (/^[♪♫♩♬◆◇■□★☆●○◎※\s·.•…\-—_]+$/.test(raw)) return true;
        return false;
    }

    function isSymbolOnlyCue(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        const stripped = raw.replace(/[\s♪♫♩♬◆◇■□★☆●○◎※·.•…\-—_.,。！？!?，、；;:：【】[\]()（）「」『』"""'']+/g, '');
        return !stripped;
    }

    /** 常见 ASR 幻觉短句 / 占位符（整条匹配） */
    const HALLUCINATION_EXACT = new Set([
        '完毕', '结束', '完', '谢谢观看', '感谢观看', '请订阅', '字幕by',
        '请使用简体中文输出。', '请使用简体中文输出', '請使用繁體中文輸出。', '請使用繁體中文輸出',
        '简体中文', '繁体中文', '繁體中文',
        'ご視聴ありがとうございました', 'ご視聴頂きありがとうございます',
        'ご視聴いただきありがとうございます', 'ご清聴ありがとうございました',
        'チャンネル登録よろしくお願いします', 'チャンネル登録お願いいたします',
        '高評価よろしくお願いします', 'グッドボタンよろしくお願いします',
        'お疲れ様でした', 'お疲れさまでした',
        'おめでとうございます', 'それではまた', '次回もお楽しみに',
        'バイバイ', 'ばいばい', 'Bye-bye', 'bye-bye', 'BYE-BYE',
        '字幕：', 'subtitles by', 'thanks for watching', 'thank you for watching', 'the end',
        '本集', '本集。',
        '寂寞', '寂寞酷', '寂寞曲', '寂寞笑',
        // Do NOT list soft-AV fills like 好厉害 / 哈… — post-batch would wipe MT prefills.
        '准备',
        // Opening BGM / logo echoes (IPZZ-745)
        'おわり', 'おわり。', '終わり', '終わり。',
        'ユーモア', 'ユーモア。',
        'the end.', 'The End', 'THE END',
    ]);
    // Soft-AV / smart-translate deterministic fills — never treat as short-duration hallucination.
    const SOFT_INTERJECTION_KEEP_RE = /^(?:哈啊?|哈…|嗯嗯?|啊啊?|呜+|呼+|诶诶?|呵呵+|唔+|哦+|噢+|嘿+|嗨+|好的?|是啊|这个|那个|不|呐|喂|咦|可以|遵命|好厉害|谢谢|再见|再见啦|原来如此|等一下|糟了|真棒|好大|啧|因为|那就)[…·.•。．.!！?？\s]*$/u;
    // JA YouTube / soft-scene filler often emitted as whole cues by Whisper
    // Single "." / "…" music-bed hallucinations are common on film English ASR.
    const HALLUCINATION_RE = /^(?:[Oo○〇◯●]{2,}|[・･.。…]{1,}|[♪♫♩♬◆◇■□★☆●○◎※]+|字幕\s*[:：by].*|thanks?\s+for\s+watching.*|ご視聴.*ありがとう.*|チャンネル登録.*|高評価.*|グッドボタン.*|李宗盛.*)$/i;
    const PROMPT_LEAK_RE = /人名です|登場人物の名前は|登場人物：|舞は人名|トミーは人名|ダンスではない/;
    const LATIN_CJK_JAM_RE = /[A-Za-z]{2,}[\u3040-\u30ff\u4e00-\u9fff]|[\u3040-\u30ff\u4e00-\u9fff][A-Za-z]{2,}/;

    /**
     * Normalize Latin Whisper artifacts on source tracks.
     * ▁ → space, don ' t → don't, 1 0 → 10, greatI → great I.
     */
    function normalizeAsrText(text) {
        let s = String(text || '');
        if (!s) return '';
        if (s.includes('\u2581')) s = s.replace(/\u2581/g, ' ');
        const aposSuffixes = new Set(['m', 's', 're', 've', 'll', 'd', 't', 'am', 'em']);
        for (let i = 0; i < 3; i += 1) {
            const nxt = s.replace(/\b([A-Za-z]+)\s+'\s*([A-Za-z]+)\b/g, (_, left, right) => {
                if (aposSuffixes.has(String(right).toLowerCase()) || String(right).length <= 2) {
                    return `${left}'${right}`;
                }
                return `${left} ${right}`;
            });
            if (nxt === s) break;
            s = nxt;
        }
        for (let i = 0; i < 4; i += 1) {
            const nxt = s.replace(/(?<!\d)(\d)\s+(\d)(?!\d)/g, '$1$2');
            if (nxt === s) break;
            s = nxt;
        }
        s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
        s = s.replace(/\s+([,.!?;:])/g, '$1');
        s = s.replace(/[ \t\u3000]+/g, ' ').trim();
        return s;
    }

    function normalizeAsrTextInCues(cues) {
        const list = Array.isArray(cues) ? cues : [];
        let changed = 0;
        const out = list.map((cue) => {
            const prev = String(cue?.text || '');
            const next = normalizeAsrText(prev);
            if (next !== prev) {
                changed += 1;
                return { ...cue, text: next };
            }
            return cue;
        });
        return { cues: out, changed };
    }

    function cueDurationMs(cue) {
        const start = Number(cue?.startMs);
        const end = cue?.endMs != null ? Number(cue.endMs) : start + 2000;
        if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
        return Math.max(0, end - start);
    }

    function isHallucinationCue(cueOrText, options = {}) {
        const cue = cueOrText && typeof cueOrText === 'object' ? cueOrText : null;
        const raw = String(cue ? cue.text : cueOrText || '').trim();
        if (!raw) return false;
        const maxChars = Math.max(1, Number(options.maxChars) || 12);
        const maxDurMs = Math.max(100, Number(options.maxDurMs) || 1200);
        const lower = raw.toLowerCase();
        if (HALLUCINATION_EXACT.has(raw) || HALLUCINATION_EXACT.has(lower)) return true;
        if (HALLUCINATION_RE.test(raw)) return true;
        if (PROMPT_LEAK_RE.test(raw)) return true;
        if (raw.length <= 24 && LATIN_CJK_JAM_RE.test(raw)) return true;
        if (hasHeavyRepetition(raw) && textCharCount(raw) <= 24) return true;
        if (/https?:\/\/|www\./i.test(raw) && textCharCount(raw) <= 40) return true;
        // Keep soft-AV moan / short stock fills (嗯嗯 / 哈…) on translate tracks.
        if (SOFT_INTERJECTION_KEEP_RE.test(raw)) return false;
        if (cue) {
            const chars = textCharCount(raw);
            const dur = cueDurationMs(cue);
            if (chars <= 2 && dur > 0 && dur <= maxDurMs) return true;
            if (chars <= maxChars && dur > 0 && dur <= Math.min(maxDurMs, 800) && /^(完毕|结束|完了|okay|ok|はい|うん)$/i.test(raw)) {
                return true;
            }
        }
        return false;
    }

    function isNoiseCue(text, options = {}) {
        const opts = {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
        };
        const raw = String(text || '').trim();
        if (!raw) return opts.removeEmpty ? 'empty' : '';
        if (opts.removeFragments && isFragmentCue(raw)) return 'fragment';
        if (opts.removeSoundEffects && isSoundEffectCue(raw)) return 'soundEffect';
        if (opts.removeSymbolOnly && isSymbolOnlyCue(raw)) return 'symbolOnly';
        return '';
    }

    /**
     * Rewrite cues: strip Whisper JA name/filler loops (玲奈玲奈 / 葵葵葵) in place.
     * @param {object[]} cues
     * @returns {{ cues: object[], changed: number }}
     */
    function stripAsrNameLoopsInCues(cues) {
        if (!jaNames?.stripAsrHallucinationLoopsInCues) {
            return { cues: Array.isArray(cues) ? cues : [], changed: 0 };
        }
        return jaNames.stripAsrHallucinationLoopsInCues(cues);
    }

    /**
     * 批量删除杂音字幕（空句 / 语气碎片 / 音效标签 / 纯符号 / 可选连续重复 / 可选幻觉短句）。
     * @returns {{ cues: object[], stats: object, removedIndexes: number[] }}
     */
    function removeNoiseFromCues(cues, options = {}) {
        const opts = {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
            removeDuplicates: options.removeDuplicates === true,
            removeHallucinations: options.removeHallucinations === true,
            stripAsrNameLoops: options.stripAsrNameLoops !== false,
            normalizeAsrText: options.normalizeAsrText !== false,
            hallucinationMaxChars: options.hallucinationMaxChars,
            hallucinationMaxDurMs: options.hallucinationMaxDurMs,
            // Opt-in: blank noise to a placeholder instead of deleting (legacy align mode).
            // Prefer paired JA↔ZH deletion via removeAlignedNoiseFromCuePairs.
            blankInsteadOfRemove: options.blankInsteadOfRemove === true,
            blankPlaceholder: String(options.blankPlaceholder || '…'),
        };
        let list = Array.isArray(cues) ? cues : [];
        let asrLoopChanged = 0;
        let asrNormChanged = 0;
        if (opts.normalizeAsrText) {
            const normalized = normalizeAsrTextInCues(list);
            list = normalized.cues;
            asrNormChanged = normalized.changed || 0;
        }
        if (opts.stripAsrNameLoops) {
            const cleaned = stripAsrNameLoopsInCues(list);
            list = cleaned.cues;
            asrLoopChanged = cleaned.changed || 0;
        }
        const kept = [];
        const removedIndexes = [];
        const stats = {
            removed: 0,
            kept: 0,
            blanked: 0,
            empty: 0,
            fragment: 0,
            soundEffect: 0,
            symbolOnly: 0,
            duplicate: 0,
            hallucination: 0,
            asrNameLoops: asrLoopChanged,
            asrNormalize: asrNormChanged,
        };
        let prevKeptText = '';
        const placeholder = opts.blankPlaceholder || '…';

        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const text = String(cue?.text || '').trim();
            let reason = isNoiseCue(text, opts);
            if (!reason && opts.removeHallucinations && isHallucinationCue(cue, {
                maxChars: opts.hallucinationMaxChars,
                maxDurMs: opts.hallucinationMaxDurMs,
            })) {
                reason = 'hallucination';
            }
            if (!reason && opts.removeDuplicates && prevKeptText && text === prevKeptText && text.length >= 1) {
                reason = 'duplicate';
            }
            if (reason) {
                if (opts.blankInsteadOfRemove) {
                    // Keep timing slot; avoid re-flagging the placeholder as symbol-only noise
                    const alreadyBlank = text === placeholder || text === '...' || text === '……';
                    kept.push(alreadyBlank ? cue : { ...cue, text: placeholder });
                    if (!alreadyBlank) stats.blanked += 1;
                    if (stats[reason] != null) stats[reason] += 1;
                    prevKeptText = placeholder;
                    stats.kept += 1;
                    continue;
                }
                removedIndexes.push(i);
                stats.removed += 1;
                if (stats[reason] != null) stats[reason] += 1;
                continue;
            }
            kept.push(cue);
            prevKeptText = text;
            stats.kept += 1;
        }

        return { cues: kept, stats, removedIndexes };
    }

    /**
     * Classify why a cue is noise (empty / fragment / SFX / symbol / hallucination / duplicate).
     * Returns '' when the cue should be kept.
     */
    function classifyNoiseCue(cue, options = {}, prevKeptText = '') {
        const opts = {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
            removeDuplicates: options.removeDuplicates === true,
            removeHallucinations: options.removeHallucinations === true,
            hallucinationMaxChars: options.hallucinationMaxChars,
            hallucinationMaxDurMs: options.hallucinationMaxDurMs,
        };
        const text = String(cue?.text || '').trim();
        let reason = isNoiseCue(text, opts);
        if (!reason && opts.removeHallucinations && isHallucinationCue(cue, {
            maxChars: opts.hallucinationMaxChars,
            maxDurMs: opts.hallucinationMaxDurMs,
        })) {
            reason = 'hallucination';
        }
        if (!reason && opts.removeDuplicates && prevKeptText && text === prevKeptText && text.length >= 1) {
            reason = 'duplicate';
        }
        return reason || '';
    }

    /**
     * Delete noise from aligned JA+ZH cue lists together (union of noisy indexes),
     * so cue counts stay matched without blanking ZH to 「…」.
     * @returns {{ zhCues: object[], jaCues: object[], stats: object, removedIndexes: number[], skipped?: boolean, reason?: string }}
     */
    function removeAlignedNoiseFromCuePairs(zhCues, jaCues, options = {}) {
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        if (!zhList.length || !jaList.length) {
            return {
                zhCues: zhList,
                jaCues: jaList,
                stats: { removed: 0, kept: 0 },
                removedIndexes: [],
                skipped: true,
                reason: 'empty',
            };
        }
        if (zhList.length !== jaList.length) {
            return {
                zhCues: zhList,
                jaCues: jaList,
                stats: { removed: 0, kept: 0 },
                removedIndexes: [],
                skipped: true,
                reason: 'length_mismatch',
            };
        }

        const zhOpts = {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
            removeDuplicates: false,
            removeHallucinations: options.removeHallucinations !== false,
            hallucinationMaxChars: options.hallucinationMaxChars,
            hallucinationMaxDurMs: options.hallucinationMaxDurMs,
        };
        // Dedupe consecutive identical lines on JA only (moans may repeat on ZH).
        const jaOpts = {
            ...zhOpts,
            removeDuplicates: options.removeDuplicates !== false,
            normalizeAsrText: options.normalizeAsrText !== false,
            stripAsrNameLoops: options.stripAsrNameLoops !== false,
        };

        let zhWork = zhList;
        let jaWork = jaList;
        let asrLoopChanged = 0;
        let asrNormChanged = 0;
        if (jaOpts.normalizeAsrText) {
            const normalized = normalizeAsrTextInCues(jaWork);
            jaWork = normalized.cues;
            asrNormChanged = normalized.changed || 0;
        }
        if (jaOpts.stripAsrNameLoops) {
            const cleaned = stripAsrNameLoopsInCues(jaWork);
            jaWork = cleaned.cues;
            asrLoopChanged = cleaned.changed || 0;
        }

        const drop = new Set();
        const reasonAt = [];
        let prevJaKept = '';
        let prevZhKept = '';
        for (let i = 0; i < zhWork.length; i += 1) {
            const zhReason = classifyNoiseCue(zhWork[i], zhOpts, prevZhKept);
            const jaReason = classifyNoiseCue(jaWork[i], jaOpts, prevJaKept);
            const reason = zhReason || jaReason;
            if (reason) {
                drop.add(i);
                reasonAt[i] = reason;
                continue;
            }
            prevZhKept = String(zhWork[i]?.text || '').trim();
            prevJaKept = String(jaWork[i]?.text || '').trim();
        }

        const zhOut = [];
        const jaOut = [];
        const removedIndexes = [];
        const stats = {
            removed: 0,
            kept: 0,
            blanked: 0,
            empty: 0,
            fragment: 0,
            soundEffect: 0,
            symbolOnly: 0,
            duplicate: 0,
            hallucination: 0,
            asrNameLoops: asrLoopChanged,
            asrNormalize: asrNormChanged,
            paired: true,
        };
        for (let i = 0; i < zhWork.length; i += 1) {
            if (drop.has(i)) {
                removedIndexes.push(i);
                stats.removed += 1;
                const reason = reasonAt[i];
                if (reason && stats[reason] != null) stats[reason] += 1;
                continue;
            }
            zhOut.push(zhWork[i]);
            jaOut.push(jaWork[i]);
            stats.kept += 1;
        }
        return {
            zhCues: zhOut,
            jaCues: jaOut,
            stats,
            removedIndexes,
        };
    }

    function summarizeNoiseRemoval(stats) {
        const parts = [];
        if (stats?.asrNormalize) parts.push(`ASR规范化 ${stats.asrNormalize}`);
        if (stats?.asrNameLoops) parts.push(`ASR叠名 ${stats.asrNameLoops}`);
        if (stats?.blanked) parts.push(`占位保留 ${stats.blanked}`);
        if (!stats?.removed && !stats?.blanked) {
            return parts.length
                ? `已清理（${parts.join(' · ')}）`
                : '未发现可删除的杂音条目';
        }
        if (stats.empty) parts.push(`空文本 ${stats.empty}`);
        if (stats.fragment) parts.push(`语气碎片 ${stats.fragment}`);
        if (stats.soundEffect) parts.push(`音效标签 ${stats.soundEffect}`);
        if (stats.symbolOnly) parts.push(`纯符号 ${stats.symbolOnly}`);
        if (stats.hallucination) parts.push(`幻觉短句 ${stats.hallucination}`);
        if (stats.duplicate) parts.push(`连续重复 ${stats.duplicate}`);
        if (stats.blanked && !stats.removed) {
            return `已清理（${parts.join(' · ') || '杂音'}），保留 ${stats.kept} 条时间轴`;
        }
        return `将删除 ${stats.removed} 条（${parts.join(' · ') || '杂音'}），保留 ${stats.kept} 条`;
    }

    /** Strip hearts / music / soft decoration so moan detectors see the kana/CJK core. */
    function stripInterjectionDecor(text) {
        return String(text || '')
            .replace(/[♡♥❤♪☆★\*＊]+/g, '')
            .replace(/[゛゜゙゚]/g, '')
            .replace(/[―—–‐]/g, 'ー')
            .trim();
    }

    /** Semantic いい / 良い (feels good) — never treat as a pure moan atom. */
    function isSemanticIiJaToken(token) {
        return /^(?:いい+|良い)[っッ]?$/i.test(String(token || '').trim());
    }

    /** JA discourse filler / short ack (语气), not moan/laugh. */
    function isPureDiscourseJaToken(token) {
        const raw = stripInterjectionDecor(token);
        if (!raw) return true;
        const t = raw.replace(/[。．.!！?？]+$/g, '').trim();
        if (!t) return true;
        if (/^(?:いいえ|いや+|おはよう.*|おかえり.*|お願い.*|あなた|あいつ|あいつめ)$/i.test(t)) {
            return false;
        }
        if (isSemanticIiJaToken(t)) return false;
        return /^(?:うん+|ううん+|ええ+|えぇ+|えっ|え|はい+|ねえ+|ねぇ+|そう|(?:よし)+|ん+|んん+|あら|おや|えっと+|えーと+|えー+|あのー+)$/i.test(t);
    }

    /** JA onomatopoeia / breath / laugh (拟声). */
    function isPureOnomatopoeiaJaToken(token) {
        const raw = stripInterjectionDecor(token);
        if (!raw) return true;
        const t = raw.replace(/[。．.!！?？]+$/g, '').trim();
        if (!t) return true;
        if (isSemanticIiJaToken(t)) return false;
        if (/いい|良い/.test(t)) return false;
        if (/^(?:ああ+|あぁ+|あっ+|あん+|ああん+|はぁ+|はあ+|ハァ+|ふぅ+|ふう+|へえ+|へー+|ほう+|ほぅ+|うぅ+|やっ|ひゃっ?)$/i.test(t)) {
            return true;
        }
        if (/^(?:[うウ]?ふふ+[うっゥッ]*|[えエ]?へへ+[えっェッ]*|[あア]?はは+[あっァッ]*|んふ[ぅうゥウっッ]*|くぅ+[っッ]?|くっ|むぅ+|んむ+|もぐ+|むにゃ[ぁア]*|もぐもぐ+|ぽりぽり+|ずずず+|ちゅば[っつ]*|ガルル+|ぐぬぬ*)$/i.test(t)) {
            return true;
        }
        // Short wet/muffled oral scraps often left as standalone cues
        if (/^(?:んぶ+[ぅうっゥッ]*|んむ+[ぅうっゥッ]*|むぐ+|ぐすっ?|ちゅ[っプぷぼば]+|じゅ[っるりゅ]*|ず[ずっ]+|ぽり+|もぐ+|ぐぬ+|ガル[ルる]*)$/i.test(t)) {
            return true;
        }
        if (/^(?:ア+|ウ+|ン+|ハッ+|ハァ+|フウ+|クン+|ヒャッ?|ヤッ)$/i.test(t)) {
            return true;
        }
        if (/^[あぁアァいぃイィうぅウゥえぇエェおぉオオはハひヒふフへヘほホッッんンくクむムー〜～ー]+$/i.test(t)) {
            return true;
        }
        return false;
    }

    /**
     * One JA token that is only a discourse filler / laugh / moan run (no concrete dialogue).
     */
    function isPureInterjectionJaToken(token) {
        return isPureDiscourseJaToken(token) || isPureOnomatopoeiaJaToken(token);
    }

    function isBlankOrPunctOnly(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return true;
        return /^[。．.!！?？…·.•\s\-—_~～ー]+$/.test(t)
            || /^(?:…+|\.{2,}|……)$/.test(t);
    }

    function everySplitToken(text, pred) {
        const t = stripInterjectionDecor(text);
        if (!t) return true;
        const parts = t
            .replace(/[。．.!！?？]+$/g, '')
            .split(/[、，,・·.•…\s]+/)
            .map((p) => p.trim())
            .filter(Boolean);
        if (!parts.length) return true;
        return parts.every((p) => pred(p));
    }

    function isPureDiscourseJa(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return false;
        if (isBlankOrPunctOnly(t)) return false;
        if (/^(?:うん+|ううん+|ええ+|えぇ+|えっ|え|はい+|ねえ+|ねぇ+|そう|(?:よし)+|ん+|んん+|あら|おや|えっと+|えーと+|えー+|あのー+)[。．!！?？\s…ー〜～っッ]*$/i.test(t)) {
            return true;
        }
        return everySplitToken(t, isPureDiscourseJaToken)
            && !everySplitToken(t, (p) => isPureOnomatopoeiaJaToken(p) && !isPureDiscourseJaToken(p));
    }

    function isPureOnomatopoeiaJa(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return false;
        if (isBlankOrPunctOnly(t)) return false;
        if (/^(?:ああ+|あぁ+|あっ+|あん+|ああん+|はぁ+|はあ+|ハァ+|ふぅ+|ふう+)[。．!！?？\s…ー〜～っッ]*$/i.test(t)) {
            return true;
        }
        if (/^[はハひヒふフへヘほホあぁアァいぃイィうぅウゥえぇエェおぉオォんンー〜～っッ!！?？…。．.\s♡♥❤くクむム]+$/i.test(t)) {
            const compact = t.replace(/[。．.!！?？…·.•\s\-—_~～ー、，,・]+/g, '');
            if (/^(?:いいえ|いや+|おはよう)/i.test(compact)) return false;
            if (/いい|良い/.test(compact)) return false;
            // Pure discourse particles alone are not onomatopoeia.
            if (/^(?:うん+|はい+|そう|よし+|ん+|ねえ+|えっと+)$/i.test(compact)) return false;
            return true;
        }
        return everySplitToken(t, isPureOnomatopoeiaJaToken)
            && !isPureDiscourseJa(t);
    }

    /**
     * Pure JA interjection / moan cue (no concrete dialogue). Union of discourse + onomatopoeia.
     */
    function isPureInterjectionJa(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return false;
        if (isBlankOrPunctOnly(t)) return true;
        if (isPureDiscourseJa(t) || isPureOnomatopoeiaJa(t)) return true;
        // Separator-tolerant fallback: every token pure of either kind.
        return everySplitToken(t, isPureInterjectionJaToken);
    }

    function isPureDiscourseZhToken(token) {
        const raw = stripInterjectionDecor(token);
        if (!raw) return true;
        const t = raw.replace(/[。．.!！?？]+$/g, '').trim();
        if (!t) return true;
        return /^(?:好的?|是的?|是啊|对的?|对啊|对|行|嗯+|嗯好|好[哦喔]|没错|哎呀|喂)$/u.test(t);
    }

    function isPureOnomatopoeiaZhToken(token) {
        const raw = stripInterjectionDecor(token);
        if (!raw) return true;
        const t = raw.replace(/[。．.!！?？]+$/g, '').trim();
        if (!t) return true;
        if (/^(?:好的?|是的?|是啊|对的?|对啊|对|行|嗯好|好[哦喔]|没错)$/u.test(t)) {
            return false;
        }
        if (/^(?:bump|boeh|yuk|hamu|hinin|huh|aki|mun|breath|hic|chu|urg|hya|ank|yoshun)[~～\-—_!.]*$/i.test(t)) {
            return true;
        }
        return /^(?:哈啊?|啊+|呜+|呼+|诶+|呵呵+|唔+|哦+|噢+|嘿+|嗨+|呵+|哼+|呀+|哟+|哇+|嘶|嘻+|啧|嗯+|唔嗯|嗯唔|嗯啊)$/u.test(t);
    }

    function isPureInterjectionZhToken(token) {
        return isPureDiscourseZhToken(token) || isPureOnomatopoeiaZhToken(token);
    }

    function isPureDiscourseZh(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return true;
        if (isBlankOrPunctOnly(t)) return true;
        if (/^(?:好的?|是的?|是啊|对的?|对啊|对|行|嗯好|好[哦喔]|没错|哎呀)[。．.!！?？\s…·.•]*$/u.test(t)) {
            return true;
        }
        if (/^(?:嗯+)[。．.!！?？\s…·.•]*$/u.test(t)) return true;
        const parts = t
            .replace(/[。．.!！?？]+$/g, '')
            .split(/[、，,\s…·.•]+/)
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length >= 1 && parts.every((p) => isPureDiscourseZhToken(p))) {
            // Reject if all tokens are also pure onomatopoeia-only (e.g. 呵呵)
            if (parts.every((p) => isPureOnomatopoeiaZhToken(p) && !/^(?:好的?|是|对|行|嗯|哎呀|喂)/u.test(p))) {
                return false;
            }
            return true;
        }
        const bare = t.replace(/[。．.、，,\s…·.•\-—_~～！!？?♡♥❤♪☆★]+/g, '');
        return /^(?:好的?|是的?|是啊|对的?|对啊|对|行|嗯+|嗯好|好哦|好喔|没错|哎呀)$/u.test(bare);
    }

    function isPureOnomatopoeiaZh(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return true;
        if (isBlankOrPunctOnly(t)) return true;
        if (/^(?:(?:哈啊?|啊啊?|呜+|呼+|诶诶?|呵呵+|唔+|哦+|噢+|嘿+|嗨+|呵+|哼+|呀+|哟+|哇+|嘶|嘻+|嗯+|唔嗯|嗯唔|嗯啊)[…·.•。．.!！?？\s]*)+$/u.test(t)) {
            return true;
        }
        if (/^(?:啊[，,。．.]?|哦[，,。．.]?|噢[，,。．.]?|哈[哈呵]?[。．.!！]?|呵呵[，,。．.]?|嗨[，,。．.]?|嘿[，,。．.]?|啧[，,。．.]?)$/.test(t)) {
            return true;
        }
        // Mixed moan stacks: 嗯嗯哈啊 / 嗯唔嗯嗯 / 唔嗯唔嗯
        {
            const bare = t.replace(/[。．.、，,\s…·.•\-—_~～！!？?♡♥❤♪☆★]+/g, '');
            if (bare && /^(?:嗯|唔|哈|啊|呜|呼|哦|噢|嘿|呵|哼|呀|哟|哇|嘶|嘻|诶|欸|嗨)+$/.test(bare)) {
                return true;
            }
        }
        // Latin-only short SFX line
        if (/^(?:[A-Za-z]{2,12}(?:\s+[A-Za-z]{2,12}){0,2})[~～\-—_!.]*$/u.test(t.trim())
            && /^(?:bump|boeh|yuk|hamu|hinin|huh|aki|mun|breath|hic|chu|urg|hya|ank|yoshun)(?:\s+(?:bump|boeh|yuk|hamu|hinin|huh|aki|mun|breath|hic|chu|urg|hya|ank|yoshun))*$/i.test(
                t.replace(/[~～\-—_!.]+$/g, '').trim(),
            )) {
            return true;
        }
        const parts = t
            .replace(/[。．.!！?？]+$/g, '')
            .split(/[、，,\s…·.•]+/)
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length >= 1 && parts.every((p) => isPureOnomatopoeiaZhToken(p))) {
            return true;
        }
        const bare = t.replace(/[。．.、，,\s…·.•\-—_~～！!？?♡♥❤♪☆★]+/g, '');
        if (!bare) return true;
        if (/^(?:好的?|是的?|是啊|对的?|对啊|对|行|嗯+|嗯好|好哦|好喔|没错|哎呀)$/u.test(bare)) {
            return false;
        }
        return /^(?:啊+|哦+|噢+|喂+|哈+|呵+|唔+|呜+|欸+|诶+|呀+|哟+|哇+|嘻+|嗨|嘿|哼|嘶|呼+|嗯+)+$/.test(bare);
    }

    /**
     * Pure ZH interjection / moan / blank / short acknowledgment. Union of discourse + onomatopoeia.
     */
    function isPureInterjectionZh(text) {
        const t = stripInterjectionDecor(text);
        if (!t) return true;
        if (isBlankOrPunctOnly(t)) return true;
        if (isPureDiscourseZh(t) || isPureOnomatopoeiaZh(t)) return true;
        return everySplitToken(t, isPureInterjectionZhToken);
    }

    function cueTimeRange(c) {
        const start = Number(c?.startMs ?? c?.start ?? 0);
        const end = Number(c?.endMs ?? c?.end ?? start);
        return {
            start: Number.isFinite(start) ? start : 0,
            end: Number.isFinite(end) ? end : 0,
        };
    }

    function cuesOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    function isFillerOrBlankText(text, pred) {
        const t = String(text || '');
        if (!t.trim() || isBlankOrPunctOnly(t)) return true;
        return pred(t);
    }

    /**
     * When JA/ZH cue counts differ, pair by time overlap and drop pure fillers.
     */
    function dropPureInterjectionPairsByTime(zhList, jaList, options = {}) {
        const dropDiscourse = options.dropDiscourse !== false;
        const dropOnomatopoeia = options.dropOnomatopoeia !== false;
        const zhPred = (t) => {
            if (dropDiscourse && dropOnomatopoeia) return isPureInterjectionZh(t);
            if (dropDiscourse) return isPureDiscourseZh(t);
            if (dropOnomatopoeia) return isPureOnomatopoeiaZh(t);
            return false;
        };
        const jaPred = (t) => {
            if (dropDiscourse && dropOnomatopoeia) return isPureInterjectionJa(t);
            if (dropDiscourse) return isPureDiscourseJa(t);
            if (dropOnomatopoeia) return isPureOnomatopoeiaJa(t);
            return false;
        };

        const zhDrop = new Set();
        const jaDrop = new Set();
        const zhRanges = zhList.map(cueTimeRange);
        const jaRanges = jaList.map(cueTimeRange);

        for (let i = 0; i < zhList.length; i += 1) {
            const zhText = String(zhList[i]?.text || '');
            if (!isFillerOrBlankText(zhText, zhPred)) continue;
            const overs = [];
            for (let j = 0; j < jaList.length; j += 1) {
                if (cuesOverlap(zhRanges[i], jaRanges[j])) overs.push(j);
            }
            if (!overs.length) {
                // Orphan pure ZH moan (no overlapping JA) → clear ZH
                if (zhPred(zhText) || isBlankOrPunctOnly(zhText) || !zhText.trim()) {
                    zhDrop.add(i);
                }
                continue;
            }
            const allJaFiller = overs.every((j) => isFillerOrBlankText(jaList[j]?.text, jaPred));
            if (!allJaFiller) continue;
            zhDrop.add(i);
            for (const j of overs) {
                if (isFillerOrBlankText(jaList[j]?.text, jaPred)) jaDrop.add(j);
            }
        }

        for (let j = 0; j < jaList.length; j += 1) {
            if (jaDrop.has(j)) continue;
            const jaText = String(jaList[j]?.text || '');
            if (!isFillerOrBlankText(jaText, jaPred)) continue;
            const overs = [];
            for (let i = 0; i < zhList.length; i += 1) {
                if (cuesOverlap(jaRanges[j], zhRanges[i])) overs.push(i);
            }
            if (!overs.length) {
                jaDrop.add(j);
                continue;
            }
            const allZhFillerOrDrop = overs.every((i) => (
                zhDrop.has(i) || isFillerOrBlankText(zhList[i]?.text, zhPred)
            ));
            if (!allZhFillerOrDrop) continue;
            jaDrop.add(j);
            for (const i of overs) {
                if (isFillerOrBlankText(zhList[i]?.text, zhPred)) zhDrop.add(i);
            }
        }

        const zhOut = [];
        const jaOut = [];
        const droppedIndexes = [...zhDrop].sort((a, b) => a - b);
        for (let i = 0; i < zhList.length; i += 1) {
            if (!zhDrop.has(i)) zhOut.push(zhList[i]);
        }
        for (let j = 0; j < jaList.length; j += 1) {
            if (!jaDrop.has(j)) jaOut.push(jaList[j]);
        }
        return {
            zhCues: zhOut,
            jaCues: jaOut,
            dropped: Math.max(zhDrop.size, jaDrop.size),
            droppedIndexes,
            droppedZh: zhDrop.size,
            droppedJa: jaDrop.size,
            alignedBy: 'time',
        };
    }

    /**
     * Drop cues where BOTH JA and ZH are pure fillers of the selected kinds.
     * Equal-length tracks use index pairing; mismatched counts fall back to time overlap.
     * @param {object} [options]
     * @param {boolean} [options.dropDiscourse=true]
     * @param {boolean} [options.dropOnomatopoeia=true]
     */
    function dropPureInterjectionPairs(zhCues, jaCues, options = {}) {
        const dropDiscourse = options.dropDiscourse !== false;
        const dropOnomatopoeia = options.dropOnomatopoeia !== false;
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        if (!zhList.length || !jaList.length) {
            return {
                zhCues: zhList,
                jaCues: jaList,
                dropped: 0,
                droppedIndexes: [],
                skipped: true,
                reason: 'empty',
            };
        }
        if (!dropDiscourse && !dropOnomatopoeia) {
            return {
                zhCues: zhList,
                jaCues: jaList,
                dropped: 0,
                droppedIndexes: [],
            };
        }
        if (zhList.length !== jaList.length) {
            return dropPureInterjectionPairsByTime(zhList, jaList, {
                dropDiscourse,
                dropOnomatopoeia,
            });
        }

        const matchKind = (zhText, jaText) => {
            const jaBlank = !String(jaText).trim() || isBlankOrPunctOnly(jaText);
            const zhBlank = !String(zhText).trim() || isBlankOrPunctOnly(zhText);
            if (dropDiscourse) {
                const jaOk = jaBlank || isPureDiscourseJa(jaText);
                const zhOk = zhBlank || isPureDiscourseZh(zhText);
                // Require at least one side to be real discourse (not both blank-only unless both blank placeholders)
                if (jaOk && zhOk && (jaBlank || zhBlank || (isPureDiscourseJa(jaText) && isPureDiscourseZh(zhText)))) {
                    // Avoid dropping onomatopoeia-only pairs under discourse-only mode
                    if (!dropOnomatopoeia) {
                        const bothOno = !jaBlank && !zhBlank
                            && isPureOnomatopoeiaJa(jaText) && !isPureDiscourseJa(jaText)
                            && isPureOnomatopoeiaZh(zhText) && !isPureDiscourseZh(zhText);
                        if (bothOno) return false;
                    }
                    // If discourse-only and both are ono-classified, skip
                    if (!isPureDiscourseJa(jaText) && !jaBlank) return false;
                    if (!isPureDiscourseZh(zhText) && !zhBlank) return false;
                    return true;
                }
            }
            if (dropOnomatopoeia) {
                const jaOk = jaBlank || isPureOnomatopoeiaJa(jaText);
                const zhOk = zhBlank || isPureOnomatopoeiaZh(zhText);
                if (jaOk && zhOk) {
                    if (!dropDiscourse) {
                        if (!isPureOnomatopoeiaJa(jaText) && !jaBlank) return false;
                        if (!isPureOnomatopoeiaZh(zhText) && !zhBlank) return false;
                        // Don't clear discourse-only pairs when only ono is enabled
                        const bothDisc = !jaBlank && !zhBlank
                            && isPureDiscourseJa(jaText) && !isPureOnomatopoeiaJa(jaText)
                            && isPureDiscourseZh(zhText) && !isPureOnomatopoeiaZh(zhText);
                        if (bothDisc) return false;
                    } else {
                        // Both kinds enabled: drop any pure filler pair (legacy behavior)
                        return (jaBlank || isPureInterjectionJa(jaText))
                            && (zhBlank || isPureInterjectionZh(zhText));
                    }
                    return true;
                }
            }
            return false;
        };

        // When both kinds enabled, use legacy union for maximum cleanup.
        const useUnion = dropDiscourse && dropOnomatopoeia;

        const zhOut = [];
        const jaOut = [];
        const droppedIndexes = [];
        for (let i = 0; i < zhList.length; i += 1) {
            const zhText = String(zhList[i]?.text || '');
            const jaText = String(jaList[i]?.text || '');
            let drop = false;
            if (useUnion) {
                const jaPure = !String(jaText).trim() || isPureInterjectionJa(jaText);
                drop = jaPure && isPureInterjectionZh(zhText);
            } else {
                drop = matchKind(zhText, jaText);
            }
            if (drop) {
                droppedIndexes.push(i);
                continue;
            }
            zhOut.push(zhList[i]);
            jaOut.push(jaList[i]);
        }
        return {
            zhCues: zhOut,
            jaCues: jaOut,
            dropped: droppedIndexes.length,
            droppedIndexes,
        };
    }

    function summarizePureInterjectionDrop(dropped, options = {}) {
        const n = Number(dropped) || 0;
        const disc = options.dropDiscourse !== false;
        const ono = options.dropOnomatopoeia !== false;
        let kind = '纯语气/拟声';
        if (disc && !ono) kind = '纯语气词';
        else if (!disc && ono) kind = '纯拟声词';
        if (n <= 0) return `未发现可清除的${kind}条目`;
        return `清除${kind} ${n} 条（日中成对删除并重编号）`;
    }

    function splitBilingualCueLines(text) {
        return String(text || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
    }

    function cueLooksBilingual(text) {
        return splitBilingualCueLines(text).length >= 2;
    }

    function bilingualLinesArePureFillerPair(lineA, lineB, options = {}) {
        const dropDiscourse = options.dropDiscourse !== false;
        const dropOnomatopoeia = options.dropOnomatopoeia !== false;
        if (!dropDiscourse && !dropOnomatopoeia) return false;
        const tryPair = (zhText, jaText) => {
            if (dropDiscourse && dropOnomatopoeia) {
                const jaPure = !String(jaText).trim() || isPureInterjectionJa(jaText);
                return jaPure && isPureInterjectionZh(zhText);
            }
            if (dropDiscourse) {
                const jaBlank = !String(jaText).trim() || isBlankOrPunctOnly(jaText);
                const zhBlank = !String(zhText).trim() || isBlankOrPunctOnly(zhText);
                const jaOk = jaBlank || isPureDiscourseJa(jaText);
                const zhOk = zhBlank || isPureDiscourseZh(zhText);
                if (!(jaOk && zhOk)) return false;
                if (!dropOnomatopoeia) {
                    const bothOno = !jaBlank && !zhBlank
                        && isPureOnomatopoeiaJa(jaText) && !isPureDiscourseJa(jaText)
                        && isPureOnomatopoeiaZh(zhText) && !isPureDiscourseZh(zhText);
                    if (bothOno) return false;
                }
                if (!isPureDiscourseJa(jaText) && !jaBlank) return false;
                if (!isPureDiscourseZh(zhText) && !zhBlank) return false;
                return true;
            }
            const jaBlank = !String(jaText).trim() || isBlankOrPunctOnly(jaText);
            const zhBlank = !String(zhText).trim() || isBlankOrPunctOnly(zhText);
            const jaOk = jaBlank || isPureOnomatopoeiaJa(jaText);
            const zhOk = zhBlank || isPureOnomatopoeiaZh(zhText);
            if (!(jaOk && zhOk)) return false;
            if (!isPureOnomatopoeiaJa(jaText) && !jaBlank) return false;
            if (!isPureOnomatopoeiaZh(zhText) && !zhBlank) return false;
            const bothDisc = !jaBlank && !zhBlank
                && isPureDiscourseJa(jaText) && !isPureOnomatopoeiaJa(jaText)
                && isPureDiscourseZh(zhText) && !isPureOnomatopoeiaZh(zhText);
            if (bothDisc) return false;
            return true;
        };
        // Order-agnostic: merged dual may be target-first or source-first.
        return tryPair(lineA, lineB) || tryPair(lineB, lineA);
    }

    /**
     * Drop merged bilingual cues where both lines are pure discourse / onomatopoeia.
     * Used when the delivery file is already JA+ZH in one cue (merge-before-compact paths).
     */
    function dropPureFillerBilingualCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const dropDiscourse = options.dropDiscourse !== false;
        const dropOnomatopoeia = options.dropOnomatopoeia !== false;
        if (!list.length || (!dropDiscourse && !dropOnomatopoeia)) {
            return {
                cues: list.map((c) => ({ startMs: c?.startMs, endMs: c?.endMs, text: c?.text })),
                dropped: 0,
                droppedIndexes: [],
                skipped: true,
                reason: !list.length ? 'empty' : 'disabled',
            };
        }
        const bilingualCount = list.filter((c) => cueLooksBilingual(c?.text)).length;
        if (bilingualCount < Math.max(1, Math.ceil(list.length * 0.2))) {
            return {
                cues: list.map((c) => ({ startMs: c?.startMs, endMs: c?.endMs, text: c?.text })),
                dropped: 0,
                droppedIndexes: [],
                skipped: true,
                reason: 'not_bilingual',
            };
        }
        const kept = [];
        const droppedIndexes = [];
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const lines = splitBilingualCueLines(cue?.text);
            if (lines.length >= 2
                && bilingualLinesArePureFillerPair(lines[0], lines[1], {
                    dropDiscourse,
                    dropOnomatopoeia,
                })) {
                droppedIndexes.push(i);
                continue;
            }
            kept.push({
                startMs: cue?.startMs,
                endMs: cue?.endMs,
                text: cue?.text,
            });
        }
        return {
            cues: kept,
            dropped: droppedIndexes.length,
            droppedIndexes,
            summary: summarizePureInterjectionDrop(droppedIndexes.length, {
                dropDiscourse,
                dropOnomatopoeia,
            }),
        };
    }

    /**
     * 轻度：对纯语气/拟声条目做叠词压缩（不删条）。
     * @param {'discourse'|'onomatopoeia'} kind
     */
    function softenPureFillerInCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const kind = options.kind === 'onomatopoeia' ? 'onomatopoeia' : 'discourse';
        const lang = options.lang === 'ja' ? 'ja' : 'zh';
        const indexSet = options.indexes == null
            ? null
            : new Set((Array.isArray(options.indexes) ? options.indexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0));
        const predMono = lang === 'ja'
            ? (kind === 'onomatopoeia' ? isPureOnomatopoeiaJa : isPureDiscourseJa)
            : (kind === 'onomatopoeia' ? isPureOnomatopoeiaZh : isPureDiscourseZh);
        const predLine = (line) => {
            if (predMono(line)) return true;
            // Merged bilingual cues: try the other language on each line.
            if (kind === 'onomatopoeia') {
                return lang === 'ja' ? isPureOnomatopoeiaZh(line) : isPureOnomatopoeiaJa(line);
            }
            return lang === 'ja' ? isPureDiscourseZh(line) : isPureDiscourseJa(line);
        };
        const next = list.map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text,
        }));
        const changedIndexes = [];
        let runTotal = 0;
        let charSaved = 0;
        for (let i = 0; i < next.length; i += 1) {
            if (indexSet && !indexSet.has(i)) continue;
            const before = String(next[i].text ?? '');
            let text = before;
            let changed = false;
            let runs = 0;
            if (cueLooksBilingual(before)) {
                const rawLines = String(before).split(/\r?\n/);
                const outLines = rawLines.map((raw) => {
                    const trimmed = raw.trim();
                    if (!trimmed || !predLine(trimmed)) return raw;
                    const soft = compressRepetitionInText(trimmed, {
                        minRepeats: 2,
                        addExclaim: false,
                        compressSingleChar: true,
                    });
                    if (soft.changed) {
                        changed = true;
                        runs += soft.runs;
                        return soft.text;
                    }
                    return raw;
                });
                text = outLines.join('\n');
            } else {
                if (!predMono(before)) continue;
                const soft = compressRepetitionInText(before, {
                    minRepeats: 2,
                    addExclaim: false,
                    compressSingleChar: true,
                });
                text = soft.text;
                changed = soft.changed;
                runs = soft.runs;
            }
            if (!changed) continue;
            next[i] = { ...next[i], text };
            changedIndexes.push(i);
            runTotal += runs;
            charSaved += Math.max(0, textCharCount(before) - textCharCount(text));
        }
        const label = kind === 'onomatopoeia' ? '拟声词轻度精简' : '语气词轻度精简';
        const stats = {
            cueTotal: list.length,
            cueTouched: changedIndexes.length,
            runs: runTotal,
            charSaved,
            kind,
        };
        return {
            cues: next,
            stats,
            changedIndexes,
            summary: stats.cueTouched
                ? `${label} ${stats.cueTouched} 条`
                : `${label}：无需修改`,
        };
    }

    function lacksPunctuation(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        const chars = textCharCount(raw);
        if (chars < 18) return false;
        if (/[。！？!?…，、；：,.;:]/.test(raw)) return false;
        if (isConnectedText(raw) && chars >= 18) return true;
        // 英文超长无句读
        if (/[A-Za-z]/.test(raw) && chars >= 48 && !/[.!?;,]/.test(raw)) return true;
        return false;
    }

    /**
     * Heuristic: pathologically weird MT/ASR debris (placeholders, leaks, symbol soup).
     * Cross-title cue patterns only — not film-specific remaps.
     */
    function looksLikeWeirdCueText(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/__GLOSS\d*__|__GLOS\d*__|Gloss#{0,4}\d+_*/i.test(t)) return true;
        if (/GLOS?S?\d{2,8}/i.test(t)) return true;
        if (/__[^_\n]{1,64}__/.test(t)) return true;
        if (/改成[：:]/.test(t)) return true;
        if (/(?:系统|提示|指令)\s*[:：]/.test(t) && /翻译|字幕|角色/.test(t)) return true;
        const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        const latin = (t.match(/[A-Za-z]/g) || []).length;
        if (cjk >= 2 && latin >= 8 && latin > cjk) return true;
        const symbols = (t.match(/[^\w\u4e00-\u9fff\u3040-\u30ff\s]/g) || []).length;
        if (t.length >= 6 && symbols / t.length >= 0.45) return true;
        if (/([。！？!?…])\1{3,}/.test(t)) return true;
        if (/^[，、,]{2,}/.test(t) || /[，、,]{3,}/.test(t)) return true;
        if (cjk >= 1 && /[A-Za-z]{4,}\d{2,}/.test(t) && t.length <= 40) return true;
        return false;
    }

    /**
     * @returns {{ score: number, flags: string[], messages: string[] }}
     */
    function analyzeTextFluency(text, options = {}) {
        const flags = [];
        const messages = [];
        let score = 1;
        const raw = String(text || '').trim();
        const minChars = Math.max(8, Number(options.noPunctMinChars) || 18);

        if (!raw) {
            return { score: 0.2, flags: ['empty'], messages: ['空文本'] };
        }

        if (hasHeavyRepetition(raw)) {
            score -= 0.35;
            flags.push('repetition');
            messages.push('疑似重复/口吃式 ASR');
        } else if (hasStutter(raw)) {
            score -= 0.28;
            flags.push('stutter');
            messages.push('疑似口吃重复');
        }

        if (endsWithDangling(raw)) {
            score -= 0.18;
            flags.push('dangling');
            messages.push('句末残缺（虚词/介词结尾）');
        }

        if (isFragmentCue(raw)) {
            score -= 0.22;
            flags.push('fragment');
            messages.push('碎片虚词单独成句');
        }

        if (lacksPunctuation(raw) || (isConnectedText(raw) && textCharCount(raw) >= minChars
            && !/[。！？!?…，、；：,.;:]/.test(raw))) {
            if (!flags.includes('no_punct')) {
                score -= 0.14;
                flags.push('no_punct');
                messages.push('长句缺少标点断句');
            }
        }

        if (options.checkWeird !== false && looksLikeWeirdCueText(raw)) {
            score -= 0.3;
            flags.push('weird');
            messages.push('疑似怪句/乱码/泄漏残留');
        }

        return {
            score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
            flags,
            messages,
        };
    }

    function scanFluencyIssues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const issues = [];
        const summary = {
            total: 0,
            repetition: 0,
            stutter: 0,
            dangling: 0,
            fragment: 0,
            noPunct: 0,
            duplicate: 0,
        };

        for (let i = 0; i < list.length; i += 1) {
            const text = String(list[i]?.text || '');
            const analysis = analyzeTextFluency(text, options);
            const types = [...analysis.flags];
            const messages = [...analysis.messages];

            const prevText = i > 0 ? String(list[i - 1]?.text || '').trim() : '';
            const curText = text.trim();
            if (prevText && curText && prevText === curText && curText.length >= 2) {
                types.push('duplicate');
                messages.push('与上条文本完全相同');
                summary.duplicate += 1;
            }

            if (!types.length) continue;

            if (types.includes('repetition')) summary.repetition += 1;
            if (types.includes('stutter')) summary.stutter += 1;
            if (types.includes('dangling')) summary.dangling += 1;
            if (types.includes('fragment')) summary.fragment += 1;
            if (types.includes('no_punct')) summary.noPunct += 1;

            summary.total += 1;
            issues.push({
                index: i,
                types,
                messages,
                score: analysis.score,
                textPreview: curText.slice(0, 36),
            });
        }

        return { issues, summary };
    }

    function summarizeFluencyScan(summary) {
        if (!summary?.total) return '语句通顺度未见明显问题';
        const parts = [];
        if (summary.repetition) parts.push(`重复 ${summary.repetition}`);
        if (summary.stutter) parts.push(`口吃 ${summary.stutter}`);
        if (summary.dangling) parts.push(`残缺 ${summary.dangling}`);
        if (summary.fragment) parts.push(`碎片 ${summary.fragment}`);
        if (summary.noPunct) parts.push(`缺标点 ${summary.noPunct}`);
        if (summary.duplicate) parts.push(`重复条 ${summary.duplicate}`);
        return `${summary.total} 条通顺度嫌疑：${parts.join(' · ')}`;
    }

    function fluencyFlagLabel(flag) {
        const map = {
            empty: '空文本',
            repetition: '重复文本',
            stutter: '口吃重复',
            dangling: '句末残缺',
            fragment: '碎片句',
            no_punct: '缺标点',
            weird: '怪句/乱码',
            duplicate: '连续重复条',
        };
        return map[flag] || flag;
    }

    return {
        hasHeavyRepetition,
        hasStutter,
        endsWithDangling,
        isFragmentCue,
        isJaScriptHeavy,
        endsJaBroken,
        startsJaContinuation,
        isStrongJaContinuation,
        stitchJaFragmentCues,
        summarizeJaStitch,
        isSoundEffectCue,
        isSymbolOnlyCue,
        isNoiseCue,
        isHallucinationCue,
        normalizeAsrText,
        normalizeAsrTextInCues,
        stripAsrNameLoopsInCues,
        removeNoiseFromCues,
        classifyNoiseCue,
        removeAlignedNoiseFromCuePairs,
        summarizeNoiseRemoval,
        isPureInterjectionJa,
        isPureInterjectionZh,
        isPureDiscourseJa,
        isPureDiscourseZh,
        isPureOnomatopoeiaJa,
        isPureOnomatopoeiaZh,
        dropPureInterjectionPairs,
        dropPureFillerBilingualCues,
        cueLooksBilingual,
        summarizePureInterjectionDrop,
        softenPureFillerInCues,
        normalizeViewingCleanLevel,
        compressRepetitionInText,
        compressRepetitionInCues,
        summarizeRepetitionCompress,
        simplifyViewingPunctuationInText,
        simplifyViewingPunctuationInCues,
        lacksPunctuation,
        looksLikeWeirdCueText,
        analyzeTextFluency,
        scanFluencyIssues,
        summarizeFluencyScan,
        fluencyFlagLabel,
    };
}));
