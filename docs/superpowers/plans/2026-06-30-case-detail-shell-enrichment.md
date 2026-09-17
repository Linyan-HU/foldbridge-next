# Case 详情页外壳富化 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把每个 case 详情页 bootstrap JSON 里已内联但从未展示的 confidence 证据（tier 徽章、计分板、可展开证据表）渲染到详情页外壳上，不碰 iframe，跨 2386 页全部生效。

**架构：** 纯增量、数据驱动。`renderEnrichment(bootstrap)` 是 `evidenceRows` 的纯函数，把 viewer 收进单一 `loadEvidence(evidenceId)`/`updateFrame()` 接缝——iframe 是可替换槽位，外壳从不引用它。两套 bundle 的 `case-shell.js` 保持 byte-identical（先在 rmdb 改好，再 `cp` 覆盖 rasp），`case-shell.css` 同理。所有计数/最佳证据本地从 `evidenceRows` 推导，无 fetch、无异步。

**技术栈：** vanilla JS（classic script，非 module）, node --test（纯函数）, 浏览器手动验证（DOM/CSS）

**规格：** `docs/superpowers/specs/2026-06-30-case-detail-shell-enrichment-design.md`

---

## 文件结构 / File structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `public/rmdb-v3/__family_d_site__/case-shell.js` | 提取 `loadEvidence`/`updateFrame` 接缝 + 新增 `renderEnrichment` 及其纯 helper（计数/lookup/格式化）；保持可被 node 测试的纯函数 | 修改（权威副本） |
| `public/rasp-v3/__rasp_v3_site__/case-shell.js` | 与 rmdb 版 byte-identical | `cp` 覆盖 |
| `public/rmdb-v3/__family_d_site__/case-shell.css` | 新增富化样式块（字面值，无 var）：tier 徽章、chips、计分板卡、family 徽标、tier 药丸（6 个 tone 配色）、最佳证据框、可展开表 | 修改（权威副本） |
| `public/rasp-v3/__rasp_v3_site__/case-shell.css` | 与 rmdb 版富化块 byte-identical | 同步编辑 |
| `test/case-shell-enrichment.test.cjs` | 纯 helper 的 node --test 断言（计数聚合、tier/family lookup、数值格式化、最佳证据选择）；`.cjs` 强制 CommonJS，用 `fs.readFileSync`+`vm.runInNewContext` 在无 `document` 沙箱里加载 case-shell.js 取导出 | 创建 |

**关键约束：**
- **本仓库根 `package.json` 是 `"type": "module"`**（已核实），且 `test/` 下所有现有测试都用 ESM `import`（如 `import test from 'node:test'`），无任何 `.cjs`。因此：
  - `case-shell.js` 必须保持 **classic script**（HTML 用 `<script src>` 加载、依赖 `document.currentScript`，不能改成 module，也不能用 `export`——`export` 在 classic script 里是 SyntaxError）。
  - 但 HTML 是 2386 个 case 各自的静态文件（范围外不可编辑），**不能新增第二个 `<script>` 标签**，所以纯 helper 必须**内联在 case-shell.js 里**，不能拆成单独文件让浏览器额外加载。
  - node 直接 `require`/`import` 这个文件都拿不到 helper（type:module 下 `module.exports` 是 no-op，ESM 里又无 `require`），且文件顶层的 DOM 代码会在加载时立刻 `document is not defined` 抛错。
  - **解法（零 public/ 污染）**：① 把所有顶层 DOM/bootstrap 代码包进 `if (typeof document !== "undefined") { … }` 守卫（node 加载时 document 未定义→整块跳过，不抛错；浏览器照常执行）。② 纯 helper 定义在守卫**之外**（顶层函数声明，不引用 DOM）。③ 文件末尾加 `if (typeof module !== "undefined" && module.exports) { module.exports = {…} }`（浏览器 `module` 未定义→`typeof` 返回 `"undefined"` 不抛错、不触发；测试里在 vm 沙箱注入 `module` 后可取到导出）。④ 测试文件命名 **`.cjs`**（`node --test` 会发现 `.cjs`，且 `.cjs` 强制 CommonJS，`require`/`fs`/`vm`/`__dirname` 都可用），用 `fs.readFileSync` 读源码 + `vm.runInNewContext(src, { module:{exports:{}} })`（**不提供 `document`**→DOM 守卫块跳过、末尾导出守卫执行），从 `sandbox.module.exports` 取 helper 断言。这样不需要在 `public/` 下加任何 `package.json`，改动面恰好=规格点名的 4 个文件 + 1 个测试。
