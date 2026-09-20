/**
 * Build Engine options for QC / Pro smart-fix local retranscribe windows.
 * Mirrors batch ASR settings (model, VAD, language) so range jobs do not fall back to sensevoice-small.
 */
const { mergeEngineOptions, resolveEngineInstallPath } = require('./engine-options');
const { stripPostTaskFields, mergeTransWithAiOptions } = require('./transwithai-options');

const QC_RETRANSCRIBE_OPTION_KEYS = [
    'engineBackend',
    'engineInstallPath',
    'engineUrl',
    'engineHfEndpoint',
    'engineHfToken',
    'engineProfile',
    'engineAsrModel',
    'engineMtModel',
    'engineOpusMtModel',
    'engineLlmMtModel',
    'engineVadModel',
    'device',
    'language',
    'beamSize',
    'contentProfile',
    'senseProfile',
    'audioLightDenoise',
    'filmAudioEnhance',
    'filmVadPreset',
    'timingAlign',
    'timingAlignModel',
    'asrNameLoopClean',
    'jaAsrDomainFix',
    'vadEnabled',
    'vadSensitive',
    'vadAggressive',
    'vadThreshold',
    'vadMinSpeechDurationMs',
    'vadMinSilenceDurationMs',
    'vadSpeechPadMs',
    'vadMaxSingleSegmentMs',
    'targetChunkDurationS',
    'hallucinationSilenceThreshold',
    'filmVadThreshold',
    'filmVadMinSpeechDurationMs',
    'filmVadMinSilenceDurationMs',
    'filmHallucinationSilenceThreshold',
    'perfProfile',
    'qwenAsrBatchMode',
    'ffmpegPath',
    'castNames',
    'cast_names',
    'primaryAsr',
    'asrModel',
];

function pickQcRetranscribeSource(input = {}) {
    const src = input.engineOptions && typeof input.engineOptions === 'object'
        ? input.engineOptions
        : input;
    const picked = {};
    for (const key of QC_RETRANSCRIBE_OPTION_KEYS) {
        if (src[key] !== undefined) picked[key] = src[key];
    }
    return picked;
}

function loadSavedEngineOptions() {
    try {
        const { loadSettings } = require('./settings-data');
        const { getAppRoot } = require('./app-paths');
        const raw = stripPostTaskFields(loadSettings(() => getAppRoot()).options || {});
        return mergeTransWithAiOptions(mergeEngineOptions(raw));
    } catch {
        return {};
    }
}

/**
 * Reuse pre-merged batch engine options when post-task already built them.
 * @param {object} input
 * @returns {{ options: object, primaryAsr: string, burstMode: boolean }}
 */
function resolveQcRetranscribeEngineContext(input = {}) {
    const burstMode = !!(input._batchMode || input.allowDuringBatch);
    if (input.engineOptions && typeof input.engineOptions === 'object') {
        const primaryAsr = String(
            input.primaryAsr || input.engineOptions.engineAsrModel || '',
        ).trim();
        if (primaryAsr) {
            return {
                options: input.engineOptions,
                primaryAsr,
                burstMode,
            };
        }
    }
    const built = buildQcRetranscribeEngineOptions(input);
    return {
        options: built.options,
        primaryAsr: built.primaryAsr,
        burstMode,
    };
}

/**
 * After a burst of range jobs with releaseGpuAfter=false, free VRAM before Pro LLM.
 * @param {object} engineOpts
 * @returns {Promise<{ ok?: boolean }>}
 */
async function releaseGpuAfterQcRetranscribeBurst(engineOpts = {}) {
    try {
        const { ensureEngineRunning, releaseGpuMemory } = require('./engine-bridge');
        const ensure = await ensureEngineRunning(engineOpts);
        if (!ensure?.ok) return ensure || { ok: false };
        return releaseGpuMemory(ensure.baseUrl, { timeoutMs: 15000 });
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

/**
 * @param {object} input QC smart-fix payload (may include batch `engineOptions` / `primaryAsr`)
 * @returns {{ options: object, primaryAsr: string }}
 */
function buildQcRetranscribeEngineOptions(input = {}) {
    const picked = pickQcRetranscribeSource(input);
    const primaryAsr = String(
        input.primaryAsr
        || input.asrModel
        || picked.primaryAsr
        || picked.asrModel
        || picked.engineAsrModel
        || '',
    ).trim();
    const burstMode = !!(input._batchMode || input.allowDuringBatch);
    const merged = mergeTransWithAiOptions(mergeEngineOptions({
        ...loadSavedEngineOptions(),
        ...stripPostTaskFields(picked),
        engineAsrModel: primaryAsr || picked.engineAsrModel,
        task: 'transcribe',
        mergeSegments: false,
        subFormats: 'srt',
        smartTranslate: false,
        // Burst: keep ASR weights loaded across windows; caller releases once at end.
        releaseGpuAfter: burstMode ? false : true,
    }));
    merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
    const resolvedPrimary = String(
        primaryAsr || merged.engineAsrModel || 'sensevoice-small',
    ).trim() || 'sensevoice-small';
    merged.engineAsrModel = resolvedPrimary;
    return { options: merged, primaryAsr: resolvedPrimary };
}

module.exports = {
    QC_RETRANSCRIBE_OPTION_KEYS,
    pickQcRetranscribeSource,
    buildQcRetranscribeEngineOptions,
    resolveQcRetranscribeEngineContext,
    releaseGpuAfterQcRetranscribeBurst,
};
