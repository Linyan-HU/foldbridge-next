# RMDB→PDB 真实数据填充与详情页改造 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用 JOIN 主表按 confidence_class 筛选出的真实 RMDB→PDB case 资产，替换站点手写的 5 个 demo case，并改造 PDB case 索引页与详情页以懒加载这些资产。

**架构：** build-time 生成脚本读取 JOIN 主表（`pdb_to_rmdb2pdb_export_link.tsv` + `pdb_case_overview_display_index_v1.tsv`）筛选出 confidence∈{high,medium,low} 的 case，从 PUBLIC case 目录抽取并降采样/切片，输出符合既有「数据资产契约」的轻量索引+小资产到 `src/assets/generated/rmdb-pdb-cases/`。前端 `pdbCaseView.js`/`main.js` 从手写 `data.js` 改为 fetch 生成的 index/小资产，按四个模块（概览+质量字段、profile/provenance、反应性轨道、碱基级比对）懒加载渲染，并保留 projection 语义警告 + 加 confidence 分级徽章。首批只生成 20 个样本 case。

**技术栈：** Node 22 ES modules、`node --test` + `node:assert/strict`、原生 fetch、无打包器。生成脚本用 `node:fs/promises` + `node:crypto`(sha256)。

**数据源（只读，build-time 输入）：**
- JOIN 主表根：`/Volumes/tianyi/04_foldbridge_data/JOIN/database_center/`
  - `pdb_to_rmdb2pdb_export_link.tsv`（909 行，列：pdb_id[1] pdb_reference_id[2] detail_route_id[3] rmdb2pdb_export_case_id[4] rmdb2pdb_export_case_path[5] rmdb2pdb_available[6] filtered_pair_count[8] filtered_profile_count[9] filtered_residue_count[10] confidence_score[11] confidence_class[12] confidence_summary[13]）
  - `pdb_case_overview_display_index_v1.tsv`（列含 pdb_id、display_name、display_subtitle、pdb_struct_title、case_display_class、web_display_status）
- PUBLIC case 资产根：`/Volumes/tianyi/04_foldbridge_data/PUBLIC/rmdb_pdb_sequence_cases_rasp_params_besthit_20260610/public_package/<PDB_ID>/`
  - 每 case 含：`case.json`、`alignment.tsv`、`alignment_pair_summary.tsv`、`rmdb_sequence_members.tsv`、`pdb_axis_reactivity.tsv`、`provenance_index.tsv`、`pdb.fasta`、`rmdb.fasta`、`rmdb_bundle_sequences.fasta`

**筛选口径（已锁定）：** confidence_class ∈ {high_confidence, medium_confidence, low_confidence}，去重后 237 个 case。**本计划只生成首批 20 个样本：**
- high(8)：9ELY 8QHU 8HMY 8CBL 8BVM 8BVJ 8ABZ 8A57
- medium(6)：7QIY 7ELD 6ND4 3NDB 7R6K 8CBJ
- low(6)：9ZNF 5T7V 8SP9 8EYT 8BN3 9QQQ

**关键科学口径（来自 case.json，UI 必须尊重，不得弱化）：**
- `projection_status=pass` 仅表示投影流程完成，**不是结构证据**（`projection_is_structural_evidence=false`）
- 反应性轴是 PDB reference sequence position（`reactivity_axis=pdb_reference_sequence_position`），**非观测残基坐标**（`observed_residue_axis=false`）
- 3D 残基着色默认禁用，直到生成 residue selector map

**既有数据资产契约（必须遵守，详见 `docs/rmdb-pdb-visualization-review-20260611/data-assets-contract.md`）：**
- 输出目录固定 `src/assets/generated/rmdb-pdb-cases/`，不再手写进 `src/data.js`
- 轻量索引 + 大量小文件 + 按视图懒加载；禁止聚合成单一大 JSON
- 单文件 < 100 MiB（否则生成失败）；50–100 MiB 标记 large asset warning
- `manifest.json` 必须含 source_package_id、schema version、generated_at、每个资产相对路径 + size_bytes + sha256 + large_asset_warning 布尔
- alignment 每页 25 行；反应性按 PDB position window 切片 + 降采样预览（≤64 点）

---

## 文件结构

