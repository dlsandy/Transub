/**
 * Subtitle editor — QC summary bar / issue list HTML (pure).
 */
(function (global) {
    const utils = (global.TransubEditorParts && global.TransubEditorParts.utils) || {};
    const esc = typeof utils.esc === 'function'
        ? utils.esc
        : (s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const QC_ISSUE_TYPE_DEFS = Object.freeze([
        { type: 'overlap', countKey: 'overlap', label: '重叠' },
        { type: 'high_cps', countKey: 'highCps', label: '读速' },
        { type: 'splittable', countKey: 'splittable', label: '可分割' },
        { type: 'connected', countKey: 'connected', label: '连续文本' },
        { type: 'repetition', countKey: 'repetition', label: '叠词' },
        { type: 'duplicate', countKey: 'duplicate', label: '连续重复' },
        { type: 'fluency', countKey: 'fluency', label: '通顺度', warn: true },
        { type: 'short', countKey: 'short', label: '过短' },
        { type: 'long', countKey: 'long', label: '过长' },
        { type: 'invalid', countKey: 'invalid', label: '无效' },
    ]);

    function filterIssuesByType(issues, typeFilter) {
        return typeFilter
            ? (issues || []).filter((i) => (i.types || []).includes(typeFilter))
            : (issues || []);
    }

    function qcChipClass(extra, active) {
        return `qc-chip${extra ? ` ${extra}` : ''}${active ? ' active' : ''}`;
    }

    /**
     * @param {object|null} summary scan summary counts
     * @param {string|null} typeFilter
     * @returns {{ html: string, nextFilter: string|null }}
     */
    function buildQcSummaryBarHtml(summary, typeFilter) {
        if (!summary?.total) {
            return {
                html: '<span class="qc-chip ok">未发现问题</span>',
                nextFilter: null,
            };
        }
        let nextFilter = typeFilter || null;
        if (nextFilter && !QC_ISSUE_TYPE_DEFS.some(
            (a) => a.type === nextFilter && summary[a.countKey] > 0,
        )) {
            nextFilter = null;
        }
        const chips = [
            `<button type="button" class="${qcChipClass('warn', nextFilter == null)}" data-qc-type="" title="显示全部问题">问题 ${summary.total}</button>`,
        ];
        for (const a of QC_ISSUE_TYPE_DEFS) {
            const o = summary[a.countKey] || 0;
            if (!o) continue;
            const l = nextFilter === a.type;
            chips.push(
                `<button type="button" class="${qcChipClass(a.warn ? 'warn' : '', l)}" data-qc-type="${a.type}" title="只看${a.label}">${a.label} ${o}</button>`,
            );
        }
        return { html: chips.join(''), nextFilter };
    }

    /**
     * @param {Array} issues
     * @param {{ emptyHint?: string, limit?: number }} [opts]
     */
    function buildQcIssueListHtml(issues, { emptyHint = '', limit = 40 } = {}) {
        if (!issues?.length) {
            return emptyHint
                ? `<div class="qc-issue-item" style="cursor:default;color:rgb(156 163 175);">${esc(emptyHint)}</div>`
                : '';
        }
        const i = Math.max(1, Number(limit) || 40);
        const rows = issues.slice(0, i).map((a) => {
            const o = esc((a.messages || []).join(' · '));
            const l = esc(a.textPreview || '—');
            return `<button type="button" class="qc-issue-item" data-qc-idx="${a.index}" role="listitem"><span class="qc-issue-idx">#${a.index + 1}</span><span class="qc-issue-msg">${o}</span><span class="qc-issue-text">${l}</span></button>`;
        });
        if (issues.length > i) {
            rows.push(
                `<div class="qc-issue-item" style="cursor:default;color:rgb(156 163 175);">还有 ${issues.length - i} 条未列出</div>`,
            );
        }
        return rows.join('');
    }

    function findIssueTypeDef(type) {
        return QC_ISSUE_TYPE_DEFS.find((d) => d.type === type) || null;
    }

    /**
     * Toggle filter: null clears; same type clears; else set.
     */
    function nextQcTypeFilter(current, clicked) {
        const r = clicked == null || clicked === '' ? null : String(clicked);
        if (r == null) return null;
        return current === r ? null : r;
    }

    const api = {
        QC_ISSUE_TYPE_DEFS,
        filterIssuesByType,
        qcChipClass,
        buildQcSummaryBarHtml,
        buildQcIssueListHtml,
        findIssueTypeDef,
        nextQcTypeFilter,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.qcSummaryUi = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
