# D 类功能实现范围评估

## 1. 范围与非目标

本报告只评估评审意见 D3.3、D3.4、D3.6 的实现范围，回答“现在有什么、还缺什么、下一批最小应该做什么”。本轮没有实现、发布或承诺任何 D 类功能。

- D3.3：糖环构象（sugar pucker）与碱基堆积类型。
- D3.4：E/F 二维接触矩阵，以及当前单 Profile 1D/2D/3D 视图的下载与交互。
- D3.6：同一 PDB×chain 下多个 Profile 的比较、描述统计与显著性边界。
- 永久排除 RMDB 原始反应性热图；不恢复其 UI、RDAT 请求或公开 RDAT 资源。
- 所有生产目录和 DuckDB 检查均为只读；没有修改私有 Case document root、数据库或 Case 数据。

“当前能力”只指 2026-09-12 检查到的生产 Case 资产和 `ghhttps/main` 基线。当前分支上的 C 类候选不计作已上线能力。

## 2. 数据源和检查时间

检查日期为 2026-09-12（14:11 UTC；Europe/Amsterdam 当地 16:11）。输入身份如下。

| 输入 | 身份/状态 |
|---|---|
| 生产源码基线 | `ghhttps/main` = `1fb837b7c17cd97761df457b560eb65d9499f46b` |
| 评估时工作提交 | `7d3c22ceec4025ac43a24621a2fc536a6dc48728`；仅用于读取计划与写报告 |
| Entry Atlas | 本机只读快照（对外路径省略）；764,424,192 bytes；mtime `2026-08-24 17:28:12 +0200`（mtime_ns `1787585292000000000`） |
| 生产 Case 根 | 私有 Case document root 下的 `entry-cases/cases`；只读全量清单审计 |
| 发布手册 | [网站更新手册](../网站更新手册_DEPLOYMENT_HANDBOOK.md)；26,395 bytes；mtime `2026-09-11 12:46:24 +0200`（mtime_ns `1789123584445334084`） |
| 几何覆盖审计 | 本机临时 JSON 与 TSV（对外路径省略）；不纳入仓库 |

数据库快照包含 5,321 个 entry、17,843 条 chain 和 20,550,014 条 chain–profile 关联。数据库通过 `duckdb.connect(path, read_only=True)` 打开；源码能力通过 `git show ghhttps/main:<path>` 检查。只读唯一性复算确认 `COUNT(*) = COUNT(DISTINCT (pdb_id, chain_key, profile_key)) = 20,550,014`，因此这些行不是位点行；但它们属于 Atlas 候选关联，也不能直接当作每个生产 Case 页面已发布的 Profile 数。全库共有 260,441 个全局 distinct `profile_key`，同一个 profile 可关联多个结构链。

## 3. D3.3：糖环构象与碱基堆积

### 3.1 统一评估表

