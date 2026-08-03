const assert = require('assert');
const {
    mergeTransWithAiOptions,
    stripPostTaskFields,
    normalizePostTaskOptions,
} = require('../electron/transwithai-options');

describe('transwithai-options', () => {
    it('merges defaults for empty input', () => {
        const opts = mergeTransWithAiOptions({});
        assert.strictEqual(opts.task, 'translate');
        assert.strictEqual(opts.device, 'cuda');
        assert.strictEqual(opts.postTaskAction, 'none');
        assert.strictEqual(opts.startupWindow, 'generator');
        assert.ok(opts.installPath);
    });

    it('normalizes startupWindow preference', () => {
        assert.strictEqual(mergeTransWithAiOptions({ startupWindow: 'editor' }).startupWindow, 'editor');
        assert.strictEqual(
            mergeTransWithAiOptions({ startupWindow: 'subtitle-editor' }).startupWindow,
            'editor',
        );
        assert.strictEqual(mergeTransWithAiOptions({ startupWindow: 'generator' }).startupWindow, 'generator');
        assert.strictEqual(mergeTransWithAiOptions({ startupWindow: 'nope' }).startupWindow, 'generator');
    });

    it('normalizes autoUpdateCheckInterval preference', () => {
        assert.strictEqual(
            mergeTransWithAiOptions({}).autoUpdateCheckInterval,
            'weekly',
        );
        assert.strictEqual(
            mergeTransWithAiOptions({ autoUpdateCheckInterval: 'daily' }).autoUpdateCheckInterval,
            'daily',
        );
        assert.strictEqual(
            mergeTransWithAiOptions({ autoUpdateCheckInterval: 'off' }).autoUpdateCheckInterval,
            'off',
        );
        assert.strictEqual(
            mergeTransWithAiOptions({ autoUpdateCheckInterval: 'WEEKLY' }).autoUpdateCheckInterval,
            'weekly',
        );
        assert.strictEqual(
            mergeTransWithAiOptions({ autoUpdateCheckInterval: 'monthly' }).autoUpdateCheckInterval,
            'monthly',
        );
        assert.strictEqual(
            mergeTransWithAiOptions({ autoUpdateCheckInterval: 'hourly' }).autoUpdateCheckInterval,
            'weekly',
        );
    });

    it('preserves dual task and dual fields', () => {
        const opts = mergeTransWithAiOptions({
            task: 'dual',
            dualTargetSuffix: 'zh',
            mergeBilingualSubtitles: true,
            dualLineOrder: 'source-first',
        });
        assert.strictEqual(opts.task, 'dual');
        assert.strictEqual(opts.dualTargetSuffix, 'zh');
        assert.strictEqual(opts.mergeBilingualSubtitles, true);
        assert.strictEqual(opts.deleteSourcesAfterMergeBilingual, false);
        assert.strictEqual(opts.dualLineOrder, 'source-first');
    });

    it('preserves delete-sources-after-merge flag', () => {
        const opts = mergeTransWithAiOptions({
            task: 'dual',
            mergeBilingualSubtitles: true,
            deleteSourcesAfterMergeBilingual: true,
        });
        assert.strictEqual(opts.deleteSourcesAfterMergeBilingual, true);
    });

    it('strips post-task fields', () => {
        const stripped = stripPostTaskFields({
            task: 'translate',
            postTaskAction: 'quit',
            sleepOnComplete: true,
        });
        assert.strictEqual(stripped.task, 'translate');
        assert.strictEqual(stripped.postTaskAction, undefined);
        assert.strictEqual(stripped.sleepOnComplete, undefined);
    });

    it('normalizes legacy post-task flags into action', () => {
        const n = normalizePostTaskOptions({ sleepOnComplete: true });
        assert.strictEqual(n.postTaskAction, 'sleep');
        assert.strictEqual(n.sleepOnComplete, true);
    });

    it('clears sticky sleep/open_folder when action is none', () => {
        const n = normalizePostTaskOptions({
            postTaskAction: 'none',
            sleepOnComplete: true,
            openOutputFolderOnComplete: true,
        });
        assert.strictEqual(n.postTaskAction, 'none');
        assert.strictEqual(n.sleepOnComplete, false);
        assert.strictEqual(n.openOutputFolderOnComplete, false);
    });

    it('derives open_folder strictly from action', () => {
        const n = normalizePostTaskOptions({
            postTaskAction: 'quit',
            openOutputFolderOnComplete: true,
            sleepOnComplete: true,
        });
        assert.strictEqual(n.postTaskAction, 'quit');
        assert.strictEqual(n.openOutputFolderOnComplete, false);
        assert.strictEqual(n.sleepOnComplete, false);
        assert.strictEqual(n.quitAppOnComplete, true);
    });
});

describe('transwithai-bridge post-task export', () => {
    it('exports runPostSubtitleTaskActions for engine path', () => {
        const bridge = require('../electron/transwithai-bridge');
        assert.strictEqual(typeof bridge.runPostSubtitleTaskActions, 'function');
        assert.strictEqual(typeof bridge.setSessionPostTaskOptions, 'function');
        assert.strictEqual(typeof bridge.deferBatchFinalize, 'function');
        assert.strictEqual(typeof bridge.flushDeferredBatchFinalize, 'function');
    });

    it('keeps session shutdown when lastOutputDir is updated', () => {
        const bridge = require('../electron/transwithai-bridge');
        bridge.resetSessionPostTaskOptions();
        bridge.setSessionPostTaskOptions({
            postTaskAction: 'shutdown',
            shutdownOnComplete: true,
            quitAppOnComplete: true,
            shutdownDelaySec: 30,
        });
        bridge.setSessionPostTaskOptions({ lastOutputDir: 'F:\\out' });
        const session = bridge.getSessionPostTaskOptions();
        assert.strictEqual(session.postTaskAction, 'shutdown');
        assert.strictEqual(session.shutdownOnComplete, true);
        assert.strictEqual(session.lastOutputDir, 'F:\\out');
        bridge.resetSessionPostTaskOptions();
    });
});
