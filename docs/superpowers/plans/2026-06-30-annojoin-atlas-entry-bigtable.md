# ANNOJOIN Atlas entry 页大表化 + Chains RCSB 序列链接 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 ANNOJOIN Atlas entry/总表页从"翻页 + 默认折叠"改为"一整张大表 + 默认全展开 + 组内 5 行预览"，列序互换、Molecule 单元格恒显完整名，并在 Chains 详情面板每条链放一个可折叠的 RCSB 序列外链。

**架构：** 纯前端改动，无数据/构建脚本变更。改动集中在 `src/annojoinAtlasView.js`（渲染）、`src/annojoinAtlasTableModel.js`（列定义）、`src/annojoinAtlasController.js`（事件绑定）、`src/main.js`（路由状态/接线），测试在 `test/annojoin-atlas.test.js`。去翻页 = 管线删 `paginateAnnojointRows`、全量 `baseRows` 直接喂分组与扁平渲染；默认全展开 = 锁定方案 b（`expandedAnnojointGroupIds` 初始化为全集，render 保持"in-set=展开"语义不变）。

**技术栈：** vanilla-JS ES modules、`node --test`（纯渲染函数断言，无 jsdom）、hash 路由、GitHub Pages 静态站。

**关联文档：** spec `docs/superpowers/specs/2026-06-30-annojoin-atlas-entry-bigtable-design.md`。

**通用验证命令：** `cd ~/docs/foldbridge/.worktrees/annojoin-atlas-grouping && node --test test/annojoin-atlas.test.js`（聚焦本套件；全量回归用 `node --test`）。

---

## 任务 1：主表列互换（Molecule name → PDB）

**文件：**
- 修改：`src/annojoinAtlasTableModel.js:3-9`（`ANNOJOIN_TABLE_COLUMNS`）
- 测试：`test/annojoin-atlas.test.js`（新增列序断言）

- [ ] **步骤 1：编写失败的测试**

在 `test/annojoin-atlas.test.js` 末尾追加：

```javascript
test('atlas table puts Molecule name column before PDB column', () => {
  const state = buildAtlasSearchState(fixtures, {});
  const html = renderAnnojointAtlasPage({ state });
  const molIdx = html.indexOf('<th>Molecule name</th>');
  const pdbIdx = html.indexOf('<th>PDB</th>');
  assert.ok(molIdx > -1 && pdbIdx > -1, 'both headers present');
  assert.ok(molIdx < pdbIdx, 'Molecule name header comes before PDB header');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：新测试 FAIL（当前 PDB 在前，`molIdx > pdbIdx`）。

- [ ] **步骤 3：编写最少实现代码**

把 `src/annojoinAtlasTableModel.js:3-9` 改为 `moleculeName` 在前、`pdbId` 在后：

```javascript
export const ANNOJOIN_TABLE_COLUMNS = [
  { id: 'moleculeName', label: 'Molecule name' },
  { id: 'pdbId', label: 'PDB' },
  { id: 'confidenceDisplayLabel', label: 'Confidence distribution' },
  { id: 'profileCount', label: 'Profiles' },
  { id: 'chains', label: 'Chains' }
];
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/annojoin-atlas.test.js`
预期：新列序测试 PASS。其它测试可能因列序变化无影响（断言不依赖列序）。若有红，记录到下一任务处理（预期无）。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasTableModel.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): 主表 Molecule name 列前移到 PDB 列之前"
```

---

## 任务 2：Molecule 单元格恒显完整名（弃用 — 抑制）

**文件：**
- 修改：`src/annojoinAtlasView.js:93-106`（删 `sameGroupLabel` + `moleculeCellLabel`）、`:108-118`（`columnValue.moleculeName`）
- 测试：`test/annojoin-atlas.test.js:265-305`（search-state 测试）、`:656-693`（suppress 测试）

- [ ] **步骤 1：改写失败的测试（翻转断言）**

(a) `test/annojoin-atlas.test.js:303-304` 把 `—` 计数断言改为完整名计数。将：

```javascript
  // Problem 1: both rows render "—" (molecule name equals the group label).
  assert.equal((html.match(/annojoin-molecule-same-as-group/g) || []).length, 2);
```

