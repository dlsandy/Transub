const assert = require('assert');
const {
    resolveZoomFactor,
    sanitizeUiZoomPref,
    DEFAULT_PREF,
    _resetUiZoomCacheForTests,
} = require('../electron/ui-zoom');

describe('ui-zoom', () => {
    beforeEach(() => {
        _resetUiZoomCacheForTests();
    });

    it('sanitizes pref values', () => {
        assert.strictEqual(sanitizeUiZoomPref('auto'), 'auto');
        assert.strictEqual(sanitizeUiZoomPref(null), DEFAULT_PREF);
        assert.strictEqual(sanitizeUiZoomPref(1), 1);
        assert.strictEqual(sanitizeUiZoomPref(1.25), 1.25);
        assert.strictEqual(sanitizeUiZoomPref('1.5'), 1.5);
        assert.strictEqual(sanitizeUiZoomPref(1.1), 1.1);
    });

    it('uses fixed factor when not auto', () => {
        const display = { size: { width: 3840, height: 2160 }, scaleFactor: 1 };
        assert.strictEqual(resolveZoomFactor(1, display), 1);
        assert.strictEqual(resolveZoomFactor(1.25, display), 1.25);
        assert.strictEqual(resolveZoomFactor(1.5, display), 1.5);
    });

    it('auto: 4K @ 100% → 1.25', () => {
        assert.strictEqual(
            resolveZoomFactor('auto', { size: { width: 3840, height: 2160 }, scaleFactor: 1 }),
            1.25,
        );
    });

    it('auto: 4K @ 125% → 1.1', () => {
        // DIP size shrinks when OS scale is applied
        assert.strictEqual(
            resolveZoomFactor('auto', { size: { width: 3072, height: 1728 }, scaleFactor: 1.25 }),
            1.1,
        );
    });

    it('auto: 4K @ 150% → 1 (no extra zoom)', () => {
        assert.strictEqual(
            resolveZoomFactor('auto', { size: { width: 2560, height: 1440 }, scaleFactor: 1.5 }),
            1,
        );
    });

    it('auto: 1080p → 1', () => {
        assert.strictEqual(
            resolveZoomFactor('auto', { size: { width: 1920, height: 1080 }, scaleFactor: 1 }),
            1,
        );
    });

    it('auto: missing display → 1', () => {
        assert.strictEqual(resolveZoomFactor('auto', null), 1);
        assert.strictEqual(resolveZoomFactor('auto', {}), 1);
    });
});
