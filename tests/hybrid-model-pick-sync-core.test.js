const assert = require('assert');
const sync = require('../src/js/hybrid-model-pick-sync-core');

function makeSelect(options, value = '') {
    const el = {
        options: options.map((o) => ({
            value: o.value,
            textContent: o.label || o.value,
            disabled: !!o.disabled,
        })),
        value,
        disabled: false,
        innerHTML: '',
        appendChild(opt) {
            this.options.push(opt);
        },
    };
    // Proxy assignment so copySelectState can set .value
    return el;
}

describe('hybrid-model-pick-sync-core', () => {
    it('copies options and value primary → mirror', () => {
        const primary = makeSelect([
            { value: '', label: '自动' },
            { value: 'sakura-7b', label: 'Sakura 7B' },
        ], 'sakura-7b');
        const mirror = makeSelect([{ value: 'old', label: 'old' }], 'old');
        assert.ok(sync.syncMirrorFromPrimary({ primary, mirror }));
        assert.strictEqual(mirror.options.length, 2);
        assert.strictEqual(mirror.value, 'sakura-7b');
        assert.strictEqual(mirror.options[1].value, 'sakura-7b');
    });

    it('copies mirror → primary', () => {
        const primary = makeSelect([
            { value: '', label: '自动' },
            { value: 'sakura-7b', label: 'Sakura 7B' },
            { value: 'galtransl', label: 'Gal' },
        ], '');
        const mirror = makeSelect([
            { value: '', label: '自动' },
            { value: 'sakura-7b', label: 'Sakura 7B' },
            { value: 'galtransl', label: 'Gal' },
        ], 'galtransl');
        assert.ok(sync.syncPrimaryFromMirror({ primary, mirror }));
        assert.strictEqual(primary.value, 'galtransl');
    });

    it('no-ops when either select missing', () => {
        assert.strictEqual(sync.syncMirrorFromPrimary({}), false);
        assert.strictEqual(sync.syncPrimaryFromMirror({ primary: makeSelect([]) }), false);
    });
});
