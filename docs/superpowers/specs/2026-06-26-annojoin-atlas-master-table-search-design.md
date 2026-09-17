# ANNOJOIN Atlas 主表搜索与导览设计（2026-06-26）

## 背景与目标

ANNOJOIN Atlas 主表（路由 `#sequence`，下方代码层称 annojoin-atlas）已功能完备：分组折叠、分页、列显隐、行选择、导出、双来源侧栏均已实现。但数据整备完成后，展示行达到 **3610 个 PDB display 行**（背后 4070 个 source case），现有交互在「数据量」上撑不住，主要痛点集中在用户**找不到 / 看不全 / 不知道自己在看什么**。

本设计聚焦解决该痛点，按用户任务优先级排序：

- **A（最高）— 定位特定结构**：用户手握 PDB ID 或分子名，要秒级定位到目标行并进详情页。
- **B（其次）— 筛选探索子集**：无明确目标，按条件圈一批 case 浏览/比较/导出。
- **C（再次）— 证据质量分诊**：评估每个 case 的来源（RMDB/RASP）、confidence、冲突。

C/D 已部分实现（本文档中 **C/D 指代分组折叠、分页、双来源侧栏这套既有浏览/分诊功能**），本次**不重做其功能**，仅在其上叠加搜索能力，并对其做**视觉美化**。B 的列设计本次**不展开**。

### 不在本设计范围（YAGNI）

- 不重做 6 列的列设计（B 的列层面，留待以后）。
- 不动 C/D 已实现的分组/分页/双来源侧栏的**功能逻辑**。
- 不碰主页 Pagefind 全站搜索。
- 不引入虚拟滚动。
- 不在 UI 层 truncate molecule name（参见数据红线）。

## 数据现实与红线（来自 ANNOJOIN 主表建成指南 2026-06-26）

主表消费 `src/assets/generated/annojoin-atlas/index.json`，关键契约：

- `index.cases` = 4070 **source truth** 行（保留 RMDB/RASP 原始来源 + 详情页路径）。
- `index.displayCases` = 3610 **网页展示行**，combined 视图按 `pdb_id` 合并 RMDB/RASP。
- 460 个 PDB 同时来自 RMDB 和 RASP，合并成一行，但必须保留 `sourceCaseKeys`、`sourceCaseAssetPaths`、`sourceFamilies`、`sourceCaseCount`。
- 来源构成：RMDB 1126 + RASP 2944。
- `confidenceDisplayLabel` 是 **case-level 复合标签**（如 `"RMDB: B/C; RASP: not active"`），不是单一分数、不是 best profile confidence。

**红线（设计必须遵守）：**

1. 合并行不得吞掉来源；任何呈现都要能追溯回 RMDB/RASP source case。
2. RASP 当前 `positive_confidence_active_now=false`——可展示 source case / route，但**不得**呈现成「已激活的正向 confidence 证据」。
3. molecule name 超长是上游 materializer bug，**不在 UI 层 truncate** 当作修复。
4. 主表搜索只消费已加载的主表数据，**不直接消费 `index.cases` 把展示行又变回 4070**。

## 现状（已读代码确认）

- 列定义在 `src/annojoinAtlasTableModel.js` 的 `ANNOJOIN_TABLE_COLUMNS`：`pdbId` / `moleculeName` / `confidenceDisplayLabel` / `profileCount` / `chains` / `conflictCandidateCount`，全部 default visible。
- 渲染在 `src/annojoinAtlasView.js`：`renderTableBody`（分组折叠 + 组内分页溢出）、`renderPagination`（Page X/Y、Rows a-b of total、每页 25/50/100/250）、`renderSourceCaseLinks`（双来源侧栏）。
- `filters` 对象（query/rnaFamily/probeType/pdbId/motif/structureClass）当前**仅用于导出 URL**，主表顶层**没有即时过滤搜索框**。
- 搜索服务 `src/search/searchService.js` 是 build-time Pagefind 全文索引，面向「整站找页面」，facet 仅 `type`/`tag`，**与主表结构化行检索职责不同**。
- 现有 CSS 钩子（`src/styles.css`）：`.annojoin-parent-group-row` / `.annojoin-child-group-row` / `.is-expanded-group` / `.annojoin-case-row.is-in-expanded-group` / `.annojoin-group-overflow-row` / `.annojoin-detail-sidebar` 及其子元素，均已存在，美化可直接重写这些选择器。
- 主题：`src/theme.js` 三套配色（ribocentre/riboswitch/aptamer）× 明暗；token 暴露为 CSS 变量（`--primary`/`--accent`/`--surface`/`--surfaceAlt`/`--backgroundStrong`/`--border`/`--radiusPanel`/`--shadowSoft` 等）。

