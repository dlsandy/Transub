/**
 * Env / wizard one-click fix: list items + per-item progress bars.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEnvFixProgress = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function envFixProgressFactory() {
    const MODEL_STEP_IDS = Object.freeze([
        'asrModel',
        'vadModel',
        'lidModel',
        'sensevoiceRuntime',
        'qwenRuntime',
        'whisperRuntime',
    ]);

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function collectFixProgressItems(plan) {
        const items = [];
        const seen = new Set();
        const steps = Array.isArray(plan?.steps) ? plan.steps : [];
        for (const step of steps) {
            if (!step || step.manual) continue;
            const id = String(step.id || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            items.push({
                id,
                label: String(step.label || id).trim() || id,
                kind: 'auto',
                status: 'pending',
                pct: 0,
                message: '',
            });
        }
        const hints = Array.isArray(plan?.manualHints) ? plan.manualHints : [];
        for (const hint of hints) {
            if (!hint) continue;
            const rawId = String(hint.id || hint.label || '').trim() || `manual-${items.length}`;
            const id = seen.has(rawId) ? `manual:${rawId}` : rawId;
            if (seen.has(id)) continue;
            seen.add(id);
            items.push({
                id,
                label: String(hint.label || hint.detail || rawId).trim() || id,
                kind: 'manual',
                status: 'manual',
                pct: 0,
                message: String(hint.detail || '需手动处理'),
            });
        }
        return items;
    }

    function buildFixModeChoiceMessage(plan, { uiTx, uiTf } = {}) {
        const tx = typeof uiTx === 'function' ? uiTx : ((t) => String(t || ''));
        const tf = typeof uiTf === 'function'
            ? uiTf
            : ((t, v) => String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
                v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : `{${k}}`
            )));
        const items = collectFixProgressItems(plan);
        const auto = items.filter((it) => it.kind === 'auto').map((it) => `· ${it.label}`);
        const manual = items.filter((it) => it.kind === 'manual').map((it) => `· ${it.label}`);
        const parts = [];
        if (auto.length) {
            parts.push(tf('将处理以下项目：\n{steps}', { steps: auto.join('\n') }));
        }
        if (manual.length) {
            parts.push(tf('以下项仍需手动处理（不会自动下载）：\n{items}', { items: manual.join('\n') }));
        }
        parts.push(tx('请选择修复方式。自动修复会联网下载；手动修复可导出直链后用下载软件安装。'));
        return parts.filter(Boolean).join('\n\n');
    }

    function stepIdsForFixPhase(kind, plan) {
        const steps = Array.isArray(plan?.steps) ? plan.steps : [];
        const pick = (pred) => steps
            .filter((s) => s && !s.manual && pred(s))
            .map((s) => String(s.id || '').trim())
            .filter(Boolean);
        if (kind === 'vc') return pick((s) => s.id === 'vcRedist');
        if (kind === 'models') {
            const ids = pick((s) => MODEL_STEP_IDS.includes(s.id));
            if (ids.length) return ids;
            return pick((s) => !['vcRedist', 'gpuRuntime', 'audioSeparate', 'llamaServerRuntime'].includes(s.id));
        }
        if (kind === 'gpu') return pick((s) => s.id === 'gpuRuntime');
        if (kind === 'torch') {
            return pick((s) => s.id === 'audioSeparate' || s.id === 'torchEngineStartup');
        }
        if (kind === 'llama') return pick((s) => s.id === 'llamaServerRuntime');
        return [];
    }

    function matchFixStepFromProgress(text, rows, fallbackId) {
        const t = String(text || '').toLowerCase();
        const list = Array.isArray(rows) ? rows.filter((r) => r && r.kind !== 'manual') : [];
        let bestId = fallbackId || '';
        let best = 0;
        for (const row of list) {
            const id = String(row.id || '');
            let score = 0;
            if (id && t.includes(id.toLowerCase())) score += 6;
            if (id === 'qwenRuntime' && /qwen|tokenizers|transformers\s*[5≥]|huggingface-hub/.test(t)) score += 5;
            if (id === 'whisperRuntime' && /whisper|faster-whisper|ctranslate2|\bav\b|numpy/.test(t)) score += 4;
            if (id === 'sensevoiceRuntime' && /sensevoice|funasr/.test(t)) score += 5;
            if (id === 'asrModel' && /asr|模型/.test(t) && !/vad|fsmn/.test(t)) score += 2;
            if (id === 'vadModel' && /vad|fsmn/.test(t)) score += 5;
            if (id === 'lidModel' && /语种|lid|whisper-tiny/.test(t)) score += 4;
            if (id === 'gpuRuntime' && /gpu|cublas|cuda 组件|onnxruntime-gpu|复用本机 cuda/.test(t)) score += 5;
            if (id === 'audioSeparate' && /pytorch|torch_cuda|改装 cuda|补齐 cuda pytorch/.test(t)) score += 5;
            if (id === 'torchEngineStartup' && /pytorch|引擎启动|torch_cuda|cublas|docstring|补齐 cuda/.test(t)) score += 6;
            if (id === 'llamaServerRuntime' && /llama-server|llama server/.test(t)) score += 5;
            if (id === 'vcRedist' && /visual c\+\+|vc\+\+|vc_redist/.test(t)) score += 5;
            if (score > best) {
                best = score;
                bestId = id;
            }
        }
        return bestId;
    }

    function formatFixBytes(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '';
        if (v < 1024) return `${Math.round(v)} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
        return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function formatTransferDetail(meta = {}) {
        const recv = Number(meta.downloadedBytes);
        const total = Number(meta.totalBytes);
        const speed = Number(meta.bytesPerSecond ?? meta.speed);
        const bits = [];
        if (Number.isFinite(recv) && recv >= 0) {
            const recvLabel = formatFixBytes(recv) || `${Math.round(recv)} B`;
            if (Number.isFinite(total) && total > 0) {
                bits.push(`${recvLabel} / ${formatFixBytes(total)}`);
            } else {
                bits.push(`已下 ${recvLabel}`);
            }
        }
        if (Number.isFinite(speed) && speed > 0) {
            bits.push(`${formatFixBytes(speed)}/s`);
        }
        return bits.join(' · ');
    }

    function createEnvFixProgressModal(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const uiTx = d.uiTx || ((t) => String(t || ''));
        const escapeHtml = d.esc || esc;
        let onCancel = null;
        let onSwitchManual = null;
        let bound = false;
        let rows = [];
        let finished = false;

        function modalEl() {
            return $('envFixProgressModal');
        }

        function bindOnce() {
            const modal = modalEl();
            if (!modal || bound) return;
            bound = true;
            $('envFixProgressCancelBtn')?.addEventListener('click', () => {
                if (finished) {
                    close();
                    return;
                }
                onCancel?.();
            });
            $('envFixProgressManualBtn')?.addEventListener('click', () => {
                if (finished) return;
                onSwitchManual?.();
            });
            modal.addEventListener('click', (event) => {
                if (event.target === modal && finished) close();
            });
        }

        function render() {
            const host = $('envFixProgressList');
            if (!host) return;
            host.innerHTML = rows.map((row) => {
                const pct = Math.max(0, Math.min(100, Number(row.pct) || 0));
                const statusLabel = row.kind === 'manual'
                    ? uiTx('需手动')
                    : (row.status === 'done' ? uiTx('完成')
                        : row.status === 'error' ? uiTx('失败')
                            : row.status === 'active' ? uiTx('进行中')
                                : uiTx('等待中'));
                return `<div class="env-fix-progress-row" data-env-fix-id="${escapeHtml(row.id)}" data-status="${escapeHtml(row.status)}">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <p class="text-sm font-medium text-gray-800 min-w-0 truncate">${escapeHtml(row.label)}</p>
                        <span class="env-fix-progress-pct text-xs tabular-nums text-gray-500 shrink-0">${row.kind === 'manual' ? statusLabel : `${Math.round(pct)}%`}</span>
                    </div>
                    <div class="h-1.5 w-full rounded-full overflow-hidden env-fix-progress-track">
                        <div class="env-fix-progress-bar h-full rounded-full transition-[width] duration-150" style="width:${row.kind === 'manual' ? 0 : pct}%"></div>
                    </div>
                    <p class="env-fix-progress-msg text-[11px] text-gray-500 mt-1 min-h-[1rem] leading-snug break-all">${escapeHtml(row.message || (row.kind === 'manual' ? uiTx('需手动处理') : uiTx('等待中')))}</p>
                    <p class="env-fix-progress-transfer text-[11px] tabular-nums text-violet-700 mt-0.5 min-h-[1rem] ${row.transfer ? '' : 'hidden'}">${escapeHtml(row.transfer || '')}</p>
                </div>`;
            }).join('');
        }

        function patchRow(id, patch) {
            const row = rows.find((r) => r.id === id);
            if (!row || row.kind === 'manual') return;
            Object.assign(row, patch || {});
            const root = typeof document !== 'undefined'
                ? document.querySelector(`[data-env-fix-id="${CSS?.escape ? CSS.escape(id) : id}"]`)
                : null;
            if (!root) return;
            const pct = Math.max(0, Math.min(100, Number(row.pct) || 0));
            const pctEl = root.querySelector('.env-fix-progress-pct');
            const bar = root.querySelector('.env-fix-progress-bar');
            const msg = root.querySelector('.env-fix-progress-msg');
            const transfer = root.querySelector('.env-fix-progress-transfer');
            root.setAttribute('data-status', row.status || 'pending');
            if (pctEl) {
                pctEl.textContent = row.status === 'done'
                    ? uiTx('完成')
                    : (row.status === 'error' ? uiTx('失败') : `${Math.round(pct)}%`);
            }
            if (bar) bar.style.width = `${pct}%`;
            if (msg) msg.textContent = row.message || '';
            if (transfer) {
                const text = String(row.transfer || '').trim();
                transfer.textContent = text;
                transfer.classList.toggle('hidden', !text);
            }
        }

        function setSubtitle(text) {
            const el = $('envFixProgressSubtitle');
            if (el) el.textContent = String(text || '');
        }

        function setTransferLine(text) {
            const el = $('envFixProgressTransfer');
            if (!el) return;
            const t = String(text || '').trim();
            el.textContent = t;
            el.classList.toggle('hidden', !t);
        }

        function setMirrorStatus(text) {
            const el = $('envFixPipMirrorStatus');
            if (!el) return;
            el.textContent = String(text || '');
        }

        function bindPipMirrorUi() {
            // Mirror select lives on wizard prepare only; progress modal shows status text.
        }

        function noteProgressMirror(ev) {
            try {
                const api = (typeof globalThis !== 'undefined' ? globalThis : window).TransubPipMirrorUi;
                const line = api?.formatActiveMirrorLine?.(ev, uiTx);
                if (line) setMirrorStatus(line);
            } catch (_) { /* ignore */ }
        }

        function setBusyFooter(busy) {
            finished = !busy;
            const cancelBtn = $('envFixProgressCancelBtn');
            const manualBtn = $('envFixProgressManualBtn');
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.textContent = busy ? uiTx('取消修复') : uiTx('关闭');
            }
            if (manualBtn) {
                manualBtn.classList.toggle('hidden', !busy);
            }
        }

        function open(items, opts = {}) {
            bindOnce();
            bindPipMirrorUi();
            onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;
            onSwitchManual = typeof opts.onSwitchManual === 'function' ? opts.onSwitchManual : null;
            rows = (Array.isArray(items) ? items : []).map((it) => ({ ...it }));
            finished = false;
            const modal = modalEl();
            if (!modal) return false;
            const title = $('envFixProgressTitle');
            if (title) title.textContent = opts.title || uiTx('自动修复');
            setSubtitle(opts.subtitle || uiTx('正在按项目下载与安装…'));
            setTransferLine('');
            setMirrorStatus('');
            setBusyFooter(true);
            render();
            try {
                document.body.appendChild(modal);
            } catch (_) { /* ignore */ }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.setAttribute('aria-hidden', 'false');
            return true;
        }

        function close() {
            const modal = modalEl();
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.setAttribute('aria-hidden', 'true');
        }

        function setActive(id, patch) {
            const nextId = String(id || '').trim();
            for (const row of rows) {
                if (row.kind === 'manual' || row.status === 'done' || row.status === 'error') continue;
                if (row.id === nextId) {
                    patchRow(row.id, { status: 'active', ...(patch || {}) });
                } else if (row.status === 'active') {
                    patchRow(row.id, { status: 'pending' });
                }
            }
        }

        function update(id, patch) {
            const target = String(id || '').trim();
            if (!target) return;
            const row = rows.find((r) => r.id === target);
            if (!row) return;
            const next = { ...(patch || {}) };
            if (row.status !== 'done' && row.status !== 'error' && next.status == null) {
                next.status = 'active';
            }
            patchRow(target, next);
        }

        function complete(id, message) {
            patchRow(id, { status: 'done', pct: 100, message: message || uiTx('已完成'), transfer: '' });
        }

        function fail(id, message) {
            patchRow(id, { status: 'error', message: message || uiTx('失败'), transfer: '' });
        }

        function completeMany(ids, message) {
            (Array.isArray(ids) ? ids : []).forEach((id) => complete(id, message));
        }

        function failMany(ids, message) {
            (Array.isArray(ids) ? ids : []).forEach((id) => fail(id, message));
        }

        function finish(opts = {}) {
            setBusyFooter(false);
            setSubtitle(opts.subtitle || uiTx('修复结束'));
            setTransferLine('');
            if (opts.ok) {
                for (const row of rows) {
                    if (row.kind === 'auto' && row.status !== 'error') {
                        patchRow(row.id, {
                            status: 'done',
                            pct: 100,
                            message: row.message || uiTx('已完成'),
                            transfer: '',
                        });
                    }
                }
            }
        }

        function isOpen() {
            const modal = modalEl();
            return !!(modal && !modal.classList.contains('hidden'));
        }

        function getRows() {
            return rows.slice();
        }

        return {
            open,
            close,
            setSubtitle,
            setTransferLine,
            setMirrorStatus,
            noteProgressMirror,
            setActive,
            update,
            complete,
            fail,
            completeMany,
            failMany,
            finish,
            isOpen,
            getRows,
        };
    }

    return {
        MODEL_STEP_IDS,
        collectFixProgressItems,
        buildFixModeChoiceMessage,
        stepIdsForFixPhase,
        matchFixStepFromProgress,
        formatFixBytes,
        formatTransferDetail,
        createEnvFixProgressModal,
    };
}));
