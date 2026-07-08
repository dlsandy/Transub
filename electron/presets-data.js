const fs = require('fs');
const path = require('path');
const { getProjectRoot } = require('./app-paths');

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
            mergeSegments: true,
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
            mergeSegments: true,
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
            mergeSegments: true,
        },
    },
];

function getPresetsFilePath() {
    return path.join(getProjectRoot(), PRESETS_FILE_NAME);
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
