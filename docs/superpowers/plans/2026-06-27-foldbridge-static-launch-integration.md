# FoldBridge 静态站点上线整合 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 FoldBridge 站点从「资源已接入」推进到「可对外上线」——导航收敛为 5 个真实入口、首页用真实数字呈现规模、Help 页变成可用导览、全站搜索覆盖真实内容、无访客可点的死链，`npm test` 与 `npm run build` 全绿。

**架构：** vanilla JS 单页 + hash 路由 + 纯静态部署（GitHub Pages）。`src/main.js`（3030 行、0 export、import 期读 `window.location.hash`、底部跑 `initApp()`）无法在 `node --test` 中 import，因此把导航/首页/Help 三块**纯渲染片段抽到新的可测模块 `src/siteChrome.js`**（镜像已验证的 `src/modules.js` 模式：导出纯函数返回 HTML 字符串），main.js 改为 import 这些纯函数并接回。其余改动落在 Atlas 表模型/视图与搜索语料构建期脚本，都已是可测纯模块。

**技术栈：** ES module（无打包器）、`node --test`（无 jsdom，全部对 HTML 字符串断言）、Pagefind（构建期静态搜索索引）、构建期生成的 `src/assets/generated/**` JSON 资产（只读不改）。

---

## 范围检查

本计划只覆盖单一子系统：**站点 function + UI/UX 上线层**。不碰后端、不碰上游数据生成管线、不重建 Atlas 资产（属数据管线，范围外）。

**⚠️ 资产现实已更新（2026-06-27 核对磁盘）**：`src/assets/generated/annojoin-atlas/index.json` 已是 **combined 主表**，不再是早期的 RMDB-only 1126。实测：`totalCaseCount=3610`、`totalSourceCaseCount=4070`、`displayCases.length=3610`、`cases.length=4070`，displayCases 来源分布 `{RMDB2PDB:666, (blank):460, RASP2PDB:2484}`（commit `bb4cc97` 当天落地）。因此「诚实对齐当前资产」现在意味着首页用 **3610 display rows / 4070 source cases**，所有写死数字以此为准。旧规格 §3 与早期讨论里的「1126 RMDB-only」已过时，本计划以磁盘实测为准。

设计规格：`docs/superpowers/specs/2026-06-27-foldbridge-static-launch-integration-design.md`（本计划逐节对应其 §5.1–§5.7）。

---

## 文件结构

| 文件 | 动作 | 单一职责 |
|---|---|---|
| `src/siteChrome.js` | **创建** | 站点骨架纯渲染函数：`renderPrimaryNav(activeRoute)`、`HOME_METRICS` 常量、`renderHomeHero()`、`renderHomeModuleCards()`、`renderHelpBody()`。全部 PURE（入参→返回字符串），无 `window`/`route`/`mode` 模块级访问。 |
| `test/site-chrome.test.js` | **创建** | siteChrome 各纯函数的字符串断言测试（镜像 `test/modules.test.js` 风格）。 |
| `src/main.js` | **修改** | 接入 siteChrome 导出：`renderBundleHeader()` 用 `renderPrimaryNav`，`homePage()` 用 `renderHomeHero`+`renderHomeModuleCards`，`helpPage()` 用 `renderHelpBody`。修 hero 死链 CTA、search 页占位符。DOM 事件绑定（`data-route` 点击）不动。 |
| `src/annojoinAtlasTableModel.js` | **修改** | `ANNOJOIN_TABLE_COLUMNS` 追加 `pdbCaseDetail` 列定义。`annojoinExportRow` 不动（派生 UI 列不进导出）。 |
| `src/annojoinAtlasView.js` | **修改** | `columnValue()` 加 `pdbCaseDetail` 分支，渲染 `#pdb-case?pdbId=<PDB>` 链接。`<th>`/列选择器/可见性自动从列数组派生，无需改。 |
| `src/search/searchCorpus.js` | **修改** | `buildSearchDocuments()` 删 4 类死链文档（data-type/site/publication/3 条写死 technology），新增 `buildProbingArticleDocs()` 产 27 条探针文章文档；保留 `buildPdbCaseDocs()`。删 `../data.js` 失效 import。 |
| `test/search-corpus.test.js` | **修改** | line 11 `technology` tag 断言会随死链文档移除而失败 → 改为 probing-article 断言 + 死路由不存在断言。保留 pdb-case 既有断言。 |
| `test/annojoin-atlas-table-model.test.js` | **修改** | 加 `pdbCaseDetail` 列存在 + 默认可见断言；确认 `annojoinExportRow` 输出不含该键。 |
| `test/annojoin-atlas.test.js` | **修改** | 加视图渲染断言：atlas HTML 含 `#pdb-case?pdbId=`。 |

