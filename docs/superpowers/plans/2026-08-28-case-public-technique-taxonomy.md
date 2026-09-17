# Case 公开技术分类实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在隔离 worktree 与不可变 staging run 中，为每个公开 Case profile 生成 Entry 同口径的技术分类 sidecar，并让普通 Case 与 2D/矩阵 Case 都不再向用户显示 Family A–F、EF、Tier 或 LSS。

**架构：** `profile-index.json.gz` 是页面 profile 主集合；DuckDB 只提供这些 profile 的逐行 `tech_filter` 与 `is_background_channel`。Python extractor 只读抽取原始行，Node builder 必须直接调用 `src/techniqueFilterModel.js` 的共享分类函数，生成逐 chain gzip sidecar 与审计报告。浏览器以 sidecar 为普通 Profile selector 的唯一公开技术元数据源；矩阵页面用同一共享分类函数规范化 payload `header.technology`，但保留 Family 字段作为不可见的科学/路由内部字段。

**技术栈：** Node.js ESM、`node:test`、Python 3、DuckDB Python API、gzip/JSON、原生 DOM/CSS、FoldBridge 无构建静态资源与现有资源指纹脚本。

**已确认规格：** `docs/superpowers/specs/2026-08-28-case-public-technique-taxonomy-design.md`

---

## 授权与停止条件

本计划在 `/Volumes/tainyissd/foldbridge-worktrees/case-public-taxonomy` 执行。

当前计划允许：

- 修改隔离分支中的源码、测试、脚本和全局 Case 静态模块；
- 在新的 `/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<pilot-run-id>` 中生成 pilot 数据和 preview；
- 只读访问 `/Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb` 与 `/Volumes/tianyi/Server/public/entry-cases`。

当前计划不允许：

- 写入或替换 `/Volumes/tianyi/Server/public`；
- 生成 full run；
- push、合并 `ghhttps/main` 或部署；
- 修改 DuckDB、现有 profile-index、shards、VARNA、linked-view、CIF 或矩阵数据。

完成 pilot 后必须停止，提交报告并请求“full staging 授权”。即使 full staging 后续通过，发布仍需另一份明确授权和发布计划。

## 文件结构与职责

### 分类权威与 Entry 兼容

- 修改 `src/techniqueFilterModel.js`
  - 导出唯一的 `classifyTechniqueFilter`、taxonomy version 与可哈希 snapshot；
  - 收敛 tokenization、normalization、alias、canonical label、category 顺序；
  - 增加 `MCA → MOHCA`、`mutate-and-map → Mutate-and-map methods` 的公开别名。
- 修改 `src/entryTable.js`
  - 删除本地 `techniqueFieldsFromFilter`；
  - 直接消费共享分类结果，保持现有 Entry OR 筛选行为。
- 修改 `test/entry-technique-filter.test.js`
  - 覆盖 canonicalization、未分类 token、五类顺序和 Entry 回归。

### Sidecar 契约与 Case 纯函数

- 修改 `public/entry-cases/__entry_v3_site__/workbench-pure.mjs`
  - 新增 `profile-public-techniques.v1` 严格 validator、view model、单 profile 标签和 OR filter；
  - 最终删除 confidence-evidence Family/technology UI helpers。
- 创建 `tests/case-profile-public-techniques.test.mjs`
  - 覆盖五种状态、字段 nullability、精确顺序、大小写 chain、多类别但单 profile、缺失元数据退化。

### DuckDB 只读抽取与 staging 构建

- 创建 `scripts/extract-case-public-techniques.py`
  - 读取 selected-chain manifest；
  - 用 read-only DuckDB + TEMP selected table 抽取原始 profile 行；
  - stdout 输出有序 NDJSON，不分类、不写数据库。
- 创建 `test/test_extract_case_public_techniques.py`
  - 用临时 DuckDB 测试 A/a、唯一性、原始字段与输入文件不变。
- 创建 `scripts/case-public-techniques-lib.mjs`
  - 读取 gzip profile-index、按页面顺序连接 DB 行、生成 sidecar、审计记录和确定性 gzip。
- 创建 `scripts/build-case-public-techniques.mjs`
  - CLI 编排 Python extractor、不可变 `.partial → run_id` 原子构建、manifest、reports、SHA-256。
- 创建 `scripts/verify-case-public-techniques.mjs`
  - 从 manifest selection 重新只读抽取 DuckDB、调用共享 classifier，并逐项比较 sidecar、reports、状态和哈希。
- 创建 `scripts/build-case-public-techniques-preview.mjs`
  - 在新的 `pilot-*` partial 中从头重建数据、组装 `pilot-preview`、完成验证后原子封存。
- 创建 `test/case-public-technique-builder.test.js`
  - 覆盖 page-primary 集合、DB-only 报告、miss/duplicate fail-loud、稳定 gzip、独立 verifier 与已有 run 拒绝。
- 创建 `test/case-public-technique-preview.test.js`
  - 覆盖完整 pilot run 的原子构建、baseline 确定性比较、目录布局与只读输入不变。
- 修改 `package.json`
  - 增加 `build:case-public-techniques` 与 `verify:case-public-techniques`，不改变既有 `build`/Pages 流程。

### Case UI 与公开文案

- 修改 `public/entry-cases/__entry_v3_site__/workbench.js`
  - 加载、验证 sidecar；
  - 普通 Case 使用单一可见 Profile selector 和五类/method 筛选；
  - 删除 confidence-evidence taxonomy 请求与 Family fallback；
  - sidecar 失败时保留全部 profile，仅显示公开 unavailable 文案；
  - 矩阵模式调用共享分类函数规范化 `header.technology`；
  - 用户错误不显示内部 EF 错误原文。
