/**
 * Summarize JA ASR domain-fix rewrites for logs / diagnostics.
 */

function normalizePair(from, to) {
    return {
        from: String(from || ''),
        to: String(to || ''),
    };
}

/**
 * @param {Array<{ from?: string, to?: string, count?: number }|string>} changes
 * @param {string} stage e.g. engine_d01 | desktop_pre_mt | desktop_sanitize
 */
function summarizeDomainFixChanges(changes, stage = 'desktop') {
    const list = Array.isArray(changes) ? changes : [];
    const byKey = new Map();
    for (const item of list) {
        let from = '';
        let to = '';
        let count = 1;
        if (typeof item === 'string') {
            from = item;
        } else if (item && typeof item === 'object') {
            from = String(item.from || item.before || '');
            to = String(item.to || item.after || '');
            count = Math.max(1, Number(item.count) || 1);
        }
        if (!from && !to) continue;
        const key = `${from}\u0000${to}`;
        const prev = byKey.get(key) || { ...normalizePair(from, to), count: 0 };
        prev.count += count;
        byKey.set(key, prev);
    }
    const pairs = [...byKey.values()].sort((a, b) => b.count - a.count);
    const total = pairs.reduce((n, p) => n + p.count, 0);
    return {
        stage: String(stage || 'desktop'),
        total,
        unique: pairs.length,
        pairs,
        summary: total
            ? `${stage}: ${total} 处域修正（${pairs.length} 种）`
            : `${stage}: 无域修正`,
    };
}

/**
 * Merge multiple stage summaries into one diagnostics-friendly object.
 */
function mergeDomainFixTraces(traces = []) {
    const list = (Array.isArray(traces) ? traces : []).filter(Boolean);
    const stages = list.map((t) => ({
        stage: t.stage,
        total: t.total || 0,
        unique: t.unique || 0,
        summary: t.summary || '',
        pairs: Array.isArray(t.pairs) ? t.pairs.slice(0, 40) : [],
    }));
    const total = stages.reduce((n, s) => n + (s.total || 0), 0);
    return {
        total,
        stages,
        summary: total
            ? `域修正合计 ${total} 处（${stages.length} 阶段）`
            : '无域修正记录',
    };
}

function formatDomainFixLogLine(trace) {
    if (!trace || !trace.total) return '';
    const top = (trace.pairs || []).slice(0, 3)
        .map((p) => `"${p.from}"→"${p.to}"×${p.count}`)
        .join('；');
    return `[asr-domain] ${trace.summary}${top ? ` · ${top}` : ''}`;
}

module.exports = {
    summarizeDomainFixChanges,
    mergeDomainFixTraces,
    formatDomainFixLogLine,
};
