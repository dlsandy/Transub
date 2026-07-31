/**
 * Build Engine job extras: subFormats, glossary, dualAss, releaseGpuAfter, words/karaoke.
 */

const ENGINE_SUB_FORMATS = new Set(['srt', 'vtt', 'ass', 'ass-dual']);

/**
 * Normalize subtitle formats for Transub Engine (drops LRC / unknown).
 * @param {string|string[]} raw
 * @returns {string[]}
 */
function normalizeEngineSubFormatsList(raw) {
    const parts = Array.isArray(raw)
        ? raw
        : String(raw || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
    const out = [];
    for (const part of parts) {
        let fmt = part;
        if (fmt === 'dual-ass' || fmt === 'assb') fmt = 'ass-dual';
        if (fmt === 'lrc') continue;
        if (!ENGINE_SUB_FORMATS.has(fmt)) continue;
        if (!out.includes(fmt)) out.push(fmt);
    }
    return out.length ? out : ['srt'];
}

/**
 * Resolve subFormats + dualAss for an engine job.
 * @param {object} merged
 * @returns {{ subFormats: string[], dualAss: boolean }}
 */
function resolveEngineSubFormats(merged = {}) {
    const task = String(merged.task || '').trim();
    const engineTask = task === 'dual' ? 'dual' : task === 'translate' ? 'translate_mt' : 'transcribe';
    let formats = normalizeEngineSubFormatsList(merged.subFormats);
    let dualAss = !!merged.dualAss;

    if (formats.includes('ass-dual')) {
        dualAss = true;
        formats = formats.filter((f) => f !== 'ass-dual');
        if (!formats.includes('ass')) formats.push('ass');
    }

    // 「合并双语」在引擎路径 → 额外写出 *.dual.ass
    if (engineTask === 'dual' && merged.mergeBilingualSubtitles) {
        dualAss = true;
        if (!formats.includes('ass') && !formats.includes('srt') && !formats.includes('vtt')) {
            formats.push('srt');
        }
    }

    return { subFormats: formats.length ? formats : ['srt'], dualAss };
}

/**
 * Map Transub glossary (canonical + aliases) → Engine MT pairs {src, tgt}.
 * Aliases / optional source fields are treated as source-language forms;
 * canonical is the preferred Chinese (or final) form.
 * @param {object|null} glossary
 * @returns {{ src: string, tgt: string }[]}
 */
function buildEngineGlossaryPairs(glossary) {
    const entries = Array.isArray(glossary?.entries) ? glossary.entries : [];
    const pairs = [];
    const seen = new Set();
    for (const entry of entries) {
        if (!entry || entry.enabled === false) continue;
        const tgt = String(entry.canonical || entry.tgt || entry.target || entry.to || '').trim();
        if (!tgt) continue;
        const sources = [];
        const explicit = entry.source || entry.mtSource || entry.src || entry.from;
        if (explicit) sources.push(String(explicit).trim());
        if (Array.isArray(entry.aliases)) {
            for (const a of entry.aliases) {
                const s = String(a || '').trim();
                if (s) sources.push(s);
            }
        }
        for (const src of sources) {
            if (!src || src === tgt) continue;
            const key = `${src.toLowerCase()}\0${tgt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ src, tgt });
        }
    }
    return pairs;
}

/**
 * Opus MT uses Engine protect → restore → enforce with `__GLOSS*__` placeholders.
 * Chat LLM backends (Sakura / smart) should receive clean Japanese + a prompt
 * glossary, matching the subtitle editor — placeholders degrade LLM quality.
 * @param {{ sakuraOrSmart?: boolean }} [ctx]
 * @returns {'protect'|'prompt'}
 */
function resolveEngineMtGlossaryMode(ctx = {}) {
    return ctx.sakuraOrSmart ? 'prompt' : 'protect';
}

/**
 * Optional job flags derived from saved options.
 * @param {object} merged
 * @param {{ sakuraOrSmart?: boolean }} [ctx]
 */
function buildEngineJobFlags(merged = {}, ctx = {}) {
    const sakuraOrSmart = !!ctx.sakuraOrSmart;
    const releaseGpuAfter = merged.releaseGpuAfter != null
        ? !!merged.releaseGpuAfter
        : sakuraOrSmart;
    const karaokeVtt = !!merged.karaokeVtt;
    const includeWords = !!merged.includeWords || karaokeVtt;
    return {
        releaseGpuAfter,
        includeWords,
        karaokeVtt,
        mtGlossaryMode: resolveEngineMtGlossaryMode({ sakuraOrSmart }),
    };
}

/**
 * Build Engine job fields for `mtBackend: "external"`.
 * @param {{ url: string, token?: string, timeoutSec?: number, batchSize?: number, headers?: object }} cfg
 * @returns {{ mtBackend: 'external', mtExternal: object } | null}
 */
function buildExternalMtJobFields(cfg = {}) {
    const url = String(cfg.url || '').trim();
    if (!url) return null;
    const headers = cfg.headers && typeof cfg.headers === 'object'
        ? { ...cfg.headers }
        : {};
    const token = String(cfg.token || '').trim();
    if (token && !headers.Authorization && !headers.authorization) {
        headers.Authorization = `Bearer ${token}`;
    }
    const timeoutSec = Number(cfg.timeoutSec);
    const batchSize = Number(cfg.batchSize);
    return {
        mtBackend: 'external',
        mtExternal: {
            url,
            timeoutSec: Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : 600,
            batchSize: Number.isFinite(batchSize) && batchSize >= 1 ? Math.floor(batchSize) : 8,
            headers,
        },
    };
}

module.exports = {
    ENGINE_SUB_FORMATS,
    normalizeEngineSubFormatsList,
    resolveEngineSubFormats,
    buildEngineGlossaryPairs,
    resolveEngineMtGlossaryMode,
    buildEngineJobFlags,
    buildExternalMtJobFields,
};
