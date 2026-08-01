(function () {
    'use strict';

    const api = globalThis.__UPDATE_PROGRESS__;

    const PHASE_LABELS = {
        waiting: '等待退出',
        preparing: '准备安装',
        preserving: '保留数据',
        copying: '替换文件',
        restoring: '恢复数据',
        relaunching: '重新启动',
        done: '完成',
        error: '失败',
        working: '进行中',
    };

    function applyStatus(status = {}) {
        const phase = String(status.phase || 'working');
        const message = String(status.message || '正在升级…');
        const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
        const msgEl = document.getElementById('msg');
        const phaseEl = document.getElementById('phaseLabel');
        const pctEl = document.getElementById('pct');
        const fillEl = document.getElementById('fill');
        if (msgEl) {
            msgEl.textContent = message;
            msgEl.classList.toggle('is-err', phase === 'error');
            msgEl.classList.toggle('is-ok', phase === 'done');
        }
        if (phaseEl) phaseEl.textContent = PHASE_LABELS[phase] || '进行中';
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (fillEl) fillEl.style.width = `${percent}%`;
    }

    async function init() {
        try {
            const first = await api?.getStatus?.();
            if (first) applyStatus(first);
        } catch { /* ignore */ }
        api?.onStatus?.(applyStatus);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
}());
