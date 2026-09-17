# ANNOJOIN Atlas 总表按 chain 生物学身份聚合 — 设计

- 状态：草案（待 spec 审查）
- 日期：2026-06-29
- 仓库：`~/docs/foldbridge`（vanilla-JS 静态站）
- 关联前序设计：`2026-06-26-annojoin-atlas-master-table-search-design.md`、`2026-06-29-annojoin-atlas-index-slim-fast-rebuild-design.md`

## 1. 背景与问题

ANNOJOIN Atlas 总表当前以 **case（PDB）级** 的两层 free-text 分类驱动分组：

```
parentClassLabel → childClassLabel → PDB
```

这两个标签来自上游 `parent_class_label` / `child_class_label`，是 case 级的自由文本生物学分类。它们语义不明确、拼写不统一、含占位垃圾（`RASP public current` / `raw-hit case` / `pending ...`），因此每次有新数据或发现误标，都要人工重新归类——**反复重来的根因**。

与此同时，仓库已经构建了一条**更干净的 chain 级身份轴**：`scripts/lib/annojoin-atlas-chain-identity.mjs` 的 `buildChainIdentityIndex` 从全库 RNA 链声明身份表派生每条链的 `parent_rna_class`（受控词表）和折叠后的规范展示名。但这条轴**只喂详情页**（`build-annojoin-atlas.mjs:530` 注入 per-case 详情资产），从未进入 index 层的 `displayCases`，因此**没有驱动总表分组**。

### 1.1 数据质量实测（27,803 条 RNA 链行）

源表 `/Volumes/tianyi/tmp/PDB/04_pdb_metadata/pdb_rna_entity_chain_declared_identity.tsv`：

| 列 | 质量 | 是否适合做聚合轴 |
|---|---|---|
| `parent_rna_class` | 干净受控词表（tRNA / rRNA / ribozyme / other_RNA / viral_genomic_RNA / designed_RNA …） | ✅ 顶层分组首选 |
| `parent_rna_name` | 混杂：约 41%（11,407 行）是 >60 字符的原始结构标题或管道拼接（`RNA \| Virus-like particle of... \| unidentified`） | ❌ 直接做名字会重蹈覆辙，需折叠 |
| `declared_identity_phrase` | 常为原始全大写结构标题或泛词（`TRNA`） | 仅作 name 折叠的原始输入之一 |
| `entity_description` | 常空或过泛（`RNA`/`TRNA`），仅 22,365/27,803 有值 | ❌ 不是 class，不适合做分类轴 |

**结论**：聚合应按 chain 的**class**（`parent_rna_class`，干净），name 必须经全库最高频拼写折叠（复用已有 `buildCanonicalByFoldKey`），绝不直接用 raw `parent_rna_name`。

## 2. 目标与非目标

### 目标
- 总表分组从 case-level free-text 标签切换到 **chain-level 生物学身份**（class → 规范 name → PDB 三层树）。
- 一个 PDB 按其所含每个 distinct `(class, canonicalName)` 出现在对应分支（多 chain 多身份 → 多 placement）。
- 彻底移除导致反复重来的 case-level 分类标签及其占位清洗逻辑。
- 计数语义清晰：distinct PDB 数与 placement 数都可见，不混淆。

### 非目标（YAGNI）
- 不改详情页的 chain 身份渲染（`annojoinCaseView.js` 已正确展示 per-chain 身份）。
- 不动 chain 身份的 verified/URS 治理逻辑（`biological_layer:final_identity`）。
- 不改造搜索/facet 机制本身（沿用现有 `buildAtlasSearchState`）。
- 不引入任何 UI 框架/打包器（保持无框架 vanilla 静态站）。

## 3. 架构总览

> **关键校正（实现前读真实渲染路径得出）**：总表的实际分组渲染**不**走 `annojoinAtlasData.js` 的 `buildCaseHierarchy`（L194/L579-580 产出的 `caseHierarchy`/`sourceCaseHierarchy` 是**死代码**，grep 确认 view 从不消费）。真实路径是 **`src/annojoinAtlasTableModel.js:buildAnnojointTableGroups`**，由 `annojoinAtlasView.js:470` 调用。分组是**逐页**的（在 `paginateAnnojointRows` 之后对当页 ~50 行 case 分组），不是全量静态树。三层折叠 UI **已存在**（`annojoinAtlasView.js:180-219` parent-group-row → child-group-row → case-rows）。本设计的核心（chainPlacements 字段、2+3 placement 展开、distinct-PDB 计数、移除 case-level 标签噪声）不变，仅把改造目标从 `buildCaseHierarchy` 改为 **table model 的分组函数**。

