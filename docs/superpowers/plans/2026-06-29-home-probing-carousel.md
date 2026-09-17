# Home Page Probing-Article Carousel 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 FoldBridge 主页 hero 和模块卡之间插入一个轮播模块，展示 27 篇 RNA 探针方法科普文章（代表图 + 标题 + 家族徽标，点击进详情页）。

**架构：** 纯增量、零回归——现有 hero 一行不动。新增纯函数 `renderHomeProbingCarousel(articles)`（`siteChrome.js`，可 node --test）只产静态 HTML；builder 给每篇文章补 `rep_figure` + `family_title` 两个字段；home 复用现有异步索引 `loadProbingArticleIndex()`；轮播的定时器/翻页交互在 `main.js` 的 DOM 层，定时器幂等启动（先清后起）防泄漏。

**技术栈：** vanilla JS, hash routing, node --test, node build scripts (.mjs)

---

## 文件结构 / File structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `scripts/build-probing-articles.mjs` | 构建期给每篇文章 card 补 `rep_figure`（首图 basename）+ `family_title`（家族标题） | 修改 |
| `src/assets/generated/probing-articles/index.json` + 27×`<slug>.json` | 重新生成，带上新字段 | 重新生成（git-tracked，必须 commit） |
| `test/build-probing-articles.test.js` | 读已生成的 index.json，断言新字段存在且形态正确 | 创建 |
| `src/siteChrome.js` | 新增纯函数 `renderHomeProbingCarousel(articles)`：入参→静态 HTML，无 DOM/无定时器 | 修改 |
| `test/site-chrome.test.js` | `renderHomeProbingCarousel` 的纯函数断言 | 修改 |
| `src/main.js` | 把轮播接进 `homePage()`；重渲染守卫加 `'home'`；模块级定时器 + `initHomeProbingCarousel()`（幂等）+ 接进 render 后置 init 簇 | 修改 |
| `src/styles.css` | 轮播布局样式，复用现有卡片视觉语言 | 修改 |

**任务顺序约束：** 任务 1（重新生成 index）必须先于任务 2（builder 测试读 index 断言新字段）。任务 3（纯函数）独立，但放在 1/2 之后便于测试用真实字段名。任务 4/5 是 main.js 集成（无法 node-test，靠 npm test 绿 + 手动 build 验证）。任务 6 样式。任务 7 总验证。

---

### 任务 1：Builder 输出 rep_figure + family_title

**文件：**
- 修改：`scripts/build-probing-articles.mjs:251-281`（buildOne 返回的 card 加 `rep_figure`）+ `:300-342`（main 里建 slug→family_title 反查表并 stamp `family_title`）
- 重新生成：`src/assets/generated/probing-articles/index.json` + `<slug>.json` ×27

- [ ] **步骤 1：给 buildOne 的 card 加 rep_figure**

`buildOne()` 末尾已有 `const repFig = figureBlocks[0] || {};`。在返回对象里加一个字段（`figureBlocks[0]` 的 block 带 `srcBasename`，见 parseArticle line ~189）：

```js
  return {
    slug,
    title: parsed.title,
    date: parsed.date,
    summary,
    figure_count: figureBlocks.length,
    section_count: parsed.blocks.filter((b) => b.type === 'heading').length,
    rep_pmid: repFig.pmid || '',
    rep_doi: repFig.doi || '',
    rep_figure: repFig.srcBasename || ''
  };
```

- [ ] **步骤 2：在 main() 里建 slug→family_title 反查表并 stamp family_title**

`main()` 中 `cards` 数组构建完、`cardBySlug` 之后（约 line 318），用 `FAMILY_ORDER` 建反查表并写回每个 card：

