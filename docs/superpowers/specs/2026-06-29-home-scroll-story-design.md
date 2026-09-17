# 主页招牌滚动叙事（Home Scroll Story）设计

- **日期**：2026-06-29
- **仓库**：`~/docs/foldbridge`（vanilla-JS 静态站）
- **状态**：设计待审查
- **主角案例**：1OB5（tRNA-Phe，RMDB 来源，三态数据完整）

## 1. 背景与目标

FoldBridge 发布前的 UI/UX 完善工作中，本规格只聚焦**一个子项目**：主页的招牌滚动叙事区。其余完善项（统一壳贯穿全站、深层页返回/面包屑、滚动进度条、自我介绍区 About/Contact/Cite、probing 卡片画廊化、2026 趋势点缀）各自留到后续独立的规格→计划→实现周期，**不在本规格范围内**。

**目标**：在主页新增一个"电影式"招牌区，用一个真实案例讲清楚 FoldBridge 在做什么——**同一套反应强度颜色，从 1D 比对、到 2D 二级结构、再到 3D 三级结构，连续贯穿三态**。机制借鉴 Apple 产品页：左侧主体钉住不动，用户下滑时右侧场景逐段渐入，左侧可视化随之逐级变形（1D→2D→3D）。

**成功标准**：
- 访客在主页下滑即可看到 tRNA 的探针信号如何"长进"结构，无需任何点击。
- 反应强度颜色在三态中视觉上连续一致（同一色标）。
- 纯加法：现有主页模块与全站其余页面零回归，现有 222 个测试保持全绿。
- 首屏快：主页不加载 WebGL / 不拉取大表，三态用预渲染快照 + 轻量 1D 数据。

## 2. 非目标（YAGNI）

- 不做主页内的实时 3D 交互（molstar 旋转）。想真交互的访客顺 CTA 进 case 详情页。
- 不做全自动快照构建脚本。主角单一、变更低频，采用一次性手动策展 + 文档化重生成流程。
- 不做滚动中途自动切换案例。轮换只决定"本次加载哪个主角"。
- 不改导师锁定的顶部模板（黑栏 + FB logo + bundle 切换 pill + 主导航 + 搜索）。
- 不触碰现有 hero 卡片、probing 轮播、模块卡片、页脚。

## 3. 主角案例与数据真实性

主角 = **1OB5（tRNA-Phe）**，RMDB 来源，单链 F。选它因为它是 RMDB 案例中三态数据本地完整的经典 tRNA：

| 态 | 数据来源（已核对 atlas case 资产） | 状态 |
|----|----|----|
| 1D 反应性 | `visualPreview.reactivity1d`（48 点） | ✅ 完整 |
| 2D 二级结构 | `visualPreview.pairArcs`（2 弧）+ `structureColoring`（48 着色点） | ✅ 完整 |
| 3D 三级结构 | 本地 `CONFIDENCE/10_structure_context/.../1ob5.cif` | ✅ 本地有 |

**重要说明（数据诚实）**：
- RASP 来源案例（含早期候选 3A3A）的 2D/3D 在 FoldBridge 本地是 blocked 的（`RASP_PUBLIC_2D/3D_*_NOT_MATERIALIZED_BLOCKER`），因此**主角必须用 RMDB 来源**。
- RMDB tRNA 的 confidence tier 多为 `A_REFERENCE`（参考态，非 STRONG）。招牌叙事讲的是"探针信号→结构的连续性"，不依赖 STRONG tier，A_REFERENCE 数据真实完整即可支撑叙事。
- 反应性、配对态、坐标均来自真实 atlas 资产；**不得伪造任何数据点**。预渲染的 2D/3D 快照必须由真实 1OB5 几何 + 真实反应性着色生成。

## 4. 架构与定位

招牌区是主页的**独立加法模块**，插入位置（主页垂直顺序）：

