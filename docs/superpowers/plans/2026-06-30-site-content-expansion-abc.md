# FoldBridge 站点内容扩充（ABC 三模块）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 给 FoldBridge 静态站新增 About（`#about`）+ Stats（`#stats`）两个内容页，并把现有 Probing 路由升级为科普中心（家族索引 + 34 技术对比表 + 术语表），让站点内容更厚、更成熟。

**架构：** 沿用站点既有"纯渲染函数（`siteChrome.js`）+ 数据资产 + `main.js` 接路由 + `node --test`"模式，无框架/无打包器/无图表库（内联 SVG）。先做一个"骨架 commit"铺好共享文件接缝（路由/导航/CSS 锚点），再分 3 条独立赛道（A/B/C）并行填充。数字口径单一来源：抽 `filterVisibleCases` 纯函数，Entry 表与 Stats build 共用，对外 PDB 数恒等于 Entry 可见口径（当前 2386）。

**技术栈：** vanilla ES modules、`node:test`/`assert`、内联 SVG、相对路径 fetch store（镜像 `probingArticleStore.js`）。基线分支 `release-public`（worktree `~/docs/foldbridge-release`）。

**规格：** `docs/superpowers/specs/2026-06-30-site-content-expansion-abc-design.md`

---

## 文件结构

### 共享/骨架（任务 1 由主控统一改，避免并行冲突）
- 修改 `src/router.js`：`ALLOWED_ROUTES` 加 `about`、`stats`。
- 修改 `src/siteChrome.js`：`PRIMARY_NAV_ITEMS` 改为 Home/Entry/Probing/Stats/About/Search（移除独立 Help）；文件末尾加三段命名锚点注释。
- 修改 `src/main.js`：`routes` 数组加 `about`/`stats`；分派处加 `about`/`stats` 路由（先空壳）；保留 help→重定向 about。
- 修改 `src/styles.css`：末尾加三段命名锚点 `/* === ABOUT PAGE === */`、`/* === STATS PAGE === */`、`/* === PROBING HUB === */`。
- 修改 `test/site-chrome.test.js`：更新 nav 断言（5→Stats/About）。

### 模块 A · About（赛道 W-A）
- 创建 `src/assets/data/about-content.json`：策展章节数据（纯文本 body）。
- 创建 `src/aboutContentStore.js`：浏览器加载层（镜像 probingArticleStore）。
- 修改 `src/siteChrome.js`：ABOUT 锚点区加 `renderAboutPage(content)`。
- 修改 `src/main.js`：`aboutPage()` 接 store + 懒加载 + re-render 守卫。
- 修改 `src/styles.css`：ABOUT 锚点区样式。
- 创建 `test/about-page.test.js`。

### 模块 B · Stats（赛道 W-B）
- 创建 `src/lib/entryVisibility.js`：共享纯函数 `isEntryVisible`/`filterVisibleCases`（§2.2 单一来源）。
- 创建 `scripts/build-site-stats.mjs`：构建期派生 `stats.json`。
- 创建 `src/assets/generated/site-stats/stats.json`：build 产物（入 git）。
- 创建 `src/siteStatsStore.js`：浏览器加载层。
- 修改 `src/siteChrome.js`：STATS 锚点区加 `renderStatsPage(stats)`。
- 修改 `src/main.js`：`statsPage()` 接 store + 懒加载。
- 修改 `src/styles.css`：STATS 锚点区样式（含内联 SVG 图表样式）。
- 创建 `test/site-stats-build.test.js`、`test/stats-page.test.js`。

### 模块 C · Probing 升级（赛道 W-C）
- 创建 `src/assets/data/probe-technology-registry.json`：34 技术精简表（从 rmdb2pdb 仓 TSV 提取）。
- 修改 `src/siteChrome.js`：PROBING HUB 锚点区加 `renderProbingFamilyIndex`/`renderProbingTechTable`/`renderProbingGlossary`。
- 修改 `src/main.js`：`renderProbingArticleIndex` 组装处插入三块 + 加载注册表。
- 修改 `src/styles.css`：PROBING HUB 锚点区样式。
- 创建 `test/probing-hub.test.js`。

---

## 任务 0：发现（不写生产代码，产出发现笔记）

**目的：** 锁定规格 §6.3 的三个未知，让 W-A/B/C 能无猜测推进。

- [ ] **步骤 1：定位 Entry 可见性过滤逻辑**

在 `~/docs/foldbridge-release` 查 Entry 表把 3401 收窄到 2386 的过滤判据：
```
grep -n "filter\|isVisible\|hidden\|notActive\|not active\|displayCases" src/annojoinAtlasData.js src/annojoinAtlasView.js src/annojoinAtlasTableModel.js
```
读相关函数，记录：判据字段（如某 confidence/route 状态）、过滤发生在哪一层（data 层 vs view 层）。这是任务 6（`entryVisibility.js`）的依据。

**顺带核实原始数到底是多少**：`siteChrome.js` 的 `HOME_METRICS.structureLinkedRecords` 现为 3610（注释称 = displayCases 行数），而规格/本计划多处称原始数 3401。两者出入需在此查清——读 `src/assets/generated/annojoin-atlas/index.json` 的 `displayCases.length` / `totalCaseCount` 实际值，记录真实原始数（供 stats 脚注「total_raw」用）。**注意：任务 7 的硬锚断言是可见口径 `=== 2386`，不依赖原始数**，所以此出入不阻塞实现，但脚注与 about-content 措辞要写对真实来源数，别照抄 3401/3610 中的错值。

