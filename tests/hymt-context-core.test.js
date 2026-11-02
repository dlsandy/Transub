'use strict';

const assert = require('assert');
const ctx = require('../src/js/hymt-context-core');
const hymt = require('../src/js/hymt-translate-core');
const qg = require('../src/js/hymt-quality-guard-core');

describe('hymt-context-core', () => {
    it('builds previous JA/ZH and omits fragile prior ZH', () => {
        const prev = ctx.buildHyMtPreviousContext({
            sourceCues: [
                { index: 0, text: '先生、待って' },
                { index: 1, text: 'うん' },
            ],
            translatedByIndex: new Map([[0, '老师，等一下']]),
            currentChunkCues: [{ index: 1, text: 'うん' }],
        });
        assert.strictEqual(prev.previousSourceText, '先生、待って');
        assert.strictEqual(prev.previousTranslationText, undefined, 'fragile current drops prior ZH');

        const lexical = ctx.buildHyMtPreviousContext({
            sourceCues: [
                { index: 0, text: '先生、待って' },
                { index: 1, text: '今日は検査です' },
            ],
            translatedByIndex: new Map([[0, '老师，等一下']]),
            currentChunkCues: [{ index: 1, text: '今日は検査です' }],
        });
        assert.strictEqual(lexical.previousTranslationText, '老师，等一下');

        const orphanKanji = ctx.buildHyMtPreviousContext({
            sourceCues: [
                { index: 0, text: '一週間に半分くらい実際に作ります' },
                { index: 1, text: '自炊' },
            ],
            translatedByIndex: new Map([[0, '一周里大概有一半时间会实际烹饪']]),
            currentChunkCues: [{ index: 1, text: '自炊' }],
        });
        assert.strictEqual(orphanKanji.previousSourceText, '一週間に半分くらい実際に作ります');
        assert.strictEqual(orphanKanji.previousTranslationText, undefined, 'short kanji orphan omits prior ZH');
    });

    it('rolling state injects hit-only address hint', () => {
        let state = ctx.emptyRollingState();
        state = ctx.updateHyMtRollingState(state, '先生、お願いします', '老师，拜托了');
        assert.ok(state.addresses.some((a) => a.key === '先生' && a.zh === '老师'));
        assert.match(ctx.formatHyMtStateHint(state, '先生は？'), /先生→老师/);
        assert.strictEqual(ctx.formatHyMtStateHint(state, '今日はいい天気'), '');
    });

    it('maybeUpgradeHyMtModelId climbs on soft when VRAM allows', () => {
        assert.strictEqual(
            ctx.maybeUpgradeHyMtModelId('hy-mt2-1.8b', ['hy-mt2-7b', 'hy-mt2-1.8b'], {
                contentProfile: 'av_soft',
                vramGb: 12,
            }),
            'hy-mt2-7b',
        );
        assert.strictEqual(
            ctx.maybeUpgradeHyMtModelId('hy-mt2-7b', ['hy-mt2-30b-a3b-heretic-mini', 'hy-mt2-7b'], {
                contentProfile: 'av_soft',
                vramGb: 24,
            }),
            'hy-mt2-30b-a3b-heretic-mini',
        );
        assert.strictEqual(
            ctx.maybeUpgradeHyMtModelId('hy-mt2-1.8b', ['hy-mt2-7b'], {
                contentProfile: 'film',
                vramGb: 12,
            }),
            'hy-mt2-1.8b',
            'non-soft does not auto-upgrade',
        );
        assert.strictEqual(
            ctx.maybeUpgradeHyMtModelId('hy-mt2-1.8b', ['hy-mt2-7b'], {
                contentProfile: 'av_soft',
                preferLargerHyMt: false,
            }),
            'hy-mt2-1.8b',
        );
    });

    it('official Hy-MT prompt includes previous context', () => {
        const msgs = hymt.buildHyMtChatMessages(
            [{ index: 1, text: '検査を受けてください' }],
            {
                contentProfile: 'av_soft',
                previousSourceText: '先生、待って',
                previousTranslationText: '老师，等一下',
                hyMtStateHint: '称呼沿用：先生→老师',
                avGlossary: false,
                nsfwLexicon: false,
            },
        );
        assert.match(msgs[0].content, /上文参考（勿翻译）/);
        assert.match(msgs[0].content, /老师，等一下/);
        assert.match(msgs[0].content, /称呼沿用：先生→老师/);
        assert.match(msgs[0].content, /検査を受けてください/);
    });

    it('quality guard flags under_lexical / voice_flip / address_drift', () => {
        const under = qg.assessHyMtCueQuality('嗯', '今日は検査ですよ');
        assert.ok(under.reasons.includes('under_lexical') || under.reasons.includes('under'), under.reasons);

        const flip = qg.assessHyMtCueQuality('被他看着', '彼のことを見てください');
        assert.ok(flip.reasons.includes('voice_flip'), flip.reasons);

        const drift = qg.assessHyMtCueQuality('前辈好', '先生、こんにちは', {
            hyMtRollingState: { addresses: [{ key: '先生', ja: '先生', zh: '老师' }], names: [] },
        });
        assert.ok(drift.reasons.includes('address_drift'), drift.reasons);
    });
});