```
build-annojoin-atlas.mjs
  │  chainIdentityIndex = buildChainIdentityIndex({declaredIdentityRows, governedRows})
  │  （现状：仅注入 per-case 详情资产 L530）
  ▼
buildAtlasIndexAsset({ ..., chainIdentityIndex })   ← 新增入参
  │  对每个 displayCase 派生 chainPlacements = 去重后的 [(classLabel, nameLabel)]
  ▼
index.json { displayCases[].chainPlacements, totalCaseCount, totalPlacementCount, ... }
  ▼
浏览器 annojoinAtlasData.js:normalizeCase 透传 chainPlacements（铁律：漏带字段是隐形杀手）
  ▼
annojoinAtlasView.js:465-470 真实渲染管线：
  sortAnnojointCases(atlasState.cases)        ← 按 case 主 placement 排序
    → searchAnnojointRows                      ← 搜索（搜索态不分组）
    → paginateAnnojointRows                    ← 分页（pagination 单元 = case）
    → buildAnnojointTableGroups(pagination.rows) ← 逐页：每 case 按 chainPlacements 展开成 class→name→PDB
  ▼
annojoinAtlasView.js:180-219 三层折叠 UI（已存在，class 行 → name 行 → PDB 行）
```

**单元边界**：
- `buildAnnojointTableGroups(rows)`（table model，现签名不变）— 纯函数，无 I/O。改造：从"每 row 一个 (parentLabel, childLabel) 分组"变成"遍历 `row.chainPlacements`，每个 `(classLabel, nameLabel)` 把该 row 挂到 `class → name` 分支"。多身份 case 自然出现在多分支。可独立单测（`test/annojoin-atlas-table-model.test.js`）。
- `sortAnnojointCases(cases)`（table model）— 改造：按 case 的**主 placement**（`chainPlacements[0]` 的 class，再 name）排序，保证逐页分组确定性。pagination 单元仍是 case，故同一 case 的所有 placement 必落同一页（不会被分页拆散）。
- placement 派生（需 chain index）发生在 build 的 `buildAtlasIndexAsset` 里，结果写进 displayCase 的 `chainPlacements`；table model 只读 `chainPlacements`，不依赖 chain index。
- 逐页分组语义沿用现状（`buildAnnojointTableGroups(pagination.rows)` 本就对当页分组，随搜索/分页变化）。

## 4. 数据流改造（build 脚本 + index builder）

### 4.1 build-annojoin-atlas.mjs
`buildAtlasIndexAsset(...)` 调用处新增 `chainIdentityIndex` 入参（该 Map 已在 L355 构建，目前只用于 per-case 注入）。不改它的构建方式。

### 4.2 corpus.mjs `buildAtlasIndexAsset`
- 函数签名新增 `chainIdentityIndex = new Map()`。
- 给每个 displayCase 派生 **`chainPlacements`** 字段：`[{ classLabel, nameLabel }]`，由该 PDB 在 chain index 里所有 RNA chain 按 `(rnaClass, displayName)` 去重而来（见 §5.2）。chain 查无 → 单条兜底 placement（见 §6）。该字段随 displayCase 进 index，供浏览器 table model 逐页展开分组（见 §7）。
- **`chainPlacements` 数组按 `(classLabel, nameLabel)` localeCompare 升序排好再写**（保证 `chainPlacements[0]` = 该 case 的确定性主 placement，供 `sortAnnojointCases` 排序用，见 §3 单元边界）。
- 返回对象：
  - `totalCaseCount` = distinct PDB 数（= `displayCases.length`，不变）
  - 新增 `totalPlacementCount` = 全量 `displayCases[].chainPlacements.length` 之和（供表头双显，见 §5.3）
  - **不再产 `caseHierarchy`/`sourceChainHierarchy`** —— 旧 `caseHierarchy` 是死代码（§3 校正），直接删，不替换成新静态树。分组逐页在浏览器 table model 算。