- [ ] **步骤 2：核实校准表可读性 + 真实数字来源**

确认本机可读（决定 build 走真实派生还是 §4.2 回退常量）：
```
ls -la /Volumes/tianyi/foldbridgeAssessert/confidence注册表/RMDB_ABC_LSS/cal/abc_lss_calibrated.tsv
ls -la /Volumes/tianyi/foldbridgeAssessert/confidence注册表/RASP_D_LSS/cal/def_lss_calibrated.tsv
```
不可读 → 用规格 §4.2 的 run-record 2026-06-27 回退常量。

- [ ] **步骤 3：确认 27 篇文章 slug 与技术注册表对应**

```
node -e "const j=require('./src/assets/generated/probing-articles/index.json');console.log(j.families.flatMap(f=>f.articles.map(a=>a.slug)))"
head -1 ~/docs/rmdb2pdb/task_packages/fec_lss_rc3_release_20260623/probe_confidence_method_registry.tsv
```
记录 technology↔slug 映射规律（任务 12 注册表 JSON 用）。

- [ ] **步骤 4：记录发现笔记**

把三步结论写进本计划顶部或 `docs/superpowers/plans/` 旁的 discovery 笔记，供并行 agent 引用。无需 commit（笔记可选）。

## 任务 1：骨架 commit（共享文件接缝，主控统一改）

**目的：** 一次性铺好路由/导航/CSS 锚点，使后续 W-A/B/C 三 agent 只在自己锚点区填充，互不撞行。

**文件：**
- 修改：`src/router.js`（`ALLOWED_ROUTES`）
- 修改：`src/siteChrome.js`（`PRIMARY_NAV_ITEMS` + 末尾锚点）
- 修改：`src/main.js`（`routes` 数组 + 路由分派 + help 重定向 + 空壳 page 函数）
- 修改：`src/styles.css`（末尾三段锚点）
- 测试：`test/site-chrome.test.js`（任务 2 单独改，本任务先不动）

- [ ] **步骤 1：router.js 加路由**

`src/router.js` 的 `ALLOWED_ROUTES` Set 内追加两行（保持 `help` 不变）：
```js
  'about',
  'stats',
```

- [ ] **步骤 2：siteChrome.js 改导航 + 加锚点**

把 `PRIMARY_NAV_ITEMS`（`src/siteChrome.js:5`）替换为：
```js
const PRIMARY_NAV_ITEMS = [
  { route: 'home', label: 'Home', activeRoutes: ['home'] },
  { route: 'entry', label: 'Entry', activeRoutes: ['entry', 'sequence', 'download-sequences'] },
  { route: 'probing', label: 'Probing', activeRoutes: ['probing', 'detail'] },
  { route: 'stats', label: 'Stats', activeRoutes: ['stats'] },
  { route: 'about', label: 'About', activeRoutes: ['about', 'help'] },
  { route: 'search', label: 'Search', activeRoutes: ['search'] }
];
```
在 `src/siteChrome.js` **文件末尾**追加三段锚点（供并行 agent 各自填充，先留空）：
```js
// === ABOUT PAGE (W-A 在此追加 renderAboutPage) ===

// === STATS PAGE (W-B 在此追加 renderStatsPage) ===

// === PROBING HUB (W-C 在此追加 renderProbingFamilyIndex/TechTable/Glossary) ===
```

- [ ] **步骤 3：main.js 路由分派 + help 重定向 + 空壳**

`src/main.js:1208` 的 `routes` 数组加 `'about', 'stats'`。
在分派区（`src/main.js:2907` `if (safeRoute === 'help')` 附近）改为：
```js
  if (safeRoute === 'help' || safeRoute === 'about') return aboutPage();
  if (safeRoute === 'stats') return statsPage();
```
（help 复用 aboutPage 即"重定向到 about"语义；保留旧 `helpPage()`/`renderHelpBody` 暂不删，任务 5 由 W-A 把内容并入 about 后再清理。）
新增两个空壳 page 函数（紧邻 `helpPage`，先返回最小壳，W-A/W-B 替换实现）：
```js
function aboutPage() {
  return `<main class="page-detail">${renderBundleHeader()}<section class="card bundle-wide-card"><h1>About</h1><p>Loading…</p></section></main>`;
}
function statsPage() {
  return `<main class="page-detail">${renderBundleHeader()}<section class="card bundle-wide-card"><h1>Statistics</h1><p>Loading…</p></section></main>`;
}
```

- [ ] **步骤 4：styles.css 加锚点**

`src/styles.css` 文件末尾追加：
```css
/* === ABOUT PAGE === */

/* === STATS PAGE === */

/* === PROBING HUB === */
```

- [ ] **步骤 5：语法校验 + 跑测试看 nav 红**

```
node --check src/router.js && node --check src/siteChrome.js && node --check src/main.js
npm test 2>&1 | tail -20
```
预期：`node --check` 全过；`test/site-chrome.test.js` 的 "5 launch routes" 与 "drops removed entries" 断言会 FAIL（导航变了），这是预期红，任务 2 修。

- [ ] **步骤 6：Commit 骨架**

```bash
git add src/router.js src/siteChrome.js src/main.js src/styles.css
git commit -m "scaffold(content): routes/nav/css anchors for About+Stats+Probing hub"
```

