const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const AMD_ROCM_LABELS = {
    gfx120x_all: 'RX 9000 系列',
    gfx110x_all: 'RX 7000 系列',
    gfx103x_dgpu: 'RX 6000 系列',
    gfx101x_dgpu: 'RX 5000 系列',
};

function parseNvidiaGpuNames(stdout) {
    const names = [];
    for (const line of String(stdout || '').split('\n')) {
        const match = line.match(/^\|\s*\d+\s+(.+?)\s{2,}(?:WDDM|\d)/);
        if (!match) continue;
        const name = match[1].replace(/\s+WDDM$/i, '').trim();
        if (name && !/^Name$/i.test(name)) names.push(name);
    }
    return names;
}

function cleanAmdGpuName(raw) {
    return String(raw || '')
        .replace(/\s*\(.*?Radeon.*?\)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolveAmdRocmSuffix(gpuName) {
    if (/9060|9070|9000/i.test(gpuName)) return 'gfx120x_all';
    if (/7600|7700|7800|7900|7000/i.test(gpuName)) return 'gfx110x_all';
    if (/6600|6700|6800|6900|6000/i.test(gpuName)) return 'gfx103x_dgpu';
    if (/5700|5600|5500|5000/i.test(gpuName)) return 'gfx101x_dgpu';
    return 'gfx110x_all';
}

function buildFriendlyRecommendation(info) {
    const lines = [];

    if (info.vendor === 'nvidia' && info.detected) {
        lines.push(`检测到 NVIDIA 显卡：${info.gpuName}`);
        if (info.driverVersion) lines.push(`当前驱动版本：${info.driverVersion}`);
        if (info.cudaVersion) lines.push(`驱动支持的 CUDA 版本：${info.cudaVersion}`);
        const cudaMajor = Number(String(info.cudaVersion || '').split('.')[0]);
        if (cudaMajor >= 12) {
            lines.push('请下载 CUDA 12.2 或 12.8 版本的 TransWithAI');
        } else {
            lines.push('请下载 CUDA 11.8 或 12.2 版本的 TransWithAI');
        }
        lines.push('安装完成后，在参数里把「设备」选为「GPU 翻译（NVIDIA）」即可用显卡加速。');
        return lines.join('\n');
    }

    if (info.vendor === 'amd' && info.detected) {
        const series = AMD_ROCM_LABELS[info.rocmSuffix] || '对应显卡';
        lines.push(`检测到 AMD 显卡：${info.gpuName}`);
        lines.push(`请下载 AMD ROCm 版 TransWithAI（${series}，后缀 ${info.rocmSuffix}）`);
        lines.push('安装完成后，在参数里把「设备」选为「GPU 翻译（AMD ROCm）」。');
        return lines.join('\n');
    }

    lines.push('未检测到 NVIDIA 或 AMD 独立显卡。');
    lines.push('可以下载 CPU 版 TransWithAI 用处理器转写，或在「设备」里选择 Modal 云端推理。');
    return lines.join('\n');
}

async function detectNvidiaCuda() {
    try {
        const { stdout } = await execFileAsync('nvidia-smi', [], {
            windowsHide: true,
            timeout: 8000,
        });
        const cudaMatch = stdout.match(/CUDA Version:\s*(\d+\.\d+)/i);
        const driverMatch = stdout.match(/Driver Version:\s*(\S+)/i);
        const gpuNames = parseNvidiaGpuNames(stdout);
        const info = {
            vendor: 'nvidia',
            detected: true,
            cudaVersion: cudaMatch ? cudaMatch[1] : null,
            driverVersion: driverMatch ? driverMatch[1] : null,
            gpuName: gpuNames[0] || 'NVIDIA 显卡',
            gpuNames,
        };
        info.friendlyRecommendation = buildFriendlyRecommendation(info);
        info.recommendation = info.friendlyRecommendation;
        return info;
    } catch {
        return { vendor: 'nvidia', detected: false };
    }
}

async function detectAmdGpu() {
    try {
        const { stdout } = await execFileAsync('wmic', ['path', 'win32_VideoController', 'get', 'name'], {
            windowsHide: true,
            timeout: 8000,
        });
        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean).slice(1);
        const amdRaw = lines.find((l) => /radeon|amd/i.test(l));
        if (!amdRaw) return { vendor: 'amd', detected: false };
        const rocmSuffix = resolveAmdRocmSuffix(amdRaw);
        const info = {
            vendor: 'amd',
            detected: true,
            gpuName: cleanAmdGpuName(amdRaw),
            rocmSuffix,
        };
        info.friendlyRecommendation = buildFriendlyRecommendation(info);
        info.recommendation = info.friendlyRecommendation;
        return info;
    } catch {
        return { vendor: 'amd', detected: false };
    }
}

async function detectGpuEnvironment() {
    const [nvidia, amd] = await Promise.all([detectNvidiaCuda(), detectAmdGpu()]);
    if (nvidia.detected) return nvidia;
    if (amd.detected) return amd;
    const info = {
        vendor: 'cpu',
        detected: false,
    };
    info.friendlyRecommendation = buildFriendlyRecommendation(info);
    info.recommendation = info.friendlyRecommendation;
    return info;
}

module.exports = {
    detectGpuEnvironment,
    detectNvidiaCuda,
    detectAmdGpu,
    buildFriendlyRecommendation,
    parseNvidiaGpuNames,
};
