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
            { id: 'bad', name: 'Bad', group: 'mt', installed: true, incomplete: true },
            { id: 'q', name: 'Qwen', group: 'llm', installed: false },
        ];
        const all = ui.filterAndSortEnginePickItems(catalog, { filter: 'all', query: '' });
        assert.strictEqual(all[0].id, 'a');
        const sep = ui.filterAndSortEnginePickItems(catalog, { filter: 'all', query: '人声' });
        assert.strictEqual(sep.length, 1);
        assert.strictEqual(sep[0].id, 's');
        assert.strictEqual(ui.formatModelsSummary({ total: 3, visible: 1 }), '显示 1 / 3');
        assert.deepStrictEqual(ui.countModelsByFilter(catalog), {
            all: 5,
            installed: 1,
            available: 3,
            recommended: 1,
            incomplete: 1,
            experimental: 0,
            asr: 2,
            vad: 0,
            llm: 2,
            separate: 1,
        });
        assert.strictEqual(ui.filterAndSortEnginePickItems(catalog, { status: 'installed' }).length, 1);
        assert.strictEqual(ui.filterAndSortEnginePickItems(catalog, { status: 'available' }).length, 3);
        assert.strictEqual(ui.filterAndSortEnginePickItems(catalog, { status: 'recommended' })[0].id, 'a');
        assert.strictEqual(ui.filterAndSortEnginePickItems(catalog, { status: 'incomplete' })[0].id, 'bad');
        assert.strictEqual(
            ui.filterAndSortEnginePickItems(catalog, { group: 'asr', status: 'installed' }).length,
            1,
        );
        assert.strictEqual(
            ui.filterAndSortEnginePickItems(catalog, { group: 'asr', status: 'available' })[0].id,
            'b',
        );
        // GGUF/mt folded into LLM 翻译
        const llm = ui.filterAndSortEnginePickItems(catalog, { group: 'llm' });
        assert.strictEqual(llm.length, 2);
        assert.ok(llm.some((x) => x.id === 'bad'));
        assert.ok(llm.some((x) => x.id === 'q'));
        assert.strictEqual(ui.normalizeModelsGroupFilter('mt'), 'llm');
        assert.deepStrictEqual(ui.countModelsByFilter(catalog, { group: 'asr' }), {
            all: 5,
            installed: 1,
            available: 1,
            recommended: 1,
            incomplete: 0,
            experimental: 0,
            asr: 2,
            vad: 0,
            llm: 2,
            separate: 1,
        });
    });

    it('filters experimental laboratory models', () => {
        const catalog = [
            { id: 'a', name: 'A', group: 'asr', installed: true },
            {
                id: 'lab-x',
                name: 'Lab X',
                group: 'llm',
                source: 'lab',
                experimental: true,
                installed: false,
            },
        ];
        const labs = ui.filterAndSortEnginePickItems(catalog, { status: 'experimental' });
        assert.strictEqual(labs.length, 1);
        assert.strictEqual(labs[0].id, 'lab-x');
        assert.strictEqual(ui.countModelsByFilter(catalog).experimental, 1);
        const managed = ui.buildManagedLlmPickItems([
            {
                id: 'lab-y',
                name: 'Lab Y',
                experimental: true,
                lab: true,
                family: 'lab',
                familyLabel: '实验',
                installed: true,
                sizeHint: '1 GB',
            },
        ]);
        assert.strictEqual(managed[0].source, 'lab');
        assert.strictEqual(managed[0].experimental, true);
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

        const llmAsMt = ui.buildInstalledModelSelectOptionsHtml({
            models: [
                { id: 'qwen25-7b', name: 'Qwen', kind: 'llm', installed: true },
                { id: 'sakura-1.5b', name: 'Sakura', kind: 'mt', installed: true },
            ],
            kind: 'mt',
            esc,
        });
        assert.ok(llmAsMt.html.includes('qwen25-7b'));
        assert.ok(llmAsMt.html.includes('sakura-1.5b'));

        const disabledIntl = ui.buildInstalledModelSelectOptionsHtml({
            models: [
                { id: 'qwen25-7b', name: 'Qwen', kind: 'llm', installed: true },
                { id: 'sakura-1.5b', name: 'Sakura', kind: 'mt', installed: true },
            ],
            kind: 'mt',
            selectedId: 'sakura-1.5b',
            allowEmpty: true,
            esc,
            modelDisableReason: (m) => (String(m.id).startsWith('sakura') ? '成片 English：专训模型仅支持日→中' : ''),
        });
        assert.ok(disabledIntl.html.includes('disabled'));
        assert.ok(disabledIntl.html.includes('不可用'));
        assert.strictEqual(disabledIntl.want, '');
        assert.strictEqual(disabledIntl.clearedDisabledSelection, true);

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

    it('merges managed installed into engine model rows for selects', () => {
        assert.ok(ui.matchesEngineSelectKind('llm', 'mt'));
        assert.ok(ui.matchesEngineSelectKind('mt', 'mt'));
        assert.ok(!ui.matchesEngineSelectKind('asr', 'mt'));

        const merged = ui.mergeManagedInstalledIntoEngineModels(
            [
                { id: 'sakura-1.5b', kind: 'mt', installed: false, incomplete: true, name: 'Sakura' },
                { id: 'qwen25-7b', kind: 'llm', installed: false, name: 'Qwen stale' },
                { id: 'whisper-large', kind: 'asr', installed: true },
            ],
            [
                { id: 'sakura-1.5b', name: 'Sakura 1.5B', kind: 'mt', installed: true },
                { id: 'qwen25-7b', name: 'Qwen2.5 7B', kind: 'mt', installed: true },
                { id: 'llama32-3b', name: 'Llama 3.2', kind: 'mt', installed: true },
            ],
        );
        const sakura = merged.find((m) => m.id === 'sakura-1.5b');
        assert.strictEqual(sakura.installed, true);
        assert.strictEqual(sakura.incomplete, false);
        assert.strictEqual(sakura.kind, 'mt');
        const qwen = merged.find((m) => m.id === 'qwen25-7b');
        assert.strictEqual(qwen.installed, true);
        assert.strictEqual(qwen.kind, 'mt');
        assert.ok(merged.some((m) => m.id === 'llama32-3b' && m.installed && m.kind === 'mt'));
        assert.strictEqual(merged.find((m) => m.id === 'whisper-large').kind, 'asr');
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
            { id: 'qwen3-asr-1.7b-ja', kind: 'asr', name: 'retired neosophie' },
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
        assert.ok(!normalized.some((m) => m.id === 'qwen3-asr-1.7b-ja'));
        assert.strictEqual(normalized.find((m) => m.id === 'sakura-1.5b').group, 'llm');
        assert.ok(normalized.find((m) => m.id === 'opus-mt-ja-zh').sizeHint.includes('100'));
        assert.ok(normalized.find((m) => m.id === 'opus-mt-ja-zh').ramHint.includes('GB'));

        const managed = ui.buildManagedLlmPickItems([
            { id: 'qwen25-7b', name: 'Qwen', sizeHint: '4G', paramBillion: 7, ramHint: '建议 ≥8 GB 内存' },
        ], { isSakuraMtModelId: () => false });
        assert.strictEqual(managed[0].group, 'llm');
        assert.strictEqual(managed[0].ramHint, '建议 ≥8 GB 内存');

        assert.strictEqual(ui.parseMinRamGbFromHint('建议 ≥16 GB 内存'), 16);
        assert.strictEqual(ui.deriveRamHintFromSizeMb(75, 'asr'), '建议 ≥2 GB 显存 / 内存');
        assert.strictEqual(ui.deriveRamHintFromSizeMb(3000, 'asr'), '建议 ≥6 GB 显存 / 内存');
        assert.ok(ui.isRamTightForModel({ ramHint: '建议 ≥16 GB 内存' }, 8));
        assert.ok(!ui.isRamTightForModel({ ramHint: '建议 ≥4 GB 内存' }, 16));

        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥16 GB 内存' }, { systemMemoryGb: 8 }).level,
            'over',
        );
        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥16 GB 内存' }, { systemMemoryGb: 8 }).label,
            '负载',
        );
        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥8 GB 内存' }, { systemMemoryGb: 8 }).level,
            'tight',
        );
        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥8 GB 内存' }, { systemMemoryGb: 8 }).label,
            '高负荷',
        );
        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥4 GB 内存' }, { systemMemoryGb: 16 }).level,
            'ok',
        );
        assert.strictEqual(
            ui.classifyHardwareFit({ group: 'llm', ramHint: '建议 ≥4 GB 内存' }, { systemMemoryGb: 16 }).label,
            '流畅',
        );
        // ASR/LLM prefer VRAM when present
        assert.strictEqual(
            ui.classifyHardwareFit(
                { group: 'asr', ramHint: '建议 ≥6 GB 显存 / 内存' },
                { systemMemoryGb: 32, vramGb: 4 },
            ).level,
            'over',
        );
        assert.strictEqual(
            ui.classifyHardwareFit(
                { group: 'asr', ramHint: '建议 ≥6 GB 显存 / 内存' },
                { systemMemoryGb: 32, vramGb: 12 },
            ).level,
            'ok',
        );

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

    it('delete button visibility and confirm copy', () => {
        assert.strictEqual(
            ui.canShowDeleteButtonForPickItem({ id: 'demucs', installed: true }, { demucsModelId: 'demucs' }),
            false,
        );
        assert.strictEqual(
            ui.canShowDeleteButtonForPickItem({ id: 'x', installed: true, shipped: true }),
            false,
        );
        assert.strictEqual(
            ui.canShowDeleteButtonForPickItem({ id: 'x', installed: true }),
            true,
        );
        const copy = ui.buildDeleteModelConfirmCopy({ id: 'x', name: 'Demo' });
        assert.ok(copy.message.includes('Demo'));
        assert.strictEqual(copy.primaryLabel, '删除');
        assert.strictEqual(copy.danger, true);
    });
});
