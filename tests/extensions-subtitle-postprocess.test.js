const assert = require('assert');
const { createSubtitlePostprocess } = require('../electron/extensions-subtitle-postprocess');

describe('extensions-subtitle-postprocess factory', () => {
    it('exports six postprocess APIs', () => {
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({ ok: true, cues: [], path: 'x.srt', format: 'srt', header: [] }),
            writeSubtitleDocument: () => ({ ok: true }),
            isSourceSubtitleTrack: () => false,
        });
        assert.strictEqual(typeof api.applySubtitlePostprocess, 'function');
        assert.strictEqual(typeof api.removeNoiseFromSubtitlePair, 'function');
        assert.strictEqual(typeof api.compactPureInterjectionSubtitlePair, 'function');
        assert.strictEqual(typeof api.recoverBlankedMtCues, 'function');
        assert.strictEqual(typeof api.removeEllipsisOnlyDeliveryPair, 'function');
        assert.strictEqual(typeof api.sanitizeMtSubtitlePair, 'function');
    });

    it('applySubtitlePostprocess returns error when readSubtitleDocument is not ok', () => {
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({ ok: false, error: '字幕文件不存在' }),
            writeSubtitleDocument: () => {
                throw new Error('write should not run');
            },
            isSourceSubtitleTrack: () => false,
        });
        const res = api.applySubtitlePostprocess('missing.srt', {});
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, '字幕文件不存在');
    });

    it('skips viewing punctuation on JA/source tracks by default', () => {
        let written = null;
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({
                ok: true,
                path: 'PPPE-446.transcribe.srt',
                format: 'srt',
                header: [],
                cues: [
                    { startMs: 0, endMs: 1000, text: '思えば…' },
                    { startMs: 1200, endMs: 2200, text: 'おい、桃太郎、これ大丈夫か?' },
                ],
            }),
            writeSubtitleDocument: (filePath, payload) => {
                written = { filePath, cues: payload.cues };
                return { ok: true, cueCount: payload.cues.length };
            },
            isSourceSubtitleTrack: () => true,
        });
        const res = api.applySubtitlePostprocess('PPPE-446.transcribe.srt', {
            viewingPunctMode: 'clear',
            removeNoise: false,
            compressRepetition: false,
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.viewingPunct?.skippedSource, true);
        assert.strictEqual(res.viewingPunct?.stats?.cueTouched, 0);
        assert.ok(!written, 'source viewing-punct skip should not rewrite when nothing else changed');
    });

    it('still applies viewing punctuation on translation tracks', () => {
        let written = null;
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({
                ok: true,
                path: 'PPPE-446.zh.srt',
                format: 'srt',
                header: [],
                cues: [
                    { startMs: 0, endMs: 1000, text: '想想看…' },
                    { startMs: 1200, endMs: 2200, text: '喂，桃太郎，这样可以吗？' },
                ],
            }),
            writeSubtitleDocument: (filePath, payload) => {
                written = { filePath, cues: payload.cues };
                return { ok: true, cueCount: payload.cues.length };
            },
            isSourceSubtitleTrack: () => false,
        });
        const res = api.applySubtitlePostprocess('PPPE-446.zh.srt', {
            viewingPunctMode: 'clear',
            removeNoise: false,
            compressRepetition: false,
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.viewingPunct?.stats?.cueTouched > 0, JSON.stringify(res.viewingPunct));
        assert.ok(written);
        assert.ok(!/…/.test(written.cues[0].text), written.cues[0].text);
        assert.ok(!/，/.test(written.cues[1].text), written.cues[1].text);
        assert.ok(/\?|？/.test(written.cues[1].text), written.cues[1].text);
    });

    it('skips compressRepetition on JA/source tracks by default (MUDR-403)', () => {
        let written = null;
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({
                ok: true,
                path: 'MUDR-403.transcribe.srt',
                format: 'srt',
                header: [],
                cues: [
                    { startMs: 0, endMs: 1000, text: 'あ、出る出る出る…んんっ!' },
                    { startMs: 1200, endMs: 2200, text: '不二、不二、不二もいる' },
                    { startMs: 2400, endMs: 3400, text: 'あったかい…あったかい…' },
                ],
            }),
            writeSubtitleDocument: (filePath, payload) => {
                written = { filePath, cues: payload.cues };
                return { ok: true, cueCount: payload.cues.length };
            },
            isSourceSubtitleTrack: () => true,
        });
        const res = api.applySubtitlePostprocess('MUDR-403.transcribe.srt', {
            compressRepetition: true,
            removeNoise: false,
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.compressRep?.skippedSource, true);
        assert.strictEqual(res.compressRep?.stats?.cueTouched, 0);
        assert.ok(!written, 'source compress-rep skip should not rewrite when nothing else changed');
    });

    it('still compresses repetition on translation tracks', () => {
        let written = null;
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({
                ok: true,
                path: 'MUDR-403.zh.srt',
                format: 'srt',
                header: [],
                cues: [
                    { startMs: 0, endMs: 1000, text: '好的好的好的好的好的好的好的好的' },
                ],
            }),
            writeSubtitleDocument: (filePath, payload) => {
                written = { filePath, cues: payload.cues };
                return { ok: true, cueCount: payload.cues.length };
            },
            isSourceSubtitleTrack: () => false,
        });
        const res = api.applySubtitlePostprocess('MUDR-403.zh.srt', {
            compressRepetition: true,
            removeNoise: false,
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.compressRep?.stats?.cueTouched > 0, JSON.stringify(res.compressRep));
        assert.ok(written);
        assert.strictEqual(written.cues[0].text, '好的好的！');
    });

    it('opt-in compressRepetitionOnSource still compresses JA source', () => {
        let written = null;
        const api = createSubtitlePostprocess({
            readSubtitleDocument: () => ({
                ok: true,
                path: 'MUDR-403.transcribe.srt',
                format: 'srt',
                header: [],
                cues: [
                    { startMs: 0, endMs: 1000, text: 'あ、出る出る出る…んんっ!' },
                ],
            }),
            writeSubtitleDocument: (filePath, payload) => {
                written = { filePath, cues: payload.cues };
                return { ok: true, cueCount: payload.cues.length };
            },
            isSourceSubtitleTrack: () => true,
        });
        const res = api.applySubtitlePostprocess('MUDR-403.transcribe.srt', {
            compressRepetition: true,
            compressRepetitionOnSource: true,
            removeNoise: false,
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.compressRep?.stats?.cueTouched > 0, JSON.stringify(res.compressRep));
        assert.ok(written);
        assert.strictEqual(written.cues[0].text, 'あ、出る出る！…んんっ!');
    });

    it('rejects incomplete host', () => {
        assert.throws(
            () => createSubtitlePostprocess({}),
            /readSubtitleDocument required/,
        );
    });
});
