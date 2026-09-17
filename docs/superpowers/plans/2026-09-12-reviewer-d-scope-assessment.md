# 评审 D 类实现范围评估计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 对 D3.3 几何参数、D3.4 热图下载与交互、D3.6 多 Profile 比较与统计完成证据化范围评估，给出可进入下一批决策的方案、依赖、风险和工作量，不实现任何 D 类功能。

**架构：** 评估分为数据层、生成管线、前端交互和科学解释四层。所有生产数据检查只读；结论必须区分“已有能力”“可由现有数据实现”“需要新增生成/元数据”和“当前证据不足”。唯一交付物是一份 Markdown 报告。

**技术栈：** DuckDB 只读查询、gzip/JSON 清单审计、现有 Case JavaScript 源码审计、mmCIF/linked-view 字段抽样、Markdown。

---

## 依据与边界

- 设计规格：`docs/superpowers/specs/2026-09-12-reviewer-c-fixes-and-d-assessment-design.md`
- 发布手册：`/Users/joseperezmartinez/docs/foldbridge/.worktrees/update-deployment-handbook/docs/网站更新手册_DEPLOYMENT_HANDBOOK.md`
- 只读数据库：`/Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb`
- 只读 Case 根：`/Volumes/tianyi/Server/public/entry-cases`
- 输出：`docs/reviewer-response/2026-09-12-d-class-scope-assessment.md`
- 不改数据库、Case 资产、前端代码或生产目录；不恢复 RMDB 原始反应性热图；不把可行性写成已交付功能。
- “当前已有能力”只以生产 Case 资产与执行时记录的 `ghhttps/main` 为基线；即使本计划在 C 类修复之后执行，也不得把当前分支的未发布候选写成已有或已上线功能。

## 文件结构

- 新建：`docs/reviewer-response/2026-09-12-d-class-scope-assessment.md`——唯一成果，包含 D3.3、D3.4、D3.6 的证据表、方案比较、工作量和建议顺序。
- 读取：`public/entry-cases/__entry_v3_site__/workbench.js`、`workbench-pure.mjs`——Profile 视图、已有下载、坐标和统计能力。
- 读取：`public/entry-cases/__entry_ef_site__/ef-heatmap.js`、`ef-heatmap-core.js`、`ef-case.js`——E/F 热图交互和可导出性。
- 读取：生产 `browser-manifest.json`、`linked-view.json.gz`、`profile-index.json.gz`、`ef-matrix*.json.gz`、`structure.cif.gz` 的小样本——只做字段与覆盖率审计。
- 读取：Entry Atlas DuckDB 的 `chain`、`entry`、`profile` 表——只做 schema 和聚合查询。

### 任务 1：建立证据模板和只读护栏

**文件：**

- 新建：`docs/reviewer-response/2026-09-12-d-class-scope-assessment.md`

- [ ] **步骤 1：创建报告骨架**

用 `apply_patch` 创建报告，包含：

1. 范围与非目标；
2. 数据源和检查时间；
3. D3.3；
4. D3.4；
5. D3.6；
6. 跨项依赖；
7. 推荐实施顺序；
8. rebuttal 可用措辞；
9. 尚待用户决定的问题。

每个 D 项使用同一张表：评审期望、当前能力、现有数据覆盖、缺口、最小可行范围、完整范围、验证方法、科学风险、预计工作量、建议。

- [ ] **步骤 2：记录只读输入身份**

```bash
stat -f '%N %z bytes %Sm' \
  /Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb
git fetch ghhttps main
FOLDBRIDGE_D_BASE=ghhttps/main
git rev-parse "$FOLDBRIDGE_D_BASE"
git rev-parse HEAD
git status --short --branch
```

在报告记录数据库路径/大小/mtime、生产基线 commit、当前工作 commit 和检查日期。对“已有源码能力”的引用使用 `git show "$FOLDBRIDGE_D_BASE":<path>`，当前工作树只用于读取计划和写评估报告。禁止对这些输入运行写模式 DuckDB、构建脚本、`rsync --delete` 或任何生产替换。

### 任务 2：评估 D3.3 糖环构象与碱基堆积

**文件：**

- 读取：`/Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb`
- 读取：`/Volumes/tianyi/Server/public/entry-cases/cases/8SQ9/chains/P/linked-view/linked-view.json.gz`
- 读取：`/Volumes/tianyi/Server/public/entry-cases/cases/8SQ9/structure.cif.gz`
- 修改：`docs/reviewer-response/2026-09-12-d-class-scope-assessment.md`

- [ ] **步骤 1：盘点数据库字段**

使用明确的 DuckDB Python 运行时和 `read_only=True` 查询 `information_schema.columns`，检索 `pucker|sugar|stack|torsion|angle|geometry`，并列出 `profile` 全部列：

