/**
 * Free Sakura MT catalog (GGUF + llama-server).
 * Sakura is CC-BY-NC-SA — non-commercial model license.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSakuraMtCatalog = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sakuraMtCatalogFactory() {
    const DEFAULT_MODEL_ID = 'sakura-1.5b';

    /** @type {ReadonlyArray<object>} */
    const CATALOG = Object.freeze([
        {
            id: 'sakura-1.5b',
            name: 'Sakura 1.5B（默认）',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
            // Official Hub only ships FP16 (~3.5GB); community Q5_K_S is the practical “light” default.
            ggufUrl: 'https://huggingface.co/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/resolve/main/sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
            sizeHint: '约 1.2 GB',
            sizeBytes: 1259173504,
            size_hint_mb: 1200,
            ramHint: '建议 ≥4 GB 内存',
            languages: ['ja', 'zh'],
            mtPair: 'ja|zh',
            note: '日→简中 · 免费推理翻译；社区 Q5 量化；CC-BY-NC-SA',
            recommended: true,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 1.5,
        },
        {
            id: 'sakura-7b',
            name: 'Sakura 7B',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-7B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4250298208,
            size_hint_mb: 4250,
            ramHint: '建议 ≥8 GB 内存 / 显存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 质量更好；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 7,
        },
        {
            id: 'sakura-8b-qwen3',
            name: 'Sakura 8B Qwen3 v1.1（验证）',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-8b-qwen3-v1.1-iq4xs.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-8B-Qwen3-v1.1-SFT-GGUF/resolve/main/sakura-8b-qwen3-v1.1-iq4xs.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4593296064,
            size_hint_mb: 4381,
            ramHint: '建议 ≥8–10 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Qwen3 验证版（非正式 2.0）；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 8,
        },
        {
            id: 'sakura-14b',
            name: 'Sakura 14B Qwen2.5 v1.0 IQ4',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-14b-qwen2.5-v1.0-iq4xs.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-14b-qwen2.5-v1.0-iq4xs.gguf',
            sizeHint: '约 7.6 GB',
            sizeBytes: 8186195264,
            size_hint_mb: 7807,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 正式大参数 IQ4；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-14b-q4km',
            name: 'Sakura 14B Qwen2.5 v1.0 Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-14b-qwen2.5-v1.0-q4km.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-14b-qwen2.5-v1.0-q4km.gguf',
            sizeHint: '约 8.4 GB',
            sizeBytes: 8988110144,
            size_hint_mb: 8572,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 正式大参数 Q4_K_M；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-14b-q6k',
            name: 'Sakura 14B Qwen2.5 v1.0 Q6_K',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-14b-qwen2.5-v1.0-q6k.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-14b-qwen2.5-v1.0-q6k.gguf',
            sizeHint: '约 11.3 GB',
            sizeBytes: 12124683584,
            size_hint_mb: 11563,
            ramHint: '建议 ≥16 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 正式大参数 Q6_K 更高保真；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-14b-qwen3',
            name: 'Sakura 14B Qwen3 v1.5 IQ4（非正式）',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-14b-qwen3-v1.5-iq4xs.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-14B-Qwen3-v1.5-GGUF/resolve/main/sakura-14b-qwen3-v1.5-iq4xs.gguf',
            sizeHint: '约 7.6 GB',
            sizeBytes: 8180361440,
            size_hint_mb: 7801,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Qwen3 最新非正式版；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'sakura',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'hy-mt2-1.8b',
            name: 'Hy-MT2 1.8B Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Hy-MT2-1.8B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q4_K_M.gguf',
            sizeHint: '约 1.1 GB',
            sizeBytes: 1184890880,
            size_hint_mb: 1130,
            ramHint: '建议 ≥4 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 混元 Hy-MT2 轻量 · 低显存 / 智能混合 · Apache-2.0',
            recommended: false,
            promptFamily: 'hymt',
            translateOnly: true,
            paramBillion: 1.8,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'hy-mt2-7b',
            name: 'Hy-MT2 7B Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Hy-MT2-7B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/tencent/Hy-MT2-7B-GGUF/resolve/main/Hy-MT2-7B-Q4_K_M.gguf',
            sizeHint: '约 4.6 GB',
            sizeBytes: 4967931904,
            size_hint_mb: 4620,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 混元 Hy-MT2 · 软声/通用 MT · Apache-2.0',
            recommended: false,
            promptFamily: 'hymt',
            translateOnly: true,
            paramBillion: 7,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'hunyuan-mt-chimera-7b-abliterated',
            name: 'Huihui Hunyuan-MT Chimera 7B Abliterated',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Huihui-Hunyuan-MT-Chimera-7B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Hunyuan-MT-Chimera-7B-abliterated-GGUF/resolve/main/Huihui-Hunyuan-MT-Chimera-7B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4624950720,
            size_hint_mb: 4410,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Huihui 消融 Chimera · 直译提示（非官方 ensemble）· 少拒答 · Apache-2.0',
            recommended: false,
            promptFamily: 'hunyuan',
            translateOnly: true,
            paramBillion: 7,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'hunyuan-mt-7b-abliterated',
            name: 'Huihui Hunyuan-MT 7B Abliterated',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Huihui-Hunyuan-MT-7B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Hunyuan-MT-7B-abliterated-GGUF/resolve/main/Huihui-Hunyuan-MT-7B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4624950688,
            size_hint_mb: 4410,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Huihui 消融 Hunyuan-MT · 直译提示 · 少拒答 · Apache-2.0',
            recommended: false,
            promptFamily: 'hunyuan',
            translateOnly: true,
            paramBillion: 7,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'hy-mt15-1.8b-abliterated',
            name: 'Huihui HY-MT1.5 1.8B Abliterated',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Huihui-HY-MT1.5-1.8B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-HY-MT1.5-1.8B-abliterated-GGUF/resolve/main/Huihui-HY-MT1.5-1.8B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 1.1 GB',
            sizeBytes: 1133081760,
            size_hint_mb: 1080,
            ramHint: '建议 ≥4 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Huihui 消融 HY-MT1.5 轻量 · 直译提示 · 少拒答 · Apache-2.0',
            recommended: false,
            promptFamily: 'hunyuan',
            translateOnly: true,
            paramBillion: 1.8,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'hy-mt15-7b-abliterated',
            name: 'Huihui HY-MT1.5 7B Abliterated',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'hunyuan',
            familyLabel: 'Hunyuan MT',
            fileName: 'Huihui-HY-MT1.5-7B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-HY-MT1.5-7B-abliterated-GGUF/resolve/main/Huihui-HY-MT1.5-7B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4624650144,
            size_hint_mb: 4410,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Huihui 消融 HY-MT1.5 · 直译提示 · 少拒答 · Apache-2.0',
            recommended: false,
            promptFamily: 'hunyuan',
            translateOnly: true,
            paramBillion: 7,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'sakura-galtransl-7b',
            name: 'GalTransl 7B v3.7 IQ4',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'Sakura-Galtransl-7B-v3.7-IQ4_XS.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-GalTransl-7B-v3.7/resolve/main/Sakura-Galtransl-7B-v3.7-IQ4_XS.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4250296192,
            size_hint_mb: 4250,
            ramHint: '建议 ≥6–8 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Gal/软声对白 · IQ4 轻量；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 7,
        },
        {
            id: 'sakura-galtransl-7b-q6k',
            name: 'GalTransl 7B v3.7 Q6_K',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'Sakura-Galtransl-7B-v3.7.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-GalTransl-7B-v3.7/resolve/main/Sakura-Galtransl-7B-v3.7.gguf',
            sizeHint: '约 6.3 GB',
            sizeBytes: 6254196608,
            size_hint_mb: 5965,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Gal/软声对白 · Q6_K 更高保真；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 7,
        },
        {
            id: 'sakura-galtransl-v4-4b',
            name: 'GalTransl v4 4B (2601)',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            // Hub path uses “Galtransl” (lowercase t); keep exact filename.
            fileName: 'Galtransl-v4-4B-2601.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/GalTransl-v4-4B-2601/resolve/main/Galtransl-v4-4B-2601.gguf',
            sizeHint: '约 3.1 GB',
            sizeBytes: 3306256992,
            size_hint_mb: 3153,
            ramHint: '建议 ≥6 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · GalTransl v4（Qwen3）轻量 Q6_K；prompt 同 v3.7；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 4,
        },
        {
            id: 'sakura-galtransl-14b',
            name: 'GalTransl 14B v3.8 IQ4',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'Sakura-Galtransl-14B-v3.8-IQ4_XS.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-GalTransl-14B-v3.8/resolve/main/Sakura-Galtransl-14B-v3.8-IQ4_XS.gguf',
            sizeHint: '约 7.6 GB',
            sizeBytes: 8186193216,
            size_hint_mb: 7807,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Gal/软声对白大参数 IQ4；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-galtransl-14b-q4km',
            name: 'GalTransl 14B v3.8 Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'Sakura-Galtransl-14B-v3.8-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-GalTransl-14B-v3.8/resolve/main/Sakura-Galtransl-14B-v3.8-Q4_K_M.gguf',
            sizeHint: '约 8.4 GB',
            sizeBytes: 8988108096,
            size_hint_mb: 8572,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Gal/软声对白大参数 Q4_K_M；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-galtransl-14b-q6k',
            name: 'GalTransl 14B v3.8 Q6_K',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'Sakura-Galtransl-14B-v3.8.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-GalTransl-14B-v3.8/resolve/main/Sakura-Galtransl-14B-v3.8.gguf',
            sizeHint: '约 11.3 GB',
            sizeBytes: 12124681536,
            size_hint_mb: 11563,
            ramHint: '建议 ≥16 GB 显存 / 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · Gal/软声对白大参数 Q6_K；免费推理翻译；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'galtransl',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-ln-korean-7b',
            name: 'LN-Korean 7B v0.3 Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'LN-Korean-7B-v0.3.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/LN-Korean-7B-v0.3-GGUF/resolve/main/LN-Korean-7B-v0.3.Q4_K_M.gguf',
            sizeHint: '约 4.4 GB',
            sizeBytes: 4683073952,
            size_hint_mb: 4466,
            ramHint: '建议 ≥8 GB 显存 / 内存',
            languages: ['ko', 'zh'],
            mtPair: 'ko|zh',
            note: '韩→简中 · SakuraLLM LN-Korean · 社区 Q4_K_M；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'ln-korean',
            translateOnly: true,
            paramBillion: 7,
        },
        {
            id: 'sakura-ln-korean-14b',
            name: 'LN-Korean 14B v0.2 Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'LN-Korean-14B-v0.2.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/LN-Korean-14B-v0.2-GGUF/resolve/main/LN-Korean-14B-v0.2.Q4_K_M.gguf',
            sizeHint: '约 8.6 GB',
            sizeBytes: 9191035200,
            size_hint_mb: 8764,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ko', 'zh'],
            mtPair: 'ko|zh',
            note: '韩→简中 · SakuraLLM LN-Korean · 社区 Q4_K_M；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'ln-korean',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'sakura-ln-ko2ja-14b',
            name: 'LN-ko2ja 14B v0.1 Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'LN-ko2ja-14B-v0.1.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/LN-ko2ja-14B-v0.1-GGUF/resolve/main/LN-ko2ja-14B-v0.1.Q4_K_M.gguf',
            sizeHint: '约 8.6 GB',
            sizeBytes: 9191035200,
            size_hint_mb: 8764,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ko', 'ja'],
            mtPair: 'ko|ja',
            note: '韩→日 · SakuraLLM LN-ko2ja · 社区 Q4_K_M；CC-BY-NC-SA',
            recommended: false,
            promptFamily: 'ln-ko2ja',
            translateOnly: true,
            paramBillion: 14,
        },
        {
            id: 'translategemma-4b',
            name: 'TranslateGemma 4B Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'translategemma',
            familyLabel: 'TranslateGemma',
            fileName: 'translategemma-4b-it.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/translategemma-4b-it-GGUF/resolve/main/translategemma-4b-it.Q4_K_M.gguf',
            sizeHint: '约 2.3 GB',
            sizeBytes: 2489909760,
            size_hint_mb: 2374,
            ramHint: '建议 ≥6 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Google TranslateGemma 轻量 · 约 55 语种 · Gemma 条款',
            recommended: false,
            promptFamily: 'translategemma',
            translateOnly: true,
            paramBillion: 4,
            contextSize: 8192,
            llamaJinja: true,
            ollamaTag: 'translategemma:4b',
        },
        {
            id: 'translategemma-4-sub-e4b',
            name: 'Translate Gemma 4 Sub E4B Q4_K_XL',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'translategemma',
            familyLabel: 'TranslateGemma',
            fileName: 'translate_gemma4_sub-E4B-Q4_K_XL.gguf',
            ggufUrl: 'https://huggingface.co/17slever17/translate-gemma-4-sub-e4b-GGUF/resolve/main/translate_gemma4_sub-E4B-Q4_K_XL.gguf',
            sizeHint: '约 4.8 GB',
            sizeBytes: 5126307008,
            size_hint_mb: 4889,
            ramHint: '建议 ≥8 GB 显存 / 内存（需较新 llama.cpp / Gemma 4）',
            languages: ['ja', 'zh', 'en', 'ko', 'ru', 'de', 'es', 'fr'],
            note: '多语字幕 MT · Gemma 4 Sub E4B · 保留口语/脏话 · Apache-2.0',
            recommended: false,
            promptFamily: 'translategemmasub',
            translateOnly: true,
            paramBillion: 4,
            contextSize: 8192,
            llamaJinja: true,
        },
        {
            id: 'translategemma-12b',
            name: 'TranslateGemma 12B Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'translategemma',
            familyLabel: 'TranslateGemma',
            fileName: 'translategemma-12b-it.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/translategemma-12b-it-GGUF/resolve/main/translategemma-12b-it.Q4_K_M.gguf',
            sizeHint: '约 6.8 GB',
            sizeBytes: 7300794112,
            size_hint_mb: 6963,
            ramHint: '建议 ≥12 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Google TranslateGemma 中等 · 质量更好 · Gemma 条款',
            recommended: false,
            promptFamily: 'translategemma',
            translateOnly: true,
            paramBillion: 12,
            contextSize: 8192,
            llamaJinja: true,
            ollamaTag: 'translategemma:12b',
        },
        {
            id: 'translategemma-27b',
            name: 'TranslateGemma 27B Q4_K_M',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'translategemma',
            familyLabel: 'TranslateGemma',
            fileName: 'translategemma-27b-it.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/translategemma-27b-it-GGUF/resolve/main/translategemma-27b-it.Q4_K_M.gguf',
            sizeHint: '约 15.4 GB',
            sizeBytes: 16546704480,
            size_hint_mb: 15780,
            ramHint: '建议 ≥24 GB 显存 / 内存',
            languages: ['ja', 'zh', 'en', 'ko'],
            note: '多语 MT · Google TranslateGemma 大型 · 需较强硬件 · Gemma 条款',
            recommended: false,
            promptFamily: 'translategemma',
            translateOnly: true,
            paramBillion: 27,
            contextSize: 8192,
            llamaJinja: true,
            ollamaTag: 'translategemma:27b',
        },
    ]);

    function resolvePromptFamily(modelIdOrEntry) {
        if (modelIdOrEntry && typeof modelIdOrEntry === 'object') {
            const fam = String(modelIdOrEntry.promptFamily || '').trim().toLowerCase();
            if (fam === 'galtransl') return 'galtransl';
            if (fam === 'ln-korean' || fam === 'lnkorean' || fam === 'korean') return 'ln-korean';
            if (fam === 'ln-ko2ja' || fam === 'lnko2ja' || fam === 'ko2ja') return 'ln-ko2ja';
            if (fam === 'hymt') return 'hymt';
            if (fam === 'hunyuan' || fam === 'hunyuan-mt') return 'hunyuan';
            if (fam === 'translategemmasub' || fam === 'translate-gemma-sub') return 'translategemmasub';
            if (fam === 'translategemma' || fam === 'translate-gemma') return 'translategemma';
            return 'sakura';
        }
        const entry = findCatalogEntry(modelIdOrEntry);
        if (entry?.promptFamily === 'galtransl') return 'galtransl';
        if (entry?.promptFamily === 'ln-korean') return 'ln-korean';
        if (entry?.promptFamily === 'ln-ko2ja') return 'ln-ko2ja';
        if (entry?.promptFamily === 'hymt') return 'hymt';
        if (entry?.promptFamily === 'hunyuan') return 'hunyuan';
        if (entry?.promptFamily === 'translategemmasub') return 'translategemmasub';
        if (entry?.promptFamily === 'translategemma') return 'translategemma';
        const id = String(modelIdOrEntry || '').trim().toLowerCase();
        if (/galtransl/i.test(id)) return 'galtransl';
        if (/ln[-_]?korean|sakura[-_]?ln[-_]?korean/i.test(id)) return 'ln-korean';
        if (/ln[-_]?ko2ja|sakura[-_]?ln[-_]?ko2ja|ko2ja/i.test(id)) return 'ln-ko2ja';
        if (/hunyuan.*chimera|chimera.*abliterat|^hunyuan-mt|hy-?mt1\.?5|hy-?mt15/i.test(id)) return 'hunyuan';
        if (/^hy-?mt2/i.test(id)) return 'hymt';
        if (/translategemma-.*-sub|translate[-_]?gemma[-_]?4[-_]?sub|translategemmasub/i.test(id)) {
            return 'translategemmasub';
        }
        if (/translategemma|translate[-_]?gemma/i.test(id)) return 'translategemma';
        return 'sakura';
    }

    /**
     * Fixed source→target for pair specialists. null = multilingual / general.
     * @param {string|object} modelIdOrEntry
     * @returns {{ source: string, target: string }|null}
     */
    function resolveMtPair(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        const raw = String(entry?.mtPair || '').trim().toLowerCase();
        if (raw.includes('|')) {
            const [source, target] = raw.split('|').map((x) => String(x || '').trim());
            if (source && target) return { source, target };
        }
        const src = String(entry?.sourceLang || '').trim().toLowerCase();
        const tgt = String(entry?.targetLang || '').trim().toLowerCase();
        if (src && tgt) return { source: src, target: tgt };
        const fam = resolvePromptFamily(entry || modelIdOrEntry);
        if (fam === 'ln-korean') return { source: 'ko', target: 'zh' };
        if (fam === 'ln-ko2ja') return { source: 'ko', target: 'ja' };
        if (fam === 'galtransl' || fam === 'hymt' || fam === 'sakura') {
            const id = String(
                (entry && entry.id) || (typeof modelIdOrEntry === 'string' ? modelIdOrEntry : '') || '',
            ).trim();
            if (!id && !entry) return null;
            if (/translategemma|translate[-_]?gemma|hunyuan|chimera/i.test(id)) return null;
            return { source: 'ja', target: 'zh' };
        }
        return null;
    }

    /** JA→ZH specialized MT (Sakura / Gal / Hy-MT). TranslateGemma / Hunyuan Chimera / KO packs excluded. */
    function isJaZhOnlyMtModel(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (/translategemma|translate[-_]?gemma/i.test(id)) return false;
        if (/hunyuan|chimera/i.test(id)) return false;
        const pair = resolveMtPair(id);
        if (pair && (pair.source !== 'ja' || pair.target !== 'zh')) return false;
        const fam = resolvePromptFamily(id);
        if (fam === 'translategemma' || fam === 'translategemmasub' || fam === 'hunyuan') return false;
        if (fam === 'ln-korean' || fam === 'ln-ko2ja') return false;
        if (fam === 'galtransl' || fam === 'hymt' || fam === 'sakura') {
            return !!findCatalogEntry(id)
                || /^sakura-/i.test(id)
                || /galtransl/i.test(id)
                || /^hy-?mt2/i.test(id);
        }
        return false;
    }

    /** Any fixed-pair specialist in the sakura-gguf catalog (JA→ZH / KO→ZH / KO→JA). */
    function isPairSpecialistMtModel(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (isJaZhOnlyMtModel(id)) return true;
        const fam = resolvePromptFamily(id);
        return fam === 'ln-korean' || fam === 'ln-ko2ja';
    }

    /**
     * @param {string} modelId
     * @param {string} [sourceLang] normalized ja/en/ko/zh or empty
     * @param {string} [targetCode] zh/en/ja/ko
     */
    function mtModelSupportsPair(modelId, sourceLang, targetCode) {
        const id = String(modelId || '').trim();
        if (!id) return true;
        const fam = resolvePromptFamily(id);
        if (fam === 'translategemma' || fam === 'translategemmasub' || fam === 'hunyuan') return true;
        const pair = resolveMtPair(id);
        if (!pair) return true;
        const tgt = String(targetCode || '').trim().toLowerCase().split(/[-_]/)[0];
        if (tgt && pair.target !== tgt) return false;
        const src = String(sourceLang || '').trim().toLowerCase().split(/[-_]/)[0];
        if (!src || src === 'auto' || src === 'unknown') {
            // Unknown/auto source: only default JA→ZH packs (legacy film assumption).
            return pair.source === 'ja';
        }
        return pair.source === src;
    }

    /**
     * Chunk progress verb for llama-server sentence MT logs.
     * Smart-translate hybrid wraps these with the model name — use neutral 「分块」 there.
     * @param {string} modelId
     * @param {{ engineExternalMt?: boolean }} [options]
     */
    function mtChunkProgressLabel(modelId, options = {}) {
        if (options.engineExternalMt) return '分块';
        const id = String(modelId || '').trim();
        const fam = resolvePromptFamily(id);
        if (fam === 'hymt') return 'Hy-MT2 翻译';
        if (fam === 'hunyuan') return 'Hunyuan MT 翻译';
        if (fam === 'galtransl') return 'GalTransl 翻译';
        if (fam === 'ln-korean') return 'LN-Korean 翻译';
        if (fam === 'ln-ko2ja') return 'LN-ko2ja 翻译';
        if (fam === 'translategemmasub') return 'TG Sub 翻译';
        if (fam === 'translategemma') return 'TranslateGemma 翻译';
        // Mode name is 推理翻译; do not surface the legacy Sakura brand as the feature label.
        if (fam === 'sakura') return '推理翻译';
        const entry = findCatalogEntry(id);
        if (entry?.familyLabel) return `${entry.familyLabel} 翻译`;
        return '句级翻译';
    }

    /** Summary tail after a sentence-MT run (e.g. 「Hy-MT2 已译 40 条」). */
    function mtDoneSummaryLabel(modelId, options = {}) {
        if (options.engineExternalMt) return '句级已译';
        return mtChunkProgressLabel(modelId, options).replace(/\s*翻译$/, '') + ' 已译';
    }

    function listCatalog() {
        return CATALOG.map((m) => ({ ...m }));
    }

    function findCatalogEntry(modelIdOrFile) {
        const want = String(modelIdOrFile || '').trim().toLowerCase();
        if (!want) return null;
        return CATALOG.find((m) => (
            m.id.toLowerCase() === want
            || String(m.fileName || '').toLowerCase() === want
        )) || null;
    }

    /** 推测解码草稿（draftModelId 通常指向 managed catalog 中的小模型）。 */
    function resolveDraftModelEntry(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        const draftId = String(entry?.draftModelId || '').trim();
        if (!draftId) return null;
        const local = findCatalogEntry(draftId);
        if (local) return local;
        try {
            const managed = require('./advanced-managed-llm-catalog-core');
            return managed.findCatalogEntry(draftId);
        } catch (_) {
            return null;
        }
    }

    function isSakuraMtModel(modelId) {
        return !!findCatalogEntry(modelId);
    }

    /**
     * Engine Opus / classical MT model ids (not LLM inference).
     * @param {string} modelId
     * @returns {boolean}
     */
    function isEngineOpusMtModel(modelId) {
        const id = String(modelId || '').trim().toLowerCase();
        if (!id) return false;
        return /^opus[-_]?mt[-_]/i.test(id) || id.includes('opus-mt-');
    }

    /**
     * ASR / VAD / aligner ids must never count as LLM inference MT.
     * Broad prefixes like /^qwen/ would otherwise match qwen3-asr-*.
     * @param {string} modelId
     * @returns {boolean}
     */
    function isNonTranslateEngineModelId(modelId) {
        const id = String(modelId || '').trim().toLowerCase();
        if (!id) return false;
        if (/(^|[-_])asr([-_]|$)/i.test(id)) return true;
        if (/forced[-_]?aligner/i.test(id)) return true;
        if (/^(whisper|sensevoice|reazon|parakeet|anime-whisper|kotoba|cohere-transcribe|firered|fsmn|silero|whisperseg)/i.test(id)) {
            return true;
        }
        if (/(^|[-_])(vad|demucs)([-_]|$)/i.test(id)) return true;
        return false;
    }

    /**
     * LLM inference MT (Sakura today; other local LLM MT ids later).
     * Anything that is not Opus classical MT counts as inference MT when selected.
     * @param {string} modelId
     * @returns {boolean}
     */
    function isLlmInferenceMtModel(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (isEngineOpusMtModel(id)) return false;
        if (isNonTranslateEngineModelId(id)) return false;
        if (isSakuraMtModel(id)) return true;
        // Managed GGUF catalog ids (qwen25-7b, llama32-3b, …) + future backends
        if (/^(sakura|hy-?mt|hunyuan|translategemma|qwen|llama|mistral|gemma|chatglm|glm|yi-|deepseek|phi)/i.test(id)) return true;
        if (/gguf|llm|instruct/i.test(id)) return true;
        return false;
    }

    /**
     * Normalize translate-mode tokens. Legacy UI used `sakura` for 推理翻译.
     * `engine` (Opus 机器翻译) is retired → `llm`.
     * Persisted: `smart` = 混合翻译; `dialog` = 智能翻译; `hybrid`/`advanced`/`mixed` → smart.
     * @param {string} mode
     * @returns {'smart'|'dialog'|'llm'}
     */
    function normalizeTranslateMode(mode) {
        const m = String(mode || '').trim().toLowerCase();
        if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
        if (m === 'smart' || m === 'advanced' || m === 'hybrid' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'sakura' || m === 'engine' || m === 'llm') return 'llm';
        return 'llm';
    }

    function isProTranslateMode(mode) {
        const m = normalizeTranslateMode(mode);
        return m === 'smart' || m === 'dialog';
    }

    function isExternalTranslateMode(mode) {
        return normalizeTranslateMode(mode) === 'external';
    }

    /**
     * User-facing label for 设置 → 翻译方式.
     * Modes: 推理 | 外部(BYOK) | 智能(Pro) | 混合(Pro).
     * @param {string} mode
     * @returns {string}
     */
    function translateModeLabel(mode, { short = false } = {}) {
        const m = normalizeTranslateMode(mode);
        if (m === 'smart') return short ? '混合' : '混合翻译';
        if (m === 'dialog') return short ? '智能' : '智能翻译';
        if (m === 'external') return short ? '外部' : '外部翻译';
        return short ? '推理' : '推理翻译';
    }

    /**
     * Same mode mapping as 设置 → 翻译方式.
     * Prefer explicit `translateMode` when present (persisted by settings save).
     * Opus / `engine` mode is retired → always `llm` (or Pro / external modes).
     * @param {object} [options]
     * @returns {'smart'|'dialog'|'external'|'llm'}
     */
    function resolveTranslateModeFromOptions(options = {}) {
        const explicit = options?.translateMode != null && String(options.translateMode).trim() !== ''
            ? normalizeTranslateMode(options.translateMode)
            : null;
        if (explicit) return explicit;
        if (options?.smartTranslate) {
            return options?.smartTranslateHybridMt === false ? 'dialog' : 'smart';
        }
        return 'llm';
    }

    function toEngineListItem(entry, { installed = false } = {}) {
        if (!entry) return null;
        return {
            id: entry.id,
            kind: 'mt',
            name: entry.name,
            description: entry.note || '',
            hub_id: '',
            local_dirname: entry.id,
            size_hint_mb: entry.size_hint_mb || 0,
            languages: entry.languages || ['ja', 'zh'],
            backend: 'sakura-gguf',
            installed: !!installed,
            incomplete: false,
            bundled: false,
            path: '',
        };
    }

    const SMART_ENGINE_BATCH_SIZE = 40;
    const DEFAULT_SAKURA_ENGINE_BATCH_SIZE = 16;

    /**
     * Retired local-only Transub-JA test GGUFs — remap saved settings to Sakura default.
     * @param {string} modelId
     * @returns {boolean}
     */
    function isRetiredTransubJaModelId(modelId) {
        return /^transub-ja/i.test(String(modelId || '').trim());
    }

    /**
     * @param {string} modelId
     * @param {string} [fallback]
     * @returns {string}
     */
    function remapRetiredMtModelId(modelId, fallback = DEFAULT_MODEL_ID) {
        const id = String(modelId || '').trim();
        if (!id) return '';
        if (isRetiredTransubJaModelId(id)) return String(fallback || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
        return id;
    }

    /**
     * Engine → adapter HTTP cue batch. Larger than llama window (still ~8 lines)
     * so -np slots can run several windows per POST. Smart stays 40.
     * @param {{ smartTranslate?: boolean, mode?: string, modelId?: string, engineMtModel?: string, paramBillion?: number }} [input]
     * @returns {number}
     */
    function resolveLlmMtEngineBatchSize(input = {}) {
        const mode = String(input.mode || '').trim().toLowerCase();
        if (input.smartTranslate === true || isProTranslateMode(mode)) {
            return SMART_ENGINE_BATCH_SIZE;
        }
        let billion = Number(input.paramBillion);
        if (!Number.isFinite(billion) || billion <= 0) {
            const entry = findCatalogEntry(input.modelId || input.engineMtModel);
            billion = Number(entry?.paramBillion);
        }
        if (Number.isFinite(billion) && billion > 0) {
            if (billion <= 2) return 32;
            if (billion <= 4.5) return 24;
            if (billion <= 8) return 16;
            return 8;
        }
        return DEFAULT_SAKURA_ENGINE_BATCH_SIZE;
    }

    return {
        DEFAULT_MODEL_ID,
        CATALOG,
        SMART_ENGINE_BATCH_SIZE,
        DEFAULT_SAKURA_ENGINE_BATCH_SIZE,
        listCatalog,
        findCatalogEntry,
        resolveDraftModelEntry,
        resolvePromptFamily,
        resolveMtPair,
        isJaZhOnlyMtModel,
        isPairSpecialistMtModel,
        mtModelSupportsPair,
        mtChunkProgressLabel,
        mtDoneSummaryLabel,
        isSakuraMtModel,
        isEngineOpusMtModel,
        isNonTranslateEngineModelId,
        isLlmInferenceMtModel,
        isRetiredTransubJaModelId,
        remapRetiredMtModelId,
        normalizeTranslateMode,
        isProTranslateMode,
        isExternalTranslateMode,
        translateModeLabel,
        resolveTranslateModeFromOptions,
        toEngineListItem,
        resolveLlmMtEngineBatchSize,
    };
}));
