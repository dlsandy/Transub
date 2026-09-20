/**
 * Engine range retranscribe / Opus text MT pure policy helpers.
 */
function clampRangePadMs(padMs, fallback = 350) {
    return Math.max(0, Math.min(2000, Math.round(Number(padMs) || fallback)));
}

function clampRangeWindow({ startMs, endMs, padMs } = {}) {
    const start = Math.max(0, Math.round(Number(startMs) || 0));
    const end = Math.max(start + 200, Math.round(Number(endMs) || 0));
    const pad = clampRangePadMs(padMs);
    return {
        startMs: start,
        endMs: end,
        padMs: pad,
        clipStartMs: Math.max(0, start - pad),
        clipEndMs: end + pad,
    };
}

function normalizeOpusTextCues(cuesIn) {
    return (Array.isArray(cuesIn) ? cuesIn : [])
        .map((c, i) => {
            const index = Number.isInteger(Number(c?.index)) ? Number(c.index)
                : (Number.isInteger(Number(c?.id)) ? Number(c.id) : i);
            const text = String(c?.text ?? '').trim();
            const startMs = Number(c?.startMs);
            const endMs = Number(c?.endMs);
            const start = Number.isFinite(startMs) ? startMs / 1000
                : (Number.isFinite(Number(c?.start)) ? Number(c.start) : index);
            const end = Number.isFinite(endMs) ? endMs / 1000
                : (Number.isFinite(Number(c?.end)) ? Number(c.end) : start + 1);
            return { index, id: index, text, start, end };
        })
        .filter((c) => c.text);
}

/**
 * Resolve native Opus MT model id — always empty (Opus removed).
 */
function resolveNativeOpusMtModel(_options = {}, _payload = {}, _deps = {}) {
    return '';
}

/**
 * For range ASR jobs: never fall back to Opus; return null when MT is LLM/smart.
 */
function resolveRangeAsrMtModel(options = {}, deps = {}) {
    const isSakura = deps.isSakuraMtModel || (() => false);
    const isLlm = deps.isLlmInferenceMtModel || (() => false);
    let mtModel = options.engineMtModel || null;
    if (
        options.smartTranslate
        || isSakura(mtModel)
        || isLlm(mtModel)
        || isSakura(options.engineLlmMtModel)
        || isLlm(options.engineLlmMtModel)
        || /^opus[-_]?mt/i.test(String(mtModel || ''))
        || /^opus[-_]?mt/i.test(String(options.engineOpusMtModel || ''))
    ) {
        return null;
    }
    return null;
}

