/**
 * Persist / load Laya API key on advanced.json (Pro, optional for local).
 * Mode / threshold / endpoint stay in settings.json.
 */
const { asString, asPlainObject } = require('./ipc-validate');
const jevSecrets = require('./jev-secrets');
const jevClient = require('./jev-client');
const jevCore = require('../src/js/jev-decision-core');

function createJevRuntime(host) {
    function ensureJevLoaded(doc) {
        const blob = asString(doc?.jevKeyBlob, 16384);
        jevSecrets.loadJevKeyBlob(blob);
    }

    function attachPublicJev(status, doc) {
        ensureJevLoaded(doc);
        const pub = jevSecrets.getJevPublicConfig();
        status.jev = {
            ...pub,
            entitled: !!(status.entitled || status.devUnlock),
            feature: 'jevDecision',
            provider: 'laya',
        };
        status.jevKeyHint = pub.keyHint || '';
        return status;
    }

    function saveJevConfig(payload = {}) {
        const deviceId = host.getAdvancedDeviceId();
        const current = host.readAdvancedDoc();
        const doc = current.doc;
        ensureJevLoaded(doc);

        const patch = asPlainObject(payload);
        let keyBlob = asString(doc.jevKeyBlob, 16384);

        if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')
            || Object.prototype.hasOwnProperty.call(patch, 'jevApiKey')
            || Object.prototype.hasOwnProperty.call(patch, 'layaApiKey')) {
            const apiKey = asString(
                patch.apiKey ?? patch.jevApiKey ?? patch.layaApiKey,
                8192,
            ).trim();
            if (!apiKey) {
                jevSecrets.clearJevApiKey();
                keyBlob = '';
            } else {
                const set = jevSecrets.setJevApiKey(apiKey);
                if (!set.ok) return set;
                keyBlob = set.blob || '';
            }
        }

        const saved = host.writeAdvancedDoc({
            ...doc,
            jevKeyBlob: keyBlob,
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        ensureJevLoaded(saved.doc);
        return {
            ok: true,
            status: host.publicStatus(saved.doc, deviceId),
            message: keyBlob ? '已保存 Laya API Key' : '已清除 Laya API Key',
        };
    }

    function clearJevKey() {
        return saveJevConfig({ apiKey: '' });
    }

    async function probeJev(payload = {}) {
        const gate = host.requireJevDecision();
        if (!gate.ok) {
            return { ok: false, error: gate.error || 'Laya 决策需解锁 Pro', code: gate.code };
        }
        const doc = host.readAdvancedDoc().doc;
        ensureJevLoaded(doc);
        const patch = asPlainObject(payload);
        const endpoint = patch.endpoint || patch.jevEndpoint || 'local';
        let apiKey = asString(
            patch.apiKey || patch.jevApiKey || patch.layaApiKey,
            8192,
        ).trim();
        if (!apiKey) {
            const got = jevSecrets.getJevApiKey();
            if (got.ok) apiKey = got.apiKey || '';
        }
        const res = await jevClient.probeSystemOne({ apiKey, endpoint });
        if (!res.ok) {
            return {
                ok: false,
                error: res.error || '探测失败',
                code: res.code,
                hint: res.hint,
                endpoint: res.endpoint,
                port: res.port,
                resolved: jevCore.formatResolvedEndpointLabel(endpoint),
            };
        }
        return {
            ok: true,
            message: res.model
                ? `Laya 可达（${res.model}）`
                : `Laya 可达${res.port ? ` :${res.port}` : ''}`,
            model: res.model,
            port: res.port,
            endpoint: res.endpoint,
            via: res.via,
            resolved: res.endpoint,
        };
    }

    async function testJev(payload = {}) {
        const gate = host.requireJevDecision();
        if (!gate.ok) {
            return { ok: false, error: gate.error || 'Laya 决策需解锁 Pro', code: gate.code };
        }
        const doc = host.readAdvancedDoc().doc;
        ensureJevLoaded(doc);
        const patch = asPlainObject(payload);
        const endpoint = patch.endpoint || patch.jevEndpoint || 'local';
        const portGuard = require('./jev-port-guard');
        const guarded = portGuard.guardEndpoint(endpoint);
        if (!guarded.ok) {
            return {
                ok: false,
                error: guarded.error || '端口冲突',
                code: guarded.code,
                hint: guarded.hint,
            };
        }
        const resolved = guarded.endpoint;
        let apiKey = asString(
            patch.apiKey || patch.jevApiKey || patch.layaApiKey,
            8192,
        ).trim();
        if (!apiKey) {
            const got = jevSecrets.getJevApiKey();
            if (!got.ok) return { ok: false, error: got.error || '密钥解密失败' };
            apiKey = got.apiKey || '';
        }
        if (jevCore.requiresApiKey(resolved) && !apiKey) {
            return { ok: false, error: '云端 Laya Studio 需填写 API Key（lsk_live_…）' };
        }

        const res = await jevClient.testJevConnection({ apiKey, endpoint });
        if (!res.ok) {
            const hint = jevCore.isLocalSystemOneEndpoint(resolved)
                ? ` ${portGuard.localStartHint(guarded.port || portGuard.LAYA_PORT)}`
                : '';
            return {
                ok: false,
                error: `${res.error || '连接失败'}${hint}`,
                code: res.code,
                hint: res.hint || (hint ? portGuard.localStartHint() : undefined),
            };
        }
        return {
            ok: true,
            message: res.model
                ? `Laya 可用（${res.model}，端口 ${guarded.port || '云端'}）`
                : `Laya 连接成功${guarded.port ? `（:${guarded.port}）` : ''}`,
            model: res.model,
            port: guarded.port,
        };
    }

    function resolveJevAuth(options = {}) {
        const mode = jevCore.normalizeJevDecisionMode(options.jevDecisionMode);
        if (mode === 'off') return { ok: false, reason: 'disabled' };
        const gate = host.requireJevDecision();
        if (!gate.ok) return { ok: false, reason: 'not_entitled', error: gate.error };
        const doc = host.readAdvancedDoc().doc;
        ensureJevLoaded(doc);
        const endpoint = options.jevEndpoint || options.jevDecisionEndpoint || 'local';
        const resolved = jevCore.resolveJevEndpoint(endpoint);
        const got = jevSecrets.getJevApiKey();
        if (!got.ok) return { ok: false, reason: 'decrypt_failed', error: got.error };
        if (jevCore.requiresApiKey(resolved) && !got.apiKey) {
            return { ok: false, reason: 'missing_key' };
        }
        return {
            ok: true,
            apiKey: got.apiKey || '',
            endpoint,
            model: options.jevModel || jevCore.DEFAULT_MODEL,
            minConfidence: jevCore.clampJevMinConfidence(options.jevDecisionMinConfidence),
            fromEnv: !!got.fromEnv,
        };
    }

    return {
        ensureJevLoaded,
        attachPublicJev,
        saveJevConfig,
        clearJevKey,
        testJev,
        probeJev,
        resolveJevAuth,
        getJevApiKey: () => jevSecrets.getJevApiKey(),
    };
}

module.exports = {
    createJevRuntime,
};
