'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readSrc(name) {
    return fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
}

/** Collect top-level element ids from a fragment HTML string (div/section only). */
function topLevelIds(html) {
    const s = String(html || '');
    const ids = [];
    const re = /<\/?(div|section)\b[^>]*>/gi;
    let depth = 0;
    let m;
    while ((m = re.exec(s))) {
        const tag = m[0];
        if (/^<\//.test(tag)) {
            depth -= 1;
            continue;
        }
        if (/\/>\s*$/.test(tag)) continue;
        if (depth === 0) {
            const idm = tag.match(/\bid=["']([^"']+)["']/i);
            if (idm) ids.push(idm[1]);
        }
        depth += 1;
    }
    return ids;
}

function installInjectDom(pendingIds) {
    const els = {};
    pendingIds.forEach((id) => {
        els[id] = {
            id,
            getAttribute(name) {
                return name === 'data-ui-fragment' ? 'pending' : null;
            },
            replaceWith(next) {
                els[id] = next;
            },
        };
    });
    global.document = {
        _els: els,
        getElementById(id) {
            return this._els[id] || null;
        },
        createElement() {
            return {
                _html: '',
                set innerHTML(v) { this._html = String(v || ''); },
                get innerHTML() { return this._html; },
                get children() {
                    return topLevelIds(this._html).map((id) => ({
                        id,
                        removeAttribute() {},
                    }));
                },
            };
        },
        body: {
            appendChild(el) {
                if (el?.id) els[el.id] = el;
            },
        },
    };
    global.CustomEvent = class CustomEvent {
        constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
    global.dispatchEvent = () => {};
}

describe('deferred UI fragment content smoke', () => {
    beforeEach(() => {
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        delete require.cache[require.resolve('../src/js/editor-ui-fragment-load-core.js')];
    });

    it('factory-modals fragment has controls + injects over placeholders', async () => {
        const frag = readSrc('factory-modals.fragment.html');
        const wizard = readSrc('setup-wizard.fragment.html');
        const index = readSrc('index.html');
        for (const id of [
            'retranslateModeLlm',
            'envFixProgressCancelBtn',
            'envCheckStartBtn',
            'manualWhlCancelBtn',
            'appConfirmPrimaryBtn',
            'closePreviewBtn',
        ]) {
            assert.ok(frag.includes(`id="${id}"`), `factory-modals missing ${id}`);
        }
        assert.ok(wizard.includes('id="setupWizardNextBtn"'));
        assert.ok(/id="retranslateModal"[^>]*data-ui-fragment="pending"/.test(index));
        assert.ok(/id="setupWizardModal"[^>]*data-ui-fragment="pending"/.test(index));

        const api = require('../src/js/ui-fragment-load-core.js');
        installInjectDom(api.REGISTRY['factory-modals'].roots.concat(api.REGISTRY['setup-wizard'].roots));
        global.__ELECTRON__ = {
            async transubReadUiFragment({ name }) {
                if (name === 'factory-modals.fragment.html') return { ok: true, html: frag };
                if (name === 'setup-wizard.fragment.html') return { ok: true, html: wizard };
                return { ok: false, error: name };
            },
        };
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        const api2 = require('../src/js/ui-fragment-load-core.js');
        await api2.ensureFactoryChromeDom();
        assert.strictEqual(api2.isReady('factory-modals'), true);
        assert.strictEqual(api2.isReady('setup-wizard'), true);
        assert.strictEqual(document.getElementById('retranslateModal').getAttribute?.('data-ui-fragment'), undefined);
    });

    it('editor modal fragments have controls + inject', async () => {
        const drawers = readSrc('editor-modals-drawers.fragment.html');
        const tools = readSrc('editor-modals-tools.fragment.html');
        const pro = readSrc('editor-modals-pro.fragment.html');
        const editor = readSrc('subtitle-editor.html');
        assert.ok(drawers.includes('id="editorAssStyleList"'));
        assert.ok(tools.includes('id="editorBatchDurConfirm"'));
        assert.ok(pro.includes('id="editorFilmHintTitle"') || pro.includes('id="editorFilmHintModal"'));
        assert.ok(/id="editorFindReplaceModal"[^>]*data-ui-fragment="pending"/.test(editor));

        const byName = {
            'editor-modals-drawers.fragment.html': drawers,
            'editor-modals-tools.fragment.html': tools,
            'editor-modals-pro.fragment.html': pro,
        };
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        const loader = require('../src/js/ui-fragment-load-core.js');
        const roots = loader.EDITOR_MODAL_FRAGMENT_KEYS.flatMap((k) => loader.REGISTRY[k].roots);
        installInjectDom(roots);
        global.__ELECTRON__ = {
            async transubReadUiFragment({ name }) {
                const html = byName[name];
                return html ? { ok: true, html } : { ok: false, error: name };
            },
        };
        delete require.cache[require.resolve('../src/js/ui-fragment-load-core.js')];
        delete require.cache[require.resolve('../src/js/editor-ui-fragment-load-core.js')];
        const api = require('../src/js/editor-ui-fragment-load-core.js');
        await api.ensureEditorModalDom();
        assert.strictEqual(api.isReady(), true);
    });
});
