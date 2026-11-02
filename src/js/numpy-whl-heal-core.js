/**
 * Detect broken / out-of-pin NumPy installs and build manual .whl heal hints.
 * Shared by env-check (main + renderer) and manual-whl-install.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TransubNumpyWhlHeal = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** Pinned wheel used by engine known-wheel catalog (must stay <2.5). */
    const NUMPY_MANUAL_WHEEL = {
        id: 'numpy',
        fileName: 'numpy-2.4.6-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
    };

    function isNumpyPinOrDllError(text) {
        const t = String(text || '');
        if (!t) return false;
        return /_multiarray_umath|不是有效的\s*Win32|not a valid Win32|winerror\s*193|NUMPY_DLL|numpy[^.\d]{0,40}2\.5|超出\s*Numba|超出兼容上限|Unable to compare versions for numpy|numpy.*元数据|found=none.*numpy|numpy.*DLL load failed|DLL load failed.*numpy/i.test(t);
    }

    function numpyManualPackage() {
        return { ...NUMPY_MANUAL_WHEEL };
    }

    /**
     * Rewrite auto-install failure text into next-step guidance for local .whl.
     * @param {string} [errorText]
     * @returns {string}
     */
    function formatNumpyManualHealHint(errorText) {
        const pkg = NUMPY_MANUAL_WHEEL;
        const lines = [
            'NumPy 安装损坏或版本过高（需要 <2.5，推荐 2.4.6）。',
            '请完全退出 Transub（含托盘）后，用浏览器下载下方 .whl，再在「手动修复」里选择本地文件安装：',
            `文件名：${pkg.fileName}`,
            `官方：${pkg.officialUrl}`,
            `阿里云：${pkg.mirrorUrl}`,
            '勿安装 2.5.x，勿使用 win32 / 非 cp312 包。',
        ];
        const raw = String(errorText || '').trim();
        if (raw && !isNumpyPinOrDllError(raw)) {
            return raw.slice(0, 280);
        }
        if (raw && /numpy\s*[:=]?\s*[\d.]+/i.test(raw)) {
            const ver = (raw.match(/numpy[^0-9]{0,12}([\d.]+)/i) || [])[1];
            if (ver) lines.unshift(`当前检测到 NumPy ${ver}。`);
        }
        return lines.join('\n');
    }

    /** Short status-line detail for env-check items. */
    function numpyBrokenEnvDetail(errorText) {
        const pkg = NUMPY_MANUAL_WHEEL;
        const base = String(errorText || '').trim();
        if (base && /手动修复|2\.4\.6/.test(base) && base.length < 220) return base;
        return (
            'numpy 损坏或 ≥2.5（DLL/Win32 或超出 Numba 上限）；一键修复会强制重装 2.4.6；'
            + `失败请「手动修复」安装 ${pkg.fileName}`
        );
    }

    return {
        NUMPY_MANUAL_WHEEL,
        isNumpyPinOrDllError,
        numpyManualPackage,
        formatNumpyManualHealHint,
        numpyBrokenEnvDetail,
    };
}));
