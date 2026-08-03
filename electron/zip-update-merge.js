/**
 * Zip / win-unpacked in-place update helpers.
 * Preserve on-disk engine models, Advanced LLM downloads, and optional GPU/Demucs
 * site-packages across shell replace. Base Python runtime / app shell may update.
 */
const fs = require('fs');
const path = require('path');

/** Site-package name prefixes excluded from shipping (see package.json extraFiles) — keep if present.
 * Also keep small ASR/MT transitive deps (numpy/av/…) so zip updates do not wipe them while
 * preserving faster_whisper / ctranslate2 (which would then fail with "No module named numpy").
 */
const PRESERVE_SITE_PACKAGE_RE = [
    /^nvidia([_.-]|$)/i,
    /^torch$/i,
    /^torch-/i,
    /^torch\.libs$/i,
    /^torchaudio([_.-]|$)/i,
    /^torchvision([_.-]|$)/i,
    /^onnxruntime([_.-]|$)/i,
    /^ctranslate2([_.-]|$)/i,
    /^faster_whisper([_.-]|$)/i,
    /^whisper$/i,
    /^whisper-/i,
    /^openai_whisper([_.-]|$)/i,
    /^demucs([_.-]|$)/i,
    /^numpy([_.-]|$)/i,
    /^av$/i,
    /^av-/i,
    /^av\.libs$/i,
    /^numba([_.-]|$)/i,
    /^llvmlite([_.-]|$)/i,
    /^scipy([_.-]|$)/i,
    /^scipy\.libs$/i,
    /^jieba([_.-]|$)/i,
    /^librosa([_.-]|$)/i,
    /^soundfile([_.-]|$)/i,
    /^sklearn([_.-]|$)/i,
    /^scikit_learn([_.-]|$)/i,
    /^scikit-learn([_.-]|$)/i,
    /^sympy([_.-]|$)/i,
    /^modelscope([_.-]|$)/i,
    /^transformers([_.-]|$)/i,
    /^tokenizers([_.-]|$)/i,
    /^onnx([_.-]|$)/i,
    /^sentencepiece([_.-]|$)/i,
    /^funasr([_.-]|$)/i,
];

const SITE_PACKAGE_REL_ROOTS = [
    path.join('transub-engine', 'runtime', 'Lib', 'site-packages'),
    path.join('transub-engine', 'runtime', 'lib', 'site-packages'),
    path.join('transub-engine', '.venv', 'Lib', 'site-packages'),
    path.join('transub-engine', '.venv', 'lib', 'site-packages'),
    path.join('transub-engine', 'venv', 'Lib', 'site-packages'),
    path.join('transub-engine', 'venv', 'lib', 'site-packages'),
];

/** Top-level dirs under install root that hold user downloads / local data (not the app shell). */
const PRESERVE_TOP_LEVEL_DIRS = [
    'advanced-llm',
    'advanced-modules',
    'backup',
    'subtitles',
    'temp',
    'tdp',
    'transwithai-config',
];

const PRESERVE_SUFFIX = '.__ts_preserve__';

function shouldPreserveSitePackageName(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    return PRESERVE_SITE_PACKAGE_RE.some((re) => re.test(n));
}

function uniqRelPaths(paths) {
    const seen = new Set();
    const out = [];
    for (const rel of paths) {
        if (!rel) continue;
        const key = process.platform === 'win32' ? String(rel).toLowerCase() : String(rel);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rel);
    }
    return out;
}

/**
 * Relative paths (from install root) that must survive a zip replace.
 * @param {string} installRoot
 * @returns {string[]}
 */
