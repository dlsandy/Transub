'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('TransubSettingsDomLoad', () => {
    beforeEach(() => {
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        delete require.cache[require.resolve('../src/js/settings-dom-load-core.js')];
    });

    it('exports ensureSettingsDom / isReady', () => {
        // Load fragment core first so settings wrapper can find it on global.
        const frag = require('../src/js/ui-fragment-load-core.js');
        global.TransubUiFragmentLoad = frag;
        const api = require('../src/js/settings-dom-load-core.js');
        assert.strictEqual(typeof api.ensureSettingsDom, 'function');
        assert.strictEqual(typeof api.isReady, 'function');
    });

    it('source index uses pending placeholder when fragment exists', () => {
        const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
        const fragPath = path.join(__dirname, '../src/settings-panels.fragment.html');
        assert.ok(fs.existsSync(fragPath), 'settings-panels.fragment.html must exist');
        assert.ok(
            html.includes('data-settings-dom="pending"') || html.includes('data-ui-fragment="pending"'),
            'index.html should keep a pending #paramsModal placeholder',
        );
        assert.ok(
            !html.includes('id="engineInstallPathInput"'),
            'index.html should not inline settings install-path control',
        );
        const frag = fs.readFileSync(fragPath, 'utf8');
        assert.ok(
            frag.includes('id="advancedManagedInstallRuntimeBtn"'),
            'fragment must contain llama-server runtime actions',
        );
    });
});
