# FoldBridge 首页、Stats 与 Probing 口径联动实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让首页和 Stats 复用 `#probing` 实际展示的 26 个 Probing methods，并把 Stats 收敛为 RNA class 与 Evidence source 两维真正交叉联动的轻量 Dashboard。

**架构：** 在现有 `probingArticleView.js` 中建立无 DOM 的 Probing overview model，使 `#probing` 的卡片与计数来自同一模型；`main.js` 把该模型和已经校验的 Entry Stats bundle 注入首页与 Stats 纯渲染函数。Stats 纯函数新增“排除自身维度”的分面计数，渲染层只消费动态分布和动态分母。

**技术栈：** Node.js ESM、`node:test`、现有 vanilla JavaScript SPA、HTML/CSS。

**工作树：** `/Users/joseperezmartinez/docs/foldbridge/.worktrees/remove-help-sections-main`

**提交边界：** 用户已授权直接实现，但未授权新的 commit 或 push；本计划只修改并验证工作树。

---

## 文件结构

- 修改 `src/probingArticleView.js`：移除对首页常量的反向依赖，新增共享 Probing overview model，并用该模型渲染 `#probing`。
- 修改 `src/statsDashboard.js`：删除公开 confidence filter，新增 RNA class/source 分面计数纯函数。
- 修改 `src/siteChrome.js`：首页、滚动故事和 Stats 改为数据注入；删除旧首页常量、High confidence 与 Chain confidence UI。
- 创建 `src/dashboardViewModel.js`：在可被 Node 安全导入的纯模块中独立组装 Entry/Probing 加载状态和数据。
- 修改 `src/main.js`：首页和 Stats 同时复用 Stats bundle 与 Probing overview model，扩展异步重渲染守卫。
- 修改 `src/styles.css`：两张 Stats 图表使用完整宽度并保持窄屏布局。
- 创建 `test/probing-overview.test.js`：锁定 26 methods / 5 families 与公开文案。
- 创建 `test/home-stats.test.js`：锁定首页新指标和旧口径移除。
- 修改 `test/stats-dashboard.test.js`：锁定两维筛选与排除自身维度的分面计数。
- 修改 `test/stats-page.test.js`：锁定 4 张指标卡、2 张图表和动态分母。
- 修改 `test/stats-dashboard-integration.test.js`：锁定首页/Stats 的加载与注入 wiring。
- 创建 `test/dashboard-view-model.test.js`：锁定 Entry/Probing 两个数据源的独立 ready/error 组合。
- 修改 `package.json`：把新增测试加入 `test:stats`。

---

### 任务 1：建立 `#probing` 单一展示模型

**文件：**
- 修改：`src/probingArticleView.js`
- 创建：`test/probing-overview.test.js`
- 修改：`package.json`

- [ ] **步骤 1：编写失败的 Probing overview 测试**

读取真实 `src/assets/generated/probing-articles/index.json`，调用待新增的 `buildProbingOverviewModel(index)`，断言：

```js
assert.equal(model.methodCount, 26);
assert.equal(model.familyCount, 5);
assert.equal(model.families.flatMap((family) => family.methods).length, 26);
```

