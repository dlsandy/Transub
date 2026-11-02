/**
 * End-to-end guards for SAN-494 class failures:
 * 1) Engine/posttask must never leave ZH at t≈0 when JA has a real timeline
 * 2) Rematerialize must stamp JA start/end onto every ZH row
 * 3) Serialized SRT must not be all 00:00:00,000
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    rematerializeSubtitlePairFiles,
    rematerializeCuesIfNeeded,
} = require('../electron/mt-pair-rematerialize');
const { readSubtitleDocument, writeSubtitleDocument } = require('../electron/extensions-bridge');
const keep = require('../electron/transcript-keep');
const handoff = require('../electron/engine-item-posttask-handoff');
const { serializeSubtitle } = require('../electron/subtitle-format');

function mkTimedJa(n, start0 = 2000, step = 1500) {
    const cues = [];
    for (let i = 0; i < n; i += 1) {
        const startMs = start0 + i * step;
        cues.push({
            index: i + 1,
            startMs,
            endMs: startMs + 900,
            text: `JA${i}`,
        });
    }
    return cues;
}

function mkZeroZh(n, texts) {
    const cues = [];
    for (let i = 0; i < n; i += 1) {
        cues.push({
            index: i + 1,
            startMs: 0,
            endMs: 0,
            text: texts ? texts[i] : `译${i}`,
        });
    }
    return cues;
}

function writeSrt(filePath, cues) {
    const body = serializeSubtitle({ format: 'srt', cues });
    fs.writeFileSync(filePath, body, 'utf8');
}

function countZeroTimingLines(raw) {
    return (String(raw).match(/00:00:00,000\s*-->\s*00:00:00,000/g) || []).length;
}

describe('ZH timing pipeline (SAN-494 class)', () => {
    it('detects padded all-@0 pile as lackValidTiming', () => {
        const zh = mkZeroZh(12).map((c) => ({ ...c, endMs: 1000 }));
        assert.strictEqual(keep.cuesLackValidTiming(zh), true);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(zh), true);
    });

    it('rematerializeCuesIfNeeded stamps JA times onto zero ZH', () => {
        const ja = mkTimedJa(20);
        const zh = mkZeroZh(20);
        const laid = rematerializeCuesIfNeeded(zh, ja);
        assert.strictEqual(laid.rematerialized, true);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(laid.cues), false);
        for (let i = 0; i < ja.length; i += 1) {
            assert.strictEqual(laid.cues[i].startMs, ja[i].startMs, `start i=${i}`);
            assert.strictEqual(laid.cues[i].endMs, ja[i].endMs, `end i=${i}`);
            assert.strictEqual(String(laid.cues[i].text), `译${i}`);
        }
    });

    it('rematerializeSubtitlePairFiles rewrites zero SRT to JA timeline', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-zh-timing-'));
        const zhPath = path.join(dir, 'clip.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        try {
            writeSrt(jaPath, mkTimedJa(16));
            // Raw all-zero file (engine cues_to_srt with missing start)
            fs.writeFileSync(
                zhPath,
                mkZeroZh(16).map((c, i) => (
                    `${i + 1}\n00:00:00,000 --> 00:00:00,000\n${c.text}\n`
                )).join('\n'),
                'utf8',
            );
            assert.ok(countZeroTimingLines(fs.readFileSync(zhPath, 'utf8')) >= 16);

            const rem = rematerializeSubtitlePairFiles(zhPath, jaPath, {
                force: true,
                preferPositional: true,
                backupMode: 'off',
            });
            assert.strictEqual(rem.ok, true);
            assert.strictEqual(rem.written, true);

            const out = readSubtitleDocument(zhPath);
            assert.ok(out.ok);
            assert.strictEqual(keep.cuesHaveBrokenTimeline(out.cues), false);
            assert.strictEqual(countZeroTimingLines(fs.readFileSync(zhPath, 'utf8')), 0);
            const ja = readSubtitleDocument(jaPath).cues;
            for (let i = 0; i < ja.length; i += 1) {
                assert.strictEqual(out.cues[i].startMs, ja[i].startMs);
                assert.strictEqual(out.cues[i].endMs, ja[i].endMs);
            }
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('posttask handoff refuses to keep zero ZH when JA is healthy', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-zh-handoff-'));
        const zhPath = path.join(dir, 'clip.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        const ja = mkTimedJa(12);
        const zhTexts = Array.from({ length: 12 }, (_, i) => (i === 0 ? '…' : `译${i}`));
        writeSrt(jaPath, ja);
        fs.writeFileSync(
            zhPath,
            zhTexts.map((t, i) => `${i + 1}\n00:00:00,000 --> 00:00:00,000\n${t}\n`).join('\n'),
            'utf8',
        );

        const timingFallback = {
            zh: zhTexts.map((text) => ({ start: 0, end: 0, startMs: 0, endMs: 0, text })),
            ja: ja.map((c) => ({
                start: c.startMs / 1000,
                end: c.endMs / 1000,
                text: c.text,
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
                },
                onLog: (line) => logs.push(String(line || '')),
            });
            assert.notStrictEqual(res?.cancelled, true, JSON.stringify(res));

            const out = readSubtitleDocument(zhPath);
            assert.ok(out?.ok);
            assert.strictEqual(
                keep.cuesHaveBrokenTimeline(out.cues),
                false,
                `still broken after handoff\n${logs.join('\n')}`,
            );
            assert.strictEqual(countZeroTimingLines(fs.readFileSync(zhPath, 'utf8')), 0);
            for (let i = 0; i < ja.length; i += 1) {
                assert.strictEqual(
                    out.cues[i].startMs,
                    ja[i].startMs,
                    `handoff start i=${i} got ${out.cues[i].startMs}`,
                );
            }
            // Must not stamp engine zero-snap as "任务结果恢复" without rematerialize.
            assert.ok(
                logs.some((l) => /按原文(?:时间轴)?重铺|时间轴护栏|重铺译文/.test(l)),
                `expected timing guard log, got:\n${logs.join('\n')}`,
            );
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('full engine-write + posttask job leaves JA times on ZH', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-full-job-'));
        const zhPath = path.join(dir, 'clip.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        const ja = mkTimedJa(12);
        ja[0].text = 'あー彼女教え…';
        const zhTexts = ['…', '啊 想让她教我', ...Array.from({ length: 10 }, (_, i) => `译${i + 1}`)];
        writeSrt(jaPath, ja);
        fs.writeFileSync(
            zhPath,
            zhTexts.map((t, i) => `${i + 1}\n00:00:00,000 --> 00:00:00,000\n${t}\n`).join('\n'),
            'utf8',
        );

        const { spawnSync } = require('child_process');
        const py = path.join(
            __dirname,
            '..',
            'transub-engine',
            'runtime',
            'python.exe',
        );
        const pyScript = `
import sys
sys.path.insert(0, r${JSON.stringify(path.join(__dirname, '..', 'transub-engine', 'runtime', 'Lib', 'site-packages'))})
from transub_engine.subtitles import ensure_cues_copy_timing, write_subtitle
src = [{"start": (2000 + i * 1500) / 1000.0, "end": (2900 + i * 1500) / 1000.0, "text": f"JA{i}"} for i in range(12)]
zh = [{"start": 0, "end": 0, "text": t} for t in ${JSON.stringify(zhTexts)}]
fixed = ensure_cues_copy_timing(zh, src)
out = r${JSON.stringify(path.join(dir, 'engine-out.srt'))}
write_subtitle(fixed, out, fmt="srt")
print("WROTE", out)
`;
        const pyExe = fs.existsSync(py) ? py : 'python';
        const pyRes = spawnSync(pyExe, ['-c', pyScript], { encoding: 'utf8' });
        assert.strictEqual(pyRes.status, 0, `engine write failed:\n${pyRes.stdout}\n${pyRes.stderr}`);
        const engineOut = path.join(dir, 'engine-out.srt');
        const engineDoc = readSubtitleDocument(engineOut);
        assert.ok(engineDoc.ok);
        assert.strictEqual(engineDoc.cues[0].startMs, 2000);
        assert.strictEqual(countZeroTimingLines(fs.readFileSync(engineOut, 'utf8')), 0);

        const rem = rematerializeSubtitlePairFiles(zhPath, jaPath, {
            force: true,
            preferPositional: true,
            backupMode: 'off',
        });
        assert.strictEqual(rem.written, true);
        const out = readSubtitleDocument(zhPath);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(out.cues), false);
        assert.strictEqual(out.cues[0].startMs, ja[0].startMs);
        assert.strictEqual(String(out.cues[0].text).trim(), '啊 想让她教我');
        assert.strictEqual(countZeroTimingLines(fs.readFileSync(zhPath, 'utf8')), 0);

        const res = await handoff.runItemPostTaskHandoff({
            mediaPath: path.join(dir, 'clip.mp4'),
            outPaths: {
                subtitlePath: zhPath,
                targetSubtitlePath: zhPath,
                sourceSubtitlePath: jaPath,
            },
            engineTask: 'translate',
            polishAlreadyDone: true,
            timingFallback: {
                zh: zhTexts.map((text) => ({ start: 0, end: 0, text })),
                ja: ja.map((c) => ({ start: c.startMs / 1000, end: c.endMs / 1000, text: c.text })),
            },
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
            },
        });
        assert.notStrictEqual(res?.cancelled, true);
        const after = readSubtitleDocument(zhPath);
        assert.strictEqual(keep.cuesHaveBrokenTimeline(after.cues), false);
        assert.ok(after.cues[0].startMs >= 1000);
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('Python ensure_cues_copy_timing fixes dead ZH before write', () => {
        const py = path.join(
            __dirname,
            '..',
            'transub-engine',
            'runtime',
            'Lib',
            'site-packages',
            'transub_engine',
            'subtitles.py',
        );
        assert.ok(fs.existsSync(py), 'engine subtitles.py missing');
        const { spawnSync } = require('child_process');
        const script = `
import sys
sys.path.insert(0, r${JSON.stringify(path.dirname(path.dirname(py)))})
from transub_engine.subtitles import ensure_cues_copy_timing, cues_to_srt
src = [{"start": 2.776, "end": 4.906, "text": "JA0"},
       {"start": 5.176, "end": 6.556, "text": "JA1"},
       {"start": 13.787, "end": 15.524, "text": "JA2"},
       {"start": 16.6, "end": 17.74, "text": "JA3"},
       {"start": 19.09, "end": 21.37, "text": "JA4"},
       {"start": 23.135, "end": 24.738, "text": "JA5"},
       {"start": 25.046, "end": 25.577, "text": "JA6"},
       {"start": 25.597, "end": 26.678, "text": "JA7"}]
zh = [{"start": 0, "end": 0, "text": f"译{i}"} for i in range(8)]
fixed = ensure_cues_copy_timing(zh, src)
assert abs(float(fixed[0]["start"]) - 2.776) < 1e-6, fixed[0]
assert abs(float(fixed[1]["start"]) - 5.176) < 1e-6, fixed[1]
raw = cues_to_srt(fixed)
assert "00:00:00,000 --> 00:00:00,000" not in raw, raw[:200]
assert "00:00:02,776 -->" in raw
print("OK")
`;
        // Prefer engine embedded python if present
        const candidates = [
            path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe'),
            'python',
            'py',
        ];
        let result = null;
        for (const exe of candidates) {
            result = spawnSync(exe, ['-c', script], { encoding: 'utf8' });
            if (result.status === 0) break;
        }
        assert.ok(result, 'no python');
        assert.strictEqual(
            result.status,
            0,
            `python ensure_cues_copy_timing failed:\n${result.stdout}\n${result.stderr}`,
        );
        assert.match(String(result.stdout), /OK/);
    });
});
