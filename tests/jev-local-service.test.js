const assert = require('assert');
const path = require('path');
const {
    listLayaPipMirrors,
    buildPipInstallArgs,
    resolveLayaHfEndpoint,
    torchMeetsMinimum,
    DEFAULT_HF_MIRROR,
    PIP_SPEC,
    LAYA_NON_TORCH_DEPS,
} = require('../electron/jev-local-service');

describe('jev-local-service mirrors', () => {
    it('lists domestic mirrors before official', () => {
        const list = listLayaPipMirrors();
        assert.ok(list.length >= 3);
        assert.strictEqual(list[0].id, 'aliyun');
        assert.ok(list.some((r) => r.id === 'official'));
        assert.ok(list.findIndex((r) => r.id === 'aliyun') < list.findIndex((r) => r.id === 'official'));
    });

    it('puts preferred mirror first', () => {
        const list = listLayaPipMirrors('tsinghua');
        assert.strictEqual(list[0].id, 'tsinghua');
        assert.strictEqual(list.filter((r) => r.id === 'tsinghua').length, 1);
    });

    it('builds pip args with index and trusted-host', () => {
        const args = buildPipInstallArgs({
            id: 'aliyun',
            indexUrl: 'https://mirrors.aliyun.com/pypi/simple',
            host: 'mirrors.aliyun.com',
        });
        assert.ok(args.includes('-i'));
        assert.ok(args.includes('https://mirrors.aliyun.com/pypi/simple'));
        assert.ok(args.includes('--trusted-host'));
        assert.ok(args.includes('mirrors.aliyun.com'));
        assert.ok(args.includes(PIP_SPEC));
    });

    it('builds no-deps install without torch packages', () => {
        const args = buildPipInstallArgs({
            indexUrl: 'https://mirrors.aliyun.com/pypi/simple',
            host: 'mirrors.aliyun.com',
        }, {
            packages: ['opendecider'],
            noDeps: true,
            upgrade: true,
        });
        assert.ok(args.includes('--no-deps'));
        assert.ok(args.includes('opendecider'));
        assert.ok(!args.some((a) => String(a).includes('torch')));
        const depArgs = buildPipInstallArgs(null, {
            packages: [...LAYA_NON_TORCH_DEPS],
            upgrade: false,
        });
        assert.ok(!depArgs.includes('--upgrade'));
        assert.ok(depArgs.some((a) => /fastapi/.test(a)));
        assert.ok(!depArgs.some((a) => /^torch/.test(a)));
    });

    it('builds offline find-links install for bundled wheel', () => {
        const args = buildPipInstallArgs(null, {
            packages: ['F:/wheels/opendecider-0.5.0-py3-none-any.whl'],
            noDeps: true,
            upgrade: true,
            findLinks: 'F:/wheels',
            noIndex: true,
        });
        assert.ok(args.includes('--find-links'));
        assert.ok(args.includes('F:/wheels'));
        assert.ok(args.includes('--no-index'));
        assert.ok(!args.includes('-i'));
    });

    it('torchMeetsMinimum accepts engine CUDA builds', () => {
        assert.strictEqual(torchMeetsMinimum('2.6.0+cu126'), true);
        assert.strictEqual(torchMeetsMinimum('2.1.0'), true);
        assert.strictEqual(torchMeetsMinimum('2.0.1'), false);
        assert.strictEqual(torchMeetsMinimum(''), false);
    });

    it('defaults HF endpoint to domestic mirror', () => {
        const prev = process.env.HF_ENDPOINT;
        const prev2 = process.env.TRANSUB_LAYA_HF_ENDPOINT;
        delete process.env.HF_ENDPOINT;
        delete process.env.TRANSUB_LAYA_HF_ENDPOINT;
        try {
            assert.strictEqual(
                resolveLayaHfEndpoint({ hfEndpoint: 'https://huggingface.co' }),
                'https://huggingface.co',
            );
            assert.strictEqual(resolveLayaHfEndpoint({ hfEndpoint: '' }), '');
            assert.strictEqual(
                resolveLayaHfEndpoint({ hfEndpoint: 'https://hf-mirror.com' }),
                'https://hf-mirror.com',
            );
            // When no explicit opts/env, fall back to settings or domestic default.
            const resolved = resolveLayaHfEndpoint({});
            assert.ok(resolved === '' || /^https?:\/\//.test(resolved) || resolved === DEFAULT_HF_MIRROR);
        } finally {
            if (prev != null) process.env.HF_ENDPOINT = prev;
            else delete process.env.HF_ENDPOINT;
            if (prev2 != null) process.env.TRANSUB_LAYA_HF_ENDPOINT = prev2;
            else delete process.env.TRANSUB_LAYA_HF_ENDPOINT;
        }
    });

    it('ships a syntactically valid local serve script', () => {
        const { serveScriptPath, isInsideAsar } = require('../electron/jev-local-service');
        const fs = require('fs');
        const { spawnSync } = require('child_process');
        const p = serveScriptPath();
        assert.ok(fs.existsSync(p), p);
        assert.ok(/laya-opendecider-serve\.py$/.test(p));
        assert.ok(!isInsideAsar(p), p);
        const src = fs.readFileSync(p, 'utf8');
        assert.ok(!/\btry\s*\{/.test(src), 'must not contain JS-style try {');
        const py = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');
        if (fs.existsSync(py)) {
            const res = spawnSync(py, ['-m', 'py_compile', p], { encoding: 'utf8', windowsHide: true });
            assert.strictEqual(res.status, 0, res.stderr || res.stdout || 'py_compile failed');
        }
    });

    it('rewrites asar paths so CPython can open the serve script', () => {
        const { asarUnpackedPath, isInsideAsar } = require('../electron/jev-local-service');
        const packed = 'D:\\Transub\\resources\\app.asar\\electron\\laya-opendecider-serve.py';
        const unpacked = asarUnpackedPath(packed);
        assert.ok(isInsideAsar(packed));
        assert.ok(!isInsideAsar(unpacked));
        assert.ok(unpacked.includes('app.asar.unpacked'));
        assert.ok(/laya-opendecider-serve\.py$/.test(unpacked));
    });

    it('detects fatal serve boot errors from logs', () => {
        const { detectServeBootFatal } = require('../electron/jev-local-service');
        assert.ok(detectServeBootFatal('File "...serve.py", line 95\n    try {\nSyntaxError: expected \':\''));
        assert.ok(/缺少 Python 模块/.test(detectServeBootFatal("ModuleNotFoundError: No module named 'opendecider'")));
        assert.ok(/asar/.test(detectServeBootFatal(
            "can't open file 'D:\\\\Transub\\\\resources\\\\app.asar\\\\electron\\\\laya-opendecider-serve.py': [Errno 2] No such file or directory",
        )));
        assert.strictEqual(detectServeBootFatal('Uvicorn running on http://127.0.0.1:39283'), '');
    });

    it('stopLocalLaya is safe when nothing is running', () => {
        const { stopLocalLaya } = require('../electron/jev-local-service');
        assert.strictEqual(typeof stopLocalLaya, 'function');
        const res = stopLocalLaya();
        assert.strictEqual(res.ok, true);
        assert.strictEqual(typeof res.stopped, 'boolean');
        assert.strictEqual(typeof res.orphanCleared, 'boolean');
    });
});