**生成器（build-time，Node）**
- 创建 `scripts/lib/rmdb-case-corpus.mjs` — 纯函数库：解析 TSV、筛选、降采样、切片、构造各资产对象。**所有逻辑放这里以便单测**（不碰 fs 的部分尽量纯函数化）。
- 创建 `scripts/build-rmdb-cases.mjs` — 薄 IO 壳：读数据源 → 调 corpus 库 → 写 `src/assets/generated/rmdb-pdb-cases/` → 写 manifest。
- 创建 `scripts/lib/sample-case-ids.mjs` — 导出首批 20 个样本 pdbId 数组（单一真相源，脚本与测试共用）。

**生成产物（git 跟踪，因为是站点运行时数据；契约要求 runtime data 入版本控制）**
- `src/assets/generated/rmdb-pdb-cases/index.json`
- `src/assets/generated/rmdb-pdb-cases/manifest.json`
- `src/assets/generated/rmdb-pdb-cases/cases/<pdb>/case.json`
- `src/assets/generated/rmdb-pdb-cases/cases/<pdb>/profiles.json`
- `src/assets/generated/rmdb-pdb-cases/cases/<pdb>/reactivity/<profileKey>/summary.json`
- `src/assets/generated/rmdb-pdb-cases/cases/<pdb>/reactivity/<profileKey>/pdb-pos-<start>-<end>.json`
  - `<profileKey>` 由 `bundle_profile_id` 经 slug 化得到（契约 `reactivity/<source_type>/<profile_key>/`；本数据 source_type 固定，故只取 profile 维度，仍保留 per-profile 子目录以支持「切换 profile 加载对应小资产」）
- `src/assets/generated/rmdb-pdb-cases/cases/<pdb>/alignments/page-NNNN.json`

**前端运行时数据访问层（新）**
- 创建 `src/rmdbCaseStore.js` — 浏览器侧资产加载器：`loadCaseIndex()`、`loadCase(pdbId)`、`loadAlignmentPage(pdbId,n)`、`loadReactivitySummary(pdbId,profileKey)`、`loadReactivityWindow(pdbId,profileKey,start,end)`。基于 fetch + 相对 `./src/assets/generated/rmdb-pdb-cases` 基址 + 内存缓存。

**前端渲染（改）**
- 修改 `src/pdbCaseView.js` — 索引页接收筛选后的 index 行 + confidence 徽章 + class 筛选；详情页接收 case.json/profiles 对象渲染四模块；新增比对视图渲染。
- 修改 `src/main.js:1824-1828` `pdbCasePage()` 与 `src/main.js:2347` `initApp()` — 改为从 store 异步加载并渲染，移除对 `data.js` 中 `pdbCaseRows`/`getPdbCaseDetail` 的依赖。
- 修改 `src/data.js` — 删除 5 个手写 demo（`pdbCaseRows`、`pdbCaseDetailById`、`getPdbCaseDetail`），保留 `DATA_VERSION` 等版本常量并更新。
- 修改 `src/search/searchCorpus.js` — 搜索语料从生成的 index.json 取（构建期读取），替换对 `pdbCaseRows`/`getPdbCaseDetail` 的引用。

**测试**
- 创建 `test/rmdb-case-corpus.test.js` — 生成器纯函数单测。
- 创建 `test/rmdb-case-store.test.js` — store 路径解析 + fetch 包装（注入 mock fetch）。
- 修改 `test/data.test.js` — 移除已删除 demo 的断言。
- 修改 `test/pdb-case-view.test.js` — 适配新渲染签名。
- 修改 `test/search-corpus.test.js` — 适配新语料来源。

**构建接入**
- 修改 `package.json` scripts：build 链加入 `build:rmdb-cases`；调整 `build:search-docs` 依赖。
- 修改 `scripts/verify-mvp.mjs` — 加生成资产存在性校验。

---

## 阶段 A：生成器纯函数库（不碰 fs）

### 任务 A1：样本 case 名单单一真相源

**文件：**
- 创建：`scripts/lib/sample-case-ids.mjs`
- 测试：`test/rmdb-case-corpus.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CASE_IDS } from '../scripts/lib/sample-case-ids.mjs';

test('sample case ids: 20 unique uppercase pdb ids', () => {
  assert.equal(SAMPLE_CASE_IDS.length, 20);
  assert.equal(new Set(SAMPLE_CASE_IDS).size, 20);
  assert.ok(SAMPLE_CASE_IDS.every((id) => /^[A-Z0-9]{4}$/.test(id)));
});
```

