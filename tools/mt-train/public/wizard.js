'use strict';

(() => {
    const $ = (id) => document.getElementById(id);
    const wizardApp = $('wizardApp');
    const proApp = $('proApp');
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
    const wizardDrop = $('wizardDrop');
    const wizardReport = $('wizardReport');
    const wizardReportMeta = $('wizardReportMeta');
    const wizardModelWrap = $('wizardModelWrap');
    const wizardModel = $('wizardModel');
    const btnWizardAdopt = $('btnWizardAdopt');
    const btnWizardTest = $('btnWizardTest');
    const btnWizardAgain = $('btnWizardAgain');
    const wizardTestOut = $('wizardTestOut');
    const btnOpenPro = $('btnOpenPro');
    const btnBackWizard = $('btnBackWizard');

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

    function setStatus(msg) {
        if (wizardStatus) wizardStatus.textContent = msg;
    }

    function syncLearnEnabled() {
        if (btnWizardLearn) btnWizardLearn.disabled = !(jaFile && zhFile);
    }

    function showWizard() {
        wizardApp?.classList.remove('hidden');
        proApp?.classList.add('hidden');
        document.body.classList.add('wizard-mode');
        document.body.classList.remove('pro-mode');
    }

    function showPro() {
        wizardApp?.classList.add('hidden');
        proApp?.classList.remove('hidden');
        document.body.classList.add('pro-mode');
        document.body.classList.remove('wizard-mode');
    }

    function scoreLang(text) {
        const s = String(text || '');
        const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
        const latin = (s.match(/[A-Za-z]/g) || []).length;
        return { kana, han, latin, jaScore: kana * 3 + Math.min(han, kana * 2), zhScore: han - kana * 2 };
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
    }

    async function assignZh(entry) {
        zhFile = entry;
        if (zoneZhName) zoneZhName.textContent = entry.name + (entry.path ? '' : '（已读入）');
        zoneZh?.classList.add('filled');
        syncLearnEnabled();
        setStatus(jaFile ? '两份字幕已就绪，可开始学习' : '已选中文，请再选日文…');
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

    async function fillWizardModels() {
        if (!isElectron || !wizardModel || !wizardModelWrap) return;
        try {
            const mres = await transubTrain.getManagedLlmStatus?.();
            const catalog = (mres?.managed?.catalog || [])
                .filter((item) => item?.installed && !item.translateOnly
                    && String(item.family || '').toLowerCase() !== 'sakura');
            catalog.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh'));
            const want = String(
                mres?.managed?.smartTranslateModelId
                || mres?.managed?.activeModelId
                || catalog[0]?.id
                || '',
            );
            if (!catalog.length) {
                wizardModel.innerHTML = '<option value="">（请先下载通用对话模型）</option>';
                wizardModelWrap.classList.remove('hidden');
                return;
            }
            wizardModel.innerHTML = catalog.map((item) => {
                const id = String(item.id || '');
                const label = item.name || id;
                const sel = id === want ? ' selected' : '';
                return `<option value="${escapeHtml(id)}"${sel}>${escapeHtml(label)}</option>`;
            }).join('');
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
            historyDlg?.close();
            wizardReport?.classList.add('hidden');
            wizardDrop?.classList.remove('hidden');
            setStatus(`已导入：${res.pair?.title || res.ja.name}（可开始学规则）`);
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
            const first = loaded[0];
            await assignJa({ name: first.ja.name, text: first.ja.text, path: first.ja.path });
            await assignZh({ name: first.zh.name, text: first.zh.text, path: first.zh.path });

            setStatus(`跨片学规则：${loaded.length} 部对照中…`);
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
                    maxHitsPerPair: 8,
                    max: 36,
                    title: 'history-batch',
                }),
            });
            const okPairs = (learned.pairSummaries || []).filter((p) => p.ok).length;
            const rep = learned.report || {};
            renderReport(
                rep,
                `跨片 ${okPairs} 部 · 热点 ${learned.hitCount || 0} · 合并 ${learned.mergeCount || 0} · 可写 ${rep.adoptCount || 0}`,
            );
            setStatus(`跨片草案完成：建议写入 ${rep.adoptCount || 0}，需收窄 ${rep.reviewCount || 0}，已排除 ${rep.skipCount || 0}`);
        } catch (err) {
            setStatus(`跨片学习失败：${err.message || err}`);
            alert(err.message || String(err));
        } finally {
            if (btnHistoryImportChecked) btnHistoryImportChecked.disabled = false;
            syncLearnEnabled();
        }
    }

    function renderReport(report, meta) {
        const adopt = report?.adopt || [];
        const review = report?.review || [];
        const skip = report?.skip || [];
        adoptList = adopt.slice();
        window.__wizardLastReview = review.slice();
        $('wizAdoptN').textContent = String(adopt.length);
        $('wizReviewN').textContent = String(review.length);
        $('wizSkipN').textContent = String(skip.length);
        if (wizardReportMeta) wizardReportMeta.textContent = meta || '';

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
            // Client-side safety: if still long, show suggested short form
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
            const checked = editable && (p.reuse?.bucket === 'write' || p.confidence?.level === 'auto')
                ? 'checked'
                : '';
            const fromVal = p.payload?.zhFrom || '';
            const toVal = p.payload?.mode === 'blank' ? '…' : (p.payload?.zhTo || '');
            return `<article class="wizard-card" data-id="${escapeHtml(String(p.ji ?? ''))}">
  <header>
    <span class="wiz-issue">${issue ? escapeHtml(String(issue)) : 'rule'}</span>
    ${conf ? `<span class="wiz-conf">${escapeHtml(conf)}</span>` : ''}
    <span class="muted">#${escapeHtml(String(p.ji ?? ''))}</span>
  </header>
  <div class="wiz-rule mono">${ruleLine(p)}</div>
  ${anchor ? `<div class="muted">当日文含「${escapeHtml(anchor)}」${longHint ? ` · ${escapeHtml(longHint)}` : ''}</div>` : ''}
  <div class="muted">${escapeHtml(reuseReason)}${col ? ` · ${escapeHtml(col)}` : ''}</div>
  <details class="wiz-evidence">
    <summary>来源句</summary>
    <div class="mono">${escapeHtml(p.src || '')}</div>
    <div class="muted">${escapeHtml(p.dst || p.after || '')}</div>
  </details>
  ${editable ? `<div class="wiz-edit">
    <label>锚点 <input type="text" data-wiz-anchor="${escapeHtml(String(p.ji))}" value="${escapeHtml(anchor)}" title="请用短短语，勿整句" /></label>
    <label>zhFrom <input type="text" data-wiz-from="${escapeHtml(String(p.ji))}" value="${escapeHtml(fromVal)}" /></label>
    <label>zhTo <input type="text" data-wiz-to="${escapeHtml(String(p.ji))}" value="${escapeHtml(toVal)}" /></label>
  </div>
  <div class="wiz-card-ops">
    <label class="chk tight"><input type="checkbox" data-wiz-accept="${escapeHtml(String(p.ji))}" ${checked} /> 写入此规则</label>
    <button type="button" class="btn ghost wiz-test-btn" data-wiz-try="${escapeHtml(String(p.ji))}">试跑</button>
    <span class="wiz-test-badge hidden" data-wiz-badge="${escapeHtml(String(p.ji))}"></span>
  </div>
  <div class="wiz-test-detail hidden" data-wiz-detail="${escapeHtml(String(p.ji))}"></div>` : ''}
</article>`;
        }

        $('wizAdopt').innerHTML = adopt.length
            ? adopt.map((p) => card(p, true)).join('')
            : '<div class="empty">暂无可直接写入的短规则</div>';
        $('wizReview').innerHTML = review.length
            ? review.map((p) => card(p, true)).join('')
            : '<div class="empty">无</div>';
        $('wizSkip').innerHTML = skip.length
            ? skip.map((p) => card(p, false)).join('')
            : '<div class="empty">无</div>';

        btnWizardAdopt.disabled = adopt.length === 0 && review.length === 0;
        if (btnWizardTest) btnWizardTest.disabled = btnWizardAdopt.disabled;
        if (wizardTestOut) {
            wizardTestOut.classList.add('hidden');
            wizardTestOut.classList.remove('ok', 'bad');
            wizardTestOut.textContent = '';
        }
        wizardDrop?.classList.add('hidden');
        wizardReport?.classList.remove('hidden');
    }

    function proposalPool() {
        return [...adoptList, ...(window.__wizardLastReview || [])];
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
        if (issues.includes('under_stub')) return true;
        // Heuristic covers most HOT issues; only call model when heuristic would fail
        try {
            // Server-side heuristic mirrored lightly: blankable leaks never need model
            if (issues.some((i) => ['prompt_leak', 'sfx_halluc', 'latin', 'heixiu', 'ja_echo'].includes(i))) {
                return false;
            }
            if (issues.some((i) => [
                'iku_shoot', 'dechau_out', 'yame_shoot', 'iku_xing',
                'kiniri', 'kimochi_stub', 'clinical_rod', 'invent_rod',
            ].includes(i))) {
                return false;
            }
        } catch (_) { /* ignore */ }
        return true;
    }

    async function inferExpects(hits, modelId) {
        const expects = [];
        const needModel = hits.filter(needsModelAssist);
        if (!needModel.length) {
            setStatus('热点均可由情形策略覆盖，跳过模型整句推理');
            return expects;
        }
        if (!isElectron || !transubTrain?.inferSuggest) {
            setStatus('当前非 Electron，将仅用内置情形策略');
            return expects;
        }
        const max = Math.min(12, needModel.length);
        for (let i = 0; i < max; i += 1) {
            const hit = needModel[i];
            setStatus(`模型抽片段 ${i + 1}/${max} · #${hit.ji}`);
            try {
                const res = await transubTrain.inferSuggest({
                    ja: hit.src,
                    zh: hit.dst,
                    after: hit.after,
                    issues: hit.issues || [],
                    ...(modelId ? { modelId } : {}),
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
                maxHits: 12,
            };
            if (jaFile.path) prepBody.jaPath = jaFile.path;
            if (zhFile.path) prepBody.zhPath = zhFile.path;

            const prep = await api('/api/wizard/prepare', {
                method: 'POST',
                body: JSON.stringify(prepBody),
            });
            lastPrepare = prep;
            const hits = prep.hotHits || [];
            if (!hits.length) {
                setStatus(`对照完成：待修 ${prep.scanSummary?.liveHitCount || 0}。没有适合学规则的高热度问题。`);
                renderReport({ adopt: [], review: [], skip: [] }, '无可学习项');
                return;
            }

            const needModel = hits.some(needsModelAssist);
            const modelId = wizardModel?.value || '';
            if (isElectron && needModel && !modelId) {
                setStatus('部分句需模型抽片段：请选择已下载的通用对话模型');
                return;
            }

            let expects = [];
            if (needModel) {
                setStatus(`抽规则片段中（最多 ${hits.filter(needsModelAssist).length} 条）…`);
                expects = await inferExpects(hits, modelId);
            } else {
                setStatus('使用内置情形策略生成规则草案…');
            }
            const viaModel = expects.length > 0;

            setStatus(viaModel
                ? `已抽 ${expects.length} 条片段，生成规则草案…`
                : '生成规则草案…');
            const learned = await api('/api/wizard/learn', {
                method: 'POST',
                body: JSON.stringify({
                    hits,
                    expects,
                    title: pathBase(jaFile.name),
                    max: hits.length,
                }),
            });
            const sum = prep.scanSummary || {};
            const rep = learned.report || {};
            renderReport(
                rep,
                `对齐 ${sum.aligned || 0} · 待修 ${sum.liveHitCount || 0} · 可写 ${rep.adoptCount || 0} · 排除整句 ${rep.wholeFiltered || 0}`,
            );
            setStatus(`草案完成：建议写入 ${rep.adoptCount || 0}，需收窄 ${rep.reviewCount || 0}，已排除 ${rep.skipCount || 0}`);
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

    async function adoptWizard() {
        const picked = collectCheckedProposals();
        if (!picked.length) {
            alert('请至少勾选一条规则');
            return;
        }
        if (!confirm(`将写入 ${picked.length} 条全局清洗规则（全部片子生效）。确定？`)) return;

        btnWizardAdopt.disabled = true;
        if (btnWizardTest) btnWizardTest.disabled = true;
        setStatus(`正在写入 ${picked.length} 条…`);
        let okN = 0;
        let failN = 0;
        try {
            for (const p of picked) {
                const mode = p.payload.mode === 'blank' ? 'blank' : 'replace';
                const expect = mode === 'blank'
                    ? '…'
                    : String(p.payload.expect || p.payload.zhTo || '').trim();
                try {
                    await api('/api/train/apply', {
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
                        }),
                    });
                    okN += 1;
                } catch (err) {
                    failN += 1;
                    console.warn(err);
                }
            }
            setStatus(`写入完成：成功 ${okN}，失败 ${failN}`);
            alert(`已写入 ${okN} 条规则${failN ? `，失败 ${failN}` : ''}`);
        } finally {
            btnWizardAdopt.disabled = false;
            if (btnWizardTest) btnWizardTest.disabled = false;
        }
    }

    function resetWizard() {
        adoptList = [];
        window.__wizardLastReview = [];
        wizardReport?.classList.add('hidden');
        wizardDrop?.classList.remove('hidden');
        if (wizardTestOut) {
            wizardTestOut.classList.add('hidden');
            wizardTestOut.textContent = '';
        }
        if (btnWizardTest) btnWizardTest.disabled = true;
        setStatus(jaFile && zhFile ? '可再次开始学习' : '等待字幕…');
        syncLearnEnabled();
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
    btnWizardAdopt?.addEventListener('click', () => adoptWizard());
    btnWizardTest?.addEventListener('click', () => runWizardTest(collectCheckedProposals()));
    btnWizardAgain?.addEventListener('click', () => resetWizard());
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
    btnOpenPro?.addEventListener('click', () => showPro());
    btnBackWizard?.addEventListener('click', () => showWizard());
    btnWizardHistory?.addEventListener('click', () => openHistoryDialog());
    btnHistoryRefresh?.addEventListener('click', () => refreshHistoryPairs());
    btnHistorySelectVisible?.addEventListener('click', () => {
        historyList?.querySelectorAll('input[data-pair-check]').forEach((cb) => {
            cb.checked = true;
        });
    });
    btnHistoryImportChecked?.addEventListener('click', () => importCheckedAndLearn());
    historyFilter?.addEventListener('input', () => renderHistoryList());

    showWizard();
    if (isElectron && btnWizardHistory && transubTrain?.listHistoryPairs) {
        btnWizardHistory.classList.remove('hidden');
    }
    void fillWizardModels();
    syncLearnEnabled();
})();
