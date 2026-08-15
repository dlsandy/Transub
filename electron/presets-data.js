const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const PRESETS_FILE_NAME = 'transub-presets.json';

/**
 * Built-in parameter presets cover ASR / VAD / device / post-batch only.
 * Do not set task, translateMode, engineMtModel, engineLlmMtModel,
 * glossaryMtEnabled, or sakuraNsfwPrompt — those stay on the task/MT controls.
 *
 * ASR preset groups:
 * 软声 / 影视 / 动漫 / 对话 / 自定义 / 其他
 */
const PRESET_SKIP_KEYS = Object.freeze([
    'task',
    'translateMode',
    'engineMtModel',
    'engineLlmMtModel',
    'glossaryMtEnabled',
    'sakuraNsfwPrompt',
    'autoSense',
]);

/** Display order for settings optgroups and main-window preset tabs. */
const PRESET_GROUP_ORDER = Object.freeze([
    '软声', '影视', '动漫', '对话', '自定义', '其他',
]);

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

/** Soft / anime dialogue timeline: Silero + TEN short frames (not WhisperSeg). */
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

/** Shared Anime Whisper ASR options (软声 / 动漫各保留一份入口). */
const ANIME_WHISPER_OPTIONS = Object.freeze({
    device: 'cuda',
    language: 'ja',
    engineAsrModel: 'anime-whisper',
    contentProfile: 'av_soft',
    ...ANIME_VAD,
});

/**
 * Built-in presets: each content group has multiple variants (1 category → N presets).
 * Keep stable ids — UI selection / tips / sense may key off them.
 */
