# FoldBridge 站点内容扩充（ABC 三模块）设计

- 日期：2026-06-30
- 分支基线：`release-public`（上线分支，详情页/站点发布以此为准）
- 状态：设计草案，待规格审查 + 用户审查
- 关联：站点为无框架/无打包器的 vanilla ES module 静态站（`src/*.js` + `node --test`）

## 1. 背景与目标

### 1.1 目标
让 FoldBridge 站点内容更厚、更成熟，面向**评审/合作方展示**场景（成功标准 = 评审浏览时认为"这是一个数据真实、方法严谨、信息完整的严肃项目"）。

### 1.2 范围（三个独立内容模块）
- **A · About / 方法学页**（新路由 `#about`）：项目定位、数据来源、建库流水线、置信度方法、阈值诚实声明、如何引用。原 `#help` 内容并入。
- **B · Stats / 全局概览页**（新路由 `#stats`）：用真实数字与内联 SVG 图表展示库的体量与分布。
- **C · Probing 科普中心升级**（升级现有 `#probing`/`detail` 路由，**不新增导航项**）：家族索引 + 技术对比表 + 术语表，保留现有轮播与 27 篇文章列表。

### 1.3 非目标（YAGNI）
- 不引入任何前端框架、打包器、图表库（继续纯 vanilla + 内联 SVG）。
- 不改详情页渲染器（workbench.js）、不改 ANNOJOIN Atlas 总表数据层。
- 不做团队页、不做账号/收藏等交互功能。
- 不重构 `main.js`/`styles.css` 的既有无关部分（只在指定锚点追加）。

## 2. 最高优先级约束（铁律）

### 2.1 数据真实性（红线）
所有内容基于真实、可溯源的方法学与运行数据，**绝不编造**。缺失的字段留空或显式标注"未物化/待校准"，不用占位假数据。

### 2.2 数字口径一致性（红线）
- 站点对外展示的"PDB / 结构关联记录"总数，必须等于用户在 **Entry 表实际能浏览到的可见口径**（应用与 Entry 表相同的"屏蔽无数据 case"过滤后的计数；当前实测 = **2386**）。
- build 期 `index.json` 顶层 `displayCases`/`totalCaseCount` = **3401**，这是过滤前的原始数；**不得**直接对外展示 3401。
- **单一来源原则**：把 Entry 表的可见性过滤逻辑抽成一个**共享纯函数**（如 `src/lib/entryVisibility.js` 的 `isEntryVisible(caseRow)` / `filterVisibleCases(cases)`），浏览器 Entry 表与 build 脚本（§4.2）都 import 同一份，使可见计数单一来源、永不漂移。统计页数字一律由该函数在构建期从同一份 atlas 数据派生计算，**默认禁止手写常量**。
- **唯一受控例外**：仅当过滤逻辑确实无法移植到 build 期（依赖运行时浏览器状态）时，允许 stats.json 写一个来自**带日期验证运行**的常量，并标注 `source: "manual verify <date>"`；此例外必须在 stats.json 与本规格中显式记录，不得隐式硬编码。除此之外不得手写。
- 测试用的 ground-truth 锚点值（如 `=== 2386`）是被批准的唯一测试常量（见 §7）。

### 2.3 视觉一致性（红线）
新页面必须与现有页面同一视觉语言：
- 设计 token 来自 `src/design-tokens.css`（暖奶油金底 + 绿色强调 `--accent #2F8F6B`/`--primary #174B3A`，字体 `--fontFamily "Avenir Next"`，`--radiusCard 22px`，`--panel-card-*` 金边卡片）。
- 复用既有 class 骨架（`card`/`bundle-wide-card`/`bundle-home-shell`/`technology-*` 等），新样式只在 `styles.css` 末尾的命名锚点区追加，用 token 不硬编码 hex。
- 头部复用 `renderBundleHeader()` + `renderPrimaryNav()`，与主站完全对齐。

## 3. 模块 A · About / 方法学页（`#about`）

### 3.1 职责
单一职责：用静态策展内容回答"FoldBridge 是什么、数据从哪来、库是怎么建的、置信度怎么算、阈值是否可信、如何引用"。原 `#help` 内容并入本页（删除独立 help 路由，导航 Help → About）。

### 3.2 数据源
新建策展数据 `src/assets/data/about-content.json`（章节化结构），内容来自有据可查的真实方法学（A–F 置信度家族、ANNOJOIN 流水线、34 项探针技术注册表、阈值文献依据）。**纯静态、入 git、无构建期生成**（与运行数据无关，避免引入 build 依赖）。

