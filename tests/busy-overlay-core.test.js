'use strict';

const assert = require('assert');
const {
    showBusyOverlay,
    showBusyOverlayAndWait,
    hideBusyOverlay,
    updateBusyOverlayMessage,
    isBusyOverlayVisible,
    OVERLAY_ID,
} = require('../src/js/busy-overlay-core.js');

describe('TransubBusyOverlay', () => {
    /** @type {import('jsdom').JSDOM | null} */
    let dom = null;

    beforeEach(() => {
        // Minimal document stub without jsdom dependency.
        const store = new Map();
        const bodyChildren = [];
        const body = {
            appendChild(node) {
                const idx = bodyChildren.indexOf(node);
                if (idx >= 0) bodyChildren.splice(idx, 1);
                bodyChildren.push(node);
                node.parentNode = body;
                store.set(node.id, node);
                return node;
            },
        };
        const headChildren = [];
        const head = {
            appendChild(node) {
                headChildren.push(node);
                if (node.id) store.set(node.id, node);
                return node;
            },
        };
        global.document = {
            body,
            head,
            getElementById(id) {
                return store.get(id) || null;
            },
            createElement(tag) {
                const el = {
                    tagName: String(tag).toUpperCase(),
                    id: '',
                    style: { cssText: '', display: '' },
                    attributes: {},
                    parentNode: null,
                    innerHTML: '',
                    textContent: '',
                    setAttribute(k, v) { this.attributes[k] = v; },
                    getAttribute(k) { return this.attributes[k]; },
                    querySelector() { return null; },
                };
                return el;
            },
        };
        // Patch getElementById after message node is embedded via innerHTML — emulate by
        // creating message element when show sets innerHTML-like content.
        const origCreate = global.document.createElement.bind(global.document);
        global.document.createElement = (tag) => {
            const el = origCreate(tag);
            const origSetInner = Object.getOwnPropertyDescriptor(el, 'innerHTML')
                || { configurable: true, enumerable: true, writable: true, value: '' };
            Object.defineProperty(el, 'innerHTML', {
                configurable: true,
                enumerable: true,
                get() { return this._innerHTML || ''; },
                set(html) {
                    this._innerHTML = String(html || '');
                    const m = /id="([^"]+)"/.exec(this._innerHTML);
                    if (m) {
                        const msg = origCreate('p');
                        msg.id = m[1];
                        msg.textContent = '';
                        store.set(msg.id, msg);
                    }
                },
            });
            void origSetInner;
            return el;
        };
    });

    afterEach(() => {
        delete global.document;
        void dom;
    });

    it('shows and hides with inline flex display', async () => {
        const el = await showBusyOverlayAndWait('正在探测视频信息…', { settleMs: 0 });
        assert.ok(el);
        assert.strictEqual(el.id, OVERLAY_ID);
        assert.ok(String(el.style.cssText).includes('display:flex') || el.style.display === 'flex');
        assert.ok(isBusyOverlayVisible());
        updateBusyOverlayMessage('正在探测视频信息 (1/2)…');
        hideBusyOverlay();
        assert.ok(String(el.style.cssText).includes('display:none'));
        assert.strictEqual(isBusyOverlayVisible(), false);
    });
});
