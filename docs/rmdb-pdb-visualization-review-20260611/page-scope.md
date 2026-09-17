# PDB ID Case 页面口径

生成日期：2026-06-11

## 核心口径

页面的生物学口径采用：

```text
生物学分子
  -> PDB ID case 页面
```

一个生物学分子可以映射到多个 PDB ID case，但当前版本不进行跨 PDB 合并。当前每个页面只承载一个 `pdb_id` case，并在页面内完整展示这个 case 下的多对多关系。

换句话说，`pdb_id` 是当前页面的工程主键，不是生物学分子的唯一主键。生物学分子是更上层的概念，后续可以用于跨 PDB 聚合、同源结构比较或同一分子的多个结构状态整合，但这不是当前阶段的页面合并范围。

## 当前不做的事

- 不把多个 PDB ID case 合并成一个生物学分子页面。
- 不把一个 PDB ID case 强行解释为唯一生物学分子。
- 不把多个 RMDB unique sequence 或 probing profile 聚合成一个不透明单值。
- 不把 sequence-axis projection 展示成 observed-residue 结构证据。

## 页面主键

当前页面主键建议先采用：

```text
pdb_id
```

示例 URL：

```text
/pdb-cases/4qlm/
```

当前只支持 `pdbReferenceId` 作为 query 参数，用于直接打开某个 PDB reference sequence 的视图；该参数不改变 PDB ID case 页面作为基础承载单元：

```text
/pdb-cases/4qlm/?pdbReferenceId=4QLM_A
```

当前不支持 `rmdbUniqueId` 和 `bundleProfileId` 作为公共 URL 参数。若后续需要 profile 深链接，先设计用户可读 alias 或后台映射，不直接暴露 `bundleProfileId`。

## 页面内分层

页面内采用以下层级展示多对多关系：

```text
PDB ID case
  -> PDB reference sequence(s)
    -> RMDB unique sequence(s)
      -> bundle sequence(s)
        -> probing profile(s)
          -> PDB reference sequence-axis reactivity
```

这个层级保留了数据包中的真实关系：

- 一个 PDB ID case 可以包含多个 `pdb_reference_id`。
- 一个 PDB reference 可以对应多个 `rmdb_unique_id`。
- 一个 RMDB unique sequence 可以对应多个 `bundle_sequence_id`。
- 一个 bundle sequence 可以连接多个 `bundle_profile_id`。
- 多个 profile 可以投影到同一个 `pdb_pos`。

## 首屏默认展示

页面可以提供一个默认视图，但必须标注为「默认展示」或「默认选择」，不能暗示它代表整个生物学分子或整个 PDB case。

默认视图建议只用于降低首屏复杂度：

- 默认选中 best alignment pair；
- 默认展示 case-level summary；
- 默认列出 profile 数、sequence 数、reference 数；
- alignment 视图采用类 Clustal W alignment 形式；
- alignment 默认展示该 PDB case 的全部 alignments，但分页或折叠，每页 25 条；
- 每条 alignment 的 `RMDB query coverage` 与 `PDB reference sequence coverage` 作为侧边 meta 信息展示；
- `base_mismatch_rows` 当前不进入页面 UI；后期如需表达，优先用颜色区分；
- profile 默认按 `bundle_profile_id` 平铺列表，页面默认只展示来源，来源字段使用 `rdat_file`，内部 ID 放在后台；
- reactivity track 默认加载 best profile，best profile 定义为上游 best candidate pair 关联的第一个 profile；
- best profile 没有 reactivity rows 视为严重数据问题，不做静默 fallback；
- reactivity 默认用热图形式展示；
- 热图每条 profile 一个 row，row label 显示 `rdat_file`；
- 热图列维度固定为 `pdb_pos` / PDB reference sequence position；
- 热图颜色先按照每个页面 RMDB reactivity 的 P5/P95 分位数确定；
- 热图缺失值用灰色；
- RASP 数据合并后，仍使用同一 `pdb_pos` 轴，数据来源只在 source type 上区分；
- source type 是可扩展枚举，不限于当前 RMDB / RASP；
- 热图必须提供 source type 切换，默认选中并展示最佳 source/profile；
- alignment 侧边 meta 只放 `RMDB query coverage` 和 `PDB reference sequence coverage`；
- 不默认显示 `projection_status=pass` 或 BLAST identity；
- 提供切换入口查看其他 reference、sequence 和 profile。

## 页面硬规则

1. 页面声称的是「一个生物学分子下的 PDB ID case 视图」。当前不进行跨 PDB 合并，也不把 `pdb_id` 当作生物学分子的唯一标识。
2. 默认页面可以展示一个 best alignment pair，但必须标成 display default，不能暗示它代表整个 PDB 或唯一分子。
3. profile 不默认聚合成一个值，默认按 `bundle_profile_id` 平铺列表。
4. 页面不展示 `projection_status=pass`；页面展示 `RMDB query coverage`；页面展示 `PDB reference sequence coverage`；页面不展示 BLAST identity；后期如有需要再单独定义 confidence。

## 推荐页面标题

页面标题建议包含 PDB ID 和 case 口径：

```text
4QLM · PDB ID case for RMDB-to-PDB sequence projection
```

如果后续建立生物学分子层，可以在标题上方增加分子标识：

```text
Biological molecule: <molecule label>
4QLM · PDB ID case
```

在当前阶段，`<molecule label>` 如果没有稳定来源，应显示为待定或不展示，不能从 PDB ID、RMDB sequence ID 或 profile ID 临时推断。
