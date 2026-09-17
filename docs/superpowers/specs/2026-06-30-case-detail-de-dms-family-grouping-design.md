# Case 详情页：去-DMS 化染色 + Family 分组下拉 设计

- 日期：2026-06-30
- 分支：`release-public`
- 范围：foldbridge 静态站 case 详情页 workbench（vanilla JS）

## 背景与问题

case 详情页（rasp-v3 / rmdb-v3 自包含静态树）的 3D/2D 反应性染色历史上写死成 DMS 语义：

1. **碱基适用性写死 A/C**：`assayStateForBase(base)` 只把 A/C 当 applicable，其余碱基灰显。这对 DMS（Family A）正确，但对 SHAPE/2A3（Family B，四碱基全反应）、酶切（Family C，非碱基特异）、SASA（Family D，所有碱基都有溶剂可及性）等会错误灰显 G/U 等残基。
2. **标签写死 DMS**：所有 Mol* 颜色载荷标 `DMS_REACTIVITY_FILL`，状态栏文案写死 "DMS reactivity colors" / "DMS targetability" / "DMS loop recall"。
3. **profile 下拉扁平无分组**：54 个 profile 平铺为 `${pair_id} | ${profile_id}`，无 family 分组；其中 30 个无 family（未进入 confidence 评估）也混在其中。

## 数据地基（已实证，8AUV）

- workbench 已加载 `chains/<id>/linked-view/linked-view.json.gz` → `lssContext.records`（每 profile 一条，**带 `family` 字段**），并已建索引 `state.lssContextByProfileId`，`lssContextForProfile(profileId)` 现成可用。
- **本设计无需新增任何数据获取**——family 已在 workbench 内存里，只是未用于染色/分组。
- 8AUV 实测：54 profile 中 24 个有 family（A=15 / B=4 / C=5），30 个 family 为空。
- family↔profile 关联键：`lssContext.records[].profileId` == profile-index 的 `profile_id`。

## 改动落点

两份共享 workbench（每 case 用相对路径引用，改一处生效全部 case）：

- `public/rasp-v3/__rasp_v3_site__/workbench.js`
- `public/rmdb-v3/__family_d_site__/workbench.js`

两份文件结构同源、函数同名，行号不同。

## 改动 1：Family→碱基适用性

`assayStateForBase(base)`（rasp 462 / rmdb 449）替换为 family 感知函数：

```
familyTargetsBase(family, base):
  normalizedBase = base.toUpperCase()
  A → base ∈ {A, C}      // 唯一做碱基门控（WC-face base-specific，DMS 类）
  B → 全碱基 applicable    // flexibility-proxy（SHAPE/2A3）
  C → 全碱基 applicable    // 酶切，非碱基特异
  D → 全碱基 applicable    // SASA，所有碱基都有溶剂可及性
  E → 全碱基 applicable    // contact-map
  F → 全碱基 applicable    // pair-set
  空/未知 → 全碱基 applicable
```

即：**仅 Family A 做 A/C 碱基门控，其余全部 family 及未知一律全碱基 applicable。**

family 来源：`lssContextForProfile(activeProfileId())?.family || ""`。

调用点改为传入当前 profile 的 family：
- rasp 612 / rmdb 599（`assayState: ...`）
- rasp 1391 / rmdb 1234（`const targetable = ... === "applicable"`）

数值染色逻辑（per-profile 95 分位归一 → `colorForNorm`）**完全不变**。

## 改动 2：去掉 DMS 标签

- `colorForMolstarDmsReactivity` → `colorForMolstarReactivity`（rasp 931/951 / rmdb 881/901，函数定义+调用一并改名）。
- `colorSource: "DMS_REACTIVITY_FILL"` → `"REACTIVITY_FILL"`（rasp 956,967 / rmdb 906,917，含 `dataset.targetDisplayColorSource`）。
- 状态栏 / 详情面板文案去 DMS：
  - "DMS reactivity colors" → "reactivity colors"
  - "DMS targetability ..." → "targetability ..."（或按 family 动态，最小改动用中性措辞即可）
  - "DMS loop recall" → "loop recall"
  - "Assay state" dt/dd 不变（值已由改动 1 决定）

中性措辞优先，不强求按 family 动态生成文案（YAGNI）。

## 改动 3：隐藏无 family 的 profile + optgroup 分组

- 下拉构建处（rasp 2045-2048 / rmdb 对应处）：
  - 只保留 `lssContextForProfile(profile.profile_id)?.family` 非空的 profile（24/54）。
  - 用 `<optgroup label="Family A">` 等按 family 分组（A/B/C/D/E/F 顺序），组内列 profile，`<option value="${原始 idx}">` 保持指向全量 index 的原始下标。
- `richestProfileIndex()`（rasp 1898 / rmdb 1743）：候选集收窄为可见（有 family）的 profile，只在其中选最强信号。
- `profileIndexForId` / `state.profiles` / shard 加载等**保持按全量 profile-index 工作**——只收窄"下拉可见集"，不破坏 profile_id↔row 映射。
- 边界：若某 case 全部 profile 都无 family（24=0），下拉为空——退化为展示全部 profile（避免空下拉死锁）。rmdb-v3 family-D case 须确认其 lssContext family 字段确有 "D"，否则会全被隐藏（验证时重点核对）。

## 验证

每份独立启本地静态服务（`python3 -m http.server` 在 `public/` 或 `dist/` 根），浏览器开：
- rasp-v3：8AUV（`#... RASP2PDB:8AUV`）
- rmdb-v3：一个 family-D case

确认：
1. profile 下拉按 Family 分组（optgroup 可见）。
2. 下拉只剩有 family 的 profile。
3. B/C/D profile 的 G/U 等残基不再被错误灰显（全碱基按数值染色）。
4. Mol* 染色正常，无 console error。
5. 切换不同 family 的 profile，染色随之更新。

若 `test/` 下有覆盖这两文件的 smoke gate，一并跑过。

## 非目标（本轮范围外）

- 多链物化与多链切换（数据上游 Python 仓负责，case 数据当前单链）。
- 按 technology 精确 targetable_bases（粗粒度 family 级即可，已确认）。
- 恢复被覆盖的 richest-profile 默认（release-public 当前 workbench 已含 richestProfileIndex，无需恢复）。
- 按 family 动态生成状态栏文案（中性措辞即可）。
