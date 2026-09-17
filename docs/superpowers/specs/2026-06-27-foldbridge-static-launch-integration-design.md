# FoldBridge 静态站点上线整合设计（2026-06-27）

## 1. 目标与背景

把 FoldBridge 站点从「资源已接入」推进到「可对外上线」。三块新资源已经接入站点：ANNOJOIN Atlas 总表（`#sequence`）、27 篇探针科普文章（`#probing` / `#detail`）、RMDB→PDB Cases 详情（`#pdb-case`）。本次只动「站点 function + UI/UX」这一层，不碰后端、不碰上游数据生成管线。

成功标准：

- 导航收敛为 5 个有真实内容支撑的入口，无访客可点进的死链。
- 首页用真实数字呈现站点规模，并引导访客进入核心模块。
- Help 页成为可用的导览页，讲清站点数据口径。
- 全站搜索覆盖真实内容（探针文章 + PDB cases），不再索引死路由。
- `npm test` 与 `npm run build` 通过。

## 2. 约束

- **纯静态**：GitHub Pages 部署，`CNAME=foldbridge.gznl.org`，`.nojekyll` 已存在。无后端、无外部 API、无运行时第三方请求（指向 RCSB 的外链除外，那是用户主动点击的导航）。
- **不改上游科学字段**：所有真实数字、case、文章都来自已生成的 `src/assets/generated/` 资产，UI 层只读不改（沿用 ANNOJOIN 主表指南 §11 维护原则）。
- **当前架构**：vanilla JS 单页，hash 路由，`src/main.js` 编排；数据为构建期生成 JSON + 浏览器 fetch。
- **纯前端无构建打包器**：站点用原生 ES module，`scripts/build.mjs` 仅做静态拷贝。本次不引入打包器。

## 3. 当前资产现实（写规格时核对）

| 项 | 实际值 | 来源 |
|---|---:|---|
| `annojoin-atlas/index.json` cases | 1126 | 全部 `RMDB2PDB`，`#sequence` 默认读此资产 |
| `annojoin-atlas/index.json` displayCases | 1126 | 当前为 RMDB-only 规模 |
| `annojoin-atlas-rasp/index.json` cases | 2944 | RASP-only 独立资产 |
| 探针文章 | 27 | `probing-articles/index.json` `article_count` |
| 机制家族 | 6 | `probing-articles/index.json` `family_count` |
| PDB case 索引 | 1011 | `rmdb-pdb-cases/index.json` |

**关键事实**：当前磁盘上 `annojoin-atlas` 是 RMDB-only（1126），不是 ANNOJOIN 主表指南描述的 combined（3610/4070）。那份指南描述的是「combined 重建后的目标态」，需挂载 `/Volumes/tianyi` 卷并跑构建，属数据管线步骤，**不在本次范围内**。用户后续会拿 combined 表替换资产。本设计的所有写死数字都以「当前 RMDB-only 资产」为准，并标注替换 combined 后的更新点。

## 4. 范围内 / 范围外

**范围内**：
- 导航收敛（9 → 5）与 Sequence→Entry 改名
- 首页 Hero 真实指标 + 三模块引导卡 + 死链 CTA 修复
- Entry 表新增「PDB case」入口列
- Search 语料重做（覆盖探针文章 + PDB cases，清死路由文档）
- Help 页重做为导览页
- 各页死链清理
- 对应测试

**范围外**：
- ANNOJOIN Atlas 内部逻辑（搜索/分组/导出，已完成且有测试）
- PDB case 详情页与探针文章渲染逻辑（已完成）
- combined Atlas 资产重建（数据管线，依赖外接卷）
- PDB case 详情页内容补齐（本阶段详情页点击后空/404 可接受）
- 后端、API、打包器引入

## 5. 单元设计

### 5.1 导航（9 → 5）

`renderBundleHeader()` 内 `nav.bundle-home-route-nav` 渲染 5 个按钮：**Home / Entry / Probing / Search / Help**。