- **`chainPlacements` 必须在 `slimAtlasIndexForWrite` 中保留**（table model 分组依赖它），不可像 `profilePreview` 那样被瘦身丢弃。

### 4.3 canonical name 复用
顶层 class 直接用 `parent_rna_class`（chain index 已带 `rnaClass` 字段）。中层 name 用 chain index 的 `displayName` 字段——它已在 `annojoin-atlas-chain-identity.mjs` 经 `buildCanonicalByFoldKey` 折叠（`declared_identity_phrase || parent_rna_name` 取全库最高频拼写）。**不在本设计里重新折叠**，直接消费 index 已算好的 `displayName`，保证总表与详情页的 name 一致。

## 5. 树结构与计数语义

### 5.1 三层树
```
parent_rna_class          顶层（干净受控词表）
  └─ canonicalChainName   中层（chain index displayName，已折叠）
       └─ PDB             叶（可点进详情页）
```

### 5.2 placement 展开规则（2+3 组合）
对每个 displayCase（distinct PDB），在 **build 时**：
1. 从 `chainIndex.get(pdbUpper)` 取所有 RNA chain。
2. 按 `(rnaClass, displayName)` 去重 → 得到该 PDB 的 distinct 身份对集合。
3. 去重对集合写进 displayCase 的 `chainPlacements` 字段。

**逐页分组**（`buildAnnojointTableGroups(pagination.rows)`）遍历当页各 case 的 `chainPlacements`，每个 `(classLabel, nameLabel)` 把该 case 挂到对应 `parent(class) → child(name)` 分支的 rows。多 chain 多身份的 case 自然出现在多个分支（如核糖体装配体同时在 `rRNA → 16S ribosomal RNA` 和 `tRNA → tRNA-Lys` 下各出现一次）。

### 5.3 计数语义（避免误读）
- `totalCaseCount` = **distinct PDB 数**（唯一 PDB，不变，= displayCases.length），index 顶层字段。
- `totalPlacementCount` = 全量 `chainPlacements.length` 之和（含同一 PDB 的多身份），index 顶层字段。
- table model 分组节点的 `count` 语义沿用现状（当页该分支下的 row 计数）。由于逐页分组 + `sortAnnojointCases` 按主 placement 排序保证同 case 落同页，节点 count 反映当页可见 placement 数。**不**追求跨页 distinct-PDB 去重计数（YAGNI：现状逐页 count 已是既有语义，改动会破坏分页边界一致性）。
- 总表表头同时显示两个 index 顶层数：`1,240 PDBs · 1,890 entries`（distinct PDB · 总 placement）。

### 5.4 节点排序
- `sortAnnojointCases`：按 case 主 placement（`chainPlacements[0]`）的 classLabel localeCompare、再 nameLabel localeCompare、再 pdbId、再 caseKey 升序。
- `buildAnnojointTableGroups` 内：parent(class) / child(name) 分支按 label localeCompare 升序（沿用现状 Map 插入序 + 视图渲染序）。
- 同分支内 case 行：按 sortAnnojointCases 既定序（pdbId 升序为主）。

## 6. 边界 case 处理（绝不丢 PDB）

build 时派生 `chainPlacements` 的兜底（保证每个 displayCase 至少一条 placement）：

- **chain index 查不到任何 RNA chain**（RASP-only / 上游 chain 表缺该 PDB）：写单条 placement `{ classLabel: "Unclassified RNA", nameLabel: moleculeDisplayName || pdbId }`。该 PDB 仍出现在总表。
- **有 chain 但 `parent_rna_class` 为空**：该 chain 的 placement `classLabel = "Unclassified RNA"`，nameLabel 仍走 chain index `displayName`。
- **有 chain 但 `displayName` 为空**（chain index 理论上已兜底为 ref，不应为空）：nameLabel 回退 `moleculeDisplayName || pdbId`。
- 兜底分支 `"Unclassified RNA"` 参与正常排序（localeCompare），不特殊置顶/置底。

## 7. 浏览器渲染层