- 修改 `public/entry-cases/__entry_v3_site__/workbench.css`
  - 删除 Family A–D badge 规则；
  - 用 Entry 相同的五类颜色映射和控件层级重绘 category/method 过滤器。
- 修改 `public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs`
  - 将用户可见 EF/Family/Tier/LSS 文案替换为 `Sequence`、`Secondary structure`、`3D structure`、`Contact / pair map`、`Technique`、`Category`。
- 修改 `public/entry-cases/__entry_ef_site__/ef-heatmap.js`
  - 将 `EF intensity`、`E/F scale` 和 EF ARIA/title 文案改为通用 `Signal`、`Contact score`、`Pair coupling`。
- 修改 `tests/ef-workbench-integration.test.mjs`
  - 覆盖矩阵模式公开文案、technology canonicalization 和用户错误净化。

### 全局静态资产镜像与指纹

- 修改 `scripts/version-ef-entry-assets.mjs`
  - 从唯一源 `src/techniqueFilterModel.js` 生成 public `technique-filter-model.mjs` 镜像；
  - 把该镜像和现有 Case 模块一并指纹化；
  - bump 资源版本，但不修改任何 per-case `index.html`。
- 修改 `tests/ef-asset-version.test.mjs`
  - 证明 source mirror 字节一致、所有 import 指向同一新版本、`--check` 幂等。
- 生成并暂存 `public/entry-cases/__entry_v3_site__/*.<new-version>.*` 与 `public/entry-cases/__entry_ef_site__/*.<new-version>.*`
  - 只由版本脚本产生；不得手改指纹文件。

## 任务 1：建立唯一的端到端技术分类函数

**文件：**

- 修改：`src/techniqueFilterModel.js:1-120`
- 修改：`src/entryTable.js:1-145`
- 修改：`test/entry-technique-filter.test.js:1-150`

- [ ] **步骤 1：先写共享分类失败测试**

在 `test/entry-technique-filter.test.js` 导入 `classifyTechniqueFilter` 与 `buildTechniqueTaxonomySnapshot`，增加：

```js
test('shared classifier owns tokenization, aliases, canonical labels, and category order', () => {
  const result = classifyTechniqueFilter('MCA;mutate-and-map;structureseq;CIRS-seq');
  assert.deepEqual(result.methods, [
    { label: 'MOHCA', mappingStatus: 'mapped', categoryId: 'interaction', categoryLabel: 'RNA–RNA interaction mapping methods', categoryShortLabel: 'RNA–RNA interaction' },
    { label: 'Mutate-and-map methods', mappingStatus: 'mapped', categoryId: 'interaction', categoryLabel: 'RNA–RNA interaction mapping methods', categoryShortLabel: 'RNA–RNA interaction' },
    { label: 'Structure-seq', mappingStatus: 'mapped', categoryId: 'dms', categoryLabel: 'DMS-based methods', categoryShortLabel: 'DMS' },
    { label: 'CIRS-seq', mappingStatus: 'unmapped', categoryId: null, categoryLabel: null, categoryShortLabel: null },
  ]);
  assert.deepEqual(result.categoryIds, ['dms', 'interaction']);
  assert.equal(result.classificationStatus, 'partially_mapped');
});
```

再增加空值与去重测试：空值不直接决定 background/missing，只返回 `methods: []`；重复 alias/canonical token 只保留一个 canonical method。

- [ ] **步骤 2：运行测试确认失败**

运行：

```bash
node --test test/entry-technique-filter.test.js
```

预期：FAIL，提示 `classifyTechniqueFilter`/`buildTechniqueTaxonomySnapshot` 未导出。

- [ ] **步骤 3：实现最小共享分类 API**

在 `src/techniqueFilterModel.js` 增加：

```js
export const TECHNIQUE_TAXONOMY_VERSION = 'entry-technique-taxonomy.v1';

export function classifyTechniqueFilter(value = '') {
  const tokens = String(value || '').split(/[;,]/).map((token) => token.trim()).filter(Boolean);
  const methods = [];
  const seenMethods = new Set();
  for (const token of tokens) {
    const canonical = canonicalTechniqueName(token);
    const label = canonical || token;
    if (seenMethods.has(label)) continue;
    seenMethods.add(label);
    const category = mechanismFamilyForTechnique(label);
    methods.push({
      label,
      mappingStatus: category ? 'mapped' : 'unmapped',
      categoryId: category?.id || null,
      categoryLabel: category?.label || null,
      categoryShortLabel: category?.shortLabel || null,
    });
  }
  const categoryIds = MECHANISM_FAMILIES
    .map((category) => category.id)
    .filter((id) => methods.some((method) => method.categoryId === id));
  const mapped = methods.filter((method) => method.mappingStatus === 'mapped').length;
  const classificationStatus = !methods.length ? 'empty'
    : mapped === methods.length ? 'mapped'
      : mapped === 0 ? 'unmapped' : 'partially_mapped';
  return { methods, categoryIds, classificationStatus };
}
```

把 `mca` 和 `mutateandmap` 加入现有 alias 表，目标分别为 `MOHCA` 与 `Mutate-and-map methods`。Snapshot 必须返回 version、token separator、五类完整字段、aliases 和 canonical technique 表，并保持稳定数组顺序。

- [ ] **步骤 4：让 Entry 删除本地 tokenizer**

`src/entryTable.js` 改为导入 `classifyTechniqueFilter`。`normalizeEntryRows` 使用：

