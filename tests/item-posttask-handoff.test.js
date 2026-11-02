const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../src/js/item-posttask-paths-core');
const progress = require('../src/js/per-item-qc-pipeline-core');
const handoff = require('../electron/engine-item-posttask-handoff');

describe('item-posttask-paths-core', () => {
    it('collectPostBatchPaths dedupes target + bilingual', () => {
        const list = paths.collectPostBatchPaths({
            targetSubtitlePath: 'a.zh.srt',
            bilingualSubtitlePath: 'a.srt',
        });
        assert.deepStrictEqual(list, ['a.zh.srt', 'a.srt']);
    });

    it('resolveQcSemanticPairPath prefers JA sidecar for ZH fix path', () => {
        const pair = paths.resolveQcSemanticPairPath({
            sourceSubtitlePath: 'a.ja.srt',
            targetSubtitlePath: 'a.zh.srt',
        }, 'a.zh.srt');
        assert.strictEqual(pair, 'a.ja.srt');
    });
});

describe('per-item posttask progress', () => {
    it('maps polish/qc/finalize bands inside 95–100', () => {
        assert.strictEqual(progress.mapPostTaskProgress('polish', 0), 95);
        assert.strictEqual(progress.mapPostTaskProgress('polish', 100), 98);
        assert.ok(progress.mapPostTaskProgress('qc', 50) >= 98);
        assert.strictEqual(progress.mapPostTaskProgress('preset', 100), 100);
    });

    it('shouldRunItemPostTask when any step enabled', () => {
        assert.strictEqual(progress.shouldRunItemPostTask({ hasSubtitle: true }), false);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            qcScanEnabled: true,
        }), true);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            chineseVariant: 'traditional',
        }), true);
        assert.strictEqual(progress.shouldRunItemPostTask({
            hasSubtitle: true,
            insertSoftwareCredit: true,
        }), true);
    });
});