| 维度 | 结论 |
|---|---|
| 评审期望 | 在 Case 中提供可解释、可追溯的糖环构象和碱基堆积类型，而不只是原子坐标或未分类的相互作用连线。 |
| 当前能力 | DuckDB 和生产 linked-view 都没有已物化的 pucker/stacking/torsion/angle/geometry 字段。linked-view 已有 residue locator、interaction/bridge 连接和结构覆盖信息，但这些连接不是经验证的 stacking 类型。生产 mmCIF 基本具备离线计算所需的原子坐标和身份列。 |
| 现有数据覆盖 | 5,321/5,321 manifest 可解析；声明 14,952 个 PDB×auth_chain。linked-view 14,952/14,952 存在且可解析，几何命名字段命中 0/14,952。结构文件 5,321/5,321 存在且 gzip 可读；5,320/5,321 个 Case、14,950/14,952 条声明链同时具有坐标、atom identity、altloc 和 model 字段。唯一结构级例外为 `9A0D`，其 `structure.cif.gz` 可读但没有 `_atom_site` 坐标/身份列。此计数没有证明每个核苷酸的糖环原子都完整。 |
| 缺口 | 缺少计算器、工具许可确认、版本/参数固定、modified residue 映射、altloc/model 选择规则、缺失原子降级、结果 schema、全量覆盖率与独立验证。 |
| 最小可行范围 | 先做离线 pilot；MVP 候选为每残基 sugar-pucker 类别、数值相位/振幅、`not-computable` 原因及 provenance sidecar。只有 pilot 证明覆盖和独立一致性后才进入前端；不在 MVP 同时承诺全部 stacking 类型。 |
| 完整范围 | 在同一版本化 sidecar 中加入 base–base、base–oxygen 等 stacking 类别、置信/规则来源、筛选、3D/序列联动和 JSON/CSV 下载；支持 modified residue 与多模型选择。 |
| 验证方法 | 先用 8SQ9/P、10FZ/A、1GID/A、4P5J/A、7UPH/I 和异常 9A0D 建 golden set；逐残基检查原子完备性和 locator round-trip；与第二实现或人工标注比较；最后只读全量运行并验证 `computed + not-computable = eligible denominator`、sidecar/manifest hash、确定性和重跑一致。 |
| 科学风险 | 坐标存在不等于核糖五元环原子完整；modified nucleotide、alternate location、多 model、低 occupancy 和残基映射都可能改变分类。不同工具的 stacking 阈值也可能不同，因此不得把工具输出写成无条件真值。 |
| 预计工作量 | MVP：M（新增离线管线、sidecar、验证和一个 UI 区域）；完整范围：L（多种几何类型、跨工具验证、筛选/下载与全量重建）。需要新增且固定的科学计算依赖。 |
| 建议 | 不在浏览器即时计算。采用“离线计算 + 版本化 provenance sidecar”，先做小样本算法/许可/覆盖 gate；D3.3 排在本批 D 项最后。 |

### 3.2 全量覆盖证据

全量审计从每个 `browser-manifest.json` 的 `linkedViewBundlePath` 和 `commonAssets.structure` 解析实际路径，没有硬编码猜测文件位置。关键恒等式均闭合：

- manifest：5,321 成功 + 0 失败 = 5,321。
- linked-view：14,952 可解析 + 0 缺失/无效 = 14,952；路径 14,952 个且互不重复。
- 几何字段：0 命中 + 14,952 未命中 = 14,952。
- structure：5,321 存在且可读；5,320 完整 + 1 不完整 = 5,321。按声明链折算为 14,950 完整 + 2 位于 `9A0D` 的不完整链 = 14,952。

抽样语义一致：五个样本的 linked-view 顶层均为 `bridges`、`confidenceSummary`、`interactions`、`lssContext`、`protocolVersion`、`rawAlignmentCoverage`、`residueIndex`、`structureContexts`、`structureCoverage`，协议为 `linked-view-v0.1`。样本分别为：

| 样本 | strand/residue 长度 | resolved residue | bridge 数 | 用途 |
|---|---:|---:|---:|---|
| 8SQ9/P | 35 | 32 | 0 | 小链、普通 Profile |
| 10FZ/A | 1,542 | 1,530 | 426 | 长链与大量缺失 Profile 值 |
| 1GID/A | 158 | 158 | 48 | E/F matrix Case |
| 4P5J/A | 86 | 84 | 22 | 中等普通链 |
| 7UPH/I | 4,438 | 4,438 | 1,154 | 超长链 |

五个样本的 mmCIF 都包含 `_atom_site.Cartn_x/y/z`、atom/comp/chain/sequence identity、`label_alt_id` 和 `pdbx_PDB_model_num`。现有 `interactionKey`/`bridgeKey` 只证明有可联动的残基关系，不能据此命名 stacking。

### 3.3 计算方案比较与依赖

| 方案 | 优点 | 主要问题 | 判定 |
|---|---|---|---|
| 只显示 mmCIF 直接字段 | 无新计算 | 当前生产数据没有目标字段，不能回答评审问题 | 不可行 |
| 离线计算并物化 sidecar | 可固定版本、审计覆盖、复用 residue locator、缓存结果 | 需要新增管线、许可与重建 | 推荐 |
| 浏览器即时计算 | 不需预构建 sidecar | 下载/解析全结构、性能、实现差异和 provenance 均难控制 | 不推荐 |