### 7.1 数据层 `annojoinAtlasData.js`
- `normalizeCase` 新增透传 `chainPlacements` 字段（`row.chainPlacements || row.chain_placements`，与 `moleculeDisplayName` 同类显式保留，铁律：漏带字段是隐形杀手）。每条 placement 规范成 `{ classLabel, nameLabel }`。
- **删 `buildCaseHierarchy`（L194）及其调用点 L579 `caseHierarchy` 与 L580 `sourceCaseHierarchy`** —— 死代码（§3 校正，grep 确认 view 从不消费）。删后 `buildAtlasSearchState` 返回对象去掉这两键。
- `normalizeCase` 里 `parentClassLabel/childClassLabel/parentClassSource/childClassSource` 读取移除（见 §8）。
- 验证必须走真实 `buildAtlasSearchState`（铁律：验前端行为不能只读 raw index，要过真实 data 层）。

### 7.2 表模型层 `annojoinAtlasTableModel.js`（真实分组目标）
- `parentGroupLabel(row)` / `childGroupLabel(row)`：当前读 `row.parentClassLabel || row.childClassLabel || moleculeDisplayName...`。**这两个函数不再用于分组**——分组改由 `chainPlacements` 驱动。保留它们仅作 case 主 placement 的便捷取值（或一并删除，见下）。
- `sortAnnojointCases(cases)`：改为按 case 主 placement `chainPlacements[0]` 的 `(classLabel, nameLabel)` 排序（无 placement 兜底用空串），再 pdbId、再 caseKey。
- `buildAnnojointTableGroups(cases)`：核心改造。当前对每 row 取单 `(parentLabel, childLabel)` 建一个分组；改为**遍历 `row.chainPlacements`**，每个 `(classLabel, nameLabel)` 把 row push 到对应 `parentId = groupSlug(classLabel)` / `childId = parentId::groupSlug(nameLabel)` 分支。多身份 case 出现在多分支。空 `chainPlacements` 不应发生（build 兜底保证 ≥1），防御性地按单条 `Unclassified RNA` 处理。
- `annojoinExportRow(row)`：导出列 `parent_class_label`/`child_class_label`（L156-157）改为 `chain_class_labels`/`chain_name_labels`（`chainPlacements` 的 class/name 用 `;` 拼接），或保留列名但取自 placements——任选其一在计划里定，去掉对已删 `parentClassLabel` 的依赖。

### 7.3 视图层 `annojoinAtlasView.js`
- 三层折叠组件**已存在**（L180-219 parent-group-row → child-group-row → case-rows），结构无需新建。
- `buildAnnojointTableGroups(pagination.rows)`（L470）入参不变，因 group 函数内部改为按 placement 展开，view 自动获得 class→name→PDB 三层。
- 同一 case 在多分支重复出现是预期；每条 placement 渲染为独立可点行，`detailRouteId` 仍指向同一 PDB 详情页。
- 折叠状态键现状已用 `parentId` / `childId = parentId::groupSlug(childLabel)`（table model L70），父 id 已并入子 id 防串台。placement 改造后 id 由 `(classLabel, nameLabel)` 生成，天然带层级路径，**无需额外改键策略**。

## 8. 移除（YAGNI 决断）

chain class 上线后，以下 case-level 分类逻辑成为死代码，**全部移除**：

| 文件 | 移除项 |
|---|---|
| `annojoin-atlas-corpus.mjs` | `PLACEHOLDER_CLASS_LABEL_PATTERNS`、`PLACEHOLDER_CLASS_SOURCES`、`isPlaceholderClassLabel`、`cleanClassLabel`、`classCanonicalMap` 的构建与 parentClassLabel/childClassLabel 覆写、`normalizeCase` 里 `parentClassLabel/childClassLabel/parentClassSource/childClassSource` 派生；旧 `caseHierarchy` 相关 `caseDisplayLabel`/`parentBucketLabel`/`childBucketLabel`/`bucketId`/`buildCaseHierarchy`（L559-630，若确认无其他消费者）|
| `annojoinAtlasData.js` | `buildCaseHierarchy`（L194）、调用点 `caseHierarchy`（L579）/`sourceCaseHierarchy`（L580）、`parentBucketLabel`/`childBucketLabel`（L175/L181）、`normalizeCase` 里 `parentClassLabel/childClassLabel` 读取（L242/L244）|
| `annojoinAtlasTableModel.js` | `parentGroupLabel`/`childGroupLabel` 对 `parentClassLabel`/`childClassLabel` 的读取（改读 placement）；`annojoinExportRow` 对 `parentClassLabel`/`childClassLabel` 的引用 |