渲染 `renderProbingArticleIndex(index)`，断言共有 26 个 `href="#probing?tech=..."`，标题文案包含 `26 probing methods`，且不包含 `26 in-depth explainers`、`26 articles` 或 `Chain confidence`。

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node --test test/probing-overview.test.js
```

预期：FAIL；`buildProbingOverviewModel` 尚未导出，旧文案仍写成 in-depth explainers。

- [ ] **步骤 3：实现最小 Probing overview model**

在 `src/probingArticleView.js`：

1. 删除 `HOME_METRICS` import，解除 `probingArticleView -> siteChrome` 反向依赖。
2. 把现有 5 组策展方法数组映射为按 family id 索引的常量。
3. 导出 `buildProbingOverviewModel(index)`：
   - 仅接受 index 中非 `inference` 的 5 个公开 family。
   - 每个 family 的 methods 使用当前策展数组，并与 index 元数据按 slug 合并。
   - 返回 `{ families, methodCount, familyCount }`。
4. `renderProbingArticleIndex()` 只使用该 model 渲染 family sections、卡片与标题计数。
5. 标题改为类似 `This curated overview presents 26 probing methods...`，不再称 26 为 articles/explainers。

- [ ] **步骤 4：运行测试确认通过**

运行：

```bash
node --test test/probing-overview.test.js
```

预期：PASS。

---

### 任务 2：实现 Stats 两维分面计数

**文件：**
- 修改：`src/statsDashboard.js`
- 修改：`test/stats-dashboard.test.js`

- [ ] **步骤 1：修改测试，先锁定新筛选合同**

把默认 filters 期望改为：

```js
{ rna_class: null, source: null }
```

删除 confidence toggle 测试，改为断言 confidence 是未知筛选维度并显式抛错。保留 entry row 的 `entry_confidence_class` 归一化与契约统计测试，不删除内部 confidence 数据校验。

- [ ] **步骤 2：编写失败的分面计数测试**

新增 `summarizeStatsFacet(rows, filters, dimension)` 测试：

```js
const filters = { rna_class: 'rRNA', source: 'rmdb' };

assert.deepEqual(
  summarizeStatsFacet(ROWS, filters, 'rna_class'),
  {
    total_chains: 2,
    distribution: { rRNA: 2 }
  }
);

