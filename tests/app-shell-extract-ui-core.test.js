'use strict';

const assert = require('assert');
const { createBurnSettingsUi } = require('../src/js/burn-settings-ui-core.js');
const { createJobSessionControl } = require('../src/js/job-session-control-core.js');
const { createQuickExtrasUi } = require('../src/js/quick-extras-ui-core.js');

describe('TransubBurnSettingsUi', () => {
    it('exports createBurnSettingsUi', () => {
        assert.strictEqual(typeof createBurnSettingsUi, 'function');
    });

    it('applies burn settings into form fields', () => {
        const els = {
            settingsBurnContainerSelect: { value: '' },
            settingsBurnAudioModeSelect: { value: '' },
            settingsBurnCrf: { value: '' },
            settingsBurnResolutionSelect: { value: '' },
            settingsBurnFpsSelect: { value: '' },
            settingsBurnEncodeSpeedSelect: { value: '' },
            settingsBurnOutputSuffix: { value: '' },
            settingsBurnOutputDirInput: { value: '' },
            settingsBurnEncoderSelect: null,
        };
        const ui = createBurnSettingsUi({
            els,
            settingsNormApi: {
                normalizeBurnSettingsOptions: (o) => ({
                    burnContainer: 'mkv',
                    burnEncoderId: 'libx264',
                    burnAudioMode: 'copy',
                    burnCrf: 20,
                    burnResolutionId: 'source',
                    burnFpsId: 'source',
                    burnEncodeSpeedId: 'medium',
                    burnOutputSuffix: 'burned',
                    burnOutputDir: String(o.burnOutputDir || ''),
                }),
            },
        });
        ui.applyBurnSettingsToForm({ burnOutputDir: 'D:\\out' });
        assert.strictEqual(els.settingsBurnContainerSelect.value, 'mkv');
        assert.strictEqual(els.settingsBurnOutputDirInput.value, 'D:\\out');
        assert.strictEqual(els.settingsBurnCrf.value, '20');
    });
});

describe('TransubJobSessionControl', () => {
    it('exports createJobSessionControl', () => {
        assert.strictEqual(typeof createJobSessionControl, 'function');
    });

    it('setBadge updates class and text', () => {
        const els = {
            jobStatusBadge: { textContent: '', className: '' },
        };
        const api = createJobSessionControl({
            state: { items: [], running: false, postBatchBusy: false, retranslateBusy: false, computeBusy: false },
            els,
            computeStartBlockReason: () => '',
            updateStartHint: () => {},
        });
        api.setBadge('运行中', 'running');
        assert.strictEqual(els.jobStatusBadge.textContent, '运行中');
        assert.ok(els.jobStatusBadge.className.includes('factory-job-badge--running'));
    });

    it('updateStartButton switches label between 开始执行 and 任务中', () => {
        const label = { textContent: '开始执行' };
        const classes = new Set();
        const attrs = {};
        const els = {
            startBtn: {
                disabled: true,
                classList: {
                    toggle(name, on) {
                        if (on) classes.add(name);
                        else classes.delete(name);
                    },
                    contains(name) { return classes.has(name); },
                },
                setAttribute(k, v) { attrs[k] = v; },
                querySelector: (sel) => (sel === 'span' ? label : null),
            },
        };
        const state = {
            items: [],
            running: false,
            postBatchBusy: false,
            retranslateBusy: false,
            batchStartInFlight: false,
            computeBusy: false,
        };
        const api = createJobSessionControl({
            state,
            els,
            computeStartBlockReason: () => (state.running || state.batchStartInFlight ? 'busy' : ''),
            updateStartHint: () => {},
            uiTf: (s) => s,
        });
        api.updateStartButton();
        assert.strictEqual(label.textContent, '开始执行');
        assert.strictEqual(els.startBtn.disabled, false);
        assert.strictEqual(attrs['aria-disabled'], 'false');
        assert.ok(!classes.has('is-blocked'));
        state.batchStartInFlight = true;
        api.updateStartButton();
        assert.strictEqual(label.textContent, '任务中');
        assert.strictEqual(els.startBtn.disabled, false, 'blocked Start must stay clickable');
        assert.strictEqual(attrs['aria-disabled'], 'true');
        assert.ok(classes.has('is-blocked'));
        state.batchStartInFlight = false;
        state.running = true;
        api.updateStartButton();
        assert.strictEqual(label.textContent, '任务中');
        assert.strictEqual(els.startBtn.disabled, false);
    });

    it('appendLog writes a log line', () => {
        const children = [];
        global.document = {
            createElement(tag) {
                return {
                    tagName: String(tag || '').toUpperCase(),
                    className: '',
                    textContent: '',
                };
            },
            getElementById() { return null; },
        };
        const els = {
            logHost: {
                textContent: '日志将显示在此处…',
                querySelector: () => null,
                appendChild(row) { children.push(row); this.childElementCount = children.length; },
                removeChild() {},
                closest: () => null,
                childElementCount: 0,
            },
            factoryStatusLogBody: { textContent: '' },
            factoryStatusLogTime: { textContent: '' },
            factoryStatusLogBtn: { title: '', removeAttribute() {} },
        };
        const api = createJobSessionControl({
            state: { items: [] },
            els,
            getIsStandaloneSettings: () => true,
            scrollMainLogPanel: () => {},
            factoryStatusBarApi: {
                summarizeLatestLogLine: () => ({ time: '1', body: 'b', full: 'full' }),
            },
        });
        api.appendLog('hello', 'info');
        assert.strictEqual(children.length, 1);
        assert.ok(String(children[0].textContent).includes('hello'));
        delete global.document;
    });
});

