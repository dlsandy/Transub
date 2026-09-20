/**
 * Regenerate combo-plans-samples for CDN upload.
 * Non-external modes (llm / dialog / smart) × ja|en|ko × 3 hardware tiers.
 * External: a few standalone recipes (no hardware matrix).
 *
 * Run: node tools/combo-plans-samples/generate-pack.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PLANS_DIR = path.join(ROOT, 'plans');

const HW = {
    low: {
        tier: 'low',
        preferCuda: true,
        minVramGb: 4,
        minSystemRamGb: 12,
        label: '性能 · <8GB 显存',
        tag: '性能',
        device: 'cuda_low_vram',
        profile: 'speed',
    },
    balanced: {
        tier: 'balanced',
        preferCuda: true,
        minVramGb: 8,
        minSystemRamGb: 16,
        label: '均衡 · 8–12GB 显存',
        tag: '均衡',
        device: 'cuda',
        profile: 'balanced',
    },
    quality: {
        tier: 'quality',
        preferCuda: true,
        minVramGb: 12,
        minSystemRamGb: 32,
        label: '质量 · >12GB 显存',
        tag: '质量',
        device: 'cuda',
        profile: 'quality',
    },
};

const MODE_LABEL = {
    llm: '推理',
    dialog: '智能',
    smart: '混合',
    external: '外部',
};

const LANG_PAIR = {
    ja: { language: 'ja', subtitleTargetLang: 'zh-Hans', group: 'ja', src: '日语', dst: '简中' },
    en: { language: 'en', subtitleTargetLang: 'zh-Hans', group: 'western', src: '英语', dst: '简中' },
    ko: { language: 'ko', subtitleTargetLang: 'zh-Hans', group: 'ko', src: '韩语', dst: '简中' },
};

/** ASR stack per language × hardware */
const ASR = {
    ja: {
        low: {
            models: ['whisper-ja-1.5b', 'silero-vad'],
            asr: 'whisper-ja-1.5b',
            vad: 'silero-vad',
            contentProfile: 'av_soft',
            activePresetId: 'ja-av-soft-translate',
            extra: { vadEnabled: true },
            asrName: 'Whisper JA 1.5B',
        },
        balanced: {
            models: ['anime-whisper', 'firered-vad'],
            asr: 'anime-whisper',
            vad: 'firered-vad',
            contentProfile: 'av_soft',
            activePresetId: 'ja-av-anime-whisper-firered',
            extra: {
                vadEnabled: true,
                timingAlign: true,
                timingAlignModel: 'firered',
            },
            asrName: 'Anime Whisper',
        },
        quality: {
            models: ['qwen3-asr-1.7b-ja-anime-galgame', 'silero-vad'],
            asr: 'qwen3-asr-1.7b-ja-anime-galgame',
            vad: 'silero-vad',
            contentProfile: 'av_soft',
            activePresetId: 'ja-av-qwen3-galgame-ten',
            extra: {
                vadEnabled: true,
                timingAlign: true,
                timingAlignModel: 'ten',
            },
            asrName: 'Qwen3 Galgame',
        },
    },
    en: {
        low: {
            models: ['sensevoice-small', 'silero-vad'],
            asr: 'sensevoice-small',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'film-sensevoice',
            extra: { vadEnabled: true, audioLightDenoise: true },
            asrName: 'SenseVoice',
        },
        balanced: {
            models: ['sensevoice-small', 'silero-vad'],
            asr: 'sensevoice-small',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'film-turbo-stable',
            extra: {
                vadEnabled: true,
                audioLightDenoise: true,
                beamSize: 5,
            },
            asrName: 'SenseVoice',
        },
        quality: {
            models: ['whisper-large-v3-turbo', 'silero-vad'],
            asr: 'whisper-large-v3-turbo',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'film-vad-only',
            extra: {
                vadEnabled: true,
                filmVadPreset: true,
                audioLightDenoise: false,
                beamSize: 5,
            },
            asrName: 'Whisper turbo',
        },
    },
    ko: {
        low: {
            models: ['sensevoice-small', 'silero-vad'],
            asr: 'sensevoice-small',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'ko-sensevoice',
            extra: { vadEnabled: true, audioLightDenoise: true },
            asrName: 'SenseVoice',
        },
        balanced: {
            models: ['sensevoice-small', 'silero-vad'],
            asr: 'sensevoice-small',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'ko-sensevoice',
            extra: { vadEnabled: true, audioLightDenoise: true, beamSize: 5 },
            asrName: 'SenseVoice',
        },
        quality: {
            models: ['whisper-large-v3-turbo', 'silero-vad'],
            asr: 'whisper-large-v3-turbo',
            vad: 'silero-vad',
            contentProfile: 'film',
            activePresetId: 'ko-vad-only',
            extra: {
                vadEnabled: true,
                filmVadPreset: true,
                audioLightDenoise: false,
            },
            asrName: 'Whisper turbo',
        },
    },
};