改为：

```javascript
  // 改版：Molecule 单元格恒显完整名，不再用 "—" 抑制。
  assert.doesNotMatch(html, /annojoin-molecule-same-as-group/);
  assert.ok((html.match(/>16S ribosomal RNA</g) || []).length >= 2);
```

(b) `test/annojoin-atlas.test.js:691-692` 翻转两处断言。将：

```javascript
  assert.match(html, /class="annojoin-molecule-same-as-group"/);
  assert.doesNotMatch(html, /annojoin-field-link[^>]*>\s*<span[^>]*>5S ribosomal RNA<\/span>/);
```

改为：

```javascript
  assert.doesNotMatch(html, /class="annojoin-molecule-same-as-group"/);
  assert.match(html, /annojoin-field-link[^>]*>\s*<span[^>]*>5S ribosomal RNA<\/span>/);
```

并把该 test 名 `'atlas page suppresses molecule name inside a group whose label already shows it'` 改为 `'atlas page always shows the full molecule name inside a group'`。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：上述两个测试 FAIL（当前代码仍渲染 `—`）。

- [ ] **步骤 3：编写最少实现代码**

(a) 删除 `src/annojoinAtlasView.js:93-106` 的 `sameGroupLabel` 与 `moleculeCellLabel` 两个函数（整段）。

(b) 修改 `src/annojoinAtlasView.js:112`（`columnValue` 里 `moleculeName` 行），从：

```javascript
    moleculeName: fieldLink(row, routeName, 'moleculeName', moleculeCellLabel(row, groupLabels)),
```

改为恒显完整名：

```javascript
    moleculeName: fieldLink(row, routeName, 'moleculeName', sourceValue(moleculeName(row), row.biologicalMoleculeNameSource || row.pdbMoleculeNameSource)),
```

注意：`columnValue` 的 `groupLabels` 形参此后可能不再被使用（仅 `moleculeCellLabel` 用过）。保留形参签名不动（`renderCaseRow`/`renderTableBody` 仍传），避免连锁改动；若 lint 报未用参数再处理。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/annojoin-atlas.test.js`
预期：两个翻转测试 PASS。`sameGroupLabel`/`moleculeCellLabel` 已无引用。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): Molecule 单元格恒显完整名，移除 — 抑制逻辑"
```

---

## 任务 3：组内行上限 25 → 5

**文件：**
- 修改：`src/annojoinAtlasView.js:14`（`DEFAULT_GROUP_ROW_LIMIT`）
- 测试：`test/annojoin-atlas.test.js:772-789`（cap 测试）

- [ ] **步骤 1：改写失败的测试**

`test/annojoin-atlas.test.js:786,788` 将 25→5。把：

```javascript
  assert.equal((html.match(/class="annojoin-case-row is-in-expanded-group"/g) || []).length, 25);
  assert.match(html, /data-annojoin-group-page-toggle="parent:Ribosome"/);
  assert.match(html, /Showing 25 of 30 cases in this group/);
```

改为：

```javascript
  assert.equal((html.match(/class="annojoin-case-row is-in-expanded-group"/g) || []).length, 5);
  assert.match(html, /data-annojoin-group-page-toggle="parent:Ribosome"/);
  assert.match(html, /Showing 5 of 30 cases in this group/);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：cap 测试 FAIL（当前渲染 25 行）。

- [ ] **步骤 3：编写最少实现代码**

`src/annojoinAtlasView.js:14`：

```javascript
const DEFAULT_GROUP_ROW_LIMIT = 5;
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/annojoin-atlas.test.js`
预期：cap 测试 PASS（5 行 + "Showing 5 of 30"）。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): 组内行预览上限 25 → 5"
```

---

## 任务 4：Chains 面板每链 <details> + RCSB 序列外链

**文件：**
- 修改：`src/annojoinAtlasView.js:387-403`（`renderChainsPanel`）
- 测试：`test/annojoin-atlas.test.js:844-849`（chains 面板断言）

- [ ] **步骤 1：改写 + 新增失败的测试**

`test/annojoin-atlas.test.js:846-849` 改为：

