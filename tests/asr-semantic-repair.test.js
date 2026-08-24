const assert = require('assert');
const core = require('../src/js/asr-semantic-repair-core');

describe('asr-semantic-repair-core', () => {
    it('normalizes repair mode', () => {
        assert.strictEqual(core.normalizeAsrSemanticRepairMode(undefined), 'auto');
        assert.strictEqual(core.normalizeAsrSemanticRepairMode('off'), 'off');
        assert.strictEqual(core.normalizeAsrSemanticRepairMode('full'), 'thorough');
        assert.strictEqual(core.normalizeAsrSemanticRepairMode('on'), 'thorough');
        assert.strictEqual(core.normalizeAsrSemanticRepairMode(false), 'off');
    });

    it('auto mode runs for any content profile', () => {
        assert.strictEqual(core.shouldRunAsrSemanticRepair({ asrSemanticRepair: 'off' }), false);
        assert.strictEqual(core.shouldRunAsrSemanticRepair({ asrSemanticRepair: 'thorough' }), true);
        assert.strictEqual(core.shouldRunAsrSemanticRepair({
            asrSemanticRepair: 'auto',
            contentProfile: 'film',
            language: 'en',
        }), true);
    });

    it('infers repair language from cues', () => {
        assert.strictEqual(core.inferRepairLanguageFromCues([{ text: 'こんにちは' }]), 'ja');
        assert.strictEqual(core.inferRepairLanguageFromCues([{ text: '你好世界' }]), 'zh');
        assert.strictEqual(core.inferRepairLanguageFromCues([{ text: 'Hello there' }]), 'en');
    });

    it('biases ja when language auto and av_soft profile with kanji-only cues', () => {
        const info = core.resolveRepairLanguageInfo({
            language: 'auto',
            contentProfile: 'av_soft',
        }, [{ text: '感じる' }]);
        assert.strictEqual(info.key, 'ja');
        assert.strictEqual(info.source, 'profile');
    });

    it('buildRepairContext includes film language and register lines', () => {
        const ctx = core.buildRepairContext({
            language: 'ja',
            contentProfile: 'av_soft',
            primaryAsr: 'sensevoice-small',
        }, [{ text: 'テスト' }]);
        assert.match(ctx.filmLanguageLine, /日语/);
        assert.match(ctx.registerLine, /软声/);
        assert.match(ctx.asrModelLine, /sensevoice-small/);
    });

    it('buildRepairUserPrompt marks editable vs context and includes glossary', () => {
        const cues = [
            { index: 0, text: '前文', editable: false },
            { index: 1, text: '誤り', editable: true },
        ];
        const prompt = core.buildRepairUserPrompt(cues, {
            registerLine: 'test register',
            glossaryTerms: [{ term: '太郎', aliases: ['タロウ'] }],
        });
        assert.match(prompt, /editable=false/);
        assert.match(prompt, /太郎/);
        assert.match(prompt, /1 条可改写/);
    });

    it('buildRepairChatMessages system prompt forbids polish and translation', () => {
        const messages = core.buildRepairChatMessages(
            [{ index: 0, text: 'test', editable: true }],
            { language: 'ja' },
        );
        assert.match(messages[0].content, /不是润色/);
        assert.match(messages[0].content, /不要翻译/);
    });

    it('validateRepairUpdate rejects length drift and script flip', () => {
        assert.strictEqual(
            core.validateRepairUpdate(
                'これは短い文です',
                'これは明らかに長すぎる誤った書き換えで余計な説明まで足します',
                { langKey: 'ja' },
            ).ok,
            false,
        );
        assert.strictEqual(
            core.validateRepairUpdate('こんにちは', '你好', { langKey: 'ja' }).ok,
            false,
        );
        assert.strictEqual(
            core.validateRepairUpdate('こんにちは', 'こんにちわ', { langKey: 'ja' }).ok,
            true,
        );
    });

    it('applyRepairUpdates rejects invalid LLM edits', () => {
        const cues = [
            { index: 0, startMs: 0, endMs: 1000, text: 'こんにちは' },
            { index: 1, startMs: 1000, endMs: 2000, text: 'そのまま' },
        ];
        const applied = core.applyRepairUpdates(cues, [
            { index: 0, text: '你好' },
        ], { allowIndexes: [0], langKey: 'ja' });
        assert.strictEqual(applied.changed, 0);
        assert.deepStrictEqual(applied.rejectedIndexes, [0]);
        assert.strictEqual(applied.cues[0].text, 'こんにちは');
    });

    it('applyRepairUpdates ignores punctuation-only edits', () => {
        const cues = [{ index: 0, startMs: 0, endMs: 1000, text: 'いや、え?' }];
        const applied = core.applyRepairUpdates(cues, [
            { index: 0, text: 'いや、え？' },
        ], { allowIndexes: [0], langKey: 'ja' });
        assert.strictEqual(applied.changed, 0);
        assert.strictEqual(applied.skippedTrivial, 1);
        assert.strictEqual(applied.cues[0].text, 'いや、え?');
    });

    it('isTrivialRepairEdit detects punctuation-only drift', () => {
        assert.strictEqual(core.isTrivialRepairEdit('お、うま。', 'お、うま'), true);
        assert.strictEqual(core.isTrivialRepairEdit('意外', '以外'), false);
    });

    it('auto mode does not select mild low-confidence cues without suspicious text', () => {
        const cues = Array.from({ length: 40 }, (_, i) => ({
            startMs: i * 1000,
            endMs: (i + 1) * 1000,
            text: 'こんにちは世界',
            meta: { confidence: 0.42 },
        }));
        const targets = core.selectRepairTargets(cues, { asrSemanticRepair: 'auto' });
        assert.strictEqual(targets.length, 0);
    });

    it('extractRepairGlossaryTerms from pairs and entries', () => {
        const fromPairs = core.extractRepairGlossaryTerms([
            { src: '太郎', tgt: '太郎' },
            { src: '花子', tgt: '花子' },
        ]);
        assert.ok(fromPairs.some((g) => g.term === '太郎'));
        const fromObj = core.extractRepairGlossaryTerms({
            entries: [{ enabled: true, source: 'ABC', aliases: ['エービーシー'] }],
        });
        assert.ok(fromObj.some((g) => g.term === 'ABC'));
    });

    it('buildRepairCuePayload sets editable flag from target set', () => {
        const payload = core.buildRepairCuePayload(
            [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
            [0, 1, 2],
            new Set([1]),
        );
        assert.strictEqual(payload[0].editable, false);
        assert.strictEqual(payload[1].editable, true);
        assert.strictEqual(payload[2].editable, false);
    });

    it('selects suspicious cues in auto mode', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'こんにちは' },
            { startMs: 1000, endMs: 2000, text: 'あああああああ' },
            { startMs: 2000, endMs: 3000, text: 'ありがとう' },
        ];
        const targets = core.selectRepairTargets(cues, { asrSemanticRepair: 'auto' });
        assert.ok(targets.length >= 1);
        assert.ok(targets.some((t) => t.index === 1));
    });

    it('thorough mode includes all dialogue cues', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'A' },
            { startMs: 1000, endMs: 2000, text: 'B' },
        ];
        const targets = core.selectRepairTargets(cues, { asrSemanticRepair: 'thorough' });
        assert.strictEqual(targets.length, 2);
    });

    it('parses and applies repair updates', () => {
        const cues = [
            { index: 0, startMs: 0, endMs: 1000, text: '誤り' },
            { index: 1, startMs: 1000, endMs: 2000, text: 'そのまま' },
        ];
        const parsed = core.parseRepairResponse(
            '{"cues":[{"index":0,"text":"正しい"}]}',
            [0, 1],
        );
        assert.strictEqual(parsed.ok, true);
        const applied = core.applyRepairUpdates(cues, parsed.updates, { allowIndexes: [0] });
        assert.strictEqual(applied.changed, 1);
        assert.strictEqual(applied.cues[0].text, '正しい');
        assert.strictEqual(applied.cues[1].text, 'そのまま');
    });

    it('converts engine cues to ms and back', () => {
        const engine = [{ start: 1.5, end: 2.5, text: 'test' }];
        const ms = core.engineCuesToRepairMs(engine);
        assert.strictEqual(ms[0].startMs, 1500);
        assert.strictEqual(ms[0].endMs, 2500);
        const back = core.repairMsToEngineCues(ms);
        assert.strictEqual(back[0].start, 1.5);
        assert.strictEqual(back[0].end, 2.5);
    });

    it('buildRepairUserPrompt includes media basename hint', () => {
        const prompt = core.buildRepairUserPrompt(
            [{ index: 0, text: 'test', editable: true }],
            { mediaBasename: 'sample.mp4', registerLine: 'x' },
        );
        assert.match(prompt, /sample\.mp4/);
    });

    it('formats repair audit log lines', () => {
        const lines = core.formatRepairAuditLogLines([
            { index: 2, before: '誤り', after: '正しい' },
        ]);
        assert.match(lines[0], /改写抽样/);
        assert.match(lines[1], /#3/);
        assert.match(lines[1], /誤り/);
    });

    it('formatRepairResultSummary includes rejected count', () => {
        const summary = core.formatRepairResultSummary({
            targets: [{ index: 0 }],
            mode: 'auto',
            changed: 1,
            rejected: 2,
        });
        assert.match(summary, /实质性改写 1 条/);
        assert.match(summary, /校验拒绝 2 条/);
    });

    it('formatRepairResultSummary explains punctuation-only skips', () => {
        const summary = core.formatRepairResultSummary({
            targets: [{ index: 0 }, { index: 1 }],
            mode: 'auto',
            changed: 0,
            skippedTrivial: 3,
        });
        assert.match(summary, /未发现实质性听写错误/);
        assert.match(summary, /标点级/);
    });

    it('parseRepairResponse accepts NDJSON-like cue stream via reconstruct parser', () => {
        const content = [
            '{"index":0,"text":"正しい"}',
            '{"index":1,"text":"そのまま"}',
        ].join('\n');
        const parsed = core.parseRepairResponse(content, [0, 1]);
        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.updates.length, 2);
    });

    it('parseRepairResponse includes snippet on failure', () => {
        const parsed = core.parseRepairResponse('这不是 JSON', [0]);
        assert.strictEqual(parsed.ok, false);
        assert.strictEqual(parsed.code, 'parse_empty');
        assert.ok(parsed.snippet);
    });

    it('estimateRepairMaxTokens scales with cue count', () => {
        assert.ok(core.estimateRepairMaxTokens(1) >= 200);
        assert.ok(core.estimateRepairMaxTokens(40) > core.estimateRepairMaxTokens(1));
    });

    it('formatRepairFailureMessage appends hint for known codes', () => {
        const msg = core.formatRepairFailureMessage({
            error: 'busy',
            code: 'compute_busy',
        });
        assert.match(msg, /compute_busy/);
        assert.match(msg, /等待/);
    });
});
