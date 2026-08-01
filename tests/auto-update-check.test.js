const assert = require('assert');
const {
    normalizeAutoUpdateCheckInterval,
    isAutoUpdateCheckDue,
    INTERVAL_MS,
} = require('../electron/auto-update-check');

describe('auto-update-check', () => {
    it('normalizes interval values', () => {
        assert.strictEqual(normalizeAutoUpdateCheckInterval('off'), 'off');
        assert.strictEqual(normalizeAutoUpdateCheckInterval('daily'), 'daily');
        assert.strictEqual(normalizeAutoUpdateCheckInterval('WEEKLY'), 'weekly');
        assert.strictEqual(normalizeAutoUpdateCheckInterval('monthly'), 'monthly');
        assert.strictEqual(normalizeAutoUpdateCheckInterval(''), 'weekly');
        assert.strictEqual(normalizeAutoUpdateCheckInterval('hourly'), 'weekly');
        assert.strictEqual(normalizeAutoUpdateCheckInterval(null), 'weekly');
    });

    it('treats missing last check as due when enabled', () => {
        assert.strictEqual(isAutoUpdateCheckDue('daily', ''), true);
        assert.strictEqual(isAutoUpdateCheckDue('weekly', null), true);
        assert.strictEqual(isAutoUpdateCheckDue('monthly', undefined), true);
        assert.strictEqual(isAutoUpdateCheckDue('off', ''), false);
    });

    it('respects interval windows', () => {
        const now = Date.parse('2026-08-01T12:00:00.000Z');
        const almostDay = new Date(now - INTERVAL_MS.daily + 60_000).toISOString();
        const overDay = new Date(now - INTERVAL_MS.daily - 60_000).toISOString();
        assert.strictEqual(isAutoUpdateCheckDue('daily', almostDay, now), false);
        assert.strictEqual(isAutoUpdateCheckDue('daily', overDay, now), true);

        const almostWeek = new Date(now - INTERVAL_MS.weekly + 60_000).toISOString();
        const overWeek = new Date(now - INTERVAL_MS.weekly - 60_000).toISOString();
        assert.strictEqual(isAutoUpdateCheckDue('weekly', almostWeek, now), false);
        assert.strictEqual(isAutoUpdateCheckDue('weekly', overWeek, now), true);

        const almostMonth = new Date(now - INTERVAL_MS.monthly + 60_000).toISOString();
        const overMonth = new Date(now - INTERVAL_MS.monthly - 60_000).toISOString();
        assert.strictEqual(isAutoUpdateCheckDue('monthly', almostMonth, now), false);
        assert.strictEqual(isAutoUpdateCheckDue('monthly', overMonth, now), true);
    });

    it('keeps off from ever being due', () => {
        const now = Date.now();
        const old = new Date(now - INTERVAL_MS.monthly * 2).toISOString();
        assert.strictEqual(isAutoUpdateCheckDue('off', old, now), false);
    });
});
