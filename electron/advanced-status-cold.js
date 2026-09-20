/**
 * Cold-path Advanced entitlement status (no advanced-bridge / TDP / catalog).
 * Used at renderer startup so Pro badge can resolve without loading Pro stacks.
 */
const entitlement = require('../src/js/advanced-entitlement-core');
const { readAdvancedDoc } = require('./advanced-license-data');
const { getAdvancedDeviceId } = require('./advanced-device-id');
const { isDevUnlockEnabled, evaluateFreeWithInstall } = require('./advanced-gates');

function getEntitlementStatusCold() {
    const deviceId = getAdvancedDeviceId();
    const { doc } = readAdvancedDoc();
    const status = entitlement.buildStatusView(doc.license, deviceId);
    if (isDevUnlockEnabled() && !status.entitled) {
        status.entitled = true;
        status.reason = 'dev_unlock';
        status.message = '开发解锁（TRANSUB_ADVANCED_DEV_UNLOCK）';
        status.devUnlock = true;
    }
    let freePipelineTranslate;
    try {
        freePipelineTranslate = evaluateFreeWithInstall(doc);
    } catch (_) {
        freePipelineTranslate = entitlement.evaluateFreePipelineTranslate(doc);
    }
    return {
        ok: true,
        status: {
            ...status,
            freePipelineTranslate,
        },
    };
}

module.exports = {
    getEntitlementStatusCold,
};
