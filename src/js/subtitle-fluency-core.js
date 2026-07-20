/**
 * 字幕通顺度规则检查（浏览器与 Node 测试共用）
 * 只做嫌疑标注，不自动润色文案。
 */
(function (global, factory) {
    const splitCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-split-core')
        : (global && global.TransubSubtitleSplit);
    const api = factory(splitCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleFluency = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleFluencyCoreFactory(splitCore) {
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
        if (/^[。！？!?…·.•,，、；;:：\-\—_~～"'「」『』【】[\]()（）\s]+$/.test(s)) return false;
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
        let out = `${phrase}…${phrase}`;
        if (addExclaim && !/[。！？!?…]$/.test(out)) out += '！';
        return out;
    }

    /**
     * 压缩单条文本中的叠词/叠句（如「好的」×N →「好的…好的！」）。
     * @returns {{ text: string, changed: boolean, runs: number }}
     */
    function compressRepetitionInText(text, options = {}) {
        const raw = String(text ?? '');
        const chars = Array.from(raw);
        if (chars.length < 3) {
            return { text: raw, changed: false, runs: 0 };
        }

        const opts = {
            minRepeats: Math.max(2, Number(options.minRepeats) || 3),
            minPhraseLen: options.compressSingleChar === false ? 2 : 1,
            maxPhraseLen: Math.max(1, Number(options.maxPhraseLen) || 6),
            addExclaim: options.addExclaim !== false,
        };

        const out = [];
        let i = 0;
        let runs = 0;
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
        // 压缩后可能紧贴原有感叹号：好的…好的！！ → 好的…好的！
        result = result.replace(/！{2,}/g, '！').replace(/!{2,}/g, '!');
        return {
            text: result,
            changed: result !== raw,
            runs,
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
        return false;
    }

    function isSoundEffectCue(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        if (SOUND_EFFECT_RE.test(raw)) return true;
        // ♪…♫ 纯乐符行
        if (/^[♪♫♩♬\s·.•…\-—_]+$/.test(raw)) return true;
        return false;
    }

    function isSymbolOnlyCue(text) {
        const raw = String(text || '').trim();
        if (!raw) return false;
        const stripped = raw.replace(/[\s♪♫♩♬·.•…\-—_.,。！？!?，、；;:：【】[\]()（）「」『』"""'']+/g, '');
        return !stripped;
    }

    /** 常见 ASR 幻觉短句 / 占位符（整条匹配） */
    const HALLUCINATION_EXACT = new Set([
        '完毕', '结束', '完', '谢谢观看', '感谢观看', '请订阅', '字幕by',
        '请使用简体中文输出。', '请使用简体中文输出', '請使用繁體中文輸出。', '請使用繁體中文輸出',
        '简体中文', '繁体中文', '繁體中文',
        'ご視聴ありがとうございました', 'ご視聴頂きありがとうございます',
        '字幕：', 'subtitles by', 'thanks for watching', 'the end',
    ]);
    const HALLUCINATION_RE = /^(?:[Oo○〇◯●・･\.。…]{2,}|[♪♫♩♬]+|字幕\s*[:：by].*|thanks?\s+for\s+watching.*)$/i;

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
        if (hasHeavyRepetition(raw) && textCharCount(raw) <= 24) return true;
        if (/https?:\/\/|www\./i.test(raw) && textCharCount(raw) <= 40) return true;
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
            hallucinationMaxChars: options.hallucinationMaxChars,
            hallucinationMaxDurMs: options.hallucinationMaxDurMs,
        };
        const list = Array.isArray(cues) ? cues : [];
        const kept = [];
        const removedIndexes = [];
        const stats = {
            removed: 0,
            kept: 0,
            empty: 0,
            fragment: 0,
            soundEffect: 0,
            symbolOnly: 0,
            duplicate: 0,
            hallucination: 0,
        };
        let prevKeptText = '';

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

    function summarizeNoiseRemoval(stats) {
        if (!stats?.removed) return '未发现可删除的杂音条目';
        const parts = [];
        if (stats.empty) parts.push(`空文本 ${stats.empty}`);
        if (stats.fragment) parts.push(`语气碎片 ${stats.fragment}`);
        if (stats.soundEffect) parts.push(`音效标签 ${stats.soundEffect}`);
        if (stats.symbolOnly) parts.push(`纯符号 ${stats.symbolOnly}`);
        if (stats.hallucination) parts.push(`幻觉短句 ${stats.hallucination}`);
        if (stats.duplicate) parts.push(`连续重复 ${stats.duplicate}`);
        return `将删除 ${stats.removed} 条（${parts.join(' · ') || '杂音'}），保留 ${stats.kept} 条`;
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
            duplicate: '连续重复条',
        };
        return map[flag] || flag;
    }

    return {
        hasHeavyRepetition,
        hasStutter,
        endsWithDangling,
        isFragmentCue,
        isSoundEffectCue,
        isSymbolOnlyCue,
        isNoiseCue,
        isHallucinationCue,
        removeNoiseFromCues,
        summarizeNoiseRemoval,
        compressRepetitionInText,
        compressRepetitionInCues,
        summarizeRepetitionCompress,
        lacksPunctuation,
        analyzeTextFluency,
        scanFluencyIssues,
        summarizeFluencyScan,
        fluencyFlagLabel,
    };
}));