describe('engine-item-posttask-handoff', () => {
    it('buildItemRecord copies output paths', () => {
        const item = handoff.buildItemRecord({
            subtitlePath: 'out.srt',
            sourceSubtitlePath: 'out.ja.srt',
            bilingualSubtitlePath: 'dual.srt',
        }, 'video.mp4');
        assert.strictEqual(item.path, 'video.mp4');
        assert.strictEqual(item.subtitlePath, 'out.srt');
        assert.strictEqual(item.bilingualSubtitlePath, 'dual.srt');
    });

    it('scanDocIssueCount uses post-batch defaults (not legacy fluency-off)', () => {
        const touching = [
            { startMs: 0, endMs: 2000, text: 'first line ok' },
            { startMs: 2000, endMs: 4000, text: 'second line ok' },
        ];
        const doc = { ok: true, cues: touching };
        const legacyOff = handoff.scanDocIssueCount(doc, { checkFluency: false, gapMs: 0 });
        const aligned = handoff.scanDocIssueCount(doc);
        assert.strictEqual(legacyOff, 0);
        assert.ok(aligned >= 1);
    });

    it('shouldSkipFakeGreetingForMt when smart translate enabled', () => {
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ smartTranslate: true }), true);
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ translateMode: 'smart' }), true);
        assert.strictEqual(handoff.shouldSkipFakeGreetingForMt({ contentProfile: 'av_soft' }), false);
    });

    it('resolveCreditLangForPath uses source language for 原文 track', () => {
        const item = {
            sourceSubtitlePath: 'F:/out/a.ja.srt',
            bilingualSubtitlePath: 'F:/out/a.dual.srt',
            subtitlePath: 'F:/out/a.zh.srt',
        };
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'ja' }),
            'ja',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'ko' }),
            'ko',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.ja.srt', item, { language: 'en' }),
            'en',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.zh.srt', item, { language: 'ja' }),
            'zh',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/a.dual.srt', item, {
                language: 'ja',
                mergeBilingualSubtitles: true,
            }),
            'bilingual',
        );
        assert.strictEqual(
            handoff.resolveCreditLangForPath('F:/out/clip.ko.srt', {}, { language: 'auto' }),
            'ko',
        );
        // Shelf 原文 sidecar is not item.sourceSubtitlePath — still JA watermark.
        assert.strictEqual(
            handoff.resolveCreditLangForPath(
                'F:/Transub3/subtitles/clip.original.srt',
                item,
                { language: 'ja' },
            ),
            'ja',
        );
        assert.strictEqual(
            handoff.isSourceTrackSubtitlePath('F:/Transub3/subtitles/clip.original.srt', item),
            true,
        );
        assert.strictEqual(
            handoff.isSourceTrackSubtitlePath('F:/Transub3/subtitles/clip.transcribe.srt', {}),
            true,
        );
    });

    it('runItemPostTaskHandoff returns cancelled when shouldStop', async () => {
        const res = await handoff.runItemPostTaskHandoff({
            mediaPath: 'video.mp4',
            outPaths: { subtitlePath: 'a.zh.srt', sourceSubtitlePath: 'a.ja.srt' },
            options: { task: 'translate' },
            shouldStop: () => true,
        });
        assert.strictEqual(res.cancelled, true);
        assert.strictEqual(res.code, 'cancelled');
    });

    it('runItemPostTaskHandoff returns cancelled when abort signal aborted', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        const res = await handoff.runItemPostTaskHandoff({
            mediaPath: 'video.mp4',
            outPaths: { subtitlePath: 'a.zh.srt' },
            signal: ctrl.signal,
        });
        assert.strictEqual(res.cancelled, true);
    });

    it('OpenCC runs after timing force-restore (issue #72 order guard)', () => {
        const src = fs.readFileSync(
            require.resolve('../electron/engine-item-posttask-handoff'),
            'utf8',
        );
        const fnStart = src.indexOf('async function runItemPostTaskHandoff');
        assert.ok(fnStart >= 0);
        const body = src.slice(fnStart);
        const restoreMarker = body.indexOf('恢复（成对强制）');
        const convertCall = body.indexOf('await runChineseConvert(');
        assert.ok(restoreMarker >= 0, 'expected timing force-restore log');
        assert.ok(convertCall >= 0, 'expected runChineseConvert in handoff');
        assert.ok(
            convertCall > restoreMarker,
            'runChineseConvert must run after timing force-restore so Traditional survives',
        );
    });

    it('traditional target survives GalTransl-style force pair restore', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-hant-72-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.ja.srt');
        const mkSrt = (lines) => lines.map((text, i) => {
            const n = i + 1;
            const start = i * 2;
            const end = start + 1;
            const ts = (s) => {
                const h = String(Math.floor(s / 3600)).padStart(2, '0');
                const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
                const sec = String(s % 60).padStart(2, '0');
                return `${h}:${m}:${sec},000`;
            };
            return `${n}\n${ts(start)} --> ${ts(end)}\n${text}\n`;
        }).join('\n');
        const zhHans = [
            '这是台湾的软件',
            '里面有默认设置',
            '还可以连接网络',
            '请打开数据文件',
            '然后开始运行程序',
            '完成之后会自动保存',
            '记得检查时间信息',
            '最后确认输出结果',
        ];
        const jaLines = [
            'これは台湾のソフトです',
            '中にデフォルト設定があります',
            'ネットワークにもつながります',
            'データファイルを開いてください',
            'それからプログラムを実行します',
            '完了後は自動保存されます',
            '時間情報を確認してください',
            '最後に出力結果を確認します',
        ];
        fs.writeFileSync(zhPath, mkSrt(zhHans), 'utf8');
        fs.writeFileSync(jaPath, mkSrt(jaLines), 'utf8');

        const timingFallback = {
            zh: zhHans.map((text, i) => ({
                start: i * 2,
                end: i * 2 + 1,
                text,
            })),
            ja: jaLines.map((text, i) => ({
                start: i * 2,
                end: i * 2 + 1,
                text,
            })),
        };

        const logs = [];
        try {
            const res = await handoff.runItemPostTaskHandoff({
                mediaPath: path.join(dir, 'clip.mp4'),
                outPaths: {
                    subtitlePath: zhPath,
                    targetSubtitlePath: zhPath,
                    sourceSubtitlePath: jaPath,
                },
                engineTask: 'translate',
                polishAlreadyDone: true,
                timingFallback,
                options: {
                    task: 'translate',
                    chineseSubtitleVariant: 'traditional',
                    subtitleTargetLang: 'zh-Hant',
                    postBatchQc: false,
                    postBatchQcFixMode: 'none',
                    mtSanitize: false,
                    insertSoftwareCredit: false,
                    postQcLoopMaxPasses: 0,
                    qualityPipelineMode: 'off',
                    dropUselessEllipsis: false,
                    postBatchRemoveNoise: false,
                    postBatchBlankRetranslate: false,
                },
                onLog: (line) => logs.push(String(line || '')),
            });
            assert.notStrictEqual(res?.cancelled, true, `handoff cancelled: ${JSON.stringify(res)}`);
            const out = fs.readFileSync(zhPath, 'utf8');
            // twp: 默认→預設, 软件→軟體, 文件→檔案, 信息→資訊
            assert.ok(
                /預設|軟體|檔案|資訊/.test(out),
                `expected Traditional after force restore, got:\n${out}\nlogs:\n${logs.join('\n')}`,
            );
            assert.ok(
                !/这是台湾的软件/.test(out),
                'Simplified seed line should not remain after OpenCC',
            );
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('does not stamp all-zero engine ZH over delivery; rematerializes onto JA', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-zero-snap-'));
        const zhPath = path.join(dir, 'clip.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        const timingPcm = path.join(dir, 'clip.timing-16k.wav');
        const mkTimed = (lines, start0 = 2000) => lines.map((text, i) => {
            const n = i + 1;
            const start = start0 + i * 1500;
            const end = start + 900;
            const ts = (ms) => {
                const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
                const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
                const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
                const f = String(ms % 1000).padStart(3, '0');
                return `${h}:${m}:${s},${f}`;
            };
            return `${n}\n${ts(start)} --> ${ts(end)}\n${text}\n`;
        }).join('\n');
        const zhLines = Array.from({ length: 12 }, (_, i) => `译${i}`);
        const jaLines = Array.from({ length: 12 }, (_, i) => `JA${i}`);
        // Disk ZH already dead (all @0) — what the bad engine snap would also look like.
        fs.writeFileSync(
            zhPath,
            zhLines.map((t, i) => `${i + 1}\n00:00:00,000 --> 00:00:00,000\n${t}\n`).join('\n'),
            'utf8',
        );
        fs.writeFileSync(jaPath, mkTimed(jaLines), 'utf8');
        // Presence alone used to crash posttask: const options = …; options = { … }.
        fs.writeFileSync(timingPcm, Buffer.alloc(0));

        const timingFallback = {
            // Engine ZH snap also all-zero (seconds missing / startMs=0).
            zh: zhLines.map((text) => ({ start: 0, end: 0, startMs: 0, endMs: 0, text })),
            ja: jaLines.map((text, i) => ({
                start: (2000 + i * 1500) / 1000,
                end: (2000 + i * 1500 + 900) / 1000,
                text,
            })),
        };

        const logs = [];
        try {
            const res = await handoff.runItemPostTaskHandoff({
                mediaPath: path.join(dir, 'clip.mp4'),
                outPaths: {
                    subtitlePath: zhPath,
                    targetSubtitlePath: zhPath,
                    sourceSubtitlePath: jaPath,
                    timingAudioPath: timingPcm,
                },
                engineTask: 'translate',
                polishAlreadyDone: true,
                timingFallback,
                options: {
                    task: 'translate',
                    chineseSubtitleVariant: 'simplified',
                    postBatchQc: false,
                    postBatchQcFixMode: 'none',
                    mtSanitize: false,
                    insertSoftwareCredit: false,
                    postQcLoopMaxPasses: 0,
                    qualityPipelineMode: 'off',
                    dropUselessEllipsis: false,
                    postBatchRemoveNoise: false,
                    postBatchBlankRetranslate: false,
                    timingAudioPath: timingPcm,
                },
                onLog: (line) => logs.push(String(line || '')),
            });
            assert.notStrictEqual(res?.cancelled, true, JSON.stringify(res));
            assert.ok(res?.ok !== false, `handoff failed: ${JSON.stringify(res)}`);
            const { readSubtitleDocument } = require('../electron/extensions-bridge');
            const keep = require('../electron/transcript-keep');
            const out = readSubtitleDocument(zhPath);
            assert.ok(out?.ok);
            assert.strictEqual(keep.cuesHaveBrokenTimeline(out.cues), false, logs.join('\n'));
            assert.ok(out.cues[0].startMs >= 1000, `start0=${out.cues[0].startMs}`);
            assert.ok(out.cues[5].startMs > out.cues[0].startMs);
            assert.strictEqual(String(out.cues[2].text).trim(), '译2');
            assert.ok(
                logs.some((l) => /按原文(?:时间轴)?重铺|时间轴护栏|重铺译文/.test(l)),
                `expected rematerialize/restore log, got:\n${logs.join('\n')}`,
            );
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('accepts timingAudioPath without Assignment to constant variable (START-655)', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-timing-audio-'));
        const zhPath = path.join(dir, 'clip.srt');
        const timingPcm = path.join(dir, 'clip.timing-16k.wav');
        const body = Array.from({ length: 8 }, (_, i) => {
            const start = i * 2;
            const end = start + 1;
            const ts = (s) => `00:00:0${s},000`;
            return `${i + 1}\n${ts(start)} --> ${ts(end)}\nline${i}\n`;
        }).join('\n');
        fs.writeFileSync(zhPath, body, 'utf8');
        fs.writeFileSync(timingPcm, Buffer.alloc(0));
        try {
            const res = await handoff.runItemPostTaskHandoff({
                mediaPath: path.join(dir, 'clip.mp4'),
                outPaths: {
                    subtitlePath: zhPath,
                    targetSubtitlePath: zhPath,
                    timingAudioPath: timingPcm,
                },
                engineTask: 'translate',
                polishAlreadyDone: true,
                options: {
                    task: 'translate',
                    chineseSubtitleVariant: 'simplified',
                    postBatchQc: false,
                    postBatchQcFixMode: 'none',
                    mtSanitize: false,
                    insertSoftwareCredit: false,
                    postQcLoopMaxPasses: 0,
                    qualityPipelineMode: 'off',
                    dropUselessEllipsis: false,
                    postBatchRemoveNoise: false,
                    postBatchBlankRetranslate: false,
                    timingAudioPath: timingPcm,
                },
            });
            assert.notStrictEqual(res?.cancelled, true, JSON.stringify(res));
            assert.ok(res?.ok !== false, JSON.stringify(res));
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });
});
