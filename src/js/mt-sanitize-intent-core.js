/**
 * Declarative intent model for MT sanitize / opaque / ASR domain rules.
 * Makes opposing strip vs remap (and ASR↔ZH) conflicts first-class instead of
 * relying only on FIX key-name heuristics + full mocha fixtures.
 *
 * Runtime sanitize still runs imperative code in mt-opaque-strings / mt-sanitize-core;
 * this module is the semantic index for tooling, ship-gate, and training discipline.
 *
 * Reuse policy: intents describe cross-title JA/ZH patterns. `smokeTitles` are
 * discovery samples only — never runtime title gates. See docs/mt-sanitize.md.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSanitizeIntent = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSanitizeIntentFactory() {
    const KIND = Object.freeze({
        strip: 'strip',
        remap: 'remap',
        recover: 'recover',
        asr: 'asr',
    });

    const LAYER = Object.freeze({
        opaque: 'opaque',
        core: 'core',
        asr: 'asr',
        trained: 'trained',
    });

    /**
     * Canonical opposing / high-risk intents. zhSurface is resolved from opaque.T / FIX
     * via zhRef (e.g. "T.meatRodZh") so adult literals stay out of this file.
     * @type {ReadonlyArray<object>}
     */
    const CANONICAL_INTENT_DEFS = Object.freeze([
        {
            id: 'strip.meatRod.hallucination',
            kind: KIND.strip,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.meatRodZh',
            // Discovery samples only — not a runtime title gate
            smokeTitles: Object.freeze(['ADN-798', 'SNOS-293']),
            jaForbidHint: 'no JA rod cue and ZH did not arrive via clinical remap',
            pairedWith: Object.freeze(['remap.clinicalRod.toMeatRod']),
            fixtureRefs: Object.freeze([
                'keeps clinical rod remaps without reopening ADN-798 hallucination strip',
            ]),
            flags: Object.freeze(['domain_hallucination']),
            note: 'Strip invented 肉棒 when JA has no rod cue (any title)',
        },
        {
            id: 'remap.clinicalRod.toMeatRod',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.meatRodZh',
            smokeTitles: Object.freeze(['MIDA-762']),
            jaRequireHint: 'clinical ZH (男性生殖器 / 阴茎 / 大尺寸…) or dekachin JA',
            pairedWith: Object.freeze(['strip.meatRod.hallucination']),
            fixtureRefs: Object.freeze([
                'keeps clinical rod remaps without reopening ADN-798 hallucination strip',
                'MIDA-762: male-genital / dekachin-size / kintama-epididymis / porchio',
            ]),
            flags: Object.freeze(['domain_term']),
            note: 'Clinical / euphemism ZH → colloquial 肉棒 must survive strip (any title)',
        },
        {
            id: 'strip.rod.hallucination',
            kind: KIND.strip,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.rodZh',
            smokeTitles: Object.freeze(['ADN-798']),
            jaForbidHint: 'no JA rod cue and ZH did not arrive via clinical remap',
            pairedWith: Object.freeze([]),
            fixtureRefs: Object.freeze([
                'ADN-798: Sakura trunc / anatomy halluc / wet SFX / moan remap',
            ]),
            flags: Object.freeze(['domain_hallucination']),
            note: 'Strip invented 鸡巴/棒 when JA has no rod cue (any title)',
        },
        {
            id: 'remap.maleGenital.toMeatRod',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'FIX.maleGenitalOkZh',
            smokeTitles: Object.freeze(['MIDA-762']),
            jaRequireHint: 'ZH contains clinical 男性生殖器 / 生殖器 (remap to colloquial)',
            pairedWith: Object.freeze(['strip.meatRod.hallucination']),
            fixtureRefs: Object.freeze([
                'MIDA-762: male-genital / dekachin-size / kintama-epididymis / porchio',
            ]),
            flags: Object.freeze(['domain_term']),
            note: '男性生殖器 line → 肉棒 colloquial (pattern, not film-scoped)',
        },
        {
            id: 'recover.blankIku',
            kind: KIND.recover,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.aboutToCumPlainZh',
            smokeTitles: Object.freeze(['ADN-798']),
            jaRequireHint: 'blank ZH + short iku / イク JA cue',
            pairedWith: Object.freeze(['remap.femaleManko.toGo']),
            fixtureRefs: Object.freeze([
                'ADN-798/791 + residuals: milk ASR / nakadashi / sefri / iku-start / blanks',
            ]),
            flags: Object.freeze(['blank_adult_recover']),
            note: 'Blank ZH + iku JA → recover 要射了 (not a strip; any title)',
        },
        {
            id: 'remap.femaleManko.toGo',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: null,
            zhLiteral: '要去了',
            smokeTitles: Object.freeze(['batch-0811night']),
            jaRequireHint: 'まんこ/乳首/らめ/ダメイッ female climax cues — prefer 去了 not 射了',
            pairedWith: Object.freeze(['recover.blankIku']),
            fixtureRefs: Object.freeze([
                'batch-0811night: latin scrap widen + manko climax + hard-rod stub',
                'batch-engine-0812night: show/フェラ/キス/らめぇ stubs',
                'batch-engine-0813: soft_go / yame_shoot polarity (らめイク / ダメイッちゃった / やめろ)',
            ]),
            flags: Object.freeze(['domain_term', 'blank_adult_recover']),
            note: 'Female manko/nipple/らめ/ダメ climax → 要去了; must not be forced to male 要射了',
        },
        {
            id: 'remap.maleAshitaDashite.toShoot',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: null,
            zhLiteral: '要射了',
            smokeTitles: Object.freeze(['JUR-794']),
            jaRequireHint: '明日出して / 出してくれ + いっく — male ejac ask keeps 射',
            pairedWith: Object.freeze(['remap.femaleManko.toGo']),
            fixtureRefs: Object.freeze([
                'batch-engine-0813: soft_go / yame_shoot polarity (らめイク / ダメイッちゃった / やめろ)',
            ]),
            flags: Object.freeze(['domain_term']),
            note: 'Male 出してくれ climax → 要射了; opposite of female soft_go',
        },
        {
            id: 'remap.tipSentou.toQianDuan',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: null,
            zhLiteral: '前端',
            smokeTitles: Object.freeze(['DVAJ-753']),
            jaRequireHint: '先っぽ/先っちょ JA — 先头 is wrong soft gloss',
            pairedWith: Object.freeze([]),
            fixtureRefs: Object.freeze([
                'batch-engine-0813b: under soft-cover tip/rod/dashite/iku/choudai',
            ]),
            flags: Object.freeze(['domain_term']),
            note: '先头 → 前端 when JA has tip cue',
        },
        {
            id: 'remap.yangwu.toMeatRod',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.meatRodZh',
            smokeTitles: Object.freeze(['FNS-241']),
            jaRequireHint: 'おちんちん/ちんぽ JA — 阳物 soft gloss → 肉棒',
            pairedWith: Object.freeze(['strip.meatRod.hallucination']),
            fixtureRefs: Object.freeze([
                'batch-engine-0813b: under soft-cover tip/rod/dashite/iku/choudai',
                'keeps clinical rod remaps without reopening ADN-798 hallucination strip',
            ]),
            flags: Object.freeze(['domain_term']),
            note: '阳物 → 肉棒; still paired with hallucination strip',
        },
        {
            id: 'recover.haStub.lexical',
            kind: KIND.recover,
            layer: LAYER.core,
            reusable: true,
            zhRef: null,
            zhLiteral: '哈 哈',
            smokeTitles: Object.freeze(['PRED-887', 'MIBB-084', 'MFYD-171']),
            jaRequireHint: 'ZH moan stub 哈 哈/嗯嗯/呵呵 or glued 小穴哈 哈 + lexical JA; strip はぁはぁ/ふふふ prefix',
            pairedWith: Object.freeze(['remap.onegaiStub.toPlease']),
            fixtureRefs: Object.freeze([
                'batch-engine-0818ha: moan-stub 哈 哈 recovers lexical JA',
            ]),
            flags: Object.freeze(['blank_adult_recover', 'truncated_reactive', 'domain_term']),
            note: 'Engine collapses lexical JA to spaced 哈 哈; recover remainder after breath/laughter strip',
        },
        {
            id: 'remap.onegaiStub.toPlease',
            kind: KIND.remap,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: null,
            zhLiteral: '拜托了',
            smokeTitles: Object.freeze(['START-593', 'IPZZ-904']),
            jaRequireHint: 'お願いする / ちゃんとお願いして stubs — not 听好了/那',
            pairedWith: Object.freeze(['recover.haStub.lexical']),
            fixtureRefs: Object.freeze([
                'batch-engine-0813c: under_stub お願い / 反則 / wet ちゅぶっ / 出してんだ',
                'batch-engine-0818ha: moan-stub 哈 哈 recovers lexical JA',
            ]),
            flags: Object.freeze(['domain_term']),
            note: 'お願い under stubs → 拜托/求我 (cross-title)',
        },
        {
            id: 'strip.wetChubub.sfx',
            kind: KIND.strip,
            layer: LAYER.core,
            reusable: true,
            zhRef: null,
            zhLiteral: '吸吧',
            smokeTitles: Object.freeze(['JUR-097']),
            jaRequireHint: 'ちゅぶっ/ぢゅぱっ pure wet SFX — blank ZH halluc',
            pairedWith: Object.freeze([]),
            fixtureRefs: Object.freeze([
                'batch-engine-0813c: under_stub お願い / 反則 / wet ちゅぶっ / 出してんだ',
            ]),
            flags: Object.freeze(['wet_sfx']),
            note: 'ちゅぶっ was missing from wet JA atoms; 吸吧吧 ZH halluc',
        },
        {
            id: 'strip.panpan.rodInvent',
            kind: KIND.strip,
            layer: LAYER.opaque,
            reusable: true,
            zhRef: 'T.meatRodZh',
            smokeTitles: Object.freeze(['DVAJ-752']),
            jaForbidHint: 'パンパン swollen/slap JA must not invent 鸡鸡/肉棒',
            pairedWith: Object.freeze(['remap.clinicalRod.toMeatRod']),
            fixtureRefs: Object.freeze([
                'batch-engine-0812late: FNS/DVAJ teacher stubs, ディル, sov/feira',
            ]),
            flags: Object.freeze(['domain_hallucination']),
            note: 'パンパン ≠ rod invent; strip 鸡鸡棒棒 / unjustified 肉棒',
        },
    ]);

    /**
     * @param {object} opaque
     * @param {string} ref e.g. "T.meatRodZh" | "FIX.maleGenitalOkZh"
     * @returns {string}
     */
    function resolveZhRef(opaque, ref) {
        const raw = String(ref || '').trim();
        if (!raw) return '';
        const m = raw.match(/^(T|FIX)\.([A-Za-z0-9_]+)$/);
        if (!m) return '';
        const bag = m[1] === 'T' ? opaque?.T : opaque?.FIX;
        return String(bag?.[m[2]] || '').trim();
    }

    /**
     * Resolve canonical defs against opaque tables.
     * @param {object} [opaque]
     * @returns {Array<object>}
     */
    function buildCanonicalIntents(opaque = {}) {
        const out = [];
        for (const def of CANONICAL_INTENT_DEFS) {
            const zhSurface = def.zhLiteral
                ? String(def.zhLiteral)
                : resolveZhRef(opaque, def.zhRef);
            if (!zhSurface && def.zhRef) {
                // Optional surfaces (e.g. cockZh may be absent) — skip silently
                continue;
            }
            if (!zhSurface && !def.zhRef && !def.zhLiteral) continue;
            const smokeTitles = def.smokeTitles
                ? [...def.smokeTitles]
                : (def.titles ? [...def.titles] : []);
            out.push(Object.freeze({
                ...def,
                reusable: def.reusable !== false,
                zhSurface,
                pairedWith: def.pairedWith ? [...def.pairedWith] : [],
                fixtureRefs: def.fixtureRefs ? [...def.fixtureRefs] : [],
                flags: def.flags ? [...def.flags] : [],
                smokeTitles,
                // Alias for older tooling; same provenance-only semantics
                titles: smokeTitles,
            }));
        }
        return out;
    }

    /**
     * Synthetic ASR intents from adult opaque pairs (to-side ZH/JA surfaces).
     * @param {object} [opaque]
     * @returns {Array<object>}
     */
    function buildAsrIntents(opaque = {}) {
        const pairs = typeof opaque.getAsrAdultDomainPairs === 'function'
            ? opaque.getAsrAdultDomainPairs()
            : [];
        const out = [];
        for (let i = 0; i < pairs.length; i += 1) {
            const p = pairs[i] || {};
            const from = String(p.from || p[0] || '').trim();
            const to = String(p.to || p[1] || '').trim();
            if (!from || !to) continue;
            out.push(Object.freeze({
                id: `asr.adult.${i}`,
                kind: KIND.asr,
                layer: LAYER.asr,
                zhSurface: to,
                from,
                to,
                pairedWith: [],
                fixtureRefs: [],
                flags: [],
                titles: [],
                note: 'Adult ASR domain pair (D01 merge source)',
            }));
        }
        return out;
    }

    /**
     * @param {object} [opaque]
     * @returns {Array<object>}
     */
    function buildAllIntents(opaque = {}) {
        return [...buildCanonicalIntents(opaque), ...buildAsrIntents(opaque)];
    }

    /**
     * Declared strip↔remap pairs that share a ZH surface (or are explicitly paired).
     * @param {Array<object>} intents
     * @returns {{ conflicts: object[], warnings: object[] }}
     */
    function analyzeDeclaredConflicts(intents = []) {
        const conflicts = [];
        const warnings = [];
        const byId = new Map(intents.map((i) => [i.id, i]));
        const seenPair = new Set();

        for (const a of intents) {
            if (a.kind !== KIND.strip && a.kind !== KIND.remap) continue;
            for (const peerId of (a.pairedWith || [])) {
                const b = byId.get(peerId);
                if (!b) {
                    warnings.push({
                        kind: 'missing_paired_intent',
                        severity: 'medium',
                        intentId: a.id,
                        pairedWith: peerId,
                        note: 'pairedWith points at an unknown intent id',
                    });
                    continue;
                }
                const key = [a.id, b.id].sort().join('|');
                if (seenPair.has(key)) continue;
                seenPair.add(key);

                const sameZh = a.zhSurface && b.zhSurface && a.zhSurface === b.zhSurface;
                const opposing = (a.kind === KIND.strip && b.kind === KIND.remap)
                    || (a.kind === KIND.remap && b.kind === KIND.strip);
                if (opposing) {
                    // Declared opposing pair is expected — emit as info-level "locked" conflict
                    // so tooling surfaces it without failing the ship-gate.
                    warnings.push({
                        kind: 'declared_opposing_pair',
                        severity: 'info',
                        zh: a.zhSurface || b.zhSurface || '',
                        a: [a.id],
                        b: [b.id],
                        fixtureRefs: [...new Set([...(a.fixtureRefs || []), ...(b.fixtureRefs || [])])],
                        sameZhSurface: !!sameZh,
                        note: sameZh
                            ? 'Declared strip↔remap on same ZH — fixtures must lock both directions'
                            : 'Declared strip↔remap pair (ZH surfaces differ) — keep both fixtures green',
                    });
                }
            }
        }

        // Undeclared: two canonical strip+remap share zhSurface without pairedWith link
        /** @type {Map<string, object[]>} */
        const zhMap = new Map();
        for (const i of intents) {
            if (i.kind !== KIND.strip && i.kind !== KIND.remap) continue;
            if (i.layer === LAYER.asr) continue;
            const zh = String(i.zhSurface || '').trim();
            if (!zh || zh.length < 2) continue;
            if (!zhMap.has(zh)) zhMap.set(zh, []);
            zhMap.get(zh).push(i);
        }
        for (const [zh, list] of zhMap) {
            const strips = list.filter((x) => x.kind === KIND.strip);
            const remaps = list.filter((x) => x.kind === KIND.remap);
            if (!strips.length || !remaps.length) continue;
            const linked = strips.some((s) => remaps.some((r) =>
                (s.pairedWith || []).includes(r.id) || (r.pairedWith || []).includes(s.id)));
            if (linked) continue;
            conflicts.push({
                kind: 'undeclared_strip_vs_remap_same_zh',
                severity: 'high',
                zh,
                a: strips.map((s) => s.id),
                b: remaps.map((r) => r.id),
                note: 'Strip and remap share ZH but are not linked via pairedWith — declare the pair or narrow one side',
            });
        }

        return { conflicts, warnings };
    }

    /**
     * ASR `to` overlapping strip/remap ZH surfaces (generalized meatRod case).
     * @param {Array<object>} intents
     * @returns {object[]}
     */
    function analyzeAsrSurfaceOverlaps(intents = []) {
        const warnings = [];
        const asr = intents.filter((i) => i.kind === KIND.asr);
        const zhIntents = intents.filter((i) =>
            (i.kind === KIND.strip || i.kind === KIND.remap) && i.zhSurface);
        for (const z of zhIntents) {
            const zh = z.zhSurface;
            const hits = asr.filter((a) => String(a.to || a.zhSurface || '').includes(zh));
            if (!hits.length) continue;
            warnings.push({
                kind: 'asr_to_overlaps_zh_intent',
                severity: z.kind === KIND.strip ? 'medium' : 'low',
                zh,
                intentId: z.id,
                intentKind: z.kind,
                asrCount: hits.length,
                asrIds: hits.slice(0, 8).map((h) => h.id),
                fixtureRefs: z.fixtureRefs || [],
                note: z.kind === KIND.strip
                    ? 'ASR domain `to` contains a strip-target ZH — lock strip + clinical remap fixtures'
                    : 'ASR domain `to` overlaps a remap ZH surface',
            });
        }
        return warnings;
    }

    /**
     * Canonical strip/remap/recover intents should document reusable JA/ZH conditions.
     * smokeTitles alone is not enough — that would look title-scoped.
     * @param {Array<object>} intents
     * @returns {object[]}
     */
    function analyzeReuseDiscipline(intents = []) {
        const warnings = [];
        for (const i of intents) {
            if (i.kind === KIND.asr) continue;
            if (i.layer === LAYER.asr) continue;
            if (i.reusable === false) {
                warnings.push({
                    kind: 'non_reusable_intent',
                    severity: 'high',
                    intentId: i.id,
                    smokeTitles: i.smokeTitles || i.titles || [],
                    note: 'Intent marked reusable:false — training must ship cross-title patterns only',
                });
                continue;
            }
            const hasCond = Boolean(
                String(i.jaRequireHint || '').trim()
                || String(i.jaForbidHint || '').trim(),
            );
            if (!hasCond && (i.kind === KIND.strip || i.kind === KIND.remap || i.kind === KIND.recover)) {
                warnings.push({
                    kind: 'missing_reuse_condition_hint',
                    severity: 'medium',
                    intentId: i.id,
                    smokeTitles: i.smokeTitles || i.titles || [],
                    note: 'Add jaRequireHint/jaForbidHint so the rule is documented as a reusable cue pattern, not a film patch',
                });
            }
        }
        return warnings;
    }

    /**
     * Ensure mocha it() titles referenced by intents still exist in the test source.
     * @param {Array<object>} intents
     * @param {string} testSource
     * @returns {object[]}
     */
    function analyzeMissingFixtureRefs(intents = [], testSource = '') {
        const src = String(testSource || '');
        if (!src) return [];
        const warnings = [];
        const seen = new Set();
        for (const i of intents) {
            for (const ref of (i.fixtureRefs || [])) {
                const key = String(ref || '').trim();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                // Mocha titles appear as it('…') or it("…")
                const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`it\\(\\s*['\`]${escaped}['\`]`);
                if (!re.test(src)) {
                    warnings.push({
                        kind: 'missing_fixture_ref',
                        severity: 'high',
                        fixtureRef: key,
                        intentIds: intents.filter((x) => (x.fixtureRefs || []).includes(key)).map((x) => x.id),
                        note: 'Intent fixtureRefs title not found in tests/mt-sanitize.test.js',
                    });
                }
            }
        }
        return warnings;
    }

    /**
     * Full intent-side analysis (no FIX heuristics).
     * @param {object} [opts]
     * @param {object} [opts.opaque]
     * @param {string} [opts.testSource]
     */
    function analyzeIntents(opts = {}) {
        const opaque = opts.opaque || {};
        const intents = buildAllIntents(opaque);
        const declared = analyzeDeclaredConflicts(intents);
        const reuseWarnings = analyzeReuseDiscipline(intents);
        const warnings = [
            ...declared.warnings,
            ...analyzeAsrSurfaceOverlaps(intents),
            ...reuseWarnings.filter((w) => w.severity !== 'high'),
            ...analyzeMissingFixtureRefs(intents, opts.testSource || ''),
        ];
        const conflicts = [
            ...declared.conflicts,
            ...reuseWarnings.filter((w) => w.severity === 'high'),
        ];
        // Promote missing fixture refs to conflicts (ship-gate blocking)
        for (const w of warnings.filter((x) => x.kind === 'missing_fixture_ref')) {
            conflicts.push({ ...w, severity: 'high' });
        }
        return {
            intents,
            conflicts,
            warnings: warnings.filter((w) => w.kind !== 'missing_fixture_ref'),
        };
    }

    /**
     * List explicit opposing pairs for docs / training UI.
     * @param {Array<object>} [intents]
     */
    function listOpposingPairs(intents = []) {
        const byId = new Map(intents.map((i) => [i.id, i]));
        const pairs = [];
        const seen = new Set();
        for (const a of intents) {
            for (const peerId of (a.pairedWith || [])) {
                const key = [a.id, peerId].sort().join('|');
                if (seen.has(key)) continue;
                seen.add(key);
                const b = byId.get(peerId);
                pairs.push({
                    a: a.id,
                    b: peerId,
                    zh: a.zhSurface || b?.zhSurface || '',
                    fixtureRefs: [...new Set([...(a.fixtureRefs || []), ...(b?.fixtureRefs || [])])],
                });
            }
        }
        return pairs;
    }

    return {
        KIND,
        LAYER,
        CANONICAL_INTENT_DEFS,
        resolveZhRef,
        buildCanonicalIntents,
        buildAsrIntents,
        buildAllIntents,
        analyzeDeclaredConflicts,
        analyzeAsrSurfaceOverlaps,
        analyzeMissingFixtureRefs,
        analyzeReuseDiscipline,
        analyzeIntents,
        listOpposingPairs,
    };
}));