```
[锁定头：黑栏 + FB logo + bundle pill + 主导航 + 搜索]   ← 导师模板，不动
[现有 hero 卡片 bundle-hero-card]                        ← 不动
★ [新增：招牌滚动叙事区 home-scroll-story]               ← 本规格
[现有 probing 轮播 home-probing-carousel]                ← 不动
[现有模块卡片 bundle-site-grid]                          ← 不动
[页脚]                                                   ← 不动
```

沿用 probing 轮播（`renderHomeProbingCarousel`）已验证的模式：纯渲染函数（可 `node --test`）+ main.js 幂等行为层，职责隔离。

## 5. 组件边界（三单元）

### 单元 1 · 数据与快照资产
目录：`src/assets/generated/home-scroll-story/`（生成产物入 git，与 probing-articles 约定一致）。

- `story.json`：策展案例数组。每个案例含：
  - `pdb_id`、`chain`、`molecule_label`、`source_family`（RMDB）、`confidence_label`
  - `sequence`：碱基串
  - `reactivity`：与序列等长的反应性数值数组（来自真实 `reactivity1d`）
  - `paired_state`：与序列等长的配对态数组（paired/unpaired，来自真实 2D 数据）
  - `svg_2d`：该案例 2D 快照文件名
  - `png_3d`：该案例 3D 快照文件名
  - `scenes`：三段场景文案（1D/2D/3D 各一段标题+正文）
- `<pdb>-2d.svg`：VARNA 离线导出的二级结构（反应性着色），矢量。
- `<pdb>-3d.png`：molstar 离线截图的三级结构（反应性着色），1～2 个代表角度。
- `README.md`：记录"如何重生成"（方案 A 文档化流程：VARNA/molstar 离线渲染步骤 + 反应性着色参数 + 数据来源路径）。

起步策展集：**先以主角 1OB5（tRNA-Phe）单案例交付完整闭环**（其三态数据已逐一核对存在）。候选扩充 **2D6F / 9DPB（tRNA-Lys3，2D pairArcs 更丰富，12 弧）** 待各自三态资产实际核对后再补入 `story.json` 数组。`pickFeaturedCase` 对单元素数组即可正常工作，因此轮换功能不阻塞首次交付。

### 单元 2 · 纯渲染函数（放 `src/siteChrome.js`，与 `renderHomeProbingCarousel` 并列）
- `renderHomeScrollStory(story)`：入参 story（单个主角案例数据）→ 返回整个招牌区 HTML 字符串（左侧三态层容器 + 右侧三场景 + 反应性图例）。无 DOM、无定时器、无 window。
- `renderReactivityAlignment(caseData)`：入参序列 + 反应性 → 返回带色碱基格 HTML（1D 态）。拆出以便单独测着色。
- `pickFeaturedCase(cases, visitIndex)`：纯函数，按访问次序确定性选一个案例。
- 空输入 / 资产缺失 → 返回 placeholder 壳（与轮播 `[]` 返回 placeholder 一致）。

着色（**单一权威，三态必须共用同一组参数**）：reactivity→color 色标（低 0=冷绿 `#174B3A` → 中 0.5=金 `#E6C260` → 高 1=暖橙 `#E8743E`）。计划阶段先确认站内是否已有反应性色标 token：若有，以该 token 为唯一权威，并据此设置 VARNA/molstar 离线着色参数；若无，以本规格上述十六进制为准。无论哪种，1D 实时着色（JS）与 2D/3D 离线快照（VARNA/molstar）必须取自同一来源，避免三态色标漂移——"三态颜色连续一致"是核心成功标准。该唯一来源须记入 §7 的 `README.md`。着色常量放 siteChrome 以便单测。

### 单元 3 · 行为层（`src/main.js`）
- `initHomeScrollStory()`：建 IntersectionObserver，下滑时切换左侧 active 态层 + 右侧 active 场景。**幂等**——重建前先 disconnect 旧 observer（同轮播 `setInterval` 必须先 clear 的坑，observer 同理）。
- 挂载守卫加 `route==='home'`（与轮播 `loadProbingArticleIndex` 的 home 守卫一致）。
- visitIndex 读写 localStorage，传给 `pickFeaturedCase`。

