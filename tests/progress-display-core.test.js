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
