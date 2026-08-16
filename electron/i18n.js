/**
 * Main-process UI i18n (dialogs, tray, updater). Same catalogs as renderer.
 * tx() converts hardcoded Hans chrome to zh-Hant-TW via OpenCC twp + phrase overrides.
 */
const path = require('path');

const core = require('../src/js/i18n-core');
const catalogMod = require('../src/js/i18n-catalogs');

let catalogs = typeof catalogMod.loadCatalogsFromDisk === 'function'
    ? catalogMod.loadCatalogsFromDisk()
    : catalogMod.getCatalogs();
let locale = core.DEFAULT_UI_LOCALE;
let convertHansToHant = null;

function resolveConverter() {
    if (convertHansToHant) return convertHansToHant;
    try {
        const chinese = require('../src/js/subtitle-chinese-core');
        if (typeof chinese.convertText === 'function') {
            convertHansToHant = (text) => {
                const r = chinese.convertText(text, 's2t', { locale: 'twp' });
                return (r && typeof r === 'object' && r.text != null) ? String(r.text) : String(r ?? text);
            };
            return convertHansToHant;
        }
    } catch { /* ignore */ }
    try {
        const OpenCC = require('opencc-js');
        const conv = OpenCC.Converter({ from: 'cn', to: 'twp' });
        convertHansToHant = (text) => conv(String(text || ''));
        return convertHansToHant;
    } catch { /* ignore */ }
    convertHansToHant = (text) => String(text || '');
    return convertHansToHant;
}

function reloadCatalogs() {
    catalogs = typeof catalogMod.loadCatalogsFromDisk === 'function'
        ? catalogMod.loadCatalogsFromDisk()
        : catalogMod.getCatalogs();
    return catalogs;
}

function setLocale(next) {
    locale = core.normalizeUiLocale(next);
    return locale;
}

function getLocale() {
    return locale;
}

function initFromOptions(options = {}) {
    return setLocale(options.uiLocale);
}

function t(key, vars) {
    return core.t(key, {
        catalogs,
        locale,
        fallbackLocale: core.FALLBACK_UI_LOCALE,
        vars,
    });
}

function tx(text, vars) {
    return core.tx(text, {
        catalogs,
        locale,
        vars,
        convertHansToHant: resolveConverter(),
    });
}

/** Localize a Menu template (labels / tooltips) in place and return it. */
function localizeMenuTemplate(template) {
    if (!Array.isArray(template)) return template;
    const walk = (items) => {
        items.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            if (typeof item.label === 'string') item.label = tx(item.label);
            if (typeof item.toolTip === 'string') item.toolTip = tx(item.toolTip);
            if (Array.isArray(item.submenu)) walk(item.submenu);
        });
    };
    walk(template);
    return template;
}

/** Localize dialog.showMessageBox / showOpenDialog option strings. */
function localizeDialogOptions(options = {}) {
    const out = { ...options };
    ['title', 'message', 'detail'].forEach((k) => {
        if (typeof out[k] === 'string') out[k] = tx(out[k]);
    });
    if (Array.isArray(out.buttons)) {
        out.buttons = out.buttons.map((b) => (typeof b === 'string' ? tx(b) : b));
    }
    if (Array.isArray(out.filters)) {
        out.filters = out.filters.map((f) => (
            f && typeof f === 'object'
                ? { ...f, name: typeof f.name === 'string' ? tx(f.name) : f.name }
                : f
        ));
    }
    return out;
}

function catalogPath(localeId) {
    return path.join(__dirname, '..', 'shared', 'i18n', 'catalog', `${localeId}.json`);
}

module.exports = {
    UI_LOCALES: core.UI_LOCALES,
    DEFAULT_UI_LOCALE: core.DEFAULT_UI_LOCALE,
    normalizeUiLocale: core.normalizeUiLocale,
    isHantLocale: core.isHantLocale,
    htmlLangForLocale: core.htmlLangForLocale,
    reloadCatalogs,
    setLocale,
    getLocale,
    initFromOptions,
    t,
    tx,
    localizeMenuTemplate,
    localizeDialogOptions,
    catalogPath,
};