**不动清单（护栏）**：`src/search/searchService.js`（Pagefind 查询层）、`scripts/build-search-docs.mjs`（消费 buildSearchDocuments）、`router.js` 的 `ALLOWED_ROUTES`、`pageFor()` 全部分支与 `browsePage/structurePage/downloadPage/publicationsPage/downloadSequencesPage/downloadStructuresPage` 页面函数（导航只删按钮，路由保留，深链不 404）、`subNav()`（main.js:344-425 死代码，勿碰）、`annojoinExportRow`、首页 `homeBundleSites` 切换 pill。

---

## 任务 1：抽取可测站点骨架模块 + 导航收敛（9 → 5）

对应规格 §5.1。建立 `src/siteChrome.js` 这个可测纯模块，先把导航抽出来并从 9 按钮收敛到 5（Home / Entry / Probing / Search / Help）。这是后续任务 2/3/6 的地基。@superpowers:tdd

**背景事实（已核实）：**
- 活跃导航**只在** `renderBundleHeader()`（main.js:1550-1613），markup 在 1599-1609。`subNav()`（main.js:344-425）是死代码，勿碰。
- `isRouteActive`（main.js:1213）= `function isRouteActive(...names) { return names.includes(route); }`，`route` 是模块级变量（import 期由 `routeFromHash(window.location.hash)` 赋值）——这正是 main.js 不可在测试中 import 的原因。抽出的纯导航函数必须接收 `activeRoute` 入参，自己算高亮。
- 现有可测模式参照 `src/modules.js` + `test/modules.test.js`：纯函数返回 HTML 字符串，`node --test` 直接断言。

**文件：**
- 创建：`src/siteChrome.js`
- 创建：`test/site-chrome.test.js`
- 修改：`src/main.js`（renderBundleHeader 内 1599-1609 段）

- [ ] **步骤 1：编写失败的测试**

创建 `test/site-chrome.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPrimaryNav } from '../src/siteChrome.js';

test('primary nav exposes exactly the 5 launch routes', () => {
  const html = renderPrimaryNav('home');
  for (const label of ['Home', 'Entry', 'Probing', 'Search', 'Help']) {
    assert.match(html, new RegExp(`>${label}</button>`), `missing nav button: ${label}`);
  }
  // data-route 仍用 sequence（Entry 只是文案）
  assert.match(html, /data-route="sequence"[^>]*>Entry<\/button>/);
});

test('primary nav drops removed entries', () => {
  const html = renderPrimaryNav('home');
  assert.doesNotMatch(html, />Browse<\/button>/);
  assert.doesNotMatch(html, />Structure<\/button>/);
  assert.doesNotMatch(html, />PDB Cases<\/button>/);
  assert.doesNotMatch(html, />Download<\/button>/);
});

test('primary nav marks the active route', () => {
  const seqHtml = renderPrimaryNav('sequence');
  assert.match(seqHtml, /class="nav-btn active"\s+data-route="sequence"/);
  // download-sequences 也高亮 Entry（保留原 isRouteActive('sequence','download-sequences') 行为）
  const dlHtml = renderPrimaryNav('download-sequences');
  assert.match(dlHtml, /class="nav-btn active"\s+data-route="sequence"/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/site-chrome.test.js`
预期：FAIL，`Cannot find module '.../src/siteChrome.js'`。

- [ ] **步骤 3：创建 `src/siteChrome.js` 并实现 `renderPrimaryNav`**

```js
// 站点骨架纯渲染片段。从 main.js 抽出以便 node --test 可 import 测试。
// 所有函数必须是纯函数：入参 → 返回 HTML 字符串，禁止访问模块级 window/route/mode。
// main.js 负责把这些片段接回并绑定 DOM 事件。

const PRIMARY_NAV_ITEMS = [
  { route: 'home', label: 'Home', activeRoutes: ['home'] },
  { route: 'sequence', label: 'Entry', activeRoutes: ['sequence', 'download-sequences'] },
  { route: 'probing', label: 'Probing', activeRoutes: ['probing', 'detail'] },
  { route: 'search', label: 'Search', activeRoutes: ['search'] },
  { route: 'help', label: 'Help', activeRoutes: ['help'] }
];

export function renderPrimaryNav(activeRoute = 'home') {
  const buttons = PRIMARY_NAV_ITEMS.map((item) => {
    const isActive = item.activeRoutes.includes(activeRoute);
    return `<button type="button" class="nav-btn${isActive ? ' active' : ''}" data-route="${item.route}">${item.label}</button>`;
  }).join('\n          ');
  return `<nav class="bundle-home-route-nav" aria-label="Primary navigation">
          ${buttons}
        </nav>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/site-chrome.test.js`
预期：PASS（3 个用例）。

- [ ] **步骤 5：接回 main.js**

把 main.js 顶部 import 区加上（与现有 `import { renderVisualizationShowcase } from './modules.js';` 同风格）：

```js
import { renderPrimaryNav } from './siteChrome.js';
```

把 `renderBundleHeader()` 内 1599-1609 整段 `<nav>...</nav>` 替换为：

```js
        ${renderPrimaryNav(route)}
