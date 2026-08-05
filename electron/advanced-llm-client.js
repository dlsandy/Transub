/**
 * OpenAI 兼容 Chat Completions（BYOK）
 */
const { asString, asPlainObject, asNumber } = require('./ipc-validate');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 120000;

function normalizeBaseUrl(baseUrl) {
    let u = asString(baseUrl, 2048).trim() || DEFAULT_BASE_URL;
    u = u.replace(/\/+$/, '');
    if (u.endsWith('/chat/completions')) {
        return u.slice(0, -'/chat/completions'.length);
    }
    return u;
}

function resolveChatCompletionsUrl(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function resolveModelsUrl(baseUrl) {
    return `${normalizeBaseUrl(baseUrl)}/models`;
}

/**
 * Turn opaque undici "fetch failed" into an actionable Chinese message.
 * @param {unknown} err
 * @param {{ baseUrl?: string }} [ctx]
 * @returns {string}
 */
function formatLlmNetworkError(err, ctx = {}) {
    const e = err && typeof err === 'object' ? err : {};
    const cause = e.cause && typeof e.cause === 'object' ? e.cause : {};
    const nested = cause.cause && typeof cause.cause === 'object' ? cause.cause : {};
    const code = String(nested.code || cause.code || e.code || '').toUpperCase();
    const causeMsg = String(
        nested.message || cause.message || e.message || err || '',
    ).trim();
    const base = normalizeBaseUrl(ctx.baseUrl || '');
    let host = base;
    try {
        host = new URL(base).host || base;
    } catch (_) { /* keep base */ }
    const local = /127\.0\.0\.1|localhost/i.test(`${host} ${base} ${ctx.baseUrl || ''}`);
    const resetLike = code === 'ECONNRESET'
        || code === 'UND_ERR_SOCKET'
        || /ECONNRESET|UND_ERR_SOCKET|连接被重置/i.test(`${causeMsg} ${code}`);

    if (e.name === 'AbortError' || code === 'ABORT_ERR') {
        return '请求超时';
    }
    if (code === 'ECONNREFUSED') {
        return local
            ? `无法连接本地模型 ${host}（连接被拒绝）。请确认软件内模型 / llama-server 已启动。`
            : `无法连接 ${host}（连接被拒绝）。请确认本地模型 / API 服务已启动，或检查 Base URL。`;
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return `无法解析 ${host} 的域名，请检查 Base URL 或 DNS。`;
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT'
        || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
        return `连接 ${host} 超时。请检查网络、代理，或稍后重试。`;
    }
    if (resetLike) {
        if (local) {
            return [
                `本地模型服务（${host}）连接被重置，通常是 llama-server 中途退出。`,
                '常见原因：显存不足、上下文过长、或 GPU 驱动异常。',
                '可尝试：设置中减小 GPU 层数 / 上下文，换更小模型，或先「测试连接」后再跑理解重构。',
            ].join('');
        }
        return `与 ${host} 的连接被重置。请检查代理 / 防火墙，或确认服务未中途退出。`;
    }
    if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
        || code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        return `连接 ${host} 时证书校验失败。`;
    }
    if (causeMsg === 'fetch failed' || causeMsg === 'Failed to fetch' || !causeMsg) {
        const hint = local
            ? '请确认本地大模型（llama-server / Ollama）已启动，并在设置中测试连接。'
            : '请检查 Base URL、API Key、网络与代理设置，并在设置中测试连接。';
        return `无法连接大模型接口 ${host}。${hint}`;
    }
    return `无法连接 ${host}（${causeMsg}${code ? ` / ${code}` : ''}）`;
}

/**
 * 测试 BYOK / Ollama 连通性：优先 GET /models，再可选探测指定 model。
 */
