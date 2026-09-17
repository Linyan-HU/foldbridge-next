# ANNOCONFIDENCE ANNOJOIN Static Atlas 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 `docs/foldbridge` 静态站中接入 `ANNOCONFIDENCE` / `ANNOJOIN` V2.1，按固定页面边界展示 RMDB2PDB Line A 的搜索、case 详情、profile、1D/2D/3D evidence、preset、conflict 和下载信息。

**架构：** 站点保持纯静态 ES module / GitHub Pages 兼容，不引入必须在线运行的 Next/API 服务。构建期从 `ANNOJOIN` 小表和经过预切的 `ANNOCONFIDENCE` case 级资产生成 `src/assets/generated/annojoin-atlas/`；浏览器运行时只读取静态 JSON 小资产并懒加载详情 tab。`ANNOCONFIDENCE` 原始大表不进入浏览器 bundle，动态导出和全量大表查询只作为后端/API 扩展边界记录，不作为静态站首版完成条件。

**技术栈：** Node.js ES modules、`node:test`、静态 JSON/TSV 构建资产、Pagefind、现有 hash router、现有 `src/assets/generated/rmdb-pdb-cases` 静态资产模式、可选 Mol* 静态 viewer 接线。

---

## 展示验收边界

本计划使用“列表页 + case 详情页 tabs + 全局工作台页”的方案。下面这张表是展示验收边界，不能在实现时压缩成只有列表页或只有详情页。

| 页面 | 展示什么 | 用什么展示 | 主数据 |
|---|---|---|---|
| `/atlas/rmdb2pdb` 列表/搜索页 | 1,126 个 case、PDB ID、source、assay family、RNA family/motif/structure class、`profile_count`、claim/coverage 摘要、是否有 LSS/3D | 搜索框 + facet 侧栏 + 虚拟化 DataGrid + 状态 badge | `ANNOJOIN/anno_case_search_index.tsv`、`ANNOJOIN/anno_facet_catalog.tsv` |
| case 详情 Overview | case 摘要、profile/pair/residue evidence 数、claim ceiling 分布、coverage 分布、默认 preset、各 evidence route | 顶部 summary strip + 小型分布图 + route 状态表 | `ANNOJOIN/anno_case_evidence_summary.tsv`、`ANNOJOIN/anno_detail_route_index.tsv` |
| Profiles tab | case 下完整 profile membership，不使用 `profile_ids` 预览当全集 | 分页/虚拟化表格，按 `pair_id` / `profile_id` 筛选 | `ANNOJOIN/anno_case_profile_membership.tsv` |
| Evidence / mapped residue tab | PDB residue、profile residue、numeric value、mapping uncertainty、coordinate key、claim ceiling、coverage | 虚拟化明细表 + 可折叠 provenance 列 + warning badge | `ANNOCONFIDENCE/assay_numeric_usability_annotation.tsv`、`mapping_uncertainty_annotation.tsv`、`fec_claim_boundary_annotation.tsv`、`coverage_topology_annotation.tsv` |
| 1D Reactivity tab | residue-level reactivity track、numeric status、颜色策略 | residue 轴线图/heatmap + 表格联动 | `ANNOJOIN/anno_residue_track_route_index.tsv` -> numeric annotation |
| 2D Pair Context tab | paired/unpaired context、pair arc、residue hover；dot-bracket 只在 route 支持时启用 | arc diagram + residue hover panel，dot-bracket 作为条件视图 | `ANNOJOIN/anno_2d_pair_context_route_index.tsv`、`ANNOCONFIDENCE/lss_structure_context_annotation.tsv` |
| 3D Viewer tab | mmCIF 结构、residue coloring、coordinate-key 对齐、legend | Mol* viewer，静态站提供 mmCIF 路径和 residue-color payload；缺资产时明确 disabled | `ANNOJOIN/anno_3d_residue_coloring_route_index.tsv`、`CONFIDENCE/10_structure_context/...` |
| Preset / View Builder | 6 个 Atlas preset、可编辑 filter、结果预览；明确 preset 不改 Core truth | preset toolbar + filter builder + 结果 DataGrid | `ANNOJOIN/atlas_preset_view_definitions.tsv`、`ANNOJOIN/anno_facet_catalog.tsv` |
| Conflict Review | discordance candidate、status、review route、候选原因 | review queue 表 + 链接到 1D/2D/3D 证据 | `ANNOJOIN/anno_conflict_candidate_index.tsv`、`ANNOCONFIDENCE/conflict_discordance_annotation.tsv` |
| Downloads | 静态 manifest 下载、行数、SHA256、license；当前筛选结果动态导出 | download manifest table + export job 状态；静态站首版仅显示 manifest 和 filter recipe | `ANNOJOIN/atlas_download_manifest.tsv` + 当前 filter |

