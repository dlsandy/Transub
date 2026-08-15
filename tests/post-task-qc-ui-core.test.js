const assert = require('assert');
const ui = require('../src/js/post-task-qc-ui-core');

describe('post-task-qc-ui-core', () => {
    it('normalizes post-task actions and builds options', () => {
        assert.strictEqual(ui.normalizePostTaskAction('nope'), 'none');
        assert.ok(ui.postTaskActionLabel('quit').includes('退出'));
        const quit = ui.buildPostTaskOptionsFromAction('quit', { playSoundOnComplete: true });
        assert.strictEqual(quit.quitAppOnComplete, true);
        assert.strictEqual(quit.playSoundOnComplete, true);
        const shut = ui.buildPostTaskOptionsFromAction('shutdown', { shutdownDelaySec: 30 });
        assert.strictEqual(shut.shutdownOnComplete, true);
        assert.strictEqual(shut.shutdownDelaySec, 30);
    });

    it('counts / marks / clears QC fixed', () => {
        assert.strictEqual(ui.countQcIssues([{ qcIssueCount: 2 }, { qcIssueCount: 0 }]), 1);
        const item = {};
        ui.markItemQcFixed(item, 'smart', { written: true, summary: 'ok', now: 123 });
        assert.strictEqual(item.qcFixedMode, 'smart');
        assert.strictEqual(item.qcFixedAt, 123);
        ui.clearItemQcFixed(item, { clearScan: true });
        assert.strictEqual(item.qcFixedMode, '');
        assert.strictEqual(item.qcIssueCount, undefined);
    });

    it('buildQcBannerViewModel matrix', () => {
        assert.strictEqual(ui.buildQcBannerViewModel({ issueCount: 0 }).visible, false);
        assert.strictEqual(ui.buildQcBannerViewModel({ issueCount: 2, dismissed: true }).visible, false);
        const idle = ui.buildQcBannerViewModel({
            issueCount: 3,
            advancedEntitled: true,
            smartFixAvailable: true,
        });
        assert.strictEqual(idle.visible, true);
        assert.strictEqual(idle.smartVisible, true);
        assert.ok(idle.text.includes('3 条'));
        const fixing = ui.buildQcBannerViewModel({
            issueCount: 3,
            fixing: true,
            smartFixing: true,
            advancedEntitled: true,
            smartFixAvailable: true,
        });
        assert.ok(fixing.text.includes('智能'));
        assert.strictEqual(fixing.smartLabel, '智能修复中…');
    });
});
