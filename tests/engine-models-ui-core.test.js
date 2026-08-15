const assert = require('assert');
const ui = require('../src/js/engine-models-ui-core');

describe('engine-models-ui-core', () => {
    it('formats download errors with mirror hints', () => {
        assert.strictEqual(ui.formatEngineDownloadError(''), '模型下载失败');
        assert.ok(ui.formatEngineDownloadError('ConnectTimeoutError').includes('镜像'));
        const keep = '无法连接模型仓库：自定义';
        assert.strictEqual(ui.formatEngineDownloadError(keep), keep);
        assert.ok(ui.formatEngineDownloadError('numba failed to build wheel').includes('numpy 2.4'));
    });

    it('clamps progress and ring-buffers log lines', () => {
        assert.deepStrictEqual(ui.clampDownloadProgressPct(150).label, '100%');
        assert.strictEqual(ui.clampDownloadProgressPct('x').label, '…');
        const lines = [];
        ui.pushDownloadLogLine(lines, 'a');
        ui.pushDownloadLogLine(lines, '');
        for (let i = 0; i < 90; i += 1) ui.pushDownloadLogLine(lines, `l${i}`, 80);
        assert.strictEqual(lines.length, 80);
    });

    it('filters and sorts pick catalog', () => {
        const catalog = [
            { id: 'b', name: 'B', group: 'asr', installed: false },
            { id: 'a', name: 'A', group: 'asr', installed: true, recommended: true },
            { id: 's', name: 'Sep', group: 'separate', note: 'demucs' },
        ];
        const all = ui.filterAndSortEnginePickItems(catalog, { filter: 'all', query: '' });
        assert.strictEqual(all[0].id, 'a');
        const sep = ui.filterAndSortEnginePickItems(catalog, { filter: 'all', query: '人声' });
        assert.strictEqual(sep.length, 1);
        assert.strictEqual(sep[0].id, 's');
        assert.strictEqual(ui.formatModelsSummary({ total: 3, visible: 1 }), '显示 1 / 3');
    });

    it('builds select options html and test messages', () => {
        const esc = (s) => String(s).replace(/</g, '&lt;');
        const built = ui.buildInstalledModelSelectOptionsHtml({
            models: [
                { id: 'm1', name: 'Model 1', kind: 'asr', installed: true },
                { id: 'm2', name: 'Model 2', kind: 'asr', installed: false },
            ],
            kind: 'asr',
            selectedId: 'missing',
            esc,
        });
        assert.ok(built.html.includes('m1'));
        assert.ok(built.html.includes('missing'));
        assert.ok(!built.html.includes('m2'));

        const failMsg = ui.formatEngineTestResultMessage(
            { ok: false, error: 'boom', baseUrl: 'http://127.0.0.1:8765' },
            { installPath: 'D:/eng' },
        );
        assert.ok(failMsg.includes('检测未通过'));
        assert.ok(failMsg.includes('boom'));

        const okMsg = ui.formatEngineTestResultMessage(
            { ok: true, version: '1.0', baseUrl: 'http://x', spawned: true, health: {} },
            {
                models: [{ installed: true }, { installed: false }],
                demucs: { status: 'ready' },
            },
        );
        assert.ok(okMsg.includes('引擎已就绪'));
        assert.ok(okMsg.includes('已安装 1'));
        assert.ok(okMsg.includes('Demucs 可用'));
    });

    it('decides progress log throttle actions', () => {
        assert.strictEqual(
            ui.decideEngineDlProgressLogAction({
                line: 'same',
                lastText: 'same',
                canReuse: true,
                now: 1000,
                lastAt: 999,
            }),
            'skip',
        );
        assert.strictEqual(
            ui.decideEngineDlProgressLogAction({
                line: 'x',
                lastText: 'y',
                canReuse: true,
                now: 1000,
                lastAt: 900,
            }),
            'reuse',
        );
        assert.strictEqual(
            ui.decideEngineDlProgressLogAction({
                force: true,
                line: 'x',
                canReuse: false,
                now: 1000,
                lastAt: 0,
            }),
            'append',
        );
    });

    it('normalizes and merges pick catalog', () => {
        const normalized = ui.normalizeEnginePickCatalog([
            {
                id: 'opus-mt-ja-zh',
                kind: 'mt',
                name: 'Opus JA',
                installed: true,
                size_hint_mb: 100,
            },
            { id: 'demucs', kind: 'demucs', name: 'skip-me' },
            {
                id: 'sakura-1.5b',
                kind: 'mt',
                name: 'Sakura',
                installed: false,
            },
        ], {
            demucsModelId: 'demucs',
            isSakuraMtModelId: (id) => /sakura/i.test(id),
            findManagedLlmCatalogEntry: () => null,
        });
        assert.strictEqual(normalized.length, 2);
        assert.strictEqual(normalized.find((m) => m.id === 'sakura-1.5b').group, 'llm');
        assert.ok(normalized.find((m) => m.id === 'opus-mt-ja-zh').sizeHint.includes('100'));

        const managed = ui.buildManagedLlmPickItems([
            { id: 'qwen25-7b', name: 'Qwen', sizeHint: '4G', paramBillion: 7 },
        ], { isSakuraMtModelId: () => false });
        assert.strictEqual(managed[0].group, 'llm');

        const merged = ui.mergeManagedLlmIntoPickCatalog(normalized, managed);
        assert.ok(merged.some((m) => m.id === 'qwen25-7b'));

        const withDemucs = ui.mergeDemucsPickItem(merged, { status: 'ready', version: '4.0' }, 'demucs');
        const demucs = withDemucs.find((m) => m.id === 'demucs');
        assert.strictEqual(demucs.installed, true);
        assert.strictEqual(demucs.incomplete, false);
        assert.strictEqual(ui.engineModelGroupLabel('llm'), 'LLM推理翻译');

        const partial = ui.buildDemucsPickItem({ status: 'partial', ok: true }, 'demucs');
        assert.strictEqual(partial.installed, true);
        assert.strictEqual(partial.incomplete, true);
        assert.ok(ui.isDemucsRuntimeUsable({ status: 'partial', ok: true }));
        assert.ok(!ui.isDemucsFullyReady({ status: 'partial', ok: true }));

        const needCuda = ui.buildDemucsPickItem({ status: 'need_torch_cuda', ok: true }, 'demucs');
        assert.strictEqual(needCuda.installed, true);
        assert.strictEqual(needCuda.incomplete, true);
        assert.ok(ui.isDemucsRuntimeUsable({ status: 'need_torch_cuda', ok: true }));
        assert.ok(!ui.isDemucsFullyReady({ status: 'need_torch_cuda', ok: true }));

        assert.ok(!ui.isDemucsRuntimeUsable({ status: 'need_install', ok: true }));
    });
});
