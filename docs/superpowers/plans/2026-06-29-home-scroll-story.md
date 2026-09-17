# 主页招牌滚动叙事（Home Scroll Story）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 FoldBridge 主页 hero 与 probing 轮播之间插入一个"电影式"招牌区——左侧主体钉住，用户下滑时右侧场景渐入，左侧可视化随滚动从 1D 比对 → 2D 二级结构 → 3D 三级结构逐级变形，同一套反应性颜色贯穿三态。主角为真实 RMDB 案例 1OB5（tRNA-Phe）。

**架构：** 纯增量、零回归——现有 hero / probing 轮播 / 模块卡 / 顶部锁定模板一行不动。新增三单元，沿用已验证的 probing 轮播模式：(1) 生成资产 `src/assets/generated/home-scroll-story/`（story.json + 2D SVG + 3D PNG + README，入 git）；(2) `src/siteChrome.js` 纯函数 `renderHomeScrollStory` / `renderReactivityAlignment` / `pickFeaturedCase` / 色标常量（可 node --test）；(3) `src/main.js` 异步加载 store + 幂等 IntersectionObserver 行为层。反应性色标为单一权威，1D 实时着色与 2D/3D 离线快照共用同一组参数。

**技术栈：** vanilla JS, hash routing, node --test（无 jsdom）, IntersectionObserver, 离线 VARNA/molstar 渲染（手动一次性策展）

**规格：** `docs/superpowers/specs/2026-06-29-home-scroll-story-design.md`

---

## 文件结构 / File structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/assets/generated/home-scroll-story/story.json` | 策展案例数组：每案例含 pdb_id/chain/molecule_label/source_family/confidence_label/sequence/reactivity/paired_state/svg_2d/png_3d/scenes | 创建（git-tracked，必须 commit） |
| `src/assets/generated/home-scroll-story/1ob5-2d.svg` | VARNA 离线导出 1OB5 二级结构（反应性着色），矢量 | 创建 |
| `src/assets/generated/home-scroll-story/1ob5-3d.png` | molstar 离线截图 1OB5 三级结构（反应性着色） | 创建 |
| `src/assets/generated/home-scroll-story/README.md` | 记录三态快照的重生成流程 + 色标单一来源 | 创建 |
| `src/homeScrollStoryStore.js` | 浏览器侧 story.json 加载层（相对基址 + 内存缓存 + 注入 fetch），与 probingArticleStore 同构 | 创建 |
| `src/siteChrome.js` | 新增纯函数 `reactivityColor`/`renderReactivityAlignment`/`renderHomeScrollStory`/`pickFeaturedCase`；无 DOM/无定时器/无 window | 修改 |
| `test/home-scroll-story.test.js` | 上述纯函数的 node --test 断言 | 创建 |
| `src/main.js` | 接进 `homePage()`；新增 `loadHomeScrollStory()`（home 守卫）；新增幂等 `initHomeScrollStory()`（IntersectionObserver，先 disconnect 再建）；接进 render 后置 init 簇；visitIndex 读写 localStorage | 修改 |
| `src/styles.css` | 招牌区布局样式（sticky 左 + 滚动右 + 三态层 + 图例 + 降级 + reduced-motion），复用现有 token | 修改 |

**任务顺序约束：**
- 任务 1（数据资产 story.json + README）先行——后续纯函数测试要读真实字段名与色标。
- 任务 2（色标 + 1D 对齐纯函数）→ 任务 3（招牌区纯函数 + pickFeaturedCase）依赖任务 2 的色标。
- 任务 4（store 加载层）独立于 2/3，可在任意点做，但放 3 之后便于 e2e 心智。
- 任务 5（main.js 集成：homePage 挂载 + loadHomeScrollStory + render 守卫）依赖 3/4。
- 任务 6（main.js 行为层 initHomeScrollStory 幂等 observer）依赖 5。
- 任务 7（styles.css）依赖 3 的 class 名。
- 任务 8（2D SVG / 3D PNG 真实快照离线生成 + 落盘）可与 5/6 并行，但发布前必须完成。
- 任务 9（总验证：npm test 全绿 + 本地预览滚动 + 降级路径）收尾。

**零回归护栏：** 现有 `test/` 全套（222）保持绿；`renderHomeProbingCarousel` / `homePage` 现有结构不破坏；顶部锁定模板（黑栏 + bundle header + 主导航）零改动。

**真实数据约束（任务 1 已核对，务必遵守，不得伪造）：**
- 1OB5 `visualPreview.reactivity1d` = **48 点**，起于 `F:27 G`。每点字段：`index` / `pdbResidue`（如 `"F:27 G"`）/ `rmdbPosition`（27）/ `rmdbBase`（`G`）/ `reactivityValue`（**连续值，已核对真实范围 -2.5548 ~ 4.0996，含 5 个负值、1 个 >2.5，非归一化**）/ `colorBin`（`low`/`high`）。
- `reactivityValue` 必须**钳制并归一化到 [0,1]** 才能喂色标：`norm = max(0, min(1, value / NORM_CEILING))`（负值→0 冷绿，超界→1 暖橙；`reactivityColor` 自身也再钳一次，双保险）。`NORM_CEILING` 取该案例 reactivity 的稳健上限——本案例 **P95 = 1.71**（build 时算好写进 story.json，渲染端只读不算）。注意 1OB5 有负值与 >2.5 的离群点，故必须用钳制而非裸除法。
- `pairArcs` 是 **segment 级 LSS 统计**（`pairedEvaluable`/`unpairedEvaluable`/`lssStatus`），**不是逐碱基 dot-bracket**。逐碱基 `paired_state` 浏览器资产里没有 → 由任务 8 生成 2D 快照时从离线 dbn（`/Volumes/tianyi/.../dbn/1ob5.dbn`）派生写进 story.json。**1D 着色只依赖归一化 reactivity；paired_state 仅供辅助文案，缺失时省略不报错。**

