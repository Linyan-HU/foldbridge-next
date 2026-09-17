# ANNOJOIN Atlas 总表按 chain 生物学身份聚合 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 ANNOJOIN Atlas 总表分组从 case 级自由文本标签（`parentClassLabel`/`childClassLabel`）切换到 chain 级生物学身份三层树（`parent_rna_class` → 折叠后规范 name → PDB），彻底移除导致反复重来的 case 级分类噪声逻辑。

**架构：** build 侧 `buildAtlasIndexAsset` 新增 `chainIdentityIndex` 入参，给每个 displayCase 派生去重排序好的 `chainPlacements=[{classLabel,nameLabel}]` 字段写进 index；浏览器 data 层 `normalizeCase` 透传该字段；表模型 `buildAnnojointTableGroups` 改为遍历 `chainPlacements` 把 case 扇出到多个 class→name 分支（多身份 case 出现在多分支），`sortAnnojointCases` 按主 placement 排序保证逐页分组确定且同 case 不被分页拆散。真实渲染路径是 table model 逐页分组（非死代码 `buildCaseHierarchy`），三层折叠 UI 已存在。计数双显 `totalCaseCount`（distinct PDB）· `totalPlacementCount`（placement 之和）。

**技术栈：** vanilla-JS 静态站（无框架/无打包器），ES modules，`node --test`（纯渲染函数直接测，无 jsdom），Node mjs build 脚本（`scripts/lib/annojoin-atlas-*.mjs`）。

**关联文档：**
- 设计 spec：`docs/superpowers/specs/2026-06-29-annojoin-atlas-chain-identity-grouping-design.md`
- 前序设计：`docs/superpowers/specs/2026-06-26-annojoin-atlas-master-table-search-design.md`、`2026-06-29-annojoin-atlas-index-slim-fast-rebuild-design.md`

**关键依赖顺序（务必遵守）：**
- 任务 1-4（build 侧 chainPlacements 派生与瘦身保留）先行，因为它产出浏览器层消费的字段。
- **任务 5（删 build 侧死代码 + 迁移 corpus 测试）必须作为一个整体落地**：删源码与改测试同一 commit，否则测试套件红。计划已把删除与测试迁移合并进同一任务的连续步骤。
- 浏览器层（任务 6-11）依赖任务 1 的 `chainPlacements` 字段已进 index。
- 视图与验证（任务 12-16）最后做。
- 最终 commit + push（任务 16）兑现用户 "推进完成 commit" 意图。

**测试命令基线：** `node --test`（在 `~/docs/foldbridge` 下运行）。push：`git -C ~/docs/foldbridge push origin main:public`。

---

## 阶段 A：build 侧 chainPlacements 派生

### 任务 1：派生 chainPlacements + totalPlacementCount（`buildAtlasIndexAsset`）

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`（`buildAtlasIndexAsset` L927-985；新增 `buildChainPlacements` helper）
- 测试：`test/annojoin-atlas-corpus.test.js`

chain index 形如 `Map<pdbIdUpper, ChainIdentity[]>`，每个 ChainIdentity 有 `rnaClass`（= `parent_rna_class`，干净受控词表）和 `displayName`（已折叠的规范名）。displayCase 有 `pdbId`、`moleculeDisplayName`。

- [ ] **步骤 1：编写失败的测试**

```js
// test/annojoin-atlas-corpus.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasIndexAsset } from '../scripts/lib/annojoin-atlas-corpus.mjs';