**保留**：
- `moleculeDisplayName` / `moleculeCanonicalMap` / `moleculeBaseName` — 仍作兜底 name（§6）。
- raw provenance 字段不在范围内（本就只动 display-only 派生标签）。
- `buildAnnojointTableGroups` / `sortAnnojointCases` / `groupSlug` / `paginateAnnojointRows` / `searchAnnojointRows`（table model 核心，仅改内部逻辑不删）。

删 index 死字段 `caseHierarchy`；不引入替代静态树（分组逐页在 table model 算）。`ANNOJOIN_ATLAS_SCHEMA_VERSION` bump（新增 `chainPlacements` + `totalPlacementCount`，删 `caseHierarchy`）。

## 9. 测试与验证

### 9.1 单元测试（placement 派生 + table model 分组）
- placement 派生（corpus 测试，`test/annojoin-atlas-corpus.test.js`）：多 chain 多身份 PDB → 去重后多个 `(classLabel, nameLabel)`、按 localeCompare 排好；chain 查无 → 单条 `Unclassified RNA` 兜底；class 空 → 兜底 class。断言 `totalPlacementCount` = 全量 `chainPlacements.length` 之和、`totalCaseCount` = distinct PDB 数、无 `caseHierarchy` 字段。
- table model（`test/annojoin-atlas-table-model.test.js`）：`buildAnnojointTableGroups` 对带 `chainPlacements` 的 case 展开到多个 `class → name` 分支；多身份 case 在多分支各出现一次；`sortAnnojointCases` 按主 placement `(class, name)` 确定性排序；分组 id `parentId`/`childId=parentId::slug` 不串台。

### 9.2 data 层测试（真实路径，过滤/分页响应）
- 经 `buildAtlasSearchState`（`test/annojoin-atlas.test.js`，import 真实 data 层）：断言 `normalizeCase` 透传 `chainPlacements`；返回对象不含 `caseHierarchy`/`sourceCaseHierarchy`。
- 经真实渲染管线 `sortAnnojointCases → searchAnnojointRows → paginateAnnojointRows → buildAnnojointTableGroups`：断言无搜索时三层分组结构；**加 query 过滤进搜索态时不分组（现状 searchActive 行为）**；分页边界——同一多身份 case 的所有 placement 落同一页（被 sortAnnojointCases 主 placement 排序保证），不被分页拆散。

### 9.3 真实 full build 验证
- `FOLDBRIDGE_ANNOJOIN_ROOT=.../view_roots/combined` + 校准/identity/ANNO 根（默认 tianyi 路径），跑 `npm run build:annojoin-atlas`。
- 核 manifest：`totalCaseCount`（distinct PDB）vs 新增 `totalPlacementCount`。
- grep index.json：`displayCases[].chainPlacements` 存在且非空；无残留旧 `parentClassLabel/childClassLabel` 字段与 `caseHierarchy` 旧键。
- 抽样若干多 chain PDB（如 4V99 rRNA+tRNA、6YFT），确认在多分支正确出现。
- `npm test` 全绿，零回归。
- dist 同步：`rsync -a --delete src/assets/generated/annojoin-atlas/ → dist/.../`（生成产物 gitignore，本地重建）。

## 10. 风险与缓解
- **placement 膨胀**：超多链装配体（4V99 有 120 链）展开 placement 可能放大行数。缓解：按 `(class, name)` 去重后，同一装配体的同身份链折叠为单条，实际 placement 远小于链数；§5.3 计数双显防误读。
- **逐页分组的分页边界**：分组在 `paginateAnnojointRows` 之后逐页进行（现状语义），故同一 `class → name` 分支可能跨页出现在不同页的分组里。这是现状两层分组本就有的行为，非本设计引入；`sortAnnojointCases` 按主 placement 排序使同分支 case 相邻、尽量同页聚集。多身份**同一 case** 的所有 placement 因 pagination 单元是 case，必落同页（不被拆散）。
- **schemaVersion 不兼容旧 dist 缓存**：bump version + full build 重写全部资产，浏览器硬刷新（Cmd+Shift+R）。
- **chain index 覆盖不全**：RASP-only PDB 走 `Unclassified RNA` 兜底，不丢数据；与既有 RASP 上游缺口一致，非本设计引入。
