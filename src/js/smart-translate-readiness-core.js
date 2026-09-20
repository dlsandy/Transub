/**
 * Pro smart-translate dual-model readiness (sentence Sakura/GalTransl + chat polish).
 * Pure helpers — no DOM / IPC.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSmartTranslateReadiness = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function smartTranslateReadinessFactory(global) {
    function hybridApi() {
        try {
            if (typeof module !== 'undefined' && module.exports) {
                return require('./smart-translate-hybrid-core');
            }
        } catch (_) { /* ignore */ }
        return global?.TransubSmartTranslateHybrid || null;
    }

    function asIds(list) {
        return (Array.isArray(list) ? list : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
    }

    /**
     * @param {{ preferredId?: string, installedIds?: string[] }} input
     * @returns {string}
     */
    function resolveHybridSentenceModelId(input = {}) {
        const api = hybridApi();
        const pref = String(input.preferredId || '').trim();
        // General chat/LLM in the sentence slot is not a hybrid specialist — no id.
        if (pref && api?.isTranslateOnlyLike && !api.isTranslateOnlyLike(pref)) {
            return '';
        }
        if (api?.pickHybridMtModelId) {
            return String(api.pickHybridMtModelId({
                preferredId: pref,
                installedIds: asIds(input.installedIds),
                subtitleTargetLang: input.subtitleTargetLang || input.targetLang,
                targetLang: input.targetLang || input.subtitleTargetLang,
                chineseSubtitleVariant: input.chineseSubtitleVariant,
                language: input.language,
            }) || '').trim();
        }
        const installed = asIds(input.installedIds);
        if (pref && installed.some((id) => id.toLowerCase() === pref.toLowerCase())) return pref;
        return installed[0] || '';
    }

    /**
     * @param {string} [reason]
     * @returns {string}
     */
    function formatHybridSkipProgressMessage(reason) {
        const r = String(reason || '').trim();
        if (r === 'no_model') {
            return '混合翻译 · 降级（仅对话模型按行）⚠️ 未找到已下载的推理翻译模型（Sakura / GalTransl）';
        }
        if (r === 'not_ja') {
            return '非日语片源，混合翻译已跳过（改用对话模型分块译）';
        }
        if (r === 'intl_target') {
            return '当前成片目标语不支持句级混合（改用对话模型分块译）';
        }
        if (r === 'model_target') {
            return '当前句级模型与成片目标语不匹配（改用对话模型分块译）';
        }
        if (r === 'disabled') {
            return '混合翻译不可用，改用对话模型按行翻译';
        }
        if (r === 'not_translate_only') {
            return '混合翻译 · 降级（仅对话模型按行）⚠️ 翻译选了通用模型（星火/Qwen 等），已改用对话模型直译，未替换为 GalTransl';
        }
        return r ? `混合翻译已跳过（${r}）` : '混合翻译已跳过';
    }

    /**
     * Short mode tag for logs / completion lines.
     * @param {{ hybridUsed?: boolean, hybridSkipReason?: string, polishSkipped?: boolean, dialogMode?: boolean }} input
     */
    function formatSmartTranslateModeTag(input = {}) {
        if (input.dialogMode) {
            return '智能翻译（对话模型按行）';
        }
        if (input.hybridUsed) {
            return input.polishSkipped
                ? '混合翻译（翻译；润色已跳过）'
                : '混合翻译（翻译 + 剧情贴合润色）';
        }
        const reason = String(input.hybridSkipReason || '').trim();
        if (reason === 'no_model' || reason === 'not_translate_only') {
            return '混合翻译 · 降级（仅对话模型按行）';
        }
        if (reason === 'disabled') {
            return '混合翻译 · 对话模型按行';
        }
        if (reason === 'not_ja' || reason === 'intl_target') {
            return '混合翻译 · 对话模型分块（翻译不适用）';
        }
        return '混合翻译';
    }

    /**
     * Wizard: when Pro + 「更准」+ JA/auto allows Sakura, recommend sentence + chat pair.
     * @returns {string[]}
     */
    function recommendWizardMtPair(input = {}) {
        const task = String(input.task || 'translate');
        if (task === 'transcribe') return [];
        const translatePref = String(input.translatePref || 'sakura');
        const language = String(input.language || 'auto');
        const advancedEntitled = !!input.advancedEntitled;
        const allowSakura = input.allowSakura !== false
            && (language === 'ja' || language === 'auto' || language === 'jp' || language === 'jpn');
        const sakuraId = String(input.sakuraId || 'sakura-1.5b').trim() || 'sakura-1.5b';
        const chatId = String(input.chatId || 'qwen25-7b').trim() || 'qwen25-7b';
        const fallback = String(input.fallbackId || chatId).trim();

        if (translatePref === 'sakura' && allowSakura) {
            if (advancedEntitled) return [sakuraId, chatId];
            return [sakuraId];
        }
        if (translatePref === 'sakura' && !allowSakura) {
            return fallback ? [fallback] : [chatId];
        }
        // 「更快更省」: keep single light pick; caller supplies primary.
        const primary = String(input.primaryId || fallback || chatId).trim();
        return primary ? [primary] : [];
    }

    /**
     * @returns {{
     *   applicable: boolean,
     *   hybridWanted: boolean,
     *   hybridAllowed: boolean,
     *   sentenceReady: boolean,
     *   chatReady: boolean,
     *   hybridModelId: string,
     *   level: string,
     *   stripPart: string,
     *   tone: 'ok'|'warn',
     *   action: { label: string, action: string }|null,
     *   bannerText: string,
     *   dualSlots: { sentence: { ok: boolean, label: string }, chat: { ok: boolean, label: string } },
     *   preflight: null|{
     *     kind: string,
     *     title: string,
     *     message: string,
     *     primaryLabel: string,
     *     secondaryLabel: string,
     *     tertiaryLabel?: string,
     *     primaryAction: string,
     *     block: boolean,
     *   },
     * }}
     */
    function assessSmartTranslateReadiness(input = {}) {
        const task = String(input.task || '');
        const modeRaw = String(input.translateMode || input.mode || '').trim().toLowerCase();
        const mode = (modeRaw === 'dialog' || modeRaw === 'smart_dialog' || modeRaw === 'llm_line' || modeRaw === 'chat')
            ? 'dialog'
            : (modeRaw === 'smart' || modeRaw === 'hybrid' || modeRaw === 'advanced' || modeRaw === 'mixed'
                ? 'smart'
                : modeRaw);
        const isDialogMode = mode === 'dialog';
        const advancedEntitled = !!input.advancedEntitled;
        const hybridAllowed = isDialogMode ? false : (input.hybridAllowed !== false);
        const hybridWanted = isDialogMode
            ? false
            : (input.hybridEnabled !== false && input.hybridEnabled !== 0);
        const polishWanted = isDialogMode
            ? false
            : (input.polishEnabled !== false && input.polishEnabled !== 0);
        const chatReady = !!input.chatReady;
        const chatLabel = String(input.chatLabel || '').trim();
        const preferredHybridRaw = isDialogMode ? '' : String(input.preferredHybridId || '').trim();
        const api = hybridApi();
        const preferredIsGeneralLlm = !!(
            preferredHybridRaw
            && api?.isTranslateOnlyLike
            && !api.isTranslateOnlyLike(preferredHybridRaw)
        );
        const hybridModelId = resolveHybridSentenceModelId({
            preferredId: preferredHybridRaw,
            installedIds: input.hybridInstalledIds || input.installedIds,
        });
        const sentenceReady = !!hybridModelId;
        const applicable = (task === 'translate' || task === 'dual')
            && (mode === 'smart' || mode === 'dialog')
            && advancedEntitled;

        const dualSlots = {
            sentence: {
                ok: sentenceReady,
                label: sentenceReady
                    ? `翻译模型：已装 ${hybridModelId}`
                    : (isDialogMode
                        ? '翻译模型：智能翻译不使用'
                        : '翻译模型：未装（Sakura / GalTransl）'),
            },
            chat: {
                ok: chatReady,
                label: chatReady
                    ? (chatLabel
                        ? (isDialogMode ? `对话模型：${chatLabel}` : `润色模型：${chatLabel}`)
                        : (isDialogMode ? '对话模型：已就绪' : '润色模型：已就绪'))
                    : (isDialogMode
                        ? '对话模型：未配置（软件内 Qwen 或 BYOK）'
                        : '润色模型：未配置（软件内 Qwen 或 BYOK）'),
            },
        };

        const empty = {
            applicable: false,
            hybridWanted,
            hybridAllowed,
            sentenceReady,
            chatReady,
            hybridModelId,
            level: 'n/a',
            stripPart: '',
            tone: 'ok',
            action: null,
            bannerText: '',
            dualSlots,
            preflight: null,
        };
        if (!applicable) return empty;

        // Intentional 智能翻译 (dialog): chat-only, never treated as hybrid degrade.
        if (isDialogMode) {
            if (!chatReady) {
                return {
                    ...empty,
                    applicable: true,
                    hybridWanted: false,
                    level: 'missing_chat',
                    stripPart: '智能译缺对话模型',
                    tone: 'warn',
                    action: { label: '去配置对话模型', action: 'pro-smart-translate' },
                    bannerText: '智能翻译需先配置对话模型（软件内或 BYOK）。',
                    preflight: {
                        kind: 'missing_chat',
                        title: '智能翻译缺少对话模型',
                        message: '智能翻译由对话模型按行翻译。\n\n请先在本页「模型搭配」选用润色模型，或到「外部翻译」页配置 BYOK。',
                        primaryLabel: '去配置',
                        secondaryLabel: '取消',
                        primaryAction: 'pro-smart-translate',
                        block: true,
                    },
                };
            }
            return {
                ...empty,
                applicable: true,
                hybridWanted: false,
                level: 'dialog_chat_ok',
                stripPart: chatLabel ? `智能译 ${chatLabel}` : '智能译 · 对话模型',
                tone: 'ok',
                action: null,
                bannerText: '',
                preflight: null,
            };
        }

        // Hybrid not applicable for this target / language — chat-only path is expected.
        if (!hybridAllowed) {
            if (!chatReady) {
                return {
                    ...empty,
                    applicable: true,
                    hybridWanted: false,
                    level: 'missing_chat',
                    stripPart: '混合译缺对话模型',
                    tone: 'warn',
                    action: { label: '去配置对话模型', action: 'pro-smart-translate' },
                    bannerText: '当前成片无法用专训翻译；混合翻译需先配置对话模型（软件内或 BYOK）。',
                    preflight: {
                        kind: 'missing_chat',
                        title: '混合翻译缺少对话模型',
                        message: '当前目标语不能使用 Sakura/GalTransl 翻译，需要对话模型按行翻译。\n\n请先在本页「模型搭配」选用润色模型，或到「外部翻译」页配置 BYOK。',
                        primaryLabel: '去配置',
                        secondaryLabel: '取消',
                        primaryAction: 'pro-smart-translate',
                        block: true,
                    },
                };
            }
            return {
                ...empty,
                applicable: true,
                hybridWanted: false,
                level: 'chat_only_ok',
                stripPart: chatLabel ? `混合译 ${chatLabel}` : '混合译 · 对话模型',
                tone: 'ok',
                action: null,
                bannerText: '',
                preflight: null,
            };
        }

        if (!hybridWanted) {
            if (!chatReady) {
                return {
                    ...empty,
                    applicable: true,
                    level: 'hybrid_off_no_chat',
                    stripPart: '混合译缺对话模型',
                    tone: 'warn',
                    action: { label: '去配置对话模型', action: 'pro-smart-translate' },
                    bannerText: '专训翻译暂不可用：整段由对话模型按行翻译，请先配置对话模型。',
                    preflight: {
                        kind: 'hybrid_off_no_chat',
                        title: '混合翻译缺少对话模型',
                        message: '专训翻译暂不可用，将由对话模型按行翻译，但尚未配置对话模型。',
                        primaryLabel: '去配置',
                        secondaryLabel: '取消',
                        primaryAction: 'pro-smart-translate',
                        block: true,
                    },
                };
            }
            return {
                ...empty,
                applicable: true,
                level: 'hybrid_off_chat',
                stripPart: '混合译 · 按行（无翻译）',
                tone: 'ok',
                action: null,
                bannerText: '专训翻译暂不可用：整段由对话模型按行翻译。日语→中文建议下载 Sakura/GalTransl。',
                preflight: null,
            };
        }

        // Hybrid wanted + allowed
        if (sentenceReady && chatReady) {
            return {
                ...empty,
                applicable: true,
                level: 'full',
                stripPart: `混合译 ${hybridModelId}`,
                tone: 'ok',
                action: null,
                bannerText: '',
                preflight: null,
            };
        }

        if (sentenceReady && !chatReady) {
            const soft = polishWanted;
            return {
                ...empty,
                applicable: true,
                level: 'sentence_only',
                stripPart: soft ? `混合翻译 · 润色将跳过` : `混合翻译 ${hybridModelId}`,
                tone: soft ? 'warn' : 'ok',
                action: soft
                    ? { label: '去配置润色模型', action: 'pro-smart-translate' }
                    : null,
                bannerText: soft
                    ? `翻译模型已就绪（${hybridModelId}），但未配置润色模型——剧情贴合润色会跳过。可在本页「模型搭配」补下 Qwen，或到「外部翻译」页改用 BYOK。`
                    : '',
                preflight: soft
                    ? {
                        kind: 'sentence_only',
                        title: '润色模型未就绪',
                        message: `混合翻译将使用「${hybridModelId}」，但未配置润色模型，剧情贴合润色会跳过。\n\n可先去下载/配置润色模型，或仍以仅翻译继续。`,
                        primaryLabel: '去配置润色模型',
                        secondaryLabel: '取消',
                        tertiaryLabel: '仅翻译继续',
                        primaryAction: 'pro-smart-translate',
                        block: false,
                    }
                    : null,
            };
        }

        if (!sentenceReady && chatReady) {
            if (preferredIsGeneralLlm) {
                return {
                    ...empty,
                    applicable: true,
                    level: 'chat_degraded',
                    stripPart: '混合译 · 翻译用了通用模型',
                    tone: 'warn',
                    action: { label: '改选翻译模型', action: 'models' },
                    bannerText: `翻译槽选了通用模型「${preferredHybridRaw}」（星火/Qwen 等），不会改成 GalTransl；将改用对话模型按行翻译。日语→中文完整混合翻译请把翻译改成 Sakura/GalTransl，或改用「推理翻译」直接跑星火。`,
                    dualSlots: {
                        ...dualSlots,
                        sentence: {
                            ok: false,
                            label: `翻译模型：已选通用模型 ${preferredHybridRaw}（将降级对话按行）`,
                        },
                    },
                    preflight: {
                        kind: 'chat_degraded',
                        title: '翻译选了通用模型',
                        message: `当前翻译模型是「${preferredHybridRaw}」，不是 Sakura/GalTransl 专训模型。\n\n继续将用对话模型按行翻译（不会静默换成 GalTransl）。\n\n若要完整混合翻译：翻译改选 Sakura/GalTransl。\n若要整段用星火：请改用「推理翻译」。`,
                        primaryLabel: '去选专训模型',
                        secondaryLabel: '取消',
                        tertiaryLabel: '仍要继续（对话按行）',
                        primaryAction: 'models',
                        block: false,
                    },
                };
            }
            return {
                ...empty,
                applicable: true,
                level: 'chat_degraded',
                stripPart: '混合译降级 · 缺专训',
                tone: 'warn',
                action: { label: '去下载专训模型', action: 'models' },
                bannerText: '只配了对话模型（如 Qwen）时无法跑完整混合翻译：会改成对话模型按行翻，通常更慢、质量也容易下降。请到主界面「模型管理」再下载 Sakura / GalTransl。',
                preflight: {
                    kind: 'chat_degraded',
                    title: '混合翻译缺少翻译模型',
                    message: '当前只检测到对话模型，没有已下载的专训推理翻译模型（Sakura / GalTransl）。\n\n继续将降级为「对话模型按行翻译」——字幕质量通常不如完整混合翻译，任务也往往更久。\n\n建议先下载专训模型后再跑。',
                    primaryLabel: '去下载专训模型',
                    secondaryLabel: '取消',
                    tertiaryLabel: '仍要继续（降级）',
                    primaryAction: 'models',
                    block: false,
                },
            };
        }

        // Neither
        return {
            ...empty,
            applicable: true,
            level: 'missing_both',
            stripPart: '混合译缺模型',
            tone: 'warn',
            action: { label: '去配置模型', action: 'models' },
            bannerText: '混合翻译需要两套模型：翻译模型（Sakura/GalTransl）+ 润色模型（Qwen 或 BYOK）。目前都未就绪。',
            preflight: {
                kind: 'missing_both',
                title: '混合翻译模型未就绪',
                message: '混合翻译需要：\n1）主界面「模型管理」中的专训推理翻译（Sakura / GalTransl）\n2）本页「模型搭配」的润色模型（或 BYOK）\n\n请先补齐后再开始。',
                primaryLabel: '去下载专训模型',
                secondaryLabel: '取消',
                tertiaryLabel: '去配置润色模型',
                primaryAction: 'models',
                tertiaryAction: 'pro-smart-translate',
                block: true,
            },
        };
    }

    return {
        resolveHybridSentenceModelId,
        formatHybridSkipProgressMessage,
        formatSmartTranslateModeTag,
        recommendWizardMtPair,
        assessSmartTranslateReadiness,
    };
}));
