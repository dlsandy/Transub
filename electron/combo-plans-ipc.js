/**
 * Combo plans IPC — thin registration (not in six monoliths).
 * @param {(channel: string, handler: Function) => void} register
 */
function registerComboPlansIpc(register) {
    if (typeof register !== 'function') {
        throw new Error('registerComboPlansIpc: register required');
    }

    register('combo-plans-list', async (_event, payload = {}) => {
        try {
            const runtime = require('./combo-plans-runtime');
            return await runtime.listComboPlans({
                forceRefresh: !!payload?.forceRefresh,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err), plans: [] };
        }
    });

    register('combo-plans-get', async (_event, payload = {}) => {
        try {
            const runtime = require('./combo-plans-runtime');
            return await runtime.getComboPlan(payload?.id || payload?.planId || '', {
                forceRefresh: !!payload?.forceRefresh,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('combo-plans-refresh', async () => {
        try {
            const runtime = require('./combo-plans-runtime');
            return await runtime.refreshComboPlans();
        } catch (err) {
            return { ok: false, error: err.message || String(err), plans: [] };
        }
    });
}

module.exports = { registerComboPlansIpc };