test('buildAtlasIndexAsset derives deduped sorted chainPlacements per displayCase', () => {
  const chainIdentityIndex = new Map([
    ['4V99', [
      { rnaClass: 'rRNA', displayName: '16S ribosomal RNA' },
      { rnaClass: 'rRNA', displayName: '16S ribosomal RNA' }, // dup -> collapse
      { rnaClass: 'tRNA', displayName: 'tRNA-Lys' }
    ]]
  ]);
  const index = buildAtlasIndexAsset({
    cases: [{ case_id: 'c1', pdb_id: '4V99', pdb_chain_ids: 'A;B' }],
    chainIdentityIndex
  });
  const dc = index.displayCases.find((row) => row.pdbId === '4V99');
  assert.deepEqual(dc.chainPlacements, [
    { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
    { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
  ]); // localeCompare(class) asc, then name asc; deduped
  assert.equal(index.totalPlacementCount, 2);
  assert.equal(index.totalCaseCount, index.displayCases.length);
});

test('buildAtlasIndexAsset falls back to Unclassified RNA when chain index misses', () => {
  const index = buildAtlasIndexAsset({
    cases: [{ case_id: 'c2', pdb_id: '9XXX', pdb_chain_ids: 'A', biological_molecule_name: 'Some Ribozyme' }],
    chainIdentityIndex: new Map()
  });
  const dc = index.displayCases.find((row) => row.pdbId === '9XXX');
  assert.deepEqual(dc.chainPlacements, [{ classLabel: 'Unclassified RNA', nameLabel: 'Some Ribozyme' }]);
  assert.equal(index.totalPlacementCount, 1);
});

test('buildAtlasIndexAsset no longer emits caseHierarchy', () => {
  const index = buildAtlasIndexAsset({ cases: [{ case_id: 'c3', pdb_id: '1ABC' }], chainIdentityIndex: new Map() });
  assert.equal('caseHierarchy' in index, false);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-corpus.test.js`
预期：FAIL（`chainPlacements` undefined / `totalPlacementCount` undefined / `caseHierarchy` 仍存在）。

- [ ] **步骤 3：编写最少实现代码**

在 `buildAtlasIndexAsset` 上方新增 helper：

```js
const UNCLASSIFIED_RNA_CLASS = 'Unclassified RNA';

// 由 chain index 派生 displayCase 的 chainPlacements（design §5.2/§6）：
// 去重 (classLabel, nameLabel)，localeCompare 升序（class 优先再 name），保证 [0] 为确定性主 placement。
function buildChainPlacements(displayCase, chainIdentityIndex) {
  const pdbId = text(displayCase.pdbId).toUpperCase();
  const moleculeFallback = text(displayCase.moleculeDisplayName) || text(displayCase.pdbId) || pdbId;
  const chains = chainIdentityIndex.get(pdbId) || [];
  if (!chains.length) {
    return [{ classLabel: UNCLASSIFIED_RNA_CLASS, nameLabel: moleculeFallback }];
  }
  const seen = new Map();
  for (const chain of chains) {
    const classLabel = text(chain.rnaClass) || UNCLASSIFIED_RNA_CLASS;
    const nameLabel = text(chain.displayName) || moleculeFallback;
    const key = `${classLabel}\u0000${nameLabel}`;
    if (!seen.has(key)) seen.set(key, { classLabel, nameLabel });
  }
  return [...seen.values()].sort((a, b) =>
    a.classLabel.localeCompare(b.classLabel) || a.nameLabel.localeCompare(b.nameLabel)
  );
}
```

在 `buildAtlasIndexAsset` 签名加入参 `chainIdentityIndex = new Map()`，在 `const displayCases = buildDisplayCases(normalizedCases);` 之后派生 placement 并算总数，并删 `caseHierarchy`：

```js
  const displayCases = buildDisplayCases(normalizedCases);
  let totalPlacementCount = 0;
  for (const dc of displayCases) {
    dc.chainPlacements = buildChainPlacements(dc, chainIdentityIndex);
    totalPlacementCount += dc.chainPlacements.length;
  }
  return {
    schemaVersion: ANNOJOIN_ATLAS_SCHEMA_VERSION,
    version: ANNOJOIN_ATLAS_VERSION,
    generatedAt,
    source: { entryRoot: 'ANNOJOIN', annotationRoot: 'ANNOCONFIDENCE', browserLoadsAnnoconfidenceBigTables: false, ...source },
    totalCaseCount: displayCases.length,
    totalSourceCaseCount: normalizedCases.length,
    totalPlacementCount,
    displayCases,
    cases: normalizedCases,
    facets: facets.map(normalizeFacet),
    presets: presets.map(normalizePreset),
    downloads: downloads.map(normalizeDownload)
  };
```

（即删除 L978 `caseHierarchy: buildCaseHierarchy(displayCases),` 行，新增 `totalPlacementCount`。）

- [ ] **步骤 4：运行新增测试验证通过（按名过滤，整文件仍红）**

运行（只跑本任务三个新测试，用 `--test-name-pattern`）：
```bash
cd ~/docs/foldbridge && node --test --test-name-pattern='chainPlacements|totalPlacementCount|no longer emits caseHierarchy' test/annojoin-atlas-corpus.test.js
```
预期：3 个新测试 PASS。

> **明确预期：整文件 `node --test test/annojoin-atlas-corpus.test.js` 此刻必然红**——删 `caseHierarchy` 字段后，旧断言（`test/annojoin-atlas-corpus.test.js:74,147,187-194,211-214,257-259,746`）会失败。这些旧断言在**任务 5** 统一迁移。任务 2-4 期间整文件持续红是预期状态，勿在这几个任务里跑整文件断言绿。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add scripts/lib/annojoin-atlas-corpus.mjs test/annojoin-atlas-corpus.test.js
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): derive per-PDB chainPlacements + totalPlacementCount in index"
```

---

### 任务 2：把 chainIdentityIndex 传入 build 脚本调用点

**文件：**
- 修改：`scripts/build-annojoin-atlas.mjs`（L498 `buildAtlasIndexAsset({ ...tables, generatedAt, source })`）

`chainIdentityIndex` 已在 L355 构建（`buildChainIdentityIndex({ declaredIdentityRows, governedRows: governedMapRows })`），目前只用于 per-case 注入（L530）。

- [ ] **步骤 1：改调用点**

把 L498 改为：

```js
const index = buildAtlasIndexAsset({ ...tables, chainIdentityIndex, generatedAt, source });
```

（确认 `chainIdentityIndex` 变量名与 L355 一致；若该变量在更早作用域，确保 L498 可见。）

- [ ] **步骤 2：full build 冒烟（可与任务 15 合并跑）**

此步无独立单测（build 脚本是 I/O 编排）。最小验证：`node scripts/build-annojoin-atlas.mjs --help` 不报错；真实验证延后到任务 15。

- [ ] **步骤 3：Commit**

```bash
git -C ~/docs/foldbridge add scripts/build-annojoin-atlas.mjs
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): thread chainIdentityIndex into buildAtlasIndexAsset call"
```

---

### 任务 3：slimAtlasIndexForWrite 保留 chainPlacements

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`（`slimAtlasIndexForWrite` L990-999）
- 测试：`test/annojoin-atlas-corpus.test.js`

现状 `slimAtlasIndexForWrite` 通过 `const { profilePreview, profilePreviewIsComplete, ...keep } = row;` 用 `...keep` 透传其余字段——`chainPlacements` 天然保留。本任务是**加断言锁定**，防回归（design §4.2 铁律：分组依赖该字段，不可被瘦身丢弃）。

- [ ] **步骤 1：编写测试**

```js
test('slimAtlasIndexForWrite preserves chainPlacements while dropping profilePreview', () => {
  const slim = slimAtlasIndexForWrite({
    displayCases: [{ pdbId: '1ABC', chainPlacements: [{ classLabel: 'tRNA', nameLabel: 'tRNA-Phe' }], profilePreview: ['p1'], profilePreviewIsComplete: true }]
  });
  const dc = slim.displayCases[0];
  assert.deepEqual(dc.chainPlacements, [{ classLabel: 'tRNA', nameLabel: 'tRNA-Phe' }]);
  assert.equal('profilePreview' in dc, false);
});
```

（确保 import 列表含 `slimAtlasIndexForWrite`。）

- [ ] **步骤 2：运行测试（按名过滤）**

运行：
```bash
cd ~/docs/foldbridge && node --test --test-name-pattern='slimAtlasIndexForWrite preserves chainPlacements' test/annojoin-atlas-corpus.test.js
```
预期：PASS（`...keep` 已透传，无需改实现）。若意外 FAIL，说明瘦身误删——在解构里确保不剥离 chainPlacements。

> 整文件此刻仍红（同任务 1 说明），任务 5 迁移旧断言后才整文件绿。

- [ ] **步骤 3：Commit**

```bash
git -C ~/docs/foldbridge add test/annojoin-atlas-corpus.test.js
git -C ~/docs/foldbridge commit -m "test(annojoin-atlas): lock chainPlacements survival through slimAtlasIndexForWrite"
```

---

### 任务 4：bump SCHEMA_VERSION

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`（L1 `ANNOJOIN_ATLAS_SCHEMA_VERSION`）

- [ ] **步骤 1：改版本号**

把 `export const ANNOJOIN_ATLAS_SCHEMA_VERSION = 'annojoin-atlas.v1';` 改为 `'annojoin-atlas.v2'`（新增 `chainPlacements` + `totalPlacementCount`，删 `caseHierarchy`）。

- [ ] **步骤 2：Commit**

```bash
git -C ~/docs/foldbridge add scripts/lib/annojoin-atlas-corpus.mjs
git -C ~/docs/foldbridge commit -m "chore(annojoin-atlas): bump schema version to v2 (chainPlacements)"
```

---

### 任务 5：删 build 侧死代码 + 迁移 corpus 测试（**原子任务，源码与测试同 commit**）

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`（删 L487-508 占位逻辑、L953-958 + L962-963 classCanonical 覆写、L525-528 normalizeCase 派生、L559-630 死 hierarchy）
- 修改：`test/annojoin-atlas-corpus.test.js`（删/改对 caseHierarchy / parentClassLabel / childClassLabel 的断言）

> **依赖警示：** 删源码会让旧测试断言失效，删测试断言又依赖源码已删——**两者必须在同一 commit 落地**，否则套件红。按下面步骤先改源、再改测、一起 commit。

- [ ] **步骤 1：先全仓 grep 确认无活引用**

运行（逐条，勿用复合命令）：
```bash
grep -rn "buildCaseHierarchy" ~/docs/foldbridge/scripts ~/docs/foldbridge/src
grep -rn "parentClassLabel\|childClassLabel" ~/docs/foldbridge/scripts ~/docs/foldbridge/src
grep -rn "isPlaceholderClassLabel\|cleanClassLabel\|PLACEHOLDER_CLASS" ~/docs/foldbridge/scripts
grep -rn "caseDisplayLabel\|parentBucketLabel\|childBucketLabel\|bucketId" ~/docs/foldbridge/scripts
```
预期：除将删的定义点 + 浏览器层（任务 6-7 会一并删）+ 测试文件外，无其它活引用。若发现意外消费者，停下评估再删。

- [ ] **步骤 2：删 corpus.mjs 死代码**

删除：
- L492-508：`PLACEHOLDER_CLASS_LABEL_PATTERNS`、`PLACEHOLDER_CLASS_SOURCES`、`isPlaceholderClassLabel`、`cleanClassLabel`。
- L525-528：`normalizeCase` 里 `parentClassLabel`/`parentClassSource`/`childClassLabel`/`childClassSource` 四行。
- L953-958 + L962-963：`classCanonicalMap` 构建与 `row.parentClassLabel`/`row.childClassLabel` 覆写（保留 `moleculeCanonicalMap` 与 `row.moleculeDisplayName` 覆写 L960-961）。
- L559-630：`caseDisplayLabel`、`parentBucketLabel`、`childBucketLabel`、`bucketId`、`buildCaseHierarchy` 五个函数。

> **检查 `displayMoleculeName`/其它对 `parentClassLabel`/`childClassLabel` 的 `||` 回退引用**：删字段后这些变 undefined，`||` 链仍能落到下一回退，无需改；但若有处直接读且无回退，需改读 `moleculeDisplayName`。grep 步骤 1 已覆盖。

- [ ] **步骤 3：迁移 corpus 测试**

在 `test/annojoin-atlas-corpus.test.js` 中（**任务 5 独占所有 corpus 文件断言迁移**，含 L194/L746）：
- 删除断言 `index.caseHierarchy` 的测试块：L74、L147、L187-194、L211-214、L257-259。
- L194 `Object.keys(asset)` 断言：改期望键列表为去 `caseHierarchy`、加 `totalPlacementCount`（见任务 14 步骤 2 的目标列表，由本任务落地）。
- L746 `assert.deepEqual(slim.caseHierarchy, index.caseHierarchy);` 删除（caseHierarchy 不复存在；slim 保留 chainPlacements 已由任务 3 覆盖）。
- 删除对 `parentClassLabel`/`childClassLabel` 的派生/占位清洗断言（L257-259 占位标签 placeholder 相关整块删）。
- 保留任务 1/3 新增的 chainPlacements / totalPlacementCount / 无 caseHierarchy 断言。

- [ ] **步骤 4：运行 corpus 测试验证全绿**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-corpus.test.js`
预期：PASS，无残留 caseHierarchy/parentClassLabel 断言。

- [ ] **步骤 5：Commit（源码 + 测试一起）**

```bash
git -C ~/docs/foldbridge add scripts/lib/annojoin-atlas-corpus.mjs test/annojoin-atlas-corpus.test.js
git -C ~/docs/foldbridge commit -m "refactor(annojoin-atlas): remove dead case-level class label + hierarchy logic"
```

## 阶段 B：浏览器数据层与表模型

### 任务 6：normalizeCase 透传 chainPlacements + 移除 class label 读取

**文件：**
- 修改：`src/annojoinAtlasData.js`（`normalizeCase` L227-279；L242/L244 读取移除；新增 chainPlacements 透传）
- 测试：`test/annojoin-atlas.test.js`

铁律（design §7.1）：漏带字段是隐形杀手。chainPlacements 必须像 `moleculeDisplayName` 一样显式保留。

- [ ] **步骤 1：编写失败的测试**

```js
// test/annojoin-atlas.test.js
test('normalizeCase passes through chainPlacements', () => {
  const state = buildAtlasSearchState({
    displayCases: [{
      pdb_id: '4V99',
      chainPlacements: [
        { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
        { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
      ]
    }]
  });
  const c = state.cases.find((row) => row.pdbId === '4V99');
  assert.deepEqual(c.chainPlacements, [
    { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
    { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
  ]);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas.test.js`
预期：FAIL（`c.chainPlacements` undefined）。

- [ ] **步骤 3：实现**

在 `normalizeCase` 返回对象里：
- 删 L242 `parentClassLabel` 与 L244 `childClassLabel`（保留 `parentClassSource`/`childClassSource`？——否，按 design §8 一并删 L243/L245 两个 source 读取）。
- 新增 chainPlacements 透传（规范成 `{classLabel, nameLabel}`）：

```js
    chainPlacements: normalizeChainPlacements(row.chainPlacements || row.chain_placements),
```

在文件合适位置（`normalizeCase` 上方）加 helper：

```js
function normalizeChainPlacements(value) {
  return asArray(value)
    .map((entry) => ({
      classLabel: text(entry.classLabel || entry.class_label),
      nameLabel: text(entry.nameLabel || entry.name_label)
    }))
    .filter((entry) => entry.classLabel || entry.nameLabel);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasData.js test/annojoin-atlas.test.js
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): pass chainPlacements through browser normalizeCase"
```

---

### 任务 7：删浏览器层死 hierarchy + buildAtlasSearchState 返回键

**文件：**
- 修改：`src/annojoinAtlasData.js`（删 `caseDisplayLabel` L163-173、`parentBucketLabel` L175-179、`childBucketLabel` L181-185、`bucketId` L187-192、`buildCaseHierarchy` L194-225；删 L579 `caseHierarchy` / L580 `sourceCaseHierarchy` 返回键；新增 `totalPlacementCount` 返回）
- 测试：`test/annojoin-atlas.test.js`

死代码确认（design §3 校正，grep）：view 从不消费 `caseHierarchy`/`sourceCaseHierarchy`。

- [ ] **步骤 1：编写测试**

```js
test('buildAtlasSearchState drops dead caseHierarchy and exposes totalPlacementCount', () => {
  const state = buildAtlasSearchState({
    displayCases: [{ pdb_id: '1ABC', chainPlacements: [{ classLabel: 'tRNA', nameLabel: 'tRNA-Phe' }] }],
    totalPlacementCount: 1
  });
  assert.equal('caseHierarchy' in state, false);
  assert.equal('sourceCaseHierarchy' in state, false);
  assert.equal(state.totalPlacementCount, 1);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas.test.js`
预期：FAIL（state 仍含 caseHierarchy / 无 totalPlacementCount）。

- [ ] **步骤 3：实现**

- 删 L163-225 五个死函数。
- 在 `buildAtlasSearchState` 返回对象删 L579/L580 两行，新增：

```js
    totalPlacementCount: numberOrZero(tables.totalPlacementCount),
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasData.js test/annojoin-atlas.test.js
git -C ~/docs/foldbridge commit -m "refactor(annojoin-atlas): remove dead browser caseHierarchy, expose totalPlacementCount"
```

---

### 任务 8：primaryPlacement helper + sortAnnojointCases 按主 placement 排序

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`（`sortAnnojointCases` L52-62；新增 `primaryPlacement`）
- 测试：`test/annojoin-atlas-table-model.test.js`

主 placement = `chainPlacements[0]`（任务 1 已 localeCompare 排好，确定性）。pagination 单元仍是 case → 同 case 所有 placement 落同页（design §3 单元边界）。

- [ ] **步骤 1：编写失败的测试**

```js
test('sortAnnojointCases orders by primary placement (class then name)', () => {
  const cases = [
    { pdbId: '2', chainPlacements: [{ classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }] },
    { pdbId: '1', chainPlacements: [{ classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' }] }
  ];
  const sorted = sortAnnojointCases(cases);
  assert.deepEqual(sorted.map((c) => c.pdbId), ['1', '2']); // rRNA < tRNA
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：FAIL（旧 sort 读 parentGroupLabel/childGroupLabel，无 placement 感知）。

- [ ] **步骤 3：实现**

新增 helper + 改 sort：

```js
export function primaryPlacement(row = {}) {
  const placements = Array.isArray(row.chainPlacements) ? row.chainPlacements : [];
  return placements[0] || { classLabel: '', nameLabel: '' };
}

export function sortAnnojointCases(cases = []) {
  return [...cases].sort((a, b) => {
    const pa = primaryPlacement(a);
    const pb = primaryPlacement(b);
    const values = [
      String(pa.classLabel).localeCompare(String(pb.classLabel)),
      String(pa.nameLabel).localeCompare(String(pb.nameLabel)),
      String(a.pdbId || a.caseId || '').localeCompare(String(b.pdbId || b.caseId || '')),
      rowCaseKey(a).localeCompare(rowCaseKey(b))
    ];
    return values.find((value) => value !== 0) || 0;
  });
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasTableModel.js test/annojoin-atlas-table-model.test.js
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): sort cases by primary chain placement"
```

---

### 任务 9：buildAnnojointTableGroups 按 placement 扇出

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`（`buildAnnojointTableGroups` L64-87）
- 测试：`test/annojoin-atlas-table-model.test.js`

核心改造：从"每 row 一个 (parentLabel, childLabel) 分组"变成"遍历 `row.chainPlacements`，每个 `(classLabel, nameLabel)` 把 row 挂到 `class → name` 分支"。多身份 case 出现在多分支（design §5.2）。

- [ ] **步骤 1.5：迁移已存在的旧分组测试（否则步骤 4 整文件红）**

`test/annojoin-atlas-table-model.test.js` 顶部的共享 `rows` fixture 带 `parentClassLabel`/`childClassLabel`，且 L72-84 `'groups cases into parent and child buckets with parentless fallback'` 断言旧标签分组（`Ribosome` → `16S rRNA`/`23S rRNA`）。placement 改造后这些 row 无 `chainPlacements` → 落 `Unclassified RNA` 兜底，断言失败。

迁移做法：给共享 `rows` fixture 每行加 `chainPlacements`（对应原 parent/child 语义），并把 L72-84 期望改为按 placement 的 class→name 分组。例如把 Ribosome 行改成：

```js
{ pdbId: '10ZT', caseId: '10ZT', /* ...原字段... */,
  chainPlacements: [
    { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' }
  ] },
```

并据此更新 L72-84 的期望标签（class=`rRNA`，name=`16S ribosomal RNA`），与新扇出逻辑一致。

> **依赖警示：** 此 fixture 也被 L94-108 export 测试（任务 10 迁移）与 L86-92 分页测试共享。改 fixture 时确保分页测试（只读 `rows.length`/`rows[2]`）不受影响——它不读 placement，安全。

- [ ] **步骤 1.6：编写失败的测试（新扇出行为）**

```js
test('buildAnnojointTableGroups fans a multi-identity case into multiple branches', () => {
  const groups = buildAnnojointTableGroups([{
    pdbId: '4V99',
    chainPlacements: [
      { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
      { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
    ]
  }]);
  const labels = groups.map((p) => p.label).sort();
  assert.deepEqual(labels, ['rRNA', 'tRNA']);
  const rRNA = groups.find((p) => p.label === 'rRNA');
  assert.equal(rRNA.children[0].label, '16S ribosomal RNA');
  assert.equal(rRNA.children[0].rows[0].pdbId, '4V99');
  // child id 带父路径，不串台
  assert.equal(rRNA.children[0].id, `${groupSlug('rRNA')}::${groupSlug('16S ribosomal RNA')}`);
});

test('buildAnnojointTableGroups defends empty chainPlacements as Unclassified RNA', () => {
  const groups = buildAnnojointTableGroups([{ pdbId: '9ZZZ', chainPlacements: [] }]);
  assert.equal(groups[0].label, 'Unclassified RNA');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：FAIL（旧实现按 parent/childGroupLabel 单分组）。

- [ ] **步骤 3：实现**

```js
function placementsFor(row = {}) {
  const placements = Array.isArray(row.chainPlacements) ? row.chainPlacements : [];
  if (!placements.length) return [{ classLabel: 'Unclassified RNA', nameLabel: moleculeName(row) }];
  return placements;
}

export function buildAnnojointTableGroups(cases = []) {
  const parentMap = new Map();
  for (const row of cases) {
    for (const placement of placementsFor(row)) {
      const parentLabel = String(placement.classLabel || 'Unclassified RNA');
      const childLabel = String(placement.nameLabel || parentLabel);
      const parentId = groupSlug(parentLabel);
      const childId = `${parentId}::${groupSlug(childLabel)}`;
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, { id: parentId, label: parentLabel, count: 0, children: new Map() });
      }
      const parent = parentMap.get(parentId);
      if (!parent.children.has(childId)) {
        parent.children.set(childId, { id: childId, parentId, label: childLabel, count: 0, rows: [] });
      }
      const child = parent.children.get(childId);
      child.rows.push(row);
      child.count += 1;
      parent.count += 1;
    }
  }
  return [...parentMap.values()].map((parent) => ({ ...parent, children: [...parent.children.values()] }));
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasTableModel.js test/annojoin-atlas-table-model.test.js
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): fan table groups out by chain placement"
```

---

### 任务 10：清理 parentGroupLabel/childGroupLabel + annojoinExportRow

**文件：**
- 修改：`src/annojoinAtlasTableModel.js`（`parentGroupLabel` L34-42、`childGroupLabel` L44-50 删对 parentClassLabel/childClassLabel 的读取；`annojoinExportRow` L152-171 改 export 列）
- 测试：`test/annojoin-atlas-table-model.test.js`

`parentGroupLabel`/`childGroupLabel` 不再用于分组（任务 9 已切到 placement）。删去对已删字段 `parentClassLabel`/`childClassLabel` 的读取——回退到 `moleculeDisplayName...`。export 列 `parent_class_label`/`child_class_label`（L156-157）改为 `chain_class_labels`/`chain_name_labels`（placement 的 class/name 用 `;` 拼接）。

- [ ] **步骤 1：编写失败的测试**

```js
test('annojoinExportRow emits chain placement label columns', () => {
  const out = annojoinExportRow({
    pdbId: '4V99',
    chainPlacements: [
      { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
      { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
    ]
  });
  assert.equal(out.chain_class_labels, 'rRNA;tRNA');
  assert.equal(out.chain_name_labels, '16S ribosomal RNA;tRNA-Lys');
  assert.equal('parent_class_label' in out, false);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：FAIL。

- [ ] **步骤 3：实现**

- `parentGroupLabel`：删 `cleanLabel(row.parentClassLabel) ||` 与 `cleanLabel(row.childClassLabel) ||` 两行，首项改 `cleanLabel(row.moleculeDisplayName)`。
- `childGroupLabel`：首项已是 `cleanLabel(row.childClassLabel)`——改为 `cleanLabel(row.moleculeDisplayName)`。
- `annojoinExportRow`：删 L156-157，新增：

```js
    chain_class_labels: (row.chainPlacements || []).map((p) => p.classLabel).join(';'),
    chain_name_labels: (row.chainPlacements || []).map((p) => p.nameLabel).join(';'),
```

- **迁移已存在的旧 export 测试 `test/annojoin-atlas-table-model.test.js:94-108`**（`'exports case-level display fields…'`）：它断言 `parent_class_label: 'Ribosome'`/`child_class_label: '16S rRNA'`，删列后失败。改为断言新列 `chain_class_labels`/`chain_name_labels`（取自任务 9 已给 fixture 加的 `chainPlacements`），删掉 `parent_class_label`/`child_class_label` 期望键。
- **检查 L110-139 merged-row export 测试**：它断言 `parent_class_label: undefined`/`child_class_label: undefined`——删列后这两键不再出现，需从期望对象删除这两行。同时：新 `annojoinExportRow` 无条件输出 `chain_class_labels`/`chain_name_labels`，对无 `chainPlacements` 的 merged fixture 它们是 `''`——故须**在期望对象里新增** `chain_class_labels: ''`/`chain_name_labels: ''` 两行，否则 deepEqual 失败。

- [ ] **步骤 4：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-table-model.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasTableModel.js test/annojoin-atlas-table-model.test.js
git -C ~/docs/foldbridge commit -m "refactor(annojoin-atlas): drop class-label reads, export chain placement columns"
```

---

### 任务 11：集成测试（真实渲染管线 annojoin-atlas.test.js）

**文件：**
- 测试：`test/annojoin-atlas.test.js`

过真实管线 `sortAnnojointCases → searchAnnojointRows → paginateAnnojointRows → buildAnnojointTableGroups`（design §9.2）。

- [ ] **步骤 0：迁移已存在的旧 data-层渲染测试 `test/annojoin-atlas.test.js:257-295`**

旧测试 `'atlas search state preserves the canonical moleculeDisplayName for grouping and dedupe'` 用 `parentClassLabel`/空 class label 驱动分组，断言 4V85 折进 `parent:16S-ribosomal-RNA` 组（`expandedGroupIds: new Set(['parent:16S-ribosomal-RNA'])` + `data-annojoin-case-row="RASP2PDB:4V85"`）。placement 改造后无 `chainPlacements` 的 4V85 落 `Unclassified RNA` 组，expand 键不匹配，断言失败。

迁移做法：给两个 displayCase 加 `chainPlacements: [{ classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' }]`（替代旧 parentClassLabel），把 `expandedGroupIds` 改为按新 group id（parent=`groupSlug('rRNA')`=`rRNA`，即 fold 键 `parent:rRNA`；child id=`rRNA::16S-ribosomal-RNA`，注意 `groupSlug` 只把非字母数字替换为 `-`、**不**做小写化，故大小写保持原样）。保留 4V85 行出现断言与 molecule-same-as-group 断言（name 等于 group child label 时仍显 "—"，逻辑不变）。确认 view 的 fold 键格式（`parent:${parent.id}` / `child:${child.id}`，见 view L180-219）与新 id 一致。

- [ ] **步骤 1：编写测试（新管线集成）**

```js
test('real pipeline groups by chain placement; search disables grouping', () => {
  const state = buildAtlasSearchState({
    displayCases: [
      { pdb_id: '4V99', chainPlacements: [
        { classLabel: 'rRNA', nameLabel: '16S ribosomal RNA' },
        { classLabel: 'tRNA', nameLabel: 'tRNA-Lys' }
      ] },
      { pdb_id: '1EHZ', chainPlacements: [{ classLabel: 'tRNA', nameLabel: 'tRNA-Phe' }] }
    ]
  });
  const sorted = sortAnnojointCases(state.cases);
  const page = paginateAnnojointRows(sorted, { page: 1, pageSize: 50 });
  const groups = buildAnnojointTableGroups(page.rows);
  const parentLabels = groups.map((p) => p.label).sort();
  assert.deepEqual(parentLabels, ['rRNA', 'tRNA']);
  // 多身份 4V99 同时在 rRNA 与 tRNA 下出现
  const tRNA = groups.find((p) => p.label === 'tRNA');
  const tRNApdbs = tRNA.children.flatMap((c) => c.rows.map((r) => r.pdbId)).sort();
  assert.ok(tRNApdbs.includes('4V99'));
  // 搜索态不分组（searchActive 行为）
  const filtered = searchAnnojointRows(sorted, '4V99');
  assert.equal(filtered.length, 1);
});
```

（确保 import：`sortAnnojointCases`、`searchAnnojointRows`、`paginateAnnojointRows`、`buildAnnojointTableGroups`。）

- [ ] **步骤 2：运行测试验证通过**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas.test.js`
预期：PASS。

- [ ] **步骤 3：Commit**

```bash
git -C ~/docs/foldbridge add test/annojoin-atlas.test.js
git -C ~/docs/foldbridge commit -m "test(annojoin-atlas): integration test for placement grouping via real pipeline"
```

## 阶段 C：视图层、smoke/compression 测试与全量验证

### 任务 12：表头双显 distinct PDB · placement 数

**文件：**
- 修改：`src/annojoinAtlasView.js`（`metaCountText` L502-506）
- 测试：`test/annojoin-atlas.test.js`（或 view 单测，若存在）

design §5.3：表头同时显示 `N PDBs · M entries`（distinct PDB · 总 placement）。

- [ ] **步骤 1：实现（非搜索态加 placement 数）**

把 L502-506 改为：

```js
  const displayCount = atlasState.totalCaseCount || atlasState.cases.length;
  const placementCount = atlasState.totalPlacementCount || 0;
  const sourceCount = atlasState.totalSourceCaseCount;
  const metaCountText = searchActive
    ? `Showing ${escapeHtml(baseRows.length)} of ${escapeHtml(displayCount)} entries matching "${escapeHtml(query)}"`
    : `${escapeHtml(displayCount)} PDBs${placementCount ? ` · ${escapeHtml(placementCount)} entries` : ''}${sourceCount && sourceCount !== displayCount ? ` (${escapeHtml(sourceCount)} source cases)` : ''}`;
```

- [ ] **步骤 2：验证**

如有 view 渲染单测，断言输出含 `PDBs` 与 `entries`；否则靠任务 15 真实 build + 浏览器目检。运行 `cd ~/docs/foldbridge && node --test`，确认无回归。

- [ ] **步骤 3：Commit**

```bash
git -C ~/docs/foldbridge add src/annojoinAtlasView.js
git -C ~/docs/foldbridge commit -m "feat(annojoin-atlas): header dual-count PDBs and placement entries"
```

---

### 任务 13：迁移 smoke 测试与 smoke lib gate

**文件：**
- 修改：`scripts/lib/annojoin-atlas-smoke.mjs`（L122 require `index.caseHierarchy` → require `chainPlacements`）
- 修改：`test/annojoin-atlas-smoke.test.js`（L35/L98/L196 fixture 的 `caseHierarchy` → `displayCases[].chainPlacements`）

- [ ] **步骤 1：改 smoke lib gate**

把 L122 改为校验 displayCases 带非空 chainPlacements：

```js
  const hasPlacements = Array.isArray(index.displayCases)
    && index.displayCases.length
    && index.displayCases.every((row) => Array.isArray(row.chainPlacements) && row.chainPlacements.length);
  if (!hasPlacements) failures.push({ caseId: '', message: 'chainPlacements missing on displayCases' });
```

- [ ] **步骤 2：改 smoke 测试 fixture**

把 L35/L98/L196 的 `caseHierarchy: [...]` 替换为给每个 displayCase 加 `chainPlacements: [{ classLabel, nameLabel }]`（至少一条），删除 caseHierarchy 键。同时检查 L20-21（`parentClassLabel`/`childClassLabel`）与 L84-85（占位标签 `'RASP public current'`/`'raw-hit case'`）——smoke gate 只校验 web display 字段与（新的）chainPlacements，不读这些；它们是无害残留，删之以免误导（确认删后无断言依赖占位清洗行为）。

- [ ] **步骤 3：运行 smoke 测试**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-smoke.test.js`
预期：PASS。

- [ ] **步骤 4：Commit**

```bash
git -C ~/docs/foldbridge add scripts/lib/annojoin-atlas-smoke.mjs test/annojoin-atlas-smoke.test.js
git -C ~/docs/foldbridge commit -m "test(annojoin-atlas): smoke gate requires chainPlacements, drop caseHierarchy"
```

---

### 任务 14：compression 测试 + 最终全套回归

**文件：**
- 修改：`test/annojoin-atlas-compression.test.js`（L90 断言 index 不含 caseHierarchy——本设计后仍成立，新增 chainPlacements 存活断言）

> corpus 文件的 L194 `Object.keys` 与 L746 slim 断言已由**任务 5 独占迁移**（见任务 5 步骤 3）。本任务只处理 compression 断言 + 最终全套回归，不再碰 corpus 文件，避免半迁移 commit。

- [ ] **步骤 1：改 compression 测试**

L90 `assert.equal(JSON.stringify(index).includes('caseHierarchy'), false);` 保留（删 caseHierarchy 后仍真）。新增一条：

```js
  assert.equal(JSON.stringify(index).includes('chainPlacements'), true);
```

- [ ] **步骤 2：运行 compression 测试**

运行：`cd ~/docs/foldbridge && node --test test/annojoin-atlas-compression.test.js`
预期：PASS。

- [ ] **步骤 3：全套回归**

运行：`cd ~/docs/foldbridge && node --test`
预期：全绿，零回归。若有红，回到对应任务修复。

- [ ] **步骤 4：Commit**

```bash
git -C ~/docs/foldbridge add test/annojoin-atlas-compression.test.js
git -C ~/docs/foldbridge commit -m "test(annojoin-atlas): compression asserts chainPlacements survives, no caseHierarchy"
```

---

### 任务 15：真实 full build 验证

**文件：** 无（验证任务）

design §9.3。使用默认 tianyi 路径根。

- [ ] **步骤 1：跑 full build**

```bash
cd ~/docs/foldbridge && FOLDBRIDGE_ANNOJOIN_ROOT=<.../view_roots/combined> npm run build:annojoin-atlas
```
（按现有 build 文档补齐校准/identity/ANNO 根环境变量；chain identity 源 `/Volumes/tianyi/tmp/PDB/04_pdb_metadata/pdb_rna_entity_chain_declared_identity.tsv`。）

- [ ] **步骤 2：核 manifest 计数**

逐条 grep 生成的 index.json：
```bash
grep -o '"totalCaseCount":[0-9]*' <index.json 路径>
grep -o '"totalPlacementCount":[0-9]*' <index.json 路径>
```
预期：totalPlacementCount ≥ totalCaseCount（多链多身份）。

- [ ] **步骤 3：核字段存活与旧字段清除**

```bash
grep -c 'chainPlacements' <index.json>
grep -c 'caseHierarchy' <index.json>
grep -c 'parentClassLabel\|childClassLabel' <index.json>
```
预期：chainPlacements 计数 >0；caseHierarchy / parentClassLabel / childClassLabel 计数 = 0。

- [ ] **步骤 4：抽样多链 PDB**

抽 4V99（rRNA+tRNA）、6YFT 等，确认 displayCases 里其 chainPlacements 含多个 `(class, name)`，浏览器里在多分支出现。

- [ ] **步骤 5：dist 同步**

```bash
rsync -a --delete ~/docs/foldbridge/src/assets/generated/annojoin-atlas/ ~/docs/foldbridge/dist/<对应路径>/
```
（生成产物 gitignore，本地重建。硬刷新 Cmd+Shift+R 验证旧 schema 缓存失效。）

---

### 任务 16：最终全套验证 + commit + push

**文件：** 无（收尾）

兑现用户 "推进完成 commit" 意图。push 规则铁律：`origin main:public`（非 origin/main，那是无关 Jekyll 仓）。

- [ ] **步骤 1：全套测试**

运行：`cd ~/docs/foldbridge && node --test`
预期：全绿。若有红，回到对应任务修复，勿跳过。

- [ ] **步骤 2：确认工作树干净（生成产物已 gitignore）**

```bash
git -C ~/docs/foldbridge status
```
预期：仅源码/测试/plan/spec 变更已 commit，无遗漏。

- [ ] **步骤 3：push 到 public 分支**

```bash
git -C ~/docs/foldbridge push origin main:public
```

- [ ] **步骤 4：浏览器最终目检**

访问站点 `#annojoin-confidence` 路由，确认：三层折叠 class → name → PDB 渲染正常；表头显示 `N PDBs · M entries`；多链 PDB 在多分支出现；搜索时不分组。

---

## 验证总览（design §9）

- 单元：corpus placement 派生（去重/排序/Unclassified 兜底/totalPlacementCount/无 caseHierarchy）；table model 扇出（多分支/id 不串台/主 placement 排序）。
- data 层：normalizeCase 透传 chainPlacements；buildAtlasSearchState 无 caseHierarchy/sourceCaseHierarchy、有 totalPlacementCount。
- 真实管线：sort→search→paginate→group 三层结构；搜索态不分组；同 case placement 同页不被拆散。
- full build：计数双显、字段存活、旧字段清零、多链抽样、`node --test` 全绿、dist 同步。

## 风险与缓解（design §10）

- placement 膨胀：按 `(class,name)` 去重后同装配体同身份链折叠为单条；计数双显防误读。
- 逐页分组边界：现状语义，sort 按主 placement 使同分支相邻；同 case placement 因 pagination 单元是 case 必落同页。
- schemaVersion 不兼容旧 dist 缓存：bump v2 + full build 重写 + 硬刷新。
- chain index 覆盖不全：RASP-only PDB 走 Unclassified RNA 兜底，不丢数据。
