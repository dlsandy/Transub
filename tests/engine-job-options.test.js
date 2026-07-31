const assert = require('assert');
const {
    normalizeEngineSubFormatsList,
    resolveEngineSubFormats,
    buildEngineGlossaryPairs,
    resolveEngineMtGlossaryMode,
    buildEngineJobFlags,
    buildExternalMtJobFields,
} = require('../electron/engine-job-options');

describe('engine-job-options', () => {
    it('drops LRC and unknown formats', () => {
        assert.deepStrictEqual(
            normalizeEngineSubFormatsList('srt,lrc,vtt,foo'),
            ['srt', 'vtt'],
        );
    });

    it('accepts ASS and normalizes ass-dual', () => {
        assert.deepStrictEqual(
            normalizeEngineSubFormatsList(['ass', 'ass-dual']),
            ['ass', 'ass-dual'],
        );
    });

    it('maps merge bilingual dual task to dualAss', () => {
        const r = resolveEngineSubFormats({
            task: 'dual',
            subFormats: 'srt',
            mergeBilingualSubtitles: true,
        });
        assert.strictEqual(r.dualAss, true);
        assert.ok(r.subFormats.includes('srt'));
    });

    it('builds glossary pairs from aliases → canonical', () => {
        const pairs = buildEngineGlossaryPairs({
            entries: [
                { canonical: '桐谷和人', aliases: ['Kirito', 'キリト'], enabled: true },
                { canonical: '亚丝娜', aliases: [], enabled: true },
                { canonical: '忽略', aliases: ['skip'], enabled: false },
            ],
        });
        assert.deepStrictEqual(pairs, [
            { src: 'Kirito', tgt: '桐谷和人' },
            { src: 'キリト', tgt: '桐谷和人' },
        ]);
    });

    it('defaults releaseGpuAfter for sakura/smart handoff', () => {
        assert.strictEqual(buildEngineJobFlags({}, { sakuraOrSmart: true }).releaseGpuAfter, true);
        assert.strictEqual(buildEngineJobFlags({}, { sakuraOrSmart: false }).releaseGpuAfter, false);
        assert.strictEqual(
            buildEngineJobFlags({ releaseGpuAfter: true }, { sakuraOrSmart: false }).releaseGpuAfter,
            true,
        );
    });

    it('uses prompt glossary mode for sakura/smart (not Engine protect)', () => {
        assert.strictEqual(resolveEngineMtGlossaryMode({ sakuraOrSmart: true }), 'prompt');
        assert.strictEqual(resolveEngineMtGlossaryMode({ sakuraOrSmart: false }), 'protect');
        assert.strictEqual(
            buildEngineJobFlags({}, { sakuraOrSmart: true }).mtGlossaryMode,
            'prompt',
        );
        assert.strictEqual(
            buildEngineJobFlags({}, { sakuraOrSmart: false }).mtGlossaryMode,
            'protect',
        );
    });

    it('karaoke implies includeWords', () => {
        const flags = buildEngineJobFlags({ karaokeVtt: true });
        assert.strictEqual(flags.karaokeVtt, true);
        assert.strictEqual(flags.includeWords, true);
    });

    it('builds external MT job fields', () => {
        const fields = buildExternalMtJobFields({
            url: 'http://127.0.0.1:9/translate',
            token: 'abc',
            timeoutSec: 300,
            batchSize: 16,
        });
        assert.strictEqual(fields.mtBackend, 'external');
        assert.strictEqual(fields.mtExternal.url, 'http://127.0.0.1:9/translate');
        assert.strictEqual(fields.mtExternal.timeoutSec, 300);
        assert.strictEqual(fields.mtExternal.batchSize, 16);
        assert.strictEqual(fields.mtExternal.headers.Authorization, 'Bearer abc');
        assert.strictEqual(buildExternalMtJobFields({}), null);
        assert.strictEqual(
            buildExternalMtJobFields({ url: 'http://127.0.0.1:9/translate' }).mtExternal.batchSize,
            8,
        );
    });
});
