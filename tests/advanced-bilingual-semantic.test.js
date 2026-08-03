const assert = require('assert');
const {
    parseIssues,
    buildMessages,
} = require('../electron/advanced-bilingual-semantic');

describe('advanced-bilingual-semantic', () => {
    it('parses suggestedTarget from model JSON', () => {
        const issues = parseIssues(JSON.stringify({
            issues: [
                {
                    index: 1,
                    type: 'mistranslation',
                    message: '语气不符',
                    severity: 'warn',
                    suggestedTarget: '请坐。',
                },
                {
                    index: 2,
                    type: 'omission',
                    message: '漏译',
                    suggestion: '补上这句',
                },
            ],
        }));
        assert.strictEqual(issues.length, 2);
        assert.strictEqual(issues[0].suggestedTarget, '请坐。');
        assert.strictEqual(issues[1].suggestedTarget, '补上这句');
    });

    it('requests suggestedTarget when suggestFixes enabled', () => {
        const msgs = buildMessages([{ index: 0, source: 'a', target: 'b' }], '', { suggestFixes: true });
        assert.ok(msgs[0].content.includes('suggestedTarget'));
        const reportOnly = buildMessages([{ index: 0, source: 'a', target: 'b' }], '', { suggestFixes: false });
        assert.ok(!reportOnly[0].content.includes('suggestedTarget'));
    });
});