## 静态站兼容边界

- 本仓库是静态站：运行时入口是 `index.html` + `src/*.js`，构建脚本复制到 `dist/`，Pages 发布 `_site/`。
- 首版不得依赖运行中的 API 服务；若需要“当前筛选动态导出”，页面只显示 filter recipe、source version 和“requires backend export”状态。
- 大表处理必须在构建期完成预切：原始 `ANNOCONFIDENCE/assay_numeric_usability_annotation.tsv` 约 21M 行、`mapping_uncertainty_annotation.tsv` 约 16M 行，不能直接进入 `dist/` 或被浏览器整表 fetch。
- 复用现有 `src/assets/generated/rmdb-pdb-cases` 原则：`index.json` 轻量、case 详情拆小文件、`manifest.json` 带 `path` / `size_bytes` / `sha256`，单资产 50 MiB warning、100 MiB fail。
- 如果远端 `/data/hsBack/05_devSpace/04_foldbridge_data` 没有挂载到本机，构建脚本必须给出清晰错误；测试用 fixture 不依赖远端。
- 不改变数据口径：`ANNOJOIN` 是 Atlas/web-facing join 产品，`ANNOCONFIDENCE` 是 Core annotation 产品；preset 不覆盖 `fec_claim_ceiling`，`profile_ids` 只是 bounded preview。

## 文件职责

- 创建：`scripts/lib/annojoin-atlas-corpus.mjs`
  - 纯函数库：TSV 解析、schema 校验、case index 构造、facet/preset/filter 构造、route 聚合、profile membership 聚合、case 级 evidence 预切、资产大小和 SHA256。
- 创建：`scripts/build-annojoin-atlas.mjs`
  - 构建期 IO 壳：读取 `ANNOJOIN` / `ANNOCONFIDENCE` 输入，写 `src/assets/generated/annojoin-atlas/` 静态资产和 manifest。
- 修改：`package.json`
  - 新增 `build:annojoin-atlas`，并决定是否把它串入 `build:site`。首版建议不默认串入，避免没有数据卷时阻断普通站点构建；发布前用显式命令生成。
- 创建：`src/annojoinAtlasStore.js`
  - 浏览器侧静态资产 store：加载 index、facets、presets、downloads、case summary、profiles、evidence pages、1D/2D/3D routes、conflicts。
- 创建：`src/annojoinAtlasView.js`
  - 纯渲染函数：列表页、详情页 tabs、preset workspace、conflict queue、downloads table、disabled-state 和 warning-state。
- 修改：`src/router.js`
  - 增加静态 hash route：`atlas-rmdb2pdb`、`atlas-rmdb2pdb-case`、`atlas-rmdb2pdb-workbench`。
- 修改：`src/main.js`
  - 接入新 store/view，添加 route 分发、加载状态、hash 参数、tab 状态、facet/preset state。
- 修改：`src/search/searchCorpus.js`
  - 将 Atlas case index 作为 Pagefind search docs 的轻量来源，保证搜索结果能跳到新 route。
- 修改：`scripts/build-search-docs.mjs`
  - 在 `annojoin-atlas/index.json` 存在时生成 case 搜索文档；不存在时跳过并保留普通站点构建。
- 修改：`scripts/verify-mvp.mjs`
  - 增加 Atlas 资产存在性、manifest schema、route token、禁止大表进入 `dist` 的回归检查。
- 测试：`test/annojoin-atlas-corpus.test.js`
  - 覆盖构建纯函数和静态资产契约。
- 测试：`test/annojoin-atlas-store.test.js`
  - 覆盖静态资产路径、缓存、错误处理。
- 测试：`test/annojoin-atlas-view.test.js`
  - 覆盖页面边界表中的每个页面/功能视图。
- 测试：`test/router.test.js`
  - 覆盖新增 route normalization 和 hash 参数。
- 测试：`test/search-corpus.test.js`
  - 覆盖 Atlas case 搜索文档。

## 静态资产契约

生成根：

```text
src/assets/generated/annojoin-atlas/
```

目标结构：

