/**
 * Local ASR / engine diagnostics pack (privacy-friendly; no cloud upload).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function safeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch (err) {
        return JSON.stringify({ error: String(err?.message || err) });
    }
}

function redactOptions(options = {}) {
    const src = options && typeof options === 'object' ? options : {};
    const out = { ...src };
    for (const key of Object.keys(out)) {
        if (/token|password|secret|apiKey|authorization/i.test(key)) {
            out[key] = '[redacted]';
        }
    }
    return out;
}

/**
 * @param {object} input
 * @param {string} [input.outDir]
 * @param {object} [input.options]
 * @param {string} [input.jobId]
 * @param {string} [input.mediaPath]
 * @param {object} [input.checkpoint]
 * @param {object} [input.domainFixTrace]
 * @param {object} [input.cueStats]
 * @param {string[]} [input.logLines]
 * @param {string} [input.engineLogPath]
 * @param {string} [input.d01Version]
 * @param {object} [input.extra]
 */
function buildDiagnosticsPayload(input = {}) {
    const now = new Date();
    return {
        version: 1,
        exportedAt: now.toISOString(),
        host: {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            tmpdir: os.tmpdir(),
        },
        jobId: input.jobId || '',
        mediaPath: input.mediaPath ? path.basename(String(input.mediaPath)) : '',
        mediaDir: input.mediaPath ? path.dirname(String(input.mediaPath)) : '',
        options: redactOptions(input.options || {}),
        checkpoint: input.checkpoint || null,
        domainFixTrace: input.domainFixTrace || null,
        cueStats: input.cueStats || null,
        d01Version: input.d01Version || '',
        logTail: Array.isArray(input.logLines) ? input.logLines.slice(-200) : [],
        engineLogPath: input.engineLogPath || '',
        extra: input.extra || null,
    };
}

/**
 * Write diagnostics JSON (+ optional log copy) under outDir.
 * @returns {{ ok: boolean, dir?: string, manifestPath?: string, error?: string }}
 */
function exportAsrDiagnosticsPack(input = {}) {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = String(input.outDir || '').trim()
            || path.join(os.tmpdir(), 'transub-asr-diagnostics');
        const dir = path.join(base, `asr-diag-${stamp}`);
        fs.mkdirSync(dir, { recursive: true });
        const payload = buildDiagnosticsPayload(input);
        const manifestPath = path.join(dir, 'manifest.json');
        fs.writeFileSync(manifestPath, safeJson(payload), 'utf8');
        if (input.engineLogPath && fs.existsSync(input.engineLogPath)) {
            try {
                const raw = fs.readFileSync(input.engineLogPath, 'utf8');
                const tail = raw.slice(-120000);
                fs.writeFileSync(path.join(dir, 'engine-log-tail.txt'), tail, 'utf8');
            } catch { /* ignore */ }
        }
        if (Array.isArray(input.logLines) && input.logLines.length) {
            fs.writeFileSync(
                path.join(dir, 'ui-log-tail.txt'),
                input.logLines.slice(-200).join('\n'),
                'utf8',
            );
        }
        return { ok: true, dir, manifestPath };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

module.exports = {
    redactOptions,
    buildDiagnosticsPayload,
    exportAsrDiagnosticsPack,
};
