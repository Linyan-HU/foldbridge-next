# RMDB/PDB 可视化 Blockers

生成日期：2026-06-11

## 结论

当前最大的 blocker 不是「数据不存在」，而是数据粒度、科学语义、前端数据形态和结构映射边界还没有被产品化定义清楚。直接按「一个 PDB = 一种分子」实现，会把远端包里真实存在的多对多关系压扁，并且容易把 sequence-axis projection 误展示成结构实验证据。

建议把页面口径定义为「生物学分子 > PDB ID case 页面」。一个生物学分子可以映射到多个 PDB ID case，但当前版本不进行跨 PDB 合并；页面仍以单个 PDB ID case 为承载单元，页面内再提供 PDB reference、RMDB unique sequence、bundle sequence 和 probing profile 的选择与聚合视图。

## 证据快照

远端公开包：

```text
/data/FoldBridgeShare/rmdb_pdb_sequence_cases_rasp_params_besthit_20260610
size = 6.1G
case directories = 722
files = 6499
```

远端支持包：

```text
/data/hsBack/05_devSpace/03_foldbridge_rmdb_rasp/06_compute_intermediates/rmdb_pdb_sequence_cases_rasp_params_besthit_20260610_support
size = 6.8G
```

关键支持资产：

| 文件 | 大小 | 用途 |
| --- | ---: | --- |
| `case_summary.tsv` | 225144 bytes | 轻量 PDB case 总览 |
| `pdb_candidate_statistics.tsv` | 285770 bytes | 轻量候选与 alignment 统计 |
| `pdb_axis_reactivity.tsv` | 5741016523 bytes | 全量 per-base 投影 TSV，不适合浏览器直接加载 |
| `rmdb_pdb_axis_reactivity.parquet` | 80987462 bytes | 压缩后的 per-base 表，可作为构建输入 |
| `rmdb_pdb_alignment_base_map.tsv` | 504108743 bytes | 全量 alignment base map TSV，不适合浏览器直接加载 |
| `rmdb_case_projection.duckdb` | 807153664 bytes | 支持查询和离线切片生成 |

case 统计：

| 指标 | 总数 | 中位数 | p95 | 最大值 | 大于 1 的 case 数 | 大于 0 的 case 数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `pdb_reference_id_count` | 909 | 1 | 3 | 6 | 129 | 722 |
| `rmdb_unique_sequence_count` | 57032 | 7 | 360 | 4603 | 579 | 722 |
| `rmdb_profile_count` | 126056 | 16 | 753 | 10542 | 713 | 722 |
| `pdb_axis_reactivity_rows` | 13381321 | 1761 | 83782 | 990706 | 722 | 722 |
| `base_mismatch_rows` | 225448 | 8 | 1876 | 17050 | 406 | 408 |

所有 722 个 case 的 `projection_status` 都是 `pass`。

## Blocker 1：页面粒度假设错误

远端包的 case grain 是 PDB ID，但单个 PDB 目录下可以有多个：

- `pdb_reference_id`
- `rmdb_unique_id`
- `bundle_sequence_id`
- `bundle_profile_id`
- projected reactivity rows

这意味着「一个 PDB 等于一种生物学分子」不是当前数据的真实模型。一个生物学分子可以映射到多个 PDB ID case，而一个 PDB ID case 内也可能包含多个 reference、sequence 和 profile 层级。至少 579 个 PDB case 有多个 RMDB unique sequence，713 个 PDB case 有多个 profile。若直接在页面上聚合成一个分子、一条曲线或一个 reactivity 值，会丢失来源差异和 profile 差异。

### 已确认决策

- 生物学分子标识暂时只作为页面上层语义，不作为当前合并主键。
- 页面主键采用 PDB ID case，不进一步细化为 `pdb_id + pdb_reference_id` 作为页面主键。
- 页面内展示多个 RMDB unique sequence、bundle sequence 和 probing profile 的多对多关系。
- profile 默认按 `bundle_profile_id` 平铺列表，但用户视线中只展示来源 `rdat_file`。
- 当前不做 profile 聚合；默认加载 best profile，同时允许用户切换。

## Blocker 2：public root 不是前端索引源

公开包为了保持交付合同，只包含 `README.md` 和 722 个 PDB case 目录。它没有放全局机器索引。网站如果在浏览器端遍历 722 个目录或逐个读取 case 文件，会有性能和部署环境问题。

可用的全局入口在 support root：

- `case_summary.tsv`
- `pdb_candidate_statistics.tsv`
- `rmdb_case_projection.duckdb`
- `tables/*.parquet`

### 需要先建立

