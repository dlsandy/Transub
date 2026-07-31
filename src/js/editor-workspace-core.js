/**
 * 编辑器工作区模式 + 首次导览（浏览器与 Node 共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEditorWorkspace = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function editorWorkspaceCoreFactory() {
    const WORKSPACE_KEY = 'transub-editor-workspace-mode';
    /** v2：覆盖工作区 / 波形书签 / 工作流等；旧 key 不再视为已完成 */
    const TOUR_KEY = 'transub-editor-tour-v2-done';
    const MODES = new Set(['polish', 'timeline', 'dual', 'ai', 'pro']);

    const MODE_META = {
        polish: {
            id: 'polish',
            label: '精修',
            hint: '文本、QC、术语',
            toolGroups: ['entry', 'text', 'qc', 'kept', 'history'],
        },
        timeline: {
            id: 'timeline',
            label: '时间轴',
            hint: '对轴、分割、静音',
            toolGroups: ['entry', 'timing', 'batch-timing', 'history'],
        },
        dual: {
            id: 'dual',
            label: '双语',
            hint: '对照、合并导出',
            toolGroups: ['entry', 'text', 'dual', 'kept', 'history'],
        },
        ai: {
            id: 'ai',
            label: 'AI',
            hint: '翻译与重构',
            toolGroups: ['entry', 'ai', 'text', 'history'],
        },
        pro: {
            id: 'pro',
            label: 'Pro',
            hint: 'Pro 专属功能',
            toolGroups: ['entry', 'pro', 'history'],
        },
    };

    /** data-tool-group values used in tools menu */
    const GROUP_ALIASES = {
        entry: ['entry'],
        text: ['text'],
        timing: ['timing'],
        'batch-timing': ['batch'],
        qc: ['batch'],
        dual: ['dual'],
        kept: ['kept'],
        ai: ['ai'],
        pro: ['pro'],
        history: ['history'],
    };

    const TOUR_STEPS = [
        {
            id: 'workspace',
            title: '按任务切换工作区',
            body: '顶栏「精修 / 时间轴 / 双语 / AI / Pro」会切换下方模式工具（Alt+1…5）。常用按钮直接露出，低频收在 ▾ 菜单。',
            target: 'workspace',
        },
        {
            id: 'filter',
            title: '先筛，再逐条过',
            body: '列表可筛「低置信 / QC / 查找 / 书签」，审校在「审校 ▾」。用「下一条问题」或情境条，按 QC 结果一条条处理。',
            target: 'list-filter',
        },
        {
            id: 'timeline',
            title: '波形时间轴对轴',
            body: '拖字幕块改时长；Ctrl+滚轮缩放。B 打书签、[ ] 设 A-B 循环；关联视频后波形默认开启，时间轴/波形上也可右键调轴。',
            target: 'timeline',
        },
        {
            id: 'detail',
            title: 'F11 / F12 贴播放头',
            body: '选中一条后，用 F11 / F12 把起止对齐到播放位置；「时间轴 · 分割」里还有智能时长、贴边与分割。',
            target: 'detail',
        },
        {
            id: 'finish',
            title: '工作流与导出前检查',
            body: '工作流可一键跑批处理；导出前检查会汇总 QC、书签与双语等问题。随时可点右上角 ? 重看导览。',
            target: 'finish',
        },
    ];

    function normalizeMode(value) {
        const v = String(value || '').trim().toLowerCase();
        return MODES.has(v) ? v : 'polish';
    }

    function listModes() {
        return ['polish', 'timeline', 'dual', 'ai', 'pro'].map((id) => ({ ...MODE_META[id] }));
    }

    function groupsForMode(mode) {
        const meta = MODE_META[normalizeMode(mode)] || MODE_META.polish;
        return meta.toolGroups.slice();
    }

    /**
     * Whether a tools-menu group should be visible.
     * @param {string} groupAttr - data-tool-group on the label/sep/button cluster
     *   (space-separated allowed, e.g. "ai pro")
     */
    function isGroupVisible(mode, groupAttr) {
        const want = groupsForMode(mode);
        const groups = String(groupAttr || '').trim().split(/\s+/).filter(Boolean);
        if (!groups.length) return true;
        for (const g of groups) {
            if (want.includes(g)) return true;
            for (const w of want) {
                const aliases = GROUP_ALIASES[w] || [w];
                if (aliases.includes(g)) return true;
            }
        }
        return false;
    }

    function loadMode(storage) {
        try {
            const raw = storage?.getItem?.(WORKSPACE_KEY);
            return normalizeMode(raw);
        } catch (_) {
            return 'polish';
        }
    }

    function saveMode(storage, mode) {
        try {
            storage?.setItem?.(WORKSPACE_KEY, normalizeMode(mode));
        } catch (_) { /* ignore */ }
    }

    function isTourDone(storage) {
        try {
            return storage?.getItem?.(TOUR_KEY) === '1';
        } catch (_) {
            return true;
        }
    }

    function markTourDone(storage) {
        try {
            storage?.setItem?.(TOUR_KEY, '1');
        } catch (_) { /* ignore */ }
    }

    function getTourSteps() {
        return TOUR_STEPS.map((s) => ({ ...s }));
    }

    return {
        WORKSPACE_KEY,
        TOUR_KEY,
        MODES,
        MODE_META,
        GROUP_ALIASES,
        TOUR_STEPS,
        normalizeMode,
        listModes,
        groupsForMode,
        isGroupVisible,
        loadMode,
        saveMode,
        isTourDone,
        markTourDone,
        getTourSteps,
    };
}));
