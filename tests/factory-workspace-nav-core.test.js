'use strict';

const assert = require('assert');
const { createFactoryWorkspaceNav } = require('../src/js/factory-workspace-nav-core.js');

describe('TransubFactoryWorkspaceNav', () => {
    it('exports createFactoryWorkspaceNav', () => {
        assert.strictEqual(typeof createFactoryWorkspaceNav, 'function');
    });

    it('setFactoryWorkspace updates state and body classes', async () => {
        const toggles = [];
        const body = {
            classList: {
                toggle(name, on) { toggles.push([name, on]); },
            },
        };
        const buttons = [
            { getAttribute: () => 'queue', classList: { toggle() {} } },
            { getAttribute: () => 'burn', classList: { toggle() {} } },
        ];
        const state = { factoryWorkspace: 'queue', items: [] };
        const nav = createFactoryWorkspaceNav({
            state,
            getDocument: () => ({
                body,
                querySelectorAll: () => buttons,
                addEventListener() {},
            }),
            factoryChromeApi: {
                normalizeWorkspace: (id) => (id === 'burn' ? 'burn' : 'queue'),
            },
            ensureFactoryWorkspaceScripts: async () => {},
        });
        await nav.setFactoryWorkspace('burn');
        assert.strictEqual(state.factoryWorkspace, 'burn');
        assert.ok(toggles.some(([n, on]) => n === 'workspace-burn' && on === true));
    });

    it('pickBurnHandoffFromQueue returns paths', () => {
        const state = { items: [] };
        const nav = createFactoryWorkspaceNav({
            state,
            pickFactoryHandoffItem: () => ({
                path: 'C:/v.mp4',
                bilingualSubtitlePath: 'C:/bi.srt',
                sourceSubtitlePath: 'C:/src.srt',
            }),
            getSubtitlePathForItem: () => 'C:/sub.srt',
            getSelectedItems: () => [],
        });
        const pick = nav.pickBurnHandoffFromQueue();
        assert.deepStrictEqual(pick, {
            videoPath: 'C:/v.mp4',
            subtitlePath: 'C:/sub.srt',
            bilingualSubtitlePath: 'C:/bi.srt',
            sourceSubtitlePath: 'C:/src.srt',
            path: 'C:/v.mp4',
        });
    });
});