```js
  const cardBySlug = new Map(cards.map((c) => [c.slug, c]));

  // slug → 家族标题反查（FAMILY_ORDER 已把 slug 分到 6 个家族）。
  // buildOne 不知道家族归属，在这里统一回填，供主页轮播渲染家族徽标。
  const familyTitleBySlug = new Map();
  for (const fam of FAMILY_ORDER) {
    for (const s of fam.slugs) familyTitleBySlug.set(s, fam.title);
  }
  for (const card of cards) {
    card.family_title = familyTitleBySlug.get(card.slug) || '';
  }
```

注意：`cards` 与 `cardBySlug` 引用同一组对象，stamp 后两处都带 `family_title`，下游 `families[].articles`（经 cardBySlug.get）与顶层 `articles: cards` 都带上。

- [ ] **步骤 3：重新生成资产**

运行：`cd ~/docs/foldbridge && npm run build:probing-articles`
预期：`[probing-articles] 完成：27 篇文章，6 个家族 → .../probing-articles`，无报错。

- [ ] **步骤 4：核对生成结果**

运行：`node -e "const i=require('./src/assets/generated/probing-articles/index.json'); const a=i.articles.find(x=>x.slug==='dms'); console.log(a.rep_figure, '|', a.family_title); console.log('all have rep_figure:', i.articles.every(x=>typeof x.rep_figure==='string')); console.log('all have family_title:', i.articles.every(x=>x.family_title && x.family_title.length));"`
预期：第一行类似 `cordero2012_f1__PMC3448840__F1.jpg | DMS chemical probing`；后两行均 `true`。

- [ ] **步骤 5：Commit**

```bash
git add scripts/build-probing-articles.mjs src/assets/generated/probing-articles/
git commit -m "feat(probing-build): emit rep_figure + family_title on article cards"
```

---

### 任务 2：Builder 测试锁住新字段

**文件：**
- 创建：`test/build-probing-articles.test.js`

测试**不重跑构建**（慢、依赖源仓库），而是读任务 1 已生成的 `index.json` 断言结构。

- [ ] **步骤 1：编写失败的测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(
  __dirname,
  '../src/assets/generated/probing-articles/index.json'
);
const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));

test('every article card carries a string rep_figure', () => {
  assert.ok(Array.isArray(index.articles) && index.articles.length === 27);
  for (const a of index.articles) {
    assert.equal(typeof a.rep_figure, 'string', `${a.slug} rep_figure not string`);
  }
});

test('every article card carries a non-empty family_title', () => {
  for (const a of index.articles) {
    assert.ok(a.family_title && a.family_title.length > 0, `${a.slug} missing family_title`);
  }
});

test('articles with figures get a non-empty rep_figure basename', () => {
  const withFigs = index.articles.filter((a) => a.figure_count > 0);
  assert.ok(withFigs.length > 0, 'expected at least one article with figures');
  for (const a of withFigs) {
    // 契约：有图的文章必须给出首图 basename（无路径分隔符）。
    assert.ok(a.rep_figure.length > 0, `${a.slug} has figures but empty rep_figure`);
    assert.ok(!a.rep_figure.includes('/'), `${a.slug} rep_figure should be a basename`);
  }
  // 零 figure 文章的契约：rep_figure === ""。当前 27 篇全部有图，
  // 故该分支为契约性声明（无样本可断言）。
});
```

- [ ] **步骤 2：运行测试验证（应通过，因任务 1 已生成字段）**

运行：`node --test test/build-probing-articles.test.js`
预期：3 tests pass。（注意：本任务测试在任务 1 之后写，字段已存在，故直接 PASS——这是顺序约束的结果，符合"先生成再锁"。若任务 1 未完成则会 FAIL，报 `rep_figure not string`。）

- [ ] **步骤 3：Commit**

```bash
git add test/build-probing-articles.test.js
git commit -m "test(probing-build): assert rep_figure + family_title on cards"
```

---

### 任务 3：renderHomeProbingCarousel 纯函数

**文件：**
- 修改：`src/siteChrome.js`（文件末尾追加导出函数）
- 测试：`test/site-chrome.test.js`（追加）

`siteChrome.js` 无 `escapeHtml`，现有函数直接插值构建期可信字符串；slug/title/family_title 均来自构建管线（可信），slug 是 FAMILY_ORDER 里受控的 kebab-case 标识，按文件既有约定直接插值。

- [ ] **步骤 1：编写失败的测试**

在 `test/site-chrome.test.js` 末尾追加：

```js
import { renderHomeProbingCarousel } from '../src/siteChrome.js';

