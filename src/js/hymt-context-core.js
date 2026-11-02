/**
 * Hy-MT neighbor context + rolling soft state (pure).
 * Keeps prompts short: previous JA/ZH header + hit-only address/name hints.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHyMtContext = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function hymtContextFactory() {
    /** Short discourse / gasp / orphan noun — omit prior ZH to limit identity bleed. */
    function isFragileShortJa(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        const bare = t.replace(/[\s　]+/g, '');
        if (bare.length <= 2) return true;
        if (/^(?:うん|はい|ええ|ねえ|おい|ほら|なに|何|そう|あっ|はぁ|ん+)[ー〜～。．!?？\s]*$/u.test(bare)) {
            return true;
        }
        // Short kanji-only orphans (自炊 / 名刺) also pick up neighbor ZH essays.
        if (bare.length <= 3 && /^[\u4e00-\u9fff々]+$/u.test(bare)) return true;
        return bare.length <= 4 && /^[ぁ-んァ-ンーっッ]+$/u.test(bare);
    }

    function looksLikeIdentityStubZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^(?:\.\.\.|……|…)+$/.test(t)) return true;
        // Bare name / title stubs that poison next-line identity.
        if (/^(?:我是|我叫|名字是)?[\u4e00-\u9fff·・]{1,6}(?:先生|小姐|老师|前辈|桑|酱)?[。．.!！?？…]*$/u.test(t)
            && t.length <= 10) {
            return true;
        }
        return false;
    }

    /**
     * Last 1–2 cues before current window (script continuity).
     * @returns {{ previousSourceText?: string, previousTranslationText?: string }}
     */
    function buildHyMtPreviousContext({
        sourceCues,
        translatedByIndex,
        currentChunkCues,
        maxLines = 1,
    } = {}) {
        const all = Array.isArray(sourceCues) ? sourceCues : [];
        const cur = Array.isArray(currentChunkCues) ? currentChunkCues : [];
        if (!all.length || !cur.length) return {};
        const firstIdx = Number(cur[0]?.index);
        if (!Number.isInteger(firstIdx)) return {};
        const before = [];
        for (const c of all) {
            const idx = Number(c?.index);
            if (!Number.isInteger(idx) || idx >= firstIdx) continue;
            before.push(c);
        }
        const take = before.slice(-Math.max(1, Math.min(2, Number(maxLines) || 1)));
        if (!take.length) return {};
        const map = translatedByIndex instanceof Map
            ? translatedByIndex
            : new Map(Object.entries(translatedByIndex || {}).map(([k, v]) => [Number(k), v]));
        const prevSrc = take.map((c) => String(c?.text || '').trim()).filter(Boolean).join('\n');
        const prevTgt = take
            .map((c) => String(map.get(Number(c.index)) ?? '').trim())
            .filter(Boolean)
            .join('\n');
        const currentJoined = cur.map((c) => String(c?.text || '').trim()).filter(Boolean).join('\n');
        const out = {};
        if (prevSrc) out.previousSourceText = prevSrc;
        if (prevTgt && !isFragileShortJa(currentJoined) && !looksLikeIdentityStubZh(prevTgt)) {
            out.previousTranslationText = prevTgt;
        }
        return out;
    }

    /**
     * Compact previous block for Hy-MT user prompts (must stay short).
     */
    function formatHyMtPreviousBlock(options = {}) {
        const prevSrc = String(options.previousSourceText || options.prevSourceText || '').trim();
        const prevTgt = String(options.previousTranslationText || options.prevTranslationText || '').trim();
        if (!prevSrc) return '';
        if (prevTgt) return `上文参考（勿翻译）：\n${prevSrc}\n${prevTgt}`;
        return `上文参考（勿翻译）：\n${prevSrc}`;
    }

    const ADDRESS_PAIRS = Object.freeze([
        { ja: /先生/, zh: ['老师', '先生'], key: '先生' },
        { ja: /先輩|せんぱい/, zh: ['前辈', '学长', '学姐'], key: '先輩' },
        { ja: /お前|おまえ/, zh: ['你', '你这家伙'], key: 'お前' },
        { ja: /あなた/, zh: ['你'], key: 'あなた' },
        { ja: /君(?![ぁ-ん一-龥])|くん/, zh: ['君', 'くん'], key: '君' },
        { ja: /ちゃん/, zh: ['酱', 'ちゃん'], key: 'ちゃん' },
        { ja: /さん/, zh: ['桑', 'さん'], key: 'さん' },
    ]);

    function emptyRollingState() {
        return { addresses: [], names: [] };
    }

    /**
     * Merge address / cast bindings observed on a translated pair.
     * @param {object} [state]
     * @param {string} ja
     * @param {string} zh
     * @param {{ castNames?: string[] }} [options]
     */
    function updateHyMtRollingState(state, ja, zh, options = {}) {
        const next = {
            addresses: Array.isArray(state?.addresses) ? [...state.addresses] : [],
            names: Array.isArray(state?.names) ? [...state.names] : [],
        };
        const src = String(ja || '');
        const tgt = String(zh || '').trim();
        if (!src || !tgt || /^(?:\.\.\.|……|…)+$/.test(tgt)) return next;
        for (const pair of ADDRESS_PAIRS) {
            if (!pair.ja.test(src)) continue;
            const hitZh = pair.zh.find((z) => tgt.includes(z));
            if (!hitZh) continue;
            const existing = next.addresses.find((a) => a.key === pair.key);
            if (existing) existing.zh = hitZh;
            else next.addresses.push({ key: pair.key, ja: pair.key, zh: hitZh });
        }
        const cast = Array.isArray(options.castNames) ? options.castNames : [];
        for (const name of cast) {
            const n = String(name || '').trim();
            if (!n || n.length < 2 || !src.includes(n)) continue;
            if (!next.names.some((x) => x.ja === n)) {
                // Prefer keeping JA form when ZH echoes it; else leave for glossary.
                next.names.push({ ja: n, zh: tgt.includes(n) ? n : '' });
            }
        }
        // Cap state size — Hy-MT hates long prefs.
        next.addresses = next.addresses.slice(-6);
        next.names = next.names.slice(-6);
        return next;
    }

    /**
     * Hit-only one-liner for the current cue (empty when nothing matches).
     */
    function formatHyMtStateHint(state, currentJa = '') {
        const ja = String(currentJa || '');
        if (!ja || !state) return '';
        const bits = [];
        for (const a of state.addresses || []) {
            if (!a?.key || !a.zh) continue;
            if (!ja.includes(a.key) && !(a.key === '先輩' && /せんぱい/.test(ja))) continue;
            bits.push(`${a.key}→${a.zh}`);
        }
        for (const n of state.names || []) {
            if (!n?.ja || !ja.includes(n.ja)) continue;
            if (n.zh) bits.push(`${n.ja}→${n.zh}`);
            else bits.push(`专名沿用「${n.ja}」`);
        }
        if (!bits.length) return '';
        return `称呼沿用：${bits.slice(0, 4).join('；')}`;
    }

    /**
     * Detect ZH address drift vs rolling state (for quality retry).
     */
    function looksLikeAddressDrift(ja, zh, state) {
        const src = String(ja || '');
        const tgt = String(zh || '').trim();
        if (!src || !tgt || !state?.addresses?.length) return false;
        for (const a of state.addresses) {
            if (!a?.key || !a.zh) continue;
            const hitJa = src.includes(a.key)
                || (a.key === '先輩' && /せんぱい/.test(src));
            if (!hitJa) continue;
            if (tgt.includes(a.zh)) continue;
            // Drift: expected binding missing and another address surface present.
            const other = ADDRESS_PAIRS.some((p) => p.key !== a.key
                && p.zh.some((z) => z !== a.zh && tgt.includes(z)));
            if (other) return true;
            // Expected key present in JA but ZH has none of the known forms for it.
            const pair = ADDRESS_PAIRS.find((p) => p.key === a.key);
            if (pair && !pair.zh.some((z) => tgt.includes(z))) return true;
        }
        return false;
    }

    /**
     * Prefer a larger installed Hy-MT2 when VRAM allows (soft quality).
     * Never changes non-Hy-MT ids. Escape: preferLargerHyMt === false.
     */
    function maybeUpgradeHyMtModelId(preferredId, installedIds, options = {}) {
        const id = String(preferredId || '').trim();
        if (!id) return id;
        if (options.preferLargerHyMt === false) return id;
        const soft = String(options.contentProfile || options.senseProfile || '')
            .trim()
            .toLowerCase() === 'av_soft';
        // Soft defaults on; other profiles only upgrade 1.8→7 when VRAM known.
        const allow = soft || options.preferLargerHyMt === true;
        if (!allow) return id;
        const lower = id.toLowerCase();
        if (!/hy-?mt2|hy.?mt.?2/.test(lower) || /hunyuan|chimera|hy-?mt1/.test(lower)) {
            return id;
        }
        const installed = (Array.isArray(installedIds) ? installedIds : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        const byLower = new Map(installed.map((x) => [x.toLowerCase(), x]));
        const has = (cand) => byLower.get(String(cand).toLowerCase()) || '';
        const vram = Number(options.vramGb);
        const vramOk = (min) => !Number.isFinite(vram) || vram >= min;
        const ladder = [
            { id: 'hy-mt2-30b-a3b-heretic-quality', minVram: 28 },
            { id: 'hy-mt2-30b-a3b-heretic', minVram: 24 },
            { id: 'hy-mt2-30b-a3b-heretic-mini', minVram: 20 },
            { id: 'hy-mt2-7b', minVram: 6 },
            { id: 'hy-mt2-1.8b', minVram: 3 },
        ];
        let rank = -1;
        if (/heretic-quality/.test(lower)) rank = 0;
        else if (/heretic-mini/.test(lower)) rank = 2;
        else if (/30b/.test(lower)) rank = 1;
        else if (/7b/.test(lower)) rank = 3;
        else if (/1\.8b|1_8b/.test(lower)) rank = 4;
        if (rank < 0) return id;
        // Soft may climb to 30B; non-soft only climb within ≤7B when explicitly enabled.
        const minRank = soft ? 0 : 3;
        for (let i = minRank; i < rank; i += 1) {
            const row = ladder[i];
            if (!vramOk(row.minVram)) continue;
            const hit = has(row.id);
            if (hit) return hit;
        }
        return id;
    }

    return {
        isFragileShortJa,
        looksLikeIdentityStubZh,
        buildHyMtPreviousContext,
        formatHyMtPreviousBlock,
        emptyRollingState,
        updateHyMtRollingState,
        formatHyMtStateHint,
        looksLikeAddressDrift,
        maybeUpgradeHyMtModelId,
        ADDRESS_PAIRS,
    };
}));