```text
index.json
facets.json
presets.json
downloads.json
manifest.json
cases/{case_id}/summary.json
cases/{case_id}/profiles/page-0001.json
cases/{case_id}/evidence/page-0001.json
cases/{case_id}/tracks/index.json
cases/{case_id}/tracks/{track_route_slug}/summary.json
cases/{case_id}/pair-context/index.json
cases/{case_id}/pair-context/{context_route_slug}/summary.json
cases/{case_id}/structure/index.json
cases/{case_id}/structure/{structure_route_slug}/residue-colors.json
cases/{case_id}/conflicts/page-0001.json
```

`index.json` 必须包含：

```json
{
  "schema_version": "annojoin-atlas.v1",
  "source_version": "V2.1_RMDB_LINE_A_20260617",
  "generated_at": "ISO-8601",
  "total_cases": 1126,
  "facet_count": 12,
  "preset_count": 6,
  "cases": []
}
```

每个 case row 至少包含：

```text
caseUid
caseId
pdbId
pdbChainIds
sourceDatabases
assayFamilySet
rnaFamilyLabel
rnaFamilyProvenance
motifLabel
motifProvenance
structureClassLabel
structureClassProvenance
profilePreviewIds
profileCount
profileIdsComplete
profileMembershipRouteId
fecClaimCeilingDistribution
coverageShapeDistribution
conflictCandidateCount
hasContextAnnotation
hasLssAnnotation
detailHref
searchText
```

## 任务 1：锁定 Atlas 数据契约测试

**文件：**
- 创建：`test/annojoin-atlas-corpus.test.js`
- 创建：`scripts/lib/annojoin-atlas-corpus.mjs`

- [ ] **步骤 1：编写失败测试：解析 ANNOJOIN 小表并构造 case index**

在测试中用内联 fixture 表示 `anno_case_search_index.tsv` 和 `anno_facet_catalog.tsv`。必须覆盖：

```js
assert.equal(index.total_cases, 2);
assert.equal(index.facet_count, 2);
assert.equal(index.cases[0].caseId, '10ZT');
assert.equal(index.cases[0].profileCount, 1);
assert.equal(index.cases[0].profileIdsComplete, true);
assert.equal(index.cases[0].detailHref, '#atlas-rmdb2pdb-case?caseId=10ZT');
```

- [ ] **步骤 2：编写失败测试：`profile_ids` 是 preview，不是完整 membership**

```js
assert.equal(index.cases[1].profileIdsComplete, false);
assert.equal(index.cases[1].profileMembershipRouteId, 'annojoin:profiles:RMDB2PDB:10ZU');
assert.ok(index.cases[1].profilePreviewIds.length < index.cases[1].profileCount);
```

- [ ] **步骤 3：运行测试验证失败**

运行：

```bash
npm test -- test/annojoin-atlas-corpus.test.js
```

预期：FAIL，原因是 `scripts/lib/annojoin-atlas-corpus.mjs` 尚未导出目标函数。

- [ ] **步骤 4：实现最少纯函数**

在 `scripts/lib/annojoin-atlas-corpus.mjs` 中实现：

```js
export function parseTsv(text) { /* header-keyed TSV parser */ }
export function buildAtlasIndex({ searchRows, facetRows, generatedAt }) { /* returns index */ }
export function splitList(value) { /* ; separated list */ }
export function toBool(value) { return String(value).toLowerCase() === 'true'; }
```

- [ ] **步骤 5：运行测试验证通过**

运行：

```bash
npm test -- test/annojoin-atlas-corpus.test.js
```

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add scripts/lib/annojoin-atlas-corpus.mjs test/annojoin-atlas-corpus.test.js
git commit -m "test: lock annojoin atlas index contract"
```

## 任务 2：实现构建期静态资产生成器

**文件：**
- 创建：`scripts/build-annojoin-atlas.mjs`
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`
- 修改：`package.json`
- 测试：`test/annojoin-atlas-corpus.test.js`

- [ ] **步骤 1：编写失败测试：manifest 和资产大小契约**

测试 `buildManifestAssetEntry(relPath, buffer)`：

```js
const entry = buildManifestAssetEntry('index.json', Buffer.from('{}'));
assert.equal(entry.path, 'index.json');
assert.equal(typeof entry.size_bytes, 'number');
assert.match(entry.sha256, /^[a-f0-9]{64}$/);
assert.equal(classifyAssetSize(60 * 1024 * 1024).warning, true);
assert.equal(classifyAssetSize(101 * 1024 * 1024).ok, false);
```