- [ ] **步骤 2：运行验证失败** — `node --test test/rmdb-case-corpus.test.js`，预期 FAIL（模块不存在）

- [ ] **步骤 3：最少实现**

```js
// scripts/lib/sample-case-ids.mjs
export const SAMPLE_CASE_IDS = [
  '9ELY', '8QHU', '8HMY', '8CBL', '8BVM', '8BVJ', '8ABZ', '8A57',
  '7QIY', '7ELD', '6ND4', '3NDB', '7R6K', '8CBJ',
  '9ZNF', '5T7V', '8SP9', '8EYT', '8BN3', '9QQQ'
];
```

- [ ] **步骤 4：运行验证通过** — `node --test test/rmdb-case-corpus.test.js`，预期 PASS
- [ ] **步骤 5：Commit** — `git add scripts/lib/sample-case-ids.mjs test/rmdb-case-corpus.test.js && git commit -m "feat(rmdb-cases): 锁定首批样本 case 名单"`

### 任务 A2：TSV 解析

**文件：**
- 创建：`scripts/lib/rmdb-case-corpus.mjs`
- 测试：`test/rmdb-case-corpus.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
import { parseTsv } from '../scripts/lib/rmdb-case-corpus.mjs';

test('parseTsv: header keyed rows, tab split, trailing newline tolerated', () => {
  const rows = parseTsv('a\tb\tc\n1\t2\t3\n4\t5\t6\n');
  assert.deepEqual(rows, [
    { a: '1', b: '2', c: '3' },
    { a: '4', b: '5', c: '6' }
  ]);
});

test('parseTsv: preserves empty trailing fields', () => {
  const rows = parseTsv('a\tb\tc\n1\t\t\n');
  assert.deepEqual(rows, [{ a: '1', b: '', c: '' }]);
});
```

- [ ] **步骤 2：运行验证失败**
- [ ] **步骤 3：最少实现**

```js
// scripts/lib/rmdb-case-corpus.mjs
export function parseTsv(text) {
  const lines = String(text).split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    header.forEach((key, i) => { row[key] = cells[i] ?? ''; });
    return row;
  });
}
```

- [ ] **步骤 4：运行验证通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 增加 TSV 解析"`

### 任务 A3：confidence 筛选 + 索引行构造

**文件：** 修改 `scripts/lib/rmdb-case-corpus.mjs`；测试 `test/rmdb-case-corpus.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
import { selectDisplayableCases, buildIndexRow } from '../scripts/lib/rmdb-case-corpus.mjs';

const linkRows = [
  { pdb_id: '8CBL', pdb_reference_id: '8CBL_A', detail_route_id: 'pdb:8CBL', rmdb2pdb_available: 'true', filtered_pair_count: '1', filtered_profile_count: '1', filtered_residue_count: '218', confidence_score: '1.000000', confidence_class: 'high_confidence', confidence_summary: 's' },
  { pdb_id: '10FZ', pdb_reference_id: '10FZ_A', rmdb2pdb_available: 'false', confidence_class: 'no_displayable_confidence', confidence_score: '0', filtered_profile_count: '0' }
];

test('selectDisplayableCases keeps only high/medium/low and dedupes by pdb_id', () => {
  const out = selectDisplayableCases(linkRows);
  assert.deepEqual(out.map((r) => r.pdb_id), ['8CBL']);
});

test('buildIndexRow normalizes class label and numeric counts', () => {
  const overviewByPdb = { '8CBL': { display_name: 'Group I intron', display_subtitle: '', pdb_struct_title: 'Group I intron' } };
  const row = buildIndexRow(linkRows[0], overviewByPdb['8CBL']);
  assert.equal(row.pdbId, '8CBL');
  assert.equal(row.confidenceClass, 'high');
  assert.equal(row.confidenceScore, 1);
  assert.equal(row.profileCount, 1);
  assert.equal(row.title, 'Group I intron');
  assert.equal(row.detailHref, '#pdb-case?pdbId=8CBL');
});
```

- [ ] **步骤 2：运行验证失败**
- [ ] **步骤 3：最少实现**（class 映射 high_confidence→high 等；dedupe 保留首次出现；title 优先 display_name→pdb_struct_title→pdbId）
- [ ] **步骤 4：运行验证通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 增加 confidence 筛选与索引行构造"`

