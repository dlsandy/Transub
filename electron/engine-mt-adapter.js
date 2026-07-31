/**
 * Local HTTP adapter for Transub Engine `mtBackend: "external"`.
 * Engine POSTs cues (LLM path: clean text, no glossary placeholders);
 * we run Sakura / Advanced smart translate with an optional prompt glossary.
 */
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { asPlainObject, asString, asNumber } = require('./ipc-validate');

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_SMART_BATCH_SIZE = 40;
/** Keep windows modest: Qwen3-1.7B struggles with 30-cue JSON in one shot. */
const DEFAULT_SMART_WINDOW_CUES = 10;
const DEFAULT_SMART_OVERLAP_CUES = 2;
const DEFAULT_TIMEOUT_SEC = 600;
const PATH_TRANSLATE = '/translate';

/**
 * @typedef {'smart'|'sakura'} MtAdapterMode
 */

/**
 * Resolve glossary for LLM prompt (same source as subtitle editor).
 * Engine protect is skipped for Sakura/smart; terms belong in the chat prompt.
 * @param {object} options
 * @returns {object|null}
 */
function resolvePromptGlossary(options = {}) {
    const opts = asPlainObject(options);
    if (opts.glossaryMtEnabled === false) return null;
    if (opts.glossary && typeof opts.glossary === 'object') {
        return opts.glossary;
    }
    try {
        const { readGlossary } = require('./glossary-data');
        const g = readGlossary();
        if (g?.ok && g.glossary) return g.glossary;
        if (g?.glossary) return g.glossary;
    } catch { /* optional */ }
    return null;
}

/**
 * @param {object} body
 * @returns {{ ok: boolean, error?: string, cues?: object[], language?: string, targetLanguage?: string, jobId?: string }}
 */
function parseEngineMtRequest(body) {
    const raw = asPlainObject(body);
    const cuesIn = Array.isArray(raw.cues) ? raw.cues : null;
    if (!cuesIn) {
        return { ok: false, error: 'cues must be an array' };
    }
    const cues = cuesIn.map((item, i) => {
        const c = asPlainObject(item);
        const idRaw = c.id != null ? Number(c.id) : i;
        const id = Number.isInteger(idRaw) ? idRaw : i;
        const startSec = Number(c.start);
        const endSec = Number(c.end);
        const startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : undefined;
        const endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : undefined;
        return {
            id,
            index: id,
            startMs,
            endMs,
            text: String(c.text ?? ''),
        };
    });
    return {
        ok: true,
        cues,
        language: asString(raw.language, 32).trim(),
        targetLanguage: asString(raw.targetLanguage || raw.target_language || 'zh', 32).trim() || 'zh',
        jobId: asString(raw.jobId || raw.job_id, 128).trim(),
    };
}

/**
 * Map LLM cue updates back to engine response shape (preserve request ids).
 * @param {object[]} requestCues
 * @param {object[]} translatedCues
 */
function buildEngineMtResponse(requestCues, translatedCues, options = {}) {
    const mtSanitize = require('../src/js/mt-sanitize-core');
    const opts = asPlainObject(options);
    const cleaned = mtSanitize.sanitizeMtCues(
        (translatedCues || []).map((u) => ({
            index: Number(u.index),
            text: String(u.text ?? ''),
        })),
        (requestCues || []).map((c) => ({
            index: Number(c.index),
            text: String(c.text ?? ''),
        })),
        {
            glossary: opts.glossary,
            glossaryTerms: opts.glossaryTerms,
            nameMap: opts.nameMap,
            unifyNames: opts.unifyNames !== false,
            sakuraNsfwPrompt: opts.sakuraNsfwPrompt,
            nsfwPrompt: opts.nsfwPrompt,
            contentProfile: opts.contentProfile || opts.senseProfile,
            senseProfile: opts.senseProfile || opts.contentProfile,
            faithfulTone: opts.faithfulTone || opts.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: opts.smartTranslateFaithfulTone || opts.faithfulTone,
            applyNsfwLexicon: opts.applyNsfwLexicon,
        },
    );
    const map = new Map(
        cleaned.cues.map((u) => [Number(u.index), String(u.text ?? '')]),
    );
    return {
        cues: (requestCues || []).map((c) => ({
            id: c.id,
            text: map.has(c.index) ? map.get(c.index) : String(c.text ?? ''),
        })),
    };
}

/**
 * Translate one engine batch via smart / Sakura.
 * @param {object} parsed - from parseEngineMtRequest
 * @param {object} session
 */
function preprocessSourceCuesForMt(cues) {
    let list = Array.isArray(cues) ? cues : [];
    try {
        const jaNames = require('../src/js/ja-person-names-core');
        if (typeof jaNames.stripAsrHallucinationLoopsInCues === 'function') {
            list = jaNames.stripAsrHallucinationLoopsInCues(list).cues;
        }
    } catch { /* optional */ }
    try {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
            list = mtSanitize.correctJaAsrDomainMishearsInCues(list).cues;
        }
    } catch { /* optional */ }
    return list;
}

