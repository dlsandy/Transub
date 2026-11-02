/**
 * Lightweight system resource sampling for the main-window status strip.
 * CPU / RAM via Node os; NVIDIA via nvidia-smi; AMD / Intel Arc total VRAM via registry
 * (Win32 AdapterRAM is uint32 and caps at ~4GB).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const GPU_QUERY_TIMEOUT_MS = 2500;
const GPU_CACHE_MS = 1800;
/** Consecutive hard misses before skipping GPU probes for a while. */
const GPU_MISS_DISABLE_AFTER = 8;
const GPU_MISS_COOLDOWN_MS = 60_000;
/** WMI AdapterRAM uint32 ceiling (~4 GiB); treat as unreliable when >= this. */
const ADAPTER_RAM_UINT32_CAP_BYTES = 4 * 1024 * 1024 * 1024 - 1;

let prevCpuTimes = null;
let gpuCache = { at: 0, value: null };
let gpuInFlight = null;
let gpuMissStreak = 0;
let gpuSkipUntil = 0;
let nvidiaSmiPathCache = undefined;
/** After first successful sample: 'nvidia' | 'amd' | 'intel' — skip other vendors. */
let preferredGpuVendor = null;

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

/**
 * Normalize AdapterRAM / registry qwMemorySize to a non-negative byte count.
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseAdapterRamBytes(raw) {
    let n = Number(raw);
    if (!Number.isFinite(n) || n === 0) return null;
    // WMI / JSON may surface uint32 as signed int32.
    if (n < 0) n = n >>> 0;
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

/**
 * Prefer registry QWORD VRAM; fall back to WMI AdapterRAM (uint32, may cap at ~4GB).
 * @param {unknown} registryBytes
 * @param {unknown} adapterRamBytes
 * @returns {number|null}
 */
function resolveAmdVramBytes(registryBytes, adapterRamBytes) {
    const reg = parseAdapterRamBytes(registryBytes);
    if (reg != null && reg >= 512 * 1024 * 1024) return reg;
    const wmi = parseAdapterRamBytes(adapterRamBytes);
    if (wmi != null && wmi >= 512 * 1024 * 1024) return wmi;
    return reg;
}

async function queryNvidiaGpu() {
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
        if (!parsed) return null;
        return { vendor: 'nvidia', ...parsed };
    } catch {
        return null;
    }
}

async function queryAmdGpu() {
    if (process.platform !== 'win32') return null;
    try {
        // Prefer HardwareInformation.qwMemorySize (QWORD). Win32 AdapterRAM is
        // uint32 and reports ~4GB for RX 7000/9000 and other >4GB cards.
        const { stdout } = await execFileAsync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                [
                    "$ErrorActionPreference='SilentlyContinue'",
                    "$regBytes=$null;$name=$null;$wmiBytes=$null",
                    "$rows=@(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' |",
                    "  Where-Object { $_.DriverDesc -match 'Radeon|AMD' -and $_.DriverDesc -notmatch 'Microsoft Basic' -and $_.'HardwareInformation.qwMemorySize' -gt 0 } |",
                    "  Select-Object @{n='Name';e={[string]$_.DriverDesc}}, @{n='AdapterRAM';e={[int64]$_.'HardwareInformation.qwMemorySize'}} |",
                    '  Sort-Object AdapterRAM -Descending)',
                    'if ($rows.Count -gt 0) { $name=$rows[0].Name; $regBytes=[int64]$rows[0].AdapterRAM }',
                    "if (-not $regBytes -or $regBytes -le 0) {",
                    "  $vc=Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'Radeon|AMD' -and $_.Name -notmatch 'Microsoft Basic' } | Select-Object -First 1 Name,AdapterRAM",
                    '  if ($vc) { $name=[string]$vc.Name; $wmiBytes=[int64]$vc.AdapterRAM }',
                    '}',
                    'if (-not $name) { \'\' } else { @{ Name=$name; RegistryRAM=$regBytes; AdapterRAM=$wmiBytes } | ConvertTo-Json -Compress }',
                ].join('; '),
            ],
            { windowsHide: true, timeout: GPU_QUERY_TIMEOUT_MS },
        );
        const text = String(stdout || '').trim();
        if (!text) return null;
        const row = JSON.parse(text);
        if (!row || typeof row !== 'object') return null;
        const ram = resolveAmdVramBytes(row.RegistryRAM, row.AdapterRAM);
        if (ram == null) return null;
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

