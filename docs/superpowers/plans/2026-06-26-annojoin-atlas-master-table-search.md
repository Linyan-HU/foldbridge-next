# ANNOJOIN Atlas 主表搜索与导览 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 ANNOJOIN Atlas 主表（`#sequence` / `#annojoin-atlas`，3610 个 PDB display 行）支持「打字即过滤、按匹配度排序、有目标时摊平分组」的搜索模式，并保留 RMDB/RASP 来源与 confidence 的视觉编码、补全导览反馈、美化既有分组头与来源侧栏。

**架构：** 在既有双层结构（`annojoinAtlasTableModel.js` 纯逻辑 + `annojoinAtlasView.js` 渲染 + `annojoinAtlasController.js` 绑定 + `main.js` 编排）之上增量增强，不重写。纯逻辑（匹配度排序、family 激活态徽标描述、搜索模式判定）进 model 层并写 node --test 单测；渲染与反馈进 view 层；事件即时化进 controller；URL `q` 参数机制保留不变。视觉全程复用 `theme.js` 暴露的 CSS token。

**技术栈：** 原生 ES module、无框架、node --test、CSS 自定义属性（theme token）。

---

## 现状与规格的偏差（实现前必读）

读码后确认，现状已实现的能力**多于**规格假设，计划据此调整：

1. **搜索框已存在**：`annojoinAtlasView.js:404` `#annojoin-search-input`，绑定 `atlasState.filters.query`。→ 不新建，只增强。
2. **query 过滤逻辑已存在**：`annojoinAtlasData.js:504-527` `filterCases()`，`filters.query` 已对 pdbId / biologicalMoleculeName / pdbMoleculeName / confidenceDisplayLabel 等做**子串**匹配（`includesFolded`，大小写不敏感）。→ 子串匹配已满足，缺的是**匹配度排序**。
3. **计数 meta 已存在**：`annojoinAtlasView.js:418-425`，已显示 `X / Y PDB entries` + source cases + selected。→ 增强为双口径文案 + 搜索态文案。
4. **query 状态走 URL `q` 参数**（`main.js:2135-2137` `setAnnojointAtlasQuery` → `setAnnojointAtlasFilter('q', ...)` 写 hash），**不是**模块作用域。→ **保留现状**（深链可分享优于规格的模块作用域假设；本偏差是有意为之）。
5. **分页在分组之前**：`annojoinAtlasView.js:388-390` 先 `sortAnnojointCases` → `paginateAnnojointRows`(切当前页) → `buildAnnojointTableGroups`(只对当页分组)。→ 搜索模式需绕过分组直接渲染扁平行。
6. **搜索框事件是 change/Enter**：`annojoinAtlasController.js:22-28`。→ 改为 `input` 事件以实现「即时过滤」。

**红线（不可违反）：** 不把 RASP 渲染成已激活正向 confidence；不 truncate molecule name；display 行保持 3610 不退回 4070；不碰主页 Pagefind。

---

## 文件结构

| 文件 | 职责 | 本计划动作 |
|---|---|---|
| `src/annojoinAtlasTableModel.js` | 纯逻辑：列定义、分组、分页、排序、导出行 | 新增 `scoreAnnojointMatch`、`searchAnnojointRows`、`familyBadgeDescriptor`、`isAnnojointSearchActive` 纯函数 |
| `test/annojoin-atlas-table-model.test.js` | model 层单测 | 新增上述函数的测试 |
| `src/annojoinAtlasView.js` | HTML 字符串渲染 | 搜索模式扁平渲染、来源徽标、confidence 分段、双口径计数、chips、空结果、模式提示 |
| `src/annojoinAtlasController.js` | DOM 事件绑定 | 搜索框改 input 事件（防抖）；chip 移除/清除按钮绑定 |
| `src/main.js` | 编排：状态、filters、render | 把 `isSearchActive` 传入 view；chip 清除走 `setAnnojointAtlasFilter` |
| `src/styles.css` | 样式 | 新增搜索控件样式；美化分组头、溢出行、来源侧栏；来源徽标样式（含激活态） |

