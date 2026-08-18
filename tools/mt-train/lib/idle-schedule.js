'use strict';

/**
 * Pure schedule policy for idle / overnight MT-train morning reports.
 * No I/O — Electron and CLI watchers share this.
 */

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** Local calendar day key YYYY-MM-DD */
function localDayKey(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

/**
 * Night window may wrap midnight (e.g. 22→7).
 * @param {number} hour 0–23
 * @param {number} startHour
 * @param {number} endHour
 */
function inNightWindow(hour, startHour = 22, endHour = 7) {
    const h = ((Number(hour) % 24) + 24) % 24;
    const a = ((Number(startHour) % 24) + 24) % 24;
    const b = ((Number(endHour) % 24) + 24) % 24;
    if (a === b) return true; // full day
    if (a < b) return h >= a && h < b;
    return h >= a || h < b;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.enabled=true]
 * @param {number} [opts.idleSeconds=0] system idle seconds
 * @param {number} [opts.idleMinutes=15] required idle
 * @param {boolean} [opts.nightOnly=false]
 * @param {number} [opts.nightStartHour=22]
 * @param {number} [opts.nightEndHour=7]
 * @param {string|null} [opts.lastRunAt] ISO
 * @param {number} [opts.minHoursBetween=6]
 * @param {Date} [opts.now]
 * @returns {{ ok: boolean, reason: string }}
 */
function shouldRunIdlePass(opts = {}) {
    if (opts.enabled === false) {
        return { ok: false, reason: '已关闭空闲早报' };
    }
    const now = opts.now instanceof Date ? opts.now : new Date();
    const needSec = Math.max(60, Math.round((Number(opts.idleMinutes) || 15) * 60));
    const idleSec = Math.max(0, Number(opts.idleSeconds) || 0);
    if (idleSec < needSec) {
        return { ok: false, reason: `空闲不足（${Math.floor(idleSec / 60)}/${Math.ceil(needSec / 60)} 分钟）` };
    }
    if (opts.nightOnly) {
        const hour = now.getHours();
        if (!inNightWindow(hour, opts.nightStartHour ?? 22, opts.nightEndHour ?? 7)) {
            return { ok: false, reason: '非夜间窗口' };
        }
    }
    if (opts.lastRunAt) {
        const last = new Date(opts.lastRunAt);
        if (!Number.isNaN(last.getTime())) {
            if (localDayKey(last) === localDayKey(now)) {
                return { ok: false, reason: '今日已跑过早报' };
            }
            const minH = Math.max(1, Number(opts.minHoursBetween) || 6);
            const gapMs = now.getTime() - last.getTime();
            if (gapMs < minH * 3600 * 1000) {
                return { ok: false, reason: `距上次不足 ${minH} 小时` };
            }
        }
    }
    return { ok: true, reason: '可以开跑' };
}

function defaultIdlePrefs() {
    return {
        enabled: true,
        idleMinutes: 15,
        maxTitles: 8,
        maxPerTitle: 8,
        nightOnly: false,
        nightStartHour: 22,
        nightEndHour: 7,
        minHoursBetween: 6,
        pollMinutes: 5,
    };
}

module.exports = {
    localDayKey,
    inNightWindow,
    shouldRunIdlePass,
    defaultIdlePrefs,
};
