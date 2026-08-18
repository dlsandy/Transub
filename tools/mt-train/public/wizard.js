'use strict';

(() => {
    const $ = (id) => document.getElementById(id);
    const zoneJa = $('zoneJa');
    const zoneZh = $('zoneZh');
    const fileJa = $('fileJa');
    const fileZh = $('fileZh');
    const zoneJaName = $('zoneJaName');
    const zoneZhName = $('zoneZhName');
    const btnWizardLearn = $('btnWizardLearn');
    const btnWizardHistory = $('btnWizardHistory');
    const historyDlg = $('historyDlg');
    const historyList = $('historyList');
    const historyEmpty = $('historyEmpty');
    const historyFilter = $('historyFilter');
    const btnHistoryRefresh = $('btnHistoryRefresh');
    const btnHistorySelectVisible = $('btnHistorySelectVisible');
    const btnHistoryImportChecked = $('btnHistoryImportChecked');
    const wizardStatus = $('wizardStatus');
    const wizardDiag = $('wizardDiag');
    const wizardDrop = $('wizardDrop');
    const wizardReport = $('wizardReport');
    const wizardReportMeta = $('wizardReportMeta');
    const wizardModelWrap = $('wizardModelWrap');
    const wizardModel = $('wizardModel');
    const wizardLog = $('wizardLog');
    const btnWizardAdopt = $('btnWizardAdopt');
    const btnWizardTest = $('btnWizardTest');
    const btnWizardAgain = $('btnWizardAgain');
    const btnWizardSelectWritable = $('btnWizardSelectWritable');
    const btnWizardAdoptAsr = $('btnWizardAdoptAsr');
    const btnWizardFeedPack = $('btnWizardFeedPack');
    const btnWizardOppose = $('btnWizardOppose');
    const btnWizardQuickApply = $('btnWizardQuickApply');
    const wizCtaHint = $('wizCtaHint');
    const wizSafetyChip = $('wizSafetyChip');
    const wizardFeedPack = $('wizardFeedPack');
    const wizardTestOut = $('wizardTestOut');
    const wizardHarvestHeadline = $('wizardHarvestHeadline');
    const wizardSteps = $('wizardSteps');
    const wizardDonePanel = $('wizardDonePanel');
    const wizardDoneTitle = $('wizardDoneTitle');
    const wizardDoneBody = $('wizardDoneBody');
    const wizardEmptyPanel = $('wizardEmptyPanel');
    const wizardEmptyBody = $('wizardEmptyBody');
    const wizardDetailsWrap = $('wizardDetailsWrap');
    const wizardCtaBar = $('wizardCtaBar');
    const btnWizardDoneAgain = $('btnWizardDoneAgain');
    const btnWizardDoneDetails = $('btnWizardDoneDetails');
    const btnWizardEmptyAgain = $('btnWizardEmptyAgain');
    const btnWizardEmptyFeed = $('btnWizardEmptyFeed');
    /** @type {object|null} */
    let lastHarvest = null;
    let lastApplyStats = null;
    const btnShipGate = $('btnShipGate');
    const btnMocha = $('btnMocha');
    const btnTdp = $('btnTdp');
    const tdpVersionEl = $('tdpVersion');
    const serverBanner = $('serverBanner');
    const wizSandboxTarget = $('wizSandboxTarget');
    const btnSandboxRollback = $('btnSandboxRollback');
    const wizAutoApply = $('wizAutoApply');

    /** @type {{ target?: string, sandboxPath?: string, canRollback?: boolean, sandbox?: object }|null} */
    let sandboxStatus = null;
    let lastApplyOk = false;
    const AUTO_APPLY_KEY = 'mt-wizard-auto-apply';

    function isDevWizardMode() {
        try {
            if (new URLSearchParams(location.search).get('dev') === '1') return true;
            if (localStorage.getItem('mt-wizard-dev') === '1') return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    function isProAudienceMode() {
        try {
            if (new URLSearchParams(location.search).get('pro') === '1') return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    function applyProAudienceUi(features = {}) {
        const pro = isProAudienceMode() || features.forceSandbox || features.proAudience;
        if (!pro) return;
        const dev = $('wizardDev');
        if (dev) {
            const body = dev.querySelector('.wizard-dev-body');
            if (body) {
                ['wizSandboxTarget', 'btnShipGate', 'btnMocha', 'btnTdp', 'tdpVersion'].forEach((id) => {
                    const el = $(id);
                    if (!el) return;
                    const wrap = el.closest('label') || el;
                    wrap.remove();
                });
                body.querySelectorAll('label.inline.tight').forEach((lab) => {
                    if (/术语包|写入位置/.test(lab.textContent || '')) lab.remove();
                });
            }
            const summary = dev.querySelector('summary');
            if (summary) summary.textContent = '偏好设置';
        }
        document.querySelectorAll('#btnWizardOppose').forEach((el) => {
            el.classList.add('hidden');
            el.setAttribute('hidden', '');
        });
        void setSandboxTarget('sandbox').catch(() => {});
    }

    function isSandboxWrite() {
        return sandboxStatus?.target !== 'official';
    }

    function readAutoApplyPref() {
        try {
            const v = localStorage.getItem(AUTO_APPLY_KEY);
            if (v === '0') return false;
            if (v === '1') return true;
        } catch (_) { /* ignore */ }
        return true;
    }

    function writeAutoApplyPref(on) {
        try {
            localStorage.setItem(AUTO_APPLY_KEY, on ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    function syncAutoApplyUi() {
        if (wizAutoApply) wizAutoApply.checked = readAutoApplyPref();
    }

    function wantsAutoApply() {
        return readAutoApplyPref() && isSandboxWrite();
    }

    const transubTrain = window.transubTrain;
    const isElectron = Boolean(transubTrain?.isElectron);

    /** @type {{ name: string, text: string, path?: string }|null} */
    let jaFile = null;
    /** @type {{ name: string, text: string, path?: string }|null} */
    let zhFile = null;
    /** @type {object[]} */
    let adoptList = [];
    let lastPrepare = null;
    /** @type {object[]} */
    let historyPairs = [];

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function appendLog(line) {
        if (!wizardLog) return;
        const prev = wizardLog.textContent || '';
        wizardLog.textContent = `${prev}${prev ? '\n' : ''}${line}`;
        wizardLog.scrollTop = wizardLog.scrollHeight;
    }

    async function api(path, opts = {}) {
        const res = await fetch(path, {
            headers: { 'Content-Type': 'application/json' },
            ...opts,
        });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
        if (!res.ok) throw new Error(data.error || res.statusText || 'request failed');
        return data;
    }

    async function streamPost(path, body, handlers = {}) {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : '{}',
        });
        if (!res.ok || !res.body) {
            const t = await res.text();
            throw new Error(t || res.statusText);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let donePayload = null;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop() || '';
            for (const chunk of parts) {
                const lines = chunk.split('\n');
                let event = 'message';
                let data = '';
                for (const line of lines) {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    if (line.startsWith('data:')) data += line.slice(5).trim();
                }
                if (!data) continue;
                let obj;
                try { obj = JSON.parse(data); } catch (_) { obj = { line: data }; }
                if (event === 'log' && obj.line != null && handlers.log) handlers.log(obj.line);
                if (event === 'done') {
                    donePayload = obj;
                    if (handlers.done) handlers.done(obj);
                }
            }
        }
        return donePayload;
    }

    function setWizardStep(step) {
        const n = Math.max(1, Math.min(4, Number(step) || 1));
        wizardSteps?.querySelectorAll('[data-step]').forEach((el) => {
            const s = Number(el.getAttribute('data-step'));
            el.classList.toggle('is-active', s === n);
            el.classList.toggle('is-done', s < n);
        });
    }

    function hideOutcomePanels() {
        wizardDonePanel?.classList.add('hidden');
        wizardEmptyPanel?.classList.add('hidden');
        wizardDetailsWrap?.classList.remove('wizard-details-collapsed');
        wizardCtaBar?.classList.remove('is-quiet', 'hidden');
    }

    function showDonePanel({ okN = 0, failN = 0, remapN = 0, asrN = 0 } = {}) {
        hideOutcomePanels();
        if (!wizardDonePanel) return;
        const parts = [];
        if (remapN) parts.push(`${remapN} 条改中文`);
        if (asrN) parts.push(`${asrN} 条听写`);
        if (wizardDoneTitle) {
            wizardDoneTitle.textContent = failN
                ? `已应用 ${okN} 条（${failN} 条失败）`
                : `搞定：已应用 ${okN} 条到本机`;
        }
        if (wizardDoneBody) {
            wizardDoneBody.textContent = parts.length
                ? `包含 ${parts.join(' + ')}。后续翻译会立刻用上；不满意点右上角「撤销上次」。`
                : '后续翻译会立刻用上这些改法；不满意点右上角「撤销上次」。';
        }
        wizardDonePanel.classList.remove('hidden');
        wizardDetailsWrap?.classList.add('wizard-details-collapsed');
        wizardCtaBar?.classList.add('is-quiet');
        setWizardStep(4);
        try {
            wizardDonePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) { /* ignore */ }
    }

    function showEmptyPanel(harvest) {
        hideOutcomePanels();
        if (!wizardEmptyPanel) return;
        const orders = harvest?.workOrders?.length || 0;
        const review = harvest?.zhRemap?.reviewCount || (window.__wizardLastReview || []).length || 0;
        const bits = [];
        if (orders) bits.push(`${orders} 类对照结论`);
        if (review) bits.push(`${review} 条需微调`);
        if (wizardEmptyBody) {
            wizardEmptyBody.textContent = bits.length
                ? `本轮有 ${bits.join('、')}，但没有可自动入库的短改法。可换一对再试，或复制说明给助手。`
                : '这轮没有可入库改法。换一对字幕，或复制说明给助手继续排查。';
        }
        wizardEmptyPanel.classList.remove('hidden');
        wizardCtaBar?.classList.add('is-quiet');
        setWizardStep(2);
        // Keep details visible so user can tweak review/asr
        const reviewWrap = $('wizReviewWrap');
        const asrWrap = $('wizAsrWrap');
        const orderWrap = $('wizOrderWrap');
        if (reviewWrap && review) reviewWrap.open = true;
        if (asrWrap && (window.__wizardAsrDrafts || []).length) asrWrap.open = true;
        if (orderWrap && orders) orderWrap.open = true;
        try {
            wizardEmptyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) { /* ignore */ }
    }

    function setStatus(msg) {
        if (wizardStatus) wizardStatus.textContent = msg;
    }

    function showDiag(prep, learnedHint) {
        if (!wizardDiag) return;
        const tips = [...(prep?.diagnostics?.tips || [])];
        if (learnedHint) tips.push(learnedHint);
        const sum = prep?.scanSummary || {};
        const aligned = Number(sum.aligned) || 0;
        const live = Number(sum.liveHitCount) || 0;
        const trainable = sum.trainableHitCount != null
            ? Number(sum.trainableHitCount)
            : (prep?.allHotCount || 0);
        const gap = sum.alignGapCount != null ? Number(sum.alignGapCount) : null;
        const friendly = [];
        if (aligned) friendly.push(`已对照 ${aligned} 句`);
        if (trainable) friendly.push(`找到 ${trainable} 处可学`);
        else if (live) friendly.push(`发现 ${live} 处差异`);
        if (gap) friendly.push(`其中 ${gap} 处只是对齐空洞（不入库）`);
        const hot = prep?.diagnostics?.hotByCluster || {};
        const hotKeys = Object.keys(hot);
        if (hotKeys.length && isDevWizardMode()) {
            friendly.push(`类型：${hotKeys.map((k) => `${k}×${hot[k]}`).join(' · ')}`);
        }
        const body = [...friendly, ...tips.filter((t) => t && t !== learnedHint)].filter(Boolean).join('\n');
        if (!body && !learnedHint) {
            wizardDiag.classList.add('hidden');
            wizardDiag.textContent = '';
            return;
        }
        wizardDiag.classList.remove('hidden');
        wizardDiag.textContent = [learnedHint, body].filter(Boolean).join('\n');
    }

    function syncLearnEnabled() {
        if (btnWizardLearn) btnWizardLearn.disabled = !(jaFile && zhFile);
    }

    function scoreLang(text) {
        const s = String(text || '');
        const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
        return { kana, han, jaScore: kana * 3 + Math.min(han, kana * 2), zhScore: han - kana * 2 };
    }

    function guessSides(files) {
        if (files.length < 2) return null;
        const ranked = files.map((f) => {
            const name = f.name.toLowerCase();
            let hint = 0;
            if (/(\bja\b|jp|jpn|日文|日本語)/i.test(name)) hint += 10;
            if (/(\bzh\b|cn|chs|cht|中文|简体|繁体)/i.test(name)) hint -= 10;
            const sc = scoreLang(f.text);
            return { ...f, score: hint + sc.jaScore - sc.zhScore };
        }).sort((a, b) => b.score - a.score);
        return { ja: ranked[0], zh: ranked[ranked.length - 1] };
    }

    function readFileEntry(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve({
                    name: file.name,
                    text: String(reader.result || ''),
                    path: file.path || '',
                });
            };
            reader.onerror = () => reject(new Error(`读取失败：${file.name}`));
            reader.readAsText(file, 'UTF-8');
        });
    }

    async function assignJa(entry) {
        jaFile = entry;
        if (zoneJaName) zoneJaName.textContent = entry.name + (entry.path ? '' : '（已读入）');
        zoneJa?.classList.add('filled');
        syncLearnEnabled();
        setStatus('已选日文，请再选中文…');
        setWizardStep(1);
        await maybeAutoLearn();
    }

    async function assignZh(entry) {
        zhFile = entry;
        if (zoneZhName) zoneZhName.textContent = entry.name + (entry.path ? '' : '（已读入）');
        zoneZh?.classList.add('filled');
        syncLearnEnabled();
        setStatus(jaFile ? '两份字幕已就绪，正在自动学习…' : '已选中文，请再选日文…');
        if (jaFile) setWizardStep(2);
        else setWizardStep(1);
        await maybeAutoLearn();
    }

    let autoLearnBusy = false;
    let suppressAutoLearn = false;
    async function maybeAutoLearn() {
        if (suppressAutoLearn) return;
        if (!jaFile || !zhFile || autoLearnBusy) return;
        if (!wizardDrop || wizardDrop.classList.contains('hidden')) return;
        autoLearnBusy = true;
        try {
            await runWizardLearn();
        } finally {
            autoLearnBusy = false;
        }
    }

    async function handleFiles(fileList, preferSide = '') {
        const files = [...fileList].filter((f) => /\.srt$/i.test(f.name) || f.type.startsWith('text/'));
        if (!files.length) {
            setStatus('请拖入 .srt 字幕文件');
            return;
        }
        const entries = [];
        for (const f of files.slice(0, 4)) {
            entries.push(await readFileEntry(f));
        }
        if (preferSide === 'ja' && entries[0]) {
            await assignJa(entries[0]);
            return;
        }
        if (preferSide === 'zh' && entries[0]) {
            await assignZh(entries[0]);
            return;
        }
        if (entries.length >= 2) {
            const g = guessSides(entries);
            if (g) {
                await assignJa(g.ja);
                await assignZh(g.zh);
                setStatus(`已自动配对：${g.ja.name} ↔ ${g.zh.name}`);
                return;
            }
        }
        if (entries[0]) {
            if (!jaFile) await assignJa(entries[0]);
            else await assignZh(entries[0]);
        }
    }

    function bindZone(zone, input, side) {
        if (!zone || !input) return;
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag');
            try {
                await handleFiles(e.dataTransfer?.files || [], side);
            } catch (err) {
                setStatus(err.message || String(err));
            }
        });
        input.addEventListener('change', async () => {
            try {
                await handleFiles(input.files || [], side);
            } catch (err) {
                setStatus(err.message || String(err));
            }
        });
    }

    /** Prefer Pro quality models for train-desk expect inference (10GB VRAM sweet spot first). */
    const TRAIN_MODEL_PREFER = [
        'qwen3-14b',
        'qwen3-30b-a3b',
        'qwen3-32b',
        'qwen3-8b',
        'qwen25-14b',
        'qwen25-7b',
    ];

    function pickWizardModelDefault(catalog, managed) {
        const want = String(
            managed?.smartTranslateModelId
            || managed?.activeModelId
            || '',
        ).trim();
        if (want && catalog.some((item) => String(item.id) === want)) return want;
        for (const id of TRAIN_MODEL_PREFER) {
            if (catalog.some((item) => String(item.id) === id)) return id;
        }
        return String(catalog[0]?.id || '');
    }

    async function fillWizardModels() {
        if (!isElectron || !wizardModel || !wizardModelWrap) return;
        try {
            const mres = await transubTrain.getManagedLlmStatus?.();
            const catalog = (mres?.managed?.catalog || [])
                .filter((item) => item?.installed && !item.translateOnly
                    && String(item.family || '').toLowerCase() !== 'sakura');
            catalog.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh'));
            const want = pickWizardModelDefault(catalog, mres?.managed);
            if (!catalog.length) {
                wizardModel.innerHTML = '<option value="">（可选）无对话模型时仅用启发式</option>';
                wizardModelWrap.classList.remove('hidden');
                return;
            }
            wizardModel.innerHTML = [
                '<option value="">仅用内置启发式</option>',
                ...catalog.map((item) => {
                    const id = String(item.id || '');
                    const label = item.name || id;
                    const sel = id === want ? ' selected' : '';
                    return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(label)}</option>`;
                }),
            ].join('');
            wizardModelWrap.classList.remove('hidden');
        } catch (_) {
            wizardModelWrap.classList.add('hidden');
        }
    }

    function formatHistoryTime(iso) {
        const t = Date.parse(iso || '');
        if (!Number.isFinite(t)) return '';
        try {
            return new Date(t).toLocaleString('zh-CN', { hour12: false });
        } catch (_) {
            return String(iso || '');
        }
    }

    function renderHistoryList() {
        if (!historyList) return;
        const q = String(historyFilter?.value || '').trim().toLowerCase();
        const rows = historyPairs.filter((p) => {
            if (!q) return true;
            const hay = `${p.title || ''} ${p.jaPath || ''} ${p.zhPath || ''} ${p.task || ''}`.toLowerCase();
            return hay.includes(q);
        });
        if (!rows.length) {
            historyList.innerHTML = '';
            historyEmpty?.classList.remove('hidden');
            return;
        }
        historyEmpty?.classList.add('hidden');
        historyList.innerHTML = rows.map((p) => {
            const when = formatHistoryTime(p.finishedAt);
            const task = p.task ? escapeHtml(p.task) : '';
            return `<label class="wizard-history-item">
  <input type="checkbox" data-pair-check="${escapeHtml(p.id)}" />
  <button type="button" class="wizard-history-open" data-pair-id="${escapeHtml(p.id)}">
    <div class="wizard-history-title">${escapeHtml(p.title || p.id)}</div>
    <div class="wizard-history-meta">${when}${task ? ` · ${task}` : ''}</div>
    <div class="wizard-history-paths mono">${escapeHtml(p.jaPath || '')}</div>
    <div class="wizard-history-paths mono">${escapeHtml(p.zhPath || '')}</div>
  </button>
</label>`;
        }).join('');
        historyList.querySelectorAll('button[data-pair-id]').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                void importHistoryPair(btn.getAttribute('data-pair-id'));
            });
        });
    }

    async function refreshHistoryPairs() {
        if (!transubTrain?.listHistoryPairs) {
            setStatus('当前环境无法读取历史任务');
            return;
        }
        setStatus('读取历史任务…');
        try {
            const res = await transubTrain.listHistoryPairs({ maxPairs: 40 });
            if (!res?.ok) throw new Error(res?.error || '读取失败');
            historyPairs = Array.isArray(res.pairs) ? res.pairs : [];
            renderHistoryList();
            setStatus(historyPairs.length
                ? `历史中有 ${historyPairs.length} 对可用字幕`
                : '历史中没有可用的日中字幕对');
        } catch (err) {
            historyPairs = [];
            renderHistoryList();
            setStatus(`读取历史失败：${err.message || err}`);
        }
    }

    async function openHistoryDialog() {
        if (!historyDlg || !isElectron) return;
        historyDlg.showModal();
        await refreshHistoryPairs();
        historyFilter?.focus();
    }

    async function importHistoryPair(pairId) {
        if (!pairId || !transubTrain?.loadHistoryPair) return;
        setStatus('导入字幕对…');
        try {
            const res = await transubTrain.loadHistoryPair({ id: pairId });
            if (!res?.ok) throw new Error(res?.error || '导入失败');
            historyDlg?.close();
            await assignJa({
                name: res.ja.name,
                text: res.ja.text,
                path: res.ja.path,
            });
            await assignZh({
                name: res.zh.name,
                text: res.zh.text,
                path: res.zh.path,
            });
            // assignZh 会自动学习；若未开学再提示
            if (!wizardReport || wizardReport.classList.contains('hidden')) {
                setStatus(`已导入：${res.pair?.title || res.ja.name}（可点「开始学习」）`);
            }
        } catch (err) {
            setStatus(`导入失败：${err.message || err}`);
            alert(err.message || String(err));
        }
    }

    function selectedHistoryIds() {
        if (!historyList) return [];
        return [...historyList.querySelectorAll('input[data-pair-check]:checked')]
            .map((el) => el.getAttribute('data-pair-check'))
            .filter(Boolean);
    }

    async function importCheckedAndLearn() {
        const ids = selectedHistoryIds();
        if (!ids.length) {
            alert('请先勾选至少一部历史任务');
            return;
        }
        if (!transubTrain?.loadHistoryPairs && !transubTrain?.loadHistoryPair) {
            alert('当前环境无法批量导入');
            return;
        }
        btnHistoryImportChecked.disabled = true;
        setStatus(`加载 ${ids.length} 对字幕…`);
        try {
            let loaded = [];
            if (transubTrain.loadHistoryPairs) {
                const res = await transubTrain.loadHistoryPairs({ ids });
                if (!res?.ok) throw new Error(res?.error || '批量加载失败');
                loaded = res.pairs || [];
            } else {
                for (const id of ids) {
                    const one = await transubTrain.loadHistoryPair({ id });
                    if (one?.ok) loaded.push(one);
                }
            }
            if (!loaded.length) throw new Error('没有成功加载的字幕对');

            historyDlg?.close();
            suppressAutoLearn = true;
            try {
                const first = loaded[0];
                await assignJa({ name: first.ja.name, text: first.ja.text, path: first.ja.path });
                await assignZh({ name: first.zh.name, text: first.zh.text, path: first.zh.path });
            } finally {
                suppressAutoLearn = false;
            }

            setStatus(`正在跨片学习（${loaded.length} 部）…`);
            const pairs = loaded.map((row) => ({
                title: row.pair?.title || row.ja.name,
                jaName: row.ja.name,
                zhName: row.zh.name,
                jaPath: row.ja.path,
                zhPath: row.zh.path,
                jaText: row.ja.text,
                zhText: row.zh.text,
            }));
            const learned = await api('/api/wizard/learn-batch', {
                method: 'POST',
                body: JSON.stringify({
                    pairs,
                    maxHitsPerPair: 16,
                    max: 64,
                    title: 'history-batch',
                }),
            });
            const okPairs = (learned.pairSummaries || []).filter((p) => p.ok).length;
            const rep = learned.report || {};
            const harvest = learned.harvest || null;
            lastPrepare = {
                hotHits: [],
                scanSummary: { liveHitCount: learned.hitCount || 0, aligned: okPairs },
                allHotCount: learned.hitCount || 0,
                diagnostics: { tips: learned.hint ? [learned.hint] : [] },
                harvest,
            };
            showDiag(lastPrepare, harvest?.headline || learned.hint);
            renderReport(
                rep,
                `跨片 ${okPairs} 部 · 找到 ${learned.hitCount || 0} 处`,
                harvest,
            );
            const ready = countReadyApply().total;
            if (wantsAutoApply() && ready > 0) {
                setWizardStep(3);
                setStatus(`跨片学完，正在自动应用 ${ready} 条…`);
                await quickApplyWizard();
            } else if (ready > 0) {
                setWizardStep(3);
                setStatus(harvest?.headline || '跨片学习完成——可一键应用');
            } else {
                showEmptyPanel(harvest);
                setStatus(harvest?.headline || learned.hint || '跨片学习完成');
            }
        } catch (err) {
            setStatus(`跨片学习失败：${err.message || err}`);
            alert(err.message || String(err));
        } finally {
            suppressAutoLearn = false;
            if (btnHistoryImportChecked) btnHistoryImportChecked.disabled = false;
            syncLearnEnabled();
        }
    }

    function isWritableCard(p) {
        if (!p?.payload) return false;
        if (p.payload.unusable) return false;
        if (p.reuse?.bucket === 'write') return true;
        if (p.payload.mode === 'blank') return Boolean(p.payload.zhFrom || p.payload.zh);
        const from = String(p.payload.zhFrom || '');
        const to = String(p.payload.zhTo || '');
        return Boolean(from && (to || p.payload.expandStub));
    }

    function renderReport(report, meta, harvest) {
        const adopt = report?.adopt || harvest?.zhRemap?.adopt || [];
        const review = report?.review || harvest?.zhRemap?.review || [];
        const skip = report?.skip || harvest?.zhRemap?.skip || [];
        const asrDrafts = harvest?.asrDrafts || [];
        const workOrders = harvest?.workOrders || [];
        lastHarvest = harvest || null;
        adoptList = adopt.slice();
        window.__wizardLastReview = review.slice();
        window.__wizardAsrDrafts = asrDrafts.slice();
        $('wizAdoptN').textContent = String(adopt.length);
        $('wizReviewN').textContent = String(review.length);
        $('wizSkipN').textContent = String(skip.length);
        if ($('wizAsrN')) $('wizAsrN').textContent = String(asrDrafts.length);
        if ($('wizOrderN')) $('wizOrderN').textContent = String(workOrders.length);
        if (wizardReportMeta) wizardReportMeta.textContent = meta || '';
        if (wizardHarvestHeadline) {
            const line = harvest?.headline || meta || '';
            wizardHarvestHeadline.textContent = line;
            wizardHarvestHeadline.classList.toggle('empty', !harvest?.fruitful);
        }

        function ruleLine(p) {
            const payload = p.payload;
            if (!payload) return escapeHtml(p.reason || p.reuse?.reason || '');
            if (payload.mode === 'blank') {
                return `弱化 → …${payload.zhFrom ? `（含「${escapeHtml(payload.zhFrom)}」）` : ''}`;
            }
            return `「${escapeHtml(payload.zhFrom || '')}」→「${escapeHtml(payload.zhTo || '')}」`;
        }

        function card(p, editable) {
            const conf = p.confidence?.label || '';
            const issue = p.issue || (p.issues || [])[0] || '';
            const reuseReason = p.reuse?.reason || p.reason || '';
            let anchor = p.payload?.jaAnchor || '';
            const fullJa = p.payload?.ja || p.src || '';
            if (anchor && fullJa && (anchor.length >= 18 || anchor.length >= Math.floor(fullJa.length * 0.7))) {
                const parts = fullJa.split(/[、。．.…・！？!?,，\s　]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
                const counts = new Map();
                for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1);
                const rep = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
                if (rep) anchor = rep[0];
                else if (parts[0] && parts[0].length <= 14) anchor = parts[0];
                else anchor = fullJa.slice(0, 14);
            }
            const longHint = (p.payload?.longAnchor || p.confidence?.longAnchor)
                ? '锚点已尽量收短；仍偏长请再改'
                : '';
            const col = p.collateral
                ? `误伤额外 ${p.collateral.extra}`
                : '';
            const checked = editable && isWritableCard(p) ? 'checked' : '';
            const fromVal = p.payload?.zhFrom || '';
            const toVal = p.payload?.mode === 'blank' ? '…' : (p.payload?.zhTo || '');
            return `<article class="wizard-card" data-id="${escapeHtml(String(p.ji ?? ''))}">
  <header>
    <span class="wiz-issue">${issue ? escapeHtml(String(issue)) : '改法'}</span>
    ${conf ? `<span class="wiz-conf">${escapeHtml(conf)}</span>` : ''}
    <span class="muted">#${escapeHtml(String(p.ji ?? ''))}</span>
  </header>
  <div class="wiz-rule mono">${ruleLine(p)}</div>
  ${anchor ? `<div class="muted">当日文出现「${escapeHtml(anchor)}」时生效${longHint ? ` · ${escapeHtml(longHint)}` : ''}</div>` : ''}
  <div class="muted">${escapeHtml(reuseReason)}${col ? ` · ${escapeHtml(col)}` : ''}</div>
  <details class="wiz-evidence">
    <summary>来源句</summary>
    <div class="mono">${escapeHtml(p.src || '')}</div>
    <div class="muted">${escapeHtml(p.dst || p.after || '')}</div>
  </details>
  ${editable ? `<div class="wiz-edit">
    <label>触发日文 <input type="text" data-wiz-anchor="${escapeHtml(String(p.ji))}" value="${escapeHtml(anchor)}" title="请用短短语，勿整句" /></label>
    <label>错的中文 <input type="text" data-wiz-from="${escapeHtml(String(p.ji))}" value="${escapeHtml(fromVal)}" /></label>
    <label>改成 <input type="text" data-wiz-to="${escapeHtml(String(p.ji))}" value="${escapeHtml(toVal)}" /></label>
  </div>
  <div class="wiz-card-ops">
    <label class="chk tight"><input type="checkbox" data-wiz-accept="${escapeHtml(String(p.ji))}" ${checked} /> 选用</label>
    <button type="button" class="btn ghost wiz-test-btn" data-wiz-try="${escapeHtml(String(p.ji))}">试跑</button>
    <span class="wiz-test-badge hidden" data-wiz-badge="${escapeHtml(String(p.ji))}"></span>
  </div>
  <div class="wiz-test-detail hidden" data-wiz-detail="${escapeHtml(String(p.ji))}"></div>` : ''}
</article>`;
        }

        function asrCard(d) {
            const id = escapeHtml(String(d.id || d.ji));
            const hasTo = Boolean(String(d.to || '').trim());
            const checked = hasTo && d.suggestSource ? 'checked' : '';
            return `<article class="wizard-card" data-asr-id="${id}">
  <header><span class="wiz-issue">听写</span><span class="muted">#${escapeHtml(String(d.ji ?? ''))}</span></header>
  <div class="muted">${escapeHtml(d.reason || '')}</div>
  <div class="wiz-edit">
    <label>听错成 <input type="text" data-asr-from="${id}" value="${escapeHtml(d.from || '')}" /></label>
    <label>应为 <input type="text" data-asr-to="${id}" value="${escapeHtml(d.to || '')}" placeholder="正确日文" /></label>
  </div>
  ${d.suggestSource ? `<div class="muted">已自动填推荐纠正${d.suggestFrom ? `（参考「${escapeHtml(d.suggestFrom)}」）` : ''} — 确认后可一并应用</div>` : ''}
  <details class="wiz-evidence"><summary>上下文</summary>
    <div class="mono">${escapeHtml(d.fullJa || d.from || '')}</div>
    <div class="muted">${escapeHtml(d.dst || d.after || '')}</div>
  </details>
  <label class="chk tight"><input type="checkbox" data-asr-accept="${id}" ${checked} /> 选用</label>
</article>`;
        }

        function orderCard(o) {
            const samples = (o.samples || []).map((s) =>
                `<div class="mono">#${escapeHtml(String(s.ji ?? ''))} ${escapeHtml(s.src || '')}</div>`).join('');
            return `<div class="wizard-order-card">
  <strong>${escapeHtml(o.label || o.id)} ×${escapeHtml(String(o.count || 0))}</strong>
  <div class="muted">${escapeHtml(o.reason || '')}</div>
  <div class="wiz-action">${escapeHtml(o.action || '')}</div>
  ${samples ? `<details class="wiz-evidence"><summary>样例</summary>${samples}</details>` : ''}
</div>`;
        }

        lastApplyOk = false;
        $('wizAdopt').innerHTML = adopt.length
            ? adopt.map((p) => card(p, true)).join('')
            : '<div class="empty">暂无可直接应用的改法——可看下方「需微调」或听写纠错</div>';
        $('wizReview').innerHTML = review.length
            ? review.map((p) => card(p, true)).join('')
            : '<div class="empty">无</div>';
        $('wizSkip').innerHTML = skip.length
            ? skip.map((p) => card(p, false)).join('')
            : '<div class="empty">无</div>';
        if ($('wizAsr')) {
            $('wizAsr').innerHTML = asrDrafts.length
                ? asrDrafts.map(asrCard).join('')
                : '<div class="empty">无听写草案</div>';
        }
        if ($('wizOrders')) {
            $('wizOrders').innerHTML = workOrders.length
                ? workOrders.map(orderCard).join('')
                : '<div class="empty">无对照结论</div>';
        }

        const asrReadyN = asrDrafts.filter((d) => d.suggestSource && String(d.to || '').trim()).length;
        const openIf = (id, n) => {
            const el = $(id);
            if (el) el.open = n > 0 && (id !== 'wizSkipWrap');
        };
        // Keep primary visible; open secondary only when useful.
        openIf('wizReviewWrap', review.length && !adopt.length);
        openIf('wizAsrWrap', asrReadyN > 0 || (asrDrafts.length > 0 && !adopt.length));
        openIf('wizOrderWrap', workOrders.length > 0 && !adopt.length && !asrReadyN);
        openIf('wizSkipWrap', 0);

        btnWizardAdopt.disabled = adopt.length === 0 && review.length === 0;
        if (btnWizardTest) btnWizardTest.disabled = btnWizardAdopt.disabled;
        if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = asrDrafts.length === 0;
        if (btnWizardFeedPack) {
            btnWizardFeedPack.disabled = !(harvest?.fruitful
                || adopt.length || review.length || asrDrafts.length || workOrders.length);
        }
        if (btnWizardOppose) {
            const opposeN = [...adopt, ...review].filter((p) => p.opposingIntent?.risk).length;
            btnWizardOppose.disabled = opposeN === 0 && adopt.length === 0 && review.length === 0;
            btnWizardOppose.title = opposeN
                ? `生成对立夹具（${opposeN} 条触及对立面）`
                : '从勾选/全部草案尝试生成对立夹具';
        }
        if (wizardFeedPack) {
            wizardFeedPack.classList.add('hidden');
            wizardFeedPack.textContent = '';
        }
        if (wizardTestOut) {
            wizardTestOut.classList.add('hidden');
            wizardTestOut.classList.remove('ok', 'bad');
            wizardTestOut.textContent = '';
        }
        if (wizardLog) wizardLog.classList.add('hidden');
        hideOutcomePanels();
        wizardDrop?.classList.add('hidden');
        wizardReport?.classList.remove('hidden');
        setWizardStep(2);
        selectWritable(true);
        updateApplyCta();
        wizardReport?.querySelectorAll('input[data-wiz-accept], input[data-asr-accept]').forEach((el) => {
            el.addEventListener('change', () => updateApplyCta());
        });
        wizardReport?.querySelectorAll('input[data-wiz-from], input[data-wiz-to], input[data-asr-from], input[data-asr-to]').forEach((el) => {
            el.addEventListener('input', () => updateApplyCta());
        });
        try {
            wizardCtaBar?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) { /* ignore */ }
    }

    function countReadyApply() {
        const remapN = collectCheckedProposals().length;
        const asrN = collectCheckedAsr().length;
        return { remapN, asrN, total: remapN + asrN };
    }

    function updateApplyCta() {
        const { remapN, asrN, total } = countReadyApply();
        if (btnWizardQuickApply) {
            btnWizardQuickApply.disabled = total === 0;
            if (lastApplyOk && total === 0) {
                btnWizardQuickApply.textContent = '已应用 · 可换一对';
            } else if (total === 0) {
                btnWizardQuickApply.textContent = '暂无可应用项';
            } else {
                const parts = [];
                if (remapN) parts.push(`${remapN} 条改中文`);
                if (asrN) parts.push(`${asrN} 条听写`);
                btnWizardQuickApply.textContent = `一键应用（${parts.join(' + ')}）`;
            }
        }
        if (wizCtaHint) {
            wizCtaHint.classList.toggle('done', !!lastApplyOk);
            if (lastApplyOk) {
                wizCtaHint.textContent = '已写入本机。翻译会立刻用上这些改法；不满意点右上角「撤销上次」。';
            } else if (total > 0) {
                wizCtaHint.textContent = isSandboxWrite()
                    ? '已自动勾选建议项。点大按钮即可，仅本机生效，可撤销。'
                    : '当前写入官方包（开发模式）。普通使用请改回「仅本机」。';
            } else if ((adoptList || []).length || (window.__wizardAsrDrafts || []).length) {
                wizCtaHint.textContent = '请勾选至少一条改法，或到「需微调 / 听写」里补全后再应用。';
            } else {
                wizCtaHint.textContent = '这轮没有可入库改法；对照结论仍算收获。可换一对字幕再学。';
            }
        }
    }

    function proposalPool() {
        return [...adoptList, ...(window.__wizardLastReview || [])];
    }

    function selectWritable(quiet = false) {
        wizardReport?.querySelectorAll('input[data-wiz-accept]').forEach((cb) => {
            const ji = String(cb.getAttribute('data-wiz-accept'));
            const p = proposalPool().find((x) => String(x.ji) === ji);
            cb.checked = isWritableCard(p);
        });
        // Auto-check ASR rows that already have a suggested correction.
        wizardReport?.querySelectorAll('input[data-asr-accept]').forEach((cb) => {
            const id = String(cb.getAttribute('data-asr-accept'));
            const d = (window.__wizardAsrDrafts || []).find((x) => String(x.id || x.ji) === id);
            const toInp = wizardReport.querySelector(`input[data-asr-to="${CSS.escape(id)}"]`);
            const to = String(toInp?.value || d?.to || '').trim();
            if (d?.suggestSource && to) cb.checked = true;
        });
        if (!quiet) setStatus('已自动勾选可应用项');
        updateApplyCta();
    }

    function applyEditsToProposal(p) {
        if (!p?.payload) return null;
        const ji = String(p.ji);
        const anchorInp = wizardReport?.querySelector(`input[data-wiz-anchor="${ji}"]`);
        const fromInp = wizardReport?.querySelector(`input[data-wiz-from="${ji}"]`);
        const toInp = wizardReport?.querySelector(`input[data-wiz-to="${ji}"]`);
        const payload = { ...p.payload };
        if (anchorInp) payload.jaAnchor = anchorInp.value.trim();
        if (fromInp) payload.zhFrom = fromInp.value;
        if (toInp) {
            const to = toInp.value.trim();
            if (to === '…' || to === '...') {
                payload.mode = 'blank';
                payload.expect = '…';
                payload.zhTo = '';
            } else {
                payload.mode = payload.mode === 'blank' && !to ? 'blank' : 'replace';
                if (payload.mode !== 'blank') {
                    payload.zhTo = to;
                    payload.expect = String(payload.zh || p.dst || '')
                        .split(String(payload.zhFrom || '')).join(to);
                }
            }
        }
        return {
            ...p,
            payload,
            accepted: true,
            force: p.reuse?.bucket === 'narrow' || p.confidence?.level === 'review' || p.status === 'review',
        };
    }

    function collectCheckedProposals() {
        const byJi = new Map(proposalPool().map((p) => [String(p.ji), p]));
        const picked = [];
        wizardReport?.querySelectorAll('input[data-wiz-accept]').forEach((cb) => {
            if (!cb.checked) return;
            const p = byJi.get(String(cb.getAttribute('data-wiz-accept')));
            const edited = applyEditsToProposal(p);
            if (edited?.payload) picked.push(edited);
        });
        return picked;
    }

    function toTestItem(p) {
        const mode = p.payload.mode === 'blank' ? 'blank' : 'replace';
        return {
            ji: p.ji,
            title: pathBase(jaFile?.name),
            note: p.note || p.issue || 'wizard',
            ja: p.src || p.payload.ja || '',
            zh: p.payload.zh || p.dst || '',
            expect: mode === 'blank' ? '…' : String(p.payload.expect || p.payload.zhTo || '').trim(),
            mode,
            zhFrom: p.payload.zhFrom || '',
            zhTo: mode === 'blank' ? '' : (p.payload.zhTo || ''),
            jaAnchor: p.payload.jaAnchor || '',
            pinFinal: true,
            contentProfile: 'av_soft',
        };
    }

    function paintTestResult(ji, result) {
        const cardEl = wizardReport?.querySelector(`.wizard-card[data-id="${CSS.escape(String(ji))}"]`);
        const badge = wizardReport?.querySelector(`[data-wiz-badge="${CSS.escape(String(ji))}"]`);
        const detail = wizardReport?.querySelector(`[data-wiz-detail="${CSS.escape(String(ji))}"]`);
        if (cardEl) {
            cardEl.classList.toggle('wiz-pass', !!result?.pass);
            cardEl.classList.toggle('wiz-fail', result && !result.pass);
        }
        if (badge) {
            badge.classList.remove('hidden');
            badge.textContent = result?.pass ? '通过' : '未过';
        }
        if (detail) {
            detail.classList.remove('hidden');
            const lines = [];
            if (result?.trial?.final != null) lines.push(`清洗后：${result.trial.final}`);
            if (result?.gate?.collateral) {
                lines.push(`误伤额外 ${result.gate.collateral.extra}`);
            }
            if ((result?.reasons || []).length) lines.push(result.reasons.join('；'));
            detail.textContent = lines.join('\n') || (result?.pass ? '试跑与回归闸通过' : '未通过');
        }
    }

    async function runWizardTest(items, { single } = {}) {
        if (!items.length) {
            alert('请至少勾选一条规则');
            return null;
        }
        if (btnWizardTest) btnWizardTest.disabled = true;
        setStatus(single ? `试跑 #${items[0].ji}…` : `测试 ${items.length} 条规则…`);
        try {
            const out = await api('/api/wizard/test', {
                method: 'POST',
                body: JSON.stringify({
                    items: items.map(toTestItem),
                    jaPath: lastPrepare?.jaPath,
                    zhPath: lastPrepare?.zhPath,
                    corpus: lastPrepare?.hotHits || undefined,
                }),
            });
            for (const r of out.results || []) paintTestResult(r.ji, r);
            const summary = `测试完成：通过 ${out.passCount || 0}，未过 ${out.failCount || 0}`;
            setStatus(summary);
            if (wizardTestOut) {
                wizardTestOut.classList.remove('hidden', 'ok', 'bad');
                wizardTestOut.classList.add(out.allPass ? 'ok' : 'bad');
                const lines = [(out.results || []).map((r) => {
                    const mark = r.pass ? '✓' : '✗';
                    const why = (r.reasons || []).join('；');
                    return `${mark} #${r.ji}${why ? ` · ${why}` : ''}`;
                }).join('\n')];
                if (!out.allPass) {
                    lines.push('', '可改锚点/片段后重测；确认无误伤后再写入。');
                }
                wizardTestOut.textContent = lines.filter(Boolean).join('\n');
            }
            return out;
        } catch (err) {
            setStatus(`测试失败：${err.message || err}`);
            alert(err.message || String(err));
            return null;
        } finally {
            if (btnWizardTest) {
                btnWizardTest.disabled = adoptList.length === 0 && !(window.__wizardLastReview || []).length;
            }
        }
    }

    function needsModelAssist(hit) {
        const issues = hit.issues || [];
        // Heuristic now covers common under_stub; model only for leftover stubs
        if (issues.includes('under_stub')) {
            const ja = String(hit.src || '');
            if (/お願い|おねがい|頼む|気持ち|きもち|入れて|出して|舐めて|触って|吸って|イッ|イク|いく|だめ|ダメ|やめて|キス/.test(ja)) {
                return false;
            }
            return true;
        }
        if (issues.some((i) => ['prompt_leak', 'sfx_halluc', 'latin', 'heixiu', 'ja_echo'].includes(i))) {
            return false;
        }
        if (issues.some((i) => [
            'iku_shoot', 'dechau_out', 'yame_shoot', 'iku_xing',
            'kiniri', 'kimochi_stub', 'clinical_rod', 'invent_rod',
        ].includes(i))) {
            return false;
        }
        return true;
    }

    async function inferExpects(hits, modelId) {
        const expects = [];
        const needModel = hits.filter(needsModelAssist);
        if (!needModel.length) {
            setStatus('热点均可由情形策略覆盖，跳过模型整句推理');
            return expects;
        }
        if (!isElectron || !transubTrain?.inferSuggest || !modelId) {
            setStatus(`有 ${needModel.length} 条欠译暂无模型；将进「需收窄」供手填`);
            return expects;
        }
        const max = Math.min(16, needModel.length);
        for (let i = 0; i < max; i += 1) {
            const hit = needModel[i];
            setStatus(`模型抽片段 ${i + 1}/${max} · #${hit.ji}`);
            try {
                const res = await transubTrain.inferSuggest({
                    ja: hit.src,
                    zh: hit.dst,
                    after: hit.after,
                    issues: hit.issues || [],
                    modelId,
                });
                if (res?.ok) {
                    if (res.mode === 'blank') {
                        expects.push({ ji: hit.ji, expect: '…', mode: 'blank', jaAnchor: res.jaAnchor });
                    } else {
                        expects.push({
                            ji: hit.ji,
                            expect: res.expectZh || '',
                            mode: 'replace',
                            zhFrom: res.zhFrom || '',
                            zhTo: res.zhTo || '',
                            jaAnchor: res.jaAnchor || '',
                        });
                    }
                }
            } catch (err) {
                console.warn('infer failed', hit.ji, err);
            }
        }
        return expects;
    }

    async function runWizardLearn() {
        if (!jaFile || !zhFile) return;
        btnWizardLearn.disabled = true;
        try {
            setStatus('准备字幕并对照…');
            const prepBody = {
                jaName: jaFile.name,
                zhName: zhFile.name,
                jaText: jaFile.text,
                zhText: zhFile.text,
                maxHits: 40,
            };
            if (jaFile.path) prepBody.jaPath = jaFile.path;
            if (zhFile.path) prepBody.zhPath = zhFile.path;

            const prep = await api('/api/wizard/prepare', {
                method: 'POST',
                body: JSON.stringify(prepBody),
            });
            lastPrepare = prep;
            showDiag(prep);
            const hits = prep.hotHits || [];
            const modelId = wizardModel?.value || '';
            let expects = [];
            if (hits.length && hits.some(needsModelAssist)) {
                expects = await inferExpects(hits, modelId);
            } else if (hits.length) {
                setStatus('正在用内置策略找改法…');
            } else {
                setStatus('没有明显改中文热点，整理听写与对照结论…');
            }

            setStatus(expects.length
                ? `正在整理 ${expects.length} 条建议…`
                : '正在整理学习结果…');
            const learned = await api('/api/wizard/learn', {
                method: 'POST',
                body: JSON.stringify({
                    hits,
                    expects,
                    title: pathBase(jaFile.name),
                    max: hits.length || 1,
                    clusterCounts: prep.diagnostics?.clusterCounts || {},
                    allSamples: prep.allSamples || [],
                }),
            });
            const sum = prep.scanSummary || {};
            const rep = learned.report || {};
            const harvest = learned.harvest || prep.harvest || null;
            showDiag(prep, harvest?.headline || learned.hint);
            const metaBits = [];
            if (sum.aligned) metaBits.push(`对照 ${sum.aligned} 句`);
            if (sum.trainableHitCount != null) metaBits.push(`可学 ${sum.trainableHitCount}`);
            else if (hits.length) metaBits.push(`热点 ${hits.length}`);
            renderReport(
                rep,
                metaBits.join(' · '),
                harvest,
            );
            const ready = countReadyApply().total;
            if (wantsAutoApply() && ready > 0) {
                setWizardStep(3);
                setStatus(`学习完成，正在自动应用 ${ready} 条建议…`);
                await quickApplyWizard();
            } else if (ready > 0) {
                setWizardStep(3);
                setStatus(harvest?.headline || '学习完成——点「一键应用」即可');
            } else {
                showEmptyPanel(harvest);
                setStatus(harvest?.headline || learned.hint || '学习完成');
            }
        } catch (err) {
            setStatus(`学习失败：${err.message || err}`);
            alert(err.message || String(err));
        } finally {
            syncLearnEnabled();
        }
    }

    function pathBase(name) {
        return String(name || '').replace(/\.[^.]+$/, '') || 'wizard';
    }

    function writeTargetLabel() {
        return isSandboxWrite() ? '本机' : '官方包';
    }

    function applySandboxStatus(st) {
        sandboxStatus = st || null;
        if (wizSandboxTarget && st?.target) {
            wizSandboxTarget.value = st.target === 'official' ? 'official' : 'sandbox';
        }
        if (wizSafetyChip) {
            if (st?.target === 'official') {
                wizSafetyChip.textContent = '写入官方包（开发）';
                wizSafetyChip.classList.add('warn');
            } else {
                const n = st?.sandbox?.zhRemaps ?? 0;
                const a = st?.sandbox?.asrPairs ?? 0;
                wizSafetyChip.textContent = (n || a)
                    ? `仅本机生效 · 已学 ${n + a} 条`
                    : '仅本机生效';
                wizSafetyChip.classList.remove('warn');
            }
        }
        if (btnSandboxRollback) {
            btnSandboxRollback.disabled = !st?.canRollback;
            const n = st?.sandbox?.zhRemaps ?? 0;
            const a = st?.sandbox?.asrPairs ?? 0;
            btnSandboxRollback.title = st?.canRollback
                ? `撤销最近一次应用（当前本机 ${n} 条改中文 / ${a} 条听写）`
                : '还没有可撤销的记录';
        }
        updateApplyCta();
    }

    async function refreshSandboxStatus() {
        try {
            const st = await api('/api/train/sandbox');
            applySandboxStatus(st);
            return st;
        } catch (_) {
            return null;
        }
    }

    async function ensureSafeWriteTarget() {
        const st = await refreshSandboxStatus();
        if (st?.target === 'official' && !isDevWizardMode()) {
            await setSandboxTarget('sandbox');
        }
    }

    async function setSandboxTarget(target) {
        const out = await api('/api/train/sandbox', {
            method: 'POST',
            body: JSON.stringify({ target }),
        });
        applySandboxStatus(out.status || out);
        setStatus(target === 'official'
            ? '已切换：写入官方包（仅开发使用）'
            : '已切换：仅本机生效（推荐）');
        return out;
    }

    async function rollbackSandbox() {
        if (!confirm('撤销最近一次应用？本机规则会回到上一版。')) return;
        try {
            const out = await api('/api/train/sandbox', {
                method: 'POST',
                body: JSON.stringify({ rollback: true }),
            });
            lastApplyOk = false;
            applySandboxStatus(out.status);
            setStatus(`已撤销（本机改中文 ${out.zhRemaps ?? '?'} / 听写 ${out.asrPairs ?? '?'}）`);
        } catch (err) {
            alert(`撤销失败：${err.message || err}`);
        }
    }

    async function applyRemapBatch(picked, { quietConfirm = false } = {}) {
        if (!picked.length) return { okN: 0, failN: 0, loopLines: [] };
        if (!quietConfirm && !isSandboxWrite()) {
            if (!confirm(`将写入 ${picked.length} 条清洗规则到「${writeTargetLabel()}」（全部片子生效）。确定？`)) {
                return { okN: 0, failN: 0, loopLines: [], cancelled: true };
            }
        }
        let okN = 0;
        let failN = 0;
        const loopLines = [];
        const beforeLive = lastPrepare?.scanSummary?.liveHitCount;
        for (const p of picked) {
            const mode = p.payload.mode === 'blank' ? 'blank' : 'replace';
            const expect = mode === 'blank'
                ? '…'
                : String(p.payload.expect || p.payload.zhTo || '').trim();
            try {
                const out = await api('/api/train/apply', {
                    method: 'POST',
                    body: JSON.stringify({
                        kind: 'zh',
                        mode,
                        title: pathBase(jaFile?.name),
                        note: p.note || p.issue || 'wizard',
                        ja: p.src || p.payload.ja,
                        zh: p.payload.zh || p.dst,
                        expect,
                        zhFrom: p.payload.zhFrom,
                        zhTo: mode === 'blank' ? '' : (p.payload.zhTo || expect),
                        jaAnchor: p.payload.jaAnchor,
                        pinFinal: true,
                        contentProfile: 'av_soft',
                        jaPath: lastPrepare?.jaPath,
                        zhPath: lastPrepare?.zhPath,
                        force: !!p.force,
                        ji: p.ji,
                        beforeLiveHitCount: beforeLive,
                        beforeSoftHitCount: lastPrepare?.scanSummary?.softHitCount,
                        beforeLiveClusterCounts: lastPrepare?.diagnostics?.clusterCounts
                            || lastPrepare?.scanSummary?.liveClusterCounts,
                    }),
                });
                okN += 1;
                if (out.loopReport?.text) loopLines.push(out.loopReport.text);
                else if (out.loopReport?.diff) {
                    const d = out.loopReport.diff;
                    loopLines.push(`#${p.ji} 待修 ${d.liveBefore}→${d.liveAfter}`);
                }
                if (out.scanSummary?.liveHitCount != null && lastPrepare?.scanSummary) {
                    lastPrepare.scanSummary.liveHitCount = out.scanSummary.liveHitCount;
                }
            } catch (err) {
                failN += 1;
                console.warn(err);
                appendLog(`写入失败 #${p.ji}: ${err.message || err}`);
            }
        }
        return { okN, failN, loopLines };
    }

    async function applyAsrBatch(picked, { quietConfirm = false } = {}) {
        if (!picked.length) return { okN: 0, failN: 0 };
        if (!quietConfirm && !isSandboxWrite()) {
            if (!confirm(`将写入 ${picked.length} 条听写纠错到「${writeTargetLabel()}」。确定？`)) {
                return { okN: 0, failN: 0, cancelled: true };
            }
        }
        let okN = 0;
        let failN = 0;
        for (const row of picked) {
            try {
                await api('/api/train/asr-pair', {
                    method: 'POST',
                    body: JSON.stringify({
                        from: row.from,
                        to: row.to,
                        title: row.title || pathBase(jaFile?.name),
                        note: 'wizard-asr',
                    }),
                });
                okN += 1;
            } catch (err) {
                failN += 1;
                appendLog(`ASR 写入失败：${err.message || err}`);
            }
        }
        return { okN, failN };
    }

    async function quickApplyWizard() {
        const remaps = collectCheckedProposals();
        const asrs = collectCheckedAsr();
        if (!remaps.length && !asrs.length) {
            setStatus('请先勾选至少一条建议');
            return;
        }
        if (!isSandboxWrite() && !confirm(
            `将写入 ${remaps.length + asrs.length} 条到官方包。普通用户请改回「仅本机」。仍继续？`,
        )) return;

        if (btnWizardQuickApply) btnWizardQuickApply.disabled = true;
        btnWizardAdopt.disabled = true;
        if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = true;
        setWizardStep(3);
        setStatus(`正在应用 ${remaps.length + asrs.length} 条到本机…`);
        try {
            const r1 = await applyRemapBatch(remaps, { quietConfirm: true });
            const r2 = await applyAsrBatch(asrs, { quietConfirm: true });
            const okN = r1.okN + r2.okN;
            const failN = r1.failN + r2.failN;
            for (const line of r1.loopLines || []) appendLog(line);
            if (wizardLog && (r1.loopLines || []).length) wizardLog.classList.remove('hidden');
            lastApplyOk = okN > 0;
            lastApplyStats = {
                okN,
                failN,
                remapN: r1.okN,
                asrN: r2.okN,
            };
            if (okN > 0) {
                wizardReport?.querySelectorAll('input[data-wiz-accept]:checked, input[data-asr-accept]:checked')
                    .forEach((cb) => { cb.checked = false; });
            }
            await refreshSandboxStatus();
            updateApplyCta();
            const hint = okN
                ? `已应用 ${okN} 条到本机${failN ? `，失败 ${failN}` : ''}。`
                : `没有成功写入${failN ? `（失败 ${failN}）` : ''}`;
            setStatus(hint);
            if (okN > 0) {
                if (btnWizardQuickApply) {
                    btnWizardQuickApply.textContent = '已应用 · 可换一对';
                    btnWizardQuickApply.disabled = true;
                }
                showDonePanel(lastApplyStats);
            }
        } finally {
            btnWizardAdopt.disabled = false;
            if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = false;
            updateApplyCta();
        }
    }

    async function adoptWizard() {
        const picked = collectCheckedProposals();
        if (!picked.length) {
            alert('请至少勾选一条规则');
            return;
        }
        if (!isSandboxWrite() && !confirm(`将写入 ${picked.length} 条到「${writeTargetLabel()}」。确定？`)) return;

        btnWizardAdopt.disabled = true;
        if (btnWizardTest) btnWizardTest.disabled = true;
        setStatus(`正在写入 ${picked.length} 条…`);
        try {
            const { okN, failN, loopLines } = await applyRemapBatch(picked, { quietConfirm: true });
            for (const line of loopLines) appendLog(line);
            if (wizardLog && loopLines.length) wizardLog.classList.remove('hidden');
            lastApplyOk = okN > 0;
            await refreshSandboxStatus();
            updateApplyCta();
            setStatus(`写入完成（${writeTargetLabel()}）：成功 ${okN}，失败 ${failN}`);
        } finally {
            btnWizardAdopt.disabled = false;
            if (btnWizardTest) btnWizardTest.disabled = false;
        }
    }

    function collectCheckedAsr() {
        const drafts = window.__wizardAsrDrafts || [];
        const byId = new Map(drafts.map((d) => [String(d.id), d]));
        const picked = [];
        wizardReport?.querySelectorAll('input[data-asr-accept]').forEach((cb) => {
            if (!cb.checked) return;
            const id = String(cb.getAttribute('data-asr-accept'));
            const d = byId.get(id) || { id };
            const fromInp = wizardReport.querySelector(`input[data-asr-from="${CSS.escape(id)}"]`);
            const toInp = wizardReport.querySelector(`input[data-asr-to="${CSS.escape(id)}"]`);
            const from = String(fromInp?.value || d.from || '').trim();
            const to = String(toInp?.value || d.to || '').trim();
            if (from && to) picked.push({ ...d, from, to, title: pathBase(jaFile?.name) });
        });
        return picked;
    }

    async function adoptAsrWizard() {
        const picked = collectCheckedAsr();
        if (!picked.length) {
            alert('请勾选听写项，并填好「听错成 / 应为」');
            return;
        }
        if (!isSandboxWrite() && !confirm(`将写入 ${picked.length} 条听写纠错到「${writeTargetLabel()}」。确定？`)) return;
        if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = true;
        try {
            const { okN, failN } = await applyAsrBatch(picked, { quietConfirm: true });
            lastApplyOk = okN > 0;
            await refreshSandboxStatus();
            updateApplyCta();
            setStatus(`听写写入完成（${writeTargetLabel()}）：成功 ${okN}，失败 ${failN}`);
        } finally {
            if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = false;
        }
    }

    async function exportOpposingFixtures() {
        let proposals = collectCheckedProposals();
        if (!proposals.length) {
            proposals = proposalPool().filter((p) => p?.payload);
        }
        const prefer = proposals.filter((p) => p.opposingIntent?.risk);
        if (prefer.length) proposals = prefer;
        if (!proposals.length) {
            alert('没有可用的 remap 草案');
            return;
        }
        setStatus(`生成对立夹具（${proposals.length} 条）…`);
        try {
            const out = await api('/api/wizard/opposing-fixtures', {
                method: 'POST',
                body: JSON.stringify({
                    proposals,
                    title: pathBase(jaFile?.name),
                    dryRun: false,
                }),
            });
            if (!out.count) {
                setStatus(out.hint || '未命中对立意图面');
                alert(out.hint || '未生成夹具');
                return;
            }
            if (wizardFeedPack) {
                wizardFeedPack.classList.remove('hidden');
                const checklist = (out.checklist || []).map((c) => `- ${c}`).join('\n');
                wizardFeedPack.textContent = `${out.body || ''}\n\n// --- checklist ---\n${checklist}\n// file: ${out.file || '(memory)'}`;
            }
            try {
                await navigator.clipboard.writeText(out.body || '');
            } catch (_) { /* ignore */ }
            setStatus(`对立夹具 ${out.count} 组已生成${out.file ? ` → ${out.file}` : ''}（已复制）`);
            appendLog(`对立夹具：${out.count} 组${out.file ? ` → ${out.file}` : ''}`);
            alert(`已生成 ${out.count} 组对立夹具草稿\n${out.file || '见预览'}\n请审阅后粘贴进 tests/mt-sanitize.test.js，并更新 intent-core fixtureRefs。`);
        } catch (err) {
            setStatus(`对立夹具失败：${err.message || err}`);
            alert(err.message || String(err));
        }
    }

    async function copyFeedPack() {
        const harvest = lastHarvest || lastPrepare?.harvest;
        if (!harvest) {
            alert('请先完成一次学习');
            return;
        }
        setStatus('生成对照训练投喂包…');
        try {
            const out = await api('/api/wizard/feed-pack', {
                method: 'POST',
                body: JSON.stringify({
                    title: pathBase(jaFile?.name),
                    jaPath: lastPrepare?.jaPath || jaFile?.path || '',
                    zhPath: lastPrepare?.zhPath || zhFile?.path || '',
                    harvest,
                    scanSummary: lastPrepare?.scanSummary || {},
                    tips: lastPrepare?.diagnostics?.tips || [],
                }),
            });
            const text = out.markdown || out.plain || '';
            if (wizardFeedPack) {
                wizardFeedPack.classList.remove('hidden');
                wizardFeedPack.textContent = text;
            }
            try {
                await navigator.clipboard.writeText(text);
                setStatus('投喂包已复制 — 粘贴到「智能翻译对照训练」对话即可');
                appendLog('已复制投喂包到剪贴板');
            } catch (_) {
                setStatus('投喂包已生成（复制失败时请从下方预览手动复制）');
            }
        } catch (err) {
            setStatus(`投喂包失败：${err.message || err}`);
            alert(err.message || String(err));
        }
    }

    function resetWizard() {
        adoptList = [];
        window.__wizardLastReview = [];
        window.__wizardAsrDrafts = [];
        lastHarvest = null;
        lastApplyOk = false;
        lastApplyStats = null;
        hideOutcomePanels();
        wizardReport?.classList.add('hidden');
        wizardDrop?.classList.remove('hidden');
        setWizardStep(jaFile || zhFile ? 1 : 1);
        if (wizardHarvestHeadline) wizardHarvestHeadline.textContent = '';
        if (wizardDiag) {
            wizardDiag.classList.add('hidden');
            wizardDiag.textContent = '';
        }
        if (wizardTestOut) {
            wizardTestOut.classList.add('hidden');
            wizardTestOut.textContent = '';
        }
        if (btnWizardQuickApply) {
            btnWizardQuickApply.disabled = true;
            btnWizardQuickApply.textContent = '一键应用建议';
        }
        if (wizCtaHint) {
            wizCtaHint.classList.remove('done');
            wizCtaHint.textContent = '勾选好的改法会立刻改善本机后续翻译，可随时「撤销上次」。';
        }
        if (btnWizardTest) btnWizardTest.disabled = true;
        if (btnWizardAdoptAsr) btnWizardAdoptAsr.disabled = true;
        if (btnWizardFeedPack) btnWizardFeedPack.disabled = true;
        if (btnWizardOppose) btnWizardOppose.disabled = true;
        if (wizardFeedPack) {
            wizardFeedPack.classList.add('hidden');
            wizardFeedPack.textContent = '';
        }
        setStatus(jaFile && zhFile ? '两份字幕已就绪，可点「重新学习」或换文件' : '先放一对日中字幕，或从历史任务导入');
        syncLearnEnabled();
    }

    async function runShipGate() {
        setStatus('发库前检查…');
        appendLog('—— 发库前检查 ——');
        try {
            const done = await streamPost('/api/ship-gate', {}, {
                log: (line) => appendLog(line),
            });
            setStatus(done?.ok ? '发库前检查通过' : `发库前检查未通过（exit ${done?.code ?? '?'}）`);
        } catch (err) {
            setStatus(`发库前检查失败：${err.message || err}`);
            appendLog(String(err.message || err));
        }
    }

    async function runMocha() {
        setStatus('跑 mocha…');
        appendLog('—— mocha ——');
        try {
            const done = await streamPost('/api/mocha', {
                files: ['tests/mt-sanitize.test.js', 'tests/tdp-pack.test.js'],
            }, { log: (line) => appendLog(line) });
            setStatus(done?.ok ? 'mocha 通过' : `mocha 未通过（exit ${done?.code ?? '?'}）`);
        } catch (err) {
            setStatus(`mocha 失败：${err.message || err}`);
            appendLog(String(err.message || err));
        }
    }

    async function runTdp() {
        let version = String(tdpVersionEl?.value || '').trim();
        if (!version) {
            try {
                const suggest = await api('/api/tdp-suggest');
                if (suggest.next) {
                    version = suggest.next;
                    if (tdpVersionEl) tdpVersionEl.value = suggest.next;
                }
            } catch (_) { /* ignore */ }
        }
        if (!version) {
            alert('请填写 TDP 版本（如 1.0.1）');
            return;
        }
        if (!confirm(`签发术语包 ${version}？`)) return;
        setStatus(`签发 TDP ${version}…`);
        appendLog(`—— TDP ${version} ——`);
        try {
            const done = await streamPost('/api/tdp', { version, sign: true }, {
                log: (line) => appendLog(line),
            });
            setStatus(done?.ok ? `TDP ${version} 已签发` : `TDP 失败（exit ${done?.code ?? '?'}）`);
        } catch (err) {
            setStatus(`TDP 失败：${err.message || err}`);
            appendLog(String(err.message || err));
        }
    }

    async function probeHealth() {
        try {
            const h = await api('/api/health');
            if (h?.sandbox) applySandboxStatus(h.sandbox);
            else await refreshSandboxStatus();
            await ensureSafeWriteTarget();
            syncAutoApplyUi();
            applyProAudienceUi(h?.features || {});
            if (tdpVersionEl && !tdpVersionEl.value) {
                try {
                    const suggest = await api('/api/tdp-suggest');
                    if (suggest.next) tdpVersionEl.value = suggest.next;
                } catch (_) { /* ignore */ }
            }
            if (serverBanner) {
                const need = !h?.features?.wizardOnly
                    || !h?.features?.userSandbox
                    || !h?.features?.wizardAutoApply
                    || !h?.features?.wizardDoneState;
                if (need) {
                    serverBanner.classList.remove('hidden', 'ok');
                    serverBanner.textContent = '训练服务版本偏旧：请运行 npm run train:mt:restart';
                } else {
                    serverBanner.classList.add('hidden');
                }
            }
        } catch (err) {
            if (serverBanner) {
                serverBanner.classList.remove('hidden', 'ok');
                serverBanner.textContent = `无法连接训练服务：${err.message || err}`;
            }
        }
    }

    async function consumePendingPair() {
        if (!isElectron || !transubTrain?.consumePendingPair) return;
        try {
            const res = await transubTrain.consumePendingPair();
            const pair = res?.pair;
            if (!pair?.jaPath && !pair?.zhPath) return;
            const loaded = await api('/api/wizard/load-paths', {
                method: 'POST',
                body: JSON.stringify({
                    jaPath: pair.jaPath || '',
                    zhPath: pair.zhPath || pair.zhPathA || pair.zhPathB || '',
                    title: pair.title || '',
                }),
            });
            await assignJa(loaded.ja);
            await assignZh(loaded.zh);
        } catch (err) {
            console.warn('pending pair', err);
            setStatus(`片库导入失败：${err.message || err}`);
        }
    }

    bindZone(zoneJa, fileJa, 'ja');
    bindZone(zoneZh, fileZh, 'zh');
    wizardDrop?.addEventListener('dragover', (e) => e.preventDefault());
    wizardDrop?.addEventListener('drop', async (e) => {
        if (e.target.closest?.('.wizard-zone')) return;
        e.preventDefault();
        try {
            await handleFiles(e.dataTransfer?.files || []);
        } catch (err) {
            setStatus(err.message || String(err));
        }
    });

    btnWizardLearn?.addEventListener('click', () => runWizardLearn());
    btnWizardQuickApply?.addEventListener('click', () => void quickApplyWizard());
    btnWizardAdopt?.addEventListener('click', () => adoptWizard());
    btnWizardAdoptAsr?.addEventListener('click', () => adoptAsrWizard());
    btnWizardFeedPack?.addEventListener('click', () => copyFeedPack());
    btnWizardOppose?.addEventListener('click', () => exportOpposingFixtures());
    btnWizardTest?.addEventListener('click', () => runWizardTest(collectCheckedProposals()));
    btnWizardAgain?.addEventListener('click', () => resetWizard());
    btnWizardDoneAgain?.addEventListener('click', () => resetWizard());
    btnWizardEmptyAgain?.addEventListener('click', () => resetWizard());
    btnWizardDoneDetails?.addEventListener('click', () => {
        wizardDetailsWrap?.classList.remove('wizard-details-collapsed');
        wizardCtaBar?.classList.remove('is-quiet');
        try {
            wizardDetailsWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) { /* ignore */ }
    });
    btnWizardEmptyFeed?.addEventListener('click', () => void copyFeedPack());
    btnWizardSelectWritable?.addEventListener('click', () => selectWritable());
    btnShipGate?.addEventListener('click', () => {
        if (wizardLog) wizardLog.classList.remove('hidden');
        runShipGate();
    });
    btnMocha?.addEventListener('click', () => {
        if (wizardLog) wizardLog.classList.remove('hidden');
        runMocha();
    });
    btnTdp?.addEventListener('click', () => {
        if (wizardLog) wizardLog.classList.remove('hidden');
        runTdp();
    });
    wizSandboxTarget?.addEventListener('change', () => {
        void setSandboxTarget(wizSandboxTarget.value === 'official' ? 'official' : 'sandbox');
    });
    btnSandboxRollback?.addEventListener('click', () => void rollbackSandbox());
    wizAutoApply?.addEventListener('change', () => {
        writeAutoApplyPref(!!wizAutoApply.checked);
        setStatus(wizAutoApply.checked
            ? '已开启：学完自动应用建议（仅本机）'
            : '已关闭自动应用——学完后需点「一键应用」');
    });
    wizardReport?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-wiz-try]');
        if (!btn) return;
        const ji = String(btn.getAttribute('data-wiz-try'));
        const p = proposalPool().find((x) => String(x.ji) === ji);
        const edited = applyEditsToProposal(p);
        if (!edited?.payload) {
            alert('找不到该规则');
            return;
        }
        void runWizardTest([edited], { single: true });
    });
    btnWizardHistory?.addEventListener('click', () => openHistoryDialog());
    btnHistoryRefresh?.addEventListener('click', () => refreshHistoryPairs());
    btnHistorySelectVisible?.addEventListener('click', () => {
        historyList?.querySelectorAll('input[data-pair-check]').forEach((cb) => {
            cb.checked = true;
        });
    });
    btnHistoryImportChecked?.addEventListener('click', () => importCheckedAndLearn());
    historyFilter?.addEventListener('input', () => renderHistoryList());

    if (isElectron && btnWizardHistory && transubTrain?.listHistoryPairs) {
        btnWizardHistory.classList.remove('hidden');
    }
    if (transubTrain?.onPendingPair) {
        transubTrain.onPendingPair(() => { void consumePendingPair(); });
    }
    void fillWizardModels();
    void probeHealth();
    void consumePendingPair();
    syncLearnEnabled();
    syncAutoApplyUi();
    setWizardStep(1);
})();