- 两套 `case-shell.js` 必须最终 byte-identical：**只编辑 rmdb 版**，rasp 版用 `cp` 覆盖，最后 `diff` 验证为空。
- 富化 CSS 块在两套 `case-shell.css` 里 byte-identical：rmdb 改好后把该块 `cp`/粘贴进 rasp（rasp 文件其余 `:root`/既有规则不动）。用 sentinel 注释标记包住该块（如 `/* FB-ENRICH-START */ … /* FB-ENRICH-END */`），收尾时用 `sed`/awk 抽出两文件该区间 `diff` 验证一致（两文件整体因 `:root` token 名不同**不可**整体 diff）。

**任务顺序：** 任务 1（纯 helper + 测试，TDD）→ 任务 2（接缝重构 loadEvidence/updateFrame/syncUi）→ 任务 3（renderEnrichment DOM 装配 + 挂载）→ 任务 4（同步 rasp case-shell.js + diff）→ 任务 5（CSS 两套）→ 任务 6（浏览器总验证 + commit）。

---

### 任务 1：纯 helper（计数聚合 / lookup / 格式化 / 最佳证据选择）+ node 测试

**文件：**
- 修改：`public/rmdb-v3/__family_d_site__/case-shell.js`（① 把现有顶层 DOM/bootstrap 代码 line 20-82 包进 `if (typeof document !== "undefined") {…}` 守卫；② 在守卫**之外**、顶层新增纯函数；③ 文件末尾加 node 导出守卫）
- 测试：`test/case-shell-enrichment.test.cjs`（创建）

- [ ] **步骤 0：先把顶层 DOM 代码包进 document 守卫**

把现有 `case-shell.js` 的 line 20-82（`const bootstrapNode = …` 到末尾的 `syncUi();`，即顶部 nav-inject IIFE **之后**的全部代码）整体缩进包进：

```js
if (typeof document !== "undefined") {
  // …现有 bootstrap parse / state / chainButtons / evidenceById /
  //   defaultEvidenceForChain / updateFrame / syncUi / 事件绑定 / 调和块 / syncUi() …
}
```

顶部的 nav-inject IIFE（line 1-18）本身已 `try/catch` 且引用 `document.currentScript`，也一并放进守卫内（或保持其自身 try/catch——node 加载时 `document` 未定义会进 catch，无害；为统一，建议也移入守卫）。**注意**：纯 helper（步骤 3 新增）和末尾导出守卫必须在这个 `if` 块**外面**。

- [ ] **步骤 1：编写失败的测试**

创建 `test/case-shell-enrichment.test.cjs`（`.cjs` 后缀，CommonJS）。用 `fs`+`vm` 在**无 `document`** 的沙箱里执行源码——DOM 守卫块整体跳过，只有 helper 定义和末尾 `module.exports` 守卫执行：

