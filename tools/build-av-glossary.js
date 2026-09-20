#!/usr/bin/env node
/**
 * Build AV actor + domain glossaries from transub-ja / mdcx sources.
 *
 * Inputs (first existing wins):
 *   --actors=path   default: ../transub-ja-full-backup/.../actors.json or shared/raw/mdcx-actors.json
 *   --sakura=path   default: backup sakura_dict.json or shared/raw/sakura-dict.json
 *
 * Outputs:
 *   shared/av-actor-glossary.json
 *   shared/av-domain-glossary.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_ACTOR = path.join(ROOT, 'shared', 'av-actor-glossary.json');
const OUT_DOMAIN = path.join(ROOT, 'shared', 'av-domain-glossary.json');

const KANA_RE = /[\u3040-\u30ff]/;
const HAN_RE = /[\u4e00-\u9fff]/;
const LATIN_ONLY_RE = /^[A-Za-z0-9 .'_\-]+$/;
const JUNK_SRC_RE = /^@|^\s*$|^(素人|女優|女优|男優|男优)$/;
const PLACEHOLDER_RE = /^(?:a{3,}|b{3,}|x{3,}|test|foo|bar|bbbb)$/i;
const MOAN_SRC_RE = /^(?:[あぁうぅおォんンー〜~っッ]{2,}|[あいうえおアイウエオぁぃぅぇぉ]{2,6}|あんあん.*|アンアン.*|へへへ.*|はうぅ.*)$/;
const NOISE_ZH_RE = /^[啊嗯哦呀哈嘿哎呜唔呼呲啾]+$/;
/** High false-positive / non-domain rows from SakuraDict. */
const DOMAIN_COMMON_JUNK = new Set([
    'じゃ', 'そう', '先生', '彼女', '息子', '姉妹', '親子', '先輩', '兄貴', '姫様', '疑似',
    'あーし', 'わらひ',
]);

function parseArgs(argv) {
    const out = {};
    for (const arg of argv) {
        const m = /^--(\w+)=(.+)$/.exec(String(arg || ''));
        if (m) out[m[1]] = m[2];
    }
    return out;
}

