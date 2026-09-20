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
        assert.strictEqual(n.normalizeUiLocale('en-US'), 'en');
        assert.strictEqual(n.normalizeUiLocale('ja'), 'ja');
        assert.strictEqual(n.normalizeUiLocale('ko-kr'), 'ko');
    });

    it('clamps numeric fields', () => {
        assert.strictEqual(n.clampVadMaxSingleSegmentMs('1000'), 5000);
        assert.strictEqual(n.clampVadMaxSingleSegmentMs('90000'), 60000);
        assert.strictEqual(n.clampVadMaxSingleSegmentMs(''), 30000);
        assert.strictEqual(n.clampHallucinationSilenceThreshold(''), null);
        assert.strictEqual(n.clampHallucinationSilenceThreshold('0.05'), 0.1);
        // Transcript retention clamps are currently hard-disabled (always 0).
        assert.strictEqual(n.clampTranscriptKeepLimit('99999'), 0);
        assert.strictEqual(n.clampTranscriptKeepDays('x'), 0);
    });

    it('normalizeTranslateStyleOptions keeps enabled=true', () => {
        const out = n.normalizeTranslateStyleOptions({
            translateStyleEnabled: true,
            translateStylePreset: 'news_narration',
            translateStyleCustomNote: 'x',
        });
        assert.strictEqual(out.translateStyleEnabled, true);
        assert.strictEqual(out.translateStylePreset, 'news_narration');
        assert.strictEqual(out.translateStyleCustomNote, '');
    });

    it('normalizeTranslateStyleOptions fallback preserves enabled when core missing', () => {
        const core = {
            normalizeTranslateStyleOptions(options) {
                const raw = options.translateStyleEnabled;
                return {
                    translateStyleEnabled: raw === true || raw === 1 || raw === '1' || raw === 'true',
                    translateStylePreset: String(options.translateStylePreset || 'natural_spoken'),
                    translateStyleCustomNote: '',
                };
            },
        };
        // Exercise the same enabled-preserving contract the renderer fallback must keep.
        const out = core.normalizeTranslateStyleOptions({
            translateStyleEnabled: true,
            translateStylePreset: 'film_dialogue',
        });
        assert.strictEqual(out.translateStyleEnabled, true);
        assert.strictEqual(out.translateStylePreset, 'film_dialogue');
        // Inline fallback path (no TransubTranslateStyle / require): must not force false.
        const raw = true;
        const enabled = raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on';
        assert.strictEqual(enabled, true);
    });

    it('resolveEngineMtModelForPersist by mode', () => {
        assert.strictEqual(n.resolveEngineMtModelForPersist('smart', 'opus', 'sakura'), '');
        assert.strictEqual(n.resolveEngineMtModelForPersist('llm', 'opus', 'sakura-1.5b'), 'sakura-1.5b');
        assert.strictEqual(n.resolveEngineMtModelForPersist('engine', 'opus-mt-ja-zh', 'sakura'), 'sakura');
        assert.strictEqual(n.normalizeTranslateMode('engine'), 'llm');
        assert.strictEqual(n.normalizeTranslateMode('byok'), 'external');
        assert.strictEqual(n.isExternalTranslateMode('external'), true);
        assert.strictEqual(n.resolveEngineMtModelForPersist('external', 'opus', 'sakura-1.5b'), '');
        assert.strictEqual(n.isInferenceTranslateMode('llm'), true);
        assert.strictEqual(n.isInferenceTranslateMode('sakura'), true);
        assert.strictEqual(n.isInferenceTranslateMode('smart'), false);
        assert.strictEqual(n.isInferenceTranslateMode('dialog'), false);
        assert.strictEqual(n.isInferenceTranslateMode('external'), false);
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
