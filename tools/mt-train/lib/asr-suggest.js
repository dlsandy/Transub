'use strict';

/**
 * Suggest ASR `to` corrections from known tables (trained + adult opaque + SSOT JSON).
 * Never auto-write — only fills draft candidates for human confirm.
 */
const fs = require('fs');
const path = require('path');

let _cachedPairs = null;
let _cachedAt = 0;
const CACHE_MS = 5000;

function loadSsotPairs() {
    try {
        const p = path.join(__dirname, '../../../shared/ja-asr-domain-fixes.json');
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!Array.isArray(raw)) return [];
        return raw
            .map((row) => ({ from: String(row.from || ''), to: String(row.to || ''), source: 'ssot' }))
            .filter((row) => row.from && row.to && row.from !== row.to);
    } catch (_) {
        return [];
    }
}

function loadAdultPairs() {
    try {
        const opaque = require('../../../src/js/mt-opaque-strings');
        const list = typeof opaque.getAsrAdultDomainPairs === 'function'
            ? opaque.getAsrAdultDomainPairs()
            : [];
        return (list || [])
            .map((row) => ({ from: String(row.from || ''), to: String(row.to || ''), source: 'adult' }))
            .filter((row) => row.from && row.to && row.from !== row.to);
    } catch (_) {
        return [];
    }
}

function loadTrainedPairs() {
    try {
        const train = require('./train');
        const listed = train.listRules();
        return (listed.asrPairs || [])
            .filter((r) => r && r.enabled !== false)
            .map((r) => ({ from: String(r.from || ''), to: String(r.to || ''), source: 'trained' }))
            .filter((row) => row.from && row.to && row.from !== row.to);
    } catch (_) {
        return [];
    }
}

function listAsrSuggestPairs(force = false) {
    const now = Date.now();
    if (!force && _cachedPairs && (now - _cachedAt) < CACHE_MS) return _cachedPairs;
    const merged = [...loadTrainedPairs(), ...loadAdultPairs(), ...loadSsotPairs()];
    // Longest from first for greedy match
    merged.sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from, 'ja'));
    _cachedPairs = merged;
    _cachedAt = now;
    return merged;
}

/**
 * @param {string} ja
 * @param {{ pairs?: object[] }} [opts]
 * @returns {{ from: string, to: string, source: string, applied: string }|null}
 */
function suggestAsrCorrection(ja, opts = {}) {
    const text = String(ja || '').trim();
    if (text.length < 2) return null;
    const pairs = opts.pairs || listAsrSuggestPairs();
    for (const p of pairs) {
        if (!p.from || p.from.length < 2) continue;
        if (!text.includes(p.from)) continue;
        const applied = text.split(p.from).join(p.to);
        if (applied === text) continue;
        return {
            from: p.from,
            to: p.to,
            source: p.source || 'table',
            applied,
        };
    }
    return null;
}

/**
 * Fill draft.to when empty using table match on from/fullJa.
 * @param {object} draft
 * @param {{ pairs?: object[] }} [opts]
 */
function enrichAsrDraft(draft, opts = {}) {
    if (!draft || typeof draft !== 'object') return draft;
    const existingTo = String(draft.to || '').trim();
    if (existingTo) return draft;
    const hay = String(draft.fullJa || draft.from || '').trim();
    const hit = suggestAsrCorrection(hay, opts);
    if (!hit) return draft;
    // Prefer correcting the short `from` fragment when it contains the matched token
    let to = '';
    const frag = String(draft.from || '').trim();
    if (frag && frag.includes(hit.from)) {
        to = frag.split(hit.from).join(hit.to);
    } else {
        to = hit.applied;
        // If applied is whole-line, still ok as suggestion
    }
    if (!to || to === frag) return draft;
    return {
        ...draft,
        to,
        suggestSource: hit.source,
        suggestFrom: hit.from,
        needsTo: false,
        reason: `${draft.reason || '听写'} · 表候选「${hit.from}」→「${hit.to}」（${hit.source}，请确认）`,
    };
}

module.exports = {
    listAsrSuggestPairs,
    suggestAsrCorrection,
    enrichAsrDraft,
};
