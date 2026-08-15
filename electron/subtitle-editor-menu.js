/**
 * 字幕编辑器窗口菜单（纯自定义，不使用 Electron 原生 File/Edit/View 等 role 菜单）。
 */
const { Menu } = require('electron');

/** 高级功能菜单项前缀（钻石标记） */
const ADVANCED_MENU_MARK = '◆';

/**
 * @param {string} label
 * @returns {string}
 */
function advancedMenuLabel(label) {
    const text = String(label || '').trim();
    if (!text) return ADVANCED_MENU_MARK;
    if (text.startsWith(ADVANCED_MENU_MARK)) return text;
    return `${ADVANCED_MENU_MARK} ${text}`;
}

/**
 * @param {unknown} raw
 * @returns {{
 *   autoFocus: boolean,
 *   waveform: boolean,
 *   darkTheme: boolean,
 *   timelineZoomed: boolean,
 * }}
 */
function normalizeViewMenuState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const layoutPreset = src.layoutPreset === 'classic'
        || src.layoutPreset === 'immersive'
        || src.layoutPreset === 'focus'
        || src.layoutPreset === 'widescreen'
        || src.layoutPreset === 'custom'
        ? src.layoutPreset
        : 'classic';
    return {
        autoFocus: src.autoFocus === true,
        waveform: src.waveform === true,
        darkTheme: src.darkTheme === true,
        timelineZoomed: src.timelineZoomed === true,
        layoutPreset,
    };
}

/**
 * @param {MenuActionHandler} onAction
 * @param {{
 *   onClose?: () => void,
 *   collectedActions?: string[],
 *   viewState?: unknown,
 * }} [opts]
 */