- 移除导航按钮：Browse、Structure、Download、PDB Cases。
- **路由与页面函数全部保留**：`router.js` 的 `ALLOWED_ROUTES` 不删任何条目；`pageFor()` 分支与 `browsePage/downloadPage/structurePage/publicationsPage/downloadSequencesPage/downloadStructuresPage` 函数保留。目的：任何遗留的 `#browse` 等深链不会 404，只是导航条不再暴露入口。日后内容齐了把按钮加回即可。
- **Sequence → Entry**：按钮文案改 `Entry`，`data-route="sequence"` 路由名不变（`#sequence` 仍是 Atlas）。`isRouteActive('sequence', 'download-sequences')` 高亮逻辑保留。

**职责**：导航只负责暴露入口与高亮当前路由。**依赖**：`isRouteActive`。**可独立验证**：渲染输出含 5 个指定按钮、不含被移除的 4 个文案。

### 5.2 首页 Hero（真实指标）

`homePage()` 的 hero metrics 区替换为 3 个真实指标：

| 指标 | 数值 | 来源 |
|---|---:|---|
| structure-linked records | 1,126 | 当前 `annojoin-atlas/index.json` cases（RMDB-only）|
| probing articles | 27 | 探针文章 index `article_count` |
| mechanism families | 6 | 探针 index `family_count` |

- 指标标签用 **probing articles**（27 是文章数，分布在 6 家族；与 §5.3 卡片「27 篇科普」表述统一，避免误读为「27 种方法」）。
- 数字**写死为模块顶部常量**（如 `HOME_METRICS`），不在运行时 fetch 9MB 的 Atlas index 去算。常量上方加注释标注来源与替换方式：`// 当前 RMDB-only 资产；替换 combined 后更新 structureLinkedRecords 为 displayCases 行数，并补 sourceCases 项`。
- 移除占位项（`species 22/xx`、`sequences xx`、`structures xx`、`Release 0.1 — 4 aligned database entrances`）。
- 不写「source cases 4070」——combined 未构建，不呈现不存在的数字。
- Hero 两个 CTA：`Browse Entry table →`（`data-route="sequence"`）、`Explore probing methods`（`data-route="probing"`）。移除指向 `download-sequences` / `structure` 的死链 CTA。

**职责**：呈现站点规模与主 CTA。**依赖**：`HOME_METRICS` 常量、`renderBundleHeader`。**可独立验证**：渲染输出含三个真实数字、不含 `xx` 占位、CTA `data-route` 为 `sequence`/`probing`。

### 5.3 首页三模块引导卡

Hero 下方新增一行三张卡片，复用现有 `bundle-site-card` 视觉语言：

- **Entry table** → `data-route="sequence"`：1,126 structure-linked PDB entries，搜索/分组/导出
- **Probing methods** → `data-route="probing"`：27 篇科普，6 个机制家族
- **Search** → `data-route="search"`：全站搜索探针文章与 PDB case

**职责**：把首页变成通往三大模块的入口。**依赖**：现有卡片样式类。**可独立验证**：渲染输出含三张卡、各自 `data-route` 正确。

### 5.4 Entry 表新增「PDB case」列

`annojoinAtlasTableModel.js` 的 `ANNOJOIN_TABLE_COLUMNS` 末尾追加：

```js
{ id: 'pdbCaseDetail', label: 'PDB case', defaultVisible: true }
```

- `annojoinAtlasView.js` 行渲染处为该列输出单元格：链接 `#pdb-case?pdbId=<PDB>`（pdbId 取 `row.pdbId`，沿用现有 `detailHref` / `buildPdbCaseHash` 模式）。
- **本阶段不做可用性交叉比对、不做/不修详情页**：每行都给链接；点进去若无内容（空页/404）是已接受的。日后详情页补齐后此列自动生效。
- 该列**不进导出**：`annojoinExportRow` 不动（它只导出源字段，派生 UI 链接不属于源字段）。
- 列显隐控制（`normalizeVisibleAnnojointColumnIds`）已是通用逻辑，自动覆盖新列。合并行只有一个 pdbId，链接照常。

