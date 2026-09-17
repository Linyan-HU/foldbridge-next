# FoldBridge 交互式 Stats Dashboard 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现；每项实现遵循 superpowers:test-driven-development，并在完成前使用 superpowers:verification-before-completion。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 用当前发布资产自动派生可靠统计，并把 `#stats` 改为符合 FoldBridge 风格的轻量交互 dashboard。

**架构：** 构建脚本严格验证 entry table、技术注册表和文章索引，输出带源数据契约的 `site-stats.v2` JSON。浏览器同时加载该摘要和 entry table，纯函数负责筛选/计数，现有 SPA 渲染层负责原生按钮图表和筛选事件；不新增外部可视化依赖。

**技术栈：** Node.js ESM、`node:test`、现有 vanilla JavaScript SPA、HTML/CSS。

**工作树：** `/Users/joseperezmartinez/docs/foldbridge/.worktrees/remove-help-sections-main`

**提交边界：** 当前执行只修改并验证工作树；除非用户另行授权，不 commit、不 push。

---

## 文件结构

- 修改 `scripts/build-site-stats.mjs`：读取并严格验证三份 canonical assets，再组装 `site-stats.v2`。
- 创建 `src/statsDashboard.js`：共享的 entry 行归一化/统计契约，以及无 DOM 的筛选切换和匹配摘要纯函数。
- 修改 `src/siteStatsStore.js`：并行加载 Stats 与 entry table，校验版本契约并保留可诊断错误。
- 修改 `src/siteChrome.js`：渲染六张指标卡、三个可点击分布、筛选 chips、匹配摘要与错误态。
- 修改 `src/main.js`：保存筛选状态、加载 bundle、绑定 dashboard 控件。
- 修改 `src/styles.css`：复用现有 FoldBridge token，补响应式 dashboard 样式。
- 生成 `src/assets/generated/site-stats/stats.json`：提交可直接发布的派生结果。
- 创建 `test/site-stats-build.test.js`、`test/stats-dashboard.test.js`、`test/site-stats-store.test.js`、`test/stats-page.test.js`：覆盖数据、交互模型、加载契约和输出结构。
- 创建 `test/stats-dashboard-integration.test.js`：用轻量 source/style contract 覆盖 SPA wiring 与响应式样式，不引入 jsdom。
- 修改 `package.json`：增加可独立执行的 `build:site-stats` 和 `test:stats` 命令，不依赖此 Pages 快照中缺失的旧构建脚本。

### 准备：物化稀疏工作树中的构建脚本

- [ ] **步骤 1：扩展 sparse checkout 并确认脚本存在**

运行：`git sparse-checkout add scripts`

运行：`test -f scripts/build-site-stats.mjs`

预期：命令成功；后续测试失败来自功能断言，而不是 `ERR_MODULE_NOT_FOUND`。

### 任务 1：把统计生成器改为 fail-closed 派生

**文件：**
- 修改：`scripts/build-site-stats.mjs`
- 创建：`src/statsDashboard.js`
- 创建：`test/site-stats-build.test.js`
- 修改：`package.json`
- 生成：`src/assets/generated/site-stats/stats.json`

- [ ] **步骤 1：编写失败的派生与验证测试**

测试构造小型 entry rows，并断言：

```js
const stats = deriveStats({ entryTable, technologyRegistry, articleIndex });
assert.equal(stats.schema_version, 'site-stats.v2');
assert.equal(stats.metrics.rna_chains, 4);
assert.equal(stats.metrics.pdb_structures, 3);
assert.equal(stats.metrics.pdbs_with_high_confidence_chain, 1);
assert.deepEqual(stats.distributions.source_coverage, { geo: 2, rasp: 1, rmdb: 2 });
assert.deepEqual(stats.entry_contract, deriveEntryStatsContract(entryTable.rows));
```