```js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(
  __dirname, "..", "public", "rmdb-v3", "__family_d_site__", "case-shell.js"
), "utf8");
const sandbox = { module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(SRC, sandbox);  // no `document` in sandbox → DOM guard skipped

const {
  familyCounts, tierCounts, distinctChains, familyLabel, tierDisplay,
  fmtMetric, fmtP, fmtFraction, pickBestEvidence,
} = sandbox.module.exports;

const ROWS = [
  { family: "A", chain: "A", lssTierCalibrated: "LSS_WEAK", evidenceId: "e1",
    aucDirectional: 0.557105, aucEmpiricalPValue: 0.005994, nEvaluable: 699,
    conflictFraction: 0.230769, directionalMetricKind: "auc_unpaired_vs_paired",
    selectedByDefault: true },
  { family: "A", chain: "A", lssTierCalibrated: "LSS_DISCORDANT", evidenceId: "e2",
    aucDirectional: 0.447859, aucEmpiricalPValue: 0.992008, nEvaluable: 721,
    conflictFraction: 0.285714, directionalMetricKind: "auc_unpaired_vs_paired",
    selectedByDefault: false },
  { family: "D", chain: "A", lssTierCalibrated: "LSS_DISCORDANT", evidenceId: "e3",
    aucDirectional: -0.012703, aucEmpiricalPValue: 0.547453, nEvaluable: 194,
    conflictFraction: null, directionalMetricKind: "spearman_rho",
    selectedByDefault: false },
];

test("familyCounts aggregates distinct families", () => {
  assert.deepStrictEqual(familyCounts(ROWS), { A: 2, D: 1 });
});

test("tierCounts aggregates calibrated tiers", () => {
  assert.deepStrictEqual(tierCounts(ROWS),
    { LSS_WEAK: 1, LSS_DISCORDANT: 2 });
});

test("distinctChains counts unique chains", () => {
  assert.strictEqual(distinctChains(ROWS), 1);
});

test("familyLabel maps known + falls back to bare letter", () => {
  assert.strictEqual(familyLabel("A"), "WC-face base-specific");
  assert.strictEqual(familyLabel("Z"), "Z");
});

test("tierDisplay maps known token", () => {
  const w = tierDisplay("LSS_WEAK");
  assert.strictEqual(w.label, "WEAK");
  assert.strictEqual(w.tone, "weak");
  assert.match(w.meaning, /directional but not yet self-contained/i);
});

test("tierDisplay unknown token strips LSS_ and uses not-supported tone, empty meaning", () => {
  const u = tierDisplay("LSS_FUTURE_TIER");
  assert.strictEqual(u.label, "FUTURE TIER");
  assert.strictEqual(u.tone, "not-supported");
  assert.strictEqual(u.meaning, "");
});

test("fmtMetric 2dp signed for spearman, fmtP 3dp, fmtFraction handles null", () => {
  assert.strictEqual(fmtMetric(0.557105), "0.56");
  assert.strictEqual(fmtMetric(-0.012703), "-0.01");
  assert.strictEqual(fmtP(0.005994), "0.006");
  assert.strictEqual(fmtFraction(null), "—");
  assert.strictEqual(fmtFraction(0.230769), "0.23");
});

test("pickBestEvidence: defaultEvidenceId > selectedByDefault > first", () => {
  assert.strictEqual(pickBestEvidence(ROWS, "e2").evidenceId, "e2");
  assert.strictEqual(pickBestEvidence(ROWS, "nope").evidenceId, "e1"); // selectedByDefault
  const noFlag = ROWS.map((r) => ({ ...r, selectedByDefault: false }));
  assert.strictEqual(pickBestEvidence(noFlag, "nope").evidenceId, "e1"); // first
  assert.strictEqual(pickBestEvidence([], "x"), null);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/case-shell-enrichment.test.cjs`
预期：FAIL（步骤 0 已包好 DOM 守卫，vm 执行不再抛 `document is not defined`；但 helper 与末尾导出守卫尚未写 → `sandbox.module.exports` 为空 → 解构出的 `familyCounts` 等全为 `undefined` → `TypeError: familyCounts is not a function`）。

- [ ] **步骤 3：编写最少实现**

在 `case-shell.js` 中，**`if (typeof document !== "undefined") {…}` 守卫块之外**（顶层，建议放在文件靠后、紧邻末尾导出守卫之前），新增以下纯函数（不依赖 DOM、不依赖 `bootstrap`/`state` 闭包，全部入参显式）：