assert.deepEqual(
  summarizeStatsFacet(ROWS, filters, 'source'),
  {
    total_chains: 2,
    distribution: { geo: 1, rmdb: 2 }
  }
);
```

测试 fixture 需让两个断言能证明：RNA class facet 应用 source 但排除 rna_class，source facet 应用 rna_class 但排除 source。另测空 context 返回 `{ total_chains: 0, distribution: {} }`。

- [ ] **步骤 3：运行测试确认失败**

运行：

```bash
node --test test/stats-dashboard.test.js
```

预期：FAIL；旧 filters 仍含 confidence，且没有 `summarizeStatsFacet()`。

- [ ] **步骤 4：实现最小两维筛选和 facet 聚合**

在 `src/statsDashboard.js`：

1. `FILTER_DIMENSIONS` 改为 `['rna_class', 'source']`。
2. `emptyStatsFilters()` 只返回两维。
3. `filterStatsRows()` 只应用两维 AND；继续严格验证未知字段。
4. 新增 `summarizeStatsFacet(rows, filters, dimension)`：复制已校验 filters，把自身维度置空后筛选 context rows；RNA class 按 partition 计数，source 按 membership 计数；返回动态分布和 `contextRows.length`。
5. 不修改 `deriveEntryStatsContract()` 的 confidence 验证和内部 `chain_confidence` contract，避免无关 schema 迁移。

- [ ] **步骤 5：运行测试确认通过**

运行：

```bash
node --test test/stats-dashboard.test.js
```

预期：PASS。

---

### 任务 3：首页与 Stats 渲染改为动态注入

**文件：**
- 修改：`src/siteChrome.js`
- 修改：`src/styles.css`
- 创建：`test/home-stats.test.js`
- 修改：`test/stats-page.test.js`

- [ ] **步骤 1：编写失败的首页渲染测试**

使用同一份轻量 view model：

```js
const dashboardView = {
  entryStatus: 'ready',
  entryError: null,
  entryMetrics: {
    rnaChains: 17843,
    pdbStructures: 5321,
    chainsWithProbingProfiles: 14953
  },
  probingStatus: 'ready',
  probingError: null,
  probingOverview: {
    methodCount: 26,
    familyCount: 5
  }
};
```

断言 `renderHomeHero(dashboardView)` 展示 17,843、5,321、26 和对应标签；不包含 `4,664`、`2,386`、`510`、High confidence。断言 `renderHomeModuleCards(dashboardView)` 使用 `5,321` 和 `26 probing methods across 5 mechanism families`。断言 `renderHomeScrollStory(caseData, { dashboardView })` 的 closing 使用 5,321。

另测 `entryStatus` 与 `probingStatus` 的四种 ready/error 组合：任一数据源失败时只把自己负责的数字渲染为明确 unavailable，不遮蔽另一数据源已经成功的数字，也不回退旧数字。

- [ ] **步骤 2：修改 Stats 渲染测试并确认失败**

`renderStatsPage()` 接受 `{ dashboardView, rows, filters }`，其中 `dashboardView` 使用上面的独立 `entryStatus` / `probingStatus`。断言：

- 仅有 RNA chains、PDB structures、Chains with probing profiles、Probing methods 4 张卡。
- 不含 `PDBs with ≥1 high-confidence chain`、Registered technologies、Explainer articles。
- 仅有 `data-stats-panel="rna_class"` 和 `data-stats-panel="source"`。
- 不含 Chain confidence 或 `data-stats-filter-dimension="confidence"`。
- 选择 rRNA 时 source 分布使用 rRNA context 的动态数量和百分比；选择 source 时 RNA class 分布使用 source context。
- context 为空时显示空状态且不产生 `NaN` / `Infinity`。
- 覆盖 Entry ready / error 与 Probing ready / error 四种组合：Entry 失败时图表和 Entry 三张卡显示 unavailable，但成功的 Probing methods 仍显示 26；Probing 失败时只把 Probing methods 显示 unavailable，Entry 卡片和图表继续可用。

运行：

```bash
node --test test/home-stats.test.js test/stats-page.test.js
```

预期：FAIL；首页仍使用常量，Stats 仍展示 6 张卡和 3 张图表。

- [ ] **步骤 3：实现最小首页数据注入**

在 `src/siteChrome.js`：

1. 删除 `HOME_METRICS` 和由它在模块初始化时生成的 `HOME_MODULE_CARDS` 数字。
2. `renderHomeHero(dashboardView)` 分别消费 `entryMetrics.rnaChains`、`entryMetrics.pdbStructures` 与 `probingOverview.methodCount`。
3. `renderHomeModuleCards(dashboardView)` 在调用时组装 Entry/Probing/Search 卡片，并从 `probingOverview.familyCount` 读取机制家族数量。
4. `renderHomeScrollStory()` 从 `opts.dashboardView.entryMetrics.pdbStructures` 读取结构数。
5. renderer 按 `entryStatus` / `probingStatus` 独立输出 loading、ready 或 unavailable；任一失败不清空另一数据源已就绪的值，且不使用旧数值 fallback。

- [ ] **步骤 4：实现最小 Stats 动态渲染**

在 `src/siteChrome.js`：

1. import `summarizeStatsFacet`。
2. 顶部指标只渲染 4 张卡；前三张 Entry 卡片读取 `dashboardView.entryMetrics`，Probing methods 读取 `dashboardView.probingOverview.methodCount`。
3. 删除整页 error 提前返回；两个 status 独立控制自己负责的卡片。仅 Entry 未 ready 时图表区域显示对应 loading/unavailable，页面其余内容和 Probing methods 卡继续渲染。
4. 删除 Chain confidence panel。
5. Entry ready 时 RNA class/source 分别调用 `summarizeStatsFacet()`。
6. `renderStatsBarPanel()` 使用 facet `total_chains` 作为数量、百分比和柱长的共同分母；分母为 0 时显示空状态，禁止 `NaN` / `Infinity`。
7. 两个 panel 都使用 full-width 布局；窄屏继续单列。

- [ ] **步骤 5：运行渲染测试确认通过**

运行：

```bash
node --test test/home-stats.test.js test/stats-page.test.js
```

预期：PASS。

---

### 任务 4：连接 SPA 加载状态和重新渲染

**文件：**
- 创建：`src/dashboardViewModel.js`
- 修改：`src/main.js`
- 创建：`test/dashboard-view-model.test.js`
- 修改：`test/stats-dashboard-integration.test.js`
- 修改：`package.json`

- [ ] **步骤 1：编写失败的 wiring 测试**

先在 `test/dashboard-view-model.test.js` 为待新增的纯 helper `buildDashboardViewModel(siteStatsState, probingArticleIndexState)` 编写真实行为测试，覆盖两边 ready/error 四种组合；断言 helper 不因一边失败清空另一边数据。helper 必须位于不访问 `window` / `document` 的独立 `src/dashboardViewModel.js`，不能从 `main.js` 导出。再用 source contract 测试断言：

- `dashboardViewModel.js` import `buildProbingOverviewModel`，`main.js` 只 import `buildDashboardViewModel`。
- `homePage()` 在 Stats idle 时调用 `loadSiteStats()`。
- `homePage()` 把 Entry metrics 和 Probing overview 注入 `renderHomeHero()`、`renderHomeModuleCards()` 与 `renderHomeScrollStory()`。
- `statsPage()` 在 Probing index 未加载时调用 `loadProbingArticleIndex()`，并把同一 overview 注入 `renderStatsPage()`。
- `loadSiteStats()` 完成后在 route 为 `home` 或 `stats` 时重渲染。
- Stats wiring 中不再出现 confidence filter 值。

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node --test test/dashboard-view-model.test.js test/stats-dashboard-integration.test.js
```