/** Dialogue polish model (smart only). Not a translate-only GGUF. */
const POLISH = {
    low: { id: 'qwen3-4b', name: 'Qwen3 4B' },
    balanced: { id: 'qwen3-8b', name: 'Qwen3 8B' },
    quality: { id: 'qwen3-14b', name: 'Qwen3 14B' },
};

/** Local MT model per language × hardware (llm / smart base) */
const MT = {
    ja: {
        low: { id: 'sakura-1.5b', name: 'Sakura 1.5B' },
        balanced: { id: 'sakura-galtransl-7b-q6k', name: 'GalTransl 7B' },
        quality: { id: 'sakura-galtransl-14b-q6k', name: 'GalTransl 14B' },
    },
    en: {
        low: { id: 'translategemma-4b', name: 'TranslateGemma 4B' },
        balanced: { id: 'translategemma-4b', name: 'TranslateGemma 4B' },
        quality: { id: 'translategemma-4-sub-e4b', name: 'TranslateGemma E4B' },
    },
    ko: {
        low: { id: 'sakura-ln-korean-7b', name: 'LN-Korean 7B' },
        balanced: { id: 'sakura-ln-korean-7b', name: 'LN-Korean 7B' },
        quality: { id: 'sakura-ln-korean-14b', name: 'LN-Korean 14B' },
    },
};

const SCENE = {
    ja: '软对白',
    en: '欧美剧',
    ko: '韩剧',
};

function hardwareBlock(hwKey) {
    const h = HW[hwKey];
    return {
        tier: h.tier,
        preferCuda: h.preferCuda,
        minVramGb: h.minVramGb,
        minSystemRamGb: h.minSystemRamGb,
        label: h.label,
    };
}

function buildPlan(langKey, mode, hwKey) {
    const lang = LANG_PAIR[langKey];
    const hw = HW[hwKey];
    const asr = ASR[langKey][hwKey];
    const mt = MT[langKey][hwKey];
    const polish = mode === 'smart' ? POLISH[hwKey] : null;
    const requiresPro = mode === 'dialog' || mode === 'smart';
    const modeLabel = MODE_LABEL[mode];
    const id = `${langKey}-${mode}-${hwKey === 'balanced' ? 'bal' : hwKey === 'quality' ? 'qual' : 'perf'}`;
    const name = `${SCENE[langKey]} · ${modeLabel} · ${hw.tag}`;
    const mtPart = mode === 'dialog'
        ? '对话模型按行'
        : (polish ? `${mt.name} 翻译 + ${polish.name} 润色` : mt.name);
    const summary = `${lang.src}→${lang.dst} · ${asr.asrName} + ${mtPart} · ${hw.tag}`;
    const description = [
        `${SCENE[langKey]}：${asr.asrName} 听写`,
        mode === 'llm' ? `+ ${mt.name} 本地推理翻译` : null,
        mode === 'dialog' ? '+ 智能翻译（对话模型按行）' : null,
        mode === 'smart' ? `+ 混合翻译（${mt.name} 句级翻译，${polish.name} 剧情贴合润色）` : null,
        `硬件档：${hw.label}。`,
        requiresPro ? '需 Pro。' : null,
    ].filter(Boolean).join('');

    const models = [...asr.models];
    if (mode === 'llm' || mode === 'smart') models.push(mt.id);
    if (polish) models.push(polish.id);

    const options = {
        language: lang.language,
        subtitleTargetLang: lang.subtitleTargetLang,
        device: hw.device,
        engineAsrModel: asr.asr,
        engineVadModel: asr.vad,
        contentProfile: asr.contentProfile,
        translateMode: mode,
        engineLlmMtModel: mode === 'dialog' ? '' : mt.id,
        engineProfile: hw.profile,
        activePresetId: asr.activePresetId,
        ...asr.extra,
    };
    if (polish) options.smartTranslateModelId = polish.id;

    return {
        id,
        version: polish ? 2 : 1,
        group: lang.group,
        name,
        description,
        language: lang.language,
        subtitleTargetLang: lang.subtitleTargetLang,
        translateMode: mode,
        requiresPro,
        hardware: hardwareBlock(hwKey),
        models,
        options,
        _summary: summary,
    };
}