每个任务产出独立、可测、可 commit 的变更。顺序：先 model 层纯逻辑（含测试）→ 再 view 渲染 → 再 controller 事件 → 再 main 编排 → 最后 CSS 美化 → 收尾验证。

---

## 任务 1：匹配度排序纯函数（model 层）

实现规格块 1 的排序：① PDB 精确 → ② PDB 前缀 → ③ molecule name 子串 → ④ PDB 子串；同级稳定。

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`（在 `paginateAnnojointRows` 后追加）
- 测试：`test/annojoin-atlas-table-model.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `test/annojoin-atlas-table-model.test.js` 顶部 import 追加 `scoreAnnojointMatch, searchAnnojointRows`，并追加：

```javascript
test('scoreAnnojointMatch ranks PDB exact over prefix over molecule substring over PDB substring', () => {
  const exact = { pdbId: '11DG', biologicalMoleculeName: 'x' };
  const prefix = { pdbId: '11DGA', biologicalMoleculeName: 'x' };
  const molSub = { pdbId: 'ZZZZ', biologicalMoleculeName: 'has 11dg inside' };
  const pdbSub = { pdbId: 'A11DGZ', biologicalMoleculeName: 'x' };
  const none = { pdbId: 'ZZZZ', biologicalMoleculeName: 'nothing' };
  assert.ok(scoreAnnojointMatch(exact, '11dg') > scoreAnnojointMatch(prefix, '11dg'));
  assert.ok(scoreAnnojointMatch(prefix, '11dg') > scoreAnnojointMatch(molSub, '11dg'));
  assert.ok(scoreAnnojointMatch(molSub, '11dg') > scoreAnnojointMatch(pdbSub, '11dg'));
  assert.equal(scoreAnnojointMatch(none, '11dg'), 0);
});

test('scoreAnnojointMatch is case and whitespace insensitive', () => {
  const row = { pdbId: '3NKB', biologicalMoleculeName: 'HDV ribozyme' };
  assert.ok(scoreAnnojointMatch(row, '  3nkb ') > 0);
  assert.ok(scoreAnnojointMatch(row, 'HDV') > 0);
});

test('searchAnnojointRows returns matches sorted by score, stable within tier, empty query returns all', () => {
  const rows = [
    { pdbId: 'A11DGZ', biologicalMoleculeName: 'x' },
    { pdbId: '11DG', biologicalMoleculeName: 'x' },
    { pdbId: '11DGA', biologicalMoleculeName: 'x' }
  ];
  const out = searchAnnojointRows(rows, '11dg');
  assert.deepEqual(out.map((r) => r.pdbId), ['11DG', '11DGA', 'A11DGZ']);
  assert.equal(searchAnnojointRows(rows, '').length, 3);
  assert.equal(searchAnnojointRows(rows, 'zzz').length, 0);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- test/annojoin-atlas-table-model.test.js`
预期：FAIL，报 `scoreAnnojointMatch is not a function` / `searchAnnojointRows is not a function`。

- [ ] **步骤 3：编写最少实现代码**

在 `src/annojoinAtlasTableModel.js` 的 `paginateAnnojointRows` 函数之后追加：

```javascript
function foldText(value) {
  return String(value ?? '').trim().toLowerCase();
}

// 匹配度：4=PDB 精确, 3=PDB 前缀, 2=molecule 子串, 1=PDB 子串, 0=无
export function scoreAnnojointMatch(row = {}, query = '') {
  const q = foldText(query);
  if (!q) return 0;
  const pdb = foldText(row.pdbId || row.caseId);
  const mol = foldText(moleculeName(row));
  if (pdb && pdb === q) return 4;
  if (pdb && pdb.startsWith(q)) return 3;
  if (mol && mol.includes(q)) return 2;
  if (pdb && pdb.includes(q)) return 1;
  return 0;
}

export function searchAnnojointRows(rows = [], query = '') {
  const q = foldText(query);
  if (!q) return [...rows];
  return rows
    .map((row, index) => ({ row, index, score: scoreAnnojointMatch(row, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.row);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasTableModel.js test/annojoin-atlas-table-model.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 主表搜索匹配度排序纯函数

新增 scoreAnnojointMatch / searchAnnojointRows，按
PDB 精确>前缀>molecule 子串>PDB 子串 排序，大小写空格不敏感。
EOF
)"
```

