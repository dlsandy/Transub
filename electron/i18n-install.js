/**
 * Install process-wide dialog localization hooks (showMessageBox / open / save).
 * Safe to call once at app boot before windows open.
 */
function installI18nDialogHooks() {
    const { dialog } = require('electron');
    if (dialog.__transubI18nHooked) return;
    const i18n = require('./i18n');

    const wrapBinary = (methodName) => {
        const orig = dialog[methodName].bind(dialog);
        dialog[methodName] = (a, b) => {
            // showMessageBox(browserWindow, options) | showMessageBox(options)
            if (b != null && typeof b === 'object') {
                return orig(a, i18n.localizeDialogOptions(b));
            }
            if (a != null && typeof a === 'object') {
                return orig(i18n.localizeDialogOptions(a));
            }
            return orig(a, b);
        };
    };

    const wrapSync = (methodName) => {
        const orig = dialog[methodName].bind(dialog);
        dialog[methodName] = (a, b) => {
            if (b != null && typeof b === 'object') {
                return orig(a, i18n.localizeDialogOptions(b));
            }
            if (a != null && typeof a === 'object') {
                return orig(i18n.localizeDialogOptions(a));
            }
            return orig(a, b);
        };
    };

    wrapBinary('showMessageBox');
    if (typeof dialog.showMessageBoxSync === 'function') wrapSync('showMessageBoxSync');
    if (typeof dialog.showOpenDialog === 'function') wrapBinary('showOpenDialog');
    if (typeof dialog.showOpenDialogSync === 'function') wrapSync('showOpenDialogSync');
    if (typeof dialog.showSaveDialog === 'function') wrapBinary('showSaveDialog');
    if (typeof dialog.showSaveDialogSync === 'function') wrapSync('showSaveDialogSync');

    dialog.__transubI18nHooked = true;
}

module.exports = { installI18nDialogHooks };
