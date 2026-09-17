# ANNOJOIN Atlas 总表（entry 页）大表化 + Chains 序列链接 — 设计

- 状态：草案（待 spec 审查）
- 日期：2026-06-30
- 仓库：`~/docs/foldbridge`（vanilla-JS 静态站）
- 工作树/分支：`.worktrees/annojoin-atlas-grouping` / `feature/annojoin-atlas-grouping`
- 关联前序设计：`2026-06-29-annojoin-atlas-chain-identity-grouping-design.md`、`2026-06-29-annojoin-atlas-index-slim-fast-rebuild-design.md`、`2026-06-26-annojoin-atlas-master-table-search-design.md`

## 1. 背景与问题

ANNOJOIN Atlas 总表（entry 页）当前是**翻页 + 默认折叠**的两层分组表（class → 规范 name → PDB）。当前交互有几处与用户实际浏览习惯不符：

1. **底部翻页条**（Previous/Next/Page X/Y + Rows per page 25/50/100/250）把结果切成页，用户要逐页点击才能看全，无法靠滚动连续浏览。
2. **分组默认全折叠**（`expandedGroupIds` 空集 = 全折叠），进页后看到的是一堆收起的 class→name 表头，要逐个展开。
3. **PDB 列在 Molecule name 列左侧**，但用户的浏览主线是"先看分子是什么，再看是哪个 PDB"。
4. **Molecule name 单元格用 `—` 抑制**：当某行分子名与所属分组名相同时，单元格显示 `—`（`annojoin-molecule-same-as-group`）。但部分行已经显示完整名、部分仍是 `—`，体验不统一；而 Index row detail 面板标题用的是完整 `moleculeName(row)`，两处不一致。
5. **组内行上限 25**（`DEFAULT_GROUP_ROW_LIMIT = 25`）：展开的大组只渲染前 25 行 + "Show all" 溢出按钮。配合翻页后行为割裂。
6. **Chains 详情面板（"Chain definitions"）只列 chain ID**，且明写一句 "Per-chain residue sequences are not present in the current index asset"。用户希望能从这里看到真实序列。

### 1.1 真实渲染路径（实现前读代码确认）

- 总表分组真实路径 = `src/annojoinAtlasTableModel.js:buildAnnojointTableGroups`，由 `src/annojoinAtlasView.js:470` 调用，**逐页**对当页行分组。
- 当前管线（`renderAnnojointAtlasPage` L465-470）：
  ```
  sortAnnojointCases(atlasState.cases)
    → searchAnnojointRows（仅搜索激活时）
    → paginateAnnojointRows({page,pageSize})
    → buildAnnojointTableGroups(pagination.rows)   // 仅非搜索态分组
  ```
- 详情侧栏 `detailRow`（L472）来自 **index 行**（`atlasState.cases` 里 find），不是 per-case 详情资产。它带 `row.chains`（chain ID 字符串数组）和 `row.pdbId`，**不带** per-chain `lengthNt`（长度只存在于构建期 `chainIdentities`，侧栏从不加载）。
- `renderChainsPanel(row)`（view L387-403）当前从 `row.chains` 渲染 `<ol>` ID 列表 + 那句 "not present" 注脚。

### 1.2 序列数据源调查（针对改动 6）

- chain 身份源表 `PDB/04_pdb_metadata/pdb_rna_entity_chain_declared_identity.tsv` 只有 `sequence_hash` / `sequence_length`，**无残基序列字符串**。
- 真实残基序列在 `PDB/02_normalized_fasta/pdb_rna_chain_sequences.tsv`（27,804 行，列 `raw_sequence` 如 `UCAGACUUUUAAUCUGA` / `raw_sequence_length` / `alignment_sequence`），按 `pdb_reference_id` join（与 chain-identity 索引同键同宇宙）。
- 残基反应性证据（`residueEvidence`）是稀疏的（仅测到的位点），不能当完整序列用。

**决策（用户确认，方案 A）**：不把序列嵌入 index.json（避免体积增长与构建脚本改动），改为在 Chains 面板每条链放一个指向 RCSB 序列页的外链 `https://www.rcsb.org/sequence/{PDB}`。理由：序列字符串只需 `pdbId`（index 行已有）即可拼 URL，**index.json 零增量、构建脚本零改动、最快落地**；RCSB 是序列权威源。

## 2. 目标与非目标

### 目标
1. entry 页去翻页，改为一整张大表，靠浏览器横/纵向滚动浏览全部结果。
2. 分组骨架保留（class→name 两层表头），但**默认全部展开**。
3. 主表列序：Molecule name 列移到 PDB 列左侧（仅主表，详情面板不动）。
4. Molecule name 单元格恒显完整 `moleculeName(row)`（= Index row detail 面板标题），彻底弃用 `—` 抑制。
5. 组内行上限 25 → **5**：每组默认展开但只渲染前 5 行 + "Show all / Showing 5 of N" 按钮。
6. Chains "Chain definitions" 面板：每条链一个**可折叠 `<details>`**，展开放 "View sequence on RCSB →" 外链（指向 entry 级序列页）。删除 "not present" 注脚。