### 任务 A4：反应性按 profile 分组 + 降采样预览 + window 切片

**文件：** 修改 `scripts/lib/rmdb-case-corpus.mjs`；测试同上

> **科学正确性（审查发现）：** `pdb_axis_reactivity.tsv` 每行带 `bundle_profile_id`，多 profile case 中同一个 `pdb_pos` 会有多行不同 profile 的反应性。必须**先按 `bundle_profile_id` 分组**再降采样/切片，否则不同 profile 的轨道会交错混入同一序列，含义失真。契约要求 `reactivity/<source_type>/<profile_key>/`，本数据 source_type 固定，故按 profile 维度分组并 slug 化 profileKey。

- [ ] **步骤 1：编写失败的测试**

```js
import { groupReactivityByProfile, buildReactivitySummary, sliceReactivityWindows, slugifyProfileKey } from '../scripts/lib/rmdb-case-corpus.mjs';

// pdb_axis_reactivity 行：pdb_pos, pdb_base, reactivity, bundle_profile_id ...
const reacRows = [
  ...Array.from({ length: 200 }, (_, i) => ({ pdb_pos: String(i + 1), pdb_base: 'G', reactivity: String((i % 10) / 10), bundle_profile_id: 'p1', reactivity_error: '0.1' })),
  ...Array.from({ length: 200 }, (_, i) => ({ pdb_pos: String(i + 1), pdb_base: 'A', reactivity: String((i % 7) / 10), bundle_profile_id: 'p2', reactivity_error: '0.2' }))
];

test('groupReactivityByProfile splits rows by bundle_profile_id preserving per-profile pos sequence', () => {
  const groups = groupReactivityByProfile(reacRows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.profileId).sort(), ['p1', 'p2']);
  const p1 = groups.find((g) => g.profileId === 'p1');
  assert.equal(p1.rows.length, 200);
  assert.ok(p1.rows.every((r) => r.bundle_profile_id === 'p1'));
  // 同一 pdb_pos 在 p1/p2 各出现一次，分组后两组互不串行（钉死交错失真风险）
  const p2 = groups.find((g) => g.profileId === 'p2');
  assert.ok(p2.rows.every((r) => r.bundle_profile_id === 'p2'));
  assert.equal(p1.rows.filter((r) => r.pdb_pos === '1').length, 1);
});

test('slugifyProfileKey makes filesystem-safe key', () => {
  assert.equal(slugifyProfileKey('RMDB_ID:profile/1'), 'rmdb-id-profile-1');
});

test('buildReactivitySummary downsamples to <=64 points and keeps pos range (single profile group)', () => {
  const group = groupReactivityByProfile(reacRows).find((g) => g.profileId === 'p1');
  const s = buildReactivitySummary(group.rows);
  assert.ok(s.trackPreview.length <= 64);
  assert.equal(s.minPos, 1);
  assert.equal(s.maxPos, 200);
  assert.ok(s.trackPreview.every((p) => Number.isInteger(p.pdbPos)));
});

test('sliceReactivityWindows splits a single profile group by fixed position window', () => {
  const group = groupReactivityByProfile(reacRows).find((g) => g.profileId === 'p1');
  const windows = sliceReactivityWindows(group.rows, 100);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].start, 1);
  assert.equal(windows[0].end, 100);
  assert.ok(windows[0].rows.length > 0);
});
```

- [ ] **步骤 2：运行验证失败**
- [ ] **步骤 3：最少实现**（`groupReactivityByProfile`：按 `bundle_profile_id` 落桶，保留每桶内行序；`slugifyProfileKey`：小写化、非字母数字转 `-`、压缩重复 `-`；降采样：等距取样到 ≤64 点；window：按 pdb_pos 落桶，每桶含 rows + start/end。`buildReactivitySummary`/`sliceReactivityWindows` 接收**单个 profile 的行**）
- [ ] **步骤 4：运行验证通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 反应性按 profile 分组、降采样与 position window 切片"`

### 任务 A5：alignment 分页 + profiles/provenance 聚合

**文件：** 修改 `scripts/lib/rmdb-case-corpus.mjs`；测试同上

- [ ] **步骤 1：编写失败的测试**

