'use strict';

/**
 * Dry-run selected wizard draft rules: try sanitize + regression gate (no write).
 */
const train = require('./train');
const regressionGate = require('./regression-gate');

function trialPass(item, trial) {
    if (!trial) return false;
    const mode = item.mode === 'blank' ? 'blank' : 'replace';
    const final = String(trial.final ?? '');
    if (mode === 'blank') {
        const from = String(item.zhFrom || '').trim();
        if (from && !final.includes(from)) return true;
        return Boolean(trial.changed);
    }
    if (trial.matchesExpect === true) return true;
    const from = String(item.zhFrom || '').trim();
    const to = String(item.zhTo || '').trim();
    if (from && !final.includes(from) && (!to || final.includes(to))) return true;
    return false;
}

/**
 * @param {object} sanitize
 * @param {Array<object>} items draft payloads
 * @param {{ corpus?: Array<object> }} [opts]
 */
function testWizardItems(sanitize, items, opts = {}) {
    const list = Array.isArray(items) ? items : [];
    const corpus = Array.isArray(opts.corpus) ? opts.corpus : [];
    const results = [];

    for (const raw of list) {
        const mode = raw.mode === 'blank' ? 'blank' : 'replace';
        const payload = {
            kind: 'zh',
            mode,
            title: raw.title || 'wizard',
            note: raw.note || 'wizard-test',
            ja: raw.ja || raw.src || '',
            zh: raw.zh || raw.dst || '',
            expect: mode === 'blank'
                ? '…'
                : (raw.expect != null ? raw.expect : (raw.zhTo || '')),
            zhFrom: raw.zhFrom || '',
            zhTo: mode === 'blank' ? '' : (raw.zhTo || ''),
            jaAnchor: raw.jaAnchor || '',
            pinFinal: raw.pinFinal !== false,
            contentProfile: raw.contentProfile || 'av_soft',
            ji: raw.ji,
            jis: raw.jis,
            expandStub: raw.expandStub,
        };

        let trial = null;
        let trialError = null;
        try {
            trial = train.tryWithCandidate(sanitize, payload);
        } catch (err) {
            trialError = String(err && err.message ? err.message : err);
        }

        const gate = regressionGate.runRegressionGate(sanitize, payload, {
            corpus,
            targetJis: raw.ji != null ? [raw.ji] : raw.jis,
        });

        const hitOk = trialError ? false : trialPass(payload, trial);
        const pass = hitOk && gate.ok;
        const reasons = [];
        if (trialError) reasons.push(`试跑异常：${trialError}`);
        else if (!hitOk) reasons.push('试跑未命中期望/片段未生效');
        if (!gate.ok) reasons.push(...(gate.reasons || ['回归闸未通过']));

        results.push({
            ji: raw.ji,
            pass,
            hitOk,
            gateOk: gate.ok,
            reasons,
            trial: trial
                ? {
                    matchesExpect: trial.matchesExpect,
                    final: trial.final,
                    changed: trial.changed,
                    warnings: trial.warnings || [],
                    tips: trial.tips || [],
                }
                : null,
            gate: {
                ok: gate.ok,
                blocked: gate.blocked,
                reasons: gate.reasons || [],
                collateral: gate.collateral || null,
                regressions: (gate.regressions || []).slice(0, 5),
            },
        });
    }

    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.length - passCount;
    return {
        ok: true,
        results,
        passCount,
        failCount,
        allPass: failCount === 0 && results.length > 0,
    };
}

module.exports = {
    trialPass,
    testWizardItems,
};
