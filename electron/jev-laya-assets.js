/**
 * Bundled OpenDecider wheel + managed Laya model helpers.
 * Keeps install/start off PyPI for the package and off ad-hoc Hub pulls for weights.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LAYA_MODEL_ID = 'opendecider-nano';
const LAYA_MODEL_KIND = 'decision';
const LAYA_HUB_ID = 'manjunathshiva/opendecider-nano';

/**
 * @param {string} [engineInstallPath]
 * @returns {string}
 */
function resolveBundledWheelsDir(engineInstallPath = '') {
    const root = String(engineInstallPath || '').trim();
    if (root) {
        const beside = path.join(path.resolve(root), 'wheels');
        if (fs.existsSync(beside)) return beside;
    }
    // Dev / packaged: electron/ → ../transub-engine/wheels
    const bundled = path.join(__dirname, '..', 'transub-engine', 'wheels');
    if (fs.existsSync(bundled)) return bundled;
    return '';
}

/**
 * @param {string} [wheelsDir]
 * @returns {string} absolute path to opendecider-*.whl or ''
 */
function findBundledOpendeciderWheel(wheelsDir = '') {
    const dir = String(wheelsDir || '').trim() || resolveBundledWheelsDir();
    if (!dir || !fs.existsSync(dir)) return '';
    let names = [];
    try {
        names = fs.readdirSync(dir).filter((n) => /^opendecider-.*\.whl$/i.test(n));
    } catch {
        return '';
    }
    if (!names.length) return '';
    names.sort((a, b) => String(b).localeCompare(String(a), 'en'));
    return path.join(dir, names[0]);
}

/**
 * @param {string} [engineInstallPath]
 * @returns {string}
 */
function resolveLayaModelLocalPath(engineInstallPath = '') {
    try {
        const { getEngineModelsRoot } = require('./engine-download-info');
        const root = getEngineModelsRoot(engineInstallPath);
        return path.join(root, LAYA_MODEL_KIND, LAYA_MODEL_ID);
    } catch {
        return '';
    }
}

/**
 * @param {string} modelDir
 * @returns {boolean}
 */
function isLayaModelDirReady(modelDir) {
    const dir = String(modelDir || '').trim();
    if (!dir || !fs.existsSync(dir)) return false;
    const weight = path.join(dir, 'model.safetensors');
    const marker = path.join(dir, 'opendecider.json');
    try {
        if (!fs.existsSync(marker)) return false;
        if (!fs.existsSync(weight)) return false;
        return fs.statSync(weight).size > 1024 * 1024;
    } catch {
        return false;
    }
}

/**
 * Download via engine `download_models` (same path as 模型管理).
 * @param {{
 *   pythonExecutable: string,
 *   pythonPrefix?: string[],
 *   engineInstallPath?: string,
 *   hfEndpoint?: string,
 *   onLog?: (line: string) => void,
 *   timeoutMs?: number,
 * }} opts
 */
