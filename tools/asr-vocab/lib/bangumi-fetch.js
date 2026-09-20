'use strict';

const { normalizeNameKey } = require('./anilist-glossary-build');

const BGM_API = 'https://api.bgm.tv';
const BGM_UA = 'Transub/3.1.6 (https://github.com/dlsandy/Transub; local ASR glossary import)';

async function bgmFetch(path, init = {}) {
    const res = await fetch(`${BGM_API}${path}`, {
        ...init,
        headers: {
            Accept: 'application/json',
            'User-Agent': BGM_UA,
            ...(init.headers || {}),
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Bangumi HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    return res.json();
}

function pickSearchKeyword(media) {
    const synonyms = Array.isArray(media?.synonyms) ? media.synonyms : [];
    const zhSyn = synonyms.find((s) => /[\u4e00-\u9fff]/.test(String(s)) && !/[\u3040-\u30ff]/.test(String(s)));
    if (zhSyn) return String(zhSyn).trim();
    const native = String(media?.title?.native || '').trim();
    if (native) return native;
    return String(media?.title?.romaji || media?.title?.english || '').trim();
}

function parseBangumiZhName(character) {
    if (!character || typeof character !== 'object') return '';
    const direct = String(character.name_cn || character.nameCn || '').trim();
    if (direct && /[\u4e00-\u9fff]/.test(direct)) return direct;
    const infobox = character.infobox;
    if (Array.isArray(infobox)) {
        for (const row of infobox) {
            const key = String(row?.key || '').trim();
            if (!/简体中文名|中文名|简体名/.test(key)) continue;
            const values = Array.isArray(row?.values) ? row.values : [];
            for (const v of values) {
                const text = String(v?.v || v || '').trim();
                if (text && /[\u4e00-\u9fff]/.test(text)) return text;
            }
        }
    }
    return '';
}

async function searchBangumiSubject(keyword) {
    const q = String(keyword || '').trim();
    if (!q) return null;
    const json = await bgmFetch('/v0/search/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            keyword: q,
            filter: { type: [2] },
            limit: 5,
        }),
    });
    const list = Array.isArray(json?.data) ? json.data : [];
    if (!list.length) return null;
    const key = normalizeNameKey(q);
    return list.find((s) => normalizeNameKey(s.name_cn) === key
        || normalizeNameKey(s.name) === key
        || String(s.name_cn || '').includes(q)
        || String(s.name || '').includes(q)) || list[0];
}

async function fetchBangumiZhNameMap(media) {
    try {
        const keyword = pickSearchKeyword(media);
        const subject = await searchBangumiSubject(keyword);
        if (!subject?.id) return { map: new Map(), subjectId: null, subjectName: null };

        const related = await bgmFetch(`/v0/subjects/${subject.id}/characters`);
        const list = Array.isArray(related) ? related : [];
        const map = new Map();
        const details = await Promise.all(list.slice(0, 40).map(async (row) => {
            const id = row?.id || row?.character?.id;
            if (!id) return null;
            try {
                const detail = await bgmFetch(`/v0/characters/${id}`);
                const ja = String(detail?.name || row?.name || '').trim();
                const zh = parseBangumiZhName(detail);
                if (!ja || !zh) return null;
                return { ja, zh, jaKey: normalizeNameKey(ja) };
            } catch {
                return null;
            }
        }));
        for (const row of details) {
            if (row?.jaKey && row.zh) map.set(row.jaKey, row.zh);
        }
        return {
            map,
            subjectId: subject.id,
            subjectName: subject.name_cn || subject.name,
        };
    } catch {
        return { map: new Map(), subjectId: null, subjectName: null };
    }
}

function lookupBangumiZh(name, bangumiMap) {
    const native = String(name?.native || '').trim();
    if (!native || !bangumiMap?.size) return '';
    const key = normalizeNameKey(native);
    if (bangumiMap.has(key)) return bangumiMap.get(key);
    const fullKey = normalizeNameKey(String(name?.full || '').replace(/\s+/g, ''));
    for (const [jaKey, zh] of bangumiMap.entries()) {
        if (key.includes(jaKey) || jaKey.includes(key) || (fullKey && fullKey.includes(jaKey))) {
            return zh;
        }
    }
    return '';
}

module.exports = {
    fetchBangumiZhNameMap,
    lookupBangumiZh,
    pickSearchKeyword,
    parseBangumiZhName,
};
