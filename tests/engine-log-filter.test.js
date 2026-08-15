/**
 * Unit checks for electron/engine-log-filter.js
 */
const assert = require('assert');
const path = require('path');
const {
    shouldDropEngineLogLine,
    friendlyEngineError,
    ENGINE_LOG_DROP_PATTERNS,
} = require('../electron/engine-log-filter');

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

    it('exposes drop patterns and friendly errors', () => {
        assert.ok(Array.isArray(ENGINE_LOG_DROP_PATTERNS) && ENGINE_LOG_DROP_PATTERNS.length > 5);
        assert.ok(friendlyEngineError('').includes('失败'));
        assert.ok(friendlyEngineError('aborted').includes('中止'));
        const bridgePath = path.join(__dirname, '..', 'electron', 'engine-bridge.js');
        const source = require('fs').readFileSync(bridgePath, 'utf8');
        assert.ok(source.includes("require('./engine-log-filter')"));
        assert.ok(source.includes('shouldDropEngineLogLine'));
        assert.ok(source.includes('flushEngineLogRepeats'));
    });

    it('friendly MT-missing message keeps clean model id', () => {
        const raw = '未安装翻译模型 opus-mt-ja-zh（语种 ja）。请在「设置 → 环境 / 模型」下载后再开始生成。';
        const out = friendlyEngineError(raw);
        assert.ok(out.includes('opus-mt-ja-zh'));
        assert.ok(!out.includes('opus-mt-ja-zh（语种'));
        assert.ok(!out.includes('原始错误'));
        assert.ok(out.includes('*.src.partial'));
    });
});