## 选定方案

**方案 2 — 搜索优先的双模式主表**（在三个候选方案中选定；方案 1「仅增量增强」定位不够直接，方案 3「虚拟滚动取代分页」改动过大且推翻已有分组/分页，均否决）。

---

## 设计块 1：搜索 / 浏览双模式核心行为

**模式切换（由过滤框输入自动驱动）：**

- 过滤框为空 → **浏览模式**：维持现有 parentClass/childClass 分组折叠 + 分页，原样不动。
- 过滤框有输入 → **搜索模式**：临时摊平为单一扁平命中列表，去掉分组层级与按组分页，改为按匹配度排序的结果列表（仍可分页，分页作用于扁平结果）。
- 清空输入 → 无缝回到浏览模式，恢复之前的分组展开状态与页码（状态记在模块作用域，不写 URL，符合现有全量重渲染模型）。

**匹配逻辑（同时匹配 PDB id + molecule name）：**

- 对 `displayCases` 每行，匹配 `pdbId` 与 `moleculeName`，大小写不敏感、去首尾空格。
- 排序优先级：① PDB 精确匹配 → ② PDB 前缀匹配 → ③ molecule name 子串匹配 → ④ PDB 子串匹配；同级按原顺序稳定排序。
- 纯前端，在已加载的 `index.json`（`displayCases`）上做，毫秒级，**不经 Pagefind**。

**与主页全站搜索的边界：**

- 主表过滤框只搜主表这 3610 个 display 行，不调 Pagefind、不跳 `#search`。
- 主页 Pagefind 全站搜索框行为完全不变。
- 职责分离原则：主页搜索 = 全站来源；主表搜索 = 单一主表来源。降低全站搜索心智复杂度。

## 设计块 2：搜索模式下行的视觉呈现（confidence + 来源区分）

**保留的列：** 沿用现有 6 列，不在本块重做列设计。扁平后，原本部分依赖分组上下文承载的来源归属信息，需在行内自带。

**来源（family）视觉编码（数据驱动）：**

- 每行在 PDB 单元格旁显示来源徽标：单来源行标 `RMDB` 或 `RASP`；合并行（460 个）标 `RMDB + RASP`。
- 样式由 family 的**激活状态（activation state）**驱动，而非把「RASP=非激活」写死：
  - 激活态 family（当前 RMDB）→ 实心徽标，用 `--primary`/`--accent`。
  - 非激活态 family（当前 RASP，`positive_confidence_active_now=false`）→ 低饱和 / 描边样式 + `not active` 语义。
- **前瞻性**：将来 RASP 正向 confidence 激活后，只需翻转其激活状态标志，徽标自动变实心，无需改渲染逻辑。

**Confidence distribution 单元格：**

- 保留复合标签原文（如 `RMDB: B/C; RASP: not active`），不截断、不简化语义。
- 视觉上把 RMDB 段与 RASP 段拆成两个可读片段，各带各自 family 色，避免挤成一团（顺带改善可读性，但仅限不改变语义的呈现，不算重做列）。

**合并行的来源钻取：** 搜索模式下合并行仍可点开右侧来源侧栏（现有 `renderSourceCaseLinks`），分别进 RMDB / RASP 详情页。扁平化不影响此钻取路径。

**护栏：** 任何情况下不得把 RASP 渲染成与 RMDB 同等的已激活正向 confidence；不在 UI 层 truncate molecule name。

## 设计块 3：状态反馈与导览反馈

**置顶过滤栏：**

- 即时过滤输入框，placeholder 明确范围，例如 `Filter this table by PDB ID or molecule name`，让用户一眼区分「表内过滤」与「全站搜索」。
- 输入框右侧清除按钮（×），一键回浏览模式。

**结果计数（始终可见，常驻于过滤栏下方，不随分页滚走）：**

- 浏览模式：`3610 PDB entries (4070 source cases)`，使用 display/source 双计数口径。
- 搜索模式：`Showing N of 3610 entries matching "<query>"`，N 实时更新。

**活动条件 chips：**

- 当前生效的过滤/搜索以可移除 chip 呈现（搜索词 chip；若叠加来源/conflict 等快捷过滤亦各成 chip）。每个 chip 可单独点 × 移除，旁边 `Clear all`。
- 让「我为什么只看到这些行」始终可见、可逆，直接回应 A 的「茫然」。

**空结果状态：** 搜索无命中时，不显示空表，而是引导文案 `No entries match "<query>". Check the PDB ID, or try a molecule name.` + `Clear search` 按钮。

