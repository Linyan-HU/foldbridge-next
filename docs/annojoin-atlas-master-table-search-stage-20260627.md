# ANNOJOIN Atlas 主表搜索重设计 — 技术沉淀

日期：2026-06-27
仓库：`/Users/joseperezmartinez/docs/foldbridge`
合并目标：`main`（由 `feature/annojoin-atlas-web-adapter` fast-forward 并入，分支已删除）
最终提交：`bce3fe4`

本文档是 ANNOJOIN Atlas 主表演进的**统一入口与最新沉淀**。它沉淀本次"搜索重设计"阶段的产出、红线约束、RASP 激活翻转机制和文件落点，并在文末以时间线串联此前各阶段文档（不替代、不删除它们）。后续接手者从本文档进入即可。

---

## 1. 背景与动机

新一批 ANNOJOIN 数据将展示规模推到 **3610 个 PDB 展示行（由 4070 个 source case 支撑）**。原总表页（分组 + 分页的浏览式表格）无法承载这个体量下"快速定位某个结构"的需求，因此本阶段把主表改造成**搜索优先的双模式表格**。

任务优先级（锁定）：
- **A（最高）= 定位特定结构**：按 PDB ID / 分子名快速查找。
- **B = 筛选子集**。
- **C = 评估证据质量**。

## 1.5 数据现状（combined 主表已生成，2026-06-27）

主表搜索重设计的代码先于 combined 数据落地，因此一度运行在旧的 1126 全 RMDB 资产上。2026-06-27 已用本地 combined 源重新生成，主表现为真实的 3610/4070：

- **source 入口**：`…/rmdb2pdb/task_packages/fec_lss_rc3_release_20260623/local_stage/annojoin_three_table_json_20260625/view_roots/combined`（4070 行 = 4070 source case，按 pdb_id 去重 = 3610）。source family 分布：RMDB2PDB 1126 + RASP2PDB 2944。
- **生成命令**：`FOLDBRIDGE_ANNOJOIN_ROOT=<combined view root> npm run build:annojoin-atlas`（输出 `src/assets/generated/annojoin-atlas/`，该目录是 .gitignore 构建产物，脚本开头 `rm -rf OUT_ROOT` 自清，可重建）。
- **combine 逻辑**：`scripts/lib/annojoin-atlas-corpus.mjs` 的 `buildDisplayCases()`，按 pdb_id 分组；多 source 合并成一行打 `isMergedDisplayRow`、累加 profileCount、复合 confidence、`sourceFamilies:[RMDB2PDB,RASP2PDB]`。无需新写代码。
- **生成结果**：cases(source)=4070，displayCases=3610，totalCaseCount=3610，totalSourceCaseCount=4070；displayCases family 分布 `{RMDB2PDB:666, RMDB2PDB+RASP2PDB:460, RASP2PDB:2484}`（460 个合并行）。产物 33165 assets / 456 MiB（含 .br/.gz 懒加载副本，目录约 833M）。
- **详情页视觉预览（1D/2D/3D/mapped residue）暂缺**：本次生成未提供 ANNOCONFIDENCE/FEC 源（`lss_structure_context_annotation.tsv` / `residue_evidence.tsv`，本地未找到），故 `verify:annojoin-atlas` 报若干 `missing visual preview`。**本阶段范围只到 combined 主表**；视觉预览留待后续按 `docs/annojoin-5gag-linked-smoke-stage-20260626.md` 分 RMDB/RASP coverage 轴的全量生成补齐，届时需 staging ANNOCONFIDENCE/FEC 源（历史上为 24G，见 asset-refresh 文档）。

## 2. 交付能力

**核心搜索（优先级 A）**
- 双模式：空筛选 = 浏览模式（parent/child 分组 + 分页）；输入文字 = 扁平的按匹配度排序列表，分组暂停。
- 同时匹配 **PDB ID 和分子名**。
- 匹配度分级排序（见 §4）。
- 即时搜索：`input` 事件 + 150ms 防抖；Enter 立即应用。
- 重渲染（全量 innerHTML 重写）时保留搜索框焦点与光标位置。

