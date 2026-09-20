const assert = require('assert');
const log = require('../src/js/job-progress-log-core');

describe('job-progress-log-core', () => {
    it('formatJobStartLine includes task label', () => {
        assert.strictEqual(log.formatJobStartLine(3, '双语'), '开始任务（双语），共 3 个文件');
        assert.strictEqual(log.formatJobStartLine(1, ''), '开始任务，共 1 个文件');
    });

    it('dedupes duplicate starting events for the same file', () => {
        const trackers = log.createTrackers();
        const payload = {
            fullPath: 'D:\\media\\IPZZ-891.mp4',
            itemStage: 'starting',
        };
        assert.strictEqual(log.shouldLogStageTransition(trackers, payload), true);
        log.recordStageLog(trackers, payload);
        assert.strictEqual(log.shouldLogStageTransition(trackers, payload), false);
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            ...payload,
            itemDetail: '准备引擎任务…',
        }), false);
    });

    it('allows starting again for dual translate phase', () => {
        const trackers = log.createTrackers();
        const path = 'D:\\media\\clip.mp4';
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'starting',
            itemDualPhase: 'transcribe',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'starting',
            itemDualPhase: 'translate',
        }), true);
    });

    it('logs each stage once and ignores detail-only updates', () => {
        const trackers = log.createTrackers();
        const path = 'D:\\media\\clip.mp4';
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'model',
            itemDetail: 'Qwen3-ASR-0.6B',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'model',
            itemDetail: 'Qwen3-ASR-0.6B',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'model',
            itemDetail: '加载完成',
        }), false);
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'transcribe',
            itemDetail: '',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'transcribe',
            itemDetail: '',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'transcribe',
            itemDetail: '转写 12/120',
        }), false);
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'transcribe',
            itemDetail: 'ASR 回退到 Reazon',
        }), false);
    });

    it('formatStageLogLine omits heartbeat progress counters', () => {
        const line = log.formatStageLogLine({
            fileName: 'clip.mp4',
            index: 1,
            total: 1,
            itemStage: 'transcribe',
            itemDetail: '转写 12/120',
        }, {
            stageLabelFn: () => '转写',
            scrubDetailFn: (d) => d,
        });
        assert.strictEqual(line, '#1/1 转写：clip.mp4');
    });

    it('formatStageLogLine uses clearer starting head and detail', () => {
        const line = log.formatStageLogLine({
            fileName: 'IPZZ-891.mp4',
            index: 1,
            total: 1,
            itemStage: 'starting',
        }, {
            stageLabelFn: () => '启动',
        });
        assert.strictEqual(line, '#1/1 开始处理：IPZZ-891.mp4');

        const modelLine = log.formatStageLogLine({
            fileName: 'IPZZ-891.mp4',
            index: 1,
            total: 2,
            itemStage: 'model',
            itemDetail: 'Qwen3-ASR-0.6B',
        }, {
            stageLabelFn: () => '加载识别模型',
            scrubDetailFn: (d) => d,
        });
        assert.strictEqual(modelLine, '#1/2 加载识别模型：IPZZ-891.mp4 · Qwen3-ASR-0.6B');

        const translateStart = log.formatStageLogLine({
            fileName: 'ADN-806.mp4',
            index: 1,
            total: 1,
            itemStage: 'starting',
            itemDualPhase: 'translate',
            itemDetail: '从原文翻译（asr_done，1044 条）',
        }, {
            stageLabelFn: () => '启动',
            scrubDetailFn: (d) => d,
        });
        assert.strictEqual(
            translateStart,
            '#1/1 开始翻译：ADN-806.mp4 · 从原文翻译（asr_done，1044 条）',
        );

        const saveSrc = log.formatStageLogLine({
            fileName: 'ADN-806.mp4',
            index: 1,
            total: 1,
            itemStage: 'save',
            itemDualPhase: 'source',
            itemDetail: 'done · 收尾中…',
        }, {
            stageLabelFn: () => '保存字幕',
            scrubDetailFn: (d) => d,
        });
        assert.strictEqual(saveSrc, '#1/1 保存原文字幕：ADN-806.mp4 · done · 收尾中…');
    });

    it('logs correction and postprocess stages in the app log', () => {
        const trackers = log.createTrackers();
        const path = 'D:\\media\\clip.mp4';
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'vad',
        }), false);
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'semantic_repair',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'semantic_repair',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'cleanup',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'cleanup',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'qc_fix',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'qc_fix',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'cleanup',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'cleanup',
        });
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'postprocess',
        }), true);
    });

    it('suppresses save↔qc_loop oscillation spam during post-task', () => {
        const trackers = log.createTrackers();
        const path = 'D:\\media\\JJDA-080.mp4';
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'qc_loop',
            itemDetail: 'QC 闭环补译…',
        }), true);
        log.recordStageLog(trackers, {
            fullPath: path,
            itemStage: 'qc_loop',
            itemDetail: 'QC 闭环补译…',
        });
        // Synthetic sanitize hold must not log.
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'save',
            itemDetail: 'QC 闭环补译… · 收尾中…',
            itemDualPhase: 'translate',
        }), false);
        // Same qc_loop detail after a skipped save must not re-log.
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'qc_loop',
            itemDetail: 'QC 闭环补译…',
        }), false);
        // Still suppress further save holds without recording them.
        assert.strictEqual(log.shouldLogStageTransition(trackers, {
            fullPath: path,
            itemStage: 'save',
            itemDetail: 'QC 闭环补译… · 收尾中…',
            itemDualPhase: 'translate',
        }), false);
    });
});
