'use strict';

const assert = require('assert');
const core = require('../src/js/log-panel-render-core.js');

function makeHost() {
    const children = [];
    const host = {
        dataset: {},
        textContent: '日志将显示在此处…',
        innerHTML: '日志将显示在此处…',
        innerText: '',
        isConnected: true,
        get childElementCount() { return children.length; },
        get lastElementChild() { return children[children.length - 1] || null; },
        querySelector(sel) {
            if (sel === '.text-gray-400') return null;
            return null;
        },
        replaceChildren(...nodes) {
            children.length = 0;
            const list = nodes.length === 1 && nodes[0] && nodes[0].__frag
                ? nodes[0].__frag
                : nodes;
            for (const n of list) {
                if (n) children.push(n);
            }
            this.innerHTML = children.length ? 'x' : '';
            this.textContent = children.map((c) => c.textContent).join('\n');
        },
        appendChild(node) {
            if (node && node.__frag) {
                for (const n of node.__frag) children.push(n);
            } else if (node) {
                children.push(node);
            }
            this.textContent = children.map((c) => c.textContent).join('\n');
            return node;
        },
        _children: children,
    };
    return host;
}

function installDom(host, { modalOpen = false } = {}) {
    const modal = {
        classList: {
            _open: !!modalOpen,
            contains(name) { return name === 'is-open' && this._open; },
            add(name) { if (name === 'is-open') this._open = true; },
            remove(name) { if (name === 'is-open') this._open = false; },
        },
    };
    global.document = {
        getElementById(id) {
            if (id === 'logDetailModal') return modal;
            if (id === 'logHost') return host;
            return null;
        },
        createElement(tag) {
            return {
                tagName: String(tag || '').toUpperCase(),
                className: '',
                textContent: '',
                dataset: {},
            };
        },
        createDocumentFragment() {
            const frag = { __frag: [] };
            frag.appendChild = (n) => { frag.__frag.push(n); return n; };
            return frag;
        },
    };
    return modal;
}

describe('log-panel-render-core', () => {
    afterEach(() => {
        delete global.document;
        delete global.requestAnimationFrame;
        delete global.cancelAnimationFrame;
    });

    it('buffers lines while sheet is closed without growing DOM', () => {
        const host = makeHost();
        installDom(host, { modalOpen: false });
        const r = core.createLogPanelRenderer(host, { maxLines: 10, lineClass: 'log-line' });
        r.append('a', { tone: 'info' });
        r.append('b', { tone: 'warn' });
        r.flush(false);
        assert.strictEqual(r.size, 2);
        assert.strictEqual(host.childElementCount, 0);
        assert.ok(String(r.getText()).includes('a'));
        assert.ok(String(r.getText()).includes('b'));
    });

    it('paints buffer when force-flushed after open', () => {
        const host = makeHost();
        const modal = installDom(host, { modalOpen: false });
        const r = core.createLogPanelRenderer(host, { maxLines: 10, lineClass: 'log-line' });
        r.append('hello', { tone: 'info' });
        r.flush(false);
        assert.strictEqual(host.childElementCount, 0);
        modal.classList.add('is-open');
        r.flush(true);
        assert.strictEqual(host.childElementCount, 1);
        assert.ok(String(host._children[0].textContent).includes('hello'));
        assert.ok(host._children[0].className.includes('log-line'));
    });

    it('trims display ring buffer to maxLines but keeps full archive for getText', () => {
        const host = makeHost();
        installDom(host, { modalOpen: true });
        const r = core.createLogPanelRenderer(host, { maxLines: 3, lineClass: 'log-line' });
        r.append('1', { tone: 'info' });
        r.append('2', { tone: 'info' });
        r.append('3', { tone: 'info' });
        r.append('4', { tone: 'info' });
        r.flush(true);
        assert.strictEqual(r.size, 3);
        assert.strictEqual(r.archiveSize, 4);
        assert.strictEqual(host.childElementCount, 3);
        assert.ok(!r.getDisplayText().includes('1\n') && !r.getDisplayText().startsWith('1'));
        assert.ok(r.getDisplayText().includes('4'));
        assert.ok(r.getText().startsWith('1'));
        assert.ok(r.getText().includes('4'));
    });

    it('replaceLast updates archive last line for copy/export', () => {
        const host = makeHost();
        installDom(host, { modalOpen: true });
        const r = core.createLogPanelRenderer(host, { maxLines: 2, archiveMaxLines: 10, lineClass: 'log-line' });
        r.append('a', { tone: 'info' });
        r.append('b', { tone: 'info' });
        r.append('c', { tone: 'info' });
        r.replaceLast('c2', { tone: 'info' });
        assert.ok(r.getText().endsWith('c2'));
        assert.ok(r.getText().includes('a'));
    });

    it('clear wipes both display and archive', () => {
        const host = makeHost();
        installDom(host, { modalOpen: true });
        const r = core.createLogPanelRenderer(host, { maxLines: 3, lineClass: 'log-line' });
        r.append('1', { tone: 'info' });
        r.append('2', { tone: 'info' });
        r.clear();
        assert.strictEqual(r.size, 0);
        assert.strictEqual(r.archiveSize, 0);
        assert.strictEqual(r.getText(), '');
    });

    it('replaceLast updates buffer meta for download progress reuse', () => {
        const host = makeHost();
        installDom(host, { modalOpen: true });
        const r = core.createLogPanelRenderer(host, { maxLines: 5, lineClass: 'log-line' });
        r.append('dl 1%', { className: 'log-line text-gray-600', meta: { engineDlProgress: '1' } });
        r.flush(true);
        assert.strictEqual(r.getLastEntry().meta.engineDlProgress, '1');
        r.replaceLast('dl 2%', { className: 'log-line text-gray-600', meta: { engineDlProgress: '1' } });
        r.flush(true);
        assert.strictEqual(r.getLastEntry().text, 'dl 2%');
        assert.strictEqual(host._children[0].textContent, 'dl 2%');
    });

    it('coalesces multiple appends into one rAF flush', async () => {
        const host = makeHost();
        installDom(host, { modalOpen: true });
        let frames = 0;
        global.requestAnimationFrame = (fn) => {
            frames += 1;
            return setTimeout(fn, 0);
        };
        global.cancelAnimationFrame = (id) => clearTimeout(id);
        const r = core.createLogPanelRenderer(host, { maxLines: 20, lineClass: 'log-line' });
        r.append('a', { tone: 'info' });
        r.append('b', { tone: 'info' });
        r.append('c', { tone: 'info' });
        assert.strictEqual(frames, 1);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.strictEqual(host.childElementCount, 3);
    });
});