**配套交互（B/C 美化）**
- 双口径计数：`3610 PDB entries (4070 source cases)`；搜索态显示 `Showing N of 3610 entries matching "<query>"`。
- 可移除筛选 chip（`renderActiveConditionChips`）+ "Clear all"。
- "Clear search" 按钮**仅清空查询 `q`**（绑定 `removeFilter('q')`），不波及其它 chip 筛选——这是 final review 后修的语义问题（提交 `bce3fe4`）。
- 搜索模式提示条 + 空结果占位（含各自的清除按钮）。
- RMDB / RASP 来源徽标数据驱动（见 §3）。
- confidence 复合标签分段呈现且**不截断**，完整原文存 `title`。分子名**不截断**。

## 3. RASP 激活翻转机制（红线相关，重点）

来源徽标的激活态由**数据驱动**，不在渲染层硬编码：

- 函数：`familyBadgeDescriptor(family, activationOverride = {})`，位于 `src/annojoinAtlasTableModel.js:159`。
- 默认：`DEFAULT_FAMILY_ACTIVATION = { RMDB2PDB: true, RASP2PDB: false }`。
- 当前 RASP `positive_confidence_active_now=false` → 徽标渲染为 `is-inactive`，附 `note: 'not active'`，**绝不**渲染为已激活的正向 confidence。
- **将来 RASP 上线后**：调用处传 `activationOverride={ RASP2PDB: true }` 即可翻转，渲染层（`renderFamilyBadges`）无需任何改动。

测试锁定：`test/annojoin-atlas-table-model.test.js` 断言 `rasp.active === false` 且 `note === 'not active'`。

## 4. 匹配度排序口径

`scoreAnnojointMatch(row, query)`（`src/annojoinAtlasTableModel.js`）返回分级：

| 分值 | 含义 |
|---:|---|
| 4 | PDB 精确匹配 |
| 3 | PDB 前缀匹配 |
| 2 | 分子名子串匹配 |
| 1 | PDB 子串匹配 |
| 0 | 无匹配（被过滤掉） |

`searchAnnojointRows` 按 `score` 降序、同分按原始 index 升序稳定排序。`isAnnojointSearchActive(query)` 判定是否进入搜索态。

## 5. 文件落点（分层）

| 文件 | 职责 | 本阶段新增/改动 |
|---|---|---|
| `src/annojoinAtlasTableModel.js` | 纯逻辑，无副作用 | `scoreAnnojointMatch` / `searchAnnojointRows` / `isAnnojointSearchActive` / `familyBadgeDescriptor` / `foldText` |
| `src/annojoinAtlasView.js` | 纯 HTML 渲染，不绑事件不读全局态 | `renderFamilyBadges` / `renderConfidenceSegments` / 双口径计数 meta / `renderActiveConditionChips` / 搜索模式提示条 / 扁平渲染 |
| `src/annojoinAtlasController.js` | DOM 事件绑定 | 防抖搜索输入；chip 移除 / clear-all / clear-search 绑定 |
| `src/main.js` | 路由 / URL 参数 / 全局态编排 | `setAnnojointAtlasFilter` / `setAnnojointAtlasQuery` / `clearAnnojointAtlasFilters` / `currentAnnojointAtlasState` 搜索集成 / 跨渲染焦点与光标保留 |
| `src/styles.css` | 视觉（token 驱动） | 徽标 / confidence 分段 / chip / 搜索框 / 提示条规则，全部用 theme token，暗色安全 |
| `test/annojoin-atlas.test.js`、`test/annojoin-atlas-table-model.test.js` | 测试 | 对齐扁平渲染、来源编码、双口径计数 |

## 6. 红线约束（接手者必读，勿违反）

1. **分子名永不截断**（无 `text-overflow: ellipsis` / `overflow: hidden`；用 `overflow-wrap: anywhere`）。
2. **RASP 永不渲染为已激活的正向 confidence**（见 §3）。
3. **展示行保持 3610，绝不退回 4070**（4070 是 source case 数，只作括注口径）。
4. **首页 Pagefind 搜索层不动**（本阶段未触碰 `src/search/`）。
5. **不引入新颜色 / 字体**，只用 `theme.js` 的 design token。

## 7. 验证状态

- atlas 专属测试 35/35 通过：`node --test test/annojoin-atlas.test.js test/annojoin-atlas-table-model.test.js`。
- `npm run build` 通过（977 页）。
- 最终整体代码审查（opus）：可以合并，无 critical/important 问题。