**模式视觉提示：** 搜索模式下表格区域有轻量提示条 `Search results — grouping is paused. Clear the filter to return to grouped browsing.`，说明分组为何消失、如何找回。

**搜索模式分页：** 扁平命中 ≤ 一页（沿用现有每页档位）时不显示分页；超出时分页作用于扁平结果，计数同步反映 `Page x/y of N matches`。

## 设计块 4：视觉落地、职责隔离、测试

**视觉 / 主题落地（克制）：**

- 全部复用现有 theme token + 三套配色 + 明暗模式，不引入新色板、不加新字体。
- 过滤栏、计数条、chips、提示条沿用现有组件观感（如 `download-outline-btn` 样式族），与站点一致。
- 本次「视觉翻新」严格限定在 A 相关新增控件（过滤栏/计数/chips/空状态/来源徽标）+ 块 5 的 C/D 美化，不顺手改其他页面、不动导航和首页。
- 使用 ui-ux-pro-max skill 时明确 stack=HTML/CSS、桌面 web 场景，忽略其 React Native / App-only 规则。

**职责隔离（符合现有渲染模型）：**

- 纯逻辑放 `annojoinAtlasTableModel.js`（可单测、无 DOM）：新增「按 query 过滤 displayCases + 匹配度排序」函数，与「按 family 激活态取徽标样式描述」的纯函数。
- 渲染（过滤栏、扁平行、计数、chips、提示）放 `annojoinAtlasView.js`。
- 模式状态（当前 query、浏览模式下的展开/页码记忆）存模块作用域，遵循全量重渲染重绑模型，不写 URL。

**测试：**

- 对新纯函数写 node --test 单测：匹配排序优先级（PDB 精确 > 前缀 > molecule 子串 > PDB 子串）、大小写/空格归一、family 徽标样式映射（含「RASP 激活态翻转后变实心」前瞻用例）、空结果。
- 跑 `npm test`（基线 133/133）、`npm run verify:annojoin-atlas`、`npm run build` 确认全绿。

## 设计块 5：C/D 视觉美化（仅样式，不动功能）

**范围原则：** 只改 CSS（现有选择器），不改 `renderTableBody` / `renderSourceCaseLinks` 的 HTML 结构与 JS 逻辑。功能（展开折叠、Show all/less、来源钻取）保持现状。全程复用 theme token + 明暗模式。

**分组头美化（parent / child group rows）：**

- 建立清晰层级：parent 组头用更强底色（`--surfaceAlt`/`--backgroundStrong`）+ 加重字重 + 左侧 accent 竖条；child 组头用更轻缩进 + 次级底色，使「父 > 子 > 行」三层一眼可辨（顺带缓解 C 的「分不清全集/子集」）。
- 展开/折叠按钮（现为纯 `+`/`-` 文本）换成统一 toggle 样式，hover/focus 态用 token，可点区域更大。
- `is-expanded-group` 态用左 accent 条或底色变化明确标示「该组已打开」。
- 计数（`N cases`）做成小徽标样式，与正文区分。

**组内溢出行（Show all / Show less）：** `annojoin-group-overflow-row` 做成低调居中操作条，按钮 + 说明文字对齐统一。

**来源侧栏美化（detail sidebar）：**

- 卡片化：`--surface` + `--radiusPanel` + `--shadowSoft`，与主表区域拉开层次。
- 头部（标题 + source case 计数）做成清晰 header 区；`dl/dt/dd` 字段列表统一对齐、加适度行距，长值（复合 confidence、molecule name）可读不挤。
- 侧栏来源条目复用块 2 的 family 徽标（RMDB 实心 / RASP 描边-not active），与扁平搜索行视觉语言一致。
- 照顾移动端（现有 `@media` 钩子）。

**一致性护栏：** 分组头、侧栏、搜索行三处的来源/confidence 视觉编码必须统一（同一套 family 徽标和 token）；不改语义、不 truncate、不把 RASP 美化成激活态。

## 验收标准

- 主表顶部有即时过滤框，输入 PDB id 或分子名可毫秒级过滤；空框恢复分组浏览且保留展开/页码。
- 匹配排序符合优先级；大小写/空格不敏感。
- 搜索模式行保留 confidence 复合标签原文 + 来源徽标，RMDB/RASP 区分由激活态数据驱动。
- 计数双口径正确（3610 entries / 4070 source cases）；chips 可移除；空结果有引导；模式提示可见。
- C/D 美化仅改 CSS，功能不变；三处来源视觉编码一致。
- `npm test`、`npm run verify:annojoin-atlas`、`npm run build` 全绿。
- 不引入新色/新字体；不改主页 Pagefind；不 truncate molecule name；display 行仍为 3610 不退回 4070。
