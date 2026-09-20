'use strict';

const assert = require('assert');
const { createStartReadinessUi } = require('../src/js/start-readiness-ui-core.js');

describe('TransubStartReadinessUi', () => {
    it('exports createStartReadinessUi', () => {
        assert.strictEqual(typeof createStartReadinessUi, 'function');
    });

    it('updateStartHint sets title from block reason', () => {
        const attrs = {};
        const els = {
            startBtn: {
                disabled: false,
                title: '',
                classList: { contains: () => false },
                setAttribute(k, v) { attrs[k] = v; },
            },
        };
        const ui = createStartReadinessUi({
            els,
            computeStartBlockReason: () => '请先添加媒体文件',
        });
        ui.updateStartHint();
        assert.strictEqual(els.startBtn.title, '请先添加媒体文件');
        assert.strictEqual(attrs['aria-disabled'], 'true');
    });

    it('updateStartHint clears aria-disabled when start is free', () => {
        const attrs = {};
        const els = {
            startBtn: {
                disabled: false,
                title: '',
                classList: { contains: () => false },
                setAttribute(k, v) { attrs[k] = v; },
            },
        };
        const ui = createStartReadinessUi({
            els,
            computeStartBlockReason: () => '',
        });
        ui.updateStartHint();
        assert.strictEqual(els.startBtn.title, '开始执行选中条目');
        assert.strictEqual(attrs['aria-disabled'], 'false');
    });

    it('retryAllFailedItems resets failed rows and selects them', () => {
        let rendered = 0;
        let toast = '';
        const state = {
            running: false,
            items: [
                { status: 'failed', progress: 40, detail: 'x', error: 'e', selected: false },
                { status: 'done', progress: 100, selected: false },
            ],
        };
        const ui = createStartReadinessUi({
            state,
            renderList: () => { rendered += 1; },
            updateStartButton: () => {},
            showToast: (m) => { toast = m; },
            uiTf: (s, p) => s.replace('{count}', String(p.count)),
        });
        ui.retryAllFailedItems();
        assert.strictEqual(state.items[0].status, 'ready');
        assert.strictEqual(state.items[0].selected, true);
        assert.strictEqual(state.items[1].status, 'done');
        assert.ok(rendered >= 1);
        assert.ok(toast.includes('1'));
    });

    it('clearStaleComputeBusyIfNeeded force-releases when idle+busy', async () => {
        const state = {
            running: false,
            postBatchBusy: false,
            retranslateBusy: false,
            computeBusy: true,
            computeBusyLabel: '旧任务',
            computeBusySince: 1,
            computeBusyOwner: 'x',
            computeBusyKind: 'y',
        };
        let released = false;
        const ui = createStartReadinessUi({
            state,
            electron: {
                async transubComputeTaskForceRelease() {
                    released = true;
                    return { ok: true, released: true };
                },
            },
            startReadinessApi: {
                shouldForceReleaseStaleComputeLock: () => true,
            },
            syncComputeBusyFromMain: async () => true,
            updateStartButton: () => {},
            updateStopButton: () => {},
        });
        const res = await ui.clearStaleComputeBusyIfNeeded();
        assert.strictEqual(res.cleared, true);
        assert.strictEqual(state.computeBusy, false);
        assert.ok(released);
    });

    it('clearStaleComputeBusyIfNeeded clears stuck running when main is idle', async () => {
        const state = {
            running: true,
            postBatchBusy: true,
            retranslateBusy: false,
            batchStartInFlight: true,
            computeBusy: false,
            engineBatchRunning: false,
            computeBusyLabel: '',
            computeBusySince: 0,
            computeBusyOwner: '',
            computeBusyKind: '',
            items: [{ status: 'running', path: 'a.mp4' }],
        };
        let rendered = 0;
        const ui = createStartReadinessUi({
            state,
            startReadinessApi: {
                shouldForceReleaseStaleComputeLock: () => false,
                shouldClearStuckSubtitleTaskFlags: (s) => !!(s.running || s.postBatchBusy)
                    && !s.computeBusy && !s.batchRunning,
            },
            syncComputeBusyFromMain: async () => {
                state.engineBatchRunning = false;
                return false;
            },
            updateStartButton: () => {},
            updateStopButton: () => {},
            renderList: () => { rendered += 1; },
        });
        const res = await ui.clearStaleComputeBusyIfNeeded();
        assert.strictEqual(res.cleared, false);
        assert.strictEqual(state.running, false);
        assert.strictEqual(state.postBatchBusy, false);
        assert.strictEqual(state.batchStartInFlight, false);
        assert.ok(rendered >= 1);
    });
});
