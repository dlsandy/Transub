'use strict';

const assert = require('assert');
const { createBatchJobProgress } = require('../src/js/batch-job-progress-core.js');

function makeEls() {
    return {
        progressBar: { style: { width: '' } },
        progressLabel: { textContent: '' },
        progressCount: { textContent: '' },
        progressEta: { textContent: '', classList: { add() {}, toggle() {}, remove() {} } },
        currentFile: { textContent: '', title: '' },
        logHost: { innerHTML: '' },
        loadingOverlay: { classList: { add() {}, remove() {} } },
        fileListBody: null,
        shelfOpenAfterBatchCheck: { checked: false },
    };
}

function makeState(overrides = {}) {
    return {
        items: [],
        running: false,
        postBatchBusy: false,
        retranslateBusy: false,
        qcFixing: false,
        videoProgress: 12,
        videoCurrentSec: 3,
        videoTotalSec: 100,
        lastProgressBumpAt: 1,
        lastProgressBumpPct: 12,
        itemStage: 'transcribe',
        itemDualPhase: null,
        index: 1,
        total: 2,
        activePath: 'a.mp4',
        jobStartedAt: Date.now(),
        jobBackend: 'transub',
        generated: 0,
        skipped: 0,
        failed: 0,
        loadingDepth: 0,
        etaRate: 0.35,
        qcBannerDismissed: false,
        lastContentProfile: null,
        ...overrides,
    };
}

