/**
 * First-run system environment probes (install path, FFmpeg, VC++, GPU, Engine, ASR).
 * Fast path — does not start the engine HTTP server.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { detectGpuEnvironment } = require('./gpu-detect');
const { getInstallRoot, getBundledEnginePath, isValidEngineRoot } = require('./app-paths');
const { resolveEngineInstallPath } = require('./engine-options');
const { validateFfmpegSetup } = require('./ffmpeg-bridge');

const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const SUPPORT_URL = 'https://github.com/dlsandy/Transub';

/** Default transcription stack (SenseVoice + FSMN). Keep markers aligned with engine download.py. */
const ASR_MODEL_MARKERS = {
    'sensevoice-small': {
        kind: 'asr',
        markers: ['model.pt', 'model.bin'],
        required: true,
        label: 'ASR 模型（SenseVoice）',
    },
    'fsmn-vad': {
        kind: 'vad',
        markers: ['model.pt', 'model.bin'],
        required: true,
        label: 'VAD 模型（FSMN）',
    },
    'whisper-tiny': {
        kind: 'asr',
        markers: ['model.bin'],
        required: false,
        label: '语种探测模型（Whisper tiny）',
    },
};

function hasNonAscii(text) {
    return /[^\x00-\x7F]/.test(String(text || ''));
}

function resolveEnginePython(engineRoot) {
    const root = path.resolve(String(engineRoot || '').trim() || '.');
    const candidates = process.platform === 'win32'
        ? [
            path.join(root, 'runtime', 'python.exe'),
            path.join(root, 'runtime', 'Scripts', 'python.exe'),
        ]
        : [
            path.join(root, 'runtime', 'bin', 'python'),
            path.join(root, 'runtime', 'bin', 'python3'),
        ];
    return candidates.find((p) => fs.existsSync(p)) || '';
}

function modelHasWeights(modelDir, markers) {
    if (!modelDir || !fs.existsSync(modelDir)) return false;
    for (const name of markers) {
        const candidate = path.join(modelDir, name);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1024) return true;
        } catch {
            /* ignore */
        }
    }
    return false;
}

function checkModelInstalled(engineRoot, modelId) {
    const id = String(modelId || '').trim();
    if (!id) return { installed: false, path: '' };
    const meta = ASR_MODEL_MARKERS[id];
    const kind = meta?.kind
        || (id.includes('vad') || id.includes('whisperseg') ? 'vad' : 'asr');
    const markers = meta?.markers
        || (id.includes('whisper') && !id.includes('sensevoice')
            ? ['model.bin']
            : ['model.pt', 'model.bin']);
    const modelDir = path.join(
        path.resolve(String(engineRoot || '').trim() || '.'),
        'models',
        kind,
        id,
    );
    return {
        installed: modelHasWeights(modelDir, markers),
        path: modelDir,
    };
}

function prefersSensevoice(engineAsrModel) {
    const id = String(engineAsrModel || '').trim().toLowerCase();
    if (!id) return true; // product default is sensevoice-small
    return id.includes('sensevoice');
}

function prefersWhisper(engineAsrModel) {
    const id = String(engineAsrModel || '').trim().toLowerCase();
    if (!id) return false;
    return id.includes('whisper') && !id.includes('whisperseg');
}

function listInstalledAsrIds(engineRoot) {
    const root = path.resolve(String(engineRoot || '').trim() || '.');
    const asrRoot = path.join(root, 'models', 'asr');
    const found = [];
    if (!fs.existsSync(asrRoot)) return found;
    let entries = [];
    try {
        entries = fs.readdirSync(asrRoot, { withFileTypes: true });
    } catch {
        return found;
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const id = ent.name;
        const markers = id.includes('whisper')
            ? ['model.bin']
            : ['model.pt', 'model.bin'];
        if (modelHasWeights(path.join(asrRoot, id), markers)) {
            found.push(id);
        }
    }
    return found;
}

function checkAsrModel(engineRoot, engineAsrModel = '') {
    const preferred = String(engineAsrModel || '').trim();
    const installed = listInstalledAsrIds(engineRoot);
    if (preferred) {
        const hit = checkModelInstalled(engineRoot, preferred).installed
            || installed.includes(preferred);
        if (hit) {
            return {
                id: 'asrModel',
                label: 'ASR 模型',
                status: 'ok',
                detail: `${preferred} 已就绪`,
                blocking: false,
            };
        }
    }
    if (installed.length) {
        const preferSv = prefersSensevoice(preferred);
        const hasSense = installed.some((id) => id.includes('sensevoice'));
        const hasWhisper = installed.some((id) => id.includes('whisper'));
        if (preferSv && hasSense) {
            return {
                id: 'asrModel',
                label: 'ASR 模型',
                status: 'ok',
                detail: `sensevoice-small 已就绪`,
                blocking: false,
            };
        }
        return {
            id: 'asrModel',
            label: 'ASR 模型',
            status: 'ok',
            detail: `已安装：${installed.slice(0, 3).join('、')}${installed.length > 3 ? '…' : ''}`,
            blocking: false,
        };
    }
    return {
        id: 'asrModel',
        label: 'ASR 模型',
        status: 'fail',
        detail: preferred
            ? `未找到 ${preferred}。请运行「设置向导」或在「处理模型」下载模型`
            : '未找到可用 ASR 模型。请运行「设置向导」或在「处理模型」下载 SenseVoice / Whisper',
        blocking: true,
    };
}

