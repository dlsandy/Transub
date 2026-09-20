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
    /** Pinned binary build (b####). Semver stubs like v0.4.1 have no llama-*-bin-* zips. */
    const LLAMA_CPP_TAG = 'b11029';
    const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
    const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
    /** 未解锁 Pro 时目录可见的轻量模型上限（十亿）；智能翻译仍需 Pro */
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
            return source.map((e) => {
                const billion = Number.isFinite(Number(e.paramBillion)) && Number(e.paramBillion) > 0
                    ? Number(e.paramBillion)
                    : (() => {
                        const m = String(e.id || '').match(/(\d+(?:\.\d+)?)b/i);
                        return m ? Number(m[1]) : 1.5;
                    })();
                const isMulti = String(e.promptFamily || e.family || '').toLowerCase() === 'translategemma'
                    || String(e.promptFamily || '').toLowerCase() === 'translategemmasub'
                    || String(e.promptFamily || '').toLowerCase() === 'hunyuan'
                    || /translategemma|translate[-_]?gemma|hunyuan|hy-?mt/i.test(String(e.id || ''));
                const baseNote = e.note || (isMulti ? '多语 MT' : '日→简中');
                const pf = String(e.promptFamily || '').trim().toLowerCase();
                // Sakura / GalTransl stay free at all sizes; other MT packs still use ≤7B.
                const sakuraGalFree = pf === 'sakura' || pf === 'galtransl'
                    || /galtransl/i.test(String(e.id || ''))
                    || /^sakura-/i.test(String(e.id || ''));
                return {
                    id: e.id,
                    name: e.name,
                    family: e.family || 'sakura',
                    familyLabel: e.familyLabel || 'SakuraLLM',
                    fileName: e.fileName,
                    ggufUrl: e.ggufUrl,
                    localOnly: e.localOnly === true,
                    sizeHint: e.sizeHint,
                    sizeBytes: e.sizeBytes,
                    ramHint: e.ramHint,
                    note: `${baseNote}；免费推理翻译可用；不适合智能翻译 / 语境与影片重构`,
                    paramBillion: billion,
                    freePipelineTranslate: sakuraGalFree || billion <= FREE_PIPELINE_TRANSLATE_MAX_B,
                    translateOnly: true,
                    recommended: false,
                    contextSize: Number.isFinite(Number(e.contextSize)) ? Number(e.contextSize) : undefined,
                    llamaJinja: e.llamaJinja === true,
                    ollamaTag: e.ollamaTag || undefined,
                    languages: Array.isArray(e.languages) ? e.languages.slice() : undefined,
                };
            });
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
                note: '日→简中 · 免费推理翻译；仅翻译专用，不适合智能翻译 / 语境与影片重构；CC-BY-NC-SA',
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
     * CUDA ≥13 → CUDA 13；CUDA ≥12 → CUDA 12。有 AMD 时 preferRocm → ROCm。
     */
    const WIN_VULKAN_X64 = Object.freeze({
        id: 'win-vulkan-x64',
        label: 'Windows x64 · Vulkan',
        backend: 'vulkan',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-vulkan-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 34 MB',
        note: '兼容多数 GPU（含 AMD），无需单独安装 CUDA / ROCm',
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
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-cuda-13.4-x64.zip`,
        companionUrl: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/cudart-llama-bin-win-cuda-13.4-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 540 MB（含 CUDA 运行库）',
        note: '需较新 NVIDIA 驱动（CUDA 13+）；通常比 CUDA 12 / Vulkan 更快',
    });
    const WIN_ROCM_X64 = Object.freeze({
        id: 'win-rocm-x64',
        label: 'Windows x64 · ROCm（AMD）',
        backend: 'rocm',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-win-rocm-10.0-x64.zip`,
        archive: 'zip',
        exeName: 'llama-server.exe',
        sizeHint: '约 233 MB',
        note: '需 AMD 显卡；通常还需本机安装 ROCm/HIP（与 Adrenalin 驱动分开）；失败可改用 Vulkan',
    });
    const UBUNTU_VULKAN_X64 = Object.freeze({
        id: 'ubuntu-vulkan-x64',
        label: 'Linux x64 · Vulkan',
        backend: 'vulkan',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-ubuntu-vulkan-x64.tar.gz`,
        archive: 'tar.gz',
        exeName: 'llama-server',
        sizeHint: '约 31 MB',
        note: '兼容多数 GPU（含 AMD），无需单独安装 ROCm',
    });
    const UBUNTU_ROCM_X64 = Object.freeze({
        id: 'ubuntu-rocm-x64',
        label: 'Linux x64 · ROCm（AMD）',
        backend: 'rocm',
        url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}/llama-${LLAMA_CPP_TAG}-bin-ubuntu-rocm-10.0-x64.tar.gz`,
        archive: 'tar.gz',
        exeName: 'llama-server',
        sizeHint: '约 208 MB',
        note: '需 AMD 显卡与本机 ROCm；失败可改用 Vulkan',
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
        'linux-x64': UBUNTU_VULKAN_X64,
    });

    /** 同平台可选变体（仅列出可切换的；缺省回退 RUNTIME_PACKAGES） */
    const RUNTIME_PACKAGE_VARIANTS = Object.freeze({
        'win32-x64': Object.freeze([WIN_VULKAN_X64, WIN_CUDA12_X64, WIN_CUDA13_X64, WIN_ROCM_X64]),
        'linux-x64': Object.freeze([UBUNTU_VULKAN_X64, UBUNTU_ROCM_X64]),
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
            note: '极轻量中文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；低配机器首选，质量弱于 3B/7B',
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
            note: '轻量中文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；低配机器可用，质量弱于 7B',
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
            note: '中文首选；轻量 ≤7B，可浏览下载；智能翻译需 Pro；速度与质量均衡',
            paramBillion: 7,
            freePipelineTranslate: true,
            recommended: true,
            draftModelId: 'qwen25-1.5b',
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
            draftModelId: 'qwen25-1.5b',
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
            draftModelId: 'qwen25-3b',
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
            note: 'Qwen3 极轻量；轻量 ≤7B，可浏览下载；智能翻译需 Pro；支持思考模式，翻译时可关闭 thinking',
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
            note: 'Qwen3 Instruct；轻量 ≤7B，可浏览下载；智能翻译需 Pro；中文与指令跟随优于同体量 2.5',
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
            note: '偏推理思考；改写可能较啰嗦（需 Pro（非轻量档））',
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
            draftModelId: 'qwen3-1.7b',
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
            ramHint: '建议 ≥16 GB 内存 · 约 10 GB 显存可近全载',
            note: 'Pro 推荐；约 10GB 显存甜点；智能翻译 / 训练台 / 语境重构高质量首选',
            paramBillion: 14,
            recommended: true,
            draftModelId: 'qwen3-1.7b',
            ollamaTag: 'qwen3:14b',
        },
        {
            id: 'qwen3-4b-abliterated',
            name: 'Huihui Qwen3 4B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3-4B-abliterated-v2.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3-4B-abliterated-v2-GGUF/resolve/main/Huihui-Qwen3-4B-abliterated-v2.Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2497277120,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Huihui 消融拒答；轻量 ≤7B，可浏览下载；智能翻译需 Pro；语意优先、通顺为辅；建议开润色与忠实复核；关思考',
            paramBillion: 4,
            freePipelineTranslate: true,
            chatDefaults: {
                disableThinking: true,
                // 语意优先：略低温 + 低 frequencyPenalty；applyCatalogSampling 覆盖硬编码
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen3-8b-abliterated',
            name: 'Huihui Qwen3 8B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3-8B-abliterated-v2.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF/resolve/main/Huihui-Qwen3-8B-abliterated-v2.Q4_K_M.gguf',
            sizeHint: '约 5.0 GB',
            sizeBytes: 5027780352,
            weightGiB: 5.0,
            ramHint: '建议 ≥10 GB 内存 · 约 8GB 显存可近全载',
            note: 'Huihui 消融拒答；Q4 省显存；更高通顺可换同系列 Q5；语意优先、通顺为辅；建议开润色与忠实复核；关思考（需 Pro）',
            paramBillion: 8,
            draftModelId: 'qwen3-1.7b',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen3-8b-abliterated-q5',
            name: 'Huihui Qwen3 8B Abliterated Q5',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3-8B-abliterated-v2.Q5_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3-8B-abliterated-v2-GGUF/resolve/main/Huihui-Qwen3-8B-abliterated-v2.Q5_K_M.gguf',
            sizeHint: '约 5.9 GB',
            sizeBytes: 5851109120,
            weightGiB: 5.9,
            ramHint: '建议 ≥12 GB 内存 · 约 8GB 显存可近全载',
            note: 'Huihui 消融拒答；Q5_K_M 推荐；语意优先、通顺为辅；建议开剧情贴合润色（上限 36）与忠实复核；关思考（需 Pro）',
            paramBillion: 8,
            recommended: true,
            draftModelId: 'qwen3-1.7b',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen3-14b-abliterated',
            name: 'Huihui Qwen3 14B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3-14B-abliterated-v2.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3-14B-abliterated-v2-GGUF/resolve/main/Huihui-Qwen3-14B-abliterated-v2.Q4_K_M.gguf',
            sizeHint: '约 9.0 GB',
            sizeBytes: 9001749792,
            weightGiB: 9.0,
            ramHint: '建议 ≥16 GB 内存 · 约 10GB 显存可近全载',
            note: 'Huihui 消融拒答；更高质量智能翻译 / 润色；语意优先、通顺为辅；建议开润色与忠实复核；关思考（需 Pro）',
            paramBillion: 14,
            draftModelId: 'qwen3-1.7b',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.16,
                polishTemperature: 0.24,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-2b-abliterated',
            name: 'Huihui Qwen3.5 2B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3.5-2B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3.5-2B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-2B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 1.2 GB',
            sizeBytes: 1270809024,
            ramHint: '建议 ≥4 GB 内存',
            note: 'Huihui 消融拒答；极轻量草稿 / 低显存；智能翻译需 Pro；语意优先；关思考。需较新 llama-server（Qwen3.5）',
            paramBillion: 2,
            freePipelineTranslate: true,
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-4b-abliterated',
            name: 'Huihui Qwen3.5 4B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2707514688,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Huihui 消融拒答；Qwen3.5 轻量 ≤7B，可浏览下载；智能翻译需 Pro；语意优先、通顺为辅；建议开润色与忠实复核；关思考。需较新 llama-server（Qwen3.5）',
            paramBillion: 4,
            freePipelineTranslate: true,
            draftModelId: 'qwen35-2b-abliterated',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-9b-abliterated',
            name: 'Huihui Qwen3.5 9B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 5.2 GB',
            sizeBytes: 5627045248,
            weightGiB: 5.2,
            ramHint: '建议 ≥10 GB 内存 · 约 8GB 显存可近全载',
            note: 'Huihui 消融拒答；Qwen3.5 Q4 省显存；更高通顺可换同系列 Q5；语意优先、通顺为辅；建议开润色与忠实复核；关思考（需 Pro）。需较新 llama-server（Qwen3.5）',
            paramBillion: 9,
            draftModelId: 'qwen35-2b-abliterated',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-9b-abliterated-q5',
            name: 'Huihui Qwen3.5 9B Abliterated Q5',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3.5-9B-abliterated.Q5_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-9B-abliterated.Q5_K_M.gguf',
            sizeHint: '约 6.1 GB',
            sizeBytes: 6522004864,
            weightGiB: 6.1,
            ramHint: '建议 ≥12 GB 内存 · 约 8GB 显存可近全载',
            note: 'Huihui 消融拒答；Qwen3.5 Q5_K_M 推荐；语意优先、通顺为辅；建议开剧情贴合润色与忠实复核；关思考（需 Pro）。需较新 llama-server（Qwen3.5）',
            paramBillion: 9,
            recommended: true,
            draftModelId: 'qwen35-2b-abliterated',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen3-30b-a3b-abliterated',
            name: 'Huihui Qwen3 30B-A3B Instruct Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3-30B-A3B-Instruct-2507-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3-30B-A3B-Instruct-2507-abliterated-GGUF/resolve/main/Huihui-Qwen3-30B-A3B-Instruct-2507-abliterated.Q4_K_M.gguf',
            sizeHint: '约 17.3 GB',
            sizeBytes: 18556687008,
            weightGiB: 17.3,
            ramHint: '建议 ≥24 GB 内存；10GB 显存需部分卸内存 / --n-cpu-moe',
            note: 'Huihui 消融拒答；MoE 总参 30B、激活约 3B；智能翻译 / 影片理解少拒答（需 Pro）；关思考',
            paramBillion: 30,
            activeParamBillion: 3,
            moe: true,
            draftModelId: 'qwen35-2b-abliterated',
            llamaServer: {
                flashAttn: true,
                reasoning: 'off',
                nCpuMoe: 16,
            },
            chatDefaults: {
                disableThinking: true,
                temperature: 0.16,
                polishTemperature: 0.24,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-35b-a3b-abliterated',
            name: 'Huihui Qwen3.5 35B-A3B Abliterated',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Huihui-Qwen3.5-35B-A3B-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-Qwen3.5-35B-A3B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-35B-A3B-abliterated.Q4_K_M.gguf',
            sizeHint: '约 19.7 GB',
            sizeBytes: 21169118016,
            weightGiB: 19.7,
            ramHint: '建议 ≥24 GB 内存；10GB 显存需部分卸内存 / --n-cpu-moe',
            note: 'Huihui 消融拒答；Qwen3.5 MoE（激活约 3B）；智能翻译 / 润色高质量少拒答（需 Pro）；关思考。需较新 llama-server（Qwen3.5）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            draftModelId: 'qwen35-2b-abliterated',
            llamaServer: {
                flashAttn: true,
                reasoning: 'off',
                nCpuMoe: 16,
            },
            chatDefaults: {
                disableThinking: true,
                temperature: 0.16,
                polishTemperature: 0.24,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-4b',
            name: 'Qwen3.5 4B',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen_Qwen3.5-4B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf',
            sizeHint: '约 2.8 GB',
            sizeBytes: 3013027808,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Qwen3.5 混合注意力；轻量 ≤7B，可浏览下载；智能翻译需 Pro；字幕任务关思考。需较新 llama-server（目录目标 b11029+）',
            paramBillion: 4,
            freePipelineTranslate: true,
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-4b-uncensored-aggressive',
            name: 'Qwen3.5 4B Uncensored Aggressive',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/HauhauCS/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive/resolve/main/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf',
            sizeHint: '约 2.5 GB',
            sizeBytes: 2707513696,
            ramHint: '建议 ≥6 GB 内存',
            note: 'HauhauCS Aggressive 去拒答；轻量 ≤7B，可浏览下载；智能翻译需 Pro；成人向少拒答；关思考。需较新 llama-server（Qwen3.5）',
            paramBillion: 4,
            freePipelineTranslate: true,
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'qwen35-9b-uncensored-aggressive',
            name: 'Qwen3.5 9B Uncensored Aggressive',
            family: 'qwen',
            familyLabel: 'Qwen',
            fileName: 'Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive/resolve/main/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf',
            sizeHint: '约 5.2 GB',
            sizeBytes: 5627044224,
            weightGiB: 5.2,
            ramHint: '建议 ≥10 GB 内存 · 约 8GB 显存可近全载',
            note: 'HauhauCS Aggressive 去拒答；质量优于 4B；成人向少拒答；关思考（需 Pro）。需较新 llama-server（Qwen3.5）',
            paramBillion: 9,
            draftModelId: 'qwen35-4b-uncensored-aggressive',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'glm47-flash-heretic',
            name: 'GLM-4.7 Flash Heretic',
            family: 'glm',
            familyLabel: 'GLM',
            fileName: 'glm-4.7-flash-heretic.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/Olafangensan/GLM-4.7-Flash-heretic-GGUF/resolve/main/glm-4.7-flash-heretic.Q4_K_M.gguf',
            sizeHint: '约 16.9 GB',
            sizeBytes: 18132721344,
            weightGiB: 16.9,
            ramHint: '建议 ≥24 GB 内存；10GB 显存需部分卸内存 / --n-cpu-moe',
            note: 'GLM-4.7-Flash（30B-A3B MoE，激活约 3B）Heretic 去审查；适合智能翻译 / 影片理解；关思考（需 Pro）。需含 GLM-4.7 Flash 修复的较新 llama-server',
            paramBillion: 30,
            activeParamBillion: 3,
            moe: true,
            draftModelId: 'qwen35-4b',
            llamaServer: {
                flashAttn: true,
                reasoning: 'off',
                nCpuMoe: 16,
            },
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
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
            ramHint: '建议 ≥24 GB 内存；10GB 显存需部分卸内存',
            note: 'MoE：总参 30B、激活约 3B；比稠密 32B 更适中端显存抬高质量（需 Pro）',
            paramBillion: 30,
            draftModelId: 'qwen3-1.7b',
            ollamaTag: 'qwen3:30b-a3b',
        },
        {
            id: 'spark-x25-1.7b',
            name: 'Spark X2.5 1.7B',
            family: 'spark',
            familyLabel: 'Spark',
            fileName: 'Spark-X2.5-1.7B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/sizzlebop/Spark-X2.5-1.7B-GGUF/resolve/main/Spark-X2.5-1.7B-Q4_K_M.gguf',
            sizeHint: '约 1.0 GB',
            sizeBytes: 1107457600,
            ramHint: '建议 ≥4 GB 内存',
            note: '词元星火端侧；混合注意力、原生长上下文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；字幕任务自动关思考。需 llama.cpp ≥ b10828（spark2_5；目录目标 b11029）',
            paramBillion: 1.7,
            freePipelineTranslate: true,
            ollamaTag: 'SparkLLM/Spark-X2.5-1.7B',
            chatDefaults: {
                disableThinking: true,
            },
        },
        {
            id: 'spark-x25-4b',
            name: 'Spark X2.5 4B',
            family: 'spark',
            familyLabel: 'Spark',
            fileName: 'Spark-X2.5-4B-Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/sizzlebop/Spark-X2.5-4B-GGUF/resolve/main/Spark-X2.5-4B-Q4_K_M.gguf',
            sizeHint: '约 2.4 GB',
            sizeBytes: 2600224096,
            ramHint: '建议 ≥6 GB 内存',
            note: '词元星火端侧；中文/多语与指令跟随强；轻量 ≤7B，可浏览下载；智能翻译需 Pro；字幕任务自动关思考。需 llama.cpp ≥ b10828（spark2_5；目录目标 b11029）',
            paramBillion: 4,
            freePipelineTranslate: true,
            draftModelId: 'spark-x25-1.7b',
            ollamaTag: 'SparkLLM/Spark-X2.5-4B',
            chatDefaults: {
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ymq-xs',
            name: 'Ornith 1.5 35B Uncensored YMQ-XS',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-Uncensored-YMQ-XS.gguf',
            ggufUrl: 'https://huggingface.co/zerodigest/Ornith-1.5-35B-Uncensored-YMQ-MTP-GGUF/resolve/main/Ornith-1.5-35B-Uncensored-YMQ-XS.gguf',
            sizeHint: '约 11.5 GB',
            sizeBytes: 11971234144,
            weightGiB: 11.5,
            ramHint: '建议 ≥24 GB 内存；8GB 显存需 --n-cpu-moe',
            note: 'Ornith 1.5 MoE（激活≈3B）YMQ 最小档；8GB 显存友好；成人向少拒答（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q4_0',
                nCpuMoe: 16,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ymq-s',
            name: 'Ornith 1.5 35B Uncensored YMQ-S',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-Uncensored-YMQ-S.gguf',
            ggufUrl: 'https://huggingface.co/zerodigest/Ornith-1.5-35B-Uncensored-YMQ-MTP-GGUF/resolve/main/Ornith-1.5-35B-Uncensored-YMQ-S.gguf',
            sizeHint: '约 13.4 GB',
            sizeBytes: 13415098720,
            weightGiB: 13.4,
            ramHint: '建议 ≥32 GB 内存；8–12GB 显存需 --n-cpu-moe',
            note: 'YMQ 经济档；混合精度保住注意力/输出；MTP+MoE 卸载（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q4_0',
                nCpuMoe: 14,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ymq-m',
            name: 'Ornith 1.5 35B Uncensored YMQ-M',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-Uncensored-YMQ-M.gguf',
            ggufUrl: 'https://huggingface.co/zerodigest/Ornith-1.5-35B-Uncensored-YMQ-MTP-GGUF/resolve/main/Ornith-1.5-35B-Uncensored-YMQ-M.gguf',
            sizeHint: '约 16.2 GB',
            sizeBytes: 16177047904,
            weightGiB: 16.2,
            ramHint: '建议 ≥32 GB 内存；8GB 显存+MTP 可冲高吞吐',
            note: 'YMQ 推荐档；注意力/输出高比特、专家层压缩；8G 显存友好（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            recommended: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q4_0',
                nCpuMoe: 14,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ymq-l',
            name: 'Ornith 1.5 35B Uncensored YMQ-L',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-Uncensored-YMQ-L.gguf',
            ggufUrl: 'https://huggingface.co/zerodigest/Ornith-1.5-35B-Uncensored-YMQ-MTP-GGUF/resolve/main/Ornith-1.5-35B-Uncensored-YMQ-L.gguf',
            sizeHint: '约 18.6 GB',
            sizeBytes: 18641635680,
            weightGiB: 18.6,
            ramHint: '建议 ≥48 GB 内存；12–16GB 显存更稳',
            note: 'YMQ 高精度档；近无损混合量化；10GB 卡需加大 MoE 卸载（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q4_0',
                nCpuMoe: 16,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ablit-apex-mini',
            name: 'Ornith 1.5 35B Abliterated APEX-I-Mini',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-A3B-Abliterated-MTPv2-APEX-I-Mini-v2D-lite.gguf',
            ggufUrl: 'https://huggingface.co/gbuzhf/Ornith-1.5-35B-A3B-Abliterated-MTP-UD-APEX-GGUF/resolve/main/Ornith-1.5-35B-A3B-Abliterated-MTPv2-APEX-I-Mini-v2D-lite.gguf',
            sizeHint: '约 14.4 GB',
            sizeBytes: 14374134432,
            weightGiB: 14.4,
            ramHint: '建议 ≥32 GB 内存；8GB 显存需 --n-cpu-moe',
            note: 'Abliterated+MTPv2 最小 APEX；8G 可跑但质量低于 Compact（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q8_0',
                nCpuMoe: 16,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ablit-apex-compact',
            name: 'Ornith 1.5 35B Abliterated APEX-I-Compact',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-A3B-Abliterated-MTPv2-APEX-I-Compact-v2D-lite.gguf',
            ggufUrl: 'https://huggingface.co/gbuzhf/Ornith-1.5-35B-A3B-Abliterated-MTP-UD-APEX-GGUF/resolve/main/Ornith-1.5-35B-A3B-Abliterated-MTPv2-APEX-I-Compact-v2D-lite.gguf',
            sizeHint: '约 17.6 GB',
            sizeBytes: 17566434976,
            weightGiB: 17.6,
            ramHint: '建议 ≥40 GB 内存；8–16GB 显存需 --n-cpu-moe',
            note: 'Abliterated APEX Compact；质量/体积折中；MTP+关思考（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            recommended: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q8_0',
                nCpuMoe: 14,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
        },
        {
            id: 'ornith-15-35b-ablit-21g-ice',
            name: 'Ornith 1.5 35B Abliterated 21G-ICE',
            family: 'ornith',
            familyLabel: 'Ornith',
            fileName: 'Ornith-1.5-35B-A3B-Abliterated-MTPv2-21G-ICE.gguf',
            ggufUrl: 'https://huggingface.co/gbuzhf/Ornith-1.5-35B-A3B-Abliterated-MTP-UD-APEX-GGUF/resolve/main/Ornith-1.5-35B-A3B-Abliterated-MTPv2-21G-ICE.gguf',
            sizeHint: '约 20.9 GB',
            sizeBytes: 20848395968,
            weightGiB: 20.9,
            ramHint: '建议 ≥48 GB 内存；12GB+ 显存更稳',
            note: 'ICE 按误差传播分配比特；同体积优于扁平量化；偏质量档（需 Pro）',
            paramBillion: 35,
            activeParamBillion: 3,
            moe: true,
            mtp: true,
            llamaServer: {
                flashAttn: true,
                batchSize: 512,
                reasoning: 'off',
                cacheTypeK: 'q8_0',
                cacheTypeV: 'q8_0',
                nCpuMoe: 18,
                specType: 'draft-mtp',
                specDraftNMax: 2,
                forceSingleSlot: true,
            },
            chatDefaults: {
                temperature: 0.1,
                topP: 0.7,
                topK: 0,
                repeatLastN: 256,
                repeatPenalty: 1.2,
                disableThinking: true,
            },
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
            note: '极轻量英文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；中文弱于同体量 Qwen',
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
            note: '轻量英文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；中文弱于同体量 Qwen',
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
            note: '轻量英文；轻量 ≤7B，可浏览下载；智能翻译需 Pro；中文一般',
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
            note: 'Gemma3 轻量；轻量 ≤7B，可浏览下载；智能翻译需 Pro；多语优于 Gemma2',
            paramBillion: 4,
            freePipelineTranslate: true,
            ollamaTag: 'gemma3:4b',
        },
        {
            id: 'gemma4-e2b-abliterated',
            name: 'Huihui Gemma 4 E2B Abliterated',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'Huihui-gemma-4-E2B-it-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-gemma-4-E2B-it-abliterated-GGUF/resolve/main/Huihui-gemma-4-E2B-it-abliterated.Q4_K_M.gguf',
            sizeHint: '约 3.2 GB',
            sizeBytes: 3427874272,
            ramHint: '建议 ≥6 GB 内存',
            note: 'Huihui 消融拒答；Gemma 4 边缘档（有效约 2B）；文本 GGUF（勿绑 mmproj）；智能翻译需 Pro；多语/英文优于日→中软声。需 llama-server ≥ b8637（目录目标 b11029）',
            paramBillion: 2,
            freePipelineTranslate: true,
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'gemma4-e4b-abliterated',
            name: 'Huihui Gemma 4 E4B Abliterated',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'Huihui-gemma-4-E4B-it-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-gemma-4-E4B-it-abliterated-GGUF/resolve/main/Huihui-gemma-4-E4B-it-abliterated.Q4_K_M.gguf',
            sizeHint: '约 5.0 GB',
            sizeBytes: 5335286272,
            weightGiB: 5.0,
            ramHint: '建议 ≥10 GB 内存 · 约 8GB 显存可近全载',
            note: 'Huihui 消融拒答；Gemma 4 边缘档（有效约 4B）；文本 GGUF（勿绑 mmproj）；智能翻译需 Pro；少拒答通用对话。需 llama-server ≥ b8637（目录目标 b11029）',
            paramBillion: 4,
            freePipelineTranslate: true,
            draftModelId: 'gemma4-e2b-abliterated',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.14,
                polishTemperature: 0.22,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'gemma4-12b-abliterated',
            name: 'Huihui Gemma 4 12B Abliterated',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'Huihui-gemma-4-12B-it-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-gemma-4-12B-it-abliterated-GGUF/resolve/main/Huihui-gemma-4-12B-it-abliterated.Q4_K_M.gguf',
            sizeHint: '约 6.9 GB',
            sizeBytes: 7381382720,
            weightGiB: 6.9,
            ramHint: '建议 ≥14 GB 内存 · 约 10GB 显存可近全载',
            note: 'Huihui 消融拒答；Gemma 4 12B 文本 GGUF（勿绑 mmproj）；智能翻译 / 润色少拒答（需 Pro）；多语强于日→中软声。需 llama-server ≥ b8637（目录目标 b11029）',
            paramBillion: 12,
            draftModelId: 'gemma4-e2b-abliterated',
            chatDefaults: {
                disableThinking: true,
                temperature: 0.15,
                polishTemperature: 0.23,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
        },
        {
            id: 'gemma4-26b-a4b-abliterated',
            name: 'Huihui Gemma 4 26B-A4B Abliterated',
            family: 'gemma',
            familyLabel: 'Gemma',
            fileName: 'Huihui-gemma-4-26B-A4B-it-abliterated.Q4_K_M.gguf',
            ggufUrl: 'https://huggingface.co/mradermacher/Huihui-gemma-4-26B-A4B-it-abliterated-GGUF/resolve/main/Huihui-gemma-4-26B-A4B-it-abliterated.Q4_K_M.gguf',
            sizeHint: '约 15.6 GB',
            sizeBytes: 16796011680,
            weightGiB: 15.6,
            ramHint: '建议 ≥24 GB 内存；10GB 显存需部分卸内存 / --n-cpu-moe',
            note: 'Huihui 消融拒答；Gemma 4 MoE（总参 26B、激活约 4B）；文本 GGUF（勿绑 mmproj）；智能翻译少拒答（需 Pro）。需 llama-server ≥ b8637（目录目标 b11029）',
            paramBillion: 26,
            activeParamBillion: 4,
            moe: true,
            draftModelId: 'gemma4-e2b-abliterated',
            llamaServer: {
                flashAttn: true,
                reasoning: 'off',
                nCpuMoe: 16,
            },
            chatDefaults: {
                disableThinking: true,
                temperature: 0.16,
                polishTemperature: 0.24,
                topP: 0.8,
                repeatPenalty: 1.08,
                frequencyPenalty: 0.12,
            },
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
            note: '微软小模型，推理快；轻量 ≤7B，可浏览下载；智能翻译需 Pro；中文一般',
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
            note: '微软 Phi-4 小模型；轻量 ≤7B，可浏览下载；智能翻译需 Pro；推理优于 3.5',
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
            note: '偏推理；改写时可能较啰嗦（需 Pro（非轻量档））',
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
            note: '偏代码；需 Pro（非轻量档）；一般字幕请优先选 Instruct 版',
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
            draftModelId: 'qwen3-4b',
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
            draftModelId: 'qwen25-3b',
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
     * @param {{ preferCuda?: boolean, preferRocm?: boolean, cudaVersion?: string }} [hints]
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
        if (hints && hints.preferRocm) {
            if (key === 'win32-x64' && RUNTIME_PACKAGE_BY_ID['win-rocm-x64']) {
                return 'win-rocm-x64';
            }
            if (key === 'linux-x64' && RUNTIME_PACKAGE_BY_ID['ubuntu-rocm-x64']) {
                return 'ubuntu-rocm-x64';
            }
        }
        return RUNTIME_PACKAGES[key]?.id || '';
    }

    function backendRank(backend, preferredBackend) {
        const b = String(backend || '');
        if (preferredBackend && b === preferredBackend) return 0;
        if (b === 'cuda' || b === 'rocm') return 1;
        if (b === 'vulkan') return 2;
        return 3;
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
        if (hints && list.length > 1) {
            const preferredId = getDefaultRuntimeId(platform, arch, hints);
            const preferredBackend = hints.preferCuda
                ? 'cuda'
                : (hints.preferRocm ? 'rocm' : '');
            if (preferredId || preferredBackend) {
                list.sort((a, b) => {
                    if (preferredId) {
                        if (a.id === preferredId) return -1;
                        if (b.id === preferredId) return 1;
                    }
                    const ar = backendRank(a.backend, preferredBackend);
                    const br = backendRank(b.backend, preferredBackend);
                    if (ar !== br) return ar - br;
                    if (preferredBackend === 'cuda') {
                        const am = Number((/cuda(\d+)/i.exec(String(a.id || '')) || [])[1] || 0);
                        const bm = Number((/cuda(\d+)/i.exec(String(b.id || '')) || [])[1] || 0);
                        return bm - am;
                    }
                    return String(a.id || '').localeCompare(String(b.id || ''));
                });
            }
        }
        return list;
    }

    /**
     * @param {string} [platform]
     * @param {string} [arch]
     * @param {string} [runtimeId] 偏好包 id（如 win-cuda12-x64 / win-rocm-x64）；无效则回退平台默认
     * @param {{ preferCuda?: boolean, preferRocm?: boolean, cudaVersion?: string }} [hints]
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

/**
 * Normalize llama.cpp release tag used for binary downloads (e.g. "b11029").
 * Semver-only tags like "v0.4.1" are rejected: GitHub marks b#### builds as
 * prereleases, so /releases/latest is often a stub without llama-*-bin-* zips.
 * @param {string} tag
 * @returns {string}
 */
function normalizeLlamaCppTag(tag) {
    const raw = String(tag || '').trim();
    if (!raw) return '';
    const build = raw.match(/\b(b\d{4,})\b/i);
    if (build) return `b${build[1].slice(1)}`;
    return '';
}

    /**
     * Rewrite package download URLs to a different llama.cpp release tag.
     * Used when installing 「官方最新」 instead of the Transub-pinned LLAMA_CPP_TAG.
     * @param {object|null|undefined} pkg
     * @param {string} tag
     * @returns {object|null}
     */
    function rewriteRuntimePackageTag(pkg, tag) {
        if (!pkg || typeof pkg !== 'object') return null;
        const nextTag = normalizeLlamaCppTag(tag);
        if (!nextTag) return { ...pkg, tag: pkg.tag || LLAMA_CPP_TAG };
        const rewriteUrl = (url) => {
            let u = String(url || '').trim();
            if (!u) return '';
            u = u.replace(/\/download\/b\d{4,}\//gi, `/download/${nextTag}/`);
            u = u.replace(/llama-b\d{4,}-/gi, `llama-${nextTag}-`);
            // Fallback: pinned catalog tag literal
            if (LLAMA_CPP_TAG && u.includes(LLAMA_CPP_TAG) && LLAMA_CPP_TAG !== nextTag) {
                u = u.split(LLAMA_CPP_TAG).join(nextTag);
            }
            return u;
        };
        const next = {
            ...pkg,
            url: rewriteUrl(pkg.url),
            tag: nextTag,
        };
        if (pkg.companionUrl) next.companionUrl = rewriteUrl(pkg.companionUrl);
        return next;
    }

    /** 规范化运行时偏好；空/非法 → 平台默认 id（preferCuda / preferRocm 时选匹配后端） */
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
    const MAX_LAB_MODELS = 32;

    function fileNameFromGgufUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        try {
            const u = new URL(raw);
            const base = decodeURIComponent((u.pathname || '').split('/').pop() || '');
            if (/\.gguf$/i.test(base)) return base.slice(0, 240);
        } catch (_) { /* ignore */ }
        const tail = raw.split(/[\\/]/).pop() || '';
        const clean = decodeURIComponent(tail.split('?')[0] || '');
        return /\.gguf$/i.test(clean) ? clean.slice(0, 240) : '';
    }

    /**
     * Normalize user-pasted GGUF URLs so downloads hit the binary, not an HTML page.
     * Hugging Face `/blob/` pages are ~100–300KB HTML — a common lab download failure.
     */
    function normalizeGgufDownloadUrl(url) {
        let raw = String(url || '').trim();
        if (!raw) return '';
        try {
            const u = new URL(raw);
            const host = String(u.hostname || '').toLowerCase();
            if (
                host === 'huggingface.co'
                || host.endsWith('.huggingface.co')
                || host === 'hf-mirror.com'
                || host.endsWith('.hf-mirror.com')
            ) {
                // /owner/repo/blob/<rev>/file.gguf → /owner/repo/resolve/<rev>/file.gguf
                u.pathname = u.pathname.replace(
                    /^(\/[^/]+\/[^/]+)\/blob\//i,
                    '$1/resolve/',
                );
                // Tree pages are not downloadable.
                if (/\/tree\//i.test(u.pathname) && !/\.gguf$/i.test(u.pathname)) {
                    return raw.slice(0, 2048);
                }
                return u.toString().slice(0, 2048);
            }
        } catch (_) { /* ignore */ }
        return raw.slice(0, 2048);
    }

    function slugifyLabModelId(seed) {
        let s = String(seed || '').trim().toLowerCase()
            .replace(/\.gguf$/i, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48);
        if (!s) s = 'model';
        if (!s.startsWith('lab-')) s = `lab-${s}`;
        return s.slice(0, 64);
    }

    /**
     * Normalize a user-added laboratory (experimental) llama GGUF entry.
     * @returns {object|null}
     */
    function normalizeLabModelEntry(raw, options = {}) {
        if (!raw || typeof raw !== 'object') return null;
        const ggufUrl = normalizeGgufDownloadUrl(raw.ggufUrl || raw.url || '');
        let fileName = String(raw.fileName || raw.filename || '').trim().slice(0, 240);
        if (!fileName) fileName = fileNameFromGgufUrl(ggufUrl);
        if (!fileName || !/\.gguf$/i.test(fileName)) return null;
        if (/[\\/]/.test(fileName)) fileName = fileName.split(/[\\/]/).pop() || fileName;
        const name = String(raw.name || '').trim().slice(0, 120)
            || fileName.replace(/\.gguf$/i, '');
        const existingIds = new Set(
            (Array.isArray(options.existingIds) ? options.existingIds : [])
                .map((x) => String(x || '').trim().toLowerCase())
                .filter(Boolean),
        );
        let id = String(raw.id || '').trim().slice(0, 64);
        if (!id) id = slugifyLabModelId(fileName);
        else if (!id.toLowerCase().startsWith('lab-')) id = slugifyLabModelId(id);
        const baseId = id;
        let n = 2;
        while (existingIds.has(id.toLowerCase()) || findBuiltinCatalogEntry(id)) {
            id = `${baseId}-${n}`.slice(0, 64);
            n += 1;
            if (n > 99) return null;
        }
        const paramBillion = Number(raw.paramBillion);
        const sizeBytes = Number(raw.sizeBytes);
        const sizeHint = String(raw.sizeHint || '').trim().slice(0, 64);
        const ramHint = String(raw.ramHint || '').trim().slice(0, 120);
        const note = String(raw.note || '').trim().slice(0, 400)
            || '实验室自定义 GGUF（llama-server）；需自行确认模板与量化兼容性';
        const billion = Number.isFinite(paramBillion) && paramBillion > 0
            ? Math.min(1000, Math.round(paramBillion * 100) / 100)
            : 0;
        return {
            id,
            name,
            family: 'lab',
            familyLabel: '实验',
            fileName,
            ggufUrl,
            sizeHint: sizeHint || (Number.isFinite(sizeBytes) && sizeBytes > 0
                ? `约 ${(sizeBytes / (1024 ** 3)).toFixed(1)} GB`
                : ''),
            sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? Math.round(sizeBytes) : 0,
            ramHint,
            note,
            paramBillion: billion,
            freePipelineTranslate: billion > 0 && billion <= FREE_PIPELINE_TRANSLATE_MAX_B,
            translateOnly: false,
            recommended: false,
            experimental: true,
            lab: true,
            localOnly: !ggufUrl,
        };
    }

    function normalizeLabModels(rawList) {
        const out = [];
        const seen = new Set();
        const list = Array.isArray(rawList) ? rawList : [];
        for (const raw of list) {
            const declaredId = String(raw?.id || '').trim().toLowerCase();
            if (declaredId && seen.has(declaredId)) continue;
            const entry = normalizeLabModelEntry(raw, { existingIds: [...seen] });
            if (!entry) continue;
            const key = entry.id.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(entry);
            if (out.length >= MAX_LAB_MODELS) break;
        }
        return out;
    }

    function findBuiltinCatalogEntry(modelIdOrTag) {
        const want = String(modelIdOrTag || '').trim().toLowerCase();
        if (!want) return null;
        return CATALOG.find((m) => (
            m.id.toLowerCase() === want
            || String(m.ollamaTag || '').toLowerCase() === want
            || String(m.fileName || '').toLowerCase() === want
        )) || null;
    }

    function findLabModelEntry(labModels, modelIdOrTag) {
        const want = String(modelIdOrTag || '').trim().toLowerCase();
        if (!want) return null;
        const list = Array.isArray(labModels) ? labModels : [];
        return list.find((m) => (
            String(m?.id || '').toLowerCase() === want
            || String(m?.fileName || '').toLowerCase() === want
        )) || null;
    }

    function listCatalogVisible(options = {}) {
        const entitled = !!options.entitled;
        const always = new Set(
            (Array.isArray(options.alwaysIncludeIds) ? options.alwaysIncludeIds : [])
                .map((x) => String(x || '').trim().toLowerCase())
                .filter(Boolean),
        );
        const base = CATALOG
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
        const labs = entitled
            ? normalizeLabModels(options.labModels).map((m) => ({
                ...m,
                experimental: true,
                lab: true,
                // Laboratory is Pro-only; once entitled, do not re-gate by param scale.
                proScale: false,
                scaleTier: getModelScaleTier(m),
            }))
            : [];
        if (!labs.length) return base;
        const ids = new Set(base.map((m) => String(m.id || '').toLowerCase()));
        for (const lab of labs) {
            const key = String(lab.id || '').toLowerCase();
            if (!key || ids.has(key)) continue;
            ids.add(key);
            base.push(lab);
        }
        return base;
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

    /**
     * @param {string} modelIdOrTag
     * @param {object[]|{ labModels?: object[] }} [optionsOrLabModels]
     */
    function findCatalogEntry(modelIdOrTag, optionsOrLabModels) {
        const hit = findBuiltinCatalogEntry(modelIdOrTag);
        if (hit) return hit;
        const labs = Array.isArray(optionsOrLabModels)
            ? optionsOrLabModels
            : (optionsOrLabModels && typeof optionsOrLabModels === 'object'
                ? optionsOrLabModels.labModels
                : null);
        const lab = findLabModelEntry(labs, modelIdOrTag);
        if (!lab) return null;
        return {
            ...lab,
            experimental: true,
            lab: true,
            family: lab.family || 'lab',
            familyLabel: lab.familyLabel || '实验',
        };
    }

    /**
     * Per-model chat sampling defaults (subtitle / smart-translate oriented).
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {null|{ temperature?: number, polishTemperature?: number, topP?: number, topK?: number, repeatPenalty?: number, repeatLastN?: number, frequencyPenalty?: number, disableThinking?: boolean }}
     */
    function resolveChatDefaults(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        const raw = entry?.chatDefaults;
        if (!raw || typeof raw !== 'object') return null;
        const out = {};
        const temp = Number(raw.temperature);
        if (Number.isFinite(temp)) out.temperature = temp;
        const polishTemp = Number(raw.polishTemperature ?? raw.polish_temperature);
        if (Number.isFinite(polishTemp)) out.polishTemperature = polishTemp;
        const topP = Number(raw.topP ?? raw.top_p);
        if (Number.isFinite(topP)) out.topP = topP;
        const topK = Number(raw.topK ?? raw.top_k);
        if (Number.isFinite(topK)) out.topK = topK;
        const rp = Number(raw.repeatPenalty ?? raw.repeat_penalty ?? raw.repetitionPenalty);
        if (Number.isFinite(rp)) out.repeatPenalty = rp;
        const rln = Number(raw.repeatLastN ?? raw.repeat_last_n);
        if (Number.isFinite(rln)) out.repeatLastN = rln;
        const fp = Number(raw.frequencyPenalty ?? raw.frequency_penalty);
        if (Number.isFinite(fp)) out.frequencyPenalty = fp;
        if (raw.disableThinking === true || raw.disableThinking === false) {
            out.disableThinking = raw.disableThinking;
        }
        return Object.keys(out).length ? out : null;
    }

    function emptyManagedLlm() {
        return {
            /** LLM 推理 / 重构（语境、影片理解、语义审阅） */
            activeModelId: '',
            /** 智能翻译 / 混合润色对话模型；空=未选用（不回退推理模型） */
            smartTranslateModelId: '',
            serverPort: DEFAULT_SERVER_PORT,
            /** @deprecated 兼容旧配置；软件内模型已改为 llama-server */
            ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
            pulledIds: [],
            runtimeId: '',
            nGpuLayers: 99,
            contextSize: 8192,
            /** 实验室：用户自由添加的 llama 兼容 GGUF */
            labModels: [],
        };
    }

    /** 主模型对应的推测解码草稿目录项（同系列小模型）。 */
    function resolveDraftModelEntry(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        const draftId = String(entry?.draftModelId || '').trim();
        if (!draftId) return null;
        return findCatalogEntry(draftId);
    }

    /**
     * 智能翻译 / 混合润色实际使用的对话模型 id。
     * 只认 smartTranslateModelId（不回退推理模型 activeModelId，避免与语境重构选型混淆）；
     * 翻译专用不进入对话/润色位。
     */
    function resolveSmartTranslateModelId(managedOrDoc) {
        const managed = managedOrDoc && typeof managedOrDoc === 'object' && managedOrDoc.managedLlm
            ? normalizeManagedLlm(managedOrDoc.managedLlm)
            : normalizeManagedLlm(managedOrDoc);
        const smart = String(managed.smartTranslateModelId || '').trim();
        if (smart && !isTranslateOnlyModel(smart)) return smart;
        return '';
    }

    /**
     * @returns {{ modelId: string, requestedId: string, fallbackFrom: string }}
     */
    function resolveSmartTranslateModelChoice(managedOrDoc) {
        const managed = managedOrDoc && typeof managedOrDoc === 'object' && managedOrDoc.managedLlm
            ? normalizeManagedLlm(managedOrDoc.managedLlm)
            : normalizeManagedLlm(managedOrDoc);
        const requested = String(managed.smartTranslateModelId || '').trim();
        const modelId = resolveSmartTranslateModelId(managed);
        const fallbackFrom = (requested && modelId && requested !== modelId) ? requested : '';
        return { modelId, requestedId: requested, fallbackFrom };
    }

    /**
     * @param {object} [raw]
     * @param {{ preferCuda?: boolean, preferRocm?: boolean, cudaVersion?: string }} [hints]
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
        let smartTranslateModelId = String(raw.smartTranslateModelId || '').trim().slice(0, 64);
        // Retired Transub-JA test GGUFs — never keep as dialog/polish id.
        if (/^transub-ja/i.test(smartTranslateModelId)) {
            smartTranslateModelId = '';
        }
        // Dialog/polish slot: drop translate-only leftovers (GalTransl/Sakura/Hy-MT/…).
        if (smartTranslateModelId && isTranslateOnlyModel(smartTranslateModelId)) {
            smartTranslateModelId = '';
        }
        let activeModelId = String(raw.activeModelId || '').trim().slice(0, 64);
        if (/^transub-ja/i.test(activeModelId)) {
            activeModelId = 'sakura-1.5b';
        }
        const pulledFiltered = pulled.filter((id) => !/^transub-ja/i.test(String(id || '')));
        return {
            activeModelId,
            smartTranslateModelId,
            serverPort: Number.isFinite(port) && port >= 1024 && port <= 65535
                ? Math.round(port)
                : DEFAULT_SERVER_PORT,
            ollamaBaseUrl: String(raw.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL).trim() || DEFAULT_OLLAMA_BASE_URL,
            pulledIds: pulledFiltered,
            runtimeId: normalizeRuntimeId(
                String(raw.runtimeId || '').trim().slice(0, 64),
                detectPlatform(),
                detectArch(),
                hints,
            ),
            nGpuLayers: Number.isFinite(nGpu) ? Math.max(0, Math.min(999, Math.round(nGpu))) : 99,
            contextSize: Number.isFinite(ctx) ? Math.max(512, Math.min(131072, Math.round(ctx))) : 8192,
            labModels: normalizeLabModels(raw.labModels),
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
     * 未解锁 Pro 时目录可见的轻量模型：显式白名单 +（参数量 ≤ 上限，或 Sakura/GalTransl 任意规格）。
     * 不等于免费智能翻译资格（智能翻译始终需 Pro）。
     * @param {string|object|null|undefined} modelIdOrEntry
     */
    function isFreePipelineTranslateModel(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        if (!entry || entry.freePipelineTranslate !== true) return false;
        const b = Number(entry.paramBillion);
        if (!Number.isFinite(b) || b <= 0) return false;
        if (b <= FREE_PIPELINE_TRANSLATE_MAX_B) return true;
        // Sakura / GalTransl remain free at large sizes; Hy-MT / TranslateGemma still cap at ≤7B.
        const pf = String(entry.promptFamily || '').trim().toLowerCase();
        if (pf === 'sakura' || pf === 'galtransl') return true;
        const id = String(entry.id || '').trim().toLowerCase();
        return /galtransl/i.test(id)
            || /^sakura-/i.test(id);
    }

    function listFreePipelineTranslateModels() {
        return CATALOG.filter((m) => isFreePipelineTranslateModel(m)).map((m) => ({ ...m }));
    }

    /**
     * 翻译专用 / 不适合对话的模型：可做句级推理翻译，不可做影片简要 / 对话按行 / QC 润色 / 语境重构。
     * 覆盖 Sakura、GalTransl、Hy-MT、TranslateGemma、Hunyuan-MT 等。
     * @param {string|object|null|undefined} modelIdOrEntry
     */
    function isTranslateOnlyModel(modelIdOrEntry) {
        const entry = (modelIdOrEntry && typeof modelIdOrEntry === 'object')
            ? modelIdOrEntry
            : findCatalogEntry(modelIdOrEntry);
        if (entry) {
            if (entry.translateOnly === true) return true;
            const fam = String(entry.family || '').toLowerCase();
            if (
                fam === 'sakura'
                || fam === 'galtransl'
                || fam === 'hymt'
                || fam === 'hy-mt'
                || fam === 'translategemma'
                || fam === 'hunyuan'
            ) {
                return true;
            }
            const pf = String(entry.promptFamily || '').toLowerCase();
            if (
                pf === 'sakura'
                || pf === 'galtransl'
                || pf === 'hymt'
                || pf === 'translategemma'
                || pf === 'translategemmasub'
                || pf === 'hunyuan'
            ) {
                return true;
            }
        }
        const raw = String(
            (entry && entry.id)
            || (typeof modelIdOrEntry === 'string' ? modelIdOrEntry : '')
            || '',
        ).trim().toLowerCase();
        if (!raw) return false;
        return /(^|[/_\s.-])sakura([/_\s.-]|$)/i.test(raw)
            || /galtransl/i.test(raw)
            || /translategemma|translate[-_]?gemma/i.test(raw)
            || /^hy-?mt/i.test(raw)
            || /hunyuan|chimera/i.test(raw);
    }

    /**
     * 是否适合语境重构 / 影片理解 / 智能翻译（通用对话 / 影片简要）。
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
     * When hybrid sentence MT will unload the chat model anyway, prefer a small
     * installed Instruct for film brief (faster load, less VRAM) if the user
     * picked a 7B+ chat model.
     * @param {{ requestedId?: string, installedIds?: string[] }} [input]
     * @returns {string}
     */
    function pickHybridBriefModelId(input = {}) {
        const requested = String(input?.requestedId || '').trim();
        const ids = Array.isArray(input?.installedIds)
            ? input.installedIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const weight = (id) => {
            const key = String(id || '').trim();
            if (!key) return Infinity;
            const entry = findCatalogEntry(key);
            if (!entry || isTranslateOnlyModel(entry)) return Infinity;
            const b = Number(entry.paramBillion);
            return Number.isFinite(b) && b > 0 ? b : 99;
        };
        const reqW = requested ? weight(requested) : Infinity;
        if (requested && reqW <= 4) return requested;
        const small = ids
            .filter((id) => weight(id) <= 4)
            .sort((a, b) => weight(a) - weight(b) || a.localeCompare(b))[0] || '';
        if (small && reqW > 4) return small;
        return requested;
    }

    /**
     * If the requested Instruct is not among installedIds, pick a capable installed one.
     * Prefers ~7B.
     * - forChat / chatCapableOnly: never keep Sakura/Gal/Hy-MT/TG/Hunyuan — remap to chat.
     * - otherwise: explicit translate-only kept only when that id is in installedIds
     *   (sentence-MT picker); chat-only installed lists fall through to remap.
     * @param {{ requestedId?: string, installedIds?: string[], forChat?: boolean, chatCapableOnly?: boolean }} [input]
     * @returns {string}
     */
    function pickInstalledSmartTranslateModelId(input = {}) {
        const requested = String(input?.requestedId || '').trim();
        const forChat = !!(input?.forChat || input?.chatCapableOnly);
        const installed = (Array.isArray(input?.installedIds) ? input.installedIds : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        const lower = new Map(installed.map((id) => [id.toLowerCase(), id]));
        if (requested && isTranslateOnlyModel(requested) && !forChat) {
            const hitLite = lower.get(requested.toLowerCase());
            if (hitLite) return hitLite;
            const anyLiteInstalled = installed.some((id) => isTranslateOnlyModel(id));
            // Sentence-MT picker with empty/missing install: keep explicit lite id.
            // Chat-only installedIds (hybrid chat path): fall through and remap.
            if (anyLiteInstalled || installed.length === 0) return requested;
        }
        const capable = installed.filter((id) => {
            const entry = findCatalogEntry(id);
            return !!(entry && !isTranslateOnlyModel(entry));
        });
        if (!capable.length) {
            // Chat path must not echo translate-only when no Instruct is installed.
            if (forChat && isTranslateOnlyModel(requested)) return '';
            return forChat ? '' : requested;
        }
        const prefer = (forChat && isTranslateOnlyModel(requested)) ? '' : requested;
        const hit = capable.find((id) => id.toLowerCase() === prefer.toLowerCase());
        if (hit) return hit;
        const score = (id) => {
            const b = Number(findCatalogEntry(id)?.paramBillion);
            const n = Number.isFinite(b) && b > 0 ? b : 99;
            return Math.abs(n - 7) + (n > 8 ? 8 : 0);
        };
        return capable.slice().sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0] || '';
    }

    /**
     * Block translate-only models from being loaded as the chat/dialog LLM
     * (brief / line MT / polish / QC). Sentence MT uses hybrid-chunk / Sakura path instead.
     * @returns {null | { ok: false, error: string, code: string, modelId?: string }}
     */
    function getSmartTranslateModelBlock(modelIdOrName) {
        const id = String(modelIdOrName || '').trim();
        if (!id || !isTranslateOnlyModel(id)) return null;
        const entry = findCatalogEntry(id);
        const label = entry?.name || id;
        return {
            ok: false,
            error: `「${label}」是翻译专用模型，不能作为对话模型做影片简要 / 按行翻译 / 润色。请改选 Qwen2.5 Instruct 等通用对话模型；翻译专用模型用于句级推理翻译或智能翻译混合句级。`,
            code: 'model_translate_only',
            modelId: entry?.id || id,
        };
    }

    /** Alias: translate-only → smart-translate lite (no brief / polish). */
    function isSmartTranslateLiteModel(modelIdOrEntry) {
        return isTranslateOnlyModel(modelIdOrEntry);
    }

    return {
        DEFAULT_SERVER_PORT,
        LLAMA_CPP_TAG,
        DEFAULT_OLLAMA_BASE_URL,
        OLLAMA_DOWNLOAD_URL,
        FREE_PIPELINE_TRANSLATE_MAX_B,
        MAX_LAB_MODELS,
        RUNTIME_PACKAGES,
        RUNTIME_PACKAGE_VARIANTS,
        RUNTIME_PACKAGE_BY_ID,
        CATALOG,
        platformKey,
        getDefaultRuntimeId,
        getRuntimePackage,
        listRuntimePackages,
        normalizeLlamaCppTag,
        rewriteRuntimePackageTag,
        normalizeRuntimeId,
        listCatalog,
        listCatalogVisible,
        listFamilies,
        findCatalogEntry,
        findLabModelEntry,
        fileNameFromGgufUrl,
        normalizeGgufDownloadUrl,
        slugifyLabModelId,
        normalizeLabModelEntry,
        normalizeLabModels,
        resolveChatDefaults,
        resolveDraftModelEntry,
        emptyManagedLlm,
        normalizeManagedLlm,
        resolveSmartTranslateModelId,
        resolveSmartTranslateModelChoice,
        pickHybridBriefModelId,
        pickInstalledSmartTranslateModelId,
        normalizeLlmSource,
        parseMinRamGbFromHint,
        getModelScaleTier,
        isProScaleModel,
        isFreePipelineTranslateModel,
        listFreePipelineTranslateModels,
        isTranslateOnlyModel,
        isSmartTranslateLiteModel,
        supportsAdvancedReconstruct,
        getReconstructModelBlock,
        getSmartTranslateModelBlock,
    };
}));