```javascript
  assert.match(chainsHtml, /class="annojoin-chain-scroll"/);
  assert.match(chainsHtml, /<details class="annojoin-chain-seq"/);
  assert.match(chainsHtml, /href="https:\/\/www\.rcsb\.org\/sequence\/10ZT"/);
  assert.match(chainsHtml, /target="_blank"/);
  assert.match(chainsHtml, /rel="noopener noreferrer"/);
  assert.match(chainsHtml, /View sequence on RCSB/);
  // 删除 "not present" 注脚（断言真实删除文案）
  assert.doesNotMatch(chainsHtml, /Per-chain residue sequences are not present/);
```

（说明：原 L847 `annojoin-chain-list` 断言被替换为 `<details>` 断言；原 L849 打的是不存在的字符串 `Chain sequences are not present...`，改为对准真实删除文案 `Per-chain residue sequences are not present`。）

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：chains 面板测试 FAIL（当前是 `<ol class="annojoin-chain-list">`、无 RCSB 链接、仍有 "Per-chain residue sequences are not present" 文案）。

- [ ] **步骤 3：编写最少实现代码**

把 `src/annojoinAtlasView.js:387-403` 的 `renderChainsPanel` 整段替换为：

```javascript
function renderChainsPanel(row) {
  const chains = Array.isArray(row.chains) ? row.chains.filter(Boolean) : [];
  const count = chains.length;
  const countLabel = `${count} ${count === 1 ? 'chain' : 'chains'} listed`;
  const pdb = encodeURIComponent(String(row.pdbId || rowCaseId(row)).toUpperCase());
  const rcsbHref = `https://www.rcsb.org/sequence/${pdb}`;
  const body = count
    ? chains.map((chain) => `<details class="annojoin-chain-seq">
        <summary>${escapeHtml(chain)}</summary>
        <a class="download-outline-btn" href="${escapeHtml(rcsbHref)}" target="_blank" rel="noopener noreferrer">View sequence on RCSB →</a>
      </details>`).join('')
    : '<p class="mini-note">No PDB chain identifiers are annotated for this case in the current index asset.</p>';
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN chain definitions">
    <p class="technology-kicker">Chain definitions</p>
    <h2>${escapeHtml(countLabel)}</h2>
    <p>Chains are PDB chain identifiers associated with this ANNOJOIN case.</p>
    <div class="annojoin-chain-scroll" role="region" aria-label="PDB chain identifiers" tabindex="0">
      ${body}
    </div>
    <p class="mini-note">Residue sequences open on RCSB (entry-level).</p>
  </aside>`;
}
```

注意：`escapeHtml` / `rowCaseId` 在本文件已 import/定义（`rowCaseId` 来自 tableModel import，L7）。`encodeURIComponent` 防 URL 注入，`escapeHtml` 防属性注入。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/annojoin-atlas.test.js`
预期：chains 面板测试 PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): Chains 面板每链可折叠 + RCSB 序列外链"
```

---

## 任务 5：去翻页 — 大表渲染（view 管线 + 移除 pagination 渲染）

**文件：**
- 修改：`src/annojoinAtlasView.js:1-11`（移除 `paginateAnnojointRows` import）、`:120-136`（删 `renderPagination`）、`:446-494`（renderAnnojointAtlasPage 管线 + 消费点）、`:520`（删 Select Current Page 按钮）、`:531`（删 renderPagination 调用）
- 测试：`test/annojoin-atlas.test.js:581-607`（compact-surface 测试）、`:388-405`（merged-row meta）

- [ ] **步骤 1：改写失败的测试**

(a) `test/annojoin-atlas.test.js:588` 删除 `Select Current Page` 断言行（按钮将移除）：

删掉：`assert.match(html, /Select Current Page/);`

(b) `test/annojoin-atlas.test.js:591-592` 删除翻页 meta 断言：

删掉：
```javascript
  assert.match(html, /Page 1 \/ 2/);
  assert.match(html, /Rows 1-1 of 2/);
```

并在同测试内追加大表断言（确认无 pagination 区块）：
```javascript
  assert.doesNotMatch(html, /class="annojoin-pagination"/);
  assert.doesNotMatch(html, /id="annojoin-page-size"/);
```

