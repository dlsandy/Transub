'use strict';

/**
 * Dev-only bridge helpers for Sanitize 训练台: infer remap suggestions via Advanced LLM.
 */
const { asPlainObject, asString, EDITABLE_SUBTITLE_EXTS } = require('./ipc-validate');
const { readAdvancedDoc } = require('./advanced-license-data');
const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
const { logAdvancedLlmToEngine } = require('./advanced-llm-log');
const catalogCore = require('../src/js/advanced-managed-llm-catalog-core');

function parseJsonObject(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) { /* fall through */ }
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        try { return JSON.parse(fence[1].trim()); } catch (_) { /* ignore */ }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) { /* ignore */ }
    }
    return null;
}

/**
 * @param {object} payload
 * @param {import('electron').IpcMainInvokeEvent} event
 */
async function runMtTrainInferSuggest(payload = {}, event = null) {
    const { canOpenMtTrain, isMtTrainWindowSender } = require('./mt-train-window');
    const { app } = require('electron');
    const access = canOpenMtTrain(app);
    if (!access.ok) {
        return { ok: false, error: access.error || '无法使用学习向导', code: access.code || 'forbidden' };
    }
    if (event?.sender && !isMtTrainWindowSender(event.sender)) {
        return { ok: false, error: '仅学习向导窗口可调用', code: 'forbidden' };
    }

    const input = asPlainObject(payload);
    const ja = asString(input.ja || input.src, 2000).trim();
    const zhBad = asString(input.zh || input.zhBad || input.dst, 2000).trim();
    const after = asString(input.after, 2000).trim();
    const issues = Array.isArray(input.issues)
        ? input.issues.map((x) => String(x)).filter(Boolean).slice(0, 12)
        : String(input.note || '').split(/[,\s]+/).filter(Boolean).slice(0, 12);

    if (!ja || !zhBad) {
        return { ok: false, error: '需要日文与中文句子' };
    }

    const { requireSmartTranslate, stopManagedLlmServerQuiet } = require('./advanced-bridge');
    const gate = requireSmartTranslate({ faithfulTone: true });
    if (!gate.ok) {
        return {
            ...gate,
            error: gate.error || '推理需解锁 Pro / 配置可用模型',
            code: gate.code || 'not_entitled',
        };
    }

    const doc = readAdvancedDoc().doc || {};
    let llm = null;
    try {
        const overrideId = asString(input.modelId || input.smartTranslateModelId, 128).trim();
        let smartModelId = '';
        if (overrideId) {
            const block = typeof catalogCore.getSmartTranslateModelBlock === 'function'
                ? catalogCore.getSmartTranslateModelBlock(overrideId)
                : null;
            if (block?.ok === false) return block;
            smartModelId = overrideId;
        } else if (typeof catalogCore.resolveSmartTranslateModelChoice === 'function') {
            smartModelId = catalogCore.resolveSmartTranslateModelChoice(doc.managedLlm)?.modelId || '';
        }
        llm = await resolveAdvancedLlmConfig(doc, {
            activeModelId: smartModelId || undefined,
            requireSmartTranslateCapable: true,
        });
        if (!llm?.ok) {
            return llm || { ok: false, error: '无法解析 LLM 配置' };
        }
        logAdvancedLlmToEngine(llm, { feature: '训练台推理' });

        const { chatCompletions } = require('./advanced-llm-client');
        const system = [
            '你是字幕清洗规则训练助手。目标是产出可跨片子复用的局部规则，不是整句重译。',
            '只输出一个 JSON 对象，不要 markdown，字段：',
            '{"mode":"replace|blank","jaAnchor":"短日文锚点(≤12字,禁止整句)","zhFrom":"要替换的错误中文片段","zhTo":"改成的短片段","expectZh":"整句预览(可选)","why":"情形一句话"}',
            '硬性要求：',
            '1) zhFrom 尽量短（词/短语），禁止把整句当作 zhFrom；',
            '2) jaAnchor 必须短，优先重复词或片假名特征，禁止整句日文；',
            '3) prompt_leak / sfx / latin / 英文乱入 / 提示词 → mode=blank，不要翻译成中文；',
            '4) 领域错译（射/出来/行了/进去等）只改相关片段；',
            '5) 普通润色、同义改写 → 仍须给最短差异片段，否则不如 blank。',
        ].join('\n');
        const user = [
            `issues: ${issues.join(', ') || 'n/a'}`,
            `JA: ${ja}`,
            `ZH_BAD: ${zhBad}`,
            after && after !== zhBad ? `ZH_AFTER_SANITIZE: ${after}` : '',
        ].filter(Boolean).join('\n');

        const res = await chatCompletions({
            apiKey: llm.apiKey,
            baseUrl: llm.baseUrl,
            model: llm.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.2,
            timeoutMs: 90000,
            disableThinking: true,
        });
        if (!res?.ok) return res;
        const content = res.content || res.text || res.message || '';
        const parsed = parseJsonObject(content);
        if (!parsed || typeof parsed !== 'object') {
            return { ok: false, error: '模型未返回可用 JSON', raw: String(content).slice(0, 500) };
        }
        const mode = parsed.mode === 'blank' ? 'blank' : 'replace';
        const zhFrom = asString(parsed.zhFrom || '', 500).trim();
        const zhTo = asString(parsed.zhTo || '', 500).trim();
        let jaAnchor = asString(parsed.jaAnchor || '', 500).trim() || ja;
        // Never keep near-whole-sentence anchors from the model
        {
            const maxLen = 14;
            const s = String(jaAnchor || ja || '').trim();
            const parts = s.split(/[、。．.…・！？!?,，\s　]+/u).map((p) => p.trim()).filter((p) => p.length >= 2);
            const counts = new Map();
            for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
            const repeated = [...counts.entries()]
                .filter(([p, n]) => n >= 2 && p.length <= maxLen)
                .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
            if (repeated) jaAnchor = repeated[0];
            else if (s.length > maxLen) {
                const kata = (s.match(/[ァ-ヴー]{3,}/gu) || []).sort((a, b) => b.length - a.length)[0];
                jaAnchor = (kata && kata.length <= maxLen) ? kata : s.slice(0, maxLen);
            }
        }
        const expectZh = mode === 'blank'
            ? '…'
            : asString(parsed.expectZh || parsed.expect || '', 2000).trim()
                || (zhFrom ? String(zhBad).split(zhFrom).join(zhTo) : '');
        if (mode === 'replace' && !expectZh && !zhFrom) {
            return { ok: false, error: '模型未给出可复用片段', raw: parsed };
        }
        // Prefer blank for clear leak tags even if model tried to translate.
        const leak = issues.some((i) => /prompt_leak|sfx_halluc|latin|heixiu|ja_echo/i.test(i));
        const finalMode = leak && mode !== 'blank' && /[A-Za-z]{3,}/.test(zhBad) ? 'blank' : mode;
        return {
            ok: true,
            expectZh: finalMode === 'blank' ? '…' : expectZh,
            jaAnchor,
            mode: finalMode,
            zhFrom: finalMode === 'blank' ? zhFrom : (zhFrom || ''),
            zhTo: finalMode === 'blank' ? '' : zhTo,
            why: asString(parsed.why || '', 300).trim(),
            via: llm.source || 'llm',
            llmSource: llm.source,
            model: llm.model,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    } finally {
        try {
            if (llm?.source === 'managed' && typeof stopManagedLlmServerQuiet === 'function') {
                // keep server warm; no-op release — idle timer handles stop
            }
        } catch (_) { /* ignore */ }
    }
}

function assertMtTrainSender(event) {
    const { canOpenMtTrain, isMtTrainWindowSender } = require('./mt-train-window');
    const { app } = require('electron');
    const access = canOpenMtTrain(app);
    if (!access.ok) {
        return { ok: false, error: access.error || '无法使用学习向导', code: access.code || 'forbidden' };
    }
    if (event?.sender && !isMtTrainWindowSender(event.sender)) {
        return { ok: false, error: '仅学习向导窗口可调用', code: 'forbidden' };
    }
    return { ok: true };
}

/**
 * Flatten task-history outputs into JA/ZH subtitle pairs for the learning wizard.
 * JA often lives in transcript-keep as `{stem}.src.srt` when sourceSubtitlePath is empty.
 */
const historyPairsLib = require('../tools/mt-train/lib/history-pairs');

function collectHistorySubtitlePairs(entries, opts = {}) {
    return historyPairsLib.collectHistorySubtitlePairs(entries, opts);
}

function loadSettingsOptionsSafe() {
    try {
        const { loadSettings } = require('./settings-data');
        return loadSettings()?.options || {};
    } catch (_) {
        return {};
    }
}

function resolveJaFromKeep(output, zhPath) {
    const fs = require('fs');
    const source = String(output?.sourceSubtitlePath || '').trim();
    if (source && fs.existsSync(source)) return source;

    const { findKeptTranscript } = require('./transcript-keep');
    const kept = findKeptTranscript({
        videoPath: String(output?.videoPath || '').trim(),
        subPath: zhPath || String(output?.subtitlePath || '').trim(),
        options: loadSettingsOptionsSafe(),
    });
    if (kept?.found && kept.path) return kept.path;
    return historyPairsLib.resolveJaPathWithFallbacks(output, zhPath, {});
}

function listRecentSubtitlePairs(payload = {}) {
    const fs = require('fs');
    const { loadTaskHistory } = require('./task-history');
    const maxPairs = Number(payload?.maxPairs) > 0 ? Number(payload.maxPairs) : 40;
    const entries = loadTaskHistory().entries || [];
    const pairs = collectHistorySubtitlePairs(entries, {
        maxPairs,
        fileExists: (p) => {
            try { return !!(p && fs.existsSync(p)); } catch (_) { return false; }
        },
        resolveJaPath: resolveJaFromKeep,
    });
    return { ok: true, pairs, total: pairs.length };
}

function readSubtitleFileLimited(filePath, maxBytes = 8 * 1024 * 1024) {
    const fs = require('fs');
    const path = require('path');
    const resolved = path.resolve(String(filePath || ''));
    const ext = path.extname(resolved).toLowerCase();
    if (!EDITABLE_SUBTITLE_EXTS.has(ext)) {
        return { ok: false, error: `不支持的字幕格式：${ext || '(无)'}` };
    }
    if (!fs.existsSync(resolved)) {
        return { ok: false, error: '文件不存在', path: resolved };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
        return { ok: false, error: '不是文件', path: resolved };
    }
    if (stat.size > maxBytes) {
        return { ok: false, error: `字幕过大（>${Math.round(maxBytes / 1024 / 1024)}MB）`, path: resolved };
    }
    return {
        ok: true,
        path: resolved,
        name: path.basename(resolved),
        text: fs.readFileSync(resolved, 'utf8'),
        size: stat.size,
    };
}

function loadSubtitlePair(payload = {}) {
    const id = asString(payload.id || '', 256).trim();
    if (!id) return { ok: false, error: '缺少 pair id' };

    const listed = listRecentSubtitlePairs({ maxPairs: 80 });
    const pair = (listed.pairs || []).find((p) => p.id === id);
    if (!pair) {
        return { ok: false, error: '历史项不存在或字幕文件已缺失', code: 'not_found' };
    }

    const ja = readSubtitleFileLimited(pair.jaPath);
    if (!ja.ok) return { ok: false, error: `日文字幕：${ja.error}`, side: 'ja' };
    const zh = readSubtitleFileLimited(pair.zhPath);
    if (!zh.ok) return { ok: false, error: `中文字幕：${zh.error}`, side: 'zh' };

    return {
        ok: true,
        pair: {
            id: pair.id,
            jobId: pair.jobId,
            title: pair.title,
            finishedAt: pair.finishedAt,
            task: pair.task,
            videoPath: pair.videoPath,
        },
        ja: { name: ja.name, path: ja.path, text: ja.text },
        zh: { name: zh.name, path: zh.path, text: zh.text },
    };
}

function loadSubtitlePairs(payload = {}) {
    const ids = Array.isArray(payload.ids)
        ? payload.ids.map((x) => asString(x, 256).trim()).filter(Boolean).slice(0, 12)
        : [];
    if (!ids.length) return { ok: false, error: '缺少 pair ids' };
    const pairs = [];
    const errors = [];
    for (const id of ids) {
        const one = loadSubtitlePair({ id });
        if (one.ok) pairs.push(one);
        else errors.push({ id, error: one.error || 'load failed' });
    }
    return { ok: true, pairs, errors, count: pairs.length };
}

function registerMtTrainBridge(register, _app) {
    register('transub-mt-train-infer-suggest', async (event, payload = {}) => {
        try {
            return await runMtTrainInferSuggest(payload, event);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-list-history-pairs', async (event, payload = {}) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            return listRecentSubtitlePairs(asPlainObject(payload));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-load-history-pair', async (event, payload = {}) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            return loadSubtitlePair(asPlainObject(payload));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-load-history-pairs', async (event, payload = {}) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            return loadSubtitlePairs(asPlainObject(payload));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-consume-pending-pair', async (event) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            const { consumePendingLibraryPair } = require('./mt-train-window');
            return consumePendingLibraryPair();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-idle-status', async (event) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            const idle = require('./mt-train-idle');
            return idle.getIdleStatus(_app);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-idle-prefs', async (event, payload = {}) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            const idle = require('./mt-train-idle');
            return idle.setIdlePrefs(asPlainObject(payload), _app);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-mt-train-idle-run', async (event, payload = {}) => {
        try {
            const gate = assertMtTrainSender(event);
            if (!gate.ok) return gate;
            const idle = require('./mt-train-idle');
            const input = asPlainObject(payload);
            return await idle.runIdlePassNow(_app, {
                force: input.force !== false,
                label: input.label || 'manual-from-train',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
}

module.exports = {
    runMtTrainInferSuggest,
    registerMtTrainBridge,
    parseJsonObject,
    collectHistorySubtitlePairs,
    listRecentSubtitlePairs,
    loadSubtitlePair,
    loadSubtitlePairs,
};