另测：逗号来源去空格/去重、空 partition 映射为 `Unclassified RNA`、重复 `pdb_id + chain_key`、未知 source、非法 confidence、registry 重名、文章计数不一致均抛出带字段名的错误。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test test/site-stats-build.test.js`

预期：FAIL；旧 `deriveStats()` 不接受资产且仍返回固定数字。

- [ ] **步骤 3：实现最少派生逻辑**

先在 `src/statsDashboard.js` 导出共享的 `normalizeStatsEntryRow()` 和 `deriveEntryStatsContract()`，后者返回四个 entry-backed 指标与三份分布。再从构建脚本导出 `deriveStats({ entryTable, technologyRegistry, articleIndex })`；CLI 从以下路径读取：

```js
src/assets/generated/entry-table/entry-table.json
src/assets/data/probe-technology-registry.json
src/assets/generated/probing-articles/index.json
```

按 `high > low > not_supported` 取每个 PDB 的 strongest chain confidence。输出字段只包括：

```js
{
  schema_version: 'site-stats.v2',
  entry_schema_version: 'entry-table.v1',
  entry_contract: {
    metrics: { rna_chains, pdb_structures, chains_with_probing_profiles, pdbs_with_high_confidence_chain },
    distributions: { rna_class, chain_confidence, source_coverage }
  },
  metrics: {
    rna_chains,
    pdb_structures,
    chains_with_probing_profiles,
    pdbs_with_high_confidence_chain,
    registered_technologies,
    explainer_articles
  },
  distributions: {
    rna_class,
    chain_confidence,
    source_coverage
  }
}
```

- [ ] **步骤 4：生成真实 Stats 资产并确认预期值**

运行：`node scripts/build-site-stats.mjs`

预期核心值：`17843` chains、`5321` PDBs、`14953` profiled chains、`2698` PDBs with high chain、`34` technologies、`37` articles；来源覆盖为 RMDB `14832`、GEO `9066`、RASP `8264`。

- [ ] **步骤 5：运行派生测试确认通过**

运行：`node --test test/site-stats-build.test.js`

预期：PASS。

### 任务 2：建立无 DOM 的 dashboard 筛选模型

**文件：**
- 修改：`src/statsDashboard.js`
- 创建：`test/stats-dashboard.test.js`

- [ ] **步骤 1：编写失败的筛选测试**

覆盖：默认全量、同维度 toggle、跨维度 AND、source membership、空 partition 归类、去重 PDB 摘要、reset。

```js
const filters = toggleStatsFilter(emptyStatsFilters(), 'confidence', 'high');
const next = toggleStatsFilter(filters, 'source', 'rmdb');
const summary = summarizeStatsRows(rows, next);
assert.deepEqual(summary, { chain_count: 1, pdb_count: 1 });
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test test/stats-dashboard.test.js`

预期：FAIL；模块不存在。

- [ ] **步骤 3：实现纯函数**

在共享归一化/契约函数之外导出 `emptyStatsFilters()`、`toggleStatsFilter()`、`clearStatsFilters()`、`filterStatsRows()`、`summarizeStatsRows()`。未知维度或非法 filter 值抛错，不静默兼容。

- [ ] **步骤 4：运行筛选测试确认通过**

运行：`node --test test/stats-dashboard.test.js`

预期：PASS。

### 任务 3：加载并交叉校验两份运行时资产

**文件：**
- 修改：`src/siteStatsStore.js`
- 创建：`test/site-stats-store.test.js`

- [ ] **步骤 1：编写失败的 store 测试**

注入 `fetchImpl`，断言：两份资产只各请求一次、重复调用命中同一缓存；HTTP 失败、JSON 异常、schema 不匹配，以及 profiles/confidence/partition/source 任一统计相关字段变化造成的完整 entry contract 不匹配分别 reject，错误消息包含 `stats` 或 `entry table` 来源。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test test/site-stats-store.test.js`

预期：FAIL；旧 store 只加载 `stats.json` 并吞掉错误。

- [ ] **步骤 3：实现 `loadDashboard()`**

默认 URL：

```js
./src/assets/generated/site-stats/stats.json
./src/assets/generated/entry-table/entry-table.json
```

