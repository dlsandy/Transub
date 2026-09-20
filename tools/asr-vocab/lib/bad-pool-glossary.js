'use strict';

const fs = require('fs');
const path = require('path');
const { summarizeBadPoolJsonl } = require('../../../electron/asr-bad-pool-draft');
const { emptyGlossary } = require('./glossary-io');
const { normalizeGlossary } = require('../../../src/js/subtitle-glossary-core');

function readOpenBadPoolCards(rootHint) {
    const sum = summarizeBadPoolJsonl({
        root: rootHint || undefined,
        sampleLimit: 5000,
    });
    const cards = [];
    const dir = sum.dir;
    if (!dir || !fs.existsSync(dir)) {
        return { dir: dir || '', cards, files: sum.files || [] };
    }
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const s = line.trim();
            if (!s) continue;
            try {
                const row = JSON.parse(s);
                if (row.status && row.status !== 'open' && row.status !== 'draft') continue;
                cards.push(row);
            } catch { /* skip */ }
        }
    }
    return { dir, cards, files: sum.files || [] };
}

function badPoolCardsToGlossary(cards) {
    const doc = emptyGlossary({
        source: 'asr-bad-pool',
        note: '坏句池待确认 · asrReplace',
    });
    const seen = new Set();
    for (const card of cards || []) {
        const wrong = String(card.ja_wrong || card.wrong || '').trim();
        const right = String(card.ja_right || card.correct || card.ja_fix || '').trim();
        if (!wrong || !right || wrong === right) continue;
        const key = `${wrong}\0${right}`;
        if (seen.has(key)) continue;
        seen.add(key);
        doc.entries.push({
            id: `g_bp_${seen.size}`,
            canonical: right,
            aliases: [wrong],
            enabled: true,
            asrReplace: true,
            note: `bad-pool ${card.kind || ''}/${card.profile || ''}`.trim(),
        });
    }
    return normalizeGlossary(doc);
}

function buildBadPoolGlossary(rootHint) {
    const { dir, cards, files } = readOpenBadPoolCards(rootHint);
    return {
        dir,
        files,
        cardCount: cards.length,
        glossary: badPoolCardsToGlossary(cards),
    };
}

module.exports = {
    readOpenBadPoolCards,
    badPoolCardsToGlossary,
    buildBadPoolGlossary,
};