```js
const FAMILY_LABELS = {
  A: "WC-face base-specific",
  B: "SHAPE flexibility",
  C: "enzymatic",
  D: "SASA solvent access",
  E: "contact-map",
  F: "pair-set",
};

const TIER_DISPLAY = {
  LSS_STRONG_CALIBRATED: { label: "STRONG", tone: "strong",
    meaning: "Directional signal clears the bar and passes all secondary gates (self-containment, conflict, size) under permutation." },
  LSS_MODERATE_CANDIDATE: { label: "MODERATE", tone: "moderate",
    meaning: "Directional signal is supported but calibration is pending, so it is held below STRONG." },
  LSS_WEAK: { label: "WEAK", tone: "weak",
    meaning: "Directional signal clears the bar but a secondary gate (self-containment / conflict / size) does not — directional but not yet self-contained." },
  LSS_NOT_SUPPORTED: { label: "NOT SUPPORTED", tone: "not-supported",
    meaning: "Signal does not clear the bar / is not better than chance under permutation." },
  LSS_DISCORDANT: { label: "DISCORDANT", tone: "discordant",
    meaning: "Signal runs counter to the structure (negative / conflicting), not merely absent." },
  LSS_UNDERPOWERED: { label: "UNDERPOWERED", tone: "underpowered",
    meaning: "Too few evaluable residues (or too few paired/unpaired) to judge." },
};

function familyCounts(rows) {
  const out = {};
  for (const r of rows) { const f = r.family || ""; out[f] = (out[f] || 0) + 1; }
  return out;
}

function tierCounts(rows) {
  const out = {};
  for (const r of rows) {
    const t = r.lssTierCalibrated || "";
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function distinctChains(rows) {
  return new Set(rows.map((r) => r.chain).filter(Boolean)).size;
}

function familyLabel(family) {
  return FAMILY_LABELS[family] || String(family);
}

function tierDisplay(token) {
  if (TIER_DISPLAY[token]) return TIER_DISPLAY[token];
  const bare = String(token || "").replace(/^LSS_/, "").replace(/_/g, " ");
  return { label: bare, tone: "not-supported", meaning: "" };
}

function fmtMetric(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(2);
}

function fmtP(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(3);
}

function fmtFraction(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(2);
}

function pickBestEvidence(rows, defaultEvidenceId) {
  if (!rows || rows.length === 0) return null;
  const byId = rows.find((r) => r.evidenceId === defaultEvidenceId);
  if (byId) return byId;
  const flagged = rows.find((r) => r.selectedByDefault === true);
  if (flagged) return flagged;
  return rows[0];
}
```

在**文件末尾**（同样在 DOM 守卫块**之外**）加 node 测试导出守卫（浏览器无 `module`，`typeof module` 返回 `"undefined"` 不抛错、不触发；vm 沙箱里注入了 `module` 故执行）：

```js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    familyCounts, tierCounts, distinctChains, familyLabel, tierDisplay,
    fmtMetric, fmtP, fmtFraction, pickBestEvidence,
  };
}
```

