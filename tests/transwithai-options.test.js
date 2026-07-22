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
        assert.ok(opts.installPath);
    });

    it('preserves dual task and dual fields', () => {
        const opts = mergeTransWithAiOptions({
            task: 'dual',
            dualTargetSuffix: 'zh',
            mergeBilingualSubtitles: true,
        });
        assert.strictEqual(opts.task, 'dual');
        assert.strictEqual(opts.dualTargetSuffix, 'zh');
        assert.strictEqual(opts.mergeBilingualSubtitles, true);
        assert.strictEqual(opts.deleteSourcesAfterMergeBilingual, false);
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
});
