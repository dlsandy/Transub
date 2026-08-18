'use strict';

/**
 * Transub 学习向导 (local training wizard).
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
const shipGate = require('./lib/ship-gate');
const autoQuality = require('./lib/auto-quality');
const wizardTest = require('./lib/wizard-test');
const loopReport = require('./lib/loop-report');
const idleTrain = require('./lib/idle-train');
const trainRoute = require('./lib/train-route');
const multiCorpus = require('./lib/multi-corpus');
const ruleLifecycle = require('./lib/rule-lifecycle');
const historyPairs = require('./lib/history-pairs');
const harvestReport = require('./lib/harvest-report');
const feedPack = require('./lib/feed-pack');
const opposingFixture = require('./lib/opposing-fixture');
const sandbox = require('./lib/sandbox');

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(__dirname, 'public');
const JA_ROOT = process.env.MT_TRAIN_JA_ROOT || path.join(ROOT, 'subtitles');
const ZH_ROOT = process.env.MT_TRAIN_ZH_ROOT || 'E:\\un\\ok';
const WIZARD_TMP = path.join(ROOT, 'tmp', 'mt-wizard');
const ALLOWED_ROOTS = [JA_ROOT, ZH_ROOT, ROOT, WIZARD_TMP].map((p) => path.resolve(p));

// Default sandbox writes; layer on official pack for sanitize runtime.
const TRAIN_AUDIENCE = process.env.TRANSUB_MT_TRAIN_AUDIENCE === 'pro' ? 'pro' : 'dev';
if (TRAIN_AUDIENCE === 'pro') {
    process.env.MT_TRAIN_TARGET = 'sandbox';
}
if (!process.env.TRANSUB_MT_SANDBOX_ROOT) {
    process.env.TRANSUB_MT_SANDBOX_ROOT = ROOT;
}
if (!process.env.TRANSUB_MT_USER_REMAPS) {
    process.env.TRANSUB_MT_USER_REMAPS = sandbox.sandboxPackPath();
}
if (!process.env.MT_TRAIN_TARGET) {
    process.env.MT_TRAIN_TARGET = sandbox.getWriteTarget();
}
if (TRAIN_AUDIENCE === 'pro') {
    sandbox.setWriteTarget('sandbox');
    process.env.MT_TRAIN_TARGET = 'sandbox';
}

const PORT = (() => {
    const a = process.argv.find((x) => x.startsWith('--port='));
    return a ? Number(a.slice(7)) || 8787 : Number(process.env.MT_TRAIN_PORT) || 8787;
})();
const OPEN = process.argv.includes('--open');
const FORCE = process.argv.includes('--force');
const IDLE_WATCH = process.argv.includes('--idle-watch');
const idleSchedule = require('./lib/idle-schedule');

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

/**
 * Accept engine outputs outside JA/ZH roots by copying into wizard tmp.
 * @returns {string|null}
 */
