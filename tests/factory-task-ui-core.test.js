const assert = require('assert');
const ui = require('../src/js/factory-task-ui-core');

describe('factory-task-ui-core', () => {
    it('normalizeView defaults to cards', () => {
        assert.strictEqual(ui.normalizeView('cards'), 'cards');
        assert.strictEqual(ui.normalizeView('table'), 'table');
        assert.strictEqual(ui.normalizeView(''), 'cards');
        assert.strictEqual(ui.normalizeView(null), 'cards');
    });

    it('pipelineIndexForStage maps engine stages', () => {
        assert.strictEqual(ui.pipelineIndexForStage('starting', 'running'), 0);
        assert.strictEqual(ui.pipelineIndexForStage('transcribe', 'running'), 1);
        assert.strictEqual(ui.pipelineIndexForStage('semantic_repair', 'running'), 2);
        assert.strictEqual(ui.pipelineIndexForStage('pre_mt_qc', 'running'), 2);
        assert.strictEqual(ui.pipelineIndexForStage('translate', 'running'), 3);
        assert.strictEqual(ui.pipelineIndexForStage('cleanup', 'running'), 3);
        assert.strictEqual(ui.pipelineIndexForStage('qc_fix', 'running'), 4);
        assert.strictEqual(ui.pipelineIndexForStage('qc_loop', 'running'), 4);
        assert.strictEqual(ui.pipelineIndexForStage('save', 'running'), 5);
        assert.strictEqual(ui.pipelineIndexForStage('', 'done'), 5);
        assert.strictEqual(ui.pipelineIndexForStage('', 'ready'), 0);
    });

    it('resolvePipelineIndex never rolls back on late re-ASR', () => {
        const item = {
            status: 'running',
            stage: 'translate',
            progress: 88,
            detail: '剧情贴合润色（抽样 36 条）…',
        };
        assert.strictEqual(ui.resolvePipelineIndex(item), 3);
        assert.strictEqual(item.pipeHighWater, 3);

        // QC closed-loop re-transcribe / unknown stage must stay at high-water.
        item.stage = 'transcribe';
        item.detail = 'QC 闭环重转 1/2…';
        assert.strictEqual(ui.resolvePipelineIndex(item), 3);

        item.stage = 'qc_loop';
        item.progress = 98;
        assert.strictEqual(ui.resolvePipelineIndex(item), 4);
        assert.strictEqual(item.pipeHighWater, 4);
    });

    it('resolvePipelineIndex honors pipelineFloor for shelf translate-only jobs', () => {
        assert.strictEqual(ui.resolvePipelineIndex({
            status: 'pending',
            pipelineFloor: 3,
            stage: 'translate',
        }), 3);
        const running = {
            status: 'running',
            pipelineFloor: 3,
            stage: 'translate',
            progress: 8,
        };
        assert.strictEqual(ui.resolvePipelineIndex(running), 3);
        assert.strictEqual(running.pipeHighWater, 3);
    });

    it('pipelineIndexForProgress floors by overall percent', () => {
        assert.strictEqual(ui.pipelineIndexForProgress(88, 'running'), 3);
        assert.strictEqual(ui.pipelineIndexForProgress(63, 'running'), 2);
        assert.strictEqual(ui.pipelineIndexForProgress(40, 'running'), 1);
        assert.strictEqual(ui.pipelineIndexForProgress(98, 'running'), 4);
    });

    it('buildRecipeSummary joins task language translate params', () => {
        const s = ui.buildRecipeSummary({
            task: 'translate',
            language: 'ja',
            targetLang: 'simplified',
            translateLabel: '智能翻译',
            senseLabel: '影视对白',
            qcLabel: '智能 Pro',
        });
        assert.ok(s.includes('翻译'));
        assert.ok(s.includes('日语'));
        assert.ok(s.includes('简中'));
        assert.ok(s.includes('智能翻译'));
        assert.ok(s.includes('影视对白'));
        assert.ok(s.includes('QC'));
    });

    it('buildRecipeSummary includes bilingual label for dual', () => {
        const s = ui.buildRecipeSummary({
            task: 'dual',
            language: 'ja',
            targetLang: 'simplified',
            bilingualLabel: '双语合并·译上',
            qcLabel: '关闭',
        });
        assert.ok(s.includes('双语'));
        assert.ok(s.includes('双语合并·译上'));
        assert.ok(!s.includes('QC'));
    });

    it('findStationItem prefers running', () => {
        const items = [
            { path: 'a.mkv', status: 'ready' },
            { path: 'b.mkv', status: 'running' },
            { path: 'c.mkv', status: 'done' },
        ];
        assert.strictEqual(ui.findStationItem(items, 'a.mkv').path, 'b.mkv');
    });

    it('filterQueueIndices drops station item', () => {
        const items = [{ status: 'running' }, { status: 'ready' }, { status: 'done' }];
        const tab = [0, 1, 2];
        assert.deepStrictEqual(ui.filterQueueIndices(items, tab, items[0]), [1, 2]);
    });

    it('buildStationHtml includes pipeline and pct', () => {
        const html = ui.buildStationHtml({
            path: 'D:/films/film_a.mkv',
            status: 'running',
            progress: 62,
            stage: 'translate',
            detail: '翻译中',
        }, {
            esc: (s) => String(s ?? ''),
            basename: (p) => String(p).split(/[/\\]/).pop(),
            elapsed: '2:08',
            eta: '4:20',
            recipeLine: '翻译 · 日→简',
            idx: 0,
        });
        assert.ok(html.includes('film_a.mkv'));
        assert.ok(html.includes('62%'));
        assert.ok(html.includes('task-pipe-rail'));
        assert.ok(html.includes('正在处理'));
    });

    it('buildCardHtml exposes data-idx and check', () => {
        const html = ui.buildCardHtml({
            path: 'x.mp4',
            status: 'ready',
            selected: true,
            duration: 90,
        }, 3, {
            esc: (s) => String(s ?? ''),
            basename: () => 'x.mp4',
            formatDuration: () => '1:30',
            queuePos: '#2',
            statusMetaFn: () => ({ label: '就绪', cls: 'row-status-ready' }),
        });
        assert.ok(html.includes('data-idx="3"'));
        assert.ok(html.includes('data-row-check'));
        assert.ok(html.includes('task-card-drag'));
        assert.ok(html.includes('task-card-stripe'));
        assert.ok(html.includes('task-card-status'));
        assert.ok(html.includes('task-card-progress-col'));
        assert.ok(!html.includes('task-pipe-dots'));
        assert.ok(!html.includes('task-card-run'));
    });

    it('buildPipelineRailHtml marks inbound segment as flowing', () => {
        const html = ui.buildPipelineRailHtml(2, { esc: (s) => String(s ?? '') });
        assert.ok(html.includes('is-current'));
        assert.ok(html.includes('task-pipe-seg is-flow'));
        assert.ok(html.includes('task-pipe-seg is-done'));
    });

    it('buildCardHtml embeds pipeline for running items', () => {
        const html = ui.buildCardHtml({
            path: 'D:/films/film_a.mkv',
            status: 'running',
            progress: 66,
            stage: 'translate',
            detail: '字幕翻译中',
        }, 0, {
            esc: (s) => String(s ?? ''),
            basename: (p) => String(p).split(/[/\\]/).pop(),
            formatDuration: () => '',
            elapsed: '2:28',
            eta: '约 1分16秒',
            recipeLine: '翻译：英语 -> 简中 · 智能',
            canStop: true,
            canRemove: false,
            statusMetaFn: () => ({ label: '进行中', cls: 'row-status-running' }),
        });
        assert.ok(html.includes('is-running-rich'));
        assert.ok(html.includes('task-pipe-rail'));
        assert.ok(html.includes('66%'));
        assert.ok(html.includes('字幕翻译中'));
        assert.ok(html.includes('剩余时间约 1分16秒'));
        assert.ok(html.includes('耗时 2:28'));
        assert.ok(html.includes('data-stop-idx="0"'));
        assert.ok(!html.includes('data-remove-idx'));
        assert.ok(html.includes('翻译：英语 -> 简中 · 智能'));
    });

    it('buildCardHtml shows remove and elapsed when idle', () => {
        const html = ui.buildCardHtml({
            path: 'a.mkv',
            status: 'done',
            progress: 100,
            startedAt: 1,
        }, 2, {
            esc: (s) => String(s ?? ''),
            basename: () => 'a.mkv',
            formatDuration: () => '1:00',
            elapsed: '3:45',
            processed: '55:00',
            canRemove: true,
            canStop: false,
            statusMetaFn: () => ({ label: '完成', cls: 'row-status-done' }),
        });
        assert.ok(html.includes('data-remove-idx="2"'));
        assert.ok(html.includes('耗时 3:45'));
        assert.ok(!html.includes('data-stop-idx'));
        assert.ok(!html.includes('task-card-qc'));
    });

    it('buildCardHtml shows execute and more actions', () => {
        const html = ui.buildCardHtml({
            path: 'a.mkv',
            status: 'ready',
        }, 1, {
            esc: (s) => String(s ?? ''),
            basename: () => 'a.mkv',
            formatDuration: () => '',
            canRemove: true,
            statusMetaFn: () => ({ label: '就绪', cls: 'row-status-ready' }),
        });
        assert.ok(html.includes('data-execute-idx="1"'));
        assert.ok(html.includes('fa-play'));
        assert.ok(html.includes('data-more-idx="1"'));
        assert.ok(!html.includes('data-play-idx'));
        assert.ok(!html.includes('data-burn-idx'));
        assert.ok(!html.includes('task-card-qc'));
    });

    it('buildCardHtml shows burn action when done', () => {
        const html = ui.buildCardHtml({
            path: 'a.mkv',
            status: 'done',
            targetSubtitlePath: 'a.zh.srt',
        }, 4, {
            esc: (s) => String(s ?? ''),
            basename: () => 'a.mkv',
            formatDuration: () => '',
            subPath: 'a.zh.srt',
            canRemove: true,
            statusMetaFn: () => ({ label: '完成', cls: 'row-status-done' }),
        });
        assert.ok(html.includes('data-burn-idx="4"'));
        assert.ok(html.includes('fa-fire'));
    });

    it('buildCardHtml embeds style badge button when provided', () => {
        const html = ui.buildCardHtml({
            path: 'a.mkv',
            status: 'ready',
        }, 3, {
            esc: (s) => String(s ?? ''),
            basename: () => 'a.mkv',
            formatDuration: () => '',
            canRemove: true,
            statusMetaFn: () => ({ label: '就绪', cls: 'row-status-ready' }),
            styleBadgeHtml: '<button type="button" class="row-style-badge is-global" data-translate-style-idx="3"><i class="fa fa-font" aria-hidden="true"></i><span class="row-style-badge-label">默认</span></button>',
        });
        assert.ok(html.includes('data-translate-style-idx="3"'));
        assert.ok(html.includes('row-style-badge'));
        assert.ok(html.includes('默认'));
        assert.ok(html.includes('fa-font'));
    });
});
