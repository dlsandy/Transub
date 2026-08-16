/**
 * Transub Engine options (default backend).
 *
 * `engineBackend=twai` / TransWithAI is FEATURE FROZEN (compat only; target remove in 4.x).
 * Do not add new TWAI-only options here.
 */

const path = require('path');
const { getBundledEnginePathIfPresent } = require('./app-paths');

const DEFAULT_ENGINE_BACKEND = 'transub';
const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8765';
/**
 * Empty = use vendored `transub-engine/` next to the app (resolved at runtime).
 * Do not persist a machine-specific absolute default.
 */
const DEFAULT_ENGINE_INSTALL_PATH = '';
/** Domestic HF mirror — official hub often times out in CN networks. */
const DEFAULT_ENGINE_HF_ENDPOINT = 'https://hf-mirror.com';
const EXPECTED_API_MAJOR = 1;

/**
 * Resolve the effective engine install directory.
 * Empty configured path → vendored `transub-engine/` next to Transub when present.
 * Non-empty → use as given (so bad custom paths still surface clear errors).
 */
function resolveEngineInstallPath(configured = '') {
    const raw = String(configured || '').trim();
    if (raw) return path.resolve(raw);
    return getBundledEnginePathIfPresent() || '';
}

function normalizeEngineBackend(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'twai' || v === 'transwithai') return 'twai';
    return 'transub';
}

/**
 * Canonical VAD catalog id. Legacy preset/API alias `silero` → `silero-vad`
 * (faster-whisper built-in; always "installed", never a separate Hub download).
 */
function normalizeVadModelId(value, fallback = 'fsmn-vad') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const lower = raw.toLowerCase();
    if (lower === 'silero' || lower === 'silero_vad') return 'silero-vad';
    if (lower === 'firered' || lower === 'firered_vad' || lower === 'fire-red' || lower === 'fireredvad') {
        return 'firered-vad';
    }
    return raw;
}

function mergeEngineOptions(input = {}) {
    const merged = {
        engineBackend: DEFAULT_ENGINE_BACKEND,
        engineInstallPath: DEFAULT_ENGINE_INSTALL_PATH,
        engineUrl: DEFAULT_ENGINE_URL,
        engineHfEndpoint: DEFAULT_ENGINE_HF_ENDPOINT,
        engineHfToken: '',
        engineProfile: 'balanced',
        engineAsrModel: 'sensevoice-small',
        engineMtModel: '',
        engineOpusMtModel: '',
        engineLlmMtModel: 'sakura-1.5b',
        engineVadModel: 'fsmn-vad',
        engineAutoStart: true,
        ...input,
    };
    merged.engineBackend = normalizeEngineBackend(merged.engineBackend);
    // Allow empty path so first-run / unset state stays visible in settings.
    merged.engineInstallPath = String(merged.engineInstallPath || '').trim();
    merged.engineUrl = String(merged.engineUrl || DEFAULT_ENGINE_URL).trim().replace(/\/+$/, '');
    // Keep explicit empty string (direct hub); only fill default when field is absent/undefined/null.
    if (input.engineHfEndpoint === undefined || input.engineHfEndpoint === null) {
        merged.engineHfEndpoint = DEFAULT_ENGINE_HF_ENDPOINT;
    } else {
        merged.engineHfEndpoint = String(input.engineHfEndpoint || '').trim().replace(/\/+$/, '');
    }
    merged.engineHfToken = String(
        Object.prototype.hasOwnProperty.call(input, 'engineHfToken')
            ? input.engineHfToken
            : (merged.engineHfToken || ''),
    ).trim();
    merged.engineProfile = String(merged.engineProfile || 'balanced').trim() || 'balanced';
    merged.engineAsrModel = String(merged.engineAsrModel || 'sensevoice-small').trim();
    merged.engineMtModel = String(merged.engineMtModel || '').trim();
    merged.engineOpusMtModel = String(
        merged.engineOpusMtModel != null ? merged.engineOpusMtModel : '',
    ).trim();
    // Empty LLM id =「智能选择」; only default when the field was omitted.
    if (Object.prototype.hasOwnProperty.call(input, 'engineLlmMtModel')) {
        merged.engineLlmMtModel = String(input.engineLlmMtModel || '').trim();
    } else {
        merged.engineLlmMtModel = String(merged.engineLlmMtModel || 'sakura-1.5b').trim() || 'sakura-1.5b';
    }
    // Migrate legacy single MT field into the matching slot when split fields are absent
    if (merged.engineMtModel) {
        const id = merged.engineMtModel;
        const looksSakura = /^sakura-/i.test(id);
        if (looksSakura && (input.engineLlmMtModel === undefined || input.engineLlmMtModel === null)) {
            merged.engineLlmMtModel = id;
        }
        if (!looksSakura && (input.engineOpusMtModel === undefined || input.engineOpusMtModel === null)) {
            merged.engineOpusMtModel = id;
        }
    }
    merged.engineVadModel = normalizeVadModelId(merged.engineVadModel, 'fsmn-vad');
    merged.engineAutoStart = merged.engineAutoStart !== false;
    return merged;
}

/**
 * Whether the job should use Engine `mtBackend: "external"` (desktop LLM adapter).
 * Smart translate / Sakura keep `translate_mt` / `dual`; Engine POSTs cues to our adapter.
 */
function usesExternalMt({ smartTranslate = false, sakuraMt = false } = {}) {
    return !!(smartTranslate || sakuraMt);
}

function mapTaskToEngineTask(task, _externalHints = {}) {
    const t = String(task || '').trim();
    // smartTranslate / sakuraMt keep translate_mt|dual via mtBackend=external (see usesExternalMt).
    if (t === 'translate') return 'translate_mt';
    if (t === 'dual') return 'dual';
    return 'transcribe';
}

function parseApiMajor(apiVersion) {
    const m = String(apiVersion || '').trim().match(/^(\d+)/);
    return m ? Number(m[1]) : NaN;
}

function isApiCompatible(apiVersion, expectedMajor = EXPECTED_API_MAJOR) {
    const major = parseApiMajor(apiVersion);
    return Number.isFinite(major) && major === expectedMajor;
}

module.exports = {
    DEFAULT_ENGINE_BACKEND,
    DEFAULT_ENGINE_URL,
    DEFAULT_ENGINE_INSTALL_PATH,
    DEFAULT_ENGINE_HF_ENDPOINT,
    EXPECTED_API_MAJOR,
    normalizeEngineBackend,
    normalizeVadModelId,
    mergeEngineOptions,
    resolveEngineInstallPath,
    usesExternalMt,
    mapTaskToEngineTask,
    parseApiMajor,
    isApiCompatible,
};