function materializeWizardPath(rawPath, side, dir) {
    const guarded = guardPath(rawPath);
    if (guarded) return guarded;
    const abs = rawPath ? path.resolve(String(rawPath)) : '';
    if (!abs || !fs.existsSync(abs)) return null;
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${side}_${path.basename(abs)}`);
    fs.copyFileSync(abs, dest);
    return dest;
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

    if (req.method === 'POST' && url.pathname === '/api/wizard/load-paths') {
        const body = await readBody(req);
        try {
            function loadSide(rawPath) {
                let p = guardPath(rawPath);
                if (!p && rawPath && fs.existsSync(rawPath)) {
                    // Outside roots: copy into wizard tmp so later prepare/scan can use it
                    const stamp = `lib_${Date.now().toString(36)}`;
                    const dir = path.join(WIZARD_TMP, stamp);
                    fs.mkdirSync(dir, { recursive: true });
                    const dest = path.join(dir, path.basename(String(rawPath)));
                    fs.copyFileSync(path.resolve(rawPath), dest);
                    p = dest;
                }
                if (!p || !fs.existsSync(p)) return null;
                const text = fs.readFileSync(p, 'utf8');
                return { name: path.basename(p), path: p, text };
            }
            const ja = loadSide(body.jaPath);
            const zh = loadSide(body.zhPath || body.zhPathA || body.zhPathB);
            if (!ja || !zh) {
                return sendJson(res, 400, { error: '无法读取日/中字幕路径' });
            }
            return sendJson(res, 200, { ok: true, ja, zh, title: body.title || '' });
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

            let jaPath = materializeWizardPath(body.jaPath, 'ja', dir);
            let zhPath = materializeWizardPath(body.zhPath, 'zh', dir);
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
            const clusterCounts = {};
            const hits = [];
            const allSamples = [];
            let alignGapCount = 0;
            for (const c of scan.clusters || []) {
                const name = String(c.cluster || '');
                clusterCounts[name] = (c.samples || []).length;
                for (const s of (c.samples || []).slice(0, 3)) {
                    allSamples.push({ ...s, cluster: c.cluster });
                }
                if (name.startsWith('fixed:')) continue;
                // align_gap dominates liveHitCount but is not ZH-remap trainable
                if (name === 'align_suspect' || name === 'align_gap' || name === 'moan_expand') {
                    if (name === 'align_gap') alignGapCount += (c.samples || []).length;
                    continue;
                }
                for (const s of c.samples || []) hits.push({ ...s, cluster: c.cluster });
            }
            hits.sort((a, b) => {
                const ha = autoPropose.HOT.has(a.cluster) ? 0 : 1;
                const hb = autoPropose.HOT.has(b.cluster) ? 0 : 1;
                if (ha !== hb) return ha - hb;
                // Prefer higher-priority train routes within hot set
                const ra = trainRoute.classifyTrainRoute(a);
                const rb = trainRoute.classifyTrainRoute(b);
                const qa = trainRoute.CLUSTER_QUEUE.indexOf(ra.issue || a.cluster);
                const qb = trainRoute.CLUSTER_QUEUE.indexOf(rb.issue || b.cluster);
                const ia = qa < 0 ? 99 : qa;
                const ib = qb < 0 ? 99 : qb;
                return ia - ib;
            });

            const maxHits = Number(body.maxHits) > 0 ? Number(body.maxHits) : 40;
            const hotHits = hits.slice(0, maxHits);
            const hotByCluster = {};
            for (const h of hotHits) {
                const k = h.cluster || 'other';
                hotByCluster[k] = (hotByCluster[k] || 0) + 1;
            }

            const tips = [];
            if (alignGapCount > 0) {
                tips.push(
                    `对齐空洞 align_gap×${alignGapCount} → 记入「工单」（宜重对齐/重跑），不进 remap。`,
                );
            }
            if (!(scan.liveHitCount > 0) && !(hits.length > 0) && !alignGapCount) {
                tips.push('当前清洗后几乎无待修句：可换片，或看「现有规则已覆盖」工单。');
            } else if (!hotHits.length && alignGapCount > 0) {
                tips.push('本片 remap 可学点为 0，但工单仍算本轮收获——对照训练里这类结论同样有价值。');
            } else if (hotHits.length) {
                tips.push(`可学热点 ${hits.length} 条（已排除对齐空洞），本轮取 ${hotHits.length}。`);
                const under = hotByCluster.under_stub || 0;
                if (under >= Math.ceil(hotHits.length * 0.5)) {
                    tips.push('欠译短句较多：启发式可补一部分；其余进「宜重译」工单或需收窄手填。');
                }
                if ((clusterCounts.asr_garbage || 0) > 0) {
                    tips.push('含 ASR 脏句：请到「听写纠错」草案填写 JA from→to，勿写成中文 remap。');
                }
            }

            const harvest = harvestReport.buildHarvestReport({
                clusterCounts,
                allSamples,
                hits: hotHits,
                proposals: [],
                wizardMode: true,
            });
            tips.unshift(harvest.headline);

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
                    trainableHitCount: hits.length,
                    alignGapCount,
                },
                hotHits,
                allHotCount: hits.length,
                allSamples,
                diagnostics: {
                    clusterCounts,
                    hotByCluster,
                    tips,
                    maxHits,
                    alignGapCount,
                    trainableHitCount: hits.length,
                },
                harvest,
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/feed-pack') {
        const body = await readBody(req);
        try {
            const out = feedPack.buildFeedPack({
                title: body.title || '',
                jaPath: body.jaPath || '',
                zhPath: body.zhPath || '',
                harvest: body.harvest || null,
                scanSummary: body.scanSummary || {},
                tips: body.tips || body.diagnostics?.tips || [],
            });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/opposing-fixtures') {
        const body = await readBody(req);
        try {
            const proposals = Array.isArray(body.proposals) ? body.proposals : [];
            if (!proposals.length) {
                return sendJson(res, 400, { error: '请至少提供一条触及对立意图的规则草案' });
            }
            const out = opposingFixture.writeOpposingFixtureDraft(ROOT, {
                proposals,
                suiteName: body.suiteName || `训练向导对立夹具 ${body.title || ''}`.trim(),
                dryRun: body.dryRun !== false, // default preview; write when dryRun:false
            });
            if (!out.count) {
                return sendJson(res, 200, {
                    ...out,
                    ok: true,
                    hint: '所选规则未命中已声明的 strip↔remap 对立面；可仍写入 remap，或先在 intent-core 声明配对。',
                });
            }
            return sendJson(res, 200, { ok: true, ...out });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/wizard/learn') {
        const body = await readBody(req);
        try {
            const hits = Array.isArray(body.hits) ? body.hits : [];
            const clusterCounts = body.clusterCounts && typeof body.clusterCounts === 'object'
                ? body.clusterCounts
                : {};
            const allSamples = Array.isArray(body.allSamples) ? body.allSamples : [];

            let out = { proposals: [], mergeCount: 0 };
            if (hits.length) {
                const sanitize = getSanitize(true);
                let corpus = hits;
                if (body.crossMulti && Array.isArray(body.extraCorpus) && body.extraCorpus.length) {
                    corpus = [...hits, ...body.extraCorpus];
                }
                out = autoPropose.proposeFromHits(sanitize, hits, {
                    title: body.title || 'wizard',
                    max: body.max || hits.length,
                    expects: body.expects,
                    pinFinal: true,
                    corpus,
                });
            }
            const report = autoPropose.autoQuality.buildWizardReport(out.proposals || [], {
                wizardMode: true,
            });
            const harvest = harvestReport.buildHarvestReport({
                clusterCounts,
                allSamples,
                hits,
                proposals: out.proposals || [],
                wizardReport: report,
                wizardMode: true,
            });
            return sendJson(res, 200, {
                ok: true,
                ...out,
                report,
                harvest,
                hint: harvest.headline,
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
            const maxHitsPerPair = Number(body.maxHitsPerPair) > 0 ? Number(body.maxHitsPerPair) : 16;
            const allHits = [];
            const pairSummaries = [];
            const clusterCounts = {};
            const allSamples = [];

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
                    const name = String(c.cluster || '');
                    clusterCounts[name] = (clusterCounts[name] || 0) + (c.samples || []).length;
                    for (const s of (c.samples || []).slice(0, 2)) {
                        allSamples.push({ ...s, cluster: c.cluster, title });
                    }
                    if (name.startsWith('fixed:')) continue;
                    if (name === 'align_suspect' || name === 'align_gap' || name === 'moan_expand') continue;
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
                const harvestEmpty = harvestReport.buildHarvestReport({
                    clusterCounts,
                    allSamples,
                    hits: [],
                    proposals: [],
                    wizardMode: true,
                });
                return sendJson(res, 200, {
                    ok: true,
                    pairSummaries,
                    report: {
                        adopt: [], review: [], skip: [],
                        adoptCount: 0, reviewCount: 0, skipCount: 0, wholeFiltered: 0,
                    },
                    harvest: harvestEmpty,
                    hint: harvestEmpty.headline,
                });
            }

            const sanitize = getSanitize(true);
            const out = autoPropose.proposeFromHits(sanitize, allHits, {
                title: body.title || 'wizard-batch',
                max: body.max || Math.min(64, allHits.length),
                expects: body.expects,
                pinFinal: true,
                corpus: allHits,
            });
            const report = autoPropose.autoQuality.buildWizardReport(out.proposals || [], {
                wizardMode: true,
            });
            const harvest = harvestReport.buildHarvestReport({
                clusterCounts,
                allSamples,
                hits: allHits,
                proposals: out.proposals || [],
                wizardReport: report,
                wizardMode: true,
            });
            return sendJson(res, 200, {
                ok: true,
                ...out,
                pairSummaries,
                hitCount: allHits.length,
                report,
                harvest,
                hint: harvest.headline,
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
                rulesBoard: TRAIN_AUDIENCE !== 'pro',
                wizardTest: true,
                shipGate: TRAIN_AUDIENCE !== 'pro',
                conflictReport: TRAIN_AUDIENCE !== 'pro',
                loopReport: true,
                trainRoute: true,
                idleReport: TRAIN_AUDIENCE !== 'pro',
                idleWatch: TRAIN_AUDIENCE !== 'pro',
                crossCollateral: true,
                ruleLifecycle: true,
                historyPairs: true,
                wizardOnly: true,
                wizardDiagnostics: true,
                residualDirty: true,
                harvestReport: true,
                feedPack: true,
                asrSuggest: true,
                opposingFixtures: TRAIN_AUDIENCE !== 'pro',
                userSandbox: true,
                wizardUxSimplify: true,
                wizardAutoApply: true,
                wizardDoneState: true,
                forceSandbox: TRAIN_AUDIENCE === 'pro',
                proAudience: TRAIN_AUDIENCE === 'pro',
            },
            version: 24,
            audience: TRAIN_AUDIENCE,
            sandbox: sandbox.status(),
            clusterQueue: trainRoute.CLUSTER_QUEUE,
        });
    }

    if (req.method === 'GET' && url.pathname === '/api/train/sandbox') {
        return sendJson(res, 200, { ok: true, ...sandbox.status() });
    }

    if (req.method === 'POST' && url.pathname === '/api/train/sandbox') {
        const body = await readBody(req);
        try {
            if (body.rollback === true || body.action === 'rollback') {
                const out = sandbox.rollbackSandbox({ file: body.file });
                reloadSanitize();
                return sendJson(res, 200, { ok: true, ...out, status: sandbox.status() });
            }
            if (body.target === 'sandbox' || body.target === 'official') {
                if (TRAIN_AUDIENCE === 'pro' && body.target === 'official') {
                    return sendJson(res, 403, { error: 'Pro 仅可写入本机规则', code: 'force_sandbox' });
                }
                const prefs = sandbox.setWriteTarget(body.target);
                process.env.MT_TRAIN_TARGET = prefs.target;
                return sendJson(res, 200, { ok: true, prefs, status: sandbox.status() });
            }
            return sendJson(res, 400, { error: '需要 target 或 rollback' });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
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

            // Prefer multi-title corpus for lifecycle hit stats when requested
            let multi = null;
            if (body.crossTitles !== false) {
                try {
                    const titles = listPairedTitles(JA_ROOT, ZH_ROOT, {
                        limit: Math.min(16, Number(body.crossLimit) || 8),
                    });
                    multi = multiCorpus.buildMultiTitleCorpus(titles, scanPair, {
                        maxTitles: Number(body.crossLimit) || 8,
                        excludeCode: body.title || '',
                        reload: false,
                    });
                    if (multi.corpus.length) corpus = multi.corpus;
                } catch (_) { /* ignore */ }
            }

            const zhRows = (listed.zhRemaps || []).map((r) => ({ ...r, kind: 'zh' }));
            const asrRows = (listed.asrPairs || []).map((r) => ({ ...r, kind: 'asr' }));
            let combined = [...zhRows, ...asrRows];
            if (body.titleFilter) {
                combined = ruleLifecycle.filterRulesByTitle(combined, body.titleFilter);
            }
            const annotated = ruleLifecycle.annotateRules(combined, corpus, {
                persist: body.persistStats !== false,
            });

            const rules = annotated.rules.map((r) => {
                const payload = r.kind === 'asr' ? null : {
                    mode: r.mode === 'blank' ? 'blank' : 'replace',
                    zhFrom: r.zhFrom,
                    zhTo: r.zhTo,
                    jaAnchor: (r.jaIncludes || [])[0] || '',
                };
                const collateral = payload && corpus.length
                    ? autoQuality.estimateCollateral(payload, corpus, { targetJis: [] })
                    : null;
                const cross = payload && multi
                    ? multiCorpus.estimateCrossTitleCollateral(payload, multi)
                    : null;
                return {
                    ...r,
                    fragment: r.kind === 'asr'
                        ? `${r.from} → ${r.to}`
                        : (r.mode === 'blank'
                            ? '→ …'
                            : `「${r.zhFrom || ''}」→「${r.zhTo || ''}」`),
                    anchor: r.kind === 'asr' ? r.from : (r.jaIncludes || []).join(' + '),
                    stats: {
                        totalHits: r.lifecycle?.hitCount ?? collateral?.totalHits ?? 0,
                        extra: collateral?.extra ?? 0,
                        ratio: collateral?.ratio ?? 0,
                        risky: Boolean(collateral?.risky || cross?.risky),
                        stale: Boolean(r.lifecycle?.stale),
                        reason: r.lifecycle?.reason || '',
                        crossHits: cross?.totalHits ?? 0,
                        crossTitles: cross?.titlesHit ?? 0,
                    },
                };
            });
            return sendJson(res, 200, {
                ok: true,
                path: listed.path,
                corpusSize: corpus.length,
                crossTitleCount: multi?.titleCount || 0,
                staleCount: annotated.staleCount,
                staleIds: annotated.staleIds,
                rules,
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/disable-stale') {
        const body = await readBody(req);
        try {
            const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
            let targetIds = ids;
            if (!targetIds) {
                const board = await (async () => {
                    const listed = train.listRules();
                    const titles = listPairedTitles(JA_ROOT, ZH_ROOT, { limit: 8 });
                    const multi = multiCorpus.buildMultiTitleCorpus(titles, scanPair, {
                        maxTitles: 8,
                        reload: true,
                    });
                    const rows = [
                        ...(listed.zhRemaps || []).map((r) => ({ ...r, kind: 'zh' })),
                        ...(listed.asrPairs || []).map((r) => ({ ...r, kind: 'asr' })),
                    ];
                    return ruleLifecycle.annotateRules(rows, multi.corpus, { persist: true });
                })();
                targetIds = board.staleIds;
            }
            let disabled = 0;
            for (const id of targetIds || []) {
                try {
                    train.toggleRule(id, false);
                    disabled += 1;
                } catch (_) { /* ignore */ }
            }
            if (disabled) reloadSanitize();
            return sendJson(res, 200, { ok: true, disabled, ids: targetIds || [] });
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
            let closedLoop = null;
            const jaPath = guardPath(body.jaPath);
            const zhPath = guardPath(body.zhPath);
            if (jaPath && zhPath && fs.existsSync(jaPath) && fs.existsSync(zhPath)) {
                const beforeSnap = body.beforeScan
                    ? loopReport.snapshotFromScan(body.beforeScan)
                    : null;
                const scan = scanPair(jaPath, zhPath, { reload: false });
                scanSummary = {
                    liveHitCount: scan.liveHitCount,
                    softHitCount: scan.softHitCount,
                    changed: scan.changed,
                    liveClusterCounts: scan.summary?.liveClusterCounts || {},
                };
                if (beforeSnap) {
                    closedLoop = loopReport.buildLoopReport({
                        beforeScan: { ...beforeSnap, summary: { liveClusterCounts: beforeSnap.liveClusterCounts } },
                        afterScan: scan,
                        applied: [{ ji: body.ji, rule, payload: body }],
                        title: body.title || '',
                    });
                } else {
                    closedLoop = loopReport.buildLoopReport({
                        beforeScan: {
                            liveHitCount: Number(body.beforeLiveHitCount),
                            softHitCount: Number(body.beforeSoftHitCount) || 0,
                            summary: { liveClusterCounts: body.beforeLiveClusterCounts || {} },
                        },
                        afterScan: scan,
                        applied: [{ ji: body.ji, rule, payload: body }],
                        title: body.title || '',
                    });
                }
            }
            return sendJson(res, 200, {
                ok: true,
                rule,
                trial,
                scanSummary,
                loopReport: closedLoop,
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
            let crossMulti = null;
            if (body.crossTitles !== false) {
                try {
                    const titles = listPairedTitles(JA_ROOT, ZH_ROOT, {
                        limit: Math.min(16, Number(body.crossLimit) || 8),
                    });
                    crossMulti = multiCorpus.buildMultiTitleCorpus(titles, scanPair, {
                        maxTitles: Number(body.crossLimit) || 8,
                        excludeCode: body.title || '',
                        reload: false,
                    });
                } catch (_) { /* ignore */ }
            }
            const out = autoPropose.proposeFromHits(sanitize, hits, {
                title: body.title || '',
                max: body.max,
                expects: body.expects,
                pinFinal: body.pinFinal !== false,
                corpus: corpus || hits,
                cluster: body.cluster || undefined,
                clusterOnly: Boolean(body.cluster),
                crossMulti,
            });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/train/auto-apply') {
        const body = await readBody(req);
        try {
            const beforeScan = body.beforeScan || null;
            const out = autoPropose.applyProposals(body.proposals || [], {
                onlyReady: body.onlyReady !== false,
            });
            if (out.applied > 0) reloadSanitize();
            let closedLoop = null;
            const jaPath = guardPath(body.jaPath);
            const zhPath = guardPath(body.zhPath);
            if (out.applied > 0 && jaPath && zhPath && fs.existsSync(jaPath) && fs.existsSync(zhPath)) {
                const afterScan = scanPair(jaPath, zhPath, { reload: false });
                closedLoop = loopReport.buildLoopReport({
                    beforeScan: beforeScan || {
                        liveHitCount: Number(body.beforeLiveHitCount) || 0,
                        softHitCount: Number(body.beforeSoftHitCount) || 0,
                        summary: { liveClusterCounts: body.beforeLiveClusterCounts || {} },
                    },
                    afterScan,
                    applied: (out.rules || []).map((r) => ({
                        ji: r.ji,
                        rule: r.rule,
                        payload: body.proposals?.find((p) => String(p.ji) === String(r.ji))?.payload,
                    })),
                    title: body.title || '',
                });
            }
            return sendJson(res, 200, { ...out, loopReport: closedLoop });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/idle/run') {
        const body = await readBody(req);
        try {
            let titles = Array.isArray(body.titles) ? body.titles : null;
            if (!titles) {
                const lim = Math.min(24, Math.max(1, Number(body.maxTitles) || Number(body.limit) || 8));
                titles = listPairedTitles(JA_ROOT, ZH_ROOT, { limit: lim, q: body.q || '' });
            }
            const sanitize = getSanitize(true);
            const report = idleTrain.runIdlePass({
                titles,
                scanPair,
                proposeFromHits: autoPropose.proposeFromHits,
                sanitize,
                maxTitles: body.maxTitles || body.limit || 8,
                maxPerTitle: body.maxPerTitle || 8,
                cluster: body.cluster || undefined,
                label: body.label || 'idle-morning',
                contentProfile: body.contentProfile || 'av_soft',
            });
            return sendJson(res, 200, report);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'GET' && url.pathname === '/api/idle/report') {
        try {
            const name = url.searchParams.get('name') || 'latest';
            const report = idleTrain.loadReport(name);
            if (!report) return sendJson(res, 404, { error: '暂无空闲训练报告' });
            return sendJson(res, 200, report);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'GET' && url.pathname === '/api/idle/reports') {
        try {
            return sendJson(res, 200, { ok: true, reports: idleTrain.listReports({ limit: 20 }) });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/idle/adopt') {
        const body = await readBody(req);
        try {
            const report = body.report || idleTrain.loadReport(body.name || 'latest');
            if (!report) return sendJson(res, 404, { error: '报告不存在' });
            const marked = idleTrain.markAdopted(report, body.idleIds || []);
            const picked = (marked.proposals || []).filter((p) => p.accepted);
            if (!picked.length) {
                return sendJson(res, 400, { error: '未勾选可采纳项（默认仅「可直接写」）' });
            }
            const out = autoPropose.applyProposals(picked, { onlyReady: false });
            if (out.applied > 0) reloadSanitize();
            return sendJson(res, 200, {
                ok: true,
                ...out,
                hint: '已从早报写入。请打开相关片子对照查看闭环，再跑发库前检查。',
            });
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'GET' && url.pathname === '/api/history-pairs') {
        try {
            const maxPairs = Number(url.searchParams.get('maxPairs')) || 40;
            const out = historyPairs.listPairsFromTaskHistoryFile({
                jaRoot: JA_ROOT,
                maxPairs,
                findKept: (output, zhPath) => {
                    try {
                        const { findKeptTranscript } = require('../../electron/transcript-keep');
                        const { loadSettings } = require('../../electron/settings-data');
                        const kept = findKeptTranscript({
                            videoPath: String(output?.videoPath || '').trim(),
                            subPath: zhPath || '',
                            options: loadSettings()?.options || {},
                        });
                        return kept?.found ? kept.path : '';
                    } catch (_) {
                        return '';
                    }
                },
            });
            return sendJson(res, 200, out);
        } catch (err) {
            return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/history-pairs/open') {
        const body = await readBody(req);
        try {
            const listed = historyPairs.listPairsFromTaskHistoryFile({
                jaRoot: JA_ROOT,
                maxPairs: 80,
            });
            const id = String(body.id || '').trim();
            const pair = (listed.pairs || []).find((p) => p.id === id);
            if (!pair) return sendJson(res, 404, { error: '历史配对不存在或文件已缺失' });
            const jaOk = guardPath(pair.jaPath);
            const zhOk = guardPath(pair.zhPath);
            // Engine outputs may live outside JA/ZH roots — allow if files exist and under common drives
            const jaPath = jaOk || (fs.existsSync(pair.jaPath) ? path.resolve(pair.jaPath) : null);
            const zhPath = zhOk || (fs.existsSync(pair.zhPath) ? path.resolve(pair.zhPath) : null);
            if (!jaPath || !zhPath) {
                return sendJson(res, 400, { error: '字幕路径不可用', pair });
            }
            // Expand allow-list for this session's scan by returning paths; client scans via /api/scan
            // which still guards — so copy into wizard tmp if outside roots
            let jaUse = jaPath;
            let zhUse = zhPath;
            if (!jaOk || !zhOk) {
                const stamp = `hist_${Date.now().toString(36)}`;
                const dir = path.join(WIZARD_TMP, stamp);
                fs.mkdirSync(dir, { recursive: true });
                jaUse = path.join(dir, path.basename(jaPath));
                zhUse = path.join(dir, path.basename(zhPath));
                fs.copyFileSync(jaPath, jaUse);
                fs.copyFileSync(zhPath, zhUse);
            }
            return sendJson(res, 200, {
                ok: true,
                pair: { ...pair, jaPath: jaUse, zhPath: zhUse },
                jaPath: jaUse,
                zhPath: zhUse,
            });
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

    if (req.method === 'GET' && url.pathname === '/api/conflicts') {
        try {
            const report = shipGate.runConflictStep();
            return sendJson(res, report.ok ? 200 : 409, {
                ok: report.ok,
                summary: report.summary,
                report: report.report,
            });
        } catch (err) {
            return sendJson(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/ship-gate') {
        const body = await readBody(req).catch(() => ({}));
        const send = startSse(res);
        try {
            const result = await shipGate.runShipGate({
                skipMocha: Boolean(body?.skipMocha),
                onLog: (line) => send('log', { line }),
            });
            send('done', result);
        } catch (err) {
            send('log', { line: `ERROR: ${err && err.message ? err.message : err}` });
            send('done', { ok: false, blocked: true, summary: String(err && err.message ? err.message : err) });
        }
        res.end();
        return undefined;
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
        console.log(`Transub 学习向导 → ${href}`);
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

/** CLI overnight watcher (no Electron): once/day POST /api/idle/run (optional --idle-night). */
if (IDLE_WATCH) {
    const prefs = idleSchedule.defaultIdlePrefs();
    let lastRunAt = null;
    const pollMs = Math.max(2, prefs.pollMinutes || 5) * 60 * 1000;
    const nightOnly = process.argv.includes('--idle-night');
    console.log(`[idle-watch] enabled · every ${prefs.pollMinutes}m · nightOnly=${nightOnly} · never auto-writes`);
    setInterval(async () => {
        const gate = idleSchedule.shouldRunIdlePass({
            ...prefs,
            idleSeconds: 99999,
            lastRunAt,
            nightOnly,
            now: new Date(),
        });
        if (!gate.ok) return;
        try {
            const http = require('http');
            const body = JSON.stringify({
                maxTitles: prefs.maxTitles,
                maxPerTitle: prefs.maxPerTitle,
                label: 'cli-idle-watch',
            });
            await new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: PORT,
                    path: '/api/idle/run',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                    },
                    timeout: 900000,
                }, (res) => {
                    let raw = '';
                    res.on('data', (c) => { raw += c; });
                    res.on('end', () => {
                        try {
                            const data = JSON.parse(raw || '{}');
                            lastRunAt = new Date().toISOString();
                            console.log(`[idle-watch] report ${data.id || '?'} auto=${data.confidence?.auto} review=${data.confidence?.review}`);
                        } catch (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });
        } catch (err) {
            console.warn('[idle-watch] failed:', err.message || err);
        }
    }, pollMs);
}
