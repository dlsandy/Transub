const assert = require('assert');
const { createAppUpdateBadge } = require('../src/js/app-update-badge-core.js');

describe('app-update-badge-core', () => {
    it('shows and hides the titlebar upgrade button from notice payload', () => {
        const btn = {
            hidden: true,
            classList: {
                _hidden: true,
                toggle(name, on) {
                    if (name === 'hidden') this._hidden = !!on;
                },
            },
            title: '',
            dataset: {},
            attrs: {},
            setAttribute(k, v) { this.attrs[k] = v; },
            addEventListener() {},
        };
        let opened = 0;
        let listener = null;
        const api = createAppUpdateBadge({
            getButtonEl: () => btn,
            openUpdateWindow: () => { opened += 1; },
            onAvailable: (cb) => { listener = cb; },
            getAvailability: () => ({ updateAvailable: false }),
        });
        api.bind();
        assert.strictEqual(btn.hidden, true);

        listener({ updateAvailable: true, latestVersion: '1.2.3' });
        assert.strictEqual(btn.hidden, false);
        assert.strictEqual(btn.classList._hidden, false);
        assert.ok(/v1\.2\.3/.test(btn.title), btn.title);

        listener({ updateAvailable: false });
        assert.strictEqual(btn.hidden, true);
        assert.strictEqual(opened, 0);
    });
});
