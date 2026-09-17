# 评审 C 类 Case 工作台修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成 Case 侧的 C1.5、C1.7、C1.8、C1.9 和 C3.2：窄屏不溢出、VARNA 放大后可原生滚动、Technique 筛选显示命中反馈、8SQ9 不请求废弃 RDAT，并在 1D/2D/3D 中区分缺失、非正值和正值。

**架构：** 可测试的筛选文案和反应性分类进入 `workbench-pure.mjs`；`workbench.js` 只负责 DOM、SVG 与 Mol* 适配。共享未版本化资产是编辑源，随后通过既有版本脚本生成一组新的完整指纹闭包；旧指纹资产保留用于缓存与回滚。Case 数据、RDAT、E/F 矩阵和每个 Case 的 HTML/JSON 不重建。

**技术栈：** 原生 JavaScript ES modules、SVG、CSS、PDBe Mol*、Node.js `node:test`、静态指纹脚本、隔离 HTTP 候选与浏览器网络验收。

---

## 依据与边界

- 设计规格：`docs/superpowers/specs/2026-09-12-reviewer-c-fixes-and-d-assessment-design.md`
- 发布手册：`/Users/joseperezmartinez/docs/foldbridge/.worktrees/update-deployment-handbook/docs/网站更新手册_DEPLOYMENT_HANDBOOK.md`
- 生产静态源：`/Volumes/tianyi/Server/public`，本计划执行阶段只读。
- 8SQ9 验收链：`8SQ9/P`，其 Profile 包含 `PDB130_2A3_0000.rdat#13322` 与 `PDB130_DMS_0000.rdat#13322`；Profile ID 是来源标识，不代表浏览器应请求原始 RDAT 文件。
- 三状态可视验收链：`10FZ/A` 的 `data-eterna/ETERNA_R74_0000.rdat#908`；已读基线为 1,488 个 missing、3 个有限 `<=0`、51 个正值。执行时须先重新计数，不把本计划的快照当作永久事实。
- 不恢复 `PDB130_DMS_0000.rdat`，不恢复 RMDB 原始反应性热图，不修改 E/F 矩阵色标。
- 不自动切换 Profile，不增加确认按钮，不刷新页面。
- 不写生产目录、不重启 Tunnel/CORS、不推送 Git；这些动作都需要新的明确授权。
- 本计划必须在主站 C 计划完成后串行执行；保留主站已加入 `test/entry-case-embed.test.js` 的断言，禁止两份 C 计划并行改该文件。

## 文件结构

- 修改：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs`——新增三状态分类、P95 归一化和筛选反馈纯函数。
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js`——接入纯函数，更新 1D/2D/3D、图例、计数和 Technique 状态；保持废弃 RDAT 路径不被调用。
- 修改：`public/entry-cases/__entry_v3_site__/workbench.css`——VARNA 双轴滚动、缺失纹理/非正值/正值图例和窄屏控件布局。
- 修改：`public/entry-cases/__entry_v3_site__/case-shell.css`——仅在浏览器复现证实需要时修正外壳窄屏固定宽度，不改高度消息协议。
- 修改：`scripts/version-ef-entry-assets.mjs`——把闭包版本提升为 `20260912-reviewer-c-1`。
- 修改：`public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs`——只更新闭包内 technique model 的版本引用。
- 生成：`public/entry-cases/__entry_v3_site__/*.20260912-reviewer-c-1.{js,mjs,css}` 与 `public/entry-cases/__entry_ef_site__/*.20260912-reviewer-c-1.js`——由版本脚本生成，不手工复制。
- 新建：`test/case-workbench-pure.test.js`——反应性分类和筛选反馈纯逻辑测试。
- 新建：`test/case-workbench-responsive.test.js`——VARNA 双轴滚动和 Case 窄屏 CSS 契约测试。
- 新建：`test/case-workbench-ui.test.js`——SVG/DOM 运行时源码契约和 C1.9 请求回归测试。
- 修改：`test/entry-case-embed.test.js`——共享资产闭包、内外层滚动和废弃热图断言。
- 新建：`docs/reviewer-response/2026-09-12-c-case-evidence.md`——记录 C1.5、C1.7、C1.8、C1.9、C3.2 的证据。