**职责**：在总表内提供单 PDB 详情入口。**依赖**：`row.pdbId`、`#pdb-case` 路由。**可独立验证**：列定义含 `pdbCaseDetail` 且默认可见；导出行不含该列；行渲染含 `#pdb-case?pdbId=` 链接。

### 5.5 Search 语料重做

`scripts/build-search-docs.mjs` 调用的 `searchCorpus.js:buildSearchDocuments()` 重做为两类真实文档：

**① 探针科普文章（27 篇）** — 读 `probing-articles/index.json`：
```js
{
  id: `probing-article-${slug}`,
  type: 'probing-article',
  title: <article.title>,
  href: `#detail?tech=${slug}`,
  tags: ['probing', <familyId>],
  summary: <article.summary>,
  content: <title + summary + family 名>
}
```
家族 id 从 index 的 `families` 结构按文章归属解析；`#detail?tech=<slug>` 是探针阅读页现有路由（`detailPage()` 按 `?tech=` 解析）。

**② PDB cases** — 保留现有 `buildPdbCaseDocs()`，href 维持 `#pdb-case?pdbId=<ID>`（现状即此格式，验证保留）。

**移除**：data-type 文档（→`#browse`）、site 文档（→`#home`）、publication 文档（→`#publications`）、3 条写死 technology 文档（→`#detail?tech=shape` 等）。它们要么是占位数据、要么指向死路由或与真实 27 篇文章重复。

- **过滤器**：`type` 收敛为 `probing-article` / `pdb-case`；`tag` 探针文章带家族 tag，PDB case 保留现有 tag。
- **降级**：`probing-articles/index.json` 缺失时静默返回空（沿用 `buildPdbCaseDocs` 的 try/catch），构建不崩。
- **查询层不动**：`searchService.js`（Pagefind 接口）完全不改。
- **search 页文案**：`searchPage` 占位符 `"Search sequence, PDB ID, method, profile, DOI..."` → `"Search probing methods, PDB ID, molecule name..."`。实现前先 grep 确认该占位串在 `searchPage` 内的确切文本（注意区分 header 全局搜索框的 `"Search FoldBridge"`），避免 edit 目标串对不上。
- **PDB case href 验证**：`buildPdbCaseDocs` 现用 `row.detailHref`（来自 `rmdb-pdb-cases/index.json`），核查显示其值即 `#pdb-case?pdbId=<ID>`。实现时加一条断言确认该字段格式，再保留沿用。

**职责**：构建期产出全站搜索语料。**依赖**：`probing-articles/index.json`、`rmdb-pdb-cases/index.json`。**可独立验证**：产出含 27 条 `type:probing-article`，href 形如 `#detail?tech=`；无 `#browse`/`#home`/`#publications` 文档；PDB case href 形如 `#pdb-case?pdbId=`。

### 5.6 Help 页重做（实用导览页）

`helpPage()` 重做为四区块静态导览页，复用 `bundle-wide-card`：

1. **站点是什么** — 一段介绍：FoldBridge 把 RNA 化学探针数据与已解析三级结构关联，识别高置信度结构关联记录，整合二级/三级结构信息。
2. **模块导览**（各带跳转）：
   - Entry table（`#sequence`）— 总表怎么搜索/分组/导出，合并行怎么看来源
   - PDB case（Entry 表内的列）— 单个 PDB 的详情入口
   - Probing methods（`#probing`）— 27 篇科普，按 6 家族浏览
   - Search（`#search`）— 全站搜索探针文章与 PDB case
3. **关键术语速查**（`<dl>`，口径来自 ANNOJOIN 主表指南 / handoff）：
   - **source case vs display row** — 源 case 合并成展示行；同一 PDB 的 RMDB/RASP 来源合并但保留来源链接
   - **RMDB vs RASP** — 两个来源 family；RASP 当前 `positive_confidence_active_now=false`，展示为「not active」，不能解读为已激活的正向 confidence
   - **Confidence 标签（A/B/C）** — case-level 分布摘要，非 best-profile 分数；C 级是探索性提示，需结合 route 资产复核
   - **Conflicts** — 标注需复核的注释/证据冲突候选