function buildSubtitleEditorMenuTemplate(onAction, opts = {}) {
    const collected = opts.collectedActions;
    const view = normalizeViewMenuState(opts.viewState);
    const act = (action) => {
        // 同一 action 可挂在多个菜单；测试只登记唯一 id
        if (collected && !collected.includes(action)) collected.push(action);
        return () => {
            try {
                onAction(action);
            } catch (_) { /* ignore */ }
        };
    };

    return [
        {
            label: '文件(&F)',
            submenu: [
                { label: '打开字幕(&O)', click: act('open-subtitle') },
                { label: '关联视频(&V)', click: act('link-video') },
                { type: 'separator' },
                { label: '保存\tCtrl+S', click: act('save') },
                { label: '导出合并双语', click: act('export-dual') },
                { type: 'separator' },
                { label: '打开字幕生成器', click: act('open-generator') },
                { label: '打开字幕库', click: act('open-library') },
                { label: '设置(&S)', click: act('open-settings') },
                { type: 'separator' },
                { label: '复原到初始', click: act('restore-initial') },
                { type: 'separator' },
                {
                    label: '关闭窗口',
                    click: () => {
                        try {
                            opts.onClose?.();
                        } catch (_) { /* ignore */ }
                    },
                },
            ],
        },
        {
            label: '编辑(&E)',
            submenu: [
                { label: '撤销\tCtrl+Z', click: act('undo') },
                { label: '重做\tCtrl+Y', click: act('redo') },
                { type: 'separator' },
                { label: '查找替换\tCtrl+F', click: act('find-replace') },
                { label: '全选\tCtrl+A', click: act('select-all') },
                { label: '合并选中\tCtrl+M', click: act('merge-selected') },
                { type: 'separator' },
                { label: '插入字幕', click: act('insert-cue') },
                { label: '删除字幕\tDelete', click: act('delete-cue') },
            ],
        },
        {
            label: '文本(&T)',
            submenu: [
                { label: '术语表', click: act('glossary') },
                { label: '断句词', click: act('break-words') },
                { type: 'separator' },
                { label: '简繁转换', click: act('chinese-convert') },
                { label: '压缩叠词', click: act('compress-rep') },
                { label: '观影精简标点', click: act('viewing-punct') },
                { type: 'separator' },
                { label: '预设组', click: act('text-presets') },
            ],
        },
        {
            label: '翻译(&R)',
            submenu: [
                { label: '翻译本条', click: act('sakura-translate') },
                { label: advancedMenuLabel('智能译本条'), click: act('smart-translate') },
                { type: 'separator' },
                { label: advancedMenuLabel('语境重构'), click: act('context-reconstruct') },
                { label: advancedMenuLabel('影片理解重构'), click: act('film-context-reconstruct') },
                { type: 'separator' },
                {
                    label: '批量翻译',
                    submenu: [
                        { label: '翻译选中', click: act('batch-sakura-translate') },
                        { label: '翻译全部', click: act('batch-sakura-translate-all') },
                        { label: advancedMenuLabel('智能翻译选中'), click: act('batch-smart-translate') },
                        { label: advancedMenuLabel('智能翻译全部'), click: act('batch-smart-translate-all') },
                    ],
                },
                {
                    label: '批量重构',
                    submenu: [
                        { label: advancedMenuLabel('语境重构（全部）'), click: act('batch-context-reconstruct') },
                        { label: advancedMenuLabel('影片理解重构（全部）'), click: act('batch-film-context-reconstruct') },
                    ],
                },
            ],
        },
        {
            label: '批量(&B)',
            submenu: [
                { label: '全体 -0.5s', click: act('shift-back') },
                { label: '全体 +0.5s', click: act('shift-fwd') },
                { type: 'separator' },
                { label: '时长调整', click: act('batch-duration') },
                { label: '智能分割', click: act('smart-split') },
                { label: '静音分割', click: act('silence-split') },
                { label: '智能调整', click: act('smart-adjust') },
                { label: '删除杂音', click: act('remove-noise') },
                { label: '按时长重转', click: act('retranscribe-duration') },
                { label: '重转低置信', click: act('retranscribe-low-conf') },
                { type: 'separator' },
                { label: '工作流', click: act('workflows') },
            ],
        },
        {
            label: '质检(&Q)',
            submenu: [
                { label: '质量检查', click: act('qc') },
                { label: '下一条问题', click: act('next-issue') },
                { type: 'separator' },
                {
                    label: '筛选',
                    submenu: [
                        { label: '全部', click: act('filter-all') },
                        { label: '低置信', click: act('filter-low') },
                        { label: 'QC', click: act('filter-qc') },
                        { label: '查找命中', click: act('filter-find') },
                    ],
                },
            ],
        },
        {
            label: '视图(&V)',
            submenu: [
                {
                    id: 'view-auto-focus',
                    label: '自动焦点',
                    type: 'checkbox',
                    checked: view.autoFocus,
                    click: act('toggle-auto-focus'),
                },
                {
                    id: 'view-waveform',
                    label: '波形时间轴',
                    type: 'checkbox',
                    checked: view.waveform,
                    click: act('toggle-waveform'),
                },
                {
                    id: 'view-dark-theme',
                    label: '深色主题',
                    type: 'checkbox',
                    checked: view.darkTheme,
                    click: act('toggle-theme'),
                },
                { type: 'separator' },
                {
                    id: 'view-layout-classic',
                    label: '布局：经典',
                    type: 'radio',
                    name: 'editor-layout',
                    checked: view.layoutPreset === 'classic',
                    click: act('layout-classic'),
                },
                {
                    id: 'view-layout-immersive',
                    label: '布局：沉浸校对',
                    type: 'radio',
                    name: 'editor-layout',
                    checked: view.layoutPreset === 'immersive',
                    click: act('layout-immersive'),
                },
                {
                    id: 'view-layout-focus',
                    label: '布局：专注文本',
                    type: 'radio',
                    name: 'editor-layout',
                    checked: view.layoutPreset === 'focus',
                    click: act('layout-focus'),
                },
                {
                    id: 'view-layout-widescreen',
                    label: '布局：通栏时间轴',
                    type: 'radio',
                    name: 'editor-layout',
                    checked: view.layoutPreset === 'widescreen',
                    click: act('layout-widescreen'),
                },
                { label: '重置布局', click: act('layout-reset') },
                { type: 'separator' },
                { label: '时间轴放大', click: act('timeline-zoom-in') },
                { label: '时间轴缩小', click: act('timeline-zoom-out') },
                {
                    id: 'view-timeline-zoom-fit',
                    label: '时间轴适应窗口',
                    enabled: view.timelineZoomed,
                    click: act('timeline-zoom-fit'),
                },
            ],
        },
        {
            label: '帮助(&H)',
            submenu: [
                { label: '快捷键说明', click: act('shortcuts') },
                { type: 'separator' },
                { label: '检查更新', click: act('check-update') },
                { label: '关于 Transub', click: act('about') },
            ],
        },
    ];
}

