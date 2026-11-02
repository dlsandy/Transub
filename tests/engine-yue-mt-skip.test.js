/**
 * Engine must not treat Yue/Cantonese as "already Chinese" and skip MT.
 * Regression: yue→zh-Hans copied ASR Cantonese into the target SRT.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUNTIME_PY = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    'python.exe',
);

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    const text = String(res.stdout || '').trim();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
            return JSON.parse(lines[i]);
        } catch { /* keep looking */ }
    }
    throw new Error(`no JSON in python stdout: ${text.slice(0, 400)}`);
}

describe('engine yue→zh must not skip MT', () => {
    it('only skips Mandarin→Chinese, not Yue/Cantonese→Chinese', function () {
        if (process.platform !== 'win32') this.skip();
        if (!fs.existsSync(RUNTIME_PY)) this.skip();
        const out = runPy(`
import json
from transub_engine.jobs import (
    _is_chinese_lang,
    _is_mandarin_chinese_lang,
    _should_skip_mt_same_chinese,
)
print(json.dumps({
    'yue_is_chinese_family': _is_chinese_lang('yue'),
    'yue_is_mandarin': _is_mandarin_chinese_lang('yue'),
    'skip_zh_zhHans': _should_skip_mt_same_chinese('zh', 'zh-Hans'),
    'skip_yue_zh': _should_skip_mt_same_chinese('yue', 'zh'),
    'skip_yue_zhHans': _should_skip_mt_same_chinese('yue', 'zh-Hans'),
    'skip_cantonese_zhHant': _should_skip_mt_same_chinese('cantonese', 'zh-Hant'),
    'skip_zh_en': _should_skip_mt_same_chinese('zh', 'en'),
    'skip_yue_en': _should_skip_mt_same_chinese('yue', 'en'),
}))
`);
        assert.strictEqual(out.yue_is_chinese_family, true);
        assert.strictEqual(out.yue_is_mandarin, false);
        assert.strictEqual(out.skip_zh_zhHans, true);
        assert.strictEqual(out.skip_yue_zh, false);
        assert.strictEqual(out.skip_yue_zhHans, false);
        assert.strictEqual(out.skip_cantonese_zhHant, false);
        assert.strictEqual(out.skip_zh_en, false);
        assert.strictEqual(out.skip_yue_en, false);
    });
});