```js
import { paginateAlignment, buildProfiles, slugifyProfileKey } from '../scripts/lib/rmdb-case-corpus.mjs';

test('paginateAlignment chunks rows by 25', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ alignment_column: String(i + 1), rmdb_base: 'A', pdb_base: 'A', match_state: 'match' }));
  const pages = paginateAlignment(rows, 25);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].rows.length, 25);
  assert.equal(pages[2].rows.length, 10);
  assert.equal(pages[0].page, 1);
});

test('buildProfiles joins member + provenance by bundle_profile_id and emits profileKey', () => {
  const members = [{ bundle_sequence_id: 'b1', bundle_profile_id: 'pf1', rmdb_unique_id: 'r1', modifier: '1M7', sequence_length: '70' }];
  const provenance = [{ bundle_profile_id: 'pf1', rdat_file: 'x.rdat', lineage_id: 'l1' }];
  const out = buildProfiles({ members, provenance });
  assert.equal(out[0].bundleProfileId, 'pf1');
  assert.equal(out[0].rdatFile, 'x.rdat');
  // profileKey 是前端拼接 reactivity/<profileKey>/ 路径的唯一来源，必须由生成侧产出
  assert.equal(out[0].profileKey, slugifyProfileKey('pf1'));
});
```

> **profileKey 链路（审查发现）：** 前端拼 `reactivity/<profileKey>/` 路径只能消费生成侧产出的 `profileKey`，**不得在前端重复实现 slug 逻辑**（会与生成侧漂移导致 404）。因此 `buildProfiles` 的每个 profile 必须带 `profileKey`，且 import `slugifyProfileKey`（任务 A4 已定义）。`buildProfiles` 的 import 改为 `import { paginateAlignment, buildProfiles, slugifyProfileKey } from ...`。

> 注意：`modifier` 字段需先确认 PUBLIC `rmdb_sequence_members.tsv` 实际列名（任务执行时用 Read 工具核对 header；若无 modifier 列则从 `bundle_profile_id` 推导或置 `''`）。
- [ ] **步骤 2：运行验证失败**
- [ ] **步骤 3：最少实现**
- [ ] **步骤 4：运行验证通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): alignment 分页与 profile 聚合"`

### 任务 A6：case.json 合并（PUBLIC case.json + link 质量字段 + 科学口径透传）

**文件：** 修改 `scripts/lib/rmdb-case-corpus.mjs`；测试同上

- [ ] **步骤 1：编写失败的测试**

```js
import { buildCaseDetail } from '../scripts/lib/rmdb-case-corpus.mjs';

test('buildCaseDetail surfaces projection semantics and quality fields verbatim', () => {
  const publicCase = {
    pdb_id: '8CBL', projection_status: 'pass', projection_is_structural_evidence: false,
    reactivity_axis: 'pdb_reference_sequence_position', observed_residue_axis: false,
    base_mismatch_rows: 5, rmdb_unique_sequence_count: 1, rmdb_profile_count: 1, pdb_reference_id_count: 1
  };
  const indexRow = { pdbId: '8CBL', title: 'X', confidenceClass: 'high', confidenceScore: 1 };
  const reactivityEntries = [
    { profileKey: 'pf1', bundleProfileId: 'pf1', summaryPath: 'reactivity/pf1/summary.json', windows: [{ start: 1, end: 100, path: 'reactivity/pf1/pdb-pos-1-100.json' }] }
  ];
  const d = buildCaseDetail({ publicCase, indexRow, identityPct: 100, queryCoveragePct: 100, subjectCoveragePct: 100, reactivityEntries, alignmentPageCount: 3 });
  assert.equal(d.projectionStatus, 'pass');
  assert.equal(d.projectionIsStructuralEvidence, false);
  assert.equal(d.observedResidueAxis, false);
  assert.equal(d.residueMappingStatus, 'not-ready');
  assert.equal(d.confidenceClass, 'high');
  // case.json 内嵌反应性资产清单：前端据此知道有哪些 profileKey/window，无需扫描
  assert.equal(d.reactivity[0].profileKey, 'pf1');
  assert.equal(d.reactivity[0].windows[0].path, 'reactivity/pf1/pdb-pos-1-100.json');
  assert.equal(d.alignmentPageCount, 3);
});
```