---

## 任务 2：搜索模式判定 + family 徽标描述符（model 层）

实现规格块 1（模式判定）与块 2（来源徽标由 family 激活态数据驱动）的纯逻辑。

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`
- 测试：`test/annojoin-atlas-table-model.test.js`

- [ ] **步骤 1：编写失败的测试**

import 追加 `isAnnojointSearchActive, familyBadgeDescriptor`，并追加：

```javascript
test('isAnnojointSearchActive true only when query non-empty after trim', () => {
  assert.equal(isAnnojointSearchActive(''), false);
  assert.equal(isAnnojointSearchActive('   '), false);
  assert.equal(isAnnojointSearchActive('11dg'), true);
});

test('familyBadgeDescriptor marks RASP non-active and RMDB active by default', () => {
  const rmdb = familyBadgeDescriptor('RMDB2PDB');
  assert.equal(rmdb.active, true);
  assert.equal(rmdb.label, 'RMDB');
  const rasp = familyBadgeDescriptor('RASP2PDB');
  assert.equal(rasp.active, false);
  assert.equal(rasp.label, 'RASP');
  assert.equal(rasp.note, 'not active');
});

test('familyBadgeDescriptor respects activation override for future RASP activation', () => {
  const rasp = familyBadgeDescriptor('RASP2PDB', { RASP2PDB: true });
  assert.equal(rasp.active, true);
  assert.equal(rasp.note, '');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- test/annojoin-atlas-table-model.test.js`
预期：FAIL，函数未定义。

- [ ] **步骤 3：编写最少实现代码**

在 model 层追加：

```javascript
export function isAnnojointSearchActive(query = '') {
  return foldText(query).length > 0;
}

// family 激活态默认：RMDB 激活、RASP 未激活（positive_confidence_active_now=false）。
// 将来 RASP 激活后，传入 activationOverride={ RASP2PDB: true } 即可翻转，无需改渲染。
const FAMILY_BADGE_LABELS = { RMDB2PDB: 'RMDB', RASP2PDB: 'RASP' };
const DEFAULT_FAMILY_ACTIVATION = { RMDB2PDB: true, RASP2PDB: false };

export function familyBadgeDescriptor(family = '', activationOverride = {}) {
  const key = String(family || '').trim();
  const label = FAMILY_BADGE_LABELS[key] || key || 'unknown';
  const active = key in activationOverride
    ? Boolean(activationOverride[key])
    : Boolean(DEFAULT_FAMILY_ACTIVATION[key]);
  return { family: key, label, active, note: active ? '' : 'not active' };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasTableModel.js test/annojoin-atlas-table-model.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 搜索模式判定与 family 徽标描述符

新增 isAnnojointSearchActive 与 familyBadgeDescriptor；
徽标激活态数据驱动，RASP 默认 not active，支持未来激活翻转。
EOF
)"
```

---

## 任务 3：搜索模式扁平渲染 + 来源徽标 + confidence 分段（view 层）

实现块 1（搜索模式摊平分组）+ 块 2（行内来源徽标、confidence 分段、合并行钻取保留）。

**文件：**
- 修改：`src/annojoinAtlasView.js`（import、`renderTableBody` 旁新增扁平渲染、`renderAnnojointAtlasPage` 分支、PDB/confidence 单元格呈现）

**实现要点（写代码时遵循）：**
- import 追加 `searchAnnojointRows, isAnnojointSearchActive, familyBadgeDescriptor`。
- `renderAnnojointAtlasPage` 内：先按 `isAnnojointSearchActive(atlasState.filters?.query)` 判定模式。
  - **搜索模式**：`const matched = searchAnnojointRows(sortedRows, query)` → `paginateAnnojointRows(matched, {page, pageSize})` → 渲染**扁平行**（新函数 `renderFlatRows`，复用现有单行单元格逻辑，不分组），并在表上方插入模式提示条。
    - ⚠️ **`renderCaseRow` 当前是 `renderTableBody` 内的闭包**（view 约 125 行），不能直接从 `renderFlatRows` 调用。实现时先把它**提取为 view 模块级函数**（参数化它依赖的列可见性等闭包变量），再让 `renderTableBody` 与 `renderFlatRows` 共用。提取属重构、不改输出，提取后跑步骤 4 测试确认浏览模式渲染未变。
  - **浏览模式**：维持现有 `buildAnnojointTableGroups(pagination.rows)` + `renderTableBody`，不动。
- **来源徽标**：在 PDB 单元格渲染时，对每行依据 `row.sourceFamilies`（合并行）或 `[row.assetFamily]`（单来源）生成徽标。新增 view 内 helper `renderFamilyBadges(row)`，对每个 family 调 `familyBadgeDescriptor`，输出 `<span class="annojoin-family-badge ${active ? 'is-active' : 'is-inactive'}">LABEL</span>`，非激活附 `not active`。徽标在浏览模式与搜索模式、侧栏三处共用此 helper（块 5 一致性护栏）。
- **confidence 分段**：新增 helper `renderConfidenceSegments(label)`，按 `;` 拆 `"RMDB: B/C; RASP: not active"` 为多个 `<span class="annojoin-confidence-seg">`，**保留原文不截断**；无 `;` 时整段输出。
- **合并行钻取**：搜索模式扁平行仍要能点开侧栏——保持现有 `data-annojoin-case-row` / field link 机制，不改 `renderSourceCaseLinks`。
- **空结果**：搜索模式 matched 为空时，渲染块 3 的引导（任务 5 补 chips/计数文案，这里先放占位空状态行 `No entries match "<query>". Check the PDB ID, or try a molecule name.` + 一个 `data-annojoin-clear-search` 按钮）。

- [ ] **步骤 1：手动渲染验证（无 DOM 单测，view 是字符串拼接）**

临时 node 脚本验证扁平渲染分支输出包含徽标与分段（用后即删）：

```bash
node --input-type=module -e '
import { renderAnnojointAtlasPage } from "./src/annojoinAtlasView.js";
const state = { cases: [
  { pdbId:"11DG", atlasCaseKey:"PDB:11DG", caseId:"11DG", biologicalMoleculeName:"HDV ribozyme", confidenceDisplayLabel:"RMDB: B/C; RASP: not active", sourceFamilies:["RMDB2PDB","RASP2PDB"], chains:["A"], profileCount:2, conflictCandidateCount:0 }
], totalCaseCount:1, totalSourceCaseCount:2, filters:{ query:"11dg" } };
const html = renderAnnojointAtlasPage({ state });
console.log("badge:", html.includes("annojoin-family-badge"));
console.log("seg:", html.includes("annojoin-confidence-seg"));
console.log("notactive:", html.includes("not active"));
'
```
预期：三个均为 `true`。

- [ ] **步骤 2：实现代码** — 按上述要点修改 `src/annojoinAtlasView.js`。

- [ ] **步骤 3：重跑步骤 1 脚本验证通过**，删除临时验证（仅命令行，无文件残留）。

- [ ] **步骤 4：跑相关测试确保未回归**

运行：`npm test -- test/annojoin-atlas.test.js test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 搜索模式扁平渲染与来源/confidence 视觉编码

搜索态摊平分组按匹配度渲染；PDB 单元格加 RMDB/RASP 激活态
徽标；confidence 复合标签分段呈现且不截断；保留合并行侧栏钻取。
EOF
)"
```

---

## 任务 4：导览反馈 — 双口径计数 / chips / 模式提示（view 层）

实现块 3 的反馈控件。

**文件：**
- 修改：`src/annojoinAtlasView.js`（`renderAnnojointAtlasPage` 的 meta 区与 toolbar 区）
- 修改：`test/annojoin-atlas.test.js`（更新既有 meta 断言，见步骤 0）

**实现要点：**
- **计数双口径**（替换现 418-425 meta）：
  - 浏览模式：`<N> PDB entries (<M> source cases)`，N=`totalCaseCount`，M=`totalSourceCaseCount`。
  - 搜索模式：`Showing <matched.length> of <totalCaseCount> entries matching "<query>"`。
  - ⚠️ 旧 meta 文案是 `${cases.length} / ${totalCaseCount} PDB entries`（view 行 419）。`test/annojoin-atlas.test.js:328` 现断言 `assert.match(html, /1 \/ 1 PDB entries/)`，本任务替换 meta 后该断言必然失败。**步骤 0 必须先更新该断言**，否则步骤 4 与任务 5/7 的 `npm test` 会变红。
- **活动条件 chips**：search query 非空时渲染一个可移除 chip：`<span class="annojoin-filter-chip">"<query>" <button data-annojoin-chip-remove="q">×</button></span>`，旁附 `<button data-annojoin-clear-all>Clear all</button>`。（rnaFamily/pdbId 等其它 filter 若非空也各成 chip，复用同结构。）
- **模式提示条**：搜索模式在表格上方渲染 `<p class="annojoin-search-mode-note">Search results — grouping is paused. Clear the filter to return to grouped browsing.</p>`。
- **搜索框 placeholder** 改为 `Filter this table by PDB ID or molecule name`（现为 `Search PDB, molecule, confidence...`），明确表内过滤语义。
- **占位 search input 的 value** 仍绑定 `atlasState.filters?.query`。

- [ ] **步骤 0：先更新既有 meta 断言（防止自身测试门变红）**

把 `test/annojoin-atlas.test.js:328` 的：

```javascript
assert.match(html, /1 \/ 1 PDB entries/);
```

改为新双口径文案（该 fixture `totalCaseCount:1` / `totalSourceCaseCount:2`）：

```javascript
assert.match(html, /1 PDB entries \(2 source cases\)/);
```

（行 329 的 `assert.match(html, /2 source cases/)` 作为子串仍成立，保留不动。）此步骤先于实现，确保步骤 4 的 `npm test` 反映的是「新文案通过」而非「旧文案残留」。

- [ ] **步骤 1：手动渲染验证**,atlasCaseKey:"PDB:11DG",caseId:"11DG",biologicalMoleculeName:"x",confidenceDisplayLabel:"RMDB: B/C",sourceFamilies:["RMDB2PDB"],chains:["A"],profileCount:1,conflictCandidateCount:0}], totalCaseCount:3610, totalSourceCaseCount:4070 };
const browse = renderAnnojointAtlasPage({ state:{...base, filters:{query:""}} });
const search = renderAnnojointAtlasPage({ state:{...base, filters:{query:"11dg"}} });
console.log("browseCount:", browse.includes("source cases"));
console.log("searchCount:", search.includes("matching"));
console.log("chip:", search.includes("annojoin-filter-chip"));
console.log("modeNote:", search.includes("annojoin-search-mode-note"));
console.log("placeholder:", browse.includes("Filter this table by PDB ID"));
'
```
预期：五个均为 `true`。

- [ ] **步骤 2：实现代码** — 修改 view。

- [ ] **步骤 3：重跑步骤 1 验证通过。**

- [ ] **步骤 4：跑测试**

运行：`npm test -- test/annojoin-atlas.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js test/annojoin-atlas.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 主表导览反馈控件

双口径计数（display/source）、搜索态匹配计数、可移除筛选 chip、
Clear all、搜索模式提示条；搜索框 placeholder 明确表内过滤语义。
EOF
)"
```

---

## 任务 5：搜索即时化 + chip 移除事件（controller + main 编排）

让搜索框「打字即过滤」，并接通 chips/空结果的清除按钮。

**文件：**
- 修改：`src/annojoinAtlasController.js`（搜索框改 input 防抖；新增 chip/clear 绑定）
- 修改：`src/main.js`（搜索 query 写入改 `history.replaceState` + 直接 `render()`；`render()` 末尾恢复搜索框焦点/光标；`bindAnnojointAtlasTable` 调用处补 clear 回调；`currentAnnojointAtlasState` 搜索态对齐扁平结果——见要点）

**实现要点：**

- **controller 搜索即时化**：把 `change`/`Enter` 改为 `input` 事件 + 防抖（150ms），仍调 `setQuery`。保留 Enter 立即应用（清防抖定时器后立即 `setQuery`）。

- **⚠️ 避免历史污染（blocker 修复）**：现 `setAnnojointAtlasQuery` → `setAnnojointAtlasFilter('q', …)` 用 `window.location.hash = …`（main.js:2132）。**每次防抖击键都写 hash 会向浏览器历史压入一条记录**——打一个词留下多条半截 query 记录，Back 键无法退出表格。修复：为 query 专门走「替换式」写入：
  - 在 `setAnnojointAtlasFilter` 增加可选第三参 `{ replace = false }`；`replace` 为真时，用函数**已经算好的完整 hash 串**（即现有 `next ? \`${routeName}?${next}\` : routeName` 的结果，含 route）调 `history.replaceState(null, '', '#' + composedHash)` 替换当前条目，**不压栈**。⚠️ 不要只把 `params.toString()` 前缀 `#`——那会丢掉 route 变成 `#q=...`。因 `replaceState` 不触发 `hashchange`，需手动 `route = routeFromHash(window.location.hash); render();`。
  - `setAnnojointAtlasQuery(query)` 调 `setAnnojointAtlasFilter('q', query, { replace: true })`。
  - chip 移除 / Clear（非每击键、是单次显式操作）仍走默认 `replace:false`（正常压栈，Back 可回退），保持深链可分享与可回退两不误。

- **⚠️ 恢复焦点/光标（blocker 修复）**：`render()`（main.js:2517）整体替换 `#app.innerHTML`，只恢复滚动（2700-2702），**不恢复焦点**——每次应用 query 都销毁重建 `#annojoin-search-input`，焦点与光标丢失，直接破坏「打字即过滤」。修复：在 `render()` 替换 innerHTML **之前**捕获 `document.activeElement` 的 `id` 与 `selectionStart/selectionEnd`（仅当 id 为 `annojoin-search-input` 时）；替换 **之后**若该 id 仍存在则 `el.focus()` 并还原 `setSelectionRange`。范围最小化：只对该搜索框做，不动其它输入。

- **chip 移除 / clear**：绑定 `[data-annojoin-chip-remove]`（调用新回调 `removeFilter(key)` → `setAnnojointAtlasFilter(key, '')`）、`[data-annojoin-clear-all]` 与 `[data-annojoin-clear-search]`（调用 `clearFilters()` → 跳 `setAnnojointAtlasFilter('q','')` 等）。

- **main.js 状态对齐**：`bindAnnojointAtlasTable(...)` 传入 `removeFilter`、`clearFilters` 回调（基于现有 `setAnnojointAtlasFilter`）。`currentAnnojointAtlasState()` 的 `rows` 在搜索态应等于扁平匹配结果，使「Select All Results」「分页」与扁平视图一致：把 `rows = sortAnnojointCases(...cases)` 之后，按 `isAnnojointSearchActive(filters.query)` 决定是否再过 `searchAnnojointRows`（保持与 view 同源排序）。
  - **import 补全**：main.js 现仅 import `sortAnnojointCases`/`paginateAnnojointRows` 等；本任务需在 import 行追加 `searchAnnojointRows, isAnnojointSearchActive`（来自 `./annojoinAtlasTableModel.js`）。

- **双重过滤说明（与 view 同源）**：`filterCases`（data.js:504-527）已对 query 做**宽字段**子串过滤（含 confidence/parentClass 等），而 `searchAnnojointRows` 只按 pdbId+moleculeName 打分。仅靠宽字段命中的行（如搜 `B/C` 命中 confidence）会通过 `filterCases` 但在搜索态打分 0 而消失，导致「Showing N」少于预期且无解释。本计划遵循规格的窄口径（pdb+molecule）意图：在搜索态 `currentAnnojointAtlasState` 与 view 都**只**以 `searchAnnojointRows` 为准（让 `filterCases` 的 query 仍执行但结果被 `searchAnnojointRows` 收窄，二者口径一致即可，不新增宽字段命中行）。实现时确认 view 与 state 两处排序/过滤同源，避免计数与列表不一致。

- [ ] **步骤 1：手动验证 controller 绑定（jsdom 风格的最小桩）**

```bash
node --input-type=module -e '
import { bindAnnojointAtlasTable } from "./src/annojoinAtlasController.js";
let inputCb;
const fakeInput = { value:"", addEventListener:(t,cb)=>{ if(t==="input") inputCb=cb; } };
const root = { getElementById:(id)=> id==="annojoin-search-input"?fakeInput:null, querySelectorAll:()=>[] };
let q=null;
bindAnnojointAtlasTable({ root, setQuery:(v)=>{q=v;} });
fakeInput.value="11dg"; inputCb && inputCb();
setTimeout(()=>console.log("debouncedQuery:", q), 200);
'
```
预期：约 200ms 后输出 `debouncedQuery: 11dg`。

- [ ] **步骤 2：实现代码** — 修改 controller 与 main（含 `replaceState` 写入与焦点恢复）。

- [ ] **步骤 3：重跑步骤 1 验证通过。**

- [ ] **步骤 3b：人工验证历史与焦点（dev server）**

`npm run dev` 后到 `#sequence`，在搜索框逐字打 `11dg`：
- 光标全程留在输入框、不丢焦点（焦点恢复生效）。
- 打完后按一次浏览器 Back 应直接退出表格态/回到打字前的单一历史点，**而非**逐字符回退（`replaceState` 生效，无逐击键压栈）。
- 点 chip 的 × 或 Clear all 后按 Back 可回到清除前状态（显式操作仍压栈）。

- [ ] **步骤 4：跑全量测试**

运行：`npm test`
预期：全绿（基线 133/133，加任务 1-2 新增用例、任务 4 更新断言后应为 133+ 且无回归）。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasController.js src/main.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 搜索即时化与筛选 chip 清除

搜索框改 input 防抖即时过滤；query 写入改 replaceState 避免
逐击键历史污染并在重渲染后恢复输入框焦点/光标；接通 chip 移除 /
Clear all / 清除空结果；搜索态 rows 对齐扁平匹配结果保证选择与分页一致。
EOF
)"
```

---

## 任务 6：视觉美化（CSS）— 搜索控件 + C/D 分组头与来源侧栏

实现块 4 视觉落地与块 5 的 C/D 美化。**仅改 CSS，不动 HTML/JS。** 全程用 theme token。

**文件：**
- 修改：`src/styles.css`

**实现要点：**
- **来源徽标**（任务 3 产出的 class）：`.annojoin-family-badge.is-active` 用 `--primary`/`--accent` 实心；`.is-inactive` 用透明底 + `--border` 描边 + `--textMuted` 文字 + 小号 `not active`。
- **confidence 分段** `.annojoin-confidence-seg`：行内 pill，间距清晰，RMDB/RASP 段可与徽标同色系。
- **搜索控件**：`#annojoin-search-input` 加宽、focus 态用 `--accent` 描边；`.annojoin-filter-chip` 圆角 pill + 可点 ×；`.annojoin-search-mode-note` 低调提示条（`--surfaceAlt` 底）。
- **分组头美化**（重写现有 `.annojoin-parent-group-row` / `.annojoin-child-group-row` / `.is-expanded-group`，见 styles.css:387-445）：parent 用 `--backgroundStrong` + 加重字重 + 左 `--accent` 竖条；child 缩进 + `--surfaceAlt`；展开/折叠按钮做成统一圆形 toggle，hover/focus 用 token；`N cases` 计数做成小徽标。
- **溢出行** `.annojoin-group-overflow-row`：居中操作条样式。
- **来源侧栏美化**（重写 `.annojoin-detail-sidebar` 及子元素，见 styles.css:449-494）：卡片化 `--surface` + `--radiusPanel` + `--shadowSoft`；header 区清晰；`dl/dt/dd` 对齐 + 行距；侧栏复用 `.annojoin-family-badge`。
- 检查暗色模式（`body[data-mode="dark"]`）下徽标/侧栏对比度可读。