注意：`typeof module` 对未声明标识符返回 `"undefined"` 而不抛错，故浏览器 classic-script 加载安全；本仓库 `"type": "module"`，所以即便 node 直接 `import` 此文件该守卫也不会真导出——这正是测试改用 vm 沙箱注入 `module` 的原因。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/case-shell-enrichment.test.cjs`
预期：PASS（8 个测试全绿）。

- [ ] **步骤 5：Commit**

```bash
git add test/case-shell-enrichment.test.cjs public/rmdb-v3/__family_d_site__/case-shell.js
git commit -m "feat(detail-page): pure helpers for case-shell enrichment (counts/lookup/format)"
```

---

### 任务 2：viewer 接缝重构（loadEvidence / updateFrame / syncUi）

把 viewer 收进单一接缝，且让 `syncUi()` 也负责证据表高亮。**仅重构，浏览器行为对单链 case 字节等价。**

**文件：**
- 修改：`public/rmdb-v3/__family_d_site__/case-shell.js`（现有 `updateFrame`/`syncUi`/chain-button handler 区域）

- [ ] **步骤 1：新增 loadEvidence，保留 updateFrame 为唯一引用 iframe 处**

在现有 `updateFrame()` 之后新增 `loadEvidence`（**注意：此函数引用 `state`/`bootstrap`/`syncUi`，必须放在任务 1 步骤 0 的 `if (typeof document !== "undefined") {…}` 守卫块内部**，和 `updateFrame`/`syncUi` 同级）：

```js
function loadEvidence(evidenceId) {
  state.selectedEvidenceId = evidenceId;
  const chainId = bootstrap.evidenceChainMap[evidenceId];
  if (chainId && chainId !== state.activeChainId) {
    state.activeChainId = chainId;
  }
  syncUi();
}
```

`updateFrame()` 保持现状（仍是唯一设 `frame.src` + `chainStatus.textContent` 的地方，即未来换 iframe 的唯一改点）。

- [ ] **步骤 2：扩展 syncUi 同步证据表高亮**

在 `syncUi()` 末尾（`updateFrame()` 调用之后）加一行刷新表高亮的调用（该函数在任务 3 定义；此处先留调用，任务 3 补实现，或任务 3 完成后回填）。为避免顺序耦合，本步用可选链守卫：

```js
function syncUi() {
  for (const button of chainButtons) {
    button.classList.toggle("is-active", button.dataset.chainId === state.activeChainId);
  }
  updateFrame();
  if (typeof refreshEvidenceHighlight === "function") {
    refreshEvidenceHighlight(state.selectedEvidenceId);
  }
}
```

- [ ] **步骤 3：node --test 回归（确保未破坏纯 helper）**

运行：`node --test test/case-shell-enrichment.test.cjs`
预期：PASS（重构不影响纯 helper；`node --check` 见步骤 4）。

- [ ] **步骤 4：语法检查**

运行：`node --check public/rmdb-v3/__family_d_site__/case-shell.js`
预期：无输出（语法合法）。

- [ ] **步骤 5：Commit**

```bash
git add public/rmdb-v3/__family_d_site__/case-shell.js
git commit -m "refactor(detail-page): extract loadEvidence seam; syncUi drives table highlight"
```

---

### 任务 3：renderEnrichment DOM 装配 + 挂载 + .meta 原地替换

**文件：**
- 修改：`public/rmdb-v3/__family_d_site__/case-shell.js`

- [ ] **步骤 1：新增 DOM 辅助 + renderEnrichment + refreshEvidenceHighlight**

新增 DOM 装配（用 `textContent`/`createElement`，绝不 innerHTML 注入数据）。**这些函数（`el`/`renderEnrichment`/`refreshEvidenceHighlight`）都引用 `document`，必须放在任务 1 步骤 0 的 `if (typeof document !== "undefined") {…}` 守卫块内部**（与 `updateFrame`/`syncUi`/`loadEvidence` 同级；纯 helper 仍在守卫外）。要点：
- 建一个小工具 `el(tag, className, text)`。
- **Hero 增强**：取 `best = pickBestEvidence(rows, bootstrap.defaultEvidenceId)`；在 `.hero` 里（subtitle `<p>` 之后）插入 tier 徽章 `<span class="fb-tier-badge tone-<tone>">`，文本 `${best.family} · ${tierDisplay(best.lssTierCalibrated).label}`。
- **原地替换 `.meta`**：取 `metaNode = document.querySelector(".hero .meta")`；若存在，`metaNode.replaceChildren()` 清空，再 append 三个 `.chip`：`chains ${distinctChains(rows)}`、`profiles ${rows.length}`、`families ${sortedFamilies join "·"}`。**families 必须排序后再 join**——`familyCounts(rows)` 的 key 按首次出现顺序排列，10FZ 真实数据首现顺序是 `A·D·B`；用 `Object.keys(familyCounts(rows)).sort()` 得到 `A·B·D`，与静态 chip 一致、与任务 6 断言一致。（不重建静态 source/default-chain chip，符合规格取舍。）
- **计分板卡**：family 徽标（遍历 `Object.keys(familyCounts(rows)).sort()` → `${f} · ${familyLabel(f)} ×${n}`，**同样排序**）；tier 药丸（`tierCounts` → `${tierDisplay(t).label} ${n}`，class 带 `tone-<tone>`）；最佳证据框（technology / `directionalMetricLabel` + `fmtMetric` / `fmtP` / nEvaluable / tier label + meaning）。
- **可展开表**：`<details>`（默认收起）→ `<table>`，每行 Family/Technology/Tier/metric/p/n/profile；行 `addEventListener("click", () => loadEvidence(row.evidenceId))`；行带 `data-evidence-id`。表行顺序按 `evidenceRows` 原始顺序即可。
- `refreshEvidenceHighlight(selectedId)`：遍历表行，`toggle("is-active", tr.dataset.evidenceId === selectedId)`。
- `renderEnrichment(bootstrap)`：`rows = bootstrap.evidenceRows`；空/缺则直接 return（静态 hero 不动）；否则装配上述节点，把计分板+表组成的容器 `insertBefore` 到 `.layout` 之前。

（完整代码在实现时落地；本计划锁定结构与函数边界。所有取值字段名以规格 §Verified baseline facts 的 evidenceRows key 为准。）

- [ ] **步骤 2：在 bootstrap 流程末尾调用 renderEnrichment**

在 DOM 守卫块内、现有 `syncUi();`（首次渲染）**之前**插入 `renderEnrichment(bootstrap);`，使表 DOM 在首个 `syncUi()`→`refreshEvidenceHighlight` 之前已存在。

- [ ] **步骤 3：语法检查 + 纯 helper 回归**

运行：`node --check public/rmdb-v3/__family_d_site__/case-shell.js`
预期：无输出。
运行：`node --test test/case-shell-enrichment.test.cjs`
预期：PASS（导出的纯 helper 未受 DOM 代码影响）。

- [ ] **步骤 4：Commit**

```bash
git add public/rmdb-v3/__family_d_site__/case-shell.js
git commit -m "feat(detail-page): renderEnrichment (hero badge/scoreboard/evidence table)"
```

---

### 任务 4：同步 rasp case-shell.js 并验证 byte-identical

**文件：**
- 覆盖：`public/rasp-v3/__rasp_v3_site__/case-shell.js`

- [ ] **步骤 1：cp 覆盖**

运行：`cp public/rmdb-v3/__family_d_site__/case-shell.js public/rasp-v3/__rasp_v3_site__/case-shell.js`

- [ ] **步骤 2：diff 验证为空**

运行：`diff public/rmdb-v3/__family_d_site__/case-shell.js public/rasp-v3/__rasp_v3_site__/case-shell.js`
预期：无输出（byte-identical）。

- [ ] **步骤 3：rasp 侧语法检查**

运行：`node --check public/rasp-v3/__rasp_v3_site__/case-shell.js`
预期：无输出。

- [ ] **步骤 4：Commit**

```bash
git add public/rasp-v3/__rasp_v3_site__/case-shell.js
git commit -m "feat(detail-page): sync rasp case-shell.js byte-identical with rmdb"
```

---

### 任务 5：富化 CSS 块（两套 byte-identical）

**文件：**
- 修改：`public/rmdb-v3/__family_d_site__/case-shell.css`（权威）
- 修改：`public/rasp-v3/__rasp_v3_site__/case-shell.css`（同块）

- [ ] **步骤 1：在 rmdb case-shell.css 末尾追加富化块**

字面值、无 `var(--…)`。**用 sentinel 注释包住整块**：以 `/* FB-ENRICH-START */` 开头、`/* FB-ENRICH-END */` 结尾（步骤 3 据此抽块比对）。覆盖 selector：`.fb-tier-badge` + `.fb-tier-badge.tone-*`（6 tone），`.hero .meta .chip`（已有则不重复定义冲突项），`.fb-scoreboard`（卡），`.fb-fam`（family 徽标），`.fb-tpill` + `.fb-tpill.tone-*`（6 tone），`.fb-best`（最佳证据框），`.fb-evtable details/summary/table/tr.is-active`。配色沿用暖奶油+绿（参考已落地的 `.fb-detail-nav` / 原型 mockup 的 tone 取色：weak 金 `#9a7611`/`#fff4d6`，discordant 红 `#b3322f`/`#fdecec`，not-supported 灰 `#5d6c64`/`#f1f2f3`，strong 绿 `#1f8f52`/`#eafaf0`，moderate 蓝绿，underpowered 浅灰）。响应式：chips/pills `flex-wrap`，表 `overflow-x:auto`。