用 `Promise.all` 加载，校验 `site-stats.v2` 和 `entry-table.v1`；对 fetched rows 调用共享 `deriveEntryStatsContract()`，与 `stats.entry_contract` 深比较后再缓存 `{ stats, rows }`。错误保持 reject，让页面显示明确 unavailable 状态。

- [ ] **步骤 4：运行 store 测试确认通过**

运行：`node --test test/site-stats-store.test.js`

预期：PASS。

### 任务 4：渲染 FoldBridge 风格的交互 dashboard

**文件：**
- 修改：`src/siteChrome.js`
- 创建：`test/stats-page.test.js`

- [ ] **步骤 1：编写失败的渲染测试**

断言输出包含：六个新标签、`data-stats-filter-dimension` 按钮、`aria-pressed`、三个 panel、overlap 提示、active chip、reset、动态 chain/PDB summary、Entry 链接；错误态必须包含 `Statistics unavailable` 且不包含旧数字或 `undefined`。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test test/stats-page.test.js`

预期：FAIL；旧页面只有固定卡片与单个竖条图。

- [ ] **步骤 3：实现最小 HTML 渲染**

渲染器接收 `{ status, stats, rows, filters, error }`。图表使用原生 `<button>` 与 CSS 宽度条；RNA class panel 全宽，Confidence 与 Source 两列；chart 数值取全局 `stats.distributions`，匹配摘要取 `summarizeStatsRows(rows, filters)`。

- [ ] **步骤 4：运行渲染测试确认通过**

运行：`node --test test/stats-page.test.js`

预期：PASS。

### 任务 5：连接 SPA 状态和样式

**文件：**
- 修改：`src/main.js`
- 修改：`src/styles.css`
- 创建：`test/stats-dashboard-integration.test.js`

- [ ] **步骤 1：编写失败的 wiring/style contract 测试**

测试读取 `src/main.js` 与 `src/styles.css`，断言 main 调用 Stats 控件初始化、绑定 `data-stats-filter-dimension` 与 reset，并断言 CSS 含双列 grid、RNA 全宽、selected/focus-visible 和窄屏单列 selectors。测试只锁定必要契约，不复制整段实现。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test test/stats-dashboard-integration.test.js`

预期：FAIL；旧 main 和 CSS 没有交互 dashboard wiring。

- [ ] **步骤 3：在 main 中接入 bundle 与 filter state**

把 `siteStatsState` 改为显式 idle/loading/ready/error 状态；加载 `loadDashboard()`；增加 `statsDashboardFilters`；在每次 `render()` 后绑定 chart button、chip remove、reset。toggle 后调用 `render({ preserveScroll: true })`。

- [ ] **步骤 4：加入最小响应式 CSS**

复用 `--panel-card-border`、`--panel-card-bg`、`--textAccent`、现有 mustard/olive 色；宽屏两列、RNA 全宽，`max-width: 760px` 单列；按钮有 hover、focus-visible、selected 与 reduced-motion 状态。

- [ ] **步骤 5：运行 wiring contract 与全部聚焦测试**

运行：`npm run test:stats`

预期：全部 PASS。

### 任务 6：构建与浏览器验收

**文件：**
- 验证：`src/assets/generated/site-stats/stats.json`
- 验证：`#stats` 本地页面

- [ ] **步骤 1：重新生成并检查工作树差异**

运行：`npm run build:site-stats`

运行：`git diff --check`

预期：生成文件与派生函数一致；无 whitespace error；不触碰 `public/entry-cases` 等无关数据。

- [ ] **步骤 2：启动当前 Pages 快照**

运行：`python3 -m http.server <空闲端口> --bind 127.0.0.1`

预期：根页面与 `#stats` 可访问。

- [ ] **步骤 3：桌面和窄屏交互验收**

检查六个指标、三个 panels、筛选 summary；依次点击 RNA class、confidence、source，确认 AND summary；移除 chip 和 Reset；确认键盘 focus、`aria-pressed`、窄屏单列和 console 无错误。

- [ ] **步骤 4：完成前复验**

重新运行：`npm run test:stats`

重新运行：`node scripts/build-site-stats.mjs`

预期：测试通过，生成器输出与已提交 JSON 无差异。