describe('TransubQuickExtrasUi', () => {
    it('exports createQuickExtrasUi', () => {
        assert.strictEqual(typeof createQuickExtrasUi, 'function');
    });

    it('normalizes post-batch QC fix mode', () => {
        let mtUse = false;
        const ui = createQuickExtrasUi({
            els: {},
            getMtUseFormState: () => mtUse,
            setMtUseFormState: (v) => { mtUse = !!v; },
            isAutoSenseEnabled: () => true,
            readTranslateModeFromForm: () => 'engine',
            readTaskFromForm: () => 'dual',
        });
        assert.strictEqual(ui.normalizePostBatchQcFixMode('SMART'), 'smart');
        assert.strictEqual(ui.normalizePostBatchQcFixMode('nope'), 'none');
        assert.strictEqual(ui.shouldFollowSenseForMt(), false);
        ui.setMtUseForm(true);
        assert.strictEqual(ui.shouldFollowSenseForMt(), false);
    });
});

describe('TransubBilingualTaskUi', () => {
    const { createBilingualTaskUi } = require('../src/js/bilingual-task-ui-core.js');

    it('syncMergeBilingualUi disables merge when task is not dual', () => {
        const els = {
            mergeBilingualCheck: { disabled: false, checked: true },
            mergeBilingualWrap: { classList: { toggle() {} } },
            mergeBilingualOrderSelect: { disabled: false, value: 'translation-first' },
            mergeBilingualOrderWrap: { classList: { toggle() {} } },
            deleteSourcesAfterMergeCheck: { disabled: false, checked: true },
            deleteSourcesAfterMergeWrap: { classList: { toggle() {} } },
        };
        let chip = 0;
        const ui = createBilingualTaskUi({
            els,
            readTaskFromForm: () => 'transcribe',
            syncBilingualChipUi: () => { chip += 1; },
        });
        ui.syncMergeBilingualUi();
        assert.strictEqual(els.mergeBilingualCheck.disabled, true);
        assert.strictEqual(els.deleteSourcesAfterMergeCheck.checked, false);
        assert.strictEqual(chip, 1);
    });
});

describe('TransubFactoryStatusChips', () => {
    const { createFactoryStatusChips } = require('../src/js/factory-status-chips-core.js');

    it('syncEngineBackendUi dims twai blocks for engine backend', () => {
        const toggles = [];
        const els = {
            engineSettingsBlock: { classList: { toggle: (c, on) => toggles.push(['engine', c, on]) } },
            twaiSettingsBlock: { classList: { toggle: (c, on) => toggles.push(['twai', c, on]) } },
            subFormatLrcWrap: { classList: { toggle() {} } },
            subFormatAssWrap: { classList: { toggle() {} } },
            engineOutputExtrasWrap: { classList: { toggle() {} } },
            glossaryMtWrap: { classList: { toggle() {} } },
            envBannerText: { textContent: '' },
        };
        const ui = createFactoryStatusChips({
            els,
            readEngineBackendFromForm: () => 'transub',
        });
        ui.syncEngineBackendUi();
        assert.ok(toggles.some((t) => t[0] === 'engine' && t[2] === false));
        assert.ok(toggles.some((t) => t[0] === 'twai' && t[2] === true));
    });
});