### 任务 1：建立 Case 基线和失败测试

**文件：**

- 新建：`test/case-workbench-pure.test.js`
- 新建：`test/case-workbench-responsive.test.js`
- 新建：`test/case-workbench-ui.test.js`
- 修改：`test/entry-case-embed.test.js:179-200`
- 修改：`test/entry-case-embed.test.js:263-279`

- [ ] **步骤 1：运行现有相关测试，保存基线**

```bash
cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/ef-unified-main-sparse
node --test test/entry-case-embed.test.js test/download-contract.test.js
node --test test/case-public-technique-preview.test.js
```

预期：第一条的本地自包含测试通过。`case-public-technique-preview.test.js` 单独保存为基线证据；当前可能因既有 provenance 断言或外卷 EPERM 失败。必须记录精确用例与输出，只允许与本步基线完全一致的失败，不把它概括为“全部通过”。

- [ ] **步骤 2：写反应性三区分失败测试**

在 `test/case-workbench-pure.test.js` 从未版本化 `workbench-pure.mjs` 导入将要新增的 `normalizeReactivityProfile` 和状态常量，覆盖：

- `NaN`、`Infinity` 和 `-Infinity` → `missing`、中性灰；
- 有限 `-1` 和 `0` → `nonpositive`、淡蓝；
- 正值 → `positive`、沿用白—黄—红色带；
- cap 只由正值计算 P95，极值被截到 1；
- 返回 `missingCount`、`nonpositiveCount`、`positiveCount`，三者之和等于显示长度；
- 不把缺失值强制写成原始值 0。

用包含三类值的小数组做精确断言，避免依赖生产数据才能验证语义。

- [ ] **步骤 3：写 Technique 反馈失败测试**

仍在 `test/case-workbench-pure.test.js` 为将要新增的 `publicTechniqueFilterStatus({ active, hitCount, totalCount, metadataAvailable })` 覆盖：

- 有筛选且 1 命中：`匹配 1 个 Profile；请在 Profile 下拉列表中选择`；
- 有筛选且 N 命中：`匹配 N 个 Profile；请在 Profile 下拉列表中选择`；
- 有筛选且 0 命中：`无匹配 Profile`；
- 清空筛选：显示全部 Profile 的总数；
- 元数据不可用：`Technique metadata unavailable`，不伪造数量。

- [ ] **步骤 4：写 UI 与 C1.9 源码契约失败测试**

在 `test/case-workbench-responsive.test.js` 读取未版本化 CSS，断言 VARNA 双轴滚动、窄屏控件和局部滚动边界；在 `test/case-workbench-ui.test.js` 读取 `workbench.js` 与 CSS，断言：

- Technique 状态节点包含 `aria-live="polite"`；
- `refilter()` 只改变 Profile 选项可见性和状态文本，不派发 Profile `change`、不调用 `renderProfile()`、不刷新页面；
- `.varna-frame` 或稳定的外层视口在放大后使用 `overflow: auto`，并有可聚焦/可访问的滚动区域；
- 非 E/F 的 VARNA 外层有稳定 block-size，140% 后 `scrollWidth > clientWidth` 且 `scrollHeight > clientHeight`，`1:1` 后滚动位置复位；
- 初始化、`renderProfile()` 和 Profile change handler 都不调用 `renderRmdbHeatmap()`；
- 没有 `fetch()` 指向 `PDB130_DMS_0000.rdat` 或 `/api/rmdb/rdat/` 的可达调用；
- 图例包含 missing/unmapped、measured ≤ 0 和 positive/P95 三种语义；
- E/F 模式 CSS 和脚本没有被三状态规则重写。

保留现有“废弃热图不被创建”测试；不要把它改成恢复热图。

- [ ] **步骤 5：确认新测试红灯**

```bash
node --test test/case-workbench-pure.test.js test/case-workbench-responsive.test.js \
  test/case-workbench-ui.test.js test/entry-case-embed.test.js
```

