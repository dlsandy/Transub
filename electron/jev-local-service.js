/**
 * Detect / pip-install / start local OpenDecider (Laya-compatible System One) on 39283.
 */
const { spawn, execFile } = require('child_process');
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const jevCore = require('../src/js/jev-decision-core');
const jevClient = require('./jev-client');
const { localStartHint } = require('./jev-port-guard');
const { createLlmPortReclaim } = require('./llm-port-reclaim');

const layaPortReclaim = createLlmPortReclaim();

function broadcastLayaProgress(info) {
    const payload = info && typeof info === 'object' ? info : { message: String(info || '') };
    try {
        for (const win of BrowserWindow.getAllWindows()) {
            try {
                win.webContents.send('transub-advanced-laya-progress', payload);
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

function emitLayaLog(onLog, message, extra = {}) {
    const line = String(message || '').trim();
    if (!line) return;
    onLog?.(line);
    broadcastLayaProgress({ message: line, ...extra });
}

function spawnUtf8(command, args, { timeoutMs = 12 * 60 * 1000, onLog, env } = {}) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(command, args, {
                windowsHide: true,
                env: {
                    ...(env && typeof env === 'object' ? env : process.env),
                    PYTHONUNBUFFERED: '1',
                    PYTHONIOENCODING: 'utf-8',
                },
            });
        } catch (err) {
            resolve({ ok: false, error: err?.message || String(err), stdout: '' });
            return;
        }
        let out = '';
        const bump = (buf) => {
            const s = String(buf || '');
            out += s;
            const parts = s.split(/\r?\n/);
            for (const part of parts) {
                const line = String(part || '').replace(/\s+/g, ' ').trim();
                if (line) emitLayaLog(onLog, line.slice(0, 280));
            }
        };
        child.stdout?.on('data', bump);
        child.stderr?.on('data', bump);
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
            resolve({
                ok: false,
                error: '安装超时（超过 12 分钟）',
                stdout: out,
            });
        }, Math.max(30_000, Number(timeoutMs) || 0));
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, error: err?.message || String(err), stdout: out });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                ok: code === 0,
                code,
                stdout: out,
                error: code === 0 ? '' : (out.trim().slice(-800) || `退出码 ${code}`),
            });
        });
    });
}

const {
    LAYA_MODEL_ID,
    LAYA_HUB_ID,
    findBundledOpendeciderWheel,
    resolveBundledWheelsDir,
    resolveLayaModelLocalPath,
    isLayaModelDirReady,
    ensureLayaModelDownloaded,
} = require('./jev-laya-assets');

/** Hub id (env override) or catalog-managed local folder. */
const DEFAULT_SERVE_MODEL = LAYA_HUB_ID;
const PIP_SPEC = 'opendecider';
/** Install when torch is already present — skip re-pulling multi‑GB wheels. */
const LAYA_PACKAGE_NO_DEPS = 'opendecider';
const LAYA_NON_TORCH_DEPS = Object.freeze([
    'transformers>=4.51',
    'safetensors>=0.4',
    'huggingface_hub>=0.23',
    'fastapi>=0.110',
    'uvicorn>=0.27',
]);
const TORCH_MIN_VERSION = '2.1';
/** Domestic-first pip mirrors (skip official until last). */
const DEFAULT_PIP_MIRROR_ORDER = Object.freeze([
    'aliyun', 'tsinghua', 'huawei', 'ustc', 'tencent', 'official',
]);
const DEFAULT_HF_MIRROR = 'https://hf-mirror.com';
/** Serve boot wait (weights are downloaded before spawn). */
const START_WAIT_MS = 3 * 60 * 1000;

let serveChild = null;

function readSavedDownloadPrefs() {
    try {
        const { loadSettings } = require('./settings-data');
        const options = loadSettings()?.options || {};
        const hasHf = Object.prototype.hasOwnProperty.call(options, 'engineHfEndpoint');
        return {
            preferredPipMirror: String(options.preferredPipMirror || '').trim(),
            // Empty string is intentional (= official Hub) when the key was saved.
            hfEndpoint: hasHf
                ? String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '')
                : DEFAULT_HF_MIRROR,
            hfEndpointConfigured: hasHf,
            engineInstallPath: String(options.engineInstallPath || '').trim(),
            proxyEnabled: !!options.proxyEnabled,
            proxyUrl: String(options.proxyUrl || '').trim(),
            proxyBypass: String(options.proxyBypass || '').trim(),
        };
    } catch {
        return {
            preferredPipMirror: '',
            hfEndpoint: DEFAULT_HF_MIRROR,
            hfEndpointConfigured: false,
            engineInstallPath: '',
            proxyEnabled: false,
            proxyUrl: '',
            proxyBypass: '',
        };
    }
}

