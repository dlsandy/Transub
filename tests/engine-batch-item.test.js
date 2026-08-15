const assert = require('assert');
const {
    interpretCreateJobResponse,
    interpretWaitJobResult,
    progressFieldsFromWaitEvent,
    resolveFileMtPlan,
    buildFailedItemResult,
    buildCancelledItemResult,
    buildSkippedItemResult,
} = require('../electron/engine-batch-item');

describe('engine-batch-item', () => {
    it('interpretCreateJobResponse', () => {
        assert.deepStrictEqual(
            interpretCreateJobResponse({ ok: true, data: { id: 'j1' } }),
            { ok: true, jobId: 'j1' },
        );
        const bad = interpretCreateJobResponse({ ok: false, status: 500, data: { message: 'boom' } });
        assert.strictEqual(bad.ok, false);
        assert.ok(String(bad.error).includes('boom'));
    });

    it('interpretWaitJobResult', () => {
        assert.strictEqual(interpretWaitJobResult({ ok: true, data: { result: { x: 1 } } }).kind, 'ok');
        assert.strictEqual(interpretWaitJobResult({ ok: false, error: 'cancelled' }).kind, 'cancelled');
        assert.strictEqual(interpretWaitJobResult({ ok: true }, true).kind, 'cancelled');
        assert.strictEqual(interpretWaitJobResult({ ok: false, error: 'x' }).kind, 'failed');
    });

    it('progressFieldsFromWaitEvent', () => {
        const p = progressFieldsFromWaitEvent({
            status: 'running',
            progress: { stage: 'transcribe', detail: '…', percent: 42, processedSec: 3 },
        });
        assert.strictEqual(p.stage, 'transcribe');
        assert.strictEqual(p.percent, 42);
        assert.strictEqual(p.processedSec, 3);
        const q = progressFieldsFromWaitEvent({ status: 'queued' });
        assert.ok(q.detail.includes('排队'));
    });

    it('resolveFileMtPlan', () => {
        const plan = resolveFileMtPlan(
            { task: 'translate', smartTranslate: true, engineMtModel: 'sakura-1.5b' },
            {
                isLlmMtId: () => true,
                usesExternalMt: ({ smartTranslate }) => !!smartTranslate,
                mapTaskToEngineTask: (t, { smartTranslate }) => (smartTranslate ? 'translate_mt' : t),
            },
        );
        assert.strictEqual(plan.useSmartTranslate, true);
        assert.strictEqual(plan.useExternalMt, true);
        assert.strictEqual(plan.jobMtModel, null);
        assert.strictEqual(plan.engineTask, 'translate_mt');
    });

    it('result builders', () => {
        assert.strictEqual(buildFailedItemResult('a.mp4', 'e').ok, false);
        assert.strictEqual(buildCancelledItemResult('a.mp4').cancelled, true);
        const skip = buildSkippedItemResult('a.mp4', { subtitlePath: 'a.srt' });
        assert.strictEqual(skip.skipped, true);
        assert.strictEqual(skip.subtitlePath, 'a.srt');
    });

    it('summarizeAsrRunMeta and appendAsrRunToDetail', () => {
        const {
            summarizeAsrRunMeta,
            appendAsrRunToDetail,
        } = require('../electron/engine-batch-item');
        const direct = summarizeAsrRunMeta({
            asrModel: 'sensevoice-small',
            primaryAsr: 'sensevoice-small',
            asrAttempts: 1,
        });
        assert.strictEqual(direct.failedOver, false);
        assert.ok(direct.label.includes('sensevoice-small'));
        const fo = summarizeAsrRunMeta({
            asrModel: 'whisper-tiny',
            primaryAsr: 'sensevoice-small',
            asrAttempts: 2,
        });
        assert.strictEqual(fo.failedOver, true);
        assert.ok(fo.label.includes('回退自'));
        assert.strictEqual(
            appendAsrRunToDetail('完成', fo),
            `完成 · ${fo.label}`,
        );
        assert.strictEqual(appendAsrRunToDetail(`完成 · ${fo.label}`, fo), `完成 · ${fo.label}`);
    });
});
