const assert = require('assert');
const { createEngineBatchHistory } = require('../electron/engine-batch-history');

describe('engine-batch-history', () => {
    it('loadEngineGlossaryPairs gates by task / flags', () => {
        const api = createEngineBatchHistory({
            buildEngineGlossaryPairs: () => [['a', 'b']],
            readGlossary: () => ({ ok: true, glossary: { entries: [] } }),
            getAbortController: () => null,
            setAbortController: () => {},
            stripPostTaskFields: (o) => o,
            mapEngineResultsToHistoryOutputs: () => [],
        });
        assert.deepStrictEqual(api.loadEngineGlossaryPairs({ task: 'asr' }), []);
        assert.deepStrictEqual(api.loadEngineGlossaryPairs({
            task: 'translate',
            glossaryMtEnabled: false,
        }), []);
        assert.deepStrictEqual(api.loadEngineGlossaryPairs({
            task: 'translate',
            mtGlossaryMode: 'prompt',
        }), []);
        assert.deepStrictEqual(api.loadEngineGlossaryPairs({ task: 'dual' }), [['a', 'b']]);
    });

    it('loadEngineAsrExtras respects glossaryPromptEnabled', () => {
        const api = createEngineBatchHistory({
            buildEngineGlossaryPairs: () => [],
            buildEngineAsrGlossaryPairs: () => [{ wrong: 'a', correct: 'b', stage: 'asr' }],
            buildEngineAsrHintsFromGlossary: () => ({
                initial_prompt: '专名',
                hotwords: 'foo bar',
            }),
            readBatchMergedGlossary: () => ({
                entries: [{ canonical: 'b', aliases: ['a'], asrReplace: true }],
            }),
            getAbortController: () => null,
            setAbortController: () => {},
            stripPostTaskFields: (o) => o,
            mapEngineResultsToHistoryOutputs: () => [],
        });
        assert.deepStrictEqual(api.loadEngineAsrExtras({ glossaryPromptEnabled: false }), {
            asrGlossary: [],
            initialPrompt: '',
            hotwords: '',
        });
        const on = api.loadEngineAsrExtras({ glossaryPromptEnabled: true });
        assert.strictEqual(on.asrGlossary.length, 1);
        assert.strictEqual(on.initialPrompt, '专名');
        assert.strictEqual(on.hotwords, 'foo bar');
    });

    it('abortBatchMtAdapter clears controller', () => {
        let ctrl = { abort() { this.aborted = true; } };
        const api = createEngineBatchHistory({
            buildEngineGlossaryPairs: () => [],
            getAbortController: () => ctrl,
            setAbortController: (c) => { ctrl = c; },
            stripPostTaskFields: (o) => o,
            mapEngineResultsToHistoryOutputs: () => [],
        });
        api.abortBatchMtAdapter();
        assert.strictEqual(ctrl, null);
    });

    it('buildEngineBatchHistoryRecord aggregates results', () => {
        const api = createEngineBatchHistory({
            buildEngineGlossaryPairs: () => [],
            getAbortController: () => null,
            setAbortController: () => {},
            stripPostTaskFields: (o) => ({ task: o.task }),
            mapEngineResultsToHistoryOutputs: (results) => results.map((r) => r.path),
            now: () => 1_700_000_100_000,
        });
        const rec = api.buildEngineBatchHistoryRecord({
            list: [{ durationSec: 12 }, { duration: 8 }],
            merged: { task: 'dual', device: 'cuda' },
            finished: {
                total: 2,
                generated: 1,
                skipped: 0,
                failed: 1,
                results: [
                    { ok: true, path: 'a.srt' },
                    { ok: false, path: 'b.mp4', error: 'boom' },
                ],
            },
            startedAt: '2024-01-01T00:00:00.000Z',
            startedMs: 1_700_000_000_000,
            extraErrors: ['pre: x'],
        });
        assert.strictEqual(rec.totalDurationSec, 20);
        assert.strictEqual(rec.wallSec, 100);
        assert.strictEqual(rec.failed, 1);
        assert.strictEqual(rec.options.task, 'dual');
        assert.ok(rec.errors.some((e) => e.includes('boom')));
        assert.deepStrictEqual(rec.outputs, ['a.srt', 'b.mp4']);
    });

    it('recordEngineBatchHistory appends and soft-calls shelf ingest', () => {
        const appended = [];
        const ingested = [];
        const api = createEngineBatchHistory({
            buildEngineGlossaryPairs: () => [],
            getAbortController: () => null,
            setAbortController: () => {},
            stripPostTaskFields: (o) => o,
            mapEngineResultsToHistoryOutputs: () => [],
            appendTaskHistory: (rec) => {
                appended.push(rec);
                return { ...rec, id: 'h1' };
            },
            ingestShelfEntry: (rec) => { ingested.push(rec); },
            now: () => Date.now(),
        });
        const out = api.recordEngineBatchHistory({
            list: [],
            merged: { task: 'asr' },
            finished: { results: [], generated: 0, skipped: 0, failed: 0 },
            startedAt: new Date().toISOString(),
            startedMs: Date.now() - 1000,
        });
        assert.strictEqual(out.id, 'h1');
        assert.strictEqual(appended.length, 1);
        assert.strictEqual(ingested.length, 1);
        assert.strictEqual(ingested[0].id, 'h1');
    });
});