注意：该测试 L583 用 `pageSize: 1` 但 fixtures 仅 2 行；去翻页后 `pageSize` 参数被忽略、两行都渲染。原 L597-598 `doesNotMatch parent/child-group-row` 在默认折叠下成立；任务 6 改默认展开后会破坏——**任务 6 会再处理此测试**，本任务先只删翻页相关断言。

(c) `test/annojoin-atlas.test.js:397` 合并行 meta：删除 `assert.match(html, /Rows 1-1 of 1/);`（去翻页后无此文案）。保留同测试其它断言。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：compact-surface / merged-row 测试 FAIL（代码仍渲染 pagination + Select Current Page）。

- [ ] **步骤 3：编写最少实现代码**

(a) `src/annojoinAtlasView.js:1-11` 的 import：移除 `paginateAnnojointRows,` 一行。

(b) 删除 `src/annojoinAtlasView.js:120-136` 整个 `renderPagination` 函数。

(c) `src/annojoinAtlasView.js:469-494` 管线改造。把：

```javascript
  const pagination = paginateAnnojointRows(baseRows, { page, pageSize });
  const groups = searchActive ? [] : buildAnnojointTableGroups(pagination.rows);
```

改为：

```javascript
  const groups = searchActive ? [] : buildAnnojointTableGroups(baseRows);
```

并把后续三处 `pagination.rows` 全部替换为 `baseRows`：
- L476 `searchActive && pagination.rows.length` → `searchActive && baseRows.length`
- L483 `searchActive && !pagination.rows.length` → `searchActive && !baseRows.length`
- L491 `renderFlatRows({ rows: pagination.rows, ... })` → `renderFlatRows({ rows: baseRows, ... })`

(d) 删除 `src/annojoinAtlasView.js:531` 的 `${renderPagination(pagination)}` 行。

(e) 删除 `src/annojoinAtlasView.js:520` 的 Select Current Page 按钮：

删掉：`<button id="select-visible-annojoin-cases" type="button" class="download-outline-btn">Select Current Page</button>`

(f) `renderAnnojointAtlasPage` 形参（L446-459）可保留 `page`/`pageSize` 不删（未使用、不影响），以最小化 diff。若 reviewer 要求清理再删。

(g) 顺带清理 spec §3 改动2 点名的未使用形参 `collapsedGroupIds`（view L450，曾为反转方案预留，本轮不需要）：从 `renderAnnojointAtlasPage` 形参签名删除该行。grep 确认无消费点（`grep -rn collapsedGroupIds src/` 应只命中 L450 定义）。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/annojoin-atlas.test.js`
预期：compact-surface（除将在任务 6 处理的 group-row 断言外）+ merged-row 测试关于 pagination 的部分 PASS。**注意：默认折叠相关测试（L745 / L597-598）此时仍应通过**，因为默认 `expandedGroupIds` 仍是空集（折叠）——任务 6 才翻转。若 compact-surface 因别的原因红，停下排查。

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasView.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): 去翻页，总表渲染全量行（移除 pagination + Select Current Page）"
```

---

## 任务 6：默认全展开（锁定方案 b）+ 清理 controller/main 翻页接线

**文件：**
- 修改：`src/main.js:66-68`（状态）、`:2059-2113`（annojoinAtlasPage 去 page/pageSize）、`:2133-2145`（currentAnnojointAtlasState 去 pagination）、`:2226-2250`（删 setAnnojointAtlasPage/setAnnojointAtlasPageSize）、`:3146-3184`（bind 接线）
- 修改：`src/annojoinAtlasController.js:1-71`（去 setPage/setPageSize/pageRows + Select Current Page 绑定）
- 测试：`test/annojoin-atlas.test.js:745-770`（默认折叠测试翻转）、`:581-607`（compact-surface group-row 断言）

- [ ] **步骤 1：改写失败的测试（翻转默认展开）**

(a) `test/annojoin-atlas.test.js:759-761`（默认态断言）。把：