function collectPreserveRelPaths(installRoot) {
    const root = path.resolve(String(installRoot || ''));
    const found = [];
    if (!root || !fs.existsSync(root)) return found;

    const modelsRel = path.join('transub-engine', 'models');
    if (fs.existsSync(path.join(root, modelsRel))) {
        found.push(modelsRel);
    }

    // Note: transub-engine/wheels is intentionally NOT preserved as a whole.
    // Bundled .whl names may need to refresh with the app; user-added wheels with
    // unique filenames survive zip overlay (copy does not delete install-only files).

    for (const dirName of PRESERVE_TOP_LEVEL_DIRS) {
        if (fs.existsSync(path.join(root, dirName))) {
            found.push(dirName);
        }
    }

    for (const siteRel of SITE_PACKAGE_REL_ROOTS) {
        const siteAbs = path.join(root, siteRel);
        if (!fs.existsSync(siteAbs)) continue;
        let entries;
        try {
            entries = fs.readdirSync(siteAbs, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            if (!shouldPreserveSitePackageName(ent.name)) continue;
            found.push(path.join(siteRel, ent.name));
        }
    }

    return uniqRelPaths(found);
}

function findPackageRoot(extractDir) {
    const root = path.resolve(String(extractDir || ''));
    if (!root || !fs.existsSync(root)) {
        throw new Error('解压目录不存在');
    }
    if (fs.existsSync(path.join(root, 'Transub.exe'))) return root;
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (err) {
        throw new Error(`无法读取解压目录: ${err.message || err}`);
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const candidate = path.join(root, ent.name);
        if (fs.existsSync(path.join(candidate, 'Transub.exe'))) return candidate;
    }
    throw new Error('解压后未找到 Transub.exe');
}

function sleepSync(ms) {
    const end = Date.now() + Math.max(0, ms);
    while (Date.now() < end) {
        /* busy wait for short lock retries */
    }
}

function rimrafSafe(target, { retries = 8 } = {}) {
    if (!target) return { ok: true, skipped: true };
    const abs = path.resolve(String(target));
    if (!fs.existsSync(abs)) return { ok: true, skipped: true };

    let lastErr = null;
    for (let i = 0; i < retries; i += 1) {
        try {
            fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
            if (!fs.existsSync(abs)) return { ok: true };
        } catch (err) {
            lastErr = err;
        }
        try {
            if (fs.existsSync(abs)) {
                const renamed = `${abs}.trash-${Date.now()}-${i}`;
                fs.renameSync(abs, renamed);
                try {
                    fs.rmSync(renamed, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
                } catch {
                    /* leave trash for OS */
                }
                if (!fs.existsSync(abs)) return { ok: true, renamed: true };
            } else {
                return { ok: true };
            }
        } catch (err) {
            lastErr = err;
        }
        sleepSync(60 * (i + 1));
    }
    return {
        ok: !fs.existsSync(abs),
        error: lastErr ? (lastErr.message || String(lastErr)) : 'ENOTEMPTY',
    };
}

function renameAside(absPath) {
    const aside = `${absPath}${PRESERVE_SUFFIX}`;
    if (fs.existsSync(aside)) {
        rimrafSafe(aside);
    }
    fs.renameSync(absPath, aside);
    return aside;
}

function restoreAside(absPath) {
    const aside = `${absPath}${PRESERVE_SUFFIX}`;
    if (!fs.existsSync(aside)) return false;
    if (fs.existsSync(absPath)) {
        rimrafSafe(absPath);
    }
    fs.renameSync(aside, absPath);
    return true;
}

function countFilesRecursive(rootDir) {
    const root = path.resolve(rootDir);
    let count = 0;
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) stack.push(full);
            else if (ent.isFile()) count += 1;
        }
    }
    return count;
}

/**
 * Copy package tree into install root (files + dirs). Does not follow preserve logic —
 * call {@link applyZipUpdateMerge} which renames preserves aside first.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {{ onProgress?: (info: { copied: number, total: number }) => void }} [opts]
 */
function copyTreeOverwrite(srcDir, destDir, opts = {}) {
    const srcRoot = path.resolve(srcDir);
    const destRoot = path.resolve(destDir);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    fs.mkdirSync(destRoot, { recursive: true });

    const total = Math.max(1, countFilesRecursive(srcRoot));
    let copied = 0;
    let lastEmitCount = 0;
    let lastEmitAt = 0;

    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        const from = rel ? path.join(srcRoot, rel) : srcRoot;
        const to = rel ? path.join(destRoot, rel) : destRoot;
        let entries;
        try {
            entries = fs.readdirSync(from, { withFileTypes: true });
        } catch (err) {
            throw new Error(`读取更新包失败: ${from} (${err.message || err})`);
        }
        for (const ent of entries) {
            const childRel = rel ? path.join(rel, ent.name) : ent.name;
            const childFrom = path.join(from, ent.name);
            const childTo = path.join(to, ent.name);
            if (ent.isDirectory()) {
                fs.mkdirSync(childTo, { recursive: true });
                stack.push(childRel);
                continue;
            }
            if (!ent.isFile()) continue;
            fs.mkdirSync(path.dirname(childTo), { recursive: true });
            fs.copyFileSync(childFrom, childTo);
            copied += 1;
            const now = Date.now();
            if (onProgress && (
                copied === total
                || copied - lastEmitCount >= 25
                || now - lastEmitAt >= 400
            )) {
                lastEmitCount = copied;
                lastEmitAt = now;
                try { onProgress({ copied, total }); } catch { /* ignore */ }
            }
        }
    }
    if (onProgress) {
        try { onProgress({ copied: total, total }); } catch { /* ignore */ }
    }
}

