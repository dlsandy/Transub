'use strict';

const assert = require('assert');
const {
    computeSelectionToolbarVisibility,
} = require('../src/js/selection-toolbar-core.js');

describe('selection-toolbar-core', () => {
    it('keeps editor visible on empty list; hides selection-only actions', () => {
        const v = computeSelectionToolbarVisibility({
            itemCount: 0,
            selectedCount: 0,
            singleHasSubtitle: false,
        });
        assert.deepStrictEqual(v, {
            showEditor: true,
            showRetranslate: false,
            showReconstruct: false,
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
        assert.strictEqual(v.showProActions, false);
    });

    it('shows retranslate for any selection; reconstruct only for one with subtitle', () => {
        const multi = computeSelectionToolbarVisibility({
            itemCount: 2,
            selectedCount: 2,
            singleHasSubtitle: true,
        });
        assert.strictEqual(multi.showRetranslate, true);
        assert.strictEqual(multi.showReconstruct, false);
        assert.strictEqual(multi.showProActions, true);

        const oneNoSub = computeSelectionToolbarVisibility({
            itemCount: 1,
            selectedCount: 1,
            singleHasSubtitle: false,
        });
        assert.strictEqual(oneNoSub.showRetranslate, true);
        assert.strictEqual(oneNoSub.showReconstruct, false);

        const oneWithSub = computeSelectionToolbarVisibility({
            itemCount: 1,
            selectedCount: 1,
            singleHasSubtitle: true,
        });
        assert.strictEqual(oneWithSub.showRetranslate, true);
        assert.strictEqual(oneWithSub.showReconstruct, true);
        assert.strictEqual(oneWithSub.showProActions, true);
    });
});