function resolveEnginePythonCandidate() {
    try {
        const { resolveEngineInstallPath } = require('./engine-options');
        const { resolveEngineRuntimePython } = require('./engine-runtime-env');
        const prefs = readSavedDownloadPrefs();
        const installPath = resolveEngineInstallPath(prefs.engineInstallPath || '');
        if (!installPath) return null;
        const exe = resolveEngineRuntimePython(installPath);
        if (!exe || !fs.existsSync(exe)) return null;
        return {
            ok: true,
            command: exe,
            prefix: [],
            executable: path.resolve(exe),
            source: 'engine',
            engineInstallPath: installPath,
        };
    } catch {
        return null;
    }
}

function listLayaPipMirrors(prefer = '') {
    const {
        PIP_MIRROR_CATALOG,
        resolvePreferredPipMirror,
    } = require('./pip-mirrors');
    const out = [];
    const seen = new Set();
    const push = (row) => {
        if (!row?.indexUrl || !row?.host) return;
        const key = String(row.host).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(row);
    };
    const preferred = resolvePreferredPipMirror(prefer)
        || resolvePreferredPipMirror(process.env.TRANSUB_PIP_PREFERRED_MIRROR || '');
    if (preferred) push(preferred);
    for (const id of DEFAULT_PIP_MIRROR_ORDER) {
        const row = PIP_MIRROR_CATALOG.find((r) => r.id === id);
        if (row) push(row);
    }
    return out;
}

/**
 * @param {{ indexUrl?: string, host?: string }|null} mirror
 * @param {{
 *   packages?: string[],
 *   noDeps?: boolean,
 *   upgrade?: boolean,
 *   findLinks?: string,
 *   noIndex?: boolean,
 * }} [opts]
 */
function buildPipInstallArgs(mirror, opts = {}) {
    const packages = Array.isArray(opts.packages) && opts.packages.length
        ? opts.packages.map((p) => String(p || '').trim()).filter(Boolean)
        : [PIP_SPEC];
    const args = ['-m', 'pip', 'install'];
    if (opts.upgrade !== false) args.push('--upgrade');
    args.push('--prefer-binary');
    if (opts.noDeps) args.push('--no-deps');
    const findLinks = String(opts.findLinks || '').trim();
    if (findLinks) {
        args.push('--find-links', findLinks);
    }
    if (opts.noIndex) {
        args.push('--no-index');
    } else if (mirror?.indexUrl) {
        args.push('-i', mirror.indexUrl, '--trusted-host', mirror.host || '');
    }
    args.push(...packages);
    return args;
}

/**
 * Prefer packaged `transub-engine/wheels/opendecider-*.whl`.
 * @param {{ ok: boolean, executable?: string, engineInstallPath?: string }} py
 * @param {{ onLog?: Function }} [opts]
 */
async function installOpendeciderFromBundledWheel(py, opts = {}) {
    const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
    const wheelsDir = resolveBundledWheelsDir(py.engineInstallPath || '');
    const whl = findBundledOpendeciderWheel(wheelsDir);
    if (!whl) {
        return { ok: false, error: '未找到内置 opendecider wheel' };
    }
    emitLayaLog(onLog, `使用内置 wheel：${path.basename(whl)}`);
    const env = pythonEnvFor(py);
    const res = await spawnUtf8(
        py.executable,
        buildPipInstallArgs(null, {
            packages: [whl],
            noDeps: true,
            upgrade: true,
            findLinks: wheelsDir || path.dirname(whl),
            noIndex: true,
        }),
        { timeoutMs: 5 * 60 * 1000, onLog, env },
    );
    if (!res.ok) {
        return {
            ok: false,
            error: String(res.stderr || res.stdout || res.error || '').trim().slice(-800)
                || '内置 wheel 安装失败',
            wheel: whl,
        };
    }
    return { ok: true, wheel: whl };
}

/**
 * Resolve catalog-managed local folder (or allow explicit path / hub override).
 * @param {{ model?: string, engineInstallPath?: string, hfEndpoint?: string, onLog?: Function }} opts
 */
async function resolveServeModelPath(opts = {}) {
    const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
    const override = String(opts.model || process.env.TRANSUB_LAYA_MODEL || '').trim();
    if (override && (fs.existsSync(override) || /[/\\]/.test(override))) {
        return { ok: true, model: override, via: 'override-path' };
    }
    if (override && override !== LAYA_HUB_ID && override !== LAYA_MODEL_ID
        && !/^manjunathshiva\//i.test(override)) {
        // Custom hub id — leave to serve script (legacy).
        return { ok: true, model: override, via: 'override-hub' };
    }
    const engineInstallPath = String(opts.engineInstallPath || '').trim();
    const ensured = await ensureLayaModelDownloaded({
        pythonExecutable: opts.pythonExecutable,
        pythonPrefix: opts.pythonPrefix,
        engineInstallPath,
        hfEndpoint: opts.hfEndpoint,
        onLog,
    });
    if (!ensured.ok) {
        return { ok: false, error: ensured.error || 'Laya 模型未就绪' };
    }
    const local = String(ensured.path || resolveLayaModelLocalPath(engineInstallPath) || '').trim();
    if (!local || !isLayaModelDirReady(local)) {
        return {
            ok: false,
            error: 'Laya 模型目录不完整，请在「模型管理」下载 OpenDecider nano（Laya）',
        };
    }
    emitLayaLog(onLog, `使用模型管理目录：${local}`);
    return { ok: true, model: local, via: 'models-manager', modelId: LAYA_MODEL_ID };
}

