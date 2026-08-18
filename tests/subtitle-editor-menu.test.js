const assert = require('assert');
const {
    buildSubtitleEditorMenuTemplate,
    normalizeViewMenuState,
    viewMenuStateEqual,
    SUBTITLE_EDITOR_MENU_ACTIONS,
} = require('../electron/subtitle-editor-menu');

/**
 * @param {import('electron').MenuItemConstructorOptions[]} items
 * @returns {string[]}
 */
function collectLabels(items) {
    /** @type {string[]} */
    const labels = [];
    for (const item of items || []) {
        if (item.label) labels.push(String(item.label));
        if (item.submenu) labels.push(...collectLabels(item.submenu));
    }
    return labels;
}

/**
 * @param {import('electron').MenuItemConstructorOptions[]} items
 * @param {string} label
 * @returns {import('electron').MenuItemConstructorOptions | undefined}
 */
function findByLabel(items, label) {
    for (const item of items || []) {
        if (item.label === label) return item;
        if (item.submenu) {
            const found = findByLabel(item.submenu, label);
            if (found) return found;
        }
    }
    return undefined;
}

describe('subtitle-editor-menu', () => {
    it('builds categorized custom menus without native Electron roles', () => {
        /** @type {string[]} */
        const collected = [];
        const template = buildSubtitleEditorMenuTemplate(() => {}, {
            collectedActions: collected,
            onClose: () => {},
        });

        const topLabels = template.map((item) => item.label);
        assert.deepStrictEqual(topLabels, [
            '文件(&F)',
            '编辑(&E)',
            '文本(&T)',
            '翻译(&R)',
            '批量(&B)',
            '质检(&Q)',
            '视图(&V)',
            '帮助(&H)',
        ]);

        const walk = (items) => {
            for (const item of items || []) {
                const role = item.role ? String(item.role) : '';
                assert.ok(
                    !/^(fileMenu|editMenu|viewMenu|windowMenu|window|help|appMenu)$/i.test(role),
                    `unexpected native role: ${role || '(empty)'}`,
                );
                if (item.submenu) walk(item.submenu);
            }
        };
        walk(template);

        assert.deepStrictEqual([...collected].sort(), [...SUBTITLE_EDITOR_MENU_ACTIONS].sort());

        const translateMenu = template.find((item) => item.label === '翻译(&R)');
        const translateTopLabels = translateMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(translateTopLabels.includes('翻译本条'));
        assert.ok(translateTopLabels.includes('◆ 智能译本条'));
        assert.ok(translateTopLabels.includes('◆ 语境重构'));
        assert.ok(translateTopLabels.includes('◆ 影片理解重构'));
        assert.ok(translateTopLabels.includes('批量翻译'));
        assert.ok(translateTopLabels.includes('批量重构'));

        const batchTranslate = findByLabel(translateMenu.submenu, '批量翻译');
        const batchTranslateLabels = batchTranslate.submenu.map((item) => item.label).filter(Boolean);
        assert.deepStrictEqual(batchTranslateLabels, [
            '翻译选中',
            '翻译全部',
            '◆ 智能翻译选中',
            '◆ 智能翻译全部',
        ]);

        const batchReconstruct = findByLabel(translateMenu.submenu, '批量重构');
        const batchReconstructLabels = batchReconstruct.submenu.map((item) => item.label).filter(Boolean);
        assert.deepStrictEqual(batchReconstructLabels, [
            '◆ 语境重构（全部）',
            '◆ 影片理解重构（全部）',
        ]);

        const textMenu = template.find((item) => item.label === '文本(&T)');
        const textLabels = textMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(textLabels.includes('术语表'));
        assert.ok(textLabels.includes('预设组'));
        assert.ok(!textLabels.includes('翻译本条'));
        assert.ok(!textLabels.includes('◆ 智能译本条'));

        const batchMenu = template.find((item) => item.label === '批量(&B)');
        const batchLabels = batchMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(!batchLabels.includes('翻译选中'));
        assert.ok(!batchLabels.includes('翻译全部'));
        assert.ok(batchLabels.includes('工作流'));

        const qcMenu = template.find((item) => item.label === '质检(&Q)');
        const qcTopLabels = qcMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(qcTopLabels.includes('质量检查'));
        assert.ok(qcTopLabels.includes('筛选'));
        const filterMenu = findByLabel(qcMenu.submenu, '筛选');
        const filterLabels = filterMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.deepStrictEqual(filterLabels, ['全部', '低置信', 'QC', '查找命中']);

        const allLabels = collectLabels(template);
        assert.ok(!allLabels.includes('筛选：全部'));
        assert.ok(!allLabels.includes('工具(&T)'));
    });

    it('reflects view menu checked / enabled state', () => {
        const template = buildSubtitleEditorMenuTemplate(() => {}, {
            viewState: {
                autoFocus: true,
                waveform: false,
                darkTheme: true,
                timelineZoomed: false,
            },
        });
        const viewMenu = template.find((item) => item.label === '视图(&V)');
        const byId = Object.fromEntries(
            viewMenu.submenu
                .filter((item) => item.id)
                .map((item) => [item.id, item]),
        );

        assert.strictEqual(byId['view-auto-focus'].type, 'checkbox');
        assert.strictEqual(byId['view-auto-focus'].checked, true);
        assert.strictEqual(byId['view-waveform'].checked, false);
        assert.strictEqual(byId['view-dark-theme'].label, '深色主题');
        assert.strictEqual(byId['view-dark-theme'].checked, true);
        assert.strictEqual(byId['view-timeline-zoom-fit'].enabled, false);
        assert.strictEqual(byId['view-layout-classic'].type, 'radio');
        assert.strictEqual(byId['view-layout-classic'].checked, true);
        assert.strictEqual(byId['view-layout-immersive'].checked, false);
        assert.ok(byId['view-layout-widescreen']);
        assert.strictEqual(byId['view-layout-widescreen'].checked, false);

        const zoomed = buildSubtitleEditorMenuTemplate(() => {}, {
            viewState: { timelineZoomed: true },
        });
        const fit = zoomed
            .find((item) => item.label === '视图(&V)')
            .submenu.find((item) => item.id === 'view-timeline-zoom-fit');
        assert.strictEqual(fit.enabled, true);
    });

    it('normalizes and compares view menu state', () => {
        assert.deepStrictEqual(
            normalizeViewMenuState({ autoFocus: 1, waveform: 'yes', darkTheme: true }),
            {
                autoFocus: false,
                waveform: false,
                darkTheme: true,
                timelineZoomed: false,
                layoutPreset: 'classic',
            },
        );
        assert.strictEqual(
            viewMenuStateEqual(
                { autoFocus: true, waveform: true, darkTheme: false, timelineZoomed: true, layoutPreset: 'focus' },
                { autoFocus: true, waveform: true, darkTheme: false, timelineZoomed: true, layoutPreset: 'focus' },
            ),
            true,
        );
        assert.strictEqual(
            viewMenuStateEqual({ autoFocus: true }, { autoFocus: false }),
            false,
        );
        assert.strictEqual(
            viewMenuStateEqual(
                { layoutPreset: 'classic' },
                { layoutPreset: 'immersive' },
            ),
            false,
        );
    });

    it('invokes onAction / onClose from click handlers', () => {
        /** @type {string[]} */
        const actions = [];
        let closed = 0;
        const template = buildSubtitleEditorMenuTemplate((action) => actions.push(action), {
            onClose: () => { closed += 1; },
        });
        const fileMenu = template.find((item) => item.label === '文件(&F)');
        const fileLabels = fileMenu.submenu.map((item) => String(item.label || '')).filter(Boolean);
        assert.ok(fileLabels.includes('保存\tCtrl+S'));
        assert.ok(fileLabels.includes('另存为(&A)\tCtrl+Shift+S'));
        const saveItem = fileMenu.submenu.find((item) => String(item.label || '').startsWith('保存\t'));
        const saveAsItem = fileMenu.submenu.find((item) => String(item.label || '').startsWith('另存为'));
        const closeItem = fileMenu.submenu.find((item) => item.label === '关闭窗口');
        saveItem.click();
        saveAsItem.click();
        closeItem.click();
        assert.deepStrictEqual(actions, ['save', 'save-as']);
        assert.strictEqual(closed, 1);
    });
});
