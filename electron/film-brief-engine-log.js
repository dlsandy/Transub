/**
 * Surface Pro film-brief results in the main-window engine log (formatting only).
 */
const { asPlainObject, asString } = require('./ipc-validate');

const MAX_SYNOPSIS = 160;
const MAX_TITLE = 40;
const MAX_GENRE = 24;
const MAX_TONE = 24;
const MAX_TERM_MEANING = 20;
const MAX_NAMES = 8;
const MAX_TERMS = 6;

function clipText(value, max) {
    const t = String(value || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const cap = Math.max(1, Number(max) || 1);
    if (t.length <= cap) return t;
    return `${t.slice(0, cap - 1)}…`;
}

function characterLabel(item) {
    if (typeof item === 'string') return String(item).trim();
    const name = String(item?.name || '').trim();
    if (!name) return '';
    const role = String(item?.role || '').trim();
    return role ? `${name}（${role}）` : name;
}

function termLabel(item) {
    if (typeof item === 'string') return String(item).trim();
    const term = String(item?.term || '').trim();
    if (!term) return '';
    const meaning = clipText(item?.meaning, MAX_TERM_MEANING);
    return meaning ? `${term}：${meaning}` : term;
}

function joinCapped(labels, maxItems) {
    const all = (Array.isArray(labels) ? labels : []).map((x) => String(x || '').trim()).filter(Boolean);
    if (!all.length) return '';
    const cap = Math.max(1, Number(maxItems) || 1);
    const list = all.slice(0, cap);
    const extra = all.length - list.length;
    return extra > 0 ? `${list.join('、')} 等${extra}项` : list.join('、');
}

function formatSampleHint(meta = {}) {
    const n = Number(meta.sampleCount);
    const total = Number(meta.sampleTotal);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (Number.isFinite(total) && total > 0) return `取样 ${n}/${total} 句`;
    return `取样 ${n} 句`;
}

/**
 * @param {object|null} brief
 * @param {{ sampleCount?: number, sampleTotal?: number, skipped?: boolean, skipReason?: string }} [meta]
 * @returns {string[]}
 */
function formatFilmBriefEngineLogLines(brief, meta = {}) {
    const opts = asPlainObject(meta);
    if (opts.skipped) {
        const reason = asString(opts.skipReason, 120).trim() || '智能翻译';
        return [`影片简要已跳过（${reason}）`];
    }

    const b = asPlainObject(brief);
    const lines = [];
    const head = ['影片简要已就绪'];
    const sample = formatSampleHint(opts);
    if (sample) head.push(sample);
    lines.push(head.join(' · '));

    const headline = [
        clipText(b.titleGuess, MAX_TITLE),
        clipText(b.genre, MAX_GENRE),
        clipText(b.tone, MAX_TONE),
    ].filter(Boolean);
    if (headline.length) lines.push(`简要 · ${headline.join(' · ')}`);

    const chars = joinCapped(
        (Array.isArray(b.characters) ? b.characters : []).map(characterLabel),
        MAX_NAMES,
    );
    if (chars) lines.push(`简要 · 人物：${chars}`);

    const terms = joinCapped(
        (Array.isArray(b.terms) ? b.terms : []).map(termLabel),
        MAX_TERMS,
    );
    if (terms) lines.push(`简要 · 专名：${terms}`);

    const synopsis = clipText(b.synopsis, MAX_SYNOPSIS);
    if (synopsis) lines.push(`简要 · 概要：${synopsis}`);

    return lines;
}

/**
 * Emit film-brief lines once per adapter session.
 * First line updates the translate status; extra lines are log-only.
 * @param {function} [onProgress]
 * @param {object} [session]
 * @param {object|null} filmBrief
 * @param {object} [meta]
 * @returns {string[]}
 */
function emitFilmBriefToProgress(onProgress, session, filmBrief, meta = {}) {
    if (session?.filmBriefLogged) return [];
    const lines = formatFilmBriefEngineLogLines(filmBrief, {
        sampleCount: meta.sampleCount ?? (session?.briefSourceCues || []).length,
        sampleTotal: meta.sampleTotal ?? session?.briefCueTotal,
        skipped: meta.skipped,
        skipReason: meta.skipReason,
    });
    if (!lines.length) return [];
    if (session && typeof session === 'object') session.filmBriefLogged = true;
    if (typeof onProgress !== 'function') return lines;
    onProgress({
        phase: meta.skipped ? 'film-brief-skip' : 'film-brief',
        message: lines[0],
    });
    for (let i = 1; i < lines.length; i += 1) {
        onProgress({
            phase: 'film-brief-detail',
            message: lines[i],
            logOnly: true,
        });
    }
    return lines;
}

module.exports = {
    clipText,
    characterLabel,
    formatSampleHint,
    formatFilmBriefEngineLogLines,
    emitFilmBriefToProgress,
};