- build-time 数据生成脚本；
- 前端轻量 `index.json`；
- 每个 PDB case 的详情 JSON；
- schema 版本号和来源 manifest；
- 生成结果和远端 support root 的校验关系。

### 已确认决策

- 网站未来按静态页面部署设计。
- 运行时浏览器不直接读取远端 public root、support root、DuckDB、Parquet 或全量 TSV。
- 远端 support root 只作为 build-time 输入。
- 生成产物必须进入 `src/assets/generated/rmdb-pdb-cases/`。
- 前端通过轻量索引调度具体小资产。
- 不生成单一大文件承载 722 个 case 或全量 per-base 数据。
- 单个小资产必须小于 100 MiB；达到或超过该上限时生成失败。
- manifest 必须记录每个小资产的 SHA-256 checksum。
- 详细契约见 [data-assets-contract.md](./data-assets-contract.md)。

## Blocker 3：全量 per-base 数据不能直接进浏览器

`pdb_axis_reactivity.tsv` 总大小约 5.74 GB，总行数 13381321。最大单 case 的 `pdb_axis_reactivity_rows` 是 990706，对应的公开 case TSV 可达到数百 MB 级别。

直接 `fetch` TSV 并在浏览器里 parse 会造成：

- 首屏过慢；
- 移动端不可用；
- 大 case 页面卡死；
- GitHub Pages 或静态托管构建体积失控；
- 无法合理缓存 profile 级切换。

### 需要先建立

- 轻量 case summary；
- per-PDB detail JSON；
- profile-level metadata；
- reactivity track 的 downsample 或窗口切片；
- 大 case 的懒加载策略；
- 文件大小预算和前端加载上限。

### 已确认决策

- 采用很多小文件，而不是单一大文件或少数粗粒度大文件。
- 数据加载按用户每次视觉上看到的部分进行 lazy loading。
- alignment 按当前页加载；当前页面口径是每页 25 条。
- heatmap 按 PDB reference sequence position window 加载；窗口大小根据网页当前可见范围、缩放状态和布局动态调整。
- 未展开、未切换、未翻页的数据不预先加载。

## Blocker 4：`projection_status=pass` 容易被误读

所有 722 个 case 都是 `projection_status=pass`，但 408 个 case 有非零 `base_mismatch_rows`，总 mismatch 数为 225448。这说明 `pass` 只表示投影流程通过，不表示 base-level clean，也不表示该 RMDB probing 实验就是在对应 PDB 结构上完成的。

### 已确认决策

- 页面不展示 `projection_status=pass`。这个字段引发额外解释成本，不进入首屏、表格、tooltip 或下载说明。
- 后期可以补 `confidence`，但当前不把 `projection_status` 包装成 confidence。
- 底层 `qcov` 字段在页面上只以完整全称 `RMDB query coverage` 展示，不暴露缩写 `qcov`。
- 页面不展示 BLAST identity。
- 底层 `scov` 字段在页面上只以 `PDB reference sequence coverage` 展示。
- `PDB reference sequence coverage` 表示 BLAST alignment 覆盖 PDB reference sequence 的比例；它不是 PDB 结构覆盖率，不是 observed residue coverage，也不能用于说明 3D 结构中哪些 residue 有实验证据。
- `base_mismatch_rows` 当前不进入页面 UI；后期如需表达，优先用颜色区分。
- alignment 视图采用类 Clustal W alignment 形式；默认展示该 PDB case 的全部 alignments，但分页或折叠；分页大小为每页 25 条。
- 每条 alignment 的 `RMDB query coverage` 与 `PDB reference sequence coverage` 作为侧边 meta 信息展示。
- profile 默认按 `bundle_profile_id` 平铺列表；页面默认只展示来源，来源字段使用 `rdat_file`；内部 ID 放在后台，不进入用户主视野。
- reactivity track 默认加载 best profile；best profile 定义为上游 best candidate pair 关联的第一个 profile。
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

页面文案和字段命名必须避免把它展示成：

- 结构实验证据；
- observed residue axis；
- base-clean scientific agreement；
- 一条可信的 PDB 结构反应性曲线。

### 页面上必须明确

- reactivity axis 是 PDB reference sequence position；
- `pdb_pos` 不是 observed residue coordinate；
- `projection_status=pass` 不进入页面展示；
- `RMDB query coverage` 应作为质量字段展示；
- BLAST identity 不进入页面展示；
- 底层 `scov` 字段应展示为 `PDB reference sequence coverage`，并明确它只描述 reference sequence 轴覆盖比例。
- `base_mismatch_rows` 当前不进入页面 UI；后期如需表达，优先用颜色区分。

## Blocker 5：3D 结构着色缺少 residue 映射层

