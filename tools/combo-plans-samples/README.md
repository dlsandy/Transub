# Combo plans samples（组合方案上传包）

目录约定（CDN 默认 `https://www.transub.cc/combo-plans/`）：

```
combo-plans/
  manifest.json
  plans/*.json
```

## 硬件三档（非外部译法）

| 档位 key | 界面名 | 显存 |
|----------|--------|------|
| `low` | 性能 | &lt;8GB |
| `balanced` | 均衡 | 8–12GB |
| `quality` | 质量 | &gt;12GB |

推理 / 智能 / 混合：各覆盖 **日 / 英 / 韩** × 三档 = **27** 条（ASR + MT 随档位升级）。

外部翻译：不强制三档矩阵，另附 **5** 条（CPU / 繁中 / 华语 / 访谈等）。

另有精选混合 **1** 条：`ja-smart-10-12`（日译中，10–12GB：Qwen3 Galgame + GalTransl 7B + Huihui Qwen3 8B Abliterated）。筛选「均衡」时与通用均衡档一起出现。

合计 **33** 条。重新生成：

```bash
node tools/combo-plans-samples/generate-pack.js
```

## 上传步骤

1. 同步 `manifest.json` 与整个 `plans/` 到站点 `…/combo-plans/`
2. 确认 `https://www.transub.cc/combo-plans/manifest.json` 的 `updatedAt` 与条数
3. 可用 `TRANSUB_COMBO_PLANS_MANIFEST_URL` 覆盖清单地址

开发时若 CDN 不可达，Electron `combo-plans-runtime` 会回退读取本目录。