async function testConnection(options = {}) {
    const opts = asPlainObject(options);
    const apiKey = asString(opts.apiKey, 8192).trim() || 'ollama';
    const model = asString(opts.model, 256).trim();
    const baseUrl = normalizeBaseUrl(opts.baseUrl);
    const timeoutMs = asNumber(opts.timeoutMs, { min: 3000, max: 60000, fallback: 15000 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const modelsUrl = resolveModelsUrl(baseUrl);
        let modelsRes;
        try {
            modelsRes = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: controller.signal,
            });
        } catch (err) {
            if (err?.name === 'AbortError') {
                return { ok: false, error: '连接超时', code: 'timeout' };
            }
            return {
                ok: false,
                error: formatLlmNetworkError(err, { baseUrl }),
                code: 'network',
            };
        }

        const rawText = await modelsRes.text();
        let data = null;
        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch (_) {
            data = null;
        }

        if (!modelsRes.ok) {
            // 部分网关无 /models，回退到极短 chat
            if (modelsRes.status === 404 || modelsRes.status === 405) {
                return testConnectionViaChat({
                    apiKey,
                    baseUrl,
                    model: model || DEFAULT_MODEL,
                    signal: controller.signal,
                });
            }
            const msg = data?.error?.message || data?.message || rawText?.slice(0, 200) || `HTTP ${modelsRes.status}`;
            return { ok: false, error: msg, code: 'http_error', status: modelsRes.status };
        }

        const list = Array.isArray(data?.data) ? data.data : [];
        const ids = list.map((m) => String(m?.id || m?.name || '').trim()).filter(Boolean);
        const modelOk = !model || ids.some((id) => id === model || id.startsWith(`${model}:`) || id.includes(model));

        if (model && !modelOk) {
            // Ollama 有时 /models 的 id 就是完整名；再试一次 chat 确认
            const chatProbe = await testConnectionViaChat({
                apiKey,
                baseUrl,
                model,
                signal: controller.signal,
            });
            if (chatProbe.ok) {
                return {
                    ok: true,
                    message: `已连接，模型「${model}」可用（列出 ${ids.length} 个模型）`,
                    baseUrl,
                    modelCount: ids.length,
                    models: ids.slice(0, 20),
                };
            }
            return {
                ok: false,
                error: `已连上接口，但未找到模型「${model}」。可用：${ids.slice(0, 8).join(', ') || '（空）'}`,
                code: 'model_missing',
                models: ids.slice(0, 20),
            };
        }

        return {
            ok: true,
            message: model
                ? `连接成功，模型「${model}」可用（共 ${ids.length} 个）`
                : `连接成功（共 ${ids.length} 个模型）`,
            baseUrl,
            modelCount: ids.length,
            models: ids.slice(0, 20),
        };
    } finally {
        clearTimeout(timer);
    }
}

async function testConnectionViaChat({ apiKey, baseUrl, model, signal }) {
    const llm = await chatCompletions({
        apiKey,
        baseUrl,
        model,
        temperature: 0,
        timeoutMs: 20000,
        signal,
        messages: [
            { role: 'user', content: 'Reply with exactly: OK' },
        ],
    });
    if (!llm.ok) {
        return { ok: false, error: llm.error || 'Chat 探测失败', code: llm.code || 'chat_failed' };
    }
    return {
        ok: true,
        message: `连接成功（Chat 探测通过，模型 ${model}）`,
        baseUrl,
        model,
        sample: String(llm.content || '').slice(0, 80),
    };
}

function isMockMode(env = process.env) {
    const v = String(env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Whether the endpoint / model likely understands thinking toggles
 * (llama-server chat_template_kwargs, Ollama `think`).
 */
function supportsThinkingControls(baseUrl, model) {
    const u = String(baseUrl || '').toLowerCase();
    const m = String(model || '').toLowerCase();
    if (/127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|::1|:11434|\bollama\b/.test(u)) {
        return true;
    }
    if (/qwen3/.test(m)) return true;
    return false;
}

/**
 * 兼容 string / multipart content，以及 reasoning_content 等本地推理字段。
 * @param {object|string|number|null} message
 * @param {{ ignoreReasoning?: boolean }} [options]
 */
function extractChatMessageContent(message, options = {}) {
    if (message == null) return '';
    if (typeof message === 'string' || typeof message === 'number') {
        return String(message).trim();
    }
    if (typeof message !== 'object') return '';

    const fromParts = (value) => {
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'number') {
            return String(value).trim();
        }
        if (Array.isArray(value)) {
            return value.map((part) => {
                if (part == null) return '';
                if (typeof part === 'string' || typeof part === 'number') return String(part);
                if (typeof part === 'object') {
                    return String(part.text || part.content || part.output_text || '').trim();
                }
                return '';
            }).filter(Boolean).join('\n').trim();
        }
        return '';
    };

    const primary = fromParts(message.content);
    if (primary) return primary;

    // Qwen3 / llama-server may put CoT in reasoning_content and leave content empty
    // when max_tokens was spent on thinking — never treat that as the task answer
    // for structured JSON jobs (smart translate, 影片简要, reconstruct).
    if (options.ignoreReasoning) {
        return fromParts(message.output_text) || fromParts(message.text) || '';
    }

    const fallbacks = [
        message.reasoning_content,
        message.reasoning,
        message.thinking,
        message.output_text,
        message.text,
    ];
    for (const item of fallbacks) {
        const text = fromParts(item);
        if (text) return text;
    }
    return '';
}

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} [options.baseUrl]
 * @param {string} [options.model]
 * @param {Array<{role:string,content:string}>} options.messages
 * @param {number} [options.temperature]
 * @param {number} [options.timeoutMs]
 * @param {AbortSignal} [options.signal]
 */