4. **数据来源与引用** — 数据来自 RMDB / RASP / PDB，结构关联经 ANNOJOIN 主表物化；不编造引用，无字段标注「citation metadata not provided in current asset」。

**职责**：降低访客对数据口径的误读。**依赖**：无（纯静态内容）。**可独立验证**：渲染含四区块标题、含指向 `#sequence`/`#probing`/`#search` 的链接、不含 Browse/Structure/Download 字样。

### 5.7 死链清理汇总

| 位置 | 现状 | 处理 | 归属节 |
|---|---|---|---|
| 首页 Hero CTA | `download-sequences` / `structure` | 改 `sequence` / `probing` | 5.2 |
| 搜索语料文档 | `#browse` / `#home` / `#publications` | 移除这些文档 | 5.5 |
| Help 文案 | 列出 Browse/Structure/Download | 改写为 5 项导览 | 5.6 |
| `downloadPage` 内按钮 | 指向 sequence/structure/atlas | 页面已不可达，内部不动（保留）| — |

## 6. 数据流

```
构建期：
  npm run build:static        拷贝 index.html + src/ → dist/
  npm run build:search-docs   buildSearchDocuments() → 写 HTML 文档到 dist/
  npm run build:search-index  pagefind 扫 dist/ → 生成静态索引
  （npm run build = build:site 已串好以上）

运行时（浏览器）：
  main.js 按 hash 路由渲染页面
  Entry 表 / 探针文章 / PDB case 按需 fetch 各自 generated JSON
  Search 页经 searchService.js 加载 pagefind 索引查询
  首页指标读模块常量，不 fetch
```

## 7. 错误处理与降级

- 搜索语料构建：源 index 缺失时静默降级为空集，构建不崩（沿用现有模式）。
- 运行时资产缺失：各模块已有的 loading/error 状态机不动（`main.js` 现有 `*IndexState` / `*DetailState` 机制）。
- PDB case 列链接到未构建的详情：空页/404 是本阶段已接受的行为，不做防御。

## 8. 测试

| 单元 | 测试 | 断言要点 |
|---|---|---|
| 导航 5.1 | `test/modules.test.js` 或新增 | nav 含 5 按钮，不含被移除 4 项文案 |
| 首页 5.2/5.3 | 新增 home 用例 | 含三真实数字、无 `xx`、CTA route 为 sequence/probing、含三引导卡 |
| Entry 列 5.4 | `test/annojoin-atlas-table-model.test.js` | 列含 `pdbCaseDetail` 默认可见；导出不含；行渲染含 `#pdb-case?pdbId=` |
| Search 5.5 | `test/search-corpus.test.js` | 27 条 probing-article、href `#detail?tech=`；无死路由文档；PDB case href 正确 |
| Help 5.6 | 新增 help 用例 | 含四区块、含三跳转链接、不含 Browse/Structure/Download |

回归：`npm test` 全绿、`npm run build` 通过（含 pagefind 索引生成）。

## 9. 维护与替换注记（用户后续替换 combined 表）

替换 `annojoin-atlas` 资产为 combined（3610/4070）后需更新：

1. `HOME_METRICS.structureLinkedRecords`：1126 → combined displayCases 行数（3610）。
2. 视需要在 Hero 补回「source cases」指标（combined `totalSourceCaseCount`，如 4070）。
3. 首页引导卡 Entry table 描述文案的数字（1,126 → 新值）。
4. Help 页 Entry 区描述若引用了行数，一并更新。
5. Entry 表「PDB case」列与 Search 语料无需改动（按 pdbId 派生，自动适配新资产）。

数字写死处集中在 `main.js` 顶部常量，便于一处更新。
