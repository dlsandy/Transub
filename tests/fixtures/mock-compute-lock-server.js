const http = require('http');
const prefer = Number(process.argv[2] || 0);
let token = '';
const s = http.createServer((q, r) => {
    const chunks = [];
    q.on('data', (c) => chunks.push(c));
    q.on('end', () => {
        r.setHeader('Content-Type', 'application/json');
        if (q.url.startsWith('/v1/compute/acquire')) {
            if (token) {
                r.statusCode = 409;
                r.end(JSON.stringify({
                    ok: false,
                    code: 'compute_busy',
                    error: 'busy',
                    holder: { kind: 'engine_batch', label: '引擎字幕任务' },
                }));
                return;
            }
            token = 'tok-1';
            r.end(JSON.stringify({
                ok: true,
                token,
                kind: 'engine_batch',
                owner: 'A',
                since: Date.now(),
                via: 'engine',
            }));
            return;
        }
        if (q.url.startsWith('/v1/compute/status')) {
            r.end(JSON.stringify({
                ok: true,
                busy: !!token,
                kind: token ? 'engine_batch' : undefined,
                via: 'engine',
            }));
            return;
        }
        if (q.url.startsWith('/v1/compute/release') || q.url.startsWith('/v1/compute/force-release')) {
            token = '';
            r.end(JSON.stringify({ ok: true, released: true, via: 'engine' }));
            return;
        }
        r.statusCode = 404;
        r.end(JSON.stringify({ ok: false }));
    });
});
s.listen(prefer > 0 ? prefer : 0, '127.0.0.1', () => {
    const addr = s.address();
    const port = typeof addr === 'object' && addr ? addr.port : prefer;
    process.stdout.write(`ready ${port}\n`);
});