---

### 任务 1：数据资产 story.json + README（真实 1OB5）

**文件：**
- 创建：`src/assets/generated/home-scroll-story/story.json`
- 创建：`src/assets/generated/home-scroll-story/README.md`

> 本任务无单测（纯数据落盘）。数据从真实 atlas case 资产 `src/assets/generated/annojoin-atlas/cases/RMDB2PDB%3A1OB5.json` 的 `visualPreview.reactivity1d.points` 提取，任务 2 的纯函数测试会读它断言形态。

- [ ] **步骤 1：从真实 case 资产提取 1OB5 的 48 点 reactivity 写 story.json**

用一次性脚本从 `RMDB2PDB%3A1OB5.json` 读 `visualPreview.reactivity1d.points`，按 `index` 升序拼 `sequence`（取 `rmdbBase`）、`reactivity`（取 `reactivityValue`，**原样保留负值与离群点，不预钳制**）、`positions`（取 `rmdbPosition`）。算 `norm_ceiling`=该案例 reactivity 的 **P95**（本案例实测 = **1.71**；若某案例 P95 < 1.0 则截断到 1.0）。写出 `story.json`：

```json
{
  "schemaVersion": 1,
  "version": "2026-06-29",
  "cases": [
    {
      "pdb_id": "1OB5",
      "chain": "F",
      "molecule_label": "tRNA-Phe (yeast)",
      "source_family": "RMDB",
      "confidence_label": "A REFERENCE",
      "profile_id": "data-rna-structures/.../M2PK90_DMS_0000.rdat#8182",
      "norm_ceiling": 1.71,
      "sequence": ["G","A","A","U","G","A", "..."],
      "reactivity": [0, 0, 2.3914, 0, 0.3416, 1.3665, "..."],
      "positions": [27, 28, 29, 30, 31, 32, "..."],
      "paired_state": [],
      "svg_2d": "1ob5-2d.svg",
      "png_3d": "1ob5-3d.png",
      "scenes": [
        {"n": "01", "title": "Probing signal, aligned to a structure",
         "body": "A chemical probing experiment reports how reactive each nucleotide is. FoldBridge aligns that probing-derived sequence to the matching chain in PDB 1OB5, so every reactivity value lands on a real, resolved residue."},
        {"n": "02", "title": "The same residues fold into 2D",
         "body": "Those exact nucleotides — carrying their exact colors — assemble into the secondary structure. High-reactivity residues fall in loops; low-reactivity ones lock into the paired stems of the cloverleaf."},
        {"n": "03", "title": "And collapse into the 3D fold",
         "body": "Finally the cloverleaf folds into the deposited tertiary structure — the classic tRNA L-shape. The reactivity coloring follows all the way into 3D."}
      ]
    }
  ]
}
```

`sequence`/`reactivity`/`positions` 三数组**等长**（48），用真实值；`paired_state` 任务 8 回填（先留空数组）。

- [ ] **步骤 2：写 README.md 记录重生成流程 + 色标单一来源**

```markdown
# Home Scroll Story 资产

主页招牌滚动叙事的策展数据 + 预渲染快照。生成产物入 git。

## 反应性色标（单一权威）
低 0 = 冷绿 #174B3A → 中 0.5 = 金 #E6C260 → 高 1 = 暖橙 #E8743E。
1D 实时着色（src/siteChrome.js:reactivityColor）、2D VARNA、3D molstar **必须**用这同一组三档锚点。
归一化：norm = max(0, min(1, reactivityValue / norm_ceiling))，norm_ceiling 见 story.json（本案例 P95=1.71，负值钳到 0、离群高值钳到 1）。

## 重生成步骤（手动一次性策展）
1. story.json：从 annojoin-atlas/cases/RMDB2PDB%3A<PDB>.json 的 visualPreview.reactivity1d.points 提取。
2. <pdb>-2d.svg：VARNA 离线加载 dbn（/Volumes/tianyi/.../dbn/<pdb_lower>.dbn）+ 上述色标着色 → 导出 SVG；同时把逐碱基 paired_state 回填 story.json。
3. <pdb>-3d.png：molstar 离线加载 CONFIDENCE/.../<pdb_lower>.cif + 上述色标着色 → 截图 PNG。
```

- [ ] **步骤 3：Commit**

```bash
git add src/assets/generated/home-scroll-story/story.json src/assets/generated/home-scroll-story/README.md
git commit -m "feat(home-scroll-story): add curated 1OB5 story data + asset README"
```

---

### 任务 2：色标 + 1D 对齐纯函数（siteChrome）

**文件：**
- 修改：`src/siteChrome.js`（新增 `reactivityColor`、`renderReactivityAlignment`）
- 创建：`test/home-scroll-story.test.js`

- [ ] **步骤 1：编写失败的测试**