```

（`route` 是 renderBundleHeader 可见的模块级变量，调用时传入即可——纯函数不依赖它，只是取值。）

- [ ] **步骤 6：回归 + Commit**

运行：`npm test`
预期：全绿（含新的 site-chrome 用例；其余既有用例不受影响——main.js 未被任何测试 import）。

```bash
git add src/siteChrome.js test/site-chrome.test.js src/main.js
git commit -m "feat(nav): extract testable siteChrome + collapse nav 9->5 (Home/Entry/Probing/Search/Help)"
```

---

## 任务 2：首页 Hero 真实指标 + 修复死链 CTA

对应规格 §5.2。把 hero 的 `xx` 占位指标换成 3 个真实数字，并把两个指向死路由的 CTA 改到真实模块。@superpowers:tdd

**背景事实（已核实）：**
- `homePage()` 在 main.js:1459-1548。hero metrics 占位块在 1517-1543（`species 22/xx`、`sequences xx`、`structures xx`、`technology 27/xx`、`Release 0.1 — 4 aligned database entrances`）。
- hero CTA 死链在 main.js:1512-1513：`data-route="download-sequences"`（"Browse FoldBridge"）+ `data-route="structure"`（"Open structure hub"）。
- 真实数字（磁盘核对 2026-06-27）：`annojoin-atlas/index.json` `totalCaseCount=3610`（displayCases，combined 主表）、`totalSourceCaseCount=4070`（cases，含 RMDB2PDB+RASP2PDB 来源）；`probing-articles/index.json` `article_count=27`、`family_count=6`。
- 数字写死为模块顶部常量（规格 §5.2），不在运行时 fetch 34MB Atlas index。

**文件：**
- 修改：`src/siteChrome.js`（加 `HOME_METRICS` + `renderHomeHero`）
- 修改：`test/site-chrome.test.js`
- 修改：`src/main.js`（homePage 1501-1544 hero 区 + CTA 1512-1513）

- [ ] **步骤 1：追加失败的测试**

在 `test/site-chrome.test.js` 末尾追加：

```js
import { renderHomeHero, HOME_METRICS } from '../src/siteChrome.js';

test('home hero shows real metrics, no placeholders', () => {
  const html = renderHomeHero();
  assert.match(html, /3,610/);              // structure-linked display rows (combined)
  assert.match(html, /4,070/);              // source cases (combined)
  assert.match(html, />27</);               // probing articles
  assert.match(html, />6</);                // mechanism families
  assert.doesNotMatch(html, /\bxx\b/);      // 无占位
  assert.doesNotMatch(html, /Release 0\.1/);
});

test('home hero CTAs target live routes', () => {
  const html = renderHomeHero();
  assert.match(html, /data-route="sequence"/);
  assert.match(html, /data-route="probing"/);
  assert.doesNotMatch(html, /data-route="download-sequences"/);
  assert.doesNotMatch(html, /data-route="structure"/);
});

