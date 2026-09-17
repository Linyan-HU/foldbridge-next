# Case 公开技术分类与隔离数据设计

## 状态与授权边界

本设计已获准进入“书面规格 + 隔离准备”阶段。当前阶段只允许：

- 在大小写敏感卷上的隔离 Git worktree 中编写并审查设计文档；
- 只读分析 `/Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb`、现有 Case 资源与当前 Entry 分类代码；
- 规划新的 staging 数据目录。

当前阶段明确不允许：

- 修改原始 DuckDB；
- 写入 `/Volumes/tianyi/Server/public`、Tunnel 源、当前公网静态源或任何现有 Case 产物；
- 修改、推送或部署 `ghhttps/main`；
- 生成全量或 pilot sidecar；
- 改动 Case UI、科学矩阵、坐标投影、1D/2D/3D 联动或 profile 数值。

代码工作树固定为：

`/Volumes/tainyissd/foldbridge-worktrees/case-public-taxonomy`

隔离数据父目录预留为：

`/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828`

该路径只作为不可变 run 目录的父级；pilot、full 和任何重跑必须使用不同的 `run_id` 子目录，不能直接把文件写在父级。

只有用户另行确认实施计划后才能写 staging；只有用户另行确认发布后才能替换线上源。

## 问题定义

当前 Case profile selector 和相关标签读取 `confidence-evidence` 中的 `family` 与 `technology`，公开页面因此出现 `Family A–F`、`Tier`、`LSS`、`EF` 等内部术语。该来源还不能覆盖全部可选 profile：以 `1C2X/C` 为例，`profile-index` 有 511 个 profile，但现有 confidence evidence 只有 410 行。

公开 Entry 页面已经采用另一套用户口径：五个 probing categories，加公开方法名称。用户要求 Case 与 Entry 使用同一口径；内部 Family A–F 不能出现在页面文案、Profile selector、badge、tooltip、空状态、DOM 可访问名称或新建的公开 taxonomy sidecar 中。

Family A–F 与五个公开 categories 是正交维度，不可按字母一对一替换。Case 必须在 profile 粒度读取 DuckDB 的 `profile.tech_filter`，再复用 Entry 的分类模型，而不是读取 chain 聚合值，也不能从 `family` 猜技术。

## 已核实的数据事实

只读分析基于：

`/Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb`

当前快照包含：

- 17,843 个 PDB × auth chain；
- 20,550,014 条 profile；
- 14,953 个含 profile 的 case；
- 已抽样的 37,838 条线上 `profile-index` 记录均可按 profile id 精确连接到 DuckDB；
- `1C2X/C` 的 511/511 个 `profile-index` id 可唯一连接；DuckDB 同链有 520 条 profile，其中 9 条未进入该页面的 `profile-index`；
- `9WNR/a` 的 6,838/6,838 个 `profile-index` id 可唯一连接；DuckDB 同链有 6,851 条 profile，其中 13 条未进入该页面的 `profile-index`。

因此 `profile-index` 是公开页面 profile 集的权威清单。DuckDB-only profile 不得被追加进 sidecar，也不应导致页面清单失败；它们必须单独报告，便于审计数据池与发布清单的差异。

五类映射后的 profile 计数为：

| Public category | Profiles | Cases |
| --- | ---: | ---: |
| DMS-based methods | 9,468,453 | 14,907 |
| SHAPE-based methods | 10,222,695 | 14,912 |
| Cleavage-based methods | 81,015 | 5,831 |
| Nucleotide-specific chemical probing methods | 27,718 | 4,212 |
| RNA–RNA interaction mapping methods | 668,185 | 2,603 |

非空 `tech_filter` 的分类覆盖率为 99.9843%。目前需要显式处理而不能猜测的记录包括：

- `CIRS-seq`：2,799；
- `Glyoxal`：208；
- `Terbium`：204；
- 空 `tech_filter`：78,737，其中 background 76,326，非 background 2,411。

此外，`tNET-RNase-seq`、`tNET-MaP-seq`、`Lead-seq`、`RL-Seq` 已属于现有 Entry 完整方法模型，但不在 Entry 当前可见的 28 个二级筛选项中。Case 分类必须使用完整方法模型，不能误把“28 个可见筛选项”当成完整本体。

Family 与 category 的交叉计数进一步证明不能一对一替换：Family A 同时进入 DMS、SHAPE、nucleotide-specific 和 RNA–RNA interaction；Family D 同时进入 cleavage 与 nucleotide-specific；Family E 进入 interaction；当前 DuckDB profile 表没有 Family F profile。