const SAMPLE_ARTICLES = [
  { slug: 'dms', title: 'Why DMS can only seriously interpret A/C', rep_figure: 'cordero2012_f1__PMC3448840__F1.jpg', family_title: 'DMS chemical probing' },
  { slug: 'shape-map', title: 'SHAPE-MaP: reading 2′-OH as mutations', rep_figure: 'sm_f1.jpg', family_title: 'SHAPE 2′-OH acylation' },
  { slug: 'pars', title: 'PARS: pairing via two nucleases', rep_figure: 'pars_f1.jpg', family_title: 'Hydroxyl-radical / nuclease footprinting' }
];

test('carousel renders one slide per article', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.equal((html.match(/data-carousel-slide=/g) || []).length, 3);
});

test('each slide links to its detail route', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.match(html, /href="#detail\/dms"/);
  assert.match(html, /href="#detail\/shape-map"/);
  assert.match(html, /href="#detail\/pars"/);
});

test('each slide uses the per-slug asset path for its figure', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.match(html, /src="\.\/src\/assets\/generated\/probing-articles\/assets\/dms\/cordero2012_f1__PMC3448840__F1\.jpg"/);
});

test('each slide shows its family badge', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.match(html, /DMS chemical probing/);
  assert.match(html, /SHAPE 2′-OH acylation/);
});

test('first slide and first dot are marked active', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.match(html, /data-carousel-slide="0"[^>]*class="[^"]*active/);
  assert.match(html, /data-carousel-dot="0"[^>]*class="[^"]*active/);
});

test('carousel exposes prev/next and per-slide dot controls', () => {
  const html = renderHomeProbingCarousel(SAMPLE_ARTICLES);
  assert.match(html, /data-carousel-prev/);
  assert.match(html, /data-carousel-next/);
  assert.equal((html.match(/data-carousel-dot=/g) || []).length, 3);
});

