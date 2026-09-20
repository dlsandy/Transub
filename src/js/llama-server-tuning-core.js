/**
 * llama-server 并行 slot（-np）与客户端并发决策（纯逻辑，无 I/O）。
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLlamaServerTuning = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function llamaServerTuningFactory() {
    const PARALLEL_MODES = Object.freeze(['off', 'auto', '2', '3', '4']);

    /**
     * @param {unknown} value
     * @returns {'off'|'auto'|'2'|'3'|'4'}
     */
    function normalizeLlamaParallelMode(value) {
        const v = String(value ?? '').trim().toLowerCase();
        if (v === 'off' || v === '0' || v === '1' || v === 'false' || v === 'no') return 'off';
        if (v === '2' || v === '3' || v === '4') return v;
        return 'auto';
    }

    function normalizeSmartTranslateParallel(value) {
        if (value === true || value === 1 || value === '1') return true;
        if (value === false || value === 0 || value === '0') return false;
        const v = String(value ?? '').trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === 'on';
    }

    function normalizeSpeculativeEnabled(value) {
        if (value === true || value === 1 || value === '1') return true;
        if (value === false || value === 0 || value === '0') return false;
        const v = String(value ?? '').trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === 'on';
    }

    /**
     * @param {number} paramBillion
     * @param {{ weightGiB?: number, sizeBytes?: number }} [opts]
     * @returns {number}
     */
    function modelWeightGiB(paramBillion, opts = {}) {
        const explicit = Number(opts.weightGiB);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const bytes = Number(opts.sizeBytes);
        if (Number.isFinite(bytes) && bytes > 0) {
            return Math.max(0.5, bytes / (1024 ** 3));
        }
        const b = Number(paramBillion);
        if (!Number.isFinite(b) || b <= 0) return 6;
        if (b <= 1.5) return 2.5;
        if (b <= 3) return 3.5;
        if (b <= 7) return 6;
        if (b <= 14) return 10;
        if (b <= 32) return 18;
        return 24;
    }

    /**
     * MoE expert CPU offload layers from catalog + VRAM hints.
     * @param {object} [input]
     * @returns {number} 0 = all experts on GPU / omit flag
     */
    function resolveNCpuMoe(input = {}) {
        const moe = input.moe === true
            || Number(input.nCpuMoe) > 0
            || Number(input.llamaServer?.nCpuMoe) > 0;
        if (!moe) return 0;
        const configured = Number(
            input.nCpuMoe
            ?? input.llamaServer?.nCpuMoe
            ?? 14,
        );
        const base = Number.isFinite(configured) && configured > 0
            ? Math.min(64, Math.round(configured))
            : 14;
        const total = Number(input.gpuTotalMiB);
        const free = Number(input.gpuFreeMiB);
        const vram = Number.isFinite(free) && free > 0
            ? free
            : (Number.isFinite(total) && total > 0 ? total : 0);
        if (!(vram > 0)) return base;
        if (vram >= 22000) return 0;
        if (vram >= 16000) return Math.min(base, 8);
        if (vram >= 10000) return base;
        return Math.max(base, 18);
    }

    /**
     * Rough KV / slot overhead GiB for heuristics only.
     * @param {number} paramBillion
     * @param {number} contextSize
     * @returns {number}
     */
    function slotOverheadGiB(paramBillion, contextSize) {
        const ctx = Math.max(512, Number(contextSize) || 8192);
        const ctxFactor = ctx / 4096;
        const b = Number(paramBillion) || 7;
        if (b <= 3) return 0.55 * ctxFactor;
        if (b <= 7) return 0.85 * ctxFactor;
        return 1.2 * ctxFactor;
    }

    /**
     * @param {object} [input]
     * @returns {number} 1..4
     */
    function resolveParallelSlots(input = {}) {
        const mode = normalizeLlamaParallelMode(input.mode ?? input.llamaParallelMode);
        const purpose = String(input.purpose || 'mt').trim().toLowerCase();
        const smartOk = normalizeSmartTranslateParallel(
            input.smartTranslateParallel ?? input.llamaSmartTranslateParallel,
        );
        if (mode === 'off') return 1;
        if (purpose === 'smart' && !smartOk) return 1;
        if (input.afterAsr === true) return 1;

        const nGpuLayers = Number(input.nGpuLayers);
        if (Number.isFinite(nGpuLayers) && nGpuLayers <= 0) return 1;

        const paramBillion = Number(input.paramBillion);
        const contextSize = Number(input.contextSize) || 8192;
        const gpuFreeMiB = Number(input.gpuFreeMiB);
        const gpuTotalMiB = Number(input.gpuTotalMiB);
        const freeMiB = Number.isFinite(gpuFreeMiB) && gpuFreeMiB > 0
            ? gpuFreeMiB
            : (Number.isFinite(gpuTotalMiB) && gpuTotalMiB > 0
                ? Math.round(gpuTotalMiB * 0.55)
                : null);

        const activeBillion = Number(input.activeParamBillion);
        const billionForSlots = Number.isFinite(activeBillion) && activeBillion > 0
            ? activeBillion
            : (Number.isFinite(paramBillion) ? paramBillion : 7);
        const capByModel = (() => {
            const b = billionForSlots;
            if (b <= 3) return 3;
            if (b <= 7) return 2;
            return 1;
        })();

        const maxByVram = (() => {
            if (!freeMiB) return capByModel;
            const freeGiB = freeMiB / 1024;
            const base = modelWeightGiB(paramBillion, {
                weightGiB: input.weightGiB,
                sizeBytes: input.sizeBytes,
            });
            const nCpuMoe = resolveNCpuMoe(input);
            const gpuFrac = nCpuMoe > 0
                ? Math.max(0.4, 1 - Math.min(0.55, nCpuMoe / 40))
                : 1;
            const overhead = slotOverheadGiB(billionForSlots, contextSize);
            const headroom = freeGiB - (base * gpuFrac);
            if (headroom < overhead * 0.5) return 1;
            const extra = Math.floor(Math.max(0, headroom) / Math.max(0.35, overhead));
            return Math.max(1, Math.min(4, 1 + extra));
        })();

        const ceiling = Math.min(capByModel, maxByVram);
        if (mode === '2' || mode === '3' || mode === '4') {
            return Math.max(1, Math.min(Number(mode), ceiling));
        }
        return Math.max(1, Math.min(ceiling, capByModel));
    }

    /**
     * After ASR, keep 1 slot until VRAM handoff is ready; then cap by model size.
     * @param {object} [input]
     * @returns {number} 1..3
     */
    function resolveMtPostAsrSlotCap(input = {}) {
        const afterAsr = input.afterAsr === true;
        const ready = input.vramHandoffReady === true;
        if (afterAsr && !ready) return 1;
        const b = Number(input.paramBillion);
        if (!Number.isFinite(b) || b <= 0) return 2;
        if (b <= 2) return 3;
        if (b <= 4.5) return 2;
        return 2;
    }

    /**
     * Extra pause after VRAM wait before spawning llama-server (ms).
     * Skip when nvidia-smi already shows enough free memory.
     * @param {object} [input]
     * @returns {number}
     */
    function resolveLlamaHandoffSettleMs(input = {}) {
        if (input.headroomOk === true) return 0;
        if (input.releasedOk === true) return 400;
        return 800;
    }

    /**
     * Rough minimum free VRAM (MiB) before spawning llama-server on GPU after ASR.
     * @param {object} [input]
     * @returns {number}
     */
    function estimateLlamaLoadMinFreeMiB(input = {}) {
        const paramBillion = Number(input.paramBillion) || 7;
        const activeBillion = Number(input.activeParamBillion);
        const slotBillion = Number.isFinite(activeBillion) && activeBillion > 0
            ? activeBillion
            : paramBillion;
        const contextSize = Number(input.contextSize) || 8192;
        let weight = modelWeightGiB(paramBillion, {
            weightGiB: input.weightGiB,
            sizeBytes: input.sizeBytes,
        });
        const nCpuMoe = resolveNCpuMoe(input);
        if (nCpuMoe > 0) {
            weight *= Math.max(0.4, 1 - Math.min(0.55, nCpuMoe / 40));
        }
        const baseGiB = weight + slotOverheadGiB(slotBillion, contextSize);
        const slackGiB = 0.45;
        return Math.max(2048, Math.round((baseGiB + slackGiB) * 1024));
    }

    /**
     * Candidate -ngl values: full GPU → partial. CPU (0) only when allowCpuFallback.
     * @param {number} wantGpu
     * @param {object} [opts]
     * @returns {number[]}
     */
    function buildLlamaNglAttempts(wantGpu, opts = {}) {
        const want = Math.max(0, Math.round(Number(wantGpu) || 0));
        const allowCpu = opts.allowCpuFallback === true;
        if (want <= 0) return [0];
        const steps = [
            want,
            Math.min(40, want),
            Math.min(20, want),
        ];
        if (allowCpu) steps.push(0);
        return [...new Set(steps.filter((n) => Number.isFinite(n) && n >= 0))];
    }

    /**
     * True when free VRAM looks ample — stall/timeout is not OOM; do not drop to CPU.
     * @param {object} [input]
     * @returns {boolean}
     */
    function isLlamaGpuHeadroomAmple(input = {}) {
        const free = Number(input.gpuFreeMiB);
        if (!Number.isFinite(free) || free < 0) return false;
        const minFree = Number(input.minFreeMiB);
        const need = Number.isFinite(minFree) && minFree > 0
            ? minFree
            : estimateLlamaLoadMinFreeMiB(input);
        // Slightly below estimate still means the card is not saturated.
        return free >= Math.max(1024, need * 0.75);
    }

    /**
     * Decide next step after a failed llama-server GPU bring-up.
     * Avoids silent CPU fallback when the GPU is idle / not OOM.
     *
     * @param {object} [input]
     * @returns {{ action: 'retry_same'|'lower_ngl'|'allow_cpu'|'fail', reason: string, maxSameRetries: number }}
     */
    function resolveLlamaNglFallbackAction(input = {}) {
        const code = String(input.failCode || '').trim();
        const nGpu = Math.max(0, Math.round(Number(input.nGpuLayers) || 0));
        const sameRetries = Math.max(0, Math.round(Number(input.sameNglRetries) || 0));
        const maxSame = Math.max(0, Math.round(Number(input.maxSameRetries) || 1));
        const allowCpu = input.allowCpuFallback === true;
        const ample = isLlamaGpuHeadroomAmple(input);
        const isOom = code === 'gpu_load_failed'
            || input.oomHint === true;
        const isStall = code === 'gpu_load_stalled'
            || code === 'server_timeout';

        if (nGpu <= 0) {
            return { action: 'fail', reason: 'already_cpu', maxSameRetries: maxSame };
        }

        // Real OOM / CUDA alloc failure → lower ngl; CPU only if explicitly allowed.
        if (isOom) {
            if (allowCpu) {
                return { action: 'allow_cpu', reason: 'oom', maxSameRetries: maxSame };
            }
            return { action: 'lower_ngl', reason: 'oom_gpu_only', maxSameRetries: maxSame };
        }

        // Stall / timeout with free VRAM: CUDA hang or slow load — retry same ngl, never CPU.
        if (isStall && ample) {
            if (sameRetries < maxSame) {
                return { action: 'retry_same', reason: 'stall_ample_vram', maxSameRetries: maxSame };
            }
            return { action: 'lower_ngl', reason: 'stall_ample_vram_exhausted', maxSameRetries: maxSame };
        }

        // Stall without a free-VRAM reading: still prefer GPU retry over CPU.
        if (isStall) {
            if (sameRetries < maxSame) {
                return { action: 'retry_same', reason: 'stall_retry', maxSameRetries: maxSame };
            }
            return { action: 'lower_ngl', reason: 'stall_gpu_only', maxSameRetries: maxSame };
        }

        // Process exit / spawn errors: one same-ngl retry, then lower GPU layers.
        if (sameRetries < maxSame) {
            return { action: 'retry_same', reason: 'transient_retry', maxSameRetries: maxSame };
        }
        if (allowCpu) {
            return { action: 'allow_cpu', reason: 'exhausted_allow_cpu', maxSameRetries: maxSame };
        }
        return { action: 'lower_ngl', reason: 'exhausted_gpu_only', maxSameRetries: maxSame };
    }

    /**
     * Stall budget for waitForHealthy (ms). Longer after ASR / large models.
     * @param {object} [input]
     * @returns {number}
     */
    function resolveLlamaGpuStallAfterMs(input = {}) {
        const nGpu = Number(input.nGpuLayers);
        if (!Number.isFinite(nGpu) || nGpu <= 0) return 0;
        const afterAsr = input.afterAsr === true;
        const b = Number(input.paramBillion);
        const large = Number.isFinite(b) && b >= 7;
        if (afterAsr) return large ? 240000 : 210000;
        return large ? 180000 : 150000;
    }

    /**
     * @param {object} input
     * @returns {string[]}
     */
    function buildLlamaServerSpawnArgs(input = {}) {
        const modelPath = String(input.modelPath || '').trim();
        const host = String(input.host || '127.0.0.1').trim() || '127.0.0.1';
        const port = Number(input.port);
        const contextSize = Number(input.contextSize);
        const nGpuLayers = Number(input.nGpuLayers);
        const alias = String(input.alias || input.modelId || 'model').trim() || 'model';
        const parallelSlots = Math.max(1, Math.min(4, Math.round(Number(input.parallelSlots) || 1)));

        const args = [
            '-m', modelPath,
            '--host', host,
            '--port', String(Number.isFinite(port) ? port : 39281),
            '-c', String(Number.isFinite(contextSize) ? contextSize : 8192),
            '-ngl', String(Number.isFinite(nGpuLayers) ? nGpuLayers : 99),
            '-a', alias,
        ];
        if (parallelSlots > 1) {
            args.push('-np', String(parallelSlots));
        } else if (input.forceSingleSlot === true) {
            args.push('-np', '1');
        }
        if (input.llamaJinja === true) {
            args.push('--jinja');
        }
        const batchSize = Number(input.batchSize);
        if (Number.isFinite(batchSize) && batchSize >= 32) {
            args.push('-b', String(Math.min(4096, Math.round(batchSize))));
        }
        if (input.flashAttn === true) {
            args.push('-fa', 'on');
        }
        const reasoning = String(input.reasoning ?? '').trim().toLowerCase();
        if (reasoning === 'off' || input.reasoning === false) {
            args.push('--reasoning', 'off');
        }
        const cacheK = String(input.cacheTypeK || '').trim();
        if (cacheK) args.push('--cache-type-k', cacheK);
        const cacheV = String(input.cacheTypeV || '').trim();
        if (cacheV) args.push('--cache-type-v', cacheV);
        const nCpuMoe = resolveNCpuMoe(input);
        if (nCpuMoe > 0) {
            args.push('--n-cpu-moe', String(nCpuMoe));
        }
        const temp = Number(input.temp ?? input.temperature);
        if (Number.isFinite(temp) && temp >= 0) {
            args.push('--temp', String(Math.min(2, temp)));
        }
        const topP = Number(input.topP ?? input.top_p);
        if (Number.isFinite(topP) && topP > 0 && topP <= 1) {
            args.push('--top-p', String(topP));
        }
        const topK = Number(input.topK ?? input.top_k);
        if (Number.isFinite(topK) && topK >= 0) {
            args.push('--top-k', String(Math.round(topK)));
        }
        const repeatLastN = Number(input.repeatLastN ?? input.repeat_last_n);
        if (Number.isFinite(repeatLastN) && repeatLastN >= 0) {
            args.push('--repeat-last-n', String(Math.round(repeatLastN)));
        }
        const repeatPenalty = Number(input.repeatPenalty ?? input.repeat_penalty);
        if (Number.isFinite(repeatPenalty) && repeatPenalty >= 1) {
            args.push('--repeat-penalty', String(Math.min(2, repeatPenalty)));
        }

        const draftModelPath = String(input.draftModelPath || '').trim();
        const specType = String(input.specType || '').trim().toLowerCase();
        const nMax = Number(input.specDraftNMax);
        const nMaxStr = String(
            Number.isFinite(nMax) && nMax >= 1 ? Math.min(8, Math.round(nMax)) : (specType === 'draft-mtp' ? 2 : 3),
        );
        if (specType === 'draft-mtp') {
            args.push('--spec-type', 'draft-mtp');
            args.push('--spec-draft-n-max', nMaxStr);
        } else if (input.speculativeEnabled && draftModelPath) {
            args.push('-md', draftModelPath);
            args.push('--spec-type', 'draft-simple');
            args.push('--spec-draft-n-max', nMaxStr);
        }
        return args;
    }

    /**
     * Flatten catalog `llamaServer` / `chatDefaults` into spawn-arg input fields.
     * @param {object} [entry]
     * @param {object} [hints]
     * @returns {object}
     */
    function resolveLlamaServerOptsFromEntry(entry = {}, hints = {}) {
        const ls = entry?.llamaServer && typeof entry.llamaServer === 'object'
            ? entry.llamaServer
            : {};
        const chat = entry?.chatDefaults && typeof entry.chatDefaults === 'object'
            ? entry.chatDefaults
            : {};
        const specType = String(ls.specType || entry?.specType || '').trim().toLowerCase();
        return {
            moe: entry?.moe === true || ls.moe === true,
            weightGiB: entry?.weightGiB,
            sizeBytes: entry?.sizeBytes,
            activeParamBillion: entry?.activeParamBillion,
            paramBillion: entry?.paramBillion,
            nCpuMoe: ls.nCpuMoe ?? entry?.nCpuMoe,
            flashAttn: ls.flashAttn === true,
            batchSize: ls.batchSize,
            reasoning: ls.reasoning,
            cacheTypeK: ls.cacheTypeK,
            cacheTypeV: ls.cacheTypeV,
            forceSingleSlot: ls.forceSingleSlot === true || entry?.moe === true,
            specType: specType === 'draft-mtp' ? 'draft-mtp' : '',
            specDraftNMax: ls.specDraftNMax,
            temp: ls.temp ?? chat.temperature,
            topP: ls.topP ?? chat.topP,
            topK: ls.topK ?? chat.topK,
            repeatLastN: ls.repeatLastN ?? chat.repeatLastN,
            repeatPenalty: ls.repeatPenalty ?? chat.repeatPenalty,
            gpuFreeMiB: hints.gpuFreeMiB,
            gpuTotalMiB: hints.gpuTotalMiB,
        };
    }

    /**
     * @param {object} [managed]
     * @param {object} [input]
     * @returns {{ mode: string, smartTranslateParallel: boolean, slots: number, clientConcurrency: number }}
     */
    function resolveLlamaParallelPlan(managed = {}, input = {}) {
        const mode = normalizeLlamaParallelMode(
            input.mode ?? managed.llamaParallelMode,
        );
        const smartTranslateParallel = normalizeSmartTranslateParallel(
            input.smartTranslateParallel ?? managed.llamaSmartTranslateParallel,
        );
        const slots = resolveParallelSlots({
            mode,
            smartTranslateParallel,
            llamaSmartTranslateParallel: smartTranslateParallel,
            purpose: input.purpose || 'mt',
            afterAsr: input.afterAsr === true,
            paramBillion: input.paramBillion,
            activeParamBillion: input.activeParamBillion,
            weightGiB: input.weightGiB,
            sizeBytes: input.sizeBytes,
            moe: input.moe,
            nCpuMoe: input.nCpuMoe,
            contextSize: input.contextSize,
            nGpuLayers: input.nGpuLayers,
            gpuFreeMiB: input.gpuFreeMiB,
            gpuTotalMiB: input.gpuTotalMiB,
        });
        return {
            mode,
            smartTranslateParallel,
            slots,
            clientConcurrency: slots,
        };
    }

    return {
        PARALLEL_MODES,
        normalizeLlamaParallelMode,
        normalizeSmartTranslateParallel,
        normalizeSpeculativeEnabled,
        resolveParallelSlots,
        resolveLlamaParallelPlan,
        resolveMtPostAsrSlotCap,
        resolveLlamaHandoffSettleMs,
        estimateLlamaLoadMinFreeMiB,
        buildLlamaNglAttempts,
        isLlamaGpuHeadroomAmple,
        resolveLlamaNglFallbackAction,
        resolveLlamaGpuStallAfterMs,
        buildLlamaServerSpawnArgs,
        resolveNCpuMoe,
        resolveLlamaServerOptsFromEntry,
        modelWeightGiB,
    };
}));
