'use strict';

const assert = require('assert');
const { createMediaIntake } = require('../src/js/media-intake-core.js');

describe('TransubMediaIntake', () => {
    it('exports createMediaIntake', () => {
        assert.strictEqual(typeof createMediaIntake, 'function');
    });

    it('addFiles with empty paths early-returns without throw', async () => {
        const state = {
            items: [],
            running: false,
            loadingDepth: 0,
        };
        const logs = [];
        let renderCount = 0;
        const intake = createMediaIntake({
            state,
            els: {},
            electron: {},
            appendLog: (msg, level) => { logs.push({ msg, level }); },
            findItem: () => null,
            renderList: () => { renderCount += 1; },
            updateStartButton: () => {},
            updateAutoSenseUi: () => {},
            isAutoSenseEnabled: () => false,
            isProgressIdle: () => false,
        });
        await assert.doesNotReject(async () => {
            await intake.addFiles([]);
            await intake.addFiles(null);
            await intake.addFiles(undefined);
            await intake.addFiles(['', '  ']);
        });
        assert.strictEqual(state.items.length, 0);
        assert.strictEqual(renderCount, 0);
        assert.strictEqual(logs.length, 0);
    });

    it('addFiles paints list immediately and probes in background when idle', async () => {
        const events = [];
        let resolveProbe;
        const probeGate = new Promise((resolve) => { resolveProbe = resolve; });
        const state = {
            items: [],
            running: false,
            loadingDepth: 0,
        };
        const intake = createMediaIntake({
            state,
            els: {},
            electron: {
                async ffmpegProbe() {
                    events.push('probe-start');
                    await probeGate;
                    events.push('probe-done');
                    return { ok: true, duration: 12, language: '', audioLanguages: [] };
                },
                async transWithAiCheckSubtitles() {
                    return { ok: true, subtitles: {} };
                },
            },
            findItem: () => null,
            renderList: () => { events.push('render'); },
            refreshListRow: () => { events.push('row'); },
            updateStartButton: () => { events.push('startBtn'); },
            updateAutoSenseUi: () => {},
            updateProgressUi: () => {},
            isAutoSenseEnabled: () => false,
            isProgressIdle: () => true,
        });

        const addDone = intake.addFiles(['F:/clip.mp4']);
        // addFiles must return before probe finishes when idle
        await Promise.race([
            addDone,
            new Promise((resolve) => setTimeout(resolve, 30)),
        ]);
        assert.ok(events.includes('render'), 'list should render before probe finishes');
        assert.strictEqual(state.items.length, 1);
        assert.ok(['pending', 'probing'].includes(state.items[0].status));

        resolveProbe();
        await addDone;
        // Give background probe a tick to finish
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(events.includes('probe-done'));
        assert.strictEqual(state.items[0].status, 'ready');
        assert.strictEqual(state.items[0].duration, 12);
    });
});
