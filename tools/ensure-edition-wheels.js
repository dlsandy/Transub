/**
 * Download first-install edition wheels into transub-engine/wheels-edition/
 * (CPU + CUDA). Does not build zips — use before packaging.
 *
 * Usage:
 *   node tools/ensure-edition-wheels.js
 *   node tools/ensure-edition-wheels.js --editions=cpu
 *   node tools/ensure-edition-wheels.js --check
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    EDITION_NAMES,
    ONNXRUNTIME_GPU_PIP,
    wheelsForEdition,
} = require('./win-edition-wheels');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'transub-engine', 'wheels-edition');
const PYTHON = path.join(ROOT, 'transub-engine', 'runtime', 'python.exe');
const checkOnly = process.argv.includes('--check');

function parseEditions() {
    const arg = process.argv.find((a) => a.startsWith('--editions='));
    if (!arg) return [...EDITION_NAMES];
    return arg.slice(11).split(',').map((s) => s.trim().toLowerCase()).filter((e) => EDITION_NAMES.includes(e));
}

function log(msg) {
    console.log(`[ensure-edition-wheels] ${msg}`);
}

async function downloadWheel(spec, destPath) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
        const mb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(1);
        log(`ok ${spec.fileName} (${mb} MB, cached)`);
        return { path: destPath, cached: true };
    }
    if (checkOnly) {
        throw new Error(`missing ${destPath}`);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const urls = [spec.mirrorUrl, spec.officialUrl].filter(Boolean);
    let lastErr = null;
    for (const url of urls) {
        try {
            log(`download ${spec.id} ← ${url}`);
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Transub-EditionWheels' },
                redirect: 'follow',
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const tmp = `${destPath}.part`;
            const fh = fs.openSync(tmp, 'w');
            try {
                if (!res.body || typeof res.body.getReader !== 'function') {
                    fs.writeSync(fh, Buffer.from(await res.arrayBuffer()));
                } else {
                    const reader = res.body.getReader();
                    let received = 0;
                    let lastLog = 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) {
                            fs.writeSync(fh, Buffer.from(value));
                            received += value.length;
                            if (received - lastLog > 50 * 1024 * 1024) {
                                log(`  … ${(received / (1024 * 1024)).toFixed(0)} MB`);
                                lastLog = received;
                            }
                        }
                    }
                }
            } finally {
                fs.closeSync(fh);
            }
            fs.renameSync(tmp, destPath);
            const mb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(1);
            log(`saved ${spec.fileName} (${mb} MB)`);
            return { path: destPath, cached: false };
        } catch (err) {
            lastErr = err;
            try { fs.unlinkSync(`${destPath}.part`); } catch { /* ignore */ }
            log(`retry next mirror (${err.message || err})`);
        }
    }
    throw new Error(`failed ${spec.fileName}: ${lastErr?.message || lastErr}`);
}

function pipDownload(specs, destDir) {
    if (!fs.existsSync(PYTHON)) {
        throw new Error(`missing engine python: ${PYTHON}`);
    }
    fs.mkdirSync(destDir, { recursive: true });
    const args = [
        '-m', 'pip', 'download',
        '--dest', destDir,
        '--only-binary=:all:',
        '-i', 'https://mirrors.aliyun.com/pypi/simple',
        '--trusted-host', 'mirrors.aliyun.com',
        ...specs,
    ];
    log(`pip download ${specs.join(' ')}`);
    const r = spawnSync(PYTHON, args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
    });
    if (r.status !== 0) {
        throw new Error(`pip download failed:\n${r.stderr || r.stdout || r.status}`);
    }
}

function hasMatchingWheel(dir, prefix) {
    if (!fs.existsSync(dir)) return false;
    const p = String(prefix || '').toLowerCase().replace(/-/g, '_');
    return fs.readdirSync(dir).some((n) => {
        const lower = n.toLowerCase();
        return lower.endsWith('.whl') && (
            lower.startsWith(`${p}-`)
            || lower.startsWith(`${prefix.toLowerCase()}-`)
        );
    });
}

async function ensureEdition(edition) {
    const dir = path.join(CACHE, edition);
    fs.mkdirSync(dir, { recursive: true });
    const wheels = wheelsForEdition(edition);
    for (const spec of wheels) {
        await downloadWheel(spec, path.join(dir, spec.fileName));
    }

    if (edition === 'cpu') {
        const extras = ['av>=10.0.0', 'scipy>=1.4.1', 'soundfile>=0.12.1', 'sentencepiece>=0.2.0', 'setuptools>=69'];
        const missing = extras.filter((spec) => {
            const name = spec.split(/[>=<!~]/)[0];
            return !hasMatchingWheel(dir, name);
        });
        if (missing.length) {
            if (checkOnly) throw new Error(`missing pip extras for cpu: ${missing.join(', ')}`);
            pipDownload(missing, dir);
        } else {
            log('cpu pip extras already cached');
        }
    }

    if (edition === 'cuda') {
        if (!hasMatchingWheel(dir, 'onnxruntime_gpu') && !hasMatchingWheel(dir, 'onnxruntime-gpu')) {
            if (checkOnly) throw new Error('missing onnxruntime-gpu wheel');
            pipDownload([ONNXRUNTIME_GPU_PIP], dir);
        } else {
            log('onnxruntime-gpu already cached');
        }
        if (!hasMatchingWheel(dir, 'av')) {
            if (checkOnly) throw new Error('missing av wheel for cuda');
            pipDownload(['av>=10.0.0'], dir);
        }
    }

    const files = fs.readdirSync(dir).filter((n) => /\.whl$/i.test(n));
    const bytes = files.reduce((sum, n) => sum + fs.statSync(path.join(dir, n)).size, 0);
    log(`${edition}: ${files.length} wheels, ${(bytes / (1024 * 1024)).toFixed(1)} MB`);
    return { edition, count: files.length, bytes };
}

async function main() {
    const editions = parseEditions();
    if (!editions.length) throw new Error('no editions selected');
    fs.mkdirSync(CACHE, { recursive: true });
    const results = [];
    for (const edition of editions) {
        results.push(await ensureEdition(edition));
    }
    log('done');
    for (const r of results) {
        log(`  ${r.edition}: ${r.count} files / ${(r.bytes / (1024 * 1024)).toFixed(1)} MB`);
    }
}

main().catch((err) => {
    console.error(`[ensure-edition-wheels] ${err.stack || err.message || err}`);
    process.exit(1);
});
