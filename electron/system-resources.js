/**
 * Lightweight system resource sampling for the main-window status strip.
 * CPU / RAM via Node os; NVIDIA GPU via nvidia-smi (optional).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const GPU_QUERY_TIMEOUT_MS = 2500;
const GPU_CACHE_MS = 1800;
/** Consecutive hard misses before skipping nvidia-smi for a while. */
const GPU_MISS_DISABLE_AFTER = 8;
const GPU_MISS_COOLDOWN_MS = 60_000;

let prevCpuTimes = null;
let gpuCache = { at: 0, value: null };
let gpuInFlight = null;
let gpuMissStreak = 0;
let gpuSkipUntil = 0;
let nvidiaSmiPathCache = undefined;

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

/**
 * Parse nvidia-smi CSV cells; accepts "87" or "87 %" / "6123 MiB".
 * @param {string} raw
 * @returns {number|null}
 */
function parseNvidiaCsvNumber(raw) {
    const m = String(raw || '').trim().match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
}

function parseNvidiaCsvLine(line) {
    const parts = String(line || '').split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    const util = parseNvidiaCsvNumber(parts[0]);
    const memUsed = parseNvidiaCsvNumber(parts[1]);
    const memTotal = parseNvidiaCsvNumber(parts[2]);
    if (util == null || memUsed == null || memTotal == null) return null;
    return {
        utilPct: Math.max(0, Math.min(100, Math.round(util))),
        memUsedMiB: Math.max(0, Math.round(memUsed)),
        memTotalMiB: Math.max(0, Math.round(memTotal)),
    };
}

function resolveNvidiaSmiPath() {
    if (nvidiaSmiPathCache !== undefined) return nvidiaSmiPathCache;
    const candidates = [];
    if (process.platform === 'win32') {
        const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
        candidates.push(path.join(root, 'System32', 'nvidia-smi.exe'));
        if (process.env.ProgramFiles) {
            candidates.push(path.join(process.env.ProgramFiles, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'));
        }
    }
    for (const cand of candidates) {
        try {
            if (cand && fs.existsSync(cand)) {
                nvidiaSmiPathCache = cand;
                return nvidiaSmiPathCache;
            }
        } catch { /* ignore */ }
    }
    nvidiaSmiPathCache = 'nvidia-smi';
    return nvidiaSmiPathCache;
}

function noteGpuMiss() {
    gpuMissStreak += 1;
    if (gpuMissStreak >= GPU_MISS_DISABLE_AFTER) {
        gpuSkipUntil = Date.now() + GPU_MISS_COOLDOWN_MS;
        gpuMissStreak = 0;
    }
}

function noteGpuHit() {
    gpuMissStreak = 0;
    gpuSkipUntil = 0;
}

async function queryNvidiaGpu() {
    if (Date.now() < gpuSkipUntil) return null;
    try {
        const bin = resolveNvidiaSmiPath();
        const { stdout } = await execFileAsync(
            bin,
            [
                '--query-gpu=utilization.gpu,memory.used,memory.total',
                '--format=csv,noheader,nounits',
            ],
            { windowsHide: true, timeout: GPU_QUERY_TIMEOUT_MS },
        );
        const first = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
        const parsed = parseNvidiaCsvLine(first);
        if (!parsed) {
            noteGpuMiss();
            return null;
        }
        noteGpuHit();
        return { vendor: 'nvidia', ...parsed };
    } catch {
        noteGpuMiss();
        return null;
    }
}

async function queryAmdGpu() {
    if (process.platform !== 'win32') return null;
    try {
        const { stdout } = await execFileAsync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                (
                    "Get-CimInstance Win32_VideoController "
                    + "| Where-Object { $_.Name -match 'Radeon|AMD' -and $_.Name -notmatch 'Microsoft Basic' } "
                    + "| Select-Object -First 1 Name,AdapterRAM "
                    + "| ConvertTo-Json -Compress"
                ),
            ],
            { windowsHide: true, timeout: GPU_QUERY_TIMEOUT_MS },
        );
        const text = String(stdout || '').trim();
        if (!text) return null;
        const row = JSON.parse(text);
        if (!row || typeof row !== 'object') return null;
        let ram = Number(row.AdapterRAM || 0);
        if (!Number.isFinite(ram) || ram === 0) return null;
        if (ram < 0) ram = ram >>> 0;
        const memTotalMiB = Math.max(0, Math.round(ram / (1024 * 1024)));
        if (memTotalMiB < 512) return null;
        return {
            vendor: 'amd',
            utilPct: null,
            memUsedMiB: null,
            memTotalMiB,
            name: String(row.Name || '').trim() || 'AMD GPU',
        };
    } catch {
        return null;
    }
}

async function sampleGpu() {
    const now = Date.now();
    if (gpuCache.value != null && (now - gpuCache.at) < GPU_CACHE_MS) {
        return gpuCache.value;
    }
    if (now < gpuSkipUntil) return null;
    if (gpuInFlight) return gpuInFlight;

    gpuInFlight = (async () => {
        const nvidia = await queryNvidiaGpu();
        if (nvidia != null) {
            gpuCache = { at: Date.now(), value: nvidia };
            return nvidia;
        }
        const amd = await queryAmdGpu();
        if (amd != null) {
            gpuCache = { at: Date.now(), value: amd };
            return amd;
        }
        return null;
    })().finally(() => {
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
    if (sample.gpu && (sample.gpu.utilPct != null || sample.gpu.memTotalMiB > 0)) {
        if (sample.gpu.utilPct != null) {
            parts.push(`GPU ${sample.gpu.utilPct}%`);
        } else if (sample.gpu.vendor === 'amd') {
            parts.push('GPU AMD');
        }
        if (sample.gpu.memTotalMiB > 0) {
            const usedLabel = sample.gpu.memUsedMiB != null
                ? formatGiBFromMiB(sample.gpu.memUsedMiB)
                : '—';
            parts.push(
                `显存 ${usedLabel}/${formatGiBFromMiB(sample.gpu.memTotalMiB)} GB`,
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
    gpuMissStreak = 0;
    gpuSkipUntil = 0;
    nvidiaSmiPathCache = undefined;
}

module.exports = {
    sampleSystemResources,
    sampleGpu,
    formatResourceUsageText,
    formatGiBFromBytes,
    formatGiBFromMiB,
    parseNvidiaCsvLine,
    parseNvidiaCsvNumber,
    resolveNvidiaSmiPath,
    _resetSystemResourcesStateForTests,
};
