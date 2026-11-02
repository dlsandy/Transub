/**
 * Laya System One decision helpers (open weights; Jev-compatible /v1/systemone).
 * Prefer local Laya / laya-mlx; optional Laya Studio cloud. Not TypeSafe Jev.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJevDecision = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jevDecisionCoreFactory() {
    /** Multilingual checkpoint — JA/ZH subtitle triage. */
    const DEFAULT_MODEL = 'convaiinnovations/laya-multilingual';
    /**
     * Dedicated loopback port (avoid 8000 / Engine 8765 / llama 39281 / Sakura 39282).
     * Keep in sync with electron/jev-port-guard.js and llama port reclaim (+0/+1 only).
     */
    const DEFAULT_LOCAL_PORT = 39283;
    /** Local Laya / System One (no cloud key). */
    const ENDPOINT_LOCAL = `http://127.0.0.1:${DEFAULT_LOCAL_PORT}/v1/systemone`;
    /** Laya Studio hosted API (optional; needs lsk_live_ key). */
    const ENDPOINT_LAYA_STUDIO = 'https://api.laya.studio/v1/systemone';
    /** @deprecated Closed TypeSafe Jev */
    const ENDPOINT_TYPESAFE = 'https://api.typesafe.ai/v1/systemone';
    /** @deprecated */
    const ENDPOINT_HOSTED = 'https://jevtypesafeai.com/api/v1/decide';
    const DEFAULT_MIN_CONFIDENCE = 0.55;
    /**
     * OpenDecider Score requires ordered `criteria` labels (not min/max).
     * Map index / expected → unit interval with normalizeScoreToUnit.
     */
    /**
     * Ordered Score labels for OpenDecider. Keep 4–6 levels: nano max-prob
     * drops with more bins, but `expected` still ranks well.
     */
    const DEFAULT_SCORE_CRITERIA = Object.freeze(['skip', 'low', 'mid', 'high', 'must']);
    /** Laya Studio / System One common hard cap per request. */
    const MAX_SYSTEMONE_QUESTIONS = 32;
    const JEV_DECISION_MODES = Object.freeze(['auto', 'off']);

    /** Legacy OpenDecider/docs default — rewrite to Transub-reserved port. */
    function rewriteLegacyLocalPort(url) {
        const s = String(url || '').trim();
        if (!s) return s;
        try {
            const u = new URL(s);
            const host = u.hostname;
            const isLoop = host === '127.0.0.1' || host === 'localhost' || host === '::1';
            const port = Number(u.port) || (/^https:$/i.test(u.protocol) ? 443 : 80);
            // Common conflicting defaults from third-party serve docs
            if (isLoop && (port === 8000 || port === 8080)) {
                u.host = `127.0.0.1:${DEFAULT_LOCAL_PORT}`;
                return u.toString().replace(/\/+$/, '');
            }
        } catch { /* keep */ }
        return s;
    }

    function normalizeJevDecisionMode(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'disabled') return 'off';
        return 'auto';
    }

    function clampJevMinConfidence(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return DEFAULT_MIN_CONFIDENCE;
        // Allow 0.48 so local nano (~0.50–0.55 binary peaks) can be opted in.
        return Math.max(0.48, Math.min(0.99, Math.round(n * 100) / 100));
    }

    /**
     * @param {*} pref local | laya | studio | typesafe | hosted | custom URL
     */
    function resolveJevEndpoint(pref) {
        const s = String(pref == null ? 'local' : pref).trim();
        const lower = s.toLowerCase();
        if (!lower
            || lower === 'local'
            || lower === 'laya'
            || lower === 'open'
            || lower === 'default'
            || lower === 'opendecider'
            || lower === 'von') {
            return ENDPOINT_LOCAL;
        }
        if (lower === 'studio' || lower === 'laya.studio' || lower === 'cloud') {
            return ENDPOINT_LAYA_STUDIO;
        }
        if (lower === 'typesafe' || lower === 'official' || lower === 'jev') {
            return ENDPOINT_TYPESAFE;
        }
        if (lower === 'hosted' || lower === 'jevtypesafeai' || lower === 'mirror') {
            return ENDPOINT_HOSTED;
        }
        if (/^https?:\/\//i.test(s)) {
            let url = rewriteLegacyLocalPort(s.replace(/\/+$/, ''));
            if (!/\/v1\/(systemone|decide)\b/i.test(url)) {
                url = `${url}/v1/systemone`;
            }
            return url;
        }
        return ENDPOINT_LOCAL;
    }

    function normalizeJevEndpointPref(value) {
        const s = String(value == null ? 'local' : value).trim();
        const lower = s.toLowerCase();
        if (lower === 'studio' || lower === 'laya.studio' || lower === 'cloud') return 'studio';
        if (lower === 'typesafe' || lower === 'official' || lower === 'jev') return 'typesafe';
        if (lower === 'hosted' || lower === 'jevtypesafeai' || lower === 'mirror') return 'hosted';
        if (/^https?:\/\//i.test(s)) {
            return rewriteLegacyLocalPort(s.replace(/\/+$/, ''));
        }
        return 'local';
    }

    function isLocalSystemOneEndpoint(endpoint) {
        const url = String(endpoint || '').trim().toLowerCase();
        if (!url) return true;
        try {
            const u = new URL(url.includes('://') ? url : `http://${url}`);
            const host = u.hostname;
            return host === '127.0.0.1' || host === 'localhost' || host === '::1';
        } catch {
            return /127\.0\.0\.1|localhost/i.test(url);
        }
    }

    /** Cloud endpoints that require an API key. */
    function requiresApiKey(endpoint) {
        const url = String(endpoint || '').toLowerCase();
        if (isLocalSystemOneEndpoint(url)) return false;
        return /api\.laya\.studio|typesafe\.ai|jevtypesafeai\.com/i.test(url);
    }

    function isJevDecisionEnabled(options = {}) {
        return normalizeJevDecisionMode(options.jevDecisionMode ?? options.jevDecision) === 'auto';
    }

    function isConfidentChoice(answer, minConfidence = DEFAULT_MIN_CONFIDENCE) {
        if (!answer || typeof answer !== 'object') return false;
        const choice = String(answer.choice || '').trim();
        if (!choice) return false;
        const conf = Number(answer.confidence);
        const floor = clampJevMinConfidence(minConfidence);
        const probs = answer.probabilities && typeof answer.probabilities === 'object'
            ? answer.probabilities
            : null;
        if (Number.isFinite(conf) && conf >= floor) return true;
        if (probs && Number.isFinite(Number(probs[choice])) && Number(probs[choice]) >= floor) {
            return true;
        }
        // Soft nano binary: clear lean below user floor, reject coin-flips (~0.50).
        if (probs) {
            const keys = Object.keys(probs);
            if (keys.length === 2) {
                const top = Number(probs[choice]);
                const otherKey = keys.find((k) => k !== choice);
                const other = Number(probs[otherKey]);
                if (Number.isFinite(top) && Number.isFinite(other)
                    && top >= 0.53 && (top - other) >= 0.06) {
                    return true;
                }
            }
        }
        return false;
    }

    function parseSystemOneResponse(body) {
        if (!body || typeof body !== 'object') {
            return { ok: false, error: 'empty_response' };
        }
        if (body.error) {
            const msg = typeof body.error === 'string'
                ? body.error
                : (body.error.message || body.message || 'systemone_error');
            return { ok: false, error: String(msg) };
        }
        const answers = body.answers && typeof body.answers === 'object' ? body.answers : null;
        if (!answers) return { ok: false, error: 'missing_answers' };
        return {
            ok: true,
            model: body.model ? String(body.model) : undefined,
            answers,
            usage: body.usage && typeof body.usage === 'object' ? body.usage : undefined,
        };
    }

    function buildSystemOneRequest({ model, state, questions, includeModel = true } = {}) {
        const q = questions && typeof questions === 'object' ? questions : {};
        const out = { state: state == null ? '' : state, questions: q };
        if (includeModel) {
            out.model = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
        }
        return out;
    }

    /**
     * @param {{ instructions: string, criteria: Record<string, string> }} opts
     */
    function buildChoiceQuestion({ instructions, criteria } = {}) {
        const crit = criteria && typeof criteria === 'object' ? { ...criteria } : {};
        return {
            type: 'choice',
            instructions: String(instructions || '').trim(),
            criteria: crit,
        };
    }

    /**
     * OpenDecider-compatible Score question.
     * Always sends ordered `criteria` (Hub rejects min/max-only payloads with HTTP 500).
     * @param {{ instructions: string, min?: number, max?: number, criteria?: string[] }} opts
     */
    function buildScoreQuestion({ instructions, min = 0, max = 1, criteria } = {}) {
        const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
        const hi = Number.isFinite(Number(max)) ? Number(max) : 1;
        const levels = Array.isArray(criteria) && criteria.length >= 2
            ? criteria.map((c) => String(c ?? '').trim()).filter(Boolean)
            : DEFAULT_SCORE_CRITERIA.slice();
        if (levels.length < 2) {
            levels.push(...DEFAULT_SCORE_CRITERIA.slice(0, 2));
        }
        return {
            type: 'score',
            instructions: String(instructions || '').trim(),
            criteria: levels,
            // Kept for Transub-side docs / older readers; OpenDecider ignores these.
            min: Math.min(lo, hi),
            max: Math.max(lo, hi),
        };
    }

    /** @param {{ instructions: string }} opts */
    function buildNoulQuestion({ instructions } = {}) {
        return {
            type: 'noul',
            instructions: String(instructions || '').trim(),
        };
    }

    function answerConfidence(answer) {
        if (!answer || typeof answer !== 'object') return NaN;
        const conf = Number(answer.confidence);
        if (Number.isFinite(conf)) return conf;
        const choice = String(answer.choice || '').trim();
        const probs = answer.probabilities && typeof answer.probabilities === 'object'
            ? answer.probabilities
            : null;
        if (choice && probs && Number.isFinite(Number(probs[choice]))) {
            return Number(probs[choice]);
        }
        return NaN;
    }

    function scoreLevelCount(answer) {
        const probs = answer?.probabilities && typeof answer.probabilities === 'object'
            ? answer.probabilities
            : null;
        if (probs) {
            const n = Object.keys(probs).length;
            if (n >= 2) return n;
        }
        const crit = answer?.criteria;
        if (Array.isArray(crit) && crit.length >= 2) return crit.length;
        return DEFAULT_SCORE_CRITERIA.length;
    }

    /**
     * Map OpenDecider score index / expected onto [0, 1].
     * Prefer calibrated `expected` when present.
     */
    function normalizeScoreToUnit(answer) {
        if (!answer || typeof answer !== 'object') return NaN;
        const levels = Math.max(2, scoreLevelCount(answer));
        const denom = levels - 1;
        const expected = Number(answer.expected);
        if (Number.isFinite(expected)) {
            return Math.max(0, Math.min(1, expected / denom));
        }
        const raw = Number(answer.score ?? answer.value);
        if (!Number.isFinite(raw)) return NaN;
        // Legacy continuous hosts may already emit unit scores without probabilities.
        if (!answer.probabilities && raw >= 0 && raw <= 1) return raw;
        return Math.max(0, Math.min(1, raw / denom));
    }

    function isConfidentScore(answer, minConfidence = DEFAULT_MIN_CONFIDENCE) {
        if (!answer || typeof answer !== 'object') return false;
        if (String(answer.type || 'score').toLowerCase() !== 'score') return false;
        const unit = normalizeScoreToUnit(answer);
        if (!Number.isFinite(unit)) return false;
        const conf = answerConfidence(answer);
        const floor = clampJevMinConfidence(minConfidence);
        // Ranking uses calibrated `expected`; nano max-prob falls as criteria grow — never drop it.
        if (Number.isFinite(Number(answer.expected))) return true;
        // Some hosts omit confidence on score; treat numeric score as usable when present.
        if (!Number.isFinite(conf)) return true;
        // Discrete argmax conf is often ~0.28–0.40 on nano.
        return conf >= Math.min(floor, 0.28);
    }

    function pickConfidentChoices(answers, questionIds, minConfidence) {
        const out = new Map();
        const ans = answers && typeof answers === 'object' ? answers : {};
        for (const id of questionIds || []) {
            const key = String(id || '').trim();
            if (!key) continue;
            const a = ans[key];
            if (!a || String(a.type || 'choice').toLowerCase() !== 'choice') continue;
            if (!isConfidentChoice(a, minConfidence)) continue;
            out.set(key, String(a.choice).trim());
        }
        return out;
    }

    function pickConfidentScores(answers, questionIds, minConfidence) {
        const out = new Map();
        const ans = answers && typeof answers === 'object' ? answers : {};
        for (const id of questionIds || []) {
            const key = String(id || '').trim();
            if (!key) continue;
            const a = ans[key];
            if (!isConfidentScore(a, minConfidence)) continue;
            out.set(key, normalizeScoreToUnit(a));
        }
        return out;
    }

    /**
     * Partition items by confident Choice answers.
     * @param {object} answers
     * @param {Array<{ id?: string, questionId?: string }|string>} items
     * @param {{ minConfidence?: number, acceptChoices?: string[], rejectChoices?: string[], idOf?: Function }} [opts]
     * @returns {{ accept: any[], reject: any[], undecided: any[], decided: number }}
     */
    function partitionBinaryChoices(answers, items, opts = {}) {
        const list = Array.isArray(items) ? items : [];
        const acceptSet = new Set(
            (Array.isArray(opts.acceptChoices) ? opts.acceptChoices : ['accept', 'yes', 'keep', 'primary'])
                .map((s) => String(s).trim().toLowerCase())
                .filter(Boolean),
        );
        const rejectSet = new Set(
            (Array.isArray(opts.rejectChoices) ? opts.rejectChoices : ['reject', 'revert', 'no', 'opinion', 'drop'])
                .map((s) => String(s).trim().toLowerCase())
                .filter(Boolean),
        );
        const idOf = typeof opts.idOf === 'function'
            ? opts.idOf
            : (item, i) => {
                if (typeof item === 'string' || typeof item === 'number') return String(item);
                return String(item?.id ?? item?.questionId ?? `q${i}`);
            };
        const picked = pickConfidentChoices(
            answers,
            list.map((item, i) => idOf(item, i)),
            opts.minConfidence,
        );
        const accept = [];
        const reject = [];
        const undecided = [];
        let decided = 0;
        list.forEach((item, i) => {
            const id = idOf(item, i);
            const choice = picked.get(id);
            if (!choice) {
                undecided.push(item);
                return;
            }
            const low = choice.toLowerCase();
            if (acceptSet.has(low)) {
                accept.push(item);
                decided += 1;
                return;
            }
            if (rejectSet.has(low)) {
                reject.push(item);
                decided += 1;
                return;
            }
            undecided.push(item);
        });
        return { accept, reject, undecided, decided };
    }

    /** Clip long cue text for System One state/instructions. */
    function clipForDecision(text, max = 280) {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        if (s.length <= max) return s;
        return `${s.slice(0, Math.max(0, max - 1))}…`;
    }

    /**
     * Split pairs so each System One call stays within question cap.
     * @template T
     * @param {T[]} pairs
     * @param {number} [max]
     * @returns {T[][]}
     */
    function chunkPairsForSystemOne(pairs, max = MAX_SYSTEMONE_QUESTIONS) {
        const list = Array.isArray(pairs) ? pairs : [];
        const size = Math.max(1, Math.min(MAX_SYSTEMONE_QUESTIONS, Number(max) || MAX_SYSTEMONE_QUESTIONS));
        const out = [];
        for (let i = 0; i < list.length; i += size) {
            out.push(list.slice(i, i + size));
        }
        return out;
    }

    /** Human-readable resolved URL for settings (local → full loopback). */
    function formatResolvedEndpointLabel(pref) {
        return resolveJevEndpoint(pref || 'local');
    }

    /**
     * Soft-skip Laya when speed profile (same spirit as SO / semantic skip).
     * @param {object} options
     */
    function shouldSkipJevForPerfProfile(options = {}) {
        const p = String(options.perfProfile || options.engineProfile || '').trim().toLowerCase();
        return p === 'speed';
    }

    return {
        DEFAULT_MODEL,
        DEFAULT_LOCAL_PORT,
        ENDPOINT_LOCAL,
        ENDPOINT_LAYA_STUDIO,
        ENDPOINT_TYPESAFE,
        ENDPOINT_HOSTED,
        DEFAULT_MIN_CONFIDENCE,
        DEFAULT_SCORE_CRITERIA,
        MAX_SYSTEMONE_QUESTIONS,
        JEV_DECISION_MODES,
        normalizeJevDecisionMode,
        clampJevMinConfidence,
        resolveJevEndpoint,
        normalizeJevEndpointPref,
        rewriteLegacyLocalPort,
        isLocalSystemOneEndpoint,
        requiresApiKey,
        isJevDecisionEnabled,
        isConfidentChoice,
        isConfidentScore,
        answerConfidence,
        normalizeScoreToUnit,
        parseSystemOneResponse,
        buildSystemOneRequest,
        buildChoiceQuestion,
        buildScoreQuestion,
        buildNoulQuestion,
        pickConfidentChoices,
        pickConfidentScores,
        partitionBinaryChoices,
        clipForDecision,
        chunkPairsForSystemOne,
        formatResolvedEndpointLabel,
        shouldSkipJevForPerfProfile,
    };
}));