/**
 * Replace install root contents from extracted package, preserving listed relative paths
 * via rename-aside (no multi-GB copy).
 * @param {{
 *   installRoot: string,
 *   packageRoot: string,
 *   preserveRelPaths?: string[],
 *   allowPartial?: boolean,
 *   onProgress?: (info: { phase: string, message: string, percent: number }) => void,
 * }} opts
 */
function applyZipUpdateMerge(opts = {}) {
    const installRoot = path.resolve(String(opts.installRoot || ''));
    const packageRoot = path.resolve(String(opts.packageRoot || ''));
    const allowPartial = Boolean(opts.allowPartial);
    const report = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const emit = (phase, message, percent) => {
        if (!report) return;
        try { report({ phase, message, percent }); } catch { /* ignore */ }
    };

    if (!installRoot || !fs.existsSync(installRoot)) {
        throw new Error('安装目录无效');
    }
    if (!packageRoot || !fs.existsSync(packageRoot)) {
        throw new Error('更新包目录无效');
    }
    if (!allowPartial && !fs.existsSync(path.join(packageRoot, 'Transub.exe'))) {
        throw new Error('更新包缺少 Transub.exe');
    }

    emit('preparing', '正在扫描需保留的模型与支持库…', 8);

    // Union caller snapshot with a fresh scan so packages installed after download
    // (or missed by a stale list) are still preserved.
    const fromOpts = Array.isArray(opts.preserveRelPaths) ? opts.preserveRelPaths : [];
    const preserveRelPaths = uniqRelPaths([
        ...fromOpts,
        ...collectPreserveRelPaths(installRoot),
    ]);

    const asides = [];
    const preserveTotal = Math.max(1, preserveRelPaths.length);
    for (let i = 0; i < preserveRelPaths.length; i++) {
        const rel = preserveRelPaths[i];
        const abs = path.join(installRoot, rel);
        if (!fs.existsSync(abs)) continue;
        emit(
            'preserving',
            `正在暂存保留数据（${i + 1}/${preserveTotal}）…`,
            10 + Math.round((i / preserveTotal) * 18),
        );
        try {
            asides.push({ rel, abs, aside: renameAside(abs) });
        } catch (err) {
            // Roll back successful asides
            for (const done of asides.reverse()) {
                try { restoreAside(done.abs); } catch { /* ignore */ }
            }
            throw new Error(`无法暂存保留目录 ${rel}: ${err.message || err}`);
        }
    }

    emit('copying', '正在替换程序文件，请耐心等待…', 30);
    try {
        copyTreeOverwrite(packageRoot, installRoot, {
            onProgress: ({ copied, total }) => {
                const ratio = total > 0 ? copied / total : 1;
                emit(
                    'copying',
                    `正在替换程序文件（${copied}/${total}）…`,
                    30 + Math.round(ratio * 50),
                );
            },
        });
    } catch (err) {
        for (const done of asides.reverse()) {
            try { restoreAside(done.abs); } catch { /* ignore */ }
        }
        throw err;
    }

    const restoreTotal = Math.max(1, asides.length);
    for (let i = 0; i < asides.length; i++) {
        const item = asides[i];
        emit(
            'restoring',
            `正在恢复保留数据（${i + 1}/${restoreTotal}）…`,
            82 + Math.round((i / restoreTotal) * 12),
        );
        try {
            restoreAside(item.abs);
        } catch (err) {
            throw new Error(`恢复保留目录失败 ${item.rel}: ${err.message || err}`);
        }
    }

    emit('restoring', '文件替换完成', 95);

    return {
        ok: true,
        preserved: asides.map((a) => a.rel),
    };
}

module.exports = {
    PRESERVE_SUFFIX,
    PRESERVE_TOP_LEVEL_DIRS,
    shouldPreserveSitePackageName,
    collectPreserveRelPaths,
    findPackageRoot,
    applyZipUpdateMerge,
    copyTreeOverwrite,
    rimrafSafe,
};
