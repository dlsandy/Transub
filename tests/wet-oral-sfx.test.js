/**
 * av_soft wet/suck oral SFX cleanup (engine cue_cleanup + mt-sanitize).
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const sanitize = require('../src/js/mt-sanitize-core');

const RUNTIME_PY = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 60000,
        env: {
            ...process.env,
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8',
        },
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('wet oral SFX cleanup', () => {
    it('engine drops wet SFX cues and keeps moans', function () {
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.cue_cleanup import clean_cue_text
cases = {
  'wet': clean_cue_text('…ちゅっ、ちゅっ、ちゅぱっ、ちゅっ', ja_av=True),
  'gokkun': clean_cue_text('…ごくっ、ごくっ…ごくっ、ごくっ…', ja_av=True),
  'mixed': clean_cue_text('ふぅ…ちゅっ…はぁ…', ja_av=True),
  'moan': clean_cue_text('はぁ…はぁ…た…ぁ…はぁ…', ja_av=True),
  'kiss': clean_cue_text('ちゅうして', ja_av=True),
  'jyuru': clean_cue_text('んじゅっ、じゅるっ、じゅるっ、じゅるるるっ!', ja_av=True),
  'churu': clean_cue_text('はあっ、はあっ…すごいよ、ちゅるるっ', ja_av=True),
  'jubo': clean_cue_text('んぅ…っ、ずぢゅぼぢゅぼっ、んぢゅぅ!', ja_av=True),
  'growl': clean_cue_text('グルルル…', ja_av=True),
}
print(json.dumps(cases, ensure_ascii=False))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.wet, '');
        assert.strictEqual(j.gokkun, '');
        assert.strictEqual(j.jyuru, '');
        assert.ok(!j.mixed.includes('ちゅ'));
        assert.ok(j.mixed.includes('ふぅ') && j.mixed.includes('はぁ'));
        assert.ok(j.moan.includes('はぁ'));
        assert.strictEqual(j.kiss, 'ちゅうして');
        assert.ok(j.churu.includes('すごい'));
        assert.ok(!j.churu.includes('ちゅ'));
        assert.ok(!j.jubo.includes('ぢゅ'));
        assert.ok(j.jubo.includes('ん') || j.jubo === '');
        assert.strictEqual(j.growl, '');
    });

    it('sanitize strips ZH wet SFX atoms', () => {
        const a = sanitize.stripWetOralSfxFromZh('要不然…啊…啾！');
        assert.ok(a.changed);
        assert.ok(!/啾/.test(a.text));
        assert.ok(a.text.includes('啊'));

        const b = sanitize.stripWetOralSfxFromZh('哈…哈');
        assert.strictEqual(b.changed, false);

        assert.strictEqual(sanitize.isWetOralSfxOnlyZh('咕咚'), true);
        assert.strictEqual(sanitize.isWetOralSfxOnlyZh('哈啊'), false);
    });
});