test('HOME_METRICS carries the launch numbers', () => {
  assert.equal(HOME_METRICS.structureLinkedRecords, 3610);
  assert.equal(HOME_METRICS.sourceCases, 4070);
  assert.equal(HOME_METRICS.probingArticles, 27);
  assert.equal(HOME_METRICS.mechanismFamilies, 6);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/site-chrome.test.js`
预期：FAIL，`renderHomeHero`/`HOME_METRICS` 未导出。

- [ ] **步骤 3：在 `src/siteChrome.js` 实现**

```js
// 首页指标（写死，集中一处便于一处更新）。来源（磁盘核对 2026-06-27）：
//   structureLinkedRecords = annojoin-atlas/index.json totalCaseCount(3610, = displayCases 行数)
//   sourceCases            = annojoin-atlas/index.json totalSourceCaseCount(4070, = cases 行数)
//   probingArticles/mechanismFamilies = probing-articles/index.json article_count(27)/family_count(6)
// Atlas 资产再变化时，只改这里的数字（与 Atlas index 顶层字段对齐）。
export const HOME_METRICS = {
  structureLinkedRecords: 3610,
  sourceCases: 4070,
  probingArticles: 27,
  mechanismFamilies: 6
};

export function renderHomeHero(metrics = HOME_METRICS) {
  const records = metrics.structureLinkedRecords.toLocaleString('en-US');
  const sources = metrics.sourceCases.toLocaleString('en-US');
  return `<section class="bundle-hero-card bundle-wide-card">
        <div class="bundle-hero-copy">
          <p class="bundle-kicker">RNA structure-linked database</p>
          <h2>FoldBridge Database Portal</h2>
          <p class="bundle-hero-summary">
            FoldBridge is a curated database that links RNA chemical probing data with experimentally resolved tertiary structures.
          </p>
          <p class="bundle-hero-detail">
            By matching probing-derived RNA sequences to corresponding sequences in PDB entries, FoldBridge identifies high-confidence structure-linked records and integrates their secondary- and tertiary-structure information.
          </p>
          <div class="bundle-hero-actions">
            <button type="button" class="bundle-hero-primary" data-route="sequence">Browse Entry table &rarr;</button>
            <button type="button" class="ghost" data-route="probing">Explore probing methods</button>
          </div>
        </div>

        <aside class="bundle-hero-metrics">
          <article class="bundle-metric-card bundle-metric-large">
            <p>structure-linked records</p>
            <strong>${records}</strong>
            <span>PDB entries in the current build, from ${sources} source cases</span>
          </article>
          <article class="bundle-metric-card">
            <p>probing articles</p>
            <strong>${metrics.probingArticles}</strong>
            <span>across ${metrics.mechanismFamilies} mechanism families</span>
          </article>
          <article class="bundle-metric-card">
            <p>mechanism families</p>
            <strong>${metrics.mechanismFamilies}</strong>
            <span>chemical &amp; enzymatic probing groups</span>
          </article>
        </aside>
      </section>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/site-chrome.test.js`
预期：PASS。

- [ ] **步骤 5：接回 main.js**

更新 import：

```js
import { renderPrimaryNav, renderHomeHero } from './siteChrome.js';
```

把 `homePage()` 内 1501-1544 的 `<section class="bundle-hero-card ...">...</section>` 整段替换为 `${renderHomeHero()}`。同时删除 homePage 里已不再使用的占位逻辑（注意：`cards` 变量 main.js:1474-1494 已是未插入输出的死变量——本任务可暂留，任务 3 会用它的位置插引导卡；若任务 3 改写引导卡则一并清理）。

- [ ] **步骤 6：回归 + Commit**

运行：`npm test`
预期：全绿。

```bash
git add src/siteChrome.js test/site-chrome.test.js src/main.js
git commit -m "feat(home): real hero metrics (3610/4070/27/6) + fix dead-link CTAs"
```

---

## 任务 3：首页三模块引导卡

对应规格 §5.3。Hero 下方新增一行三张卡片（Entry table / Probing methods / Search），复用现有 `bundle-site-card` 视觉类，把首页变成通往三大模块的入口。@superpowers:tdd

**背景事实（已核实）：**
- `homePage()` 返回的 `<main>` 结构：`bundle-home-shell` → `${bundleHeader}` → hero `<section>`。三卡插在 hero 之后、shell 结束之前。
- 现有卡片视觉类来自 `homeBundleSites`→`bundle-site-card`（main.js:1474-1494，那段 `cards` 变量未被插入输出，是死变量）。本任务新建语义化引导卡，不复用那段外站切换卡。

**文件：**
- 修改：`src/siteChrome.js`（加 `renderHomeModuleCards`）
- 修改：`test/site-chrome.test.js`
- 修改：`src/main.js`（homePage 返回结构 + 清理死 `cards` 变量）

- [ ] **步骤 1：追加失败的测试**

在 `test/site-chrome.test.js` 末尾追加：

```js
import { renderHomeModuleCards } from '../src/siteChrome.js';

test('home module cards link to the three core modules', () => {
  const html = renderHomeModuleCards();
  assert.match(html, /data-route="sequence"/);
  assert.match(html, /data-route="probing"/);
  assert.match(html, /data-route="search"/);
  assert.match(html, /Entry table/);
  assert.match(html, /Probing methods/);
  assert.match(html, />Search</);
  // 卡片计数：三张 bundle-site-card
  assert.equal((html.match(/bundle-site-card/g) || []).length, 3);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/site-chrome.test.js`
预期：FAIL，`renderHomeModuleCards` 未导出。

- [ ] **步骤 3：在 `src/siteChrome.js` 实现**

```js
const HOME_MODULE_CARDS = [
  {
    route: 'sequence',
    kicker: 'master table',
    title: 'Entry table',
    summary: `${HOME_METRICS.structureLinkedRecords.toLocaleString('en-US')} structure-linked PDB entries with search, grouping and export.`,
    action: 'Open Entry table'
  },
  {
    route: 'probing',
    kicker: 'science library',
    title: 'Probing methods',
    summary: `${HOME_METRICS.probingArticles} explainer articles across ${HOME_METRICS.mechanismFamilies} mechanism families.`,
    action: 'Explore probing methods'
  },
  {
    route: 'search',
    kicker: 'site-wide',
    title: 'Search',
    summary: 'Search probing articles and PDB cases across the whole site.',
    action: 'Open search'
  }
];

export function renderHomeModuleCards(cards = HOME_MODULE_CARDS) {
  const items = cards.map((card, index) => `
    <article class="bundle-site-card tone-${(index % 3) + 1}">
      <div class="bundle-site-copy">
        <p class="bundle-site-kicker">${card.kicker}</p>
        <h3>${card.title}</h3>
        <p>${card.summary}</p>
      </div>
      <div class="bundle-site-footer">
        <button type="button" class="bundle-site-link" data-route="${card.route}">${card.action}</button>
      </div>
    </article>`).join('');
  return `<section class="bundle-home-modules" aria-label="Core modules">${items}
  </section>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/site-chrome.test.js`
预期：PASS。

- [ ] **步骤 5：接回 main.js**

更新 import：

```js
import { renderPrimaryNav, renderHomeHero, renderHomeModuleCards } from './siteChrome.js';
```

把 `homePage()` 返回结构改为在 hero 之后插入引导卡：

```js
  return `<main class="page-home bundle-home-page">
    <section class="bundle-home-shell">
      ${bundleHeader}
      ${renderHomeHero()}
      ${renderHomeModuleCards()}
    </section>
  </main>`;
```

同时删除 homePage 顶部已不再使用的死变量 `cards`（main.js:1474-1494）与 `featuredNames`（若仅服务于已删的 hero/cards；注意 `bundleHeader` 仍需保留——它调用 `renderBundleHeader(featuredNames)`，确认 featuredNames 是否仍被 bundleHeader 使用，若是则保留）。

- [ ] **步骤 6：回归 + Commit**

运行：`npm test`
预期：全绿。

```bash
git add src/siteChrome.js test/site-chrome.test.js src/main.js
git commit -m "feat(home): three core-module guidance cards"
```

---

## 任务 4：Entry 表新增「PDB case」入口列

对应规格 §5.4。在 Atlas 总表追加单列，每行给出指向 `#pdb-case?pdbId=<PDB>` 的入口链接。本阶段不做详情页（点进 404 可接受）、不进导出。@superpowers:tdd

**背景事实（已核实）：**
- `src/annojoinAtlasTableModel.js` `ANNOJOIN_TABLE_COLUMNS`（行 3-10）= 6 个 `{id,label,defaultVisible}`。`COLUMN_IDS`/`normalizeVisibleAnnojointColumnIds`/`defaultVisibleAnnojointColumnIds` 都从该数组派生（追加列自动覆盖）。`annojoinExportRow(row)` 手列源字段、不读列定义 → 新 UI 列不会进导出（符合规格）。
- `src/annojoinAtlasView.js` `columnValue(row, columnId, routeName)`（行 109）返回 `values` 对象，fallback `values[columnId] ?? escapeHtml(row[columnId] || '')`。`escapeHtml` 在行 18，`rowCaseId` 在行 10 import。`<th>`/列选择器（renderColumnPicker 行 122）/可见列（行 452）全自动派生。行渲染 renderCaseRow 行 151：`<td>${columnValue(row, column.id, routeName)}</td>`。
- 视图测试 `test/annojoin-atlas.test.js` 用 `renderAnnojointAtlasPage({state, ...})`（行 319-668 多例）。模型测试 `test/annojoin-atlas-table-model.test.js`（列断言行 59-68，export 行 103/119）。

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`（行 3-10 列数组）
- 修改：`src/annojoinAtlasView.js`（columnValue 行 109-119）
- 修改：`test/annojoin-atlas-table-model.test.js`
- 修改：`test/annojoin-atlas.test.js`

- [ ] **步骤 1：追加失败的测试（模型）**

在 `test/annojoin-atlas-table-model.test.js` 适当 test 内追加：

```js
test('table columns expose a default-visible PDB case entry column', () => {
  const col = ANNOJOIN_TABLE_COLUMNS.find((c) => c.id === 'pdbCaseDetail');
  assert.ok(col, 'pdbCaseDetail column missing');
  assert.equal(col.defaultVisible, true);
  assert.equal(col.label, 'PDB case');
});

test('export row never contains the derived UI column', () => {
  const exported = annojoinExportRow({ pdbId: '9ELY', chains: ['A'] });
  assert.equal('pdbCaseDetail' in exported, false);
});
```

- [ ] **步骤 2：追加失败的测试（视图）**

在 `test/annojoin-atlas.test.js` 追加（参照现有 `renderAnnojointAtlasPage` 调用风格，用已有 fixture state 或最小 state）：

```js
test('atlas table renders a PDB case detail link per row', () => {
  const state = { cases: [{ pdbId: '9ELY', caseId: '9ELY', chains: ['A'], profileCount: 1 }], totalCaseCount: 1, filters: {} };
  const html = renderAnnojointAtlasPage({ state, routeName: 'sequence' });
  assert.match(html, /href="#pdb-case\?pdbId=9ELY"/);
});
```

- [ ] **步骤 3：运行测试验证失败**

运行：`node --test test/annojoin-atlas-table-model.test.js test/annojoin-atlas.test.js`
预期：FAIL（列不存在 / HTML 无 `#pdb-case?pdbId=9ELY`）。

- [ ] **步骤 4：实现列定义**

`src/annojoinAtlasTableModel.js` 的 `ANNOJOIN_TABLE_COLUMNS` 数组末尾追加：

```js
  { id: 'pdbCaseDetail', label: 'PDB case', defaultVisible: true }
```

- [ ] **步骤 5：实现 columnValue 分支**

`src/annojoinAtlasView.js` 的 `columnValue` 内 `values` 对象追加一项（用已有 `escapeHtml` + `rowCaseId`）：

```js
    pdbCaseDetail: `<a class="annojoin-pdb-case-link" href="#pdb-case?pdbId=${escapeHtml(row.pdbId || rowCaseId(row))}">PDB case</a>`,
```

- [ ] **步骤 6：运行测试验证通过**

运行：`node --test test/annojoin-atlas-table-model.test.js test/annojoin-atlas.test.js`
预期：PASS。

- [ ] **步骤 7：回归 + Commit**

运行：`npm test`
预期：全绿。

```bash
git add src/annojoinAtlasTableModel.js src/annojoinAtlasView.js test/annojoin-atlas-table-model.test.js test/annojoin-atlas.test.js
git commit -m "feat(atlas): add PDB case entry column (link only, not exported)"
```

---

## 任务 5：Search 语料重做（覆盖真实内容 + 清死路由）

对应规格 §5.5。`buildSearchDocuments()` 删 4 类死链/占位文档，新增 27 条探针文章文档；保留真实 PDB case 文档。同步修被破坏的语料测试与 search 页占位符。@superpowers:tdd

**背景事实（已核实）：**
- `src/search/searchCorpus.js` `buildSearchDocuments()`（行 80）现返回 `[...pdbDocs, ...dataTypeDocs, ...siteDocs, ...publicationDocs, ...technologyDocs]`。
  - `buildPdbCaseDocs()`（行 37）真实、保留：有 try/catch→[] 降级，href=`row.detailHref`，核查值即 `#pdb-case?pdbId=<ID>`（9ELY→`#pdb-case?pdbId=9ELY`）。
  - `dataTypeDocs`（→`#browse`）、`siteDocs`（→`#home`）、`publicationDocs`（→`#publications`）、`technologyDocs`（3 条写死 →`#detail?tech=shape/dms-seq/pars`）：**全删**。
  - 删后 `../data.js` 的 `dataTypeCards, recentPublications, siteSummaries`（import 行 2-6）失效，一并删 import。
- 探针文章 index：`src/assets/generated/probing-articles/index.json`，`article_count=27`。顶层 `articles[]`（27 条）键 `[slug,title,date,summary,...]` 无 family 字段；family 经 `families[]`（6 个，id：`dms,shape,in-cell-shape,footprinting,carbodiimide-special,inference`，各含 `articles[].slug`）解析。`#detail?tech=<slug>` 是探针阅读页现有路由（`detailPage()` 按 `?tech=` 解析）。
- **测试破坏点**：`test/search-corpus.test.js:11` `assert.ok(docs.some((doc) => doc.tags.includes('technology')));` 在删 technologyDocs 后必失败，本任务必须改。
- **占位符**：searchPage 占位符串 `"Search sequence, PDB ID, method, profile, DOI..."`（约 main.js:2384）→ `"Search probing methods, PDB ID, molecule name..."`。**注意**另有 header 全局搜索框占位 `"Search FoldBridge"`（main.js:1590），勿改。编辑前先 grep 精确串定位。
- `searchService.js`（Pagefind 查询层）、`scripts/build-search-docs.mjs` 不动。

**文件：**
- 修改：`src/search/searchCorpus.js`
- 修改：`test/search-corpus.test.js`
- 修改：`src/main.js`（searchPage 占位符）

- [ ] **步骤 1：改写语料测试（先让它表达新契约 → 失败）**

把 `test/search-corpus.test.js` 第一个 test 改为：

```js
test('search corpus exposes probing-article and pdb-case docs, no dead routes', () => {
  const docs = buildSearchDocuments();

  assert.ok(docs.length >= 8);
  assert.ok(docs.every((doc) => doc.id && doc.title && doc.href && doc.type));

  // PDB case 文档保留
  assert.ok(docs.some((doc) => doc.type === 'pdb-case' && doc.href === '#pdb-case?pdbId=9ELY'));

  // 探针文章文档新增（27 条），href 指向探针阅读页
  const articles = docs.filter((doc) => doc.type === 'probing-article');
  assert.equal(articles.length, 27);
  assert.ok(articles.every((doc) => doc.href.startsWith('#detail?tech=')));

  // 不再索引死路由
  assert.ok(!docs.some((doc) => ['#browse', '#home', '#publications'].includes(doc.href)));
  assert.ok(!docs.some((doc) => doc.type === 'technology'));
});
```

（第二个 test —— `renderSearchDocumentHtml` + `pdb-case-9ely` + `raiA RNA motif` —— 保持不动，pdbDocs 未变。）

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/search-corpus.test.js`
预期：FAIL（无 probing-article 文档 / 仍有 technology 文档）。

- [ ] **步骤 3：实现 `buildProbingArticleDocs` 并重写 `buildSearchDocuments`**

`src/search/searchCorpus.js`：删 `../data.js` import 行（行 2-6）。在文件加探针文章 base + 构建函数：

```js
const PROBING_ARTICLES_BASE = new URL('../assets/generated/probing-articles/', import.meta.url);

function readProbingArticlesIndex() {
  return JSON.parse(readFileSync(new URL('index.json', PROBING_ARTICLES_BASE), 'utf8'));
}

// 探针科普文章语料（27 篇）。源 index 缺失时静默降级为空集（沿用 buildPdbCaseDocs 模式）。
function buildProbingArticleDocs() {
  let index;
  try {
    index = readProbingArticlesIndex();
  } catch {
    return [];
  }
  // slug → familyId / familyTitle
  const slugToFamily = {};
  for (const family of index.families || []) {
    for (const art of family.articles || []) {
      slugToFamily[art.slug] = { id: family.id, title: family.title };
    }
  }
  return (index.articles || []).map((art) => {
    const fam = slugToFamily[art.slug] || { id: 'probing', title: '' };
    return {
      id: `probing-article-${art.slug}`,
      type: 'probing-article',
      title: art.title,
      href: `#detail?tech=${art.slug}`,
      tags: ['probing', fam.id].filter(Boolean),
      summary: art.summary || '',
      content: [art.title, art.summary, fam.title].filter(Boolean).join(' ')
    };
  });
}

export function buildSearchDocuments() {
  return [...buildPdbCaseDocs(), ...buildProbingArticleDocs()];
}
```

删除旧的 `dataTypeDocs`/`siteDocs`/`publicationDocs`/`technologyDocs` 定义块。`renderSearchDocumentHtml`（行 146）不动。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/search-corpus.test.js`
预期：PASS（两个用例）。

- [ ] **步骤 5：改 search 页占位符**

先定位：`grep -n "Search sequence, PDB ID" src/main.js`，确认是 searchPage 内（非 header）。把该串改为 `Search probing methods, PDB ID, molecule name...`。

- [ ] **步骤 6：回归 + 构建验证 + Commit**

运行：`npm test`
预期：全绿。

运行：`npm run build:search-docs`
预期：rc=0，`dist/search-docs/` 下含 `probing-article-*.html` 与 `pdb-case-*.html`、`manifest.json`（需先有 `dist/`，若无先 `npm run build:static`）。

```bash
git add src/search/searchCorpus.js test/search-corpus.test.js src/main.js
git commit -m "feat(search): rebuild corpus over 27 probing articles + PDB cases, drop dead-route docs"
```

---

## 任务 6：Help 页重做（实用导览页）

对应规格 §5.6。`helpPage()` 从 2 句占位重做为四区块导览。把内容抽成 `renderHelpBody()` 纯函数，main.js 的 helpPage 用 `renderBundleHeader()` 包壳。@superpowers:tdd

**背景事实（已核实）：**
- `helpPage()` 在 main.js:2448-2457，现为 2 句占位，提到 Browse/Sequence/Structure/Probing/Download/Search/Help。重做后**不得**出现 Browse/Structure/Download。
- 四区块（规格 §5.6）：①站点是什么 ②模块导览（链 `#sequence`/`#probing`/`#search`）③关键术语 `<dl>`（source case vs display row、RMDB vs RASP（RASP `positive_confidence_active_now=false`→「not active」）、Confidence A/B/C、Conflicts）④数据来源与引用（不编造引用）。

**文件：**
- 修改：`src/siteChrome.js`（加 `renderHelpBody`）
- 修改：`test/site-chrome.test.js`
- 修改：`src/main.js`（helpPage 2448-2457）

- [ ] **步骤 1：追加失败的测试**

在 `test/site-chrome.test.js` 末尾追加：

```js
import { renderHelpBody } from '../src/siteChrome.js';

test('help body has four sections and live module links', () => {
  const html = renderHelpBody();
  assert.match(html, /What is FoldBridge/i);
  assert.match(html, /href="#sequence"/);
  assert.match(html, /href="#probing"/);
  assert.match(html, /href="#search"/);
  // 关键术语
  assert.match(html, /source case/i);
  assert.match(html, /not active/i);   // RASP positive_confidence_active_now=false
  // 不暴露已下线导航
  assert.doesNotMatch(html, /Browse/);
  assert.doesNotMatch(html, /Structure hub|Open structure/i);
  assert.doesNotMatch(html, /Download/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/site-chrome.test.js`
预期：FAIL，`renderHelpBody` 未导出。

- [ ] **步骤 3：在 `src/siteChrome.js` 实现**

```js
export function renderHelpBody() {
  return `<section class="card bundle-wide-card">
      <h1>Help &amp; guide</h1>

      <h2>What is FoldBridge</h2>
      <p>FoldBridge links RNA chemical probing data with experimentally resolved tertiary structures. It matches probing-derived RNA sequences to PDB entries, identifies high-confidence structure-linked records, and integrates their secondary- and tertiary-structure information.</p>

      <h2>Modules</h2>
      <ul>
        <li><a href="#sequence">Entry table</a> — the master browser table; search, group and export structure-linked PDB entries. Merged rows keep links back to their source cases.</li>
        <li>PDB case — a per-PDB detail entry, opened from the <em>PDB case</em> column inside the Entry table.</li>
        <li><a href="#probing">Probing methods</a> — ${HOME_METRICS.probingArticles} explainer articles across ${HOME_METRICS.mechanismFamilies} mechanism families.</li>
        <li><a href="#search">Search</a> — site-wide search across probing articles and PDB cases.</li>
      </ul>

      <h2>Key terms</h2>
      <dl>
        <dt>source case vs display row</dt>
        <dd>Source cases are merged into one display row per PDB; RMDB/RASP sources of the same PDB are summarized but keep their source links.</dd>
        <dt>RMDB vs RASP</dt>
        <dd>Two source families. RASP is currently <code>positive_confidence_active_now=false</code> and shown as <strong>not active</strong> — do not read it as an activated positive confidence.</dd>
        <dt>Confidence (A/B/C)</dt>
        <dd>A case-level distribution summary, not a best-profile score. C is an exploratory hint and should be re-checked against route assets.</dd>
        <dt>Conflicts</dt>
        <dd>Flags annotation/evidence conflict candidates that need review.</dd>
      </dl>

      <h2>Data sources</h2>
      <p>Data come from RMDB / RASP / PDB; structure linkage is materialized through the ANNOJOIN master table. Where citation metadata is not provided in the current asset, fields are left unannotated rather than fabricated.</p>
    </section>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/site-chrome.test.js`
预期：PASS。

- [ ] **步骤 5：接回 main.js**

更新 import：

```js
import { renderPrimaryNav, renderHomeHero, renderHomeModuleCards, renderHelpBody } from './siteChrome.js';
```

把 `helpPage()` 改为：

```js
function helpPage() {
  return `<main class="page-help">
    ${renderBundleHeader()}
    ${renderHelpBody()}
  </main>`;
}
```

- [ ] **步骤 6：回归 + Commit**

运行：`npm test`
预期：全绿。

```bash
git add src/siteChrome.js test/site-chrome.test.js src/main.js
git commit -m "feat(help): rebuild Help into a four-section guide"
```

---

## 任务 7：全量回归 + 构建验证（上线门槛）

对应规格 §8。确认 `npm test` 全绿、`npm run build` 完整通过（含 pagefind 索引生成），无残留死链。@superpowers:verification-before-completion

**文件：** 无新增（纯验证；若发现遗漏死链回到对应任务修）。

- [ ] **步骤 1：全量测试**

运行：`npm test`
预期：全绿，新增 site-chrome 用例与改写的 search-corpus / atlas 用例全过，无回归。

- [ ] **步骤 2：完整构建**

运行：`npm run build`
预期：rc=0。`build:static`→`dist/` 有 index.html+src/；`build:search-docs`→`dist/search-docs/` 含 27 个 `probing-article-*.html`；`build:search-index`→pagefind 扫 `dist/` 生成 `dist/pagefind/`。

- [ ] **步骤 3：死链终检**

运行：`grep -rn "data-route=\"download-sequences\"\|data-route=\"structure\"" src/main.js`
预期残留（均非死链，不处理）：`subNav()` 死代码内（约 main.js:385）、`downloadPage` 内部按钮（约 main.js:2355，规格 §5.7 保留）。**只需确认 hero CTA（原 1512-1513）已无匹配**——任务 2 已把它们改成 `sequence`/`probing`。
运行：`grep -rn "#browse\|#home\b\|#publications" src/search/searchCorpus.js`，预期无匹配。

- [ ] **步骤 4：Commit（如终检有微调）**

```bash
git add -A
git commit -m "chore(launch): full test + build green, dead-link sweep"
```

---

## 维护与替换注记（Atlas 资产再变化时）

combined 主表已是当前磁盘资产（3610/4070），本计划已对齐。日后 Atlas 资产数字再变化时（数字写死处集中在 `src/siteChrome.js` 顶部 `HOME_METRICS`，一处更新）：

1. `HOME_METRICS.structureLinkedRecords` ← Atlas index 顶层 `totalCaseCount`（= displayCases 行数）。
2. `HOME_METRICS.sourceCases` ← Atlas index 顶层 `totalSourceCaseCount`（= cases 行数）。
3. 首页引导卡 `HOME_MODULE_CARDS` 的 Entry table 描述数字随 `HOME_METRICS` 自动更新（已用插值）。
4. Help 页 Entry 区若引用行数同理自动更新（已用插值）。
5. **Entry 表「PDB case」列与 Search 语料无需改动**——按 `pdbId` 派生，自动适配新资产。

`probingArticles`/`mechanismFamilies` 仅在探针文章资产变化时更新（来源 `probing-articles/index.json` 的 `article_count`/`family_count`）。