> **反应性资产清单：** `buildCaseDetail` 接收生成侧已构造的 `reactivityEntries`（来自 A4 分组结果 + A5 profileKey）和 `alignmentPageCount`，把它们内嵌进 case.json。前端 store 据此清单拼路径调度，无需运行时扫描目录（契约禁止运行时扫描）。

> identity/coverage 来自 `alignment_pair_summary.tsv`（取代表行或均值，执行时确认聚合口径）。
- [ ] **步骤 2-4：失败→实现→通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 合并 case 详情并透传 projection 口径"`

---

## 阶段 B：生成脚本 IO 壳 + manifest

### 任务 B1：sha256 + 大小预算校验工具

**文件：** 修改 `scripts/lib/rmdb-case-corpus.mjs`；测试同上

- [ ] **步骤 1：编写失败的测试**

```js
import { sha256Hex, classifyAssetSize } from '../scripts/lib/rmdb-case-corpus.mjs';

test('sha256Hex stable for known string', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('classifyAssetSize flags large-asset-warning and hard limit', () => {
  assert.deepEqual(classifyAssetSize(10), { ok: true, warning: false });
  assert.deepEqual(classifyAssetSize(60 * 1024 * 1024), { ok: true, warning: true });
  assert.deepEqual(classifyAssetSize(101 * 1024 * 1024), { ok: false, warning: true });
});
```

- [ ] **步骤 2-4：失败→实现（用 `node:crypto` createHash）→通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): sha256 与文件大小预算校验"`

### 任务 B2：生成脚本主流程（写盘 + manifest）

**文件：**
- 创建：`scripts/build-rmdb-cases.mjs`
- 数据源路径：通过环境变量 `RMDB_JOIN_ROOT` / `RMDB_PUBLIC_ROOT` 覆盖，默认指向 `/Volumes/tianyi/04_foldbridge_data/...`（执行时若卷未挂载则报清晰错误并退出）

- [ ] **步骤 1：实现脚本**（无独立单测，靠纯函数库覆盖逻辑；脚本只做 IO 编排）：
  - 读 link/overview TSV → `selectDisplayableCases` → 过滤到 `SAMPLE_CASE_IDS`
  - 对每个 case：读 PUBLIC 5 个文件 → 构造 case.json/profiles.json/reactivity(按 profile 分组，每 profile 写 summary+windows 到 `reactivity/<profileKey>/`)/alignments(pages)
  - 写入 `src/assets/generated/rmdb-pdb-cases/`，每写一个资产计算 sha256 + size，累积进 manifest
  - 写 index.json（含全部样本索引行）+ manifest.json（含 source_package_id、schema version `rmdb-pdb-cases.v1`、generated_at、逐文件 path/size_bytes/sha256/large_asset_warning）
  - 任一资产 size ≥100MiB → 报错退出（契约硬要求）
- [ ] **步骤 2：运行脚本** — `node scripts/build-rmdb-cases.mjs`，预期生成 20 个 case 目录 + index.json + manifest.json，打印 case 数与总字节
- [ ] **步骤 3：人工抽查** — Read `index.json` 与一个 `cases/8CBL/case.json`，确认字段正确、projection 口径在位
- [ ] **步骤 4：Commit** — `git add scripts/build-rmdb-cases.mjs src/assets/generated/rmdb-pdb-cases && git commit -m "feat(rmdb-cases): 生成首批 20 个样本资产与 manifest"`

---

## 阶段 C：前端数据访问层

### 任务 C1：rmdbCaseStore 路径解析 + 加载（注入 fetch）

**文件：**
- 创建：`src/rmdbCaseStore.js`
- 测试：`test/rmdb-case-store.test.js`

> **路径约定（审查建议）：** 与现有 `dataAssetPath`（main.js:960 用相对 `./src/assets/data/...`）保持一致，store 默认基址用相对路径 `./src/assets/generated/rmdb-pdb-cases`，避免部署到子路径时绝对 `/dist/` 解析错误。`resolveAssetBase` 仅作可选覆盖入口；默认 `createCaseStore()` 不传 assetBase 时回退到该相对基址。

- [ ] **步骤 1：编写失败的测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseStore, DEFAULT_ASSET_BASE } from '../src/rmdbCaseStore.js';

test('DEFAULT_ASSET_BASE is the relative generated path', () => {
  assert.equal(DEFAULT_ASSET_BASE, './src/assets/generated/rmdb-pdb-cases');
});

