const assert = require('assert');
const path = require('path');
const {
    normalizeSaveFormat,
    subtitleSaveFilters,
    formatFromSavePath,
    buildSubtitleSaveDialogOptions,
    ensureSubtitleSaveExtension,
} = require('../electron/subtitle-save-dialog');

describe('subtitle-save-dialog', () => {
    it('normalizes format hints including ssa', () => {
        assert.strictEqual(normalizeSaveFormat('VTT'), 'vtt');
        assert.strictEqual(normalizeSaveFormat('.ass'), 'ass');
        assert.strictEqual(normalizeSaveFormat('ssa'), 'ass');
        assert.strictEqual(normalizeSaveFormat('txt', 'lrc'), 'lrc');
        assert.strictEqual(normalizeSaveFormat(''), 'srt');
    });

    it('builds filters with current format first', () => {
        assert.strictEqual(subtitleSaveFilters('srt')[0].extensions[0], 'srt');
        assert.strictEqual(subtitleSaveFilters('vtt')[0].extensions[0], 'vtt');
        assert.strictEqual(subtitleSaveFilters('ass')[0].name, 'Advanced SubStation');
        assert.deepStrictEqual(subtitleSaveFilters('lrc')[1].extensions, ['srt', 'vtt', 'lrc', 'ass']);
    });

    it('reads format from save path', () => {
        assert.strictEqual(formatFromSavePath(path.join('D:', 'subs', 'a.vtt'), 'srt'), 'vtt');
        assert.strictEqual(formatFromSavePath('movie.ssa', 'srt'), 'ass');
        assert.strictEqual(formatFromSavePath('movie', 'lrc'), 'lrc');
    });

    it('builds dialog options for 另存为 / export', () => {
        const current = path.join('F:', 'film.zh.srt');
        const saveAs = buildSubtitleSaveDialogOptions({
            format: 'srt',
            defaultPath: current,
        });
        assert.strictEqual(saveAs.title, '另存为');
        assert.strictEqual(saveAs.defaultPath, current);
        assert.strictEqual(saveAs.format, 'srt');
        assert.strictEqual(saveAs.filters[0].extensions[0], 'srt');

        const exported = buildSubtitleSaveDialogOptions({
            title: '导出字幕',
            format: 'ass',
            defaultName: 'merged.ass',
        });
        assert.strictEqual(exported.title, '导出字幕');
        assert.strictEqual(exported.defaultPath, 'merged.ass');
        assert.strictEqual(exported.format, 'ass');
    });

    it('appends extension when the user omitted one', () => {
        const stem = path.join('F:', 'out', 'copy');
        assert.strictEqual(ensureSubtitleSaveExtension(stem, 'srt'), `${stem}.srt`);
        const withExt = path.join('F:', 'out', 'copy.vtt');
        assert.strictEqual(ensureSubtitleSaveExtension(withExt, 'srt'), withExt);
    });
});