async function ensureLayaModelDownloaded(opts = {}) {
    const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
    const log = (msg) => {
        if (onLog) onLog(String(msg || ''));
    };
    const engineInstallPath = String(opts.engineInstallPath || '').trim();
    const localPath = resolveLayaModelLocalPath(engineInstallPath);
    if (localPath && isLayaModelDirReady(localPath)) {
        log(`Laya 模型已就绪：${localPath}`);
        return { ok: true, already: true, path: localPath, modelId: LAYA_MODEL_ID };
    }

    const exe = String(opts.pythonExecutable || '').trim();
    if (!exe || !fs.existsSync(exe)) {
        return { ok: false, error: '缺少引擎 Python，无法下载 Laya 模型' };
    }
    const prefix = Array.isArray(opts.pythonPrefix) ? opts.pythonPrefix : [];
    const hf = String(opts.hfEndpoint || '').trim();
    const timeoutMs = Math.max(60_000, Number(opts.timeoutMs) || 30 * 60 * 1000);

    log(`正在经模型管理下载 ${LAYA_MODEL_ID}（约 0.8GB）…`);
    const pyCode = [
        'import json, os, sys',
        'engine_home = sys.argv[1]',
        'hf = sys.argv[2]',
        'mid = sys.argv[3]',
        'if engine_home:',
        '    os.environ["TRANSUB_ENGINE_HOME"] = engine_home',
        '    os.environ["TRANSUB_ENGINE_ROOT"] = engine_home',
        'from transub_engine.download import download_models, is_model_installed, model_local_path',
        'def on_progress(ev):',
        '    try:',
        '        print("PROGRESS|" + json.dumps(ev, ensure_ascii=False), flush=True)',
        '    except Exception:',
        '        pass',
        'if is_model_installed(mid):',
        '    print("DONE|" + json.dumps({"ok": True, "already": True, "path": str(model_local_path(mid))}, ensure_ascii=False), flush=True)',
        '    raise SystemExit(0)',
        'res = download_models(model_ids=[mid], hf_endpoint=hf or None, force=False, on_progress=on_progress)',
        'path = str(model_local_path(mid))',
        'ok = bool(res.get("ok", True)) and is_model_installed(mid)',
        'print("DONE|" + json.dumps({"ok": ok, "path": path, "result": res}, ensure_ascii=False), flush=True)',
        'raise SystemExit(0 if ok else 2)',
    ].join('\n');

    const args = [
        ...prefix,
        '-c', pyCode,
        engineInstallPath || '',
        hf,
        LAYA_MODEL_ID,
    ];

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        const child = spawn(exe, args, {
            windowsHide: true,
            env: {
                ...process.env,
                PYTHONUTF8: '1',
                PYTHONUNBUFFERED: '1',
                ...(engineInstallPath
                    ? {
                        TRANSUB_ENGINE_HOME: engineInstallPath,
                        TRANSUB_ENGINE_ROOT: engineInstallPath,
                    }
                    : {}),
                ...(hf ? { HF_ENDPOINT: hf } : {}),
            },
        });
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { child.kill(); } catch { /* ignore */ }
            resolve({ ok: false, error: `下载 Laya 模型超时（>${Math.round(timeoutMs / 60000)} 分钟）` });
        }, timeoutMs);

        const handleLine = (line) => {
            const text = String(line || '').trim();
            if (!text) return;
            if (text.startsWith('PROGRESS|')) {
                try {
                    const ev = JSON.parse(text.slice('PROGRESS|'.length));
                    const detail = String(ev.detail || ev.message || '').trim();
                    const pct = Number(ev.percent);
                    if (detail) {
                        log(Number.isFinite(pct) ? `${detail}（${pct}%）` : detail);
                    }
                } catch {
                    log(text);
                }
                return;
            }
            if (text.startsWith('DONE|')) {
                try {
                    const done = JSON.parse(text.slice('DONE|'.length));
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve({
                            ok: !!done.ok,
                            already: !!done.already,
                            path: String(done.path || localPath || ''),
                            modelId: LAYA_MODEL_ID,
                            error: done.ok ? '' : '模型下载未完成',
                        });
                    }
                } catch (err) {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve({ ok: false, error: err?.message || String(err) });
                    }
                }
                return;
            }
            log(text.slice(0, 280));
        };

        child.stdout.on('data', (buf) => {
            stdout += String(buf || '');
            const parts = stdout.split(/\r?\n/);
            stdout = parts.pop() || '';
            for (const line of parts) handleLine(line);
        });
        child.stderr.on('data', (buf) => {
            stderr += String(buf || '');
            const parts = stderr.split(/\r?\n/);
            stderr = parts.pop() || '';
            for (const line of parts) {
                if (line.trim()) log(line.trim().slice(0, 280));
            }
        });
        child.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: err?.message || String(err) });
        });
        child.on('close', (code) => {
            if (stdout) handleLine(stdout);
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const readyPath = resolveLayaModelLocalPath(engineInstallPath);
            if (code === 0 && isLayaModelDirReady(readyPath)) {
                resolve({ ok: true, path: readyPath, modelId: LAYA_MODEL_ID });
                return;
            }
            resolve({
                ok: false,
                error: `模型下载失败（exit ${code}）。也可在「模型管理」中手动下载 OpenDecider nano（Laya）。`,
            });
        });
    });
}

module.exports = {
    LAYA_MODEL_ID,
    LAYA_MODEL_KIND,
    LAYA_HUB_ID,
    resolveBundledWheelsDir,
    findBundledOpendeciderWheel,
    resolveLayaModelLocalPath,
    isLayaModelDirReady,
    ensureLayaModelDownloaded,
};
