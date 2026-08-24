const assert = require('assert');
const handoff = require('../electron/engine-asr-semantic-handoff');

describe('engine-asr-semantic-handoff', () => {
    it('builds translate job with checkpoint', () => {
        const body = handoff.buildTranslateJobWithCheckpoint(
            { task: 'translate_mt', mediaPath: 'a.mp4' },
            [{ start: 0, end: 1, text: 'ja' }],
        );
        assert.strictEqual(body.task, 'translate_mt');
        assert.strictEqual(body._checkpoint.stage, 'asr_done');
        assert.strictEqual(body._checkpoint.sourceCues.length, 1);
    });

    it('extracts source cues from job result', () => {
        const cues = handoff.extractEngineSourceCues({ cues: { source: [{ text: 'x' }] } });
        assert.strictEqual(cues.length, 1);
    });

    it('buildRepairInput sets nested batch mode for compute lock', () => {
        const input = handoff.buildRepairInput({ asrSemanticRepair: 'auto' });
        assert.strictEqual(input._batchMode, true);
        assert.strictEqual(input.options.asrSemanticRepair, 'auto');
    });

    it('buildRepairInput forwards glossary and asr meta', () => {
        const input = handoff.buildRepairInput(
            { asrSemanticRepair: 'auto', language: 'ja' },
            { glossary: [{ src: '太郎', tgt: '太郎' }], primaryAsr: 'sensevoice-small', mediaPath: 'a.mp4' },
        );
        assert.strictEqual(input.glossary.length, 1);
        assert.strictEqual(input.primaryAsr, 'sensevoice-small');
        assert.strictEqual(input.options.language, 'ja');
    });

    it('formatRepairFailure includes code and hint', () => {
        const msg = handoff.formatRepairFailure({ error: 'busy', code: 'compute_busy' });
        assert.match(msg, /compute_busy/);
        assert.match(msg, /等待/);
    });

    it('logRepairResult writes audit lines', () => {
        const logs = [];
        handoff.        logRepairResult({
            ok: true,
            changed: 1,
            substantiveChanged: 1,
            summary: 'done',
            auditLines: ['line-a', 'line-b'],
        }, { onLog: (line) => logs.push(line) });
        assert.deepStrictEqual(logs, ['done', 'line-a', 'line-b']);
    });
});