## 任务 2：导航测试对齐（红→绿）

**文件：** 修改 `test/site-chrome.test.js`

- [ ] **步骤 1：更新 nav 断言**

把 "5 launch routes" 测试改为断言新导航集：
```js
test('primary nav exposes the launch routes incl. Stats/About', () => {
  const html = renderPrimaryNav('home');
  for (const label of ['Home', 'Entry', 'Probing', 'Stats', 'About', 'Search']) {
    assert.match(html, new RegExp(`>${label}</button>`), `missing nav button: ${label}`);
  }
  assert.match(html, /data-route="stats"[^>]*>Stats<\/button>/);
  assert.match(html, /data-route="about"[^>]*>About<\/button>/);
});

test('primary nav no longer shows a standalone Help button', () => {
  const html = renderPrimaryNav('home');
  assert.doesNotMatch(html, />Help<\/button>/);
});

test('help route keeps About active', () => {
  const html = renderPrimaryNav('help');
  assert.match(html, /class="nav-btn active"\s+data-route="about"/);
});
```

- [ ] **步骤 2：跑测试验证绿**

```
node --test test/site-chrome.test.js 2>&1 | tail -15
```
预期：PASS。

- [ ] **步骤 3：Commit**

```bash
git add test/site-chrome.test.js
git commit -m "test(nav): align primary-nav assertions with Stats/About"
```

---

# 模块 A · About / 方法学页（赛道 W-A）

> 锚点区：`siteChrome.js` 的 `// === ABOUT PAGE ===`、`styles.css` 的 `/* === ABOUT PAGE === */`。只在自己区填充，不碰别人。

## 任务 3：About 策展数据 + store

**文件：**
- 创建：`src/assets/data/about-content.json`
- 创建：`src/aboutContentStore.js`
- 测试：`test/about-content-store.test.js`

- [ ] **步骤 1：写策展数据 JSON**

创建 `src/assets/data/about-content.json`（`body` 一律纯文本，结构化排版用 `kind`+`items`，不塞 HTML）。骨架：
```json
{
  "schema_version": "about.v1",
  "hero": {
    "kicker": "About FoldBridge",
    "title": "把 RNA 化学探针数据关联到已解析的三级结构",
    "summary": "FoldBridge 将 RMDB / RASP 的探针反应性派生序列对齐到 PDB 链，物化为可溯源的结构关联记录，并按测量物理量分族评估置信度。",
    "detail": "本页说明数据来源、建库流水线、置信度方法与阈值的诚实边界。"
  },
  "sections": [
    { "id": "data-sources", "title": "三源数据", "kind": "cards",
      "items": [
        { "name": "RMDB", "body": "RNA Mapping Database：社区沉淀的化学探针反应性原始数据。" },
        { "name": "RASP", "body": "RNA 结构探针公共宇宙：跨技术的反应性派生序列与命中。" },
        { "name": "PDB", "body": "已实验解析的三级结构，提供 SASA / 配对态等结构真值。" }
      ] },
    { "id": "pipeline", "title": "ANNOJOIN 建库流水线", "kind": "pipeline",
      "steps": ["probing data", "sequence match", "PDB entry", "confidence scoring", "structure-linked record"],
      "body": "探针派生序列对齐到 PDB 链，物化为结构关联记录。" },
    { "id": "confidence", "title": "置信度方法（A–F 测量家族）", "kind": "prose",
      "body": "family 表示被测量的物理量（A=WC-face 碱基特异 / B=SHAPE 柔性代理 / C=酶切反向 / D=SASA 双参考 / E=接触图 / F=配对集 F1），不是质量排名。强度全部由 tier（STRONG/MODERATE/WEAK/DISCORDANT/UNDERPOWERED/NOT_SUPPORTED）表达。" },
    { "id": "thresholds", "title": "阈值诚实声明", "kind": "prose",
      "body": "A/B/C 的 0.70/0.65/0.55 是 RC3 运行值（非论文发布阈值）；只有 RL-Seq 的 Spearman 0.50/0.40/0.30 来自文献设定。threshold_basis 三档：1 SUPPORTED / 10 INFORMED / 23 PENDING（共 34 技术）。" },
    { "id": "cite", "title": "如何引用与数据来源", "kind": "prose",
      "body": "数据来源 RMDB / RASP / PDB。引用方式待定，无 DOI 时留空，不编造。" },
    { "id": "terms", "title": "关键术语", "kind": "table",
      "items": [
        { "term": "source case vs display row", "body": "原始 case 与 Entry 表可见行的口径差异。" },
        { "term": "RMDB vs RASP", "body": "两个上游探针数据源。" },
        { "term": "Confidence A/B/C", "body": "三类 ABC 测量家族的置信度评估。" },
        { "term": "Conflicts", "body": "探针信号与结构真值方向不一致的标记。" }
      ] }
  ]
}
```

- [ ] **步骤 2：写 store 失败测试**

创建 `test/about-content-store.test.js`（镜像 `probingArticleStore` 测试风格，ESM + 注入 fetch）：
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAboutContentStore } from '../src/aboutContentStore.js';

test('loadContent fetches once and caches', async () => {
  let calls = 0;
  const fake = { schema_version: 'about.v1', hero: { title: 'X' }, sections: [] };
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => fake }; };
  const store = createAboutContentStore({ assetBase: '/x/', fetchImpl });
  const a = await store.loadContent();
  const b = await store.loadContent();
  assert.equal(a.hero.title, 'X');
  assert.equal(b, a);
  assert.equal(calls, 1);
});

