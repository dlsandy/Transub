/**
 * ASR-related settings normalization (perfProfile).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrSettings = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrSettingsFactory() {
    function normalizePerfProfile(raw, fallback = 'quality') {
        const v = String(raw || '').trim().toLowerCase();
        if (v === 'speed' || v === 'fast') return 'speed';
        if (v === 'quality' || v === 'accurate' || v === 'balanced') return 'quality';
        return fallback === 'speed' ? 'speed' : 'quality';
    }

    /**
     * @param {object} [input]
     * @returns {{ perfProfile: 'quality'|'speed' }}
     */
    function normalizeAsrExtraOptions(input = {}) {
        return {
            perfProfile: normalizePerfProfile(input.perfProfile, 'quality'),
        };
    }

    /**
     * Chip copy when engine /models/recommend differs from current ASR.
     * @param {{ currentAsr?: string, recommendedAsr?: string, profile?: string }} input
     */
    function describeAsrRecommendChip(input = {}) {
        const current = String(input.currentAsr || '').trim();
        const recommended = String(input.recommendedAsr || '').trim();
        const profile = String(input.profile || '').trim();
        if (!recommended || recommended === current) {
            return {
                visible: false,
                label: '',
                detail: '',
                recommendedAsr: recommended,
                profile,
            };
        }
        const profileZh = profile === 'speed' ? '速度'
            : (profile === 'quality' ? '质量' : (profile === 'balanced' ? '均衡' : profile));
        return {
            visible: true,
            label: `推荐 ASR：${recommended}`,
            detail: profileZh
                ? `按硬件推荐（${profileZh}档）· 当前 ${current || '未选'}`
                : `按硬件推荐 · 当前 ${current || '未选'}`,
            recommendedAsr: recommended,
            profile,
            applyLabel: '应用推荐',
        };
    }

    function needsWindowedAsrTip(asrModelId) {
        return /anime-whisper|kotoba-whisper/i.test(String(asrModelId || ''));
    }

    function isQwenAsrModel(asrModelId) {
        return /qwen3-asr|qwen3-forced-aligner/i.test(String(asrModelId || ''));
    }

    function describeQwenAsrRuntimeTip(asrModelId) {
        if (!isQwenAsrModel(asrModelId)) {
            return { visible: false, text: '' };
        }
        return {
            visible: true,
            text: (
                'Qwen3-ASR 依赖 PyTorch（qwen-asr / transformers）。'
                + '有 NVIDIA 显卡时，首次下载模型或转写会自动安装 CUDA 版 PyTorch（约 2.5GB，通常需 10–30 分钟）。'
                + '建议先在「系统检查」一键修复或下载模型时预装运行库；卡住可用「手动下载」→ CUDA PyTorch。'
            ),
        };
    }

    function describeWindowedAsrTip(_asrModelId) {
        // UI tip removed: windowing still happens in the engine when needed.
        return { visible: false, text: '' };
    }

    /**
     * Merge hardware /models/recommend ASR into sense overrides without
     * stomping JA/AV specialist picks.
     * @param {object} overrides
     * @param {{
     *   recommendedAsr?: string,
     *   profile?: string,
     *   installedModels?: Array<{id:string,installed?:boolean}|string>,
     * }} [ctx]
     * @returns {{ overrides: object, notes: string[], changed: boolean }}
     */
    function applyHardwareAsrRecommend(overrides = {}, ctx = {}) {
        const out = { ...(overrides || {}) };
        const notes = [];
        const recommended = String(ctx.recommendedAsr || '').trim();
        if (!recommended) {
            return { overrides: out, notes, changed: false };
        }
        const installedList = Array.isArray(ctx.installedModels) ? ctx.installedModels : [];
        const installed = new Set(
            installedList.map((m) => {
                if (!m) return '';
                if (typeof m === 'string') return m;
                return m.installed === false ? '' : String(m.id || '').trim();
            }).filter(Boolean),
        );
        if (installed.size && !installed.has(recommended)) {
            notes.push(`硬件推荐 ASR ${recommended} 未安装（跳过）`);
            return { overrides: out, notes, changed: false };
        }
        const current = String(out.engineAsrModel || '').trim();
        if (current === recommended) {
            return { overrides: out, notes, changed: false };
        }
        // Keep domain specialists chosen by content profile / sense.
        if (/whisper-ja|anime-whisper|kotoba|reazon|qwen3-asr|cohere-transcribe/i.test(current)) {
            notes.push(`保留感知 ASR ${current}（未改用硬件推荐 ${recommended}）`);
            return { overrides: out, notes, changed: false };
        }
        out.engineAsrModel = recommended;
        notes.push(current
            ? `ASR ${current} → ${recommended}（硬件推荐${ctx.profile ? ` · ${ctx.profile}` : ''}）`
            : `ASR → ${recommended}（硬件推荐）`);
        return { overrides: out, notes, changed: true };
    }

    return {
        normalizePerfProfile,
        normalizeAsrExtraOptions,
        describeAsrRecommendChip,
        needsWindowedAsrTip,
        isQwenAsrModel,
        describeQwenAsrRuntimeTip,
        describeWindowedAsrTip,
        applyHardwareAsrRecommend,
    };
}));
