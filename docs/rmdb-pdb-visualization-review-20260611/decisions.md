# Blocker 解决决策记录

生成日期：2026-06-11

本文按「问题 -> 用户决策 -> 落地规则」记录每个 blocker 的解决口径。没有用户决策的问题，不在这里写成最终方案。

## Blocker 1：页面粒度

### 问题

页面是否按「一个 PDB = 一种分子」处理？

### 用户决策

页面采用「生物学分子 > PDB ID case 页面」口径。一个生物学分子可以映射到多个 PDB ID case，但当前不进行跨 PDB 合并。页面内展示多对多关系。

### 落地规则

- 当前页面主承载单元是 PDB ID case。
- 不把 `pdb_id` 当作生物学分子的唯一标识。
- 页面内保留 PDB reference、RMDB unique sequence、bundle sequence、probing profile 的层级关系。
- 详细规则见 [page-scope.md](./page-scope.md)。

## Blocker 4：`projection_status=pass` 解释成本

### 问题

`projection_status=pass` 是否在页面上展示，并解释为投影流程通过？

### 用户决策

不展示 `projection_status=pass` 这类会引发额外解释成本的字段。后期最多补 `confidence`。底层 `qcov` 字段要展示，但页面只能使用完整全称 `RMDB query coverage`；BLAST identity 不展示。底层 `scov` 字段要展示，而且必须命名为 `PDB reference sequence coverage`，并给出完整释义。

### 落地规则

- 页面不展示 `projection_status=pass`。
- 当前不新增 confidence；后期如需要再单独定义。
- 底层 `qcov` 字段在页面上只以完整全称 `RMDB query coverage` 展示，不暴露缩写 `qcov`。
- 页面不展示 BLAST identity。
- 底层 `scov` 字段在页面上只以 `PDB reference sequence coverage` 展示。
- `PDB reference sequence coverage` 的释义：该值表示 BLAST alignment 覆盖 PDB reference sequence 的比例，衡量的是参考序列轴被 query alignment 覆盖的范围。它不是 PDB 结构覆盖率，不是 observed residue coverage，也不能用于说明 3D 结构中哪些 residue 有实验证据。

## Blocker 2/3/6：静态数据资产契约

### 问题

网站未来要部署为静态页面。如何从远端 support root 生成前端资产，避免浏览器直接读取远端原始包、全量 TSV 或单一大文件？

### 用户决策

静态部署优先。不要把数据做成单一大文件，也不要依赖少数粗粒度大文件来承载页面。产物固定存到 `src/assets/generated/rmdb-pdb-cases/`；前端通过轻量索引调度具体资产。数据加载按用户每次视觉上看到的部分进行 lazy loading，宁愿生成很多小文件，也不要为了减少文件数量牺牲静态页面的可用性和可维护性。单个小资产大小预算采用 GitHub 普通仓库单文件硬上限，必须小于 100 MiB。heatmap 按 PDB reference sequence position window 切分，窗口大小根据网页当前可见范围、缩放状态和布局动态调整。manifest 必须记录每个小资产的 SHA-256 checksum。

### 落地规则

- 运行时浏览器不直接消费远端 public root、support root、DuckDB、Parquet 或全量 TSV。
- 必须有 build-time 数据生成步骤，把 support root 转换成静态站点专用资产。
- 生成资产必须放在 `src/assets/generated/rmdb-pdb-cases/`，不能继续混入手写 `src/data.js`。
- 前端入口是轻量索引；索引只负责列出 PDB case、基础摘要和各类小资产路径。
- 禁止把 722 个 case 或 per-base reactivity 合并成单一大 JSON。
- 采用多小文件策略：按 PDB case、视图、分页、profile/source 和用户当前可见范围拆分资产。
- 单个小资产必须小于 100 MiB；达到或超过该上限时生成失败。
- heatmap 资产按 PDB reference sequence position window 切分；窗口大小根据网页当前可见范围、缩放状态和布局动态调整。
- manifest 必须逐文件记录相对路径、文件大小和 SHA-256 checksum。
- 页面只 lazy load 当前可见区域需要的数据；未展开、未切换、未翻页的数据不预先加载。
- 详细契约见 [data-assets-contract.md](./data-assets-contract.md)。

## Blocker 4：页面质量字段与 alignment meta 展示

### 问题

页面是否展示 `base_mismatch_rows`？`RMDB query coverage` / `PDB reference sequence coverage` 展示哪种统计？profile 多对多关系如何默认呈现？reactivity track 默认是否加载？best profile 如何定义？alignment 默认展示范围是什么？

### 用户决策

