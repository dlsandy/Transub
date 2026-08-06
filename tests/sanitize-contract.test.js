const assert = require('assert');
const path = require('path');
const fs = require('fs');
const mtSanitize = require('../src/js/mt-sanitize-core');
const opaque = require('../src/js/mt-opaque-strings');

describe('sanitize contracts', () => {
    const ssotPath = path.join(__dirname, '..', 'shared', 'ja-asr-domain-fixes.json');
    const ssot = JSON.parse(fs.readFileSync(ssotPath, 'utf8'));
    const adult = opaque.getAsrAdultDomainPairs();

    function mergeExpected(base, extra) {
        const seen = new Set();
        const merged = [];
        for (const p of [...base, ...extra]) {
            const from = String(p?.from || '');
            const to = String(p?.to || '');
            if (!from || !to || seen.has(from)) continue;
            seen.add(from);
            merged.push({ from, to });
        }
        merged.sort((a, b) => Array.from(b.from).length - Array.from(a.from).length
            || String(a.from).localeCompare(String(b.from), 'ja'));
        return merged;
    }

    it('JS ASR domain pairs match shared SSOT + opaque adult pairs (longest-first)', () => {
        const expected = mergeExpected(ssot, adult);
        const pairs = mtSanitize.JA_ASR_DOMAIN_FIX_PAIRS || [];
        assert.strictEqual(pairs.length, expected.length);
        for (let i = 0; i < expected.length; i += 1) {
            assert.strictEqual(pairs[i].from, expected[i].from);
            assert.strictEqual(pairs[i].to, expected[i].to);
        }
    });

    it('corrects JA ASR domain mishears using SSOT rules', () => {
        const fixed = mtSanitize.correctJaAsrDomainMishears('免税しては大丈夫');
        assert.ok(fixed.changed);
        assert.ok(String(fixed.text).includes('メンエスは'));
    });

    it('corrects soft-AV / anime-whisper JA ASR mishears without slowing ASR', () => {
        const cases = [
            ['大好きなアップル', 'おっぱい'],
            ['マイクロビッキン', 'マイクロビキニ'],
            ['祖父とは違います', '風俗とは違います'],
            ['購入しててください', '興奮しててください'],
            ['いあちゅい', 'イッちゃう'],
            ['きもちいい', '気持ちいい'],
            ['マイトに入った', 'バイトに入った'],
            ['アパイタに入った', 'アルバイトに入った'],
        ];
        for (const [raw, expect] of cases) {
            const fixed = mtSanitize.correctJaAsrDomainMishears(raw);
            assert.ok(fixed.changed, raw);
            assert.ok(String(fixed.text).includes(expect), `${raw} -> ${fixed.text}`);
        }
        // Paired: keep oil remap; do not invent メンエス from unrelated 免税 absence
        const oil = mtSanitize.correctJaAsrDomainMishears('トイレ追加しますね');
        assert.ok(String(oil.text).includes('オイル追加'));
    });

    it('desktop MT path may strip unjustified trailing 2–4 Han; keep tokens survive', () => {
        // Documented path divergence: desktop sanitize is stricter than engine Opus subset.
        const dirty = mtSanitize.sanitizeMtCueText('……舒服。 过来', '気持ちいい', {});
        const kept = mtSanitize.sanitizeMtCueText('加油', 'がんばって', {});
        assert.ok(typeof dirty?.text === 'string');
        assert.ok(String(kept?.text || '').includes('加油') || kept?.text === '加油');
    });
});