## 唯一公开分类口径

Case 使用与 Entry 相同的五个 category id、label、short label、tokenization、方法别名与 canonicalization 规则。当前 taxonomy 本体的代码权威源为：

`src/techniqueFilterModel.js`

五个公开 categories 固定为：

1. `dms` — DMS-based methods
2. `shape` — SHAPE-based methods
3. `cleavage` — Cleavage-based methods
4. `nucleotide` — Nucleotide-specific chemical probing methods
5. `interaction` — RNA–RNA interaction mapping methods

当前 `tech_filter` 的分号/逗号拆分逻辑位于 `src/entryTable.js`，尚未由 taxonomy 模块导出。实施前必须把“拆分 → normalization → alias → canonical label → category”收敛成一个共享纯函数（例如 `classifyTechniqueFilter`），由 Entry 行归一化与 taxonomy snapshot exporter 共同调用。`src/entryTable.js` 不再保留第二份 tokenizer。

实现时不得在 Python builder、Case workbench 或静态 payload 中复制第二份手写 category/method/alias/tokenizer。构建数据流固定分成两段：只读 DuckDB extractor 只输出逐 profile 的精确 identity、原样 `tech_filter` 与 background/control 状态，不得拆分、归一化或分类；随后 Node classification stage 直接 import 并逐行调用共享 `classifyTechniqueFilter`，再写 sidecar 与审计报告。任何语言都不得根据 snapshot 重新实现分类算法。

taxonomy snapshot 是由同一共享模块导出的审计产物，不是另一套分类执行器。它必须记录 tokenization 版本、aliases、canonical labels、category 映射与固定 category 顺序，其内容哈希进入构建 manifest，并与 Node classification stage 实际加载的模块 commit 对应。Entry 与 Case 因此共享同一端到端分类实现，后续分类修订只改一个权威实现。

公开方法名遵循以下规则：

1. 调用共享 `classifyTechniqueFilter`，按 Entry 现有分号/逗号语义拆分 `profile.tech_filter`；
2. 用该函数的 normalization、alias 和 canonical name 规则匹配；
3. 已知方法输出 Entry canonical label；
4. 非空但尚未映射的方法保留 DuckDB `tech_filter` 中已经用于 Entry 的公开技术名，但 category 为空并进入审计报告；
5. 禁止用 `confidence-evidence.technology`、Family、source lane、profile id 或邻近 profile 猜方法；
6. 禁止新增 `Other`、`EF` 或 `Unassigned family` 作为第六个 category。

## 采用方案：每条 chain 一个公开 profile taxonomy sidecar

### 为什么采用 sidecar

每个 Case chain 新增一个小型 gzip sidecar：

`profiles/profile-public-techniques.json.gz`

它只补充 profile 的公开技术元数据，不改写现有 `profile-index.json.gz`、shards、VARNA、linked-view、CIF 或 EF matrix。这样可以在新目录中独立生成、校验和预览；验收前不触碰线上源；失败时也不会破坏 profile 数值与渲染资产。

不采用以下方案：

- **直接重写 `profile-index.json.gz`**：会扩大数据变更面，把分类修订与 profile 数值资产绑定；
- **浏览器运行时查询全局大表或 DuckDB**：增加请求、连接和缓存复杂度，也无法保证公网静态页面稳定；
- **继续使用 confidence evidence**：覆盖不完整，而且携带用户明确禁止公开的 Family/Tier/LSS/EF 语义；
- **chain 级 `tech_filter` 直接套给所有 profile**：chain 值是聚合，不能回答具体 profile 属于哪种方法。

### Sidecar schema

Schema 名称：`profile-public-techniques.v1`。

示例结构：

```json
{
  "schemaVersion": "profile-public-techniques.v1",
  "pdbId": "1C2X",
  "authChain": "C",
  "profileCount": 511,
  "profiles": [
    {
      "profileId": "data-eterna/example.rdat#1",
      "classificationStatus": "mapped",
      "methods": [
        {
          "label": "SHAPE",
          "mappingStatus": "mapped",
          "categoryId": "shape",
          "categoryLabel": "SHAPE-based methods",
          "categoryShortLabel": "SHAPE"
        }
      ]
    }
  ]
}
```

约束：