test('loadContent returns null on fetch failure', async () => {
  const fetchImpl = async () => { throw new Error('net'); };
  const store = createAboutContentStore({ assetBase: '/x/', fetchImpl });
  const a = await store.loadContent();
  assert.equal(a, null);
});
```

- [ ] **步骤 3：跑测试验证失败**

运行：`node --test test/about-content-store.test.js`
预期：FAIL（`createAboutContentStore` 未定义）。

- [ ] **步骤 4：写 store 实现**

创建 `src/aboutContentStore.js`（镜像 `probingArticleStore.js`：相对 assetBase + 内存缓存 + 注入 fetch + 失败返回 null；纯 ESM `export`，与仓内所有 `src/*.js` 一致）：
```js
// aboutContentStore.js — 浏览器侧 About 策展内容加载层。镜像 probingArticleStore。
const ABOUT_CONTENT_PATH = 'assets/data/about-content.json';

export function createAboutContentStore({ assetBase = './', fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? ((...a) => fetch(...a)) : null);
  let cache = null;
  async function loadContent() {
    if (cache) return cache;
    if (!doFetch) return null;
    try {
      const res = await doFetch(`${assetBase}${ABOUT_CONTENT_PATH}`);
      if (!res || !res.ok) return null;
      cache = await res.json();
      return cache;
    } catch (_e) {
      return null;
    }
  }
  return { loadContent, peek: () => cache };
}
```

- [ ] **步骤 5：跑测试验证通过**

运行：`node --test test/about-content-store.test.js`
预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add src/assets/data/about-content.json src/aboutContentStore.js test/about-content-store.test.js
git commit -m "feat(about): curated content asset + browser store"
```

## 任务 4：renderAboutPage 纯函数 + CSS

**文件：**
- 修改：`src/siteChrome.js`（ABOUT 锚点区）
- 修改：`src/styles.css`（ABOUT 锚点区）
- 测试：`test/about-page.test.js`

- [ ] **步骤 1：写 renderAboutPage 失败测试**

创建 `test/about-page.test.js`：
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAboutPage } from '../src/siteChrome.js';

const CONTENT = {
  hero: { kicker: 'About', title: '关联探针与结构', summary: '摘要', detail: '细节' },
  sections: [
    { id: 'data-sources', title: '三源数据', kind: 'cards',
      items: [{ name: 'RMDB', body: 'a' }, { name: 'RASP', body: 'b' }, { name: 'PDB', body: 'c' }] },
    { id: 'pipeline', title: '流水线', kind: 'pipeline', steps: ['x', 'y', 'z'], body: 'p' },
    { id: 'thresholds', title: '阈值', kind: 'prose', body: '1 SUPPORTED / 10 INFORMED / 23 PENDING' }
  ]
};

test('renderAboutPage shows hero + all section titles', () => {
  const html = renderAboutPage(CONTENT);
  assert.match(html, /关联探针与结构/);
  assert.match(html, /三源数据/);
  assert.match(html, /流水线/);
  assert.match(html, /阈值/);
});

test('renderAboutPage renders pipeline as inline svg', () => {
  const html = renderAboutPage(CONTENT);
  assert.match(html, /<svg/);
  assert.match(html, /1 SUPPORTED \/ 10 INFORMED \/ 23 PENDING/);
});

test('renderAboutPage degrades to shell when content missing', () => {
  const html = renderAboutPage(null);
  assert.match(html, /<h1[^>]*>About<\/h1>/);
  assert.doesNotMatch(html, /undefined/);
});
```

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/about-page.test.js`
预期：FAIL（`renderAboutPage` 未定义）。

- [ ] **步骤 3：实现 renderAboutPage（填 ABOUT 锚点区）**

在 `src/siteChrome.js` 的 `// === ABOUT PAGE ===` 锚点区下追加。沿用文件内既有 HTML 拼接风格（build-time 可信字符串；本数据来自入 git 的静态 JSON，非用户输入）。content 为空 → 返回最小壳。`kind` 分派：`cards`→卡片网格、`pipeline`→内联 SVG 横向流程图、`prose`→段落、`table`→术语表。用 ESM `export function renderAboutPage(content)` 导出（与 `renderPrimaryNav` 等既有导出一致，无 `module.exports`）。

- [ ] **步骤 4：跑测试验证通过**

运行：`node --test test/about-page.test.js`
预期：PASS。

- [ ] **步骤 5：加 ABOUT CSS（填锚点区）**

在 `src/styles.css` 的 `/* === ABOUT PAGE === */` 区下加样式，全部用 design token（`--accent`/`--primary`/`--radiusCard`/`--panel-card-*`），不硬编码 hex。复用 `card`/`bundle-wide-card` 骨架。

- [ ] **步骤 6：Commit**

```bash
git add src/siteChrome.js src/styles.css test/about-page.test.js
git commit -m "feat(about): renderAboutPage pure renderer + styles"
```

## 任务 5：main.js 接 about 路由 + 清理 help

**文件：**
- 修改：`src/main.js`（`aboutPage()` 实现 + 懒加载 + 清旧 help）

- [ ] **步骤 1：替换 aboutPage 空壳为真实实现**

把任务 1 的 `aboutPage()` 空壳改为：用 `renderAboutPage(store.peek())` 同步渲染当前缓存；缓存空时触发异步 `loadContent()`，加载后 re-render（与 probing 路由同款 re-render 守卫，避免路由已切走仍重绘）。模块顶部创建一个 about store 单例（`createAboutContentStore({ assetBase })`）。

- [ ] **步骤 2：清理旧 help（任务 1 暂留的）**

确认导航/路由已无独立 Help（任务 1 已 help→aboutPage）。删除现已无引用的 `helpPage()` 与 `renderHelpBody`（用 grep 确认零引用后再删；术语内容已并入 about-content.json）。**同步移除 `src/main.js` 顶部（约 :18）从 `siteChrome.js` 对 `renderHelpBody` 的 import**，否则 `node --check` 会报未定义导入。若 `renderHelpBody` 仍 `export` 在 siteChrome.js，一并删除其定义与导出。

- [ ] **步骤 3：语法校验 + 全量测试**

运行：`node --check src/main.js`
运行：`node --test test/`
预期：全绿（含任务 2/4 的 about 测试）。

- [ ] **步骤 4：Commit**

```bash
git add src/main.js
git commit -m "feat(about): wire #about route with lazy load, retire #help"
```

---

# 模块 B · Stats / 全局概览页（赛道 W-B）

> 锚点区：`siteChrome.js` 的 `// === STATS PAGE ===`、`styles.css` 的 `/* === STATS PAGE === */`。
> 铁律（§2.2）：对外 PDB 数 = Entry 可见口径（2386），由共享 `filterVisibleCases` 单一来源派生，禁止手写常量。

