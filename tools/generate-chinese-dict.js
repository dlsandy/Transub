/**
 * （可选 / 遗留）从 OpenCC 文本表生成自研词典。
 *
 * 正式运行时已改用 npm 依赖 opencc-js（见 src/js/subtitle-chinese-core.js
 * 与 src/vendor/opencc-js/full.js），一般无需再执行本脚本。
 *
 * 用法：
 *   node tools/generate-chinese-dict.js
 *
 * 字典文件默认读取 tools/tmp-opencc/（可从 OpenCC data/dictionary 下载）。
 */
console.error('[generate-chinese-dict] 已弃用：请使用 opencc-js。本脚本不再写入 subtitle-chinese-dict.js。');
process.exit(1);
