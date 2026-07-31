/**
 * Lightweight system resource sampling for the main-window status strip.
 * CPU / RAM via Node os; NVIDIA GPU via nvidia-smi (optional).
 */

const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const GPU_QUERY_TIMEOUT_MS = 2500;
const GPU_CACHE_MS = 1800;

let prevCpuTimes = null;
let gpuCache = { at: 0, value: null };
let gpuInFlight = null;
let gpuUnavailable = false;

function cpuTimesTotal(times) {
    return Number(times.user || 0)
        + Number(times.nice || 0)
        + Number(times.sys || 0)
        + Number(times.irq || 0)
        + Number(times.idle || 0);
}

function sampleCpuPercent() {
    const cpus = os.cpus() || [];
    if (!cpus.length) return null;

    const totals = cpus.map((c) => ({
        idle: Number(c.times?.idle || 0),
        total: cpuTimesTotal(c.times || {}),
    }));

    if (!prevCpuTimes || prevCpuTimes.length !== totals.length) {
        prevCpuTimes = totals;
        return null;
    }

    let idleDiff = 0;
    let totalDiff = 0;
    for (let i = 0; i < totals.length; i += 1) {
        idleDiff += Math.max(0, totals[i].idle - prevCpuTimes[i].idle);
        totalDiff += Math.max(0, totals[i].total - prevCpuTimes[i].total);
    }
    prevCpuTimes = totals;
    if (totalDiff <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - (idleDiff / totalDiff)))));
}

function sampleMemory() {
    const totalBytes = Number(os.totalmem()) || 0;
    const freeBytes = Number(os.freemem()) || 0;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
        totalBytes,
        usedBytes,
        freeBytes,
        usedPct: totalBytes > 0
            ? Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 100)))
            : null,
    };
}

function parseNvidiaCsvLine(line) {
    const parts = String(line || '').split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    const util = Number(parts[0]);
    const memUsed = Number(parts[1]);
    const memTotal = Number(parts[2]);
    if (![util, memUsed, memTotal].every((n) => Number.isFinite(n))) return null;
    return {
        utilPct: Math.max(0, Math.min(100, Math.round(util))),
        memUsedMiB: Math.max(0, Math.round(memUsed)),
        memTotalMiB: Math.max(0, Math.round(memTotal)),
    };
}

async function queryNvidiaGpu() {
    if (gpuUnavailable) return null;
    try {
        const { stdout } = await execFileAsync(
            'nvidia-smi',
            [
                '--query-gpu=utilization.gpu,memory.used,memory.total',
                '--format=csv,noheader,nounits',
            ],
            { windowsHide: true, timeout: GPU_QUERY_TIMEOUT_MS },
        );
        const first = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
        const parsed = parseNvidiaCsvLine(first);
        if (!parsed) {
            gpuUnavailable = true;
            return null;
        }
        return { vendor: 'nvidia', ...parsed };
    } catch {
        gpuUnavailable = true;
        return null;
    }
}

async function sampleGpu() {
    const now = Date.now();
    if (gpuCache.value != null && (now - gpuCache.at) < GPU_CACHE_MS) {
        return gpuCache.value;
    }
    if (gpuUnavailable) return null;
    if (gpuInFlight) return gpuInFlight;

    gpuInFlight = queryNvidiaGpu()
        .then((value) => {
            gpuCache = { at: Date.now(), value };
            return value;
        })
        .finally(() => {
            gpuInFlight = null;
        });
    return gpuInFlight;
}

function formatGiBFromBytes(bytes) {
    const gib = Number(bytes) / (1024 ** 3);
    if (!Number.isFinite(gib) || gib < 0) return '—';
    if (gib >= 100) return String(Math.round(gib));
    if (gib >= 10) return gib.toFixed(1);
    return gib.toFixed(1);
}

function formatGiBFromMiB(mib) {
    const gib = Number(mib) / 1024;
    if (!Number.isFinite(gib) || gib < 0) return '—';
    if (gib >= 10) return gib.toFixed(1);
    return gib.toFixed(1);
}

function formatResourceUsageText(sample) {
    if (!sample || typeof sample !== 'object') return '';
    const parts = [];
    if (sample.cpuPct != null && Number.isFinite(sample.cpuPct)) {
        parts.push(`CPU ${sample.cpuPct}%`);
    }
    if (sample.memory?.totalBytes > 0) {
        parts.push(
            `内存 ${formatGiBFromBytes(sample.memory.usedBytes)}/${formatGiBFromBytes(sample.memory.totalBytes)} GB`,
        );
    }
    if (sample.gpu && sample.gpu.utilPct != null) {
        parts.push(`GPU ${sample.gpu.utilPct}%`);
        if (sample.gpu.memTotalMiB > 0) {
            parts.push(
                `显存 ${formatGiBFromMiB(sample.gpu.memUsedMiB)}/${formatGiBFromMiB(sample.gpu.memTotalMiB)} GB`,
            );
        }
    }
    return parts.join(' · ');
}

async function sampleSystemResources({ includeGpu = true } = {}) {
    const cpuPct = sampleCpuPercent();
    const memory = sampleMemory();
    const gpu = includeGpu ? await sampleGpu() : null;
    const sample = {
        ok: true,
        at: Date.now(),
        cpuPct,
        memory,
        gpu,
    };
    sample.text = formatResourceUsageText(sample);
    return sample;
}

/** Test helper — reset module state between cases. */
function _resetSystemResourcesStateForTests() {
    prevCpuTimes = null;
    gpuCache = { at: 0, value: null };
    gpuInFlight = null;
    gpuUnavailable = false;
}

module.exports = {
    sampleSystemResources,
    formatResourceUsageText,
    formatGiBFromBytes,
    formatGiBFromMiB,
    parseNvidiaCsvLine,
    _resetSystemResourcesStateForTests,
};