## 任务 6：entryVisibility 共享纯函数（单一来源）

**文件：**
- 创建：`src/lib/entryVisibility.js`
- 测试：`test/entry-visibility.test.js`

> 依赖任务 0 步骤 1 的发现笔记（Entry 表把 3401 收窄到 2386 的判据字段与所在层）。

- [ ] **步骤 1：写失败测试（锁判据 + ground-truth 锚点）**

创建 `test/entry-visibility.test.js`。用任务 0 记录的判据字段构造 fixture，断言 `isEntryVisible` 对「有数据」行 true、「无数据/未物化」行 false；`filterVisibleCases` 过滤后计数正确。
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isEntryVisible, filterVisibleCases } from '../src/lib/entryVisibility.js';

test('isEntryVisible hides cases without data per Entry criterion', () => {
  // 字段名按任务 0 发现填入（占位：hasData / displayable 等）
  assert.equal(isEntryVisible({ /* 可见行 */ }), true);
  assert.equal(isEntryVisible({ /* 被屏蔽行 */ }), false);
});

test('filterVisibleCases keeps only visible rows', () => {
  const rows = [/* 1 visible + 1 hidden fixture */];
  assert.equal(filterVisibleCases(rows).length, 1);
});
```

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/entry-visibility.test.js`
预期：FAIL（模块未定义）。

- [ ] **步骤 3：实现 entryVisibility（从浏览器过滤逻辑提纯）**

创建 `src/lib/entryVisibility.js`（新建 `src/lib/` 目录）。把任务 0 定位的 Entry 表可见性过滤逻辑提纯为无副作用纯函数。**纯 ESM `export`**（仓 `package.json` 是 `"type": "module"`，所有 `src/*.js` 用 `export`/`import`，禁止 `module.exports`/`require`）。build 脚本 `.mjs` 与浏览器 `src/main.js` 都用 ESM `import { filterVisibleCases } from './lib/entryVisibility.js'` 共用同一份：
```js
export function isEntryVisible(caseRow) {
  // 复刻任务 0 定位的判据（屏蔽无数据/未物化 case）
}
export function filterVisibleCases(cases) {
  return (cases || []).filter(isEntryVisible);
}
```

- [ ] **步骤 4：浏览器 Entry 表改用此函数（消重，单一来源）**

把任务 0 定位的浏览器侧内联过滤替换为 import 本函数，使浏览器与 build 共用同一份。`node --check` + 跑 Entry 相关既有测试确认零回归。

- [ ] **步骤 5：跑测试验证通过**