function parseVersionTuple(version) {
    const m = String(version || '').trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

function torchMeetsMinimum(version, minimum = TORCH_MIN_VERSION) {
    const got = parseVersionTuple(version);
    const need = parseVersionTuple(minimum);
    if (!got || !need) return false;
    for (let i = 0; i < 3; i += 1) {
        if (got[i] > need[i]) return true;
        if (got[i] < need[i]) return false;
    }
    return true;
}

function resolveLayaHfEndpoint(opts = {}) {
    if (Object.prototype.hasOwnProperty.call(opts, 'hfEndpoint')) {
        return String(opts.hfEndpoint || '').trim().replace(/\/+$/, '');
    }
    const fromEnv = String(process.env.TRANSUB_LAYA_HF_ENDPOINT || '').trim().replace(/\/+$/, '');
    if (fromEnv) return fromEnv;
    // Prefer Transub network settings over ambient process.env.HF_ENDPOINT
    // (the latter may point at official Hub from a prior shell).
    const prefs = readSavedDownloadPrefs();
    if (prefs.hfEndpointConfigured || prefs.hfEndpoint) {
        return prefs.hfEndpoint;
    }
    const ambient = String(process.env.HF_ENDPOINT || '').trim().replace(/\/+$/, '');
    if (ambient) return ambient;
    return DEFAULT_HF_MIRROR;
}

function isInsideAsar(filePath) {
    const raw = String(filePath || '');
    return raw.includes(`${path.sep}app.asar${path.sep}`) || raw.includes('/app.asar/');
}

function asarUnpackedPath(filePath) {
    const raw = String(filePath || '');
    if (!isInsideAsar(raw)) return raw;
    return raw
        .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
        .replace('/app.asar/', '/app.asar.unpacked/');
}

function pythonReadableUserDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') return app.getPath('userData');
    } catch { /* tests / non-electron */ }
    return path.join(process.cwd(), 'tmp');
}

/**
 * CPython cannot open files inside app.asar. Prefer extraResources / unpacked,
 * then copy the bundled script to userData (Node can read asar).
 */
function serveScriptPath() {
    const name = 'laya-opendecider-serve.py';
    const bundled = path.join(__dirname, name);
    const candidates = [];
    if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, name));
        candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', name));
    }
    candidates.push(asarUnpackedPath(bundled));
    if (!isInsideAsar(bundled)) candidates.push(bundled);
    for (const c of candidates) {
        if (!c || isInsideAsar(c)) continue;
        try {
            if (fs.existsSync(c)) return c;
        } catch { /* ignore */ }
    }
    if (!fs.existsSync(bundled)) return bundled;
    const destDir = pythonReadableUserDir();
    const dest = path.join(destDir, name);
    try {
        fs.mkdirSync(destDir, { recursive: true });
        const src = fs.readFileSync(bundled);
        let same = false;
        try {
            same = fs.existsSync(dest) && fs.readFileSync(dest).equals(src);
        } catch {
            same = false;
        }
        if (!same) fs.writeFileSync(dest, src);
        return dest;
    } catch {
        return bundled;
    }
}

function serveEnv(opts = {}) {
    const hf = resolveLayaHfEndpoint(opts);
    const prefs = readSavedDownloadPrefs();
    const engineRoot = String(opts.engineInstallPath || prefs.engineInstallPath || '').trim();
    let env;
    if (engineRoot) {
        try {
            const { buildEngineProbeEnv } = require('./env-check');
            env = buildEngineProbeEnv(engineRoot);
        } catch {
            env = { ...process.env };
        }
        env.TRANSUB_ENGINE_HOME = path.resolve(engineRoot);
    } else {
        env = { ...process.env };
    }
    try {
        const { applyProxyToEnv } = require('./proxy-settings');
        applyProxyToEnv(env, {
            proxyEnabled: Object.prototype.hasOwnProperty.call(opts, 'proxyEnabled')
                ? opts.proxyEnabled
                : prefs.proxyEnabled,
            proxyUrl: opts.proxyUrl != null ? opts.proxyUrl : prefs.proxyUrl,
            proxyBypass: opts.proxyBypass != null ? opts.proxyBypass : prefs.proxyBypass,
        });
    } catch { /* optional */ }

    env.PYTHONUNBUFFERED = '1';
    env.PYTHONIOENCODING = 'utf-8';
    env.PYTHONUTF8 = '1';
    if (hf) {
        env.HF_ENDPOINT = hf;
        env.TRANSUB_LAYA_HF_ENDPOINT = hf;
        env.HUGGINGFACE_HUB_ENDPOINT = hf;
    } else {
        delete env.HF_ENDPOINT;
        delete env.TRANSUB_LAYA_HF_ENDPOINT;
        delete env.HUGGINGFACE_HUB_ENDPOINT;
    }
    env.HF_HUB_ENABLE_HF_TRANSFER = '0';
    if (!env.HF_HUB_DISABLE_XET) env.HF_HUB_DISABLE_XET = '1';
    if (!env.HF_HUB_DOWNLOAD_TIMEOUT) env.HF_HUB_DOWNLOAD_TIMEOUT = '120';
    if (!env.HF_HUB_ETAG_TIMEOUT) env.HF_HUB_ETAG_TIMEOUT = '30';
    return env;
}

