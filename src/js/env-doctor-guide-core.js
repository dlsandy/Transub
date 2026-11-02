/**
 * Beginner-friendly copy / next-step helpers for env doctor & system check.
 * Pure functions — no DOM.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEnvDoctorGuide = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function envDoctorGuideFactory() {
    const FRIENDLY_LABELS = Object.freeze({
        installPath: '安装位置',
        ffmpeg: '视频工具',
        vcRedist: '系统运行库',
        gpu: '独立显卡',
        gpuDriver: '显卡驱动',
        gpuRuntime: '显卡加速组件',
        engine: '字幕引擎',
        llamaServerRuntime: 'AI 运行时',
        torchEngineStartup: '显卡计算库',
        asrModel: '听写模型',
        vadModel: '语音切分模型',
        lidModel: '语种探测模型',
        sensevoiceRuntime: '听写运行库',
        qwenRuntime: '听写运行库（Qwen）',
        whisperRuntime: '听写运行库（Whisper）',
    });

    const NVIDIA_DRIVER_URL = 'https://www.nvidia.cn/drivers/lookup/';
    const AMD_DRIVER_URL = 'https://www.amd.com/zh-cn/support/download/drivers.html';
    const INTEL_DRIVER_URL = 'https://www.intel.cn/content/www/cn/zh/download-center/home.html';

    function itemById(result, id) {
        return (result?.items || []).find((it) => it && it.id === id) || null;
    }

    function resolveVendor(result) {
        const gpu = itemById(result, 'gpu');
        const rt = itemById(result, 'gpuRuntime');
        const vendor = String(gpu?.vendor || rt?.vendor || '').toLowerCase();
        if (vendor === 'amd' || vendor === 'nvidia' || vendor === 'intel') return vendor;
        const detail = `${gpu?.detail || ''} ${rt?.detail || ''}`;
        if (/Intel\s*Arc|SYCL|XPU/i.test(detail) && !/NVIDIA|GeForce|AMD|Radeon/i.test(detail)) return 'intel';
        if (/AMD|Radeon|ROCm/i.test(detail) && !/NVIDIA|GeForce|RTX|GTX/i.test(detail)) return 'amd';
        if (/NVIDIA|GeForce|RTX|GTX|CUDA/i.test(detail)) return 'nvidia';
        return '';
    }

    function driverUrlForVendor(vendor) {
        if (vendor === 'amd') return AMD_DRIVER_URL;
        if (vendor === 'intel') return INTEL_DRIVER_URL;
        return NVIDIA_DRIVER_URL;
    }

    function friendlyLabel(id, fallback) {
        const key = String(id || '').trim();
        if (FRIENDLY_LABELS[key]) return FRIENDLY_LABELS[key];
        return String(fallback || key || '检查项');
    }

    function isNoDiscreteGpu(result) {
        const gpu = itemById(result, 'gpu');
        const rt = itemById(result, 'gpuRuntime');
        if (gpu?.requireDiscreteGpu && (gpu.status === 'fail' || gpu.status === 'warn')) return true;
        if (rt?.requireDiscreteGpu && (rt.status === 'fail' || rt.status === 'warn')) return true;
        const blob = `${gpu?.detail || ''} ${rt?.detail || ''}`;
        return /未检测到可用独立 GPU|不能以 CPU 模式|不支持仅 CPU/i.test(blob);
    }

    function estimateDownloadTip(fix) {
        if (!fix || typeof fix !== 'object') return '';
        if (fix.ensureTorchCuda || fix.ensureTorchRocm || fix.ensureTorchXpu) {
            return '可能需要下载约 2～4 GB，请预留时间和磁盘空间，期间请勿关闭窗口。';
        }
        if (fix.ensureGpu) {
            return '可能需要下载数百 MB 到数 GB 的加速组件，请保持网络畅通。';
        }
        if (fix.ensureLlamaRuntime) {
            return '需要下载 AI 运行时，体积因机型而异，请耐心等待。';
        }
        if (Array.isArray(fix.modelIds) && fix.modelIds.length) {
            return '需要下载模型或运行库，请保持网络畅通。';
        }
        return '下载大小因机器而异，请保持网络畅通。';
    }

    function versionGateOk(result, explicit) {
        if (typeof explicit === 'boolean') return explicit;
        if (result && typeof result.versionGatePassed === 'boolean') return result.versionGatePassed;
        if (!result) return false;
        if (result.fix?.fixable) return false;
        const gateIds = new Set([
            'installPath', 'ffmpeg', 'vcRedist', 'gpu', 'gpuRuntime',
            'engine', 'llamaServerRuntime', 'torchEngineStartup',
        ]);
        for (const it of (result.items || [])) {
            if (!it || !gateIds.has(it.id)) continue;
            if (it.status === 'fail' || it.status === 'warn') return false;
        }
        return true;
    }

    /**
     * @param {object|null} result
     * @param {{ doctorMode?: boolean, versionGatePassed?: boolean }} [opts]
     */
    function buildBeginnerGuide(result, opts = {}) {
        const doctor = !!opts.doctorMode;
        const vendor = resolveVendor(result);
        const fix = result?.fix || {};
        const fixable = !!fix.fixable;
        const gateOk = versionGateOk(result, opts.versionGatePassed);

        if (!result) {
            return {
                tone: 'busy',
                headline: '正在检查电脑环境…',
                nextStep: '请稍候，通常只要几秒到半分钟。',
                primaryAction: 'wait',
                tip: '',
                vendor,
                driverUrl: '',
            };
        }

        if (gateOk) {
            return {
                tone: 'ok',
                headline: '太好了，环境已经准备好',
                nextStep: doctor
                    ? '请点下方绿色按钮「进入软件」开始使用。'
                    : '可以关闭此窗口，继续使用Transub。',
                primaryAction: doctor ? 'enter' : 'done',
                tip: '',
                vendor,
                driverUrl: '',
            };
        }

        if (isNoDiscreteGpu(result)) {
            return {
                tone: 'err',
                headline: '还没有检测到独立显卡',
                nextStep: '请先安装或更新显卡驱动，装好后回到这里点「重新检测」。',
                primaryAction: 'driver',
                tip: '台式机请确认显卡已插好电源线；笔记本请接电源，并在系统里选用独立显卡（Intel 需 Arc，不含普通 UHD/Iris）。',
                vendor: vendor || 'unknown',
                driverUrl: driverUrlForVendor(vendor),
            };
        }

        if (fixable) {
            const vendorTip = vendor === 'amd'
                ? ' 本机是 AMD 显卡，将安装 ROCm 加速'
                : (vendor === 'intel'
                    ? ' 本机是 Intel Arc，将安装引擎内 XPU PyTorch（听写 / Demucs）；大模型另装 SYCL'
                    : (vendor === 'nvidia'
                        ? ' 本机是 NVIDIA 显卡，将安装 CUDA 加速组件。'
                        : ''));
            return {
                tone: 'warn',
                headline: '运行环境待修复',
                nextStep: doctor
                    ? '点击下方「一键修复」 按钮，然后等待进度完成。'
                    : '点击「一键修复」（或「自动修复」），保持网络畅通并耐心等待。',
                primaryAction: 'fix',
                tip: (estimateDownloadTip(fix) + vendorTip).trim(),
                vendor,
                driverUrl: '',
            };
        }

        const manual = Array.isArray(fix.manualHints) && fix.manualHints.length > 0;
        if (manual) {
            const names = fix.manualHints
                .map((h) => friendlyLabel(h.id, h.label))
                .filter(Boolean)
                .slice(0, 3)
                .join('、');
            return {
                tone: 'err',
                headline: '有些项目需要按提示手动处理',
                nextStep: names
                    ? `请查看列表中的「${names}」，按说明操作后点「重新检测」。`
                    : '请查看下方红色/橙色项目，按说明操作后点「重新检测」。',
                primaryAction: 'manual',
                tip: '若提示缺少系统运行库，可点对应「打开」下载安装；装好后务必重启本软件再检测。',
                vendor,
                driverUrl: '',
            };
        }

        return {
            tone: 'warn',
            headline: '检测未完全通过',
            nextStep: '请点「重新检测」；若仍失败，可点「手动修复」或查看下方失败项说明。',
            primaryAction: 'retry',
            tip: '',
            vendor,
            driverUrl: '',
        };
    }

    function doctorPrimaryButtonLabel(guide) {
        const action = guide?.primaryAction || '';
        if (action === 'enter' || action === 'done') return '进入软件';
        if (action === 'fix') return '一键修复';
        if (action === 'driver') return '打开驱动下载页';
        if (action === 'manual') return '手动修复';
        if (action === 'retry') return '重新检测';
        return '一键修复';
    }

    function decorateItemsForBeginners(items) {
        return (Array.isArray(items) ? items : []).map((it) => {
            if (!it || typeof it !== 'object') return it;
            return {
                ...it,
                label: friendlyLabel(it.id, it.label),
            };
        });
    }

    return {
        FRIENDLY_LABELS,
        NVIDIA_DRIVER_URL,
        AMD_DRIVER_URL,
        INTEL_DRIVER_URL,
        friendlyLabel,
        resolveVendor,
        driverUrlForVendor,
        isNoDiscreteGpu,
        estimateDownloadTip,
        versionGateOk,
        buildBeginnerGuide,
        doctorPrimaryButtonLabel,
        decorateItemsForBeginners,
    };
}));