运行：`node --test test/entry-visibility.test.js`
预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add src/lib/entryVisibility.js test/entry-visibility.test.js src/main.js
git commit -m "feat(stats): single-source entry visibility filter (2386 caliber)"
```

## 任务 7：build-site-stats.mjs 构建脚本 + stats.json

**文件：**
- 创建：`scripts/build-site-stats.mjs`
- 创建：`src/assets/generated/site-stats/stats.json`（build 产物，入 git）
- 测试：`test/site-stats-build.test.js`

> **退化分支衔接（§4.3）：** 本任务默认走主路径——`filterVisibleCases(index.displayCases)` 在 build 期纯复刻出可见口径 == 2386。**但若任务 0 步骤 1 发现可见性判据依赖运行时浏览器状态、build 期无法纯复刻**，则按规格 §4.3 退化方案：build 同时输出原始 `total_raw` 与可见 `pdb_total` 两字段，统计页只展示可见数，stats.json 注明两者关系；此时下方步骤 1 的 `=== 2386` 硬锚断言改为「断言可见口径字段等于 §4.2 带日期验证常量 2386」。W-B agent 遇不可移植场景时走此分支，不要卡在恒失败的纯复刻断言上。

- [ ] **步骤 1：写 build 失败测试（含 §7 双端断言）**

创建 `test/site-stats-build.test.js`：跑 build 脚本（或 import 其派生函数），断言：
1. 产出 schema 含 `pdb_total` / `tier_distribution` / `families` / `technologies` / `provenance`。
2. **`pdb_total === filterVisibleCases(index.displayCases).length`**（共享函数自洽）。
3. **`pdb_total === 2386`**（§2.2 批准的唯一 ground-truth 测试锚点，对现实的硬锚）。
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveStats } from '../scripts/build-site-stats.mjs';
import { filterVisibleCases } from '../src/lib/entryVisibility.js';

const index = JSON.parse(fs.readFileSync(
  new URL('../src/assets/generated/annojoin-atlas/index.json', import.meta.url), 'utf8'));

test('derived pdb_total matches shared filter AND ground-truth 2386', () => {
  const stats = deriveStats({ index /*, calibration... */ });
  assert.equal(stats.pdb_total, filterVisibleCases(index.displayCases).length);
  assert.equal(stats.pdb_total, 2386);
});
```
> JSON 用 `fs.readFileSync`+`JSON.parse`（仓内既有测试 `test/annojoin-5gag-linked-smoke.test.js` 的惯例；ESM `require` JSON 不可用，import attributes 视 Node 版本而定，统一走 readFileSync 最稳）。`.mjs` 在 Node v22 下可被 `node --test test/*.test.js` 的 ESM 测试直接 `import`。

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/site-stats-build.test.js`
预期：FAIL（脚本未定义）。

- [ ] **步骤 3：实现 build 脚本**

创建 `scripts/build-site-stats.mjs`（ESM：`import { filterVisibleCases } from '../src/lib/entryVisibility.js'`，`export function deriveStats(inputs)` 纯函数 + CLI 入口；JSON 读用 `fs.readFileSync`+`JSON.parse`）。**CLI 执行体必须用守卫包裹**（`if (import.meta.url === \`file://${process.argv[1]}\`) { ...写 stats.json... }`），否则任务 7 步骤 1 测试 `import { deriveStats }` 时顶层 CLI 体会被触发、误写文件。读：
- `src/assets/generated/annojoin-atlas/index.json` → `displayCases` 经 `filterVisibleCases` 派生 `pdb_total`（同时保留原始 `total_raw` 供脚注，但页面只展示可见数）。
- 校准表（任务 0 步骤 2 判定可读 → 真实派生 tier 分布；不可读 → 用规格 §4.2 的 run-record 2026-06-27 回退常量，stats.json 标注 `source: "run-record 2026-06-27"`）。
- `src/assets/generated/probing-articles/index.json` → 27 篇 / 6 家族。
- `probe-technology-registry.json`（W-C 产物；若 W-C 未就绪，build 可先读 rmdb2pdb 仓 TSV 或退化常量 34/1/10/23）。
每个统计块带 `provenance`（`as of run <date>, source <path>`）。

- [ ] **步骤 4：跑脚本生成 stats.json**

运行：`node scripts/build-site-stats.mjs`
产出 `src/assets/generated/site-stats/stats.json`（入 git）。

- [ ] **步骤 5：跑测试验证通过**

运行：`node --test test/site-stats-build.test.js`
预期：PASS（含 `=== 2386` 双端断言）。

- [ ] **步骤 6：Commit**

```bash
git add scripts/build-site-stats.mjs src/assets/generated/site-stats/stats.json test/site-stats-build.test.js
git commit -m "feat(stats): build-time stats derivation, pdb_total==2386 enforced"
```

## 任务 8：siteStatsStore + renderStatsPage + main 路由

**文件：**
- 创建：`src/siteStatsStore.js`
- 修改：`src/siteChrome.js`（STATS 锚点区）
- 修改：`src/styles.css`（STATS 锚点区）
- 修改：`src/main.js`（`statsPage()` 实现 + 懒加载）
- 测试：`test/stats-page.test.js`、`test/site-stats-store.test.js`

- [ ] **步骤 1：写 store + renderStatsPage 失败测试**

`test/site-stats-store.test.js` 镜像 about store 测试（注入 fetch、缓存、失败返回 null）。
`test/stats-page.test.js`：
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStatsPage } from '../src/siteChrome.js';

const STATS = {
  pdb_total: 2386, source_cases: 4070, technologies: 34, families: 6, articles: 27,
  tier_distribution: { STRONG: 283, MODERATE: 1191, WEAK: 18635, DISCORDANT: 33876, UNDERPOWERED: 50062, NOT_SUPPORTED: 114591 },
  provenance: { tier: 'run-record 2026-06-27' }
};

test('renderStatsPage shows 2386 and never leaks 3401', () => {
  const html = renderStatsPage(STATS);
  assert.match(html, /2386/);
  assert.doesNotMatch(html, /3401/);
});

test('renderStatsPage renders tier bar chart as inline svg', () => {
  const html = renderStatsPage(STATS);
  assert.match(html, /<svg/);
  assert.match(html, /STRONG/);
});

test('renderStatsPage degrades to shell when stats missing', () => {
  const html = renderStatsPage(null);
  assert.match(html, /<h1[^>]*>Statistics<\/h1>/);
  assert.doesNotMatch(html, /undefined/);
});
```

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/stats-page.test.js test/site-stats-store.test.js`
预期：FAIL。

- [ ] **步骤 3：实现 siteStatsStore（镜像 aboutContentStore）**