候选实现必须在开发开始前做许可与科学 gate：

- [X3DNA-DSSR 官方站](https://x3dna.org/)当前页面列出 DSSR v2.9.3；[Columbia Technology Ventures 许可页](https://inventions.techventures.columbia.edu/technologies/dssr-an-integrated--CU20391)说明 DSSR Basic 对 academic community 可免费申请，商业用途需另询许可。这不是可默认再分发的开放源码许可；若采用，需保存获许可的二进制版本、SHA-256、完整命令和输出 schema，并确认服务器使用/结果再分发条款。
- [FR3D Python 官方仓库](https://github.com/BGSU-RNA/fr3d-python)可读 mmCIF 并执行核酸相互作用分类；[FR3D 方法论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC2837920/)描述了几何搜索与 stacking 分类。不过官方仓库主页没有给出明确许可证，因此在集成前必须获得明确许可依据，不能仅因仓库公开就视为可再分发。
- 原子坐标字段的含义以 [RCSB PDBx/mmCIF atom-site 说明](https://mmcif.rcsb.org/docs/tutorials/content/atomic-description.html)和 [PDB 到 PDBx 对照](https://mmcif.rcsb.org/docs/pdb_to_pdbx_correspondences.html)为准。自主实现 Altona–Sundaralingam 类伪旋转计算虽可减少外部运行依赖，但需要独立实现验证和明确数值公差，不能作为“简单前端公式”处理。

建议 sidecar 至少包含：`schemaVersion`、PDB/model/altloc 选择、residue locator、parent/modified base、算法和版本、参数/阈值、输入结构 SHA-256、分类/连续值、`not-computable` 原因、生成时间与生成 commit。前端只读取 sidecar，不重新解释原子坐标。

## 4. D3.4：热图下载与交互

### 4.1 先区分三个对象

1. **E/F 二维接触矩阵**：真正的二维矩阵，当前已有 hover、选择、键盘和跨视图联动；这是 D3.4 最明确的下载对象。
2. **单 Profile 反应性视图**：同一组一维 position/value 数据在 1D、2D VARNA、3D Mol* 中表达；不是新的二维原始热图。
3. **RMDB 原始反应性热图**：产品范围已永久排除。`ghhttps/main` 的 Workbench 基线仍有旧 handler 残留，但不应恢复、扩展或作为下载来源；C 类候选的去可达化也不计作本报告中的生产能力。

### 4.2 统一评估表

| 维度 | 结论 |
|---|---|
| 评审期望 | 热图可交互，并能下载可复现的数据或图形。 |
| 当前能力 | E/F 已有 SVG matrix、hover guide、click/Enter 选择、键盘网格、Escape 清除，以及 sequence/VARNA/Mol* 联动；没有 E/F 下载按钮。普通 Case 已能下载 compressed profile index/shard 和 alignment mmCIF，但没有面向当前 Profile 的逐位置 CSV/JSON，也没有 1D/2D/3D 图形导出。 |
| 现有数据覆盖 | 真实生产 1GID/A E payload 为 `header + axis_i + axis_j + cells`；源矩阵 203×203、19,445 个 triplet，映射后页面显示 158×158 和 11,593 个可见 cells。header 含 family、technology、value_kind、范围、映射 provenance 等；axis 包含 matrix/construct/PDB/VARNA index、observed/adapter/base。 |
| 缺口 | 缺少下载 UI、格式契约、文件名、provenance 嵌入、超大矩阵内存上限、图形导出中 hover/selection 的定义和自动化测试。 |
| 最小可行范围 | 先为 E/F 增加两个互补格式：原始 `ef-matrix*.json.gz` 作为完整可复现主数据，另从已加载 payload 生成 long CSV 供表格分析。CSV 明确为源矩阵的 cell 长表，不声称单文件无损还原完整 JSON header/axis；保留现有交互，不重写 heatmap。Profile 下载另作为次级小项，只导出当前 Profile 的 position/raw/norm/state CSV 或 JSON。 |
| 完整范围 | 再加入带轴、legend、provenance 和确定选择状态的 E/F SVG/PNG；普通 Profile 可导出 1D/2D SVG。3D 只提供带相机/选择/颜色版本元数据的截图，不把截图当作科学数据。 |
| 验证方法 | 对 JSON 校验下载 bytes/hash 与 manifest；对 CSV 核对每个 cell 的源矩阵 `i/j`、值和所连接 axis 字段，验证 cell 总数及列值，但不要求 CSV round-trip 还原全部 header；1GID/A 验证 203×203、19,445 triplets 不漂移；浏览器验证鼠标、键盘、触屏和下载并存；对大 matrix 做内存/耗时基准。 |
| 科学风险 | CSV 若只导出可见/映射 cells 可能被误认为完整原始矩阵；SVG/PNG 若混入瞬时 hover 或省略色标/范围，会使图不可复现。Profile norm 依赖归一化版本，必须同时保留 raw/state/provenance。 |
| 预计工作量 | E/F JSON+CSV MVP：S；Profile 当前行 CSV/JSON：S–M；稳定 SVG/PNG/3D snapshot：M。无需新科学依赖，但大文件可能需要离线生成或流式输出。 |
| 建议 | D3.4 作为下一批第一项；先交付 E/F JSON.gz + long CSV，交互沿用现状。图形导出和 Profile 导出分批，不把四种格式一次承诺完。 |

### 4.3 真实页面与 schema 证据

生产页 `1GID/A?family=E` 的实测结果：matrix 呈现为 158×158，范围 `-0.6967…11.7703`，hit grid 可聚焦。Arrow 键移动到有效 cell 后显示 `i 9 × j 1 · 0.031`，并在序列/VARNA 标记 12 个联动节点；Enter/click 后显示 cell/row/column 选择并同步 Mol* 至 `PDB 7 C`；Escape 清除全部选择。页面没有 Download/Export 控件。

生产 payload `entry-cases/cases/1GID/chains/A/ef-matrix.json.gz` 的核心字段为：

- `header`：`pdb_id=1GID`、`chain=A`、`family=E`、`technology=MCA`（UI 公共标签 MOHCA）、`value_kind=cohcoa_contact`、`n_rows=n_cols=203`、`symmetric=false`、`render_scope=mapped_chain`、`color_scale=matrix_extent`，并含 exact RMDB profile/HSP/mapped counts。
- `axis_i`/`axis_j`：`matrix_index`、`construct_pos`、`pdb_pos`、`varna_index`、`observed`、`is_adapter`、`base`。
- `cells`：19,445 个 `[i,j,value]` triplet；不能只从 158×158 可见区域反推源数据。

基线源码证据来自 `public/entry-cases/__entry_ef_site__/ef-heatmap.js`、`ef-heatmap-core.js`、`ef-case.js` 和 `public/entry-cases/__entry_v3_site__/workbench*.{js,mjs}`。源码有完整交互状态，但没有 E/F export/download 实现。

### 4.4 下载格式边界

| 对象/格式 | 生成位置 | 必要元数据与文件名 | 大小/行为风险 | 建议 |
|---|---|---|---|---|
| E/F JSON.gz | 直接链接既有资产 | 原 bytes；`<PDB>_<chain>_<family>_matrix.json.gz` | 最可复现，但普通用户阅读不便 | MVP 1 |
| E/F long CSV | 客户端从已加载 payload；超阈值改为离线产物 | `pdb_id,chain,family,matrix_i,matrix_j,construct_i,construct_j,pdb_i,pdb_j,varna_i,varna_j,observed_i,observed_j,is_adapter_i,is_adapter_j,base_i,base_j,value,value_kind,technology`；`<PDB>_<chain>_<family>_matrix_long.csv`。`matrix_i/j` 明确是 payload 原始 0-based 索引；完整 header/mapping provenance 随并列 JSON.gz 提供 | 这是源矩阵非空 cell 的分析长表，不含空 cell 或所有 header；超大 payload 可能占用过多内存 | MVP 2，先基准后定阈值 |
| E/F SVG | 客户端克隆当前 SVG | 轴、legend、范围、provenance；`..._matrix.svg` | 字形/CSS、巨大 DOM；hover 是瞬时状态 | 后续；排除 hover，selection 明确写入 metadata |
| E/F PNG | SVG rasterize 或服务端生成 | 与 SVG 同一 metadata，另记像素尺寸/DPR | 非数据格式、分辨率和浏览器差异 | 后续预览用途 |
| Profile CSV/JSON | 客户端从当前解压 row + strand locator | `position,base,raw,norm,state,mapped`、profile id、normalization；`<PDB>_<chain>_<profile>_reactivity.*` | profile id 需安全化；NaN/缺失必须显式 | 次级 MVP |
| 1D/2D SVG | 客户端克隆并内联样式 | legend、profile/provenance、当前选择策略 | pattern/CSS/字体依赖 | 后续 |
| 3D screenshot | Mol* canvas snapshot | 相机、model、selection、颜色版本、尺寸 | 不是可复算数据；WebGL/browser 差异 | 仅作为展示附件 |

## 5. D3.6：多 Profile 比较与统计

### 5.1 统一评估表

| 维度 | 结论 |
|---|---|
| 评审期望 | 在同一结构/链上比较多个 Profile，并给出适当统计。 |
| 当前能力 | profile index/shard 已把同一 PDB×chain 的 Profile 放到共同 `render_strand_id` 和固定 `strand_length`，每行有 row_index 与 mapped/unmapped 计数；技术分类另有 public-techniques sidecar。当前 UI 一次只显示一个 Profile。 |
| 现有数据覆盖 | Atlas profile 表有 20,550,014 条唯一 chain–profile 候选关联；14,953 个有候选关联的 PDB×chain 中，14,917 个至少关联 2 个 profile_key，14,907 个跨 technology。`n_evaluable` 覆盖 100%，但 CI/FDR 各只有 1,033,349 条关联（5.03%）。同链同 technology 且关联多个 profile_key 的分组有 82,860 个，单链候选关联最高 26,088。生产 profile index 是另一个、更窄的发布集合，MVP 只可使用 index 中实际发布的 Profile。 |
| 缺口 | profile index/shard 和 public-techniques sidecar 没有 per-profile condition、biological/technical replicate identity、实验 sample size、per-position error 或 repeated observations。DuckDB 的 `n_evaluable`/CI/FDR 是评价指标，不等同于实验重复和位点误差。 |
| 最小可行范围 | 限制在同一 PDB×chain，且只从生产 profile index 的已发布集合选择 2–4 个 Profile；在共同 strand 坐标上并排/叠加，显示覆盖/缺失，计算共享 finite positions 上的逐位点差值、散点和描述相关性。按 technology/normalization 分层提示，不做显著性检验。 |
| 完整范围 | 在补齐 condition、replicate、sample size、per-position uncertainty 和明确实验设计后，才评估组间模型、批次校正、多重检验与跨探针比较；大规模选择需要搜索、分页/虚拟化和服务端预聚合。 |
| 验证方法 | 同一 strand 的 locator/长度/order 一致性；NaN 不转 0；相关系数同时报告 n_shared；用已知向量验证 Pearson/Spearman/差值；不同 normalization 或 technology 必须显式警告；对 2、40、626、6,226 和超长 4,438-nt 样本做性能测试。 |
| 科学风险 | 把 nucleotide 当作独立生物重复会产生伪重复；混合 probe、condition、normalization 或批次的相关性难以解释；高缺失率可显著改变结果。没有实验设计元数据时不能可靠承诺显著性。 |
| 预计工作量 | 2–4 Profile 可视化与描述统计：M；补元数据/研究设计与显著性分析：L–XL，且首先是数据治理任务。无需为 MVP 新增统计依赖，完整范围可能需要后端统计管线。 |
| 建议 | D3.6 作为下一批第二项，只承诺对齐查看、差值、覆盖和描述相关性；显著性明确留待元数据补齐后重新评估。 |

### 5.2 schema 与覆盖证据

`profile` 表共有 25 列：`pdb_id`、`chain_key`、`profile_key`、`technology`、`measurement_family`、`recall_metric_id`、`directional_value`、`conflict_fraction`、`lss_tier`、`lss_reason`、`confidence_ranked_set_eligible`、`signal_direction`、`calibration_status`、`permutation_status`、`source_lane`、`n_evaluable`、`n_paired_evaluable`、`n_unpaired_evaluable`、`auc_ci_low`、`auc_ci_high`、`fdr_q`、`null_kind`、`probing_category`、`is_background_channel`、`tech_filter`。没有 condition/replicate/per-position error 字段。

`profile` 表每个 `(pdb_id, chain_key, profile_key)` 都是唯一关联：20,550,014 行与 20,550,014 个 distinct 三元组完全相等。下面是 **Atlas 候选 chain–profile 关联数** 分布，不是生产页面 profile index 的发布数量：

| 候选 profile_key 关联数 | chain 数 | 占 14,953 个有候选关联 chain |
|---:|---:|---:|
| 1 | 36 | 0.24% |
| 2–4 | 1,429 | 9.56% |
| 5–20 | 2,093 | 14.00% |
| 21–100 | 3,947 | 26.40% |
| 101–1,000 | 2,499 | 16.71% |
| >1,000 | 4,949 | 33.10% |

最高候选关联计数为 7O7Z/I[AH] 26,088、7O7Y/I[AH] 26,064、7O80/I[AH] 26,064、7O81/I[AH] 26,064、6XRZ/A[A] 25,283、8VCI/A[A] 25,126、7UPH/I[I] 13,241。99.69% 的有候选关联 chain 跨至少两种 technology，说明不能从 Atlas 候选集合直接生成一个“全选”比较器。

数据库计数与生产 index 不是同一分母。例如 7UPH/I 在 Atlas 中有 13,241 条唯一候选关联，而当前生产 profile index 只发布 2 条；10FZ/A 分别为 75 与 40。相反，8SQ9/P、1GID/A、4P5J/A 的样本计数恰好一致。报告不推测筛选差异的原因；前端可比较范围以生产 manifest 指向的 profile index 为唯一准入集合。

五个生产 profile index/shard 样本均使用 `float32_le_row_major`、`missing_value=NaN`，并通过 `row_index × strand_length` 定位同一 strand 上的一行。每个样本均只有 shard `000000`，index 声明 `gzip_path=profiles/shards/000000.f32.bin.gz`、`meta_path=profiles/shards/000000.meta.json.gz`：

| 样本 | Atlas 候选关联 | 已发布 Profile | strand length | `row_index` 范围 | shard | 首行 mapped / unmapped |
|---|---:|---:|---:|---:|---|---:|
| 8SQ9/P | 2 | 2 | 35 | 0–1 | `000000` | 35 / 0 |
| 10FZ/A | 75 | 40 | 1,542 | 0–39 | `000000` | 63 / 1,479 |
| 1GID/A | 6,226 | 6,226 | 158 | 0–6,225 | `000000` | 70 / 88 |
| 4P5J/A | 626 | 626 | 86 | 0–625 | `000000` | 45 / 41 |
| 7UPH/I | 13,241 | 2 | 4,438 | 0–1 | `000000` | 110 / 4,328 |

profile index 字段只有 identity、length、row/shard 位置和 mapped/unmapped 计数；public-techniques sidecar 只有 `profileId`、`classificationStatus` 和 method/category labels。共同坐标足够做可视化和受限描述统计，但不构成显著性所需的实验设计。

### 5.3 三层结论

1. **并排/叠加可视化：可做。** 共同 strand 坐标、明确 NaN 和 locator 已存在；必须把选择限制为 2–4 条，并展示每条的 mapped/unmapped 覆盖。
2. **描述统计/相关性：有条件可做。** 只对两条 Profile 的共同 finite positions 计算，报告 `n_shared`、缺失比例、technology 和 normalization；相关性是位点模式相似度，不是 biological-replicate inference。
3. **显著性检验：当前不能可靠承诺。** 需要 per-profile condition、biological/technical replicate、sample size、per-position error/repeated observations，以及预先定义的比较设计和多重检验策略。不能把各 nucleotide 当作独立生物重复。

## 6. 跨项依赖

| 项目 | 用户价值 | 数据成熟度 | 科学解释风险 | 前端量 | 数据/后端量 | 测试难度 | 新依赖 | 本轮判定 |
|---|---|---|---|---|---|---|---|---|
| D3.4 E/F JSON+CSV | 高：直接复用分析结果 | 高 | 低–中 | S | S | S–M | 否 | 下一批首选 |
| D3.6 2–4 Profile 比较 | 高：回答实验间差异 | 中：坐标成熟，设计元数据不足 | 中 | M | S–M | M | MVP 否 | 第二顺位，仅描述性 |
| D3.3 几何 sidecar | 中–高：增加结构解释 | 原子坐标高、目标字段为 0 | 高 | M | M–L | L | 是，且需许可 | pilot 后再定 |

共同依赖和不能混用的边界：

- D3.4 Profile 导出和 D3.6 可复用同一个“当前解压 row → strand position → raw/norm/state”纯数据模型；先定义该模型可降低重复实现。
- D3.3 必须扩展生成管线和 manifest/linked-view provenance，不能只改前端。
- D3.4 E/F matrix 的坐标与 D3.3 stacking 的残基对不是同一种科学对象；E/F cell 不能直接重标为 stacking。
- D3.6 的 `technology` 分类可以用于筛选/分层，但不能替代 condition/replicate 元数据。

## 7. 推荐实施顺序

1. **先做 D3.4 E/F 下载 MVP（S）。** 暴露 exact JSON.gz，并从已加载 payload 生成 long CSV；沿用已验证交互。先用 1GID/A 做 JSON byte/hash 校验、CSV cell/axis 对账和浏览器验收，再对大 matrix 基准后确定客户端阈值。
2. **再做 D3.6 受限多 Profile 比较（M）。** 只允许同一 PDB×chain 选择 2–4 条；先交付并排/叠加、差值、`n_shared`、缺失覆盖和描述相关性。显著性入口不出现。
3. **最后做 D3.3 离线 pilot（M，产品化为 L）。** 先确认工具许可并固定版本，对代表样本和 9A0D 做 coverage/concordance gate；优先验证 sugar-pucker MVP，再决定是否物化 stacking。
4. **元数据治理另立任务（L–XL）。** 若后续确需 D3.6 显著性，先定义 condition/replicate/sample-size/error schema 和来源，不把统计按钮先于数据设计上线。

该顺序的理由是：D3.4 使用已有成熟 payload 且科学风险最低；D3.6 的共同坐标足以支持受限描述比较；D3.3 需要新科学依赖、全量生成和验证，最不适合直接塞入前端。

## 8. rebuttal 可用措辞

> We have completed a data- and implementation-level scope assessment for the requested geometry annotations, heatmap export/interaction, and multi-profile comparison. The current site already provides interactive E/F matrices with linked sequence, secondary-structure, and 3D selection, while downloadable matrix formats are not yet exposed. Existing Case assets provide near-complete coordinate-bearing mmCIF coverage and shared per-chain profile coordinates, but geometry annotations are not yet materialized, and replicate/condition/error metadata are insufficient for reliable significance testing. We therefore plan a staged implementation: reproducible E/F JSON/CSV export first, bounded 2–4-profile descriptive comparison second, and a licensed, versioned offline geometry-annotation pilot with independent validation before broader deployment. Significance testing will only be considered after the required experimental-design metadata is available.

中文工作说明：已完成范围评估和依赖盘点；未声称几何参数、热图下载或多 Profile 统计已经实现或上线。

## 9. 尚待用户决定的问题

下一批开始前只需做三项产品选择：

1. D3.4 是否按推荐只先做 **E/F exact JSON.gz + long CSV**，把 SVG/PNG 和普通 Profile 导出放到后续。
2. D3.6 是否接受 **同一 PDB×chain、最多 2–4 个 Profile、仅描述统计** 的明确边界。
3. D3.3 pilot 是否允许评估需申请许可的 DSSR；若不允许，应先确认 FR3D Python 的明确许可，或为自主 pucker 实现安排独立科学验证。

在这些选择确定且另行授权前，不开始 D 类实现，不发布，也不替换生产资产。