- [ ] **步骤 1：构建前快照** — 记录当前 `npm run build` 通过状态作为基线。

运行：`npm run build`
预期：PASS（Pagefind 索引页面数记录下来）。

- [ ] **步骤 2：实现 CSS** — 修改 `src/styles.css`。

- [ ] **步骤 3：构建验证**

运行：`npm run build`
预期：PASS，页面数与基线一致。

- [ ] **步骤 4：人工视觉确认（dev server）**

运行：`npm run dev -- --host 127.0.0.1 --port 5173`，浏览 `#sequence`：空框看分组头/侧栏美化；输入 `11dg` 看扁平结果、徽标、分段、chips、模式提示；切换暗色模式确认对比度。
（若 dev server 端口占用，按指南用 `lsof -nP -iTCP:5173 -sTCP:LISTEN` 检查。）

- [ ] **步骤 5：Commit**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
style(ANNOJOIN Atlas): 主表搜索控件与 C/D 视觉美化

来源徽标/confidence 分段/搜索控件样式；美化分组头层级与
展开 toggle、溢出操作条、来源侧栏卡片化；复用 theme token 含暗色。
EOF
)"
```

---

## 任务 7：收尾验证

确认整体符合验收标准与红线。

**文件：** 无代码变更（仅运行验证）。

- [ ] **步骤 1：全量测试**

运行：`npm test`
预期：全绿。

- [ ] **步骤 2：Atlas 资产校验**

运行：`npm run verify:annojoin-atlas -- --asset-root src/assets/generated/annojoin-atlas --sample-size 20`
预期：PASS。

- [ ] **步骤 3：构建**

运行：`npm run build`
预期：PASS。

- [ ] **步骤 4：红线核对（人工 + dev server）**

逐项确认：
- [ ] 输入 PDB id / 分子名即时过滤，排序符合优先级，大小写空格不敏感。
- [ ] 空框恢复分组浏览，保留展开/页码（URL `q` 清空）。
- [ ] 搜索行保留 confidence 复合标签原文（未截断）+ RMDB/RASP 徽标，RASP 标 `not active`。
- [ ] 计数双口径正确（3610 entries / 4070 source cases）；chips 可移除；空结果有引导；模式提示可见。
- [ ] 分组头/侧栏/搜索行三处徽标视觉一致。
- [ ] display 行仍 3610 不退回 4070；主页 Pagefind 搜索行为未变；无新色/新字体。

- [ ] **步骤 5：最终 commit（如有收尾微调）**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(ANNOJOIN Atlas): 主表搜索与导览收尾验证

npm test / verify:annojoin-atlas / build 全绿；红线核对通过。
EOF
)"
```

---

## 验收标准（汇总）

- 主表顶部即时过滤框，输入 PDB id 或分子名毫秒级过滤；空框恢复分组浏览。
- 匹配排序：PDB 精确 > 前缀 > molecule 子串 > PDB 子串；大小写/空格不敏感。
- 搜索模式扁平、保留 confidence 复合标签原文 + 来源徽标，区分由 family 激活态数据驱动（RASP 激活后翻转标志即变实心）。
- 双口径计数正确；chips 可移除；空结果引导；模式提示可见。
- C/D 美化仅改 CSS、功能不变；三处来源视觉编码统一。
- `npm test`、`npm run verify:annojoin-atlas`、`npm run build` 全绿。
- 不引入新色/新字体；不改主页 Pagefind；不 truncate molecule name；display 行仍 3610。
