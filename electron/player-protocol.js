/**
 * transub:// custom protocol for Transub Player handoff (Electron wrapper).
 */
const path = require('path');
const { app } = require('electron');
const core = require('../src/js/player-protocol-core');

function registerPlayerProtocolClient() {
    try {
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient(
                    core.PROTOCOL,
                    process.execPath,
                    [path.resolve(process.argv[1])],
                );
            }
        } else {
            app.setAsDefaultProtocolClient(core.PROTOCOL);
        }
        return true;
    } catch (err) {
        console.warn('[player-protocol] register failed:', err?.message || err);
        return false;
    }
}

module.exports = {
    ...core,
    registerPlayerProtocolClient,
};
