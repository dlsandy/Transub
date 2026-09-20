# ASR 词库导入工具

把外部词库转为 Transub **术语表 JSON**（编辑器可导入），并可导出引擎 `asrGlossary` / `hotwords.txt`。

输出默认写到 `tmp/asr-vocab/`（git 忽略）。

## 1. AniList 角色名 → 术语表

按番剧 AniList ID 拉角色名，**标准写法为中文译名**（优先 Bangumi，否则日文名 OpenCC 简化）；日文/英文/昵称在别名，供 ASR prompt 与 MT 扫描。

```bash
npm run asr:anilist-glossary -- --id=9253
```
npm run asr:anilist-glossary -- --id=9253 --also-engine=tmp/asr-vocab/engine.json --also-hotwords=tmp/asr-vocab/hot.txt
```

导入：**字幕编辑器 → 术语表 → 导入 JSON**；勾选「写入 initial_prompt / hotwords」后批次 ASR 会带上专名偏置。

## 2. asr-hotword 格式 → 术语表

兼容 [HaujetZhao/asr-hotword](https://github.com/HaujetZhao/asr-hotword) / CapsWriter 热词文件：

```txt
転売 | 天売 | てんばい
Claude | 克劳德 | cloud ~~~ 代码 | 编程
```

```bash
npm run asr:import-hotword -- --in=path/to/hot.txt
```

第一列为**正确写法**，`|` 后为误听别名；`~~~` 后为黑名单（写入 note，供人工参考）。

**软声 / mens-esthe 示例：** 仓库内 `tools/asr-vocab/av-soft.hotword.txt`（メンエス、指圧、うつ伏せ等常见误听）。`av_soft` 批次还会自动注入同名 Whisper 热词偏置，无需导入也能生效；导入后可作 **asrReplace** 后处理替换。

```bash
npm run asr:import-hotword -- --in=tools/asr-vocab/av-soft.hotword.txt
```

## 3. THUOCL / NEologd / 纯词表裁剪

```bash
# 清华 THUOCL（词\tDF），取高频 IT 词
npm run asr:crop-lexicon -- --in=THUOCL_IT.txt --format=thuocl --limit=120

# NEologd 专名 seed（需先解压 .csv.xz）
npm run asr:crop-lexicon -- --in=neologd-proper-noun.csv --format=neologd --limit=300 --ja-only

# 中文地名
npm run asr:crop-lexicon -- --in=THUOCL_diming.txt --format=thuocl --limit=200 --zh-only
```

### 推荐下载源

| 资源 | 用途 | 链接 |
|------|------|------|
| THUOCL | 中文 IT/地名/成语 | [thunlp/THUOCL/data](https://github.com/thunlp/THUOCL/tree/master/data) |
| NEologd 专名 seed | 日语新词/专名 | [mecab-ipadic-neologd/seed](https://github.com/neologd/mecab-ipadic-neologd/tree/master/seed) |
| 日本地名集 | 地名读音 | [sorami/gazetter-of-japan](https://github.com/sorami/gazetter-of-japan) |
| AniList | 动漫角色名 | 本工具 `--id=` |

## 输出格式

**术语表**（编辑器导入）：

```json
{
  "version": 1,
  "entries": [
    { "canonical": "二見原莉々子", "aliases": ["二見原 莉々子"], "enabled": true }
  ]
}
```

**引擎 asrGlossary**（`--also-engine=`，wrong→correct 后处理对）：

```json
[{ "wrong": "天売", "correct": "転売", "stage": "asr" }]
```

**hotwords.txt**（`--also-hotwords=`，每行一词，给 FunASR/Qwen 等）。

## 注意

- **anime-whisper** 会清空 `initial_prompt`/`hotwords`（防幻觉）；专科片源更依赖 **asrGlossary 后处理 + D01 + 二意见**。
- 大批量专名请裁剪（建议 50–200 条/片），Whisper prompt 有效约 224 token。
- 黑名单（`~~~` 后）写入术语 `note`，引擎后处理会跳过邻近出现黑名单词的替换。

### 引擎接入

- 全局术语表 + **设置开启「术语写入 prompt」** → 批次 job 携带 `initialPrompt` / `hotwords`。
- 仅 `asrReplace: true` 的条目（热词/坏句池）→ 额外作为 `asrGlossary` 在转写后做 wrong→correct。
- AniList 角色名默认只参与 prompt，不会把英文别名当误听替换。

```bash
npm run asr:bad-pool-glossary
```
