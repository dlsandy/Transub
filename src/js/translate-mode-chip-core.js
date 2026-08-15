/**
 * Main-window translate chip label / title view-model (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateModeChip = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateModeChipFactory() {
    const TRANSLATE_MODE_CHIP_LABELS = Object.freeze({
        engine: '机器',
        llm: '推理',
        sakura: '推理',
        smart: 'Pro译',
    });

    function translateModeLabel(mode) {
        return TRANSLATE_MODE_CHIP_LABELS[mode] || TRANSLATE_MODE_CHIP_LABELS.engine;
    }

    function shortMtModelChipLabel(modelId, { auto = false } = {}) {
        if (auto || !modelId) return '自动';
        const id = String(modelId || '').trim();
        if (!id) return '自动';
        if (/^opus-mt-ja/i.test(id)) return 'Opus·日';
        if (/^opus-mt-en/i.test(id)) return 'Opus·英';
        if (/^opus-mt-ko/i.test(id)) return 'Opus·韩';
        if (/^opus-mt-/i.test(id)) return 'Opus';
        if (/^sakura-1\.5b$/i.test(id)) return 'Sakura1.5';
        if (/^sakura-7b$/i.test(id)) return 'Sakura7';
        if (/galtransl-v4|galtransl.*v4.*4b/i.test(id)) return 'Galv4·4';
        if (/galtransl.*q6/i.test(id)) return 'Gal7·Q6';
        if (/galtransl/i.test(id)) return 'GalTransl7';
        if (/^sakura-/i.test(id)) return 'Sakura';
        const qwen = id.match(/^qwen(?:25|3)?-(\d+(?:\.\d+)?)b/i);
        if (qwen) return `Qwen${qwen[1]}`;
        if (id.length <= 10) return id;
        return `${id.slice(0, 9)}…`;
    }

    /**
     * @param {{
     *   task: string,
     *   mode: string,
     *   followSense?: boolean,
     *   auto?: boolean,
     *   autoSenseEnabled?: boolean,
     *   recommend?: { id?: string, preferId?: string, reason?: string },
     *   opusId?: string,
     *   llmId?: string,
     *   smartId?: string,
     *   hybridMt?: boolean,
     *   plotPolish?: boolean,
     * }} input
     * @returns {{ label: string, title: string, allow: boolean, mode: string }}
     */
    function buildTranslateChipViewModel(input = {}) {
        const task = String(input.task || '');
        const allow = task === 'translate' || task === 'dual';
        const mode = allow ? String(input.mode || 'engine') : 'engine';
        if (!allow) {
            return { label: '—', title: '翻译模式', allow: false, mode };
        }

        const followSense = !!input.followSense;
        const auto = !!input.auto;
        const autoSenseEnabled = !!input.autoSenseEnabled;
        const recommend = input.recommend || {};
        const llmId = String(input.llmId || '');
        const opusId = String(input.opusId || '');
        const smartId = String(input.smartId || '');

        if (mode === 'smart') {
            const hybrid = input.hybridMt !== false;
            const polish = input.plotPolish !== false;
            let scheme;
            if (hybrid && polish) {
                scheme = '智能翻译：推理模型句级 + 剧情贴合润色（可关）';
            } else if (hybrid) {
                scheme = '智能翻译：推理模型句级（贴合润色已关）';
            } else {
                scheme = '智能翻译：对话模型句级（需解锁 Pro）';
            }
            const specifiedId = hybrid ? llmId : smartId;
            if (auto || !specifiedId) {
                let title = scheme;
                if (recommend.reason) title = `${scheme} · ${recommend.reason}`;
                else if (hybrid) title = `${scheme} · 句级模型自动选`;
                else title = `${scheme} · 对话模型自动选`;
                return { label: '智能翻译', title, allow: true, mode };
            }
            const short = shortMtModelChipLabel(specifiedId);
            return {
                label: `智能翻译 · ${short}`,
                title: `${scheme} · 已指定 ${specifiedId}`,
                allow: true,
                mode,
            };
        }

        const specifiedId = (mode === 'llm' || mode === 'sakura') ? llmId : opusId;

        const quality = (mode === 'llm' || mode === 'sakura') ? '推理翻译' : '机器翻译';
        if (followSense || auto || !specifiedId) {
            let title;
            if (followSense || (auto && autoSenseEnabled && !specifiedId)) {
                title = `${quality}，模型按每部片子选`;
            } else {
                title = recommend.reason || `${quality}，自动选模型`;
            }
            return { label: quality, title, allow: true, mode };
        }

        const short = shortMtModelChipLabel(specifiedId);
        return {
            label: `${quality} · ${short}`,
            title: `已指定 ${specifiedId}`,
            allow: true,
            mode,
        };
    }

    return {
        TRANSLATE_MODE_CHIP_LABELS,
        translateModeLabel,
        shortMtModelChipLabel,
        buildTranslateChipViewModel,
    };
}));
