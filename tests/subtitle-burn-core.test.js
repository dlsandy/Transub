const assert = require('assert');
const burn = require('../src/js/subtitle-burn-core');

describe('subtitle-burn-core', () => {
    it('validates pair and builds default output', () => {
        const res = burn.validateBurnPair({
            videoPath: 'D:/media/film.mp4',
            subtitlePath: 'D:/media/film.srt',
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.job.outputPath.includes('film.burned.mp4'));
        assert.strictEqual(res.job.container, 'mp4');
        assert.strictEqual(res.job.styleMode, 'basic');
        assert.strictEqual(res.job.encoderId, 'libx264');
        assert.ok(res.job.videoFilter.includes('subtitles='));
        assert.ok(res.job.videoFilter.includes('force_style='));
    });

    it('rejects missing subtitle and bad container', () => {
        assert.strictEqual(burn.validateBurnPair({ videoPath: 'a.mp4' }).ok, false);
        const bad = burn.validateBurnPair({
            videoPath: 'a.mp4',
            subtitlePath: 'a.srt',
            outputPath: 'out.avi',
        });
        assert.strictEqual(bad.ok, false);
    });

    it('document mode requires ASS', () => {
        const srt = burn.validateBurnPair({
            videoPath: 'a.mp4',
            subtitlePath: 'a.srt',
            styleMode: 'document',
        });
        assert.strictEqual(srt.ok, false);
        const ass = burn.validateBurnPair({
            videoPath: 'a.mp4',
            subtitlePath: 'a.ass',
            styleMode: 'document',
        });
        assert.strictEqual(ass.ok, true);
        assert.ok(ass.job.videoFilter.startsWith('ass='));
    });

    it('prefers dual ASS for document burn', () => {
        const path = burn.preferBurnSubtitlePath({
            subtitlePath: 'a.zh.srt',
            bilingualSubtitlePath: 'a.dual.ass',
            styleMode: 'document',
        });
        assert.strictEqual(path, 'a.dual.ass');
    });

    it('hexToAssColour and force_style', () => {
        assert.strictEqual(burn.hexToAssColour('#FFFFFF'), '&H00FFFFFF');
        assert.strictEqual(burn.hexToAssColour('#FF0000'), '&H000000FF');
        const force = burn.buildForceStyle({ fontSize: 24, primaryColor: '#FFFFFF', outline: 2, marginV: 48 });
        assert.ok(force.includes('FontSize=24'));
        assert.ok(force.includes('MarginV=48'));
        assert.ok(force.includes('Shadow='));
        assert.ok(force.includes('Alignment='));
    });

    it('escapes filter paths', () => {
        const esc = burn.escapeFilterPath('C:\\Subs\\a b.srt');
        assert.strictEqual(esc, 'C\\:/Subs/a b.srt');
    });

    it('builds ffmpeg args for soft and nvenc', () => {
        const validated = burn.validateBurnPair({
            videoPath: '/v/a.mp4',
            subtitlePath: '/v/a.srt',
            outputPath: '/v/a.burned.mp4',
            crf: 20,
        });
        const soft = burn.buildFfmpegBurnArgs(validated.job);
        assert.ok(soft.includes('libx264'));
        assert.ok(soft.includes('20'));
        assert.ok(soft.includes('+faststart'));

        const nv = burn.buildFfmpegBurnArgs({ ...validated.job, encoderId: 'h264_nvenc' });
        assert.ok(nv.includes('h264_nvenc'));
        assert.ok(nv.includes('-cq'));
    });

    it('appends geometry filters for resolution and fps', () => {
        const res = burn.validateBurnPair({
            videoPath: '/v/a.mp4',
            subtitlePath: '/v/a.srt',
            resolutionId: '720p',
            fpsId: '24',
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.job.videoFilter.includes('scale='));
        assert.ok(res.job.videoFilter.includes('720'));
        assert.ok(res.job.videoFilter.includes('fps=24'));
        assert.ok(res.job.videoFilter.includes('subtitles='));
        assert.strictEqual(res.job.resolutionId, '720p');
        assert.strictEqual(res.job.fpsId, '24');
    });

    it('supports encode speed, output suffix/dir, and yuv420p', () => {
        const res = burn.validateBurnPair({
            videoPath: 'D:/media/film.mp4',
            subtitlePath: 'D:/media/film.srt',
            encodeSpeedId: 'fast',
            outputSuffix: 'hardsub',
            outputDir: 'D:/out',
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.job.encodeSpeedId, 'fast');
        assert.ok(res.job.outputPath.replace(/\\/g, '/').endsWith('D:/out/film.hardsub.mp4')
            || res.job.outputPath.replace(/\\/g, '/').endsWith('/out/film.hardsub.mp4'));
        const args = burn.buildFfmpegBurnArgs(res.job);
        assert.ok(args.includes('veryfast'));
        assert.ok(args.includes('yuv420p'));
        const nv = burn.buildFfmpegBurnArgs({ ...res.job, encoderId: 'h264_nvenc', encodeSpeedId: 'slow' });
        assert.ok(nv.includes('p7'));
    });

    it('builds softsub mux args and rejects ASS in MP4 softsub', () => {
        const soft = burn.validateBurnPair({
            videoPath: '/v/a.mp4',
            subtitlePath: '/v/a.srt',
            outputMode: 'softsub',
            audioMode: 'aac',
            container: 'mkv',
            outputSuffix: 'softsub',
        });
        assert.strictEqual(soft.ok, true);
        assert.strictEqual(soft.job.outputMode, 'softsub');
        assert.strictEqual(soft.job.videoFilter, '');
        const args = burn.buildFfmpegBurnArgs(soft.job);
        assert.ok(args.includes('-c:v'));
        assert.ok(args.includes('copy'));
        assert.ok(args.includes('aac'));
        assert.ok(args.includes('-c:s'));
        assert.ok(!args.includes('-vf'));

        const bad = burn.validateBurnPair({
            videoPath: '/v/a.mp4',
            subtitlePath: '/v/a.ass',
            outputMode: 'softsub',
            container: 'mp4',
        });
        assert.strictEqual(bad.ok, false);
    });

    it('persists workspace style options in memory storage', () => {
        const store = {
            data: {},
            getItem(k) { return this.data[k] || null; },
            setItem(k, v) { this.data[k] = String(v); },
        };
        const saved = burn.saveWorkspaceOptions({
            container: 'mkv',
            outputMode: 'softsub',
            audioMode: 'aac',
            crf: 20,
            activePresetId: 'watch-white',
            activePresetName: '观影白字',
        }, store);
        assert.strictEqual(saved.ok, true);
        const loaded = burn.loadWorkspaceOptions(store);
        assert.strictEqual(loaded.outputMode, 'softsub');
        assert.strictEqual(loaded.activePresetId, 'watch-white');
        assert.strictEqual(loaded.container, undefined);
        assert.strictEqual(loaded.crf, undefined);
        assert.strictEqual(loaded.audioMode, undefined);
    });

    it('normalizes burn settings options for settings.json', () => {
        const n = burn.normalizeBurnSettingsOptions({
            burnContainer: 'MKV',
            burnCrf: 99,
            burnOutputSuffix: ' my_out ',
            container: 'mp4',
        });
        assert.strictEqual(n.burnContainer, 'mkv');
        assert.strictEqual(n.burnCrf, 28);
        assert.strictEqual(n.burnOutputSuffix, 'my_out');
        assert.strictEqual(n.burnEncoderId, 'libx264');
    });

    it('classifies sidecars and prefers dual track', () => {
        assert.strictEqual(burn.classifyBurnSidecarRole('film.dual.ass', 'film'), 'dual');
        assert.strictEqual(burn.classifyBurnSidecarRole('film.zh.srt', 'film'), 'target');
        assert.strictEqual(burn.classifyBurnSidecarRole('film.ja.srt', 'film'), 'source');
        const picked = burn.pickBurnTracksFromSidecars('film.mp4', [
            'film.zh.srt',
            'film.ja.srt',
            'film.dual.ass',
        ]);
        assert.strictEqual(picked.bilingualSubtitlePath, 'film.dual.ass');
        assert.strictEqual(picked.subtitlePath, 'film.zh.srt');
        assert.strictEqual(picked.sourceSubtitlePath, 'film.ja.srt');
        assert.strictEqual(burn.preferBurnSubtitlePath({
            subtitlePath: 'film.zh.srt',
            bilingualSubtitlePath: 'film.dual.ass',
            sourceSubtitlePath: 'film.ja.srt',
            subtitleTrack: 'source',
        }), 'film.ja.srt');
    });

    it('draft association accepts bilingual-only path', () => {
        const draft = burn.createDraftBatchItem({
            videoPath: '/a.mp4',
            bilingualSubtitlePath: '/a.dual.ass',
        });
        assert.strictEqual(draft.ok, true);
        assert.strictEqual(burn.isItemAssociated(draft.item), true);
    });

    it('parses available encoders', () => {
        const list = burn.parseAvailableEncoders(' V..... libx264\n V..... h264_nvenc\n');
        const ids = list.map((x) => x.id);
        assert.ok(ids.includes('libx264'));
        assert.ok(ids.includes('h264_nvenc'));
        assert.ok(!ids.includes('h264_qsv'));
    });

    it('batch queue helpers', () => {
        const made = burn.createBatchFromPairs([
            { videoPath: '/a.mp4', subtitlePath: '/a.srt' },
            { videoPath: '/b.mp4', subtitlePath: '/b.srt' },
        ], { container: 'mkv' });
        assert.strictEqual(made.ok, true);
        assert.strictEqual(made.items.length, 2);
        assert.ok(made.items[0].outputPath.endsWith('.burned.mkv'));
        assert.strictEqual(burn.nextPendingIndex(made.items), 0);
        made.items[0].status = 'done';
        assert.strictEqual(burn.nextPendingIndex(made.items), 1);
        const summary = burn.batchSummary(made.items);
        assert.strictEqual(summary.done, 1);
        assert.strictEqual(summary.pending, 1);

        made.items[1].status = 'failed';
        const reset = burn.resetFailedToPending(made.items);
        assert.strictEqual(reset[1].status, 'pending');
    });

    it('allows draft items missing subtitle until associated', () => {
        const draft = burn.createDraftBatchItem({ videoPath: '/a.mp4' });
        assert.strictEqual(draft.ok, true);
        assert.strictEqual(draft.item.subtitlePath, '');
        assert.strictEqual(burn.isItemAssociated(draft.item), false);
        const withSub = { ...draft.item, subtitlePath: '/a.srt' };
        assert.strictEqual(burn.isItemAssociated(withSub), true);
        const fromPairs = burn.createBatchFromPairs([{ videoPath: '/c.mp4' }]);
        assert.strictEqual(fromPairs.ok, true);
        assert.strictEqual(fromPairs.items[0].subtitlePath, '');
    });

    it('builds preview ASS from cues', () => {
        const ass = burn.buildPreviewAssContent({
            format: 'srt',
            cues: [{ startMs: 0, endMs: 1500, text: '你好' }],
            basicStyle: { fontSize: 22, primaryColor: '#FFFFFF', outline: 2, marginV: 40 },
        });
        assert.ok(ass.includes('[Script Info]'));
        assert.ok(ass.includes('Dialogue:'));
        assert.ok(ass.includes('你好'));
    });

    it('builds dual-style preview ASS when enableSource', () => {
        const ass = burn.buildPreviewAssContent({
            format: 'srt',
            cues: [{ startMs: 0, endMs: 1500, text: 'Hello\\N你好' }],
            basicStyle: {
                enableSource: true,
                fontSize: 22,
                primaryColor: '#FFFFFF',
                lineOrder: 'source-first',
                source: { fontSize: 18, primaryColor: '#CCCCCC' },
                target: { fontSize: 24, primaryColor: '#FFFFFF' },
            },
        });
        assert.ok(/Style: ZH,/i.test(ass));
        assert.ok(/Style: Source,/i.test(ass));
        assert.ok(/,Source,,/.test(ass));
        assert.ok(/,ZH,,/.test(ass));
    });

    it('preview ASS FontSize matches force_style for single-track burn', () => {
        const ass = burn.buildPreviewAssContent({
            format: 'srt',
            cues: [{ startMs: 0, endMs: 1000, text: '字号' }],
            basicStyle: { fontName: 'Microsoft YaHei', fontSize: 22, outline: 2, marginV: 40 },
            playResX: 1920,
            playResY: 1080,
        });
        const styleLine = ass.split('\n').find((l) => /^Style:\s*Default,/i.test(l));
        assert.ok(styleLine, 'Default style missing');
        const parts = styleLine.split(',');
        assert.strictEqual(parts[2], '22');
        const force = burn.buildForceStyle({ fontName: 'Microsoft YaHei', fontSize: 22, outline: 2, marginV: 40 });
        assert.ok(force.includes('FontSize=22'));
    });

    it('burn preview module uses ffmpeg hardsub clip (not JASSUB overlay)', () => {
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(
            path.join(__dirname, '../src/js/subtitle-burn-preview.js'),
            'utf8',
        );
        assert.ok(src.includes('ffmpegBurnPreviewClip'));
        assert.ok(src.includes('burnedPreview'));
        assert.ok(!src.includes('new JASSUB'));
        assert.ok(!src.includes('manualRender'));
    });

    it('builds preview ASS from raw SRT text when cues missing', () => {
        const ass = burn.buildPreviewAssContent({
            format: 'srt',
            text: '1\n00:00:01,000 --> 00:00:02,500\n预览行\n',
            cues: [],
            basicStyle: { fontSize: 22 },
        });
        assert.ok(ass.includes('Dialogue:'));
        assert.ok(ass.includes('预览行'));
        const cues = burn.parsePreviewCuesFromText('1\n00:00:00,000 --> 00:00:01,000\nA\n', 'srt');
        assert.strictEqual(cues.length, 1);
        assert.strictEqual(cues[0].text, 'A');
    });

    it('builds ffmpeg hardsub preview args as Chromium-safe clip', () => {
        const args = burn.buildFfmpegHardsubPreviewArgs({
            videoPath: '/in.mp4',
            outputPath: '/prev.mp4',
            videoFilter: "subtitles='/a.srt':force_style='FontSize=22'",
            previewStartSec: 10,
            previewDurationSec: 45,
            previewMaxHeight: 720,
        });
        assert.ok(args.includes('-c:v'));
        assert.strictEqual(args[args.indexOf('-c:v') + 1], 'libx264');
        assert.ok(args.includes('-pix_fmt'));
        assert.ok(args.includes('yuv420p'));
        assert.ok(args.includes('-ss'));
        assert.ok(args.includes('-t'));
        assert.ok(args.some((a) => String(a).includes('force_style=')));
    });

    it('parses ffmpeg progress time', () => {
        assert.strictEqual(burn.parseFfmpegTimeToSec('out_time_ms=1500000'), 1.5);
        assert.strictEqual(burn.parseFfmpegTimeToSec('frame=1 time=00:01:01.50 bitrate=1'), 61.5);
        assert.strictEqual(burn.progressPercent(30, 100), 30);
        assert.strictEqual(burn.progressPercent(100, 100), 99);
    });
});
