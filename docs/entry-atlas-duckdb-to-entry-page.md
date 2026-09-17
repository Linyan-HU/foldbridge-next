# entry_atlas.duckdb → entry 页数据复用流程（runbook）

本文档记录把 `entry_atlas.duckdb` 的数据接入网站 **entry 浏览页** 的完整、可重复流程。
后期换数据（duckdb 更新）时，**直接照这份跑，别重新摸索**。

## 0. 关键事实（先看，避免踩坑）

- **entry 页 = `annojoinAtlasPage()`**（`src/main.js`，路由 `entry` 和 `sequence` 都指它）。
  渲染器 = `renderAnnojointAtlasPage()`（`src/annojoinAtlasView.js`）。
- 它读的数据文件 = **`src/assets/generated/annojoin-atlas/index.json`**（schema `annojoin-atlas.v2`）。
  运行时直读 `index.displayCases`，**不过任何 allowlist 过滤**——换了数据即全量显示。
- **数据口径 = chain（pdb×chain），一行一条 chain。** duckdb 的 `chain` 表 17837 行是权威源。
  **绝不能用 `entry` 表（5321）把 chain 合并回去**——那会丢掉多 chain 拆分（血泪教训）。
- `entry` 表（5321）只用于 **Stats 总览页** 的固定统计（见 §4），和 entry 页的 chain 口径是两码事。

## 1. 数据源

- DB：`/Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb`
- 表：`chain`(17837) / `entry`(5321) / `profile`(2000万+)
- `chain` 表字段：`pdb_id, chain_key, auth, partition, sci_name, bio_source, bio_evidence,
  n_profiles, entry_confidence_class, source_lanes, rmdb_technique, rasp_technique,
  probing_category, geo_technique, has_geo, geo_series, geo_category, geo_nonnull_reactivity`
- 带 duckdb 的 Python：`/Volumes/tainyissd/foldbridge.map/.venv/bin/python`

## 2. 生成 index.json

脚本：`scripts/build-entry-atlas-index.py`（从 `chain` 表逐行生成 displayCases）。

```bash
/Volumes/tainyissd/foldbridge.map/.venv/bin/python scripts/build-entry-atlas-index.py \
  --db /Volumes/tainyissd/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb \
  --skeleton src/assets/generated/annojoin-atlas/index.json \
  --out src/assets/generated/annojoin-atlas/index.json
```

- `--skeleton` 提供页面 UI 元数据骨架（facets / presets / downloads / source），**不随数据变**；
  只有 `displayCases` / 计数 / version / generatedAt 被替换。
- 首次换数据时 skeleton 可用原 annojoin 的备份 `/tmp/annojoin-index.backup.json`；
  之后直接拿当前 index.json 当 skeleton（in-place 覆盖）即可。
- 期望输出：`cases 17837 / placements 17837`（一行一 chain，一个 placement）。

### 字段映射（chain 行 → displayCase）

| index.json 字段 | chain 表来源 |
|---|---|
| `caseId` / `pdbId` | `pdb_id` |
| `atlasCaseKey` | `ENTRY:<pdb_id>:<auth>`（含 auth 才唯一，一个 PDB 多 chain 各占行） |
| `caseUid` | `ENTRY|<pdb_id>|<auth>` |
| `chains` | `[auth]`（单条） |
| `biologicalMoleculeName` / `moleculeDisplayName` | `sci_name` |
| `profileCount` | `n_profiles` |
| `confidenceDisplayLabel` | `entry_confidence_class`（注：Confidence 列已从表格移除，但字段保留供详情/搜索） |
| `techniqueFamilies` / `measurementFamilies` / `assayFamilies` | `probing_category`（分号/逗号 split） |
| `rnaFamily` / `structureClass` | `partition`（单值） |
| `sourceDatabases` | `source_lanes`（split，大写） |
| `chainPlacements` | `[{classLabel: partition, nameLabel: sci_name}]`（折叠：RNA type 作父，分子名作子） |

## 3. 页面表格列（当前）

`ANNOJOIN_TABLE_COLUMNS`（`src/annojoinAtlasTableModel.js`），**5 列**：
`moleculeName / pdbId / chains / profileCount / techniqueFamilies(标 "Probing category")`。
（Confidence 列已按用户要求移除；列头 ⓘ 提示来自 `COLUMN_HELP`，view.js）。

## 4. Stats 页固定统计（独立于 index.json）

`scripts/build-site-stats.mjs` = **纯固定常量**，不引用 index.json / 无 allowlist。
产出 `src/assets/generated/site-stats/stats.json`。这里的 `pdb_total=5321` 是
entry_atlas **entry 表口径**（Stats 页展示值），别和 entry 页 chain 口径 17837 混。
duckdb 更新后若这些聚合数变了，手动改常量重跑：`node scripts/build-site-stats.mjs`。

## 5. 构建 + 验证 + 上线

```bash
# 1) 生成数据（§2）
# 2) 本地构建静态站点（把 index.json 拷进 dist）
node scripts/build.mjs                    # 完成后 dist/.../index.json 应含 totalCaseCount:17837
# 3) 全量构建（含搜索文档 + pagefind），部署门禁用
npm run build:site
# 4) 测试门禁（部署要求 0 fail）
node --test
# 5) 提交并推 release-public 触发两阶段自动部署
git add -A && git commit -m "..." && git push origin release-public
```

- 需要代理：`export https_proxy=http://127.0.0.1:7890 http_proxy=... all_proxy=...`
- 部署链路：push release-public → Action `deploy-to-public.yml`（门禁 npm ci→build:site→
  node --test→verify:mvp→assert CNAME/.nojekyll）→ push public 分支 → Pages 部署上线。
- 线上验证：
  `curl -s https://foldbridge.ribocentre.org/src/assets/generated/annojoin-atlas/index.json | grep -o '"totalCaseCount":[0-9]*'`

## 6. 已知遗留（换数据后仍待办）

- entry_atlas 各 case **没有生成详情页资产**（`cases/<atlasCaseKey>.json`）。
  从列表点进 case 详情 / 搜索点击会 404 或降级。列表页本身不受影响。
  atlasCaseKey 现为 `ENTRY:<pdb>:<auth>`，详情资产生成时需对齐这个 key。