- [ ] **步骤 2：把同一块同步进 rasp case-shell.css**

把步骤 1 追加的整块（含 sentinel 注释）原样粘贴到 `public/rasp-v3/__rasp_v3_site__/case-shell.css` 末尾（rasp 其余 `:root`/既有内容不动）。

- [ ] **步骤 3：验证两块一致（sentinel 区间 diff）**

两文件整体因 `:root` token 名不同**不可**整体 `diff`。改为只比对 sentinel 区间：

运行：`diff <(sed -n '/FB-ENRICH-START/,/FB-ENRICH-END/p' public/rmdb-v3/__family_d_site__/case-shell.css) <(sed -n '/FB-ENRICH-START/,/FB-ENRICH-END/p' public/rasp-v3/__rasp_v3_site__/case-shell.css)`
预期：无输出（富化块 byte-identical）。

- [ ] **步骤 4：Commit**

```bash
git add public/rmdb-v3/__family_d_site__/case-shell.css public/rasp-v3/__rasp_v3_site__/case-shell.css
git commit -m "feat(detail-page): enrichment CSS block (tier tones/scoreboard/table) in both bundles"
```

---

### 任务 6：浏览器总验证

**文件：** 无（验证 + 收尾）

- [ ] **步骤 1：起本地静态服务器**

