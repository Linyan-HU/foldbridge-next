# 5GAG Linked-View Smoke Stage Note（2026-06-26）

本文档记录 `public/annojoin-smoke/5gag/` 的当前进展，以及后续全量生成 RMDB / RASP 网页时必须保留的 qcov / scov 资产判断。

## 当前 smoke 进展

页面入口：

```text
http://127.0.0.1:5173/annojoin-smoke/5gag/index.html
```

当前已提交的关键版本：

- `57b620c feat(5GAG smoke): 完成 linked-view 三视图联动`
- `1b6800f feat(5GAG smoke): 添加 raw qcov scov 未物化合同`

当前页面合同：

- 1D / 2D / 3D 共用同一套 residue 状态 resolver 和状态色。
- 2D VARNA base fill 保留 DMS 黄红强度信号；状态色只作为 ring / stroke。
- 3D 使用两个 Mol* 容器：左侧为客户端按 alignment / target chain 裁剪后的 target chain view，右侧为 full CIF reference。
- target chain view 默认使用 DMS reactivity fill，不用 loop / stem 状态色覆盖强度信号。
- full CIF reference 保留用于对照，不参与 target-chain display 的语义判断。
- Mol* click / mouseover 事件通过 `PDB.molstar.click` / `PDB.molstar.mouseover` 反向联动到 1D / 2D，并校验 active chain。
- LSS context 通过小资产 `assets/linked-view/lss-context.json` 按 `profileId` 精确命中，不允许 case-level fallback。
- DMS loop recall 在浏览器端按 `mapped_to_strand === true && base in A/C && raw_value > 0` 计算；首条 profile 的目标口径是 `30 / 34 = 88.24%`。

3D 和 coverage 的当前边界：

- `structure-coverage.json` 的 `sequenceAlignment` 表达 profile 到 PDB polymer sequence 的 `113 / 113` alignment。
- `structure-coverage.json` 的 `coverage` 表达真实 atom_site 坐标覆盖：`43 / 113`，resolved range 为 `32-74`。
- `1-31` 和 `75-113` 是 sequence-only / no atom_site，不是 alignment failure。
- `structure-coverage.json` 不允许承载 qcov / scov；qcov / scov 属于 raw alignment / BLAST coverage 资产。

当前 raw qcov / scov 资产状态：

```text
public/annojoin-smoke/5gag/assets/linked-view/raw-alignment-coverage.json
```

当前该资产显式为：

```json
{
  "status": "not_materialized",
  "sourceDataPath": "not_materialized",
  "matchPolicy": "profile_id_pair_id_pair_segment_id_exact",
  "records": []
}
```

这不是最终状态，而是防止页面从 FEC semantic coverage、structure atom_site coverage 或 UI 推断出伪 qcov / scov。

## 资源来源清单

当前 5GAG smoke 已补充机器可读资源 provenance：

```text
public/annojoin-smoke/5gag/assets/resource-provenance.json
```

该 manifest 记录网页资源、build-time 来源、工具 runtime、132 侧 RNApdbee / RNAView 调度方式、RCSB / PDBe Molstar 外部运行时、LSS 小资产来源，以及 qcov / scov 未物化边界。它已注册到：

```text
public/annojoin-smoke/5gag/browser_smoke_manifest.json
```

面向后续 RMDB / RASP 全量网页生成的中文沉淀文档位于：

```text
/Users/joseperezmartinez/docs/rmdb2pdb/docs/技术沉淀/ANNOJOIN网页资源来源清单_20260626.md
```

BLAST coverage 资产来源说明位于：

```text
/Users/joseperezmartinez/docs/rmdb2pdb/docs/技术沉淀/ANNOJOIN_raw_alignment_coverage物化合同_20260626.md
```

后续新增 smoke 页时，应优先复制这个 manifest 的资源组结构，而不是在页面代码里临时解释资产来源。

## qcov / scov 来源判断

本节是 5GAG smoke 的现场记录；后续实现 `raw-alignment-coverage.json` materializer 时，以 `/Users/joseperezmartinez/docs/rmdb2pdb/docs/技术沉淀/ANNOJOIN_raw_alignment_coverage物化合同_20260626.md` 为 BLAST coverage 来源说明。

后续 materialize `raw-alignment-coverage.json` 时，RMDB profile coverage 使用 `PIPLINE` 下 RMDB v3 exact per-case export；RASP feature coverage 使用 RASP signal-fact BLAST mapping。两者都是 BLAST 资产，但 coverage 轴不同，不能合并成一个无来源说明的 case coverage。

RMDB 推荐来源：

```text
/data/hsBack/05_devSpace/04_foldbridge_data/PIPLINE/rmdb2pdb_v3_exact_query_vs_pdb_normalized_acgun_rasp_params_20260612/exports/rmdb_pdb_v3_exact_cases_full_20260613_streaming_caseonly/5GAG/
```

关键文件：

- `provenance_index.tsv`
- `alignment_pair_summary.tsv`
- `rmdb_sequence_members.tsv`

5GAG 首条 smoke profile 的精确映射：

