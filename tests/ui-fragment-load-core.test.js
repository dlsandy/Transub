'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('TransubUiFragmentLoad', () => {
    beforeEach(() => {
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        delete require.cache[require.resolve('../src/js/settings-dom-load-core.js')];
    });

    it('exports ensureUiFragment / workspaceFragmentKey', () => {
        const api = require('../src/js/ui-fragment-load-core.js');
        assert.strictEqual(typeof api.ensureUiFragment, 'function');
        assert.strictEqual(api.workspaceFragmentKey('shelf'), 'workspace-shelf');
        assert.strictEqual(api.workspaceFragmentKey('scenes'), 'workspace-scenes');
        assert.strictEqual(api.workspaceFragmentKey('models'), 'workspace-models');
        assert.strictEqual(api.workspaceFragmentKey('burn'), 'workspace-burn');
    });

    it('injects multi-root workspace fragment', async () => {
        const replaced = [];
        const makePending = (id) => ({
            id,
            getAttribute: (name) => (name === 'data-ui-fragment' ? 'pending' : null),
            replaceWith(next) {
                replaced.push(id);
                global.document._els[id] = next;
            },
        });
        global.document = {
            _els: {
                workspaceModels: makePending('workspaceModels'),
                engineModelsLabModal: makePending('engineModelsLabModal'),
            },
            getElementById(id) {
                return this._els[id] || null;
            },
            createElement() {
                return {
                    innerHTML: '',
                    get children() {
                        const html = String(this.innerHTML || '');
                        const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
                        return ids.map((id) => ({
                            id,
                            removeAttribute() {},
                        }));
                    },
                };
            },
            body: { appendChild() {} },
        };
        global.CustomEvent = class CustomEvent {
            constructor(type, init) { this.type = type; this.detail = init?.detail; }
        };
        global.dispatchEvent = () => {};
        global.__ELECTRON__ = {
            async transubReadUiFragment() {
                return {
                    ok: true,
                    html: '<section id="workspaceModels"></section>\n<div id="engineModelsLabModal"></div>',
                };
            },
        };

        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        const api = require('../src/js/ui-fragment-load-core.js');
        assert.strictEqual(api.isReady('workspace-models'), false);
        await api.ensureUiFragment('workspace-models');
        assert.strictEqual(api.isReady('workspace-models'), true);
        assert.deepStrictEqual(replaced.sort(), ['engineModelsLabModal', 'workspaceModels']);
    });

    it('dispatches transub-ui-fragment-ready after settings-panels inject', async () => {
        const events = [];
        const makePending = (id) => ({
            id,
            getAttribute: (name) => (name === 'data-settings-dom' ? 'pending' : null),
            replaceWith(next) {
                global.document._els[id] = next;
            },
        });
        global.document = {
            _els: { paramsModal: makePending('paramsModal') },
            getElementById(id) {
                return this._els[id] || null;
            },
            createElement() {
                return {
                    innerHTML: '',
                    get children() {
                        return [{
                            id: 'paramsModal',
                            removeAttribute() {},
                        }];
                    },
                };
            },
            body: { appendChild() {} },
        };
        global.CustomEvent = class CustomEvent {
            constructor(type, init) { this.type = type; this.detail = init?.detail; }
        };
        global.dispatchEvent = (ev) => { events.push(ev); };
        global.__ELECTRON__ = {
            async transubReadUiFragment() {
                return { ok: true, html: '<div id="paramsModal"></div>' };
            },
        };

        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        const api = require('../src/js/ui-fragment-load-core.js');
        await api.ensureUiFragment('settings-panels');
        assert.ok(events.some((e) => e.type === 'transub-ui-fragment-ready' && e.detail?.key === 'settings-panels'));
    });

    it('registers factory chrome and editor modal fragments', () => {
        const api = require('../src/js/ui-fragment-load-core.js');
        assert.ok(api.REGISTRY['setup-wizard']);
        assert.ok(api.REGISTRY['factory-modals']);
        assert.ok(api.REGISTRY['editor-modals-drawers']);
        assert.ok(api.REGISTRY['editor-modals-tools']);
        assert.ok(api.REGISTRY['editor-modals-pro']);
        assert.strictEqual(typeof api.ensureFactoryChromeDom, 'function');
        assert.strictEqual(typeof api.ensureEditorModalDom, 'function');
    });

    it('source index keeps pending placeholders for workspaces', () => {
        const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
        for (const name of [
            'workspace-scenes.fragment.html',
            'workspace-shelf.fragment.html',
            'workspace-models.fragment.html',
            'workspace-burn.fragment.html',
            'setup-wizard.fragment.html',
            'factory-modals.fragment.html',
        ]) {
            assert.ok(fs.existsSync(path.join(__dirname, '../src', name)), name);
        }
        assert.ok(/id="workspaceShelf"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="workspaceScenes"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="workspaceModels"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="workspaceBurn"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="setupWizardModal"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="retranslateModal"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(html.includes('vendor/factory.css'));
        assert.ok(!html.includes('id="shelfCardList"'));
        assert.ok(!html.includes('id="scenesCardList"'));
        assert.ok(!html.includes('id="engineModelsList"'));
        assert.ok(!html.includes('id="burnBatchList"'));
        assert.ok(!html.includes('id="wizardUiLocaleList"'));
        assert.ok(!html.includes('id="retranslateModeLlm"'));
    });

    it('source editor keeps pending modal placeholders and external CSS', () => {
        const html = fs.readFileSync(path.join(__dirname, '../src/subtitle-editor.html'), 'utf8');
        for (const name of [
            'editor-modals-drawers.fragment.html',
            'editor-modals-tools.fragment.html',
            'editor-modals-pro.fragment.html',
        ]) {
            assert.ok(fs.existsSync(path.join(__dirname, '../src', name)), name);
        }
        assert.ok(html.includes('vendor/editor.css'));
        assert.ok(/id="editorFindReplaceModal"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="editorSplitModal"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(/id="editorFilmHintModal"[^>]*data-ui-fragment="pending"/.test(html));
        assert.ok(!html.includes('id="editorAssStyleList"'));
        assert.ok(!html.includes('id="editorBatchDurConfirm"'));
        const editorApi = require('../src/js/editor-ui-fragment-load-core.js');
        assert.strictEqual(typeof editorApi.ensureEditorModalDom, 'function');
    });
});