**接口契约**：main.js 调 `renderHomeScrollStory(pickFeaturedCase(cases, idx))` 拿 HTML 插进主页容器，再调 `initHomeScrollStory()` 绑行为。渲染层不知 observer 存在，行为层不拼 HTML——两边独立改、独立测。

## 6. 数据流

```
story.json (build 产物, 真实数据)
   │  loadHomeScrollStory() 异步读取（同 probing index 模式）
   ▼
pickFeaturedCase(cases, visitIndex)  →  单个主角案例
   ▼
renderHomeScrollStory(caseData)  →  HTML 字符串
   ├─ 左侧: 态0 renderReactivityAlignment(序列+反应性)
   ├─ 左侧: 态1 内嵌 <img>/<object> 引用 <pdb>-2d.svg
   ├─ 左侧: 态2 内嵌 <img> 引用 <pdb>-3d.png
   └─ 右侧: 三场景文案 (scenes)
   ▼
插入主页容器 → initHomeScrollStory() 绑 IntersectionObserver
   ▼
用户下滑 → observer 切换 active 态层 + active 场景
```

## 7. 资产生成（方案 A：一次性手动策展 + 文档化）

- 1D：无需图片，由 `renderReactivityAlignment` 从 story.json 数据实时生成带色碱基格。
- 2D：人工用仓库 `tools/varna/` 离线跑案例 dot-bracket + 反应性着色 → 导出 SVG → 提交。
- 3D：人工用 molstar 离线加载 `<pdb>.cif` + 反应性着色 → 截 PNG → 提交。
- 全过程写进 `home-scroll-story/README.md`，换案例时照文档手动重跑。

不做全自动构建脚本（YAGNI：单主角、低频变更）。

## 8. 错误处理与降级（主页永不崩）

- `story.json` 或某案例 SVG/PNG 缺失 → `renderHomeScrollStory` 返回 placeholder 壳；主页其余模块照常渲染（纯加法担保）。
- IntersectionObserver 不触发 / JS 禁用 → 降级为静态堆叠：三场景按文档顺序全部可见、各带快照，不钉住但内容可读。
- `prefers-reduced-motion` → 关闭 fade/scale 过渡，直接切态（无障碍）。
- 单张快照加载失败 → 显示 alt 文字 + 色块占位，不空白整个面板。
- 轮换 visitIndex 读 localStorage 失败（隐私模式）→ 退回 index 0，不报错。

## 9. 测试策略（沿用 probing 轮播约定）

`node --test`（无 jsdom），断言 HTML 字符串：
- `renderHomeScrollStory(story)`：含 3 场景 + 3 态层 + 图例；态0 含碱基格、态1 引用 svg_2d、态2 引用 png_3d。
- `renderReactivityAlignment`：碱基格数量等于反应性数组长度；每格带色。
- 着色函数：色标边界值 0 / 0.5 / 1 的输出。
- `pickFeaturedCase`：确定性、按 visitIndex 轮换、空数组 → null。
- 空/缺输入 → placeholder 壳（`doesNotMatch` 无 active 态层）。
- 行为层 observer 不可 node 测（与现有限制一致）→ 本地预览服务手动验证滚动联动。
- 回归：现有全套测试保持全绿。

## 10. 验收清单

- [ ] 主页下滑可见 1D→2D→3D 三态随滚动切换，颜色连续一致。
- [ ] 左侧钉住、右侧渐入机制在桌面浏览器正常。
- [ ] 顶部锁定模板零改动。
- [ ] 现有主页模块与全站其余页面零回归。
- [ ] `node --test` 全绿（含新增纯函数测试）。
- [ ] 降级路径（缺资产/无 JS/reduced-motion）经手动验证不崩。
- [ ] 三态快照由真实 1OB5 数据生成，无伪造数据点。
- [ ] `README.md` 记录重生成流程。
