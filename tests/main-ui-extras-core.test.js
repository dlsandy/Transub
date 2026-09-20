'use strict';

const assert = require('assert');
const {
    createMainUiExtras,
    isTypingTarget,
} = require('../src/js/main-ui-extras-core.js');

function makeListenerEl() {
    const listeners = Object.create(null);
    return {
        listeners,
        addEventListener(type, fn) {
            (listeners[type] || (listeners[type] = [])).push(fn);
        },
        classList: {
            contains() { return false; },
            toggle() {},
        },
        dataset: {},
        closest() { return null; },
        querySelectorAll() { return []; },
        getAttribute() { return ''; },
        setAttribute() {},
        contains() { return true; },
        disabled: false,
        checked: false,
        value: '',
        innerHTML: '',
        innerText: '',
    };
}

describe('TransubMainUiExtras', () => {
    it('exports createMainUiExtras and isTypingTarget', () => {
        assert.strictEqual(typeof createMainUiExtras, 'function');
        assert.strictEqual(typeof isTypingTarget, 'function');
    });

    it('isTypingTarget detects form fields and contentEditable', () => {
        assert.strictEqual(isTypingTarget(null), false);
        assert.strictEqual(isTypingTarget({ tagName: 'INPUT' }), true);
        assert.strictEqual(isTypingTarget({ tagName: 'TEXTAREA' }), true);
        assert.strictEqual(isTypingTarget({ tagName: 'SELECT' }), true);
        assert.strictEqual(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
        assert.strictEqual(isTypingTarget({ tagName: 'DIV' }), false);
    });

    it('bindMainUiExtras wires more-menu and calls bindMainLogSplitter', () => {
        let logSplitterCalls = 0;
        let moreMenuOpen = null;
        const moreMenuBtn = makeListenerEl();
        const state = { moreMenuOpen: false, items: [], running: false, retranslateBusy: false };
        const api = createMainUiExtras({
            state,
            els: { moreMenuBtn },
            bindMainLogSplitter: () => { logSplitterCalls += 1; },
            setMoreMenuOpen: (v) => { moreMenuOpen = v; },
            getDocument: () => ({
                querySelectorAll: () => [],
                addEventListener: () => {},
                querySelector: () => null,
            }),
        });

        assert.strictEqual(typeof api.bindMainUiExtras, 'function');
        api.bindMainUiExtras();
        assert.strictEqual(logSplitterCalls, 1);
        assert.ok(moreMenuBtn.listeners.click?.length >= 1);
        moreMenuBtn.listeners.click[0]({ stopPropagation() {} });
        assert.strictEqual(moreMenuOpen, true);
    });
});
