'use strict';

const assert = require('assert');
const Locale = require('../src/js/env-check-locale-core.js');
const I18nCore = require('../src/js/i18n-core.js');

function createEl(id, tag = 'div') {
    const attrs = Object.create(null);
    const listeners = Object.create(null);
    const classSet = new Set();
    const el = {
        id,
        tagName: String(tag).toUpperCase(),
        value: '',
        textContent: '',
        parentElement: { tagName: 'BODY' },
        dataset: {},
        children: [],
        classList: {
            add: (...xs) => xs.forEach((x) => classSet.add(x)),
            remove: (...xs) => xs.forEach((x) => classSet.delete(x)),
            contains: (x) => classSet.has(x),
            toggle: (x, force) => {
                if (force === true) classSet.add(x);
                else if (force === false) classSet.delete(x);
                else if (classSet.has(x)) classSet.delete(x);
                else classSet.add(x);
            },
        },
        setAttribute(name, value) { attrs[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
        removeAttribute(name) { delete attrs[name]; },
        hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
        addEventListener(type, fn) {
            (listeners[type] || (listeners[type] = [])).push(fn);
        },
        dispatchEvent(ev) {
            for (const fn of (listeners[ev?.type] || [])) fn(ev);
            return true;
        },
        click() {
            this.dispatchEvent({ type: 'click', target: this });
        },
        querySelector(sel) {
            if (sel === 'input[name="envCheckUiLocale"]:checked') {
                return this.querySelectorAll('input[name="envCheckUiLocale"]').find((n) => n.checked) || null;
            }
            return null;
        },
        querySelectorAll(sel) {
            if (sel === 'input[name="envCheckUiLocale"]' || sel === '.env-check-locale-choice') {
                return this._nodes || [];
            }
            return [];
        },
        closest(sel) {
            if (sel === 'input[name="envCheckUiLocale"]' && this.name === 'envCheckUiLocale') return this;
            return null;
        },
        appendChild(child) {
            this.children.push(child);
            return child;
        },
    };
    let html = '';
    Object.defineProperty(el, 'innerHTML', {
        get() { return html; },
        set(v) {
            html = String(v || '');
            // Minimal parse for radio labels created by renderLocaleList
            const nodes = [];
            const re = /value="([^"]+)"[^>]*class="[^"]*"[^>]*(checked)?|value="([^"]+)"[^>]*(checked)?/g;
            const valueRe = /name="envCheckUiLocale" value="([^"]+)"([^>]*)>/g;
            let m;
            while ((m = valueRe.exec(html))) {
                const input = createEl('', 'input');
                input.name = 'envCheckUiLocale';
                input.value = m[1];
                input.checked = /\bchecked\b/.test(m[2] || '');
                input.disabled = false;
                const label = createEl('', 'label');
                label.classList.add('env-check-locale-choice');
                const nativeMatch = html.slice(m.index).match(/font-medium[^>]*>([^<]+)</);
                label.textContent = nativeMatch ? nativeMatch[1].trim() : m[1];
                label.appendChild(input);
                nodes.push(input);
                nodes.push(label);
            }
            el._nodes = nodes.filter((n) => n.tagName === 'INPUT' || n.classList.contains('env-check-locale-choice'));
            // Keep both inputs and labels addressable
            el._inputs = nodes.filter((n) => n.tagName === 'INPUT');
            el._labels = nodes.filter((n) => n.classList.contains('env-check-locale-choice'));
            el.querySelectorAll = (sel) => {
                if (sel === 'input[name="envCheckUiLocale"]') return el._inputs || [];
                if (sel === '.env-check-locale-choice') return el._labels || [];
                return [];
            };
            el.querySelector = (sel) => {
                if (sel === 'input[name="envCheckUiLocale"]:checked') {
                    return (el._inputs || []).find((n) => n.checked) || null;
                }
                return null;
            };
        },
    });
    el.setAttribute('hidden', '');
    el.classList.add('hidden');
    return el;
}