- `profileId` 必须与该 chain 的 `profile-index.profiles[].profile_id` 逐字节相等；
- sidecar profile 顺序必须与 profile-index 顺序相同；
- `profileCount` 必须同时等于 sidecar 数组长度和 profile-index 数组长度；
- 每个 profile 恰好出现一次；不得缺失、重复、追加或重排；
- category id/label 必须来自同一 taxonomy snapshot；
- `classificationStatus` 和 `methods` 在每个 profile 上始终必填；`methods` 始终为数组，不能是 `null` 或省略；
- 每个 method 始终包含 `label` 与 `mappingStatus`；`mappingStatus` 只允许 `mapped` 或 `unmapped`；
- `mapped` method 的 `categoryId`、`categoryLabel`、`categoryShortLabel` 均为必填非空字符串；`unmapped` method 的三个 category 字段均必须显式为 `null`；
- methods 按原 `tech_filter` token 顺序去重；同一 method 不得重复；
- sidecar 不得包含 `family`、`tier`、`lss`、`ef`、confidence-evidence 原始行或科学数值；
- source DB 路径、SQL、原始未分类审计值和构建环境只进入 staging reports，不进入公网 sidecar；
- gzip 解压后的 JSON 必须稳定排序、可重复构建；相同输入应产生相同内容哈希。

`classificationStatus` 只允许以下五种，并由 `methods` 与 DuckDB background/control 标记唯一决定：

- `mapped`：`methods.length > 0` 且所有 method 的 `mappingStatus` 为 `mapped`；
- `partially_mapped`：`methods.length > 0`，且同时含 `mapped` 和 `unmapped` method；
- `unmapped`：`methods.length > 0` 且所有 method 的 `mappingStatus` 为 `unmapped`；
- `background`：`methods` 必须为空数组，且 DuckDB 明确标记为 background/control；
- `missing`：`methods` 必须为空数组，且 profile 非 background/control、`tech_filter` 为空。

规范化例子：

```json
[
  {
    "classificationStatus": "partially_mapped",
    "methods": [
      {
        "label": "DMS",
        "mappingStatus": "mapped",
        "categoryId": "dms",
        "categoryLabel": "DMS-based methods",
        "categoryShortLabel": "DMS"
      },
      {
        "label": "CIRS-seq",
        "mappingStatus": "unmapped",
        "categoryId": null,
        "categoryLabel": null,
        "categoryShortLabel": null
      }
    ]
  },
  {
    "classificationStatus": "background",
    "methods": []
  },
  {
    "classificationStatus": "missing",
    "methods": []
  }
]
```

`background`、`missing` 与 `unmapped` profile 仍必须可选择和加载。它们不得回退显示 Family 字母；UI 分别使用公开中性文案 `Background / control`、`Technique metadata unavailable`、`Technique category unavailable`。

## 数据连接契约

连接链路固定为：

1. 从只读 Case 源枚举 `profile-index.json.gz`，以其为页面实际可选 profile 的权威集合，得到 `(pdb_id, auth_chain, profile_id)`；
2. DuckDB 中 `profile` 通过 `(pdb_id, chain_key)` 连接 `chain`；
3. `chain.auth` 与 Case 路径中的 auth chain 精确匹配，区分大小写；
4. `profile.profile_key` 与 `profile-index.profiles[].profile_id` 精确匹配；
5. 从匹配行读取 `profile.tech_filter` 及明确的 background/control 状态；
6. Node classification stage 直接调用共享 `classifyTechniqueFilter` 生成公开方法与 category；taxonomy snapshot 只用于校验实际加载模块的版本与哈希。

禁止：

- auth/asym chain 大小写折叠；
- profile id basename、前缀、`#` 行号或近似字符串匹配；
- gap-walk、offset、Family 常量或 confidence evidence 参与 technique join；
- join miss 时套用 chain 聚合技术；
- 为了达到覆盖率而丢弃 profile。

任一 `profile-index` profile 出现 DuckDB join miss、duplicate match、chain identity 冲突或 sidecar count drift，整个 chain 不得产出可发布 sidecar，并写入 `profile-join-failures.tsv`。同链存在 DuckDB-only profile 不属于 join failure：它们不得进入 sidecar，必须写入 `db-only-profiles.tsv`，并计入 manifest。

## 隔离 staging 布局

获准实施后只写一个新的、调用方显式提供的不可变 run 目录：

```text
/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/<run_id>/
├── data/
│   └── entry-cases/cases/<PDB>/chains/<auth>/profiles/
│       └── profile-public-techniques.json.gz
├── pilot-preview/
├── reports/
│   ├── coverage.json
│   ├── profile-join-failures.tsv
│   ├── db-only-profiles.tsv
│   ├── unmapped-techniques.tsv
│   ├── null-techniques.tsv
│   └── sha256.txt
└── source-manifest.json
```

