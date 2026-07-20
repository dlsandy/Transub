(function (global) {
    const STRINGS = {
        zh: {
            title: 'Transub 字幕生成',
            params: '当前设置',
            paramsSettings: '设置',
            addVideos: '添加视频',
            addFolder: '添加文件夹',
            start: '开始生成',
            stop: '停止',
            idle: '空闲',
            langBtn: '中文',
        },
        en: {
            title: 'Transub Subtitles',
            params: 'Subtitle params',
            paramsSettings: 'Settings',
            addVideos: 'Add videos',
            addFolder: 'Add folder',
            start: 'Start',
            stop: 'Stop',
            idle: 'Idle',
        },
    };

    let locale = localStorage.getItem('transub-locale') || 'zh';

    function t(key) {
        return STRINGS[locale]?.[key] || STRINGS.zh[key] || key;
    }

    function applyLocale() {
        document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
        const map = [
            ['h1', null, 'title'],
            ['#openParamsBtn', null, 'paramsSettings'],
            ['#addVideosBtn', 'firstChild', 'addVideos'],
            ['#addFolderBtn', 'lastChild', 'addFolder'],
            ['#startBtn', 'lastChild', 'start'],
            ['#stopBtn', 'lastChild', 'stop'],
        ];
        map.forEach(([sel, , key]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const text = t(key);
            if (sel === 'h1') {
                el.innerHTML = `<i class="fa fa-closed-captioning text-violet-600 mr-2"></i>${text}`;
            } else if (sel === '#openParamsBtn') {
                el.innerHTML = `<i class="fa fa-cog mr-1"></i>${text}`;
            } else {
                el.lastChild && (el.lastChild.textContent = ` ${text}`);
            }
        });
    }

    function toggleLocale() {
        locale = locale === 'zh' ? 'en' : 'zh';
        localStorage.setItem('transub-locale', locale);
        applyLocale();
    }

    global.TransubI18n = { t, applyLocale, toggleLocale, getLocale: () => locale };
}(window));
