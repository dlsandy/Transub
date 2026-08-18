'use strict';

const assert = require('assert');

const sanitize = require('../src/js/mt-sanitize-core.js');
const train = require('../tools/mt-train/lib/train.js');

describe('trained remaps (console train loop)', () => {
    const av = { contentProfile: 'av_soft' };

    afterEach(() => {
        // Restore from repo shared file
        sanitize.reloadTrainedRemaps();
    });

    function loadPack(pack) {
        sanitize.reloadTrainedRemaps(pack);
    }

    it('applyTrainedZhRemaps replace at domain stage', () => {
        loadPack({
            version: 1,
            zhRemaps: [train.encodeZhRule({
                id: 't1',
                mode: 'replace',
                pinFinal: false,
                jaIncludes: ['テストいく'],
                zhFrom: '要去了',
                zhTo: '要射了',
            })],
            asrPairs: [],
        });
        const r = sanitize.applyTrainedZhRemaps('啊要去了', 'テストいく', { pinFinalPass: false });
        assert.strictEqual(r.text, '啊要射了');
        assert.ok(r.flags.includes('trained_remap'));
    });

    it('pinFinal blank wins over later recovery fill', () => {
        loadPack({
            version: 1,
            zhRemaps: [train.encodeZhRule({
                id: 't-blank',
                mode: 'blank',
                pinFinal: true,
                jaIncludes: ['トレーン空白アンカー'],
                zhFrom: '训练空白标记',
            })],
            asrPairs: [],
        });
        const r = sanitize.sanitizeMtCueText('训练空白标记还在', 'トレーン空白アンカーです', av);
        assert.ok(
            r.flags.includes('trained_remap') || r.flags.includes('trained_remap_final'),
            String(r.flags),
        );
        assert.strictEqual(r.text, '…');
    });

    it('pinFinal keeps replace through full sanitize pipeline', () => {
        loadPack({
            version: 1,
            zhRemaps: [train.encodeZhRule({
                id: 't-pin',
                mode: 'replace',
                pinFinal: true,
                jaIncludes: ['トレーン置換アンカー'],
                zhFrom: '训练射标记',
                zhTo: '训练去标记',
            })],
            asrPairs: [],
        });
        const r = sanitize.sanitizeMtCueText('这里训练射标记啊', 'トレーン置換アンカーだ', {
            ...av,
            captureStages: true,
        });
        assert.strictEqual(r.text, '这里训练去标记啊');
        assert.ok(
            r.flags.includes('trained_remap') || r.flags.includes('trained_remap_final'),
            String(r.flags),
        );
        assert.ok(r.stages && r.stages.final === '这里训练去标记啊');
    });

    it('trained ASR pairs merge into JA ASR fixes', () => {
        loadPack({
            version: 1,
            zhRemaps: [],
            asrPairs: [train.encodeAsrRule({
                id: 'a1',
                from: 'サイッチダメZZZ',
                to: '射精ダメ',
            })],
        });
        const pairs = sanitize.JA_ASR_DOMAIN_FIX_PAIRS || [];
        assert.ok(pairs.some((p) => p.from === 'サイッチダメZZZ' && p.to === '射精ダメ'));
        const asr = sanitize.correctJaAsrDomainMishears('サイッチダメZZZだよ');
        assert.ok(asr.text.includes('射精ダメ'), asr.text);
    });

    it('suggestLocalReplace finds smallest slice', () => {
        const sug = train.suggestLocalReplace('又要出来了啊', '又要射了啊');
        assert.ok(sug);
        assert.strictEqual(sug.zhFrom, '出来');
        assert.strictEqual(sug.zhTo, '射');
    });

    it('suggestLocalReplace expands short stub prefix (under_stub)', () => {
        const sug = train.suggestLocalReplace('请', '请摸我，继续舔我...');
        assert.ok(sug);
        assert.strictEqual(sug.zhFrom, '请');
        assert.strictEqual(sug.zhTo, '请摸我，继续舔我...');
        assert.ok(sug.expandStub);
    });

    it('assessRuleQuality warns on generic JA and whole-sentence swap', () => {
        const wide = train.assessRuleQuality({
            kind: 'zh',
            mode: 'replace',
            jaAnchor: 'いく',
            zh: '又要出来了啊哈哈哈哈',
            expect: '又要射了啊哈哈哈哈',
        });
        assert.ok(wide.warnings.some((w) => /宽泛|过宽|过短/.test(w) || w.includes('いく')));

        const whole = train.assessRuleQuality({
            kind: 'zh',
            mode: 'replace',
            jaAnchor: 'これは十分に長いアンカーフレーズです',
            zh: '一二三四五六七八九十再加字',
            expect: '甲乙丙丁戊己庚辛壬癸别的字',
        });
        assert.ok(whole.warnings.some((w) => /整句/.test(w)) || whole.suggestion?.wholeSentence);

        const blank = train.assessRuleQuality({ kind: 'zh', mode: 'blank', jaAnchor: 'ん' });
        assert.ok(blank.warnings.length >= 1);
    });

    it('addZhRemap merges same ja+zhFrom key', () => {
        const prevTarget = process.env.MT_TRAIN_TARGET;
        const prevRoot = process.env.TRANSUB_MT_SANDBOX_ROOT;
        const prevRemaps = process.env.TRANSUB_MT_USER_REMAPS;
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-merge-'));
        process.env.TRANSUB_MT_SANDBOX_ROOT = tmp;
        process.env.TRANSUB_MT_USER_REMAPS = path.join(tmp, 'mt-user-remaps.json');
        process.env.MT_TRAIN_TARGET = 'sandbox';
        train.sandbox.setWriteTarget('sandbox');
        try {
            train.writePack({ version: 1, zhRemaps: [], asrPairs: [] });
            const a = train.addZhRemap({
                mode: 'replace',
                jaIncludes: ['マージアンカー'],
                zhFrom: '错词',
                zhTo: '对词A',
                pinFinal: true,
            });
            const b = train.addZhRemap({
                mode: 'replace',
                jaIncludes: ['マージアンカー'],
                zhFrom: '错词',
                zhTo: '对词B',
                pinFinal: true,
            });
            assert.strictEqual(a.id, b.id);
            const listed = train.listRules().zhRemaps.filter((r) => r.zhFrom === '错词' && r.source === 'sandbox');
            assert.strictEqual(listed.length, 1);
            assert.strictEqual(listed[0].zhTo, '对词B');
        } finally {
            if (prevTarget == null) delete process.env.MT_TRAIN_TARGET;
            else process.env.MT_TRAIN_TARGET = prevTarget;
            if (prevRoot == null) delete process.env.TRANSUB_MT_SANDBOX_ROOT;
            else process.env.TRANSUB_MT_SANDBOX_ROOT = prevRoot;
            if (prevRemaps == null) delete process.env.TRANSUB_MT_USER_REMAPS;
            else process.env.TRANSUB_MT_USER_REMAPS = prevRemaps;
            try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });

    it('suggestJaAnchor keeps short cues and trims polite tails', () => {
        assert.strictEqual(train.suggestJaAnchor('いくよ'), 'いくよ');
        const long = '先輩のそういうところは本当にすっかり気に入ってしまったんですよ';
        assert.ok(long.length > 28);
        const a = train.suggestJaAnchor(long);
        assert.ok(a.length <= long.length);
        assert.notStrictEqual(a, long);
        assert.ok(!/ですよ$/.test(a));
    });

    it('trySanitize reports stages', () => {
        loadPack({ version: 1, zhRemaps: [], asrPairs: [] });
        const trial = train.trySanitize(sanitize, {
            ja: 'こんにちは',
            zh: '你好',
            expect: '你好',
            contentProfile: 'av_soft',
        });
        assert.ok(trial.stages);
        assert.strictEqual(typeof trial.stages.final, 'string');
        assert.strictEqual(trial.matchesExpect, true);
    });
});
