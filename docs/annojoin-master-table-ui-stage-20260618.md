# ANNOJOIN Master Table UI Stage

日期：2026-06-18

## 目标

`#sequence` 和 `#annojoin-atlas` 现在只负责展示 `ANNOJOIN/anno_case_search_index.tsv` 派生的总表。详情页原型继续保留在 `#annojoin-case`，但总表页不主动加载 case 详情资产，也不把 ANNOCONFIDENCE 大表放进浏览器。

本阶段改造范围：

- 基础表格展示，避免卡片式页面拉长。
- 分页。
- 列显隐。
- 二级折叠：parent class -> child class -> case rows。
- 详情侧栏：只展示当前 index row 的字段，不加载 case asset。

## 折叠规则

一级 group 使用 `parentClassLabel`。如果 parent 缺失，则该 case 自己以 `childClassLabel`、`biologicalMoleculeName`、`pdbMoleculeName` 或 `pdbId/caseId` 形成一级类。

二级 group 使用 `childClassLabel`。如果 child 缺失，则使用与一级相同的 fallback。这样有 parent 的数据优先形成 parent/child 二级折叠，没有 parent 的数据不会被压到单一 “未注释” 桶。

## 文件边界

- `src/annojoinAtlasData.js`：ANNOJOIN JSON 资产到浏览器 state 的归一化层。
- `src/annojoinAtlasTableModel.js`：总表纯数据模型，负责列定义、排序、分页、parent/child 分组、导出行。
- `src/annojoinAtlasView.js`：纯 HTML render，不绑定事件，不读全局状态。
- `src/annojoinAtlasController.js`：总表 DOM 事件绑定，包括搜索、分页、列显隐、选择、导出、折叠。
- `src/main.js`：只保留路由状态、URL 参数、全局 selection/collapse/column state，并调用 view/controller。

## 当前限制

- 每行仍是 case-level row，不挑选“最佳 profile”。
- `confidenceDisplayLabel` 是 case-level confidence distribution，不显示“最佳 confidence”。
- 侧栏只展示总表字段和字段来源，不进入 1D/2D/3D evidence panes。

## 2026-06-18 UI 收敛

- `Parent class`、`Child class`、`Source` 不再作为表格列、列显隐项或侧栏字段展示。
- parent/child 仍作为分组依据，但只有类桶内至少 2 个 case 时才显示折叠行；单 case 类直接显示为普通 case 行。
- `Biological molecule` 与 `PDB molecule` 合并为 `Molecule name`，优先使用 biological display name，缺失时使用 PDB molecule fallback。
- `Probe family` 不再展示在总表列中。
- 右侧区域固定为字段解释面板：默认提示用户点击表格字段；点击 molecule/confidence/PDB/profiles/chains/conflicts 后展示对应 case-level 解释。
- 需要折叠的类默认折叠。展开后的 group 使用边框和底色与普通 case 行区分。
- 大 group 不做嵌套分页；采用全表分页 + 展开 group 内默认展示前 25 行 + Show all/Show less 的 capped grouped rows 方案，避免两套页码互相干扰。

## 2026-06-18 Profile Trace 修正

- 总表不再把 `ANNOJOIN/anno_case_search_index.tsv.profile_ids` 的 `rmdbv3_exact_*` 内部 ID 暴露为用户可见 profile 标识。
- 生成资产从 `ANNOJOIN/anno_residue_track_route_index.tsv.profile_id` 派生 `profileTracePreview`，按 `case_id + pair_id` 保留最多 8 条可复现预览。
- RDAT trace 规范化为 `rdatPath`、`rdatFile`、`rdatLine` 或 `rdatRecord`。例如 `data-eterna/data-eterna/OK7ALIB_2A3_0000.rdat#5914` 展示为 `data-eterna/OK7ALIB_2A3_0000.rdat` + `line 5914`。
- 133 原始 release 根 `/data/hsBack/05_devSpace/03_foldbridge_rmdb_rasp/99_rmdb_release_20260606` 已验证：`data-eterna/OK7ALIB_2A3_0000.rdat` 存在，第 5914 行定位到 `ANNOTATION_DATA:5898`，并可继续定位对应 `REACTIVITY:5898` 与 `REACTIVITY_ERROR:5898` 行。
- 右侧 Profiles 面板改为固定高度 trace 表格，文件名列使用省略显示，避免长字符串撑宽侧栏。

## 2026-06-18 折叠交互收敛

- 原行为中 parent 和 child 都默认折叠，parent 下只有一个 child 且该 child 有多行时，需要点击两次才能看到 case rows。
- 新规则：parent 下只有一个 child bucket 时，不渲染 child 折叠行；点击 parent 一次即显示 case rows。
- parent 下存在多个 child bucket 且 child 自身有多行时，保留二级 child 折叠。
- 单 case child 仍然不单独折叠，继续直接显示为普通 case row。