- [ ] **步骤 2：实现构建脚本输入边界**

`scripts/build-annojoin-atlas.mjs` 使用环境变量：

```text
FOLDBRIDGE_ANNO_ROOT=/Volumes/tianyi/04_foldbridge_data
FOLDBRIDGE_ANNOJOIN_ROOT=$FOLDBRIDGE_ANNO_ROOT/ANNOJOIN
FOLDBRIDGE_ANNOCONFIDENCE_ROOT=$FOLDBRIDGE_ANNO_ROOT/ANNOCONFIDENCE
```

默认值可以指向 `/Volumes/tianyi/04_foldbridge_data`，但缺失时必须输出：

```text
[build-annojoin-atlas] FOLDBRIDGE_ANNOJOIN_ROOT 不存在：...
请挂载 04_foldbridge_data 或设置 FOLDBRIDGE_ANNOJOIN_ROOT 后重试。
```

- [ ] **步骤 3：生成首批小资产**

读取并生成：

```text
ANNOJOIN/anno_case_search_index.tsv -> index.json
ANNOJOIN/anno_facet_catalog.tsv -> facets.json
ANNOJOIN/atlas_preset_view_definitions.tsv -> presets.json
ANNOJOIN/atlas_download_manifest.tsv -> downloads.json
ANNOJOIN/anno_case_evidence_summary.tsv + anno_detail_route_index.tsv -> cases/{case_id}/summary.json
```

暂不切 `ANNOCONFIDENCE` 大表。

- [ ] **步骤 4：给 `package.json` 增加显式命令**

```json
"build:annojoin-atlas": "node scripts/build-annojoin-atlas.mjs"
```

首版不要把它加入 `build`，避免普通 GitHub Pages 构建在无数据卷时失败。

- [ ] **步骤 5：运行测试和构建 smoke**

运行：

```bash
npm test -- test/annojoin-atlas-corpus.test.js
FOLDBRIDGE_ANNO_ROOT=/Volumes/tianyi/04_foldbridge_data npm run build:annojoin-atlas
```

预期：

```text
[build-annojoin-atlas] index 1126 cases, facets 12, presets 6, downloads 24
```

- [ ] **步骤 6：Commit**

```bash
git add package.json scripts/build-annojoin-atlas.mjs scripts/lib/annojoin-atlas-corpus.mjs test/annojoin-atlas-corpus.test.js src/assets/generated/annojoin-atlas
git commit -m "feat: generate static annojoin atlas assets"
```

## 任务 3：浏览器侧静态 store

**文件：**
- 创建：`src/annojoinAtlasStore.js`
- 创建：`test/annojoin-atlas-store.test.js`

- [ ] **步骤 1：编写失败测试：相对路径和缓存**

```js
import { createAnnojoinAtlasStore, DEFAULT_ANNOJOIN_ATLAS_BASE } from '../src/annojoinAtlasStore.js';

assert.equal(DEFAULT_ANNOJOIN_ATLAS_BASE, './src/assets/generated/annojoin-atlas');
```

测试 `loadIndex()` 连续调用只 fetch 一次。

- [ ] **步骤 2：编写失败测试：case 级资产路径**

```js
await store.loadCaseSummary('10ZT');
await store.loadProfilePage('10ZT', 1);
await store.loadEvidencePage('10ZT', 1);
await store.loadTrackIndex('10ZT');
await store.loadPairContextIndex('10ZT');
await store.loadStructureIndex('10ZT');
await store.loadConflictPage('10ZT', 1);
```

预期 URL 分别为：

```text
/base/cases/10ZT/summary.json
/base/cases/10ZT/profiles/page-0001.json
/base/cases/10ZT/evidence/page-0001.json
/base/cases/10ZT/tracks/index.json
/base/cases/10ZT/pair-context/index.json
/base/cases/10ZT/structure/index.json
/base/cases/10ZT/conflicts/page-0001.json
```

- [ ] **步骤 3：实现 store**

参考 `src/rmdbCaseStore.js`，实现 `loadJson()`、内存 cache、非 2xx 错误消息。

- [ ] **步骤 4：运行测试验证通过**

```bash
npm test -- test/annojoin-atlas-store.test.js
```

- [ ] **步骤 5：Commit**

```bash
git add src/annojoinAtlasStore.js test/annojoin-atlas-store.test.js
git commit -m "feat: add annojoin atlas static asset store"
```

## 任务 4：列表页与 facet 视图