function buildExternal(spec) {
    return {
        id: spec.id,
        version: 1,
        group: spec.group,
        name: spec.name,
        description: spec.description,
        language: spec.language,
        subtitleTargetLang: spec.subtitleTargetLang,
        translateMode: 'external',
        requiresPro: false,
        hardware: spec.hardware,
        models: spec.models,
        options: spec.options,
        _summary: spec.summary,
    };
}

const externals = [
    buildExternal({
        id: 'en-external-cpu',
        group: 'western',
        name: '欧美剧 · 外部 · CPU',
        summary: '英语→简中 · SenseVoice CPU + 外部翻译',
        description: '无独显：SenseVoice CPU 听写，译文走 Station / 外接 API。',
        language: 'en',
        subtitleTargetLang: 'zh-Hans',
        hardware: {
            tier: 'cpu',
            preferCuda: false,
            minVramGb: 0,
            minSystemRamGb: 8,
            label: 'CPU · 无独显要求',
        },
        models: ['sensevoice-small', 'silero-vad'],
        options: {
            language: 'en',
            subtitleTargetLang: 'zh-Hans',
            device: 'cpu',
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'silero-vad',
            contentProfile: 'film',
            vadEnabled: true,
            audioLightDenoise: true,
            translateMode: 'external',
            engineLlmMtModel: '',
            engineProfile: 'speed',
            activePresetId: 'film-sensevoice',
        },
    }),
    buildExternal({
        id: 'ja-external-hant',
        group: 'ja',
        name: '日语动漫 · 外部 · 繁中',
        summary: '日语→繁中 · Anime Whisper + 外部翻译',
        description: 'Anime Whisper 听写，目标繁中，译文走 Station / 外接 API。',
        language: 'ja',
        subtitleTargetLang: 'zh-Hant',
        hardware: hardwareBlock('low'),
        models: ['anime-whisper', 'firered-vad'],
        options: {
            language: 'ja',
            subtitleTargetLang: 'zh-Hant',
            device: 'cuda_low_vram',
            engineAsrModel: 'anime-whisper',
            engineVadModel: 'firered-vad',
            contentProfile: 'av_soft',
            vadEnabled: true,
            timingAlign: true,
            timingAlignModel: 'firered',
            translateMode: 'external',
            engineLlmMtModel: '',
            engineProfile: 'speed',
            activePresetId: 'ja-av-anime-whisper-firered',
        },
    }),
    buildExternal({
        id: 'ko-external-hant',
        group: 'ko',
        name: '韩剧 · 外部 · 繁中',
        summary: '韩语→繁中 · SenseVoice + 外部翻译',
        description: 'SenseVoice 韩语听写，目标繁中，译文走 Station / 外接 API。',
        language: 'ko',
        subtitleTargetLang: 'zh-Hant',
        hardware: hardwareBlock('balanced'),
        models: ['sensevoice-small', 'silero-vad'],
        options: {
            language: 'ko',
            subtitleTargetLang: 'zh-Hant',
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'silero-vad',
            contentProfile: 'film',
            vadEnabled: true,
            audioLightDenoise: true,
            translateMode: 'external',
            engineLlmMtModel: '',
            engineProfile: 'balanced',
            activePresetId: 'ko-sensevoice',
        },
    }),
    buildExternal({
        id: 'zh-external-bal',
        group: 'zh',
        name: '华语片 · 外部 · 均衡',
        summary: '中文→简中 · SenseVoice + 外部润色',
        description: 'SenseVoice 华语听写；译文/润色走 Station / 外接 API。',
        language: 'zh',
        subtitleTargetLang: 'zh-Hans',
        hardware: hardwareBlock('balanced'),
        models: ['sensevoice-small', 'silero-vad'],
        options: {
            language: 'zh',
            subtitleTargetLang: 'zh-Hans',
            device: 'cuda',
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'silero-vad',
            contentProfile: 'film',
            vadEnabled: true,
            audioLightDenoise: true,
            translateMode: 'external',
            engineLlmMtModel: '',
            engineProfile: 'balanced',
            activePresetId: 'zh-sensevoice',
        },
    }),
    buildExternal({
        id: 'talk-external-perf',
        group: 'talk',
        name: '访谈对白 · 外部 · 性能',
        summary: '日语→简中 · SenseVoice 对白 + 外部 API',
        description: '清晰对白：SenseVoice + VAD，译文走外部 API。适合播客/访谈。',
        language: 'ja',
        subtitleTargetLang: 'zh-Hans',
        hardware: hardwareBlock('low'),
        models: ['sensevoice-small', 'silero-vad'],
        options: {
            language: 'ja',
            subtitleTargetLang: 'zh-Hans',
            device: 'cuda_low_vram',
            engineAsrModel: 'sensevoice-small',
            engineVadModel: 'silero-vad',
            contentProfile: 'talk',
            vadEnabled: true,
            audioLightDenoise: true,
            translateMode: 'external',
            engineLlmMtModel: '',
            engineProfile: 'speed',
            activePresetId: 'dialogue-sensevoice',
        },
    }),
];

