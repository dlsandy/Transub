'use strict';

const { fetchAnilistGlossary } = require('../tools/asr-vocab/lib/anilist-fetch');
const { mergeGlossaryDocs } = require('../tools/asr-vocab/lib/glossary-io');
const { buildBadPoolGlossary } = require('../tools/asr-vocab/lib/bad-pool-glossary');
const { normalizeGlossary } = require('../src/js/subtitle-glossary-core');

function mergeWithExisting(existing, incoming) {
    return normalizeGlossary(mergeGlossaryDocs(existing || { entries: [] }, incoming));
}

module.exports = {
    fetchAnilistGlossary,
    mergeWithExisting,
    buildBadPoolGlossary,
};