const BUILTIN_PRESETS = [
    // ── 软声 ──────────────────────────────────────────────
    {
        id: 'ja-av-anime-whisper-translate',
        group: '软声',
        scene: 'Anime Whisper',
        scenePrimary: true,
        sceneBlurb: '软声 / 气音日语听写更稳，TEN 短帧时间轴',
        name: 'Anime Whisper',
        description: '软声与气音日语更稳，配合 TEN 短帧时间轴，并精简语气词。',
        builtin: true,
        options: { ...ANIME_WHISPER_OPTIONS },
    },
    {
        id: 'ja-av-soft-translate',
        group: '软声',
        name: 'Whisper JA 1.5B',
        description: '日语微调 ASR，软声听写更准，速度慢于 Anime Whisper。',
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

    // ── 影视 ──────────────────────────────────────────────
    {
        id: 'film-audio-enhance',
        group: '影视',
        scene: 'Whisper large-v3-turbo + Demucs',
        scenePrimary: true,
        sceneBlurb: 'Demucs 剥离配乐后人声听写（Pro）',
        name: 'Whisper large-v3-turbo + Demucs',
        description: '先用人声分离去掉 BGM/音效，再用 Turbo 听写，适合有配乐的影视（Pro）。',
        builtin: true,
        options: {
            device: 'cuda',
            filmAudioEnhance: true,
            filmVadPreset: false,
            engineAsrModel: 'whisper-large-v3-turbo',
            audioLightDenoise: false,
            ...FILM_VAD,
        },
    },
    {
        id: 'film-vad-only',
        group: '影视',
        name: 'Whisper large-v3-turbo',
        description: '套用影视向 VAD，不做 Demucs，适合音轨已较干净的电影/剧集。',
        builtin: true,
        options: {
            device: 'cuda',
            filmAudioEnhance: false,
            filmVadPreset: true,
            engineAsrModel: 'whisper-large-v3-turbo',
            audioLightDenoise: false,
            ...FILM_VAD,
        },
    },
    {
        id: 'film-sensevoice',
        group: '影视',
        scene: 'SenseVoice Small',
        scenePrimary: true,
        sceneBlurb: '多语种影视听写，轻度降噪抑制配乐碎片',
        name: 'SenseVoice Small',
        description: '多语种快速识别，配合影视 VAD 与轻度降噪，抑制配乐碎片。',
        builtin: true,
        options: {
            device: 'cuda',
            filmAudioEnhance: false,
            filmVadPreset: false,
            engineAsrModel: 'sensevoice-small',
            audioLightDenoise: true,
            ...FILM_VAD,
        },
    },
    {
        id: 'film-turbo-stable',
        group: '影视',
        name: 'Whisper large-v3-turbo',
        description: '影视 VAD + 轻度降噪，无 Demucs，质量与速度折中。',
        builtin: true,
        options: {
            device: 'cuda',
            filmAudioEnhance: false,
            filmVadPreset: false,
            engineAsrModel: 'whisper-large-v3-turbo',
            beamSize: 5,
            audioLightDenoise: true,
            ...FILM_VAD,
        },
    },

    // ── 动漫 ──────────────────────────────────────────────
    {
        id: 'anime-whisper-translate',
        group: '动漫',
        scene: 'Anime Whisper',
        scenePrimary: true,
        sceneBlurb: '动画 / Galgame 演技听写，TEN 短帧时间轴',
        name: 'Anime Whisper',
        description: '面向动画与 Galgame 演技，TEN 短帧时间轴，并精简语气词。',
        builtin: true,
        options: { ...ANIME_WHISPER_OPTIONS },
    },
    {
        id: 'anime-kotoba',
        group: '动漫',
        name: 'Kotoba Whisper v2.0',
        description: '日语蒸馏模型，动画对白更快，显存更友好。',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'kotoba-whisper-v2.0-faster',
            ...ANIME_VAD,
        },
    },
    {
        id: 'anime-ja15',
        group: '动漫',
        name: 'Whisper JA 1.5B',
        description: '日语微调 ASR，动画对白更准，速度慢于 Kotoba / Anime Whisper。',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            ...ANIME_VAD,
            beamSize: 5,
        },
    },
    {
        id: 'anime-turbo',
        group: '动漫',
        name: 'Whisper large-v3-turbo',
        description: '未装专科模型时的动画备用方案，配合 TEN 时间轴。',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-large-v3-turbo',
            ...ANIME_VAD,
            beamSize: 5,
        },
    },

    // ── 对话 ──────────────────────────────────────────────
    {
        id: 'translate-quality',
        group: '对话',
        scene: 'SenseVoice Small',
        scenePrimary: true,
        sceneBlurb: '清晰对白通用起点',
        name: 'SenseVoice Small',
        description: '清晰对白通用起点：开启 VAD，适合大多数对白清楚的素材。',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            logLevel: 'DEBUG',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'dialogue-sensevoice',
        group: '对话',
        name: 'SenseVoice Small',
        description: '多语种清晰对白听写，开启 VAD 与轻度降噪。',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
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
        group: '对话',
        name: 'SenseVoice Small',
        description: '低显存设备配置，优先保证能跑完，质量略让位。',
        builtin: true,
        options: {
            device: 'cuda_low_vram',
            engineAsrModel: 'sensevoice-small',
            logLevel: 'INFO',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'transcribe-only',
        group: '对话',
        name: 'Whisper JA 1.5B',
        description: '日语片源基础听写，开启 VAD。',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'whisper-ja-1.5b',
            logLevel: 'DEBUG',
            language: 'ja',
            vadEnabled: true,
        },
    },
    {
        id: 'translate-strict-split',
        group: '对话',
        name: 'Whisper JA 1.5B',
        description: '提高 VAD 门槛并轻度降噪，减少噪声碎片、切段更干净。',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
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
        group: '对话',
        name: 'Whisper JA 1.5B',
        description: '针对日语幻听/复读：提高无声阈值，并配合智能切分与合并。',
        builtin: true,
        options: {
            device: 'cuda',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
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
        group: '对话',
        name: 'SenseVoice Small',
        description: '高阈值激进 VAD，更敢切长段，适合句间停顿清楚的素材。',
        builtin: true,
        options: {
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
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

function loadPresets() {
    const builtins = BUILTIN_PRESETS.map((p) => ({ ...p, options: { ...p.options } }));
    const filePath = getPresetsFilePath();
    if (!fs.existsSync(filePath)) {
        return { presets: builtins };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const custom = Array.isArray(parsed.presets) ? parsed.presets : [];
        return { presets: [...builtins, ...custom.filter((p) => !p.builtin)] };
    } catch {
        return { presets: builtins };
    }
}

function saveCustomPreset(preset) {
    const filePath = getPresetsFilePath();
    const { presets } = loadPresets();
    const custom = presets.filter((p) => !p.builtin);
    const entry = {
        id: preset.id || `custom-${Date.now()}`,
        name: String(preset.name || '自定义预设').trim() || '自定义预设',
        description: String(preset.description || '').trim(),
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
    PRESET_SKIP_KEYS,
    sanitizePresetOptions,
    loadPresets,
    saveCustomPreset,
    deleteCustomPreset,
};
