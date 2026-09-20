'use strict';

const assert = require('assert');

// Ensure bind helpers are on require path for wire modules.
require('../src/js/app-api-bind-core.js');
require('../src/js/app-shell-deps-core.js');
require('../src/js/runtime-options-core.js');
require('../src/js/app-progress-shell-core.js');
require('../src/js/post-task-ui-core.js');
require('../src/js/item-qc-markers-core.js');
require('../src/js/app-menu-coord-core.js');

const wireUtils = require('../src/js/app-wire-utils-core.js');
const { install: installChromeShell } = require('../src/js/app-wire-chrome-shell-core.js');
const { install: installChromeEntitlement } = require('../src/js/app-wire-chrome-entitlement-core.js');
const { install: installChromeTranslate } = require('../src/js/app-wire-chrome-translate-core.js');
const { install: installChromeToolbar } = require('../src/js/app-wire-chrome-toolbar-core.js');
const { install: installChromeSession } = require('../src/js/app-wire-chrome-session-core.js');
const { install: installChromeIntake } = require('../src/js/app-wire-chrome-intake-core.js');
const { install: installChromeShelf } = require('../src/js/app-wire-chrome-shelf-core.js');

const { install: installEngineModels } = require('../src/js/app-wire-engine-models-core.js');
const { install: installBatch } = require('../src/js/app-wire-batch-core.js');
const { install: installSettings } = require('../src/js/app-wire-settings-core.js');
const { install: installFactoryUi } = require('../src/js/app-wire-factory-ui-core.js');
const { install: installBoot } = require('../src/js/app-wire-boot-core.js');
const { install: installChrome } = require('../src/js/app-wire-chrome-core.js');

function minimalHost() {
    return {
        state: {
            items: [],
            pendingQueue: [],
            running: false,
            moreMenuOpen: false,
        },
        els: {},
        electron: {},
        appendLog() {},
        uiTf(s) { return s; },
        getPostTaskAction: () => 'none',
        buildSavedOptionsFromForm: () => ({}),
        getPostTaskOptionsFromUi: () => ({ postTaskAction: 'none' }),
        readActiveEngineMtModelFromForm: () => '',
        readTranslateModeFromForm: () => '',
        installedMtModelIds: () => [],
        isLlmInferencePickModelId: () => false,
        mtRouteApi: () => ({}),
    };
}