`test/home-scroll-story.test.js`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { reactivityColor, renderReactivityAlignment } from '../src/siteChrome.js';

test('reactivityColor maps scale anchors to the single-authority colors', () => {
  assert.equal(reactivityColor(0), 'rgb(23, 75, 58)');     // #174B3A 冷绿
  assert.equal(reactivityColor(1), 'rgb(232, 116, 62)');   // #E8743E 暖橙
  const mid = reactivityColor(0.5);                         // 接近金 #E6C260
  assert.match(mid, /^rgb\(2\d\d, 1\d\d, \d+\)$/);
});

test('reactivityColor clamps out-of-range input', () => {
  assert.equal(reactivityColor(-5), reactivityColor(0));
  assert.equal(reactivityColor(99), reactivityColor(1));
});

test('renderReactivityAlignment emits one colored cell per residue', () => {
  const caseData = { sequence: ['G','A','C'], reactivity: [0, 1.25, 2.5], norm_ceiling: 2.5 };
  const html = renderReactivityAlignment(caseData);
  const cells = html.match(/class="hss-cell"/g) || [];
  assert.equal(cells.length, 3);
  assert.match(html, />G</);
  assert.match(html, /rgb\(23, 75, 58\)/);   // 第一个残基 reactivity 0 → 冷绿
});