远端表里的 `pdb_pos` 是 PDB reference sequence position。当前网站的 Mol* 逻辑主要加载本地示例结构或 RCSB CIF，并没有把 PDB reference position 映射到 mmCIF chain residue、auth residue、assembly residue 或 observed residue。

如果直接把 `pdb_pos` 当成结构 residue number 着色，会出现：

- chain 错位；
- residue 编号错位；
- insertion code / auth numbering 错位；
- 缺失 residue 被误认为有结构坐标；
- 多 reference chain 时无法确定上色对象。

### 需要先建立

- `pdb_reference_id -> chain/asym_id` 映射；
- `pdb_reference_position -> mmCIF residue selector` 映射；
- 缺失 residue 的显式处理；
- 多 reference chain 的选择器；
- reactivity track 到 residue selection 的测试样例。

### 已确认决策

- 这是数据层面问题。
- 需要一个 router，把 `pdb_pos` 转换为 Mol* 可读的染色位置。
- `pdb_pos` 不能直接当作 Mol* residue selector。
- 在该 router 建立前，sequence-axis heatmap 不受影响，但 3D residue coloring 不能声称可用。

## Blocker 6：本地站点仍是 demo 数据架构

当前站点的数据主要硬编码在 `src/data.js` 和 `src/main.js` 中。`DATA_VERSION` 仍是 `2026-03-07.example-mvp.v2`，`sequenceRows` 只初始化了少量示例 PDB。这个结构不能直接承载 722 个 PDB case 和 profile-level 数据。

### 需要先建立

- 数据生成脚本，而不是手写 `src/data.js`；
- `src/assets/generated/` 或等价的生成数据目录；
- 可测试的数据 contract；
- 版本字段，例如 `source_package_id = rmdb_pdb_sequence_cases_rasp_params_besthit_20260610`；
- 生成资产的 manifest 和校验测试。

### 已确认决策

- 真实 722 case 数据不能继续手写进 `src/data.js`。
- `src/data.js` 可以保留少量手写 UI 常量或兼容入口，但不能作为真实 RMDB/PDB case 数据的长期载体。
- 生成资产必须有独立目录、索引和 manifest。
- manifest 必须逐文件记录相对路径、文件大小和 SHA-256 checksum。
- 前端页面根据索引调度资产，而不是把全部数据一次性 import 到主 bundle。

## Blocker 7：路由模型不支持 PDB case 页面

当前 router 是固定 hash route 白名单。详情页通过 `sequenceId` 或 `pdbName` 在内存数组里找示例记录。这不适合公开 722 个 PDB case，也不适合 profile-level 深链接。

### 已确认决策

- 采用预生成静态页面，使网页链接有意义、可读，并适合作为外部引用入口。
- 每个 PDB ID case 需要有可读、稳定的预生成静态页面 URL。
- URL 的主语是 PDB ID case，不是内部 sequence/profile ID。
- 可读路径作为主 URL，例如 `/pdb-cases/4qlm/`。
- 当前只支持 `pdbReferenceId` 作为 query 参数，用于直接打开某个 PDB reference sequence 的视图。
- `pdbReferenceId` 必须校验属于当前 PDB ID case。
- 当前不支持 `rmdbUniqueId` 和 `bundleProfileId` 作为公共 URL 参数。
- `bundleProfileId` 等内部 ID 不进入公共 URL。
- 如后续需要 profile 深链接，先设计用户可读 alias 或后台映射，不直接暴露 `bundleProfileId`。

## Blocker 8：运行时外部依赖未冻结

当前 Mol* 和 Forna 相关逻辑在运行时从外部 CDN 或 ribocentre 站点加载脚本和样式。公开站点如果依赖这些运行时网络资源，会遇到可复现性、访问稳定性、CORS、离线审查和长期维护问题。

### 已确认决策

- Viewer 运行时依赖尽量使用 CDN。
- 当前不做 viewer fallback。
- 静态页面核心数据资产仍由本站静态资产提供；CDN 决策只针对 viewer 运行时依赖。

## 推荐推进顺序

1. 先冻结页面 grain：采用「生物学分子 > PDB ID case 页面」，当前不做跨 PDB 合并。
2. 从 support root 生成轻量 `index.json` 和每 case 的 summary JSON。
3. 定义 profile-level detail schema，避免把多个 profile 聚合成不透明单值。
4. 给 `projection_status`、mismatch、coverage 和 identity 写清楚展示规则。
5. 先做 sequence-axis 可视化；3D residue 着色等 residue 映射表稳定后再上。
6. Viewer 运行时依赖尽量走 CDN；当前不做 fallback。
7. 为生成数据加 contract tests，防止远端 schema 漂移后静态站悄悄坏掉。
