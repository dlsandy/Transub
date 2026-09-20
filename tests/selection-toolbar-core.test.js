'use strict';

const assert = require('assert');
const {
    computeSelectionToolbarVisibility,
} = require('../src/js/selection-toolbar-core.js');

describe('selection-toolbar-core', () => {
    it('keeps editor visible; hides removed toolbar retranslate/reconstruct', () => {
        const v = computeSelectionToolbarVisibility({
            itemCount: 0,
            selectedCount: 0,
            singleHasSubtitle: false,
        });
        assert.deepStrictEqual(v, {
            showEditor: true,
            showRetranslate: false,
            showReconstruct: false,
            showTranslateStyle: false,
            showProActions: false,
        });
    });

    it('keeps editor visible when list has items but nothing selected', () => {
        const v = computeSelectionToolbarVisibility({
            itemCount: 3,
            selectedCount: 0,
            singleHasSubtitle: false,
        });
        assert.strictEqual(v.showEditor, true);
        assert.strictEqual(v.showRetranslate, false);
        assert.strictEqual(v.showReconstruct, false);
        assert.strictEqual(v.showTranslateStyle, false);
        assert.strictEqual(v.showProActions, false);
    });

    it('never shows toolbar retranslate/reconstruct (context menu only)', () => {
        const multi = computeSelectionToolbarVisibility({
            itemCount: 2,
            selectedCount: 2,
            singleHasSubtitle: true,
        });
        assert.strictEqual(multi.showRetranslate, false);
        assert.strictEqual(multi.showReconstruct, false);
        assert.strictEqual(multi.showTranslateStyle, true);
        assert.strictEqual(multi.showProActions, false);

        const oneWithSub = computeSelectionToolbarVisibility({
            itemCount: 1,
            selectedCount: 1,
            singleHasSubtitle: true,
        });
        assert.strictEqual(oneWithSub.showRetranslate, false);
        assert.strictEqual(oneWithSub.showReconstruct, false);
        assert.strictEqual(oneWithSub.showTranslateStyle, true);
        assert.strictEqual(oneWithSub.showProActions, false);
    });

    it('shows translate style for any non-empty selection', () => {
        const v = computeSelectionToolbarVisibility({
            itemCount: 5,
            selectedCount: 3,
            singleHasSubtitle: false,
        });
        assert.strictEqual(v.showTranslateStyle, true);
        assert.strictEqual(v.showProActions, false);
    });
});