**文件：**
- 创建：`src/annojoinAtlasView.js`
- 创建：`test/annojoin-atlas-view.test.js`
- 修改：`src/router.js`
- 修改：`test/router.test.js`
- 修改：`src/main.js`

- [ ] **步骤 1：编写失败测试：列表页必须呈现展示边界字段**

```js
const html = renderAtlasCaseIndexPage({ cases, facets, activeFilters: {} });
assert.match(html, /RMDB2PDB Atlas/);
assert.match(html, /10ZT/);
assert.match(html, /profile_count/i);
assert.match(html, /FEC claim ceiling/i);
assert.match(html, /LSS/i);
assert.match(html, /data-atlas-case-id="10ZT"/);
```

- [ ] **步骤 2：编写失败测试：facet 来源和 provenance 显示**

```js
assert.match(html, /Probe type/);
assert.match(html, /assay_numeric_usability_annotation.tsv/);
assert.match(html, /provenance required/i);
```

- [ ] **步骤 3：新增 route**

在 `src/router.js` 的 `ALLOWED_ROUTES` 增加：

```js
'atlas-rmdb2pdb',
'atlas-rmdb2pdb-case',
'atlas-rmdb2pdb-workbench'
```

新增 builder：

```js
export function buildAtlasCaseHash({ caseId, tab } = {}) { ... }
```

- [ ] **步骤 4：实现列表视图**

`renderAtlasCaseIndexPage()` 输出静态 HTML：

- 搜索框使用 `search_text`。
- Facet 侧栏使用 `facets.json`，显示 `display_label`、`facet_group`、`source_table`、`source_column`。
- 表格显示 `pdbId`、`sourceDatabases`、`assayFamilySet`、`rnaFamilyLabel`、`motifLabel`、`structureClassLabel`、`profileCount`、`fecClaimCeilingDistribution`、`hasLssAnnotation`、`conflictCandidateCount`。
- `profile_ids` 只显示为 preview，并标注完整成员来自 membership route。
- 首版可用普通 table + client pagination；如果行数性能不足，再做 DOM windowing。不要引入大型 grid 依赖。

- [ ] **步骤 5：接入 `src/main.js`**

新增 index state：

```js
const annojoinAtlasStore = createAnnojoinAtlasStore();
let annojoinAtlasIndexState = null;
let annojoinAtlasFacetState = null;
```

route `atlas-rmdb2pdb` 加载 `index.json` / `facets.json` 后渲染。

- [ ] **步骤 6：运行测试**

```bash
npm test -- test/router.test.js test/annojoin-atlas-view.test.js
```

- [ ] **步骤 7：Commit**

```bash
git add src/router.js src/main.js src/annojoinAtlasView.js test/router.test.js test/annojoin-atlas-view.test.js
git commit -m "feat: render annojoin atlas case index"
```

## 任务 5：case 详情页 tabs

**文件：**
- 修改：`src/annojoinAtlasView.js`
- 修改：`src/main.js`
- 修改：`test/annojoin-atlas-view.test.js`

- [ ] **步骤 1：编写失败测试：Overview tab**

```js
const html = renderAtlasCasePage({ summary, activeTab: 'overview' });
assert.match(html, /recommended_default_preset/i);
assert.match(html, /profile/i);
assert.match(html, /route status/i);
assert.match(html, /annojoin:fec:RMDB2PDB:10ZT/);
```

- [ ] **步骤 2：编写失败测试：全部 tabs 都可见**

```js
for (const label of ['Overview', 'Profiles', 'Evidence', '1D Reactivity', '2D Pair Context', '3D Viewer', 'Conflicts', 'Downloads']) {
  assert.match(html, new RegExp(label));
}
```

- [ ] **步骤 3：实现详情 shell**

`renderAtlasCasePage()` 负责标题、summary strip、tab nav、当前 tab body。tab 切换通过 hash 参数：

```text
#atlas-rmdb2pdb-case?caseId=10ZT&tab=profiles
```

- [ ] **步骤 4：接入 lazy loading**

`src/main.js` 只加载当前 tab 需要的 asset：

- `overview`: `summary.json`
- `profiles`: `profiles/page-0001.json`
- `evidence`: `evidence/page-0001.json`
- `1d`: `tracks/index.json`
- `2d`: `pair-context/index.json`
- `3d`: `structure/index.json`
- `conflicts`: `conflicts/page-0001.json`
- `downloads`: global `downloads.json` + case filter

- [ ] **步骤 5：运行测试**