test('store loads and caches index via injected fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ cases: [{ pdbId: '8CBL' }] }) }; };
  const store = createCaseStore({ fetchImpl });
  const a = await store.loadCaseIndex();
  await store.loadCaseIndex();
  assert.equal(a.cases[0].pdbId, '8CBL');
  assert.equal(calls, 1); // cached
});

test('store throws on non-ok response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  const store = createCaseStore({ fetchImpl });
  await assert.rejects(() => store.loadCase('NOPE'));
});
```

- [ ] **步骤 2-4：失败→实现（`loadCaseIndex()`/`loadCase(pdbId)`/`loadAlignmentPage(pdbId,n)`/`loadReactivityWindow(pdbId,profileKey,start,end)` + `loadReactivitySummary(pdbId,profileKey)` + Map 缓存 + 非 ok 抛错；reactivity 路径含 `reactivity/<profileKey>/`）→通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 浏览器侧资产加载 store"`

---

## 阶段 D：前端渲染改造

### 任务 D1：索引页重渲染 + confidence 徽章 + class 筛选

**文件：** 修改 `src/pdbCaseView.js`（`renderPdbCaseIndexPage`）；测试 `test/pdb-case-view.test.js`

- [ ] **步骤 1：编写失败的测试**（断言渲染含三色 class 徽章、筛选按钮 `data-confidence-filter`、表格行用 index 行字段、HTML 转义）
- [ ] **步骤 2-4：失败→实现→通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 索引页接入真实数据与 confidence 分级"`

### 任务 D2：详情页四模块渲染（保留 projection 警告）

**文件：** 修改 `src/pdbCaseView.js`（`renderPdbCasePage` + 新增比对视图渲染函数）；测试同上

- [ ] **步骤 1：编写失败的测试**（断言四模块：概览+质量字段、profile/provenance 表、反应性轨道预览、碱基比对表 + a11y caption；断言 projection 语义警告文案在位、3D 着色禁用说明在位、confidence 徽章在位）
- [ ] **步骤 2-4：失败→实现→通过**
- [ ] **步骤 5：Commit** — `git commit -m "feat(rmdb-cases): 详情页四模块与科学口径警告"`

### 任务 D3：main.js 接线 + 删除 demo

**文件：** 修改 `src/main.js`（`pdbCasePage` 1824-1828、`initApp` 2347、import 区 22-23/31）、`src/data.js`、`src/search/searchCorpus.js`

- [ ] **步骤 1：改 `pdbCasePage()`** 为异步接线。**遵循现有 `loadSequenceRows()` 模式**（main.js:38-41 模块级 `sequenceRows` state + 886 使用 + 2348 在 initApp 中 await 后同步 render）：`render()`（main.js:2154）与 `pageFor(route)`（1942-1958）是同步、字符串 inline 进 innerHTML，因此 store 异步数据不能在同步渲染路径里直接 await。新增模块级 state（如 `pdbCaseIndexState` / `pdbCaseDetailState` Map）缓存已加载结果；`pdbCasePage()` 同步读 state：命中则渲染数据，未命中则渲染 loading 占位并触发后台 `store.loadCaseIndex()/loadCase()`，完成后写入 state 再调 `render({preserveScroll:true})`。store 内部 Map 缓存防重复 fetch。详情页 alignment 翻页/反应性 window 同理按需 `loadAlignmentPage`/`loadReactivityWindow` 写入 state 后重渲染。绑定 `data-confidence-filter` 与 `data-alignment-page` 事件。
- [ ] **步骤 2：从 `src/data.js` 删除** `pdbCaseRows`、`pdbCaseDetailById`、`getPdbCaseDetail`、相关 PDB_CASE 常量中已不用者；更新 `DATA_VERSION`。
- [ ] **步骤 3：改 `searchCorpus.js`** 改为构建期从生成的 index.json 读取 pdb-case 文档（脚本侧），移除对 `pdbCaseRows`/`getPdbCaseDetail` 的 import。
- [ ] **步骤 4：更新测试** `test/data.test.js`（移除 demo 断言）、`test/search-corpus.test.js`（适配新来源）。
- [ ] **步骤 5：运行全量测试** — `node --test`，预期全 PASS
- [ ] **步骤 6：Commit** — `git commit -m "refactor(rmdb-cases): 移除手写 demo，主流程接入生成资产"`

