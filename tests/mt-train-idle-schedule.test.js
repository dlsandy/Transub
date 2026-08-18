'use strict';

const assert = require('assert');
const idleSchedule = require('../tools/mt-train/lib/idle-schedule');

describe('mt-train idle-schedule', () => {
    it('inNightWindow wraps midnight', () => {
        assert.ok(idleSchedule.inNightWindow(23, 22, 7));
        assert.ok(idleSchedule.inNightWindow(3, 22, 7));
        assert.ok(!idleSchedule.inNightWindow(12, 22, 7));
    });

    it('shouldRunIdlePass gates idle / same-day / night', () => {
        const now = new Date('2026-08-16T14:00:00');
        assert.ok(!idleSchedule.shouldRunIdlePass({
            enabled: true,
            idleSeconds: 60,
            idleMinutes: 15,
            now,
        }).ok);
        assert.ok(idleSchedule.shouldRunIdlePass({
            enabled: true,
            idleSeconds: 20 * 60,
            idleMinutes: 15,
            now,
        }).ok);
        assert.ok(!idleSchedule.shouldRunIdlePass({
            enabled: true,
            idleSeconds: 20 * 60,
            idleMinutes: 15,
            lastRunAt: '2026-08-16T02:00:00',
            now,
        }).ok);
        assert.ok(!idleSchedule.shouldRunIdlePass({
            enabled: true,
            idleSeconds: 20 * 60,
            idleMinutes: 15,
            nightOnly: true,
            nightStartHour: 22,
            nightEndHour: 7,
            now,
        }).ok);
        assert.ok(idleSchedule.shouldRunIdlePass({
            enabled: true,
            idleSeconds: 20 * 60,
            idleMinutes: 15,
            nightOnly: true,
            nightStartHour: 22,
            nightEndHour: 7,
            now: new Date('2026-08-16T23:30:00'),
        }).ok);
    });
});