```bash
npm test -- test/annojoin-atlas-view.test.js
```

- [ ] **步骤 6：Commit**

```bash
git add src/main.js src/annojoinAtlasView.js test/annojoin-atlas-view.test.js
git commit -m "feat: add annojoin atlas case detail tabs"
```

## 任务 6：profile membership 和 evidence 预切

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`
- 修改：`scripts/build-annojoin-atlas.mjs`
- 修改：`src/annojoinAtlasView.js`
- 修改：`test/annojoin-atlas-corpus.test.js`
- 修改：`test/annojoin-atlas-view.test.js`

- [ ] **步骤 1：编写失败测试：membership 聚合与 preview 分离**

fixture 中设置 `profile_ids_complete=false`，membership 有 5 行。断言：

```js
assert.equal(profileAsset.total_profiles, 5);
assert.equal(profileAsset.preview_is_complete, false);
assert.doesNotMatch(JSON.stringify(profileAsset), /bundle_/);
```

说明：如果真实 `profile_id` 中包含历史 `bundle_*`，构建器必须按 handoff 约束确认 web 展示列不输出 `bundle_*` 作为 RMDB profile ID。

- [ ] **步骤 2：编写失败测试：evidence 资产按 case 分页**

预切后的 `cases/10ZT/evidence/page-0001.json` 必须包含：

```text
pdb_residue_coordinate_key
reactivity_value
numeric_status
mapping_uncertainty_summary
fec_claim_ceiling
coverage_shape
provenance_path
```

- [ ] **步骤 3：实现 profile 分页**

读取 `ANNOJOIN/anno_case_profile_membership.tsv`，按 `case_id` 分组写：

```text
cases/{case_id}/profiles/page-0001.json
```

每页建议 200 行。

- [ ] **步骤 4：实现 evidence case 级预切**

首版只对 `SAMPLE_CASE_IDS` 或配置的 `FOLDBRIDGE_ATLAS_DETAIL_CASE_IDS` 生成 evidence 明细，避免一次性生成巨大静态包。全量详情资产需另设 gate。

按 `case_id` 从以下大表流式过滤并 join：

```text
ANNOCONFIDENCE/assay_numeric_usability_annotation.tsv
ANNOCONFIDENCE/mapping_uncertainty_annotation.tsv
ANNOCONFIDENCE/fec_claim_boundary_annotation.tsv
ANNOCONFIDENCE/coverage_topology_annotation.tsv
```

不要把原始大表复制到 `src/assets/generated/annojoin-atlas`。

- [ ] **步骤 5：渲染 Profiles / Evidence tab**

Profiles tab 使用分页表格；Evidence tab 使用分页表格 + provenance 折叠列 + warning badge。

- [ ] **步骤 6：运行测试和构建 smoke**

```bash
npm test -- test/annojoin-atlas-corpus.test.js test/annojoin-atlas-view.test.js
FOLDBRIDGE_ANNO_ROOT=/Volumes/tianyi/04_foldbridge_data FOLDBRIDGE_ATLAS_DETAIL_CASE_IDS=10ZT,10ZU npm run build:annojoin-atlas
```

- [ ] **步骤 7：Commit**

```bash
git add scripts/build-annojoin-atlas.mjs scripts/lib/annojoin-atlas-corpus.mjs src/annojoinAtlasView.js test/annojoin-atlas-corpus.test.js test/annojoin-atlas-view.test.js src/assets/generated/annojoin-atlas
git commit -m "feat: add annojoin profile and evidence assets"
```

## 任务 7：1D / 2D / 3D route 展示

**文件：**
- 修改：`scripts/lib/annojoin-atlas-corpus.mjs`
- 修改：`scripts/build-annojoin-atlas.mjs`
- 修改：`src/annojoinAtlasView.js`
- 修改：`src/main.js`
- 修改：`test/annojoin-atlas-corpus.test.js`
- 修改：`test/annojoin-atlas-view.test.js`

- [ ] **步骤 1：编写失败测试：route index 行数和 case 分组**

fixture 覆盖：

```js
assert.equal(trackIndex.routes.length, 2);
assert.equal(trackIndex.routes[0].supports1d, true);
assert.equal(pairContextIndex.routes[0].supportsPairArcView, true);
assert.equal(structureIndex.routes[0].structureFilePath.startsWith('CONFIDENCE/10_structure_context/'), true);
```

- [ ] **步骤 2：构建 route 静态资产**

读取：

```text
ANNOJOIN/anno_residue_track_route_index.tsv
ANNOJOIN/anno_2d_pair_context_route_index.tsv
ANNOJOIN/anno_3d_residue_coloring_route_index.tsv
```

按 `case_id` 输出 index。首版只生成 route metadata；具体 residue-color payload 对 `FOLDBRIDGE_ATLAS_DETAIL_CASE_IDS` 预切。

- [ ] **步骤 3：渲染 1D tab**

显示 track list、`track_type`、`track_route_id`、`color_policy_id`、`supports_table`，有 summary 时画 bounded heatmap。

- [ ] **步骤 4：渲染 2D tab**

显示 pair context list、`context_engine`、`supports_pair_arc_view`、`supports_dot_bracket_view`、`supports_residue_hover`。只有 `supports_dot_bracket_view=true` 时显示 dot-bracket 面板，否则显示 disabled state。

- [ ] **步骤 5：渲染 3D tab**

显示 structure route、mmCIF path、viewer compatibility、coordinate key column、value column、legend policy。若静态站没有复制 mmCIF，则按钮显示“structure path verified upstream, static file not bundled”。若后续决定捆绑 mmCIF，再单独接 Mol*。

- [ ] **步骤 6：运行测试**

```bash
npm test -- test/annojoin-atlas-corpus.test.js test/annojoin-atlas-view.test.js
```

- [ ] **步骤 7：Commit**

```bash
git add scripts/build-annojoin-atlas.mjs scripts/lib/annojoin-atlas-corpus.mjs src/main.js src/annojoinAtlasView.js test/annojoin-atlas-corpus.test.js test/annojoin-atlas-view.test.js
git commit -m "feat: add annojoin evidence route tabs"
```

## 任务 8：Preset 工作台、Conflict Review、Downloads

**文件：**
- 修改：`src/annojoinAtlasView.js`
- 修改：`src/main.js`
- 修改：`src/router.js`
- 修改：`test/annojoin-atlas-view.test.js`
- 修改：`test/router.test.js`

- [ ] **步骤 1：编写失败测试：Preset 不覆盖 Core truth**

```js
const html = renderAtlasWorkbenchPage({ presets, facets, cases });
assert.match(html, /Preset is an Atlas view/i);
assert.match(html, /does not overwrite FEC claim ceilings/i);
assert.match(html, /balanced_segment_view/);
```

- [ ] **步骤 2：编写失败测试：Conflict Review 是候选队列**

```js
const html = renderAtlasConflictQueue({ conflicts });
assert.match(html, /candidate/);
assert.match(html, /review_lss_signal_context/);
assert.match(html, /does not prove biological truth/i);
```

- [ ] **步骤 3：编写失败测试：Downloads manifest**

```js
const html = renderAtlasDownloads({ downloads, currentFilter: "case_id == '10ZT'" });
assert.match(html, /sha256/i);
assert.match(html, /row_count/i);
assert.match(html, /requires backend export/i);
```

- [ ] **步骤 4：实现工作台 route**

`#atlas-rmdb2pdb-workbench` 显示 preset toolbar、filter builder、结果预览和 source version。filter builder 首版只做客户端 index 过滤，不解释复杂表达式；复杂表达式显示为 preset recipe。