async function translateExternalBatch(parsed, session) {
    const mode = String(session.mode || '').trim();
    const options = asPlainObject(session.options);
    const rawOnProgress = typeof session.onProgress === 'function' ? session.onProgress : null;
    const signal = session.signal || null;
    const sourceCues = preprocessSourceCuesForMt(parsed.cues);

    if (signal?.aborted) {
        return { ok: false, error: '已取消', code: 'cancelled' };
    }

    // Engine POSTs many small batches; suppress repeated one-shot notices across requests.
    const onProgress = rawOnProgress
        ? (info) => {
            const detail = String(info?.message || info?.detail || '').trim();
            if (/提示词已启用/.test(detail)) {
                if (session.nsfwPromptLogged) return;
                session.nsfwPromptLogged = true;
            }
            try {
                rawOnProgress(info);
            } catch (_) { /* ignore */ }
        }
        : null;

    if (mode === 'smart') {
        const { runSmartTranslate } = require('./advanced-bridge');
        const windowCues = asNumber(options.windowCues, {
            min: 5,
            max: 80,
            fallback: DEFAULT_SMART_WINDOW_CUES,
        });
        const overlapCues = asNumber(options.overlapCues, {
            min: 0,
            max: 10,
            fallback: DEFAULT_SMART_OVERLAP_CUES,
        });
        const result = await runSmartTranslate({
            cues: sourceCues,
            chineseSubtitleVariant: options.chineseSubtitleVariant,
            targetLanguage: options.targetLanguage || parsed.targetLanguage || 'zh',
            note: options.note,
            windowCues,
            overlapCues,
            filmBrief: session.filmBrief || options.filmBrief || null,
            skipFilmBrief: !!options.skipFilmBrief,
            skipConsistency: !!options.skipConsistency,
            smartTranslateFaithfulTone: !!(
                options.smartTranslateFaithfulTone || options.faithfulTone
            ),
            // Align with subtitle editor: prompt glossary on clean Japanese.
            glossary: resolvePromptGlossary(options),
            dryRun: options.dryRun,
            signal,
            onProgress,
            _batchMode: true,
            _engineExternalMt: true,
        });
        if (!result?.ok) {
            return {
                ok: false,
                error: result?.error || '智能翻译失败',
                code: result?.code || 'smart_translate_failed',
            };
        }
        // Cache Brief across engine POSTs so later batches share the same film understanding.
        if (result.filmBrief && !session.filmBrief) {
            session.filmBrief = result.filmBrief;
        }
        return { ok: true, cues: result.cues || [], filmBrief: result.filmBrief || session.filmBrief };
    }

    if (mode === 'sakura') {
        const { runSakuraTranslate } = require('./sakura-translate');
        const modelId = asString(
            session.modelId || options.engineMtModel || options.modelId,
            128,
        ).trim();
        const result = await runSakuraTranslate({
            cues: sourceCues,
            modelId,
            glossary: resolvePromptGlossary(options),
            windowLines: options.windowLines,
            dryRun: options.dryRun,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt,
            nsfwPrompt: options.nsfwPrompt,
            contentProfile: options.contentProfile || options.senseProfile,
            senseProfile: options.senseProfile || options.contentProfile,
            faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone,
            presetId: options.presetId || options.activePresetId,
            // Prefer options.timeoutMs; else sakura uses 180s for engine external MT.
            timeoutMs: asNumber(options.timeoutMs, { min: 15000, max: 300000, fallback: 180000 }),
            signal,
            onProgress,
            _batchMode: true,
            _engineExternalMt: true,
        });
        if (!result?.ok) {
            return {
                ok: false,
                error: result?.error || 'Sakura 翻译失败',
                code: result?.code || 'sakura_failed',
            };
        }
        return { ok: true, cues: result.cues || [] };
    }

    return { ok: false, error: `未知外部 MT 模式：${mode || '(empty)'}`, code: 'bad_mode' };
}