describe('app-wire cores', () => {
    it('wire utils and chrome sub-installers export expected APIs', () => {
        assert.strictEqual(typeof wireUtils.getBindApi, 'function');
        assert.strictEqual(typeof wireUtils.resolveApi, 'function');
        assert.strictEqual(typeof wireUtils.late, 'function');
        assert.strictEqual(typeof wireUtils.entitled, 'function');
        assert.strictEqual(typeof installChromeShell, 'function');
        assert.strictEqual(typeof installChromeEntitlement, 'function');
        assert.strictEqual(typeof installChromeTranslate, 'function');
        assert.strictEqual(typeof installChromeToolbar, 'function');
        assert.strictEqual(typeof installChromeSession, 'function');
        assert.strictEqual(typeof installChromeIntake, 'function');
        assert.strictEqual(typeof installChromeShelf, 'function');
    });

    it('each install is a function and accepts empty host', () => {
        assert.strictEqual(typeof installEngineModels, 'function');
        assert.strictEqual(typeof installBatch, 'function');
        assert.strictEqual(typeof installSettings, 'function');
        assert.strictEqual(typeof installFactoryUi, 'function');
        assert.strictEqual(typeof installBoot, 'function');
        assert.strictEqual(typeof installChrome, 'function');
        assert.ok(installEngineModels({}));
        assert.ok(installBatch({}));
        assert.ok(installSettings({}));
        assert.ok(installFactoryUi({}));
        assert.ok(installBoot({}));
        assert.ok(installChrome({}));
        assert.ok(installChromeShell({}));
        assert.ok(installChromeEntitlement({}));
        assert.ok(installChromeTranslate({}));
        assert.ok(installChromeToolbar({}));
        assert.ok(installChromeSession({}));
        assert.ok(installChromeIntake({}));
        assert.ok(installChromeShelf({}));
    });

    it('chrome sub-installs assign key methods on host', () => {
        const host = minimalHost();
        installChromeShell(host);
        assert.strictEqual(typeof host.cacheEls, 'function');
        assert.strictEqual(typeof host.markSettingsDirty, 'function');
        assert.strictEqual(typeof host.warnMissingRendererCores, 'function');

        installChromeEntitlement(host);
        assert.strictEqual(typeof host.getAdvancedEntitlementUi, 'function');
        assert.strictEqual(typeof host.refreshAdvancedEntitlement, 'function');

        installChromeTranslate(host);
        assert.strictEqual(typeof host.getTranslateModeUi, 'function');
        assert.strictEqual(typeof host.getBilingualTaskUi, 'function');
        assert.strictEqual(typeof host.getQuickExtrasUi, 'function');
        assert.strictEqual(typeof host.setQuickTranslateMode, 'function');
        assert.strictEqual(typeof host.setTranslateMtPickMode, 'function');

        installChromeToolbar(host);
        assert.strictEqual(typeof host.getResourceUsageUi, 'function');
        assert.strictEqual(typeof host.getQuickToolbarChipsUi, 'function');
        assert.strictEqual(typeof host.getTwaiModelSelectUi, 'function');
        // Toolbar must not overwrite translate-mode pick handlers with missing chip methods.
        assert.strictEqual(typeof host.setQuickTranslateMode, 'function');
        assert.strictEqual(typeof host.setTranslateMtPickMode, 'function');
        assert.notStrictEqual(host.setQuickTranslateMode, host.callQuickToolbarChipsUi);

        installChromeSession(host);
        assert.strictEqual(typeof host.getStartReadinessUi, 'function');
        assert.strictEqual(typeof host.getJobSessionControl, 'function');
        assert.strictEqual(typeof host.getFactoryStatusChips, 'function');

        installChromeIntake(host);
        assert.strictEqual(typeof host.addFiles, 'function');
        assert.strictEqual(typeof host.getMediaIntake, 'function');
        assert.strictEqual(typeof host.getCliCommandUi, 'function');

        installChromeShelf(host);
        assert.strictEqual(typeof host.getShelfTranslateFlow, 'function');
        assert.strictEqual(typeof host.openLogDetailModal, 'function');
        assert.strictEqual(typeof host.runRetranslateFromModal, 'function');
    });

    it('install(minimalHost) assigns expected getters / methods', () => {
        const host = minimalHost();
        host.settingsFormApplyApi = {
            createSettingsFormApply: () => ({
                applyOptionsToForm: async () => {},
                buildSavedOptionsFromForm: () => ({ task: 'translate' }),
            }),
        };
        installChrome(host);
        installEngineModels(host);
        installBatch(host);
        installSettings(host);
        installFactoryUi(host);
        installBoot(host);

        assert.strictEqual(typeof host.getEngineModelsWorkspace, 'function');
        assert.strictEqual(typeof host.refreshEngineModels, 'function');
        assert.strictEqual(typeof host.missingModelsCtx, 'function');
        assert.strictEqual(typeof host.getBatchJobProgress, 'function');
        assert.strictEqual(typeof host.isProgressIdle, 'function');
        assert.strictEqual(typeof host.startSubtitleGeneration, 'function');
        assert.strictEqual(typeof host.flushPendingQueue, 'function');
        assert.strictEqual(typeof host.getParamsModeUi, 'function');
        assert.strictEqual(typeof host.getSettingsFormApply, 'function');
        assert.strictEqual(typeof host.buildRuntimeOptions, 'function');
        assert.strictEqual(typeof host.getFactoryShellUi, 'function');
        assert.strictEqual(typeof host.setMoreMenuOpen, 'function');
        assert.strictEqual(typeof host.computeDisplayProgress, 'function');
        assert.strictEqual(typeof host.getSubtitlePathForItem, 'function');
        assert.strictEqual(typeof host.getAppEventsBinder, 'function');
        assert.strictEqual(typeof host.bindEvents, 'function');
        assert.strictEqual(typeof host.init, 'function');
        assert.strictEqual(typeof host.warnMissingRendererCores, 'function');
        assert.strictEqual(typeof host.getJobSessionControl, 'function');
        assert.strictEqual(typeof host.markSettingsDirty, 'function');
        assert.strictEqual(typeof host.cacheEls, 'function');
        assert.strictEqual(typeof host.addFiles, 'function');
        assert.strictEqual(typeof host.getTranslateModeUi, 'function');

        // Happy-path calls that must not throw without modules loaded.
        assert.strictEqual(host.missingModelsCtx().task, 'translate');
        assert.strictEqual(host.isProgressIdle(), true);
        assert.doesNotThrow(() => host.setMoreMenuOpen(false));
        assert.deepStrictEqual(host.computeDisplayProgress(), { pct: 0, label: '…' });
        assert.strictEqual(host.getSubtitlePathForItem({ subtitlePath: 'a.srt' }), 'a.srt');
        assert.strictEqual(host.buildRuntimeOptions().task, 'translate');
        assert.strictEqual(host.buildRuntimeOptions().postTaskAction, 'none');
        assert.doesNotThrow(() => host.warnMissingRendererCores({ includeDeferred: false }));
    });
});