```js
const classified = classifyTechniqueFilter(techFilter);
const techniqueNames = classified.methods.map((method) => method.label);
const techniqueFamilies = classified.categoryIds;
```

删除 `techniqueFieldsFromFilter`，不改变 `matchesTechniqueFilter` 的跨层 OR 行为。

- [ ] **步骤 5：运行定向与完整测试**

运行：

```bash
node --test test/entry-technique-filter.test.js
npm test
```

预期：Entry 定向测试全 PASS；完整测试 0 fail，现有 17,843-row contract 保持。

- [ ] **步骤 6：提交**

```bash
git add src/techniqueFilterModel.js src/entryTable.js test/entry-technique-filter.test.js
git commit -m "refactor(entry): 统一公开技术分类函数"
```

## 任务 2：定义 sidecar 严格 schema 与 Case view model

**文件：**

- 修改：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs:1-70`
- 创建：`tests/case-profile-public-techniques.test.mjs`

- [ ] **步骤 1：写 schema 与 view-model 失败测试**

fixture 必须包含：mapped、partially_mapped、unmapped、background、missing，以及一个同时属于 `dms`/`shape` 的 profile。核心断言：

```js
const model = validateProfilePublicTechniques(payload, profileIndex, {
  pdbId: '9WNR', authChain: 'a', categories: MECHANISM_FAMILIES,
});
assert.equal(model.profileMeta.size, profileIndex.profiles.length);
assert.equal(model.profileMeta.get('p-multi').categoryIds.size, 2);
assert.equal(model.orderedProfileIds.filter((id) => id === 'p-multi').length, 1);
assert.deepEqual(
  [...applyPublicTechniqueFilter(model, { categories: new Set(['shape']), methods: new Set() })],
  ['p-multi'],
);
```

另写失败断言：schema 错、PDB/chain 大小写错、profile 顺序错、重复/缺失/extra、mapped category label 漂移、unmapped category 非 null、background methods 非空，均抛出明确错误。

- [ ] **步骤 2：运行测试确认失败**

```bash
node --test tests/case-profile-public-techniques.test.mjs
```

预期：FAIL，目标 exports 不存在。

- [ ] **步骤 3：实现严格 validator 和模型**

在 `workbench-pure.mjs` 新增：

```js
export const PROFILE_PUBLIC_TECHNIQUES_SCHEMA = 'profile-public-techniques.v1';
export function validateProfilePublicTechniques(payload, profileIndex, context) { /* exact fail-loud checks */ }
export function buildPublicTechniqueModel(validatedPayload, categories) { /* Maps + fixed category order */ }
export function applyPublicTechniqueFilter(model, selection) { /* category OR method */ }
export function profilePublicTechniqueLabel(profile, meta) { /* pair_id | method(s) */ }
export function categoryBadgeMarkup(meta) { /* public category only */ }
```

五种 status 的判断必须与规格逐字段一致。Sidecar 缺失不是 validator 的合法输入；缺失由 `workbench.js` catch 并进入公开退化状态。

- [ ] **步骤 4：运行测试并检查 legacy 仍可用**

```bash
node --test tests/case-profile-public-techniques.test.mjs tests/ef-asset-version.test.mjs
```

预期：PASS。此任务暂不删除 legacy helpers，避免在 UI 切换前制造破损 commit。

- [ ] **步骤 5：提交**

```bash
git add public/entry-cases/__entry_v3_site__/workbench-pure.mjs tests/case-profile-public-techniques.test.mjs
git commit -m "feat(case): 定义公开 profile 技术契约"
```

## 任务 3：实现只读 DuckDB extractor

**文件：**

- 创建：`scripts/extract-case-public-techniques.py`
- 创建：`test/test_extract_case_public_techniques.py`

- [ ] **步骤 1：写临时 DuckDB 失败测试**

测试 DB 创建 `chain`/`profile` 最小列，包含同一 PDB 的 auth `A` 与 `a`、mapped/null-background/null-nonbackground/unmapped 行。测试：

```python
rows = list(extract_rows(db_path, [{"pdbId": "9WNR", "authChain": "a"}]))
self.assertEqual([row["authChain"] for row in rows], ["a", "a"])
self.assertEqual(rows[0]["techFilter"], None)
self.assertIs(rows[0]["isBackgroundChannel"], True)
self.assertEqual(hash_before, sha256(db_path))
```

另建重复 `(pdb_id, auth)` chain fixture，断言 fail-loud；selection 中重复 chain 也必须失败。

- [ ] **步骤 2：运行测试确认失败**

先通过 workspace dependency loader 获取 bundled Python；本机当前路径为：

```bash
/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest test/test_extract_case_public_techniques.py -v
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现 TEMP selected table + 有序 NDJSON**

核心 SQL 固定为：

```sql
SELECT s.ordinal,
       p.pdb_id,
       c.auth,
       p.chain_key,
       p.profile_key,
       p.tech_filter,
       p.is_background_channel
FROM selected_chains s
JOIN chain c ON c.pdb_id = s.pdb_id AND c.auth = s.auth_chain
JOIN profile p ON p.pdb_id = c.pdb_id AND p.chain_key = c.chain_key
ORDER BY s.ordinal, p.profile_key;
```

连接必须是 `duckdb.connect(db_path, read_only=True)`；只允许 TEMP table。CLI 接收 `--db` 与 `--selection-json`，stdout 一行一个 JSON object；stderr 只写诊断。

- [ ] **步骤 4：运行单测与真实 schema smoke**

```bash
/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest test/test_extract_case_public_techniques.py -v
/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m py_compile scripts/extract-case-public-techniques.py
```

