const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const scenePresetsCore = require('../src/js/scene-presets-core');

const PRESETS_FILE_NAME = 'transub-presets.json';

/**
 * Built-in parameter presets cover ASR / VAD / device / post-batch only.
 * Do not set task, translateMode, engineMtModel, engineLlmMtModel,
 * glossaryMtEnabled, or sakuraNsfwPrompt — those stay on the task/MT controls.
 *
 * ASR preset groups (stable keys):
 * ja / ko / western / zh / talk / other
 */
const PRESET_SKIP_KEYS = Object.freeze([
    'task',
    'translateMode',
    'engineMtModel',
    'engineLlmMtModel',
    'glossaryMtEnabled',
    'sakuraNsfwPrompt',
]);

/** Display order for settings optgroups and main-window preset tabs. */
const PRESET_GROUP_ORDER = scenePresetsCore.GROUP_ORDER;
const PRESET_GROUP_LABELS = scenePresetsCore.GROUP_LABELS;
const normalizePresetGroup = scenePresetsCore.normalizeGroupKey;

function sanitizePresetOptions(options) {
    const out = options && typeof options === 'object' ? { ...options } : {};
    for (const key of PRESET_SKIP_KEYS) delete out[key];
    return out;
}

/** Shared film VAD numbers (music-island friendly). */
const FILM_VAD = Object.freeze({
    engineVadModel: 'silero-vad',
    vadEnabled: true,
    vadSensitive: false,
    vadAggressive: false,
    vadThreshold: 0.55,
    vadMinSpeechDurationMs: 350,
    vadMinSilenceDurationMs: 280,
    vadSpeechPadMs: 200,
    vadMaxSingleSegmentMs: 18000,
    hallucinationSilenceThreshold: 2,
});

/** Soft / anime dialogue timeline: Silero catalog VAD + TEN short frames. */
const ANIME_VAD = Object.freeze({
    engineVadModel: 'silero-vad',
    vadEnabled: true,
    vadSensitive: false,
    vadAggressive: false,
    vadThreshold: 0.45,
    vadMinSpeechDurationMs: 180,
    vadMinSilenceDurationMs: 500,
    vadSpeechPadMs: 80,
    vadMaxSingleSegmentMs: 5000,
    hallucinationSilenceThreshold: 0,
    timingAlign: true,
    timingAlignModel: 'ten',
    beamSize: 1,
    audioLightDenoise: false,
    filmAudioEnhance: false,
    filmVadPreset: false,
    postBatchViewingPunctMode: 'clear',
    postBatchInterjectionMode: 'clear',
    postBatchOnomatopoeiaMode: 'clear',
    postBatchCompactPureInterjections: true,
    postBatchSimplifyViewingPunctuation: true,
});

/**
 * Soft AV FireRed timing v3 (after MIKR-116 v1/v2):
 * v1 (0.38/7s) spoken~69%, ASR 2594 cues, heavy cleanup.
 * v2 (0.42/6s) spoken~67%, ASR still 2594 — threshold nudge barely moved ASR.
 * v3: keep FireRed detector, mirror TEN island geometry (proven ~728 ZH):
 * threshold 0.45, max 5s, pad 80, minSilence 500, minSpeech 220
 * (minSpeech slightly above TEN 180 to cut FireRed "short segment" junk).
 */
const ANIME_FIRERED_VAD = Object.freeze({
    ...ANIME_VAD,
    engineVadModel: 'firered-vad',
    timingAlignModel: 'firered',
    vadThreshold: 0.45,
    vadMinSpeechDurationMs: 220,
    vadMinSilenceDurationMs: 500,
    vadSpeechPadMs: 80,
    vadMaxSingleSegmentMs: 5000,
});

const ANIME_WHISPER_FIRERED_OPTIONS = Object.freeze({
    device: 'cuda',
    language: 'ja',
    engineAsrModel: 'anime-whisper',
    contentProfile: 'av_soft',
    ...ANIME_FIRERED_VAD,
});

/** Soft-AV Qwen3 Galgame + TEN island timing (recommended Qwen pairing). */
const QWEN_GALGAME_TEN_OPTIONS = Object.freeze({
    device: 'cuda',
    language: 'ja',
    engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
    contentProfile: 'av_soft',
    ...ANIME_VAD,
});

function regionalFilmOptions(language, extra = {}) {
    return {
        device: 'cuda',
        language,
        contentProfile: 'film',
        engineAsrModel: 'sensevoice-small',
        filmAudioEnhance: false,
        filmVadPreset: false,
        audioLightDenoise: true,
        ...FILM_VAD,
        ...extra,
    };
}

/**
 * Built-in presets: each content group lists flat presets (no primary/variant split).
 * Keep stable ids — UI selection / tips / sense may key off them.
 */