async function chatCompletions(options = {}) {
    const opts = asPlainObject(options);
    const apiKey = asString(opts.apiKey, 8192).trim();
    if (!apiKey) {
        return { ok: false, error: '缺少 API Key', code: 'byok_missing' };
    }
    const model = asString(opts.model, 256).trim() || DEFAULT_MODEL;
    const messages = Array.isArray(opts.messages) ? opts.messages : [];
    if (!messages.length) {
        return { ok: false, error: '缺少 messages' };
    }

    const url = resolveChatCompletionsUrl(opts.baseUrl);
    const temperature = asNumber(opts.temperature, { min: 0, max: 2, fallback: 0.3 });
    const timeoutMs = asNumber(opts.timeoutMs, {
        min: 5000,
        max: 600000,
        fallback: DEFAULT_TIMEOUT_MS,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (opts.signal) {
        if (opts.signal.aborted) {
            clearTimeout(timer);
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        opts.signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    const enableThinkingExplicit = opts.enableThinking === true || opts.enable_thinking === true;
    const disableThinking = !enableThinkingExplicit && (
        opts.enableThinking === false
        || opts.enable_thinking === false
        || opts.disableThinking === true
        || opts.disable_thinking === true
    );
    const ignoreReasoning = disableThinking
        || opts.ignoreReasoning === true
        || opts.ignore_reasoning === true;
    const sendThinkingControls = (disableThinking || enableThinkingExplicit)
        && (
            opts.forceThinkingControls === true
            || supportsThinkingControls(opts.baseUrl, model)
        );

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature,
                messages,
                ...(Number.isFinite(Number(opts.max_tokens)) || Number.isFinite(Number(opts.maxTokens))
                    ? {
                        max_tokens: Math.max(
                            1,
                            Math.min(4096, Math.round(Number(opts.max_tokens ?? opts.maxTokens))),
                        ),
                    }
                    : {}),
                // llama.cpp + OpenAI-compat anti-loop knobs (subtitle MT runaway repeats)
                ...(Number.isFinite(Number(opts.repetition_penalty ?? opts.repetitionPenalty))
                    ? {
                        repetition_penalty: asNumber(
                            opts.repetition_penalty ?? opts.repetitionPenalty,
                            { min: 1, max: 2, fallback: 1.15 },
                        ),
                    }
                    : {}),
                ...(Number.isFinite(Number(opts.frequency_penalty ?? opts.frequencyPenalty))
                    ? {
                        frequency_penalty: asNumber(
                            opts.frequency_penalty ?? opts.frequencyPenalty,
                            { min: -2, max: 2, fallback: 0.2 },
                        ),
                    }
                    : {}),
                ...(Number.isFinite(Number(opts.presence_penalty ?? opts.presencePenalty))
                    ? {
                        presence_penalty: asNumber(
                            opts.presence_penalty ?? opts.presencePenalty,
                            { min: -2, max: 2, fallback: 0 },
                        ),
                    }
                    : {}),
                // llama.cpp: avoid growing prompt cache across unrelated subtitle chunks
                ...(opts.cachePrompt === false || opts.cache_prompt === false
                    ? { cache_prompt: false }
                    : {}),
                // Qwen3 hybrid: disable CoT so max_tokens is spent on JSON, not thinking.
                ...(sendThinkingControls && disableThinking
                    ? {
                        chat_template_kwargs: { enable_thinking: false },
                        think: false,
                    }
                    : {}),
                ...(sendThinkingControls && enableThinkingExplicit
                    ? {
                        chat_template_kwargs: { enable_thinking: true },
                        think: true,
                    }
                    : {}),
            }),
            signal: controller.signal,
        });
        const rawText = await res.text();
        let data = null;
        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch (_) {
            data = null;
        }
        if (!res.ok) {
            const msg = data?.error?.message
                || data?.message
                || rawText?.slice(0, 300)
                || `HTTP ${res.status}`;
            return {
                ok: false,
                error: msg,
                code: 'llm_http_error',
                status: res.status,
            };
        }
        const content = extractChatMessageContent(data?.choices?.[0]?.message, {
            ignoreReasoning,
        });
        if (content == null || content === '') {
            return { ok: false, error: '模型返回空内容', code: 'llm_empty' };
        }
        return {
            ok: true,
            content: String(content),
            model: data?.model || model,
            usage: data?.usage || null,
        };
    } catch (err) {
        if (err?.name === 'AbortError') {
            // Outer job cancel wins over our local timeout timer.
            if (opts.signal?.aborted) {
                return { ok: false, error: '已取消', code: 'cancelled' };
            }
            return { ok: false, error: '请求超时', code: 'timeout' };
        }
        return {
            ok: false,
            error: formatLlmNetworkError(err, { baseUrl: opts.baseUrl }),
            code: 'llm_network',
        };
    } finally {
        clearTimeout(timer);
        if (opts.signal) {
            opts.signal.removeEventListener('abort', onOuterAbort);
        }
    }
}

module.exports = {
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT_MS,
    normalizeBaseUrl,
    resolveChatCompletionsUrl,
    resolveModelsUrl,
    formatLlmNetworkError,
    isMockMode,
    supportsThinkingControls,
    extractChatMessageContent,
    chatCompletions,
    testConnection,
};
