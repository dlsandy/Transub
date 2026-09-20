const assert = require('assert');
const core = require('../src/js/log-auto-scroll-core');

describe('log-auto-scroll-core', () => {
    const mem = new Map();
    const rafQueue = [];

    beforeEach(() => {
        mem.clear();
        rafQueue.length = 0;
        global.localStorage = {
            getItem: (k) => (mem.has(k) ? mem.get(k) : null),
            setItem: (k, v) => { mem.set(k, String(v)); },
            removeItem: (k) => { mem.delete(k); },
        };
        global.requestAnimationFrame = (fn) => {
            rafQueue.push(fn);
            return rafQueue.length;
        };
    });

    afterEach(() => {
        delete global.localStorage;
        delete global.requestAnimationFrame;
    });

    function flushRaf() {
        const q = rafQueue.splice(0, rafQueue.length);
        q.forEach((fn) => fn());
    }

    it('defaults to enabled when unset', () => {
        assert.strictEqual(core.readEnabled(), true);
        assert.strictEqual(core.isEnabled(), true);
    });

    it('persists off/on via writeEnabled', () => {
        core.writeEnabled(false);
        assert.strictEqual(core.readEnabled(), false);
        core.writeEnabled(true);
        assert.strictEqual(core.readEnabled(), true);
    });

    it('prefers checkbox checked state when provided', () => {
        core.writeEnabled(false);
        assert.strictEqual(core.isEnabled({ checked: true }), true);
        assert.strictEqual(core.isEnabled({ checked: false }), false);
    });

    it('scrollPanel only scrolls when enabled', () => {
        const panel = { scrollTop: 0, scrollHeight: 400 };
        core.writeEnabled(false);
        core.scrollPanel(panel);
        assert.strictEqual(panel.scrollTop, 0);
        assert.strictEqual(rafQueue.length, 0);
        core.writeEnabled(true);
        core.scrollPanel(panel);
        assert.strictEqual(panel.scrollTop, 400);
        panel.scrollHeight = 520;
        flushRaf();
        assert.strictEqual(panel.scrollTop, 520);
    });

    it('scrollPanel pins last log line into view then settles scrollTop', () => {
        const seen = [];
        const last = {
            scrollIntoView(opts) { seen.push(opts); },
        };
        const host = {
            id: 'logHost',
            lastElementChild: last,
        };
        const panel = {
            scrollTop: 0,
            scrollHeight: 800,
            querySelector(sel) {
                if (String(sel).includes('logHost')) return host;
                return null;
            },
        };
        core.writeEnabled(true);
        core.scrollPanel(panel, { checked: true });
        assert.strictEqual(seen.length, 1);
        assert.strictEqual(seen[0].block, 'end');
        assert.strictEqual(panel.scrollTop, 800);
        panel.scrollHeight = 900;
        flushRaf();
        assert.strictEqual(seen.length, 2);
        assert.strictEqual(panel.scrollTop, 900);
    });
});