```text
profileId = data-rna-structures/SRPECLI_DMS_0001.rdat#DATA:262
sequence_label = sequence_000008
pdb_reference_id = 5GAG_1
```

对应 `alignment_pair_summary.tsv` 行的关键数值：

```text
pident = 100.0
identity_fraction = 1.0
alignment_length = 113
qstart = 4
qend = 116
sstart = 1
send = 113
qcovs = 97.0
subject_coverage = 100.0
evalue = 2.35e-53
bitscore = 205.0
```

这里的轴是 RMDB/profile sequence query -> PDB normalized subject：

- `qcovs`：RMDB/profile query coverage。
- `subject_coverage`：PDB subject coverage，可作为页面中的 scov / PDB reference coverage 口径。

## 其它 BLAST 资产轴

### Reverse PDB-query summary

以下路径是 reverse PDB-query 视图：

```text
/data/hsBack/05_devSpace/04_foldbridge_data/PIPLINE/rmdb2pdb_normalized_pdb_query_vs_rmdb_v2_exact_rasp_params_20260612/summary/best_pdb_query_to_rmdb_exact.tsv
```

该表包含 `5GAG_1`：

```text
pdb_query_id = 5GAG_1
sseqid = rmdbv2_exact_9582ac26e73e289634f2aea4e3efad3d84c5212b
length = 113
qlen = 113
slen = 207
qcovs = 100
```

但方向是 PDB normalized query -> RMDB exact subject。这里的 `qcovs=100` 是 PDB query 侧覆盖，不是 RMDB profile query coverage。它可以作为 reverse query 视图记录，但不能填到 linked-view 的 RMDB profile qcov。

### RASP signal-fact BLAST mapping

路径：

```text
/data/hsBack/05_devSpace/04_foldbridge_data/PIPLINE/rasp2pdb_signal_fact_mapping_rasp_params_20260611
```

这一路是最新 RASP BLAST 资产之一，query 是 RASP annotation / signal feature，subject 是 PDB normalized sequence：

```text
qseqid = pdb_sequence_match|annotation_feature|...
sseqid = 5GAG_A / 5GAG_B / other PDB normalized subjects
```

5GAG 在 RASP 侧的情况：

- `validation/blast_pdb_feature_counts.tsv` 中 `5GAG` 有 `47` 个 raw candidate。
- 这 `47` 个 raw candidate 全部是 `annotation_feature`。
- `run_support/rawhit_pdb_export_size_plan_20260613.tsv` 中 `5GAG raw_hit_rows=47`。
- `validation/blast_best_hit_per_query.tsv` 中没有 `sseqid=5GAG*` 的 best-hit 行。

这说明 RASP 侧可以显示「RASP feature query -> PDB subject」覆盖；它是独立 coverage 轴，不能标成 RMDB profile qcov / scov。

## 全量 RMDB / RASP 网页生成要求

全量生成时必须把 RMDB 和 RASP 的 coverage 轴分开。

RMDB2PDB 页面：

- 从 `rmdb2pdb_v3_exact_query_vs_pdb_normalized_acgun_rasp_params_20260612` 的 per-case export 取 profile 级 alignment coverage。
- 以 `profileId`、`sequence_label` / `pairId`、`pdb_reference_id` 精确 join。
- 页面可以显示 `qcovs` 和 `subject_coverage`，但必须注明轴。
- 不得从 FEC / LSS / atom_site coverage / UI 序列相等性推导 qcov / scov。

RASP2PDB 页面：

- 从 `rasp2pdb_signal_fact_mapping_rasp_params_20260611` 显示 RASP feature query coverage。
- key 应为 `qseqid`、`matching_entry_kind`、`sseqid` / PDB chain。
- 文案必须写成 RASP feature coverage，不得标成 RMDB profile qcov。
- raw candidate 和 best-hit 要分开展示；如果某 PDB 只在 raw candidates 中出现，不能当作 retained best-hit。

共享 linked-view 资产：

- `raw-alignment-coverage.json` 应由构建期 materializer 写入，不由浏览器加载大表。
- 建议字段包括：`profileId`、`pairId`、`pairSegmentId`、`sequenceLabel`、`pdbReferenceId`、`pident`、`identityFraction`、`alignmentLength`、`qstart`、`qend`、`sstart`、`send`、`qcovs`、`subjectCoverage`、`sourceDataPath`、`sourceRowKey`。
- `structure-coverage.json` 继续只表达 sequence alignment 和 atom_site 坐标覆盖。
- 如果资产未物化，页面显示 `not materialized`，不要展示伪数值。

## 后续实现入口

推荐下一步：

1. 增加 build-time materializer，从 per-case export 写 `raw-alignment-coverage.json`。
2. 给 `DATA:262 / sequence_000008` 增加测试：`qcovs=97.0`、`subjectCoverage=100.0`。
3. 增加负向测试：RASP feature coverage 不得标成 RMDB profile qcov。
4. 保留现有 3D 双容器策略：target chain crop 用于联动和染色，full CIF reference 用于对照。
5. 全量生成 RMDB / RASP 网页时，分别生成 RMDB profile coverage layer 和 RASP feature coverage layer，不合并成一个「case coverage」字段。
