/**
 * 字幕编辑器布局树纯函数测试
 */
const assert = require('assert');
const layout = require('../src/js/subtitle-editor/layout');

describe('subtitle-editor layout', () => {
    it('builds presets with all four panels', () => {
        for (const id of ['classic', 'immersive', 'focus', 'widescreen']) {
            const tree = layout.presetTree(id);
            const ids = layout.collectPanelIds(tree).sort();
            assert.deepStrictEqual(ids, ['detail', 'list', 'media', 'timeline']);
            assert.ok(layout.normalizeTree(tree));
        }
    });

    it('widescreen keeps timeline as a full-width bottom leaf', () => {
        const tree = layout.makeWidescreen(0.4);
        assert.equal(tree.type, 'split');
        assert.equal(tree.dir, 'col');
        assert.equal(tree.children[1].type, 'panel');
        assert.equal(tree.children[1].id, 'timeline');
    });

    it('migrates legacy 3-panel media trees to include timeline', () => {
        const legacy = {
            type: 'split',
            dir: 'row',
            sizes: [0.4, 0.6],
            children: [
                {
                    type: 'split',
                    dir: 'col',
                    sizes: [0.5, 0.5],
                    children: [
                        { type: 'panel', id: 'list' },
                        { type: 'panel', id: 'detail' },
                    ],
                },
                { type: 'panel', id: 'media' },
            ],
        };
        const parsed = layout.parseLayout({ version: 1, preset: 'classic', root: legacy });
        assert.ok(parsed);
        assert.deepStrictEqual(
            layout.collectPanelIds(parsed.root).sort(),
            ['detail', 'list', 'media', 'timeline'],
        );
    });

    it('docks list to the right of media and keeps four panels', () => {
        const root = layout.makeClassic(0.4);
        const next = layout.dockPanel(root, 'list', 'media', 'right');
        assert.ok(next);
        assert.deepStrictEqual(
            layout.collectPanelIds(next).sort(),
            ['detail', 'list', 'media', 'timeline'],
        );
    });

    it('rejects docking a panel onto itself', () => {
        const root = layout.makeClassic();
        const next = layout.dockPanel(root, 'list', 'list', 'left');
        assert.ok(next);
        assert.deepStrictEqual(
            layout.collectPanelIds(next).sort(),
            layout.collectPanelIds(root).sort(),
        );
    });

    it('parses and serializes layout state', () => {
        const state = {
            preset: 'widescreen',
            root: layout.makeWidescreen(),
        };
        const raw = JSON.stringify(layout.serializeLayout(state));
        const parsed = layout.parseLayout(raw);
        assert.equal(parsed.preset, 'widescreen');
        assert.deepStrictEqual(
            layout.collectPanelIds(parsed.root).sort(),
            ['detail', 'list', 'media', 'timeline'],
        );
    });

    it('updateSplitSizes normalizes proportions', () => {
        const root = layout.makeClassic(0.5);
        const next = layout.updateSplitSizes(root, '', [3, 1]);
        assert.ok(next);
        assert.equal(next.type, 'split');
        assert.ok(Math.abs(next.sizes[0] - 0.75) < 1e-9);
        assert.ok(Math.abs(next.sizes[1] - 0.25) < 1e-9);
    });

    it('enforces higher min height for timeline panes than generic panes', () => {
        assert.ok(layout.timelineMinHeightPx() >= layout.MIN_TIMELINE_HEIGHT_BASE_PX);
        assert.ok(layout.MIN_TIMELINE_HEIGHT_BASE_PX > layout.MIN_PANE_HEIGHT_PX);

        const fakePane = (panelId) => ({
            querySelectorAll: () => [{ getAttribute: () => panelId }],
        });
        assert.equal(layout.paneMinPx(fakePane('timeline'), 'col'), layout.timelineMinHeightPx());
        assert.equal(layout.paneMinPx(fakePane('detail'), 'col'), layout.MIN_PANE_HEIGHT_PX);
        assert.equal(layout.paneMinPx(fakePane('media'), 'col'), layout.MIN_MEDIA_HEIGHT_PX);
        assert.equal(layout.paneMinPx(fakePane('list'), 'row'), layout.MIN_PANE_WIDTH_PX);
    });
});
