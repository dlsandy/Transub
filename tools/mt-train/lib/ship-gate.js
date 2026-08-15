'use strict';

/**
 * Pre-ship gate for MT sanitize / ASR training:
 * conflict report (strip vs remap) → full mocha suite.
 * TDP encode remains a separate step after the gate is green.
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const conflictReport = require('../../mt-sanitize-conflict-report');

/**
 * @param {(line: string) => void} [onLog]
 * @returns {{ ok: boolean, report: object, summary: string }}
 */
function runConflictStep(onLog) {
    const log = typeof onLog === 'function' ? onLog : () => {};
    log('$ npm run report:mt-conflicts');
    let report;
    try {
        report = conflictReport.buildReport();
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        log(`conflict report error: ${msg}`);
        return {
            ok: false,
            report: null,
            summary: `冲突报告失败：${msg}`,
        };
    }
    try {
        const fs = require('fs');
        fs.mkdirSync(path.dirname(conflictReport.outPath), { recursive: true });
        fs.writeFileSync(conflictReport.outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        log(`Wrote ${conflictReport.outPath}`);
    } catch (_) { /* ignore write errors */ }

    log(`conflicts=${report.conflictCount} warnings=${report.warningCount} high=${report.highSeverity}`);
    for (const c of (report.conflicts || []).filter((x) => x.severity === 'high')) {
        log(`  [high] ${c.kind}: ${String(c.zh).slice(0, 40)} …`);
    }
    if (!report.ok) {
        return {
            ok: false,
            report,
            summary: `冲突报告未通过（high=${report.highSeverity}）`,
        };
    }
    return {
        ok: true,
        report,
        summary: '冲突报告通过',
    };
}

/**
 * @param {(line: string) => void} [onLog]
 * @returns {Promise<{ ok: boolean, code: number, summary: string }>}
 */
function runMochaStep(onLog) {
    const log = typeof onLog === 'function' ? onLog : () => {};
    const args = ['mocha', 'tests/mt-sanitize.test.js', '--timeout', '60000'];
    log(`$ npx ${args.join(' ')}`);
    return new Promise((resolve) => {
        const child = spawn('npx', args, { cwd: ROOT, shell: true });
        const onData = (buf) => {
            String(buf).split(/\r?\n/).forEach((line) => {
                if (line !== '') log(line);
            });
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (err) => {
            log(`ERROR: ${err.message}`);
            resolve({ ok: false, code: -1, summary: `mocha 启动失败：${err.message}` });
        });
        child.on('close', (code) => {
            const ok = code === 0;
            resolve({
                ok,
                code: code == null ? -1 : code,
                summary: ok ? '全量 mt-sanitize 通过' : `mocha 退出码 ${code}`,
            });
        });
    });
}

/**
 * @param {{
 *   onLog?: (line: string) => void,
 *   skipMocha?: boolean,
 * }} [opts]
 */
async function runShipGate(opts = {}) {
    const onLog = opts.onLog;
    const steps = [];
    const conflict = runConflictStep(onLog);
    steps.push({ id: 'conflicts', ...conflict });
    if (!conflict.ok) {
        return {
            ok: false,
            blocked: true,
            steps,
            summary: conflict.summary,
            hint: '先消掉 strip↔remap 高严重冲突，再跑全量测试与 TDP 签发',
        };
    }
    if (opts.skipMocha) {
        return {
            ok: true,
            blocked: false,
            steps,
            summary: '冲突报告通过（已跳过 mocha）',
            hint: '签发 TDP 前请再跑全量测试',
        };
    }
    const mocha = await runMochaStep(onLog);
    steps.push({ id: 'mocha', ...mocha });
    if (!mocha.ok) {
        return {
            ok: false,
            blocked: true,
            steps,
            summary: mocha.summary,
            hint: '全量测试未过，勿签发 TDP；用 force 写入的规则请复查',
        };
    }
    return {
        ok: true,
        blocked: false,
        steps,
        summary: '发库前检查通过：冲突报告 + 全量 mt-sanitize',
        hint: '可以签发 TDP（encode:tdp --sign）',
    };
}

module.exports = {
    runConflictStep,
    runMochaStep,
    runShipGate,
};