describe('env-check-locale-core', () => {
    let store;
    let els;
    let api;
    let applied;

    beforeEach(() => {
        store = Object.create(null);
        applied = [];
        els = {
            envCheckModal: createEl('envCheckModal'),
            envCheckLocaleGate: createEl('envCheckLocaleGate'),
            envCheckLocaleTitle: createEl('envCheckLocaleTitle', 'h2'),
            envCheckLocaleHint: createEl('envCheckLocaleHint', 'p'),
            envCheckUiLocaleList: createEl('envCheckUiLocaleList'),
            envCheckLocaleContinueBtn: createEl('envCheckLocaleContinueBtn', 'button'),
            envCheckMainPane: createEl('envCheckMainPane'),
            envCheckLocaleBar: createEl('envCheckLocaleBar'),
            envCheckUiLocaleSelect: createEl('envCheckUiLocaleSelect', 'select'),
            uiLocaleSelect: createEl('uiLocaleSelect', 'select'),
        };
        // Main pane starts visible in fragment; gate starts hidden
        els.envCheckMainPane.removeAttribute('hidden');
        els.envCheckMainPane.classList.remove('hidden');

        global.localStorage = {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            clear: () => { store = Object.create(null); },
        };
        global.document = {
            body: { appendChild() {} },
            getElementById: (id) => els[id] || null,
        };
        global.TransubI18nCore = I18nCore;
        global.TransubI18n = {
            getLocale: () => store['transub.uiLocale'] || 'zh-Hans',
            normalizeUiLocale: (v) => I18nCore.normalizeUiLocale(v),
            listUiLocales: (opts) => I18nCore.listUiLocales(opts),
            tx: (t) => t,
            t: (k) => k,
            fillUiLocaleSelect(select, { selected } = {}) {
                select.value = selected || 'zh-Hans';
            },
            async setLocale(next) {
                const n = I18nCore.normalizeUiLocale(next);
                store['transub.uiLocale'] = n;
                applied.push(n);
                return n;
            },
            applyLocale() {},
        };

        api = Locale.createEnvCheckLocale({
            $: (id) => els[id] || null,
            getI18n: () => global.TransubI18n,
            getCore: () => I18nCore,
            getNavigator: () => ({ language: 'en-US', languages: ['en-US', 'en'] }),
        });
    });

    afterEach(() => {
        delete global.localStorage;
        delete global.document;
        delete global.TransubI18n;
        delete global.TransubI18nCore;
    });

    it('exports createEnvCheckLocale factory', () => {
        assert.strictEqual(typeof Locale.createEnvCheckLocale, 'function');
        assert.strictEqual(Locale.CHOSEN_KEY, 'transub.uiLocaleChosen');
    });

    it('suggests OS locale for first-run default', () => {
        assert.strictEqual(api.suggestLocaleFromOs(), 'en');
    });

    it('renders native-name locale radios without committing', async () => {
        await api.applyUiLocale('en', { commit: false });
        api.renderLocaleList('en');
        const inputs = els.envCheckUiLocaleList.querySelectorAll('input[name="envCheckUiLocale"]');
        assert.ok(inputs.length >= 5);
        assert.strictEqual(inputs.find((i) => i.value === 'en')?.checked, true);
        const labels = els.envCheckUiLocaleList.querySelectorAll('.env-check-locale-choice').map((n) => n.textContent);
        assert.ok(labels.includes('English'));
        assert.ok(labels.includes('日本語'));
        assert.strictEqual(api.hasLocaleChosen(), false);
    });

    it('commits chosen flag only when requested', async () => {
        await api.applyUiLocale('ja', { commit: false });
        assert.strictEqual(api.hasLocaleChosen(), false);
        await api.applyUiLocale('ja', { commit: true });
        assert.strictEqual(api.hasLocaleChosen(), true);
        assert.strictEqual(store['transub.uiLocale'], 'ja');
    });

    it('ensureLocaleBeforeCheck resolves after Continue', async () => {
        const pending = api.ensureLocaleBeforeCheck({ force: true, preferOs: true });
        await Promise.resolve();
        await Promise.resolve();
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), false);
        assert.ok(els.envCheckModal.classList.contains('env-check-locale-picking'));
        els.envCheckLocaleContinueBtn.click();
        const locale = await pending;
        assert.strictEqual(locale, 'en');
        assert.strictEqual(api.hasLocaleChosen(), true);
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), true);
        assert.strictEqual(els.envCheckMainPane.hasAttribute('hidden'), false);
    });

    it('Continue leaves the gate even if the commit setLocale never settles', async () => {
        let calls = 0;
        const orig = global.TransubI18n.setLocale;
        global.TransubI18n.setLocale = async (next) => {
            calls += 1;
            if (calls > 1) return new Promise(() => {});
            return orig(next);
        };
        const pending = api.ensureLocaleBeforeCheck({ force: true, preferOs: true });
        for (let i = 0; i < 20 && els.envCheckLocaleGate.hasAttribute('hidden'); i += 1) {
            await Promise.resolve();
        }
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), false);
        els.envCheckLocaleContinueBtn.click();
        const locale = await pending;
        assert.strictEqual(locale, 'en');
        assert.strictEqual(api.hasLocaleChosen(), true);
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), true);
    });

    it('a second ensure while the gate is open shares the same continue', async () => {
        const first = api.ensureLocaleBeforeCheck({ force: true, preferOs: true });
        const second = api.ensureLocaleBeforeCheck({ force: true, preferOs: false });
        assert.strictEqual(first, second);
        for (let i = 0; i < 20 && els.envCheckLocaleGate.hasAttribute('hidden'); i += 1) {
            await Promise.resolve();
        }
        els.envCheckLocaleContinueBtn.click();
        const [a, b] = await Promise.all([first, second]);
        assert.strictEqual(a, 'en');
        assert.strictEqual(b, 'en');
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), true);
    });

    it('skips gate when already chosen and force=false', async () => {
        api.markLocaleChosen();
        const locale = await api.ensureLocaleBeforeCheck({ force: false });
        assert.strictEqual(locale, 'zh-Hans');
        assert.strictEqual(els.envCheckLocaleGate.hasAttribute('hidden'), true);
    });
});