预期：FAIL；纯 helper 尚不存在，且首页尚未加载 Stats bundle、render 调用没有入参。

- [ ] **步骤 3：实现最小 SPA wiring**

在 `src/main.js`：

1. 在 `src/dashboardViewModel.js` import `buildProbingOverviewModel`，导出纯 helper `buildDashboardViewModel(siteStatsState, probingArticleIndexState)`；返回明确的 `entryStatus`、`entryError`、`entryMetrics`、`probingStatus`、`probingError`、`probingOverview`，两边独立组装，loading/error 只令自己的数据为 null，不写数字 fallback。
2. 在 `main.js` import `buildDashboardViewModel`，不从带浏览器副作用的 `main.js` 导出 helper。
3. `homePage()` 同时触发现有 `loadProbingArticleIndex()` 与 `loadSiteStats()`，把数据注入 3 个首页 renderer。
4. `statsPage()` 同时确保 Stats bundle 与 Probing index 已加载，注入同一 dashboard view。
5. `loadSiteStats()` 的 rerender guard 扩为 `route === 'stats' || route === 'home'`。
6. 保留 `loadProbingArticleIndex()` 已覆盖 home/stats/detail/probing 的 guard，并补入 stats。
7. 不新增跨 route filter serialization；Entry 链接继续打开全量 `#entry`。

- [ ] **步骤 4：更新聚焦测试脚本并确认通过**

把 `test/probing-overview.test.js`、`test/home-stats.test.js` 和 `test/dashboard-view-model.test.js` 加入 `npm run test:stats`，然后运行：

```bash
npm run test:stats
```

预期：所有聚焦测试 PASS。

---

### 任务 5：构建、回归与浏览器验收

**文件：**
- 验证：`src/assets/generated/site-stats/stats.json`
- 验证：`#home`、`#probing`、`#stats`

- [ ] **步骤 1：确认 Stats 生成资产没有无关漂移**

运行：

```bash
npm run build:site-stats
git diff -- src/assets/generated/site-stats/stats.json
```

预期：生成成功；现有内部 confidence/registry/article contract 可保留，生成 JSON 无非预期变化。

- [ ] **步骤 2：运行完整测试与静态检查**

运行：

```bash
npm test
node --check src/main.js
git diff --check
```

预期：全部 PASS，无语法或 whitespace 错误。

- [ ] **步骤 3：启动本地静态站点并做浏览器验收**

运行：

```bash
python3 -m http.server <空闲端口> --bind 127.0.0.1
```

检查：

1. `#home`：17,843 / 5,321 / 26；模块卡和滚动故事一致，无旧数字与 High confidence。
2. `#probing`：26 methods / 5 families；DOM 中 26 个唯一 method links；无 Chain confidence。
3. `#stats`：4 张指标卡、2 张图表；无 confidence UI、34 registry 或 37 articles。
4. 点击 RNA class，Evidence source 的数量、百分比和柱长变化。
5. 再点击 Evidence source，RNA class 的数量、百分比和柱长变化。
6. chip 删除和 Reset 恢复；窄屏单列；控制台无错误。

- [ ] **步骤 4：检查最终修改范围**

运行：

```bash
git status --short
git diff --stat
git diff --check
```

预期：仅包含本计划文件、规格文件、相关源文件和测试；不包含 `public/entry-cases` 等无关资产。本计划不 commit、不 push。
