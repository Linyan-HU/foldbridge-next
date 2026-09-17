# ANNOCONFIDENCE / ANNOJOIN Atlas Web Handoff

本文档记录 `feature/annojoin-atlas-web-adapter` 分支中 FoldBridge Atlas 的 ANNOJOIN 网页展示边界、数据入口、构建命令和验证门槛。

## 范围

本分支实现 `/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/remote_root/09_reports/ANNOCONFIDENCE_ANNOJOIN_STAGE_RECORD_AND_WEB_HANDOFF_20260617.md` 中定义的 9 个一级展示能力：

| 一级能力 | 页面锚点 |
| --- | --- |
| Searchable web interface | `data-atlas-capability="searchable-web-interface"` |
| RNA family / probe type / PDB ID / motif / structure class search | `data-atlas-capability="facet-search"` |
| 1D reactivity profile | `data-atlas-capability="reactivity-1d"` |
| 2D paired/unpaired view | `data-atlas-capability="paired-unpaired-2d"` |
| 3D residue coloring | `data-atlas-capability="residue-coloring-3d"` |
| Mapped residue table | `data-atlas-capability="mapped-residue-table"` |
| Confidence view builder | `data-atlas-capability="confidence-view-builder"` |
| Conflict / discordance candidate viewer | `data-atlas-capability="conflict-candidate-viewer"` |
| Download current-filter result | `data-atlas-capability="download-current-filter"` |

页面入口为：

```text
/dist/#annojoin-atlas
```

## 数据入口

浏览器侧以 `ANNOJOIN` 为入口，不直接加载 `ANNOCONFIDENCE` 大表。

| 页面数据 | 入口表或资产 | 说明 |
| --- | --- | --- |
| 搜索、筛选、case 列表 | `ANNOJOIN/anno_case_search_index.tsv`、`ANNOJOIN/anno_facet_catalog.tsv` | 构建为 `src/assets/generated/annojoin-atlas/index.json` |
| case 证据摘要 | `ANNOJOIN/anno_case_evidence_summary.tsv` | 构建为每个 case 的概览 JSON |
| 详情路由 | `ANNOJOIN/anno_detail_route_index.tsv` | 前端显示路由，不直接读大表 |
| profile membership | `ANNOJOIN/anno_case_profile_membership.tsv` | 分页资产，只展示 bounded preview |
| 1D reactivity route | `ANNOJOIN/anno_residue_track_route_index.tsv` | 指向服务端/构建期证据路径 |
| 2D pair context route | `ANNOJOIN/anno_2d_pair_context_route_index.tsv` | 指向配对上下文路径 |
| 3D residue coloring route | `ANNOJOIN/anno_3d_residue_coloring_route_index.tsv` | mmCIF 文件通过 API 按需读取 |
| conflict candidate | `ANNOJOIN/anno_conflict_candidate_index.tsv` | 分页资产和 bounded preview |
| preset / download | `ANNOJOIN/atlas_preset_view_definitions.tsv`、`ANNOJOIN/atlas_download_manifest.tsv` | 支持 confidence view builder 和 current-filter download |

构建脚本只在构建期读取小范围预览所需的 `ANNOCONFIDENCE/lss_structure_context_annotation.tsv` 和 `06_fec_evidence/residue_evidence.tsv`，生成 bounded visual preview。完整 `ANNOCONFIDENCE` 大表仍保留在数据根或服务端路径中。

## 生成资产策略

`src/assets/generated/annojoin-atlas/` 是构建产物，不是手写源码。当前 full build 规模约为：

```text
1126 cases
9178 generated JSON assets
about 440M on disk
```

因此分支应提交源码、测试、构建脚本和交付说明；完整生成树通过下面命令重建：

```bash
FOLDBRIDGE_ANNO_ROOT=/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/remote_root \
npm run build:annojoin-atlas
```

生成 manifest 中必须保持：

```json
{
  "entry_root": "ANNOJOIN",
  "annotation_root": "ANNOCONFIDENCE",
  "browser_loads_annoconfidence_big_tables": false,
  "structure_serving_mode": "api_on_demand"
}
```

## Docker 运行

Docker compose 将数据根只读挂载到 `/annojoin-data`，容器内 `FOLDBRIDGE_ANNO_ROOT=/annojoin-data`：

```bash
FOLDBRIDGE_PORT=55832 docker compose up --build -d foldbridge-web
```

打开：

```text
http://127.0.0.1:55832/dist/#annojoin-atlas
```

3D 结构文件不复制进静态资产。前端使用 `structure_url` 调用：

```text
/api/annojoin/structure?path=<ANNOJOIN structure_file_path>
```

服务端在 `FOLDBRIDGE_ANNO_ROOT` 下解析 mmCIF，并用 `api_on_demand` 模式返回。

## 验证命令

完成或交接前重新运行：

```bash
npm test
npm run build:static
npm run verify:annojoin-atlas -- --sample-size 20
```

容器启动后再检查：

```bash
curl -fsS http://127.0.0.1:55832/dist/src/assets/generated/annojoin-atlas/manifest.json
curl -fsS 'http://127.0.0.1:55832/api/annojoin/structure?path=CONFIDENCE%2F10_structure_context%2Falpha_full_20260615%2Fmmcif_inputs_from_132%2F9qt5.cif'
```

这些检查分别证明静态资产、ANNOJOIN-first manifest 和按需 mmCIF 结构服务可用。

## 2026-06-26 5GAG linked-view smoke 续作记录

5GAG linked-view smoke 的 1D / 2D / 3D 联动和 qcov / scov 来源判断见：

```text
docs/annojoin-5gag-linked-smoke-stage-20260626.md
```

后续全量生成 RMDB / RASP 网页前先读该文档。关键结论：

- RMDB profile 级 qcov / scov 来自 `PIPLINE/rmdb2pdb_v3_exact_query_vs_pdb_normalized_acgun_rasp_params_20260612` 的 per-case export。
- RASP 侧 `rasp2pdb_signal_fact_mapping_rasp_params_20260611` 是最新 BLAST 资产之一，覆盖轴是 RASP feature query -> PDB subject，应作为独立 coverage 层展示。
- `structure-coverage.json` 继续只表达 sequence alignment 和 atom_site 坐标覆盖，不承载 raw BLAST qcov / scov。