async function queryIntelGpu() {
    if (process.platform !== 'win32') return null;
    try {
        const { stdout } = await execFileAsync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                [
                    "$ErrorActionPreference='SilentlyContinue'",
                    "$regBytes=$null;$name=$null;$wmiBytes=$null",
                    "$rows=@(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' |",
                    "  Where-Object { $_.DriverDesc -match 'Intel.*Arc|Arc.*(A|B)?\\d{3}' -and $_.DriverDesc -notmatch 'Microsoft Basic|UHD Graphics|Iris' -and $_.'HardwareInformation.qwMemorySize' -gt 0 } |",
                    "  Select-Object @{n='Name';e={[string]$_.DriverDesc}}, @{n='AdapterRAM';e={[int64]$_.'HardwareInformation.qwMemorySize'}} |",
                    '  Sort-Object AdapterRAM -Descending)',
                    'if ($rows.Count -gt 0) { $name=$rows[0].Name; $regBytes=[int64]$rows[0].AdapterRAM }',
                    "if (-not $regBytes -or $regBytes -le 0) {",
                    "  $vc=Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'Intel.*Arc|Arc.*(A|B)?\\d{3}' -and $_.Name -notmatch 'Microsoft Basic|UHD Graphics|Iris' } | Select-Object -First 1 Name,AdapterRAM",
                    '  if ($vc) { $name=[string]$vc.Name; $wmiBytes=[int64]$vc.AdapterRAM }',
                    '}',
                    'if (-not $name) { \'\' } else { @{ Name=$name; RegistryRAM=$regBytes; AdapterRAM=$wmiBytes } | ConvertTo-Json -Compress }',
                ].join('; '),
            ],
            { windowsHide: true, timeout: GPU_QUERY_TIMEOUT_MS },
        );
        const text = String(stdout || '').trim();
        if (!text) return null;
        const row = JSON.parse(text);
        if (!row || typeof row !== 'object') return null;
        const ram = resolveAmdVramBytes(row.RegistryRAM, row.AdapterRAM);
        if (ram == null) return null;
        const memTotalMiB = Math.max(0, Math.round(ram / (1024 * 1024)));
        if (memTotalMiB < 512) return null;
        return {
            vendor: 'intel',
            utilPct: null,
            memUsedMiB: null,
            memTotalMiB,
            name: String(row.Name || '').trim() || 'Intel Arc',
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
        if (preferredGpuVendor !== 'amd' && preferredGpuVendor !== 'intel') {
            const nvidia = await queryNvidiaGpu();
            if (nvidia != null) {
                preferredGpuVendor = 'nvidia';
                noteGpuHit();
                gpuCache = { at: Date.now(), value: nvidia };
                return nvidia;
            }
        }
        if (preferredGpuVendor !== 'nvidia' && preferredGpuVendor !== 'intel') {
            const amd = await queryAmdGpu();
            if (amd != null) {
                preferredGpuVendor = 'amd';
                noteGpuHit();
                gpuCache = { at: Date.now(), value: amd };
                return amd;
            }
        }
        if (preferredGpuVendor !== 'nvidia' && preferredGpuVendor !== 'amd') {
            const intel = await queryIntelGpu();
            if (intel != null) {
                preferredGpuVendor = 'intel';
                noteGpuHit();
                gpuCache = { at: Date.now(), value: intel };
                return intel;
            }
        }
        noteGpuMiss();
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
        } else if (sample.gpu.vendor === 'intel') {
            parts.push('GPU Intel');
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

/**
 * Sync peek of the last GPU sample (for callers that cannot await sampleGpu).
 * Returns null when never sampled or stale beyond ~18s.
 * @param {{ maxAgeMs?: number }} [opts]
 * @returns {object|null}
 */
function peekCachedGpuSample(opts = {}) {
    const maxAge = Number(opts.maxAgeMs);
    const ageLimit = Number.isFinite(maxAge) && maxAge > 0
        ? maxAge
        : GPU_CACHE_MS * 10;
    if (!gpuCache.value || !gpuCache.at) return null;
    if (Date.now() - gpuCache.at > ageLimit) return null;
    return gpuCache.value;
}

/** Test helper — reset module state between cases. */
function _resetSystemResourcesStateForTests() {
    prevCpuTimes = null;
    gpuCache = { at: 0, value: null };
    gpuInFlight = null;
    gpuMissStreak = 0;
    gpuSkipUntil = 0;
    nvidiaSmiPathCache = undefined;
    preferredGpuVendor = null;
}

module.exports = {
    sampleSystemResources,
    sampleGpu,
    peekCachedGpuSample,
    formatResourceUsageText,
    formatGiBFromBytes,
    formatGiBFromMiB,
    parseNvidiaCsvLine,
    parseNvidiaCsvNumber,
    parseAdapterRamBytes,
    resolveAmdVramBytes,
    resolveNvidiaSmiPath,
    ADAPTER_RAM_UINT32_CAP_BYTES,
    _resetSystemResourcesStateForTests,
};