/** Featured hybrid recipes that sit inside a hardware band but are not the generic matrix row. */
const featured = [
    {
        id: 'ja-smart-10-12',
        version: 1,
        group: 'ja',
        name: '日语软对白 · 混合 · 10–12GB',
        description: '10–12GB 显存日译中：Qwen3-ASR Galgame 软对白听写 + GalTransl 7B 句级翻译 + Huihui Qwen3 8B Abliterated 润色。需 Pro。',
        language: 'ja',
        subtitleTargetLang: 'zh-Hans',
        translateMode: 'smart',
        requiresPro: true,
        hardware: {
            tier: 'balanced',
            preferCuda: true,
            minVramGb: 10,
            minSystemRamGb: 16,
            label: '均衡 · 10–12GB 显存',
        },
        models: [
            'qwen3-asr-1.7b-ja-anime-galgame',
            'silero-vad',
            'sakura-galtransl-7b-q6k',
            'qwen3-8b-abliterated',
        ],
        options: {
            language: 'ja',
            subtitleTargetLang: 'zh-Hans',
            device: 'cuda',
            engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            engineVadModel: 'silero-vad',
            contentProfile: 'av_soft',
            vadEnabled: true,
            timingAlign: true,
            timingAlignModel: 'ten',
            beamSize: 1,
            translateMode: 'smart',
            engineLlmMtModel: 'sakura-galtransl-7b-q6k',
            smartTranslateModelId: 'qwen3-8b-abliterated',
            engineProfile: 'balanced',
            activePresetId: 'ja-av-qwen3-galgame-ten',
        },
        _summary: '日语→简中 · Qwen3 Galgame + GalTransl 7B + Huihui Qwen3 8B 润色 · 10–12GB',
    },
];

function main() {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
    for (const f of fs.readdirSync(PLANS_DIR)) {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(PLANS_DIR, f));
    }

    const plans = [];
    for (const lang of ['ja', 'en', 'ko']) {
        for (const mode of ['llm', 'dialog', 'smart']) {
            for (const hw of ['low', 'balanced', 'quality']) {
                plans.push(buildPlan(lang, mode, hw));
            }
        }
    }
    plans.push(...externals, ...featured);

    const manifestPlans = [];
    for (const p of plans) {
        const summary = p._summary;
        delete p._summary;
        const file = `plans/${p.id}.json`;
        fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(p, null, 2)}\n`, 'utf8');
        manifestPlans.push({
            id: p.id,
            file,
            version: p.version,
            group: p.group,
            name: p.name,
            summary,
            language: p.language,
            subtitleTargetLang: p.subtitleTargetLang,
            translateMode: p.translateMode,
            requiresPro: p.requiresPro,
            hardware: {
                tier: p.hardware.tier,
                minVramGb: p.hardware.minVramGb,
                preferCuda: p.hardware.preferCuda,
            },
        });
    }

    const manifest = {
        schemaVersion: 1,
        updatedAt: '2026-09-19T11:30:00+08:00',
        plans: manifestPlans,
    };
    fs.writeFileSync(path.join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const byMode = {};
    for (const p of plans) {
        byMode[p.translateMode] = (byMode[p.translateMode] || 0) + 1;
    }
    console.log(`Wrote ${plans.length} plans → ${ROOT}`);
    console.log(byMode);
}

main();