`run_id` 格式固定为 `<kind>-<UTC>-<git12>`，其中 `kind` 只允许 `pilot` 或 `full`。例如 pilot 与 full 分别进入两个不同目录；重跑也必须生成新的 `run_id`。

`source-manifest.json` 至少记录：

- DuckDB 绝对路径、文件大小、mtime 与 SHA-256；
- Case profile-index 输入根及清单哈希；
- Git commit；
- taxonomy snapshot SHA-256；
- 构建器版本；
- sidecar、profile、`mapped`/`partially_mapped`/`unmapped`/`background`/`missing` 五种状态数量；五种状态之和必须严格等于 profile 总数；
- DuckDB-only profile 数量及其按 chain/tech_filter/background 的审计汇总；
- 生成时间和命令参数。

staging 构建不得包含 `rsync --delete`，不得覆盖同名既有 run 目录。若目标 `run_id` 已存在，默认 fail-loud；只有显式指定一个新的 `run_id` 才能重跑。

## Case UI 接入行为

UI 接入只允许发生在 staging 数据通过验收、且用户批准实施计划之后。

### 单一 Profile selector

- 页面只保留一个用户可见的 Profile selector；现有原生 `<select>` 可继续作为可访问性/状态 backing，但不能再出现第二个可见 profiles 窗口；
- 原生 options 与自定义下拉必须由同一 sidecar view model 生成，选中索引与 `state.profiles` 原顺序保持不变；
- 五类 category 取代 Family A–F 作为 badge 与筛选语义。为保证多 category profile 不重复，原生 options 和自定义列表都保持一个按 `profile-index` 顺序排列的扁平 profile 列表，不按 category 复制 optgroup；
- category 与 method 筛选位于同一个 selector 面板内，不是第二个 Profile selector。profile 命中其任一 method 的 category 即属于该 category；多 category membership 全部保留；
- category/method 的匹配逻辑复用 Entry 的 OR 语义：命中任一已选 category 或任一已选 method 即保留；无选择时保留全部 profile；
- 一个 profile 的 category badges 按共享 taxonomy 固定顺序显示，methods 按 sidecar 顺序显示；profile 列表本身不因分类重排；
- option 文案使用 `pair_id | Public method`；多个方法用稳定分隔符连接，需要 category 时显示全部 category short labels；不得拼接 `Family X`；
- 每个已加载 profile 在 selector 中恰好出现一次；分类缺失只能改变标签，不能影响可选择性；
- 新增筛选时只能复用现有 selector 区域，不能再造第三个控制器。

### 页面公开文本

以下内容不得出现在 Case 用户界面或可访问名称中：

- `Family A` 至 `Family F`、`Family` 分组；
- `EF`、`Linked EF matrix`；
- `tier`、`LSS`、内部 confidence class；
- `mapped-chain sequence`、`VARNA secondary structure`、`3D linked structure` 等内部拼装式介绍句。

面向用户的组件名称与普通 Case 保持一致，例如 `Sequence`、`Secondary structure`、`3D structure`、`Profile`、`Technique`。这次接入只替换 taxonomy、标签和 selector 数据源，不改变已有 1D/2D/3D 布局、色标、hover/click 或联动契约。

本任务不要求删除或重写现有科学 payload schema。若 confidence evidence 仍被现有非展示计算读取，可以继续加载，但 workbench 不得再从其中读取 `family`/`technology` 来构建 taxonomy、selector、badge、filter、tooltip、ARIA 或介绍文本。新 sidecar 是公开 technique metadata 的唯一 UI 来源；现有 payload 中的内部字段不进入 DOM。若后续要从静态服务器彻底移除历史 confidence-evidence 文件，需要另立数据迁移任务，不能在本任务中暗自扩大范围。

### 缺失数据行为

如果公开 taxonomy sidecar 请求失败、gzip/JSON/schema 不合法、case/chain 不匹配或 profile 集不一致：

- Profile 数值资产仍可按原索引加载；
- 公开 Technique 分类区显示明确的 `Technique metadata unavailable`；
- selector 可退化为只显示稳定 `pair_id`/profile label；
- 绝不回退读取或显示 confidence evidence 的 Family/technology；
- 控制台记录结构化错误，页面不静默伪造分类。