`body` 字段格式：**纯文本**（plain text），渲染时用 `textContent` 语义安全插入（或在拼 HTML 字符串时转义），不接受 HTML 标记。需要结构化排版（列表、流程图）的章节用 `kind` + `items`/结构字段表达，不在 `body` 里塞 HTML。

JSON 结构（草案）：
```json
{
  "schema_version": "about.v1",
  "hero": { "kicker": "...", "title": "...", "summary": "...", "detail": "..." },
  "sections": [
    { "id": "data-sources", "title": "...", "kind": "prose|cards|pipeline|table", "body": "...", "items": [...] }
  ]
}
```

### 3.3 章节（内容大纲）
1. **定位**：FoldBridge 把 RNA 化学探针数据与已解析的三级结构关联（复用 hero 文案口径）。
2. **三源数据**：RMDB / RASP / PDB 各是什么、各自贡献什么（卡片式）。
3. **建库流水线**：ANNOJOIN 如何把探针派生序列对齐到 PDB 链 → 物化结构关联记录。配一张**内联 SVG 流程图**（probing data → sequence match → PDB entry → confidence scoring → structure-linked record）。
4. **置信度方法**：A–F 六大测量家族（A=WC-face 碱基特异 / B=SHAPE 柔性代理 / C=酶切反向 / D=SASA 双参考 / E=接触图 / F=配对集 F1），强调 **family = 测量的物理量，不是质量排名**；强度全在 tier（STRONG/MODERATE/WEAK/...）。
5. **阈值诚实声明**：A/B/C 的 0.70/0.65/0.55 是 RC3 运行值（非论文发布阈值）；只有 RL-Seq 的 Spearman 0.50/0.40/0.30 是文献设定。`threshold_basis` 三档计数 = **1 SUPPORTED / 10 INFORMED / 23 PENDING（共 34 技术）**。
6. **如何引用 + 数据来源**：RMDB/RASP/PDB 来源声明，引用方式占位（无 DOI 则留空不编造）。
7. **关键术语**（原 Help 的 key terms 并入）：source case vs display row、RMDB vs RASP、Confidence A/B/C、Conflicts。

### 3.4 渲染
- `src/aboutContentStore.js`：浏览器侧加载层（镜像 `probingArticleStore.js`：相对路径基址 + 内存缓存 + 注入 fetch 测试）。
- `siteChrome.js` 新增纯函数 `renderAboutPage(content)`：入参 content → 返回 HTML 字符串；空/缺失 → 降级占位壳。
- `main.js`：`about` 路由分派 + 懒加载（与 probing 路由同款异步加载后 re-render 守卫）。

### 3.5 边界/降级
- content 加载失败 → 渲染最小静态壳（标题 + "内容加载中/不可用"提示），不白屏。
- SVG 流程图为纯静态内联，不依赖外部库。

## 4. 模块 B · Stats / 全局概览页（`#stats`）

### 4.1 职责
单一职责：用真实数字 + 内联 SVG 图表展示库的体量与分布，给评审"一眼看到规模"的冲击力。

### 4.2 数据源（构建期派生，禁止手写）
新建构建脚本 `scripts/build-site-stats.mjs`，读取已有真实资产，产出 `src/assets/generated/site-stats/stats.json`（入 git）。输入：
- `src/assets/generated/annojoin-atlas/index.json`（PDB 计数、家族分布、来源占比）。PDB 总数经 §2.2 的共享 `filterVisibleCases` 派生（= 2386 口径）。
- 校准表（若本机可读）：tier 分布数字。已知运行沉淀来源（实现期任务 0 §6.3 核实路径可读性）：
  - RMDB ABC 校准：`<RMDB_ABC_LSS>/cal/abc_lss_calibrated.tsv`（约 218638 行）。
  - RASP Family D 校准：`<RASP_D_LSS>/cal/def_lss_calibrated.tsv`（约 10229 行）。
  - **校准表不可读时的回退常量**（来自 2026-06-27 运行沉淀，stats.json 标注 `source: "run-record 2026-06-27"`）：RMDB ABC tier 分布 STRONG 283 / MODERATE 1191 / WEAK 18635 / DISCORDANT 33876 / UNDERPOWERED 50062 / NOT_SUPPORTED 114591（共 218638）；Family D SASA 覆盖 SASA_PRESENT 8417 (82.3%) / PAIRING_PROXY_FALLBACK 1812 (17.7%)（共 10229）。这些是被批准的、带日期标注的回退常量，非随意硬编码。
