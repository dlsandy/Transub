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
    const s = String(text || '');
    for (let i = 0; i < s.length; i += 1) {
        if (s.charCodeAt(i) > 127) return true;
    }
    return false;
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

function prefersQwenAsr(engineAsrModel) {
    const id = String(engineAsrModel || '').trim().toLowerCase();
    if (!id) return false;
    return id.includes('qwen3-asr') || id.includes('qwen3-forced-aligner');
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
            ? `未找到 ${preferred}。请运行「设置向导」或在「模型」页下载模型`
            : '未找到可用 ASR 模型。请运行「设置向导」或在「模型」页下载 SenseVoice / Whisper',
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
        detail: 'SenseVoice 默认 VAD 未找到。请重新安装或在「模型」页下载 fsmn-vad',
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

/** Strip pydub/FunASR ffmpeg noise so probe stderr is not shown as a runtime failure. */
function sanitizeEngineProbeStderr(stderr) {
    return String(stderr || '')
        .split(/\r?\n/)
        .filter((line) => {
            const s = String(line || '').trim();
            if (!s) return false;
            return !/couldn't find ffmpeg|couldn't find avconv|defaulting to ffmpeg|ffmpeg is not installed|RuntimeWarning:\s*Couldn't find ffmpeg|from pydub|Notice:\s*ffmpeg/i.test(s);
        })
        .join('\n')
        .trim();
}

/** Put bundled ffmpeg + nvidia CUDA wheel bins on PATH for engine Python probes. */
function buildEngineProbeEnv(engineRoot) {
    const env = {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONWARNINGS: 'ignore::RuntimeWarning',
    };
    const root = path.resolve(String(engineRoot || '').trim() || '.');
    try {
        const sep = path.delimiter;
        const prepend = [];

        // CUDA 12 wheels (cuBLAS etc.) must be visible before CTranslate2 loads.
        const sitePkgs = [
            path.join(root, 'runtime', 'Lib', 'site-packages'),
            path.join(root, 'runtime', 'lib', 'site-packages'),
            path.join(root, '.venv', 'Lib', 'site-packages'),
            path.join(root, 'venv', 'Lib', 'site-packages'),
        ];
        for (const sp of sitePkgs) {
            if (!fs.existsSync(sp)) continue;
            // torch\\lib must precede nvidia/* so probes match serve preload order
            // (otherwise WinError 1114 / partial _C map can poison the process).
            const torchLib = path.join(sp, 'torch', 'lib');
            if (fs.existsSync(torchLib)) prepend.push(torchLib);
            const nvidiaRoot = path.join(sp, 'nvidia');
            if (fs.existsSync(nvidiaRoot)) {
                let pkgs = [];
                try {
                    pkgs = fs.readdirSync(nvidiaRoot, { withFileTypes: true })
                        .filter((d) => d.isDirectory())
                        .map((d) => d.name);
                } catch { /* ignore */ }
                for (const name of pkgs) {
                    for (const sub of ['bin', path.join('lib', 'x64'), 'lib']) {
                        const dir = path.join(nvidiaRoot, name, sub);
                        if (fs.existsSync(dir)) prepend.push(dir);
                    }
                }
            }
        }

        const ffmpegBridge = require('./ffmpeg-bridge');
        let exe = '';
        try {
            const resolved = ffmpegBridge.resolveFfmpegForExecution?.('');
            exe = resolved?.ok ? String(resolved.path || '').trim() : '';
        } catch { /* ignore */ }
        if (!exe || exe === 'ffmpeg') {
            exe = String(ffmpegBridge.findBundledFfmpegPath?.() || '').trim();
        }
        if (!exe || exe === 'ffmpeg') {
            for (const candidate of [
                path.join(root, 'ffmpeg', 'ffmpeg.exe'),
                path.join(root, 'bin', 'ffmpeg.exe'),
                path.join(root, 'runtime', 'ffmpeg.exe'),
            ]) {
                if (fs.existsSync(candidate)) {
                    exe = candidate;
                    break;
                }
            }
        }
        if (exe && exe !== 'ffmpeg' && fs.existsSync(exe)) {
            prepend.push(path.dirname(exe));
            env.FFMPEG_BINARY = exe;
            env.FFMPEG_PATH = exe;
        }

        if (prepend.length) {
            const current = String(env.PATH || process.env.PATH || '');
            const lower = new Set(
                current.split(sep).filter(Boolean).map((p) => p.toLowerCase()),
            );
            const unique = [];
            for (const dir of prepend) {
                const key = String(dir).toLowerCase();
                if (lower.has(key)) continue;
                lower.add(key);
                unique.push(dir);
            }
            if (unique.length) {
                env.PATH = `${unique.join(sep)}${sep}${current}`;
            }
        }
        env.TRANSUB_ENGINE_HOME = root;
    } catch { /* ignore */ }
    try {
        const cudaScan = require('./cuda-runtime-scan');
        const { getWritableRoot, getInstallRoot } = require('./app-paths');
        let writable = '';
        let install = '';
        try { writable = getWritableRoot(); } catch { /* ignore */ }
        try { install = getInstallRoot(); } catch { /* ignore */ }
        const joined = cudaScan.formatCudaExtraRootsEnv({
            engineRoots: [root],
            writableRoot: writable,
            startDirs: [root, writable, install].filter(Boolean),
        });
        if (joined) env.TRANSUB_CUDA_EXTRA_ROOTS = joined;
    } catch { /* optional */ }
    return env;
}

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
            env: buildEngineProbeEnv(engineRoot),
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
    // Metadata-only: do not import torch/funasr. Loading CUDA DLLs during env-check
    // (or model-picker probes) can freeze Windows when Smart App Control / WDAC
    // scans unsigned PyTorch binaries, or when CUDA driver init hangs.
    const probe = await runEnginePython(
        engineRoot,
        [
            'import json,sys',
            'from importlib.metadata import PackageNotFoundError, version',
            'out={"torch":"","funasr":"","numba":"","scipy":"","librosa":"","missing":[],"error":""}',
            'for mod,key in (("torch","torch"),("funasr","funasr"),("numba","numba"),("scipy","scipy"),("librosa","librosa")):',
            ' try:',
            '  out[key]=str(version(mod) or "ok")',
            ' except PackageNotFoundError as e:',
            '  out["missing"].append(key)',
            '  if not out["error"]: out["error"]=str(e)',
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
    // Trust structured JSON when package metadata was readable.
    if (data?.torch && missingList.length === 0) {
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
    const stderrClean = sanitizeEngineProbeStderr(probe.stderr);
    const err = String(data?.error || stderrClean || '').trim();
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
        detail = `模型权重已安装，但缺少运行库 ${missingLabel}（与「已安装」不是同一项）。在「模型」页对 SenseVoice Small 点重新下载可补齐`;
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

async function checkQwen3Runtime(engineRoot, engineAsrModel = '') {
    const needQwen = prefersQwenAsr(engineAsrModel);
    const probe = await runEnginePython(
        engineRoot,
        [
            'import json,sys',
            'from transub_engine.runtime_extras import probe_asr_qwen3_runtime',
            'out = probe_asr_qwen3_runtime()',
            'print(json.dumps(out, ensure_ascii=False))',
            'sys.exit(0 if out.get("ready") else 3)',
        ].join('\n'),
        45000,
    );
    let data = null;
    try {
        data = JSON.parse(String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
    } catch {
        data = null;
    }
    const versions = data?.versions && typeof data.versions === 'object' ? data.versions : {};
    const errors = Array.isArray(data?.errors) ? data.errors.map(String) : [];
    const missingList = Array.isArray(data?.missing) ? data.missing.map(String) : [];
    const hasCuda = !!data?.hasCudaGpu;
    const hasRocm = !!data?.hasRocm;
    const torchCudaLibs = !!data?.torchCuda;
    const torchRocmLibs = !!data?.torchRocm;
    const needCudaTorch = hasCuda && versions.torch && !torchCudaLibs;
    // AMD：只要没有 ROCm torch，就算完全没装 torch 也要走 ROCm 修复（不要卡在 versions.torch）。
    const needRocmTorch = hasRocm && !torchRocmLibs;
    const errJoined = errors.join('；');
    const tokenizersMismatch = missingList.includes('tokenizers')
        && (/tokenizers.*不兼容|tokenizers.*required|tokenizers==0\.22\.2/i.test(errJoined)
            || (versions.tokenizers && String(versions.tokenizers) !== '0.22.2'));

    if (data?.ready) {
        const bits = [
            `torch ${versions.torch || '?'}`,
            `transformers ${versions.transformers || '?'}`,
        ];
        if (versions.tokenizers) bits.push(`tokenizers ${versions.tokenizers}`);
        if (versions.numba) bits.push(`numba ${versions.numba}`);
        const accel = hasRocm && torchRocmLibs
            ? ' · ROCm PyTorch'
            : (hasCuda && torchCudaLibs ? ' · CUDA PyTorch' : '');
        return {
            id: 'qwenRuntime',
            label: 'Qwen3-ASR 运行库',
            status: 'ok',
            detail: bits.join(' · ') + accel + ' · -hf',
            blocking: false,
        };
    }

    const stderrClean = sanitizeEngineProbeStderr(probe.stderr);
    const err = String(errors[0] || data?.hint || stderrClean || '').trim();
    const missingLabel = missingList.length ? missingList.join(', ') : '';

    let detail;
    const numpyMetaBroken = missingList.includes('numpy')
        || /found=none|numpy.*元数据|numpy.*numba|Unable to compare versions for numpy/i.test(errJoined || err);
    if (numpyMetaBroken) {
        detail = errors.find((e) => /numpy/i.test(e))
            || 'numpy 元数据损坏或版本超出 Numba 上限（需要 <2.5）；点「一键修复」会先停引擎再重装兼容 numpy / tokenizers';
    } else if (tokenizersMismatch) {
        detail = errors.find((e) => /tokenizers/i.test(e))
            || `tokenizers ${versions.tokenizers || '?'} 与 transformers 不兼容（需要 tokenizers==0.22.2）；点「一键修复」会自动降级`;
    } else if (needRocmTorch) {
        detail = '引擎运行时缺少 ROCm 版 PyTorch。系统 pip 无效，请点「自动修复」装进引擎。';
    } else if (needCudaTorch) {
        detail = '已装 CPU 版 PyTorch，但检测到 NVIDIA GPU。下载 Qwen 模型或一键修复时会自动改装 CUDA 版（约 2.5GB，10–30 分钟）';
    } else if (/winerror 4551|智能应用控制|应用程序控制策略|smart.?app/i.test(err)) {
        detail = 'Windows 智能应用控制/应用程序控制策略拦截了 torch DLL，请关闭该策略或将引擎目录加入排除项';
    } else if (/winerror 126|找不到指定的模块|dll load failed/i.test(err)) {
        detail = '无法加载 torch DLL。请先安装 Visual C++ 运行库；若仍失败请关闭「智能应用控制」后重试';
    } else if (missingLabel) {
        detail = `缺少运行库 ${missingLabel}（transformers≥5.13 / torch / numba 等）；下载 Qwen 模型时会自动安装`;
        if (hasRocm) {
            detail += '（AMD 需额外装 ROCm PyTorch）';
        } else if (hasCuda) {
            detail += '（有 GPU 时需额外改装 CUDA 版 PyTorch，约 2.5GB）';
        }
    } else {
        detail = err || '无法加载 Qwen3-ASR 运行库（transformers≥5.13 / torch）';
    }

    if (!needQwen) {
        return {
            id: 'qwenRuntime',
            label: 'Qwen3-ASR 运行库',
            status: 'warn',
            detail: `${detail}（当前 ASR 非 Qwen，不影响现有转写）`,
            blocking: false,
            tokenizersMismatch,
            numpyBroken: numpyMetaBroken,
        };
    }
    const softTorch = (needCudaTorch || needRocmTorch) && !tokenizersMismatch && !numpyMetaBroken;
    return {
        id: 'qwenRuntime',
        label: 'Qwen3-ASR 运行库',
        status: softTorch ? 'warn' : 'fail',
        detail,
        blocking: !softTorch || tokenizersMismatch || numpyMetaBroken,
        needsTorchCuda: needCudaTorch,
        needsTorchRocm: needRocmTorch,
        tokenizersMismatch,
        numpyBroken: numpyMetaBroken,
    };
}

/**
 * Serve-order Torch probe (preload torch\\lib → inject nvidia → optional CT2).
 * Catches WinError 1114 / docstring poison that package-metadata / plain import miss.
 */
async function checkTorchEngineStartup(engineRoot, engineAsrModel = '') {
    const needTorch = prefersQwenAsr(engineAsrModel) || prefersSensevoice(engineAsrModel);
    if (!needTorch) {
        return {
            id: 'torchEngineStartup',
            label: 'PyTorch 引擎启动探测',
            status: 'ok',
            detail: '当前 ASR 不依赖进程内 CUDA PyTorch，已跳过',
            blocking: false,
            skipped: true,
        };
    }
    const probe = await runEnginePython(
        engineRoot,
        [
            'import json,sys',
            'from transub_engine.runtime_gpu import probe_torch_engine_startup',
            'out = probe_torch_engine_startup()',
            'print(json.dumps(out, ensure_ascii=False))',
            'sys.exit(0 if out.get("ready") else 3)',
        ].join('\n'),
        90000,
    );
    let data = null;
    try {
        data = JSON.parse(String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
    } catch {
        data = null;
    }
    const code = String(data?.code || '').trim();
    const stderrClean = sanitizeEngineProbeStderr(probe.stderr);
    const msg = String(data?.message || stderrClean || '').trim();
    const low = msg.toLowerCase();

    if (data?.ready) {
        return {
            id: 'torchEngineStartup',
            label: 'PyTorch 引擎启动探测',
            status: 'ok',
            detail: msg || `模拟引擎启动成功（torch ${data.version || '?'}）`,
            blocking: false,
            code: '',
            cudaAvailable: !!data.cudaAvailable,
        };
    }

    let detail;
    if (code === 'NEED_TORCH_ROCM' || /ROCm|引擎运行时.*PyTorch/i.test(msg)) {
        detail = msg || '引擎运行时缺少 ROCm 版 PyTorch；请点「自动修复」装进引擎（系统 pip 无效）';
    } else if (code === 'NEED_TORCH_CUDA' || /CPU 版 PyTorch|补齐 CUDA PyTorch/i.test(msg)) {
        detail = msg || '已装 CPU 版 PyTorch，需要改装 CUDA 版（约 2.5GB）';
    } else if (code === 'TORCH_MISSING' || /未安装 PyTorch|no module named ['"]?torch/i.test(msg)) {
        detail = msg || (
            /ROCm|AMD|Radeon/i.test(msg)
                ? '未安装 ROCm 版 PyTorch；请点「自动修复」装进引擎运行时'
                : '未安装 PyTorch；请下载 Qwen/SenseVoice 模型或补齐 CUDA PyTorch'
        );
    } else if (
        code === 'TORCH_REIMPORT_POISON'
        || /already has a docstring|Torch 已在本引擎进程中损坏/i.test(msg)
    ) {
        detail = (
            msg
            || 'Torch 在「先 torch\\lib 再 nvidia」加载顺序下损坏（与真实引擎启动一致）。'
        ) + (
            /ROCm/i.test(msg)
                ? ' 请点「自动修复」补齐 ROCm PyTorch 后完全退出并重开 Transub。'
                : ' 请点「补齐 CUDA PyTorch」后完全退出并重开 Transub。'
        );
    } else if (
        code === 'TORCH_CUDA_LOAD'
        || /winerror 1114|winerror 999|cublas/i.test(low)
    ) {
        detail = (
            msg
            || 'Torch CUDA 库加载失败（常见 WinError 1114 · cublas）。'
        ) + ' 请点「补齐 CUDA PyTorch」；若仍失败请先装 Visual C++ 运行库并关闭智能应用控制。';
    } else if (/winerror 4551|智能应用控制|应用程序控制策略|smart.?app/i.test(msg)) {
        detail = 'Windows 智能应用控制/应用程序控制策略拦截了 torch DLL，请关闭该策略或将引擎目录加入排除项';
    } else if (/winerror 126|找不到指定的模块|dll load failed/i.test(msg)) {
        detail = '无法加载 torch DLL。请先安装 Visual C++ 运行库；若仍失败请关闭「智能应用控制」后重试';
    } else {
        detail = msg || 'PyTorch 引擎启动探测失败（与设置向导包检测通过不矛盾：此处模拟真实 serve 加载顺序）';
    }

    const needsTorchRocm = code === 'NEED_TORCH_ROCM'
        || !!data?.hasRocm
        || /ROCm|NEED_TORCH_ROCM/i.test(`${code} ${detail}`);
    const needsTorchCuda = !needsTorchRocm && (
        code === 'NEED_TORCH_CUDA'
        || code === 'TORCH_CUDA_LOAD'
        || code === 'TORCH_REIMPORT_POISON'
        || code === 'TORCH_MISSING'
    );

    return {
        id: 'torchEngineStartup',
        label: 'PyTorch 引擎启动探测',
        status: 'fail',
        detail,
        blocking: true,
        code,
        needsTorchCuda,
        needsTorchRocm,
        hasRocm: !!data?.hasRocm,
    };
}

async function checkWhisperRuntime(engineRoot, engineAsrModel = '') {
    const needWhisper = prefersWhisper(engineAsrModel) || !prefersSensevoice(engineAsrModel);
    // Metadata-only: do not import av/ctranslate2/onnxruntime. Loading those under
    // Smart App Control freezes the probe (and can wedge the engine thread pool).
    const probeCode = [
        'import json,sys',
        'from importlib.metadata import PackageNotFoundError, version',
        'out={"numpy":"","fw":"","av":"","ct2":"","ort":"","missing":[],"errors":[],"policy":False,"dll":False}',
        'def _ver(name, key, alt=None):',
        ' try:',
        '  out[key]=str(version(name) or "ok")',
        ' except PackageNotFoundError as e:',
        '  if alt:',
        '   try:',
        '    out[key]=str(version(alt) or "ok"); return',
        '   except PackageNotFoundError:',
        '    pass',
        '   except Exception as e2:',
        '    out["missing"].append(key); out["errors"].append(str(e2)); return',
        '  out["missing"].append(key); out["errors"].append(str(e))',
        ' except Exception as e:',
        '  out["missing"].append(key); out["errors"].append(str(e))',
        '_ver("numpy","numpy")',
        '_ver("av","av")',
        '_ver("ctranslate2","ct2")',
        '_ver("onnxruntime","ort","onnxruntime-gpu")',
        '_ver("faster-whisper","fw")',
        'print(json.dumps(out,ensure_ascii=False))',
        'sys.exit(0 if not out["missing"] else 1)',
    ].join('\n');
    // Fresh wheel install + Windows AV can make first import exceed 15s; retry once.
    let probe = await runEnginePython(engineRoot, probeCode, 20000);
    const probeTimedOut = (p) => {
        const err = String(p?.stderr || '').trim().toLowerCase();
        return !p?.ok && (err === 'timeout' || /\btimeout\b/.test(err))
            && !String(p?.stdout || '').trim();
    };
    if (probeTimedOut(probe)) {
        probe = await runEnginePython(engineRoot, probeCode, 20000);
    }
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
    if (probeTimedOut(probe) && !data) {
        return {
            id: 'whisperRuntime',
            label: 'Whisper 运行库',
            status: 'warn',
            detail: 'Whisper 运行库探测超时（首次导入较慢）。库可能已装好，请再点一次重新检测',
            blocking: false,
            probeTimedOut: true,
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
    const amd = info?.vendor === 'amd' && info?.detected;
    const gpuItem = nvidia
        ? {
            id: 'gpu',
            label: 'GPU',
            status: 'ok',
            detail: info.gpuName || 'NVIDIA GPU',
            blocking: false,
            vendor: 'nvidia',
        }
        : amd
            ? {
                id: 'gpu',
                label: 'GPU',
                status: 'ok',
                detail: `${info.gpuName || 'AMD GPU'}（Qwen3 / SenseVoice 用引擎内 ROCm PyTorch；系统 pip 无效）`,
                blocking: false,
                vendor: 'amd',
            }
            : {
                id: 'gpu',
                label: 'GPU',
                status: 'warn',
                detail: info?.gpuName
                    ? `检测到 ${info.gpuName}（无 NVIDIA CUDA，Engine 将使用 CPU）`
                    : '未检测到独立 NVIDIA 显卡，Engine 将使用 CPU',
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
        : amd
            ? {
                id: 'gpuDriver',
                label: 'GPU 驱动版本',
                status: 'ok',
                detail: 'AMD · llama-server 推荐 ROCm（通常需本机 HIP）或 Vulkan',
                blocking: false,
                vendor: 'amd',
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

function gpuRuntimeTorchFields(probe, gpuInfo) {
    const fromProbe = probe && typeof probe === 'object' ? probe : {};
    const cudaVer = String(
        fromProbe.driverCudaVersion || gpuInfo?.cudaVersion || '',
    ).trim();
    let driverCudaMajor = Number(fromProbe.driverCudaMajor);
    if (!Number.isFinite(driverCudaMajor) || driverCudaMajor <= 0) {
        const m = cudaVer.match(/^(\d+)/);
        driverCudaMajor = m ? Number(m[1]) : 0;
    }
    const computeCap = Number(fromProbe.computeCap);
    return {
        gpuName: String(fromProbe.gpuName || gpuInfo?.gpuName || '').trim(),
        driverCudaVersion: cudaVer,
        driverCudaMajor: driverCudaMajor > 0 ? driverCudaMajor : undefined,
        computeCap: Number.isFinite(computeCap) && computeCap > 0 ? computeCap : undefined,
        needsTorchCuda128: !!fromProbe.needsTorchCuda128,
        torchCudaVariant: String(fromProbe.torchCudaVariant || '').trim(),
        torchCudaMismatch: !!fromProbe.torchCudaMismatch,
        installedTorchCudaTag: String(fromProbe.installedTorchCudaTag || '').trim(),
    };
}

function gpuRuntimeShowsReady(probe, bothOk) {
    if (!probe) return false;
    if (probe.torchCudaMismatch) return false;
    return bothOk || probe.status === 'ready';
}

async function checkGpuRuntime(gpuInfo, engineRoot) {
    const nvidia = gpuInfo?.vendor === 'nvidia' && gpuInfo?.detected;
    const amd = gpuInfo?.vendor === 'amd' && gpuInfo?.detected;
    if (!nvidia) {
        if (amd) {
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
                        ' "hint": p.get("hint") or "",',
                        ' "hasRocm": bool(p.get("hasRocm")),',
                        ' "torchRocm": bool(p.get("torchRocm")),',
                        ' "rocmGfx": p.get("rocmGfx") or "",',
                        ' "gpuName": p.get("gpuName") or "",',
                        ' "asrGpuReady": bool(p.get("asrGpuReady")),',
                        '}, ensure_ascii=False))',
                    ].join('\n'),
                    25000,
                );
                if (res.ok) {
                    probe = JSON.parse(String(res.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
                }
            } catch {
                probe = null;
            }
            const torchRocm = !!probe?.torchRocm;
            const name = String(probe?.gpuName || gpuInfo?.gpuName || 'AMD GPU').trim();
            if (torchRocm) {
                return {
                    id: 'gpuRuntime',
                    label: 'GPU 运行时',
                    status: 'ok',
                    detail: `${name} · ROCm PyTorch 已就绪（Qwen3 / SenseVoice）。Whisper 仍走 CPU。`,
                    blocking: false,
                    vendor: 'amd',
                    hasRocm: true,
                    torchRocm: true,
                    asrGpuReady: true,
                    engineDevice: 'cuda',
                };
            }
            return {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'warn',
                detail: (
                    `${name}：引擎运行时缺少 ROCm PyTorch。`
                    + '系统 pip 无效，请点「自动修复」装进引擎。Whisper 仍走 CPU。'
                ),
                blocking: false,
                vendor: 'amd',
                hasRocm: true,
                torchRocm: false,
                asrGpuReady: false,
                engineDevice: 'cpu',
            };
        }
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'ok',
            detail: 'CPU 模式，无需 CUDA 运行库',
            blocking: false,
        };
    }

    // Always probe via engine Python when possible — finds Toolkit / PATH CUDA,
    // not only wheels already inside the engine tree.
    let probe = null;
    try {
        const res = await runEnginePython(
            engineRoot,
            [
                'import json',
                'from transub_engine.runtime_gpu import probe_gpu_runtime, system_cuda_package_coverage, CUDA12_PIP_PACKAGES',
                'p = probe_gpu_runtime()',
                'cov = system_cuda_package_coverage(list(CUDA12_PIP_PACKAGES), major=12)',
                'print(json.dumps({',
                ' "status": p.get("status") or "",',
                ' "asrGpuReady": bool(p.get("asrGpuReady")),',
                ' "ortGpuCuda": bool(p.get("ortGpuCuda")),',
                ' "ortGpuRequirement": p.get("ortGpuRequirement") or "",',
                ' "ctranslate2Cuda": bool(p.get("ctranslate2Cuda")),',
                ' "ctranslate2CudaReason": p.get("ctranslate2CudaReason") or "",',
                ' "cublas12": bool(p.get("cublas12")),',
                ' "cublasPath": p.get("cublasPath") or "",',
                ' "hint": p.get("hint") or "",',
                ' "gpuName": p.get("gpuName") or "",',
                ' "driverCudaVersion": p.get("driverCudaVersion") or "",',
                ' "driverCudaMajor": int(p.get("driverCudaMajor") or 0),',
                ' "computeCap": float(p.get("computeCap") or 0),',
                ' "needsTorchCuda128": bool(p.get("needsTorchCuda128")),',
                ' "torchCudaVariant": p.get("torchCudaVariant") or "",',
                ' "torchCudaMismatch": bool(p.get("torchCudaMismatch")),',
                ' "installedTorchCudaTag": p.get("installedTorchCudaTag") or "",',
                ' "systemReusable": list(cov.get("reusable") or []),',
                '}, ensure_ascii=False))',
            ].join('\n'),
            25000,
        );
        if (res.ok) {
            probe = JSON.parse(String(res.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}');
        }
    } catch {
        probe = null;
    }

    const cublasInEngine = findCublasInEngine(engineRoot);
    const systemReusable = Array.isArray(probe?.systemReusable) ? probe.systemReusable : [];
    const torchFields = gpuRuntimeTorchFields(probe, gpuInfo);

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
            ortGpuRequirement: probe.ortGpuRequirement || '',
            ctranslate2Cuda: !!probe.ctranslate2Cuda,
            ctranslate2CudaReason: probe.ctranslate2CudaReason || '',
            systemReusable,
            ...torchFields,
        };
    }
    if (probe && probe.status === 'partial') {
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'warn',
            detail: probe.hint || 'GPU 组件部分就绪；可再次下载 GPU 支持后重新检测',
            blocking: false,
            asrGpuReady: !!probe.asrGpuReady,
            ortGpuCuda: !!probe.ortGpuCuda,
            ortGpuRequirement: probe.ortGpuRequirement || '',
            ctranslate2Cuda: !!probe.ctranslate2Cuda,
            ctranslate2CudaReason: probe.ctranslate2CudaReason || '',
            systemReusable,
            ...torchFields,
        };
    }
    const bothOk = probe && probe.asrGpuReady && (probe.ortGpuCuda || !probe.ortGpuRequirement);
    if (probe && (probe.status === 'ready' || probe.cublas12 || cublasInEngine)) {
        const reuseHint = (!cublasInEngine && systemReusable.length)
            ? `；本机可复用 ${systemReusable.length} 个 CUDA 组件`
            : '';
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: gpuRuntimeShowsReady(probe, bothOk) ? 'ok' : 'warn',
            detail: bothOk
                ? (probe.hint || 'ASR/CTranslate2 + WhisperSeg ONNX GPU 已就绪')
                : ((probe.hint || '已找到 cublas64_12.dll（CUDA 12）') + reuseHint),
            blocking: false,
            asrGpuReady: probe ? !!probe.asrGpuReady : true,
            ortGpuCuda: probe ? !!probe.ortGpuCuda : undefined,
            ortGpuRequirement: probe ? (probe.ortGpuRequirement || '') : '',
            ctranslate2Cuda: probe ? !!probe.ctranslate2Cuda : undefined,
            ctranslate2CudaReason: probe ? (probe.ctranslate2CudaReason || '') : '',
            systemReusable,
            ...torchFields,
        };
    }

    const cudaMajor = Number(String(gpuInfo.cudaVersion || '').split('.')[0]);
    if (systemReusable.length) {
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'warn',
            detail: `本机已有可复用 CUDA（${systemReusable.slice(0, 3).join('、')}${systemReusable.length > 3 ? '…' : ''}）；点「下载 GPU 支持」或「扫描复用本机 CUDA」即可跳过大包下载`,
            blocking: false,
            systemReusable,
            recommendReuse: true,
        };
    }
    if (Number.isFinite(cudaMajor) && cudaMajor >= 12) {
        return {
            id: 'gpuRuntime',
            label: 'GPU 运行时',
            status: 'warn',
            detail: '驱动支持 CUDA 12+；首次使用 Whisper GPU 时可在「运行环境」下载 GPU 支持组件（会自动尝试复用本机 Toolkit）',
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
 * 检测到 NVIDIA CUDA 12/13 或 AMD ROCm 时：未安装或后端不匹配 → warn，供向导一键修复安装匹配包。
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
        const preferAccel = !!(hints.preferCuda || hints.preferRocm);
        const recommendedId = preferAccel
            ? (catalog.getDefaultRuntimeId(process.platform, process.arch, hints) || preferredId)
            : preferredId;
        const recommendedPkg = recommendedId
            ? catalog.getRuntimePackage(process.platform, process.arch, recommendedId, hints)
            : null;
        const accelLabel = hints.preferCuda
            ? (hints.cudaVersion
                ? `CUDA ${hints.cudaVersion}`
                : (recommendedPkg?.label || recommendedId || 'NVIDIA CUDA'))
            : (hints.preferRocm
                ? (hints.gpuName
                    ? `AMD ${hints.gpuName}`
                    : (recommendedPkg?.label || recommendedId || 'AMD ROCm'))
                : (recommendedPkg?.label || recommendedId || ''));

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
            const defaultId = recommendedId
                || catalog.getDefaultRuntimeId(process.platform, process.arch, hints)
                || preferredId;
            const defaultPkg = defaultId
                ? catalog.getRuntimePackage(process.platform, process.arch, defaultId, hints)
                : null;
            const reuseHint = hints.preferCuda && st.systemCompanion?.found
                ? `；可复用本机「${st.systemCompanion.label || 'CUDA 运行库'}」，安装时跳过 cudart 下载`
                : '';
            const pkgLabel = defaultPkg?.label || defaultId || '匹配本机后端的运行时';
            return {
                id: 'llamaServerRuntime',
                label: 'llama-server 运行时',
                status: 'warn',
                detail: preferAccel && defaultId
                    ? `未安装 · 已检测 ${accelLabel}，建议安装 ${pkgLabel}（llama.cpp ${catalogTag || '—'}）${reuseHint}`
                    : `未安装 · 建议安装 ${pkgLabel}（llama.cpp ${catalogTag || '—'}）`,
                blocking: false,
                catalogTag,
                preferredPackageId: defaultId || '',
                recommendInstall: true,
                recommendRuntimeId: defaultId || '',
                systemCompanion: st.systemCompanion || null,
            };
        }

        // Installed but preference (after hardware sync) wants a different accel package.
        const backendMismatch = !!(
            recommendedId
            && packageId
            && recommendedId !== packageId
            && preferAccel
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

/** Wizard step 2: path / FFmpeg / VC++ / GPU / Engine（含 Torch serve 启动探测）. */
const ENV_CHECK_BASE_IDS = Object.freeze([
    'installPath',
    'ffmpeg',
    'vcRedist',
    'gpu',
    'gpuDriver',
    'gpuRuntime',
    'engine',
    'llamaServerRuntime',
    // Serve-order Torch load (Qwen/SenseVoice); skipped when ASR does not need it.
    'torchEngineStartup',
]);
/** Wizard step after samples: ASR / VAD / LID / SenseVoice·Whisper 运行库. */
const ENV_CHECK_RUNTIME_IDS = Object.freeze([
    'asrModel',
    'vadModel',
    'lidModel',
    'sensevoiceRuntime',
    'qwenRuntime',
    'torchEngineStartup',
    'whisperRuntime',
]);

function normalizeEnvCheckScope(scope) {
    const s = String(scope || 'full').trim().toLowerCase();
    if (s === 'base' || s === 'runtime') return s;
    return 'full';
}

/**
 * @param {{
 *   ffmpegPath?: string,
 *   engineInstallPath?: string,
 *   engineAsrModel?: string,
 *   syncLlamaBackend?: boolean,
 *   scope?: 'full'|'base'|'runtime',
 * }} [options]
 */
async function runEnvCheck(options = {}) {
    const scope = normalizeEnvCheckScope(options.scope);
    const wantBase = scope === 'full' || scope === 'base';
    const wantRuntime = scope === 'full' || scope === 'runtime';
    const items = [];

    const configuredRoot = resolveEngineInstallPath(options.engineInstallPath || '');
    const engineItem = checkEngine(configuredRoot);
    const engineRoot = engineItem.path || configuredRoot || getBundledEnginePath();
    const asrModel = String(options.engineAsrModel || '').trim();

    if (wantBase) {
        items.push(checkInstallPath());
        items.push(await checkFfmpeg(options.ffmpegPath));
        items.push(checkVcRedist());

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
        // Prepare-step gate: catch serve-order Torch failures before first Qwen job.
        if (engineItem.status === 'ok') {
            items.push(await checkTorchEngineStartup(engineRoot, asrModel));
        } else if (prefersQwenAsr(asrModel) || prefersSensevoice(asrModel)) {
            items.push({
                id: 'torchEngineStartup',
                label: 'PyTorch 引擎启动探测',
                status: 'fail',
                detail: '引擎不可用，无法模拟 serve 加载 Torch',
                blocking: true,
            });
        }
    } else if (wantRuntime && options.syncLlamaBackend) {
        // Runtime-only recheck: still align llama backend if caller asks.
        try {
            const { info } = await checkGpu();
            const prefer = require('./advanced-runtime-prefer');
            if (info) prefer.applyGpuInfo(info);
            require('./advanced-llama-server').syncRuntimePreferenceToHardware({
                force: true,
                gpuInfo: info || undefined,
            });
        } catch (_) { /* ignore */ }
    }

    if (wantRuntime) {
        if (engineItem.status === 'ok') {
            items.push(checkAsrModel(engineRoot, asrModel));
            items.push(checkVadModel(engineRoot, asrModel));
            items.push(checkLidModel(engineRoot));
            items.push(await checkSensevoiceRuntime(engineRoot, asrModel));
            items.push(await checkQwen3Runtime(engineRoot, asrModel));
            // base scope already ran serve-order Torch probe; avoid a second LoadLibrary.
            if (!items.some((it) => it.id === 'torchEngineStartup')) {
                items.push(await checkTorchEngineStartup(engineRoot, asrModel));
            }
            items.push(await checkWhisperRuntime(engineRoot, asrModel));
        } else {
            const needSv = prefersSensevoice(asrModel);
            const needQwen = prefersQwenAsr(asrModel);
            const needWhisper = prefersWhisper(asrModel) || !prefersSensevoice(asrModel);
            const needTorchStartup = needSv || needQwen;
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
                status: needSv ? 'fail' : 'warn',
                detail: '引擎不可用，无法检测 torch / funasr',
                blocking: needSv,
            });
            items.push({
                id: 'qwenRuntime',
                label: 'Qwen3-ASR 运行库',
                status: needQwen ? 'fail' : 'warn',
                detail: '引擎不可用，无法检测 transformers / torch（Qwen3 -hf）',
                blocking: needQwen,
            });
            items.push({
                id: 'torchEngineStartup',
                label: 'PyTorch 引擎启动探测',
                status: needTorchStartup ? 'fail' : 'warn',
                detail: '引擎不可用，无法模拟 serve 加载 Torch',
                blocking: needTorchStartup,
            });
            items.push({
                id: 'whisperRuntime',
                label: 'Whisper 运行库',
                status: needWhisper ? 'fail' : 'warn',
                detail: '引擎不可用，跳过',
                blocking: needWhisper,
            });
        }
    }

    const blocking = items.filter((it) => it.blocking && it.status === 'fail');
    const gpuRtIdx = items.findIndex((it) => it.id === 'gpuRuntime');
    if (gpuRtIdx >= 0) {
        const gpuRt = items[gpuRtIdx];
        const needsTorchAsr = prefersQwenAsr(asrModel) || prefersSensevoice(asrModel);
        if (gpuRt.torchCudaMismatch && needsTorchAsr) {
            const variant = String(gpuRt.torchCudaVariant || 'cu128/cu130').trim();
            const have = String(gpuRt.installedTorchCudaTag || 'cu126').trim();
            items[gpuRtIdx] = {
                ...gpuRt,
                status: 'fail',
                blocking: true,
                detail: (
                    `PyTorch ${have} 与本机 Blackwell GPU 不兼容，转写需要 ${variant}（约 2.5GB）。`
                    + ' 与 llama-server CUDA 无关，请点「补齐 CUDA PyTorch」。'
                ),
            };
        }
    }
    const blockingAfterTorch = items.filter((it) => it.blocking && it.status === 'fail');
    const result = {
        ok: blockingAfterTorch.length === 0,
        blockingCount: blockingAfterTorch.length,
        warnCount: items.filter((it) => it.status === 'warn').length,
        failCount: items.filter((it) => it.status === 'fail').length,
        items,
        scope,
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
    let ensureTorchCuda = false;
    let ensureTorchRocm = false;
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

    if (statusOf('qwenRuntime') === 'fail' || statusOf('qwenRuntime') === 'warn') {
        const qwenId = prefersQwenAsr(asrModel) ? asrModel : 'qwen3-asr-0.6b';
        modelIds.add(qwenId);
        forceIds.add(qwenId);
        const qr = byId.qwenRuntime || {};
        const amdGpu = String(byId.gpu?.vendor || '').toLowerCase() === 'amd';
        const cudaNote = qr.needsTorchCuda
            ? (amdGpu ? '（含 ROCm 版 PyTorch）' : '（含 CUDA 版 PyTorch，约 2.5GB）')
            : '';
        const tokenizersNote = qr.tokenizersMismatch
            ? '（含 tokenizers 降级至 0.22.2）'
            : '';
        const numpyNote = qr.numpyBroken || /numpy/i.test(String(qr.detail || ''))
            ? '（含 numpy 兼容修复）'
            : '';
        steps.push({
            id: 'qwenRuntime',
            label: `补齐 Qwen3-ASR 运行库（transformers≥5.13 / torch）${cudaNote}${tokenizersNote}${numpyNote}`,
        });
    }

    if (statusOf('whisperRuntime') === 'fail' || statusOf('whisperRuntime') === 'warn') {
        const wr = byId.whisperRuntime || {};
        const wrDetail = detailOf('whisperRuntime');
        // Slow first import after install — do not force another pip round.
        if (!wr.probeTimedOut) {
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
    }

    const gpuRtItem = byId.gpuRuntime || {};
    if (gpuRtItem.hasRocm && !gpuRtItem.torchRocm && !gpuRtItem.hasCuda) {
        ensureTorchRocm = true;
        if (!steps.some((s) => s.id === 'torchRocm')) {
            steps.push({
                id: 'torchRocm',
                label: '补齐 ROCm PyTorch（装进引擎运行时；不要装 CUDA 版）',
            });
        }
    }
    if (gpuRtItem.torchCudaMismatch) {
        ensureTorchCuda = true;
        const variant = String(gpuRtItem.torchCudaVariant || 'cu128/cu130').trim();
        if (!steps.some((s) => s.id === 'audioSeparate')) {
            steps.push({
                id: 'audioSeparate',
                label: `补齐 CUDA PyTorch（${variant}，约 2.5GB）`,
            });
        }
    }

    if (statusOf('torchEngineStartup') === 'fail' || statusOf('torchEngineStartup') === 'warn') {
        const torchItem = byId.torchEngineStartup || {};
        const torchDetail = detailOf('torchEngineStartup');
        const amdGpu = String(byId.gpu?.vendor || '').toLowerCase() === 'amd';
        const needsRocm = amdGpu
            || !!torchItem.needsTorchRocm
            || /ROCm|NEED_TORCH_ROCM/i.test(`${torchItem.code || ''} ${torchDetail}`);
        const needsCuda = !needsRocm && (
            !!torchItem.needsTorchCuda
            || /补齐 CUDA|CUDA PyTorch|WinError 1114|docstring|引擎进程中损坏|NEED_TORCH_CUDA|TORCH_CUDA_LOAD|TORCH_REIMPORT/i.test(
                `${torchItem.code || ''} ${torchDetail}`,
            )
        );
        if (needsRocm) {
            ensureTorchRocm = true;
            if (!steps.some((s) => s.id === 'torchRocm')) {
                steps.push({
                    id: 'torchRocm',
                    label: '补齐 ROCm PyTorch（装进引擎运行时，约数 GB；不要装 CUDA 版）',
                });
            }
        } else if (needsCuda) {
            ensureTorchCuda = true;
            if (!steps.some((s) => s.id === 'audioSeparate')) {
                steps.push({
                    id: 'audioSeparate',
                    label: '补齐 CUDA PyTorch（约 2.5GB；修复引擎启动探测失败）',
                });
            }
        }
        if (!steps.some((s) => s.id === 'torchEngineStartup')) {
            steps.push({
                id: 'torchEngineStartup',
                label: needsCuda
                    ? '补齐后将重测 PyTorch 引擎启动（与真实转写同序）'
                    : '修复 PyTorch 引擎启动探测失败',
            });
        }
    }

    if (statusOf('gpuRuntime') === 'warn') {
        const gpuItem = gpuRtItem;
        const gpuDetail = detailOf('gpuRuntime');
        const ct2Missing = String(gpuItem.ctranslate2CudaReason || '') === 'ctranslate2_not_installed'
            || /未安装 CTranslate2|ctranslate2_not_installed/i.test(gpuDetail);
        if (ct2Missing) {
            // faster-whisper is often installed --no-deps; GPU cuBLAS alone cannot fix CT2.
            modelIds.add('whisper-tiny');
            forceIds.add('whisper-tiny');
            steps.push({
                id: 'whisperRuntime',
                label: '补齐 Whisper 运行库（ctranslate2 / faster-whisper / av）',
            });
        }
        // Any GPU runtime「注意」must be one-click fixable (cuBLAS / ORT / Toolkit reuse).
        // Soft copy like「驱动支持 CUDA 12+」previously matched the regex but CT2-only
        // paths and some probe.hint strings did not — leaving the prepare gate stuck.
        ensureGpu = true;
        if (!steps.some((s) => s.id === 'gpuRuntime')) {
            const ortOnly = /WhisperSeg|onnxruntime/i.test(gpuDetail)
                && !/cublas64_12|缺少 cublas|未找到 cublas/i.test(gpuDetail)
                && !ct2Missing;
            steps.push({
                id: 'gpuRuntime',
                label: ortOnly
                    ? '下载 GPU 支持（WhisperSeg / onnxruntime-gpu）'
                    : '下载 GPU 支持（cuBLAS / CUDA 组件）',
            });
        }
    }

    const llamaItem = byId.llamaServerRuntime || {};
    const recommendRuntimeId = String(
        llamaItem.recommendRuntimeId || llamaItem.preferredPackageId || '',
    ).trim();
    if (statusOf('llamaServerRuntime') === 'warn'
        && (llamaItem.outdated || llamaItem.mismatch || llamaItem.recommendInstall
            || /未安装|可更新至|后端不一致|请重新安装|建议安装/i.test(detailOf('llamaServerRuntime')))) {
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
    const fixable = openVcRedist || ensureGpu || ensureTorchCuda || ensureTorchRocm || ensureLlamaRuntime || models.length > 0;
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
        ensureTorchCuda,
        ensureTorchRocm,
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
    normalizeEnvCheckScope,
    ENV_CHECK_BASE_IDS,
    ENV_CHECK_RUNTIME_IDS,
    checkInstallPath,
    checkVcRedist,
    checkEngine,
    checkGpu,
    checkGpuRuntime,
    checkAsrModel,
    checkVadModel,
    checkLidModel,
    checkLlamaServerRuntime,
    checkTorchEngineStartup,
    checkModelInstalled,
    listInstalledAsrIds,
    prefersSensevoice,
    prefersWhisper,
    prefersQwenAsr,
    findCublasInEngine,
    hasNonAscii,
    resolveEnginePython,
    sanitizeEngineProbeStderr,
    ASR_MODEL_MARKERS,
    VC_REDIST_URL,
    SUPPORT_URL,
};
