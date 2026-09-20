/**
 * Transub Engine options (default backend).
 *
 * `engineBackend=twai` / TransWithAI is FEATURE FROZEN (compat only; target remove in 4.x).
 * Do not add new TWAI-only options here.
 */

const path = require('path');
const { getBundledEnginePathIfPresent } = require('./app-paths');
const { canonicalizeEngineAsrModelId } = require('./engine-asr-aliases');

const DEFAULT_ENGINE_BACKEND = 'transub';
const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8765';
/**
 * Empty = use vendored `transub-engine/` next to the app (resolved at runtime).
 * Do not persist a machine-specific absolute default.
 */
const DEFAULT_ENGINE_INSTALL_PATH = '';
/** Empty = Hugging Face Hub; set hf-mirror.com when CN networks need a mirror. */
const DEFAULT_ENGINE_HF_ENDPOINT = '';
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
        engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
        engineMtModel: '',
        engineOpusMtModel: '',
        engineLlmMtModel: '',
        engineVadModel: 'silero-vad',
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
    merged.engineAsrModel = canonicalizeEngineAsrModelId(
        merged.engineAsrModel,
        'qwen3-asr-1.7b-ja-anime-galgame',
    );
    merged.engineMtModel = String(merged.engineMtModel || '').trim();
    // Opus-MT removed — keep field empty for backward-compat persistence only
    merged.engineOpusMtModel = '';
    // Empty LLM id =「智能选择」; omitted field stays empty (smart pick).
    if (Object.prototype.hasOwnProperty.call(input, 'engineLlmMtModel')) {
        merged.engineLlmMtModel = String(input.engineLlmMtModel || '').trim();
    } else {
        merged.engineLlmMtModel = String(merged.engineLlmMtModel || '').trim();
    }
    if (/^transub-ja/i.test(merged.engineLlmMtModel)) {
        merged.engineLlmMtModel = 'sakura-1.5b';
    }
    if (/^transub-ja/i.test(merged.engineMtModel)) {
        merged.engineMtModel = '';
        if (!merged.engineLlmMtModel) merged.engineLlmMtModel = 'sakura-1.5b';
    }
    // Migrate legacy single MT field into LLM slot when it looks like Sakura/LLM (never Opus)
    if (merged.engineMtModel) {
        const id = merged.engineMtModel;
        const looksOpus = /^opus[-_]?mt/i.test(id) || id.includes('opus-mt-');
        if (looksOpus) {
            merged.engineMtModel = '';
        } else {
            const looksSakura = /^sakura-/i.test(id);
            if (looksSakura && (input.engineLlmMtModel === undefined || input.engineLlmMtModel === null)) {
                merged.engineLlmMtModel = id;
            }
            if (!looksSakura && (input.engineLlmMtModel === undefined || input.engineLlmMtModel === null)
                && !merged.engineLlmMtModel) {
                merged.engineLlmMtModel = id;
            }
        }
    }
    merged.engineVadModel = normalizeVadModelId(merged.engineVadModel, 'silero-vad');
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
