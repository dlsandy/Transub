'use strict';

const assert = require('assert');
const { createShelfTranslateFlow } = require('../src/js/shelf-translate-flow-core.js');

describe('TransubShelfTranslateFlow', () => {
    it('exports createShelfTranslateFlow', () => {
        assert.strictEqual(typeof createShelfTranslateFlow, 'function');
    });

    it('openShelfTranslate returns busy when a job is running', async () => {
        const toasts = [];
        const flow = createShelfTranslateFlow({
            state: { running: true, postBatchBusy: false, retranslateBusy: false, items: [] },
            els: {},
            electron: {},
            showToast: (msg, tone) => { toasts.push({ msg, tone }); },
            ensureJobRuntimeScripts: async () => {},
        });
        const res = await flow.openShelfTranslate({ mediaDetail: { id: 'm1' }, sourceSlot: 'original' });
        assert.deepStrictEqual(res, { ok: false, error: 'busy' });
        assert.ok(toasts.some((t) => t.tone === 'warn' && String(t.msg).includes('任务进行中')));
    });

    it('openShelfTranslate returns no_media without media id', async () => {
        const toasts = [];
        const flow = createShelfTranslateFlow({
            state: { running: false, postBatchBusy: false, retranslateBusy: false, items: [] },
            els: {},
            electron: {},
            shelfTranslateApi: { buildShelfTranslatePlanRow: () => ({}) },
            showToast: (msg, tone) => { toasts.push({ msg, tone }); },
            ensureJobRuntimeScripts: async () => {},
        });
        const res = await flow.openShelfTranslate({});
        assert.deepStrictEqual(res, { ok: false, error: 'no_media' });
        assert.ok(toasts.some((t) => t.tone === 'warn'));
    });

    it('openShelfTranslate enqueues and starts subtitle generation from original', async () => {
        const state = { running: false, postBatchBusy: false, retranslateBusy: false, items: [] };
        const starts = [];
        const logs = [];
        const media = {
            id: 'mid',
            mediaPath: 'D:/a.mp4',
            title: 'a',
            original: { path: 'D:/a.original.srt', exists: true, lang: 'ja' },
        };
        const planRow = {
            ok: true,
            item: { path: 'D:/a.mp4', duration: 12 },
            sourcePath: 'D:/a.original.srt',
            destPath: 'D:/a.zh-cn.srt',
            sourceSlot: 'original',
            sourceLanguage: 'ja',
            entryStage: 'translate',
            pipelineFloor: 3,
            mediaId: 'mid',
            fromShelf: true,
        };
        const flow = createShelfTranslateFlow({
            state,
            els: { quickLanguageSelect: { value: 'ja' } },
            electron: {
                transubReadSubtitle: async () => ({
                    ok: true,
                    format: 'srt',
                    cues: [{ text: 'こんにちは', startMs: 0, endMs: 1000 }],
                }),
            },
            shelfTranslateApi: {
                normalizeSourceSlot: (s) => s,
                resolveShelfSourceSlot: () => ({ ok: true, slot: 'original', path: 'D:/a.original.srt' }),
                buildShelfTranslatePlanRow: () => planRow,
                sourceSlotLabel: () => '原文',
                resolveShelfTranslateEntry: () => ({
                    ok: true,
                    entryStage: 'translate',
                    pipelineFloor: 3,
                }),
                buildShelfTranslateOptionOverrides: () => ({
                    skipAsr: true,
                    overwrite: true,
                    task: 'translate',
                    shelfSourceSubtitlePath: 'D:/a.original.srt',
                    shelfEntryStage: 'translate',
                }),
                cuesLookPrimarilyChinese: () => false,
            },
            settingsNormApi: {
                normalizeSubtitleTargetFormValue: (v) => v || 'simplified',
                normalizeSubtitleTargetLang: () => 'zh-Hans',
            },
            retranslatePlanApi: {},
            appendLog: (msg, level) => { logs.push({ msg, level }); },
            uiTf: (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? '')),
            showToast: () => {},
            setLoading: () => {},
            ensureJobRuntimeScripts: async () => {},
            findItem: () => null,
            setFactoryWorkspace: () => {},
            renderList: () => {},
            updateStartButton: () => {},
            startSubtitleGeneration: async () => { starts.push(1); },
        });
        const res = await flow.openShelfTranslate({ mediaDetail: media, sourceSlot: 'original' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.entryStage, 'translate');
        assert.strictEqual(starts.length, 1);
        assert.strictEqual(state.items.length, 1);
        assert.strictEqual(state.items[0].selected, true);
        assert.strictEqual(state.items[0].skipAsr, true);
        assert.strictEqual(state.items[0].pipelineFloor, 3);
        assert.ok(logs.some((l) => String(l.msg).includes('自翻译起')));
    });

    it('finishShelfTranslateRows no-ops for non-shelf rows', async () => {
        let registerCalls = 0;
        let autofixCalls = 0;
        const flow = createShelfTranslateFlow({
            state: { postBatchBusy: false, items: [] },
            els: { quickTargetLangSelect: { value: 'simplified' } },
            electron: {
                transubShelfRegisterTranslation: async () => {
                    registerCalls += 1;
                    return { ok: true };
                },
            },
            settingsNormApi: {},
            runPostBatchAutoFix: async () => { autofixCalls += 1; },
            updateStartButton: () => {},
            renderList: () => {},
        });
        await flow.finishShelfTranslateRows([
            { fromShelf: false, destPath: 'a.srt', item: { path: 'a.mp4' } },
            { destPath: 'b.srt', item: { path: 'b.mp4' } },
        ]);
        assert.strictEqual(registerCalls, 0);
        assert.strictEqual(autofixCalls, 0);
    });

    it('finishShelfTranslateRows registers and polishes shelf rows', async () => {
        const item = { path: 'm.mp4', shelfMediaId: 'mid-1', detail: '翻译中…' };
        const registerArgs = [];
        const logs = [];
        let refreshed = 0;
        const flow = createShelfTranslateFlow({
            state: { postBatchBusy: false, items: [item] },
            els: {
                quickTargetLangSelect: { value: 'simplified' },
                chineseSubtitleVariantSelect: { value: 'simplified' },
            },
            electron: {
                transubShelfRegisterTranslation: async (payload) => {
                    registerArgs.push(payload);
                    return { ok: true };
                },
            },
            settingsNormApi: {
                normalizeSubtitleTargetFormValue: (v) => v || 'simplified',
                normalizeSubtitleTargetLang: () => 'zh-Hans',
            },
            appendLog: (msg, level) => { logs.push({ msg, level }); },
            uiTf: (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? '')),
            runPostBatchAutoFix: async () => {},
            runPostBatchQcScan: async () => {},
            runPostBatchQcAutoFixIfEnabled: async () => {},
            runPostBatchChineseConvert: async () => {},
            updateStartButton: () => {},
            renderList: () => {},
            refreshSubtitleShelf: () => { refreshed += 1; },
        });
        await flow.finishShelfTranslateRows([{
            fromShelf: true,
            mediaId: 'mid-1',
            sourcePath: 'src.srt',
            destPath: 'out.zh.srt',
            item,
        }]);
        assert.strictEqual(registerArgs.length, 1);
        assert.strictEqual(registerArgs[0].mediaId, 'mid-1');
        assert.strictEqual(item.status, 'done');
        assert.strictEqual(refreshed, 1);
    });

    it('ensureShelfTranslateQueueItem sets repair floor for transcript', () => {
        const state = { items: [] };
        const flow = createShelfTranslateFlow({
            state,
            els: {},
            findItem: () => null,
            shelfTranslateApi: {
                resolveShelfTranslateEntry: () => ({
                    ok: true,
                    entryStage: 'repair',
                    pipelineFloor: 2,
                }),
                buildShelfTranslateOptionOverrides: () => ({
                    skipAsr: true,
                    shelfEntryStage: 'repair',
                }),
            },
        });
        const item = flow.ensureShelfTranslateQueueItem({
            item: { path: 'D:/x.mp4' },
            sourcePath: 'D:/x.transcribe.srt',
            destPath: 'D:/x.zh.srt',
            sourceSlot: 'transcript',
            mediaId: 'x',
            entryStage: 'repair',
            pipelineFloor: 2,
        });
        assert.strictEqual(item.pipelineFloor, 2);
        assert.strictEqual(item.shelfEntryStage, 'repair');
        assert.strictEqual(item.skipAsr, true);
        assert.strictEqual(item.fromShelf, true);
        assert.strictEqual(state.items.length, 1);
    });
});