function readNewLogLines(logPath, offset) {
    try {
        if (!logPath || !fs.existsSync(logPath)) return { text: '', offset };
        const buf = fs.readFileSync(logPath);
        if (buf.length <= offset) return { text: '', offset };
        const chunk = buf.subarray(offset).toString('utf8');
        return { text: chunk, offset: buf.length };
    } catch {
        return { text: '', offset };
    }
}

function emitFreshLogLines(onLog, text) {
    const lines = String(text || '').split(/\r?\n/);
    for (const part of lines) {
        const line = String(part || '').replace(/\s+/g, ' ').trim();
        if (line) emitLayaLog(onLog, line.slice(0, 280));
    }
}

/**
 * Immediate-fail phrases from serve.py / Python (do not wait for port timeout).
 * @param {string} text
 * @returns {string}
 */
function detectServeBootFatal(text) {
    const blob = String(text || '');
    if (!blob) return '';
    if (/SyntaxError/i.test(blob)) return 'Laya 服务脚本语法错误，无法启动';
    if (/ModuleNotFoundError|ImportError/i.test(blob)) {
        const m = blob.match(/No module named ['\"]([^'\"]+)['\"]/i);
        return m ? `缺少 Python 模块：${m[1]}` : '缺少 Python 依赖，无法启动 Laya';
    }
    if (/Address already in use|WinError 10048/i.test(blob)) {
        return '39283 端口已被占用，无法启动 Laya';
    }
    if (/can't open file|No such file or directory/i.test(blob) && /laya-opendecider-serve\.py/i.test(blob)) {
        return '安装包内的 Laya 启动脚本无法被 Python 直接打开（asar），请升级到已解包该脚本的版本';
    }
    return '';
}

function reservedPort() {
    return Number(jevCore.DEFAULT_LOCAL_PORT) || 39283;
}

function execFileUtf8(command, args, { timeoutMs = 12000, env } = {}) {
    return new Promise((resolve) => {
        execFile(command, args, {
            timeout: timeoutMs,
            windowsHide: true,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
            env: env && typeof env === 'object' ? env : undefined,
        }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                code: err?.code,
                stdout: String(stdout || ''),
                stderr: String(stderr || ''),
                error: err ? (err.message || String(err)) : '',
            });
        });
    });
}

function pythonEnvFor(py) {
    if (py?.engineInstallPath) {
        return serveEnv({ engineInstallPath: py.engineInstallPath });
    }
    return undefined;
}

function systemPythonCandidates() {
    if (process.platform === 'win32') {
        return [
            { command: 'py', prefix: ['-3'] },
            { command: 'python', prefix: [] },
            { command: 'python3', prefix: [] },
        ];
    }
    return [
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] },
    ];
}

/**
 * Prefer Transub Engine runtime Python (already has CUDA/CPU torch) over system Python.
 * @param {{ preferSystem?: boolean }} [opts]
 */
async function resolvePython(opts = {}) {
    if (process.env.TRANSUB_LAYA_PYTHON) {
        const command = process.env.TRANSUB_LAYA_PYTHON;
        const probe = await execFileUtf8(command, ['-c', 'import sys; print(sys.executable)']);
        const exe = String(probe.stdout || '').trim().split(/\r?\n/)[0];
        if (probe.ok && exe) {
            return {
                ok: true,
                command,
                prefix: [],
                executable: exe,
                source: 'env',
            };
        }
    }

    if (!opts.preferSystem) {
        const engine = resolveEnginePythonCandidate();
        if (engine) {
            const probe = await execFileUtf8(
                engine.command,
                ['-c', 'import sys; print(sys.executable)'],
                { env: pythonEnvFor(engine), timeoutMs: 20000 },
            );
            if (probe.ok) {
                return engine;
            }
        }
    }

    for (const cand of systemPythonCandidates()) {
        const probe = await execFileUtf8(cand.command, [...cand.prefix, '-c', 'import sys; print(sys.executable)']);
        const exe = String(probe.stdout || '').trim().split(/\r?\n/)[0];
        if (probe.ok && exe) {
            return {
                ok: true,
                command: cand.command,
                prefix: cand.prefix,
                executable: exe,
                source: 'system',
            };
        }
    }
    return {
        ok: false,
        error: '未找到可用 Python。请先完成引擎环境检查/修复，或安装系统 Python 3.10+。',
    };
}

