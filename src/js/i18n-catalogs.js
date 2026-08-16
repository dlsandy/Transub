/**
 * Embedded UI catalogs (generated — do not edit by hand).
 * Source: shared/i18n/catalog/*.json
 * Regenerate: node tools/sync-i18n-catalogs.js
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubI18nCatalogs = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function i18nCatalogsFactory() {
    const CATALOGS = {
    "zh-Hans": {
        "app.name": "Transub 字幕生成",
        "settings.startupAppearance.title": "启动与界面",
        "settings.uiLocale.label": "界面语言",
        "settings.uiLocale.tip": "软件界面显示语言。与「中文字幕类型」无关；字幕简繁请在任务或目标语言中单独设置。切换后界面文案会即时转换。",
        "settings.uiLocale.zhHans": "简体中文",
        "settings.uiLocale.zhHantTW": "繁体中文"
    },
    "zh-Hant-TW": {
        "app.name": "Transub 字幕生成",
        "settings.startupAppearance.title": "啟動與介面",
        "settings.uiLocale.label": "介面語言",
        "settings.uiLocale.tip": "軟體介面顯示語言。與「中文字幕類型」無關；字幕簡繁請在任務或目標語言中單獨設定。切換後介面文案會即時轉換（繁體以 OpenCC 台灣用詞為主，可於詞條表覆寫）。",
        "settings.uiLocale.zhHans": "簡體中文",
        "settings.uiLocale.zhHantTW": "繁體中文",
        "phrase.视频": "影片",
        "phrase.默认": "預設",
        "phrase.文件夹": "資料夾",
        "phrase.信息": "訊息",
        "phrase.质量": "品質",
        "phrase.内存": "記憶體",
        "phrase.缓存": "快取",
        "phrase.粘贴": "貼上",
        "phrase.复制": "複製",
        "phrase.文件": "檔案",
        "phrase.计算机": "電腦",
        "phrase.网络": "網路",
        "phrase.打印机": "印表機",
        "phrase.短信": "簡訊",
        "phrase.服务器": "伺服器",
        "phrase.屏幕": "螢幕",
        "phrase.分辨率": "解析度",
        "phrase.兼容": "相容",
        "phrase.异步": "非同步",
        "phrase.数据": "資料",
        "phrase.数据库": "資料庫"
    }
};

    function getCatalogs() {
        return CATALOGS;
    }

    function getCatalog(locale) {
        return CATALOGS[locale] || null;
    }

    /** Prefer disk JSON in Node (dev / Electron); fall back to embed. */
    function loadCatalogsFromDisk() {
        if (typeof require === 'undefined') return CATALOGS;
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = path.join(__dirname, '..', '..', 'shared', 'i18n', 'catalog');
            const out = { ...CATALOGS };
            for (const locale of Object.keys(CATALOGS)) {
                const file = path.join(dir, locale + '.json');
                if (fs.existsSync(file)) {
                    out[locale] = JSON.parse(fs.readFileSync(file, 'utf8'));
                }
            }
            return out;
        } catch {
            return CATALOGS;
        }
    }

    return {
        CATALOGS,
        getCatalogs,
        getCatalog,
        loadCatalogsFromDisk,
    };
}));