- [ ] **步骤 5：实现 conflict 和 downloads tab**

Conflict tab 从 case page 和 workbench 都可进入。Downloads tab 显示 manifest 下载项；当前筛选动态导出只显示 filter recipe 和后端需求。

- [ ] **步骤 6：运行测试**

```bash
npm test -- test/annojoin-atlas-view.test.js test/router.test.js
```

- [ ] **步骤 7：Commit**

```bash
git add src/main.js src/router.js src/annojoinAtlasView.js test/annojoin-atlas-view.test.js test/router.test.js
git commit -m "feat: add annojoin atlas workbench"
```

## 任务 9：Pagefind 搜索集成

**文件：**
- 修改：`src/search/searchCorpus.js`
- 修改：`scripts/build-search-docs.mjs`
- 修改：`test/search-corpus.test.js`

- [ ] **步骤 1：编写失败测试：Atlas case 搜索文档**

```js
const docs = buildAtlasCaseSearchDocs(index);
assert.equal(docs[0].url, '#atlas-rmdb2pdb-case?caseId=10ZT');
assert.match(docs[0].body, /RMDB2PDB/);
assert.match(docs[0].body, /rmdb chemical probing/);
```

- [ ] **步骤 2：实现可选搜索文档生成**

`scripts/build-search-docs.mjs` 在 `src/assets/generated/annojoin-atlas/index.json` 存在时追加 docs；不存在时跳过，不让普通 `npm run build` 失败。

