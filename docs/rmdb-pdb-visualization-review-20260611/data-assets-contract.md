# 静态数据资产契约

生成日期：2026-06-11

本文记录 Blocker 2/3/6 的合并解决口径：如何把远端 RMDB/PDB 数据转成可部署到静态页面的前端资产。

## 核心决策

网站未来按静态页面部署设计。浏览器运行时不直接读取远端 public root、support root、DuckDB、Parquet 或全量 TSV。远端数据只作为 build-time 输入，网站发布物只包含前端可调度的静态资产。

资产策略采用「轻量索引 + 很多小文件 + 按视图懒加载」。宁愿生成更多小文件，也不要把多个 case 或大体量 per-base 数据压进单一大文件。

## 资产目录

生成产物必须进入单独资产目录，不继续手写到 `src/data.js`。目录固定为：

```text
src/assets/generated/rmdb-pdb-cases/
```

该目录只存放由生成脚本产生的机器资产。人工维护的数据、页面代码和样式不放入该目录。

## 加载原则

- 首屏只加载全局轻量索引和当前 PDB case 的基础摘要。
- 用户没有展开的区域不加载对应详情。
- 用户没有切换到的 source/profile 不加载对应 reactivity。
- alignment 按页面视觉容量加载；当前口径是每页 25 条。
- heatmap 按 PDB reference sequence position window 加载；窗口大小根据网页当前可见范围、缩放状态和布局动态调整。
- 不把 722 个 case 的 detail、alignment、profile 或 reactivity 聚合成单一大 JSON。

## Heatmap Window 口径

heatmap 的切分轴固定为 PDB reference sequence position。窗口大小不写死为一个全站常数，而是由网页当前展示状态决定，例如容器宽度、缩放级别和当前可见的 PDB position 范围。

这不引入动态后端服务。前端仍然只通过静态索引调度静态小资产：页面先计算当前需要显示的 PDB position window，再根据索引加载覆盖该 window 的小资产。

## 索引职责

全局索引只负责调度，不承载重数据。

全局索引应包含：

- `source_package_id`
- schema version
- `generated_at`
- PDB case 列表
- 每个 PDB case 的轻量摘要
- 每个 PDB case 对应的详情资产入口路径

全局索引不应包含：

- 全量 alignment base map
- 全量 reactivity rows
- 全量 profile 级热图矩阵
- 可由 case detail 懒加载得到的大字段

## 小资产拆分口径

每个 PDB case 下的资产按用户视图拆分，而不是按后端表大小粗暴打包。

建议拆分为：

```text
index.json
manifest.json
cases/<pdb_id>/case.json
cases/<pdb_id>/alignments/page-0001.json
cases/<pdb_id>/alignments/page-0002.json
cases/<pdb_id>/profiles.json
cases/<pdb_id>/reactivity/<source_type>/<profile_key>/summary.json
cases/<pdb_id>/reactivity/<source_type>/<profile_key>/pdb-pos-<start>-<end>.json
```

这里的 `pdb-pos-<start>-<end>.json` 表示按 PDB reference sequence position window 生成的小资产。窗口边界仍然使用 PDB reference sequence position；窗口大小由网页显示状态动态决定，前端通过索引找到覆盖当前窗口的小资产。

## 文件大小预算

单个生成资产的大小预算采用 GitHub 普通仓库单文件硬上限：每个小资产必须小于 100 MiB。GitHub 官方文档说明，超过 50 MiB 的文件会触发 Git 警告，GitHub 会阻止超过 100 MiB 的文件。参考：[About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

生成器必须检查每个资产的文件大小：

- `size_bytes < 100 MiB`：允许产出。
- `size_bytes >= 100 MiB`：生成失败，不进入发布资产。
- `50 MiB <= size_bytes < 100 MiB`：允许产出，但 manifest 中必须标记为 large asset warning。

## 前端调度方式

前端只通过索引和 case detail 中的资产路径调度数据：

1. 进入站点：加载 `index.json`。
2. 进入 PDB case 页面：加载对应 `case.json`。
3. 打开 alignment 区域：加载当前页 alignment 小资产。
4. 切换 alignment 页码：加载对应页的小资产。
5. 打开 heatmap：加载默认最佳 source/profile 的 summary，并按当前网页展示状态加载对应 PDB position window 小资产。
6. 切换 source/profile：加载新 source/profile 对应的小资产。

## 禁止项

- 禁止浏览器运行时扫描 722 个 PDB case 目录。
- 禁止浏览器运行时读取全量 TSV、DuckDB 或 Parquet。
- 禁止生成一个包含全部 case detail 的大 JSON。
- 禁止首屏加载全部 profile、全部 alignment 或全部 reactivity。
- 禁止把生成资产混入人工维护的 `src/data.js` 作为长期方案。
- 禁止生成大于或等于 100 MiB 的单个静态资产。

## Manifest 要求

`manifest.json` 必须记录生成资产的 provenance 和逐文件校验信息。

至少包含：

- `source_package_id`
- schema version
- `generated_at`
- 输入 support root 路径或包标识
- 每个生成资产的相对路径
- 每个生成资产的 `size_bytes`
- 每个生成资产的 SHA-256 checksum
- 每个生成资产是否触发 50 MiB large asset warning
