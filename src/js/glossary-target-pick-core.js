/**
 * Pick glossary / actor translation surface by 成片目标语.
 * Supports row.zh / row.en / row.ko and row.translations.{lang}.
 * Does not invent Chinese for intl targets when no column exists.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubGlossaryTargetPick = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function glossaryTargetPickFactory() {
    let targetLangCore = null;
    try {
        targetLangCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-target-lang-core')
            : (global && global.TransubSubtitleTargetLang);
    } catch {
        targetLangCore = null;
    }

    const HIRA = 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ';
    const KATA = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ';
    const ROMAJI = {
        あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
        か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
        が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
        さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
        ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
        た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
        だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
        な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
        は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
        ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
        ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
        ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
        や: 'ya', ゆ: 'yu', よ: 'yo',
        ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
        わ: 'wa', を: 'o', ん: 'n', ゔ: 'vu',
        ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
        ゃ: 'ya', ゅ: 'yu', ょ: 'yo', っ: '', ゎ: 'wa',
    };

    function resolveLang(raw) {
        if (targetLangCore?.resolveSubtitleTargetLang) {
            return targetLangCore.resolveSubtitleTargetLang(
                typeof raw === 'string' ? { targetLang: raw } : (raw || {}),
            );
        }
        const s = String(raw?.targetLang || raw?.subtitleTargetLang || raw || '').trim();
        if (/^en/i.test(s)) return 'en';
        if (/^ko/i.test(s)) return 'ko';
        if (/^ja/i.test(s)) return 'ja';
        if (/hant|traditional/i.test(s)) return 'zh-Hant';
        return 'zh-Hans';
    }

    function isZhLang(lang) {
        if (targetLangCore?.isZhSubtitleTarget) return targetLangCore.isZhSubtitleTarget(lang);
        return /^zh/i.test(String(lang || ''));
    }

    function kataToHira(ch) {
        const i = KATA.indexOf(ch);
        return i >= 0 ? HIRA[i] : ch;
    }

    /**
     * Minimal Hepburn-ish romaji for JA name fallback (not full linguistics).
     */
    function kanaToRomaji(text) {
        const s = String(text || '').trim();
        if (!s) return '';
        let out = '';
        const chars = Array.from(s).map(kataToHira);
        for (let i = 0; i < chars.length; i += 1) {
            const c = chars[i];
            const next = chars[i + 1] || '';
            if (c === 'っ' && next) {
                const rom = ROMAJI[next] || '';
                out += rom.charAt(0) || '';
                continue;
            }
            if ((c === 'き' || c === 'し' || c === 'ち' || c === 'に' || c === 'ひ'
                || c === 'み' || c === 'り' || c === 'ぎ' || c === 'じ' || c === 'び' || c === 'ぴ')
                && (next === 'ゃ' || next === 'ゅ' || next === 'ょ')) {
                const base = ROMAJI[c] || '';
                const stem = base.endsWith('i') ? base.slice(0, -1) : base;
                const y = next === 'ゃ' ? 'ya' : (next === 'ゅ' ? 'yu' : 'yo');
                out += stem + y;
                i += 1;
                continue;
            }
            if (ROMAJI[c] != null) {
                out += ROMAJI[c];
                continue;
            }
            if (/[A-Za-z0-9]/.test(c)) {
                out += c;
                continue;
            }
            if (/[\u4e00-\u9fff]/.test(c)) {
                // Keep kanji out of romaji fallback — caller may skip
                return '';
            }
            if (/[\s・·\-_]/.test(c)) {
                out += ' ';
            }
        }
        return out.replace(/\s+/g, ' ').trim();
    }

    function titleCaseRomaji(romaji) {
        return String(romaji || '')
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    function extractLatinAlias(text) {
        const s = String(text || '').trim();
        if (!s) return '';
        const m = s.match(/[A-Za-z][A-Za-z0-9 .'_\-]{1,40}/);
        if (!m) return '';
        const lat = m[0].trim();
        if (lat.length < 2) return '';
        return lat;
    }

    function columnForLang(lang) {
        const n = String(lang || '');
        if (n === 'en') return 'en';
        if (n === 'ko') return 'ko';
        if (n === 'ja') return 'ja';
        if (n.startsWith('zh-Hant')) return 'zh-Hant';
        return 'zh';
    }

    /**
     * @param {object} row glossary entry
     * @param {string|object} targetLangOrOptions
     * @param {{ kind?: 'actor'|'domain'|'any', allowRomajiFallback?: boolean }} [opts]
     * @returns {string} translation for target, or '' if should skip
     */
    function pickGlossaryTranslation(row, targetLangOrOptions, opts = {}) {
        const r = row && typeof row === 'object' ? row : {};
        const lang = resolveLang(targetLangOrOptions);
        const kind = String(opts.kind || 'any');
        const allowRomaji = opts.allowRomajiFallback !== false && kind !== 'domain';
        const col = columnForLang(lang);
        const translations = r.translations && typeof r.translations === 'object'
            ? r.translations
            : null;

        const tryCols = [];
        if (col === 'zh-Hant') {
            tryCols.push('zh-Hant', 'zh-TW', 'zh-HK', 'zh', 'zh-Hans');
        } else if (col === 'zh') {
            tryCols.push('zh', 'zh-Hans');
        } else {
            tryCols.push(col);
        }

        for (const key of tryCols) {
            const direct = String(r[key] || '').trim();
            if (direct) return direct;
            const nested = translations ? String(translations[key] || '').trim() : '';
            if (nested) return nested;
        }

        if (isZhLang(lang)) {
            return String(r.zh || r['zh-Hans'] || '').trim();
        }

        if (lang === 'ja') {
            return String(r.src || r.canonical || r.term || '').trim();
        }

        // intl: never fall back to Chinese surfaces
        if (lang === 'en' || lang === 'ko') {
            const latin = extractLatinAlias(r.src)
                || extractLatinAlias(r.canonical)
                || extractLatinAlias(r.term);
            if (latin) return latin;
            if (allowRomaji && lang === 'en') {
                const romaji = titleCaseRomaji(kanaToRomaji(r.src || r.canonical || ''));
                if (romaji.length >= 2) return romaji;
            }
            // ko without column: leave empty (skip) rather than Chinese
            return '';
        }

        return '';
    }

    /**
     * Whether NSFW / ZH-domain lexicon should merge into prompt for this target.
     */
    function shouldInjectZhLexiconForTarget(targetLangOrOptions) {
        const lang = resolveLang(targetLangOrOptions);
        return isZhLang(lang);
    }

    return {
        resolveLang,
        isZhLang,
        kanaToRomaji,
        titleCaseRomaji,
        extractLatinAlias,
        pickGlossaryTranslation,
        shouldInjectZhLexiconForTarget,
        columnForLang,
    };
}));
