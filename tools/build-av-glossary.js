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
const JUNK_SRC_RE = /^@|^\s*$|^(素人|女優|女优|男優|男优)$/;

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

function isUsableZh(text) {
    const s = String(text || '').trim();
    if (!s || s.length < 2) return false;
    if (KANA_RE.test(s)) return false;
    if (JUNK_SRC_RE.test(s)) return false;
    return true;
}

function isJunkSrc(src) {
    const s = String(src || '').trim();
    if (!s || s.length <= 2) return true;
    if (s.startsWith('@')) return true;
    if (JUNK_SRC_RE.test(s)) return true;
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

    function addLookup(src, zh, canonical, info) {
        const s = String(src || '').trim();
        const z = String(zh || '').trim();
        if (!s || !z || s === z || !isUsableZh(z)) return;
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
        if (isJunkSrc(ja)) continue;
        let zh = zhRaw;
        if (!isUsableZh(zh) && isJaLike(zh)) {
            const resolved = resolveJaChain(zh, aliasMap, canonicalJa);
            if (resolved) zh = canonicalJa.get(resolved) || zh;
        }
        if (!isUsableZh(zh)) continue;
        addLookup(ja, zh, ja, '女优人名');
    }

    for (const [alias, dst] of aliasMap.entries()) {
        if (isJunkSrc(alias)) continue;
        let zh = '';
        let canonical = '';
        if (isUsableZh(dst)) {
            zh = dst;
            canonical = resolveJaChain(alias, aliasMap, canonicalJa) || alias;
        } else {
            canonical = resolveJaChain(dst, aliasMap, canonicalJa) || resolveJaChain(alias, aliasMap, canonicalJa);
            if (canonical) zh = canonicalJa.get(canonical) || '';
        }
        if (!isUsableZh(zh)) continue;
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
        },
        entries,
    };
}

function buildDomainGlossary(rawRows) {
    const rows = [];
    const seen = new Set();
    for (const row of rawRows) {
        const src = String(row?.src || '').trim();
        const zh = String(row?.dst || row?.zh || '').trim();
        const info = String(row?.info || 'SakuraDict').trim();
        if (!src || !zh || src === zh) continue;
        if (src.length <= 1) continue;
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
        stats: { entries: rows.length },
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

main();