test('empty input returns a placeholder shell with no slides', () => {
  const html = renderHomeProbingCarousel([]);
  assert.doesNotMatch(html, /data-carousel-slide=/);
  assert.match(html, /home-probing-carousel/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/site-chrome.test.js`
预期：FAIL，报 `renderHomeProbingCarousel is not a function` 或导入错误。

- [ ] **步骤 3：实现纯函数（追加到 src/siteChrome.js 末尾）**

```js
const PROBING_ASSET_BASE = './src/assets/generated/probing-articles/assets';

// 主页探针文章轮播：纯函数，入参 articles → 静态 HTML。
// 无 DOM、无定时器、无 window；翻页/自动轮换的行为层在 main.js。
// 每张 slide = 代表图 + 家族徽标 + 标题，整张是跳详情页的链接。
export function renderHomeProbingCarousel(articles = []) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return `<section class="home-probing-carousel home-probing-carousel-empty" aria-label="Probing method articles">
      <p class="home-probing-empty-note">Probing articles are loading…</p>
    </section>`;
  }

  const slides = articles.map((a, i) => {
    const activeClass = i === 0 ? ' active' : '';
    const img = a.rep_figure
      ? `<img class="home-probing-slide-img" src="${PROBING_ASSET_BASE}/${a.slug}/${a.rep_figure}" alt="${a.title || ''}" loading="lazy" />`
      : `<div class="home-probing-slide-img home-probing-slide-noimg" aria-hidden="true"></div>`;
    // 注意属性顺序：data-carousel-slide 在 class 之前，以匹配 active-slide 测试正则
    // （/data-carousel-slide="0"[^>]*class="[^"]*active/，[^>]* 不跨越 '>'）。
    return `<a data-carousel-slide="${i}" class="home-probing-slide${activeClass}" href="#detail/${a.slug}">
        ${img}
        <div class="home-probing-slide-copy">
          <span class="home-probing-slide-family">${a.family_title || ''}</span>
          <h3 class="home-probing-slide-title">${a.title || ''}</h3>
        </div>
      </a>`;
  }).join('\n      ');

  const dots = articles.map((_a, i) =>
    // 同上：data-carousel-dot 在 class 之前，匹配 active-dot 测试正则。
    `<button type="button" data-carousel-dot="${i}" class="home-probing-dot${i === 0 ? ' active' : ''}" aria-label="Go to slide ${i + 1}"></button>`
  ).join('\n        ');

  return `<section class="home-probing-carousel" aria-label="Probing method articles" aria-roledescription="carousel">
      <div class="home-probing-track" data-carousel-track>
        ${slides}
      </div>
      <button type="button" class="home-probing-nav home-probing-prev" data-carousel-prev aria-label="Previous article">&larr;</button>
      <button type="button" class="home-probing-nav home-probing-next" data-carousel-next aria-label="Next article">&rarr;</button>
      <div class="home-probing-dots">
        ${dots}
      </div>
    </section>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/site-chrome.test.js`
预期：全部 site-chrome 测试 PASS（含 7 个新断言）。

- [ ] **步骤 5：Commit**

```bash
git add src/siteChrome.js test/site-chrome.test.js
git commit -m "feat(home): add renderHomeProbingCarousel pure render unit"
```

---

### 任务 4：接进 homePage() + 重渲染守卫

**文件：**
- 修改：`src/main.js:18`（import）、`:1457-1481`（homePage）、`:1918`（守卫）

main.js 在 import 期读 window，无法 node-test。验证靠 `npm test` 保持绿 + 手动 build。

- [ ] **步骤 1：import 轮播函数**

`src/main.js:18` 现有：
```js
import { renderPrimaryNav, renderHomeHero, renderHomeModuleCards, renderHelpBody } from './siteChrome.js';
```
改为：
```js
import { renderPrimaryNav, renderHomeHero, renderHomeModuleCards, renderHelpBody, renderHomeProbingCarousel } from './siteChrome.js';
```

- [ ] **步骤 2：在 homePage() 里插入轮播 + 触发懒加载**

`homePage()`（line ~1457）当前 `return` 块含 `${renderHomeHero()}` 然后 `${renderHomeModuleCards()}`。改为在两者之间插入轮播，并在索引未加载时触发加载：

```js
function homePage() {
  // 已加载则喂文章，否则空壳占位 + 触发懒加载（与 probing 路由同款）。
  const articles = (probingArticleIndexState && typeof probingArticleIndexState === 'object')
    ? (probingArticleIndexState.articles || [])
    : [];
  if (probingArticleIndexState === null) {
    loadProbingArticleIndex();
  }

  const featuredNames = homeBundleSites.map((site, index) => {
    // ... 不变 ...
  }).join('');
  const bundleHeader = renderBundleHeader(featuredNames);

  return `<main class="page-home bundle-home-page">
    <section class="bundle-home-shell">
      ${bundleHeader}
      ${renderHomeHero()}
      ${renderHomeProbingCarousel(articles)}
      ${renderHomeModuleCards()}
    </section>
  </main>`;
}
```

（保持 `featuredNames`/`bundleHeader` 原逻辑不动，只加顶部三行 + 一行轮播插入。）

- [ ] **步骤 3：重渲染守卫加 'home'**

`loadProbingArticleIndex()` 末尾（line ~1918）：
```js
  if (route === 'detail' || route === 'probing') render({ preserveScroll: true });
```
改为：
```js
  if (route === 'detail' || route === 'probing' || route === 'home') render({ preserveScroll: true });
```

- [ ] **步骤 4：验证 npm test 仍绿 + 构建通过**

运行：`npm test`
预期：全绿（基线 164 + 任务 2/3 新增）。

运行：`npm run build:static`
预期：成功，无报错。

- [ ] **步骤 5：Commit**

```bash
git add src/main.js
git commit -m "feat(home): mount probing carousel between hero and module cards"
```

---

### 任务 5：轮播 DOM 行为 + 幂等定时器

**文件：**
- 修改：`src/main.js`（模块级状态 ~line 76-90、init 簇 ~2798-2809、新函数定义近 `initHomeDashboardFilters` ~2964）

`render()` 每次 home 交互都重建 innerHTML，定时器必须幂等：先清后起；翻页用切 active class（非整页 render）。

- [ ] **步骤 1：加模块级定时器句柄**

在其他模块级 `let` 状态附近（如 `let probingArticleIndexState = null;` 旁，line ~83）加：
```js
let homeProbingCarouselTimer = null;
```

- [ ] **步骤 2：实现 initHomeProbingCarousel（定义在 initHomeDashboardFilters 附近）**

```js
function initHomeProbingCarousel() {
  // 幂等：每次 render 都会重跑本函数，先清旧定时器再决定是否重启，
  // 否则同一 home 会话内反复 render 会叠加多个 interval。
  if (homeProbingCarouselTimer) {
    clearInterval(homeProbingCarouselTimer);
    homeProbingCarouselTimer = null;
  }
  const carousel = document.querySelector('.home-probing-carousel');
  // 非 home 路由 / 空壳无 slide：清掉定时器后直接返回（已在上面清理）。
  if (!carousel) return;
  const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
  const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
  if (slides.length <= 1) return;

  let current = 0;
  const show = (next) => {
    current = (next + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  };

  const restart = () => {
    if (homeProbingCarouselTimer) clearInterval(homeProbingCarouselTimer);
    homeProbingCarouselTimer = setInterval(() => show(current + 1), 6000);
  };

  carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', (e) => {
    e.preventDefault();
    show(current - 1);
    restart();
  });
  carousel.querySelector('[data-carousel-next]')?.addEventListener('click', (e) => {
    e.preventDefault();
    show(current + 1);
    restart();
  });
  dots.forEach((dot, i) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
      restart();
    });
  });

  restart();
}
```

（slide 整张是 `<a href="#detail/slug">`，点击自然走 hashchange，无需额外 JS。prev/next/dot 是 `<button>`，`e.preventDefault()` 防止任何默认行为。）

- [ ] **步骤 3：接进 render 后置 init 簇**

`render()` 的 init 调用簇（line ~2798-2809），在 `initHomeDashboardFilters();` 附近加一行：
```js
  initHomeDashboardFilters();
  initHomeProbingCarousel();
  initPdbCasePage();
```

- [ ] **步骤 4：验证 npm test 仍绿 + 构建通过**

运行：`npm test`
预期：全绿（无新增/减少，main.js 不被 node-test）。

运行：`npm run build:static`
预期：成功。

- [ ] **步骤 5：Commit**

```bash
git add src/main.js
git commit -m "feat(home): wire carousel auto-rotate + prev/next/dots (idempotent timer)"
```

---

### 任务 6：轮播样式

**文件：**
- 修改：`src/styles.css`（追加）

复用现有卡片视觉语言（`bundle-hero-card` / `bundle-site-card` 附近的 token/圆角/阴影），不引入新设计系统。CSS 不做单元测试。

- [ ] **步骤 1：追加轮播 CSS**

```css
/* 主页探针文章轮播 */
.home-probing-carousel {
  position: relative;
  margin: 1.5rem 0;
  border-radius: 16px;
  overflow: hidden;
  background: var(--card-bg, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.home-probing-track {
  position: relative;
  min-height: 260px;
}
.home-probing-slide {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: center;
  padding: 1.5rem 3rem;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.4s ease;
  text-decoration: none;
  color: inherit;
}
.home-probing-slide.active {
  opacity: 1;
  visibility: visible;
}
.home-probing-slide-img {
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  border-radius: 10px;
  background: #f6f7f9;
}
.home-probing-slide-noimg {
  width: 100%;
  height: 200px;
  border-radius: 10px;
  background: #f0f1f4;
}
.home-probing-slide-family {
  display: inline-block;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  color: var(--accent, #2b6cb0);
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.home-probing-slide-title {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.4;
}
.home-probing-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
}
.home-probing-prev { left: 0.6rem; }
.home-probing-next { right: 0.6rem; }
.home-probing-nav:hover { background: rgba(0, 0, 0, 0.65); }
.home-probing-dots {
  position: absolute;
  bottom: 0.7rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.4rem;
}
.home-probing-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.home-probing-dot.active { background: var(--accent, #2b6cb0); }
.home-probing-carousel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
.home-probing-empty-note { color: #888; }
@media (max-width: 640px) {
  .home-probing-slide {
    grid-template-columns: 1fr;
    padding: 1.25rem 2.4rem;
  }
}
```

（class 名按需对齐现有 token 变量；若 `--accent`/`--card-bg` 名不同，用 styles.css 里实际的变量名。）

- [ ] **步骤 2：构建并人工查看**

运行：`npm run build:static && npm run serve`（或 `npm run dev`），浏览器开 home，确认轮播在 hero 下方、模块卡上方，自动轮换 + prev/next/dot 可用、图片不碎、点击进详情页。

- [ ] **步骤 3：Commit**

```bash
git add src/styles.css
git commit -m "style(home): probing carousel layout reusing card visual language"
```

---

### 任务 7：总验证

**文件：** 无新增；收尾验证 + commit 任何遗留生成物。

- [ ] **步骤 1：跑全套测试**

运行：`npm test`
预期：全绿，0 fail。计数 = 基线 164 + 任务 2 的 3 + 任务 3 的 7 ≈ 174（具体以实际为准，只要 0 fail）。

- [ ] **步骤 2：全量构建**

运行：`npm run build`
预期：build:static → build:search-docs → build:search-index 全成功（约 1038 search docs / 991 pages 量级，以实际输出为准），无报错。

- [ ] **步骤 3：dead-link / 碎图自查**

人工或脚本核对：轮播每张 slide 的 `#detail/<slug>` 都对应真实文章；图片路径在 `src/assets/generated/probing-articles/assets/<slug>/` 下真实存在。

- [ ] **步骤 4：Commit 任何遗留生成物**

```bash
git status
# 若 build 产生未提交的 git-tracked 生成物（如 search docs），按需 add + commit
git commit -m "chore(home): finalize probing carousel build artifacts"
```

---

## 验证 / Verification

| 命令 | 预期 |
|------|------|
| `node --test test/build-probing-articles.test.js` | 3 pass |
| `node --test test/site-chrome.test.js` | 全 pass（含 7 个新断言） |
| `npm test` | 全绿 0 fail（≈174） |
| `npm run build` | static + search-docs + search-index 全成功 |
| 手动 home 页 | 轮播在 hero 下/模块卡上；自动轮换 6s；prev/next/dot 可用；slide 点击进详情；无碎图；离开 home 无定时器泄漏 |

护栏：现有 hero（`renderHomeHero`）markup 与其测试零改动；`npm test` 基线不回退。

## 范围外 / Out of scope

- 不重设计 hero（保持已上线、已测试的现状）。
- 不新增文章内容、不动 probing 路由 / detail 路由 / 搜索。
- 不新增 store / fetch 路径（复用现有 `probingArticleStore` + `loadProbingArticleIndex`）。
- 轮播无触摸滑动手势 / 无无限平滑滚动动画（YAGNI——淡入切换足够）。