function readJsonBody(req, { maxBytes = 8 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(Object.assign(new Error('request body too large'), { code: 'body_too_large' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(Object.assign(new Error('invalid JSON body'), { cause: err }));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

function authorizeRequest(req, token) {
    if (!token) return true;
    const auth = String(req.headers.authorization || '').trim();
    if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === token) {
        return true;
    }
    const headerToken = String(req.headers['x-transub-mt-token'] || '').trim();
    return headerToken === token;
}

/**
 * Start a localhost adapter for one batch / job session.
 * @param {object} session
 * @param {MtAdapterMode} session.mode
 * @param {object} [session.options]
 * @param {string} [session.modelId]
 * @param {AbortSignal} [session.signal]
 * @param {function} [session.onProgress]
 * @param {number} [session.port] - 0 = ephemeral
 */
function startEngineMtAdapter(session = {}) {
    const mode = String(session.mode || '').trim();
    if (mode !== 'smart' && mode !== 'sakura') {
        return Promise.resolve({ ok: false, error: `无效外部 MT 模式：${mode || '(empty)'}` });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const state = {
        mode,
        options: asPlainObject(session.options),
        modelId: asString(session.modelId, 128).trim(),
        signal: session.signal || null,
        onProgress: session.onProgress,
        busy: false,
        closed: false,
        nsfwPromptLogged: false,
        filmBrief: session.filmBrief || null,
    };

    const server = http.createServer(async (req, res) => {
        if (state.closed) {
            sendJson(res, 503, { error: 'adapter closed' });
            return;
        }
        const method = String(req.method || 'GET').toUpperCase();
        let pathname = '/';
        try {
            pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        } catch {
            pathname = String(req.url || '/').split('?')[0] || '/';
        }

        if (method === 'GET' && (pathname === '/health' || pathname === '/')) {
            sendJson(res, 200, { ok: true, mode: state.mode });
            return;
        }

        if (method !== 'POST' || pathname !== PATH_TRANSLATE) {
            sendJson(res, 404, { error: 'not found' });
            return;
        }

        if (!authorizeRequest(req, token)) {
            sendJson(res, 401, { error: 'unauthorized' });
            return;
        }

        if (state.signal?.aborted) {
            sendJson(res, 499, { error: 'cancelled', code: 'cancelled' });
            return;
        }

        if (state.busy) {
            sendJson(res, 429, { error: 'adapter busy', code: 'busy' });
            return;
        }

        state.busy = true;
        try {
            const body = await readJsonBody(req);
            const parsed = parseEngineMtRequest(body);
            if (!parsed.ok) {
                sendJson(res, 400, { error: parsed.error || 'bad request' });
                return;
            }
            const translated = await translateExternalBatch(parsed, state);
            if (!translated.ok) {
                const code = String(translated.code || 'translate_failed');
                const errText = String(translated.error || '');
                // 499 = client/job cancelled; 504 = chunk/LLM timeout; 502 = other adapter failure.
                // Legacy `aborted` mixed cancel+timeout — prefer retryable 504 when 超时 is present.
                let status = 502;
                if (code === 'cancelled') {
                    status = 499;
                } else if (code === 'timeout') {
                    status = 504;
                } else if (code === 'aborted') {
                    const cancelOnly = /已取消/.test(errText) && !/超时/.test(errText);
                    status = cancelOnly ? 499 : 504;
                } else if (code === 'busy') {
                    status = 429;
                }
                sendJson(res, status, {
                    error: translated.error || 'translate failed',
                    code: status === 504 && code === 'aborted' ? 'timeout' : code,
                });
                return;
            }
            sendJson(res, 200, buildEngineMtResponse(parsed.cues, translated.cues, {
                ...asPlainObject(state.options),
                glossary: resolvePromptGlossary(state.options),
            }));
        } catch (err) {
            const name = String(err?.name || '');
            const msg = String(err?.message || err || '');
            const lower = msg.toLowerCase();
            const aborted = name === 'AbortError'
                || err?.code === 'cancelled'
                || err?.code === 'aborted'
                || lower.includes('operation was aborted')
                || lower.includes('user aborted');
            if (aborted) {
                sendJson(res, 499, { error: '已取消', code: 'cancelled' });
            } else {
                sendJson(res, 500, { error: msg || 'translate failed' });
            }
        } finally {
            state.busy = false;
        }
    });

    const listenPort = asNumber(session.port, { min: 0, max: 65535, fallback: 0 });

    return new Promise((resolve) => {
        const onError = (err) => {
            resolve({ ok: false, error: err.message || String(err) });
        };
        server.once('error', onError);
        server.listen(listenPort, '127.0.0.1', () => {
            server.removeListener('error', onError);
            const addr = server.address();
            const port = addr && typeof addr === 'object' ? addr.port : 0;
            const url = `http://127.0.0.1:${port}${PATH_TRANSLATE}`;
            resolve({
                ok: true,
                url,
                port,
                token,
                mode,
                /**
                 * Job fields for Engine `mtExternal`.
                 * @param {{ timeoutSec?: number, batchSize?: number }} [extra]
                 */
                mtExternal(extra = {}) {
                    const smartDefault = mode === 'smart'
                        ? DEFAULT_SMART_BATCH_SIZE
                        : DEFAULT_BATCH_SIZE;
                    return {
                        url,
                        timeoutSec: asNumber(extra.timeoutSec, {
                            min: 30,
                            max: 3600,
                            fallback: DEFAULT_TIMEOUT_SEC,
                        }),
                        batchSize: asNumber(extra.batchSize, {
                            min: 1,
                            max: 128,
                            fallback: smartDefault,
                        }),
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    };
                },
                stop() {
                    if (state.closed) return;
                    state.closed = true;
                    try {
                        server.close();
                    } catch { /* ignore */ }
                },
            });
        });
    });
}

module.exports = {
    PATH_TRANSLATE,
    DEFAULT_BATCH_SIZE,
    DEFAULT_SMART_BATCH_SIZE,
    DEFAULT_SMART_WINDOW_CUES,
    DEFAULT_SMART_OVERLAP_CUES,
    DEFAULT_TIMEOUT_SEC,
    parseEngineMtRequest,
    buildEngineMtResponse,
    resolvePromptGlossary,
    translateExternalBatch,
    startEngineMtAdapter,
};
