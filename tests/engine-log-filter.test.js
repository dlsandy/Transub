/**
 * Unit-ish checks for engine log noise filtering (no Electron runtime needed).
 * Patterns mirrored from electron/engine-bridge.js — keep in sync.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ENGINE_LOG_DROP_PATTERNS = [
    /^\s*\d+%\|/,
    /rtf_avg:/i,
    /\{'load_data':/,
    /Both `max_new_tokens`/,
    /Token indices sequence length is longer/,
    /Recommended: pip install sacremoses/,
    /Loading weights:\s+\d+%/,
    /Notice: ffmpeg is not installed/i,
    /download models from model hub/i,
    /trust_remote_code:/i,
    /scope_map:/i,
    /excludes:/i,
    /Loading ckpt:/i,
    /Loading pretrained params from/i,
    /Building VAD model/i,
    /funasr version:/i,
    /INFO:\s+\S+\s+-\s+"GET \/v1\/(?:jobs|health|capabilities)/i,
    /WARNING:.*max_new_tokens/i,
];

function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences from engine logs
    return String(text || '').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

function normalizeEngineLogLine(line) {
    return stripAnsi(line).replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function shouldDropEngineLogLine(line) {
    const text = normalizeEngineLogLine(line);
    if (!text) return true;
    if (!/[A-Za-z\u4e00-\u9fff]/.test(text) && /[|.\d%-]+/.test(text) && text.length < 80) {
        return true;
    }
    return ENGINE_LOG_DROP_PATTERNS.some((re) => re.test(text));
}

describe('engine-log-filter', () => {
    it('drops tqdm / rtf / transformers noise', () => {
        assert.strictEqual(shouldDropEngineLogLine('100%|████| 1/1 [00:01<00:00, 1.2s/it]'), true);
        assert.strictEqual(shouldDropEngineLogLine('rtf_avg: 0.028: 100%|██| 1/1'), true);
        assert.strictEqual(
            shouldDropEngineLogLine(
                '[transformers] Both `max_new_tokens` (=256) and `max_length`(=512) seem to have been set.',
            ),
            true,
        );
    });

    it('drops health/jobs access logs', () => {
        assert.strictEqual(
            shouldDropEngineLogLine('INFO:     127.0.0.1:12095 - "GET /v1/jobs/a37cc8fd7ea9 HTTP/1.1" 200 OK'),
            true,
        );
        assert.strictEqual(
            shouldDropEngineLogLine('INFO:     127.0.0.1:12095 - "GET /v1/health HTTP/1.1" 200 OK'),
            true,
        );
    });

    it('keeps meaningful engine / traceback lines', () => {
        assert.strictEqual(
            shouldDropEngineLogLine('[engine] #1/1 翻译 FPRE-236.mp4 · 翻译 100/517'),
            false,
        );
        assert.strictEqual(
            shouldDropEngineLogLine('[engine] #1/1 translate FPRE-236.mp4 · 翻译 100/517'),
            false,
        );
        assert.strictEqual(shouldDropEngineLogLine('[engine] 开始批次 · 1 个文件'), false);
        assert.strictEqual(shouldDropEngineLogLine('[engine] batch start · 1 file(s)'), false);
        assert.strictEqual(shouldDropEngineLogLine('Traceback (most recent call last):'), false);
    });

    it('keeps filter symbols present in engine-bridge source', () => {
        const bridgePath = path.join(__dirname, '..', 'electron', 'engine-bridge.js');
        const source = fs.readFileSync(bridgePath, 'utf8');
        assert.ok(source.includes('ENGINE_LOG_DROP_PATTERNS'));
        assert.ok(source.includes('shouldDropEngineLogLine'));
        assert.ok(source.includes('flushEngineLogRepeats'));
    });
});