预期：因纯函数未导出、状态无 `aria-live`、VARNA 仍 `overflow: hidden/visible`、图例仍合并 missing 与 ≤0 等明确原因失败。

### 任务 2：实现 C3.2 与 C1.8 纯逻辑

**文件：**

- 修改：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs:1-68`（新增反应性常量与纯函数）
- 修改：`public/entry-cases/__entry_v3_site__/workbench-pure.mjs:459-482` 附近（新增筛选反馈纯函数）
- 测试：`test/case-workbench-pure.test.js`

- [ ] **步骤 1：把数值分类和正值归一化提取为纯逻辑**

`normalizeReactivityProfile(values)` 的每个位置至少返回：

```js
{
  raw,
  norm,
  state: 'missing' | 'nonpositive' | 'positive',
  color
}
```

规则固定为：非有限原始值是 missing；有限且 `<= 0` 是 nonpositive；`> 0` 才参与 P95 和现有连续色带。给 3D 使用的 `color` 必须都是十六进制实色；缺失纹理只在 SVG 表现层应用。

- [ ] **步骤 2：实现筛选反馈纯文案**

实现 `publicTechniqueFilterStatus({ active, hitCount, totalCount, metadataAvailable })`：1 命中显示 `匹配 1 个 Profile；请在 Profile 下拉列表中选择`，N 命中使用相同格式，0 命中显示 `无匹配 Profile`，清空条件显示全部 Profile 总数，元数据不可用显示 `Technique metadata unavailable` 而不伪造数量。

- [ ] **步骤 3：运行纯逻辑测试**

```bash
node --test test/case-workbench-pure.test.js
```

预期：三状态、P95、计数、实色语义和筛选反馈文案断言全部通过。尚未接入运行时的另外两份测试不在本步骤命令中，并在后续任务各自转绿。

- [ ] **步骤 4：提交纯逻辑**

```bash
git add public/entry-cases/__entry_v3_site__/workbench-pure.mjs \
  test/case-workbench-pure.test.js
git commit -m "test(Case): 定义三状态与筛选反馈纯逻辑"
```

此提交不得修改 `workbench.js`；未版本化工作台仍引用旧指纹 pure module，因此提交本身保持可加载。运行时接入与新指纹闭包在任务 4 原子完成。

### 任务 3：实现 C1.7 VARNA 原生滚动和 Case 窄屏修复

**文件：**

- 修改：`public/entry-cases/__entry_v3_site__/workbench.css:314-360`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.css:560-580`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:2088-2127`
- 修改：`public/entry-cases/__entry_v3_site__/case-shell.css:535-551`（仅按复现结果）
- 修改：`public/entry-cases/__entry_v3_site__/case-shell.css:637-671`（仅按复现结果）
- 测试：`test/case-workbench-responsive.test.js`
- 测试：`test/entry-case-embed.test.js`

- [ ] **步骤 1：修正 VARNA 滚动容器**

把非 E/F 的 `.varna-viewport` 定为唯一滚动容器：`block-size: clamp(220px, 32vw, 404px)`、`overflow: auto`，100% SVG 先填满该稳定视口，放大时由现有 `applyVarnaZoom()` 同时扩大 SVG 宽高。这样 140% 时必须同时产生横、纵两轴溢出，而不是让父容器随 SVG 增高。`.varna-frame` 仅作包装层，不再承担第二套滚动。

`setVarnaZoom(1)` 在应用尺寸后将 `.varna-viewport` 的 `scrollLeft` 和 `scrollTop` 复位为 0。给该滚动区域合适的 `tabindex` 和可访问名称，但不为未加载 SVG 制造虚假状态。E/F 模式现有 404px 和固定尺寸覆盖保持不变。

保留 `+`、`-`、`1:1`、1–6 倍范围和现有缩放算法，不新增拖拽平移、缩略图或工具栏。

- [ ] **步骤 2：修正 390px 下的控件布局**

在现有窄屏断点内让 `.viewport-controls`、`.varna-zoom-controls` 和 Technique chips 能换行/收缩；局部 1D rail 继续在自己的 `.track-viewport` 横向滚动。仅在复现证实 `case-shell.css` 的固定 meta/search 宽度导致外层溢出时，才在 900px/720px 断点复位为 `width: auto`、`min-width: 0`。

- [ ] **步骤 3：锁定内外层高度桥接**

确认 `case-shell.js` 与 `workbench.js` 的 `ResizeObserver`/`postMessage` 协议未改，且没有给内层 frame 恢复固定 viewport 高度或内部纵向滚动。

- [ ] **步骤 4：运行测试并提交**

```bash
node --test test/case-workbench-responsive.test.js test/entry-case-embed.test.js
git add public/entry-cases/__entry_v3_site__/workbench.css \
  public/entry-cases/__entry_v3_site__/workbench.js \
  public/entry-cases/__entry_v3_site__/case-shell.css \
  test/case-workbench-responsive.test.js test/entry-case-embed.test.js