async function probeTorch(py) {
    if (!py?.ok && !py?.executable) {
        return { ok: false, error: '无 Python' };
    }
    const res = await execFileUtf8(
        py.executable || py.command,
        [
            '-c',
            'import torch; print(torch.__version__); print("cuda" if torch.cuda.is_available() else "cpu")',
        ],
        { timeoutMs: 60000, env: pythonEnvFor(py) },
    );
    if (!res.ok) {
        return { ok: false, error: res.error || res.stderr || '无法 import torch' };
    }
    const lines = String(res.stdout || '').trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const version = lines[0] || '';
    const device = lines[1] || '';
    return {
        ok: torchMeetsMinimum(version),
        version,
        device,
        reusable: torchMeetsMinimum(version),
        error: torchMeetsMinimum(version) ? '' : `torch ${version || '?'} 低于 ${TORCH_MIN_VERSION}`,
    };
}

async function probeReachable(endpoint = 'local') {
    try {
        const res = await jevClient.probeSystemOne({
            apiKey: '',
            endpoint,
            timeoutMs: 4000,
        });
        return { reachable: !!res?.ok, probe: res };
    } catch (err) {
        return { reachable: false, probe: { ok: false, error: err?.message || String(err) } };
    }
}

function cliNextToPython(executable) {
    const exe = String(executable || '').trim();
    if (!exe) return '';
    const dir = path.dirname(exe);
    const names = process.platform === 'win32'
        ? ['opendecider.exe', 'opendecider']
        : ['opendecider'];
    const roots = [
        path.join(dir, 'Scripts'),
        path.join(dir, 'bin'),
        dir,
    ];
    for (const root of roots) {
        for (const name of names) {
            const p = path.join(root, name);
            if (fs.existsSync(p)) return p;
        }
    }
    return '';
}

async function detectOpendeciderCli(pythonExecutable) {
    const beside = cliNextToPython(pythonExecutable);
    if (beside) return { ok: true, path: beside };
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const found = await execFileUtf8(cmd, ['opendecider']);
    const first = String(found.stdout || '').trim().split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (found.ok && first && fs.existsSync(first)) {
        return { ok: true, path: first };
    }
    return { ok: false };
}

async function detectOpendeciderModule(py) {
    const res = await execFileUtf8(
        py.executable || py.command,
        [...(py.prefix || []), '-c', 'import importlib.util; print("1" if importlib.util.find_spec("opendecider") else "0")'],
        { timeoutMs: 20000, env: pythonEnvFor(py) },
    );
    return { ok: res.ok && String(res.stdout || '').trim().startsWith('1') };
}

/**
 * @param {{ endpoint?: string, skipTorch?: boolean }} [opts]
 */
async function getLocalLayaStatus(opts = {}) {
    const endpoint = opts.endpoint || 'local';
    const resolved = jevCore.resolveJevEndpoint(endpoint);
    const local = jevCore.isLocalSystemOneEndpoint(resolved);
    const port = reservedPort();
    if (!local) {
        return {
            ok: true,
            local: false,
            installed: false,
            reachable: false,
            endpoint: resolved,
            port,
        };
    }
    const py = await resolvePython();
    // Reachability first — if already up, skip CLI/module/torch probes (torch import is slow).
    const reach = await probeReachable(endpoint);
    if (reach.reachable) {
        return {
            ok: true,
            local: true,
            installed: true,
            reachable: true,
            python: py.ok ? py.executable : '',
            pythonSource: py.ok ? (py.source || '') : '',
            engineInstallPath: py.engineInstallPath || '',
            torchReusable: null,
            torchVersion: '',
            pythonError: py.ok ? '' : py.error,
            endpoint: resolved,
            port,
            hint: localStartHint(port),
            runningPid: serveChild && !serveChild.killed ? serveChild.pid : 0,
        };
    }
    const cli = await detectOpendeciderCli(py.ok ? py.executable : '');
    let moduleOk = false;
    let torch = null;
    if (py.ok) {
        const mod = await detectOpendeciderModule(py);
        moduleOk = !!mod.ok;
        if (!opts.skipTorch) {
            torch = await probeTorch(py);
        }
    }
    const installed = !!(cli.ok || moduleOk);
    return {
        ok: true,
        local: true,
        installed,
        reachable: false,
        cliPath: cli.path || '',
        python: py.ok ? py.executable : '',
        pythonSource: py.ok ? (py.source || '') : '',
        engineInstallPath: py.engineInstallPath || '',
        torchReusable: torch ? !!torch.reusable : null,
        torchVersion: torch?.version || '',
        pythonError: py.ok ? '' : py.error,
        endpoint: resolved,
        port,
        hint: localStartHint(port),
        runningPid: serveChild && !serveChild.killed ? serveChild.pid : 0,
    };
}