function checkVadModel(engineRoot, engineAsrModel = '') {
    const needFsmn = prefersSensevoice(engineAsrModel);
    const vad = checkModelInstalled(engineRoot, 'fsmn-vad');
    if (vad.installed) {
        return {
            id: 'vadModel',
            label: 'VAD 模型（FSMN）',
            status: 'ok',
            detail: 'fsmn-vad 已就绪（随包装）',
            blocking: false,
        };
    }
    if (!needFsmn) {
        return {
            id: 'vadModel',
            label: 'VAD 模型（FSMN）',
            status: 'warn',
            detail: 'fsmn-vad 未找到；当前 Whisper 可用内置 Silero VAD，不影响转写',
            blocking: false,
        };
    }
    return {
        id: 'vadModel',
        label: 'VAD 模型（FSMN）',
        status: 'fail',
        detail: 'SenseVoice 默认 VAD 未找到。请重新安装或在「处理模型」下载 fsmn-vad',
        blocking: true,
    };
}

function checkLidModel(engineRoot) {
    const tiny = checkModelInstalled(engineRoot, 'whisper-tiny');
    if (tiny.installed) {
        return {
            id: 'lidModel',
            label: '语种探测模型',
            status: 'ok',
            detail: 'whisper-tiny 已就绪（随包装）',
            blocking: false,
        };
    }
    return {
        id: 'lidModel',
        label: '语种探测模型',
        status: 'warn',
        detail: 'whisper-tiny 未找到；自动语种检测可能不可用，可手动指定片源语言',
        blocking: false,
    };
}

/**
 * Run a short Python probe in the engine runtime (no HTTP server).
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number|null }>}
 */
function runEnginePython(engineRoot, code, timeoutMs = 12000) {
    const py = resolveEnginePython(engineRoot);
    if (!py) {
        return Promise.resolve({
            ok: false,
            stdout: '',
            stderr: 'engine python missing',
            code: null,
        });
    }
    return new Promise((resolve) => {
        const child = spawn(py, ['-c', code], {
            cwd: path.resolve(String(engineRoot || '').trim() || '.'),
            windowsHide: true,
            env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
                child.kill();
            } catch { /* ignore */ }
            resolve({ ok: false, stdout, stderr: stderr || 'timeout', code: null });
        }, timeoutMs);
        child.stdout?.on('data', (buf) => {
            stdout += String(buf);
        });
        child.stderr?.on('data', (buf) => {
            stderr += String(buf);
        });
        child.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, stdout, stderr: err?.message || String(err), code: null });
        });
        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: code === 0, stdout, stderr, code });
        });
    });
}