git commit -m "fix(Case): 支持 VARNA 缩放滚动与窄屏布局"
```

### 任务 4：接入 C3.2/C1.8、固定 C1.9 并生成新指纹闭包

**文件：**

- 修改：`test/entry-case-embed.test.js:263-279`
- 修改：`scripts/version-ef-entry-assets.mjs:7-49`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:1-20`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:236-253`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:865-892`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:1552-1587`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:1870-1950`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:1995-2044`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:2315-2353`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:2463-2537`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.js:2720-2726`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.css:465-485`
- 修改：`public/entry-cases/__entry_v3_site__/workbench.css:999-1060`
- 修改：`public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs:1`
- 生成：新版本闭包文件

- [ ] **步骤 1：接入反应性三状态**

让 `workbench.js` 从 pure module 导入新函数并保留 `byPosition` Map、`mappedCount`、`cap` 等下游合同；将 `whiteCount` 改为 `missingCount` 和 `nonpositiveCount`，保留 `positiveCount`。不要改变 Profile 原始数组或 P95 输入。

在每个新建的 1D rail SVG 和重着色后的 VARNA SVG 中注入局部 `<defs><pattern>`：中性灰底加低对比度斜线。只有 missing 使用 pattern；nonpositive 使用淡蓝实色；positive 使用现有色带。pattern id 在各 SVG 内稳定且不冲突，悬停/选中仍只改 stroke，missing/nonpositive 文字使用深色。

`buildMolstarTargetDisplayPayload()` 继续从 row 取十六进制 `color`：missing 中性灰、nonpositive 淡蓝、positive 现有渐变；取消选择后恢复三状态底色。通过 JS 更新现有 `.legend` 的三项文案与 swatch，并把 stats 中的 `white bases` 拆成 missing/nonpositive/positive 计数，无需重写所有 Case HTML。

- [ ] **步骤 2：接入最小 Technique 反馈**

给 `.technique-filter-status` 增加 `aria-live="polite"` 和 `aria-atomic="true"`。`refilter()` 先得到 `hitIds`，沿用现有 `applyPublicProfileSelectorVisibility()` 更新列表，再用 pure helper 根据 `hitIds.size` 和 selection 是否为空更新状态。

不得派发 Profile change、调用 `renderProfile()`、自动选择命中项、刷新页面或添加确认按钮。现有 Profile 下拉列表过滤是既有行为；本任务新增的用户可见功能只有命中反馈。

- [ ] **步骤 3：强化“不请求 RDAT”回归测试**

现有测试从“`renderProfile()` 不调用废弃热图”扩展到：初始化、Profile change、Technique refilter 均无调用；8SQ9 的 `profile_id` 可以保留 `.rdat#...`，但浏览器网络路径不得由其推导出 `/api/rmdb/rdat/` 或 `src/assets/data/...rdat` 请求。

保留未调用的历史解析/绘制函数时，测试必须证明入口不可达；不要为让测试简单而恢复面板。若清理死代码，删除范围只限 RMDB 原始热图块及其专用 CSS/状态，不能触碰 E/F heatmap。

- [ ] **步骤 4：提升闭包版本**