### 非目标（YAGNI）
- 不改详情页（case prototype）的 chain 身份/序列渲染。
- 不把残基序列嵌入 index.json，不改任何构建脚本（`build-annojoin-atlas.mjs` 及其 lib 零改动）。
- 不做 RCSB 单链深锚定（RCSB 序列页是 entry 级，无稳定的 auth 链锚 URL 契约；同一 PDB 各链都指向同一序列页）。
- 不在 summary 显示 `N nt`（长度不在 index 行，加它需改构建注入 → 与"零构建改动"目标冲突，本轮不做）。
- 不动搜索/facet 机制、chain 身份治理逻辑、grouping 引擎本身。

## 3. 逐项设计

### 改动 1 — 去翻页，大表

- 管线去掉 `paginateAnnojointRows` 步骤；`buildAnnojointTableGroups` 直接吃全部 `baseRows`（搜索态仍走 `searchAnnojointRows`，非搜索态吃 `sortedRows` 全量）。
- **重接所有 `pagination.rows` 消费点到 `baseRows`**（不止分组）：`searchModeNote`（view L476 `pagination.rows.length`）、`emptySearchRow`（view L483 `pagination.rows.length`）、`renderFlatRows` 输入（view L491 `rows: pagination.rows`）三处都改读 `baseRows`。
- 移除 `renderPagination(pagination)`（view L120-136 定义 + L531 调用）。
- `renderAnnojointAtlasPage` 签名移除 `page`/`pageSize`（或保留为忽略以减小 diff，最终态去掉）。
- controller 解绑 `[data-annojoin-page]`、`#annojoin-page-size`（`bindAnnojointAtlasTable`）。
- `main.js` 删 `setAnnojointAtlasPage` / `setAnnojointAtlasPageSize` / `annojoinPageSize` 状态及其 bind 接线。
- 表格容器靠 CSS 滚动（`annojoin-master-table-wrap` 横向 + 页面纵向）。
- **"Select Current Page" 按钮**（`#select-visible-annojoin-cases`，view L520）：去翻页后 `pageRows === rows`，它与 "Select All Results" 重复。**决策：移除该按钮**（含 controller L68-71 接线 + test L588 断言）。`currentAnnojointAtlasState()`（main.js L2133-2145）返回的 `{rows, pageRows, pagination}` 形状中 `pageRows`/`pagination` 不再有消费者，一并清理（最终态只保留 `rows`）。

### 改动 2 — 默认全展开（保留分组骨架）

- 保留 class→name 两层分组表头渲染（`renderTableBody` L151-222 不动结构）。
- **锁定实现 = 方案 (b)**：初始化 `expandedAnnojointGroupIds = new Set(allAnnojointAtlasGroupIds())`，每次 `atlasState.cases` 变更后重算全集并补入。**不**采用"反转 render 语义"（in-set=collapsed）的方案——render 逻辑 `view.js:186/:207` 是 `expandedGroupIds.has(toggleId) => 展开`，多个测试传显式集合表达"展开此组"（test L298-299 `new Set(['parent:rRNA'])`、L688、L765、L783）。若反转语义，这些集合会变成"折叠该组"，与测试意图完全相反，破坏全套测试。**必须保持"in-set = 展开"不变**，只改默认填充为全集。
- 顺带清理 `renderAnnojointAtlasPage` 当前未使用的 `collapsedGroupIds` 形参（view L450，曾为反转方案预留，本轮不需要）。
- "Expand All / Collapse All" 按钮（view L523-524）语义随之对齐（默认进页即"全展开"态）。

### 改动 3 — 列互换

- `src/annojoinAtlasTableModel.js:ANNOJOIN_TABLE_COLUMNS`：把 `{id:'moleculeName'}` 排到 `{id:'pdbId'}` 之前。其余列序不变。
- 仅影响主表表头与单元格渲染顺序；`renderDetailSidebar` 不受影响。

### 改动 4 — Molecule 单元格恒显完整名

- 删 `moleculeCellLabel` 的 `sameGroupLabel`→`—` 抑制分支 + `sameGroupLabel()` 函数（view L93-106）。
- `columnValue.moleculeName` 改为恒走完整名：`fieldLink(row, routeName, 'moleculeName', sourceValue(moleculeName(row), row.biologicalMoleculeNameSource || row.pdbMoleculeNameSource))`。
- 每个 Molecule 单元格显示与 Index row detail 标题一致的完整 `moleculeName(row)`。

### 改动 5 — 组内行上限 25 → 5

- `src/annojoinAtlasView.js:DEFAULT_GROUP_ROW_LIMIT = 25` → `5`。
- `renderExpandedRows` 的 cap 与溢出行（L171-178）逻辑不变，仅常量变 5；溢出文案 "Showing 5 of N cases in this group"。
- `uncappedGroupIds` "Show all in group" 机制不变。

### 改动 6 — Chains 面板每链 `<details>` + RCSB 外链

