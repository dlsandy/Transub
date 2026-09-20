/**
 * Glossary import helpers (AniList ID parse, bad-pool merge hints).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleGlossaryImport = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleGlossaryImportFactory() {
    function parseAnilistMediaId(raw) {
        const s = String(raw || '').trim();
        if (!s) return null;
        if (/^\d+$/.test(s)) {
            const n = Number(s);
            return Number.isFinite(n) && n > 0 ? n : null;
        }
        const urlMatch = /anilist\.co\/anime\/(\d+)/i.exec(s)
            || /anilist\.co\/manga\/(\d+)/i.exec(s);
        if (urlMatch) {
            const n = Number(urlMatch[1]);
            return Number.isFinite(n) && n > 0 ? n : null;
        }
        return null;
    }

    function detectAnilistMediaType(raw) {
        const s = String(raw || '').trim();
        if (/anilist\.co\/manga\//i.test(s)) return 'MANGA';
        return 'ANIME';
    }

    const ANILIST_HOME_URL = 'https://anilist.co';
    const ANILIST_SEARCH_URL = 'https://anilist.co/search/anime';

    /** User-facing copy for editor modal / help (AniList = public anime database site). */
    function getAnilistImportGuide() {
        return {
            title: '从动漫资料库导入角色名',
            intro: 'AniList（anilist.co）是公开的动漫 / 漫画资料站。Transub 会拉取角色名：标准写法优先用**中文译名**（Bangumi 或日文名 OpenCC 简化），日文/英文/罗马音写入别名；ASR 转写时 aliases 仍作专名提示。MT 扫描会统一到中文字面。',
            steps: [
                '在浏览器打开 anilist.co，搜索你的番剧名（例如「命运石之门」）。',
                '进入作品页，复制地址栏链接（如 https://anilist.co/anime/9253/），或记下链接中的数字 ID（上例为 9253）。',
                '回到此处，粘贴链接或 ID，点「开始导入」。',
            ],
            inputLabel: '作品链接或 ID',
            inputPlaceholder: '9253 或 https://anilist.co/anime/9253/',
            openSiteLabel: '打开 AniList 搜索番剧',
            submitLabel: '开始导入',
            note: '纯英文且无日文别名的角色会跳过。需在主界面开启「术语表写入 ASR 提示」（默认已开）。anime-whisper 主模型可能忽略 prompt。',
        };
    }

    function buildAnilistImportPromptMessage() {
        const g = getAnilistImportGuide();
        return [
            g.title,
            '',
            '① 打开 anilist.co 搜索番剧',
            '② 复制作品页链接或链接里的数字 ID',
            '③ 粘贴到下方',
            '',
            `例：9253 或 ${ANILIST_HOME_URL}/anime/9253/`,
        ].join('\n');
    }

    function formatAnilistImportMessage(result) {
        if (!result?.ok) return result?.error || '导入失败';
        const title = result.title ? `《${result.title}》` : '';
        const count = Number(result.entryCount) || 0;
        const bgm = result.bangumiSubjectName ? ` · Bangumi：${result.bangumiSubjectName}` : '';
        return `已从动漫资料库导入 ${count} 条角色名（中文标准写法）${title ? ` · ${title}` : ''}${bgm}`;
    }

    function formatBadPoolImportMessage(result) {
        if (!result?.ok) return result?.error || '导入失败';
        const count = Number(result.entryCount) || 0;
        if (!count) return '坏句池暂无待确认条目（ja_wrong → ja_right）';
        return `已从坏句池导入 ${count} 条 ASR 修正条目`;
    }

    return {
        parseAnilistMediaId,
        detectAnilistMediaType,
        formatAnilistImportMessage,
        formatBadPoolImportMessage,
        ANILIST_HOME_URL,
        ANILIST_SEARCH_URL,
        getAnilistImportGuide,
        buildAnilistImportPromptMessage,
    };
}));
