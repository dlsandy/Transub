const assert = require('assert');
const n = require('../src/js/settings-options-normalize-core');

describe('settings-options-normalize-core', () => {
    it('normalizes modes and variants', () => {
        assert.strictEqual(n.normalizePostBatchQcFixMode('SMART'), 'smart');
        assert.strictEqual(n.normalizePostBatchQcFixMode('x'), 'none');
        assert.strictEqual(n.normalizeViewingCleanMode('light'), 'light');
        assert.strictEqual(n.normalizeViewingCleanMode('nope', 'off'), 'off');
        assert.strictEqual(n.normalizeChineseSubtitleVariant('traditional-hk'), 'traditional-hk');
        assert.ok(n.chineseSubtitleVariantLabel('simplified').includes('简'));
        assert.strictEqual(n.normalizeUiLocale('zh-TW'), 'zh-Hant-TW');
        assert.strictEqual(n.normalizeUiLocale(''), 'zh-Hans');
    });

    it('clamps numeric fields', () => {
        assert.strictEqual(n.clampVadMaxSingleSegmentMs('1000'), 5000);
        assert.strictEqual(n.clampVadMaxSingleSegmentMs('90000'), 60000);
        assert.strictEqual(n.clampVadMaxSingleSegmentMs(''), 30000);
        assert.strictEqual(n.clampHallucinationSilenceThreshold(''), null);
        assert.strictEqual(n.clampHallucinationSilenceThreshold('0.05'), 0.1);
        assert.strictEqual(n.clampTranscriptKeepLimit('99999'), 9999);
        assert.strictEqual(n.clampTranscriptKeepDays('x'), 90);
    });

    it('resolveEngineMtModelForPersist by mode', () => {
        assert.strictEqual(n.resolveEngineMtModelForPersist('smart', 'opus', 'sakura'), '');
        assert.strictEqual(n.resolveEngineMtModelForPersist('llm', 'opus', 'sakura-1.5b'), 'sakura-1.5b');
        assert.strictEqual(n.resolveEngineMtModelForPersist('engine', 'opus-mt-ja-zh', 'sakura'), 'opus-mt-ja-zh');
    });

    it('viewingCleanModesToLegacyFlags', () => {
        const a = n.viewingCleanModesToLegacyFlags('off', 'light', 'light');
        assert.strictEqual(a.postBatchSimplifyViewingPunctuation, false);
        assert.strictEqual(a.postBatchCompactPureInterjections, false);
        const b = n.viewingCleanModesToLegacyFlags('clear', 'clear', 'off');
        assert.strictEqual(b.postBatchSimplifyViewingPunctuation, true);
        assert.strictEqual(b.postBatchCompactPureInterjections, true);
    });
});
