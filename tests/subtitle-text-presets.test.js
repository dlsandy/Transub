const assert = require('assert');
const api = require('../src/js/subtitle-text-presets-core');

function testNormalizeGroup() {
    const bad = api.upsertGroup(api.emptyPresetsDoc(), { name: '', items: [] });
    assert.strictEqual(bad.ok, false);

    const created = api.upsertGroup(api.emptyPresetsDoc(), {
        name: '常规预设1',
        anchor: 'playhead',
        items: [
            { label: '片名', text: '《测试》', startSec: 0, endSec: 0.5 },
            { label: '演员', text: '甲\n乙', startSec: 0.6, endSec: 1.5 },
        ],
    });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.doc.groups.length, 1);
    assert.strictEqual(created.group.items.length, 2);
    assert.strictEqual(created.group.items[0].label, '片名');
    assert.strictEqual(created.group.items[1].startSec, 0.6);
}

function testBuildCuesRelative() {
    const group = api.normalizeGroup({
        name: 'g',
        anchor: 'playhead',
        items: [
            { label: '片名', text: 'T', startSec: 0, endSec: 0.5 },
            { label: '演员', text: 'A', startSec: 0.6, endSec: 1.5 },
        ],
    });
    const cues = api.buildCuesFromGroup(group, { baseMs: 10000 });
    assert.strictEqual(cues.length, 2);
    assert.strictEqual(cues[0].startMs, 10000);
    assert.strictEqual(cues[0].endMs, 10500);
    assert.strictEqual(cues[1].startMs, 10600);
    assert.strictEqual(cues[1].endMs, 11500);
    assert.strictEqual(cues[1].text, 'A');
}

function testBuildCuesAbsolute() {
    const group = api.normalizeGroup({
        name: 'g',
        anchor: 'absolute',
        items: [{ label: '片头', text: 'X', startSec: 1, endSec: 2 }],
    });
    const cues = api.buildCuesFromGroup(group, { baseMs: 99999 });
    assert.strictEqual(cues[0].startMs, 1000);
    assert.strictEqual(cues[0].endMs, 2000);
}

function testMigrateLegacy() {
    const doc = api.normalizePresetsDoc({
        version: 1,
        presets: [
            { name: '片名', text: '《A》', durationMs: 500 },
            { name: '演员', text: 'B', durationMs: 900 },
        ],
    });
    assert.strictEqual(doc.version, 2);
    assert.strictEqual(doc.groups.length, 1);
    assert.ok(doc.groups[0].items.length >= 2);
    assert.strictEqual(doc.groups[0].items[0].label, '片名');
}

function testStarterAndFilter() {
    const starters = api.defaultStarterGroups();
    assert.ok(starters.length >= 1);
    assert.ok(starters[0].items.some((it) => it.label === '片名'));
    let doc = api.normalizePresetsDoc({ groups: starters });
    assert.strictEqual(api.filterGroups(doc, { query: '常规' }).length, 1);
    const id = doc.groups[0].id;
    doc = api.removeGroup(doc, id);
    assert.strictEqual(doc.groups.length, 0);
    assert.strictEqual(api.findGroup(doc, id), null);
}

function testDurationSecInputAndTiming() {
    const item = api.normalizeItem({
        label: '片名',
        text: '《A》',
        startSec: 1.2,
        durationSec: 0.8,
    });
    assert.strictEqual(item.startSec, 1.2);
    assert.strictEqual(item.endSec, 2);
    assert.strictEqual(api.formatItemTiming(item), '1.2+0.8s');
}

describe('subtitle-text-presets groups', () => {
    it('normalize and upsert group', () => {
        testNormalizeGroup();
    });
    it('build cues relative to playhead', () => {
        testBuildCuesRelative();
    });
    it('build cues absolute', () => {
        testBuildCuesAbsolute();
    });
    it('migrate legacy flat presets', () => {
        testMigrateLegacy();
    });
    it('starter filter remove', () => {
        testStarterAndFilter();
    });
    it('accept durationSec and format start+duration', () => {
        testDurationSecInputAndTiming();
    });
});
