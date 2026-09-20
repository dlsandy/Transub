const assert = require('assert');
const {
    parsePlayerProtocolUrl,
    isPlayerProtocolUrl,
    mergePlayerHandoffMeta,
    buildPlayerHandoffFormPatch,
    normalizeSourceLanguage,
    mapTranslateTarget,
} = require('../src/js/player-protocol-core');

describe('player-protocol', () => {
    it('detects scheme', () => {
        assert.strictEqual(isPlayerProtocolUrl('transub://handoff?mode=open'), true);
        assert.strictEqual(isPlayerProtocolUrl('https://example.com'), false);
    });

    it('parses edit handoff', () => {
        const media = 'C:\\Videos\\a.mkv';
        const sub = 'C:\\Videos\\a.zh.preview.srt';
        const url = `transub://handoff?mode=edit&media=${encodeURIComponent(media)}&sub=${encodeURIComponent(sub)}&src=ja&tgt=zh&profile=av_soft`;
        const parsed = parsePlayerProtocolUrl(url);
        assert.ok(parsed);
        assert.strictEqual(parsed.mode, 'edit');
        assert.strictEqual(parsed.media.toLowerCase(), media.toLowerCase());
        assert.strictEqual(parsed.sub.toLowerCase(), sub.toLowerCase());
        assert.strictEqual(parsed.sourceLanguage, 'ja');
        assert.strictEqual(parsed.translateTarget, 'zh');
        assert.strictEqual(parsed.contentProfile, 'av_soft');
    });

    it('parses library deep link as shelf', () => {
        const media = 'E:\\Movies\\x.mkv';
        const parsed = parsePlayerProtocolUrl(
            `transub://library?media=${encodeURIComponent(media)}`,
        );
        assert.ok(parsed);
        assert.strictEqual(parsed.mode, 'shelf');
        assert.strictEqual(parsed.media.toLowerCase(), media.toLowerCase());
    });

    it('parses shelf deep link', () => {
        const media = 'E:\\Movies\\y.mkv';
        const parsed = parsePlayerProtocolUrl(
            `transub://shelf?media=${encodeURIComponent(media)}`,
        );
        assert.ok(parsed);
        assert.strictEqual(parsed.mode, 'shelf');
        assert.strictEqual(parsed.media.toLowerCase(), media.toLowerCase());
    });

    it('parses queue handoff', () => {
        const media = 'D:\\film.mp4';
        const parsed = parsePlayerProtocolUrl(
            `transub://handoff?mode=queue&media=${encodeURIComponent(media)}`,
        );
        assert.strictEqual(parsed.mode, 'queue');
        assert.strictEqual(parsed.media.toLowerCase(), media.toLowerCase());
    });

    it('falls back edit→queue when sub missing', () => {
        const parsed = parsePlayerProtocolUrl(
            `transub://handoff?mode=edit&media=${encodeURIComponent('E:\\x.mkv')}`,
        );
        assert.strictEqual(parsed.mode, 'queue');
    });

    it('merges URL over manifest and builds form patch', () => {
        const parsed = parsePlayerProtocolUrl(
            `transub://handoff?mode=queue&media=${encodeURIComponent('F:\\a.mkv')}&src=en&tgt=zh-Hant&profile=film`,
        );
        const meta = mergePlayerHandoffMeta(parsed, {
            version: 1,
            sourceLanguage: 'ja',
            translateTarget: 'zh',
            contentProfile: 'av_soft',
            mediaPath: 'F:\\ignored.mkv',
        });
        assert.strictEqual(meta.sourceLanguage, 'en');
        assert.strictEqual(meta.translateTarget, 'zh-Hant');
        assert.strictEqual(meta.contentProfile, 'film');
        assert.strictEqual(meta.chineseSubtitleVariant, 'traditional');
        assert.strictEqual(meta.preferTranslate, true);

        const patch = buildPlayerHandoffFormPatch(meta);
        assert.strictEqual(patch.language, 'en');
        assert.strictEqual(patch.contentProfile, 'film');
        assert.strictEqual(patch.senseProfile, undefined);
        assert.strictEqual(patch.autoSense, undefined);
        assert.strictEqual(patch.chineseSubtitleVariant, 'traditional');
        assert.strictEqual(patch.task, 'translate');
    });

    it('fills from manifest when URL omits meta', () => {
        const parsed = parsePlayerProtocolUrl(
            `transub://handoff?mode=queue&media=${encodeURIComponent('G:\\b.mp4')}`,
        );
        const meta = mergePlayerHandoffMeta(parsed, {
            sourceLanguage: 'ja',
            translateTarget: 'zh',
            contentProfile: 'av_soft',
        });
        assert.strictEqual(meta.sourceLanguage, 'ja');
        assert.strictEqual(meta.contentProfile, 'av_soft');
        assert.strictEqual(meta.chineseSubtitleVariant, 'simplified');
    });

    it('normalizes source language aliases', () => {
        assert.strictEqual(normalizeSourceLanguage('jp'), 'ja');
        assert.strictEqual(normalizeSourceLanguage('english'), 'en');
        assert.strictEqual(normalizeSourceLanguage('de'), '');
    });

    it('maps translate targets', () => {
        assert.deepStrictEqual(mapTranslateTarget('en'), {
            preferTranslate: true,
            nonChineseTarget: 'en',
            subtitleTargetLang: 'en',
        });
        assert.deepStrictEqual(mapTranslateTarget('zh'), {
            chineseSubtitleVariant: 'simplified',
            subtitleTargetLang: 'zh-Hans',
            preferTranslate: true,
        });
        assert.deepStrictEqual(mapTranslateTarget('zh-Hant'), {
            chineseSubtitleVariant: 'traditional',
            subtitleTargetLang: 'zh-Hant',
            preferTranslate: true,
        });
    });

    it('builds editor session and merges options', () => {
        const {
            buildPlayerHandoffEditorSession,
            mergeOptionsWithPlayerHandoff,
        } = require('../src/js/player-protocol-core');
        const meta = mergePlayerHandoffMeta(
            {
                sourceLanguage: 'ja',
                contentProfile: 'av_soft',
                translateTarget: 'zh-Hant',
            },
            null,
        );
        const session = buildPlayerHandoffEditorSession(meta);
        assert.strictEqual(session.language, 'ja');
        assert.strictEqual(session.contentProfile, 'av_soft');
        assert.strictEqual(session.chineseSubtitleVariant, 'traditional');
        assert.ok(session.note.includes('片源语=ja'));

        const merged = mergeOptionsWithPlayerHandoff(
            { language: 'auto', chineseSubtitleVariant: 'simplified' },
            session,
        );
        assert.strictEqual(merged.language, 'ja');
        assert.strictEqual(merged.chineseSubtitleVariant, 'traditional');
        assert.strictEqual(merged.contentProfile, 'av_soft');
    });

    it('notes non-Chinese translate target on form patch', () => {
        const meta = mergePlayerHandoffMeta(
            { sourceLanguage: 'ja', translateTarget: 'en', contentProfile: '' },
            null,
        );
        const patch = buildPlayerHandoffFormPatch(meta);
        assert.strictEqual(patch.task, 'translate');
        assert.ok(String(patch._playerHandoffNote || '').includes('英语'));
    });

    it('optionPatchForProfile helper merges into form patch', () => {
        const meta = mergePlayerHandoffMeta(
            { sourceLanguage: 'ja', contentProfile: 'talk', translateTarget: 'zh' },
            null,
        );
        const patch = buildPlayerHandoffFormPatch(meta, {
            optionPatchForProfile: () => ({ vadSensitive: true, contentProfile: 'talk' }),
        });
        assert.strictEqual(patch.vadSensitive, true);
        assert.strictEqual(patch.language, 'ja');
    });
});
