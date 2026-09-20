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
        const net = interpretCreateJobResponse({
            ok: false,
            status: 0,
            data: null,
            error: '引擎未响应（连接被拒绝）',
            code: 'network',
        });
        assert.strictEqual(net.ok, false);
        assert.ok(!String(net.error).includes('HTTP 0'), net.error);
        assert.ok(String(net.error).includes('引擎未响应'), net.error);
        const bare = interpretCreateJobResponse({ ok: false, status: 0, data: null });
        assert.ok(!String(bare.error).includes('HTTP 0'), bare.error);
        assert.ok(String(bare.error).includes('引擎未响应'), bare.error);
    });

    it('interpretWaitJobResult', () => {
        assert.strictEqual(interpretWaitJobResult({ ok: true, data: { result: { x: 1 } } }).kind, 'ok');
        assert.strictEqual(interpretWaitJobResult({ ok: false, error: 'cancelled' }).kind, 'cancelled');
        assert.strictEqual(interpretWaitJobResult({ ok: true }, true).kind, 'cancelled');
        assert.strictEqual(interpretWaitJobResult({ ok: false, error: 'x' }).kind, 'failed');
    });

    it('shouldContinueBatchAfterItemCancel', () => {
        const { shouldContinueBatchAfterItemCancel } = require('../electron/engine-batch-item');
        assert.strictEqual(shouldContinueBatchAfterItemCancel({ itemCancelled: true, batchCancelled: false }), true);
        assert.strictEqual(shouldContinueBatchAfterItemCancel({ itemCancelled: true, batchCancelled: true }), false);
        assert.strictEqual(shouldContinueBatchAfterItemCancel({ itemCancelled: false, batchCancelled: false }), false);
    });

    it('isHostStopRequested honors batch or item cancel', () => {
        const { isHostStopRequested } = require('../electron/engine-batch-item');
        assert.strictEqual(isHostStopRequested({}), false);
        assert.strictEqual(isHostStopRequested({ batchCancelled: true }), true);
        assert.strictEqual(isHostStopRequested({ itemCancelled: true }), true);
        assert.strictEqual(isHostStopRequested({ batchCancelled: false, itemCancelled: false }), false);
    });

    it('isPostTaskStopRequested reads shouldStop and AbortSignal', () => {
        const { isPostTaskStopRequested, cancelledPostTaskResult } = require('../electron/engine-batch-item');
        assert.strictEqual(isPostTaskStopRequested({}), false);
        assert.strictEqual(isPostTaskStopRequested({ shouldStop: () => false }), false);
        assert.strictEqual(isPostTaskStopRequested({ shouldStop: () => true }), true);
        const ctrl = new AbortController();
        assert.strictEqual(isPostTaskStopRequested({ signal: ctrl.signal }), false);
        ctrl.abort();
        assert.strictEqual(isPostTaskStopRequested({ signal: ctrl.signal }), true);
        const cancelled = cancelledPostTaskResult({ issueCount: 3 });
        assert.strictEqual(cancelled.cancelled, true);
        assert.strictEqual(cancelled.code, 'cancelled');
        assert.strictEqual(cancelled.issueCount, 3);
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
        assert.strictEqual(q.percent, undefined);
        const r = progressFieldsFromWaitEvent({ status: 'running' });
        assert.strictEqual(r.percent, undefined);
    });

    it('progressFieldsFromWaitEvent ignores bare type=done terminal', () => {
        const bare = progressFieldsFromWaitEvent({
            type: 'status',
            status: 'done',
            progress: { type: 'done', ok: true, result: {} },
        });
        assert.strictEqual(bare, null);
        const real = progressFieldsFromWaitEvent({
            status: 'done',
            progress: { stage: 'done', percent: 100, detail: '翻译完成' },
        });
        assert.strictEqual(real.stage, 'done');
        assert.strictEqual(real.percent, 100);
    });

    it('sanitizeBatchEngineSseProgress keeps post-task band before bridge done', () => {
        const { sanitizeBatchEngineSseProgress } = require('../electron/engine-batch-item');
        const out = sanitizeBatchEngineSseProgress({
            stage: 'done',
            percent: 100,
            detail: '翻译完成',
        });
        assert.strictEqual(out.stage, 'save');
        assert.strictEqual(out.percent, 97);
        assert.strictEqual(out.phase, 'running');
        assert.ok(out.detail.includes('收尾'));
    });

    it('sanitizeBatchEngineSseProgress holds ASR-only done in extract band', () => {
        const { sanitizeBatchEngineSseProgress } = require('../electron/engine-batch-item');
        const out = sanitizeBatchEngineSseProgress({
            stage: 'done',
            percent: 100,
            detail: '转写完成',
        });
        assert.strictEqual(out.stage, 'transcribe');
        assert.strictEqual(out.percent, 65);
        assert.strictEqual(out.phase, 'running');
    });

    it('sanitizeBatchEngineSseProgress holds translate completion before QC', () => {
        const { sanitizeBatchEngineSseProgress } = require('../electron/engine-batch-item');
        const out = sanitizeBatchEngineSseProgress({
            stage: 'translate',
            percent: 100,
            detail: '翻译完成',
        });
        assert.strictEqual(out.stage, 'save');
        assert.strictEqual(out.phase, 'running');
        assert.strictEqual(out.percent, 97);
    });

    it('sanitizeBatchEngineSseProgress keeps qc_loop / qc_fix near-done ticks', () => {
        const { sanitizeBatchEngineSseProgress } = require('../electron/engine-batch-item');
        const loop = sanitizeBatchEngineSseProgress({
            stage: 'qc_loop',
            itemStage: 'qc_loop',
            percent: 99,
            detail: 'QC 闭环补译…',
        });
        assert.strictEqual(loop.stage, 'qc_loop');
        assert.strictEqual(loop.percent, 99);
        assert.ok(!String(loop.detail || '').includes('收尾'));

        const viaItemStage = sanitizeBatchEngineSseProgress({
            itemStage: 'qc_loop',
            percent: 100,
            detail: 'QC 闭环补译…',
        });
        assert.strictEqual(viaItemStage.itemStage, 'qc_loop');
        assert.ok(!String(viaItemStage.detail || '').includes('收尾'));

        const fix = sanitizeBatchEngineSseProgress({
            stage: 'qc_fix',
            percent: 100,
            detail: 'QC修复中…',
        });
        assert.strictEqual(fix.stage, 'qc_fix');
        assert.strictEqual(fix.percent, 100);
    });

    it('sanitizeBatchEngineSseProgress leaves skipped terminal events alone', () => {
        const { sanitizeBatchEngineSseProgress } = require('../electron/engine-batch-item');
        const out = sanitizeBatchEngineSseProgress({
            stage: 'skipped',
            percent: 100,
            detail: '已有字幕',
        });
        assert.strictEqual(out.stage, 'skipped');
        assert.strictEqual(out.percent, 100);
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