把版本从 `20260828-case-taxonomy-1` 提升为 `20260912-reviewer-c-1`，同步更新未版本化：

- `workbench.js` 的 technique、pure、EF shell、residue helpers import；
- `workbench.js` 的 E/F 动态脚本 URL；
- `ef-workbench-shell.mjs` 的 technique import；
- `scripts/version-ef-entry-assets.mjs` 的 `EF_ASSET_VERSION`。

旧指纹文件不删除。

- [ ] **步骤 5：用既有脚本生成闭包**

```bash
node scripts/version-ef-entry-assets.mjs public
node scripts/version-ef-entry-assets.mjs public --check
```

预期：写模式报告新增/变化文件数；check 模式输出 `version: 20260912-reviewer-c-1`、`checkedFiles: 13`、`changedFiles: 0`。若计数随脚本清单变化，以脚本输出为准并在证据中记录，不能手工复制缺失文件。

- [ ] **步骤 6：验证闭包、三区分、筛选反馈与 C1.9**

```bash
node --test test/case-workbench-pure.test.js test/case-workbench-responsive.test.js \
  test/case-workbench-ui.test.js test/entry-case-embed.test.js \
  test/download-contract.test.js
node --test test/case-public-technique-preview.test.js
git diff --check
```

预期：第一条的本批自包含测试全部通过；未版本化资产和 `20260912-reviewer-c-1` 指纹资产内容/引用闭合；无测试要求 RDAT 文件存在。第二条必须与任务 1 保存的 preview 基线逐用例比较：不得新增失败；既有 provenance/外卷 EPERM 失败可以照实记录，但不得宣称该文件全通过。

- [ ] **步骤 7：提交运行时接入与指纹闭包**

```bash
git add scripts/version-ef-entry-assets.mjs \
  public/entry-cases/__entry_v3_site__ \
  public/entry-cases/__entry_ef_site__ \
  test/entry-case-embed.test.js test/case-workbench-ui.test.js
git commit -m "build(Case): 生成评审修复静态资源闭包"
```

### 任务 5：隔离候选与浏览器验收

**文件：**

- 新建：`docs/reviewer-response/2026-09-12-c-case-evidence.md`
- 临时目录：`/tmp/foldbridge-reviewer-c-case.*`，完成后可删除，不属于生产。

- [ ] **步骤 1：创建包含完整运行时依赖闭包、8SQ9 与 10FZ 的隔离候选**

```bash
FOLDBRIDGE_CASE_CANDIDATE=$(mktemp -d /tmp/foldbridge-reviewer-c-case.XXXXXX)
mkdir -p "$FOLDBRIDGE_CASE_CANDIDATE/entry-cases/cases"
rsync -a /Volumes/tianyi/Server/public/entry-cases/cases/8SQ9/ \
  "$FOLDBRIDGE_CASE_CANDIDATE/entry-cases/cases/8SQ9/"
rsync -a /Volumes/tianyi/Server/public/entry-cases/cases/10FZ/ \
  "$FOLDBRIDGE_CASE_CANDIDATE/entry-cases/cases/10FZ/"
rsync -a public/entry-cases/__entry_v3_site__/ \
  "$FOLDBRIDGE_CASE_CANDIDATE/entry-cases/__entry_v3_site__/"
rsync -a public/entry-cases/__entry_ef_site__/ \
  "$FOLDBRIDGE_CASE_CANDIDATE/entry-cases/__entry_ef_site__/"
cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/ef-unified-main-sparse
rsync -aR \
  src/assets/generated/pdb-primary-citations/index.json \
  src/assets/header/aboutus.svg \
  src/assets/header/database.svg \
  src/assets/header/gznl2.svg \
  src/assets/header/home.svg \
  src/assets/header/research.svg \
  src/portalChrome.js \
  src/siteChrome.js \
  src/statsDashboard.js \
  "$FOLDBRIDGE_CASE_CANDIDATE/"
python3 -m http.server 8899 --directory "$FOLDBRIDGE_CASE_CANDIDATE"
```

