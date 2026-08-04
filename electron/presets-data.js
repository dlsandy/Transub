const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const PRESETS_FILE_NAME = 'transub-presets.json';

const BUILTIN_PRESETS = [
    {
        id: 'translate-quality',
        name: '翻译 · 高质量',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            logLevel: 'DEBUG',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'translate-low-vram',
        name: '翻译 · 低显存',
        builtin: true,
        options: {
            device: 'cuda_low_vram',
            task: 'translate',
            logLevel: 'INFO',
            beamSize: 5,
            vadEnabled: true,
        },
    },
    {
        id: 'translate-anti-hallucination',
        name: '翻译 · 严切分',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            language: 'ja',
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
        name: '翻译 · 抑幻听',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            language: 'ja',
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
        id: 'transcribe-only',
        name: '仅转写',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'transcribe',
            logLevel: 'DEBUG',
            language: 'ja',
            vadEnabled: true,
        },
    },
    {
        id: 'film-audio-enhance',
        name: '影视 · 音频增强（Pro）',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'transcribe',
            filmAudioEnhance: true,
            engineAsrModel: 'whisper-large-v3-turbo',
            engineVadModel: 'silero-vad',
            vadEnabled: true,
            vadThreshold: 0.55,
            vadMinSpeechDurationMs: 350,
            vadMinSilenceDurationMs: 280,
            vadSpeechPadMs: 200,
            vadMaxSingleSegmentMs: 18000,
            vadSensitive: false,
            vadAggressive: false,
            audioLightDenoise: false,
            hallucinationSilenceThreshold: 2,
        },
    },
    {
        id: 'transcribe-aggressive-vad',
        name: '转写 · 激进切分',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'transcribe',
            vadEnabled: true,
            vadSensitive: false,
            vadAggressive: true,
            vadThreshold: 0.6,
            vadMaxSingleSegmentMs: 20000,
            audioLightDenoise: true,
        },
    },
    {
        id: 'transcribe-sensitive-vad',
        name: '转写 · 灵敏检出（WhisperSeg）',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'transcribe',
            language: 'ja',
            engineAsrModel: 'whisper-large-v3-turbo',
            engineVadModel: 'whisperseg-asmr',
            vadEnabled: true,
            vadSensitive: true,
            vadAggressive: false,
            vadThreshold: 0.18,
            vadMinSpeechDurationMs: 60,
            vadMinSilenceDurationMs: 140,
            vadSpeechPadMs: 350,
            vadMaxSingleSegmentMs: 30000,
            hallucinationSilenceThreshold: 4,
            audioLightDenoise: false,
            filmAudioEnhance: false,
            filmVadPreset: false,
        },
    },
    {
        id: 'ja-av-soft-translate',
        name: '日语 · 软声翻译（WhisperSeg）',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            engineVadModel: 'whisperseg-asmr',
            engineMtModel: 'sakura-1.5b',
            engineLlmMtModel: 'sakura-1.5b',
            translateMode: 'llm',
            vadEnabled: true,
            vadSensitive: true,
            vadAggressive: false,
            vadThreshold: 0.18,
            vadMinSpeechDurationMs: 60,
            vadMinSilenceDurationMs: 140,
            vadSpeechPadMs: 350,
            vadMaxSingleSegmentMs: 30000,
            hallucinationSilenceThreshold: 4,
            beamSize: 5,
            // FNS tests: light denoise / Demucs hurt soft-scene recall — leave off.
            audioLightDenoise: false,
            filmAudioEnhance: false,
            filmVadPreset: false,
            glossaryMtEnabled: true,
            sakuraNsfwPrompt: true,
        },
    },
    {
        id: 'ja-av-ja15-translate',
        name: '日语 · JA1.5B 翻译（可选）',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            language: 'ja',
            engineAsrModel: 'whisper-ja-1.5b',
            engineVadModel: 'whisperseg-asmr',
            engineMtModel: 'sakura-1.5b',
            engineLlmMtModel: 'sakura-1.5b',
            translateMode: 'llm',
            vadEnabled: true,
            vadSensitive: true,
            vadAggressive: false,
            vadThreshold: 0.18,
            vadMinSpeechDurationMs: 60,
            vadMinSilenceDurationMs: 140,
            vadSpeechPadMs: 350,
            vadMaxSingleSegmentMs: 30000,
            hallucinationSilenceThreshold: 4,
            beamSize: 5,
            audioLightDenoise: false,
            filmAudioEnhance: false,
            filmVadPreset: false,
            glossaryMtEnabled: true,
            sakuraNsfwPrompt: true,
        },
    },
    {
        id: 'ja-av-anime-whisper-translate',
        name: '日语 · Anime Whisper 翻译（可选）',
        builtin: true,
        options: {
            device: 'cuda',
            task: 'translate',
            language: 'ja',
            engineAsrModel: 'anime-whisper',
            // WhisperSeg is skipped for anime CT2 (clip gating drops dialogue).
            // Timeline comes from TEN VAD short frames (ChronosJAV / WhisperJAV).
            engineVadModel: 'silero-vad',
            engineMtModel: 'sakura-1.5b',
            engineLlmMtModel: 'sakura-1.5b',
            translateMode: 'llm',
            vadEnabled: true,
            vadSensitive: false,
            vadAggressive: false,
            vadThreshold: 0.45,
            vadMinSpeechDurationMs: 180,
            vadMinSilenceDurationMs: 500,
            vadSpeechPadMs: 80,
            vadMaxSingleSegmentMs: 5000,
            hallucinationSilenceThreshold: 0,
            // ten = VAD owns timeline (default for anime); set 'rate' to disable.
            timingAlign: true,
            timingAlignModel: 'ten',
            beamSize: 5,
            audioLightDenoise: false,
            filmAudioEnhance: false,
            filmVadPreset: false,
            glossaryMtEnabled: true,
            sakuraNsfwPrompt: true,
            contentProfile: 'av_soft',
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
        builtin: false,
        options: preset.options && typeof preset.options === 'object' ? preset.options : {},
    };
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
    loadPresets,
    saveCustomPreset,
    deleteCustomPreset,
};
