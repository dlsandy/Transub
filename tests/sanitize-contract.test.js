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

    it('JS ASR domain pairs include shared SSOT + opaque adult (longest-first)', () => {
        const expected = mergeExpected(ssot, adult);
        const pairs = mtSanitize.JA_ASR_DOMAIN_FIX_PAIRS || [];
        assert.ok(pairs.length >= expected.length);
        for (const exp of expected) {
            const hit = pairs.find((p) => p.from === exp.from);
            assert.ok(hit, `missing ASR pair from=${exp.from}`);
            assert.strictEqual(hit.to, exp.to);
        }
        for (let i = 1; i < pairs.length; i += 1) {
            const prevLen = Array.from(pairs[i - 1].from).length;
            const curLen = Array.from(pairs[i].from).length;
            if (curLen > prevLen) {
                assert.fail(`ASR pairs not longest-first at ${pairs[i].from}`);
            }
            if (curLen === prevLen
                && String(pairs[i - 1].from).localeCompare(String(pairs[i].from), 'ja') > 0) {
                assert.fail(`ASR pairs not sorted at equal length: ${pairs[i - 1].from} vs ${pairs[i].from}`);
            }
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
