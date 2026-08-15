const assert = require('assert');
const row = require('../src/js/task-list-row-core');

describe('task-list-row-core', () => {
    it('statusMeta maps known statuses', () => {
        assert.strictEqual(row.statusMeta('ready').label, '就绪');
        assert.strictEqual(row.statusMeta('running').cls, 'row-status-running');
        assert.ok(row.statusMeta('weird').label);
    });

    it('qcFixedTagHtml for smart/fix', () => {
        const esc = (s) => String(s).replace(/"/g, '&quot;');
        assert.strictEqual(row.qcFixedTagHtml({}, esc), '');
        const html = row.qcFixedTagHtml({ qcFixedMode: 'smart', qcFixedSummary: 'ok' }, esc);
        assert.ok(html.includes('Pro修'));
        assert.ok(html.includes('is-smart'));
    });

    it('buildListRowHtml includes path and status', () => {
        const html = row.buildListRowHtml({
            path: 'D:/a/video.mp4',
            status: 'ready',
            selected: true,
            duration: 65,
        }, 0, {
            esc: (s) => String(s ?? ''),
            basename: (p) => String(p).split(/[/\\]/).pop(),
            normPath: (p) => String(p).toLowerCase(),
            formatDuration: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
            revealPath: 'D:/a/video.mp4',
            autoOn: true,
        });
        assert.ok(html.includes('data-idx="0"'));
        assert.ok(html.includes('video.mp4'));
        assert.ok(html.includes('row-status-ready'));
        assert.ok(html.includes('1:05'));
    });

    it('buildListRowHtml sense error tip', () => {
        const html = row.buildListRowHtml({
            path: 'x.mp4',
            status: 'ready',
            sense: {
                status: 'error',
                adopted: false,
                message: 'fail',
                recovery: { shortTip: '可：深度感知' },
            },
        }, 2, { esc: (s) => String(s ?? ''), autoOn: true });
        assert.ok(html.includes('data-sense-resense="2"'));
        assert.ok(html.includes('深度感知') || html.includes('感知失败'));
    });

    it('buildListRowHtml batch recovery chips on failed row', () => {
        globalThis.TransubBatchRecovery = require('../src/js/batch-recovery-core');
        const recovery = globalThis.TransubBatchRecovery.buildBatchFailureGuidance({
            message: '任务长时间无响应',
            code: 'idle_timeout',
        });
        const html = row.buildListRowHtml({
            path: 'y.mp4',
            status: 'failed',
            error: '任务长时间无响应',
            recovery,
        }, 1, { esc: (s) => String(s ?? ''), running: false });
        assert.ok(html.includes('data-batch-recover="retry-item"'));
        assert.ok(html.includes('file-batch-recover'));
        delete globalThis.TransubBatchRecovery;
    });

    it('buildAsrRunBadgeHtml for done failover', () => {
        const badge = row.buildAsrRunBadgeHtml({
            status: 'done',
            asrModel: 'whisper-tiny',
            primaryAsr: 'sensevoice-small',
            asrFailedOver: true,
        }, (s) => String(s));
        assert.ok(badge.includes('row-asr-badge'));
        assert.ok(badge.includes('is-failover'));
        assert.ok(badge.includes('whisper-tiny'));
        assert.strictEqual(row.buildAsrRunBadgeHtml({ status: 'ready' }, (s) => s), '');
    });
});
