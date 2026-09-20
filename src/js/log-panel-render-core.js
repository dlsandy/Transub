/**
 * High-volume log panel renderer: ring buffer + rAF coalesced DOM sync.
 * When the log sheet is closed, DOM work is deferred until open/flush.
 * While open, appends are incremental so manual scroll position is preserved.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLogPanelRender = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function logPanelRenderFactory(global) {
    const TONE_CLASS = {
        ok: 'text-emerald-700',
        warn: 'text-amber-700',
        err: 'text-red-700',
        info: 'text-gray-600',
    };

    const hostRegistry = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    const fallbackRegistry = hostRegistry ? null : new Map();

    function toneClass(tone) {
        return TONE_CLASS[tone] || TONE_CLASS.info;
    }

    function defaultIsDomLive(host) {
        if (!host) return false;
        const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
        const modal = doc?.getElementById?.('logDetailModal');
        if (modal) return modal.classList.contains('is-open');
        return !!(host.isConnected !== false);
    }

    function scheduleFrame(fn) {
        if (typeof requestAnimationFrame === 'function') {
            return requestAnimationFrame(fn);
        }
        return setTimeout(fn, 16);
    }

    function cancelFrame(id) {
        if (id == null) return;
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
            return;
        }
        clearTimeout(id);
    }

    /**
     * @param {HTMLElement} host
     * @param {object} [opts]
     */
    function createLogPanelRenderer(host, opts) {
        const o = opts || {};
        if (!host) {
            return {
                append() {},
                replaceLast() { return false; },
                clear() {},
                trim() {},
                flush() {},
                getText() { return ''; },
                getDisplayText() { return ''; },
                getEntries() { return []; },
                getLastEntry() { return null; },
                getLastElement() { return null; },
                isEmpty() { return true; },
            };
        }

        const maxLines = Number(o.maxLines) > 0 ? Math.floor(Number(o.maxLines)) : 100;
        // Session archive for copy/export — kept past the DOM ring buffer.
        const archiveMaxLines = Number(o.archiveMaxLines) > 0
            ? Math.floor(Number(o.archiveMaxLines))
            : Math.max(maxLines * 200, 50000);
        const lineClass = String(o.lineClass || 'log-line');
        const isDomLive = typeof o.isDomLive === 'function' ? o.isDomLive : () => defaultIsDomLive(host);
        const onAfterFlush = typeof o.onAfterFlush === 'function' ? o.onAfterFlush : null;
        const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);

        /** @type {{ text: string, className: string, meta: Record<string,string>|null }[]} */
        let entries = [];
        /** @type {string[]} full session lines (not trimmed by maxLines) */
        let archive = [];
        let dirty = false;
        let needsFullRebuild = true;
        let lastPatched = false;
        let rafId = null;
        let placeholderHtml = null;
        let deferredDomCleared = false;

        function markReady() {
            try {
                host.dataset.logPanelReady = '1';
            } catch (_) { /* ignore */ }
        }

        function clearReady() {
            try {
                delete host.dataset.logPanelReady;
            } catch (_) { /* ignore */ }
        }

        function isPlaceholderHost() {
            if (host.dataset?.logPanelReady === '1') return false;
            if (entries.length) return false;
            if (host.querySelector?.('.text-gray-400')) return true;
            const t = String(host.textContent || '').trim();
            if (!t) return true;
            return /将显示在此处|已清空/.test(t);
        }

        function clearDomChildren() {
            if ('replaceChildren' in host && typeof host.replaceChildren === 'function') {
                host.replaceChildren();
            } else if ('innerHTML' in host) {
                host.innerHTML = '';
            }
        }

        function applyMeta(row, meta) {
            if (!row || !meta) return;
            for (const [k, v] of Object.entries(meta)) {
                try {
                    row.dataset[k] = String(v);
                } catch (_) { /* ignore */ }
            }
        }

        function buildRow(entry) {
            if (!doc?.createElement) return null;
            const row = doc.createElement('div');
            row.className = entry.className || lineClass;
            row.textContent = entry.text;
            applyMeta(row, entry.meta);
            return row;
        }

        function pushArchive(text) {
            archive.push(String(text ?? ''));
            if (archive.length > archiveMaxLines) {
                archive = archive.slice(archive.length - archiveMaxLines);
            }
        }

        function pushEntry(entry) {
            pushArchive(entry.text);
            entries.push(entry);
            if (entries.length > maxLines) {
                entries = entries.slice(entries.length - maxLines);
                needsFullRebuild = true;
            }
            dirty = true;
            lastPatched = false;
            scheduleFlush();
        }

        function append(text, optsIn) {
            const opt = optsIn || {};
            const body = String(text ?? '');
            const cls = opt.className
                || `${lineClass} ${toneClass(opt.tone)}`;
            const meta = opt.meta && typeof opt.meta === 'object' ? { ...opt.meta } : null;
            pushEntry({ text: body, className: cls, meta });
        }

        function replaceLast(text, optsIn) {
            if (!entries.length) return false;
            const opt = optsIn || {};
            const last = entries[entries.length - 1];
            last.text = String(text ?? '');
            if (archive.length) archive[archive.length - 1] = last.text;
            if (opt.className) last.className = opt.className;
            else if (opt.tone) last.className = `${lineClass} ${toneClass(opt.tone)}`;
            if (opt.meta && typeof opt.meta === 'object') {
                last.meta = { ...(last.meta || {}), ...opt.meta };
            }
            dirty = true;
            lastPatched = true;
            scheduleFlush();
            return true;
        }

        function clear(placeholder) {
            entries = [];
            archive = [];
            dirty = false;
            needsFullRebuild = true;
            lastPatched = false;
            deferredDomCleared = false;
            cancelFrame(rafId);
            rafId = null;
            clearReady();
            const html = placeholder == null
                ? '<span class="text-gray-400">日志已清空</span>'
                : String(placeholder);
            placeholderHtml = html;
            if (doc && 'innerHTML' in host) {
                host.innerHTML = html;
            } else if ('textContent' in host) {
                host.textContent = '';
            }
            onAfterFlush?.(host, { cleared: true, live: isDomLive(host) });
        }

        function trim(max) {
            const n = Number(max);
            if (!(n > 0) || entries.length <= n) return;
            entries = entries.slice(entries.length - Math.floor(n));
            dirty = true;
            needsFullRebuild = true;
            lastPatched = false;
            scheduleFlush();
        }

        function rebuildDom() {
            if (!doc) return;
            if (!entries.length) {
                if (placeholderHtml != null && 'innerHTML' in host) {
                    host.innerHTML = placeholderHtml;
                } else {
                    clearDomChildren();
                }
                clearReady();
                needsFullRebuild = true;
                return;
            }
            const frag = doc.createDocumentFragment ? doc.createDocumentFragment() : null;
            const rows = [];
            for (let i = 0; i < entries.length; i += 1) {
                const row = buildRow(entries[i]);
                if (!row) continue;
                if (frag) frag.appendChild(row);
                else rows.push(row);
            }
            if ('replaceChildren' in host && typeof host.replaceChildren === 'function') {
                if (frag) host.replaceChildren(frag);
                else host.replaceChildren(...rows);
            } else {
                clearDomChildren();
                if (frag) host.appendChild(frag);
                else rows.forEach((r) => host.appendChild(r));
            }
            markReady();
            needsFullRebuild = false;
        }

        function appendNewRows() {
            const have = host.childElementCount || 0;
            if (have > entries.length) {
                rebuildDom();
                return;
            }
            if (have === entries.length) {
                if (lastPatched && host.lastElementChild && entries.length) {
                    const last = entries[entries.length - 1];
                    host.lastElementChild.className = last.className || lineClass;
                    host.lastElementChild.textContent = last.text;
                    applyMeta(host.lastElementChild, last.meta);
                }
                return;
            }
            const frag = doc?.createDocumentFragment?.() || null;
            for (let i = have; i < entries.length; i += 1) {
                const row = buildRow(entries[i]);
                if (!row) continue;
                if (frag) frag.appendChild(row);
                else host.appendChild(row);
            }
            if (frag) host.appendChild(frag);
            markReady();
        }

        function flush(force) {
            cancelFrame(rafId);
            rafId = null;
            const live = isDomLive(host);
            // After deferred close, dirty is cleared but needsFullRebuild stays set —
            // opening the sheet must still paint from the buffer.
            if (!dirty && !force && !(needsFullRebuild && live && entries.length)) return;
            if (!live && !force) {
                if (!deferredDomCleared && entries.length && host.childElementCount > 0) {
                    // Drop stale nodes while sheet is closed; buffer keeps lines.
                    clearDomChildren();
                    markReady();
                    deferredDomCleared = true;
                }
                dirty = false;
                needsFullRebuild = true;
                lastPatched = false;
                onAfterFlush?.(host, { cleared: false, live: false, deferred: true });
                return;
            }
            deferredDomCleared = false;
            const outOfSync = (host.childElementCount || 0) !== entries.length;
            if (needsFullRebuild || !host.childElementCount || (force && outOfSync)) {
                rebuildDom();
            } else {
                appendNewRows();
            }
            dirty = false;
            lastPatched = false;
            onAfterFlush?.(host, { cleared: false, live: true, deferred: false });
        }

        function scheduleFlush() {
            if (rafId != null) return;
            rafId = scheduleFrame(() => {
                rafId = null;
                flush(false);
            });
        }

        function getDisplayText() {
            if (entries.length) {
                return entries.map((e) => e.text).join('\n');
            }
            if (isPlaceholderHost()) return '';
            return String(host.innerText || host.textContent || '').trim();
        }

        /** Full session log for copy/export (includes lines trimmed from the DOM ring). */
        function getText() {
            if (archive.length) {
                return archive.join('\n');
            }
            return getDisplayText();
        }

        function getEntries() {
            return entries.slice();
        }

        function getLastEntry() {
            return entries.length ? entries[entries.length - 1] : null;
        }

        function getLastElement() {
            if (!isDomLive(host) && dirty) flush(true);
            return host.lastElementChild || null;
        }

        function isEmpty() {
            return entries.length === 0;
        }

        return {
            append,
            replaceLast,
            clear,
            trim,
            flush,
            getText,
            getDisplayText,
            getEntries,
            getLastEntry,
            getLastElement,
            isEmpty,
            get maxLines() { return maxLines; },
            get archiveMaxLines() { return archiveMaxLines; },
            get size() { return entries.length; },
            get archiveSize() { return archive.length; },
        };
    }

    function registryGet(host) {
        if (!host) return null;
        if (hostRegistry) return hostRegistry.get(host) || null;
        return fallbackRegistry.get(host) || null;
    }

    function registrySet(host, renderer) {
        if (!host) return;
        if (hostRegistry) hostRegistry.set(host, renderer);
        else fallbackRegistry.set(host, renderer);
    }

    function getOrCreate(host, opts) {
        let r = registryGet(host);
        if (r) return r;
        r = createLogPanelRenderer(host, opts);
        registrySet(host, r);
        return r;
    }

    function flushHost(host, force) {
        const r = registryGet(host);
        if (r) r.flush(!!force);
    }

    function flushAllVisible(docLike) {
        const doc = docLike || (typeof document !== 'undefined' ? document : null);
        if (!doc) return;
        const app = doc.getElementById('logHost');
        const infer = doc.getElementById('inferLogHost');
        if (app) flushHost(app, true);
        if (infer) flushHost(infer, true);
    }

    return {
        TONE_CLASS,
        toneClass,
        createLogPanelRenderer,
        getOrCreate,
        get: registryGet,
        flushHost,
        flushAllVisible,
        defaultIsDomLive,
    };
}));