/** 菜单 action 全集（与模板一一对应，供渲染进程 / 测试对齐） */
const SUBTITLE_EDITOR_MENU_ACTIONS = Object.freeze([
    'open-subtitle',
    'link-video',
    'save',
    'export-dual',
    'open-generator',
    'open-library',
    'open-settings',
    'restore-initial',
    'undo',
    'redo',
    'find-replace',
    'select-all',
    'merge-selected',
    'insert-cue',
    'delete-cue',
    'glossary',
    'break-words',
    'chinese-convert',
    'compress-rep',
    'viewing-punct',
    'text-presets',
    'sakura-translate',
    'smart-translate',
    'context-reconstruct',
    'film-context-reconstruct',
    'batch-sakura-translate',
    'batch-sakura-translate-all',
    'batch-smart-translate',
    'batch-smart-translate-all',
    'batch-context-reconstruct',
    'batch-film-context-reconstruct',
    'shift-back',
    'shift-fwd',
    'batch-duration',
    'smart-split',
    'silence-split',
    'smart-adjust',
    'remove-noise',
    'retranscribe-duration',
    'retranscribe-low-conf',
    'workflows',
    'qc',
    'next-issue',
    'filter-all',
    'filter-low',
    'filter-qc',
    'filter-find',
    'toggle-auto-focus',
    'toggle-waveform',
    'toggle-theme',
    'layout-classic',
    'layout-immersive',
    'layout-focus',
    'layout-widescreen',
    'layout-reset',
    'timeline-zoom-in',
    'timeline-zoom-out',
    'timeline-zoom-fit',
    'shortcuts',
    'check-update',
    'about',
]);

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function viewMenuStateEqual(a, b) {
    const left = normalizeViewMenuState(a);
    const right = normalizeViewMenuState(b);
    return left.autoFocus === right.autoFocus
        && left.waveform === right.waveform
        && left.darkTheme === right.darkTheme
        && left.timelineZoomed === right.timelineZoomed
        && left.layoutPreset === right.layoutPreset;
}

/**
 * 为字幕编辑器窗口安装 / 刷新自定义菜单栏。
 * @param {import('electron').BrowserWindow} win
 * @param {unknown} [viewState]
 */
function applySubtitleEditorMenu(win, viewState) {
    if (!win || win.isDestroyed()) return null;

    const nextView = normalizeViewMenuState(viewState);
    const prevView = win.__transubEditorViewMenuState;
    if (win.__transubEditorMenuApplied && viewMenuStateEqual(prevView, nextView)) {
        return win.__transubEditorMenu || null;
    }

    const sendAction = (action) => {
        if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
        const id = String(action || '').trim();
        if (!id) return;
        win.webContents.send('subtitle-editor-menu-action', { action: id });
    };

    const template = buildSubtitleEditorMenuTemplate(sendAction, {
        viewState: nextView,
        onClose: () => {
            if (!win || win.isDestroyed()) return;
            win.close();
        },
    });

    // 断言：不使用会展开系统原生子菜单的 role（fileMenu / editMenu / viewMenu 等）
    const assertNoNativeRoles = (items) => {
        for (const item of items || []) {
            const role = item.role ? String(item.role) : '';
            if (/^(fileMenu|editMenu|viewMenu|windowMenu|window|help|appMenu)$/i.test(role)) {
                throw new Error(`subtitle-editor menu must not use native role: ${role}`);
            }
            if (item.submenu) assertNoNativeRoles(item.submenu);
        }
    };
    assertNoNativeRoles(template);

    const menu = Menu.buildFromTemplate(template);
    win.setMenu(menu);
    win.setMenuBarVisibility(true);
    try {
        win.setAutoHideMenuBar(false);
    } catch (_) { /* older electron */ }

    win.__transubEditorMenu = menu;
    win.__transubEditorMenuApplied = true;
    win.__transubEditorViewMenuState = nextView;
    return menu;
}

module.exports = {
    applySubtitleEditorMenu,
    buildSubtitleEditorMenuTemplate,
    normalizeViewMenuState,
    viewMenuStateEqual,
    advancedMenuLabel,
    ADVANCED_MENU_MARK,
    SUBTITLE_EDITOR_MENU_ACTIONS,
};