这些 `src/` 文件是 `scripts/case-public-techniques-lib.mjs` 中 `PREVIEW_GLOBAL_FILES` 的闭包；不得只复制 `entry-cases/`，否则 `site-nav.js`、`siteChrome.js` 和 primary-citations 请求会 404，导致 `workbench.js` 模块加载失败。预期：生产目录仅被读取；8SQ9 URL 为 `http://127.0.0.1:8899/entry-cases/cases/8SQ9/index.html?chain=P`，10FZ 三状态 URL 为 `http://127.0.0.1:8899/entry-cases/cases/10FZ/index.html?chain=A`。

- [ ] **步骤 2：验证 C1.7 和 C1.8**

在 1440×900、1024×768、768×1024、390×844 下：

- 放大 VARNA 到 140% 后，在控制台记录滚动容器的 `scrollWidth > clientWidth` 且 `scrollHeight > clientHeight`；横向和纵向滚动到四个边缘，再点 `1:1`，确认 `scrollLeft === 0`、`scrollTop === 0` 且 SVG 恢复 100%；
- 点击 DMS/SHAPE 类别或方法，确认可见 Profile 选项变化并出现命中数；
- 确认当前 Profile、1D、2D、3D 都不自动切换；
- 清空条件后显示 2 个 Profile。
- 页面无整体横向滚动，1D/VARNA 只在自己的容器内滚动。

8SQ9 的当前可点选项每个都至少命中一个 Profile，不伪造正常用户流的零命中。另做受控 DOM 集成检查：清空所有条件，在 DevTools 中仅为一个无覆盖的 disabled category chip 移除 `disabled`，然后触发它已绑定的 click handler。确认真实 `refilter()` 路径产生空 `hitIds`、状态显示 `无匹配 Profile`，且当前 Profile 与 1D/2D/3D 不变。这是测试专用 DOM fixture，不写入代码或生产数据，证据中不写成当前用户可达组合。

- [ ] **步骤 3：验证 C3.2**

打开 10FZ/A，执行时先解压 profile index/shard 并重算 `data-eterna/ETERNA_R74_0000.rdat#908` 的三类计数；只有仍同时含 missing、有限 `<=0` 和正值时才用它做可视验收。核对：

- 1D/2D：缺失为灰色纹理，非正值为淡蓝，正值为白—黄—红；
- 3D：缺失为实心灰，非正值为淡蓝，正值色带一致；
- 图例和计数分别命名三类；
- 选择/悬停只改变描边或临时强调，取消后底色恢复。

- [ ] **步骤 4：验证 C1.9 网络行为**

打开浏览器 Network，勾选 Preserve log：

1. 首次打开 8SQ9/P；
2. 在两个 Profile 间切换；
3. 点击 DMS/SHAPE 筛选；
4. 刷新一次。

过滤 `rdat`、`PDB130_DMS_0000.rdat` 和 `api/rmdb`，预期 0 个网络请求；页面无 RMDB raw heatmap，无相关 404 控制台错误。Profile 文本中出现 `.rdat#13322` 不算网络请求。

- [ ] **步骤 5：运行完整测试并写证据**

```bash
git diff --check
npm test
```

用 `apply_patch` 创建证据文档，逐条记录 C1.5、C1.7、C1.8、C1.9、C3.2 的复现、修改、自动测试、视口结果、Network 0 请求和当前线上状态。未发布时明确写“候选通过，生产未替换”。

- [ ] **步骤 6：提交证据**

```bash
git add docs/reviewer-response/2026-09-12-c-case-evidence.md
git commit -m "docs(评审): 记录 Case C 类修复证据"
```

## 生产替换闸门（不在当前授权内）

到这里停止。只有用户另行明确授权后，才按手册对 `/Volumes/tianyi/Server/public`：记录目标哈希与回滚目录、在同目录创建临时文件、只原子替换已批准的未版本化资产并新增完整指纹闭包，然后验收 127.0.0.1:8888 GET、公共 GET、OPTIONS、真实 SPA iframe 和 Network 0 RDAT 请求。不得重建全量 Case 树，不得删除旧指纹，不得重启 cloudflared。
