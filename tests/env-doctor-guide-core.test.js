const assert = require('node:assert/strict');
const Guide = require('../src/js/env-doctor-guide-core.js');

describe('env-doctor-guide-core', () => {
    it('maps technical ids to beginner labels', () => {
        assert.equal(Guide.friendlyLabel('gpuRuntime'), '显卡加速组件');
        assert.equal(Guide.friendlyLabel('torchEngineStartup'), '显卡计算库');
        assert.equal(Guide.friendlyLabel('vcRedist'), '系统运行库');
        assert.equal(Guide.friendlyLabel('unknown', '自定义'), '自定义');
    });

    it('guides pass state to enter software in doctor mode', () => {
        const items = [
            'installPath', 'ffmpeg', 'vcRedist', 'gpu', 'gpuRuntime',
            'engine', 'llamaServerRuntime', 'torchEngineStartup',
        ].map((id) => ({ id, status: 'ok', label: id }));
        const guide = Guide.buildBeginnerGuide(
            { items, fix: { fixable: false }, versionGatePassed: true },
            { doctorMode: true },
        );
        assert.equal(guide.tone, 'ok');
        assert.equal(guide.primaryAction, 'enter');
        assert.match(guide.nextStep, /进入软件/);
        assert.equal(Guide.doctorPrimaryButtonLabel(guide), '进入软件');
    });

    it('guides NVIDIA fixable runtime to one-click fix', () => {
        const guide = Guide.buildBeginnerGuide({
            items: [
                { id: 'gpu', status: 'ok', vendor: 'nvidia', detail: 'RTX 4070' },
                {
                    id: 'gpuRuntime',
                    status: 'fail',
                    detail: '未找到 cublas64_12.dll',
                },
            ],
            fix: { fixable: true, ensureGpu: true },
            versionGatePassed: false,
        }, { doctorMode: true });
        assert.equal(guide.tone, 'warn');
        assert.equal(guide.primaryAction, 'fix');
        assert.match(guide.nextStep, /一键修复/);
        assert.match(guide.tip, /CUDA|加速/);
        assert.equal(Guide.resolveVendor({
            items: [{ id: 'gpu', vendor: 'nvidia', status: 'ok' }],
        }), 'nvidia');
    });

    it('guides AMD fixable runtime to ROCm tip without CUDA wording pressure', () => {
        const guide = Guide.buildBeginnerGuide({
            items: [
                { id: 'gpu', status: 'ok', vendor: 'amd', detail: 'Radeon' },
                {
                    id: 'gpuRuntime',
                    status: 'fail',
                    vendor: 'amd',
                    hasRocm: true,
                    torchRocm: false,
                    detail: '缺少 ROCm PyTorch',
                },
            ],
            fix: { fixable: true, ensureTorchRocm: true },
            versionGatePassed: false,
        }, { doctorMode: true });
        assert.equal(guide.primaryAction, 'fix');
        assert.match(guide.tip, /AMD|ROCm/);
        assert.match(guide.tip, /ROCm/);
        assert.doesNotMatch(guide.tip, /NVIDIA\/CUDA/);
    });

    it('guides Intel Arc fixable runtime to XPU + SYCL tip', () => {
        const guide = Guide.buildBeginnerGuide({
            items: [
                { id: 'gpu', status: 'ok', vendor: 'intel', detail: 'Intel Arc A770' },
                {
                    id: 'gpuRuntime',
                    status: 'warn',
                    vendor: 'intel',
                    detail: 'Intel Arc · 缺少 XPU PyTorch',
                },
                {
                    id: 'llamaServerRuntime',
                    status: 'warn',
                    detail: '未安装 · 建议安装 Windows x64 · SYCL',
                },
            ],
            fix: { fixable: true, ensureTorchXpu: true, ensureLlamaRuntime: true },
            versionGatePassed: false,
        }, { doctorMode: true });
        assert.equal(guide.primaryAction, 'fix');
        assert.equal(guide.vendor, 'intel');
        assert.match(guide.tip, /Intel Arc/);
        assert.match(guide.tip, /XPU/);
        assert.match(guide.tip, /SYCL/);
        assert.equal(Guide.driverUrlForVendor('intel'), Guide.INTEL_DRIVER_URL);
    });

    it('guides missing discrete GPU to driver download', () => {
        const guide = Guide.buildBeginnerGuide({
            items: [
                {
                    id: 'gpu',
                    status: 'fail',
                    requireDiscreteGpu: true,
                    detail: '未检测到可用独立 GPU',
                },
                {
                    id: 'gpuRuntime',
                    status: 'fail',
                    requireDiscreteGpu: true,
                    detail: '不能以 CPU 模式继续',
                },
            ],
            fix: { fixable: false, manualHints: [{ id: 'gpu', label: 'GPU' }] },
            versionGatePassed: false,
        }, { doctorMode: true });
        assert.equal(guide.tone, 'err');
        assert.equal(guide.primaryAction, 'driver');
        assert.ok(guide.driverUrl);
        assert.match(guide.nextStep, /驱动/);
    });

    it('decorateItemsForBeginners rewrites labels', () => {
        const out = Guide.decorateItemsForBeginners([
            { id: 'gpuRuntime', label: 'GPU 运行时', status: 'fail' },
        ]);
        assert.equal(out[0].label, '显卡加速组件');
        assert.equal(out[0].status, 'fail');
    });
});