function firstExisting(paths) {
    for (const p of paths) {
        const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
        if (fs.existsSync(abs)) return abs;
    }
    return '';
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isJaLike(text) {
    const s = String(text || '').trim();
    if (!s) return false;
    return KANA_RE.test(s) || (HAN_RE.test(s) && /[\u3040-\u9fff]/.test(s));
}

/** Prefer simplified Chinese surfaces for MT / prompt glossary injection. */
function isUsableZh(text) {
    const s = String(text || '').trim();
    if (!s || s.length < 2) return false;
    if (KANA_RE.test(s)) return false;
    if (!HAN_RE.test(s)) return false;
    if (JUNK_SRC_RE.test(s)) return false;
    if (PLACEHOLDER_RE.test(s) || NOISE_ZH_RE.test(s)) return false;
    return true;
}

function isShortLatinAlias(src) {
    const s = String(src || '').trim();
    if (!LATIN_ONLY_RE.test(s)) return false;
    const token = s.replace(/\./g, '').trim();
    if (!token) return true;
    // Single-token short Latin given names are false-positive magnets in mixed text.
    if (!/\s/.test(token) && token.length <= 6) return true;
    return token.length <= 3;
}

function isJunkSrc(src) {
    const s = String(src || '').trim();
    if (!s || s.length <= 2) return true;
    if (s.startsWith('@')) return true;
    if (JUNK_SRC_RE.test(s)) return true;
    if (PLACEHOLDER_RE.test(s)) return true;
    if (isShortLatinAlias(s)) return true;
    return false;
}

function isJunkDomainEntry(src, zh) {
    const s = String(src || '').trim();
    const z = String(zh || '').trim();
    if (!s || !z || s === z) return true;
    if (s.length <= 1 || z.length < 2) return true;
    if (s.toLowerCase() === z.toLowerCase()) return true;
    if (PLACEHOLDER_RE.test(s) || PLACEHOLDER_RE.test(z)) return true;
    if (MOAN_SRC_RE.test(s) || NOISE_ZH_RE.test(z)) return true;
    if (DOMAIN_COMMON_JUNK.has(s)) return true;
    // Short hiragana-only particles / moans (keep short katakana slang like エロ).
    if (s.length <= 2 && KANA_RE.test(s) && !HAN_RE.test(s) && !/[ァ-ヶー]/.test(s)) return true;
    return false;
}

function resolveJaChain(start, aliasMap, canonicalJa, maxHops = 8) {
    let cur = String(start || '').trim();
    const seen = new Set();
    for (let i = 0; i < maxHops; i += 1) {
        if (!cur || seen.has(cur)) break;
        seen.add(cur);
        if (canonicalJa.has(cur)) return cur;
        const next = aliasMap.get(cur);
        if (!next || next === cur) break;
        cur = next;
    }
    return canonicalJa.has(cur) ? cur : '';
}

function buildActorGlossary(rawRows) {
    const canonicalJa = new Map();
    const aliasMap = new Map();

    for (const row of rawRows) {
        const src = String(row?.src || '').trim();
        const dst = String(row?.dst || '').trim();
        const info = String(row?.info || '').trim();
        if (!src || !dst) continue;
        if (info === '女优人名') canonicalJa.set(src, dst);
        else if (info === '女优别名') aliasMap.set(src, dst);
    }

    const lookup = new Map();
    const entries = [];
    const seenEntry = new Set();
    const dropped = { noZh: 0, junkSrc: 0, caseIdent: 0 };

    function addLookup(src, zh, canonical, info) {
        const s = String(src || '').trim();
        const z = String(zh || '').trim();
        if (!s || !z || s === z) {
            dropped.caseIdent += 1;
            return;
        }
        if (s.toLowerCase() === z.toLowerCase()) {
            dropped.caseIdent += 1;
            return;
        }
        if (!isUsableZh(z)) {
            dropped.noZh += 1;
            return;
        }
        if (!lookup.has(s)) lookup.set(s, z);
        const key = `${s}\0${z}`;
        if (seenEntry.has(key)) return;
        seenEntry.add(key);
        entries.push({
            src: s,
            zh: z,
            canonical: canonical || s,
            info: info || '女优人名',
        });
    }

    for (const [ja, zhRaw] of canonicalJa.entries()) {
        if (ja.startsWith('@') || JUNK_SRC_RE.test(ja) || ja.length <= 2) {
            dropped.junkSrc += 1;
            continue;
        }
        if (isShortLatinAlias(ja)) {
            dropped.junkSrc += 1;
            continue;
        }
        let zh = zhRaw;
        if (!isUsableZh(zh) && isJaLike(zh)) {
            const resolved = resolveJaChain(zh, aliasMap, canonicalJa);
            if (resolved) zh = canonicalJa.get(resolved) || zh;
        }
        if (!isUsableZh(zh)) {
            dropped.noZh += 1;
            continue;
        }
        addLookup(ja, zh, ja, '女优人名');
    }

    for (const [alias, dst] of aliasMap.entries()) {
        if (alias.startsWith('@') || JUNK_SRC_RE.test(alias) || alias.length <= 2) {
            dropped.junkSrc += 1;
            continue;
        }
        if (isShortLatinAlias(alias)) {
            dropped.junkSrc += 1;
            continue;
        }
        let zh = '';
        let canonical = '';
        if (isUsableZh(dst)) {
            zh = dst;
            canonical = resolveJaChain(alias, aliasMap, canonicalJa) || alias;
        } else {
            canonical = resolveJaChain(dst, aliasMap, canonicalJa) || resolveJaChain(alias, aliasMap, canonicalJa);
            if (canonical) zh = canonicalJa.get(canonical) || '';
        }
        if (!isUsableZh(zh)) {
            dropped.noZh += 1;
            continue;
        }
        addLookup(alias, zh, canonical || alias, '女优别名');
    }

    entries.sort((a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'));

    return {
        version: 1,
        source: 'mdcx mapping_actor.xml (transub-ja)',
        builtAt: new Date().toISOString(),
        stats: {
            raw: rawRows.length,
            canonicalJa: canonicalJa.size,
            aliases: aliasMap.size,
            entries: entries.length,
            dropped,
        },
        entries,
    };
}

function buildDomainGlossary(rawRows) {
    const rows = [];
    const seen = new Set();
    let dropped = 0;
    for (const row of rawRows) {
        const src = String(row?.src || '').trim();
        const zh = String(row?.dst || row?.zh || '').trim();
        const info = String(row?.info || 'SakuraDict').trim();
        if (isJunkDomainEntry(src, zh)) {
            dropped += 1;
            continue;
        }
        const key = `${src}\0${zh}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ src, zh, info });
    }
    rows.sort((a, b) => b.src.length - a.src.length || a.src.localeCompare(b.src, 'ja'));
    return {
        version: 1,
        source: 'SakuraDict (transub-ja)',
        builtAt: new Date().toISOString(),
        stats: { raw: rawRows.length, entries: rows.length, dropped },
        entries: rows,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const actorsPath = args.actors || firstExisting([
        'f:/transub-ja-full-backup/transub-ja/data/glossary/actors.json',
        'F:/transub-ja-full-backup/transub-ja/data/glossary/actors.json',
        'shared/raw/mdcx-actors.json',
    ]);
    const sakuraPath = args.sakura || firstExisting([
        'f:/transub-ja-full-backup/transub-ja/data/glossary/sakura_dict.json',
        'F:/transub-ja-full-backup/transub-ja/data/glossary/sakura_dict.json',
        'shared/raw/sakura-dict.json',
    ]);

    if (!actorsPath) {
        console.error('actors source not found; pass --actors=path');
        process.exit(1);
    }

    const actorPack = buildActorGlossary(loadJson(actorsPath));
    fs.mkdirSync(path.dirname(OUT_ACTOR), { recursive: true });
    fs.writeFileSync(OUT_ACTOR, `${JSON.stringify(actorPack)}\n`, 'utf8');
    console.log('wrote', OUT_ACTOR, actorPack.stats);

    if (sakuraPath) {
        const domainPack = buildDomainGlossary(loadJson(sakuraPath));
        fs.writeFileSync(OUT_DOMAIN, `${JSON.stringify(domainPack)}\n`, 'utf8');
        console.log('wrote', OUT_DOMAIN, domainPack.stats);
    } else {
        console.warn('sakura source missing; skipped domain glossary');
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    isUsableZh,
    isJunkSrc,
    isJunkDomainEntry,
    isShortLatinAlias,
    buildActorGlossary,
    buildDomainGlossary,
};
