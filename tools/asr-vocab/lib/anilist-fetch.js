'use strict';

const { anilistCharactersToGlossary } = require('./glossary-io');
const { normalizeGlossary } = require('../../../src/js/subtitle-glossary-core');

const ANILIST_URL = 'https://graphql.anilist.co';

const QUERY = `
query ($id: Int, $type: MediaType) {
  Media(id: $id, type: $type) {
    id
    title { romaji native english }
    synonyms
    characters(page: 1, perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
      edges {
        role
        node {
          name { full native first last alternative }
        }
      }
    }
  }
}`;

async function fetchAnilistGlossary(id, type = 'ANIME', options = {}) {
    const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            query: QUERY,
            variables: { id: Number(id), type: String(type || 'ANIME').toUpperCase() },
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`AniList HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    const media = json.data?.Media;
    if (!media) {
        throw new Error(`未找到 AniList 媒体 id=${id}`);
    }
    const titleLabel = media.title?.native || media.title?.romaji || `#${id}`;
    const canonicalLocale = String(options.canonicalLocale || 'zh').toLowerCase();

    let bangumi = { map: new Map(), subjectId: null, subjectName: null };
    if (canonicalLocale === 'zh' && options.bangumi !== false) {
        try {
            const { fetchBangumiZhNameMap } = require('./bangumi-fetch');
            bangumi = await fetchBangumiZhNameMap(media);
        } catch { /* optional */ }
    }

    const { lookupBangumiZh } = require('./bangumi-fetch');
    const glossary = anilistCharactersToGlossary(
        (media.characters?.edges || []).map((edge) => ({
            role: edge?.role,
            name: edge?.node?.name,
            bangumiZh: lookupBangumiZh(edge?.node?.name, bangumi.map),
        })),
        {
            source: `anilist:${String(type || 'ANIME').toUpperCase()}:${id}`,
            note: buildAnilistGlossaryNote(titleLabel, canonicalLocale, bangumi),
            canonicalLocale,
        },
    );
    return {
        mediaId: media.id,
        title: titleLabel,
        glossary: normalizeGlossary(glossary),
        bangumiSubjectId: bangumi.subjectId,
        bangumiSubjectName: bangumi.subjectName,
        canonicalLocale,
    };
}

function buildAnilistGlossaryNote(titleLabel, locale, bangumi) {
    const base = `${titleLabel} · AniList 角色`;
    if (locale === 'zh') {
        const src = bangumi?.subjectId
            ? `中文译名（Bangumi：${bangumi.subjectName || bangumi.subjectId}）`
            : '中文译名（OpenCC 简化 / 日文原名作别名）';
        return `${base} · ${src} · prompt 偏置；非误听替换`;
    }
    return `${base} · prompt 偏置；非误听替换`;
}

module.exports = {
    fetchAnilistGlossary,
};
