'use strict';

/**
 * Transub Sanitize训练台 (local training console).
 * Usage:
 *   node tools/mt-train/server.js
 *   node tools/mt-train/server.js --open
 *   node tools/mt-train/server.js --port=8787
 *   node tools/mt-train/server.js --force   # kill existing listener on port
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const { URL } = require('url');

const { listPairedTitles, collectTitlePairs, resolveUnderRoots } = require('./lib/titles');
const { scanPair, scanBatch, reloadSanitize, getSanitize } = require('./lib/scan');
const { writePoisonDraft, listPoisonDrafts } = require('./lib/poison');
const train = require('./lib/train');
const autoPropose = require('./lib/auto-propose');
const regressionGate = require('./lib/regression-gate');
const autoQuality = require('./lib/auto-quality');
const wizardTest = require('./lib/wizard-test');

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(__dirname, 'public');
const JA_ROOT = process.env.MT_TRAIN_JA_ROOT || path.join(ROOT, 'subtitles');
const ZH_ROOT = process.env.MT_TRAIN_ZH_ROOT || 'E:\\un\\ok';
const WIZARD_TMP = path.join(ROOT, 'tmp', 'mt-wizard');
const ALLOWED_ROOTS = [JA_ROOT, ZH_ROOT, ROOT, WIZARD_TMP].map((p) => path.resolve(p));

const PORT = (() => {
    const a = process.argv.find((x) => x.startsWith('--port='));
    return a ? Number(a.slice(7)) || 8787 : Number(process.env.MT_TRAIN_PORT) || 8787;
})();
const OPEN = process.argv.includes('--open');
const FORCE = process.argv.includes('--force');

function openBrowser(href) {
    const cmd = process.platform === 'win32'
        ? `start "" "${href}"`
        : process.platform === 'darwin'
            ? `open "${href}"`
            : `xdg-open "${href}"`;
    exec(cmd, () => {});
}

/** Best-effort: free PORT on localhost (Windows / Unix). */
function killPortListener(port) {
    try {
        if (process.platform === 'win32') {
            const out = execSync(
                `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique"`,
                { encoding: 'utf8' },
            );
            const pids = out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
            for (const pid of pids) {
                try {
                    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
                    console.log(`freed port ${port} (killed pid ${pid})`);
                } catch (_) { /* ignore */ }
            }
            return pids.length > 0;
        }
        const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN || true`, { encoding: 'utf8' });
        const pids = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        for (const pid of pids) {
            try {
                process.kill(Number(pid), 'SIGTERM');
                console.log(`freed port ${port} (killed pid ${pid})`);
            } catch (_) { /* ignore */ }
        }
        return pids.length > 0;
    } catch (_) {
        return false;
    }
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

function serveStatic(req, res, urlPath) {
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    rel = decodeURIComponent(rel.split('?')[0]);
    if (rel.includes('..')) {
        res.writeHead(400);
        return res.end('bad path');
    }
    const file = path.join(PUBLIC, rel.replace(/^\//, ''));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}

function readTdpSuggest() {
    const manifestPath = path.join(ROOT, 'dist', 'tdp-cdn', 'manifest.json');
    let current = null;
    try {
        if (fs.existsSync(manifestPath)) {
            const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            current = m?.latest?.version || null;
        }
    } catch (_) { /* ignore */ }
    let next = '1.0.0';
    if (current && /^\d+\.\d+\.\d+/.test(current)) {
        const parts = current.split('.').map(Number);
        parts[2] += 1;
        next = parts.join('.');
    }
    return { current, next, manifestPath };
}

function guardPath(p) {
    if (!p || typeof p !== 'string') return null;
    return resolveUnderRoots(p, ALLOWED_ROOTS);
}

function startSse(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
    });
    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    return send;
}

function runSpawnSse(res, command, args, opts = {}) {
    const send = startSse(res);
    send('log', { line: `$ ${command} ${args.join(' ')}` });
    const child = spawn(command, args, {
        cwd: ROOT,
        shell: true,
        env: { ...process.env, ...opts.env },
    });
    const onData = (buf) => {
        String(buf).split(/\r?\n/).forEach((line) => {
            if (line !== '') send('log', { line });
        });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
        send('log', { line: `ERROR: ${err.message}` });
        send('done', { ok: false, code: -1 });
        res.end();
    });
    child.on('close', (code) => {
        send('done', { ok: code === 0, code });
        res.end();
    });
}

function pickTitlesForBatch(body) {
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 12;
    const pool = listPairedTitles(JA_ROOT, ZH_ROOT, {
        limit: Math.max(limit, 80),
        q: body.q,
    });
    const picked = Array.isArray(body.codes) && body.codes.length
        ? pool.filter((t) => body.codes.includes(t.code))
        : pool.slice(0, limit);
    return { limit, picked };
}

function compactBatchRow(t, scan) {
    const topLive = (scan.clusters || [])
        .filter((c) => !String(c.cluster).startsWith('fixed:')
            && c.cluster !== 'align_suspect'
            && c.cluster !== 'moan_expand')
        .flatMap((c) => c.samples.slice(0, 2).map((s) => ({
            code: t.code,
            cluster: c.cluster,
            ji: s.ji,
            src: s.src,
            dst: s.dst,
            after: s.after,
        })))
        .slice(0, 6);
    return {
        code: t.code,
        jaPath: t.jaPath,
        zhPath: t.zhPath,
        aligned: scan.aligned,
        changed: scan.changed,
        asrChanged: scan.asrChanged,
        liveHitCount: scan.liveHitCount,
        softHitCount: scan.softHitCount,
        live: scan.summary.liveClusterCounts,
        fixed: Object.fromEntries(
            (scan.clusters || [])
                .filter((c) => String(c.cluster).startsWith('fixed:'))
                .map((c) => [c.cluster, c.n]),
        ),
        topLive,
    };
}

async function handleApi(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/titles') {
        const limit = Number(url.searchParams.get('limit')) || 60;
        const q = url.searchParams.get('q') || '';
        const pack = collectTitlePairs(JA_ROOT, ZH_ROOT, { limit, q });
        return sendJson(res, 200, {
            jaRoot: JA_ROOT,
            zhRoot: ZH_ROOT,
            count: pack.titles.length,
            totalPaired: pack.totalPaired,
            matched: pack.matched,
            unpairedJa: pack.unpairedJa,
            q,
            titles: pack.titles,
            tdp: readTdpSuggest(),
        });
    }

    if (req.method === 'GET' && url.pathname === '/api/tdp-suggest') {
        return sendJson(res, 200, readTdpSuggest());
    }

    if (req.method === 'GET' && url.pathname === '/api/drafts') {
        const limit = Number(url.searchParams.get('limit')) || 12;
        return sendJson(res, 200, {
            drafts: listPoisonDrafts(ROOT, { limit }),
            dir: path.join(ROOT, 'tests', 'fixtures', 'mt-train-drafts'),
        });
    }

    if (req.method === 'GET' && url.pathname === '/api/draft') {
        const name = String(url.searchParams.get('name') || '');
        if (!/^draft-[\w.-]+\.js$/i.test(name)) {
            return sendJson(res, 400, { error: 'invalid draft name' });
        }
        const file = path.join(ROOT, 'tests', 'fixtures', 'mt-train-drafts', name);
        if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, {
            name,
            file,
            body: fs.readFileSync(file, 'utf8'),
        });
    }

    if (req.method === 'POST' && url.pathname === '/api/reload') {
        try {
            reloadSanitize();
            return sendJson(res, 200, { ok: true, reloadedAt: new Date().toISOString() });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/prepare') {
        const body = await readBody(req);
        try {
            fs.mkdirSync(WIZARD_TMP, { recursive: true });
            const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const dir = path.join(WIZARD_TMP, stamp);
            fs.mkdirSync(dir, { recursive: true });

            function writeSide(side, rawName, text) {
                const name = String(rawName || `${side}.srt`).replace(/[<>:"|?*\u0000-\u001f]/g, '_');
                const base = path.basename(name).toLowerCase().endsWith('.srt')
                    ? path.basename(name)
                    : `${path.basename(name, path.extname(name)) || side}.srt`;
                const filePath = path.join(dir, `${side}_${base}`);
                fs.writeFileSync(filePath, String(text ?? ''), 'utf8');
                return filePath;
            }

            let jaPath = guardPath(body.jaPath);
            let zhPath = guardPath(body.zhPath);
            if (!jaPath && body.jaText != null) {
                jaPath = writeSide('ja', body.jaName, body.jaText);
            }
            if (!zhPath && body.zhText != null) {
                zhPath = writeSide('zh', body.zhName, body.zhText);
            }
            if (!jaPath || !zhPath) {
                return sendJson(res, 400, { error: '需要日文与中文字幕（路径或文件内容）' });
            }
            if (!fs.existsSync(jaPath) || !fs.existsSync(zhPath)) {
                return sendJson(res, 404, { error: '字幕文件不存在' });
            }

            const scan = scanPair(jaPath, zhPath, {
                contentProfile: body.contentProfile || 'av_soft',
                reload: body.reload !== false,
            });
            const hits = [];
            for (const c of scan.clusters || []) {
                if (String(c.cluster).startsWith('fixed:')) continue;
                if (c.cluster === 'align_suspect' || c.cluster === 'moan_expand') continue;
                for (const s of c.samples || []) hits.push({ ...s, cluster: c.cluster });
            }
            hits.sort((a, b) => {
                const ha = autoPropose.HOT.has(a.cluster) ? 0 : 1;
                const hb = autoPropose.HOT.has(b.cluster) ? 0 : 1;
                return ha - hb;
            });

            return sendJson(res, 200, {
                ok: true,
                jaPath,
                zhPath,
                session: stamp,
                scanSummary: {
                    jaCount: scan.jaCount,
                    zhCount: scan.zhCount,
                    aligned: scan.aligned,
                    liveHitCount: scan.liveHitCount,
                    changed: scan.changed,
                },
                hotHits: hits.slice(0, Number(body.maxHits) > 0 ? Number(body.maxHits) : 12),
                allHotCount: hits.length,
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/learn') {
        const body = await readBody(req);
        try {
            const hits = Array.isArray(body.hits) ? body.hits : [];
            if (!hits.length) {
                return sendJson(res, 400, { error: '没有可学习的句子' });
            }
            const sanitize = getSanitize(true);
            const out = autoPropose.proposeFromHits(sanitize, hits, {
                title: body.title || 'wizard',
                max: body.max || hits.length,
                expects: body.expects,
                pinFinal: true,
                corpus: hits,
            });
            const report = autoPropose.autoQuality.buildWizardReport(out.proposals || []);
            return sendJson(res, 200, {
                ok: true,
                ...out,
                report,
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/learn-batch') {
        const body = await readBody(req);
        try {
            fs.mkdirSync(WIZARD_TMP, { recursive: true });
            const pairsIn = Array.isArray(body.pairs) ? body.pairs.slice(0, 12) : [];
            if (!pairsIn.length) {
                return sendJson(res, 400, { error: '请至少选择一对历史字幕' });
            }
            const maxHitsPerPair = Number(body.maxHitsPerPair) > 0 ? Number(body.maxHitsPerPair) : 8;
            const allHits = [];
            const pairSummaries = [];

            function writeSide(dir, side, rawName, text) {
                const name = String(rawName || `${side}.srt`).replace(/[<>:"|?*\u0000-\u001f]/g, '_');
                const base = path.basename(name).toLowerCase().endsWith('.srt')
                    ? path.basename(name)
                    : `${path.basename(name, path.extname(name)) || side}.srt`;
                const filePath = path.join(dir, `${side}_${base}`);
                fs.writeFileSync(filePath, String(text ?? ''), 'utf8');
                return filePath;
            }

            for (let i = 0; i < pairsIn.length; i += 1) {
                const pair = pairsIn[i] || {};
                const stamp = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
                const dir = path.join(WIZARD_TMP, stamp);
                fs.mkdirSync(dir, { recursive: true });

                let jaPath = guardPath(pair.jaPath);
                let zhPath = guardPath(pair.zhPath);
                if (!jaPath && pair.jaText != null) {
                    jaPath = writeSide(dir, 'ja', pair.jaName || pair.title, pair.jaText);
                }
                if (!zhPath && pair.zhText != null) {
                    zhPath = writeSide(dir, 'zh', pair.zhName || pair.title, pair.zhText);
                }
                if (!jaPath || !zhPath || !fs.existsSync(jaPath) || !fs.existsSync(zhPath)) {
                    pairSummaries.push({
                        title: pair.title || `pair-${i}`,
                        ok: false,
                        error: '字幕不可用',
                    });
                    continue;
                }

                const scan = scanPair(jaPath, zhPath, {
                    contentProfile: body.contentProfile || 'av_soft',
                    reload: i === 0,
                });
                const title = String(pair.title || path.basename(jaPath, path.extname(jaPath)))
                    .replace(/\.src$/i, '');
                const hits = [];
                for (const c of scan.clusters || []) {
                    if (String(c.cluster).startsWith('fixed:')) continue;
                    if (c.cluster === 'align_suspect' || c.cluster === 'moan_expand') continue;
                    for (const s of c.samples || []) {
                        hits.push({
                            ...s,
                            cluster: c.cluster,
                            title,
                            jaPath,
                            zhPath,
                        });
                    }
                }
                hits.sort((a, b) => {
                    const ha = autoPropose.HOT.has(a.cluster) ? 0 : 1;
                    const hb = autoPropose.HOT.has(b.cluster) ? 0 : 1;
                    return ha - hb;
                });
                const picked = hits.slice(0, maxHitsPerPair);
                allHits.push(...picked);
                pairSummaries.push({
                    title,
                    ok: true,
                    jaPath,
                    zhPath,
                    aligned: scan.aligned,
                    liveHitCount: scan.liveHitCount,
                    hotUsed: picked.length,
                });
            }

            if (!allHits.length) {
                return sendJson(res, 200, {
                    ok: true,
                    pairSummaries,
                    report: {
                        adopt: [], review: [], skip: [],
                        adoptCount: 0, reviewCount: 0, skipCount: 0, wholeFiltered: 0,
                    },
                    hint: '多片对照后没有可学热点',
                });
            }

            const sanitize = getSanitize(true);
            const out = autoPropose.proposeFromHits(sanitize, allHits, {
                title: body.title || 'wizard-batch',
                max: body.max || Math.min(40, allHits.length),
                expects: body.expects,
                pinFinal: true,
                corpus: allHits,
            });
            const report = autoPropose.autoQuality.buildWizardReport(out.proposals || []);
            return sendJson(res, 200, {
                ok: true,
                ...out,
                pairSummaries,
                hitCount: allHits.length,
                report,
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/test') {
        const body = await readBody(req);
        try {
            const items = Array.isArray(body.items) ? body.items : [];
            if (!items.length) {
                return sendJson(res, 400, { error: '请至少选择一条规则进行测试' });
            }
            let corpus = Array.isArray(body.corpus) ? body.corpus : [];
            const jaPath = guardPath(body.jaPath);
            const zhPath = guardPath(body.zhPath);
            if (!corpus.length && jaPath && zhPath
                && fs.existsSync(jaPath) && fs.existsSync(zhPath)) {
                try {
                    const scan = scanPair(jaPath, zhPath, { reload: false });
                    corpus = (scan.clusters || []).flatMap((c) => (c.samples || []).map((s) => ({
                        ...s,
                        cluster: c.cluster,
                    })));
                } catch (_) { /* ignore */ }
            }
            const sanitize = getSanitize(true);
            const out = wizardTest.testWizardItems(sanitize, items, { corpus });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, {
            ok: true,
            service: 'mt-train',
            port: PORT,
            features: {
                autoPropose: true,
                autoApply: true,
                trainTry: true,
                trainApply: true,
                wizard: true,
                ruleReuse: true,
                learnBatch: true,
                regressionGate: true,
                rulesBoard: true,
                wizardTest: true,
            },
            version: 9,
        });
    }

    if (req.method === 'GET' && url.pathname === '/api/train/rules') {
        return sendJson(res, 200, train.listRules());
    }

    if (req.method === 'POST' && url.pathname === '/api/train/rules-board') {
        const body = await readBody(req);
        try {
            const listed = train.listRules();
            let corpus = Array.isArray(body.corpus) ? body.corpus : [];
            const jaPath = guardPath(body.jaPath);
            const zhPath = guardPath(body.zhPath);
            if (!corpus.length && jaPath && zhPath && fs.existsSync(jaPath) && fs.existsSync(zhPath)) {
                const scan = scanPair(jaPath, zhPath, { reload: false });
                corpus = (scan.clusters || []).flatMap((c) => (c.samples || []).map((s) => ({
                    ...s,
                    cluster: c.cluster,
                })));
            }

            const zhRows = (listed.zhRemaps || []).map((r) => {
                const payload = {
                    mode: r.mode === 'blank' ? 'blank' : 'replace',
                    zhFrom: r.zhFrom,
                    zhTo: r.zhTo,
                    jaAnchor: (r.jaIncludes || [])[0] || '',
                };
                const collateral = corpus.length
                    ? autoQuality.estimateCollateral(payload, corpus, { targetJis: [] })
                    : null;
                return {
                    ...r,
                    kind: 'zh',
                    fragment: r.mode === 'blank'
                        ? '→ …'
                        : `「${r.zhFrom || ''}」→「${r.zhTo || ''}」`,
                    anchor: (r.jaIncludes || []).join(' + '),
                    stats: collateral
                        ? {
                            totalHits: collateral.totalHits,
                            extra: collateral.extra,
                            ratio: collateral.ratio,
                            risky: collateral.risky,
                        }
                        : null,
                };
            });
            const asrRows = (listed.asrPairs || []).map((r) => ({
                ...r,
                kind: 'asr',
                fragment: `${r.from} → ${r.to}`,
                anchor: r.from,
                stats: null,
            }));
            return sendJson(res, 200, {
                ok: true,
                path: listed.path,
                corpusSize: corpus.length,
                rules: [...zhRows, ...asrRows],
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/try') {
        const body = await readBody(req);
        try {
            const sanitize = getSanitize(true);
            const trial = train.tryWithCandidate(sanitize, body);
            return sendJson(res, 200, trial);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/apply') {
        const body = await readBody(req);
        try {
            let rule;
            if (body.kind === 'asr') {
                rule = train.addAsrPair(body);
            } else {
                const mode = body.mode === 'blank' ? 'blank' : 'replace';
                let zhFrom = body.zhFrom;
                let zhTo = body.zhTo;
                if (mode === 'replace') {
                    const forced = train.forceShortestFragment({
                        dirty: body.zh,
                        expect: body.expect,
                        zhFrom,
                        zhTo,
                    });
                    if (forced.unusable && !body.force) {
                        return sendJson(res, 409, {
                            ok: false,
                            error: '无法抽出短片段，已拒绝整句写入',
                            code: 'low_reuse',
                            fragment: forced,
                        });
                    }
                    if (!forced.unusable) {
                        zhFrom = forced.zhFrom;
                        zhTo = forced.zhTo;
                    } else if (!zhFrom && body.zh != null && body.expect != null) {
                        const sug = train.suggestLocalReplace(body.zh, body.expect);
                        if (sug) {
                            zhFrom = sug.zhFrom;
                            zhTo = sug.zhTo;
                        }
                    }
                }
                if (mode === 'replace' && body.expect != null && zhTo == null) zhTo = body.expect;

                const payloadForGate = {
                    kind: 'zh',
                    mode,
                    zh: body.zh,
                    expect: body.expect,
                    zhFrom: zhFrom || '',
                    zhTo: mode === 'blank' ? '' : (zhTo || ''),
                    jaAnchor: body.jaAnchor || body.ja || '',
                    contentProfile: body.contentProfile || 'av_soft',
                    ji: body.ji,
                    jis: body.jis,
                    expandStub: body.expandStub,
                };
                let corpus = Array.isArray(body.corpus) ? body.corpus : [];
                const jaPathGate = guardPath(body.jaPath);
                const zhPathGate = guardPath(body.zhPath);
                if (!corpus.length && jaPathGate && zhPathGate
                    && fs.existsSync(jaPathGate) && fs.existsSync(zhPathGate)) {
                    try {
                        const scanGate = scanPair(jaPathGate, zhPathGate, { reload: false });
                        corpus = (scanGate.clusters || []).flatMap((c) => (c.samples || []).map((s) => ({
                            ...s,
                            cluster: c.cluster,
                        })));
                    } catch (_) { /* ignore */ }
                }
                if (!body.force) {
                    const gate = regressionGate.runRegressionGate(getSanitize(true), payloadForGate, {
                        corpus,
                        targetJis: body.ji != null ? [body.ji] : body.jis,
                    });
                    if (!gate.ok) {
                        return sendJson(res, 409, {
                            ok: false,
                            error: `回归闸拦截：${(gate.reasons || []).join('；') || '误伤风险'}`,
                            code: 'regression_gate',
                            gate,
                        });
                    }
                }

                const jaAnchor = body.jaAnchor || body.ja || '';
                const narrowedJa = train.narrowJaAnchor(jaAnchor, { maxLen: 14 }) || train.suggestJaAnchor(jaAnchor) || jaAnchor;
                if (!body.force && train.isLowReuseAnchor(narrowedJa, body.ja || jaAnchor)) {
                    return sendJson(res, 409, {
                        ok: false,
                        error: '日文锚点接近整句，复用性差，请改成短短语',
                        code: 'long_anchor',
                        suggestedAnchor: train.narrowJaAnchor(body.ja || jaAnchor, { maxLen: 12 }),
                    });
                }
                rule = train.addZhRemap({
                    title: body.title,
                    note: body.note,
                    mode,
                    pinFinal: body.pinFinal !== false,
                    jaIncludes: body.jaIncludes
                        || (narrowedJa ? [narrowedJa] : []),
                    zhFrom: zhFrom || '',
                    zhTo: mode === 'blank' ? '' : (zhTo || ''),
                });
            }
            const quality = train.assessRuleQuality(body);
            const sanitize = reloadSanitize();
            const trial = train.trySanitize(sanitize, {
                ja: body.ja,
                zh: body.zh,
                expect: body.expect != null ? body.expect : (body.kind === 'asr' ? null : body.zhTo || rule.zhTo),
                contentProfile: body.contentProfile || 'av_soft',
                pinFinal: body.pinFinal,
                jaAnchor: body.jaAnchor || body.ja,
                asrHint: body.asrHint,
            });
            if (trial && quality) {
                trial.warnings = [...new Set([...(quality.warnings || []), ...(trial.warnings || [])])];
                trial.tips = [...new Set([...(quality.tips || []), ...(trial.tips || [])])];
                trial.suggestion = quality.suggestion || trial.suggestion || null;
            }
            let scanSummary = null;
            const jaPath = guardPath(body.jaPath);
            const zhPath = guardPath(body.zhPath);
            if (jaPath && zhPath && fs.existsSync(jaPath) && fs.existsSync(zhPath)) {
                const scan = scanPair(jaPath, zhPath, { reload: false });
                scanSummary = {
                    liveHitCount: scan.liveHitCount,
                    softHitCount: scan.softHitCount,
                    changed: scan.changed,
                    liveClusterCounts: scan.summary?.liveClusterCounts || {},
                };
            }
            return sendJson(res, 200, {
                ok: true,
                rule,
                trial,
                scanSummary,
                promote: body.kind === 'asr' ? null : train.promoteSnippet(rule),
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/asr-pair') {
        const body = await readBody(req);
        try {
            const rule = train.addAsrPair(body);
            reloadSanitize();
            return sendJson(res, 200, { ok: true, rule });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/toggle') {
        const body = await readBody(req);
        try {
            const rule = train.toggleRule(body.id, body.enabled !== false);
            reloadSanitize();
            return sendJson(res, 200, { ok: true, rule });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/remove') {
        const body = await readBody(req);
        try {
            const out = train.removeRule(body.id);
            reloadSanitize();
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/promote') {
        const body = await readBody(req);
        try {
            const rules = train.listRules();
            const rule = [...rules.zhRemaps, ...rules.asrPairs].find((r) => r.id === body.id);
            if (!rule) return sendJson(res, 404, { error: '规则不存在' });
            if (rule.from != null) {
                return sendJson(res, 200, {
                    snippet: `// ASR train promote\n// { from: ${JSON.stringify(rule.from)}, to: ${JSON.stringify(rule.to)} }`,
                });
            }
            return sendJson(res, 200, { snippet: train.promoteSnippet(rule) });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/auto-propose') {
        const body = await readBody(req);
        try {
            let hits = Array.isArray(body.hits) ? body.hits : null;
            if (!hits) {
                const jaPath = guardPath(body.jaPath);
                const zhPath = guardPath(body.zhPath);
                if (!jaPath || !zhPath) {
                    return sendJson(res, 400, { error: '需要 hits 或合法的 jaPath/zhPath' });
                }
                const scan = scanPair(jaPath, zhPath, {
                    contentProfile: body.contentProfile || 'av_soft',
                    reload: body.reload !== false,
                });
                hits = [];
                for (const c of scan.clusters || []) {
                    for (const s of c.samples || []) hits.push(s);
                }
            }
            const sanitize = getSanitize(true);
            let corpus = Array.isArray(body.corpus) ? body.corpus : null;
            if (!corpus && body.jaPath && body.zhPath) {
                try {
                    const jaPath = guardPath(body.jaPath);
                    const zhPath = guardPath(body.zhPath);
                    if (jaPath && zhPath) {
                        const scan = scanPair(jaPath, zhPath, {
                            contentProfile: body.contentProfile || 'av_soft',
                            reload: false,
                        });
                        corpus = [];
                        for (const c of scan.clusters || []) {
                            for (const s of c.samples || []) corpus.push(s);
                        }
                        for (const f of scan.sampleFixes || []) {
                            corpus.push({
                                ji: f.ji,
                                src: f.src,
                                dst: f.before,
                                after: f.after,
                            });
                        }
                    }
                } catch (_) { /* ignore collateral corpus */ }
            }
            const out = autoPropose.proposeFromHits(sanitize, hits, {
                title: body.title || '',
                max: body.max,
                expects: body.expects,
                pinFinal: body.pinFinal !== false,
                corpus: corpus || hits,
            });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/auto-apply') {
        const body = await readBody(req);
        try {
            const out = autoPropose.applyProposals(body.proposals || [], {
                onlyReady: body.onlyReady !== false,
            });
            if (out.applied > 0) reloadSanitize();
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/scan') {
        const body = await readBody(req);
        const jaPath = guardPath(body.jaPath);
        const zhPath = guardPath(body.zhPath);
        if (!jaPath || !zhPath) {
            return sendJson(res, 400, { error: 'jaPath/zhPath must be under allowed roots', allowed: ALLOWED_ROOTS });
        }
        if (!fs.existsSync(jaPath) || !fs.existsSync(zhPath)) {
            return sendJson(res, 404, { error: 'srt not found' });
        }
        try {
            const result = scanPair(jaPath, zhPath, {
                tolMs: body.tolMs,
                contentProfile: body.contentProfile || 'av_soft',
                reload: body.reload !== false,
            });
            return sendJson(res, 200, result);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/scan-batch') {
        const body = await readBody(req);
        try {
            const { picked } = pickTitlesForBatch(body);
            if (body.stream) {
                const send = startSse(res);
                const aggregate = {};
                const results = [];
                send('start', { count: picked.length });
                for (let idx = 0; idx < picked.length; idx += 1) {
                    const t = picked[idx];
                    send('progress', { i: idx + 1, n: picked.length, code: t.code });
                    try {
                        const scan = scanPair(t.jaPath, t.zhPath, {
                            tolMs: body.tolMs,
                            contentProfile: body.contentProfile || 'av_soft',
                            reload: idx === 0 && body.reload !== false,
                        });
                        for (const [k, n] of Object.entries(scan.summary.liveClusterCounts || {})) {
                            aggregate[k] = (aggregate[k] || 0) + n;
                        }
                        const row = compactBatchRow(t, scan);
                        results.push(row);
                        send('title', row);
                    } catch (err) {
                        send('title', {
                            code: t.code,
                            error: String(err && err.message ? err.message : err),
                            liveHitCount: -1,
                        });
                    }
                }
                results.sort((a, b) => (b.liveHitCount || 0) - (a.liveHitCount || 0)
                    || (b.changed || 0) - (a.changed || 0));
                send('done', {
                    ok: true,
                    count: results.length,
                    aggregateLive: aggregate,
                    titles: results,
                });
                res.end();
                return undefined;
            }
            const result = scanBatch(picked, {
                tolMs: body.tolMs,
                contentProfile: body.contentProfile || 'av_soft',
                reload: body.reload !== false,
            });
            return sendJson(res, 200, result);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/poison') {
        const body = await readBody(req);
        if (!Array.isArray(body.hits) || !body.hits.length) {
            return sendJson(res, 400, { error: 'hits[] required' });
        }
        try {
            const out = writePoisonDraft(ROOT, {
                hits: body.hits,
                suiteName: body.suiteName,
                dryRun: Boolean(body.dryRun),
            });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/mocha') {
        return runSpawnSse(res, 'npx', ['mocha', 'tests/mt-sanitize.test.js', '--timeout', '60000']);
    }

    if (req.method === 'POST' && url.pathname === '/api/tdp') {
        const body = await readBody(req);
        const suggest = readTdpSuggest();
        const version = String(body.version || suggest.next || '').trim();
        const notes = String(body.notes || 'mt-train: domain fixes').trim();
        if (!/^\d+\.\d+\.\d+/.test(version)) {
            return sendJson(res, 400, { error: 'version must look like 1.0.19' });
        }
        const send = startSse(res);
        const args = [
            'run', 'encode:tdp', '--',
            `--version=${version}`,
            '--sign',
            '--manifest-out=dist/tdp-cdn/manifest.json',
            `--notes=${notes}`,
        ];
        send('log', { line: `$ npm ${args.join(' ')}` });
        const child = spawn('npm', args, { cwd: ROOT, shell: true });
        const onData = (buf) => {
            String(buf).split(/\r?\n/).forEach((line) => {
                if (line !== '') send('log', { line });
            });
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const packSrc = path.join(ROOT, 'shared', 'tdp', 'packs', `tdp-${version}.tpack`);
                    const packDstDir = path.join(ROOT, 'dist', 'tdp-cdn', 'packs');
                    fs.mkdirSync(packDstDir, { recursive: true });
                    if (fs.existsSync(packSrc)) {
                        fs.copyFileSync(packSrc, path.join(packDstDir, `tdp-${version}.tpack`));
                        send('log', { line: `staged → dist/tdp-cdn/packs/tdp-${version}.tpack` });
                    } else {
                        send('log', { line: `warn: pack not found at ${packSrc}` });
                    }
                } catch (err) {
                    send('log', { line: `stage error: ${err.message}` });
                }
            }
            send('done', { ok: code === 0, code, version });
            res.end();
        });
        return undefined;
    }

    return sendJson(res, 404, { error: 'unknown api' });
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
            return;
        }
        serveStatic(req, res, url.pathname);
    } catch (err) {
        sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
    }
});

function startListening() {
    const href = `http://127.0.0.1:${PORT}/`;
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`Transub Sanitize训练台 → ${href}`);
        console.log(`JA root: ${JA_ROOT}`);
        console.log(`ZH root: ${ZH_ROOT}`);
        if (OPEN) openBrowser(href);
    });
}

server.on('error', (err) => {
    const href = `http://127.0.0.1:${PORT}/`;
    if (err && err.code === 'EADDRINUSE') {
        if (FORCE) {
            console.warn(`port ${PORT} in use — --force, retrying…`);
            killPortListener(PORT);
            setTimeout(() => startListening(), 400);
            return;
        }
        if (OPEN) {
            console.log(`port ${PORT} already in use — opening existing console → ${href}`);
            console.log('(use --force to restart, or --port=8788 for a new instance)');
            openBrowser(href);
            process.exit(0);
            return;
        }
        console.error(`port ${PORT} already in use (${href}).`);
        console.error('  npm run train:mt:open          # open existing');
        console.error('  node tools/mt-train/server.js --force --open');
        console.error('  node tools/mt-train/server.js --port=8788 --open');
        process.exit(1);
        return;
    }
    console.error(err);
    process.exit(1);
});

if (FORCE) killPortListener(PORT);
startListening();