const BUILTIN_PRESETS = [
    // ── 日剧/动漫（含原软声 + 动漫）──────────────────────────
    {
        id: 'ja-av-anime-whisper-firered',
        group: 'ja',
        name: 'Anime Whisper（日剧/动漫/软对白）',
        description: '日语微调，质量和速度均衡',
        builtin: true,
        options: { ...ANIME_WHISPER_FIRERED_OPTIONS },
    },
    {
        id: 'ja-av-qwen3-galgame-ten',
        group: 'ja',
        name: 'Qwen3-ASR Galgame (软对白/动漫专调)',
        description:
            '1.7B, 日语微调，较高质量，优于Anime Whisper',
        builtin: true,
        options: { ...QWEN_GALGAME_TEN_OPTIONS },
    },
    {
        id: 'ja-av-soft-translate',
        group: 'ja',
        name: 'Whisper JA (日语微调)',
        description: '1.5B, 日语微调，速度较快',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            contentProfile: 'av_soft',
            ...ANIME_VAD,
            beamSize: 5,
        },
    },

    // ── 韩剧 ──────────────────────────────────────────────
    {
        id: 'ko-sensevoice',
        group: 'ko',
        name: 'SenseVoice Small（韩剧）',
        description: '多语种快听，影视 VAD + 轻度降噪',
        builtin: true,
        options: regionalFilmOptions('ko'),
    },
    {
        id: 'ko-turbo-demucs',
        group: 'ko',
        name: 'Whisper large-v3-turbo + Demucs（韩剧配乐）',
        description: '先分离人声再听写，需 Pro',
        builtin: true,
        options: regionalFilmOptions('ko', {
            filmAudioEnhance: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },
    {
        id: 'ko-vad-only',
        group: 'ko',
        name: 'Whisper large-v3-turbo（韩剧干净音轨）',
        description: '仅影视 VAD，不做 Demucs',
        builtin: true,
        options: regionalFilmOptions('ko', {
            filmVadPreset: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },

    // ── 欧美剧（承接原影视 Demucs / Turbo）────────────────
    {
        id: 'film-audio-enhance',
        group: 'western',
        name: 'Whisper large-v3-turbo + Demucs（欧美剧配乐）',
        description: '先分离人声再听写，需 Pro',
        builtin: true,
        options: regionalFilmOptions('en', {
            filmAudioEnhance: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },
    {
        id: 'film-vad-only',
        group: 'western',
        name: 'Whisper large-v3-turbo（欧美剧干净音轨）',
        description: '仅影视 VAD，不做 Demucs',
        builtin: true,
        options: regionalFilmOptions('en', {
            filmVadPreset: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },
    {
        id: 'film-sensevoice',
        group: 'western',
        name: 'SenseVoice Small（欧美剧）',
        description: '多语种快听，影视 VAD + 轻度降噪',
        builtin: true,
        options: regionalFilmOptions('en'),
    },
    {
        id: 'film-turbo-stable',
        group: 'western',
        name: 'Whisper large-v3-turbo（欧美剧均衡）',
        description: 'VAD + 轻度降噪，质量与速度折中',
        builtin: true,
        options: regionalFilmOptions('en', {
            engineAsrModel: 'whisper-large-v3-turbo',
            beamSize: 5,
        }),
    },

    // ── 华语片 ────────────────────────────────────────────
    {
        id: 'zh-sensevoice',
        group: 'zh',
        name: 'SenseVoice Small（华语片）',
        description: '多语种快听，影视 VAD + 轻度降噪',
        builtin: true,
        options: regionalFilmOptions('zh'),
    },
    {
        id: 'zh-turbo-demucs',
        group: 'zh',
        name: 'Whisper large-v3-turbo + Demucs（华语片配乐）',
        description: '先分离人声再听写，需 Pro',
        builtin: true,
        options: regionalFilmOptions('zh', {
            filmAudioEnhance: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },
    {
        id: 'zh-vad-only',
        group: 'zh',
        name: 'Whisper large-v3-turbo（华语片干净音轨）',
        description: '仅影视 VAD，不做 Demucs',
        builtin: true,
        options: regionalFilmOptions('zh', {
            filmVadPreset: true,
            audioLightDenoise: false,
            engineAsrModel: 'whisper-large-v3-turbo',
        }),
    },

    // ── 对白 ──────────────────────────────────────────────
    {
        id: 'translate-quality',
        group: 'talk',
        name: 'SenseVoice Small（清晰对白）',
        description: '通用起点，开启 VAD',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            contentProfile: 'talk',
            logLevel: 'DEBUG',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'dialogue-sensevoice',
        group: 'talk',
        name: 'SenseVoice Small（对白+轻度降噪）',
        description: '多语种快听，VAD + 轻度降噪',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            contentProfile: 'talk',
            engineVadModel: 'silero-vad',
            vadEnabled: true,
            vadSensitive: false,
            vadAggressive: false,
            audioLightDenoise: true,
            filmAudioEnhance: false,
            filmVadPreset: false,
        },
    },
    {
        id: 'translate-low-vram',
        group: 'talk',
        name: 'SenseVoice Small（低显存）',
        description: '优先能跑完，质量略让位',
        builtin: true,
        options: {
            device: 'cuda_low_vram',
            engineAsrModel: 'sensevoice-small',
            contentProfile: 'talk',
            logLevel: 'INFO',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'transcribe-only',
        group: 'talk',
        name: 'Whisper JA 1.5B（日语对白）',
        description: '1.5B，日语基础听写，开启 VAD',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'whisper-ja-1.5b',
            contentProfile: 'talk',
            logLevel: 'DEBUG',
            language: 'ja',
            vadEnabled: true,
        },
    },
    {
        id: 'translate-strict-split',
        group: 'talk',
        name: 'Whisper JA 1.5B（严格切分）',
        description: '提高 VAD 门槛，切段更干净',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            contentProfile: 'talk',
            logLevel: 'DEBUG',
            beamSize: 5,
            vadEnabled: true,
            vadThreshold: 0.55,
            vadMinSpeechDurationMs: 300,
            vadMinSilenceDurationMs: 150,
            vadSpeechPadMs: 200,
            vadMaxSingleSegmentMs: 20000,
            vadSensitive: false,
            vadAggressive: false,
            audioLightDenoise: true,
            hallucinationSilenceThreshold: 2,
        },
    },
    {
        id: 'translate-anti-hallucination',
        group: 'talk',
        name: 'Whisper JA 1.5B（抑幻听）',
        description: '抑制幻听/复读，配合智能切分合并',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            contentProfile: 'talk',
            logLevel: 'DEBUG',
            beamSize: 5,
            repetitionPenalty: 1.15,
            noSpeechThreshold: 0.7,
            logProbThreshold: -1,
            compressionRatioThreshold: 2.1,
            hallucinationSilenceThreshold: 1.5,
            vadThreshold: 0.55,
            vadMinSpeechDurationMs: 300,
            vadMinSilenceDurationMs: 150,
            vadSpeechPadMs: 200,
            smartSplitWithVad: true,
            targetChunkDurationS: 20,
            mergeSegments: true,
            mergeMaxGapMs: 500,
            mergeMaxDurationMs: 8000,
        },
    },
    {
        id: 'transcribe-aggressive-vad',
        group: 'talk',
        name: 'SenseVoice Small（激进切分）',
        description: '高阈值激进 VAD，敢切长段',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            contentProfile: 'talk',
            vadEnabled: true,
            vadSensitive: false,
            vadAggressive: true,
            vadThreshold: 0.6,
            vadMaxSingleSegmentMs: 20000,
            audioLightDenoise: true,
        },
    },
];

function getPresetsFilePath() {
    return path.join(getWritableRoot(), PRESETS_FILE_NAME);
}

function normalizeStoredPreset(preset) {
    if (!preset || typeof preset !== 'object') return preset;
    const group = normalizePresetGroup(preset.group, { builtin: !!preset.builtin });
    return { ...preset, group };
}

function loadPresets() {
    const builtins = BUILTIN_PRESETS.map((p) => ({ ...p, options: { ...p.options } }));
    const filePath = getPresetsFilePath();
    if (!fs.existsSync(filePath)) {
        return { presets: builtins };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const custom = Array.isArray(parsed.presets) ? parsed.presets : [];
        return {
            presets: [
                ...builtins,
                ...custom
                    .filter((p) => !p.builtin)
                    .map((p) => normalizeStoredPreset(p)),
            ],
        };
    } catch {
        return { presets: builtins };
    }
}

function saveCustomPreset(preset) {
    const filePath = getPresetsFilePath();
    const { presets } = loadPresets();
    const custom = presets.filter((p) => !p.builtin);
    const builtinIds = new Set(presets.filter((p) => p.builtin).map((p) => p.id));
    let id = String(preset.id || '').trim();
    // Never overwrite a builtin id — force a new custom id.
    if (!id || builtinIds.has(id)) id = `custom-${Date.now()}`;
    const group = normalizePresetGroup(preset.group || 'talk', { builtin: false }) || 'talk';
    const entry = {
        id,
        name: String(preset.name || '自定义预设').trim() || '自定义预设',
        description: String(preset.description || '').trim(),
        group,
        builtin: false,
        options: sanitizePresetOptions(preset.options),
    };
    if (!entry.description) delete entry.description;
    const idx = custom.findIndex((p) => p.id === entry.id);
    if (idx >= 0) custom[idx] = entry;
    else custom.push(entry);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, presets: custom }, null, 2)}\n`, 'utf8');
    return entry;
}

function deleteCustomPreset(id) {
    const filePath = getPresetsFilePath();
    const custom = loadPresets().presets.filter((p) => !p.builtin && p.id !== id);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, presets: custom }, null, 2)}\n`, 'utf8');
    return { ok: true };
}

module.exports = {
    BUILTIN_PRESETS,
    PRESET_GROUP_ORDER,
    PRESET_GROUP_LABELS,
    PRESET_SKIP_KEYS,
    ANIME_VAD,
    ANIME_FIRERED_VAD,
    ANIME_WHISPER_FIRERED_OPTIONS,
    QWEN_GALGAME_TEN_OPTIONS,
    normalizePresetGroup,
    sanitizePresetOptions,
    loadPresets,
    saveCustomPreset,
    deleteCustomPreset,
};
