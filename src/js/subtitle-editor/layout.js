/**
 * 字幕编辑器 — 可停靠布局（list / detail / media / timeline）
 * 纯树操作可在 Node 测试；installLayout 负责 DOM 渲染与拖拽。
 */
(function (global) {
    const LAYOUT_KEY = 'transub-editor-layout';
    const LAYOUT_VERSION = 2;
    const PANEL_IDS = Object.freeze(['list', 'detail', 'media', 'timeline']);
    const PANEL_SET = new Set(PANEL_IDS);
    const PRESET_IDS = Object.freeze(['classic', 'immersive', 'focus', 'widescreen', 'custom']);
    const EDGES = Object.freeze(['left', 'right', 'top', 'bottom']);

    /** 水平分割时各面板最小宽度 */
    const MIN_PANE_WIDTH_PX = 96;
    /** 垂直分割默认最小高度（详情等可再压低） */
    const MIN_PANE_HEIGHT_PX = 48;
    /** 视频区最小高度 */
    const MIN_MEDIA_HEIGHT_PX = 96;
    /** 列表区最小高度 */
    const MIN_LIST_HEIGHT_PX = 72;
    /** 时间轴：标题栏 + 字幕轨 + 播放控制（无波形） */
    const MIN_TIMELINE_HEIGHT_BASE_PX = 124;
    /** 开启波形时额外高度（.editor-waveform-row = 48） */
    const MIN_TIMELINE_WAVEFORM_EXTRA_PX = 48;
    /** 横向滚动条可见时额外高度 */
    const MIN_TIMELINE_HSCROLL_EXTRA_PX = 14;

    /**
     * 时间轴面板最低高度：需容纳标题栏、字幕轨与播放条，避免拖瘦后控件被裁切。
     * @returns {number}
     */
    function timelineMinHeightPx() {
        let h = MIN_TIMELINE_HEIGHT_BASE_PX;
        try {
            if (typeof document !== 'undefined' && document.body?.classList?.contains('editor-waveform-on')) {
                h += MIN_TIMELINE_WAVEFORM_EXTRA_PX;
            }
            const scroll = typeof document !== 'undefined'
                ? document.getElementById('editorTimelineHScrollWrap')
                : null;
            if (scroll && !scroll.classList.contains('hidden')) {
                h += MIN_TIMELINE_HSCROLL_EXTRA_PX;
            }
        } catch (_) { /* ignore */ }
        return h;
    }

    /**
     * @param {Element | null | undefined} paneEl
     * @returns {string[]}
     */
    function collectPanePanelIds(paneEl) {
        if (!paneEl || !paneEl.querySelectorAll) return [];
        return [...paneEl.querySelectorAll('[data-panel]')]
            .map((el) => el.getAttribute('data-panel'))
            .filter((id) => id && PANEL_SET.has(id));
    }

    /**
     * 按面板内容给出分割下限（像素）。
     * @param {Element | null | undefined} paneEl
     * @param {'row' | 'col'} dir
     * @returns {number}
     */
    function paneMinPx(paneEl, dir) {
        if (dir === 'row') return MIN_PANE_WIDTH_PX;
        const ids = collectPanePanelIds(paneEl);
        if (ids.length === 1 && ids[0] === 'timeline') return timelineMinHeightPx();
        if (ids.length === 1 && ids[0] === 'media') return MIN_MEDIA_HEIGHT_PX;
        if (ids.length === 1 && ids[0] === 'list') return MIN_LIST_HEIGHT_PX;
        if (ids.length === 1 && ids[0] === 'detail') return MIN_PANE_HEIGHT_PX;
        if (ids.includes('timeline') && ids.includes('media')) {
            return timelineMinHeightPx() + MIN_MEDIA_HEIGHT_PX;
        }
        if (ids.includes('timeline')) return timelineMinHeightPx();
        return MIN_PANE_HEIGHT_PX;
    }

    /**
     * @param {HTMLElement} pane
     * @param {'row' | 'col'} dir
     */
    function applyPaneBoxMins(pane, dir) {
        if (!pane || !pane.style) return;
        if (dir === 'row') {
            pane.style.minWidth = `${paneMinPx(pane, 'row')}px`;
            pane.style.minHeight = '0';
        } else {
            pane.style.minWidth = '0';
            pane.style.minHeight = `${paneMinPx(pane, 'col')}px`;
        }
    }
    function cloneNode(node) {
        if (!node || typeof node !== 'object') return null;
        if (node.type === 'panel') {
            return { type: 'panel', id: String(node.id || '') };
        }
        if (node.type === 'split') {
            const children = Array.isArray(node.children)
                ? node.children.map(cloneNode).filter(Boolean)
                : [];
            const sizes = Array.isArray(node.sizes)
                ? node.sizes.map((n) => Number(n))
                : [];
            return {
                type: 'split',
                dir: node.dir === 'col' ? 'col' : 'row',
                sizes: sizes.slice(0, children.length),
                children,
            };
        }
        return null;
    }

    function collectPanelIds(node, out = []) {
        if (!node) return out;
        if (node.type === 'panel') {
            out.push(String(node.id || ''));
            return out;
        }
        if (node.type === 'split' && Array.isArray(node.children)) {
            node.children.forEach((c) => collectPanelIds(c, out));
        }
        return out;
    }

    function normalizeSizes(sizes, count) {
        const n = Math.max(1, count | 0);
        const raw = Array.isArray(sizes) ? sizes.slice(0, n) : [];
        while (raw.length < n) raw.push(1);
        const nums = raw.map((v) => {
            const x = Number(v);
            return Number.isFinite(x) && x > 0 ? x : 1;
        });
        const sum = nums.reduce((a, b) => a + b, 0) || n;
        return nums.map((v) => v / sum);
    }

    function mediaStack(videoFrac = 0.72) {
        const top = Math.min(0.88, Math.max(0.45, Number(videoFrac) || 0.72));
        return {
            type: 'split',
            dir: 'col',
            sizes: [top, 1 - top],
            children: [
                { type: 'panel', id: 'media' },
                { type: 'panel', id: 'timeline' },
            ],
        };
    }

    /** Expand legacy v1 trees where media absorbed timeline. */
    function expandLegacyMedia(node) {
        if (!node) return null;
        if (node.type === 'panel') {
            if (node.id === 'media') return mediaStack(0.72);
            return cloneNode(node);
        }
        if (node.type !== 'split') return null;
        return {
            type: 'split',
            dir: node.dir === 'col' ? 'col' : 'row',
            sizes: Array.isArray(node.sizes) ? node.sizes.slice() : [],
            children: (node.children || []).map(expandLegacyMedia).filter(Boolean),
        };
    }

    function normalizeTree(root) {
        const cloned = cloneNode(root);
        if (!cloned) return null;

        function walk(node) {
            if (!node) return null;
            if (node.type === 'panel') {
                return PANEL_SET.has(node.id) ? node : null;
            }
            if (node.type !== 'split') return null;
            const kids = (node.children || []).map(walk).filter(Boolean);
            if (!kids.length) return null;
            if (kids.length === 1) return kids[0];
            return {
                type: 'split',
                dir: node.dir === 'col' ? 'col' : 'row',
                sizes: normalizeSizes(node.sizes, kids.length),
                children: kids,
            };
        }

        const next = walk(cloned);
        if (!next) return null;
        const ids = collectPanelIds(next).filter((id) => PANEL_SET.has(id));
        if (ids.length !== PANEL_IDS.length) return null;
        if (new Set(ids).size !== PANEL_IDS.length) return null;
        return next;
    }

    function makeClassic(leftFrac = 0.42) {
        const left = Math.min(0.7, Math.max(0.28, Number(leftFrac) || 0.42));
        return normalizeTree({
            type: 'split',
            dir: 'row',
            sizes: [left, 1 - left],
            children: [
                {
                    type: 'split',
                    dir: 'col',
                    sizes: [0.58, 0.42],
                    children: [
                        { type: 'panel', id: 'list' },
                        { type: 'panel', id: 'detail' },
                    ],
                },
                mediaStack(0.72),
            ],
        });
    }

    function makeImmersive() {
        return normalizeTree({
            type: 'split',
            dir: 'col',
            sizes: [0.56, 0.44],
            children: [
                mediaStack(0.7),
                {
                    type: 'split',
                    dir: 'row',
                    sizes: [0.55, 0.45],
                    children: [
                        { type: 'panel', id: 'list' },
                        { type: 'panel', id: 'detail' },
                    ],
                },
            ],
        });
    }

    function makeFocus() {
        return normalizeTree({
            type: 'split',
            dir: 'row',
            sizes: [0.64, 0.36],
            children: [
                {
                    type: 'split',
                    dir: 'col',
                    sizes: [0.62, 0.38],
                    children: [
                        { type: 'panel', id: 'list' },
                        { type: 'panel', id: 'detail' },
                    ],
                },
                mediaStack(0.7),
            ],
        });
    }

    /** 上方：列表/详情 + 视频；底部通栏时间轴 */
    function makeWidescreen(leftFrac = 0.42) {
        const left = Math.min(0.7, Math.max(0.28, Number(leftFrac) || 0.42));
        return normalizeTree({
            type: 'split',
            dir: 'col',
            sizes: [0.78, 0.22],
            children: [
                {
                    type: 'split',
                    dir: 'row',
                    sizes: [left, 1 - left],
                    children: [
                        {
                            type: 'split',
                            dir: 'col',
                            sizes: [0.58, 0.42],
                            children: [
                                { type: 'panel', id: 'list' },
                                { type: 'panel', id: 'detail' },
                            ],
                        },
                        { type: 'panel', id: 'media' },
                    ],
                },
                { type: 'panel', id: 'timeline' },
            ],
        });
    }

    const PRESETS = Object.freeze({
        classic: { id: 'classic', label: '经典', build: makeClassic },
        immersive: { id: 'immersive', label: '沉浸校对', build: makeImmersive },
        focus: { id: 'focus', label: '专注文本', build: makeFocus },
        widescreen: { id: 'widescreen', label: '通栏时间轴', build: makeWidescreen },
    });

    function presetTree(presetId, leftFrac) {
        const p = PRESETS[presetId] || PRESETS.classic;
        if (p.id === 'classic' || p.id === 'widescreen' || p.id === 'focus') {
            return p.build(leftFrac);
        }
        return p.build();
    }

    function normalizePresetId(raw) {
        if (PRESET_IDS.includes(raw)) return raw;
        return 'custom';
    }

    function collapseTree(node) {
        if (!node) return null;
        if (node.type === 'panel') {
            return PANEL_SET.has(node.id) ? { type: 'panel', id: node.id } : null;
        }
        if (node.type !== 'split') return null;
        const kids = [];
        const sizes = [];
        (node.children || []).forEach((child, i) => {
            const next = collapseTree(child);
            if (next) {
                kids.push(next);
                sizes.push(Number(node.sizes?.[i]) || 1);
            }
        });
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0];
        return {
            type: 'split',
            dir: node.dir === 'col' ? 'col' : 'row',
            sizes: normalizeSizes(sizes, kids.length),
            children: kids,
        };
    }

    function removePanel(root, panelId) {
        function walk(node) {
            if (!node) return null;
            if (node.type === 'panel') {
                return node.id === panelId ? null : cloneNode(node);
            }
            const kids = [];
            const sizes = [];
            (node.children || []).forEach((child, i) => {
                const next = walk(child);
                if (next) {
                    kids.push(next);
                    sizes.push(Number(node.sizes?.[i]) || 1);
                }
            });
            if (!kids.length) return null;
            if (kids.length === 1) return kids[0];
            return {
                type: 'split',
                dir: node.dir === 'col' ? 'col' : 'row',
                sizes: normalizeSizes(sizes, kids.length),
                children: kids,
            };
        }
        return collapseTree(walk(root));
    }

    function replacePanel(root, targetId, replacement) {
        function walk(node) {
            if (!node) return null;
            if (node.type === 'panel') {
                return node.id === targetId ? cloneNode(replacement) : cloneNode(node);
            }
            return {
                type: 'split',
                dir: node.dir === 'col' ? 'col' : 'row',
                sizes: Array.isArray(node.sizes) ? node.sizes.slice() : [],
                children: (node.children || []).map(walk).filter(Boolean),
            };
        }
        return collapseTree(walk(root));
    }

    /**
     * 将 panelId 停靠到 targetId 的某一侧。
     * @param {'left'|'right'|'top'|'bottom'} edge
     */
    function dockPanel(root, panelId, targetId, edge) {
        if (!PANEL_SET.has(panelId) || !PANEL_SET.has(targetId)) return null;
        if (panelId === targetId) return normalizeTree(root);
        if (!EDGES.includes(edge)) return null;

        const moving = { type: 'panel', id: panelId };
        const without = removePanel(root, panelId);
        if (!without) return null;

        const dir = (edge === 'left' || edge === 'right') ? 'row' : 'col';
        const movingFirst = edge === 'left' || edge === 'top';
        const split = {
            type: 'split',
            dir,
            sizes: [0.5, 0.5],
            children: movingFirst
                ? [moving, { type: 'panel', id: targetId }]
                : [{ type: 'panel', id: targetId }, moving],
        };
        return normalizeTree(replacePanel(without, targetId, split));
    }

    function updateSplitSizes(root, path, sizes) {
        const cloned = cloneNode(root);
        if (!cloned) return null;
        let node = cloned;
        const parts = String(path || '').split('.').filter(Boolean);
        for (const part of parts) {
            const idx = Number(part);
            if (!node || node.type !== 'split' || !node.children?.[idx]) return null;
            node = node.children[idx];
        }
        if (!node || node.type !== 'split') return null;
        node.sizes = normalizeSizes(sizes, node.children.length);
        return normalizeTree(cloned);
    }

    function findSplitAtPath(root, path) {
        let node = root;
        const parts = String(path || '').split('.').filter(Boolean);
        for (const part of parts) {
            const idx = Number(part);
            if (!node || node.type !== 'split' || !node.children?.[idx]) return null;
            node = node.children[idx];
        }
        return node && node.type === 'split' ? node : null;
    }

    function serializeLayout(state) {
        return {
            version: LAYOUT_VERSION,
            preset: normalizePresetId(state?.preset),
            root: cloneNode(state?.root),
        };
    }

    function parseLayout(raw) {
        try {
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            let root = data?.root;
            const ids = collectPanelIds(root || {});
            const hasTimeline = ids.includes('timeline');
            const hasMedia = ids.includes('media');
            if (hasMedia && !hasTimeline) {
                root = expandLegacyMedia(root);
            }
            root = normalizeTree(root);
            if (!root) return null;
            return {
                version: LAYOUT_VERSION,
                preset: normalizePresetId(data?.preset),
                root,
            };
        } catch (_) {
            return null;
        }
    }

    function defaultLayout(leftFrac) {
        return {
            version: LAYOUT_VERSION,
            preset: 'classic',
            root: makeClassic(leftFrac),
        };
    }

    function installLayout(ctx) {
        if (!ctx?.els) throw new Error('installLayout(ctx): ctx.els required');

        const state = {
            preset: 'classic',
            root: makeClassic(0.42),
            draggingPanel: null,
            dropTarget: null,
            dropEdge: null,
        };

        function getPanels() {
            return {
                list: ctx.els.listPanel || document.getElementById('editorListPanel'),
                detail: ctx.els.detailPanel || document.getElementById('editorDetailPanel'),
                media: ctx.els.mediaPanel || document.getElementById('editorVideoWrap'),
                timeline: ctx.els.timelinePanel || document.getElementById('editorTimelinePanel'),
            };
        }

        function hostEl() {
            return ctx.els.main || document.getElementById('editorMain');
        }

        function readLeftFrac() {
            try {
                const saved = Number(localStorage.getItem('transub-editor-cues-width'));
                if (Number.isFinite(saved)) return Math.min(62, Math.max(28, saved)) / 100;
            } catch (_) { /* ignore */ }
            return 0.42;
        }

        function saveLayout() {
            try {
                localStorage.setItem(LAYOUT_KEY, JSON.stringify(serializeLayout(state)));
            } catch (_) { /* ignore */ }
            if (state.preset === 'classic' && state.root?.type === 'split' && state.root.dir === 'row') {
                const left = Math.round((state.root.sizes?.[0] || 0.42) * 100);
                try {
                    localStorage.setItem('transub-editor-cues-width', String(left));
                } catch (_) { /* ignore */ }
                document.documentElement.style.setProperty('--ed-cues-width', `${left}%`);
            }
            if (typeof ctx.onLayoutChanged === 'function') {
                ctx.onLayoutChanged({
                    preset: state.preset,
                    root: cloneNode(state.root),
                });
            }
        }

        function loadLayout() {
            const leftFrac = readLeftFrac();
            let next = null;
            try {
                next = parseLayout(localStorage.getItem(LAYOUT_KEY));
            } catch (_) {
                next = null;
            }
            if (!next) next = defaultLayout(leftFrac);
            state.preset = next.preset;
            state.root = next.root;
            return state;
        }

        function clearDropOverlay() {
            document.querySelectorAll('.editor-dock-drop-active').forEach((el) => {
                el.classList.remove('editor-dock-drop-active');
                el.removeAttribute('data-drop-edge');
            });
            state.dropTarget = null;
            state.dropEdge = null;
        }

        function applyFlexSizes(splitEl, sizes) {
            const panes = [...splitEl.querySelectorAll(':scope > .editor-layout-pane')];
            const dir = splitEl.dataset.dir === 'col' ? 'col' : 'row';
            const norm = normalizeSizes(sizes, panes.length);
            panes.forEach((pane, i) => {
                pane.style.flex = `${norm[i]} 1 0`;
                applyPaneBoxMins(pane, dir);
            });
        }

        /** 按当前面板内容刷新所有分割窗格的 min 尺寸（如开关波形后） */
        function refreshPaneMins() {
            const host = ctx.els?.layoutHost || document.getElementById('editorLayoutHost');
            if (!host) return;
            host.querySelectorAll('.editor-layout-split').forEach((splitEl) => {
                const dir = splitEl.dataset.dir === 'col' ? 'col' : 'row';
                splitEl.querySelectorAll(':scope > .editor-layout-pane').forEach((pane) => {
                    applyPaneBoxMins(pane, dir);
                });
            });
        }

        function bindSplitter(splitter, splitEl, path) {
            splitter.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dir = splitEl.dataset.dir === 'col' ? 'col' : 'row';
                const panes = [...splitEl.querySelectorAll(':scope > .editor-layout-pane')];
                if (panes.length < 2) return;
                const a = panes[0];
                const b = panes[1];
                const startPos = dir === 'row' ? e.clientX : e.clientY;
                const a0 = dir === 'row' ? a.getBoundingClientRect().width : a.getBoundingClientRect().height;
                const b0 = dir === 'row' ? b.getBoundingClientRect().width : b.getBoundingClientRect().height;
                const total = Math.max(1, a0 + b0);
                const minA = paneMinPx(a, dir);
                const minB = paneMinPx(b, dir);
                // 两侧下限之和过大时按比例压缩，避免无法拖动
                let useMinA = minA;
                let useMinB = minB;
                if (useMinA + useMinB > total) {
                    const scale = total / (useMinA + useMinB);
                    useMinA = Math.floor(useMinA * scale);
                    useMinB = Math.max(0, total - useMinA);
                }
                splitter.classList.add('is-dragging');
                document.body.classList.add('editor-layout-dragging');

                const onMove = (ev) => {
                    const pos = dir === 'row' ? ev.clientX : ev.clientY;
                    const delta = pos - startPos;
                    let aSize = a0 + delta;
                    aSize = Math.min(total - useMinB, Math.max(useMinA, aSize));
                    applyFlexSizes(splitEl, [aSize / total, (total - aSize) / total]);
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                    splitter.classList.remove('is-dragging');
                    document.body.classList.remove('editor-layout-dragging');
                    const a1 = dir === 'row' ? a.getBoundingClientRect().width : a.getBoundingClientRect().height;
                    const b1 = dir === 'row' ? b.getBoundingClientRect().width : b.getBoundingClientRect().height;
                    const t = Math.max(1, a1 + b1);
                    const nextRoot = updateSplitSizes(state.root, path, [a1 / t, b1 / t]);
                    if (nextRoot) {
                        state.root = nextRoot;
                        saveLayout();
                    }
                    if (typeof ctx.onLayoutResized === 'function') ctx.onLayoutResized();
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        }

        function buildNode(node, path) {
            if (node.type === 'panel') {
                const panels = getPanels();
                const el = panels[node.id];
                if (!el) {
                    const missing = document.createElement('div');
                    missing.className = 'editor-layout-missing';
                    missing.textContent = node.id;
                    return missing;
                }
                el.dataset.panel = node.id;
                el.classList.add('editor-dock-panel');
                return el;
            }

            const wrap = document.createElement('div');
            wrap.className = 'editor-layout-split';
            wrap.dataset.dir = node.dir;
            wrap.dataset.path = path;
            wrap.style.flexDirection = node.dir === 'col' ? 'column' : 'row';

            const sizes = normalizeSizes(node.sizes, node.children.length);
            node.children.forEach((child, i) => {
                const pane = document.createElement('div');
                pane.className = 'editor-layout-pane';
                pane.style.flex = `${sizes[i]} 1 0`;
                pane.appendChild(buildNode(child, path ? `${path}.${i}` : String(i)));
                applyPaneBoxMins(pane, node.dir === 'col' ? 'col' : 'row');
                wrap.appendChild(pane);
                if (i < node.children.length - 1) {
                    const splitter = document.createElement('div');
                    splitter.className = `editor-layout-splitter editor-layout-splitter-${node.dir}`;
                    splitter.title = node.dir === 'row' ? '拖拽调整左右比例' : '拖拽调整上下比例';
                    splitter.setAttribute('role', 'separator');
                    splitter.setAttribute('aria-orientation', node.dir === 'row' ? 'vertical' : 'horizontal');
                    bindSplitter(splitter, wrap, path);
                    wrap.appendChild(splitter);
                }
            });
            return wrap;
        }

        function renderLayout() {
            const host = hostEl();
            if (!host) return;
            const panels = getPanels();
            const park = document.createDocumentFragment();
            PANEL_IDS.forEach((id) => {
                if (panels[id]?.parentElement) park.appendChild(panels[id]);
            });

            host.innerHTML = '';
            host.classList.add('editor-main', 'editor-layout-host');
            host.dataset.layoutPreset = state.preset;
            const tree = normalizeTree(state.root) || makeClassic(0.42);
            state.root = tree;
            const rootEl = buildNode(tree, '');
            if (rootEl.classList?.contains('editor-layout-split')) {
                rootEl.classList.add('editor-layout-root');
                rootEl.style.flex = '1 1 0';
                rootEl.style.minWidth = '0';
                rootEl.style.minHeight = '0';
                host.appendChild(rootEl);
            } else {
                const wrap = document.createElement('div');
                wrap.className = 'editor-layout-pane editor-layout-root';
                wrap.style.flex = '1 1 0';
                wrap.appendChild(rootEl);
                host.appendChild(wrap);
            }
            bindPanelDrag();
            updateLayoutMenuUi();
            refreshPaneMins();
            if (typeof ctx.onLayoutResized === 'function') ctx.onLayoutResized();
        }

        function hitEdge(rect, clientX, clientY) {
            const x = (clientX - rect.left) / Math.max(1, rect.width);
            const y = (clientY - rect.top) / Math.max(1, rect.height);
            const edgeZone = 0.28;
            const dist = { left: x, right: 1 - x, top: y, bottom: 1 - y };
            let best = null;
            let bestVal = 1;
            EDGES.forEach((edge) => {
                if (dist[edge] < bestVal) {
                    bestVal = dist[edge];
                    best = edge;
                }
            });
            if (bestVal > edgeZone) {
                if (x < 0.5 && y >= 0.25 && y <= 0.75) return 'left';
                if (x >= 0.5 && y >= 0.25 && y <= 0.75) return 'right';
                if (y < 0.5) return 'top';
                return 'bottom';
            }
            return best;
        }

        function bindPanelDrag() {
            const panels = getPanels();
            PANEL_IDS.forEach((id) => {
                const panel = panels[id];
                if (!panel || panel.dataset.dragBound === '1') return;
                panel.dataset.dragBound = '1';
                const handle = panel.querySelector('.editor-dock-handle');
                if (!handle) return;

                handle.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    if (e.target.closest('button, select, input, a, textarea')) return;
                    e.preventDefault();
                    state.draggingPanel = id;
                    document.body.classList.add('editor-dock-dragging');
                    handle.setPointerCapture?.(e.pointerId);

                    const onMove = (ev) => {
                        if (!state.draggingPanel) return;
                        clearDropOverlay();
                        const el = document.elementFromPoint(ev.clientX, ev.clientY);
                        const targetPanel = el?.closest?.('.editor-dock-panel[data-panel]');
                        if (!targetPanel) return;
                        const targetId = targetPanel.getAttribute('data-panel');
                        if (!targetId || targetId === state.draggingPanel) return;
                        const edge = hitEdge(targetPanel.getBoundingClientRect(), ev.clientX, ev.clientY);
                        targetPanel.classList.add('editor-dock-drop-active');
                        targetPanel.setAttribute('data-drop-edge', edge);
                        state.dropTarget = targetId;
                        state.dropEdge = edge;
                    };
                    const onUp = () => {
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                        window.removeEventListener('pointercancel', onUp);
                        document.body.classList.remove('editor-dock-dragging');
                        const from = state.draggingPanel;
                        const to = state.dropTarget;
                        const edge = state.dropEdge;
                        state.draggingPanel = null;
                        clearDropOverlay();
                        if (from && to && edge) {
                            const next = dockPanel(state.root, from, to, edge);
                            if (next) {
                                state.root = next;
                                state.preset = 'custom';
                                saveLayout();
                                renderLayout();
                                if (typeof ctx.setStatus === 'function') {
                                    ctx.setStatus('布局已更新', 'ok');
                                }
                            }
                        }
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                    window.addEventListener('pointercancel', onUp);
                });
            });
        }

        function applyPreset(presetId) {
            const id = PRESETS[presetId] ? presetId : 'classic';
            state.preset = id;
            state.root = presetTree(id, readLeftFrac());
            saveLayout();
            renderLayout();
            if (typeof ctx.setStatus === 'function') {
                ctx.setStatus(`布局：${PRESETS[id].label}`, 'ok');
            }
        }

        function resetLayout() {
            try { localStorage.removeItem(LAYOUT_KEY); } catch (_) { /* ignore */ }
            applyPreset('classic');
            if (typeof ctx.setStatus === 'function') {
                ctx.setStatus('已重置为经典布局', 'ok');
            }
        }

        function getLayoutState() {
            return {
                preset: state.preset,
                root: cloneNode(state.root),
            };
        }

        function updateLayoutMenuUi() {
            const preset = state.preset;
            document.querySelectorAll('[data-layout-preset]').forEach((btn) => {
                const id = btn.getAttribute('data-layout-preset');
                const active = id === preset;
                btn.classList.toggle('active', !!active);
                btn.setAttribute('aria-checked', active ? 'true' : 'false');
            });
            const customBtn = document.querySelector('[data-layout-preset="custom"]');
            if (customBtn) {
                customBtn.classList.toggle('hidden', preset !== 'custom');
                customBtn.classList.toggle('active', preset === 'custom');
            }
            const label = document.getElementById('editorLayoutMenuLabel');
            if (label) {
                label.textContent = preset === 'custom'
                    ? '自定义'
                    : (PRESETS[preset]?.label || '布局');
            }
        }

        function initLayout() {
            loadLayout();
            renderLayout();
        }

        ctx.layoutApi = {
            PANEL_IDS,
            PRESETS,
            LAYOUT_KEY,
            LAYOUT_VERSION,
            normalizeTree,
            dockPanel,
            removePanel,
            presetTree,
            makeClassic,
            makeImmersive,
            makeFocus,
            makeWidescreen,
            parseLayout,
            serializeLayout,
            expandLegacyMedia,
            initLayout,
            renderLayout,
            applyPreset,
            resetLayout,
            getLayoutState,
            saveLayout,
            loadLayout,
            updateLayoutMenuUi,
            refreshPaneMins,
        };
        return ctx.layoutApi;
    }

    const api = {
        LAYOUT_KEY,
        LAYOUT_VERSION,
        PANEL_IDS,
        PRESETS,
        MIN_PANE_WIDTH_PX,
        MIN_PANE_HEIGHT_PX,
        MIN_MEDIA_HEIGHT_PX,
        MIN_TIMELINE_HEIGHT_BASE_PX,
        timelineMinHeightPx,
        paneMinPx,
        normalizeTree,
        normalizeSizes,
        collectPanelIds,
        cloneNode,
        removePanel,
        replacePanel,
        dockPanel,
        updateSplitSizes,
        findSplitAtPath,
        presetTree,
        makeClassic,
        makeImmersive,
        makeFocus,
        makeWidescreen,
        mediaStack,
        expandLegacyMedia,
        parseLayout,
        serializeLayout,
        defaultLayout,
        installLayout,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.layout = api;
    global.TransubEditorParts.installLayout = installLayout;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
