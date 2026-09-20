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

    it('computeSelectAllState reflects row selection', () => {
        assert.deepStrictEqual(row.computeSelectAllState([]), { checked: false, indeterminate: false });
        const items = [{ selected: true }, { selected: true }];
        assert.deepStrictEqual(row.computeSelectAllState(items), { checked: true, indeterminate: false });
        items[0].selected = false;
        assert.deepStrictEqual(row.computeSelectAllState(items), { checked: false, indeterminate: true });
        items[1].selected = false;
        assert.deepStrictEqual(row.computeSelectAllState(items), { checked: false, indeterminate: false });
    });

    it('describeSelectAllToolbar mirrors selection state with checkbox icons', () => {
        assert.deepStrictEqual(row.describeSelectAllToolbar({ checked: false, indeterminate: false }), {
            iconClass: 'fa fa-square-o',
            title: '全选 (Ctrl+A)',
            ariaLabel: '全选',
            ariaChecked: 'false',
        });
        assert.deepStrictEqual(row.describeSelectAllToolbar({ checked: false, indeterminate: true }), {
            iconClass: 'fa fa-minus-square-o',
            title: '全选 (Ctrl+A)',
            ariaLabel: '全选',
            ariaChecked: 'mixed',
        });
        assert.deepStrictEqual(row.describeSelectAllToolbar({ checked: true, indeterminate: false }), {
            iconClass: 'fa fa-check-square',
            title: '取消全选 (Ctrl+A)',
            ariaLabel: '取消全选',
            ariaChecked: 'true',
        });
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
        assert.ok(html.includes('data-execute-idx="0"'));
        assert.ok(html.includes('fa-play'));
        assert.ok(!html.includes('data-play-idx'));
        assert.ok(!html.includes('col-cues'));
        assert.ok(!html.includes('data-burn-idx'));
    });

    it('buildListRowHtml shows burn action when done', () => {
        const html = row.buildListRowHtml({
            path: 'D:/a/video.mp4',
            status: 'done',
            selected: false,
        }, 3, {
            esc: (s) => String(s ?? ''),
            basename: (p) => String(p).split(/[/\\]/).pop(),
            normPath: (p) => String(p).toLowerCase(),
            formatDuration: () => '—',
            revealPath: 'D:/a/video.srt',
            subPath: 'D:/a/video.srt',
            autoOn: false,
        });
        assert.ok(html.includes('data-burn-idx="3"'));
        assert.ok(html.includes('fa-fire'));
    });

    it('buildListRowHtml omits sense badges when auto-sense removed', () => {
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
        assert.ok(!html.includes('data-sense-resense="2"'));
        assert.ok(!html.includes('fa-magic'));
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

    it('buildStyleBadgeHtml always shows effective style label', () => {
        globalThis.TransubTranslateStyle = require('../src/js/translate-style-core');
        const follow = row.buildStyleBadgeHtml({}, {
            esc: (s) => String(s ?? ''),
            globalPreset: 'news_narration',
            styleApi: globalThis.TransubTranslateStyle,
            idx: 2,
        });
        assert.ok(follow.includes('row-style-badge-label">默认</span>'));
        assert.ok(follow.includes('fa-font'));
        assert.ok(follow.includes('is-global'));
        assert.ok(follow.includes('data-translate-style-idx="2"'));
        assert.ok(follow.includes('<button'));
        const override = row.buildStyleBadgeHtml({ translateStylePreset: 'web_slang' }, {
            esc: (s) => String(s ?? ''),
            globalPreset: 'natural_spoken',
            styleApi: globalThis.TransubTranslateStyle,
            idx: 0,
        });
        assert.ok(override.includes('row-style-badge-label">网感口语</span>'));
        assert.ok(override.includes('fa-font'));
        assert.ok(override.includes('is-override'));
        assert.ok(override.includes('data-translate-style-idx="0"'));
        const hidden = row.buildStyleBadgeHtml({}, {
            esc: (s) => String(s ?? ''),
            globalPreset: 'natural_spoken',
            styleApi: globalThis.TransubTranslateStyle,
            styleEnabled: false,
            idx: 1,
        });
        assert.strictEqual(hidden, '');
        delete globalThis.TransubTranslateStyle;
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

    it('buildProgressCellHtml shows stage hint while running', () => {
        const html = row.buildProgressCellHtml({
            status: 'running',
            progress: 4,
            stage: 'model',
            detail: '加载模型 · 创建引擎任务',
        }, { esc: (s) => String(s ?? '') });
        assert.ok(html.includes('加载'));
        assert.ok(html.includes('4%'));
    });

    it('buildQcCellHtml hides issues after completion', () => {
        const html = row.buildQcCellHtml({
            status: 'done',
            qcIssueCount: 5,
            qcSummary: '5 项问题',
        }, { esc: (s) => String(s ?? ''), idx: 0 });
        assert.ok(html.includes('—'));
        assert.ok(!html.includes('data-qc-open'));
        assert.ok(!html.includes('5'));
    });
});
