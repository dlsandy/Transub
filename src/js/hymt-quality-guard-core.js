/**
 * Hy-MT2 miss / wrong-translation quality gate (pure).
 * Detects 漏翻 (blank / under) and 错翻 (invent / topic mismatch) for auto single-cue re-MT.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHyMtQualityGuard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function hymtQualityGuardFactory() {
    function loadSanitize() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (global && global.TransubMtSanitize);
        } catch (_) {
            return null;
        }
    }

    function loadPolish() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./smart-translate-polish-core')
                : (global && global.TransubSmartTranslatePolish);
        } catch (_) {
            return null;
        }
    }

    function textLen(s) {
        return [...String(s || '').replace(/\s/g, '')].length;
    }

    function isMoanHeavyJa(src) {
        const t = String(src || '').trim();
        if (!t) return false;
        const bare = t.replace(/[\s　]+/g, '');
        if (bare.length <= 8 && /^[ぁ-んァ-ンーっッはぁアうぐずひゃんむぐぷはっ]+$/u.test(bare)) return true;
        if (/^(?:ん+|あっ+|はぁ+|ひゃ+|う+|ぐ+|ず+|ふ+|え+|お+)[ー〜～っッ]*$/u.test(bare)) return true;
        return false;
    }

    /** Onomatopoeia / gasp / cough / kiss — intentional short ZH or … after clear. */
    function isNonLexicalJa(src) {
        if (isMoanHeavyJa(src)) return true;
        const t = String(src || '').trim();
        if (!t) return false;
        const bare = t.replace(/[\s　]+/g, '');
        if (/[一-龥々]/.test(bare)) return false;
        if (bare.length <= 24 && /^(?:ごほっ|ひっく|ちゅ[ー~～]*|んむ|ひゃ|あっ|やっ|んん|はぁ|うう|んっ|んぅ)+/u.test(bare)) {
            return true;
        }
        // Short all-kana bursts without long katakana loanwords
        if (
            bare.length <= 18
            && /^[ぁ-んァ-ンー〜～っッ]+$/u.test(bare)
            && !/[ァ-ヴー]{4,}/.test(bare)
        ) {
            return true;
        }
        return false;
    }

    function isThinSpokenZh(zh) {
        const t = String(zh || '').trim();
        if (!t) return true;
        if (/^(?:\.\.\.|……|…)+$/.test(t)) return true;
        return /^(?:[哈啊嗯呜咳喂呀呵哦喔欸唉嗯嗯呜呜咳咳呀呀啊啊]+(?:[\s…。．.!！?？~～]*)*)+$/u.test(t);
    }

    /**
     * High-confidence JA→ZH surfaces for topic overlap (synonyms allowed).
     * Katakana loanwords are NOT required as-is — ZH usually translates them.
     * @returns {{ expect: string[], kind: 'num'|'lemma' }[]}
     */
    function extractJaTopicAnchors(jaText) {
        const t = String(jaText || '');
        const out = [];
        const nums = t.match(/[0-9０-９]{1,6}/g);
        if (nums) {
            const digitZh = '零一二三四五六七八九';
            for (const n of nums) {
                const half = n.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
                const expect = [n, half];
                if (/^\d{1,2}$/.test(half)) {
                    const chars = [...half].map((ch) => digitZh[Number(ch)] || ch).join('');
                    expect.push(chars);
                    if (half === '2') expect.push('两', '兩', '二');
                }
                out.push({ expect: [...new Set(expect)], kind: 'num' });
            }
        }
        const lemmas = [
            [/カンニング/, ['作弊', '偷窥', '偷看']],
            [/検査/, ['检查', '体检', '检验']],
            [/先生/, ['老师', '先生']],
            [/大丈夫/, ['没事', '没关系', '还好', '大丈夫']],
            [/ごめん|すみません|すいません/, ['抱歉', '对不起', '不好意思']],
            [/やめて/, ['别', '不要', '住手', '停']],
            [/帰[るろ]/, ['回', '回去', '回家']],
            [/見せ/, ['看', '给看', '看看']],
            [/勉強/, ['学习', '功课', '念书']],
            [/呼び出し|呼び出/, ['叫', '传唤', '叫来']],
            [/スカート/, ['裙', '裙子']],
            [/パンツ/, ['内裤', '短裤', '裤']],
            [/気持ち/, ['舒服', '舒适', '快感', '开心']],
        ];
        for (const [re, expect] of lemmas) {
            if (re.test(t)) out.push({ expect, kind: 'lemma' });
        }
        return out;
    }

    function anchorsHitZh(anchors, zh) {
        return (anchors || []).filter((a) => (a.expect || []).some((s) => s && zh.includes(s)));
    }

    /**
     * @returns {{ ok: boolean, reasons: string[], severity: 'none'|'miss'|'wrong'|'both' }}
     */
    function assessHyMtCueQuality(zhText, jaText, options = {}) {
        const zh = String(zhText || '').trim();
        const ja = String(jaText || '').trim();
        const reasons = [];
        if (!ja) return { ok: true, reasons, severity: 'none' };

        const sanitize = loadSanitize();
        const polish = loadPolish();
        const jl = textLen(ja);
        const zl = textLen(zh);

        // --- 漏翻 ---
        if (!zh || /^(?:\.\.\.|……|…)+$/.test(zh)) {
            if (!isNonLexicalJa(ja) || jl >= 10) reasons.push('blank');
        } else if (sanitize?.isBlankOrPunctTranslation?.(zh, ja)) {
            // Sanitize blankish is noisy on short spoken OK (啊呀 / 咳咳).
            if (!isNonLexicalJa(ja) && (isThinSpokenZh(zh) || (jl >= 12 && zl <= 2))) {
                reasons.push('blankish');
            } else if (!isNonLexicalJa(ja) && jl >= 16 && zl <= 4) {
                reasons.push('blankish');
            }
        } else if (sanitize?.isSeverelyUnderTranslated?.(zh, ja)) {
            if (!isNonLexicalJa(ja)) reasons.push('under');
        } else if (sanitize?.looksLikeSourceEcho?.(zh, ja) || sanitize?.isMostlyUntranslatedJa?.(zh)) {
            reasons.push('echo');
        }

        // Long lexical JA → tiny ZH (not moan JA)
        if (
            !reasons.includes('blank')
            && !reasons.includes('under')
            && jl >= 16
            && zl > 0
            && zl <= 3
            && !isMoanHeavyJa(ja)
            // Bare vocative stub on long JA is underfill — do not exempt.
            && !/^(?:嗯|啊|哈|好|是|不|行|对)$/.test(zh.replace(/[。．.!！?？…\s]+$/g, ''))
        ) {
            reasons.push('under_long');
        }

        // --- 错翻 ---
        if (zh && sanitize?.looksLikeAdultRegisterInvented?.(zh, ja)) {
            reasons.push('adult_invent');
        }
        if (zh && polish?.looksLikePlotTopicInvent?.(ja, zh)) {
            reasons.push('plot_invent');
        }
        // Short spoken JA ballooned into long unrelated ZH
        if (
            zh
            && jl <= 12
            && zl >= 22
            && !isMoanHeavyJa(ja)
            && !sanitize?.looksLikeAdultRegisterInvented?.(zh, ja)
        ) {
            const anchors = extractJaTopicAnchors(ja);
            const hit = anchorsHitZh(anchors, zh);
            if (!hit.length && !anchors.length) {
                if (/^(?:うん|はい|ねえ|おい|ほら|なに|何|そう|ええ)[ー〜～。．!?？\s]*$/u.test(ja)
                    || jl <= 6) {
                    reasons.push('balloon');
                }
            } else if (anchors.length && !hit.length) {
                reasons.push('topic_miss');
            }
        }
        // Hard topic miss: numbers always; or ≥2 content lemmas all absent on longer ZH.
        if (
            zh
            && jl >= 8
            && zl >= 8
            && !isMoanHeavyJa(ja)
            && !reasons.includes('plot_invent')
            && !reasons.includes('adult_invent')
            && !reasons.includes('balloon')
            && !reasons.includes('topic_miss')
        ) {
            const anchors = extractJaTopicAnchors(ja);
            const nums = anchors.filter((a) => a.kind === 'num');
            const lemmas = anchors.filter((a) => a.kind === 'lemma');
            const missNum = nums.length && !anchorsHitZh(nums, zh).length;
            const missLemma = lemmas.length >= 2 && anchorsHitZh(lemmas, zh).length === 0;
            if (missNum || missLemma) {
                reasons.push('anchor_miss');
            }
        }

        const uniq = [...new Set(reasons)];
        const miss = uniq.some((r) => /^(?:blank|blankish|under|under_long|echo)$/.test(r));
        const wrong = uniq.some((r) => /^(?:adult_invent|plot_invent|balloon|topic_miss|anchor_miss)$/.test(r));
        let severity = 'none';
        if (miss && wrong) severity = 'both';
        else if (miss) severity = 'miss';
        else if (wrong) severity = 'wrong';
        return { ok: uniq.length === 0, reasons: uniq, severity };
    }

    /**
     * Collect cue indexes that need Hy-MT2 quality re-MT (漏翻/错翻).
     * @returns {{ indexes: number[], byReason: Record<string, number> }}
     */
    function collectHyMtQualityRetryIndexes(sourceCues, translatedCues, options = {}) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const byZh = new Map();
        for (const u of translatedCues || []) {
            const idx = Number(u?.index);
            if (Number.isInteger(idx)) byZh.set(idx, String(u?.text ?? ''));
        }
        const indexes = [];
        const byReason = {};
        const max = Math.max(1, Math.min(500, Number(options.maxRetry) || 200));
        for (let i = 0; i < srcList.length; i += 1) {
            if (indexes.length >= max) break;
            const c = srcList[i];
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const ja = String(c?.text || '').trim();
            if (!ja) continue;
            // Skip software-credit-like lines
            if (/transub\.cc|字幕由|Subtitles generated/i.test(ja)) continue;
            const zh = byZh.has(idx) ? byZh.get(idx) : '';
            try {
                const ellipsisPolicy = require('./hymt-ellipsis-policy-core');
                const prevJa = i > 0 ? String(srcList[i - 1]?.text || '') : '';
                const nextJa = i + 1 < srcList.length ? String(srcList[i + 1]?.text || '') : '';
                if (ellipsisPolicy.shouldSkipRecoverForDelete?.(ja, zh, { prevJa, nextJa })) {
                    continue;
                }
            } catch (_) { /* optional */ }
            const q = assessHyMtCueQuality(zh, ja, options);
            if (q.ok) continue;
            // Moan/SFX left as … are deleted by ellipsis policy — skip quality re-MT.
            try {
                const ellipsisPolicy = require('./hymt-ellipsis-policy-core');
                if (ellipsisPolicy.isPureMoanOrSfxJa?.(ja) && /^(?:\.\.\.|……|…)*$/.test(String(zh || '').trim())) {
                    continue;
                }
            } catch (_) {
                if (isNonLexicalJa(ja) && /^(?:\.\.\.|……|…)*$/.test(String(zh || '').trim())
                    && !q.reasons.includes('adult_invent') && !q.reasons.includes('plot_invent')) {
                    continue;
                }
            }
            indexes.push(idx);
            for (const r of q.reasons) {
                byReason[r] = (byReason[r] || 0) + 1;
            }
        }
        return { indexes, byReason };
    }

    /**
     * Extra user-line for quality re-MT (append after minimal prompt via options).
     */
    function qualityRetryHint(options = {}) {
        const reasons = Array.isArray(options.qualityReasons) ? options.qualityReasons : [];
        if (reasons.some((r) => /invent|balloon|topic|anchor/.test(r))) {
            return '上一版疑似错译或臆造；请严格按本行日语字面重译，禁止添加原文没有的情节或成人内容。';
        }
        return '上一版疑似漏译或过短；请完整译出本行语义，禁止只用省略号或语气词敷衍。';
    }

    return {
        textLen,
        isMoanHeavyJa,
        isNonLexicalJa,
        isThinSpokenZh,
        extractJaTopicAnchors,
        anchorsHitZh,
        assessHyMtCueQuality,
        collectHyMtQualityRetryIndexes,
        qualityRetryHint,
    };
}));