alignment 页面会做成类似 Clustal W alignment 的形式；展示 alignment 时，每个 alignment 的 `RMDB query coverage` 都要展示，相关覆盖信息作为 meta 信息放在一侧展示。profile 多对多关系按 `bundle_profile_id` 平铺列表，但页面只展示来源，来源字段使用 `rdat_file`；`bundle_profile_id` 等内部 ID 放在后台，不进入用户主视野。reactivity track 默认加载 best profile。best profile 沿用上游 best candidate pair 关联的第一个 profile。alignment 默认展示该 PDB case 的全部 alignments，但分页或折叠，每页 25 条。best profile 不可能没有 reactivity rows；如果出现，视为严重数据问题。reactivity 默认用热图形式展示。热图每条 profile 一个 row，row label 显示 `rdat_file`；列维度固定为 `pdb_pos` / PDB reference sequence position，用于对齐 PDB、RMDB 和 RASP 数据。reactivity 数值颜色先按照每个页面 RMDB reactivity 的 P5/P95 分位数确定；缺失值用灰色。RASP 数据合并后，仍使用 source type 区分数据来源；source type 允许未来扩展。热图必须提供 source type 切换，默认选中并展示最佳 source/profile。

`base_mismatch_rows` 当前不展示。后期如果需要区分相关质量状态，优先考虑用颜色表达，而不是把该字段直接暴露给用户。

### 落地规则

- `base_mismatch_rows` 当前不进入页面 UI；后期如需表达，优先用颜色区分。
- alignment 视图采用类 Clustal W alignment 形式。
- alignment 默认展示该 PDB case 的全部 alignments，但必须分页或折叠；分页大小为每页 25 条。
- 每条 alignment 都展示 `RMDB query coverage`。
- 每条 alignment 都展示 `PDB reference sequence coverage`，作为 alignment 侧边 meta 信息。
- BLAST identity 仍然不展示。
- profile 默认按 `bundle_profile_id` 平铺列表，不按 RDAT 文件或 RMDB unique sequence 分组；页面默认只展示来源，来源字段使用 `rdat_file`；内部 ID 不进入用户主视野。
- reactivity track 默认加载 best profile。
- best profile 定义为：上游 best candidate pair 关联的第一个 profile。
- best profile 没有 reactivity rows 视为严重数据问题，不做静默 fallback。
- reactivity 默认用热图形式展示。
- 热图每条 profile 一个 row，row label 显示 `rdat_file`。
- 热图列维度固定为 `pdb_pos` / PDB reference sequence position。
- 热图颜色先按照每个页面 RMDB reactivity 的 P5/P95 分位数确定。
- 热图缺失值用灰色。
- RASP 数据合并后，仍使用同一 `pdb_pos` 轴；数据来源只在 source type 上区分。
- source type 是可扩展枚举，不限于当前 RMDB / RASP。
- 热图必须提供 source type 切换，默认选中并展示最佳 source/profile。
- alignment 侧边 meta 只放 `RMDB query coverage` 和 `PDB reference sequence coverage`，不放 BLAST identity 或其他 alignment 评分。

## Blocker 7：PDB case 路由模型

### 问题

PDB case 页面采用 SPA route，还是预生成静态页面？是否支持 `pdbReferenceId`、`bundleProfileId`、`rmdbUniqueId` 作为 query 参数？

### 用户决策

采用预生成静态页面，使网页链接有意义、可读，并适合作为外部引用入口。主 URL 使用可读路径。当前只支持 `pdbReferenceId` 作为 query 参数；不支持把 `rmdbUniqueId` 或 `bundleProfileId` 放进公共 URL。

### 落地规则

- 每个 PDB ID case 需要有可读、稳定的预生成静态页面 URL。
- URL 的主语是 PDB ID case，不是内部 sequence/profile ID。
- 搜索页、索引页和外部引用应优先链接到 PDB case 静态页面。
- 可读路径作为主 URL，例如 `/pdb-cases/4qlm/`。
- 当前只支持 `pdbReferenceId` 作为 query 参数，用于直接打开某个 PDB reference sequence 的视图。
- `pdbReferenceId` 必须校验属于当前 PDB ID case。
- 当前不支持 `rmdbUniqueId` 和 `bundleProfileId` 作为公共 URL 参数。
- `bundleProfileId` 等内部 ID 不进入公共 URL，避免破坏「尽量不要让内部 ID 进入用户视线」的页面原则。
- 如后续需要 profile 深链接，先设计用户可读 alias 或后台映射，不直接暴露 `bundleProfileId`。

## Blocker 8：运行时外部依赖

### 问题

Mol* / Forna 等 viewer 依赖是否 vendoring、纳入 npm 构建，还是继续使用 CDN？是否提供外部脚本失败时的 fallback？

### 用户决策

尽量使用 CDN，不做 fallback。

### 落地规则

- Viewer 运行时依赖优先走 CDN。
- 当前不为 viewer 脚本加载失败设计 fallback。
- 静态页面的核心数据资产和 PDB case 内容仍应由本站静态资产提供；CDN 决策只针对 viewer 运行时依赖。

## Blocker 5：3D 结构着色映射层

### 问题

`pdb_pos` 如何用于 Mol* 结构着色？

### 用户决策

这是数据层面问题。需要一个 router，把 `pdb_pos` 转换为 Mol* 可读的染色位置。

### 落地规则

- `pdb_pos` 不能直接当作 Mol* residue selector。
- 数据层必须生成或提供 `pdb_pos -> Mol* readable coloring position` 的映射 router。
- 3D 着色功能必须通过该 router 消费映射结果。
- 在 router 没有建立前，sequence-axis heatmap 不受影响，但 3D residue coloring 不能声称可用。