test('renderReactivityAlignment handles empty case as placeholder', () => {
  const html = renderReactivityAlignment({ sequence: [], reactivity: [], norm_ceiling: 1 });
  assert.match(html, /hss-alignment/);
  assert.doesNotMatch(html, /class="hss-cell"/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/home-scroll-story.test.js`
预期：FAIL（`reactivityColor` / `renderReactivityAlignment` 未导出）

- [ ] **步骤 3：实现纯函数（追加到 src/siteChrome.js 末尾）**

```js
// 反应性色标（单一权威）：0 冷绿 #174B3A → .5 金 #E6C260 → 1 暖橙 #E8743E。
// 1D 实时着色与 2D/3D 离线快照共用同一组锚点（见 home-scroll-story/README.md）。
const HSS_COLOR_STOPS = [[23, 75, 58], [230, 194, 96], [232, 116, 62]];

export function reactivityColor(norm) {
  const t = Math.max(0, Math.min(1, Number(norm) || 0));
  const [a, b, c] = HSS_COLOR_STOPS;
  let lo, hi, f;
  if (t < 0.5) { lo = a; hi = b; f = t / 0.5; }
  else { lo = b; hi = c; f = (t - 0.5) / 0.5; }
  const mix = lo.map((v, i) => Math.round(v + (hi[i] - v) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

// 1D alignment 态：每个残基一个带色格。无 DOM / 无 window。
export function renderReactivityAlignment(caseData = {}) {
  const seq = Array.isArray(caseData.sequence) ? caseData.sequence : [];
  const react = Array.isArray(caseData.reactivity) ? caseData.reactivity : [];
  const ceiling = Number(caseData.norm_ceiling) || 1;
  const cells = seq.map((base, i) => {
    const norm = Math.min(1, (Number(react[i]) || 0) / ceiling);
    return `<span class="hss-cell" style="background:${reactivityColor(norm)}">${base}</span>`;
  }).join('');
  return `<div class="hss-alignment" role="img" aria-label="Per-residue reactivity">${cells}</div>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/home-scroll-story.test.js`
预期：PASS（4 测试）

- [ ] **步骤 5：Commit**

```bash
git add src/siteChrome.js test/home-scroll-story.test.js
git commit -m "feat(home-scroll-story): reactivity color scale + 1D alignment pure fns"
```

---

### 任务 3：招牌区纯函数 + pickFeaturedCase（siteChrome）

**文件：**
- 修改：`src/siteChrome.js`（新增 `pickFeaturedCase`、`renderHomeScrollStory`）
- 修改：`test/home-scroll-story.test.js`（追加断言）

> `renderHomeScrollStory` 拼整个招牌区：左侧三态层（态0=1D 复用 `renderReactivityAlignment`、态1=`<img>` 引 svg_2d、态2=`<img>` 引 png_3d）+ 右侧三场景文案 + 反应性图例。资产相对基址由调用方注入（与 probing 轮播一致），渲染层只接 `assetBase` 字符串拼 `src`。空输入/缺资产 → placeholder 壳（不含 `.hss-layer.is-active`）。`pickFeaturedCase` 确定性按 visitIndex 取模选案例，空数组→null。

- [ ] **步骤 1：编写失败的测试（追加到 test/home-scroll-story.test.js）**

```js
import { pickFeaturedCase, renderHomeScrollStory } from '../src/siteChrome.js';

const SAMPLE_CASE = {
  pdb_id: '1OB5', chain: 'F', molecule_label: 'tRNA-Phe (yeast)',
  source_family: 'RMDB', confidence_label: 'A REFERENCE',
  norm_ceiling: 2.5, sequence: ['G', 'A', 'C'], reactivity: [0, 1.25, 2.5],
  positions: [27, 28, 29], paired_state: [],
  svg_2d: '1ob5-2d.svg', png_3d: '1ob5-3d.png',
  scenes: [
    { n: '01', title: 'Probing signal, aligned to a structure', body: 'A.' },
    { n: '02', title: 'The same residues fold into 2D', body: 'B.' },
    { n: '03', title: 'And collapse into the 3D fold', body: 'C.' },
  ],
};

test('pickFeaturedCase is deterministic and wraps by visitIndex', () => {
  const cases = [{ pdb_id: 'A' }, { pdb_id: 'B' }];
  assert.equal(pickFeaturedCase(cases, 0).pdb_id, 'A');
  assert.equal(pickFeaturedCase(cases, 1).pdb_id, 'B');
  assert.equal(pickFeaturedCase(cases, 2).pdb_id, 'A');
  assert.equal(pickFeaturedCase(cases, 5).pdb_id, 'B');
});

test('pickFeaturedCase tolerates bad input', () => {
  assert.equal(pickFeaturedCase([], 0), null);
  assert.equal(pickFeaturedCase(null, 0), null);
  assert.equal(pickFeaturedCase([{ pdb_id: 'A' }], NaN).pdb_id, 'A');
});

test('renderHomeScrollStory emits 3 scenes + 3 state layers + legend', () => {
  const html = renderHomeScrollStory(SAMPLE_CASE, { assetBase: './assets/hss' });
  const scenes = html.match(/class="hss-scene"/g) || [];
  const layers = html.match(/class="hss-layer/g) || [];
  assert.equal(scenes.length, 3);
  assert.equal(layers.length, 3);
  assert.match(html, /hss-legend/);
  // 态0 = 1D alignment（含碱基格）
  assert.match(html, /hss-alignment/);
  // 态1 引 svg_2d，态2 引 png_3d（用注入基址）
  assert.match(html, /\.\/assets\/hss\/1ob5-2d\.svg/);
  assert.match(html, /\.\/assets\/hss\/1ob5-3d\.png/);
  // 文案落地
  assert.match(html, /tRNA-Phe \(yeast\)/);
  assert.match(html, /And collapse into the 3D fold/);
  // 默认首态 active
  assert.match(html, /class="hss-layer is-active"/);
});

test('renderHomeScrollStory returns placeholder shell on empty input', () => {
  const html = renderHomeScrollStory(null, { assetBase: './assets/hss' });
  assert.match(html, /hss-placeholder/);
  assert.doesNotMatch(html, /hss-layer is-active/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/home-scroll-story.test.js`
预期：FAIL（`pickFeaturedCase` / `renderHomeScrollStory` 未导出）

- [ ] **步骤 3：实现纯函数（追加到 src/siteChrome.js 末尾）**

```js
// 确定性按访问次序选主角案例。空/非数组 → null；visitIndex 非有限数 → 0。
export function pickFeaturedCase(cases, visitIndex) {
  if (!Array.isArray(cases) || cases.length === 0) return null;
  const idx = Number.isFinite(Number(visitIndex)) ? Math.abs(Math.trunc(Number(visitIndex))) : 0;
  return cases[idx % cases.length];
}

// 招牌滚动叙事区。左侧三态层 + 右侧三场景 + 图例。无 DOM/无 window/无定时器。
// 资产基址由调用方注入（与 probing 轮播一致），渲染层只拼 src。
export function renderHomeScrollStory(caseData, opts = {}) {
  const base = String(opts.assetBase || '.').replace(/\/$/, '');
  if (!caseData || !Array.isArray(caseData.scenes) || caseData.scenes.length === 0) {
    return `<section class="home-scroll-story hss-placeholder" aria-hidden="true"></section>`;
  }
  const meta = `${caseData.molecule_label || ''} · PDB ${caseData.pdb_id || ''} · ${caseData.confidence_label || ''}`;
  const layer0 = `<div class="hss-layer is-active" data-stage="0"><div class="hss-tag">1 · Alignment</div>${renderReactivityAlignment(caseData)}</div>`;
  const layer1 = caseData.svg_2d
    ? `<div class="hss-layer" data-stage="1"><div class="hss-tag">2 · Secondary structure</div><img class="hss-snapshot" src="${base}/${caseData.svg_2d}" alt="${caseData.pdb_id || ''} secondary structure, reactivity-colored" loading="lazy"></div>`
    : `<div class="hss-layer" data-stage="1"><div class="hss-tag">2 · Secondary structure</div><div class="hss-missing">2D snapshot unavailable</div></div>`;
  const layer2 = caseData.png_3d
    ? `<div class="hss-layer" data-stage="2"><div class="hss-tag">3 · Tertiary structure</div><img class="hss-snapshot" src="${base}/${caseData.png_3d}" alt="${caseData.pdb_id || ''} tertiary structure, reactivity-colored" loading="lazy"></div>`
    : `<div class="hss-layer" data-stage="2"><div class="hss-tag">3 · Tertiary structure</div><div class="hss-missing">3D snapshot unavailable</div></div>`;
  const scenes = caseData.scenes.map((s, i) => `
    <div class="hss-scene${i === 0 ? ' is-active' : ''}" data-scene="${i}">
      <div class="hss-scene-num">${s.n || ''}</div>
      <h3 class="hss-scene-title">${s.title || ''}</h3>
      <p class="hss-scene-body">${s.body || ''}</p>
    </div>`).join('');
  const legend = `<div class="hss-legend"><span>low</span><span class="hss-legend-bar"></span><span>high reactivity</span></div>`;
  return `<section class="home-scroll-story" aria-label="From probing signal to 3D fold">
    <div class="hss-grid">
      <div class="hss-sticky"><div class="hss-card"><div class="hss-meta">${meta}</div>${layer0}${layer1}${layer2}${legend}</div></div>
      <div class="hss-scenes">${scenes}</div>
    </div>
  </section>`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/home-scroll-story.test.js`
预期：PASS（8 测试：任务 2 的 4 + 任务 3 的 4）

- [ ] **步骤 5：Commit**

```bash
git add src/siteChrome.js test/home-scroll-story.test.js
git commit -m "feat(home-scroll-story): scroll-story render + featured-case picker"
```

---

### 任务 4：story.json 加载层（homeScrollStoryStore）

**文件：**
- 创建：`src/homeScrollStoryStore.js`
- 修改：`test/home-scroll-story.test.js`（追加 store 断言，注入 fetch）

> 与 `src/probingArticleStore.js` 同构：工厂 `createHomeScrollStoryStore({ assetBase, fetchImpl })`，相对基址 + 内存缓存 + 注入 fetch（可 node 测，无真实网络）。只读 `story.json`。失败抛错由调用方（main.js）兜成 placeholder。

- [ ] **步骤 1：编写失败的测试（追加到 test/home-scroll-story.test.js）**

```js
import { createHomeScrollStoryStore } from '../src/homeScrollStoryStore.js';

test('createHomeScrollStoryStore loads story.json via injected fetch + caches', async () => {
  let calls = 0;
  const fakeStory = { schemaVersion: 1, cases: [{ pdb_id: '1OB5' }] };
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /story\.json$/);
    return { ok: true, json: async () => fakeStory };
  };
  const store = createHomeScrollStoryStore({ assetBase: './assets/hss', fetchImpl });
  const first = await store.loadStory();
  assert.equal(first.cases[0].pdb_id, '1OB5');
  const second = await store.loadStory();
  assert.equal(second, first);     // 同引用 = 命中缓存
  assert.equal(calls, 1);          // 只 fetch 一次
});

test('createHomeScrollStoryStore throws on non-ok response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const store = createHomeScrollStoryStore({ assetBase: './x', fetchImpl });
  await assert.rejects(() => store.loadStory(), /404/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/home-scroll-story.test.js`
预期：FAIL（`createHomeScrollStoryStore` 模块不存在）

- [ ] **步骤 3：实现 store（创建 src/homeScrollStoryStore.js）**

```js
// 浏览器侧 story.json 加载层。与 probingArticleStore 同构：相对基址 + 内存缓存 + 注入 fetch。
const DEFAULT_ASSET_BASE = './src/assets/generated/home-scroll-story';

export function createHomeScrollStoryStore({ assetBase = DEFAULT_ASSET_BASE, fetchImpl } = {}) {
  const base = String(assetBase).replace(/\/$/, '');
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  let cached = null;

  async function loadStory() {
    if (cached) return cached;
    if (!doFetch) throw new Error('home-scroll-story: no fetch implementation available');
    const url = `${base}/story.json`;
    const res = await doFetch(url);
    if (!res || !res.ok) throw new Error(`home-scroll-story: failed to load ${url} (${res ? res.status : 'no response'})`);
    cached = await res.json();
    return cached;
  }

  return { loadStory, assetBase: base };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/home-scroll-story.test.js`
预期：PASS（10 测试）

- [ ] **步骤 5：Commit**

```bash
git add src/homeScrollStoryStore.js test/home-scroll-story.test.js
git commit -m "feat(home-scroll-story): browser story.json load layer with injected fetch"
```

---

### 任务 5：main.js 集成（homePage 挂载 + loadHomeScrollStory + render 守卫）

**文件：**
- 修改：`src/main.js`（import 行 18 扩 siteChrome；新增 store 实例 + state；`homePage()` L1482-1489 插招牌区；新增 `loadHomeScrollStory()` 镜像 `loadProbingArticleIndex` L1918-1928）

> 本任务只接渲染与异步加载，**不绑 observer**（任务 6 做）。模式 100% 镜像 probing 轮播：`homePage()` 已加载就喂数据、未加载触发懒加载；`loadHomeScrollStory()` 完成后带 home 守卫 re-render。无单测（DOM/异步集成层，与轮播一致靠手动预览验证）；护栏靠"现有 222 测试全绿"。

- [ ] **步骤 1：扩 siteChrome import（src/main.js:18）**

```js
import { renderPrimaryNav, renderHomeHero, renderHomeModuleCards, renderHelpBody, renderHomeProbingCarousel, renderHomeScrollStory, pickFeaturedCase } from './siteChrome.js';
```

- [ ] **步骤 2：新增 store import + 实例 + state（src/main.js）**

import 簇（紧挨 L32 `createProbingArticleStore` import 后）：

```js
import { createHomeScrollStoryStore } from './homeScrollStoryStore.js';
```

实例 + state（紧挨 L75 `probingArticleStore` 与 L82 `probingArticleIndexState` 同区）：

```js
const homeScrollStoryStore = createHomeScrollStoryStore();
let homeScrollStoryState = null; // null=未加载, 'loading', 'error', 或 story.json 对象
```

- [ ] **步骤 3：homePage() 插招牌区（src/main.js:1482-1489）**

在 `homePage()` 顶部（紧挨现有 `if (probingArticleIndexState === null) loadProbingArticleIndex();` 块之后）加懒加载触发：

```js
  if (homeScrollStoryState === null) {
    loadHomeScrollStory();
  }
  let scrollStoryHtml = '';
  if (homeScrollStoryState && typeof homeScrollStoryState === 'object') {
    const visitIndex = readHomeScrollVisitIndex();
    const featured = pickFeaturedCase(homeScrollStoryState.cases || [], visitIndex);
    scrollStoryHtml = renderHomeScrollStory(featured, { assetBase: homeScrollStoryStore.assetBase });
  }
```

把 `scrollStoryHtml` 插进返回模板，位置在 hero 之后、probing 轮播之前（对齐规格 §4 主页垂直顺序）：

```js
  return `<main class="page-home bundle-home-page">
    <section class="bundle-home-shell">
      ${bundleHeader}
      ${renderHomeHero()}
      ${scrollStoryHtml}
      ${renderHomeProbingCarousel(articles)}
      ${renderHomeModuleCards()}
    </section>
  </main>`;
```

> `homeScrollStoryState` 仍是 `null`/`'loading'`/`'error'` 时 `scrollStoryHtml=''` → 主页其余模块照常（纯加法担保）。加载完成后由 `loadHomeScrollStory()` 的 home 守卫 re-render 补上。

- [ ] **步骤 4：新增 loadHomeScrollStory + visitIndex 读取（src/main.js，紧挨 loadProbingArticleIndex L1918-1928 之后）**

```js
// 访问计数：每次成功加载招牌 story 自增（localStorage），用于 pickFeaturedCase 轮换。
// 隐私模式 localStorage 抛错 → 退回 0，绝不报错（规格 §8 降级）。
function readHomeScrollVisitIndex() {
  try {
    const raw = globalThis.localStorage?.getItem('fb.hss.visitIndex');
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_err) {
    return 0;
  }
}

function bumpHomeScrollVisitIndex() {
  try {
    const next = readHomeScrollVisitIndex() + 1;
    globalThis.localStorage?.setItem('fb.hss.visitIndex', String(next));
  } catch (_err) {
    /* 隐私模式：忽略 */
  }
}

async function loadHomeScrollStory() {
  if (homeScrollStoryState === 'loading') return;
  homeScrollStoryState = 'loading';
  try {
    homeScrollStoryState = await homeScrollStoryStore.loadStory();
    bumpHomeScrollVisitIndex();
  } catch (err) {
    console.error('[main] 加载主页招牌叙事失败', err);
    homeScrollStoryState = 'error';
  }
  if (route === 'home') render({ preserveScroll: true });
}
```

- [ ] **步骤 5：运行回归测试验证零回归**

运行：`npm test`
预期：现有全套（222）保持绿。本任务无新增测试（DOM 集成层）。

- [ ] **步骤 6：本地预览人工冒烟**

运行：`python3 -m http.server 8765 --directory ~/docs/foldbridge`（或现有预览方式）
打开 `http://localhost:8765/#home` → 招牌区出现在 hero 与 probing 轮播之间，1D 碱基格带色渲染（observer 未接，态切换下一任务）。

- [ ] **步骤 7：Commit**

```bash
git add src/main.js
git commit -m "feat(home-scroll-story): mount scroll-story on home + async story load"
```

---

### 任务 6：main.js 行为层（initHomeScrollStory 幂等 observer）

**文件：**
- 修改：`src/main.js`（新增 `initHomeScrollStory()` 镜像 `initHomeProbingCarousel` L3395-3440 的幂等模式；接进 render 后置 init 簇 L3238 附近；新增 observer 句柄变量）

> 关键坑（规格 §5 单元3）：每次 render 都重跑本函数，**必须先 disconnect 旧 observer 再建新的**（同轮播 setInterval 必须先 clear）。否则 home 会话内反复 render 会叠加多个 observer。`prefers-reduced-motion` 关过渡靠 CSS（任务 7），行为层只切 class。observer 不可 node 测（与现有限制一致）→ 手动预览验证。

- [ ] **步骤 1：新增 observer 句柄变量（src/main.js，紧挨 L84 `homeProbingCarouselTimer` 同区）**

```js
let homeScrollStoryObserver = null; // 招牌区滚动联动 observer（幂等：每次 render 先 disconnect 再建）
```

- [ ] **步骤 2：实现 initHomeScrollStory（src/main.js，紧挨 initHomeProbingCarousel L3440 之后）**

```js
function initHomeScrollStory() {
  // 幂等：每次 render 都会重跑，先 disconnect 旧 observer 再决定是否重建，
  // 否则同一 home 会话内反复 render 会叠加多个 observer（同轮播 setInterval 坑）。
  if (homeScrollStoryObserver) {
    homeScrollStoryObserver.disconnect();
    homeScrollStoryObserver = null;
  }
  const story = document.querySelector('.home-scroll-story');
  if (!story) return; // 非 home / placeholder 壳：清理后返回
  const scenes = Array.from(story.querySelectorAll('.hss-scene'));
  const layers = Array.from(story.querySelectorAll('.hss-layer'));
  if (scenes.length === 0 || layers.length === 0) return;
  if (typeof IntersectionObserver !== 'function') return; // 不支持 → CSS 静态堆叠降级（任务 7）

  const activate = (idx) => {
    scenes.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.scene) === idx));
    layers.forEach((l) => l.classList.toggle('is-active', Number(l.dataset.stage) === idx));
  };

  homeScrollStoryObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) activate(Number(e.target.dataset.scene));
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

  scenes.forEach((s) => homeScrollStoryObserver.observe(s));
}
```

- [ ] **步骤 3：接进 render 后置 init 簇（src/main.js:3238 附近）**

紧挨 `initHomeProbingCarousel();` 之后加：

```js
  initHomeScrollStory();
```

- [ ] **步骤 4：运行回归测试验证零回归**

运行：`npm test`
预期：现有全套（222）+ home-scroll-story（10）保持绿。

- [ ] **步骤 5：本地预览人工验证滚动联动**

打开 `http://localhost:8765/#home` 下滑：右侧场景渐入到中线时，左侧 1D→2D→3D 态层切换，颜色三态连续。反复切路由再回 home 不叠加 observer（DevTools 看态切换不抖）。

- [ ] **步骤 6：Commit**

```bash
git add src/main.js
git commit -m "feat(home-scroll-story): idempotent IntersectionObserver behavior layer"
```

---

### 任务 7：招牌区样式（styles.css）

**文件：**
- 修改：`src/styles.css`（追加 `.home-scroll-story` 区块；复用 design-tokens.css 变量）

> 布局：`.hss-grid` 两列（左 `0.92fr` 钉住 / 右 `1.08fr` 滚动场景）。`.hss-sticky` `position:sticky`。三态层 `.hss-layer` 绝对叠放，`.is-active` 淡入+缩放。图例渐变条用色标三锚点。**降级**：`@media(max-width:820px)` 单列、`position:relative`；无 JS（observer 没接）时所有 `.hss-scene` 默认可见、左侧首态 `.is-active` 保底可读；`prefers-reduced-motion` 关 transition。复用 token：`--surface`/`--border`/`--textSecondary`/`--accent`/`--radiusCard`/`--shadowSoft`。色标三锚点（`#174B3A`/`#E6C260`/`#E8743E`）与 siteChrome `HSS_COLOR_STOPS`、README 单一来源一致——**改色时三处同步**。

- [ ] **步骤 1：追加样式（src/styles.css 末尾）**

```css
/* ===== 主页招牌滚动叙事 home-scroll-story ===== */
.home-scroll-story { max-width: var(--page-max-width); margin: 0 auto; padding: 24px; }
.home-scroll-story.hss-placeholder { display: none; } /* 缺资产 → 不占位，主页其余照常 */
.hss-grid { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 40px; align-items: start; }
.hss-sticky { position: sticky; top: 120px; height: calc(100vh - 160px); min-height: 440px; display: flex; align-items: center; }
.hss-card { position: relative; width: 100%; height: 100%; border-radius: var(--radiusCard);
  background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadowSoft); overflow: hidden; }
.hss-meta { position: absolute; top: 16px; left: 20px; font-size: 11px; color: var(--textSecondary); z-index: 2; }
.hss-tag { position: absolute; top: 16px; right: 20px; font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .5px; }
.hss-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 48px 24px 40px;
  opacity: 0; transform: scale(.97); transition: opacity .6s ease, transform .6s ease; }
.hss-layer.is-active { opacity: 1; transform: scale(1); }
.hss-snapshot { max-width: 100%; max-height: 100%; object-fit: contain; }
.hss-missing { color: var(--textMuted); font-size: 13px; }
.hss-alignment { display: flex; flex-wrap: wrap; gap: 3px; max-width: 380px; }
.hss-cell { width: 21px; height: 26px; border-radius: 5px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; font-family: ui-monospace, monospace; }
.hss-legend { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--textSecondary); }
.hss-legend-bar { width: 120px; height: 8px; border-radius: 6px;
  background: linear-gradient(90deg, #174B3A, #E6C260, #E8743E); }
.hss-scenes { padding: 30px 0 60px; }
.hss-scene { min-height: 78vh; display: flex; flex-direction: column; justify-content: center;
  opacity: .35; transform: translateY(18px); transition: opacity .5s, transform .5s; }
.hss-scene.is-active { opacity: 1; transform: translateY(0); }
.hss-scene-num { font-size: 12px; font-weight: 700; color: var(--accent); letter-spacing: 1px; }
.hss-scene-title { font-size: 30px; margin: 8px 0 0; letter-spacing: -.5px; color: var(--textPrimary); }
.hss-scene-body { font-size: 15.5px; line-height: 1.7; color: var(--textSecondary); margin: 14px 0 0; max-width: 440px; }

@media (max-width: 820px) {
  .hss-grid { grid-template-columns: 1fr; gap: 16px; }
  .hss-sticky { position: relative; top: 0; height: 360px; }
  .hss-scene { min-height: auto; opacity: 1; transform: none; padding: 20px 0; }
}
@media (prefers-reduced-motion: reduce) {
  .hss-layer, .hss-scene { transition: none; }
}
```

- [ ] **步骤 2：本地预览人工验证布局 + 降级**

打开 `http://localhost:8765/#home`：
- 桌面：左钉住、右场景下滑渐入、三态切换、图例渐变。
- 窄屏（DevTools 设 800px）：单列堆叠、不钉住、场景全可见。
- DevTools 勾 `prefers-reduced-motion` → 无淡入淡出过渡，直接切态。
- 临时把 story.json 改坏（或断网）验证 placeholder：招牌区不占位，hero/probing/模块卡照常。

- [ ] **步骤 3：Commit**

```bash
git add src/styles.css
git commit -m "feat(home-scroll-story): sticky-left scroll-right layout + legend + degradation"
```

---

### 任务 8：2D SVG / 3D PNG 真实快照离线生成 + paired_state 回填

**文件：**
- 创建：`src/assets/generated/home-scroll-story/1ob5-2d.svg`
- 创建：`src/assets/generated/home-scroll-story/1ob5-3d.png`
- 修改：`src/assets/generated/home-scroll-story/story.json`（回填 `paired_state`）

> 方案 A 一次性手动策展（规格 §7）。**真实几何 + 真实反应性着色，不得伪造**。色标三锚点与 siteChrome/README 单一来源一致。本任务可与 5/6 并行，但发布前必须完成（否则态1/态2 显示 `.hss-missing` 占位文案，主页不崩但叙事不完整）。

- [ ] **步骤 1：派生 1OB5 逐碱基 dot-bracket + 回填 paired_state**

从离线 dbn `/Volumes/tianyi/tmp/rmdb2pdb_symlinked_assets_20260622/task_packages/confidence_v3_restart_20260613/remote_root/ANNOJOIN/2d_asset_build_20260618/dbn/1ob5.dbn` 读 dot-bracket，按 story.json 的 `positions`（48 点，起于 27）逐位映射 paired/unpaired（`()[]{}<>`=paired，`.-_:,`=unpaired），写回 story.json `paired_state`（与 sequence 等长）。**1D 着色不依赖此字段；仅供 2D 辅助 + 文案。dbn 缺失时跳过留空数组，不阻塞。**

- [ ] **步骤 2：VARNA 离线导出 2D SVG（反应性着色）**

用 VARNA jar（**位于姊妹流水线仓库 `~/docs/rmdb2pdb/tools/varna/VARNAv3-93.jar`，foldbridge 仓库本身无此目录**）离线加载 1OB5 dot-bracket + 上述色标（按钳制归一化 reactivity 给每残基着色，`norm = max(0, min(1, value/1.71))`）→ 导出 `1ob5-2d.svg`。验证：SVG 打开有 cloverleaf 拓扑、着色与 1D 一致（高反应性暖橙落 loop、低反应性冷绿落 stem）。

- [ ] **步骤 3：molstar 离线截图 3D PNG（反应性着色）**

molstar 离线加载 `1ob5.cif`（`CONFIDENCE/10_structure_context/alpha_full_20260615/mmcif_inputs_from_132/1ob5.cif`，从 atlas case 资产 `structureColoring.structureFilePath` 取真实路径）+ 同色标按残基着色 → 截 `1ob5-3d.png`（经典 tRNA L-形，1 个代表角度）。验证：L-形可辨、着色与 1D/2D 连续。

- [ ] **步骤 4：本地预览验证三态连续**

打开 `#home` 下滑：态0 碱基格 → 态1 SVG cloverleaf → 态2 PNG L-形，同一残基颜色三态视觉连续（核心成功标准）。

- [ ] **步骤 5：Commit**

```bash
git add src/assets/generated/home-scroll-story/1ob5-2d.svg src/assets/generated/home-scroll-story/1ob5-3d.png src/assets/generated/home-scroll-story/story.json
git commit -m "feat(home-scroll-story): real 1OB5 2D/3D snapshots + paired_state backfill"
```

---

### 任务 9：总验证（npm test 全绿 + 预览 + 降级）

**文件：** 无（验证任务）

- [ ] **步骤 1：全套测试**

运行：`npm test`
预期：现有 222 + home-scroll-story 10 = 全绿，零回归。

- [ ] **步骤 2：纯函数测试单独跑**

运行：`node --test test/home-scroll-story.test.js`
预期：10 测试全 PASS。

- [ ] **步骤 3：本地预览全路径手动核对（对照规格 §10 验收清单）**

- [ ] 主页下滑可见 1D→2D→3D 三态随滚动切换，颜色连续一致。
- [ ] 左侧钉住、右侧渐入在桌面浏览器正常。
- [ ] 顶部锁定模板（黑栏 + bundle header + 主导航）零改动。
- [ ] 现有主页模块（hero / probing 轮播 / 模块卡）与全站其余页面零回归。
- [ ] 降级：缺资产 → placeholder 不占位主页不崩；窄屏单列；reduced-motion 无过渡；localStorage 失败退回 index 0。
- [ ] 三态快照由真实 1OB5 数据生成，无伪造数据点。
- [ ] README.md 记录重生成流程 + 色标单一来源。

- [ ] **步骤 4：observer 不叠加验证**

反复切路由 `#home → #entry → #home` 多次，DevTools 观察态切换不抖、不叠加（幂等 disconnect 生效）。

- [ ] **步骤 5：最终 Commit（若步骤 3/4 有微调）**

```bash
git add -A
git commit -m "test(home-scroll-story): full verification pass + acceptance checklist"
```

---

## 完成定义 / Definition of Done

- 9 个任务全部勾选完成。
- `npm test` 全绿（222 现有 + 10 新增）。
- 主页招牌区 1D→2D→3D 三态随滚动连续切换，色标三态一致。
- 顶部锁定模板 + 现有主页模块 + 全站其余页面零回归。
- 三态快照来自真实 1OB5 数据，无伪造。
- 所有降级路径手动验证不崩。
- 推送：`git -C ~/docs/foldbridge push origin main:public`（按项目约定推 public 分支）。
