const assert = require('assert');
const qc = require('../src/js/subtitle-editor/qc-summary-ui');

describe('qc-summary-ui', () => {
    it('empty summary clears filter', () => {
        const built = qc.buildQcSummaryBarHtml({ total: 0 }, 'overlap');
        assert.strictEqual(built.nextFilter, null);
        assert.ok(built.html.includes('未发现问题'));
    });

    it('builds type chips and keeps active filter', () => {
        const built = qc.buildQcSummaryBarHtml({
            total: 5,
            overlap: 2,
            highCps: 3,
        }, 'overlap');
        assert.strictEqual(built.nextFilter, 'overlap');
        assert.ok(built.html.includes('重叠 2'));
        assert.ok(built.html.includes('读速 3'));
        assert.ok(built.html.includes('active'));
    });

    it('filterIssuesByType and issue list HTML', () => {
        const issues = [
            { index: 0, types: ['overlap'], messages: ['a'], textPreview: '你好' },
            { index: 1, types: ['high_cps'], messages: ['b'], textPreview: 'x' },
        ];
        assert.strictEqual(qc.filterIssuesByType(issues, 'overlap').length, 1);
        const html = qc.buildQcIssueListHtml(issues, { limit: 1 });
        assert.ok(html.includes('#1'));
        assert.ok(html.includes('还有 1 条'));
    });

    it('nextQcTypeFilter toggles', () => {
        assert.strictEqual(qc.nextQcTypeFilter(null, 'overlap'), 'overlap');
        assert.strictEqual(qc.nextQcTypeFilter('overlap', 'overlap'), null);
        assert.strictEqual(qc.nextQcTypeFilter('overlap', ''), null);
    });
});
