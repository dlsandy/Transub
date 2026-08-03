/**
 * Advanced 软件内模型目录（GGUF + llama-server）
 * 纯数据，无网络。
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAdvancedManagedLlmCatalog = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function advancedManagedLlmCatalogFactory() {
    const DEFAULT_SERVER_PORT = 39281;
    const LLAMA_CPP_TAG = 'b10236';
    const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
    const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
    /** 免费管线翻译：软件内白名单模型参数量上限（十亿） */
    const FREE_PIPELINE_TRANSLATE_MAX_B = 7;

    function loadSakuraSourceCatalog() {
        try {
            if (typeof require === 'function') {
                return require('./sakura-mt-catalog-core').listCatalog();
            }
        } catch (_) { /* ignore */ }
        try {
            const g = typeof globalThis !== 'undefined' ? globalThis : null;
            if (g?.TransubSakuraMtCatalog?.listCatalog) {
                return g.TransubSakuraMtCatalog.listCatalog();
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    /** Derive Advanced catalog rows from the shared Sakura MT catalog (single source of truth for URLs/files). */
    function buildSakuraManagedEntries() {
        const source = loadSakuraSourceCatalog();
        if (Array.isArray(source) && source.length) {
            return source.map((e) => ({
                id: e.id,
                name: e.name,
                family: 'sakura',
                familyLabel: 'SakuraLLM',
                fileName: e.fileName,
                ggufUrl: e.ggufUrl,
                sizeHint: e.sizeHint,
                sizeBytes: e.sizeBytes,
                ramHint: e.ramHint,
                note: `${e.note || '日→简中'}；免费管线翻译可用；不适合语境/影片理解重构`,
                paramBillion: /7b/i.test(String(e.id)) ? 7 : 1.5,
                freePipelineTranslate: true,
                translateOnly: true,
                recommended: false,
            }));
        }
        return [
            {
                id: 'sakura-1.5b',
                name: 'Sakura 1.5B（默认）',
                family: 'sakura',
                familyLabel: 'SakuraLLM',
                fileName: 'sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
                ggufUrl: 'https://huggingface.co/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/resolve/main/sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
                sizeHint: '约 1.2 GB',
                sizeBytes: 1259173504,
                ramHint: '建议 ≥4 GB 内存',
                note: '日→简中 · 免费轻量；仅翻译专用，不适合语境/影片理解重构；CC-BY-NC-SA',
                paramBillion: 1.5,
                freePipelineTranslate: true,
                translateOnly: true,
                recommended: false,
            },
            {
                id: 'sakura-7b',
                name: 'Sakura 7B',
                family: 'sakura',
                familyLabel: 'SakuraLLM',
                fileName: 'sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
                ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-7B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
                sizeHint: '约 4.3 GB',
                sizeBytes: 4250298208,
                ramHint: '建议 ≥8 GB 内存 / 显存',
                note: '日→简中 · 质量更好；仅翻译专用，不适合语境/影片理解重构；CC-BY-NC-SA',
                paramBillion: 7,
                freePipelineTranslate: true,
                translateOnly: true,
                recommended: false,
            },
        ];
    }

    /**
     * 固定版本的 llama.cpp 预编译包。
     * Windows x64：静态回退为 Vulkan；有 NVIDIA 时由 preferCuda + 驱动 CUDA 主版本选默认：
     * CUDA ≥13 → CUDA 13；CUDA ≥12 → CUDA 12。
     */
    const WIN_VULKAN_X64 = Object.freeze({
        id: 'win-vulkan-x64',
        label: 'Windows x64 · Vulkan',
        backend: 'vulkan',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-vulkan-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 32 MB',
        note: '兼容多数 GPU，无需单独安装 CUDA',
    });
    const WIN_CUDA12_X64 = Object.freeze({
        id: 'win-cuda12-x64',
        label: 'Windows x64 · CUDA 12（NVIDIA）',
        backend: 'cuda',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-cuda-12.4-x64.zip`,
        /** 官方 CUDA 运行库 DLL，需解压到与 llama-server 同目录 */
        companionUrl: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 630 MB（含 CUDA 运行库）',
        note: '需 NVIDIA 驱动（CUDA 12+）；通常比 Vulkan 更快',
    });
    const WIN_CUDA13_X64 = Object.freeze({
        id: 'win-cuda13-x64',
        label: 'Windows x64 · CUDA 13（NVIDIA）',
        backend: 'cuda',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-cuda-13.3-x64.zip`,
        companionUrl: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/cudart-llama-bin-win-cuda-13.3-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 540 MB（含 CUDA 运行库）',
        note: '需较新 NVIDIA 驱动（CUDA 13+）；通常比 CUDA 12 / Vulkan 更快',
    });

    /** 平台默认包（向后兼容 RUNTIME_PACKAGES[platformKey]） */
    const RUNTIME_PACKAGES = Object.freeze({
        'win32-x64': WIN_VULKAN_X64,
        'win32-arm64': Object.freeze({
            id: 'win-cpu-arm64',
            label: 'Windows arm64 · CPU',
            backend: 'cpu',
            url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-cpu-arm64.zip`,
            archive: 'zip',
            exeName: 'llama-server.exe',
            sizeHint: '约 12 MB',
        }),
        'darwin-arm64': Object.freeze({
            id: 'macos-arm64',
            label: 'macOS Apple Silicon',
            backend: 'metal',
            url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-macos-arm64.tar.gz`,
            archive: 'tar.gz',
            exeName: 'llama-server',
            sizeHint: '约 25 MB',
        }),
        'darwin-x64': Object.freeze({
            id: 'macos-x64',
            label: 'macOS Intel',
            backend: 'cpu',
            url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-macos-x64.tar.gz`,
            archive: 'tar.gz',
            exeName: 'llama-server',
            sizeHint: '约 25 MB',
        }),
        'linux-x64': Object.freeze({
            id: 'ubuntu-vulkan-x64',
            label: 'Linux x64 · Vulkan',
            backend: 'vulkan',
            url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-ubuntu-vulkan-x64.tar.gz`,
            archive: 'tar.gz',
            exeName: 'llama-server',
            sizeHint: '约 31 MB',
        }),
    });

    /** 同平台可选变体（仅列出可切换的；缺省回退 RUNTIME_PACKAGES） */
    const RUNTIME_PACKAGE_VARIANTS = Object.freeze({
        'win32-x64': Object.freeze([WIN_VULKAN_X64, WIN_CUDA12_X64, WIN_CUDA13_X64]),
    });

    /** id → 包（含变体） */
    const RUNTIME_PACKAGE_BY_ID = Object.freeze((() => {
        const map = {};
        for (const pkg of Object.values(RUNTIME_PACKAGES)) {
            if (pkg?.id) map[pkg.id] = pkg;
        }
        for (const list of Object.values(RUNTIME_PACKAGE_VARIANTS)) {
            for (const pkg of list) {
                if (pkg?.id) map[pkg.id] = pkg;
            }
        }
        return map;
    })());

    /**
     * 精选 GGUF（bartowski 量化）。family 用于选择窗口分组筛选。
     * @type {ReadonlyArray<object>}
     */
    const CATALOG = Object.freeze([
        {
            id: 'qwen25-1.5b',
            name: 'Qwen2.5 1.5B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 1.0 GB',
            sizeBytes: 986048768,
            ramHint: '建议 ≥4 GB 内存',
            note: '极轻量中文；免费管线翻译可用；低配机器首选，质量弱于 3B/7B',
            paramBillion: 1.5,
            freePipelineTranslate: true,
            ollamaTag: 'qwen2.5:1.5b',
        },
        {
            id: 'qwen25-3b',
            name: 'Qwen2.5 3B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 1.9 GB',
            sizeBytes: 1932735283,
            ramHint: '建议 ≥6 GB 内存',
            note: '轻量中文；免费管线翻译可用；低配机器可用，质量弱于 7B',
            paramBillion: 3,
            freePipelineTranslate: true,
            ollamaTag: 'qwen2.5:3b',
        },
        {
            id: 'qwen25-7b',
            name: 'Qwen2.5 7B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 4.7 GB',
            sizeBytes: 4683075488,
            ramHint: '建议 ≥8 GB 内存',
            note: '中文首选；免费管线翻译可用；速度与质量均衡',
            paramBillion: 7,
            freePipelineTranslate: true,
            recommended: true,
            ollamaTag: 'qwen2.5:7b',
        },
        {
            id: 'qwen25-14b',
            name: 'Qwen2.5 14B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-14B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 9 GB',
            sizeBytes: 8984584192,
            ramHint: '建议 ≥16 GB 内存',
            note: '质量更好，适合影片理解重构（需 Pro）',
            paramBillion: 14,
            ollamaTag: 'qwen2.5:14b',
        },
        {
            id: 'qwen25-32b',
            name: 'Qwen2.5 32B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 20 GB',
            sizeBytes: 19864223744,
            ramHint: '建议 ≥32 GB 内存 / 大显存',
            note: '高质量中文；需较强硬件与 Pro',
            paramBillion: 32,
            ollamaTag: 'qwen2.5:32b',
        },
        {
            id: 'qwen3-1.7b',
            name: 'Qwen3 1.7B',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf',
            sizeHint: '约 1.3 GB',
            sizeBytes: 1282439584,
            ramHint: '建议 ≥4 GB 内存',
            note: 'Qwen3 极轻量；免费管线翻译可用；支持思考模式，翻译时可关闭 thinking',
            paramBillion: 1.7,
            freePipelineTranslate: true,
            ollamaTag: 'qwen3:1.7b',
        },
        {
            id: 'qwen3-4b',
            name: 'Qwen3 4B Instruct 2507',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2497280736,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Qwen3 Instruct；免费管线翻译可用；中文与指令跟随优于同体量 2.5',
            paramBillion: 4,
            freePipelineTranslate: true,
            ollamaTag: 'qwen3:4b',
        },
        {
            id: 'qwen3-4b-thinking',
            name: 'Qwen3 4B Thinking 2507',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-4B-Thinking-2507-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-Thinking-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Thinking-2507-Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2497280736,
            ramHint: '建议 ≥6 GB 内存',
            note: '偏推理思考；改写可能较啰嗦（不在免费管线白名单）',
            paramBillion: 4,
            freePipelineTranslate: false,
            ollamaTag: 'qwen3:4b-thinking',
        },
        {
            id: 'qwen3-8b',
            name: 'Qwen3 8B',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-8B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/resolve/main/Qwen_Qwen3-8B-Q4_K_M.gguf',
            sizeHint: '约 5.0 GB',
            sizeBytes: 5027784224,
            ramHint: '建议 ≥10 GB 内存',
            note: 'Qwen3 中文与推理更强；适合翻译与影片理解（需 Pro）',
            paramBillion: 8,
            ollamaTag: 'qwen3:8b',
        },
        {
            id: 'qwen3-14b',
            name: 'Qwen3 14B',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-14B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-14B-GGUF/resolve/main/Qwen_Qwen3-14B-Q4_K_M.gguf',
            sizeHint: '约 9.0 GB',
            sizeBytes: 9001753632,
            ramHint: '建议 ≥16 GB 内存',
            note: 'Qwen3 高质量；适合语境重构与复杂翻译（需 Pro）',
            paramBillion: 14,
            ollamaTag: 'qwen3:14b',
        },
        {
            id: 'qwen3-30b-a3b',
            name: 'Qwen3 30B-A3B Instruct 2507',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-30B-A3B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf',
            sizeHint: '约 19 GB',
            sizeBytes: 18632183808,
            ramHint: '建议 ≥24 GB 内存 / 大显存',
            note: 'MoE：总参 30B、激活约 3B，质量高且相对省算力（需 Pro）',
            paramBillion: 30,
            ollamaTag: 'qwen3:30b-a3b',
        },
        {
            id: 'llama32-1b',
            name: 'Llama 3.2 1B Instruct',
            family: 'llama',
            familyLabel: 'Llama',
            fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 0.8 GB',
            sizeBytes: 807694464,
            ramHint: '建议 ≥4 GB 内存',
            note: '极轻量英文；免费管线翻译可用；中文弱于同体量 Qwen',
            paramBillion: 1,
            freePipelineTranslate: true,
            ollamaTag: 'llama3.2:1b',
        },
        {
            id: 'llama32-3b',
            name: 'Llama 3.2 3B Instruct',
            family: 'llama',
            familyLabel: 'Llama',
            fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 2.0 GB',
            sizeBytes: 2018631680,
            ramHint: '建议 ≥6 GB 内存',
            note: '轻量英文；免费管线翻译可用；中文弱于同体量 Qwen',
            paramBillion: 3,
            freePipelineTranslate: true,
            ollamaTag: 'llama3.2:3b',
        },
        {
            id: 'llama31-8b',
            name: 'Llama 3.1 8B Instruct',
            family: 'llama',
            familyLabel: 'Llama',
            fileName: 'Llama-3.1-8B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Llama-3.1-8B-Instruct-GGUF/resolve/main/Llama-3.1-8B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 4.9 GB',
            sizeBytes: 4920000000,
            ramHint: '建议 ≥8 GB 内存',
            note: '通用英文较强，中文略逊于 Qwen（需 Pro）',
            paramBillion: 8,
            ollamaTag: 'llama3.1:8b',
        },
        {
            id: 'gemma2-2b',
            name: 'Gemma 2 2B Instruct',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'gemma-2-2b-it-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
            sizeHint: '约 1.7 GB',
            sizeBytes: 1708582752,
            ramHint: '建议 ≥4 GB 内存',
            note: '轻量英文；免费管线翻译可用；中文一般',
            paramBillion: 2,
            freePipelineTranslate: true,
            ollamaTag: 'gemma2:2b',
        },
        {
            id: 'gemma2-9b',
            name: 'Gemma 2 9B Instruct',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'gemma-2-9b-it-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf',
            sizeHint: '约 5.8 GB',
            sizeBytes: 5767168000,
            ramHint: '建议 ≥12 GB 内存',
            note: '英文指令跟随好；中文一般（需 Pro）',
            paramBillion: 9,
            ollamaTag: 'gemma2:9b',
        },
        {
            id: 'gemma3-4b',
            name: 'Gemma 3 4B Instruct',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'google_gemma-3-4b-it-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2489758112,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Gemma3 轻量；免费管线翻译可用；多语优于 Gemma2',
            paramBillion: 4,
            freePipelineTranslate: true,
            ollamaTag: 'gemma3:4b',
        },
        {
            id: 'gemma3-12b',
            name: 'Gemma 3 12B Instruct',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'google_gemma-3-12b-it-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/google_gemma-3-12b-it-GGUF/resolve/main/google_gemma-3-12b-it-Q4_K_M.gguf',
            sizeHint: '约 7.3 GB',
            sizeBytes: 7300575264,
            ramHint: '建议 ≥16 GB 内存',
            note: 'Gemma3 中等体量；英文与多语较强（需 Pro）',
            paramBillion: 12,
            ollamaTag: 'gemma3:12b',
        },
        {
            id: 'phi35-mini',
            name: 'Phi-3.5 Mini Instruct',
            family: 'phi',
            familyLabel: 'Phi',
            fileName: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
            sizeHint: '约 2.4 GB',
            sizeBytes: 2399141888,
            ramHint: '建议 ≥6 GB 内存',
            note: '微软小模型，推理快；免费管线翻译可用；中文一般',
            paramBillion: 3.8,
            freePipelineTranslate: true,
            ollamaTag: 'phi3.5',
        },
        {
            id: 'phi4-mini',
            name: 'Phi-4 Mini Instruct',
            family: 'phi',
            familyLabel: 'Phi',
            fileName: 'microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2491874688,
            ramHint: '建议 ≥6 GB 内存',
            note: '微软 Phi-4 小模型；免费管线翻译可用；推理优于 3.5',
            paramBillion: 3.8,
            freePipelineTranslate: true,
            ollamaTag: 'phi4-mini',
        },
        {
            id: 'mistral-nemo-12b',
            name: 'Mistral Nemo 12B Instruct',
            family: 'mistral',
            familyLabel: 'Mistral',
            fileName: 'Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF/resolve/main/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
            sizeHint: '约 7.5 GB',
            sizeBytes: 7516192768,
            ramHint: '建议 ≥16 GB 内存',
            note: '长上下文友好；中文中等（需 Pro）',
            paramBillion: 12,
            ollamaTag: 'mistral-nemo',
        },
        {
            id: 'deepseek-r1-7b',
            name: 'DeepSeek R1 Distill Qwen 7B',
            family: 'deepseek',
            familyLabel: 'DeepSeek',
            fileName: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
            sizeHint: '约 4.7 GB',
            sizeBytes: 4683075488,
            ramHint: '建议 ≥8 GB 内存',
            note: '偏推理；改写时可能较啰嗦（不在免费管线白名单）',
            paramBillion: 7,
            freePipelineTranslate: false,
            ollamaTag: 'deepseek-r1:7b',
        },
        {
            id: 'deepseek-r1-llama-8b',
            name: 'DeepSeek R1 Distill Llama 8B',
            family: 'deepseek',
            familyLabel: 'DeepSeek',
            fileName: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
            sizeHint: '约 4.9 GB',
            sizeBytes: 4920736608,
            ramHint: '建议 ≥10 GB 内存',
            note: 'Llama 蒸馏推理版；英文推理强，中文略逊于 Qwen 蒸馏（需 Pro）',
            paramBillion: 8,
            freePipelineTranslate: false,
            ollamaTag: 'deepseek-r1:8b',
        },
        {
            id: 'deepseek-r1-14b',
            name: 'DeepSeek R1 Distill Qwen 14B',
            family: 'deepseek',
            familyLabel: 'DeepSeek',
            fileName: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
            sizeHint: '约 9 GB',
            sizeBytes: 8984584192,
            ramHint: '建议 ≥16 GB 内存',
            note: '更强推理蒸馏版；速度慢于同体量 Instruct（需 Pro）',
            paramBillion: 14,
            ollamaTag: 'deepseek-r1:14b',
        },
        {
            id: 'deepseek-r1-32b',
            name: 'DeepSeek R1 Distill Qwen 32B',
            family: 'deepseek',
            familyLabel: 'DeepSeek',
            fileName: 'DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
            sizeHint: '约 20 GB',
            sizeBytes: 19851335840,
            ramHint: '建议 ≥32 GB 内存 / 大显存',
            note: '高强度推理蒸馏；适合复杂语境分析（需 Pro 与较强硬件）',
            paramBillion: 32,
            freePipelineTranslate: false,
            ollamaTag: 'deepseek-r1:32b',
        },
        {
            id: 'qwen25-coder-7b',
            name: 'Qwen2.5 Coder 7B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 4.7 GB',
            sizeBytes: 4683075488,
            ramHint: '建议 ≥8 GB 内存',
            note: '偏代码；不在免费管线白名单；一般字幕请优先选 Instruct 版',
            paramBillion: 7,
            freePipelineTranslate: false,
            ollamaTag: 'qwen2.5-coder:7b',
        },
        {
            id: 'mistral-small-24b',
            name: 'Mistral Small 24B Instruct 2501',
            family: 'mistral',
            familyLabel: 'Mistral',
            fileName: 'Mistral-Small-24B-Instruct-2501-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Mistral-Small-24B-Instruct-2501-GGUF/resolve/main/Mistral-Small-24B-Instruct-2501-Q4_K_M.gguf',
            sizeHint: '约 14 GB',
            sizeBytes: 14333908672,
            ramHint: '建议 ≥24 GB 内存',
            note: 'Pro 大型；长上下文与指令跟随强；中文中等',
            paramBillion: 24,
            freePipelineTranslate: false,
            ollamaTag: 'mistral-small:24b',
        },
        {
            id: 'gemma3-27b',
            name: 'Gemma 3 27B Instruct',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'google_gemma-3-27b-it-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/google_gemma-3-27b-it-GGUF/resolve/main/google_gemma-3-27b-it-Q4_K_M.gguf',
            sizeHint: '约 17 GB',
            sizeBytes: 16546404992,
            ramHint: '建议 ≥24 GB 内存',
            note: 'Pro 大型；Gemma3 多语更强；需较强硬件',
            paramBillion: 27,
            freePipelineTranslate: false,
            ollamaTag: 'gemma3:27b',
        },
        {
            id: 'qwen3-32b',
            name: 'Qwen3 32B',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3-32B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3-32B-GGUF/resolve/main/Qwen_Qwen3-32B-Q4_K_M.gguf',
            sizeHint: '约 20 GB',
            sizeBytes: 19762149696,
            ramHint: '建议 ≥32 GB 内存 / 大显存',
            note: 'Pro 大型；Qwen3 高质量中文与推理；适合复杂重构',
            paramBillion: 32,
            freePipelineTranslate: false,
            ollamaTag: 'qwen3:32b',
        },
        {
            id: 'qwen25-72b',
            name: 'Qwen2.5 72B Instruct',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen2.5-72B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen2.5-72B-Instruct-GGUF/resolve/main/Qwen2.5-72B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 47 GB',
            sizeBytes: 47415715488,
            ramHint: '建议 ≥64 GB 内存 / 大显存',
            note: 'Pro 旗舰体量；中文质量顶尖；仅高配机器',
            paramBillion: 72,
            freePipelineTranslate: false,
            ollamaTag: 'qwen2.5:72b',
        },
        {
            id: 'llama33-70b',
            name: 'Llama 3.3 70B Instruct',
            family: 'llama',
            familyLabel: 'Llama',
            fileName: 'Llama-3.3-70B-Instruct-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf',
            sizeHint: '约 43 GB',
            sizeBytes: 42520398816,
            ramHint: '建议 ≥64 GB 内存 / 大显存',
            note: 'Pro 旗舰体量；英文极强；中文略逊于同级 Qwen',
            paramBillion: 70,
            freePipelineTranslate: false,
            ollamaTag: 'llama3.3:70b',
        },
        ...buildSakuraManagedEntries(),
    ]);

    function detectPlatform() {
        try {
            if (typeof process !== 'undefined' && process.platform) return process.platform;
        } catch (_) { /* ignore */ }
        return 'win32';
    }

    function detectArch() {
        try {
            if (typeof process !== 'undefined' && process.arch) return process.arch;
        } catch (_) { /* ignore */ }
        return 'x64';
    }

    function platformKey(platform = detectPlatform(), arch = detectArch()) {
        return `${platform}-${arch}`;
    }

    function parseCudaMajor(hints = {}) {
        const major = Number(String(hints?.cudaVersion || '').split('.')[0]);
        return Number.isFinite(major) ? major : 0;
    }

    /**
     * @param {string} [platform]
     * @param {string} [arch]
     * @param {{ preferCuda?: boolean, cudaVersion?: string }} [hints]
     */
    function getDefaultRuntimeId(platform = detectPlatform(), arch = detectArch(), hints = {}) {
        const key = platformKey(platform, arch);
        if (key === 'win32-x64' && hints && hints.preferCuda) {
            const major = parseCudaMajor(hints);
            if (major >= 13 && RUNTIME_PACKAGE_BY_ID['win-cuda13-x64']) {
                return 'win-cuda13-x64';
            }
            if (RUNTIME_PACKAGE_BY_ID['win-cuda12-x64']) {
                return 'win-cuda12-x64';
            }
        }
        return RUNTIME_PACKAGES[key]?.id || '';
    }

    function listRuntimePackages(platform = detectPlatform(), arch = detectArch(), hints = {}) {
        const key = platformKey(platform, arch);
        const variants = RUNTIME_PACKAGE_VARIANTS[key];
        let list;
        if (Array.isArray(variants) && variants.length) {
            list = variants.map((p) => ({ ...p }));
        } else {
            const def = RUNTIME_PACKAGES[key];
            list = def ? [{ ...def }] : [];
        }
        if (hints && hints.preferCuda && key === 'win32-x64' && list.length > 1) {
            const preferredId = getDefaultRuntimeId(platform, arch, hints);
            list.sort((a, b) => {
                if (a.id === preferredId) return -1;
                if (b.id === preferredId) return 1;
                const ac = a.backend === 'cuda' ? 0 : 1;
                const bc = b.backend === 'cuda' ? 0 : 1;
                if (ac !== bc) return ac - bc;
                const am = Number((/cuda(\d+)/i.exec(String(a.id || '')) || [])[1] || 0);
                const bm = Number((/cuda(\d+)/i.exec(String(b.id || '')) || [])[1] || 0);
                return bm - am;
            });
        }
        return list;
    }

    /**
     * @param {string} [platform]
     * @param {string} [arch]
     * @param {string} [runtimeId] 偏好包 id（如 win-cuda12-x64 / win-cuda13-x64）；无效则回退平台默认
     * @param {{ preferCuda?: boolean, cudaVersion?: string }} [hints]
     */
    function getRuntimePackage(platform = detectPlatform(), arch = detectArch(), runtimeId = '', hints = {}) {
        const key = platformKey(platform, arch);
        const want = String(runtimeId || '').trim();
        if (want) {
            const byId = RUNTIME_PACKAGE_BY_ID[want];
            if (byId) {
                const variants = RUNTIME_PACKAGE_VARIANTS[key];
                if (Array.isArray(variants) && variants.some((p) => p.id === want)) {
                    return byId;
                }
                // 非本平台变体：仅当恰好是平台默认 id 时返回
                if (RUNTIME_PACKAGES[key]?.id === want) return byId;
            }
        }
        const defaultId = getDefaultRuntimeId(platform, arch, hints);
        if (defaultId && RUNTIME_PACKAGE_BY_ID[defaultId]) {
            return RUNTIME_PACKAGE_BY_ID[defaultId];
        }
        return RUNTIME_PACKAGES[key] || null;
    }

    /** 规范化运行时偏好；空/非法 → 平台默认 id（preferCuda 时按驱动 CUDA 主版本选 13/12） */
    function normalizeRuntimeId(runtimeId, platform = detectPlatform(), arch = detectArch(), hints = {}) {
        const pkg = getRuntimePackage(platform, arch, runtimeId, hints);
        return pkg?.id || '';
    }

    function listCatalog() {
        return CATALOG.map((m) => ({ ...m }));
    }

    /**
     * 规格档位：轻量 ≤7B / 中等 8–16B / 大型 ≥17B（供 Pro 目录筛选）。
     * @returns {'light'|'mid'|'large'}
     */
    function getModelScaleTier(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        const b = Number(entry?.paramBillion);
        if (!Number.isFinite(b) || b <= 0) return 'mid';
        if (b <= FREE_PIPELINE_TRANSLATE_MAX_B) return 'light';
        if (b <= 16) return 'mid';
        return 'large';
    }

    /**
     * Pro 规格目录项：非免费白名单、非翻译专用（Sakura）。
     * 未解锁 Pro 时不在选择/下载列表中展示。
     */
    function isProScaleModel(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        if (!entry) return false;
        if (isTranslateOnlyModel(entry)) return false;
        if (isFreePipelineTranslateModel(entry)) return false;
        return true;
    }

    /**
     * 按许可可见的模型目录。
     * @param {{ entitled?: boolean, alwaysIncludeIds?: string[] }} [options]
     */
    function listCatalogVisible(options = {}) {
        const entitled = !!options.entitled;
        const always = new Set(
            (Array.isArray(options.alwaysIncludeIds) ? options.alwaysIncludeIds : [])
                .map((x) => String(x || '').trim().toLowerCase())
                .filter(Boolean),
        );
        return CATALOG
            .filter((m) => {
                if (entitled) return true;
                if (always.has(String(m.id || '').toLowerCase())) return true;
                return !isProScaleModel(m);
            })
            .map((m) => ({
                ...m,
                proScale: isProScaleModel(m),
                scaleTier: getModelScaleTier(m),
            }));
    }

    function listFamilies(entries = CATALOG) {
        const list = Array.isArray(entries) ? entries : CATALOG;
        const seen = new Map();
        for (const m of list) {
            const id = String(m.family || 'other');
            if (seen.has(id)) continue;
            seen.set(id, {
                id,
                label: String(m.familyLabel || id),
            });
        }
        return Array.from(seen.values());
    }

    function findCatalogEntry(modelIdOrTag) {
        const want = String(modelIdOrTag || '').trim().toLowerCase();
        if (!want) return null;
        return CATALOG.find((m) => (
            m.id.toLowerCase() === want
            || String(m.ollamaTag || '').toLowerCase() === want
            || String(m.fileName || '').toLowerCase() === want
        )) || null;
    }

    function emptyManagedLlm() {
        return {
            /** LLM 推理 / 重构（语境、影片理解、语义审阅） */
            activeModelId: '',
            /** 智能翻译；空则回退 activeModelId */
            smartTranslateModelId: '',
            serverPort: DEFAULT_SERVER_PORT,
            /** @deprecated 兼容旧配置；软件内模型已改为 llama-server */
            ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
            pulledIds: [],
            runtimeId: '',
            nGpuLayers: 99,
            contextSize: 8192,
        };
    }

    /** 智能翻译实际使用的模型 id（未单独配置或配置为翻译专用时回退推理模型） */
    function resolveSmartTranslateModelId(managedOrDoc) {
        const managed = managedOrDoc && typeof managedOrDoc === 'object' && managedOrDoc.managedLlm
            ? normalizeManagedLlm(managedOrDoc.managedLlm)
            : normalizeManagedLlm(managedOrDoc);
        const smart = String(managed.smartTranslateModelId || '').trim();
        const active = String(managed.activeModelId || '').trim();
        // Sakura / translate-only cannot do 影片简要 + JSON cue protocol.
        if (smart && !isTranslateOnlyModel(smart)) return smart;
        if (active && !isTranslateOnlyModel(active)) return active;
        return smart || active;
    }

    /**
     * @returns {{ modelId: string, requestedId: string, fallbackFrom: string }}
     */
    function resolveSmartTranslateModelChoice(managedOrDoc) {
        const managed = managedOrDoc && typeof managedOrDoc === 'object' && managedOrDoc.managedLlm
            ? normalizeManagedLlm(managedOrDoc.managedLlm)
            : normalizeManagedLlm(managedOrDoc);
        const requested = String(managed.smartTranslateModelId || managed.activeModelId || '').trim();
        const modelId = resolveSmartTranslateModelId(managed);
        const fallbackFrom = (requested && modelId && requested !== modelId) ? requested : '';
        return { modelId, requestedId: requested, fallbackFrom };
    }

    /**
     * @param {object} [raw]
     * @param {{ preferCuda?: boolean, cudaVersion?: string }} [hints]
     */
    function normalizeManagedLlm(raw, hints = {}) {
        const base = emptyManagedLlm();
        if (!raw || typeof raw !== 'object') {
            return {
                ...base,
                runtimeId: normalizeRuntimeId('', detectPlatform(), detectArch(), hints),
            };
        }
        const pulledRaw = Array.isArray(raw.pulledIds)
            ? raw.pulledIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const pulled = [];
        const seen = new Set();
        for (const id of pulledRaw) {
            if (seen.has(id)) continue;
            seen.add(id);
            pulled.push(id);
            if (pulled.length >= 64) break;
        }
        const port = Number(raw.serverPort);
        const nGpu = Number(raw.nGpuLayers);
        const ctx = Number(raw.contextSize);
        return {
            activeModelId: String(raw.activeModelId || '').trim().slice(0, 64),
            smartTranslateModelId: String(raw.smartTranslateModelId || '').trim().slice(0, 64),
            serverPort: Number.isFinite(port) && port >= 1024 && port <= 65535
                ? Math.round(port)
                : DEFAULT_SERVER_PORT,
            ollamaBaseUrl: String(raw.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL).trim() || DEFAULT_OLLAMA_BASE_URL,
            pulledIds: pulled,
            runtimeId: normalizeRuntimeId(
                String(raw.runtimeId || '').trim().slice(0, 64),
                detectPlatform(),
                detectArch(),
                hints,
            ),
            nGpuLayers: Number.isFinite(nGpu) ? Math.max(0, Math.min(999, Math.round(nGpu))) : 99,
            contextSize: Number.isFinite(ctx) ? Math.max(512, Math.min(131072, Math.round(ctx))) : 8192,
        };
    }

    function normalizeLlmSource(value) {
        const v = String(value || '').trim().toLowerCase();
        return v === 'managed' ? 'managed' : 'byok';
    }

    /** 从 ramHint 如「建议 ≥16 GB 内存」解析最小 GB。 */
    function parseMinRamGbFromHint(ramHint) {
        const s = String(ramHint || '');
        const m = s.match(/(?:≥|>=)\s*(\d+(?:\.\d+)?)\s*GB/i);
        if (m) return Number(m[1]) || 0;
        const m2 = s.match(/(\d+(?:\.\d+)?)\s*GB/i);
        return m2 ? (Number(m2[1]) || 0) : 0;
    }

    /**
     * 目录项是否可作为「免费管线翻译」模型：显式白名单 + 参数量 ≤ 上限。
     * @param {string|object|null|undefined} modelIdOrEntry
     */
    function isFreePipelineTranslateModel(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        if (!entry || entry.freePipelineTranslate !== true) return false;
        const b = Number(entry.paramBillion);
        if (!Number.isFinite(b) || b <= 0) return false;
        return b <= FREE_PIPELINE_TRANSLATE_MAX_B;
    }

    function listFreePipelineTranslateModels() {
        return CATALOG.filter((m) => isFreePipelineTranslateModel(m)).map((m) => ({ ...m }));
    }

    /**
     * 日→中等「翻译专用」模型：可做推理翻译（Sakura 行对齐），不可做智能翻译 / 语境 / 影片理解。
     * @param {string|object|null|undefined} modelIdOrEntry
     */
    function isTranslateOnlyModel(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        if (entry) {
            if (entry.translateOnly === true) return true;
            if (String(entry.family || '').toLowerCase() === 'sakura') return true;
        }
        const raw = String(
            (entry && entry.id)
            || (typeof modelIdOrEntry === 'string' ? modelIdOrEntry : '')
            || '',
        ).trim().toLowerCase();
        if (!raw) return false;
        return /(^|[/_\s.-])sakura([/_\s.-]|$)/i.test(raw);
    }

    /**
     * 是否适合语境重构 / 影片理解 / 智能翻译（通用对话 + JSON）。
     */
    function supportsAdvancedReconstruct(modelIdOrEntry) {
        return !isTranslateOnlyModel(modelIdOrEntry);
    }

    /**
     * @returns {null | { ok: false, error: string, code: string, modelId?: string }}
     */
    function getReconstructModelBlock(modelIdOrName) {
        const id = String(modelIdOrName || '').trim();
        if (!id || supportsAdvancedReconstruct(id)) return null;
        const entry = findCatalogEntry(id);
        const label = entry?.name || id;
        return {
            ok: false,
            error: `「${label}」是翻译专用模型（如 Sakura 日→中），无法生成影片简要 / 做语境重构。请在设置 → Pro → 大模型中改选 Qwen2.5 Instruct 等通用对话模型。`,
            code: 'model_translate_only',
            modelId: entry?.id || id,
        };
    }

    /**
     * Block Sakura / translate-only models from smart translate (needs JSON + Brief).
     * @returns {null | { ok: false, error: string, code: string, modelId?: string }}
     */
    function getSmartTranslateModelBlock(modelIdOrName) {
        const id = String(modelIdOrName || '').trim();
        if (!id || !isTranslateOnlyModel(id)) return null;
        const entry = findCatalogEntry(id);
        const label = entry?.name || id;
        return {
            ok: false,
            error: `「${label}」是翻译专用模型，无法完成智能翻译（需影片简要与 JSON 分块译）。请改选 Qwen2.5 Instruct 等通用对话模型；Sakura 请用于「推理翻译」。`,
            code: 'model_translate_only',
            modelId: entry?.id || id,
        };
    }

    return {
        DEFAULT_SERVER_PORT,
        LLAMA_CPP_TAG,
        DEFAULT_OLLAMA_BASE_URL,
        OLLAMA_DOWNLOAD_URL,
        FREE_PIPELINE_TRANSLATE_MAX_B,
        RUNTIME_PACKAGES,
        RUNTIME_PACKAGE_VARIANTS,
        RUNTIME_PACKAGE_BY_ID,
        CATALOG,
        platformKey,
        getDefaultRuntimeId,
        getRuntimePackage,
        listRuntimePackages,
        normalizeRuntimeId,
        listCatalog,
        listCatalogVisible,
        listFamilies,
        findCatalogEntry,
        emptyManagedLlm,
        normalizeManagedLlm,
        resolveSmartTranslateModelId,
        resolveSmartTranslateModelChoice,
        normalizeLlmSource,
        parseMinRamGbFromHint,
        getModelScaleTier,
        isProScaleModel,
        isFreePipelineTranslateModel,
        listFreePipelineTranslateModels,
        isTranslateOnlyModel,
        supportsAdvancedReconstruct,
        getReconstructModelBlock,
        getSmartTranslateModelBlock,
    };
}));