创建 `src/siteStatsStore.js`：`createSiteStatsStore({ assetBase, fetchImpl })` → `loadStats()`（路径 `assets/generated/site-stats/stats.json`）+ 缓存 + 失败 null + `peek`。

- [ ] **步骤 4：实现 renderStatsPage（填 STATS 锚点区）**

在 `siteChrome.js` STATS 锚点区追加。**核心必发**：数字卡（pdb_total/source_cases/technologies/families/articles）+ tier 分布柱状图（内联 SVG）。每图带数据来源脚注。**增量可后补**：SASA donut、来源占比条（缺数据→「数据未物化」占位）。空 stats → 最小壳。用 ESM `export function renderStatsPage(stats)` 导出（无 `module.exports`）。

- [ ] **步骤 5：跑测试验证通过 + 加 STATS CSS**

运行：`node --test test/stats-page.test.js test/site-stats-store.test.js`
预期：PASS。在 `styles.css` STATS 锚点区加样式（含内联 SVG 图表样式，token 驱动）。

- [ ] **步骤 6：main.js 接 stats 路由**

把任务 1 的 `statsPage()` 空壳改为接 `createSiteStatsStore` 单例 + `renderStatsPage(store.peek())` + 懒加载 re-render 守卫。`node --check src/main.js`。

- [ ] **步骤 7：全量测试 + Commit**

运行：`node --test test/`
```bash
git add src/siteStatsStore.js src/siteChrome.js src/styles.css src/main.js test/stats-page.test.js test/site-stats-store.test.js
git commit -m "feat(stats): renderStatsPage + store + #stats route (core cards + tier chart)"
```

---

# 模块 C · Probing 科普中心升级（赛道 W-C）

> 锚点区：`siteChrome.js` 的 `// === PROBING HUB ===`、`styles.css` 的 `/* === PROBING HUB === */`。
> 不新增导航项（仍在 Probing 路由内）。保留现有轮播 + 27 篇文章列表不动，三块叠加其上。

## 任务 9：技术注册表 JSON（从 rmdb2pdb TSV 提取）

**文件：**
- 创建：`src/assets/data/probe-technology-registry.json`
- 测试：`test/probe-technology-registry.test.js`

> 依赖任务 0 步骤 3 的发现笔记（technology↔slug 映射规律）。

- [ ] **步骤 1：写失败测试（锁 34 行 + 三档计数）**

创建 `test/probe-technology-registry.test.js`：
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync(
  new URL('../src/assets/data/probe-technology-registry.json', import.meta.url), 'utf8'));

test('registry has 34 technologies', () => {
  assert.equal(registry.technologies.length, 34);
});

test('threshold_basis splits 1 SUPPORTED / 10 INFORMED / 23 PENDING', () => {
  const count = (b) => registry.technologies.filter(t => t.threshold_basis === b).length;
  assert.equal(count('SUPPORTED'), 1);
  assert.equal(count('INFORMED'), 10);
  assert.equal(count('PENDING'), 23);
});

test('each tech has family A-F and targetable bases', () => {
  for (const t of registry.technologies) {
    assert.match(t.measurement_family, /^[A-F]$/);
    assert.ok(typeof t.targetable_bases === 'string');
  }
});
```

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/probe-technology-registry.test.js`
预期：FAIL（文件不存在）。

- [ ] **步骤 3：从 TSV 提取生成 JSON**

从 `~/docs/rmdb2pdb/task_packages/fec_lss_rc3_release_20260623/probe_confidence_method_registry.tsv`（34 数据行）提取展示所需列 → `src/assets/data/probe-technology-registry.json`。每条：`technology` / `measurement_family`(A–F) / `targetable_bases` / `threshold_basis`(归一为 SUPPORTED/INFORMED/PENDING) / `article_slug`(按任务 0 映射规律，无对应留 null)。**入 git、静态、不引 build 依赖。**
```json
{
  "schema_version": "probe-tech.v1",
  "source": "rmdb2pdb probe_confidence_method_registry.tsv (34 rows)",
  "technologies": [
    { "technology": "DMS", "measurement_family": "A", "targetable_bases": "A,C", "threshold_basis": "INFORMED", "article_slug": null }
  ]
}
```
（threshold_basis 归一：LITERATURE_SUPPORTED→SUPPORTED / LITERATURE_INFORMED→INFORMED / OPERATING_VALUE_PENDING_CALIBRATION→PENDING。）

- [ ] **步骤 4：跑测试验证通过**

运行：`node --test test/probe-technology-registry.test.js`
预期：PASS（34 行 + 1/10/23）。

- [ ] **步骤 5：Commit**

```bash
git add src/assets/data/probe-technology-registry.json test/probe-technology-registry.test.js
git commit -m "feat(probing): 34-technology registry JSON (1/10/23 threshold split)"
```

## 任务 10：三个 render 纯函数 + CSS

**文件：**
- 修改：`src/siteChrome.js`（PROBING HUB 锚点区）
- 修改：`src/styles.css`（PROBING HUB 锚点区）
- 测试：`test/probing-hub.test.js`

- [ ] **步骤 1：写失败测试**

创建 `test/probing-hub.test.js`：
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProbingFamilyIndex, renderProbingTechTable, renderProbingGlossary } from '../src/siteChrome.js';

