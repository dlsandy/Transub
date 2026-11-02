/**
 * Open Laya System One wedge builders (generic prompts; no closed algorithm text).
 * Soft-band only — heuristics keep hard paths; Laya decides ambiguous cases.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJevLayaPipeline = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jevLayaPipelineFactory() {
    function getJev() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./jev-decision-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubJevDecision);
        } catch {
            return null;
        }
    }

    function clip(text, max = 220) {
        const jev = getJev();
        if (jev?.clipForDecision) return jev.clipForDecision(text, max);
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
    }

    function choiceQ(instructions, criteria) {
        const jev = getJev();
        if (jev?.buildChoiceQuestion) {
            return jev.buildChoiceQuestion({ instructions, criteria });
        }
        return { type: 'choice', instructions: String(instructions || ''), criteria: criteria || {} };
    }

    function scoreQ(instructions, min = 0, max = 1) {
        const jev = getJev();
        if (jev?.buildScoreQuestion) {
            return jev.buildScoreQuestion({ instructions, min, max });
        }
        return { type: 'score', instructions: String(instructions || ''), min, max };
    }

    function partitionBinary(answers, items, opts) {
        const jev = getJev();
        if (jev?.partitionBinaryChoices) {
            return jev.partitionBinaryChoices(answers, items, opts);
        }
        return { accept: [], reject: [], undecided: items || [], decided: 0 };
    }

    function textLen(t) {
        return Array.from(String(t || '').replace(/\s+/g, '')).length;
    }

    function overlapRatio(a, b) {
        const x = String(a || '');
        const y = String(b || '');
        if (!x || !y) return 0;
        const set = new Set(Array.from(x));
        let hit = 0;
        for (const ch of Array.from(y)) {
            if (set.has(ch)) hit += 1;
        }
        return hit / Math.max(Array.from(y).length, 1);
    }

    /**
     * Soft polish rejects: length/overlap near hard floors (not invent/adult hard rejects).
     * @returns {'keep'|'soft'|'hard'}
     */
    function classifyPolishUpdateKind(prev, next, options = {}) {
        const p = String(prev || '').trim();
        const n = String(next || '').trim();
        if (!p || !n || p === n) return 'hard';
        const pl = textLen(p);
        const nl = textLen(n);
        const maxGrow = Number(options.maxGrow) || 1.55;
        const softGrow = Number(options.layaSoftMaxGrow) || 2.05;
        const minKeep = Number(options.minKeep) || 0.5;
        const softKeep = Number(options.layaSoftMinKeep) || 0.38;
        const overlapFloor = Number.isFinite(Number(options.minOverlap))
            ? Number(options.minOverlap)
            : 0.5;
        const softOverlap = Number(options.layaSoftMinOverlap) || 0.32;
        if (pl >= 4) {
            if (nl > Math.max(12, Math.ceil(pl * softGrow))) return 'hard';
            if (nl < Math.max(1, Math.floor(pl * softKeep))) return 'hard';
            if (nl > Math.max(12, Math.ceil(pl * maxGrow))) return 'soft';
            if (nl < Math.max(1, Math.floor(pl * minKeep))) return 'soft';
        }
        if (pl >= 6) {
            const o = overlapRatio(p, n);
            if (o < softOverlap) return 'hard';
            if (o < overlapFloor) return 'soft';
        }
        // Substantial but otherwise OK → gate
        if (pl >= 4 && (nl / Math.max(1, pl) > 1.12 || nl / Math.max(1, pl) < 0.88
            || Math.abs(pl - nl) >= Math.max(4, Math.ceil(pl * 0.18)))) {
            return 'soft';
        }
        return 'keep';
    }

    function buildAcceptRevertRequest(task, candidates, {
        beforeKey = 'before',
        afterKey = 'after',
        instructionsLead,
    } = {}) {
        const list = Array.isArray(candidates) ? candidates : [];
        const items = [];
        const questions = {};
        const stateRows = [];
        const lead = String(instructionsLead || 'Accept only if the after text is a faithful improvement.').trim();
        list.forEach((row, i) => {
            const index = Number(row?.index);
            const before = String(row?.[beforeKey] ?? row?.before ?? '').trim();
            const after = String(row?.[afterKey] ?? row?.after ?? row?.text ?? '').trim();
            if (!before || !after || before === after) return;
            const id = String(row?.id || (Number.isInteger(index) ? `c${index}` : `c${i}`));
            const b = clip(before);
            const a = clip(after);
            items.push({ ...row, id, index, before, after });
            stateRows.push({ id, index, before: b, after: a });
            questions[id] = choiceQ(
                `${lead}\nBefore:\n${b}\nAfter:\n${a}`,
                {
                    accept: 'Keep the after text',
                    revert: 'Keep the before text',
                },
            );
        });
        return {
            state: { task: String(task || 'accept_revert'), cues: stateRows },
            questions,
            items,
        };
    }

    function partitionAcceptRevert(answers, items, minConfidence) {
        return partitionBinary(answers, items, {
            minConfidence,
            acceptChoices: ['accept'],
            rejectChoices: ['revert', 'reject'],
            idOf: (item, i) => String(item?.id || `c${item?.index ?? i}`),
        });
    }

    function buildKeepSwapRequest(candidates) {
        const list = Array.isArray(candidates) ? candidates : [];
        const items = [];
        const questions = {};
        const stateRows = [];
        list.forEach((row, i) => {
            const index = Number(row?.index);
            const oldText = String(row?.oldText ?? row?.before ?? '').trim();
            const newText = String(row?.newText ?? row?.after ?? '').trim();
            const src = String(row?.sourceText ?? row?.ja ?? '').trim();
            if (!oldText || !newText || oldText === newText) return;
            const id = String(row?.id || (Number.isInteger(index) ? `k${index}` : `k${i}`));
            const o = clip(oldText);
            const n = clip(newText);
            const s = clip(src, 160);
            items.push({ ...row, id, index, oldText, newText, sourceText: src });
            stateRows.push({ id, index, old: o, neu: n, src: s });
            questions[id] = choiceQ(
                [
                    'Two Chinese translations of the same Japanese source.',
                    'Pick which is more accurate and complete (fewer blanks, echoes, topic misses).',
                    src ? `Source:\n${s}` : '',
                    `Old:\n${o}`,
                    `New:\n${n}`,
                ].filter(Boolean).join('\n'),
                {
                    keep_old: 'Keep the old translation',
                    keep_new: 'Use the new translation',
                },
            );
        });
        return {
            state: { task: 'hymt_keep_swap', cues: stateRows },
            questions,
            items,
        };
    }

    function partitionKeepSwap(answers, items, minConfidence) {
        return partitionBinary(answers, items, {
            minConfidence,
            acceptChoices: ['keep_new'],
            rejectChoices: ['keep_old'],
            idOf: (item, i) => String(item?.id || `k${item?.index ?? i}`),
        });
    }

    function buildSemanticApplyRequest(candidates) {
        return buildAcceptRevertRequest('bilingual_semantic_apply', candidates, {
            beforeKey: 'before',
            afterKey: 'suggestedTarget',
            instructionsLead: [
                'A bilingual QA suggested replacing one subtitle translation.',
                'Accept only if suggestedTarget fixes a real omission/mistranslation without inventing plot.',
            ].join(' '),
        });
    }

    function buildScoreRankRequest(task, candidates, { instructionsLead, criteria } = {}) {
        const list = Array.isArray(candidates) ? candidates : [];
        const items = [];
        const questions = {};
        const stateRows = [];
        const lead = String(instructionsLead
            || 'Score how much this cue needs another LLM/ASR pass (skip→must).').trim();
        const levels = Array.isArray(criteria) && criteria.length >= 2
            ? criteria
            : null;
        const jev = getJev();
        list.forEach((row, i) => {
            const index = Number(row?.index);
            const text = String(row?.text ?? row?.zh ?? '').trim();
            const src = String(row?.sourceText ?? row?.ja ?? '').trim();
            if (!text && !src) return;
            const id = String(row?.id || (Number.isInteger(index) ? `s${index}` : `s${i}`));
            const t = clip(text || src);
            const s = src ? clip(src, 140) : '';
            items.push({ ...row, id, index });
            stateRows.push({ id, index, text: t, src: s, heuristic: row.heuristicScore });
            const instructions = [
                lead,
                'Use the full scale; avoid assigning the same level to every cue.',
                s ? `Source:\n${s}` : '',
                `Current:\n${t}`,
                row.reasons ? `Signals: ${String(row.reasons).slice(0, 120)}` : '',
                Number.isFinite(Number(row.heuristicScore))
                    ? `Heuristic: ${Number(row.heuristicScore)}`
                    : '',
            ].filter(Boolean).join('\n');
            if (jev?.buildScoreQuestion) {
                questions[id] = jev.buildScoreQuestion({
                    instructions,
                    min: 0,
                    max: 1,
                    criteria: levels || undefined,
                });
            } else {
                questions[id] = scoreQ(instructions, 0, 1);
            }
        });
        return {
            state: { task: String(task || 'score_rank'), cues: stateRows },
            questions,
            items,
        };
    }

    function pickScores(answers, items, minConfidence) {
        const jev = getJev();
        const ids = (items || []).map((it, i) => String(it?.id || `s${it?.index ?? i}`));
        if (jev?.pickConfidentScores) {
            return jev.pickConfidentScores(answers, ids, minConfidence);
        }
        return new Map();
    }

    /**
     * Re-order indexes by Laya score desc, then heuristic, then index.
     */
    function mergeScoreReorder(indexes, scoreById, heuristicByIndex = {}) {
        const list = [...(indexes || [])];
        list.sort((a, b) => {
            const sa = Number(scoreById.get(`s${a}`) ?? scoreById.get(String(a)) ?? NaN);
            const sb = Number(scoreById.get(`s${b}`) ?? scoreById.get(String(b)) ?? NaN);
            const ha = Number(heuristicByIndex[a] ?? heuristicByIndex[String(a)] ?? 0);
            const hb = Number(heuristicByIndex[b] ?? heuristicByIndex[String(b)] ?? 0);
            if (Number.isFinite(sa) || Number.isFinite(sb)) {
                return (Number.isFinite(sb) ? sb : -1) - (Number.isFinite(sa) ? sa : -1);
            }
            if (hb !== ha) return hb - ha;
            return a - b;
        });
        return list;
    }

    function buildPreMtHoldRequest(candidates) {
        const list = Array.isArray(candidates) ? candidates : [];
        const items = [];
        const questions = {};
        const stateRows = [];
        list.forEach((row, i) => {
            const index = Number(row?.index);
            const text = String(row?.text ?? '').trim();
            if (!text) return;
            const id = String(row?.id || `h${index}`);
            const t = clip(text);
            items.push({ ...row, id, index });
            stateRows.push({ id, index, text: t, band: row.band, reasons: row.reasons });
            questions[id] = choiceQ(
                [
                    'Pre-MT risk gate for one ASR cue.',
                    'Hold only if the transcript is too broken/empty to translate usefully;',
                    'otherwise allow machine translation this round.',
                    `Transcript:\n${t}`,
                    row.reasons ? `Risk: ${String(row.reasons).slice(0, 100)}` : '',
                ].filter(Boolean).join('\n'),
                {
                    hold: 'Hold — skip MT this round',
                    allow_mt: 'Allow MT this round',
                },
            );
        });
        return {
            state: { task: 'pre_mt_soft_hold', cues: stateRows },
            questions,
            items,
        };
    }

    function partitionPreMtHold(answers, items, minConfidence) {
        return partitionBinary(answers, items, {
            minConfidence,
            acceptChoices: ['hold'],
            rejectChoices: ['allow_mt'],
            idOf: (item, i) => String(item?.id || `h${item?.index ?? i}`),
        });
    }

    function buildFilmBriefTrustRequest(payload = {}) {
        const heuristic = clip(JSON.stringify(payload.heuristicBrief || {}).slice(0, 500), 500);
        const sample = clip(String(payload.sampleText || ''), 280);
        const id = 'brief0';
        const items = [{ id }];
        const questions = {
            [id]: choiceQ(
                [
                    'Decide whether a cheap heuristic film brief is good enough,',
                    'or whether to spend an LLM film-brief call.',
                    sample ? `Cue sample:\n${sample}` : '',
                    `Heuristic brief JSON:\n${heuristic}`,
                ].filter(Boolean).join('\n'),
                {
                    trust_heuristic: 'Trust the heuristic brief; skip LLM brief',
                    run_llm_brief: 'Run LLM film brief',
                },
            ),
        };
        return {
            state: { task: 'film_brief_trust', heuristic: payload.heuristicBrief || null },
            questions,
            items,
        };
    }

    function partitionFilmBriefTrust(answers, items, minConfidence) {
        return partitionBinary(answers, items, {
            minConfidence,
            acceptChoices: ['trust_heuristic'],
            rejectChoices: ['run_llm_brief'],
            idOf: (item) => String(item?.id || 'brief0'),
        });
    }

    function buildRecycleSoftRequest(candidates) {
        return buildAcceptRevertRequest('recycle_soft_clear', candidates.map((c) => ({
            ...c,
            before: c.text || c.before,
            after: c.blankText != null ? c.blankText : '',
        })), {
            instructionsLead: [
                'Possible recycled/pasted translation across different source lines.',
                'Accept clearing (blank) only if this ZH is a near-paraphrase paste;',
                'otherwise keep the current translation (revert).',
            ].join(' '),
        });
    }

    /**
     * Polish heuristic scores worth Laya Score re-rank.
     * Wide band: skip only extremes that heuristics already locked.
     */
    function isMidBandPolishScore(score) {
        const n = Number(score);
        return Number.isFinite(n) && n >= 1.2 && n <= 7;
    }

    /**
     * Soft-AV feel-good underfill stub (好舒服 / 好舒服…).
     */
    function isKimochiFeelGoodStubZh(text) {
        return /^(?:好舒服)(?:啊|呀|呢)?[…·.。．]*$/u.test(String(text || '').trim());
    }

    function jaHasKimochiFeel(text) {
        return /気持ち|きもち|気持/.test(String(text || ''));
    }

    /**
     * Deterministic expand already confident (intensifier / ねよ / site / name).
     */
    function isHardKimochiExpandJa(ja) {
        const s = String(ja || '');
        if (!jaHasKimochiFeel(s)) return false;
        if (/めっちゃ|めちゃくちゃ|すっごい|すごい|マジ|超/.test(s) && textLen(s) <= 18) return true;
        if (/気持ちいいね|きもちいいね|気持ちいいよ|きもちいいよ/.test(s) && textLen(s) <= 14) return true;
        if (/(?:おっぱい|胸)|口(?:が|も|は)?(?:気持ち|きもち)/.test(s) && textLen(s) <= 18) return true;
        if (/(?:そこ|ここ)(?:が|も|は|、)?(?:だめ|ダメ)?[、,]?(?:気持ち|きもち)/.test(s) && textLen(s) <= 18) {
            return true;
        }
        if (/(?:右の)?手で(?:気持ち|きもち)/.test(s) && textLen(s) <= 20) return true;
        if (/(?:気持ち|きもち)よくしてあげる|(?:気持ち|きもち)よくさせる|(?:気持ち|きもち)よくしてほしい/.test(s)
            && textLen(s) <= 22) {
            return true;
        }
        if (/お互い(?:気持ち|きもち)よく/.test(s) && textLen(s) <= 20) return true;
        if (/([一-龯ぁ-んァ-ンー]{1,6})(?:ちゃん|さん|くん)|[一-龯]{2,4}[、,，]/.test(s)
            && textLen(s) <= 22) {
            return true;
        }
        if (/どんな気持ち|どんなきもち/.test(s) && textLen(s) <= 16) return true;
        if (/気持ちよくなっちゃう|きもちよくなっちゃう/.test(s) && textLen(s) <= 16) return true;
        return false;
    }

    /**
     * Soft-band: stub ZH over richer kimochi JA — Laya chooses keep / expand / blank-retry.
     * @returns {'hard_expand'|'hard_keep'|'soft'|'skip'}
     */
    function classifyKimochiUnderfillBand(zh, ja, options = {}) {
        const z = String(zh || '').trim();
        const j = String(ja || '').trim();
        if (!isKimochiFeelGoodStubZh(z) || !jaHasKimochiFeel(j)) return 'skip';
        if (textLen(j) < 4) return 'skip';
        let polishText = z;
        let polishChanged = false;
        try {
            const sanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
            const pol = sanitize?.polishTruncatedReactiveZh?.(z, j);
            if (pol?.changed && pol.text) {
                polishText = String(pol.text).trim();
                polishChanged = polishText !== z;
            }
        } catch { /* optional */ }
        if (options._polishText != null) polishText = String(options._polishText);
        if (options._polishChanged === true) polishChanged = true;

        if (polishChanged && isHardKimochiExpandJa(j)) return 'hard_expand';
        // Bare 気持ちいい(+moan) with no expand — keep without Laya
        if (
            !polishChanged
            && textLen(j) <= 12
            && /^(?:[はぁああんっッ…・.\s]*)?(?:気持ち|きもち)いい[よね]?[はぁああんっッ…・.\s!！]*$/u.test(j)
        ) {
            return 'hard_keep';
        }
        // Richer JA still stubbed — soft band for Laya
        if (
            polishChanged
            || textLen(j) >= textLen(z) + 4
            || /してあげ|してやる|みんな|よかった|どんな|なっちゃう|もっと|すごく|めっちゃ|一緒/.test(j)
        ) {
            return 'soft';
        }
        return 'hard_keep';
    }

    /**
     * Collect soft-band candidates (+ optional hard_expand for sync apply).
     * @returns {{ soft: object[], hardExpand: object[] }}
     */
    function collectKimochiUnderfillCandidates(zhCues, jaCues = [], options = {}) {
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const jaList = Array.isArray(jaCues) ? jaCues : [];
        const soft = [];
        const hardExpand = [];
        let sanitize = null;
        try {
            sanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
        } catch { /* optional */ }

        for (let i = 0; i < zhList.length; i += 1) {
            const z = zhList[i];
            const zh = String(z?.text ?? '').trim();
            if (!isKimochiFeelGoodStubZh(zh)) continue;
            let ja = '';
            const idx = Number(z?.index);
            if (Number.isInteger(idx)) {
                const hit = jaList.find((c) => Number(c?.index) === idx);
                if (hit) ja = String(hit.text ?? '').trim();
            }
            if (!ja && i < jaList.length) ja = String(jaList[i]?.text ?? '').trim();
            if (!ja && Number.isFinite(Number(z?.startMs))) {
                const sm = Math.round(Number(z.startMs) || 0);
                const hit = jaList.find((c) => Math.round(Number(c?.startMs) || 0) === sm);
                if (hit) ja = String(hit.text ?? '').trim();
            }
            if (!jaHasKimochiFeel(ja)) continue;

            let expandText = zh;
            let polishChanged = false;
            try {
                const pol = sanitize?.polishTruncatedReactiveZh?.(zh, ja);
                if (pol?.changed && pol.text) {
                    expandText = String(pol.text).trim() || zh;
                    polishChanged = expandText !== zh;
                }
            } catch { /* optional */ }
            if (!polishChanged) {
                try {
                    const mapped = sanitize?.remapJaPreferLexical?.(ja);
                    if (mapped && String(mapped).trim() && String(mapped).trim() !== zh) {
                        expandText = String(mapped).trim();
                        polishChanged = true;
                    }
                } catch { /* optional */ }
            }

            const band = classifyKimochiUnderfillBand(zh, ja, {
                _polishText: expandText,
                _polishChanged: polishChanged,
            });
            const row = {
                index: Number.isInteger(idx) ? idx : i,
                id: `kf${Number.isInteger(idx) ? idx : i}`,
                text: zh,
                currentText: zh,
                expandText: polishChanged ? expandText : zh,
                sourceText: ja,
                ja,
                band,
                hasExpand: polishChanged && expandText !== zh,
            };
            if (band === 'hard_expand' && row.hasExpand) hardExpand.push(row);
            else if (band === 'soft') soft.push(row);
        }
        return { soft, hardExpand };
    }

    function buildKimochiUnderfillRequest(candidates) {
        const list = Array.isArray(candidates) ? candidates : [];
        const items = [];
        const questions = {};
        const stateRows = [];
        list.forEach((row, i) => {
            const index = Number(row?.index);
            const cur = String(row?.currentText ?? row?.text ?? '').trim();
            const exp = String(row?.expandText ?? '').trim();
            const src = String(row?.sourceText ?? row?.ja ?? '').trim();
            if (!cur || !src) return;
            const id = String(row?.id || (Number.isInteger(index) ? `kf${index}` : `kf${i}`));
            const c = clip(cur);
            const e = exp && exp !== cur ? clip(exp) : '';
            const s = clip(src, 160);
            items.push({
                ...row,
                id,
                index,
                currentText: cur,
                expandText: exp || cur,
                sourceText: src,
                hasExpand: !!(exp && exp !== cur),
            });
            stateRows.push({ id, index, cur: c, exp: e || null, src: s });
            const criteria = {
                keep_stub: 'Keep the short feel-good stub (好舒服) — it matches the source well enough',
                blank_retry: 'Blank for another MT pass — stub misses important meaning',
            };
            if (e) {
                criteria.expand = 'Use the mild expanded Chinese gloss (more complete, still short)';
            }
            questions[id] = choiceQ(
                [
                    'Soft-AV subtitle underfill gate.',
                    'Japanese source has feel-good content; Chinese is a short stub like 好舒服.',
                    'Pick one action. Do not invent plot or adult detail beyond the source.',
                    `Source:\n${s}`,
                    `Current stub:\n${c}`,
                    e ? `Mild expand candidate:\n${e}` : 'No safe expand candidate — choose keep or blank-retry.',
                ].filter(Boolean).join('\n'),
                criteria,
            );
        });
        return {
            state: { task: 'kimochi_underfill', cues: stateRows },
            questions,
            items,
        };
    }

    function partitionKimochiUnderfill(answers, items, minConfidence) {
        const list = Array.isArray(items) ? items : [];
        const jev = getJev();
        const idOf = (item, i) => String(item?.id || `kf${item?.index ?? i}`);
        const picked = jev?.pickConfidentChoices
            ? jev.pickConfidentChoices(
                answers,
                list.map((item, i) => idOf(item, i)),
                minConfidence,
            )
            : new Map();
        const expand = [];
        const keep = [];
        const blank = [];
        const undecided = [];
        let decided = 0;
        list.forEach((item, i) => {
            const id = idOf(item, i);
            const choice = String(picked.get(id) || '').trim().toLowerCase();
            if (!choice) {
                undecided.push(item);
                return;
            }
            if (choice === 'expand' && item.hasExpand !== false) {
                expand.push(item);
                decided += 1;
                return;
            }
            if (choice === 'keep_stub' || choice === 'keep') {
                keep.push(item);
                decided += 1;
                return;
            }
            if (choice === 'blank_retry' || choice === 'blank') {
                blank.push(item);
                decided += 1;
                return;
            }
            // Model picked expand without candidate → treat as blank-retry
            if (choice === 'expand') {
                blank.push(item);
                decided += 1;
                return;
            }
            undecided.push(item);
        });
        return { expand, keep, blank, undecided, decided, accept: expand, reject: keep };
    }

    /**
     * Apply kimochi underfill decisions onto ZH cue list.
     */
    function applyKimochiUnderfillDecisions(zhCues, decided = {}, options = {}) {
        const list = Array.isArray(zhCues) ? zhCues.map((c) => ({ ...c })) : [];
        const blankText = options.blankText != null ? String(options.blankText) : '…';
        const byIndex = new Map();
        list.forEach((c, i) => {
            const idx = Number(c?.index);
            if (Number.isInteger(idx)) byIndex.set(idx, i);
        });
        let changed = 0;
        const touch = (rows, mut) => {
            for (const row of rows || []) {
                const idx = Number(row?.index);
                const i = byIndex.get(idx);
                if (i == null) continue;
                const next = mut(list[i], row);
                if (next && next !== list[i]) {
                    list[i] = next;
                    changed += 1;
                }
            }
        };
        touch(decided.hardExpand || [], (cue, row) => {
            const t = String(row.expandText || '').trim();
            if (!t || t === String(cue.text || '').trim()) return null;
            return { ...cue, text: t };
        });
        touch(decided.expand || [], (cue, row) => {
            const t = String(row.expandText || '').trim();
            if (!t || t === String(cue.text || '').trim()) return null;
            return { ...cue, text: t };
        });
        touch(decided.blank || [], (cue) => {
            if (String(cue.text || '').trim() === blankText) return null;
            return { ...cue, text: blankText };
        });
        return { cues: list, changed };
    }

    return {
        clip,
        classifyPolishUpdateKind,
        buildAcceptRevertRequest,
        partitionAcceptRevert,
        buildKeepSwapRequest,
        partitionKeepSwap,
        buildSemanticApplyRequest,
        buildScoreRankRequest,
        pickScores,
        mergeScoreReorder,
        buildPreMtHoldRequest,
        partitionPreMtHold,
        buildFilmBriefTrustRequest,
        partitionFilmBriefTrust,
        buildRecycleSoftRequest,
        isMidBandPolishScore,
        isKimochiFeelGoodStubZh,
        jaHasKimochiFeel,
        isHardKimochiExpandJa,
        classifyKimochiUnderfillBand,
        collectKimochiUnderfillCandidates,
        buildKimochiUnderfillRequest,
        partitionKimochiUnderfill,
        applyKimochiUnderfillDecisions,
        textLen,
        overlapRatio,
    };
}));
