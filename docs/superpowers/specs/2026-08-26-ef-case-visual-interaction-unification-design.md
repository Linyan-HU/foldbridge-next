# EF Case 视觉与交互彻底统一设计

## 目标

修复 EF Case 当前仍存在的三处分叉实现，使它满足既有 Case Workbench 与 `family-ef-supplement-handoff-20260825.md` 的统一要求：

1. Family E 热图不再把未承载数据的右上三角表达为真实零信号；Family F 仍显示完整矩形。
2. 1D mapped chain sequence 沿用普通 Case 的轨道视觉、残基身份和 hover/selected 状态，只增加动态 EF intensity 行。
3. VARNA 使用普通 Case 的 residue hit layer、状态类和双向联动，不再保留 EF 专用 hover/selected 表现。

## 方案比较

### A. 继续修补 EF 专用组件

改动最小，但会继续复制字体、间距、状态样式和事件代码；普通 Case 变化后 EF 仍会漂移。不采用。

### B. 只统一 CSS

能暂时让截图接近，但不能修复 `data-residue-key`、双端点 pair selection、VARNA 反向 hover 和共享 tooltip。不采用。

### C. 复用共享视觉与状态契约（采用）

保留 EF 矩阵/强度的特有数据逻辑，复用普通 Case 的轨道几何、CSS 状态类、VARNA hit layer 和 residue identity。改动边界明确，也能由交互测试验证。

共享不是复制同名 CSS。实现必须提供普通 Case 与 EF 同时调用的 residue-linkage API，至少负责 residue-key 集合归一化、DOM `.hovered/.selected` 状态和 VARNA hit layer；同时提供共同调用的 residue-rail primitive，统一 210px gutter、24px pitch、刻度、规则线、字体和基础 SVG 结构。普通 Case 的单 residue 状态使用单元素 key 集合，EF matrix pair 使用双元素集合。

## 行为设计

### Heatmap

- Family E / `cohcoa_contact`：仅渲染并命中 `i > j` 且 `i - j >= diag_mask_min_sep` 的有效左下三角；其余上三角/对角遮罩区没有 cell tooltip、hover 或 click。
- Family F / `m2_coupling_z`：保留完整 `n_rows × n_cols` 矩形和双轴行为。
- renderer 必须从 mapped payload 派生一份不修改原始科学载荷的 presentation-valid-cell 集。cell rendering、hit testing、tooltip/click、intensity slice、VARNA recolor、Mol* payload 和 interaction event 全部只能读取该集合，禁止只有 SVG 隐藏而下游仍读取 E 上三角。
- presentation header 的 `value_min/value_max` 必须从有效 cells 重算，避免隐藏的上三角值污染颜色尺度和 colorbar；原始 payload/header 保持不变。
- 点击有效 cell 形成 pair selection，同时锁定 i、j 两端；1D、VARNA 和 Mol* 分别高亮可映射/可观察端点。
- Family E 单 residue intensity 使用有效左下三角中该 residue 的 row 与 column 并集，不能漏掉一半接触。
- Family F 保留轴上下文：matrix row/column 选择分别显示对应 slice；1D、VARNA、3D 使用覆盖 mapped chain 最完整的 `sequenceAxis`（当前真实 F 为 j 轴）并在状态文本明确显示 i/j，不把两个不同实验轴合并。

### 1D mapped chain sequence

- 使用普通 `renderTrackRail` 的 210px label gutter、24px residue pitch、碱基颜色、字体、刻度、规则线和 `residue-mark` 状态。
- 内容保留 `PDB pos`、`Mapped chain seq`，新增动态 `EF intensity`；不虚构普通 profile/reactivity 数据行。
- `data-residue-key` 只能来自通过 `assertLinkedContract` 的 `linkedView.residueIndex.residues[].residueKey`。EF bootstrap 把 linkedView 交给 renderer，按精确链身份建立 `labelSeqId → residueKey`；缺失、重复、链不一致或 axis 无法解析必须 fail-loud，禁止自行拼 key。
- 1D marks、VARNA fill/hit nodes、heatmap endpoints 和 Mol* bridge 全部引用上述原始 key。每个可交互 mark 的 mousemove/click/leave/keyboard 都进入共享 linked hover/selection 管线。

### VARNA

- 使用独立透明 hit layer 扩大命中区，不再对整个 SVG 做最近圆点扫描。
- hover 和 selected 只使用共享 `.hovered`、`.selected` 描边；不得覆盖强度填充色。
- VARNA hover/click 必须反向更新 1D、heatmap 和 3D；矩阵 pair hover/click 必须同时标记两个端点。
- 只有 axis 明确 `observed === true` 的端点允许进入 Mol*；缺失 observed 状态必须在 linked contract 阶段 fail-loud。Mol* 事件只接受 `label_seq_id`，不能把 `auth_seq_id` 猜成 label 编号；需要 auth→label 时只能使用 linked-view locator 的显式映射。
- pair→single 用新单元素集合替换双元素集合；选择另一个 pair 用新双元素集合替换旧集合；mouseleave 只清 hover，不清 locked selection；重复点击当前 selection 清除 locked selection。所有 clear 后强度填充恢复到当前 slice/原始值，禁止留下 EF 专用 class。

## 测试与验收

先写失败测试，再实现：

1. E 上三角不渲染、不可命中，F 矩形不受影响。
2. E presentation cell 集同时控制 renderer、row+column intensity、VARNA 和 Mol*；原始 payload/cell hash 不修改。
3. E cell click 保留两个端点，而不是只锁一行；pair/single/repeat/clear 状态转换明确。
4. EF 1D marks 使用 linked-view 原始 `data-residue-key` 和共享状态类；缺失/重复 key fail-loud。
5. VARNA 不再使用 `.is-ef-hovered/.is-ef-selected`，selection 不覆盖 fill；hover/click 双向联动。
6. 覆盖普通 Case 与 EF 的 1D、VARNA、heatmap、Mol* mouseover/mouseout/click/clear、pair 两端、`observed !== true` 端点不进入 3D、auth/label 编号差异、键盘操作、真实 E fixture 与非方形 F fixture。
7. 运行 EF 单测、完整 `npm test`、JS 语法检查和 `git diff --check`。
8. 在本地 Case Shell 对 `9WNR/a` 做鼠标 hover/click 回归，并用一个 Family F case 验证完整矩形。

本任务不修改 EF 科学数据、坐标物料化或 Tunnel 公网源；部署需在本地验收后单独执行。