const FAMILIES = [
  { id: 'famB', family_title: 'SHAPE 柔性代理', articles: [{ slug: 'shape', title: 'SHAPE' }] }
];
const REGISTRY = { technologies: [
  { technology: 'DMS', measurement_family: 'A', targetable_bases: 'A,C', threshold_basis: 'INFORMED', article_slug: null }
] };
const TERMS = [{ term: 'WC-face', body: 'Watson-Crick face' }];

test('family index renders family cards with anchor links', () => {
  const html = renderProbingFamilyIndex(FAMILIES);
  assert.match(html, /SHAPE 柔性代理/);
  assert.match(html, /#famB|data-anchor="famB"/);
});

test('tech table renders 34-col rows with sortable headers', () => {
  const html = renderProbingTechTable(REGISTRY);
  assert.match(html, /DMS/);
  assert.match(html, /INFORMED/);
  assert.match(html, /<th/);
});

test('glossary renders term + definition', () => {
  const html = renderProbingGlossary(TERMS);
  assert.match(html, /WC-face/);
  assert.match(html, /Watson-Crick face/);
});

test('renderers degrade gracefully on empty input', () => {
  assert.doesNotMatch(renderProbingTechTable(null), /undefined/);
  assert.doesNotMatch(renderProbingFamilyIndex(null), /undefined/);
});
```

- [ ] **步骤 2：跑测试验证失败**

运行：`node --test test/probing-hub.test.js`
预期：FAIL（三函数未定义）。

- [ ] **步骤 3：实现三个纯函数（填 PROBING HUB 锚点区）**

在 `siteChrome.js` PROBING HUB 锚点区追加：
- `renderProbingFamilyIndex(families)`：6 家族分组卡片，点击锚跳到该家族文章组。
- `renderProbingTechTable(registry)`：34 行对比表（列=技术/家族 A–F/靶碱基/阈值依据/关联文章），可排序（排序为纯客户端增强，无 JS 时默认序静态可读）。强调 family=物理量非排名（与 About §3.3.4 一致）。
- `renderProbingGlossary(terms)`：术语速查清单。
空输入 → 降级（隐藏对比表，其余照常）。用 ESM `export function` 导出三函数（无 `module.exports`）。

- [ ] **步骤 4：跑测试验证通过 + 加 CSS**

运行：`node --test test/probing-hub.test.js`
预期：PASS。在 `styles.css` PROBING HUB 锚点区加样式（复用 `technology-*` 既有 class 骨架，token 驱动）。

- [ ] **步骤 5：Commit**

```bash
git add src/siteChrome.js src/styles.css test/probing-hub.test.js
git commit -m "feat(probing): family index + 34-tech table + glossary renderers"
```

## 任务 11：main.js 组装插入三块

**文件：**
- 修改：`src/main.js`（`renderProbingArticleIndex` 组装处）

- [ ] **步骤 1：在 Probing index 组装处插入三块**

在 `renderProbingArticleIndex` 组装处（现有轮播/列表区之上或之间）插入 `renderProbingFamilyIndex(families)` + `renderProbingTechTable(registry)` + `renderProbingGlossary(terms)`。注册表经新 store 或随 index 一起加载（择简）。**保持现有轮播与 27 篇列表不动。**families 取自 probing index 的 `families`，terms 用一份内联常量或小 JSON。

- [ ] **步骤 2：排序交互接线（纯客户端，可选增强）**

若实现表头排序，在现有 probing 事件委托处加点击排序（纯 JS，无库）。无此步表格仍默认序可读。

- [ ] **步骤 3：语法校验 + 全量测试**

运行：`node --check src/main.js`
运行：`node --test test/`
预期：全绿。

- [ ] **步骤 4：Commit**

```bash
git add src/main.js
git commit -m "feat(probing): assemble family index + tech table + glossary into hub"
```

---

# 任务 12：收尾 — README + 全量验证

**文件：**
- 修改：`README.md`（Included pages）

- [ ] **步骤 1：更新 README Included pages**

在 `README.md` 的页面清单加 About / Stats，标注 Probing 升级为科普中心，移除独立 Help。

- [ ] **步骤 2：全量验证（§8 验收）**

运行：`node --test test/`（全绿）
人工核对：导航出现 Stats/About；`#help` 重定向到 `#about` 无死路由；统计页显示 2386 无 3401 泄漏；新页面视觉与主站一致（暖金底+绿强调+Avenir Next）；所有展示数字可溯源。

- [ ] **步骤 3：Commit**

```bash
git add README.md
git commit -m "docs(content): list About/Stats pages, note Probing hub upgrade"
```

---

## 执行说明（并行赛道）

- **任务 0 → 任务 1 → 任务 2** 由主控串行先做（发现 + 骨架 commit + nav 测试对齐）。骨架 commit 后共享文件（router/siteChrome/main/styles）的接缝已铺好，各 agent 只在自己锚点区填充。
- 之后经 `using-git-worktrees` 串行预建三个 worktree，再分派三个 agent 并行：
  - **W-A** = 任务 3/4/5（About）
  - **W-B** = 任务 6/7/8（Stats）
  - **W-C** = 任务 9/10/11（Probing hub）
- 三赛道完成后主控串行 merge（骨架 commit 已消除共享文件行级冲突），再做任务 12 收尾。
- **W-B 依赖 W-A 的 store 模式**（aboutContentStore 是 siteStatsStore 的镜像模板）——可让 W-A 先落 store，或 W-B 自带镜像实现（两份 store 各自独立，不共享文件）。

<!-- PLAN-APPEND-ANCHOR -->
