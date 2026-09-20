'use strict';

const assert = require('assert');
const { createRetranslateRunner } = require('../src/js/retranslate-runner-core.js');
const { createJobSessionControl } = require('../src/js/job-session-control-core.js');

describe('TransubRetranslateRunner', () => {
    it('exports createRetranslateRunner', () => {
        assert.strictEqual(typeof createRetranslateRunner, 'function');
    });

    it('runRetranslateFromModal early-returns when plan empty', async () => {
        const toasts = [];
        const runner = createRetranslateRunner({
            state: { retranslatePlan: [] },
            els: {},
            showToast: (msg, tone) => { toasts.push({ msg, tone }); },
        });
        await runner.runRetranslateFromModal();
        assert.ok(toasts.some((t) => String(t.msg).includes('没有可翻译') && t.tone === 'warn'));
    });

    it('runRetranslateFromModal prompts Pro when smart mode without entitlement', async () => {
        let prompted = 0;
        const runner = createRetranslateRunner({
            state: {
                retranslatePlan: [{ item: { path: 'a.mp4' }, sourcePath: 'a.srt', destPath: 'a.zh.srt' }],
            },
            els: {
                retranslateModeSmart: { checked: true },
                quickLanguageSelect: { value: 'ja' },
                languageSelect: { value: 'ja' },
                quickTargetLangSelect: { value: 'simplified' },
                chineseSubtitleVariantSelect: { value: 'simplified' },
                retranslateModelSelect: { value: '' },
                retranslateHybridMtSelect: { value: '' },
                smartTranslateFaithfulCheck: { checked: false },
                insertSoftwareCreditCheck: { checked: true },
            },
            readRetranslateModeFromModal: () => 'smart',
            getAdvancedEntitled: () => false,
            promptProUnlockRequired: () => { prompted += 1; },
            showToast: () => {},
            settingsNormApi: {},
            retranslatePlanApi: {},
        });
        await runner.runRetranslateFromModal();
        assert.strictEqual(prompted, 1);
    });

    it('activates infer log tab (not app) when starting a retranslate run', async () => {
        const tabs = [];
        const patches = [];
        const runner = createRetranslateRunner({
            state: {
                retranslatePlan: [{
                    item: { path: 'a.mp4', name: 'a' },
                    sourcePath: 'a.srt',
                    destPath: 'a.zh.srt',
                    cues: [{ index: 0, startMs: 0, endMs: 1000, text: 'hello' }],
                }],
                retranslateBusy: false,
                retranslateAbort: false,
            },
            els: {
                retranslateModeLlm: { checked: true },
                quickLanguageSelect: { value: 'ja' },
                languageSelect: { value: 'ja' },
                quickTargetLangSelect: { value: 'simplified' },
                chineseSubtitleVariantSelect: { value: 'simplified' },
                retranslateModelSelect: { value: 'm' },
                insertSoftwareCreditCheck: { checked: false },
                progressBar: { style: {} },
                progressLabel: {},
                progressCount: {},
                currentFile: {},
            },
            readRetranslateModeFromModal: () => 'llm',
            getAdvancedEntitled: () => true,
            showToast: () => {},
            settingsNormApi: {
                normalizeChineseSubtitleVariant: (v) => v,
            },
            retranslatePlanApi: {},
            translateStyleApi: { getPresetLabel: (p) => p },
            readRetranslateStyleFromModal: () => ({
                translateStyleEnabled: true,
                translateStylePreset: 'natural_spoken',
                translateStyleCustomNote: '',
            }),
            activateInferLogTab: () => { tabs.push('infer'); },
            activateAppLogTab: () => { tabs.push('app'); },
            ensureLogExpanded: () => {},
            appendRetranslateLog: () => {},
            updateStartButton: () => {},
            setBadge: () => {},
            updateItem: (path, patch) => { patches.push({ path, ...patch }); },
            refreshListRow: () => {},
            closeRetranslateModal: () => {},
            primarySubFormatFromForm: () => 'srt',
            electron: {
                transubReadSubtitleFile: async () => ({ ok: false, error: 'skip' }),
                transubSakuraTranslate: async () => ({ ok: false, error: 'stop-early' }),
            },
            resetJobProgressState: () => {},
            updateProgressUi: () => {},
            renderList: () => {},
            formatDuration: () => '0s',
            elapsedSecSince: () => 0,
        });
        await runner.runRetranslateFromModal();
        assert.ok(tabs.includes('infer'), `expected infer tab activation, got ${JSON.stringify(tabs)}`);
        assert.ok(!tabs.includes('app'), 'must not switch to software/app log tab');
        const startPatch = patches.find((p) => p.status === 'running' && p.stage === 'translate');
        assert.ok(startPatch, 'retranslate must pin pipeline stage to translate');
        assert.strictEqual(startPatch.pipelineFloor, 3);
    });
});

describe('appendRetranslateLog sink', () => {
    it('writes to appendInferLog when TransubFeatures is available', () => {
        const infer = [];
        const app = [];
        const g = globalThis;
        const prev = g.TransubFeatures;
        g.TransubFeatures = {
            appendInferLog: (line, tone) => { infer.push({ line, tone }); },
            activateLogTab: () => {},
        };
        try {
            const api = createJobSessionControl({
                state: { items: [], running: false },
                els: {
                    logHost: {
                        textContent: '日志将显示在此处…',
                        querySelector: () => null,
                        appendChild: (row) => { app.push(row?.textContent || ''); },
                        childElementCount: 0,
                        closest: () => null,
                        removeChild: () => {},
                        firstChild: null,
                    },
                },
                getIsStandaloneSettings: () => true,
                scrollMainLogPanel: () => {},
                showToast: () => {},
            });
            api.appendRetranslateLog('分块 1/2', 'info');
            assert.strictEqual(app.length, 0);
            assert.strictEqual(infer.length, 1);
            assert.ok(String(infer[0].line).includes('[重新翻译]'));
            assert.ok(String(infer[0].line).includes('分块 1/2'));
        } finally {
            if (prev === undefined) delete g.TransubFeatures;
            else g.TransubFeatures = prev;
        }
    });
});