对于合法 sidecar 内的 `unmapped` profile，selector 仍显示该公开 method label，并将 category 标为 `Technique category unavailable`；`background` 与 `missing` 分别显示 `Background / control` 和 `Technique metadata unavailable`。

这里允许的是“无技术元数据时仍可查看原始 profile”，不是“用内部 Family 代替公开分类”的 fallback。

## Pilot 与验证门

第一阶段只在新的 `pilot-*` run 目录生成 pilot，不接线上：

- 普通 Case：`1C2X/C`、`5E54/B`；
- 当前 2D 代表：`9WNR/A`、`9WNR/a`、`9ZC6/A`、`9TMI/A`、`7SYS/z`、`8QO5/A`、`8UYE/A`、`8UYL/A`；
- 边界覆盖固定为：`1C2X/C` 与 `9WNR/a` 含 background profile；`9ZC6/A` 含 30 个非 background 且 `tech_filter` 为空的公开 profile；`5E54/B` 含 12 个 Glyoxal 和 12 个 Terbium 未分类公开 profile；同时构建 `9WNR/A` 与 `9WNR/a` 验证大小写 chain identity。当前 DuckDB 不存在 background-only chain，因此不得把它设为 pilot 前置条件。

数据验收必须全部通过：

1. 每条 pilot chain 的 profile-index 与 sidecar 进行双向集合相等校验；每个 profile-index id 在 DuckDB 中必须唯一命中；
2. `1C2X/C` 必须为 511/511 唯一连接并报告 9 条 DB-only；`9WNR/a` 必须为 6,838/6,838 唯一连接并报告 13 条 DB-only；
3. profile 顺序、count、id、chain case 全相等；
4. mapped category 与当前 Entry taxonomy 函数逐项一致；
5. `mapped`、`partially_mapped`、`unmapped`、`background`、`missing` 五种状态分别与 DuckDB + 共享分类函数的查询结果一致，且五者之和等于 sidecar `profileCount`；
6. 未分类方法只进报告，不被猜进五类；
7. 相同输入连续构建两次，解压 JSON 哈希一致；
8. staging 目录之外零写入；
9. 原 DuckDB 与全部输入资源 hash/mtime 不变；
10. reports 中 join failures 必须为 0 才能进入 UI pilot；DB-only 计数允许非零，但必须与审计查询一致且不得进入 sidecar。

UI pilot 验收必须覆盖：

1. 页面只有一个可见 Profile selector；
2. 所有 profile 均可加载，选中 profile id 不漂移；
3. Family/Tier/LSS/EF 在普通 Case 与 2D Case 的可见文本、DOM、ARIA、tooltip 中均为 0 命中；
4. 五类 label 和方法名与 Entry 相同；
5. partially-mapped/unmapped/background/missing 不丢 profile、不误分类；
6. Profile 切换、1D、2D、VARNA、3D、heatmap 与 residue 联动行为保持原样；
7. 现有完整测试通过，并新增 sidecar schema、精确 join、无 fallback、单 selector 和禁止词测试；
8. 本地浏览器对 `1C2X/C` 与 `9WNR/a` 做可见验收。

## 全量与发布门

Pilot 通过不自动授权全量，更不自动授权上线。后续必须分三次明确决策：

1. **全量 staging 授权**：生成所有有 profile-index 的 chain sidecar 与完整报告；
2. **分类例外授权**：对 `CIRS-seq`、`Glyoxal`、`Terbium` 和 2,411 条非 background null 选择“更新 Entry taxonomy”或“接受明确 unavailable”，不得由实现者猜；
3. **发布授权**：用户审查 staged diff、文件数量、总大小、哈希和 pilot 截图后，才可制定原子发布步骤。

发布时也不能直接从 staging 覆盖线上。必须先形成独立 release manifest，核对目标文件清单，备份待替换文件，采用原子替换，并在公网主站 iframe 路径验证真实用户页面；裸的 per-chain URL 只能作为资源诊断，不能代替主站验收。

## 成功定义

本任务完成后的用户可见结果应是：

- Case 与 Entry 使用完全相同的五个公开 probing categories 和技术名称；
- 每个 Profile 仍可选择、加载并保持原有科学数据和联动；
- 页面不泄露 Family A–F、EF、Tier、LSS 等内部概念；
- 未分类或缺失技术信息被明确标记，而不是猜测、隐藏 profile 或回退内部术语；
- 新数据先在独立、可审计、可重建的 staging 树中产生，任何线上替换都需要新的明确授权。
