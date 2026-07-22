const assert = require('assert');
const api = require('../src/js/subtitle-workflows-core');

describe('subtitle-workflows-core', () => {
    it('exposes catalog and builtins', () => {
        const catalog = api.listStepCatalog();
        assert.ok(catalog.length >= 30);
        assert.ok(catalog.some((s) => s.id === 'timing.smartAdjust'));
        assert.ok(catalog.some((s) => s.id === 'ai.retranscribeLowConfidence'));
        const builtins = api.builtinWorkflows();
        assert.strictEqual(builtins.length, 2);
        assert.ok(builtins.every((w) => w.builtin && w.steps.length >= 2));
        assert.ok(builtins.some((w) => w.name === '时间轴优先'));
        assert.ok(builtins.some((w) => w.name === '双语交付'));
        assert.ok(!builtins.some((w) => w.name === '译文润色'));
    });

    it('normalize and ensure builtins', () => {
        const doc = api.ensureBuiltinWorkflows(api.emptyWorkflowsDoc());
        assert.strictEqual(doc.workflows.length, 2);
        assert.ok(doc.activeId);
        const again = api.ensureBuiltinWorkflows(doc);
        assert.strictEqual(again.workflows.length, 2);
    });

    it('drops removed builtin polish on ensure', () => {
        const doc = api.ensureBuiltinWorkflows({
            workflows: [
                {
                    id: 'builtin_polish',
                    name: '译文润色',
                    builtin: true,
                    steps: [{ type: 'qc.scan' }],
                },
            ],
        });
        assert.ok(!doc.workflows.some((w) => w.id === 'builtin_polish'));
        assert.strictEqual(doc.workflows.filter((w) => w.builtin).length, 2);
    });

    it('upsert duplicate remove custom workflows', () => {
        let doc = api.ensureBuiltinWorkflows(api.emptyWorkflowsDoc());
        const created = api.upsertWorkflow(doc, {
            name: '我的批处理',
            steps: [
                api.step('qc.scan'),
                api.step('timing.shift', { params: { deltaMs: 500 } }),
            ],
        });
        assert.strictEqual(created.ok, true);
        doc = created.doc;
        assert.strictEqual(doc.workflows.filter((w) => !w.builtin).length, 1);

        const dup = api.duplicateWorkflow(doc, 'builtin_timeline');
        assert.strictEqual(dup.ok, true);
        doc = dup.doc;
        assert.ok(dup.workflow.name.includes('副本'));
        assert.strictEqual(dup.workflow.builtin, false);

        const builtinCount = doc.workflows.filter((w) => w.builtin).length;
        doc = api.removeWorkflow(doc, 'builtin_timeline');
        assert.strictEqual(doc.workflows.filter((w) => w.builtin).length, builtinCount);

        const customId = created.workflow.id;
        doc = api.removeWorkflow(doc, customId);
        assert.ok(!doc.workflows.some((w) => w.id === customId));
    });

    it('rejects empty name and unknown steps', () => {
        const bad = api.upsertWorkflow(api.emptyWorkflowsDoc(), { name: '', steps: [api.step('qc.scan')] });
        assert.strictEqual(bad.ok, false);
        const wf = api.normalizeWorkflow({
            name: 'x',
            steps: [{ type: 'not.real' }, { type: 'qc.scan' }],
        });
        assert.strictEqual(wf.steps.length, 1);
        assert.strictEqual(wf.steps[0].type, 'qc.scan');
    });

    it('runWorkflow executes handlers with skip and fail policies', async () => {
        const wf = api.normalizeWorkflow({
            name: 'test',
            onFail: 'skip',
            steps: [
                api.step('qc.scan'),
                api.step('timing.shift', { params: { deltaMs: 100 } }),
                api.step('file.save'),
            ],
        });
        const calls = [];
        const handlers = {
            'qc.scan': async () => {
                calls.push('qc.scan');
                return { status: 'done', summary: 'scanned' };
            },
            'timing.shift': async () => {
                calls.push('timing.shift');
                return { status: 'failed', summary: 'boom' };
            },
            'file.save': async () => {
                calls.push('file.save');
                return { status: 'done', summary: 'saved', changed: false };
            },
        };
        const run = await api.runWorkflow(wf, handlers);
        assert.deepStrictEqual(calls, ['qc.scan', 'timing.shift', 'file.save']);
        assert.strictEqual(run.summary.failed, 1);
        assert.strictEqual(run.summary.done, 2);
        assert.ok(api.summarizeRun(run).includes('失败'));
    });

    it('runWorkflow aborts on fail pause and supports confirm skip', async () => {
        const wf = api.normalizeWorkflow({
            name: 'test',
            onFail: 'pause',
            steps: [
                api.step('text.removeNoise', { requireConfirm: true }),
                api.step('qc.scan'),
            ],
        });
        const handlers = {
            'text.removeNoise': async () => ({ status: 'done' }),
            'qc.scan': async () => ({ status: 'done' }),
        };
        const run = await api.runWorkflow(wf, handlers, {
            shouldConfirm: async () => false,
        });
        assert.strictEqual(run.summary.skipped, 1);
        assert.strictEqual(run.summary.done, 1);

        const wf2 = api.normalizeWorkflow({
            name: 'fail',
            onFail: 'pause',
            steps: [
                api.step('qc.scan'),
                api.step('file.save'),
            ],
        });
        const run2 = await api.runWorkflow(wf2, {
            'qc.scan': async () => ({ status: 'failed', summary: 'x' }),
            'file.save': async () => ({ status: 'done' }),
        });
        assert.strictEqual(run2.summary.done, 0);
        assert.strictEqual(run2.summary.failed, 1);
        assert.strictEqual(run2.summary.aborted, true);
    });

    it('reorder and setStepEnabled', () => {
        let wf = api.normalizeWorkflow({
            name: 'r',
            steps: [api.step('qc.scan'), api.step('file.save'), api.step('timing.shift')],
        });
        const firstId = wf.steps[0].id;
        wf = api.reorderSteps(wf, 0, 2);
        assert.strictEqual(wf.steps[2].id, firstId);
        wf = api.setStepEnabled(wf, wf.steps[0].id, false);
        assert.strictEqual(wf.steps[0].enabled, false);
    });
});