---

## 阶段 E：构建接入与验证

### 任务 E1：package.json + verify-mvp 接入

**文件：** 修改 `package.json`、`scripts/verify-mvp.mjs`、`scripts/build-search-docs.mjs`（若搜索语料改为读 index.json）

- [ ] **步骤 1：package.json scripts** 加 `"build:rmdb-cases": "node scripts/build-rmdb-cases.mjs"` 作为**独立手动脚本，不加入 `build:site` 主链**（已与用户确认：CI/他人环境无外接卷 `/Volumes/tianyi`，生成产物已 commit 进仓库，CI 读取已提交的 `index.json`，不重跑生成）。`build:site` 链保持原样（`build:static && build:search-docs && build:search-index`），仅确保 `build:search-docs` 能读到已提交的 `index.json`。
- [ ] **步骤 2：verify-mvp.mjs** 加必需产物：`src/assets/generated/rmdb-pdb-cases/index.json`、`.../manifest.json`、至少一个 `cases/*/case.json`。
- [ ] **步骤 3：Commit** — `git commit -m "build(rmdb-cases): 接入构建链与 MVP 校验"`

### 任务 E2：端到端验证

- [ ] **步骤 1：完整构建** — `npm run build`，预期生成 dist/ 含生成资产且无 ≥100MiB 报错
- [ ] **步骤 2：MVP 守卫** — `npm run verify:mvp`，预期 PASS
- [ ] **步骤 3：全量测试** — `npm test`，预期全 PASS
- [ ] **步骤 4：本地起服务人工核验** — `npm run serve -- --port 8080`，访问 `http://127.0.0.1:8080/dist/#pdb-case`，确认：索引页 20 个 case + 三色徽章 + 筛选可用；点开 8CBL/8A57/5T7V 详情页四模块加载正常、projection 警告在位、反应性轨道渲染、比对翻页工作。
- [ ] **步骤 5：清理临时文件，最终 Commit（若有遗留改动）**

---

## 验证策略总览

- **纯函数库**（阶段 A/B1）：`test/rmdb-case-corpus.test.js` 全覆盖筛选/降采样/切片/分页/合并/sha256/大小预算。
- **store**（阶段 C）：注入 mock fetch，测路径解析与缓存。
- **渲染**（阶段 D）：字符串断言四模块 + 科学口径文案 + 徽章 + 转义。
- **集成**（阶段 E）：`npm run build` + `npm run verify:mvp` + `npm test` 三绿 + 人工浏览器核验。
- **契约合规**：manifest 含逐文件 sha256/size/warning；无 ≥100MiB 资产；输出只进 `src/assets/generated/`，不回写 `src/data.js`。

## 风险与待执行时确认项

1. ~~`rmdb_sequence_members.tsv` 是否有 `modifier` 列~~ — **已核实（A5 执行时）：members 无 `modifier` 也无 `bundle_profile_id` 列。profile 维度来自 `provenance_index.tsv` 的 `bundle_profile_id`，经 `bundle_sequence_id` 关联 members 取序列统计（sequence_length/identity_fraction/coverage）；探针类型（2A3/DMS 等）由 `rdat_file` 名承载。`buildProfiles({provenance,members})` 据此实现，偏离计划原示例测试数据。
2. ~~identity/coverage 聚合口径~~ — **已核实（A6 执行时）：`alignment_pair_summary.tsv` 每行一个 bundle_sequence×pdb_ref，含 identity_fraction/rmdb_query_coverage/pdb_subject_coverage/evalue/bitscore。`selectBestHitPair` 取最高 bitscore（平局取最低 evalue）作 case 代表行，与 case.json 的 candidate_selection_policy 一致。
3. 外接卷 `/Volumes/tianyi/...` 在 CI/他人环境不可用 — 生成脚本是 build-time 本地步骤；生成产物已 commit 进仓库，CI 的 `npm run build` 不应重跑生成（E1 中 build 链是否含 build:rmdb-cases 需决策：**倾向构建链不含它**，改为独立手动脚本，避免 CI 因缺卷失败；E1 步骤 1 据此调整为不加入 build:site，仅留独立 script）。**执行任务 E1 前与用户确认这一点。**