运行（repo 根）：`python3 -m http.server 8099`（后台）。

- [ ] **步骤 2：验证密集 RASP case**

浏览器开 `http://localhost:8099/public/rasp-v3/cases/RASP2PDB%3A10FZ/index.html`。核对：
- hero tier 徽章 = `A · WEAK`；`.meta` chips 显示 chains 1 / profiles 31 / families A·B·D，**families/chains 不重复**（静态 chip 已被原地替换）。
- 计分板 family 徽标 A×13 / B×14 / D×4；tier 药丸 DISCORDANT 8 / NOT SUPPORTED 22 / WEAK 1（计数与 evidenceRows 一致）。
- 最佳证据框匹配默认行（DMS-seq / AUC unpaired vs paired 0.56 / p 0.006 / n 699 / WEAK + meaning）。
- 展开表列出 31 行；点某行 → iframe src 变化 + 该行高亮；Family D 行 metric 显示带符号（如 -0.01），conflict 显示 `—` 不是 NaN。
- 控制台无报错。

- [ ] **步骤 3：验证单行 RMDB case**

开一个 rmdb case（`ls public/rmdb-v3/cases | head -1` 取名，如 `RMDB2PDB%3A10ZT`）。核对：单 family、单 tier 徽章正确，表 1 行，无报错。

- [ ] **步骤 4：关服务器 + 全量 node 测试**

关闭 http.server。运行：`node --test test/case-shell-enrichment.test.cjs`
预期：PASS。

- [ ] **步骤 5：最终一致性检查**

运行：`diff public/rmdb-v3/__family_d_site__/case-shell.js public/rasp-v3/__rasp_v3_site__/case-shell.js`
预期：无输出。

（若需 commit 收尾说明则 commit；代码改动已在各任务分别 commit。）

---

## 验证清单（完成定义）

- [ ] `node --test test/case-shell-enrichment.test.cjs` 全绿
- [ ] 两套 `case-shell.js` `diff` 为空
- [ ] `node --check` 两套 `case-shell.js` 均通过
- [ ] RASP 10FZ：徽章/chips/计分板/最佳证据/表/行点击/高亮/Spearman 符号/null→— 全部正确，控制台无报错
- [ ] RMDB 单行 case 正常降级
- [ ] 富化 CSS 块两套一致
- [ ] iframe 未被改动；外壳不引用 iframe（仅 `updateFrame` 引用）
