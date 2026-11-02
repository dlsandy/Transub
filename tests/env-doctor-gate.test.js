const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('env-doctor-gate', () => {
    let tmp;
    let gate;
    let prevWritable;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-env-doctor-'));
        // Stub writable root via app-paths if possible; gate uses getWritableRoot().
        const appPaths = require('../electron/app-paths');
        prevWritable = appPaths.getWritableRoot;
        appPaths.getWritableRoot = () => tmp;
        delete require.cache[require.resolve('../electron/env-doctor-gate')];
        gate = require('../electron/env-doctor-gate');
    });

    afterEach(() => {
        const appPaths = require('../electron/app-paths');
        if (prevWritable) appPaths.getWritableRoot = prevWritable;
        delete require.cache[require.resolve('../electron/env-doctor-gate')];
        try {
            fs.rmSync(tmp, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('writes and reads okForVersion stamp', () => {
        assert.equal(gate.readGateState().okForVersion, '');
        const res = gate.writeOkForVersion('2.5.0');
        assert.equal(res.ok, true);
        assert.equal(gate.readGateState().okForVersion, '2.5.0');
        assert.equal(gate.isOkForVersion('2.5.0'), true);
        assert.equal(gate.isOkForVersion('2.5.1'), false);
    });

    it('needsEnvDoctorGate follows version stamp even without settings', () => {
        assert.equal(gate.needsEnvDoctorGate('2.5.0', { hasSettings: false }), true);
        assert.equal(gate.needsEnvDoctorGate('2.5.0', { hasSettings: true }), true);
        gate.writeOkForVersion('2.5.0');
        assert.equal(gate.needsEnvDoctorGate('2.5.0', { hasSettings: false }), false);
        assert.equal(gate.needsEnvDoctorGate('2.5.0', { hasSettings: true }), false);
        assert.equal(gate.needsEnvDoctorGate('2.5.1', { hasSettings: true }), true);
    });

    it('clearOkForVersion removes stamp file', () => {
        gate.writeOkForVersion('1.0.0');
        assert.ok(fs.existsSync(gate.getGateFilePath()));
        gate.clearOkForVersion();
        assert.equal(gate.readGateState().okForVersion, '');
    });
});

describe('env-doctor-core export', () => {
    it('exports create-style API flags', () => {
        const api = require('../src/js/env-doctor-core.js');
        assert.equal(typeof api.isStandaloneEnvDoctor, 'boolean');
        assert.equal(typeof api.bootStandalone, 'function');
        assert.equal(typeof api.openDoctorModal, 'function');
    });
});

describe('env-check-locale-core packaging name', () => {
    it('is loadable beside env-doctor', () => {
        const api = require('../src/js/env-check-locale-core.js');
        assert.equal(typeof api.createEnvCheckLocale, 'function');
    });
});