function spawnLogged(command, args, { cwd, logPath, env } = {}) {
    const out = logPath
        ? fs.openSync(logPath, 'a')
        : 'ignore';
    const child = spawn(command, args, {
        cwd: cwd || undefined,
        windowsHide: true,
        // Detached + unref so Electron can exit its event loop without waiting on
        // uvicorn; callers MUST stopLocalLaya() on before-quit / update (or the
        // Python process orphans — same pattern as llama-server).
        detached: true,
        stdio: logPath ? ['ignore', out, out] : 'ignore',
        env: env && typeof env === 'object' ? env : { ...process.env },
    });
    child.unref();
    return child;
}

/**
 * Stop the local OpenDecider / Laya Python serve process and free port 39283.
 * Safe when nothing is running (also clears orphans from a prior session).
 * @returns {{ ok: true, stopped: boolean, orphanCleared: boolean }}
 */
function stopLocalLaya() {
    const pid = serveChild && Number(serveChild.pid) > 0 ? Number(serveChild.pid) : 0;
    const had = !!pid;
    if (serveChild) {
        try { serveChild.removeAllListeners('exit'); } catch { /* ignore */ }
        try {
            if (process.platform === 'win32' && pid) {
                spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
                    windowsHide: true,
                    stdio: 'ignore',
                });
            } else {
                try { serveChild.kill('SIGTERM'); } catch { /* ignore */ }
            }
        } catch { /* ignore */ }
        serveChild = null;
    }
    let orphan = false;
    try {
        orphan = !!layaPortReclaim.killListenersOnPortSync(reservedPort());
    } catch { /* ignore */ }
    return { ok: true, stopped: had || orphan, orphanCleared: orphan };
}

function serveLogPath() {
    try {
        const { app } = require('electron');
        const dir = app.getPath('userData');
        return path.join(dir, 'laya-opendecider.log');
    } catch {
        return path.join(process.cwd(), 'tmp', 'laya-opendecider.log');
    }
}

/**
 * @param {{ endpoint?: string, model?: string, hfEndpoint?: string, onLog?: Function }} [opts]
 */
async function startLocalLaya(opts = {}) {
    const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
    const status = await getLocalLayaStatus(opts);
    if (status.reachable) {
        emitLayaLog(onLog, 'Laya 已在运行');
        return { ok: true, already: true, message: 'Laya 已在运行', port: status.port };
    }
    if (!status.installed) {
        return { ok: false, error: '尚未安装 OpenDecider', hint: status.hint };
    }
    const port = status.port;
    const py = await resolvePython();
    if (!py.ok) return py;
    const script = serveScriptPath();
    if (!script || !fs.existsSync(script) || isInsideAsar(script)) {
        return {
            ok: false,
            error: `缺少可被 Python 打开的服务脚本：${script || '(empty)'}`,
            hint: '安装包需解包 electron/laya-opendecider-serve.py（asarUnpack / extraResources）',
        };
    }
    const hf = resolveLayaHfEndpoint(opts);
    const engineInstallPath = py.engineInstallPath || status.engineInstallPath || '';
    const modelRes = await resolveServeModelPath({
        ...opts,
        pythonExecutable: py.executable,
        pythonPrefix: py.prefix || [],
        engineInstallPath,
        hfEndpoint: hf,
        onLog,
    });
    if (!modelRes.ok) {
        return {
            ok: false,
            error: modelRes.error || 'Laya 模型未就绪',
            hint: '请在「模型管理」下载 OpenDecider nano（Laya），或检查网络 / HF 镜像',
        };
    }
    const model = modelRes.model;
    const env = serveEnv({
        ...opts,
        hfEndpoint: hf,
        engineInstallPath,
    });
    const args = [
        script,
        '--host', '127.0.0.1',
        '--port', String(port),
        '--model', model,
        '--hf-endpoint', hf || '',
    ];
    emitLayaLog(onLog, `正在启动 Laya System One --port ${port}`);
    emitLayaLog(onLog, `Python（${py.source || 'unknown'}）：${py.executable}`);
    emitLayaLog(
        onLog,
        `模型：${model}；HF 端点：${hf || 'https://huggingface.co（官方）'}（按「设置 → 网络」）`,
    );
    if (env.HTTP_PROXY || env.HTTPS_PROXY) {
        emitLayaLog(onLog, `代理：${env.HTTPS_PROXY || env.HTTP_PROXY}`);
    } else {
        emitLayaLog(onLog, '代理：未启用（直连 HF 镜像/官方）');
    }
    const logPath = serveLogPath();
    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, `\n==== start ${new Date().toISOString()} ====\n`, { flag: 'a' });
    } catch { /* ignore */ }

    let logOffset = 0;
    try {
        if (fs.existsSync(logPath)) logOffset = fs.statSync(logPath).size;
    } catch { /* ignore */ }

    try {
        serveChild = spawnLogged(py.executable, [...(py.prefix || []), ...args], {
            logPath,
            env,
        });
        // Capture the ChildProcess: stopLocalLaya() / app quit may null the module
        // ref before 'exit' fires — writing serveChild.exitCode then crashes main.
        const spawned = serveChild;
        try {
            spawned.once('exit', (code) => {
                if (serveChild !== spawned) return;
                try { serveChild.exitCode = code; } catch { /* ignore */ }
            });
        } catch { /* ignore */ }
    } catch (err) {
        return { ok: false, error: err?.message || String(err), hint: status.hint };
    }

    const deadline = Date.now() + START_WAIT_MS;
    let lastPing = 0;
    let logAccum = '';
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const fresh = readNewLogLines(logPath, logOffset);
        logOffset = fresh.offset;
        logAccum += fresh.text || '';
        emitFreshLogLines(onLog, fresh.text);
        const fatal = detectServeBootFatal(logAccum);
        if (fatal) {
            return { ok: false, error: fatal, hint: status.hint, logPath, python: py.executable };
        }
        const exitCode = serveChild && Number.isFinite(Number(serveChild.exitCode))
            ? Number(serveChild.exitCode)
            : null;
        if (exitCode != null && exitCode !== 0) {
            return {
                ok: false,
                error: `Laya 进程已退出（code ${exitCode}）`,
                hint: status.hint,
                logPath,
                python: py.executable,
            };
        }
        const again = await probeReachable(opts.endpoint || 'local');
        if (again.reachable) {
            return {
                ok: true,
                started: true,
                pid: serveChild?.pid,
                port,
                hfEndpoint: hf || 'https://huggingface.co',
                python: py.executable,
                message: `Laya 已启动（:${port}）`,
            };
        }
        if (Date.now() - lastPing > 20000) {
            lastPing = Date.now();
            const leftMin = Math.max(1, Math.ceil((deadline - Date.now()) / 60000));
            emitLayaLog(onLog, `仍在等待服务就绪（加载模型中…约剩 ${leftMin} 分钟超时）`);
        }
    }
    return {
        ok: false,
        error: '已尝试启动，但仍无法连接 39283（进程已在后台继续，稍后点「安装 / 启动 Laya」或「测试连接」）',
        hint: status.hint,
        logPath,
        pid: serveChild?.pid,
        hfEndpoint: hf || 'https://huggingface.co',
        python: py.executable,
    };
}

