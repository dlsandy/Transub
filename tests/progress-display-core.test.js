const assert = require('assert');
const prog = require('../src/js/progress-display-core');

describe('progress-display-core', () => {
    const scrub = (d) => String(d || '').replace(/^转写中\s*[·•]?\s*/u, '').trim();

    it('stageLabel dual phases', () => {
        assert.strictEqual(
            prog.stageLabel('transcribe', { itemDualPhase: 'transcribe' }),
            '双语 · 生成原文',
        );
        assert.strictEqual(
            prog.stageLabel('transcribe', { itemDualPhase: 'translate' }),
            '双语 · 生成译文',
        );
        assert.strictEqual(
            prog.stageLabel('translate', { itemDualPhase: 'translate' }),
            '字幕翻译中',
        );
        assert.strictEqual(
            prog.stageLabel('cleanup', { itemDualPhase: 'translate' }),
            '译文校正',
        );
        assert.strictEqual(
            prog.stageLabel('qc_fix', { itemDualPhase: 'translate' }),
            '译文校正 · QC修复',
        );
        assert.strictEqual(
            prog.stageLabel('postprocess', { itemDualPhase: 'translate' }),
            '字幕后期处理',
        );
        assert.strictEqual(
            prog.stageLabel('semantic_repair', { itemDualPhase: 'transcribe' }),
            '原文校正',
        );
        assert.strictEqual(
            prog.stageLabel('model', { itemDualPhase: 'translate' }),
            '加载识别模型',
        );
        assert.strictEqual(
            prog.stageLabel('save', { itemDualPhase: 'translate' }),
            '保存译文字幕',
        );
        assert.strictEqual(
            prog.stageLabel('transcribe', { task: 'translate' }),
            '翻译中',
        );
    });

    it('formatRunningProgressLabel strips dual boilerplate', () => {
        const label = prog.formatRunningProgressLabel('transcribe', '生成原文…. 00:10', {
            itemDualPhase: 'transcribe',
            scrubProgressDetail: scrub,
        });
        assert.ok(label.includes('双语 · 生成原文'));
        assert.ok(label.includes('00:10'));
    });

    it('effectiveItemProgress caps at 99 while running', () => {
        assert.strictEqual(
            prog.effectiveItemProgress('transcribe', 100, { running: true }),
            99,
        );
        assert.strictEqual(
            prog.effectiveItemProgress('done', 100, { running: false }),
            100,
        );
    });

    it('resolveIdleProgressLabel', () => {
        assert.strictEqual(prog.resolveIdleProgressLabel([]), prog.IDLE_PROGRESS_LABEL_WAIT_NEW);
        assert.strictEqual(
            prog.resolveIdleProgressLabel([{ status: 'done' }]),
            prog.IDLE_PROGRESS_LABEL_WAIT_NEW,
        );
        assert.strictEqual(
            prog.resolveIdleProgressLabel([{ status: 'pending' }]),
            prog.IDLE_PROGRESS_LABEL_WAIT_RUN,
        );
        assert.strictEqual(
            prog.resolveIdleProgressLabel([{ status: 'ready' }]),
            prog.IDLE_PROGRESS_LABEL_WAIT_RUN,
        );
    });

    it('computeDisplayProgress batch label', () => {
        const d = prog.computeDisplayProgress({
            running: true,
            itemStage: 'transcribe',
            videoProgress: 50,
            index: 2,
            total: 4,
            videoTotalSec: 10,
            isPreTranscribeStage: () => false,
        });
        assert.ok(d.label.includes('第 2 / 4'));
        assert.ok(d.pct <= 99);
    });

    it('formatElapsedCell / formatProcessedCell', () => {
        const fmt = (s) => `${s}s`;
        assert.strictEqual(
            prog.formatElapsedCell({ status: 'ready' }, { formatDuration: fmt }),
            '—',
        );
        assert.strictEqual(
            prog.formatProcessedCell(
                { status: 'done', duration: 12 },
                { formatDuration: fmt },
            ),
            '12s',
        );
    });
});