- `src/assets/generated/probing-articles/index.json`（27 篇 / 6 家族）。
- 探针技术注册表（见 §5.2 拷入的精简 JSON）→ 34 技术计数 + threshold_basis 三档（1/10/23）。

### 4.3 关键派生：PDB 总数必须 = Entry 表可见口径（§2.2 铁律）
build 脚本对 `index.json` 的 `displayCases` 应用**与 Entry 表运行时相同的可见性过滤**（屏蔽无数据/未物化 case），得到对外展示的 PDB 总数。实现期任务必须：
1. 在浏览器数据层（`annojoinAtlasData.js` 或 atlas view）定位 Entry 表实际渲染前的过滤逻辑（当前把 3401 收窄到 2386 的那段）。
2. 在 build 脚本中复刻同一过滤，断言派生总数 == Entry 表显示数。
3. 若过滤逻辑只存在于浏览器运行时、build 期无法纯复刻 → 退化方案：build 脚本同样输出原始 3401 与可见 2386 两个字段，统计页**只展示可见 2386**，并在 stats.json 注明两者关系。

### 4.4 图表（全部内联 SVG，无图表库）
- 体量数字卡：结构关联记录(2386)、source cases、探针技术(34)、机制家族(6)、置信度文章(27)。
- 置信度 tier 分布柱状图（复用 confidence 文章已有的纯 SVG 柱状模式，log 或线性轴据数据定）。
- Family D SASA 覆盖饼图/donut（SASA_PRESENT vs PAIRING_PROXY_FALLBACK）。
- RMDB vs RASP 来源占比 + 家族（A/B/C/D...）分布条。
- **增量交付优先级**（速度优先，允许分批落地不阻塞 merge）：**核心必发** = 数字卡 + tier 分布柱状图（最具体量冲击力）；**增量可后补** = SASA donut + 来源占比条（W-B 可先发核心再补，缺图位显示"数据未物化"占位）。
- 每张图**必须有数据来源脚注**（"as of run <date>, source <path>"），不伪造 live。

### 4.5 渲染
- `src/siteStatsStore.js`：浏览器侧加载层（镜像 probingArticleStore）。
- `siteChrome.js` 新增 `renderStatsPage(stats)`：纯函数，入参 stats → HTML；空/缺失 → 降级占位。
- `main.js`：`stats` 路由 + 懒加载 + re-render 守卫。

### 4.6 边界/降级
- stats.json 加载失败 → 渲染数字卡的静态壳 + "统计数据加载中"提示，不白屏。
- 任一图表数据缺失 → 该图位显示"数据未物化"占位，其余照常。

## 5. 模块 C · Probing 科普中心升级（`#probing` / `detail` 路由）

### 5.1 职责
把现有"轮播 + 27 篇文章列表"升级为成体系的科普中心，**不新增导航项**（仍在 Probing 路由内）。复用现有基础设施：`renderProbingArticleIndex`、`technologyCategories`/`technologyMethods`（定义在 `main.js`）、`renderTechnologyOverviewPage`。

### 5.2 数据源
- 现有 27 篇文章 `probing-articles/index.json`（6 家族分组，已含 rep_figure/family_title）。
- 新拷入精简版技术注册表：从 rmdb2pdb 仓 `task_packages/.../probe_confidence_method_registry.tsv`（34 行）提取展示所需列 → `src/assets/data/probe-technology-registry.json`（technology / measurement_family / targetable_bases / threshold_basis / 关联文章 slug）。**入 git、静态、不引 build 依赖**。

### 5.3 新增三块（叠加在现有 index 之上）
1. **家族索引卡**：6 个机制家族（来自 probing index `families`）分组卡片，点击锚跳到该家族文章组。
2. **34 技术对比表**：列 = 技术 / 家族(A–F) / 靶碱基 / 阈值依据(SUPPORTED/INFORMED/PENDING) / 关联文章链接。可按列排序（纯 JS，无库）。强调 family = 物理量非排名（与 About §3.3.4 口径一致）。
3. **术语表**：WC-face / SHAPE / SASA / paired_state / tier / reactivity 等缩写速查（与 About 术语节去重——术语表是速查清单，About 是叙述，可交叉链接）。

### 5.4 渲染
- `siteChrome.js` 新增纯函数：`renderProbingFamilyIndex(families)`、`renderProbingTechTable(registry)`、`renderProbingGlossary(terms)`。
- `main.js` 的 `renderProbingArticleIndex` 组装处插入这三块（在现有轮播/列表区之上或之间），保持现有列表与轮播不动。
- 技术注册表经新 store 或直接随 index 一起加载（择简）。