async function pipInstallViaMirrors(py, packages, {
    onLog,
    mirrors,
    noDeps = false,
    upgrade = true,
    label = '',
} = {}) {
    const tried = [];
    let last = { ok: false, error: '未尝试安装' };
    const env = pythonEnvFor(py);
    for (const mirror of mirrors) {
        const mLabel = mirror.label || mirror.host || mirror.id || 'PyPI';
        emitLayaLog(onLog, `尝试镜像：${mLabel}${label ? `（${label}）` : ''} → ${packages.join(' ')}`);
        tried.push(mLabel);
        last = await spawnUtf8(
            py.executable,
            buildPipInstallArgs(mirror, { packages, noDeps, upgrade }),
            { timeoutMs: 12 * 60 * 1000, onLog, env },
        );
        if (last.ok) {
            emitLayaLog(onLog, `安装成功（${mLabel}${label ? ` / ${label}` : ''}）`);
            return { ok: true, tried, mirror: mLabel };
        }
        emitLayaLog(onLog, `镜像 ${mLabel} 失败，尝试下一个…`);
    }
    return {
        ok: false,
        tried,
        error: String(last.stderr || last.stdout || last.error || '').trim().slice(-800)
            || `安装失败（已试：${tried.join(' → ')}）`,
    };
}

/**
 * @param {{ endpoint?: string, start?: boolean, onLog?: Function, preferredPipMirror?: string }} [opts]
 */