```javascript
  const collapsedHtml = renderAnnojointAtlasPage({ state });
  assert.match(collapsedHtml, /data-annojoin-group-state="collapsed"/);
  assert.doesNotMatch(collapsedHtml, /data-annojoin-case-row="10ZT"/);
```

改为（默认全展开需显式传全集，模拟 main.js 初始化）：

```javascript
  // 改版：默认全展开。view 仍按 expandedGroupIds 渲染；main.js 初始化为全集。
  const expandedHtml0 = renderAnnojointAtlasPage({ state, expandedGroupIds: new Set(['parent:Ribosome']) });
  assert.match(expandedHtml0, /data-annojoin-group-state="expanded"/);
  assert.match(expandedHtml0, /data-annojoin-case-row="10ZT"/);
```

并把 test 名 `'atlas page defaults foldable groups to collapsed and visually marks expanded groups'` 改为 `'atlas page renders expanded groups when group ids are provided'`。

**保留该测试 L763-769 原有的 `const expandedHtml = ...` 块（`is-expanded-group` 等断言）不动**——它本就显式传 `expandedGroupIds`，与改版语义一致，会继续通过。只替换上面 L759-761 的"默认折叠"三行。

(b) `test/annojoin-atlas.test.js:597-598`（compact-surface）。该测试 `renderAnnojointAtlasPage({ state, ... })` 不传 `expandedGroupIds` → view 内默认空集 → 仍折叠。**view 层默认行为不变（空集=折叠）**；默认全展开是 main.js 的职责（初始化全集）。所以 L597-598 的 `doesNotMatch parent/child-group-row` 断言仍可能成立——但 fixtures 默认 2 行同组，`parent.count > 1` 才渲染 group-row。**先运行看实际结果**：若 fixtures 产生 group-row 则两断言需调整；若不产生则保持。这一步先不动该断言，留步骤 4 验证后决定。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/annojoin-atlas.test.js`
预期：默认折叠测试（改写后）FAIL 或 PASS 取决于是否传 expandedGroupIds——改写后它显式传集合，应在代码不变时即可 PASS（view 行为未变）。**真正要验证的是 main.js 初始化全集的接线**，但 main.js 无单测（纯渲染测试不覆盖 main.js）。因此本任务的测试重点是确保 view 契约不破。

- [ ] **步骤 3：编写实现代码（main.js 默认全展开 + 清理翻页）**

(a) `src/main.js:68` 删除 `let annojoinPageSize = 50;`。

(b) `src/main.js:66` 默认全展开——改为惰性初始化标志。**只新增一行**标志（`expandedAnnojointGroupIds` / `uncappedAnnojointGroupIds` 两个 Set 已在 L66-67 存在，**勿重复声明，否则 `let` 重复声明 → SyntaxError**）。在 L67 之后加：

```javascript
let annojoinGroupsDefaultedExpanded = false;
```

在 `annojoinAtlasPage()`（L2101 之后、return 之前，仅当 index 已就绪时）加一次性默认展开：

```javascript
  const state = buildAtlasSearchState(annojoinAtlasIndexState, filters);
  if (!annojoinGroupsDefaultedExpanded) {
    expandedAnnojointGroupIds = new Set(allAnnojointAtlasGroupIds());
    annojoinGroupsDefaultedExpanded = true;
  }
  return renderAnnojointAtlasPage({
    state,
    routeName,
    selectedCaseIds: selectedAnnojointCaseIds,
    expandedGroupIds: expandedAnnojointGroupIds,
    uncappedGroupIds: uncappedAnnojointGroupIds,
    selectedCaseId,
    selectedCaseKey,
    selectedField
  });
