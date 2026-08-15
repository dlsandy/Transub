/**
 * Manual Hub / GGUF download eligibility and dialog copy (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineManualDownload = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineManualDownloadFactory() {
    const DEFAULT_DEMUCS_ID = 'demucs';

    function isManagedLlmDownloadId(modelId, source = '', deps = {}) {
        const demucsId = String(deps.demucsModelId || DEFAULT_DEMUCS_ID);
        const isSakura = deps.isSakuraMtModelId || (() => false);
        const findManaged = deps.findManagedLlmCatalogEntry || (() => null);
        const id = String(modelId || '').trim();
        if (!id || id === demucsId) return false;
        if (source === 'managed') return true;
        if (isSakura(id)) return false;
        return !!findManaged(id);
    }

    /** Hub ASR/MT/VAD models that can be placed manually under engine models/. */
    function canManualEngineHubDownload(item, deps = {}) {
        const demucsId = String(deps.demucsModelId || DEFAULT_DEMUCS_ID);
        if (!item || typeof item !== 'object') return false;
        const id = String(item.id || '').trim();
        if (!id || id === demucsId || /^demucs$/i.test(id)) return false;
        if (item.group === 'separate' || item.group === 'llm') return false;
        if (item.source === 'managed' || item.source === 'sakura') return false;
        if (isManagedLlmDownloadId(id, item.source, deps)) return false;
        if (id === 'silero-vad') return false;
        if (item.shipped && !item.hubId) return false;
        if (item.hubId) return true;
        return item.group === 'asr' || item.group === 'mt' || item.group === 'vad';
    }

    function buildManualHubModelHint(info = {}) {
        const name = String(info.name || info.modelId || info.id || '模型').trim();
        const hubId = String(info.hubId || '').trim();
        const mirrorUrl = String(info.mirrorUrl || info.defaultUrl || '').trim();
        const officialUrl = String(info.officialUrl || '').trim();
        const folder = String(info.localDir || info.folder || '').trim();
        const sizeHint = String(info.sizeHint || '').trim();
        const weightFile = String(info.weightFile || '').trim();
        const placeSteps = String(info.placeSteps || '').trim();
        const sizeLine = sizeHint ? `\n体积约 ${sizeHint}。` : '';
        const urlLines = [
            mirrorUrl ? `镜像下载页：\n${mirrorUrl}` : '',
            officialUrl && officialUrl !== mirrorUrl ? `官方仓库：\n${officialUrl}` : '',
            !mirrorUrl && !officialUrl && hubId ? `Hub：${hubId}` : '',
        ].filter(Boolean).join('\n\n');
        const steps = placeSteps || [
            '在打开的仓库页下载全部文件',
            '将文件直接放入下方目录（不要再套一层同名文件夹）',
            weightFile ? `确认关键权重「${weightFile}」为完整文件` : '确认权重文件完整（非 LFS 指针）',
        ].join('\n');
        return (
            `将在浏览器打开「${name}」的模型仓库。${sizeLine}\n\n`
            + (urlLines ? `${urlLines}\n\n` : '')
            + `${steps}\n\n`
            + `放置目录：\n${folder || '（引擎目录）/models/{asr|mt|vad}/<模型名>'}`
        );
    }

    function classifyManualKindsForModelIds(modelIds, demucsModelId = DEFAULT_DEMUCS_ID) {
        const demucsId = String(demucsModelId || DEFAULT_DEMUCS_ID);
        const ids = (Array.isArray(modelIds) ? modelIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        const kinds = [];
        const hubIds = [];
        for (const id of ids) {
            if (id === demucsId || /^demucs$/i.test(id)) {
                kinds.push('demucs');
                continue;
            }
            if (/sensevoice/i.test(id)) {
                kinds.push('sensevoice');
                hubIds.push(id);
                continue;
            }
            if (/^whisper/i.test(id)) {
                kinds.push('whisper');
                hubIds.push(id);
                continue;
            }
            hubIds.push(id);
        }
        return {
            kinds: [...new Set(kinds)],
            hubIds: [...new Set(hubIds)],
        };
    }

    function buildManualGgufHint(info = {}) {
        const name = String(info.name || info.modelId || '模型').trim();
        const fileName = String(info.fileName || '').trim();
        const folder = String(info.folder || '').trim();
        const sizeHint = String(info.sizeHint || '').trim();
        const sizeLine = sizeHint ? `\n体积约 ${sizeHint}。` : '';
        return (
            `将在浏览器打开「${name}」的 GGUF 下载链接。${sizeLine}\n\n`
            + `下载完成后，请将文件保存为：\n${fileName || '（见模型卡片）'}\n\n`
            + `并放到以下目录（文件名需完全一致）：\n${folder || '（软件目录）/advanced-llm/models'}`
        );
    }

    return {
        isManagedLlmDownloadId,
        canManualEngineHubDownload,
        buildManualHubModelHint,
        classifyManualKindsForModelIds,
        buildManualGgufHint,
    };
}));