- [ ] **步骤 3：运行测试和 build**

```bash
npm test -- test/search-corpus.test.js
npm run build
```

预期：Pagefind build 仍通过；无 Atlas 资产时 build 不失败，有 Atlas 资产时 search docs 包含 Atlas case。

- [ ] **步骤 4：Commit**

```bash
git add src/search/searchCorpus.js scripts/build-search-docs.mjs test/search-corpus.test.js
git commit -m "feat: index annojoin atlas cases for search"
```

## 任务 10：验证、文档和发布 gate

**文件：**
- 修改：`scripts/verify-mvp.mjs`
- 修改：`README.md`
- 创建：`docs/annojoin-atlas-static-site-contract-20260617.md`

- [ ] **步骤 1：编写失败验证：禁止大表进入 dist**

`verify-mvp.mjs` 检查：

```text
dist/src/assets/generated/annojoin-atlas/ANNOCONFIDENCE
dist/src/assets/generated/annojoin-atlas/assay_numeric_usability_annotation.tsv
dist/src/assets/generated/annojoin-atlas/mapping_uncertainty_annotation.tsv
```

均不得存在。

- [ ] **步骤 2：增加 Atlas manifest 验证**

如果 `src/assets/generated/annojoin-atlas/manifest.json` 存在，则验证：

- 每个 asset 有 `path`、`size_bytes`、`sha256`。
- 无 asset 大于 100 MiB。
- `index.total_cases == 1126`。
- `facets.length == 12`。
- `presets.length == 6`。
- `downloads.length == 24`。

- [ ] **步骤 3：更新 README**

增加显式构建命令：

```bash
FOLDBRIDGE_ANNO_ROOT=/Volumes/tianyi/04_foldbridge_data npm run build:annojoin-atlas
npm run build
npm run verify:mvp
```

并写明 GitHub Pages 普通构建不依赖远端数据卷。

- [ ] **步骤 4：写静态站数据契约文档**

`docs/annojoin-atlas-static-site-contract-20260617.md` 必须说明：

- 页面边界与本计划一致。
- `ANNOJOIN` 是网页入口。
- `ANNOCONFIDENCE` 是构建期/服务端 evidence 来源，不是浏览器大表入口。
- 动态导出、全量大表查询、在线 API 不是静态站首版完成条件。
- 生产公开仍需单独 gate，不等于覆盖 `PUBLIC/rmdb2pdb_export`。

- [ ] **步骤 5：运行完整验证**

```bash
npm test
npm run build
npm run verify:mvp
```

如果已生成 Atlas 资产，再运行：

```bash
FOLDBRIDGE_ANNO_ROOT=/Volumes/tianyi/04_foldbridge_data npm run build:annojoin-atlas
npm run build
npm run verify:mvp
```

- [ ] **步骤 6：Commit**

```bash
git add scripts/verify-mvp.mjs README.md docs/annojoin-atlas-static-site-contract-20260617.md
git commit -m "docs: document annojoin atlas static site gate"
```

## 完成定义

- 页面边界表中的 10 个页面/功能均有静态站展示或明确 disabled/backend-required 状态。
- 列表页显示 1,126 个 case，facet 12 个，preset 6 个，download manifest 24 行。
- `profile_ids` 不被当作完整 profile 列表；完整 membership 来自 profile membership 资产。
- 浏览器不直接 fetch `ANNOCONFIDENCE` 大表。
- `npm test`、`npm run build`、`npm run verify:mvp` 通过。
- 若数据卷可用，`npm run build:annojoin-atlas` 能生成 `src/assets/generated/annojoin-atlas/manifest.json`，且无资产超过 100 MiB。
- 文案不出现以下错误口径：唯一最终 confidence score、preset 修改 FEC claim ceiling、`balanced_segment_view` 是 Core truth、`ANNOJOIN` 已经覆盖正式 `PUBLIC/rmdb2pdb_export`。

## 执行建议

优先按任务 1-5 做出静态站可见的列表与详情 shell；任务 6-7 再扩大到 case 级 evidence 和 route 资产；任务 8-10 做工作台、搜索和发布 gate。不要先做 Mol* 深度集成，因为 3D 路由和 residue-color payload 的静态资产边界必须先稳定。
