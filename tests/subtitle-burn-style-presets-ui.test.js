'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPresetsUi(doc) {
    const code = fs.readFileSync(
        path.join(__dirname, '../src/js/subtitle-burn-style-presets-ui.js'),
        'utf8',
    );
    const sandbox = {
        globalThis: null,
        window: null,
        document: doc,
        console,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.runInNewContext(code, sandbox, { filename: 'subtitle-burn-style-presets-ui.js' });
    return sandbox.TransubSubtitleBurnStylePresetsUi;
}

function makeEl(id) {
    const listeners = [];
    return {
        id,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, fn) {
            listeners.push({ type, fn });
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        _listeners: listeners,
    };
}

describe('subtitle-burn-style-presets-ui deferred bind', () => {
    it('does not mark bound when burn fragment DOM is missing', () => {
        const doc = {
            getElementById() { return null; },
            addEventListener() {},
        };
        const api = loadPresetsUi(doc);
        api.init({});
        assert.strictEqual(api.isBound(), false);
        // Second call after DOM still missing must keep retrying (not stuck bound).
        api.init({});
        assert.strictEqual(api.isBound(), false);
    });

    it('binds preset chip click after fragment elements appear', () => {
        const els = {};
        const doc = {
            getElementById(id) { return els[id] || null; },
            addEventListener() {},
        };
        const api = loadPresetsUi(doc);
        api.init({});
        assert.strictEqual(api.isBound(), false);

        els.burnStylePresetsBtn = makeEl('burnStylePresetsBtn');
        els.burnStylePresetsModal = makeEl('burnStylePresetsModal');
        api.init({});
        assert.strictEqual(api.isBound(), true);
        const clicks = els.burnStylePresetsBtn._listeners.filter((l) => l.type === 'click');
        assert.ok(clicks.length >= 1, 'preset chip should have a click listener');
    });
});