预期：全部 PASS；临时 DB hash 不变。

- [ ] **步骤 5：提交**

```bash
git add scripts/extract-case-public-techniques.py test/test_extract_case_public_techniques.py
git commit -m "feat(case): 添加只读技术元数据抽取器"
```

## 任务 4：实现不可变 staging builder 与独立 verifier

**文件：**

- 创建：`scripts/case-public-techniques-lib.mjs`
- 创建：`scripts/build-case-public-techniques.mjs`
- 创建：`scripts/verify-case-public-techniques.mjs`
- 创建：`test/case-public-technique-builder.test.js`
- 修改：`package.json:5-25`

- [ ] **步骤 1：写 page-primary 与确定性失败测试**

使用 profile-index 顺序 `['published-b', 'published-a']` 和 DB rows `published-a/published-b/db-only`，断言：

```js
const result = buildChainSidecar({ profileIndex, dbRows, pdbId: '1C2X', authChain: 'C' });
assert.deepEqual(result.payload.profiles.map((row) => row.profileId), ['published-b', 'published-a']);
assert.deepEqual(result.dbOnlyRows.map((row) => row.profileId), ['db-only']);
assert.equal(result.payload.profiles.some((row) => row.profileId === 'db-only'), false);
assert.deepEqual(deterministicGzip(result.payload), deterministicGzip(result.payload));
```

另测：profile-index miss、DB duplicate、PDB/chain case drift、已有 final/partial run、非法 run id 均 fail-loud。

- [ ] **步骤 2：运行测试确认失败**

```bash
node --test test/case-public-technique-builder.test.js
```

预期：FAIL，builder exports 不存在。

- [ ] **步骤 3：实现 pure builder**

`buildChainSidecar` 处理顺序：

1. 校验 profile-index `profile_count === profiles.length`，profile_id 唯一；
2. 建立 DB `profileId → row`，重复直接失败；
3. 按 profile-index 顺序逐项唯一 join；
4. 对非空 `techFilter` 调用共享 `classifyTechniqueFilter`；
5. 空值用 `isBackgroundChannel` 决定 `background` 或 `missing`；
6. 调用 `validateProfilePublicTechniques` 自证 payload；
7. DB-only 只进入审计，不进入 sidecar；
8. JSON 固定字段顺序，gzip 使用固定 level 和 `mtime: 0`。

- [ ] **步骤 4：实现 CLI 原子 run**

CLI 必须要求：`--db`、`--case-root`、`--out-parent`、`--run-id`、`--python`，以及重复 `--case PDB/auth` 或互斥的 `--all`。

构建顺序：

```text
validate args/input → create .<run_id>.partial → hash inputs → write selection.json
→ spawn Python extractor → stream/group rows → build sidecars/reports
→ create empty pilot-preview/ → independent in-process validation
→ write source-manifest + sha256
→ atomic rename partial to final run_id
```

final 或 partial 已存在必须失败；不得删除或覆盖。`run_id` 必须通过规格中的 `<kind>-<UTC>-<git12>` 校验，当前任务只允许 `pilot-*`；即使数据验收 run 尚无 UI，仍必须生成规格要求的空 `pilot-preview/` 目录。

- [ ] **步骤 5：实现真正独立的只读 verifier**

Verifier 不得相信 builder 的 sidecar、coverage 数字或 reports。它必须从 run manifest 的 selection 重新开始，使用 `--python` 指定的解释器重新启动只读 DuckDB extractor，并在内存/临时目录中独立执行共享 classifier：

- 重新读取并校验原 profile-index 与输入 SHA-256；
- 重新只读抽取 DuckDB 原始 `profile_key`、`tech_filter`、background/control 行；
- 重新做 exact chain/profile join、DB-only 集合与 join-failure 集合；
- 重新调用 `classifyTechniqueFilter`，生成期望 sidecar JSON bytes 与五种 status；
- 将期望 sidecar、DB-only、unmapped/null reports、coverage 与 run 实物逐字节/逐行比较；
- 重算所有输出 SHA-256，检查 manifest 声明与实物一致；
- 检查原 DuckDB 与 profile-index 的 hash/mtime 未变，并保证 verifier 不写 run。

测试必须故意篡改一个 background profile 为 missing、删掉一条 DB-only report、改掉一条 unmapped label；三种情况都应被 verifier 抓到。

- [ ] **步骤 6：运行定向测试**

```bash
node --test test/case-public-technique-builder.test.js tests/case-profile-public-techniques.test.mjs
node --check scripts/build-case-public-techniques.mjs
node --check scripts/verify-case-public-techniques.mjs
```

预期：全部 PASS。

- [ ] **步骤 7：提交**

```bash
git add scripts/case-public-techniques-lib.mjs scripts/build-case-public-techniques.mjs scripts/verify-case-public-techniques.mjs test/case-public-technique-builder.test.js package.json
git commit -m "feat(case): 构建公开技术 sidecar"
```

## 任务 5：生成并验证 pilot staging 数据

**输出：**

- 创建新 run：`/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<pilot-run-id>`
- 不修改 Git tracked data；不写线上源。

- [ ] **步骤 1：记录实现 commit 与 UTC，人工组成唯一 run id**

```bash
git rev-parse --short=12 HEAD
date -u +%Y%m%dT%H%M%SZ
```

把两条输出组成 `pilot-<UTC>-<git12>`。不要复用旧 run id。

- [ ] **步骤 2：运行 pilot builder**