async function installLocalLaya(opts = {}) {
    const py = await resolvePython();
    if (!py.ok) return py;
    const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
    const prefer = String(opts.preferredPipMirror || readSavedDownloadPrefs().preferredPipMirror || '').trim();
    const mirrors = listLayaPipMirrors(prefer);
    emitLayaLog(onLog, `使用 Python（${py.source || 'unknown'}）：${py.executable}`);
    if (py.source === 'engine') {
        emitLayaLog(onLog, '优先复用引擎运行时，避免再装一套 torch');
    }

    const torch = await probeTorch(py);
    let pipResult;
    const tried = [];

    // Prefer packaged wheel; fall back to PyPI only if the wheel is missing.
    const bundled = await installOpendeciderFromBundledWheel(py, { onLog });
    if (bundled.ok) {
        tried.push('bundled-wheel');
        pipResult = { ok: true };
        if (torch.reusable) {
            emitLayaLog(
                onLog,
                `检测到已有 torch ${torch.version}（${torch.device || '?'}），跳过 torch 下载`,
            );
        } else {
            emitLayaLog(
                onLog,
                torch.version
                    ? `当前 torch ${torch.version} 不可用（${torch.error || '版本过低'}）；请先完成引擎环境修复后再启动 Laya`
                    : '未检测到可用 torch；请先完成引擎环境修复后再启动 Laya',
            );
        }
        const deps = await pipInstallViaMirrors(py, [...LAYA_NON_TORCH_DEPS], {
            onLog,
            mirrors,
            noDeps: false,
            upgrade: false,
            label: '非 torch 依赖',
        });
        tried.push(...deps.tried.map((t) => `${t}/deps`));
        if (!deps.ok) {
            return {
                ok: false,
                error: deps.error || '安装 OpenDecider 依赖失败',
                python: py.executable,
                pythonSource: py.source,
                reusedTorch: !!torch.reusable,
                torchVersion: torch.version,
                triedMirrors: tried,
            };
        }
    } else if (torch.reusable) {
        emitLayaLog(
            onLog,
            `内置 wheel 不可用（${bundled.error || 'missing'}），回退镜像安装 OpenDecider 本体`,
        );
        const pkg = await pipInstallViaMirrors(py, [LAYA_PACKAGE_NO_DEPS], {
            onLog,
            mirrors,
            noDeps: true,
            upgrade: true,
            label: 'opendecider --no-deps',
        });
        tried.push(...pkg.tried.map((t) => `${t}/pkg`));
        if (!pkg.ok) {
            return {
                ok: false,
                error: pkg.error || '安装 opendecider 失败',
                python: py.executable,
                pythonSource: py.source,
                reusedTorch: true,
                torchVersion: torch.version,
                triedMirrors: tried,
            };
        }
        const deps = await pipInstallViaMirrors(py, [...LAYA_NON_TORCH_DEPS], {
            onLog,
            mirrors,
            noDeps: false,
            upgrade: false,
            label: '非 torch 依赖',
        });
        tried.push(...deps.tried.map((t) => `${t}/deps`));
        if (!deps.ok) {
            return {
                ok: false,
                error: deps.error || '安装 OpenDecider 依赖失败',
                python: py.executable,
                pythonSource: py.source,
                reusedTorch: true,
                torchVersion: torch.version,
                triedMirrors: tried,
            };
        }
        pipResult = { ok: true };
    } else {
        emitLayaLog(
            onLog,
            torch.version
                ? `当前 torch ${torch.version} 不可用（${torch.error || '版本过低'}），将完整安装 ${PIP_SPEC}（含 torch，体积大）`
                : `未检测到可用 torch，将完整安装 ${PIP_SPEC}（含 torch，体积大；建议先完成引擎环境修复）`,
        );
        pipResult = await pipInstallViaMirrors(py, [PIP_SPEC], {
            onLog,
            mirrors,
            noDeps: false,
            upgrade: true,
            label: 'full',
        });
        tried.push(...(pipResult.tried || []));
        if (!pipResult.ok) {
            return {
                ok: false,
                error: pipResult.error || `pip 安装 OpenDecider 失败（已试：${tried.join(' → ')}）`,
                python: py.executable,
                pythonSource: py.source,
                reusedTorch: false,
                triedMirrors: tried,
            };
        }
    }

    const after = await getLocalLayaStatus(opts);
    if (!after.installed) {
        return {
            ok: false,
            error: 'pip 已结束，但仍检测不到 opendecider 模块',
            python: py.executable,
            pythonSource: py.source,
            reusedTorch: !!torch.reusable,
        };
    }
    if (opts.start === false) {
        return {
            ok: true,
            installed: true,
            message: torch.reusable
                ? `已安装 OpenDecider（复用 torch ${torch.version}）`
                : '已安装 OpenDecider',
            python: py.executable,
            pythonSource: py.source,
            reusedTorch: !!torch.reusable,
            torchVersion: torch.version || after.torchVersion,
        };
    }
    const started = await startLocalLaya(opts);
    return {
        ok: started.ok,
        installed: true,
        started: !!started.started || !!started.already,
        message: started.ok
            ? (started.message || (torch.reusable
                ? `已安装并启动 Laya（复用 torch ${torch.version}）`
                : '已安装并启动 Laya'))
            : '已安装，但启动失败（请确认模型管理中已下载 OpenDecider nano）',
        error: started.ok ? undefined : started.error,
        hint: started.hint,
        python: py.executable,
        pythonSource: py.source,
        reusedTorch: !!torch.reusable,
        torchVersion: torch.version || after.torchVersion,
        port: after.port,
        hfEndpoint: started.hfEndpoint,
        triedMirrors: tried,
    };
}

module.exports = {
    DEFAULT_SERVE_MODEL,
    DEFAULT_HF_MIRROR,
    PIP_SPEC,
    LAYA_NON_TORCH_DEPS,
    TORCH_MIN_VERSION,
    LAYA_MODEL_ID,
    getLocalLayaStatus,
    installLocalLaya,
    startLocalLaya,
    stopLocalLaya,
    resolvePython,
    resolveEnginePythonCandidate,
    emitLayaLog,
    listLayaPipMirrors,
    buildPipInstallArgs,
    resolveLayaHfEndpoint,
    serveScriptPath,
    isInsideAsar,
    asarUnpackedPath,
    torchMeetsMinimum,
    probeTorch,
    installOpendeciderFromBundledWheel,
    resolveServeModelPath,
    detectServeBootFatal,
};