describe('TransubBatchJobProgress', () => {
    it('exports createBatchJobProgress', () => {
        assert.strictEqual(typeof createBatchJobProgress, 'function');
    });

    it('resetJobProgressState clears video progress on mock state', () => {
        const state = makeState();
        const api = createBatchJobProgress({
            state,
            els: makeEls(),
            jobLogTrackers: {
                lastStartKeyByPath: new Map(),
                lastStageByPath: new Map(),
                lastLogKeyByPath: new Map(),
            },
            clearQwenIslandBatchSticky: () => {},
        });
        api.resetJobProgressState();
        assert.strictEqual(state.videoProgress, 0);
        assert.strictEqual(state.videoCurrentSec, 0);
        assert.strictEqual(state.videoTotalSec, 0);
        assert.strictEqual(state.itemStage, '');
        assert.strictEqual(state.activePath, '');
        assert.strictEqual(state.jobStartedAt, 0);
    });

    it('updateItem assigns patch on found item', () => {
        const item = { path: 'F:/a.mp4', status: 'pending', progress: 0 };
        const state = makeState({ items: [item] });
        const api = createBatchJobProgress({
            state,
            els: makeEls(),
            findItem: (p) => (String(p).includes('a.mp4') ? item : null),
            normPath: (p) => String(p || '').toLowerCase(),
            rowRefreshAtByPath: new Map(),
            refreshListRow: () => true,
            renderList: () => {},
        });
        api.updateItem('F:/a.mp4', { status: 'running', progress: 40, detail: '转写中' });
        assert.strictEqual(item.status, 'running');
        assert.strictEqual(item.progress, 40);
        assert.strictEqual(item.detail, '转写中');
    });

    it('onJobStart sets running-ish fields if payload provided', () => {
        const state = makeState({
            items: [{ path: 'F:/a.mp4', status: 'pending', selected: true }],
            running: false,
            jobStartedAt: 0,
        });
        const els = makeEls();
        const logs = [];
        const api = createBatchJobProgress({
            state,
            els,
            appendLog: (msg) => { logs.push(msg); },
            normPath: (p) => String(p || '').replace(/\\/g, '/').toLowerCase(),
            findItem: (p) => state.items.find((i) => i.path === p) || null,
            rowRefreshAtByPath: new Map(),
            renderList: () => {},
            updateProgressUi: () => {},
            updateStartButton: () => {},
            updateAutoSenseUi: () => {},
            startElapsedTicker: () => {},
            syncResourceUsageMonitor: () => {},
            syncEngineModelsBrowseOnlyFromTaskState: async () => {},
            setBadge: () => {},
            readEngineBackendFromForm: () => 'transub',
            readTaskFromForm: () => 'translate',
            taskLabelOf: () => '翻译',
            computeDisplayProgress: () => ({ pct: 0, label: '' }),
            clearQwenIslandBatchSticky: () => {},
            jobProgressLogApi: {
                clearTrackers: () => {},
                formatJobStartLine: (total) => `start ${total}`,
            },
            jobLogTrackers: {},
            translateStyleApi: {},
        });
        api.onJobStart({ total: 1, items: ['F:/a.mp4'], backend: 'transub' });
        assert.strictEqual(state.running, true);
        assert.ok(state.jobStartedAt > 0);
        assert.strictEqual(state.total, 1);
        assert.strictEqual(state.itemStage, 'starting');
        assert.strictEqual(state.jobBackend, 'transub');
        assert.ok(logs.some((m) => String(m).includes('start') || String(m).includes('开始')));
    });

    it('onJobStart preserves shelf pipelineFloor so rail does not reset to 准备', () => {
        const state = makeState({
            items: [{
                path: 'F:/a.mp4',
                status: 'ready',
                selected: true,
                fromShelf: true,
                skipAsr: true,
                shelfEntryStage: 'translate',
                pipelineFloor: 3,
                stage: 'translate',
                sourceSubtitlePath: 'F:/a.original.srt',
                shelfMediaId: 'mid-1',
            }],
            running: false,
            jobStartedAt: 0,
        });
        const els = makeEls();
        const api = createBatchJobProgress({
            state,
            els,
            appendLog: () => {},
            normPath: (p) => String(p || '').replace(/\\/g, '/').toLowerCase(),
            findItem: (p) => state.items.find((i) => i.path === p) || null,
            rowRefreshAtByPath: new Map(),
            renderList: () => {},
            updateProgressUi: () => {},
            updateStartButton: () => {},
            updateAutoSenseUi: () => {},
            startElapsedTicker: () => {},
            syncResourceUsageMonitor: () => {},
            syncEngineModelsBrowseOnlyFromTaskState: async () => {},
            setBadge: () => {},
            readEngineBackendFromForm: () => 'transub',
            readTaskFromForm: () => 'translate',
            taskLabelOf: () => '翻译',
            computeDisplayProgress: () => ({ pct: 0, label: '' }),
            clearQwenIslandBatchSticky: () => {},
            jobProgressLogApi: { clearTrackers: () => {}, formatJobStartLine: () => 'start' },
            jobLogTrackers: {},
            translateStyleApi: {},
        });
        api.onJobStart({ total: 1, items: ['F:/a.mp4'], backend: 'transub' });
        const item = state.items[0];
        assert.strictEqual(item.pipelineFloor, 3);
        assert.strictEqual(item.pipeHighWater, 3);
        assert.strictEqual(item.fromShelf, true);
        assert.strictEqual(item.shelfEntryStage, 'translate');
        assert.strictEqual(item.sourceSubtitlePath, 'F:/a.original.srt');
        assert.strictEqual(item.shelfMediaId, 'mid-1');
    });

    it('onJobStart still renderLists when progressLabel/currentFile are missing', () => {
        const state = makeState({
            items: [{ path: 'F:/a.mp4', status: 'ready', selected: true }],
            running: false,
            jobStartedAt: 0,
        });
        let rendered = 0;
        const api = createBatchJobProgress({
            state,
            els: {
                progressBar: { style: { width: '' } },
                progressCount: { textContent: '' },
                progressEta: { textContent: '', classList: { add() {}, toggle() {}, remove() {} } },
                logHost: { innerHTML: '' },
                loadingOverlay: { classList: { add() {}, remove() {} } },
            },
            appendLog: () => {},
            normPath: (p) => String(p || '').replace(/\\/g, '/').toLowerCase(),
            findItem: (p) => state.items.find((i) => i.path === p) || null,
            rowRefreshAtByPath: new Map(),
            renderList: () => { rendered += 1; },
            updateProgressUi: () => {},
            updateStartButton: () => {},
            updateAutoSenseUi: () => {},
            startElapsedTicker: () => {},
            syncResourceUsageMonitor: () => {},
            syncEngineModelsBrowseOnlyFromTaskState: async () => {},
            setBadge: () => {},
            readEngineBackendFromForm: () => 'transub',
            readTaskFromForm: () => 'translate',
            taskLabelOf: () => '翻译',
            computeDisplayProgress: () => ({ pct: 0, label: '' }),
            clearQwenIslandBatchSticky: () => {},
            jobProgressLogApi: { clearTrackers: () => {}, formatJobStartLine: () => 'start' },
            jobLogTrackers: {},
            translateStyleApi: {},
        });
        assert.doesNotThrow(() => {
            api.onJobStart({ total: 1, items: ['F:/a.mp4'], backend: 'transub' });
        });
        assert.strictEqual(state.running, true);
        assert.strictEqual(state.items[0].status, 'pending');
        assert.ok(rendered >= 1, 'renderList must run so card status updates');
    });

    it('updateItem forces full row rebuild when entering running (pipeline DOM)', () => {
        const item = { path: 'F:/a.mp4', status: 'pending', progress: 0 };
        const state = makeState({ items: [item], running: true });
        const refreshes = [];
        const api = createBatchJobProgress({
            state,
            els: makeEls(),
            findItem: (p) => (String(p).includes('a.mp4') ? item : null),
            normPath: (p) => String(p || '').toLowerCase(),
            rowRefreshAtByPath: new Map(),
            refreshListRow: (it, opts) => {
                refreshes.push({ status: it.status, light: !!(opts && opts.light) });
                return true;
            },
            renderList: () => {},
        });
        api.updateItem('F:/a.mp4', { status: 'running', progress: 5, detail: '转写中', stage: 'transcribe' });
        assert.strictEqual(item.status, 'running');
        assert.ok(refreshes.length >= 1);
        assert.strictEqual(refreshes[0].light, false, 'structure change must not use light patch');
    });

    it('onProgress does not inherit previous item translate rail onto the next file', () => {
        const infer = require('../src/js/infer-stage-progress-core.js');
        const a = {
            path: 'F:/a.mp4',
            status: 'done',
            progress: 97,
            stage: 'save',
            startedAt: 1,
            completedAt: 2,
        };
        const b = {
            path: 'F:/b.mp4',
            status: 'pending',
            progress: 0,
            detail: '等待中',
        };
        const state = makeState({
            items: [a, b],
            running: true,
            activePath: 'F:/a.mp4',
            itemStage: 'save',
            videoProgress: 97,
            lastProgressBumpPct: 97,
            index: 1,
            total: 2,
        });
        const api = createBatchJobProgress({
            state,
            els: makeEls(),
            appendLog: () => {},
            basename: (p) => String(p || '').split(/[/\\]/).pop() || '',
            normPath: (p) => String(p || '').replace(/\\/g, '/').toLowerCase(),
            findItem: (p) => {
                const key = String(p || '').replace(/\\/g, '/').toLowerCase();
                return state.items.find((i) => i.path.replace(/\\/g, '/').toLowerCase() === key) || null;
            },
            rowRefreshAtByPath: new Map(),
            refreshListRow: () => true,
            renderList: () => {},
            updateProgressUi: () => {},
            setCurrentFileText: () => {},
            setProgressLabelText: () => {},
            formatJobProgressLabel: (stage, detail) => `${stage}:${detail}`,
            clearItemQcFixed: () => {},
            stageRank: infer.stageRank,
            isPreTranscribeStage: infer.isPreTranscribeStage,
            inferProgress: infer,
            bumpProgress: infer.bumpProgress,
            clearQwenIslandBatchSticky: () => {},
        });
        api.onProgress({
            phase: 'running',
            fullPath: 'F:/b.mp4',
            index: 2,
            total: 2,
            itemStage: 'transcribe',
            itemProgress: 12,
            itemDetail: '原文提取中…',
        });
        assert.strictEqual(state.activePath, 'F:/b.mp4');
        assert.strictEqual(state.itemStage, 'transcribe');
        assert.ok(Number(state.videoProgress) < 70, `progress leaked ${state.videoProgress}`);
        assert.strictEqual(b.status, 'running');
        assert.strictEqual(b.stage, 'transcribe');
        assert.ok(Number(b.progress) < 70, `item progress leaked ${b.progress}`);
        assert.ok((Number(b.pipeHighWater) || 0) <= 1, `rail leaked ${b.pipeHighWater}`);
    });

    it('onProgress keeps dual translate resume on the same file', () => {
        const infer = require('../src/js/infer-stage-progress-core.js');
        const item = {
            path: 'F:/a.mp4',
            status: 'running',
            progress: 64,
            stage: 'transcribe',
            startedAt: 1,
            pipeHighWater: 1,
        };
        const state = makeState({
            items: [item],
            running: true,
            activePath: 'F:/a.mp4',
            itemStage: 'transcribe',
            itemDualPhase: 'source',
            videoProgress: 64,
            index: 1,
            total: 1,
        });
        const api = createBatchJobProgress({
            state,
            els: makeEls(),
            appendLog: () => {},
            basename: (p) => String(p || '').split(/[/\\]/).pop() || '',
            normPath: (p) => String(p || '').replace(/\\/g, '/').toLowerCase(),
            findItem: () => item,
            rowRefreshAtByPath: new Map(),
            refreshListRow: () => true,
            renderList: () => {},
            updateProgressUi: () => {},
            formatJobProgressLabel: (stage) => stage,
            clearItemQcFixed: () => {},
            stageRank: infer.stageRank,
            isPreTranscribeStage: infer.isPreTranscribeStage,
            inferProgress: infer,
            bumpProgress: infer.bumpProgress,
            clearQwenIslandBatchSticky: () => {},
        });
        api.onProgress({
            phase: 'running',
            fullPath: 'F:/a.mp4',
            index: 1,
            total: 1,
            itemStage: 'starting',
            itemDualPhase: 'translate',
            itemProgress: 65,
            itemDetail: '双语 · 准备译文',
        });
        assert.ok(Number(state.videoProgress) >= 64, 'same-file dual resume must not zero progress');
        assert.strictEqual(item.startedAt, 1);
    });
});