```bash
node scripts/build-case-public-techniques.mjs \
  --db /Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
  --case-root /Volumes/tianyi/Server/public/entry-cases/cases \
  --out-parent /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs \
  --run-id <pilot-run-id> \
  --python /Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  --case 1C2X/C \
  --case 5E54/B \
  --case 9WNR/A \
  --case 9WNR/a \
  --case 9ZC6/A \
  --case 9TMI/A \
  --case 7SYS/z \
  --case 8QO5/A \
  --case 8UYE/A \
  --case 8UYL/A
```

预期：只创建一个新 run；命令输出 final run 路径和总数；无 join failures。

- [ ] **步骤 3：运行独立 verifier**

```bash
node scripts/verify-case-public-techniques.mjs \
  --run /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<pilot-run-id> \
  --db /Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
  --case-root /Volumes/tianyi/Server/public/entry-cases/cases \
  --python /Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

必须确认：

- `1C2X/C` sidecar 511，DB-only 9；
- `9WNR/a` sidecar 6,838，DB-only 13；
- `9WNR/A` sidecar 5,689，DB-only 22；
- `9ZC6/A` sidecar 6,540，含 missing 30、background 426；
- `5E54/B` sidecar 3,870，含 Glyoxal 12、Terbium 12、missing 12、background 9；
- `9WNR/A` 与 `9WNR/a` 分别存在，路径和 payload chain 大小写不折叠；
- sidecar profile 总数等于五种 status 之和；
- 原 DuckDB 与所有输入 profile-index 的 hash/mtime 未变。

- [ ] **步骤 4：重复构建确定性检查**

使用新的 run id 再构建同一 pilot，比较两个 run 中解压 JSON SHA-256；必须逐文件一致。两个 run 均保留，不覆盖、不删除。

- [ ] **步骤 5：封存两个数据验收 run 并记录 checkpoint**

在任务日志中记录两个 `pilot-*` run id、coverage、DB-only、unmapped/null 报告和 SHA-256，并指定第一个 run 为任务 9 的只读确定性 baseline。两个 final run 从此不可再增加、删除或修改任何文件；其 `pilot-preview/` 保持构建时的空目录。任务 9 必须使用新的第三个 `pilot-*` run id 从 DuckDB 与 profile-index 重新构建数据，再在该第三个 run 的 `.partial` 中组装 `pilot-preview/`，完成后一次性原子封存。此时尚未修改 UI 或线上源。

## 任务 6：先建立浏览器共享 classifier 镜像与指纹基础

**文件：**

- 修改：`scripts/version-ef-entry-assets.mjs:1-120`
- 修改：`tests/ef-asset-version.test.mjs`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js` 的 import 区
- 生成：`public/entry-cases/__entry_v3_site__/technique-filter-model.mjs`
- 生成：`public/entry-cases/__entry_v3_site__/technique-filter-model.20260828-case-taxonomy-1.mjs`
- 生成：现有全局模块的 `20260828-case-taxonomy-1` 指纹副本

- [ ] **步骤 1：写 source mirror、依赖存在性和幂等失败测试**

测试必须证明：

- public unversioned mirror 字节等于 `src/techniqueFilterModel.js`；
- fingerprinted classifier 字节等于 unversioned mirror；
- `workbench.js` 的 import 指向存在的同版本 classifier、workbench-pure、EF shell 与 residue modules；
- version script `--check` 二次运行零修改；
- per-case index 不在版本脚本写集合中。

- [ ] **步骤 2：运行测试确认失败**

```bash
node --test tests/ef-asset-version.test.mjs
```

预期：FAIL，public classifier mirror 和新版本尚不存在。

- [ ] **步骤 3：实现唯一源镜像并建立新版本依赖图**

版本名固定为 `20260828-case-taxonomy-1`。版本脚本从 repo `src/techniqueFilterModel.js` 同步 public unversioned mirror，再生成 fingerprint；不得手抄 classifier。把 classifier 加入 `VERSIONED_ASSETS`，并让 CLI/测试可显式传入 repo source root。`workbench.js` import 区切到这一版本的 classifier、workbench-pure、EF shell 与 residue modules；此任务不接 UI 行为。

`--check` 必须同时验证 mirror、所有 fingerprint bytes 和 import target 都存在；任何 drift 失败。

- [ ] **步骤 4：生成并验证基础资产**

```bash
node scripts/version-ef-entry-assets.mjs public
node scripts/version-ef-entry-assets.mjs public --check
node --test tests/ef-asset-version.test.mjs tests/ef-workbench-integration.test.mjs
```

预期：PASS；只新增/更新全局模块，不改任何 `public/entry-cases/cases/*/index.html`。

- [ ] **步骤 5：提交**

```bash
git add scripts/version-ef-entry-assets.mjs tests/ef-asset-version.test.mjs public/entry-cases/__entry_v3_site__ public/entry-cases/__entry_ef_site__
git commit -m "chore(case): 建立公开技术分类浏览器资产"
```

## 任务 7：普通 Case 切换到公开 sidecar 与单一 selector

**文件：**

- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:1-140, 2349-2630, 2880-2990`
- 修改：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs:1-90`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.css:585-705, 997-1035`
- 修改：`tests/case-profile-public-techniques.test.mjs`
- 修改：`tests/ef-workbench-integration.test.mjs`

- [ ] **步骤 1：写 UI source-contract 失败测试**

断言普通 Case：

```js
assert.match(workbench, /profile-public-techniques\.json\.gz/);
assert.match(workbench, /validateProfilePublicTechniques/);
assert.doesNotMatch(workbench, /\.\.\/\.\.\/confidence-evidence\.json/);
assert.doesNotMatch(workbench, /PROFILE_FAMILY_ORDER|Unassigned family|Family \$\{/);
assert.match(workbench, /mountTechniqueFilter\(\)/);
```

纯函数测试还要证明 sidecar fetch/validation error 时，selector labels 只含 `pair_id` 和 `Technique metadata unavailable`，profile count 与原顺序不变。

- [ ] **步骤 2：运行测试确认失败**

```bash
node --test tests/case-profile-public-techniques.test.mjs tests/ef-workbench-integration.test.mjs
```

预期：FAIL，workbench 仍请求 confidence evidence 并含 Family UI。

- [ ] **步骤 3：切换初始化数据源**

增加：

```js
const profilePublicTechniquesUrl = config.profilePublicTechniquesUrl
  || './profiles/profile-public-techniques.json.gz';
```

普通模式 `Promise.all` 请求 sidecar，但用 `{ payload, error }` 包装，不能阻塞 profile 数值加载。成功时严格 validate；失败时 `console.error` 技术诊断，UI 只显示 `Technique metadata unavailable`。

删除 `confidenceEvidence` fetch、`state.techniqueByProfile`、`state.evidenceRows` 和相关 join；保留 linked-view 中非展示科学计算所需的 `confidenceSummary`/`lssContext`。

- [ ] **步骤 4：重写单一 selector 与 filter**

- native `<select>` 保持扁平 `state.profiles` 顺序；
- custom list 每个 profile 恰好一个 `<li>`；
- category badge 可多枚，但不复制 profile；
- 五类 category 固定顺序，当前 chain 没有 profile 的 category disabled；
- method 只显示该 chain 实际存在的 canonical public methods；
- category/method 跨层 OR；空选择显示全部；
- 调用 `mountTechniqueFilter()`，但仍只有一个可见 Profile selector；
- `richestProfileIndex()` 对全部 profile 评估，不再用 LSS Family 缩小候选集。

- [ ] **步骤 5：替换 CSS**

使用 `.category-badge[data-category="dms|shape|cleavage|nucleotide|interaction"]`；颜色逐值复用 `src/styles.css` 中现有 Entry category badge 规则，不自行选择近似色。删除 `.family-badge[data-family="A"...]`。Filter 放在同一 controls 区，键盘 focus、ARIA pressed、移动端换行继续有效。

- [ ] **步骤 6：运行定向测试**

```bash
node --test tests/case-profile-public-techniques.test.mjs tests/ef-workbench-integration.test.mjs
node --check public/entry-cases/__entry_v3_site__/workbench.js
```

预期：PASS；source contract 中 confidence-evidence taxonomy 与 Family selector 为 0 命中。

- [ ] **步骤 7：提交**

```bash
git add public/entry-cases/__entry_v3_site__/workbench.js public/entry-cases/__entry_v3_site__/workbench-pure.mjs public/entry-cases/__entry_v3_site__/workbench.css tests/case-profile-public-techniques.test.mjs tests/ef-workbench-integration.test.mjs
git commit -m "feat(case): 接入公开技术 Profile selector"
```

## 任务 8：清除矩阵模式用户可见内部术语

**文件：**

- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:2810-2890`
- 修改：`public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs:1-145`
- 修改：`public/entry-cases/__entry_ef_site__/ef-heatmap.js:100-290, 410-455`
- 修改：`tests/ef-workbench-integration.test.mjs`

- [ ] **步骤 1：写公开 copy 失败测试**

导出或注入纯 `matrixPublicTechnique(header)`，断言：

```js
assert.deepEqual(matrixPublicTechnique({ technology: 'MCA' }), {
  methodLabel: 'MOHCA',
  categoryLabel: 'RNA–RNA interaction mapping methods',
});
assert.deepEqual(matrixPublicTechnique({ technology: 'mutate-and-map' }), {
  methodLabel: 'Mutate-and-map methods',
  categoryLabel: 'RNA–RNA interaction mapping methods',
});
```

公开 copy 集合（subtitle、heading、legend、status、caption、ARIA、title、可见 error）拼接后不得匹配 `/\b(?:EF|Family|Tier|LSS)\b/i`。

- [ ] **步骤 2：运行测试确认失败**

```bash
node --test tests/ef-workbench-integration.test.mjs
```

预期：FAIL，现有 `Linked EF matrix`、`EF intensity`、`EF assets linked` 等仍存在。

- [ ] **步骤 3：替换 shell 用户文案**

采用：

- subtitle：`Explore experimental contacts across sequence, secondary structure, and 3D structure.`
- 轨道：`Sequence`
- 矩阵：`Contact / pair map`
- 二级结构：`Secondary structure`
- 三维：`3D structure`
- 强度行：`Signal`
- 载入状态：`Loading matrix…` / `Linked data ready`

`renderEfWorkbenchMetadata` 根据 `value_kind` 决定 `Contact score`/`Pair coupling`，不得用 `header.family` 选择用户文案。`Technology` 改为 `Technique`，值必须经过共享 classifier。

- [ ] **步骤 4：净化用户错误但保留控制台诊断**

`showEfModeError(error)` 页面只显示：

```text
Case data could not be loaded.
```

原始错误继续 `console.error('[workbench:matrix]', error)`，不进入 DOM。

- [ ] **步骤 5：保留内部科学逻辑**

不得删除 `header.family` 在矩阵有效 cell、E/F 载荷选择和内部路由中的用途；只禁止它进入公开文案、ARIA、tooltip 和 badge。

- [ ] **步骤 6：运行测试并提交**

```bash
node --test tests/ef-workbench-integration.test.mjs tests/case-profile-public-techniques.test.mjs
node --check public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs
node --check public/entry-cases/__entry_ef_site__/ef-heatmap.js
git add public/entry-cases/__entry_v3_site__/workbench.js public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs public/entry-cases/__entry_ef_site__/ef-heatmap.js tests/ef-workbench-integration.test.mjs
git commit -m "fix(case): 移除矩阵页面内部术语"
```

## 任务 9：重新生成最终指纹资产并原子构建完整 pilot run

**文件：**

- 修改：`tests/ef-asset-version.test.mjs`
- 创建：`scripts/build-case-public-techniques-preview.mjs`
- 创建：`test/case-public-technique-preview.test.js`
- 更新生成物：`public/entry-cases/__entry_v3_site__/*.20260828-case-taxonomy-1.*`
- 更新生成物：`public/entry-cases/__entry_ef_site__/*.20260828-case-taxonomy-1.*`
- staging preview：`/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<third-pilot-run-id>/pilot-preview/entry-cases/**`

- [ ] **步骤 1：先证明指纹已过期，并写完整 pilot 原子构建失败测试**

先运行：

```bash
node scripts/version-ef-entry-assets.mjs public --check
```

预期：FAIL，因为任务 7/8 修改了 unversioned UI，而同版本 fingerprint 仍是任务 6 的基础快照。

在 `test/case-public-technique-preview.test.js` 写 fixture，要求完整 pilot builder：

- `run_id` 只接受规格规定的 `pilot-<UTC>-<git12>`；
- 从 DuckDB/profile-index 重新构建本 run 的 data/reports，不复制 baseline sidecar；
- baseline 只读用于确定性逐文件比较；
- 只写 `.<run-id>.partial`，data、reports、`pilot-preview`、manifest/hash 全部完成后才原子改名；
- final/partial 已存在、baseline hash 漂移、sidecar 缺失、case 重复或大小写不匹配时 fail-loud；
- 不修改 baseline run、DuckDB、case source 或 worktree；不建立可写 symlink；不使用 delete 同步。

运行：

```bash
node --test test/case-public-technique-preview.test.js
```

预期：FAIL，完整 pilot builder 不存在。

- [ ] **步骤 2：实现完整 pilot run builder**

CLI 要求 `--baseline-run`、`--db`、`--case-root`、`--worktree-public`、`--out-parent`、`--run-id`、`--python` 与重复 `--case PDB/auth`。固定流程为：

```text
validate immutable baseline and all read-only input hashes
→ create .<run-id>.partial/{data,pilot-preview,reports}
→ rerun Python extractor + shared Node classifier into this run's data/reports
→ compare decompressed sidecar JSON hashes and deterministic report projections with baseline
→ copy global modules and exact selected case directories into pilot-preview/entry-cases
→ inject this run's new sidecars into matching preview profiles directories
→ validate each preview sidecar against copied profile-index
→ write final source-manifest.json + reports/sha256.txt
→ recheck baseline/input/worktree hashes and mtimes unchanged
→ atomic rename partial to final pilot run
```

builder 不得在 final rename 后再写任何证据；任何步骤失败都保留 `.partial` 供诊断，不覆盖或删除它。

报告确定性比较必须排除或规范化合法变化字段（`run_id`、生成时间、当前 Git commit、manifest 自身哈希）；分类结果、coverage、DB-only、unmapped/null 明细、profile 顺序与 sidecar 内容必须精确一致。

- [ ] **步骤 3：重新生成最终 fingerprint 并运行测试**

```bash
node scripts/version-ef-entry-assets.mjs public
node scripts/version-ef-entry-assets.mjs public --check
node --test test/case-public-technique-preview.test.js tests/ef-asset-version.test.mjs tests/ef-workbench-integration.test.mjs
```

预期：PASS；最终 fingerprint 与任务 7/8 source 完全一致；不改任何 `public/entry-cases/cases/*/index.html`。

- [ ] **步骤 4：提交完整 pilot builder 与最终指纹资产**

```bash
git add scripts/build-case-public-techniques-preview.mjs test/case-public-technique-preview.test.js tests/ef-asset-version.test.mjs public/entry-cases/__entry_v3_site__ public/entry-cases/__entry_ef_site__
git commit -m "test(case): 组装公开技术 pilot preview"
```

- [ ] **步骤 5：创建第三个完整且不可变的 `pilot-*` run**

记录当前 commit 与 UTC，组成新的 `pilot-<UTC>-<git12>`，不能复用任务 5 的两个 id。以任务 5 指定的第一个 run 为只读 baseline，运行：

```bash
node scripts/build-case-public-techniques-preview.mjs \
  --baseline-run /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<first-pilot-run-id> \
  --db /Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
  --case-root /Volumes/tianyi/Server/public/entry-cases/cases \
  --worktree-public /Volumes/tainyissd/foldbridge-worktrees/case-public-taxonomy/public \
  --out-parent /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs \
  --run-id <third-pilot-run-id> \
  --python /Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  --case 1C2X/C --case 5E54/B --case 9WNR/A --case 9WNR/a \
  --case 9ZC6/A --case 9TMI/A --case 7SYS/z --case 8QO5/A --case 8UYE/A --case 8UYL/A
```

预期：只生成第三个完整 final run；其 data 与 baseline 解压 JSON 逐文件一致，`pilot-preview/entry-cases` 完整；前两个 run 和所有只读源 hash/mtime 不变。final rename 后不再修改第三个 run。

- [ ] **步骤 6：对第三个 run 重新执行独立数据 verifier**

```bash
node scripts/verify-case-public-techniques.mjs \
  --run /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<third-pilot-run-id> \
  --db /Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
  --case-root /Volumes/tianyi/Server/public/entry-cases/cases \
  --python /Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

预期：PASS；verifier 不修改 final run。

- [ ] **步骤 7：启动本地预览并使用浏览器技能验收**

```bash
python3 -m http.server 8888 --directory /Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<third-pilot-run-id>/pilot-preview
```

使用 `@browser:control-in-app-browser` 检查：

- `http://127.0.0.1:8888/entry-cases/cases/1C2X/chains/C/index.html`
- `http://127.0.0.1:8888/entry-cases/cases/5E54/chains/B/index.html`
- `http://127.0.0.1:8888/entry-cases/cases/9WNR/chains/A/index.html`
- `http://127.0.0.1:8888/entry-cases/cases/9WNR/chains/a/index.html`

验收：

- 一个可见 Profile selector；
- 1C2X 全部 511 个 profile、5E54 全部 3,870 个 profile 仍可选；
- category/method filter 双层 OR；多 category profile 不重复；
- background/missing/unmapped 文案正确；
- 页面文本、ARIA、title、tooltip 中无 Family A–F、EF、Tier、LSS；
- 1D/2D/VARNA/3D hover、click、选中联动不回归；
- `9WNR/A` 与 `9WNR/a` 加载各自 sidecar，不串链。

这些 direct local URLs 只用于 pre-release staging 验收，不能代替以后公网主站 iframe 验收。

## 任务 10：完整验证、审查与 full-stage 停止门

**文件：**

- 不新增功能文件；只修复验证发现的问题。
- 更新当前计划的复选框与 pilot run 证据，不把 staging 数据提交进 Git。

- [ ] **步骤 1：运行全部自动化验证**

```bash
/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest test/test_extract_case_public_techniques.py -v
/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m py_compile scripts/extract-case-public-techniques.py
node --test test/entry-technique-filter.test.js test/case-public-technique-builder.test.js tests/case-profile-public-techniques.test.mjs tests/ef-asset-version.test.mjs tests/ef-workbench-integration.test.mjs
node --test test/case-public-technique-preview.test.js
npm test
node scripts/version-ef-entry-assets.mjs public --check
node --check src/techniqueFilterModel.js
node --check public/entry-cases/__entry_v3_site__/workbench.js
node --check public/entry-cases/__entry_v3_site__/workbench-pure.mjs
node --check public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs
node --check public/entry-cases/__entry_ef_site__/ef-heatmap.js
git diff --check
```

预期：所有命令 exit 0，测试 0 fail。

- [ ] **步骤 2：核对 Git 变更范围**

```bash
git status --short
git diff --name-status ghhttps/main...HEAD
git log --oneline ghhttps/main..HEAD
```

确认：无 per-case index/profile/shard/scientific payload 变更；staging run 未进入 Git；未 push。

- [ ] **步骤 3：使用 requesting-code-review 做两层审查**

审查重点：

1. 数据层：profile-index 主集合、精确 chain/profile identity、五状态闭合、DB-only 不发布、无 fallback；
2. UI 层：单 selector、公开 taxonomy、矩阵模式无内部术语、交互无回归、指纹 import 完整。

修复 Critical/Important 后重新生成最终 fingerprint，并重新运行步骤 1 全部命令。此时任务 9 的已封存 pilot run 只能作为旧 commit 证据，不能继续作为最终验收 run。

- [ ] **步骤 4：如有修复，先提交最终修复**

只暂存审查修复涉及的文件：

```bash
git add <reviewed-files>
git commit -m "test(case): 完成公开技术 pilot 验收"
```

若审查没有产生任何代码、数据构建器、UI、fingerprint 或 preview builder 变更，本步骤不创建空提交。

- [ ] **步骤 5：如有修复，必须创建新的完整 pilot 验收 run**

任何影响代码、分类、sidecar、reports、UI、fingerprint 或 preview 的修复提交后，都必须用新的 `pilot-<UTC>-<git12>` 重新执行任务 9 的步骤 5–7：从只读源重建 data/reports/`pilot-preview`，独立 verify，并重做浏览器验收。旧 run 全部保留且不修改。只有新 run 的 manifest commit 与当前 HEAD 一致时，才能作为最终证据。

- [ ] **步骤 6：停止并交付 full staging 决策包**

向用户提交：

- 分支与 commits；
- 两个初始不可变数据验收 run、当前完整 pilot 验收 run，以及因审查修复产生的任何后续 run 路径；
- sidecar/profile/status/DB-only/unmapped/null 数量；
- 两次确定性 hash；
- 本地截图与交互结果；
- 预计 full sidecar 文件数、总 profile 数和空间；
- 明确声明：未写线上源、未 full run、未 push、未部署。

请求用户明确选择是否授权 full staging。没有授权时不得继续。

## full staging 后的发布顺序（仅说明，不在本计划执行）

未来若 full staging 获准并通过，发布仍需单独计划和授权。安全顺序固定为：

1. 先发布所有新 sidecar；旧 UI 会忽略它们；
2. 公网逐文件验证 sidecar hash 与覆盖率；
3. 再原子替换全局无版本 Case 模块及其新指纹依赖；
4. 不修改 per-case index；
5. 最后必须通过主站 iframe 验收：
   - `https://foldbridge.ribocentre.org/#entry-case?pdb=1C2X&chain=C`
   - `https://foldbridge.ribocentre.org/#entry-case?pdb=9WNR&chain=a`
6. 裸的 `foldbridge.sunhao.uk/.../chains/.../index.html` 只作资源诊断，不能代替用户页面验收。

任何一步失败都停止，不得回退显示 Family/technology confidence evidence。