- 重写 `renderChainsPanel(row)`（view L387-403）：
  - 仍从 `row.chains`（ID 字符串）取链；`row.pdbId` 取 entry ID。
  - 每条链渲染一个 `<details class="annojoin-chain-seq">`：
    - `<summary>` = `escapeHtml(chainId)`（不含 `N nt`，长度不在 index 行）。
    - 展开体 = `<a href="https://www.rcsb.org/sequence/{PDB}" target="_blank" rel="noopener noreferrer">View sequence on RCSB →</a>`，`{PDB}` = `encodeURIComponent(String(row.pdbId).toUpperCase())`。
  - 无链时保留现有 mini-note。
  - **DOM 结构变更**：保留外层 `<aside>` + `annojoin-chain-scroll` 滚动容器（view L398，多链时仍需滚动）；**移除 `<ol class="annojoin-chain-list">`**，改为容器内直接铺 N 个 `<details class="annojoin-chain-seq">`。
  - **删除** L401 "Per-chain residue sequences are not present..." 注脚；可替换为说明序列在 RCSB 的简短提示（如 "Residue sequences open on RCSB (entry-level)."）。
- 默认折叠（`<details>` 不带 `open`）。`countLabel`/外层 `<aside>` 结构保留。
- URL 安全：`pdbId` 经 `encodeURIComponent` + 大写；`escapeHtml` 用于 summary 文本。无序列嵌入，无 XSS 面扩大。

## 4. 测试影响（`test/annojoin-atlas.test.js`）

需更新的现有断言：
- `atlas page renders only the compact master table surface`（L581-607）：断言 `/Page 1 \/ 2/`、`/Rows 1-1 of 2/` → 删除（无翻页）。
- `atlas search state preserves the canonical moleculeDisplayName...`（L265-305）：2× `annojoin-molecule-same-as-group` `—`（L304）→ 改断言完整名。
- `atlas page suppresses molecule name inside a group...`（L656-693）：**两个**断言都要翻转——L691 `/class="annojoin-molecule-same-as-group"/`（改为断言不再出现 `—`），以及 **L692** `doesNotMatch(/annojoin-field-link[^>]*>\s*<span[^>]*>5S ribosomal RNA<\/span>/)`（改动 4 后单元格恒为 `<a class="annojoin-field-link"><span>5S ribosomal RNA</span></a>`，此 `doesNotMatch` 会失败 → 改为 `match`）。测试名/意图需一并改写为"恒显完整名"。
- `atlas page defaults foldable groups to collapsed...`（L745-770）：`data-annojoin-group-state="collapsed"` + `10ZT` 默认不显示 → 反转为默认展开、`10ZT` 默认可见。
- `atlas page caps large expanded ... groups`（L772-789）：25 行（L786）+ `/Showing 25 of 30/`（L788）→ 5 行 + `/Showing 5 of 30/`。
- 合并行翻页 meta（L397 `/Rows 1-1 of 1/` 等）→ 调整或删除。
- `atlas side panel renders field-specific explanations`（L811-854）：改动 6 重写 `renderChainsPanel` 后——L846 `/class="annojoin-chain-scroll"/` 仍通过（容器保留）；**L847** `/class="annojoin-chain-list"/` 会失败（`<ol>` 被移除）→ 改为断言 `<details class="annojoin-chain-seq">`。L849 现有 `doesNotMatch(/Chain sequences are not present.../)` 打的是**不存在的字符串**（真实文案是 "Per-chain residue sequences are not present"），是空操作；新断言要对准真实删除文案 `doesNotMatch(/Per-chain residue sequences are not present/)`。

新增断言：
- Chains 面板每链一个 `<details class="annojoin-chain-seq">`，含 `https://www.rcsb.org/sequence/<PDB>` 链接、`target="_blank"`、`rel="noopener noreferrer"`。
- Chains 面板不再含真实删除文案：`doesNotMatch(/Per-chain residue sequences are not present/)`。
- 大表：无 `renderPagination` 产物；全部分组默认 `expanded`。

验证：`node --test`（纯渲染函数，无 jsdom）。

## 5. 风险与回滚

- **去翻页后渲染全量行**：当前 served 2386 PDB / ~7008 placement，单页 DOM 行数上升。纯静态字符串拼接 + 浏览器原生滚动，无虚拟化需求；若实测卡顿，5 行/组 cap（改动 5）已大幅压缩首屏 DOM。审查时评估是否需要默认折叠超大组（与改动 2 默认全展开有张力，留作 follow-up）。
- **RCSB 链接是 entry 级**：用户点链接到的是该 PDB 全链序列页，非单链锚。设计已接受（非目标声明）。
- **回滚**：6 项均为前端纯渲染/状态改动，无数据/构建变更，`git revert` 即可。

## 6. 实现顺序（供 writing-plans 细化）

1. table model 列互换（改动 3，最小独立）。
2. Molecule 单元格恒显完整名 + 删抑制（改动 4）。
3. 组内 cap 25→5（改动 5）。
4. 去翻页 + 管线吃全量 + 删 pagination 渲染/状态/接线（改动 1）。
5. 默认全展开语义翻转（改动 2）。
6. Chains 面板 `<details>` + RCSB 外链（改动 6）。
7. 更新/新增测试，`node --test` 全绿。