```

（移除该 return 里的 `page`/`pageSize`。loading/error 两个早返回 L2071/L2086 也移除 `page,`/`pageSize,` 两行——它们此时 cases 为空，不需要默认展开。）

(c) `src/main.js:2064-2065` 删除 `const page = ...` 与 `const pageSize = ...` 两行（annojoinAtlasPage 内）。

(d) `src/main.js:2133-2145` `currentAnnojointAtlasState` 去翻页：

```javascript
function currentAnnojointAtlasState() {
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const filters = getAnnojointAtlasFilters(params);
  const sortedRows = sortAnnojointCases(buildAtlasSearchState(currentAnnojointAtlasTables(), filters).cases);
  const rows = isAnnojointSearchActive(filters.query)
    ? searchAnnojointRows(sortedRows, filters.query)
    : sortedRows;
  return { rows };
}
```

（`paginateAnnojointRows` 在 main.js 不再被调用——检查并移除其 import；`pageRows`/`pagination` 字段删除。）

(e) `src/main.js:2226-2250` 删除 `setAnnojointAtlasPage` 与 `setAnnojointAtlasPageSize` 两个函数整段。

(f) `src/main.js:3148-3184` `bindAnnojointAtlasTable` 调用：删除 `pageRows: annojoinState.pageRows,`、`setPage: setAnnojointAtlasPage,`、`setPageSize: setAnnojointAtlasPageSize,` 三行。`expandAllGroups`/`collapseAllGroups` 保留（仍有用）。注意 `collapseAllGroups` 仍清空 `expandedAnnojointGroupIds`，与默认展开不冲突（用户主动折叠）。

(g) `src/annojoinAtlasController.js`：
- 删除参数 `pageRows = []`（L4）、`setPage`（L7）、`setPageSize`（L8）。
- 删除 `[data-annojoin-page]` 绑定块（L51-53）。
- 删除 `#annojoin-page-size` 绑定块（L55-58）。
- 删除 `select-visible-annojoin-cases` 绑定块（L68-71，按钮已在任务 5 移除）。

- [ ] **步骤 4：运行测试验证通过 + 决定 compact-surface 断言**

运行：`node --test test/annojoin-atlas.test.js`
预期：全套件应全绿。若 `compact-surface` L597-598 因 fixtures 现在产生 group-row 而红，则把那两个 `doesNotMatch` 改为对应的存在性断言或删除（视实际渲染）。运行后据实修正。

- [ ] **步骤 5：Commit**

```bash
git add src/main.js src/annojoinAtlasController.js test/annojoin-atlas.test.js
git commit -m "feat(annojoin-atlas): 默认全展开 + 清理翻页状态/接线"
```

---

## 任务 7：全量回归 + 收尾验证

**文件：** 无新增；验证 + 必要修正。

- [ ] **步骤 1：跑聚焦套件**

运行：`node --test test/annojoin-atlas.test.js`
预期：全绿。

- [ ] **步骤 2：跑全量测试回归**

运行：`node --test`
预期：全绿（或仅有与本改动无关的预存失败——若有，确认其在改动前 main 也失败，记录但不修）。

- [ ] **步骤 3：grep 残留死引用**

运行：
```bash
grep -rn "setAnnojointAtlasPage\|annojoinPageSize\|select-visible-annojoin-cases\|renderPagination\|annojoin-molecule-same-as-group\|sameGroupLabel\|moleculeCellLabel\|annojoin-chain-list" src/
```
预期：无匹配（全部已删）。若有残留，清理并补 commit。

**注意：`paginateAnnojointRows` 不要从 grep 期望"无匹配"里要求清零。** 它的定义/导出在 `src/annojoinAtlasTableModel.js:102` 必须**保留**——`test/annojoin-atlas.test.js:13` 仍 import、`:1006` 仍用它（未触及的测试 `'real pipeline groups by chain placement'`）。本计划只移除 view.js/main.js 对它的 import/调用。单独确认 view/main 不再引用：

```bash
grep -rn "paginateAnnojointRows" src/annojoinAtlasView.js src/main.js
```
预期：无匹配（tableModel.js 命中属预期，勿删）。

- [ ] **步骤 4：构建 smoke（确保静态构建不炸）**

运行：`npm run build:static 2>&1 | tail -5`（若该命令在 worktree 可跑）。
预期：构建成功，无新错误。若构建依赖外部资产不可用，跳过并记录原因。

- [ ] **步骤 5：Commit（若步骤 3/4 有修正）**

```bash
git add -A
git commit -m "chore(annojoin-atlas): 清理翻页/抑制残留引用，回归全绿"
```

---

## 完成后

所有任务完成、`node --test` 全绿后，进入 finishing-a-development-branch（merge/PR/清理 worktree）。
