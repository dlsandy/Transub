/**
 * Main-window translate chip label / title view-model (pure).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateModeChip = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateModeChipFactory(global) {
    function uiTf(template, vars) {
        try {
            if (typeof global !== 'undefined' && typeof global.TransubUiTf === 'function') {
                return global.TransubUiTf(template, vars);
            }
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tf === 'function') {
                return global.TransubI18n.tf(template, vars);
            }
        } catch { /* ignore */ }
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        try {
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tx === 'function') {
                return global.TransubI18n.tx(text);
            }
        } catch { /* ignore */ }
        return String(text || '');
    }

    const TRANSLATE_MODE_CHIP_LABELS = Object.freeze({
        engine: '推理',
        llm: '推理',
        sakura: '推理',
        external: '外部',
        byok: '外部',
        dialog: '智能',
        smart: '混合',
        hybrid: '混合',
        mixed: '混合',
    });

    function normalizeChipMode(raw) {
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'external' || m === 'byok' || m === 'external_mt' || m === 'openai') return 'external';
        if (m === 'smart' || m === 'hybrid' || m === 'advanced' || m === 'mixed') return 'smart';
        if (m === 'dialog' || m === 'smart_dialog' || m === 'llm_line' || m === 'chat') return 'dialog';
        if (m === 'sakura' || m === 'engine' || m === 'llm') return 'llm';
        return 'llm';
    }

    function translateModeLabel(mode) {
        return uiTx(TRANSLATE_MODE_CHIP_LABELS[normalizeChipMode(mode)] || TRANSLATE_MODE_CHIP_LABELS.llm);
    }

    function shortMtModelChipLabel(modelId, { auto = false } = {}) {
        if (auto || !modelId) return uiTx('自动');
        const id = String(modelId || '').trim();
        if (!id) return uiTx('自动');
        if (/^opus-mt-/i.test(id)) return uiTx('自动');
        if (/^sakura-1\.5b$/i.test(id)) return 'Sakura1.5';
        if (/^sakura-7b$/i.test(id)) return 'Sakura7';
        if (/^sakura-8b/i.test(id)) return 'Sakura8';
        if (/^sakura-14b-qwen3/i.test(id)) return 'Sakura14·Q3';
        if (/^sakura-14b.*q6/i.test(id)) return 'Sakura14·Q6';
        if (/^sakura-14b.*q4/i.test(id)) return 'Sakura14·Q4';
        if (/^sakura-14b/i.test(id)) return 'Sakura14';
        if (/galtransl-v4|galtransl.*v4.*4b/i.test(id)) return 'Galv4·4';
        if (/galtransl.*14b.*q6/i.test(id)) return 'Gal14·Q6';
        if (/galtransl.*14b.*q4/i.test(id)) return 'Gal14·Q4';
        if (/galtransl.*14b/i.test(id)) return 'GalTransl14';
        if (/galtransl.*q6/i.test(id)) return 'Gal7·Q6';
        if (/galtransl/i.test(id)) return 'GalTransl7';
        if (/^hy-?mt2/i.test(id)) return 'Hy-MT2·7';
        if (/hy-?mt1\.?5-?1\.?8|hy-?mt15-1\.8/i.test(id)) return 'HyMT15·1.8A';
        if (/hy-?mt1\.?5|hy-?mt15/i.test(id)) return 'HyMT15·A';
        if (/chimera/i.test(id) && /hunyuan|huihui/i.test(id)) return 'HyChimera·A';
        if (/^hunyuan-mt-7b-abliterated/i.test(id)) return 'HyMT·A';
        if (/gemma4-e2b|gemma-4-e2b/i.test(id)) return 'G4·E2A';
        if (/gemma4-e4b|gemma-4-e4b/i.test(id)) return 'G4·E4A';
        if (/gemma4-26b|gemma-4-26b/i.test(id)) return 'G4·26A';
        if (/gemma4-12b|gemma-4-12b/i.test(id)) return 'G4·12A';
        if (/translategemma-4-sub|translate[-_]?gemma[-_]?4[-_]?sub/i.test(id)) return 'TGSub·E4';
        if (/translategemma-4b/i.test(id)) return 'TG·4';
        if (/translategemma-12b/i.test(id)) return 'TG·12';
        if (/translategemma-27b/i.test(id)) return 'TG·27';
        if (/translategemma/i.test(id)) return 'TG';
        if (/^sakura-/i.test(id)) return 'Sakura';
        const ablit35 = id.match(/^qwen35-(\d+(?:\.\d+)?)b(?:-a\d+b)?-abliterated(?:-q(\d+))?/i);
        if (ablit35) {
            return ablit35[2] ? `Q35·${ablit35[1]}A${ablit35[2]}` : `Q35·${ablit35[1]}A`;
        }
        const ablit = id.match(/^qwen3-(\d+(?:\.\d+)?)b(?:-a\d+b)?-abliterated(?:-q(\d+))?/i);
        if (ablit) {
            return ablit[2] ? `Qwen${ablit[1]}·A${ablit[2]}` : `Qwen${ablit[1]}·A`;
        }
        const qwen35 = id.match(/^qwen35-(\d+(?:\.\d+)?)b/i);
        if (qwen35) return `Q35·${qwen35[1]}`;
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
        const mode = allow ? normalizeChipMode(input.mode || 'llm') : 'llm';
        if (!allow) {
            return { label: '—', title: uiTx('翻译模式'), allow: false, mode };
        }

        const auto = !!input.auto;
        const recommend = input.recommend || {};
        const llmId = String(input.llmId || '');
        const smartId = String(input.smartId || '');

        if (mode === 'dialog') {
            const polish = input.plotPolish !== false;
            const scheme = polish
                ? uiTx('智能翻译：对话模型按行 + 剧情贴合润色（需解锁 Pro）')
                : uiTx('智能翻译：对话模型按行（贴合润色已关；需解锁 Pro）');
            const specifiedId = smartId || llmId;
            if (auto || !specifiedId) {
                let title = scheme;
                if (recommend.reason) title = uiTf('{scheme} · {reason}', { scheme, reason: recommend.reason });
                else title = uiTf('{scheme} · 对话模型自动选', { scheme });
                return { label: uiTx('智能翻译'), title, allow: true, mode };
            }
            const short = shortMtModelChipLabel(specifiedId);
            return {
                label: uiTf('智能翻译 · {short}', { short }),
                title: uiTf('{scheme} · 已指定 {id}', { scheme, id: specifiedId }),
                allow: true,
                mode,
            };
        }

        if (mode === 'smart') {
            const hybrid = input.hybridMt !== false;
            const polish = input.plotPolish !== false;
            let scheme;
            if (hybrid && polish) {
                scheme = uiTx('混合翻译（翻译 + 剧情贴合润色）');
            } else if (hybrid) {
                scheme = uiTx('混合翻译（翻译；贴合润色已关）');
            } else {
                scheme = uiTx('混合翻译：降级为对话模型按行（需解锁 Pro）');
            }
            const sentenceId = hybrid ? llmId : '';
            const polishId = String(input.smartId || '');
            const specifiedId = hybrid ? sentenceId : polishId;
            if (auto || (!specifiedId && !(hybrid && polishId))) {
                let title = scheme;
                if (recommend.reason) title = uiTf('{scheme} · {reason}', { scheme, reason: recommend.reason });
                else if (hybrid && polishId) {
                    title = uiTf('{scheme} · 翻译自动 · 润色 {id}', { scheme, id: polishId });
                } else if (hybrid) title = uiTf('{scheme} · 翻译模型自动选', { scheme });
                else title = uiTf('{scheme} · 对话模型自动选', { scheme });
                if (hybrid && polishId) {
                    const short = shortMtModelChipLabel(polishId);
                    return {
                        label: uiTf('混合翻译 · 润色{short}', { short }),
                        title,
                        allow: true,
                        mode,
                    };
                }
                return { label: uiTx('混合翻译'), title, allow: true, mode };
            }
            if (hybrid && sentenceId && polishId) {
                const s = shortMtModelChipLabel(sentenceId);
                const p = shortMtModelChipLabel(polishId);
                return {
                    label: uiTf('混合 · {s}+{p}', { s, p }),
                    title: uiTf('{scheme} · 翻译 {sid} · 润色 {pid}', {
                        scheme, sid: sentenceId, pid: polishId,
                    }),
                    allow: true,
                    mode,
                };
            }
            const short = shortMtModelChipLabel(specifiedId || polishId);
            return {
                label: uiTf('混合翻译 · {short}', { short }),
                title: uiTf('{scheme} · 已指定 {id}', { scheme, id: specifiedId || polishId }),
                allow: true,
                mode,
            };
        }

        const specifiedId = llmId;

        const quality = uiTx('推理翻译');
        if (auto || !specifiedId) {
            const title = recommend.reason || uiTf('{quality}，自动选模型', { quality });
            return { label: quality, title, allow: true, mode };
        }

        const short = shortMtModelChipLabel(specifiedId);
        return {
            label: uiTf('{quality} · {short}', { quality, short }),
            title: uiTf('已指定 {id}', { id: specifiedId }),
            allow: true,
            mode,
        };
    }

    return {
        TRANSLATE_MODE_CHIP_LABELS,
        normalizeChipMode,
        translateModeLabel,
        shortMtModelChipLabel,
        buildTranslateChipViewModel,
    };
}));