### 5.5 边界/降级
- 注册表加载失败 → 仅隐藏对比表，家族索引与文章列表照常。
- 排序为纯客户端增强，无 JS 时表格仍以默认序静态可读。

## 6. 共享改动与并行冲突规避

### 6.1 共享文件（三模块都会碰）
- `src/main.js`：新增 `about`/`stats` 路由分派 + 三处懒加载守卫；Probing 组装处插入 C 的三块。
- `src/siteChrome.js`：`PRIMARY_NAV_ITEMS` 增 Stats/About、移除独立 Help（并入 About）；追加各 `render*` 纯函数。
- `src/styles.css`：三模块样式，各自在末尾命名锚点区追加。
- `README.md`：Included pages 更新。

### 6.2 骨架先行（关键：避免并行 agent 撞同一行）
**实现第一步由主控做一个"骨架 commit"**，把所有共享文件的接缝一次性铺好：
- `PRIMARY_NAV_ITEMS` 改成最终形态（Home/Entry/Probing/Stats/About/Search）。
- `main.js` 加 `about`/`stats` 路由占位（先渲染空壳）+ 懒加载函数桩。
- `styles.css` 末尾插入三段命名注释锚点：`/* === ABOUT PAGE === */`、`/* === STATS PAGE === */`、`/* === PROBING HUB === */`。
- `siteChrome.js` 末尾插入三段对应锚点。

之后分派 3 个 agent，每个**只在自己模块的锚点区**填充 + 各自的 store/build/数据/测试文件（互不重叠）。

### 6.3 实现期必须先查清的事项（任务 0）
1. Entry 表把 3401 收窄到 2386 的**可见性过滤逻辑**位置与判据（§4.3 依赖）。
2. tier 分布、Family D SASA、RMDB/RASP 占比的真实数字来源（校准表本机可读性）。
3. 现有 `technologyCategories`/`technologyMethods` 与 27 篇文章 slug 的对应关系（C 复用边界）。

### 6.4 并行实现拆分（实现期，非规格期）
- **W-A**：`about-content.json` + `aboutContentStore.js` + `renderAboutPage` + 锚点 CSS + 测试。
- **W-B**：`build-site-stats.mjs` + `stats.json` + `siteStatsStore.js` + `renderStatsPage` + 锚点 CSS + 测试。
- **W-C**：`probe-technology-registry.json` + 三个 render 纯函数 + Probing 组装插入 + 锚点 CSS + 测试。
- 经 `using-git-worktrees` 串行预建 worktree，再 `subagent-driven-development` 并行执行；最后串行 merge（骨架 commit 已消除共享文件行级冲突）。

## 7. 测试策略
- 每个 `render*` 纯函数：`node --test`，断言关键内容出现（标题、数字、表格行数、SVG 存在）、空数据降级返回壳。沿用 `test/site-chrome.test.js` 风格（`assert.match`/`doesNotMatch`）。
- `build-site-stats.mjs`：测产出 schema + **派生 PDB 总数 == Entry 表可见口径**的断言。该断言同时锁定两端：(a) build 派生值 == 浏览器 `filterVisibleCases` 产出（共享函数自洽）；(b) build 派生值 == 已知 ground-truth 观测锚点（`=== 2386`，§2.2 批准的唯一测试常量，作为对现实的硬锚）。两者同时成立才算通过，避免共享函数"自己锁自己"。
- store：注入 fetch 测加载/缓存/失败降级（镜像现有 store 测试）。
- 全量 `npm test` 保持绿；新增测试不破坏既有基线。

## 8. 验收标准
- 三个模块上线后，导航出现 Stats/About，Probing 升级为科普中心。
- 旧 `#help` 路由已移除/重定向到 `#about`，无悬空死路由（导航不再有独立 Help）。
- 统计页 PDB 总数显示 = Entry 表（2386），无 3401 泄漏。
- 新页面视觉与主站一致（token 驱动、暖金底+绿强调、Avenir Next）。
- 所有展示数字可溯源，无编造；缺失项显式标注。
- `npm test` 全绿。

## 9. 风险
- **数字口径**：若 build 期无法纯复刻 Entry 可见性过滤 → 采用 §4.3 退化方案（双字段，只展示可见数）。
- **校准表可读性**：本机/CI 不一定能读校准表 → §4.2 回退到运行沉淀常量 + 来源标注。
- **release-public worktree 占用**：merge 时遵循"去占用 worktree 内部 ff-merge"经验，不 force-update 他人活跃分支。

