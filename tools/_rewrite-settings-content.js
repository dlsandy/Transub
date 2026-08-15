'use strict';
const fs = require('fs');
const html = fs.readFileSync('F:/Transub/src/index.html', 'utf8');
const start = html.indexOf('<div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 settings-content" id="settingsContent">');
const end = html.indexOf('<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/80 shrink-0">');
if (start < 0 || end < 0) {
    console.error('markers', start, end);
    process.exit(1);
}

function tip(label, aria, text, extra = '') {
    return `<span class="settings-label text-gray-700 font-medium">${label}<button type="button" class="settings-tip${extra ? ` ${extra}` : ''}" aria-label="${aria}" aria-expanded="false">?<span class="settings-tip-bubble">${text}</span></button></span>`;
}

const content = `
                    <div class="params-tab-panel active space-y-4" data-tab-panel="runtime" data-settings-search="常规 任务 翻译 界面 密度 向导 增强">
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">任务默认</legend>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label class="block text-sm">
                                    ${tip('默认任务类型', '默认任务类型说明', '翻译：只出中文。原语言：保留听写原文。双语：同时生成原文轨与中文轨。')}
                                    <select id="taskSelect" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                                        <option value="translate">翻译</option>
                                        <option value="transcribe">原语言</option>
                                        <option value="dual">双语</option>
                                    </select>
                                </label>
                                <label class="block text-sm">
                                    ${tip('默认片源语言', '片源语言说明', '已知语种时锁定可减少误检。')}
                                    <select id="languageSelect" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                                        <option value="auto">自动检测</option>
                                        <option value="ja">日语 (ja)</option>
                                        <option value="zh">中文 (zh)</option>
                                        <option value="en">英语 (en)</option>
                                        <option value="ko">韩语 (ko)</option>
                                        <option value="yue">粤语 (yue)</option>
                                    </select>
                                </label>
                            </div>
                        </fieldset>
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3" id="translateModeFieldset">
                            <legend class="text-xs font-semibold text-gray-500 px-1">
                                翻译方式
                                <button type="button" class="settings-tip ml-1" aria-label="翻译方式说明" aria-expanded="false">?<span class="settings-tip-bubble">仅「翻译」「双语」任务生效。三选一。</span></button>
                            </legend>
                            <div class="space-y-2" role="radiogroup" aria-label="翻译方式">
                                <label class="translate-mode-choice" id="translateModeEngineWrap">
                                    <input type="radio" name="translateMode" id="translateModeEngine" value="engine" class="shrink-0" checked>
                                    <span class="font-medium text-gray-800 text-sm">机器翻译</span>
                                    <button type="button" class="settings-tip tip-end" aria-label="机器翻译说明" aria-expanded="false">?<span class="settings-tip-bubble">免费。由引擎内置 MT（如 Opus）翻译；模型在「模型」页管理。</span></button>
                                </label>
                                <label class="translate-mode-choice" id="translateModeSakuraWrap">
                                    <input type="radio" name="translateMode" id="translateModeSakura" value="sakura" class="shrink-0">
                                    <span class="font-medium text-gray-800 text-sm">推理翻译</span>
                                    <button type="button" class="settings-tip tip-end" aria-label="推理翻译说明" aria-expanded="false">?<span class="settings-tip-bubble">适合日语片源（Sakura）。请先在「模型」页下载对应 GGUF。</span></button>
                                </label>
                                <label class="translate-mode-choice" id="translateModeSmartWrap">
                                    <input type="radio" name="translateMode" id="translateModeSmart" value="smart" class="shrink-0">
                                    <span class="font-medium text-gray-800 text-sm"><span class="settings-adv-mark" aria-hidden="true">◆</span>智能翻译</span>
                                    <button type="button" class="settings-tip tip-end" aria-label="智能翻译说明" aria-expanded="false">?<span class="settings-tip-bubble">引擎只转录，再由大模型译中。本大版本 Pro 见「Pro」页。</span></button>
                                </label>
                                <button type="button" id="translateModeGotoProBtn" class="settings-guide-link text-xs ml-1 hidden">去配置免费小模型 / 激活 Advanced →</button>
                            </div>
                            <input type="checkbox" id="smartTranslateCheck" class="sr-only" tabindex="-1" aria-hidden="true">
                            <label class="settings-row text-sm" id="smartTranslateFaithfulWrap">
                                <input type="checkbox" id="smartTranslateFaithfulCheck" class="rounded" checked>
                                <span class="settings-label font-medium text-gray-700">
                                    忠实语气（成人向 / R 级）
                                    <button type="button" class="settings-tip" aria-label="忠实语气说明" aria-expanded="false">?<span class="settings-tip-bubble">保留粗口与原貌语义。</span></button>
                                </span>
                            </label>
                            <p id="translateModeHint" class="text-xs text-violet-700 min-h-[1rem]"></p>
                        </fieldset>
                        <fieldset class="rounded-lg border border-amber-100 bg-amber-50/40 p-3 space-y-3" id="advancedFeaturesFieldset">
                            <legend class="text-xs font-semibold text-amber-800/80 px-1"><span class="settings-adv-mark" aria-hidden="true">◆</span>增强能力</legend>
                            <p id="advancedFeaturesLockHint" class="hidden text-xs text-amber-800 leading-relaxed">
                                以下功能需解锁 Pro。
                                <button type="button" id="advancedFeaturesGotoProBtn" class="settings-guide-link">去购买 / 激活</button>
                            </p>
                            <label class="settings-row text-sm" id="filmAudioEnhanceWrap">
                                <input type="checkbox" id="filmAudioEnhanceCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">
                                    <span class="settings-adv-mark" aria-hidden="true">◆</span>影视音频增强
                                    <button type="button" class="settings-tip tip-end" aria-label="影视音频增强说明" aria-expanded="false">?<span class="settings-tip-bubble">进 ASR 前用人声分离（Demucs）剥离 BGM/音效。请先在「模型」库下载人声分离。</span></button>
                                </span>
                            </label>
                            <label class="settings-row text-sm" id="filmVadPresetWrap">
                                <input type="checkbox" id="filmVadPresetCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">
                                    <span class="settings-adv-mark" aria-hidden="true">◆</span>仅影视 VAD 预设（不分离人声）
                                    <button type="button" class="settings-tip tip-end" aria-label="影视 VAD 预设说明" aria-expanded="false">?<span class="settings-tip-bubble">只套用影视向 VAD，不做 Demucs。与「影视音频增强」互斥。</span></button>
                                </span>
                            </label>
                            <div id="smartTranslateWrap" class="hidden" aria-hidden="true"></div>
                        </fieldset>
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">启动与界面</legend>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="settingsDensityCompactCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">紧凑列表<button type="button" class="settings-tip" aria-label="界面密度说明" aria-expanded="false">?<span class="settings-tip-bubble">缩小主界面任务列表行高。与主界面「更多」菜单密度开关同步。</span></button></span>
                            </label>
                        </fieldset>
                    </div>

                    <div class="params-tab-panel space-y-4" data-tab-panel="install" data-settings-search="环境 引擎 Engine 安装 镜像 HuggingFace GPU">
                        <fieldset class="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">Transub Engine</legend>
                            <div id="engineSettingsBlock" class="space-y-3">
                                <label class="block text-sm">
                                    ${tip('引擎安装 / 源码目录', '安装目录说明', '指定 Transub Engine 的安装或源码目录。')}
                                    <div class="flex gap-2 mt-1">
                                        <input type="text" id="engineInstallPathInput" class="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" placeholder="例如 D:\\Transub-Engine（必填）" maxlength="4096">
                                        <button type="button" id="engineInstallBrowseBtn" class="px-3 py-2 border rounded-lg text-sm shrink-0">浏览</button>
                                    </div>
                                </label>
                                <label class="block text-sm">
                                    ${tip('服务地址 / 端口', '服务地址说明', '设置好安装目录并检测后，一般会自动得到本机地址。通常无需手改。')}
                                    <input type="text" id="engineUrlInput" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="http://127.0.0.1:8765" maxlength="4096">
                                </label>
                                <label class="block text-sm">
                                    ${tip('Hugging Face 镜像', '镜像说明', '下载模型超时时请用国内镜像；可留空或点「官方」直连。')}
                                    <div class="flex gap-2 mt-1">
                                        <input type="text" id="engineHfEndpointInput" class="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" placeholder="https://hf-mirror.com" maxlength="4096" value="https://hf-mirror.com">
                                        <button type="button" id="engineHfMirrorPresetBtn" class="px-3 py-2 border rounded-lg text-sm shrink-0">国内镜像</button>
                                        <button type="button" id="engineHfOfficialPresetBtn" class="px-3 py-2 border rounded-lg text-sm shrink-0">官方</button>
                                    </div>
                                </label>
                                <div class="flex flex-wrap items-center gap-2">
                                    <button type="button" id="engineTestBtn" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">检测引擎</button>
                                    <label class="inline-flex items-center gap-1.5 text-sm text-gray-600 ml-1">
                                        <input type="checkbox" id="engineAutoStartCheck" class="rounded" checked>
                                        自动启动引擎
                                    </label>
                                </div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <button type="button" id="engineEnsureGpuBtn" class="px-3 py-1.5 border rounded-lg text-sm text-sky-700 hover:bg-sky-50">下载 GPU 支持</button>
                                    <button type="button" id="engineOpenLogBtn" class="px-3 py-1.5 text-xs text-emerald-700 hover:underline">打开引擎日志</button>
                                </div>
                                <p id="engineGpuStatus" class="text-xs text-gray-500 min-h-[1rem]"></p>
                                <p id="engineStatus" class="text-xs text-gray-500 min-h-[1.25rem]"></p>
                            </div>
                        </fieldset>
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                            <legend class="text-xs font-semibold text-gray-500 px-1">运行状态</legend>
                            <p class="text-xs text-gray-500 leading-relaxed">加速设备与性能档位见「性能」；模型下载见「模型」。</p>
                        </fieldset>
                    </div>

                    <div class="params-tab-panel space-y-4" data-tab-panel="models" data-settings-search="模型 ASR MT VAD Demucs 下载">
                        <fieldset class="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">识别 / 翻译 / VAD</legend>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label class="block text-sm">
                                    ${tip('ASR 模型', 'ASR 模型说明', '语音识别模型。可按片源语言与硬件选择。')}
                                    <select id="engineAsrModelSelect" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono">
                                        <option value="sensevoice-small">sensevoice-small</option>
                                        <option value="whisper-tiny">whisper-tiny</option>
                                        <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
                                        <option value="whisper-large-v2">whisper-large-v2</option>
                                        <option value="whisper-large-v3">whisper-large-v3</option>
                                        <option value="whisper-ja-1.5b">whisper-ja-1.5b · 日语微调（可选）</option>
                                        <option value="anime-whisper">anime-whisper · 动画/Galgame（可选）</option>
                                    </select>
                                </label>
                                <label class="block text-sm" id="engineMtModelWrap">
                                    ${tip('MT 模型', 'MT 模型说明', '与「常规 → 翻译方式」联动：选推理翻译 / 智能翻译时会自动调整。')}<span class="settings-tip-bubble hidden" id="engineMtModelHint"></span>
                                    <select id="engineMtModelSelect" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono">
                                        <option value="">自动（按源语言 · Opus）</option>
                                        <option value="opus-mt-en-zh">opus-mt-en-zh</option>
                                        <option value="opus-mt-ja-zh">opus-mt-ja-zh</option>
                                        <option value="opus-mt-ko-zh">opus-mt-ko-zh</option>
                                        <option value="opus-mt-de-zh">opus-mt-de-zh</option>
                                        <option value="opus-mt-es-zh">opus-mt-es-zh</option>
                                        <option value="opus-mt-fi-zh">opus-mt-fi-zh</option>
                                        <option value="opus-mt-sv-zh">opus-mt-sv-zh</option>
                                        <option value="sakura-1.5b">sakura-1.5b · 日→中 免费（默认轻量）</option>
                                        <option value="sakura-7b">sakura-7b · 日→中 免费</option>
                                        <option value="sakura-galtransl-7b">sakura-galtransl-7b · Gal v3.7 IQ4</option>
                                        <option value="sakura-galtransl-7b-q6k">sakura-galtransl-7b-q6k · Gal v3.7 Q6_K</option>
                                        <option value="sakura-galtransl-v4-4b">sakura-galtransl-v4-4b · Gal v4 4B</option>
                                    </select>
                                </label>
                                <label class="block text-sm">
                                    ${tip('VAD 模型', 'VAD 模型说明', '语音活动检测模型，影响切段方式。')}
                                    <select id="engineVadModelSelect" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono">
                                        <option value="fsmn-vad" selected>fsmn-vad（SenseVoice）</option>
                                        <option value="silero-vad">silero-vad（Whisper 内置）</option>
                                        <option value="whisperseg-asmr">whisperseg-asmr（日语轻声 ASMR）</option>
                                    </select>
                                </label>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <button type="button" id="engineDownloadModelsBtn" class="px-3 py-1.5 border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 rounded-lg text-sm">下载所需模型</button>
                                <button type="button" id="engineRefreshModelsBtn" class="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">刷新状态</button>
                            </div>
                            <div id="engineDownloadProgress" class="hidden space-y-1">
                                <div class="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                                    <div id="engineDownloadProgressBar" class="h-full w-1/3 rounded-full bg-emerald-500 animate-pulse"></div>
                                </div>
                                <p id="engineDownloadProgressText" class="text-xs text-emerald-700">正在下载模型…</p>
                            </div>
                            <div id="engineModelsPanel" class="rounded-lg border border-emerald-100/80 bg-white/70 px-2.5 py-2 space-y-1.5">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-xs font-medium text-gray-600">模型安装状态</span>
                                    <span id="engineModelsSummary" class="text-[11px] text-gray-400">检测引擎后显示</span>
                                </div>
                                <ul id="engineModelsList" class="text-xs text-gray-600 space-y-1 max-h-36 overflow-y-auto"></ul>
                            </div>
                        </fieldset>
                    </div>

                    <div class="params-tab-panel space-y-4" data-tab-panel="notify" data-settings-search="通知 托盘 提示音">
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">通知</legend>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="trayNotifyCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">系统托盘通知<button type="button" class="settings-tip" aria-label="托盘通知说明" aria-expanded="false">?<span class="settings-tip-bubble">任务进度与完成时通过系统托盘气泡提醒。</span></button></span>
                            </label>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="trayProgressCheck" class="rounded" checked>
                                <span class="settings-label font-medium text-gray-700">显示托盘进度<button type="button" class="settings-tip" aria-label="托盘进度说明" aria-expanded="false">?<span class="settings-tip-bubble">任务进行中更新托盘进度信息。</span></button></span>
                            </label>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="minimizeToTrayOnStartCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">任务开始时最小化到托盘<button type="button" class="settings-tip" aria-label="最小化到托盘说明" aria-expanded="false">?<span class="settings-tip-bubble">开始批量任务后自动收起主窗口到托盘。</span></button></span>
                            </label>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="editorLongTaskNotifyCheck" class="rounded" checked>
                                <span class="settings-label font-medium text-gray-700">字幕编辑器长耗时任务完成通知<button type="button" class="settings-tip" aria-label="编辑器通知说明" aria-expanded="false">?<span class="settings-tip-bubble">编辑器内重转写、批量处理等较久操作结束时提醒。</span></button></span>
                            </label>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="taskCompleteSoundCheck" class="rounded">
                                <span class="settings-label font-medium text-gray-700">任务完成提示音<button type="button" class="settings-tip" aria-label="提示音说明" aria-expanded="false">?<span class="settings-tip-bubble">主窗口批量任务全部完成时播放提示音。</span></button></span>
                            </label>
                        </fieldset>
                    </div>

                    <div class="params-tab-panel space-y-4" data-tab-panel="history" data-settings-search="历史 转录 原文 保留 清理">
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">保留转录原文</legend>
                            <label class="settings-row text-sm">
                                <input type="checkbox" id="keepTranscriptCheck" class="rounded" checked>
                                <span class="settings-label font-medium text-gray-700">保存转录字幕<button type="button" class="settings-tip" aria-label="保存转录说明" aria-expanded="false">?<span class="settings-tip-bubble">无论任务是转录、翻译还是双语，都额外保留「转录部分」字幕，方便二次翻译和需要原文的语义理解。</span></button></span>
                            </label>
                        </fieldset>
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-3">
                            <legend class="text-xs font-semibold text-gray-500 px-1">配套</legend>
                            <label class="block text-sm">
                                ${tip('保留位置', '保留位置说明', '默认写在项目目录下的 subtitles 文件夹。')}
                                <input type="text" id="transcriptKeepDirInput" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="项目目录/subtitles（默认）" maxlength="4096">
                            </label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label class="block text-sm">
                                    ${tip('保留条数上限', '条数上限说明', '超过上限时自动清理较早的转录缓存。0 表示不限制。')}
                                    <input type="number" id="transcriptKeepLimitInput" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm" min="0" max="9999" step="1" value="200">
                                </label>
                                <label class="block text-sm">
                                    ${tip('保留天数', '保留天数说明', '超过天数的转录缓存可被清理。0 表示不按时间过期。', 'tip-end')}
                                    <input type="number" id="transcriptKeepDaysInput" class="mt-1 w-full border rounded-lg px-3 py-2 text-sm" min="0" max="3650" step="1" value="90">
                                </label>
                            </div>
                            <button type="button" id="openLibraryBtn" class="px-3 py-2 border rounded-lg text-sm hover:bg-white bg-white/60">
                                <i class="fa fa-archive w-4 text-center text-gray-400 mr-1" aria-hidden="true"></i>打开字幕库
                            </button>
                        </fieldset>
                        <fieldset class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                            <legend class="text-xs font-semibold text-gray-500 px-1">清理策略</legend>
                            <button type="button" id="clearTranscriptCacheBtn" class="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">一键清理历史转录缓存</button>
                            <p id="historySettingsStatus" class="text-xs text-gray-500 min-h-[1rem]"></p>
                        </fieldset>
                    </div>
`;

// Continue in part 2 - process through more - to keep file manageable I'll append rest
fs.writeFileSync('F:/Transub/tools/_settings-content-part1.html', content);
console.log('part1 written', content.length);