function _dedupeAsrIds(ids) {
    const out = [];
    const seen = new Set();
    for (const raw of ids) {
        const id = String(raw || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * Keep failover / second-opinion candidates that are already on disk.
 * Always keeps `primaryAsr` (or chain[0]) so the user's chosen model is still tried once.
 * Pass `installedIds: null/undefined` to skip filtering (tests / unknown install root).
 *
 * @param {string[]} candidates
 * @param {string[]|null|undefined} installedIds
 * @param {{ primaryAsr?: string, keepPrimary?: boolean }} [options]
 * @returns {string[]}
 */
function filterAsrCandidatesByInstalled(candidates, installedIds, options = {}) {
    const list = _dedupeAsrIds(Array.isArray(candidates) ? candidates : []);
    if (!Array.isArray(installedIds)) return list;
    const installed = new Set(
        installedIds.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean),
    );
    const keepPrimary = options.keepPrimary !== false;
    const primary = String(options.primaryAsr || list[0] || '').trim();
    const primaryLow = primary.toLowerCase();
    const out = [];
    for (const id of list) {
        const low = id.toLowerCase();
        if (keepPrimary && primary && low === primaryLow) {
            out.push(id);
            continue;
        }
        if (installed.has(low)) out.push(id);
    }
    if (!out.length && keepPrimary && primary) return [primary];
    return _dedupeAsrIds(out);
}

/**
 * Full-file batch + range ASR failover chain (content-aware).
 * JA/anime specialists try sibling specialists before generic SenseVoice/tiny.
 * Pass `{ perfProfile: 'speed' }` (or `maxCandidates`) to cap chain length.
 */
function buildBatchAsrCandidates(primaryAsr, options = {}) {
    const primary = String(primaryAsr || 'sensevoice-small').trim() || 'sensevoice-small';
    const low = primary.toLowerCase();
    const chain = [primary];

    const jaSpecialists = [
        'whisper-ja-1.5b',
        'anime-whisper',
        'kotoba-whisper-v2.0-faster',
        'reazonspeech-k2',
        'qwen3-asr-1.7b-ja-anime-galgame',
        'qwen3-asr-1.7b-ja-anime-lora-v3',
        'qwen3-asr-1.7b',
        'qwen3-asr-0.6b',
    ];
    const isJaSpecialist = jaSpecialists.some((id) => low === id || low.startsWith(id));
    const isAnime = low.includes('anime-whisper');
    const isKotoba = low.includes('kotoba-whisper');
    const isWhisperJa = low.includes('whisper-ja');
    const isReazon = low.includes('reazon');
    const isQwenAsr = low.includes('qwen3-asr');
    const isCohereAsr = low.includes('cohere-transcribe') || low.includes('cohere-asr');

    if (/sensevoice/i.test(primary)) {
        chain.push('whisper-tiny', 'whisper-large-v3-turbo');
    } else if (isCohereAsr) {
        chain.push(
            'parakeet-tdt-0.6b-v2',
            'sensevoice-small',
            'whisper-tiny',
            'whisper-large-v3-turbo',
        );
    } else if (isJaSpecialist || isAnime || isKotoba || isWhisperJa || isReazon || isQwenAsr) {
        // Prefer other JA-domain models before generic Whisper tiny/turbo.
        if (isAnime) {
            chain.push(
                'qwen3-asr-1.7b-ja-anime-galgame',
                'kotoba-whisper-v2.0-faster',
                'whisper-ja-1.5b',
                'reazonspeech-k2',
            );
        } else if (isKotoba) {
            chain.push('anime-whisper', 'whisper-ja-1.5b', 'reazonspeech-k2');
        } else if (isWhisperJa) {
            chain.push('kotoba-whisper-v2.0-faster', 'anime-whisper', 'reazonspeech-k2');
        } else if (isReazon) {
            chain.push('whisper-ja-1.5b', 'kotoba-whisper-v2.0-faster', 'qwen3-asr-0.6b');
        } else if (isQwenAsr) {
            // Sibling Qwen variants first, then other JA specialists.
            if (!low.includes('1.7b-ja-anime')) {
                chain.push('qwen3-asr-1.7b-ja-anime-galgame');
            }
            if (!low.includes('lora') && low !== 'qwen3-asr-1.7b') {
                chain.push('qwen3-asr-1.7b');
            }
            if (!low.includes('0.6b')) {
                chain.push('qwen3-asr-0.6b');
            }
            chain.push('whisper-ja-1.5b', 'reazonspeech-k2', 'kotoba-whisper-v2.0-faster');
        } else {
            for (const id of jaSpecialists) chain.push(id);
        }
        chain.push('sensevoice-small', 'whisper-tiny', 'whisper-large-v3-turbo');
    } else {
        chain.push('sensevoice-small', 'whisper-tiny');
        if (!/large-v3-turbo|turbo/i.test(primary)) {
            chain.push('whisper-large-v3-turbo');
        }
    }
    return limitBatchAsrFailoverChain(_dedupeAsrIds(chain), options);
}

/** Max ASR models to try for short editor/QC range clips (not full-file batch). */
const RANGE_RETRANSCRIBE_FAILOVER_MAX = 3;
/** Full-file empty-result failover under perfProfile=speed (primary + one sibling). */
const BATCH_ASR_FAILOVER_SPEED_MAX = 2;
/** Full-file empty-result failover under quality (primary + up to 2 siblings). */
const BATCH_ASR_FAILOVER_QUALITY_MAX = 3;
/** Stop full-file failover after this many consecutive ASR_EMPTY results. */
const BATCH_ASR_EMPTY_STREAK_STOP = 2;

/**
 * Cap full-file ASR failover when perfProfile / maxCandidates is set.
 * Omitting perfProfile leaves the full specialist chain (tests / SO callers).
 * @param {string[]} candidates
 * @param {{ perfProfile?: string, maxCandidates?: number }} [options]
 */
function limitBatchAsrFailoverChain(candidates, options = {}) {
    const list = _dedupeAsrIds(Array.isArray(candidates) ? candidates : []);
    let max = Number(options.maxCandidates);
    if (!Number.isFinite(max) || max <= 0) {
        const perf = String(options.perfProfile || '').trim().toLowerCase();
        if (perf === 'speed' || perf === 'fast') max = BATCH_ASR_FAILOVER_SPEED_MAX;
        else if (perf === 'quality' || perf === 'accurate' || perf === 'balanced') {
            max = BATCH_ASR_FAILOVER_QUALITY_MAX;
        } else {
            max = 0;
        }
    }
    if (!max || max <= 0) return list;
    return list.slice(0, Math.max(1, Math.round(max)));
}

function _isQwenAsrId(asrId) {
    return /qwen3-asr/i.test(String(asrId || ''));
}

/**
 * Short failover for range retranscribe / QC windows.
 * Avoids sibling-Qwen churn (same TEN path → same empty clip) and heavy turbo loads.
 */
function buildRangeRetranscribeAsrCandidates(primaryAsr) {
    const primary = String(primaryAsr || 'sensevoice-small').trim() || 'sensevoice-small';
    const low = primary.toLowerCase();
    const chain = [primary];

    if (_isQwenAsrId(primary)) {
        // Sibling Qwen rarely fixes empty short clips; try one lightweight fallback.
        chain.push('sensevoice-small', 'whisper-tiny');
    } else if (/sensevoice/i.test(primary)) {
        chain.push('whisper-tiny');
    } else if (/anime-whisper|kotoba|whisper-ja|reazon|cohere|parakeet/i.test(primary)) {
        if (!/sensevoice/i.test(primary)) chain.push('sensevoice-small');
        if (!/whisper-tiny/i.test(low)) chain.push('whisper-tiny');
    } else {
        chain.push('sensevoice-small', 'whisper-tiny');
    }

    return _dedupeAsrIds(chain).slice(0, RANGE_RETRANSCRIBE_FAILOVER_MAX);
}

/** @deprecated Prefer buildBatchAsrCandidates — kept for range callers. */
function buildRangeAsrCandidates(primaryAsr) {
    return buildRangeRetranscribeAsrCandidates(primaryAsr);
}

function isEmptyAsrFail(res) {
    const code = String(res?.code || '');
    const msg = String(res?.error || '');
    return code === 'ASR_EMPTY'
        || /未识别到有效字幕|重转写结果为空|结果为空/i.test(msg);
}

function isRetryableAsrFail(res) {
    if (isEmptyAsrFail(res)) return true;
    const msg = String(res?.error || '');
    return /not installed|未安装|model not found|找不到.*模型/i.test(msg);
}

function remapClipCuesToTimeline(parsedCues, clipStartMs) {
    const offset = Math.max(0, Math.round(Number(clipStartMs) || 0));
    return (Array.isArray(parsedCues) ? parsedCues : []).map((cue) => ({
        startMs: Math.max(0, Math.round(Number(cue.startMs) || 0) + offset),
        endMs: Math.max(
            0,
            Math.round(
                (cue.endMs != null ? cue.endMs : (Number(cue.startMs) || 0) + 1000) + offset,
            ),
        ),
        text: String(cue.text || '').trim(),
    })).filter((cue) => cue.text);
}

module.exports = {
    clampRangePadMs,
    clampRangeWindow,
    normalizeOpusTextCues,
    resolveNativeOpusMtModel,
    resolveRangeAsrMtModel,
    filterAsrCandidatesByInstalled,
    buildBatchAsrCandidates,
    limitBatchAsrFailoverChain,
    buildRangeRetranscribeAsrCandidates,
    RANGE_RETRANSCRIBE_FAILOVER_MAX,
    BATCH_ASR_FAILOVER_SPEED_MAX,
    BATCH_ASR_FAILOVER_QUALITY_MAX,
    BATCH_ASR_EMPTY_STREAK_STOP,
    buildRangeAsrCandidates,
    isEmptyAsrFail,
    isRetryableAsrFail,
    remapClipCuesToTimeline,
};