```bash
FOLDBRIDGE_DUCKDB_PY=/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
"$FOLDBRIDGE_DUCKDB_PY" -c "import duckdb; p='/Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb'; c=duckdb.connect(p, read_only=True); print(c.execute(\"SELECT table_name,column_name,data_type FROM information_schema.columns WHERE regexp_matches(lower(column_name),'pucker|sugar|stack|torsion|angle|geometry') ORDER BY table_name,ordinal_position\").fetchall()); c.close()"
```

预期基线：当前快照可能没有这些几何字段；执行时必须以新鲜查询为准，不能把本计划中的观察当作永久事实。

- [ ] **步骤 2：全量盘点生产 Case 的几何数据覆盖**

只读遍历 `/Volumes/tianyi/Server/public/entry-cases/cases/*/browser-manifest.json`，把“所有可解析 manifest 中声明的 PDB×auth_chain”定为链级分母 N，把“所有可解析 manifest”定为 Case 级分母 M。对每条链按 manifest 的 `linkedViewBundlePath` 解析实际路径，对每个 Case 按 `commonAssets.structure` 解析 mmCIF 路径，不用硬编码推测路径。

全量统计并在报告写出精确计数和比例：

- manifest 成功/失败 Case 数，以及链级分母 N；
- linked-view 文件存在数、gzip/JSON 可解析数、缺失数；
- 递归字段名命中 `pucker|sugar|stack|torsion|angle|geometry` 的 bundle 数，并对每个命中字段分别统计“出现记录数、非空且可解释值数、空/无效值数”；
- structure mmCIF 文件存在数、gzip 可解压数、含 `_atom_site.Cartn_x/y/z` 与 atom/model/altloc 身份列的 Case 数、缺失数。

计数结果先写入 `/tmp/foldbridge-d3-3-coverage.*` 下的 TSV/JSON，在纳入报告前检查 `valid + missing = denominator`、路径不重复，并保留最多 20 条失败样例及总失败数。该全量审计只回答“已物化字段和源坐标是否存在”；不在此步根据坐标计算新的糖环构象或 stacking，也不把“有坐标”等同于“可完整计算”。

- [ ] **步骤 3：抽样核对字段语义与坐标可用性**

从 8SQ9/P 和至少 4 个不同结构类型/链长度的 Case 抽样：核对 linked-view 顶层字段、residue locator、interaction/bridge 信息，以及 mmCIF 原子坐标、缺失原子、altloc 和模型编号的实际语义。样本必须包含一个 E/F Case，但不要把 E/F 接触矩阵当作碱基堆积类型。抽样只用于解释全量计数和识别可计算性风险，不代替覆盖率分母。

- [ ] **步骤 4：比较三种实现范围**

在报告明确比较：

- 只显示 mmCIF 已直接提供的几何字段；
- 离线从原子坐标计算糖环构象与 stacking，再物化到 linked-view sidecar；
- 浏览器即时计算。

默认建议应优先“离线计算 + 带来源/版本的 sidecar”，但只有确认算法、输入完整性和覆盖率后才能定案。报告列出候选工具/算法、许可、版本固定、modified residue 处理、altloc/model 选择、缺失原子降级和独立验证要求；需要查外部文档时只引用官方文档或论文。

- [ ] **步骤 5：给出 D3.3 分阶段建议**

分别给出 MVP 与完整范围：MVP 可只展示覆盖率较高、解释稳定的一类参数；完整范围才包含更多构象/stacking 类型、筛选和下载。工作量用 S/M/L 与依赖项表示，不给没有依据的日历承诺。

### 任务 3：评估 D3.4 热图下载与交互

**文件：**

