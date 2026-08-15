/**
 * Engine process stdout/stderr → file + UI log lines (dedupe / drop summary).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    normalizeEngineLogLine,
    shouldDropEngineLogLine,
} = require('./engine-log-filter');

/**
 * @param {{
 *   emitLine?: (payload: { line: string, source: string }, invokeSender: any) => void,
 *   openPath?: (p: string) => void,
 * }} [deps]
 */
function createEngineLogIo(deps = {}) {
    let logPathCached = '';
    let lineBuf = '';
    let lastKept = '';
    let repeatCount = 0;
    let lastDroppedKey = '';
    let droppedCount = 0;
    /** @type {string[]} */
    let writeQueue = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    let flushTimer = null;

    function getEngineLogPath() {
        if (logPathCached) return logPathCached;
        const root = process.env.LOCALAPPDATA
            || process.env.HOME
            || os.homedir()
            || process.cwd();
        logPathCached = path.join(root, 'TransubEngine', 'latest.log');
        return logPathCached;
    }

    function resetEngineLogFile() {
        try {
            const logPath = getEngineLogPath();
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.writeFileSync(
                logPath,
                `===== Transub Engine log ${new Date().toISOString()} =====\n`,
                'utf8',
            );
        } catch { /* ignore */ }
        lineBuf = '';
        lastKept = '';
        repeatCount = 0;
        lastDroppedKey = '';
        droppedCount = 0;
    }

    function flushEngineLogWriteQueue() {
        flushTimer = null;
        if (!writeQueue.length) return;
        const chunk = `${writeQueue.join('\n')}\n`;
        writeQueue = [];
        try {
            const logPath = getEngineLogPath();
            fs.mkdir(path.dirname(logPath), { recursive: true }, (mkdirErr) => {
                if (mkdirErr) return;
                fs.appendFile(logPath, chunk, 'utf8', () => { /* ignore */ });
            });
        } catch { /* ignore */ }
    }

    function appendEngineLogLineRaw(line, invokeSender = null) {
        const text = String(line ?? '').replace(/\r/g, '').trimEnd();
        if (!text) return;
        writeQueue.push(text);
        if (!flushTimer) {
            flushTimer = setTimeout(flushEngineLogWriteQueue, 200);
        }
        const payload = { line: text, source: 'engine' };
        if (typeof deps.emitLine === 'function') {
            deps.emitLine(payload, invokeSender);
        }
    }

    function flushDroppedEngineLogSummary(invokeSender = null) {
        if (droppedCount <= 0) return;
        const n = droppedCount;
        droppedCount = 0;
        lastDroppedKey = '';
        if (n >= 8) {
            appendEngineLogLineRaw(`[engine] （已省略 ${n} 条重复/进度噪音）`, invokeSender);
        }
    }

    function flushEngineLogRepeats(invokeSender = null) {
        if (repeatCount > 1 && lastKept) {
            appendEngineLogLineRaw(`[engine] （上条重复 ${repeatCount} 次）`, invokeSender);
        }
        repeatCount = lastKept ? 1 : 0;
    }

    function appendEngineLogLine(line, invokeSender = null) {
        const text = normalizeEngineLogLine(line);
        if (!text) return;

        if (shouldDropEngineLogLine(text)) {
            const key = text.slice(0, 120);
            if (key === lastDroppedKey) {
                droppedCount += 1;
            } else {
                flushDroppedEngineLogSummary(invokeSender);
                lastDroppedKey = key;
                droppedCount = 1;
            }
            return;
        }

        flushDroppedEngineLogSummary(invokeSender);

        if (text === lastKept) {
            repeatCount += 1;
            return;
        }
        flushEngineLogRepeats(invokeSender);
        lastKept = text;
        repeatCount = 1;
        appendEngineLogLineRaw(text, invokeSender);
    }

    function flushEngineLogChunk(chunk, invokeSender = null) {
        // tqdm often uses CR updates without newline — treat CR as line break.
        lineBuf += String(chunk || '').replace(/\r/g, '\n');
        const parts = lineBuf.split(/\n/);
        lineBuf = parts.pop() || '';
        for (const part of parts) {
            appendEngineLogLine(part, invokeSender);
        }
    }

    function attachEngineProcessLogs(proc) {
        if (!proc) return;
        lineBuf = '';
        lastKept = '';
        repeatCount = 0;
        lastDroppedKey = '';
        droppedCount = 0;
        const onData = (buf) => flushEngineLogChunk(buf, null);
        try {
            proc.stdout?.on('data', onData);
            proc.stderr?.on('data', onData);
            proc.on('exit', () => {
                if (lineBuf) {
                    appendEngineLogLine(lineBuf, null);
                    lineBuf = '';
                }
                flushDroppedEngineLogSummary(null);
                flushEngineLogRepeats(null);
            });
        } catch { /* ignore */ }
    }

    function openEngineLatestLog() {
        const logPath = getEngineLogPath();
        if (!fs.existsSync(logPath)) {
            return { ok: false, error: `未找到引擎日志：${logPath}` };
        }
        if (typeof deps.openPath === 'function') {
            deps.openPath(logPath);
        } else {
            try {
                const { shell } = require('electron');
                shell.openPath(logPath);
            } catch (err) {
                return { ok: false, error: err.message || String(err) };
            }
        }
        return { ok: true, path: logPath };
    }

    /** @internal test helpers */
    function _testGetState() {
        return {
            lineBuf,
            lastKept,
            repeatCount,
            lastDroppedKey,
            droppedCount,
            writeQueue: writeQueue.slice(),
        };
    }

    return {
        getEngineLogPath,
        resetEngineLogFile,
        flushDroppedEngineLogSummary,
        flushEngineLogRepeats,
        flushEngineLogWriteQueue,
        appendEngineLogLineRaw,
        appendEngineLogLine,
        flushEngineLogChunk,
        attachEngineProcessLogs,
        openEngineLatestLog,
        _testGetState,
    };
}

module.exports = {
    createEngineLogIo,
};