**combined 真实数据端到端验证（2026-06-27）**：用 §1.5 重新生成的 3610/4070 资产，`npm run build:static` + 本地 `npm run serve` 实测：
- 服务端 index：`displayCases=3610 totalCaseCount=3610 totalSourceCaseCount=4070`，family `{RMDB2PDB:666, RMDB2PDB+RASP2PDB:460, RASP2PDB:2484}`。
- 渲染层（`renderAnnojointAtlasPage`）实跑真实数据：浏览态双口径计数 `3610 PDB entries (4070 source cases)`；RASP 徽标带 `not active`；搜索 `ribozyme` → `Showing 22 of 3610 entries matching "ribozyme"`（分子名匹配生效），搜索模式提示条出现。红线全部守住。

**已知无关红测**：`npm test` 全量为 147 通过 / 1 失败。唯一失败是 `5GAG smoke resource provenance manifest records source tools and dispatch boundaries`（`test/annojoin-5gag-linked-smoke.test.js`），属于本分支上**早于本阶段的未提交 WIP**，失败点是静态 fixture 里一段文案的正则断言，与搜索重设计无关，本阶段未修改它。

**已知数据缺口（非回归，范围外）**：`verify:annojoin-atlas` 在 combined 资产上报若干 `missing visual preview for 1D/2D/3D/mapped residues`——因本次生成未提供 ANNOCONFIDENCE/FEC 源（见 §1.5）。本阶段范围只到 combined 主表，视觉预览留待后续全量生成补齐。

**Docker 端到端**：本次未跑（base image `node:22-bookworm-slim` 未缓存且 Docker Hub 不可达）。已用本地 `npm run serve` 等价验证（`serve.mjs` 的 `defaultAnnoRoot` 与 Docker 挂载同源）。如需容器级确认，待 registry 可达后 `docker compose up -d --build`。

## 8. 阶段文档时间线（统一索引）

本阶段之前的各阶段记录仍然有效，按时间线保留如下；本文档作为最新入口，不替代它们：

1. `docs/annojoin-atlas-branch-stage-record-20260618.md` — 旧单页基线 + 拆成总表页/详情页的返工指令（历史，已被实现取代）。
2. `docs/annojoin-master-table-ui-stage-20260618.md` — 总表页 UI 底座：分组规则、文件边界、列显隐、profile trace、折叠交互。
3. `docs/annojoin-atlas-asset-refresh-20260618.md` — 资产重生成（构建/数据运维，含 3NKB display 回归口径）。
4. `docs/annojoin-atlas-web-handoff-20260618.md` — 9 个一级能力、数据入口表、生成资产策略、Docker、验证命令。
5. `docs/annojoin-5gag-linked-smoke-stage-20260626.md` — 详情页 1D/2D/3D 联动与 qcov/scov 资产轴判断（独立关注点，全量 RMDB/RASP 生成前必读）。
6. `docs/superpowers/specs/2026-06-26-annojoin-atlas-master-table-search-design.md` — 本阶段规格。
7. `docs/superpowers/plans/2026-06-26-annojoin-atlas-master-table-search.md` — 本阶段实现计划（7 任务 + 6 处 spec-vs-reality 偏差记录）。

## 9. 本阶段提交清单

```text
b9f1e39 主表搜索匹配度排序纯函数 (任务1)
662905b 搜索模式判定与 family 徽标描述符 (任务2)
6176038 搜索模式扁平渲染与来源/confidence 视觉编码 (任务3)
cc5220e 主表视图测试对齐扁平渲染与来源编码 (任务3)
5a2611c 空结果不重复清除按钮 + confidence 空值回退 (任务3)
44907f9 主表导览反馈控件 (任务4)
238fc7c 合并搜索模式提示并精简计数逻辑 (任务4)
30c6571 搜索即时化与筛选 chip 清除 (任务5)
6b39c2f 补全主表编排依赖闭包 (任务5)
411b413 主表搜索控件与 C/D 视觉美化 (任务6)
4e71bbe 修正分组 toggle 暗色对比与 chip/嵌套行交互 (任务6)
bce3fe4 清搜索按钮仅清空查询而非全部筛选 (final review 修正)
```