- 读取：`public/entry-cases/__entry_ef_site__/ef-heatmap.js`
- 读取：`public/entry-cases/__entry_ef_site__/ef-heatmap-core.js`
- 读取：`public/entry-cases/__entry_ef_site__/ef-case.js`
- 读取：`public/entry-cases/__entry_v3_site__/workbench.js`
- 读取：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs`
- 读取：`/Volumes/tianyi/Server/public/entry-cases/cases/1GID/chains/A/ef-matrix.json.gz`
- 修改：报告

- [ ] **步骤 1：先拆清“热图”对象**

报告必须分开：

- E/F 二维接触矩阵；
- 当前单 Profile 的 1D/2D/3D 反应性视图；
- 已永久停用的 RMDB 原始反应性热图（排除，不进入候选范围）。

- [ ] **步骤 2：审计 E/F 已有交互**

从 `git show "$FOLDBRIDGE_D_BASE":<path>` 取得的基线源码和一个真实生产 E/F matrix 样本记录：hover guide、click selection、键盘 grid、跨 sequence/VARNA/Mol* 联动、矩阵 header/axis/cell schema，以及当前是否已有下载入口。不要仅凭函数名判断；在真实生产 E/F 页面操作一次并记录行为。当前分支中的 C 类候选只能标为“计划中/未发布”。

- [ ] **步骤 3：评估下载格式**

对 E/F 矩阵分别评估：

- 原始/整理后的 JSON；
- 长表 CSV（i、j、值、来源/类型）；
- SVG；
- PNG。

对 Profile 视图分别评估 CSV/JSON（position、raw、norm、state）与 1D/2D SVG、3D screenshot 的可重复性。每种格式记录生成位置（客户端/离线）、大小风险、元数据、文件名和测试方式。

- [ ] **步骤 4：提出最小建议**

优先复用现有 E/F SVG 和交互状态，MVP 只增加最有价值且可复现的 1–2 个格式；不要把所有 PNG/SVG/CSV/JSON 一次性承诺为同一批。明确截图是否包含当前 hover/selection、色标、轴和 provenance。

### 任务 4：评估 D3.6 多 Profile 比较与统计

**文件：**

- 读取：DuckDB `profile` 表
- 读取：生产 `profile-index.json.gz` 与 profile shards 的样本元数据
- 读取：`workbench.js` 中 Profile 加载、坐标映射、`profileResidueRows()` 与下载逻辑
- 修改：报告

- [ ] **步骤 1：核对比较所需身份字段**

只读盘点 `profile_key`、technology、measurement_family、source_lane、n_evaluable、置信区间/FDR 字段，并核对 profile index/shard 是否携带：

- 同一序列坐标；
- probe/reagent 与条件；
- biological/technical replicate 身份；
- 样本量；
- 每位点误差或重复观测。

把“字段不存在”“字段存在但覆盖不足”“字段语义不明”分开报告。

- [ ] **步骤 2：量化可比较组覆盖**

用只读聚合查询统计：每 PDB×chain 的 Profile 数分布、同一链同一方法的 Profile 数、跨方法 Profile 数、含 `n_evaluable`/CI/FDR 的记录数。对 8SQ9/P 和至少 4 个多 Profile Case 解压 profile index，确认 row_index、strand length、mapped/unmapped 计数和 shard 布局。

查询只输出聚合计数和小样本，不导出 20,550,014 行 profile 表。

- [ ] **步骤 3：分三层给结论**

分别评估：

1. 并排/叠加可视化——只要求共同 strand 坐标与明确缺失值；
2. 描述统计/相关性——要求共同可评估位置、缺失策略、方法/归一化分层；
3. 显著性检验——要求独立重复、实验设计、样本量和误差模型。

如果重复实验身份或误差字段不足，显著性检验结论必须是“当前不能可靠承诺”，并说明需要补什么数据；不能拿每个 nucleotide 当作独立生物重复。

- [ ] **步骤 4：给出渐进范围**

推荐从“同一 PDB×chain 的 2–4 个 Profile 对齐查看 + 位置级差值/相关性 + 缺失覆盖提示”开始；把跨探针显著性、批次校正和大规模组间比较列为后续研究设计，不塞入 MVP。

### 任务 5：汇总结论并进行报告自检

**文件：**

- 修改：`docs/reviewer-response/2026-09-12-d-class-scope-assessment.md`

- [ ] **步骤 1：形成跨项优先级**

用一张决策表按以下维度比较 D3.3、D3.4、D3.6：用户价值、现有数据成熟度、科学解释风险、前端工作量、后端/数据管线工作量、测试难度、是否需要新增依赖。给出推荐下一批顺序和理由。

- [ ] **步骤 2：写 rebuttal 可用措辞**

措辞只说明“已完成范围评估、已识别现有能力和数据缺口、计划分阶段实现”。不要写“已支持几何参数/热图下载/多 Profile 统计”。

- [ ] **步骤 3：自检证据和非目标**

```bash
rg -n "已实现|已上线|已经支持|RMDB raw|显著性" \
  docs/reviewer-response/2026-09-12-d-class-scope-assessment.md
git diff --check
git diff -- docs/reviewer-response/2026-09-12-d-class-scope-assessment.md
```

逐条检查：每个事实有本地路径/命令/样本证据；每个推断标为建议或待验证；RMDB 原始热图被明确排除；显著性检验没有越过实验设计证据。

- [ ] **步骤 4：提交评估报告**

```bash
git add docs/reviewer-response/2026-09-12-d-class-scope-assessment.md
git commit -m "docs(评审): 评估 D 类功能实现范围"
```

## 完成标准

报告能直接回答 3 个问题：现在有什么、还缺什么、下一批最小应该做什么。完成本计划不代表任何 D 类功能已经开发或发布，也不触发 Git push、Pages 或 Tunnel 变更。
