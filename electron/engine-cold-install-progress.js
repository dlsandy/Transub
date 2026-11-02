/**
 * Progress helpers for the ~92% engine restart / CUDA torch cold-install phase.
 * Shared by engine-download-job and local-whl-ipc so UI does not look "stuck".
 */
'use strict';

const { hasPendingTorchCudaInstall } = require('./engine-ensure-running');

/** @typedef {'torch-cuda'|'gpu'|'rocm'|'xpu'|'generic'} ColdInstallMode */

/**
 * @param {ColdInstallMode} mode
 * @param {{ deferred?: boolean }} [opts]
 * @returns {string}
 */
function coldInstallStartMessage(mode, opts = {}) {
    const deferred = !!opts.deferred;
    if (mode === 'torch-cuda' || deferred) {
        return (
            'CUDA PyTorch 将冷安装（约 2.5GB，常需 10–30 分钟）。'
            + '进度停在约 92% 属正常，请勿关闭或反复点修复…'
        );
    }
    if (mode === 'rocm') {
        return 'ROCm PyTorch 已安装，正在重启引擎以加载（可能需数分钟，请勿反复点修复）…';
    }
    if (mode === 'xpu') {
        return 'XPU PyTorch 已安装，正在重启引擎以加载（可能需数分钟，请勿反复点修复）…';
    }
    if (mode === 'gpu') {
        return '正在重启引擎以加载 GPU 运行库（可能需数分钟，请勿关闭）…';
    }
    return '正在重启引擎以加载运行库（可能需数分钟，请勿关闭或反复点修复）…';
}

/**
 * @param {number} elapsedSec
 * @returns {string}
 */
function formatWaitLabel(elapsedSec) {
    const sec = Math.max(0, Math.floor(Number(elapsedSec) || 0));
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    if (mins <= 0) return `${rem} 秒`;
    return `${mins} 分 ${rem} 秒`;
}

/**
 * Map elapsed wait into 92–98 so the bar still moves during a long health wait.
 * @param {number} elapsedSec
 * @returns {number}
 */
function coldInstallWaitPct(elapsedSec) {
    const sec = Math.max(0, Number(elapsedSec) || 0);
    // +1 every ~45s, capped at 98 (leave 99–100 for done).
    return Math.min(98, 92 + Math.floor(sec / 45));
}

/**
 * @param {ColdInstallMode} mode
 * @param {number} elapsedSec
 * @param {{ deferred?: boolean, pendingTorch?: boolean }} [opts]
 * @returns {string}
 */
function coldInstallWaitMessage(mode, elapsedSec, opts = {}) {
    const wait = formatWaitLabel(elapsedSec);
    const cold = !!(opts.deferred || opts.pendingTorch || mode === 'torch-cuda');
    if (cold) {
        return (
            `正在冷安装 CUDA PyTorch（约 2.5GB）。已等待 ${wait}；`
            + '请耐心等待，勿关闭窗口或反复点修复。若超过 30 分钟无进展，请改用「手动修复」。'
        );
    }
    if (mode === 'rocm') {
        return `正在重启引擎加载 ROCm PyTorch。已等待 ${wait}…`;
    }
    if (mode === 'xpu') {
        return `正在重启引擎加载 XPU PyTorch。已等待 ${wait}…`;
    }
    if (mode === 'gpu') {
        return `正在重启引擎加载 GPU 运行库。已等待 ${wait}…`;
    }
    return `正在重启引擎。已等待 ${wait}…`;
}

/**
 * @param {string} ensureError
 * @param {{ deferred?: boolean, pendingTorch?: boolean, mode?: ColdInstallMode }} [opts]
 * @returns {string}
 */
function coldInstallRestartFailMessage(ensureError, opts = {}) {
    const base = String(ensureError || '').trim() || '引擎重启 / 冷安装失败';
    const cold = !!(opts.deferred || opts.pendingTorch || opts.mode === 'torch-cuda');
    if (cold) {
        return (
            `${base}。请完全退出 Transub（含托盘与任务管理器中的 python）后重试「补齐 CUDA PyTorch」，`
            + '并等待进度过 92%（冷安装约 2.5GB，常需 10–30 分钟）。'
            + '若仍失败请改用「手动修复」浏览器下载 .whl 本地安装。'
        );
    }
    return (
        `${base}。请完全退出 Transub 后重新检测；`
        + '若「显卡计算库」仍失败，请改用「手动修复」。'
    );
}

/**
 * True when a failed engine restart must not be reported as success
 * (pending CUDA torch cold-install, ROCm torch install, or explicit deferred flag).
 * @param {{ deferred?: boolean, mode?: ColdInstallMode }} [opts]
 * @returns {boolean}
 */
function mustFailClosedOnRestart(opts = {}) {
    if (opts.deferred) return true;
    // ROCm wheels also need a real engine reload; do not report pip ok + restart fail as success.
    if (opts.mode === 'rocm' || opts.mode === 'xpu') return true;
    try {
        return hasPendingTorchCudaInstall();
    } catch {
        return false;
    }
}

/**
 * Await ensureEngineRunning while emitting heartbeat progress so ~92% does not look frozen.
 *
 * @param {object} args
 * @param {(info: object) => void} args.emit
 * @param {(opts: object) => Promise<object>} args.ensureEngineRunning
 * @param {object} [args.ensureOptions]
 * @param {ColdInstallMode} [args.mode]
 * @param {boolean} [args.deferred]
 * @param {number} [args.intervalMs]
 * @returns {Promise<object>}
 */
async function ensureEngineRunningWithColdInstallProgress(args = {}) {
    const emit = typeof args.emit === 'function' ? args.emit : () => {};
    const ensureEngineRunning = args.ensureEngineRunning;
    if (typeof ensureEngineRunning !== 'function') {
        throw new Error('ensureEngineRunningWithColdInstallProgress: ensureEngineRunning required');
    }
    const mode = args.mode || 'generic';
    const deferred = !!args.deferred;
    let pendingTorch = deferred;
    try {
        pendingTorch = deferred || hasPendingTorchCudaInstall();
    } catch { /* ignore */ }

    const started = Date.now();
    emit({
        phase: 'progress',
        message: coldInstallStartMessage(mode, { deferred: deferred || pendingTorch }),
        pct: 92,
        suggestManual: !!(deferred || pendingTorch || mode === 'torch-cuda'),
        coldInstall: true,
    });

    const intervalMs = Number.isFinite(Number(args.intervalMs)) && Number(args.intervalMs) > 0
        ? Math.max(250, Number(args.intervalMs))
        : 5000;
    const timer = setInterval(() => {
        const elapsedSec = (Date.now() - started) / 1000;
        let stillPending = pendingTorch;
        try {
            stillPending = deferred || hasPendingTorchCudaInstall();
        } catch { /* ignore */ }
        emit({
            phase: 'progress',
            message: coldInstallWaitMessage(mode, elapsedSec, {
                deferred,
                pendingTorch: stillPending,
            }),
            pct: coldInstallWaitPct(elapsedSec),
            suggestManual: !!(deferred || stillPending || mode === 'torch-cuda'),
            coldInstall: true,
            elapsedSec: Math.floor(elapsedSec),
        });
    }, intervalMs);

    try {
        return await ensureEngineRunning(args.ensureOptions || {});
    } finally {
        clearInterval(timer);
    }
}

module.exports = {
    coldInstallStartMessage,
    coldInstallWaitMessage,
    coldInstallWaitPct,
    coldInstallRestartFailMessage,
    formatWaitLabel,
    mustFailClosedOnRestart,
    ensureEngineRunningWithColdInstallProgress,
    hasPendingTorchCudaInstall,
};
