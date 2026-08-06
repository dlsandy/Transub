(() => {
    const $ = (id) => document.getElementById(id);
    const LS = {
        hideSoft: 'mtTrain.hideSoft',
        useCache: 'mtTrain.useCache',
        sortLive: 'mtTrain.sortLive',
        batchLimit: 'mtTrain.batchLimit',
        lastCode: 'mtTrain.lastCode',
        titleFilter: 'mtTrain.titleFilter',
        translateModelId: 'mtTrain.translateModelId',
    };

    const titleList = $('titleList');
    const clustersEl = $('clusters');
    const summaryEl = $('summary');
    const logEl = $('log');
    const jaPathEl = $('jaPath');
    const zhPathEl = $('zhPath');
    const hideAlignEl = $('hideAlign');
    const useCacheEl = $('useCache');
    const sortLiveEl = $('sortLive');
    const titleFilterEl = $('titleFilter');
    const searchHitsEl = $('searchHits');
    const clusterChipsEl = $('clusterChips');
    const batchLimitEl = $('batchLimit');
    const btnPoison = $('btnPoison');
    const btnPreview = $('btnPreview');
    const btnCopyJson = $('btnCopyJson');
    const btnCopyMocha = $('btnCopyMocha');
    const tdpVersionEl = $('tdpVersion');
    const tdpNotesEl = $('tdpNotes');
    const batchBar = $('batchBar');
    const fixesPanel = $('fixesPanel');
    const fixesBody = $('fixesBody');
    const fixesCount = $('fixesCount');
    const titleCountEl = $('titleCount');
    const previewDlg = $('previewDlg');
    const dlgTitle = $('dlgTitle');
    const dlgBody = $('dlgBody');
    const dlgCopy = $('dlgCopy');
    const dlgWrite = $('dlgWrite');
    const autoDlg = $('autoDlg');
    const autoDlgTitle = $('autoDlgTitle');
    const autoDlgHelp = $('autoDlgHelp');
    const autoDlgBody = $('autoDlgBody');
    const btnAutoPropose = $('btnAutoPropose');
    const btnAutoSmart = $('btnAutoSmart');
    const btnAutoSelectReady = $('btnAutoSelectReady');
    const btnAutoInferMissing = $('btnAutoInferMissing');
    const btnAutoApply = $('btnAutoApply');
    const autoFilters = $('autoFilters');
    const serverBanner = $('serverBanner');
    const trainKindEl = $('trainKind');
    const trainPinFinalEl = $('trainPinFinal');
    const trainJaAnchorEl = $('trainJaAnchor');
    const trainZhFromEl = $('trainZhFrom');
    const trainZhToEl = $('trainZhTo');
    const trainFragRow = $('trainFragRow');
    const trainExpectEl = $('trainExpect');
    const trainAsrToEl = $('trainAsrTo');
    const trainExpectLabel = $('trainExpectLabel');
    const trainAsrRow = $('trainAsrRow');
    const trainHint = $('trainHint');
    const trainTryOut = $('trainTryOut');
    const trainLocalPreview = $('trainLocalPreview');
    const trainQualityTips = $('trainQualityTips');
    const trainCoach = $('trainCoach');
    const trainCoachTitle = $('trainCoachTitle');
    const trainCoachBody = $('trainCoachBody');
    const guidePanel = $('guidePanel');
    const btnGuide = $('btnGuide');
    const btnTrainTry = $('btnTrainTry');
    const btnTrainApply = $('btnTrainApply');
    const electronTrainRow = $('electronTrainRow');
    const electronTrainStatus = $('electronTrainStatus');
    const trainTranslateModelEl = $('trainTranslateModel');
    const btnTrainTranslate = $('btnTrainTranslate');
    const btnTrainInfer = $('btnTrainInfer');
    const btnBatchTranslate = $('btnBatchTranslate');
    const btnBatchInfer = $('btnBatchInfer');
    const batchDlg = $('batchDlg');
    const batchDlgTitle = $('batchDlgTitle');
    const batchDlgHelp = $('batchDlgHelp');
    const batchDlgBody = $('batchDlgBody');
    const batchProgress = $('batchProgress');
    const btnBatchSelectAll = $('btnBatchSelectAll');
    const btnBatchConfirm = $('btnBatchConfirm');
    const transubTrain = window.transubTrain;
    const isElectronTrain = Boolean(transubTrain?.isElectron);

    const GENERIC_JA = new Set([
        'いく', 'イク', 'イッ', 'あっ', 'あぁ', 'ん', 'うん', 'はっ', 'あっ…', 'んっ',
    ]);

    let titlesCache = [];
    let batchStats = new Map();
    let currentScan = null;
    let activeCode = '';
    let activeClusterFilter = '';
    let dlgMode = null; // 'poison-preview' | 'draft' | 'text'
    let pendingPoisonHits = null;
    /** @type {object[]} */
    let autoProposals = [];
    let autoFilter = 'actionable';
    /** @type {object[]} */
    let batchRows = [];
    let batchMode = ''; // 'translate' | 'infer'
    const selected = new Map();
    const scanCache = new Map(); // key -> scan result

    const HOT = new Set([
        'prompt_leak', 'iku_shoot', 'dechau_out', 'yame_shoot', 'iku_xing',
        'kiniri', 'kimochi_stub', 'clinical_rod', 'invent_rod', 'sfx_halluc', 'latin',
        'heixiu', 'under_stub', 'ja_echo',
    ]);
    const SOFT = new Set(['align_suspect', 'moan_expand']);

    /** Internal keys → Chinese labels shown in UI */
    const ISSUE_LABEL = {
        prompt_leak: '提示词泄漏',
        iku_shoot: 'イク误成「射」',
        dechau_out: '「出来了」该改「射」',
        yame_shoot: '「别/停」误成「射」',
        iku_xing: 'いく误成「行了」',
        kiniri: '気に入误成「进去」',
        kimochi_stub: '「舒服」译得太短',
        clinical_rod: '临床词（阴茎等）',
        invent_rod: '无中生有（杆状）',
        sfx_halluc: '拟声幻觉',
        latin: '英文残片',
        heixiu: '「嘿咻」幻觉',
        under_stub: '译文过短',
        ja_echo: '日文原样残留',
        moan_expand: '短吟被扩写',
        align_suspect: '对齐可疑',
        other: '其他',
        trained_remap: '训练规则',
        trained_remap_final: '训练规则（防润色）',
    };

    function issueLabel(key) {
        const k = String(key || '');
        if (k.startsWith('fixed:')) {
            const inner = k.slice(6);
            return `已修好：${ISSUE_LABEL[inner] || inner}`;
        }
        return ISSUE_LABEL[k] || k;
    }

    const FLAG_LABEL = {
        wet_sfx: '湿声拟声',
        wet_sfx_ja: '日文拟声',
        wet_sfx_recover: '拟声回收',
        empty_placeholder: '已弱化为…',
        prompt_leak: '提示词泄漏',
        trained_remap: '训练规则',
        trained_remap_final: '训练规则（钉死）',
        domain_term: '领域词',
        domain_hallucination: '领域幻觉',
    };

    function flagLabel(flag) {
        return FLAG_LABEL[flag] || flag;
    }

    function isSoftCluster(name) {
        return SOFT.has(name) || String(name).startsWith('fixed:');
    }

    /** Plain-language coaching for the selected hit. */
    function coachForHit(hit) {
        if (!hit) {
            return {
                level: '',
                title: '还没选句子',
                body: '在中间列表勾选一条带彩色标签的「待修」问题。对齐可疑、已修好通常不用训。',
            };
        }
        const issues = Array.isArray(hit.issues) ? hit.issues : [];
        const flags = Array.isArray(hit.flags) ? hit.flags : [];
        const src = String(hit.src || '').trim();
        const dst = String(hit.dst || '').trim();
        const after = String(hit.after || '').trim();
        const jaShort = src.length <= 2 || /^[&＋+\-—…·.。,，、\s]+$/u.test(src);
        const zhLong = dst.length >= 8;
        const allFixed = issues.length > 0 && issues.every((i) => String(i).startsWith('fixed:'));
        const hasAlign = issues.includes('align_suspect');
        const hasMoan = issues.includes('moan_expand');
        const hot = issues.filter((i) => HOT.has(i));
        const wetBlank = (flags.includes('wet_sfx') || flags.includes('wet_sfx_ja'))
            && (after === '…' || after === '...' || after === '');

        if (hasAlign || (jaShort && zhLong)) {
            return {
                level: 'skip',
                title: '对齐坏了 — 不要写规则',
                body: '日文太短/残片，却对上了一长句中文，多半是时间轴对错了。请去改字幕文件的时间或内容；用「&」这类锚点训练会误伤全局。',
                steps: ['取消勾选本条', '需要的话在字幕编辑器里对齐日文/中文', '回到训练台只处理彩色「待修」标签'],
            };
        }
        if (wetBlank && !hot.length) {
            return {
                level: 'ok',
                title: '拟声已正确弱化 — 一般不用再改',
                body: '日文是湿声/拟声，错对白被洗成「…」是预期行为。「规则已改好的样例」里常见这种成功例子。',
                steps: ['若改后你仍想保留具体拟声中文：改该部中文字幕，而不是加全局规则', '若中文其实属于别的句子：修时间轴'],
            };
        }
        if (allFixed) {
            return {
                level: 'ok',
                title: '已修好 — 这是成功样例',
                body: `清洗前有「${issues.map(issueLabel).join('、')}」，清洗后分类器认为已消除。默认可忽略；只有「规则清洗后」你仍不满意时才重训。`,
                steps: ['展开看「规则清洗后」是否自然', '仍不满意 → 填期望译文 → 试跑 → 写入', '满意 → 保持「只看待修」，别重复训练'],
            };
        }
        if (hasMoan && !hot.length) {
            return {
                level: 'skip',
                title: '短吟被扩写 — 次要问题',
                body: '短语气被译成过长对白。可先观察；真要压短再用「改中文」做局部替换，或清空弱化（慎用）。',
            };
        }
        if (hit.asr && src && hit.asr !== src && !hot.length) {
            return {
                level: 'warn',
                title: '日文可能听写错了',
                body: `已有听写纠错：${src} → ${hit.asr}。若源日文仍不对，请把类型改成「听写纠错」；若只是中文译错，用「改中文」。`,
                steps: ['类型选「听写纠错」', '「听写纠正为」填正确日文', '试跑 → 写入'],
            };
        }
        if (hot.length) {
            const names = hot.map(issueLabel).join('、');
            return {
                level: 'warn',
                title: `值得训练：${names}`,
                body: '这是高热度、可复现的领域问题。用局部替换钉牢，并勾选「防润色冲掉」。',
                steps: [
                    '确认期望译文（可点「翻译/推理期望」辅助）',
                    '看绿色「局部替换」预览是否只改错词',
                    '试跑通过后再「写入并验证」',
                    '写入后点「跑全部测试」防回归',
                ],
            };
        }
        return {
            level: '',
            title: `训练目标 #${hit.ji}`,
            body: '填期望译文 → 确认局部替换合理 → 试跑 → 写入。锚点用具体日文短语，不要过短泛词。',
            steps: ['改中文：译错时用', '听写纠错：日文源错时用', '清空弱化：整句不该出字时才用'],
        };
    }

    function renderTrainCoach(hit) {
        if (!trainCoach || !trainCoachTitle || !trainCoachBody) return;
        const coach = coachForHit(hit);
        trainCoach.classList.remove('skip', 'ok', 'warn');
        if (coach.level) trainCoach.classList.add(coach.level);
        trainCoachTitle.textContent = coach.title;
        const steps = Array.isArray(coach.steps) && coach.steps.length
            ? `<ol class="coach-steps">${coach.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
            : '';
        trainCoachBody.innerHTML = `${escapeHtml(coach.body)}${steps}`;
    }

    function log(line) {
        logEl.textContent += `${line}\n`;
        logEl.scrollTop = logEl.scrollHeight;
    }
    function clearLog() { logEl.textContent = ''; }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pathBasename(p) {
        return String(p).split(/[/\\]/).pop();
    }

    function scanKey(ja, zh) {
        return `${ja}\0${zh}`;
    }

    function lsGet(k, fallback) {
        try {
            const v = localStorage.getItem(k);
            return v == null ? fallback : v;
        } catch (_) {
            return fallback;
        }
    }
    function lsSet(k, v) {
        try { localStorage.setItem(k, v); } catch (_) { /* ignore */ }
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

    async function ensureTrainApiOrExplain(err) {
        const msg = String(err?.message || err || '');
        if (/unknown api/i.test(msg)) {
            return new Error('训练台服务还是旧版。请关闭训练台窗口后重开，或运行 npm run train:mt:restart，再刷新页面。');
        }
        return err instanceof Error ? err : new Error(msg);
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
                if (event === 'progress' && handlers.progress) handlers.progress(obj);
                if (event === 'title' && handlers.title) handlers.title(obj);
                if (event === 'start' && handlers.start) handlers.start(obj);
                if (event === 'done') {
                    donePayload = obj;
                    if (handlers.done) handlers.done(obj);
                }
            }
        }
        return donePayload;
    }

    function hitKey(hit) {
        return `${hit.ji}|${hit.src}`;
    }

    function primaryHit() {
        return selected.size ? [...selected.values()][0] : null;
    }

    function suggestLocalReplaceClient(dirty, expect) {
        const a = String(dirty ?? '');
        const b = String(expect ?? '');
        if (!a || a === b) return null;
        let start = 0;
        const minLen = Math.min(a.length, b.length);
        while (start < minLen && a[start] === b[start]) start += 1;
        let endA = a.length;
        let endB = b.length;
        while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
            endA -= 1;
            endB -= 1;
        }
        let zhFrom = a.slice(start, endA);
        let zhTo = b.slice(start, endB);
        if (!zhFrom && b.startsWith(a)) {
            return { zhFrom: a, zhTo: b, wholeSentence: true, expandStub: true };
        }
        if (!zhFrom) {
            return { zhFrom: a, zhTo: b, wholeSentence: true, expandStub: true };
        }
        const wholeSentence = (zhFrom.length >= a.length && a.length > 12)
            || zhFrom.length >= Math.max(8, a.length * 0.85);
        return { zhFrom, zhTo, wholeSentence };
    }

    function isLowReuseReplace(zhFrom, dirty, { expandStub = false } = {}) {
        const from = String(zhFrom || '');
        const text = String(dirty || '');
        if (!from || !text) return false;
        if (expandStub && from.length <= 6) return false;
        return from.length >= Math.max(12, Math.floor(text.length * 0.85));
    }

    function syncFragFromExpect(dirty, expect, { force = false } = {}) {
        if (!trainZhFromEl || !trainZhToEl) return null;
        if (!force && (trainZhFromEl.dataset.touched || trainZhToEl.dataset.touched)) return null;
        const sug = expect ? suggestLocalReplaceClient(dirty, expect) : null;
        if (!sug) return null;
        trainZhFromEl.value = sug.zhFrom || '';
        trainZhToEl.value = sug.zhTo || '';
        return sug;
    }

    function expectFromFrag(dirty, zhFrom, zhTo) {
        const text = String(dirty || '');
        const from = String(zhFrom || '');
        const to = String(zhTo || '');
        if (!from || !text.includes(from)) return to || text;
        return text.split(from).join(to);
    }

    function suggestJaAnchorClient(ja) {
        const s = String(ja || '').trim();
        if (!s) return '';
        const maxLen = 14;
        const kataRuns = s.match(/[ァ-ヴー]{3,}/gu) || [];
        const bestKata = kataRuns.slice().sort((a, b) => b.length - a.length)[0];
        if (bestKata && bestKata.length >= 3 && bestKata.length <= maxLen) return bestKata;
        const parts = s.split(/[、。．.…・！？!?,，\s　]+/u).map((p) => p.trim()).filter((p) => p.length >= 2);
        const counts = new Map();
        for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
        const repeated = [...counts.entries()]
            .filter(([p, n]) => n >= 2 && p.length <= maxLen && !GENERIC_JA.has(p))
            .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
        if (repeated) return repeated[0];
        const content = parts.filter((p) => p.length >= 3 && p.length <= maxLen && !GENERIC_JA.has(p))
            .sort((a, b) => b.length - a.length)[0];
        if (content) return content;
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen);
    }

    function dirtyZhForHit(hit) {
        // Pipeline input is the cue ZH (aligned human/MT line before sanitize).
        return String(hit?.dst || hit?.after || '');
    }

    function refreshTrainQualityUi() {
        const hit = primaryHit();
        const kind = trainKindEl.value;
        const tips = [];
        let warn = false;
        if (!hit) {
            if (trainLocalPreview) {
                trainLocalPreview.classList.add('hidden');
                trainLocalPreview.textContent = '';
            }
            if (trainQualityTips) {
                trainQualityTips.classList.add('hidden');
                trainQualityTips.textContent = '';
            }
            return;
        }

        if (hit.asr) {
            tips.push(`日文已被听写纠错为「${hit.asr}」。若源听写仍错，请改用类型「听写纠错」。`);
        }

        if (kind === 'blank') {
            warn = true;
            tips.push('清空会把整句变成「…」，仅用于确实不该出字的弱化句。');
        } else if (kind === 'asr') {
            tips.push('听写纠错改日文源；译错请用「改中文」。');
        } else {
            const dirty = dirtyZhForHit(hit);
            let expect = trainExpectEl.value.trim();
            const manualFrom = trainZhFromEl?.value.trim() || '';
            const manualTo = trainZhToEl?.value.trim() || '';
            let sug = null;
            if (manualFrom) {
                sug = {
                    zhFrom: manualFrom,
                    zhTo: manualTo,
                    wholeSentence: isLowReuseReplace(manualFrom, dirty),
                };
                if (!expect || !trainExpectEl.dataset.touched) {
                    expect = expectFromFrag(dirty, manualFrom, manualTo);
                    if (!trainExpectEl.dataset.touched) trainExpectEl.value = expect;
                }
            } else {
                sug = expect ? suggestLocalReplaceClient(dirty, expect) : null;
                if (sug) syncFragFromExpect(dirty, expect);
            }
            if (trainLocalPreview) {
                if (sug?.zhFrom) {
                    trainLocalPreview.classList.remove('hidden');
                    if (sug.expandStub) {
                        trainLocalPreview.textContent =
                            `短译补全：「${sug.zhFrom}」→「${sug.zhTo}」`;
                    } else {
                        trainLocalPreview.textContent = sug.wholeSentence
                            || isLowReuseReplace(sug.zhFrom, dirty)
                            ? `⚠ 接近整句，复用性差：「${sug.zhFrom}」→「${sug.zhTo}」`
                            : `将写入规则：「${sug.zhFrom}」→「${sug.zhTo}」`;
                    }
                } else {
                    trainLocalPreview.classList.add('hidden');
                    trainLocalPreview.textContent = '';
                }
            }
            if (sug && (sug.wholeSentence || isLowReuseReplace(sug.zhFrom, dirty))) {
                warn = true;
                tips.push('接近整句替换，复用性差——请缩短错误片段后再写入。');
            }
            const anchor = trainJaAnchorEl.value.trim();
            if (anchor && (GENERIC_JA.has(anchor) || anchor.length <= 2)) {
                warn = true;
                tips.push(`日文锚点「${anchor}」过宽，易误伤其它影片。`);
            }
            if (!trainPinFinalEl.checked) {
                tips.push('建议保持「防润色冲掉」，避免中段改对后又被冲掉。');
            }
            const hotIssues = (hit.issues || []).filter((i) => HOT.has(i));
            if (hotIssues.length) {
                tips.push(`高热度问题：${hotIssues.map(issueLabel).join('、')} — 优先钉牢这类规则。`);
            }
        }

        if (kind === 'asr' || kind === 'blank') {
            if (trainLocalPreview) {
                trainLocalPreview.classList.add('hidden');
                trainLocalPreview.textContent = '';
            }
        }

        if (trainQualityTips) {
            if (tips.length) {
                trainQualityTips.classList.remove('hidden');
                trainQualityTips.classList.toggle('warn', warn);
                trainQualityTips.innerHTML = `<ul>${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
            } else {
                trainQualityTips.classList.add('hidden');
                trainQualityTips.textContent = '';
            }
        }
    }

    function syncTrainFormFromSelection() {
        const hit = primaryHit();
        const n = selected.size;
        btnTrainTry.disabled = n === 0;
        btnTrainApply.disabled = n === 0;
        if (btnTrainTranslate) btnTrainTranslate.disabled = n === 0;
        if (btnTrainInfer) btnTrainInfer.disabled = n === 0;
        if (!hit) {
            trainHint.textContent = '勾选问题后填写短片段规则';
            renderTrainCoach(null);
            refreshTrainQualityUi();
            return;
        }
        trainHint.textContent = n > 1
            ? `已勾选 ${n} 条，规则将使用第一条 #${hit.ji}`
            : `规则目标 #${hit.ji}`;
        renderTrainCoach(hit);

        // Prefer ASR fix when raw JA was already corrected by existing pairs
        // and the remaining issue looks source-side — offer asr mode once.
        if (!trainKindEl.dataset.autoAsr && hit.asr && hit.src && hit.asr !== hit.src) {
            const srcSide = (hit.issues || []).some((i) => i === 'ja_echo' || i === 'under_stub');
            if (srcSide && trainKindEl.value === 'replace') {
                trainHint.textContent += ' · 可切到「听写纠错」';
            }
        }

        if (!trainJaAnchorEl.dataset.touched) {
            trainJaAnchorEl.value = suggestJaAnchorClient(hit.src || '');
        }
        if (!trainExpectEl.dataset.touched) {
            // Human ZH is the polish target for domain residuals in the corpus
            trainExpectEl.value = hit.dst || hit.after || '';
        }
        if (trainKindEl.value === 'asr' && !trainAsrToEl.dataset.touched) {
            trainAsrToEl.value = hit.asr || hit.src || '';
            if (!trainJaAnchorEl.dataset.touched) {
                trainJaAnchorEl.value = hit.src || '';
            }
        }
        if (!trainPinFinalEl.dataset.touched) {
            trainPinFinalEl.checked = true;
        }
        refreshTrainQualityUi();
    }

    function updatePoisonBtn() {
        const n = selected.size;
        btnPoison.disabled = n === 0;
        btnPreview.disabled = n === 0;
        btnCopyJson.disabled = n === 0;
        btnCopyMocha.disabled = n === 0;
        btnPoison.textContent = n ? `导出用例草稿 (${n})` : '导出用例草稿';
        syncTrainFormFromSelection();
    }

    function formatTrainTry(trial) {
        const st = trial.stages || {};
        const lines = [
            trial.matchesExpect == null ? '' : (trial.matchesExpect ? '✓ 最终输出已等于期望' : '✗ 最终输出尚未等于期望'),
            `最终：${trial.final}`,
            `领域后：${st.afterDomain ?? '—'}`,
            `润色后：${st.afterPolish ?? '—'}`,
            `流畅度后：${st.afterFluency ?? '—'}`,
            `回收后：${st.afterRecover ?? '—'}`,
            `标记：${(trial.flags || []).join(', ') || '无'}`,
        ];
        if (trial.candidate) {
            const c = trial.candidate;
            if (c.from != null) lines.unshift(`候选听写：${c.from} → ${c.to}`);
            else lines.unshift(`候选规则：${c.mode}｜${(c.jaIncludes || []).join(' + ')}｜${c.zhFrom} → ${c.zhTo || '…'}｜pinFinal=${c.pinFinal}`);
        }
        for (const w of trial.warnings || []) lines.push(`注意：${w}`);
        for (const t of trial.tips || []) lines.push(`建议：${t}`);
        if (trial.suggestion?.zhFrom) {
            lines.push(`局部：${trial.suggestion.zhFrom} → ${trial.suggestion.zhTo || ''}`);
        }
        if (trial.undoneBy) lines.push(`被冲掉于：${trial.undoneBy}`);
        if (trial.matchesExpect) lines.push('下一步：跑 mocha / TDP 防回归');
        return lines.filter(Boolean).join('\n');
    }

    function buildTrainPayload() {
        const hit = primaryHit();
        if (!hit) throw new Error('请先勾选一条问题');
        const kind = trainKindEl.value;
        const dirty = dirtyZhForHit(hit);
        const jaAnchor = trainJaAnchorEl.value.trim()
            || suggestJaAnchorClient(hit.src || '')
            || hit.src;
        const base = {
            title: activeCode || hit.title || '',
            note: (hit.issues || []).join(',') || hit.note || '',
            ja: hit.src,
            zh: dirty,
            jaPath: jaPathEl.value.trim(),
            zhPath: zhPathEl.value.trim(),
            contentProfile: 'av_soft',
            pinFinal: trainPinFinalEl.checked,
            jaAnchor,
            asrHint: Boolean(hit.asr),
        };
        if (kind === 'asr') {
            return {
                ...base,
                kind: 'asr',
                from: trainJaAnchorEl.value.trim() || hit.src,
                to: trainAsrToEl.value.trim(),
                expect: undefined,
            };
        }
        if (kind === 'blank') {
            return {
                ...base,
                kind: 'zh',
                mode: 'blank',
                expect: '…',
                zhFrom: trainZhFromEl?.value.trim()
                    || trainExpectEl.value.trim()
                    || hit.after
                    || hit.dst
                    || '',
                pinFinal: true,
            };
        }
        const manualFrom = trainZhFromEl?.value.trim() || '';
        const manualTo = trainZhToEl?.value.trim() || '';
        let expect = trainExpectEl.value.trim();
        let zhFrom = manualFrom;
        let zhTo = manualTo;
        if (manualFrom) {
            if (!expect) expect = expectFromFrag(dirty, manualFrom, manualTo);
            zhTo = manualTo;
        } else {
            const sug = expect ? suggestLocalReplaceClient(dirty, expect) : null;
            zhFrom = sug?.zhFrom || '';
            zhTo = sug ? sug.zhTo : expect;
            if (sug) syncFragFromExpect(dirty, expect);
        }
        return {
            ...base,
            kind: 'zh',
            mode: 'replace',
            expect,
            zhFrom,
            zhTo,
        };
    }

    async function runTrainTry() {
        try {
            const body = buildTrainPayload();
            if (body.kind === 'asr' && !body.to) {
                alert('请填写听写纠正结果');
                return;
            }
            if (body.kind !== 'asr' && body.mode !== 'blank' && !body.expect && !body.zhFrom) {
                alert('请填写错误片段或整句预览');
                return;
            }
            const trial = await api('/api/train/try', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (trial.undoneBy && !trainPinFinalEl.checked) {
                trainPinFinalEl.checked = true;
                log('试跑显示结果被后续步骤冲掉，已自动勾选「防润色冲掉」——请再试跑一次');
            }
            trainTryOut.classList.remove('hidden');
            trainTryOut.textContent = formatTrainTry(trial);
            refreshTrainQualityUi();
            log(trial.matchesExpect ? '试跑：已命中期望' : '试跑：尚未命中期望（可收窄锚点/局部替换后写入）');
        } catch (err) {
            log(`试跑失败：${err.message}`);
            alert(err.message);
        }
    }

    async function runTrainApply() {
        try {
            const body = buildTrainPayload();
            if (body.kind === 'asr' && !body.to) {
                alert('请填写听写纠正结果');
                return;
            }
            if (body.kind !== 'asr' && body.mode !== 'blank' && !body.expect && !body.zhFrom) {
                alert('请填写错误片段或整句预览');
                return;
            }
            if (body.kind !== 'asr' && body.mode !== 'blank' && !body.zhFrom) {
                alert('请填写要替换的错误片段（zhFrom）');
                return;
            }
            if (body.mode === 'blank') {
                const ok = confirm('清空弱化会把命中句变成「…」，且为全局规则。确定写入？');
                if (!ok) return;
            }
            if (body.kind !== 'asr' && body.mode !== 'blank') {
                const dirty = String(body.zh || '');
                const whole = isLowReuseReplace(body.zhFrom, dirty);
                const anchor = String(body.jaAnchor || '');
                if (GENERIC_JA.has(anchor) || anchor.length <= 2) {
                    const ok = confirm(`日文锚点「${anchor || '（空）'}」过宽，可能误伤其它影片。仍要写入？`);
                    if (!ok) return;
                }
                if (whole) {
                    alert('当前接近整句替换，复用性差，已阻止写入。请缩短「错误片段」后再试。');
                    return;
                }
                if (anchor.length >= 18 || (body.ja && anchor.length >= Math.floor(String(body.ja).length * 0.7))) {
                    const suggested = suggestJaAnchorClient(body.ja || anchor);
                    alert(`日文锚点过长（接近整句），复用性差。建议改为「${suggested || '短短语'}」后再写入。`);
                    if (suggested && trainJaAnchorEl) trainJaAnchorEl.value = suggested;
                    return;
                }
            }
            const beforeLive = currentScan?.liveHitCount;
            const out = await api('/api/train/apply', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            scanCache.clear();
            trainTryOut.classList.remove('hidden');
            const trial = out.trial || {};
            trainTryOut.textContent = formatTrainTry(trial);
            const afterLive = out.scanSummary?.liveHitCount;
            log(`规则已生效 ${out.rule?.id || ''}`
                + (beforeLive != null && afterLive != null ? `，待修 ${beforeLive}→${afterLive}` : ''));
            if (trial.matchesExpect) {
                log('写入验证通过。建议点击 mocha / TDP 做回归。');
            } else {
                log('写入后仍未命中期望：检查锚点、局部片段，或确认已勾选防润色。');
            }
            await runScan({ force: true });
        } catch (err) {
            log(`写入失败：${err.message}`);
            alert(err.message);
        }
    }

    async function showRules() {
        try {
            const corpus = [];
            if (currentScan?.clusters) {
                for (const c of currentScan.clusters) {
                    for (const s of c.samples || []) {
                        corpus.push({ ...s, cluster: c.cluster });
                    }
                }
            }
            const data = await api('/api/train/rules-board', {
                method: 'POST',
                body: JSON.stringify({
                    corpus,
                    jaPath: jaPathEl.value.trim() || undefined,
                    zhPath: zhPathEl.value.trim() || undefined,
                }),
            });
            const rows = data.rules || [];
            if (!rows.length) {
                openDlg('规则库', `（暂无）\n${data.path || ''}`);
                return;
            }
            const wrap = document.createElement('div');
            wrap.className = 'rules-list rules-board';
            wrap.innerHTML = `
              <div class="rules-board-meta muted">语料 ${data.corpusSize || 0} 句 · 用于估算命中/误伤（有对照时更准）</div>
              ${rows.map((r) => {
                const stats = r.stats
                    ? `命中 ${r.stats.totalHits}${r.stats.risky ? ' · 误伤偏高' : (r.stats.extra ? ` · 额外 ${r.stats.extra}` : '')}`
                    : '暂无语料统计';
                const summary = r.kind === 'asr'
                    ? escapeHtml(r.fragment || `${r.from} → ${r.to}`)
                    : `${escapeHtml(r.fragment || '')}<br/><span class="muted">锚点 ${escapeHtml(r.anchor || '—')}</span>`;
                return `<div class="rule-row ${r.enabled === false ? 'disabled' : ''}" data-id="${escapeHtml(r.id)}">
          <div><b>${escapeHtml(r.title || r.id)}</b> ${r.enabled === false ? '<span class="badge">已停用</span>' : ''}
            <span class="badge soft">${escapeHtml(r.kind || 'zh')}</span></div>
          <div class="rule-meta">${summary}<br/>${r.pinFinal ? '防润色 · ' : ''}${escapeHtml(r.note || '')}<br/>${escapeHtml(stats)}</div>
          <div class="rule-actions">
            <button type="button" class="btn ghost" data-act="toggle">${r.enabled === false ? '启用' : '停用'}</button>
            <button type="button" class="btn ghost" data-act="promote">晋升片段</button>
            <button type="button" class="btn ghost" data-act="remove">删除</button>
          </div>
        </div>`;
              }).join('')}`;
            dlgMode = 'rules';
            dlgTitle.textContent = `规则库（${rows.length}）`;
            dlgBody.textContent = '';
            dlgBody.appendChild(wrap);
            dlgWrite.classList.add('hidden');
            if (typeof previewDlg.showModal === 'function') previewDlg.showModal();

            wrap.querySelectorAll('button[data-act]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const row = btn.closest('.rule-row');
                    const id = row?.dataset.id;
                    if (!id) return;
                    const act = btn.dataset.act;
                    try {
                        if (act === 'toggle') {
                            const enabled = btn.textContent === '启用';
                            await api('/api/train/toggle', {
                                method: 'POST',
                                body: JSON.stringify({ id, enabled }),
                            });
                            scanCache.clear();
                            log(`规则已${enabled ? '启用' : '停用'}：${id}`);
                            previewDlg.close();
                            showRules();
                        } else if (act === 'remove') {
                            if (!confirm('确定删除这条训练规则？')) return;
                            await api('/api/train/remove', {
                                method: 'POST',
                                body: JSON.stringify({ id }),
                            });
                            scanCache.clear();
                            log(`规则已删除：${id}`);
                            previewDlg.close();
                            showRules();
                        } else if (act === 'promote') {
                            const out = await api('/api/train/promote', {
                                method: 'POST',
                                body: JSON.stringify({ id }),
                            });
                            await navigator.clipboard.writeText(out.snippet || '');
                            log('晋升片段已复制');
                        }
                    } catch (err) {
                        log(`规则操作失败：${err.message}`);
                        alert(err.message);
                    }
                });
            });
        } catch (err) {
            log(`读取规则失败：${err.message}`);
            alert(err.message);
        }
    }

    function syncTrainKindUi() {
        const kind = trainKindEl.value;
        const asr = kind === 'asr';
        const blank = kind === 'blank';
        trainAsrRow.classList.toggle('hidden', !asr);
        trainExpectLabel.classList.toggle('hidden', asr);
        trainFragRow?.classList.toggle('hidden', asr);
        const labelText = blank ? '清空条件（中文含）\n' : '整句预览（可选）\n';
        if (trainExpectLabel.firstChild && trainExpectLabel.firstChild.nodeType === 3) {
            trainExpectLabel.firstChild.textContent = labelText;
        }
        if (blank) trainPinFinalEl.checked = true;
        refreshTrainQualityUi();
    }

    function extractTranslateText(result) {
        if (!result || typeof result !== 'object') return '';
        const cues = result.cues || result.result?.cues || result.data?.cues;
        if (Array.isArray(cues) && cues.length) {
            const c0 = cues[0];
            return String(c0?.text ?? c0?.zh ?? c0?.translation ?? c0?.dst ?? '').trim();
        }
        return String(result.text || result.translation || result.zh || '').trim();
    }

    function isSmartTranslateCapableModel(item) {
        if (!item?.id) return false;
        if (item.translateOnly) return false;
        return String(item.family || '').toLowerCase() !== 'sakura';
    }

    function escAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function selectedTranslateModelId() {
        return String(trainTranslateModelEl?.value || '').trim();
    }

    function fillTrainTranslateModelSelect(managed) {
        if (!trainTranslateModelEl) return;
        const catalog = (Array.isArray(managed?.catalog) ? managed.catalog : [])
            .filter((item) => item?.installed && isSmartTranslateCapableModel(item));
        catalog.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh'));
        const preferred = String(
            lsGet(LS.translateModelId)
            || managed?.smartTranslateModelId
            || managed?.smartTranslateModel?.id
            || managed?.activeModelId
            || '',
        ).trim();
        const opts = [];
        if (!catalog.length) {
            opts.push('<option value="">（暂无已下载的智能翻译模型）</option>');
        } else {
            for (const item of catalog) {
                const id = String(item.id || '');
                if (!id) continue;
                const bits = [];
                if (item.proScale) bits.push('Pro');
                if (item.paramBillion) bits.push(`${item.paramBillion}B`);
                const label = bits.length
                    ? `${item.name || id}（${bits.join(' · ')}）`
                    : (item.name || id);
                opts.push(`<option value="${escAttr(id)}">${escAttr(label)}</option>`);
            }
            if (preferred && !catalog.some((m) => String(m.id) === preferred)) {
                opts.push(`<option value="${escAttr(preferred)}">${escAttr(preferred)}（未下载或不可用）</option>`);
            }
        }
        trainTranslateModelEl.innerHTML = opts.join('');
        if (preferred && [...trainTranslateModelEl.options].some((o) => o.value === preferred)) {
            trainTranslateModelEl.value = preferred;
        } else if (catalog[0]?.id) {
            trainTranslateModelEl.value = catalog[0].id;
        } else {
            trainTranslateModelEl.value = '';
        }
    }

    async function refreshElectronTrainStatus() {
        if (!isElectronTrain || !electronTrainRow) return;
        electronTrainRow.classList.remove('hidden');
        try {
            const st = await transubTrain.getAdvancedStatus?.();
            const status = st?.status || st || {};
            const entitled = !!(status.entitled || st?.entitled);
            let managed = null;
            try {
                const mres = await transubTrain.getManagedLlmStatus?.();
                managed = mres?.managed || null;
            } catch (_) { /* ignore */ }
            if (managed) fillTrainTranslateModelSelect(managed);
            const modelLabel = trainTranslateModelEl?.selectedOptions?.[0]?.textContent
                || managed?.smartTranslateModelId
                || status.managedLlm?.smartTranslateModelId
                || status.managedLlm?.activeModelId
                || status.byok?.model
                || '';
            electronTrainStatus.textContent = entitled
                ? `Transub 已就绪${modelLabel ? ` · ${modelLabel}` : ''}`
                : 'Transub 内嵌（Pro/模型未就绪时翻译会失败）';
        } catch (_) {
            electronTrainStatus.textContent = 'Transub 内嵌';
            if (trainTranslateModelEl && !trainTranslateModelEl.options.length) {
                trainTranslateModelEl.innerHTML = '<option value="">（无法读取模型列表）</option>';
            }
        }
    }

    async function runTrainTranslate() {
        const hit = primaryHit();
        if (!hit || !transubTrain?.smartTranslate) return;
        const modelId = selectedTranslateModelId();
        if (!modelId) {
            alert('请先选择已下载的智能翻译模型（设置里下载通用对话模型后刷新本页）');
            return;
        }
        btnTrainTranslate.disabled = true;
        log(`正在用 Transub 智能翻译（${modelId}）…`);
        try {
            const res = await transubTrain.smartTranslate({
                cues: [{
                    index: 0,
                    startMs: 0,
                    endMs: 2000,
                    text: hit.src,
                }],
                sourceLang: 'ja',
                targetLang: 'zh',
                contentProfile: 'av_soft',
                fileName: activeCode || 'mt-train.srt',
                modelId,
            });
            if (!res?.ok) {
                throw new Error(res?.error || '智能翻译失败');
            }
            const text = extractTranslateText(res);
            if (!text) throw new Error('翻译结果为空');
            trainExpectEl.value = text;
            trainExpectEl.dataset.touched = '1';
            trainKindEl.value = 'replace';
            syncTrainKindUi();
            trainTryOut.classList.remove('hidden');
            trainTryOut.textContent = `Transub 翻译结果（${modelId}）：\n${text}\n\n（已填入期望译文，可试跑或写入）`;
            log(`翻译完成：${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`);
        } catch (err) {
            log(`翻译失败：${err.message}`);
            alert(err.message);
        } finally {
            btnTrainTranslate.disabled = selected.size === 0;
        }
    }

    async function runTrainInfer() {
        const hit = primaryHit();
        if (!hit || !transubTrain?.inferSuggest) return;
        const modelId = selectedTranslateModelId();
        btnTrainInfer.disabled = true;
        log(modelId ? `正在推理期望译文（${modelId}）…` : '正在推理期望译文…');
        try {
            const res = await transubTrain.inferSuggest({
                ja: hit.src,
                zh: hit.dst,
                ...(modelId ? { modelId } : {}),
                after: hit.after,
                issues: hit.issues || [],
                note: hit.note || '',
            });
            if (!res?.ok) {
                throw new Error(res?.error || '推理失败');
            }
            if (res.jaAnchor) {
                trainJaAnchorEl.value = res.jaAnchor;
                trainJaAnchorEl.dataset.touched = '1';
            }
            if (res.mode === 'blank') {
                trainKindEl.value = 'blank';
                if (trainZhFromEl) {
                    trainZhFromEl.value = res.zhFrom || hit.after || hit.dst || '';
                    trainZhFromEl.dataset.touched = '1';
                }
                trainExpectEl.value = res.zhFrom || hit.after || hit.dst || '';
            } else {
                trainKindEl.value = 'replace';
                trainExpectEl.value = res.expectZh || '';
                if (trainZhFromEl) {
                    trainZhFromEl.value = res.zhFrom || '';
                    trainZhFromEl.dataset.touched = res.zhFrom ? '1' : '';
                }
                if (trainZhToEl) {
                    trainZhToEl.value = res.zhTo || '';
                    trainZhToEl.dataset.touched = res.zhTo ? '1' : '';
                }
                if (!res.zhFrom && res.expectZh) {
                    syncFragFromExpect(dirtyZhForHit(hit), res.expectZh, { force: true });
                }
            }
            trainExpectEl.dataset.touched = '1';
            syncTrainKindUi();
            trainPinFinalEl.checked = true;
            trainTryOut.classList.remove('hidden');
            trainTryOut.textContent = [
                '抽片段建议：',
                `mode=${res.mode}`,
                res.zhFrom ? `规则：「${res.zhFrom}」→「${res.zhTo || (res.mode === 'blank' ? '…' : '')}」` : '',
                res.expectZh ? `预览：${res.expectZh}` : '',
                res.jaAnchor ? `锚点：${res.jaAnchor}` : '',
                res.why ? `情形：${res.why}` : '',
                res.model ? `模型：${res.model}` : '',
            ].filter(Boolean).join('\n');
            log('抽片段完成，已填入规则表单');
        } catch (err) {
            log(`推理失败：${err.message}`);
            alert(err.message);
        } finally {
            btnTrainInfer.disabled = selected.size === 0;
        }
    }

    function collectHitsForBatchModel() {
        const MAX = 12;
        if (selected.size) {
            return [...selected.values()].slice(0, MAX);
        }
        return collectHitsForAuto().slice(0, MAX);
    }

    function setBatchProgress(text, { done = false } = {}) {
        if (!batchProgress) return;
        if (!text) {
            batchProgress.classList.add('hidden');
            batchProgress.textContent = '';
            return;
        }
        batchProgress.classList.remove('hidden');
        batchProgress.textContent = text;
        if (done) batchProgress.classList.add('done');
        else batchProgress.classList.remove('done');
    }

    function syncBatchConfirmEnabled() {
        if (!btnBatchConfirm) return;
        const n = batchRows.filter((r) => {
            if (!(r.accepted && r.status === 'ok')) return false;
            if (r.mode === 'blank') return true;
            return !!(String(r.zhFrom || '').trim() || String(r.expect || '').trim());
        }).length;
        btnBatchConfirm.disabled = n === 0;
        btnBatchConfirm.textContent = n ? `确认写入（${n}）` : '确认写入';
    }

    function renderBatchRows() {
        if (!batchDlgBody) return;
        if (!batchRows.length) {
            batchDlgBody.innerHTML = '<div class="empty">没有结果</div>';
            syncBatchConfirmEnabled();
            return;
        }
        batchDlgBody.innerHTML = batchRows.map((r, i) => {
            const ok = r.status === 'ok';
            const checked = r.accepted ? 'checked' : '';
            const disabled = ok ? '' : 'disabled';
            const modeLabel = r.mode === 'blank' ? '清空' : '局部替换';
            const warn = r.wholeSentence ? ' · 整句(默认不写)' : '';
            return `<div class="auto-row ${ok ? (r.wholeSentence ? 'review' : 'ready') : 'failed'}" data-i="${i}">
  <div class="auto-row-head">
    <label>
      <input type="checkbox" data-batch-accept="${i}" ${checked} ${disabled} />
      <span>
        <b>#${escapeHtml(String(r.ji ?? '?'))}</b>
        ${r.issue ? ` · ${escapeHtml(issueLabel(r.issue))}` : ''}
        ${ok ? ` · ${escapeHtml(modeLabel)}${warn}` : ''}
        <div class="mono">${escapeHtml(r.src || '')}</div>
        <div class="auto-meta">脏译：${escapeHtml(r.dst || r.after || '')}</div>
        ${ok ? `<div class="expect-edit">
          <input type="text" data-batch-from="${i}" value="${escapeHtml(r.zhFrom || '')}" spellcheck="false" placeholder="错误片段 zhFrom" />
        </div>
        <div class="expect-edit">
          <input type="text" data-batch-to="${i}" value="${escapeHtml(r.mode === 'blank' ? '…' : (r.zhTo || ''))}" spellcheck="false" placeholder="改成 zhTo / …" />
        </div>
        <div class="expect-edit">
          <input type="text" data-batch-anchor="${i}" value="${escapeHtml(r.jaAnchor || r.src || '')}" spellcheck="false" placeholder="日文锚点" />
        </div>` : `<div class="auto-meta">失败：${escapeHtml(r.error || '未知错误')}</div>`}
      </span>
    </label>
    <span class="auto-status">${ok ? (r.wholeSentence ? '整句' : '成功') : '失败'}</span>
  </div>
</div>`;
        }).join('');

        batchDlgBody.querySelectorAll('input[data-batch-accept]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const i = Number(cb.getAttribute('data-batch-accept'));
                if (batchRows[i]) batchRows[i].accepted = cb.checked;
                syncBatchConfirmEnabled();
            });
        });
        batchDlgBody.querySelectorAll('input[data-batch-from]').forEach((inp) => {
            inp.addEventListener('input', () => {
                const i = Number(inp.getAttribute('data-batch-from'));
                if (!batchRows[i]) return;
                batchRows[i].zhFrom = inp.value;
                const dirty = String(batchRows[i].dst || batchRows[i].after || '');
                batchRows[i].wholeSentence = isLowReuseReplace(inp.value, dirty);
                batchRows[i].expect = expectFromFrag(dirty, inp.value, batchRows[i].zhTo || '');
                syncBatchConfirmEnabled();
            });
        });
        batchDlgBody.querySelectorAll('input[data-batch-to]').forEach((inp) => {
            inp.addEventListener('input', () => {
                const i = Number(inp.getAttribute('data-batch-to'));
                if (!batchRows[i]) return;
                const to = String(inp.value || '').trim();
                if (to === '…' || to === '...') {
                    batchRows[i].mode = 'blank';
                    batchRows[i].zhTo = '';
                    batchRows[i].expect = '…';
                } else {
                    batchRows[i].mode = 'replace';
                    batchRows[i].zhTo = inp.value;
                    const dirty = String(batchRows[i].dst || batchRows[i].after || '');
                    batchRows[i].expect = expectFromFrag(dirty, batchRows[i].zhFrom || '', inp.value);
                }
                syncBatchConfirmEnabled();
            });
        });
        batchDlgBody.querySelectorAll('input[data-batch-anchor]').forEach((inp) => {
            inp.addEventListener('input', () => {
                const i = Number(inp.getAttribute('data-batch-anchor'));
                if (batchRows[i]) batchRows[i].jaAnchor = inp.value;
            });
        });
        syncBatchConfirmEnabled();
    }

    async function translateOneHit(hit, modelId) {
        const res = await transubTrain.smartTranslate({
            cues: [{
                index: 0,
                startMs: 0,
                endMs: 2000,
                text: hit.src,
            }],
            sourceLang: 'ja',
            targetLang: 'zh',
            contentProfile: 'av_soft',
            fileName: activeCode || 'mt-train.srt',
            modelId,
        });
        if (!res?.ok) throw new Error(res?.error || '智能翻译失败');
        const text = extractTranslateText(res);
        if (!text) throw new Error('翻译结果为空');
        return {
            expect: text,
            mode: 'replace',
            jaAnchor: suggestJaAnchorClient(hit.src || '') || hit.src,
            zhFrom: '',
            zhTo: '',
            wholeSentence: true,
        };
    }

    async function inferOneHit(hit, modelId) {
        const res = await transubTrain.inferSuggest({
            ja: hit.src,
            zh: hit.dst,
            after: hit.after,
            issues: hit.issues || [],
            note: hit.note || '',
            ...(modelId ? { modelId } : {}),
        });
        if (!res?.ok) throw new Error(res?.error || '抽片段失败');
        if (res.mode === 'blank') {
            return {
                expect: '…',
                mode: 'blank',
                jaAnchor: res.jaAnchor || suggestJaAnchorClient(hit.src || '') || hit.src,
                zhFrom: res.zhFrom || '',
                zhTo: '',
                wholeSentence: false,
            };
        }
        const zhFrom = String(res.zhFrom || '').trim();
        const zhTo = String(res.zhTo || '').trim();
        const dirty = String(hit.dst || hit.after || '');
        const expect = String(res.expectZh || '').trim()
            || (zhFrom ? expectFromFrag(dirty, zhFrom, zhTo) : '');
        if (!expect && !zhFrom) throw new Error('未给出可复用片段');
        const sug = zhFrom
            ? { zhFrom, zhTo, wholeSentence: isLowReuseReplace(zhFrom, dirty) }
            : suggestLocalReplaceClient(dirty, expect);
        return {
            expect,
            mode: 'replace',
            jaAnchor: res.jaAnchor || suggestJaAnchorClient(hit.src || '') || hit.src,
            zhFrom: sug?.zhFrom || zhFrom,
            zhTo: sug ? sug.zhTo : zhTo,
            wholeSentence: Boolean(sug?.wholeSentence || isLowReuseReplace(sug?.zhFrom || zhFrom, dirty)),
        };
    }

    async function runBatchModel(mode) {
        if (!isElectronTrain) {
            alert('批量抽片段/翻译需在 Electron 开发模式训练台中使用');
            return;
        }
        if (mode === 'translate' && !transubTrain?.smartTranslate) {
            alert('当前环境不支持智能翻译');
            return;
        }
        if (mode === 'infer' && !transubTrain?.inferSuggest) {
            alert('当前环境不支持抽片段');
            return;
        }
        const modelId = selectedTranslateModelId();
        if (mode === 'translate' && !modelId) {
            alert('请先选择已下载的智能翻译模型');
            return;
        }
        const hits = collectHitsForBatchModel();
        if (!hits.length) {
            alert('请先勾选问题，或对照后确保有高热度待修项');
            return;
        }
        batchMode = mode;
        batchRows = hits.map((h) => ({
            ji: h.ji,
            src: h.src,
            dst: h.dst,
            after: h.after,
            issues: h.issues || [],
            issue: (h.issues || []).find((i) => HOT.has(i)) || (h.issues || [])[0] || '',
            hit: h,
            status: 'pending',
            expect: '',
            jaAnchor: h.src || '',
            mode: 'replace',
            accepted: false,
            error: '',
        }));
        if (batchDlgTitle) {
            batchDlgTitle.textContent = mode === 'translate' ? '批量整句翻译（慎写入）' : '抽规则片段结果';
        }
        if (batchDlgHelp) {
            batchDlgHelp.textContent = mode === 'translate'
                ? '整句翻译仅供对照；接近整句默认不勾选。'
                : '确认短片段后再写入；接近整句默认不勾选。';
        }
        renderBatchRows();
        setBatchProgress(`准备处理 0/${hits.length}…`);
        if (typeof batchDlg.showModal === 'function') batchDlg.showModal();

        if (btnBatchTranslate) btnBatchTranslate.disabled = true;
        if (btnBatchInfer) btnBatchInfer.disabled = true;
        let okN = 0;
        let failN = 0;
        try {
            for (let i = 0; i < hits.length; i += 1) {
                const hit = hits[i];
                setBatchProgress(`正在${mode === 'translate' ? '翻译' : '抽片段'} ${i + 1}/${hits.length} · #${hit.ji}`);
                try {
                    const out = mode === 'translate'
                        ? await translateOneHit(hit, modelId)
                        : await inferOneHit(hit, modelId);
                    const dirty = String(hit.dst || hit.after || '');
                    let zhFrom = out.zhFrom || '';
                    let zhTo = out.zhTo || '';
                    let wholeSentence = Boolean(out.wholeSentence);
                    if (!zhFrom && out.expect && out.mode !== 'blank') {
                        const sug = suggestLocalReplaceClient(dirty, out.expect);
                        zhFrom = sug?.zhFrom || '';
                        zhTo = sug?.zhTo || '';
                        wholeSentence = Boolean(sug?.wholeSentence || isLowReuseReplace(zhFrom, dirty));
                    } else if (zhFrom) {
                        wholeSentence = isLowReuseReplace(zhFrom, dirty);
                    }
                    batchRows[i] = {
                        ...batchRows[i],
                        status: 'ok',
                        expect: out.expect,
                        mode: out.mode,
                        jaAnchor: out.jaAnchor,
                        zhFrom,
                        zhTo,
                        wholeSentence,
                        accepted: out.mode === 'blank' || (!wholeSentence && !!(zhFrom || out.expect === '…')),
                        error: '',
                    };
                    okN += 1;
                } catch (err) {
                    batchRows[i] = {
                        ...batchRows[i],
                        status: 'error',
                        accepted: false,
                        error: err.message || String(err),
                    };
                    failN += 1;
                    log(`#${hit.ji} ${mode === 'translate' ? '翻译' : '推理'}失败：${err.message}`);
                }
                renderBatchRows();
            }
            setBatchProgress(`完成：成功 ${okN}，失败 ${failN}。请编辑后确认写入。`, { done: true });
            log(`批量${mode === 'translate' ? '翻译' : '推理'}完成：成功 ${okN}，失败 ${failN}`);
        } finally {
            if (btnBatchTranslate) btnBatchTranslate.disabled = false;
            if (btnBatchInfer) btnBatchInfer.disabled = false;
        }
    }

    async function confirmBatchWrite() {
        // Sync edits from DOM
        batchDlgBody?.querySelectorAll('input[data-batch-from]').forEach((inp) => {
            const i = Number(inp.getAttribute('data-batch-from'));
            if (batchRows[i]) batchRows[i].zhFrom = inp.value;
        });
        batchDlgBody?.querySelectorAll('input[data-batch-to]').forEach((inp) => {
            const i = Number(inp.getAttribute('data-batch-to'));
            if (!batchRows[i]) return;
            const to = String(inp.value || '').trim();
            if (to === '…' || to === '...') {
                batchRows[i].mode = 'blank';
                batchRows[i].zhTo = '';
                batchRows[i].expect = '…';
            } else {
                batchRows[i].mode = 'replace';
                batchRows[i].zhTo = inp.value;
            }
        });
        batchDlgBody?.querySelectorAll('input[data-batch-anchor]').forEach((inp) => {
            const i = Number(inp.getAttribute('data-batch-anchor'));
            if (batchRows[i]) batchRows[i].jaAnchor = inp.value;
        });
        for (const r of batchRows) {
            if (r.status !== 'ok' || r.mode === 'blank') continue;
            const dirty = String(r.dst || r.after || '');
            if (r.zhFrom) {
                r.expect = expectFromFrag(dirty, r.zhFrom, r.zhTo || '');
                r.wholeSentence = isLowReuseReplace(r.zhFrom, dirty);
            }
        }

        const picked = batchRows.filter((r) => {
            if (!(r.accepted && r.status === 'ok')) return false;
            if (r.mode === 'blank') return true;
            if (r.wholeSentence) return false;
            return !!(String(r.zhFrom || '').trim());
        });
        if (!picked.length) {
            alert('请至少勾选一条短片段规则（整句项已被过滤）');
            return;
        }
        if (!confirm(`将根据 ${picked.length} 条结果一次性写入全局规则。确定？`)) return;

        const healthy = await checkTrainHealth();
        if (!healthy) return;

        btnBatchConfirm.disabled = true;
        setBatchProgress(`正在写入 0/${picked.length}…`);
        let okN = 0;
        let failN = 0;
        const failNotes = [];
        try {
            for (let i = 0; i < picked.length; i += 1) {
                const r = picked[i];
                setBatchProgress(`正在写入 ${i + 1}/${picked.length} · #${r.ji}`);
                const expectRaw = String(r.expect || '').trim();
                const expect = expectRaw === '...' ? '…' : expectRaw;
                const mode = expect === '…' || r.mode === 'blank' ? 'blank' : 'replace';
                const dirty = String(r.dst || r.after || '');
                const jaAnchor = String(r.jaAnchor || r.src || '').trim();
                const zhFrom = mode === 'blank'
                    ? (String(r.zhFrom || '').trim() || dirty || expect)
                    : String(r.zhFrom || '').trim();
                const zhTo = mode === 'blank' ? '' : String(r.zhTo || '').trim();
                if (mode === 'replace' && (!zhFrom || isLowReuseReplace(zhFrom, dirty))) {
                    failN += 1;
                    failNotes.push(`#${r.ji} 整句/缺片段，已跳过`);
                    continue;
                }
                try {
                    const body = {
                        kind: 'zh',
                        mode,
                        title: activeCode || '',
                        note: (r.issues || []).join(',') || r.issue || batchMode || '',
                        ja: r.src,
                        zh: dirty,
                        expect: mode === 'blank' ? '…' : (expect || expectFromFrag(dirty, zhFrom, zhTo)),
                        zhFrom,
                        zhTo,
                        jaAnchor,
                        pinFinal: true,
                        contentProfile: 'av_soft',
                        jaPath: jaPathEl.value.trim(),
                        zhPath: zhPathEl.value.trim(),
                        asrHint: Boolean(r.hit?.asr),
                    };
                    const out = await api('/api/train/apply', {
                        method: 'POST',
                        body: JSON.stringify(body),
                    });
                    if (out?.ok === false) throw new Error(out.error || '写入失败');
                    okN += 1;
                    if (out.trial && out.trial.matchesExpect === false) {
                        failNotes.push(`#${r.ji} 已写入但试跑未完全命中`);
                    }
                } catch (err) {
                    failN += 1;
                    failNotes.push(`#${r.ji} ${err.message || err}`);
                    log(`#${r.ji} 写入失败：${err.message}`);
                }
            }
            log(`批量确认写入完成：成功 ${okN}，失败 ${failN}`);
            if (failNotes.length) log(failNotes.join('；'));
            setBatchProgress(`写入完成：成功 ${okN}，失败 ${failN}`, { done: true });
            batchDlg.close?.();
            scanCache.clear();
            await runScan({ force: true });
            if (okN > 0) {
                const runTest = confirm(`已一次性写入 ${okN} 条。是否立即跑全部测试？`);
                if (runTest) $('btnMocha')?.click();
            } else {
                alert(`没有成功写入。${failNotes[0] || ''}`);
            }
        } catch (err) {
            const e = await ensureTrainApiOrExplain(err);
            log(`批量写入失败：${e.message}`);
            alert(e.message);
            setBatchProgress(`写入失败：${e.message}`);
        } finally {
            syncBatchConfirmEnabled();
        }
    }

    function filteredSortedTitles() {
        const q = titleFilterEl.value.trim().toLowerCase();
        let list = titlesCache.slice();
        if (q) {
            list = list.filter((t) =>
                t.code.toLowerCase().includes(q)
                || t.jaName.toLowerCase().includes(q)
                || t.zhName.toLowerCase().includes(q));
        }
        if (sortLiveEl.checked) {
            list.sort((a, b) => {
                const la = batchStats.get(a.code)?.liveHitCount || 0;
                const lb = batchStats.get(b.code)?.liveHitCount || 0;
                return lb - la || b.mtime - a.mtime;
            });
        }
        return list;
    }

    function selectTitle(t, { scan = true } = {}) {
        activeCode = t.code;
        jaPathEl.value = t.jaPath;
        zhPathEl.value = t.zhPath;
        lsSet(LS.lastCode, t.code);
        renderTitles();
        if (scan) runScan({ force: false });
    }

    function renderTitles() {
        titleList.innerHTML = '';
        const list = filteredSortedTitles();
        titleCountEl.textContent = String(list.length);
        if (!list.length) {
            titleList.innerHTML = '<li class="empty">无匹配片名</li>';
            return;
        }
        for (const t of list) {
            const li = document.createElement('li');
            if (t.code === activeCode) li.classList.add('active');
            const st = batchStats.get(t.code);
            const live = st?.liveHitCount || 0;
            if (live > 0) li.classList.add('dirty');
            const liveBadge = live > 0
                ? `<span class="live-dot" title="仍有待修问题">${live}</span>`
                : (st && st.liveHitCount === 0
                    ? '<span class="live-dot" style="background:#d7ebe3;color:var(--accent)" title="重点问题已清">0</span>'
                    : '');
            li.innerHTML = `<div class="code">${escapeHtml(t.code)}${liveBadge}</div>
        <div class="meta">${new Date(t.mtime).toLocaleString()}<br/>日：${escapeHtml(t.jaName)}<br/>中：${escapeHtml(t.zhName)}</div>`;
            li.addEventListener('click', () => selectTitle(t));
            titleList.appendChild(li);
        }
    }

    function moveTitle(delta) {
        const list = filteredSortedTitles();
        if (!list.length) return;
        let idx = list.findIndex((t) => t.code === activeCode);
        if (idx < 0) idx = delta > 0 ? -1 : 0;
        idx = Math.max(0, Math.min(list.length - 1, idx + delta));
        selectTitle(list[idx]);
        const active = titleList.querySelector('li.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function renderBatchBar(batch, progress) {
        if (progress) {
            batchBar.classList.remove('hidden');
            const pct = progress.n ? Math.round((100 * progress.i) / progress.n) : 0;
            batchBar.innerHTML = `<div><b>批量对照 ${progress.i}/${progress.n}</b> · ${escapeHtml(progress.code || '…')}</div>
        <div class="prog"><i style="width:${pct}%"></i></div>`;
            return;
        }
        if (!batch || !batch.titles) {
            batchBar.classList.add('hidden');
            batchBar.innerHTML = '';
            return;
        }
        batchBar.classList.remove('hidden');
        const agg = Object.entries(batch.aggregateLive || {})
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${issueLabel(k)} ${n}`)
            .join(' · ') || '无待修重点';
        const dirty = batch.titles.filter((t) => t.liveHitCount > 0).slice(0, 10);
        const links = dirty.map((t) =>
            `<button type="button" class="linkish" data-code="${escapeHtml(t.code)}">${escapeHtml(t.code)}(${t.liveHitCount})</button>`).join(' ');
        batchBar.innerHTML = `<div><b>已对照 ${batch.count} 部</b> · ${escapeHtml(agg)}</div>
      <div style="margin-top:4px">${links || '全部干净（只有次要/已修好）'}</div>`;
        batchBar.querySelectorAll('button[data-code]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const t = titlesCache.find((x) => x.code === btn.dataset.code);
                if (t) selectTitle(t);
            });
        });
    }

    function renderChips() {
        clusterChipsEl.innerHTML = '';
        if (!currentScan) return;
        const all = document.createElement('button');
        all.type = 'button';
        all.className = `chip${activeClusterFilter ? '' : ' active'}`;
        all.textContent = '全部';
        all.addEventListener('click', () => { activeClusterFilter = ''; renderClusters(); });
        clusterChipsEl.appendChild(all);

        const chipClusters = [...(currentScan.clusters || [])].sort((a, b) => {
            const rank = (name) => (HOT.has(name) ? 0 : (isSoftCluster(name) ? 2 : 1));
            const d = rank(a.cluster) - rank(b.cluster);
            if (d) return d;
            return (b.n || 0) - (a.n || 0);
        });
        for (const c of chipClusters) {
            if (hideAlignEl.checked && isSoftCluster(c.cluster)) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `chip${isSoftCluster(c.cluster) ? ' soft-chip' : ''}${HOT.has(c.cluster) ? ' hot-chip' : ''}${activeClusterFilter === c.cluster ? ' active' : ''}`;
            btn.textContent = `${issueLabel(c.cluster)} ${c.n}`;
            btn.title = c.cluster;
            btn.addEventListener('click', () => {
                activeClusterFilter = activeClusterFilter === c.cluster ? '' : c.cluster;
                renderClusters();
            });
            clusterChipsEl.appendChild(btn);
        }
    }

    function hitMatchesSearch(hit) {
        const q = searchHitsEl.value.trim().toLowerCase();
        if (!q) return true;
        const labels = (hit.issues || []).map(issueLabel);
        return [hit.src, hit.dst, hit.after, hit.asr, hit.time, ...(hit.issues || []), ...labels]
            .join('\n')
            .toLowerCase()
            .includes(q);
    }

    function explainSampleFix(f) {
        const flags = Array.isArray(f.flags) ? f.flags : [];
        const after = String(f.after || '').trim();
        if (flags.includes('wet_sfx') || flags.includes('wet_sfx_ja')) {
            if (after === '…' || after === '...' || !after) {
                return '说明：拟声/湿声对上错对白 → 弱化为「…」（通常正确，无需训练）';
            }
            return '说明：拟声相关清洗已生效';
        }
        if (flags.includes('prompt_leak') || flags.some((x) => /leak|halluc/i.test(x))) {
            return '说明：提示词/幻觉已被清掉';
        }
        if (flags.includes('trained_remap') || flags.includes('trained_remap_final')) {
            return '说明：你写入的训练规则已命中';
        }
        return '说明：领域规则已改写本句（成功示例）';
    }

    function renderFixes() {
        const fixes = currentScan?.sampleFixes || [];
        if (!fixes.length) {
            fixesPanel.classList.add('hidden');
            return;
        }
        fixesPanel.classList.remove('hidden');
        fixesCount.textContent = String(fixes.length);
        fixesBody.textContent = fixes.map((f) => {
            const flagText = (f.flags || []).map((x) => flagLabel(x)).join(' · ') || '无';
            return [
                `#${f.ji}`,
                `日文  ${f.src}`,
                f.asr ? `纠错  ${f.asr}` : '',
                `改前  ${f.before}`,
                `改后  ${f.after}`,
                `标记  ${flagText}`,
                explainSampleFix(f),
            ].filter(Boolean).join('\n');
        }).join('\n\n');
    }

    function renderClusters() {
        clustersEl.innerHTML = '';
        renderChips();
        renderFixes();
        if (!currentScan) {
            clustersEl.innerHTML = '<div class="empty">'
                + '<p><b>还没有对照结果</b></p>'
                + '<p>1. 左侧点一部片子<br/>2. 自动对照后看待修数字<br/>3. 勾选彩色问题 → 右侧训练</p>'
                + '<p class="soft-explain">不确定时点上方「怎么用」。</p>'
                + '</div>';
            return;
        }
        const hideSoft = hideAlignEl.checked;
        let shown = 0;
        const ranked = [...(currentScan.clusters || [])].sort((a, b) => {
            const rank = (name) => (HOT.has(name) ? 0 : (isSoftCluster(name) ? 2 : 1));
            const d = rank(a.cluster) - rank(b.cluster);
            if (d) return d;
            return (b.n || 0) - (a.n || 0);
        });
        for (const c of ranked) {
            if (hideSoft && isSoftCluster(c.cluster)) continue;
            if (activeClusterFilter && c.cluster !== activeClusterFilter) continue;
            const samples = c.samples.filter(hitMatchesSearch);
            if (!samples.length) continue;
            shown += 1;
            const details = document.createElement('details');
            details.className = `cluster${isSoftCluster(c.cluster) ? ' soft' : ''}${HOT.has(c.cluster) ? ' hot-cluster' : ''}`;
            details.open = HOT.has(c.cluster) || Boolean(activeClusterFilter) || Boolean(searchHitsEl.value.trim());
            const summary = document.createElement('summary');
            let clusterTip = '';
            if (c.cluster === 'align_suspect') {
                clusterTip = '<span class="soft-explain">— 对齐问题，勿训练</span>';
            } else if (c.cluster === 'moan_expand') {
                clusterTip = '<span class="soft-explain">— 次要，可先忽略</span>';
            } else if (String(c.cluster).startsWith('fixed:')) {
                clusterTip = '<span class="soft-explain">— 已修好，参考用</span>';
            } else if (HOT.has(c.cluster)) {
                clusterTip = '<span class="soft-explain">— 建议优先训练</span>';
            }
            summary.innerHTML = `<span title="${escapeHtml(c.cluster)}">${escapeHtml(issueLabel(c.cluster))}</span>`
                + `<span class="badge">${samples.length}${samples.length !== c.n ? `/${c.n}` : ''}</span>${clusterTip}`;
            details.appendChild(summary);

            const table = document.createElement('table');
            table.className = 'hits';
            table.innerHTML = `<thead><tr>
        <th></th><th>#</th><th>时间</th><th>日文</th><th>人工中文</th><th>规则清洗后</th><th>问题</th>
      </tr></thead>`;
            const tbody = document.createElement('tbody');
            for (const hit of samples) {
                const tr = document.createElement('tr');
                const key = hitKey(hit);
                const checked = selected.has(key) ? 'checked' : '';
                const issueHtml = (hit.issues || []).map((i) =>
                    `<span class="issue${HOT.has(i) || (!isSoftCluster(i) && !String(i).startsWith('fixed:')) ? ' hot' : ''}" title="${escapeHtml(i)}">${escapeHtml(issueLabel(i))}</span>`).join('');
                const afterHtml = hit.changed
                    ? `<span class="diff-del">${escapeHtml(hit.dst)}</span><br/><span class="diff-add">${escapeHtml(hit.after)}</span>`
                    : escapeHtml(hit.after);
                tr.innerHTML = `
          <td><input type="checkbox" ${checked} /></td>
          <td>${hit.ji}</td>
          <td class="hit-time">${escapeHtml(hit.time || '')}${hit.d != null ? `<div>时差 ${hit.d}ms</div>` : ''}</td>
          <td class="mono">${escapeHtml(hit.src)}${hit.asr ? `<div class="flags">纠错→ ${escapeHtml(hit.asr)}</div>` : ''}</td>
          <td class="mono">${escapeHtml(hit.dst)}</td>
          <td class="mono">${afterHtml}
            <div class="flags">${escapeHtml((hit.flags || []).join(', '))}${hit.changed ? ' · 已改' : ''}</div>
          </td>
          <td><div class="issues">${issueHtml}</div></td>`;
                const cb = tr.querySelector('input[type=checkbox]');
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        selected.set(key, {
                            ...hit,
                            title: activeCode || c.cluster,
                            note: (hit.issues || []).join(','),
                        });
                    } else selected.delete(key);
                    updatePoisonBtn();
                });
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            details.appendChild(table);
            clustersEl.appendChild(details);
        }
        if (!shown) {
            const live = currentScan.liveHitCount || 0;
            clustersEl.innerHTML = live === 0
                ? '<div class="empty"><p><b>重点问题已清</b></p>'
                    + '<p>没有需要训练的待修项。若仍看到「规则已改好的样例」，那只是成功演示。</p>'
                    + '<p class="soft-explain">想检查对齐/已修好：取消勾选「只看待修」。</p></div>'
                : '<div class="empty">当前筛选下没有问题（试试清空搜索或切换问题标签）</div>';
        }
    }

    function applyScanResult(data, { fromCache = false } = {}) {
        currentScan = data;
        const top = Object.entries(data.summary?.liveClusterCounts || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([k, n]) => `${issueLabel(k)} ${n}`)
            .join(' · ');
        const liveN = data.liveHitCount || 0;
        summaryEl.textContent =
            `日文 ${data.jaCount} 条 / 中文 ${data.zhCount} 条 / 对齐 ${data.aligned} / 规则改写 ${data.changed}`
            + ` / 听写纠错 ${data.asrChanged || 0} / 待修 ${liveN}`
            + (top ? ` | ${top}` : ' | 重点已清（可不用训练）')
            + (fromCache ? ' · 缓存' : (data.reloaded ? ' · 已重载规则' : ''));
        summaryEl.title = liveN > 0
            ? '待修 = 建议处理的领域问题。勾选后到右侧训练。'
            : '待修为 0：清洗侧重点已清。字幕仍不满意时，优先换翻译模型或改源字幕，而不是继续堆规则。';
        if (activeCode) {
            batchStats.set(activeCode, {
                liveHitCount: data.liveHitCount || 0,
                live: data.summary?.liveClusterCounts || {},
            });
            renderTitles();
        }
        renderClusters();
    }

    async function loadTitles() {
        // Always fetch a broad pool; titleFilter filters client-side.
        const data = await api('/api/titles?limit=80');
        $('roots').textContent =
            `日文目录：${data.jaRoot}\n中文目录：${data.zhRoot}`
            + `\n已配对 ${data.totalPaired} · 列表 ${data.count}`
            + (data.unpairedJa ? ` · 缺中文 ${data.unpairedJa}` : '');
        if (data.tdp?.next) tdpVersionEl.value = data.tdp.next;
        titlesCache = data.titles || [];
        renderTitles();
        log(`已加载 ${data.count}/${data.totalPaired} 部成对字幕`
            + (data.unpairedJa ? `（缺中文 ${data.unpairedJa} 部）` : ''));

        const last = lsGet(LS.lastCode, '');
        if (last && !activeCode) {
            const t = titlesCache.find((x) => x.code === last);
            if (t) {
                activeCode = t.code;
                jaPathEl.value = t.jaPath;
                zhPathEl.value = t.zhPath;
                renderTitles();
            }
        }
    }

    async function runScan({ force = false } = {}) {
        const jaPath = jaPathEl.value.trim();
        const zhPath = zhPathEl.value.trim();
        if (!jaPath || !zhPath) {
            alert('请填写日文 / 中文字幕路径');
            return;
        }
        const key = scanKey(jaPath, zhPath);
        if (!force && useCacheEl.checked && scanCache.has(key)) {
            selected.clear();
            activeClusterFilter = '';
            updatePoisonBtn();
            applyScanResult(scanCache.get(key), { fromCache: true });
            log(`使用上次结果：${pathBasename(jaPath)}`);
            return;
        }
        summaryEl.textContent = force ? '重新对照中…' : '对照中（正在重载规则）…';
        clustersEl.innerHTML = '<div class="empty">对照中…</div>';
        selected.clear();
        activeClusterFilter = '';
        updatePoisonBtn();
        try {
            const data = await api('/api/scan', {
                method: 'POST',
                body: JSON.stringify({ jaPath, zhPath, reload: true }),
            });
            scanCache.set(key, data);
            applyScanResult(data);
            log(`对照完成：${pathBasename(jaPath)}（待修 ${data.liveHitCount || 0}）`);
        } catch (err) {
            summaryEl.textContent = '对照失败';
            clustersEl.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
            log(`对照失败：${err.message}`);
        }
    }

    async function runBatch() {
        const limit = Number(batchLimitEl.value) || 12;
        lsSet(LS.batchLimit, String(limit));
        summaryEl.textContent = `批量对照 0/${limit}…`;
        log(`开始批量对照最近 ${limit} 部…`);
        const rows = [];
        const aggregate = {};
        try {
            const done = await streamPost('/api/scan-batch', {
                limit,
                reload: true,
                stream: true,
                q: titleFilterEl.value.trim() || undefined,
            }, {
                progress: (p) => {
                    renderBatchBar(null, p);
                    summaryEl.textContent = `批量对照 ${p.i}/${p.n} · ${p.code}`;
                },
                title: (row) => {
                    if (row.error) {
                        log(`对照失败 ${row.code}: ${row.error}`);
                        return;
                    }
                    rows.push(row);
                    batchStats.set(row.code, row);
                    for (const [k, n] of Object.entries(row.live || {})) {
                        aggregate[k] = (aggregate[k] || 0) + n;
                    }
                    renderTitles();
                },
            });
            const batch = done || {
                count: rows.length,
                aggregateLive: aggregate,
                titles: rows,
            };
            batchStats = new Map((batch.titles || rows).map((t) => [t.code, t]));
            renderTitles();
            renderBatchBar(batch);
            const dirty = (batch.titles || []).filter((t) => t.liveHitCount > 0).length;
            summaryEl.textContent = `已对照 ${batch.count} 部 · ${dirty} 部仍有待修`;
            log(`批量完成：${dirty}/${batch.count} 部仍有待修`);
            if (!sortLiveEl.checked && dirty > 0) {
                sortLiveEl.checked = true;
                lsSet(LS.sortLive, '1');
                renderTitles();
            }
        } catch (err) {
            log(`批量对照失败：${err.message}`);
            alert(err.message);
        }
    }

    function openDlg(title, body, { mode = 'text', showWrite = false } = {}) {
        dlgMode = mode;
        dlgTitle.textContent = title;
        dlgBody.textContent = body;
        dlgWrite.classList.toggle('hidden', !showWrite);
        dlgWrite.textContent = '写入文件';
        if (typeof previewDlg.showModal === 'function') previewDlg.showModal();
        else alert(String(body).slice(0, 2000));
    }

    function collectHitsForAuto() {
        if (!currentScan) return [];
        const out = [];
        for (const c of currentScan.clusters || []) {
            if (isSoftCluster(c.cluster)) continue;
            for (const hit of c.samples || []) {
                out.push({ ...hit, title: activeCode || hit.title || '' });
            }
        }
        // Prefer currently selected hot hits when user has a selection
        if (selected.size) {
            const sel = [...selected.values()].filter((h) =>
                (h.issues || []).some((i) => HOT.has(i)));
            if (sel.length) return sel;
        }
        return out;
    }

    function autoStatusLabel(status, confidence) {
        if (confidence?.label) return confidence.label;
        return ({
            ready: '可直接写',
            review: '建议改',
            failed: '别写·试跑未过',
            skipped: '已跳过',
            needs_expect: '缺期望',
            error: '出错',
            duplicate: '重复',
            exists: '已学过',
        })[status] || status;
    }

    function filteredAutoProposals() {
        if (autoFilter === 'all') return autoProposals.map((p, i) => ({ p, i }));
        if (autoFilter === 'ready') {
            return autoProposals
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.confidence?.level === 'auto' || p.status === 'ready');
        }
        // actionable: hide skip/dup/exists by default
        return autoProposals
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => !['skipped', 'duplicate', 'exists'].includes(p.status));
    }

    function syncAutoApplyEnabled() {
        if (!btnAutoApply) return;
        const n = autoProposals.filter((p) => p.accepted && (
            p.confidence?.level === 'auto'
            || p.status === 'ready'
            || ((p.status === 'review' || p.confidence?.level === 'review') && p.force)
        )).length;
        btnAutoApply.disabled = n === 0;
        btnAutoApply.textContent = n ? `写入勾选（${n}）` : '写入勾选';
    }

    function adoptProposalToForm(p) {
        if (!p) return;
        const hit = {
            ji: p.ji,
            src: p.src,
            dst: p.dst,
            after: p.after,
            issues: p.issues || [],
            title: activeCode || '',
            note: (p.issues || []).join(','),
        };
        selected.clear();
        selected.set(hitKey(hit), hit);
        updatePoisonBtn();
        renderClusters();
        if (p.payload?.mode === 'blank') trainKindEl.value = 'blank';
        else trainKindEl.value = 'replace';
        syncTrainKindUi();
        if (p.payload?.jaAnchor) {
            trainJaAnchorEl.value = p.payload.jaAnchor;
            trainJaAnchorEl.dataset.touched = '1';
        }
        if (p.payload?.expect != null) {
            trainExpectEl.value = p.payload.expect;
            trainExpectEl.dataset.touched = '1';
        }
        if (trainZhFromEl && p.payload?.zhFrom != null) {
            trainZhFromEl.value = p.payload.zhFrom;
            trainZhFromEl.dataset.touched = '1';
        }
        if (trainZhToEl && p.payload?.zhTo != null) {
            trainZhToEl.value = p.payload.zhTo;
            trainZhToEl.dataset.touched = '1';
        }
        if (p.payload?.pinFinal != null) {
            trainPinFinalEl.checked = !!p.payload.pinFinal;
            trainPinFinalEl.dataset.touched = '1';
        }
        renderTrainCoach(hit);
        refreshTrainQualityUi();
        log(`已将 #${p.ji} 填入右侧训练表单`);
        autoDlg.close?.();
    }

    function renderAutoProposals() {
        if (!autoDlgBody) return;
        const rows = filteredAutoProposals();
        if (!autoProposals.length) {
            autoDlgBody.innerHTML = '<div class="empty">没有生成候选。请先对照一部片子，并确保有高热度待修问题。</div>';
            syncAutoApplyEnabled();
            return;
        }
        if (!rows.length) {
            autoDlgBody.innerHTML = '<div class="empty">当前筛选下没有条目，可点「全部」查看跳过项。</div>';
            syncAutoApplyEnabled();
            return;
        }
        autoDlgBody.innerHTML = rows.map(({ p, i }) => {
            const conf = p.confidence;
            const canAccept = conf?.level === 'auto' || conf?.level === 'review'
                || p.status === 'ready' || p.status === 'review';
            const checked = p.accepted ? 'checked' : '';
            const disabled = canAccept ? '' : 'disabled';
            const rowClass = conf?.level === 'auto' ? 'ready'
                : (conf?.level === 'review' || p.status === 'review' ? 'review'
                    : (p.status === 'failed' || conf?.level === 'reject' ? 'failed' : p.status));
            const sug = p.trial?.suggestion || p.payload;
            const local = sug?.zhFrom != null
                ? `${sug.zhFrom} → ${sug.zhTo || (p.payload?.mode === 'blank' ? '…' : '')}`
                : (p.payload ? `${p.payload.zhFrom || ''} → ${p.payload.zhTo || '…'}` : '');
            const finalLine = p.trial?.final != null ? `试跑：${p.trial.final}` : '';
            const confLine = conf
                ? `置信度 ${conf.score ?? '—'} · ${(conf.reasons || []).slice(0, 3).join('；')}`
                : '';
            const col = p.collateral;
            const colLine = col
                ? `误伤预估：命中 ${col.totalHits}（目标 ${col.intended} / 额外 ${col.extra}）`
                : '';
            const mergeLine = p.mergeSize > 1
                ? `同型合并 ×${p.mergeSize}${p.jis ? `（#${(p.jis || []).join(', #')}）` : ''}`
                : '';
            const warn = [...(p.trial?.warnings || []), ...(p.quality?.warnings || [])].slice(0, 2).join('；');
            const forceBox = (conf?.level === 'review' || p.status === 'review' || p.forceRequired)
                ? `<label class="chk tight"><input type="checkbox" data-force="${i}" ${p.force ? 'checked' : ''}/> 仍要写入</label>`
                : '';
            const expectVal = escapeHtml(p.payload?.expect || p.expectDraft || '');
            const showEdit = ['failed', 'needs_expect', 'review', 'ready'].includes(p.status)
                || conf?.level === 'review' || conf?.level === 'auto';
            const editBlock = showEdit
                ? `<div class="expect-edit">
                    <input type="text" data-expect="${i}" value="${expectVal}" spellcheck="false" placeholder="期望译文（可改后点重试）" />
                    <button type="button" class="btn ghost" data-retry="${i}">重试</button>
                   </div>`
                : '';
            const actions = `<div class="auto-row-actions">
                <button type="button" class="btn ghost" data-adopt="${i}">填入右侧</button>
              </div>`;
            return `<div class="auto-row ${escapeHtml(rowClass)}" data-i="${i}">
  <div class="auto-row-head">
    <label>
      <input type="checkbox" data-accept="${i}" ${checked} ${disabled} />
      <span><b>#${escapeHtml(String(p.ji ?? '?'))}</b>
        ${p.issue ? ` · ${escapeHtml(issueLabel(p.issue))}` : ''}
        ${p.source ? ` · ${escapeHtml(p.source === 'heuristic' ? '启发式' : '模型/用户')}` : ''}
        <div class="mono">${escapeHtml(p.src || '')}</div>
        <div class="auto-meta">${escapeHtml(p.reason || '')}${local ? ` · 局部 ${escapeHtml(local)}` : ''}</div>
        ${finalLine ? `<div class="auto-meta">${escapeHtml(finalLine)}</div>` : ''}
        ${confLine ? `<div class="auto-meta">${escapeHtml(confLine)}</div>` : ''}
        ${colLine ? `<div class="auto-meta">${escapeHtml(colLine)}</div>` : ''}
        ${mergeLine ? `<div class="auto-meta">${escapeHtml(mergeLine)}</div>` : ''}
        ${warn ? `<div class="auto-meta">注意：${escapeHtml(warn)}</div>` : ''}
        ${forceBox}
        ${editBlock}
        ${actions}
      </span>
    </label>
    <span class="auto-status">${escapeHtml(autoStatusLabel(p.status, conf))}</span>
  </div>
</div>`;
        }).join('');

        autoDlgBody.querySelectorAll('input[data-accept]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const i = Number(cb.getAttribute('data-accept'));
                if (autoProposals[i]) autoProposals[i].accepted = cb.checked;
                syncAutoApplyEnabled();
            });
        });
        autoDlgBody.querySelectorAll('input[data-force]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const i = Number(cb.getAttribute('data-force'));
                if (autoProposals[i]) {
                    autoProposals[i].force = cb.checked;
                    if (cb.checked) autoProposals[i].accepted = true;
                }
                const acceptCb = autoDlgBody.querySelector(`input[data-accept="${i}"]`);
                if (acceptCb && cb.checked) acceptCb.checked = true;
                syncAutoApplyEnabled();
            });
        });
        autoDlgBody.querySelectorAll('button[data-retry]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.getAttribute('data-retry'));
                const p = autoProposals[i];
                const input = autoDlgBody.querySelector(`input[data-expect="${i}"]`);
                const expect = String(input?.value || '').trim();
                if (!p || !expect) {
                    alert('请填写期望译文');
                    return;
                }
                btn.disabled = true;
                try {
                    await runAutoPropose({
                        expects: [{ ji: p.ji, expect }],
                        mergeJi: p.ji,
                        keepOpen: true,
                    });
                } finally {
                    btn.disabled = false;
                }
            });
        });
        autoDlgBody.querySelectorAll('button[data-adopt]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.getAttribute('data-adopt'));
                adoptProposalToForm(autoProposals[i]);
            });
        });
        syncAutoApplyEnabled();
    }

    async function checkTrainHealth() {
        if (!serverBanner) return true;
        try {
            const h = await api('/api/health');
            if (!h?.features?.autoPropose || !h?.features?.wizard) {
                serverBanner.classList.remove('hidden', 'ok');
                serverBanner.innerHTML = '训练台服务版本过旧，学习向导/自动建议不可用。请关闭窗口重开，或运行 <code>npm run train:mt:restart</code> 后刷新。';
                return false;
            }
            serverBanner.classList.add('hidden');
            return true;
        } catch (_) {
            serverBanner.classList.remove('hidden', 'ok');
            serverBanner.textContent = '无法连接训练台服务（8787）。请先启动 npm run train:mt 或从 Electron「更多」打开训练台。';
            return false;
        }
    }

    async function runAutoPropose({ expects, mergeJi, keepOpen, quiet } = {}) {
        if (!currentScan) {
            alert('请先对照一部片子');
            return;
        }
        const healthy = await checkTrainHealth();
        if (!healthy) return;

        const hits = collectHitsForAuto();
        if (!hits.length) {
            alert('当前没有可建议的高热度待修问题（可取消「只看待修」检查，或换一部片子）');
            return;
        }
        if (btnAutoPropose) btnAutoPropose.disabled = true;
        if (btnAutoSmart) btnAutoSmart.disabled = true;
        if (!quiet) log(`自动建议：分析 ${hits.length} 条…`);
        try {
            const out = await api('/api/train/auto-propose', {
                method: 'POST',
                body: JSON.stringify({
                    hits,
                    title: activeCode || '',
                    max: 16,
                    expects: expects || undefined,
                    pinFinal: true,
                    jaPath: jaPathEl.value.trim(),
                    zhPath: zhPathEl.value.trim(),
                    corpus: hits,
                }),
            });
            const next = Array.isArray(out.proposals) ? out.proposals : [];
            if (mergeJi != null) {
                const refreshed = next.filter((p) => String(p.ji) === String(mergeJi)
                    || (Array.isArray(p.jis) && p.jis.map(String).includes(String(mergeJi))));
                const others = autoProposals.filter((p) => String(p.ji) !== String(mergeJi)
                    && !(Array.isArray(p.jis) && p.jis.map(String).includes(String(mergeJi))));
                autoProposals = [...refreshed, ...others];
            } else {
                autoProposals = next;
            }
            const conf = out.confidence || {};
            if (autoDlgTitle) {
                autoDlgTitle.textContent = `自动训练建议 · 可直接写 ${conf.auto ?? out.ready ?? 0}`
                    + ` / 建议改 ${conf.review ?? out.review ?? 0}`
                    + ` / 别写 ${conf.reject ?? out.failed ?? 0}`
                    + (out.mergeCount ? ` / 合并 ${out.mergeCount}` : '');
            }
            if (autoDlgHelp) {
                autoDlgHelp.textContent = out.hint
                    || '默认只勾「可直接写」；建议改需勾选并点「仍要写入」。';
            }
            if (btnAutoInferMissing) {
                const need = autoProposals.some((p) => p.status === 'needs_expect');
                btnAutoInferMissing.classList.toggle('hidden', !(isElectronTrain && need));
            }
            renderAutoProposals();
            if (!keepOpen && typeof autoDlg.showModal === 'function') autoDlg.showModal();
            if (!quiet) {
                log(`自动建议完成：可直接写 ${conf.auto ?? out.ready ?? 0}，建议改 ${conf.review ?? 0}`
                    + (out.mergeCount ? `，同型合并 ${out.mergeCount}` : ''));
            }
            return out;
        } catch (err) {
            const e = await ensureTrainApiOrExplain(err);
            log(`自动建议失败：${e.message}`);
            alert(e.message);
            return null;
        } finally {
            if (btnAutoPropose) btnAutoPropose.disabled = false;
            if (btnAutoSmart) btnAutoSmart.disabled = false;
        }
    }

    async function runAutoInferMissing() {
        if (!transubTrain?.inferSuggest) {
            alert('需要在 Electron 开发模式训练台内使用模型补期望');
            return;
        }
        const missing = autoProposals.filter((p) => p.status === 'needs_expect');
        if (!missing.length) {
            alert('没有缺期望的条目');
            return;
        }
        if (btnAutoInferMissing) btnAutoInferMissing.disabled = true;
        if (btnAutoSmart) btnAutoSmart.disabled = true;
        const expects = [];
        log(`模型补期望：${missing.length} 条…`);
        try {
            const modelId = selectedTranslateModelId();
            for (const p of missing.slice(0, 8)) {
                try {
                    const res = await transubTrain.inferSuggest({
                        ja: p.src,
                        zh: p.dst || p.after,
                        after: p.after,
                        issues: p.issues || [],
                        ...(modelId ? { modelId } : {}),
                    });
                    if (res?.ok && (res.expectZh || res.zhFrom || res.mode === 'blank')) {
                        expects.push({
                            ji: p.ji,
                            expect: res.mode === 'blank' ? '…' : (res.expectZh || ''),
                            mode: res.mode === 'blank' ? 'blank' : 'replace',
                            zhFrom: res.zhFrom || '',
                            zhTo: res.zhTo || '',
                            jaAnchor: res.jaAnchor || '',
                        });
                        log(`#${p.ji} 抽片段：${res.mode === 'blank' ? '…' : ((res.zhFrom || '') + '→' + (res.zhTo || res.expectZh || ''))}`);
                    }
                } catch (err) {
                    log(`#${p.ji} 推理失败：${err.message}`);
                }
            }
            if (!expects.length) {
                alert('模型未能生成可用期望');
                return;
            }
            await runAutoPropose({ expects, keepOpen: true });
        } finally {
            if (btnAutoInferMissing) btnAutoInferMissing.disabled = false;
            if (btnAutoSmart) btnAutoSmart.disabled = false;
        }
    }

    async function runAutoSmart() {
        const out = await runAutoPropose({ quiet: false });
        if (!out) return;
        if (out.needsExpect > 0 && isElectronTrain && transubTrain?.inferSuggest) {
            await runAutoInferMissing();
        }
    }

    async function runAutoApply() {
        const picked = autoProposals.filter((p) => p.accepted && (
            p.confidence?.level === 'auto'
            || p.status === 'ready'
            || ((p.status === 'review' || p.confidence?.level === 'review') && p.force)
        ));
        if (!picked.length) {
            alert('请先勾选就绪（或强制复核）的项');
            return;
        }
        if (!confirm(`将写入 ${picked.length} 条规则（全局生效）。确定？`)) return;
        btnAutoApply.disabled = true;
        try {
            const out = await api('/api/train/auto-apply', {
                method: 'POST',
                body: JSON.stringify({ proposals: picked, onlyReady: false }),
            });
            log(`自动写入完成：成功 ${out.applied}，拒绝 ${out.rejected}`);
            if (out.rejectedItems?.length) {
                log(`拒绝原因：${out.rejectedItems.map((x) => `#${x.ji} ${x.reason}`).join('；')}`);
            }
            autoDlg.close?.();
            scanCache.clear();
            await runScan({ force: true });
            if (out.applied > 0) {
                const runTest = confirm(`已写入 ${out.applied} 条。是否立即跑全部测试防回归？`);
                if (runTest) $('btnMocha')?.click();
            }
        } catch (err) {
            const e = await ensureTrainApiOrExplain(err);
            log(`自动写入失败：${e.message}`);
            alert(e.message);
        } finally {
            syncAutoApplyEnabled();
        }
    }

    async function previewPoison() {
        const hits = [...selected.values()];
        pendingPoisonHits = hits;
        try {
            const out = await api('/api/poison', {
                method: 'POST',
                body: JSON.stringify({
                    hits,
                    suiteName: `训练台 ${activeCode || '草稿'}`,
                    dryRun: true,
                }),
            });
            openDlg(`用例预览（${out.count} 条）`, out.body, { mode: 'poison-preview', showWrite: true });
        } catch (err) {
            log(`预览失败：${err.message}`);
            alert(err.message);
        }
    }

    async function exportPoison(hits) {
        const list = hits || [...selected.values()];
        try {
            const out = await api('/api/poison', {
                method: 'POST',
                body: JSON.stringify({
                    hits: list,
                    suiteName: `训练台 ${activeCode || '草稿'}`,
                }),
            });
            log(`用例草稿已保存 → ${out.file}（${out.count} 条）`);
            openDlg('已写入草稿', `${out.file}\n\n${out.body}`, { mode: 'draft', showWrite: false });
        } catch (err) {
            log(`导出失败：${err.message}`);
            alert(err.message);
        }
    }

    async function copySelectedJson() {
        const hits = [...selected.values()];
        try {
            await navigator.clipboard.writeText(JSON.stringify(hits, null, 2));
            log(`已复制 ${hits.length} 条数据到剪贴板`);
        } catch (err) {
            log(`复制失败：${err.message}`);
        }
    }

    async function copySelectedMocha() {
        const hits = [...selected.values()];
        try {
            const out = await api('/api/poison', {
                method: 'POST',
                body: JSON.stringify({
                    hits,
                    suiteName: `训练台 ${activeCode || '草稿'}`,
                    dryRun: true,
                }),
            });
            await navigator.clipboard.writeText(out.body);
            log(`已复制测试代码（${out.count} 条）`);
        } catch (err) {
            log(`复制失败：${err.message}`);
        }
    }

    async function showDrafts() {
        try {
            const data = await api('/api/drafts');
            if (!data.drafts?.length) {
                openDlg('历史草稿', `（暂无）\n${data.dir}`);
                return;
            }
            const lines = data.drafts.map((d, i) =>
                `${i + 1}. ${d.name}  ${new Date(d.mtime).toLocaleString()}  ${d.bytes}B`).join('\n');
            openDlg('最近草稿', `${data.dir}\n\n${lines}`);
            dlgWrite.textContent = '打开最新';
            dlgWrite.classList.remove('hidden');
            dlgMode = 'drafts-list';
            pendingPoisonHits = data.drafts;
        } catch (err) {
            log(`读取草稿失败：${err.message}`);
        }
    }

    async function openLatestDraft() {
        const drafts = pendingPoisonHits;
        if (!Array.isArray(drafts) || !drafts[0]?.name) return;
        try {
            const d = await api(`/api/draft?name=${encodeURIComponent(drafts[0].name)}`);
            openDlg(d.name, d.body, { mode: 'draft', showWrite: false });
        } catch (err) {
            log(`打开草稿失败：${err.message}`);
        }
    }

    async function runMocha() {
        clearLog();
        log('开始跑全部测试…');
        try {
            const done = await streamPost('/api/mocha', {}, { log });
            log(done?.ok ? '测试全部通过' : `测试结束，退出码 ${done?.code}`);
        } catch (err) {
            log(`测试失败：${err.message}`);
        }
    }

    async function runTdp() {
        clearLog();
        const version = tdpVersionEl.value.trim();
        const notes = tdpNotesEl.value.trim();
        log(`签发术语包 ${version}…`);
        try {
            const done = await streamPost('/api/tdp', { version, notes }, { log });
            log(done?.ok ? `术语包 ${version} 已签发` : `术语包签发结束，退出码 ${done?.code}`);
            const suggest = await api('/api/tdp-suggest');
            if (suggest.next) tdpVersionEl.value = suggest.next;
        } catch (err) {
            log(`术语包签发失败：${err.message}`);
        }
    }

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    // prefs
    hideAlignEl.checked = lsGet(LS.hideSoft, '1') !== '0';
    useCacheEl.checked = lsGet(LS.useCache, '1') !== '0';
    sortLiveEl.checked = lsGet(LS.sortLive, '0') === '1';
    titleFilterEl.value = lsGet(LS.titleFilter, '');
    const bl = lsGet(LS.batchLimit, '12');
    if ([...batchLimitEl.options].some((o) => o.value === bl)) batchLimitEl.value = bl;

    $('btnRefresh').addEventListener('click', () => loadTitles().catch((e) => log(e.message)));
    $('btnBatch').addEventListener('click', () => runBatch());
    $('btnScan').addEventListener('click', () => runScan({ force: true }));
    $('btnReload').addEventListener('click', async () => {
        try {
            const r = await api('/api/reload', { method: 'POST', body: '{}' });
            scanCache.clear();
            log(`清洗规则已重新加载 ${r.reloadedAt}（对照缓存已清空）`);
        } catch (err) {
            log(`重载规则失败：${err.message}`);
        }
    });
    hideAlignEl.addEventListener('change', () => {
        lsSet(LS.hideSoft, hideAlignEl.checked ? '1' : '0');
        renderClusters();
    });
    useCacheEl.addEventListener('change', () => {
        lsSet(LS.useCache, useCacheEl.checked ? '1' : '0');
    });
    sortLiveEl.addEventListener('change', () => {
        lsSet(LS.sortLive, sortLiveEl.checked ? '1' : '0');
        renderTitles();
    });
    titleFilterEl.addEventListener('input', () => {
        lsSet(LS.titleFilter, titleFilterEl.value);
        renderTitles();
    });
    batchLimitEl.addEventListener('change', () => lsSet(LS.batchLimit, batchLimitEl.value));
    searchHitsEl.addEventListener('input', () => renderClusters());
    btnPoison.addEventListener('click', () => exportPoison());
    btnPreview.addEventListener('click', () => previewPoison());
    btnCopyJson.addEventListener('click', () => copySelectedJson());
    btnCopyMocha.addEventListener('click', () => copySelectedMocha());
    $('btnDrafts').addEventListener('click', () => showDrafts());
    $('btnRules').addEventListener('click', () => showRules());
    btnAutoPropose?.addEventListener('click', () => runAutoPropose());
    btnAutoSmart?.addEventListener('click', () => runAutoSmart());
    if (btnAutoSmart && isElectronTrain) btnAutoSmart.classList.remove('hidden');
    autoFilters?.querySelectorAll('[data-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
            autoFilter = btn.getAttribute('data-filter') || 'actionable';
            autoFilters.querySelectorAll('[data-filter]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            renderAutoProposals();
        });
    });
    btnAutoSelectReady?.addEventListener('click', () => {
        for (const p of autoProposals) {
            p.accepted = p.confidence?.level === 'auto' || p.status === 'ready';
            if (p.confidence?.level !== 'review' && p.status !== 'review') p.force = false;
        }
        renderAutoProposals();
    });
    btnAutoInferMissing?.addEventListener('click', () => runAutoInferMissing());
    btnAutoApply?.addEventListener('click', () => runAutoApply());
    void checkTrainHealth();
    $('btnMocha').addEventListener('click', () => runMocha());
    $('btnTdp').addEventListener('click', () => runTdp());
    btnTrainTry.addEventListener('click', () => runTrainTry());
    btnTrainApply.addEventListener('click', () => runTrainApply());
    btnTrainTranslate?.addEventListener('click', () => runTrainTranslate());
    btnTrainInfer?.addEventListener('click', () => runTrainInfer());
    btnBatchTranslate?.addEventListener('click', () => runBatchModel('translate'));
    btnBatchInfer?.addEventListener('click', () => runBatchModel('infer'));
    btnBatchSelectAll?.addEventListener('click', () => {
        for (const r of batchRows) {
            r.accepted = r.status === 'ok'
                && (r.mode === 'blank' || (!r.wholeSentence && !!String(r.zhFrom || r.expect || '').trim()));
        }
        renderBatchRows();
    });
    btnBatchConfirm?.addEventListener('click', () => confirmBatchWrite());
    trainTranslateModelEl?.addEventListener('change', () => {
        const id = selectedTranslateModelId();
        if (id) lsSet(LS.translateModelId, id);
        const label = trainTranslateModelEl.selectedOptions?.[0]?.textContent || id;
        if (electronTrainStatus && label) {
            const base = electronTrainStatus.textContent.replace(/\s·\s.*$/, '') || 'Transub 已就绪';
            electronTrainStatus.textContent = `${base} · ${label}`;
        }
    });
    trainKindEl.addEventListener('change', () => {
        trainKindEl.dataset.autoAsr = '1';
        syncTrainKindUi();
        renderTrainCoach(primaryHit());
    });
    btnGuide?.addEventListener('click', () => {
        if (!guidePanel) return;
        guidePanel.open = true;
        guidePanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    // First visit: keep guide open; later sessions stay collapsed if user closed it.
    if (guidePanel) {
        const seen = lsGet('mtTrain.guideSeen', '');
        guidePanel.open = seen !== '1';
        guidePanel.addEventListener('toggle', () => {
            if (!guidePanel.open) lsSet('mtTrain.guideSeen', '1');
        });
    }
    renderTrainCoach(null);
    void refreshElectronTrainStatus();
    trainJaAnchorEl.addEventListener('input', () => {
        trainJaAnchorEl.dataset.touched = '1';
        refreshTrainQualityUi();
    });
    trainZhFromEl?.addEventListener('input', () => {
        trainZhFromEl.dataset.touched = '1';
        const hit = primaryHit();
        if (hit && !trainExpectEl.dataset.touched) {
            trainExpectEl.value = expectFromFrag(
                dirtyZhForHit(hit),
                trainZhFromEl.value,
                trainZhToEl?.value || '',
            );
        }
        refreshTrainQualityUi();
    });
    trainZhToEl?.addEventListener('input', () => {
        trainZhToEl.dataset.touched = '1';
        const hit = primaryHit();
        if (hit && !trainExpectEl.dataset.touched) {
            trainExpectEl.value = expectFromFrag(
                dirtyZhForHit(hit),
                trainZhFromEl?.value || '',
                trainZhToEl.value,
            );
        }
        refreshTrainQualityUi();
    });
    trainExpectEl.addEventListener('input', () => {
        trainExpectEl.dataset.touched = '1';
        const hit = primaryHit();
        if (hit) syncFragFromExpect(dirtyZhForHit(hit), trainExpectEl.value);
        refreshTrainQualityUi();
    });
    trainAsrToEl.addEventListener('input', () => { trainAsrToEl.dataset.touched = '1'; });
    trainPinFinalEl.addEventListener('change', () => {
        trainPinFinalEl.dataset.touched = '1';
        refreshTrainQualityUi();
    });
    syncTrainKindUi();
    $('btnClearSel').addEventListener('click', () => {
        selected.clear();
        trainJaAnchorEl.dataset.touched = '';
        trainExpectEl.dataset.touched = '';
        trainAsrToEl.dataset.touched = '';
        if (trainZhFromEl) trainZhFromEl.dataset.touched = '';
        if (trainZhToEl) trainZhToEl.dataset.touched = '';
        updatePoisonBtn();
        renderClusters();
    });
    $('btnSelectVisible').addEventListener('click', () => {
        if (!currentScan) return;
        const hideSoft = hideAlignEl.checked;
        for (const c of currentScan.clusters || []) {
            if (hideSoft && isSoftCluster(c.cluster)) continue;
            if (activeClusterFilter && c.cluster !== activeClusterFilter) continue;
            if (!HOT.has(c.cluster)) continue;
            for (const hit of c.samples.filter(hitMatchesSearch)) {
                selected.set(hitKey(hit), {
                    ...hit,
                    title: activeCode || c.cluster,
                    note: (hit.issues || []).join(','),
                });
            }
        }
        renderClusters();
        updatePoisonBtn();
    });

    dlgCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(dlgBody.textContent || '');
            log('已复制对话框内容');
        } catch (err) {
            log(`复制失败：${err.message}`);
        }
    });
    dlgWrite.addEventListener('click', async () => {
        if (dlgMode === 'poison-preview' && pendingPoisonHits) {
            previewDlg.close();
            await exportPoison(pendingPoisonHits);
            return;
        }
        if (dlgMode === 'drafts-list') {
            await openLatestDraft();
        }
    });

    document.addEventListener('keydown', (ev) => {
        if (previewDlg.open) return;
        const typing = isTypingTarget(document.activeElement);
        if (ev.key === '/' && !typing) {
            ev.preventDefault();
            searchHitsEl.focus();
            searchHitsEl.select();
            return;
        }
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            runScan({ force: true });
            return;
        }
        if (typing) return;
        if (ev.key === 'j') { ev.preventDefault(); moveTitle(1); }
        if (ev.key === 'k') { ev.preventDefault(); moveTitle(-1); }
        if (ev.key === 'Enter') { ev.preventDefault(); runScan({ force: false }); }
        if (ev.key === 'r') { ev.preventDefault(); runScan({ force: true }); }
    });

    loadTitles().catch((e) => log(e.message));
})();