async function checkSensevoiceRuntime(engineRoot, engineAsrModel = '') {
    const needSv = prefersSensevoice(engineAsrModel);
    const modelInstalled = checkModelInstalled(engineRoot, 'sensevoice-small').installed;
    // Import torch + FunASR stack deps — catches missing VC++ / Smart App Control / slim-pack gaps.
    const probe = await runEnginePython(
        engineRoot,
        [
            'import json,sys',
            'out={"torch":"","funasr":"","numba":"","scipy":"","librosa":"","missing":[],"error":""}',
            'try:',
            ' import torch',
            ' out["torch"]=str(getattr(torch,"__version__","") or "")',
            'except Exception as e:',
            ' out["missing"].append("torch"); out["error"]=str(e)',
            ' print(json.dumps(out,ensure_ascii=False)); sys.exit(2)',
            'for mod,key in (("funasr","funasr"),("numba","numba"),("scipy","scipy"),("librosa","librosa")):',
            ' try:',
            '  m=__import__(mod)',
            '  out[key]=str(getattr(m,"__version__","") or "ok")',
            ' except Exception as e:',
            '  out["missing"].append(key)',
            '  if not out["error"]: out["error"]=str(e)',
            'print(json.dumps(out,ensure_ascii=False))',
            'sys.exit(3 if out["missing"] else 0)',
        ].join('\n'),
        20000,
    );
    let data = null;
    try {
        data = JSON.parse(String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
    } catch {
        data = null;
    }
    const missingList = Array.isArray(data?.missing) ? data.missing.map(String) : [];
    if (probe.ok && data?.torch && missingList.length === 0) {
        const bits = [`torch ${data.torch}`];
        if (data.funasr) bits.push(`funasr ${data.funasr}`);
        if (data.numba) bits.push(`numba ${data.numba}`);
        if (data.scipy) bits.push(`scipy ${data.scipy}`);
        return {
            id: 'sensevoiceRuntime',
            label: 'SenseVoice 运行库',
            status: 'ok',
            detail: bits.join(' · '),
            blocking: false,
        };
    }
    const err = String(data?.error || probe.stderr || '').trim();
    const low = err.toLowerCase();
    let missingPkg = missingList[0] || '';
    if (!missingPkg) {
        if (/no module named ['"]?funasr/i.test(err)) missingPkg = 'funasr';
        else if (/no module named ['"]?torch/i.test(err)) missingPkg = 'torch';
        else if (/no module named ['"]?numba/i.test(err)) missingPkg = 'numba';
        else if (/no module named ['"]?scipy/i.test(err)) missingPkg = 'scipy';
        else if (/no module named ['"]?librosa/i.test(err)) missingPkg = 'librosa';
    }
    const missingLabel = missingList.length ? missingList.join(', ') : missingPkg;

    let detail;
    if (/winerror 4551|智能应用控制|应用程序控制策略|smart.?app/i.test(err)) {
        detail = 'Windows 智能应用控制/应用程序控制策略拦截了 torch DLL，请关闭该策略或将引擎目录加入排除项';
    } else if (/winerror 126|找不到指定的模块|dll load failed/i.test(err) || low.includes('torch_python')) {
        detail = '无法加载 torch DLL。请先安装 Visual C++ 运行库；若仍失败请关闭「智能应用控制」后重试';
    } else if (modelInstalled && missingLabel) {
        detail = `模型权重已安装，但缺少运行库 ${missingLabel}（与「已安装」不是同一项）。在「处理模型」对 SenseVoice Small 点重新下载可补齐`;
    } else if (missingLabel) {
        detail = `缺少运行库 ${missingLabel}；下载 SenseVoice 模型时会自动安装`;
    } else {
        detail = err || '无法加载 SenseVoice 运行库（torch / funasr / numba / scipy，不是模型权重本身）';
    }

    // Whisper 用户：SenseVoice 运行库缺失只是提示，不阻断「开始使用」。
    if (!needSv) {
        return {
            id: 'sensevoiceRuntime',
            label: 'SenseVoice 运行库',
            status: 'warn',
            detail: `${detail}（当前 ASR 为 Whisper，不影响现有转写）`,
            blocking: false,
        };
    }
    return {
        id: 'sensevoiceRuntime',
        label: 'SenseVoice 运行库',
        status: 'fail',
        detail,
        blocking: true,
    };
}

async function checkWhisperRuntime(engineRoot, engineAsrModel = '') {
    const needWhisper = prefersWhisper(engineAsrModel) || !prefersSensevoice(engineAsrModel);
    const probe = await runEnginePython(
        engineRoot,
        [
            'import json,sys',
            'out={"numpy":"","fw":"","av":"","ct2":"","ort":"","missing":[],"errors":[],"policy":False,"dll":False}',
            'try:',
            ' import numpy as np',
            ' out["numpy"]=str(getattr(np,"__version__","") or "")',
            'except Exception as e:',
            ' out["missing"].append("numpy"); out["errors"].append(str(e))',
            'try:',
            ' import av',
            ' out["av"]=str(getattr(av,"__version__","") or "ok")',
            'except Exception as e:',
            ' out["missing"].append("av"); out["errors"].append(str(e))',
            'try:',
            ' import ctranslate2 as ct2',
            ' out["ct2"]=str(getattr(ct2,"__version__","") or "ok")',
            'except Exception as e:',
            ' out["missing"].append("ctranslate2"); out["errors"].append(str(e))',
            'try:',
            ' import onnxruntime as ort',
            ' out["ort"]=str(getattr(ort,"__version__","") or "ok")',
            'except Exception as e:',
            ' out["missing"].append("onnxruntime"); out["errors"].append(str(e))',
            'try:',
            ' import faster_whisper as fw',
            ' out["fw"]=str(getattr(fw,"__version__","") or "ok")',
            'except Exception as e:',
            ' err=str(e)',
            ' if "ctranslate2" in err.lower() and "ctranslate2" in out["missing"]:',
            '  out["errors"].append(err)',
            ' else:',
            '  out["missing"].append("faster-whisper"); out["errors"].append(err)',
            'err=" ".join(out["errors"])',
            'out["policy"]=("应用程序控制策略" in err) or ("智能应用控制" in err) or ("4551" in err) or ("smart app" in err.lower())',
            'out["dll"]=(not out["policy"]) and (("dll load failed" in err.lower()) or ("找不到指定的模块" in err) or ("winerror 126" in err.lower()))',
            'print(json.dumps(out,ensure_ascii=False))',
            'sys.exit(0 if not out["missing"] else 1)',
        ].join('\n'),
        15000,
    );
    let data = null;
    try {
        data = JSON.parse(String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
    } catch {
        data = null;
    }
    const missing = Array.isArray(data?.missing) ? data.missing : [];
    if (probe.ok && !missing.length) {
        const bits = [];
        if (data?.numpy) bits.push(`numpy ${data.numpy}`);
        if (data?.ct2) bits.push(`ctranslate2 ${data.ct2}`);
        if (data?.ort) bits.push(`onnxruntime ${data.ort}`);
        if (data?.fw) bits.push(`faster-whisper ${data.fw}`);
        if (data?.av) bits.push(`av ${data.av}`);
        return {
            id: 'whisperRuntime',
            label: 'Whisper 运行库',
            status: 'ok',
            detail: bits.length ? bits.join(' · ') : 'numpy / ctranslate2 / onnxruntime / faster-whisper 就绪',
            blocking: false,
        };
    }
    const missLabel = missing.length ? missing.join(' / ') : 'numpy / ctranslate2 / onnxruntime / faster-whisper / av';
    let detail;
    if (data?.policy) {
        detail = 'Windows 应用程序控制策略/智能应用控制拦截了 Whisper 依赖 DLL（多为 av）。请关闭该策略或将引擎目录加入排除；仅重装 pip 无法修复';
    } else if (data?.dll) {
        detail = '无法加载 Whisper 原生 DLL。请先安装 Visual C++ 运行库；若仍失败请关闭「智能应用控制」后重试';
    } else {
        detail = `缺 ${missLabel}：Whisper ASR / 自动语种探测需要；一键修复或下载 Whisper 模型时会自动安装`;
    }
    if (needWhisper) {
        return {
            id: 'whisperRuntime',
            label: 'Whisper 运行库',
            status: 'fail',
            detail,
            blocking: true,
            policyBlocked: !!data?.policy,
            dllBlocked: !!data?.dll,
        };
    }
    return {
        id: 'whisperRuntime',
        label: 'Whisper 运行库',
        status: 'warn',
        detail,
        blocking: false,
        policyBlocked: !!data?.policy,
        dllBlocked: !!data?.dll,
    };
}

function checkInstallPath() {
    const installRoot = getInstallRoot();
    const bad = hasNonAscii(installRoot);
    return {
        id: 'installPath',
        label: '安装路径（仅限 ASCII 字符）',
        status: bad ? 'fail' : 'ok',
        detail: bad
            ? `路径含非英文/空格以外字符，可能导致模型与 DLL 加载失败：${installRoot}`
            : installRoot,
        blocking: bad,
    };
}

async function checkFfmpeg(ffmpegPathSetting) {
    try {
        const res = await validateFfmpegSetup(ffmpegPathSetting, { quick: true });
        if (res?.ok) {
            const bits = [];
            if (res.bundled) bits.push('内置');
            else if (res.custom) bits.push('自定义');
            else if (res.usePath) bits.push('系统 PATH');
            return {
                id: 'ffmpeg',
                label: 'FFmpeg / FFprobe',
                status: 'ok',
                detail: bits.length ? `可用（${bits.join(' · ')}）` : '可用',
                blocking: false,
            };
        }
        return {
            id: 'ffmpeg',
            label: 'FFmpeg / FFprobe',
            status: 'fail',
            detail: res?.error || '未找到可用的 FFmpeg / FFprobe',
            blocking: true,
        };
    } catch (err) {
        return {
            id: 'ffmpeg',
            label: 'FFmpeg / FFprobe',
            status: 'fail',
            detail: err?.message || String(err),
            blocking: true,
        };
    }
}

function checkVcRedist() {
    if (process.platform !== 'win32') {
        return {
            id: 'vcRedist',
            label: 'Visual C++ 运行库',
            status: 'ok',
            detail: '非 Windows，跳过',
            blocking: false,
        };
    }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const system32 = path.join(systemRoot, 'System32');
    const required = ['vcruntime140.dll', 'msvcp140.dll'];
    if (process.arch !== 'arm64') {
        required.push('vcruntime140_1.dll');
    }
    const missing = required.filter((name) => !fs.existsSync(path.join(system32, name)));
    if (missing.length) {
        return {
            id: 'vcRedist',
            label: 'Visual C++ 运行库',
            status: 'fail',
            detail: `缺少 ${missing.join('、')}。SenseVoice / PyTorch 需要 VC++ 才能加载。`,
            blocking: true,
            action: {
                id: 'installVcRedist',
                label: '下载安装',
                url: VC_REDIST_URL,
            },
        };
    }
    return {
        id: 'vcRedist',
        label: 'Visual C++ 运行库',
        status: 'ok',
        detail: '已安装',
        blocking: false,
    };
}

function findCublasInEngine(engineRoot) {
    const root = path.resolve(String(engineRoot || '').trim() || '');
    if (!root) return '';
    const bases = [
        path.join(root, 'runtime', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin'),
        path.join(root, 'runtime', 'lib', 'site-packages', 'nvidia', 'cublas', 'bin'),
        path.join(root, '.venv', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin'),
        path.join(root, 'venv', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin'),
    ];
    for (const dir of bases) {
        const dll = path.join(dir, 'cublas64_12.dll');
        if (fs.existsSync(dll)) return dll;
    }
    return '';
}

async function checkGpu() {
    let info;
    try {
        info = await detectGpuEnvironment();
    } catch (err) {
        return {
            gpu: {
                id: 'gpu',
                label: 'GPU',
                status: 'warn',
                detail: err?.message || '硬件检测失败，将使用 CPU',
                blocking: false,
            },
            driver: {
                id: 'gpuDriver',
                label: 'GPU 驱动版本',
                status: 'warn',
                detail: '未能读取驱动信息',
                blocking: false,
            },
            runtime: {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'warn',
                detail: '将使用 CPU 推理',
                blocking: false,
            },
            info: null,
        };
    }

    const nvidia = info?.vendor === 'nvidia' && info?.detected;
    const gpuItem = nvidia
        ? {
            id: 'gpu',
            label: 'GPU',
            status: 'ok',
            detail: info.gpuName || 'NVIDIA GPU',
            blocking: false,
        }
        : {
            id: 'gpu',
            label: 'GPU',
            status: 'warn',
            detail: info?.gpuName
                ? `检测到 ${info.gpuName}（无 NVIDIA CUDA，将使用 CPU）`
                : '未检测到独立 NVIDIA 显卡，将使用 CPU',
            blocking: false,
        };

    const driverItem = nvidia
        ? {
            id: 'gpuDriver',
            label: 'GPU 驱动版本',
            status: 'ok',
            detail: [
                info.driverVersion ? `驱动 ${info.driverVersion}` : null,
                info.cudaVersion ? `CUDA ${info.cudaVersion}` : null,
            ].filter(Boolean).join(' · ') || '已检测到 NVIDIA 驱动',
            blocking: false,
        }
        : {
            id: 'gpuDriver',
            label: 'GPU 驱动版本',
            status: 'ok',
            detail: '无需（CPU 模式）',
            blocking: false,
        };

    return { gpu: gpuItem, driver: driverItem, info };
}

async function checkGpuRuntime(gpuInfo, engineRoot) {
    const nvidia = gpuInfo?.vendor === 'nvidia' && gpuInfo?.detected;
    if (!nvidia) {
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'ok',
            detail: 'CPU 模式，无需 CUDA 运行库',
            blocking: false,
        };
    }
    const cublas = findCublasInEngine(engineRoot);
    if (cublas) {
        // ASR/CT2 cuBLAS ≠ WhisperSeg onnxruntime-gpu; probe both when possible.
        let probe = null;
        try {
            const res = await runEnginePython(
                engineRoot,
                [
                    'import json',
                    'from transub_engine.runtime_gpu import probe_gpu_runtime',
                    'p = probe_gpu_runtime()',
                    'print(json.dumps({',
                    ' "status": p.get("status") or "",',
                    ' "asrGpuReady": bool(p.get("asrGpuReady")),',
                    ' "ortGpuCuda": bool(p.get("ortGpuCuda")),',
                    ' "ortGpuRequirement": p.get("ortGpuRequirement") or "",',
                    ' "hint": p.get("hint") or "",',
                    '}, ensure_ascii=False))',
                ].join('\n'),
                20000,
            );
            if (res.ok) {
                probe = JSON.parse(String(res.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
            }
        } catch {
            probe = null;
        }
        if (probe && probe.asrGpuReady && !probe.ortGpuCuda && probe.ortGpuRequirement) {
            return {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'warn',
                detail: probe.hint
                    || 'ASR/CTranslate2 GPU 已就绪；WhisperSeg（onnxruntime-gpu）未就绪，灵敏检出将回退 CPU',
                blocking: false,
                asrGpuReady: true,
                ortGpuCuda: false,
            };
        }
        if (probe && probe.status === 'partial') {
            return {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'warn',
                detail: probe.hint || 'GPU 组件部分就绪，请重启引擎或再次下载 GPU 支持',
                blocking: false,
                asrGpuReady: !!probe.asrGpuReady,
                ortGpuCuda: !!probe.ortGpuCuda,
            };
        }
        const bothOk = probe && probe.asrGpuReady && (probe.ortGpuCuda || !probe.ortGpuRequirement);
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'ok',
            detail: bothOk
                ? (probe.hint || 'ASR/CTranslate2 + WhisperSeg ONNX GPU 已就绪')
                : '已找到 cublas64_12.dll（CUDA 12）',
            blocking: false,
            asrGpuReady: probe ? !!probe.asrGpuReady : true,
            ortGpuCuda: probe ? !!probe.ortGpuCuda : undefined,
        };
    }
    const cudaMajor = Number(String(gpuInfo.cudaVersion || '').split('.')[0]);
    if (Number.isFinite(cudaMajor) && cudaMajor >= 12) {
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'warn',
            detail: '驱动支持 CUDA 12+；首次使用 Whisper GPU 时可在「运行环境」下载 GPU 支持组件',
            blocking: false,
        };
    }
    return {
        id: 'gpuRuntime',
        label: 'GPU 运行时',
        status: 'warn',
        detail: '未找到 cublas64_12.dll；可先用 CPU，或稍后在「运行环境」下载 GPU 支持',
        blocking: false,
    };
}

function checkEngine(configuredRoot = '') {
    const bundled = getBundledEnginePath();
    const root = String(configuredRoot || '').trim() || bundled;
    const present = isValidEngineRoot(root);
    if (present) {
        return {
            id: 'engine',
            label: 'Transub Engine',
            status: 'ok',
            detail: '内置引擎可用',
            path: root,
            blocking: false,
        };
    }
    return {
        id: 'engine',
        label: 'Transub Engine',
        status: 'fail',
        detail: `未找到内置引擎：${root}`,
        path: root,
        blocking: true,
    };
}

/**
 * llama-server 运行时：以二进制 --version 为准，落后于目录目标时提示可更新。
 * 检测到 NVIDIA CUDA 12/13 时：未安装或后端不匹配 → warn，供向导一键修复安装匹配包。
 */
function checkLlamaServerRuntime() {
    try {
        let hints = {};
        try {
            hints = require('./advanced-runtime-prefer').getHints();
        } catch (_) { /* ignore */ }
        const llamaServer = require('./advanced-llama-server');
        const catalog = require('../src/js/advanced-managed-llm-catalog-core');
        const st = llamaServer.getRuntimeStatus();
        const catalogTag = String(st.tag || '').trim();
        const installedTag = String(st.installedTag || '').trim();
        const packageId = String(st.installedPackageId || '').trim();
        const preferredId = String(st.preferredPackageId || st.package?.id || '').trim();
        const recommendedId = hints.preferCuda
            ? (catalog.getDefaultRuntimeId(process.platform, process.arch, hints) || preferredId)
            : preferredId;
        const recommendedPkg = recommendedId
            ? catalog.getRuntimePackage(process.platform, process.arch, recommendedId, hints)
            : null;
        const cudaLabel = hints.cudaVersion
            ? `CUDA ${hints.cudaVersion}`
            : (recommendedPkg?.label || recommendedId || '');

        if (!st.supported) {
            return {
                id: 'llamaServerRuntime',
                label: 'llama-server 运行时',
                status: 'ok',
                detail: `当前平台不支持内置运行时（${process.platform}-${process.arch}）`,
                blocking: false,
            };
        }

        if (!st.installed) {
            if (hints.preferCuda && recommendedId) {
                return {
                    id: 'llamaServerRuntime',
                    label: 'llama-server 运行时',
                    status: 'warn',
                    detail: `未安装 · 已检测 ${cudaLabel || 'NVIDIA CUDA'}，建议安装 ${recommendedPkg?.label || recommendedId}（llama.cpp ${catalogTag || '—'}）`,
                    blocking: false,
                    catalogTag,
                    preferredPackageId: recommendedId,
                    recommendInstall: true,
                    recommendRuntimeId: recommendedId,
                };
            }
            return {
                id: 'llamaServerRuntime',
                label: 'llama-server 运行时',
                status: 'ok',
                detail: `未安装（使用软件内模型 / 智能翻译时按需安装 · llama.cpp ${catalogTag || '—'}）`,
                blocking: false,
                catalogTag,
            };
        }

        // Installed but preference (after hardware sync) wants a different CUDA package.
        const backendMismatch = !!(
            recommendedId
            && packageId
            && recommendedId !== packageId
            && hints.preferCuda
        );
        if (st.mismatch || st.outdated || backendMismatch) {
            let detail = '';
            if (st.outdated) {
                detail = `已安装 ${installedTag || '旧版'}，可更新至 ${catalogTag}${packageId ? ` · ${packageId}` : ''}`;
            } else {
                detail = `${installedTag || catalogTag} 已就绪${packageId ? ` · ${packageId}` : ''}`;
            }
            if (st.mismatch || backendMismatch) {
                const preferLabel = recommendedPkg?.label || st.package?.label || recommendedId || '偏好后端';
                const installedLabel = st.meta?.label || packageId || '当前后端';
                detail = `${detail} · 偏好「${preferLabel}」，当前为「${installedLabel}」，请重新安装运行时`;
            }
            return {
                id: 'llamaServerRuntime',
                label: 'llama-server 运行时',
                status: 'warn',
                detail,
                blocking: false,
                installedTag,
                catalogTag,
                outdated: !!st.outdated,
                mismatch: !!(st.mismatch || backendMismatch),
                preferredPackageId: recommendedId || preferredId,
                recommendRuntimeId: recommendedId || preferredId,
                recommendInstall: true,
            };
        }
        return {
            id: 'llamaServerRuntime',
            label: 'llama-server 运行时',
            status: 'ok',
            detail: `${installedTag || catalogTag} 已就绪${packageId ? ` · ${packageId}` : ''}`,
            blocking: false,
            installedTag,
            catalogTag,
            preferredPackageId: preferredId,
        };
    } catch (err) {
        return {
            id: 'llamaServerRuntime',
            label: 'llama-server 运行时',
            status: 'warn',
            detail: err?.message || '检测失败',
            blocking: false,
        };
    }
}

/**
 * @param {{ ffmpegPath?: string, engineInstallPath?: string, engineAsrModel?: string }} [options]
 */
async function runEnvCheck(options = {}) {
    const items = [];
    items.push(checkInstallPath());
    items.push(await checkFfmpeg(options.ffmpegPath));
    items.push(checkVcRedist());

    const configuredRoot = resolveEngineInstallPath(options.engineInstallPath || '');
    const engineItem = checkEngine(configuredRoot);
    const engineRoot = engineItem.path || configuredRoot || getBundledEnginePath();
    const asrModel = String(options.engineAsrModel || '').trim();
    const { gpu, driver, info } = await checkGpu();
    // Keep llama backend preference aligned with detected CUDA 12 / 13 before status check.
    try {
        const prefer = require('./advanced-runtime-prefer');
        if (info) prefer.applyGpuInfo(info);
        require('./advanced-llama-server').syncRuntimePreferenceToHardware({
            force: !!options.syncLlamaBackend,
            gpuInfo: info || undefined,
        });
    } catch (_) { /* ignore */ }
    items.push(gpu);
    items.push(driver);
    items.push(await checkGpuRuntime(info, engineRoot));
    items.push(engineItem);
    items.push(checkLlamaServerRuntime());

    if (engineItem.status === 'ok') {
        items.push(checkAsrModel(engineRoot, asrModel));
        items.push(checkVadModel(engineRoot, asrModel));
        items.push(checkLidModel(engineRoot));
        items.push(await checkSensevoiceRuntime(engineRoot, asrModel));
        items.push(await checkWhisperRuntime(engineRoot, asrModel));
    } else {
        items.push({
            id: 'asrModel',
            label: 'ASR 模型',
            status: 'fail',
            detail: '引擎不可用，无法检测模型',
            blocking: true,
        });
        items.push({
            id: 'vadModel',
            label: 'VAD 模型（FSMN）',
            status: 'fail',
            detail: '引擎不可用，无法检测模型',
            blocking: true,
        });
        items.push({
            id: 'lidModel',
            label: '语种探测模型',
            status: 'warn',
            detail: '引擎不可用，跳过',
            blocking: false,
        });
        items.push({
            id: 'sensevoiceRuntime',
            label: 'SenseVoice 运行库',
            status: 'fail',
            detail: '引擎不可用，无法检测 torch / funasr',
            blocking: true,
        });
        items.push({
            id: 'whisperRuntime',
            label: 'Whisper 运行库',
            status: 'warn',
            detail: '引擎不可用，跳过',
            blocking: false,
        });
    }

    const blocking = items.filter((it) => it.blocking && it.status === 'fail');
    const result = {
        ok: blocking.length === 0,
        blockingCount: blocking.length,
        warnCount: items.filter((it) => it.status === 'warn').length,
        failCount: items.filter((it) => it.status === 'fail').length,
        items,
        urls: {
            vcRedist: VC_REDIST_URL,
            support: SUPPORT_URL,
        },
        installRoot: getInstallRoot(),
        enginePath: engineRoot,
        engineAsrModel: asrModel,
    };
    result.fix = planEnvFixes(result.items, { engineAsrModel: asrModel });
    return result;
}

/**
 * Build an actionable fix plan from check items.
 * @param {Array<{ id?: string, status?: string, detail?: string }>} items
 * @param {{ engineAsrModel?: string }} [opts]
 */
function planEnvFixes(items, opts = {}) {
    const list = Array.isArray(items) ? items : [];
    const byId = Object.fromEntries(list.map((it) => [String(it.id || ''), it]));
    const asrModel = String(opts.engineAsrModel || '').trim();
    const modelIds = new Set();
    const forceIds = new Set();
    const steps = [];
    let openVcRedist = false;
    let ensureGpu = false;
    let ensureLlamaRuntime = false;

    const statusOf = (id) => String(byId[id]?.status || '');
    const detailOf = (id) => String(byId[id]?.detail || '');

    if (statusOf('vcRedist') === 'fail') {
        openVcRedist = true;
        steps.push({ id: 'vcRedist', label: '打开 Visual C++ 运行库安装包下载页' });
    }

    if (statusOf('asrModel') === 'fail') {
        const id = asrModel || 'sensevoice-small';
        modelIds.add(id);
        // Weights download should also pull missing runtime extras in the same pass.
        forceIds.add(id);
        steps.push({ id: 'asrModel', label: `下载 ASR 模型 ${id}` });
    }

    if (statusOf('vadModel') === 'fail' || (statusOf('vadModel') === 'warn' && prefersSensevoice(asrModel))) {
        modelIds.add('fsmn-vad');
        steps.push({ id: 'vadModel', label: '下载 VAD 模型 fsmn-vad' });
    }

    if (statusOf('lidModel') === 'warn' || statusOf('lidModel') === 'fail') {
        modelIds.add('whisper-tiny');
        forceIds.add('whisper-tiny');
        steps.push({ id: 'lidModel', label: '下载语种探测模型 whisper-tiny' });
    }

    if (statusOf('sensevoiceRuntime') === 'fail' || statusOf('sensevoiceRuntime') === 'warn') {
        // Force so extras (torch/funasr) install even when weights already exist.
        modelIds.add('sensevoice-small');
        forceIds.add('sensevoice-small');
        steps.push({ id: 'sensevoiceRuntime', label: '补齐 SenseVoice 运行库（torch / funasr / numba / scipy）' });
    }

    if (statusOf('whisperRuntime') === 'fail' || statusOf('whisperRuntime') === 'warn') {
        const wr = byId.whisperRuntime || {};
        const wrDetail = detailOf('whisperRuntime');
        const policyBlocked = !!wr.policyBlocked
            || /应用程序控制策略|智能应用控制|smart.?app|4551/i.test(wrDetail);
        const dllBlocked = !!wr.dllBlocked
            || (!policyBlocked && /dll load failed|找不到指定的模块|winerror 126/i.test(wrDetail));
        if (policyBlocked) {
            // Still offer one-click retry (user may have just disabled SAC) + manual download.
            // Do not hide the fix button — otherwise a failing Whisper item looks "stuck".
            modelIds.add('whisper-tiny');
            forceIds.add('whisper-tiny');
            steps.push({
                id: 'whisperRuntime',
                label: '重试补齐 Whisper 运行库（若仍被策略拦截需先关闭智能应用控制）',
            });
        } else if (dllBlocked && statusOf('vcRedist') !== 'ok') {
            openVcRedist = true;
            if (!steps.some((s) => s.id === 'vcRedist')) {
                steps.push({ id: 'vcRedist', label: '打开 Visual C++ 运行库安装包下载页（Whisper DLL 依赖）' });
            }
            modelIds.add('whisper-tiny');
            forceIds.add('whisper-tiny');
            steps.push({ id: 'whisperRuntime', label: '补齐 Whisper 运行库（numpy / ctranslate2 / faster-whisper / av）' });
        } else {
            modelIds.add('whisper-tiny');
            forceIds.add('whisper-tiny');
            steps.push({ id: 'whisperRuntime', label: '补齐 Whisper 运行库（numpy / ctranslate2 / faster-whisper / av）' });
        }
    }

    if (statusOf('gpuRuntime') === 'warn'
        && /cublas|GPU 支持|CUDA|WhisperSeg|onnxruntime/i.test(detailOf('gpuRuntime'))) {
        ensureGpu = true;
        const ortOnly = /WhisperSeg|onnxruntime/i.test(detailOf('gpuRuntime'))
            && !/cublas64_12|缺少 cublas/i.test(detailOf('gpuRuntime'));
        steps.push({
            id: 'gpuRuntime',
            label: ortOnly
                ? '下载 GPU 支持（WhisperSeg / onnxruntime-gpu）'
                : '下载 GPU 支持（cuBLAS）',
        });
    }

    const llamaItem = byId.llamaServerRuntime || {};
    const recommendRuntimeId = String(
        llamaItem.recommendRuntimeId || llamaItem.preferredPackageId || '',
    ).trim();
    if (statusOf('llamaServerRuntime') === 'warn'
        && (llamaItem.outdated || llamaItem.mismatch || llamaItem.recommendInstall
            || /可更新至|后端不一致|请重新安装|建议安装/i.test(detailOf('llamaServerRuntime')))) {
        ensureLlamaRuntime = true;
        let stepLabel = '更新 llama-server 运行时';
        if (llamaItem.recommendInstall && !llamaItem.installedTag && !llamaItem.outdated) {
            stepLabel = recommendRuntimeId
                ? `安装 llama-server 运行时（${recommendRuntimeId}）`
                : '安装 llama-server 运行时（匹配本机 CUDA）';
        } else if (llamaItem.mismatch) {
            stepLabel = recommendRuntimeId
                ? `重新安装 llama-server 运行时（切换至 ${recommendRuntimeId}）`
                : '重新安装 llama-server 运行时（后端不一致）';
        } else if (llamaItem.outdated) {
            stepLabel = `更新 llama-server 运行时至 ${llamaItem.catalogTag || '最新'}`;
        }
        steps.push({
            id: 'llamaServerRuntime',
            label: stepLabel,
            runtimeId: recommendRuntimeId || undefined,
        });
    }

    // installPath / ffmpeg / engine / gpu hardware: not auto-fixable here
    const models = [...modelIds];
    const force = forceIds.size > 0;
    const fixable = openVcRedist || ensureGpu || ensureLlamaRuntime || models.length > 0;
    const manualHints = list
        .filter((it) => {
            if (it.status !== 'fail' && it.status !== 'warn') return false;
            if (['installPath', 'ffmpeg', 'engine', 'gpu'].includes(it.id)) return true;
            if (it.id === 'whisperRuntime' && (it.policyBlocked
                || /应用程序控制策略|智能应用控制|smart.?app|4551/i.test(String(it.detail || '')))) {
                return true;
            }
            return false;
        })
        .map((it) => ({ id: it.id, label: it.label, detail: it.detail }));
    return {
        fixable,
        openVcRedist,
        ensureGpu,
        ensureLlamaRuntime,
        llamaRuntimeId: recommendRuntimeId || '',
        modelIds: models,
        force,
        forceIds: [...forceIds],
        steps,
        manualHints,
    };
}

module.exports = {
    runEnvCheck,
    planEnvFixes,
    checkInstallPath,
    checkVcRedist,
    checkEngine,
    checkAsrModel,
    checkVadModel,
    checkLidModel,
    checkLlamaServerRuntime,
    checkModelInstalled,
    listInstalledAsrIds,
    prefersSensevoice,
    prefersWhisper,
    findCublasInEngine,
    hasNonAscii,
    resolveEnginePython,
    ASR_MODEL_MARKERS,
    VC_REDIST_URL,
    SUPPORT_URL,
};
